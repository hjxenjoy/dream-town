import { CROPS, CROP_IDS, gardenLevel } from './sim/farming';
import Phaser from 'phaser';
import { SimWorld, type ActionResult, type GameState, type OfflineReport } from './sim/world';
import { RESOURCE_KEYS, RESOURCES } from './sim/data';
import { GAME_TOOLS, executeGameTool } from './sim/tools';
import { TownScene } from './render/TownScene';
import { GameUI } from './ui/GameUI';
import { loadGame, saveGame, exportSave, importSave, listSaves } from './save/storage';
import './ui/styles.css';

async function bootstrap(){
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'暂时没有完成，请再试一次。';
let audio:AudioContext|undefined;
function chime(good=true,effect=''){
  if(!world.state.settings.sound)return;
  try{
    audio??=new AudioContext();if(audio.state==='suspended')void audio.resume();
    const start=audio.currentTime;
    (good?(effect==='harvest'?[783.99,1046.5]:effect==='build'||effect==='upgrade'?[392,523.25,783.99]:effect==='project'?[523.25,659.25,783.99,1046.5]:[659.25,880]):[330,277.18]).forEach((hz,i)=>{const osc=audio!.createOscillator(),gain=audio!.createGain();osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0,start+i*.055);gain.gain.linearRampToValueAtTime(.032,start+i*.055+.008);gain.gain.exponentialRampToValueAtTime(.001,start+i*.055+.2);osc.connect(gain);gain.connect(audio!.destination);osc.start(start+i*.055);osc.stop(start+i*.055+.21);});
  }catch{/* Sound is optional on browsers without Web Audio. */}
}

let loaded:GameState|null=null;
let loadError='';
let autosaveAllowed=true;
try{loaded=await loadGame();}catch(e){loadError=errorMessage(e);autosaveAllowed=false;}
const world=new SimWorld(loaded??undefined);
let welcome:OfflineReport|undefined;
if(loaded){const elapsed=Math.max(0,(Date.now()-loaded.savedAt)/1000);if(elapsed>=30)welcome=world.offlineUntil();}
let speed=1;
let hiddenAt:number|null=null;
let ui:GameUI;
let saving:Promise<void>=Promise.resolve();
let runtimeRevision=0;
let lastSavedRevision=-1;
let loading=false;

const scene=new TownScene(world,id=>{
  const b=world.state.buildings.find(b=>b.id===id);if(!b)return;
  scene.select(id);
  if(b.ready){const result=act(()=>world.collect(id),id,'harvest');if(result.ok)return;}
  ui.select(id);
},(kind,x,y)=>{
  const result=act(()=>world.build(kind,x,y),undefined,'build');
  if(result.ok){ui.cancel();scene.setBuildMode(null);if(result.buildingId){scene.select(result.buildingId);}}
});

