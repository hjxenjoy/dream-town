import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld } from '../src/sim/world.ts';
import { BUILDINGS, emptyResources, TECHNOLOGY_KEYS, type BuildingKind } from '../src/sim/data.ts';
import { NEIGHBOURS, neighbourGreeting, neighbourOf, namedResidentCount, residentRoster } from '../src/sim/residents.ts';
import { atlasFrames } from '../src/sim/atlases.ts';

function prepared(population = 12){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=20000;
  w.state.resources={...emptyResources(),wood:900,stone:900,materials:400};
  w.state.researched=[...TECHNOLOGY_KEYS];w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  w.state.population=population;
  return w;
}
function place(w:SimWorld,kind:BuildingKind){
  for(let x=6;x<44;x++) for(let y=6;y<44;y++){
    const r=w.build(kind,x,y);
    if(r.ok) return w.state.buildings.find(b=>b.id===r.buildingId)!;
  }
  throw new Error(`could not place ${kind}`);
}

test('every neighbour has a unique name, portrait and workplace frame',()=>{
  const names=new Set<string>(),portraits=new Set<string>();
  for(const neighbour of NEIGHBOURS){
    assert.ok(neighbour.name.length>0&&neighbour.portrait.length>0,`${neighbour.name} is described`);
    assert.ok(!names.has(neighbour.name),`${neighbour.name} is not a duplicate name`);
    assert.ok(!portraits.has(neighbour.portrait),`${neighbour.portrait} is not a duplicate portrait`);
    names.add(neighbour.name);portraits.add(neighbour.portrait);
    assert.ok(BUILDINGS[neighbour.workplace],`${neighbour.name} works at a real building`);
    assert.ok(neighbour.greeting.includes('%'),`${neighbour.name} greeting mentions the town`);
  }
  assert.equal(NEIGHBOURS.length,12,'one neighbour per generated portrait');
});

test('every neighbour portrait exists in the shipped story-portraits atlas',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../public/assets/story-portraits-frames.json',import.meta.url),'utf8'));
  const available=new Set<string>(Object.keys(catalog.frames));
  for(const neighbour of NEIGHBOURS) assert.ok(available.has(neighbour.portrait),`portrait ${neighbour.portrait} exists`);
  // The panel crops these rectangles, so each must be a real positive box.
  for(const neighbour of NEIGHBOURS){
    const frame=atlasFrames('story-portraits')[neighbour.portrait]!;
    assert.ok(frame.w>0&&frame.h>0,`${neighbour.portrait} has a usable rectangle`);
  }
});

test('the roster grows with the town and never exceeds the portraits',()=>{
  assert.equal(namedResidentCount(0),0);
  assert.equal(namedResidentCount(1),0);
  assert.equal(namedResidentCount(2),1);
  assert.equal(namedResidentCount(12),6);
  assert.equal(namedResidentCount(1000),12,'twelve portraits is the ceiling');
});

test('each neighbour is tied to a home and a workplace that actually exist',()=>{
  const w=prepared(12);
  const roster=residentRoster(w.state.buildings,w.state.population);
  assert.equal(roster.length,6);
  const homes=new Set(w.state.buildings.filter(b=>BUILDINGS[b.kind].housing).map(b=>b.id));
  for(const record of roster){
    assert.ok(record.homeId&&homes.has(record.homeId),`${record.name} lives in a real home`);
    assert.ok(record.workplaceId,`${record.name} has somewhere to work`);
    assert.ok(w.state.buildings.some(b=>b.id===record.workplaceId),`${record.name}'s workplace exists on the map`);
  }
  // The same town always produces the same neighbours in the same order.
  assert.deepEqual(residentRoster(w.state.buildings,w.state.population),roster,'the roster is stable');
});

test('a neighbour whose home is damaged is reported as temporarily unsettled',()=>{
  const w=prepared(12);
  const home=w.state.buildings.find(b=>BUILDINGS[b.kind].housing)!;
  home.damaged=true;home.damageKind='fire';
  const roster=residentRoster(w.state.buildings,w.state.population);
  const affected=roster.find(record=>record.homeId===home.id);
  assert.ok(affected,`the damaged home still houses ${affected?.name}`);
  assert.equal(affected!.unsettled,true,'the neighbour is marked unsettled');
  // Repairing settles them again.
  w.state.coins=100000;w.state.resources.wood=100;w.state.resources.stone=100;
  w.repair(home.id);w.tick(31);
  assert.equal(residentRoster(w.state.buildings,w.state.population).find(r=>r.homeId===home.id)!.unsettled,false);
});

test('a new workplace changes what a neighbour says they do',()=>{
  // The winemaker is the last portrait, so the town needs enough neighbours to include them.
  const w=prepared(24);
  const rosterOf=()=>residentRoster(w.state.buildings,w.state.population);
  const before=rosterOf().find(r=>r.portrait==='winemaker')!;
  assert.ok(before.workplaceId,'the winemaker is placed somewhere even before a winery exists');
  const beforeKind=w.state.buildings.find(b=>b.id===before.workplaceId)!.kind;
  assert.notEqual(beforeKind,'winery','the town has no winery yet');
  // Building their real workshop moves them there.
  place(w,'winery');
  const after=rosterOf().find(r=>r.portrait==='winemaker')!;
  assert.equal(w.state.buildings.find(b=>b.id===after.workplaceId)!.kind,'winery','the winemaker now works at the winery');
});

test('a neighbour is nobody without a home, and the roster shrinks with the population',()=>{
  const w=prepared(12);
  w.state.buildings=w.state.buildings.filter(b=>!BUILDINGS[b.kind].housing);
  const homeless=residentRoster(w.state.buildings,w.state.population);
  for(const record of homeless) assert.equal(record.homeId,null,`${record.name} has no home to point at`);
  // Fewer residents means fewer named neighbours, not the same list truncated oddly.
  w.state.population=3;
  assert.equal(residentRoster(w.state.buildings,w.state.population).length,1);
});

test('greetings name the town and look up by portrait',()=>{
  const definition=NEIGHBOURS[0]!;
  const greeting=neighbourGreeting(definition,'青岚小镇');
  assert.ok(greeting.includes('青岚小镇'),'the town name is substituted in');
  assert.equal(greeting.includes('%'),false,'no placeholder is left behind');
  assert.equal(neighbourOf(definition.portrait),definition);
  assert.equal(neighbourOf('nobody'),undefined);
});

test('the residents panel renders the roster rather than a hardcoded list',()=>{
  const source=readFileSync(new URL('../src/ui/GameUI.ts',import.meta.url),'utf8');
  assert.match(source,/residentRoster\(s\.buildings,s\.population\)/,'the panel derives the roster from the town');
  assert.match(source,/portrait\(record\.portrait\)/,'and draws each neighbour portrait from the atlas');
  // The portraits must come from the generated atlas, not from names baked into markup.
  for(const neighbour of NEIGHBOURS){
    assert.equal(source.includes(`>${neighbour.name}<`),false,`${neighbour.name} is not baked into the UI source`);
  }
});
