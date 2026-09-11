import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCE_KEYS, TECHNOLOGY_KEYS, emptyResources, type Resource } from '../src/sim/data.ts';
import { DESTINATIONS, DESTINATION_IDS, availableDestinations, caravanDuration, destinationOf, missingCargo, rewardRatio, type DestinationId } from '../src/sim/destinations.ts';
import { caravanRoute } from '../src/sim/caravan.ts';
import { terrainAt } from '../src/sim/terrain.ts';

function prepared(){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=40000;
  w.state.resources={...emptyResources(),bread:400,plank:400,fish:400,cloth:400,clothing:400,tools:400,wine:400,cheese:400,honey:400,materials:0};
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  w.state.researched=[...TECHNOLOGY_KEYS];
  return w;
}

test('every destination is well formed and distinct',()=>{
  const names=new Set<string>(),cargoes=new Set<string>();
  for(const id of DESTINATION_IDS){
    const destination=DESTINATIONS[id];
    assert.equal(destination.id,id);
    assert.ok(destination.name.length>0&&destination.description.length>0,`${id} is described`);
    assert.ok(destination.rewardCoins>0&&destination.rewardMaterials>0,`${id} pays something`);
    assert.ok(destination.duration>0,`${id} takes time`);
    assert.ok([15,33].includes(destination.bridge),`${id} crosses a real bridge`);
    const shipped=Object.keys(destination.cargo).sort().join(',');
    assert.ok(!cargoes.has(shipped),`${id} does not ship the same goods as another route`);
    cargoes.add(shipped);
    assert.ok(!names.has(destination.name));
    names.add(destination.name);
    for(const key of Object.keys(destination.cargo)) assert.ok(RESOURCE_KEYS.includes(key as Resource),`${id} ships a real good: ${key}`);
  }
});

test('a longer route pays more per item shipped and in total',()=>{
  const valley=DESTINATIONS.valley, hilltown=DESTINATIONS.hilltown, rivermouth=DESTINATIONS.rivermouth;
  assert.ok(hilltown.duration>valley.duration,'the hill town is further away');
  assert.ok(rivermouth.duration>hilltown.duration,'the river port is furthest');
  assert.ok(hilltown.rewardCoins>valley.rewardCoins,'and pays more');
  assert.ok(rivermouth.rewardCoins>hilltown.rewardCoins);
  assert.ok(rivermouth.rewardMaterials>valley.rewardMaterials,'the furthest route brings the most materials');
  for(const destination of [valley,hilltown,rivermouth]) assert.ok(rewardRatio(destination)>0);
});

test('routes unlock with research and the starting route is always available',()=>{
  const none=availableDestinations([]);
  assert.deepEqual(none.map(d=>d.id),['valley'],'a fresh town only knows the nearby village');
  assert.deepEqual(availableDestinations(['tailoring']).map(d=>d.id).sort(),['hilltown','valley']);
  assert.deepEqual(availableDestinations(['viniculture']).map(d=>d.id).sort(),['rivermouth','valley']);
  assert.equal(availableDestinations(TECHNOLOGY_KEYS).length,DESTINATION_IDS.length,'everything unlocks');
});

test('a locked route cannot be chosen, and the refusal costs nothing',()=>{
  const w=prepared();
  w.state.researched=[];
  const before=JSON.stringify(w.state);
  const refused=w.chooseCaravanDestination('rivermouth');
  assert.equal(refused.ok,false);
  assert.equal(refused.code,'DESTINATION_LOCKED');
  assert.equal(JSON.stringify(w.state),before,'nothing changed');
  assert.equal(w.chooseCaravanDestination('valley').ok,true,'the known route can still be chosen');
});

test('the chosen route decides the cargo, the duration and the reward',()=>{
  for(const id of DESTINATION_IDS){
    const w=prepared();
    assert.equal(w.chooseCaravanDestination(id).ok,true,`${id} is selectable`);
    const dispatched=w.dispatchCaravan();
    assert.equal(dispatched.ok,true,`${id} dispatches: ${dispatched.message}`);
    const caravan=w.state.caravan;
    assert.equal(caravan.destination,id);
    assert.deepEqual(caravan.cargo,DESTINATIONS[id].cargo,`${id} ships its own cargo`);
    assert.equal(caravan.rewardCoins,DESTINATIONS[id].rewardCoins);
    assert.equal(caravan.rewardMaterials,DESTINATIONS[id].rewardMaterials);

    // The cargo really left the warehouse, and exactly that much.
    const before=prepared().state.resources;
    for(const [key,amount] of Object.entries(DESTINATIONS[id].cargo) as [Resource,number][]){
      assert.equal(w.state.resources[key],before[key]-amount,`${id}: ${key} was loaded`);
    }
    // And collecting pays exactly what was promised.
    w.state.gameTime=caravan.returnAt;w.tick(0.1);
    assert.equal(w.state.caravan.status,'returned');
    const coins=w.state.coins, materials=w.state.resources.materials;
    assert.equal(w.dispatchCaravan().ok,true);
    assert.equal(w.state.coins,coins+DESTINATIONS[id].rewardCoins,`${id} paid its coins`);
    assert.equal(w.state.resources.materials,materials+DESTINATIONS[id].rewardMaterials,`${id} brought its materials`);
    assert.equal(validateSave(w.state),true);
  }
});

