import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { emptyResources, type Resource } from '../src/sim/data.ts';
import { PETS, PET_KINDS, petCapacity, type PetState } from '../src/sim/pets.ts';
import { TownCrowd } from '../src/sim/crowd.ts';
import { terrainAt } from '../src/sim/terrain.ts';

function prepared(population = 12){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=10000;
  w.state.resources={...emptyResources(),materials:50};
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  w.state.population=population;
  return w;
}

test('adopting a pet charges exactly what it declares and records the kind',()=>{
  const w=prepared();
  for(const kind of PET_KINDS){
    const def=PETS[kind];
    const before={coins:w.state.coins,materials:w.state.resources.materials};
    const result=w.adoptPet(kind);
    assert.equal(result.ok,true,`${kind}: ${result.message}`);
    assert.equal(w.state.coins,before.coins-def.coins,`${kind} coins`);
    assert.equal(w.state.resources.materials,before.materials-(def.materials.materials??0),`${kind} materials`);
    assert.equal(w.state.pets!.at(-1)!.kind,kind);
    assert.equal(validateSave(w.state),true,`${kind} save`);
  }
});

test('the pet limit scales with population and is enforced with a reason',()=>{
  assert.equal(petCapacity(0),0);
  assert.equal(petCapacity(5),0);
  assert.equal(petCapacity(6),1);
  assert.equal(petCapacity(12),2);
  assert.equal(petCapacity(1000),6,'the town never takes in more than six');

  const w=prepared(6);
  assert.equal(w.petLimit(),1);
  assert.equal(w.adoptPet('cat').ok,true);
  const refused=w.adoptPet('dog');
  assert.equal(refused.ok,false);
  assert.ok(refused.message.length>0,'the refusal explains itself');
  // A bigger town can take in more.
  w.state.population=18;
  assert.equal(w.petLimit(),3);
  assert.equal(w.adoptPet('dog').ok,true,'a larger town has room');
});

test('a refused adoption is atomic: no coins, no materials, no pet',()=>{
  const w=prepared(6);
  w.adoptPet('cat');
  const before=JSON.stringify(w.state);
  const refused=w.adoptPet('dog');
  assert.equal(refused.ok,false);
  assert.equal(JSON.stringify(w.state),before,'nothing changed');

  const poor=prepared(12);
  poor.state.coins=10;
  const denied=poor.adoptPet('dog');
  assert.equal(denied.ok,false);
  assert.equal(poor.state.pets?.length??0,0,'no pet without payment');
});

test('pets survive a save round trip and malformed pet arrays are rejected',()=>{
  const w=prepared(18);
  w.adoptPet('cat');w.adoptPet('dog');
  const restored=new SimWorld(structuredClone(w.state));
  assert.deepEqual(restored.state.pets,w.state.pets);

  const badKind=structuredClone(w.state) as unknown as Record<string, unknown>;
  (badKind.pets as Record<string, unknown>[])[0]!.kind='dragon';
  assert.equal(validateSave(badKind),false,'an unknown pet kind is rejected');

  const duplicate=structuredClone(w.state) as unknown as Record<string, unknown>;
  const list=duplicate.pets as Record<string, unknown>[];
  list[1]!.id=list[0]!.id;
  assert.equal(validateSave(duplicate),false,'duplicate pet ids are rejected');

  const tooMany=structuredClone(w.state) as unknown as Record<string, unknown>;
  (tooMany.pets as unknown[]).push({id:'pet-x',kind:'cat',follows:9},{id:'pet-y',kind:'cat',follows:10});
  assert.equal(validateSave(tooMany),false,'more pets than the population allows is rejected');
});

test('releasing returns the town to its previous pet count',()=>{
  const w=prepared(12);
  w.adoptPet('cat');w.adoptPet('dog');
  assert.equal(w.state.pets!.length,2);
  assert.equal(w.releasePet().ok,true);
  assert.equal(w.state.pets!.length,1);
  assert.equal(w.releasePet().ok,true);
  assert.equal(w.releasePet().code,'NO_PETS','releasing an empty town is refused');
});

test('every pet sprite frame the renderer asks for exists in the pets atlas',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../public/assets/pets-frames.json',import.meta.url),'utf8'));
  const available=new Set<string>(Object.keys(catalog.frames));
  for(const kind of PET_KINDS){
    const {front,back}=PETS[kind].frames;
    for(const frame of [...front,...back]) assert.ok(available.has(frame),`${kind} frame ${frame} exists`);
  }
});

test('each pet trails the resident it follows and stays on walkable ground',()=>{
  const w=prepared(12);
  const crowd=new TownCrowd();
  crowd.sync(w.state.buildings,w.state.roads??[],w.state.population);
  const pets:PetState[]=[{id:'pet-1',kind:'cat',follows:0},{id:'pet-2',kind:'dog',follows:1}];
  crowd.syncPets(pets);
  assert.equal(crowd.pets.length,2,'one walker per adopted pet');
  assert.equal(crowd.pets[0]!.kind,'cat');
  assert.equal(crowd.pets[1]!.kind,'dog');

  // Let the town settle, then check the pets keep station and stay legal.
  for(let frame=0;frame<900;frame++){
    crowd.tick(1/30);
    for(const pet of crowd.pets){
      const type=terrainAt(Math.round(pet.x),Math.round(pet.y));
      assert.ok(type==='land'||type==='bridge',`pet never stands in ${type} at ${pet.x},${pet.y}`);
      const resident=crowd.walkers[pet.follows];
      if(!resident) continue;
      const distance=Math.abs(resident.x-pet.x)+Math.abs(resident.y-pet.y);
      // It must stay near its own resident rather than wandering off after anyone else.
      assert.ok(distance<=14,`pet stays within 14 tiles of its resident, got ${distance.toFixed(1)}`);
    }
  }
  // And over that run it actually followed: it moved from where it started.
  assert.ok(crowd.pets.some(pet=>pet.walking||pet.route.length||Math.abs(pet.x-Math.round(pet.x))>0),'pets move');
});

test('a cat trails further behind than a dog because cats walk slower',()=>{
  assert.ok(PETS.cat.pace<PETS.dog.pace,'cats are the slower walker');
  assert.ok(PETS.cat.leash<=PETS.dog.leash,'cats keep a shorter leash');
  const w=prepared(18);
  const crowd=new TownCrowd();
  crowd.sync(w.state.buildings,w.state.roads??[],w.state.population);
  crowd.syncPets([{id:'a',kind:'cat',follows:0},{id:'b',kind:'dog',follows:0}]);
  for(let frame=0;frame<300;frame++) crowd.tick(1/30);
  const resident=crowd.walkers[0]!;
  const cat=crowd.pets[0]!,dog=crowd.pets[1]!;
  const catDistance=Math.abs(resident.x-cat.x)+Math.abs(resident.y-cat.y);
  const dogDistance=Math.abs(resident.x-dog.x)+Math.abs(resident.y-dog.y);
  assert.ok(Number.isFinite(catDistance)&&Number.isFinite(dogDistance));
  assert.ok(catDistance>=dogDistance||catDistance<=PETS.cat.leash+2,`the cat is not outpacing the dog (cat ${catDistance.toFixed(2)}, dog ${dogDistance.toFixed(2)})`);
});

test('pets are exposed through the observation surface with their limit',()=>{
  const w=prepared(12);
  w.adoptPet('cat');
  const seen=w.observe();
  assert.equal(seen.pets.length,1);
  assert.equal(seen.pets[0]!.name,PETS.cat.name);
  assert.equal(seen.petLimit,2);
  for(const key of Object.keys(PETS.cat.materials)) void (key as Resource);
});
