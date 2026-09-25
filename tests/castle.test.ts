import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCE_KEYS, SEASON_SECONDS, emptyResources, type BuildingKind } from '../src/sim/data.ts';
import { DISASTERS, DISASTER_INTERVAL, DISASTER_KINDS, canStrike } from '../src/sim/disasters.ts';

/** A town with the roof off, materials in hand, and every blueprint available. */
function prepared() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.coins = 500000;
  world.state.capacity = 9000;
  world.state.researched = ['mining', 'metallurgy'];
  world.state.settings.disasters = true;
  world.state.settings.autoMayor = false;
  world.state.resources = { ...emptyResources(), wood: 900, stone: 900, materials: 300 };
  return world;
}
const at = (world: SimWorld, kind: BuildingKind, x: number, y: number) => {
  const result = world.build(kind, x, y);
  assert.equal(result.ok, true, `could not build ${kind} at ${x},${y}: ${result.code}`);
  return world.state.buildings.find(b => b.id === result.buildingId)!;
};

test('the castle is the strongest guard the town can raise, and costs like it', () => {
  // docs/03 §50 calls 城墙/城堡 a later defence upgrade, so this is the third tier above the
  // post and the barracks: it sees furthest and it is the dearest by a wide margin.
  assert.equal(BUILDINGS.castle.category, 'services');
  assert.ok(BUILDINGS.castle.guardRadius!, 'it guards');
  assert.ok(BUILDINGS.castle.guardRadius! > BUILDINGS.barracks.guardRadius!, 'further than the barracks');
  assert.ok(BUILDINGS.barracks.guardRadius! > BUILDINGS.guardpost.guardRadius!, 'which is further than the post');
  assert.ok(BUILDINGS.castle.cost > BUILDINGS.barracks.cost, 'and costs more than the barracks');
  assert.ok(BUILDINGS.barracks.cost > BUILDINGS.guardpost.cost, 'which costs more than the post');
  // It is raised by the same trade as the barracks, and needs no crew to stand watch.
  assert.equal(BUILDINGS.castle.technology, 'metallurgy');
  assert.equal(BUILDINGS.castle.workers, undefined, 'a garrison needs no townsfolk assigned');
  assert.ok((BUILDINGS.castle.materials?.materials ?? 0) > (BUILDINGS.barracks.materials?.materials ?? 0), 'the dearest part is the caravan stone');
});

test('a castle covers ground the barracks and the post both miss', () => {
  // The whole point of the upgrade: at a distance only the castle reaches, a raid cannot land.
  const world = prepared();
  // A lone barn far from everything, with a castle 10 tiles away and nothing else near.
  // Both on real land ten tiles apart, in the agriculture district where the terrain is clear.
  const barn = at(world, 'lumber', 2, 26);
  const castle = at(world, 'castle', 12, 26);
  const radius = BUILDINGS.castle.guardRadius!;
  const distance = Math.hypot(barn.x - castle.x, barn.y - castle.y);
  assert.ok(distance <= radius, `the castle reaches the barn (${distance} <= ${radius})`);
  assert.ok(distance > BUILDINGS.barracks.guardRadius!, `and the barracks would not (${distance} > ${BUILDINGS.barracks.guardRadius})`);

  // The contract is whether a raid may land on the barn at all, so that is what is checked —
  // a strike picks one candidate out of many and would not reliably pick this one.
  const watched = (target: { x: number; y: number }, standing: { x: number; y: number }[]) => standing.some(post =>
    Math.hypot(target.x - post.x, target.y - post.y) <= BUILDINGS.castle.guardRadius!);
  const season = 'summer' as const;
  assert.equal(
    canStrike('bandits', barn, season, false, watched(barn, [{ x: castle.x, y: castle.y }])),
    false,
    'while the castle stands, the barn cannot be raided',
  );
  // The same barn with the castle out of action is fair game again.
  assert.equal(
    canStrike('bandits', barn, season, false, false),
    true,
    'and with no castle covering it, it can',
  );
  // And the barracks, at this distance, would not have reached it either.
  assert.ok(Math.hypot(barn.x - castle.x, barn.y - castle.y) > BUILDINGS.barracks.guardRadius!);
});

