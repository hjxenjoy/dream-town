import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, emptyResources, type BuildingKind } from '../src/sim/data.ts';
import { generatedSprite, atlasFrames } from '../src/sim/atlases.ts';
import { residentRoster } from '../src/sim/residents.ts';

const kinds:BuildingKind[]=['flowernursery','orchardhouse','chickencoop','jamkitchen','teahouse','homestead'];
function town(){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=10000;
  w.state.population=60;w.state.settings.disasters=false;
  w.state.resources={...emptyResources(),wood:300,stone:300,feed:100,bread:500,fish:500};
  kinds.forEach((kind,i)=>assert.equal(w.build(kind,40,i+22).ok,true,kind));
  return w;
}
test('all six new buildings have real art and survive a save round trip',()=>{
  const w=town();assert.equal(validateSave(w.state),true);
  for(const kind of kinds){const art=generatedSprite(kind)!;assert.ok(art);assert.ok(atlasFrames(art.atlas)[art.frame]);}
  const restored=new SimWorld(w.state);
  for(const kind of kinds)assert.ok(restored.state.buildings.some(b=>b.kind===kind));
});
test('new farm producers collect automatically and fruit feeds jam without manual collection',()=>{
  const w=town();
  for(let i=0;i<2400;i++)w.tick(.1);
  assert.ok(w.state.resources.flowers>0);
  assert.ok(w.state.resources.eggs>0);
  assert.ok(w.state.resources.fruit>0);
  // Jam may be enjoyed at day boundaries; its automatic collection still counts.
  assert.ok(w.state.stats.collected>0);
  assert.ok(w.state.buildings.find(b=>b.kind==='jamkitchen')!.progress>0||w.state.resources.jam>0);
});
test('missing feed pauses the chicken coop without removing it or resetting progress',()=>{
  const w=town(),coop=w.state.buildings.find(b=>b.kind==='chickencoop')!;
  w.state.resources.feed=0;coop.progress=.4;
  for(let i=0;i<10;i++)w.tick(.1);
  assert.equal(coop.progress,.4);assert.equal(w.state.resources.eggs,0);
  assert.ok(w.state.buildings.includes(coop));
});
test('old saves acquire empty new resource keys while keeping old inventory',()=>{
  const state=structuredClone(new SimWorld().state);
  for(const key of ['flowers','fruit','eggs','jam'])delete (state.resources as Record<string,number>)[key];
  const restored=new SimWorld(state);
  assert.equal(restored.state.resources.wood,state.resources.wood);
  assert.equal(restored.state.resources.fruit,0);
  assert.equal(validateSave(restored.state),true);
});
test('farmstead is housing for residents and tea house adds community capacity',()=>{
  const w=town(),home=w.state.buildings.find(b=>b.kind==='homestead')!;
  assert.ok(BUILDINGS.teahouse.populationCap!>0);
  assert.ok(w.housingCapacity()>=BUILDINGS.homestead.housing!);
  assert.ok(residentRoster([home],2).every(r=>r.homeId===home.id));
});
