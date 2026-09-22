import type { SimWorld } from '../src/sim/world.ts';

/**
 * A workshop's cycle as the town actually runs it.
 *
 * The cycle is not the number in `BUILDINGS`. It carries the season, the research, the honours,
 * the project titles, the proximity of its suppliers, the walk its workers make, and the wait
 * for the load — so a test that ticks the raw definition is timing a cycle the game no longer
 * has. Reading the reported cycle keeps these tests about the batch, which is what they are for.
 */
export function cycleOf(world: SimWorld, building: { id: string }, margin = 1): number {
  const row = world.observe().production.find(entry => entry.buildingId === building.id);
  return (row?.cycle ?? 0) + margin;
}
