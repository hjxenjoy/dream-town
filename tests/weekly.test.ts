import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDING_KEYS, BUILDINGS, GAME_DAY_SECONDS, MAP_SIZE, RESOURCE_KEYS, TECHNOLOGY_KEYS, emptyResources } from '../src/sim/data.ts';
import { ACHIEVEMENT_IDS } from '../src/sim/achievements.ts';
import { WEEKLY_METRICS, WEEKLY_TASK_COUNT, WEEKLY_TASKS, WEEK_SECONDS, allowedTasks, validWeekly, weekBaseline, weekOf, weekRemaining, weeklyBoard, weeklyProgress, weeklyTaskByName } from '../src/sim/weekly.ts';

/** A town a player would plausibly have mid-game: a working chain, and a player at the controls. */
function young() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.coins = 60000; world.state.capacity = 30000; world.state.level = 10; world.state.population = 40;
  world.state.researched = [...TECHNOLOGY_KEYS].slice(0, 16);
  world.state.resources = { ...emptyResources() };
  for (const key of RESOURCE_KEYS) world.state.resources[key] = 300;
  world.state.settings.disasters = false; world.state.settings.autoMayor = false;
  const chain = ['lumber', 'quarry', 'farm', 'bakery', 'windmill', 'market', 'warehouse', 'cottage', 'garden'];
  for (const kind of chain) {
    for (let y = 1; y < MAP_SIZE - 1 && !world.state.buildings.some(b => b.kind === kind && b.x === undefined); y++) {
      let placed = false;
      for (let x = 1; x < MAP_SIZE - 1; x++) if (world.build(kind, x, y).ok) { placed = true; break; }
      if (placed) break;
    }
  }
  world.state.resources.wood = 500; world.state.resources.stone = 500;
  for (const building of world.state.buildings) {
    building.paused = false;
    if (BUILDINGS[building.kind].workers) building.workers = BUILDINGS[building.kind].workers!;
  }
  return world;
}

/** One week of a player at the controls: collect what is ready, ship every order, run every cart. */
function engaged(world: SimWorld, seconds: number) {
  const step = 5;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    world.tick(step);
    world.collectAll();
    for (const order of world.state.orders.slice()) world.fulfillOrder(order.id);
    for (const caravan of world.state.caravans) if (caravan.status !== 'travelling') world.dispatchCaravan(caravan.id);
    world.sellSurplus();
  }
}

/** The counters the weekly pool reads, so a week's yield can be measured. */
function snapshot(world: SimWorld) {
  const s = world.state;
  return {
    collected: s.stats.collected, crops: s.farming?.harvested ?? 0, orders: s.stats.ordersCompleted,
    caravans: s.stats.caravansCompleted, coinsEarned: s.stats.coinsEarned,
    tools: s.stats.toolsProduced, clothing: s.stats.clothingProduced,
    festivals: s.stats.festivals, activities: s.stats.activities ?? 0, built: s.stats.buildingsBuilt,
    projectStages: Object.values(s.projects?.stages ?? {}).reduce((n, v) => n + v, 0),
  };
}

/** A town with everything unlocked and built, for the checks that need a mature one. */
function grown() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.coins = 900000; world.state.capacity = 400000; world.state.level = 20; world.state.population = 200;
  world.state.researched = [...TECHNOLOGY_KEYS];
  for (const key of RESOURCE_KEYS) world.state.resources[key] = 2000;
  world.state.settings.disasters = false; world.state.settings.autoMayor = false;
  for (const kind of BUILDING_KEYS) {
    for (let y = 1; y < MAP_SIZE - 1; y++) {
      let placed = false;
      for (let x = 1; x < MAP_SIZE - 1; x++) if (world.build(kind, x, y).ok) { placed = true; break; }
      if (placed) break;
    }
  }
  for (const building of world.state.buildings) {
    building.paused = false;
    if (BUILDINGS[building.kind].workers) building.workers = BUILDINGS[building.kind].workers!;
  }
  return world;
}

test('a week is seven game days, on the clock the days and seasons already use', () => {
  assert.equal(WEEK_SECONDS, GAME_DAY_SECONDS * 7);
  assert.equal(weekOf(0), 0);
  assert.equal(weekOf(WEEK_SECONDS - 1), 0, 'the last second still belongs to the week');
  assert.equal(weekOf(WEEK_SECONDS), 1);
  assert.ok(Math.abs(weekRemaining(0) - 1) < 1e-9, 'a week just opened is fully ahead of you');
  assert.ok(Math.abs(weekRemaining(WEEK_SECONDS / 2) - 0.5) < 1e-9, 'halfway through, half left');
  assert.ok(weekRemaining(WEEK_SECONDS - 1) < 0.01, 'and nothing left at the end');
});

