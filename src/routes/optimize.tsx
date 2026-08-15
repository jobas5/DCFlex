import { createRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  CheckCircle2,
  Droplets,
  FlaskConical,
  Gauge,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Target,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../components/Toast";
import { EmptyState, ErrorState, Panel, StatusBadge } from "../components/ui";
import { api, type WhatIfResponse, type WhatIfRunListItem } from "../lib/api";
import { useSim } from "../lib/simContext";
import { runWhatIf } from "../lib/twin/optimizer";
import { predict } from "../lib/twin/surrogate";
import { FACTORY_SETPOINTS, type Setpoints, type WhatIfCandidate, type ZoneView } from "../lib/twin/types";
import { rootRoute } from "./root";

export const WEATHER_PRESETS = [
  { id: "cool", label: "Cool", wetBulbC: 10 },
  { id: "mild", label: "Mild", wetBulbC: 18 },
  { id: "hot", label: "Hot & humid", wetBulbC: 26 },
] as const;

export function CandidateTable({ candidates }: { candidates: WhatIfCandidate[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
            <th className="px-2 py-2">Rank</th>
            <th className="px-2 py-2">Supply °C</th>
            <th className="px-2 py-2">Pump %</th>
            <th className="px-2 py-2">Valve %</th>
            <th className="px-2 py-2">PUE</th>
            <th className="px-2 py-2">WUE</th>
            <th className="px-2 py-2">Cost J</th>
            <th className="px-2 py-2">T_chip</th>
            <th className="px-2 py-2">Guardrails</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => (
            <tr key={i} className="border-b border-slate-800/60">
              <td className="px-2 py-2 font-mono text-slate-400">{i + 1}</td>
              <td className="px-2 py-2 font-mono">{c.setpoints.coolantSupplyC}</td>
              <td className="px-2 py-2 font-mono">{c.setpoints.pumpSpeedPct}</td>
              <td className="px-2 py-2 font-mono">{c.setpoints.valvePosPct}</td>
              <td className="px-2 py-2 font-mono text-cyan-300">{c.pue.toFixed(4)}</td>
              <td className="px-2 py-2 font-mono text-emerald-300">{c.wue.toFixed(3)}</td>
              <td className="px-2 py-2 font-mono">{c.feasible ? c.cost.toFixed(4) : "—"}</td>
              <td className="px-2 py-2 font-mono">{c.chipTempC.toFixed(1)}°C</td>
              <td className="px-2 py-2">
                {c.feasible ? (
                  <StatusBadge tone="good">
                    <ShieldCheck className="h-3 w-3" aria-hidden /> Feasible
                  </StatusBadge>
                ) : (
                  <div className="space-y-1">
                    <StatusBadge tone="bad">
                      <ShieldAlert className="h-3 w-3" aria-hidden /> Infeasible
                    </StatusBadge>
                    <ul className="text-xs text-red-300">
                      {c.violations.map((v, j) => (
                        <li key={j}>· {v.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WhatIfResults({
  result,
  baseline,
  onUseBest,
}: {
  result: WhatIfResponse;
  baseline: { pue: number; wue: number };
  onUseBest?: (setpoints: Setpoints) => void;
}) {
  const best = result.best;

  if (!best) {
    return (
      <Panel title="Results">
        <EmptyState
          title="No feasible setpoints"
          body="Every permutation violated a hard guardrail in this scenario. Loosen the scenario or review limits."
        />
      </Panel>
    );
  }

  const dPue = best.pue - baseline.pue;
  const dWue = best.wue - baseline.wue;

  return (
    <Panel title={`Results — run #${result.runId} (${result.evaluated} evaluated, ${result.feasibleCount} feasible)`}>
      <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">Best candidate</p>
            <p className="mt-1 font-mono text-sm text-slate-200">
              Supply {best.setpoints.coolantSupplyC}°C · Pump {best.setpoints.pumpSpeedPct}% · Valve{" "}
              {best.setpoints.valvePosPct}% · CDU {best.setpoints.cduSetpointC}°C
            </p>
            <p className="mt-1 text-sm text-slate-300">
              PUE {best.pue.toFixed(4)} ({dPue <= 0 ? "" : "+"}
              {dPue.toFixed(4)} vs baseline) · WUE {best.wue.toFixed(3)} ({dWue <= 0 ? "" : "+"}
              {dWue.toFixed(3)}) · J = {best.cost.toFixed(4)}
            </p>
          </div>
          {result.zoneId != null && onUseBest ? (
            <button
              type="button"
              onClick={() => onUseBest(best.setpoints)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              Use best setpoints
            </button>
          ) : (
            <span className="text-xs text-slate-400">Facility run — select a zone to apply.</span>
          )}
        </div>
      </div>
      <CandidateTable candidates={result.candidates.slice(0, 15)} />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Design-plan sections                                                */
/* ------------------------------------------------------------------ */

const pctChange = (cur: number, prev: number): number | null =>
  Number.isFinite(prev) && prev !== 0 ? ((cur - prev) / prev) * 100 : null;

function ImprovementChip({ change }: { change: number | null }) {
  if (change === null) return null;
  const down = change <= 0; // lower J / PUE / WUE is an improvement
  return (
    <span className={`font-mono text-xs tabular-nums ${down ? "text-emerald-300" : "text-amber-300"}`}>
      {down ? "↓" : "↑"} {Math.abs(change).toFixed(1)}% vs current
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  iconClass,
  title,
  value,
  unit,
  sub,
  change,
}: {
  icon: typeof Zap;
  iconClass: string;
  title: string;
  value: string;
  unit?: string;
  sub?: string;
  change?: number | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`rounded-lg p-1.5 ${iconClass}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
        </span>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span> : null}
      </p>
      <div className="mt-1 min-h-4">
        {change !== undefined ? <ImprovementChip change={change} /> : sub ? <p className="text-xs text-slate-500">{sub}</p> : null}
      </div>
    </div>
  );
}

function ScenarioSummary({
  result,
  baseline,
  alpha,
  beta,
}: {
  result: WhatIfResponse | null;
  baseline: { pue: number; wue: number };
  alpha: number;
  beta: number;
}) {
  const best = result?.best ?? null;
  const jBest = best ? alpha * best.pue + beta * best.wue : null;
  const jBase = alpha * baseline.pue + beta * baseline.wue;
  return (
    <Panel
      title="Scenario summary"
      action={<span className="text-xs font-normal normal-case text-slate-500">(What-If results)</span>}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={Layers}
          iconClass="bg-cyan-500/15 text-cyan-300"
          title="Total scenarios tested"
          value={result ? result.evaluated.toLocaleString() : "—"}
          sub="(per zone)"
        />
        <SummaryCard
          icon={Target}
          iconClass="bg-cyan-500/15 text-cyan-300"
          title="Best objective (J)"
          value={jBest !== null ? jBest.toFixed(3) : "—"}
          change={jBest !== null ? pctChange(jBest, jBase) : undefined}
        />
        <SummaryCard
          icon={Zap}
          iconClass="bg-amber-500/15 text-amber-300"
          title="Best PUE"
          value={best ? best.pue.toFixed(4) : "—"}
          change={best ? pctChange(best.pue, baseline.pue) : undefined}
        />
        <SummaryCard
          icon={Droplets}
          iconClass="bg-cyan-500/15 text-cyan-300"
          title="Best WUE"
          value={best ? best.wue.toFixed(3) : "—"}
          unit={best ? "L/kWh" : undefined}
          change={best ? pctChange(best.wue, baseline.wue) : undefined}
        />
      </div>
      {!result ? (
        <p className="mt-3 text-xs text-slate-500">Run What-If to evaluate the scenario space and compute the optimal result.</p>
      ) : null}
    </Panel>
  );
}

function RecommendedAction({
  result,
  baseline,
}: {
  result: WhatIfResponse | null;
  baseline: { pue: number; wue: number; accessoryPowerMw: number; flowLpm: number };
}) {
  const best = result?.best ?? null;
  if (!best) return null;
  const dPower = baseline.accessoryPowerMw - best.accessoryPowerMw;
  const dFlow = baseline.flowLpm - best.flowLpm;
  const dPue = baseline.pue - best.pue;
  const dWue = baseline.wue - best.wue;
  return (
    <Panel
      title="Recommended action"
      action={<span className="text-xs font-normal normal-case text-slate-500">(Optimal scenario)</span>}
    >
      <p className="mb-3 text-sm text-slate-400">
        Move resources from higher-cost operation to lower-cost operation to achieve the best objective.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-amber-300">
            <Zap className="h-3.5 w-3.5" aria-hidden /> Power rebalance
          </p>
          <p className="mt-2 text-sm text-slate-200">
            {dPower >= 0 ? "Reduce" : "Increase"} accessory power by {Math.abs(dPower).toFixed(2)} MW
          </p>
          <p className="mt-1 text-xs text-emerald-300">Expected PUE improvement: ↓ {Math.abs(dPue).toFixed(3)}</p>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-cyan-300">
            <Droplets className="h-3.5 w-3.5" aria-hidden /> Water rebalance
          </p>
          <p className="mt-2 text-sm text-slate-200">
            {dFlow >= 0 ? "Reduce" : "Increase"} loop flow by {Math.abs(dFlow).toFixed(0)} L/min
          </p>
          <p className="mt-1 text-xs text-emerald-300">Expected WUE improvement: ↓ {Math.abs(dWue).toFixed(3)} L/kWh</p>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Impact summary
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              PUE: {baseline.pue.toFixed(4)} → {best.pue.toFixed(4)}{" "}
              <span className="text-emerald-300">(↓ {Math.abs(pctChange(best.pue, baseline.pue) ?? 0).toFixed(1)}%)</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              WUE: {baseline.wue.toFixed(3)} → {best.wue.toFixed(3)} L/kWh{" "}
              <span className="text-emerald-300">(↓ {Math.abs(pctChange(best.wue, baseline.wue) ?? 0).toFixed(1)}%)</span>
            </li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function CompareBars({
  current,
  target,
  min,
  max,
  format,
}: {
  current: number;
  target: number;
  min: number;
  max: number;
  format: (v: number) => string;
}) {
  const w = (v: number) => `${Math.max(2, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div className="space-y-1.5">
      <div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="uppercase tracking-wider text-slate-500">Current</span>
          <span className="font-mono tabular-nums text-cyan-300">{format(current)}</span>
        </div>
        <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-800">
          <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: w(current) }} />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="uppercase tracking-wider text-slate-500">Target</span>
          <span className="font-mono tabular-nums text-emerald-300">{format(target)}</span>
        </div>
        <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-800">
          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: w(target) }} />
        </div>
      </div>
    </div>
  );
}

interface ZoneTarget {
  pue: number;
  wue: number;
}

function ZonePerfCard({ zone, target }: { zone: ZoneView; target: ZoneTarget | undefined }) {
  const t: ZoneTarget = target ?? { pue: zone.prediction.pue, wue: zone.prediction.wue };
  const itLoad = zone.telemetry.itLoadMw;
  // Adjustments derived from the PUE/WUE deltas: ΔPUE × IT load = accessory-power
  // change (MW); ΔWUE × IT load = water-flow change (L/min). Positive = the zone
  // sheds resource (red), negative = it gains (green).
  const dPower = itLoad * (zone.prediction.pue - t.pue);
  const dWater = itLoad * (1000 / 60) * (zone.prediction.wue - t.wue);
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
      <p className="text-sm font-semibold">{zone.name}</p>
      <div className="mt-3 space-y-3">
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">PUE</p>
          <CompareBars current={zone.prediction.pue} target={t.pue} min={0.7} max={1.3} format={(v) => v.toFixed(3)} />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">WUE (L/kWh)</p>
          <CompareBars current={zone.prediction.wue} target={t.wue} min={0} max={0.4} format={(v) => v.toFixed(3)} />
        </div>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3 text-xs">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Scenario adjustment</p>
        <p className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Zap className="h-3 w-3 text-amber-300" aria-hidden /> Power
          </span>
          <span className={`font-mono tabular-nums ${dPower >= 0 ? "text-red-300" : "text-emerald-300"}`}>
            {dPower >= 0 ? "−" : "+"}
            {Math.abs(dPower).toFixed(2)} MW
          </span>
        </p>
        <p className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Droplets className="h-3 w-3 text-cyan-300" aria-hidden /> Water
          </span>
          <span className={`font-mono tabular-nums ${dWater >= 0 ? "text-red-300" : "text-emerald-300"}`}>
            {dWater >= 0 ? "−" : "+"}
            {Math.abs(dWater).toFixed(0)} L/min
          </span>
        </p>
      </div>
    </div>
  );
}

function ZonePerformance({ zones, targets }: { zones: ZoneView[]; targets: Map<number, ZoneTarget> }) {
  return (
    <Panel
      title="Zone performance — current vs target"
      action={
        <div className="flex items-center gap-3 text-[10px] font-normal normal-case text-slate-400">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-cyan-500" aria-hidden /> Current
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" aria-hidden /> Target (Optimal)
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden /> Improvement
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {zones.map((z) => (
          <ZonePerfCard key={z.id} zone={z} target={targets.get(z.id)} />
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Target values are based on the best scenario out of 1,560 simulations per zone.
      </p>
    </Panel>
  );
}

function ShadowValidationCta({ onStart, starting }: { onStart: () => void; starting: boolean }) {
  const features = [
    { icon: Activity, cls: "bg-cyan-500/15 text-cyan-300", title: "No production impact", desc: "Run in parallel with live operations." },
    { icon: CheckCircle2, cls: "bg-cyan-500/15 text-cyan-300", title: "Compare & verify", desc: "Compare actual vs simulated results." },
    { icon: Gauge, cls: "bg-emerald-500/15 text-emerald-300", title: "Confidence score", desc: "Get confidence score before applying changes." },
    { icon: ShieldCheck, cls: "bg-emerald-500/15 text-emerald-300", title: "Safe to promote", desc: "Promote only when the scenario meets your criteria." },
  ];
  return (
    <Panel title="Next step — Shadow Validation">
      <p className="text-sm text-slate-400">
        Validate the recommended scenario in a risk-free environment using live digital twin data.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
            <span className={`inline-flex rounded-lg p-1.5 ${f.cls}`}>
              <f.icon className="h-4 w-4" aria-hidden />
            </span>
            <p className="mt-2 text-sm font-medium text-slate-200">{f.title}</p>
            <p className="mt-0.5 text-xs text-slate-400">{f.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden />
          {starting ? "Applying…" : "Start Shadow Validation"}
        </button>
      </div>
    </Panel>
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
  const [beta, setBeta] = useState(0.3);
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

  useEffect(() => {
    if (zoneId != null && liveView) {
      setItLoad(Number(liveView.telemetry.itLoadMw.toFixed(1)));
      setWetBulb(Number(liveView.telemetry.wetBulbC.toFixed(1)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, liveView?.telemetry.tick]);

  const baseline = useMemo(
    () =>
      predict(
        { itLoadMw: itLoad, wetBulbC: wetBulb, dryBulbC: wetBulb + 6 },
        liveView ? liveView.setpoints : FACTORY_SETPOINTS,
      ),
    [itLoad, wetBulb, liveView],
  );

  // Per-zone optimal targets, computed client-side from live telemetry. Drives
  // the Zone Performance "current vs target" comparison live as α/β change.
  const zoneTargets = useMemo(() => {
    const map = new Map<number, ZoneTarget>();
    for (const z of liveViews) {
      const r = runWhatIf({ alpha, beta, itLoadMw: z.telemetry.itLoadMw, wetBulbC: z.telemetry.wetBulbC });
      if (r.best) {
        map.set(z.id, { pue: r.best.pue, wue: r.best.wue });
      }
    }
    return map;
  }, [alpha, beta, liveViews]);

  const run = async () => {
    setRunning(true);
    try {
      const input =
        zoneId != null
          ? { alpha, beta, zoneId, itLoadMw: itLoad, wetBulbC: wetBulb }
          : { alpha, beta, itLoadMw: itLoad, wetBulbC: wetBulb };
      const data = await api.runWhatIf(input);
      setResult(data);
      toast(
        data.best
          ? `What-if complete: ${data.evaluated} permutations, best PUE ${data.best.pue.toFixed(4)}`
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
    const zid = zoneId ?? liveViews[0]?.id ?? 1;
    setStarting(true);
    try {
      if (zoneId != null && result?.best) {
        await api.applyShadow(zoneId, result.best.setpoints);
        toast("Best setpoints applied to shadow — validating.", "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Apply to shadow failed.", "error");
    } finally {
      setStarting(false);
      navigate({ to: "/shadow", search: { zone: zid } });
    }
  };

  const zoneNames = liveViews.map((z) => ({ id: z.id, name: z.name }));

  return (
    <div className="space-y-4">
      {/* 3. Page header */}
      <div>
        <h1 className="text-xl font-semibold">Optimization</h1>
        <p className="text-sm text-slate-400">
          What-if engine + per-zone control — minimize J = α·PUE + β·WUE under hard guardrails, slew limits, and a watchdog
        </p>
      </div>

      {/* 4–8. What-If Engine panel */}
      <Panel title="What-If engine — objective &amp; scenario">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left: scope + weights + objective + run */}
          <div className="space-y-4">
            <div role="tablist" aria-label="Scenario scope" className="flex flex-wrap gap-2">
              <button
                type="button"
                role="tab"
                aria-selected={zoneId === null}
                onClick={() => setZoneId(null)}
                className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  zoneId === null ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                Facility (all)
              </button>
              {zoneNames.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  role="tab"
                  aria-selected={zoneId === z.id}
                  onClick={() => setZoneId(z.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                    zoneId === z.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {z.name}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="alpha" className="flex justify-between text-sm text-slate-300">
                <span>Grid carbon weight α <span className="text-slate-400">(PUE priority)</span></span>
                <span className="font-mono text-cyan-300">{alpha.toFixed(2)}</span>
              </label>
              <input
                id="alpha"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={alpha}
                onChange={(e) => {
                  const a = Number(e.target.value);
                  setAlpha(a);
                  setBeta(Math.round((1 - a) * 100) / 100);
                }}
                className="mt-2 w-full accent-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              />
            </div>
            <div>
              <label htmlFor="beta" className="flex justify-between text-sm text-slate-300">
                <span>Water scarcity weight β <span className="text-slate-400">(WUE priority)</span></span>
                <span className="font-mono text-emerald-300">{beta.toFixed(2)}</span>
              </label>
              <input
                id="beta"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={beta}
                onChange={(e) => {
                  const b = Number(e.target.value);
                  setBeta(b);
                  setAlpha(Math.round((1 - b) * 100) / 100);
                }}
                className="mt-2 w-full accent-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              />
            </div>
            <p className="text-xs text-slate-400">
              {alpha >= beta
                ? "Objective: currently favors energy/carbon efficiency (PUE)."
                : "Objective: currently favors water conservation (WUE)."}
            </p>
            <button
              type="button"
              onClick={() => void run()}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-50"
            >
              <FlaskConical className="h-4 w-4" aria-hidden />
              {running ? "Evaluating permutations…" : "Run What-If"}
            </button>
          </div>

          {/* Right: scenario inputs */}
          <div className="space-y-4 md:border-l md:border-slate-700/60 md:pl-6">
            <div>
              <label htmlFor="itload" className="flex justify-between text-sm text-slate-300">
                <span>Scenario IT load</span>
                <span className="font-mono text-cyan-300">{itLoad.toFixed(1)} MW</span>
              </label>
              <input
                id="itload"
                type="range"
                min={2}
                max={12}
                step={0.2}
                value={itLoad}
                onChange={(e) => setItLoad(Number(e.target.value))}
                className="mt-2 w-full accent-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              />
            </div>
            <fieldset>
              <legend className="text-sm text-slate-300">Ambient condition (wet-bulb)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {WEATHER_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setWetBulb(p.wetBulbC)}
                    aria-pressed={wetBulb === p.wetBulbC}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                      wetBulb === p.wetBulbC
                        ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                        : "border-slate-700 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {p.label} · {p.wetBulbC}°C
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-slate-400">
              Baseline: PUE {baseline.pue.toFixed(4)} · WUE {baseline.wue.toFixed(3)} L/kWh
            </p>
          </div>
        </div>
      </Panel>

      {/* 9. Scenario summary */}
      <ScenarioSummary result={result} baseline={{ pue: baseline.pue, wue: baseline.wue }} alpha={alpha} beta={beta} />

      {/* 10. Recommended action */}
      <RecommendedAction
        result={result}
        baseline={{
          pue: baseline.pue,
          wue: baseline.wue,
          accessoryPowerMw: baseline.accessoryPowerMw,
          flowLpm: baseline.flowLpm,
        }}
      />

      {/* 11–14. Zone performance */}
      {liveViews.length ? (
        <ZonePerformance zones={liveViews} targets={zoneTargets} />
      ) : (
        <Panel title="Zone performance — current vs target">
          <p className="text-sm text-slate-400">Connecting to digital twin…</p>
        </Panel>
      )}

      {/* 15–17. Shadow validation CTA */}
      <ShadowValidationCta onStart={() => void startShadow()} starting={starting} />

      {/* 18. Bottom constraint statement */}
      <p className="py-2 text-center text-xs text-slate-500">
        All simulations respect guardrails, capacity limits, and slew-rate constraints.
      </p>

      {/* Run detail link + past runs (preserved functionality) */}
      {result ? (
        <p className="text-sm">
          <Link to="/optimize/$runId" params={{ runId: String(result.runId) }} className="text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
            View full analysis for run #{result.runId} →
          </Link>
        </p>
      ) : null}

      <Panel title="Past runs">
        {runsError ? (
          <ErrorState message={runsError} onRetry={() => void loadRuns()} />
        ) : runs.length === 0 ? (
          <EmptyState
            title="No what-if runs yet"
            body="Run your first counterfactual analysis to compare setpoint strategies."
          />
        ) : (
          <ul className="divide-y divide-slate-800">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  to="/optimize/$runId"
                  params={{ runId: String(r.id) }}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:bg-slate-800/40 focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <span className="font-mono text-cyan-300">
                    Run #{r.id} · {r.zoneId != null ? (zoneNames.find((z) => z.id === r.zoneId)?.name ?? `Zone ${r.zoneId}`) : "Facility"}
                  </span>
                  <span className="text-slate-400">
                    α {r.alpha.toFixed(2)} / β {r.beta.toFixed(2)} · {r.candidatesEvaluated} evaluated ·{" "}
                    {r.feasibleCount} feasible
                  </span>
                  <span className="font-mono text-slate-300">
                    {r.bestPue !== null ? `PUE ${r.bestPue.toFixed(4)} · WUE ${r.bestWue?.toFixed(3)}` : r.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export const optimizeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/optimize",
  component: OptimizationPage,
});
