import { createRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  FileBox,
  Gauge,
  LineChart as LineChartIcon,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Timer,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { LineChart } from "../components/LineChart";
import { Badge, buttonStyles, Card, cx, ErrorState, IconChip, PageHeader, Skeleton, TONE_TEXT, type Tone } from "../components/ui";
import { api, type ModelMetricsResponse } from "../lib/api";
import { fmtDateTime } from "../lib/time";
import { CHART } from "../lib/tokens";
import { modelInsights } from "../lib/twin/modelInsights";
import { monotonicityCurve } from "../lib/twin/modelMeta";
import { FACTORY_SETPOINTS } from "../lib/twin/types";
import { rootRoute } from "./root";

/* ------------------------------------------------------------------ */
/* Pipeline visuals (pure SVG, themed through CSS variables)            */
/* ------------------------------------------------------------------ */

const BOX = { fill: "var(--surface-2)", stroke: "var(--line-strong)" };

function ServerRacks() {
  const racks = [5, 35, 65, 95];
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-full" role="img" aria-label="Server racks emitting telemetry">
      {racks.map((x, i) => (
        <g key={x}>
          <rect x={x} y={6} width={22} height={36} rx={3} {...BOX} />
          <line x1={x + 4} y1={13} x2={x + 18} y2={13} stroke="var(--line-strong)" />
          <line x1={x + 4} y1={35} x2={x + 18} y2={35} stroke="var(--line-strong)" />
          {[
            [8, 17, 0, "var(--accent)"],
            [14, 17, 0.3, "var(--ok)"],
            [8, 30, 0.15, "var(--accent)"],
            [14, 30, 0.5, "var(--ok)"],
          ].map(([dx, cy, delay, c], j) => (
            <circle
              key={j}
              cx={x + Number(dx)}
              cy={Number(cy)}
              r={1.6}
              fill={String(c)}
              style={{ animation: `led-blink 2s ease-in-out ${i * 0.4 + Number(delay)}s infinite` }}
            />
          ))}
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
      <rect x={4} y={2} width={112} height={44} rx={4} {...BOX} />
      <rect x={48} y={4} width={16} height={40} fill="none" stroke="var(--line-strong)" strokeDasharray="2 3" />
      {normal.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2} fill="var(--info)" />
      ))}
      {anomaly.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.4} fill="var(--crit)" style={{ animation: `node-pulse 1.6s ease-in-out ${i * 0.5}s infinite` }} />
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
        hidden.map((hy) => <line key={`i${y}-${hy}`} x1={14} y1={y} x2={58} y2={hy} stroke="var(--line-strong)" strokeWidth="0.6" />),
      )}
      {hidden.map((y) =>
        outputs.map((oy) => <line key={`o${y}-${oy}`} x1={58} y1={y} x2={104} y2={oy} stroke="var(--line-strong)" strokeWidth="0.6" />),
      )}
      {inputs.map((y, i) => (
        <circle key={`in${i}`} cx={14} cy={y} r={3} fill="var(--accent)" style={{ animation: `node-pulse 2s ease-in-out ${i * 0.3}s infinite` }} />
      ))}
      {hidden.map((y, i) => (
        <circle key={`h${i}`} cx={58} cy={y} r={3} fill="var(--info)" style={{ animation: `node-pulse 2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
      {outputs.map((y, i) => (
        <circle key={`out${i}`} cx={104} cy={y} r={3} fill="var(--ok)" style={{ animation: `node-pulse 2s ease-in-out ${i * 0.4}s infinite` }} />
      ))}
    </svg>
  );
}

function VerifyChart() {
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-full" role="img" aria-label="Model prediction line versus observed measurement">
      <rect x={4} y={2} width={112} height={44} rx={4} {...BOX} />
      <path d="M6,34 L18,31 L30,30 L42,29 L54,26 L66,25 L78,24 L90,24 L102,22 L114,21" fill="none" stroke="var(--fg-subtle)" strokeWidth="1.2" strokeDasharray="4 3" />
      <path d="M6,32 L18,30 L30,28 L42,27 L54,25 L66,24 L78,23 L90,22 L102,21 L114,20" fill="none" stroke="var(--ok)" strokeWidth="1.6" />
    </svg>
  );
}

function MiniDashboard() {
  return (
    <svg viewBox="0 0 120 48" className="h-12 w-full" role="img" aria-label="Miniature dashboard receiving verified predictions">
      <rect x={4} y={2} width={112} height={44} rx={4} {...BOX} />
      <path d="M8,38 L22,32 L34,34 L46,26 L58,28 L70,18 L82,20 L96,10 L112,12" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <rect x={20} y={8} width={10} height={10} rx={1.5} fill="none" stroke="var(--line-strong)" />
      <rect x={34} y={8} width={10} height={10} rx={1.5} fill="none" stroke="var(--line-strong)" />
      <rect x={48} y={8} width={10} height={10} rx={1.5} fill="none" stroke="var(--ok)" />
      <circle cx={100} cy={10} r={5} fill="none" stroke="var(--ok)" strokeWidth="1.5" />
      <path d="M100,7 A5,5 0 0 1 104,13 L100,10 Z" fill="var(--ok)" />
    </svg>
  );
}

const STAGES = [
  { title: "Data collection", subtitle: "From hardware", desc: "IT load, cooling systems, sensors and environment.", visual: <ServerRacks /> },
  { title: "Raw data", subtitle: "May contain noise", desc: "Outliers, drift and gaps from sensor noise or connection loss.", visual: <ScatterPlot /> },
  { title: "Surrogate model", subtitle: "Learn & clean", desc: "Learns system patterns, detects anomalies, reconstructs clean data.", visual: <NeuralNet /> },
  { title: "Verification", subtitle: "Validate accuracy", desc: "Predictions are compared with measurements within tolerances.", visual: <VerifyChart /> },
  { title: "DCFlex", subtitle: "Trusted predictions", desc: "Feeds optimisation, what-if scenarios and decision support.", visual: <MiniDashboard /> },
] as const;

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function MetricCard({
  icon,
  label,
  value,
  tone,
  verdict,
  target,
  explain,
}: {
  icon: typeof Scale;
  label: string;
  value: string;
  tone: Tone;
  verdict: string;
  target: string;
  explain: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-subtle">{label}</p>
        <IconChip icon={icon} tone={tone} size="sm" />
      </div>
      <p className="mt-2 text-[1.65rem] font-semibold leading-none tracking-tight tabular-nums text-fg">{value}</p>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={cx("inline-flex items-center gap-1 font-medium", TONE_TEXT[tone])}>
          {tone === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <TriangleAlert className="h-3.5 w-3.5" aria-hidden />}
          {verdict}
        </span>
        <span className="text-fg-faint">· {target}</span>
      </p>
      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">{explain}</p>
    </div>
  );
}

const HEALTH = {
  good: { tone: "ok" as Tone, label: "Healthy", icon: ShieldCheck },
  watch: { tone: "warn" as Tone, label: "Watch", icon: Activity },
  retrain: { tone: "crit" as Tone, label: "Retrain", icon: ShieldAlert },
};

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

  const curves = useMemo(() => [12, 20, 28].map((wb) => ({ wb, points: monotonicityCurve(FACTORY_SETPOINTS, wb) })), []);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-80" />
        <Skeleton className="h-28" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  const { latest, card, drift } = data;
  const [serving, runtime] = card.exportedFormat.split(" — ");
  const health = modelInsights({ latest, card });
  const h = HEALTH[health.status];

  const maeOk = latest.maeMw <= card.targets.maeMw;
  const covOk = latest.pueCoverage >= card.targets.pueCoveragePct;
  const latOk = latest.inferenceLatencyMs < 10;
  const klTone: Tone =
    latest.klDivergence >= card.drift.criticalThreshold ? "crit" : latest.klDivergence >= card.drift.warnThreshold ? "warn" : "ok";

  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        title="Surrogate model"
        description="A physics-guided, monotonicity-constrained model that turns setpoints and conditions into PUE, WUE and chip-temperature predictions."
        actions={<Badge tone="accent">{`${card.name} v${card.version}`}</Badge>}
      />

      <section
        className={cx(
          "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-card",
          h.tone === "ok" ? "border-ok/30" : h.tone === "warn" ? "border-warn/40" : "border-crit/40",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{ background: `radial-gradient(32rem 10rem at 0% 0%, color-mix(in oklab, var(--${h.tone}) 10%, transparent), transparent 70%)` }}
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <IconChip icon={h.icon} tone={h.tone} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg">
              Model health <Badge tone={h.tone} dot>{h.label}</Badge>
            </p>
            <p className="mt-1 text-sm text-fg-muted">{health.summary}</p>
            <p className="mt-0.5 text-xs text-fg-subtle">{health.recommendation}</p>
          </div>
          {health.action ? (
            <Link to={health.action.to} className={buttonStyles("secondary", "sm")}>
              {health.action.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Scale}
          label="MAE · accessory power"
          value={`${latest.maeMw.toFixed(3)} MW`}
          tone={maeOk ? "ok" : "warn"}
          verdict={maeOk ? "Meets target" : "Above target"}
          target={`≤ ${card.targets.maeMw.toFixed(3)} MW`}
          explain="Average absolute error between predicted and measured accessory power."
        />
        <MetricCard
          icon={CheckCircle2}
          label={`PUE ±${card.targets.pueErrorBound} coverage`}
          value={`${latest.pueCoverage.toFixed(1)}%`}
          tone={covOk ? "ok" : "warn"}
          verdict={covOk ? "Meets target" : "Below target"}
          target={`≥ ${card.targets.pueCoveragePct.toFixed(1)}%`}
          explain={`Share of predictions whose PUE error stays within ±${card.targets.pueErrorBound}.`}
        />
        <MetricCard
          icon={Timer}
          label="Inference latency"
          value={`${latest.inferenceLatencyMs.toFixed(1)} ms`}
          tone={latOk ? "ok" : "warn"}
          verdict={latOk ? "Meets target" : "Too slow"}
          target="p50 < 10 ms"
          explain="Median time per prediction — fast enough to score thousands of what-if scenarios live."
        />
        <MetricCard
          icon={Gauge}
          label="Drift · KL divergence"
          value={latest.klDivergence.toFixed(3)}
          tone={klTone}
          verdict={klTone === "ok" ? "Within bounds" : klTone === "warn" ? "Drifting" : "Retrain"}
          target={`warn ≥ ${card.drift.warnThreshold.toFixed(2)}`}
          explain="How far the live feature distribution has shifted from the training baseline."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Feature drift" description="KL divergence vs training baseline, hourly" icon={LineChartIcon}>
          <LineChart
            height={220}
            ariaLabel="KL divergence drift over the last 48 hours"
            labels={drift.map((d) => fmtDateTime(d.t).replace(/:\d{2}$/, ""))}
            series={[{ label: "KL", color: CHART.cyan, values: drift.map((d) => d.kl), area: true }]}
            thresholds={[
              { value: card.drift.warnThreshold, label: `warn ${card.drift.warnThreshold}`, color: "var(--warn)" },
              { value: card.drift.criticalThreshold, label: `retrain ${card.drift.criticalThreshold}`, color: "var(--crit)" },
            ]}
            include={[0]}
            yFormat={(v) => v.toFixed(2)}
          />
        </Card>
        <Card title="Monotonicity check" description="Accessory power vs IT load at factory setpoints" icon={BrainCircuit}>
          <LineChart
            height={220}
            ariaLabel="Accessory power rises monotonically with IT load and wet-bulb"
            labels={curves[0].points.map((p) => `${p.itLoadMw} MW`)}
            series={curves.map((c, i) => ({
              label: `Wet-bulb ${c.wb}°C`,
              color: [CHART.cyan, CHART.amber, CHART.rose][i],
              values: c.points.map((p) => p.accessoryPowerMw),
            }))}
            yFormat={(v) => `${v.toFixed(2)} MW`}
          />
        </Card>
      </div>

      <Card title="How the model works" description="From raw hardware telemetry to trusted predictions" icon={Workflow}>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:items-stretch xl:gap-0">
          {STAGES.map((s, i) => (
            <Fragment key={s.title}>
              {i > 0 ? (
                <li className="hidden shrink-0 items-center px-1.5 xl:flex" aria-hidden>
                  <div className="relative h-px w-6 bg-line-strong">
                    <span className="absolute -top-[3px] h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: "particle-flow 1.8s ease-in-out infinite" }} />
                  </div>
                </li>
              ) : null}
              <li className="group flex flex-1 flex-col rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line transition-colors hover:ring-accent/40">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg">{s.title}</p>
                    <p className="text-[11px] text-fg-faint">{s.subtitle}</p>
                  </div>
                </div>
                <div className="mt-3">{s.visual}</div>
                <p className="mt-3 text-xs leading-relaxed text-fg-subtle">{s.desc}</p>
              </li>
            </Fragment>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Physics constraints" description="Enforced structurally — predictions can't violate them" icon={ShieldCheck}>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["IT load", "IT load ↑ → cooling power ↑", "More IT load never lowers accessory cooling power."],
              ["Supply temperature", "Supply temp ↑ → chiller ↓", "Within safe bounds, warmer coolant never raises chiller demand."],
              ["Ambient wet-bulb", "Wet-bulb ↑ → power ↑", "Hotter, more humid air never lowers cooling demand."],
            ].map(([t, rule, d]) => (
              <div key={t} className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line">
                <p className="text-sm font-medium text-fg">{t}</p>
                <p className="mt-2 font-mono text-xs text-accent">{rule}</p>
                <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs font-medium text-fg-subtle">Hard guardrails · physical limits, not preferences</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {card.guardrails.map((g) => (
              <Badge key={g} tone="warn">
                {g}
              </Badge>
            ))}
          </div>
        </Card>

        <Card title="Model profile" icon={FileBox}>
          <dl className="divide-y divide-line">
            {[
              ["Algorithm", card.algorithm],
              ["Serving", serving],
              ["Runtime", runtime],
              ["Split", card.temporalSplit],
              ["Version", `${card.name} v${card.version}`],
              ["Last evaluated", fmtDateTime(latest.createdAt)],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
                <dt className="w-32 shrink-0 text-xs text-fg-faint">{k}</dt>
                <dd className="text-sm text-fg-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}

export const modelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/model",
  component: ModelPage,
});
