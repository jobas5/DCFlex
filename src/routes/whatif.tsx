import { createRoute, Link } from "@tanstack/react-router";
import {
  FlaskConical,
  HeartPulse,
  Pause,
  Play,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LineChart } from "../components/LineChart";
import { SetpointSliders } from "../components/SetpointSliders";
import { useToast } from "../components/Toast";
import { EmptyState, ErrorState, Panel, StatusBadge } from "../components/ui";
import {
  api,
  type ControlResponse,
  type ControlZoneView,
  type ValidationResponse,
  type WhatIfResponse,
  type WhatIfRunListItem,
} from "../lib/api";
import { predict } from "../lib/twin/surrogate";
import { FACTORY_SETPOINTS, type Setpoints, type WhatIfCandidate, type ZoneView } from "../lib/twin/types";
import { rootRoute } from "./root";

export const WEATHER_PRESETS = [
  { id: "cool", label: "Cool", wetBulbC: 10 },
  { id: "mild", label: "Mild", wetBulbC: 18 },
  { id: "hot", label: "Hot & humid", wetBulbC: 26 },
] as const;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const kindBadge = (kind: string) =>
  kind === "applied" ? (
    <StatusBadge tone="good">applied</StatusBadge>
  ) : kind === "fail_safe" ? (
    <StatusBadge tone="bad">fail-safe</StatusBadge>
  ) : (
    <StatusBadge tone="info">would-be</StatusBadge>
  );

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

