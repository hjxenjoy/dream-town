import test from 'node:test';
import assert from 'node:assert/strict';
import { CROP_IDS, cropGrowthStage, cropStageFrame } from '../src/sim/farming.ts';
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

/**
 * A field shows four stages of art, so the mapping from a progress value to a frame is the
 * whole contract: read the sweep left to right and the art must climb exactly once through
 * sprout, young, growing, ripe, never skipping or repeating a sheet.
 */
test('every selectable crop climbs through four in-bounds stage frames and leaves fallow bare',()=>{
  const sweep=[[0,false],[.5,false],[.9,false],[1,true]] as const;
  for(const crop of CROP_IDS){
    const stages=sweep.map(([progress,ready])=>cropGrowthStage(progress,ready));
    const art=stages.map(stage=>cropStageFrame(crop,stage));
    assert.deepEqual(art.map(a=>a?.frame),[`${crop}-sprout`,`${crop}-young`,`${crop}-growing`,`${crop}-ripe`]);
    assert.equal(cropStageFrame(crop,cropGrowthStage(.5,false,true)),null,'a fallow field draws no crop art');
    assert.equal(cropStageFrame(crop,'fallow'),null);
    for(const entry of art){
      const atlas=GENERATED_ATLASES[entry!.atlas];
      const frame=atlas.frames[entry!.frame];
      assert.ok(frame,`${entry!.frame} is missing from ${entry!.atlas}`);
      assert.ok(frame.x>=0&&frame.y>=0&&frame.w>0&&frame.h>0);
      assert.ok(frame.x+frame.w<=atlas.width&&frame.y+frame.h<=atlas.height,`${entry!.frame} is outside its sheet`);
      // The renderer anchors on the pack's own origin, so it must exist and be normalised.
      assert.ok(frame.origin&&frame.origin[0]>0&&frame.origin[0]<1&&frame.origin[1]>0&&frame.origin[1]<=1);
      assert.ok(entry!.soilWidth>0&&entry!.soilWidth<=frame.w,'the plot is measured inside its own frame');
    }
  }
});
