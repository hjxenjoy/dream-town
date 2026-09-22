import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, createInitialState, type Building } from '../src/sim/world.ts';
import { BUILDINGS, HEALTH_REPAIR_RELIEF, HEALTH_TAX_RELIEF, emptyResources, type BuildingKind } from '../src/sim/data.ts';
import { disasterOf } from '../src/sim/disasters.ts';
import { populate } from './population.ts';

/** Places a building on the first tile the rules accept. */
function raise(w: SimWorld, kind: BuildingKind): Building {
  for (let y = 2; y < 45; y++) for (let x = 2; x < 45; x++) {
    const result = w.build(kind, x, y);
    if (result.ok) return w.state.buildings.find(b => b.id === result.buildingId)!;
    if (result.code !== 'INVALID_TERRAIN' && result.code !== 'TILE_OCCUPIED' && result.code !== 'TECHNOLOGY_REQUIRED') {
      if (result.code === 'INSUFFICIENT_RESOURCES') throw new Error(`${kind}: ${result.message}`);
    }
  }
  throw new Error(`${kind}: nowhere to build`);
}

/** A settled town with room, materials and no automation. */
function town() {
  const w = new SimWorld();
  w.state.settings.disasters = false; w.state.settings.autoMayor = false;
  w.state.coins = 500000; w.state.capacity = 20000; populate(w, 24);
  w.state.resources = { ...emptyResources(), wood: 600, stone: 600, materials: 120, fish: 300, bread: 300, wheat: 200 };
  return w;
}

test('the chapel is a civic building the town can research-free build, and it costs what it says', () => {
  const w = town();
  assert.equal(BUILDINGS.chapel.category, 'services');
  assert.equal(BUILDINGS.chapel.technology, undefined, 'the chapel needs no research, so every play style can reach it');
  assert.equal(BUILDINGS.chapel.faith! > 0, true, 'it is the faith building');

  const before = { coins: w.state.coins, wood: w.state.resources.wood, stone: w.state.resources.stone, materials: w.state.resources.materials };
  const built = raise(w, 'chapel');
  assert.equal(w.state.coins, before.coins - BUILDINGS.chapel.cost);
  assert.equal(w.state.resources.wood, before.wood - BUILDINGS.chapel.wood);
  assert.equal(w.state.resources.stone, before.stone - BUILDINGS.chapel.stone);
  assert.equal(w.state.resources.materials, before.materials - BUILDINGS.chapel.materials!.materials!);
  assert.equal(validateSave(w.state), true);

  // Upgrading deepens both effects, like every other civic building.
  built.level = 3;
  const needs = w.observe().needs;
  assert.ok(needs.faith > 0);
  assert.equal(Math.round(needs.faith), Math.min(100, Math.round(BUILDINGS.chapel.faith! * 3 / w.state.population * 100)));
});

test('faith and health are measured in residents served, and a damaged building serves nobody', () => {
  const w = town();
  assert.equal(w.observe().needs.faith, 0, 'a town with no chapel has no faith reading');
  assert.equal(w.observe().needs.health, 0, 'and with no clinic, no health reading');

  const chapel = raise(w, 'chapel');
  const clinic = raise(w, 'clinic');
  // 14 + 10 residents served against 24 living here.
  assert.equal(Math.round(w.observe().needs.faith), Math.round(14 / 24 * 100));
  assert.equal(Math.round(w.observe().needs.health), Math.round(10 / 24 * 100));

  chapel.damaged = true; clinic.damaged = true;
  assert.equal(w.observe().needs.faith, 0, 'a damaged chapel serves no one');
  assert.equal(w.observe().needs.health, 0, 'nor does a damaged clinic');

  chapel.damaged = false; clinic.damaged = false;
  populate(w, 6);
  assert.equal(w.observe().needs.faith, 100, 'a small enough congregation is fully served');
  assert.equal(w.observe().needs.health, 100);
});

test('a stocked chapel and clinic keep a heavily taxed town happier, and cost nothing when absent', () => {
  const bare = town(); bare.state.taxRate = 4; bare.tick(90);
  const cared = town();
  raise(cared, 'chapel'); raise(cared, 'clinic');
  cared.state.taxRate = 4; cared.tick(90);
  assert.ok(cared.state.happiness > bare.state.happiness,
    `a congregation and a clinic ease a heavy tax: ${bare.state.happiness.toFixed(1)} -> ${cared.state.happiness.toFixed(1)}`);

  // The layer only ever softens: with no services the mood is exactly what it was.
  const needs = bare.observe().needs;
  const four = needs.food * .4 + needs.water * .25 + needs.services * .2 + needs.environment * .15;
  const care = (needs.comfort + needs.leisure) / 200 * 8;
  assert.ok(Math.abs(bare.state.happiness - (four - 20 + care)) < .05,
    `an unserved town pays the full penalty: ${bare.state.happiness} vs ${four - 20 + care}`);
  // The cap keeps relief from erasing the tax decision entirely.
  assert.ok(HEALTH_TAX_RELIEF * 2 <= 1, 'even both at full cannot cancel the whole penalty');
});

