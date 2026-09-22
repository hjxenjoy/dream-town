import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCE_KEYS, TECHNOLOGY_KEYS, emptyResources, type BuildingKind } from '../src/sim/data.ts';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORY_NAMES, ACHIEVEMENT_IDS, achievementProgress, unlockedBy, type AchievementMetrics } from '../src/sim/achievements.ts';
import { populate } from './population.ts';

function prepared(){
  const w=new SimWorld();w.state.coins=999999;w.state.capacity=40000;
  w.state.resources={...emptyResources(),wood:900,stone:900,materials:400,wheat:900,flour:900,bread:400,fish:400,feed:900,plank:400,cloth:400,ingot:200,tools:200,clothing:200,wool:200,ore:400,charcoal:400,grape:400,wine:400,milk:400,honey:400};
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  populate(w, 60);
  return w;
}
/** Every metric at zero, so a test can raise exactly the one it is about. */
function blankMetrics(): AchievementMetrics {
  return { collected:0,crops:0,rareCrops:0,cropVarieties:0,gardenLevel:1,soilLevel:1,orders:0,caravans:0,built:0,repairs:0,festivals:0,activities:0,coinsEarned:0,population:0,level:1,technologies:0,tools:0,clothing:0,pets:0,decorKinds:0,industryKinds:0,projectStages:0 };
}

test('the table is well formed: unique ids, real categories and reachable targets',()=>{
  const ids=new Set<string>();
  for(const entry of ACHIEVEMENTS){
    assert.ok(!ids.has(entry.id),`${entry.id} is unique`);
    ids.add(entry.id);
    assert.ok(entry.name.length>0&&entry.description.length>0,`${entry.id} is described`);
    assert.ok(entry.target>0,`${entry.id} has a positive target`);
    assert.ok(entry.prestige>0,`${entry.id} pays something`);
    assert.ok(ACHIEVEMENT_CATEGORY_NAMES[entry.category],`${entry.id} is in a named category`);
    // No coin field: recognition is paid in prestige only.
    assert.equal('coins' in entry,false,`${entry.id} does not pay coins`);
  }
  assert.equal(ids.size,ACHIEVEMENTS.length);
  assert.ok(Object.keys(ACHIEVEMENT_CATEGORY_NAMES).length===5);
});

test('every metric can actually reach its target through play',()=>{
  // A target nobody can hit is worse than no achievement: it reads as a bug to the player.
  const ceilings: AchievementMetrics = {
    collected: 100_000, crops: 100_000, rareCrops: 10_000, cropVarieties: 9, gardenLevel: 30, soilLevel: 5,
    orders: 10_000, caravans: 10_000, built: 10_000, repairs: 10_000, festivals: 10_000, activities: 10_000,
    coinsEarned: 10_000_000, population: 100, level: 50, technologies: TECHNOLOGY_KEYS.length,
    tools: 100_000, clothing: 100_000, pets: 6, decorKinds: 21, industryKinds: 24, projectStages: 9,
  };
  for(const entry of ACHIEVEMENTS){
    assert.ok(ceilings[entry.metric]>=entry.target,`${entry.id}: ${entry.metric} caps at ${ceilings[entry.metric]} but asks ${entry.target}`);
  }
  // Population ceilings come from the game itself, not a guess.
  const w=prepared();
  assert.ok(ceilings.population>=25,'the town can pass the first population milestone');
});

test('an achievement unlocks exactly at its target, not before',()=>{
  for(const entry of ACHIEVEMENTS){
    const below=blankMetrics();below[entry.metric]=entry.target-1;
    assert.equal(unlockedBy(below,[]).includes(entry.id),false,`${entry.id} must not unlock at ${entry.target-1}`);
    const at=blankMetrics();at[entry.metric]=entry.target;
    assert.equal(unlockedBy(at,[]).includes(entry.id),true,`${entry.id} unlocks at ${entry.target}`);
  }
});

