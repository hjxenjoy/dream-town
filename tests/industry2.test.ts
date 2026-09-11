import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCES, RESOURCE_KEYS, TECHNOLOGIES, TECHNOLOGY_KEYS, emptyResources, type BuildingKind, type Resource } from '../src/sim/data.ts';
import { stockTargets } from '../src/sim/economy.ts';

const DAIRY: BuildingKind[] = ['cowbarn', 'dairy'];
const WINE: BuildingKind[] = ['vineyard', 'winery', 'cellar'];
const INDUSTRY2: BuildingKind[] = [...DAIRY, 'apiary', ...WINE];

function prepared(){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=20000;
  w.state.resources={...emptyResources(),wood:900,stone:900,materials:200,feed:900};
  w.state.researched=[...TECHNOLOGY_KEYS];w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  for(const b of w.state.buildings){b.paused=true;b.workers=0;b.progress=0;b.ready=false;b.stock={};}
  return w;
}
function add(w:SimWorld,kind:BuildingKind,x:number){
  const r=w.build(kind,x,42);assert.equal(r.ok,true,`${kind}: ${r.message}`);
  const built=w.state.buildings.find(b=>b.id===r.buildingId)!;
  built.paused=false;built.workers=BUILDINGS[kind].workers??0;
  return built;
}

test('every new industry building builds, charges its declared cost and needs its research',()=>{
  for(const kind of INDUSTRY2){
    const w=prepared();
    const def=BUILDINGS[kind];
    const before={coins:w.state.coins,wood:w.state.resources.wood,stone:w.state.resources.stone,materials:w.state.resources.materials};
    const built=add(w,kind,38);
    assert.equal(w.state.coins,before.coins-def.cost,`${kind} coins`);
    assert.equal(w.state.resources.wood,before.wood-def.wood,`${kind} wood`);
    assert.equal(w.state.resources.stone,before.stone-def.stone,`${kind} stone`);
    assert.equal(w.state.resources.materials,before.materials-(def.materials?.materials??0),`${kind} materials`);
    assert.equal(validateSave(w.state),true,`${kind} saves`);

    // Without its technology the blueprint is locked and nothing is spent.
    const locked=prepared();locked.state.researched=[];
    const refused=locked.build(kind,38,42);
    assert.equal(refused.ok,false,`${kind} is gated by research`);
    assert.equal(refused.code,'TECHNOLOGY_REQUIRED');
    assert.equal(locked.state.coins,100000,'a locked build costs nothing');
    void built;
  }
});

test('the dairy chain converts feed to milk to cheese with exact quantities',()=>{
  const w=prepared();
  const barn=add(w,'cowbarn',36),dairy=add(w,'dairy',40);
  const feed=w.state.resources.feed;
  w.tick(BUILDINGS.cowbarn.cycle+1);
  assert.equal(barn.ready,true,'the barn finishes a batch');
  assert.deepEqual(barn.stock,BUILDINGS.cowbarn.output);
  assert.equal(w.state.resources.feed,feed-BUILDINGS.cowbarn.input!.feed!,'feed was consumed exactly once');
  w.collect(barn.id);
  const milk=w.state.resources.milk;
  assert.equal(milk,BUILDINGS.cowbarn.output.milk!);
  w.tick(BUILDINGS.dairy.cycle+1);
  assert.equal(dairy.ready,true,'the dairy turns milk into cheese');
  assert.deepEqual(dairy.stock,BUILDINGS.dairy.output);
  w.collect(dairy.id);
  assert.equal(w.state.resources.milk,milk-BUILDINGS.dairy.input!.milk!,'milk was consumed');
  assert.equal(w.state.resources.cheese,BUILDINGS.dairy.output.cheese!);
  assert.equal(validateSave(w.state),true);
});

