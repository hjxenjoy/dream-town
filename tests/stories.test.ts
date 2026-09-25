import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, RESOURCE_KEYS, TECHNOLOGY_KEYS } from '../src/sim/data.ts';
import { NEIGHBOURS, residentRecords } from '../src/sim/residents.ts';
import { STORIES, STORY_PORTRAITS, STORY_STAGES, neighbourNews, nextStoryStage, storyChoiceIds, storyEffect, storyEnvironment, storyHistory, storyOf } from '../src/sim/stories.ts';
import { populate } from './population.ts';

/** A town that satisfies every story requirement, so arcs can be played through. */
function grown(){
  const w=new SimWorld();
  w.state.coins=300000;
  // Plenty of every good, and room to hold it, so a shortage never decides an arc for us.
  // The capacity is derived rather than fixed: a hard number stops being "room to hold it" the
  // moment the town gains a resource, and the arc then fails for a reason that has nothing to do
  // with the story being tested.
  for(const key of RESOURCE_KEYS) w.state.resources[key]=4000;
  w.state.capacity=RESOURCE_KEYS.length*4000+50000;
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  w.state.level=8;populate(w, 40);
  // A grown town has the workshops its neighbours work at. Without them a neighbour would be
  // idle, and since a story arc is gated on having a workplace, their arc could never be told —
  // which is the right rule and makes this fixture the town the story tests actually mean.
  w.state.resources={...w.state.resources,wood:900,stone:900,materials:400};
  // The whole tree, not just the technologies the neighbours' workshops name: a save is refused
  // when a researched technology is missing its own prerequisite, so granting them piecemeal
  // would produce a town that cannot be validated.
  w.state.researched=[...TECHNOLOGY_KEYS];
  for(const neighbour of NEIGHBOURS){
    if(w.state.buildings.some(b=>b.kind===neighbour.workplace)) continue;
    let placed=false;
    for(let x=6;x<56&&!placed;x++) for(let y=6;y<56&&!placed;y++) placed=w.build(neighbour.workplace,x,y).ok;
  }
  w.tick(0.1);
  return w;
}

/** Answers the pending stage for a neighbour, taking the option at `choiceIndex`. */
function answer(w:SimWorld,portrait:string,choiceIndex=0){
  const entry=w.observe().stories.find(row=>row.portrait===portrait)!;
  assert.ok(entry.pending,`${portrait} has something pending`);
  const choice=entry.pending!.choices[choiceIndex]!;
  return { result:w.chooseStoryOption(portrait,choice.id), choice };
}

test('every story is well formed and attached to a real neighbour',()=>{
  assert.equal(STORIES.length,NEIGHBOURS.length,'every named neighbour has an arc');
  for(const story of STORIES){
    const neighbour=NEIGHBOURS.find(entry=>entry.portrait===story.portrait);
    assert.ok(neighbour,`${story.portrait} is a real neighbour`);
    assert.ok(story.arc.length>0,`${story.portrait} describes its arc`);
    assert.equal(story.stages.length,STORY_STAGES,`${story.portrait} has three stages`);
    const titles=new Set<string>();
    for(const stage of story.stages){
      assert.ok(stage.title.length>0&&stage.prompt.length>0,`${story.portrait} stage is described`);
      assert.ok(!titles.has(stage.title),`${story.portrait} stage titles are distinct`);
      titles.add(stage.title);
      assert.ok(stage.choices.length>=2,`${story.portrait}「${stage.title}」 offers a choice`);
      const ids=new Set(stage.choices.map(choice=>choice.id));
      assert.equal(ids.size,stage.choices.length,'choice ids are unique within a stage');
      for(const choice of stage.choices){
        assert.ok(choice.label.length>0&&choice.reply.length>0,`${story.portrait} choice is written`);
        assert.ok(choice.effect.perk.length>0,`${story.portrait} choice explains what it leaves behind`);
        // A choice either hands something over or leaves something lasting; never nothing.
        const gives=choice.effect.items||choice.effect.coins||choice.effect.prestige||choice.effect.environment;
        assert.ok(gives,`${story.portrait}「${choice.label}」 rewards something`);
        for(const key of Object.keys(choice.effect.items??{})) assert.ok(RESOURCE_KEYS.includes(key as never),`${story.portrait} hands over a real good: ${key}`);
      }
      // The two options must differ in kind, not just in amount, or the choice is fake.
      const kinds=stage.choices.map(choice=>choice.effect.items?'gift':'lasting');
      assert.equal(new Set(kinds).size,2,`${story.portrait}「${stage.title}」 offers a real choice of styles`);
    }
  }
});

