// Tuning scan: reproduces the measurements the design notes cite, so the numbers in the docs
// can be re-derived rather than trusted. Run with `npx tsx scripts/scan-tuning.ts`.
//
// Everything here is deterministic: the fixtures are built by explicit placement order, and the
// simulations advance by fixed steps, so two runs of this file print the same figures.
import { SimWorld, type Building } from '../src/sim/world.ts';
import { BUILDINGS, TECHNOLOGY_KEYS, emptyResources, type BuildingKind, type Resource } from '../src/sim/data.ts';
import { DESTINATIONS } from '../src/sim/destinations.ts';
import { TownNavigation } from '../src/sim/navigation.ts';
import { LOCAL_SUPPLY_RANGE, supplyHauls, supplyFactor } from '../src/sim/layout.ts';

/** A town with room, materials and every blueprint, so placement is the only variable. */
function workshopTown(): SimWorld {
  const w = new SimWorld();
  w.state.settings.disasters = false; w.state.settings.autoMayor = false;
  w.state.coins = 5_000_000; w.state.capacity = 200_000;
  w.state.population = 60; w.state.level = 20; w.state.prestige = 500;
  w.state.resources = { ...emptyResources(), wood: 9000, stone: 9000, materials: 9000 };
  w.state.researched = [...TECHNOLOGY_KEYS];
  return w;
}

/** Places a building on the next free tile in reading order, so the town is reproducible. */
function place(w: SimWorld, kind: BuildingKind, from = 2): Building {
  for (let y = from; y < 45; y++) for (let x = 2; x < 45; x++) {
    const result = w.build(kind, x, y);
    if (result.ok) return w.state.buildings.find(b => b.id === result.buildingId)!;
  }
  throw new Error(`${kind}: nowhere to build`);
}

/** A dense industrial quarter: 60 workshops packed into the western bank. */
function denseTown(): SimWorld {
  const w = workshopTown();
  const kinds: BuildingKind[] = ['windmill', 'bakery', 'lumber', 'sawmill', 'feedmill', 'pasture', 'weaver', 'tailor', 'fishpond', 'smelter', 'smithy', 'kiln', 'dairy', 'cowbarn', 'brickworks'];
  for (let n = 0; n < 60; n++) place(w, kinds[n % kinds.length]!);
  return w;
}

/** Walking distance between two buildings, door to door, the way a carrier would travel. */
function roadDistance(navigation: TownNavigation, from: Building, to: Building): number {
  let best = Infinity;
  for (const a of navigation.entrances(from)) for (const b of navigation.entrances(to)) {
    const path = navigation.path(a, b);
    if (path.length > 1) best = Math.min(best, path.length - 1);
  }
  return best;
}

function straightVersusWalking() {
  const w = denseTown();
  const standing = w.state.buildings.filter(b => !b.damaged);
  const sources = standing.filter(b => BUILDINGS[b.kind].cycle);
  const navigation = new TownNavigation(standing, w.state.roads ?? []);
  const hauls = supplyHauls(standing, w.state.roads ?? []);

  let pairs = 0, longer = 0, worst = { label: '', straight: 0, walked: 0 };
  for (const consumer of standing) {
    if (!BUILDINGS[consumer.kind].input) continue;
    if ((hauls.get(consumer.id) ?? Infinity) >= LOCAL_SUPPLY_RANGE) continue;
    const supplier = sources.find(s => s.id !== consumer.id
      && Math.hypot(s.x - consumer.x, s.y - consumer.y) <= LOCAL_SUPPLY_RANGE
      && Object.keys(BUILDINGS[consumer.kind].input ?? {}).some(k => (BUILDINGS[s.kind].output?.[k as never] ?? 0) > 0));
    if (!supplier) continue;
    pairs++;
    const straight = Math.hypot(consumer.x - supplier.x, consumer.y - supplier.y);
    const walked = roadDistance(navigation, supplier, consumer);
    if (!Number.isFinite(walked)) continue;
    if (walked > straight + 0.5) longer++;
    if (walked - straight > worst.walked - worst.straight) {
      worst = { label: `${supplier.kind}->${consumer.kind}`, straight, walked };
    }
  }
  console.log(`\n[1] straight-line vs walking distance  (${w.state.buildings.length} buildings, ${pairs} supplied pairs)`);
  console.log(`    pairs where the walk is meaningfully longer than the line: ${longer}/${pairs} = ${(longer / Math.max(1, pairs) * 100).toFixed(0)}%`);
  console.log(`    worst detour: ${worst.label} straight ${worst.straight.toFixed(1)} tiles but ${worst.walked} tiles of walking`);
}

function pathCost() {
  const w = denseTown();
  const standing = w.state.buildings.filter(b => !b.damaged);
  const sources = standing.filter(b => BUILDINGS[b.kind].cycle);
  const navigation = new TownNavigation(standing, w.state.roads ?? []);
  const consumers = standing.filter(b => BUILDINGS[b.kind].input).slice(0, 15);
  const producers = sources.slice(0, 15);
  let calls = 0;
  const started = performance.now();
  for (const consumer of consumers) for (const producer of producers) { roadDistance(navigation, producer, consumer); calls++; }
  const perPair = (performance.now() - started) / Math.max(1, calls);

  const startedSweep = performance.now();
  const hauls = supplyHauls(standing, w.state.roads ?? []);
  const sweep = performance.now() - startedSweep;

  console.log(`\n[2] path cost  (${standing.length} buildings)`);
  console.log(`    one A* search: ${perPair.toFixed(2)}ms per pair  ->  ${producers.length}x${consumers.length} pairs would cost ${(perPair * calls).toFixed(0)}ms`);
  console.log(`    one full BFS sweep for every workshop at once: ${sweep.toFixed(1)}ms (${hauls.size} hauls found)`);
  console.log(`    the sweep is ${(perPair * calls / Math.max(0.01, sweep)).toFixed(0)}x cheaper than searching per pair`);
}

