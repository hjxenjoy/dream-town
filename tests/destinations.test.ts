import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCE_KEYS, TECHNOLOGY_KEYS, emptyResources, type Resource } from '../src/sim/data.ts';
import { DESTINATIONS, DESTINATION_IDS, LAND_DESTINATION_IDS, CARAVAN_SLOT_LIMIT, CARAVAN_STANDING_FOR_EXTRA, availableDestinations, caravanDuration, destinationOf, missingCargo, type DestinationId } from '../src/sim/destinations.ts';

/** Reward per item shipped, so a longer route can be shown to be worth it. */
function rewardRatio(destination: typeof DESTINATIONS.valley): number {
  const shipped = Object.values(destination.cargo).reduce<number>((n, v) => n + (v ?? 0), 0);
  return shipped ? destination.rewardCoins / shipped : 0;
}
import { caravanRoute } from '../src/sim/caravan.ts';
import { terrainAt } from '../src/sim/terrain.ts';

function prepared(){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=40000;
  w.state.resources={...emptyResources(),wood:400,stone:400,flowers:400,jam:400,bread:400,plank:400,fish:400,cloth:400,clothing:400,tools:400,wine:400,cheese:400,honey:400,materials:400};
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  w.state.researched=[...TECHNOLOGY_KEYS];
  // A harbour, so the four island voyages are reachable too. It waits for town level 10 and
  // for a clear tile, so both are set and the build is asserted rather than assumed.
  w.state.level=20;
  assert.equal(w.build('harbor',4,24).ok,true,'the harbour is what opens the sea routes');
  return w;
}

