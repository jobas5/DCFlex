-- Demo seed data for DC Liquid Cooling Optimizer (safe to re-run).

INSERT OR IGNORE INTO facility_config (id, total_water_budget_lpm, total_power_budget_mw, updated_at)
VALUES (1, 4400, 3.6, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO zones (id, name, base_load_mw, load_amp_mw, load_phase_h, wet_bulb_offset_c, target_pue, target_wue, water_budget_lpm, power_budget_mw, mode, comms_ok, last_heartbeat, slew_limited, fail_safe_active, current_setpoints, updated_at) VALUES
  (1, 'Zone A', 5.5, 2.0, 9,  0,  1.110, 0.115, 1400, 1.20, 'shadow', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0, 0, '{"coolantSupplyC":22,"pumpSpeedPct":70,"valvePosPct":80,"cduSetpointC":24}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  (2, 'Zone B', 4.0, 1.5, 13, 1,  1.120, 0.120, 1100, 0.95, 'shadow', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0, 0, '{"coolantSupplyC":22,"pumpSpeedPct":70,"valvePosPct":80,"cduSetpointC":24}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  (3, 'Zone C', 3.0, 1.0, 17, 2,  1.130, 0.125, 900,  0.75, 'shadow', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0, 0, '{"coolantSupplyC":22,"pumpSpeedPct":70,"valvePosPct":80,"cduSetpointC":24}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  (4, 'Zone D', 2.5, 0.8, 21, -1, 1.135, 0.130, 750,  0.60, 'shadow', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0, 0, '{"coolantSupplyC":22,"pumpSpeedPct":70,"valvePosPct":80,"cduSetpointC":24}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO model_metrics (id, created_at, mae_mw, pue_coverage, kl_divergence, inference_latency_ms) VALUES
  (1, '2026-05-20T02:00:00.000Z', 0.0251, 98.9, 0.041, 4.1),
  (2, '2026-05-21T02:00:00.000Z', 0.0244, 99.0, 0.052, 3.9),
  (3, '2026-05-22T02:00:00.000Z', 0.0240, 99.1, 0.047, 3.8);

INSERT OR IGNORE INTO whatif_runs (id, created_at, alpha, beta, base_setpoints, best_setpoints, best_cost, best_pue, best_wue, candidates_evaluated, feasible_count, status) VALUES
  (1, '2026-05-22T08:15:00.000Z', 0.7, 0.3,
   '{"coolantSupplyC":22,"pumpSpeedPct":70,"valvePosPct":80,"cduSetpointC":24}',
   '{"coolantSupplyC":29,"pumpSpeedPct":55,"valvePosPct":90,"cduSetpointC":31}',
   0.0812, 1.0812, 0.118, 1365, 1204, 'completed'),
  (2, '2026-05-22T09:05:00.000Z', 0.4, 0.6,
   '{"coolantSupplyC":22,"pumpSpeedPct":70,"valvePosPct":80,"cduSetpointC":24}',
   '{"coolantSupplyC":30,"pumpSpeedPct":50,"valvePosPct":100,"cduSetpointC":32}',
   0.1204, 1.0779, 0.101, 1365, 1204, 'completed');

INSERT OR IGNORE INTO whatif_candidates (id, run_id, setpoints, pue, wue, cost, chip_temp_c, feasible, violations) VALUES
  (1, 1, '{"coolantSupplyC":29,"pumpSpeedPct":55,"valvePosPct":90,"cduSetpointC":31}', 1.0812, 0.118, 0.0812, 78.4, 1, '[]'),
  (2, 1, '{"coolantSupplyC":28,"pumpSpeedPct":55,"valvePosPct":90,"cduSetpointC":30}', 1.0834, 0.122, 0.1044, 77.6, 1, '[]'),
  (3, 1, '{"coolantSupplyC":30,"pumpSpeedPct":60,"valvePosPct":80,"cduSetpointC":32}', 1.0851, 0.115, 0.1189, 79.9, 1, '[]'),
  (4, 1, '{"coolantSupplyC":32,"pumpSpeedPct":40,"valvePosPct":30,"cduSetpointC":34}', 1.0799, 0.109, NULL, 91.3, 0, '[{"code":"CHIP_TEMP","message":"T_chip 91.3°C > 85°C limit"}]'),
  (5, 2, '{"coolantSupplyC":30,"pumpSpeedPct":50,"valvePosPct":100,"cduSetpointC":32}', 1.0779, 0.101, 0.1204, 80.2, 1, '[]'),
  (6, 2, '{"coolantSupplyC":18,"pumpSpeedPct":100,"valvePosPct":30,"cduSetpointC":20}', 1.1412, 0.156, NULL, 71.2, 0, '[{"code":"DELTA_P_HIGH","message":"ΔP 268 kPa > 240 kPa maximum"}]');

INSERT OR IGNORE INTO control_actions (id, cluster_id, created_at, mode, kind, setpoints, note) VALUES
  (1, 1, '2026-05-22T07:30:00.000Z', 'shadow', 'would_be', '{"coolantSupplyC":26,"pumpSpeedPct":60,"valvePosPct":90,"cduSetpointC":28}', 'Shadow log: optimizer recommended warmer supply during morning ramp'),
  (2, 2, '2026-05-22T08:20:00.000Z', 'shadow', 'would_be', '{"coolantSupplyC":28,"pumpSpeedPct":55,"valvePosPct":90,"cduSetpointC":30}', 'Shadow log: ΔT-maximizing cascade lowered pump speed 5%'),
  (3, 1, '2026-05-22T09:12:00.000Z', 'shadow', 'would_be', '{"coolantSupplyC":29,"pumpSpeedPct":55,"valvePosPct":90,"cduSetpointC":31}', 'Shadow log: what-if run #1 best candidate (J=0.0812)');

INSERT OR IGNORE INTO telemetry_samples (id, cluster_id, tick, payload, pue, wue, created_at) VALUES
  (1, 1, 923, '{"tick":923,"timestamp":"2026-05-23T09:50:00.000Z","itLoadMw":6.33,"cpuDieC":54.0,"gpuDieC":58.5,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":13.6,"fwsFlowLpm":1265,"wetBulbC":10.2,"dryBulbC":15.2}', 1.1222, 0.113, '2026-05-23T09:50:00.000Z'),
  (2, 2, 923, '{"tick":923,"timestamp":"2026-05-23T09:50:00.000Z","itLoadMw":4.85,"cpuDieC":49.1,"gpuDieC":53.2,"cduSupplyC":22,"cduReturnC":35,"deltaPKpa":74.0,"flowLpm":890,"fwsSupplyC":14.1,"fwsFlowLpm":1210,"wetBulbC":11.2,"dryBulbC":16.9}', 1.1310, 0.121, '2026-05-23T09:50:00.000Z'),
  (3, 3, 923, '{"tick":923,"timestamp":"2026-05-23T09:50:00.000Z","itLoadMw":3.62,"cpuDieC":47.0,"gpuDieC":51.4,"cduSupplyC":22,"cduReturnC":34,"deltaPKpa":70.2,"flowLpm":845,"fwsSupplyC":15.2,"fwsFlowLpm":1140,"wetBulbC":12.4,"dryBulbC":18.1}', 1.1390, 0.128, '2026-05-23T09:50:00.000Z'),
  (4, 4, 923, '{"tick":923,"timestamp":"2026-05-23T09:50:00.000Z","itLoadMw":2.91,"cpuDieC":45.2,"gpuDieC":49.8,"cduSupplyC":22,"cduReturnC":33,"deltaPKpa":67.5,"flowLpm":812,"fwsSupplyC":12.9,"fwsFlowLpm":1095,"wetBulbC":9.4,"dryBulbC":14.8}', 1.1450, 0.133, '2026-05-23T09:50:00.000Z');
