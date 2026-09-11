import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { CART_PARK_FRAMES, CART_TRAVEL_FRAMES, caravanPose, caravanRoute } from '../src/sim/caravan.ts';
import { terrainAt } from '../src/sim/terrain.ts';
import { emptyResources, RESOURCE_KEYS } from '../src/sim/data.ts';

function prepared(){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=10000;
  w.state.resources={...emptyResources(),bread:200,plank:200,fish:200,materials:0};
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  return w;
}

test('the cart route starts at the market and stays on walkable ground',()=>{
  const w=prepared();
  const route=caravanRoute(w.state.buildings,w.state.roads??[]);
  assert.ok(route.length>2,'a market town produces a real route');
  const market=w.state.buildings.find(b=>b.kind==='market')!;
  const start=route[0]!;
  assert.equal(Math.abs(start.x-market.x)+Math.abs(start.y-market.y),1,'the route begins at a market entrance');
  for(const tile of route){
    const type=terrainAt(tile.x,tile.y);
    assert.ok(type==='land'||type==='bridge',`route tile ${tile.x},${tile.y} is walkable, got ${type}`);
  }
  // Consecutive tiles must be four-neighbour steps, never diagonal jumps.
  for(let i=1;i<route.length;i++){
    const step=Math.abs(route[i]!.x-route[i-1]!.x)+Math.abs(route[i]!.y-route[i-1]!.y);
    assert.equal(step,1,`step ${i} is a single four-neighbour move`);
  }
});

test('the route crosses the river rather than stopping at the near bank',()=>{
  const w=prepared();
  const route=caravanRoute(w.state.buildings,w.state.roads??[]);
  assert.ok(route.some(tile=>terrainAt(tile.x,tile.y)==='bridge'),'the journey uses a bridge');
  const far=route[route.length-1]!;
  const crossed=route.some(tile=>tile.x>25);
  assert.ok(crossed||far.x>25,`the cart reaches the far bank (ended at ${far.x},${far.y})`);
});

test('a town without a market has no route, and the cart never invents one',()=>{
  const w=prepared();
  w.state.buildings=w.state.buildings.filter(b=>b.kind!=='market');
  assert.deepEqual(caravanRoute(w.state.buildings,w.state.roads??[]),[]);
});

test('route geometry follows the town: moving the market changes the start',()=>{
  const w=prepared();
  const market=w.state.buildings.find(b=>b.kind==='market')!;
  const before=caravanRoute(w.state.buildings,w.state.roads??[])[0]!;
  assert.equal(w.moveBuilding(market.id,12,14).ok,true);
  const after=caravanRoute(w.state.buildings,w.state.roads??[]);
  assert.ok(after.length>2,'still routable after the move');
  assert.notDeepEqual(after[0],before,'the route now starts from the new location');
});

test('the cart parks empty when idle, waits with goods when returned, and drives while away',()=>{
  const w=prepared();
  const route=caravanRoute(w.state.buildings,w.state.roads??[]);
  const c=w.state.caravan;

  c.status='idle';
  const idle=caravanPose(c,route,w.state.gameTime);
  assert.equal(idle.load,'empty');assert.equal(idle.moving,false);assert.equal(idle.direction,'none');
  assert.deepEqual({x:idle.x,y:idle.y},{x:route[0]!.x,y:route[0]!.y},'an idle cart waits at the market');

  assert.equal(w.dispatchCaravan().ok,true);
  const dispatched=w.state.caravan;
  const start=caravanPose(dispatched,route,w.state.gameTime);
  assert.equal(start.load,'loaded');assert.equal(start.moving,true);assert.equal(start.direction,'out');
  assert.deepEqual({x:start.x,y:start.y},{x:route[0]!.x,y:route[0]!.y},'it sets out from the market entrance');

  // Halfway through, the cart is at the far end of its road.
  const middle=caravanPose(dispatched,route,w.state.gameTime+dispatched.duration/2);
  const end=route[route.length-1]!;
  assert.ok(Math.abs(middle.x-end.x)<1.5&&Math.abs(middle.y-end.y)<1.5,`midpoint is the far bank, got ${middle.x},${middle.y}`);

  // Past the midpoint it turns around and heads home.
  const homeward=caravanPose(dispatched,route,w.state.gameTime+dispatched.duration*.75);
  assert.equal(homeward.direction,'back');

  w.state.gameTime=dispatched.returnAt;
  w.tick(.1);
  assert.equal(w.state.caravan.status,'returned');
  const returned=caravanPose(w.state.caravan,route,w.state.gameTime);
  assert.equal(returned.load,'unloading');assert.equal(returned.waiting,true);assert.equal(returned.moving,false);
  assert.deepEqual({x:returned.x,y:returned.y},{x:route[0]!.x,y:route[0]!.y},'it is back at the market with goods to hand over');
});

