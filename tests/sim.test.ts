import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, emptyResources, MAX_OFFLINE_SECONDS, RESOURCE_KEYS } from '../src/sim/data.ts';
import { executeGameTool } from '../src/sim/tools.ts';
import { populate } from './population.ts';

function assertHealthy(world: SimWorld): void {
  assert.equal(validateSave(world.state), true, 'all simulation state must remain serializable and valid');
  for (const key of RESOURCE_KEYS) assert.ok(Number.isInteger(world.state.resources[key]) && world.state.resources[key] >= 0, `${key} must be a nonnegative whole quantity`);
  assert.ok(world.observe().warehouseUsed <= world.state.capacity, 'storage never overflows');
  const assigned = world.state.buildings.reduce((total, building) => total + (building.workers ?? BUILDINGS[building.kind].workers ?? 0), 0);
  assert.ok(assigned <= world.state.population, 'each worker must correspond to a resident');
}

test('fresh start is valid, unique and isolated from caller-owned saves', () => {
  const initial = createInitialState(123456);
  assert.equal(validateSave(initial), true);
  assert.equal(initial.population, 13); assert.equal(initial.level, 3); assert.equal(initial.coins, 2800);
  assert.equal(new Set(initial.buildings.map(building => `${building.x},${building.y}`)).size, initial.buildings.length);
  const world = new SimWorld(initial);
  world.state.resources.wood = 0;
  assert.equal(initial.resources.wood, 42);
});

test('construction rejects invalid coordinates, occupancy and unaffordable costs atomically', () => {
  const world = new SimWorld();
  for (const action of [() => world.build('cottage', NaN, 2), () => world.build('cottage', 65, 2), () => world.build('cottage', 8, 7)]) {
    const before = JSON.stringify(world.state);
    assert.equal(action().ok, false);
    assert.equal(JSON.stringify(world.state), before);
  }
  world.state.coins = 0;
  const before = JSON.stringify(world.state);
  assert.equal(world.build('cottage', 7, 4).code, 'INSUFFICIENT_GOLD');
  assert.equal(JSON.stringify(world.state), before);
});

test('construction and upgrade apply exact costs and cannot duplicate an occupied building', () => {
  const world = new SimWorld();
  const result = world.build('garden', 7, 4);
  assert.equal(result.ok, true); assert.ok(result.buildingId);
  assert.equal(world.state.coins, 2680); assert.equal(world.state.resources.wood, 40); assert.equal(world.state.resources.stone, 22);
  assert.equal(world.build('garden', 7, 4).ok, false);
  const warehouse = world.state.buildings.find(building => building.kind === 'warehouse')!;
  const oldCapacity = world.state.capacity; const materials = world.state.resources.materials;
  assert.equal(world.upgrade(warehouse.id).ok, true);
  assert.equal(world.state.capacity, oldCapacity + 80); assert.equal(world.state.resources.materials, materials - 3);
  assertHealthy(world);
});

test('production consumes recipes once and harvest cannot be collected twice', () => {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  const mill = world.state.buildings.find(building => building.kind === 'windmill')!;
  mill.paused = false; mill.progress = 0;
  // Stock targets stop a workshop that has made enough, so start from empty shelves: this
  // test is about a recipe being consumed once, not about whether the town wants more flour.
  world.state.resources.flour = 0;
  const wheat = world.state.resources.wheat;
  const flour = world.state.resources.flour;
  world.tick(30);
  assert.equal(mill.ready, true); assert.equal(world.state.resources.wheat, wheat - 3);
  world.tick(30);
  assert.equal(world.state.resources.wheat, wheat - 3, 'waiting for collection does not consume another recipe');
  assert.equal(world.collect(mill.id).ok, true); assert.equal(world.state.resources.flour, flour + 3);
  const before = JSON.stringify(world.state);
  assert.equal(world.collect(mill.id).ok, false); assert.equal(JSON.stringify(world.state), before);
  assertHealthy(world);
});

test('insufficient inputs and a full warehouse stop production without losing resources', () => {
  const world = new SimWorld();
  const mill = world.state.buildings.find(building => building.kind === 'windmill')!;
  world.state.resources.wheat = 0;
  const progress = mill.progress;
  world.tick(30);
  assert.equal(mill.progress, progress); assert.equal(mill.ready, false);
  world.state.resources = { ...emptyResources(), wood: world.state.capacity };
  const ready = world.state.buildings.find(building => building.ready)!;
  assert.equal(world.collect(ready.id).code, 'WAREHOUSE_FULL');
  assert.equal(world.state.resources.wood, world.state.capacity);
  assert.equal(world.sell('wood', 10).ok, true);
  assert.equal(world.collect(ready.id).ok, true);
  assertHealthy(world);
});

