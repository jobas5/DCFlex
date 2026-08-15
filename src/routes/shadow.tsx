import { createRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { CheckCircle2, Droplets, HeartPulse, Info, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LineChart } from "../components/LineChart";
import { useToast } from "../components/Toast";
import { Panel, StatusBadge, Stepper, Table, Td, Th } from "../components/ui";
import { api, type ControlResponse, type ControlZoneView, type ValidationResponse } from "../lib/api";
import { useSim } from "../lib/simContext";
import { CHART } from "../lib/tokens";
import { fmtTick } from "../lib/time";
import { GUARDRAILS, type Setpoints } from "../lib/twin/types";
import { rootRoute } from "./root";

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/* ------------------------------------------------------------------ */
/* Virtual Simulation — validation charts + metrics + readings          */
/* ------------------------------------------------------------------ */

function ValidationPanel({ zone }: { zone: ControlZoneView }) {
  const { data: live } = useSim();
  const [data, setData] = useState<ValidationResponse | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.getValidation(zone.id));
    } catch {
      /* ignore */
    }
  }, [zone.id]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);

  const liveZone = useMemo(() => live?.zones.find((z) => z.id === zone.id), [live, zone.id]);
  const waterBudgetPct = liveZone?.budgetUsage.waterPct ?? null;

  if (!data) {
    return <Panel title="1 — Virtual Simulation"><p className="text-sm text-slate-400">Loading validation…</p></Panel>;
  }

  const labels = data.samples.map((s) => fmtTick(s.tick));
  const last = data.samples[data.samples.length - 1];

  // --- Summary metrics ---
  const feasibleRate = data.feasibleRate;
  const meetsRate = data.meetsRate;
  const avgPueGap = data.avgPueGap;
  const budgetOkTotal = data.total ? `${data.budgetOk} / ${data.total}` : "—";
  const avgWueGap = data.total
    ? data.samples.reduce((s, x) => s + (x.predictedWue - zone.targets.wue), 0) / data.total
    : 0;
  const pueSeries = data.samples.map((s) => s.actualPue);
  const wueSeries = data.samples.map((s) => s.actualWue);

  const rows = showAll ? data.samples.slice().reverse() : data.samples.slice(-4).reverse();

  return (
    <Panel
      title="1 — Virtual Simulation"
      action={
        <span className="flex items-center gap-1.5 text-xs font-normal normal-case text-slate-500">
          <Info className="h-3.5 w-3.5" aria-hidden /> (Shadow mode)
        </span>
      }
    >
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 pb-3 text-xs text-slate-400">
        <StatusBadge tone={data.hasShadowConfig ? "good" : "warn"}>
          {data.hasShadowConfig ? "Running" : "No config"}
        </StatusBadge>
        <span className="font-mono tabular-nums">{data.total} samples · 7-day window</span>
      </div>

      {!data.hasShadowConfig ? (
        <p className="mt-4 text-sm text-slate-400">
          No shadow config set for this zone. Run What-If on the Optimization page, use the best setpoints, then apply to shadow.
        </p>
      ) : (
        <>
          {/* PUE / WUE trend charts */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-200">PUE — Current vs Target</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">PUE</p>
                </div>
                <div className="flex gap-4 text-xs">
                  <span>
                    <span className="mr-1 text-slate-500">Current</span>
                    <span className="font-mono text-cyan-300">{last ? last.actualPue.toFixed(3) : "—"}</span>
                  </span>
                  <span>
                    <span className="mr-1 text-slate-500">Target</span>
                    <span className="font-mono text-emerald-300">{zone.targets.pue.toFixed(3)}</span>
                  </span>
                </div>
              </div>
              <LineChart
                ariaLabel="Actual PUE against the target over the validation window"
                labels={labels}
                series={[{ label: "Actual PUE", color: CHART.cyan, values: pueSeries }]}
                yFormat={(v) => v.toFixed(3)}
                threshold={{ value: zone.targets.pue, label: `target ${zone.targets.pue.toFixed(3)}`, color: "#34d399" }}
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-200">WUE — Current vs Target (L/kWh)</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">WUE</p>
                </div>
                <div className="flex gap-4 text-xs">
                  <span>
                    <span className="mr-1 text-slate-500">Current</span>
                    <span className="font-mono text-cyan-300">{last ? last.actualWue.toFixed(3) : "—"}</span>
                  </span>
                  <span>
                    <span className="mr-1 text-slate-500">Target</span>
                    <span className="font-mono text-emerald-300">{zone.targets.wue.toFixed(3)}</span>
                  </span>
                </div>
              </div>
              <LineChart
                ariaLabel="Actual WUE against the target over the validation window"
                labels={labels}
                series={[{ label: "Actual WUE", color: CHART.emerald, values: wueSeries }]}
                yFormat={(v) => v.toFixed(3)}
                threshold={{ value: zone.targets.wue, label: `target ${zone.targets.wue.toFixed(3)}`, color: "#34d399" }}
              />
            </div>
          </div>

          {/* Summary metrics */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-cyan-300">
                <Zap className="h-3.5 w-3.5" aria-hidden /> PUE
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <SummaryStat label="Feasible" value={`${Math.round(feasibleRate * 100)}%`} good />
                <SummaryStat label="Meet target ±0.02" value={`${Math.round(meetsRate * 100)}%`} good={meetsRate >= 0.9} />
                <SummaryStat label="Avg PUE gap" value={avgPueGap.toFixed(3)} good={avgPueGap <= 0} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-emerald-300">
                <Droplets className="h-3.5 w-3.5" aria-hidden /> WUE
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <SummaryStat label="In budget" value={budgetOkTotal} good={data.total > 0 && data.budgetOk === data.total} />
                <SummaryStat label="Avg WUE gap" value={`${avgWueGap.toFixed(3)} L/kWh`} good={avgWueGap <= 0} />
                <SummaryStat
                  label="Water budget"
                  value={waterBudgetPct !== null ? `${Math.round(waterBudgetPct)}%` : "—"}
                  good={waterBudgetPct !== null && waterBudgetPct <= 100}
                />
              </div>
            </div>
          </div>

          {/* Latest readings */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-300">Latest readings</p>
            <Table>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th right>Pred PUE</Th>
                  <Th right>Actual PUE</Th>
                  <Th right>Pred WUE</Th>
                  <Th right>Actual WUE</Th>
                  <Th right>Chip</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.tick} className="border-b border-slate-800/60">
                    <Td className="font-mono text-xs">{fmtTick(s.tick)}</Td>
                    <Td right className="text-xs text-sev-info">{s.predictedPue.toFixed(4)}</Td>
                    <Td right className="text-xs">{s.actualPue.toFixed(4)}</Td>
                    <Td right className="text-xs text-sev-ok">{s.predictedWue.toFixed(3)}</Td>
                    <Td right className="text-xs">{s.actualWue.toFixed(3)}</Td>
                    <Td right className="text-xs">{s.chipTempC.toFixed(1)}°C</Td>
                    <Td className="text-xs">
                      <StatusBadge tone={s.feasible ? "good" : "bad"}>{s.feasible ? "feasible" : "violation"}</StatusBadge>
                      {s.meetsTarget ? (
                        <span className="ml-1 text-sev-ok">· on target</span>
                      ) : (
                        <span className="ml-1 text-sev-warn">· off target</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-xs text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                {showAll ? "Collapse ↑" : "View full data ↓"}
              </button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function SummaryStat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 font-mono text-sm tabular-nums ${good ? "text-emerald-300" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Closed-loop (Real) — live engine status                              */
/* ------------------------------------------------------------------ */

function LoopStat({ label, value, ok, icon }: { label: string; value: string; ok?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className={`mt-0.5 font-mono text-base tabular-nums ${ok === undefined ? "text-slate-100" : ok ? "text-emerald-300" : "text-red-300"}`}>
        {value}
        {ok !== undefined ? <span className="ml-1.5 text-xs">{ok ? "in bounds" : "OUT"}</span> : null}
      </dd>
    </div>
  );
}

function RealEnginePanel({ zone }: { zone: ControlZoneView }) {
  const { data: live } = useSim();
  const liveZone = useMemo(() => live?.zones.find((z) => z.id === zone.id), [live, zone.id]);

  const sp = zone.effectiveSetpoints;
  const t = liveZone?.telemetry;
  const p = liveZone?.prediction;

  return (
    <Panel
      id="real-engine"
      title="1 — Closed-loop"
      action={
        <span className="flex items-center gap-1.5 text-xs font-normal normal-case text-slate-500">
          <Info className="h-3.5 w-3.5" aria-hidden /> (Real engine)
        </span>
      }
    >
      {/* Operating status */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 pb-3 text-xs text-slate-400">
        <StatusBadge tone={zone.mode === "closed_loop" ? "good" : "info"}>
          {zone.mode === "closed_loop" ? "Closed-loop (Phase B)" : "Shadow (Phase A)"}
        </StatusBadge>
        <span className="flex items-center gap-1.5">
          <HeartPulse className={`h-3.5 w-3.5 ${zone.failSafeActive ? "text-red-400" : "text-emerald-400"}`} aria-hidden />
          {zone.failSafeActive ? (
            <span className="font-medium text-red-300">FAIL-SAFE ACTIVE</span>
          ) : (
            <span className="text-emerald-300">{zone.commsOk ? "Comms OK" : "Comms lost"}</span>
          )}
        </span>
        <span className="font-mono tabular-nums">
          Heartbeat {zone.heartbeatAgeSec !== null ? `${zone.heartbeatAgeSec}s ago` : "never"} · fail-safe at {zone.watchdogTimeoutSec}s
        </span>
      </div>

      {/* Live telemetry */}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <LoopStat label="Supply" value={t ? `${t.cduSupplyC.toFixed(1)}°C` : "—"} />
        <LoopStat label="Return" value={t ? `${t.cduReturnC.toFixed(1)}°C` : "—"} />
        <LoopStat
          label="ΔP"
          value={p ? `${p.deltaPKpa.toFixed(0)} kPa` : "—"}
          ok={p ? p.deltaPKpa >= GUARDRAILS.deltaPMinKpa && p.deltaPKpa <= GUARDRAILS.deltaPMaxKpa : undefined}
        />
        <LoopStat
          label="Flow"
          value={p ? `${p.flowLpm} L/min` : "—"}
          ok={p ? p.flowLpm >= GUARDRAILS.flowMinLpm && p.flowLpm <= GUARDRAILS.flowMaxLpm : undefined}
        />
        <LoopStat label="Chip temp" value={p ? `${p.chipTempC.toFixed(1)}°C` : "—"} />
        <LoopStat label="Margin" value={p ? `${p.thermalMarginC.toFixed(1)}°C` : "—"} ok={p ? p.thermalMarginC >= 5 : undefined} />
      </dl>

      {/* Effective setpoints being applied */}
      <p className="mt-4 text-xs text-slate-400">
        Applying setpoints: supply <span className="font-mono text-slate-200">{sp.coolantSupplyC}°C</span> · pump{" "}
        <span className="font-mono text-slate-200">{sp.pumpSpeedPct}%</span> · valve{" "}
        <span className="font-mono text-slate-200">{sp.valvePosPct}%</span> · CDU{" "}
        <span className="font-mono text-slate-200">{sp.cduSetpointC}°C</span>
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Setpoint control — Auto (what-if target) / Manual (editable)         */
/* ------------------------------------------------------------------ */

const SETPOINT_DEFS = [
  { key: "coolantSupplyC", label: "Coolant Supply Temp", unit: "°C", min: 16, max: 34, step: 0.5, rate: (s: ControlZoneView) => `${s.slewLimits.maxTempStepC} °C / step` },
  { key: "pumpSpeedPct", label: "Pump Speed", unit: "%", min: 40, max: 100, step: 1, rate: (s: ControlZoneView) => `${s.slewLimits.maxPumpStepPct} % / step` },
  { key: "valvePosPct", label: "Bypass Valve Position", unit: "%", min: 30, max: 100, step: 1, rate: (s: ControlZoneView) => `${s.slewLimits.maxValveStepPct} % / step` },
  { key: "cduSetpointC", label: "CDU Supply Temp", unit: "°C", min: 16, max: 34, step: 0.5, rate: (s: ControlZoneView) => `${s.slewLimits.maxTempStepC} °C / step` },
] as const;

function SetpointCard({
  label,
  unit,
  current,
  target,
  min,
  max,
  step,
  rate,
  editable,
  status,
  onChange,
}: {
  label: string;
  unit: string;
  current: number;
  target: number;
  min: number;
  max: number;
  step: number;
  rate: string;
  editable: boolean;
  status: "Tracking" | "Manual" | "Idle";
  onChange: (v: number) => void;
}) {
  const pct = (v: number) => `${(clamp01((v - min) / (max - min)) * 100).toFixed(1)}%`;
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <StatusBadge tone={status === "Tracking" ? "good" : status === "Manual" ? "info" : "muted"}>{status}</StatusBadge>
      </div>
      <div className="mt-2 flex items-baseline gap-4 text-sm">
        <span>
          <span className="mr-1 text-[10px] uppercase text-slate-500">Current</span>
          <span className="font-mono tabular-nums text-cyan-300">
            {current.toFixed(1)}
            <span className="ml-0.5 text-xs text-slate-500">{unit}</span>
          </span>
        </span>
        <span>
          <span className="mr-1 text-[10px] uppercase text-slate-500">Target</span>
          <span className="font-mono tabular-nums text-slate-200">
            {target.toFixed(1)}
            <span className="ml-0.5 text-xs text-slate-500">{unit}</span>
          </span>
        </span>
      </div>
      {editable ? (
        <div className="relative mt-3">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={target}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={`${label} target`}
            className="w-full accent-emerald-400 focus-visible:outline-2 focus-visible:outline-cyan-400"
          />
          <span
            className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-cyan-400 ring-2 ring-slate-900"
            style={{ left: `calc(${pct(current)} * (100% - 1rem) + 0.5rem)` }}
            title={`current ${current.toFixed(1)}`}
            aria-hidden
          />
        </div>
      ) : (
        <div className="relative mt-3 h-1.5 rounded-full bg-slate-800">
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-emerald-400 ring-2 ring-slate-900"
            style={{ left: pct(target) }}
            title={`target ${target.toFixed(1)}`}
            aria-hidden
          />
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-cyan-400 ring-2 ring-slate-900"
            style={{ left: pct(current) }}
            title={`current ${current.toFixed(1)}`}
            aria-hidden
          />
        </div>
      )}
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>{min.toFixed(0)}</span>
        <span>{max.toFixed(0)}</span>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Rate limit <span className="font-mono text-slate-400">{rate}</span>
      </p>
    </div>
  );
}

function SetpointControl({ zone, onApplied }: { zone: ControlZoneView; onApplied: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [draft, setDraft] = useState<Setpoints>(zone.shadowSetpoints ?? zone.currentSetpoints);
  const [applying, setApplying] = useState(false);

  // Seed the draft + reset to Auto only on a real change: a different zone, or a
  // genuinely new what-if recommendation (shadowSetpoints value change). The
  // control state is polled every 5s, so depending on the raw object refs here
  // would reset the mode back to Auto and wipe manual edits.
  const shadowKey = JSON.stringify(zone.shadowSetpoints ?? null);

  useEffect(() => {
    setDraft(zone.shadowSetpoints ?? zone.currentSetpoints);
    setMode("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.id, shadowKey]);

  const editable = mode === "manual";
  const tracking = zone.shadowSetpoints != null;

  const apply = async () => {
    setApplying(true);
    try {
      if (zone.mode === "shadow") {
        await api.applyShadow(zone.id, draft);
        toast("Applied to shadow — validating.", "success");
      } else {
        const res = await api.applySetpoints(zone.id, draft, "Manual setpoint change");
        toast(
          res.kind === "applied" ? `Applied.${res.slewLimited ? " Slew-rate limit clamped the jump." : ""}` : "Shadow mode: would-be action logged.",
          res.kind === "applied" ? "success" : "info",
        );
      }
      onApplied();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Apply failed.", "error");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Panel
      title="2 — Setpoint Control"
      action={
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-normal normal-case text-slate-500">
            <Info className="h-3.5 w-3.5" aria-hidden /> (Slew limited)
          </span>
          <div className="flex items-center gap-1" role="tablist" aria-label="Control mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "auto"}
              onClick={() => setMode("auto")}
              className={`rounded-md border px-2 py-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                mode === "auto"
                  ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              Auto (Recommended)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "manual"}
              onClick={() => setMode("manual")}
              className={`rounded-md border px-2 py-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                mode === "manual"
                  ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              Manual
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SETPOINT_DEFS.map((d) => (
          <SetpointCard
            key={d.key}
            label={d.label}
            unit={d.unit}
            current={zone.currentSetpoints[d.key]}
            target={draft[d.key]}
            min={d.min}
            max={d.max}
            step={d.step}
            rate={d.rate(zone)}
            editable={editable}
            status={editable ? "Manual" : tracking ? "Tracking" : "Idle"}
            onChange={(v) => setDraft((prev) => ({ ...prev, [d.key]: v }))}
          />
        ))}
      </div>
      {editable ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void apply()}
            disabled={applying}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
          >
            {applying ? "Applying…" : "Apply setpoints"}
          </button>
          <p className="text-xs text-slate-400">
            Slew-rate limits and guardrails still apply. Validation re-runs after a manual change.
          </p>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-400" aria-hidden /> Current
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden /> Target
        </span>
        <span className="flex items-center gap-1.5">Dotted line = auto trajectory (slew limited)</span>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Validation gate                                                     */
/* ------------------------------------------------------------------ */

function Criteria({ ok, title, desc }: { ok: boolean; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-emerald-400" : "text-slate-600"}`} aria-hidden />
      <div>
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

function ShadowPage() {
  const navigate = useNavigate();
  const { zone: zoneId } = useSearch({ from: "/shadow" });
  const [control, setControl] = useState<ControlResponse | null>(null);
  const [view, setView] = useState<"virtual" | "real">("virtual");

  const refresh = useCallback(async () => {
    try {
      setControl(await api.getControl());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const zone: ControlZoneView | undefined = control?.zones.find((z) => z.id === zoneId);

  const steps: { label: string; state: "done" | "active" | "pending" }[] = zone
    ? [
        { label: "Analyze", state: "done" },
        { label: "Shadow", state: zone.shadowSetpoints ? "done" : "active" },
        { label: "Validate", state: zone.shadowSetpoints ? "active" : "pending" },
        { label: "Closed-loop", state: zone.mode === "closed_loop" ? "done" : "pending" },
      ]
    : [];

  const validated = zone != null && zone.shadowSetpoints != null;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold">Shadow Validation</h1>
        <p className="text-sm text-slate-400">Validate a recommended scenario before enabling closed-loop control</p>
      </div>

      {/* Workflow stepper */}
      {steps.length ? <Stepper steps={steps} /> : null}

      {/* Zone selector + simulation mode */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Zones" className="flex flex-wrap gap-2">
          {(control?.zones ?? []).map((z) => (
            <button
              key={z.id}
              type="button"
              role="tab"
              aria-selected={zoneId === z.id}
              onClick={() => navigate({ to: "/shadow", search: { zone: z.id }, replace: true })}
              className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                zoneId === z.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {z.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="tablist" aria-label="Simulation mode">
          <button
            type="button"
            role="tab"
            aria-selected={view === "virtual"}
            onClick={() => setView("virtual")}
            className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              view === "virtual" ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            Virtual Simulation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "real"}
            onClick={() => setView("real")}
            className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              view === "real" ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            Closed-loop (Real)
          </button>
        </div>
      </div>

      {/* 1 — Virtual simulation OR real engine */}
      {zone ? view === "virtual" ? <ValidationPanel zone={zone} /> : <RealEnginePanel zone={zone} /> : null}

      {/* 2 — Setpoint control (auto from what-if, manual editable) */}
      {zone ? <SetpointControl zone={zone} onApplied={() => void refresh()} /> : null}

      {/* Validation gate — only in Virtual Simulation view */}
      {zone && view === "virtual" ? (
        <Panel
          title="Validation Gate"
          action={<StatusBadge tone={validated ? "good" : "warn"}>{validated ? "Passed" : "Pending"}</StatusBadge>}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              Validation ensures the scenario is safe and effective before enabling closed-loop.
            </p>
            <button
              type="button"
              onClick={() => {
                setView("real");
                document.getElementById("real-engine")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              disabled={!validated}
              className="rounded-lg border border-cyan-500/50 px-3 py-1.5 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40"
            >
              Proceed to Closed-loop
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Criteria ok={validated} title="PUE Target" desc="Within ±0.02" />
            <Criteria ok={validated} title="WUE Target" desc="Within budget" />
            <Criteria ok={zone.commsOk} title="System Constraints" desc="All within limits" />
            <Criteria ok={validated && !zone.slewLimited} title="Stability" desc="No oscillation detected" />
          </div>
        </Panel>
      ) : null}

      {/* Safety footer */}
      <p className="py-2 text-center text-xs text-slate-500">
        All simulations respect guardrails, capacity limits, and slew-rate constraints.
      </p>
    </div>
  );
}

export const shadowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shadow",
  validateSearch: (search: Record<string, unknown>) => ({
    zone: typeof search.zone === "number" ? search.zone : 1,
  }),
  component: ShadowPage,
});
