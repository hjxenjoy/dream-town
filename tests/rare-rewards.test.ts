import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld,validateSave } from '../src/sim/world.ts';
import { rareCount } from '../src/sim/rareRewards.ts';
function rare(w:SimWorld,n:number){const f=w.state.farming!;f.rare.carrot=n;f.album.carrot=n;f.harvested=n;}
test('rare ornaments unlock without completing street projects and do not consume the album',()=>{
 const w=new SimWorld();assert.ok(w.ornamentLock('harvestpile'));rare(w,5);
 assert.equal(w.ornamentLock('harvestpile'),null);assert.ok(w.ornamentLock('flowercart'));
 w.state.coins=10000;w.state.capacity=10000;w.state.resources.wood=100;w.state.resources.stone=100;
 assert.ok(w.build('harvestpile',40,22).ok);assert.equal(rareCount(w.state.farming),5);assert.equal(validateSave(w.state),true);
 assert.equal(new SimWorld(w.state).ornamentLock('harvestpile'),null);
});
test('rare home styles enforce thresholds, cost nothing and reject forged saves',()=>{
 const w=new SimWorld(),b=w.state.buildings.find(b=>b.kind==='cottage')!;
 rare(w,29);assert.equal(w.setHomeStyle(b.id,'mint').ok,false);
 rare(w,30);const coins=w.state.coins;assert.equal(w.setHomeStyle(b.id,'mint').ok,true);assert.equal(w.state.coins,coins);assert.equal(rareCount(w.state.farming),30);
 assert.equal(validateSave(w.state),true);assert.equal(new SimWorld(w.state).state.buildings.find(v=>v.id===b.id)!.homeStyle,'mint');
 rare(w,29);assert.equal(validateSave(w.state),false);
 rare(w,100);assert.equal(w.setHomeStyle(b.id,'harvest').ok,true);assert.equal(w.setHomeStyle(b.id,'rose').ok,true);
});
