import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SimWorld, validateSave, migrateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCES, TERMINAL_GOODS, emptyResources } from '../src/sim/data.ts';
import { DISASTER_KINDS } from '../src/sim/disasters.ts';
import { LIVESTOCK } from '../src/sim/livestock.ts';
import { cycleOf } from './support.ts';

function quiet() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.settings.disasters = false;
  world.state.capacity = 6000;
  world.state.coins = 100000;
  world.state.resources = { ...emptyResources(), wood: 300, stone: 300, materials: 200 };
  return world;
}

test('the lodge brings back both things docs/03 §27 says a hunt yields', () => {
  assert.deepEqual(BUILDINGS.hunterlodge.output, { pelt: 2, meat: 2 }, '皮毛/肉, in that order');
  assert.equal(BUILDINGS.hunterlodge.input, undefined, 'a hunt needs no ingredients');
  assert.equal(BUILDINGS.hunterlodge.autoCollect, true, 'and the catch is brought back for you');
  assert.ok(RESOURCES.pelt.sellPrice > 0);
  // The meat half feeds the chain that already exists; the pelt half is the town's cash.
  assert.equal(TERMINAL_GOODS.includes('meat'), false, 'meat is consumed, so it is not a finished article');
  assert.equal(TERMINAL_GOODS.includes('pelt'), true, 'nothing works pelts, so they are tradeable');
});

test('a hunt yields every round and never runs dry', () => {
  const world = quiet();
  world.build('hunterlodge', 40, 30);
  const lodge = world.state.buildings.find(b => b.kind === 'hunterlodge')!;
  lodge.paused = false;
  // Ten rounds in a row: the wood does not deplete, so every round yields the same as the first.
  const yields: number[] = [];
  for (let round = 0; round < 10; round++) {
    lodge.progress = 0; lodge.ready = false; lodge.stock = {};
    world.state.resources.pelt = 0; world.state.resources.meat = 0;
    world.tick(cycleOf(world, lodge));
    if (!lodge.ready) { yields.push(-1); continue; }
    world.collect(lodge.id);
    yields.push(world.state.resources.pelt);
  }
  assert.deepEqual(yields, Array(10).fill(2), 'every one of ten hunts returns the full catch');
  assert.equal(validateSave(world.state), true);
});

/**
 * The competitor teardown this building comes from lists it as a trap: the hunting ground is
 * exhausted and the over-hunting goes on to trigger a plague (docs/03 §27 and §74). This game
 * took the building and left the trap behind — the same way it already took the mine, which the
 * same list warns "矿脉会枯竭", and gave it an ore vein that never runs out.
 *
 * These two tests exist so that importing the trap later cannot happen by accident.
 */
test('the depletion trap the competitor pairs with the lodge was deliberately not imported', () => {
  // Nothing in the sim records a hunting ground, a stock of game, or a depletion state.
  const world = quiet();
  world.build('hunterlodge', 40, 30);
  const lodge = world.state.buildings.find(b => b.kind === 'hunterlodge')!;
  const fields = Object.keys(lodge);
  // (`stock` is not in this list: every workshop holds its finished batch there, including
  // the ones with no trap at all.)
  for (const trap of ['depleted', 'game', 'exhausted', 'quarry', 'overhunted', 'huntedOut']) {
    assert.equal(fields.includes(trap), false, `the lodge carries no "${trap}" state`);
  }
  // And the building definition has no notion of one either.
  // A closed interface, so the trap fields are looked for through an index view.
  const definition = BUILDINGS.hunterlodge as unknown as Record<string, unknown>;
  for (const trap of ['depletes', 'depletion', 'finite', 'yieldDecay']) {
    assert.equal(trap in definition, false, `the definition has no "${trap}"`);
  }
});