test('nothing is locked in a bare town, and the ladder opens as the town is built',()=>{
  // A town with no homes at all cannot host anybody, so no story may fire there.
  const homeless=new SimWorld();
  homeless.state.buildings=homeless.state.buildings.filter(building=>!BUILDINGS[building.kind].housing);
  homeless.tick(0.1);
  for(const entry of homeless.observe().stories){
    assert.equal(entry.homeId,null,`${entry.name} has nowhere to live`);
    assert.equal(entry.pending,null,'no story fires for a neighbour with no home');
  }

  // A starting town does have a home and a workplace, so the first stage is available at once.
  const start=new SimWorld();
  start.tick(0.1);
  const hosted=start.observe().stories.filter(entry=>entry.homeId&&entry.workplaceId);
  assert.ok(hosted.length>0,'a starting town already houses somebody');
  for(const entry of hosted) assert.ok(entry.pending,`${entry.name} opens with a first stage`);
  for(const entry of start.observe().stories) assert.equal(entry.history.length,0,'and nothing is told yet');

  // The gate is made of things the player builds, so the requirement is legible.
  const bareContext={home:false,workplace:false,level:1,population:1};
  assert.equal(nextStoryStage('gardener',{},bareContext),null,'a neighbour with no home says nothing');
  assert.ok(nextStoryStage('gardener',{},{home:true,workplace:true,level:1,population:1}),'a home is enough for the first stage');
  assert.equal(nextStoryStage('gardener',{}, {...bareContext,home:true,workplace:true,level:1}).index,0);
  // A later stage waits for its own requirement rather than firing early.
  const after=growProgressOne('gardener');
  assert.equal(nextStoryStage('gardener',after,{home:true,workplace:true,level:2,population:2}),null,'the second stage waits for a bigger town');
  assert.ok(nextStoryStage('gardener',after,{home:true,workplace:true,level:4,population:2}),'and opens when it gets there');
});

/** A progress map with the first stage already answered, for ladder tests. */
function growProgressOne(portrait:string):Record<string,string[]>{
  const story=storyOf(portrait)!;
  return { [portrait]: [story.stages[0]!.choices[0]!.id] };
}

test('a stage cannot be answered for a neighbour the town does not have',()=>{
  const w=grown();
  const before=JSON.stringify(w.state);
  const refused=w.chooseStoryOption('nobody','seed');
  assert.equal(refused.ok,false);
  assert.equal(refused.code,'UNKNOWN_NEIGHBOUR');
  assert.equal(JSON.stringify(w.state),before,'nothing changed');
});

test('an option that does not belong to the pending stage is refused',()=>{
  const w=grown();
  const before=JSON.stringify(w.state);
  const wrongStage=w.chooseStoryOption('gardener',storyOf('gardener')!.stages[2]!.choices[0]!.id);
  assert.equal(wrongStage.ok,false);
  assert.equal(wrongStage.code,'INVALID_CHOICE','a later stage cannot be skipped to');
  assert.equal(JSON.stringify(w.state),before);
  const wrongNeighbour=w.chooseStoryOption('gardener',storyOf('carpenter')!.stages[0]!.choices[0]!.id);
  assert.equal(wrongNeighbour.ok,false);
  assert.equal(JSON.stringify(w.state),before);
});

test('a gift hands over exactly what it promises and records the choice',()=>{
  const w=grown();
  const entry=w.observe().stories.find(row=>row.portrait==='gardener')!;
  const gift=entry.pending!.choices.find(choice=>choice.id==='seed')!;
  const before={...w.state.resources}, prestige=w.state.prestige;
  const result=w.chooseStoryOption('gardener','seed');
  assert.equal(result.ok,true,result.message);
  assert.equal(w.state.resources.wheat,before.wheat+6,'the wheat was delivered');
  assert.equal(w.state.stories!.gardener!.join(','),'seed','the choice was recorded');
  assert.equal(w.state.prestige,prestige,'a gift of goods does not also pay prestige');
  assert.deepEqual(gift.id,'seed');
  assert.equal(validateSave(w.state),true);
});

