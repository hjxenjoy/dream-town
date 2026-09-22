import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, FOCUS_RECIPES, MINING_TOOLS, MINING_TOOL_CHEST, MINING_TOOL_ANTIQUE_CHANCE, RESOURCES, emptyResources, type MiningTool, type Resource } from '../src/sim/data.ts';

function prepared() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.settings.disasters = false;
  world.state.settings.autoMayor = false;
  world.state.coins = 500000;
  world.state.capacity = 20000;
  world.state.researched = ['mining', 'metallurgy'];
  world.state.resources = { ...emptyResources(), wood: 900, stone: 900, materials: 400, charcoal: 400, ingot: 200, plank: 200 };
  assert.equal(world.build('mine', 4, 24).ok, true, 'a mine to swing at');
  assert.equal(world.build('smithy', 6, 24).ok, true, 'and a smithy to forge the tools');
  for (const tool of MINING_TOOLS) world.state.resources[tool] = 10;
  return world;
}
const mineOf = (world: SimWorld) => world.state.buildings.find(b => b.kind === 'mine')!;

test('docs/02 §5 gives three mining tools, and the smithy forges all three', () => {
  assert.deepEqual([...MINING_TOOLS], ['pickaxe', 'dynamite', 'tnt'], 'a pickaxe, dynamite and TNT');
  for (const tool of MINING_TOOLS) {
    assert.ok(RESOURCES[tool], `${tool} is a real good`);
    const recipe = FOCUS_RECIPES.smithy![tool];
    assert.ok(recipe, `${tool} has a forging recipe`);
    // All three are worked metal: they cost an ingot, and the wider blast costs more.
    assert.ok((recipe.input.ingot ?? 0) > 0, `${tool} costs an ingot`);
  }
  // TNT opens the most ground and is the dearest, so the ladder is a real choice.
  const cost = (tool: MiningTool) => Object.entries(FOCUS_RECIPES.smithy![tool]!.input)
    .reduce((n, [key, amount]) => n + RESOURCES[key as Resource].sellPrice * amount!, 0);
  assert.ok(cost('pickaxe') < cost('dynamite'), 'dynamite is dearer than a pickaxe');
  assert.ok(cost('dynamite') < cost('tnt'), 'and TNT dearest of all');
  assert.ok(MINING_TOOL_CHEST.pickaxe < MINING_TOOL_CHEST.dynamite, 'a wider blast opens a better chest');
  assert.ok(MINING_TOOL_CHEST.dynamite < MINING_TOOL_CHEST.tnt);
  assert.ok(MINING_TOOL_ANTIQUE_CHANCE.pickaxe < MINING_TOOL_ANTIQUE_CHANCE.tnt, 'and finds more of what is buried');
});

test('the smithy really forges each of the three, through the town and not just the table', () => {
  const world = prepared();
  const smithy = world.state.buildings.find(b => b.kind === 'smithy')!;
  smithy.paused = false; smithy.workers = 2;
  for (const tool of MINING_TOOLS) {
    const switched = world.setProductionFocus(smithy.id, tool);
    assert.equal(switched.ok, true, switched.message);
    smithy.ready = false; smithy.progress = 0; smithy.stock = {};
    world.state.resources[tool] = 0;
    world.state.resources.ingot = 100; world.state.resources.plank = 100; world.state.resources.charcoal = 100;
    const row = world.observe().production.find(r => r.buildingId === smithy.id)!;
    assert.equal(row.focus, tool, 'the panel reports the tool being forged');
    assert.ok((row.input.ingot ?? 0) > 0, 'and the ingot it costs');
    world.tick(row.cycle + 2);
    assert.equal(smithy.ready, true, `${tool} came out of the forge`);
    assert.equal(world.collect(smithy.id).ok, true);
    assert.ok(world.state.resources[tool] > 0, `${tool} is in the warehouse`);
  }
  // A smithy cannot be set to something it has no recipe for.
  assert.equal(world.setProductionFocus(smithy.id, 'banana').ok, false);
  assert.equal(validateSave(world.state), true);
});

test('a swing brings up the batch in the shaft instead of waiting for it', () => {
  const world = prepared();
  const mine = mineOf(world);
  mine.paused = false; mine.ready = false; mine.progress = 0;
  world.tick(10);
  const partway = mine.progress;
  assert.ok(partway > 0 && partway < 1, 'the shaft is part worked');

  const before = { ...world.state.resources }, coins = world.state.coins;
  const result = world.useMiningTool(mine.id, 'pickaxe');
  assert.equal(result.ok, true, result.message);
  assert.equal(mine.ready, true, 'the batch is up');
  assert.equal(world.state.resources.pickaxe, before.pickaxe - 1, 'one pickaxe is spent');
  assert.equal(world.state.coins, coins + MINING_TOOL_CHEST.pickaxe, 'and the chest paid out');
  // Nothing else moved: a swing is time and a chest, never free goods.
  for (const key of Object.keys(before) as Resource[]) {
    if (key === 'pickaxe') continue;
    assert.equal(world.state.resources[key], before[key], `${key} must not change`);
  }
});

