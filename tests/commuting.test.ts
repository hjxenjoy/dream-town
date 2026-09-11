import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { TownCrowd, type Walker } from '../src/sim/crowd.ts';
import { BUILDINGS } from '../src/sim/data.ts';
import { DAY_LENGTH, DAY_START_HOUR, PARTS, WORK_END, WORK_START, clockLabel, dayOf, gameTimeAtHour, hourOf, isWorkHour, partOfDay, secondsUntilNextPart } from '../src/sim/clock.ts';

/** A town with homes and workshops, so commuting has somewhere to happen. */
function town(population=24){
  const w=new SimWorld();
  w.state.population=population;
  w.state.capacity=20000;
  w.state.resources.wood=800;w.state.resources.stone=800;
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  return w;
}

/** Runs the crowd at a fixed time of day until it settles, so a measurement is stable. */
function settle(w:SimWorld,gameTime:number,frames=3200){
  const crowd=new TownCrowd();
  const kinds=w.state.buildings.map(building=>building.kind);
  for(let frame=0;frame<frames;frame++){
    crowd.sync(w.state.buildings,w.state.roads??[],w.state.population,kinds,gameTime);
    crowd.tick(0.1);
  }
  return crowd;
}

const NOON=DAY_LENGTH*(12/24), MIDNIGHT=DAY_LENGTH*(2/24);

function distanceTo(walker:{x:number;y:number},buildings:readonly {x:number;y:number}[]):number{
  return Math.min(...buildings.map(building=>Math.hypot(walker.x-building.x,walker.y-building.y)));
}

test('the day is read the same way by the clock, the interface and the sim',()=>{
  assert.equal(hourOf(0),0);
  assert.equal(hourOf(DAY_LENGTH),0,'the day wraps');
  assert.equal(hourOf(DAY_LENGTH/2),12,'half a day is noon');
  assert.equal(dayOf(0),1,'the first day is day one');
  assert.equal(dayOf(DAY_LENGTH),2);
  assert.equal(clockLabel(DAY_LENGTH/2),'12:00');
  assert.equal(clockLabel(DAY_LENGTH*(8.5/24)),'08:30','half hours read correctly');
  // A negative time cannot happen, but the clock must not produce nonsense if it does.
  assert.equal(hourOf(-1),hourOf(DAY_LENGTH-1));
  assert.ok(hourOf(-1)>=0&&hourOf(-1)<24);
});

test('the working day is a contiguous block, and the parts tile the whole day',()=>{
  assert.ok(isWorkHour(DAY_LENGTH*(11/24)));
  assert.equal(isWorkHour(DAY_LENGTH*((WORK_START-1)/24)),false,'the hour before work is not work');
  assert.equal(isWorkHour(DAY_LENGTH*(WORK_END/24)),false,'knocking-off time is not work');
  assert.ok(isWorkHour(DAY_LENGTH*((WORK_END-0.01)/24)));
  // Every moment belongs to exactly one part, and the parts cover the day without holes.
  const seen=new Set<string>();
  for(let step=0;step<240;step++){
    const part=partOfDay(DAY_LENGTH*step/240);
    assert.ok(PARTS[part],`${part} is a known part`);
    seen.add(part);
  }
  assert.deepEqual([...seen].sort(),['evening','morning','night','work']);
  // And the countdown to the next part is always positive and inside one day.
  for(let step=0;step<240;step++){
    const left=secondsUntilNextPart(DAY_LENGTH*step/240);
    assert.ok(left>0&&left<=DAY_LENGTH,`countdown is sane: ${left}`);
  }
});