function act(fn:()=>ActionResult,id?:string,effect=''):ActionResult{
  const before={resources:{...world.state.resources},coins:world.state.coins,level:world.state.level,garden:gardenLevel(world.state.farming!.xp).level};
  const ready=effect==='harvest'?world.state.buildings.filter(b=>b.ready).map(b=>b.id):[];
  const origin=scene.screenPoint(id);
  const result=fn();runtimeRevision++;
  ui.toast(result.message,result.ok);chime(result.ok,effect);
  if(result.ok){const summary=result.items?Object.entries(result.items).filter(([,v])=>(v??0)>0).map(([k,v])=>`+${v} ${RESOURCES[k as keyof typeof RESOURCES].name}`).join('  '):result.coins?`${result.coins>0?'+':''}${result.coins} 金币`:'完成';scene.feedback(id||result.buildingId,summary,true,effect);
    const gains:Partial<Record<keyof typeof RESOURCES|'coins',number>>={};
    for(const k of RESOURCE_KEYS){const n=world.state.resources[k]-before.resources[k];if(n>0)gains[k]=n;}
    if(world.state.coins>before.coins)gains.coins=world.state.coins-before.coins;
    ui.resourceFeedback(gains,origin??scene.screenPoint(result.buildingId));
    if(effect==='harvest'&&!id)ready.filter(id=>!world.state.buildings.find(b=>b.id===id)?.ready).slice(0,6).forEach(id=>scene.feedback(id,'收好啦',true,'harvest'));
    const afterGarden=gardenLevel(world.state.farming!.xp).level;
    if(afterGarden>before.garden){const unlocked=CROP_IDS.filter(id=>CROPS[id].level>before.garden&&CROPS[id].level<=afterGarden);ui.celebrate(`园艺升至 ${afterGarden} 级`,unlocked.length?`新种子：${unlocked.map(id=>CROPS[id].name).join('、')}，已经放进种子袋。`:'土地和家园，正在一点点长大。');}
    else if(effect==='project')ui.celebrate('小镇又向梦想靠近一步',result.message);
    else if(effect==='festival')ui.celebrate('今晚，邻居们一起庆祝', '议事厅前洒满彩纸，幸福感会持续一段时间。');
    else if(world.state.level>before.level)ui.celebrate(`青岚小镇 · 等级 ${world.state.level}`, '每一份收获，都在让这里变得更好。');}
  ui.update();return result;
}
async function persist(slot='autosave',notify=false){
  if(slot==='autosave'&&!autosaveAllowed){if(notify)ui.toast('自动存档已保护，请先导入或读取一份有效存档。',false);return;}
  const revision=runtimeRevision;
  const snapshot=structuredClone(world.state);
  const operation=saving.catch(()=>{}).then(()=>saveGame(snapshot,slot));
  saving=operation;
  try{await operation;if(slot==='autosave')lastSavedRevision=revision;ui.setSaveStatus('刚刚已保存');if(notify)ui.toast(slot==='autosave'?'小镇已保存。':`已保存到手动存档 ${slot.slice(-1)}。`);}
  catch(e){ui.setSaveStatus('保存失败 · 请导出备份');if(notify||slot==='autosave')ui.toast(errorMessage(e),false);}
}
async function replaceWorld(state:GameState,label:string){
  // Validate and settle before touching the current world. A failed import leaves it intact.
  const replacement=new SimWorld(state);
  const elapsed=Math.max(0,(Date.now()-state.savedAt)/1000);
  const report=elapsed>=30?replacement.offlineUntil():undefined;
  await saving.catch(()=>{});
  await saveGame(replacement.state);
  world.state=replacement.state;autosaveAllowed=true;runtimeRevision++;
  scene.select(null);scene.setBuildMode(null);scene.resetCamera();ui.cancel();ui.close();ui.update();
  ui.toast(label);if(report)ui.showOffline(report);
  hiddenAt=null;
}
ui=new GameUI(world,{
  action:act,build:kind=>scene.setBuildMode(kind),road:kind=>scene.setRoadMode(kind),focus:id=>scene.focusBuilding(id),
  zoom:delta=>scene.zoomBy(delta),home:()=>scene.resetCamera(),district:id=>scene.focusDistrict(id),move:id=>scene.setMoveMode(id),speed:value=>{speed=value;scene.simulationSpeed=value;},
  sound:()=>{runtimeRevision++;chime();},
  save:slot=>persist(slot,true),listSaves,
  load:async slot=>{if(loading)return;loading=true;try{const state=await loadGame(slot);if(!state){ui.toast('这个位置还没有存档，先保存一次吧。',false);return;}if(!window.confirm('读取存档会替换当前小镇。继续吗？'))return;await replaceWorld(state,'已回到保存时的小镇。');}catch(e){ui.toast(errorMessage(e),false);}finally{loading=false;}},
  export:()=>{try{exportSave(world.state);ui.toast('存档备份已准备好。');}catch(e){ui.toast(errorMessage(e),false);}},
  import:async file=>{if(loading)return;loading=true;try{const state=await importSave(file);if(!window.confirm('导入这份存档并替换当前小镇？'))return;await replaceWorld(state,'存档已导入，欢迎回家。');}catch(e){ui.toast(errorMessage(e),false);}finally{loading=false;}},
  fullscreen:()=>{if(document.fullscreenElement)void document.exitFullscreen();else document.documentElement.requestFullscreen?.().catch(()=>ui.toast('这个浏览器暂不支持全屏。',false));}
});

scene.onRoad=(a,b,kind)=>act(()=>world.paveRoad(a,b,kind)).ok;
scene.onRoadHint=text=>ui.setRoadHint(text);
scene.onPlacementHint=text=>ui.setPlacementHint(text);
scene.onMove=(id,x,y)=>{const result=act(()=>world.moveBuilding(id,x,y),id,'move');if(result.ok){ui.cancel();scene.setBuildMode(null);scene.select(id);ui.select(id);}};
scene.onViewport=(x,y)=>ui.updateMapViewport(x,y);

const game=new Phaser.Game({
  type:Phaser.AUTO,parent:'game',backgroundColor:'#92a459',
  scale:{mode:Phaser.Scale.RESIZE,width:window.innerWidth,height:window.innerHeight},
  render:{antialias:true,roundPixels:false,powerPreference:'high-performance'},
  audio:{noAudio:true},input:{activePointers:2},scene:[scene],
  fps:{target:60,smoothStep:true},
});

