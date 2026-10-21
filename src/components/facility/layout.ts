import type { SensorKind } from "../../lib/twin/types";

/**
 * Representative 3D layout (metres). Each zone is a rack row in the data hall
 * with its CDU at the row end; the primary loop runs out to a chiller skid and a
 * cooling-tower cell in the yard. Rows are laid out along z.
 */
export type Vec3 = [number, number, number];

export const ROW_SPACING = 4;
export const RACKS_PER_ROW = 8;
export const RACK = { w: 0.8, h: 2.2, d: 1.1, pitch: 0.95, firstX: -9 };
export const HOT_RACK = 3;
export const CDU = { x: -0.7, w: 1.3, h: 2.2, d: 1.1 };
export const CHILLER = { x: 4, w: 2, h: 1.4, d: 1.5 };
export const TOWER = { x: 8.2, w: 2.2, h: 2.4, d: 2.2 };
export const HEADER_Y = 2.6;
export const PRIMARY_Y = 0.55;
export const HALL = { minX: -10.6, maxX: 1.6 };

export const rowZ = (index: number, count: number) => (index - (count - 1) / 2) * ROW_SPACING;
export const rackX = (i: number) => RACK.firstX + i * RACK.pitch;

/** Sensor anchor relative to the row centre line (z = 0). Front faces point to +z, toward the default camera. */
export const SENSOR_ANCHOR: Record<SensorKind, Vec3> = {
  gpu_die: [rackX(HOT_RACK), 1.65, RACK.d / 2 + 0.06],
  cpu_die: [rackX(HOT_RACK), 1.05, RACK.d / 2 + 0.06],
  cdu_supply: [CDU.x - 0.25, HEADER_Y - 0.25, -0.25],
  cdu_return: [CDU.x - 0.25, HEADER_Y - 0.25, 0.25],
  flow: [-2.2, HEADER_Y, -0.25],
  delta_p: [CDU.x, 1.25, CDU.d / 2 + 0.06],
  fws_supply: [1.9, PRIMARY_Y, -0.3],
  fws_flow: [2.7, PRIMARY_Y, -0.3],
  wet_bulb: [TOWER.x + TOWER.w / 2 - 0.15, TOWER.h + 1.0, -0.18],
  dry_bulb: [TOWER.x + TOWER.w / 2 - 0.15, TOWER.h + 0.65, 0.18],
};

export const sensorPosition = (kind: SensorKind, rowIndex: number, rowCount: number): Vec3 => {
  const [x, y, z] = SENSOR_ANCHOR[kind];
  return [x, y, z + rowZ(rowIndex, rowCount)];
};

/** Pipe routes relative to the row centre line, in flow direction. */
export const PIPES = {
  secondarySupply: [
    [CDU.x - 0.25, CDU.h, -0.25],
    [CDU.x - 0.25, HEADER_Y, -0.25],
    [rackX(0) - 0.3, HEADER_Y, -0.25],
  ] as Vec3[],
  secondaryReturn: [
    [rackX(0) - 0.3, HEADER_Y, 0.25],
    [CDU.x - 0.25, HEADER_Y, 0.25],
    [CDU.x - 0.25, CDU.h, 0.25],
  ] as Vec3[],
  primarySupply: [
    [TOWER.x - TOWER.w / 2, PRIMARY_Y, -0.3],
    [CHILLER.x + CHILLER.w / 2, PRIMARY_Y, -0.3],
    [CHILLER.x - CHILLER.w / 2, PRIMARY_Y, -0.3],
    [CDU.x + CDU.w / 2, PRIMARY_Y, -0.3],
  ] as Vec3[],
  primaryReturn: [
    [CDU.x + CDU.w / 2, PRIMARY_Y, 0.3],
    [CHILLER.x - CHILLER.w / 2, PRIMARY_Y, 0.3],
    [CHILLER.x + CHILLER.w / 2, PRIMARY_Y, 0.3],
    [TOWER.x - TOWER.w / 2, PRIMARY_Y, 0.3],
  ] as Vec3[],
};
