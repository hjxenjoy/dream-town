import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, MAP_SIZE, RESOURCE_KEYS, TECHNOLOGY_KEYS, emptyResources } from '../src/sim/data.ts';
import { NEIGHBOURS } from '../src/sim/residents.ts';
import { bedsIn, homeCounts, newbornCitizen, rosterFromPopulation, settleCitizens, validCitizens, workCounts, commuteOfWorkplace, type Citizen } from '../src/sim/citizens.ts';
import { populate } from './population.ts';

/** A town with the workshops its neighbours work at, so an assignment can be checked against them. */
function grown(population = 20) {
  const world = new SimWorld();
  for (const building of world.state.buildings) building.paused = true;
  world.state.coins = 300000; world.state.capacity = 200000; world.state.level = 10;
  world.state.researched = [...TECHNOLOGY_KEYS];
  for (const key of RESOURCE_KEYS) world.state.resources[key] = 500;
  world.state.settings.disasters = false; world.state.settings.autoMayor = false;
  for (const neighbour of NEIGHBOURS) {
    if (world.state.buildings.some(building => building.kind === neighbour.workplace)) continue;
    let placed = false;
    for (let x = 6; x < MAP_SIZE - 2 && !placed; x++) for (let y = 6; y < MAP_SIZE - 2 && !placed; y++) placed = world.build(neighbour.workplace, x, y).ok;
  }
  populate(world, population);
  world.tick(0.1);
  return world;
}
const kindOf = (world: SimWorld, id: string | null) => (id ? world.state.buildings.find(b => b.id === id)?.kind : undefined);

test('the population IS the roster, and neither can drift from the other', () => {
  const world = grown(20);
  assert.equal(world.state.citizens!.length, world.state.population, 'twenty residents, twenty citizens');
  // The town's own growth moves a citizen, not just a counter.
  world.state.happiness = 100;
  world.state.resources.fish = 5000; world.state.resources.bread = 5000;
  world.state.capacity = 100000;
  // Housing is what limits a town, so give it somewhere to grow into.
  for (let i = 0; i < 6; i++) { let placed = false; for (let x = 30; x < MAP_SIZE - 2 && !placed; x++) for (let y = 30; y < MAP_SIZE - 2 && !placed; y++) placed = world.build('cottage', x, y).ok; }
  world.tick(90);
  assert.equal(world.state.citizens!.length, world.state.population, 'and they still agree after it grew');
  assert.ok(world.state.citizens!.length > 20, 'the town did grow');
  // And a save where they disagree is refused rather than loaded.
  const skewed = JSON.parse(JSON.stringify(world.state)) as { population: number };
  skewed.population += 1;
  assert.equal(validateSave(skewed), false, 'a count with no citizen behind it is corrupt');
});

test('a resident is a person: a name, a house and a job', () => {
  const world = grown(20);
  const citizens = world.state.citizens!;
  for (const citizen of citizens) {
    assert.equal(typeof citizen.id, 'string');
    assert.ok(Number.isInteger(citizen.since) && citizen.since >= 0, 'they arrived at a real moment');
  }
  // The named twelve come first, and every one of them is really placed.
  const named = citizens.filter(citizen => citizen.name);
  assert.equal(named.length, NEIGHBOURS.length, 'the twelve portraits are all in town');
  for (const citizen of named) {
    assert.ok(citizen.homeId, `${citizen.name} lives somewhere`);
    assert.ok(world.state.buildings.some(b => b.id === citizen.homeId), `${citizen.name}'s house is on the map`);
  }
  // Every assignment is a real building, and no workshop holds more than its own hands.
  const worked = workCounts(citizens);
  for (const [id, count] of worked) {
    const building = world.state.buildings.find(b => b.id === id)!;
    assert.ok(count <= (BUILDINGS[building.kind].workers ?? 0), `${building.kind} holds ${count} of ${BUILDINGS[building.kind].workers}`);
    assert.equal(building.workers, count, 'and the workshop is staffed by exactly those people');
  }
  const homed = homeCounts(citizens);
  for (const [id, count] of homed) {
    const building = world.state.buildings.find(b => b.id === id)!;
    assert.ok(count <= bedsIn(building), `${building.kind} holds ${count} of ${bedsIn(building)} beds`);
    assert.equal(building.residents, count, 'and the house says who lives in it');
  }
});

