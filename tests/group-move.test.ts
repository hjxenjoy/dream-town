import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld } from '../src/sim/world.ts';

function group(){
  const w=new SimWorld();w.state.regions=['east'];w.state.roads=[];
  w.state.buildings=w.state.buildings.slice(0,2);
  w.state.buildings.forEach((b,i)=>{b.x=50+i;b.y=50;b.progress=.4;});
  return w;
}
test('group movement permits destinations vacated by another member and keeps all properties',()=>{
  const w=group(),before=structuredClone(w.state.buildings);
  assert.equal(w.moveBuildings(before.map(b=>b.id),1,0).ok,true);
  assert.deepEqual(w.state.buildings,before.map(b=>({...b,x:b.x+1})));
  assert.equal(w.undoArrangement().ok,true);
  assert.deepEqual(w.state.buildings,before);
});
test('one obstructed destination rejects the entire group without mutating the save',()=>{
  const w=group();w.state.roads=[{x:52,y:50,kind:'dirt'}];
  const before=JSON.stringify(w.state);
  assert.equal(w.moveBuildings(w.state.buildings.map(b=>b.id),1,0).ok,false);
  assert.equal(JSON.stringify(w.state),before);
});
test('invalid groups and locked regions cannot bypass placement rules',()=>{
  const w=group(),id=w.state.buildings[0].id;
  for(const ids of [[],[id,id],['missing']])assert.equal(w.moveBuildings(ids,1,0).ok,false);
  assert.equal(w.moveBuildings([id],NaN,0).ok,false);
  assert.equal(w.moveBuildings([id],100,0).ok,false);
  assert.equal(w.moveBuildings([id],-40,0).ok,false);
});
