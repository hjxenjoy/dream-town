import type { Building } from './world.ts';
import type { BuildingKind } from './data.ts';

/**
 * Street styles. A style is not a checklist of individual items: it counts a cluster of
 * thematically related decorations standing near each other, so the reward is for making a
 * coherent corner of town rather than for carpeting the map. Radii are deliberately small —
 * the review doc asked for combinations you can see, not for filling every tile.
 */
export type CollectionId = 'flowerlane' | 'promenade' | 'workshop';

export interface CollectionTier {
  name: string;
  /** How many decorations of this style must stand in one cluster. */
  need: number;
  /** And how many different kinds among them, so one cheap item cannot carry the style. */
  distinct: number;
  /** Permanent environment bonus once this tier is reached. */
  environment: number;
  /** An ornament this tier makes buildable, if any. */
  unlocks?: BuildingKind;
  perk: string;
}

export interface CollectionDefinition {
  id: CollectionId;
  name: string;
  description: string;
  icon: string;
  kinds: readonly BuildingKind[];
  /** Cluster radius in tiles. */
  radius: number;
  tiers: readonly CollectionTier[];
}

export const COLLECTIONS: Record<CollectionId, CollectionDefinition> = {
  flowerlane: {
    id: 'flowerlane', name: '花巷', icon: 'leaf', radius: 6,
    description: '把花箱、花架与花树沿同一条街摆开，走过的人会放慢脚步。',
    kinds: ['flowerbox', 'trellis', 'archlights', 'cherry', 'garden', 'willow', 'flowerarch', 'parasol'],
    tiers: [
      { name: '巷口有花', need: 4, distinct: 2, environment: 2, perk: '花木更繁茂，街坊愿意多绕一段路。' },
      { name: '花门灯火', need: 7, distinct: 3, environment: 0, unlocks: 'flowercart', perk: '解锁纪念摆件「花车」。' },
      { name: '满巷花香', need: 10, distinct: 4, environment: 4, perk: '整条街成为小镇的名片。' },
    ],
  },
  promenade: {
    id: 'promenade', name: '滨河步道', icon: 'water', radius: 6,
    description: '栈道、栏杆和码头连成一线，河岸就成了大家散步的地方。',
    kinds: ['boardwalk', 'railing', 'dock', 'willow', 'crates', 'barrels', 'bench', 'gazebo'],
    tiers: [
      { name: '沿河一段', need: 4, distinct: 2, environment: 2, perk: '河岸走得通了，傍晚有人来吹风。' },
      { name: '临水茶座', need: 7, distinct: 3, environment: 0, unlocks: 'picniccorner', perk: '解锁纪念摆件「野餐角」。' },
      { name: '河岸长廊', need: 10, distinct: 4, environment: 4, perk: '整条河岸连成散步的长廊。' },
    ],
  },
  workshop: {
    id: 'workshop', name: '工坊广场', icon: 'gear', radius: 6,
    description: '铁砧、货箱与招牌凑在一处，工匠们自然就聚过来了。',
    kinds: ['anvil', 'crates', 'barrels', 'signflags', 'archlights', 'garden', 'well', 'fountain'],
    tiers: [
      { name: '广场初成', need: 4, distinct: 2, environment: 2, perk: '工匠有了歇脚的地方。' },
      { name: '丰收市集', need: 7, distinct: 3, environment: 0, unlocks: 'harvestpile', perk: '解锁纪念摆件「丰收堆」。' },
      { name: '工匠之乡', need: 10, distinct: 4, environment: 4, perk: '小镇以手艺出名。' },
    ],
  },
};

export const COLLECTION_IDS = Object.keys(COLLECTIONS) as CollectionId[];

/** How far along one style's best cluster is. */
export interface CollectionProgress {
  id: CollectionId;
  /** Decorations of this style within the best cluster found. */
  count: number;
  /** Distinct kinds among them. */
  distinct: number;
  /** Tiers reached, 0 to the number of tiers. */
  tier: number;
  /** The next tier still to reach, absent when the style is complete. */
  next: CollectionTier | null;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Finds the best cluster for one style. Every member of a cluster is a candidate centre, so
 * a cluster is measured where it actually is rather than from some arbitrary anchor.
 */
function bestCluster(kinds: readonly BuildingKind[], radius: number, buildings: readonly Building[]): { count: number; distinct: number } {
  const themed = buildings.filter(building => !building.damaged && kinds.includes(building.kind));
  let best = { count: 0, distinct: 0 };
  for (const centre of themed) {
    const near = themed.filter(building => distance(centre, building) <= radius);
    const variety = new Set(near.map(building => building.kind));
    const count = near.length;
    if (count > best.count || (count === best.count && variety.size > best.distinct)) best = { count, distinct: variety.size };
  }
  return best;
}

/** How many tiers of a style the town currently satisfies, ignoring what it already banked. */
function reachedTiers(definition: CollectionDefinition, buildings: readonly Building[]): number {
  const cluster = bestCluster(definition.kinds, definition.radius, buildings);
  let tier = 0;
  for (const candidate of definition.tiers) {
    if (cluster.count >= candidate.need && cluster.distinct >= candidate.distinct) tier++;
    else break;
  }
  return tier;
}

/**
 * Progress for every style. A tier already earned is never lost: tearing the flowers down
 * again does not revoke a reward the player has been given.
 */
export function collectionProgress(
  buildings: readonly Building[],
  completed: Partial<Record<CollectionId, number>>,
): CollectionProgress[] {
  return COLLECTION_IDS.map(id => {
    const definition = COLLECTIONS[id];
    const banked = Math.max(0, Math.min(definition.tiers.length, completed[id] ?? 0));
    const tier = Math.max(banked, reachedTiers(definition, buildings));
    return {
      id,
      ...bestCluster(definition.kinds, definition.radius, buildings),
      tier,
      next: definition.tiers[tier] ?? null,
    };
  });
}

/** Tiers the town has newly satisfied, so the caller can bank and announce them. */
export function newlyReached(
  progress: readonly CollectionProgress[],
  completed: Partial<Record<CollectionId, number>>,
): { id: CollectionId; tier: number }[] {
  const reached: { id: CollectionId; tier: number }[] = [];
  for (const entry of progress) {
    const banked = completed[entry.id] ?? 0;
    for (let tier = banked + 1; tier <= entry.tier; tier++) reached.push({ id: entry.id, tier });
  }
  return reached;
}

/** Combined permanent environment bonus from every style tier reached. */
export function collectionEnvironment(completed: Partial<Record<CollectionId, number>>): number {
  return COLLECTION_IDS.reduce((total, id) => {
    const tiers = COLLECTIONS[id].tiers;
    const banked = Math.max(0, Math.min(tiers.length, completed[id] ?? 0));
    return total + tiers.slice(0, banked).reduce((sum, tier) => sum + tier.environment, 0);
  }, 0);
}

/** Ornaments that a style tier makes buildable, keyed by the ornament. */
export const ORNAMENT_REQUIREMENTS: Partial<Record<BuildingKind, { id: CollectionId; tier: number }>> = {};
for (const id of COLLECTION_IDS) {
  COLLECTIONS[id].tiers.forEach((tier, index) => {
    if (tier.unlocks) ORNAMENT_REQUIREMENTS[tier.unlocks] = { id, tier: index + 1 };
  });
}

/** Which style a buildable ornament belongs to, or null for ordinary buildings. */
export function ornamentRequirement(kind: BuildingKind): { id: CollectionId; tier: number } | null {
  return ORNAMENT_REQUIREMENTS[kind] ?? null;
}
