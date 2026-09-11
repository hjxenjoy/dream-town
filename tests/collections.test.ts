import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, type BuildingKind } from '../src/sim/data.ts';
import { COLLECTIONS, COLLECTION_IDS, collectionEnvironment, collectionProgress, newlyReached, type CollectionId } from '../src/sim/collections.ts';

/** Every ornament the styles award, read straight off the tier table. */
function ornamentsFor(id: CollectionId): BuildingKind[] {
  return COLLECTIONS[id].tiers.flatMap(tier => tier.unlocks ? [tier.unlocks] : []);
}

/** A town with plenty of materials and no disasters, used as the base for street layouts. */
function town(){
  const w=new SimWorld();
  w.state.coins=200000;w.state.capacity=40000;
  w.state.resources.wood=15000;w.state.resources.stone=15000;
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  return w;
}

/** Places a building on the first free land tile near a given origin. */
function placeNear(w:SimWorld,kind:BuildingKind,originX:number,originY:number,radius=10):{x:number;y:number}|null{
  for(let ring=0;ring<=radius;ring++){
    for(let dx=-ring;dx<=ring;dx++)for(let dy=-ring;dy<=ring;dy++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==ring)continue;
      const x=originX+dx,y=originY+dy;
      if(w.build(kind,x,y).ok)return{x,y};
    }
  }
  return null;
}

/** Lays out `count` copies of one kind, packed inside a single cluster. */
function lay(w:SimWorld,kind:BuildingKind,count:number,origin:{x:number;y:number}):number{
  let laid=0;
  for(let i=0;i<count*8&&laid<count;i++){
    if(placeNear(w,kind,origin.x+(i%3)-(i%2),origin.y+Math.floor(i/2)%2,8))laid++;
  }
  return laid;
}

/**
 * Builds a style the way a player would: several kinds, each placed in the same corner.
 * `kinds` decides which kinds, `each` how many of each, so a caller can choose to satisfy
 * or deliberately miss the variety requirement.
 */
function layStyle(w:SimWorld,kinds:readonly BuildingKind[],each:number,origin:{x:number;y:number}):number{
  let laid=0;
  for(const kind of kinds) laid+=lay(w,kind,each,origin);
  return laid;
}

test('every style is well formed and its ornaments exist',()=>{
  for(const id of COLLECTION_IDS){
    const style=COLLECTIONS[id];
    assert.equal(style.id,id);
    assert.ok(style.name.length>0&&style.description.length>0,`${id} is described`);
    assert.ok(style.kinds.length>0&&style.radius>0,`${id} has a shape`);
    assert.ok(style.tiers.length>=2,`${id} has more than one step`);
    for(const kind of style.kinds) assert.ok(BUILDINGS[kind]!==undefined,`${id} counts a real building: ${kind}`);
    // Each step must ask for strictly more, so progress is monotonic rather than a puzzle.
    let previousNeed=0,previousDistinct=0;
    for(const tier of style.tiers){
      assert.ok(tier.need>previousNeed,`${id}「${tier.name}」 asks for more than the step before`);
      assert.ok(tier.distinct>=previousDistinct,`${id}「${tier.name}」 never asks for fewer kinds`);
      assert.ok(tier.distinct<=tier.need,`${id}「${tier.name}」 can be satisfied: ${tier.distinct} kinds from ${tier.need} items`);
      assert.ok(tier.perk.length>0,`${id}「${tier.name}」 explains itself`);
      previousNeed=tier.need;previousDistinct=tier.distinct;
    }
    // Ornaments belong to the style that awards them and are ordinary decorations otherwise.
    for(const ornament of ornamentsFor(id)){
      assert.equal(BUILDINGS[ornament].category,'decoration',`${ornament} is a decoration, not income`);
      assert.equal(BUILDINGS[ornament].frame,null,`${ornament} is drawn from a generated atlas`);
      assert.ok(style.kinds.includes(ornament)===false,`${ornament} does not count toward its own style`);
    }
  }
});

test('a tight cluster of one style reaches a tier, a scattered one does not',()=>{
  const w=town();
  const origin={x:30,y:26};
  const first=COLLECTIONS.flowerlane.tiers[0]!;
  assert.equal(layStyle(w,['flowerbox','trellis'],Math.ceil(first.need/2),origin)>=first.need,true,'enough decorations fit');
  const progress=collectionProgress(w.state.buildings,{}).find(p=>p.id==='flowerlane')!;
  assert.ok(progress.tier>=1,'a cluster in one place counts');
  assert.ok(progress.count>=4);

  // The same four boxes spread far apart describe nothing.
  const scattered=collectionProgress(
    [0,1,2,3].map(i=>({id:i,kind:'flowerbox' as BuildingKind,x:2+i*18,y:2,level:1,damaged:false} as never)),
    {},
  ).find(p=>p.id==='flowerlane')!;
  assert.equal(scattered.count,1,'one box per neighbourhood is not a style');
  assert.equal(scattered.tier,0);
});

