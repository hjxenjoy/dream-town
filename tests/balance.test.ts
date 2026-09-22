import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, GAME_DAY_SECONDS, RESOURCE_KEYS, TECHNOLOGY_KEYS, type BuildingKind } from '../src/sim/data.ts';
import { BUY_IN_PRICE, DISASTER_INTERVAL, MAX_DAMAGED_SHARE, MIN_DISASTER_POPULATION, REPAIR_SECONDS, damageCeiling, disasterOf, strikeInterval } from '../src/sim/disasters.ts';

/** A town with everything unlocked, materials in hand and no automation. */
function prepared() {
  const w = new SimWorld();
  w.state.coins = 100000; w.state.capacity = 4000;
  w.state.resources.wood = 600; w.state.resources.stone = 600;
  w.state.researched = [...TECHNOLOGY_KEYS];
  w.state.settings.disasters = false; w.state.settings.autoMayor = false;
  return w;
}

/** Breaks a building without going through the hazard path. */
function break_(w: SimWorld, kind: BuildingKind, damage: 'fire' | 'flood' = 'fire') {
  const built = w.state.buildings.find(building => building.kind === kind);
  assert.ok(built, `${kind} stands`);
  built!.damaged = true; built!.damageKind = damage;
  return built!;
}

test('a repair is never blocked by a material the town cannot make', () => {
  // The corner that used to be a dead end: no wood, and nothing left that can saw any. Before
  // this rule the town could not repair at all, because every repair costs wood and every
  // woodworks costs wood to build — the save was simply finished.
  const w = prepared();
  w.state.resources.wood = 0; w.state.resources.stone = 0;
  for (const building of w.state.buildings) if (BUILDINGS[building.kind].output?.wood || BUILDINGS[building.kind].output?.stone) building.damaged = true;
  const cottage = w.state.buildings.find(building => building.kind === 'cottage')!;
  cottage.damaged = true; cottage.damageKind = 'fire';

  const quote = w.repairQuote(cottage);
  assert.equal(quote.wood, 0, 'no wood is needed on hand');
  assert.equal(quote.stone, 0, 'nor stone');
  assert.equal(quote.bought.wood, disasterOf('fire').repair.wood, 'the wood is bought in');
  assert.equal(quote.bought.stone, disasterOf('fire').repair.stone, 'and so is the stone');
  assert.equal(quote.coins, disasterOf('fire').repair.coins + quote.bought.wood * BUY_IN_PRICE.wood + quote.bought.stone * BUY_IN_PRICE.stone, 'the price is the base plus the premium');

  const coins = w.state.coins;
  assert.equal(w.repair(cottage.id).ok, true, 'the repair can be paid for with coins alone');
  assert.equal(w.state.coins, coins - quote.coins, 'and charges exactly the quoted price');
  w.tick(REPAIR_SECONDS + 1);
  assert.equal(cottage.damaged, false, 'the building comes back');
  assert.equal(validateSave(w.state), true);
});

test('a town with materials in hand pays no premium', () => {
  const w = prepared();
  const cottage = break_(w, 'cottage');
  const quote = w.repairQuote(cottage);
  assert.equal(quote.bought.wood, 0); assert.equal(quote.bought.stone, 0);
  assert.equal(quote.coins, disasterOf('fire').repair.coins, 'the price is the ordinary one');
  assert.equal(quote.wood, disasterOf('fire').repair.wood, 'and the timber comes from the yard');
});

test('the premium is dearer than the material is worth, so it is never a way to buy cheaply', () => {
  // Otherwise a player could run the yard to zero on purpose and buy timber at a discount.
  assert.ok(BUY_IN_PRICE.wood > 40, 'timber is dear');
  assert.ok(BUY_IN_PRICE.stone > 40, 'so is stone');
  assert.ok(BUY_IN_PRICE.wood < 200 && BUY_IN_PRICE.stone < 200, 'but not so dear that a repair is impossible');
});

test('damage is bounded, so no town can be buried faster than it can repair', () => {
  assert.equal(damageCeiling(0), 1, 'even an empty town cannot be struck twice over');
  assert.equal(damageCeiling(1), 1);
  assert.equal(damageCeiling(2), 1, 'a two-building hamlet carries one loss at a time');
  assert.equal(damageCeiling(3), 1);
  assert.equal(damageCeiling(6), 2);
  assert.equal(damageCeiling(30), 10);
  for (const total of [1, 5, 19, 60, 200]) {
    assert.ok(damageCeiling(total) >= 1, 'some damage is always allowed');
    assert.ok(damageCeiling(total) <= Math.max(1, total), 'never more than the town has');
    assert.ok(damageCeiling(total) <= Math.ceil(total * MAX_DAMAGED_SHARE), 'and never more than the legal share');
  }
});

