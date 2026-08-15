import { createRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ErrorState, StatusBadge } from "../components/ui";
import { api, type WhatIfResponse } from "../lib/api";
import { fmtDateTime } from "../lib/time";
import { rootRoute } from "./root";
import { WhatIfResults } from "./optimize";

function OptimizationDetailPage() {
  const { runId } = useParams({ from: "/optimize/$runId" });
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoneNames, setZoneNames] = useState<Record<number, string>>({});
  const [zoneTargets, setZoneTargets] = useState<Record<number, { pue: number; wue: number }>>({});

  const load = useCallback(async () => {
    try {
      const [res, z] = await Promise.all([api.getWhatIfRun(Number(runId)), api.listZones()]);
      setResult(res);
      setZoneNames(Object.fromEntries(z.zones.map((z) => [z.id, z.name])));
      setZoneTargets(Object.fromEntries(z.zones.map((z) => [z.id, { pue: z.targetPue, wue: z.targetWue }])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run.");
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!result) return <p className="py-20 text-center text-sm text-slate-400">Loading run…</p>;

  // Baseline = the zone's configured target (from master data). Facility-scoped
  // runs use the mean zone target as the reference.
  const targets = Object.values(zoneTargets);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  const baseline =
    result.zoneId != null
      ? zoneTargets[result.zoneId] ?? { pue: mean(targets.map((t) => t.pue)), wue: mean(targets.map((t) => t.wue)) }
      : { pue: mean(targets.map((t) => t.pue)), wue: mean(targets.map((t) => t.wue)) };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/optimize" className="text-sm text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
          ← Back to Optimization
        </Link>
        <h1 className="mt-1 text-xl font-semibold">What-If Run #{result.runId}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          {result.createdAt ? fmtDateTime(result.createdAt) : ""}
          {result.zoneId != null ? (
            <StatusBadge tone="info">{zoneNames[result.zoneId] ?? `Zone ${result.zoneId}`}</StatusBadge>
          ) : (
            <StatusBadge tone="info">Facility</StatusBadge>
          )}
          <StatusBadge tone="info">α {result.alpha.toFixed(2)}</StatusBadge>
          <StatusBadge tone="info">β {result.beta.toFixed(2)}</StatusBadge>
          <StatusBadge tone={result.best ? "good" : "warn"}>
            {result.feasibleCount} feasible / {result.evaluated} evaluated
          </StatusBadge>
        </p>
      </div>
      <WhatIfResults result={result} baseline={baseline} />
    </div>
  );
}

export const optimizeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/optimize/$runId",
  component: OptimizationDetailPage,
});