test('a healthy town repairs for less, a sick one for exactly what it always cost', () => {
  const sick = town();
  sick.state.resources.wood = 0; sick.state.resources.stone = 0;   // force the buy-in path too
  const sickCottage = sick.state.buildings.find(b => b.kind === 'cottage')!;
  sickCottage.damaged = true; sickCottage.damageKind = 'fire';
  const full = disasterOf('fire').repair.coins;

  const healthy = town();
  // Three clinics cover all 24 residents. (Population cannot simply be shrunk: the opening
  // town already staffs more workshops than that, and validateSave rightly refuses such a town
  // — the criterion is beds and staff, not convenience.)
  raise(healthy, 'clinic'); raise(healthy, 'clinic'); raise(healthy, 'clinic');
  // Strip the materials only after building: the comparison is about the repair bill.
  healthy.state.resources.wood = 0; healthy.state.resources.stone = 0;
  healthy.tick(0.1);
  assert.equal(healthy.observe().needs.health, 100, 'the clinics cover the whole town');
  const healthyCottage = healthy.state.buildings.find(b => b.kind === 'cottage')!;
  healthyCottage.damaged = true; healthyCottage.damageKind = 'fire';

  const sickQuote = sick.repairQuote(sickCottage);
  const healthyQuote = healthy.repairQuote(healthyCottage);
  assert.equal(sickQuote.coins - sickQuote.bought.wood * 45 - sickQuote.bought.stone * 55, full,
    'an unserved town pays the base price');
  assert.ok(healthyQuote.coins < sickQuote.coins, 'the clinic reduces the bill');
  assert.equal(healthyQuote.bought.wood, sickQuote.bought.wood, 'bought-in materials are never discounted');
  // The discount is the declared fraction of the labour charge, and not more.
  const expected = Math.ceil(full * (1 - HEALTH_REPAIR_RELIEF));
  assert.equal(healthyQuote.coins - healthyQuote.bought.wood * 45 - healthyQuote.bought.stone * 55, expected);
  assert.equal(validateSave(healthy.state), true);
});

test('old saves gain the two new readings without being rewritten', () => {
  const state = createInitialState(1_000_000);
  const legacy = state as unknown as { needs: Record<string, unknown> };
  delete legacy.needs.faith; delete legacy.needs.health;
  assert.equal(validateSave(state), true, 'a save without them still validates');

  const restored = new SimWorld(state);
  assert.equal(restored.state.needs.faith, 0, 'and loads with them at zero');
  assert.equal(restored.state.needs.health, 0);
  restored.tick(0.1);
  assert.equal(restored.state.needs.faith, 0, 'then recomputes them from the actual town');

  // Fractions are legitimate — these are computed readings, not counts, exactly like the
  // comfort and leisure readings they sit beside.
  const fractional = createInitialState(1_000_000) as unknown as { needs: Record<string, unknown> };
  fractional.needs.faith = 33.33;
  assert.equal(validateSave(fractional), true, 'a fractional reading is normal');

  // Out-of-range and non-numeric values are refused rather than papered over.
  for (const bad of [-1, 150]) {
    const corrupt = createInitialState(1_000_000) as unknown as { needs: Record<string, unknown> };
    corrupt.needs.faith = bad;
    assert.equal(validateSave(corrupt), false, `refuses a faith reading of ${bad}`);
  }
  const wrongType = createInitialState(1_000_000) as unknown as { needs: Record<string, unknown> };
  wrongType.needs.health = 'well';
  assert.equal(validateSave(wrongType), false, 'and a faith reading that is not a number');
});

