Implementation Plan

Goal: a working, demonstrable "DCLC control" web app on the existing cloudflare-app template — a dark, ops-grade dashboard with a simulated physics-guided digital twin, monotonic surrogate predictions, a What-If counterfactual engine, and closed-loop/shadow-mode control simulation. Simulated telemetry replaces physical BMS/CDU hardware. Persistence uses the template's Drizzle + D1 pattern./

Shared physics/surrogate core (new: src/lib/twin/)

src/lib/twin/types.ts: shared TS types — Telemetry (itLoadMw, cpuDieC, gpuDieC, cduSupplyC, cduReturnC, deltaPKpa, flowLpm, fwsSupplyC, fwsFlowLpm, wetBulbC, dryBulbC, timestamp), Setpoints (coolantSupplyC, pumpSpeedPct, valvePosPct, cduSetpointC), Prediction (accessoryPowerMw, pue, wue, chipTempC, deltaP, flow), GuardrailResult, WhatIfCandidate, WhatIfRun.
src/lib/twin/surrogate.ts: deterministic monotonic surrogate implemented in pure TS (Workers-safe, no Node APIs): accessory cooling power = sum of monotonic terms — non-decreasing in IT load (fan/pump affinity cubic on pump speed, linear chiller term in IT load), non-increasing in coolant supply temp within safe bounds, increasing in wet-bulb. PUE = (IT + accessory)/IT; WUE derived from wet-bulb approach (evaporative usage rises with wet-bulb and chiller share, falls as liquid share rises). Chip temp model: coolant supply + approach/(flow^0.8)·load — used for the 85°C guardrail. Exported pure functions: predict(telemetry, setpoints), evaluateGuardrails(prediction, setpoints) returning violations for T_chip > 85°C, ΔP outside 60–240 kPa, flow outside 400–1600 L/min.
src/lib/twin/simulator.ts: seeded PRNG telemetry generator producing realistic 10-minute-interval series with daily load cycles, weather drift, and occasional injected sensor anomalies (for the data-quality panel). tickTelemetry(prev, tickIndex) advances one simulated interval. Also generateHistory(n) for backfilling charts.
src/lib/twin/optimizer.ts: counterfactual grid search — enumerates setpoint permutations (supply temp 18–32°C step 1, pump speed 40–100% step 5, valve 30–100% step 10, CDU setpoint), filters by guardrails, scores J = α·PUE + β·WUE (normalized), returns ranked candidates plus best. Runs in the Worker on demand.
src/lib/twin/modelMeta.ts: static model card data (MAE 0.024 MW vs 0.026 target, PUE ±0.01 coverage 99.1%, ONNX export status, monotonic constraint list, temporal split description) plus a deterministic KL-divergence drift series generator.
Database (D1 + Drizzle)

wrangler.jsonc: add D1 binding DB (database_name e.g. dc-cooling-db, keep existing assets/worker-first config unchanged).
src/db/schema.ts: keep existing items table untouched (expand-contract); add:
telemetry_samples (id, tick, payload JSON text, pue, wue, created_at) — recent simulated history for reload persistence.
whatif_runs (id, created_at, alpha, beta, base_setpoints JSON, best_setpoints JSON, best_cost, best_pue, best_wue, candidates_evaluated, feasible_count, status).
whatif_candidates (id, run_id FK, setpoints JSON, pue, wue, cost, chip_temp_c, feasible, violations JSON).
control_state (single-row: id=1, mode 'shadow'|'closed_loop', comms_ok int, last_heartbeat text, slew_limited int, fail_safe_active int, updated_at).
control_actions (id, created_at, mode, setpoints JSON, kind 'would_be'|'applied'|'fail_safe', note).
model_metrics (id, created_at, mae_mw, pue_coverage, kl_divergence, inference_latency_ms).
Since migrations/meta/_journal.json exists, executor runs npm run db:generate after schema edits; never edit existing migration 0000_cloudy_romulus.sql.
seeds/local.sql: replace demo insert with realistic, re-runnable (INSERT OR IGNORE) seeds: control_state row (shadow mode), 3 model_metrics rows, 2 completed whatif_runs with 6–10 candidates each (one with an infeasible candidate showing guardrail violation), 3 control_actions "would-be" shadow logs, ~24 telemetry_samples covering 4 simulated hours. Then run npm run db:seed:remote.
Worker API (worker/index.ts, plus worker/routes/ helpers if cleaner)

