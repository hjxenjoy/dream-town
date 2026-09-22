import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, migrateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCES, RESOURCE_KEYS, TERMINAL_GOODS, emptyResources } from '../src/sim/data.ts';

/** A town with the roof off: everything paused, so only the workshop under test runs. */
function quiet() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  return world;
}

test('bread is flour and sugar, and the sugar comes from cane through the mill', () => {
  // docs/04 §2 writes the chain as 农田 → 甘蔗 → 糖厂 → 糖 → 面包房, so the recipes have to
  // line up in that order or the chain cannot actually be walked.
  assert.deepEqual(BUILDINGS.bakery.input, { flour: 3, sugar: 1 });
  assert.equal(BUILDINGS.bakery.output!.bread, 4);
  assert.deepEqual(BUILDINGS.sugarmill.input, { sugarcane: 6 });
  assert.equal(BUILDINGS.sugarmill.output!.sugar, 3);
  assert.equal(BUILDINGS.canefield.input, undefined, 'a field takes no ingredients');
  assert.equal(BUILDINGS.canefield.output!.sugarcane, 6);
  // And the chain is closed: nothing else consumes flour or cane, so neither can dead-end.
  const consumers = (resource: string) => Object.entries(BUILDINGS)
    .filter(([, definition]) => (definition.input?.[resource as never] ?? 0) > 0)
    .map(([kind]) => kind).sort();
  assert.deepEqual(consumers('sugarcane'), ['sugarmill']);
  assert.deepEqual(consumers('sugar'), ['bakery']);
});

test('one cane field, one mill and one bakery keep bread flowing to the residents', () => {
  const world = quiet();
  const by = (kind: keyof typeof BUILDINGS) => world.state.buildings.find(building => building.kind === kind)!;
  const mill = by('sugarmill'), bakery = by('bakery'), field = by('canefield');
  mill.paused = false; bakery.paused = false;
  world.state.resources.flour = 30; world.state.resources.sugar = 0; world.state.resources.sugarcane = 0;
  const breadBefore = world.state.resources.bread;

  // The field is unstaffed like any other field, so it starts producing on its own.
  field.progress = 0.99;
  world.tick(60);
  assert.ok(world.state.resources.sugarcane > 0 || mill.progress > 0, 'cane reaches the mill');

  // Give the mill cane directly and watch sugar appear, then bread from it.
  world.state.resources.sugarcane = 24;
  mill.progress = 0; mill.ready = false; mill.stock = {}; bakery.progress = 0;
  const sugarBefore = world.state.resources.sugar;
  world.tick(BUILDINGS.sugarmill.cycle! + 1);
  // A finished batch waits in the workshop's own stock until it is collected, so the sugar
  // is only in the warehouse after the collect — the same two-step every workshop uses.
  assert.equal(mill.ready, true, 'the mill turns cane into sugar');
  assert.equal(world.collect(mill.id).ok, true);
  assert.ok(world.state.resources.sugar > sugarBefore, 'and the sugar reaches the warehouse');
  world.state.resources.sugar = Math.max(world.state.resources.sugar, 3);
  world.tick(BUILDINGS.bakery.cycle! + 1);
  assert.ok(world.state.resources.bread >= breadBefore, 'and the bakery turns it into bread');
  assert.equal(validateSave(world.state), true);
});

test('a bakery with no sugar waits instead of baking on flour alone', () => {
  const world = quiet();
  const bakery = world.state.buildings.find(building => building.kind === 'bakery')!;
  bakery.paused = false; bakery.progress = 0;
  world.state.resources.flour = 30;
  world.state.resources.sugar = 0;
  world.tick(BUILDINGS.bakery.cycle! + 5);
  assert.equal(bakery.progress, 0, 'no sugar means no batch, however much flour there is');
  assert.equal(bakery.ready, false, 'and nothing was produced to collect either');
});

test('sugar is an ingredient, so the market neither sells it nor buys it', () => {
  // Selling a good that a workshop can convert into something dearer is the arbitrage the
  // market markup was sized around; sugar is exactly that, so it stays out of the market.
  assert.ok(!TERMINAL_GOODS.includes('sugar'), 'sugar is not a finished article');
  assert.ok(!TERMINAL_GOODS.includes('sugarcane'), 'nor is raw cane');
  assert.ok(TERMINAL_GOODS.includes('bread'), 'while bread, the chain出口, still is');
  // Value rises along the chain, so refining is never a loss and the finished loaf is the
  // most valuable thing on the shelf.
  assert.ok(RESOURCES.sugarcane.sellPrice < RESOURCES.sugar.sellPrice, 'cane is worth less than sugar');
  assert.ok(RESOURCES.sugar.sellPrice < RESOURCES.bread.sellPrice, 'and sugar less than the bread it becomes');
});

test('the opening town ships with a working sugar chain', () => {
  // Bread feeds the residents, so the starter town must be able to bake from minute one.
  const world = new SimWorld();
  const kinds = world.state.buildings.map(building => building.kind);
  assert.ok(kinds.includes('canefield'), 'the town starts with cane');
  assert.ok(kinds.includes('sugarmill'), 'and with a mill');
  assert.ok(kinds.includes('bakery'), 'and with the bakery that needs them');
  // Staffed within its population, with hands to spare for the player's next building.
  const workers = world.state.buildings.reduce((total, building) => total + (BUILDINGS[building.kind].workers ?? 0), 0);
  assert.ok(workers <= world.state.population, `${workers} workers for ${world.state.population} residents`);
  assert.ok(world.state.population - workers >= 3, 'and at least three residents are free to take a new job');
  assert.equal(validateSave(world.state), true);
});

test('a save written before sugar existed is completed, not rejected', () => {
  const world = new SimWorld();
  const older = JSON.parse(JSON.stringify(world.state));
  delete older.resources.sugarcane;
  delete older.resources.sugar;
  assert.equal(validateSave(older), false, 'a save missing a resource key is incomplete');
  const migrated = migrateSave(older)!;
  assert.equal(migrated.resources.sugarcane, 0);
  assert.equal(migrated.resources.sugar, 0);
  assert.equal(validateSave(migrated), true, 'and is topped up rather than refused');
  // A save that got the value wrong is still refused, not repaired.
  const wrong = JSON.parse(JSON.stringify(world.state));
  wrong.resources.sugar = '3';
  assert.equal(validateSave(wrong), false);
});

test('the new resources take shelf space, so they cannot silently crowd out the old ones', () => {
  const world = new SimWorld();
  const targets = world.stockTargets();
  for (const key of ['sugarcane', 'sugar'] as const) {
    assert.ok(targets[key] > 0, `${key} keeps a working buffer`);
    assert.ok(targets[key] < targets.flour, `${key} holds less than a staple input`);
  }
  assert.ok(RESOURCE_KEYS.includes('sugarcane') && RESOURCE_KEYS.includes('sugar'), 'both are real resources');
  const empty = emptyResources();
  assert.equal(empty.sugar, 0); assert.equal(empty.sugarcane, 0);
});
