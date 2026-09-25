import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { DESTINATIONS, DESTINATION_IDS, LAND_DESTINATION_IDS, GUARD_SHARES, MAX_GUARD_COVER, raidChance, tripRaided } from '../src/sim/destinations.ts';
import { emptyResources } from '../src/sim/data.ts';

function prepared() {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.settings.disasters = false;
  world.state.settings.autoMayor = false;
  world.state.coins = 500000;
  world.state.capacity = 9000;
  world.state.researched = ['mining', 'metallurgy', 'husbandry', 'tailoring', 'viniculture'];
  world.state.resources = { ...emptyResources(), wood: 900, stone: 900, materials: 400, bread: 400, plank: 400, fish: 400, cloth: 400, clothing: 400, tools: 400, wine: 400, cheese: 400, honey: 400 };
  return world;
}

test('the near road is safe and the long ones are not, as docs/06 §2 asks', () => {
  // 远行商队：高回报高风险（遇强盗概率，需护卫）— so risk rises with distance and reward.
  assert.equal(DESTINATIONS.valley.risk, 0, 'the next village is a safe road');
  assert.ok(DESTINATIONS.hilltown.risk > 0, 'the mountain market is not');
  assert.ok(DESTINATIONS.rivermouth.risk > DESTINATIONS.hilltown.risk, 'and the river port further down is worse');
  // Risk and reward climb together, or the far routes would be a trap rather than a choice.
  const byReward = [...LAND_DESTINATION_IDS].sort((a, b) => DESTINATIONS[a].rewardCoins - DESTINATIONS[b].rewardCoins);
  assert.deepEqual(byReward, ['valley', 'hilltown', 'rivermouth'], 'reward order matches distance');
  // The sea routes are a second, longer ladder, and they are the dearest part of the board.
  const islands = DESTINATION_IDS.filter(id => DESTINATIONS[id].island);
  assert.equal(islands.length, 4, 'four islands, as the design lists');
  for (const id of islands) {
    assert.ok(DESTINATIONS[id].risk >= DESTINATIONS.rivermouth.risk, `${id} is at least as risky as the furthest land road`);
    assert.ok(DESTINATIONS[id].duration > DESTINATIONS.rivermouth.duration, `${id} takes longer than any land road`);
  }
});

test('guards cut the risk of a raid, and the castle is worth the most', () => {
  const route = DESTINATIONS.rivermouth;
  assert.equal(raidChance(route, 0), route.risk, 'no guard, the full odds');
  assert.ok(raidChance(route, GUARD_SHARES.guardpost) < route.risk, 'a post helps');
  assert.ok(raidChance(route, GUARD_SHARES.barracks) < raidChance(route, GUARD_SHARES.guardpost), 'a barracks helps more');
  assert.ok(raidChance(route, GUARD_SHARES.castle) < raidChance(route, GUARD_SHARES.barracks), 'and a castle most');
  // But it is never made free: a long road stays a risk however well guarded.
  assert.ok(raidChance(route, 99) > 0, 'the odds never reach zero');
  assert.equal(raidChance(route, 99), route.risk * (1 - MAX_GUARD_COVER), 'they stop at the cover cap');
  assert.equal(raidChance(DESTINATIONS.valley, 0), 0, 'and a safe road stays safe');
});

test('only guards standing over the market protect the trade route', () => {
  const world = prepared();
  const market = world.state.buildings.find(building => building.kind === 'market')!;
  assert.equal(world.caravanGuardCover(), 0, 'nothing guards the gate yet');
  // A post on the far side of the valley guards the valley, not the road out of town.
  world.build('guardpost', Math.min(60, market.x + 30), market.y);
  assert.equal(world.caravanGuardCover(), 0, 'a post out of range does not count');
  // One beside the market does.
  const near = world.build('guardpost', market.x + 3, market.y);
  assert.ok(near.ok, 'the post beside the market is built');
  assert.equal(world.caravanGuardCover(), GUARD_SHARES.guardpost, 'and it counts');
  // A damaged one does not.
  world.state.buildings.find(building => building.id === near.buildingId)!.damaged = true;
  assert.equal(world.caravanGuardCover(), 0, 'a ruined post guards nothing');
});

test('the guard line adds up, and stops at the cap', () => {
  const world = prepared();
  const market = world.state.buildings.find(building => building.kind === 'market')!;
  // Each guard stands on its own yard now — a castle takes three tiles, the rest two — so the
  // line is stacked one yard per step, close enough to the market for every radius to reach it.
  let y = 3;
  for (const kind of ['castle', 'barracks', 'guardpost'] as const) {
    world.build(kind, market.x + 5, y);
    y += 3;
  }
  const expected = Math.min(MAX_GUARD_COVER, GUARD_SHARES.castle + GUARD_SHARES.barracks + GUARD_SHARES.guardpost);
  assert.equal(Math.round(world.caravanGuardCover() * 100) / 100, Math.round(expected * 100) / 100, 'all three count');
  assert.equal(world.observe().caravanRisk.guardCover, Math.round(expected * 100) / 100);
  // And the reported odds follow.
  assert.equal(world.observe().caravanRisk.byRoute.valley, 0);
  assert.ok(world.observe().caravanRisk.byRoute.rivermouth < DESTINATIONS.rivermouth.risk, 'the far route is safer now');
});

