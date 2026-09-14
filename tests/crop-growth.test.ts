import test from 'node:test';
import assert from 'node:assert/strict';
import { CROP_IDS, cropGrowthStage } from '../src/sim/farming.ts';
import { GENERATED_ATLASES } from '../src/sim/atlases.ts';

test('growth stages have stable boundaries and do not promise harvest before ready',()=>{
  assert.equal(cropGrowthStage(0,false),'sprouting');
  assert.equal(cropGrowthStage(.219,false),'sprouting');
  assert.equal(cropGrowthStage(.22,false),'growing');
  assert.equal(cropGrowthStage(.719,false),'growing');
  assert.equal(cropGrowthStage(.72,false),'ripening');
  assert.equal(cropGrowthStage(1,false),'ripening');
  assert.equal(cropGrowthStage(0,true),'ready');
});

test('fallow fields do not imply active growing, and replanting restarts the visual cycle',()=>{
  assert.equal(cropGrowthStage(.8,false,true),'fallow');
  assert.equal(cropGrowthStage(1,true),'ready');
  assert.equal(cropGrowthStage(0,false,false),'sprouting');
});

test('every selectable crop has an in-bounds growing frame and ground anchor',()=>{
  const atlas=GENERATED_ATLASES['crops-growing'];
  assert.deepEqual(Object.keys(atlas.frames),[...CROP_IDS]);
  for(const crop of CROP_IDS){
    const f=atlas.frames[crop];
    assert.ok(f.x>=0&&f.y>=0&&f.w>0&&f.h>0);
    assert.ok(f.x+f.w<=atlas.width&&f.y+f.h<=atlas.height);
    assert.ok(f.anchor>0&&f.anchor<1);
  }
});
