import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { emptyResources, RESOURCE_KEYS, MAX_OFFLINE_SECONDS } from '../src/sim/data.ts';
import { CROP_IDS, CROPS, gardenLevel, soilLevel, harvestQuote } from '../src/sim/farming.ts';
import { executeGameTool } from '../src/sim/tools.ts';

function plot() {
  const world=new SimWorld();
  for(const b of world.state.buildings){b.paused=true;b.progress=0;b.ready=false;b.stock={};}
  world.state.resources=emptyResources();world.state.taxRate=0;
  const farm=world.state.buildings.find(b=>b.kind==='farm')!;farm.paused=false;
  return {world,farm};
}

test('old saves gain a garden without replacing the town or mutating the source',()=>{
  const original=new SimWorld().state;delete original.farming;original.coins=227655;
  const snapshot=structuredClone(original),world=new SimWorld(original);
  assert.deepEqual(original,snapshot);assert.equal(world.state.coins,227655);
  assert.deepEqual(world.state.buildings,original.buildings);assert.deepEqual(world.state.quests,original.quests);
  assert.equal(world.garden().level,1);assert.equal(world.garden().autoReplant,true);
  assert.equal(validateSave(world.state),true);
});

test('queued crop selection preserves growing and ripe wheat and starts after collection',()=>{
  const {world,farm}=plot();world.tick(10);const progress=farm.progress;
  assert.equal(world.plantCrop('carrot',farm.id).ok,true);assert.equal(farm.progress,progress);
  assert.equal(farm.nextCrop,'carrot');world.tick(30);const stock={...farm.stock};
  assert.equal(farm.ready,true);world.plantCrop('wheat',farm.id);assert.equal(farm.nextCrop,undefined);
  world.plantCrop('carrot',farm.id);assert.deepEqual(farm.stock,stock);
  world.collect(farm.id);assert.equal(farm.crop,'carrot');assert.equal(farm.progress,0);
  assert.equal(world.state.farming!.album.wheat,stock.wheat);assert.equal(farm.tended,1);
  assert.equal(validateSave(new SimWorld(world.state).state),true);
});

test('a queued vegetable can finish wheat that rested at its inventory target',()=>{
  const {world,farm}=plot();farm.progress=.5;world.state.resources.wheat=world.stockTargets().wheat;
  world.plantCrop('carrot',farm.id);world.tick(30);assert.equal(farm.ready,true);
  world.collect(farm.id);assert.equal(farm.crop,'carrot');
});

test('bulk planting keeps one wheat field for processing; individual choice stays free',()=>{
  const {world}=plot(),fields=world.state.buildings.filter(b=>b.kind==='farm');assert.ok(fields.length>1);
  world.plantCrop('carrot');assert.equal(fields[0].crop,'wheat');
  assert.ok(fields.slice(1).every(b=>b.crop==='carrot'));
  world.plantCrop('carrot',fields[0].id);assert.equal(fields[0].crop,'carrot');
});

test('locked and invalid crop requests are atomic, all nine varieties unlock by level eight',()=>{
  const {world,farm}=plot(),before=JSON.stringify(world.state);
  assert.equal(world.plantCrop('apple',farm.id).code,'CROP_LOCKED');
  assert.equal(executeGameTool(world,'plant_crop',{cropId:'gold'}).ok,false);
  assert.equal(world.plantCrop('carrot','missing').ok,false);assert.equal(JSON.stringify(world.state),before);
  world.state.farming!.xp=2240;assert.equal(world.garden().level,8);
  for(const crop of CROP_IDS){assert.equal(world.plantCrop(crop,farm.id).ok,true);assert.equal(farm.crop,crop);assert.equal(validateSave(world.state),true);}
});

test('vegetables grow in full warehouses, keep their quote after restore and pay exactly once',()=>{
  const {world,farm}=plot();world.state.resources.wood=world.state.capacity;
  world.plantCrop('carrot',farm.id);world.tick(25);assert.equal(farm.ready,true);
  const quote=structuredClone(farm.cropHarvest!);assert.ok(quote.quantity>=5);
  const restored=new SimWorld(world.state),before=restored.state.coins,resources={...restored.state.resources};
  const result=restored.collect(farm.id),expected=quote.quantity*CROPS.carrot.price*(quote.rare?2:1);
  assert.equal(result.farmCoins,expected);assert.equal(restored.state.coins,before+expected);
  assert.deepEqual(restored.state.resources,resources);assert.equal(restored.state.farming!.album.carrot,quote.quantity);
  const after=JSON.stringify(restored.state);assert.equal(restored.collect(farm.id).ok,false);assert.equal(JSON.stringify(restored.state),after);
});

test('mixed harvest collects vegetables even when ready wheat cannot fit',()=>{
  const {world,farm}=plot();world.plantCrop('carrot',farm.id);world.tick(25);
  const other=world.state.buildings.find(b=>b.kind==='farm'&&b.id!==farm.id)!;
  other.ready=true;other.stock={wheat:4};other.progress=1;world.state.resources.wood=world.state.capacity;
  const result=world.collectAll();assert.equal(result.ok,true);assert.ok(result.farmCoins!>0);
  assert.equal(other.ready,true);assert.deepEqual(other.stock,{wheat:4});assert.equal(world.state.farming!.album.wheat,0);
});

