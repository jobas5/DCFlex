import { GUARDRAILS, MARGIN_TIERS, type DataQuality, type DataQualityEvent, type SensorKind, type Telemetry } from "./types";

export type SensorStatus = "ok" | "warn" | "crit";

export type SensorEquipment = "rack" | "cdu" | "primary" | "tower";

export interface SensorDef {
  label: string;
  /** Telemetry field the sensor reports. */
  field: keyof Omit<Telemetry, "tick" | "timestamp">;
  unit: string;
  digits: number;
  equipment: SensorEquipment;
  location: string;
  /** Hard guardrail on the reading itself, if any. */
  limits?: { min?: number; max?: number };
  /** Reading at or beyond this warns before the guardrail is reached. */
  warnAbove?: number;
}

/**
 * The physical sensors on one zone's liquid-cooling loop. Every zone carries the
 * same set; positions in the 3D view are representative, not a surveyed layout.
 */
export const SENSOR_DEFS: Record<SensorKind, SensorDef> = {
  gpu_die: {
    label: "GPU die temperature",
    field: "gpuDieC",
    unit: "°C",
    digits: 1,
    equipment: "rack",
    location: "Cold plate, hottest rack in the row",
    limits: { max: GUARDRAILS.chipTempMaxC },
    warnAbove: GUARDRAILS.chipTempMaxC - MARGIN_TIERS.green,
  },
  cpu_die: {
    label: "CPU die temperature",
    field: "cpuDieC",
    unit: "°C",
    digits: 1,
    equipment: "rack",
    location: "Cold plate, hottest rack in the row",
    limits: { max: GUARDRAILS.chipTempMaxC },
    warnAbove: GUARDRAILS.chipTempMaxC - MARGIN_TIERS.green,
  },
  cdu_supply: {
    label: "CDU supply temperature",
    field: "cduSupplyC",
    unit: "°C",
    digits: 1,
    equipment: "cdu",
    location: "CDU secondary outlet (to racks)",
  },
  cdu_return: {
    label: "CDU return temperature",
    field: "cduReturnC",
    unit: "°C",
    digits: 1,
    equipment: "cdu",
    location: "CDU secondary inlet (from racks)",
  },
  flow: {
    label: "Secondary loop flow",
    field: "flowLpm",
    unit: "L/min",
    digits: 0,
    equipment: "cdu",
    location: "Flow meter on the CDU supply header",
    limits: { min: GUARDRAILS.flowMinLpm, max: GUARDRAILS.flowMaxLpm },
  },
  delta_p: {
    label: "Differential pressure",
    field: "deltaPKpa",
    unit: "kPa",
    digits: 0,
    equipment: "cdu",
    location: "ΔP transmitter across the CDU manifold",
    limits: { min: GUARDRAILS.deltaPMinKpa, max: GUARDRAILS.deltaPMaxKpa },
  },
  fws_supply: {
    label: "Facility water supply temperature",
    field: "fwsSupplyC",
    unit: "°C",
    digits: 1,
    equipment: "primary",
    location: "Primary loop, chiller → CDU",
  },
  fws_flow: {
    label: "Facility water flow",
    field: "fwsFlowLpm",
    unit: "L/min",
    digits: 0,
    equipment: "primary",
    location: "Primary loop flow meter",
  },
  wet_bulb: {
    label: "Ambient wet-bulb",
    field: "wetBulbC",
    unit: "°C",
    digits: 1,
    equipment: "tower",
    location: "Weather mast on the cooling tower cell",
  },
  dry_bulb: {
    label: "Ambient dry-bulb",
    field: "dryBulbC",
    unit: "°C",
    digits: 1,
    equipment: "tower",
    location: "Weather mast on the cooling tower cell",
  },
};

export const SENSOR_KINDS = Object.keys(SENSOR_DEFS) as SensorKind[];

/** Telemetry as stored per tick, with the data-quality report when available. */
export type StoredSample = Telemetry & { quality?: DataQuality };

export interface SensorEvent extends Omit<DataQualityEvent, "sensor"> {
  tick: number;
}

export interface SensorReading {
  id: string;
  kind: SensorKind;
  value: number;
  status: SensorStatus;
  reason: string;
  /** Oldest → newest, aligned with the zone's `ticks`. */
  history: number[];
  /** Data-quality actions on this sensor inside the window, newest first. */
  events: SensorEvent[];
}

/** A data-quality event this recent (ticks) keeps the sensor on watch. */
const RECENT_TICKS = 3;
/** This many events inside the window flags a sensor as unreliable. */
const NOISY_EVENTS = 3;

const EVENT_LABEL = { outlier: "Outlier rejected", drift: "Drift recalibrated", imputed: "Gap filled" } as const;

/**
 * Status of one sensor: a guardrail breach is critical; nearing a limit, a
 * recent data-quality action, or a run of them is a warning.
 */
export function sensorStatus(
  def: SensorDef,
  value: number,
  events: SensorEvent[],
  latestTick: number,
): { status: SensorStatus; reason: string } {
  const f = (v: number) => `${v.toFixed(def.digits)} ${def.unit}`;
  const { min, max } = def.limits ?? {};
  if (max !== undefined && value > max) return { status: "crit", reason: `Above the ${f(max)} guardrail` };
  if (min !== undefined && value < min) return { status: "crit", reason: `Below the ${f(min)} guardrail` };
  if (def.warnAbove !== undefined && value >= def.warnAbove) {
    return { status: "warn", reason: `Within ${f((max ?? value) - value)} of the limit` };
  }
  const recent = events.find((e) => latestTick - e.tick < RECENT_TICKS);
  if (recent) {
    const mins = (latestTick - recent.tick) * 10;
    return { status: "warn", reason: `${EVENT_LABEL[recent.kind]} ${mins === 0 ? "this tick" : `${mins} min ago`}` };
  }
  if (events.length >= NOISY_EVENTS) {
    return { status: "warn", reason: `${events.length} data-quality actions in the window` };
  }
  return { status: "ok", reason: events.length ? `${events.length} data-quality action(s) earlier in the window` : "Reading nominal" };
}

/** Readings for every sensor of one zone from its recent samples (oldest → newest). */
export function sensorReadings(zoneId: number, samples: StoredSample[]): SensorReading[] {
  const latest = samples[samples.length - 1];
  if (!latest) return [];
  return SENSOR_KINDS.map((kind) => {
    const def = SENSOR_DEFS[kind];
    const events: SensorEvent[] = [];
    for (let i = samples.length - 1; i >= 0; i--) {
      for (const e of samples[i].quality?.events ?? []) {
        if (e.sensor === kind) events.push({ tick: samples[i].tick, kind: e.kind, note: e.note });
      }
    }
    const value = latest[def.field];
    return {
      id: `${zoneId}:${kind}`,
      kind,
      value,
      ...sensorStatus(def, value, events, latest.tick),
      history: samples.map((s) => s[def.field]),
      events,
    };
  });
}