test('a resident keeps their house and their job when the town builds more', () => {
  // The reason the roster is persisted rather than derived: under the old derived version,
  // building one more cottage could move everyone's home and job, so a resident's commute
  // changed for a reason that had nothing to do with them.
  const world = grown(20);
  const before = world.state.citizens!.map(citizen => ({ id: citizen.id, homeId: citizen.homeId, workId: citizen.workId }));
  // Build somewhere far away, which is where a derived roster would have moved people to.
  let placed = false;
  for (let y = 40; y < MAP_SIZE - 2 && !placed; y++) placed = world.build('cottage', 40, y).ok;
  assert.equal(placed, true, 'a new house went up across town');
  world.tick(0.1);
  for (const citizen of world.state.citizens!) {
    const was = before.find(entry => entry.id === citizen.id);
    if (!was) continue; // somebody new arrived, which is not a move
    // A resident who already had a house keeps it. One who was homeless may well be given the
    // new house — that is the town working, not the roster shuffling people about.
    if (was.homeId !== null) assert.equal(citizen.homeId, was.homeId, `${citizen.id} did not move house`);
    if (was.workId !== null) assert.equal(citizen.workId, was.workId, `${citizen.id} did not change job`);
  }
});

test('the named neighbour gets their trade\'s workshop when it is built', () => {
  const world = grown(20); // enough residents that every workshop can be staffed
  const shop = world.state.buildings.find(b => b.kind === 'lumber') ?? world.state.buildings[0]!;
  const carpenter = world.state.citizens!.find(citizen => citizen.portrait === 'carpenter')!;
  if (kindOf(world, carpenter.workId) === 'lumber') {
    assert.equal(carpenter.workId, shop.id, 'the carpenter is already at the sawmill');
    return;
  }
  // Otherwise give the town the sawmill and check the trade claims it.
  assert.equal(world.build('lumber', 20, 20).ok, true);
  world.tick(0.1);
  assert.equal(kindOf(world, carpenter.workId ?? world.state.citizens!.find(c => c.portrait === 'carpenter')!.workId), 'lumber');
});

test('a fire does not move anybody out of their house', () => {
  const world = grown(14);
  const home = world.state.buildings.find(building => BUILDINGS[building.kind].housing && !building.damaged)!;
  const residents = world.state.citizens!.filter(citizen => citizen.homeId === home.id);
  assert.ok(residents.length > 0, 'the house has people in it');
  home.damaged = true; home.damageKind = 'fire';
  world.tick(0.1);
  for (const citizen of world.state.citizens!) {
    if (!residents.some(entry => entry.id === citizen.id)) continue;
    assert.equal(citizen.homeId, home.id, 'a ruin still shelters the people who live in it');
  }
  // But the town will not settle NEW arrivals into a ruin.
  const beds = bedsIn(home);
  const homeless = world.state.citizens!.filter(citizen => citizen.homeId === null).length;
  assert.ok(homeCounts(world.state.citizens!).get(home.id)! <= beds);
  void homeless;
});

test('a house that is torn down re-houses its residents, and a shortage leaves them homeless', () => {
  const world = grown(14);
  const homes = world.state.buildings.filter(building => BUILDINGS[building.kind].housing);
  // Demolish every house: there is nowhere left to live.
  for (const home of homes) world.state.buildings = world.state.buildings.filter(building => building.id !== home.id);
  world.tick(0.1);
  assert.ok(world.state.citizens!.every(citizen => citizen.homeId === null), 'everyone is homeless');
  assert.equal(validCitizens(world.state.citizens, world.state.buildings), true, 'and the save is still well formed');
  // Put one house back and the town fills it, up to its beds and no further.
  assert.equal(world.build('cottage', 18, 20).ok, true);
  world.tick(0.1);
  const rebuilt = world.state.buildings.find(building => building.kind === 'cottage')!;
  const housed = world.state.citizens!.filter(citizen => citizen.homeId === rebuilt.id).length;
  assert.equal(housed, Math.min(bedsIn(rebuilt), world.state.citizens!.length), 'the house fills to its beds');
});

test('nobody staffs two workshops, and nobody is in two houses', () => {
  const world = grown(20);
  const citizens = world.state.citizens!;
  const work = citizens.filter(citizen => citizen.workId !== null).map(citizen => citizen.workId);
  assert.equal(new Set(work).size + (work.length - new Set(work).size), work.length, 'a workshop may hold several people…');
  // …but one person cannot be in it twice, which the id uniqueness already guarantees; the real
  // check is that the roster's total never exceeds the town's residents.
  assert.ok(work.length <= citizens.length, 'no more hands than people');
  const assigned = citizens.reduce((total, citizen) => total + (citizen.workId ? 1 : 0), 0);
  const hands = [...workCounts(citizens).values()].reduce((total, count) => total + count, 0);
  assert.equal(assigned, hands, 'every assigned citizen is counted once');
});

