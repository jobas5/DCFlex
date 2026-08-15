import { createRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Cpu,
  Droplets,
  Gauge as GaugeIcon,
  Thermometer,
  Waves,
  Wind,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import { LineChart } from "../components/LineChart";
import { KpiCard, Panel, StatusBadge } from "../components/ui";
import { api, type HistoryPoint } from "../lib/api";
import { useSim } from "../lib/simContext";
import { fmtTime } from "../lib/time";
import { CHART } from "../lib/tokens";
import { GUARDRAILS, type FacilityView, type ForecastHorizon, type ForecastPoint, type ZoneView } from "../lib/twin/types";
import { rootRoute } from "./root";

const HORIZONS: ForecastHorizon[] = ["15m", "1h", "4h", "24h"];

const peakWhen = (f: ForecastPoint) => {
  const mins = f.peakAtTicks * 10;
  return mins < 60 ? `~${mins} min` : `~${(mins / 60).toFixed(1)}h`;
};

const zoneCardStyle: Record<ZoneView["status"], string> = {
  green: "border-emerald-500/50 hover:bg-emerald-500/10",
  yellow: "border-amber-500/50 hover:bg-amber-500/10",
  red: "border-red-500/60 hover:bg-red-500/10",
};
const dotStyle: Record<ZoneView["status"], string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-red-500",
};

const statusTone: Record<ZoneView["status"], "good" | "warn" | "bad"> = {
  green: "good",
  yellow: "warn",
  red: "bad",
};

function SummaryCard({ aggregate }: { aggregate: FacilityView }) {
  const { budgets, budgetUsage } = aggregate;
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Facility Overview</h1>
          <p className="text-sm text-slate-400">
            Live digital twin · 4 cooling zones · {aggregate.itLoadMw.toFixed(2)} MW total IT load
          </p>
        </div>
        <StatusBadge tone={aggregate.status === "red" ? "bad" : aggregate.status === "yellow" ? "warn" : "good"}>
          {aggregate.status === "red"
            ? "Cooling needed"
            : aggregate.status === "yellow"
              ? "Watch"
              : "Within limits"}
        </StatusBadge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="PUE" value={aggregate.pue.toFixed(4)} />
        <SummaryStat label="WUE" value={aggregate.wue.toFixed(3)} unit="L/kWh" />
        <SummaryStat label="Accessory power" value={aggregate.accessoryPowerMw.toFixed(3)} unit="MW" />
        <SummaryStat label="Thermal margin" value={aggregate.margin.toFixed(1)} unit="°C" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <BudgetBar
          label="Water budget"
          used={`${aggregate.waterLpm} L/min`}
          cap={`${budgets.waterLpm} L/min`}
          pct={budgetUsage.waterPct}
        />
        <BudgetBar
          label="Power budget"
          used={`${aggregate.accessoryPowerMw.toFixed(2)} MW`}
          cap={`${budgets.powerMw} MW`}
          pct={budgetUsage.powerPct}
        />
      </div>
    </div>
  );
}

function SummaryStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span> : null}
      </p>
    </div>
  );
}

