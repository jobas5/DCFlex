# DCFlex

A monitoring and optimization dashboard — a physics-guided digital twin — for high-density liquid-cooled data centers, balancing thermal safety, PUE (energy efficiency), and WUE (water efficiency). All telemetry is simulated by a seeded, deterministic generator, so no physical BMS/CDU hardware is required.

## Project overview

The app is a single-page dashboard with five screens:

| Screen | Route | What it does |
| --- | --- | --- |
| **Overview** | `/` | Live KPIs (PUE, WUE, IT load, accessory power, thermal margin), trend charts, CDU/FWS loop panels, data-quality pipeline counters, and a pause/resume control for the telemetry stream. |
| **What-If Engine** | `/whatif` | Counterfactual analysis: set α/β objective weights and a scenario (IT load, ambient preset), then grid-search **1,560 setpoint permutations** under hard guardrails and rank results by J = α·PUE + β·WUE. Best setpoints can be applied to the control loop; runs are persisted and shareable at `/whatif/<runId>`. |
| **Control Loop** | `/control` | Phased rollout control: Phase A shadow mode vs Phase B closed-loop, slew-rate-limited setpoint changes, a 30-second heartbeat watchdog with fail-safe to factory setpoints, and an action audit log. |
| **Surrogate Model** | `/model` | Model card for the monotonicity-constrained surrogate (LightGBM-style, ONNX export), metric gauges vs accuracy targets, KL-divergence drift chart, and a monotonicity proof curve. |
| **Docs** | `/docs` | In-app system documentation with a downloadable Markdown export. |

Hard guardrails enforced everywhere: T_chip ≤ 85°C, ΔP 60–240 kPa, flow 400–1600 L/min.

## Tech stack

- **Frontend:** React 19 + Vite + TypeScript, TanStack Router, Tailwind CSS v4, lucide-react icons, custom SVG charts
- **Backend:** Cloudflare Worker (TypeScript) serving JSON under `/api/*`
- **Database:** Cloudflare D1 (SQLite) via Drizzle ORM
- **Simulation:** in-process TypeScript digital twin (seeded telemetry generator, physics-guided surrogate, grid-search optimizer) shared between client and Worker

## Prerequisites

- **Node.js 18+** and npm (pnpm or bun also work)
- A **Cloudflare account** — only needed for deployment and remote D1, not for local development

## Getting started

```bash
# Clone the repository, then from the project root:
npm install
npm run dev
```

This starts the Vite dev server with the Cloudflare plugin, so the Worker API (`/api/*`) and the local D1 database work the same way they do in production. Complete the database setup below before first use so the app has data to serve.

## Database setup

The D1 database binding is named `DB`. Wrangler keeps a local SQLite-backed copy under `.wrangler/` when you use `--local` commands.

```bash
# Apply migrations to the local D1 database
npm run db:migrate:local

# Populate demo data (telemetry history, what-if runs, control state, model metrics)
npm run db:seed:local
```

For the remote (deployed) database:

```bash
npm run db:migrate:remote
npm run db:seed:remote
```

`seeds/local.sql` is safe to re-run — it uses `INSERT OR IGNORE` / upserts throughout. After changing `src/db/schema.ts`, regenerate migrations with `npm run db:generate` and then apply them. Migrations in `migrations/` are append-only: never edit existing files.

## Available scripts

All scripts are defined in `package.json`:

| Script | Command | Description |
| --- | --- | --- |
| `dev` | `vite dev` | Start the local dev server (frontend + Worker API + local D1). |
| `build` | `vite build` | Production build of client assets and the Worker into `dist/`. |
| `typecheck` | `tsc -p tsconfig.json --noEmit` | Type-check the whole project without emitting files. |
| `preview` | `vite preview` | Preview the production build locally. |
| `db:generate` | `drizzle-kit generate` | Generate a new SQL migration from changes in `src/db/schema.ts`. |
| `db:migrate:local` | `wrangler d1 migrations apply DB --local` | Apply migrations to the local D1 database. |
| `db:migrate:remote` | `wrangler d1 migrations apply DB --remote` | Apply migrations to the remote D1 database. |
| `db:seed:local` | `wrangler d1 execute DB --local --file=./seeds/local.sql` | Seed the local D1 database with demo data. |
| `db:seed:remote` | `wrangler d1 execute DB --remote --file=./seeds/local.sql` | Seed the remote D1 database with demo data. |