test('hazards slow down as damage piles up, and are unchanged on a healthy town', () => {
  assert.equal(strikeInterval(30, 0), DISASTER_INTERVAL, 'a healthy town is struck exactly as before');
  const light = strikeInterval(30, 5), heavy = strikeInterval(30, 15);
  assert.ok(light > DISASTER_INTERVAL, 'a damaged town gets a longer breather');
  assert.ok(heavy > light, 'and a worse one gets longer still');
  // The breather is a delay, not an immunity: a damaged town is still on the hook.
  assert.ok(Number.isFinite(heavy) && heavy > 0, 'the wait is always a real one');
  assert.equal(strikeInterval(0, 0), DISASTER_INTERVAL, 'a town with no buildings is not a special case');
});

test('nothing strikes a town too small to come back from it', () => {
  const w = prepared();
  w.state.settings.disasters = true;
  w.state.population = MIN_DISASTER_POPULATION - 1;
  w.state.happiness = 90;
  w.state.lastDisasterAt = 0;
  // No food in the larder, so the town cannot grow back over the threshold mid-test.
  for (const key of ['fish', 'bread', 'wheat', 'flour'] as const) w.state.resources[key] = 0;
  // Run well past several intervals and confirm nothing is damaged.
  for (let i = 0; i < 6000; i++) w.tick(1);
  assert.equal(w.state.buildings.some(building => building.damaged), false, 'a hamlet is spared');
  assert.ok(w.state.gameTime > DISASTER_INTERVAL * 10, 'and enough time passed for several strikes');
});

test('a wrecked town recovers: the dead end is gone', () => {
  // The whole shape of the old failure: neglect until the treasury and the yard are empty and
  // most of the town is rubble, then play attentively.
  const w = new SimWorld();
  w.state.settings.disasters = true; w.state.settings.autoMayor = false;
  w.state.taxRate = 4;
  for (let i = 0; i < 40000; i++) w.tick(0.5);
  const wrecked = w.state.buildings.filter(building => building.damaged).length;
  assert.ok(wrecked <= damageCeiling(w.state.buildings.length), `neglect cannot bury the town: ${wrecked} damaged`);

  // Play it properly for a long while: repair what is broken, keep the shelves moving.
  for (let i = 0; i < 80000; i++) {
    w.tick(0.5);
    if (i % 20) continue;
    for (const building of w.state.buildings) if (building.damaged && building.repairingUntil === undefined) w.repair(building.id);
    w.collectAll();
    if (w.state.taxRate > 1) w.setTax(1);
    if (w.state.resources.wood < 4 || w.state.coins < 600) w.sellSurplus();
    if (w.state.caravans[0].status === 'returned') w.dispatchCaravan();
  }
  assert.equal(w.state.buildings.some(building => building.damaged), false, 'every building is repaired');
  assert.ok(w.state.happiness > 40, `the town is not miserable: ${Math.round(w.state.happiness)}`);
  assert.ok(w.state.coins > 300, `and not penniless: ${Math.round(w.state.coins)}`);
  assert.equal(validateSave(w.state), true);
});

test('a small town spends its few workers on food before anything else', () => {
  // A town whose handful of residents all staff a bakery that cannot bake leaves the fishery
  // empty, so it makes no food, so it never grows back. Water is a fair proxy for population.
  const w = prepared();
  w.state.population = 3;
  w.state.resources.fish = 0; w.state.resources.bread = 0;
  w.state.buildings = w.state.buildings.filter(building => ['fishery', 'bakery', 'windmill', 'smithy', 'quarry', 'lumber'].includes(building.kind));
  assert.ok(w.state.buildings.length >= 4, 'there are several workshops to choose between');
  w.tick(GAME_DAY_SECONDS + 1);
  const staffed = (kind: BuildingKind) => w.state.buildings.find(building => building.kind === kind)?.workers ?? 0;
  assert.ok(staffed('fishery') > 0, 'the fishery gets a hand: it feeds the town from nothing');
  const wasted = w.state.buildings.filter(building => (building.workers ?? 0) > 0 && building.paused).length;
  assert.equal(wasted, 0, 'and nobody is parked somewhere idle');
});

