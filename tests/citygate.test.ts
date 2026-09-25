import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, type Building } from '../src/sim/world.ts';
import { BUILDINGS, TECHNOLOGY_KEYS, emptyResources } from '../src/sim/data.ts';
import { TownNavigation } from '../src/sim/navigation.ts';
import { gatePiece, wallKeys, wallMask } from '../src/sim/walls.ts';
import { atlasFrames, generatedSprite } from '../src/sim/atlases.ts';

const wall = (x: number, y: number) => ({ id: `w${x}-${y}`, kind: 'wall', x, y } as Building);
const gate = (x: number, y: number) => ({ id: `g${x}-${y}`, kind: 'citygate', x, y } as Building);

test('the gate is a door: people walk through it, but not through the wall beside it', () => {
  // Walls block like every other building, so a courtyard without a gate is a trap: nothing
  // inside can ever reach a workshop outside. Opening the door is the whole reason the gate
  // is not simply another wall tile.
  const courtyard = [wall(10, 10), wall(11, 10), wall(12, 10), wall(10, 11), wall(12, 11), wall(10, 12), wall(12, 12)];
  const sealed = new TownNavigation([...courtyard, wall(11, 12)]);
  assert.deepEqual(sealed.path({ x: 11, y: 11 }, { x: 11, y: 14 }), [], 'a sealed courtyard keeps everyone in');
  const opened = new TownNavigation([...courtyard, gate(11, 12)]);
  const path = opened.path({ x: 11, y: 11 }, { x: 11, y: 14 });
  assert.ok(path.length > 0, 'with a gate in the wall, the way is open');
  assert.ok(path.some(tile => tile.x === 11 && tile.y === 12), 'and the route leads through the gate');
});

test('a gate joins the run instead of breaking the line', () => {
  // The tiles on both sides of a gate must read the masks an unbroken run gives them, or the
  // neighbours would restyle every time the gate is used as a door.
  const broken = [wall(3, 3), wall(4, 3), gate(5, 3), wall(6, 3), wall(7, 3)];
  const whole = [wall(3, 3), wall(4, 3), wall(5, 3), wall(6, 3), wall(7, 3)];
  for (const tile of [{ x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }]) {
    assert.equal(wallMask(tile, wallKeys(broken)), wallMask(tile, wallKeys(whole)), `tile ${tile.x} still reads as the same line`);
  }
});

test('the gate keeps the straight runs mirroring convention, on a frame the pack shipped', () => {
  assert.deepEqual(gatePiece(['+x', '-x']), { atlas: 'defense-expansion', frame: 'city-gate' });
  assert.deepEqual(gatePiece(['+y', '-y']), { atlas: 'defense-expansion', frame: 'city-gate', flipX: true }, 'the other diagonal is the same gate mirrored');
  assert.deepEqual(gatePiece(['+x', '+y']), { atlas: 'defense-expansion', frame: 'city-gate' }, 'anything but a straight run draws as shipped');
  const sprite = generatedSprite('citygate')!;
  assert.equal(sprite.frame, 'city-gate');
  assert.ok(atlasFrames(sprite.atlas)[sprite.frame], 'the frame is really in the atlas the scene loads');
});

test('the gate builds from the decoration catalog, keeps the road off its tile, and survives a save', () => {
  const world = new SimWorld();
  world.state.coins = 100000;
  world.state.capacity = 5000;
  world.state.resources = { ...emptyResources(), wood: 600, stone: 600 };
  world.state.researched = [...TECHNOLOGY_KEYS];
  const built = world.build('citygate', 20, 20);
  assert.equal(built.ok, true, built.message);
  assert.equal(BUILDINGS.citygate.category, 'decoration', 'built like the wall it belongs to');
  assert.equal(world.paveRoad({ x: 19, y: 20 }, { x: 21, y: 20 }, 'dirt').code, 'TILE_OCCUPIED', 'no road runs over a gate');
  assert.equal(validateSave(world.state), true);
  const restored = new SimWorld(JSON.parse(JSON.stringify(world.state)));
  assert.equal(restored.state.buildings.some(building => building.kind === 'citygate'), true, 'the gate survives a reload');
  assert.equal(validateSave(restored.state), true);
});
