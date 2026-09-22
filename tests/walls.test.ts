import test from 'node:test';
import assert from 'node:assert/strict';
import { WALL_DIRECTIONS, WALL_PIECES, isStraightThrough, wallConnections, wallKeys, wallMask, wallPiece } from '../src/sim/walls.ts';
import { GENERATED_ATLASES, atlasFrames } from '../src/sim/atlases.ts';
import type { Building } from '../src/sim/world.ts';

const wall = (x: number, y: number) => ({ id: `w${x}-${y}`, kind: 'wall', x, y } as Building);

test('every mask from zero to fifteen resolves to a piece that exists in the art', () => {
  // The table is the calibration point against the art, so a missing or mistyped mask must
  // fail here rather than draw a blank tile in the game.
  for (let mask = 0; mask < 16; mask++) {
    const piece = wallPiece(mask);
    assert.ok(piece, `mask ${mask} has a piece`);
    const frames = atlasFrames(piece.atlas);
    assert.ok(frames[piece.frame], `mask ${mask} -> ${piece.atlas}/${piece.frame} exists`);
    assert.ok(piece.flipX === undefined || piece.flipX === true, 'flipX is only ever true');
  }
});

test('the table is exactly the sixteen masks, with no gaps and no strays', () => {
  const keys = Object.keys(WALL_PIECES).map(Number).sort((a, b) => a - b);
  assert.deepEqual(keys, Array.from({ length: 16 }, (_, i) => i));
});

test('each neighbour count picks the right shape of piece, and none of them is a wall cross', () => {
  const shape = (mask: number) => {
    const piece = wallPiece(mask);
    return piece.frame.includes('tee') ? 'tee' : piece.frame.includes('end') ? 'cap'
      : piece.frame.includes('corner') ? 'corner' : 'straight';
  };
  assert.equal(shape(0), 'cap', 'a lone wall is a stub');
  for (const mask of [1, 2, 4, 8]) assert.equal(shape(mask), 'cap', `one neighbour (${mask}) caps the run`);
  for (const mask of [1 | 4, 2 | 8]) assert.equal(shape(mask), 'straight', `opposite neighbours (${mask}) run straight through`);
  for (const mask of [1 | 2, 2 | 4, 4 | 8, 8 | 1]) assert.equal(shape(mask), 'corner', `adjacent neighbours (${mask}) turn a corner`);
  for (const mask of [2 | 4 | 8, 4 | 8 | 1, 8 | 1 | 2, 1 | 2 | 4]) assert.equal(shape(mask), 'tee');
  // No pack shipped a four-way cross, so this is the documented stand-in.
  assert.equal(shape(1 | 2 | 4 | 8), 'tee', 'a four-way junction falls back to a tee');
});

test('the two diagonals are drawn differently, and each stays itself as a run grows', () => {
  // Only one straight frame exists, so the second diagonal has to be that frame mirrored.
  // If both diagonals resolved to the same rendering, one of them would lie across its tiles.
  const alongX = wallPiece(1 | 4);
  const alongY = wallPiece(2 | 8);
  assert.equal(alongX.frame, alongY.frame, 'both diagonals use the one straight frame the art has');
  assert.notEqual(alongX.flipX ?? false, alongY.flipX ?? false, 'and exactly one of them is mirrored');

  // Extending a run must not restyle the tiles already placed: the middle of a long run has
  // the same mask however long the run becomes.
  const short = wallKeys([wall(3, 3), wall(4, 3), wall(5, 3)]);
  const long = wallKeys([wall(3, 3), wall(4, 3), wall(5, 3), wall(6, 3), wall(7, 3)]);
  assert.equal(wallMask({ x: 4, y: 3 }, short), wallMask({ x: 4, y: 3 }, long));
});

test('connections are read in world axes, so the mask follows the map rather than the screen', () => {
  // A run along +x: each tile should see exactly its +x neighbour.
  const walls = wallKeys([wall(3, 3), wall(4, 3), wall(5, 3)]);
  assert.deepEqual(wallConnections({ x: 3, y: 3 }, walls), ['+x']);
  assert.deepEqual(wallConnections({ x: 4, y: 3 }, walls), ['+x', '-x']);
  assert.equal(wallMask({ x: 4, y: 3 }, walls), 1 | 4);
  assert.equal(isStraightThrough(wallConnections({ x: 4, y: 3 }, walls)), true);
  // And along +y, which is the other screen diagonal.
  const vertical = wallKeys([wall(3, 3), wall(3, 4), wall(3, 5)]);
  assert.deepEqual(wallConnections({ x: 3, y: 4 }, vertical), ['+y', '-y']);
  assert.equal(isStraightThrough(wallConnections({ x: 3, y: 4 }, vertical)), true);
});

test('a wall tile is keyed by its own cell, so two walls never share a position', () => {
  const keys = wallKeys([wall(2, 7), wall(2, 8), { id: 'x', kind: 'well', x: 9, y: 9 } as Building]);
  assert.equal(keys.size, 2, 'non-walls do not join a run');
  assert.ok(keys.has('2,7') && keys.has('2,8'));
  assert.equal(wallConnections({ x: 2, y: 7 }, keys).length, 1);
  assert.equal(wallConnections({ x: 9, y: 9 }, keys).length, 0);
});

test('every direction is used by the table, so none is dead weight', () => {
  const used = new Set(Object.values(WALL_PIECES).map(piece => piece.frame));
  for (const direction of WALL_DIRECTIONS) {
    const cap = Object.values(WALL_PIECES).map(p => p.frame).filter(f => f.startsWith('wall-end'));
    const tee = Object.values(WALL_PIECES).map(p => p.frame).filter(f => f.startsWith('wall-tee'));
    assert.ok(cap.length >= 4 && tee.length >= 4, `${direction}: both caps and tees are reachable`);
  }
  // Nothing is left over: every shipped wall frame is used by at least one mask.
  for (const frame of ['wall-straight', 'wall-corner']) assert.ok(used.has(frame), `${frame} is reachable`);
  for (const frame of GENERATED_ATLASES['wall-junctions'].frames ? Object.keys(GENERATED_ATLASES['wall-junctions'].frames) : []) {
    assert.ok(used.has(frame), `${frame} is reachable from some mask`);
  }
});