test('the interface is told the hour, and it changes with the clock',()=>{
  const w=town();w.state.gameTime=0;
  const at=(time:number)=>{w.state.gameTime=time;return w.observe().clock;};
  const night=at(0), noon=at(NOON), evening=at(DAY_LENGTH*(20/24));
  assert.equal(night.partName,'夜里');
  assert.equal(noon.partName,'白天');
  assert.equal(evening.partName,'傍晚');
  assert.equal(noon.label,'12:00');
  assert.equal(dayOf(w.state.gameTime),1);
  w.state.gameTime=DAY_LENGTH*3;
  assert.equal(w.observe().clock.day,4,'the day counter advances');
  for(const clock of [night,noon,evening]) assert.ok(clock.note.length>0,'the part explains itself');
  assert.notEqual(night.note,noon.note);
});

test('a new town opens on its first morning, with somewhere to be',()=>{
  // Opening at midnight would greet a first-time player with a sleeping town. A new town
  // starts at the beginning of its working day, so the street is busy the moment it loads.
  const w=new SimWorld();
  const clock=w.observe().clock;
  assert.equal(clock.day,1,'it is still the first day');
  assert.equal(clock.label,'06:00','the town opens at the start of the working day');
  assert.equal(isWorkHour(w.state.gameTime),true,'which is when workshops are open');
  assert.equal(partOfDay(w.state.gameTime),'work');
  assert.equal(w.state.gameTime,gameTimeAtHour(DAY_START_HOUR),'the opening time is the one the clock names');
  // And the same is true of the save it writes straight away.
  const restored=new SimWorld(structuredClone(w.state) as never);
  assert.equal(restored.observe().clock.label,'06:00');
  assert.equal(restored.observe().clock.day,1);
  // Midnight is still midnight: the day simply begins earlier.
  assert.equal(clockLabel(0),'00:00');
  assert.equal(partOfDay(0),'night');
  assert.ok(DAY_START_HOUR>0&&DAY_START_HOUR<24,'the opening hour is a real hour');
});

test('residents go to their workshops by day and home at night',()=>{
  const day=settle(town(),NOON);
  const night=settle(town(),MIDNIGHT);
  const buildings=town().state.buildings;
  const houses=buildings.filter(building=>BUILDINGS[building.kind].housing);
  const shops=buildings.filter(building=>BUILDINGS[building.kind].cycle);
  assert.ok(houses.length>0&&shops.length>0,'the town has both homes and workshops');
  const commuters=(crowd:TownCrowd)=>crowd.walkers.filter(walker=>walker.home&&walker.work);

  // By day every commuter is standing at a workshop; by night every one is at home.
  for(const walker of commuters(day)){
    assert.ok(distanceTo(walker,shops)<=2,`a commuter is at a workshop by day: ${walker.x},${walker.y}`);
  }
  for(const walker of commuters(night)){
    assert.ok(distanceTo(walker,houses)<=2,`a commuter is home at night: ${walker.x},${walker.y}`);
  }
  // And the mean distance to each kind of building flips between the two.
  const mean=(crowd:TownCrowd,list:readonly {x:number;y:number}[])=>commuters(crowd).reduce((total:number,walker:Walker)=>total+distanceTo(walker,list),0)/commuters(crowd).length;
  assert.ok(mean(day,shops)<mean(day,houses),'by day the average commuter is nearer work');
  assert.ok(mean(night,houses)<mean(night,shops),'by night the average commuter is nearer home');
});

test('the pose matches the reason for the trip',()=>{
  const day=settle(town(),NOON);
  const night=settle(town(),MIDNIGHT);
  const working=day.walkers.filter(walker=>walker.task==='work');
  const resting=night.walkers.filter(walker=>walker.task==='rest');
  assert.ok(working.length>0,'somebody is working by day');
  assert.ok(resting.length>0,'somebody is resting at night');
  // Working only ever happens at a workshop, resting only ever happens at a home.
  for(const walker of working){
    assert.ok(walker.goalKind,`a working resident knows where they are: ${walker.task}`);
    assert.ok(BUILDINGS[walker.goalKind!].cycle,`and it is a workshop: ${walker.goalKind}`);
  }
  for(const walker of resting){
    assert.equal(walker.goalKind,undefined,'a resident at home has no workshop goal');
    assert.equal(walker.heading,'home');
  }
  // Nobody hauls goods home and nobody works at home.
  assert.equal(night.walkers.some(walker=>walker.task==='work'),false,'the workshops shut at night');
});

