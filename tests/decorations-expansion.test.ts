import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, emptyResources, type BuildingKind } from '../src/sim/data.ts';
import { GENERATED_ATLASES, GENERATED_ATLAS_KEYS, atlasFrames, generatedSprite, housingLevelFrame } from '../src/sim/atlases.ts';
import { ORNAMENT_REQUIREMENTS as ORNAMENT_MAP } from '../src/sim/collections.ts';
const ORNAMENT_KINDS = Object.keys(ORNAMENT_MAP) as BuildingKind[];
import { DISASTER_KINDS, canStrike } from '../src/sim/disasters.ts';

const STREET_DECOR: BuildingKind[] = ['flowerbox', 'trellis', 'archlights', 'boardwalk', 'railing', 'parasol', 'willow', 'dock', 'crates', 'barrels', 'anvil', 'signflags'];

function prepared(){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=10000;
  w.state.resources={...emptyResources(),wood:600,stone:600,materials:200};
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  for(const b of w.state.buildings){b.paused=true;b.workers=0;b.staffing=0;b.progress=0;b.ready=false;b.stock={};}
  return w;
}

test('every street decoration builds, costs exactly what it declares, and improves the environment',()=>{
  for(const kind of STREET_DECOR){
    const w=prepared();
    const def=BUILDINGS[kind];
    assert.equal(def.category,'decoration',`${kind} is a decoration`);
    assert.ok(def.environment&&def.environment>0,`${kind} improves the environment`);
    assert.equal(def.workers,undefined,`${kind} needs no workers`);
    const before={coins:w.state.coins,wood:w.state.resources.wood,stone:w.state.resources.stone};
    const result=w.build(kind,38,40);
    assert.equal(result.ok,true,`${kind}: ${result.message}`);
    assert.equal(w.state.coins,before.coins-def.cost,`${kind} coins`);
    assert.equal(w.state.resources.wood,before.wood-def.wood,`${kind} wood`);
    assert.equal(w.state.resources.stone,before.stone-def.stone,`${kind} stone`);
    assert.equal(validateSave(w.state),true,`${kind} save`);
  }
});

test('street decorations are never hazard targets and survive a save round trip',()=>{
  const w=prepared();
  const initial=w.state.buildings.length;
  for(const [i,kind] of STREET_DECOR.entries()) w.build(kind,34+i%6,44+Math.floor(i/6));
  assert.equal(w.state.buildings.length,initial+STREET_DECOR.length);
  const restored=new SimWorld(structuredClone(w.state));
  assert.equal(validateSave(restored.state),true);
  assert.deepEqual(restored.state.buildings.map(b=>`${b.kind}@${b.x},${b.y}`).sort(),w.state.buildings.map(b=>`${b.kind}@${b.x},${b.y}`).sort());

  // No hazard reaches a decoration, in any season, even unprotected.
  for(const kind of DISASTER_KINDS){
    for(const season of ['spring','summer','autumn','winter'] as const){
      for(const decor of STREET_DECOR){
        const built=w.state.buildings.find(b=>b.kind===decor)!;
        assert.equal(canStrike(kind,built,season,false),false,`${kind}/${season} must not strike ${decor}`);
      }
    }
  }
});

test('a street decoration can be relocated and demolished like any other decoration',()=>{
  const w=prepared();
  const built=w.build('parasol',38,40);
  assert.equal(built.ok,true);
  const id=built.buildingId!;
  assert.equal(w.moveBuilding(id,40,42).ok,true,'free relocation');
  const after=w.state.buildings.find(b=>b.id===id)!;
  assert.equal(after.x,40);assert.equal(after.y,42);
  assert.equal(w.demolish(id).ok,true);
  assert.equal(w.state.buildings.some(b=>b.id===id),false);
});

test('rooms and roads still mutually exclude every new decoration',()=>{
  const w=prepared();
  assert.equal(w.build('barrels',38,40).ok,true);
  const blocked=w.build('crates',38,40);
  assert.equal(blocked.ok,false,'two decorations cannot share a tile');
  const roadBefore=JSON.stringify(w.state.roads??[]);
  assert.equal(w.paveRoad({x:38,y:40},{x:40,y:40},'dirt').ok,false,'a road cannot cross a decoration');
  assert.equal(JSON.stringify(w.state.roads??[]),roadBefore,'a rejected road changes nothing');
});