test('the cart is always drawn somewhere on its own route while it travels',()=>{
  const w=prepared();
  const route=caravanRoute(w.state.buildings,w.state.roads??[]);
  w.dispatchCaravan();
  const c=w.state.caravan;
  for(let step=0;step<=20;step++){
    const time=w.state.gameTime+c.duration*(step/20);
    const pose=caravanPose(c,route,time);
    // A bilinear point on a step of the route is within one tile of that step.
    const near=route.some(tile=>Math.abs(tile.x-pose.x)<=1.001&&Math.abs(tile.y-pose.y)<=1.001);
    assert.ok(near,`step ${step} at ${pose.x.toFixed(2)},${pose.y.toFixed(2)} stays on the route`);
    assert.ok(pose.x>=0&&pose.y>=0,'never leaves the valley');
  }
});

test('every cart frame the renderer asks for exists in the caravan atlas',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../public/assets/caravan-frames.json',import.meta.url),'utf8'));
  const available=new Set<string>(Object.keys(catalog.frames));
  for(const load of ['empty','loaded','unloading'] as const){
    for(const frame of [...CART_TRAVEL_FRAMES[load],...CART_PARK_FRAMES[load]]) assert.ok(available.has(frame),`${frame} exists`);
  }
});

test('dispatching and collecting the caravan leaves the simulation valid and conservation intact',()=>{
  const w=prepared();
  const before=RESOURCE_KEYS.reduce((n,k)=>n+w.state.resources[k],0);
  assert.equal(w.dispatchCaravan().ok,true);
  const dispatched=RESOURCE_KEYS.reduce((n,k)=>n+w.state.resources[k],0);
  assert.equal(before-dispatched,Object.values(w.state.caravan.cargo).reduce((a,b)=>a+(b??0),0),'exactly the cargo left the warehouse');
  w.state.gameTime=w.state.caravan.returnAt;
  w.tick(.1);
  assert.equal(w.dispatchCaravan().ok,true);
  assert.equal(validateSave(w.state),true);
});

test('the scene registers caravan frames, so the cart never falls back to the whole atlas',()=>{
  // A missing frame registration makes Phaser draw the base frame: the entire 4x3
  // atlas of twelve carts. The scene must therefore register every frame it uses.
  const scene=readFileSync(new URL('../src/render/TownScene.ts',import.meta.url),'utf8');
  const listed=/const SCENE_ATLASES = \[([^\]]*)\]/.exec(scene)?.[1] ?? '';
  const atlases=listed.split(',').map(part=>part.trim().replace(/['"]/g,'')).filter(Boolean);
  assert.ok(atlases.includes('caravan'),'the scene loads the caravan atlas');
  assert.match(scene,/for\(const atlas of SCENE_ATLASES\)\{[\s\S]*?atlasFrames\(atlas\)[\s\S]*?texture\.add\(/,'frames are registered from the catalog for every listed atlas');
  // And the cart renderer must ask for frames that vary, not a fixed base frame.
  const cart=readFileSync(new URL('../src/render/CaravanCart.ts',import.meta.url),'utf8');
  assert.match(cart,/setTexture\('caravan', frame\)/,'the cart sets an explicit frame');
});
