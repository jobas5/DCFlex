import { strict as assert } from "node:assert";
import { registerHooks } from "node:module";

// Node strips the types itself; the twin's imports are extensionless (bundler
// resolution), so retry unresolved relative specifiers with ".ts". The hook has
// to be registered before the twin modules load, hence the dynamic imports.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err?.code !== "ERR_MODULE_NOT_FOUND" || !/^\.\.?\//.test(specifier)) throw err;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const twin = (name) => import(new URL(`../src/lib/twin/${name}.ts`, import.meta.url).href);
const { applySlewLimits, evaluateGuardrails, predict } = await twin("surrogate");
const { runWhatIf } = await twin("optimizer");
const { proposeTransfer } = await twin("transfer");
const { mulberry32, tickTelemetry } = await twin("simulator");
const { SENSOR_DEFS, SENSOR_KINDS, sensorReadings, sensorStatus } = await twin("sensors");
const { GUARDRAILS, MARGIN_TIERS, SLEW_LIMITS } = await twin("types");

const steps = (lo, hi, step) => {
  const out = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v * 10) / 10);
  return out;
};

// --- 1. predict() monotonicity --------------------------------------------
// Outputs are rounded, which preserves non-strict monotonicity, so compare exactly.
const loads = steps(0.5, 20, 0.5);
const supplies = steps(16, 34, 0.5);
const wetBulbs = steps(0, 35, 1);
const at = (itLoadMw, coolantSupplyC, wetBulbC, pumpSpeedPct, valvePosPct) =>
  predict(
    { itLoadMw, wetBulbC, dryBulbC: wetBulbC + 6 },
    { coolantSupplyC, pumpSpeedPct, valvePosPct, cduSetpointC: Math.min(34, coolantSupplyC + 2) },
  );
let monotonicPairs = 0;
for (const pump of [40, 70, 100]) {
  for (const valve of [30, 80, 100]) {
    const grid = loads.map((l) => supplies.map((s) => wetBulbs.map((w) => at(l, s, w, pump, valve))));
    const where = (i, j, k) => `load ${loads[i]} MW, supply ${supplies[j]}°C, wet-bulb ${wetBulbs[k]}°C, pump ${pump}%, valve ${valve}%`;
    for (let i = 0; i < loads.length; i++) {
      for (let j = 0; j < supplies.length; j++) {
        for (let k = 0; k < wetBulbs.length; k++) {
          const p = grid[i][j][k];
          if (i > 0) {
            assert.ok(p.accessoryPowerMw >= grid[i - 1][j][k].accessoryPowerMw, `accessory power fell with IT load at ${where(i, j, k)}`);
          }
          if (j > 0) {
            assert.ok(p.chillerPowerMw <= grid[i][j - 1][k].chillerPowerMw, `chiller power rose with supply temp at ${where(i, j, k)}`);
            assert.ok(p.accessoryPowerMw <= grid[i][j - 1][k].accessoryPowerMw, `accessory power rose with supply temp at ${where(i, j, k)}`);
          }
          if (k > 0) {
            assert.ok(p.chillerPowerMw >= grid[i][j][k - 1].chillerPowerMw, `chiller power fell with wet-bulb at ${where(i, j, k)}`);
          }
          monotonicPairs++;
        }
      }
    }
  }
}

