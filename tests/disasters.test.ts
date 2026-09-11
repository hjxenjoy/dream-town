import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, emptyResources, TECHNOLOGY_KEYS, type BuildingKind } from '../src/sim/data.ts';
import { ALERT_FRAME_MS, ALERT_FRAMES, DISASTER_INTERVAL, DISASTER_KINDS, DISASTERS, HAZARD_FRAME_MS, REPAIR_FRAMES, REPAIR_SECONDS, canStrike, hazardOverlay, loopFrame, type SeasonKey } from '../src/sim/disasters.ts';
import { readFileSync } from 'node:fs';

/** A town with every blueprint unlocked, plenty of materials and no automation. */
function prepared(){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=10000;
  w.state.resources={...emptyResources(),wood:600,stone:600,materials:200,feed:100,charcoal:100,bread:100,fish:100};
  w.state.researched=[...TECHNOLOGY_KEYS];w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  for(const b of w.state.buildings){b.paused=true;b.workers=0;b.progress=0;b.ready=false;b.stock={};}
  return w;
}
function add(w:SimWorld,kind:BuildingKind,x=38,y=40){
  const r=w.build(kind,x,y);assert.equal(r.ok,true,r.message);
  return w.state.buildings.find(b=>b.id===r.buildingId)!;
}
/**
 * Drive one hazard strike. The slot index picks the hazard and the season comes from
 * the clock, so the test sets both explicitly instead of ticking for hours.
 */
function strike(w:SimWorld,kind:typeof DISASTER_KINDS[number],season:'spring'|'summer'|'autumn'|'winter'){
  const index=DISASTER_KINDS.indexOf(kind);
  let slot=index;
  const seasonIndex=['spring','summer','autumn','winter'].indexOf(season);
  while(slot<DISASTER_KINDS.length||Math.floor(slot*DISASTER_INTERVAL/360)%4!==seasonIndex)slot+=DISASTER_KINDS.length;
  const time=slot*DISASTER_INTERVAL;
  w.state.settings.disasters=true;
  w.state.gameTime=time-1;w.state.lastDisasterAt=0;
  w.tick(1);
}

test('each hazard strikes the buildings it belongs to and spares the rest',()=>{
  // Fire reaches homes, production and services; flood only the river plain; farm hazards only farmland.
  const w=prepared();w.state.buildings=[];
  const forest=add(w,'forester',38,40);      // industry, away from the river
  const house=add(w,'cottage',38,42);        // homes
  const field=add(w,'farm',35,42);           // farmland
  const well=add(w,'well',35,40);            // infrastructure
  strike(w,'fire','summer');
  const damaged=w.state.buildings.filter(b=>b.damaged).map(b=>b.id);
  assert.equal(damaged.length,1);
  assert.ok([forest.id,house.id].includes(damaged[0]),'fire hits a building, not the well or the field');
  assert.equal(forest.damageKind==='fire'||house.damageKind==='fire',true);
  assert.equal(BUILDINGS[well.kind].waterRadius!==undefined,true);
  assert.equal(well.damaged,undefined,'infrastructure is never struck');
  assert.equal(field.damaged,undefined,'farmland has its own hazards');
});

test('farm hazards only ever strike farmland, and only in their own season',()=>{
  const w=prepared();w.state.buildings=[];
  const field=add(w,'farm',38,40);
  add(w,'windmill',38,42);
  strike(w,'drought','summer');
  assert.equal(field.damaged,true);assert.equal(field.damageKind,'drought');
  field.damaged=false;delete field.damageKind;field.repairingUntil=undefined;
  strike(w,'insects','spring');
  assert.equal(field.damageKind,'insects');
});

test('hazards are seasonal: no strike in a season the hazard does not belong to',()=>{
  const w=prepared();w.state.buildings=[];
  add(w,'forester',38,40);
  // Fire is a spring/summer/autumn hazard; winter must be quiet.
  strike(w,'fire','winter');
  assert.equal(w.state.buildings.some(b=>b.damaged),false);
  assert.ok(w.state.logs.some(l=>l.message.includes('一切平安')));
});

test('flood only reaches the river plain, so placement is the player defence',()=>{
  const w=prepared();w.state.buildings=[];
  const near=add(w,'fishery',23,30);   // beside the river
  const far=add(w,'forester',40,30);   // inland
  strike(w,'flood','summer');
  const struck=w.state.buildings.filter(b=>b.damaged);
  assert.equal(struck.length,1);
  assert.equal(struck[0].id,near.id,'the flood plain building is the one that floods');
  assert.equal(far.damaged,undefined);
});

test('protective cover prevents a hazard, and losing the cover exposes the building',()=>{
  const w=prepared();w.state.buildings=[];
  const station=add(w,'firestation',38,40),factory=add(w,'forester',42,40);
  strike(w,'fire','summer');
  assert.equal(factory.damaged,undefined,'covered by the fire station');
  station.damaged=true;factory.damaged=false;
  strike(w,'fire','summer');
  assert.equal(factory.damaged,true,'a damaged station no longer protects');
});

