import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, createInitialState, migrateSave, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCE_KEYS, emptyResources, INDUSTRY_KINDS, TECHNOLOGIES, type BuildingKind, type Resource, type TechnologyId } from '../src/sim/data.ts';
import { executeGameTool } from '../src/sim/tools.ts';
import { parseSave } from '../src/save/storage.ts';

function prepared() {
  const world = new SimWorld();
  world.state.level = 6; world.state.prestige = 50; world.state.coins = 30000; world.state.capacity = 4000;
  world.state.resources = { ...emptyResources(), wood: 200, stone: 200, wheat: 200, plank: 100, materials: 100, bread: 100, fish: 100 };
  for (const b of world.state.buildings) { b.paused = true; b.workers = 0; b.ready = false; b.stock = {}; b.progress = 0; }
  return world;
}
function research(world: SimWorld, ...ids: TechnologyId[]) { for (const id of ids) assert.equal(world.research(id).ok, true, id); }
function construct(world: SimWorld, kind: BuildingKind, x: number) {
  const result = world.build(kind, x, 2); assert.equal(result.ok, true, result.message);
  return world.state.buildings.find(b => b.id === result.buildingId)!;
}
function legacySave() {
  const state: any = createInitialState(1_000_000);
  state.version = 1; delete state.researched; delete state.stats.toolsProduced; delete state.stats.clothingProduced;
  for (const key of ['ore','charcoal','ingot','tools','feed','wool','cloth','clothing']) delete state.resources[key];
  state.quests = state.quests.filter((q: any) => !['research','tools','clothing'].includes(q.id));
  state.quests[0].claimed = true; state.quests[0].progress = 12;
  return state;
}
function envelope(data: unknown) {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(JSON.stringify(data))) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1;
  }
  return JSON.stringify({ format: 'dream-town-save', formatVersion: 1, checksum: ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8,'0'), data });
}

test('v1 migration preserves town progress and adds only new schema fields, without mutating input', () => {
  const legacy = legacySave(), before = JSON.stringify(legacy);
  const restored = migrateSave(legacy)!;
  assert.equal(validateSave(restored), true); assert.equal(restored.version, 2);
  assert.equal(restored.coins, legacy.coins); assert.equal(restored.savedAt, legacy.savedAt);
  assert.deepEqual(restored.buildings, legacy.buildings); assert.deepEqual(restored.orders, legacy.orders);
  assert.deepEqual(restored.quests.slice(0,6), legacy.quests); assert.equal(restored.quests.length, 9);
  assert.deepEqual(restored.researched, []); assert.equal(restored.resources.ore, 0);
  assert.equal(JSON.stringify(legacy), before);
  assert.deepEqual(migrateSave(restored), restored, 'migration is idempotent');
  assert.equal(new SimWorld(legacy).state.version, 2);
});

test('migration never repairs malformed legacy data or incomplete modern saves', () => {
  const missingWood = legacySave(); delete missingWood.resources.wood;
  const negative = legacySave(); negative.resources.fish = -1;
  const extra = legacySave(); extra.resources.ore = 3;
  const modern: any = createInitialState(); delete modern.resources.ore;
  for (const save of [missingWood, negative, extra, modern, {...legacySave(), version: 99}]) assert.equal(migrateSave(save), null);
});

test('file imports verify the original checksum before migration and round-trip researched towns', () => {
  const legacy = legacySave(), encoded = envelope(legacy);
  assert.equal(parseSave(encoded).version, 2);
  const corrupted = JSON.parse(encoded); corrupted.data.coins++;
  assert.throws(() => parseSave(JSON.stringify(corrupted)), /完整性校验失败/);
  const world = prepared(); research(world, 'mining', 'metallurgy');
  construct(world, 'smelter', 1);
  assert.deepEqual(parseSave(envelope(world.state)), world.state);
});

test('locked blueprints and invalid research leave all costs and progress unchanged', () => {
  const world = new SimWorld(), before = JSON.stringify(world.state);
  assert.equal(world.build('mine', 2, 2).code, 'TECHNOLOGY_REQUIRED');
  assert.equal(world.research('metallurgy').code, 'RESEARCH_LOCKED');
  assert.equal(world.research('constructor' as TechnologyId).code, 'UNKNOWN_TECHNOLOGY');
  assert.equal(JSON.stringify(world.state), before);
  world.state.prestige = 0;
  const unavailable = JSON.stringify(world.state);
  assert.equal(world.research('mining').ok, false); assert.equal(JSON.stringify(world.state), unavailable);
});

