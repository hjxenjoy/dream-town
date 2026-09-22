import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, EXPANSION_SPRITES, RESOURCE_KEYS, SEASON_SECONDS, TECHNOLOGY_KEYS, emptyResources, type BuildingKind } from '../src/sim/data.ts';
import { DISASTERS, DISASTER_INTERVAL, DISASTER_KINDS, REPAIR_SECONDS } from '../src/sim/disasters.ts';
import { executeGameTool } from '../src/sim/tools.ts';

function prepared(){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=10000;
  w.state.resources={...emptyResources(),wood:600,stone:600,materials:200,feed:100,charcoal:100,bread:100,fish:100};
  w.state.researched=[...TECHNOLOGY_KEYS];w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  for(const b of w.state.buildings){b.paused=true;b.workers=0;b.staffing=0;b.progress=0;b.ready=false;b.stock={};}
  return w;
}
function add(w:SimWorld,kind:BuildingKind,x=38,y=40){
  const r=w.build(kind,x,y);assert.equal(r.ok,true,r.message);
  return w.state.buildings.find(b=>b.id===r.buildingId)!;
}

test('all twelve additions build, upgrade twice, relocate and round-trip without changing previous buildings',()=>{
  const w=prepared(),previous=structuredClone(w.state.buildings);
  for(const [i,kind] of EXPANSION_SPRITES.entries()){
    const b=add(w,kind,37+i%4,40+Math.floor(i/4));
    assert.equal(w.upgrade(b.id).ok,true);assert.equal(w.upgrade(b.id).ok,true);
    assert.equal(w.upgrade(b.id).ok,false);assert.equal(b.level,3);
    assert.equal(executeGameTool(w,'move_building',{buildingId:b.id,x:b.x,y:b.y+3}).ok,true);
  }
  assert.deepEqual(w.state.buildings.slice(0,previous.length),previous);
  assert.equal(validateSave(w.state),true);
  assert.deepEqual(new SimWorld(w.state).state.buildings,w.state.buildings);
});

test('new housing and civic capacity are independent, stack by level and protect occupied communities',()=>{
  const w=prepared();w.state.population=18;
  const home=add(w,'apartment');assert.equal(w.housingCapacity(),36);
  assert.equal(w.observe().populationCapacity,18);
  const school=add(w,'school',39,40);assert.equal(w.communityCapacity(),30);
  assert.equal(w.observe().populationCapacity,30);
  assert.equal(w.upgrade(school.id).ok,true);assert.equal(w.observe().populationCapacity,36);
  w.state.population=31;
  let before=JSON.stringify(w.state);assert.equal(w.demolish(school.id).code,'COMMUNITY_REQUIRED');assert.equal(JSON.stringify(w.state),before);
  before=JSON.stringify(w.state);assert.equal(w.demolish(home.id).code,'HOUSING_REQUIRED');assert.equal(JSON.stringify(w.state),before);
  add(w,'clinic',40,40);add(w,'theatre',41,40);
  assert.equal(w.demolish(school.id).ok,true);
  home.damaged=true;assert.equal(w.housingCapacity(),18);
  home.damaged=false;assert.equal(w.housingCapacity(),36);
});

test('a healthy well-supplied town can grow beyond thirty residents',()=>{
  const w=prepared();w.state.population=30;w.state.happiness=100;w.state.taxRate=0;
  add(w,'apartment');add(w,'school',39,40);add(w,'watertower',40,40);
  w.state.buildings.find(b=>b.kind==='townhall')!.level=3;
  w.tick(90);assert.equal(w.state.population,31);assert.ok(w.observe().populationCapacity>30);
});

test('water towers supply new homes, expand after upgrade and stop supplying when damaged',()=>{
  const w=prepared();w.state.buildings=w.state.buildings.filter(b=>!BUILDINGS[b.kind].housing&&!BUILDINGS[b.kind].waterRadius);
  const tower=add(w,'watertower',37,40),home=add(w,'rowhouse',44,40);
  assert.equal(w.observe().needs.water,100);
  assert.equal(w.moveBuilding(home.id,44,41).ok,true);assert.equal(w.observe().needs.water,0);
  w.upgrade(tower.id);assert.equal(w.observe().needs.water,100);
  tower.damaged=true;w.tick(.1);assert.equal(w.observe().needs.water,0);
  // Repairs are a timed job: the tower only supplies again once the scaffolding comes down.
  assert.equal(w.repair(tower.id).ok,true);w.tick(REPAIR_SECONDS-1);assert.equal(w.observe().needs.water,0);
  w.tick(2);assert.equal(w.observe().needs.water,100);
});

