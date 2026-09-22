import type { SeasonKey } from './seasonal.ts';

/**
 * Weather. The design documents say only one thing about it — `docs/09` §3.5 lists it among
 * what `get_town_status()` reports — so this module deliberately does the smallest thing that
 * satisfies that and nothing more.
 *
 * Two decisions follow from the spec being that thin, and both match how every other layer in
 * this game behaves:
 *
 * 1. **It is derived, not stored.** The weather at a moment is a pure function of the game
 *    clock, so it needs no save field, no migration, and no offline settlement: a player who
 *    closes the game and comes back sees whatever the weather would have been anyway.
 * 2. **It never penalises.** Clear weather changes nothing at all — the multiplier is exactly
 *    1 — which is the same shape as every care layer here (clothes, comforts, faith, herbs).
 *    Rain waters the fields and farms work a little faster; that is the only effect there is.
 *    Weather is not a second set of disasters layered on top of the seasons, and a town is
 *    never worse off for the sky than it was before weather existed.
 */

export type WeatherKind = 'fair' | 'cloudy' | 'rain' | 'downpour' | 'snow' | 'blizzard' | 'fog' | 'thunder';

export const WEATHER_KINDS: readonly WeatherKind[] = ['fair', 'cloudy', 'rain', 'downpour', 'snow', 'blizzard', 'fog', 'thunder'];

export interface WeatherDefinition {
  name: string;
  /** Frame in the `weather-expansion` atlas drawn over the town. */
  frame: string;
  /** The seamless tile laid over the map while it lasts, where the art provides one. */
  tile?: 'weather-tile-rain' | 'weather-tile-snow' | 'weather-tile-fog';
  /**
   * How the tile is repeated and faded over the view. The three tiles are not alike: fog covers
   * every pixel with a pale veil, while rain and snow are sparse specks — measured at 1.1% and
   * 0.4% ink. Laid once across the viewport the specks come to about one part in 255 of the
   * screen, which is invisible. So the fine tiles repeat many times and the fog is laid once and
   * kept faint, which is what each of them is actually for.
   */
  tileScale?: number;
  tileAlpha?: number;
  /** One plain sentence for the HUD and the tool. */
  note: string;
  /** True when the weather waters the fields, which is the only effect weather has. */
  waters?: true;
}

export const WEATHER: Record<WeatherKind, WeatherDefinition> = {
  fair: { name: '晴朗', frame: 'cloud-fair', note: '云淡风轻，适合出门走走。' },
  cloudy: { name: '多云', frame: 'cloud-storm', note: '天阴着，风里有雨的味道。' },
  rain: { name: '小雨', frame: 'rain-light', tile: 'weather-tile-rain', tileScale: 0.34, tileAlpha: 0.6, note: '细细的雨落在田里，庄稼喝得正好。', waters: true },
  downpour: { name: '阵雨', frame: 'rain-heavy', tile: 'weather-tile-rain', tileScale: 0.26, tileAlpha: 0.72, note: '雨点打得屋檐直响，田里正需要水。', waters: true },
  snow: { name: '小雪', frame: 'snow-light', tile: 'weather-tile-snow', tileScale: 0.3, tileAlpha: 0.8, note: '雪轻轻落下来，路上很安静。' },
  blizzard: { name: '风雪', frame: 'snow-heavy', tile: 'weather-tile-snow', tileScale: 0.22, tileAlpha: 0.9, note: '风雪紧了一阵，屋里却更暖了。' },
  fog: { name: '晨雾', frame: 'fog', tile: 'weather-tile-fog', tileScale: 1, tileAlpha: 0.45, note: '雾还没散，河谷像蒙了一层纱。' },
  thunder: { name: '雷雨', frame: 'lightning', tile: 'weather-tile-rain', tileScale: 0.26, tileAlpha: 0.72, note: '远处滚过雷声，雨随后就到。', waters: true },
};

/**
 * Which weather a season can bring. Winter does not rain and summer does not snow, so the sky
 * agrees with the ground the season already paints.
 */
export const SEASON_WEATHER: Record<SeasonKey, readonly WeatherKind[]> = {
  spring: ['fair', 'cloudy', 'rain', 'rain', 'downpour', 'fog', 'thunder'],
  summer: ['fair', 'fair', 'cloudy', 'rain', 'downpour', 'thunder', 'thunder'],
  autumn: ['fair', 'cloudy', 'rain', 'fog', 'fog', 'downpour'],
  winter: ['cloudy', 'snow', 'snow', 'blizzard', 'fog', 'fair'],
};

/** How long one spell lasts, in game seconds. */
export const WEATHER_SLOT = 150;

/**
 * How much faster fields grow while the weather waters them. Small on purpose: weather should
 * be noticed in the sky and only faintly in the numbers, and the seasons already own the big
 * swing in what farmland does.
 */
export const RAIN_GROWTH_FACTOR = 0.95;

/**
 * A stable pseudo-random fraction from an integer, in the style the road and terrain painters
 * already use. Deterministic across runs and machines, which is what lets the weather be
 * derived rather than stored.
 */
function noise(n: number): number {
  const x = Math.sin(n * 91.73) * 43758.545;
  return x - Math.floor(x);
}

/** Which spell the clock is in. Exported so the renderer and the tests agree with the sim. */
export function weatherSlot(gameTime: number): number {
  return Math.floor(Math.max(0, gameTime) / WEATHER_SLOT);
}

/**
 * The weather at a moment, given the season the clock puts us in. Both are functions of the
 * same clock, so they can never disagree.
 */
export function weatherAt(season: SeasonKey, gameTime: number): WeatherKind {
  const pool = SEASON_WEATHER[season];
  const slot = weatherSlot(gameTime);
  // The slot index and the season both feed the hash, so the same season returns in a
  // different order each year rather than repeating on a fixed cycle.
  return pool[Math.floor(noise(slot * 7 + season.length * 131 + season.charCodeAt(0)) * pool.length)]!;
}

/** Nothing at all for a season that does not water, and a small speed-up for one that does. */
export function weatherGrowthFactor(kind: WeatherKind): number {
  return WEATHER[kind].waters ? RAIN_GROWTH_FACTOR : 1;
}

/** How long the current spell has left, for the HUD and the tool. */
export function weatherRemaining(gameTime: number): number {
  const into = Math.max(0, gameTime) - weatherSlot(gameTime) * WEATHER_SLOT;
  return Math.max(0, WEATHER_SLOT - into);
}
