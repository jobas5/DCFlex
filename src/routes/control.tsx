import { createRoute } from "@tanstack/react-router";
import { HeartPulse, ShieldAlert, ShieldCheck, Unplug } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SetpointSliders } from "../components/SetpointSliders";
import { useToast } from "../components/Toast";
import { ErrorState, Panel, StatusBadge } from "../components/ui";
import { api, type ControlResponse } from "../lib/api";
import { FACTORY_SETPOINTS, type ControlAction } from "../lib/twin/types";
import { rootRoute } from "./root";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const kindBadge = (kind: ControlAction["kind"]) =>
  kind === "applied" ? (
    <StatusBadge tone="good">applied</StatusBadge>
  ) : kind === "fail_safe" ? (
    <StatusBadge tone="bad">fail-safe</StatusBadge>
  ) : (
    <StatusBadge tone="info">would-be</StatusBadge>
  );

function ControlPage() {
  const toast = useToast();
  const [data, setData] = useState<ControlResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(FACTORY_SETPOINTS);
  const [commsDropped, setCommsDropped] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"shadow" | "closed_loop" | null>(null);
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

  // Heartbeat loop: keeps the watchdog fed unless the operator drops comms.
  useEffect(() => {
    const id = setInterval(() => {
      if (!commsRef.current) {
        void api.heartbeat().catch(() => {});
      }
      void refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (data) setDraft(data.state.currentSetpoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.state.updatedAt]);

  if (error && !data) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return <p className="py-20 text-center text-sm text-slate-400">Loading control state…</p>;

  const { state, actions } = data;
  const shadowDayProgress = 18; // simulated rollout progress

  const switchMode = async (mode: "shadow" | "closed_loop") => {
    try {
      const res = await api.setControlMode(mode);
      setData(res);
      toast(
        mode === "closed_loop"
          ? "Closed-loop control enabled (Phase B). Guardrails and slew limits active."
          : "Reverted to shadow mode (Phase A). Recommendations are logged only.",
        "success",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Mode change failed.", "error");
    } finally {
      setConfirmMode(null);
    }
  };

  const apply = async () => {
    try {
      const res = await api.applySetpoints(draft, "Operator manual setpoint change");
      setData(res);
      toast(
        res.kind === "applied"
          ? `Applied.${res.slewLimited ? " Slew-rate limit clamped the jump." : ""}`
          : "Shadow mode: would-be action logged.",
        res.kind === "applied" ? "success" : "info",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Apply failed.", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Closed-Loop BMS/CDU Control</h1>
        <p className="text-sm text-slate-400">
          Phase A shadow validation → Phase B closed-loop with guardrails, slew limits, and watchdog fail-safe
        </p>
      </div>

      {/* Rollout banner */}
      <Panel title="Rollout status">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={state.mode === "shadow" ? "info" : "muted"}>
            Phase A — 30-day shadow mode
          </StatusBadge>
          <StatusBadge tone={state.mode === "closed_loop" ? "good" : "muted"}>
            Phase B — closed-loop release
          </StatusBadge>
          <span className="text-xs text-slate-400">
            {state.mode === "shadow"
              ? `Shadow day ${shadowDayProgress}/30 — logging would-be actions, no writeback`
              : "Closed-loop active — off-peak first, expanding to 24/7"}
          </span>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800"
          role="progressbar"
          aria-valuenow={state.mode === "shadow" ? (shadowDayProgress / 30) * 100 : 100}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Rollout progress"
        >
          <div
            className="h-full rounded-full bg-cyan-500"
            style={{ width: state.mode === "shadow" ? `${(shadowDayProgress / 30) * 100}%` : "100%" }}
          />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Mode + watchdog */}
        <Panel title="Operating mode & watchdog">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-300">Current mode:</span>
            <StatusBadge tone={state.mode === "closed_loop" ? "good" : "info"}>
              {state.mode === "closed_loop" ? "Closed-loop (Phase B)" : "Shadow (Phase A)"}
            </StatusBadge>
            <button
              type="button"
              onClick={() => setConfirmMode(state.mode === "shadow" ? "closed_loop" : "shadow")}
              className="rounded-lg border border-cyan-500/50 px-3 py-1.5 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              Switch to {state.mode === "shadow" ? "closed-loop" : "shadow"}
            </button>
          </div>

          {confirmMode ? (
            <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-950/30 p-3" role="alertdialog" aria-label="Confirm mode change">
              <p className="text-sm text-amber-200">
                {confirmMode === "closed_loop"
                  ? "Enable closed-loop writeback to CDU/BMS controllers? Guardrails and slew-rate limits remain enforced."
                  : "Return to shadow mode? The optimizer will stop writing setpoints."}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void switchMode(confirmMode)}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-amber-300"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmMode(null)}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-slate-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <HeartPulse className={`h-4 w-4 ${state.failSafeActive ? "text-red-400" : "text-emerald-400"}`} aria-hidden />
              <span className="text-sm font-medium text-slate-200">Heartbeat watchdog</span>
              {state.failSafeActive ? (
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
              Last heartbeat:{" "}
              {state.heartbeatAgeSec !== null ? `${state.heartbeatAgeSec}s ago` : "never"} · fail-safe at{" "}
              {state.watchdogTimeoutSec}s
            </p>
            {state.failSafeActive ? (
              <p className="mt-2 text-sm text-red-300">
                Communication lost &gt;{state.watchdogTimeoutSec}s — control relinquished, factory setpoints in
                effect ({state.factorySetpoints.coolantSupplyC}°C supply, {state.factorySetpoints.pumpSpeedPct}%
                pump, {state.factorySetpoints.valvePosPct}% valve).
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setCommsDropped((v) => {
                  const next = !v;
                  toast(
                    next
                      ? "Comms drop simulated — heartbeats paused. Watchdog trips after 30s."
                      : "Comms restored — heartbeats resumed.",
                    next ? "warning" : "success",
                  );
                  return next;
                });
              }}
              aria-pressed={commsDropped}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-500/50 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
            >
              <Unplug className="h-4 w-4" aria-hidden />
              {commsDropped ? "Restore comms" : "Test comms drop"}
            </button>
          </div>
        </Panel>

        {/* Setpoint control */}
        <Panel title="Setpoint control (slew-limited)">
          <SetpointSliders value={draft} onChange={setDraft} />
          <p className="mt-3 text-xs text-slate-400">
            Slew limits: ≤{state.slewLimits.maxTempStepC}°C temp, ≤{state.slewLimits.maxPumpStepPct}% pump, ≤
            {state.slewLimits.maxValveStepPct}% valve per action.
            {state.slewLimited ? (
              <span className="ml-1 text-amber-300">Last action was slew-clamped.</span>
            ) : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>
              Effective setpoints now: {state.effectiveSetpoints.coolantSupplyC}°C /{" "}
              {state.effectiveSetpoints.pumpSpeedPct}% / {state.effectiveSetpoints.valvePosPct}%
            </span>
          </div>
          <button
            type="button"
            onClick={() => void apply()}
            className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            {state.mode === "closed_loop" ? "Apply setpoints" : "Log would-be setpoints"}
          </button>
          {state.mode === "shadow" ? (
            <p className="mt-2 text-xs text-slate-500">
              Shadow mode: actions are recorded for engineer review; nothing is written to the CDU.
            </p>
          ) : null}
        </Panel>
      </div>

      {/* Action log */}
      <Panel title="Control action log">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Kind</th>
                <th className="px-2 py-2">Mode</th>
                <th className="px-2 py-2">Setpoints</th>
                <th className="px-2 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/60 align-top">
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-400">{fmtTime(a.createdAt)}</td>
                  <td className="px-2 py-2">{kindBadge(a.kind)}</td>
                  <td className="px-2 py-2 text-xs text-slate-400">{a.mode === "closed_loop" ? "closed-loop" : "shadow"}</td>
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
