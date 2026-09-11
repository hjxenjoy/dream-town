/**
 * Achievements are read-only observations of counters the simulation already keeps.
 *
 * Two rules shape this module:
 *  - Every condition reads a monotonic counter, so an older save that genuinely did the
 *    work unlocks on its next tick. Nothing is fabricated, and nothing is lost.
 *  - Unlocking is automatic. The game's stated direction is few tasks and few taps, so
 *    there is no claim step to forget.
 */
export type AchievementCategory = 'farming' | 'town' | 'industry' | 'trade' | 'care';

/** Every measurable the achievement table can reference. */
export interface AchievementMetrics {
  collected: number;
  crops: number;
  rareCrops: number;
  cropVarieties: number;
  gardenLevel: number;
  soilLevel: number;
  orders: number;
  caravans: number;
  built: number;
  repairs: number;
  festivals: number;
  activities: number;
  coinsEarned: number;
  population: number;
  level: number;
  technologies: number;
  tools: number;
  clothing: number;
  pets: number;
  decorKinds: number;
  industryKinds: number;
  projectStages: number;
}

export type AchievementMetric = keyof AchievementMetrics;

export interface AchievementDefinition {
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  metric: AchievementMetric;
  target: number;
  /**
   * Recognition is paid in prestige, not coins. The design review is explicit that not
   * everything should convert into more money, and prestige already means standing in
   * this game: it is what unlocks technologies. Paying coins would also inject income at
   * moments unrelated to any player decision, muddying every economic expectation.
   */
  prestige: number;
}

