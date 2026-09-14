import { BUILDINGS, type BuildingKind, type Resource } from './data.ts';
import { TownNavigation } from './navigation.ts';
import { tileKey, type Road, type Tile } from './roads.ts';

/**
 * How far a load may be carried before a workshop stops counting as locally supplied.
 *
 * Measured in **tiles a resident actually has to walk**, not in straight-line distance. A
 * supplier across the river or behind a block of buildings is genuinely further away than one
 * next door, and the player can count either distance on the map — which is what keeps this
 * rule legible instead of mysterious.
 */
export const LOCAL_SUPPLY_RANGE = 6;

/**
 * Processing time with the ingredients made right next door — the best case.
 *
 * Deliberately a time saving rather than an output increase: the town already stops producing
 * once a good reaches its stock target, so a faster workshop reaches the same target with less
 * of the day spent on it and frees the worker and the land sooner. That makes this a payoff for
 * laying the town out well, not another faucet.
 */
export const LOCAL_SUPPLY_FACTOR = 0.9;

/** The least a building has to expose to take part in the proximity rule. */
export interface Placed {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  /** A damaged building still stands in the way, but neither supplies nor consumes. */
  damaged?: boolean;
  /** A farm's crop decides what it actually makes; anything but wheat yields nothing storable. */
  crop?: string;
}

/**
 * What this building actually puts into the barn, which is not always its recipe.
 *
 * A farm is the case that matters: its card says it makes wheat, but a field switched to
 * carrots, grapes or apples sends those to the farm stall instead, so nothing storable is
 * produced and nothing downstream can be supplied from it. Reading the static recipe instead
 * would let a windmill keep its proximity bonus from a field that no longer grows wheat.
 */
function effectiveOutputs(building: Placed): string[] {
  if (building.damaged) return [];
  if (building.kind === 'farm') return !building.crop || building.crop === 'wheat' ? ['wheat'] : [];
  return Object.keys(BUILDINGS[building.kind].output ?? {});
}

/**
 * How much of the bonus a haul of this length earns: 1 next door, fading to 0 at the range.
 * Grading rather than a flat on/off reward is what makes "closer is better" true, and it is
 * the reason the haul is measured at all.
 */
export function supplyStrength(distance: number): number {
  if (!Number.isFinite(distance) || distance >= LOCAL_SUPPLY_RANGE) return 0;
  return (LOCAL_SUPPLY_RANGE - distance) / (LOCAL_SUPPLY_RANGE - 1);
}

/** The cycle-time multiplier earned by a haul of `distance` tiles. */
export function supplyFactor(distance: number): number {
  return 1 - (1 - LOCAL_SUPPLY_FACTOR) * supplyStrength(distance);
}

/**
 * Walking distance from every workshop to the nearest producer of anything it consumes.
 *
 * One breadth-first sweep per resource — seeded from every building that makes it — is far
 * cheaper than a path search per pair, and a dense town has hundreds of pairs. Tiles are
 * counted, ignoring the road preference the router uses to choose *which* way to go: the
 * criterion is how far the load travels, which is what a player can count.
 *
 * Callers pass the workshops that are actually standing; a damaged building neither hauls nor
 * receives.
 */
export function supplyHauls(
  buildings: readonly Placed[],
  roads: readonly Road[] = [],
  reach = LOCAL_SUPPLY_RANGE,
): Map<string, number> {
  // Every building blocks the walk, including a damaged one: a burnt shell is still a wall.
  // Only the economics ignores the damaged ones.
  const navigation = new TownNavigation([...buildings], [...roads]);
  const hauls = new Map<string, number>();

  // Producers grouped by what they output, so each sweep starts from all of them at once.
  const producersByResource = new Map<Resource, Placed[]>();
  for (const building of buildings) {
    for (const key of effectiveOutputs(building) as Resource[]) {
      const list = producersByResource.get(key);
      if (list) list.push(building); else producersByResource.set(key, [building]);
    }
  }

  for (const building of buildings) {
    if (building.damaged) continue;
    const inputs = Object.keys(BUILDINGS[building.kind].input ?? {}) as Resource[];
    if (!inputs.length) continue;
    let nearest = Infinity;
    for (const input of inputs) {
      const producers = producersByResource.get(input);
      if (!producers?.length) continue;
      const walked = haulFrom(navigation, producers, building, reach);
      // A workshop built right up against its neighbours can have no walkable ground touching
      // it at all. Rather than silently withdrawing the bonus from a town that merely packed
      // its industry tightly, fall back to how close the supplier actually is: the rule then
      // never says less than the straight line did, it only ever adds what the walk reveals.
      // Rounded up, because the whole rule is counted in tiles and a carrier cannot walk a
      // fraction of one — leaving 1.414 in the reading would also print as "走 1.414214 格" on
      // the building card.
      const direct = walked === Infinity && !navigation.entrances(building).length
        ? Math.ceil(Math.min(...producers.filter(p => p.id !== building.id).map(p => Math.hypot(p.x - building.x, p.y - building.y)), Infinity))
        : walked;
      nearest = Math.min(nearest, direct);
      if (nearest <= 1) break;
    }
    if (Number.isFinite(nearest)) hauls.set(building.id, nearest);
  }
  return hauls;
}

/**
 * Tiles a carrier walks from the nearest of `sources` to this building's wall, capped at
 * `reach`.
 *
 * Seeded at distance zero from every walkable door of every source, and satisfied the moment a
 * walked tile touches the target, so the load is delivered to whichever side is reachable.
 *
 * Buildings packed shoulder to shoulder therefore have a *longer* haul than the same pair with a
 * gap between them, because the carrier has to walk around — which is visible on the map, and
 * the whole reason for measuring the walk rather than the straight line.
 */
function haulFrom(navigation: TownNavigation, sources: readonly Placed[], target: Placed, reach: number): number {
  const goal = tileKey(target);
  const seen = new Set<string>();
  let frontier: Tile[] = [];
  for (const source of sources) {
    if (source.id === target.id) continue;
    for (const door of navigation.entrances(source)) {
      const key = tileKey(door);
      if (seen.has(key)) continue;
      seen.add(key);
      frontier.push(door);
    }
  }
  const touches = (tile: Tile) => tileKey({ x: tile.x + 1, y: tile.y }) === goal
    || tileKey({ x: tile.x - 1, y: tile.y }) === goal
    || tileKey({ x: tile.x, y: tile.y + 1 }) === goal
    || tileKey({ x: tile.x, y: tile.y - 1 }) === goal;
  for (let walked = 1; walked <= reach + 1 && frontier.length; walked++) {
    const next: Tile[] = [];
    for (const tile of frontier) {
      if (touches(tile)) return walked;
      for (const neighbour of [{ x: tile.x + 1, y: tile.y }, { x: tile.x - 1, y: tile.y }, { x: tile.x, y: tile.y + 1 }, { x: tile.x, y: tile.y - 1 }]) {
        const key = tileKey(neighbour);
        if (seen.has(key) || !navigation.canWalk(neighbour)) continue;
        seen.add(key);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return Infinity;
}
