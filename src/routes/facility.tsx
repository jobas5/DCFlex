import { createRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, Box as BoxIcon, CircleDot, Crosshair, MapPin, MousePointerClick, RotateCcw, ScanSearch } from "lucide-react";
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LineChart } from "../components/LineChart";
import {
  Badge,
  Button,
  buttonStyles,
  Card,
  cx,
  EmptyState,
  PageHeader,
  Segmented,
  Skeleton,
  STATUS_TONE,
  TONE_BG,
  TONE_TEXT,
  type Tone,
} from "../components/ui";
import { api, type SensorsResponse } from "../lib/api";
import { usePoll } from "../lib/poll";
import { useSim } from "../lib/simContext";
import { useTheme } from "../lib/theme";
import { fmtTick } from "../lib/time";
import { CHART } from "../lib/tokens";
import { SENSOR_DEFS, type SensorReading, type SensorStatus } from "../lib/twin/sensors";
import { rootRoute } from "./root";

// three.js only loads when this page opens.
const FacilityScene = lazy(() => import("../components/facility/FacilityScene"));

const STATUS_META: Record<SensorStatus, { tone: Tone; label: string }> = {
  ok: { tone: "ok", label: "OK" },
  warn: { tone: "warn", label: "Watch" },
  crit: { tone: "crit", label: "Alert" },
};

const EVENT_META = {
  outlier: { tone: "crit" as Tone, label: "Outlier rejected" },
  drift: { tone: "warn" as Tone, label: "Drift recalibrated" },
  imputed: { tone: "info" as Tone, label: "Gap filled" },
};

const EQUIPMENT_LABEL = { rack: "Rack", cdu: "CDU", primary: "Primary loop", tower: "Cooling tower" } as const;

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <SceneFallback reason="The 3D view failed to start in this browser." /> : this.props.children;
  }
}

function SceneFallback({ reason }: { reason: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState icon={BoxIcon} title="3D view unavailable" body={`${reason} The sensor list still shows every reading.`} />
    </div>
  );
}

const fmt = (r: SensorReading) => `${r.value.toFixed(SENSOR_DEFS[r.kind].digits)} ${SENSOR_DEFS[r.kind].unit}`;

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

