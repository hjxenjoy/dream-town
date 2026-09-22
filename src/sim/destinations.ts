import type { ResourceMap } from './data.ts';
import { noise } from './noise.ts';

/**
 * The towns beyond the river. Each has its own cargo, journey length and reward, and its
 * own bridge to cross, so choosing a destination is a real decision about what to send and
 * where it goes rather than a re-skin of the same trip.
 */
export interface CaravanDestination {
  id: DestinationId;
  name: string;
  description: string;
  /** What the caravan carries out. */
  cargo: Partial<ResourceMap>;
  /** Coins handed back on collection. */
  rewardCoins: number;
  /**
   * The goods handed back on collection. Land routes bring building materials; the island
   * voyages bring specialities this town cannot make at all, which is what `docs/02` §4 says
   * a ship is for. One field carries both, so "what comes home" has a single answer.
   */
  rewardItems: Partial<ResourceMap>;
  /** Seconds of travel at a level-1 market. */
  duration: number;
  /**
   * Which bridge the cart leaves by. Destinations going the same way down the valley share
   * a crossing, so this makes the way out visible without pretending all three differ.
   */
  bridge: 15 | 33;
  /** Research that must be known before this destination opens, if any. */
  technology?: 'tailoring' | 'viniculture' | 'metallurgy' | 'husbandry';
  /**
   * The chance of being waylaid on this road, before any guard is posted. `docs/06` §2 asks for
   * exactly this on the long routes — 远行商队：高回报高风险（遇强盗概率，需护卫） — and the short hop
   * to the next village is the road that never needed guarding.
   */
  risk: number;
  /**
   * True for the sea routes. They sail from the harbour rather than driving out of the market,
   * so a voyage is drawn with a ship and only opens once a harbour stands.
   */
  island?: true;
  /** A sea voyage needs a harbour before it can be chosen. */
  needsHarbor?: true;
}

export type DestinationId =
  | 'valley' | 'hilltown' | 'rivermouth'
  | 'fruitisland' | 'oliveisland' | 'tropicalisland' | 'fisherisland';

export const DESTINATIONS: Record<DestinationId, CaravanDestination> = {
  valley: {
    id: 'valley',
    name: '溪谷集落',
    description: '河对岸最近的小村子，收面包、木板和鲜鱼，换回建材。',
    cargo: { bread: 6, plank: 4, fish: 5 },
    rewardCoins: 420, rewardItems: { materials: 8 }, duration: 120, bridge: 15, risk: 0,
  },
  hilltown: {
    id: 'hilltown',
    name: '山外集市',
    description: '翻过山口的大集，愿意为好布料出高价。路程远，回报也高。',
    cargo: { cloth: 5, clothing: 4, tools: 3 },
    rewardCoins: 900, rewardItems: { materials: 14 }, duration: 190, bridge: 33, risk: 0.18,
    technology: 'tailoring',
  },
  rivermouth: {
    id: 'rivermouth',
    name: '下游河港',
    description: '顺河而下的码头，船上的人识得好酒。从南面的桥出去，换回大量建材。',
    cargo: { wine: 5, cheese: 4, honey: 4 },
    rewardCoins: 1100, rewardItems: { materials: 22 }, duration: 240, bridge: 33, risk: 0.3,
    technology: 'viniculture',
  },
  // The four islands of docs/02 §4. Each brings back what the valley cannot grow, and each
  // takes finished goods to trade for them. Grape and fish are deliberately absent from the
  // lists the design gives (olive island sails for 葡萄, fisher island for 鱼): this town can
  // make both, and a speciality is only special if it cannot be made here.
  fruitisland: {
    id: 'fruitisland',
    name: '水果岛', description: '乘船去南边的果园岛，那里结满河谷种不出的果子。走水路的船，比陆路慢得多。',
    cargo: { jam: 4, flowers: 6 },
    rewardCoins: 1300, rewardItems: { peach: 3, watermelon: 3, plum: 2 }, duration: 300, bridge: 33, risk: 0.32,
    island: true, needsHarbor: true, technology: 'husbandry',
  },
  oliveisland: {
    id: 'oliveisland',
    name: '橄榄岛', description: '阳光充足的坡地岛，橄榄与青柠是那里的特产，别处买不到。',
    cargo: { wine: 4, cheese: 4 },
    rewardCoins: 1450, rewardItems: { olive: 3, lime: 3 }, duration: 330, bridge: 33, risk: 0.34,
    island: true, needsHarbor: true, technology: 'viniculture',
  },
  tropicalisland: {
    id: 'tropicalisland',
    name: '热带岛', description: '风暖水清的小岛，香蕉、椰子与菠萝一箱箱装回来。',
    cargo: { honey: 5, plank: 6 },
    rewardCoins: 1600, rewardItems: { banana: 3, coconut: 3, pineapple: 2 }, duration: 360, bridge: 33, risk: 0.36,
    island: true, needsHarbor: true, technology: 'viniculture',
  },
  fisherisland: {
    id: 'fisherisland',
    name: '渔人岛', description: '礁石边的渔村，鲜虾与龙虾是他们的拿手，船上要备厚衣服换。',
    cargo: { clothing: 4, tools: 3 },
    rewardCoins: 1750, rewardItems: { shrimp: 3, lobster: 2 }, duration: 390, bridge: 33, risk: 0.38,
    island: true, needsHarbor: true, technology: 'tailoring',
  },
};

