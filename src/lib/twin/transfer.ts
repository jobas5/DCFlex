import { evaluateGuardrails, flowFromSetpoints, predict } from "./surrogate";
import type { GuardrailViolation, Prediction, Setpoints } from "./types";

export interface TransferContext {
  itLoadMw: number;
  wetBulbC: number;
  dryBulbC: number;
  setpoints: Setpoints;
  waterBudgetLpm: number;
  powerBudgetMw: number;
}

export interface ZoneProposal {
  setpoints: Setpoints;
  prediction: Prediction;
  feasible: boolean;
  violations: GuardrailViolation[];
  withinBudget: boolean;
}

export interface TransferProposal {
  waterDeltaLpm: number;
  powerDeltaMw: number;
  source: ZoneProposal;
  target: ZoneProposal;
  feasible: boolean;
  violations: GuardrailViolation[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function pumpForFlow(targetFlow: number, setpoints: Setpoints): number {
  let lo = 40;
  let hi = 100;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (flowFromSetpoints({ ...setpoints, pumpSpeedPct: mid }) < targetFlow) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function supplyForChiller(
  targetChillerMw: number,
  ctx: { itLoadMw: number; wetBulbC: number; dryBulbC: number },
  setpoints: Setpoints,
): number {
  let lo = 16;
  let hi = 34;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const supply = clamp(mid, 16, 34);
    const cdu = Math.min(34, Math.round((supply + 2) * 10) / 10);
    const p = predict(ctx, { ...setpoints, coolantSupplyC: supply, cduSetpointC: cdu });
    if (p.chillerPowerMw > targetChillerMw) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

function score(ctx: TransferContext): ZoneProposal {
  const prediction = predict(
    { itLoadMw: ctx.itLoadMw, wetBulbC: ctx.wetBulbC, dryBulbC: ctx.dryBulbC },
    ctx.setpoints,
  );
  const g = evaluateGuardrails(prediction);
  const withinBudget =
    prediction.flowLpm <= ctx.waterBudgetLpm && prediction.accessoryPowerMw <= ctx.powerBudgetMw;
  return { setpoints: ctx.setpoints, prediction, feasible: g.feasible, violations: g.violations, withinBudget };
}

/**
 * Reallocates cooling effort between two zones: the target zone gains water
 * flow (via pump speed) and/or chiller power (via colder supply temp), the
 * source zone gives up the same amount. Clamped so the source never drops
 * below guardrail floors or its own budget.
 *
 * ponytail: transfers reallocate by setpoint inversion on the monotonic
 * surrogate; a coupled hydraulic/chiller budget solver is out of scope until
 * real hardware topology exists.
 */
export function proposeTransfer(
  target: TransferContext,
  source: TransferContext,
  waterDeltaLpm = 0,
  powerDeltaMw = 0,
): TransferProposal {
  const targetBase = predict(
    { itLoadMw: target.itLoadMw, wetBulbC: target.wetBulbC, dryBulbC: target.dryBulbC },
    target.setpoints,
  );
  const sourceBase = predict(
    { itLoadMw: source.itLoadMw, wetBulbC: source.wetBulbC, dryBulbC: source.dryBulbC },
    source.setpoints,
  );

  // --- Water: pump speed on both zones ---
  const targetFlow = clamp(targetBase.flowLpm + waterDeltaLpm, 400, target.waterBudgetLpm);
  const sourceFlow = clamp(sourceBase.flowLpm - waterDeltaLpm, 400, source.waterBudgetLpm);
  const targetPump = pumpForFlow(targetFlow, target.setpoints);
  const sourcePump = pumpForFlow(sourceFlow, source.setpoints);

  // --- Power: supply temp (chiller) on both zones ---
  const targetChiller = clamp(targetBase.chillerPowerMw + powerDeltaMw, 0.01, 5);
  const sourceChiller = clamp(sourceBase.chillerPowerMw - powerDeltaMw, 0.01, 5);
  const targetSupply = round1(supplyForChiller(targetChiller, target, target.setpoints));
  const sourceSupply = round1(supplyForChiller(sourceChiller, source, source.setpoints));

  const targetSetpoints: Setpoints = {
    ...target.setpoints,
    coolantSupplyC: targetSupply,
    pumpSpeedPct: Math.round(clamp(targetPump, 40, 100)),
    cduSetpointC: Math.min(34, Math.round((targetSupply + 2) * 10) / 10),
  };
  const sourceSetpoints: Setpoints = {
    ...source.setpoints,
    coolantSupplyC: sourceSupply,
    pumpSpeedPct: Math.round(clamp(sourcePump, 40, 100)),
    cduSetpointC: Math.min(34, Math.round((sourceSupply + 2) * 10) / 10),
  };

  const targetProposal = score({ ...target, setpoints: targetSetpoints });
  const sourceProposal = score({ ...source, setpoints: sourceSetpoints });

  const violations: GuardrailViolation[] = [
    ...targetProposal.violations,
    ...sourceProposal.violations,
  ];
  const feasible = targetProposal.feasible && sourceProposal.feasible;

  return {
    waterDeltaLpm: Math.round((sourceBase.flowLpm - sourceProposal.prediction.flowLpm) * 10) / 10,
    powerDeltaMw: Math.round((sourceBase.chillerPowerMw - sourceProposal.prediction.chillerPowerMw) * 1000) / 1000,
    source: sourceProposal,
    target: targetProposal,
    feasible,
    violations,
  };
}
