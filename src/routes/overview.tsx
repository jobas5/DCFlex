import { createRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Box,
  Cpu,
  Droplets,
  Gauge,
  ThermometerSun,
  TrendingDown,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Sparkline } from "../components/LineChart";
import {
  Badge,
  buttonStyles,
  Card,
  cx,
  Delta,
  KpiTile,
  Meter,
  PageHeader,
  Segmented,
  Setpoints,
  Skeleton,
  STATUS_LABEL,
  STATUS_TONE,
  TONE_TEXT,
  usageTone,
  type Tone,
} from "../components/ui";
import { api, type HistoryPoint } from "../lib/api";
import { useSim } from "../lib/simContext";
import { fmtTime } from "../lib/time";
import { CHART } from "../lib/tokens";
import { GUARDRAILS, MARGIN_TIERS, zoneStatus, type ForecastHorizon, type ZoneView } from "../lib/twin/types";
import { rootRoute } from "./root";

const RANGES = [
  { value: "1h", label: "1h", limit: 6 },
  { value: "6h", label: "6h", limit: 36 },
  { value: "24h", label: "24h", limit: 144 },
] as const;
type RangeId = (typeof RANGES)[number]["value"];

const HORIZONS: { id: ForecastHorizon; label: string }[] = [
  { id: "15m", label: "15 min" },
  { id: "1h", label: "1 hour" },
  { id: "4h", label: "4 hours" },
  { id: "24h", label: "24 hours" },
];

const pctChange = (cur: number, prev: number | undefined): number | null =>
  prev === undefined || !Number.isFinite(prev) || prev === 0 ? null : ((cur - prev) / prev) * 100;

const modeLabel = (mode: string) => (mode === "closed_loop" ? "Closed-loop" : "Shadow");

function useHistory(clusterId: number | undefined, limit: number, enabled = true) {
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.telemetryHistory(clusterId, limit);
        if (!cancelled) setHistory(res.history);
      } catch {
        /* keep last good data */
      }
    };
    setHistory(null);
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [clusterId, limit, enabled]);
  return history;
}

/* ------------------------------------------------------------------ */
/* Zone selector cards                                                 */
/* ------------------------------------------------------------------ */

