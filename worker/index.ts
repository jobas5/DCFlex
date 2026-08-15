import { desc, eq, lt } from "drizzle-orm";
import { getDb, type CloudflareDatabaseEnv } from "../src/db/client";
import {
  controlActions,
  facilityConfig,
  modelMetrics,
  powerTransfers,
  shadowSamples,
  telemetrySamples,
  whatifCandidates,
  whatifRuns,
  zones,
} from "../src/db/schema";
import { driftSeries, MODEL_CARD } from "../src/lib/twin/modelMeta";
import { runWhatIf, type WhatIfRequest } from "../src/lib/twin/optimizer";
import { tickTelemetry } from "../src/lib/twin/simulator";
import { forecastZone } from "../src/lib/twin/forecast";
import {
  applySlewLimits,
  evaluateGuardrails,
  factorySetpoints,
  predict,
} from "../src/lib/twin/surrogate";
import { proposeTransfer, type TransferContext } from "../src/lib/twin/transfer";
import {
  clearSessionCookieHeader,
  clientIp,
  createSession,
  delay,
  getSessionToken,
  loginRateLimited,
  readSession,
  sessionCookieHeader,
  verifyPassword,
} from "./auth";
import { evaluateAlerts } from "./telegram";
import {
  FACTORY_SETPOINTS,
  SLEW_LIMITS,
  zoneStatus,
  type ControlAction,
  type FacilityView,
  type ForecastHorizon,
  type Setpoints,
  type Telemetry,
  type WhatIfCandidate,
  type ZoneForecast,
  type ZoneSpec,
  type ZoneView,
} from "../src/lib/twin/types";

type Env = CloudflareDatabaseEnv;

const WATCHDOG_TIMEOUT_SEC = 90;

const DEFAULT_ZONES = [
  { id: 1, name: "Zone A", baseLoadMw: 5.5, loadAmpMw: 2.0, loadPhaseH: 9, wetBulbOffsetC: 0, targetPue: 1.11, targetWue: 0.115, waterBudgetLpm: 1400, powerBudgetMw: 1.2 },
  { id: 2, name: "Zone B", baseLoadMw: 4.0, loadAmpMw: 1.5, loadPhaseH: 13, wetBulbOffsetC: 1, targetPue: 1.12, targetWue: 0.12, waterBudgetLpm: 1100, powerBudgetMw: 0.95 },
  { id: 3, name: "Zone C", baseLoadMw: 3.0, loadAmpMw: 1.0, loadPhaseH: 17, wetBulbOffsetC: 2, targetPue: 1.13, targetWue: 0.125, waterBudgetLpm: 900, powerBudgetMw: 0.75 },
  { id: 4, name: "Zone D", baseLoadMw: 2.5, loadAmpMw: 0.8, loadPhaseH: 21, wetBulbOffsetC: -1, targetPue: 1.135, targetWue: 0.13, waterBudgetLpm: 750, powerBudgetMw: 0.6 },
];

const json = (data: unknown, status = 200) => Response.json(data, { status });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p;

async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

const parseSetpoints = (raw: string): Setpoints => {
  try {
    return { ...FACTORY_SETPOINTS, ...(JSON.parse(raw) as Partial<Setpoints>) };
  } catch {
    return factorySetpoints();
  }
};

const zoneSpec = (z: (typeof zones.$inferSelect)): ZoneSpec => ({
  baseLoadMw: z.baseLoadMw,
  loadAmpMw: z.loadAmpMw,
  loadPhaseH: z.loadPhaseH,
  wetBulbOffsetC: z.wetBulbOffsetC,
});

async function listZones(env: Env) {
  const db = getDb(env);
  const existing = await db.select().from(zones);
  for (const z of DEFAULT_ZONES) {
    if (!existing.some((e) => e.id === z.id)) {
      await db.insert(zones).values({
        id: z.id,
        name: z.name,
        baseLoadMw: z.baseLoadMw,
        loadAmpMw: z.loadAmpMw,
        loadPhaseH: z.loadPhaseH,
        wetBulbOffsetC: z.wetBulbOffsetC,
        targetPue: z.targetPue,
        targetWue: z.targetWue,
        waterBudgetLpm: z.waterBudgetLpm,
        powerBudgetMw: z.powerBudgetMw,
        currentSetpoints: JSON.stringify(FACTORY_SETPOINTS),
      });
    }
  }
  return db.select().from(zones).orderBy(zones.id);
}

async function getFacility(env: Env) {
  const db = getDb(env);
  const rows = await db.select().from(facilityConfig).where(eq(facilityConfig.id, 1));
  if (rows.length) return rows[0];
  await db.insert(facilityConfig).values({ id: 1, totalWaterBudgetLpm: 4400, totalPowerBudgetMw: 3.6 });
  const created = await db.select().from(facilityConfig).where(eq(facilityConfig.id, 1));
  return created[0];
}

type ZoneRow = (typeof zones.$inferSelect);

async function latestTelemetryForZone(env: Env, zone: ZoneRow): Promise<Telemetry> {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(telemetrySamples)
    .where(eq(telemetrySamples.clusterId, zone.id))
    .orderBy(desc(telemetrySamples.tick))
    .limit(1);
  if (rows.length) return JSON.parse(rows[0].payload) as Telemetry;
  const { telemetry } = tickTelemetry(null, 1000, parseSetpoints(zone.currentSetpoints), zoneSpec(zone));
  return telemetry;
}