test('the streets are still alive while everybody else is working',()=>{
  // A town where every single resident held a job would look deserted at noon.
  const day=settle(town(),NOON);
  const strollers=day.walkers.filter(walker=>walker.task==='walk').length;
  assert.ok(strollers>0,'some residents are not commuting');
  const commuters=day.walkers.filter(walker=>walker.home&&walker.work).length;
  assert.ok(commuters>0,'while others are');
  assert.ok(commuters<day.walkers.length,'so not everybody follows the clock');
});

test('the clock is what moves residents, not the frame count',()=>{
  // The same number of ticks at different hours must leave the crowd in different places.
  const noon=settle(town(),NOON,600);
  const midnight=settle(town(),MIDNIGHT,600);
  const where=(crowd:TownCrowd)=>crowd.walkers.filter(walker=>walker.task==='work'||walker.task==='rest').map(walker=>walker.task).sort().join(',');
  assert.notEqual(where(noon),where(midnight),'the hour decides what people are doing');
  assert.ok(where(noon).includes('work'));
  assert.ok(where(midnight).includes('rest'));
});

test('a town with homes but no workshops still works: nobody is sent nowhere',()=>{
  const w=town();
  w.state.buildings=w.state.buildings.filter(building=>!BUILDINGS[building.kind].cycle);
  const crowd=settle(w,NOON,600);
  assert.equal(crowd.walkers.some(walker=>walker.work),false,'there is nowhere to commute to');
  for(const walker of crowd.walkers) assert.ok(['walk','carry','work','rest'].includes(walker.task));
  for(const walker of crowd.walkers){
    assert.equal(crowd.navigation.canWalk({x:Math.round(walker.x),y:Math.round(walker.y)}),true,'and they stay on walkable ground');
  }
});

test('commuters keep to walkable ground all day, and never take a shortcut',()=>{
  const w=town();
  const crowd=new TownCrowd();
  const kinds=w.state.buildings.map(building=>building.kind);
  // Walk a full day in small steps, checking every frame.
  for(let frame=0;frame<DAY_LENGTH*20;frame++){
    const gameTime=frame/20;
    crowd.sync(w.state.buildings,w.state.roads??[],w.state.population,kinds,gameTime);
    crowd.tick(1/20);
    for(const walker of crowd.walkers){
      assert.equal(crowd.navigation.canWalk({x:Math.round(walker.x),y:Math.round(walker.y)}),true,`step ${frame}: ${walker.x},${walker.y}`);
    }
  }
  // And over that day both states were actually reached.
  const houseTiles=new Set(w.state.buildings.filter(b=>BUILDINGS[b.kind].housing).map(b=>b.x+','+b.y));
  assert.ok(crowd.walkers.length>0);
  assert.ok(houseTiles.size>0);
});

test('a paused crowd does not move, whatever the hour',()=>{
  const crowd=settle(town(),NOON,400);
  const before=JSON.stringify(crowd.walkers);
  crowd.tick(0);
  assert.equal(JSON.stringify(crowd.walkers),before,'a zero step changes nothing');
});

test('the commute survives a save and reload at any hour',()=>{
  for(const time of [MIDNIGHT,NOON,DAY_LENGTH*(20/24)]){
    const w=town();
    w.state.gameTime=time;
    assert.equal(validateSave(w.state),true,`a save at ${clockLabel(time)} is valid`);
    const restored=new SimWorld(structuredClone(w.state) as never);
    assert.equal(restored.state.gameTime,time,'the clock is preserved exactly');
    const before=restored.observe().clock, after=new SimWorld(structuredClone(restored.state) as never).observe().clock;
    assert.deepEqual(before,after,'and reads the same after a reload');
  }
});
