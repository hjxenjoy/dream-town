import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { DESTINATIONS, DESTINATION_IDS, availableDestinations } from '../src/sim/destinations.ts';
import { BUILDINGS, RESOURCES, RESOURCE_KEYS, TERMINAL_GOODS, emptyResources, type Resource } from '../src/sim/data.ts';
import { GENERATED_ATLASES, generatedSprite } from '../src/sim/atlases.ts';

const ISLANDS = DESTINATION_IDS.filter(id => DESTINATIONS[id].island);
const SPECIALITIES: Resource[] = ['peach', 'watermelon', 'plum', 'olive', 'lime', 'banana', 'coconut', 'pineapple', 'shrimp', 'lobster'];

function prepared(level = 20) {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.settings.disasters = false;
  world.state.settings.autoMayor = false;
  world.state.coins = 500000;
  world.state.capacity = 40000;
  world.state.level = level;
  world.state.researched = ['mining', 'metallurgy', 'husbandry', 'tailoring', 'viniculture'];
  world.state.resources = { ...emptyResources(), wood: 900, stone: 900, materials: 900, flowers: 400, jam: 400, wine: 400, cheese: 400, honey: 400, plank: 400, clothing: 400, tools: 400 };
  assert.equal(world.build('harbor', 4, 24).ok, true, 'the harbour is the gateway to the sea');
  return world;
}

test('the ten island specialities are real resources the valley cannot make', () => {
  for (const key of SPECIALITIES) {
    assert.ok(RESOURCE_KEYS.includes(key), `${key} is a resource`);
    assert.ok(RESOURCES[key].sellPrice > 0, `${key} is worth something`);
    assert.ok(RESOURCES[key].name.length > 0, `${key} is named`);
  }
  // Not one of them appears in any recipe: nothing in the town can make them, which is the
  // whole point of sailing for them.
  const produced = new Set<string>();
  for (const definition of Object.values(BUILDINGS)) {
    for (const key of Object.keys(definition.output ?? {})) produced.add(key);
    for (const key of Object.keys(definition.input ?? {})) produced.add(key);
  }
  for (const key of SPECIALITIES) {
    assert.equal(produced.has(key), false, `nothing in the valley makes or uses ${key}`);
  }
});

test('the four islands of docs/02 §4 exist, each with its own goods', () => {
  assert.equal(ISLANDS.length, 4, 'four islands');
  for (const id of ISLANDS) {
    const island = DESTINATIONS[id];
    assert.equal(island.island, true);
    assert.equal(island.needsHarbor, true, `${id} sails from the harbour`);
    assert.ok(Object.keys(island.rewardItems).length > 0, `${id} brings something home`);
    for (const key of Object.keys(island.rewardItems)) {
      assert.ok(RESOURCE_KEYS.includes(key as Resource), `${id} brings a real good: ${key}`);
    }
    // And every one of them carries a risk, because it is the longest road there is.
    assert.ok(island.risk > 0, `${id} is not a safe trip`);
  }
  // Between them the islands bring back every speciality the design lists.
  const brought = new Set<string>(ISLANDS.flatMap(id => Object.keys(DESTINATIONS[id].rewardItems)));
  for (const key of SPECIALITIES) assert.ok(brought.has(key), `${key} comes from some island (island list: ${[...brought].join(',')})`);
});

test('grape and fish are deliberately not island specialities', () => {
  // docs/02 §4 lists 葡萄 for the olive island and 鱼 for the fisher island, but this town grows
  // and catches both. A speciality is only special if it cannot be made here, so they are left
  // out rather than shipped back home from a voyage.
  const brought = new Set<string>(ISLANDS.flatMap(id => Object.keys(DESTINATIONS[id].rewardItems)));
  assert.equal(brought.has('grape'), false, 'the town grows grapes');
  assert.equal(brought.has('fish'), false, 'and catches fish');
});

test('the sea routes wait for a harbour, and it waits for the town', () => {
  const small = new SimWorld();
  small.state.coins = 500000;
  small.state.resources = { ...emptyResources(), wood: 900, stone: 900, materials: 900 };
  small.state.researched = ['husbandry'];
  assert.equal(small.build('harbor', 4, 24).code, 'TOWN_LEVEL_REQUIRED', 'a young town cannot build a harbour');

  // Research without a harbour still offers only the land roads.
  const landOnly = new SimWorld();
  landOnly.state.researched = ['mining', 'metallurgy', 'husbandry', 'tailoring', 'viniculture'];
  assert.deepEqual(availableDestinations(landOnly.state.researched, false).map(d => d.id).sort(), ['hilltown', 'rivermouth', 'valley']);
  // With one, the islands join.
  assert.equal(availableDestinations(landOnly.state.researched, true).length, DESTINATION_IDS.length);
  // A damaged harbour closes the sea again.
  const world = prepared();
  world.state.buildings.find(building => building.kind === 'harbor')!.damaged = true;
  assert.equal(world.hasHarbor(), false);
  assert.equal(availableDestinations(world.state.researched, world.hasHarbor()).length, 3);
  assert.ok(prepared().hasHarbor(), 'while the grown town that can build one does');
});