test('cottage and farmhouse art changes with level, everything else keeps one sprite',()=>{
  for(const kind of ['cottage','farmhouse'] as const){
    const frames=['1','2','3'].map(level=>housingLevelFrame(kind,Number(level))!.frame);
    assert.equal(new Set(frames).size,3,`${kind} has three distinct level frames`);
    assert.equal(housingLevelFrame(kind,0)!.frame,frames[0],'level clamps up');
    assert.equal(housingLevelFrame(kind,9)!.frame,frames[2],'level clamps down');
  }
  assert.equal(housingLevelFrame('windmill',1),null,'other buildings have no level art');
});

test('every generated atlas frame the renderer asks for actually exists',()=>{
  // The registry must never point at a frame the catalog does not define.
  for(const atlas of GENERATED_ATLAS_KEYS){
    const frames=atlasFrames(atlas);
    const {width,height}=GENERATED_ATLASES[atlas];
    assert.ok(Object.keys(frames).length>0,`${atlas} has frames`);
    for(const [name,f] of Object.entries(frames)){
      assert.ok(f.x>=0&&f.y>=0&&f.w>0&&f.h>0,`${atlas}/${name} is a positive rectangle`);
      assert.ok(f.x+f.w<=width&&f.y+f.h<=height,`${atlas}/${name} stays inside the atlas`);
    }
  }
  for(const kind of STREET_DECOR){
    const sprite=generatedSprite(kind)!;
    assert.ok(sprite,`${kind} resolves to an atlas`);
    assert.ok(atlasFrames(sprite.atlas)[sprite.frame],`${kind} -> ${sprite.atlas}/${sprite.frame} exists`);
  }
  for(const kind of ['cottage','farmhouse'] as const){
    for(const level of [1,2,3]){
      const sprite=housingLevelFrame(kind,level)!;
      assert.ok(atlasFrames(sprite.atlas)[sprite.frame],`${kind} L${level} -> ${sprite.frame} exists`);
    }
  }
});

test('the registry matches the shipped catalogs on disk',()=>{
  // Guards against editing the registry without regenerating the assets.
  for(const atlas of GENERATED_ATLAS_KEYS){
    const onDisk=JSON.parse(readFileSync(new URL(`../public${GENERATED_ATLASES[atlas].image.replace(/\.(webp|svg|png)$/, '-frames.json')}`,import.meta.url),'utf8'));
    assert.equal(GENERATED_ATLASES[atlas].width,onDisk.width,`${atlas} width`);
    assert.equal(GENERATED_ATLASES[atlas].height,onDisk.height,`${atlas} height`);
    assert.deepEqual(Object.keys(atlasFrames(atlas)).sort(),Object.keys(onDisk.frames).sort(),`${atlas} frame list`);
  }
});

test('the build catalog grows by twelve decorations without disturbing existing kinds',()=>{
  const built=STREET_DECOR.filter(kind=>BUILDINGS[kind]);
  assert.equal(built.length,12);
  // Adding kinds must not rename or reorder what a save already refers to.
  assert.equal(BUILDINGS.cottage.name,'林间小屋');
  assert.equal(BUILDINGS.windmill.cycle,28);
  // 41 base buildings, plus the street decorations, the dairy/wine industries, the
  // street-style ornaments, the chapel, the homestead buildings, the defence trio, the two
  // buildings of the sugar chain, and the hops field with the tavern that serves the beer.
  assert.equal(Object.keys(BUILDINGS).length,81,'69 before + 3 defence + castle + 2 sugar + 2 beer + 2 meat + 1 herb garden + 1 hunter lodge');
  assert.equal(Object.keys(BUILDINGS).filter(kind=>BUILDINGS[kind as keyof typeof BUILDINGS].category==='decoration').length,25,'nine trees and garden pieces plus twelve street decorations plus three ornaments plus the wall');
  // The ornaments are awarded by collecting a street style, never by research.
  assert.deepEqual(ORNAMENT_KINDS.filter(kind=>BUILDINGS[kind]).sort(),['flowercart','harvestpile','picniccorner']);
});