test('research spends exact resources once, unlocks its blueprints and advances its milestone', () => {
  const world = new SimWorld(), before = structuredClone(world.state), price = TECHNOLOGIES.mining;
  assert.equal(world.research('mining').ok, true);
  assert.equal(world.state.coins, before.coins - price.coins);
  assert.equal(world.state.prestige, before.prestige - price.prestige);
  assert.equal(world.state.resources.materials, before.resources.materials - price.items.materials!);
  assert.equal(world.isUnlocked('mine'), true); assert.equal(world.isUnlocked('smithy'), false);
  assert.equal(world.state.quests.find(q => q.id === 'research')!.progress, 1);
  const after = JSON.stringify(world.state);
  assert.equal(world.research('mining').code, 'ALREADY_RESEARCHED'); assert.equal(JSON.stringify(world.state), after);
  assert.equal(world.claimQuest('research').ok, true); assert.equal(world.claimQuest('research').code, 'ALREADY_CLAIMED');
  assert.equal(world.build('mine', 2, 2).ok, true); assert.equal(validateSave(world.state), true);
});

test('technology import validation rejects duplicate, unknown, orphaned research and locked buildings', () => {
  const world = prepared(); research(world, 'mining', 'metallurgy'); construct(world, 'smithy', 1);
  for (const researched of [[], ['metallurgy'], ['mining','mining'], ['invented']]) assert.equal(validateSave({...world.state, researched}), false);
  assert.equal(validateSave(world.state), true);
});

test('new construction checks caravan materials and charges them atomically', () => {
  const world = prepared(); research(world, 'mining', 'metallurgy');
  world.state.resources.materials = 0;
  const before = JSON.stringify(world.state);
  assert.equal(world.build('smelter', 1, 2).code, 'INSUFFICIENT_RESOURCES'); assert.equal(JSON.stringify(world.state), before);
  world.state.resources.materials = 3;
  construct(world, 'smelter', 1); assert.equal(world.state.resources.materials, 0);
});

test('mine, kiln, smelter and smithy produce a real ore-to-tools chain with exact inputs', () => {
  const world = prepared(); research(world, 'mining', 'metallurgy');
  const kinds: BuildingKind[] = ['mine','kiln','smelter','smithy'];
  for (const [index, kind] of kinds.entries()) {
    const b = construct(world, kind, index + 1), def = BUILDINGS[kind];
    const before = {...world.state.resources};
    world.tick(def.cycle! + 0.1); assert.equal(b.ready, true, kind);
    for (const [key, count] of Object.entries(def.input || {})) assert.equal(world.state.resources[key as Resource], before[key as Resource] - count!);
    assert.equal(world.collect(b.id).ok, true);
    b.paused = true;
  }
  assert.equal(world.state.resources.tools, 2); assert.equal(world.state.resources.ingot, 0);
  assert.equal(world.state.resources.ore, 0); assert.equal(world.state.resources.charcoal, 0);
  assert.equal(world.state.stats.toolsProduced, 2); assert.equal(validateSave(world.state), true);
});

test('feed, pasture, loom and tailor make clothing without a free intermediate resource', () => {
  const world = prepared(); research(world, 'husbandry', 'tailoring');
  for (const [index, kind] of (['feedmill','pasture','weaver','tailor'] as BuildingKind[]).entries()) {
    const b = construct(world, kind, index + 1);
    world.tick(BUILDINGS[kind].cycle! + 0.1); assert.equal(b.ready, true, kind);
    assert.equal(world.collect(b.id).ok, true); b.paused = true;
  }
  assert.equal(world.state.resources.clothing, 2); assert.equal(world.state.resources.cloth, 0);
  assert.equal(world.state.stats.clothingProduced, 2); assert.equal(validateSave(world.state), true);
});

test('missing charcoal and absent workers both pause smelting without consuming ore', () => {
  const world = prepared(); research(world, 'mining', 'metallurgy');
  const b = construct(world, 'smelter', 1); world.state.resources.ore = 5;
  world.tick(30); assert.equal(b.progress, 0); assert.equal(world.state.resources.ore, 5);
  world.state.resources.charcoal = 2; world.adjustWorkforce(b.id, 0);
  world.tick(30); assert.equal(b.progress, 0); world.offline(100); assert.equal(world.state.resources.ore, 5);
  world.adjustWorkforce(b.id, 2); world.tick(60); assert.equal(b.ready, true);
  assert.equal(world.state.resources.ore, 0); assert.equal(world.state.resources.charcoal, 0);
});

