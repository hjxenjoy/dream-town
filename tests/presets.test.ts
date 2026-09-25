import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_PRESETS, MAP_PRESET_IDS, DEFAULT_MAP_PRESET, presetCensus, presetRoads, type MapPresetId } from '../src/sim/presets.ts';
import { BUILDINGS, TECHNOLOGIES } from '../src/sim/data.ts';
import { terrainAt, DISTRICT_KEYS, districtAt } from '../src/sim/terrain.ts';
import { REGIONS, REGION_IDS } from '../src/sim/regions.ts';
import { gardenLevel, CROPS } from '../src/sim/farming.ts';
import { createInitialState, validateSave, SimWorld, type Building } from '../src/sim/world.ts';

const PLANNED = MAP_PRESET_IDS.filter(id => id !== 'frontier') as MapPresetId[];
const now = 1_760_000_000_000;

test('every map blueprint is a valid save and a town that runs', () => {
  // The blueprint is handed to the world exactly like an imported save, so it has to pass the
  // same boundary checks: real terrain, no overlaps, staffed workshops, honest storage.
  for (const id of MAP_PRESET_IDS) {
    const state = createInitialState(now, id);
    assert.equal(validateSave(state), true, `${id} passes save validation`);
    const world = new SimWorld(state);
    assert.equal(world.state.citizens!.length, world.state.population, `${id} has a roster of residents`);
    for (let i = 0; i < 30; i++) world.tick(1);
    assert.equal(validateSave(structuredClone(world.state)), true, `${id} is still a valid save after running`);
  }
});

test('every building stands on land, off the streets, and on a tile of its own', () => {
  for (const id of MAP_PRESET_IDS) {
    const map = MAP_PRESETS[id];
    const roads = new Set(presetRoads(map).map(tile => `${tile.x},${tile.y}`));
    const seen = new Set<string>();
    for (const placement of map.placements) {
      const tile = `${placement.x},${placement.y}`;
      assert.equal(terrainAt(placement.x, placement.y), 'land', `${id}: ${placement.kind}@${tile} is on land`);
      assert.equal(roads.has(tile), false, `${id}: ${placement.kind}@${tile} is off the streets`);
      assert.equal(seen.has(tile), false, `${id}: ${tile} holds one building only`);
      seen.add(tile);
    }
    // Streets are tiles too: unique, on land, and never shared with a building.
    assert.equal(roads.size, presetRoads(map).length, `${id}: no street tile is paved twice`);
  }
});

test('planned maps are dense: a full town on both banks, not an empty field', () => {
  for (const id of PLANNED) {
    const map = MAP_PRESETS[id];
    const roads = presetRoads(map);
    assert.ok(map.placements.length >= 150, `${id} has at least 150 buildings (has ${map.placements.length})`);
    assert.ok(roads.length >= 300, `${id} has at least 300 road tiles (has ${roads.length})`);
    const decorations = map.placements.filter(p => BUILDINGS[p.kind].category === 'decoration').length;
    assert.ok(decorations >= 30, `${id} is dressed with at least 30 decorations (has ${decorations})`);
    const houses = map.placements.filter(p => BUILDINGS[p.kind].category === 'homes').length;
    assert.ok(houses >= 30, `${id} has at least 30 homes (has ${houses})`);
    for (const district of DISTRICT_KEYS) {
      const here = map.placements.filter(p => districtAt(p.x, p.y) === district).length;
      assert.ok(here >= 12, `${id} builds in ${district} (has ${here})`);
    }
  }
});

test('every workplace is reached by a street', () => {
  // Residents walk to work, so a workshop four tiles from paving is a workshop nobody can
  // reach in the rain. Decorations may stand anywhere — they are scenery, not destinations.
  for (const id of PLANNED) {
    const map = MAP_PRESETS[id];
    const roads = presetRoads(map);
    for (const placement of map.placements) {
      if (BUILDINGS[placement.kind].category === 'decoration') continue;
      const near = roads.some(road => Math.abs(road.x - placement.x) + Math.abs(road.y - placement.y) <= 4);
      assert.equal(near, true, `${id}: ${placement.kind}@${placement.x},${placement.y} is within four tiles of a street`);
    }
  }
});

test('the census adds up: jobs, beds and community seats cover the residents', () => {
  for (const id of MAP_PRESET_IDS) {
    const map = MAP_PRESETS[id];
    const census = presetCensus(map);
    assert.ok(census.jobs <= map.population, `${id}: every workshop can be staffed (${census.jobs} jobs / ${map.population} residents)`);
    const world = new SimWorld(createInitialState(now, id));
    assert.ok(world.state.population <= world.housingCapacity(), `${id}: everyone has a bed (${world.housingCapacity()})`);
    assert.ok(world.state.population <= world.communityCapacity(), `${id}: services cover everyone (${world.communityCapacity()})`);
  }
});

