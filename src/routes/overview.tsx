import { createRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Cpu,
  Droplets,
  Gauge as GaugeIcon,
  Pause,
  Play,
  Thermometer,
  Waves,
  Wind,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LineChart } from "../components/LineChart";
import { useToast } from "../components/Toast";
import { ErrorState, KpiCard, Panel, StatusBadge } from "../components/ui";
import { api, type HistoryPoint, type TickResponse } from "../lib/api";
import { GUARDRAILS } from "../lib/twin/types";
import { rootRoute } from "./root";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function OverviewPage() {
  const toast = useToast();
  const [latest, setLatest] = useState<TickResponse | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [qualityTotals, setQualityTotals] = useState({ outliers: 0, drift: 0, imputed: 0 });
  const [driftFlags, setDriftFlags] = useState<string[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const load = useCallback(async () => {
    try {
      const [current, hist] = await Promise.all([api.telemetryCurrent(), api.telemetryHistory(48)]);
      setLatest({ ...current, quality: { outliersRemoved: 0, driftFlags: [], imputedCount: 0 } });
      setHistory(hist.history);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load telemetry.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(async () => {
      if (pausedRef.current) return;
      try {
        const tick = await api.telemetryTick();
        setLatest(tick);
        setHistory((prev) => {
          const point: HistoryPoint = { ...tick.telemetry, pue: tick.prediction.pue, wue: tick.prediction.wue };
          return [...prev.slice(-47), point];
        });
        setQualityTotals((q) => ({
          outliers: q.outliers + tick.quality.outliersRemoved,
          drift: q.drift + tick.quality.driftFlags.length,
          imputed: q.imputed + tick.quality.imputedCount,
        }));
        if (tick.quality.driftFlags.length) {
          setDriftFlags((f) => [...f.slice(-4), ...tick.quality.driftFlags]);
          toast(`Sensor drift detected: ${tick.quality.driftFlags[0]}`, "warning");
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Telemetry stream failed.");
      }
    }, 5000);
    return () => clearInterval(id);
  }, [toast]);

  if (error && !latest) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!latest) {
    return <p className="py-20 text-center text-sm text-slate-400">Connecting to digital twin…</p>;
  }

  const { telemetry: t, prediction: p, setpoints } = latest;
  const margin = p.thermalMarginC;
  const marginTone = margin < 3 ? "bad" : margin < 5 ? "warn" : "good";
  const labels = history.map((h) => fmtTime(h.timestamp));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Facility Overview</h1>
          <p className="text-sm text-slate-400">
            Live digital twin · 10-min aggregation intervals · tick #{t.tick}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          aria-pressed={paused}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/50 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          {paused ? "Resume stream" : "Pause stream"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-300" role="alert">
          Stream interrupted: {error} — retrying automatically.
        </p>
      ) : null}

      <div aria-live="polite" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="PUE" value={p.pue.toFixed(4)} icon={Zap} tone={p.pue < 1.12 ? "good" : "warn"} hint="Target < 1.12" />
        <KpiCard label="WUE" value={p.wue.toFixed(3)} unit="L/kWh" icon={Droplets} tone="default" hint="Site water intensity" />
        <KpiCard label="IT Load" value={t.itLoadMw.toFixed(2)} unit="MW" icon={Cpu} tone="default" hint={`Wet-bulb ${t.wetBulbC.toFixed(1)}°C`} />
        <KpiCard label="Accessory Power" value={p.accessoryPowerMw.toFixed(3)} unit="MW" icon={GaugeIcon} tone="default" hint={`Pump ${p.pumpPowerMw.toFixed(3)} + chiller ${p.chillerPowerMw.toFixed(3)} MW`} />
        <KpiCard
          label="Thermal Margin"
          value={margin.toFixed(1)}
          unit="°C"
          icon={margin < 5 ? AlertTriangle : Thermometer}
          tone={marginTone}
          hint={margin < 5 ? "Approaching 85°C die limit" : "Headroom to 85°C die limit"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="PUE & WUE — last intervals">
          {history.length > 2 ? (
            <LineChart
              ariaLabel="PUE and WUE trend over recent intervals"
              labels={labels}
              series={[
                { label: "PUE", color: "#22d3ee", values: history.map((h) => h.pue) },
                { label: "WUE (L/kWh)", color: "#34d399", values: history.map((h) => h.wue) },
              ]}
              yFormat={(v) => v.toFixed(2)}
            />
          ) : (
            <p className="text-sm text-slate-400">Collecting history…</p>
          )}
        </Panel>
        <Panel title="Die temperatures vs limit">
          {history.length > 2 ? (
            <LineChart
              ariaLabel="CPU and GPU die temperatures against the 85 degree limit"
              labels={labels}
              series={[
                { label: "GPU die", color: "#f472b6", values: history.map((h) => h.gpuDieC) },
                { label: "CPU die", color: "#a78bfa", values: history.map((h) => h.cpuDieC) },
              ]}
              yFormat={(v) => `${v.toFixed(0)}°C`}
              threshold={{ value: GUARDRAILS.chipTempMaxC, label: "85°C limit", color: "#f87171" }}
            />
          ) : (
            <p className="text-sm text-slate-400">Collecting history…</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="CDU secondary loop (TCS)">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <LoopStat label="Supply" value={`${t.cduSupplyC.toFixed(1)}°C`} />
            <LoopStat label="Return" value={`${t.cduReturnC.toFixed(1)}°C`} />
            <LoopStat
              label="ΔP"
              value={`${t.deltaPKpa.toFixed(0)} kPa`}
              ok={t.deltaPKpa >= GUARDRAILS.deltaPMinKpa && t.deltaPKpa <= GUARDRAILS.deltaPMaxKpa}
            />
            <LoopStat
              label="Flow"
              value={`${t.flowLpm} L/min`}
              ok={t.flowLpm >= GUARDRAILS.flowMinLpm && t.flowLpm <= GUARDRAILS.flowMaxLpm}
            />
          </dl>
          <p className="mt-3 text-xs text-slate-400">
            Loop ΔT {(t.cduReturnC - t.cduSupplyC).toFixed(1)}°C · active setpoints: supply{" "}
            {setpoints.coolantSupplyC}°C, pump {setpoints.pumpSpeedPct}%, valve {setpoints.valvePosPct}%
          </p>
        </Panel>
        <Panel title="Facility water (FWS) & ambient">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <LoopStat label="FWS supply" value={`${t.fwsSupplyC.toFixed(1)}°C`} icon={<Waves className="h-3.5 w-3.5" aria-hidden />} />
            <LoopStat label="FWS flow" value={`${t.fwsFlowLpm} L/min`} />
            <LoopStat label="Wet-bulb" value={`${t.wetBulbC.toFixed(1)}°C`} icon={<Droplets className="h-3.5 w-3.5" aria-hidden />} />
            <LoopStat label="Dry-bulb" value={`${t.dryBulbC.toFixed(1)}°C`} icon={<Wind className="h-3.5 w-3.5" aria-hidden />} />
          </dl>
        </Panel>
        <Panel title="Data quality pipeline">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={qualityTotals.outliers ? "warn" : "good"}>{qualityTotals.outliers} outliers removed</StatusBadge>
            <StatusBadge tone={qualityTotals.drift ? "warn" : "good"}>{qualityTotals.drift} drift flags</StatusBadge>
            <StatusBadge tone="info">{qualityTotals.imputed} imputed values</StatusBadge>
          </div>
          {driftFlags.length ? (
            <ul className="mt-3 space-y-1 text-xs text-amber-300">
              {driftFlags.map((f, i) => (
                <li key={i}>· {f}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-400">
              Z-score / isolation-forest validation active across all ingested channels.
            </p>
          )}
        </Panel>
      </div>
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
      <dd
        className={`mt-0.5 font-mono text-base tabular-nums ${
          ok === undefined ? "text-slate-100" : ok ? "text-emerald-300" : "text-red-300"
        }`}
      >
        {value}
        {ok !== undefined ? (
          <span className="ml-1.5 text-xs">{ok ? "in bounds" : "OUT OF BOUNDS"}</span>
        ) : null}
      </dd>
    </div>
  );
}

export const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});