export const DESTINATION_IDS = Object.keys(DESTINATIONS) as DestinationId[];

export function destinationOf(id: DestinationId | undefined): CaravanDestination {
  return DESTINATIONS[id ?? 'valley'] ?? DESTINATIONS.valley;
}

/** Destinations the town may currently choose, given what it has researched. */
export function availableDestinations(researched: readonly string[], hasHarbor = false): CaravanDestination[] {
  return DESTINATION_IDS.map(id => DESTINATIONS[id])
    .filter(destination => !destination.technology || researched.includes(destination.technology))
    .filter(destination => !destination.needsHarbor || hasHarbor);
}

/** The land routes only, which are what the guard line and the risk readout care about. */
export const LAND_DESTINATION_IDS = DESTINATION_IDS.filter(id => !DESTINATIONS[id].island);

/**
 * Journey length for a destination at a given market level. A better market shaves time off
 * every route, and the harbour project title shaves a further tenth off the lot.
 */
export function caravanDuration(destination: CaravanDestination, marketLevel: number, harborTitle: boolean): number {
  const base = destination.duration;
  const byMarket = Math.max(base * 0.5, base * (1 - (Math.max(1, marketLevel) - 1) * 0.2));
  return byMarket * (harborTitle ? 0.9 : 1);
}

/**
 * What each kind of guard is worth against a raid on the road, when it stands where the
 * caravans leave from. A post covers the near road, a barracks the district, and a castle the
 * whole approach — which is what makes the guard line worth building a second time, for the
 * trade rather than for the town.
 */
export const GUARD_SHARES = { guardpost: 0.15, barracks: 0.3, castle: 0.45 } as const;
/** However well guarded, a long road is never entirely safe. */
export const MAX_GUARD_COVER = 0.85;

/** The chance a caravan is waylaid, given the route and what is guarding its way out. */
export function raidChance(destination: CaravanDestination, guardCover: number): number {
  const covered = Math.min(MAX_GUARD_COVER, Math.max(0, guardCover));
  return destination.risk * (1 - covered);
}

/**
 * Whether this particular trip is waylaid. Decided from the trip's own counters rather than a
 * die roll, so it survives a reload and settles the same way offline — the same reasoning the
 * harvest quote already uses.
 */
export function tripRaided(chance: number, seed: number): boolean {
  if (chance <= 0) return false;
  return noise(seed) < chance;
}

/** Whether the town can load a given cargo right now, item by item. */
export function missingCargo(
  destination: CaravanDestination,
  held: Partial<ResourceMap>,
): Partial<ResourceMap> {
  const missing: Partial<ResourceMap> = {};
  for (const [key, amount] of Object.entries(destination.cargo) as [keyof ResourceMap, number][]) {
    const have = held[key] ?? 0;
    if (have < amount) missing[key] = amount - have;
  }
  return missing;
}

/**
 * How many caravans the town may run at once, as `docs/06` §2 specifies: the count grows with
 * the market and with standing, under a hard ceiling of four. Selling the market leaves the
 * town able to run fewer, but a caravan already on the road is never cancelled by that.
 */
export const CARAVAN_SLOT_LIMIT = 4;
/** Standing needed before the market alone cannot justify one more cart. */
export const CARAVAN_STANDING_FOR_EXTRA = 40;

export function caravanSlots(marketLevel: number, prestige: number): number {
  const byMarket = Math.max(1, Math.min(3, marketLevel));
  return Math.min(CARAVAN_SLOT_LIMIT, byMarket + (prestige >= CARAVAN_STANDING_FOR_EXTRA ? 1 : 0));
}