test('repair is a timed job that charges the hazard cost once and restores production',()=>{
  const w=prepared();w.state.buildings=[];
  const factory=add(w,'forester',38,40);
  strike(w,'fire','summer');
  assert.equal(factory.damaged,true);
  const cost=DISASTERS.fire.repair;
  const coins=w.state.coins,wood=w.state.resources.wood,stone=w.state.resources.stone;
  assert.equal(w.repair(factory.id).ok,true);
  assert.equal(w.state.coins,coins-cost.coins);
  assert.equal(w.state.resources.wood,wood-cost.wood);
  assert.equal(w.state.resources.stone,stone-cost.stone);
  // Charging twice must be impossible while the scaffolding stands.
  const again=w.repair(factory.id);
  assert.equal(again.code,'REPAIR_IN_PROGRESS');
  assert.equal(w.state.coins,coins-cost.coins);
  // Still out of action until the work is done, then fully restored.
  w.tick(REPAIR_SECONDS-1);
  assert.equal(factory.damaged,true);
  w.tick(1.5);
  assert.equal(factory.damaged,false);
  assert.equal(factory.damageKind,undefined);
  assert.equal(factory.repairingUntil,undefined);
  assert.equal(validateSave(w.state),true);
});

test('repairs finish across offline time and never strand a building',()=>{
  const w=prepared();w.state.buildings=[];
  const factory=add(w,'forester',38,40);
  strike(w,'fire','summer');
  w.repair(factory.id);
  assert.equal(factory.damaged,true);
  w.offline(120);
  assert.equal(factory.damaged,false);
  assert.equal(w.state.buildings.some(b=>b.repairingUntil!==undefined),false);
  assert.equal(validateSave(w.state),true);
});

test('a damaged factory stops producing and resumes only after the repair completes',()=>{
  const w=prepared();w.state.buildings=[];
  const factory=add(w,'forester',38,40);
  factory.workers=BUILDINGS.forester.workers;factory.paused=false;
  strike(w,'fire','summer');
  assert.equal(factory.damaged,true);
  const progress=factory.progress;
  w.tick(60);
  assert.equal(factory.progress,progress,'no work while damaged');
  w.repair(factory.id);w.tick(REPAIR_SECONDS+1);
  w.tick(40);
  assert.equal(factory.ready,true,'back in production after the scaffolding comes down');
  assert.equal(validateSave(w.state),true);
});

test('hazard kind and repair timer survive a save round trip and are rejected when inconsistent',()=>{
  const w=prepared();w.state.buildings=[];
  const factory=add(w,'forester',38,40);
  strike(w,'fire','summer');
  w.repair(factory.id);
  const restored=new SimWorld(structuredClone(w.state));
  const copy=restored.state.buildings.find(b=>b.id===factory.id)!;
  assert.equal(copy.damaged,true);assert.equal(copy.damageKind,'fire');assert.equal(copy.repairingUntil,factory.repairingUntil);

  // A kind without damage, and a repair timer on an intact building, are both corrupt.
  const orphanKind=structuredClone(w.state) as typeof w.state;
  delete orphanKind.buildings.find(b=>b.id===factory.id)!.damaged;
  assert.equal(validateSave(orphanKind),false);
  const repairedButDamaged=structuredClone(w.state) as typeof w.state;
  repairedButDamaged.buildings.find(b=>b.id===factory.id)!.damaged=false;
  assert.equal(validateSave(repairedButDamaged),false);
});

test('unknown hazard kinds are refused rather than crashing the renderer',()=>{
  const w=prepared();w.state.buildings=[];
  add(w,'forester',38,40);
  strike(w,'fire','summer');
  // Corrupt the serialized form: an unknown hazard must be rejected at the save boundary.
  const corrupt=JSON.parse(JSON.stringify(w.state).replace('"fire"','"earthquake"'));
  assert.equal(validateSave(corrupt),false);
});