test('variety is required, so one cheap item cannot carry a style',()=>{
  const w=town();
  const need=COLLECTIONS.workshop.tiers[0]!;
  // Twelve identical anvils in one heap satisfy the count but not the variety.
  const field=Array.from({length:12},(_,i)=>({id:i,kind:'anvil' as BuildingKind,x:30+(i%4),y:26+Math.floor(i/4),level:1,damaged:false} as never));
  const stacked=collectionProgress(field,{}).find(p=>p.id==='workshop')!;
  assert.equal(stacked.count,12);
  assert.equal(stacked.distinct,1);
  assert.equal(stacked.tier,0,`${need.distinct} kinds are required, not just ${need.need} items`);
  assert.equal(stacked.next!.name,need.name,'the next step is still the first one');
});

test('the first tier needs no research and rewards a lasting environment bonus',()=>{
  const w=town();
  const before=w.observe().needs.environment;
  layStyle(w,['flowerbox','trellis'],2,{x:30,y:26});
  w.tick(0.1);
  const style=COLLECTIONS.flowerlane;
  assert.equal(w.state.collections!.flowerlane,1,'the first step is banked');
  const bonus=style.tiers[0]!.environment;
  assert.ok(bonus>=0);
  assert.equal(collectionEnvironment(w.state.collections!),bonus,'the bonus is the sum of banked steps');
  assert.ok(w.observe().needs.environment>=before,'the environment never drops for collecting a style');
});

test('a banked tier survives demolishing the decorations',()=>{
  const w=town();
  layStyle(w,['flowerbox','trellis'],2,{x:30,y:26});
  w.tick(0.1);
  assert.equal(w.state.collections!.flowerlane,1);
  for(const building of [...w.state.buildings]) if(COLLECTIONS.flowerlane.kinds.includes(building.kind)) w.demolish(building.id);
  w.tick(0.1);
  assert.equal(w.state.collections!.flowerlane,1,'the reward is not revoked');
  const progress=w.observe().collections.find(p=>p.id==='flowerlane')!;
  assert.equal(progress.tier,1,'and the panel still shows what was earned');
  assert.equal(progress.count,0,'while reporting honestly that the street no longer exists');
});

test('an ornament cannot be built before its style is collected, and can afterwards',()=>{
  const w=town();
  const blocked=w.build('flowercart',30,26);
  assert.equal(blocked.ok,false);
  assert.equal(blocked.code,'ORNAMENT_LOCKED');
  assert.equal(JSON.stringify(w.state).includes('"flowercart"'),false,'nothing was placed or paid for');

  // Reach the tier that awards it, using the kinds the style actually counts.
  const award=COLLECTIONS.flowerlane.tiers.findIndex(tier=>tier.unlocks==='flowercart');
  assert.ok(award>=0);
  layStyle(w,COLLECTIONS.flowerlane.kinds.slice(0,4),3,{x:30,y:26});
  w.tick(0.1);
  assert.ok((w.state.collections!.flowerlane??0)>award,'the awarding tier was reached');
  const allowed=placeNear(w,'flowercart',30,26,12);
  assert.ok(allowed,'the ornament becomes placeable');
  assert.equal(w.state.buildings.some(b=>b.kind==='flowercart'),true);
  assert.equal(validateSave(w.state),true);
});

test('what the build panel shows and what the simulation accepts never differ',()=>{
  // The panel asks ornamentLock to decide whether to grey an ornament out, so the two must
  // agree in both directions or the player meets a silent refusal.
  const w=town();
  for(const id of COLLECTION_IDS){
    for(const ornament of ornamentsFor(id)){
      const reason=w.ornamentLock(ornament);
      const attempt=placeNear(w,ornament,34,30,10);
      if(reason===null) assert.ok(attempt,`${ornament} was advertised as available and builds`);
      else {
        assert.equal(attempt,null,`${ornament} was advertised as unavailable and did not build`);
        assert.ok(reason.includes(COLLECTIONS[id].name),`the reason names the style: ${reason}`);
      }
    }
  }
  // And once every style is banked, nothing is refused any more.
  w.state.collections=Object.fromEntries(COLLECTION_IDS.map(id=>[id,COLLECTIONS[id].tiers.length])) as Record<CollectionId,number>;
  for(const id of COLLECTION_IDS) for(const ornament of ornamentsFor(id)) assert.equal(w.ornamentLock(ornament),null,`${ornament} is open once its style is complete`);
});

