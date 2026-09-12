/**
 * Town honours: what a town does with the standing it has earned.
 *
 * Research is a one-time cost — eight techniques for 52 points in total — while quests,
 * milestones, achievements, street styles and neighbour stories keep paying prestige for the
 * whole game. Without somewhere to put it, the currency stops meaning anything once the tree
 * is learned. Honours are that destination.
 *
 * The shape follows the established idle-game cost model (Anthony Pecorella, "The Math of Idle
 * Games", Kongregate/GDC Europe 2016): a generator's price grows exponentially while its output
 * grows only linearly —
 *
 *     cost(n) = base × growth^n        output(n) = value × n
 *
 * so every further level buys less than the one before it. That widening gap is what turns
 * "buy everything" into a decision about when to stop, which is the whole point of the curve.
 * AdVenture Capitalist uses growth 1.07 for its hundreds of generator levels; Cookie Clicker
 * raises each purchase 15% (1.15^n) and grows its prestige thresholds with the cube of the
 * level while paying a flat +1% per level. A four-level track needs a steeper ratio than
 * either to reach the same effect, which is where 1.45 comes from.
 *
 * Each track relieves a different pressure the game already creates — storage, throughput,
 * room for people — so which one is worth buying next depends on which of those is currently
 * the town's bottleneck. Comparable strength plus different bottlenecks is what keeps the
 * choice meaningful: three tracks of equal power that all relieve the same pressure would be
 * an illusion of choice, and one track far weaker than the others would never be bought.
 */
export type HonourTrackId = 'granary' | 'craft' | 'welcome';

/** Price of the first level, before growth is applied. */
export const HONOUR_COST_BASE = 6;

/**
 * How much dearer each level is than the one before. Four levels, so this is the ratio that
 * puts the last level at roughly three times the first — steep enough that the fourth level is
 * a decision rather than a formality, shallow enough that it stays reachable.
 */
export const HONOUR_COST_GROWTH = 1.45;

/** What one level costs, indexed from zero: `base × growth^level`, rounded to whole standing. */
export function honourLevelCost(level: number): number {
  if (!Number.isFinite(level) || level < 0) return HONOUR_COST_BASE;
  return Math.round(HONOUR_COST_BASE * HONOUR_COST_GROWTH ** Math.floor(level));
}

export interface HonourLevel {
  /** How much the effect grows at this level, in the track's own unit. */
  value: number;
  /** What the town actually did, so the purchase reads as a story rather than a number. */
  note: string;
}

/**
 * A level that is available to buy, with its price attached. The price is derived from the
 * curve rather than stored, so a track's table cannot drift away from the formula.
 */
export interface HonourOffer extends HonourLevel {
  index: number;
  cost: number;
}

export interface HonourTrack {
  id: HonourTrackId;
  name: string;
  icon: string;
  description: string;
  /** What the effect is measured in, for the interface. */
  unit: string;
  /**
   * The town level at which this becomes available. Deliberately not called `level`, because a
   * summary of a track reports how many levels have been bought in a field of that name.
   */
  unlockLevel: number;
  levels: readonly HonourLevel[];
}

export const HONOURS: Record<HonourTrackId, HonourTrack> = {
  granary: {
    id: 'granary',
    name: '仓廪扩建',
    icon: 'box',
    description: '以声望扩建仓廪，每一级永久增加仓储容量。',
    unit: '容量',
    unlockLevel: 5,
    levels: [
      { value: 8, note: '加高一排货架' },
      { value: 8, note: '再辟一间侧屋' },
      { value: 8, note: '重铺防潮地面' },
      { value: 8, note: '扩建整座仓院' },
    ],
  },
  craft: {
    id: 'craft',
    name: '精工传承',
    icon: 'gear',
    description: '把老师傅的手法传下去，每一级永久缩短工坊的生产时间。',
    unit: '% 更快',
    unlockLevel: 6,
    levels: [
      { value: 3, note: '订立学徒规矩' },
      { value: 3, note: '统一量具' },
      { value: 3, note: '记下工序簿' },
      { value: 3, note: '开设匠人夜课' },
    ],
  },
  welcome: {
    id: 'welcome',
    name: '安居名额',
    icon: 'home',
    description: '声望高了，更多人愿意搬来。每一级永久增加社区人口名额。',
    unit: '名额',
    unlockLevel: 7,
    levels: [
      { value: 2, note: '修一条迎客路' },
      { value: 2, note: '添置公用桌椅' },
      { value: 2, note: '给新邻居接风' },
      { value: 2, note: '把小镇写进族谱' },
    ],
  },
};

export const HONOUR_TRACK_IDS = Object.keys(HONOURS) as HonourTrackId[];

/** How many levels of one track a town has. */
export type HonourProgress = Partial<Record<HonourTrackId, number>>;

/** Levels taken in one track, clamped to what the track offers. */
export function honourLevel(progress: HonourProgress, id: HonourTrackId): number {
  const track = HONOURS[id];
  if (!track) return 0;
  const level = progress[id] ?? 0;
  return Math.max(0, Math.min(track.levels.length, Number.isInteger(level) ? level : 0));
}

/** The next deepening available in a track, or null when it is complete. */
export function nextHonourLevel(progress: HonourProgress, id: HonourTrackId): HonourOffer | null {
  const track = HONOURS[id];
  if (!track) return null;
  const index = honourLevel(progress, id);
  const level = track.levels[index];
  return level ? { ...level, index, cost: honourLevelCost(index) } : null;
}

/** Total prestige a town has put into honours, for reporting what the standing bought. */
export function honourSpent(progress: HonourProgress): number {
  return HONOUR_TRACK_IDS.reduce((total, id) => {
    const taken = honourLevel(progress, id);
    let sum = 0;
    for (let level = 0; level < taken; level++) sum += honourLevelCost(level);
    return total + sum;
  }, 0);
}

/** What a track has accumulated across the levels bought so far. */
function honourTotal(progress: HonourProgress, id: HonourTrackId): number {
  return HONOURS[id].levels.slice(0, honourLevel(progress, id)).reduce((sum, level) => sum + level.value, 0);
}

/** Permanent warehouse capacity bought with standing. */
export function honourCapacity(progress: HonourProgress): number {
  return honourTotal(progress, 'granary');
}

/** Multiplier applied to every workshop's cycle, below 1 when the craft has been deepened. */
export function honourCycleFactor(progress: HonourProgress): number {
  return Math.max(0.8, 1 - honourTotal(progress, 'craft') / 100);
}

/** Permanent community places bought with standing. */
export function honourCommunity(progress: HonourProgress): number {
  return honourTotal(progress, 'welcome');
}

/** Everything each track currently gives, for the interface. */
export function honourSummary(progress: HonourProgress): { id: HonourTrackId; level: number; max: number; earned: number; next: HonourOffer | null }[] {
  return HONOUR_TRACK_IDS.map(id => {
    const track = HONOURS[id];
    const level = honourLevel(progress, id);
    return {
      id, level, max: track.levels.length,
      earned: track.levels.slice(0, level).reduce((sum, entry) => sum + entry.value, 0),
      next: nextHonourLevel(progress, id),
    };
  });
}
