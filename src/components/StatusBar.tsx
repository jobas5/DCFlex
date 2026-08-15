import { Pause, Play } from "lucide-react";
import { useSim } from "../lib/simContext";
import { fmtTime, TZ_LABEL } from "../lib/time";

export function StatusBar() {
  const { data, running, toggle, lastUpdatedAt } = useSim();
  const zones = data?.zones ?? [];
  const simTime = zones[0]?.telemetry.timestamp;
  const crit = zones.filter((z) => z.status === "red").length;
  const warn = zones.filter((z) => z.status === "yellow").length;
  const tickAge = lastUpdatedAt ? Math.round((Date.now() - lastUpdatedAt) / 1000) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-800 bg-slate-950/85 px-4 py-1.5 text-xs text-slate-400">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={running}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium focus-visible:outline-2 focus-visible:outline-cyan-400 ${
          running ? "border-sev-ok/50 text-sev-ok hover:bg-sev-ok/10" : "border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
        }`}
      >
        {running ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
        {running ? "Pause" : "Play"}
      </button>
      <span className="font-mono tabular-nums">Sim {simTime ? `${fmtTime(simTime)} ${TZ_LABEL}` : "--:--:--"}</span>
      <span className="tabular-nums">{tickAge !== null ? `updated ${tickAge}s ago` : "—"}</span>
      <span className="tabular-nums">{zones.length} zones</span>
      {crit > 0 ? (
        <span className="font-medium text-sev-crit">● {crit} critical</span>
      ) : null}
      {warn > 0 ? (
        <span className="font-medium text-sev-warn">● {warn} warning</span>
      ) : null}
      {crit === 0 && warn === 0 ? (
        <span className="font-medium text-sev-ok">● all nominal</span>
      ) : null}
    </div>
  );
}
