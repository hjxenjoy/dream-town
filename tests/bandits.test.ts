import test from 'node:test';
import assert from 'node:assert/strict';
import { DISASTERS, DISASTER_KINDS, RAID_LOSS_SHARE, canStrike, raidLoss } from '../src/sim/disasters.ts';
import { BUILDINGS, RESOURCE_KEYS, emptyResources } from '../src/sim/data.ts';

test('every hazard kind has a definition, and the bandit raid is one of them', () => {
  assert.deepEqual([...DISASTER_KINDS], ['fire', 'flood', 'drought', 'hail', 'insects', 'bandits']);
  for (const kind of DISASTER_KINDS) {
    const definition = DISASTERS[kind];
    assert.ok(definition, `${kind} has a definition`);
    assert.ok(definition.name && definition.log.includes('%s'), `${kind} names its victim`);
    assert.equal(definition.frames.length, 2, `${kind} animates on two frames`);
    assert.ok(definition.seasons.length > 0);
  }
});

test('bandits are answered by guardposts and barracks, and fire by the fire watch', () => {
  const market = { kind: 'market' as const, x: 10, y: 10 };
  // Seasons do not gate bandits: they can come at any time of year.
  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
    assert.equal(canStrike('bandits', market, season, false, false), true, `bandits in ${season}`);
  }
  assert.equal(canStrike('bandits', market, 'spring', false, true), false, 'a guarded building is not raided');
  // The two defence kinds are not interchangeable.
  assert.equal(canStrike('fire', market, 'summer', true, false), false, 'the fire watch stops fire');
  assert.equal(canStrike('fire', market, 'summer', false, true), true, 'but guardposts do not');
  assert.equal(canStrike('bandits', market, 'spring', true, false), true, 'and the fire watch does not stop bandits');
});

test('a raid takes a share of the shelves and never more than the ceiling', () => {
  const full = emptyResources();
  for (const key of RESOURCE_KEYS) full[key] = 100;
  const lost = raidLoss('bandits', full);
  const total = Object.values(lost).reduce((sum, amount) => sum + amount, 0);
  const stock = Object.values(full).reduce((sum, amount) => sum + amount, 0);
  assert.ok(total > 0, 'a stocked town loses something');
  assert.ok(total <= Math.floor(stock * RAID_LOSS_SHARE) + 1, `loss ${total} stays under the ceiling for ${stock}`);
  // Only goods the raid actually goes for, and never all of any one of them.
  for (const [key, amount] of Object.entries(lost) as [keyof typeof full, number][]) {
    assert.ok(DISASTERS.bandits.steals!.includes(key), `${key} is a good bandits take`);
    assert.ok(amount < full[key], `it never empties the ${key} shelf`);
  }
});

test('a raid on a poor town takes nothing, rather than putting it into debt', () => {
  const bare = emptyResources();
  assert.deepEqual(raidLoss('bandits', bare), {}, 'nothing to steal means nothing lost');
  // One item, one unit: the floor keeps it from being taken whole.
  const single = emptyResources();
  single.fish = 1;
  assert.deepEqual(raidLoss('bandits', single), {}, 'the last of something is left alone');
});

test('only the raid steals; the other hazards are damage-only', () => {
  const stocked = emptyResources();
  for (const key of RESOURCE_KEYS) stocked[key] = 50;
  for (const kind of DISASTER_KINDS) {
    if (kind === 'bandits') continue;
    assert.deepEqual(raidLoss(kind, stocked), {}, `${kind} carries nothing off`);
  }
});

test('bandits can reach houses and workshops, but never a farm field or the town hall', () => {
  const anything = { x: 10, y: 10 };
  assert.equal(canStrike('bandits', { ...anything, kind: 'cottage' }, 'winter', false, false), true);
  assert.equal(canStrike('bandits', { ...anything, kind: 'bakery' }, 'winter', false, false), true);
  assert.equal(canStrike('bandits', { ...anything, kind: 'farm' }, 'winter', false, false), false, 'fields are not raided');
  assert.equal(canStrike('bandits', { ...anything, kind: 'townhall' }, 'winter', false, false), false);
  // Decorations stay out of every hazard's reach, bandits included: a raided tree is noise.
  assert.equal(canStrike('bandits', { ...anything, kind: 'bench' }, 'winter', false, false), false);
  // A building already out of action is not hit again.
  assert.equal(canStrike('bandits', { ...anything, kind: 'cottage', damaged: true }, 'winter', false, false), false);
});

test('the new defence buildings exist and carry a guard radius the raid reads', () => {
  assert.ok(BUILDINGS.guardpost.guardRadius, 'a guardpost guards');
  assert.ok(BUILDINGS.barracks.guardRadius, 'a barracks guards');
  // Barracks see further but cost more and need a technology; the post is the early answer.
  assert.ok(BUILDINGS.barracks.guardRadius! > BUILDINGS.guardpost.guardRadius!);
  assert.ok(BUILDINGS.barracks.cost > BUILDINGS.guardpost.cost);
  assert.ok(BUILDINGS.guardpost.technology === undefined, 'the cheap post needs no research');
  assert.equal(BUILDINGS.wall.category, 'decoration', 'a wall is built like any other decoration');
});
