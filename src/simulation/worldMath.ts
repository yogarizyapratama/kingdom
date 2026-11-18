import { BuildingInstance } from './types';
import { BUILDING_SPECS } from './constants';

export const WORLD_PLAYABLE_RADIUS = 175;
export const RIVER_BASE_X = 68;

export function riverCenterX(z: number): number {
  return RIVER_BASE_X + Math.sin(z * 0.045) * 6.5;
}

/**
 * Deterministic real-world terrain height function used identically by the 3D mesh,
 * physics grounding, NPC navigation, and building placement.
 * Central stronghold plateau (radius < 34) is gently leveled for castle masonry.
 */
export function groundHeightAt(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);
  const plateauFactor = Math.min(1, Math.max(0, (distFromCenter - 32) / 36));

  const rolling =
    Math.sin(x * 0.032) * Math.cos(z * 0.03) * 2.1 +
    Math.sin(x * 0.075 + 1.1) * Math.sin(z * 0.065 - 0.4) * 0.65;

  // Northern highland ridge near bandit woods
  const northRidge = z < -78 ? Math.min(9.5, (-78 - z) * 0.14) : 0;

  // Outer valley mountain foothills ring
  const outerRim = distFromCenter > 150 ? Math.min(18, (distFromCenter - 150) * 0.24) : 0;

  // Wide Eastbrook river bed around x = 68
  const brookDist = Math.abs(x - riverCenterX(z));
  const brookDip = brookDist < 8.5 ? -1.45 * Math.cos((brookDist / 8.5) * (Math.PI / 2)) : 0;

  return rolling * plateauFactor + northRidge + outerRim + brookDip;
}

export function isWaterAt(x: number, z: number): boolean {
  const brookCenter = riverCenterX(z);
  const onBridge = Math.abs(z - 6) < 4.2;
  return Math.abs(x - brookCenter) < 5.6 && !onBridge;
}

export function isOnRoad(x: number, z: number): boolean {
  // Main north-south royal highway from North Frontier (-88) through Keep (-22) & Square (6) to South Hamlet (115)
  if (Math.abs(x) < 2.6 && z >= -88 && z <= 115) return true;
  // East-west King's highway from Western Wheatlands (-115) across Stone Bridge (68) to Eastern Highlands (135)
  if (Math.abs(z - 6) < 2.4 && x >= -115 && x <= 135) return true;
  // Village square cobble plaza
  if (Math.hypot(x, z - 6) < 8.6) return true;
  return false;
}

export function canPlaceBuilding(
  x: number,
  z: number,
  footprintRadius: number,
  buildings: BuildingInstance[],
): { valid: boolean; reason?: string } {
  const distFromCenter = Math.hypot(x, z);
  if (distFromCenter > 145) {
    return { valid: false, reason: 'Outside royal valley borders' };
  }
  if (isWaterAt(x, z)) {
    return { valid: false, reason: 'Cannot build inside Eastbrook River' };
  }
  if (Math.abs(x) < 3.2 && z > -55 && z < 45) {
    return { valid: false, reason: 'Keep the Royal Road clear' };
  }
  if (Math.abs(z - 6) < 3.0 && x > -55 && x < 78) {
    return { valid: false, reason: 'Keep the King’s Highway clear' };
  }
  for (const b of buildings) {
    const existingRadius = BUILDING_SPECS[b.type]?.footprintRadius ?? 3.5;
    const minDist = footprintRadius + existingRadius + 1.6;
    if (Math.hypot(x - b.x, z - b.z) < minDist) {
      return { valid: false, reason: `Too close to ${b.name}` };
    }
  }
  return { valid: true };
}

export function clampToPlayableWorld(x: number, z: number): { x: number; z: number } {
  const r = Math.hypot(x, z);
  if (r <= WORLD_PLAYABLE_RADIUS) return { x, z };
  const s = WORLD_PLAYABLE_RADIUS / r;
  return { x: x * s, z: z * s };
}