test('a lasting choice pays no goods but keeps its environment bonus',()=>{
  const w=grown();
  const before={...w.state.resources};
  const result=w.chooseStoryOption('gardener','bench');
  assert.equal(result.ok,true,result.message);
  for(const key of RESOURCE_KEYS) assert.equal(w.state.resources[key],before[key],`${key} was not handed over`);
  assert.equal(storyEnvironment(w.state.stories!),1,'the lasting bonus is counted');
});

test('both options of a stage are reachable and neither is a mistake',()=>{
  for(const portrait of STORY_PORTRAITS){
    for(const choiceIndex of [0,1]){
      const w=grown();
      const answered=answer(w,portrait,choiceIndex);
      assert.equal(answered.result.ok,true,`${portrait} option ${choiceIndex}: ${answered.result.message}`);
      assert.equal(w.state.stories![portrait]!.length,1);
      // Whichever option was taken, the next stage is still there to be earned.
      const next=nextStoryStage(portrait,w.state.stories!,{home:true,workplace:true,level:99,population:99});
      assert.ok(next,`${portrait} option ${choiceIndex} leaves the rest of the arc open`);
      assert.equal(next!.index,1);
    }
  }
});

test('the three stages are told in order and each is recorded once',()=>{
  const w=grown();
  for(let stage=0;stage<STORY_STAGES;stage++){
    const entry=w.observe().stories.find(row=>row.portrait==='gardener')!;
    assert.ok(entry.pending,`stage ${stage} is pending`);
    assert.equal(entry.pending!.title,storyOf('gardener')!.stages[stage]!.title);
    const result=w.chooseStoryOption('gardener',entry.pending!.choices[0]!.id);
    assert.equal(result.ok,true,result.message);
    assert.equal(w.state.stories!.gardener!.length,stage+1);
    assert.equal(entry.history.length,stage,'history grows with each answer');
  }
  const finished=w.observe().stories.find(row=>row.portrait==='gardener')!;
  assert.equal(finished.pending,null,'the arc is complete');
  assert.equal(finished.history.length,STORY_STAGES);
  const again=w.chooseStoryOption('gardener',storyOf('gardener')!.stages[2]!.choices[0]!.id);
  assert.equal(again.ok,false);
  assert.equal(again.code,'NO_STORY','nothing is repeatable');
});

test('an unaffordable gift is refused without recording anything',()=>{
  const w=grown();
  const story=storyOf('gardener')!;
  const stageIndex=w.observe().stories.find(row=>row.portrait==='gardener')!.pending!.index;
  const gift=story.stages[stageIndex]!.choices.find(choice=>choice.effect.items)!;
  for(const key of Object.keys(gift.effect.items!)) w.state.resources[key as never]=0;
  const before=JSON.stringify(w.state);
  const refused=w.chooseStoryOption('gardener',gift.id);
  assert.equal(refused.ok,false);
  assert.equal(refused.code,'INSUFFICIENT_RESOURCES');
  assert.equal(JSON.stringify(w.state),before,'a refused gift changes nothing at all');
  // The lasting option is still available, so a shortage never dead-ends the arc.
  const alternative=story.stages[stageIndex]!.choices.find(choice=>!choice.effect.items)!;
  assert.equal(w.chooseStoryOption('gardener',alternative.id).ok,true);
});

