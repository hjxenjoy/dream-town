import type { ResourceMap } from './data.ts';

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
  /** Coins and building materials handed back on collection. */
  rewardCoins: number;
  rewardMaterials: number;
  /** Seconds of travel at a level-1 market. */
  duration: number;
  /**
   * Which bridge the cart leaves by. Destinations going the same way down the valley share
   * a crossing, so this makes the way out visible without pretending all three differ.
   */
  bridge: 15 | 33;
  /** Research that must be known before this destination opens, if any. */
  technology?: 'tailoring' | 'viniculture' | 'metallurgy';
}

export type DestinationId = 'valley' | 'hilltown' | 'rivermouth';

export const DESTINATIONS: Record<DestinationId, CaravanDestination> = {
  valley: {
    id: 'valley',
    name: '溪谷集落',
    description: '河对岸最近的小村子，收面包、木板和鲜鱼，换回建材。',
    cargo: { bread: 6, plank: 4, fish: 5 },
    rewardCoins: 420, rewardMaterials: 8, duration: 120, bridge: 15,
  },
  hilltown: {
    id: 'hilltown',
    name: '山外集市',
    description: '翻过山口的大集，愿意为好布料出高价。路程远，回报也高。',
    cargo: { cloth: 5, clothing: 4, tools: 3 },
    rewardCoins: 900, rewardMaterials: 14, duration: 190, bridge: 33,
    technology: 'tailoring',
  },
  rivermouth: {
    id: 'rivermouth',
    name: '下游河港',
    description: '顺河而下的码头，船上的人识得好酒。从南面的桥出去，换回大量建材。',
    cargo: { wine: 5, cheese: 4, honey: 4 },
    rewardCoins: 1100, rewardMaterials: 22, duration: 240, bridge: 33,
    technology: 'viniculture',
  },
};

export const DESTINATION_IDS = Object.keys(DESTINATIONS) as DestinationId[];

export function destinationOf(id: DestinationId | undefined): CaravanDestination {
  return DESTINATIONS[id ?? 'valley'] ?? DESTINATIONS.valley;
}

/** Destinations the town may currently choose, given what it has researched. */
export function availableDestinations(researched: readonly string[]): CaravanDestination[] {
  return DESTINATION_IDS.map(id => DESTINATIONS[id])
    .filter(destination => !destination.technology || researched.includes(destination.technology));
}

/**
 * Journey length for a destination at a given market level. A better market shaves time off
 * every route, and the harbour project title shaves a further tenth off the lot.
 */
export function caravanDuration(destination: CaravanDestination, marketLevel: number, harborTitle: boolean): number {
  const base = destination.duration;
  const byMarket = Math.max(base * 0.5, base * (1 - (Math.max(1, marketLevel) - 1) * 0.2));
  return byMarket * (harborTitle ? 0.9 : 1);
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