async function getMaxTick(env: Env): Promise<number> {
  const db = getDb(env);
  const rows = await db
    .select({ tick: telemetrySamples.tick })
    .from(telemetrySamples)
    .orderBy(desc(telemetrySamples.tick))
    .limit(1);
  return rows[0]?.tick ?? 999;
}

function buildZoneView(zone: ZoneRow, telemetry: Telemetry, setpoints = parseSetpoints(zone.currentSetpoints)): ZoneView {
  const prediction = predict(telemetry, setpoints);
  const guardrails = evaluateGuardrails(prediction);
  const margin = prediction.thermalMarginC;
  return {
    id: zone.id,
    name: zone.name,
    mode: zone.mode,
    status: zoneStatus(margin),
    telemetry,
    prediction,
    guardrails,
    setpoints,
    targets: { pue: zone.targetPue, wue: zone.targetWue },
    budgets: { waterLpm: zone.waterBudgetLpm, powerMw: zone.powerBudgetMw },
    budgetUsage: {
      waterPct: round((prediction.flowLpm / zone.waterBudgetLpm) * 100, 1),
      powerPct: round((prediction.accessoryPowerMw / zone.powerBudgetMw) * 100, 1),
    },
    margin,
    forecast: forecastZone(zoneSpec(zone), telemetry, setpoints),
  };
}

function facilityForecast(views: ZoneView[]): ZoneForecast {
  const horizons: ForecastHorizon[] = ["15m", "1h", "4h", "24h"];
  const out = {} as ZoneForecast;
  for (const h of horizons) {
    out[h] = {
      peakChipTempC: Math.max(...views.map((v) => v.forecast[h].peakChipTempC)),
      peakAtTicks: Math.min(...views.map((v) => v.forecast[h].peakAtTicks)),
      worstMargin: Math.min(...views.map((v) => v.forecast[h].worstMargin)),
      rising: views.some((v) => v.forecast[h].rising),
    };
  }
  return out;
}

function buildFacility(views: ZoneView[], facility: (typeof facilityConfig.$inferSelect)): FacilityView {
  const itLoad = views.reduce((s, v) => s + v.telemetry.itLoadMw, 0);
  const accessory = views.reduce((s, v) => s + v.prediction.accessoryPowerMw, 0);
  const water = views.reduce((s, v) => s + v.prediction.flowLpm, 0);
  const pue = itLoad ? (itLoad + accessory) / itLoad : 1;
  const wue = itLoad
    ? views.reduce((s, v) => s + v.prediction.wue * v.telemetry.itLoadMw, 0) / itLoad
    : 0;
  const margin = Math.min(...views.map((v) => v.margin));
  return {
    itLoadMw: round(itLoad, 2),
    accessoryPowerMw: round(accessory, 3),
    pue: round(pue, 4),
    wue: round(wue, 3),
    status: zoneStatus(margin),
    margin: round(margin, 1),
    waterLpm: Math.round(water),
    budgets: { waterLpm: facility.totalWaterBudgetLpm, powerMw: facility.totalPowerBudgetMw },
    budgetUsage: {
      waterPct: round((water / facility.totalWaterBudgetLpm) * 100, 1),
      powerPct: round((accessory / facility.totalPowerBudgetMw) * 100, 1),
    },
    forecast: facilityForecast(views),
  };
}

/**
 * Target-gap controller: PUE/WUE gap from a zone's target sets the α/β
 * weights, the what-if grid finds optimal setpoints, slew limits apply.
 *
 * ponytail: 1,560-grid per closed_loop zone per tick; drop to a 1-step nudge
 * if worker latency matters.
 */
