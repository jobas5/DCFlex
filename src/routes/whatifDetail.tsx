import { createRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ErrorState, StatusBadge } from "../components/ui";
import { api, type WhatIfResponse } from "../lib/api";
import { predict } from "../lib/twin/surrogate";
import { FACTORY_SETPOINTS } from "../lib/twin/types";
import { rootRoute } from "./root";
import { WhatIfResults } from "./whatif";

function WhatIfDetailPage() {
  const { runId } = useParams({ from: "/whatif/$runId" });
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setResult(await api.getWhatIfRun(Number(runId)));
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

  const baseline = predict({ itLoadMw: 6.4, wetBulbC: 18, dryBulbC: 24 }, FACTORY_SETPOINTS);

  return (
    <div className="space-y-4">
      <div>
        <Link to="/whatif" className="text-sm text-cyan-300 hover:underline focus-visible:outline-2 focus-visible:outline-cyan-400">
          ← Back to What-If Engine
        </Link>
        <h1 className="mt-1 text-xl font-semibold">What-If Run #{result.runId}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          {result.createdAt ? new Date(result.createdAt).toLocaleString() : ""}
          <StatusBadge tone="info">α {result.alpha.toFixed(2)}</StatusBadge>
          <StatusBadge tone="info">β {result.beta.toFixed(2)}</StatusBadge>
          <StatusBadge tone={result.best ? "good" : "warn"}>
            {result.feasibleCount} feasible / {result.evaluated} evaluated
          </StatusBadge>
        </p>
      </div>
      <WhatIfResults result={result} baseline={{ pue: baseline.pue, wue: baseline.wue }} />
    </div>
  );
}

export const whatifDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/whatif/$runId",
  component: WhatIfDetailPage,
});
