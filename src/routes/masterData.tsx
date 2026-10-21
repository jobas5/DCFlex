import { createRoute } from "@tanstack/react-router";
import { AlertTriangle, Building2, Check, Droplets, Layers, Loader2, RotateCcw, ShieldCheck, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  Card,
  cx,
  ErrorState,
  Meter,
  NumberField,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  usageTone,
} from "../components/ui";
import { api, type FacilityConfigResponse, type ZoneConfigResponse } from "../lib/api";
import { GUARDRAILS } from "../lib/twin/types";
import { rootRoute } from "./root";

type ZoneKey = "targetPue" | "targetWue" | "waterBudgetLpm" | "powerBudgetMw";
type FacilityKey = "totalWaterBudgetLpm" | "totalPowerBudgetMw";

const ZONE_FIELDS: { key: ZoneKey; label: string; suffix?: string }[] = [
  { key: "targetPue", label: "Target PUE" },
  { key: "targetWue", label: "Target WUE", suffix: "L/kWh" },
  { key: "waterBudgetLpm", label: "Water budget", suffix: "L/min" },
  { key: "powerBudgetMw", label: "Power budget", suffix: "MW" },
];

function zoneFieldError(key: ZoneKey, v: number): string | undefined {
  if (!Number.isFinite(v)) return "Enter a number.";
  if (key === "targetPue" && v < 1) return "PUE can't be below 1.";
  if (key === "waterBudgetLpm" && v < GUARDRAILS.flowMinLpm) return `Min ${GUARDRAILS.flowMinLpm} L/min (loop flow floor).`;
  if (v <= 0) return "Must be positive.";
  return undefined;
}

function Allocation({
  icon: Icon,
  label,
  used,
  total,
  unit,
  digits,
}: {
  icon: typeof Zap;
  label: string;
  used: number;
  total: number;
  unit: string;
  digits: number;
}) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const tone = usageTone(pct);
  return (
    <div className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-inset ring-line">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
        </p>
        <span className={cx("text-xs font-medium tabular-nums", pct > 100 ? "text-crit" : "text-fg-subtle")}>{Math.round(pct)}% allocated</span>
      </div>
      <p className="mt-2 text-lg font-semibold tabular-nums text-fg">
        {used.toLocaleString(undefined, { maximumFractionDigits: digits })}
        <span className="text-sm font-normal text-fg-subtle">
          {" "}
          / {total.toLocaleString(undefined, { maximumFractionDigits: digits })} {unit}
        </span>
      </p>
      <Meter value={pct} tone={tone} className="mt-2" label={`${label} allocated to zones`} />
      <p className="mt-1.5 text-[11px] text-fg-faint">
        {pct > 100
          ? "Zone budgets exceed the facility total."
          : `${(total - used).toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit} unallocated`}
      </p>
    </div>
  );
}

