import { chipTempC, deltaPFromFlow, flowFromSetpoints } from "./surrogate";
import {
  DEFAULT_ZONE_SPEC,
  FACTORY_SETPOINTS,
  type DataQuality,
  type SensorKind,
  type Setpoints,
  type Telemetry,
  type ZoneSpec,
} from "./types";

/** Deterministic seeded PRNG (mulberry32) so history is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

const TICK_MS = 10 * 60 * 1000; // 10-minute intervals

// Sensors whose dropped readings get imputed. Chosen by tick, not by the PRNG,
// so recording which one was hit doesn't shift the rest of the random stream.
const IMPUTABLE: SensorKind[] = ["flow", "delta_p", "cdu_return", "fws_flow", "dry_bulb"];

export function tickTelemetry(
  prev: Telemetry | null,
  tickIndex: number,
  setpoints: Setpoints = FACTORY_SETPOINTS,
  spec: ZoneSpec = DEFAULT_ZONE_SPEC,
): { telemetry: Telemetry; quality: DataQuality } {
  // Salt by zone profile so zones don't share identical noise and sensor faults.
  const salt = Math.round(spec.loadPhaseH * 1009 + spec.wetBulbOffsetC * 131 + spec.baseLoadMw * 17);
  const rand = mulberry32(tickIndex * 7919 + 13 + salt);
  const noise = (amp: number) => (rand() - 0.5) * 2 * amp;

  // Time-of-day load cycle: business-hours peak, overnight trough.
  const hourOfDay = (tickIndex * 10) / 60 % 24;
  const loadCycle = 0.5 + 0.5 * Math.sin(((hourOfDay - spec.loadPhaseH) / 24) * 2 * Math.PI);
  const baseLoad = spec.baseLoadMw + spec.loadAmpMw * loadCycle;
  const itLoadMw = round2(prev ? prev.itLoadMw * 0.75 + baseLoad * 0.25 + noise(0.12) : baseLoad);

  // Weather: slow wet-bulb drift with diurnal wave.
  const wetBase = 16 + spec.wetBulbOffsetC + 6 * Math.sin(((hourOfDay - 15) / 24) * 2 * Math.PI);
  const wetBulbC = round1(
    prev ? prev.wetBulbC * 0.9 + wetBase * 0.1 + noise(0.4) : wetBase,
  );
  const dryBulbC = round1(wetBulbC + 4 + rand() * 5);

  const flow = flowFromSetpoints(setpoints);
  const deltaP = deltaPFromFlow(flow, setpoints);
  const supply = setpoints.coolantSupplyC + noise(0.15);
  const deltaT = (itLoadMw * 860) / (flow * 0.0698); // heat balance approximation
  const ret = supply + Math.min(14, Math.max(4, deltaT));

  const gpu = chipTempC({ itLoadMw, gpuDieC: 0 }, setpoints) + noise(0.5);
  const cpu = gpu - 2.5 - rand() * 2;

  let cduSupply = round1(supply);
  let wetBulbOut = wetBulbC;

  // --- Data-quality layer simulation: occasional outlier + drift + gaps ---
  const quality: DataQuality = { outliersRemoved: 0, driftFlags: [], imputedCount: 0, events: [] };
  const anomalyRoll = rand();
  if (anomalyRoll < 0.04) {
    // Outlier injected then removed by validation layer.
    quality.outliersRemoved = 1;
    const spike = 6 * (rand() > 0.5 ? 1 : -1);
    cduSupply = round1(cduSupply + spike);
    cduSupply = round1(supply); // outlier removed, value replaced by model estimate
    quality.events.push({
      sensor: "cdu_supply",
      kind: "outlier",
      note: `${spike > 0 ? "+" : "−"}6°C spike rejected; reading replaced by model estimate`,
    });
  } else if (anomalyRoll < 0.08) {
    quality.driftFlags.push("wet_bulb: z-score 2.9 (recalibrated)");
    wetBulbOut = round1(wetBulbC * 0.7 + wetBase * 0.3);
    quality.events.push({ sensor: "wet_bulb", kind: "drift", note: "Drift z-score 2.9; recalibrated against the model" });
  } else if (anomalyRoll < 0.11) {
    quality.imputedCount = 1;
    quality.events.push({
      sensor: IMPUTABLE[tickIndex % IMPUTABLE.length],
      kind: "imputed",
      note: "Reading missing; gap filled by model estimate",
    });
  }

  return {
    telemetry: {
      tick: tickIndex,
      timestamp: new Date(Date.UTC(2026, 4, 17) + tickIndex * TICK_MS).toISOString(),
      itLoadMw,
      cpuDieC: round1(cpu),
      gpuDieC: round1(gpu),
      cduSupplyC: cduSupply,
      cduReturnC: round1(ret),
      deltaPKpa: deltaP,
      flowLpm: Math.round(flow),
      fwsSupplyC: round1(wetBulbOut + 3.5 + noise(0.3)),
      fwsFlowLpm: Math.round(flow * 1.35 + noise(20)),
      wetBulbC: wetBulbOut,
      dryBulbC,
    },
    quality,
  };
}
