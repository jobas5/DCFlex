# DCFlex — Application Reference

A complete technical reference for the DCFlex application: technology stack, tunable parameters, data/control flows, and integrations. Companion to [`README.md`](README.md) (setup/usage) and [`API.md`](API.md) (endpoint reference).

---

## 1. Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, TypeScript |
| Routing | TanStack Router |
| Styling | Tailwind CSS v4 — semantic color tokens (`@theme inline` over CSS variables), dark + light themes |
| Typography | Geist / Geist Mono (Google Fonts) |
| Icons | lucide-react |
| Charts | Custom SVG (`LineChart`, compact sparkline mode) |
| 3D | three.js + @react-three/fiber (lazy-loaded on `/facility` only) |
| Backend | Cloudflare Worker (TypeScript) |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM |
| Simulation | In-process TypeScript digital twin, shared client/worker |
| Auth | PBKDF2-SHA256 password hashing + HMAC-SHA256 session cookie |
| Alerts | Telegram Bot API (`sendMessage`) |
| Scheduler | Cloudflare cron trigger (`*/1 * * * *`) |
| Deploy | Wrangler (Workers + static assets + D1) |

The digital twin and its math (`src/lib/twin/*`) are **pure TypeScript** with no runtime deps, so the same code runs in the browser (for live previews) and in the Worker (for cron/simulation).

---

## 2. Architecture overview

```
Browser (React SPA)
   │  JSON over /api/*  (session cookie)
   ▼
Cloudflare Worker (worker/index.ts)
   │  Drizzle ORM
   ▼
D1 (SQLite) ── zones, facility_config, telemetry_samples, shadow_samples,
               whatif_runs, whatif_candidates, control_actions,
               power_transfers, alert_events, model_metrics
```

Two entry points in the Worker:

- **`fetch(request, env)`** — serves `/api/*`; all routes behind session auth (except 4 public). Non-`/api` paths return 404 (static assets are served by Cloudflare Assets with SPA fallback).
- **`scheduled()`** — runs `advanceSimulation` every minute (cron), independent of auth. This drives the telemetry stream, closed-loop steering, and Telegram alert evaluation.

---

## 3. Parameters

### 3.1 Setpoints (the control levers)

Per zone, stored as JSON in `zones.current_setpoints` / `zones.shadow_setpoints`.

| Field | Meaning | Range (clamped) | Factory default |
| --- | --- | --- | --- |
| `coolantSupplyC` | Coolant supply temperature | 16 – 34 °C | 22 |
| `pumpSpeedPct` | Pump speed | 40 – 100 % | 70 |
| `valvePosPct` | Bypass valve position | 30 – 100 % | 80 |
| `cduSetpointC` | CDU supply setpoint | 16 – 34 °C | 24 |

### 3.2 Hard guardrails (`GUARDRAILS`)

Safety envelope enforced on every write path and every what-if candidate.

| Constraint | Value |
| --- | --- |
| `chipTempMaxC` | T_chip ≤ 85 °C |
| `deltaPMinKpa` / `deltaPMaxKpa` | 60 ≤ ΔP ≤ 240 kPa |
| `flowMinLpm` / `flowMaxLpm` | 400 ≤ flow ≤ 1600 L/min |

Violation codes: `CHIP_TEMP`, `DELTA_P_LOW`, `DELTA_P_HIGH`, `FLOW_LOW`, `FLOW_HIGH`.

The what-if optimizer additionally requires an **operating reserve**: candidates must keep thermal margin ≥ `MARGIN_TIERS.green` (5 °C), reported as `THERMAL_MARGIN`. Passing the 85 °C guardrail by a hair would otherwise put the zone straight into the warning/critical band (and trip alerts).

### 3.3 Slew-rate limits (`SLEW_LIMITS`)

Applied to every real setpoint write: manual closed-loop writes, closed-loop steering, the first step when closed-loop is enabled, and transfer apply.

| Field | Limit (per action) |
| --- | --- |
| `maxTempStepC` | 3 °C |
| `maxPumpStepPct` | 10 % |
| `maxValveStepPct` | 15 % |

