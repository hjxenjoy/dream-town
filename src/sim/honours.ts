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
 *
 * The tracks run eight levels deep on purpose. Most of what pays standing is capped — a fixed
 * list of achievements, collections and stories — and those are matched by a fixed sink. But
 * one faucet never stops: the town pays a point of standing for every level it reaches, for as
 * long as it stands. Daniel Cook's rule for matching a chain is that a source must feed a sink
 * of equal or higher power (constant → linear → exponential), and a linear faucet feeding a
 * capped sink leaks for ever. A geometric price curve is the answer, because it always has room
 * to absorb more: the eight levels cost 6 / 9 / 13 / 18 / 27 / 38 / 56 / 81, so the deep levels
 * stay out of reach for a long time and then, eventually, are reached. That headroom is what
 * keeps standing from piling up with nothing to spend it on — the failure that made this system
 * necessary in the first place.
 *
 * The per-level amounts were halved when the tracks went from four levels to eight, so each
 * track's eight levels sum to exactly what its four used to. Deepening the sink is therefore
 * not a power increase: the same ceiling, reached in more, smaller steps.
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
      { value: 4, note: '加高一排货架' },
      { value: 4, note: '再辟一间侧屋' },
      { value: 4, note: '重铺防潮地面' },
      { value: 4, note: '扩建整座仓院' },
      { value: 4, note: '再买下隔壁的空院' },
      { value: 4, note: '把库房分出干湿两间' },
      { value: 4, note: '给仓顶加一道天窗' },
      { value: 4, note: '把整条巷子并进仓区' },
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
      { value: 1.5, note: '订立学徒规矩' },
      { value: 1.5, note: '统一量具' },
      { value: 1.5, note: '记下工序簿' },
      { value: 1.5, note: '开设匠人夜课' },
      { value: 1.5, note: '把作坊打通成一排' },
      { value: 1.5, note: '分出专做细活的一间' },
      { value: 1.5, note: '请外镇的师傅来住一季' },
      { value: 1.5, note: '把手艺刻在工坊的门楣上' },
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
      { value: 1, note: '修一条迎客路' },
      { value: 1, note: '添置公用桌椅' },
      { value: 1, note: '给新邻居接风' },
      { value: 1, note: '把小镇写进族谱' },
      { value: 1, note: '在镇口立一块指路石' },
      { value: 1, note: '给每户门前挂一盏灯' },
      { value: 1, note: '把空着的院子收拾出来' },
      { value: 1, note: '替新邻居备好第一季口粮' },
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

/**
 * How many tracks the town could deepen right now — unlocked, not finished, and payable.
 * This is what drives the "there is something in here" badge on the dock, so it has to be
 * cheap and pure: the interface calls it on every frame, and the obvious alternative
 * (`observe()`) recomputes needs and re-runs every progress pass.
 */
export function affordableHonours(progress: HonourProgress, prestige: number, level: number): number {
  return HONOUR_TRACK_IDS.filter(id => {
    if (level < HONOURS[id].unlockLevel) return false;
    const next = nextHonourLevel(progress, id);
    return next !== null && prestige >= next.cost;
  }).length;
}

/** Every track's levels taken together, for the header line. */
export function honourLevelsTaken(progress: HonourProgress): number {
  return HONOUR_TRACK_IDS.reduce((total, id) => total + honourLevel(progress, id), 0);
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