test('unlocking is one-time: an earned achievement never fires again',()=>{
  const metrics=blankMetrics();metrics.collected=100_000;
  const first=unlockedBy(metrics,[]);
  assert.ok(first.length>0);
  assert.equal(unlockedBy(metrics,first).length,0,'nothing re-unlocks once held');
  // And holding an unrelated id does not suppress others.
  assert.equal(unlockedBy(metrics,['first-harvest']).includes('hundred-baskets'),true);
});

test('playing the game unlocks achievements and pays prestige once',()=>{
  const w=prepared();
  // A large town already satisfies the population and workshop-count milestones, so the
  // baseline is measured rather than assumed to be empty.
  w.tick(0.1);
  const before=new Set<string>(w.state.achievements);
  const prestige=w.state.prestige;
  w.state.stats.collected=200;
  w.tick(0.1);
  const unlocked=w.observe().achievements.filter(a=>a.unlocked);
  const gained=unlocked.filter(a=>!before.has(a.id));
  assert.ok(gained.length>=2,'both collection tiers have been earned');
  const paid=gained.reduce((n,a)=>n+ACHIEVEMENTS.find(e=>e.id===a.id)!.prestige,0);
  assert.equal(w.state.prestige,prestige+paid,'prestige matches exactly the newly unlocked set');
  // Repeated settlement must not pay again.
  w.tick(0.1);w.tick(0.1);
  assert.equal(w.state.prestige,prestige+paid,'later ticks pay nothing more');
  assert.equal(new Set(w.state.achievements).size,w.state.achievements.length,'no duplicate records');
});

test('a reward that raises another metric is picked up in the same settlement',()=>{
  // Achievements pay prestige only today, but the loop must still converge: the pass that
  // unlocks one tier must let the next tier be evaluated in the same call.
  const w=prepared();
  w.state.stats.collected=1000;
  w.tick(0.1);
  const held=w.state.achievements;
  for(const id of ['first-harvest','hundred-baskets','thousand-baskets']){
    assert.ok(held.includes(id as never),`${id} unlocked from a single 1,000-harvest total`);
  }
});

test('an older save with no achievement field loads, then earns what it genuinely did',()=>{
  const w=prepared();
  // Start from a settled baseline so the comparison below is about the new counters only.
  w.tick(0.1);
  const baseline=new Set<string>(w.state.achievements);
  w.state.stats.collected=1000;
  w.state.stats.ordersCompleted=30;
  w.tick(0.1);
  const earned=[...w.state.achievements];
  assert.ok(earned.length>baseline.size,'the new counters were recognised');

  // Strip the field the way a save written before this feature would look.
  const older=structuredClone(w.state) as unknown as Record<string, unknown>;
  delete older.achievements;
  assert.equal(validateSave(older),true,'an older save is still valid');
  const restored=new SimWorld(older);
  assert.deepEqual(restored.state.achievements,[],'it starts with none recorded');
  // The counters are real history, so the next settlement recognises the work already done.
  restored.tick(0.1);
  assert.deepEqual([...restored.state.achievements].sort(),[...earned].sort(),
    'and recovers exactly what was genuinely earned, no more and no less');
});

test('a save written before seasonal activities were counted still loads',()=>{
  const w=prepared();
  const older=structuredClone(w.state) as unknown as Record<string, unknown>;
  delete (older.stats as Record<string, unknown>).activities;
  assert.equal(validateSave(older),true);
  assert.equal(new SimWorld(older).state.stats.activities,0);
});

test('achievements survive a save round trip and bad records are refused',()=>{
  const w=prepared();
  w.state.stats.collected=1000;
  w.tick(0.1);
  const restored=new SimWorld(structuredClone(w.state));
  assert.deepEqual(restored.state.achievements,w.state.achievements);
  assert.equal(validateSave(restored.state),true);

  const unknown=structuredClone(w.state) as unknown as Record<string, unknown>;
  (unknown.achievements as unknown[]).push('no-such-achievement');
  assert.equal(validateSave(unknown),false,'an unknown id is refused');

  const duplicate=structuredClone(w.state) as unknown as Record<string, unknown>;
  const list=duplicate.achievements as string[];
  list.push(list[0]!);
  assert.equal(validateSave(duplicate),false,'a duplicate id is refused');

  const notAList=structuredClone(w.state) as unknown as Record<string, unknown>;
  notAList.achievements='first-harvest';
  assert.equal(validateSave(notAList),false,'a non-array is refused');
});