test('a neighbour says what actually went up nearby, and mentions nothing else',()=>{
  const w=grown();
  const home=w.state.buildings.find(building=>BUILDINGS[building.kind].housing)!;
  assert.ok(home);
  const before=neighbourNews(home,w.state.buildings,w.state.population);
  assert.ok(before.length>0);
  // Put a new building next to that home and the line must change to name it. The home's own
  // yard is two tiles wide now, so the bakery needs a free2×2 plot beside it — the first the
  // rules accept, close enough (within the neighbour's eight-tile view) to be the news.
  let spot:{x:number;y:number}|null=null;
  for(let r=1;r<=5&&!spot;r++)for(let dx=-r;dx<=r&&!spot;dx++)for(let dy=-r;dy<=r&&!spot;dy++){
    const candidate={x:home.x+dx,y:home.y+dy};
    if(w.placementIssue(candidate.x,candidate.y,BUILDINGS.bakery.footprint)===null)spot=candidate;
  }
  assert.ok(spot,'there is a buildable plot beside the home');
  const added=w.build('bakery',spot.x,spot.y);
  assert.equal(added.ok,true,added.message);
  const after=neighbourNews(home,w.state.buildings,w.state.population);
  assert.notEqual(after,before,'the line follows the town');
  assert.ok(/(面包房|新开的田|井|花园|集市|仓库)/.test(after),`it names a real building: ${after}`);
  assert.equal(after.includes('undefined'),false);
  // A damaged home says so instead of inventing news.
  const damaged={...home,damaged:true};
  assert.match(neighbourNews(damaged,w.state.buildings,w.state.population),/修缮/);
  assert.match(neighbourNews(null,w.state.buildings,w.state.population),/落脚/);
});

test('a save from before stories existed loads and can start an arc',()=>{
  const w=grown();
  const older=structuredClone(w.state) as unknown as Record<string,unknown>;
  delete older.stories;
  assert.equal(validateSave(older),true,'an older save is still valid');
  const restored=new SimWorld(older);
  assert.deepEqual(restored.state.stories,{},'and starts with no stories told');
  assert.equal(validateSave(restored.state),true);
  const entry=restored.observe().stories[0]!;
  if(entry.pending) assert.equal(restored.chooseStoryOption(entry.portrait,entry.pending.choices[0]!.id).ok,true);
});

test('corrupt story data is refused rather than granting a reward',()=>{
  const w=grown();
  const cases:[unknown,string][]=[
    [{nobody:['seed']},'an unknown neighbour'],
    [{gardener:['not-a-choice']},'an option that does not exist'],
    [{gardener:['seed','bench','flowers','extra']},'more stages than exist'],
    [{gardener:'seed'},'a string instead of a list'],
    [[],'an array instead of a map'],
    [{gardener:[42]},'a number instead of an option id'],
  ];
  for(const [stories,why] of cases){
    const corrupt=structuredClone(w.state) as unknown as Record<string,unknown>;
    corrupt.stories=stories;
    assert.equal(validateSave(corrupt),false,`refuses ${why}`);
  }
  // And a stage recorded out of order cannot smuggle in a later reward.
  const skipped=structuredClone(w.state) as unknown as Record<string,unknown>;
  skipped.stories={gardener:[storyOf('gardener')!.stages[2]!.choices[0]!.id]};
  assert.equal(validateSave(skipped),false,'a third-stage option cannot be the first entry');
});

test('story state survives a save round trip exactly',()=>{
  const w=grown();
  w.chooseStoryOption('gardener','seed');
  w.chooseStoryOption('carpenter','plain');
  const restored=new SimWorld(structuredClone(w.state) as never);
  assert.deepEqual(restored.state.stories,w.state.stories,'every choice is preserved');
  assert.equal(storyEnvironment(restored.state.stories!),storyEnvironment(w.state.stories!));
  assert.deepEqual(storyHistory('gardener',restored.state.stories!),storyHistory('gardener',w.state.stories!));
});

test('the environment bonus from stories stays bounded and accumulates',()=>{
  const w=grown();
  const before=w.observe().needs.environment;
  // Take every lasting option in the whole game.
  for(const portrait of STORY_PORTRAITS){
    for(let stage=0;stage<STORY_STAGES;stage++){
      const entry=w.observe().stories.find(row=>row.portrait===portrait);
      if(!entry?.pending) continue;
      const lasting=entry.pending.choices.findIndex(choice=>choice.perk.length>0&&!storyEffect(portrait,entry.pending.index,choice.id)?.items);
      if(lasting<0) continue;
      w.chooseStoryOption(portrait,entry.pending.choices[lasting]!.id);
    }
  }
  const after=w.observe().needs.environment;
  assert.ok(storyEnvironment(w.state.stories!)>0,'lasting choices accumulate');
  assert.ok(after>=before,'environment never drops for telling a story');
  assert.ok(after<=100,`environment stays clamped, got ${after}`);
  assert.equal(validateSave(w.state),true);
});

