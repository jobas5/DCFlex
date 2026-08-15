-- Demo seed data for DC Liquid Cooling Optimizer (safe to re-run).

INSERT OR IGNORE INTO control_state (id, mode, comms_ok, last_heartbeat, slew_limited, fail_safe_active, current_setpoints, updated_at)
VALUES (1, 'shadow', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0, 0,
  '{"coolantSupplyC":22,"pumpSpeedPct":70,"valvePosPct":80,"cduSetpointC":24}',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

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
  (4, 1, '{"coolantSupplyC":27,"pumpSpeedPct":60,"valvePosPct":90,"cduSetpointC":29}', 1.0887, 0.126, 0.1512, 77.1, 1, '[]'),
  (5, 1, '{"coolantSupplyC":31,"pumpSpeedPct":50,"valvePosPct":90,"cduSetpointC":33}', 1.0802, 0.113, 0.1331, 81.8, 1, '[]'),
  (6, 1, '{"coolantSupplyC":32,"pumpSpeedPct":40,"valvePosPct":30,"cduSetpointC":34}', 1.0799, 0.109, NULL, 91.3, 0, '[{"code":"CHIP_TEMP","message":"T_chip 91.3°C > 85°C limit"},{"code":"FLOW_LOW","message":"Flow 312 L/min < 400 L/min minimum"}]'),
  (7, 2, '{"coolantSupplyC":30,"pumpSpeedPct":50,"valvePosPct":100,"cduSetpointC":32}', 1.0779, 0.101, 0.1204, 80.2, 1, '[]'),
  (8, 2, '{"coolantSupplyC":29,"pumpSpeedPct":55,"valvePosPct":90,"cduSetpointC":31}', 1.0812, 0.118, 0.1977, 78.4, 1, '[]'),
  (9, 2, '{"coolantSupplyC":31,"pumpSpeedPct":45,"valvePosPct":90,"cduSetpointC":33}', 1.0788, 0.104, 0.1522, 82.6, 1, '[]'),
  (10, 2, '{"coolantSupplyC":28,"pumpSpeedPct":60,"valvePosPct":80,"cduSetpointC":30}', 1.0846, 0.124, 0.2681, 77.8, 1, '[]'),
  (11, 2, '{"coolantSupplyC":18,"pumpSpeedPct":100,"valvePosPct":30,"cduSetpointC":20}', 1.1412, 0.156, NULL, 71.2, 0, '[{"code":"DELTA_P_HIGH","message":"ΔP 268 kPa > 240 kPa maximum"}]');

INSERT OR IGNORE INTO control_actions (id, created_at, mode, kind, setpoints, note) VALUES
  (1, '2026-05-22T07:30:00.000Z', 'shadow', 'would_be', '{"coolantSupplyC":26,"pumpSpeedPct":60,"valvePosPct":90,"cduSetpointC":28}', 'Shadow log: optimizer recommended warmer supply during morning ramp'),
  (2, '2026-05-22T08:20:00.000Z', 'shadow', 'would_be', '{"coolantSupplyC":28,"pumpSpeedPct":55,"valvePosPct":90,"cduSetpointC":30}', 'Shadow log: ΔT-maximizing cascade lowered pump speed 5%'),
  (3, '2026-05-22T09:12:00.000Z', 'shadow', 'would_be', '{"coolantSupplyC":29,"pumpSpeedPct":55,"valvePosPct":90,"cduSetpointC":31}', 'Shadow log: what-if run #1 best candidate (J=0.0812)');

INSERT OR IGNORE INTO telemetry_samples (id, tick, payload, pue, wue, created_at) VALUES
  (1, 900, '{"tick":900,"timestamp":"2026-05-23T06:00:00.000Z","itLoadMw":4.73,"cpuDieC":46.4,"gpuDieC":50.4,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":15.3,"fwsFlowLpm":1274,"wetBulbC":11.8,"dryBulbC":19.6}', 1.1274, 0.147, '2026-05-23T06:00:00.000Z'),
  (2, 901, '{"tick":901,"timestamp":"2026-05-23T06:10:00.000Z","itLoadMw":4.82,"cpuDieC":48.8,"gpuDieC":51.5,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.8,"fwsFlowLpm":1268,"wetBulbC":11.4,"dryBulbC":18.4}', 1.1273, 0.138, '2026-05-23T06:10:00.000Z'),
  (3, 902, '{"tick":902,"timestamp":"2026-05-23T06:20:00.000Z","itLoadMw":4.75,"cpuDieC":48.6,"gpuDieC":51.3,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.8,"fwsFlowLpm":1280,"wetBulbC":11.2,"dryBulbC":15.6}', 1.1278, 0.133, '2026-05-23T06:20:00.000Z'),
  (4, 903, '{"tick":903,"timestamp":"2026-05-23T06:30:00.000Z","itLoadMw":4.71,"cpuDieC":46.3,"gpuDieC":50.5,"cduSupplyC":22.1,"cduReturnC":36.1,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.3,"fwsFlowLpm":1261,"wetBulbC":10.9,"dryBulbC":19.7}', 1.1283, 0.126, '2026-05-23T06:30:00.000Z'),
  (5, 904, '{"tick":904,"timestamp":"2026-05-23T06:40:00.000Z","itLoadMw":4.8,"cpuDieC":47.4,"gpuDieC":51.4,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.8,"fwsFlowLpm":1254,"wetBulbC":11.2,"dryBulbC":19.8}', 1.1276, 0.133, '2026-05-23T06:40:00.000Z'),
  (6, 905, '{"tick":905,"timestamp":"2026-05-23T06:50:00.000Z","itLoadMw":4.84,"cpuDieC":48.6,"gpuDieC":51.9,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.8,"fwsFlowLpm":1269,"wetBulbC":11.5,"dryBulbC":19.1}', 1.1271, 0.140, '2026-05-23T06:50:00.000Z'),
  (7, 906, '{"tick":906,"timestamp":"2026-05-23T07:00:00.000Z","itLoadMw":4.96,"cpuDieC":49.1,"gpuDieC":52.5,"cduSupplyC":21.9,"cduReturnC":35.9,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.5,"fwsFlowLpm":1248,"wetBulbC":11.1,"dryBulbC":18.6}', 1.1268, 0.131, '2026-05-23T07:00:00.000Z'),
  (8, 907, '{"tick":907,"timestamp":"2026-05-23T07:10:00.000Z","itLoadMw":5.1,"cpuDieC":49,"gpuDieC":52.5,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.7,"fwsFlowLpm":1250,"wetBulbC":11.4,"dryBulbC":19.3}', 1.1259, 0.139, '2026-05-23T07:10:00.000Z'),
  (9, 908, '{"tick":908,"timestamp":"2026-05-23T07:20:00.000Z","itLoadMw":5.09,"cpuDieC":50.1,"gpuDieC":53.1,"cduSupplyC":21.9,"cduReturnC":35.9,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.5,"fwsFlowLpm":1261,"wetBulbC":11.1,"dryBulbC":18.9}', 1.1262, 0.132, '2026-05-23T07:20:00.000Z'),
  (10, 909, '{"tick":909,"timestamp":"2026-05-23T07:30:00.000Z","itLoadMw":5.09,"cpuDieC":49.8,"gpuDieC":52.4,"cduSupplyC":22.1,"cduReturnC":36.1,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.7,"fwsFlowLpm":1273,"wetBulbC":11,"dryBulbC":18.8}', 1.1263, 0.129, '2026-05-23T07:30:00.000Z'),
  (11, 910, '{"tick":910,"timestamp":"2026-05-23T07:40:00.000Z","itLoadMw":5.1,"cpuDieC":49.6,"gpuDieC":53,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.5,"fwsFlowLpm":1248,"wetBulbC":11.2,"dryBulbC":15.4}', 1.1260, 0.134, '2026-05-23T07:40:00.000Z'),
  (12, 911, '{"tick":911,"timestamp":"2026-05-23T07:50:00.000Z","itLoadMw":5.13,"cpuDieC":48.1,"gpuDieC":52.4,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.4,"fwsFlowLpm":1262,"wetBulbC":11.1,"dryBulbC":19}', 1.1260, 0.132, '2026-05-23T07:50:00.000Z'),
  (13, 912, '{"tick":912,"timestamp":"2026-05-23T08:00:00.000Z","itLoadMw":5.18,"cpuDieC":49.6,"gpuDieC":53.3,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.4,"fwsFlowLpm":1274,"wetBulbC":11.2,"dryBulbC":17}', 1.1257, 0.134, '2026-05-23T08:00:00.000Z'),
  (14, 913, '{"tick":913,"timestamp":"2026-05-23T08:10:00.000Z","itLoadMw":5.2,"cpuDieC":49.6,"gpuDieC":52.9,"cduSupplyC":21.9,"cduReturnC":35.9,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.4,"fwsFlowLpm":1252,"wetBulbC":10.8,"dryBulbC":17.1}', 1.1259, 0.125, '2026-05-23T08:10:00.000Z'),
  (15, 914, '{"tick":914,"timestamp":"2026-05-23T08:20:00.000Z","itLoadMw":5.3,"cpuDieC":48.8,"gpuDieC":53.2,"cduSupplyC":21.9,"cduReturnC":35.9,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.3,"fwsFlowLpm":1250,"wetBulbC":10.8,"dryBulbC":16.1}', 1.1255, 0.125, '2026-05-23T08:20:00.000Z'),
  (16, 915, '{"tick":915,"timestamp":"2026-05-23T08:30:00.000Z","itLoadMw":5.33,"cpuDieC":50.5,"gpuDieC":54.2,"cduSupplyC":22.1,"cduReturnC":36.1,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.2,"fwsFlowLpm":1260,"wetBulbC":10.7,"dryBulbC":19.7}', 1.1254, 0.123, '2026-05-23T08:30:00.000Z'),
  (17, 916, '{"tick":916,"timestamp":"2026-05-23T08:40:00.000Z","itLoadMw":5.35,"cpuDieC":50.2,"gpuDieC":53.4,"cduSupplyC":22.1,"cduReturnC":36.1,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":13.7,"fwsFlowLpm":1266,"wetBulbC":10.3,"dryBulbC":17.5}', 1.1257, 0.113, '2026-05-23T08:40:00.000Z'),
  (18, 917, '{"tick":917,"timestamp":"2026-05-23T08:50:00.000Z","itLoadMw":5.55,"cpuDieC":51.3,"gpuDieC":54.7,"cduSupplyC":22.1,"cduReturnC":36.1,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.3,"fwsFlowLpm":1271,"wetBulbC":10.5,"dryBulbC":17.9}', 1.1247, 0.119, '2026-05-23T08:50:00.000Z'),
  (19, 918, '{"tick":918,"timestamp":"2026-05-23T09:00:00.000Z","itLoadMw":5.65,"cpuDieC":51.9,"gpuDieC":55.8,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":13.5,"fwsFlowLpm":1247,"wetBulbC":10.1,"dryBulbC":18.2}', 1.1247, 0.109, '2026-05-23T09:00:00.000Z'),
  (20, 919, '{"tick":919,"timestamp":"2026-05-23T09:10:00.000Z","itLoadMw":5.87,"cpuDieC":52.4,"gpuDieC":56.5,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":13.7,"fwsFlowLpm":1256,"wetBulbC":10.1,"dryBulbC":16.9}', 1.1238, 0.110, '2026-05-23T09:10:00.000Z'),
  (21, 920, '{"tick":920,"timestamp":"2026-05-23T09:20:00.000Z","itLoadMw":5.99,"cpuDieC":53.9,"gpuDieC":56.7,"cduSupplyC":21.9,"cduReturnC":35.9,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":13.3,"fwsFlowLpm":1253,"wetBulbC":10.1,"dryBulbC":16.1}', 1.1234, 0.110, '2026-05-23T09:20:00.000Z'),
  (22, 921, '{"tick":921,"timestamp":"2026-05-23T09:30:00.000Z","itLoadMw":6.1,"cpuDieC":53.9,"gpuDieC":57.6,"cduSupplyC":21.9,"cduReturnC":35.9,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14,"fwsFlowLpm":1269,"wetBulbC":10.4,"dryBulbC":16.1}', 1.1228, 0.118, '2026-05-23T09:30:00.000Z'),
  (23, 922, '{"tick":922,"timestamp":"2026-05-23T09:40:00.000Z","itLoadMw":6.23,"cpuDieC":54.6,"gpuDieC":58,"cduSupplyC":21.9,"cduReturnC":35.9,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":14.1,"fwsFlowLpm":1250,"wetBulbC":10.4,"dryBulbC":17.7}', 1.1224, 0.118, '2026-05-23T09:40:00.000Z'),
  (24, 923, '{"tick":923,"timestamp":"2026-05-23T09:50:00.000Z","itLoadMw":6.33,"cpuDieC":54,"gpuDieC":58.5,"cduSupplyC":22,"cduReturnC":36,"deltaPKpa":77.9,"flowLpm":934,"fwsSupplyC":13.6,"fwsFlowLpm":1265,"wetBulbC":10.2,"dryBulbC":15.2}', 1.1222, 0.113, '2026-05-23T09:50:00.000Z');