function ZoneCard({ zone, selected, onSelect }: { zone: ZoneView; selected: boolean; onSelect: () => void }) {
  const tone = STATUS_TONE[zone.status];
  const chipPct = (zone.prediction.chipTempC / GUARDRAILS.chipTempMaxC) * 100;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        "group relative w-full rounded-2xl border bg-surface p-4 text-left shadow-card transition-[border-color,background-color] focus-visible:outline-2 focus-visible:outline-accent",
        selected ? "border-accent/60 ring-1 ring-accent/30" : "border-line hover:border-line-strong hover:bg-surface-2/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span className={cx("h-2 w-2 rounded-full", tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-crit")} aria-hidden />
          {zone.name}
        </span>
        <Badge tone={zone.mode === "closed_loop" ? "accent" : "neutral"}>{modeLabel(zone.mode)}</Badge>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] text-fg-faint">Thermal margin</p>
          <p className={cx("text-2xl font-semibold tabular-nums tracking-tight", TONE_TEXT[tone])}>
            {zone.margin.toFixed(1)}
            <span className="ml-0.5 text-sm font-medium text-fg-subtle">°C</span>
          </p>
        </div>
        <p className="pb-1 text-right text-xs tabular-nums text-fg-subtle">
          {zone.prediction.chipTempC.toFixed(1)}°C <span className="text-fg-faint">/ {GUARDRAILS.chipTempMaxC}°C</span>
        </p>
      </div>
      <Meter value={chipPct} tone={tone} className="mt-2" label={`${zone.name} chip temperature vs limit`} />
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
        {[
          ["IT load", `${zone.telemetry.itLoadMw.toFixed(2)}`, "MW"],
          ["PUE", zone.prediction.pue.toFixed(3), ""],
          ["WUE", zone.prediction.wue.toFixed(3), ""],
        ].map(([k, v, u]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] text-fg-faint">{k}</dt>
            <dd className="truncate text-sm font-medium tabular-nums text-fg">
              {v}
              {u ? <span className="ml-0.5 text-[11px] font-normal text-fg-subtle">{u}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Zone detail                                                         */
/* ------------------------------------------------------------------ */

function Reading({
  label,
  value,
  sub,
  meter,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  meter?: number;
  tone?: Tone;
}) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-fg-subtle">{label}</span>
        <span className={cx("text-sm font-medium tabular-nums", tone ? TONE_TEXT[tone] : "text-fg")}>{value}</span>
      </div>
      {meter !== undefined ? <Meter value={meter} tone={tone ?? "accent"} className="mt-1.5" label={label} /> : null}
      {sub ? <p className="mt-1 text-[11px] text-fg-faint">{sub}</p> : null}
    </div>
  );
}

function MiniTrend({
  label,
  value,
  unit,
  change,
  goodWhen,
  values,
  color,
  labels,
  format,
  target,
}: {
  label: string;
  value: string;
  unit?: string;
  change: number | null;
  goodWhen: "up" | "down" | "neutral";
  values: number[];
  color: string;
  labels: string[];
  format: (v: number) => string;
  target?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2/60 p-3.5 ring-1 ring-inset ring-line">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-fg-subtle">{label}</p>
        {target ? <span className="text-[11px] text-fg-faint">{target}</span> : null}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="text-lg font-semibold tabular-nums text-fg">
          {value}
          {unit ? <span className="ml-1 text-xs font-normal text-fg-subtle">{unit}</span> : null}
        </p>
        <Delta value={change} goodWhen={goodWhen} />
      </div>
      <div className="mt-2">
        <Sparkline values={values} color={color} label={label} labels={labels} format={format} height={36} />
      </div>
    </div>
  );
}

function ForecastStrip({ zone }: { zone: ZoneView }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {HORIZONS.map((h) => {
        const f = zone.forecast[h.id];
        const tone = STATUS_TONE[zoneStatus(f.worstMargin)];
        return (
          <div key={h.id} className="rounded-xl bg-surface-2/60 px-3.5 py-3 ring-1 ring-inset ring-line">
            <div className="flex items-center justify-between">
              <p className="text-xs text-fg-subtle">Next {h.label}</p>
              {f.rising ? (
                <TrendingUp className="h-3.5 w-3.5 text-warn" aria-label="rising" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-ok" aria-label="falling" />
              )}
            </div>
            <p className={cx("mt-1 text-lg font-semibold tabular-nums", TONE_TEXT[tone])}>
              {f.worstMargin.toFixed(1)}
              <span className="ml-0.5 text-xs font-normal text-fg-subtle">°C</span>
            </p>
            <p className="text-[11px] tabular-nums text-fg-faint">min margin · peak {f.peakChipTempC.toFixed(1)}°</p>
          </div>
        );
      })}
    </div>
  );
}