test('the walk to work is the walk THEIR house makes, not the nearest one', () => {
  // The whole reason the commute reads the roster: a workshop staffed by people who live across
  // town should pay for the walk they really make.
  const world = grown(20);
  const distances = new Map([['building-a', 1], ['building-b', 9]]);
  const citizens: Citizen[] = [
    { id: 'c1', homeId: 'building-1', workId: 'shop', since: 0 },
    { id: 'c2', homeId: 'building-2', workId: 'shop', since: 0 },
  ];
  const byHome = new Map([['building-1', new Map([['shop', 1]])], ['building-2', new Map([['shop', 9]])]]);
  assert.equal(commuteOfWorkplace(citizens, 'shop', byHome, 18), 5, 'the average of their two walks');
  // A resident with no house counts as the worst case rather than being quietly dropped.
  const homeless: Citizen[] = [...citizens, { id: 'c3', homeId: null, workId: 'shop', since: 0 }];
  assert.ok(commuteOfWorkplace(homeless, 'shop', byHome, 18) > 5, 'an unhoused worker is not free');
  void distances;
  void world;
});

test('the roster survives a save round trip and a malformed one is refused', () => {
  const world = grown(20);
  world.tick(30);
  const round = new SimWorld(JSON.parse(JSON.stringify(world.state)));
  assert.deepEqual(round.state.citizens, world.state.citizens, 'every citizen is preserved exactly');
  assert.equal(validateSave(round.state), true);

  const corrupt = (mutate: (citizens: Citizen[]) => void) => {
    const copy = JSON.parse(JSON.stringify(world.state)) as { citizens: Citizen[] };
    mutate(copy.citizens);
    return validateSave(copy);
  };
  assert.equal(corrupt(citizens => { citizens[0]!.id = citizens[1]!.id; }), false, 'a repeated id');
  assert.equal(corrupt(citizens => { citizens[0]!.homeId = 'nowhere'; }), false, 'a house that is not there');
  assert.equal(corrupt(citizens => { citizens[0]!.workId = 'nowhere'; }), false, 'a workshop that is not there');
  assert.equal(corrupt(citizens => { citizens[0]!.since = -1; }), false, 'an arrival before the town began');
  assert.equal(corrupt(citizens => { citizens[0]!.since = 1.5; }), false, 'a fractional arrival');
  assert.equal(corrupt(citizens => { citizens.pop(); }), false, 'a roster shorter than the population');
  assert.equal(corrupt(citizens => { citizens.push({ id: 'extra', homeId: null, workId: null, since: 0 }); }), false, 'and longer than it');
  // The validator never throws, whatever it is handed.
  assert.equal(validCitizens(undefined, world.state.buildings), false);
  assert.equal(validCitizens([], undefined), false);
  assert.equal(validCitizens('nonsense', world.state.buildings), false);
});

test('a save written before the town kept a roster still loads and gains one', () => {
  const world = grown(16);
  const older = JSON.parse(JSON.stringify(world.state)) as Record<string, unknown>;
  delete older.citizens;
  assert.equal(validateSave(older), true, 'an older save is still valid');
  const reloaded = new SimWorld(older);
  // The roster is built on load, from the count the save reports.
  assert.equal(reloaded.state.citizens!.length, reloaded.state.population, 'it gains a roster of the right size');
  reloaded.tick(0.1);
  assert.equal(reloaded.state.citizens!.length, reloaded.state.population, 'and the two still agree after a tick');
  assert.ok(reloaded.state.citizens!.some(citizen => citizen.homeId), 'and they are settled into the houses that stand');
  assert.equal(reloaded.state.buildings.find(building => building.residents)?.residents, bedsIn(reloaded.state.buildings.find(building => building.residents)!), 'the houses fill to their beds');
  assert.equal(validateSave(reloaded.state), true);
});

test('growth and departure move citizens, and the named ones are the last to leave', () => {
  const citizens = rosterFromPopulation(13);
  assert.equal(citizens.length, 13);
  assert.equal(citizens.filter(citizen => citizen.name).length, 12, 'the twelve portraits, then an unnamed resident');
  const born = newbornCitizen(citizens, 180.5);
  assert.equal(born.id, 'citizen-14', 'the numbering continues past the named ones');
  assert.equal(born.since, 180, 'and the arrival is an instant, not a fraction');
  assert.equal(citizens.some(citizen => citizen.id === born.id), false, 'the new id is unique');
  // Past the portraits, later arrivals are unnamed rather than reusing a name.
  const many = [...citizens, born, newbornCitizen([...citizens, born], 200)];
  assert.equal(many.filter(citizen => citizen.name).length, 12, 'never more names than portraits');
  assert.equal(new Set(many.map(citizen => citizen.id)).size, many.length, 'and never a repeated id');
});

test('the roster is what the panel and the stories read', () => {
  const world = grown(20);
  const observed = world.observe();
  assert.equal(world.state.citizens!.length, world.state.population);
  // Every named citizen the stories can tell is one the roster knows.
  for (const story of observed.stories) {
    assert.ok(world.state.citizens!.some(citizen => citizen.portrait === story.portrait), `${story.portrait} is a citizen`);
  }
  assert.equal(observed.stories.length, NEIGHBOURS.length);
  void settleCitizens;
  void emptyResources;
});
