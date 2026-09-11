import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MACHINE_PARTS, PART_WIDTH, machinePivot, partAngle, partLayout } from '../src/sim/machines.ts';
import { atlasFrames } from '../src/sim/atlases.ts';
import { BUILDINGS, TECHNOLOGY_KEYS, emptyResources } from '../src/sim/data.ts';
import { SimWorld } from '../src/sim/world.ts';

test('each moving part belongs to a workshop that has a production cycle',()=>{
  for(const [kind,part] of Object.entries(MACHINE_PARTS)){
    assert.ok(BUILDINGS[kind as keyof typeof BUILDINGS],`${kind} is a real building`);
    assert.ok(BUILDINGS[kind as keyof typeof BUILDINGS].cycle,`${kind} actually produces something to visualise`);
    assert.ok(part.spin>0||part.swing!==undefined,`${part.frame} either spins or swings`);
    assert.ok(part.attach.x>0&&part.attach.x<1&&part.attach.y>0&&part.attach.y<1,`${part.frame} attaches inside the sprite box`);
  }
});

test('a spinning part turns over time and a stopped one holds its angle',()=>{
  const rotor=MACHINE_PARTS.windmill!;
  assert.ok(rotor.spin>0);
  const at=partAngle(1,rotor.spin,rotor.swing);
  const later=partAngle(2,rotor.spin,rotor.swing);
  assert.notEqual(at,later,'a running rotor changes angle');
  assert.equal(partAngle(0,rotor.spin,rotor.swing),0,'it starts from zero');
  // Angle stays in one revolution so the rotation never grows without bound.
  assert.ok(partAngle(1000,rotor.spin,rotor.swing)<360);
});

test('a swinging part stays within its own amplitude',()=>{
  const hammer=MACHINE_PARTS.smithy!;
  assert.ok(hammer.swing!>0,'the hammer swings rather than spinning');
  assert.equal(partAngle(0,hammer.spin,hammer.swing),0);
  for(let t=0;t<40;t+=.05){
    const angle=partAngle(t,hammer.spin,hammer.swing);
    assert.ok(Math.abs(angle)<=hammer.swing!+1e-9,`angle ${angle} stays within ${hammer.swing}`);
  }
  // It genuinely reverses direction rather than creeping one way.
  const samples=Array.from({length:60},(_,i)=>partAngle(i*.1,hammer.spin,hammer.swing));
  assert.ok(Math.max(...samples)>0&&Math.min(...samples)<0,'it swings both ways');
});

test('each part pivot comes from the generated catalog and lies inside its frame',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../public/assets/machine-layers-frames.json',import.meta.url),'utf8'));
  for(const part of Object.values(MACHINE_PARTS)){
    const meta=catalog.frames[part.frame];
    assert.ok(meta,`${part.frame} exists in the atlas`);
    const pivot=machinePivot(part.frame)!;
    assert.ok(pivot,`${part.frame} has a pivot`);
    assert.ok(pivot.x>=0&&pivot.x<=meta.w,`${part.frame} pivot x inside the frame`);
    assert.ok(pivot.y>=0&&pivot.y<=meta.h,`${part.frame} pivot y inside the frame`);
    // And it matches the catalog rather than being recomputed from the frame size.
    assert.equal(pivot.x,meta.pivot[0]);
    assert.equal(pivot.y,meta.pivot[1]);
  }
  assert.equal(machinePivot('no-such-frame'),null,'an unknown frame has no pivot');
});

test('a workshop only reports as running while it is actually producing',()=>{
  // The renderer keys off the same set the scene already maintains: a building counts
  // as working only when its cycle advanced and it is neither paused nor damaged.
  const w=new SimWorld();
  w.state.capacity=20000;
  w.state.resources={...emptyResources(),wood:600,stone:600,materials:200,bread:200,fish:200,wheat:600};
  w.state.researched=[...TECHNOLOGY_KEYS];
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  const mill=w.state.buildings.find(b=>b.kind==='windmill');
  assert.ok(mill,'the town starts with a windmill');
  mill!.paused=false;mill!.workers=BUILDINGS.windmill.workers!;
  w.tick(1);
  const before=mill!.progress;
  w.tick(BUILDINGS.windmill.cycle);
  assert.ok(mill!.progress>before||mill!.ready,'the mill made progress, so its sails would turn');
  mill!.paused=true;
  const held=mill!.progress;
  w.tick(BUILDINGS.windmill.cycle);
  assert.equal(mill!.progress,held,'a paused mill makes no progress, so its sails hold still');
});

test('a part is drawn at its intended size no matter how large its atlas cell is',()=>{
  // Regression: the renderer positioned parts assuming a scaled size but never applied
  // the scale, so a part from a 444px cell drew at 444px — a fishing rod spanning the map.
  const frames=atlasFrames('machine-layers');
  const widths=new Set<number>();
  for(const part of Object.values(MACHINE_PARTS)){
    const frame=frames[part.frame]!;
    const layout=partLayout(frame,part.attach);
    assert.equal(layout.width,PART_WIDTH,`${part.frame} is drawn ${PART_WIDTH}px wide`);
    assert.equal(layout.scale,PART_WIDTH/frame.w,`${part.frame} scale divides out its cell width`);
    widths.add(Math.round(layout.width));
  }
  assert.equal(widths.size,1,'every part renders at the same width regardless of cell size');

  // And the drawn box stays in proportion to a building, rather than dwarfing the map.
  const tallest=Math.max(...Object.values(frames).map(f=>f.h));
  const worst=Math.max(...Object.values(MACHINE_PARTS).map(part=>partLayout(frames[part.frame]!,part.attach).height));
  assert.ok(worst<PART_WIDTH*2,`the tallest part is ${worst.toFixed(0)}px, still under twice its width`);
  assert.ok(tallest>worst,'no part is drawn at its raw atlas size');
});

test('the drawn size and the position agree, so a part never drifts off its building',()=>{
  // The offset must come from the same scale the sprite is drawn at. If they disagree,
  // a part hangs off its building instead of sitting on it.
  for(const part of Object.values(MACHINE_PARTS)){
    const frame=atlasFrames('machine-layers')[part.frame]!;
    const layout=partLayout(frame,part.attach);
    assert.ok(Math.abs(layout.offsetX/layout.width-(part.attach.x-.5))<1e-9,`${part.frame} horizontal offset uses its own width`);
    assert.ok(Math.abs(layout.offsetY/layout.height-(part.attach.y-1))<1e-9,`${part.frame} vertical offset uses its own height`);
    // The pivot is the origin, so the box extends around a point one attachment
    // fraction above the building base: the whole part stays near its building.
    const pivot=machinePivot(part.frame)!;
    const boxTop=layout.offsetY-pivot.y*layout.scale;
    const boxBottom=boxTop+layout.height;
    assert.ok(boxTop>-PART_WIDTH*2.5&&boxBottom<PART_WIDTH*1.5,`${part.frame} box spans ${boxTop.toFixed(0)}..${boxBottom.toFixed(0)} relative to its base`);
  }
});
