import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, type Building } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCE_KEYS, emptyResources, type BuildingKind } from '../src/sim/data.ts';
import { executeGameTool } from '../src/sim/tools.ts';

function isolated(kind: BuildingKind) {
  const world = new SimWorld();
  world.state.resources = emptyResources();
  for (const b of world.state.buildings) { b.paused=true; b.ready=false; b.stock={}; b.progress=0; }
  const b = world.state.buildings.find(b=>b.kind===kind)!;
  b.paused=false;
  return {world,b};
}

test('full warehouses still allow equal-volume and space-saving processing', () => {
  const {world,b}=isolated('windmill');
  world.state.resources.wheat=world.state.capacity;
  world.tick(28);
  assert.equal(b.ready,true);
  assert.equal(world.collect(b.id).ok,true);
  assert.equal(world.state.resources.flour,3);
  assert.equal(world.observe().warehouseFree,0);
  assert.equal(validateSave(world.state),true);
});

test('sources rest at target, preserve progress, and resume after stock is used', () => {
  const {world,b}=isolated('farm');
  world.state.resources.wheat=world.stockTargets().wheat;
  b.progress=.4;
  world.tick(30);
  assert.equal(b.ready,false); assert.equal(b.progress,.4);
  assert.equal(world.observe().production.find(p=>p.buildingId===b.id)!.blocked,'target');
  world.sell('wheat',5); world.tick(30);
  assert.equal(b.ready,true);
});

test('pending harvest is counted toward quotas so many farms cannot flood storage', () => {
  const world=new SimWorld(); world.state.resources=emptyResources();
  for(const b of world.state.buildings){b.ready=false;b.stock={};b.progress=0;b.paused=b.kind!=='farm';}
  for(let i=0;i<60;i++)world.tick(1);
  const wheat=world.state.buildings.reduce((n,b)=>n+(b.stock.wheat??0),0);
  assert.ok(wheat<=world.stockTargets().wheat+BUILDINGS.farm.output!.wheat!);
});

test('wood directions persist, validate, and never rewrite completed harvests', () => {
  const {world,b}=isolated('lumber');
  const before=JSON.stringify(world.state);
  assert.equal(world.setProductionFocus(b.id,'gold').ok,false);
  assert.equal(JSON.stringify(world.state),before);
  assert.equal(executeGameTool(world,'set_production_focus',{buildingId:b.id,recipeId:'wood'}).ok,true);
  world.tick(24); assert.deepEqual(b.stock,{wood:10});
  world.setProductionFocus(b.id,'plank'); assert.deepEqual(b.stock,{wood:10});
  world.collect(b.id); world.tick(24); assert.deepEqual(b.stock,{wood:2,plank:4});
  const restored=new SimWorld(world.state);
  assert.equal(restored.state.buildings.find(x=>x.id===b.id)!.productionFocus,'plank');
  const invalid=structuredClone(world.state); invalid.buildings[0].productionFocus='wood';
  assert.equal(validateSave(invalid),false);
});

test('full boards never block replenishing wood in balanced mode', () => {
  const {world,b}=isolated('lumber');
  world.state.resources.plank=world.stockTargets().plank;
  world.tick(24); assert.deepEqual(b.stock,{wood:10});
});

test('kilns protect construction timber online and offline, kitchens can still bake', () => {
  const {world}=isolated('bakery');
  world.state.researched=['mining'];
  for(const b of world.state.buildings){b.workers=0;b.staffing=0;b.staffing=0;}
  const kiln: Building={id:'test-kiln',kind:'kiln',x:2,y:2,level:1,paused:false,ready:false,stock:{},progress:.5,workers:1};
  world.state.buildings.push(kiln);
  world.state.resources.wood=world.woodReserve(); world.state.resources.flour=6;
  world.tick(32); assert.equal(kiln.progress,.5);
  world.offline(100); assert.equal(world.state.resources.wood,world.woodReserve());
  const bakery=world.state.buildings.find(b=>b.kind==='bakery')!;
  bakery.workers=2; world.tick(38);
  assert.equal(bakery.ready,true); assert.equal(world.state.resources.wood,world.woodReserve()-1);
});

