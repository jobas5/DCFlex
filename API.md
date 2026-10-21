# DCFlex — API Documentation

REST API for the DCFlex digital-twin dashboard. All endpoints live under `/api/*` and are served by a single Cloudflare Worker (`worker/index.ts`), with data persisted in a D1 (SQLite) database.

## Base URL

| Environment | Base URL |
| --- | --- |
| Local dev | `http://localhost:5173` |
| Production | `https://<your-worker>.<account>.workers.dev` |

## Authentication

Single-account, session-cookie auth. Call `POST /api/auth/login` once to obtain an `HttpOnly` cookie (`dcflex_session`) valid for **12 hours**. Send the cookie on every subsequent request.

Every `/api/*` route **except** the following four requires a valid session and returns `401 Unauthorized` otherwise:

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

```bash
# Login and store the cookie jar
curl -c cookies.txt -X POST http://localhost:5173/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"dcflex12"}'

# Authenticated request
curl -b cookies.txt http://localhost:5173/api/telemetry/current
```

## Conventions

- **Content type**: `application/json` for requests and responses.
- **Errors**: `{ "error": string, "violations"?: [{ "code": string, "message": string }] }`.
- **Status codes**:

| Code | Meaning |
| --- | --- |
| `200` | Success |
| `400` | Missing/invalid request body or parameters |
| `401` | Unauthenticated (no/invalid session) or bad login |
| `404` | Resource (zone, run, transfer) not found |
| `409` | Transfer already in a terminal state (applied/rejected) |
| `422` | Guardrail, budget or validation-gate violation |
| `429` | Login rate-limited |
| `500` | Internal error |

- **Guardrails** enforced on write paths: `T_chip ≤ 85°C`, `60 ≤ ΔP ≤ 240 kPa`, `400 ≤ flow ≤ 1600 L/min`.

---

## Auth

### `POST /api/auth/login`

Verify credentials and set the session cookie. **Public.**

**Request body**

```json
{ "username": "admin", "password": "dcflex12" }
```

**Responses**

- `200` — `{ "ok": true }` (+ `Set-Cookie: dcflex_session=...` header)
- `400` — missing username/password
- `401` — invalid credentials
- `429` — too many failed attempts (>10 per minute per IP; a successful login resets the counter)
- `500` — auth secrets not configured

### `POST /api/auth/logout`

Clear the session cookie. **Public.**

**Responses**

- `200` — `{ "ok": true }` (+ `Set-Cookie` clears the cookie)

### `GET /api/auth/me`

Check whether the current session is valid. **Public** (returns `401` if no valid session).

**Responses**

- `200` — `{ "ok": true }`
- `401` — `{ "error": "Unauthorized." }`

---

## Health

### `GET /api/health`

Liveness check. **Public**, no auth.

**Responses**

- `200` — `{ "ok": true, "service": "dcflex" }`

---

## Telemetry

### `GET /api/telemetry/current`

Latest facility aggregate + per-zone views.

**Response** (`TelemetryCurrentResponse`)

```json
{
  "aggregate": { /* FacilityView */ },
  "zones": [ { /* ZoneView */ } ]
}
```

`aggregate` (FacilityView): `itLoadMw`, `accessoryPowerMw`, `pue`, `wue`, `status`, `margin`, `waterLpm`, `budgets { waterLpm, powerMw }`, `budgetUsage { waterPct, powerPct }`, `forecast`.

`ZoneView`: `id`, `name`, `status`, `mode`, `telemetry`, `prediction`, `guardrails`, `setpoints`, `targets { pue, wue }`, `budgets`, `budgetUsage`, `margin`, `forecast`.

### `POST /api/telemetry/tick`

Advance the simulation one tick. No body required.

**Response** — same shape as `/api/telemetry/current` (`{ aggregate, zones }`).

### `GET /api/telemetry/history`

Time-series history. Query params: `limit` (default `96`, max `200`), `clusterId` (optional; omit for facility aggregate).

**Response**

```json
{ "history": [ { "tick": 923, "timestamp": "...", "pue": 1.12, "wue": 0.12, "gpuDieC": 58.5, "cpuDieC": 54.0, "itLoadMw": 6.33, "accessoryPowerMw": 0.77 } ] }
```

---

## What-If Engine

### `POST /api/whatif`

Run a counterfactual grid search. Persists the run and its top-25 candidates.

**Request body**