test('a missing cargo blocks departure and names what is short',()=>{
  const w=prepared();
  w.chooseCaravanDestination('rivermouth');
  for(const key of Object.keys(DESTINATIONS.rivermouth.cargo)) w.state.resources[key as Resource]=0;
  const before=JSON.stringify(w.state);
  const failed=w.dispatchCaravan();
  assert.equal(failed.ok,false);
  assert.equal(failed.code,'INSUFFICIENT_RESOURCES');
  assert.ok(Object.keys(DESTINATIONS.rivermouth.cargo).some(key=>failed.message.includes(key)||failed.message.length>0));
  assert.equal(JSON.stringify(w.state),before,'a refused dispatch changes nothing');
  // missingCargo agrees with the refusal.
  const missing=missingCargo(DESTINATIONS.rivermouth,w.state.resources);
  assert.deepEqual(Object.keys(missing).sort(),Object.keys(DESTINATIONS.rivermouth.cargo).sort());
});

test('the destination cannot change mid-journey',()=>{
  const w=prepared();
  w.chooseCaravanDestination('valley');
  assert.equal(w.dispatchCaravan().ok,true);
  const before=JSON.stringify(w.state.caravan);
  const refused=w.chooseCaravanDestination('rivermouth');
  assert.equal(refused.ok,false);
  assert.equal(refused.code,'CARAVAN_BUSY');
  assert.equal(JSON.stringify(w.state.caravan),before,'the route is fixed once it sets out');
});

test('each destination crosses its own bridge, so the route is visibly different',()=>{
  const w=prepared();
  const valley=caravanRoute(w.state.buildings,w.state.roads??[],DESTINATIONS.valley.bridge);
  const hilltown=caravanRoute(w.state.buildings,w.state.roads??[],DESTINATIONS.hilltown.bridge);
  assert.ok(valley.length>2&&hilltown.length>2,'both routes exist');
  for(const [name,route] of [['valley',valley],['hilltown',hilltown]] as const){
    for(const tile of route){
      const type=terrainAt(tile.x,tile.y);
      assert.ok(type==='land'||type==='bridge',`${name} stays walkable at ${tile.x},${tile.y}`);
    }
  }
  const valleyBridges=new Set(valley.filter(t=>terrainAt(t.x,t.y)==='bridge').map(t=>t.y));
  const hilltownBridges=new Set(hilltown.filter(t=>terrainAt(t.x,t.y)==='bridge').map(t=>t.y));
  assert.notDeepEqual([...valleyBridges],[...hilltownBridges],'the two routes use different crossings');
  assert.ok(valleyBridges.has(DESTINATIONS.valley.bridge),'the valley route uses the valley bridge');
  assert.ok(hilltownBridges.has(DESTINATIONS.hilltown.bridge),'the hill-town route uses the other bridge');
});

test('an unknown bridge falls back to the nearest one rather than failing',()=>{
  const w=prepared();
  const fallback=caravanRoute(w.state.buildings,w.state.roads??[],999);
  assert.ok(fallback.length>2,'a route is still produced');
  assert.ok(fallback.some(tile=>terrainAt(tile.x,tile.y)==='bridge'),'and it still crosses the river');
});

test('a save from before routes were selectable loads and defaults to the village',()=>{
  const w=prepared();
  const older=structuredClone(w.state) as unknown as Record<string, unknown>;
  delete (older.caravan as Record<string, unknown>).destination;
  assert.equal(validateSave(older),true,'an older save is still valid');
  const restored=new SimWorld(older);
  assert.equal(restored.state.caravan.destination,'valley','it defaults to the original route');
  assert.equal(restored.dispatchCaravan().ok,true,'and can set out immediately');
});

test('a save naming a route that does not exist is refused',()=>{
  const w=prepared();
  const corrupt=structuredClone(w.state) as unknown as Record<string, unknown>;
  (corrupt.caravan as Record<string, unknown>).destination='moon';
  assert.equal(validateSave(corrupt),false);
  const wrongType=structuredClone(w.state) as unknown as Record<string, unknown>;
  (wrongType.caravan as Record<string, unknown>).destination=7;
  assert.equal(validateSave(wrongType),false);
});

test('a better market shortens every route, and the harbour title shortens them further',()=>{
  const w=prepared();
  const market=w.state.buildings.find(b=>b.kind==='market')!;
  for(const id of DESTINATION_IDS){
    const destination=destinationOf(id);
    const slow=caravanDuration(destination,1,false);
    const fast=caravanDuration(destination,3,false);
    assert.ok(fast<slow,`${id} is quicker with a better market`);
    assert.ok(fast>=destination.duration*0.5,`${id} never drops below half its base time`);
    assert.ok(caravanDuration(destination,1,true)<slow,`${id} is quicker with the harbour title`);
    assert.equal(slow,destination.duration,`${id} base time is its level-1 duration`);
  }
  assert.ok(market.level>=1);
});

test('the tool surface exposes every route with its cargo and shortfall',()=>{
  const w=prepared();
  w.state.researched=['tailoring'];
  const routes=w.observe().caravanRoutes;
  assert.deepEqual(routes.map(r=>r.id).sort(),['hilltown','valley'],'only unlocked routes are offered');
  const chosen=routes.filter(r=>r.chosen);
  assert.equal(chosen.length,1,'exactly one route is marked as chosen');
  assert.equal(chosen[0]!.id,'valley','the default is the village');
  assert.equal(w.observe().caravanRoutes.every(r=>Object.keys(r.cargo).length>0),true);
});
