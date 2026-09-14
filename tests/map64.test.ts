import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainAt, riverX, BRIDGES, PLAYABLE_SIZE } from '../src/sim/terrain.ts';
import { TownNavigation } from '../src/sim/navigation.ts';
import { roadLine } from '../src/sim/roads.ts';
import { SimWorld, validateSave } from '../src/sim/world.ts';

test('expansion preserves every original terrain cell',()=>{
  for(let x=1;x<=46;x++)for(let y=1;y<=46;y++){
    const original=Math.abs(x-riverX(y))<1.7?(BRIDGES.some(row=>row===y)?'bridge':'water'):(x>=29&&y<=5||x>=43&&y<=17)?'mountain':'land';
    assert.equal(terrainAt(x,y),original,`${x},${y}`);
  }
});
test('new southeast corner supports paths, road planning and save coordinates',()=>{
  assert.equal(PLAYABLE_SIZE,64);
  assert.equal(terrainAt(64,64),'land');
  assert.equal(terrainAt(65,64),'outside');
  const nav=new TownNavigation([]),start={x:60,y:60},end={x:64,y:64};
  assert.deepEqual(nav.nearest(end),end);
  const path=nav.path(start,end);
  assert.equal(path.length,9);
  assert.deepEqual(path.at(-1),end);
  assert.equal(roadLine(start,end).length,9);
  const world=new SimWorld();
  world.state.buildings[0].x=64;world.state.buildings[0].y=64;
  assert.equal(validateSave(world.state),true);
});

test('regions open once through natural levels, without spending resources',()=>{
  const world=new SimWorld();
  const before=JSON.stringify(world.state);
  assert.equal(world.moveBuilding(world.state.buildings[0].id,60,60).ok,false);
  assert.equal(JSON.stringify(world.state),before);
  world.state.level=8;
  const coins=world.state.coins,resources={...world.state.resources};
  assert.equal(world.openRegion('east').ok,true);
  assert.equal(world.openRegion('east').ok,false);
  assert.equal(world.moveBuilding(world.state.buildings[0].id,60,60).ok,true);
  assert.equal(world.state.coins,coins);
  assert.deepEqual(world.state.resources,resources);
  assert.equal(validateSave(world.state),true);
  const restored=new SimWorld(world.state);
  assert.deepEqual(restored.state.regions,['east']);
});

test('existing expansion buildings remain usable when an intermediate save lacks region data',()=>{
  const world=new SimWorld();world.state.buildings[0].x=60;world.state.buildings[0].y=60;
  delete world.state.regions;
  const restored=new SimWorld(world.state);
  assert.equal(restored.regionIssue(60,60),null);
  assert.equal(restored.regionIssue(10,60)!==null,true);
});
