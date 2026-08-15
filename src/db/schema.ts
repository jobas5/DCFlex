import { sql } from "drizzle-orm";
import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const zones = sqliteTable("zones", {
  id: int("id").primaryKey(),
  name: text("name").notNull(),
  baseLoadMw: real("base_load_mw").notNull().default(4.2),
  loadAmpMw: real("load_amp_mw").notNull().default(3.6),
  loadPhaseH: real("load_phase_h").notNull().default(9),
  wetBulbOffsetC: real("wet_bulb_offset_c").notNull().default(0),
  targetPue: real("target_pue").notNull().default(1.12),
  targetWue: real("target_wue").notNull().default(0.12),
  waterBudgetLpm: real("water_budget_lpm").notNull().default(1200),
  powerBudgetMw: real("power_budget_mw").notNull().default(1.0),
  mode: text("mode").notNull().default("shadow"),
  commsOk: int("comms_ok").notNull().default(1),
  lastHeartbeat: text("last_heartbeat"),
  slewLimited: int("slew_limited").notNull().default(0),
  failSafeActive: int("fail_safe_active").notNull().default(0),
  currentSetpoints: text("current_setpoints").notNull(),
  shadowSetpoints: text("shadow_setpoints"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const facilityConfig = sqliteTable("facility_config", {
  id: int("id").primaryKey(),
  totalWaterBudgetLpm: real("total_water_budget_lpm").notNull().default(4000),
  totalPowerBudgetMw: real("total_power_budget_mw").notNull().default(4.0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const powerTransfers = sqliteTable("power_transfers", {
  id: int("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  sourceId: int("source_id").notNull(),
  targetId: int("target_id").notNull(),
  waterDeltaLpm: real("water_delta_lpm").notNull().default(0),
  powerDeltaMw: real("power_delta_mw").notNull().default(0),
  sourceSetpoints: text("source_setpoints").notNull(),
  targetSetpoints: text("target_setpoints").notNull(),
  outcome: text("outcome").notNull().default("{}"),
  status: text("status").notNull().default("shadow"),
});

export const telemetrySamples = sqliteTable("telemetry_samples", {
  id: int("id").primaryKey({ autoIncrement: true }),
  clusterId: int("cluster_id").notNull(),
  tick: int("tick").notNull(),
  payload: text("payload").notNull(),
  pue: real("pue").notNull(),
  wue: real("wue").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const whatifRuns = sqliteTable("whatif_runs", {
  id: int("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  zoneId: int("zone_id"),
  alpha: real("alpha").notNull(),
  beta: real("beta").notNull(),
  baseSetpoints: text("base_setpoints").notNull(),
  bestSetpoints: text("best_setpoints"),
  bestCost: real("best_cost"),
  bestPue: real("best_pue"),
  bestWue: real("best_wue"),
  candidatesEvaluated: int("candidates_evaluated").notNull(),
  feasibleCount: int("feasible_count").notNull(),
  status: text("status").notNull().default("completed"),
});

export const whatifCandidates = sqliteTable("whatif_candidates", {
  id: int("id").primaryKey({ autoIncrement: true }),
  runId: int("run_id")
    .notNull()
    .references(() => whatifRuns.id),
  setpoints: text("setpoints").notNull(),
  pue: real("pue").notNull(),
  wue: real("wue").notNull(),
  cost: real("cost"),
  chipTempC: real("chip_temp_c").notNull(),
  feasible: int("feasible").notNull(),
  violations: text("violations").notNull().default("[]"),
});

export const controlActions = sqliteTable("control_actions", {
  id: int("id").primaryKey({ autoIncrement: true }),
  clusterId: int("cluster_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  mode: text("mode").notNull(),
  kind: text("kind").notNull(),
  setpoints: text("setpoints").notNull(),
  note: text("note").notNull().default(""),
});

export const shadowSamples = sqliteTable("shadow_samples", {
  id: int("id").primaryKey({ autoIncrement: true }),
  clusterId: int("cluster_id").notNull(),
  tick: int("tick").notNull(),
  setpoints: text("setpoints").notNull(),
  predictedPue: real("predicted_pue").notNull(),
  predictedWue: real("predicted_wue").notNull(),
  actualPue: real("actual_pue").notNull(),
  actualWue: real("actual_wue").notNull(),
  chipTempC: real("chip_temp_c").notNull(),
  feasible: int("feasible").notNull(),
  budgetOk: int("budget_ok").notNull(),
  meetsTarget: int("meets_target").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const alertEvents = sqliteTable("alert_events", {
  alertKey: text("alert_key").primaryKey(),
  state: text("state").notNull(),
  lastTick: int("last_tick").notNull(),
  lastSentAt: text("last_sent_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const modelMetrics = sqliteTable("model_metrics", {
  id: int("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  maeMw: real("mae_mw").notNull(),
  pueCoverage: real("pue_coverage").notNull(),
  klDivergence: real("kl_divergence").notNull(),
  inferenceLatencyMs: real("inference_latency_ms").notNull(),
});
