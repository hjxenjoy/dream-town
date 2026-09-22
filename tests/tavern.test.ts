import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave, migrateSave } from '../src/sim/world.ts';
import { BUILDINGS, LEISURE_GOODS, RESOURCES, TAVERN_GOODS, TERMINAL_GOODS, careNeeds, emptyResources } from '../src/sim/data.ts';
import { cycleOf } from './support.ts';

function quiet() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  return world;
}
/** What `observe()` reports a workshop is set to make and consume — the panel's own view. */
const recipeOf = (world: SimWorld, id: string) => {
  const row = world.observe().production.find(entry => entry.buildingId === id)!;
  return { input: row.input, output: row.output, focus: row.focus };
};
/** A researched town with the one workshop under test, and everything else idle. */
const townWith = (kind: keyof typeof BUILDINGS, level = 1) => {
  const world = quiet();
  // Research first: both the winery and the hops field sit behind 葡萄与酒.
  world.state.researched = ['husbandry', 'viniculture'];
  world.state.coins = 100000;
  // A roomy warehouse, as the other workshop suites use: these tests are about what a
  // workshop makes, and a full store would block collection for reasons of its own.
  world.state.capacity = 4000;
  world.state.resources = { ...emptyResources(), wood: 300, stone: 300, materials: 200 };
  assert.equal(world.build(kind, 40, 30).ok, true, `the town can build a ${kind}`);
  const building = world.state.buildings.find(b => b.kind === kind)!;
  building.level = level;
  return { world, building };
};

test('the winery makes both drinks docs/04 §24 gives it, and switches between them', () => {
  const { world, building } = townWith('winery');
  // Wine is the default, and is grapes.
  assert.equal(building.productionFocus ?? 'wine', 'wine');
  assert.deepEqual(recipeOf(world, building.id).output, { wine: 3 });
  assert.deepEqual(recipeOf(world, building.id).input, { grape: 6 });
  // Switching to beer changes the OUTPUT and the INGREDIENTS together. A winery that asked
  // for hops but still made wine would be the classic half-switched workshop.
  assert.equal(world.setProductionFocus(building.id, 'beer').ok, true);
  assert.deepEqual(recipeOf(world, building.id).output, { beer: 3 });
  assert.deepEqual(recipeOf(world, building.id).input, { hops: 6 });
  // And back again.
  assert.equal(world.setProductionFocus(building.id, 'wine').ok, true);
  assert.deepEqual(recipeOf(world, building.id).output, { wine: 3 });
  assert.deepEqual(recipeOf(world, building.id).input, { grape: 6 });
});

test('a winery set to beer actually brews beer from hops, end to end', () => {
  const { world, building } = townWith('winery');
  world.setProductionFocus(building.id, 'beer');
  building.paused = false; building.progress = 0; building.ready = false; building.stock = {};
  world.state.resources.grape = 0;
  world.state.resources.hops = 0;
  // No hops means no batch, however many grapes are lying about.
  world.state.resources.grape = 40;
  world.tick(cycleOf(world, building, 5));
  assert.equal(building.ready, false, 'grapes do not make beer');
  // Hops do.
  world.state.resources.hops = 24;
  world.tick(cycleOf(world, building, 5));
  assert.equal(building.ready, true, 'the hops make a batch');
  assert.equal(world.collect(building.id).ok, true, 'the batch can be collected');
  assert.ok(world.state.resources.beer >= 3, 'and beer reaches the warehouse');
  assert.equal(validateSave(world.state), true);
});

test('the hops field is a field like the others: no crew, and it yields hops', () => {
  assert.deepEqual(BUILDINGS.hopsfield.output, { hops: 6 });
  assert.equal(BUILDINGS.hopsfield.input, undefined, 'a field takes no ingredients');
  assert.equal(BUILDINGS.hopsfield.workers, undefined, 'and needs no hands, like cane and vines');
  // Without the research it has no blueprint; with it, it may be built.
  const locked = quiet();
  assert.equal(locked.isUnlocked('hopsfield'), false, 'it waits for the research that opens it');
  assert.equal(locked.build('hopsfield', 42, 30).code, 'TECHNOLOGY_REQUIRED');
  const { world, building } = townWith('hopsfield');
  assert.equal(building.kind, 'hopsfield');
  assert.equal(world.isUnlocked('hopsfield'), true);
});

test('beer only counts as a treat when a tavern is standing to serve it', () => {
  // The whole point of the tavern: docs/05 §2 said these goods had no 载体建筑.
  assert.ok(TAVERN_GOODS.includes('beer'));
  const resources = emptyResources();
  resources.beer = 60;
  for (const key of LEISURE_GOODS) resources[key] = 0;
  const without = careNeeds(resources, 20, false).leisure;
  const with_ = careNeeds(resources, 20, true).leisure;
  assert.equal(without, 0, 'beer in a town with nowhere to drink it is just cargo');
  assert.ok(with_ > 0, 'with a tavern it is a comfort like the others');
});

