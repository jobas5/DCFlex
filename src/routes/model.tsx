import { createRoute } from "@tanstack/react-router";
import { ArrowRight, BrainCircuit, CheckCircle2, FileBox, Scale, Timer } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { ErrorState } from "../components/ui";
import { api, type ModelMetricsResponse } from "../lib/api";
import { fmtDateTime } from "../lib/time";
import { rootRoute } from "./root";

/* ------------------------------------------------------------------ */
/* Five-stage pipeline visualizations (pure SVG, no controls)           */
/* ------------------------------------------------------------------ */

function ServerRacks() {
  const racks = [5, 35, 65, 95];
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-full" role="img" aria-label="Server racks emitting telemetry">
      {racks.map((x, i) => (
        <g key={x}>
          <rect x={x} y={6} width={22} height={36} rx={2} fill="#0f172a" stroke="#334155" />
          <line x1={x + 4} y1={13} x2={x + 18} y2={13} stroke="#334155" />
          <line x1={x + 4} y1={35} x2={x + 18} y2={35} stroke="#334155" />
          <circle cx={x + 8} cy={17} r={1.6} fill="#22d3ee" style={{ animation: `led-blink 2s ease-in-out ${i * 0.4}s infinite` }} />
          <circle cx={x + 14} cy={17} r={1.6} fill="#34d399" style={{ animation: `led-blink 2s ease-in-out ${i * 0.4 + 0.3}s infinite` }} />
          <circle cx={x + 8} cy={30} r={1.6} fill="#22d3ee" style={{ animation: `led-blink 2s ease-in-out ${i * 0.4 + 0.15}s infinite` }} />
          <circle cx={x + 14} cy={30} r={1.6} fill="#34d399" style={{ animation: `led-blink 2s ease-in-out ${i * 0.4 + 0.5}s infinite` }} />
        </g>
      ))}
    </svg>
  );
}

function ScatterPlot() {
  const normal = [
    [10, 30], [20, 22], [28, 34], [38, 18], [46, 26], [58, 20], [66, 30], [76, 16],
    [86, 26], [96, 14], [104, 28], [14, 16], [32, 40], [72, 40], [92, 34],
  ];
  const anomaly = [
    [40, 8], [82, 42], [60, 8],
  ];
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-full" role="img" aria-label="Scatter plot of raw telemetry with outliers and gaps">
      <rect x={4} y={2} width={112} height={44} rx={3} fill="#0f172a" stroke="#1e293b" />
      <rect x={48} y={4} width={16} height={40} fill="none" stroke="#334155" strokeDasharray="2 3" />
      {normal.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2} fill="#60a5fa" />
      ))}
      {anomaly.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.4} fill="#f87171" style={{ animation: `node-pulse 1.6s ease-in-out ${i * 0.5}s infinite` }} />
      ))}
    </svg>
  );
}

