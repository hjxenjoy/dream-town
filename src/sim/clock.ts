/**
 * The town's own clock. Everything that behaves differently by time of day reads it from
 * here, so the HUD, the residents and the tests all agree on when it is.
 */

/** Seconds of play per in-game day. Short enough to see a full day, long enough to be calm. */
export const DAY_LENGTH = 600;

/** The working day, in hours. Residents are at their workshops between these. */
export const WORK_START = 8;
export const WORK_END = 18;

export type PartOfDay = 'night' | 'morning' | 'work' | 'evening';

export interface PartDefinition {
  name: string;
  /** What the town looks and feels like now. */
  note: string;
}

/** The four parts of a day, in order. */
export const PARTS: Record<PartOfDay, PartDefinition> = {
  night: { name: '夜里', note: '灯火稀疏，大家都歇下了。' },
  morning: { name: '清晨', note: '街上刚醒，作坊陆续生火。' },
  work: { name: '白天', note: '作坊开着，工匠们都在工位上。' },
  evening: { name: '傍晚', note: '下手了，人们顺着路回家。' },
};

/** Hours since the town was founded, as a decimal (13.5 is half past one in the afternoon). */
export function hourOf(gameTime: number): number {
  const at = ((gameTime % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;
  return at / DAY_LENGTH * 24;
}

/** Which day the town is on, counting from one. */
export function dayOf(gameTime: number): number {
  return Math.floor(Math.max(0, gameTime) / DAY_LENGTH) + 1;
}

/** Whether workshops are open. Night shifts do not exist in this town. */
export function isWorkHour(gameTime: number): boolean {
  const hour = hourOf(gameTime);
  return hour >= WORK_START && hour < WORK_END;
}

export function partOfDay(gameTime: number): PartOfDay {
  const hour = hourOf(gameTime);
  if (hour < 5) return 'night';
  if (hour < WORK_START) return 'morning';
  if (hour < WORK_END) return 'work';
  return 'evening';
}

/** The clock as the interface shows it, e.g. `08:30`. */
export function clockLabel(gameTime: number): string {
  const hour = hourOf(gameTime);
  const hours = Math.floor(hour);
  const minutes = Math.floor((hour - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Seconds until the next change of part, so the interface can say "还有多久". */
export function secondsUntilNextPart(gameTime: number): number {
  const hour = hourOf(gameTime);
  const boundaries = [5, WORK_START, WORK_END, 24];
  const next = boundaries.find(boundary => boundary > hour) ?? 24;
  return (next - hour) / 24 * DAY_LENGTH;
}
