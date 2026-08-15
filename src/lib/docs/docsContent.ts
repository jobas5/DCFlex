/**
 * Canonical documentation content for the app.
 * The `/docs` screen renders this same information with the app's UI
 * components, and the "Download as Markdown" button exports the string below
 * verbatim, so both views always stay in sync.
 */
export const DOCS_FILENAME = "data-center-cooling-optimizer-docs.md";

export const DOCS_MARKDOWN = `# Data Center Liquid Cooling Optimizer — System Documentation

A monitoring and optimization dashboard — a physics-guided digital twin — for high-density liquid-cooled data centers. It balances **thermal safety**, **PUE** (energy efficiency), and **WUE** (water efficiency) in real time.

All telemetry in this application is **simulated**: a deterministic digital twin stands in for physical BMS/CDU hardware that would otherwise be integrated over BACnet/IP, Modbus TCP, or MQTT. Everything you see — live telemetry, surrogate predictions, what-if optimization, and closed-loop control — runs against that simulation, with persistence in a Cloudflare D1 (SQLite) database.

## Table of contents

1. [What the application is](#what-the-application-is)
2. [Key concepts glossary](#key-concepts-glossary)
3. [The four screens](#the-four-screens)
4. [How the simulation works](#how-the-simulation-works)
5. [Tech stack](#tech-stack)
6. [Data model](#data-model)
7. [API reference](#api-reference)

## What the application is

The Data Center Liquid Cooling Optimizer is an AI-driven, physics-guided digital twin and multi-objective optimization controller for liquid-cooled data centers. It continuously answers three questions:

- **Are we safe?** — chip die temperatures, loop differential pressure, and flow are checked against hard guardrails on every reading and every candidate setpoint change.
- **Are we efficient?** — a monotonicity-constrained surrogate model predicts facility accessory cooling power, PUE, and WUE for any operating point.
- **Could we do better?** — a counterfactual what-if engine searches thousands of setpoint permutations and ranks them by a configurable energy/water objective, and a phased control loop can write winning setpoints back to the plant.

Because no physical facility is attached, a seeded, deterministic telemetry generator simulates the plant: IT load cycles, weather, coolant loops, sensor faults, and all downstream physics.

## Key concepts glossary

| Term | Meaning |
| --- | --- |
| **PUE** | Power Usage Effectiveness = (IT power + accessory cooling power) / IT power. Lower is better; the dashboard target is **< 1.12**. |
| **WUE** | Water Usage Effectiveness in **L/kWh** — site water intensity of cooling. Lower is better. |
| **CDU** | Coolant Distribution Unit — circulates the secondary (technology cooling system) loop between the facility water system and the cold plates. |
| **ΔP** | Differential pressure across the secondary loop, in kPa. |
| **FWS** | Facility Water System — the primary loop that rejects heat to atmosphere (dry coolers / cooling towers). |
| **TCS** | Technology Cooling System — the secondary coolant loop feeding the cold plates (CDU supply/return). |
| **Thermal margin** | Headroom between the current worst chip temperature (GPU die) and the 85°C limit, in °C. The UI warns below 5°C and alarms below 3°C. |
| **Guardrails** | Hard safety bounds every candidate setpoint must satisfy: **T_chip ≤ 85°C**, **ΔP 60–240 kPa**, **flow 400–1600 L/min**. Violating candidates are ranked infeasible and never applied. |
| **Monotonic surrogate model** | A physics-guided gradient-boosting surrogate (LightGBM-style, exported to ONNX) predicting accessory cooling power. Structural monotonic constraints: higher IT load → non-decreasing cooling power; higher coolant supply temperature → non-increasing chiller demand; higher wet-bulb → non-decreasing facility power. |
| **Accuracy targets** | **MAE ≤ 0.026 MW** on accessory power; PUE within **±0.01** for **≥ 98.7%** of test samples. Current model card: MAE 0.024 MW, PUE coverage 99.1%, p50 inference latency 3.8 ms. |
| **Objective function** | **J = α·PUE + β·WUE**, with each term min–max normalized across the feasible envelope. α is the grid-carbon (energy) weight; β is the water-scarcity weight. |
| **Shadow mode (Phase A)** | 30-day validation period where optimizer actions are logged as *would-be* actions with no writeback. |
| **Closed-loop (Phase B)** | Live mode where setpoints are written back, starting off-peak and expanding to 24/7, with slew-rate limits and a watchdog fail-safe. |
| **Slew-rate limits** | Maximum change per adjustment: **±3°C** on coolant supply, **±10%** on pump speed, **±15%** on valve position. |
| **Watchdog fail-safe** | If the control heartbeat is lost for more than **30 seconds**, the system reverts to factory setpoints (22°C supply, 70% pump, 80% valve, 24°C CDU) and logs a fail-safe action. |

## The four screens

### 1. Overview (\`/\`)

The live facility view.

- KPI cards: **PUE**, **WUE**, **IT load (MW)**, **accessory power (MW)**, and **thermal margin (°C)**, each with status coloring.
- Trend charts: PUE & WUE over recent intervals, and CPU/GPU die temperatures plotted against the 85°C limit line.
- Loop panels: CDU secondary loop (supply/return, ΔP, flow, active setpoints) and facility water/ambient conditions (FWS supply and flow, wet-bulb, dry-bulb).
- **Data-quality pipeline** panel: running totals of outliers removed, sensor-drift flags, and imputed values, with drift toasts.
- **Pause/Resume stream** button freezes the 5-second polling loop without losing state.

### 2. What-If Engine (\`/whatif\`)

The counterfactual analysis interface.

- Sliders set the objective weights **α** (grid carbon / PUE priority) and **β** (water scarcity / WUE priority).
- A scenario builder sets IT load (2–12 MW) and an ambient preset (Cool 10°C, Mild 18°C, Hot & humid 26°C wet-bulb).
- **Run What-If** executes a grid search over **1,560 setpoint permutations** (15 coolant supply temperatures × 13 pump speeds × 8 valve positions), predicting PUE/WUE for each and evaluating the hard guardrails.
- Results are ranked feasible-first by cost J, with a summary of best PUE/WUE, feasible count, and a full candidate table marking infeasible rows and their violations.
- **Apply best setpoints** sends the winner to the control loop (subject to mode and slew limits); in shadow mode it is logged as a would-be action.
- Every run is persisted with its candidates and can be reopened via a shareable link at \`/whatif/<runId>\`.

### 3. Control Loop (\`/control\`)

The phased closed-loop controller.

- **Rollout status** shows Phase A (30-day shadow validation) vs Phase B (closed-loop release) with a progress bar.
- **Operating mode** can be switched between shadow and closed-loop behind a confirmation dialog.
- **Heartbeat watchdog**: the page sends a heartbeat every 4 seconds; if heartbeats stop for more than 30 seconds the fail-safe trips, reverts to factory setpoints, and logs it. A "simulate comms loss" toggle demonstrates this.
- **Setpoint sliders** adjust coolant supply, pump speed, and valve position. Applying a change first validates it against the hard guardrails (infeasible requests are rejected with an error), then enforces slew-rate limits (±3°C, ±10% pump, ±15% valve per step) — oversized jumps are clamped and flagged.
- An **action log** lists the 30 most recent applied / would-be / fail-safe actions.

### 4. Surrogate Model (\`/model\`)

The model card and verification view.

- Model metadata: LightGBM monotonicity-constrained gradient boosting, ONNX 1.17 (opset 18) serving format, 70/15/15 chronological train/val/test split with a 14-day embargo, version dc-cooling-surrogate v1.4.2.
- Metric gauges vs targets: MAE 0.024 MW (target ≤ 0.026), PUE ±0.01 coverage 99.1% (target ≥ 98.7%), inference latency 3.8 ms (target < 10 ms), latest KL divergence (warn at 0.08).
- **Model drift** chart: hourly KL divergence of the feature distribution against the training baseline for the last 48 hours, with the 0.08 warning threshold and a 0.15 retrain trigger.
- **Monotonicity proof** chart: accessory power vs IT load at fixed setpoints, structurally non-decreasing as required by the constraints.

## How the simulation works

1. **Seeded deterministic telemetry.** A mulberry32 PRNG seeded per tick generates reproducible plant behavior: a time-of-day IT load cycle (~4.2–7.8 MW), a diurnal wet-bulb wave, coolant-loop physics from the active setpoints, and heat-balance return temperatures.
2. **10-minute ticks every 5 seconds.** Each tick represents a 10-minute aggregation interval (the streaming aggregation cadence of a real deployment); the dashboard polls a new tick every 5 seconds so a full day of plant behavior plays back quickly.
3. **Data-quality layer.** Roughly 4% of ticks inject an outlier (removed and replaced by a model estimate), ~4% flag sensor drift (z-score recalibration), and ~3% require imputation — all surfaced in the Overview data-quality panel.
4. **Surrogate prediction.** Each tick and each what-if candidate is scored by the physics-guided surrogate: pump power follows the affinity law (cubic in speed), chiller power is linear in IT load with wet-bulb penalty and free-cooling credit at warmer supply temperatures, and PUE/WUE are derived from those terms.
5. **Guardrail evaluation.** Every prediction is checked against the hard bounds (T_chip ≤ 85°C, ΔP 60–240 kPa, flow 400–1600 L/min); violations make a candidate infeasible and block application.
6. **Persistence in D1.** Telemetry samples (bounded to the latest ~200 ticks), what-if runs with their candidates, control state, control actions, and model metric snapshots are all stored in a Cloudflare D1 (SQLite) database via Drizzle ORM.

## Tech stack

| Layer | Technology |
| --- | --- |
| Client framework | React 19 + Vite + TypeScript |
| Routing & data | TanStack Router; typed fetch API client with polling hooks |
| Styling | Tailwind CSS v4 with shadcn-style UI primitives |
| Charts | Custom SVG line charts |
| Icons | lucide-react |
| Server API | Cloudflare Worker (TypeScript) exposing \`/api/*\` JSON endpoints |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM |
| Simulation & surrogate | In-process TypeScript twin: seeded telemetry generator, physics-guided surrogate, grid-search optimizer |
| Deployment | Cloudflare Workers (static assets + Worker API) |

## Data model

| Table | Purpose | Key fields |
| --- | --- | --- |
| \`telemetry_samples\` | One row per simulated 10-minute tick | \`tick\`, \`payload\` (full telemetry JSON), \`pue\`, \`wue\`, \`created_at\` |
| \`whatif_runs\` | One row per what-if grid search | \`alpha\`, \`beta\`, \`base_setpoints\`, \`best_setpoints\`, \`best_cost\`, \`best_pue\`, \`best_wue\`, \`candidates_evaluated\`, \`feasible_count\`, \`status\` |
| \`whatif_candidates\` | Every evaluated permutation of a run | \`run_id\`, \`setpoints\`, \`pue\`, \`wue\`, \`cost\`, \`chip_temp_c\`, \`feasible\`, \`violations\` |
| \`control_actions\` | Audit log of control decisions | \`mode\`, \`kind\` (would_be / applied / fail_safe), \`setpoints\`, \`note\`, \`created_at\` |
| \`control_state\` | Singleton row for the control loop | \`mode\` (shadow / closed_loop), \`comms_ok\`, \`last_heartbeat\`, \`slew_limited\`, \`fail_safe_active\`, \`current_setpoints\` |
| \`model_metrics\` | Model quality snapshots | \`mae_mw\`, \`pue_coverage\`, \`kl_divergence\`, \`inference_latency_ms\`, \`created_at\` |

## API reference

All endpoints are served by the Cloudflare Worker under \`/api\`:

| Method & path | Description |
| --- | --- |
| \`GET /api/health\` | Liveness check. |
| \`GET /api/telemetry/current\` | Latest telemetry with surrogate prediction, setpoints, and guardrail status. |
| \`POST /api/telemetry/tick\` | Advances the simulation one 10-minute tick; persists the sample and returns data-quality flags. |
| \`GET /api/telemetry/history?limit=N\` | Up to 200 recent samples, oldest first. |
| \`POST /api/whatif\` | Runs the 1,560-permutation grid search for given α/β and scenario; persists run + candidates. |
| \`GET /api/whatif\` | Lists recent what-if runs; \`?id=N\` returns one run with its ranked candidates. |
| \`GET /api/control\` | Control state snapshot plus the 30 most recent actions; trips the watchdog if the heartbeat is stale. |
| \`POST /api/control/mode\` | Switches between shadow and closed_loop. |
| \`POST /api/control/apply\` | Applies setpoints with guardrail checks and slew-rate clamping; logged as applied or would-be depending on mode. |
| \`POST /api/control/heartbeat\` | Feeds the watchdog; clears the fail-safe when comms return. |
| \`GET /api/model/metrics\` | Model card, latest metric snapshot, and the 48-hour KL-divergence drift series. |
`;
