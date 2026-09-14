import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, type Building } from '../src/sim/world.ts';
import { growHomes } from '../src/sim/homeGrowth.ts';
const home=(id:string):Building=>({id,kind:'cottage',x:6,y:6,level:1,progress:0,ready:false,paused:false,stock:{}});
test('only occupied habitable homes grow; moving preserves stable occupancy',()=>{
 const a=home('a'),b=home('b');growHomes([b,a],1,600);
 assert.equal(a.livedSeconds,600);assert.equal(b.livedSeconds,undefined);
 a.x=30;a.y=30;growHomes([b,a],1,600);assert.equal(a.livedSeconds,1200);
 a.damaged=true;growHomes([b,a],1,600);assert.equal(a.livedSeconds,1200);assert.equal(b.livedSeconds,600);
 growHomes([b],0,600);assert.equal(b.livedSeconds,600);
});
test('home styles unlock naturally, are free and round trip in a save',()=>{
 const w=new SimWorld();const b=w.state.buildings.find(b=>b.kind==='cottage')!;
 assert.ok(b);assert.equal(w.setHomeStyle(b.id,'flowers').ok,false);
 growHomes([b],1,1800);const coins=w.state.coins;
 assert.equal(w.setHomeStyle(b.id,'courtyard').ok,true);assert.equal(w.state.coins,coins);
 assert.equal(w.setHomeStyle(b.id,'laundry').ok,false);
 assert.equal(w.setHomeStyle(b.id,'unknown').ok,false);
 assert.equal(validateSave(w.state),true);
 const restored=new SimWorld(w.state).state.buildings.find(v=>v.id===b.id)!;
 assert.equal(restored.homeStyle,'courtyard');assert.equal(restored.livedSeconds,1800);
 b.livedSeconds=-1;assert.equal(validateSave(w.state),false);
});
test('online and offline both accumulate home time without exceeding final unlock',()=>{
 const a=new SimWorld(),b=new SimWorld(a.state);
 a.state.settings.disasters=false;b.state.settings.disasters=false;
 a.tick(30);b.offline(30);
 const ages=(w:SimWorld)=>w.state.buildings.filter(b=>b.kind==='cottage').map(b=>b.livedSeconds);
 assert.deepEqual(ages(a),ages(b));assert.ok(ages(a).some(age=>age===30));
 const h=home('c');growHomes([h],1,10000);assert.equal(h.livedSeconds,3600);
});