export const ACHIEVEMENTS = [
  { id: 'first-harvest', name: '第一捧收成', description: '收下 10 份产物。', category: 'farming', icon: 'wheat', metric: 'collected', target: 10, prestige: 1 },
  { id: 'hundred-baskets', name: '百篮之收', description: '累计收获 200 份产物。', category: 'farming', icon: 'box', metric: 'collected', target: 200, prestige: 2 },
  { id: 'thousand-baskets', name: '仓廪渐实', description: '累计收获 1,000 份产物。', category: 'farming', icon: 'box', metric: 'collected', target: 1000, prestige: 4 },
  { id: 'nine-varieties', name: '九畦齐全', description: '把九种作物都种过一遍。', category: 'farming', icon: 'leaf', metric: 'cropVarieties', target: 9, prestige: 3 },
  { id: 'rare-batch', name: '土地的惊喜', description: '收获 5 批珍品作物。', category: 'farming', icon: 'spark', metric: 'rareCrops', target: 5, prestige: 2 },
  { id: 'rich-soil', name: '沃土传家', description: '把一块田养成传家沃土。', category: 'farming', icon: 'leaf', metric: 'soilLevel', target: 5, prestige: 3 },
  { id: 'green-thumb', name: '园艺好手', description: '园艺达到 10 级。', category: 'farming', icon: 'sun', metric: 'gardenLevel', target: 10, prestige: 4 },

  { id: 'neighbourhood', name: '越来越热闹', description: '迎来 25 位居民。', category: 'town', icon: 'people', metric: 'population', target: 25, prestige: 3 },
  { id: 'small-city', name: '河畔小城', description: '迎来 50 位居民。', category: 'town', icon: 'home', metric: 'population', target: 50, prestige: 5 },
  { id: 'builder', name: '一砖一瓦', description: '新建 30 座建筑。', category: 'town', icon: 'hammer', metric: 'built', target: 30, prestige: 3 },
  { id: 'town-level', name: '声名远扬', description: '小镇升到 10 级。', category: 'town', icon: 'star', metric: 'level', target: 10, prestige: 5 },
  { id: 'tree-lined', name: '满城花木', description: '布置 8 种不同的装饰。', category: 'town', icon: 'leaf', metric: 'decorKinds', target: 8, prestige: 3 },

  { id: 'first-mill', name: '第一家工坊', description: '建成 4 家生产工坊。', category: 'industry', icon: 'gear', metric: 'industryKinds', target: 4, prestige: 2 },
  { id: 'industrial-town', name: '炉火不熄', description: '建成 12 家不同种类的生产工坊。', category: 'industry', icon: 'gear', metric: 'industryKinds', target: 12, prestige: 4 },
  { id: 'toolsmith', name: '叮当声里的手艺', description: '产出 20 套工具。', category: 'industry', icon: 'tools', metric: 'tools', target: 20, prestige: 3 },
  { id: 'warm-clothes', name: '一针一线', description: '产出 20 件衣物。', category: 'industry', icon: 'clothing', metric: 'clothing', target: 20, prestige: 3 },
  { id: 'scholar', name: '好手艺，慢慢学', description: '掌握 5 项科技。', category: 'industry', icon: 'research', metric: 'technologies', target: 5, prestige: 4 },

  { id: 'first-order', name: '邻里好帮手', description: '完成 5 笔邻里订单。', category: 'trade', icon: 'orders', metric: 'orders', target: 5, prestige: 2 },
  { id: 'trusted-trader', name: '信得过的商号', description: '完成 30 笔邻里订单。', category: 'trade', icon: 'orders', metric: 'orders', target: 30, prestige: 4 },
  { id: 'caravan-master', name: '河谷之外', description: '迎回 10 支商队。', category: 'trade', icon: 'caravan', metric: 'caravans', target: 10, prestige: 4 },
  { id: 'merchant', name: '小有积蓄', description: '累计赚取 20,000 金币。', category: 'trade', icon: 'coin', metric: 'coinsEarned', target: 20000, prestige: 4 },

  { id: 'caretaker', name: '修好每一处', description: '修缮 5 次受损建筑。', category: 'care', icon: 'shield', metric: 'repairs', target: 5, prestige: 3 },
  { id: 'festival-host', name: '今夜有好心情', description: '举办 3 场邻里庆典。', category: 'care', icon: 'spark', metric: 'festivals', target: 3, prestige: 3 },
  { id: 'season-keeper', name: '顺着季节过日子', description: '办过 4 场季节活动。', category: 'care', icon: 'sun', metric: 'activities', target: 4, prestige: 4 },
  { id: 'animal-friend', name: '小动物也喜欢这里', description: '领养 2 只小动物。', category: 'care', icon: 'heart', metric: 'pets', target: 2, prestige: 3 },
  { id: 'story-teller', name: '把小镇写成故事', description: '完成建设计划的 6 个阶段。', category: 'care', icon: 'book', metric: 'projectStages', target: 6, prestige: 4 },
] as const satisfies readonly (AchievementDefinition & { id: string })[];

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map(entry => entry.id) as AchievementId[];

export const ACHIEVEMENT_CATEGORY_NAMES: Record<AchievementCategory, string> = {
  farming: '田园', town: '小镇', industry: '产业', trade: '往来', care: '生活',
};

export interface AchievementProgress {
  id: AchievementId;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  target: number;
  progress: number;
  unlocked: boolean;
}

/**
 * Which achievements the metrics now satisfy. Pure: the caller decides when to persist
 * and announce, so the same table drives the panel, the tests and the tool surface.
 */
export function unlockedBy(metrics: AchievementMetrics, already: readonly string[]): AchievementId[] {
  const held = new Set(already);
  return ACHIEVEMENTS.filter(entry => !held.has(entry.id) && metrics[entry.metric] >= entry.target)
    .map(entry => entry.id);
}

export function achievementProgress(metrics: AchievementMetrics, unlocked: readonly string[]): AchievementProgress[] {
  const held = new Set(unlocked);
  return ACHIEVEMENTS.map(entry => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    icon: entry.icon,
    target: entry.target,
    progress: Math.min(metrics[entry.metric], entry.target),
    unlocked: held.has(entry.id),
  }));
}

export function achievementById(id: string): (typeof ACHIEVEMENTS)[number] | undefined {
  return ACHIEVEMENTS.find(entry => entry.id === id);
}
