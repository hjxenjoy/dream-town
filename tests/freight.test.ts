import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, GAME_DAY_SECONDS, RESOURCE_KEYS, emptyResources, type BuildingKind } from '../src/sim/data.ts';
import { COMMUTE_MAX_SHARE, FREIGHT_MAX_SHARE, FREIGHT_REACH, commuteDistances, commuteFactor, commuteShare, freightFactor, freightShare, supplyFactor } from '../src/sim/layout.ts';
import { cycleOf } from './support.ts';

/** A flat town with room to place things deliberately, and no automation in the way. */
function roomy() {
  const world = new SimWorld();
  world.state.settings.disasters = false; world.state.settings.autoMayor = false;
  world.state.population = 60; world.state.capacity = 100000; world.state.coins = 1_000_000;
  world.state.buildings = []; world.state.roads = [];
  world.state.resources = { ...emptyResources(), wood: 5000, stone: 5000, ore: 5000, charcoal: 5000, wheat: 5000, milk: 5000 };
  // Every blueprint the fixtures place, so a research gate never decides what a test measures.
  for (const kind of ['feedmill', 'pasture', 'dairy', 'cowbarn', 'windmill', 'bakery', 'sawmill', 'mine', 'kiln', 'smelter', 'smithy'] as BuildingKind[]) {
    const technology = BUILDINGS[kind].technology;
    if (technology && !world.state.researched.includes(technology)) world.state.researched.push(technology);
  }
  return world;
}
function at(world: SimWorld, kind: BuildingKind, x: number, y: number) {
  const result = world.build(kind, x, y);
  assert.equal(result.ok, true, `${kind} at ${x},${y}: ${result.message}`);
  return world.state.buildings.find(building => building.id === result.buildingId)!;
}
/** Staffs everything standing, so a cycle is measured with the workers it needs. */
function staff(world: SimWorld) {
  for (const building of world.state.buildings) {
    if (BUILDINGS[building.kind].workers) building.workers = BUILDINGS[building.kind].workers!;
    building.paused = false;
  }
}

test('the carriage is proportional to the walk and never a way to gain time', () => {
  assert.equal(freightShare(0), 0, 'a load with nowhere to go costs nothing');
  assert.equal(freightShare(Infinity), 0, 'and neither does a workshop with no supplier at all');
  assert.ok(freightShare(1) < freightShare(9), 'further costs more');
  assert.ok(Math.abs(freightShare(FREIGHT_REACH) - FREIGHT_MAX_SHARE) < 1e-9, 'the reach is where the cap lands');
  assert.ok(Math.abs(freightShare(FREIGHT_REACH * 3) - FREIGHT_MAX_SHARE) < 1e-9, 'and past it the cap holds');
  for (const distance of [0, 1, 5, FREIGHT_REACH, 500]) assert.ok(freightFactor(distance) >= 1, `a journey never saves time at ${distance}`);
  // A third of the way is a third of the cost, which is what makes the rule readable on the map.
  assert.ok(Math.abs(freightShare(FREIGHT_REACH / 3) - FREIGHT_MAX_SHARE / 3) < 1e-9);
});

test('the commute is a share of the day, capped, and never a bonus', () => {
  assert.equal(commuteShare(Infinity), 0, 'a workplace no home can reach is left alone by this rule');
  assert.equal(commuteShare(0), 0, 'living next door costs nothing');
  assert.ok(commuteShare(3) > commuteShare(1), 'further is dearer');
  assert.ok(Math.abs(commuteShare(1000) - COMMUTE_MAX_SHARE) < 1e-9, 'however far, the cap holds');
  for (const distance of [0, 1, 9, 1000]) assert.ok(commuteFactor(distance) >= 1, `a commute never saves time at ${distance}`);
  // Walking is time away from the bench, so the batch stretches by 1/(1-share) — a tenth of the
  // day walking is a batch that takes a ninth longer, which is the arithmetic of the claim.
  assert.ok(Math.abs(commuteFactor(0) - 1) < 1e-9);
  assert.ok(Math.abs(commuteFactor(1000) - 1 / (1 - COMMUTE_MAX_SHARE)) < 1e-9);
});

test('a load that has further to come holds the batch up', () => {
  const close = roomy(), far = roomy();
  const near = { w: close, mill: at(close, 'feedmill', 10, 10) };
  const distant = { w: far, mill: at(far, 'feedmill', 10, 10) };
  at(close, 'farm', 11, 10);          // right next door
  at(far, 'farm', 10, 22);            // twelve tiles away
  staff(close); staff(far);
  close.state.resources.wheat = 200; far.state.resources.wheat = 200;

  const mill = (world: SimWorld, id: string) => world.observe().production.find(row => row.buildingId === id)!;
  const nearRow = mill(close, near.mill.id), farRow = mill(far, distant.mill.id);
  assert.ok(nearRow.freight.carry < farRow.freight.carry, `the near load arrives sooner: ${nearRow.freight.carry} vs ${farRow.freight.carry}`);
  assert.ok(nearRow.cycle < farRow.cycle, `so the mill turns faster: ${nearRow.cycle} vs ${farRow.cycle}`);

  // And it is a wait, not a shortcut: both turn out exactly the same batch.
  close.tick(cycleOf(close, near.mill)); far.tick(cycleOf(far, distant.mill));
  assert.equal(near.mill.ready, true);
  assert.equal(distant.mill.ready, true);
  assert.deepEqual(near.mill.stock, distant.mill.stock, 'distance changes the timing, never the goods');
  assert.equal(validateSave(close.state), true);
});

