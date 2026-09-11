import { BUILDINGS, RESOURCE_KEYS, emptyResources, type ResourceMap } from './data.ts';
import type { SimState } from './world.ts';

// Reserve most shelf space for construction and food. Intermediates need only a
// working buffer: more farms should increase throughput, not their share of storage.
const WEIGHTS: ResourceMap = {
  wood: 20, stone: 10, wheat: 8, flour: 5, bread: 8, fish: 8, plank: 10,
  materials: 6, ore: 5, charcoal: 3, ingot: 3, tools: 4, feed: 3, wool: 3, cloth: 3, clothing: 4,
};

export function stockTargets(state: SimState): ResourceMap {
  const active = new Set(['wood', 'stone', 'bread', 'fish', 'plank', 'materials']);
  for (const b of state.buildings) {
    for (const key of Object.keys(BUILDINGS[b.kind].input ?? {})) active.add(key);
    for (const key of Object.keys(BUILDINGS[b.kind].output ?? {})) active.add(key);
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