async function steerZone(env: Env, zone: ZoneRow, telemetry: Telemetry): Promise<Setpoints> {
  const db = getDb(env);
  const current = parseSetpoints(zone.currentSetpoints);
  if (zone.mode !== "closed_loop") return current;
  const prediction = predict(telemetry, current);
  const alpha = clamp(0.15 + (prediction.pue - zone.targetPue) * 8, 0, 1);
  const beta = clamp(0.15 + (prediction.wue - zone.targetWue) * 8, 0, 1);
  const result = runWhatIf({
    alpha,
    beta,
    itLoadMw: telemetry.itLoadMw,
    wetBulbC: telemetry.wetBulbC,
    baseSetpoints: current,
  });
  const best = result.candidates.find(
    (c) =>
      c.feasible &&
      c.accessoryPowerMw <= zone.powerBudgetMw &&
      c.flowLpm <= zone.waterBudgetLpm,
  );
  if (!best) return current;
  const { setpoints: clamped, limited } = applySlewLimits(current, best.setpoints);
  await db
    .update(zones)
    .set({
      currentSetpoints: JSON.stringify(clamped),
      slewLimited: limited ? 1 : 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(zones.id, zone.id));
  await db.insert(controlActions).values({
    clusterId: zone.id,
    mode: zone.mode,
    kind: "applied",
    setpoints: JSON.stringify(clamped),
    note: `Target-gap steer: PUE ${prediction.pue.toFixed(4)} → target ${zone.targetPue.toFixed(3)}`,
  });
  return clamped;
}

function toCtx(zone: ZoneRow, telemetry: Telemetry): TransferContext {
  return {
    itLoadMw: telemetry.itLoadMw,
    wetBulbC: telemetry.wetBulbC,
    dryBulbC: telemetry.dryBulbC,
    setpoints: parseSetpoints(zone.currentSetpoints),
    waterBudgetLpm: zone.waterBudgetLpm,
    powerBudgetMw: zone.powerBudgetMw,
  };
}

async function detectFailSafe(
  env: Env,
  zone: ZoneRow,
  now: Date,
): Promise<{ failSafe: boolean; heartbeatAgeSec: number | null }> {
  const db = getDb(env);
  const heartbeatAgeSec = zone.lastHeartbeat
    ? Math.floor((now.getTime() - new Date(zone.lastHeartbeat).getTime()) / 1000)
    : null;
  const failSafe = heartbeatAgeSec !== null && heartbeatAgeSec > WATCHDOG_TIMEOUT_SEC;
  if (failSafe && zone.failSafeActive !== 1) {
    await db
      .update(zones)
      .set({ failSafeActive: 1, commsOk: 0, updatedAt: now.toISOString() })
      .where(eq(zones.id, zone.id));
    await db.insert(controlActions).values({
      clusterId: zone.id,
      mode: zone.mode,
      kind: "fail_safe",
      setpoints: JSON.stringify(FACTORY_SETPOINTS),
      note: `Watchdog: heartbeat lost >${WATCHDOG_TIMEOUT_SEC}s — reverted to factory setpoints`,
    });
  }
  return { failSafe, heartbeatAgeSec };
}

async function controlSnapshot(env: Env) {
  const db = getDb(env);
  const now = new Date();
  const allZones = await listZones(env);
  const states = await Promise.all(
    allZones.map(async (z) => {
      const { failSafe, heartbeatAgeSec } = await detectFailSafe(env, z, now);
      const current = parseSetpoints(z.currentSetpoints);
      return {
        id: z.id,
        name: z.name,
        mode: z.mode,
        commsOk: z.commsOk === 1 && !failSafe,
        failSafeActive: failSafe,
        slewLimited: z.slewLimited === 1,
        lastHeartbeat: z.lastHeartbeat,
        heartbeatAgeSec,
        watchdogTimeoutSec: WATCHDOG_TIMEOUT_SEC,
        currentSetpoints: current,
        shadowSetpoints: z.shadowSetpoints ? parseSetpoints(z.shadowSetpoints) : null,
        effectiveSetpoints: failSafe ? factorySetpoints() : current,
        factorySetpoints: FACTORY_SETPOINTS,
        slewLimits: SLEW_LIMITS,
        targets: { pue: z.targetPue, wue: z.targetWue },
        budgets: { waterLpm: z.waterBudgetLpm, powerMw: z.powerBudgetMw },
        updatedAt: z.updatedAt,
      };
    }),
  );
  const actions = await db.select().from(controlActions).orderBy(desc(controlActions.id)).limit(50);
  return {
    zones: states,
    actions: actions.map(
      (a): ControlAction => ({
        id: a.id,
        clusterId: a.clusterId,
        createdAt: a.createdAt,
        mode: a.mode,
        kind: a.kind as ControlAction["kind"],
        setpoints: parseSetpoints(a.setpoints),
        note: a.note,
      }),
    ),
  };
}

function shadowSampleRow(zone: ZoneRow, telemetry: Telemetry, shadowSetpoints: Setpoints, tick: number) {
  const sp = predict(telemetry, shadowSetpoints);
  const actual = predict(telemetry, parseSetpoints(zone.currentSetpoints));
  const sg = evaluateGuardrails(sp);
  const budgetOk = sp.flowLpm <= zone.waterBudgetLpm && sp.accessoryPowerMw <= zone.powerBudgetMw;
  const meetsTarget = Math.abs(sp.pue - zone.targetPue) <= 0.02 && Math.abs(sp.wue - zone.targetWue) <= 0.02;
  return {
    clusterId: zone.id,
    tick,
    setpoints: JSON.stringify(shadowSetpoints),
    predictedPue: sp.pue,
    predictedWue: sp.wue,
    actualPue: actual.pue,
    actualWue: actual.wue,
    chipTempC: sp.chipTempC,
    feasible: sg.feasible ? 1 : 0,
    budgetOk: budgetOk ? 1 : 0,
    meetsTarget: meetsTarget ? 1 : 0,
  };
}

async function advanceSimulation(env: Env) {
  const db = getDb(env);
  const allZones = await listZones(env);
  const nextTick = (await getMaxTick(env)) + 1;
  const now = new Date();
  const nowIso = now.toISOString();
  const views: ZoneView[] = [];
  const failSafe: Record<number, boolean> = {};
  for (const z of allZones) {
    const fs = await detectFailSafe(env, z, now);
    failSafe[z.id] = fs.failSafe;
    const prev = await latestTelemetryForZone(env, z);
    const steered = await steerZone(env, z, prev);
    const { telemetry } = tickTelemetry(prev, nextTick, steered, zoneSpec(z));
    const prediction = predict(telemetry, steered);
    await db.insert(telemetrySamples).values({
      clusterId: z.id,
      tick: nextTick,
      payload: JSON.stringify(telemetry),
      pue: prediction.pue,
      wue: prediction.wue,
    });
    if (z.shadowSetpoints) {
      await db.insert(shadowSamples).values(shadowSampleRow(z, telemetry, parseSetpoints(z.shadowSetpoints), nextTick));
    }
    views.push(buildZoneView(z, telemetry, steered));
  }
  await evaluateAlerts(env, nextTick, views, failSafe, WATCHDOG_TIMEOUT_SEC);
  // Feed the watchdog so it doesn't fail-safe while idle.
  await db
    .update(zones)
    .set({ lastHeartbeat: nowIso, commsOk: 1, failSafeActive: 0 })
    .where(eq(zones.id, zones.id));
  await db
    .delete(telemetrySamples)
    .where(lt(telemetrySamples.tick, nextTick - 1008));
  await db
    .delete(shadowSamples)
    .where(lt(shadowSamples.tick, nextTick - 1008));
  const facility = await getFacility(env);
  return { aggregate: buildFacility(views, facility), zones: views };
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const db = getDb(env);

  if (path === "/api/health" && method === "GET") {
    return json({ ok: true, service: "dcflex" });
  }

  // --- Auth ----------------------------------------------------------------
  if (path === "/api/auth/login" && method === "POST") {
    const ip = clientIp(request);
    if (loginRateLimited(ip)) {
      await delay(500);
      return json({ error: "Too many attempts. Try again in a minute." }, 429);
    }
    const body = await readBody<{ username?: string; password?: string }>(request);
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      return json({ error: "Username and password are required." }, 400);
    }
    const okUser = env.AUTH_USERNAME ? body.username === env.AUTH_USERNAME : false;
    const okPass = await verifyPassword(env, body.password);
    if (!okUser || !okPass) {
      await delay(400);
      return json({ error: "Invalid username or password." }, 401);
    }
    const token = await createSession(env);
    if (!token) return json({ error: "Auth is not configured." }, 500);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": sessionCookieHeader(token, request) },
    });
  }

  if (path === "/api/auth/logout" && method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": clearSessionCookieHeader() },
    });
  }

  if (path === "/api/auth/me" && method === "GET") {
    const token = getSessionToken(request);
    if (token && (await readSession(env, token))) return json({ ok: true });
    return json({ error: "Unauthorized." }, 401);
  }

  // --- Telemetry -----------------------------------------------------------
  if (path === "/api/telemetry/current" && method === "GET") {
    const allZones = await listZones(env);
    const views = await Promise.all(
      allZones.map(async (z) => buildZoneView(z, await latestTelemetryForZone(env, z))),
    );
    const facility = await getFacility(env);
    return json({ aggregate: buildFacility(views, facility), zones: views });
  }

  if (path === "/api/telemetry/tick" && method === "POST") {
    return json(await advanceSimulation(env));
  }

  if (path === "/api/telemetry/history" && method === "GET") {
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 96);
    const clusterParam = url.searchParams.get("clusterId");
    if (clusterParam) {
      const id = Number(clusterParam);
      const rows = await db
        .select()
        .from(telemetrySamples)
        .where(eq(telemetrySamples.clusterId, id))
        .orderBy(desc(telemetrySamples.tick))
        .limit(limit);
      return json({
        history: rows.reverse().map((r) => {
          const p = JSON.parse(r.payload) as Telemetry;
          return {
            tick: r.tick,
            timestamp: p.timestamp,
            pue: r.pue,
            wue: r.wue,
            gpuDieC: p.gpuDieC,
            cpuDieC: p.cpuDieC,
            itLoadMw: p.itLoadMw,
            accessoryPowerMw: round(p.itLoadMw * (r.pue - 1), 3),
          };
        }),
      });
    }
    // Facility aggregate: load-weighted PUE/WUE, worst die temps per tick.
    const rows = await db
      .select()
      .from(telemetrySamples)
      .orderBy(desc(telemetrySamples.tick))
      .limit(limit * 4);
    const byTick = new Map<number, { itLoad: number; accessory: number; pueSum: number; wueSum: number; maxGpu: number; maxCpu: number; ts: string }>();
    for (const r of rows) {
      const p = JSON.parse(r.payload) as Telemetry;
      const g = byTick.get(r.tick) ?? { itLoad: 0, accessory: 0, pueSum: 0, wueSum: 0, maxGpu: 0, maxCpu: 0, ts: p.timestamp };
      g.itLoad += p.itLoadMw;
      g.accessory += p.itLoadMw * (r.pue - 1);
      g.pueSum += r.pue * p.itLoadMw;
      g.wueSum += r.wue * p.itLoadMw;
      g.maxGpu = Math.max(g.maxGpu, p.gpuDieC);
      g.maxCpu = Math.max(g.maxCpu, p.cpuDieC);
      byTick.set(r.tick, g);
    }
    const history = [...byTick.keys()]
      .sort((a, b) => a - b)
      .map((t) => {
        const g = byTick.get(t)!;
        return {
          tick: t,
          timestamp: g.ts,
          pue: g.pueSum / g.itLoad,
          wue: g.wueSum / g.itLoad,
          gpuDieC: g.maxGpu,
          cpuDieC: g.maxCpu,
          itLoadMw: round(g.itLoad, 2),
          accessoryPowerMw: round(g.accessory, 3),
        };
      });
    return json({ history });
  }

  // --- What-If counterfactual engine ----------------------------------------
  if (path === "/api/whatif" && method === "POST") {
    const body = await readBody<WhatIfRequest & { zoneId?: number }>(request);
    if (!body || typeof body.alpha !== "number" || typeof body.beta !== "number") {
      return json({ error: "alpha and beta weights are required." }, 400);
    }
    const alpha = Math.min(1, Math.max(0, body.alpha));
    const beta = Math.min(1, Math.max(0, body.beta));

    // Per-zone run: live telemetry as context defaults, zone setpoints as base.
    let zone: ZoneRow | undefined;
    if (body.zoneId != null) {
      const allZones = await listZones(env);
      zone = allZones.find((z) => z.id === body.zoneId);
      if (!zone) return json({ error: "Zone not found." }, 404);
    }
    const telemetry = zone ? await latestTelemetryForZone(env, zone) : null;
    const result = runWhatIf({
      alpha,
      beta,
      baseSetpoints: zone ? parseSetpoints(zone.currentSetpoints) : body.baseSetpoints,
      itLoadMw: body.itLoadMw ?? telemetry?.itLoadMw,
      wetBulbC: body.wetBulbC ?? telemetry?.wetBulbC,
    });
    const best = result.best;

    const inserted = await db
      .insert(whatifRuns)
      .values({
        zoneId: zone ? zone.id : null,
        alpha,
        beta,
        baseSetpoints: JSON.stringify(zone ? parseSetpoints(zone.currentSetpoints) : (body.baseSetpoints ?? FACTORY_SETPOINTS)),
        bestSetpoints: best ? JSON.stringify(best.setpoints) : null,
        bestCost: best ? best.cost : null,
        bestPue: best ? best.pue : null,
        bestWue: best ? best.wue : null,
        candidatesEvaluated: result.evaluated,
        feasibleCount: result.feasibleCount,
        status: best ? "completed" : "no_feasible",
      })
      .returning({ id: whatifRuns.id });
    const runId = inserted[0].id;

    const top = result.candidates.slice(0, 25);
    for (const c of top) {
      await db.insert(whatifCandidates).values({
        runId,
        setpoints: JSON.stringify(c.setpoints),
        pue: c.pue,
        wue: c.wue,
        cost: c.feasible ? c.cost : null,
        chipTempC: c.chipTempC,
        feasible: c.feasible ? 1 : 0,
        violations: JSON.stringify(c.violations),
      });
    }

    return json({
      runId,
      zoneId: zone ? zone.id : null,
      alpha,
      beta,
      evaluated: result.evaluated,
      feasibleCount: result.feasibleCount,
      best,
      candidates: top,
    });
  }

  if (path === "/api/whatif" && method === "GET") {
    const rows = await db.select().from(whatifRuns).orderBy(desc(whatifRuns.id)).limit(20);
    return json({
      runs: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        zoneId: r.zoneId,
        alpha: r.alpha,
        beta: r.beta,
        bestPue: r.bestPue,
        bestWue: r.bestWue,
        bestCost: r.bestCost,
        candidatesEvaluated: r.candidatesEvaluated,
        feasibleCount: r.feasibleCount,
        status: r.status,
      })),
    });
  }

  const whatifMatch = path.match(/^\/api\/whatif\/(\d+)$/);
  if (whatifMatch && method === "GET") {
    const id = Number(whatifMatch[1]);
    const runs = await db.select().from(whatifRuns).where(eq(whatifRuns.id, id));
    if (!runs.length) return json({ error: "What-if run not found." }, 404);
    const r = runs[0];
    const rows = await db
      .select()
      .from(whatifCandidates)
      .where(eq(whatifCandidates.runId, id));
    const candidates: WhatIfCandidate[] = rows.map((c) => ({
      setpoints: parseSetpoints(c.setpoints),
      pue: c.pue,
      wue: c.wue,
      cost: c.cost ?? Number.POSITIVE_INFINITY,
      chipTempC: c.chipTempC,
      deltaPKpa: 0,
      flowLpm: 0,
      accessoryPowerMw: 0,
      feasible: c.feasible === 1,
      violations: JSON.parse(c.violations) as WhatIfCandidate["violations"],
    }));
    candidates.sort((a, b) => {
      if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
      return a.cost - b.cost;
    });
    const best = candidates.find((c) => c.feasible) ?? null;
    return json({
      runId: r.id,
      createdAt: r.createdAt,
      zoneId: r.zoneId,
      alpha: r.alpha,
      beta: r.beta,
      baseSetpoints: parseSetpoints(r.baseSetpoints),
      evaluated: r.candidatesEvaluated,
      feasibleCount: r.feasibleCount,
      status: r.status,
      best,
      candidates,
    });
  }

  // --- Zones master data ---------------------------------------------------
  if (path === "/api/zones" && method === "GET") {
    const allZones = await listZones(env);
    return json({
      zones: allZones.map((z) => ({
        id: z.id,
        name: z.name,
        targetPue: z.targetPue,
        targetWue: z.targetWue,
        waterBudgetLpm: z.waterBudgetLpm,
        powerBudgetMw: z.powerBudgetMw,
        mode: z.mode,
      })),
    });
  }

  const zonePatchMatch = path.match(/^\/api\/zones\/(\d+)$/);
  if (zonePatchMatch && method === "PATCH") {
    const id = Number(zonePatchMatch[1]);
    const body = await readBody<{
      name?: string;
      targetPue?: number;
      targetWue?: number;
      waterBudgetLpm?: number;
      powerBudgetMw?: number;
    }>(request);
    if (!body) return json({ error: "body required." }, 400);
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.targetPue === "number") patch.targetPue = body.targetPue;
    if (typeof body.targetWue === "number") patch.targetWue = body.targetWue;
    if (typeof body.waterBudgetLpm === "number") patch.waterBudgetLpm = body.waterBudgetLpm;
    if (typeof body.powerBudgetMw === "number") patch.powerBudgetMw = body.powerBudgetMw;
    await db.update(zones).set(patch).where(eq(zones.id, id));
    return json({ ok: true });
  }

  if (path === "/api/facility" && method === "GET") {
    return json(await getFacility(env));
  }

  if (path === "/api/facility" && method === "PATCH") {
    const body = await readBody<{ totalWaterBudgetLpm?: number; totalPowerBudgetMw?: number }>(request);
    if (!body) return json({ error: "body required." }, 400);
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (typeof body.totalWaterBudgetLpm === "number") patch.totalWaterBudgetLpm = body.totalWaterBudgetLpm;
    if (typeof body.totalPowerBudgetMw === "number") patch.totalPowerBudgetMw = body.totalPowerBudgetMw;
    await db.update(facilityConfig).set(patch).where(eq(facilityConfig.id, 1));
    return json({ ok: true });
  }

  // --- Shadow validation ----------------------------------------------------
  if (path === "/api/control/applyShadow" && method === "POST") {
    const body = await readBody<{ clusterId?: number; setpoints?: Setpoints }>(request);
    if (!body?.clusterId || !body.setpoints) {
      return json({ error: "clusterId and setpoints are required." }, 400);
    }
    const allZones = await listZones(env);
    const zone = allZones.find((z) => z.id === body.clusterId);
    if (!zone) return json({ error: "Zone not found." }, 404);
    const telemetry = await latestTelemetryForZone(env, zone);
    const prediction = predict(telemetry, body.setpoints);
    const guard = evaluateGuardrails(prediction);
    if (!guard.feasible) {
      return json(
        { error: "Requested setpoints violate hard guardrails.", violations: guard.violations },
        422,
      );
    }
    if (prediction.flowLpm > zone.waterBudgetLpm || prediction.accessoryPowerMw > zone.powerBudgetMw) {
      return json({ error: "Requested setpoints exceed the zone's water/power budget." }, 422);
    }
    await db
      .update(zones)
      .set({ shadowSetpoints: JSON.stringify(body.setpoints), updatedAt: new Date().toISOString() })
      .where(eq(zones.id, zone.id));
    // Fresh validation run: clear old samples and log an immediate sample + action.
    await db.delete(shadowSamples).where(eq(shadowSamples.clusterId, zone.id));
    await db.insert(shadowSamples).values(shadowSampleRow(zone, telemetry, body.setpoints, telemetry.tick));
    await db.insert(controlActions).values({
      clusterId: zone.id,
      mode: zone.mode,
      kind: "would_be",
      setpoints: JSON.stringify(body.setpoints),
      note: "Shadow config set",
    });
    return json({ ok: true, shadowSetpoints: body.setpoints });
  }

  const validationMatch = path.match(/^\/api\/zones\/(\d+)\/validation$/);
  if (validationMatch && method === "GET") {
    const id = Number(validationMatch[1]);
    const allZones = await listZones(env);
    const zone = allZones.find((z) => z.id === id);
    if (!zone) return json({ error: "Zone not found." }, 404);
    const rows = await db
      .select()
      .from(shadowSamples)
      .where(eq(shadowSamples.clusterId, id))
      .orderBy(desc(shadowSamples.id))
      .limit(1008);
    const total = rows.length;
    const feasible = rows.filter((r) => r.feasible === 1).length;
    const budgetOk = rows.filter((r) => r.budgetOk === 1).length;
    const meets = rows.filter((r) => r.meetsTarget === 1).length;
    const avgPueGap = total
      ? rows.reduce((s, r) => s + Math.max(0, r.predictedPue - zone.targetPue), 0) / total
      : 0;
    const feasibleRate = total ? feasible / total : 0;
    const meetsRate = total ? meets / total : 0;
    return json({
      zoneId: id,
      hasShadowConfig: zone.shadowSetpoints != null,
      shadowSetpoints: zone.shadowSetpoints ? parseSetpoints(zone.shadowSetpoints) : null,
      total,
      feasible,
      budgetOk,
      meets,
      feasibleRate: round(feasibleRate, 3),
      meetsRate: round(meetsRate, 3),
      avgPueGap: round(avgPueGap, 4),
      ready: feasibleRate >= 0.95 && meetsRate >= 0.9,
      samples: rows
        .slice()
        .reverse()
        .map((r) => ({
          tick: r.tick,
          predictedPue: r.predictedPue,
          predictedWue: r.predictedWue,
          actualPue: r.actualPue,
          actualWue: r.actualWue,
          chipTempC: r.chipTempC,
          feasible: r.feasible === 1,
          budgetOk: r.budgetOk === 1,
          meetsTarget: r.meetsTarget === 1,
        })),
    });
  }

  // --- Control loop (per zone) ----------------------------------------------
  if (path === "/api/control" && method === "GET") {
    return json(await controlSnapshot(env));
  }

  if (path === "/api/control/mode" && method === "POST") {
    const body = await readBody<{ clusterId?: number; mode?: string }>(request);
    if (!body?.clusterId) return json({ error: "clusterId is required." }, 400);
    if (body.mode !== "shadow" && body.mode !== "closed_loop") {
      return json({ error: "mode must be 'shadow' or 'closed_loop'." }, 400);
    }
    const allZones = await listZones(env);
    const zone = allZones.find((z) => z.id === body.clusterId);
    if (!zone) return json({ error: "Zone not found." }, 404);
    // Flip to closed-loop: apply the validated shadow config (if any) as the starting real config.
    if (body.mode === "closed_loop" && zone.shadowSetpoints) {
      await db
        .update(zones)
        .set({
          mode: body.mode,
          currentSetpoints: zone.shadowSetpoints,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(zones.id, body.clusterId));
      await db.insert(controlActions).values({
        clusterId: body.clusterId,
        mode: body.mode,
        kind: "applied",
        setpoints: zone.shadowSetpoints,
        note: "Closed-loop enabled — validated shadow config applied",
      });
    } else {
      await db
        .update(zones)
        .set({ mode: body.mode, updatedAt: new Date().toISOString() })
        .where(eq(zones.id, body.clusterId));
    }
    return json(await controlSnapshot(env));
  }

  if (path === "/api/control/apply" && method === "POST") {
    const body = await readBody<{ clusterId?: number; setpoints?: Setpoints; note?: string }>(request);
    if (!body?.clusterId || !body.setpoints) {
      return json({ error: "clusterId and setpoints are required." }, 400);
    }
    const allZones = await listZones(env);
    const zone = allZones.find((z) => z.id === body.clusterId);
    if (!zone) return json({ error: "Zone not found." }, 404);
    const current = parseSetpoints(zone.currentSetpoints);
    const { setpoints: clamped, limited } = applySlewLimits(current, body.setpoints);
    const telemetry = await latestTelemetryForZone(env, zone);
    const guard = evaluateGuardrails(predict(telemetry, clamped));
    if (!guard.feasible) {
      return json(
        { error: "Requested setpoints violate hard guardrails.", violations: guard.violations },
        422,
      );
    }
    const kind = zone.mode === "closed_loop" ? "applied" : "would_be";
    await db
      .update(zones)
      .set({
        currentSetpoints: JSON.stringify(clamped),
        slewLimited: limited ? 1 : 0,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(zones.id, zone.id));
    await db.insert(controlActions).values({
      clusterId: zone.id,
      mode: zone.mode,
      kind,
      setpoints: JSON.stringify(clamped),
      note:
        body.note ??
        (limited
          ? "Setpoints applied with slew-rate limiting (jump clamped)"
          : zone.mode === "closed_loop"
            ? "Setpoints written to CDU/BMS controllers"
            : "Shadow mode: would-be action logged, no writeback"),
    });
    return json({ ok: true, applied: clamped, slewLimited: limited, kind });
  }

  if (path === "/api/control/heartbeat" && method === "POST") {
    const now = new Date().toISOString();
    await db
      .update(zones)
      .set({ lastHeartbeat: now, commsOk: 1, failSafeActive: 0 })
      .where(eq(zones.id, zones.id));
    return json({ ok: true });
  }

  // --- Transfers -----------------------------------------------------------
  if (path === "/api/transfers" && method === "POST") {
    const body = await readBody<{
      sourceId?: number;
      targetId?: number;
      waterDeltaLpm?: number;
      powerDeltaMw?: number;
    }>(request);
    if (!body?.sourceId || !body.targetId) {
      return json({ error: "sourceId and targetId are required." }, 400);
    }
    const allZones = await listZones(env);
    const source = allZones.find((z) => z.id === body.sourceId);
    const target = allZones.find((z) => z.id === body.targetId);
    if (!source || !target) return json({ error: "Zone not found." }, 404);

    const sourceTelemetry = await latestTelemetryForZone(env, source);
    const targetTelemetry = await latestTelemetryForZone(env, target);
    const proposal = proposeTransfer(
      toCtx(target, targetTelemetry),
      toCtx(source, sourceTelemetry),
      body.waterDeltaLpm ?? 0,
      body.powerDeltaMw ?? 0,
    );

    // Facility budget check against the other zones' current draw.
    const facility = await getFacility(env);
    let totalFlow = proposal.target.prediction.flowLpm + proposal.source.prediction.flowLpm;
    let totalPower = proposal.target.prediction.accessoryPowerMw + proposal.source.prediction.accessoryPowerMw;
    for (const z of allZones) {
      if (z.id === source.id || z.id === target.id) continue;
      const t = await latestTelemetryForZone(env, z);
      const p = predict(t, parseSetpoints(z.currentSetpoints));
      totalFlow += p.flowLpm;
      totalPower += p.accessoryPowerMw;
    }
    const withinFacility =
      totalFlow <= facility.totalWaterBudgetLpm && totalPower <= facility.totalPowerBudgetMw;

    const outcome = JSON.stringify({
      source: { pue: proposal.source.prediction.pue, wue: proposal.source.prediction.wue, flowLpm: proposal.source.prediction.flowLpm, accessoryPowerMw: proposal.source.prediction.accessoryPowerMw, chipTempC: proposal.source.prediction.chipTempC },
      target: { pue: proposal.target.prediction.pue, wue: proposal.target.prediction.wue, flowLpm: proposal.target.prediction.flowLpm, accessoryPowerMw: proposal.target.prediction.accessoryPowerMw, chipTempC: proposal.target.prediction.chipTempC },
      withinFacility,
    });
    const inserted = await db
      .insert(powerTransfers)
      .values({
        sourceId: source.id,
        targetId: target.id,
        waterDeltaLpm: proposal.waterDeltaLpm,
        powerDeltaMw: proposal.powerDeltaMw,
        sourceSetpoints: JSON.stringify(proposal.source.setpoints),
        targetSetpoints: JSON.stringify(proposal.target.setpoints),
        outcome,
        status: "shadow",
      })
      .returning({ id: powerTransfers.id });

    return json({
      id: inserted[0].id,
      status: "shadow",
      feasible: proposal.feasible,
      withinFacility,
      violations: proposal.violations,
      source: proposal.source,
      target: proposal.target,
    });
  }

  if (path === "/api/transfers" && method === "GET") {
    const rows = await db.select().from(powerTransfers).orderBy(desc(powerTransfers.id)).limit(50);
    return json({ transfers: rows });
  }

  const transferMatch = path.match(/^\/api\/transfers\/(\d+)\/(virtual|verify|apply|reject)$/);
  if (transferMatch && method === "POST") {
    const id = Number(transferMatch[1]);
    const action = transferMatch[2];
    const rows = await db.select().from(powerTransfers).where(eq(powerTransfers.id, id));
    if (!rows.length) return json({ error: "Transfer not found." }, 404);
    const t = rows[0];

    if (action === "apply") {
      const allZones = await listZones(env);
      const target = allZones.find((z) => z.id === t.targetId);
      const source = allZones.find((z) => z.id === t.sourceId);
      if (target && source) {
        await db
          .update(zones)
          .set({
            currentSetpoints: t.targetSetpoints,
            waterBudgetLpm: round(Math.max(0, target.waterBudgetLpm + t.waterDeltaLpm), 1),
            powerBudgetMw: round(Math.max(0, target.powerBudgetMw + t.powerDeltaMw), 3),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(zones.id, t.targetId));
        await db
          .update(zones)
          .set({
            currentSetpoints: t.sourceSetpoints,
            waterBudgetLpm: round(Math.max(0, source.waterBudgetLpm - t.waterDeltaLpm), 1),
            powerBudgetMw: round(Math.max(0, source.powerBudgetMw - t.powerDeltaMw), 3),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(zones.id, t.sourceId));
        await db.insert(controlActions).values({
          clusterId: target.id,
          mode: target.mode,
          kind: target.mode === "closed_loop" ? "applied" : "would_be",
          setpoints: t.targetSetpoints,
          note: `Cooling transfer #${id} from ${source.name} (+${t.waterDeltaLpm} L/min, +${t.powerDeltaMw} MW)`,
        });
        await db.insert(controlActions).values({
          clusterId: source.id,
          mode: source.mode,
          kind: source.mode === "closed_loop" ? "applied" : "would_be",
          setpoints: t.sourceSetpoints,
          note: `Cooling transfer #${id} to ${target.name} (−${t.waterDeltaLpm} L/min, −${t.powerDeltaMw} MW)`,
        });
      }
    }
    await db
      .update(powerTransfers)
      .set({ status: action })
      .where(eq(powerTransfers.id, id));
    return json({ ok: true, status: action });
  }

  // --- Model metrics ---------------------------------------------------------
  if (path === "/api/model/metrics" && method === "GET") {
    const rows = await db
      .select()
      .from(modelMetrics)
      .orderBy(desc(modelMetrics.id))
      .limit(1);
    const latest = rows[0] ?? {
      maeMw: MODEL_CARD.current.maeMw,
      pueCoverage: MODEL_CARD.current.pueCoveragePct,
      klDivergence: 0.047,
      inferenceLatencyMs: MODEL_CARD.current.inferenceLatencyMs,
      createdAt: MODEL_CARD.current.lastTrained,
    };
    return json({ latest, card: MODEL_CARD, drift: driftSeries() });
  }

  // --- Self-check ------------------------------------------------------------
  if (path === "/api/_check" && method === "GET") {
    const issues: string[] = [];
    const allZones = await listZones(env);
    if (allZones.length !== DEFAULT_ZONES.length) {
      issues.push(`expected ${DEFAULT_ZONES.length} zones, got ${allZones.length}`);
    }
    const source = allZones[0];
    const target = allZones[1];
    if (source && target) {
      const sT = await latestTelemetryForZone(env, source);
      const tT = await latestTelemetryForZone(env, target);
      const proposal = proposeTransfer(toCtx(target, tT), toCtx(source, sT), 100, 0.1);
      if (!proposal.source.feasible) issues.push("source proposal infeasible");
      if (!proposal.target.feasible) issues.push("target proposal infeasible");
      if (proposal.source.prediction.flowLpm < 399 || proposal.source.prediction.flowLpm > 1750) {
        issues.push("source flow out of guardrail bounds");
      }
      if (!proposal.source.withinBudget) issues.push("source proposal exceeds its own budget");
    }
    if (issues.length) return json({ ok: false, issues }, 500);
    return json({ ok: true });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const path = url.pathname;
      const method = request.method;
      const isPublic =
        (path === "/api/health" && method === "GET") ||
        path === "/api/auth/login" ||
        path === "/api/auth/logout" ||
        path === "/api/auth/me";
      if (!isPublic) {
        const token = getSessionToken(request);
        if (!token || !(await readSession(env, token))) {
          return json({ error: "Unauthorized." }, 401);
        }
      }
      try {
        return await handleApi(request, env);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Internal error." }, 500);
      }
    }
    return new Response(null, { status: 404 });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(advanceSimulation(env));
  },
} satisfies ExportedHandler<Env>;