## Environment & configuration

Worker configuration lives in **`wrangler.jsonc`** (not `wrangler.toml`):

- `main`: `./worker/index.ts` — the Worker entry point serving `/api/*`
- `assets`: static frontend from `dist/client`, with single-page-application fallback (`not_found_handling`) and `run_worker_first` for `/api/*`
- `d1_databases`: the `DB` binding → D1 database `dc-cooling-db`

No environment variables or secrets are required by default; the only runtime binding is the `DB` D1 database, accessed through `getDb(env)` in `src/db/client.ts`. Drizzle Kit reads `drizzle.config.ts` for migration generation.

Optional Telegram alerts (guardrail violations, watchdog fail-safe, thermal-margin transitions, heat-forecast warnings) are sent from the cron tick when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set (locally in `.dev.vars`, in production via `wrangler secret put`). `DASHBOARD_URL` adds a link to each message. Alerts are edge-triggered and deduplicated via the `alert_events` table, so a sustained condition notifies once.

## Authentication

Single-account login (username + password) gates the whole app. Set three secrets (`.dev.vars` locally, `wrangler secret put` in production):

- `AUTH_USERNAME` — the operator username (dev default: `admin`).
- `AUTH_PASSWORD_HASH` — a PBKDF2-SHA256 hash in the form `pbkdf2:iterations:saltHex:hashHex`. Generate with (Web Crypto, same path the worker verifies with):
  ```bash
  node -e "const e=new TextEncoder();const H=x=>[...new Uint8Array(x)].map(b=>b.toString(16).padStart(2,'0')).join('');const F=h=>{const b=new Uint8Array(h.length/2);for(let i=0;i<b.length;i++)b[i]=parseInt(h.slice(i*2,i*2+2),16);return b};(async()=>{const s=crypto.getRandomValues(new Uint8Array(16));const k=await crypto.subtle.importKey('raw',e.encode('YOUR_PASSWORD'),'PBKDF2',false,['deriveBits']);const d=await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:100000,hash:'SHA-256'},k,256);console.log('pbkdf2:100000:'+H(s.buffer)+':'+H(d))})()"
  ```
- `AUTH_SECRET` — random 32-byte hex used to sign the session cookie:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

On login the worker sets an `HttpOnly` session cookie (`SameSite=Lax`, `Secure` in production) valid for 12 hours. All `/api/*` routes except `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, and `/api/health` require a valid session. If any of the three secrets is missing, login fails closed (no access).

## Build & deploy

```bash
# Type-check and build production assets + Worker
npm run typecheck
npm run build

# Deploy to Cloudflare Workers
npx wrangler deploy
```

Before deploying, make sure the remote database is migrated and seeded (`npm run db:migrate:remote` and `npm run db:seed:remote`).

## Project structure

```
.
├── index.html                # Vite entry HTML
├── vite.config.ts            # Vite + React + Tailwind + Cloudflare plugin
├── wrangler.jsonc            # Worker config: assets, SPA fallback, D1 binding
├── drizzle.config.ts         # Drizzle Kit config for migration generation
├── worker/
│   └── index.ts              # Cloudflare Worker: all /api/* endpoints
│                             #   (telemetry, what-if, control, model metrics)
├── src/
│   ├── main.tsx              # Router setup and app bootstrap
│   ├── styles.css            # Tailwind v4 entry
│   ├── routes/               # Screens: root layout, overview, whatif,
│   │                         #   whatifDetail, control, model, docs, notFound
│   ├── components/           # UI primitives (Panel, KpiCard, StatusBadge…),
│   │                         #   LineChart, SetpointSliders, Toast
│   ├── lib/
│   │   ├── api.ts            # Typed fetch client for /api/*
│   │   ├── twin/             # Digital twin: simulator, surrogate model,
│   │   │                     #   optimizer (grid search), model card, types
│   │   └── docs/             # Canonical Markdown source for the Docs page export
│   └── db/
│       ├── schema.ts         # Drizzle schema: telemetry_samples, whatif_runs,
│       │                     #   whatif_candidates, control_state,
│       │                     #   control_actions, model_metrics
│       └── client.ts         # getDb(env) — Drizzle over the D1 binding
├── migrations/               # Append-only generated SQL migrations (+ meta/)
└── seeds/
    └── local.sql             # Re-runnable demo seed data
```
