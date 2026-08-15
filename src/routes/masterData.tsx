import { createRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../components/Toast";
import { Panel } from "../components/ui";
import { api, type FacilityConfigResponse, type ZoneConfigResponse } from "../lib/api";
import { GUARDRAILS } from "../lib/twin/types";
import { rootRoute } from "./root";

interface ZoneDraft {
  targetPue: number;
  targetWue: number;
  waterBudgetLpm: number;
  powerBudgetMw: number;
}

interface FacilityDraft {
  totalWaterBudgetLpm: number;
  totalPowerBudgetMw: number;
}

function Field({
  label,
  value,
  onChange,
  error,
  step = "0.01",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  step?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error != null}
        className={`mt-1 w-full rounded-lg border bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
          error ? "border-red-500/60" : "border-slate-700"
        }`}
      />
      {error ? <span className="mt-1 block text-[11px] text-red-300">{error}</span> : null}
    </label>
  );
}

function MasterDataPage() {
  const toast = useToast();
  const [zones, setZones] = useState<ZoneConfigResponse[]>([]);
  const [facility, setFacility] = useState<FacilityConfigResponse | null>(null);
  const [selectedId, setSelectedId] = useState(1);
  const [draft, setDraft] = useState<ZoneDraft | null>(null);
  const [facilityDraft, setFacilityDraft] = useState<FacilityDraft | null>(null);

  const load = useCallback(async () => {
    try {
      const [z, f] = await Promise.all([api.listZones(), api.getFacility()]);
      setZones(z.zones);
      setFacility(f);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load config.", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset the draft whenever the selected zone changes.
  useEffect(() => {
    setDraft(null);
  }, [selectedId]);

  const zone = zones.find((z) => z.id === selectedId);
  const base: ZoneDraft | null = zone
    ? {
        targetPue: zone.targetPue,
        targetWue: zone.targetWue,
        waterBudgetLpm: zone.waterBudgetLpm,
        powerBudgetMw: zone.powerBudgetMw,
      }
    : null;
  const current = draft ?? base;

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  // --- Field-level validation on the current draft ---
  const fieldErrors = useMemo(() => {
    if (!current) return {};
    const e: Record<string, string> = {};
    if (current.targetPue <= 0) e.targetPue = "Must be a positive number.";
    if (current.targetWue <= 0) e.targetWue = "Must be a positive number.";
    if (current.waterBudgetLpm < GUARDRAILS.flowMinLpm)
      e.waterBudgetLpm = `Must be ≥ ${GUARDRAILS.flowMinLpm} L/min (required min flow).`;
    if (current.powerBudgetMw <= 0) e.powerBudgetMw = "Must be a positive number.";
    return e;
  }, [current]);

  // --- Facility-level conflict check (Σ zone budgets ≤ facility budget) ---
  const budgetConflict = useMemo(() => {
    if (!facility) return null;
    const waterSum = zones.reduce(
      (s, z) => s + (z.id === selectedId && current ? current.waterBudgetLpm : z.waterBudgetLpm),
      0,
    );
    const powerSum = zones.reduce(
      (s, z) => s + (z.id === selectedId && current ? current.powerBudgetMw : z.powerBudgetMw),
      0,
    );
    const waterTotal = facilityDraft?.totalWaterBudgetLpm ?? facility.totalWaterBudgetLpm;
    const powerTotal = facilityDraft?.totalPowerBudgetMw ?? facility.totalPowerBudgetMw;
    const issues: string[] = [];
    if (waterSum > waterTotal) issues.push(`Σ zone water (${waterSum.toLocaleString()} L/min) exceeds total water budget (${waterTotal.toLocaleString()} L/min).`);
    if (powerSum > powerTotal) issues.push(`Σ zone power (${powerSum.toFixed(2)} MW) exceeds total power budget (${powerTotal.toFixed(2)} MW).`);
    return issues;
  }, [zones, selectedId, current, facility, facilityDraft]);

  const zoneValid = draft != null && Object.keys(fieldErrors).length === 0;
  const facilityValid =
    facilityDraft != null && facilityDraft.totalWaterBudgetLpm > 0 && facilityDraft.totalPowerBudgetMw > 0;

  const saveZone = async () => {
    if (!zone || !draft) return;
    if (!zoneValid) return;
    if (budgetConflict?.length) {
      toast(budgetConflict[0], "error");
      return;
    }
    try {
      await api.patchZone(zone.id, draft);
      toast("✓ Zone configuration saved.", "success");
      await load();
      setDraft(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    }
  };

  const saveFacility = async () => {
    if (!facilityDraft) return;
    if (!facilityValid) {
      toast("Total budgets must be positive numbers.", "error");
      return;
    }
    // Facility budget must cover the zone allocations.
    const waterSum = zones.reduce((s, z) => s + (z.id === selectedId && current ? current.waterBudgetLpm : z.waterBudgetLpm), 0);
    const powerSum = zones.reduce((s, z) => s + (z.id === selectedId && current ? current.powerBudgetMw : z.powerBudgetMw), 0);
    if (facilityDraft.totalWaterBudgetLpm < waterSum || facilityDraft.totalPowerBudgetMw < powerSum) {
      toast("Facility budget is below the current zone allocations.", "error");
      return;
    }
    try {
      await api.patchFacility(facilityDraft);
      toast("✓ Facility budget saved.", "success");
      await load();
      setFacilityDraft(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="pt-2">
        <h1 className="text-xl font-semibold">Master Data</h1>
        <p className="text-sm text-slate-400">Zone targets &amp; budgets, plus facility-wide water and power budgets</p>
      </div>

      {/* Zone targets & budgets */}
      <Panel title="Zone targets & budgets">
        <p className="mb-3 text-sm text-slate-400">
          Configure the operational target and resource limits for each zone.
        </p>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Zones">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              role="tab"
              aria-selected={selectedId === z.id}
              onClick={() => setSelectedId(z.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                selectedId === z.id
                  ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.15)]"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {z.name}
            </button>
          ))}
        </div>

        {current ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field
              label="Target PUE"
              value={String(current.targetPue)}
              error={fieldErrors.targetPue}
              onChange={(v) => setDraft({ ...current, targetPue: num(v, current.targetPue) })}
            />
            <Field
              label="Target WUE"
              value={String(current.targetWue)}
              error={fieldErrors.targetWue}
              onChange={(v) => setDraft({ ...current, targetWue: num(v, current.targetWue) })}
            />
            <Field
              label="Water budget (L/min)"
              value={String(current.waterBudgetLpm)}
              step="1"
              error={fieldErrors.waterBudgetLpm}
              onChange={(v) => setDraft({ ...current, waterBudgetLpm: num(v, current.waterBudgetLpm) })}
            />
            <Field
              label="Power budget (MW)"
              value={String(current.powerBudgetMw)}
              error={fieldErrors.powerBudgetMw}
              onChange={(v) => setDraft({ ...current, powerBudgetMw: num(v, current.powerBudgetMw) })}
            />
          </div>
        ) : null}

        {budgetConflict?.length ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {budgetConflict.join(" ")}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void saveZone()}
          disabled={!draft || !zoneValid}
          className="mt-4 rounded-lg bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
        >
          Save zone
        </button>
      </Panel>

      {/* Facility budgets */}
      <Panel title="Facility budgets">
        <p className="mb-3 text-sm text-slate-400">Configure the total resource limits for the entire facility.</p>
        {facility ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Total water (L/min)"
              step="1"
              value={String(facilityDraft?.totalWaterBudgetLpm ?? facility.totalWaterBudgetLpm)}
              onChange={(v) =>
                setFacilityDraft({
                  ...(facilityDraft ?? { totalWaterBudgetLpm: facility.totalWaterBudgetLpm, totalPowerBudgetMw: facility.totalPowerBudgetMw }),
                  totalWaterBudgetLpm: num(v, facility.totalWaterBudgetLpm),
                })
              }
            />
            <Field
              label="Total power (MW)"
              value={String(facilityDraft?.totalPowerBudgetMw ?? facility.totalPowerBudgetMw)}
              onChange={(v) =>
                setFacilityDraft({
                  ...(facilityDraft ?? { totalWaterBudgetLpm: facility.totalWaterBudgetLpm, totalPowerBudgetMw: facility.totalPowerBudgetMw }),
                  totalPowerBudgetMw: num(v, facility.totalPowerBudgetMw),
                })
              }
            />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void saveFacility()}
          disabled={!facilityDraft || !facilityValid}
          className="mt-4 rounded-lg bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
        >
          Save facility
        </button>
      </Panel>

      <p className="flex items-center gap-1.5 py-2 text-center text-xs text-slate-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
        DCFlex uses these values as operational targets and hard constraints across optimization, transfer, and validation.
      </p>
    </div>
  );
}

export const masterDataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/master",
  component: MasterDataPage,
});
