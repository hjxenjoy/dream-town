import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, type Building } from '../src/sim/world.ts';
import { BUILDINGS, emptyResources, type BuildingKind } from '../src/sim/data.ts';
import { LOCAL_SUPPLY_FACTOR, LOCAL_SUPPLY_RANGE, supplyFactor, supplyHauls, supplyStrength } from '../src/sim/layout.ts';
import { projectMetrics } from '../src/sim/projects.ts';
import { populate } from './population.ts';

const KINDS: BuildingKind[] = ['windmill', 'feedmill', 'pasture', 'weaver', 'tailor', 'smelter', 'smithy', 'kiln', 'mine', 'bakery', 'farm'];

/** A town with room, materials and every blueprint, so placement is the only variable. */
function roomy() {
  const w = new SimWorld();
  w.state.settings.disasters = false; w.state.settings.autoMayor = false;
  populate(w, 40); w.state.capacity = 100000; w.state.coins = 1_000_000;
  w.state.buildings = []; w.state.roads = [];
  w.state.resources = { ...emptyResources(), wood: 5000, stone: 5000, ore: 5000, charcoal: 5000, wheat: 5000, wool: 5000, cloth: 5000, feed: 5000, milk: 5000, materials: 5000 };
  for (const kind of KINDS) {
    const technology = BUILDINGS[kind].technology;
    if (technology && !w.state.researched.includes(technology)) w.state.researched.push(technology);
  }
  return w;
}

/** Places a building at an exact tile, insisting the rules accept it. */
function at(w: SimWorld, kind: BuildingKind, x: number, y: number): Building {
  const result = w.build(kind, x, y);
  assert.equal(result.ok, true, `${kind} @${x},${y}: ${result.message}`);
  return w.state.buildings.find(b => b.id === result.buildingId)!;
}

/** A gap of `gap` empty tiles between the two buildings, so the walk between them is known. */
function pair(gap: number, extra: (w: SimWorld) => void = () => {}) {
  const w = roomy();
  const supplier = at(w, 'lumber', 6, 10);           // makes wood
  const consumer = at(w, 'sawmill', 6 + 2 + gap, 10); // eats wood: supplier's two-tile yard, then `gap` empty tiles
  extra(w);
  const hauls = supplyHauls(w.state.buildings, w.state.roads ?? []);
  return { w, supplier, consumer, haul: hauls.get(consumer.id) };
}

test('a haul is measured in tiles walked, and closer is worth more', () => {
  // One empty tile between the workshops: the carrier steps straight across it.
  const tight = pair(1);
  // Five empty tiles between them: the same furniture, a longer carry.
  const wide = pair(5);
  assert.ok(Number.isFinite(tight.haul!) && Number.isFinite(wide.haul!));
  assert.ok(wide.haul! > tight.haul!, `the wider gap is the longer haul: ${tight.haul} vs ${wide.haul}`);
  assert.ok(tight.haul! <= 2, `neighbouring workshops are a short haul: ${tight.haul}`);
  assert.ok(supplyFactor(tight.haul!) < supplyFactor(wide.haul!), 'and it earns the better multiplier');
  assert.equal(supplyFactor(wide.haul!) <= 1, true);
  assert.ok(supplyFactor(tight.haul!) >= LOCAL_SUPPLY_FACTOR, 'never better than the declared best case');

  // The curve itself: full next door, nothing at the range.
  assert.equal(supplyStrength(1), 1);
  assert.equal(supplyStrength(LOCAL_SUPPLY_RANGE), 0);
  assert.equal(supplyStrength(LOCAL_SUPPLY_RANGE + 5), 0);
  assert.ok(supplyStrength(3) > 0 && supplyStrength(3) < 1, 'and it fades in between');
});

test('a wall of buildings lengthens the haul, because the carrier walks around it', () => {
  // The straight line is identical in both towns; only the walls differ.
  const open = pair(2);
  const walled = pair(2, w => {
    // A solid column of cottages through the two-tile gap between the two, forcing the walk to go round.
    for (let y = 3; y <= 17; y += 2) at(w, 'cottage', 8, y);
  });
  assert.equal(walled.consumer.x - walled.supplier.x, open.consumer.x - open.supplier.x, 'the straight line is unchanged');
  // A wall of that length severs the link outright, which is the extreme of "longer": either
  // the haul grows or it stops being a haul at all.
  assert.ok(walled.haul === undefined || walled.haul! > open.haul!,
    `a wall makes the real haul longer or ends it: ${open.haul} -> ${walled.haul}`);
  // A shorter wall can be walked around, and that detour is measurable.
  const detour = pair(2, w => { for (let y = 9; y <= 11; y += 2) at(w, 'cottage', 8, y); });
  assert.ok(Number.isFinite(detour.haul!) && detour.haul! > open.haul!,
    `walking around a short wall costs more than crossing the gap: ${open.haul} -> ${detour.haul}`);
});