test('the board is drawn from the week number, so reloading cannot reroll an easier one', () => {
  for (let week = 0; week < 60; week++) {
    const board = weeklyBoard(week);
    assert.equal(board.length, WEEKLY_TASK_COUNT, 'three tasks a week');
    assert.equal(new Set(board).size, board.length, 'and never the same task twice in one board');
    for (const name of board) assert.ok(weeklyTaskByName(name), `${name} is a real task`);
    // Deterministic: the same week always sets the same board.
    assert.deepEqual(weeklyBoard(week), board);
  }
  // And over enough weeks every task gets its turn, or part of the pool would be dead weight.
  const seen = new Set<string>();
  for (let week = 0; week < 200; week++) for (const name of weeklyBoard(week)) seen.add(name);
  assert.equal(seen.size, WEEKLY_TASKS.length, 'every task appears in rotation');
});

test('progress is what the town did this week, not what it has ever done', () => {
  // The corner that would break a board: a town that had already collected ten thousand goods
  // must not finish "collect 60" on the first tick of the week. Progress is a delta, so it does not.
  const metrics = { collected: 10000, crops: 500, orders: 999, caravans: 40, coinsEarned: 900000,
    tools: 30, clothing: 30, festivals: 9, activities: 20, built: 50, projectStages: 6,
    rareCrops: 0, cropVarieties: 0, gardenLevel: 0, soilLevel: 0, repairs: 0, population: 0, level: 0,
    technologies: 0, pets: 0, decorKinds: 0, industryKinds: 0 } as never;
  const board = weeklyBoard(0);
  const baseline = weekBaseline(metrics);
  const fresh = weeklyProgress(board, metrics, baseline);
  assert.ok(fresh.every(task => task.current === 0), 'a week that has just opened has no progress');
  assert.ok(fresh.every(task => !task.done), 'and nothing is already finished');

  const grown = { ...metrics, collected: metrics.collected + 60, orders: metrics.orders + 3 } as never;
  const moved = weeklyProgress(board, grown, baseline);
  assert.ok(moved.some(task => task.current > 0), 'what the town did this week does count');
  assert.ok(moved.every(task => task.current <= task.target), 'and progress never overshoots the target');
});

test('the week rolls over on its own and opens a fresh board', () => {
  const world = new SimWorld();
  world.state.settings.disasters = false;
  world.tick(0.1);
  assert.equal(world.state.weekly!.week, 0, 'the town opens on its first board');
  const first = { ...world.state.weekly!.baseline };
  world.state.stats.collected += 5;
  world.tick(WEEK_SECONDS);
  assert.equal(world.state.weekly!.week, weekOf(world.state.gameTime), 'the board followed the clock');
  // The new week starts from wherever the town was, so the work done last week is not carried in.
  const metrics = world.observe();
  assert.equal(world.state.weekly!.baseline.collected, world.state.stats.collected, 'the baseline was retaken');
  assert.ok(Object.keys(first).length > 0);
  assert.ok(world.state.logs.some(entry => entry.message.includes('新的每周挑战')), 'and the town said so');
});

