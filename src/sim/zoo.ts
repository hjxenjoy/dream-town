import type { ZooSpecies } from './data.ts';

/**
 * The zoo's animals, as the map draws them.
 *
 * The rules side (which species lives in which pen, what it eats, what it draws) lives in
 * `data.ts` and `world.ts`; this module only answers "which frame, how wide", so the renderer
 * and the tests read the same mapping. A species is looked up by the same id the enclosure's
 * `productionFocus` stores, so a pen always shows the animal it actually houses.
 */

/** Still portraits ship in the zoo pack, one frame per species, named after the animal. */
export const ZOO_STILL_ATLAS = 'zoo-expansion' as const;

/** The keeper and the feed cart are props of the same pack. */
export const ZOO_KEEPER_FRAME = 'zoo-keeper';
export const ZOO_FEED_FRAME = 'zoo-feed';

/**
 * The four-frame gaits shipped for these animals: two packs of two species each. (The sheep
 * and cattle gaits are `animal-walk-3`/`-4`, used by `livestock.ts`; nothing else walks.)
 */
const WALK_ATLASES: Record<ZooSpecies, 'animal-walk-1' | 'animal-walk-2'> = {
  elephant: 'animal-walk-1', giraffe: 'animal-walk-1',
  zebra: 'animal-walk-2', lion: 'animal-walk-2',
};

/** How many frames a shipped walk cycle has. */
export const ZOO_WALK_STEPS = 4;

/**
 * How wide each animal is drawn inside its enclosure, in world pixels.
 *
 * The four stills were cropped tight to their animals at four different scales — a giraffe's
 * cell is 176px wide, an elephant's 311 — so one shared fraction of the cell would draw a
 * giraffe a quarter of an elephant's width. Widths are therefore per species, and stills and
 * strides share them, so an animal never changes size when it starts walking.
 */
export const ZOO_WIDTH: Record<ZooSpecies, number> = {
  zebra: 44, giraffe: 32, elephant: 58, lion: 48,
};

/** How wide the keeper and the feed cart are drawn, in world pixels. */
export const ZOO_KEEPER_WIDTH = 30;
export const ZOO_FEED_WIDTH = 40;

export interface ZooFrame { atlas: typeof ZOO_STILL_ATLAS | 'animal-walk-1' | 'animal-walk-2'; frame: string; width: number }

/** The standing portrait of a species. Null for anything the pack did not ship. */
export function zooStill(species: string): ZooFrame | null {
  if (!(species in ZOO_WIDTH)) return null;
  return { atlas: ZOO_STILL_ATLAS, frame: species, width: ZOO_WIDTH[species as ZooSpecies] };
}

/**
 * A species mid-stride, from its four-frame gait. A step outside the cycle wraps, so a caller
 * can pass a free-running counter.
 */
export function zooWalk(species: string, step: number): ZooFrame | null {
  const still = zooStill(species);
  if (!still) return null;
  const leg = ((Math.floor(step) % ZOO_WALK_STEPS) + ZOO_WALK_STEPS) % ZOO_WALK_STEPS;
  return { atlas: WALK_ATLASES[species as ZooSpecies], frame: `${species}-walk-${leg + 1}`, width: still.width };
}