test('a workshop with no way in falls back to how close its supplier stands', () => {
  // Boxed in on all four sides: the supplier's yard occupies one edge, cottages the rest, so
  // there is no walkable ground touching the workshop at all.
  const w = roomy();
  const supplier = at(w, 'lumber', 6, 10);
  const consumer = at(w, 'sawmill', 8, 10);
  at(w, 'cottage', 7, 8); at(w, 'cottage', 9, 8); at(w, 'cottage', 10, 10);
  at(w, 'cottage', 7, 12); at(w, 'cottage', 9, 12);
  const hauls = supplyHauls(w.state.buildings, w.state.roads ?? []);
  const haul = hauls.get(consumer.id);
  assert.ok(Number.isFinite(haul), 'a boxed-in workshop is still measured, not silently dropped');
  assert.equal(haul, 2, 'and falls back to the straight line between the two yards');
  assert.ok(supplyFactor(haul!) <= 1);
  void supplier;
});

test('only a real input counts, and a workshop never supplies itself', () => {
  // A tailor makes clothing, not wood: standing next to a sawmill does not feed it.
  const wrong = roomy();
  at(wrong, 'tailor', 6, 6);
  const mill = at(wrong, 'sawmill', 8, 6);
  const wrongHauls = supplyHauls(wrong.state.buildings, wrong.state.roads ?? []);
  assert.equal(wrongHauls.get(mill.id), undefined, 'a neighbour making something else is not a supplier');

  // A lone windmill has nothing to consume, so the rule never applies to it.
  const lone = roomy();
  const mill2 = at(lone, 'windmill', 6, 12);
  assert.equal(supplyHauls(lone.state.buildings, lone.state.roads ?? []).get(mill2.id), undefined);
  // Nor does a gatherer: a quarry consumes nothing.
  const quarry = at(lone, 'quarry', 8, 12);
  assert.equal(supplyHauls(lone.state.buildings, lone.state.roads ?? []).get(quarry.id), undefined);
});

test('the bonus saves time without manufacturing extra goods', () => {
  // A barn that is not already full, so the workshops are genuinely running: with the stores
  // at their targets a workshop rests, and the comparison would measure nothing.
  const fixture = (gap: number) => {
    const w = roomy();
    w.state.capacity = 600;
    w.state.resources = { ...emptyResources(), wood: 120, stone: 80, wheat: 300 };
    const supplier = at(w, 'farm', 6, 10);
    const mill = at(w, 'feedmill', 6 + gap + 1, 10);
    void supplier;
    return { w, mill };
  };
  const near = fixture(1);
  const far = fixture(9);
  const nearHaul = supplyHauls(near.w.state.buildings, []).get(near.mill.id);
  const farHaul = supplyHauls(far.w.state.buildings, []).get(far.mill.id);
  assert.equal(farHaul, undefined, 'nine tiles away is beyond the range: no bonus at all');

  const cycle = (w: SimWorld, id: string) => w.observe().production.find(p => p.buildingId === id)!.cycle;
  assert.ok(cycle(near.w, near.mill.id) < cycle(far.w, far.mill.id), `the supplied mill is quicker: ${cycle(near.w, near.mill.id)} vs ${cycle(far.w, far.mill.id)}`);
  assert.ok(Number.isFinite(nearHaul!));

  // Both finish the same batch; the supplied one simply gets there sooner. The spans are read
  // from the reported cycles rather than written in, because the walk and the load are part of
  // the cycle now and a fixed number would drift out from under the claim.
  const nearCycle = cycle(near.w, near.mill.id), farCycle = cycle(far.w, far.mill.id);
  assert.ok(nearCycle < farCycle, `the supplied mill is quicker: ${nearCycle} vs ${farCycle}`);
  near.w.tick(nearCycle + 0.5); far.w.tick(nearCycle + 0.5);
  assert.equal(near.mill.ready, true, `the supplied mill has finished after ${nearCycle} seconds`);
  assert.equal(far.mill.ready, false, 'the mill with the distant supplier has not');
  assert.deepEqual(near.mill.stock, BUILDINGS.feedmill.output, `batch is the ordinary size: ${JSON.stringify(near.mill.stock)}`);
  far.w.tick(farCycle - nearCycle + 0.5);
  assert.deepEqual(far.mill.stock, near.mill.stock, 'and the far one eventually holds exactly the same batch');
  assert.equal(validateSave(near.w.state), true);
});

test('the step bonus and the 匠人街 checklist are one fact, not two', () => {
  const w = roomy();
  at(w, 'farm', 6, 6);
  at(w, 'windmill', 8, 6);
  at(w, 'bakery', 10, 6);
  at(w, 'lumber', 6, 8);
  at(w, 'sawmill', 8, 8);
  const standing = w.state.buildings.filter(b => !b.damaged);
  const hauls = supplyHauls(standing, w.state.roads ?? []);
  const bonusPays = standing.filter(b => BUILDINGS[b.kind].input && (hauls.get(b.id) ?? Infinity) < LOCAL_SUPPLY_RANGE);
  assert.ok(bonusPays.length >= 3, `the fixture has a real cluster: ${bonusPays.length}`);
  assert.equal(projectMetrics(w.state).links, bonusPays.length,
    'the checklist counts exactly the workshops the bonus pays out to');

  // Breaking a supplier withdraws both the bonus and the tick, together.
  const before = projectMetrics(w.state).links;
  standing.find(b => b.kind === 'farm')!.damaged = true;
  assert.ok(projectMetrics(w.state).links < before, 'a broken supplier removes the link');
});