test('order fulfillment is atomic, pays once and can release space from a full warehouse', () => {
  const world = new SimWorld();
  const order = world.state.orders[0];
  world.state.resources.wood += world.state.capacity - world.observe().warehouseUsed;
  const coins = world.state.coins;
  assert.equal(world.fulfillOrder(order.id).ok, true);
  assert.equal(world.state.coins, coins + order.rewardCoins);
  assert.equal(world.fulfillOrder(order.id).code, 'ORDER_NOT_FOUND');
  assert.equal(world.state.stats.ordersCompleted, 1);
  const next = world.state.orders[0];
  world.state.resources = emptyResources();
  const before = JSON.stringify(world.state);
  assert.equal(world.fulfillOrder(next.id).ok, false); assert.equal(JSON.stringify(world.state), before);
  assertHealthy(world);
});

test('order cancellation uses a new ID and enforces replacement cooldown', () => {
  const world = new SimWorld();
  const oldId = world.state.orders[0].id;
  assert.equal(world.cancelOrder(oldId).ok, true);
  const replacement = world.state.orders[0];
  assert.notEqual(replacement.id, oldId);
  assert.equal(world.fulfillOrder(replacement.id).code, 'ORDER_COOLDOWN');
  assert.equal(world.cancelOrder(replacement.id).code, 'ORDER_COOLDOWN');
  world.tick(60);
  assert.notEqual(world.fulfillOrder(replacement.id).code, 'ORDER_COOLDOWN');
  assertHealthy(world);
});

test('caravan has one outbound trip, returns on time, and pays only on collection', () => {
  const world = new SimWorld();
  const initialCoins = world.state.coins;
  assert.equal(world.dispatchCaravan().ok, true);
  const cargoAfter = { ...world.state.resources };
  assert.equal(world.dispatchCaravan().code, 'CARAVAN_BUSY');
  assert.deepEqual(world.state.resources, cargoAfter);
  world.tick(60); world.tick(60);
  assert.equal(world.state.caravans[0].status, 'returned');
  const beforeReward = world.state.coins;
  assert.equal(world.dispatchCaravan().ok, true);
  assert.equal(world.state.coins, beforeReward + 420);
  assert.equal(world.state.stats.caravansCompleted, 1); assert.equal(world.state.resources.materials, 18);
  assert.ok(world.state.coins >= initialCoins + 420);
  assertHealthy(world);
});

test('return cargo waits safely when the warehouse cannot hold its materials', () => {
  const world = new SimWorld();
  world.dispatchCaravan(); world.tick(60); world.tick(60);
  world.state.resources.wood += world.state.capacity - world.observe().warehouseUsed;
  const before = JSON.stringify(world.state);
  assert.equal(world.dispatchCaravan().code, 'WAREHOUSE_FULL');
  assert.equal(JSON.stringify(world.state), before);
  world.sell('wood', 8);
  assert.equal(world.dispatchCaravan().ok, true);
  assertHealthy(world);
});

test('invalid quantities and tax values cannot manufacture coins or corrupt the world', () => {
  const world = new SimWorld();
  for (const amount of [-1, 0, 0.5, NaN, Infinity]) assert.equal(world.sell('wood', amount).ok, false);
  for (const rate of [-1, 5, 1.5, NaN]) assert.equal(world.setTax(rate).ok, false);
  assert.equal(world.state.coins, 2800);
  assert.equal(world.setTax(4).ok, true);
  world.tick(60);
  assert.ok(world.state.happiness < 86);
  assertHealthy(world);
});

test('quest and festival rewards resist repeated claims', () => {
  const world = new SimWorld();
  assert.equal(world.claimQuest('harvest').code, 'QUEST_INCOMPLETE');
  for (const building of world.state.buildings.filter(building => building.ready)) world.collect(building.id);
  assert.equal(world.claimQuest('harvest').ok, true);
  const coins = world.state.coins;
  assert.equal(world.claimQuest('harvest').code, 'ALREADY_CLAIMED'); assert.equal(world.state.coins, coins);
  assert.equal(world.festival().ok, true);
  assert.equal(world.festival().code, 'FESTIVAL_ACTIVE');
  assertHealthy(world);
});

