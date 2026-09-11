import { valleyCameraCenter } from '../src/render/cameraBounds.ts';
import { executeGameTool } from '../src/sim/tools.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { terrainAt, riverX } from '../src/sim/terrain.ts';
import { roadLine, tileKey } from '../src/sim/roads.ts';
import { TownNavigation } from '../src/sim/navigation.ts';
import { TownCrowd } from '../src/sim/crowd.ts';

const rich=()=>{const w=new SimWorld();w.state.coins=10000;w.state.resources.stone=50;w.state.capacity=2000;return w;};
test('roads place contiguous L routes and upgrade by the exact difference, never downgrade',()=>{
 const w=rich(),a={x:37,y:40},b={x:40,y:42},line=roadLine(a,b),coins=w.state.coins,stone=w.state.resources.stone;
 assert.equal(w.paveRoad(a,b,'dirt').ok,true);assert.equal(line.length,6);assert.equal(w.state.coins,coins-24);
 assert.equal(w.paveRoad(a,b,'gravel').ok,true);assert.equal(w.state.coins,coins-72);assert.equal(w.state.resources.stone,stone-6);
 assert.equal(w.paveRoad(a,b,'stone').ok,true);assert.equal(w.state.coins,coins-168);assert.equal(w.state.resources.stone,stone-18);
 const before=JSON.stringify(w.state);assert.equal(w.paveRoad(a,b,'gravel').ok,false);assert.equal(JSON.stringify(w.state),before);
 assert.ok(line.every(t=>w.roadAt(t.x,t.y)?.kind==='stone'));assert.equal(validateSave(w.state),true);
});
test('blocked routes and insufficient funds reject the entire operation atomically',()=>{
 const w=rich();
 for(const [a,b,kind] of [[{x:10,y:10},{x:12,y:10},'dirt'],[{x:20,y:25},{x:26,y:25},'stone'],[{x:30,y:3},{x:33,y:3},'gravel'],[{x:0,y:2},{x:5,y:2},'dirt']] as const){
  const before=JSON.stringify(w.state);assert.equal(w.paveRoad(a,b,kind).ok,false);assert.equal(JSON.stringify(w.state),before);
 }
 w.state.coins=0;const before=JSON.stringify(w.state);assert.equal(w.paveRoad({x:40,y:41},{x:41,y:41},'stone').ok,false);assert.equal(JSON.stringify(w.state),before);
});
test('bridges retain their terrain and can connect road routes without being repaved',()=>{
 const w=rich(),row=33;assert.equal(w.paveRoad({x:18,y:row},{x:28,y:row},'gravel').ok,true);
 for(let x=18;x<=28;x++)if(terrainAt(x,row)==='bridge')assert.equal(w.roadAt(x,row),undefined);else assert.equal(w.roadAt(x,row)?.kind,'gravel');
});
test('construction and relocation cannot occupy roads; removal frees the land',()=>{
 const w=rich(),t={x:40,y:41};assert.equal(w.paveRoad(t,t,'dirt').ok,true);
 const before=JSON.stringify(w.state),home=w.state.buildings.find(b=>b.kind==='cottage')!;
 assert.equal(w.build('garden',t.x,t.y).code,'ROAD_OCCUPIED');assert.equal(w.moveBuilding(home.id,t.x,t.y).code,'ROAD_OCCUPIED');assert.equal(JSON.stringify(w.state),before);
 assert.equal(w.paveRoad(t,t,'remove').ok,true);assert.equal(w.moveBuilding(home.id,t.x,t.y).ok,true);
});
test('old saves acquire conflict-free roads and upgraded roads survive round trips',()=>{
 const w=rich(),old=structuredClone(w.state);delete old.roads;const buildings=structuredClone(old.buildings);
 const restored=new SimWorld(old);assert.deepEqual(restored.state.buildings,buildings);
 assert.ok(restored.state.roads!.every(r=>!buildings.some(b=>b.x===r.x&&b.y===r.y)));
 w.paveRoad({x:40,y:41},{x:41,y:41},'stone');assert.deepEqual(new SimWorld(w.state).state.roads,w.state.roads);
 const bad=structuredClone(w.state);bad.roads!.push({...bad.buildings[0],kind:'dirt'});assert.equal(validateSave(bad),false);
 const duplicate=structuredClone(w.state);duplicate.roads!.push({...duplicate.roads![0]});assert.equal(validateSave(duplicate),false);
});
test('district arrange and undo cannot overwrite paved streets',()=>{
 const w=rich();w.arrangeDistricts();assert.ok(w.state.buildings.every(b=>!w.roadAt(b.x,b.y)));
 const garden=w.state.buildings.find(b=>b.kind==='garden')!,origin={x:garden.x,y:garden.y};
 w.moveBuilding(garden.id,40,41);w.paveRoad(origin,origin,'stone');const before=JSON.stringify(w.state);
 assert.equal(w.undoArrangement().ok,false);assert.equal(JSON.stringify(w.state),before);
});
test('one-click harvest aggregates available batches, keeps overflow stock, and cannot double-collect',()=>{
 const w=rich();w.state.buildings.forEach(b=>{b.ready=false;b.stock={};});
 const [a,b,c]=w.state.buildings.filter(b=>b.kind==='farm');
 for(const [v,n] of [[a,5],[b,8],[c,2]] as const){v.ready=true;v.progress=1;v.stock={wheat:n};}
 const used=Object.values(w.state.resources).reduce((a,b)=>a+b,0);w.state.capacity=used+7;
 const before=w.state.resources.wheat,result=w.collectAll();assert.equal(result.ok,true);assert.equal(result.items?.wheat,7);assert.equal(w.state.resources.wheat,before+7);
 assert.equal(a.ready,false);assert.equal(c.ready,false);assert.equal(b.ready,true);assert.deepEqual(b.stock,{wheat:8});
 const snapshot=JSON.stringify(w.state);assert.equal(w.collectAll().code,'WAREHOUSE_FULL');assert.equal(JSON.stringify(w.state),snapshot);
});
test('navigation routes around buildings without corner cutting and only crosses rivers over bridges',()=>{
 const block=[{x:12,y:12},{x:13,y:12},{x:14,y:12}],nav=new TownNavigation(block);
 const path=nav.path({x:10,y:12},{x:32,y:12});assert.ok(path.length>0);
 for(let i=0;i<path.length;i++){
  assert.equal(nav.canWalk(path[i]),true);if(i)assert.equal(Math.abs(path[i].x-path[i-1].x)+Math.abs(path[i].y-path[i-1].y),1);
  if(Math.abs(path[i].x-riverX(path[i].y))<1.7)assert.equal(terrainAt(path[i].x,path[i].y),'bridge');
 }
 assert.equal(nav.path({x:10,y:12},block[0]).length,0);
 const surrounded=new TownNavigation([{x:9,y:10},{x:11,y:10},{x:10,y:9},{x:10,y:11}]);assert.deepEqual(surrounded.path({x:10,y:10},{x:14,y:14}),[]);
});
test('moving crowds stay on traversable cells over time and replan when a building appears',()=>{
 const w=new SimWorld(),crowd=new TownCrowd();crowd.sync(w.state.buildings,w.state.roads!,24);
 const start=crowd.walkers.map(v=>({...v}));
 for(let frame=0;frame<1200;frame++){
  crowd.tick(.1);for(const v of crowd.walkers)assert.equal(crowd.navigation.canWalk({x:Math.round(v.x),y:Math.round(v.y)}),true);
 }
 assert.ok(crowd.walkers.some((v,i)=>Math.abs(v.x-start[i].x)+Math.abs(v.y-start[i].y)>2));
 const person=crowd.walkers[0],newObstacle={x:Math.round(person.x),y:Math.round(person.y)};
 crowd.sync([...w.state.buildings,newObstacle],w.state.roads!,24);
 for(let frame=0;frame<200;frame++){crowd.tick(.1);for(const v of crowd.walkers)assert.notEqual(tileKey({x:Math.round(v.x),y:Math.round(v.y)}),tileKey(newObstacle));}
 const paused=JSON.stringify(crowd.walkers);crowd.tick(0);assert.equal(JSON.stringify(crowd.walkers),paused);
});

