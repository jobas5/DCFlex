import type {
  ControlAction,
  ControlState,
  GuardrailResult,
  Prediction,
  Setpoints,
  Telemetry,
  WhatIfCandidate,
} from "./twin/types";

export interface TelemetryResponse {
  telemetry: Telemetry;
  setpoints: Setpoints;
  prediction: Prediction;
  guardrails: GuardrailResult;
}

export interface TickResponse extends TelemetryResponse {
  quality: { outliersRemoved: number; driftFlags: string[]; imputedCount: number };
}

export interface HistoryPoint extends Telemetry {
  pue: number;
  wue: number;
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

export interface ControlResponse {
  state: ControlState & {
    watchdogTimeoutSec: number;
    factorySetpoints: Setpoints;
    slewLimits: { maxTempStepC: number; maxPumpStepPct: number; maxValveStepPct: number };
  };
  actions: ControlAction[];
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
  telemetryCurrent: () => request<TelemetryResponse>("/api/telemetry/current"),
  telemetryTick: () => request<TickResponse>("/api/telemetry/tick", { method: "POST", body: "{}" }),
  telemetryHistory: (limit = 96) =>
    request<{ history: HistoryPoint[] }>(`/api/telemetry/history?limit=${limit}`),
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
  setControlMode: (mode: "shadow" | "closed_loop") =>
    request<ControlResponse>("/api/control/mode", { method: "POST", body: JSON.stringify({ mode }) }),
  applySetpoints: (setpoints: Setpoints, note?: string) =>
    request<ControlResponse & { applied: Setpoints; slewLimited: boolean; kind: string }>(
      "/api/control/apply",
      { method: "POST", body: JSON.stringify({ setpoints, note }) },
    ),
  heartbeat: () => request<{ ok: boolean }>("/api/control/heartbeat", { method: "POST", body: "{}" }),
  modelMetrics: () => request<ModelMetricsResponse>("/api/model/metrics"),
};
