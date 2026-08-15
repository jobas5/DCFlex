import { createRoute, Link } from "@tanstack/react-router";
import { BrainCircuit, CheckCircle2, FileBox, Scale, Timer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LineChart } from "../components/LineChart";
import { ErrorState, Panel, StatusBadge } from "../components/ui";
import { api, type ModelMetricsResponse } from "../lib/api";
import { modelInsights } from "../lib/twin/modelInsights";
import { monotonicityCurve } from "../lib/twin/modelMeta";
import { FACTORY_SETPOINTS } from "../lib/twin/types";
import { rootRoute } from "./root";

function MetricGauge({
  label,
  value,
  target,
  format,
  pass,
  explain,
  icon: Icon,
}: {
  label: string;
  value: number;
  target: string;
  format: (v: number) => string;
  pass: boolean;
  explain: string;
  icon: typeof Timer;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${pass ? "border-emerald-500/40 bg-emerald-950/20" : "border-red-500/50 bg-red-950/20"}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" aria-hidden />
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-100">{format(value)}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs">
        {pass ? (
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Meets target
          </span>
        ) : (
          <span className="text-red-300">Below target</span>
        )}
        <span className="text-slate-400">· target {target}</span>
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{explain}</p>
    </div>
  );
}

function ModelPage() {
  const [data, setData] = useState<ModelMetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.modelMetrics());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load model metrics.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <p className="py-20 text-center text-sm text-slate-400">Loading model card…</p>;

  const { latest, card, drift } = data;
  const mono = monotonicityCurve(FACTORY_SETPOINTS);
  const health = modelInsights({ latest, card });
  const driftLabels = drift.map((d) =>
    new Date(d.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  );

  const healthTone = health.status === "good" ? "good" : health.status === "watch" ? "warn" : "bad";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Monotonicity-Constrained Surrogate Model</h1>
        <p className="text-sm text-slate-400">
          Physics-guided gradient boosting predicting facility accessory cooling power
        </p>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge tone={healthTone}>
              {health.status === "good" ? "Healthy" : health.status === "watch" ? "Watch" : "Retrain needed"}
            </StatusBadge>
            <h2 className="text-sm font-semibold text-slate-200">Model health</h2>
          </div>
          {health.action ? (
            <Link
              to={health.action.to}
              className="rounded-lg border border-cyan-500/50 px-3 py-1.5 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              {health.action.label} →
            </Link>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-slate-300">{health.summary}</p>
        <p className="mt-1 text-sm text-slate-400">{health.recommendation}</p>
      </div>

      <Panel title="Model card">
        <div className="grid gap-4 md:grid-cols-2">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-cyan-400" aria-hidden />
              <dt className="text-slate-400">Algorithm:</dt>
              <dd className="text-slate-200">{card.algorithm}</dd>
            </div>
            <div className="flex items-center gap-2">
              <FileBox className="h-4 w-4 text-cyan-400" aria-hidden />
              <dt className="text-slate-400">Serving format:</dt>
              <dd className="text-slate-200">{card.exportedFormat}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-cyan-400" aria-hidden />
              <dt className="text-slate-400">Validation split:</dt>
              <dd className="text-slate-200">{card.temporalSplit}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400">Version:</dt>
              <dd className="font-mono text-slate-200">
                {card.name} v{card.version}
              </dd>
            </div>
          </dl>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Monotonic constraints</p>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
              {card.monotonicConstraints.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-400">Hard guardrails</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {card.guardrails.map((g, i) => (
                <StatusBadge key={i} tone="warn">
                  {g}
                </StatusBadge>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricGauge
          label="MAE (accessory power)"
          value={latest.maeMw}
          target={`≤ ${card.targets.maeMw} MW`}
          format={(v) => `${v.toFixed(3)} MW`}
          pass={latest.maeMw <= card.targets.maeMw}
          explain={`Average prediction error on cooling power. ${latest.maeMw.toFixed(3)} MW ≈ ${Math.round(latest.maeMw * 1000)} kW — about the draw of a few GPU racks.`}
          icon={Scale}
        />
        <MetricGauge
          label="PUE ±0.01 coverage"
          value={latest.pueCoverage}
          target={`≥ ${card.targets.pueCoveragePct}%`}
          format={(v) => `${v.toFixed(1)}%`}
          pass={latest.pueCoverage >= card.targets.pueCoveragePct}
          explain={`How often a PUE prediction lands within ±0.01 of reality. ${latest.pueCoverage.toFixed(1)}% = ${Math.round(latest.pueCoverage)} of every 100 predictions.`}
          icon={CheckCircle2}
        />
        <MetricGauge
          label="Inference latency"
          value={latest.inferenceLatencyMs}
          target="p50 < 10 ms (ONNX)"
          format={(v) => `${v.toFixed(1)} ms`}
          pass={latest.inferenceLatencyMs < 10}
          explain={`Time per prediction. ${latest.inferenceLatencyMs.toFixed(1)} ms means all 1,560 what-if scenarios score in well under a second.`}
          icon={Timer}
        />
        <MetricGauge
          label="KL divergence (latest)"
          value={latest.klDivergence}
          target={`warn ≥ ${card.drift.warnThreshold}`}
          format={(v) => v.toFixed(3)}
          pass={latest.klDivergence < card.drift.warnThreshold}
          explain={`How far the facility has drifted from the model's training data. Below ${card.drift.warnThreshold} is trustworthy; retrain after ${card.drift.warnThreshold}, urgently before ${card.drift.criticalThreshold}.`}
          icon={BrainCircuit}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Model drift — KL divergence (hourly)">
          <LineChart
            ariaLabel="KL divergence drift over the last 48 hours with warning threshold band"
            labels={driftLabels}
            series={[{ label: "KL divergence", color: "#fbbf24", values: drift.map((d) => d.kl) }]}
            yFormat={(v) => v.toFixed(3)}
            threshold={{ value: card.drift.warnThreshold, label: "warn 0.08", color: "#f87171" }}
          />
          <p className="mt-2 text-xs text-slate-400">{card.drift.metric}. Retrain trigger at {card.drift.criticalThreshold}.</p>
          <p className="mt-1 text-xs text-slate-500">
            In plain terms: each point is that hour's "how different is the facility from training". A rising line means the
            facility is changing (new hardware, season) and the model is aging.
          </p>
        </Panel>
        <Panel title="Monotonicity proof — accessory power vs IT load">
          <LineChart
            ariaLabel="Accessory cooling power versus IT load showing a non-decreasing response curve"
            labels={mono.map((m) => `${m.itLoadMw.toFixed(0)} MW`)}
            series={[{ label: "Accessory power (MW)", color: "#22d3ee", values: mono.map((m) => m.accessoryPowerMw) }]}
            yFormat={(v) => v.toFixed(2)}
          />
          <p className="mt-2 text-xs text-slate-400">
            Response is structurally non-decreasing in IT load — a required monotonic constraint verified on every
            export.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            In plain terms: this proves the model can never say "more heat needs less cooling". The line only goes up —
            that's the safety guarantee behind every what-if answer.
          </p>
        </Panel>
      </div>
    </div>
  );
}

export const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/model",
  component: ModelPage,
});
