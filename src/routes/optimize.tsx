import { createRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Droplets,
  FlaskConical,
  History,
  Layers,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  buttonStyles,
  Card,
  cx,
  Delta,
  EmptyState,
  ErrorState,
  IconChip,
  KpiTile,
  PageHeader,
  Segmented,
  Select,
  Setpoints as SetpointChips,
  Slider,
  Table,
  Td,
  Th,
} from "../components/ui";
import { api, type WhatIfResponse, type WhatIfRunListItem } from "../lib/api";
import { useSim } from "../lib/simContext";
import { fmtDateTime } from "../lib/time";
import { runWhatIf } from "../lib/twin/optimizer";
import { predict } from "../lib/twin/surrogate";
import { FACTORY_SETPOINTS, type WhatIfCandidate, type ZoneView } from "../lib/twin/types";
import { rootRoute } from "./root";

export const WEATHER_PRESETS = [
  { id: "cool", label: "Cool", wetBulbC: 10 },
  { id: "mild", label: "Mild", wetBulbC: 18 },
  { id: "hot", label: "Hot", wetBulbC: 26 },
] as const;

const pctChange = (cur: number, prev: number): number | null =>
  Number.isFinite(prev) && prev !== 0 ? ((cur - prev) / prev) * 100 : null;

/* ------------------------------------------------------------------ */
/* Shared result components (also used by the run detail page)         */
/* ------------------------------------------------------------------ */

