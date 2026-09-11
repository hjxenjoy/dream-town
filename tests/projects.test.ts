import { executeGameTool } from '../src/sim/tools.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { PROJECT_IDS, PROJECTS, freshProjects, projectMetrics } from '../src/sim/projects.ts';
import { ACHIEVEMENT_IDS } from '../src/sim/achievements.ts';
import { BUILDINGS, TECHNOLOGY_KEYS, emptyResources, type BuildingKind } from '../src/sim/data.ts';

function established(){
  const w=new SimWorld();w.state.buildings=[];w.state.roads=[];w.state.population=60;
  w.state.coins=100000;w.state.capacity=20000;w.state.researched=[...TECHNOLOGY_KEYS];
  w.state.settings.autoMayor=false;w.state.settings.disasters=false;
  w.state.resources={...emptyResources(),wood:3000,stone:3000,materials:500,plank:500,bread:500,fish:500,feed:100,tools:100,ingot:100,cloth:100,clothing:100};
  const add=(kind:BuildingKind,x:number,y:number)=>{const r=w.build(kind,x,y);assert.equal(r.ok,true,r.message);return w.state.buildings.find(b=>b.id===r.buildingId)!;};
  for(let i=0;i<8;i++){const b=add('cottage',37+i,38);b.level=3;}
  add('oak',38,39);add('cherry',42,39);add('watertower',40,39);add('school',37,39);add('clinic',44,39);
  const kinds:BuildingKind[]=['lumber','sawmill','kiln','smelter','smithy','farm','farm','farm','windmill','bakery','feedmill','pasture','weaver','tailor','fishpond','firestation'];
  kinds.forEach((kind,i)=>add(kind,37+i%5,40+Math.floor(i/5)));
  w.state.stats.caravansCompleted=20;w.state.happiness=100;
  // This fixture measures project-stage rewards exactly. Mark every achievement as already
  // earned so a milestone cannot pay prestige into the middle of an assertion.
  w.state.achievements=[...ACHIEVEMENT_IDS];
  return w;
}

test('old saves receive empty optional project state without rewriting inventory or existing quests',()=>{
  const w=new SimWorld(),state=structuredClone(w.state);delete state.projects;
  const restored=new SimWorld(state);assert.deepEqual(restored.state.projects,freshProjects());
  assert.deepEqual(restored.state.resources,state.resources);assert.deepEqual(restored.state.quests,state.quests);
  assert.equal(validateSave(restored.state),true);
});

test('all nine stages charge their contributions once, preserve progress when switching and award each title once',()=>{
  const w=established();
  for(const id of PROJECT_IDS){
    assert.equal(w.chooseProject(id).ok,true);
    for(let i=0;i<3;i++){
      const status=w.projectStatus(id);assert.equal(status.ready,true,`${id}: ${status.reason}`);
      const before={...w.state.resources},prestige=w.state.prestige,level=w.state.level;
      assert.equal(w.completeProject(id).ok,true);
      for(const [key,value] of Object.entries(PROJECTS[id].stages[i].contribution))assert.equal(w.state.resources[key as keyof typeof before],before[key as keyof typeof before]-value!);
      assert.equal(w.state.prestige,prestige+i+2+w.state.level-level);assert.equal(w.state.projects!.stages[id],i+1);
      if(i===0){const other=id==='garden'?'craft':'garden';if(w.state.projects!.stages[other]<3){w.chooseProject(other);w.chooseProject(id);assert.equal(w.state.projects!.stages[id],1);}}
    }
    const snapshot=JSON.stringify(w.state);assert.equal(w.completeProject(id).ok,false);assert.equal(w.chooseProject(id).ok,false);assert.equal(JSON.stringify(w.state),snapshot);
  }
  assert.equal(w.state.projects!.active,null);assert.equal(validateSave(w.state),true);
  assert.deepEqual(new SimWorld(w.state).state.projects,w.state.projects);
});