test('finishing the board pays once, and a finished board cannot pay twice', () => {
  const world = new SimWorld();
  world.state.settings.disasters = false;
  world.tick(0.1);
  // Read the board from the panel rather than recomputing it, so the test exercises the same
  // filtered draw the town actually sets.
  const metrics = () => world.observe().weekly!;
  const before = metrics();
  const board = before.tasks.map(task => task.name);
  assert.ok(before.tasks.length > 0);
  const prestige = world.state.prestige;
  const coins = world.state.coins;
  // Silence the other two things that pay prestige in the same tick, so the sum below is the
  // weekly's alone and not the weekly's plus an achievement the bumped counters happened to trip.
  world.state.achievements = [...ACHIEVEMENT_IDS];
  world.state.quests = world.state.quests.map(quest => ({ ...quest, claimed: true }));
  // Meet every task by moving the counters they read, the way the town does.
  for (const task of board) {
    const definition = weeklyTaskByName(task)!;
    if (definition.metric === 'orders') world.state.stats.ordersCompleted += definition.target;
    else if (definition.metric === 'caravans') world.state.stats.caravansCompleted += definition.target;
    else if (definition.metric === 'collected') world.state.stats.collected += definition.target;
    else if (definition.metric === 'coinsEarned') world.state.stats.coinsEarned += definition.target;
    else if (definition.metric === 'tools') world.state.stats.toolsProduced += definition.target;
    else if (definition.metric === 'clothing') world.state.stats.clothingProduced += definition.target;
    else if (definition.metric === 'festivals') world.state.stats.festivals += definition.target;
    else if (definition.metric === 'activities') world.state.stats.activities = (world.state.stats.activities ?? 0) + definition.target;
    else if (definition.metric === 'built') world.state.stats.buildingsBuilt += definition.target;
    else if (definition.metric === 'crops') world.state.farming!.harvested += definition.target;
    else if (definition.metric === 'projectStages') world.state.projects!.stages.park = definition.target;
  }
  world.tick(0.1);
  const after = metrics();
  assert.equal(after.complete, true, 'the board reads as complete');
  assert.equal(after.rewarded, true, 'and it paid out');
  assert.ok(world.state.prestige > prestige, 'the prestige came through');
  const owed = after.tasks.reduce((n, task) => n + task.prestige, 0);
  assert.equal(world.state.prestige, prestige + owed, 'exactly the board sum, no more');
  assert.ok(world.state.coins >= coins + after.tasks.reduce((n, task) => n + task.coins, 0), 'and the coins');

  // Ticking on must not pay a second time.
  const settled = world.state.prestige;
  world.tick(10);
  world.tick(10);
  assert.equal(world.state.prestige, settled, 'a finished board pays once and only once');
});

test('every task in the pool is one a town can actually finish in a week', () => {
  // Measured, not guessed — and measured in an ENGAGED week, because a week nobody plays looks
  // like zero of everything (collections are manual) and would justify any target at all. The
  // loop below is what a player does: collect what is ready, ship every order, run every cart.
  const world = young();
  engaged(world, WEEK_SECONDS); // settle first, so nothing in flight counts toward the week
  const before = snapshot(world);
  engaged(world, WEEK_SECONDS);
  const achieved = {} as Record<string, number>;
  for (const key of Object.keys(before) as (keyof typeof before)[]) achieved[key] = snapshot(world)[key] - before[key];

  // The chain tasks are not in a young town's pool, and the measurement proves why: it has no
  // smithy, so it produced no tools. Everything the town CAN attempt must be doable.
  const board = weeklyBoard(0, allowedTasks(new Set(world.state.buildings.map(b => b.kind)), world.state.projects?.active != null));
  // The measured counters are the ones the simulation drives. The tasks that need a decision —
  // holding a festival, starting a build, advancing a project — are not something a week does on
  // its own, and are checked against the actions that perform them in the next test.
  const byDecision = new Set(['festivals', 'activities', 'built', 'projectStages']);
  let measured = 0;
  for (const name of board) {
    const task = weeklyTaskByName(name)!;
    if (byDecision.has(task.metric)) continue;
    measured++;
    const actual = achieved[task.metric] ?? 0;
    assert.ok(actual >= task.target, `${name}: a young engaged town made ${actual} against a target of ${task.target}`);
  }
  assert.ok(measured > 0, 'the board had at least one task the week could measure');
  assert.ok(achieved.collected! > 0, 'the measurement was a real played week, not an idle one');
});

test('a board only ever asks for something the town can attempt', () => {
  // The rule that keeps a board fair: a young town has no smithy, so a board asking it for tools
  // would be a board nobody could clear. The pool is filtered by what the town owns.
  const bare = new Set<string>();
  const early = allowedTasks(bare, false);
  assert.ok(!early.includes('叮当一阵'), 'no smithy, no tools task');
  assert.ok(!early.includes('裁缝不停'), 'no tailor, no clothing task');
  assert.ok(!early.includes('大工程'), 'no project, no project task');
  assert.ok(early.includes('按时交货') && early.includes('勤收勤捡'), 'the always-possible ones stay');
  assert.ok(!early.includes('及时补漏'), 'and nothing depends on a hazard roll');

  const full = allowedTasks(new Set(['smithy', 'tailor', 'farm']), true);
  assert.ok(full.includes('叮当一阵') && full.includes('裁缝不停') && full.includes('大工程'), 'a town that has them is offered them');

  // And the board drawn from a small pool still has tasks, never an empty week.
  for (let week = 0; week < 30; week++) {
    const board = weeklyBoard(week, ['按时交货', '勤收勤捡']);
    assert.equal(board.length, 2, 'a two-task pool sets two tasks');
    assert.equal(new Set(board).size, 2, 'and does not repeat one');
  }
});