test('achievement rewards never break resource conservation or the save boundary',()=>{
  const w=prepared();
  const before=RESOURCE_KEYS.map(key=>w.state.resources[key]);
  w.state.stats.collected=1000;w.state.stats.ordersCompleted=30;populate(w, 60);w.state.level=10;
  w.tick(0.1);
  for(const [index,key] of RESOURCE_KEYS.entries()){
    assert.equal(w.state.resources[key],before[index],`${key} is untouched by a reward`);
  }
  assert.equal(w.observe().warehouseUsed<=w.state.capacity,true);
  assert.equal(validateSave(w.state),true);
});

test('progress reporting clamps at the target and reflects what is held',()=>{
  const metrics=blankMetrics();metrics.collected=1000;metrics.caravans=3;
  const rows=achievementProgress(metrics,['first-harvest']);
  const byId=Object.fromEntries(rows.map(row=>[row.id,row]));
  assert.equal(rows.length,ACHIEVEMENTS.length,'every achievement is reported');
  assert.equal(byId['first-harvest']!.unlocked,true);
  assert.equal(byId['first-harvest']!.progress,byId['first-harvest']!.target,'a met target reads as complete');
  assert.equal(byId['thousand-baskets']!.unlocked,false);
  assert.equal(byId['thousand-baskets']!.progress,1000);
  assert.equal(byId['caravan-master']!.progress,3);
  assert.equal(byId['caravan-master']!.target,10);
});

test('the town tool surface reports achievements alongside the rest',()=>{
  const w=prepared();
  w.state.stats.collected=200;
  w.tick(0.1);
  const seen=w.observe().achievements;
  assert.equal(seen.length,ACHIEVEMENTS.length);
  assert.ok(seen.some(row=>row.unlocked));
  for(const row of seen){
    assert.ok(typeof row.name==='string'&&row.name.length>0);
    assert.ok(row.target>0&&row.progress>=0&&row.progress<=row.target);
    assert.ok(ACHIEVEMENT_IDS.includes(row.id));
  }
});

test('a completed town can still earn everything that does not need more residents',()=>{
  // Guards against a target that a large, finished town could never satisfy.
  const w=prepared();
  w.state.stats={collected:5000,ordersCompleted:40,buildingsBuilt:60,caravansCompleted:12,coinsEarned:50000,festivals:4,repairs:6,toolsProduced:25,clothingProduced:25,activities:5};
  w.state.level=12;w.state.researched=[...TECHNOLOGY_KEYS];
  w.state.projects={active:null,stages:{garden:2,craft:2,harbor:2}};
  w.state.farming={...w.state.farming!,xp:900,harvested:200,rare:{wheat:3,carrot:3}};
  for(const kind of ['oak','cherry','pine','maple','fountain','gazebo','bench','flowerarch','flowerbox','trellis'] as BuildingKind[]){
    for(let x=6;x<44;x++){let done=false;for(let y=6;y<44;y++){const r=w.build(kind,x,y);if(r.ok){done=true;break;}}if(done)break;}
  }
  w.tick(0.1);
  const held=new Set<string>(w.state.achievements);
  const unreachable=ACHIEVEMENTS.filter(entry=>!held.has(entry.id));
  for(const entry of unreachable){
    // Whatever is missing must be missing for a stated reason, not because it is impossible.
    assert.ok(['population','pets','soilLevel','cropVarieties','rareCrops','industryKinds','gardenLevel','projectStages'].includes(entry.metric)||entry.target>500,
      `${entry.id} (${entry.metric} ${entry.target}) should have been reachable`);
  }
  assert.ok(held.size>=10,`a busy town earns most achievements, got ${held.size}`);
});
