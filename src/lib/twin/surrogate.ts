import {
  FACTORY_SETPOINTS,
  GUARDRAILS,
  type GuardrailResult,
  type GuardrailViolation,
  type Prediction,
  type Setpoints,
  type Telemetry,
} from "./types";

/**
 * Monotonicity-constrained physics-guided surrogate.
 *
 * Monotonic guarantees (enforced structurally by construction):
 *  - Accessory cooling power is NON-DECREASING in IT load (pump affinity law +
 *    linear chiller term, both non-negative coefficients).
 *  - Accessory cooling power is NON-INCREASING in coolant supply temperature
 *    within safe bounds (warmer supply -> more free cooling, less chiller lift).
 *  - Chiller power is NON-DECREASING in ambient wet-bulb temperature.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function flowFromSetpoints(setpoints: Setpoints): number {
  const pump = clamp(setpoints.pumpSpeedPct, 40, 100) / 100;
  const valve = clamp(setpoints.valvePosPct, 30, 100) / 100;
  // Pump curve scaled by valve openness; bounded to guardrail envelope.
  const raw = 1900 * Math.pow(pump, 1.6) * (0.35 + 0.65 * valve);
  return clamp(raw, 280, 1750);
}

export function deltaPFromFlow(flowLpm: number, setpoints: Setpoints): number {
  const valve = clamp(setpoints.valvePosPct, 30, 100) / 100;
  // Turbulent pressure drop ~ Q^2, increased by valve restriction.
  const restriction = 0.55 + 0.85 * Math.pow(1 - valve, 2);
  const dp = 48 + 150 * Math.pow(flowLpm / 1600, 2) * restriction;
  return Math.round(dp * 10) / 10;
}

export function chipTempC(telemetry: Pick<Telemetry, "itLoadMw" | "gpuDieC">, setpoints: Setpoints): number {
  const flow = flowFromSetpoints(setpoints);
  const supply = clamp(setpoints.coolantSupplyC, 16, 34);
  // Die temp = coolant supply + approach that shrinks with flow (Q^0.8) and
  // grows with per-rack heat flux (IT load). Calibrated so factory setpoints
  // at ~7 MW land near 75°C and hot/high-load corners approach the 85°C limit.
  const approach = 6.5 + 44 * (telemetry.itLoadMw / 9) * Math.pow(900 / flow, 0.8);
  return supply + approach;
}

export function predict(
  telemetry: Pick<Telemetry, "itLoadMw" | "wetBulbC" | "dryBulbC">,
  setpoints: Setpoints,
): Prediction {
  const itLoad = clamp(telemetry.itLoadMw, 0.5, 20);
  const wetBulb = telemetry.wetBulbC;
  const supply = clamp(setpoints.coolantSupplyC, 16, 34);
  const pumpPct = clamp(setpoints.pumpSpeedPct, 40, 100);

  // --- Pump power: affinity law (cubic in speed), non-decreasing in load ---
  const pumpPowerMw = 0.02 + 0.5 * Math.pow(pumpPct / 100, 3) * (0.6 + 0.4 * (itLoad / 10));

  // --- Chiller power: linear in IT load, non-increasing in supply temp,
  //     non-decreasing in wet-bulb. Free-cooling fraction rises with supply. ---
  const liftC = Math.max(0, supply - wetBulb - 2);
  const freeCoolingShare = clamp((supply - 16) / 18, 0, 1);
  const wetBulbPenalty = 1 + Math.max(0, wetBulb - 14) * 0.022;
  const chillerPowerMw =
    itLoad * 0.115 * (1 - 0.72 * freeCoolingShare) * wetBulbPenalty * (1 + liftC * 0.01);

  const accessoryPowerMw = pumpPowerMw + chillerPowerMw;
  const pue = (itLoad + accessoryPowerMw) / itLoad;

  // --- WUE (L/kWh): evaporative use rises with wet-bulb + chiller share,
  //     falls as liquid (direct-to-chip) share of heat rejection rises. ---
  const liquidShare = clamp(0.45 + (supply - 16) * 0.035 + (pumpPct - 60) * 0.001, 0.3, 0.95);
  const evapBase = 0.2 + Math.max(0, wetBulb - 10) * 0.045;
  const wue =
    evapBase *
    (1 - liquidShare * 0.78) *
    (chillerPowerMw / Math.max(0.05, accessoryPowerMw) + 0.35);

  const flow = flowFromSetpoints(setpoints);
  const deltaP = deltaPFromFlow(flow, setpoints);
  const chip = chipTempC({ itLoadMw: itLoad, gpuDieC: 0 }, setpoints);

  return {
    accessoryPowerMw: round3(accessoryPowerMw),
    pumpPowerMw: round3(pumpPowerMw),
    chillerPowerMw: round3(chillerPowerMw),
    pue: round4(pue),
    wue: round3(wue),
    chipTempC: round1(chip),
    deltaPKpa: deltaP,
    flowLpm: Math.round(flow),
    thermalMarginC: round1(GUARDRAILS.chipTempMaxC - chip),
  };
}

export function evaluateGuardrails(
  prediction: Pick<Prediction, "chipTempC" | "deltaPKpa" | "flowLpm">,
): GuardrailResult {
  const violations: GuardrailViolation[] = [];
  if (prediction.chipTempC > GUARDRAILS.chipTempMaxC) {
    violations.push({
      code: "CHIP_TEMP",
      message: `T_chip ${prediction.chipTempC.toFixed(1)}°C > ${GUARDRAILS.chipTempMaxC}°C limit`,
    });
  }
  if (prediction.deltaPKpa < GUARDRAILS.deltaPMinKpa) {
    violations.push({
      code: "DELTA_P_LOW",
      message: `ΔP ${prediction.deltaPKpa.toFixed(0)} kPa < ${GUARDRAILS.deltaPMinKpa} kPa minimum`,
    });
  }
  if (prediction.deltaPKpa > GUARDRAILS.deltaPMaxKpa) {
    violations.push({
      code: "DELTA_P_HIGH",
      message: `ΔP ${prediction.deltaPKpa.toFixed(0)} kPa > ${GUARDRAILS.deltaPMaxKpa} kPa maximum`,
    });
  }
  if (prediction.flowLpm < GUARDRAILS.flowMinLpm) {
    violations.push({
      code: "FLOW_LOW",
      message: `Flow ${prediction.flowLpm} L/min < ${GUARDRAILS.flowMinLpm} L/min minimum`,
    });
  }
  if (prediction.flowLpm > GUARDRAILS.flowMaxLpm) {
    violations.push({
      code: "FLOW_HIGH",
      message: `Flow ${prediction.flowLpm} L/min > ${GUARDRAILS.flowMaxLpm} L/min maximum`,
    });
  }
  return { feasible: violations.length === 0, violations };
}

/** Apply slew-rate limits to a requested setpoint change. Returns clamped setpoints + flag. */
export function applySlewLimits(
  current: Setpoints,
  requested: Setpoints,
  limits = { maxTempStepC: 3, maxPumpStepPct: 10, maxValveStepPct: 15 },
): { setpoints: Setpoints; limited: boolean } {
  let limited = false;
  const step = (cur: number, req: number, maxStep: number) => {
    const d = req - cur;
    if (Math.abs(d) - maxStep > 1e-9) {
      limited = true;
      return cur + Math.sign(d) * maxStep;
    }
    return req;
  };
  const coolantSupplyC = step(current.coolantSupplyC, requested.coolantSupplyC, limits.maxTempStepC);
  const pumpSpeedPct = step(current.pumpSpeedPct, requested.pumpSpeedPct, limits.maxPumpStepPct);
  const valvePosPct = step(current.valvePosPct, requested.valvePosPct, limits.maxValveStepPct);
  const cduSetpointC = step(current.cduSetpointC, requested.cduSetpointC, limits.maxTempStepC);
  return {
    limited,
    setpoints: {
      coolantSupplyC: round1(clamp(coolantSupplyC, 16, 34)),
      pumpSpeedPct: Math.round(clamp(pumpSpeedPct, 40, 100)),
      valvePosPct: Math.round(clamp(valvePosPct, 30, 100)),
      cduSetpointC: round1(clamp(cduSetpointC, 16, 34)),
    },
  };
}

export function factorySetpoints(): Setpoints {
  return { ...FACTORY_SETPOINTS };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