function MasterDataPage() {
  const toast = useToast();
  const [zones, setZones] = useState<ZoneConfigResponse[] | null>(null);
  const [facility, setFacility] = useState<FacilityConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Partial<Record<ZoneKey, string>>>>({});
  const [facilityDraft, setFacilityDraft] = useState<Partial<Record<FacilityKey, string>>>({});
  const [saving, setSaving] = useState<number | "facility" | null>(null);

  const load = useCallback(async () => {
    try {
      const [z, f] = await Promise.all([api.listZones(), api.getFacility()]);
      setZones(z.zones);
      setFacility(f);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load configuration.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Resolved value of a zone field: the draft if parseable, else the saved value.
  const zoneValue = useCallback(
    (z: ZoneConfigResponse, key: ZoneKey) => {
      const d = drafts[z.id]?.[key];
      return d !== undefined ? Number(d) : z[key];
    },
    [drafts],
  );

  const sums = useMemo(() => {
    if (!zones) return { water: 0, power: 0 };
    const val = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
    return {
      water: zones.reduce((s, z) => s + val(zoneValue(z, "waterBudgetLpm"), z.waterBudgetLpm), 0),
      power: zones.reduce((s, z) => s + val(zoneValue(z, "powerBudgetMw"), z.powerBudgetMw), 0),
    };
  }, [zones, zoneValue]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!zones || !facility) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-80" />
        <Skeleton className="h-56" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const facWater = facilityDraft.totalWaterBudgetLpm !== undefined ? Number(facilityDraft.totalWaterBudgetLpm) : facility.totalWaterBudgetLpm;
  const facPower = facilityDraft.totalPowerBudgetMw !== undefined ? Number(facilityDraft.totalPowerBudgetMw) : facility.totalPowerBudgetMw;
  const savedWater = zones.reduce((s, z) => s + z.waterBudgetLpm, 0);
  const savedPower = zones.reduce((s, z) => s + z.powerBudgetMw, 0);
  const facilityErrors: Partial<Record<FacilityKey, string>> = {};
  if (!(facWater > 0)) facilityErrors.totalWaterBudgetLpm = "Must be positive.";
  else if (facWater < savedWater) facilityErrors.totalWaterBudgetLpm = `Below zone allocations (${savedWater.toLocaleString()} L/min).`;
  if (!(facPower > 0)) facilityErrors.totalPowerBudgetMw = "Must be positive.";
  else if (facPower < savedPower - 1e-9) facilityErrors.totalPowerBudgetMw = `Below zone allocations (${savedPower.toFixed(2)} MW).`;
  const facilityDirty = Object.keys(facilityDraft).length > 0;
  const overAllocated = sums.water > facWater || sums.power > facPower + 1e-9;

  const saveZone = async (z: ZoneConfigResponse) => {
    const d = drafts[z.id];
    if (!d) return;
    const patch: Partial<Record<ZoneKey, number>> = {};
    for (const [k, v] of Object.entries(d) as [ZoneKey, string][]) patch[k] = Number(v);
    setSaving(z.id);
    try {
      await api.patchZone(z.id, patch);
      toast(`${z.name} saved.`, "success");
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[z.id];
        return next;
      });
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setSaving(null);
    }
  };

  const saveFacility = async () => {
    setSaving("facility");
    try {
      await api.patchFacility({ totalWaterBudgetLpm: facWater, totalPowerBudgetMw: facPower });
      toast("Facility budgets saved.", "success");
      setFacilityDraft({});
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        title="Master data"
        description="Targets and budgets that act as hard constraints across optimisation, transfer and validation."
      />

      <Card title="Facility budgets" description="Total resources the zones are allocated from" icon={Building2}>
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Allocation icon={Droplets} label="Water" used={sums.water} total={facWater} unit="L/min" digits={0} />
            <Allocation icon={Zap} label="Accessory power" used={sums.power} total={facPower} unit="MW" digits={2} />
          </div>
          <div className="space-y-3">
            <NumberField
              label="Total water"
              suffix="L/min"
              value={facilityDraft.totalWaterBudgetLpm ?? String(facility.totalWaterBudgetLpm)}
              dirty={facilityDraft.totalWaterBudgetLpm !== undefined}
              error={facilityErrors.totalWaterBudgetLpm}
              onChange={(v) => setFacilityDraft((p) => ({ ...p, totalWaterBudgetLpm: v }))}
            />
            <NumberField
              label="Total power"
              suffix="MW"
              value={facilityDraft.totalPowerBudgetMw ?? String(facility.totalPowerBudgetMw)}
              dirty={facilityDraft.totalPowerBudgetMw !== undefined}
              error={facilityErrors.totalPowerBudgetMw}
              onChange={(v) => setFacilityDraft((p) => ({ ...p, totalPowerBudgetMw: v }))}
            />
            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={() => void saveFacility()}
                disabled={!facilityDirty || Object.keys(facilityErrors).length > 0 || saving !== null}
              >
                {saving === "facility" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                Save facility
              </Button>
              {facilityDirty ? (
                <Button variant="ghost" size="sm" onClick={() => setFacilityDraft({})}>
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Zones" description="Operational targets and resource limits per zone" icon={Layers}>
        {overAllocated ? (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2.5 text-xs text-warn ring-1 ring-inset ring-warn/25">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Σ zone budgets exceed the facility budget ({Math.round(sums.water).toLocaleString()} / {facWater.toLocaleString()} L/min ·{" "}
            {sums.power.toFixed(2)} / {facPower.toFixed(2)} MW). Lower a zone budget or raise the facility total first.
          </p>
        ) : null}
        <Table minWidth={760}>
          <thead>
            <tr>
              <Th>Zone</Th>
              {ZONE_FIELDS.map((f) => (
                <Th key={f.key}>
                  {f.label}
                  {f.suffix ? <span className="ml-1 normal-case tracking-normal text-fg-faint">({f.suffix})</span> : null}
                </Th>
              ))}
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => {
              const d = drafts[z.id];
              const dirty = d != null && Object.keys(d).length > 0;
              const errors = Object.fromEntries(
                ZONE_FIELDS.map((f) => [f.key, d?.[f.key] !== undefined ? zoneFieldError(f.key, Number(d[f.key])) : undefined]),
              ) as Record<ZoneKey, string | undefined>;
              const valid = Object.values(errors).every((e) => !e);
              return (
                <tr key={z.id} className={cx(dirty && "bg-accent/[0.03]")}>
                  <Td className="w-40">
                    <p className="font-medium text-fg">{z.name}</p>
                    <Badge tone={z.mode === "closed_loop" ? "accent" : "neutral"} className="mt-1">
                      {z.mode === "closed_loop" ? "Closed-loop" : "Shadow"}
                    </Badge>
                  </Td>
                  {ZONE_FIELDS.map((f) => (
                    <Td key={f.key} className="align-top">
                      <div className="w-28">
                        <NumberField
                          label={`${z.name} ${f.label}`}
                          hideLabel
                          value={d?.[f.key] ?? String(z[f.key])}
                          dirty={d?.[f.key] !== undefined}
                          error={errors[f.key]}
                          onChange={(v) =>
                            setDrafts((prev) => {
                              const row = { ...prev[z.id] };
                              if (v === String(z[f.key])) delete row[f.key];
                              else row[f.key] = v;
                              return { ...prev, [z.id]: row };
                            })
                          }
                        />
                      </div>
                    </Td>
                  ))}
                  <Td className="text-right align-middle">
                    <div className="flex justify-end gap-1.5">
                      {dirty ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Reset ${z.name}`}
                          onClick={() =>
                            setDrafts((prev) => {
                              const next = { ...prev };
                              delete next[z.id];
                              return next;
                            })
                          }
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      ) : null}
                      <Button
                        variant={dirty ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => void saveZone(z)}
                        disabled={!dirty || !valid || overAllocated || saving !== null}
                      >
                        {saving === z.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        Save
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-fg-faint">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Changes are validated server-side against guardrails and facility totals.
      </p>
    </div>
  );
}

export const masterDataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/master",
  component: MasterDataPage,
});
