import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { GAME_DAY_SECONDS, RESOURCE_KEYS, TECHNOLOGIES, TECHNOLOGY_KEYS } from '../src/sim/data.ts';
import { HONOURS, HONOUR_TRACK_IDS, honourCapacity, honourCommunity, honourCycleFactor, honourLevel, honourSpent, honourSummary, nextHonourLevel } from '../src/sim/honours.ts';
import { ACHIEVEMENTS } from '../src/sim/achievements.ts';
import { COLLECTIONS, COLLECTION_IDS } from '../src/sim/collections.ts';
import { STORIES } from '../src/sim/stories.ts';

/**
 * A town at the level every honour is open for, with standing to spend. Achievements are
 * pre-unlocked so a level-12 town cannot pay out milestone prestige in the middle of an
 * assertion about prices.
 */
function town(level = 12, prestige = 200) {
  const w = new SimWorld();
  w.state.level = level;
  w.state.prestige = prestige;
  w.state.settings.disasters = false; w.state.settings.autoMayor = false;
  w.state.achievements = ACHIEVEMENTS.map(entry => entry.id);
  return w;
}

test('every honour track is well formed and its price rises', () => {
  for (const id of HONOUR_TRACK_IDS) {
    const track = HONOURS[id];
    assert.equal(track.id, id);
    assert.ok(track.name.length > 0 && track.description.length > 0, `${id} is described`);
    assert.ok(track.levels.length >= 3, `${id} can be deepened more than twice`);
    assert.ok(Number.isInteger(track.unlockLevel) && track.unlockLevel > 0, `${id} opens at a real level`);
    assert.ok(track.unit.length > 0, `${id} says what it is measured in`);
    let previous = 0;
    for (const level of track.levels) {
      assert.ok(level.cost > previous, `${id} costs more each level: ${level.cost} after ${previous}`);
      assert.ok(level.value > 0, `${id} gives something at every level`);
      assert.ok(level.note.length > 0, `${id} describes what the town did`);
      previous = level.cost;
    }
  }
  // Distinct names, so the panel never shows two of the same thing.
  assert.equal(new Set(HONOUR_TRACK_IDS.map(id => HONOURS[id].name)).size, HONOUR_TRACK_IDS.length);
});

test('the honours are priced against the standing the town actually earns', () => {
  // This is the point of the system: research alone is a small, one-time cost, so without a
  // sink the standing that everything else pays becomes inert. The sink must be able to
  // absorb a completionist's surplus, and must not be so cheap that it is bought out at once.
  const research = TECHNOLOGY_KEYS.reduce((total, id) => total + TECHNOLOGIES[id].prestige, 0);
  const sink = HONOUR_TRACK_IDS.reduce((total, id) => total + HONOURS[id].levels.reduce((sum, level) => sum + level.cost, 0), 0);
  const supply = ACHIEVEMENTS.reduce((total, entry) => total + entry.prestige, 0)
    + COLLECTION_IDS.reduce((total, id) => total + COLLECTIONS[id].tiers.reduce((sum, _tier, index) => sum + 4 * (index + 1), 0), 0)
    + STORIES.reduce((total, story) => total + story.stages.reduce((sum, stage) => sum + Math.max(0, ...stage.choices.map(choice => choice.effect.prestige ?? 0)), 0), 0);
  assert.ok(sink > research, `there is more to spend on than research alone: ${sink} vs ${research}`);
  assert.ok(sink >= supply * 0.5, `the sink absorbs a meaningful share of the standing: ${sink} of ${supply}`);
  assert.ok(sink <= supply * 2, `and does not dwarf it: ${sink} of ${supply}`);
  // Research must still be a real price, not a rounding error next to the sink.
  assert.ok(research >= sink * 0.3, `research still matters: ${research} against a ${sink} sink`);
});

test('a track cannot be deepened before its level, and nothing changes when refused', () => {
  const w = town(4, 200);
  for (const id of HONOUR_TRACK_IDS) assert.equal(w.observe().honours.find(row => row.id === id)!.unlocked, false, `${id} is shut at level 4`);
  const before = JSON.stringify(w.state);
  const refused = w.deepenHonour('granary');
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'HONOUR_LOCKED');
  assert.equal(JSON.stringify(w.state), before, 'a refusal costs nothing');
  // At its own level it opens, and not before.
  w.state.level = HONOURS.granary.unlockLevel;
  assert.equal(w.observe().honours.find(row => row.id === 'granary')!.unlocked, true);
  assert.equal(w.observe().honours.find(row => row.id === 'craft')!.unlocked, HONOURS.craft.unlockLevel <= HONOURS.granary.unlockLevel);
});

