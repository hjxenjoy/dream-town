import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, FOCUS_RECIPES, MINE_GRADES, MINE_GRADE_NAMES, ORE_GRADES, RESOURCES, emptyResources, type Resource } from '../src/sim/data.ts';

function prepared() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.settings.disasters = false;
  world.state.settings.autoMayor = false;
  world.state.coins = 500000;
  world.state.capacity = 20000;
  world.state.researched = ['mining', 'metallurgy'];
  world.state.resources = { ...emptyResources(), wood: 900, stone: 900, materials: 400, charcoal: 400 };
  // The mining chain is behind research and is not in the starting town, so it is raised here.
  assert.equal(world.build('mine', 4, 24).ok, true, 'a mine to dig with');
  assert.equal(world.build('smelter', 6, 24).ok, true, 'a smelter to work the ore');
  assert.equal(world.build('smithy', 8, 24).ok, true, 'and a smithy, which must NOT take a seam');
  return world;
}
const mineOf = (world: SimWorld) => world.state.buildings.find(b => b.kind === 'mine')!;

test('docs/02 §5 gives four ores, and five of any one make a single ingot', () => {
  // 四种矿石：铜、银、金、铂金；每 5 个矿石在冶炼厂炼成 1 个金属锭
  assert.equal(ORE_GRADES.length, 4, 'four grades');
  assert.deepEqual([...ORE_GRADES], ['ore', 'silverore', 'goldore', 'platinumore']);
  // Every grade smelts at the same rate: the smelter's recipe asks for exactly five of one.
  assert.equal(BUILDINGS.smelter.input!.ore, 5, 'five at a time');
  assert.equal(BUILDINGS.smelter.output!.ingot, 1, 'one ingot out');
  // So the grades differ in worth and in how hard they are to dig — never in what they become.
  for (const grade of ORE_GRADES) {
    assert.ok(RESOURCES[grade].sellPrice > 0, `${grade} is worth something`);
  }
  const prices = ORE_GRADES.map(key => RESOURCES[key].sellPrice);
  assert.deepEqual([...prices].sort((a, b) => a - b), prices, 'deeper grades are worth more, in order');
});

test('a mine digs one seam, and a deeper seam yields less but is worth more', () => {
  const recipes = FOCUS_RECIPES.mine!;
  assert.deepEqual(Object.keys(recipes).sort(), [...MINE_GRADES].sort(), 'one recipe per grade');
  // Yields fall as the seam deepens...
  const yields = MINE_GRADES.map(grade => Object.values(recipes[grade]!.output)[0]!);
  assert.deepEqual([...yields], [5, 4, 3, 2], 'copper yields most, platinum least');
  // ...so the value per round has to rise instead, or nobody would ever dig deeper.
  const value = MINE_GRADES.map(grade => {
    const out = recipes[grade]!.output as Record<Resource, number>;
    return Object.entries(out).reduce((n, [key, amount]) => n + RESOURCES[key].sellPrice * amount, 0);
  });
  for (let i = 1; i < value.length; i++) {
    assert.ok(value[i]! > value[i - 1]!, `${MINE_GRADES[i]} is worth more per round than ${MINE_GRADES[i - 1]}: ${value.join(' < ')}`);
  }
  for (const grade of MINE_GRADES) assert.ok(MINE_GRADE_NAMES[grade].length > 0, `${grade} is named in the panel`);
});

test('a deeper seam takes longer to work, which is what makes it a trade', () => {
  const world = prepared();
  const mine = mineOf(world);
  const cycleAt = (grade: string) => {
    mine.productionFocus = grade as never;
    return world.observe().production.find(row => row.buildingId === mine.id)!.cycle;
  };
  const copper = cycleAt('copper');
  const silver = cycleAt('silver');
  const gold = cycleAt('gold');
  const platinum = cycleAt('platinum');
  assert.ok(copper < silver && silver < gold && gold < platinum, `deeper is slower: ${copper} < ${silver} < ${gold} < ${platinum}`);
  assert.ok(Math.abs(silver / copper - 1.3) < 0.01, 'and by the stated step');
  assert.ok(Math.abs(platinum / copper - 1.9) < 0.01);
});

test('a new mine opens on the copper seam and can be switched, like a workshop recipe', () => {
  const world = prepared();
  const mine = mineOf(world);
  assert.equal(mine.productionFocus, 'copper', 'it opens on the shallow seam');
  assert.equal(world.setProductionFocus(mine.id, 'platinum').ok, true);
  assert.equal(mine.productionFocus, 'platinum');
  assert.equal(world.setProductionFocus(mine.id, 'platinum').ok, false, 'no change is refused as such');
  assert.equal(world.setProductionFocus(mine.id, 'mithril').ok, false, 'an unknown seam is refused');
  assert.equal(validateSave(world.state), true);
});