test('homes near the work shorten the day, and the effect is bounded', () => {
  const near = roomy(), far = roomy();
  const millA = at(near, 'windmill', 10, 10), millB = at(far, 'windmill', 10, 10);
  at(near, 'farm', 10, 12); at(far, 'farm', 10, 12);
  at(near, 'cottage', 11, 10);     // beside the mill
  at(far, 'cottage', 10, 26);      // sixteen tiles away
  staff(near); staff(far);
  near.state.resources.wheat = 200; far.state.resources.wheat = 200;

  const row = (world: SimWorld, id: string) => world.observe().production.find(entry => entry.buildingId === id)!;
  const a = row(near, millA.id), b = row(far, millB.id);
  assert.ok(a.freight.walk < b.freight.walk, `the near home is a shorter walk: ${a.freight.walk} vs ${b.freight.walk}`);
  assert.ok(a.cycle < b.cycle, `so the mill by the homes turns faster: ${a.cycle} vs ${b.cycle}`);
  // Bounded: the far town is slower, not stalled. A town that misplaced everything still runs.
  assert.ok(b.cycle <= a.cycle * (1 + COMMUTE_MAX_SHARE) * (1 + FREIGHT_MAX_SHARE) + 1e-6, `the far mill is slower but still working: ${a.cycle} vs ${b.cycle}`);
});

test('a fire never shortens the walk, even when it burns the only home', () => {
  // The bug this pins: a burnt house was dropped from the commute sweep, so burning the town's
  // only home removed everyone's walk to work — a disaster quietly granting a production bonus.
  const world = roomy();
  at(world, 'farm', 10, 12);
  const mill = at(world, 'windmill', 10, 10);
  const home = at(world, 'cottage', 11, 10);
  at(world, 'lumber', 30, 30);
  staff(world);
  world.state.resources.wheat = 400;

  const commuteOf = (building: { id: string }) => world.observe().production.find(row => row.buildingId === building.id)?.freight.commute;
  const before = { cycle: world.observe().production.find(row => row.buildingId === mill.id)!.cycle, commute: commuteOf(mill) };
  assert.ok(Number.isFinite(before.commute), 'the mill had a home to draw workers from');

  home.damaged = true;
  const after = { cycle: world.observe().production.find(row => row.buildingId === mill.id)!.cycle, commute: commuteOf(mill) };
  assert.equal(after.commute, before.commute, 'a ruin still shelters the people who live in it');
  assert.ok(after.cycle >= before.cycle - 1e-9, `so the fire does not speed the mill up: ${before.cycle} -> ${after.cycle}`);

  // A ruin is still a wall, exactly as the haul rule already requires.
  const walled = roomy();
  at(walled, 'farm', 8, 11); at(walled, 'windmill', 14, 11);
  const blocker = at(walled, 'cottage', 11, 11);
  staff(walled); walled.state.resources.wheat = 400;
  const haul = () => walled.observe().production.find(row => row.buildingId === walled.state.buildings[1]!.id)?.freight.haul;
  const openHaul = haul();
  blocker.damaged = true;
  assert.equal(haul(), openHaul, 'the haul is unchanged: a ruin still blocks the way');
});

test('the two journeys compose with the town\'s other bonuses instead of eroding them', () => {
  // The reason both are multipliers rather than added legs: everything else that changes a cycle
  // multiplies it, so an added leg would quietly break each of their promises. Efficiency is the
  // sharpest case — its card says every workshop's cycle drops by a tenth, exactly.
  const world = roomy();
  at(world, 'farm', 10, 12);
  const mill = at(world, 'windmill', 10, 10);
  at(world, 'cottage', 12, 10);
  at(world, 'mine', 20, 20);
  staff(world);
  world.state.resources.wheat = 400;
  // Only the mill runs, so the town's worker pool and morale are held still while efficiency
  // lands. Anything else moving would make the tenth look like it was eroded when it was not.
  const baseline = [...world.state.researched];
  for (const building of world.state.buildings) building.paused = true;
  mill.paused = false;
  mill.workers = 2; mill.staffing = 2;

  const before = world.observe().production.find(row => row.buildingId === mill.id)!.cycle;
  assert.ok(before > 0);
  world.state.researched = [...baseline, 'efficiency'];
  const after = world.observe().production.find(row => row.buildingId === mill.id)!.cycle;
  assert.ok(Math.abs(after - before * 0.9) < 1e-9, `efficiency still takes exactly a tenth: ${before} -> ${after}`);
});

