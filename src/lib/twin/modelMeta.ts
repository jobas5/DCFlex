import { mulberry32 } from "./simulator";
import { predict } from "./surrogate";
import type { Setpoints } from "./types";

export const MODEL_CARD = {
  name: "dcflex-surrogate",
  version: "1.4.2",
  algorithm: "LightGBM (monotonicity-constrained gradient boosting)",
  exportedFormat: "ONNX 1.17 (opset 18) — onnxruntime-web inference",
  temporalSplit: "70/15/15 chronological train/val/test (no shuffling, 14-day embargo)",
  targets: {
    maeMw: 0.026,
    pueCoveragePct: 98.7,
    pueErrorBound: 0.01,
  },
  current: {
    maeMw: 0.024,
    pueCoveragePct: 99.1,
    inferenceLatencyMs: 3.8,
    lastTrained: "2026-05-18T02:00:00.000Z",
  },
  monotonicConstraints: [
    "IT load ↑  →  accessory cooling power non-decreasing",
    "Coolant supply temp ↑  →  chiller demand non-increasing (within safe bounds)",
    "Ambient wet-bulb ↑  →  chiller/facility power non-decreasing",
  ],
  guardrails: [
    "T_chip ≤ 85 °C (GPU die)",
    "60 kPa ≤ ΔP_secondary ≤ 240 kPa",
    "400 L/min ≤ Q_loop ≤ 1600 L/min",
  ],
  drift: {
    metric: "KL divergence (feature distribution vs training baseline)",
    warnThreshold: 0.08,
    criticalThreshold: 0.15,
  },
} as const;

/** Deterministic KL-divergence drift series (hourly, last 48 points). */
export function driftSeries(n = 48): { t: string; kl: number }[] {
  const out: { t: string; kl: number }[] = [];
  for (let i = 0; i < n; i++) {
    const rand = mulberry32(i * 331 + 7);
    const wave = 0.045 + 0.03 * Math.sin((i / n) * Math.PI * 2.4) + rand() * 0.02;
    const spike = i === 33 ? 0.07 : 0; // one above-warn excursion that recovered
    out.push({
      t: new Date(Date.UTC(2026, 4, 21) + i * 3600_000).toISOString(),
      kl: Math.round((wave + spike) * 1000) / 1000,
    });
  }
  return out;
}

/** Monotonicity demo curve: accessory power vs IT load at fixed setpoints. */
export function monotonicityCurve(setpoints: Setpoints, wetBulbC = 18): { itLoadMw: number; accessoryPowerMw: number }[] {
  const out: { itLoadMw: number; accessoryPowerMw: number }[] = [];
  for (let load = 1; load <= 12; load += 0.5) {
    const p = predict({ itLoadMw: load, wetBulbC, dryBulbC: wetBulbC + 6 }, setpoints);
    out.push({ itLoadMw: load, accessoryPowerMw: p.accessoryPowerMw });
  }
  return out;
}