test('a mine really brings up the grade it is set to', () => {
  const world = prepared();
  const mine = mineOf(world);
  for (const [grade, ore] of [['copper', 'ore'], ['silver', 'silverore'], ['gold', 'goldore'], ['platinum', 'platinumore']] as const) {
    world.setProductionFocus(mine.id, grade);
    mine.paused = false; mine.progress = 0; mine.ready = false; mine.stock = {};
    for (const key of ORE_GRADES) world.state.resources[key] = 0;
    world.tick(world.observe().production.find(row => row.buildingId === mine.id)!.cycle + 2);
    assert.equal(mine.ready, true, `${grade} produces`);
    world.collect(mine.id);
    assert.ok(world.state.resources[ore] > 0, `${grade} brought up ${ore}`);
    for (const other of ORE_GRADES) {
      if (other === ore) continue;
      assert.equal(world.state.resources[other], 0, `${grade} brought up no ${other}`);
    }
  }
});

test('the smelter works the richest grade in the barn, so the choice stays in one place', () => {
  // docs/02 §5 lets five of ANY ore make an ingot. Rather than asking the player to set the same
  // thing twice, the smelter picks the richest grade it has enough of.
  const world = prepared();
  const smelter = world.state.buildings.find(b => b.kind === 'smelter')!;
  smelter.paused = false; smelter.progress = 0; smelter.ready = false; smelter.stock = {};
  const inputOf = () => world.observe().production.find(row => row.buildingId === smelter.id)!.input;
  // The grade is the only part that changes; charcoal is part of the recipe either way.
  const gradeOf = () => {
    const entries = Object.entries(inputOf()).filter(([key]) => ORE_GRADES.includes(key as Resource));
    return Object.fromEntries(entries);
  };

  // Only copper: it smelts copper.
  for (const key of ORE_GRADES) world.state.resources[key] = key === 'ore' ? 20 : 0;
  assert.deepEqual(gradeOf(), { ore: 5 }, 'copper, with no richer grade in stock');
  // Add silver: silver is richer, so it goes first.
  world.state.resources.silverore = 20;
  assert.deepEqual(gradeOf(), { silverore: 5 });
  // And platinum outranks everything.
  world.state.resources.platinumore = 20;
  assert.deepEqual(gradeOf(), { platinumore: 5 });
  // But a grade it cannot fill is skipped rather than stalling the works.
  world.state.resources.platinumore = 2;
  assert.deepEqual(gradeOf(), { silverore: 5 });
  // With nothing but crumbs, it falls back to its base recipe — charcoal and all — so the
  // blocked-state check reports 原料不足 honestly instead of claiming it has what it needs.
  for (const key of ORE_GRADES) world.state.resources[key] = 1;
  assert.deepEqual(gradeOf(), { ore: 5 }, 'back to the base ore');
  assert.equal(inputOf().charcoal, 2, 'and the fuel is always part of the recipe');
});

test('a smelter with only deeper ore still turns out ingots', () => {
  const world = prepared();
  const smelter = world.state.buildings.find(b => b.kind === 'smelter')!;
  smelter.paused = false; smelter.progress = 0; smelter.ready = false; smelter.stock = {};
  for (const key of ORE_GRADES) world.state.resources[key] = 0;
  world.state.resources.goldore = 20;
  world.state.resources.charcoal = 20;
  // The reported cycle, not the raw definition: other multipliers apply to it.
  const cycle = world.observe().production.find(row => row.buildingId === smelter.id)!.cycle;
  world.tick(cycle + 2);
  assert.equal(smelter.ready, true, 'gold ore smelts like any other');
  world.collect(smelter.id);
  assert.equal(world.state.resources.ingot, 1);
  assert.equal(world.state.resources.goldore, 15, 'five gold ore went in');
});

test('the deeper grades are still refused where they do not belong', () => {
  const world = prepared();
  const smithy = world.state.buildings.find(b => b.kind === 'smithy')!;
  // A smithy is not a mine: setting it to a seam is refused.
  assert.equal(world.setProductionFocus(smithy.id, 'platinum').ok, false);
  // And a save that puts a seam on the wrong building is refused rather than accepted.
  const wrong = JSON.parse(JSON.stringify(world.state));
  wrong.buildings.find((b: { kind: string }) => b.kind === 'smithy')!.productionFocus = 'platinum';
  assert.equal(validateSave(wrong), false);
});
