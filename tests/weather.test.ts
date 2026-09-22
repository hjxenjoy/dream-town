import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { GENERATED_ATLASES, atlasFrames } from '../src/sim/atlases.ts';
import { SEASON_SECONDS } from '../src/sim/data.ts';
import { RAIN_GROWTH_FACTOR, SEASON_WEATHER, WEATHER, WEATHER_KINDS, WEATHER_SLOT, weatherAt, weatherGrowthFactor, weatherRemaining, weatherSlot } from '../src/sim/weather.ts';
import { executeGameTool } from '../src/sim/tools.ts';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

test('the one thing the documents ask of weather: get_town_status reports it', () => {
  // docs/09 §3.5 is the only place weather appears in any design document: it is listed among
  // what this tool returns. That is the requirement this whole feature answers to.
  const world = new SimWorld();
  const status = executeGameTool(world, 'get_town_status', {}) as { ok: boolean; data: { weather?: { kind: string; name: string } } };
  assert.equal(status.ok, true);
  assert.ok(status.data.weather, 'the status carries the weather');
  assert.ok(WEATHER_KINDS.includes(status.data.weather!.kind as never), `a real kind, got ${status.data.weather!.kind}`);
  assert.ok(status.data.weather!.name.length > 0, 'and a readable name');
});

test('the weather is derived from the clock, so it needs no save field and no migration', () => {
  // A function of gameTime and season: reloading, or settling offline, cannot change the sky.
  for (const season of SEASONS) {
    for (const time of [0, 137, WEATHER_SLOT * 3 + 20, SEASON_SECONDS * 2 + 5]) {
      assert.equal(weatherAt(season, time), weatherAt(season, time), 'the same clock gives the same weather');
    }
  }
  const world = new SimWorld();
  const before = world.weather();
  const restored = new SimWorld(JSON.parse(JSON.stringify(world.state)));
  assert.equal(restored.weather(), before, 'a save round trip does not disturb the weather');
  assert.equal(validateSave(restored.state), true);
  // And nothing called "weather" is written into the save.
  assert.equal('weather' in (world.state as unknown as Record<string, unknown>), false, 'no weather field in the save');
});

test('the sky changes over time rather than sitting on one spell', () => {
  const world = new SimWorld();
  const seen = new Set<string>();
  for (let slot = 0; slot < 60; slot++) {
    world.state.gameTime = slot * WEATHER_SLOT + 1;
    seen.add(world.weather());
  }
  assert.ok(seen.size >= 3, `weather varies across spells, saw ${[...seen].join(',')}`);
  // And within a spell it holds still, so a player looking at the sky is not seeing flicker.
  const at = 7 * WEATHER_SLOT;
  const steady = new Set([weatherAt('summer', at), weatherAt('summer', at + 40), weatherAt('summer', at + WEATHER_SLOT - 1)]);
  assert.equal(steady.size, 1, 'one spell, one sky');
});

test('a season never brings weather that contradicts the ground it paints', () => {
  for (const season of SEASONS) {
    const allowed = SEASON_WEATHER[season];
    assert.ok(allowed.length > 0, `${season} has weather`);
    for (const kind of allowed) assert.ok(WEATHER_KINDS.includes(kind), `${kind} is a real kind`);
    // Snow belongs to winter, and rain does not.
    const wet = allowed.filter(kind => weatherGrowthFactor(kind) !== 1);
    if (season === 'winter') {
      assert.equal(wet.length, 0, 'winter does not water the fields');
      assert.ok(allowed.includes('snow') || allowed.includes('blizzard'), 'winter brings snow');
    }
    if (season === 'summer') {
      assert.equal(allowed.includes('snow') || allowed.includes('blizzard'), false, 'summer brings no snow');
    }
  }
  // Every sampled spell really does come from that season's list.
  for (const season of SEASONS) {
    for (let slot = 0; slot < 200; slot++) {
      const kind = weatherAt(season, slot * WEATHER_SLOT + 3);
      assert.ok(SEASON_WEATHER[season].includes(kind), `${season} slot ${slot} gave ${kind}, which is not in its list`);
    }
  }
});

