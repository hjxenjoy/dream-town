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
 * The carriage, as a share of the batch rather than a number of seconds.
 *
 * This is deliberately a *factor* and not an added leg. Every other thing that changes a cycle
 * time — research, honours, project titles, seasons, the proximity bonus above — multiplies it,
 * and an added leg would quietly break each of their promises: efficiency's "-10% to every
 * workshop" would come out as "-10% of the recipe only", and the town's own cards would be
 * wrong. Keeping the carriage multiplicative means the journeys compose with everything else
 * instead of quietly eroding it.
 */
export const FREIGHT_REACH = 18;

/** The most of a batch the load's journey can take — the same order as the proximity bonus. */
export const FREIGHT_MAX_SHARE = 0.18;

/** The share of a batch spent waiting for the load: proportional to the walk, capped. */
export function freightShare(distance: number): number {
  // No supplier at all means no journey and no wait. A workshop in that state is already
  // refused the proximity bonus and stopped for want of its ingredients.
  if (!Number.isFinite(distance)) return 0;
  return Math.min(Math.max(distance, 0) / FREIGHT_REACH, 1) * FREIGHT_MAX_SHARE;
}

/** The cycle-time multiplier a load of this length costs. Never a bonus, never a punishment. */
export function freightFactor(distance: number): number {
  return 1 + freightShare(distance);
}

/**
 * The most of the day a resident will spend walking to work, however far away they live.
 *
 * Kept in the same order as the proximity bonus — about a tenth — so that "put the work near the
 * homes" and "put the suppliers near the workshop" pull with comparable force.
 */
export const COMMUTE_MAX_SHARE = 0.12;

/** How far a commute is followed: past this the layout is not tight, it is broken. */
export const COMMUTE_REACH = 18;

/**
 * The share of the working day a resident spends walking to work.
 *
 * A share of the day rather than a duration, because it applies to the whole day: a worker who
 * walks a tenth of the day does not lose a tenth of one batch, they lose a tenth of every batch.
 * Capped, so a town that puts its homes clear across the map is slow but never stalled.
 */
export function commuteShare(distance: number, reach = COMMUTE_REACH): number {
  if (!Number.isFinite(distance)) return 0;
  return Math.min(Math.max(distance, 0) / reach, 1) * COMMUTE_MAX_SHARE;
}

/** The cycle-time multiplier a commute of this length costs — always at least 1. */
export function commuteFactor(distance: number): number {
  // Walking is time not at the bench, so the same work takes proportionally longer.
  return 1 / (1 - commuteShare(distance));
}

/**
 * Walking distance from every workplace to the nearest home.
 *
 * One sweep seeded from every home at once, so the cost does not grow with the pair count.
 *
 * This is a purely geographic reading, so — like `supplyHauls` — it deliberately does NOT skip
 * damaged buildings. A burnt house still shelters the people who live in it, and treating it as
 * gone would let a fire shorten everyone's walk: a disaster quietly granting a production bonus,
 * which is exactly the bug the haul rule already had to be fixed for once.
 */
export function commuteDistances(buildings: readonly Placed[], roads: readonly Road[] = [], reach = COMMUTE_REACH): Map<string, number> {
  const navigation = new TownNavigation([...buildings], [...roads]);
  const homes = buildings.filter(building => BUILDINGS[building.kind].housing);
  const distances = new Map<string, number>();
  if (!homes.length) return distances;

  // Every workplace's own tile and doors, worked out once rather than per step.
  const workplaces = buildings
    .filter(building => BUILDINGS[building.kind].workers)
    .map(building => ({ id: building.id, tiles: [tileKey(building), ...navigation.entrances(building).map(tileKey)] }));

  const seen = new Set<string>();
  let frontier: Tile[] = [];
  for (const home of homes) for (const door of navigation.entrances(home)) {
    const key = tileKey(door);
    if (seen.has(key)) continue;
    seen.add(key); frontier.push(door);
  }

  let steps = 0;
  while (frontier.length && steps <= reach) {
    steps++;
    for (const workplace of workplaces) {
      if (distances.has(workplace.id)) continue;
      // A workplace counts as reached when the walk touches its tile or any of its doors — the
      // same reading `haulFrom` uses for a delivery.
      if (workplace.tiles.some(key => seen.has(key))) distances.set(workplace.id, steps);
    }
    const next: Tile[] = [];
    for (const tile of frontier) for (const neighbour of navigation.entrances(tile)) {
      const key = tileKey(neighbour);
      if (seen.has(key)) continue;
      seen.add(key); next.push(neighbour);
    }
    frontier = next;
  }
  // A workplace the walk never reaches is the worst case, not a free pass: residents cannot get
  // there in a reasonable time, so the day's walking is as bad as it gets. Only a town with no
  // homes at all is left unmeasured — there is no commute to speak of.
  for (const workplace of workplaces) {
    if (!distances.has(workplace.id)) distances.set(workplace.id, reach + 1);
  }
  return distances;
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

/**
 * Walking distance from EVERY home to every workplace, one sweep per home.
 *
 * The nearest-home reading above is enough for "is this workshop near the homes", but a resident
 * walks from their OWN house, and once the walk costs time (see `commuteShare`) that difference is
 * the whole point: a workshop whose actual workers live across town should pay for it, even if a
 * cottage happens to stand next door.
 *
 * One sweep per home, each capped at `reach`, so the cost is per house rather than per pair. A
 * dense town has tens of homes, and this is cached against the layout like every other sweep here.
 */
export function commuteByHome(buildings: readonly Placed[], roads: readonly Road[] = [], reach = COMMUTE_REACH): Map<string, Map<string, number>> {
  const navigation = new TownNavigation([...buildings], [...roads]);
  const homes = buildings.filter(building => BUILDINGS[building.kind].housing);
  const workplaces = buildings
    .filter(building => BUILDINGS[building.kind].workers)
    .map(building => ({ id: building.id, tiles: [tileKey(building), ...navigation.entrances(building).map(tileKey)] }));
  const byHome = new Map<string, Map<string, number>>();
  if (!homes.length) return byHome;

  for (const home of homes) {
    const reached = new Map<string, number>();
    const seen = new Set<string>();
    let frontier: Tile[] = [];
    for (const door of navigation.entrances(home)) {
      const key = tileKey(door);
      if (seen.has(key)) continue;
      seen.add(key); frontier.push(door);
    }
    let steps = 0;
    while (frontier.length && steps <= reach) {
      steps++;
      for (const workplace of workplaces) {
        if (reached.has(workplace.id)) continue;
        if (workplace.tiles.some(key => seen.has(key))) reached.set(workplace.id, steps);
      }
      const next: Tile[] = [];
      for (const tile of frontier) for (const neighbour of navigation.entrances(tile)) {
        const key = tileKey(neighbour);
        if (seen.has(key)) continue;
        seen.add(key); next.push(neighbour);
      }
      frontier = next;
    }
    byHome.set(home.id, reached);
  }
  return byHome;
}