test('each deepening costs exactly the listed price and records the level', () => {
  const w = town();
  w.tick(0.1);
  let expected = w.state.prestige;
  for (const [index, level] of HONOURS.granary.levels.entries()) {
    const result = w.deepenHonour('granary');
    assert.equal(result.ok, true, result.message);
    expected -= level.cost;
    assert.equal(w.state.prestige, expected, `level ${index + 1} charged ${level.cost}`);
    assert.equal(honourLevel(w.state.honours!, 'granary'), index + 1);
  }
  const complete = w.deepenHonour('granary');
  assert.equal(complete.ok, false);
  assert.equal(complete.code, 'HONOUR_COMPLETE', 'a finished track cannot be bought again');
  assert.equal(w.state.prestige, expected, 'and a refused purchase costs nothing');
});

test('too little standing is refused without spending any', () => {
  const w = town(12, 5);
  w.tick(0.1);
  const before = JSON.stringify(w.state);
  const refused = w.deepenHonour('granary');
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'INSUFFICIENT_PRESTIGE');
  assert.equal(JSON.stringify(w.state), before, 'nothing is spent, not even partially');
  // With exactly enough it goes through.
  w.state.prestige = HONOURS.granary.levels[0]!.cost;
  assert.equal(w.deepenHonour('granary').ok, true);
  assert.equal(w.state.prestige, 0);
});

test('an unknown track is refused by name', () => {
  const w = town();
  w.tick(0.1);
  const before = JSON.stringify(w.state);
  assert.equal(w.deepenHonour('moon' as never).code, 'UNKNOWN_HONOUR');
  assert.equal(JSON.stringify(w.state), before);
});

test('the granary really adds storage, once per level', () => {
  const w = town();
  w.tick(0.1);
  const start = w.state.capacity;
  for (const [index, level] of HONOURS.granary.levels.entries()) {
    w.deepenHonour('granary');
    const expected = start + HONOURS.granary.levels.slice(0, index + 1).reduce((sum, entry) => sum + entry.value, 0);
    assert.equal(w.state.capacity, expected, `capacity after ${index + 1} levels`);
    assert.equal(honourCapacity(w.state.honours!), expected - start);
  }
  // The town can hold exactly what it could not before: filled to the old ceiling, the new
  // space is still free, and it is exactly what the levels bought.
  for (const key of RESOURCE_KEYS) w.state.resources[key] = 0;
  w.state.resources.wood = start;
  assert.equal(w.observe().warehouseFree, honourCapacity(w.state.honours!), 'the added space is usable and is exactly the bonus');
  assert.equal(validateSave(w.state), true);
});

test('the craft shortens production, and never below the floor', () => {
  const w = town();
  assert.equal(honourCycleFactor({}), 1, 'nothing bought means no change');
  const before = w.observe().production.find(p => p.cycle)!.cycle;
  for (let i = 0; i < HONOURS.craft.levels.length; i++) w.deepenHonour('craft');
  const after = w.observe().production.find(p => p.cycle)!.cycle;
  assert.ok(after < before, `production is faster: ${before} → ${after}`);
  const factor = honourCycleFactor(w.state.honours!);
  assert.ok(factor >= 0.8 && factor < 1, `the factor stays sane: ${factor}`);
  assert.ok(honourCycleFactor({ craft: 99 }) >= 0.8, 'a corrupt level cannot push it below the floor');
  assert.ok(honourCycleFactor({ craft: -5 }) === 1, 'nor can a negative one make it faster than it is');
});

test('the welcome track widens the community, which is what caps the population', () => {
  const w = town();
  const before = w.observe().communityCapacity;
  const housing = w.housingCapacity();
  for (let i = 0; i < HONOURS.welcome.levels.length; i++) w.deepenHonour('welcome');
  const after = w.observe().communityCapacity;
  assert.equal(after - before, honourCommunity(w.state.honours!));
  assert.ok(after > before, 'more people are welcome');
  // The town's ceiling is the smaller of housing and community, so widening the community only
  // raises it while homes are the binding side — which is the correct behaviour, not a bug.
  assert.equal(Math.min(housing, after) >= Math.min(housing, before), true, 'the ceiling never falls');
  assert.ok(after >= 12, 'the community base is preserved');
  assert.equal(validateSave(w.state), true);
});

