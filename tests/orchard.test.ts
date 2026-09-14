import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { growOrchards, recordOrchard, orchardStage, orchardVarieties } from '../src/sim/orchard.ts';
function town(){const w=new SimWorld();w.state.coins=100000;w.state.capacity=10000;w.state.resources.wood=100;w.state.resources.stone=100;assert.ok(w.build('orchardhouse',40,22).ok);w.state.settings.disasters=false;return w;}
test('orchard records survive saves, preserve paused age and unlock variety records',()=>{
 const w=town(),b=w.state.buildings.find(b=>b.kind==='orchardhouse')!;
 growOrchards([b],600);recordOrchard(b,8);assert.equal(orchardVarieties(b.orchardHarvests).length,2);
 b.paused=true;growOrchards([b],600);assert.equal(b.treeAge,600);
 recordOrchard(b,22);assert.equal(orchardVarieties(b.orchardHarvests).length,3);
 assert.equal(validateSave(w.state),true);const copy=new SimWorld(w.state).state.buildings.find(v=>v.id===b.id)!;
 assert.equal(copy.treeAge,600);assert.equal(copy.orchardHarvests,30);
 b.orchardHarvests=-1;assert.equal(validateSave(w.state),false);
});
test('completed fruit is recorded once, collection does not count again',()=>{
 const w=town(),b=w.state.buildings.find(b=>b.kind==='orchardhouse')!;
 b.workers=1;b.progress=.999;w.tick(1);assert.equal(b.orchardHarvests,1);
 w.collect(b.id);assert.equal(b.orchardHarvests,1);
 assert.equal(orchardStage(.1,false),'枝叶生长');assert.equal(orchardStage(.5,false),'满树花开');assert.equal(orchardStage(0,true),'果实渐熟');
});
test('offline orchard records match its completed fruit batches',()=>{
 const w=town(),b=w.state.buildings.find(b=>b.kind==='orchardhouse')!;b.workers=1;
 const report=w.offline(160);assert.ok((b.orchardHarvests??0)>0);
 assert.equal(report.produced.fruit,(b.orchardHarvests??0)*5);assert.equal(b.treeAge,160);
});