```json
{
  "alpha": 0.7,
  "beta": 0.3,
  "zoneId": null,
  "itLoadMw": 6.4,
  "wetBulbC": 18,
  "baseSetpoints": { "coolantSupplyC": 22, "pumpSpeedPct": 70, "valvePosPct": 80, "cduSetpointC": 24 }
}
```

`alpha`/`beta` are required. For a per-zone run, pass `zoneId` and the worker uses that zone's live telemetry + setpoints as defaults; otherwise `itLoadMw`/`wetBulbC`/`baseSetpoints` are used.

**Response** (`WhatIfResponse`)

```json
{
  "runId": 44,
  "zoneId": null,
  "alpha": 0.7,
  "beta": 0.3,
  "evaluated": 1560,
  "feasibleCount": 1204,
  "best": { /* WhatIfCandidate | null */ },
  "candidates": [ { /* WhatIfCandidate */ } ]
}
```

`WhatIfCandidate`: `setpoints`, `pue`, `wue`, `cost`, `chipTempC`, `deltaPKpa`, `flowLpm`, `accessoryPowerMw`, `feasible`, `violations`.

A candidate is feasible only if it passes every hard guardrail **and** keeps a 5 °C thermal-margin operating reserve (violation code `THERMAL_MARGIN`).

- `400` if `alpha`/`beta` missing; `404` if `zoneId` not found.

### `GET /api/whatif`

List the 20 most recent runs (metadata only).

**Response**

```json
{ "runs": [ { "id": 1, "createdAt": "...", "zoneId": 1, "alpha": 0.7, "beta": 0.3, "bestPue": 1.0812, "bestWue": 0.118, "bestCost": 0.0812, "candidatesEvaluated": 1560, "feasibleCount": 1204, "status": "completed" } ] }
```

### `GET /api/whatif/{id}`

Full detail for one run, including its persisted candidates (re-sorted feasible-first, then by cost). `deltaPKpa`, `flowLpm` and `accessoryPowerMw` are not persisted and come back as `0`; infeasible candidates have `cost: null`.

**Response** — `WhatIfResponse` plus `createdAt`, `baseSetpoints`, `status`.

- `404` if the run doesn't exist.

---

## Zones (Master Data)

### `GET /api/zones`

List zone configuration.

**Response**

```json
{ "zones": [ { "id": 1, "name": "Zone A", "targetPue": 1.11, "targetWue": 0.115, "waterBudgetLpm": 1400, "powerBudgetMw": 1.2, "mode": "shadow" } ] }
```

### `PATCH /api/zones/{id}`

Update zone targets/budgets/name. Any subset of fields may be sent.

**Request body**

```json
{ "targetPue": 1.12, "targetWue": 0.12, "waterBudgetLpm": 1100, "powerBudgetMw": 0.95, "name": "Zone B" }
```

**Response** — `{ "ok": true }`

- `400` invalid value (`targetPue` must be ≥ 1, `targetWue`/`powerBudgetMw` positive, `waterBudgetLpm` ≥ 400, `name` non-empty)
- `404` zone not found
- `422` the new budgets would make Σ zone budgets exceed the facility budget

### `GET /api/zones/{id}/validation`

Shadow-validation statistics for a zone.

**Response** (`ValidationResponse`)

```json
{
  "zoneId": 1,
  "hasShadowConfig": true,
  "shadowSetpoints": { /* Setpoints | null */ },
  "total": 57,
  "feasible": 57,
  "budgetOk": 55,
  "meets": 50,
  "feasibleRate": 1.0,
  "meetsRate": 0.88,
  "avgPueGap": 0.0,
  "ready": false,
  "criteria": { "minSamples": 6, "feasibleRate": 0.95, "meetsRate": 0.9, "tolerance": 0.02 },
  "samples": [ { "tick": 923, "predictedPue": 1.074, "predictedWue": 0.213, "actualPue": 1.0768, "actualWue": 0.214, "chipTempC": 70.6, "feasible": true, "budgetOk": true, "meetsTarget": true } ]
}
```

`predicted*` is the shadow config's prediction, `actual*` the live config's. `meetsTarget` is one-sided: PUE ≤ target + 0.02 and WUE ≤ target + 0.02. `avgPueGap` averages only the amount above target. `ready` = shadow config set, ≥ `minSamples` samples, `feasibleRate` ≥ 0.95 and `meetsRate` ≥ 0.9.