test('offline simulation is capped, returns caravans, preserves residents and stays in capacity', () => {
  const world = new SimWorld();
  world.state.settings.disasters = true;
  world.dispatchCaravan();
  const population = world.state.population;
  const startedAt = world.state.gameTime;
  const report = world.offline(100 * 60 * 60);
  assert.equal(report.elapsed, MAX_OFFLINE_SECONDS); assert.equal(report.capped, true);
  // The cap is on how much time is credited, so it is measured from wherever the clock was.
  assert.equal(world.state.gameTime, startedAt + MAX_OFFLINE_SECONDS);
  assert.equal(report.caravanReturned, true); assert.equal(world.state.caravans[0].status, 'returned');
  assert.equal(world.state.population, population);
  assert.equal(world.state.buildings.some(building => building.damaged), false);
  assert.ok(world.state.happiness >= 25);
  assertHealthy(world);
});

test('offline time cannot run backwards and empty towns never create negative food', () => {
  const world = new SimWorld();
  const before = JSON.stringify(world.state);
  assert.equal(world.offline(-60).elapsed, 0); assert.equal(JSON.stringify(world.state), before);
  assert.equal(world.offline(NaN).elapsed, 0); assert.equal(JSON.stringify(world.state), before);
  world.state.resources = emptyResources();
  for (const building of world.state.buildings) { building.paused = true; building.ready = false; building.stock = {}; }
  const report = world.offline(3600);
  assert.equal(report.tax, 0); assert.equal(world.state.population, 13);
  assertHealthy(world);
});

test('save validation rejects corrupt numbers, overlaps and unsupported versions', () => {
  const save = createInitialState();
  for (const value of [null, {}, { ...save, version: 99 }, { ...save, coins: -1 }, { ...save, population: NaN }, { ...save, resources: { ...save.resources, bread: -1 } }, { ...save, capacity: 1 }, { ...save, settings: {} }]) assert.equal(validateSave(value), false);
  const overlap = createInitialState(); overlap.buildings[1].x = overlap.buildings[0].x; overlap.buildings[1].y = overlap.buildings[0].y;
  assert.equal(validateSave(overlap), false);
  assert.throws(() => new SimWorld({ ...save, coins: -1 }), /存档格式无效/);
});

test('mayor can operate a town for multiple seasons without breaking invariants', () => {
  const world = new SimWorld();
  world.state.settings.autoMayor = true; world.state.settings.disasters = true;
  for (let step = 0; step < 300; step++) { world.tick(5); assertHealthy(world); }
  assert.ok(world.state.stats.collected > 0);
  assert.ok(world.state.stats.ordersCompleted > 0);
  assert.ok(world.state.logs.some(log => log.type === 'mayor'));
});

test('AI tool calls reject missing, extra and malformed arguments before any mutation', () => {
  const world = new SimWorld();
  const before = JSON.stringify(world.state);
  for (const [name, args] of [
    ['build_building', { x: 7, y: 4 }],
    ['build_building', { x: 7, y: 4, buildingType: 'garden', free: true }],
    ['build_building', { x: Infinity, y: 4, buildingType: 'garden' }],
    ['set_tax_rate', { level: 'unknown' }],
    ['adjust_workforce', { buildingId: 'building-5', workerCount: -1 }],
    ['delete_everything', {}],
  ] as const) assert.equal(executeGameTool(world, name, args).ok, false);
  assert.equal(JSON.stringify(world.state), before);
  assert.equal(executeGameTool(world, 'build_building', { x: 7, y: 4, buildingType: 'garden' }).ok, true);
  assert.equal(executeGameTool(world, 'build_building', { x: 7, y: 4, buildingType: 'garden' }).ok, false);
  assertHealthy(world);
});

test('worker assignment can stop a workshop but cannot allocate more residents than available', () => {
  const world = new SimWorld();
  const mill = world.state.buildings.find(building => building.kind === 'windmill')!;
  assert.equal(world.adjustWorkforce(mill.id, 0).ok, true);
  const progress = mill.progress;
  world.tick(30); assert.equal(mill.progress, progress);
  assert.equal(world.adjustWorkforce(mill.id, 3).ok, false);
  assert.equal(world.adjustWorkforce(mill.id, 1).ok, true);
  world.state.resources.flour = 0;
  world.tick(30); assert.ok(mill.progress > progress);
  assertHealthy(world);
});

test('new workshops only take available residents and an unstaffed workshop does not produce', () => {
  const world = new SimWorld();
  const first = world.build('lumber', 6, 3);
  const second = world.build('lumber', 7, 3);
  const third = world.build('fishery', 8, 3);
  assert.equal(first.ok, true); assert.equal(second.ok, true); assert.equal(third.ok, true);
  const workers = (id: string | undefined) => world.state.buildings.find(building => building.id === id)!.workers;
  assert.equal(workers(first.buildingId), 2);
  assert.equal(workers(second.buildingId), 1);
  assert.equal(workers(third.buildingId), 0);
  world.tick(30); world.offline(120);
  const unstaffed = world.state.buildings.find(building => building.id === third.buildingId)!;
  assert.equal(unstaffed.progress, 0); assert.equal(unstaffed.ready, false);
  assertHealthy(world);
});