test('only rain waters the fields, and every other sky is exactly neutral', () => {
  const waters = WEATHER_KINDS.filter(kind => weatherGrowthFactor(kind) !== 1);
  assert.deepEqual([...waters].sort(), ['downpour', 'rain', 'thunder'], 'the wet skies');
  for (const kind of waters) {
    assert.ok(RAIN_GROWTH_FACTOR < 1, 'watering shortens the cycle rather than lengthening it');
    assert.ok(RAIN_GROWTH_FACTOR > 0.9, 'and only slightly: the seasons own the big swing');
  }
  // Everything else is exactly 1, not merely close to it — that is what guarantees a town is no
  // worse off than it was before weather existed.
  for (const kind of WEATHER_KINDS) {
    if (waters.includes(kind)) continue;
    assert.equal(weatherGrowthFactor(kind), 1, `${kind} changes nothing at all`);
  }
});

test('rain speeds the fields up, and dry weather leaves the cycle untouched', () => {
  const world = new SimWorld();
  const farm = world.state.buildings.find(building => building.kind === 'farm')!;
  const cycleAt = (time: number) => {
    world.state.gameTime = time;
    return world.observe().production.find(row => row.buildingId === farm.id)!.cycle;
  };
  // Find a dry spell, then look for a wet one in the SAME season, so the season's own factor
  // cannot explain the difference between the two readings.
  const dryAt = SEASONS.flatMap(season => Array.from({ length: 60 }, (_, slot) => ({ season, time: slot * WEATHER_SLOT + 2 })))
    .find(entry => entry.season !== 'winter' && weatherGrowthFactor(weatherAt(entry.season, entry.time)) === 1);
  assert.ok(dryAt, 'some dry spell exists');
  const dry = cycleAt(dryAt!.time);
  const wetSeasonTime = Array.from({ length: 400 }, (_, slot) => slot * WEATHER_SLOT + 2)
    .find(time => weatherGrowthFactor(weatherAt(dryAt!.season, time)) !== 1);
  assert.ok(wetSeasonTime !== undefined, 'the same season has a wet spell somewhere');
  const wet = cycleAt(wetSeasonTime!);
  assert.ok(wet < dry, `rain shortens the cycle: ${wet} < ${dry}`);
  assert.ok(Math.abs(wet / dry - RAIN_GROWTH_FACTOR) < 0.02, `and by about the stated factor, got ${(wet / dry).toFixed(3)}`);
});

test('the spell has a readable countdown that never goes negative', () => {
  assert.equal(weatherRemaining(0) > 0, true);
  assert.ok(weatherRemaining(WEATHER_SLOT / 2) <= WEATHER_SLOT);
  assert.ok(weatherRemaining(WEATHER_SLOT * 100 + 10) > 0, 'it always reports time left in the current spell');
  assert.equal(weatherSlot(0), 0);
  assert.equal(weatherSlot(WEATHER_SLOT), 1);
  assert.equal(weatherSlot(WEATHER_SLOT - 1), 0);
});

test('every weather frame exists in the atlas the renderer draws from', () => {
  const frames = atlasFrames('weather-expansion');
  for (const kind of WEATHER_KINDS) {
    const definition = WEATHER[kind];
    assert.ok(frames[definition.frame], `${kind} -> ${definition.frame} exists`);
    assert.ok(definition.name.length > 0 && definition.note.length > 0, `${kind} is named and explained`);
  }
  // And the atlas is one the scene actually loads, or the sky would draw as nothing.
  const scene = readFileSync(new URL('../src/render/TownScene.ts', import.meta.url), 'utf8');
  assert.match(scene, /'weather-expansion'/, 'the scene loads the weather atlas');
  assert.match(scene, /WEATHER_TILES/, 'and loads the seamless tiles');
  for (const tile of ['weather-tile-rain', 'weather-tile-snow', 'weather-tile-fog']) {
    assert.match(scene, new RegExp(tile.replace(/-/g, '\\-')), `${tile} is loaded`);
  }
  assert.ok(GENERATED_ATLASES['weather-expansion'], 'the atlas is registered');
});