test('the roster the panel shows is the one the town actually supports',()=>{
  const small=new SimWorld();
  populate(small, 3); small.tick(0.1);
  const large=grown();
  // Names appear from the first residents, up to the twelve portraits; past that the residents are
  // simply residents, because the game's direction is few names rather than a cast of thousands.
  assert.ok(large.observe().stories.length>small.observe().stories.length,'a bigger town has more named neighbours');
  assert.equal(large.observe().stories.length,NEIGHBOURS.length,'but never more than the portraits');
  const roster=residentRecords(large.state.citizens ?? [], large.state.buildings);
  assert.deepEqual(large.observe().stories.map(entry=>entry.portrait),roster.map(entry=>entry.portrait));
  assert.equal(large.observe().stories.length,roster.length);
  assert.ok(large.state.citizens!.length>roster.length,'the town has unnamed residents besides the named ones');
});

test('every neighbour on a grown roster has a home and a job, so no arc is stranded',()=>{
  // A story is gated on these two facts, so a neighbour without them could never be told.
  const w=grown();
  for(const portrait of STORY_PORTRAITS){
    const entry=w.observe().stories.find(row=>row.portrait===portrait);
    assert.ok(entry,`${portrait} is on the roster of a grown town`);
    assert.ok(entry!.homeId,`${portrait} has a home`);
    assert.ok(entry!.workplaceId,`${portrait} has a workplace`);
    assert.equal(entry!.unsettled,false,`${portrait} is not waiting on a repair`);
  }
  // And every third stage is reachable in that town, in order.
  for(const portrait of STORY_PORTRAITS){
    for(let stage=0;stage<STORY_STAGES;stage++){
      const entry=w.observe().stories.find(row=>row.portrait===portrait)!;
      assert.ok(entry.pending,`${portrait} stage ${stage} is available`);
      const result=w.chooseStoryOption(portrait,entry.pending!.choices[0]!.id);
      assert.equal(result.ok,true,`${portrait} stage ${stage}: ${result.message}`);
    }
    assert.equal(w.observe().stories.find(row=>row.portrait===portrait)!.pending,null,'the arc completes');
  }
});

test('gifts ask for goods the town can plausibly already make',()=>{
  // A first stage that demanded honey or ore would be unanswerable early, which no amount of
  // wording can paper over: the choice has to be payable when it appears.
  const starter=['wheat','wood','stone','flour','bread','fish','plank'];
  for(const portrair of STORY_PORTRAITS){
    const story=storyOf(portrair)!;
    const gifts=story.stages[0].choices.filter(choice=>choice.effect.items);
    assert.ok(gifts.length>0,`${portrair} offers something to hand over`);
    for(const choice of gifts){
      for(const key of Object.keys(choice.effect.items!)) assert.ok(starter.includes(key),`${portrair}「${choice.label}」 asks for ${key}, which a starting town has`);
    }
  }
  // Every gift in the game is a real good, and every amount is small enough to be worth a decision.
  for(const story of STORIES) for(const stage of story.stages) for(const choice of stage.choices){
    if(!choice.effect.items) continue;
    const total=Object.values(choice.effect.items).reduce((sum,amount)=>sum+(amount??0),0);
    assert.ok(total>0&&total<=40,`${story.portrait}「${choice.label}」 asks for a sane amount: ${total}`);
  }
});

test('storyChoiceIds reports only the options that stage really has',()=>{
  for(const portrait of STORY_PORTRAITS){
    for(let stage=0;stage<STORY_STAGES;stage++){
      const ids=storyChoiceIds(portrait,stage);
      assert.equal(ids.length,storyOf(portrait)!.stages[stage]!.choices.length);
    }
    assert.deepEqual(storyChoiceIds(portrait,STORY_STAGES),[],'there is no stage past the last');
    assert.deepEqual(storyChoiceIds(portrait,-1),[]);
  }
  assert.deepEqual(storyChoiceIds('nobody',0),[]);
});