test('warehouse space follows the warehouses, and holds what the map starts with', () => {
  for (const id of MAP_PRESET_IDS) {
    const state = createInitialState(now, id);
    const world = new SimWorld(state);
    const stored = Object.values(state.resources).reduce((a, b) => a + b, 0);
    const census = presetCensus(MAP_PRESETS[id]);
    assert.equal(state.capacity, 160 + world.warehouseIncrement() * census.warehouses, `${id}: capacity is what its warehouses give`);
    assert.ok(stored <= state.capacity, `${id}: the stores fit (${stored} / ${state.capacity})`);
  }
});

test('research, town level and the zoo agree with what the map actually builds', () => {
  for (const id of MAP_PRESET_IDS) {
    const map = MAP_PRESETS[id];
    const kinds = map.placements.map(p => p.kind);
    for (const placement of map.placements) {
      const definition = BUILDINGS[placement.kind];
      if (definition.technology) assert.equal(map.researched.includes(definition.technology), true, `${id}: ${placement.kind} needs ${definition.technology}`);
      if (definition.minTownLevel) assert.ok(map.level >= definition.minTownLevel, `${id}: ${placement.kind} needs town level ${definition.minTownLevel}`);
      if (definition.needsZooGate) assert.equal(kinds.includes('zoogate'), true, `${id}: ${placement.kind} stands inside a zoo with a gate`);
    }
    for (const technology of map.researched) {
      for (const prerequisite of TECHNOLOGIES[technology].requires) {
        assert.equal(map.researched.includes(prerequisite), true, `${id}: research includes ${prerequisite} before ${technology}`);
      }
    }
    assert.equal(kinds.filter(kind => kind === 'townhall').length, 1, `${id}: one town hall`);
    assert.ok(kinds.filter(kind => kind === 'zoogate').length <= 1, `${id}: at most one zoo gate`);
    const farms = kinds.filter(kind => kind === 'farm').length;
    assert.ok(farms <= Math.floor(map.population / 2) + 2, `${id}: the residents can tend every field (${farms})`);
  }
});

test('each map plays to its own strength', () => {
  const signature: Record<string, string[]> = {
    riverbend: ['townhall', 'market', 'windmill'],
    milltown: ['smelter', 'smithy', 'weaver', 'barracks'],
    pastoral: ['vineyard', 'winery', 'cellar', 'dairy'],
    crossroads: ['harbor', 'zoogate', 'theatre', 'tavern'],
    frontier: ['townhall', 'farm'],
  };
  for (const [id, kinds] of Object.entries(signature)) {
    const built = new Set(MAP_PRESETS[id as MapPresetId].placements.map(p => p.kind));
    for (const kind of kinds) assert.equal(built.has(kind as Building['kind']), true, `${id} builds a ${kind}`);
  }
});

test('the frontier map is still the baseline the simulation is tested against', () => {
  const state = createInitialState(now);
  assert.equal(state.buildings.length, 21, 'the hamlet is the twenty-one buildings it has always been');
  assert.equal(state.buildings[0]!.kind, 'townhall', 'and starts from the town hall');
  assert.equal(state.roads, undefined, 'its roads are the automatic ones, derived after arrangement');
  assert.equal(state.population, 13);
  assert.equal(state.coins, 2800);
  assert.equal(state.capacity, 240);
  const world = new SimWorld();
  assert.ok((world.state.roads ?? []).length > 0, 'a fresh world still gets its roads connected');
});

test('a map survives a save round trip with its streets and skyline intact', () => {
  const world = new SimWorld(createInitialState(now, DEFAULT_MAP_PRESET));
  const restored = new SimWorld(structuredClone(world.state) as never);
  assert.deepEqual(restored.state.buildings.map((b: Building) => `${b.kind}@${b.x},${b.y}`).sort(), world.state.buildings.map(b => `${b.kind}@${b.x},${b.y}`).sort());
  assert.deepEqual([...(restored.state.roads ?? [])].sort((a, b) => a.y - b.y || a.x - b.x), [...(world.state.roads ?? [])].sort((a, b) => a.y - b.y || a.x - b.x));
});

test('planned maps plan the whole valley, so no land is left washed dark', () => {
  // Unopened expansion land is drawn with a dark "not yet open" wash. A planned map has
  // planned all of it, so every region is open — and only where the map's own town level
  // could legitimately have opened it, so the save stays attainable.
  for (const id of PLANNED) {
    const map = MAP_PRESETS[id];
    assert.deepEqual([...map.regions].sort(), [...REGION_IDS].sort(), `${id} opens the whole valley`);
    for (const region of map.regions) assert.ok(map.level >= REGIONS[region].level, `${id} is old enough to have opened ${region}`);
  }
  assert.deepEqual(MAP_PRESETS.frontier.regions, [], 'the blank paper keeps expansion land closed');
});

test('the garden behind each map can grow the crops it plants', () => {
  for (const id of MAP_PRESET_IDS) {
    const map = MAP_PRESETS[id];
    const level = gardenLevel(map.farmingXp).level;
    for (const placement of map.placements) {
      if (!placement.crop) continue;
      assert.ok(CROPS[placement.crop].level <= level, `${id}: ${placement.crop} is unlocked at garden level ${level}`);
    }
  }
});
