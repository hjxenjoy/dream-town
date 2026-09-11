/**
 * Town honours: what a town does with the standing it has earned.
 *
 * Research is a one-time cost — eight techniques for 52 points in total — while quests,
 * milestones, achievements, street styles and neighbour stories keep paying prestige for the
 * whole game. Without somewhere to put it, the currency stops meaning anything after the tree
 * is learned. Honours are that destination: each track can be deepened a few times, each
 * deepening costs more than the last, and the effect is permanent.
 *
 * Each track opens at a town level rather than at a technique. Gating them behind techniques
 * would have put them behind the last three — which themselves require tools, cloth and
 * clothing from a fully built industry — so a town that had not built every chain could never
 * spend its standing at all, which is the problem this exists to solve. Level is something
 * every town reaches, and the three effects are deliberately small: they relieve pressures the
 * game already creates rather than removing them.
 */
export type HonourTrackId = 'granary' | 'craft' | 'welcome';

export interface HonourLevel {
  /** Prestige for this deepening. Rises with every level. */
  cost: number;
  /** How much the effect grows at this level, in the track's own unit. */
  value: number;
  /** What the town actually did, so the purchase reads as a story rather than a number. */
  note: string;
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
      { cost: 6, value: 8, note: '加高一排货架' },
      { cost: 9, value: 8, note: '再辟一间侧屋' },
      { cost: 13, value: 8, note: '重铺防潮地面' },
      { cost: 18, value: 8, note: '扩建整座仓院' },
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
      { cost: 6, value: 1.5, note: '订立学徒规矩' },
      { cost: 9, value: 1.5, note: '统一量具' },
      { cost: 13, value: 1.5, note: '记下工序簿' },
      { cost: 18, value: 1.5, note: '开设匠人夜课' },
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
      { cost: 6, value: 2, note: '修一条迎客路' },
      { cost: 9, value: 2, note: '添置公用桌椅' },
      { cost: 13, value: 2, note: '给新邻居接风' },
      { cost: 18, value: 2, note: '把小镇写进族谱' },
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
export function nextHonourLevel(progress: HonourProgress, id: HonourTrackId): HonourLevel | null {
  const track = HONOURS[id];
  return track ? track.levels[honourLevel(progress, id)] ?? null : null;
}

/** Total prestige a town has put into honours, for reporting what the standing bought. */
export function honourSpent(progress: HonourProgress): number {
  return HONOUR_TRACK_IDS.reduce((total, id) => {
    const track = HONOURS[id];
    return total + track.levels.slice(0, honourLevel(progress, id)).reduce((sum, level) => sum + level.cost, 0);
  }, 0);
}

/** Permanent warehouse capacity bought with standing. */
export function honourCapacity(progress: HonourProgress): number {
  return HONOURS.granary.levels.slice(0, honourLevel(progress, 'granary')).reduce((sum, level) => sum + level.value, 0);
}

/** Multiplier applied to every workshop's cycle, below 1 when the craft has been deepened. */
export function honourCycleFactor(progress: HonourProgress): number {
  const faster = HONOURS.craft.levels.slice(0, honourLevel(progress, 'craft')).reduce((sum, level) => sum + level.value, 0);
  return Math.max(0.8, 1 - faster / 100);
}

/** Permanent community places bought with standing. */
export function honourCommunity(progress: HonourProgress): number {
  return HONOURS.welcome.levels.slice(0, honourLevel(progress, 'welcome')).reduce((sum, level) => sum + level.value, 0);
}

/** Everything each track currently gives, for the interface. */
export function honourSummary(progress: HonourProgress): { id: HonourTrackId; level: number; max: number; earned: number; next: HonourLevel | null }[] {
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
