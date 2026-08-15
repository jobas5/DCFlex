import { createRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "../components/Toast";
import { ConfirmDialog, KindBadge, Panel, StatusBadge, StatusDot } from "../components/ui";
import { api, type TransferListItem, type TransferResponse } from "../lib/api";
import { rootRoute } from "./root";

type ZoneStatus = "green" | "yellow" | "red";

function TransferPage() {
  const toast = useToast();
  const [zones, setZones] = useState<{ id: number; name: string; flowLpm: number; chillerMw: number; chipTempC: number; status: ZoneStatus }[]>([]);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [waterDelta, setWaterDelta] = useState(0);
  const [powerDelta, setPowerDelta] = useState(0);
  const [active, setActive] = useState<TransferResponse | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
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
          status: z.status,
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
      const res = await api.createTransfer({ sourceId, targetId, waterDeltaLpm: waterDelta, powerDeltaMw: powerDelta });
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
      setConfirmApply(false);
      void loadHistory();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Transition failed.", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Cooling Transfer</h1>
        <p className="text-sm text-slate-400">
          Reallocate water flow and chiller power from a safe zone to a hot zone, behind guardrails and budgets
        </p>
      </div>

      <Panel title="Reallocate water / power between zones">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm text-slate-400">Source (safe zone)</p>
            <div className="grid grid-cols-2 gap-2">
              {zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setSourceId(z.id === sourceId ? null : z.id)}
                  aria-pressed={sourceId === z.id}
                  disabled={z.id === targetId}
                  className={`rounded-lg border p-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40 ${
                    sourceId === z.id ? "border-cyan-400/60 bg-cyan-500/15" : "border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <StatusDot tone={z.status === "green" ? "good" : z.status === "yellow" ? "warn" : "bad"} />
                    {z.name}
                  </span>
                  <span className="mt-1 block font-mono text-xs text-slate-400">{Math.round(z.flowLpm)} L/min</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-slate-400">Target (hot zone)</p>
            <div className="grid grid-cols-2 gap-2">
              {zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setTargetId(z.id === targetId ? null : z.id)}
                  aria-pressed={targetId === z.id}
                  disabled={z.id === sourceId}
                  className={`rounded-lg border p-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40 ${
                    targetId === z.id ? "border-cyan-400/60 bg-cyan-500/15" : "border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <StatusDot tone={z.status === "green" ? "good" : z.status === "yellow" ? "warn" : "bad"} />
                    {z.name}
                  </span>
                  <span className="mt-1 block font-mono text-xs text-slate-400">{z.chipTempC.toFixed(1)}°C</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="flex justify-between text-slate-300">
              <span>Water to transfer</span>
              <span className="font-mono text-cyan-300">{waterDelta} L/min</span>
            </span>
            <input type="range" min={0} max={maxWater} step={10} value={waterDelta} onChange={(e) => setWaterDelta(Number(e.target.value))} disabled={!source} className="mt-1 w-full accent-cyan-400" />
            <span className="text-xs text-slate-400">source headroom: {maxWater} L/min</span>
          </label>
          <label className="block text-sm">
            <span className="flex justify-between text-slate-300">
              <span>Power (chiller) to transfer</span>
              <span className="font-mono text-emerald-300">{powerDelta} MW</span>
            </span>
            <input type="range" min={0} max={maxPower} step={0.01} value={powerDelta} onChange={(e) => setPowerDelta(Number(e.target.value))} disabled={!source} className="mt-1 w-full accent-emerald-400" />
            <span className="text-xs text-slate-400">source headroom: {maxPower} MW</span>
          </label>
        </div>

        <button
          type="button"
          onClick={() => void create()}
          disabled={!source || !target}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
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
              <button type="button" onClick={() => setConfirmApply(true)} disabled={!active.feasible} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
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
                    <td className="py-1 pr-2"><KindBadge kind={t.status === "applied" ? "applied" : t.status === "rejected" ? "fail_safe" : "would_be"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      <ConfirmDialog
        open={confirmApply}
        title="Apply this transfer?"
        body="This writes the transferred setpoints to both zones' controllers. Slew limits and guardrails remain enforced."
        confirmLabel="Apply transfer"
        tone="danger"
        onConfirm={() => void transition("apply")}
        onCancel={() => setConfirmApply(false)}
      />
    </div>
  );
}

export const transferRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transfer",
  component: TransferPage,
});
