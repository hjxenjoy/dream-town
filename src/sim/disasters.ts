import { BUILDINGS, type BuildingCategory, type BuildingKind, type Resource } from './data.ts';
import { riverX } from './terrain.ts';

/** Seasonal hazards. Every kind maps to frames in the generated `disasters` atlas. */
export type DisasterKind = 'fire' | 'flood' | 'drought' | 'hail' | 'insects' | 'bandits';
export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';

export const DISASTER_KINDS: readonly DisasterKind[] = ['fire', 'flood', 'drought', 'hail', 'insects', 'bandits'];

export interface RepairCost { coins: number; wood: number; stone: number; materials: number }

export interface DisasterDefinition {
  name: string;
  /** Log sentence; `%s` is replaced with the building name. */
  log: string;
  advice: string;
  /** Two frames of the animation drawn over the struck building. */
  frames: readonly [string, string];
  /**
   * Which atlas those frames live in. Hazards default to the `disasters` sheet, but the
   * bandit art was delivered with the defence pack, so the sheet is named per hazard rather
   * than hard-coded in the renderer.
   */
  atlas?: 'duel-actions';
  seasons: readonly SeasonKey[];
  /** `building` hazards follow the category list; `farm` hazards only strike farmland. */
  target: 'building' | 'farm';
  categories: readonly BuildingCategory[];
  /** Reaches only the river plain, which makes placement the player's defence. */
  riverOnly?: boolean;
  /** Protective radius that prevents it, if any. */
  guard: 'fire' | 'bandits' | null;
  repair: RepairCost;
  /**
   * Goods carried off, as a share of what the warehouse holds at the moment of the raid.
   * A share rather than a fixed amount so a full warehouse loses more than a bare one, and
   * capped by `RAID_LOSS_SHARE` so one raid can never empty the shelves.
   */
  steals?: readonly Resource[];
  /** The share of each stolen resource the raid takes, before the cap is applied. */
  stealsShare?: number;
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
  bandits: {
    name: '强盗', log: '%s被强盗光顾，屋子和货架都遭了殃。', advice: '岗哨与兵营的警戒范围能挡住强盗；被抢走的货物拿不回来，但房子修好就能继续用。',
    frames: ['bandit-lunge', 'bandit-recoil'], atlas: 'duel-actions', seasons: ['spring', 'summer', 'autumn', 'winter'],
    target: 'building', categories: ['production', 'homes', 'services'], guard: 'bandits',
    repair: { coins: 120, wood: 4, stone: 3, materials: 0 },
    // The goods the town actually trades in, as `docs/03` §5 names them, plus the finished
    // goods a raid would obviously go for.
    steals: ['fish', 'plank', 'wheat', 'wool', 'bread', 'tools', 'clothing', 'cheese', 'honey', 'wine'],
    stealsShare: 0.12,
  },
};

/**
 * The most one raid may carry off, as a share of EVERYTHING in the warehouse. A raid is a
 * setback the player feels and recovers from, not a reset: this is the ceiling that keeps a
 * bad roll from undoing an evening's work.
 */
export const RAID_LOSS_SHARE = 0.25;

/**
 * What a raid takes from a warehouse, item by item. Never more than `RAID_LOSS_SHARE` of the
 * whole stock, and never more than a building's worth of goods: every line is floored, so a
 * raid cannot take the last of something the town needs to keep running.
 */
export function raidLoss(
  disaster: DisasterKind,
  resources: Readonly<Record<Resource, number>>,
): Partial<Record<Resource, number>> {
  const definition = DISASTERS[disaster];
  if (!definition.steals || !definition.stealsShare) return {};
  const total = Object.values(resources).reduce((sum, amount) => sum + amount, 0);
  let budget = Math.floor(total * RAID_LOSS_SHARE);
  const taken: Partial<Record<Resource, number>> = {};
  for (const key of definition.steals) {
    if (budget <= 0) break;
    const wanted = Math.floor((resources[key] ?? 0) * definition.stealsShare);
    const amount = Math.min(wanted, budget);
    if (amount > 0) { taken[key] = amount; budget -= amount; }
  }
  return taken;
}

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
  /** The sheet the frame lives in, so the renderer does not hard-code one. */
  atlas: string;
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
  const definition = disasterOf(building.damageKind);
  const frames = repairing ? REPAIR_FRAMES : definition.frames;
  return {
    frame: frames[reduced ? 0 : Math.floor(time / HAZARD_FRAME_MS) % frames.length],
    atlas: repairing ? 'disasters' : (definition.atlas ?? 'disasters'),
    warning: building.damaged === true && !repairing && !reduced,
  };
}

export const HAZARD_FRAME_MS = 380;
export const ALERT_FRAME_MS = 520;

/**
 * The stand-off the defence art shipped as two four-frame sequences, played at the 4 fps the
 * pack declared. A guard and a bandit face off at the post that just turned a raid away, so
 * the defence line has a visible moment instead of only a lower probability nobody can see.
 */
export const DUEL_FRAMES = {
  guard: ['guard-ready', 'guard-thrust', 'guard-block', 'guard-recover'],
  bandit: ['bandit-ready', 'bandit-lunge', 'bandit-recoil', 'bandit-retreat'],
} as const;

/** Four frames a second, as the `duel-actions` pack ships them. */
export const DUEL_FRAME_MS = 250;

/** The current frame of a duel sequence; reduced motion holds the ready stance. */
export function duelFrame(side: keyof typeof DUEL_FRAMES, time: number, reduced: boolean): string {
  const frames = DUEL_FRAMES[side];
  return frames[reduced ? 0 : Math.floor(time / DUEL_FRAME_MS) % frames.length];
}

/** How long the stand-off stays on the map after the guards shout the all-clear. */
export const REPELLED_SHOW_SECONDS = 20;

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
  /** True when a guardpost or barracks overlooks this building. Only bandits care. */
  watched = false,
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
  if (definition.guard === 'fire' && guarded) return false;
  if (definition.guard === 'bandits' && watched) return false;
  return true;
}