// --- 2. runWhatIf() keeps the green reserve and picks the cheapest --------
let reserveRejections = 0;
let scenarios = 0;
for (const itLoadMw of [2, 6.4, 10, 14]) {
  for (const wetBulbC of [5, 18, 30]) {
    for (const [alpha, beta] of [[1, 0], [0, 1], [1, 1], [0.7, 0.3]]) {
      const label = `itLoad ${itLoadMw}, wet-bulb ${wetBulbC}, α ${alpha}, β ${beta}`;
      const ctx = { itLoadMw, wetBulbC, dryBulbC: wetBulbC + 6 };
      const r = runWhatIf({ alpha, beta, itLoadMw, wetBulbC });
      assert.equal(r.evaluated, 1560, label);
      assert.equal(r.candidates.length, 1560, label);
      const feasible = r.candidates.filter((c) => c.feasible);
      assert.equal(r.feasibleCount, feasible.length, label);
      for (const c of r.candidates) {
        if (c.violations.some((v) => v.code === "THERMAL_MARGIN")) reserveRejections++;
        if (!c.feasible) {
          assert.equal(c.cost, Number.POSITIVE_INFINITY, label);
          continue;
        }
        const p = predict(ctx, c.setpoints);
        assert.ok(p.thermalMarginC >= MARGIN_TIERS.green, `feasible candidate with ${p.thermalMarginC}°C margin (${label})`);
        assert.ok(GUARDRAILS.chipTempMaxC - c.chipTempC >= MARGIN_TIERS.green, label);
        assert.ok(evaluateGuardrails(p).feasible, `feasible candidate fails guardrails (${label})`);
        assert.ok(evaluateGuardrails(c).feasible, label);
      }
      if (feasible.length === 0) {
        assert.equal(r.best, null, label);
      } else {
        assert.ok(r.best?.feasible, label);
        assert.equal(r.best.cost, Math.min(...feasible.map((c) => c.cost)), `best is not the cheapest feasible (${label})`);
      }
      scenarios++;
    }
  }
}
// Guard against a vacuous pass: the default scenario must have options, and the
// reserve must actually reject candidates that only clear the 85°C guardrail.
assert.ok(runWhatIf({ alpha: 1, beta: 1 }).feasibleCount > 0, "default what-if has no feasible candidates");
assert.ok(reserveRejections > 0, "no candidate was rejected by the thermal reserve");

// --- 3. applySlewLimits() moves each setpoint at most one step -------------
const rand = mulberry32(20260517);
const pick = (lo, hi, step) => lo + Math.floor(rand() * (Math.round((hi - lo) / step) + 1)) * step;
const randomSetpoints = () => ({
  coolantSupplyC: Math.round(pick(16, 34, 0.1) * 10) / 10,
  pumpSpeedPct: pick(40, 100, 1),
  valvePosPct: pick(30, 100, 1),
  cduSetpointC: Math.round(pick(16, 34, 0.1) * 10) / 10,
});
const SLEW_KEYS = [
  ["coolantSupplyC", SLEW_LIMITS.maxTempStepC],
  ["pumpSpeedPct", SLEW_LIMITS.maxPumpStepPct],
  ["valvePosPct", SLEW_LIMITS.maxValveStepPct],
  ["cduSetpointC", SLEW_LIMITS.maxTempStepC],
];
const extremes = [
  { coolantSupplyC: 16, pumpSpeedPct: 40, valvePosPct: 30, cduSetpointC: 16 },
  { coolantSupplyC: 34, pumpSpeedPct: 100, valvePosPct: 100, cduSetpointC: 34 },
];
const slewPairs = [
  ...extremes.flatMap((a) => extremes.map((b) => [a, b])),
  ...Array.from({ length: 20000 }, () => [randomSetpoints(), randomSetpoints()]),
];
for (const [current, requested] of slewPairs) {
  const { setpoints, limited } = applySlewLimits(current, requested);
  for (const [key, max] of SLEW_KEYS) {
    const moved = Math.abs(setpoints[key] - current[key]);
    assert.ok(moved <= max + 1e-9, `${key} moved ${moved} (> ${max}) from ${JSON.stringify(current)} toward ${JSON.stringify(requested)}`);
  }
  if (!limited) assert.deepEqual(setpoints, requested);
}

