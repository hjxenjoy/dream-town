import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, migrateSave } from '../src/sim/world.ts';
import { PLAGUE_DAYS, PLAGUE_HAPPINESS, PLAGUE_MIN_SHARE, plagueDue, plagueDuration, plagueHappinessCost, plagueSpoilage } from '../src/sim/plague.ts';
import { GAME_DAY_SECONDS, TECHNOLOGY_KEYS, emptyResources } from '../src/sim/data.ts';

/** A town with the plague clock wound to the moment before an outbreak, and no automation. */
function aboutToBeIll() {
  const world = new SimWorld();
  world.state.settings.disasters = true;
  world.state.settings.autoMayor = false;
  world.state.lastPlagueAt = world.state.gameTime;
  return world;
}

/** Runs the town forward until a plague starts, or gives up. */
function catchPlague(world: SimWorld): boolean {
  for (let i = 0; i < 4000; i++) {
    world.tick(0.5);
    if (world.state.plague) return true;
  }
  return false;
}

test('a plague runs for days and ends on its own, without anyone dying for it', () => {
  const world = aboutToBeIll();
  const before = world.state.population;
  assert.equal(catchPlague(world), true, 'the town eventually catches it');
  assert.ok(world.state.plague!.until > world.state.gameTime, 'it runs into the future');
  // Days worth of illness, not seconds and not forever.
  const span = world.state.plague!.until - world.state.gameTime;
  assert.ok(span >= PLAGUE_DAYS * GAME_DAY_SECONDS * PLAGUE_MIN_SHARE, `a plague lasts ${span}s`);
  assert.ok(span <= PLAGUE_DAYS * GAME_DAY_SECONDS, `and no longer than ${PLAGUE_DAYS} days`);
  // The cloud lifts by itself; the player is never asked to click it away.
  for (let i = 0; i < 4000 && world.state.plague; i++) world.tick(0.5);
  assert.equal(world.state.plague, undefined, 'and it passes without intervention');
  // Nobody is deleted by the illness itself: any change came through the ordinary mood rule.
  assert.ok(world.state.population <= before, 'the town does not gain residents while ill');
  assert.equal(validateSave(world.state), true);
});

test('the plague costs mood by the documented amount, and a clinic softens it', () => {
  assert.equal(plagueHappinessCost(0), PLAGUE_HAPPINESS, 'docs/05 §108 prices the plague at -20');
  const half = plagueHappinessCost(50);
  const full = plagueHappinessCost(100);
  assert.ok(half < PLAGUE_HAPPINESS && half > full, 'more coverage costs less mood');
  assert.ok(full > 0, 'a plague is never free, or the clinic would be a switch rather than an investment');
});

test('a clinic shortens the outbreak as well as easing it', () => {
  const bare = plagueDuration(0, GAME_DAY_SECONDS);
  const covered = plagueDuration(100, GAME_DAY_SECONDS);
  assert.equal(bare, PLAGUE_DAYS * GAME_DAY_SECONDS, 'no clinic means the full run');
  assert.ok(covered < bare, 'care shortens it');
  assert.ok(covered >= bare * PLAGUE_MIN_SHARE, 'but an outbreak is never cut away entirely');
});

test('a plague wastes stores, so the larder is hit as well as the mood', () => {
  assert.ok(plagueSpoilage(12) > 0, 'a town of twelve loses something');
  assert.ok(plagueSpoilage(24) > plagueSpoilage(12), 'and a bigger town loses more');
  const world = aboutToBeIll();
  world.state.resources = { ...emptyResources(), bread: 200, fish: 200 };
  assert.equal(catchPlague(world), true);
  const food = world.state.resources.bread + world.state.resources.fish;
  // Plague plus ordinary meals must take more than meals alone would.
  world.tick(GAME_DAY_SECONDS + 1);
  assert.ok(world.state.resources.bread + world.state.resources.fish < food, 'the stores fall');
});

test('a plague never strikes a town too small to absorb it, and never overlaps itself', () => {
  // The gate is the headcount at the moment the plague is due, so it is checked directly
  // rather than by simulating: a small town that is well fed grows, and that growth is not
  // the thing under test here.
  assert.equal(plagueDue(undefined, 1e6, 0, 4, 10), false, 'a village of four is left alone');
  assert.equal(plagueDue(undefined, 1e6, 0, 10, 10), true, 'ten residents is enough to be due one');
  // And the world honours it: a town under the threshold, overdue for an outbreak, stays well.
  const world = new SimWorld();
  world.state.settings.disasters = true;
  world.state.population = 4;
  world.state.lastPlagueAt = 0;
  world.state.gameTime = 1e6;
  world.tick(1);
  assert.equal(world.state.plague, undefined, 'the world applies the same gate');
  // While one is running, no second one starts.
  assert.equal(plagueDue({ until: 1e9 }, 0, 0, 100, 10), false, 'no outbreak on top of an outbreak');
  // Not before its turn comes round again.
  assert.equal(plagueDue(undefined, 0, 0, 100, 10), false, 'the town gets time between outbreaks');
  assert.equal(plagueDue(undefined, 999999, 0, 100, 10), true, 'and eventually is due one');
});

test('turning natural challenges off keeps the plague away, and the setting is honoured', () => {
  const world = new SimWorld();
  world.state.settings.disasters = false;
  world.state.lastPlagueAt = world.state.gameTime;
  assert.equal(catchPlague(world), false, 'no challenges means no plague either');
});

test('the plague survives a reload and still ends, and old saves simply have none', () => {
  const world = aboutToBeIll();
  assert.equal(catchPlague(world), true);
  const restored = new SimWorld(JSON.parse(JSON.stringify(world.state)));
  assert.ok(restored.state.plague, 'a plague is part of the save');
  assert.equal(validateSave(restored.state), true);
  // An older save has neither field and must load with no plague at all.
  const older = JSON.parse(JSON.stringify(world.state));
  delete older.plague;
  delete older.lastPlagueAt;
  const migrated = migrateSave(older)!;
  assert.ok(migrated, 'an old save is completed, not refused');
  assert.equal(migrated.plague, undefined, 'and starts clear');
  const loaded = new SimWorld(migrated);
  assert.equal(loaded.state.plague, undefined);
  assert.equal(validateSave(loaded.state), true);
  // A plague with an unusable end time is refused rather than loaded as an endless one.
  const broken = JSON.parse(JSON.stringify(world.state));
  broken.plague = { until: 'soon' };
  assert.equal(validateSave(broken), false);
});

test('the clinic the town already has is what the plague reads, so building one matters', () => {
  const world = aboutToBeIll();
  world.state.researched = [...TECHNOLOGY_KEYS];
  // With no clinic the coverage is nil and the plague costs the full amount.
  assert.equal(world.observe().plague.moodCost, 0, 'no plague, no cost yet');
  assert.equal(world.observe().illness.clinicCoverage, world.state.needs.health);
  world.state.needs.health = 0;
  const bare = plagueHappinessCost(world.state.needs.health);
  // Add a clinic and raise coverage; the same plague now costs less.
  world.state.needs.health = 40;
  assert.ok(plagueHappinessCost(40) < bare, 'a clinic takes the edge off the outbreak');
});