test('departing residents vacate their jobs so population decline never creates phantom workers', () => {
  const world = new SimWorld();
  world.build('lumber', 6, 3); world.build('lumber', 7, 3);
  const well = world.state.buildings.find(building => building.kind === 'well')!;
  assert.equal(world.demolish(well.id).ok, true);
  for (const building of world.state.buildings) building.paused = true;
  world.state.resources = emptyResources(); world.state.happiness = 10;
  world.setTax(4);
  world.tick(90);
  assert.equal(world.state.population, 12, 'one resident leaves the unhappy town');
  assertHealthy(world);
});

test('offline workshops retain earlier progress but never advance while ingredients are absent', () => {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  const mill = world.state.buildings.find(building => building.kind === 'windmill')!;
  mill.paused = false; mill.progress = 0.4;
  world.state.resources.flour = 0;
  world.state.resources.wheat = 0;
  world.offline(7); assert.equal(mill.progress, 0.4);
  world.offline(100); assert.equal(mill.progress, 0.4);
  world.state.resources.wheat = 3;
  const flour = world.state.resources.flour;
  world.offline(28);
  assert.equal(world.state.resources.flour, flour + 3);
  assert.equal(world.state.resources.wheat, 0);
  assert.equal(mill.progress, 0, 'no next batch starts after the last ingredients are consumed');
  world.offline(7); assert.equal(mill.progress, 0);
  assertHealthy(world);
});

test('offline source progress stops at full storage without erasing existing work', () => {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  const farm = world.state.buildings.find(building => building.kind === 'farm' && !building.ready)!;
  farm.paused = false; farm.progress = 0.5;
  world.state.resources = { ...emptyResources(), wood: world.state.capacity };
  world.offline(5); assert.equal(farm.progress, 0.5);
  world.offline(120); assert.equal(farm.progress, 0.5);
  assertHealthy(world);
});

test('wall-clock resume settles each interval once and never moves an anchor backwards', () => {
  const anchor = 1_000_000;
  const world = new SimWorld(createInitialState(anchor));
  world.dispatchCaravan();
  const report = world.offlineUntil(anchor + 120_000);
  assert.equal(report.elapsed, 120); assert.equal(report.caravanReturned, true);
  assert.equal(world.state.savedAt, anchor + 120_000);
  const settled = JSON.stringify(world.state);
  for (const timestamp of [anchor + 120_000, anchor, NaN, Infinity]) {
    assert.equal(world.offlineUntil(timestamp).elapsed, 0);
    assert.equal(JSON.stringify(world.state), settled);
  }
  const later = anchor + 100 * 60 * 60 * 1000;
  assert.equal(world.offlineUntil(later).elapsed, MAX_OFFLINE_SECONDS);
  assert.equal(world.state.savedAt, later, 'the cap discards excess time rather than saving it for another payout');
  assert.equal(world.offlineUntil(later + 1000).elapsed, 1);
  assertHealthy(world);
});

test('offline report accounts for every resource change', () => {
  const world = new SimWorld();
  const before = { ...world.state.resources };
  const report = world.offline(3600);
  for (const key of RESOURCE_KEYS) assert.equal(world.state.resources[key], before[key] + report.produced[key] - report.consumed[key], `${key} must be conserved`);
  assertHealthy(world);
});

test('save validation rejects fractional residents, excessive staff and invalid worker assignments', () => {
  for (const mutate of [
    (save: ReturnType<typeof createInitialState>) => { save.population = 12.5; },
    (save: ReturnType<typeof createInitialState>) => { save.population = 8; },
    (save: ReturnType<typeof createInitialState>) => { save.buildings.find(building => building.kind === 'windmill')!.workers = 3; },
    (save: ReturnType<typeof createInitialState>) => { save.buildings.find(building => building.kind === 'cottage')!.workers = 1; },
  ]) {
    const save = createInitialState(); mutate(save);
    assert.equal(validateSave(save), false);
  }
});

 test('demolishing a damaged cottage does not deduct its already unavailable beds twice', () => {
  const world = new SimWorld();
  const house = world.state.buildings.find(b => b.kind === 'cottage')!;
  house.damaged = true;
  populate(world, 12);
  assert.equal(world.demolish(house.id).ok, true);
  assert.equal(world.observe().housingCapacity, 12);
  assertHealthy(world);
});