test('project delivery preserves timber and three days of food, and failure is atomic',()=>{
  const w=established();w.chooseProject('garden');w.state.resources.wood=w.woodReserve()+11;
  let before=JSON.stringify(w.state);assert.equal(w.completeProject('garden').ok,false);assert.equal(JSON.stringify(w.state),before);
  w.state.resources.wood++;assert.equal(w.completeProject('garden').ok,true);
  w.state.resources.bread=12;w.state.resources.fish=Math.ceil(w.state.population/4)*3-1;
  before=JSON.stringify(w.state);assert.equal(w.completeProject('garden').ok,false);assert.equal(JSON.stringify(w.state),before);
  w.state.resources.fish++;assert.equal(w.completeProject('garden').ok,true);
});

test('layout metrics respond to relocating greenery, losing supply neighbours and damaged protection',()=>{
  const w=established(),start=projectMetrics(w.state);assert.equal(start.greenHomes,8);assert.ok(start.links>=6);assert.ok(start.protectedProduction>=6);
  const oak=w.state.buildings.find(b=>b.kind==='oak')!;w.moveBuilding(oak.id,10,40);assert.ok(projectMetrics(w.state).greenHomes<8);
  for(const b of w.state.buildings)if(['lumber','kiln','smelter','farm','windmill','feedmill','pasture','weaver'].includes(b.kind))b.damaged=true;
  assert.ok(projectMetrics(w.state).links<start.links);
  w.state.buildings.find(b=>b.kind==='firestation')!.damaged=true;assert.equal(projectMetrics(w.state).protectedProduction,0);
});

test('titles apply exact permanent benefits, including offline production, without stacking on reload',()=>{
  const w=established(),originalCap=w.communityCapacity(),b=w.state.buildings.find(b=>b.kind==='sawmill')!;
  const originalCycle=w.observe().production.find(p=>p.buildingId===b.id)!.cycle;
  w.state.projects!.stages={garden:3,craft:3,harbor:3};
  assert.equal(w.communityCapacity(),originalCap+12);
  assert.equal(w.observe().production.find(p=>p.buildingId===b.id)!.cycle,originalCycle*.95);
  const market=w.build('market',43,42);assert.equal(market.ok,true);
  w.dispatchCaravan();assert.equal(w.state.caravan.duration,108);
  const restored=new SimWorld(w.state);assert.equal(restored.communityCapacity(),w.communityCapacity());assert.equal(restored.observe().production.find(p=>p.buildingId===b.id)!.cycle,originalCycle*.95);
  for(const building of restored.state.buildings)building.paused=building.id!==b.id;
  restored.state.resources.plank=0;const r=restored.offline(originalCycle*.95+.001);assert.ok(r.produced.plank>=6);
});

test('invalid project states and motion preferences are rejected at the save boundary',()=>{
  const w=new SimWorld();
  for(const projects of [{active:'unknown',stages:{garden:0,craft:0,harbor:0}},{active:null,stages:{garden:4,craft:0,harbor:0}},{active:null,stages:{garden:.5,craft:0,harbor:0}},{active:null,stages:{garden:0,craft:0}},{active:null,stages:[]}]){
    const state={...w.state,projects};assert.equal(validateSave(state),false);assert.throws(()=>new SimWorld(state));
  }
  assert.equal(validateSave({...w.state,settings:{...w.state.settings,reducedMotion:'yes'}}),false);
  assert.equal(validateSave({...w.state,settings:{...w.state.settings,reducedMotion:true}}),true);
});

test('passive time never spends contributions, selects a direction or auto-completes stages',()=>{
  const w=established();w.chooseProject('harbor');const projects=structuredClone(w.state.projects);
  w.offline(600);assert.deepEqual(w.state.projects,projects);
  const before=JSON.stringify(w.state);assert.equal(w.completeProject('craft').ok,false);assert.equal(JSON.stringify(w.state),before);
});


test('project tools validate arguments and use the same delivery rules as the interface',()=>{
  const w=established();let before=JSON.stringify(w.state);
  assert.equal(executeGameTool(w,'complete_town_project',{projectId:'garden',free:true}).ok,false);
  assert.equal(executeGameTool(w,'choose_town_project',{projectId:'unknown'}).ok,false);
  assert.equal(JSON.stringify(w.state),before);
  assert.equal(executeGameTool(w,'get_town_projects').ok,true);
  assert.equal(executeGameTool(w,'choose_town_project',{projectId:'garden'}).ok,true);
  assert.equal(executeGameTool(w,'complete_town_project',{projectId:'garden'}).ok,true);
  assert.equal(w.state.projects!.stages.garden,1);
});
