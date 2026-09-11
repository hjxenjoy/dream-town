import { BUILDINGS, type BuildingCategory, type BuildingKind } from './data.ts';
import { riverX } from './terrain.ts';

/** Seasonal hazards. Every kind maps to frames in the generated `disasters` atlas. */
export type DisasterKind = 'fire' | 'flood' | 'drought' | 'hail' | 'insects';
export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';

export const DISASTER_KINDS: readonly DisasterKind[] = ['fire', 'flood', 'drought', 'hail', 'insects'];

export interface RepairCost { coins: number; wood: number; stone: number; materials: number }

export interface DisasterDefinition {
  name: string;
  /** Log sentence; `%s` is replaced with the building name. */
  log: string;
  advice: string;
  /** Two frames of the animation drawn over the struck building. */
  frames: readonly [string, string];
  seasons: readonly SeasonKey[];
  /** `building` hazards follow the category list; `farm` hazards only strike farmland. */
  target: 'building' | 'farm';
  categories: readonly BuildingCategory[];
  /** Reaches only the river plain, which makes placement the player's defence. */
  riverOnly?: boolean;
  /** Protective radius that prevents it, if any. */
  guard: 'fire' | null;
  repair: RepairCost;
}

export const DISASTERS: Record<DisasterKind, DisasterDefinition> = {
  fire: {
    name: '火情', log: '%s发生了小火情，生产已经暂停，请及时修缮。', advice: '消防站与瞭望塔的覆盖范围可以预防火情。',
    frames: ['fire-0', 'fire-1'], seasons: ['spring', 'summer', 'autumn'],
    target: 'building', categories: ['production', 'services', 'homes'], guard: 'fire',
    repair: { coins: 80, wood: 3, stone: 2, materials: 0 },
  },
  flood: {
    name: '水患', log: '%s被上涨的河水淹过，生产已经暂停，请及时修缮。', advice: '河滩低地容易被淹，工坊适合搬到离河稍远的地方。',
    frames: ['flood-0', 'flood-1'], seasons: ['spring', 'summer'],
    target: 'building', categories: ['production', 'services'], riverOnly: true, guard: null,
    repair: { coins: 90, wood: 2, stone: 4, materials: 0 },
  },
  drought: {
    name: '旱情', log: '%s的土壤干裂，这一季的作物需要重新照料。', advice: '旱情多发于盛夏与金秋，修缮后就能继续耕作。',
    frames: ['drought-0', 'drought-1'], seasons: ['summer', 'autumn'],
    target: 'farm', categories: ['production'], guard: null,
    repair: { coins: 60, wood: 1, stone: 1, materials: 0 },
  },
  hail: {
    name: '雹灾', log: '%s被冰雹打坏，需要重新整理田地。', advice: '春夏之交易落冰雹，修缮不会损失土地肥力。',
    frames: ['hail-0', 'hail-1'], seasons: ['spring', 'summer'],
    target: 'farm', categories: ['production'], guard: null,
    repair: { coins: 70, wood: 3, stone: 1, materials: 0 },
  },
  insects: {
    name: '虫害', log: '%s出现虫害，作物暂时无法收成。', advice: '暖季的虫害来得快去得也快，修缮成本不高。',
    frames: ['insects-0', 'insects-1'], seasons: ['spring', 'summer'],
    target: 'farm', categories: ['production'], guard: null,
    repair: { coins: 50, wood: 1, stone: 1, materials: 0 },
  },
};

/** Scaffolding shown while a repair is under way, and the bell shown as an alert marker. */
export const REPAIR_FRAMES: readonly [string, string] = ['scaffold-0', 'scaffold-1'];
export const ALERT_FRAMES: readonly [string, string] = ['bell-0', 'bell-1'];
export const REPAIR_SECONDS = 30;

/**
 * What a unit of a material costs when the town has none and no way to make any. Bought in
 * from outside, so both are dearer than making them yourself — a safety valve for a damaged
 * town, not a strategy.
 */
export const BUY_IN_PRICE = { wood: 45, stone: 55 } as const;
export const DISASTER_INTERVAL = 420;