test('ornaments are decorations: no workers, no output, no upkeep',()=>{
  for(const id of COLLECTION_IDS){
    for(const ornament of ornamentsFor(id)){
      const definition=BUILDINGS[ornament];
      assert.equal(definition.output,undefined,`${ornament} produces nothing`);
      assert.equal(definition.input,undefined,`${ornament} consumes nothing`);
      assert.equal(definition.workers??0,0,`${ornament} needs no worker`);
      assert.equal(definition.technology,undefined,`${ornament} is awarded, not researched`);
    }
  }
});

test('all three styles can be collected in one town at once',()=>{
  const w=town();
  const corners=[{x:28,y:24},{x:36,y:32},{x:24,y:36}];
  COLLECTION_IDS.forEach((id,index)=>{
    layStyle(w,COLLECTIONS[id].kinds.slice(0,4),3,corners[index]!);
  });
  w.tick(0.1);
  for(const id of COLLECTION_IDS){
    assert.ok((w.state.collections![id]??0)>=1,`${COLLECTIONS[id].name} was collected alongside the others`);
  }
  assert.equal(validateSave(w.state),true);
});

test('collection progress reports what is still missing, then reports the next step',()=>{
  const w=town();
  const empty=w.observe().collections.find(p=>p.id==='promenade')!;
  assert.equal(empty.tier,0);
  assert.equal(empty.next!.name,COLLECTIONS.promenade.tiers[0]!.name);
  layStyle(w,COLLECTIONS.promenade.kinds.slice(0,2),3,{x:30,y:30});
  w.tick(0.1);
  const progress=w.observe().collections.find(p=>p.id==='promenade')!;
  assert.ok(progress.count>=progress.tier);
  if(progress.tier===0) assert.equal(progress.next!.name,COLLECTIONS.promenade.tiers[0]!.name);
  else assert.notEqual(progress.next,undefined,'reaching a step reveals the next one');
  assert.equal(collectionProgress(w.state.buildings,w.state.collections??{}).length,COLLECTION_IDS.length);
});

test('newlyReached reports each step exactly once, in order',()=>{
  const w=town();
  layStyle(w,COLLECTIONS.workshop.kinds.slice(0,4),3,{x:32,y:28});
  w.tick(0.1);
  const banked=w.state.collections??{};
  const again=newlyReached(collectionProgress(w.state.buildings,banked),banked);
  assert.deepEqual(again,[],'nothing is awarded twice');
  // And a save that lost its banked tiers re-awards them once.
  const reached=collectionProgress(w.state.buildings,{});
  const fresh=newlyReached(reached,{});
  assert.equal(new Set(fresh.map(entry=>entry.id+'/'+entry.tier)).size,fresh.length,'no duplicates within one pass');
  for(const entry of fresh) assert.ok(entry.tier>=1&&entry.tier<=COLLECTIONS[entry.id].tiers.length);
});

test('an older save without collections loads, and bad collection data is refused',()=>{
  const w=town();
  const older=structuredClone(w.state) as unknown as Record<string,unknown>;
  delete older.collections;
  assert.equal(validateSave(older),true,'a save from before styles still loads');
  const restored=new SimWorld(older);
  assert.deepEqual(restored.state.collections,{},'and starts with nothing collected');
  assert.equal(restored.observe().collections.length,COLLECTION_IDS.length,'while still reporting every style');

  for(const bad of [
    {flowerlane:99},
    {flowerlane:-1},
    {flowerlane:1.5},
    {moon:1},
    {flowerlane:'two'},
  ]){
    const corrupt=structuredClone(w.state) as unknown as Record<string,unknown>;
    corrupt.collections=bad;
    assert.equal(validateSave(corrupt),false,`refuses ${JSON.stringify(bad)}`);
  }
});

test('a save that has banked the top tier stays banked and reports no next step',()=>{
  const w=town();
  const full=Object.fromEntries(COLLECTION_IDS.map(id=>[id,COLLECTIONS[id].tiers.length])) as Record<CollectionId,number>;
  w.state.collections=full;
  w.tick(0.1);
  for(const progress of w.observe().collections){
    assert.equal(progress.tier,COLLECTIONS[progress.id].tiers.length);
    assert.equal(progress.next,null,'a complete style offers nothing more');
  }
  assert.equal(validateSave(w.state),true);
  assert.ok(collectionEnvironment(full)>0);
});

test('the environment bonus from styles is bounded',()=>{
  const full=Object.fromEntries(COLLECTION_IDS.map(id=>[id,COLLECTIONS[id].tiers.length])) as Record<CollectionId,number>;
  const w=town();
  w.state.collections=full;
  w.tick(0.5);
  const environment=w.observe().needs.environment;
  assert.ok(environment<=100,`environment stays clamped, got ${environment}`);
  assert.ok(environment>=60,'and collecting styles is a real gain');
});