test('overview camera cannot drift away from the valley at mobile or desktop minimum zoom',()=>{
 for(const [width,height,zoom] of [[390,844,390/5700],[1280,720,560/2900],[1920,1080,.22]])for(const x of [-100000,100000])for(const y of [-100000,100000]){
   const center=valleyCameraCenter(x,y,width,height,zoom),halfX=width/zoom/2,halfY=height/zoom/2;
   if(halfX>=3300)assert.equal(center.x,0);else {assert.ok(center.x-halfX>=-3300);assert.ok(center.x+halfX<=3300);}
   if(halfY>=2050)assert.equal(center.y,1450);else{assert.ok(center.y-halfY>=-600);assert.ok(center.y+halfY<=3500);}
   assert.ok(center.x-halfX>-14000&&center.x+halfX<14000&&center.y-halfY>-12800&&center.y+halfY<15200);
 }
});
test('agent road and harvest actions use the same validated rules',()=>{
 const w=rich(),before=JSON.stringify(w.state);
 assert.equal(executeGameTool(w,'pave_road',{x:40,y:41,endX:41,endY:41,surface:'lava'}).ok,false);
 assert.equal(executeGameTool(w,'pave_road',{x:40,y:41,endX:90,endY:41,surface:'dirt'}).ok,false);assert.equal(JSON.stringify(w.state),before);
 assert.equal(executeGameTool(w,'pave_road',{x:40,y:41,endX:41,endY:41,surface:'gravel'}).ok,true);
 assert.equal(executeGameTool(w,'collect_all').ok,true);
});