test('offline settlement includes all advanced industries, preserves resources and counts craft milestones', () => {
  const world = prepared(); research(world, 'mining', 'metallurgy', 'husbandry', 'tailoring');
  for (const [index, kind] of INDUSTRY_KINDS.entries()) { const b = construct(world, kind, index+1); world.adjustWorkforce(b.id, 1); }
  // Deliberately scramble placement order: settlement must follow recipe dependencies.
  world.state.buildings.reverse();
  const before = {...world.state.resources};
  const report = world.offline(600);
  assert.ok(report.produced.tools > 0); assert.ok(report.produced.clothing > 0);
  for (const key of RESOURCE_KEYS) assert.equal(world.state.resources[key], before[key] + report.produced[key] - report.consumed[key]);
  assert.equal(world.state.stats.toolsProduced, report.produced.tools);
  assert.equal(world.state.stats.clothingProduced, report.produced.clothing);
  assert.equal(validateSave(world.state), true);
});

test('efficiency affects every workshop cycle once and persists across restoration', () => {
  const world = prepared(); research(world, 'mining', 'metallurgy');
  world.state.resources.tools = 2;
  const before = world.observe().production.map(b => b.cycle);
  research(world, 'efficiency');
  world.observe().production.forEach((b,i) => assert.ok(Math.abs(b.cycle - before[i] * 0.9) < 0.00001));
  const restored = new SimWorld(world.state);
  assert.deepEqual(restored.observe().production, world.observe().production);
  assert.equal(restored.research('efficiency').code, 'ALREADY_RESEARCHED');
});

test('logistics expands storage once and keeps warehouse build/upgrade/demolition symmetric', () => {
  const world = prepared(); research(world, 'husbandry', 'tailoring'); world.state.resources.cloth = 2;
  const old = world.state.capacity; research(world, 'logistics');
  assert.equal(world.state.capacity, Math.floor(old * 1.2));
  const capacity = world.state.capacity, b = construct(world, 'warehouse', 1);
  assert.equal(world.state.capacity, capacity + 96);
  world.upgrade(b.id); assert.equal(world.state.capacity, capacity + 192);
  world.demolish(b.id); assert.equal(world.state.capacity, capacity);
  assert.equal(new SimWorld(world.state).state.capacity, capacity);
  world.research('logistics'); assert.equal(world.state.capacity, capacity);
});

test('civics halves positive tax penalties and preserves the benefit of zero tax', () => {
  const improved = prepared(); research(improved, 'husbandry', 'tailoring'); improved.state.resources.clothing = 2;
  const regular = new SimWorld(improved.state); research(improved, 'civics');
  for (const w of [regular, improved]) { w.setTax(4); w.tick(90); }
  assert.ok(Math.abs(improved.state.happiness - regular.state.happiness - 10) < 0.001);
  const zeroA = prepared(), zeroB = prepared(); research(zeroB, 'husbandry', 'tailoring'); zeroB.state.resources.clothing=2; research(zeroB, 'civics');
  for (const w of [zeroA, zeroB]) { w.setTax(0); w.tick(90); }
  assert.equal(zeroA.state.happiness, zeroB.state.happiness);
});

test('advanced orders only appear with a complete local supply chain', () => {
  const world = prepared(); research(world, 'mining', 'metallurgy'); construct(world, 'smithy', 1);
  for (let i=0;i<60;i++) {
    world.state.orders[0].cooldownUntil=0; world.cancelOrder(world.state.orders[0].id);
    assert.equal(world.state.orders[0].items.tools, undefined);
  }
  construct(world, 'mine', 2); construct(world, 'kiln', 3); construct(world, 'smelter', 4);
  let toolsRequested = false;
  for (let i=0;i<100;i++) {
    world.state.orders[0].cooldownUntil=0; world.cancelOrder(world.state.orders[0].id);
    toolsRequested ||= Boolean(world.state.orders[0].items.tools);
  }
  assert.equal(toolsRequested, true);
});

test('technology tools enforce the same research gates and reject extra arguments', () => {
  const world = new SimWorld(), before = JSON.stringify(world.state);
  assert.equal(executeGameTool(world, 'research_technology', { technologyId: 'mining', free: true }).ok, false);
  assert.equal(executeGameTool(world, 'research_technology', { technologyId: 'metallurgy' }).ok, false);
  assert.equal(JSON.stringify(world.state), before);
  assert.equal(executeGameTool(world, 'research_technology', { technologyId: 'mining' }).ok, true);
  assert.equal(executeGameTool(world, 'get_technologies').ok, true);
});