test('a town with no tavern loses nothing for its lack of beer', () => {
  // Bonus-only, as every care layer in this game is: the tavern adds cheer, its absence
  // never subtracts any. A town that never brews a drop is exactly where it was.
  const bare = careNeeds(emptyResources(), 20, false);
  assert.equal(bare.leisure, 0);
  const world = quiet();
  // No tavern anywhere, and no beer: the town's leisure reading is exactly zero, as it was
  // before beer existed. Nothing to subtract, because there is nothing to lose.
  assert.equal(world.observe().needs.leisure, 0);
  // Beer takes no shelf space until the town can actually brew it.
  assert.equal(world.stockTargets().beer, 0, 'no brewery means no beer buffer');
  // A winery set to brew is what puts beer on the shelf plan.
  const { world: brewing, building: brewery } = townWith('winery');
  brewing.setProductionFocus(brewery.id, 'beer');
  assert.ok(brewing.stockTargets().beer > 0, 'and a brewery gives it one');
});

test('the tavern is a service building that drinks its own stock down', () => {
  const { world, building } = townWith('tavern');
  assert.equal(building.kind, 'tavern');
  assert.equal(BUILDINGS.tavern.category, 'services');
  assert.ok(BUILDINGS.tavern.services! > 0, 'it serves the neighbourhood');
  // The observable effect of standing a tavern: with beer in store, the town now reads as
  // having some leisure, where the same town without one reads none.
  world.state.resources.beer = 60;
  world.tick(1);
  assert.ok(world.observe().needs.leisure > 0, 'a tavern turns beer into good cheer');
  const tavern = world.state.buildings.find(b => b.kind === 'tavern')!;
  taverndamaged: { tavern.damaged = true; }
  world.tick(1);
  assert.equal(world.observe().needs.leisure, 0, 'and a ruined tavern serves nobody');
  tavern.damaged = false;
  // A day passes with beer in the larder: some of it is drunk.
  world.state.resources.beer = 40;
  const before = world.state.resources.beer;
  world.state.settings.disasters = false;
  world.tick(400);
  assert.ok(world.state.resources.beer < before, 'beer is consumed, not just stored');
  // Buildings are excluded from being hazard targets only if infrastructure; the tavern is
  // an ordinary service, so it must still be repairable rather than exempt.
  assert.equal(BUILDINGS.tavern.cycle, undefined, 'it produces nothing');
});

test('beer and hops are real resources with sane prices, and beer is a finished good', () => {
  assert.ok(RESOURCES.hops.sellPrice < RESOURCES.beer.sellPrice, 'hops are worth less than the beer');
  assert.ok(RESOURCES.beer.sellPrice > RESOURCES.wine.sellPrice / 2, 'beer is a serious drink, not a token');
  // Beer has no consumer workshop, so it is a finished article the market may deal in;
  // hops are eaten by the winery, so they must not be.
  assert.ok(TERMINAL_GOODS.includes('beer'), 'beer is finished');
  assert.ok(!TERMINAL_GOODS.includes('hops'), 'hops are an ingredient, so the market must not sell them');
});

test('a save from before beer exists loads and is completed', () => {
  const world = new SimWorld();
  const older = JSON.parse(JSON.stringify(world.state));
  delete older.resources.hops;
  delete older.resources.beer;
  assert.equal(validateSave(older), false, 'a save missing a resource key is incomplete');
  const migrated = migrateSave(older)!;
  assert.equal(migrated.resources.hops, 0);
  assert.equal(migrated.resources.beer, 0);
  assert.equal(validateSave(migrated), true);
  // A workshop set to a recipe that belongs to another workshop is refused.
  const wrong = JSON.parse(JSON.stringify(world.state));
  wrong.buildings[0].productionFocus = 'beer';
  assert.equal(validateSave(wrong), false, 'a lumber mill cannot be set to brew');
});

test('the winery focus survives a save round trip', () => {
  const { world, building } = townWith('winery');
  world.setProductionFocus(building.id, 'beer');
  const restored = new SimWorld(JSON.parse(JSON.stringify(world.state)));
  const same = restored.state.buildings.find(b => b.id === building.id)!;
  assert.equal(same.productionFocus, 'beer');
  assert.deepEqual(recipeOf(restored, same.id).input, { hops: 6 });
  assert.equal(validateSave(restored.state), true);
});

test('the panel shows the recipe the workshop is set to, not the one in the blueprint', () => {
  // This shipped wrong once: the winery's switcher flipped, and the tick brewed beer, but the
  // detail panel still listed grapes because it read the static blueprint's input instead of
  // the building's current recipe. Any surface that shows a workshop's ingredients has to ask
  // what that workshop is making now, so the static input must not appear in the recipe row.
  const ui = readFileSync(new URL('../src/ui/GameUI.ts', import.meta.url), 'utf8');
  const row = /<div class="production-recipe">([\s\S]*?)<\/div>/.exec(ui)?.[1] ?? '';
  assert.ok(row.length > 0, 'the detail panel still renders a recipe row');
  assert.ok(row.includes('production'), 'and reads the production view, which knows the current recipe');
  assert.equal(row.includes('def.input'), false, 'rather than the blueprint, which does not');
});