test('a town that is eating keeps its own order, so a player\'s industry is not raided for hands', () => {
  const w = prepared();
  w.state.population = 3;
  w.state.resources.fish = 200; w.state.resources.bread = 200;
  w.state.buildings = w.state.buildings.filter(building => ['fishery', 'winery', 'cellar'].includes(building.kind));
  const before = w.state.buildings.map(building => building.workers ?? 0).join(',');
  w.tick(GAME_DAY_SECONDS + 1);
  const after = w.state.buildings.map(building => building.workers ?? 0).join(',');
  assert.equal(after, before, 'a fed town does not reshuffle its workshops');
});

test('labour freed up is not permanently lost to a workshop that once had none', () => {
  // Keeping a building's old number makes starvation permanent: trimmed to zero during a
  // shortage, a workshop stayed at zero for good even with people to spare.
  const w = prepared();
  const shed = w.state.buildings.find(building => building.kind === 'lumber')!;
  assert.ok(shed);
  w.state.population = 0;
  w.tick(GAME_DAY_SECONDS + 1);
  assert.equal(shed.workers, 0, 'nobody to spare, so the yard is empty');
  w.state.population = 12;
  w.tick(GAME_DAY_SECONDS + 1);
  assert.ok((shed.workers ?? 0) > 0, 'when people arrive the yard is staffed again');
});

test('a workshop the player pins keeps the number they chose', () => {
  const w = prepared();
  w.state.population = 20;
  const smithy = w.state.buildings.find(building => building.kind === 'smithy');
  if (smithy) {
    assert.equal(w.adjustWorkforce(smithy.id, 0).ok, true);
    for (let i = 0; i < 3; i++) w.tick(GAME_DAY_SECONDS + 1);
    assert.equal(smithy.workers, 0, 'the pin survives the town reallocating labour');
  }
  const other = w.state.buildings.find(building => building.kind === 'lumber');
  if (other) {
    assert.equal(w.adjustWorkforce(other.id, 1).ok, true);
    for (let i = 0; i < 3; i++) w.tick(GAME_DAY_SECONDS + 1);
    assert.equal(other.workers, 1, 'a partial pin is respected too');
  }
});

test('a pinned complement is validated like every other field', () => {
  const w = prepared();
  const smithy = w.state.buildings.find(building => building.kind === 'smithy');
  if (!smithy) return;
  for (const bad of [-1, 9, 1.5]) {
    const corrupt = structuredClone(w.state) as unknown as Record<string, unknown>;
    (corrupt.buildings as Record<string, unknown>[]).find(b => b.id === smithy.id)!.staffing = bad;
    assert.equal(validateSave(corrupt), false, `refuses a staffing of ${bad}`);
  }
  const good = structuredClone(w.state) as unknown as Record<string, unknown>;
  (good.buildings as Record<string, unknown>[]).find(b => b.id === smithy.id)!.staffing = 1;
  assert.equal(validateSave(good), true);
});

test('idle time alone never runs a value away or to nothing', () => {
  // Ten hours of no attention at all: every tracked quantity must stay inside its own bounds.
  const w = new SimWorld();
  w.state.settings.disasters = true; w.state.settings.autoMayor = false;
  const seen: string[] = [];
  for (let i = 0; i < 40000; i++) {
    w.tick(0.5);
    const s = w.state;
    const check = (ok: boolean, why: string) => { if (!ok && !seen.includes(why)) seen.push(why); };
    check(Number.isFinite(s.coins) && s.coins >= 0, 'coins left the number line');
    check(s.happiness >= 0 && s.happiness <= 100, 'happiness left 0..100');
    check(s.population >= 4 && s.population <= w.observe().populationCapacity, `population left its bounds: ${s.population}/${w.observe().populationCapacity}`);
    const used = RESOURCE_KEYS.reduce((n, k) => n + s.resources[k], 0);
    check(used >= 0 && used <= s.capacity, 'warehouse overflowed');
    check(RESOURCE_KEYS.every(k => Number.isInteger(s.resources[k]) && s.resources[k] >= 0), 'a resource is fractional or negative');
    check(['food', 'water', 'services', 'environment'].every(k => s.needs[k as 'food'] >= 0 && s.needs[k as 'food'] <= 100), 'a need left 0..100');
  }
  assert.deepEqual(seen, [], `values left their bounds: ${seen.join('; ')}`);
  assert.equal(validateSave(w.state), true);
});
