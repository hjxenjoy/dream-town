import { TownNavigation } from './navigation.ts';
import { BRIDGES, MAP_SIZE, terrainAt } from './terrain.ts';
import type { Tile } from './roads.ts';
import type { Building, Caravan } from './world.ts';

/** Cart art lives in the `caravan` atlas: three load states, two travel and two park frames. */
export type CartLoad = 'empty' | 'loaded' | 'unloading';
export const CART_TRAVEL_FRAMES: Record<CartLoad, readonly [string, string]> = {
  empty: ['empty-travel-0', 'empty-travel-1'],
  loaded: ['loaded-travel-0', 'loaded-travel-1'],
  unloading: ['unloading-travel-0', 'unloading-travel-1'],
};
export const CART_PARK_FRAMES: Record<CartLoad, readonly [string, string]> = {
  empty: ['empty-park-0', 'empty-park-1'],
  loaded: ['loaded-park-0', 'loaded-park-1'],
  unloading: ['unloading-park-0', 'unloading-park-1'],
};

/** How far from the market the cart is drawn, and in which load state. */
export interface CartPose {
  x: number;
  y: number;
  load: CartLoad;
  moving: boolean;
  /** True while the cart is parked at the market with goods to hand over. */
  waiting: boolean;
  /** Which way along the route the cart is facing. */
  direction: 'out' | 'back' | 'none';
}

/**
 * The outbound road: market entrance -> nearest bridge -> the far bank, so the
 * cart is seen crossing the river rather than teleporting off the map edge.
 */
export function caravanRoute(
  buildings: Building[],
  roads: { x: number; y: number; kind: string }[],
  /** The bridge this route must cross, so each destination takes a visibly different way. */
  bridgeRow?: number,
): Tile[] {
  const market = buildings.find(building => building.kind === 'market');
  if (!market) return [];
  const navigation = new TownNavigation(buildings, roads as never);
  const gate = navigation.entrances({ x: market.x, y: market.y })[0];
  if (!gate) return [];

  const usable = BRIDGES.includes(bridgeRow as never) ? [bridgeRow!] : [...BRIDGES];
  const crossings = usable
    .map(row => bridgeSpan(row))
    .filter((span): span is { deck: Tile[] } => span !== null)
    .sort((a, b) => Math.abs(a.deck[0]!.y - market.y) - Math.abs(b.deck[0]!.y - market.y));

  for (const crossing of crossings) {
    // Three parts: to the near bank, across the deck, then on to the far bank. Asking A*
    // for a point on the far bank alone is not enough: it takes whichever bridge is
    // cheapest, so a route told to use the southern bridge would cross the northern one
    // and merely walk south afterwards.
    const west = crossing.deck[0]!;
    const east = crossing.deck[crossing.deck.length - 1]!;
    const toBridge = navigation.path(gate, west);
    if (toBridge.length < 2) continue;
    const onward = navigation.path(east, farBank(west.y));
    if (onward.length < 2) continue;
    return [...toBridge, ...crossing.deck.slice(1), ...onward.slice(1)];
  }
  // No crossing is reachable: the cart still sets out along whatever road it can find.
  const fallback = navigation.path(gate, { x: Math.max(1, market.x + 12), y: market.y });
  return fallback.length > 1 ? fallback : [];
}

/** The contiguous deck tiles of a bridge, west to east. */
function bridgeSpan(row: number): { deck: Tile[] } | null {
  const deck: Tile[] = [];
  for (let x = 1; x < MAP_SIZE; x++) if (terrainAt(x, row) === 'bridge') deck.push({ x, y: row });
  return deck.length > 1 ? { deck } : null;
}

/** A walkable tile on the far bank, at the same latitude as the crossing. */
function farBank(row: number): Tile {
  for (let x = MAP_SIZE - 3; x > 25; x--) if (terrainAt(x, row) === 'land') return { x, y: row };
  return { x: MAP_SIZE - 3, y: row };
}

/**
 * Position along the route. The outbound half walks the route forward, the
 * inbound half walks it back, so the same road is visibly travelled both ways.
 */
export function caravanPose(caravan: Caravan, route: Tile[], gameTime: number): CartPose {
  // Without a reachable road the cart waits at the market rather than wandering.
  const start = route[0] ?? { x: 0, y: 0 };
  if (caravan.status === 'idle') return { x: start.x, y: start.y, load: 'empty', moving: false, waiting: false, direction: 'none' };
  if (caravan.status === 'returned') return { x: start.x, y: start.y, load: 'unloading', moving: false, waiting: true, direction: 'none' };
  if (route.length < 2) return { x: start.x, y: start.y, load: 'loaded', moving: false, waiting: false, direction: 'none' };

  const remaining = Math.max(0, caravan.returnAt - gameTime);
  const progress = Math.min(1, Math.max(0, 1 - remaining / Math.max(1, caravan.duration)));
  const outbound = progress < 0.5;
  const along = (outbound ? progress : 1 - progress) * 2;
  const index = along * (route.length - 1);
  const step = Math.min(route.length - 1, Math.floor(index));
  const from = route[step]!;
  const to = route[Math.min(route.length - 1, step + 1)]!;
  const t = index - step;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    load: 'loaded',
    moving: true,
    waiting: false,
    direction: outbound ? 'out' : 'back',
  };
}
