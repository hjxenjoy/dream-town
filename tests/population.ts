import type { SimWorld } from '../src/sim/world.ts';
import { rosterFromPopulation } from '../src/sim/citizens.ts';

/**
 * Sets the town's population, roster and all.
 *
 * The roster is the authority now: a save's resident count IS the length of `citizens`, and the
 * next tick brings the two back into agreement. A test that only wrote the number would be undone
 * as soon as the town ticks, so every fixture goes through here instead.
 */
export function populate(world: SimWorld, population: number): void {
  world.state.population = population;
  world.state.citizens = rosterFromPopulation(population);
}