function ZoneDetail({ zone, limit }: { zone: ZoneView; limit: number }) {
  const history = useHistory(zone.id, limit);
  const tone = STATUS_TONE[zone.status];
  const p = zone.prediction;
  const t = zone.telemetry;

  if (!history) {
    return (
      <Card>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </Card>
    );
  }

  const labels = history.map((h) => fmtTime(h.timestamp).slice(0, 5));
  const first = history[0];
  const margins = history.map((h) => GUARDRAILS.chipTempMaxC - h.gpuDieC);
  const flowPct =
    ((p.flowLpm - GUARDRAILS.flowMinLpm) / (GUARDRAILS.flowMaxLpm - GUARDRAILS.flowMinLpm)) * 100;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {zone.name}
          <Badge tone={tone} dot>
            {STATUS_LABEL[zone.status]}
          </Badge>
        </span>
      }
      description={`${modeLabel(zone.mode)} mode · targets PUE ${zone.targets.pue.toFixed(3)} · WUE ${zone.targets.wue.toFixed(3)} L/kWh`}
      action={
        <>
          <Link to="/facility" search={{ sensor: `${zone.id}:gpu_die` }} className={buttonStyles("ghost", "sm")}>
            <Box className="h-3.5 w-3.5" aria-hidden /> Sensors in 3D
          </Link>
          <Link to="/shadow" search={{ zone: zone.id }} className={buttonStyles("secondary", "sm")}>
            Control <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs text-fg-subtle">Thermal margin to the {GUARDRAILS.chipTempMaxC}°C limit</p>
              <p className={cx("mt-1 text-3xl font-semibold tabular-nums tracking-tight", TONE_TEXT[tone])}>
                {zone.margin.toFixed(1)}
                <span className="ml-1 text-base font-medium text-fg-subtle">°C</span>
              </p>
            </div>
            <Delta
              value={first ? zone.margin - (GUARDRAILS.chipTempMaxC - first.gpuDieC) : null}
              unit="°C"
              goodWhen="up"
              suffix=" in range"
            />
          </div>
          <div className="mt-3">
            {history.length > 1 ? (
              <LineChart
                height={210}
                ariaLabel={`${zone.name} thermal margin history`}
                labels={labels}
                series={[{ label: "Margin", color: CHART.emerald, values: margins, area: true }]}
                bands={[
                  { lo: -10, hi: MARGIN_TIERS.yellow, color: "var(--crit)" },
                  { lo: MARGIN_TIERS.yellow, hi: MARGIN_TIERS.green, color: "var(--warn)" },
                ]}
                thresholds={[{ value: MARGIN_TIERS.green, label: `warning < ${MARGIN_TIERS.green}°C`, color: "var(--warn)" }]}
                yFormat={(v) => `${v.toFixed(0)}°`}
              />
            ) : (
              <div className="flex h-[210px] items-center justify-center rounded-xl border border-dashed border-line-strong text-sm text-fg-subtle">
                Waiting for more telemetry — press Run in the top bar to advance the simulation.
              </div>
            )}
          </div>
        </div>

        <div className="divide-y divide-line rounded-xl bg-surface-2/60 px-4 py-3.5 ring-1 ring-inset ring-line">
          <Reading
            label="Chip temperature"
            value={`${p.chipTempC.toFixed(1)}°C`}
            meter={(p.chipTempC / GUARDRAILS.chipTempMaxC) * 100}
            tone={tone}
            sub={`Limit ${GUARDRAILS.chipTempMaxC}°C`}
          />
          <Reading label="Coolant supply / return" value={`${t.cduSupplyC.toFixed(1)}° / ${t.cduReturnC.toFixed(1)}°C`} />
          <Reading
            label="Loop flow"
            value={`${p.flowLpm.toLocaleString()} L/min`}
            meter={flowPct}
            tone={zone.guardrails.violations.some((v) => v.code.startsWith("FLOW")) ? "crit" : "accent"}
            sub={`Guardrail ${GUARDRAILS.flowMinLpm}–${GUARDRAILS.flowMaxLpm} L/min`}
          />
          <Reading
            label="Differential pressure"
            value={`${p.deltaPKpa.toFixed(0)} kPa`}
            tone={zone.guardrails.violations.some((v) => v.code.startsWith("DELTA_P")) ? "crit" : undefined}
            sub={`Guardrail ${GUARDRAILS.deltaPMinKpa}–${GUARDRAILS.deltaPMaxKpa} kPa`}
          />
          <Reading
            label="Water budget"
            value={`${Math.round(zone.budgetUsage.waterPct)}%`}
            meter={zone.budgetUsage.waterPct}
            tone={usageTone(zone.budgetUsage.waterPct)}
            sub={`${p.flowLpm.toLocaleString()} of ${zone.budgets.waterLpm.toLocaleString()} L/min`}
          />
          <Reading
            label="Power budget"
            value={`${Math.round(zone.budgetUsage.powerPct)}%`}
            meter={zone.budgetUsage.powerPct}
            tone={usageTone(zone.budgetUsage.powerPct)}
            sub={`${p.accessoryPowerMw.toFixed(2)} of ${zone.budgets.powerMw.toFixed(2)} MW accessory`}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniTrend
          label="IT load"
          value={t.itLoadMw.toFixed(2)}
          unit="MW"
          change={pctChange(t.itLoadMw, first?.itLoadMw)}
          goodWhen="neutral"
          values={history.map((h) => h.itLoadMw)}
          color={CHART.cyan}
          labels={labels}
          format={(v) => `${v.toFixed(2)} MW`}
        />
        <MiniTrend
          label="Accessory power"
          value={p.accessoryPowerMw.toFixed(2)}
          unit="MW"
          change={pctChange(p.accessoryPowerMw, first?.accessoryPowerMw)}
          goodWhen="down"
          values={history.map((h) => h.accessoryPowerMw)}
          color={CHART.purple}
          labels={labels}
          format={(v) => `${v.toFixed(3)} MW`}
        />
        <MiniTrend
          label="PUE"
          value={p.pue.toFixed(4)}
          target={`target ${zone.targets.pue.toFixed(3)}`}
          change={pctChange(p.pue, first?.pue)}
          goodWhen="down"
          values={history.map((h) => h.pue)}
          color={CHART.amber}
          labels={labels}
          format={(v) => v.toFixed(4)}
        />
        <MiniTrend
          label="WUE"
          value={p.wue.toFixed(3)}
          unit="L/kWh"
          target={`target ${zone.targets.wue.toFixed(3)}`}
          change={pctChange(p.wue, first?.wue)}
          goodWhen="down"
          values={history.map((h) => h.wue)}
          color={CHART.cyan}
          labels={labels}
          format={(v) => `${v.toFixed(3)} L/kWh`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="mb-2 text-xs font-medium text-fg-subtle">Heat forecast · setpoints held constant</p>
          <ForecastStrip zone={zone} />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-fg-subtle">Active setpoints</p>
          <Setpoints sp={zone.setpoints} />
          {zone.status === "red" ? (
            <Link to="/transfer" className={buttonStyles("outline", "sm", "mt-3")}>
              Open cooling transfer <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function OverviewPage() {
  const { data: latest, lastUpdatedAt } = useSim();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rangeId, setRangeId] = useState<RangeId>("6h");
  const range = RANGES.find((r) => r.value === rangeId) ?? RANGES[1];
  const facilityHistory = useHistory(undefined, range.limit, latest != null);

  const zones = latest?.zones ?? [];
  const selected = (selectedId === null ? zones[0] : zones.find((z) => z.id === selectedId)) ?? null;
  const worst = useMemo(
    () => (zones.length ? zones.reduce((a, b) => (b.margin < a.margin ? b : a)) : null),
    [zones],
  );

  if (!latest || !selected) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const { aggregate } = latest;
  const stale = lastUpdatedAt !== null && Date.now() - lastUpdatedAt > 15000;
  const fh = facilityHistory ?? [];
  const fLabels = fh.map((h) => fmtTime(h.timestamp).slice(0, 5));
  const f0 = fh[0];
  const facilityTone = STATUS_TONE[aggregate.status];

  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        title="Facility overview"
        description={`Live digital-twin telemetry across ${zones.length} liquid-cooled zones · ${aggregate.itLoadMw.toFixed(2)} MW IT load`}
        actions={
          <>
            {stale ? <Badge tone="warn" dot>Stale data</Badge> : null}
            <Segmented ariaLabel="Time range" options={RANGES} value={rangeId} onChange={setRangeId} size="sm" />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label="IT load"
          value={aggregate.itLoadMw.toFixed(2)}
          unit="MW"
          icon={Cpu}
          iconTone="accent"
          delta={<Delta value={pctChange(aggregate.itLoadMw, f0?.itLoadMw)} goodWhen="neutral" suffix={` vs ${range.label} ago`} />}
          chart={<Sparkline values={fh.map((h) => h.itLoadMw)} color={CHART.cyan} label="IT load" labels={fLabels} format={(v) => `${v.toFixed(2)} MW`} />}
        />
        <KpiTile
          label="PUE"
          value={aggregate.pue.toFixed(4)}
          icon={Zap}
          iconTone="warn"
          delta={<Delta value={pctChange(aggregate.pue, f0?.pue)} digits={2} suffix={` vs ${range.label} ago`} />}
          chart={<Sparkline values={fh.map((h) => h.pue)} color={CHART.amber} label="PUE" labels={fLabels} format={(v) => v.toFixed(4)} />}
        />
        <KpiTile
          label="WUE"
          value={aggregate.wue.toFixed(3)}
          unit="L/kWh"
          icon={Droplets}
          iconTone="info"
          delta={<Delta value={pctChange(aggregate.wue, f0?.wue)} suffix={` vs ${range.label} ago`} />}
          chart={<Sparkline values={fh.map((h) => h.wue)} color={CHART.cyan} label="WUE" labels={fLabels} format={(v) => `${v.toFixed(3)} L/kWh`} />}
        />
        <KpiTile
          label="Thermal margin"
          value={aggregate.margin.toFixed(1)}
          unit="°C"
          icon={ThermometerSun}
          iconTone={facilityTone}
          alert={facilityTone === "ok" ? undefined : facilityTone}
          delta={
            <span className="text-xs text-fg-faint">
              Worst: <span className="font-medium text-fg-muted">{worst?.name}</span>
            </span>
          }
          chart={
            <Sparkline
              values={fh.map((h) => GUARDRAILS.chipTempMaxC - h.gpuDieC)}
              color={CHART.emerald}
              label="Margin"
              labels={fLabels}
              format={(v) => `${v.toFixed(1)}°C`}
            />
          }
        />
        <KpiTile
          label="Cooling budget"
          value={`${Math.round(Math.max(aggregate.budgetUsage.waterPct, aggregate.budgetUsage.powerPct))}%`}
          icon={Gauge}
          iconTone="violet"
          className="col-span-2 xl:col-span-1"
          delta={<span className="text-xs text-fg-faint">peak utilisation</span>}
          chart={
            <div className="space-y-3 px-1 pt-1">
              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-fg-subtle">
                    <Waves className="h-3 w-3" aria-hidden /> Water
                  </span>
                  <span className="tabular-nums text-fg-muted">
                    {aggregate.waterLpm.toLocaleString()} / {aggregate.budgets.waterLpm.toLocaleString()} L/min
                  </span>
                </div>
                <Meter value={aggregate.budgetUsage.waterPct} tone={usageTone(aggregate.budgetUsage.waterPct)} className="mt-1" label="Facility water budget" />
              </div>
              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-fg-subtle">
                    <Zap className="h-3 w-3" aria-hidden /> Power
                  </span>
                  <span className="tabular-nums text-fg-muted">
                    {aggregate.accessoryPowerMw.toFixed(2)} / {aggregate.budgets.powerMw.toFixed(2)} MW
                  </span>
                </div>
                <Meter value={aggregate.budgetUsage.powerPct} tone={usageTone(aggregate.budgetUsage.powerPct)} className="mt-1" label="Facility power budget" />
              </div>
            </div>
          }
        />
      </div>

      <section aria-label="Zones" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Zones</h2>
          <p className="text-xs text-fg-faint">Select a zone for detail</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {zones.map((z) => (
            <ZoneCard key={z.id} zone={z} selected={selected.id === z.id} onSelect={() => setSelectedId(z.id)} />
          ))}
        </div>
      </section>

      <ZoneDetail zone={selected} limit={range.limit} />
    </div>
  );
}

export const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});