function ZoneControl({ zone, data, draft, setDraft, onRefresh, onApplied, dirty }: {
  zone: ControlZoneView;
  data: ControlResponse;
  draft: Setpoints;
  setDraft: (s: Setpoints) => void;
  onRefresh: () => void;
  onApplied: (applied: Setpoints) => void;
  dirty: boolean;
}) {
  const toast = useToast();

  useEffect(() => {
    const id = setInterval(() => {
      onRefresh();
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = async (mode: "shadow" | "closed_loop") => {
    try {
      await api.setControlMode(zone.id, mode);
      toast(mode === "closed_loop" ? `${zone.name}: closed-loop enabled.` : `${zone.name}: shadow mode.`, "success");
      onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Mode change failed.", "error");
    }
  };

  const apply = async () => {
    try {
      if (zone.mode === "shadow") {
        const res = await api.applyShadow(zone.id, draft);
        toast("Applied to shadow — now monitoring.", "success");
        onApplied(res.shadowSetpoints);
      } else {
        const res = await api.applySetpoints(zone.id, draft, "Operator manual setpoint change");
        toast(
          res.kind === "applied" ? `Applied.${res.slewLimited ? " Slew-rate limit clamped the jump." : ""}` : "Shadow mode: would-be action logged.",
          res.kind === "applied" ? "success" : "info",
        );
        onApplied(res.applied);
      }
      onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Apply failed.", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title={`${zone.name} — operating mode & watchdog`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-300">Mode:</span>
            <StatusBadge tone={zone.mode === "closed_loop" ? "good" : "info"}>
              {zone.mode === "closed_loop" ? "Closed-loop (Phase B)" : "Shadow (Phase A)"}
            </StatusBadge>
            <button
              type="button"
              onClick={() => void switchMode(zone.mode === "shadow" ? "closed_loop" : "shadow")}
              className="rounded-lg border border-cyan-500/50 px-3 py-1.5 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              Switch to {zone.mode === "shadow" ? "closed-loop" : "shadow"}
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <HeartPulse className={`h-4 w-4 ${zone.failSafeActive ? "text-red-400" : "text-emerald-400"}`} aria-hidden />
              <span className="text-sm font-medium text-slate-200">Heartbeat watchdog</span>
              {zone.failSafeActive ? (
                <StatusBadge tone="bad">
                  <ShieldAlert className="h-3 w-3" aria-hidden /> FAIL-SAFE ACTIVE
                </StatusBadge>
              ) : (
                <StatusBadge tone="good">
                  <ShieldCheck className="h-3 w-3" aria-hidden /> Comms OK
                </StatusBadge>
              )}
            </div>
            <p className="mt-2 font-mono text-sm text-slate-300">
              Last heartbeat: {zone.heartbeatAgeSec !== null ? `${zone.heartbeatAgeSec}s ago` : "never"} · fail-safe at{" "}
              {zone.watchdogTimeoutSec}s
            </p>
          </div>
        </Panel>

        <Panel title={`${zone.name} — setpoint control (slew-limited)`} id="setpoint-panel">
          <SetpointSliders value={draft} onChange={setDraft} />
          <p className="mt-3 text-xs text-slate-400">
            Slew limits: ≤{zone.slewLimits.maxTempStepC}°C temp, ≤{zone.slewLimits.maxPumpStepPct}% pump, ≤
            {zone.slewLimits.maxValveStepPct}% valve per action.
            {zone.slewLimited ? <span className="ml-1 text-amber-300">Last action was slew-clamped.</span> : null}
          </p>
          <button
            type="button"
            onClick={() => void apply()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Apply setpoints
          </button>
          {dirty ? (
            <p className="mt-2 text-xs text-amber-300">Unsaved changes — click Apply setpoints to save.</p>
          ) : null}
          {zone.mode === "shadow" ? (
            <p className="mt-2 text-xs text-slate-500">Shadow mode: config is monitored against live data; nothing written to the CDU.</p>
          ) : null}
        </Panel>
      </div>

      <Panel title="Control action log">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Zone</th>
                <th className="px-2 py-2">Kind</th>
                <th className="px-2 py-2">Setpoints</th>
                <th className="px-2 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.actions.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/60 align-top">
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-400">{fmtTime(a.createdAt)}</td>
                  <td className="px-2 py-2 text-xs text-slate-400">{data.zones.find((z) => z.id === a.clusterId)?.name ?? a.clusterId}</td>
                  <td className="px-2 py-2">{kindBadge(a.kind)}</td>
                  <td className="px-2 py-2 font-mono text-xs">
                    {a.setpoints.coolantSupplyC}°C · {a.setpoints.pumpSpeedPct}% · {a.setpoints.valvePosPct}% · CDU{" "}
                    {a.setpoints.cduSetpointC}°C
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-300">{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function ShadowValidation({ zoneId, targets }: { zoneId: number; targets: { pue: number; wue: number } }) {
  const [data, setData] = useState<ValidationResponse | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.getValidation(zoneId));
    } catch {
      /* ignore */
    }
  }, [zoneId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);

  if (!data) return null;

  const labels = data.samples.map((s) => `#${s.tick}`);
  const recent = data.samples.slice(-30).reverse();

  return (
    <Panel title="Shadow validation">
      {!data.hasShadowConfig ? (
        <p className="text-sm text-slate-400">
          No shadow config set. Run What-If and "Use best setpoints", then click "Apply setpoints" to start validating a fixed configuration.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={data.ready ? "good" : "warn"}>
              {data.ready ? "Ready for closed-loop" : "Not ready yet"}
            </StatusBadge>
            <span className="text-xs text-slate-400">{data.total} samples · 7-day window</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-xs text-slate-400">Feasible</p>
              <p className="mt-0.5 font-mono text-base tabular-nums">{Math.round(data.feasibleRate * 100)}%</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-xs text-slate-400">Meet target ±0.02</p>
              <p className="mt-0.5 font-mono text-base tabular-nums">{Math.round(data.meetsRate * 100)}%</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-xs text-slate-400">In budget</p>
              <p className="mt-0.5 font-mono text-base tabular-nums">{data.budgetOk}/{data.total}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-xs text-slate-400">Avg PUE gap</p>
              <p className="mt-0.5 font-mono text-base tabular-nums">{data.avgPueGap.toFixed(4)}</p>
            </div>
          </div>

          {data.samples.length > 1 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <LineChart
                  ariaLabel="Shadow config predicted vs actual PUE over the validation window"
                  labels={labels}
                  series={[
                    { label: "Predicted PUE", color: "#22d3ee", values: data.samples.map((s) => s.predictedPue) },
                    { label: "Actual PUE", color: "#94a3b8", values: data.samples.map((s) => s.actualPue) },
                  ]}
                  yFormat={(v) => v.toFixed(3)}
                  threshold={{ value: targets.pue, label: `target ${targets.pue.toFixed(3)}`, color: "#f87171" }}
                  band={{ lo: targets.pue - 0.02, hi: targets.pue + 0.02, color: "#22d3ee" }}
                />
              </div>
              <div>
                <LineChart
                  ariaLabel="Shadow config predicted WUE over the validation window"
                  labels={labels}
                  series={[{ label: "Predicted WUE", color: "#34d399", values: data.samples.map((s) => s.predictedWue) }]}
                  yFormat={(v) => v.toFixed(2)}
                  threshold={{ value: targets.wue, label: `target ${targets.wue.toFixed(3)}`, color: "#f87171" }}
                  band={{ lo: targets.wue - 0.02, hi: targets.wue + 0.02, color: "#34d399" }}
                />
              </div>
            </div>
          ) : null}

          {recent.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-1 pr-2">Tick</th>
                    <th className="py-1 pr-2">Pred PUE</th>
                    <th className="py-1 pr-2">Actual PUE</th>
                    <th className="py-1 pr-2">Pred WUE</th>
                    <th className="py-1 pr-2">Chip</th>
                    <th className="py-1 pr-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => (
                    <tr key={s.tick} className="border-b border-slate-800/60">
                      <td className="py-1 pr-2 font-mono">{s.tick}</td>
                      <td className="py-1 pr-2 font-mono text-cyan-300">{s.predictedPue.toFixed(4)}</td>
                      <td className="py-1 pr-2 font-mono">{s.actualPue.toFixed(4)}</td>
                      <td className="py-1 pr-2 font-mono text-emerald-300">{s.predictedWue.toFixed(3)}</td>
                      <td className="py-1 pr-2 font-mono">{s.chipTempC.toFixed(1)}°C</td>
                      <td className="py-1 pr-2">
                        {s.feasible ? <StatusBadge tone="good">feasible</StatusBadge> : <StatusBadge tone="bad">violation</StatusBadge>}
                        {!s.budgetOk ? <span className="ml-1 text-amber-300">· over budget</span> : null}
                        {!s.meetsTarget ? <span className="ml-1 text-amber-300">· off target</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function WhatIfPage() {
  const toast = useToast();
  const [alpha, setAlpha] = useState(0.7);
  const [beta, setBeta] = useState(0.3);
  const [itLoad, setItLoad] = useState(6.4);
  const [wetBulb, setWetBulb] = useState(18);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [useLive, setUseLive] = useState(true);
  const [liveViews, setLiveViews] = useState<ZoneView[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [runs, setRuns] = useState<WhatIfRunListItem[]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);

  // Per-zone control state
  const [control, setControl] = useState<ControlResponse | null>(null);
  const [draft, setDraft] = useState<Setpoints>(FACTORY_SETPOINTS);
  const [dirty, setDirty] = useState(false);
  const [simRunning, setSimRunning] = useState(false);

  const updateDraft = useCallback((s: Setpoints) => {
    setDraft(s);
    setDirty(true);
  }, []);

  const handleApplied = useCallback((applied: Setpoints) => {
    setDraft(applied);
    setDirty(false);
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const data = await api.listWhatIfRuns();
      setRuns(data.runs);
      setRunsError(null);
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : "Failed to load runs.");
    }
  }, []);

  const refreshControl = useCallback(async () => {
    try {
      setControl(await api.getControl());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadRuns();
    void refreshControl();
    api.telemetryCurrent()
      .then((r) => setLiveViews(r.zones))
      .catch(() => {});
  }, [loadRuns, refreshControl]);

  useEffect(() => {
    if (!simRunning) return;
    const id = setInterval(async () => {
      try {
        await api.telemetryTick();
        await refreshControl();
        const r = await api.telemetryCurrent();
        setLiveViews(r.zones);
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [simRunning, refreshControl]);

  const liveView = liveViews.find((z) => z.id === zoneId) ?? null;

  useEffect(() => {
    if (zoneId != null && liveView) {
      setItLoad(Number(liveView.telemetry.itLoadMw.toFixed(1)));
      setWetBulb(Number(liveView.telemetry.wetBulbC.toFixed(1)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, liveView?.telemetry.tick]);

  const baseline = liveView
    ? predict({ itLoadMw: itLoad, wetBulbC: wetBulb, dryBulbC: wetBulb + 6 }, liveView.setpoints)
    : predict({ itLoadMw: itLoad, wetBulbC: wetBulb, dryBulbC: wetBulb + 6 }, FACTORY_SETPOINTS);

  const run = async () => {
    setRunning(true);
    try {
      const input = zoneId != null
        ? useLive
          ? { alpha, beta, zoneId }
          : { alpha, beta, zoneId, itLoadMw: itLoad, wetBulbC: wetBulb }
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

  const controlZone: ControlZoneView | undefined = control?.zones.find((z) => z.id === zoneId);

  useEffect(() => {
    setDirty(false);
  }, [zoneId]);

  useEffect(() => {
    if (!controlZone || dirty) return;
    const src =
      controlZone.mode === "shadow" && controlZone.shadowSetpoints
        ? controlZone.shadowSetpoints
        : controlZone.currentSetpoints;
    setDraft(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, controlZone?.updatedAt, controlZone?.mode, dirty]);

  const zoneNames = liveViews.map((z) => ({ id: z.id, name: z.name }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Control Loop</h1>
          <p className="text-sm text-slate-400">
            What-If engine + per-zone control · minimize J = α·PUE + β·WUE under hard guardrails, slew limits, and a watchdog
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSimRunning((v) => !v)}
          aria-pressed={simRunning}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-cyan-400 ${
            simRunning ? "border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10" : "border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
          }`}
        >
          {simRunning ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {simRunning ? "Pause simulation" : "Play simulation"}
        </button>
      </div>

      <Panel title="What-If engine — objective & scenario">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setZoneId(null)}
            aria-pressed={zoneId === null}
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
              onClick={() => setZoneId(z.id)}
              aria-pressed={zoneId === z.id}
              className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                zoneId === z.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {z.name}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="alpha" className="flex justify-between text-sm text-slate-300">
                <span>Grid carbon weight α <span className="text-slate-500">(PUE priority)</span></span>
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
                <span>Water scarcity weight β <span className="text-slate-500">(WUE priority)</span></span>
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
                ? "Objective currently favors energy/carbon efficiency (PUE)."
                : "Objective currently favors water conservation (WUE)."}
            </p>
          </div>

          <div className="space-y-4">
            {zoneId != null ? (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={useLive}
                  onChange={(e) => setUseLive(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Use live conditions ({liveView ? `load ${liveView.telemetry.itLoadMw.toFixed(1)} MW · wet-bulb ${liveView.telemetry.wetBulbC.toFixed(1)}°C` : "loading…"})
              </label>
            ) : null}
            {zoneId === null || !useLive ? (
              <>
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
              </>
            ) : null}
            <p className="text-xs text-slate-400">
              Baseline: PUE {baseline.pue.toFixed(4)} · WUE {baseline.wue.toFixed(3)} L/kWh
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" aria-hidden />
          {running ? "Evaluating permutations…" : "Run What-If"}
        </button>
      </Panel>

      {result ? (
        <WhatIfResults
          result={result}
          baseline={{ pue: baseline.pue, wue: baseline.wue }}
          onUseBest={(sp) => {
            setDraft(sp);
            setDirty(true);
            document.getElementById("setpoint-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      ) : null}

      {controlZone ? (
        <ZoneControl zone={controlZone} data={control ?? { zones: [], actions: [] }} draft={draft} setDraft={updateDraft} onRefresh={() => void refreshControl()} onApplied={handleApplied} dirty={dirty} />
      ) : null}

      {controlZone ? <ShadowValidation zoneId={controlZone.id} targets={controlZone.targets} /> : null}

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
                  to="/whatif/$runId"
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

export const whatifRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/whatif",
  component: WhatIfPage,
});
