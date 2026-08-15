import { createRoute } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowRight,
  Droplets,
  Info,
  Lock,
  Thermometer,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../components/Toast";
import { ConfirmDialog, KindBadge, StatusBadge } from "../components/ui";
import { api, type TransferListItem, type TransferResponse } from "../lib/api";
import { proposeTransfer, type TransferContext } from "../lib/twin/transfer";
import { GUARDRAILS, type FacilityView, type ZoneView } from "../lib/twin/types";
import { rootRoute } from "./root";

type ThermalBand = "excellent" | "good" | "warning" | "critical";
type TransferMode = "both" | "power" | "water";

function thermalBand(margin: number): ThermalBand {
  if (margin >= 8) return "excellent";
  if (margin >= 5) return "good";
  if (margin >= 3) return "warning";
  return "critical";
}

const BAND_LABEL: Record<ThermalBand, string> = {
  excellent: "Excellent",
  good: "Good",
  warning: "Warning",
  critical: "Critical",
};
const BAND_BADGE: Record<ThermalBand, "info" | "good" | "warn" | "bad"> = {
  excellent: "info",
  good: "good",
  warning: "warn",
  critical: "bad",
};
const BAND_BAR: Record<ThermalBand, string> = {
  excellent: "bg-cyan-500",
  good: "bg-emerald-500",
  warning: "bg-amber-400",
  critical: "bg-red-500",
};
const BAND_STATUS: Record<ThermalBand, string> = {
  excellent: "Normal",
  good: "Normal",
  warning: "High",
  critical: "Critical",
};

const ctx = (z: ZoneView): TransferContext => ({
  itLoadMw: z.telemetry.itLoadMw,
  wetBulbC: z.telemetry.wetBulbC,
  dryBulbC: z.telemetry.dryBulbC,
  setpoints: z.setpoints,
  waterBudgetLpm: z.budgets.waterLpm,
  powerBudgetMw: z.budgets.powerMw,
});