test('the chapel upgrades and demolishes through the real actions, and its rooms come and go', () => {
  // The earlier tests assigned `built.level = 2` directly, so the upgrade cost, the population
  // cap it grants and demolition were all uncovered.
  const w = town();
  const chapel = raise(w, 'chapel');

  const beforeUpgrade = { coins: w.state.coins, cap: w.communityCapacity(), faith: w.observe().needs.faith };
  assert.equal(w.upgrade(chapel.id).ok, true, 'the chapel upgrades like any civic building');
  assert.equal(chapel.level, 2);
  assert.ok(w.state.coins < beforeUpgrade.coins, 'and charges for it');
  assert.equal(w.communityCapacity(), beforeUpgrade.cap + BUILDINGS.chapel.populationCap!, 'each level adds its population cap');
  assert.ok(w.observe().needs.faith > beforeUpgrade.faith, 'and serves more residents');

  // While it shelters residents, demolition is refused — the same protection every civic
  // building has, and the reason a town cannot quietly lose the homes it depends on.
  assert.equal(w.demolish(chapel.id).code, 'COMMUNITY_REQUIRED', 'cannot be torn down while people live on its cap');
  assert.equal(w.state.buildings.some(b => b.id === chapel.id), true, 'and a refused demolition changes nothing');

  // Empty the workshops, so a small population is a legitimate town rather than a save whose
  // workforce outnumbers its residents (which the validator rightly refuses).
  for (const building of w.state.buildings) { building.workers = 0; building.staffing = 0; }
  populate(w, 4);
  const refund = { coins: w.state.coins, wood: w.state.resources.wood };
  assert.equal(w.demolish(chapel.id).ok, true);
  assert.equal(w.state.buildings.some(b => b.id === chapel.id), false, 'the chapel is gone');
  assert.ok(w.state.coins > refund.coins, 'and refunds part of its cost');
  assert.ok(w.state.resources.wood > refund.wood, 'including materials');
  assert.equal(w.observe().needs.faith, 0, 'the town is left with no faith reading, not a stale one');
  assert.equal(validateSave(w.state), true);

  // And a civic building stops at level three rather than clamping past it.
  const other = raise(w, 'chapel');
  assert.equal(w.upgrade(other.id).ok, true);
  assert.equal(w.upgrade(other.id).ok, true);
  assert.equal(other.level, 3);
  assert.equal(w.upgrade(other.id).ok, false, 'a third upgrade is refused');
  assert.equal(other.level, 3);
});

test('the offline report honours the same mood as the online town', () => {
  // The promise this pins: docs/10 tells the player that a chapel and clinic make a heavy tax
  // bearable, and the eight hours a player is most likely to lean on that are the hours away.
  // The offline settlement used to compute mood as "what it was, minus the hunger", which meant
  // faith and health did nothing at all while away and the tax still cost the full penalty.
  const town = (care: boolean) => {
    const w = new SimWorld();
    w.state.settings.disasters = false; w.state.settings.autoMayor = false;
    w.state.coins = 500000; w.state.capacity = 5000; populate(w, 24); w.state.taxRate = 4;
    w.state.resources = { ...emptyResources(), fish: 400, bread: 400, wood: 200, stone: 200, materials: 60 };
    if (care) for (const kind of ['chapel', 'clinic', 'clinic', 'clinic'] as BuildingKind[]) raise(w, kind);
    return w;
  };

  const bare = town(false);
  const cared = town(true);
  assert.ok(cared.observe().needs.faith > 0 && cared.observe().needs.health > 0, 'the cared town really has both');

  const bareReport = bare.offline(4 * 3600);
  const caredReport = cared.offline(4 * 3600);
  assert.ok(cared.state.happiness > bare.state.happiness,
    `a chapel and clinic ease the tax even while away: ${bare.state.happiness.toFixed(1)} vs ${cared.state.happiness.toFixed(1)}`);
  assert.ok(caredReport.tax > bareReport.tax, 'and the town collects more because its people are happier');

  // A well-cared town away for a day is not worse off than it was; a hungry one is.
  assert.ok(caredReport.happinessChange >= 0, `being away does not punish a provisioned town: ${caredReport.happinessChange.toFixed(2)}`);
  assert.ok(bareReport.happinessChange <= 0 || bare.state.happiness >= bareReport.happinessChange, 'and the bare town is not magically better off');

  // The hunger penalty still applies on top: an unfed town is worse off than a fed one.
  // Production is stopped as well as the barn emptied — otherwise the town simply replenishes
  // while the player is away and the case never arises (the same trap the long-run scan hit).
  const starving = town(true);
  starving.state.resources = emptyResources();
  for (const building of starving.state.buildings) building.paused = true;
  const starvingReport = starving.offline(4 * 3600);
  assert.ok(starving.state.happiness < cared.state.happiness, 'and an unfed town is still worse off than a fed one');
  assert.ok(starvingReport.happinessChange < caredReport.happinessChange, 'the shortage is subtracted from the mood, not ignored');
  assert.equal(validateSave(cared.state), true);
});
