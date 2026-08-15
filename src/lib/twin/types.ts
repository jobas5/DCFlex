export interface Telemetry {
  tick: number;
  timestamp: string;
  itLoadMw: number;
  cpuDieC: number;
  gpuDieC: number;
  cduSupplyC: number;
  cduReturnC: number;
  deltaPKpa: number;
  flowLpm: number;
  fwsSupplyC: number;
  fwsFlowLpm: number;
  wetBulbC: number;
  dryBulbC: number;
}

export interface DataQuality {
  outliersRemoved: number;
  driftFlags: string[];
  imputedCount: number;
}

export interface Setpoints {
  coolantSupplyC: number;
  pumpSpeedPct: number;
  valvePosPct: number;
  cduSetpointC: number;
}

export interface Prediction {
  accessoryPowerMw: number;
  pumpPowerMw: number;
  chillerPowerMw: number;
  pue: number;
  wue: number;
  chipTempC: number;
  deltaPKpa: number;
  flowLpm: number;
  thermalMarginC: number;
}

export interface GuardrailViolation {
  code: "CHIP_TEMP" | "DELTA_P_LOW" | "DELTA_P_HIGH" | "FLOW_LOW" | "FLOW_HIGH";
  message: string;
}

export interface GuardrailResult {
  feasible: boolean;
  violations: GuardrailViolation[];
}

export interface WhatIfCandidate {
  setpoints: Setpoints;
  pue: number;
  wue: number;
  cost: number;
  chipTempC: number;
  deltaPKpa: number;
  flowLpm: number;
  accessoryPowerMw: number;
  feasible: boolean;
  violations: GuardrailViolation[];
}

export interface ControlAction {
  id: number;
  clusterId: number;
  createdAt: string;
  mode: string;
  kind: "would_be" | "applied" | "fail_safe";
  setpoints: Setpoints;
  note: string;
}

export interface ControlState {
  mode: "shadow" | "closed_loop";
  commsOk: boolean;
  failSafeActive: boolean;
  slewLimited: boolean;
  lastHeartbeat: string | null;
  heartbeatAgeSec: number | null;
  currentSetpoints: Setpoints;
  effectiveSetpoints: Setpoints;
  updatedAt: string;
}

export const FACTORY_SETPOINTS: Setpoints = {
  coolantSupplyC: 22,
  pumpSpeedPct: 70,
  valvePosPct: 80,
  cduSetpointC: 24,
};

export const GUARDRAILS = {
  chipTempMaxC: 85,
  deltaPMinKpa: 60,
  deltaPMaxKpa: 240,
  flowMinLpm: 400,
  flowMaxLpm: 1600,
} as const;

export const SLEW_LIMITS = {
  maxTempStepC: 3,
  maxPumpStepPct: 10,
  maxValveStepPct: 15,
} as const;

export const MARGIN_TIERS = { green: 5, yellow: 3 } as const;

export type ZoneStatus = "green" | "yellow" | "red";

export interface ZoneSpec {
  baseLoadMw: number;
  loadAmpMw: number;
  loadPhaseH: number;
  wetBulbOffsetC: number;
}

export const DEFAULT_ZONE_SPEC: ZoneSpec = {
  baseLoadMw: 4.2,
  loadAmpMw: 3.6,
  loadPhaseH: 9,
  wetBulbOffsetC: 0,
};

export interface ZoneConfig {
  id: number;
  name: string;
  baseLoadMw: number;
  loadAmpMw: number;
  loadPhaseH: number;
  wetBulbOffsetC: number;
  targetPue: number;
  targetWue: number;
  waterBudgetLpm: number;
  powerBudgetMw: number;
}

export interface ZoneTargets {
  pue: number;
  wue: number;
}

export interface ZoneBudgets {
  waterLpm: number;
  powerMw: number;
}

export interface BudgetUsage {
  waterPct: number;
  powerPct: number;
}

export interface ZoneView {
  id: number;
  name: string;
  status: ZoneStatus;
  mode: string;
  telemetry: Telemetry;
  prediction: Prediction;
  guardrails: GuardrailResult;
  setpoints: Setpoints;
  targets: ZoneTargets;
  budgets: ZoneBudgets;
  budgetUsage: BudgetUsage;
  margin: number;
}

export interface FacilityView {
  itLoadMw: number;
  accessoryPowerMw: number;
  pue: number;
  wue: number;
  status: ZoneStatus;
  margin: number;
  waterLpm: number;
  budgets: ZoneBudgets;
  budgetUsage: BudgetUsage;
}

export function zoneStatus(margin: number): ZoneStatus {
  return margin >= MARGIN_TIERS.green ? "green" : margin >= MARGIN_TIERS.yellow ? "yellow" : "red";
}