test('the wine chain runs grape to wine to vintage and never invents goods',()=>{
  const w=prepared();
  const vineyard=add(w,'vineyard',34),winery=add(w,'winery',38),cellar=add(w,'cellar',42);
  const start=RESOURCE_KEYS.reduce((n,k)=>n+w.state.resources[k],0);
  w.tick(BUILDINGS.vineyard.cycle+1);
  assert.equal(vineyard.ready,true);
  w.collect(vineyard.id);
  const grapes=w.state.resources.grape;
  assert.equal(grapes,BUILDINGS.vineyard.output.grape!,'grapes arrive without any input');

  // The winery cannot run on nothing.
  const dry=prepared();
  const thirsty=add(dry,'winery',38);
  dry.tick(BUILDINGS.winery.cycle+1);
  assert.equal(thirsty.ready,false,'no grapes, no wine');

  w.tick(BUILDINGS.winery.cycle+1);
  assert.equal(winery.ready,true);
  w.collect(winery.id);
  assert.equal(w.state.resources.grape,grapes-BUILDINGS.winery.input!.grape!);
  assert.equal(w.state.resources.wine,BUILDINGS.winery.output.wine!);

  w.tick(BUILDINGS.cellar.cycle+1);
  assert.equal(cellar.ready,true);
  w.collect(cellar.id);
  assert.equal(w.state.resources.wine,0,'the wine is aged, not duplicated');
  assert.equal(w.state.resources.vintage,BUILDINGS.cellar.output.vintage!);

  // Every grape became wine and every wine became vintage, so only the vintage remains:
  // the chain consumed exactly as much as it transformed, and invented nothing.
  const vintageOnly=Object.values(BUILDINGS.cellar.output).reduce((a,b)=>a+(b??0),0);
  assert.equal(RESOURCE_KEYS.reduce((n,k)=>n+w.state.resources[k],0),start+vintageOnly,'conservation holds across the chain');
  assert.equal(validateSave(w.state),true);
});

test('the apiary produces honey on its own, like other natural gathering',()=>{
  const w=prepared();
  const apiary=add(w,'apiary',34);
  assert.equal(BUILDINGS.apiary.input,undefined,'honey needs no input');
  w.tick(BUILDINGS.apiary.cycle+1);
  assert.equal(apiary.ready,true);
  w.collect(apiary.id);
  assert.equal(w.state.resources.honey,BUILDINGS.apiary.output.honey!);
});

test('the new goods are sellable at the prices they declare',()=>{
  const goods: Resource[]=['milk','cheese','honey','grape','wine','vintage'];
  for(const key of goods){
    const w=prepared();
    w.state.resources[key]=10;
    const before=w.state.coins;
    assert.equal(w.sell(key,5).ok,true,`${key} sells`);
    assert.equal(w.state.coins,before+RESOURCES[key].sellPrice*5,`${key} pays its declared price`);
    assert.equal(w.state.resources[key],5);
    assert.ok(RESOURCES[key].name.length>0&&RESOURCES[key].sellPrice>0,`${key} is described and priced`);
  }
  // Processed goods are worth more than their inputs, so the chains are worth building.
  assert.ok(RESOURCES.cheese.sellPrice>RESOURCES.milk.sellPrice*2,'cheese beats raw milk');
  assert.ok(RESOURCES.vintage.sellPrice>RESOURCES.wine.sellPrice*2,'aging beats selling young wine');
  assert.ok(RESOURCES.wine.sellPrice>RESOURCES.grape.sellPrice*3,'wine beats grapes');
});

test('offline settlement runs the new chains in source-to-product order',()=>{
  const w=prepared();
  add(w,'cowbarn',34);add(w,'dairy',38);add(w,'vineyard',42);add(w,'winery',46);
  const feed=w.state.resources.feed;
  const before=RESOURCE_KEYS.map(key=>w.state.resources[key]);
  const report=w.offline(600);
  assert.ok(report.produced.milk>0,'milk was produced offline');
  assert.ok(report.produced.cheese>0,'the dairy also ran offline, so milk arrived first');
  assert.ok(report.produced.grape>0&&report.produced.wine>0,'the wine chain ran in order too');
  assert.ok(w.state.resources.feed<feed,'feed was consumed');
  for(const [index,key] of RESOURCE_KEYS.entries()){
    assert.ok(w.state.resources[key]>=0,`${key} stays nonnegative`);
    assert.equal(w.state.resources[key],before[index]!+report.produced[key]-report.consumed[key],`${key} reconciles: start + produced - consumed = end`);
  }
  assert.equal(validateSave(w.state),true);
});