### 3.4 Thermal margin tiers (`MARGIN_TIERS`)

Used to map thermal margin → zone status.

| Status | Margin |
| --- | --- |
| `green` (Normal) | margin ≥ 5 °C |
| `yellow` (Warning) | 3 ≤ margin < 5 °C |
| `red` (Critical) | margin < 3 °C |

`thermalMarginC = chipTempMaxC − chipTempC = 85 − chip`.

### 3.5 Zone configuration (Master Data)

Stored per zone in `zones`.

| Field | Meaning | Defaults (seed) |
| --- | --- | --- |
| `targetPue` | PUE target for the zone | 1.11–1.135 |
| `targetWue` | WUE target (L/kWh) | 0.115–0.13 |
| `waterBudgetLpm` | Water budget (L/min) | 750–1400 |
| `powerBudgetMw` | Power budget (MW) | 0.6–1.2 |
| `baseLoadMw` / `loadAmpMw` / `loadPhaseH` / `wetBulbOffsetC` | Load & weather simulation profile | see `DEFAULT_ZONES` |

### 3.6 Facility configuration

Stored in `facility_config` (id 1).

| Field | Default |
| --- | --- |
| `totalWaterBudgetLpm` | 4400 L/min |
| `totalPowerBudgetMw` | 3.6 MW |

Constraint: Σ zone budgets ≤ facility budget (enforced in Master Data).

### 3.7 What-If objective

Minimize **J = α·PUE + β·WUE**, each term min-max normalized across the feasible envelope.

| Parameter | Meaning | Range |
| --- | --- | --- |
| `alpha` | Grid carbon / PUE priority weight | 0 – 1 (UI keeps α + β = 1) |
| `beta` | Water scarcity / WUE priority weight | 0 – 1 |
| `itLoadMw` | Scenario IT load | 2 – 12 MW (slider) |
| `wetBulbC` | Ambient wet-bulb | presets 10 / 18 / 26 °C |

Feasible = inside every hard guardrail **and** the 5 °C operating reserve.

Grid search ranges (1,560 permutations = 15 × 13 × 8):

| Axis | Range | Step |
| --- | --- | --- |
| coolant supply | 18 – 32 °C | 1 °C |
| pump speed | 40 – 100 % | 5 % |
| valve position | 30 – 100 % | 10 % |

### 3.8 Control-loop constants

| Constant | Value |
| --- | --- |
| `WATCHDOG_TIMEOUT_SEC` | 90 s (heartbeat fail-safe) |
| `SESSION_TTL_SEC` | 12 h (auth session) |
| Telemetry retention | last 1008 ticks deleted |
| Control action log | 50 most recent returned |

### 3.9 Surrogate model card (`MODEL_CARD`)

| Field | Value |
| --- | --- |
| Name / version | `dcflex-surrogate` v1.4.2 |
| Algorithm | LightGBM (monotonicity-constrained gradient boosting) |
| Export | ONNX 1.17 (opset 18), onnxruntime-web inference |
| Train/val/test split | 70 / 15 / 15, chronological, no shuffle, 14-day embargo |
| MAE target | ≤ 0.026 MW (current 0.024) |
| PUE ±0.01 coverage target | ≥ 98.7 % (current 99.1 %) |
| Inference latency | ~3.8 ms (p50 < 10 ms target) |
| Drift warn / critical | KL ≥ 0.08 / 0.15 |

Monotonic constraints (enforced structurally):

1. IT load ↑ → accessory cooling power non-decreasing.
2. Coolant supply temp ↑ → chiller demand non-increasing (within safe bounds).
3. Ambient wet-bulb ↑ → chiller/facility power non-decreasing.

---

## 4. Digital twin math (`src/lib/twin/surrogate.ts`)

All predictions derive from setpoints + telemetry.

