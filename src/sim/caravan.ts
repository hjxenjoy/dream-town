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
export function caravanRoute(buildings: Building[], roads: { x: number; y: number; kind: string }[]): Tile[] {
  const market = buildings.find(building => building.kind === 'market');
  if (!market) return [];
  const navigation = new TownNavigation(buildings, roads as never);
  const gate = navigation.entrances({ x: market.x, y: market.y })[0];
  if (!gate) return [];
  const bridge = BRIDGES.map(row => ({ x: 23, y: row })).sort((a, b) => Math.abs(a.y - market.y) - Math.abs(b.y - market.y))[0]!;
  // The far bank is partly mountain, so walk outward until a walkable tile turns up.
  let far: Tile | null = null;
  for (let x = MAP_SIZE - 3; x > 25 && !far; x--) if (terrainAt(x, bridge.y) === 'land') far = { x, y: bridge.y };
  if (far) {
    const toFar = navigation.path(gate, far);
    if (toFar.length > 1) return toFar;
  }
  // Without a crossing, the cart still sets out along whatever road it can reach.
  const fallback = navigation.path(gate, { x: Math.max(1, market.x + 12), y: market.y });
  return fallback.length > 1 ? fallback : [];
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