/* ------------------------------------------------------------------ */
/* Small bits                                                          */
/* ------------------------------------------------------------------ */

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function ZoneCard({ zone }: { zone: ZoneView }) {
  const band = thermalBand(zone.prediction.thermalMarginC);
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-200">{zone.name}</p>
        <StatusBadge tone={BAND_BADGE[band]}>{BAND_LABEL[band]}</StatusBadge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Chip Temp</p>
          <p className="mt-0.5 font-mono text-base tabular-nums text-slate-100">{zone.prediction.chipTempC.toFixed(1)}°C</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Margin</p>
          <p className="mt-0.5 font-mono text-base tabular-nums text-slate-100">{zone.prediction.thermalMarginC.toFixed(1)}°C</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Status</p>
          <p className="mt-0.5 text-sm font-medium text-slate-200">{BAND_STATUS[band]}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div>
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Power Usage</span>
            <span className="font-mono">{Math.round(zone.budgetUsage.powerPct)}%</span>
          </div>
          <ProgressBar pct={zone.budgetUsage.powerPct} color={BAND_BAR[band]} />
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Water Usage</span>
            <span className="font-mono">{Math.round(zone.budgetUsage.waterPct)}%</span>
          </div>
          <ProgressBar pct={zone.budgetUsage.waterPct} color={BAND_BAR[band]} />
        </div>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="px-2 text-center">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${accent ? "text-cyan-300" : "text-slate-100"}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function TransferPage() {
  const toast = useToast();
  const [views, setViews] = useState<ZoneView[]>([]);
  const [aggregate, setAggregate] = useState<FacilityView | null>(null);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [mode, setMode] = useState<TransferMode>("both");
  const [waterDelta, setWaterDelta] = useState(0);
  const [powerDelta, setPowerDelta] = useState(0);
  const [active, setActive] = useState<TransferResponse | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [history, setHistory] = useState<TransferListItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.telemetryCurrent();
      setViews(res.zones);
      setAggregate(res.aggregate);
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
    void load();
    void loadHistory();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load, loadHistory]);

  const source = views.find((z) => z.id === sourceId) ?? null;
  const target = views.find((z) => z.id === targetId) ?? null;

  const maxWater = source ? Math.max(0, Math.floor(source.prediction.flowLpm - GUARDRAILS.flowMinLpm)) : 0;
  const maxPower = source ? Math.max(0, Math.round((source.prediction.chillerPowerMw - 0.05) * 100) / 100) : 0;

  // Live impact, computed client-side from the surrogate transfer solver.
  const proposal = useMemo(
    () => (source && target ? proposeTransfer(ctx(target), ctx(source), waterDelta, powerDelta) : null),
    [source, target, waterDelta, powerDelta],
  );

  const swap = () => {
    setSourceId(targetId);
    setTargetId(sourceId);
    setWaterDelta(0);
    setPowerDelta(0);
  };

  const preview = async () => {
    if (!source || !target) {
      toast("Pick a source and a target zone.", "warning");
      return;
    }
    try {
      const res = await api.createTransfer({
        sourceId: source.id,
        targetId: target.id,
        waterDeltaLpm: mode !== "power" ? waterDelta : 0,
        powerDeltaMw: mode !== "water" ? powerDelta : 0,
      });
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
      if (action === "apply") {
        toast(
          `Transfer applied — budgets updated: ${source?.name} −${active.waterDeltaLpm} L/min · −${active.powerDeltaMw} MW, ${target?.name} +${active.waterDeltaLpm} L/min · +${active.powerDeltaMw} MW.`,
          "success",
        );
      } else {
        toast(`Transfer ${action === "reject" ? "rejected" : action + "d"}.`, "success");
      }
      setActive(null);
      setConfirmApply(false);
      void loadHistory();
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Transition failed.", "error");
    }
  };

  const backupPower = aggregate ? Math.max(0, aggregate.budgets.powerMw - aggregate.accessoryPowerMw) : 0;
  const backupWater = aggregate ? Math.max(0, aggregate.budgets.waterLpm - aggregate.waterLpm) : 0;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cooling Transfer</h1>
          <p className="text-sm text-slate-400">
            Reallocate water flow and chiller power from a safe zone to a hot zone, behind guardrails and budgets.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" aria-hidden /> Excellent</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden /> Good</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden /> Warning</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" aria-hidden /> Critical</span>
        </div>
      </div>

      {/* Zone status cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {views.map((z) => (
          <ZoneCard key={z.id} zone={z} />
        ))}
      </div>

      {/* Total system summary */}
      {aggregate ? (
        <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Total System Summary</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex flex-1 flex-wrap items-center justify-around divide-x divide-slate-800">
              <SummaryMetric label="Total IT Load" value={`${aggregate.itLoadMw.toFixed(2)} MW`} />
              <SummaryMetric label="Total Power Usage" value={`${Math.round(aggregate.budgetUsage.powerPct)}%`} sub={`of ${aggregate.budgets.powerMw.toFixed(2)} MW budget`} />
              <SummaryMetric label="Total Water Usage" value={`${Math.round(aggregate.budgetUsage.waterPct)}%`} sub={`of ${aggregate.budgets.waterLpm.toLocaleString()} L/min budget`} />
              <SummaryMetric label="Available Backup Power" value={`${backupPower.toFixed(2)} MW`} accent />
              <SummaryMetric label="Available Backup Water" value={`${Math.round(backupWater)} L/min`} accent />
            </div>
            <div className="flex items-start gap-1.5 text-xs text-slate-400 sm:max-w-56">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" aria-hidden />
              Transfer helps improve thermal margin on critical zones by reallocating underutilized resources.
            </div>
          </div>
        </div>
      ) : null}

      {/* Transfer configuration */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr_1.2fr]">
        {/* Source */}
        <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">1. Select Source</h3>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">(Safe zone or backup)</p>

          <div className="mt-3 space-y-2">
            <div>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="radio" name="source" checked onChange={() => {}} className="accent-cyan-400" />
                From Zone
              </label>
              <div className="mt-2">
                <select
                  value={sourceId ?? ""}
                  onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : null)}
                  aria-label="Source zone"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <option value="">Select zone…</option>
                  {views.filter((z) => z.id !== targetId).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} · {BAND_LABEL[thermalBand(z.prediction.thermalMarginC)]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Available to transfer</p>
                <div className="mt-1 flex gap-4 text-sm">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Zap className="h-3.5 w-3.5 text-amber-300" aria-hidden /> Power
                    <span className="font-mono text-slate-100">{maxPower.toFixed(2)} MW</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Droplets className="h-3.5 w-3.5 text-cyan-300" aria-hidden /> Water
                    <span className="font-mono text-slate-100">{maxWater} L/min</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="opacity-50">
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input type="radio" name="source" disabled className="accent-cyan-400" />
                From Backup Supply
              </label>
              <div className="mt-2">
                <select disabled className="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-500">
                  <option>Backup Supply</option>
                </select>
              </div>
              <div className="mt-2 rounded-lg border border-slate-800/60 bg-slate-950/30 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-600">Available</p>
                <div className="mt-1 flex gap-4 text-sm text-slate-500">
                  <span className="font-mono">{backupPower.toFixed(2)} MW</span>
                  <span className="font-mono">{Math.round(backupWater)} L/min</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transfer direction */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={swap}
            disabled={!source || !target}
            aria-label="Swap source and target"
            className="rounded-full border border-cyan-400/60 bg-slate-900 p-3 text-cyan-300 shadow-lg shadow-cyan-500/10 hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40"
          >
            <ArrowLeftRight className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Target */}
        <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">2. Select Target Zone</h3>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">(Hot zone)</p>
          <div className="mt-3">
            <select
              value={targetId ?? ""}
              onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}
              aria-label="Target zone"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <option value="">Select zone…</option>
              {views.filter((z) => z.id !== sourceId).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} · {BAND_LABEL[thermalBand(z.prediction.thermalMarginC)]}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Current load</p>
            <div className="mt-1 flex gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Zap className="h-3.5 w-3.5 text-amber-300" aria-hidden /> Power
                <span className={`font-mono ${target && target.budgetUsage.powerPct >= 90 ? "text-red-300" : "text-slate-100"}`}>
                  {target ? `${Math.round(target.budgetUsage.powerPct)}%` : "—"}
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <Droplets className="h-3.5 w-3.5 text-cyan-300" aria-hidden /> Water
                <span className={`font-mono ${target && target.budgetUsage.waterPct >= 90 ? "text-red-300" : "text-slate-100"}`}>
                  {target ? `${Math.round(target.budgetUsage.waterPct)}%` : "—"}
                </span>
              </span>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Objective</p>
            <p className="mt-1 text-xs text-slate-400">
              Increase thermal margin on the target zone by reallocating underutilized resources without violating limits.
            </p>
          </div>
        </div>

        {/* Amount to transfer */}
        <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">3. Amount to Transfer</h3>

          <div className="mt-3 flex gap-1" role="tablist" aria-label="Transfer type">
            {(["both", "power", "water"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  if (m === "power") setWaterDelta(0);
                  if (m === "water") setPowerDelta(0);
                }}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  mode === m ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {m === "both" ? "Power & Water" : m === "power" ? "Power Only" : "Water Only"}
              </button>
            ))}
          </div>

          {mode !== "water" ? (
            <div className="mt-4">
              <label className="flex items-center justify-between text-sm text-slate-300">
                <span className="flex items-center gap-1.5">
                  Power to transfer <Info className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                </span>
                <span className="font-mono text-cyan-300">{powerDelta.toFixed(2)} MW</span>
              </label>
              <input
                type="range"
                min={0}
                max={maxPower}
                step={0.01}
                value={powerDelta}
                onChange={(e) => setPowerDelta(Number(e.target.value))}
                disabled={!source}
                className="mt-2 w-full accent-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-400"
              />
              <span className="text-[10px] text-slate-500">0 – {maxPower.toFixed(2)} MW</span>
            </div>
          ) : null}

          {mode !== "power" ? (
            <div className="mt-4">
              <label className="flex items-center justify-between text-sm text-slate-300">
                <span className="flex items-center gap-1.5">
                  Water to transfer <Info className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                </span>
                <span className="font-mono text-cyan-300">{waterDelta} L/min</span>
              </label>
              <input
                type="range"
                min={0}
                max={maxWater}
                step={10}
                value={waterDelta}
                onChange={(e) => setWaterDelta(Number(e.target.value))}
                disabled={!source}
                className="mt-2 w-full accent-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-400"
              />
              <span className="text-[10px] text-slate-500">0 – {maxWater} L/min</span>
            </div>
          ) : null}

          {/* Estimated impact */}
          {proposal ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Estimated impact after transfer</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                    <Thermometer className="h-3 w-3 text-emerald-400" aria-hidden /> Thermal Margin
                  </p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-slate-200">
                    {target?.prediction.thermalMarginC.toFixed(1)}°C →{" "}
                    <span className="text-emerald-300">{proposal.target.prediction.thermalMarginC.toFixed(1)}°C</span>
                  </p>
                  <p className="text-[10px] text-emerald-300">
                    (+{(proposal.target.prediction.thermalMarginC - (target?.prediction.thermalMarginC ?? 0)).toFixed(1)}°C)
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                    <Thermometer className="h-3 w-3 text-cyan-400" aria-hidden /> Chip Temp
                  </p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-slate-200">
                    {target?.prediction.chipTempC.toFixed(1)}°C →{" "}
                    <span className="text-emerald-300">{proposal.target.prediction.chipTempC.toFixed(1)}°C</span>
                  </p>
                  <p className="text-[10px] text-emerald-300">
                    ({(proposal.target.prediction.chipTempC - (target?.prediction.chipTempC ?? 0)).toFixed(1)}°C)
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Transfer preview */}
      {source && target && proposal ? (
        <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Transfer Preview</h2>
              <p className="text-xs text-slate-500">(Before → After)</p>
            </div>
            <button
              type="button"
              onClick={() => void preview()}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
              Preview Transfer (Shadow)
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Simulate the transfer in Shadow Validation before applying to the real engine.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2">Zone</th>
                  <th className="px-2 py-2">Power Usage</th>
                  <th className="px-2 py-2">Water Usage</th>
                  <th className="px-2 py-2">Thermal Margin</th>
                  <th className="px-2 py-2">Chip Temp</th>
                </tr>
              </thead>
              <tbody>
                <PreviewRow
                  label={`${source.name} (Source)`}
                  powerBefore={source.budgetUsage.powerPct}
                  powerAfter={(proposal.source.prediction.accessoryPowerMw / source.budgets.powerMw) * 100}
                  waterBefore={source.budgetUsage.waterPct}
                  waterAfter={(proposal.source.prediction.flowLpm / source.budgets.waterLpm) * 100}
                  marginBefore={source.prediction.thermalMarginC}
                  marginAfter={proposal.source.prediction.thermalMarginC}
                  chipBefore={source.prediction.chipTempC}
                  chipAfter={proposal.source.prediction.chipTempC}
                />
                <PreviewRow
                  label={`${target.name} (Target)`}
                  powerBefore={target.budgetUsage.powerPct}
                  powerAfter={(proposal.target.prediction.accessoryPowerMw / target.budgets.powerMw) * 100}
                  waterBefore={target.budgetUsage.waterPct}
                  waterAfter={(proposal.target.prediction.flowLpm / target.budgets.waterLpm) * 100}
                  marginBefore={target.prediction.thermalMarginC}
                  marginAfter={proposal.target.prediction.thermalMarginC}
                  chipBefore={target.prediction.chipTempC}
                  chipAfter={proposal.target.prediction.chipTempC}
                />
              </tbody>
            </table>
          </div>

          {/* Proposal status + transitions */}
          {active ? (
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={active.feasible ? "good" : "bad"}>{active.feasible ? "feasible" : "infeasible"}</StatusBadge>
                <StatusBadge tone={active.withinFacility ? "good" : "warn"}>
                  {active.withinFacility ? "within facility budget" : "exceeds facility budget"}
                </StatusBadge>
                <span className="text-xs text-slate-400">status: {active.status}</span>
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
                <button type="button" onClick={() => setConfirmApply(true)} disabled={!active.feasible} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                  3 · Transfer (apply budgets)
                </button>
                <button type="button" onClick={() => void transition("reject")} className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10">
                  Reject
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* History */}
      {history.length ? (
        <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Recent Transfers</h2>
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
                      {views.find((z) => z.id === t.sourceId)?.name ?? t.sourceId} → {views.find((z) => z.id === t.targetId)?.name ?? t.targetId}
                    </td>
                    <td className="py-1 pr-2 font-mono">{t.waterDeltaLpm} L/min</td>
                    <td className="py-1 pr-2 font-mono">{t.powerDeltaMw} MW</td>
                    <td className="py-1 pr-2">
                      <KindBadge kind={t.status === "applied" ? "applied" : t.status === "rejected" ? "fail_safe" : "would_be"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Bottom guardrail message */}
      <p className="flex items-center justify-center gap-1.5 py-2 text-center text-xs text-slate-500">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        All transfers respect guardrails, capacity limits, and business priorities.
      </p>

      <ConfirmDialog
        open={confirmApply}
        title="Apply this transfer?"
        body={`This writes the transferred setpoints to both zones' controllers and reallocates their budgets: ${source?.name ?? ""} gives up ${active?.waterDeltaLpm ?? 0} L/min water and ${active?.powerDeltaMw ?? 0} MW power, ${target?.name ?? ""} gains the same. Slew limits and guardrails remain enforced.`}
        confirmLabel="Apply transfer"
        tone="danger"
        onConfirm={() => void transition("apply")}
        onCancel={() => setConfirmApply(false)}
      />
    </div>
  );
}

function PreviewRow({
  label,
  powerBefore,
  powerAfter,
  waterBefore,
  waterAfter,
  marginBefore,
  marginAfter,
  chipBefore,
  chipAfter,
}: {
  label: string;
  powerBefore: number;
  powerAfter: number;
  waterBefore: number;
  waterAfter: number;
  marginBefore: number;
  marginAfter: number;
  chipBefore: number;
  chipAfter: number;
}) {
  const pct = (b: number, a: number) => `${Math.round(b)}% → ${Math.round(a)}%`;
  const goodMargin = marginAfter >= marginBefore;
  const goodChip = chipAfter <= chipBefore;
  return (
    <tr className="border-b border-slate-800/60">
      <td className="px-2 py-2 font-medium text-slate-200">{label}</td>
      <td className="px-2 py-2 font-mono tabular-nums">{pct(powerBefore, powerAfter)}</td>
      <td className="px-2 py-2 font-mono tabular-nums">{pct(waterBefore, waterAfter)}</td>
      <td className="px-2 py-2 font-mono tabular-nums">
        {marginBefore.toFixed(1)}°C → <span className={goodMargin ? "text-emerald-300" : "text-amber-300"}>{marginAfter.toFixed(1)}°C {goodMargin ? "↑" : "↓"}</span>
      </td>
      <td className="px-2 py-2 font-mono tabular-nums">
        {chipBefore.toFixed(1)}°C → <span className={goodChip ? "text-emerald-300" : "text-amber-300"}>{chipAfter.toFixed(1)}°C {goodChip ? "↓" : "↑"}</span>
      </td>
    </tr>
  );
}

export const transferRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transfer",
  component: TransferPage,
});