- **Flow** (`flowFromSetpoints`): `1900 · pump^1.6 · (0.35 + 0.65·valve)`, clamped 280–1750 L/min.
- **ΔP** (`deltaPFromFlow`): `48 + 150 · (flow/1600)² · restriction`, where `restriction = 0.55 + 0.85·(1−valve)²`.
- **Chip temp** (`chipTempC`): `supply + 6.5 + 44 · (itLoad/9) · (900/flow)^0.8`.
- **Pump power**: `0.02 + 0.5 · (pump/100)³ · (0.6 + 0.4·itLoad/10)`.
- **Chiller power**: `itLoad · 0.115 · (1 − 0.72·freeCoolingShare) · wetBulbPenalty · (1 + liftC·0.01)`, where `freeCoolingShare = clamp((supply−16)/18, 0, 1)`, `wetBulbPenalty = 1 + max(0, wetBulb−14)·0.022`, `liftC = max(0, wetBulb + 10 − supply)` (chiller lift: condenser ≈ wet-bulb + approach, minus supply). Lift grows with wet-bulb and shrinks with supply, so both monotonic constraints hold everywhere; the factory point (wet-bulb 16 °C, supply 22 °C) keeps lift 4.
- **Accessory power** = pump + chiller.
- **PUE** = (IT + accessory) / IT.
- **WUE**: `evapBase · (1 − liquidShare·0.78) · (chiller/accessory + 0.35)`, where `evapBase = 0.2 + max(0, wetBulb−10)·0.045`, `liquidShare = clamp(0.45 + (supply−16)·0.035 + (pump−60)·0.001, 0.3, 0.95)`.

### Telemetry generator (`simulator.ts`)

Deterministic (mulberry32 seeded by tick). 10-minute ticks (`TICK_MS = 600000`).

- **IT load**: diurnal sine cycle by `loadPhaseH` + EMA smoothing (0.75 prev) + noise.
- **Wet-bulb**: base 16 °C + per-zone offset + diurnal wave + noise; dry-bulb = wet + 4 + rand·5.
- **Flow / ΔP / chip** from setpoints via the surrogate; CPU die ≈ GPU − 2.5 − rand·2.
- **Data-quality anomalies** (probabilistic): ~4% CDU-supply outlier (removed + replaced by the model estimate), ~4% wet-bulb drift (recalibrated), ~3% imputed gap on one of flow / ΔP / CDU return / facility-water flow / dry-bulb (picked by tick). Each tick's report lists the affected sensor in `quality.events` and is stored with the sample.
- The PRNG seed is salted by the zone profile, so zones don't share identical noise or sensor faults.

### Sensors (`sensors.ts`)

Every zone carries the same 10 sensors, each mapped to a telemetry field: GPU/CPU die (rack cold plate), CDU supply/return temperature, secondary-loop flow, ΔP (CDU), facility-water supply temperature and flow (primary loop), wet-bulb/dry-bulb (cooling-tower weather mast). `GET /api/sensors` derives each sensor's status from its latest reading and the data-quality events in the window:

| Status | Rule |
| --- | --- |
| `crit` | Reading outside its hard guardrail (die > 85 °C, flow outside 400–1600 L/min, ΔP outside 60–240 kPa) |
| `warn` | Die temperature within 5 °C of the limit, a data-quality action in the last 3 ticks, or ≥ 3 actions in the window |
| `ok` | Otherwise |

The 3D layout (`src/components/facility/layout.ts`) is representative, not a surveyed floor plan.

### Forecast (`forecast.ts`)

Forward-simulates the twin holding setpoints constant, then summarizes per horizon.

| Horizon | Ticks |
| --- | --- |
| 15m | 2 |
| 1h | 6 |
| 4h | 24 |
| 24h | 144 |

Each horizon returns `peakChipTempC`, `peakAtTicks`, `worstMargin`, `rising`.

### Transfer solver (`transfer.ts`)

`proposeTransfer(target, source, waterDeltaLpm, powerDeltaMw)` reallocates cooling effort by setpoint inversion (bisection on pump speed for flow, on supply temp for chiller power), clamped so the source never drops below guardrail floors or its own budget. Returns per-zone proposals + actual deltas.

