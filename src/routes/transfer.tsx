import { createRoute } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowRight,
  Droplets,
  History,
  Loader2,
  Lock,
  Send,
  SlidersHorizontal,
  ThermometerSun,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  cx,
  Meter,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  Slider,
  Stat,
  Stepper,
  Table,
  Td,
  Th,
  TONE_TEXT,
  usageTone,
  type Tone,
} from "../components/ui";
import { api, type TransferListItem, type TransferResponse } from "../lib/api";
import { useSim } from "../lib/simContext";
import { fmtDateTime } from "../lib/time";
import { proposeTransfer, type TransferContext } from "../lib/twin/transfer";
import { GUARDRAILS, type ZoneView } from "../lib/twin/types";
import { rootRoute } from "./root";

type ThermalBand = "excellent" | "good" | "warning" | "critical";
type TransferMode = "both" | "power" | "water";
type Status = "shadow" | "virtual" | "verify" | "apply" | "reject";

function thermalBand(margin: number): ThermalBand {
  if (margin >= 8) return "excellent";
  if (margin >= 5) return "good";
  if (margin >= 3) return "warning";
  return "critical";
}

const BAND: Record<ThermalBand, { label: string; tone: Tone }> = {
  excellent: { label: "Excellent", tone: "info" },
  good: { label: "Good", tone: "ok" },
  warning: { label: "Warning", tone: "warn" },
  critical: { label: "Critical", tone: "crit" },
};

// Server stores the last action name as the status.
const STATUS: Record<Status, { label: string; tone: Tone }> = {
  shadow: { label: "Proposed", tone: "neutral" },
  virtual: { label: "Virtual", tone: "info" },
  verify: { label: "Verified", tone: "violet" },
  apply: { label: "Applied", tone: "ok" },
  reject: { label: "Rejected", tone: "crit" },
};
const statusMeta = (s: string) => STATUS[s as Status] ?? { label: s, tone: "neutral" as Tone };

