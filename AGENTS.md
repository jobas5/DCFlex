# AGENTS.md

Guidance for AI coding agents working in this repository.

DCFlex is a monitoring/optimization dashboard for liquid-cooled data centers: a physics-guided digital twin that balances thermal safety, PUE and WUE. All telemetry is **simulated** by a seeded, deterministic generator; there is no real hardware integration.

Deeper references (keep them in sync when behavior changes):
- [README.md](README.md): setup, usage, configuration, deploy
- [APPLICATION.md](APPLICATION.md): stack, parameters/constants, twin math, flows
- [API.md](API.md): every `/api/*` endpoint with request/response shapes

## Stack

- **Frontend:** React 19 SPA, Vite 8, TypeScript (strict), TanStack Router (code-based routes, not file-based), Tailwind CSS v4 with semantic color tokens (CSS variables in `src/styles.css`, dark + light themes), Geist/Geist Mono via Google Fonts, lucide-react icons, custom SVG charts (no chart library).
- **Backend:** one Cloudflare Worker (`worker/index.ts`) serving `/api/*`, plus a cron `scheduled()` handler running every minute.
- **Data:** Cloudflare D1 (SQLite) through Drizzle ORM. Binding `DB`, database `dc-cooling-db`.
- **Tooling:** npm (use `package-lock.json`, `npm ci` in CI), Node 24, Wrangler 4, `@cloudflare/vite-plugin` (runs the Worker and local D1 inside `vite dev`).

## Commands

```bash
npm install
npm run db:migrate:local     # apply migrations/ to local D1 (.wrangler/)
npm run db:seed:local        # seeds/local.sql (re-runnable)
npm run dev                  # frontend + Worker API + local D1
npm run typecheck            # tsc --noEmit: the main correctness gate
npm run check                # regression checks: twin invariants (scripts/twin.check.mjs) + alert logic
npm run build                # client + Worker into dist/
node worker/telegram.check.mjs   # assertion self-check for worker/alertLogic.ts
```

There is **no test framework or linter**. Before finishing a change, run `npm run typecheck` and `npm run build` (CI runs both). If you touch `worker/alertLogic.ts`, also run `node worker/telegram.check.mjs`. For runtime checks, `GET /api/_check` (authenticated) self-checks the transfer engine.

Do not run `db:migrate:remote`, `db:seed:remote`, `wrangler deploy`, or `wrangler secret put` unless explicitly asked; they hit production. Pushing to `main` triggers `.github/workflows/deploy.yml` (typecheck, build, remote D1 migrations, deploy).

## Layout

```
worker/
  index.ts          all /api/* routes (single handleApi function) + cron + advanceSimulation
  auth.ts           PBKDF2 verify, HMAC session token/cookie, in-memory login rate limit
  telegram.ts       alert evaluation + Telegram sender
  alertLogic.ts     pure edge-trigger state machine (covered by telegram.check.mjs)
src/
  main.tsx          router tree: every route must be added to rootRoute.addChildren([...])
  routes/           one file per screen; each exports a `xxxRoute = createRoute({ getParentRoute: () => rootRoute, ... })`
                    root.tsx is the app shell (sidebar, mobile bottom nav, providers)
  components/       ui.tsx (design-system primitives), LineChart (+ Sparkline), Topbar, Toast
  components/facility/  FacilityScene.tsx (three.js / react-three-fiber, lazy-loaded) + layout.ts (3D positions)
  lib/api.ts        the only typed fetch client for /api/* (response interfaces live here)
  lib/auth.tsx      AuthProvider/useAuth; lib/simContext.tsx polls /api/telemetry/current every 5s while signed in
  lib/theme.tsx     dark/light ThemeProvider (localStorage `dcflex:theme`; index.html applies it before paint)
  lib/nav.ts        NAV_GROUPS / NAV_ITEMS shared by sidebar, mobile bar and breadcrumb
  lib/time.ts       sim-tick to wall-clock (10-min ticks from 2026-05-17 UTC, shown in WIB); also parses D1's zone-less UTC timestamps
  lib/tokens.ts     chart/severity colors as `var(--…)` strings so SVG follows the theme
  lib/twin/         pure TS digital twin, shared by browser and Worker
  db/schema.ts      Drizzle schema; db/client.ts getDb(env) + the Env interface (CloudflareDatabaseEnv)
migrations/         D1 SQL migrations (append-only) + meta/_journal.json
seeds/local.sql     demo data (INSERT OR IGNORE / upserts)
```