test('the lodge never sets a plague going, which is the other half of the competitor trap', () => {
  // docs/03 §74: 猎人屋过度捕猎会诱发瘟疫. This game has plagues, but they arrive on their own
  // clock (src/sim/plague.ts) and nothing a building does can start one.
  const source = readFileSync(new URL('../src/sim/plague.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('hunterlodge'), false, 'the plague rule does not know about the lodge');
  assert.equal(source.includes('hunting'), false, 'nor about hunts');
  // And an outbreak in a town full of lodges is still governed by the plague clock alone.
  const world = quiet();
  world.state.settings.disasters = true;
  world.state.researched = ['husbandry', 'mining'];
  for (const x of [30, 32, 34, 36]) world.build('hunterlodge', x, 30);
  world.state.lastPlagueAt = world.state.gameTime;
  let plaqued = false;
  for (let i = 0; i < 200; i++) { world.tick(1); if (world.state.plague) { plaqued = true; break; } }
  assert.equal(plaqued, false, 'four lodges do not bring a plague any sooner');
});

test('the mine, which the same list also calls a trap, still has no depletion either', () => {
  // Evidence that dropping the trap is this codebase's established reading of that list, not a
  // one-off decision made for the lodge.
  assert.equal(BUILDINGS.mine.input, undefined, 'a mine needs no input');
  assert.ok((BUILDINGS.mine.output?.ore ?? 0) > 0);
  const definition = BUILDINGS.mine as unknown as Record<string, unknown>;
  for (const trap of ['depletes', 'depletion', 'finite', 'vein']) {
    assert.equal(trap in definition, false, `the mine has no "${trap}" either`);
  }
});

test('the hunt is a workshop, not an ageing herd, so no young-animal art is needed', () => {
  assert.equal((LIVESTOCK as Record<string, unknown>).hunterlodge, undefined);
  assert.equal(BUILDINGS.hunterlodge.workers, 1);
});

test('the shipped hunter-lodge sound is reused rather than a duplicate being generated', () => {
  // The first asset batch named its tracks for the trade, so hunter-lodge.wav shipped before a
  // building existed to play it. Wiring it up beats synthesizing a second copy of the same idea.
  const completion = JSON.parse(readFileSync(new URL('../public/assets/accessories-2026-09/audio/manifest.json', import.meta.url), 'utf8'));
  const entry = completion.buildingCoverage.hunterlodge;
  assert.ok(entry, 'the lodge has a sound assigned');
  assert.equal(entry.source, 'existing', 'and it is the track that already shipped');
  assert.match(entry.url, /hunter-lodge\.wav$/);
  const first = JSON.parse(readFileSync(new URL('../public/assets/expansion-2026-09/audio/manifest.json', import.meta.url), 'utf8'));
  assert.ok(first.tracks.some((track: { url: string }) => track.url === entry.url), 'the url is a real shipped track');
  // The file itself exists on disk.
  const files = readdirSync(new URL('../public/assets/expansion-2026-09/audio/', import.meta.url));
  assert.ok(files.includes('hunter-lodge.wav'));
  // And every building still has exactly one sound: no duplicates were created for it.
  assert.equal(Object.keys(completion.buildingCoverage).length, completion.buildingCount);
});

test('a save from before pelts existed loads and is completed', () => {
  const world = new SimWorld();
  const older = JSON.parse(JSON.stringify(world.state));
  delete older.resources.pelt;
  assert.equal(validateSave(older), false, 'a save missing a resource key is incomplete');
  const migrated = migrateSave(older)!;
  assert.equal(migrated.resources.pelt, 0);
  assert.equal(validateSave(migrated), true);
});

test('the lodge is an early building and needs no research to raise', () => {
  // docs/03 §27 places it in the early game, so it must not sit behind a technology the way
  // the researched production chains do.
  assert.equal(BUILDINGS.hunterlodge.technology, undefined, 'no research gate');
  assert.ok(BUILDINGS.hunterlodge.cost <= 500, `cheap enough to be an early choice, got ${BUILDINGS.hunterlodge.cost}`);
  // And it is a real hazard target like any other workshop, so it is not silently immune.
  assert.ok(DISASTER_KINDS.length > 0);
});
