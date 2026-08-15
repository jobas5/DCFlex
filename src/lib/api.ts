import type {
  ControlAction,
  FacilityView,
  Prediction,
  Setpoints,
  WhatIfCandidate,
  ZoneView,
} from "./twin/types";
import type { TransferProposal } from "./twin/transfer";

export interface TelemetryCurrentResponse {
  aggregate: FacilityView;
  zones: ZoneView[];
}

export interface TickResponse extends TelemetryCurrentResponse {
  quality: { outliersRemoved: number; driftFlags: string[]; imputedCount: number };
}

export interface WhatIfResponse {
  runId: number;
  createdAt?: string;
  alpha: number;
  beta: number;
  evaluated: number;
  feasibleCount: number;
  status?: string;
  best: WhatIfCandidate | null;
  candidates: WhatIfCandidate[];
  baseSetpoints?: Setpoints;
}

export interface WhatIfRunListItem {
  id: number;
  createdAt: string;
  alpha: number;
  beta: number;
  bestPue: number | null;
  bestWue: number | null;
  bestCost: number | null;
  candidatesEvaluated: number;
  feasibleCount: number;
  status: string;
}

export interface ControlZoneView {
  id: number;
  name: string;
  mode: "shadow" | "closed_loop";
  commsOk: boolean;
  failSafeActive: boolean;
  slewLimited: boolean;
  lastHeartbeat: string | null;
  heartbeatAgeSec: number | null;
  watchdogTimeoutSec: number;
  currentSetpoints: Setpoints;
  effectiveSetpoints: Setpoints;
  factorySetpoints: Setpoints;
  slewLimits: { maxTempStepC: number; maxPumpStepPct: number; maxValveStepPct: number };
  targets: { pue: number; wue: number };
  budgets: { waterLpm: number; powerMw: number };
  updatedAt: string;
}

export interface ControlResponse {
  zones: ControlZoneView[];
  actions: ControlAction[];
}

export interface ZoneConfigResponse {
  id: number;
  name: string;
  targetPue: number;
  targetWue: number;
  waterBudgetLpm: number;
  powerBudgetMw: number;
  mode: string;
}

export interface FacilityConfigResponse {
  id: number;
  totalWaterBudgetLpm: number;
  totalPowerBudgetMw: number;
}

export interface SandboxResponse {
  zoneId: number;
  baseline: Prediction;
  best: WhatIfCandidate | null;
  feasibleCount: number;
  candidates: WhatIfCandidate[];
}

export interface TransferResponse extends TransferProposal {
  id: number;
  status: string;
  withinFacility: boolean;
}

export interface TransferListItem {
  id: number;
  createdAt: string;
  sourceId: number;
  targetId: number;
  waterDeltaLpm: number;
  powerDeltaMw: number;
  sourceSetpoints: string;
  targetSetpoints: string;
  outcome: string;
  status: string;
}

export interface ModelMetricsResponse {
  latest: {
    maeMw: number;
    pueCoverage: number;
    klDivergence: number;
    inferenceLatencyMs: number;
    createdAt: string;
  };
  card: {
    name: string;
    version: string;
    algorithm: string;
    exportedFormat: string;
    temporalSplit: string;
    targets: { maeMw: number; pueCoveragePct: number; pueErrorBound: number };
    monotonicConstraints: readonly string[];
    guardrails: readonly string[];
    drift: { metric: string; warnThreshold: number; criticalThreshold: number };
  };
  drift: { t: string; kl: number }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string; violations?: { message: string }[] };
      if (body.error) message = body.error;
      if (body.violations?.length) message += " " + body.violations.map((v) => v.message).join("; ");
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  telemetryCurrent: () => request<TelemetryCurrentResponse>("/api/telemetry/current"),
  telemetryTick: () => request<TickResponse>("/api/telemetry/tick", { method: "POST", body: "{}" }),
  runWhatIf: (input: {
    alpha: number;
    beta: number;
    itLoadMw?: number;
    wetBulbC?: number;
    baseSetpoints?: Setpoints;
  }) =>
    request<WhatIfResponse>("/api/whatif", { method: "POST", body: JSON.stringify(input) }),
  listWhatIfRuns: () => request<{ runs: WhatIfRunListItem[] }>("/api/whatif"),
  getWhatIfRun: (id: number) => request<WhatIfResponse>(`/api/whatif/${id}`),
  getControl: () => request<ControlResponse>("/api/control"),
  setControlMode: (clusterId: number, mode: "shadow" | "closed_loop") =>
    request<ControlResponse>("/api/control/mode", {
      method: "POST",
      body: JSON.stringify({ clusterId, mode }),
    }),
  applySetpoints: (clusterId: number, setpoints: Setpoints, note?: string) =>
    request<{ ok: boolean; applied: Setpoints; slewLimited: boolean; kind: string }>(
      "/api/control/apply",
      { method: "POST", body: JSON.stringify({ clusterId, setpoints, note }) },
    ),
  heartbeat: () => request<{ ok: boolean }>("/api/control/heartbeat", { method: "POST", body: "{}" }),
  listZones: () => request<{ zones: ZoneConfigResponse[] }>("/api/zones"),
  patchZone: (id: number, patch: Partial<ZoneConfigResponse>) =>
    request<{ ok: boolean }>(`/api/zones/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  getFacility: () => request<FacilityConfigResponse>("/api/facility"),
  patchFacility: (patch: Partial<FacilityConfigResponse>) =>
    request<{ ok: boolean }>("/api/facility", { method: "PATCH", body: JSON.stringify(patch) }),
  optimizeZone: (id: number, alpha?: number, beta?: number) =>
    request<SandboxResponse>(`/api/zones/${id}/optimize`, {
      method: "POST",
      body: JSON.stringify({ alpha, beta }),
    }),
  createTransfer: (input: {
    sourceId: number;
    targetId: number;
    waterDeltaLpm?: number;
    powerDeltaMw?: number;
  }) => request<TransferResponse>("/api/transfers", { method: "POST", body: JSON.stringify(input) }),
  listTransfers: () => request<{ transfers: TransferListItem[] }>("/api/transfers"),
  transitionTransfer: (id: number, action: "virtual" | "verify" | "apply" | "reject") =>
    request<{ ok: boolean; status: string }>(`/api/transfers/${id}/${action}`, {
      method: "POST",
      body: "{}",
    }),
  modelMetrics: () => request<ModelMetricsResponse>("/api/model/metrics"),
};
