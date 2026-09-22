import { BUILDINGS } from './data.ts';
import { NEIGHBOURS } from './residents.ts';
import type { Building } from './world.ts';

/**
 * The town's residents, one at a time.
 *
 * `docs/07` §2 puts a `citizens[]` array in the save, each with a home, a job, their needs and
 * their own happiness, and `docs/12` §二.2 wants the individual layer to be more than scenery.
 * This is that roster, and it is authoritative: the town's population is how many citizens there
 * are, a workshop's hands are the citizens assigned to it, and the walk to work is the walk
 * THEIR home makes — not the nearest one's.
 *
 * The twelve named neighbours from `residents.ts` are the first twelve citizens, so a name in
 * the story panel points at a person who really lives somewhere and really works somewhere. The
 * rest are unnamed residents; the game's direction is few names and few taps, so a town of sixty
 * does not need sixty portraits to be a town of people.
 *
 * Assignments are HELD, not recomputed. That is the whole point of persisting them: under the
 * old derived roster, building one more cottage could move everyone's job and home, and a
 * resident's commute would change for a reason that had nothing to do with them.
 */
export interface Citizen {
  id: string;
  /** Present for the named neighbours; the rest are simply residents. */
  name?: string;
  portrait?: string;
  /** The house they live in, or null while the town has no bed for them. */
  homeId: string | null;
  /** The workshop they staff, or null while they are idle. */
  workId: string | null;
  /** When they arrived, in game seconds, so the panel can tell who is new. */
  since: number;
}

/** The bed capacity of one house, which its level raises. */
export function bedsIn(building: Building): number {
  return (BUILDINGS[building.kind].housing ?? 0) * building.level;
}

/**
 * A roster for a save written before citizens existed: as many residents as the town reports,
 * named ones first. Standing at game time zero keeps them all equally "old".
 */
export function rosterFromPopulation(population: number): Citizen[] {
  return Array.from({ length: Math.max(0, Math.floor(population)) }, (_, index) => {
    const neighbour = NEIGHBOURS[index];
    return {
      id: neighbour ? `citizen-${neighbour.portrait}` : `citizen-${index + 1}`,
      ...(neighbour ? { name: neighbour.name, portrait: neighbour.portrait } : {}),
      homeId: null, workId: null, since: 0,
    };
  });
}

/**
 * One new citizen, named if there is a neighbour left to introduce.
 *
 * The arrival time is floored: the town's clock runs in fractional seconds because offline
 * settlement and the frame accumulator both feed it, and an arrival is an instant rather than a
 * measurement — a resident does not move in at 180.5 seconds past the founding.
 */
export function newbornCitizen(citizens: readonly Citizen[], gameTime: number): Citizen {
  const since = Math.max(0, Math.floor(gameTime));
  const used = new Set(citizens.map(citizen => citizen.portrait).filter(Boolean));
  const next = NEIGHBOURS.find(neighbour => !used.has(neighbour.portrait));
  if (next) return { id: `citizen-${next.portrait}`, name: next.name, portrait: next.portrait, homeId: null, workId: null, since };
  // Unnamed residents are numbered from the count, which stays unique because citizens only leave
  // from the end of the list.
  const numbers = citizens.map(citizen => Number(/^citizen-(\d+)$/.exec(citizen.id)?.[1] ?? 0));
  const nextNumber = Math.max(0, ...numbers) + 1;
  return { id: `citizen-${nextNumber}`, homeId: null, workId: null, since };
}

/**
 * Settles everyone into a bed.
 *
 * Two rules, and the difference between them matters. A resident KEEPS the house they were given
 * for as long as it still stands — including while it is burnt and being repaired, because a ruin
 * still shelters the people living in it, and re-homing them on a fire would move every worker's
 * walk for a reason that has nothing to do with them. New arrivals, by contrast, are only put in
 * a house that is actually usable: the town may not settle anyone into a ruin.
 *
 * A house that is torn down is a different case: the residents have to be re-housed, and if the
 * town has no bed left they are homeless until it builds one.
 */
function settle(citizens: Citizen[], homes: Building[], beds: Building[]): { homeId: string | null }[] {
  const holds = new Map<string, number>();
  for (const citizen of citizens) {
    if (citizen.homeId && homes.some(home => home.id === citizen.homeId)) {
      holds.set(citizen.homeId, (holds.get(citizen.homeId) ?? 0) + 1);
    }
  }
  return citizens.map(citizen => {
    if (citizen.homeId && homes.some(home => home.id === citizen.homeId)) return { homeId: citizen.homeId };
    const free = beds.find(home => (holds.get(home.id) ?? 0) < bedsIn(home));
    if (!free) return { homeId: null };
    holds.set(free.id, (holds.get(free.id) ?? 0) + 1);
    return { homeId: free.id };
  });
}

/**
 * Settles every citizen into a house and a job, and reports what changed.
 *
 * Jobs are filled from `counts`, which the caller has already decided in the town's own order of
 * what it cannot do without — this function only decides WHICH citizen fills which slot, and it
 * holds that choice: a citizen keeps their workshop unless it is gone or has shrunk past them.
 */