export function CandidateTable({ candidates }: { candidates: WhatIfCandidate[] }) {
  return (
    <Table minWidth={720}>
      <thead>
        <tr>
          <Th>#</Th>
          <Th right>Supply</Th>
          <Th right>Pump</Th>
          <Th right>Valve</Th>
          <Th right>PUE</Th>
          <Th right>WUE</Th>
          <Th right>Cost J</Th>
          <Th right>T chip</Th>
          <Th>Guardrails</Th>
        </tr>
      </thead>
      <tbody>
        {candidates.map((c, i) => (
          <tr key={i} className={cx("transition-colors hover:bg-surface-2/50", i === 0 && c.feasible && "bg-ok/5")}>
            <Td className="font-mono text-xs text-fg-faint">{i + 1}</Td>
            <Td right>{c.setpoints.coolantSupplyC}°C</Td>
            <Td right>{c.setpoints.pumpSpeedPct}%</Td>
            <Td right>{c.setpoints.valvePosPct}%</Td>
            <Td right className="text-fg">{c.pue.toFixed(4)}</Td>
            <Td right className="text-fg">{c.wue.toFixed(3)}</Td>
            <Td right>{c.feasible && c.cost != null && Number.isFinite(c.cost) ? c.cost.toFixed(4) : "—"}</Td>
            <Td right>{c.chipTempC.toFixed(1)}°C</Td>
            <Td>
              {c.feasible ? (
                <Badge tone="ok">
                  <ShieldCheck className="h-3 w-3" aria-hidden /> Feasible
                </Badge>
              ) : (
                <span className="flex flex-col gap-1">
                  <Badge tone="crit" className="self-start">
                    <ShieldAlert className="h-3 w-3" aria-hidden /> Infeasible
                  </Badge>
                  {c.violations.map((v, j) => (
                    <span key={j} className="text-[11px] text-crit">
                      {v.message}
                    </span>
                  ))}
                </span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function ResultSummary({
  result,
  baseline,
  baselineLabel,
  className = "grid-cols-2 xl:grid-cols-4",
}: {
  result: WhatIfResponse;
  baseline: { pue: number; wue: number };
  baselineLabel: string;
  className?: string;
}) {
  const best = result.best;
  const feasiblePct = result.evaluated ? (result.feasibleCount / result.evaluated) * 100 : 0;
  return (
    <div className={cx("grid gap-3", className)}>
      <KpiTile
        label="Scenarios evaluated"
        value={result.evaluated.toLocaleString()}
        icon={Layers}
        iconTone="accent"
        delta={<span className="text-xs text-fg-faint">15 × 13 × 8 grid</span>}
      />
      <KpiTile
        label="Feasible"
        value={result.feasibleCount.toLocaleString()}
        icon={ShieldCheck}
        iconTone="ok"
        delta={<span className="text-xs text-fg-faint">{feasiblePct.toFixed(0)}% pass guardrails + reserve</span>}
      />
      <KpiTile
        label="Best PUE"
        value={best ? best.pue.toFixed(4) : "—"}
        icon={Zap}
        iconTone="warn"
        delta={best ? <Delta value={pctChange(best.pue, baseline.pue)} digits={2} suffix={` ${baselineLabel}`} /> : null}
      />
      <KpiTile
        label="Best WUE"
        value={best ? best.wue.toFixed(3) : "—"}
        unit={best ? "L/kWh" : undefined}
        icon={Droplets}
        iconTone="info"
        delta={best ? <Delta value={pctChange(best.wue, baseline.wue)} suffix={` ${baselineLabel}`} /> : null}
      />
    </div>
  );
}

export function BestCandidate({
  result,
  action,
}: {
  result: WhatIfResponse;
  action?: ReactNode;
}) {
  const best = result.best;
  if (!best) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="No feasible setpoints"
          body="Every permutation violated a hard guardrail in this scenario. Lower the IT load or try cooler ambient conditions."
        />
      </Card>
    );
  }
  return (
    <section className="relative overflow-hidden rounded-2xl border border-ok/30 bg-surface p-5 shadow-card">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ background: "radial-gradient(30rem 12rem at 0% 0%, color-mix(in oklab, var(--ok) 10%, transparent), transparent 70%)" }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ok">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Recommended setpoints · run #{result.runId}
          </p>
          <SetpointChips sp={best.setpoints} className="mt-3" />
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div>
              <dt className="text-fg-faint">Objective J</dt>
              <dd className="font-mono font-medium text-fg">{best.cost.toFixed(4)}</dd>
            </div>
            <div>
              <dt className="text-fg-faint">Chip temp</dt>
              <dd className="font-mono font-medium text-fg">{best.chipTempC.toFixed(1)}°C</dd>
            </div>
            {best.flowLpm > 0 ? (
              <div>
                <dt className="text-fg-faint">Flow</dt>
                <dd className="font-mono font-medium text-fg">{best.flowLpm.toLocaleString()} L/min</dd>
              </div>
            ) : null}
            {best.deltaPKpa > 0 ? (
              <div>
                <dt className="text-fg-faint">ΔP</dt>
                <dd className="font-mono font-medium text-fg">{best.deltaPKpa.toFixed(0)} kPa</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-fg-faint">Weights</dt>
              <dd className="font-mono font-medium text-fg">
                α {result.alpha.toFixed(2)} · β {result.beta.toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>
        {action ? <div className="flex flex-col items-stretch gap-2 sm:items-end">{action}</div> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page sections                                                       */
/* ------------------------------------------------------------------ */

function RecommendedActions({
  best,
  baseline,
}: {
  best: WhatIfCandidate;
  baseline: { pue: number; wue: number; accessoryPowerMw: number; flowLpm: number };
}) {
  const dPower = best.accessoryPowerMw - baseline.accessoryPowerMw;
  const dFlow = best.flowLpm - baseline.flowLpm;
  const items = [
    {
      icon: Zap,
      tone: "warn" as const,
      title: "Power",
      line: `${dPower <= 0 ? "Reduce" : "Increase"} accessory power by ${Math.abs(dPower).toFixed(2)} MW`,
      metric: "PUE",
      from: baseline.pue.toFixed(4),
      to: best.pue.toFixed(4),
      change: pctChange(best.pue, baseline.pue),
    },
    {
      icon: Droplets,
      tone: "info" as const,
      title: "Water",
      line: `${dFlow <= 0 ? "Reduce" : "Increase"} loop flow by ${Math.abs(dFlow).toFixed(0)} L/min`,
      metric: "WUE",
      from: baseline.wue.toFixed(3),
      to: best.wue.toFixed(3),
      change: pctChange(best.wue, baseline.wue),
    },
  ];
  return (
    <Card title="What changes" description="Recommended setpoints compared with the current baseline" icon={Target}>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.title} className="flex gap-3 rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line">
            <IconChip icon={it.icon} tone={it.tone} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">{it.line}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                <span className="font-mono">
                  {it.metric} {it.from} → <span className="text-fg">{it.to}</span>
                </span>
                <Delta value={it.change} digits={2} />
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CompareBar({ label, current, target, max, digits }: { label: string; current: number; target: number; max: number; digits: number }) {
  const w = (v: number) => `${Math.max(3, Math.min(100, (v / max) * 100))}%`;
  const better = target <= current;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-fg-subtle">{label}</span>
        <span className="font-mono tabular-nums text-fg-muted">
          {current.toFixed(digits)} → <span className={better ? "text-ok" : "text-warn"}>{target.toFixed(digits)}</span>
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        <div className="h-1.5 rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-fg-faint" style={{ width: w(current) }} />
        </div>
        <div className="h-1.5 rounded-full bg-surface-3">
          <div className={cx("h-full rounded-full", better ? "bg-ok" : "bg-warn")} style={{ width: w(target) }} />
        </div>
      </div>
    </div>
  );
}

function ZonePerformance({ zones, targets }: { zones: ZoneView[]; targets: Map<number, { pue: number; wue: number }> }) {
  return (
    <Card
      title="Zone performance"
      description="Live PUE/WUE vs the optimum for each zone under the current weights"
      icon={Layers}
      action={
        <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-3 rounded-full bg-fg-faint" aria-hidden /> Current
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-3 rounded-full bg-ok" aria-hidden /> Optimal
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {zones.map((z) => {
          const t = targets.get(z.id) ?? { pue: z.prediction.pue, wue: z.prediction.wue };
          const itLoad = z.telemetry.itLoadMw;
          // ΔPUE × IT load = accessory-power change (MW); ΔWUE × IT load = water change (L/min).
          const dPower = itLoad * (t.pue - z.prediction.pue);
          const dWater = itLoad * (1000 / 60) * (t.wue - z.prediction.wue);
          return (
            <div key={z.id} className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line">
              <p className="text-sm font-semibold text-fg">{z.name}</p>
              <div className="mt-3 space-y-3">
                <CompareBar label="PUE" current={z.prediction.pue} target={t.pue} max={1.3} digits={3} />
                <CompareBar label="WUE" current={z.prediction.wue} target={t.wue} max={0.4} digits={3} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
                <div>
                  <dt className="text-fg-faint">Power</dt>
                  <dd className={cx("font-mono font-medium tabular-nums", dPower <= 0 ? "text-ok" : "text-warn")}>
                    {dPower <= 0 ? "−" : "+"}
                    {Math.abs(dPower).toFixed(2)} MW
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-faint">Water</dt>
                  <dd className={cx("font-mono font-medium tabular-nums", dWater <= 0 ? "text-ok" : "text-warn")}>
                    {dWater <= 0 ? "−" : "+"}
                    {Math.abs(dWater).toFixed(0)} L/min
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PastRuns({
  runs,
  error,
  onRetry,
  zoneName,
}: {
  runs: WhatIfRunListItem[];
  error: string | null;
  onRetry: () => void;
  zoneName: (id: number) => string;
}) {
  return (
    <Card id="runs" title="Past runs" description="The 20 most recent what-if analyses" icon={History}>
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : runs.length === 0 ? (
        <EmptyState title="No what-if runs yet" body="Run your first counterfactual analysis to compare setpoint strategies." />
      ) : (
        <Table minWidth={680}>
          <thead>
            <tr>
              <Th>Run</Th>
              <Th>Scope</Th>
              <Th right>α / β</Th>
              <Th right>Feasible</Th>
              <Th right>Best PUE</Th>
              <Th right>Best WUE</Th>
              <Th className="text-right">Created</Th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="group transition-colors hover:bg-surface-2/50">
                <Td>
                  <Link
                    to="/optimize/$runId"
                    params={{ runId: String(r.id) }}
                    className="font-mono font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    #{r.id}
                  </Link>
                </Td>
                <Td>{r.zoneId != null ? zoneName(r.zoneId) : "Facility"}</Td>
                <Td right>
                  {r.alpha.toFixed(2)} / {r.beta.toFixed(2)}
                </Td>
                <Td right>
                  {r.feasibleCount.toLocaleString()} / {r.candidatesEvaluated.toLocaleString()}
                </Td>
                <Td right className="text-fg">{r.bestPue !== null ? r.bestPue.toFixed(4) : "—"}</Td>
                <Td right className="text-fg">{r.bestWue !== null ? r.bestWue.toFixed(3) : "—"}</Td>
                <Td className="text-right text-xs text-fg-subtle">{fmtDateTime(r.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function OptimizationPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: live } = useSim();
  const liveViews = useMemo(() => live?.zones ?? [], [live]);
  const [alpha, setAlpha] = useState(0.7);
  const beta = Math.round((1 - alpha) * 100) / 100;
  const [itLoad, setItLoad] = useState(6.4);
  const [wetBulb, setWetBulb] = useState(18);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [runs, setRuns] = useState<WhatIfRunListItem[]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await api.listWhatIfRuns();
      setRuns(data.runs);
      setRunsError(null);
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : "Failed to load runs.");
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const liveView = liveViews.find((z) => z.id === zoneId) ?? null;
  const liveLoad = liveView ? Number(liveView.telemetry.itLoadMw.toFixed(1)) : null;
  const liveWetBulb = liveView ? Number(liveView.telemetry.wetBulbC.toFixed(1)) : null;

  // Seed the scenario from live telemetry when the scope changes — not on every
  // tick, which would throw away the operator's slider edits.
  const applyLive = useCallback(() => {
    if (liveLoad !== null) setItLoad(liveLoad);
    if (liveWetBulb !== null) setWetBulb(liveWetBulb);
  }, [liveLoad, liveWetBulb]);
  useEffect(() => {
    applyLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, liveView != null]);

  const baseline = useMemo(
    () =>
      predict(
        { itLoadMw: itLoad, wetBulbC: wetBulb, dryBulbC: wetBulb + 6 },
        liveView ? liveView.setpoints : FACTORY_SETPOINTS,
      ),
    [itLoad, wetBulb, liveView],
  );

  // Per-zone optimum, computed client-side from live telemetry for the
  // current-vs-optimal comparison as the weights change.
  const zoneTargets = useMemo(() => {
    const map = new Map<number, { pue: number; wue: number }>();
    for (const z of liveViews) {
      const r = runWhatIf({ alpha, beta, itLoadMw: z.telemetry.itLoadMw, wetBulbC: z.telemetry.wetBulbC });
      if (r.best) map.set(z.id, { pue: r.best.pue, wue: r.best.wue });
    }
    return map;
  }, [alpha, beta, liveViews]);

  const run = async () => {
    setRunning(true);
    try {
      const data = await api.runWhatIf(
        zoneId != null ? { alpha, beta, zoneId, itLoadMw: itLoad, wetBulbC: wetBulb } : { alpha, beta, itLoadMw: itLoad, wetBulbC: wetBulb },
      );
      setResult(data);
      toast(
        data.best
          ? `Evaluated ${data.evaluated.toLocaleString()} permutations — best PUE ${data.best.pue.toFixed(4)}.`
          : "No feasible setpoints under current guardrails.",
        data.best ? "success" : "warning",
      );
      void loadRuns();
    } catch (e) {
      toast(e instanceof Error ? e.message : "What-if run failed.", "error");
    } finally {
      setRunning(false);
    }
  };

  const startShadow = async () => {
    if (result?.zoneId == null || !result.best) return;
    setStarting(true);
    try {
      await api.applyShadow(result.zoneId, result.best.setpoints);
      toast("Recommended setpoints applied to shadow — validation started.", "success");
      navigate({ to: "/shadow", search: { zone: result.zoneId } });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Apply to shadow failed.", "error");
    } finally {
      setStarting(false);
    }
  };

  const zoneName = (id: number) => liveViews.find((z) => z.id === id)?.name ?? `Zone ${id}`;
  const wetOptions = [
    ...WEATHER_PRESETS.map((p) => ({ value: p.wetBulbC as number, label: `${p.label} ${p.wetBulbC}°` })),
    ...(liveWetBulb !== null && !WEATHER_PRESETS.some((p) => p.wetBulbC === liveWetBulb)
      ? [{ value: liveWetBulb, label: `Live ${liveWetBulb}°` }]
      : []),
  ];
  const resultBaseline = { pue: baseline.pue, wue: baseline.wue };

  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        title="Optimization"
        description="Grid-search 1,560 setpoint permutations and minimise J = α·PUE + β·WUE under hard guardrails."
        actions={
          <a href="#runs" className={buttonStyles("ghost", "sm")}>
            <History className="h-3.5 w-3.5" aria-hidden /> Past runs
          </a>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        {/* Scenario controls */}
        <Card title="Scenario" description="What the engine optimises for" icon={FlaskConical} className="lg:sticky lg:top-20">
          <div className="space-y-6">
            <div>
              <label htmlFor="scope" className="text-xs font-medium text-fg-muted">
                Scope
              </label>
              <Select
                id="scope"
                className="mt-1.5"
                value={zoneId ?? ""}
                onChange={(e) => setZoneId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Facility (all zones)</option>
                {liveViews.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <div className="flex items-baseline justify-between text-xs">
                <label htmlFor="alpha" className="font-medium text-fg-muted">
                  Priority
                </label>
                <span className="font-mono tabular-nums text-fg-subtle">
                  α <span className="text-warn">{alpha.toFixed(2)}</span> · β <span className="text-info">{beta.toFixed(2)}</span>
                </span>
              </div>
              <div className="mt-2">
                <Slider id="alpha" value={alpha} min={0} max={1} step={0.05} onChange={setAlpha} tone="warn" ariaLabel="Energy (PUE) priority α" />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-fg-faint">
                <span className="flex items-center gap-1">
                  <Droplets className="h-3 w-3" aria-hidden /> Save water
                </span>
                <span className="flex items-center gap-1">
                  Save energy <Zap className="h-3 w-3" aria-hidden />
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between text-xs">
                <label htmlFor="itload" className="font-medium text-fg-muted">
                  IT load
                </label>
                <span className="flex items-center gap-2">
                  {liveLoad !== null && liveLoad !== itLoad ? (
                    <button
                      type="button"
                      onClick={applyLive}
                      className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden /> live {liveLoad}
                    </button>
                  ) : null}
                  <span className="font-mono tabular-nums text-fg">{itLoad.toFixed(1)} MW</span>
                </span>
              </div>
              <div className="mt-2">
                <Slider id="itload" value={itLoad} min={2} max={12} step={0.2} onChange={setItLoad} />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-fg-muted">Ambient wet-bulb</p>
              <Segmented
                ariaLabel="Ambient wet-bulb"
                options={wetOptions}
                value={wetBulb}
                onChange={setWetBulb}
                size="sm"
                className="mt-2 w-full [&>button]:flex-1"
              />
            </div>

            <div className="rounded-xl bg-surface-2/60 p-3 text-xs ring-1 ring-inset ring-line">
              <p className="text-fg-faint">Baseline · {liveView ? `${liveView.name} current setpoints` : "factory setpoints"}</p>
              <p className="mt-1 font-mono tabular-nums text-fg">
                PUE {baseline.pue.toFixed(4)} · WUE {baseline.wue.toFixed(3)}
              </p>
            </div>

            <Button variant="primary" size="lg" className="w-full" onClick={() => void run()} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FlaskConical className="h-4 w-4" aria-hidden />}
              {running ? "Evaluating permutations…" : "Run what-if"}
            </Button>
          </div>
        </Card>

        {/* Results */}
        <div className="min-w-0 space-y-6">
          {!result ? (
            <Card>
              <div className="flex flex-col items-center px-4 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/25">
                  <FlaskConical className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-base font-semibold text-fg">No scenario evaluated yet</h2>
                <p className="mt-1.5 max-w-md text-sm text-fg-subtle">
                  Pick a scope and priority, then run the engine. It scores every supply-temperature, pump and valve
                  combination and keeps only those inside the guardrails.
                </p>
                <ol className="mt-8 grid w-full max-w-lg gap-3 text-left sm:grid-cols-3">
                  {[
                    ["Choose", "Scope, weights and conditions"],
                    ["Evaluate", "1,560 permutations, guardrail-checked"],
                    ["Validate", "Send the winner to shadow mode"],
                  ].map(([t, d], i) => (
                    <li key={t} className="rounded-xl bg-surface-2/60 p-3 ring-1 ring-inset ring-line">
                      <p className="text-xs font-mono text-fg-faint">0{i + 1}</p>
                      <p className="mt-1 text-sm font-medium text-fg">{t}</p>
                      <p className="mt-0.5 text-xs text-fg-subtle">{d}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          ) : (
            <>
              <ResultSummary
                result={result}
                baseline={resultBaseline}
                baselineLabel="vs current"
                className="grid-cols-2 2xl:grid-cols-4"
              />
              <BestCandidate
                result={result}
                action={
                  <>
                    {result.zoneId != null ? (
                      <Button variant="primary" onClick={() => void startShadow()} disabled={starting || !result.best}>
                        {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                        Validate in shadow
                      </Button>
                    ) : (
                      <p className="max-w-52 text-xs text-fg-subtle sm:text-right">
                        Facility-wide run. Pick a single zone as scope to validate its setpoints in shadow.
                      </p>
                    )}
                    <Link to="/optimize/$runId" params={{ runId: String(result.runId) }} className={buttonStyles("ghost", "sm")}>
                      Full analysis <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </>
                }
              />
              {result.best ? (
                <RecommendedActions
                  best={result.best}
                  baseline={{
                    pue: baseline.pue,
                    wue: baseline.wue,
                    accessoryPowerMw: baseline.accessoryPowerMw,
                    flowLpm: baseline.flowLpm,
                  }}
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      {result ? (
        <Card title="Top candidates" description="Ranked feasible-first by normalised objective J" icon={CheckCircle2}>
          <CandidateTable candidates={result.candidates.slice(0, 10)} />
        </Card>
      ) : null}

      {liveViews.length ? <ZonePerformance zones={liveViews} targets={zoneTargets} /> : null}

      <PastRuns runs={runs} error={runsError} onRetry={() => void loadRuns()} zoneName={zoneName} />

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-fg-faint">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Every candidate is checked against guardrails, capacity limits and slew-rate constraints.
      </p>
    </div>
  );
}

export const optimizeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/optimize",
  component: OptimizationPage,
});
