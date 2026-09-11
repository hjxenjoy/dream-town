import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { emptyResources, RESOURCE_KEYS, type Resource } from '../src/sim/data.ts';
import { ACTIVITY_HAPPINESS, SEASONAL_ACTIVITIES } from '../src/sim/seasonal.ts';
import { SEASON_SECONDS } from '../src/sim/data.ts';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** A town rich enough to afford any activity, in the given season. */
function prepared(season: (typeof SEASONS)[number] = 'spring'){
  const w=new SimWorld();w.state.coins=100000;w.state.capacity=10000;
  w.state.resources={...emptyResources(),wood:900,stone:900,plank:200,cloth:200,bread:400,fish:400,flour:400,wheat:400};
  w.state.settings.disasters=false;w.state.settings.autoMayor=false;
  // Seasons advance with time, so set the clock inside the wanted season.
  w.state.gameTime=SEASON_SECONDS*SEASONS.indexOf(season);
  w.state.season=season;
  return w;
}
/** Advance time without crossing into the next season. */
function advance(w: SimWorld, seconds: number){
  w.state.gameTime+=seconds;w.tick(0.001);
}

test('every season offers exactly one activity that is affordable with surplus only',()=>{
  for(const season of SEASONS){
    const w=prepared(season);
    const asset=SEASONAL_ACTIVITIES[season];
    assert.ok(asset.name.length>0&&asset.description.length>0,`${season} is described`);
    assert.equal(asset.prop.startsWith(season.slice(0,4))||asset.prop.includes(season), true, `${season} prop ${asset.prop} belongs to the season`);
    const before={coins:w.state.coins,resources:{...w.state.resources}};
    const result=w.startActivity();
    assert.equal(result.ok,true,`${season}: ${result.message}`);
    assert.equal(w.state.coins,before.coins-asset.coins,`${season} coins`);
    for(const [key,amount] of Object.entries(asset.items) as [Resource,number][]){
      assert.equal(w.state.resources[key],before.resources[key]-amount,`${season} ${key}`);
    }
    assert.equal(w.activityActive(),true,`${season} is running`);
    assert.equal(validateSave(w.state),true,`${season} save`);
  }
});

test('an activity is voluntary: skipping a season costs nothing and penalises nothing',()=>{
  const w=prepared('summer');
  const before={coins:w.state.coins,resources:{...w.state.resources},happiness:w.state.happiness};
  advance(w,SEASON_SECONDS-1);
  // Nothing is spent merely because a season passed, and no activity was started.
  assert.equal(w.state.coins,before.coins,'no coins are charged for skipping');
  assert.deepEqual(w.state.resources,before.resources,'no goods are consumed for skipping');
  assert.ok(w.state.happiness>=before.happiness,'skipping never lowers happiness');
  assert.equal(w.state.activity,undefined,'no activity is recorded');
  assert.equal(w.activityActive(),false);

  // And the next season offers its own activity, so a skipped one is not lost forever.
  w.state.gameTime+=SEASON_SECONDS;w.state.season='autumn';
  assert.equal(w.startActivity().ok,true,'the following season still has an activity to run');
});

test('only the current season can be run, and only one at a time',()=>{
  const w=prepared('spring');
  assert.equal(w.startActivity().ok,true);
  // A second activity cannot start while the first is running.
  const again=w.startActivity();
  assert.equal(again.code,'ACTIVITY_ACTIVE');
  // Once the season turns, the old activity stops being active even if its timer is long.
  w.state.gameTime+=SEASON_SECONDS;w.state.season='summer';
  assert.equal(w.activityActive(),false,'the spring activity does not carry into summer');
  w.tick(0.001);
  assert.equal(w.state.activity,undefined,'and it is cleared, not left dangling');
});

