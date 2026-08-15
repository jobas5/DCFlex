import { createRoute, Link } from "@tanstack/react-router";
import { FlaskConical, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "../components/Toast";
import { EmptyState, ErrorState, Panel, StatusBadge } from "../components/ui";
import { api, type WhatIfResponse, type WhatIfRunListItem } from "../lib/api";
import { predict } from "../lib/twin/surrogate";
import { FACTORY_SETPOINTS, type WhatIfCandidate } from "../lib/twin/types";
import { rootRoute } from "./root";

export const WEATHER_PRESETS = [
  { id: "cool", label: "Cool", wetBulbC: 10 },
  { id: "mild", label: "Mild", wetBulbC: 18 },
  { id: "hot", label: "Hot & humid", wetBulbC: 26 },
] as const;

export function CandidateTable({ candidates }: { candidates: WhatIfCandidate[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
            <th className="px-2 py-2">Rank</th>
            <th className="px-2 py-2">Supply °C</th>
            <th className="px-2 py-2">Pump %</th>
            <th className="px-2 py-2">Valve %</th>
            <th className="px-2 py-2">PUE</th>
            <th className="px-2 py-2">WUE</th>
            <th className="px-2 py-2">Cost J</th>
            <th className="px-2 py-2">T_chip</th>
            <th className="px-2 py-2">Guardrails</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => (
            <tr key={i} className="border-b border-slate-800/60">
              <td className="px-2 py-2 font-mono text-slate-400">{i + 1}</td>
              <td className="px-2 py-2 font-mono">{c.setpoints.coolantSupplyC}</td>
              <td className="px-2 py-2 font-mono">{c.setpoints.pumpSpeedPct}</td>
              <td className="px-2 py-2 font-mono">{c.setpoints.valvePosPct}</td>
              <td className="px-2 py-2 font-mono text-cyan-300">{c.pue.toFixed(4)}</td>
              <td className="px-2 py-2 font-mono text-emerald-300">{c.wue.toFixed(3)}</td>
              <td className="px-2 py-2 font-mono">{c.feasible ? c.cost.toFixed(4) : "—"}</td>
              <td className="px-2 py-2 font-mono">{c.chipTempC.toFixed(1)}°C</td>
              <td className="px-2 py-2">
                {c.feasible ? (
                  <StatusBadge tone="good">
                    <ShieldCheck className="h-3 w-3" aria-hidden /> Feasible
                  </StatusBadge>
                ) : (
                  <div className="space-y-1">
                    <StatusBadge tone="bad">
                      <ShieldAlert className="h-3 w-3" aria-hidden /> Infeasible
                    </StatusBadge>
                    <ul className="text-xs text-red-300">
                      {c.violations.map((v, j) => (
                        <li key={j}>· {v.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WhatIfPage() {
  const toast = useToast();
  const [alpha, setAlpha] = useState(0.7);
  const [beta, setBeta] = useState(0.3);
  const [itLoad, setItLoad] = useState(6.4);
  const [wetBulb, setWetBulb] = useState(18);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [runs, setRuns] = useState<WhatIfRunListItem[]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await api.listWhatIfRuns();
      setRuns(data.runs);
      setRunsError(null);
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : "Failed to load runs.");
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const baseline = predict({ itLoadMw: itLoad, wetBulbC: wetBulb, dryBulbC: wetBulb + 6 }, FACTORY_SETPOINTS);

  const run = async () => {
    setRunning(true);
    try {
      const data = await api.runWhatIf({ alpha, beta, itLoadMw: itLoad, wetBulbC: wetBulb });
      setResult(data);
      toast(
        data.best
          ? `What-if complete: ${data.evaluated} permutations, best PUE ${data.best.pue.toFixed(4)}`
          : "No feasible setpoints under current guardrails.",
        data.best ? "success" : "warning",
      );
      void loadRuns();
    } catch (e) {
      toast(e instanceof Error ? e.message : "What-if run failed.", "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Counterfactual What-If Engine</h1>
        <p className="text-sm text-slate-400">
          Grid search over setpoint permutations · minimize J = α·PUE + β·WUE under hard guardrails
        </p>
      </div>

      <Panel title="Objective & scenario">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="alpha" className="flex justify-between text-sm text-slate-300">
                <span>Grid carbon weight α <span className="text-slate-500">(PUE priority)</span></span>
                <span className="font-mono text-cyan-300">{alpha.toFixed(2)}</span>
              </label>
              <input
                id="alpha"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={alpha}
                onChange={(e) => setAlpha(Number(e.target.value))}
                className="mt-2 w-full accent-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              />
            </div>
            <div>
              <label htmlFor="beta" className="flex justify-between text-sm text-slate-300">
                <span>Water scarcity weight β <span className="text-slate-500">(WUE priority)</span></span>
                <span className="font-mono text-emerald-300">{beta.toFixed(2)}</span>
              </label>
              <input
                id="beta"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={beta}
                onChange={(e) => setBeta(Number(e.target.value))}
                className="mt-2 w-full accent-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              />
            </div>
            <p className="text-xs text-slate-400">
              {alpha >= beta
                ? "Objective currently favors energy/carbon efficiency (PUE)."
                : "Objective currently favors water conservation (WUE)."}
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="itload" className="flex justify-between text-sm text-slate-300">
                <span>Scenario IT load</span>
                <span className="font-mono text-cyan-300">{itLoad.toFixed(1)} MW</span>
              </label>
              <input
                id="itload"
                type="range"
                min={2}
                max={12}
                step={0.2}
                value={itLoad}
                onChange={(e) => setItLoad(Number(e.target.value))}
                className="mt-2 w-full accent-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              />
            </div>
            <fieldset>
              <legend className="text-sm text-slate-300">Ambient condition (wet-bulb)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {WEATHER_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setWetBulb(p.wetBulbC)}
                    aria-pressed={wetBulb === p.wetBulbC}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                      wetBulb === p.wetBulbC
                        ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                        : "border-slate-700 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {p.label} · {p.wetBulbC}°C
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-slate-400">
              Baseline (factory setpoints): PUE {baseline.pue.toFixed(4)} · WUE {baseline.wue.toFixed(3)} L/kWh
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" aria-hidden />
          {running ? "Evaluating permutations…" : "Run What-If"}
        </button>
      </Panel>

      {result ? (
        <WhatIfResults result={result} baseline={{ pue: baseline.pue, wue: baseline.wue }} />
      ) : null}

      <Panel title="Past runs">
        {runsError ? (
          <ErrorState message={runsError} onRetry={() => void loadRuns()} />
        ) : runs.length === 0 ? (
          <EmptyState
            title="No what-if runs yet"
            body="Run your first counterfactual analysis to compare setpoint strategies."
          />
        ) : (
          <ul className="divide-y divide-slate-800">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  to="/whatif/$runId"
                  params={{ runId: String(r.id) }}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:bg-slate-800/40 focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <span className="font-mono text-cyan-300">Run #{r.id}</span>
                  <span className="text-slate-400">
                    α {r.alpha.toFixed(2)} / β {r.beta.toFixed(2)} · {r.candidatesEvaluated} evaluated ·{" "}
                    {r.feasibleCount} feasible
                  </span>
                  <span className="font-mono text-slate-300">
                    {r.bestPue !== null ? `PUE ${r.bestPue.toFixed(4)} · WUE ${r.bestWue?.toFixed(3)}` : r.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function WhatIfResults({
  result,
  baseline,
}: {
  result: WhatIfResponse;
  baseline: { pue: number; wue: number };
}) {
  const best = result.best;

  if (!best) {
    return (
      <Panel title="Results">
        <EmptyState
          title="No feasible setpoints"
          body="Every permutation violated a hard guardrail in this scenario. Loosen the scenario or review limits."
        />
      </Panel>
    );
  }

  const dPue = best.pue - baseline.pue;
  const dWue = best.wue - baseline.wue;

  return (
    <Panel
      title={`Results — run #${result.runId} (${result.evaluated} evaluated, ${result.feasibleCount} feasible)`}
    >
      <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">Best candidate</p>
            <p className="mt-1 font-mono text-sm text-slate-200">
              Supply {best.setpoints.coolantSupplyC}°C · Pump {best.setpoints.pumpSpeedPct}% · Valve{" "}
              {best.setpoints.valvePosPct}% · CDU {best.setpoints.cduSetpointC}°C
            </p>
            <p className="mt-1 text-sm text-slate-300">
              PUE {best.pue.toFixed(4)} ({dPue <= 0 ? "" : "+"}
              {dPue.toFixed(4)} vs baseline) · WUE {best.wue.toFixed(3)} ({dWue <= 0 ? "" : "+"}
              {dWue.toFixed(3)}) · J = {best.cost.toFixed(4)}
            </p>
          </div>
          <Link
            to="/control"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            Apply per-zone on Control
          </Link>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Global scenario analysis only — pick a zone and apply (or run the per-zone sandbox) on the Control page.
        </p>
      </div>
      <CandidateTable candidates={result.candidates.slice(0, 15)} />
    </Panel>
  );
}

export const whatifRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/whatif",
  component: WhatIfPage,
});
