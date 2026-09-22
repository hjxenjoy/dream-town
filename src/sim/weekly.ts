/**
 * Weekly challenges — the single-player replacement for the Regatta.
 *
 * docs/02 §9 puts the co-op and its Regatta aside and says what stands in for it: rotating
 * weekly challenge tasks. A Regatta is a team race against a clock, so the honest single-player
 * translation keeps the two things that made it a Regatta — a fixed window, and a set of targets
 * you either meet or do not — and drops the other teams.
 *
 * Three rules shape this module, and they mirror the achievement table:
 *  - A week is seven game days, on the same clock the days and seasons already run on. So a
 *    challenge window is measured in the town's own time, works while the player is away, and
 *    cannot be gamed by leaving the tab open.
 *  - Progress is a delta against a snapshot taken when the week opened, never a raw counter.
 *    Otherwise a town that had already collected ten thousand goods would finish the board on
 *    the first tick of every week.
 *  - The board is drawn from the week number, so it is reproducible from the save alone: the
 *    same week always sets the same tasks, and reloading cannot reroll for easier ones.
 */
import { GAME_DAY_SECONDS } from './data.ts';
import type { AchievementMetric, AchievementMetrics } from './achievements.ts';

/** Seven game days, the same unit the day and season clocks already use. */
export const WEEK_SECONDS = GAME_DAY_SECONDS * 7;

/** How many tasks a week sets. Three is a session's worth without becoming a checklist. */
export const WEEKLY_TASK_COUNT = 3;

export interface WeeklyTaskDefinition {
  name: string;
  description: string;
  /** The counter the task reads. Every one of these is already kept by the simulation. */
  metric: AchievementMetric;
  /** How much of that counter the task asks for, over and above the week's opening snapshot. */
  target: number;
  prestige: number;
  coins: number;
}

/**
 * The pool the week draws from.
 *
 * Two rules decided these numbers. First, every target was measured, not guessed: a fully built
 * town was run for exactly one week and the counters were read off it, so nothing here asks for
 * more than a town actually does (collected 90 against a measured 412, coins 2500 against
 * 3738, crops 24 against 68, orders 2 against 14, caravans 2 against 4 — the numbers are the
 * yield of one ENGAGED week in a young town, because a week nobody plays measures nothing). Second, every task must be POSSIBLE for a
 * town that has the building it needs — a board that cannot be finished is not a challenge, it is
 * noise. That is why repairs are absent: whether the town is damaged this week is decided by a
 * hazard roll, so as a task it would sometimes be impossible through no fault of the player's.
 * `tests/weekly.test.ts` holds the pool to both rules.
 */
export const WEEKLY_TASKS = [
  { name: '按时交货', description: '完成 2 笔订单', metric: 'orders', target: 2, prestige: 3, coins: 900 },
  { name: '跑一趟远门', description: '完成 2 趟商队', metric: 'caravans', target: 2, prestige: 3, coins: 900 },
  { name: '勤收勤捡', description: '收取工坊产物 90 次', metric: 'collected', target: 90, prestige: 2, coins: 600 },
  { name: '田里不闲', description: '收获 24 茬作物', metric: 'crops', target: 24, prestige: 2, coins: 500 },
  { name: '生意兴隆', description: '赚到 2500 金币', metric: 'coinsEarned', target: 2500, prestige: 2, coins: 0 },
  { name: '叮当一阵', description: '产出 2 套工具', metric: 'tools', target: 2, prestige: 2, coins: 500 },
  { name: '裁缝不停', description: '产出 2 件衣物', metric: 'clothing', target: 2, prestige: 2, coins: 500 },
  { name: '热闹一场', description: '办 1 场邻里庆典', metric: 'festivals', target: 1, prestige: 3, coins: 700 },
  { name: '街坊走动', description: '办 1 场季节活动', metric: 'activities', target: 1, prestige: 2, coins: 500 },
  { name: '添砖加瓦', description: '建成 2 座建筑', metric: 'built', target: 2, prestige: 2, coins: 600 },
  { name: '大工程', description: '推进 1 个工程阶段', metric: 'projectStages', target: 1, prestige: 3, coins: 800 },
] as const satisfies readonly WeeklyTaskDefinition[];

export type WeeklyTaskName = (typeof WEEKLY_TASKS)[number]['name'];
/** Tasks are named, not numbered, so a save carries something a human can read. */
export const weeklyTaskByName = (name: string): WeeklyTaskDefinition | undefined =>
  WEEKLY_TASKS.find(task => task.name === name);

/** Which week a moment falls in. Week 0 is the town's first, so a new town opens on a fresh board. */
export const weekOf = (gameTime: number): number => Math.floor(gameTime / WEEK_SECONDS);

