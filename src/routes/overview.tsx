import { createRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronRight,
  Cpu,
  Droplets,
  Gauge as GaugeIcon,
  Thermometer,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LineChart } from "../components/LineChart";
import { Skeleton, StatusBadge } from "../components/ui";
import { api, type HistoryPoint } from "../lib/api";
import { useSim } from "../lib/simContext";
import { fmtTime } from "../lib/time";
import { CHART } from "../lib/tokens";
import { GUARDRAILS, type ZoneView } from "../lib/twin/types";
import { rootRoute } from "./root";

const RANGES = [
  { id: "15m", label: "Last 15 minutes", limit: 2 },
  { id: "1h", label: "Last 1 hour", limit: 6 },
  { id: "6h", label: "Last 6 hours", limit: 36 },
  { id: "24h", label: "Last 24 hours", limit: 144 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const STATUS_TONE = { green: "good", yellow: "warn", red: "bad" } as const;
const STATUS_LABEL = { green: "Normal", yellow: "Warning", red: "Critical" } as const;
const DOT = { green: "bg-emerald-400", yellow: "bg-amber-400", red: "bg-red-500" } as const;

function pctChange(cur: number, prev: number): number | null {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function Comparison({
  change,
  unit,
  tone,
  rangeLabel,
}: {
  change: number | null;
  unit: string;
  /** good-up: rising is good; bad-up: rising is bad; neutral: no semantics */
  tone: "good-up" | "bad-up" | "neutral";
  rangeLabel: string;
}) {
  if (change === null) return null;
  const up = change >= 0;
  const color =
    tone === "neutral"
      ? "text-slate-400"
      : tone === "good-up"
        ? up
          ? "text-emerald-300"
          : "text-red-300"
        : up
          ? "text-amber-300"
          : "text-emerald-300";
  return (
    <span className={`font-mono tabular-nums ${color}`}>
      {up ? "↑" : "↓"} {Math.abs(change).toFixed(1)}
      {unit} vs {rangeLabel} ago
    </span>
  );
}

function MetricCard({
  icon: Icon,
  iconClass,
  label,
  value,
  unit,
  targetText,
  description,
  comparison,
  chart,
}: {
  icon: typeof Cpu;
  iconClass: string;
  label: string;
  value: string;
  unit?: string;
  targetText?: string;
  description: string;
  comparison?: React.ReactNode;
  chart: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`rounded-lg p-1.5 ${iconClass}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
        </span>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span> : null}
      </p>
      {targetText ? <p className="mt-0.5 text-xs text-slate-400">{targetText}</p> : null}
      <div className="mt-2">{chart}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="text-slate-400">{description}</span>
        {comparison}
      </div>
    </div>
  );
}

function ZoneListCard({
  zone,
  selected,
  onClick,
}: {
  zone: ZoneView;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
        selected
          ? "border-cyan-400/60 bg-cyan-500/10"
          : "border-slate-700/60 bg-slate-900/50 hover:bg-slate-800/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className={`h-2.5 w-2.5 rounded-full ${DOT[zone.status]}`} aria-hidden />
          {zone.name}
        </span>
        <span className="flex items-center gap-1.5">
          <StatusBadge tone={STATUS_TONE[zone.status]}>{STATUS_LABEL[zone.status]}</StatusBadge>
          <ChevronRight className={`h-4 w-4 ${selected ? "text-cyan-300" : "text-slate-600"}`} aria-hidden />
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <MiniStat label="IT Load" value={`${zone.telemetry.itLoadMw.toFixed(2)} MW`} />
        <MiniStat label="PUE" value={zone.prediction.pue.toFixed(2)} />
        <MiniStat label="WUE" value={zone.prediction.wue.toFixed(2)} />
        <MiniStat label="Temp" value={`${zone.prediction.chipTempC.toFixed(1)}°C`} />
      </div>
      <p className="mt-1.5 text-right text-xs text-slate-400">
        Margin <span className="font-mono text-slate-300">{zone.margin.toFixed(1)}°C</span>
      </p>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-200">{value}</p>
    </div>
  );
}

function OverviewPage() {
  const { data: latest, lastUpdatedAt } = useSim();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rangeId, setRangeId] = useState<RangeId>("1h");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[1];
  const zones = latest?.zones ?? [];
  const selected = (selectedId === null ? zones[0] : zones.find((z) => z.id === selectedId)) ?? null;

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.telemetryHistory(selected.id, range.limit);
        if (!cancelled) {
          setHistory(res.history);
          setHistoryLoading(false);
        }
      } catch {
        /* keep last good data */
      }
    };
    setHistoryLoading(true);
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selected?.id, range.limit]);

  if (!latest || !selected) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-56 sm:col-span-2" />
        </div>
      </div>
    );
  }

  const { aggregate } = latest;
  const stale = lastUpdatedAt !== null && Date.now() - lastUpdatedAt > 15000;

  const labels = history.map((h) => fmtTime(h.timestamp));
  const first = history[0];
  const zoneStatusTone = STATUS_TONE[selected.status];
  const marginSeries = history.map((h) => GUARDRAILS.chipTempMaxC - h.gpuDieC);

  return (
    <div className="space-y-4">
      {/* Page toolbar: time range applies to all overview charts */}
      <div className="flex items-center justify-end gap-2">
        {stale ? (
          <span className="mr-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
            Stale data
          </span>
        ) : null}
        <label htmlFor="range" className="text-xs text-slate-400">
          Time range
        </label>
        <select
          id="range"
          value={rangeId}
          onChange={(e) => setRangeId(e.target.value as RangeId)}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* Left: facility summary + zone list */}
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-4">
            <h1 className="text-base font-semibold">Facility (All Zones)</h1>
            <p className="text-xs text-slate-400">
              {zones.length} zones · {aggregate.itLoadMw.toFixed(2)} MW total IT load
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">IT Load</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                  {aggregate.itLoadMw.toFixed(2)}
                  <span className="ml-1 text-sm font-normal text-slate-400">MW</span>
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">PUE</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{aggregate.pue.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">WUE</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                  {aggregate.wue.toFixed(3)}
                  <span className="ml-1 text-sm font-normal text-slate-400">L/kWh</span>
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Thermal Margin</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                  {aggregate.margin.toFixed(1)}
                  <span className="ml-1 text-sm font-normal text-slate-400">°C</span>
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2" aria-label="Zones">
            {zones.map((z) => (
              <ZoneListCard key={z.id} zone={z} selected={selected.id === z.id} onClick={() => setSelectedId(z.id)} />
            ))}
          </div>
        </div>

        {/* Right: selected zone monitoring */}
        <section aria-label={`${selected.name} monitoring`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{selected.name} Monitoring</h2>
              <p className="text-xs text-slate-400">
                {selected.status === "green" ? "All systems nominal" : selected.status === "yellow" ? "Approaching limits" : "Cooling attention needed"}
              </p>
            </div>
            <StatusBadge tone={zoneStatusTone}>
              {selected.status === "green" ? "Within limits" : selected.status === "yellow" ? "Watch" : "Cooling needed"}
            </StatusBadge>
          </div>

          {historyLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
              <Skeleton className="h-56 sm:col-span-2" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MetricCard
                icon={Cpu}
                iconClass="bg-cyan-500/15 text-cyan-300"
                label="IT Load"
                value={selected.telemetry.itLoadMw.toFixed(2)}
                unit="MW"
                description="Total IT load in the zone"
                comparison={
                  <Comparison
                    change={first ? pctChange(selected.telemetry.itLoadMw, first.itLoadMw) : null}
                    unit="%"
                    tone="neutral"
                    rangeLabel={range.id}
                  />
                }
                chart={
                  <LineChart
                    compact
                    height={72}
                    ariaLabel="IT load history"
                    labels={labels}
                    series={[{ label: "IT Load (MW)", color: CHART.cyan, values: history.map((h) => h.itLoadMw) }]}
                    yFormat={(v) => `${v.toFixed(2)} MW`}
                  />
                }
              />
              <MetricCard
                icon={GaugeIcon}
                iconClass="bg-purple-500/15 text-purple-300"
                label="Accessory Power"
                value={selected.prediction.accessoryPowerMw.toFixed(2)}
                unit="MW"
                description="Power used by facility equipment"
                comparison={
                  <Comparison
                    change={first ? pctChange(selected.prediction.accessoryPowerMw, first.accessoryPowerMw) : null}
                    unit="%"
                    tone="bad-up"
                    rangeLabel={range.id}
                  />
                }
                chart={
                  <LineChart
                    compact
                    height={72}
                    ariaLabel="Accessory power history"
                    labels={labels}
                    series={[{ label: "Accessory (MW)", color: CHART.purple, values: history.map((h) => h.accessoryPowerMw) }]}
                    yFormat={(v) => `${v.toFixed(2)} MW`}
                  />
                }
              />
              <MetricCard
                icon={Zap}
                iconClass="bg-amber-500/15 text-amber-300"
                label="PUE"
                value={selected.prediction.pue.toFixed(4)}
                targetText={`Target < ${selected.targets.pue.toFixed(2)}`}
                description="Power Usage Effectiveness"
                comparison={
                  <Comparison
                    change={first ? pctChange(selected.prediction.pue, first.pue) : null}
                    unit="%"
                    tone="bad-up"
                    rangeLabel={range.id}
                  />
                }
                chart={
                  <LineChart
                    compact
                    height={72}
                    ariaLabel="PUE history"
                    labels={labels}
                    series={[{ label: "PUE", color: CHART.amber, values: history.map((h) => h.pue) }]}
                    yFormat={(v) => v.toFixed(3)}
                  />
                }
              />
              <MetricCard
                icon={Droplets}
                iconClass="bg-cyan-500/15 text-cyan-300"
                label="WUE"
                value={selected.prediction.wue.toFixed(3)}
                unit="L/kWh"
                description="Water Usage Effectiveness"
                comparison={
                  <Comparison
                    change={first ? pctChange(selected.prediction.wue, first.wue) : null}
                    unit="%"
                    tone="bad-up"
                    rangeLabel={range.id}
                  />
                }
                chart={
                  <LineChart
                    compact
                    height={72}
                    ariaLabel="WUE history"
                    labels={labels}
                    series={[{ label: "WUE (L/kWh)", color: CHART.cyan, values: history.map((h) => h.wue) }]}
                    yFormat={(v) => `${v.toFixed(3)} L/kWh`}
                  />
                }
              />
              <div className="sm:col-span-2">
                <MetricCard
                  icon={selected.margin < 5 ? AlertTriangle : Thermometer}
                  iconClass="bg-emerald-500/15 text-emerald-300"
                  label="Thermal Margin"
                  value={selected.margin.toFixed(1)}
                  unit="°C"
                  description="Distance to temperature limit"
                  comparison={
                    <Comparison
                      change={first ? selected.margin - (GUARDRAILS.chipTempMaxC - first.gpuDieC) : null}
                      unit="°C"
                      tone="good-up"
                      rangeLabel={range.id}
                    />
                  }
                  chart={
                    <LineChart
                      compact
                      height={110}
                      ariaLabel="Thermal margin history against the 85 degree limit"
                      labels={labels}
                      series={[{ label: "Margin (°C)", color: CHART.emerald, values: marginSeries }]}
                      yFormat={(v) => `${v.toFixed(1)}°C`}
                    />
                  }
                />
                <div className="mt-2 flex items-center gap-6 px-1 text-xs text-slate-400">
                  <span>
                    Current Temperature{" "}
                    <span className="font-mono text-slate-200">{selected.prediction.chipTempC.toFixed(1)}°C</span>
                  </span>
                  <span>
                    Max Limit <span className="font-mono text-slate-200">{GUARDRAILS.chipTempMaxC.toFixed(1)}°C</span>
                  </span>
                  {selected.status === "red" ? (
                    <Link to="/transfer" className="ml-auto text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
                      Open Cooling Transfer →
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});
