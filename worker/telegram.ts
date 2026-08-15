import { eq, inArray } from "drizzle-orm";
import { getDb, type CloudflareDatabaseEnv } from "../src/db/client";
import { alertEvents } from "../src/db/schema";
import { GUARDRAILS } from "../src/lib/twin/types";
import type { ForecastHorizon, GuardrailViolation, ZoneView } from "../src/lib/twin/types";
import { alertTransition } from "./alertLogic";

const TELEGRAM_API = "https://api.telegram.org";

const GUARDRAIL_CODES: GuardrailViolation["code"][] = [
  "CHIP_TEMP",
  "DELTA_P_LOW",
  "DELTA_P_HIGH",
  "FLOW_LOW",
  "FLOW_HIGH",
];

const HORIZONS: ForecastHorizon[] = ["15m", "1h", "4h", "24h"];

export async function sendTelegram(env: CloudflareDatabaseEnv, text: string): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false; // alerts are opt-in
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function dashboardUrl(env: CloudflareDatabaseEnv, path = "/") {
  return env.DASHBOARD_URL ? `${env.DASHBOARD_URL}${path}` : null;
}

function worstForecast(z: ZoneView): { state: "red" | "amber" | "ok"; text?: string } {
  for (const h of HORIZONS) {
    const m = z.forecast[h].worstMargin;
    if (m < 3) {
      return {
        state: "red",
        text: `🔥 ${z.name} heat forecast — act now: peaks ${z.forecast[h].peakChipTempC.toFixed(0)}°C in ${h} (margin ${m.toFixed(1)}°C)`,
      };
    }
  }
  for (const h of HORIZONS) {
    const m = z.forecast[h].worstMargin;
    if (m >= 3 && m < 5) {
      return {
        state: "amber",
        text: `☀️ ${z.name} heat rising — plan cooling: peak ${z.forecast[h].peakChipTempC.toFixed(0)}°C in ${h} (margin ${m.toFixed(1)}°C)`,
      };
    }
  }
  return { state: "ok" };
}

interface AlertState {
  key: string;
  state: string;
  text?: string;
}

/**
 * Edge-triggered alerts: each monitored condition has a stable key whose
 * state is upserted per tick. A message is sent only on a state change, so a
 * sustained condition doesn't re-alert every 60s, and a recovered condition
 * is cleared so re-entry alerts again.
 */
export async function evaluateAlerts(
  env: CloudflareDatabaseEnv,
  tick: number,
  views: ZoneView[],
  failSafe: Record<number, boolean>,
  watchdogTimeoutSec: number,
): Promise<void> {
  const states: AlertState[] = [];

  for (const z of views) {
    // Thermal margin status (green → yellow/red transition).
    const marginState = z.status === "green" ? "ok" : z.status;
    states.push({
      key: `zone:${z.id}:margin`,
      state: marginState,
      text:
        marginState === "red"
          ? `🚨 ${z.name} THERMAL MARGIN RED — ${z.margin.toFixed(1)}°C from the ${GUARDRAILS.chipTempMaxC}°C limit`
          : marginState === "yellow"
            ? `⚠️ ${z.name} thermal margin yellow — ${z.margin.toFixed(1)}°C from the ${GUARDRAILS.chipTempMaxC}°C limit`
            : undefined,
    });

    // Heat forecast (worst horizon severity).
    const f = worstForecast(z);
    states.push({ key: `zone:${z.id}:forecast`, state: f.state, text: f.text });

    // Hard guardrail violations, one key per rule.
    for (const code of GUARDRAIL_CODES) {
      const v = z.guardrails.violations.find((x) => x.code === code);
      states.push({
        key: `zone:${z.id}:guardrail:${code}`,
        state: v ? code : "ok",
        text: v ? `⚠️ ${z.name} GUARDRAIL — ${v.message}` : undefined,
      });
    }

    // Watchdog fail-safe (armed by detectFailSafe before the tick's heartbeat refresh).
    states.push({
      key: `zone:${z.id}:fail_safe`,
      state: failSafe[z.id] ? "active" : "ok",
      text: failSafe[z.id]
        ? `🚨 ${z.name} FAIL-SAFE — heartbeat lost >${watchdogTimeoutSec}s, reverted to factory setpoints`
        : undefined,
    });
  }

  const keys = [...new Set(states.map((s) => s.key))];
  const existing = await getDb(env)
    .select()
    .from(alertEvents)
    .where(inArray(alertEvents.alertKey, keys));
  const byKey = new Map(existing.map((r) => [r.alertKey, r.state]));
  const now = new Date().toISOString();
  const db = getDb(env);
  const url = dashboardUrl(env, "/");

  for (const s of states) {
    const action = alertTransition(byKey.get(s.key), s.state);
    if (action === "noop" || action === "skip") continue;
    if (action === "clear") {
      await db.delete(alertEvents).where(eq(alertEvents.alertKey, s.key));
      continue;
    }
    await db
      .insert(alertEvents)
      .values({ alertKey: s.key, state: s.state, lastTick: tick, lastSentAt: now })
      .onConflictDoUpdate({
        target: alertEvents.alertKey,
        set: { state: s.state, lastTick: tick, lastSentAt: now },
      });
    await sendTelegram(env, s.text + (url ? `\n${url}` : ""));
  }
}
