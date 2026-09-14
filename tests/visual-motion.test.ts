import test from 'node:test';
import assert from 'node:assert/strict';
import { residentMotion } from '../src/sim/visualMotion.ts';

test('stationary workers use both work poses without walking bob', () => {
  assert.deepEqual(residentMotion(0, 0, .1, false, true, false), { frame: 0, bob: 0 });
  assert.deepEqual(residentMotion(280, 0, .1, false, true, false), { frame: 1, bob: 0 });
});

test('pause and reduced motion suppress cosmetic motion without changing movement inputs', () => {
  for (const [delta, reduced] of [[0, false], [.1, true]] as const) {
    assert.deepEqual(residentMotion(350, 0, delta, true, true, reduced), { frame: 0, bob: 0 });
  }
  assert.notEqual(residentMotion(350, 0, .1, true, false, false).bob, 0);
  assert.deepEqual(residentMotion(350, 0, .1, false, false, false), { frame: 0, bob: 0 });
});