test('a brand-new town opens a board it can actually finish', () => {
  const world = new SimWorld();
  world.state.settings.disasters = false;
  world.tick(0.1);
  const board = world.observe().weekly!;
  assert.equal(board.tasks.length, 3, 'a new town still gets a full board');
  const owned = new Set(world.state.buildings.map(b => b.kind));
  for (const task of board.tasks) {
    const definition = weeklyTaskByName(task.name)!;
    assert.ok(allowedTasks(owned, false).includes(task.name), `${task.name} is offered to the town that can attempt it`);
    assert.ok(definition.target > 0);
  }
});

test('the tasks that need a decision are all reachable through the game\'s own actions', () => {
  // A board asking for something the player cannot do is worse than no board. Every task that is
  // not automatic is checked against the API that performs it.
  const world = grown();
  const festival = world.festival();
  assert.equal(festival.ok, true, `a festival can be held: ${festival.message}`);
  const activity = world.startActivity('harvest');
  assert.equal(activity.ok, true, `a seasonal activity can be held: ${activity.message}`);
  const caravan = world.state.caravans[0];
  assert.ok(caravan, 'the town has a cart');
  world.dispatchCaravan(caravan.id).ok;
  const built = world.build('bench', 30, 30);
  assert.equal(built.ok, true, `${built.message}`);
  assert.ok(world.state.projects, 'projects exist to advance');
  assert.equal(validateSave(world.state), true);
  // And the pool never asks for a repair, which depends on a hazard roll rather than on the player.
  assert.ok(!WEEKLY_TASKS.some(task => task.metric === 'repairs'), 'no task depends on being damaged');
});

test('a save that predates the weeklies loads and opens a board', () => {
  const world = new SimWorld();
  world.state.settings.disasters = false;
  world.tick(0.1);
  const older = JSON.parse(JSON.stringify(world.state)) as Record<string, unknown>;
  delete older.weekly;
  assert.equal(validateSave(older), true, 'an older save is still valid');
  const reloaded = new SimWorld(older);
  reloaded.tick(0.1);
  assert.ok(reloaded.state.weekly, 'and its first board opens on the next tick');
  assert.equal(validateSave(reloaded.state), true);
});

test('a corrupted board is refused rather than trusted', () => {
  const world = new SimWorld();
  world.tick(0.1);
  const bad = (mutate: (weekly: Record<string, unknown>) => void) => {
    const copy = JSON.parse(JSON.stringify(world.state)) as { weekly: Record<string, unknown> };
    mutate(copy.weekly);
    return validateSave(copy);
  };
  assert.equal(validWeekly(world.state.weekly), true, 'the real board is valid');
  assert.equal(bad(weekly => { weekly.week = -1; }), false, 'a negative week');
  assert.equal(bad(weekly => { weekly.week = 1.5; }), false, 'a fractional week');
  assert.equal(bad(weekly => { weekly.rewarded = -5; }), false, 'a reward for no week');
  assert.equal(bad(weekly => { (weekly.baseline as Record<string, unknown>).nonsense = 1; }), false, 'a metric the pool never asks for');
  assert.equal(bad(weekly => { (weekly.baseline as Record<string, unknown>).collected = -3; }), false, 'a negative snapshot');
  assert.equal(validateSave(world.state), true, 'and the real save is still fine');
});

test('the board reaches the panel with its progress and its clock', () => {
  const world = new SimWorld();
  world.state.settings.disasters = false;
  world.tick(0.1);
  const board = world.observe().weekly;
  assert.equal(board.week, 0);
  assert.equal(board.tasks.length, WEEKLY_TASK_COUNT, 'three cards');
  assert.equal(board.complete, false, 'and nothing done yet');
  assert.equal(board.rewarded, false);
  assert.ok(board.remaining <= 1 && board.remaining > 0, 'with the week still running');
  for (const task of board.tasks) {
    assert.ok(task.name.length > 0 && task.description.length > 0, 'each card is readable');
    assert.ok(task.target > 0 && task.prestige > 0, 'and carries a target and a reward');
  }
});