export function settleCitizens(
  citizens: readonly Citizen[],
  buildings: readonly Building[],
  counts: ReadonlyMap<string, number>,
): { citizens: Citizen[]; moved: string[] } {
  // Every house that still stands, for the people who already live in one...
  const homes = buildings
    .filter(building => BUILDINGS[building.kind].housing)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  // ...and only the usable ones for anybody who still needs a bed.
  const beds = homes.filter(home => !home.damaged);
  const workplaces = buildings
    .filter(building => (counts.get(building.id) ?? 0) > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const placed = settle([...citizens], homes, beds);
  const filled = new Map<string, number>();
  const next: Citizen[] = [];

  // First pass: everyone keeps the job they already hold, if it still exists and still has room.
  // Keeping is what makes a resident's commute stable, which is what makes it theirs.
  for (const [index, citizen] of citizens.entries()) {
    const home = placed[index]!;
    const holds = citizen.workId !== null
      && workplaces.some(workplace => workplace.id === citizen.workId)
      && (filled.get(citizen.workId) ?? 0) < (counts.get(citizen.workId) ?? 0);
    const workId = holds ? citizen.workId : null;
    if (workId !== null) filled.set(workId, (filled.get(workId) ?? 0) + 1);
    next.push({ ...citizen, homeId: home.homeId, workId });
  }

  // Second pass: the idle take the slots still open, in the town's own order of what it cannot do
  // without — but a resident whose trade this workshop IS gets first refusal. Otherwise the names
  // would mean nothing: 陈酿 would be as likely to end up in the quarry as in the winery, and the
  // coincidence that they matched before was only because the old roster derived it that way.
  const trade = (citizen: Citizen) => NEIGHBOURS.find(neighbour => neighbour.portrait === citizen.portrait)?.workplace;
  const idle = next.filter(citizen => citizen.workId === null);
  const kindOf = (id: string) => buildings.find(building => building.id === id)?.kind;
  // Every trade claims its own shop before anybody takes a leftover slot. Filling one workplace
  // at a time instead let an early shop's fallback pick grab the carpenter on its way past, and
  // he would then find his own sawmill already full — the same class of mistake as choosing the
  // assignment order by build order.
  for (const workplace of workplaces) {
    const room = (counts.get(workplace.id) ?? 0) - (filled.get(workplace.id) ?? 0);
    if (room <= 0) continue;
    const kind = kindOf(workplace.id);
    for (let taken = 0; taken < room; taken++) {
      const candidate = idle.find(citizen => citizen.workId === null && kind !== undefined && trade(citizen) === kind);
      if (!candidate) break;
      candidate.workId = workplace.id;
    }
  }
  // Then whoever is left fills whatever is left, in the town's own priority order.
  for (const workplace of workplaces) {
    const room = (counts.get(workplace.id) ?? 0) - (filled.get(workplace.id) ?? 0);
    if (room <= 0) continue;
    const already = next.filter(citizen => citizen.workId === workplace.id).length;
    for (let taken = already; taken < room; taken++) {
      const candidate = idle.find(citizen => citizen.workId === null);
      if (!candidate) break;
      candidate.workId = workplace.id;
    }
  }

  const moved = next
    .filter((citizen, index) => citizen.homeId !== citizens[index]!.homeId || citizen.workId !== citizens[index]!.workId)
    .map(citizen => citizen.id);
  return { citizens: next, moved };
}

/**
 * A citizen line as it stands in a save. Checked rather than trusted: an id that repeats, a
 * home that is not a building, or a fractional arrival time is a corrupted roster.
 */
export function validCitizens(value: unknown, buildings: readonly Building[] | undefined): boolean {
  // A validator must never throw on malformed input: an absent building list is a corrupt save,
  // not a reason to crash while reading one.
  if (!Array.isArray(value) || !Array.isArray(buildings)) return false;
  const ids = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const citizen = entry as Citizen;
    if (typeof citizen.id !== 'string' || !citizen.id || ids.has(citizen.id)) return false;
    ids.add(citizen.id);
    if (citizen.name !== undefined && typeof citizen.name !== 'string') return false;
    if (citizen.portrait !== undefined && typeof citizen.portrait !== 'string') return false;
    if (citizen.homeId !== null && typeof citizen.homeId !== 'string') return false;
    if (citizen.workId !== null && typeof citizen.workId !== 'string') return false;
    if (citizen.homeId !== null && !buildings.some(building => building.id === citizen.homeId)) return false;
    if (citizen.workId !== null && !buildings.some(building => building.id === citizen.workId)) return false;
    if (!Number.isInteger(citizen.since) || citizen.since < 0) return false;
  }
  return true;
}

/** How many citizens each workshop holds, which is what `building.workers` is written from. */
export function workCounts(citizens: readonly Citizen[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const citizen of citizens) {
    if (citizen.workId === null) continue;
    counts.set(citizen.workId, (counts.get(citizen.workId) ?? 0) + 1);
  }
  return counts;
}

/** How many residents each house shelters, for the panel and for the beds check. */
export function homeCounts(citizens: readonly Citizen[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const citizen of citizens) {
    if (citizen.homeId === null) continue;
    counts.set(citizen.homeId, (counts.get(citizen.homeId) ?? 0) + 1);
  }
  return counts;
}

/**
 * The average walk to work of the citizens who actually staff this building.
 *
 * From THEIR houses, not from the nearest one: a workshop staffed by people who live across the
 * river pays for the walk they really make. A citizen whose house the walk never reaches, or who
 * has no house, counts as the worst case rather than being dropped — otherwise a town that housed
 * nobody would look like a town with no commute at all.
 */
export function commuteOfWorkplace(
  citizens: readonly Citizen[],
  workplaceId: string,
  byHome: Map<string, Map<string, number>>,
  reach: number,
): number {
  const staff = citizens.filter(citizen => citizen.workId === workplaceId);
  if (!staff.length) return reach + 1;
  const worst = reach + 1;
  const total = staff.reduce((sum, citizen) => {
    const walked = citizen.homeId === null ? undefined : byHome.get(citizen.homeId)?.get(workplaceId);
    return sum + (typeof walked === 'number' ? walked : worst);
  }, 0);
  return total / staff.length;
}
