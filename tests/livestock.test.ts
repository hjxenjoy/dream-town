import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, type Building } from '../src/sim/world.ts';
import { emptyResources } from '../src/sim/data.ts';
import { chickAge, raiseChicks } from '../src/sim/livestock.ts';
const chick=():Building=>({id:'chick',kind:'chickencoop',x:40,y:22,level:1,progress:0,ready:false,paused:false,stock:{},workers:1,animalAge:0});
test('juvenile needs one ration, carries partial age and uses only remaining time after maturity',()=>{
 const b=chick(),r=emptyResources();assert.equal(raiseChicks(b,r,30),0);assert.equal(b.animalAge,0);
 r.feed=1;assert.equal(raiseChicks(b,r,30),0);assert.equal(b.animalAge,30);assert.equal(r.feed,0);
 b.paused=true;raiseChicks(b,r,30);assert.equal(b.animalAge,30);
 b.paused=false;assert.equal(raiseChicks(b,r,80),20);assert.equal(b.animalAge,90);
 assert.equal(raiseChicks(b,r,30),30);assert.equal(r.feed,0);
});
function town(){const w=new SimWorld();w.state.capacity=10000;w.state.coins=100000;w.state.resources={...emptyResources(),wood:100,stone:100,feed:50,bread:300,fish:300};w.state.settings.disasters=false;assert.ok(w.build('chickencoop',40,22).ok);return w;}
test('online and offline juveniles consume one ration and cannot lay eggs early',()=>{
 const a=town(),b=new SimWorld(a.state);const coop=(w:SimWorld)=>w.state.buildings.find(v=>v.kind==='chickencoop')!;
 a.tick(30);const report=b.offline(30);
 assert.equal(coop(a).animalAge,30);assert.equal(coop(b).animalAge,30);assert.equal(a.state.resources.eggs,0);assert.equal(report.produced.eggs,0);assert.equal(report.consumed.feed,1);
 assert.equal(validateSave(a.state),true);assert.equal(new SimWorld(a.state).state.buildings.find(v=>v.kind==='chickencoop')!.animalAge,30);
 coop(a).animalAge=91;assert.equal(validateSave(a.state),false);
});
test('existing coops without growth fields remain adults',()=>{
 const b=chick();delete b.animalAge;assert.equal(chickAge(b),90);
 const r=emptyResources();assert.equal(raiseChicks(b,r,45),45);assert.equal(b.animalAge,undefined);
});

test('lambs and calves require two feed and mature before producing, including offline',()=>{
 for(const [kind,seconds,resource] of [['pasture',120,'wool'],['cowbarn',150,'milk']] as const){
  const w=town();w.state.researched.push('husbandry');assert.ok(w.build(kind,40,24).ok);
  const b=w.state.buildings.find(v=>v.kind===kind)!;b.workers=1;
  const r=emptyResources();r.feed=1;assert.equal(raiseChicks(b,r,40),0);assert.equal(b.animalAge,0);assert.equal(r.feed,1);
  r.feed=2;assert.equal(raiseChicks(b,r,40),0);assert.equal(b.animalAge,40);assert.equal(r.feed,0);
  const restored=new SimWorld(w.state);assert.equal(validateSave(restored.state),true);
  const report=restored.offline(20);assert.equal(report.produced[resource],0);
  assert.equal(restored.state.buildings.find(v=>v.id===b.id)!.animalAge,60);
  assert.equal(raiseChicks(b,r,seconds),40);assert.equal(chickAge(b),seconds);
 }
});

test('animal frames change at maturity and older saves display adults',async()=>{
 const { livestockFrame }=await import('../src/sim/livestock.ts');
 for(const [kind,age,young,adult] of [['chickencoop',90,'chicks','hens'],['pasture',120,'lamb','sheep'],['cowbarn',150,'calf','cow']] as const){
  const b=chick();b.kind=kind;b.animalAge=age-1;assert.equal(livestockFrame(b),young);
  b.animalAge=age;assert.equal(livestockFrame(b),adult);
  delete b.animalAge;assert.equal(livestockFrame(b),adult);
 }
});

test('adult cows and sheep collect a ready batch automatically',()=>{
 for(const [kind,resource,quantity] of [['pasture','wool',3],['cowbarn','milk',4]] as const){
  const w=town();w.state.researched.push('husbandry');assert.ok(w.build(kind,40,24).ok);
  const b=w.state.buildings.find(v=>v.kind===kind)!;delete b.animalAge;
  b.ready=true;b.progress=1;b.stock={[resource]:quantity};
  const before=w.state.resources[resource];w.tick(.1);
  assert.equal(w.state.resources[resource],before+quantity);assert.equal(b.ready,false);
 }
});
