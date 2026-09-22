import { RESOURCE_KEYS, effectiveRecipe, emptyResources, type ResourceMap } from './data.ts';
import type { SimState } from './world.ts';

// Reserve most shelf space for construction and food. Intermediates need only a
// working buffer: more farms should increase throughput, not their share of storage.
const WEIGHTS: ResourceMap = {
  flowers:2,fruit:3,eggs:3,jam:2,
  wood: 20, stone: 10, wheat: 8, flour: 5, bread: 8, fish: 8, plank: 10,
  materials: 6, ore: 5, charcoal: 3, ingot: 3, tools: 4, feed: 3, wool: 3, cloth: 3, clothing: 4,
  // Dairy, honey and wine keep smaller working buffers than construction or staple food.
  milk: 3, cheese: 3, honey: 2, grape: 3, wine: 3, vintage: 2,
  // Cane and sugar are intermediates on the way to bread, so they hold a working buffer only.
  sugarcane: 3, sugar: 3,
  // Hops buffer like cane; beer is a finished drink and keeps a slightly larger one, since
  // the tavern draws on it every day.
  hops: 3, beer: 4,
  // Meat buffers like the other intermediates; sausages are served, so they hold a little more.
  meat: 3, sausages: 3,
  // Herbs are the clinic's working supply, so a small buffer is plenty.
  herbs: 3,
  // Pelts are a trade good with no workshop consumer, so they hold a modest buffer.
  pelt: 3,
  // Souvenirs are a trade good, so a modest buffer is enough.
  souvenir: 3,
  // Island specialities arrive in small lots, so they hold a small buffer.
  peach: 2, watermelon: 2, plum: 2, olive: 2, lime: 2, banana: 2, coconut: 2, pineapple: 2, shrimp: 2, lobster: 2,
  // Deeper ores buffer like the base one.
  silverore: 3, goldore: 2, platinumore: 2,
};

export function stockTargets(state: SimState): ResourceMap {
  const active = new Set(['wood', 'stone', 'bread', 'fish', 'plank', 'materials']);
  for (const b of state.buildings) {
    // The recipe the workshop is actually set to, so a winery switched to beer reserves shelf
    // space for hops and beer rather than for grapes and wine.
    const recipe = effectiveRecipe(b);
    for (const key of Object.keys(recipe.input)) active.add(key);
    for (const key of Object.keys(recipe.output)) active.add(key);
  }
  for (const key of RESOURCE_KEYS) if (state.resources[key] > 0) active.add(key);
  const weight = RESOURCE_KEYS.reduce((n, key) => n + (active.has(key) ? WEIGHTS[key] : 0), 0);
  const targets = emptyResources();
  for (const key of RESOURCE_KEYS) if (active.has(key)) targets[key] = Math.max(1, Math.floor(state.capacity * 0.82 * WEIGHTS[key] / weight));
  return targets;
}

export function woodReserve(state: SimState): number {
  return Math.min(60, Math.max(12, Math.ceil(state.capacity * 0.08)));
}