function NeuralNet() {
  const inputs = [14, 24, 34];
  const hidden = [8, 20, 32, 44];
  const outputs = [18, 30];
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-full" role="img" aria-label="Neural network with data pulses flowing through connections">
      {inputs.map((y) =>
        hidden.map((hy) => (
          <line key={`i${y}-${hy}`} x1={14} y1={y} x2={58} y2={hy} stroke="#1e3a5f" strokeWidth="0.6" />
        )),
      )}
      {hidden.map((y) =>
        outputs.map((oy) => (
          <line key={`o${y}-${oy}`} x1={58} y1={y} x2={104} y2={oy} stroke="#1e3a5f" strokeWidth="0.6" />
        )),
      )}
      {inputs.map((y, i) => (
        <circle key={`in${i}`} cx={14} cy={y} r={3} fill="#22d3ee" style={{ animation: `node-pulse 2s ease-in-out ${i * 0.3}s infinite` }} />
      ))}
      {hidden.map((y, i) => (
        <circle key={`h${i}`} cx={58} cy={y} r={3} fill="#38bdf8" style={{ animation: `node-pulse 2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
      {outputs.map((y, i) => (
        <circle key={`out${i}`} cx={104} cy={y} r={3} fill="#34d399" style={{ animation: `node-pulse 2s ease-in-out ${i * 0.4}s infinite` }} />
      ))}
    </svg>
  );
}

function VerifyChart() {
  const pred = "M6,32 L18,30 L30,28 L42,27 L54,25 L66,24 L78,23 L90,22 L102,21 L114,20";
  const obs = "M6,34 L18,31 L30,30 L42,29 L54,26 L66,25 L78,24 L90,24 L102,22 L114,21";
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-full" role="img" aria-label="Model prediction line versus observed measurement">
      <rect x={4} y={2} width={112} height={44} rx={3} fill="#0f172a" stroke="#1e293b" />
      <path d={obs} fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3" />
      <path d={pred} fill="none" stroke="#34d399" strokeWidth="1.6" />
    </svg>
  );
}

function MiniDashboard() {
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-full" role="img" aria-label="Miniature dashboard receiving verified predictions">
      <rect x={4} y={2} width={112} height={44} rx={3} fill="#0f172a" stroke="#1e293b" />
      <path d="M8,38 L22,32 L34,34 L46,26 L58,28 L70,18 L82,20 L96,10 L112,12" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
      <rect x={20} y={8} width={10} height={10} rx={1} fill="none" stroke="#334155" />
      <rect x={34} y={8} width={10} height={10} rx={1} fill="none" stroke="#334155" />
      <rect x={48} y={8} width={10} height={10} rx={1} fill="#0f172a" stroke="#34d399" />
      <circle cx={100} cy={10} r={5} fill="none" stroke="#34d399" strokeWidth="1.5" />
      <path d="M100,7 A5,5 0 0 1 104,13 L100,10 Z" fill="#34d399" />
    </svg>
  );
}

const STAGES = [
  {
    n: 1,
    title: "Data Collection",
    subtitle: "From real hardware",
    desc: "Collect operational data from IT load, cooling systems, sensors, and environment.",
    visual: <ServerRacks />,
  },
  {
    n: 2,
    title: "Raw Data",
    subtitle: "May contain noise",
    desc: "Real-world data can include anomalies, outliers, or missing values due to sensor noise, connection loss, or rare events.",
    visual: <ScatterPlot />,
  },
  {
    n: 3,
    title: "Surrogate Model",
    subtitle: "Learn & clean",
    desc: "The surrogate model learns system patterns, detects anomalies, and reconstructs clean, consistent data.",
    visual: <NeuralNet />,
  },
  {
    n: 4,
    title: "Verification",
    subtitle: "Validate accuracy",
    desc: "Model predictions are compared with real measurements to verify accuracy and reliability within defined tolerances.",
    visual: <VerifyChart />,
  },
  {
    n: 5,
    title: "DCFlex System",
    subtitle: "Trusted predictions",
    desc: "Verified predictions are delivered to DCFlex for optimization, what-if scenarios, and decision support.",
    visual: <MiniDashboard />,
  },
] as const;

function FlowArrow() {
  return (
    <div className="hidden shrink-0 items-center gap-0.5 self-center lg:flex" aria-hidden>
      <div className="relative h-px w-9 overflow-visible bg-slate-600">
        <span
          className="absolute -top-[3px] h-1.5 w-1.5 rounded-full bg-cyan-400"
          style={{ animation: "particle-flow 1.8s ease-in-out infinite" }}
        />
        <span
          className="absolute -top-[3px] h-1.5 w-1.5 rounded-full bg-cyan-400"
          style={{ animation: "particle-flow 1.8s ease-in-out 0.9s infinite" }}
        />
      </div>
      <ArrowRight className="h-3 w-3 text-slate-500" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Model profile                                                       */
/* ------------------------------------------------------------------ */

function ProfileRow({ icon: Icon, label, value }: { icon: typeof BrainCircuit; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
      <div>
        <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
        <dd className="text-sm text-slate-200">{value}</dd>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Model performance                                                   */
/* ------------------------------------------------------------------ */

function PerfCard({
  icon: Icon,
  accent,
  label,
  value,
  status,
  target,
  explain,
  note,
}: {
  icon: typeof Scale;
  accent: string;
  label: string;
  value: string;
  status: string;
  target: string;
  explain: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-100">{value}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1 text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {status}
        </span>
        <span className="text-slate-400">· {target}</span>
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{explain}</p>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

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

  const { latest, card } = data;
  const [serving, runtime] = card.exportedFormat.split(" — ");

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold">Surrogate Model</h1>
        <p className="text-sm text-slate-400">
          A physics-guided machine learning model that learns from real system data, filters out anomalies, and delivers
          clean, reliable predictions to power DCFlex.
        </p>
        <p className="mt-1 text-xs text-slate-500">The model runs behind the scenes — this page explains how it works.</p>
      </div>

      {/* Five-stage pipeline */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">How Surrogate Model Works</h2>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-2">
          {STAGES.map((s, i) => (
            <Fragment key={s.title}>
              {i > 0 ? <FlowArrow /> : null}
              <div className="group flex flex-1 flex-col rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 transition-colors hover:border-cyan-400/60 hover:bg-slate-900/70">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-[11px] font-semibold text-cyan-300">
                    {s.n}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{s.title}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.subtitle}</p>
                  </div>
                </div>
                <div className="mt-3">{s.visual}</div>
                <p className="mt-3 text-xs leading-relaxed text-slate-400 transition-colors group-hover:text-slate-300">{s.desc}</p>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Model profile */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Model Profile</h2>
        <dl className="mt-2 divide-y divide-slate-800">
          <ProfileRow icon={BrainCircuit} label="Model" value="Monotonicity-Constrained Surrogate Model" />
          <ProfileRow icon={BrainCircuit} label="Algorithm" value={card.algorithm} />
          <ProfileRow icon={FileBox} label="Serving" value={serving} />
          <ProfileRow icon={FileBox} label="Runtime" value={runtime} />
          <ProfileRow icon={Scale} label="Training Data" value="70% train / 15% validation / 15% test" />
          <ProfileRow icon={Scale} label="Version" value={`${card.name} v${card.version}`} />
          <ProfileRow icon={Timer} label="Last Trained" value={fmtDateTime(latest.createdAt)} />
        </dl>
        <p className="mt-2 text-xs text-slate-500">No shuffling · 14-day embargo. All fields are read-only.</p>
      </div>

      {/* Why physics-guided */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Why Physics-Guided?</h2>
        <p className="mt-1 text-sm text-slate-400">
          The surrogate model does not rely only on historical patterns. Known physical relationships are embedded into the
          model so predictions remain realistic and safe for data-center cooling operations.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden /> IT Load
            </p>
            <p className="mt-2 font-mono text-sm text-cyan-300">IT Load ↑ → Cooling Power ↑</p>
            <p className="mt-1 text-xs text-slate-400">As IT load increases, accessory cooling power should not decrease.</p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden /> Coolant Supply Temp
            </p>
            <p className="mt-2 font-mono text-sm text-cyan-300">Coolant Supply Temp ↑ → Chiller Demand ↓</p>
            <p className="mt-1 text-xs text-slate-400">
              Within safe operating bounds, increasing coolant supply temperature should not increase chiller demand.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden /> Ambient Wet-Bulb
            </p>
            <p className="mt-2 font-mono text-sm text-cyan-300">Wet-Bulb ↑ → Chiller / Facility Power ↑</p>
            <p className="mt-1 text-xs text-slate-400">
              Higher ambient wet-bulb conditions should not result in lower cooling power demand.
            </p>
          </div>
        </div>
      </div>

      {/* Hard guardrails */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Hard Guardrails</h2>
        <p className="mt-1 text-sm text-slate-400">These are physical operating boundaries, not optimization preferences.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {card.guardrails.map((g) => (
            <span key={g} className="rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              {g}
            </span>
          ))}
        </div>
      </div>

      {/* Model performance */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Model Performance</h2>
        <p className="mt-1 text-sm text-slate-400">
          The model is continuously evaluated against real measurements to ensure prediction quality remains reliable.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PerfCard
            icon={Scale}
            accent="#22d3ee"
            label="MAE · Accessory Power"
            value={`${latest.maeMw.toFixed(3)} MW`}
            status="Meets target"
            target={`≤ ${card.targets.maeMw.toFixed(3)} MW`}
            explain="Average absolute error between predicted and measured accessory power."
          />
          <PerfCard
            icon={CheckCircle2}
            accent="#34d399"
            label="PUE ±0.01 Coverage"
            value={`${latest.pueCoverage.toFixed(1)}%`}
            status="Meets target"
            target={`≥ ${card.targets.pueCoveragePct.toFixed(1)}%`}
            explain="Percentage of predictions where PUE error remains within ±0.01 of reality."
          />
          <PerfCard
            icon={Timer}
            accent="#22d3ee"
            label="Inference Latency"
            value={`${latest.inferenceLatencyMs.toFixed(1)} ms`}
            status="Meets target"
            target="p50 < 10 ms"
            explain="Median time required to generate one prediction using ONNX inference."
            note="Fast enough to evaluate thousands of what-if scenarios in real time."
          />
          <PerfCard
            icon={BrainCircuit}
            accent="#fbbf24"
            label="KL Divergence"
            value={latest.klDivergence.toFixed(3)}
            status="Within safe bounds"
            target={`warn ≥ ${card.drift.warnThreshold.toFixed(2)}`}
            explain="Measures how much the latest data distribution has shifted from the model's training distribution."
          />
        </div>
      </div>

      {/* Continuous monitoring statement */}
      <p className="py-2 text-center text-xs text-slate-500">
        Predictions are verified against real measurements and continuously monitored for drift.
      </p>
    </div>
  );
}

export const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/model",
  component: ModelPage,
});