/**
 * The most of the town that may be out of action at once, as a share of everything built.
 * Repair demand grows with every damaged building while income shrinks with every halted one,
 * so without a ceiling a town that falls behind can never catch up: the neglected town is
 * hit again as fast as it repairs, forever. Bound the damage and recovery is always possible.
 */
export const MAX_DAMAGED_SHARE = 1 / 3;

/** How many buildings may be damaged at once in a town of `total` buildings. */
export function damageCeiling(total: number): number {
  return Math.max(1, Math.floor(total * MAX_DAMAGED_SHARE));
}

/** How long a struggling town is spared between hazards, given how much is already broken. */
export function strikeInterval(buildings: number, damaged: number): number {
  if (buildings <= 0 || damaged <= 0) return DISASTER_INTERVAL;
  // Repair demand rises with every damaged building while income falls with every halted one.
  // Stretching the interval by the same measure turns that runaway into a stable point: a
  // healthy town is hit exactly as before, a wrecked one is given room to dig itself out.
  return DISASTER_INTERVAL * (1 + (damaged / buildings) * DISTRESS_THROTTLE);
}

/** How strongly outstanding damage slows the next hazard. */
export const DISTRESS_THROTTLE = 6;

/**
 * Hazards are pressure on a working town, not a coup de grâce. Below this many residents
 * there is nothing worth losing and no income to pay for repairs, so nothing strikes: a
 * wrecked town is left to put itself back together instead of being finished off.
 */
export const MIN_DISASTER_POPULATION = 10;

/** Saves written before hazards had kinds, and any unknown value, read as a fire. */
export function disasterOf(kind: DisasterKind | undefined): DisasterDefinition {
  return DISASTERS[kind ?? 'fire'];
}

/** Buildings that shelter others and are never struck themselves. */
const INFRASTRUCTURE: readonly BuildingKind[] = ['well', 'watertower', 'firetower', 'firestation'];

export interface HazardOverlay {
  frame: string;
  /** The warning bell hangs only while a repair has not been ordered yet. */
  warning: boolean;
}

/**
 * Which atlas frame a struck building shows, shared by the renderer and its tests.
 * Returns null when the building is healthy. Reduced motion freezes on frame zero.
 */
export function hazardOverlay(
  building: { damaged?: boolean; damageKind?: DisasterKind; repairingUntil?: number },
  time: number,
  reduced: boolean,
): HazardOverlay | null {
  const repairing = building.repairingUntil !== undefined;
  if (!repairing && building.damaged !== true) return null;
  const frames = repairing ? REPAIR_FRAMES : disasterOf(building.damageKind).frames;
  return {
    frame: frames[reduced ? 0 : Math.floor(time / HAZARD_FRAME_MS) % frames.length],
    warning: building.damaged === true && !repairing && !reduced,
  };
}

export const HAZARD_FRAME_MS = 380;
export const ALERT_FRAME_MS = 520;

/** Picks a frame from a two-frame loop; reduced motion holds the first frame. */
export function loopFrame(frames: readonly [string, string], time: number, ms: number, reduced: boolean): string {
  return frames[reduced ? 0 : Math.floor(time / ms) % frames.length];
}

/** Whether this hazard can strike this building right now. */
export function canStrike(
  disaster: DisasterKind,
  building: { kind: BuildingKind; x: number; y: number; damaged?: boolean; repairingUntil?: number },
  season: SeasonKey,
  guarded: boolean,
): boolean {
  const definition = DISASTERS[disaster];
  if (building.damaged || building.repairingUntil !== undefined) return false;
  if (INFRASTRUCTURE.includes(building.kind)) return false;
  // Farmland has its own hazards; the townhall is never a target.
  if (definition.target === 'farm') { if (building.kind !== 'farm') return false; }
  else {
    if (building.kind === 'farm' || building.kind === 'townhall') return false;
    if (!definition.categories.includes(BUILDINGS[building.kind].category)) return false;
  }
  if (!definition.seasons.includes(season)) return false;
  // The flood plain is the strip either side of the river.
  if (definition.riverOnly && Math.abs(building.x - riverX(building.y)) > 9) return false;
  if (definition.guard && guarded) return false;
  return true;
}