test('every destination is well formed and distinct',()=>{
  const names=new Set<string>(),cargoes=new Set<string>();
  for(const id of DESTINATION_IDS){
    const destination=DESTINATIONS[id];
    assert.equal(destination.id,id);
    assert.ok(destination.name.length>0&&destination.description.length>0,`${id} is described`);
    assert.ok(destination.rewardCoins>0,`${id} pays coins`);
    assert.ok(Object.values(destination.rewardItems).some(v=>(v??0)>0),`${id} brings goods home`);
    for(const key of Object.keys(destination.rewardItems)) assert.ok(RESOURCE_KEYS.includes(key as Resource),`${id} brings a real good: ${key}`);
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
  assert.ok((rivermouth.rewardItems.materials??0)>(valley.rewardItems.materials??0),'the furthest land route brings the most materials');
  for(const destination of [valley,hilltown,rivermouth]) assert.ok(rewardRatio(destination)>0);
});

test('routes unlock with research and the starting route is always available',()=>{
  const none=availableDestinations([]);
  assert.deepEqual(none.map(d=>d.id),['valley'],'a fresh town only knows the nearby village');
  assert.deepEqual(availableDestinations(['tailoring']).map(d=>d.id).sort(),['hilltown','valley']);
  assert.deepEqual(availableDestinations(['viniculture']).map(d=>d.id).sort(),['rivermouth','valley']);
  // The sea routes need a harbour as well as their research, so a fully researched town
  // without one still sees only the land roads.
  assert.equal(availableDestinations(TECHNOLOGY_KEYS).length,LAND_DESTINATION_IDS.length,'research alone opens the land roads');
  assert.equal(availableDestinations(TECHNOLOGY_KEYS,true).length,DESTINATION_IDS.length,'and a harbour opens the rest');
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
  // With a harbour, so the sea routes are included too.
  for(const id of DESTINATION_IDS){
    const w=prepared();
    assert.equal(w.chooseCaravanDestination(id).ok,true,`${id} is selectable`);
    const dispatched=w.dispatchCaravan();
    assert.equal(dispatched.ok,true,`${id} dispatches: ${dispatched.message}`);
    const caravan=w.state.caravans[0];
    assert.equal(caravan.destination,id);
    assert.deepEqual(caravan.cargo,DESTINATIONS[id].cargo,`${id} ships its own cargo`);
    // A trip is either clean or waylaid; docs/06 §2 puts a raid risk on the long roads, and a
    // raid costs half the coins and all of the materials. Anything else would be neither.
    const raided=caravan.raided===true;
    assert.equal(caravan.rewardCoins,raided?Math.round(DESTINATIONS[id].rewardCoins/2):DESTINATIONS[id].rewardCoins,`${id} coins`);
    // A raid takes the goods as well as half the coins.
    assert.deepEqual(caravan.rewardItems,raided?{}:DESTINATIONS[id].rewardItems,`${id} goods`);
    // The short road to the next village is never waylaid, so the risk it carries must be nil.
    if(id==='valley')assert.equal(raided,false,'the near road needs no guard');

    // The cargo really left the warehouse, and exactly that much.
    const before=prepared().state.resources;
    for(const [key,amount] of Object.entries(DESTINATIONS[id].cargo) as [Resource,number][]){
      assert.equal(w.state.resources[key],before[key]-amount,`${id}: ${key} was loaded`);
    }
    // And collecting pays exactly what was promised.
    w.state.gameTime=caravan.returnAt;w.tick(0.1);
    assert.equal(w.state.caravans[0].status,'returned');
    const coins=w.state.coins, materials=w.state.resources.materials;
    assert.equal(w.dispatchCaravan().ok,true);
    assert.equal(w.state.coins,coins+(raided?Math.round(DESTINATIONS[id].rewardCoins/2):DESTINATIONS[id].rewardCoins),`${id} paid what it promised`);
    assert.equal(w.state.resources.materials,materials+(raided?0:(DESTINATIONS[id].rewardItems.materials??0)),`${id} brought what it promised`);
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
  const before=JSON.stringify(w.state.caravans[0]);
  const refused=w.chooseCaravanDestination('rivermouth');
  assert.equal(refused.ok,false);
  assert.equal(refused.code,'CARAVAN_BUSY');
  assert.equal(JSON.stringify(w.state.caravans[0]),before,'the route is fixed once it sets out');
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
  delete ((older.caravans as Record<string, unknown>[])[0] as Record<string, unknown>).destination;
  assert.equal(validateSave(older),true,'an older save is still valid');
  const restored=new SimWorld(older);
  assert.equal(restored.state.caravans[0].destination,'valley','it defaults to the original route');
  assert.equal(restored.dispatchCaravan().ok,true,'and can set out immediately');
});

test('a save written while the town ran one caravan keeps that cart and gains its slot id',()=>{
  // The shape changed from one `caravan` object to a `caravans` array. The cart itself —
  // where it was going, what it carried, how far along it was — must survive untouched.
  const w=prepared();
  w.dispatchCaravan();
  const single=structuredClone(w.state) as unknown as Record<string, unknown>;
  const cart={...(single.caravans as Record<string, unknown>[])[0] as Record<string, unknown>};
  delete cart.id;
  delete single.caravans;
  single.caravan=cart;

  const restored=new SimWorld(single);
  assert.equal(restored.state.caravans.length,1,'the single cart becomes the first slot');
  assert.equal(restored.state.caravans[0].id,'caravan-1');
  assert.equal(restored.state.caravans[0].status,'traveling','and it is still on the road');
  assert.equal(restored.state.caravans[0].destination,cart.destination);
  assert.deepEqual(restored.state.caravans[0].cargo,cart.cargo);
  assert.equal(restored.state.caravans[0].returnAt,cart.returnAt);
});

test('a save naming a route that does not exist is refused',()=>{
  const w=prepared();
  const corrupt=structuredClone(w.state) as unknown as Record<string, unknown>;
  ((corrupt.caravans as Record<string, unknown>[])[0] as Record<string, unknown>).destination='moon';
  assert.equal(validateSave(corrupt),false);
  const wrongType=structuredClone(w.state) as unknown as Record<string, unknown>;
  ((wrongType.caravans as Record<string, unknown>[])[0] as Record<string, unknown>).destination=7;
  assert.equal(validateSave(wrongType),false);
});

test('a save with no caravans at all, or two carts sharing an id, is refused',()=>{
  const w=prepared();
  const empty=structuredClone(w.state) as unknown as Record<string, unknown>;
  empty.caravans=[];
  assert.equal(validateSave(empty),false,'the market always has at least one slot');
  const duplicated=structuredClone(w.state) as unknown as Record<string, unknown>;
  duplicated.caravans=[{...w.state.caravans[0]},{...w.state.caravans[0]}];
  assert.equal(validateSave(duplicated),false,'ids identify slots, so they cannot repeat');
});

test('the fleet grows with the market and with standing, under a hard ceiling of four',()=>{
  const w=prepared();
  const market=w.state.buildings.find(b=>b.kind==='market')!;
  assert.equal(w.caravanCapacity(),1,'a level-1 market runs one cart');
  market.level=2;
  assert.equal(w.caravanCapacity(),2);
  market.level=3;
  assert.equal(w.caravanCapacity(),3);
  w.state.prestige=CARAVAN_STANDING_FOR_EXTRA;
  assert.equal(w.caravanCapacity(),4,'standing earns the fourth');
  // The ceiling holds however large the numbers get.
  market.level=9;
  w.state.prestige=100000;
  assert.equal(w.caravanCapacity(),CARAVAN_SLOT_LIMIT);
  // Damage stops a cart leaving but does not shrink the fleet: the slot is still the town's.
  market.damaged=true;
  market.level=1;
  w.state.prestige=0;
  assert.equal(w.caravanCapacity(),1);
  assert.equal(w.dispatchCaravan().ok,false,'a damaged market cannot send anyone out');
});

test('a fleet is padded to the current capacity but never shrinks below the carts it has',()=>{
  const w=prepared();
  const market=w.state.buildings.find(b=>b.kind==='market')!;
  market.level=3;
  assert.equal(w.caravanFleet().length,3,'the slots are created on demand');
  // Losing the market must not delete a cart that already exists — only stop new ones.
  market.level=1;
  assert.equal(w.caravanCapacity(),1);
  assert.equal(w.state.caravans.length,3,'existing carts are kept');
  assert.equal(w.caravanFleet().length,1,'but only the capacity is actable');
  assert.equal(validateSave(w.state),true,'and the save still validates');
});

test('two caravans run the same road independently and are unloaded one at a time',()=>{
  const w=prepared();
  const market=w.state.buildings.find(b=>b.kind==='market')!;
  market.level=2;
  // Enough of every cargo to load both carts.
  for(const key of RESOURCE_KEYS) w.state.resources[key]=Math.max(w.state.resources[key],200);

  const [first,second]=w.caravanFleet();
  assert.equal(w.chooseCaravanDestination('valley',first!.id).ok,true);
  assert.equal(w.chooseCaravanDestination('valley',second!.id).ok,true);
  assert.equal(w.dispatchCaravan(first!.id).ok,true);
  assert.equal(first!.status,'traveling');
  assert.equal(second!.status,'idle','the second cart is untouched by the first one leaving');
  // Sent a little later, so the two return times genuinely differ and the test can tell
  // one cart coming home from both of them coming home at once.
  w.state.gameTime+=30;
  assert.equal(w.dispatchCaravan(second!.id).ok,true);
  assert.equal(second!.status,'traveling','both can be on the road at once');
  assert.ok(second!.returnAt>first!.returnAt,'the later cart is due back later');

  // The first one home is the first one collectable.
  w.state.gameTime=first!.returnAt;
  w.tick(.1);
  assert.equal(first!.status,'returned');
  assert.equal(second!.status,'traveling','the other is still away');
  assert.equal(w.dispatchCaravan(first!.id).ok,true,'collecting the first');
  assert.equal(first!.status,'idle');
  assert.equal(second!.status,'traveling','and the second is unaffected');
  assert.equal(validateSave(w.state),true);
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
  // Research alone gates the land roads; the sea routes need the harbour as well, and the
  // helper builds one, so tailoring opens the hill town and the fisher island together.
  assert.deepEqual(routes.map(r=>r.id).sort(),['fisherisland','hilltown','valley'],'only unlocked routes are offered');
  const chosen=routes.filter(r=>r.chosen);
  assert.equal(chosen.length,1,'exactly one route is marked as chosen');
  assert.equal(chosen[0]!.id,'valley','the default is the village');
  assert.equal(w.observe().caravanRoutes.every(r=>Object.keys(r.cargo).length>0),true);
});
