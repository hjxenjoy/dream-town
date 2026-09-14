import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { DISTRICT_KEYS, DISTRICTS, terrainAt, riverX, districtAt, preferredDistrict, BRIDGES } from '../src/sim/terrain.ts';
import { executeGameTool } from '../src/sim/tools.ts';

test('the expanded valley has buildable areas in all four districts and on both banks',()=>{
  const counts={residential:0,agriculture:0,industry:0,mining:0};
  for(let x=1;x<=46;x++)for(let y=1;y<=46;y++)if(terrainAt(x,y)==='land')counts[districtAt(x,y)]++;
  for(const id of DISTRICT_KEYS)assert.ok(counts[id]>256,`${id} is larger than the previous entire town`);
  assert.ok(Object.values(counts).reduce((a,b)=>a+b,0)>1800);
  assert.equal(terrainAt(46,40),'land');assert.equal(terrainAt(65,40),'outside');
});

test('the river is continuous, with two reserved bridge crossings and northern mountains',()=>{
  for(let y=1;y<=46;y++)assert.equal(terrainAt(Math.round(riverX(y)),y),BRIDGES.includes(y as 15|33)?'bridge':'water');
  assert.equal(terrainAt(35,3),'mountain');assert.equal(terrainAt(34,10),'land');
});

test('construction and relocation reject water, bridges and peaks without charging or losing progress',()=>{
  const world=new SimWorld(),building=world.state.buildings.find(b=>b.kind==='cottage')!;
  for(const [x,y] of [[22,25],[Math.round(riverX(15)),15],[35,3],[0,3],[65,40]]){
    const before=JSON.stringify(world.state);
    assert.equal(world.build('garden',x,y).ok,false);assert.equal(world.moveBuilding(building.id,x,y).ok,false);
    assert.equal(JSON.stringify(world.state),before);
  }
});

test('free relocation across the river preserves all building properties and can be reversed',()=>{
  const world=new SimWorld(),building=world.state.buildings.find(b=>b.kind==='windmill')!;
  const before=structuredClone(building),coins=world.state.coins,resources={...world.state.resources};
  assert.equal(world.moveBuilding(building.id,40,40).ok,true);
  assert.deepEqual(building,{...before,x:40,y:40});assert.equal(world.state.coins,coins);assert.deepEqual(world.state.resources,resources);
  assert.equal(world.moveBuilding(building.id,before.x,before.y).ok,true);assert.deepEqual(building,before);
  assert.equal(validateSave(world.state),true);
});

test('district arrangement is collision-free, preserves homes and does not reset harvested or running factories',()=>{
  const world=new SimWorld(),before=structuredClone(world.state);
  world.moveBuilding(world.state.buildings.find(b=>b.kind==='lumber')!.id,6,3);
  assert.equal(world.arrangeDistricts().ok,true);
  for(const b of world.state.buildings){
    const original=before.buildings.find(v=>v.id===b.id)!;
    if(preferredDistrict(b.kind)==='residential')assert.deepEqual(b,original);
    else {assert.equal(districtAt(b.x,b.y),preferredDistrict(b.kind));assert.deepEqual({...b,x:original.x,y:original.y},original);}
  }
  assert.equal(new Set(world.state.buildings.map(b=>`${b.x},${b.y}`)).size,world.state.buildings.length);
  assert.deepEqual(world.state.resources,before.resources);assert.equal(world.state.coins,before.coins);
  assert.equal(validateSave(world.state),true);
});

test('all districts are reachable by validated agent coordinates and saves retain relocated layouts',()=>{
  const world=new SimWorld(),id=world.state.buildings.find(b=>b.kind==='garden')!.id;
  for(const key of DISTRICT_KEYS){const {x,y}=DISTRICTS[key];const result=executeGameTool(world,'move_building',{buildingId:id,x:x+3,y:y+4});assert.equal(result.ok,true);}
  const restored=new SimWorld(world.state);assert.deepEqual(restored.state.buildings,world.state.buildings);
  const bad=structuredClone(world.state);bad.buildings[0].x=22;bad.buildings[0].y=25;
  assert.equal(validateSave(bad),false);
});

test('arrangement has a saved undo and restores the exact previous coordinates without rewinding production',()=>{
  const world=new SimWorld();world.moveBuilding(world.state.buildings.find(b=>b.kind==='farm')!.id,6,4);
  const original=world.state.buildings.map(({id,x,y})=>({id,x,y}));
  world.arrangeDistricts();world.tick(10);const restored=new SimWorld(world.state);
  const progress=restored.state.buildings.map(b=>b.progress);
  assert.equal(restored.undoArrangement().ok,true);
  assert.deepEqual(restored.state.buildings.map(({id,x,y})=>({id,x,y})),original);
  assert.deepEqual(restored.state.buildings.map(b=>b.progress),progress);
  assert.equal(restored.state.layoutUndo,undefined);assert.equal(validateSave(restored.state),true);
});
