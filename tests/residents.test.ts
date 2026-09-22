import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld } from '../src/sim/world.ts';
import { BUILDINGS, emptyResources, TECHNOLOGY_KEYS, type BuildingKind } from '../src/sim/data.ts';
import { NEIGHBOURS, neighbourGreeting, residentRecords } from '../src/sim/residents.ts';
import { atlasFrames } from '../src/sim/atlases.ts';
import { populate } from './population.ts';

function prepared(population = 12){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=20000;
  w.state.resources={...emptyResources(),wood:900,stone:900,materials:400};
  w.state.researched=[...TECHNOLOGY_KEYS];w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  populate(w,population);w.tick(0.1);
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

test('the named neighbours never exceed the portraits, however big the town grows', () => {
  // A town introduces its neighbours as it grows; past the twelve portraits the rest are simply
  // residents, because the game's direction is few names rather than a cast of thousands.
  const small = prepared(2), big = prepared(1000);
  // Every resident is a citizen from the first one; the twelve portraits are simply the first
  // twelve to arrive, and past them residents are unnamed.
  assert.equal(residentRecords(small.state.citizens ?? [], small.state.buildings).length, 2);
  assert.equal(residentRecords(big.state.citizens ?? [], big.state.buildings).length, NEIGHBOURS.length);
  assert.equal(big.state.citizens!.filter(citizen => citizen.name).length, NEIGHBOURS.length, 'and the rest are unnamed');
  assert.equal(big.state.citizens!.length, big.state.population, 'the roster is the population');
});

test('each neighbour is tied to a home and a workplace that actually exist',()=>{
  const w=prepared(12);
  const roster=residentRecords(w.state.citizens ?? [], w.state.buildings);
  assert.equal(roster.length,NEIGHBOURS.length,'all twelve named neighbours are in town');
  assert.equal(w.state.citizens!.length,12,'and the roster is exactly the population');
  const homes=new Set(w.state.buildings.filter(b=>BUILDINGS[b.kind].housing).map(b=>b.id));
  for(const record of roster){
    assert.ok(record.homeId&&homes.has(record.homeId),`${record.name} lives in a real home`);
    // Whoever works, works somewhere real. Being idle is allowed — the town has fewer jobs than
    // people until it builds more — but a name can never point at a workshop that is not there.
    if(record.workplaceId) assert.ok(w.state.buildings.some(b=>b.id===record.workplaceId),`${record.name}'s workplace exists on the map`);
  }
  assert.ok(roster.some(record=>record.workplaceId),'some neighbours do have work');
  // Nobody is assigned to a workshop that does not exist, and no workshop holds more than its
  // complement of hands.
  for(const record of roster.filter(r=>r.workplaceId)){
    const held=roster.filter(r=>r.workplaceId===record.workplaceId).length;
    const building=w.state.buildings.find(b=>b.id===record.workplaceId)!;
    assert.ok(held<=(BUILDINGS[building.kind].workers??0),`${building.kind} holds at most its own hands, not ${held}`);
  }
  // The same town always produces the same neighbours in the same order.
  assert.deepEqual(residentRecords(w.state.citizens ?? [], w.state.buildings),roster,'the roster is stable');
});

test('a neighbour whose home is damaged is reported as temporarily unsettled',()=>{
  const w=prepared(12);
  const home=w.state.buildings.find(b=>BUILDINGS[b.kind].housing)!;
  home.damaged=true;home.damageKind='fire';
  const roster=residentRecords(w.state.citizens ?? [], w.state.buildings);
  const affected=roster.find(record=>record.homeId===home.id);
  assert.ok(affected,`the damaged home still houses ${affected?.name}`);
  assert.equal(affected!.unsettled,true,'the neighbour is marked unsettled');
  // Repairing settles them again.
  w.state.coins=100000;w.state.resources.wood=100;w.state.resources.stone=100;
  w.repair(home.id);w.tick(31);
  assert.equal(residentRecords(w.state.citizens ?? [], w.state.buildings).find(r=>r.homeId===home.id)!.unsettled,false);
});

test('building a neighbour their own workshop puts them to work in it',()=>{
  // The winemaker is the last portrait, so the town needs enough neighbours to include them.
  const w=prepared(24);
  const rosterOf=()=>residentRecords(w.state.citizens ?? [], w.state.buildings);
  const winemakerBefore=rosterOf().find(r=>r.portrait==='winemaker')!;
  assert.notEqual(w.state.buildings.find(b=>b.id===winemakerBefore.workplaceId)?.kind,'winery','the town has no winery yet');
  // Building their real workshop puts the winemaker in it — the trade wins the slot over whoever
  // happens to be first in the roster, which is what keeps a name meaning something.
  place(w,'winery');
  w.tick(0.1);
  const winemakerAfter=rosterOf().find(r=>r.portrait==='winemaker')!;
  assert.equal(w.state.buildings.find(b=>b.id===winemakerAfter.workplaceId)!.kind,'winery','the winemaker now works at the winery');
  // And the same holds for every other named trade, wherever the town has the shop. Only trades
  // whose building actually employs people count: a farm or a market has no dedicated hands, so
  // the gardener and the merchant legitimately work somewhere else.
  for(const neighbour of NEIGHBOURS){
    if(!(BUILDINGS[neighbour.workplace].workers??0)) continue;
    if(!w.state.buildings.some(b=>b.kind===neighbour.workplace)) continue;
    const record=rosterOf().find(r=>r.portrait===neighbour.portrait);
    if(!record?.workplaceId) continue;
    const kind=w.state.buildings.find(b=>b.id===record.workplaceId)!.kind;
    assert.equal(kind,neighbour.workplace,`${record.name} works their own trade`);
  }
});

test('a neighbour is nobody without a home, and the roster shrinks with the population',()=>{
  const w=prepared(12);
  w.state.buildings=w.state.buildings.filter(b=>!BUILDINGS[b.kind].housing);
  // The roster is stored state now, so the town re-settles it on its next update — which is what
  // a demolition really does, since the action itself runs the same sync.
  w.tick(0.1);
  const homeless=residentRecords(w.state.citizens ?? [], w.state.buildings);
  for(const record of homeless) assert.equal(record.homeId,null,`${record.name} has no home to point at`);
  // Fewer residents means a shorter roster, and the citizens who remain are the first ones.
  populate(w, 3);
  w.tick(0.1);
  assert.equal(w.state.citizens!.length, 3, 'the roster is exactly as long as the population');
  assert.equal(residentRecords(w.state.citizens!, w.state.buildings).length, 3, 'three residents, three names');
  assert.equal(w.state.population, 3);
});

test('greetings name the town and look up by portrait',()=>{
  const definition=NEIGHBOURS[0]!;
  const greeting=neighbourGreeting(definition,'青岚小镇');
  assert.ok(greeting.includes('青岚小镇'),'the town name is substituted in');
  assert.equal(greeting.includes('%'),false,'no placeholder is left behind');
  assert.equal(NEIGHBOURS.filter(entry=>entry.portrait===definition.portrait).length,1,'each portrait identifies exactly one neighbour');
  assert.equal(NEIGHBOURS.some(entry=>entry.portrait==='nobody'),false);
});

test('the residents panel renders the roster rather than a hardcoded list',()=>{
  const source=readFileSync(new URL('../src/ui/GameUI.ts',import.meta.url),'utf8');
  // The roster is built by the simulation from its own buildings, so the panel only renders
  // what the town actually contains rather than a list of its own.
  assert.match(source,/const stories=this\.world\.observe\(\)\.stories/,'the panel renders the roster the simulation reports');
  assert.match(source,/portrait\(record\.portrait\)/,'and draws each neighbour portrait from the atlas');
  // The portraits must come from the generated atlas, not from names baked into markup.
  for(const neighbour of NEIGHBOURS){
    assert.equal(source.includes(`>${neighbour.name}<`),false,`${neighbour.name} is not baked into the UI source`);
  }
});
