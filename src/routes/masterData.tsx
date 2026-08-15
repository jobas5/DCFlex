import { createRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "../components/Toast";
import { Panel } from "../components/ui";
import { api, type FacilityConfigResponse, type ZoneConfigResponse } from "../lib/api";
import { rootRoute } from "./root";

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
      />
    </label>
  );
}

function MasterDataPage() {
  const toast = useToast();
  const [zones, setZones] = useState<ZoneConfigResponse[]>([]);
  const [facility, setFacility] = useState<FacilityConfigResponse | null>(null);
  const [selectedId, setSelectedId] = useState(1);
  const [draft, setDraft] = useState<{ targetPue: number; targetWue: number; waterBudgetLpm: number; powerBudgetMw: number } | null>(null);
  const [facilityDraft, setFacilityDraft] = useState<{ totalWaterBudgetLpm: number; totalPowerBudgetMw: number } | null>(null);

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

  const zone = zones.find((z) => z.id === selectedId);
  const current = draft ?? (zone ? { targetPue: zone.targetPue, targetWue: zone.targetWue, waterBudgetLpm: zone.waterBudgetLpm, powerBudgetMw: zone.powerBudgetMw } : null);

  const saveZone = async () => {
    if (!zone || !draft) return;
    try {
      await api.patchZone(zone.id, draft);
      toast("Zone targets & budgets saved.", "success");
      await load();
      setDraft(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    }
  };

  const saveFacility = async () => {
    if (!facilityDraft) return;
    try {
      await api.patchFacility(facilityDraft);
      toast("Facility budgets saved.", "success");
      await load();
      setFacilityDraft(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed.", "error");
    }
  };

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Master Data</h1>
        <p className="text-sm text-slate-400">
          Zone targets &amp; budgets, plus facility-wide water and power budgets
        </p>
      </div>

      <Panel title="Zone targets & budgets">
        <div className="flex flex-wrap gap-2">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setSelectedId(z.id)}
              aria-pressed={selectedId === z.id}
              className={`rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                selectedId === z.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {z.name}
            </button>
          ))}
        </div>
        {current ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Target PUE" value={String(current.targetPue)} onChange={(v) => setDraft({ ...current, targetPue: num(v, current.targetPue) })} />
            <Field label="Target WUE" value={String(current.targetWue)} onChange={(v) => setDraft({ ...current, targetWue: num(v, current.targetWue) })} />
            <Field label="Water budget (L/min)" value={String(current.waterBudgetLpm)} onChange={(v) => setDraft({ ...current, waterBudgetLpm: num(v, current.waterBudgetLpm) })} />
            <Field label="Power budget (MW)" value={String(current.powerBudgetMw)} onChange={(v) => setDraft({ ...current, powerBudgetMw: num(v, current.powerBudgetMw) })} />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void saveZone()}
          disabled={!draft}
          className="mt-3 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
        >
          Save zone
        </button>
      </Panel>

      <Panel title="Facility budgets">
        {facility ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Total water (L/min)"
              value={String(facilityDraft?.totalWaterBudgetLpm ?? facility.totalWaterBudgetLpm)}
              onChange={(v) => setFacilityDraft({ ...(facilityDraft ?? { totalWaterBudgetLpm: facility.totalWaterBudgetLpm, totalPowerBudgetMw: facility.totalPowerBudgetMw }), totalWaterBudgetLpm: num(v, facility.totalWaterBudgetLpm) })}
            />
            <Field
              label="Total power (MW)"
              value={String(facilityDraft?.totalPowerBudgetMw ?? facility.totalPowerBudgetMw)}
              onChange={(v) => setFacilityDraft({ ...(facilityDraft ?? { totalWaterBudgetLpm: facility.totalWaterBudgetLpm, totalPowerBudgetMw: facility.totalPowerBudgetMw }), totalPowerBudgetMw: num(v, facility.totalPowerBudgetMw) })}
            />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void saveFacility()}
          disabled={!facilityDraft}
          className="mt-3 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
        >
          Save facility
        </button>
      </Panel>
    </div>
  );
}

export const masterDataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/master",
  component: MasterDataPage,
});