test('a raid costs the reward, never the cargo, so a trip is never worse than staying home', () => {
  // The goods were paid for the moment the cart left. What a raid takes is the money the trip
  // was going to make, and never more, so a raid is a disappointment rather than a loss — a
  // route that could cost the player more than doing nothing would be the failure state this
  // game does not have.
  const world = prepared();
  const before = { ...world.state.resources };
  const coinsBefore = world.state.coins;
  // Send to the riskiest route with no guards, which is where a raid is most likely.
  assert.equal(world.chooseCaravanDestination('rivermouth').ok, true);
  assert.equal(world.dispatchCaravan().ok, true);
  const caravan = world.state.caravans[0];
  assert.ok(caravan.rewardCoins > 0, 'a waylaid trip still comes back with something');
  assert.equal(caravan.rewardMaterials === 0 || caravan.rewardMaterials === DESTINATIONS.rivermouth.rewardMaterials, true);
  // The cargo left, and exactly the cargo.
  for (const [key, amount] of Object.entries(DESTINATIONS.rivermouth.cargo) as [keyof typeof before, number][]) {
    assert.equal(world.state.resources[key], before[key] - amount, `${key} was loaded`);
  }
  assert.ok(world.state.coins <= coinsBefore, 'and nothing was paid out on departure');
  // Whatever happened, collecting always pays something back.
  world.state.gameTime = caravan.returnAt;
  world.tick(0.1);
  const coinsAtReturn = world.state.coins;
  assert.equal(world.dispatchCaravan().ok, true);
  assert.ok(world.state.coins > coinsAtReturn, 'collection always pays');
  assert.equal(validateSave(world.state), true);
});

test('a raid is decided from the trip itself, so it survives a reload and offline settlement', () => {
  // Not a die roll: the same trip reaches the same answer, which is what lets the outcome be
  // settled offline with no extra state to keep.
  assert.equal(tripRaided(0, 5), false, 'a safe route is never waylaid');
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.equal(tripRaided(0.3, seed), tripRaided(0.3, seed), 'the same trip decides the same way');
  }
  // A certainty is certain, and an impossibility is impossible.
  assert.equal(tripRaided(1, 12345), true, 'certain risk always happens');
  const world = prepared();
  assert.equal(world.chooseCaravanDestination('hilltown').ok, true);
  world.dispatchCaravan();
  const raided = world.state.caravans[0].raided === true;
  const restored = new SimWorld(JSON.parse(JSON.stringify(world.state)));
  // A clean trip carries no field at all, and a waylaid one carries true; comparing truthiness
  // rather than the raw value is what the contract actually promises.
  assert.equal(restored.state.caravans[0].raided === true, raided, 'a save round trip keeps the outcome');
  assert.equal(restored.state.caravans[0].rewardCoins, world.state.caravans[0].rewardCoins);
  assert.equal(validateSave(restored.state), true);
});

test('the raid risk is reported to the player, and a clean field is still a valid save', () => {
  const world = prepared();
  const risk = world.observe().caravanRisk;
  assert.equal(typeof risk.guardCover, 'number');
  // Only the routes this town can reach: without a harbour the sea roads are not on the board,
  // so they are not reported either.
  for (const id of Object.keys(risk.byRoute)) {
    assert.ok(DESTINATION_IDS.includes(id as never), `${id} is a real route`);
    assert.ok(risk.byRoute[id]! >= 0 && risk.byRoute[id]! <= 1, `${id} odds are a probability`);
  }
  assert.deepEqual(Object.keys(risk.byRoute).sort(), LAND_DESTINATION_IDS.slice().sort(), 'the land roads are the ones on offer');
  // Absent `raided` is the ordinary case and must stay valid.
  const older = JSON.parse(JSON.stringify(world.state));
  delete older.caravans[0].raided;
  assert.equal(validateSave(older), true, 'a clean trip needs no field');
  // But a nonsensical value is refused.
  const wrong = JSON.parse(JSON.stringify(world.state));
  wrong.caravans[0].raided = 'yes';
  assert.equal(validateSave(wrong), false);
});

test('raids are independent draws, not a pattern that arrives in pairs', () => {
  // This shipped wrong once. The first version fed a counter through a weak hash, and because
  // the seed advances by a fixed step each cycle, raids came in visible pairs: measured over
  // sequential seeds the chance of a raid immediately after a raid was 37% when the true rate
  // was 30%. A rate check alone would not have caught it, so this measures the clustering.
  const chance = DESTINATIONS.rivermouth.risk;
  const cycles = 5000;
  const raids: boolean[] = [];
  for (let i = 0; i < cycles; i++) {
    // The real seed: both counters advance by one per completed cycle.
    raids.push(tripRaided(chance, (i + 1) * 31 + 2 * 7 + i));
  }
  const rate = raids.filter(Boolean).length / cycles;
  assert.ok(Math.abs(rate - chance) < 0.05, `the rate matches the odds, got ${(rate * 100).toFixed(1)}% for ${chance * 100}%`);
  let after = 0, followedByRaid = 0;
  for (let i = 1; i < raids.length; i++) {
    if (!raids[i - 1]) continue;
    after++;
    if (raids[i]) followedByRaid++;
  }
  const clustering = followedByRaid / after;
  assert.ok(Math.abs(clustering - chance) < 0.08, `raids are independent, got ${(clustering * 100).toFixed(0)}% after a raid for ${chance * 100}% odds`);
});