---

## Facility

### `GET /api/facility`

Facility-wide budgets.

**Response** — `{ "id": 1, "totalWaterBudgetLpm": 4400, "totalPowerBudgetMw": 3.6 }`

### `PATCH /api/facility`

Update facility budgets.

**Request body** — `{ "totalWaterBudgetLpm": 4400, "totalPowerBudgetMw": 3.6 }`

**Response** — `{ "ok": true }`

- `400` non-positive values; `422` below the current Σ zone budgets

---

## Control

### `GET /api/control`

Per-zone control state + the 50 most recent control actions.

**Response** (`ControlResponse`)

```json
{
  "zones": [ { /* ControlZoneView */ } ],
  "actions": [ { /* ControlAction */ } ]
}
```

`ControlZoneView`: `id`, `name`, `mode`, `commsOk`, `failSafeActive`, `slewLimited`, `lastHeartbeat`, `heartbeatAgeSec`, `watchdogTimeoutSec`, `currentSetpoints`, `shadowSetpoints`, `effectiveSetpoints`, `factorySetpoints`, `slewLimits`, `targets`, `budgets`, `updatedAt`.

`ControlAction`: `id`, `clusterId`, `createdAt`, `mode`, `kind` (`would_be` | `applied` | `fail_safe`), `setpoints`, `note`.

### `POST /api/control/mode`

Set a zone's operating mode. Switching to `closed_loop` requires a shadow config whose validation is `ready`; the zone then moves toward the validated config through the slew limiter (first step applied immediately). Switching to `shadow` stops writeback and keeps the current setpoints.

**Request body**

```json
{ "clusterId": 1, "mode": "closed_loop" }
```

`mode` must be `"shadow"` or `"closed_loop"`.

**Response** — `ControlResponse` (fresh snapshot).

- `400` missing/invalid `mode`; `404` zone not found; `422` no shadow config or validation not passed.

### `POST /api/control/apply`

Write setpoints to a zone (slew-rate-limited, guardrail-checked).

**Request body**

```json
{ "clusterId": 1, "setpoints": { "coolantSupplyC": 22, "pumpSpeedPct": 70, "valvePosPct": 80, "cduSetpointC": 24 }, "note": "Operator change" }
```

**Response** — `{ "ok": true, "applied": { /* Setpoints */ }, "slewLimited": false, "kind": "applied" }`

