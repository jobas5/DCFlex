import { evaluateGuardrails, predict } from "./surrogate";
import type { Setpoints, Telemetry, WhatIfCandidate } from "./types";

export interface WhatIfRequest {
  alpha: number;
  beta: number;
  baseSetpoints?: Setpoints;
  itLoadMw?: number;
  wetBulbC?: number;
}

export interface WhatIfResult {
  candidates: WhatIfCandidate[];
  best: WhatIfCandidate | null;
  evaluated: number;
  feasibleCount: number;
}

const range = (lo: number, hi: number, step: number): number[] => {
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v * 10) / 10);
  return out;
};

/**
 * Counterfactual grid search over setpoint permutations with hard guardrails.
 * Objective: minimize J = α·PUE + β·WUE (each term min-max normalized across
 * the feasible envelope so the weights stay comparable).
 */
export function runWhatIf(request: WhatIfRequest): WhatIfResult {
  const alpha = Math.max(0, request.alpha);
  const beta = Math.max(0, request.beta);
  const context: Pick<Telemetry, "itLoadMw" | "wetBulbC" | "dryBulbC"> = {
    itLoadMw: request.itLoadMw ?? 6.4,
    wetBulbC: request.wetBulbC ?? 18,
    dryBulbC: (request.wetBulbC ?? 18) + 6,
  };

  const supplies = range(18, 32, 1);
  const pumps = range(40, 100, 5);
  const valves = range(30, 100, 10);

  const candidates: WhatIfCandidate[] = [];
  for (const coolantSupplyC of supplies) {
    for (const pumpSpeedPct of pumps) {
      for (const valvePosPct of valves) {
        const setpoints: Setpoints = {
          coolantSupplyC,
          pumpSpeedPct,
          valvePosPct,
          cduSetpointC: Math.min(34, Math.round((coolantSupplyC + 2) * 10) / 10),
        };
        const p = predict(context, setpoints);
        const g = evaluateGuardrails(p);
        candidates.push({
          setpoints,
          pue: p.pue,
          wue: p.wue,
          cost: 0,
          chipTempC: p.chipTempC,
          deltaPKpa: p.deltaPKpa,
          flowLpm: p.flowLpm,
          accessoryPowerMw: p.accessoryPowerMw,
          feasible: g.feasible,
          violations: g.violations,
        });
      }
    }
  }

  const feasible = candidates.filter((c) => c.feasible);
  const pues = feasible.map((c) => c.pue);
  const wues = feasible.map((c) => c.wue);
  const norm = (v: number, arr: number[]) => {
    const lo = Math.min(...arr);
    const hi = Math.max(...arr);
    return hi - lo < 1e-9 ? 0.5 : (v - lo) / (hi - lo);
  };

  const weightSum = alpha + beta || 1;
  for (const c of candidates) {
    c.cost = c.feasible
      ? Math.round(((alpha * norm(c.pue, pues) + beta * norm(c.wue, wues)) / weightSum) * 10000) / 10000
      : Number.POSITIVE_INFINITY;
  }

  const ranked = [...candidates].sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    return a.cost - b.cost;
  });

  return {
    candidates: ranked,
    best: feasible.length ? ranked[0] : null,
    evaluated: candidates.length,
    feasibleCount: feasible.length,
  };
}