test('the running activity grants its happiness bonus and ends on time',()=>{
  const w=prepared('autumn');
  const asset=SEASONAL_ACTIVITIES.autumn;
  assert.equal(w.startActivity().ok,true);
  const withActivity=w.observe().activity;
  assert.ok(withActivity,'the activity is observable while it runs');
  assert.equal(withActivity!.season,'autumn');
  assert.ok(ACTIVITY_HAPPINESS>0);
  // Happiness is lifted while it runs rather than only at the start.
  w.state.happiness=50;advance(w,5);
  assert.ok(w.state.happiness>50,'happiness recovers towards the activity target');
  advance(w,asset.duration+1);
  assert.equal(w.activityActive(),false,'the activity ends after its duration');
  assert.ok(w.state.logs.some(l=>l.message.includes(asset.name)),'the end is recorded in the town log');
  assert.equal(validateSave(w.state),true);
});

test('protected reserves are never spent: building timber and the three-day larder stay intact',()=>{
  // Spring genuinely asks for timber, so the wood reserve rule is exercised.
  const spring=prepared('spring');
  const springItems=SEASONAL_ACTIVITIES.spring.items;
  assert.ok(springItems.wood!>0,'the spring activity asks for timber');
  spring.state.resources.flour=springItems.flour!;
  spring.state.resources.wood=spring.woodReserve();
  const deniedWood=spring.startActivity();
  assert.equal(deniedWood.ok,false,'wood needed for building is not handed over to an activity');
  assert.ok(spring.activityShortfall().wood!>0,'the shortfall names the protected timber');

  // The summer activity asks for food, which must respect the three-day larder.
  const summer=prepared('summer');
  const summerItems=SEASONAL_ACTIVITIES.summer.items;
  summer.state.resources.flour=summerItems.flour!;
  summer.state.resources.fish=summerItems.fish!;
  summer.state.resources.bread=0;
  const deniedFood=summer.startActivity();
  assert.equal(deniedFood.ok,false,'the larder is protected too');
  assert.ok(summer.activityShortfall().fish!>0||summer.activityShortfall().bread!>0,'the shortfall names protected food');

  // With surplus beyond the reserve, the same activity is allowed.
  spring.state.resources.wood=spring.woodReserve()+springItems.wood!;
  assert.equal(spring.startActivity().ok,true,'surplus above the reserve is spendable');
});

test('a refused activity is atomic and reports exactly what is missing',()=>{
  const w=prepared('spring');
  const asset=SEASONAL_ACTIVITIES.spring;
  w.state.resources.flour=0;
  const before=JSON.stringify(w.state);
  const result=w.startActivity();
  assert.equal(result.ok,false);
  assert.ok(result.message.includes('面粉'),`names the missing good: ${result.message}`);
  assert.equal(JSON.stringify(w.state),before,'nothing was deducted');
  assert.equal(w.state.coins,100000);
  assert.ok(asset.items.flour!>0);
});

test('an activity survives a save round trip and is refused when malformed',()=>{
  const w=prepared('spring');
  w.startActivity();
  const restored=new SimWorld(structuredClone(w.state));
  assert.equal(restored.activityActive(),true);
  assert.deepEqual(restored.state.activity,w.state.activity);

  const badSeason=structuredClone(w.state) as unknown as Record<string, unknown>;
  (badSeason.activity as unknown as Record<string, unknown>).season='monsoon';
  assert.equal(validateSave(badSeason),false,'an unknown season is rejected');
  const badTime=structuredClone(w.state) as unknown as Record<string, unknown>;
  (badTime.activity as unknown as Record<string, unknown>).endsAt=-5;
  assert.equal(validateSave(badTime),false,'a negative end time is rejected');
});

test('activities finish across offline time and never leave the state invalid',()=>{
  const w=prepared('summer');
  w.startActivity();
  const asset=SEASONAL_ACTIVITIES.summer;
  w.offline(asset.duration+30);
  assert.equal(w.state.activity,undefined,'an activity does not outlive the offline session');
  assert.equal(validateSave(w.state),true);
  for(const key of RESOURCE_KEYS) assert.ok(w.state.resources[key]>=0,`${key} stays nonnegative`);
});

test('each season prop exists in the shipped season-props atlas',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../public/assets/season-props-frames.json',import.meta.url),'utf8'));
  const available=new Set<string>(Object.keys(catalog.frames));
  for(const season of SEASONS){
    const prop=SEASONAL_ACTIVITIES[season].prop;
    assert.ok(available.has(prop),`${season} prop ${prop} exists in the atlas`);
  }
});