test('a tool can never conjure ore faster than the mine digs it', () => {
  // The guard that keeps this from being a money pump: a swing finishes work already under way,
  // so collect-and-swing in a loop yields nothing, and ore still arrives at one batch per cycle
  // however many tools are in the barn. Swing as fast as the API allows and see.
  const world = prepared();
  const mine = mineOf(world);
  mine.paused = false; mine.ready = false; mine.progress = 0;
  const cycle = world.observe().production.find(row => row.buildingId === mine.id)!.cycle;
  world.state.resources.pickaxe = 500;
  const elapsed = cycle * 5;
  let swings = 0, steps = 0;
  const step = elapsed / 600;
  while (steps++ * step < elapsed) {
    if (mine.ready) world.collect(mine.id);
    if (world.useMiningTool(mine.id, 'pickaxe').ok) swings++;
    world.tick(step);
    if (mine.ready) world.collect(mine.id);
  }
  assert.ok(swings > 0, 'swings happened, so the loop was really trying');
  // Five cycles of shaft time cannot yield more than five batches, whatever the tools do.
  assert.ok(world.state.resources.ore <= 5 * 5, `${swings} swings over five cycles brought up ${world.state.resources.ore} ore, within five batches`);
});

test('the swing is refused when there is nothing to bring up, or nothing to swing', () => {
  const world = prepared();
  const mine = mineOf(world);
  // Nothing in the shaft yet.
  mine.ready = false; mine.progress = 0; mine.paused = true;
  const stopped = world.useMiningTool(mine.id, 'pickaxe');
  assert.equal(stopped.ok, false, 'a stopped shaft has nothing in it to bring up');
  assert.match(stopped.message, /还没开挖/);

  // Nor can a tool open a batch that was never started — the guard against a swing loop.
  mine.paused = false; mine.progress = 0;
  const nothing = world.useMiningTool(mine.id, 'pickaxe');
  assert.equal(nothing.ok, false, 'the shaft has to be actually working');
  assert.match(nothing.message, /还没开挖/);

  mine.ready = true;
  const ready = world.useMiningTool(mine.id, 'pickaxe');
  assert.equal(ready.ok, false, 'and neither can one already up');
  assert.match(ready.message, /先收走/, 'and it says so plainly');

  mine.ready = false; mine.progress = 0; mine.paused = false;
  world.state.resources.dynamite = 0;
  assert.equal(world.useMiningTool(mine.id, 'dynamite').ok, false, 'no dynamite, no blast');
  assert.equal(world.useMiningTool(mine.id, 'shovel' as never).ok, false, 'and there is no shovel');

  // A smithy is not a mine; tools belong down the shaft.
  const smithy = world.state.buildings.find(b => b.kind === 'smithy')!;
  assert.equal(world.useMiningTool(smithy.id, 'tnt').ok, false);
  assert.equal(world.useMiningTool('nope', 'tnt').ok, false);
  assert.equal(validateSave(world.state), true);
});

test('using a tool is never a money pump, at any seam', () => {
  // What the swing hands back is the chest plus a chance of an antique; the ore is the batch the
  // mine had already dug and would have handed over anyway, so it is not counted here. If a tool
  // ever paid out more than it cost to forge, the chain would print coins.
  for (const tool of MINING_TOOLS) {
    const recipe = FOCUS_RECIPES.smithy![tool]!;
    const batch = Object.values(recipe.output)[0]!;
    const makeCost = Object.entries(recipe.input)
      .reduce((n, [key, amount]) => n + RESOURCES[key as Resource].sellPrice * amount!, 0) / batch;
    const expected = MINING_TOOL_CHEST[tool] + MINING_TOOL_ANTIQUE_CHANCE[tool] * RESOURCES.antique.sellPrice;
    assert.ok(expected < makeCost, `${tool}: a swing is worth ${expected.toFixed(1)} against a cost of ${makeCost.toFixed(1)}`);
  }
});

test('the antique is drawn, not rolled, so a save cannot be reloaded for a better shaft', () => {
  const world = prepared();
  const swing = (w: SimWorld) => {
    const mine = mineOf(w);
    mine.ready = false; mine.progress = 0.5; mine.paused = false;
    w.state.resources.pickaxe = 5;
    return w.useMiningTool(mine.id, 'pickaxe');
  };
  swing(world);
  assert.equal(world.state.stats.miningToolsUsed, 1, 'the swing was counted');
  // From the same counter, the same tool finds the same thing — so reloading cannot reroll it.
  const reloaded = new SimWorld(JSON.parse(JSON.stringify(world.state)));
  for (const building of reloaded.state.buildings) building.paused = true;
  const first = swing(world), second = swing(reloaded);
  assert.equal(first.ok, true, first.message);
  assert.equal(second.ok, true, second.message);
  assert.equal(first.antique, second.antique, 'the same swing count finds the same thing');
  assert.equal(world.state.stats.miningToolsUsed, reloaded.state.stats.miningToolsUsed);
});

test('what the swing finds reaches the warehouse and the save survives', () => {
  const world = prepared();
  const mine = mineOf(world);
  mine.paused = false; mine.ready = false; mine.progress = 0;
  world.state.resources.antique = 0;
  // Swing until the antique turns up, which the deterministic draw guarantees within a few dozen.
  let finder: string | null = null;
  for (let i = 0; i < 60 && !finder; i++) {
    mine.ready = false; mine.progress = 0.5;
    world.state.resources.tnt = 5;
    const result = world.useMiningTool(mine.id, 'tnt');
    assert.equal(result.ok, true, result.message);
    if (result.antique) finder = result.message;
  }
  assert.ok(finder, 'sixty TNT swings find something');
  assert.match(finder!, /古董藏品/);
  assert.ok(world.state.resources.antique >= 1, 'and it went on the shelf');
  assert.equal(validateSave(world.state), true);
});