/** How much of the current week is left, as a fraction from 1 (just opened) down to 0. */
export const weekRemaining = (gameTime: number): number =>
  1 - (gameTime % WEEK_SECONDS) / WEEK_SECONDS;

/**
 * The three tasks a given week sets.
 *
 * Drawn from the week number rather than at random, so the same week always sets the same board
 * and reloading cannot reroll an easier one. A stride walk over the pool gives every task a turn
 * without ever repeating one inside a board.
 *
 * `allowed` is the subset the town can actually attempt, and it matters as much as the draw: a
 * young town has no smithy, so a board asking it for tools would be a board nobody could clear.
 * The caller passes what the town owns, which lives in the save, so the board stays reproducible
 * from the save alone even though it now depends on the town.
 */
export function weeklyBoard(week: number, allowed?: readonly WeeklyTaskName[]): WeeklyTaskName[] {
  const pool = allowed && allowed.length ? WEEKLY_TASKS.filter(task => allowed.includes(task.name)) : WEEKLY_TASKS;
  if (!pool.length) return [];
  // A stride coprime with the pool length visits every task before repeating.
  const stride = pool.length > 5 ? 5 : 3;
  const start = ((week % pool.length) + pool.length) % pool.length;
  return Array.from({ length: Math.min(WEEKLY_TASK_COUNT, pool.length) }, (_, index) => pool[(start + index * stride) % pool.length]!.name);
}

export interface WeeklyTaskProgress {
  name: string;
  description: string;
  current: number;
  target: number;
  done: boolean;
  prestige: number;
  coins: number;
}

/**
 * How far along each task of the board is. Progress is the growth of the counter since the week
 * opened, so a task is about what the town does this week and not about what it has ever done.
 */
export function weeklyProgress(
  board: readonly WeeklyTaskName[],
  metrics: AchievementMetrics,
  baseline: Partial<Record<AchievementMetric, number>>,
): WeeklyTaskProgress[] {
  return board.map(name => {
    const task = weeklyTaskByName(name)!;
    const current = Math.max(0, metrics[task.metric] - (baseline[task.metric] ?? metrics[task.metric]));
    return {
      name, description: task.description,
      current: Math.min(current, task.target), target: task.target,
      done: current >= task.target, prestige: task.prestige, coins: task.coins,
    };
  });
}

/** Every metric the pool can ask about — the only ones worth carrying in a save. */
export const WEEKLY_METRICS: AchievementMetric[] = [...new Set(WEEKLY_TASKS.map(task => task.metric))];

/** The snapshot a new week opens with, so every task is measured from zero. */
export function weekBaseline(metrics: AchievementMetrics): Partial<Record<AchievementMetric, number>> {
  return Object.fromEntries(WEEKLY_METRICS.map(metric => [metric, metrics[metric]]));
}

/** Whether the whole board is finished. */
export const boardComplete = (progress: readonly WeeklyTaskProgress[]): boolean =>
  progress.length > 0 && progress.every(task => task.done);

export interface WeeklyState {
  week: number;
  baseline: Partial<Record<AchievementMetric, number>>;
  /** The week whose board has already paid out, so a finished board cannot pay twice. */
  rewarded: number;
}

/**
 * A week's board as it stands in a save. Checked rather than trusted: a baseline naming a metric
 * the pool does not use, or a non-integer snapshot, is a corrupted board, not a lucky one.
 */
export function validWeekly(value: unknown): value is WeeklyState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const weekly = value as WeeklyState;
  if (!Number.isInteger(weekly.week) || weekly.week < 0) return false;
  if (!Number.isInteger(weekly.rewarded) || weekly.rewarded < -1) return false;
  if (!weekly.baseline || typeof weekly.baseline !== 'object' || Array.isArray(weekly.baseline)) return false;
  return Object.entries(weekly.baseline).every(
    ([metric, amount]) => WEEKLY_METRICS.includes(metric as AchievementMetric) && Number.isInteger(amount) && (amount as number) >= 0,
  );
}

/**
 * The tasks a town can actually attempt, worked out from what it has. Everything on this list is
 * something the player can set in motion this week: the chain tasks need the building that runs
 * the chain, and the project task needs a project under way. Nothing here depends on a dice roll,
 * which is why repairs — decided by whether a hazard happened to strike — are absent from the pool.
 */
export function allowedTasks(owned: ReadonlySet<string>, projectActive: boolean): WeeklyTaskName[] {
  return WEEKLY_TASKS.filter(task => {
    if (task.metric === 'tools') return owned.has('smithy');
    if (task.metric === 'clothing') return owned.has('tailor');
    if (task.metric === 'projectStages') return projectActive;
    if (task.metric === 'crops') return owned.has('farm') || owned.has('orchardhouse');
    return true;
  }).map(task => task.name);
}