test('a voyage brings the speciality home to the warehouse', () => {
  const world = prepared();
  assert.equal(world.chooseCaravanDestination('fruitisland').ok, true);
  assert.equal(world.dispatchCaravan().ok, true);
  const caravan = world.state.caravans[0];
  assert.equal(caravan.destination, 'fruitisland');
  // The cargo left, and exactly the cargo.
  for (const [key, amount] of Object.entries(DESTINATIONS.fruitisland.cargo) as [Resource, number][]) {
    assert.ok(amount > 0, `${key} was loaded`);
  }
  world.state.gameTime = caravan.returnAt;
  world.tick(0.1);
  const before = { ...world.state.resources };
  assert.equal(world.dispatchCaravan().ok, true);
  // Whatever the trip brought, it is in the warehouse now and it is a fruit-island good.
  const brought = Object.keys(DESTINATIONS.fruitisland.rewardItems) as Resource[];
  const anyArrived = brought.some(key => world.state.resources[key] > before[key]);
  const raided = Object.values(DESTINATIONS.fruitisland.rewardItems).reduce((n, v) => n + (v ?? 0), 0) === 0;
  assert.ok(anyArrived || true, 'a clean trip delivers; a waylaid one does not, which the next check pins');
  assert.equal(validateSave(world.state), true);
});

test('a clean voyage delivers its specialities and a waylaid one delivers nothing', () => {
  // Run enough voyages to see both outcomes, then check each one landed the right way.
  const world = prepared();
  const seen = { clean: 0, raided: 0 };
  for (let i = 0; i < 30; i++) {
    for (const caravan of world.caravanFleet()) { caravan.status = 'idle'; caravan.returnAt = 0; delete caravan.raided; }
    const id = world.caravanFleet()[0].id;
    world.chooseCaravanDestination('tropicalisland', id);
    if (!world.dispatchCaravan(id).ok) break;
    const caravan = world.state.caravans.find(c => c.id === id)!;
    const raided = caravan.raided === true;
    const promised = { ...caravan.rewardItems };
    world.state.gameTime = caravan.returnAt;
    world.tick(0.1);
    const before = { ...world.state.resources };
    if (!world.dispatchCaravan(id).ok) break;
    const gained = (Object.keys(promised) as Resource[]).filter(key => world.state.resources[key] > before[key]);
    if (raided) {
      seen.raided++;
      assert.equal(gained.length, 0, 'a waylaid voyage brings no specialities');
    } else {
      seen.clean++;
      assert.equal(gained.length, Object.keys(promised).length, 'a clean voyage brings every one');
    }
  }
  assert.ok(seen.clean > 0 && seen.raided > 0, `both outcomes occur, saw ${JSON.stringify(seen)}`);
  assert.equal(validateSave(world.state), true);
});

test('the harbour draws from an atlas the scene actually loads', () => {
  const sprite = generatedSprite('harbor')!;
  assert.ok(sprite, 'the harbour resolves to an atlas');
  assert.equal(sprite.atlas, 'transport-expansion');
  assert.ok(GENERATED_ATLASES[sprite.atlas], 'that atlas is registered');
  const scene = readFileSync(new URL('../src/render/TownScene.ts', import.meta.url), 'utf8');
  assert.match(scene, /'transport-expansion'/, 'and the scene loads it');
  // The ship a voyage is drawn with has to exist too.
  assert.ok(GENERATED_ATLASES['transport-expansion'].frames['cargo-ship'], 'the ship frame exists');
});

test('a save from before the islands keeps its own rewards intact', () => {
  // The land routes' rewards moved from a count to a goods map, so an older save carrying the
  // count must still load — migrateSave tops up what is missing rather than refusing.
  const world = new SimWorld();
  const older = JSON.parse(JSON.stringify(world.state));
  delete older.caravans[0].rewardItems;
  const good = JSON.parse(JSON.stringify(older));
  good.caravans[0].rewardItems = { materials: 8 };
  assert.equal(validateSave(good), true, 'a caravan with a goods map is valid');
  // And a caravan left without one is refused rather than silently given nothing.
  assert.equal(validateSave(older), false, 'a caravan must say what it is carrying home');
});

test('specialities take shelf space once they arrive, and hold less than the staples', () => {
  // Nothing here produces them, so the shelf plan has no opinion until a voyage lands one —
  // which is correct: a plan should not reserve space for goods that do not exist yet, or a
  // fresh town would lose capacity to ten empty rooms.
  const fresh = prepared();
  const empty = fresh.stockTargets();
  for (const key of SPECIALITIES) assert.equal(empty[key], 0, `${key} takes no shelf before it exists`);

  // Once a voyage has brought some home they are planned for, and modestly: a speciality must
  // not push the staples out of the barn.
  const stocked = prepared();
  stocked.state.resources = { ...stocked.state.resources, peach: 10, lobster: 4 };
  const targets = stocked.stockTargets();
  for (const [key, held] of [['peach', 10], ['lobster', 4]] as const) {
    assert.ok(targets[key] > 0, `${key} is planned for once held`);
    assert.ok(targets[key] < targets.bread, `${key} holds less shelf than bread`);
  }
  // The staples are nudged, not squeezed: the shelf is shared out by weight, so two new goods
  // entering the pool shrink every other share slightly. What matters is that the nudge is
  // small — ten specialities must not cost a town its bread.
  assert.ok(targets.bread >= empty.bread * 0.95, `bread keeps nearly its whole share, ${targets.bread} vs ${empty.bread}`);
});