The bisected pump speed is rounded to a whole percent, and rounded up instead when plain rounding would dip the flow below the 400 L/min floor.

---

## 5. Flows

### 5.1 Simulation tick (`advanceSimulation`)

Triggered by cron every minute (and `POST /api/telemetry/tick`).

```
for each zone:
  1. detectFailSafe(zone)          # heartbeat age > 90s → factory setpoints become real,
                                   #   closed-loop disengages to shadow, log fail_safe
  2. steerZone(zone, prev)         # closed-loop only (skipped on fail-safe): target-gap →
                                   #   what-if → slew-limit → write + log only if changed
  3. tickTelemetry(prev, tick, steered)
  4. insert telemetry_samples
  5. if shadow config: insert shadow_samples
evaluateAlerts(views)              # Telegram: guardrails / fail-safe / margin / forecast
heartbeat refresh (commsOk=1, failSafeActive=0)
delete telemetry/shadow older than 1008 ticks
return { aggregate, zones }
```

### 5.2 Closed-loop steering (`steerZone`)

Only when `mode === "closed_loop"`:

```
α = clamp(0.15 + (PUE − targetPue)·8, 0, 1)
β = clamp(0.15 + (WUE − targetWue)·8, 0, 1)
runWhatIf(α, β, live itLoad, live wetBulb)
best = first feasible candidate within water & power budgets
applySlewLimits(current, best.setpoints)
if unchanged: no write, no log entry
else write currentSetpoints + control action "applied"
```

> The heartbeat is refreshed by every simulation tick. Production ticks once a minute via cron; **local dev has no cron**, so press *Run* in the top bar (or `POST /api/telemetry/tick`) — otherwise the 90 s watchdog fail-safes every zone back to factory setpoints.

### 5.3 What-If run (user-initiated)

```
POST /api/whatif  (α, β, zoneId?, itLoadMw?, wetBulbC?)
  → runWhatIf: 1,560 grid → evaluateGuardrails → normalize → rank by J
  → persist whatif_runs + top-25 whatif_candidates
  → return best + candidates
```

### 5.4 Shadow validation

```
POST /api/control/applyShadow  → guardrail + budget check → write shadowSetpoints, reset samples
cron tick writes shadow_samples (shadow-predicted vs live-config PUE/WUE, chip, feasible)
  meetsTarget = PUE ≤ target + 0.02 && WUE ≤ target + 0.02   (beating the target counts)
GET /api/zones/{id}/validation  → feasibleRate, meetsRate, ready, criteria
ready = samples ≥ 6 && feasibleRate ≥ 0.95 && meetsRate ≥ 0.90
POST /api/control/mode "closed_loop"  → 422 unless ready; then move toward the
                                         validated config through the slew limiter
```

Shadow mode never writes back: `POST /api/control/apply` on a shadow-mode zone only logs a `would_be` action.

### 5.5 Cooling transfer

```
POST /api/transfers (sourceId, targetId, waterDelta, powerDelta)
  → proposeTransfer → facility budget check → persist status "shadow"
POST /api/transfers/{id}/virtual → /verify     (status only; UI enforces this order)
POST /api/transfers/{id}/apply
  → 409 if already applied/rejected
  → re-check guardrails on live telemetry (422 on violation)
  → write both zones' setpoints through the slew limiter AND reallocate budgets
```

### 5.6 Authentication

```
POST /api/auth/login → PBKDF2 verify → HMAC token → Set-Cookie (HttpOnly, 12h)
                       (>10 failed attempts/min per IP → 429; success resets the counter)
every /api/* → readSession (HMAC verify + expiry) unless public
POST /api/auth/logout → clear cookie
```

### 5.7 Alerting (`worker/telegram.ts`)

