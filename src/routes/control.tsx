import { createRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  FlaskConical,
  HeartPulse,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Unplug,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SetpointSliders } from "../components/SetpointSliders";
import { useToast } from "../components/Toast";
import { ErrorState, Panel, StatusBadge } from "../components/ui";
import {
  api,
  type ControlResponse,
  type ControlZoneView,
  type FacilityConfigResponse,
  type TransferListItem,
  type TransferResponse,
  type ZoneConfigResponse,
} from "../lib/api";
import { FACTORY_SETPOINTS, type Setpoints } from "../lib/twin/types";
import { rootRoute } from "./root";

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

function SandboxPanel({ zoneId }: { zoneId: number }) {
  const toast = useToast();
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.optimizeZone>> | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setResult(await api.optimizeZone(zoneId));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Sandbox failed.", "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Panel title="Sandbox — best setpoints for this zone">
      <p className="text-sm text-slate-400">
        Runs the 1,560-permutation grid on this zone's live conditions. Nothing is applied.
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
      >
        <FlaskConical className="h-4 w-4" aria-hidden />
        {running ? "Evaluating…" : "Run sandbox"}
      </button>
      {result?.best ? (
        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-3 text-sm">
          <p className="font-mono text-slate-200">
            Best: supply {result.best.setpoints.coolantSupplyC}°C · pump {result.best.setpoints.pumpSpeedPct}% · valve{" "}
            {result.best.setpoints.valvePosPct}%
          </p>
          <p className="mt-1 text-slate-300">
            PUE {result.best.pue.toFixed(4)} · WUE {result.best.wue.toFixed(3)} · {result.feasibleCount} feasible
          </p>
          <p className="mt-1 text-xs text-slate-400">
            vs baseline PUE {result.baseline.pue.toFixed(4)} · WUE {result.baseline.wue.toFixed(3)}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

function MasterDataPanel({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const [zones, setZones] = useState<ZoneConfigResponse[]>([]);
  const [facility, setFacility] = useState<FacilityConfigResponse | null>(null);
  const [selectedId, setSelectedId] = useState(1);
  const [draft, setDraft] = useState<{ targetPue: number; targetWue: number; waterBudgetLpm: number; powerBudgetMw: number } | null>(null);
  const [facilityDraft, setFacilityDraft] = useState<{ totalWaterBudgetLpm: number; totalPowerBudgetMw: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [z, f] = await Promise.all([api.listZones(), api.getFacility()]);
      setZones(z.zones);
      setFacility(f);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load config.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const zone = zones.find((z) => z.id === selectedId);
  const current = draft ?? (zone ? { targetPue: zone.targetPue, targetWue: zone.targetWue, waterBudgetLpm: zone.waterBudgetLpm, powerBudgetMw: zone.powerBudgetMw } : null);

  const saveZone = async () => {
    if (!zone || !draft) return;
    try {
      await api.patchZone(zone.id, draft);
      toast("Zone targets & budgets saved.", "success");
      await load();
      setDraft(null);
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    }
  };

  const saveFacility = async () => {
    if (!facilityDraft) return;
    try {
      await api.patchFacility(facilityDraft);
      toast("Facility budgets saved.", "success");
      await load();
      setFacilityDraft(null);
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    }
  };

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <Panel title="Master data — targets & budgets">
      <div className="flex flex-wrap gap-2">
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => setSelectedId(z.id)}
            aria-pressed={selectedId === z.id}
            className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              selectedId === z.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {z.name}
          </button>
        ))}
      </div>
      {current ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Target PUE" value={String(current.targetPue)} onChange={(v) => setDraft({ ...current, targetPue: num(v, current.targetPue) })} />
          <Field label="Target WUE" value={String(current.targetWue)} onChange={(v) => setDraft({ ...current, targetWue: num(v, current.targetWue) })} />
          <Field label="Water budget (L/min)" value={String(current.waterBudgetLpm)} onChange={(v) => setDraft({ ...current, waterBudgetLpm: num(v, current.waterBudgetLpm) })} />
          <Field label="Power budget (MW)" value={String(current.powerBudgetMw)} onChange={(v) => setDraft({ ...current, powerBudgetMw: num(v, current.powerBudgetMw) })} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void saveZone()}
        disabled={!draft}
        className="mt-3 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
      >
        Save zone
      </button>

      {facility ? (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Facility budgets</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field
              label="Total water (L/min)"
              value={String(facilityDraft?.totalWaterBudgetLpm ?? facility.totalWaterBudgetLpm)}
              onChange={(v) => setFacilityDraft({ ...(facilityDraft ?? { totalWaterBudgetLpm: facility.totalWaterBudgetLpm, totalPowerBudgetMw: facility.totalPowerBudgetMw }), totalWaterBudgetLpm: num(v, facility.totalWaterBudgetLpm) })}
            />
            <Field
              label="Total power (MW)"
              value={String(facilityDraft?.totalPowerBudgetMw ?? facility.totalPowerBudgetMw)}
              onChange={(v) => setFacilityDraft({ ...(facilityDraft ?? { totalWaterBudgetLpm: facility.totalWaterBudgetLpm, totalPowerBudgetMw: facility.totalPowerBudgetMw }), totalPowerBudgetMw: num(v, facility.totalPowerBudgetMw) })}
            />
          </div>
          <button
            type="button"
            onClick={() => void saveFacility()}
            disabled={!facilityDraft}
            className="mt-3 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
          >
            Save facility
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
      />
    </label>
  );
}

function TransferPanel() {
  const toast = useToast();
  const [zones, setZones] = useState<{ id: number; name: string; flowLpm: number; chillerMw: number; chipTempC: number }[]>([]);
  const [sourceId, setSourceId] = useState<number | "">("");
  const [targetId, setTargetId] = useState<number | "">("");
  const [waterDelta, setWaterDelta] = useState(0);
  const [powerDelta, setPowerDelta] = useState(0);
  const [active, setActive] = useState<TransferResponse | null>(null);
  const [history, setHistory] = useState<TransferListItem[]>([]);

  const loadZones = useCallback(async () => {
    try {
      const res = await api.telemetryCurrent();
      setZones(
        res.zones.map((z) => ({
          id: z.id,
          name: z.name,
          flowLpm: z.prediction.flowLpm,
          chillerMw: z.prediction.chillerPowerMw,
          chipTempC: z.prediction.chipTempC,
        })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await api.listTransfers()).transfers);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadZones();
    void loadHistory();
  }, [loadZones, loadHistory]);

  const source = zones.find((z) => z.id === sourceId);
  const target = zones.find((z) => z.id === targetId);
  const maxWater = source ? Math.max(0, Math.floor(source.flowLpm - 400)) : 0;
  const maxPower = source ? Math.max(0, Math.round((source.chillerMw - 0.05) * 100) / 100) : 0;

  const create = async () => {
    if (!sourceId || !targetId) {
      toast("Pick a source and a target zone.", "warning");
      return;
    }
    try {
      const res = await api.createTransfer({ sourceId: Number(sourceId), targetId: Number(targetId), waterDeltaLpm: waterDelta, powerDeltaMw: powerDelta });
      setActive(res);
      toast(res.feasible ? "Transfer proposed (shadow)." : "Transfer infeasible — check guardrails.", res.feasible ? "success" : "warning");
      void loadHistory();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Transfer failed.", "error");
    }
  };

  const transition = async (action: "virtual" | "verify" | "apply" | "reject") => {
    if (!active) return;
    try {
      await api.transitionTransfer(active.id, action);
      toast(`Transfer ${action === "reject" ? "rejected" : action + "d"}.`, "success");
      setActive(null);
      void loadHistory();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Transition failed.", "error");
    }
  };

  return (
    <Panel title="Cooling transfer — reallocate water / power between zones">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-400">Source (safe zone)</span>
          <select
            value={String(sourceId)}
            onChange={(e) => setSourceId(e.target.value === "" ? "" : Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <option value="">—</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id} disabled={z.id === targetId}>
                {z.name} · flow {Math.round(z.flowLpm)} L/min
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-400">Target (hot zone)</span>
          <select
            value={String(targetId)}
            onChange={(e) => setTargetId(e.target.value === "" ? "" : Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <option value="">—</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id} disabled={z.id === sourceId}>
                {z.name} · {z.chipTempC.toFixed(1)}°C
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 space-y-3">
        <label className="block text-sm">
          <span className="flex justify-between text-slate-300">
            <span>Water to transfer</span>
            <span className="font-mono text-cyan-300">{waterDelta} L/min</span>
          </span>
          <input type="range" min={0} max={maxWater} step={10} value={waterDelta} onChange={(e) => setWaterDelta(Number(e.target.value))} disabled={!source} className="mt-1 w-full accent-cyan-400" />
          <span className="text-xs text-slate-500">source headroom: {maxWater} L/min</span>
        </label>
        <label className="block text-sm">
          <span className="flex justify-between text-slate-300">
            <span>Power (chiller) to transfer</span>
            <span className="font-mono text-emerald-300">{powerDelta} MW</span>
          </span>
          <input type="range" min={0} max={maxPower} step={0.01} value={powerDelta} onChange={(e) => setPowerDelta(Number(e.target.value))} disabled={!source} className="mt-1 w-full accent-emerald-400" />
          <span className="text-xs text-slate-500">source headroom: {maxPower} MW</span>
        </label>
      </div>

      <button
        type="button"
        onClick={() => void create()}
        disabled={!source || !target}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        Propose transfer (shadow)
      </button>

      {active ? (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={active.feasible ? "good" : "bad"}>
              {active.feasible ? "feasible" : "infeasible"}
            </StatusBadge>
            <StatusBadge tone={active.withinFacility ? "good" : "warn"}>
              {active.withinFacility ? "within facility budget" : "exceeds facility budget"}
            </StatusBadge>
            <span className="text-xs text-slate-400">status: {active.status}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-400">Source →</p>
              <p className="font-mono text-slate-200">PUE {active.source.prediction.pue.toFixed(4)} · WUE {active.source.prediction.wue.toFixed(3)}</p>
              <p className="font-mono text-slate-400">flow {active.source.prediction.flowLpm} · {active.source.prediction.chipTempC.toFixed(1)}°C</p>
            </div>
            <div>
              <p className="text-slate-400">Target →</p>
              <p className="font-mono text-slate-200">PUE {active.target.prediction.pue.toFixed(4)} · WUE {active.target.prediction.wue.toFixed(3)}</p>
              <p className="font-mono text-slate-400">flow {active.target.prediction.flowLpm} · {active.target.prediction.chipTempC.toFixed(1)}°C</p>
            </div>
          </div>
          {active.violations.length ? (
            <ul className="mt-2 text-xs text-red-300">
              {active.violations.map((v, i) => (
                <li key={i}>· {v.message}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void transition("virtual")} className="rounded-lg border border-cyan-500/50 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/10">
              1 · Apply virtually
            </button>
            <button type="button" onClick={() => void transition("verify")} className="rounded-lg border border-amber-500/50 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10">
              2 · Verify
            </button>
            <button type="button" onClick={() => void transition("apply")} disabled={!active.feasible} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              3 · Apply (closed loop)
            </button>
            <button type="button" onClick={() => void transition("reject")} className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10">
              Reject
            </button>
          </div>
        </div>
      ) : null}

      {history.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">From → To</th>
                <th className="py-1 pr-2">Water</th>
                <th className="py-1 pr-2">Power</th>
                <th className="py-1 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map((t) => (
                <tr key={t.id} className="border-b border-slate-800/60">
                  <td className="py-1 pr-2 font-mono">{t.id}</td>
                  <td className="py-1 pr-2 font-mono">
                    {t.sourceId} → {t.targetId}
                  </td>
                  <td className="py-1 pr-2 font-mono">{t.waterDeltaLpm} L/min</td>
                  <td className="py-1 pr-2 font-mono">{t.powerDeltaMw} MW</td>
                  <td className="py-1 pr-2">{kindBadge(t.status === "applied" ? "applied" : t.status === "rejected" ? "fail_safe" : "would_be")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function ControlPage() {
  const toast = useToast();
  const [data, setData] = useState<ControlResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(1);
  const [draft, setDraft] = useState<Setpoints>(FACTORY_SETPOINTS);
  const [commsDropped, setCommsDropped] = useState(false);
  const commsRef = useRef(commsDropped);
  commsRef.current = commsDropped;

  const refresh = useCallback(async () => {
    try {
      const res = await api.getControl();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load control state.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!commsRef.current) void api.heartbeat().catch(() => {});
      void refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const zone: ControlZoneView | undefined = data?.zones.find((z) => z.id === selectedId);

  useEffect(() => {
    if (zone) setDraft(zone.currentSetpoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, zone?.updatedAt]);

  if (error && !data) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data || !zone) return <p className="py-20 text-center text-sm text-slate-400">Loading control state…</p>;

  const { actions } = data;

  const switchMode = async (mode: "shadow" | "closed_loop") => {
    try {
      setData(await api.setControlMode(zone.id, mode));
      toast(mode === "closed_loop" ? `${zone.name}: closed-loop enabled.` : `${zone.name}: shadow mode.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Mode change failed.", "error");
    }
  };

  const apply = async () => {
    try {
      const res = await api.applySetpoints(zone.id, draft, "Operator manual setpoint change");
      toast(
        res.kind === "applied" ? `Applied.${res.slewLimited ? " Slew-rate limit clamped the jump." : ""}` : "Shadow mode: would-be action logged.",
        res.kind === "applied" ? "success" : "info",
      );
      void refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Apply failed.", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Closed-Loop BMS/CDU Control</h1>
        <p className="text-sm text-slate-400">Per-zone control with guardrails, slew limits, watchdog, budgets, and cross-zone transfers</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {data.zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => setSelectedId(z.id)}
            aria-pressed={selectedId === z.id}
            className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              selectedId === z.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {z.name}
          </button>
        ))}
      </div>

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
            <button
              type="button"
              onClick={() => {
                setCommsDropped((v) => {
                  const next = !v;
                  toast(next ? "Comms drop simulated — heartbeats paused." : "Comms restored — heartbeats resumed.", next ? "warning" : "success");
                  return next;
                });
              }}
              aria-pressed={commsDropped}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-500/50 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-red-400"
            >
              <Unplug className="h-4 w-4" aria-hidden />
              {commsDropped ? "Restore comms" : "Test comms drop"}
            </button>
          </div>
        </Panel>

        <Panel title={`${zone.name} — setpoint control (slew-limited)`}>
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
            {zone.mode === "closed_loop" ? "Apply setpoints" : "Log would-be setpoints"}
          </button>
          {zone.mode === "shadow" ? (
            <p className="mt-2 text-xs text-slate-500">Shadow mode: actions recorded for review; nothing written to the CDU.</p>
          ) : null}
        </Panel>
      </div>

      <SandboxPanel zoneId={zone.id} />
      <MasterDataPanel onSaved={() => void refresh()} />
      <TransferPanel />

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
              {actions.map((a) => (
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

export const controlRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/control",
  component: ControlPage,
});
