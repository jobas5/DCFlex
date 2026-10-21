import { createRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Activity,
  Check,
  FlaskConical,
  HeartPulse,
  ListChecks,
  Loader2,
  Power,
  ScrollText,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LineChart } from "../components/LineChart";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  buttonStyles,
  Card,
  ConfirmDialog,
  cx,
  EmptyState,
  KindBadge,
  PageHeader,
  Segmented,
  Setpoints as SetpointChips,
  Skeleton,
  Slider,
  Stat,
  Stepper,
  Table,
  Td,
  Th,
  TONE_TEXT,
} from "../components/ui";
import { api, type ControlResponse, type ControlZoneView, type ValidationResponse } from "../lib/api";
import { useSim } from "../lib/simContext";
import { fmtDateTime, fmtTick } from "../lib/time";
import { CHART } from "../lib/tokens";
import { GUARDRAILS, MARGIN_TIERS, type Setpoints } from "../lib/twin/types";
import { rootRoute } from "./root";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function useValidation(zoneId: number) {
  const [data, setData] = useState<ValidationResponse | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api.getValidation(zoneId));
    } catch {
      /* keep last good data */
    }
  }, [zoneId]);
  useEffect(() => {
    setData(null);
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);
  return { data, reload: load };
}

/* ------------------------------------------------------------------ */
/* Validation (shadow prediction vs live config)                        */
/* ------------------------------------------------------------------ */

