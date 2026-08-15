import { desc, eq, sql } from "drizzle-orm";
import { getDb, type CloudflareDatabaseEnv } from "../src/db/client";
import {
  controlActions,
  controlState,
  modelMetrics,
  telemetrySamples,
  whatifCandidates,
  whatifRuns,
} from "../src/db/schema";
import { driftSeries, MODEL_CARD } from "../src/lib/twin/modelMeta";
import { runWhatIf, type WhatIfRequest } from "../src/lib/twin/optimizer";
import { tickTelemetry } from "../src/lib/twin/simulator";
import {
  applySlewLimits,
  evaluateGuardrails,
  factorySetpoints,
  predict,
} from "../src/lib/twin/surrogate";
import {
  FACTORY_SETPOINTS,
  SLEW_LIMITS,
  type ControlAction,
  type Setpoints,
  type Telemetry,
  type WhatIfCandidate,
} from "../src/lib/twin/types";

interface Env extends CloudflareDatabaseEnv {}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status });

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

async function getControlRow(env: Env) {
  const db = getDb(env);
  const rows = await db.select().from(controlState).where(eq(controlState.id, 1));
  if (rows.length) return rows[0];
  await db.insert(controlState).values({
    id: 1,
    mode: "shadow",
    commsOk: 1,
    failSafeActive: 0,
    slewLimited: 0,
    currentSetpoints: JSON.stringify(FACTORY_SETPOINTS),
    lastHeartbeat: new Date().toISOString(),
  });
  const created = await db.select().from(controlState).where(eq(controlState.id, 1));
  return created[0];
}

const WATCHDOG_TIMEOUT_SEC = 30;

async function controlSnapshot(env: Env) {
  const db = getDb(env);
  let row = await getControlRow(env);
  const now = new Date();
  const heartbeatAgeSec = row.lastHeartbeat
    ? Math.floor((now.getTime() - new Date(row.lastHeartbeat).getTime()) / 1000)
    : null;
  const failSafe = heartbeatAgeSec !== null && heartbeatAgeSec > WATCHDOG_TIMEOUT_SEC;

  if (failSafe && row.failSafeActive !== 1) {
    // Watchdog trip: revert to factory setpoints, log once.
    await db
      .update(controlState)
      .set({ failSafeActive: 1, commsOk: 0, updatedAt: now.toISOString() })
      .where(eq(controlState.id, 1));
    await db.insert(controlActions).values({
      mode: row.mode,
      kind: "fail_safe",
      setpoints: JSON.stringify(FACTORY_SETPOINTS),
      note: `Watchdog: heartbeat lost for >${WATCHDOG_TIMEOUT_SEC}s — reverted to factory setpoints`,
    });
    row = await getControlRow(env);
  }

  const current = parseSetpoints(row.currentSetpoints);
  const actions = await db
    .select()
    .from(controlActions)
    .orderBy(desc(controlActions.id))
    .limit(30);

  return {
    state: {
      mode: row.mode as "shadow" | "closed_loop",
      commsOk: row.commsOk === 1 && !failSafe,
      failSafeActive: failSafe,
      slewLimited: row.slewLimited === 1,
      lastHeartbeat: row.lastHeartbeat,
      heartbeatAgeSec,
      watchdogTimeoutSec: WATCHDOG_TIMEOUT_SEC,
      currentSetpoints: current,
      effectiveSetpoints: failSafe ? factorySetpoints() : current,
      factorySetpoints: FACTORY_SETPOINTS,
      slewLimits: SLEW_LIMITS,
      updatedAt: row.updatedAt,
    },
    actions: actions.map(
      (a): ControlAction => ({
        id: a.id,
        createdAt: a.createdAt,
        mode: a.mode,
        kind: a.kind as ControlAction["kind"],
        setpoints: parseSetpoints(a.setpoints),
        note: a.note,
      }),
    ),
  };
}

