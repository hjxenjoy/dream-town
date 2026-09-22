import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, migrateSave } from '../src/sim/world.ts';
import { BUILDINGS, HERB_BOOST, RESOURCES, TERMINAL_GOODS, emptyResources, herbCoverage, herbsPerDay } from '../src/sim/data.ts';

/** A town with the roof off and a roomy warehouse, so only the thing under test moves. */
function quiet() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.settings.disasters = false;
  world.state.capacity = 6000;
  world.state.coins = 100000;
  world.state.resources = { ...emptyResources(), wood: 300, stone: 300, materials: 200 };
  return world;
}

test('the herb garden grows herbs on its own, like the other fields', () => {
  assert.deepEqual(BUILDINGS.herbgarden.output, { herbs: 4 });
  assert.equal(BUILDINGS.herbgarden.input, undefined, 'a garden takes no ingredients');
  assert.equal(BUILDINGS.herbgarden.autoCollect, true, 'and its crop is collected for you');
  assert.ok(RESOURCES.herbs.sellPrice > 0);
  // No workshop recipe consumes herbs: the clinic is their only user, and it is not a recipe.
  const consumers = Object.entries(BUILDINGS)
    .filter(([, definition]) => (definition.input?.['herbs' as never] ?? 0) > 0)
    .map(([kind]) => kind);
  assert.deepEqual(consumers, [], 'no workshop takes herbs as an ingredient');
  // That is exactly the market's test for a finished article — a purchase that no recipe can
  // turn into something dearer — so herbs are tradeable, and trading them is harmless: the only
  // thing they do is top up a clinic, which sells nothing. The markup still stops anyone
  // buying herbs to feed a garden, since the garden grows its own from nothing.
  assert.equal(TERMINAL_GOODS.includes('herbs'), true, 'nothing consumes them, so the market may trade them');
  assert.ok(RESOURCES.herbs.sellPrice * 18 > BUILDINGS.herbgarden.cost / 4, 'and the markup dwarfs growing your own');
});

test('a herb garden produces a crop without any input', () => {
  const world = quiet();
  world.build('herbgarden', 40, 30);
  const garden = world.state.buildings.find(b => b.kind === 'herbgarden')!;
  garden.paused = false; garden.progress = 0; garden.ready = false; garden.stock = {};
  world.state.resources.herbs = 0;
  world.tick(BUILDINGS.herbgarden.cycle! + 5);
  assert.equal(garden.ready, true, 'it yields a batch on its own');
  assert.equal(world.collect(garden.id).ok, true);
  assert.equal(world.state.resources.herbs, 4);
  assert.equal(validateSave(world.state), true);
});

test('herb coverage reads the same three-day reserve shape as the other care goods', () => {
  assert.equal(herbsPerDay(12), 2, 'twelve residents come to two bundles a day');
  assert.equal(herbCoverage(emptyResources(), 12), 0, 'no herbs reads nothing');
  const stocked = { ...emptyResources(), herbs: herbsPerDay(12) * 3 };
  assert.equal(herbCoverage(stocked, 12), 100, 'a three-day reserve reads full');
  const half = { ...emptyResources(), herbs: Math.floor(herbsPerDay(12) * 1.5) };
  assert.ok(herbCoverage(half, 12) > 0 && herbCoverage(half, 12) < 100, 'and half of it reads partial');
});

test('a clinic with herbs reaches further, and one without reaches exactly as far as before', () => {
  const bare = quiet();
  bare.build('clinic', 40, 30);
  // With no herbs the reading must be the clinic's own coverage, unchanged to the digit.
  bare.state.resources.herbs = 0;
  bare.tick(1);
  const souls = Math.max(1, bare.state.population);
  const served = BUILDINGS.clinic.health!;
  assert.equal(Math.round(bare.observe().needs.health), Math.round(Math.min(100, served / souls * 100)), 'no herbs, no change');

  // Stock the herb store and the same clinic now covers more people.
  const stocked = quiet();
  stocked.build('clinic', 40, 30);
  stocked.state.resources.herbs = herbsPerDay(stocked.state.population) * 3;
  stocked.tick(1);
  assert.equal(stocked.observe().illness.herbCoverage, 100, 'the store is full');
  assert.ok(stocked.observe().needs.health > bare.observe().needs.health, 'so the clinic reaches further');
});

test('a full herb store adds a real but bounded amount, never a free clinic', () => {
  // The boost is capped below one so a supply post extends the clinic rather than replacing the
  // need to build one: a town with herbs and no clinic still has no health reading at all.
  assert.ok(HERB_BOOST > 0 && HERB_BOOST < 1, `the boost is partial, got ${HERB_BOOST}`);
  const world = quiet();
  world.state.resources.herbs = herbsPerDay(world.state.population) * 3;
  world.tick(1);
  assert.equal(world.observe().needs.health, 0, 'herbs alone are not a clinic');
  assert.ok(world.observe().illness.herbCoverage > 0, 'even though the store is stocked');
});

test('the clinic works through herbs each day, and a town with no clinic spends none', () => {
  const withClinic = quiet();
  withClinic.build('clinic', 40, 30);
  withClinic.state.resources.herbs = 60;
  const before = withClinic.state.resources.herbs;
  withClinic.state.settings.autoMayor = false;
  // One game day of settling.
  withClinic.tick(91);
  assert.ok(withClinic.state.resources.herbs < before, 'the clinic uses its supply');

  const withoutClinic = quiet();
  withoutClinic.state.resources.herbs = 60;
  withoutClinic.tick(91);
  assert.equal(withoutClinic.state.resources.herbs, 60, 'with nowhere to use them, herbs keep');
});

test('the herb supply survives the offline settlement the same way it does online', () => {
  const world = quiet();
  world.build('clinic', 40, 30);
  world.state.resources.herbs = 200;
  const before = world.state.resources.herbs;
  const report = world.offline(3 * 90);
  assert.ok(world.state.resources.herbs < before, 'the days away used the supply too');
  assert.ok(report.consumed.herbs > 0, 'and the offline report accounts for it');
  assert.equal(validateSave(world.state), true);
});

test('a save from before herbs existed loads and is completed', () => {
  const world = new SimWorld();
  const older = JSON.parse(JSON.stringify(world.state));
  delete older.resources.herbs;
  assert.equal(validateSave(older), false, 'a save missing a resource key is incomplete');
  const migrated = migrateSave(older)!;
  assert.equal(migrated.resources.herbs, 0);
  assert.equal(validateSave(migrated), true, 'and is topped up rather than refused');
});