test('honours survive a save round trip and a corrupt one is refused', () => {
  const w = town();
  w.deepenHonour('granary'); w.deepenHonour('craft');
  const restored = new SimWorld(structuredClone(w.state) as never);
  assert.deepEqual(restored.state.honours, w.state.honours, 'every level is preserved');
  assert.equal(restored.state.capacity, w.state.capacity, 'including the capacity they bought');
  assert.equal(validateSave(restored.state), true);

  for (const bad of [{ moon: 1 }, { granary: 99 }, { granary: -1 }, { granary: 1.5 }, { granary: 'two' }, 'granary']) {
    const corrupt = structuredClone(w.state) as unknown as Record<string, unknown>;
    corrupt.honours = bad;
    assert.equal(validateSave(corrupt), false, `refuses ${JSON.stringify(bad)}`);
  }
  const absent = structuredClone(w.state) as unknown as Record<string, unknown>;
  delete absent.honours;
  assert.equal(validateSave(absent), true, 'a save from before honours still loads');
  assert.equal(new SimWorld(absent).state.capacity, w.state.capacity, 'and keeps the capacity it had');
});

test('the tool surface reports each track with its price and effect', () => {
  const w = town();
  w.state.prestige = 100;
  w.deepenHonour('craft');
  const rows = w.observe().honours;
  assert.equal(rows.length, HONOUR_TRACK_IDS.length);
  const craft = rows.find(row => row.id === 'craft')!;
  // The summary's `level` is how many levels were bought; the track's own unlock threshold
  // lives in `unlockLevel`. Conflating the two is how a panel ends up reading "第 6 / 4 级".
  assert.equal(craft.level, 1);
  assert.equal(craft.unlockLevel, HONOURS.craft.unlockLevel);
  assert.ok(craft.level <= craft.max, 'the bought level can never exceed the track');
  assert.equal(craft.max, HONOURS.craft.levels.length);
  assert.equal(craft.next!.cost, HONOURS.craft.levels[1]!.cost);
  assert.ok(craft.earned > 0, 'what it has given so far is reported');
  assert.equal(honourSpent(w.state.honours!), HONOURS.craft.levels[0]!.cost, 'and so is what it cost');
  for (const row of rows) assert.ok(row.name.length > 0 && row.unit.length > 0);
});

test('a finished track reports no next level', () => {
  const w = town(12, 1000);
  w.tick(0.1);
  for (const id of HONOUR_TRACK_IDS) for (let i = 0; i < HONOURS[id].levels.length; i++) w.deepenHonour(id);
  for (const row of honourSummary(w.state.honours!)) {
    assert.equal(row.level, row.max);
    assert.equal(row.next, null);
  }
  assert.equal(nextHonourLevel(w.state.honours!, 'granary'), null);
  // Spending everything leaves the total consistent.
  assert.equal(honourSpent(w.state.honours!) + w.state.prestige, 1000);
  assert.equal(validateSave(w.state), true);
});

test('honours are optional depth: every effect is bounded and the town runs without them', () => {
  const w = town(12, 100000);
  for (const id of HONOUR_TRACK_IDS) for (let i = 0; i < HONOURS[id].levels.length; i++) w.deepenHonour(id);
  // Even bought out entirely, the stacked bonuses stay modest.
  assert.ok(honourCycleFactor(w.state.honours!) >= 0.9, 'production time falls by less than a tenth');
  assert.ok(w.state.capacity <= 240 + 40, `capacity grows by at most the listed amount: ${w.state.capacity}`);
  assert.ok(honourCommunity(w.state.honours!) <= 12, 'the community widens by a bounded amount');
  // And a town that spends nothing behaves exactly as before.
  const plain = town(12, 0);
  assert.equal(honourCycleFactor(plain.state.honours!), 1);
  assert.equal(honourSpent(plain.state.honours!), 0);
  for (let i = 0; i < 300; i++) plain.tick(0.5);
  assert.equal(validateSave(plain.state), true);
});

test('standing spent on honours is standing the town really had', () => {
  // The console must never be able to conjure capacity it could not pay for.
  const w = town(12, 0);
  w.tick(0.1);
  const capacity = w.state.capacity;
  assert.equal(w.deepenHonour('granary').ok, false);
  assert.equal(w.state.capacity, capacity, 'a refused purchase adds no capacity');
  // Earn the standing the way the game does, then buy with it.
  w.state.prestige = 6;
  assert.equal(w.deepenHonour('granary').ok, true);
  assert.equal(w.state.capacity, capacity + HONOURS.granary.levels[0]!.value);
  assert.equal(w.state.prestige, 0);
  // A tick does not re-grant anything.
  w.tick(GAME_DAY_SECONDS + 1);
  assert.equal(honourLevel(w.state.honours!, 'granary'), 1);
  assert.equal(honourCapacity(w.state.honours!), HONOURS.granary.levels[0]!.value);
});