test('new recipes consume and produce exact resources online and offline with stock conservation',()=>{
  for(const kind of ['forester','sawmill','fishpond','brickworks'] as const){
    const w=prepared(),b=add(w,kind);w.state.resources.materials=0;
    const before={...w.state.resources};w.tick(w.observe().production.find(p=>p.buildingId===b.id)!.cycle);
    assert.equal(b.ready,true,kind);assert.deepEqual(b.stock,BUILDINGS[kind].output);
    for(const k of RESOURCE_KEYS)assert.equal(w.state.resources[k],before[k]-(BUILDINGS[kind].input?.[k]??0),`${kind}:${k}`);
    w.collect(b.id);const start={...w.state.resources},r=w.offline(180);
    assert.ok(Object.values(r.produced).some(n=>n>0),kind);
    for(const k of RESOURCE_KEYS)assert.equal(w.state.resources[k],start[k]+r.produced[k]-r.consumed[k],`${kind}:${k}`);
    assert.equal(validateSave(w.state),true);
  }
});

test('sawmills preserve construction timber online and offline, then resume with enough wood',()=>{
  const w=prepared(),b=add(w,'sawmill');w.state.resources.wood=w.woodReserve()+3;b.progress=.5;
  w.tick(40);assert.equal(b.progress,.5);assert.equal(b.ready,false);
  const wood=w.state.resources.wood;w.offline(100);assert.equal(w.state.resources.wood,wood);
  w.state.resources.wood++;w.tick(40);assert.equal(b.ready,true);assert.equal(w.state.resources.wood,w.woodReserve());
});

test('foresters and building-material workshops stop at targets and resume after use',()=>{
  for(const kind of ['forester','brickworks'] as const){
    const w=prepared(),b=add(w,kind),resource=kind==='forester'?'wood':'materials';
    w.state.resources[resource]=w.stockTargets()[resource];w.tick(70);assert.equal(b.progress,0);
    w.state.resources[resource]=0; if(kind==='brickworks')w.state.resources.charcoal=5;
    w.tick(70);assert.equal(b.ready,true,kind);
  }
});

test('fire stations protect factories beyond old watchtower range and upgrade coverage',()=>{
  const w=prepared();w.state.buildings=[];w.state.roads=[];w.state.settings.disasters=true;
  const station=add(w,'firestation',37,40),factory=add(w,'forester',44,41);
  // Hazards rotate per slot and several are seasonal, so the strike time has to be chosen:
  // a slot whose hazard is fire AND whose season fire actually reaches. The season is read
  // from the world after the tick has advanced it, which is why this looks one step ahead.
  //
  // Searching rather than hard-coding an instant keeps this honest when the hazard list, the
  // interval, or the season length changes: if no such slot exists the test fails loudly
  // instead of quietly asserting that nothing happened.
  const slug=(time:number)=>(['spring','summer','autumn','winter'] as const)[Math.floor(time/SEASON_SECONDS)%4];
  let fireSlot=-1;
  for(let slot=1;slot<=240;slot++){
    const at=slot*DISASTER_INTERVAL;
    if(DISASTER_KINDS[Math.floor(at/DISASTER_INTERVAL)%DISASTER_KINDS.length]!=='fire')continue;
    if(!DISASTERS.fire.seasons.includes(slug(at)))continue;
    fireSlot=at;break;
  }
  assert.ok(fireSlot>0,'some hazard slot is a fire in a season fire reaches');
  const strikeFire=()=>{w.state.gameTime=fireSlot-1;w.state.lastDisasterAt=0;w.tick(1);};
  w.upgrade(station.id);strikeFire();assert.equal(factory.damaged,undefined);
  station.level=1;strikeFire();assert.equal(factory.damaged,true);
  assert.equal(factory.damageKind,'fire');
  // A damaged factory reports a named hazard and can be repaired back into service.
  const alert=w.observe().alerts.find(a=>a.buildingId===factory.id)!;
  assert.equal(alert.name,'火情');assert.ok(alert.advice.length>0);
  w.repair(factory.id);assert.equal(w.repair(factory.id).code,'REPAIR_IN_PROGRESS');
  w.tick(REPAIR_SECONDS);assert.equal(factory.damaged,false);assert.equal(factory.damageKind,undefined);
});

test('research gates and road collision apply to every new building',()=>{
  const w=prepared();w.state.researched=[];
  for(const kind of ['sawmill','fishpond','brickworks','theatre','firestation'] as const){
    const before=JSON.stringify(w.state);assert.equal(w.build(kind,38,40).ok,false);assert.equal(JSON.stringify(w.state),before);
  }
  w.state.researched=[...TECHNOLOGY_KEYS];assert.equal(w.paveRoad({x:38,y:40},{x:38,y:40},'dirt').ok,true);
  for(const kind of EXPANSION_SPRITES){const before=JSON.stringify(w.state);assert.equal(w.build(kind,38,40).code,'ROAD_OCCUPIED');assert.equal(JSON.stringify(w.state),before);}
});