`kind` is `"applied"` in closed-loop mode (setpoints written), `"would_be"` in shadow mode (logged only — the zone's setpoints are not changed).

- `400` missing fields; `404` zone not found; `422` guardrail violation.

### `POST /api/control/applyShadow`

Apply setpoints to a zone's **shadow** config (validates guardrails + budget).

**Request body**

```json
{ "clusterId": 1, "setpoints": { /* Setpoints */ } }
```

**Response** — `{ "ok": true, "shadowSetpoints": { /* Setpoints */ } }`

- `400`/`404`/`422` as above.

### `POST /api/control/heartbeat`

Feed the watchdog for all zones. No body. (Every simulation tick also refreshes the heartbeat; if none arrives for 90 s the watchdog reverts zones to factory setpoints and disengages closed-loop.)

**Response** — `{ "ok": true }`

---

## Transfers

### `POST /api/transfers`

Propose a cooling transfer (shadow status). Computes the guardrail-clamped source/target setpoints and checks the facility budget.

**Request body**

```json
{ "sourceId": 1, "targetId": 4, "waterDeltaLpm": 100, "powerDeltaMw": 0.1 }
```

**Response** (`TransferResponse`)

```json
{
  "id": 2,
  "status": "shadow",
  "feasible": true,
  "withinFacility": true,
  "violations": [],
  "waterDeltaLpm": 97,
  "powerDeltaMw": 0.098,
  "source": { /* ZoneProposal */ },
  "target": { /* ZoneProposal */ }
}
```

`ZoneProposal`: `setpoints`, `prediction`, `feasible`, `violations`, `withinBudget`.

### `GET /api/transfers`

List the 50 most recent transfers.

**Response** — `{ "transfers": [ { "id": 2, "createdAt": "...", "sourceId": 1, "targetId": 4, "waterDeltaLpm": 97, "powerDeltaMw": 0.098, "sourceSetpoints": "...", "targetSetpoints": "...", "status": "shadow" } ] }`

### `POST /api/transfers/{id}/{action}`

Transition a transfer. `action` ∈ `virtual` | `verify` | `apply` | `reject`.

- `apply` re-checks guardrails against live telemetry, writes the transferred setpoints to both zones through the slew limiter, **and** reallocates their budgets (source loses `waterDeltaLpm`/`powerDeltaMw`, target gains the same).
- Other actions only update the transfer's `status`. The stored status is the last action name (`shadow` → `virtual` → `verify` → `apply` | `reject`).

**Response** — `{ "ok": true, "status": "<action>", "slewLimited": false }`

- `404` transfer or zone not found; `409` transfer already applied or rejected; `422` guardrail violation on live telemetry.

---

## Sensors

### `GET /api/sensors`

Per-zone sensor readings with health, history and data-quality events. Query param: `window` (ticks, default `36` = 6 h, clamped 6–144).

**Response** (`SensorsResponse`)

```json
{
  "windowTicks": 36,
  "zones": [
    {
      "zoneId": 4,
      "name": "Zone D",
      "ticks": [1001, 1002, "..."],
      "sensors": [
        {
          "id": "4:cdu_supply",
          "kind": "cdu_supply",
          "value": 22.0,
          "status": "warn",
          "reason": "4 data-quality actions in the window",
          "history": [21.9, 22.0, "..."],
          "events": [ { "tick": 1030, "kind": "outlier", "note": "+6°C spike rejected; reading replaced by model estimate" } ]
        }
      ]
    }
  ]
}
```

`kind` ∈ `gpu_die` | `cpu_die` | `cdu_supply` | `cdu_return` | `flow` | `delta_p` | `fws_supply` | `fws_flow` | `wet_bulb` | `dry_bulb`. `status` ∈ `ok` | `warn` | `crit` (rules in APPLICATION.md §4 Sensors). `history` aligns with `ticks`; `events` are newest first. Samples recorded before data-quality reports were stored have no events.

---

## Model

### `GET /api/model/metrics`

Latest model metrics + model card + drift series.

**Response** (`ModelMetricsResponse`)

```json
{
  "latest": { "maeMw": 0.024, "pueCoverage": 99.1, "klDivergence": 0.047, "inferenceLatencyMs": 3.8, "createdAt": "..." },
  "card": { "name": "dcflex-surrogate", "version": "1.4.2", "algorithm": "...", "exportedFormat": "...", "temporalSplit": "...", "targets": { "maeMw": 0.026, "pueCoveragePct": 98.7, "pueErrorBound": 0.01 }, "monotonicConstraints": [ "..." ], "guardrails": [ "..." ], "drift": { "metric": "...", "warnThreshold": 0.08, "criticalThreshold": 0.15 } },
  "drift": [ { "t": "...", "kl": 0.047 } ]
}
```

---

## Diagnostics

### `GET /api/_check`

Self-check for the transfer engine (requires a valid session). Returns `200 { "ok": true }` or `500 { "ok": false, "issues": [ ... ] }`.

---

## Shared types

### Setpoints

```json
{ "coolantSupplyC": 22, "pumpSpeedPct": 70, "valvePosPct": 80, "cduSetpointC": 24 }
```

### Prediction

```json
{ "accessoryPowerMw": 0.84, "pumpPowerMw": 0.5, "chillerPowerMw": 0.34, "pue": 1.12, "wue": 0.12, "chipTempC": 71.0, "deltaPKpa": 77.9, "flowLpm": 934, "thermalMarginC": 14.0 }
```

### GuardrailViolation

```json
{ "code": "CHIP_TEMP", "message": "T_chip 88.2°C > 85°C limit" }
```

`code` ∈ `CHIP_TEMP` | `DELTA_P_LOW` | `DELTA_P_HIGH` | `FLOW_LOW` | `FLOW_HIGH` | `THERMAL_MARGIN` (what-if operating reserve only).

### Telemetry

`tick`, `timestamp`, `itLoadMw`, `cpuDieC`, `gpuDieC`, `cduSupplyC`, `cduReturnC`, `deltaPKpa`, `flowLpm`, `fwsSupplyC`, `fwsFlowLpm`, `wetBulbC`, `dryBulbC`.

---

## Cron / background

A scheduled handler (`*/1 * * * *` in `wrangler.jsonc`) runs `advanceSimulation` once a minute, independently of the HTTP auth gate. It advances the telemetry, steers closed-loop zones, and evaluates Telegram alerts.
