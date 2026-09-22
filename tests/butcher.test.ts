import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, migrateSave } from '../src/sim/world.ts';
import { BUILDINGS, PRODUCTION_SEQUENCE, RESOURCES, TAVERN_GOODS, TERMINAL_GOODS, careNeeds, emptyResources } from '../src/sim/data.ts';
import { LIVESTOCK } from '../src/sim/livestock.ts';

function quiet() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.settings.disasters = false;
  world.state.capacity = 4000;
  world.state.coins = 100000;
  world.state.researched = ['husbandry', 'viniculture'];
  world.state.resources = { ...emptyResources(), wood: 300, stone: 300, materials: 200 };
  return world;
}

test('the herd to shop to table chain is wired the way docs/04 §28 draws it', () => {
  // 猪场 uses feed and yields meat; 肉铺 turns meat into sausages; the tavern serves them.
  assert.deepEqual(BUILDINGS.pigfarm.input, { feed: 2 });
  assert.deepEqual(BUILDINGS.pigfarm.output, { meat: 4 });
  assert.deepEqual(BUILDINGS.butcher.input, { meat: 3 });
  assert.deepEqual(BUILDINGS.butcher.output, { sausages: 3 });
  assert.ok(TAVERN_GOODS.includes('sausages'), 'the tavern is where they are eaten');
  // Nothing else consumes meat, so the chain has exactly one direction.
  const consumers = (resource: string) => Object.entries(BUILDINGS)
    .filter(([, definition]) => (definition.input?.[resource as never] ?? 0) > 0)
    .map(([kind]) => kind).sort();
  assert.deepEqual(consumers('meat'), ['butcher']);
  assert.deepEqual(consumers('feed').includes('pigfarm'), true, 'the herd eats feed');
});

test('meat is an ingredient and sausages are a finished article, for the market guard', () => {
  // This is what keeps the market honest: it may trade sausages because nothing makes anything
  // out of them, and it must not trade meat because the butcher does.
  assert.equal(TERMINAL_GOODS.includes('meat'), false, 'meat is consumed, so the market must not sell it');
  assert.equal(TERMINAL_GOODS.includes('sausages'), true, 'sausages are finished');
  assert.ok(RESOURCES.meat.sellPrice < RESOURCES.sausages.sellPrice, 'and worth less than what they become');
  assert.ok(RESOURCES.sausages.sellPrice > 0 && RESOURCES.meat.sellPrice > 0);
});

test('a pig farm fed on feed produces meat, and waits when the feed runs out', () => {
  const world = quiet();
  world.build('pigfarm', 40, 30);
  const farm = world.state.buildings.find(b => b.kind === 'pigfarm')!;
  farm.paused = false; farm.progress = 0; farm.ready = false; farm.stock = {};
  // No feed, no pork — however long it runs.
  world.state.resources.feed = 0;
  world.tick(BUILDINGS.pigfarm.cycle! + 5);
  assert.equal(farm.ready, false, 'an unfed herd produces nothing');
  // With feed it works, and the feed is consumed exactly once.
  world.state.resources.feed = 10;
  world.tick(BUILDINGS.pigfarm.cycle! + 5);
  assert.equal(farm.ready, true, 'fed, it makes a batch');
  assert.equal(world.state.resources.feed, 8, 'two sacks went into it');
  assert.equal(world.collect(farm.id).ok, true);
  assert.equal(world.state.resources.meat, 4);
  assert.equal(validateSave(world.state), true);
});

test('the butcher turns meat into sausages and never touches the fishermen', () => {
  const world = quiet();
  world.build('butcher', 40, 30);
  const shop = world.state.buildings.find(b => b.kind === 'butcher')!;
  shop.paused = false; shop.progress = 0; shop.ready = false; shop.stock = {};
  // Fish is the town's staple food, not the butcher's input, despite docs/04 §28's eye-line.
  world.state.resources.fish = 60; world.state.resources.meat = 0;
  world.tick(BUILDINGS.butcher.cycle! + 5);
  assert.equal(shop.ready, false, 'fish does not become sausages');
  world.state.resources.meat = 9;
  world.tick(BUILDINGS.butcher.cycle! + 5);
  assert.equal(shop.ready, true);
  assert.equal(world.state.resources.meat, 6, 'three cuts went in');
  assert.equal(world.collect(shop.id).ok, true);
  assert.equal(world.state.resources.sausages, 3);
});

test('sausages are only a treat where the tavern can serve them, like beer', () => {
  const resources = emptyResources();
  resources.sausages = 40;
  resources.beer = 0;
  assert.equal(careNeeds(resources, 20, false).leisure, 0, 'nowhere to eat them means no comfort');
  assert.ok(careNeeds(resources, 20, true).leisure > 0, 'the tavern turns them into cheer');
  // And the tavern serves drinks and dishes together. Amounts are kept under the three-day
  // reserve on purpose: at 40 the reading is already pinned at 100, and two saturated readings
  // cannot show that one adds to the other.
  const small = { ...emptyResources(), sausages: 2 };
  const both = { ...emptyResources(), beer: 2, sausages: 2 };
  const alone = careNeeds(small, 20, true).leisure;
  const together = careNeeds(both, 20, true).leisure;
  assert.ok(alone > 0 && alone < 100, `a little of one good is a partial reserve, got ${alone}`);
  assert.ok(together > alone, 'beer and sausages add up on the same shelf');
});

test('the chain is ordered source to product, so one offline pass can walk it', () => {
  const at = (kind: string) => (PRODUCTION_SEQUENCE as readonly string[]).indexOf(kind);
  assert.ok(at('feedmill') < at('pigfarm'), 'feed before the herd eats it');
  assert.ok(at('pigfarm') < at('butcher'), 'meat before the shop');
  assert.ok(at('butcher') < at('tavern') || at('tavern') === -1, 'and the shop before the tavern that serves it');
});

test('the herd is a workshop, not a growing animal, so no piglet art is needed', () => {
  // The three livestock buildings age from young to adult and need young/adult art. The pig
  // farm is deliberately a plain workshop: no piglet frames were ever shipped, and inventing
  // a growth curve for an animal the art cannot draw would be worse than not having one.
  assert.equal((LIVESTOCK as Record<string, unknown>).pigfarm, undefined);
  assert.equal(BUILDINGS.pigfarm.autoCollect, true, 'the pork is collected for you');
  assert.equal(BUILDINGS.pigfarm.workers, 1);
});

test('a save from before meat existed loads and is completed', () => {
  const world = new SimWorld();
  const older = JSON.parse(JSON.stringify(world.state));
  delete older.resources.meat;
  delete older.resources.sausages;
  assert.equal(validateSave(older), false, 'a save missing a resource key is incomplete');
  const migrated = migrateSave(older)!;
  assert.equal(migrated.resources.meat, 0);
  assert.equal(migrated.resources.sausages, 0);
  assert.equal(validateSave(migrated), true);
});
