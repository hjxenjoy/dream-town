import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, FOCUS_RECIPES, RESOURCES, SOUVENIR_SHOP_MULTIPLIER, TERMINAL_GOODS, ZOO_SPECIES, ZOO_SPECIES_NAMES, emptyResources } from '../src/sim/data.ts';
import { GENERATED_ATLASES, generatedSprite } from '../src/sim/atlases.ts';

/** A town with money, materials and husbandry, but nothing built yet. */
function prepared(level = 20) {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.settings.disasters = false;
  world.state.coins = 500000;
  world.state.capacity = 9000;
  world.state.level = level;
  world.state.researched = ['mining', 'husbandry'];
  world.state.resources = { ...emptyResources(), wood: 900, stone: 900, materials: 400, feed: 600 };
  return world;
}

test('the zoo is a second line: a gate, then enclosures, then a shop', () => {
  assert.equal(BUILDINGS.zoogate.category, 'services');
  assert.equal(BUILDINGS.zooenclosure.category, 'production');
  assert.equal(BUILDINGS.zooshop.category, 'services');
  assert.equal(BUILDINGS.zooenclosure.needsZooGate, true, 'an enclosure needs a zoo around it');
  assert.equal(BUILDINGS.zooshop.needsZooGate, true, 'and so does the shop');
  assert.equal(BUILDINGS.zoogate.needsZooGate, undefined, 'the gate is the thing that opens it');
  assert.equal(BUILDINGS.zoogate.minTownLevel, 12, 'the zoo arrives late, as the design says');
});

test('nothing zoo-shaped can be raised before the gate, and the gate waits for the level', () => {
  const tooSmall = prepared(5);
  assert.equal(tooSmall.build('zoogate', 4, 24).code, 'TOWN_LEVEL_REQUIRED', 'a young town cannot start a zoo');
  const grown = prepared(20);
  assert.equal(grown.build('zoogate', 4, 24).ok, true);
  // A second gate is refused: there is one zoo.
  assert.equal(grown.build('zoogate', 8, 24).code, 'UNIQUE_BUILDING');
  // And with the gate up, the rest of the zoo opens.
  assert.equal(grown.build('zooenclosure', 8, 24).ok, true);
  assert.equal(grown.build('zooshop', 12, 24).ok, true);
  assert.equal(validateSave(grown.state), true);
});

test('without a gate, enclosures and shops are refused', () => {
  const world = prepared(20);
  assert.equal(world.build('zooenclosure', 8, 24).code, 'ZOO_GATE_REQUIRED');
  assert.equal(world.build('zooshop', 12, 24).code, 'ZOO_GATE_REQUIRED');
});

test('every animal has its own appetite and its own drawing power', () => {
  const recipes = FOCUS_RECIPES.zooenclosure!;
  assert.deepEqual(Object.keys(recipes).sort(), [...ZOO_SPECIES].sort(), 'one recipe per species');
  for (const species of ZOO_SPECIES) {
    const recipe = recipes[species]!;
    assert.ok((recipe.input.feed ?? 0) > 0, `${species} eats`);
    assert.ok((recipe.output.souvenir ?? 0) > 0, `${species} draws a crowd`);
    assert.ok(ZOO_SPECIES_NAMES[species].length > 0, `${species} is named in the panel`);
  }
  // A lion is not a zebra: the species are genuinely different choices, cheapest to dearest.
  const eaten = ZOO_SPECIES.map(species => recipes[species]!.input.feed!);
  const drawn = ZOO_SPECIES.map(species => recipes[species]!.output.souvenir!);
  assert.ok(Math.max(...eaten) > Math.min(...eaten), 'appetites differ');
  assert.ok(Math.max(...drawn) > Math.min(...drawn), 'yields differ');
  // And nothing draws a crowd out of proportion to what it eats.
  for (const species of ZOO_SPECIES) {
    const recipe = recipes[species]!;
    assert.ok(recipe.output.souvenir! / recipe.input.feed! <= 2, `${species} is not a money press`);
  }
});

test('an enclosure opens with a resident and can be changed to another species', () => {
  const world = prepared(20);
  world.build('zoogate', 4, 24);
  const built = world.build('zooenclosure', 8, 24);
  const enclosure = world.state.buildings.find(building => building.id === built.buildingId)!;
  // Never an empty pen: it opens housing the default species.
  assert.equal(enclosure.productionFocus, 'zebra');
  assert.equal(world.setProductionFocus(enclosure.id, 'lion').ok, true);
  assert.equal(enclosure.productionFocus, 'lion');
  // The recipe follows the species, exactly as a workshop's recipe follows its focus.
  const row = world.observe().production.find(entry => entry.buildingId === enclosure.id)!;
  assert.deepEqual(row.input, { feed: 3 });
  assert.deepEqual(row.output, { souvenir: 5 });
  assert.equal(world.setProductionFocus(enclosure.id, 'lion').ok, false, 'no change is refused as such');
  // A species that does not exist is refused.
  assert.equal(world.setProductionFocus(enclosure.id, 'dragon').ok, false);
});