test('surplus sale preserves timber, caravan materials and all visible orders; pays once', () => {
  const world=new SimWorld(); world.state.capacity=3360;
  world.state.resources={...emptyResources(),wood:67,stone:339,wheat:943,flour:598,plank:6,materials:56,ore:1,charcoal:31,ingot:14,tools:254,feed:271,wool:1,clothing:759};
  const quote=world.surplusQuote(), before=structuredClone(world.state);
  assert.ok(quote.quantity>1800); assert.equal(quote.items.wood,undefined); assert.equal(quote.items.materials,undefined);
  assert.equal(world.sellSurplus().ok,true);
  assert.equal(world.state.coins,before.coins+quote.coins);
  for(const key of RESOURCE_KEYS) assert.equal(world.state.resources[key],before.resources[key]-(quote.items[key]??0));
  for(const order of world.state.orders) for(const key of RESOURCE_KEYS) if(before.resources[key]>=(order.items[key]??0)) assert.ok(world.state.resources[key]>=(order.items[key]??0));
  const after=JSON.stringify(world.state);
  assert.equal(world.sellSurplus().code,'NO_SURPLUS'); assert.equal(JSON.stringify(world.state),after);
});

test('mayor clears bulky surplus, harvests food and still completes orders', () => {
  const world=new SimWorld(); world.state.capacity=1000; world.state.settings.autoMayor=true;
  world.state.resources={...emptyResources(),wood:22,wheat:970};
  world.tick(5);
  assert.ok(world.state.resources.wheat<200);
  assert.ok(world.state.resources.wood>=22,'never sells scarce timber first');
  assert.ok(world.state.resources.fish>0);
  for(let i=0;i<300;i++)world.tick(1);
  assert.ok(world.state.stats.ordersCompleted>0,'harvesting must not starve order handling');
});

function expandedTown() {
  const world=new SimWorld();
  world.state.capacity=2560; // base space + ten level-three warehouses
  world.state.buildings.find(b=>b.kind==='warehouse')!.level=3;
  for(let i=0;i<9;i++)world.state.buildings.push({id:`barn-${i}`,kind:'warehouse',x:2+i,y:2,level:3,paused:false,ready:false,stock:{},progress:0,workers:0});
  world.state.resources={...emptyResources(),wood:10,wheat:1800,flour:600};
  assert.equal(validateSave(world.state),true);
  world.sellSurplus();
  return world;
}

test('ten upgraded warehouses sustain eight offline hours without wheat crowding out food or wood', () => {
  const world=expandedTown(), before={...world.state.resources};
  const report=world.offline(8*3600), targets=world.stockTargets();
  assert.ok(world.state.resources.wood>=targets.wood-10);
  assert.ok(world.state.resources.bread+world.state.resources.fish>=Math.ceil(world.state.population/4)*3);
  assert.ok(world.state.resources.wheat<=targets.wheat+4);
  assert.ok(world.observe().warehouseUsed<world.state.capacity*.9);
  assert.ok(report.produced.fish>500,'food production resumes as residents consume it');
  for(const key of RESOURCE_KEYS)assert.equal(world.state.resources[key],before[key]+report.produced[key]-report.consumed[key]);
  assert.equal(validateSave(world.state),true);
});

test('extended manual harvest play retains food and timber with ten warehouses', () => {
  const world=expandedTown();
  for(let seconds=0;seconds<3600;seconds++){world.tick(1);if(seconds%5===0)world.collectAll();}
  assert.ok(world.state.resources.wood>200);
  assert.ok(world.state.resources.bread+world.state.resources.fish>20);
  assert.ok(world.observe().warehouseUsed<world.state.capacity*.9);
  assert.equal(validateSave(world.state),true);
});
