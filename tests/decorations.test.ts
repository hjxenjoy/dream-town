import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, DECORATION_SPRITES } from '../src/sim/data.ts';
import { executeGameTool } from '../src/sim/tools.ts';

function prepared() {
  const w=new SimWorld();w.state.coins=50000;w.state.capacity=3000;
  w.state.resources.wood=500;w.state.resources.stone=500;
  return w;
}

test('all eight decorations build, cost their exact materials, improve environment and restore from saves',()=>{
  const w=prepared();const before=w.observe().needs.environment;
  for(const [i,kind] of DECORATION_SPRITES.entries()){
    const def=BUILDINGS[kind],coins=w.state.coins,wood=w.state.resources.wood,stone=w.state.resources.stone;
    const result=w.build(kind,37+i%4,40+Math.floor(i/4));
    assert.equal(result.ok,true,result.message);
    assert.equal(w.state.coins,coins-def.cost);assert.equal(w.state.resources.wood,wood-def.wood);assert.equal(w.state.resources.stone,stone-def.stone);
    const b=w.state.buildings.find(b=>b.id===result.buildingId)!;
    assert.equal(b.workers,0);assert.equal(b.ready,false);assert.equal(BUILDINGS[b.kind].cycle,undefined);
  }
  assert.ok(w.observe().needs.environment>before);
  assert.equal(validateSave(w.state),true);
  assert.deepEqual(new SimWorld(w.state).state.buildings,w.state.buildings);
});

test('every decoration rejects construction and movement onto roads without charging or changing its state',()=>{
  const w=prepared(),road={x:40,y:44};w.paveRoad(road,road,'stone');
  for(const [i,kind] of DECORATION_SPRITES.entries()){
    let before=JSON.stringify(w.state);
    assert.equal(w.build(kind,road.x,road.y).code,'ROAD_OCCUPIED');assert.equal(JSON.stringify(w.state),before);
    const result=w.build(kind,37+i%4,40+Math.floor(i/4));assert.equal(result.ok,true);
    before=JSON.stringify(w.state);
    assert.equal(w.moveBuilding(result.buildingId!,road.x,road.y).code,'ROAD_OCCUPIED');assert.equal(JSON.stringify(w.state),before);
    assert.equal(w.placementIssue(road.x,road.y,result.buildingId)?.code,'ROAD_OCCUPIED');
  }
  assert.equal(validateSave(w.state),true);
});

test('roads cannot cross trees or decorative buildings, and relocation releases their old tiles',()=>{
  const w=prepared(),result=w.build('cherry',38,40);assert.equal(result.ok,true);
  let before=JSON.stringify(w.state);
  assert.equal(w.paveRoad({x:37,y:40},{x:40,y:40},'dirt').code,'TILE_OCCUPIED');assert.equal(JSON.stringify(w.state),before);
  const coins=w.state.coins,resources={...w.state.resources};
  assert.equal(executeGameTool(w,'move_building',{buildingId:result.buildingId,x:39,y:41}).ok,true);
  assert.equal(w.state.coins,coins);assert.deepEqual(w.state.resources,resources);
  assert.equal(w.paveRoad({x:37,y:40},{x:40,y:40},'dirt').ok,true);
  before=JSON.stringify(w.state);
  assert.equal(w.moveBuilding(result.buildingId!,38,40).code,'ROAD_OCCUPIED');assert.equal(JSON.stringify(w.state),before);
  assert.equal(validateSave(w.state),true);
});

test('moving a mature upgraded factory preserves all production state and rejects occupied or invalid land',()=>{
  const w=prepared(),b=w.state.buildings.find(b=>b.kind==='lumber')!;
  b.level=3;b.productionFocus='plank';b.progress=1;b.ready=true;b.stock={wood:2,plank:4};
  const original={...b,stock:{...b.stock}},resources={...w.state.resources},coins=w.state.coins;
  for(const tile of [{x:w.state.buildings[0].x,y:w.state.buildings[0].y},{x:22,y:25},{x:32,y:2},{x:NaN,y:10}]){
    const before=JSON.stringify(w.state);assert.equal(w.moveBuilding(b.id,tile.x,tile.y).ok,false);assert.equal(JSON.stringify(w.state),before);
  }
  assert.equal(w.moveBuilding(b.id,39,43).ok,true);
  assert.deepEqual(b,{...original,x:39,y:43});assert.deepEqual(w.state.resources,resources);assert.equal(w.state.coins,coins);
  assert.deepEqual(new SimWorld(w.state).state.buildings.find(v=>v.id===b.id),b);
});

test('decorations are preserved by district arrangement and road overlaps cannot enter through imports',()=>{
  const w=prepared(),result=w.build('gazebo',38,40),b=w.state.buildings.find(b=>b.id===result.buildingId)!;
  const original={...b};w.arrangeDistricts();assert.deepEqual(b,original);
  const invalid=structuredClone(w.state);invalid.roads!.push({x:b.x,y:b.y,kind:'dirt'});
  assert.equal(validateSave(invalid),false);assert.throws(()=>new SimWorld(invalid));
  assert.equal(validateSave(w.state),true);
});