test('a fed enclosure makes souvenirs and an unfed one waits', () => {
  const world = prepared(20);
  world.build('zoogate', 4, 24);
  const built = world.build('zooenclosure', 8, 24);
  const pen = world.state.buildings.find(building => building.id === built.buildingId)!;
  pen.workers = 1; pen.paused = false; pen.progress = 0; pen.ready = false; pen.stock = {};
  world.state.resources.feed = 0;
  world.tick(BUILDINGS.zooenclosure.cycle! + 5);
  assert.equal(pen.ready, false, 'no feed, no visitors');
  world.state.resources.feed = 30;
  world.tick(BUILDINGS.zooenclosure.cycle! + 5);
  assert.equal(pen.ready, true);
  assert.equal(world.collect(pen.id).ok, true);
  assert.equal(world.state.resources.souvenir, 3, 'the zebra brought three');
});

test('the shop makes every souvenir worth more, and only while it stands', () => {
  const world = prepared(20);
  world.build('zoogate', 4, 24);
  const before = world.observe().zoo.souvenirValue;
  assert.equal(before, RESOURCES.souvenir.sellPrice, 'with no shop, the plain price');
  const shop = world.build('zooshop', 12, 24);
  const after = world.observe().zoo.souvenirValue;
  assert.equal(after, Math.round(RESOURCES.souvenir.sellPrice * SOUVENIR_SHOP_MULTIPLIER), 'the shop lifts it');
  assert.ok(after > before);
  // Only souvenirs are affected: a shop does not reprice the rest of the town's goods.
  assert.equal(world.sellValue('bread'), RESOURCES.bread.sellPrice);
  assert.equal(world.sellValue('pelt'), RESOURCES.pelt.sellPrice);
  // A damaged shop serves nobody.
  world.state.buildings.find(building => building.id === shop.buildingId)!.damaged = true;
  assert.equal(world.observe().zoo.souvenirValue, before, 'a ruined shop is not a shop');
});

test('souvenirs are a finished article the market may trade', () => {
  assert.equal(TERMINAL_GOODS.includes('souvenir'), true, 'nothing consumes them');
  assert.ok(RESOURCES.souvenir.sellPrice > 0);
  const zoo: { hasGate: boolean; enclosures: unknown[]; hasShop: boolean } = new SimWorld().observe().zoo;
  assert.equal(zoo.hasGate, false);
  assert.deepEqual(zoo.enclosures, []);
  assert.equal(zoo.hasShop, false);
});

test('the zoo reports what it holds, so the panel and the tests agree', () => {
  const world = prepared(20);
  world.build('zoogate', 4, 24);
  const first = world.build('zooenclosure', 8, 24);
  const second = world.build('zooenclosure', 10, 24);
  world.setProductionFocus(second.buildingId!, 'elephant');
  const zoo = world.observe().zoo;
  assert.equal(zoo.hasGate, true);
  assert.equal(zoo.enclosures.length, 2);
  assert.equal(zoo.enclosures.find(entry => entry.buildingId === first.buildingId)!.name, '斑马');
  assert.equal(zoo.enclosures.find(entry => entry.buildingId === second.buildingId)!.name, '大象');
});

test('every zoo sprite is registered against an atlas the scene loads', () => {
  const scene = readFileSync(new URL('../src/render/TownScene.ts', import.meta.url), 'utf8');
  for (const kind of ['zoogate', 'zooenclosure', 'zooshop'] as const) {
    const sprite = generatedSprite(kind)!;
    assert.ok(sprite, `${kind} resolves to an atlas`);
    assert.ok(GENERATED_ATLASES[sprite.atlas], `${kind}'s atlas is registered`);
    assert.match(scene, new RegExp(`'${sprite.atlas}'`), `${kind}'s atlas ${sprite.atlas} is loaded by the scene`);
  }
  // The zoo's own pack also holds the animals, which are not buildings yet; that is recorded
  // rather than quietly left as a mystery.
  for (const animal of ['elephant', 'giraffe', 'zebra', 'lion', 'zoo-keeper', 'zoo-feed']) {
    assert.ok(GENERATED_ATLASES['zoo-expansion'].frames[animal], `${animal} art exists for later use`);
  }
});