test('the castle only guards against bandits, not against fire or weather', () => {
  // The fire watch and the guard watch have stayed separate through every defence building, and
  // the castle must not quietly become a general-purpose shield.
  const world = prepared();
  const barn = at(world, 'lumber', 2, 26);
  const castle = at(world, 'castle', 12, 26);
  // Find a slot that is a fire in a season fire actually reaches, rather than assuming one.
  const seasonOf = (time: number) => (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor(time / SEASON_SECONDS) % 4];
  let fireAt = -1;
  for (let slot = 1; slot <= 240; slot++) {
    const t = slot * DISASTER_INTERVAL;
    if (DISASTER_KINDS[Math.floor(t / DISASTER_INTERVAL) % DISASTER_KINDS.length] !== 'fire') continue;
    if (!DISASTERS.fire.seasons.includes(seasonOf(t))) continue;
    fireAt = t; break;
  }
  assert.ok(fireAt > 0, 'some slot is a fire in a season fire reaches');
  const season = seasonOf(fireAt);
  // A castle within range does not stop a fire, and a fire watch does not stop bandits: the two
  // watches have been separate for every defence building and the castle must not merge them.
  assert.equal(canStrike('fire', barn, season, false, true), true, 'a castle is not a fire watch');
  assert.equal(canStrike('fire', barn, season, true, false), false, 'a fire watch is a fire watch');
  assert.equal(canStrike('bandits', barn, season, true, false), true, 'and a fire watch is not a guard');
  assert.equal(canStrike('bandits', barn, season, false, true), false, 'while a guard is a guard');
  world.state.gameTime = fireAt - 1; world.state.lastDisasterAt = 0;
  world.tick(1);
  assert.equal(validateSave(world.state), true);
});

test('the castle keeps the town valid through a save round trip', () => {
  const world = prepared();
  at(world, 'castle', 12, 26);
  // The castle claims three tiles from its corner, so the barracks stands clear of its yard —
  // and clear of the north–south street at x=16.
  at(world, 'barracks', 17, 26);
  world.state.settings.disasters = false;
  world.tick(91);
  assert.equal(validateSave(world.state), true);
  const restored = new SimWorld(JSON.parse(JSON.stringify(world.state)));
  assert.equal(restored.state.buildings.filter(b => b.kind === 'castle').length, 1, 'the castle survives a reload');
  assert.equal(validateSave(restored.state), true);
});

test('the castle is gated behind the trade the barracks already needs', () => {
  const locked = new SimWorld();
  assert.equal(locked.build('castle', 12, 26).code, 'TECHNOLOGY_REQUIRED', 'no metallurgy, no castle');
  assert.equal(locked.isUnlocked('castle'), false);
  const opened = prepared();
  assert.equal(opened.isUnlocked('castle'), true);
  assert.ok(RESOURCE_KEYS.includes('materials'), 'and its dearest ingredient is a caravan good');
});

test('the shipped castle sound is reused rather than a duplicate being generated', () => {
  const completion = JSON.parse(readFileSync(new URL('../public/assets/accessories-2026-09/audio/manifest.json', import.meta.url), 'utf8'));
  const entry = completion.buildingCoverage.castle;
  assert.ok(entry, 'the castle has a sound');
  assert.equal(entry.source, 'existing', 'and it is a track that already shipped');
  assert.match(entry.url, /castle\.wav$/);
  const first = JSON.parse(readFileSync(new URL('../public/assets/expansion-2026-09/audio/manifest.json', import.meta.url), 'utf8'));
  assert.ok(first.tracks.some((t: { url: string }) => t.url === entry.url), 'the url is a real shipped track');
  assert.equal(Object.keys(completion.buildingCoverage).length, completion.buildingCount, 'every building has exactly one sound');
});
