import { sql } from "drizzle-orm";
import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const items = sqliteTable("items", {
  id: int("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const telemetrySamples = sqliteTable("telemetry_samples", {
  id: int("id").primaryKey({ autoIncrement: true }),
  tick: int("tick").notNull(),
  payload: text("payload").notNull(),
  pue: real("pue").notNull(),
  wue: real("wue").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const whatifRuns = sqliteTable("whatif_runs", {
  id: int("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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

export const controlState = sqliteTable("control_state", {
  id: int("id").primaryKey(),
  mode: text("mode").notNull().default("shadow"),
  commsOk: int("comms_ok").notNull().default(1),
  lastHeartbeat: text("last_heartbeat"),
  slewLimited: int("slew_limited").notNull().default(0),
  failSafeActive: int("fail_safe_active").notNull().default(0),
  currentSetpoints: text("current_setpoints").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const controlActions = sqliteTable("control_actions", {
  id: int("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  mode: text("mode").notNull(),
  kind: text("kind").notNull(),
  setpoints: text("setpoints").notNull(),
  note: text("note").notNull().default(""),
});

export const modelMetrics = sqliteTable("model_metrics", {
  id: int("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  maeMw: real("mae_mw").notNull(),
  pueCoverage: real("pue_coverage").notNull(),
  klDivergence: real("kl_divergence").notNull(),
  inferenceLatencyMs: real("inference_latency_ms").notNull(),
});