function ValidationCard({ zone, data }: { zone: ControlZoneView; data: ValidationResponse | null }) {
  const [showAll, setShowAll] = useState(false);

  if (!data) {
    return (
      <Card title="Validation" icon={Activity}>
        <Skeleton className="h-64" />
      </Card>
    );
  }

  if (!data.hasShadowConfig) {
    return (
      <Card title="Validation" description="Shadow prediction vs the live configuration" icon={Activity}>
        <EmptyState
          icon={FlaskConical}
          title="No shadow config for this zone"
          body="Run the what-if engine for this zone and send the recommendation to shadow, or set setpoints manually below."
          action={
            <Link to="/optimize" className={buttonStyles("primary", "sm")}>
              <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Open what-if engine
            </Link>
          }
        />
      </Card>
    );
  }

  const labels = data.samples.map((s) => fmtTick(s.tick).slice(0, 5));
  const rows = showAll ? data.samples.slice().reverse() : data.samples.slice(-5).reverse();
  const { criteria } = data;

  return (
    <Card
      title="Validation"
      description={`Shadow config predicted against live telemetry · ${data.total} samples (7-day window)`}
      icon={Activity}
      action={<Badge tone={data.ready ? "ok" : "info"} dot>{data.ready ? "Passed" : "Collecting"}</Badge>}
    >
      <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line xl:grid-cols-4">
        <Stat
          label="Samples"
          value={data.total}
          sub={`min ${criteria.minSamples}`}
          tone={data.total >= criteria.minSamples ? "ok" : undefined}
        />
        <Stat
          label="Feasible"
          value={pct(data.feasibleRate)}
          sub={`need ≥ ${pct(criteria.feasibleRate)}`}
          tone={data.feasibleRate >= criteria.feasibleRate ? "ok" : "warn"}
        />
        <Stat
          label="On target"
          value={pct(data.meetsRate)}
          sub={`need ≥ ${pct(criteria.meetsRate)}`}
          tone={data.meetsRate >= criteria.meetsRate ? "ok" : "warn"}
        />
        <Stat
          label="PUE overshoot"
          value={data.avgPueGap.toFixed(4)}
          sub="avg above target"
          tone={data.avgPueGap <= 0 ? "ok" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {(
          [
            ["PUE", "predictedPue", "actualPue", zone.targets.pue, 4],
            ["WUE", "predictedWue", "actualWue", zone.targets.wue, 3],
          ] as const
        ).map(([metric, predKey, actKey, target, digits]) => {
          const last = data.samples[data.samples.length - 1];
          return (
            <div key={metric} className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-fg">{metric}</p>
                <p className="text-xs tabular-nums text-fg-subtle">
                  shadow <span className="font-mono text-accent">{last ? last[predKey].toFixed(digits) : "—"}</span> · live{" "}
                  <span className="font-mono text-fg-muted">{last ? last[actKey].toFixed(digits) : "—"}</span>
                </p>
              </div>
              <LineChart
                height={180}
                ariaLabel={`${metric}: shadow prediction vs live configuration against target`}
                labels={labels}
                series={[
                  { label: "Shadow", color: CHART.cyan, values: data.samples.map((s) => s[predKey]), area: true },
                  { label: "Live", color: CHART.slate, values: data.samples.map((s) => s[actKey]), dashed: true },
                ]}
                thresholds={[{ value: target, label: `target ${target.toFixed(3)}`, color: "var(--ok)" }]}
                yFormat={(v) => v.toFixed(3)}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-fg-subtle">Recent samples</p>
          {data.samples.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {showAll ? "Show fewer" : `Show all ${data.samples.length}`}
            </button>
          ) : null}
        </div>
        <div className={cx(showAll && "max-h-96 overflow-y-auto")}>
          <Table minWidth={620}>
            <thead>
              <tr>
                <Th>Sim time</Th>
                <Th right>Shadow PUE</Th>
                <Th right>Live PUE</Th>
                <Th right>Shadow WUE</Th>
                <Th right>Live WUE</Th>
                <Th right>Chip</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.tick}>
                  <Td className="font-mono text-xs">{fmtTick(s.tick)}</Td>
                  <Td right className="text-accent">{s.predictedPue.toFixed(4)}</Td>
                  <Td right>{s.actualPue.toFixed(4)}</Td>
                  <Td right className="text-accent">{s.predictedWue.toFixed(3)}</Td>
                  <Td right>{s.actualWue.toFixed(3)}</Td>
                  <Td right>{s.chipTempC.toFixed(1)}°C</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={s.feasible ? "ok" : "crit"}>{s.feasible ? "feasible" : "violation"}</Badge>
                      <Badge tone={s.meetsTarget ? "ok" : "warn"}>{s.meetsTarget ? "on target" : "off target"}</Badge>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Closed-loop gate                                                    */
/* ------------------------------------------------------------------ */

function Criterion({ ok, title, value }: { ok: boolean; title: string; value?: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={cx(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
          ok ? "bg-ok/15 text-ok ring-ok/30" : "bg-surface-3 text-fg-faint ring-line-strong",
        )}
      >
        {ok ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
      </span>
      <span className={cx("flex-1 text-sm", ok ? "text-fg" : "text-fg-subtle")}>{title}</span>
      {value ? <span className={cx("font-mono text-xs tabular-nums", ok ? "text-ok" : "text-fg-subtle")}>{value}</span> : null}
    </li>
  );
}

function GateCard({
  zone,
  validation,
  onModeChange,
}: {
  zone: ControlZoneView;
  validation: ValidationResponse | null;
  onModeChange: (res: ControlResponse) => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<"closed_loop" | "shadow" | null>(null);
  const [busy, setBusy] = useState(false);
  const closed = zone.mode === "closed_loop";
  const v = validation;
  const commsOk = zone.commsOk && !zone.failSafeActive;
  const checks = v
    ? [
        { ok: v.hasShadowConfig, title: "Shadow config set" },
        { ok: v.total >= v.criteria.minSamples, title: "Enough samples", value: `${v.total}/${v.criteria.minSamples}` },
        { ok: v.feasibleRate >= v.criteria.feasibleRate, title: "Inside guardrails", value: pct(v.feasibleRate) },
        { ok: v.meetsRate >= v.criteria.meetsRate, title: `On target (±${v.criteria.tolerance})`, value: pct(v.meetsRate) },
        { ok: commsOk, title: "Comms & watchdog healthy" },
      ]
    : [];
  const passed = checks.filter((c) => c.ok).length;
  const ready = v != null && v.ready && commsOk;

  const switchMode = async (mode: "closed_loop" | "shadow") => {
    setBusy(true);
    try {
      const res = await api.setControlMode(zone.id, mode);
      onModeChange(res);
      toast(
        mode === "closed_loop"
          ? `${zone.name} is now in closed-loop control.`
          : `${zone.name} returned to shadow mode — no further writeback.`,
        "success",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Mode change failed.", "error");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const ringPct = checks.length ? passed / checks.length : 0;
  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <Card title="Closed-loop gate" description="All checks must pass before writeback" icon={ListChecks}>
      <div className="flex items-center gap-4">
        <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0 -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke={closed || ready ? "var(--ok)" : "var(--accent)"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${C * ringPct} ${C}`}
            className="transition-[stroke-dasharray] duration-500"
          />
        </svg>
        <div>
          <p className={cx("text-lg font-semibold", closed ? TONE_TEXT.ok : ready ? TONE_TEXT.ok : "text-fg")}>
            {closed ? "Closed-loop active" : ready ? "Ready to promote" : `${passed} of ${checks.length || 5} checks`}
          </p>
          <p className="text-xs text-fg-subtle">
            {closed
              ? "The engine writes slew-limited setpoints every tick."
              : ready
                ? "Validated on live telemetry."
                : "Validation keeps sampling every tick."}
          </p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-line border-y border-line">
        {checks.map((c) => (
          <Criterion key={c.title} {...c} />
        ))}
      </ul>

      <div className="mt-4">
        {closed ? (
          <Button variant="secondary" className="w-full" onClick={() => setConfirm("shadow")} disabled={busy}>
            <Undo2 className="h-4 w-4" aria-hidden /> Return to shadow
          </Button>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => setConfirm("closed_loop")} disabled={!ready || busy}>
            <Power className="h-4 w-4" aria-hidden /> Enable closed-loop
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "closed_loop" ? `Enable closed-loop on ${zone.name}?` : `Return ${zone.name} to shadow?`}
        body={
          confirm === "closed_loop"
            ? "The validated shadow config becomes the real config (slew-limited), and the engine starts steering this zone toward its PUE/WUE targets every tick. Guardrails and the watchdog stay armed."
            : "The engine stops writing setpoints. Current setpoints are kept; future changes are logged as would-be actions only."
        }
        confirmLabel={confirm === "closed_loop" ? "Enable closed-loop" : "Return to shadow"}
        tone={confirm === "closed_loop" ? "warn" : "primary"}
        busy={busy}
        onConfirm={() => confirm && void switchMode(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Live engine status                                                  */
/* ------------------------------------------------------------------ */

function EngineCard({ zone }: { zone: ControlZoneView }) {
  const { data: live } = useSim();
  const liveZone = useMemo(() => live?.zones.find((z) => z.id === zone.id), [live, zone.id]);
  const t = liveZone?.telemetry;
  const p = liveZone?.prediction;
  const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

  const readings: { label: string; value: string; ok?: boolean }[] = [
    { label: "Supply", value: t ? `${t.cduSupplyC.toFixed(1)}°C` : "—" },
    { label: "Return", value: t ? `${t.cduReturnC.toFixed(1)}°C` : "—" },
    { label: "ΔP", value: p ? `${p.deltaPKpa.toFixed(0)} kPa` : "—", ok: p ? inRange(p.deltaPKpa, GUARDRAILS.deltaPMinKpa, GUARDRAILS.deltaPMaxKpa) : undefined },
    { label: "Flow", value: p ? `${p.flowLpm} L/min` : "—", ok: p ? inRange(p.flowLpm, GUARDRAILS.flowMinLpm, GUARDRAILS.flowMaxLpm) : undefined },
    { label: "Chip", value: p ? `${p.chipTempC.toFixed(1)}°C` : "—", ok: p ? p.chipTempC <= GUARDRAILS.chipTempMaxC : undefined },
    { label: "Margin", value: p ? `${p.thermalMarginC.toFixed(1)}°C` : "—", ok: p ? p.thermalMarginC >= MARGIN_TIERS.green : undefined },
  ];

  return (
    <Card
      title="Live engine"
      description={zone.mode === "closed_loop" ? "Closed-loop · writing setpoints" : "Shadow · read-only"}
      icon={HeartPulse}
      action={
        zone.failSafeActive ? (
          <Badge tone="crit" dot>
            Fail-safe
          </Badge>
        ) : (
          <Badge tone={zone.commsOk ? "ok" : "warn"} dot>
            {zone.commsOk ? "Comms OK" : "Comms lost"}
          </Badge>
        )
      }
    >
      <p className="text-xs text-fg-subtle">
        Heartbeat {zone.heartbeatAgeSec !== null ? `${zone.heartbeatAgeSec}s ago` : "never"} · fail-safe after {zone.watchdogTimeoutSec}s
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {readings.map((r) => (
          <div key={r.label} className="rounded-lg bg-surface-2/60 px-2.5 py-2 ring-1 ring-inset ring-line">
            <dt className="flex items-center justify-between text-[11px] text-fg-faint">
              {r.label}
              {r.ok !== undefined ? (
                <span className={cx("h-1.5 w-1.5 rounded-full", r.ok ? "bg-ok" : "bg-crit")} aria-label={r.ok ? "in bounds" : "out of bounds"} />
              ) : null}
            </dt>
            <dd className="mt-0.5 truncate text-sm font-medium tabular-nums text-fg">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11px] text-fg-faint">Effective setpoints{zone.failSafeActive ? " (factory, fail-safe)" : ""}</p>
      <SetpointChips sp={zone.effectiveSetpoints} className="mt-1.5" />
      {zone.slewLimited ? <p className="mt-2 text-[11px] text-warn">Last change was clamped by the slew-rate limiter.</p> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Setpoint control                                                    */
/* ------------------------------------------------------------------ */

const SETPOINT_DEFS = [
  { key: "coolantSupplyC", label: "Coolant supply", unit: "°C", min: 16, max: 34, step: 0.5, rate: (s: ControlZoneView) => `±${s.slewLimits.maxTempStepC}°C / step` },
  { key: "pumpSpeedPct", label: "Pump speed", unit: "%", min: 40, max: 100, step: 1, rate: (s: ControlZoneView) => `±${s.slewLimits.maxPumpStepPct}% / step` },
  { key: "valvePosPct", label: "Bypass valve", unit: "%", min: 30, max: 100, step: 1, rate: (s: ControlZoneView) => `±${s.slewLimits.maxValveStepPct}% / step` },
  { key: "cduSetpointC", label: "CDU supply", unit: "°C", min: 16, max: 34, step: 0.5, rate: (s: ControlZoneView) => `±${s.slewLimits.maxTempStepC}°C / step` },
] as const;

function SetpointControl({ zone, onApplied }: { zone: ControlZoneView; onApplied: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [draft, setDraft] = useState<Setpoints>(zone.shadowSetpoints ?? zone.currentSetpoints);
  const [applying, setApplying] = useState(false);

  // Re-seed only on a real change (another zone, or a new shadow config). The
  // control state is polled every 5s; depending on object refs here would wipe
  // manual edits and flip the mode back to Auto.
  const shadowKey = JSON.stringify(zone.shadowSetpoints ?? null);
  useEffect(() => {
    setDraft(zone.shadowSetpoints ?? zone.currentSetpoints);
    setMode("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.id, shadowKey]);

  const editable = mode === "manual";
  const closed = zone.mode === "closed_loop";

  const apply = async () => {
    setApplying(true);
    try {
      if (!closed) {
        await api.applyShadow(zone.id, draft);
        toast("Shadow config updated — validation restarted.", "success");
      } else {
        const res = await api.applySetpoints(zone.id, draft, "Manual setpoint change");
        toast(`Setpoints written.${res.slewLimited ? " The slew-rate limiter clamped the jump." : ""}`, "success");
      }
      setMode("auto");
      onApplied();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Apply failed.", "error");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card
      title="Setpoint control"
      description={
        closed
          ? "Manual writes go to the controllers through the slew limiter."
          : "Auto tracks the shadow config. Manual edits replace it and restart validation."
      }
      icon={SlidersHorizontal}
      action={
        <Segmented
          ariaLabel="Control mode"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "auto", label: "Auto" },
            { value: "manual", label: "Manual" },
          ]}
        />
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SETPOINT_DEFS.map((d) => {
          const current = zone.currentSetpoints[d.key];
          const target = draft[d.key];
          const changed = Math.abs(target - current) > 1e-9;
          return (
            <div key={d.key} className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line">
              <p className="text-xs font-medium text-fg-muted">{d.label}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums text-fg">
                  {target.toFixed(d.step < 1 ? 1 : 0)}
                  <span className="ml-0.5 text-xs font-normal text-fg-subtle">{d.unit}</span>
                </span>
                {changed ? (
                  <span className="text-xs tabular-nums text-fg-faint">
                    from {current.toFixed(d.step < 1 ? 1 : 0)}
                    {d.unit}
                  </span>
                ) : (
                  <span className="text-xs text-fg-faint">current</span>
                )}
              </div>
              <div className="mt-3">
                <Slider
                  value={target}
                  min={d.min}
                  max={d.max}
                  step={d.step}
                  disabled={!editable}
                  tone={editable ? "accent" : "neutral"}
                  ariaLabel={`${d.label} target`}
                  onChange={(v) => setDraft((prev) => ({ ...prev, [d.key]: v }))}
                />
              </div>
              <div className="mt-1 flex justify-between gap-2 font-mono text-[10px] text-fg-faint">
                <span>{d.min}</span>
                <span className="font-sans">{d.rate(zone)}</span>
                <span>{d.max}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {editable ? (
          <>
            <Button variant="primary" onClick={() => void apply()} disabled={applying}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {closed ? "Write setpoints" : "Apply to shadow"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(zone.shadowSetpoints ?? zone.currentSetpoints)}>
              Reset
            </Button>
            <p className="text-xs text-fg-subtle">Guardrails and budgets are re-checked server-side.</p>
          </>
        ) : (
          <p className="text-xs text-fg-subtle">
            {zone.shadowSetpoints
              ? "Showing the shadow config as target. Switch to Manual to edit."
              : "No shadow config yet — switch to Manual to set one."}
          </p>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Control log                                                         */
/* ------------------------------------------------------------------ */

function ControlLog({ zone, actions }: { zone: ControlZoneView; actions: ControlResponse["actions"] }) {
  const rows = actions.filter((a) => a.clusterId === zone.id).slice(0, 8);
  return (
    <Card title="Control log" description={`Recent actions for ${zone.name}`} icon={ScrollText}>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-subtle">No control actions recorded for this zone yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((a) => (
            <li key={a.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <KindBadge kind={a.kind} />
                <span className="text-xs tabular-nums text-fg-faint">{fmtDateTime(a.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-sm text-fg-muted">{a.note || "—"}</p>
              <SetpointChips sp={a.setpoints} className="mt-2" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function ShadowPage() {
  const navigate = useNavigate();
  const { zone: zoneId } = useSearch({ from: "/shadow" });
  const [control, setControl] = useState<ControlResponse | null>(null);
  const { data: validation, reload: reloadValidation } = useValidation(zoneId);

  const refresh = useCallback(async () => {
    try {
      setControl(await api.getControl());
    } catch {
      /* keep last good data */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const zone = control?.zones.find((z) => z.id === zoneId);
  const hasConfig = zone?.shadowSetpoints != null;
  const ready = validation?.ready ?? false;
  const closed = zone?.mode === "closed_loop";

  const steps: { label: string; detail?: string; state: "done" | "active" | "pending" }[] = [
    { label: "Analyze", detail: "What-if recommendation", state: hasConfig || closed ? "done" : "active" },
    { label: "Shadow config", detail: hasConfig ? "Tracking live telemetry" : "Not set", state: hasConfig || closed ? "done" : "pending" },
    {
      label: "Validate",
      detail: validation && hasConfig ? `${validation.total}/${validation.criteria.minSamples}+ samples` : undefined,
      state: ready || closed ? "done" : hasConfig ? "active" : "pending",
    },
    { label: "Closed-loop", detail: closed ? "Active" : undefined, state: closed ? "done" : ready ? "active" : "pending" },
  ];

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Shadow validation"
        description="Prove a recommendation on live telemetry before it controls real equipment."
        actions={
          control ? (
            <Segmented
              ariaLabel="Zone"
              size="sm"
              value={zoneId}
              onChange={(id) => navigate({ to: "/shadow", search: { zone: id }, replace: true })}
              options={control.zones.map((z) => ({
                value: z.id,
                label: (
                  <span className="flex items-center gap-1.5">
                    {z.mode === "closed_loop" ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="closed-loop" /> : null}
                    {z.name}
                  </span>
                ),
              }))}
            />
          ) : null
        }
      />

      {!zone ? (
        <div className="space-y-4">
          <Skeleton className="h-16" />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      ) : (
        <>
          <Card>
            <Stepper steps={steps} />
          </Card>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
              <ValidationCard zone={zone} data={validation} />
              <SetpointControl
                zone={zone}
                onApplied={() => {
                  void refresh();
                  void reloadValidation();
                }}
              />
              <ControlLog zone={zone} actions={control?.actions ?? []} />
            </div>
            <div className="space-y-6 lg:sticky lg:top-20">
              <GateCard
                zone={zone}
                validation={validation}
                onModeChange={(res) => {
                  setControl(res);
                  void reloadValidation();
                }}
              />
              <EngineCard zone={zone} />
            </div>
          </div>
        </>
      )}
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
