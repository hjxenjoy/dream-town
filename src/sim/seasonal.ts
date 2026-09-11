import type { ResourceMap } from './data.ts';

export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonalActivity {
  name: string;
  description: string;
  /** Frame in the `season-props` atlas drawn beside the town hall while it runs. */
  prop: string;
  items: Partial<ResourceMap>;
  coins: number;
  happiness: number;
  duration: number;
}

/**
 * One voluntary activity per season. Nothing is mandatory: skipping a season costs
 * nothing, and the next one comes around again. Contributions are drawn from
 * surplus only — wood reserve and the three-day food store are protected.
 */
export const SEASONAL_ACTIVITIES: Record<SeasonKey, SeasonalActivity> = {
  spring: {
    name: '春日花市', description: '把花苗和面粉摆上集市，请邻居们来挑一盆带回家。',
    prop: 'spring-flower-cart', items: { wood: 6, flour: 4 }, coins: 120, happiness: 8, duration: 90,
  },
  summer: {
    name: '夏夜果摊', description: '支起水果摊，摆几串彩带，河边就成了纳凉的地方。',
    prop: 'summer-fruit-stall', items: { fish: 8, flour: 6 }, coins: 150, happiness: 9, duration: 90,
  },
  autumn: {
    name: '秋收宴', description: '用新麦和面包办一桌丰收宴，感谢这一季的好天气。',
    prop: 'autumn-harvest', items: { bread: 10, wheat: 12 }, coins: 180, happiness: 10, duration: 90,
  },
  winter: {
    name: '冬日灯火', description: '点亮冬市的小灯，给长夜添一点暖意。',
    prop: 'winter-market', items: { plank: 8, cloth: 3 }, coins: 200, happiness: 11, duration: 90,
  },
};

/** The running activity, if any. Stored in the save so it survives a reload. */
export interface ActivityState {
  season: SeasonKey;
  endsAt: number;
}

export const ACTIVITY_HAPPINESS = 10;

export function activityOf(season: SeasonKey): SeasonalActivity {
  return SEASONAL_ACTIVITIES[season];
}