Env extends CloudflareDatabaseEnv with DB: D1Database; use getDb(env).
Endpoints (all JSON, Workers-safe):
GET /api/health (keep).
GET /api/telemetry/current — latest sample from D1, or synthesize via simulator if table empty; returns telemetry + prediction at current setpoints.
POST /api/telemetry/tick — advance simulator one 10-min interval, insert row, return sample + prediction. Client polls this every ~5s to simulate streaming.
GET /api/telemetry/history?limit=96 — recent samples for charts.
POST /api/whatif — body {alpha, beta, baseSetpoints?, itLoadMw?, wetBulbC?}; runs optimizer grid search, persists run + candidates, returns ranked results with feasible/infeasible flags and best candidate.
GET /api/whatif — list past runs; GET /api/whatif/:id — run detail with candidates.
GET /api/control — control_state + recent control_actions.
POST /api/control/mode — {mode: 'shadow'|'closed_loop'} toggle.
POST /api/control/apply — apply a setpoint set: enforces slew-rate limit (max Δ3°C temp, Δ10% pump per action vs current setpoints; violations clamped and flagged), logs 'applied' (closed_loop) or 'would_be' (shadow) action.
POST /api/control/heartbeat — updates last_heartbeat; a derived watchdog check in GET /api/control marks fail_safe_active when heartbeat age > 30s, reverting reported setpoints to factory defaults and logging a 'fail_safe' action once.
GET /api/model/metrics — latest model_metrics + deterministic drift series.
Unknown /api/* → 404 JSON (keep existing behavior). Non-API paths fall through to SPA assets.
Client app (TanStack Router, Tailwind v4, lucide-react icons)

Routing (src/main.tsx + src/routes/): root layout with left sidebar nav (desktop) / bottom tab bar (mobile). Routes matched by pathname only (ignore query strings; no query embedded in redirect paths):
/ Overview dashboard: live KPI cards (PUE, WUE, IT load, accessory power, thermal margin = 85 − max chip temp), SVG line charts (PUE & WUE last 24 ticks, coolant temps, chip temps vs 85°C limit line), CDU loop schematic-style status panel (supply/return temps, ΔP, flow with in-bounds coloring), data-quality panel (outliers removed, drift flags, imputed counts from simulator metadata), auto-poll tick every 5s with pause/resume button.
/whatif Counterfactual engine: form with α/β sliders (labeled "Grid carbon weight α" / "Water scarcity weight β", showing implied priority), scenario context inputs (IT load, wet-bulb preset buttons: Cool/Mild/Hot-humid), "Run What-If" CTA → POST /api/whatif → results table of top candidates (setpoints, predicted PUE/WUE, cost, feasible badge, guardrail violations listed for infeasible), best-candidate highlight card with deltas vs baseline, and "Apply best setpoints" CTA (disabled in shadow mode — sends 'would_be' log and shows explanatory toast; enabled in closed-loop). Past runs list linking to /whatif/$runId detail.
/control Closed-loop control: mode toggle (Shadow Phase A / Closed-Loop Phase B) with confirmation, watchdog status card (last heartbeat age, 30s fail-safe threshold, factory setpoints shown when fail-safe active), slew-rate limit display and a "Test comms drop" button (stops heartbeats to demo fail-safe revert), action log table (applied/would-be/fail_safe entries), rollout status banner (Phase A 30-day shadow progress bar → Phase B).
/model Surrogate model: model card (algorithm, monotonic constraints listed, ONNX status), metric gauges vs targets (MAE 0.024 ≤ 0.026 MW, PUE coverage 99.1% ≥ 98.7%), latency stat, KL-divergence drift line chart with threshold band, monotonicity demo mini-chart (accessory power vs IT load curve proving non-decreasing response).
Components (src/components/): KpiCard, LineChart (hand-rolled responsive SVG with axis ticks, threshold lines, tooltips on hover/focus), Gauge, StatusBadge, SetpointSliders, DataTable, Toast (lightweight context), EmptyState, ErrorState with retry.
src/lib/api.ts: replace item functions with typed fetchers for all endpoints above, throwing on non-OK; client surfaces ErrorState with retry.
Styling: Tailwind dark ops theme (slate/zinc base, cyan/emerald accents, amber/red for warnings/violations), font-mono for numeric readouts. Responsive: sidebar collapses to bottom nav under md; KPI grids 1-col mobile → 2-col sm → 4-col lg; charts scale via viewBox; tables horizontally scroll on mobile.
Accessibility: labeled inputs/sliders (<label for>), focus-visible rings, aria-live on KPI updates and toast, semantic headings per route, color never the sole signal (icons + text on badges), keyboard-operable toggles and CTAs.
State: TanStack Router for route state; local component state + useEffect polling; no extra state library. No auth (single-operator demo tool) — no login flows.
Dependencies: none new required (React 19, TanStack Router, Tailwind v4, drizzle-orm, lucide-react already present). All physics/ML surrogate logic is hand-written TS to stay Workers-compatible.
Build/config constraints: keep dev/build/typecheck scripts; do not touch existing migration; run npm run db:generate after schema change; run npm run db:seed:remote after seeding; no Node-only APIs anywhere in worker or shared twin code.
Validation

Typecheck: npm run typecheck passes with zero errors.
Build: npm run build completes; Worker bundle and SPA assets emit without warnings about Node built-ins.
DB: npm run db:generate produced a new appended migration only (existing 0000_cloudy_romulus.sql unchanged); migration contains executable SQL for the five new tables; npm run db:seed:remote succeeds and re-running seeds/local.sql does not error (INSERT OR IGNORE).
Overview flow: app opens at / with seeded/live KPIs populated (no empty dashboard); pause/resume polling button visibly stops/starts telemetry ticks; charts render history and update; thermal margin card turns amber/red with icon + text when margin < 5°C in a hot scenario; kill network/force bad response → ErrorState with retry appears and recovers.
Navigation: all sidebar/bottom-nav items route correctly (/, /whatif, /control, /model); deep-linking to each pathname works via SPA fallback; no nav item is dead; unknown path shows a not-found view with a working link back to /.
What-If flow: adjusting α/β sliders updates the displayed objective; "Run What-If" with default and with Hot-humid preset returns ranked candidates; infeasible candidates show specific violations (e.g., "T_chip 87.2°C > 85°C"); changing α/β meaningfully re-ranks best candidate; run persists and appears in past-runs list; /whatif/$runId loads the same results after refresh; empty past-runs state shows guidance CTA before first run (fresh DB check via local seedless pass is optional — seeded rows must guarantee non-empty on first open).
Apply flow: in shadow mode, "Apply best setpoints" is disabled with explanation, and logging produces a 'would_be' entry visible on /control; in closed-loop mode, apply succeeds, slew-limit clamps a large jump (flag shown), and an 'applied' action appears in the log.
Control flow: mode toggle requires confirmation and persists across reload (control_state row); "Test comms drop" stops heartbeats, after 30s watchdog marks fail-safe active, setpoints shown revert to factory defaults, and a single 'fail_safe' action is logged; resuming heartbeats clears fail-safe.
Model flow: /model renders metric gauges meeting targets, KL-divergence drift chart with threshold band, and the monotonicity demo curve is visibly non-decreasing in IT load.
Responsive/a11y: at 375px width bottom nav appears, KPI cards stack, tables scroll horizontally, no content overflow; all sliders/inputs reachable and operable by keyboard with visible focus; toasts announced via aria-live.