test('the freight routes the map draws are the links the economy pays for', () => {
  const w = roomy();
  at(w, 'farm', 6, 6);
  at(w, 'windmill', 8, 6);
  at(w, 'bakery', 10, 6);
  const routes = w.freightRoutes();
  assert.ok(routes.length > 0, 'a linked town shows loads being carried');
  assert.ok(routes.length <= 6, 'and the number drawn is capped');
  for (const route of routes) {
    const consumer = w.state.buildings.find(b => b.x === route.to.x && b.y === route.to.y)!;
    const supplier = w.state.buildings.find(b => b.x === route.from.x && b.y === route.from.y)!;
    // The carrier goes from something that makes an ingredient to the workshop that eats it.
    const outputs = Object.keys(BUILDINGS[supplier.kind].output ?? {});
    const inputs = Object.keys(BUILDINGS[consumer.kind].input ?? {});
    assert.ok(outputs.some(key => inputs.includes(key)), `${supplier.kind} supplies ${consumer.kind}`);
    assert.equal(route.kind, consumer.kind);
  }
  // A town with nothing linked has no carriers to draw.
  const idle = new SimWorld();
  for (const b of idle.state.buildings) if (BUILDINGS[b.kind].input) b.damaged = true;
  assert.equal(idle.freightRoutes().length, 0, 'no links, no carriers');
});

test('two workshops sharing one patch of open ground are not given a carrier', () => {
  // Both workshops are boxed in so tightly that the nearest walkable tile to each is the SAME
  // tile — the one gap between them. There is no journey to make, and a carrier sent anyway
  // would stand on that tile flipping direction forever, occupying a slot and twitching in
  // place. The fix is to send no load; this asserts the degenerate case is filtered out.
  const w = roomy();
  at(w, 'lumber', 30, 20);
  at(w, 'sawmill', 33, 20);
  // Four cottages seal everything around the lumber's yard except the one shared tile at32,20 —
  // the spiral nearest() walks from each anchor finds that same tile for both workshops.
  for (const [x, y] of [[28, 19], [30, 18], [28, 21], [30, 22]] as [number, number][]) at(w, 'cottage', x, y);

  // The two do count as locally supplied: they are one tile of walking apart.
  const standing = w.state.buildings.filter(b => !b.damaged);
  const hauls = supplyHauls(standing, w.state.roads ?? []);
  const sawmill = standing.find(b => b.kind === 'sawmill')!;
  assert.ok((hauls.get(sawmill.id) ?? Infinity) < LOCAL_SUPPLY_RANGE, 'the bonus applies — they really are adjacent');

  // But nothing is put on the map, because there is no distance to cover.
  assert.equal(w.freightRoutes().length, 0, 'no carrier is sent between two ends that share a tile');

  // A pair with real ground between them still sends one.
  const healthy = roomy();
  at(healthy, 'lumber', 30, 10);
  at(healthy, 'sawmill', 33, 10);
  assert.equal(healthy.freightRoutes().length, 1, 'a normal pair still gets its carrier');
});

test('a burnt building still blocks the walk, so a fire never speeds production up', () => {
  // The bug this pins: the haul was computed from standing buildings only and that same list
  // became the walk's blocked set, so burning a building between two workshops shortened their
  // haul — a disaster quietly granting a production bonus, and carriers walking through ruins.
  const w = roomy();
  at(w, 'lumber', 6, 10);
  const wall = at(w, 'cottage', 8, 10);
  const saw = at(w, 'sawmill', 10, 10);

  const before = w.observe().production.find(p => p.buildingId === saw.id)!;
  wall.damaged = true;
  const after = w.observe().production.find(p => p.buildingId === saw.id)!;
  assert.equal(after.haul, before.haul, 'a ruin is still a wall: the haul is unchanged');
  assert.ok(after.cycle >= before.cycle - 1e-9, `and production does not speed up: ${before.cycle} -> ${after.cycle}`);
});

test('a field switched away from wheat stops supplying the mill beside it', () => {
  // A farm's card says wheat, but a field growing anything else sends its crop to the farm
  // stall and puts nothing in the barn, so nothing downstream can be supplied from it.
  const w = roomy();
  const farm = at(w, 'farm', 6, 14);
  const mill = at(w, 'windmill', 8, 14);

  const wheat = w.observe().production.find(p => p.buildingId === mill.id)!;
  assert.equal(wheat.haul, 1, 'a wheat field next door supplies the mill');

  farm.crop = 'apple';
  const apples = w.observe().production.find(p => p.buildingId === mill.id)!;
  assert.ok(apples.haul === null || apples.haul > wheat.haul!, `an apple field does not supply a windmill: ${apples.haul}`);
  assert.ok(apples.cycle > wheat.cycle, 'so the mill loses the bonus');

  farm.crop = 'wheat';
  const back = w.observe().production.find(p => p.buildingId === mill.id)!;
  assert.equal(back.haul, wheat.haul, 'and switching back restores it');
});