test('a compact town pays almost nothing, and a sprawling one pays in proportion', () => {
  // The whole point of the rule: layout is the difference between a town that works and one that
  // merely stands. Both towns are identical except for where the homes and fields were put.
  const compact = roomy(), sprawl = roomy();
  for (const world of [compact, sprawl]) {
    at(world, 'farm', 10, 12); at(world, 'windmill', 10, 10); at(world, 'lumber', 20, 20);
  }
  at(compact, 'cottage', 11, 11); at(compact, 'cottage', 9, 11);
  at(sprawl, 'cottage', 34, 34); at(sprawl, 'cottage', 36, 36);
  staff(compact); staff(sprawl);
  compact.state.resources.wheat = 300; sprawl.state.resources.wheat = 300;

  const cycle = (world: SimWorld) => world.observe().production.find(row => row.buildingId === world.state.buildings.find(b => b.kind === 'windmill')!.id)!.cycle;
  assert.ok(cycle(compact) < cycle(sprawl), `the compact town is quicker: ${cycle(compact)} vs ${cycle(sprawl)}`);
  assert.equal(validateSave(compact.state), true);
  assert.equal(validateSave(sprawl.state), true);
});

test('the journeys reach the panel and survive a save round trip', () => {
  const world = roomy();
  at(world, 'farm', 12, 12); const mill = at(world, 'windmill', 10, 10); at(world, 'cottage', 30, 30);
  staff(world);
  const row = world.observe().production.find(entry => entry.buildingId === mill.id)!;
  assert.ok(row.freight, 'every production row carries its journeys');
  assert.ok(row.freight.carry >= 0 && row.freight.carry <= FREIGHT_MAX_SHARE, 'the carriage is a real share');
  assert.ok(row.freight.walk >= 0 && row.freight.walk <= COMMUTE_MAX_SHARE, 'and so is the commute');
  assert.equal(typeof row.freight.haul, 'number');
  // A save carries nothing about either: both are read off the map, so they cannot go stale.
  const reloaded = new SimWorld(world.state);
  const after = reloaded.observe().production.find(entry => entry.buildingId === mill.id)!;
  assert.deepEqual(after.freight, row.freight, 'the journeys are the same after a reload');
  assert.equal(validateSave(reloaded.state), true);
});

test('the starting town is told the truth about its own layout', () => {
  // Not a design claim, a guard against the rule silently vanishing: in the town the player is
  // handed, the workshops stand far from the three cottages and the walk really is charged.
  const world = new SimWorld();
  world.tick(0.5);
  const rows = world.observe().production;
  assert.ok(rows.length > 0);
  const charged = rows.filter(row => row.freight.walk > 0);
  assert.ok(charged.length > 0, 'at least one workshop pays for the walk to work');
  for (const row of rows) {
    assert.ok(row.freight.walk <= COMMUTE_MAX_SHARE + 1e-9, `${row.kind} is inside the cap`);
    assert.ok(row.freight.carry <= FREIGHT_MAX_SHARE + 1e-9, `${row.kind} is inside the cap`);
    assert.ok(row.cycle > 0);
  }
  // Every home is a home whatever its state, and every workplace with workers is measured.
  const homes = world.state.buildings.filter(b => BUILDINGS[b.kind].housing).length;
  assert.ok(homes > 0);
  const distances = commuteDistances(world.state.buildings, world.state.roads ?? []);
  assert.ok(distances.size > 0, 'the sweep finds workplaces');
  for (const value of distances.values()) assert.ok(Number.isInteger(value) && value > 0);
});

test('the journeys cost time, never goods', () => {
  // docs/12 §二.2 and the proximity rule both say the same thing: a quicker batch is a saved
  // worker and a freed plot, not a bigger yield. A town that pays for its journeys must end up
  // with exactly the same goods as one that does not.
  const world = roomy();
  at(world, 'farm', 10, 12); at(world, 'windmill', 10, 10); at(world, 'cottage', 11, 11);
  staff(world);
  world.state.resources.wheat = 60;
  for (const building of world.state.buildings) building.paused = true;
  const mill = world.state.buildings.find(b => b.kind === 'windmill')!;
  mill.paused = false;
  world.state.resources.flour = 0;
  world.tick(cycleOf(world, mill));
  assert.equal(mill.ready, true, 'the batch is up');
  world.collect(mill.id);
  assert.equal(world.state.resources.flour, BUILDINGS.windmill.output!.flour, 'the batch is the ordinary size');
  // And the resources are exactly conserved: what went in is what the recipe says.
  assert.equal(world.state.resources.wheat, 60 - BUILDINGS.windmill.input!.wheat!, 'and it ate exactly its recipe');
});
