import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, createInitialState, migrateSave, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCE_KEYS, emptyResources, INDUSTRY_KINDS, TECHNOLOGIES, type BuildingKind, type Resource, type TechnologyId } from '../src/sim/data.ts';
import { executeGameTool } from '../src/sim/tools.ts';
import { parseSave } from '../src/save/storage.ts';
import { cycleOf } from './support.ts';

function prepared() {
  const world = new SimWorld();
  world.state.level = 6; world.state.prestige = 50; world.state.coins = 30000; world.state.capacity = 4000;
  world.state.resources = { ...emptyResources(), wood: 200, stone: 200, wheat: 200, plank: 100, materials: 100, bread: 100, fish: 100 };
  for (const b of world.state.buildings) { b.paused = true; b.workers = 0; b.staffing = 0; b.ready = false; b.stock = {}; b.progress = 0; }
  return world;
}
function research(world: SimWorld, ...ids: TechnologyId[]) { for (const id of ids) assert.equal(world.research(id).ok, true, id); }
function construct(world: SimWorld, kind: BuildingKind, x: number) {
  // `x` is a slot number, not a tile: each workshop now stands on a two-tile yard, so slot n
  // lands on tile 1 + (n-1)*2 with every yard clear of its neighbour.
  const result = world.build(kind, 1 + (x - 1) * 2, 2); assert.equal(result.ok, true, result.message);
  return world.state.buildings.find(b => b.id === result.buildingId)!;
}
function legacySave() {
  const state = createInitialState(1_000_000);
  // Reshape a current save into the v1 format. Casting through unknown is deliberate:
  // the whole point is to remove fields the SimState type requires.
  const legacy = state as unknown as Record<string, unknown>;
  legacy.version = 1;
  delete legacy.researched;
  const stats = state.stats as unknown as Record<string, unknown>;
  delete stats.toolsProduced; delete stats.clothingProduced;
  // v1 knew only eight resources, so drop every key added since. Deriving this from
  // the current roster keeps the fixture describing v1 as the game grows.
  const resources = state.resources as unknown as Record<string, unknown>;
  const v1Resources = ['wood', 'stone', 'wheat', 'flour', 'bread', 'fish', 'plank', 'materials'];
  for (const key of Object.keys(resources)) if (!v1Resources.includes(key)) delete resources[key];
  state.quests = state.quests.filter(quest => !['research', 'tools', 'clothing'].includes(quest.id));
  state.quests[0]!.claimed = true; state.quests[0]!.progress = 12;
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

test('migration never repairs malformed legacy data', () => {
  const asResources = (state: ReturnType<typeof legacySave>) => state.resources as unknown as Record<string, unknown>;
  const missingWood = legacySave(); delete asResources(missingWood).wood;
  const negative = legacySave(); asResources(negative).fish = -1;
  const extra = legacySave(); asResources(extra).ore = 3;
  for (const save of [missingWood, negative, extra, {...legacySave(), version: 99}]) assert.equal(migrateSave(save), null);
});

test('a current-format save missing a resource or counter added since still loads', () => {
  // The game adds resources over time, and a save written before one existed simply lacks it.
  // Rejecting such a save loses a player's whole town, so the missing keys are topped up with
  // the empty values they genuinely had — and nothing else about the save is repaired.
  const asResources = (state: ReturnType<typeof createInitialState>) => state.resources as unknown as Record<string, unknown>;
  const asStats = (state: ReturnType<typeof createInitialState>) => state.stats as unknown as Record<string, unknown>;

  const older = createInitialState(1_000_000);
  older.level = 9; older.coins = 4321; older.population = 30; older.resources.wood = 77;
  const removedResources = ['milk', 'cheese', 'honey', 'grape', 'wine', 'vintage'];
  for (const key of removedResources) delete asResources(older)[key];
  delete asStats(older).repairs;
  assert.equal(validateSave(older), false, 'the raw save is not valid as it stands');

  const restored = migrateSave(older)!;
  assert.ok(restored, 'but it migrates');
  for (const key of removedResources) assert.equal(restored.resources[key as 'milk'], 0, `${key} is filled in as empty`);
  assert.equal(restored.stats.repairs, 0, 'a counter that did not exist yet is zero');
  // Everything the save did carry is preserved exactly.
  assert.equal(restored.level, 9);
  assert.equal(restored.coins, 4321);
  assert.equal(restored.population, 30);
  assert.equal(restored.resources.wood, 77);
  assert.equal(restored.buildings.length, older.buildings.length);
  assert.equal(validateSave(restored), true);
  assert.deepEqual(migrateSave(restored), restored, 'and a top-up save is idempotent');

  // The boundary is not weakened: only absent keys are filled, never wrong ones.
  const negative = createInitialState(); delete asResources(negative).milk; asResources(negative).fish = -3;
  assert.equal(migrateSave(negative), null, 'a negative amount is still corruption');
  const fractional = createInitialState(); delete asResources(fractional).milk; asResources(fractional).wine = 1.5;
  assert.equal(migrateSave(fractional), null, 'a fractional amount is still corruption');
  const unknown = createInitialState(); delete asResources(unknown).milk; asResources(unknown).moon = 4;
  assert.equal(migrateSave(unknown), null, 'an unknown resource is still corruption');
  const notARecord = createInitialState() as unknown as Record<string, unknown>;
  notARecord.resources = 12;
  assert.equal(migrateSave(notARecord), null, 'a non-record resource block cannot be fabricated into one');
  const badCounter = createInitialState(); delete asStats(badCounter).repairs; asStats(badCounter).collected = 'many';
  assert.equal(migrateSave(badCounter), null, 'a non-numeric counter is still corruption');
});

test('the migration completes every key the game validates in full', () => {
  // `resources` and `stats` are the two records a save must carry in full, so they are the two
  // the migration has to complete. Dropping any single key from either must still load.
  for (const key of RESOURCE_KEYS) {
    const older = createInitialState();
    delete (older.resources as unknown as Record<string, unknown>)[key];
    const restored = migrateSave(older);
    assert.ok(restored, `a save missing ${key} still loads`);
    assert.ok(Number.isInteger(restored.resources[key]), `${key} is a whole number afterwards`);
  }
  for (const key of ['collected', 'ordersCompleted', 'buildingsBuilt', 'caravansCompleted', 'coinsEarned', 'festivals', 'repairs', 'toolsProduced', 'clothingProduced']) {
    const older = createInitialState();
    delete (older.stats as unknown as Record<string, unknown>)[key];
    const restored = migrateSave(older);
    assert.ok(restored, `a save missing the ${key} counter still loads`);
    assert.ok(Number.isInteger(restored.stats[key as 'collected']), `${key} is a whole number afterwards`);
  }
  // And the migration is a one-way door: what it produces is already valid.
  const once = migrateSave(createInitialState())!;
  assert.equal(validateSave(once), true);
  assert.deepEqual(migrateSave(once), once);
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
    world.tick(cycleOf(world, b, 0.1)); assert.equal(b.ready, true, kind);
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
    if(kind==='pasture')world.tick(120); // New lambs finish their fed growth before yielding wool.
    world.tick(cycleOf(world, b, 0.1)); assert.equal(b.ready, true, kind);
    assert.equal(world.collect(b.id).ok, true); b.paused = true;
  }
  assert.equal(world.state.resources.clothing, 2); assert.equal(world.state.resources.cloth, 0);
  assert.equal(world.state.stats.clothingProduced, 2); assert.equal(validateSave(world.state), true);
});

test('missing charcoal and absent workers both pause smelting without consuming ore', () => {
  const world = prepared(); research(world, 'mining', 'metallurgy');
  const b = construct(world, 'smelter', 1); world.state.resources.ore = 5;
  world.tick(cycleOf(world, b)); assert.equal(b.progress, 0); assert.equal(world.state.resources.ore, 5);
  world.state.resources.charcoal = 2; world.adjustWorkforce(b.id, 0);
  world.tick(cycleOf(world, b)); assert.equal(b.progress, 0); world.offline(100); assert.equal(world.state.resources.ore, 5);
  world.adjustWorkforce(b.id, 2); world.tick(cycleOf(world, b)); assert.equal(b.ready, true);
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
  // Studying civics spends the two clothes it costs, so the copied town gives them up as well:
  // the only difference the assertion is about is how the tax penalty is applied.
  regular.state.resources.clothing = 0;
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