function BudgetBar({ label, used, cap, pct }: { label: string; used: string; cap: string; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-mono">
          {used} / {cap}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${pct > 100 ? "bg-red-500" : pct > 80 ? "bg-amber-400" : "bg-cyan-500"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function ZoneCard({
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
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
        selected ? "ring-2 ring-cyan-400/60" : ""
      } ${zoneCardStyle[zone.status]}`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className={`h-2.5 w-2.5 rounded-full ${dotStyle[zone.status]}`} aria-hidden />
          {zone.name}
        </span>
        <span className="font-mono text-xs text-slate-400">
          {zone.prediction.chipTempC.toFixed(1)}°C
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-slate-400">
        margin {zone.margin.toFixed(1)}°C · PUE {zone.prediction.pue.toFixed(3)}
      </p>
    </button>
  );
}

function FacilityDetail({ aggregate, zones }: { aggregate: FacilityView; zones: ZoneView[] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="IT Load" value={aggregate.itLoadMw.toFixed(2)} unit="MW" icon={Cpu} tone="default" />
        <KpiCard
          label="PUE"
          value={aggregate.pue.toFixed(4)}
          icon={Zap}
          tone={aggregate.pue < 1.12 ? "good" : "warn"}
          hint="Target < 1.12"
        />
        <KpiCard label="WUE" value={aggregate.wue.toFixed(3)} unit="L/kWh" icon={Droplets} tone="default" />
        <KpiCard
          label="Accessory Power"
          value={aggregate.accessoryPowerMw.toFixed(3)}
          unit="MW"
          icon={GaugeIcon}
          tone="default"
        />
        <KpiCard
          label="Thermal Margin"
          value={aggregate.margin.toFixed(1)}
          unit="°C"
          icon={aggregate.margin < 5 ? AlertTriangle : Thermometer}
          tone={aggregate.margin < 3 ? "bad" : aggregate.margin < 5 ? "warn" : "good"}
        />
      </div>
      <Panel title="Zone status">
        <ul className="divide-y divide-slate-800">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dotStyle[z.status]}`} aria-hidden />
                {z.name}
              </span>
              <span className="font-mono text-xs text-slate-400">
                {z.prediction.chipTempC.toFixed(1)}°C · margin {z.margin.toFixed(1)}°C
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function ZoneDetail({ zone, horizon }: { zone: ZoneView; horizon: ForecastHorizon }) {
  const pueGap = zone.prediction.pue - zone.targets.pue;
  const wueGap = zone.prediction.wue - zone.targets.wue;
  const f = zone.forecast[horizon];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="PUE" value={zone.prediction.pue.toFixed(4)} icon={Zap} tone={pueGap <= 0 ? "good" : "warn"} hint={`Target ${zone.targets.pue.toFixed(3)}`} />
        <KpiCard label="WUE" value={zone.prediction.wue.toFixed(3)} unit="L/kWh" icon={Droplets} tone={wueGap <= 0 ? "good" : "warn"} hint={`Target ${zone.targets.wue.toFixed(3)}`} />
        <KpiCard label="IT Load" value={zone.telemetry.itLoadMw.toFixed(2)} unit="MW" icon={Cpu} tone="default" />
        <KpiCard label="Accessory Power" value={zone.prediction.accessoryPowerMw.toFixed(3)} unit="MW" icon={GaugeIcon} tone="default" hint={`Pump ${zone.prediction.pumpPowerMw.toFixed(2)} + chiller ${zone.prediction.chillerPowerMw.toFixed(2)} MW`} />
        <KpiCard
          label="Thermal Margin"
          value={zone.margin.toFixed(1)}
          unit="°C"
          icon={zone.margin < 5 ? AlertTriangle : Thermometer}
          tone={zone.status === "red" ? "bad" : zone.status === "yellow" ? "warn" : "good"}
          hint="Headroom to 85°C"
        />
        <KpiCard label="Chip temp" value={zone.prediction.chipTempC.toFixed(1)} unit="°C" icon={Thermometer} tone={statusTone[zone.status]} />
      </div>

      <Panel title={`Heat forecast — next ${horizon}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <LoopStat
            label="Peak chip temp"
            value={`${f.peakChipTempC.toFixed(0)}°C`}
            ok={f.peakChipTempC < 85}
          />
          <LoopStat
            label="Worst margin"
            value={`${f.worstMargin.toFixed(1)}°C`}
            ok={f.worstMargin >= 5}
          />
          <LoopStat label="Peaks in" value={peakWhen(f)} />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {f.rising
            ? "Heat is forecast to rise over this window — plan extra cooling or a transfer."
            : "Heat is forecast to stay level or fall over this window."}
        </p>
      </Panel>

      <Panel title="Loop & setpoints">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <LoopStat label="Supply" value={`${zone.telemetry.cduSupplyC.toFixed(1)}°C`} />
          <LoopStat label="Return" value={`${zone.telemetry.cduReturnC.toFixed(1)}°C`} />
          <LoopStat
            label="ΔP"
            value={`${zone.prediction.deltaPKpa.toFixed(0)} kPa`}
            ok={zone.prediction.deltaPKpa >= GUARDRAILS.deltaPMinKpa && zone.prediction.deltaPKpa <= GUARDRAILS.deltaPMaxKpa}
          />
          <LoopStat
            label="Flow"
            value={`${zone.prediction.flowLpm} L/min`}
            ok={zone.prediction.flowLpm >= GUARDRAILS.flowMinLpm && zone.prediction.flowLpm <= GUARDRAILS.flowMaxLpm}
          />
          <LoopStat label="Wet-bulb" value={`${zone.telemetry.wetBulbC.toFixed(1)}°C`} icon={<Waves className="h-3.5 w-3.5" aria-hidden />} />
          <LoopStat label="Dry-bulb" value={`${zone.telemetry.dryBulbC.toFixed(1)}°C`} icon={<Wind className="h-3.5 w-3.5" aria-hidden />} />
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          Setpoints: supply {zone.setpoints.coolantSupplyC}°C · pump {zone.setpoints.pumpSpeedPct}% · valve{" "}
          {zone.setpoints.valvePosPct}% · CDU {zone.setpoints.cduSetpointC}°C
        </p>
      </Panel>

      <Panel title="Targets & budgets">
        <div className="grid grid-cols-2 gap-3">
          <TargetStat label="PUE target" value={zone.prediction.pue.toFixed(4)} target={zone.targets.pue.toFixed(3)} over={pueGap > 0} />
          <TargetStat label="WUE target" value={zone.prediction.wue.toFixed(3)} target={zone.targets.wue.toFixed(3)} over={wueGap > 0} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <BudgetBar label="Water" used={`${zone.prediction.flowLpm} L/min`} cap={`${zone.budgets.waterLpm} L/min`} pct={zone.budgetUsage.waterPct} />
          <BudgetBar label="Power" used={`${zone.prediction.accessoryPowerMw.toFixed(2)} MW`} cap={`${zone.budgets.powerMw} MW`} pct={zone.budgetUsage.powerPct} />
        </div>
        {!zone.guardrails.feasible ? (
          <p className="mt-3 text-xs text-red-300">Guardrail violations: {zone.guardrails.violations.map((v) => v.message).join("; ")}</p>
        ) : null}
      </Panel>

      {zone.status === "red" ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/20 p-3 text-sm">
          <p className="font-medium text-red-300">{zone.name} needs more cooling.</p>
          <Link to="/transfer" className="mt-1 inline-block text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
            Open Cooling Transfer for this zone →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function TargetStat({ label, value, target, over }: { label: string; value: string; target: string; over: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 font-mono text-base tabular-nums">
        {value}
        <span className="ml-1.5 text-xs text-slate-400">/ {target}</span>
      </p>
      <p className={`text-xs ${over ? "text-amber-300" : "text-emerald-300"}`}>{over ? "over target" : "within target"}</p>
    </div>
  );
}

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

function ForecastAlert({
  zones,
  horizon,
}: {
  zones: ZoneView[];
  horizon: ForecastHorizon;
}) {
  const red = zones.filter((z) => z.forecast[horizon].worstMargin < 3);
  const amber = zones.filter((z) => {
    const m = z.forecast[horizon].worstMargin;
    return m >= 3 && m < 5;
  });

  if (red.length) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-950/30 p-3 text-sm" role="alert">
        <p className="font-medium text-red-300">
          Heat forecast — act now:{" "}
          {red.map((z) => `${z.name} peaks at ${z.forecast[horizon].peakChipTempC.toFixed(0)}°C in ${peakWhen(z.forecast[horizon])}`).join(" · ")}
        </p>
        <Link to="/transfer" className="mt-1 inline-block text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
          Transfer cooling to a hot zone →
        </Link>
      </div>
    );
  }
  if (amber.length) {
    return (
      <div className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-3 text-sm" role="alert">
        <p className="font-medium text-amber-300">
          Plan cooling:{" "}
          {amber.map((z) => `${z.name} heat rising, peak ${z.forecast[horizon].peakChipTempC.toFixed(0)}°C in ${peakWhen(z.forecast[horizon])}`).join(" · ")}
        </p>
      </div>
    );
  }
  return null;
}

function OverviewPage() {
  const toast = useToast();
  const { data: latest } = useSim();
  const [selectedId, setSelectedId] = useState<number | "facility">("facility");
  const [horizon, setHorizon] = useState<ForecastHorizon>("1h");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const alertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setHistory((await api.telemetryHistory(undefined, 96)).history);
      } catch {
        /* ignore */
      }
    };
    void loadHistory();
    const id = setInterval(() => void loadHistory(), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!latest) return;
    const atRisk = latest.zones.filter((z) => z.forecast[horizon].worstMargin < 5);
    for (const z of atRisk) {
      const key = `${z.id}:${horizon}`;
      if (alertedRef.current.has(key)) continue;
      alertedRef.current.add(key);
      toast(
        `${z.name}: heat forecast to peak at ${z.forecast[horizon].peakChipTempC.toFixed(0)}°C in ${peakWhen(z.forecast[horizon])}.`,
        z.forecast[horizon].worstMargin < 3 ? "error" : "warning",
      );
    }
  }, [latest, horizon, toast]);

  if (!latest) return <p className="py-20 text-center text-sm text-slate-400">Connecting to digital twin…</p>;

  const { aggregate, zones } = latest;
  const selected = selectedId === "facility" ? null : zones.find((z) => z.id === selectedId) ?? null;
  const historyLabels = history.map((h) => fmtTime(h.timestamp));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SummaryCard aggregate={aggregate} />
      </div>

      {history.length > 2 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="PUE & WUE trend">
            <LineChart
              ariaLabel="PUE and WUE trend over recent intervals"
              labels={historyLabels}
              series={[
                { label: "PUE", color: CHART.cyan, values: history.map((h) => h.pue) },
                { label: "WUE (L/kWh)", color: CHART.emerald, values: history.map((h) => h.wue) },
              ]}
              yFormat={(v) => v.toFixed(3)}
            />
          </Panel>
          <Panel title="Die temperatures vs limit">
            <LineChart
              ariaLabel="GPU and CPU die temperatures against the 85 degree limit"
              labels={historyLabels}
              series={[
                { label: "GPU die", color: CHART.pink, values: history.map((h) => h.gpuDieC) },
                { label: "CPU die", color: CHART.purple, values: history.map((h) => h.cpuDieC) },
              ]}
              yFormat={(v) => `${v.toFixed(0)}°C`}
              threshold={{ value: GUARDRAILS.chipTempMaxC, label: "85°C limit", color: "#f87171" }}
            />
          </Panel>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <span className="mr-1">Heat forecast:</span>
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHorizon(h)}
              aria-pressed={horizon === h}
              className={`rounded-md border px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                horizon === h ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>
      <ForecastAlert zones={zones} horizon={horizon} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2" aria-label="Cooling zones">
          <button
            type="button"
            onClick={() => setSelectedId("facility")}
            aria-pressed={selectedId === "facility"}
            className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              selectedId === "facility" ? "ring-2 ring-cyan-400/60 border-cyan-500/50 bg-cyan-500/10" : "border-slate-700 hover:bg-slate-800"
            }`}
          >
            <span className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" aria-hidden />
                Facility (all zones)
              </span>
            </span>
            <span className="mt-1 block font-mono text-xs text-slate-400">
              PUE {aggregate.pue.toFixed(3)} · {aggregate.itLoadMw.toFixed(1)} MW
            </span>
          </button>
          {zones.map((z) => (
            <ZoneCard key={z.id} zone={z} selected={selectedId === z.id} onClick={() => setSelectedId(z.id)} />
          ))}
        </aside>

        <section aria-label="Detail">
          {selected ? (
            <ZoneDetail zone={selected} horizon={horizon} />
          ) : (
            <FacilityDetail aggregate={aggregate} zones={zones} />
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