Edge-triggered state machine (dedup via `alert_events` table): each monitored condition has a stable key + state; a message is sent only on a state change, cleared on recovery. Conditions: guardrail violations (CRITICAL), watchdog fail-safe (CRITICAL), heat-forecast red/amber (HIGH), thermal-margin transitions (HIGH). Sends only if `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are set; `DASHBOARD_URL` appends a link.

---

## 6. Integration

### 6.1 Frontend ↔ backend

`src/lib/api.ts` is the single typed client for `/api/*`. `request()` attaches JSON headers, dispatches `dcflex:unauthorized` on 401 (→ `AuthProvider` flips to login), and surfaces `{error}` / `{violations}` as thrown messages.

State providers (nest in `root.tsx`):

- `AuthProvider` — session status (`loading` / `authed` / `anonymous`).
- `ThemeProvider` — dark/light theme, persisted in `localStorage` (`dcflex:theme`) and applied before paint by `index.html`.
- `SimProvider` — polls `/api/telemetry/current` every 5s while signed in; `/api/telemetry/tick` every 3s when "running".
- `ToastProvider` — transient notifications.

### 6.2 Shared twin

`src/lib/twin/*` is imported by both the Worker (cron, `runWhatIf`, `proposeTransfer`, `predict`, `forecastZone`) and the browser (live impact previews on the Optimization and Transfer pages). This guarantees the UI preview matches the server result exactly.

### 6.3 Database schema

Master data writes are validated server-side: targets positive (PUE ≥ 1), water budget ≥ 400 L/min, and Σ zone budgets ≤ facility budget (`PATCH /api/zones/{id}` and `PATCH /api/facility` return 400/404/422).

`src/db/schema.ts` (Drizzle) — tables: `zones`, `facility_config`, `telemetry_samples`, `shadow_samples`, `whatif_runs`, `whatif_candidates`, `control_actions`, `power_transfers`, `alert_events`, `model_metrics`. Migrations are append-only in `migrations/`; demo data in `seeds/local.sql` (re-runnable `INSERT OR IGNORE`).

### 6.4 Secrets / environment

`.dev.vars` (local) / `wrangler secret put` (prod):

- `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `AUTH_SECRET` — required for login (fails closed if missing).
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DASHBOARD_URL` — optional alerts.
- `DB` — D1 binding (runtime binding, not a secret).

### 6.5 Scheduler

`wrangler.jsonc` declares `triggers.crons = ["*/1 * * * *"]`. The `scheduled()` handler calls `advanceSimulation`; it does not go through the HTTP auth gate.

---

## 7. Files of interest

| Path | Purpose |
| --- | --- |
| `worker/index.ts` | All `/api/*` routes + cron |
| `worker/auth.ts` | PBKDF2, session tokens, cookies, rate limit |
| `worker/telegram.ts` | Alert evaluation + Telegram sender |
| `worker/alertLogic.ts` | Edge-trigger alert state machine (pure) |
| `src/lib/twin/surrogate.ts` | Physics-guided prediction + guardrails + slew |
| `src/lib/twin/simulator.ts` | Seeded telemetry generator |
| `src/lib/twin/optimizer.ts` | What-if grid search |
| `src/lib/twin/forecast.ts` | Hold-setpoint forecast |
| `src/lib/twin/transfer.ts` | Cooling-transfer solver |
| `src/lib/twin/modelMeta.ts` | Model card + drift/curve data |
| `src/lib/twin/sensors.ts` | Sensor catalog + health rules |
| `src/components/facility/` | three.js scene (`FacilityScene.tsx`, lazy) and 3D layout (`layout.ts`) |
| `src/lib/api.ts` | Typed API client |
| `src/lib/auth.tsx` | Auth context |
| `src/lib/simContext.tsx` | Live telemetry polling |
| `src/lib/theme.tsx` | Theme provider (dark/light) |
| `src/lib/nav.ts` | Navigation groups shared by sidebar, mobile bar and top bar |
| `src/components/ui.tsx` | Design-system primitives (Card, KpiTile, Badge, Button, Segmented, Slider…) |
| `src/components/LineChart.tsx` | SVG line/area chart + `Sparkline` |
| `src/styles.css` | Theme tokens (CSS variables) + Tailwind `@theme` mapping |