function SensorDetail({ reading, zone }: { reading: SensorReading; zone: SensorsResponse["zones"][number] }) {
  const def = SENSOR_DEFS[reading.kind];
  const meta = STATUS_META[reading.status];
  const labels = zone.ticks.map((t) => fmtTick(t).slice(0, 5));
  const thresholds = [
    ...(def.limits?.max !== undefined ? [{ value: def.limits.max, label: `max ${def.limits.max}`, color: "var(--crit)" }] : []),
    ...(def.limits?.min !== undefined ? [{ value: def.limits.min, label: `min ${def.limits.min}`, color: "var(--crit)" }] : []),
    ...(def.warnAbove !== undefined ? [{ value: def.warnAbove, label: `watch ${def.warnAbove}`, color: "var(--warn)" }] : []),
  ];
  return (
    <Card
      title={def.label}
      description={`${zone.name} · ${EQUIPMENT_LABEL[def.equipment]}`}
      icon={Crosshair}
      action={
        <Badge tone={meta.tone} dot>
          {meta.label}
        </Badge>
      }
    >
      <div className="flex items-end justify-between gap-3">
        <p className={cx("text-3xl font-semibold tabular-nums tracking-tight", reading.status === "ok" ? "text-fg" : TONE_TEXT[meta.tone])}>
          {reading.value.toFixed(def.digits)}
          <span className="ml-1 text-base font-medium text-fg-subtle">{def.unit}</span>
        </p>
        {def.limits ? (
          <p className="pb-1 text-right text-xs text-fg-faint">
            Guardrail{" "}
            <span className="font-mono text-fg-muted">
              {def.limits.min ?? "—"} – {def.limits.max ?? "—"} {def.unit}
            </span>
          </p>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-fg-muted">{reading.reason}</p>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-fg-subtle">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {def.location}
      </p>

      <div className="mt-4">
        {reading.history.length > 1 ? (
          <LineChart
            height={130}
            ariaLabel={`${def.label} over the last ${reading.history.length} samples`}
            labels={labels}
            series={[{ label: def.label, color: CHART.cyan, values: reading.history, area: true }]}
            thresholds={thresholds.filter((t) => {
              const lo = Math.min(...reading.history);
              const hi = Math.max(...reading.history);
              return t.value >= lo - (hi - lo) * 2 && t.value <= hi + (hi - lo) * 2 + 2;
            })}
            yFormat={(v) => v.toFixed(def.digits)}
          />
        ) : (
          <p className="text-xs text-fg-subtle">Not enough history yet — run the simulation to collect samples.</p>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-xs font-medium text-fg-subtle">Data quality · last {zone.ticks.length} samples</p>
        {reading.events.length === 0 ? (
          <p className="mt-1.5 text-sm text-fg-muted">No corrections — every reading passed validation.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {reading.events.slice(0, 5).map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={cx("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", TONE_BG[EVENT_META[e.kind].tone])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-fg">{EVENT_META[e.kind].label}</span>
                  <span className="text-fg-subtle"> · {e.note}</span>
                </span>
                <span className="shrink-0 font-mono text-fg-faint">{fmtTick(e.tick).slice(0, 5)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/shadow" search={{ zone: zone.zoneId }} className={buttonStyles("secondary", "sm", "mt-4 w-full")}>
        {zone.name} control <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function FacilityPage() {
  const navigate = useNavigate();
  const { sensor: selectedId } = useSearch({ from: "/facility" });
  const { data: live } = useSim();
  const { theme } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useMemo(hasWebGL, []);
  const [data, setData] = useState<SensorsResponse | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const [resetKey, setResetKey] = useState(0);

  // 30s: sensor data changes once per simulation tick, and each poll reads
  // window × zones telemetry payloads.
  usePoll(
    async (stale) => {
      try {
        const d = await api.sensors(36);
        if (!stale()) setData(d);
      } catch {
        /* keep last good data */
      }
    },
    30000,
    [],
  );

  const select = useCallback(
    (id: string | undefined) => navigate({ to: "/facility", search: { sensor: id }, replace: true }),
    [navigate],
  );

  const zones = useMemo(
    () =>
      (data?.zones ?? []).map((z) => {
        const view = live?.zones.find((v) => v.id === z.zoneId);
        return { ...z, status: view?.status ?? "green", flowLpm: view?.prediction.flowLpm ?? 900, mode: view?.mode ?? "shadow" };
      }),
    [data, live],
  );

  const all = zones.flatMap((z) => z.sensors);
  const counts = { warn: all.filter((s) => s.status === "warn").length, crit: all.filter((s) => s.status === "crit").length };
  const lookup = (id: string | null | undefined) => {
    if (!id) return null;
    for (const z of zones) {
      const r = z.sensors.find((s) => s.id === id);
      if (r) return { reading: r, zone: z };
    }
    return null;
  };
  const selected = lookup(selectedId);
  const hovered = lookup(hoveredId);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Facility 3D"
        description="Representative layout of each zone's liquid-cooling loop. Click a sensor to inspect its live reading and data quality."
        actions={
          <Segmented
            ariaLabel="Sensor filter"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All ${all.length || ""}`.trim() },
              { value: "issues", label: `Issues ${counts.warn + counts.crit}` },
            ]}
          />
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="relative h-[420px] overflow-hidden rounded-2xl border border-line bg-surface shadow-card sm:h-[560px]">
            {!webgl ? (
              <SceneFallback reason="This browser doesn't support WebGL." />
            ) : !data ? (
              <Skeleton className="h-full rounded-none" />
            ) : (
              <SceneBoundary>
                <Suspense fallback={<Skeleton className="h-full rounded-none" />}>
                  <FacilityScene
                    zones={zones}
                    selectedId={selectedId ?? null}
                    hoveredId={hoveredId}
                    onSelect={select}
                    onHover={setHoveredId}
                    resetKey={resetKey}
                    theme={theme}
                    reducedMotion={reducedMotion}
                  />
                </Suspense>
              </SceneBoundary>
            )}

            {webgl && data ? (
              <>
                <div className="pointer-events-none absolute left-3 top-3 max-w-[70%]">
                  {hovered ? (
                    <div className="rounded-lg border border-line bg-surface/90 px-3 py-2 text-xs shadow-pop backdrop-blur">
                      <p className="font-medium text-fg">
                        {hovered.zone.name} · {SENSOR_DEFS[hovered.reading.kind].label}
                      </p>
                      <p className={cx("mt-0.5 tabular-nums", TONE_TEXT[STATUS_META[hovered.reading.status].tone])}>
                        {fmt(hovered.reading)} · {hovered.reading.reason}
                      </p>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 rounded-lg bg-surface/80 px-2.5 py-1.5 text-[11px] text-fg-subtle backdrop-blur">
                      <MousePointerClick className="h-3.5 w-3.5" aria-hidden /> Drag to orbit · scroll to zoom · click a sensor
                    </p>
                  )}
                </div>
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <div className="hidden items-center gap-3 rounded-lg bg-surface/80 px-2.5 py-1.5 text-[11px] text-fg-subtle backdrop-blur sm:flex">
                    {(["ok", "warn", "crit"] as const).map((s) => (
                      <span key={s} className="flex items-center gap-1.5">
                        <span className={cx("h-2 w-2 rounded-full", TONE_BG[STATUS_META[s].tone])} aria-hidden />
                        {STATUS_META[s].label}
                      </span>
                    ))}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setResetKey((k) => k + 1)} aria-label="Reset camera">
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
                <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5 text-[11px]">
                  {[
                    ["Secondary supply", "bg-info"],
                    ["Secondary return", "bg-warn"],
                    ["Facility water", "bg-accent"],
                    ["Facility return", "bg-violet"],
                  ].map(([label, cls]) => (
                    <span key={label} className="flex items-center gap-1.5 rounded-md bg-surface/80 px-2 py-1 text-fg-subtle backdrop-blur">
                      <span className={cx("h-[3px] w-3 rounded-full", cls)} aria-hidden />
                      {label}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </section>
          <p className="flex items-center gap-1.5 text-xs text-fg-faint">
            <ScanSearch className="h-3.5 w-3.5" aria-hidden />
            Positions are representative of a liquid-cooled row, not a surveyed floor plan. Readings and data-quality events are live
            from the digital twin.
          </p>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20">
          {selected ? <SensorDetail reading={selected.reading} zone={selected.zone} /> : null}

          <Card
            title="Sensors"
            description={`${all.length} sensors · ${counts.warn} watch · ${counts.crit} alert`}
            icon={CircleDot}
            bodyClassName="max-h-[560px] overflow-y-auto"
          >
            {!data ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {zones.map((z) => {
                  const rows = filter === "issues" ? z.sensors.filter((s) => s.status !== "ok") : z.sensors;
                  return (
                    <div key={z.zoneId}>
                      <p className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-fg">
                          <span className={cx("h-2 w-2 rounded-full", TONE_BG[STATUS_TONE[z.status]])} aria-hidden />
                          {z.name}
                        </span>
                        <span className="text-fg-faint">{z.mode === "closed_loop" ? "Closed-loop" : "Shadow"}</span>
                      </p>
                      {rows.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-fg-faint">No issues</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {rows.map((s) => {
                            const active = s.id === selectedId;
                            return (
                              <li key={s.id}>
                                <button
                                  type="button"
                                  onClick={() => select(active ? undefined : s.id)}
                                  onMouseEnter={() => setHoveredId(s.id)}
                                  onMouseLeave={() => setHoveredId(null)}
                                  aria-pressed={active}
                                  className={cx(
                                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                                    active ? "bg-surface-2 ring-1 ring-inset ring-accent/40" : "hover:bg-surface-2/60",
                                  )}
                                >
                                  <span className={cx("h-2 w-2 shrink-0 rounded-full", TONE_BG[STATUS_META[s.status].tone])} aria-label={STATUS_META[s.status].label} />
                                  <span className="min-w-0 flex-1 truncate text-fg-muted">{SENSOR_DEFS[s.kind].label}</span>
                                  <span className="shrink-0 font-mono text-xs tabular-nums text-fg">{fmt(s)}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export const facilityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/facility",
  validateSearch: (search: Record<string, unknown>): { sensor?: string } => ({
    sensor: typeof search.sensor === "string" ? search.sensor : undefined,
  }),
  component: FacilityPage,
});