## Architecture notes

- **The twin is shared code.** `src/lib/twin/*` is imported by the Worker (cron, what-if, transfers, forecasts) *and* the browser (live previews on Optimization/Transfer). Keep it pure: no DOM, no Worker/Node APIs, no I/O, no new runtime deps. A change here changes both server results and UI previews.
- **Determinism matters.** The simulator uses mulberry32 seeded by tick. Don't introduce `Math.random()` or `Date.now()` into twin math.
- **3D view:** `/facility` lazy-loads `FacilityScene` so three.js (~250 KB gz) never enters the main bundle; keep it that way (no static imports of `three` outside `components/facility/`). The scene reads theme colors from the CSS variables at runtime (`readPalette`), renders on demand under reduced motion, and the page falls back to the sensor list without WebGL. Sensor kinds, fields, limits and health rules live in `src/lib/twin/sensors.ts`; 3D positions in `components/facility/layout.ts`.
- **Single source for constants.** Guardrails (`GUARDRAILS`), slew limits (`SLEW_LIMITS`), margin tiers (`MARGIN_TIERS`), `FACTORY_SETPOINTS` and the domain types live in `src/lib/twin/types.ts`; physics/guardrail/slew functions live in `surrogate.ts`. Reuse them rather than hardcoding numbers. Hard guardrails: T_chip ≤ 85 °C, ΔP 60–240 kPa, flow 400–1600 L/min.
- **Safety invariants on every write path:** setpoint writes must go through `evaluateGuardrails` (422 with `{ error, violations }` on failure) and every real write through `applySlewLimits` (manual closed-loop writes, steering, enabling closed-loop, transfer apply). Shadow mode never writes `currentSetpoints`; it only logs `would_be`. Budget checks (zone ≤ zone budget, Σ zones ≤ facility) apply to shadow configs, transfers and Master Data (enforced server-side).
- **Optimizer reserve:** `runWhatIf` treats candidates with thermal margin < `MARGIN_TIERS.green` (5 °C) as infeasible (`THERMAL_MARGIN`), so recommendations never land a zone in the warning/critical band.
- **Validation gate:** `validationStats` in `worker/index.ts` is the single source for `ready` (≥ 6 samples, ≥ 95 % feasible, ≥ 90 % on target, one-sided ±0.02). `POST /api/control/mode` refuses `closed_loop` (422) until it passes. Transfers are terminal once `apply`/`reject` (409).
- **Watchdog:** every tick refreshes the heartbeat. After 90 s without one, `detectFailSafe` reverts the zone to factory setpoints and drops it to shadow. Local dev has no cron, so idle dev sessions fail-safe; press Run in the top bar (or `POST /api/telemetry/tick`) to keep the sim alive.
- **Worker routing** is a hand-written `if (path === ... && method === ...)` chain plus regex matches in `handleApi`. Use the local helpers (`json`, `readBody`, `parseSetpoints`, `listZones`, `getFacility`, `clamp`, `round`). Setpoints are stored as JSON text columns. `listZones`/`getFacility` lazily insert defaults if rows are missing.
- **Auth:** everything under `/api/*` needs a session except `GET /api/health`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`. If you add a public route, update the `isPublic` check in the default export and both docs. Non-`/api` paths are served by Cloudflare Assets with SPA fallback (`wrangler.jsonc`).
- **Frontend data flow:** call the backend only through `api` in `src/lib/api.ts`; it dispatches `dcflex:unauthorized` on 401, which flips `AuthProvider` to the login screen. Provider nesting is in `src/routes/root.tsx` (Toast → Auth → Sim). Navigation items live in the `NAV` array there.
- **Alerts** are edge-triggered and deduplicated via the `alert_events` table; they are sent only when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set.

## Database and migrations

- Schema changes: edit `src/db/schema.ts`, then add a **new** migration in `migrations/` and a matching entry in `migrations/meta/_journal.json`. Never edit or renumber existing migrations.
- **Gotcha:** `migrations/meta/` only has snapshots for 0000 and 0001; migrations 0002–0005 were written by hand. `npm run db:generate` will therefore diff against a stale snapshot and emit a migration that re-creates existing tables. Review its output carefully, or write the SQL by hand (follow the style of `0005_alerts.sql`).
- Keep `seeds/local.sql` re-runnable and update it if new tables or non-null columns need demo data.
- Telemetry and shadow samples older than 1008 ticks are pruned each tick.

## Secrets and local dev

- Secrets come from `.dev.vars` locally (gitignored) and `wrangler secret put` in production: `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` (`pbkdf2:100000:<saltHex>:<hashHex>`), `AUTH_SECRET`, plus optional `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DASHBOARD_URL`. README has the generation one-liners.
- Login **fails closed** when any auth secret is missing; there is no hardcoded fallback in code. The documented dev login (`admin` / `dcflex12`) only works if `.dev.vars` holds the matching hash. Never commit `.dev.vars` or real secrets. Only failed logins count toward the 10/min rate limit.
- New env vars must be added to `CloudflareDatabaseEnv` in `src/db/client.ts`, to the `secrets:` list in `deploy.yml` if they are secrets, and to README/APPLICATION docs.

## Code style

- TypeScript strict with `noUnusedLocals`/`noUnusedParameters` and `verbatimModuleSyntax`: use `import type` / inline `type` for type-only imports.
- Relative imports are the norm (the `#/*` alias exists but is unused). Double quotes, semicolons, trailing commas, 2-space indent.
- Functional React components with hooks; pages manage their own loading/error state with `ErrorState`/`Skeleton`/`EmptyState` from `components/ui.tsx`.
- **Design system:** use only the semantic color utilities (`bg-canvas`, `bg-surface`, `bg-surface-2/3`, `border-line`, `ring-line-strong`, `text-fg`, `text-fg-muted/subtle/faint`, `accent`, `ok`, `warn`, `crit`, `info`, `violet`), never raw palette classes like `slate-800` or `cyan-400`; both themes come from the CSS variables in `styles.css`. In SVG use `CHART`/`SEVERITY` from `tokens.ts` or `var(--…)`.
- Build screens from `ui.tsx` primitives: `PageHeader`, `Card`, `KpiTile`, `Stat`, `Badge`, `Button`/`buttonStyles`, `Segmented`, `Slider`, `Select`, `NumberField`, `Meter`, `Table`/`Th`/`Td`, `ConfirmDialog`, `Stepper`, `EmptyState`/`ErrorState`/`Skeleton`. Map zone status with `STATUS_TONE`/`STATUS_LABEL`. Charts: `LineChart` (measures its width) and `Sparkline`.
- Keep layouts responsive (sidebar ≥ `md`, bottom nav below; no page-level horizontal scroll at 375 px — wide tables scroll inside `Table`) and keep visible focus styles (`focus-visible:outline-accent`). Numbers use `tabular-nums`; reserve `font-mono` for setpoints and tabular readouts.
- Comments are sparse and explain *why*. Match that density.

## When you change behavior

- New/changed endpoint: update `worker/index.ts`, the types and method in `src/lib/api.ts`, and `API.md`.
- New/changed parameter, constant, flow or table: update `APPLICATION.md` (and README's feature/structure sections if user-visible).
- New screen: route file in `src/routes/`, register it in `src/main.tsx`, add it to `NAV_GROUPS` in `src/lib/nav.ts` (label + short mobile label + icon), and add it to README's Usage table.