async function latestTelemetry(env: Env): Promise<{ telemetry: Telemetry; setpoints: Setpoints }> {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(telemetrySamples)
    .orderBy(desc(telemetrySamples.tick))
    .limit(1);
  const ctrl = await getControlRow(env);
  const setpoints = parseSetpoints(ctrl.currentSetpoints);
  if (rows.length) {
    return { telemetry: JSON.parse(rows[0].payload) as Telemetry, setpoints };
  }
  const { telemetry } = tickTelemetry(null, 1000, setpoints);
  return { telemetry, setpoints };
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const db = getDb(env);

  if (path === "/api/health" && method === "GET") {
    return json({ ok: true, service: "dc-cooling-optimizer" });
  }

  // --- Telemetry -----------------------------------------------------------
  if (path === "/api/telemetry/current" && method === "GET") {
    const { telemetry, setpoints } = await latestTelemetry(env);
    const prediction = predict(telemetry, setpoints);
    const guardrails = evaluateGuardrails(prediction);
    return json({ telemetry, setpoints, prediction, guardrails });
  }

  if (path === "/api/telemetry/tick" && method === "POST") {
    const { telemetry: prev, setpoints } = await latestTelemetry(env);
    const nextTick = prev.tick + 1;
    const { telemetry, quality } = tickTelemetry(prev, nextTick, setpoints);
    const prediction = predict(telemetry, setpoints);
    const guardrails = evaluateGuardrails(prediction);
    await db.insert(telemetrySamples).values({
      tick: nextTick,
      payload: JSON.stringify(telemetry),
      pue: prediction.pue,
      wue: prediction.wue,
    });
    // Keep the table bounded.
    await db
      .delete(telemetrySamples)
      .where(sql`${telemetrySamples.tick} < ${nextTick - 200}`);
    return json({ telemetry, setpoints, prediction, guardrails, quality });
  }

  if (path === "/api/telemetry/history" && method === "GET") {
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 96);
    const rows = await db
      .select()
      .from(telemetrySamples)
      .orderBy(desc(telemetrySamples.tick))
      .limit(limit);
    const history = rows
      .map((r) => ({
        ...(JSON.parse(r.payload) as Telemetry),
        pue: r.pue,
        wue: r.wue,
      }))
      .reverse();
    return json({ history });
  }

  // --- What-If counterfactual engine ---------------------------------------
  if (path === "/api/whatif" && method === "POST") {
    const body = await readBody<WhatIfRequest>(request);
    if (!body || typeof body.alpha !== "number" || typeof body.beta !== "number") {
      return json({ error: "alpha and beta weights are required." }, 400);
    }
    const alpha = Math.min(1, Math.max(0, body.alpha));
    const beta = Math.min(1, Math.max(0, body.beta));
    const result = runWhatIf({ ...body, alpha, beta });
    const best = result.best;

    const inserted = await db
      .insert(whatifRuns)
      .values({
        alpha,
        beta,
        baseSetpoints: JSON.stringify(body.baseSetpoints ?? FACTORY_SETPOINTS),
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

    // Persist top 25 ranked candidates (keeps writes bounded).
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

  // --- Closed-loop control ---------------------------------------------------
  if (path === "/api/control" && method === "GET") {
    return json(await controlSnapshot(env));
  }

  if (path === "/api/control/mode" && method === "POST") {
    const body = await readBody<{ mode?: string }>(request);
    if (body?.mode !== "shadow" && body?.mode !== "closed_loop") {
      return json({ error: "mode must be 'shadow' or 'closed_loop'." }, 400);
    }
    await db
      .update(controlState)
      .set({ mode: body.mode, updatedAt: new Date().toISOString() })
      .where(eq(controlState.id, 1));
    return json(await controlSnapshot(env));
  }

  if (path === "/api/control/apply" && method === "POST") {
    const body = await readBody<{ setpoints?: Setpoints; note?: string }>(request);
    if (!body?.setpoints) return json({ error: "setpoints are required." }, 400);
    const ctrl = await getControlRow(env);
    const current = parseSetpoints(ctrl.currentSetpoints);
    const { setpoints: clamped, limited } = applySlewLimits(current, body.setpoints);

    const guard = evaluateGuardrails(
      predict({ itLoadMw: 6.4, wetBulbC: 18, dryBulbC: 24 }, clamped),
    );
    if (!guard.feasible) {
      return json(
        { error: "Requested setpoints violate hard guardrails.", violations: guard.violations },
        422,
      );
    }

    const kind = ctrl.mode === "closed_loop" ? "applied" : "would_be";
    await db
      .update(controlState)
      .set({
        currentSetpoints: JSON.stringify(clamped),
        slewLimited: limited ? 1 : 0,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(controlState.id, 1));
    await db.insert(controlActions).values({
      mode: ctrl.mode,
      kind,
      setpoints: JSON.stringify(clamped),
      note:
        body.note ??
        (limited
          ? "Setpoints applied with slew-rate limiting (jump clamped)"
          : ctrl.mode === "closed_loop"
            ? "Setpoints written to CDU/BMS controllers"
            : "Shadow mode: would-be action logged, no writeback"),
    });
    const snapshot = await controlSnapshot(env);
    snapshot.state.slewLimited = limited;
    return json({ ...snapshot, applied: clamped, slewLimited: limited, kind });
  }

  if (path === "/api/control/heartbeat" && method === "POST") {
    await db
      .update(controlState)
      .set({
        lastHeartbeat: new Date().toISOString(),
        commsOk: 1,
        failSafeActive: 0,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(controlState.id, 1));
    return json({ ok: true });
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

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : "Internal error." },
          500,
        );
      }
    }
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
