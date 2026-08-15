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
  feasible: boolean;
  violations: GuardrailViolation[];
}

export interface WhatIfRunSummary {
  id: number;
  createdAt: string;
  alpha: number;
  beta: number;
  bestPue: number;
  bestWue: number;
  bestCost: number;
  candidatesEvaluated: number;
  feasibleCount: number;
  status: string;
}

export interface ControlAction {
  id: number;
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