// --- 4. proposeTransfer() keeps the source at or above the flow floor ------
let transfers = 0;
const target = {
  itLoadMw: 6,
  wetBulbC: 20,
  dryBulbC: 26,
  setpoints: { coolantSupplyC: 22, pumpSpeedPct: 70, valvePosPct: 80, cduSetpointC: 24 },
  waterBudgetLpm: 1600,
  powerBudgetMw: 1.5,
};
for (const pumpSpeedPct of steps(40, 100, 10)) {
  for (const valvePosPct of [30, 50, 80, 100]) {
    for (const coolantSupplyC of [18, 22, 26, 30]) {
      for (const itLoadMw of [1, 4, 8, 12]) {
        // Master Data refuses water budgets below the flow floor.
        for (const waterBudgetLpm of [GUARDRAILS.flowMinLpm, 750, 1100, 1600]) {
          for (const waterDelta of [0, 50, 100, 200, 400, 800]) {
            for (const powerDelta of [0, 0.1]) {
              const source = {
                itLoadMw,
                wetBulbC: 20,
                dryBulbC: 26,
                setpoints: { coolantSupplyC, pumpSpeedPct, valvePosPct, cduSetpointC: coolantSupplyC + 2 },
                waterBudgetLpm,
                powerBudgetMw: 1.5,
              };
              const p = proposeTransfer(target, source, waterDelta, powerDelta);
              assert.ok(
                p.source.prediction.flowLpm >= GUARDRAILS.flowMinLpm,
                `source flow ${p.source.prediction.flowLpm} L/min < ${GUARDRAILS.flowMinLpm} for ${JSON.stringify({ ...source, waterDelta, powerDelta })}`,
              );
              transfers++;
            }
          }
        }
      }
    }
  }
}

// --- 5. Sensor health -------------------------------------------------------
// Guardrail breaches are critical, nearing a limit or recent/repeated
// data-quality actions warn, otherwise OK.
const gpu = SENSOR_DEFS.gpu_die;
assert.equal(sensorStatus(gpu, GUARDRAILS.chipTempMaxC + 0.1, [], 10).status, "crit");
assert.equal(sensorStatus(gpu, GUARDRAILS.chipTempMaxC - MARGIN_TIERS.green, [], 10).status, "warn");
assert.equal(sensorStatus(gpu, 60, [], 10).status, "ok");
assert.equal(sensorStatus(SENSOR_DEFS.flow, GUARDRAILS.flowMinLpm - 1, [], 10).status, "crit");
assert.equal(sensorStatus(SENSOR_DEFS.delta_p, GUARDRAILS.deltaPMaxKpa + 1, [], 10).status, "crit");
const ev = (tick) => ({ tick, kind: "outlier", note: "" });
assert.equal(sensorStatus(SENSOR_DEFS.cdu_supply, 22, [ev(9)], 10).status, "warn", "recent event warns");
assert.equal(sensorStatus(SENSOR_DEFS.cdu_supply, 22, [ev(2)], 10).status, "ok", "old single event is fine");
assert.equal(sensorStatus(SENSOR_DEFS.cdu_supply, 22, [ev(3), ev(2), ev(1)], 10).status, "warn", "repeated events warn");

// Every data-quality event the simulator raises lands on exactly one known
// sensor, and sensorReadings() attributes it back to that sensor.
const spec = { baseLoadMw: 4, loadAmpMw: 1.5, loadPhaseH: 13, wetBulbOffsetC: 1 };
const samples = [];
let prevT = null;
for (let tick = 1000; tick < 1144; tick++) {
  const { telemetry, quality } = tickTelemetry(prevT, tick, undefined, spec);
  for (const e of quality.events) assert.ok(SENSOR_KINDS.includes(e.sensor), `unknown sensor ${e.sensor}`);
  samples.push({ ...telemetry, quality });
  prevT = telemetry;
}
const raised = samples.reduce((n, s) => n + s.quality.events.length, 0);
const readings = sensorReadings(2, samples);
assert.equal(readings.length, SENSOR_KINDS.length);
assert.equal(readings.reduce((n, r) => n + r.events.length, 0), raised, "every event attributed once");
assert.ok(raised > 0, "a 24h run should raise some data-quality events");
for (const r of readings) {
  assert.equal(r.history.length, samples.length);
  assert.equal(r.value, samples.at(-1)[SENSOR_DEFS[r.kind].field]);
}

console.log(
  `twin checks passed: ${monotonicPairs} monotonicity points, ${scenarios} what-if scenarios, ` +
    `${slewPairs.length} slew steps, ${transfers} transfers, ${raised} sensor events attributed`,
);