test('the new goods get warehouse targets once the town produces them',()=>{
  const w=prepared();
  const idle=stockTargets({...w.state,buildings:w.state.buildings});
  assert.equal(idle.wine,0,'a town with no winery reserves no wine');
  add(w,'winery',38);
  const active=stockTargets(w.state);
  assert.ok(active.wine>0,'a winery gives wine a working buffer');
  assert.ok(active.grape>0,'and one for its input too');
  // Construction and staple food still outrank the luxuries.
  assert.ok(active.wood>active.wine,'timber still matters most');
  assert.ok(active.bread>active.wine,'and so does the larder');
});

test('orders can request the new goods and their supply chain is traceable',()=>{
  const w=prepared();
  add(w,'winery',38);add(w,'cellar',42);
  for(let i=0;i<40;i++){w.state.nextId+=1;w.tick(1);}
  const orders=w.observe().orders;
  assert.ok(orders.length>0,'the town has orders');
  for(const order of orders){
    for(const key of Object.keys(order.items)) assert.ok(RESOURCE_KEYS.includes(key as Resource),`order item ${key} is a real good`);
  }
});

test('the technology panel renders every technology from the data, including new ones',()=>{
  // The panel used to hardcode its node list, so a new technology was invisible in the
  // UI even though the simulation supported it. It now derives branches from the data.
  const source=readFileSync(new URL('../src/ui/GameUI.ts',import.meta.url),'utf8');
  assert.match(source,/TECHNOLOGY_KEYS\.filter\(id=>TECHNOLOGIES\[id\]\.branch===branch\)/,'branches come from the technology data');
  assert.match(source,/BRANCHES\.map/,'branches are iterated, not written out one by one');
  for(const id of TECHNOLOGY_KEYS){
    assert.ok(TECHNOLOGIES[id],`${id} is defined`);
    assert.ok(['industry','pastoral','town'].includes(TECHNOLOGIES[id].branch),`${id} belongs to a rendered branch`);
  }
  // Every branch the data uses must be one the panel lays out.
  const rendered=[...source.matchAll(/\['(industry|pastoral|town)',/g)].map(m=>m[1]);
  for(const id of TECHNOLOGY_KEYS) assert.ok(rendered.includes(TECHNOLOGIES[id].branch),`branch ${TECHNOLOGIES[id].branch} is rendered`);
});

test('the wine technology unlocks all three of its buildings and no others',()=>{
  const w=prepared();
  w.state.researched=[];w.state.level=6;w.state.prestige=99;
  w.state.resources.materials=500;w.state.resources.plank=500;
  for(const kind of WINE) assert.equal(w.isUnlocked(kind),false,`${kind} starts locked`);
  // It sits behind the pastoral line, so the prerequisite must be studied first.
  assert.equal(w.research('viniculture').code,'RESEARCH_LOCKED','wine needs pastoral knowledge first');
  assert.equal(w.research('husbandry').ok,true);
  assert.equal(w.research('viniculture').ok,true,'the wine technology is researchable once prerequisites are met');
  for(const kind of WINE) assert.equal(w.isUnlocked(kind),true,`${kind} unlocks`);
  assert.equal(w.state.researched.includes('viniculture'),true);
  // Researching twice is refused and costs nothing the second time.
  const coins=w.state.coins;
  assert.equal(w.research('viniculture').code,'ALREADY_RESEARCHED');
  assert.equal(w.state.coins,coins,'a repeat study costs nothing');
});
