/**
 * Plague. Unlike the seasonal hazards in `disasters.ts`, a plague is not aimed at one
 * building: it settles over the whole town for a stretch of days.
 *
 * That shape is deliberate, because of what the design promises. `docs/03` §5 asks for
 * "人口/粮食锐减，医馆救治", but this game has promised from the start that disasters never
 * destroy buildings and never drive residents out. A plague that deleted citizens would be
 * the first mechanic to break that promise.
 *
 * So the plague does not remove anyone: it takes the town's mood down by `PLAGUE_HAPPINESS`
 * and eats into the larder. Population then falls — or fails to grow — through the rule that
 * already exists, where sustained unhappiness costs a resident a day. The epidemic is the
 * pressure; the existing mechanism is still the only thing that moves the headcount.
 *
 * `docs/05` §108 prices the mood cost at −20, which is where `PLAGUE_HAPPINESS` comes from.
 */

/** Mood lost while a plague is running, from docs/05 §108. */
export const PLAGUE_HAPPINESS = 20;
/** How long it runs at the weakest clinic coverage. */
export const PLAGUE_DAYS = 4;
/**
 * The shortest a plague can be run, as a share of its full length. A well-served town still
 * gets ill — that is what makes the clinic worth building — but not for as long.
 */
export const PLAGUE_MIN_SHARE = 0.4;
/** Extra rations the town loses each day to spoiled stores, as a share of the daily ration. */
export const PLAGUE_SPOIL_SHARE = 1;
/** How long the town is left alone between outbreaks. */
export const PLAGUE_INTERVAL = 900;

export interface PlagueState { until: number }

/**
 * How much of the plague's bite a town avoids, given how well the clinic covers it.
 * Zero coverage changes nothing, which keeps a town without a clinic exactly as well off as
 * it was before this layer existed.
 */
function relief(healthCoverage: number): number {
  return Math.min(1, Math.max(0, healthCoverage) / 100);
}

/** Mood lost per day while the plague runs, after the clinic's care. */
export function plagueHappinessCost(healthCoverage: number): number {
  // The clinic can hold off most of the misery, but never all of it: a plague that costs
  // nothing at full coverage would make the clinic a switch rather than an investment.
  return PLAGUE_HAPPINESS * (1 - 0.6 * relief(healthCoverage));
}

/** How long an outbreak lasts, in game seconds, given the clinic's coverage. */
export function plagueDuration(healthCoverage: number, daySeconds: number): number {
  return PLAGUE_DAYS * daySeconds * (1 - (1 - PLAGUE_MIN_SHARE) * relief(healthCoverage));
}

/** Extra rations the town loses to a plague each day, on top of what residents eat. */
export function plagueSpoilage(population: number): number {
  return Math.ceil((population / 4) * PLAGUE_SPOIL_SHARE);
}

/** Whether a new outbreak may start: never over the top of an old one, and never early. */
export function plagueDue(
  plague: PlagueState | undefined,
  gameTime: number,
  lastOutbreakAt: number,
  population: number,
  minPopulation: number,
): boolean {
  if (plague) return false;
  if (population < minPopulation) return false;
  return gameTime - lastOutbreakAt >= PLAGUE_INTERVAL;
}
