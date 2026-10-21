import { createRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card, ErrorState, PageHeader, Skeleton } from "../components/ui";
import { api, type WhatIfResponse } from "../lib/api";
import { fmtDateTime } from "../lib/time";
import { BestCandidate, CandidateTable, ResultSummary } from "./optimize";
import { rootRoute } from "./root";

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

  const back = (
    <Link
      to="/optimize"
      className="inline-flex items-center gap-1.5 text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Optimization
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={back} title={`What-if run #${runId}`} />
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }
  if (!result) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-80" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Baseline = the zone's configured target (from master data). Facility-scoped
  // runs use the mean zone target as the reference.
  const targets = Object.values(zoneTargets);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  const meanTarget = { pue: mean(targets.map((t) => t.pue)), wue: mean(targets.map((t) => t.wue)) };
  const baseline = result.zoneId != null ? (zoneTargets[result.zoneId] ?? meanTarget) : meanTarget;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        eyebrow={back}
        title={`What-if run #${result.runId}`}
        description={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            {result.createdAt ? <span>{fmtDateTime(result.createdAt)}</span> : null}
            <Badge tone="accent">{result.zoneId != null ? (zoneNames[result.zoneId] ?? `Zone ${result.zoneId}`) : "Facility"}</Badge>
            <Badge>α {result.alpha.toFixed(2)}</Badge>
            <Badge>β {result.beta.toFixed(2)}</Badge>
            <Badge tone={result.best ? "ok" : "warn"}>{result.best ? "Completed" : "No feasible setpoints"}</Badge>
          </span>
        }
      />
      <ResultSummary result={result} baseline={baseline} baselineLabel="vs target" />
      <BestCandidate result={result} />
      <Card title="Persisted candidates" description="Top 25 stored with the run, feasible first" icon={CheckCircle2}>
        <CandidateTable candidates={result.candidates} />
      </Card>
    </div>
  );
}

export const optimizeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/optimize/$runId",
  component: OptimizationDetailPage,
});
