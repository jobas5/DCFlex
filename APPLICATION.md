# DCFlex — Application Reference

A complete technical reference for the DCFlex application: technology stack, tunable parameters, data/control flows, and integrations. Companion to [`README.md`](README.md) (setup/usage) and [`API.md`](API.md) (endpoint reference).

---

## 1. Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, TypeScript |
| Routing | TanStack Router |
| Styling | Tailwind CSS v4 (custom `@theme` tokens) |
| Icons | lucide-react |
| Charts | Custom SVG (`LineChart`, compact sparkline mode) |
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

### 3.3 Slew-rate limits (`SLEW_LIMITS`)

Applied to any setpoint change (manual or automated).

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
- **Chiller power**: `itLoad · 0.115 · (1 − 0.72·freeCoolingShare) · wetBulbPenalty · (1 + liftC·0.01)`, where `freeCoolingShare = clamp((supply−16)/18, 0, 1)`, `wetBulbPenalty = 1 + max(0, wetBulb−14)·0.022`, `liftC = max(0, supply − wetBulb − 2)`.
- **Accessory power** = pump + chiller.
- **PUE** = (IT + accessory) / IT.
- **WUE**: `evapBase · (1 − liquidShare·0.78) · (chiller/accessory + 0.35)`, where `evapBase = 0.2 + max(0, wetBulb−10)·0.045`, `liquidShare = clamp(0.45 + (supply−16)·0.035 + (pump−60)·0.001, 0.3, 0.95)`.

### Telemetry generator (`simulator.ts`)

Deterministic (mulberry32 seeded by tick). 10-minute ticks (`TICK_MS = 600000`).

- **IT load**: diurnal sine cycle by `loadPhaseH` + EMA smoothing (0.75 prev) + noise.
- **Wet-bulb**: base 16 °C + per-zone offset + diurnal wave + noise; dry-bulb = wet + 4 + rand·5.
- **Flow / ΔP / chip** from setpoints via the surrogate; CPU die ≈ GPU − 2.5 − rand·2.
- **Data-quality anomalies** (probabilistic): ~4% outlier (removed + imputed), ~4% wet-bulb drift flag, ~3% imputed gap.

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

---

## 5. Flows

### 5.1 Simulation tick (`advanceSimulation`)

Triggered by cron every minute (and `POST /api/telemetry/tick`).

```
for each zone:
  1. detectFailSafe(zone)          # heartbeat age > 90s → revert to factory, log fail_safe
  2. steerZone(zone, prev)         # closed-loop only: target-gap → what-if → slew-limit → write
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
write currentSetpoints + control action "applied"
```

### 5.3 What-If run (user-initiated)

```
POST /api/whatif  (α, β, zoneId?, itLoadMw?, wetBulbC?)
  → runWhatIf: 1,560 grid → evaluateGuardrails → normalize → rank by J
  → persist whatif_runs + top-25 whatif_candidates
  → return best + candidates
```

### 5.4 Shadow validation

```
POST /api/control/applyShadow  → guardrail + budget check → write shadowSetpoints
cron tick writes shadow_samples (predicted vs actual PUE/WUE, chip, feasible)
GET /api/zones/{id}/validation  → feasibleRate, meetsRate, ready
ready = feasibleRate ≥ 0.95 && meetsRate ≥ 0.90
POST /api/control/mode "closed_loop"  → promote validated shadow config
```

### 5.5 Cooling transfer

```
POST /api/transfers (sourceId, targetId, waterDelta, powerDelta)
  → proposeTransfer → facility budget check → persist status "shadow"
POST /api/transfers/{id}/apply
  → write both zones' setpoints AND reallocate budgets (source −, target +)
```

### 5.6 Authentication

```
POST /api/auth/login → PBKDF2 verify → HMAC token → Set-Cookie (HttpOnly, 12h)
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
- `SimProvider` — polls `/api/telemetry/current` every 5s; optional `/api/telemetry/tick` when "running".
- `ToastProvider` — transient notifications.

### 6.2 Shared twin

`src/lib/twin/*` is imported by both the Worker (cron, `runWhatIf`, `proposeTransfer`, `predict`, `forecastZone`) and the browser (live impact previews on the Optimization and Transfer pages). This guarantees the UI preview matches the server result exactly.

### 6.3 Database schema

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
| `src/lib/api.ts` | Typed API client |
| `src/lib/auth.tsx` | Auth context |
| `src/lib/simContext.tsx` | Live telemetry polling |