test('overlay frames name hazard, repair and warning states without the renderer',()=>{
  // This is the visual contract the scene consumes: which atlas frame shows when.
  const healthy={damaged:false} as const;
  assert.equal(hazardOverlay(healthy,0,false),null,'a healthy building has no overlay');

  const burning={damaged:true,damageKind:'fire' as const};
  assert.equal(hazardOverlay(burning,0,false)!.frame,'fire-0');
  assert.equal(hazardOverlay(burning,HAZARD_FRAME_MS,false)!.frame,'fire-1');
  assert.equal(hazardOverlay(burning,HAZARD_FRAME_MS*2,false)!.frame,'fire-0','frames alternate');
  assert.equal(hazardOverlay(burning,0,false)!.warning,true,'a struck building shows the bell');
  assert.equal(hazardOverlay(burning,HAZARD_FRAME_MS,true)!.frame,'fire-0','reduced motion holds frame zero');
  assert.equal(hazardOverlay(burning,0,true)!.warning,false,'reduced motion drops the bell');

  const flooded={damaged:true,damageKind:'flood' as const};
  assert.equal(hazardOverlay(flooded,0,false)!.frame,'flood-0','each hazard has its own frames');

  const repairing={damaged:true,damageKind:'fire' as const,repairingUntil:100};
  assert.equal(hazardOverlay(repairing,0,false)!.frame,'scaffold-0','scaffolding replaces the hazard');
  assert.equal(hazardOverlay(repairing,HAZARD_FRAME_MS,false)!.frame,'scaffold-1');
  assert.equal(hazardOverlay(repairing,0,false)!.warning,false,'no bell once the repair is ordered');

  // Legacy saves carry damage without a kind; they must still render something.
  assert.equal(hazardOverlay({damaged:true},0,false)!.frame,'fire-0','a kindless strike reads as a fire');

  assert.equal(loopFrame(ALERT_FRAMES,0,ALERT_FRAME_MS,false),'bell-0');
  assert.equal(loopFrame(ALERT_FRAMES,ALERT_FRAME_MS,ALERT_FRAME_MS,false),'bell-1');
  assert.equal(loopFrame(ALERT_FRAMES,ALERT_FRAME_MS,ALERT_FRAME_MS,true),'bell-0','reduced motion holds the bell');
});

test('every hazard and repair frame exists in the generated atlas',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../public/assets/disasters-frames.json',import.meta.url),'utf8'));
  const available=new Set<string>(Object.keys(catalog.frames));
  for(const kind of DISASTER_KINDS){
    for(const frame of DISASTERS[kind].frames) assert.ok(available.has(frame),`${kind} frame ${frame} missing from the atlas`);
    assert.ok(available.has(DISASTERS[kind].frames[0]),`${kind} first frame`);
  }
  for(const frame of [...REPAIR_FRAMES,...ALERT_FRAMES]) assert.ok(available.has(frame),`${frame} missing from the atlas`);
});

test('hazard targeting rules hold for every kind and season combination',()=>{
  // Hand-written spec: which hazards reach which placement, in which seasons.
  const SPEC:Record<typeof DISASTER_KINDS[number],{workshop:boolean;homes:boolean;farm:boolean;river:boolean;seasons:SeasonKey[]}>={
    fire:{workshop:true,homes:true,farm:false,river:false,seasons:['spring','summer','autumn']},
    flood:{workshop:true,homes:false,farm:false,river:true,seasons:['spring','summer']},
    drought:{workshop:false,homes:false,farm:true,river:false,seasons:['summer','autumn']},
    hail:{workshop:false,homes:false,farm:true,river:false,seasons:['spring','summer']},
    insects:{workshop:false,homes:false,farm:true,river:false,seasons:['spring','summer']},
  };
  const inlandWorkshop={kind:'forester' as BuildingKind,x:38,y:40};
  const riversideWorkshop={kind:'forester' as BuildingKind,x:23,y:30};
  const inlandHome={kind:'cottage' as BuildingKind,x:38,y:42};
  const field={kind:'farm' as BuildingKind,x:38,y:41};
  const station={kind:'firestation' as BuildingKind,x:38,y:39};
  for(const kind of DISASTER_KINDS){
    const spec=SPEC[kind];
    // The definition must agree with the spec, so docs and code cannot drift apart.
    assert.deepEqual([...DISASTERS[kind].seasons],spec.seasons,`${kind} seasons`);
    assert.equal(DISASTERS[kind].target,spec.farm?'farm':'building',`${kind} target`);
    assert.equal(DISASTERS[kind].riverOnly??false,spec.river,`${kind} riverOnly`);
    for(const season of ['spring','summer','autumn','winter'] as const){
      const inSeason=spec.seasons.includes(season);
      assert.equal(canStrike(kind,inlandWorkshop,season,false),inSeason&&spec.workshop&&!spec.river,`${kind}/${season} inland workshop`);
      assert.equal(canStrike(kind,riversideWorkshop,season,false),inSeason&&spec.workshop,`${kind}/${season} riverside workshop`);
      assert.equal(canStrike(kind,inlandHome,season,false),inSeason&&spec.homes,`${kind}/${season} home`);
      assert.equal(canStrike(kind,field,season,false),inSeason&&spec.farm,`${kind}/${season} field`);
      assert.equal(canStrike(kind,station,season,false),false,`${kind}/${season} infrastructure`);
    }
  }
});

test('every hazard repairs with the materials it charges and names itself in the alert',()=>{
  for(const kind of DISASTER_KINDS){
    const cost=DISASTERS[kind].repair;
    assert.ok(cost.coins>0&&cost.wood>=0&&cost.stone>=0,`${kind} cost`);
    assert.equal(DISASTERS[kind].repair.materials,0,`${kind} needs no caravan materials`);
    assert.ok(DISASTERS[kind].advice.length>0,`${kind} advice`);
    assert.equal(DISASTERS[kind].frames.length,2,`${kind} animation frames`);
    assert.ok(DISASTERS[kind].log.includes('%s'),`${kind} log names the building`);
  }
});
