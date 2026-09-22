import test from 'node:test';
import assert from 'node:assert/strict';
import { audibleAmbience, type AmbienceSource } from '../src/sim/ambience.ts';
import { iso } from '../src/sim/terrain.ts';
import type { BuildingKind } from '../src/sim/data.ts';

const coverage: Partial<Record<BuildingKind, AmbienceSource>> = {
  windmill: { url: '/a/windmill.wav', profile: 'windmill' },
  market: { url: '/a/market.wav', profile: 'crowd' },
  well: { url: '/a/well.wav', profile: 'water' },
  cottage: { url: '/a/cottage.wav', profile: 'home' },
};

const at = (id: string, kind: BuildingKind, x: number, y: number, damaged = false) => ({ id, kind, x, y, damaged });
/** Where a building is drawn, so a test can ask for "the camera sitting right on it". */
const centreOf = (x: number, y: number) => iso(x, y);
const none: ReadonlySet<string> = new Set<string>();

test('only the nearest handful of buildings are mixed, so a grown town never plays 69 loops', () => {
  const buildings = Array.from({ length: 20 }, (_, i) => at(`b${i}`, 'well', 10 + i, 10));
  const heard = audibleAmbience(buildings, none, centreOf(10, 10), coverage, 6);
  assert.equal(heard.length, 6);
  // and they are the six closest, in order
  assert.deepEqual(heard.map(entry => entry.id), ['b0', 'b1', 'b2', 'b3', 'b4', 'b5']);
});

test('volume falls off with distance and reaches silence past the outer radius', () => {
  // One map tile is 116x58px, so these offsets are 2, 8 and 20 tiles away: inside the
  // full-volume radius, inside the fade, and past silence respectively.
  const near = audibleAmbience([at('near', 'well', 12, 10)], none, centreOf(10, 10), coverage)[0];
  const mid = audibleAmbience([at('mid', 'well', 18, 10)], none, centreOf(10, 10), coverage)[0];
  const far = audibleAmbience([at('far', 'well', 30, 10)], none, centreOf(10, 10), coverage);
  assert.ok(near && mid, 'a building inside the fade is still heard');
  assert.ok(near.gain > mid.gain, `near ${near.gain} should be louder than mid ${mid.gain}`);
  assert.equal(far.length, 0, 'a building past the outer radius is not heard at all');
});

test('work sounds stop with the building while place ambience keeps playing', () => {
  const buildings = [at('mill', 'windmill', 10, 10), at('square', 'market', 10, 10)];
  const idle = audibleAmbience(buildings, none, centreOf(10, 10), coverage);
  assert.deepEqual(idle.map(entry => entry.id), ['square'], 'an idle mill is silent, the market is not');
  const working = audibleAmbience(buildings, new Set(['mill']), centreOf(10, 10), coverage);
  assert.deepEqual(working.map(entry => entry.id).sort(), ['mill', 'square']);
  // Water and doorways are place ambience: never gated on the building running.
  const place = audibleAmbience([at('w', 'well', 10, 10), at('h', 'cottage', 10, 10)], none, centreOf(10, 10), coverage);
  assert.equal(place.length, 2);
});

test('a damaged building is silent, and unknown kinds are simply not mixed', () => {
  const damaged = audibleAmbience([at('broken', 'windmill', 10, 10, true)], new Set(['broken']), centreOf(10, 10), coverage);
  assert.equal(damaged.length, 0, 'scaffolded buildings do not make their own noise');
  // `garden` is not in the catalogue, so it contributes nothing rather than throwing.
  const unknown = audibleAmbience([at('g', 'garden' as BuildingKind, 10, 10)], none, centreOf(10, 10), coverage);
  assert.equal(unknown.length, 0);
});