let previous=performance.now(),accumulator=0,lastUI=0,lastMayorLog='';
function frame(now:number){
  const delta=Math.min((now-previous)/1000,.25);previous=now;
  if(!document.hidden&&!loading){
    accumulator+=delta*speed;
    while(accumulator>=.1){world.tick(.1);accumulator-=.1;runtimeRevision++;}
    if(now-lastUI>=500){ui.update();lastUI=now;}
    const log=world.state.logs.find(log=>log.type==='mayor');
    if(log&&log.id!==lastMayorLog){lastMayorLog=log.id;const b=world.state.buildings.find(b=>log.message.includes(RESOURCES.wheat.name)?b.kind==='farm':log.message.includes('工坊')?b.kind==='lumber':false);if(world.state.settings.autoMayor&&b)scene.feedback(b.id,'副官 · 已收获');}
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.setInterval(()=>{if(!document.hidden&&runtimeRevision!==lastSavedRevision)void persist();},30000);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){hiddenAt=Date.now();world.state.savedAt=Math.max(world.state.savedAt,hiddenAt);void persist();}
  else if(hiddenAt!==null){const elapsed=Math.max(0,(Date.now()-hiddenAt)/1000);hiddenAt=null;previous=performance.now();accumulator=0;if(elapsed>=30){const report=world.offlineUntil();runtimeRevision++;ui.update();ui.showOffline(report);void persist();}}
});
window.addEventListener('pagehide',()=>{void persist();});
window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement||e.ctrlKey||e.metaKey||e.altKey)return;
  // Let focused controls retain their normal Space/Enter activation.
  if(e.code==='Space'&&e.target instanceof HTMLButtonElement)return;
  const key=e.key.toLowerCase();
  if(e.code==='Space'){e.preventDefault();speed=speed===0?1:0;ui.speed=speed;scene.simulationSpeed=speed;ui.update();}
  else if(key==='f')ui.open('farming');else if(key==='b')ui.open('build');else if(key==='i')ui.open('warehouse');else if(key==='o')ui.open('orders');else if(key==='t')ui.open('technology');else if(key==='m')ui.open('map');else if(key==='r')ui.open('roads');else if(key==='l')ui.open('layout');else if(key==='c')act(()=>world.collectAll(),undefined,'harvest');else if(key==='h')scene.resetCamera();
  else if(e.key==='Escape'){ui.cancel();scene.select(null);}
});

// Public, validated game tools: useful for local agents and repeatable gameplay verification.
Object.assign(window,{gameTools:{definitions:GAME_TOOLS,observe:()=>world.observe(),call:(name:string,args:unknown={})=>{const result=executeGameTool(world,name,args);runtimeRevision++;ui.update();if('message'in result){ui.toast(result.message,result.ok);if(result.ok)scene.feedback('buildingId'in result?result.buildingId:undefined,result.message);}return result;}}});
if(import.meta.env.DEV)Object.assign(window,{__town:{world,scene,ui,game,save:()=>persist('autosave',true)}});

if(loadError){ui.open('settings');ui.setSaveStatus('自动存档已保护');ui.toast(loadError,false);}
else{if(welcome)ui.showOffline(welcome);else if(!loaded)window.setTimeout(()=>ui.toast('欢迎回家。点一点麦田上的 ✓，收下第一份丰收。'),1200);void persist();}

if(import.meta.env.PROD){
  if(!('serviceWorker' in navigator))ui.setOfflineStatus('当前浏览器不支持；请用 Chrome 或 Safari 打开');
  else {
    void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(async registration=>{
      // Recheck the installed worker on each visit, while retaining the offline fallback.
      await registration.update().catch(()=>{});
      const worker=registration.installing||registration.waiting;
      if(worker&&worker.state!=='activated')await new Promise<void>((resolve,reject)=>{
        const check=()=>{if(worker.state==='activated')resolve();else if(worker.state==='redundant')reject(new Error('离线缓存安装失败'));};
        worker.addEventListener('statechange',check);check();
      });
      await navigator.serviceWorker.ready;
      ui.setOfflineStatus('已准备好 · 断网后也能回到小镇');
    }).catch(()=>ui.setOfflineStatus('暂未准备好；请保持联网后刷新重试'));
  }
}else ui.setOfflineStatus('开发预览中；正式游戏支持离线缓存');

}
void bootstrap().catch(error=>{console.error(error);const el=document.querySelector("#ui")!;el.textContent="小镇暂时没能打开，请刷新页面重试。";});