test('soil grows through harvests and changes the next cycle, without spending materials',()=>{
  const {world,farm}=plot();world.plantCrop('carrot',farm.id);farm.tended=7;
  const before=world.garden().fields.find(b=>b.id===farm.id)!;world.tick(25);world.collect(farm.id);
  const after=world.garden().fields.find(b=>b.id===farm.id)!;
  assert.equal(after.soil.level,2);assert.ok(after.cycle<before.cycle);
  assert.equal(harvestQuote('carrot',1,8,2).quantity>=6,true);
  assert.deepEqual([0,8,24,60,140].map(n=>soilLevel(n).level),[1,2,3,4,5]);
});

test('garden levels naturally grant seeds and two community places per level',()=>{
  const {world,farm}=plot(),capacity=world.communityCapacity();world.state.farming!.xp=79;
  world.plantCrop('carrot',farm.id);world.tick(25);world.collect(farm.id);
  assert.equal(world.garden().level,2);assert.equal(world.communityCapacity(),capacity+2);
  assert.equal(world.garden().crops.find(c=>c.id==='corn')!.unlocked,true);
  assert.equal(gardenLevel(1_000_000).level,30);assert.equal(gardenLevel(1_000_000).next,0);
});

test('turning off replant finishes the present crop and then waits; seeds wake only chosen land',()=>{
  const {world,farm}=plot();world.plantCrop('carrot',farm.id);world.tick(10);world.setAutoReplant(false);
  world.tick(20);assert.equal(farm.ready,true);world.collect(farm.id);assert.equal(farm.fallow,true);
  world.tick(60);assert.equal(farm.progress,0);world.plantCrop('carrot',farm.id);assert.equal(farm.fallow,false);
  world.tick(25);assert.equal(farm.ready,true);world.collect(farm.id);farm.paused=true;
  world.setAutoReplant(true);assert.equal(farm.fallow,false);assert.equal(farm.paused,true);
});

test('offline farming settles fractional cycles, soil, album and sale receipts consistently',()=>{
  const {world,farm}=plot();world.plantCrop('carrot',farm.id);world.tick(7);
  const online=new SimWorld(world.state),offline=new SimWorld(world.state),coins=offline.state.coins;
  for(let i=0;i<700;i++){online.tick(.1);if(online.state.buildings.find(b=>b.id===farm.id)!.ready)online.collect(farm.id);}
  const report=offline.offline(70);
  assert.deepEqual(offline.state.farming,online.state.farming);
  assert.equal(offline.state.coins,coins+report.coins);assert.equal(report.coins,report.farmCoins);
  assert.equal(report.cropQuantity,offline.state.farming!.harvested);assert.equal(validateSave(offline.state),true);
});

test('offline ripe queued crops respect rest mode and cannot be settled twice',()=>{
  const {world,farm}=plot();world.tick(30);world.plantCrop('carrot',farm.id);world.setAutoReplant(false);
  const anchor=world.state.savedAt,report=world.offlineUntil(anchor+100000);
  assert.equal(report.produced.wheat,4);assert.equal(farm.crop,'carrot');assert.equal(farm.fallow,true);
  assert.equal(world.state.farming!.album.carrot,0);assert.equal(farm.tended,1);
  const before=structuredClone(world.state.farming);assert.equal(world.offlineUntil(anchor+100000).seconds,0);
  assert.deepEqual(world.state.farming,before);
});

test('eight offline hours preserve resource accounting and fruit never consumes warehouse space',()=>{
  const {world,farm}=plot();world.plantCrop('carrot',farm.id);
  world.state.resources={...emptyResources(),wood:120,fish:120};
  const before={...world.state.resources},coins=world.state.coins,report=world.offline(MAX_OFFLINE_SECONDS*2);
  assert.equal(report.seconds,MAX_OFFLINE_SECONDS);assert.equal(report.capped,true);
  assert.ok(report.cropQuantity!>1000);assert.equal(world.state.coins,coins+report.coins);
  for(const key of RESOURCE_KEYS)assert.equal(world.state.resources[key],before[key]+report.produced[key]-report.consumed[key]);
  assert.equal(validateSave(world.state),true);
});

test('malformed farming state and harvest snapshots are rejected instead of losing a save silently',()=>{
  const {world,farm}=plot();world.plantCrop('carrot',farm.id);world.tick(25);
  assert.equal(validateSave(world.state),true);
  const variants=[(s:any)=>s.farming.album.carrot++, (s:any)=>s.farming.rare.carrot=99,
    (s:any)=>s.farming.autoReplant='yes',(s:any)=>s.buildings[0].crop='carrot',
    (s:any)=>s.buildings.find((b:any)=>b.id===farm.id).cropHarvest.quantity=-1,
    (s:any)=>s.buildings.find((b:any)=>b.id===farm.id).cropHarvest.crop='corn',
    (s:any)=>s.buildings.find((b:any)=>b.id===farm.id).fallow='yes'];
  for(const alter of variants){const invalid=structuredClone(world.state);alter(invalid);assert.equal(validateSave(invalid),false);}
});

test('garden tools validate booleans and apply the same crop unlock rules as the UI',()=>{
  const {world,farm}=plot();const before=JSON.stringify(world.state);
  assert.equal(executeGameTool(world,'set_auto_replant',{enabled:'false'}).ok,false);
  assert.equal(executeGameTool(world,'plant_crop',{cropId:'apple',buildingId:farm.id}).ok,false);
  assert.equal(JSON.stringify(world.state),before);
  assert.equal(executeGameTool(world,'set_auto_replant',{enabled:false}).ok,true);
  assert.equal(executeGameTool(world,'plant_crop',{cropId:'carrot',buildingId:farm.id}).ok,true);
  const read=executeGameTool(world,'get_garden');assert.equal(read.ok,true);
  world.garden().album.carrot=123;assert.equal(world.state.farming!.album.carrot,0);
});