const ctx = (z: ZoneView): TransferContext => ({
  itLoadMw: z.telemetry.itLoadMw,
  wetBulbC: z.telemetry.wetBulbC,
  dryBulbC: z.telemetry.dryBulbC,
  setpoints: z.setpoints,
  waterBudgetLpm: z.budgets.waterLpm,
  powerBudgetMw: z.budgets.powerMw,
});

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function ZoneCard({ zone, role }: { zone: ZoneView; role: "source" | "target" | null }) {
  const band = thermalBand(zone.prediction.thermalMarginC);
  return (
    <div
      className={cx(
        "rounded-2xl border bg-surface p-4 shadow-card transition-colors",
        role === "source" ? "border-info/50" : role === "target" ? "border-warn/50" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-fg">{zone.name}</p>
        <span className="flex items-center gap-1.5">
          {role ? <Badge tone={role === "source" ? "info" : "warn"}>{role === "source" ? "Source" : "Target"}</Badge> : null}
          <Badge tone={BAND[band].tone} dot>
            {BAND[band].label}
          </Badge>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Chip temp" value={`${zone.prediction.chipTempC.toFixed(1)}°C`} size="sm" />
        <Stat label="Margin" value={`${zone.prediction.thermalMarginC.toFixed(1)}°C`} size="sm" tone={BAND[band].tone} />
      </div>
      <div className="mt-3 space-y-2.5">
        {(
          [
            ["Power", zone.budgetUsage.powerPct],
            ["Water", zone.budgetUsage.waterPct],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-[11px] text-fg-subtle">
              <span>{k} budget</span>
              <span className="tabular-nums">{Math.round(v)}%</span>
            </div>
            <Meter value={v} tone={usageTone(v)} className="mt-1" label={`${zone.name} ${k} budget usage`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BeforeAfter({ before, after, unit, goodWhen, digits = 1 }: { before: number; after: number; unit: string; goodWhen: "up" | "down"; digits?: number }) {
  const d = after - before;
  const good = Math.abs(d) < 1e-9 ? null : goodWhen === "up" ? d > 0 : d < 0;
  return (
    <span className="font-mono tabular-nums">
      <span className="text-fg-subtle">
        {before.toFixed(digits)}
        {unit}
      </span>
      <span className="mx-1.5 text-fg-faint">→</span>
      <span className={good === null ? "text-fg" : good ? "text-ok" : "text-warn"}>
        {after.toFixed(digits)}
        {unit}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function TransferPage() {
  const toast = useToast();
  const { data, refresh } = useSim();
  const views = useMemo(() => data?.zones ?? [], [data]);
  const aggregate = data?.aggregate ?? null;
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [mode, setMode] = useState<TransferMode>("both");
  const [waterDelta, setWaterDelta] = useState(0);
  const [powerDelta, setPowerDelta] = useState(0);
  const [active, setActive] = useState<TransferResponse | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<TransferListItem[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await api.listTransfers()).transfers);
    } catch {
      /* keep last good data */
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Default to moving from the coolest zone to the hottest one.
  useEffect(() => {
    if (sourceId !== null || targetId !== null || views.length < 2) return;
    const sorted = [...views].sort((a, b) => a.margin - b.margin);
    setTargetId(sorted[0].id);
    setSourceId(sorted[sorted.length - 1].id);
  }, [views, sourceId, targetId]);

  const source = views.find((z) => z.id === sourceId) ?? null;
  const target = views.find((z) => z.id === targetId) ?? null;

  const maxWater = source ? Math.max(0, Math.floor(source.prediction.flowLpm - GUARDRAILS.flowMinLpm)) : 0;
  const maxPower = source ? Math.max(0, Math.round((source.prediction.chillerPowerMw - 0.05) * 100) / 100) : 0;
  const effWater = mode !== "power" ? Math.min(waterDelta, maxWater) : 0;
  const effPower = mode !== "water" ? Math.min(powerDelta, maxPower) : 0;

  // Live impact from the same solver the worker runs.
  const proposal = useMemo(
    () => (source && target ? proposeTransfer(ctx(target), ctx(source), effWater, effPower) : null),
    [source, target, effWater, effPower],
  );

  const resetAmounts = () => {
    setWaterDelta(0);
    setPowerDelta(0);
    setActive(null);
  };

  const swap = () => {
    setSourceId(targetId);
    setTargetId(sourceId);
    resetAmounts();
  };

  const preview = async () => {
    if (!source || !target) return;
    setBusy(true);
    try {
      const res = await api.createTransfer({
        sourceId: source.id,
        targetId: target.id,
        waterDeltaLpm: effWater,
        powerDeltaMw: effPower,
      });
      setActive(res);
      toast(
        res.feasible ? `Transfer #${res.id} proposed in shadow.` : `Transfer #${res.id} is infeasible — check the guardrails.`,
        res.feasible ? "success" : "warning",
      );
      void loadHistory();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Transfer failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const transition = async (action: "virtual" | "verify" | "apply" | "reject") => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await api.transitionTransfer(active.id, action);
      if (action === "apply") {
        toast(
          `Transfer #${active.id} applied — ${source?.name} −${active.waterDeltaLpm} L/min · −${active.powerDeltaMw} MW, ${target?.name} +${active.waterDeltaLpm} L/min · +${active.powerDeltaMw} MW.${res.slewLimited ? " Setpoints were slew-limited." : ""}`,
          "success",
        );
      } else {
        toast(`Transfer #${active.id} ${{ virtual: "applied virtually", verify: "verified", reject: "rejected" }[action]}.`, action === "reject" ? "info" : "success");
      }
      // Terminal steps close the proposal; intermediate ones advance it.
      if (action === "apply" || action === "reject") {
        setActive(null);
        setWaterDelta(0);
        setPowerDelta(0);
      } else {
        setActive({ ...active, status: action });
      }
      void loadHistory();
      void refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Transition failed.", "error");
    } finally {
      setBusy(false);
      setConfirmApply(false);
    }
  };

  const headroomPower = aggregate ? Math.max(0, aggregate.budgets.powerMw - aggregate.accessoryPowerMw) : 0;
  const headroomWater = aggregate ? Math.max(0, aggregate.budgets.waterLpm - aggregate.waterLpm) : 0;
  const zoneName = (id: number) => views.find((z) => z.id === id)?.name ?? `Zone ${id}`;
  const status = (active?.status ?? "shadow") as Status;
  const canApply = !!active && active.feasible && active.withinFacility && status === "verify";

  if (!aggregate) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-80" />
        <Skeleton className="h-24" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        title="Cooling transfer"
        description="Reallocate water flow and chiller power from a zone with headroom to one running hot — behind guardrails and budgets."
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card lg:grid-cols-5">
        {[
          { label: "Total IT load", value: aggregate.itLoadMw.toFixed(2), unit: "MW" },
          { label: "Power used", value: `${Math.round(aggregate.budgetUsage.powerPct)}%`, sub: `of ${aggregate.budgets.powerMw.toFixed(2)} MW` },
          { label: "Water used", value: `${Math.round(aggregate.budgetUsage.waterPct)}%`, sub: `of ${aggregate.budgets.waterLpm.toLocaleString()} L/min` },
          { label: "Power headroom", value: headroomPower.toFixed(2), unit: "MW", tone: "accent" as Tone },
          { label: "Water headroom", value: Math.round(headroomWater).toLocaleString(), unit: "L/min", tone: "accent" as Tone },
        ].map((s, i) => (
          <div key={s.label} className={cx("bg-surface px-5 py-4", i === 4 && "col-span-2 lg:col-span-1")}>
            <Stat label={s.label} value={s.value} unit={s.unit} sub={s.sub} tone={s.tone} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {views.map((z) => (
          <ZoneCard key={z.id} zone={z} role={z.id === sourceId ? "source" : z.id === targetId ? "target" : null} />
        ))}
      </div>

      <Card title="Configure transfer" description="Pick a donor and a recipient, then size the move" icon={SlidersHorizontal}>
        <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line">
            <label htmlFor="source" className="text-xs font-medium text-info">
              From · source zone
            </label>
            <Select
              id="source"
              className="mt-1.5"
              value={sourceId ?? ""}
              onChange={(e) => {
                setSourceId(e.target.value ? Number(e.target.value) : null);
                resetAmounts();
              }}
            >
              <option value="">Select zone…</option>
              {views
                .filter((z) => z.id !== targetId)
                .map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} · {BAND[thermalBand(z.prediction.thermalMarginC)].label}
                  </option>
                ))}
            </Select>
            <div className="mt-3 flex gap-6 text-xs">
              <span className="text-fg-subtle">
                Can give <span className="font-mono font-medium text-fg">{maxPower.toFixed(2)} MW</span>
              </span>
              <span className="text-fg-subtle">
                <span className="font-mono font-medium text-fg">{maxWater} L/min</span>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={swap}
              disabled={!source || !target}
              aria-label="Swap source and target"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-fg-muted ring-1 ring-inset ring-line-strong transition-colors hover:text-accent hover:ring-accent/50 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line">
            <label htmlFor="target" className="text-xs font-medium text-warn">
              To · target zone
            </label>
            <Select
              id="target"
              className="mt-1.5"
              value={targetId ?? ""}
              onChange={(e) => {
                setTargetId(e.target.value ? Number(e.target.value) : null);
                resetAmounts();
              }}
            >
              <option value="">Select zone…</option>
              {views
                .filter((z) => z.id !== sourceId)
                .map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} · {BAND[thermalBand(z.prediction.thermalMarginC)].label}
                  </option>
                ))}
            </Select>
            <div className="mt-3 flex gap-6 text-xs">
              <span className="text-fg-subtle">
                Power{" "}
                <span className={cx("font-mono font-medium", target && target.budgetUsage.powerPct >= 90 ? "text-crit" : "text-fg")}>
                  {target ? `${Math.round(target.budgetUsage.powerPct)}%` : "—"}
                </span>
              </span>
              <span className="text-fg-subtle">
                Water{" "}
                <span className={cx("font-mono font-medium", target && target.budgetUsage.waterPct >= 90 ? "text-crit" : "text-fg")}>
                  {target ? `${Math.round(target.budgetUsage.waterPct)}%` : "—"}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            <Segmented
              ariaLabel="Transfer type"
              size="sm"
              value={mode}
              onChange={(m) => {
                setMode(m);
                if (m === "power") setWaterDelta(0);
                if (m === "water") setPowerDelta(0);
              }}
              options={[
                { value: "both", label: "Power & water" },
                { value: "power", label: "Power only" },
                { value: "water", label: "Water only" },
              ]}
            />
            {mode !== "water" ? (
              <div>
                <div className="flex items-baseline justify-between text-xs">
                  <label htmlFor="power" className="flex items-center gap-1.5 font-medium text-fg-muted">
                    <Zap className="h-3.5 w-3.5 text-warn" aria-hidden /> Chiller power
                  </label>
                  <span className="font-mono tabular-nums text-fg">{effPower.toFixed(2)} MW</span>
                </div>
                <div className="mt-2">
                  <Slider id="power" value={effPower} min={0} max={maxPower || 0.01} step={0.01} onChange={setPowerDelta} disabled={!source || !target} tone="warn" />
                </div>
                <p className="mt-1 text-[11px] text-fg-faint">0 – {maxPower.toFixed(2)} MW available</p>
              </div>
            ) : null}
            {mode !== "power" ? (
              <div>
                <div className="flex items-baseline justify-between text-xs">
                  <label htmlFor="water" className="flex items-center gap-1.5 font-medium text-fg-muted">
                    <Droplets className="h-3.5 w-3.5 text-info" aria-hidden /> Water flow
                  </label>
                  <span className="font-mono tabular-nums text-fg">{effWater} L/min</span>
                </div>
                <div className="mt-2">
                  <Slider id="water" value={effWater} min={0} max={maxWater || 1} step={10} onChange={setWaterDelta} disabled={!source || !target} tone="info" />
                </div>
                <p className="mt-1 text-[11px] text-fg-faint">0 – {maxWater} L/min above the {GUARDRAILS.flowMinLpm} L/min floor</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line">
            <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
              <ThermometerSun className="h-3.5 w-3.5" aria-hidden /> Estimated impact
            </p>
            {proposal && source && target ? (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-[11px] text-fg-faint">{target.name} margin</dt>
                    <dd className="mt-1 text-sm">
                      <BeforeAfter before={target.prediction.thermalMarginC} after={proposal.target.prediction.thermalMarginC} unit="°C" goodWhen="up" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-fg-faint">{target.name} chip</dt>
                    <dd className="mt-1 text-sm">
                      <BeforeAfter before={target.prediction.chipTempC} after={proposal.target.prediction.chipTempC} unit="°C" goodWhen="down" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-fg-faint">{source.name} margin</dt>
                    <dd className="mt-1 text-sm">
                      <BeforeAfter before={source.prediction.thermalMarginC} after={proposal.source.prediction.thermalMarginC} unit="°C" goodWhen="up" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-fg-faint">Guardrails</dt>
                    <dd className="mt-1">
                      <Badge tone={proposal.feasible ? "ok" : "crit"} dot>
                        {proposal.feasible ? "All within limits" : `${proposal.violations.length} violation(s)`}
                      </Badge>
                    </dd>
                  </div>
                </dl>
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  onClick={() => void preview()}
                  disabled={busy || (effWater === 0 && effPower === 0) || active != null}
                >
                  {busy && !active ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  Propose transfer (shadow)
                </Button>
              </>
            ) : (
              <p className="mt-3 text-sm text-fg-subtle">Pick a source and a target zone to see the impact.</p>
            )}
          </div>
        </div>
      </Card>

      {active && source && target ? (
        <Card
          title={`Transfer #${active.id}`}
          description={`${source.name} → ${target.name} · ${active.waterDeltaLpm} L/min · ${active.powerDeltaMw} MW`}
          icon={ArrowRight}
          action={
            <span className="flex flex-wrap gap-1.5">
              <Badge tone={active.feasible ? "ok" : "crit"}>{active.feasible ? "Feasible" : "Infeasible"}</Badge>
              <Badge tone={active.withinFacility ? "ok" : "warn"}>{active.withinFacility ? "Within facility budget" : "Exceeds facility budget"}</Badge>
            </span>
          }
        >
          <Stepper
            steps={[
              { label: "Proposed", detail: "Shadow", state: "done" },
              { label: "Applied virtually", detail: "Digital twin only", state: status === "shadow" ? "active" : "done" },
              { label: "Verified", detail: "Operator check", state: status === "verify" ? "done" : status === "virtual" ? "active" : "pending" },
              { label: "Applied", detail: "Setpoints + budgets", state: status === "verify" ? "active" : "pending" },
            ]}
          />

          <div className="mt-6">
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th>Zone</Th>
                  <Th>Power budget</Th>
                  <Th>Water budget</Th>
                  <Th>Thermal margin</Th>
                  <Th>Chip temp</Th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Source", source, active.source],
                    ["Target", target, active.target],
                  ] as const
                ).map(([role, z, prop]) => (
                  <tr key={role}>
                    <Td>
                      <span className="font-medium text-fg">{z.name}</span>{" "}
                      <span className={cx("text-xs", role === "Source" ? TONE_TEXT.info : TONE_TEXT.warn)}>{role}</span>
                    </Td>
                    <Td>
                      <BeforeAfter before={z.budgetUsage.powerPct} after={(prop.prediction.accessoryPowerMw / z.budgets.powerMw) * 100} unit="%" goodWhen="down" digits={0} />
                    </Td>
                    <Td>
                      <BeforeAfter before={z.budgetUsage.waterPct} after={(prop.prediction.flowLpm / z.budgets.waterLpm) * 100} unit="%" goodWhen="down" digits={0} />
                    </Td>
                    <Td>
                      <BeforeAfter before={z.prediction.thermalMarginC} after={prop.prediction.thermalMarginC} unit="°C" goodWhen="up" />
                    </Td>
                    <Td>
                      <BeforeAfter before={z.prediction.chipTempC} after={prop.prediction.chipTempC} unit="°C" goodWhen="down" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          {active.violations.length ? (
            <ul className="mt-4 space-y-1 rounded-xl bg-crit/5 p-3 text-xs text-crit ring-1 ring-inset ring-crit/20">
              {active.violations.map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void transition("virtual")} disabled={busy || status !== "shadow"}>
              1 · Apply virtually
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void transition("verify")} disabled={busy || status !== "virtual"}>
              2 · Verify
            </Button>
            <Button variant="success" size="sm" onClick={() => setConfirmApply(true)} disabled={busy || !canApply}>
              3 · Apply transfer
            </Button>
            <Button variant="ghost" size="sm" className="text-crit hover:text-crit" onClick={() => void transition("reject")} disabled={busy}>
              Reject
            </Button>
            {!active.withinFacility ? (
              <p className="text-xs text-warn">Applying is blocked while the facility budget would be exceeded.</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card title="Recent transfers" description="The 10 most recent proposals" icon={History}>
        {history.length === 0 ? (
          <p className="text-sm text-fg-subtle">No transfers yet.</p>
        ) : (
          <Table minWidth={560}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Route</Th>
                <Th right>Water</Th>
                <Th right>Power</Th>
                <Th>Status</Th>
                <Th className="text-right">Created</Th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map((t) => {
                const s = statusMeta(t.status);
                return (
                  <tr key={t.id}>
                    <Td className="font-mono text-xs">#{t.id}</Td>
                    <Td>
                      <span className="text-fg">{zoneName(t.sourceId)}</span>
                      <ArrowRight className="mx-1.5 inline h-3 w-3 text-fg-faint" aria-hidden />
                      <span className="text-fg">{zoneName(t.targetId)}</span>
                    </Td>
                    <Td right>{t.waterDeltaLpm} L/min</Td>
                    <Td right>{t.powerDeltaMw} MW</Td>
                    <Td>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </Td>
                    <Td className="text-right text-xs text-fg-subtle">{fmtDateTime(t.createdAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-fg-faint">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Transfers are re-checked against live guardrails and pass through the slew-rate limiter when applied.
      </p>

      <ConfirmDialog
        open={confirmApply}
        title="Apply this transfer?"
        body={`Writes the transferred setpoints to both zones (slew-limited) and moves budget: ${source?.name ?? ""} gives up ${active?.waterDeltaLpm ?? 0} L/min and ${active?.powerDeltaMw ?? 0} MW, ${target?.name ?? ""} gains the same. Guardrails are re-checked on live telemetry first.`}
        confirmLabel="Apply transfer"
        tone="danger"
        busy={busy}
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
