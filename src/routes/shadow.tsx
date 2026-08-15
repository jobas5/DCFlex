import { createRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LineChart } from "../components/LineChart";
import { useToast } from "../components/Toast";
import { ConfirmDialog, Panel, StatusBadge, Stepper, Table, Td, Th } from "../components/ui";
import { api, type ControlResponse, type ControlZoneView, type ValidationResponse } from "../lib/api";
import { CHART } from "../lib/tokens";
import { fmtTick } from "../lib/time";
import { rootRoute } from "./root";

function ValidationPanel({ zoneId, targets }: { zoneId: number; targets: { pue: number; wue: number } }) {
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

  const labels = data.samples.map((s) => fmtTick(s.tick));
  const recent = data.samples.slice(-30).reverse();

  return (
    <Panel title={`${zoneId} — validation`}>
      {!data.hasShadowConfig ? (
        <p className="text-sm text-slate-400">
          No shadow config set for this zone. Run What-If on the Optimization page, use the best setpoints, then apply to shadow.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={data.ready ? "good" : "warn"}>
              {data.ready ? "Ready for closed-loop" : "Not ready yet"}
            </StatusBadge>
            <span className="text-xs text-slate-400">{data.total} samples · 7-day window</span>
          </div>

          {data.samples.length > 1 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LineChart
                ariaLabel="Shadow config predicted vs actual PUE over the validation window"
                labels={labels}
                series={[
                  { label: "Predicted PUE", color: CHART.cyan, values: data.samples.map((s) => s.predictedPue) },
                  { label: "Actual PUE", color: CHART.slate, values: data.samples.map((s) => s.actualPue) },
                ]}
                yFormat={(v) => v.toFixed(3)}
                threshold={{ value: targets.pue, label: `target ${targets.pue.toFixed(3)}`, color: "#f87171" }}
                band={{ lo: targets.pue - 0.02, hi: targets.pue + 0.02, color: CHART.cyan }}
              />
              <LineChart
                ariaLabel="Shadow config predicted WUE over the validation window"
                labels={labels}
                series={[{ label: "Predicted WUE", color: CHART.emerald, values: data.samples.map((s) => s.predictedWue) }]}
                yFormat={(v) => v.toFixed(2)}
                threshold={{ value: targets.wue, label: `target ${targets.wue.toFixed(3)}`, color: "#f87171" }}
                band={{ lo: targets.wue - 0.02, hi: targets.wue + 0.02, color: CHART.emerald }}
              />
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-xs text-slate-400">Feasible</p>
              <p className="mt-0.5 font-mono text-base tabular-nums">{Math.round(data.feasibleRate * 100)}%</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-xs text-slate-400">Meet target ±0.02</p>
              <p className="mt-0.5 font-mono text-base tabular-nums">{Math.round(data.meetsRate * 100)}%</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-xs text-slate-400">In budget</p>
              <p className="mt-0.5 font-mono text-base tabular-nums">{data.budgetOk}/{data.total}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-xs text-slate-400">Avg PUE gap</p>
              <p className="mt-0.5 font-mono text-base tabular-nums">{data.avgPueGap.toFixed(4)}</p>
            </div>
          </div>

          {recent.length ? (
            <div className="mt-4">
              <Table>
                <thead>
                  <tr>
                    <Th>Time</Th>
                    <Th right>Pred PUE</Th>
                    <Th right>Actual PUE</Th>
                    <Th right>Pred WUE</Th>
                    <Th right>Chip</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => (
                    <tr key={s.tick}>
                      <Td className="font-mono text-xs">{fmtTick(s.tick)}</Td>
                      <Td right className="text-xs text-sev-info">{s.predictedPue.toFixed(4)}</Td>
                      <Td right className="text-xs">{s.actualPue.toFixed(4)}</Td>
                      <Td right className="text-xs text-sev-ok">{s.predictedWue.toFixed(3)}</Td>
                      <Td right className="text-xs">{s.chipTempC.toFixed(1)}°C</Td>
                      <Td className="text-xs">
                        {s.feasible ? <StatusBadge tone="good">feasible</StatusBadge> : <StatusBadge tone="bad">violation</StatusBadge>}
                        {!s.budgetOk ? <span className="ml-1 text-sev-warn">· over budget</span> : null}
                        {!s.meetsTarget ? <span className="ml-1 text-sev-warn">· off target</span> : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function ShadowPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { zone: zoneId } = useSearch({ from: "/shadow" });
  const [control, setControl] = useState<ControlResponse | null>(null);
  const [confirm, setConfirm] = useState(false);

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

  const goClosedLoop = async () => {
    try {
      await api.setControlMode(zoneId, "closed_loop");
      toast("Closed-loop enabled — validated shadow config applied.", "success");
      setConfirm(false);
      void refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Mode change failed.", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Shadow Validation</h1>
        <p className="text-sm text-slate-400">
          Validate a fixed configuration against live data before enabling closed-loop writeback
        </p>
      </div>

      {steps.length ? <Stepper steps={steps} /> : null}

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

      {zone ? <ValidationPanel zoneId={zone.id} targets={zone.targets} /> : null}

      {zone && zone.mode === "shadow" && zone.shadowSetpoints ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-200">
              Shadow config validated — ready to write to the real engine.
            </p>
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-300"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Enable closed-loop
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm}
        title="Enable closed-loop writeback?"
        body={`DCFlex will write the validated shadow config to ${zone?.name ?? ""} and begin steering it each tick. Guardrails, slew limits, and the watchdog remain enforced.`}
        confirmLabel="Enable closed-loop"
        tone="danger"
        onConfirm={() => void goClosedLoop()}
        onCancel={() => setConfirm(false)}
      />
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
