# DCFlex

> A monitoring and optimization dashboard — a physics-guided digital twin — for high-density liquid-cooled data centers, balancing thermal safety, PUE (energy efficiency), and WUE (water efficiency). All telemetry is simulated by a seeded, deterministic generator, so no physical BMS/CDU hardware is required.

![Version](https://img.shields.io/badge/version-1.4.2-22d3ee) ![Build](https://img.shields.io/badge/build-passing-34d399) ![Typecheck](https://img.shields.io/badge/typecheck-passing-34d399)

<!-- Screenshot: add a dashboard capture here -->

## Why?

Data-center operators must keep chips thermally safe while minimizing two competing costs: energy (PUE) and water (WUE). DCFlex models the facility as a digital twin and lets operators simulate, verify, and safely apply cooling decisions — instead of tuning physical CDU/BMS setpoints by hand. Everything runs against simulated telemetry, so the full workflow is exercisable without hardware.

## Features

- **Overview** — facility-level KPIs (PUE, WUE, IT load, accessory power, thermal margin), per-zone monitoring cards, and time-range trend charts.
- **What-If Engine** — grid-search **1,560 setpoint permutations** under hard guardrails, ranked by J = α·PUE + β·WUE; results persist and are shareable at `/optimize/<runId>`.
- **Shadow Validation** — validate a recommended scenario against live telemetry before enabling closed-loop control (Analyze → Shadow → Validate → Closed-loop).
- **Cooling Transfer** — reallocate water flow and chiller power from a safe zone to a hot zone, with live impact preview and budget reallocation on apply.
- **Surrogate Model** — an informational explainer of the monotonicity-constrained model behind DCFlex.
- **Master Data** — single source of truth for zone targets/budgets and facility budgets, with validation against guardrails and facility totals.
- **Authentication** — single-account username/password login (PBKDF2 + signed session cookie).
- **Telegram alerts** — optional edge-triggered notifications for guardrail violations, fail-safes, and thermal-forecast warnings.
- **Hard guardrails everywhere** — T_chip ≤ 85°C, ΔP 60–240 kPa, flow 400–1600 L/min.

## Quick start

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Then open the printed local URL. Default dev login: **`admin` / `dcflex12`** (override via auth secrets — see Configuration).

## Usage

| Screen | Route | What it does |
| --- | --- | --- |
| **Overview** | `/` | Facility KPIs, zone status cards, per-zone monitoring with trend charts and a time-range selector. |
| **Optimization** | `/optimize` | What-If Engine: set α/β weights + scenario, run the grid search, review summary/recommended action/zone performance, and start shadow validation. |
| **Shadow Validation** | `/shadow` | Validate a scenario against live telemetry; Auto follows the what-if recommendation, Manual lets you edit setpoints, then enable closed-loop. |
| **Cooling Transfer** | `/transfer` | Reallocate water/power between a source and target zone with live before→after impact. |
| **Surrogate Model** | `/model` | Informational explainer of the model's data pipeline, physics constraints, and performance. |
| **Master Data** | `/master` | Configure zone targets/budgets and facility budgets. |

Runs are persisted; view a specific run at `/optimize/<runId>`.

## How it works

1. **Seeded telemetry** — a deterministic generator simulates IT load, weather, flow, and die temperatures per zone (10-minute ticks).
2. **Surrogate model** — a physics-guided, monotonicity-constrained predictor (LightGBM-style, ONNX export) estimates PUE/WUE/chip temperature from setpoints.
3. **What-If engine** — a grid search over setpoint permutations minimizes **J = α·PUE + β·WUE** subject to hard guardrails.
4. **Control** — recommendations are validated in shadow mode before closed-loop writeback; slew-rate limits and a watchdog fail-safe protect the real engine.

## Configuration

Worker configuration lives in **`wrangler.jsonc`** (not `wrangler.toml`):

- `main`: `./worker/index.ts` — the Worker entry point serving `/api/*`
- `assets`: static frontend from `dist/client`, with single-page-application fallback and `run_worker_first` for `/api/*`
- `d1_databases`: the `DB` binding → D1 database `dc-cooling-db`

### Secrets (`.dev.vars` locally, `wrangler secret put` in production)

| Secret | Purpose |
| --- | --- |
| `DB` | D1 binding (runtime binding, not a secret) |
| `AUTH_USERNAME` | Operator username (dev default `admin`) |
| `AUTH_PASSWORD_HASH` | PBKDF2-SHA256 hash of the password |
| `AUTH_SECRET` | Random 32-byte hex used to sign the session cookie |
| `TELEGRAM_BOT_TOKEN` | (optional) Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | (optional) Telegram chat/channel id for alerts |
| `DASHBOARD_URL` | (optional) Base URL linked in alert messages |

Generate the password hash (Web Crypto, same path the worker verifies with):

```bash
node -e "const e=new TextEncoder();const H=x=>[...new Uint8Array(x)].map(b=>b.toString(16).padStart(2,'0')).join('');(async()=>{const s=crypto.getRandomValues(new Uint8Array(16));const k=await crypto.subtle.importKey('raw',e.encode('YOUR_PASSWORD'),'PBKDF2',false,['deriveBits']);const d=await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:100000,hash:'SHA-256'},k,256);console.log('pbkdf2:100000:'+H(s.buffer)+':'+H(d))})()"
```

Generate `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

On login the worker sets an `HttpOnly` session cookie (`SameSite=Lax`, `Secure` in production) valid for 12 hours. All `/api/*` routes except `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, and `/api/health` require a valid session. If any auth secret is missing, login fails closed (no access).

### Telegram alerts

Guardrail violations, watchdog fail-safes, thermal-margin transitions, and heat-forecast warnings are sent from the cron tick when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set. Alerts are edge-triggered and deduplicated via the `alert_events` table, so a sustained condition notifies once.

## API

Full endpoint reference: see **[API.md](API.md)**. For the complete technical reference (stack, parameters, flows, integrations), see **[APPLICATION.md](APPLICATION.md)**.

## Development

```bash
npm install
npm run dev            # frontend + Worker API + local D1
npm run typecheck      # tsc --noEmit
npm run build          # production client + Worker into dist/
npm run preview        # preview the production build

npm run db:generate    # regenerate SQL migrations from src/db/schema.ts
npm run db:migrate:local / :remote
npm run db:seed:local / :remote
```

`seeds/local.sql` is safe to re-run (`INSERT OR IGNORE` / upserts). Migrations in `migrations/` are append-only: never edit existing files.

### Deploy

```bash
npm run typecheck && npm run build
npx wrangler deploy
```

Migrate and seed the remote database first (`npm run db:migrate:remote` + `npm run db:seed:remote`), and set the auth secrets via `wrangler secret put`.

## Project structure

```
.
├── index.html                # Vite entry HTML
├── vite.config.ts            # Vite + React + Tailwind + Cloudflare plugin
├── wrangler.jsonc            # Worker config: assets, SPA fallback, D1 binding, cron
├── drizzle.config.ts         # Drizzle Kit config for migration generation
├── worker/
│   ├── index.ts              # Cloudflare Worker: all /api/* endpoints + cron
│   ├── auth.ts               # PBKDF2 password verify, HMAC session tokens, login rate limit
│   ├── telegram.ts           # Telegram alert evaluation + sender
│   ├── alertLogic.ts         # Edge-triggered alert state machine (pure)
│   └── telegram.check.mjs    # runnable self-check for alertLogic
├── src/
│   ├── main.tsx              # Router setup and app bootstrap
│   ├── styles.css            # Tailwind v4 entry + theme tokens + keyframes
│   ├── routes/               # root, overview, optimize, optimizeDetail, shadow,
│   │                         #   transfer, model, masterData, login, notFound
│   ├── components/           # LineChart, StatusBar, Toast, ui (Panel, KpiCard, badges…)
│   ├── lib/
│   │   ├── api.ts            # Typed fetch client for /api/*
│   │   ├── auth.tsx          # AuthProvider / useAuth
│   │   ├── simContext.tsx    # Live telemetry polling provider
│   │   ├── time.ts           # Sim-time formatting (WIB)
│   │   ├── tokens.ts         # Chart/severity color tokens
│   │   └── twin/             # simulator, surrogate, optimizer, forecast, transfer,
│   │                         #   modelMeta, modelInsights, types
│   └── db/
│       ├── schema.ts         # Drizzle schema (zones, facility_config, telemetry_samples,
│       │                     #   whatif_runs, whatif_candidates, control_actions,
│       │                     #   shadow_samples, power_transfers, alert_events, model_metrics)
│       └── client.ts         # getDb(env) — Drizzle over the D1 binding
├── migrations/               # Append-only generated SQL migrations (+ meta/)
└── seeds/
    └── local.sql             # Re-runnable demo seed data
```

## Roadmap

- **Multi-user auth** with roles (the HMAC session scheme is upgradeable without changing the cookie format).
- **Real BMS/CDU integration** — replace the seeded telemetry generator with live protocol adapters (BACnet, Modbus, MQTT).
- **Per-zone surrogate calibration** against real measurements.
- **Production hardening** — session invalidation, audit logging, stronger rate limiting.

## License

[MIT](LICENSE)