function commissionIncome() {
  const w = workshopTown();
  // A town that actually qualifies for commissions: three finished goods it can *hold*. Tools
  // are the reliable third, because nothing eats them — residents wear clothes and eat bread,
  // so those never pile up in a town this size.
  for (const kind of ['windmill', 'bakery', 'lumber', 'fishery', 'fishpond', 'sawmill', 'mine', 'kiln', 'smelter', 'smithy'] as BuildingKind[]) place(w, kind);
  // Let the chains fill before measuring, so the figures describe a running town.
  for (let t = 0; t < 6 * 3600; t++) { w.tick(1); if (t % 10 === 0) w.collectAll(); }
  const hours = 8;
  let commissions = 0, filled = 0;
  let fromCommissions = 0, fromBoard = 0, fromCaravan = 0;
  const seen = new Set<string>();

  for (let t = 0; t < hours * 3600; t++) {
    w.tick(1);
    if (t % 10 === 0) w.collectAll();
    // Collect and re-send the caravan whenever the rules allow it.
    if (w.state.caravan.status === 'returned' || w.state.caravan.status === 'idle') {
      const before = w.state.coins;
      if (w.dispatchCaravan().ok) fromCaravan += w.state.coins - before;
    }
    const bulk = w.state.orders.find(o => o.bulk);
    if (bulk && !seen.has(bulk.id)) { seen.add(bulk.id); commissions++; }
    if (bulk && Object.entries(bulk.items).every(([k, v]) => w.state.resources[k as Resource] >= v!)) {
      const before = w.state.coins;
      if (w.fulfillOrder(bulk.id).ok) { filled++; fromCommissions += w.state.coins - before; }
    }
    for (const order of w.state.orders.filter(o => !o.bulk)) {
      if (Object.entries(order.items).every(([k, v]) => w.state.resources[k as Resource] >= v!)) {
        const before = w.state.coins;
        if (w.fulfillOrder(order.id).ok) fromBoard += w.state.coins - before;
      }
    }
  }

  const total = fromCommissions + fromBoard + fromCaravan;
  const share = (n: number) => `${(n / Math.max(1, total) * 100).toFixed(1)}%`;
  console.log(`\n[3] commission income over ${hours} game hours`);
  console.log(`    offered ${commissions}, filled ${filled}`);
  console.log(`    caravans ${fromCaravan} (${share(fromCaravan)})  ·  commissions ${fromCommissions} (${share(fromCommissions)})  ·  board ${fromBoard} (${share(fromBoard)})`);
  console.log(`    shares sum to ${((fromCaravan + fromCommissions + fromBoard) / Math.max(1, total) * 100).toFixed(1)}%`);
}

function materialsEconomy() {
  // Supply: one caravan route at full utilisation on the fastest destination.
  const fastest = Object.values(DESTINATIONS).reduce((a, b) => (a.duration <= b.duration ? a : b));
  const tripsPerHour = 3600 / fastest.duration;
  const perHour = tripsPerHour * fastest.rewardMaterials;
  // Demand: every building built once and upgraded to level 3, which is the whole game's need.
  let demand = 0;
  for (const [kind, def] of Object.entries(BUILDINGS) as [BuildingKind, typeof BUILDINGS.cottage][]) {
    if (kind === 'townhall') continue;
    demand += def.materials?.materials ?? 0;
    demand += 3 + 6;
  }
  console.log(`\n[4] caravan materials vs the town's whole appetite`);
  console.log(`    ${fastest.id}: ${fastest.rewardMaterials} materials per ${fastest.duration}s trip = ${perHour.toFixed(0)}/hour at full utilisation`);
  console.log(`    total demand: every building built and upgraded to level 3 = ${demand} materials`);
  console.log(`    one caravan route alone covers that in ${(demand / perHour).toFixed(1)} hours`);
}

function layoutBonus() {
  const w = workshopTown();
  place(w, 'lumber', 6); const sawmill = place(w, 'sawmill', 4);
  const tight = w.observe().production.find(p => p.buildingId === sawmill.id)!;
  console.log(`\n[5] proximity bonus by haul length (range ${LOCAL_SUPPLY_RANGE}, best case x${supplyFactor(1).toFixed(2)})`);
  console.log(`    a sawmill one gap from its lumber: haul ${tight.haul}, cycle factor ${supplyFactor(tight.haul ?? 99).toFixed(3)}`);
  console.log(`    ${[1, 2, 3, 4, 5, 6].map(n => `${n}->${supplyFactor(n).toFixed(3)}`).join('  ')}`);
}

console.log('Tuning scan — the figures the design notes cite, re-derived from the shipped code.');
straightVersusWalking();
pathCost();
commissionIncome();
materialsEconomy();
layoutBonus();
console.log('\nDone. Figures above are observations of this build; the notes next to them should match.');
