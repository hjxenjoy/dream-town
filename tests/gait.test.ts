import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WALK_SCALE, WALK_STEPS, livestockFrame, livestockWalk } from '../src/sim/livestock.ts';
import { GENERATED_ATLASES, atlasFrames } from '../src/sim/atlases.ts';
import type { Building } from '../src/sim/world.ts';

const beast = (kind: Building['kind'], age: number) => ({ id: 'b', kind, x: 1, y: 1, level: 1, progress: 0, ready: false, paused: false, stock: {}, workers: 1, animalAge: age } as Building);

test('sheep and cattle walk; poultry keep the stills they were given', () => {
  // The art is asymmetric on purpose: animal-walk-3 holds lamb and sheep, animal-walk-4 holds
  // calf and cow, and nothing shipped a walking chicken. Inventing one would mean drawing an
  // animal the atlas cannot show, so a coop keeps its stills.
  assert.ok(livestockWalk(beast('pasture', 999), 0), 'a sheep walks');
  assert.ok(livestockWalk(beast('cowbarn', 999), 0), 'a cow walks');
  assert.ok(livestockWalk(beast('pasture', 0), 0), 'and so does a lamb');
  assert.ok(livestockWalk(beast('cowbarn', 0), 0), 'and a calf');
  assert.equal(livestockWalk(beast('chickencoop', 999), 0), null, 'a chicken has no gait art');
  assert.equal(livestockWalk(beast('farm', 0), 0), null, 'and farmland certainly does not');
});

test('the gait has four strides and wraps, so a free-running counter is safe', () => {
  const seen = new Set<string>();
  for (let step = 0; step < WALK_STEPS; step++) {
    const walk = livestockWalk(beast('pasture', 999), step)!;
    seen.add(walk.frame);
    assert.ok(atlasFrames(walk.atlas)[walk.frame], `${walk.frame} exists`);
  }
  assert.equal(seen.size, WALK_STEPS, 'four distinct strides');
  // Wrapping in both directions, and staying put within one stride.
  assert.equal(livestockWalk(beast('pasture', 999), WALK_STEPS)!.frame, livestockWalk(beast('pasture', 999), 0)!.frame);
  assert.equal(livestockWalk(beast('pasture', 999), -1)!.frame, livestockWalk(beast('pasture', 999), WALK_STEPS - 1)!.frame);
  assert.equal(livestockWalk(beast('pasture', 999), 2.9)!.frame, livestockWalk(beast('pasture', 999), 2)!.frame, 'a fractional step does not flicker');
});

test('the right animal is drawn at the right age', () => {
  // Growing up swaps the gait as well as the still, so a lamb does not strut as a sheep.
  const young = livestockWalk(beast('pasture', 0), 0)!;
  const grown = livestockWalk(beast('pasture', 999), 0)!;
  assert.notEqual(young.frame, grown.frame);
  assert.match(young.frame, /^lamb-walk-/);
  assert.match(grown.frame, /^sheep-walk-/);
  assert.notEqual(young.atlas, undefined);
  // And the still agrees with the gait about which animal this is.
  assert.equal(livestockFrame(beast('pasture', 0)), 'lamb');
  assert.equal(livestockFrame(beast('pasture', 999)), 'sheep');
});

test('a walking animal is drawn the same size as the same animal standing', () => {
  // This is the whole point of the measured scales. The stills fill their cells very
  // differently from the walk frames — a sheep fills 96% of its still but 73% of its walk cell —
  // so a single scale made a walking sheep 26% bigger than a standing one, which reads as the
  // herd popping every time it moves.
  // Frame widths in pixels, read from the shipped catalogs. The stills are tight crops and the
  // walk cells are padded, which is exactly why one shared scale cannot work.
  const measured: Record<string, { still: number; walk: number }> = {
    lamb: { still: 263, walk: 443.5 },
    sheep: { still: 400, walk: 443.5 },
    calf: { still: 304, walk: 443.5 },
    cow: { still: 432, walk: 443.5 },
  };
  const STILL_SCALE = 0.12;
  for (const [animal, sizes] of Object.entries(measured)) {
    const scale = WALK_SCALE[animal as keyof typeof WALK_SCALE];
    const walkingOnScreen = sizes.walk * scale;
    const standingOnScreen = sizes.still * STILL_SCALE;
    const drift = Math.abs(walkingOnScreen / standingOnScreen - 1);
    assert.ok(drift < 0.02, `${animal} changes size by ${(drift * 100).toFixed(1)}% when it starts walking`);
    // The measurement above is cross-checked against the catalogs, so a regenerated atlas that
    // changed the framing would fail here rather than silently resizing the herd.
    const stillFrame = atlasFrames('herd-growth')[animal]!;
    assert.equal(stillFrame.w, sizes.still, `${animal} still frame width matches the measurement`);
  }
  // And the guarantee holds frame by frame, not merely on average: the cells alternate 443 and
  // 444 across the columns, so each individual stride is checked against the still it replaces.
  for (const animal of ['lamb', 'sheep', 'calf', 'cow'] as const) {
    const atlas = animal === 'lamb' || animal === 'sheep' ? 'animal-walk-3' : 'animal-walk-4';
    const standing = measured[animal]!.still * STILL_SCALE;
    for (let i = 0; i < WALK_STEPS; i++) {
      const frame = atlasFrames(atlas)[`${animal}-walk-${i + 1}`]!;
      const walking = frame.w * WALK_SCALE[animal];
      const drift = Math.abs(walking / standing - 1);
      assert.ok(drift < 0.02, `${animal} stride ${i + 1} is ${(drift * 100).toFixed(1)}% off the standing size`);
    }
  }
  // And one shared constant would not have done: the per-species scales differ enough that a
  // single value would be visibly wrong for at least one animal.
  const values = Object.values(WALK_SCALE);
  const spread = Math.max(...values) / Math.min(...values) - 1;
  assert.ok(spread > 0.2, `the scales genuinely differ, spread ${(spread * 100).toFixed(1)}%`);
});

test('the scene loads the walk atlases, or the herd would draw from nothing', () => {
  const scene = readFileSync(new URL('../src/render/TownScene.ts', import.meta.url), 'utf8');
  for (const atlas of ['animal-walk-3', 'animal-walk-4']) {
    assert.ok(GENERATED_ATLASES[atlas as keyof typeof GENERATED_ATLASES], `${atlas} is registered`);
    assert.match(scene, new RegExp(`'${atlas}'`), `${atlas} is loaded by the scene`);
  }
  // Every frame the helper can ask for must exist in the atlas it names.
  for (const kind of ['pasture', 'cowbarn'] as const) {
    for (const age of [0, 999]) {
      for (let step = 0; step < WALK_STEPS; step++) {
        const walk = livestockWalk(beast(kind, age), step)!;
        assert.ok(atlasFrames(walk.atlas)[walk.frame], `${kind} age ${age} step ${step} -> ${walk.atlas}/${walk.frame}`);
      }
    }
  }
});

test('the walk atlases are outside the startup precache budget, like the other optional art', () => {
  // They belong to the readiness pack, which is fetched on demand rather than shipped to every
  // player up front. This is context, not a rule the code must satisfy — but if the pack ever
  // moves into the precache the size budget changes, and this test is where that gets noticed.
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /readiness-2026-09/, 'the pack is named in the build config');
});
