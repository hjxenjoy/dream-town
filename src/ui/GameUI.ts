import { rareCount, rareStyleRequirement } from '../sim/rareRewards';
import { chickAge, livestockSpec } from '../sim/livestock';
import { orchardStage, orchardVarieties } from '../sim/orchard';
import { HOME_STYLES } from '../sim/homeGrowth';
import { REGIONS, REGION_IDS, type RegionId } from '../sim/regions';
import { farmingContent, growthContent, cropArt } from './farmingPanel';
import { CROPS, CROP_IDS, gardenLevel, type CropId } from '../sim/farming';
import { PROJECT_IDS, PROJECTS, type ProjectId } from '../sim/projects';
import { ROAD_TYPES, type RoadKind } from '../sim/roads';
import { DISTRICTS, DISTRICT_KEYS, districtAt, preferredDistrict, type District } from '../sim/terrain';
import { valleyMap, districtButtons, type MapDestination } from './valleyMap';
import { SimWorld, type Building, type BuildingKind, type Resource, type ActionResult, type OfflineReport } from '../sim/world';
import { BUILDINGS, GAME_DAY_SECONDS, MINING_TOOLS, MINING_TOOL_NAMES, RESOURCES, RESOURCE_KEYS, SEASON_NAMES, TAX_NAMES, TAX_RATES, TECHNOLOGIES, TECHNOLOGY_KEYS, INDUSTRY_KINDS, INDUSTRY_FRAMES, DECORATION_SPRITES, DECORATION_ATLAS, EXPANSION_SPRITES, EXPANSION_ATLAS, EXPANSION_FRAMES, DECORATION_FRAMES, type TechnologyId } from '../sim/data';
import { icon } from './icons';
import { DISASTERS, REPAIR_SECONDS, type DisasterKind } from '../sim/disasters';
import { SEASONAL_ACTIVITIES } from '../sim/seasonal';
import { PETS, PET_KINDS } from '../sim/pets';
import { NEIGHBOURS, neighbourGreeting } from '../sim/residents';
import { neighbourNews } from '../sim/stories';
import { ACHIEVEMENT_CATEGORY_NAMES } from '../sim/achievements';
import { DESTINATIONS, DESTINATION_IDS as destinationIds, availableDestinations, caravanDuration, destinationOf, missingCargo, type DestinationId } from '../sim/destinations';
import { COLLECTIONS } from '../sim/collections';
import { HONOURS, HONOUR_TRACK_IDS, affordableHonours, honourLevelsTaken, type HonourTrackId } from '../sim/honours';
import { GENERATED_ATLASES, atlasFrames, atlasSize, generatedSprite, housingLevelFrame } from '../sim/atlases';
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const fmt = (n:number)=>Math.floor(n).toLocaleString('zh-CN');
const duration=(n:number)=>`${Math.floor(Math.max(0,n)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,n)%60).toString().padStart(2,'0')}`;
type Panel='farming'|'layout'|'build'|'warehouse'|'orders'|'caravan'|'residents'|'quests'|'settings'|'building'|'help'|'mayor'|'technology'|'supply'|'map'|'roads'|null;
export interface UICallbacks { action: (fn:()=>ActionResult,id?:string,effect?:string)=>void; build:(kind:BuildingKind|null)=>void; road:(kind:RoadKind|'remove'|null)=>void; focus:(id:string)=>void; zoom:(delta:number)=>void; home:()=>void; district:(id:MapDestination)=>void; move:(id:string)=>void; speed:(value:number)=>void; sound:()=>void; save:(slot?:string)=>Promise<void>; load:(slot:string)=>Promise<void>; export:()=>void; import:(file:File)=>Promise<void>; fullscreen:()=>void; listSaves:()=>Promise<{slot:string;savedAt:number;level:number;population:number}[]>; }
export class GameUI {
  repeatPlacement=true;
  private layoutSelection=new Set<string>();
  panel:Panel=null; selected:string|null=null; speed=1; buildKind:BuildingKind|null=null; category='all'; moveId:string|null=null; supplyResource:Resource='wood'; journeyTab:'weekly'|'growth'|'achievements'|'styles'|'projects'|'quests'='weekly'; farmId:string|null=null; gardenAlbum=false;
  roadMode:RoadKind|'remove'|null=null;
  private toastTimer=0; private root:HTMLElement; private frames:Record<string,{x:number;y:number;w:number;h:number}>={};
  private lastPanelRender=0; private saveLabel='已启用自动存档'; private offlineStatus='正在准备离线游玩…'; private offlineReport:OfflineReport|null=null;
  private renderedContext=''; private supplyOrigin:Panel='technology';
  private demolishId:string|null=null; private panelOpener:HTMLElement|null=null; private offlineOpener:HTMLElement|null=null;
  /** Which caravan slot the panel is editing; null means "whichever is free first". */
  private caravanSlot:string|null=null;
  constructor(public world:SimWorld,private cb:UICallbacks){
    this.root=document.querySelector('#ui')!;
    this.root.innerHTML=`<div class="vignette"></div><header class="top-hud"><button class="town-identity" data-action="open" data-value="residents" aria-label="查看青岚小镇居民"><span class="level-badge"><span>LV.</span><b id="level">3</b></span><span class="town-name"><small>DREAM TOWN</small><strong>青岚小镇 ${icon('chevron',14)}</strong><span class="xp-track"><i id="xp-progress"></i></span></span></button><div class="resources" id="resources"></div><div class="calendar" id="calendar"></div></header>
    <nav class="side-tools" aria-label="游戏工具"><button class="round-button" data-action="open" data-value="layout" title="调整布局 L" aria-label="调整布局">${icon('move')}</button><button class="round-button" data-action="open" data-value="map" title="河谷地图 M" aria-label="河谷地图">${icon('map')}</button><button class="round-button" data-action="open" data-value="roads" title="道路规划 R" aria-label="道路规划">${icon('road')}</button><button class="round-button" data-action="open" data-value="settings" title="设置与存档" aria-label="设置与存档">${icon('gear')}</button><button class="round-button" data-action="sound" id="sound-toggle" title="声音" aria-label="切换音效">${icon('sound')}</button><button class="round-button" data-action="fullscreen" title="全屏" aria-label="全屏">${icon('expand')}</button><button class="round-button mobile-home" data-action="home" aria-label="回到小镇中心">${icon('focus')}</button><span class="tool-divider"></span><button class="round-button" data-action="open" data-value="help" title="操作指南" aria-label="操作指南">${icon('help')}</button></nav>
    <div class="town-status" id="town-status"></div><nav class="district-nav" aria-label="分区导航">${districtButtons()}<button data-action="district" data-value="overview" aria-label="查看全地图">${icon('expand',17)}</button></nav><button class="mini-map-card" data-action="open" data-value="map" aria-label="展开河谷地图"><span class="mini-map-caption">${icon('map',13)} 青岚河谷 <small>64 × 64</small></span><span id="mini-map"></span></button><button class="harvest-all" id="harvest-all" data-action="collect-all" aria-label="一键收取">${icon('harvest',22)}<span>一键收取</span><b id="harvest-count">0</b></button><aside class="quest-peek" id="quest-peek"></aside><div class="build-hint" id="build-hint" hidden></div><div class="panel-host" id="panel-host"></div><div class="offline-host" id="offline-host"></div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <footer class="bottom-hud"><div class="world-caption"><span class="live-dot"></span><span id="world-caption">春风正好，万物生长</span><small id="save-status">${icon('save',12)} 本地自动存档</small></div><div class="dock-wrap"><div class="dock-label"><i></i> 你的小镇，你的节奏 <i></i></div><nav class="game-dock" aria-label="小镇管理">${[['farming','wheat','田园','F'],['build','hammer','建造','B'],['warehouse','box','仓库','I'],['caravan','caravan','商队',''],['residents','people','居民',''],['technology','research','科技','T'],['quests','book','成长','']].map(([key,ico,label,k])=>`<button class="dock-button ${key==='farming'?'primary-dock':''}" data-action="open" data-value="${key}" aria-label="${label}"><span class="dock-icon">${icon(ico,29)}<i class="dock-notification" id="badge-${key}" hidden></i></span><span>${label}</span>${k?`<kbd>${k}</kbd>`:''}</button>`).join('')}</nav></div><div class="camera-controls"><div class="zoom-controls"><button data-action="zoom-out" aria-label="缩小">${icon('minus',18)}</button><button data-action="home" aria-label="回到小镇中心" title="回到小镇中心">${icon('focus',18)}</button><button data-action="zoom-in" aria-label="放大">${icon('plus',18)}</button></div><div class="time-controls" id="time-controls"></div></div></footer><div class="touch-tip">拖动探索 · 双指缩放</div><input type="file" id="import-file" accept=".json,application/json" hidden>`;
    this.root.addEventListener('click',event=>{const target=(event.target as HTMLElement).closest<HTMLElement>('[data-action]');if(target&&!target.hasAttribute('disabled'))this.handle(target.dataset.action!,target.dataset.value);});
    this.root.addEventListener('change',event=>{const target=event.target as HTMLSelectElement;if(target.id==='farm-scope'){this.farmId=target.value||null;this.renderPanel();}});
    this.root.addEventListener('keydown',event=>{if(!this.offlineReport)return;event.stopPropagation();if(event.key==='Tab'){event.preventDefault();this.root.querySelector<HTMLElement>('[data-action="offline-close"]')?.focus();}if(event.key==='Escape'){event.preventDefault();this.cancel();}});
    this.root.querySelector('#import-file')!.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input.files?.[0])void this.cb.import(input.files[0]);input.value='';});
    fetch('/assets/frames.json').then(r=>{if(!r.ok)throw new Error('素材索引未就绪');return r.json();}).then(data=>{this.frames=data.frames;this.renderPanel();this.renderOffline();}).catch(()=>{});
    this.update();
  }
  /** One place that maps a building to the atlas rectangle used for thumbnails. */
  private spriteArt(kind:BuildingKind):{file:string;width:number;height:number;frame:{x:number;y:number;w:number;h:number};clip?:number[][]}|null {
    const generated=generatedSprite(kind);
    if(generated){const {width,height}=atlasSize(generated.atlas);return{file:GENERATED_ATLASES[generated.atlas].image,width,height,frame:atlasFrames(generated.atlas)[generated.frame]!};}
    const housing=housingLevelFrame(kind,1);
    if(housing){const {width,height}=atlasSize(housing.atlas);return{file:GENERATED_ATLASES[housing.atlas].image,width,height,frame:atlasFrames(housing.atlas)[housing.frame]!};}
    if(EXPANSION_SPRITES.some(k=>k===kind)){const f=EXPANSION_FRAMES[kind as keyof typeof EXPANSION_FRAMES];return{file:'/assets/town-expansion.png',width:EXPANSION_ATLAS.width,height:EXPANSION_ATLAS.height,frame:f,clip:f.clip};}
    if(DECORATION_SPRITES.some(k=>k===kind)){const f=DECORATION_FRAMES[kind as keyof typeof DECORATION_FRAMES];return{file:'/assets/decorations.png',width:DECORATION_ATLAS.width,height:DECORATION_ATLAS.height,frame:f};}
    if(INDUSTRY_KINDS.includes(kind)){const f=INDUSTRY_FRAMES[kind as keyof typeof INDUSTRY_FRAMES];return{file:'/assets/industry.png',width:1774,height:887,frame:f};}
    const f=this.frames[kind==='firetower'?'watchtower':kind];
    if(!f)return null;
    return{file:'/assets/buildings.png',width:1448,height:1086,frame:f};
  }
  art(kind:BuildingKind,className=''){
    if(kind==='farm')return cropArt('wheat',className);
    const sprite=this.spriteArt(kind);
    if(!sprite)return `<span class="art ${className}">${icon('home',42)}</span>`;
    const {file,width,height,frame,clip}=sprite,{x,y,w,h}=frame,id=`atlas-${kind}`;
    return `<svg class="art ${className}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><svg width="${w}" height="${h}" overflow="hidden"><image href="${file}" x="${-x}" y="${-y}" width="${width}" height="${height}" ${clip?`clip-path="url(#${id})"`:''}/>${clip?`<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><polygon points="${clip.map(([px,py])=>`${px},${py}`).join(' ')}"/></clipPath></defs>`:''}</svg></svg>`;
  }
  celebrate(title:string,detail:string){
    document.querySelector('.milestone-toast')?.remove();
    const el=document.createElement('div');el.className='milestone-toast';el.setAttribute('role','status');
    el.innerHTML=`${icon('star',30)}<b>${esc(title)}</b><small>${esc(detail)}</small>`;document.body.append(el);
    const reduced=this.world.state.settings.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!reduced)el.animate([{opacity:0,translate:'0 -12px'},{opacity:1,translate:'0 0'}],{duration:320,easing:'ease-out'});
    window.setTimeout(()=>el.remove(),3800);
  }
  resourceFeedback(gains:Partial<Record<Resource|'coins',number>>,origin?:{x:number;y:number}){
    const reduced=this.world.state.settings.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const entries=Object.entries(gains).filter(([,n])=>n!>0);
    for(const [key] of entries){
      const target=this.root.querySelector<HTMLElement>(key==='coins'?'.resources button':`button[aria-label^="${RESOURCES[key as Resource].name} "]`)
        ??this.root.querySelector<HTMLElement>('[data-value="warehouse"].dock-button');
      if(target&&!reduced)target.animate([{filter:'brightness(1)',scale:'1'},{filter:'brightness(1.25)',scale:'1.05'},{filter:'brightness(1)',scale:'1'}],{duration:420});
    }
    if(reduced)return;
    // A batch gets at most three readable tokens; the receipt retains all quantities.
    const existing=document.querySelectorAll('.action-flight');if(existing.length>6)return;
    entries.slice(0,3).forEach(([key,amount],i)=>{
      const target=this.root.querySelector<HTMLElement>(key==='coins'?'.resources button':'[data-value="warehouse"].dock-button');
      if(!target)return;const rect=target.getBoundingClientRect();
      const start=origin&&origin.x>20&&origin.x<innerWidth-20&&origin.y>100&&origin.y<innerHeight-100?origin:{x:innerWidth*.5,y:innerHeight*.55};
      const el=document.createElement('div');el.className='action-flight';el.setAttribute('aria-hidden','true');
      el.innerHTML=`${icon(key==='coins'?'coin':RESOURCES[key as Resource].icon,20)} +${amount}`;
      el.style.left=`${Math.max(8,Math.min(innerWidth-120,start.x-30+i*28))}px`;el.style.top=`${start.y-22-i*14}px`;document.body.append(el);
      const own=el.getBoundingClientRect(),dx=rect.left+rect.width/2-own.left-30,dy=rect.top+rect.height/2-own.top;
      const animation=el.animate([{transform:'translate(0,0) scale(.7)',opacity:0},{transform:'translate(0,-22px) scale(1)',opacity:1,offset:.23},{transform:`translate(${dx}px,${dy}px) scale(.45)`,opacity:0}],{duration:1050,delay:i*90,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
      animation.onfinish=()=>el.remove();
    });
  }
  private buildingEffects(kind:BuildingKind,level=1):string {
    const d=BUILDINGS[kind],parts:string[]=[];
    if(d.housing)parts.push(`${d.housing*level} 个床位`);
    if(d.populationCap)parts.push(`社区人口 +${d.populationCap*level}`);
    if(d.health)parts.push(`康健 ${d.health*level} 位居民`);
    if(d.faith)parts.push(`信仰与安定 ${d.faith*level} 户`);
    if(d.waterRadius)parts.push(`供水半径 ${d.waterRadius+level-1} 格`);
    if(d.fireRadius)parts.push(`消防半径 ${d.fireRadius+level-1} 格`);
    if(d.services)parts.push(`社区服务 +${d.services*level}`);
    if(d.environment)parts.push(`环境 +${d.environment*level}`);
    if(kind==='warehouse')parts.push(`仓储 +${this.world.warehouseIncrement()*level}`);
    if(d.output)parts.push(Object.entries(d.output).map(([k,v])=>`${v} ${RESOURCES[k as Resource].name}`).join(' / '),`${d.cycle} 秒 · ${d.workers??0} 工人`);
    return parts.join(' · ');
  }
  // Keep live buttons, keyboard focus and nested scroll positions while time changes.
  private html(target:Element,markup:string){
    const template=document.createElement('template');template.innerHTML=markup;
    const sync=(current:Node,next:Node)=>{
      if(current.nodeType!==next.nodeType||(current instanceof Element&&next instanceof Element&&current.tagName!==next.tagName)){current.parentNode!.replaceChild(next.cloneNode(true),current);return;}
      if(current instanceof Element&&next instanceof Element){
        for(const attr of Array.from(current.attributes))if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
        for(const attr of Array.from(next.attributes))if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
      }else if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;
      const oldChildren=Array.from(current.childNodes),newChildren=Array.from(next.childNodes);
      for(let i=0;i<Math.max(oldChildren.length,newChildren.length);i++){
        const old=oldChildren[i],fresh=newChildren[i];
        if(!old&&fresh)current.appendChild(fresh.cloneNode(true));else if(old&&!fresh)current.removeChild(old);else if(old&&fresh)sync(old,fresh);
      }
    };
    const fragment=target.cloneNode(false);fragment.appendChild(template.content);sync(target,fragment);
  }
  private handle(action:string,value?:string){
    const s=this.world.state;
    switch(action){
      case 'open':if(value==='farming')this.farmId=null;this.open(value as Panel);break;
      case 'plant-crop':this.cb.action(()=>this.world.plantCrop(value as CropId,this.farmId??undefined));break;
      case 'replant':this.cb.action(()=>this.world.setAutoReplant(!s.farming!.autoReplant));break;
      case 'garden-tab':this.gardenAlbum=value==='album';this.renderPanel();return;
      case 'repeat-placement':this.repeatPlacement=!this.repeatPlacement;this.updateBuildHint();break;
      case 'layout-toggle':if(!value)break;if(this.layoutSelection.has(value))this.layoutSelection.delete(value);else this.layoutSelection.add(value);this.renderPanel();break;
      case 'layout-clear':this.layoutSelection.clear();this.renderPanel();break;
      case 'layout-shift':{if(!value)break;const [dx,dy]=value.split(',').map(Number);this.cb.action(()=>this.world.moveBuildings([...this.layoutSelection],dx,dy));break;}
      case 'region-open':this.cb.action(()=>this.world.openRegion(value as RegionId));break;
      case 'district':this.close();this.cb.district(value as MapDestination);break;
      case 'move':this.roadMode=null;this.moveId=value!;this.buildKind=s.buildings.find(b=>b.id===value)!.kind;this.cb.focus(value!);this.cb.move(value!);this.close();this.updateBuildHint();break;
      case 'undo-arrange':this.cb.action(()=>this.world.undoArrangement());this.cb.home();break;
      case 'arrange':this.cb.action(()=>this.world.arrangeDistricts());this.cb.district('overview');break;
      case 'close':this.close();break;
      case 'decorate':this.category='decoration';this.open('build');break;
      case 'category':this.category=value!;this.renderPanel();break;
      case 'choose-road':this.roadMode=value as RoadKind|'remove';this.buildKind=null;this.moveId=null;this.cb.road(this.roadMode);this.close();this.updateBuildHint();break;
      case 'choose-build':this.roadMode=null;this.moveId=null;{const kind=value as BuildingKind,def=BUILDINGS[kind];if(!this.world.isUnlocked(kind)){this.open('technology');return;}if(s.coins<def.cost||Object.entries({wood:def.wood,stone:def.stone,...def.materials}).some(([k,v])=>s.resources[k as Resource]<v!)){this.toast('建造材料还没备齐，点物资图标查看来源。',false);return;}}this.buildKind=value as BuildingKind;this.cb.build(this.buildKind);this.panel=null;this.renderPanel();this.updateBuildHint();break;
      case 'cancel-build':this.roadMode=null;this.moveId=null;this.buildKind=null;this.cb.build(null);this.updateBuildHint();break;
      case 'collect':this.cb.action(()=>this.world.collect(value!),value,'harvest');break;
      case 'collect-all':this.cb.action(()=>this.world.collectAll(),undefined,'harvest');break;
      case 'upgrade':this.cb.action(()=>this.world.upgrade(value!),value,'upgrade');break;
      case 'demolish-confirm':this.showDemolish(value!);return;
      case 'demolish':this.cb.action(()=>this.world.demolish(value!),value);if(!s.buildings.some(b=>b.id===value))this.close();break;
      case 'cancel-demolish':this.demolishId=null;this.renderPanel();this.root.querySelector<HTMLElement>('[data-action="demolish-confirm"]')?.focus();return;
      case 'workers':{const [id,amount]=value!.split(':');this.cb.action(()=>this.world.adjustWorkforce(id,Number(amount)),id);break;}
      case 'home-style':{const [id,style]=value!.split(':');this.cb.action(()=>this.world.setHomeStyle(id,style),id);break;}
      case 'production':this.cb.action(()=>this.world.toggleProduction(value!),value);break;
      case 'repair':this.cb.action(()=>this.world.repair(value!),value);break;
      case 'inspect':this.cb.focus(value!);this.select(value!);return;
      case 'research':this.cb.action(()=>this.world.research(value as TechnologyId),undefined,'research');break;
      case 'supply':this.supplyResource=value as Resource;if(this.panel!=='supply'){this.supplyOrigin=this.panel;this.open('supply');}else this.renderPanel();return;
      case 'order':this.cb.action(()=>this.world.fulfillOrder(value!));break;
      case 'cancel-order':this.cb.action(()=>this.world.cancelOrder(value!));break;
      case 'caravan':this.cb.action(()=>this.world.dispatchCaravan(this.caravanSlot??undefined),this.caravanSlot??undefined,'caravan');break;
      case 'caravan-slot':this.caravanSlot=value??null;this.renderPanel();return;
      case 'choose-route':this.cb.action(()=>this.world.chooseCaravanDestination(value as DestinationId,this.caravanSlot??undefined));break;
      case 'story-choice':{const [portrait,choice]=value!.split('|');this.cb.action(()=>this.world.chooseStoryOption(portrait!,choice!));break;}
      case 'deepen-honour':this.cb.action(()=>this.world.deepenHonour(value as HonourTrackId));break;
      case 'tax':this.cb.action(()=>this.world.setTax(Number(value)));break;
      case 'festival':this.cb.action(()=>this.world.festival(),undefined,'festival');break;
      case 'activity':this.cb.action(()=>this.world.startActivity(),undefined,'festival');break;
      case 'adopt':this.cb.action(()=>this.world.adoptPet(value as 'cat'|'dog'),undefined,'project');break;
      case 'release-pet':this.cb.action(()=>this.world.releasePet());break;
      case 'sell-surplus':this.cb.action(()=>this.world.sellSurplus((value||undefined) as Resource|undefined));break;
      case 'buy':{const [resource,amount]=value!.split(':');this.cb.action(()=>this.world.buyResource(resource as Resource,Number(amount)));break;}
      case 'recipe':{const [id,recipe]=value!.split(':');this.cb.action(()=>this.world.setProductionFocus(id,recipe),id);break;}
      case 'mine-tool':{const [id,tool]=value!.split(':');this.cb.action(()=>this.world.useMiningTool(id,tool as never),id);break;}
      case 'sell':this.cb.action(()=>this.world.sell(value as Resource,5));break;
      case 'journey-tab':this.journeyTab=value as 'weekly'|'growth'|'achievements'|'styles'|'projects'|'quests';this.renderPanel();return;
      case 'project-select':this.cb.action(()=>this.world.chooseProject(value as ProjectId));break;
      case 'project-complete':this.cb.action(()=>this.world.completeProject(value as ProjectId),undefined,'project');break;
      case 'project-build':this.category=value!;this.open('build');return;
      case 'motion':s.settings.reducedMotion=!(s.settings.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches);break;
      case 'quest':this.cb.action(()=>this.world.claimQuest(value!),undefined,'quest');break;
      case 'focus':this.cb.focus(value!);if(window.innerWidth<700)this.close();break;
      case 'go-harvest':{const b=s.buildings.find(b=>b.ready);if(b){this.cb.focus(b.id);this.select(b.id);}else this.toast('正在生长中，稍等片刻就有新收获。');break;}
      case 'zoom-out':this.cb.zoom(-.12);break;
      case 'zoom-in':this.cb.zoom(.12);break;
      case 'home':this.cb.home();break;
      case 'speed':this.speed=Number(value);this.cb.speed(this.speed);break;
      case 'sound':s.settings.sound=!s.settings.sound;this.cb.sound();break;
      case 'disasters':s.settings.disasters=!s.settings.disasters;break;
      case 'mayor':s.settings.autoMayor=!s.settings.autoMayor;this.toast(s.settings.autoMayor?'副官已上岗，会自动收获并完成订单。':'副官已休息，小镇交回你手中。');break;
      case 'save':void this.cb.save(value);break;
      case 'load':void this.cb.load(value!);break;
      case 'export':this.cb.export();break;
      case 'import':(this.root.querySelector('#import-file') as HTMLInputElement).click();break;
      case 'fullscreen':this.cb.fullscreen();break;
      case 'offline-close':this.offlineReport=null;this.renderOffline();this.offlineOpener?.focus();break;
    }
    this.update();this.renderPanel();
  }
  open(panel:Panel){if(this.panel===panel){this.close();return;}this.panelOpener=document.activeElement instanceof HTMLElement?document.activeElement:null;this.demolishId=null;if(panel!=='map'){this.roadMode=null;this.moveId=null;this.buildKind=null;this.cb.build(null);this.updateBuildHint();}this.panel=panel;this.renderPanel();this.update();this.root.querySelector<HTMLElement>('#panel-host .close-button')?.focus({preventScroll:true});}
  close(){this.panel=null;this.demolishId=null;this.renderPanel();this.update();if(this.panelOpener?.isConnected)this.panelOpener.focus({preventScroll:true});}
  cancel(){if(this.offlineReport){this.handle('offline-close');return;}if(this.demolishId){this.handle('cancel-demolish');return;}if(this.buildKind||this.roadMode){this.handle('cancel-build');return;}this.close();}
  select(id:string){this.demolishId=null;this.selected=id;if(this.world.state.buildings.find(b=>b.id===id)?.kind==='farm'){this.farmId=id;this.gardenAlbum=false;this.panel='farming';}else this.panel='building';this.renderPanel();this.update();}
  toast(message:string,good=true){const toast=this.root.querySelector('#toast')!;toast.innerHTML=`${icon(good?'check':'help',18)}<span>${esc(message)}</span>`;toast.className=`toast visible ${good?'':'warning'}`;window.clearTimeout(this.toastTimer);this.toastTimer=window.setTimeout(()=>toast.classList.remove('visible'),3500);}
  setOfflineStatus(label:string){this.offlineStatus=label;if(this.panel==='settings')this.renderPanel();}
  setSaveStatus(label:string){this.saveLabel=label;this.root.querySelector('#save-status')!.innerHTML=`${icon('save',12)} ${esc(label)}`;}
  showOffline(report:OfflineReport){this.offlineOpener=document.activeElement instanceof HTMLElement?document.activeElement:null;this.offlineReport=report;this.renderOffline();this.root.querySelector<HTMLElement>('[data-action="offline-close"]')?.focus();}
  private renderOffline(){const r=this.offlineReport;this.html(this.root.querySelector('#offline-host')!,r?`<div class="modal-shade"><section class="offline-card" role="dialog" aria-modal="true" aria-labelledby="offline-title"><div class="welcome-art">${this.art('warehouse')}</div><span class="eyebrow">WELCOME HOME</span><h2 id="offline-title">小镇等你，收获也在</h2><p>你离开了 ${Math.max(1,Math.floor(r.seconds/60))} 分钟${r.capped?'，按 8 小时结算':''}，邻居们照顾好了这里。</p><div class="offline-gains">${RESOURCE_KEYS.filter(k=>r.produced[k]>0).map(k=>`<span>${icon(k,26)}<b>+${fmt(r.produced[k])}</b><small>${RESOURCES[k].name}</small></span>`).join('')}<span>${icon('coin',26)}<b>+${fmt(r.tax)}</b><small>税收</small></span>${r.farmCoins?`<span>${icon('wheat',26)}<b>+${fmt(r.farmCoins)}</b><small>农摊 · ${r.cropQuantity} 份收成</small></span>`:''}</div><p class="muted">${r.caravanReturned?'远行商队已归来，去领取他们带回的礼物。':'产出与居民消耗已计入仓库。'}</p><button class="game-button wide" data-action="offline-close">回到小镇 ${icon('arrow',18)}</button></section></div>`:'');for(const node of Array.from(this.root.children)){if(node instanceof HTMLElement&&node.id!=='offline-host'&&node.id!=='toast')node.inert=Boolean(r);}}
  update(){
    const s=this.world.state;const total=RESOURCE_KEYS.reduce((n,k)=>n+s.resources[k],0);const ready=s.buildings.filter(b=>b.ready).length;
    const harvest=this.root.querySelector('#harvest-all') as HTMLButtonElement;harvest.disabled=ready===0;this.root.querySelector('#harvest-count')!.textContent=String(ready);harvest.title=ready?`${ready} 处成熟产物 · 仓位不足的保留待收`:'等待下一次丰收';
    this.root.querySelector('#level')!.textContent=String(s.level);(this.root.querySelector('#xp-progress') as HTMLElement).style.width=`${Math.min(100,s.xp/(s.level*140)*100)}%`;
    this.html(this.root.querySelector('#resources')!,`<button class="resource-pill coin-pill" data-action="open" data-value="orders" aria-label="金币 ${fmt(s.coins)}，查看订单">${icon('coin',29)}<b>${fmt(s.coins)}</b><span class="resource-plus">${icon('plus',12)}</span></button>${(['wood','stone','wheat'] as Resource[]).map(k=>`<button class="resource-pill resource-${k}" data-action="open" data-value="warehouse" aria-label="${RESOURCES[k].name} ${fmt(s.resources[k])}，查看仓库">${icon(k,25)}<b>${fmt(s.resources[k])}</b></button>`).join('')}<button class="resource-pill prestige-pill" data-action="open" data-value="technology" aria-label="声望 ${s.prestige}">${icon('star',22)}<b>${s.prestige}</b></button>`);
    const clock=this.world.observe().clock;
    // Weather sits with the season and the clock, because that is what it is: a sky condition
    // belonging to this stretch of game time. It rides in the small line so the HUD grows by
    // one word rather than by a row.
    const sky=this.world.observe().weather;
    this.html(this.root.querySelector('#calendar')!,`<span class="season-icon">${icon(s.season==='winter'?'spark':s.season==='autumn'?'leaf':'sun',29)}</span><span><b>${SEASON_NAMES[s.season]} <em>第 ${clock.day} 天 ${clock.label}</em></b><small>${clock.partName} · ${sky.name} · ${clock.note}</small></span>`);
    this.html(this.root.querySelector('#town-status')!,`<button data-action="open" data-value="residents">${icon('people',18)}<b>${s.population}</b><span>位邻居</span></button><i></i><button data-action="open" data-value="residents">${icon('smile',18)}<b>${Math.round(s.happiness)}%</b><span>${s.happiness>=70?'安居乐业':'需要关怀'}</span></button>`);
    const garden=gardenLevel(s.farming!.xp),nextCrop=CROP_IDS.find(id=>CROPS[id].level>garden.level);
    this.html(this.root.querySelector('#quest-peek')!,`<div class="quest-top"><span>${icon('leaf',16)} 我的田园 · Lv.${garden.level}</span><button data-action="open" data-value="farming" aria-label="打开田园">${icon('chevron',16)}</button></div><h3>${nextCrop?'下一份期待，'+CROPS[nextCrop].name:'把土地养成自己的风景'}</h3><p>${s.farming!.harvested} 份收获 · ${s.farming!.autoReplant?'收完自动续种':'自由选种，慢慢生长'}</p><div class="quest-progress"><i style="width:${garden.next?Math.min(100,garden.progress/garden.next*100):100}%"></i></div><div class="quest-bottom"><span>${garden.next?`${garden.progress} / ${garden.next} 园艺经验`:'园艺已满级'}</span><button data-action="open" data-value="farming">去田园 ${icon('arrow',14)}</button></div>`);
    this.html(this.root.querySelector('#sound-toggle')!,icon(s.settings.sound?'sound':'mute'));
    this.html(this.root.querySelector('#time-controls')!,`<button data-action="speed" data-value="${this.speed===0?1:0}" class="${this.speed===0?'active':''}" aria-label="${this.speed===0?'继续游戏':'暂停游戏'}">${icon(this.speed===0?'play':'pause',15)}</button>${[1,2,4].map(n=>`<button data-action="speed" data-value="${n}" class="${this.speed===n?'active':''}" aria-label="${n} 倍速">${n}×</button>`).join('')}`);
    // A plague is a town-wide condition with no building to click, so the caption is where it
    // is announced: otherwise the only sign would be a log line the player may have missed.
    const plagueLeft=s.plague?Math.max(0,Math.ceil((s.plague.until-s.gameTime)/GAME_DAY_SECONDS)):0;
    this.root.querySelector('#world-caption')!.textContent=s.plague?`疫病未退 · 还有 ${plagueLeft} 天，诊所照料能减轻` :this.buildKind?'为新的故事，留一块地方':this.speed===0?'时间暂停，慢慢想一想':ready?`${ready} 处收获，正在等你`:'春风正好，万物生长';
    this.root.querySelectorAll<HTMLElement>('.dock-button').forEach(b=>b.classList.toggle('selected',b.dataset.value===this.panel));
    // Each badge answers "is there something in here for me right now?" — a finished goal to
    // claim, a caravan to meet, or standing the town can spend. Two of these were wired to a
    // constant zero, so the dock had the machinery and said nothing with it.
    const badges:Record<string,number>={quests:s.quests.filter(q=>!q.claimed&&q.progress>=q.target).length,caravan:s.caravans.filter(c=>c.status==='returned').length,technology:affordableHonours(s.honours??{},s.prestige,s.level)};
    for(const [key,n] of Object.entries(badges)){const el=this.root.querySelector(`#badge-${key}`) as HTMLElement;if(!el)continue;el.hidden=!n;el.textContent=String(n);}
    this.root.classList.toggle('panel-open',this.panel!==null);this.root.classList.toggle('building-mode',this.buildKind!==null||this.roadMode!==null);
    void total;
    if(this.panel&&Date.now()-this.lastPanelRender>1000)this.renderPanel();
  }
  setPlacementHint(text:string){const el=this.root.querySelector('#placement-preview-hint');if(el)el.textContent=text;}
  setRoadHint(text:string){const el=this.root.querySelector('#road-preview-hint');if(el)el.textContent=text;}
  private updateBuildHint(){const el=this.root.querySelector('#build-hint') as HTMLElement;if(this.roadMode){el.hidden=false;el.innerHTML=`${icon('road',22)}<span><strong>${this.roadMode==='remove'?'移除路面':ROAD_TYPES[this.roadMode].name}</strong><small>${this.roadMode==='remove'?'移除不返还材料，桥梁保留':'高等级路面只补差价 · 不会降级已有路面'}</small><small id="road-preview-hint">点起点，再点终点 · 同格点两次可单格操作</small></span><button data-action="cancel-build" aria-label="结束道路规划">${icon('close',19)}</button>`;return;}el.hidden=!this.buildKind;el.innerHTML=this.buildKind?`${icon('hammer',20)}<span>${this.moveId?'搬迁':'放置'}<strong>${BUILDINGS[this.buildKind].name}</strong><small>${this.moveId?'免费搬迁 · 保留等级、产物和进度':`${fmt(BUILDINGS[this.buildKind].cost)} 金币 · ${BUILDINGS[this.buildKind].wood} 木材 · ${BUILDINGS[this.buildKind].stone} 石料${BUILDINGS[this.buildKind].materials?.materials?` · ${BUILDINGS[this.buildKind].materials!.materials} 建材`:""}`}</small><small id="placement-preview-hint">建筑、树木与道路互不重叠</small><small>推荐${DISTRICTS[preferredDistrict(this.buildKind)].name} · 点选空地${this.moveId?'搬迁':'建造'} · 拖动可移动地图</small>${!this.moveId?`<button data-action="repeat-placement" aria-pressed="${this.repeatPlacement}">连续建造${this.repeatPlacement?'已开':'已关'}</button>`:''}</span><button data-action="cancel-build" aria-label="${this.moveId?'取消搬迁':'取消建造'}">${icon('close',19)}</button>`:'';}
  private goods(items:Partial<Record<Resource,number>>,compare=false){const s=this.world.state;return `<div class="goods-row">${Object.entries(items).map(([k,v])=>`<button data-action="supply" data-value="${k}" title="查看${RESOURCES[k as Resource].name}的生产来源" aria-label="${RESOURCES[k as Resource].name} ${compare?`${Math.floor(s.resources[k as Resource])} / `:''}${v}，查看生产来源" class="goods ${compare&&s.resources[k as Resource]<v!?'shortage':''}">${icon(k,24)}<span>${compare?`${Math.floor(s.resources[k as Resource])}<small> / ${v}</small>`:`${v}`}</span>${compare?`<small>${RESOURCES[k as Resource].name}</small>`:''}</button>`).join('')}</div>`;}
  private button(action:string,value:string,label:string,disabled=false,cls='game-button'){return `<button class="${cls}" data-action="${action}" data-value="${esc(value)}" ${disabled?'disabled':''}>${label}</button>`;}
  private layoutContent(): string {
    const s=this.world.state;
    for(const id of this.layoutSelection)if(!s.buildings.some(b=>b.id===id))this.layoutSelection.delete(id);
    return `<div class="layout-intro">${icon('move',30)}<div><h3>给喜欢的风景，换个位置</h3><p>选择下方建筑，再点地图空地。搬迁免费，保留等级、工人、产物和进度。红色地块不能放置。</p></div></div><div class="activity-card"><b>整组平移 · 已选 ${this.layoutSelection.size} 座</b><p>保持相对位置，每次平移一格；任意目标冲突时整组不动。</p><div>${[['-1,0','↖ 西北'],['0,-1','↗ 东北'],['0,1','↙ 西南'],['1,0','↘ 东南']].map(([v,label])=>this.button('layout-shift',v,label,!this.layoutSelection.size,'small-button')).join('')}${this.button('layout-clear','','清空选择',!this.layoutSelection.size,'text-button')}${s.layoutUndo?.length?this.button('undo-arrange','','撤销上次整理',false,'text-button'):''}</div></div>${this.button('decorate','',`${icon('leaf',17)} 添置装饰与树木`,false,'secondary-button wide')}
      ${DISTRICT_KEYS.map(key=>{const buildings=s.buildings.filter(b=>districtAt(b.x,b.y)===key);return `<h3 class="inventory-group">${DISTRICTS[key].name} · ${buildings.length}</h3><div class="layout-list">${buildings.map(b=>`<article class="layout-building"><button class="small-button" data-action="layout-toggle" data-value="${b.id}" aria-pressed="${this.layoutSelection.has(b.id)}" aria-label="选择${BUILDINGS[b.kind].name}，地块${b.x},${b.y}">${this.layoutSelection.has(b.id)?'✓':'＋'}</button>${this.art(b.kind)}<div><b>${BUILDINGS[b.kind].name}</b><small>等级 ${b.level} · 地块 ${b.x}, ${b.y}</small></div><button class="small-button" data-action="move" data-value="${b.id}" aria-label="搬迁${BUILDINGS[b.kind].name}，地块${b.x},${b.y}">${icon('move',15)} 搬迁</button></article>`).join('')}</div>`;}).join('')}`;
  }

  private warehouseContent(): string {
    const s=this.world.state, used=RESOURCE_KEYS.reduce((n,k)=>n+s.resources[k],0);
    const targets=this.world.stockTargets(), surplus=this.world.surplusQuote();
    const barn=s.buildings.filter(b=>b.kind==='warehouse'&&b.level<3).sort((a,b)=>a.level-b.level)[0];
    const groups: [string,Resource[]][]=[['建造与采集',['wood','plank','stone','materials','ore']],['居民口粮',['fish','bread']],['农产与加工',['wheat','flour','sugarcane','sugar','charcoal','ingot','feed','wool','cloth']],['果园与牧场',['flowers','fruit','eggs','milk','grape']],['成品与贸易',['tools','clothing','jam','cheese','honey','wine','vintage']]];
    const listed=new Set(groups.flatMap(([,keys])=>keys));
    const remaining=RESOURCE_KEYS.filter(key=>!listed.has(key));
    if(remaining.length)groups.push(['其他物资',remaining]);
    return `<div class="warehouse-hero">${this.art('warehouse')}<div><strong>${fmt(used)}<small> / ${s.capacity}</small></strong><span>已使用空间 · 空闲 ${fmt(s.capacity-used)}</span></div></div>
      <div class="large-progress ${used>=s.capacity?'full':''}"><i style="width:${Math.min(100,used/s.capacity*100)}%"></i></div>
      <section class="stock-policy"><div class="stock-policy-title">${icon('leaf',20)}<b>按需生产 · 自动补货</b></div><p>库存够用就休工，消耗后自动复产。优先留足木材和口粮，给新收成留出周转空间。</p><div class="stock-reserve">${icon('wood',18)} 炭窑与锯木厂保留 ${this.world.woodReserve()} 木材供建造与取暖</div>
      ${this.button('sell-surplus','',surplus.quantity?`出售富余 · ${fmt(surplus.quantity)} 份`:'库存均在保留量内',!surplus.quantity,'game-button wide')}
      <small>${surplus.quantity?`可腾出 ${fmt(surplus.quantity)} 格 · 获得 ${fmt(surplus.coins)} 金币`:'没有富余物资需要清理'}<br>保留日常用量与当前订单所需物资，建材包不出售。</small></section>
      ${this.marketSection()}
      <div class="inventory-list">${groups.map(([label,keys])=>{
        const visible=keys.filter(k=>targets[k]>0||s.resources[k]>0);
        if(!visible.length)return '';
        return `<h3 class="inventory-group">${label}</h3>${visible.map(k=>`<div class="inventory-row economy-row"><button class="inventory-icon" data-action="supply" data-value="${k}" aria-label="查看${RESOURCES[k].name}的来源">${icon(k,27)}</button><div class="inventory-name"><b>${RESOURCES[k].name}</b><small>${k==='materials'?'商队专属 · 全部保留':`补货至 ${targets[k]} · ${surplus.items[k]?`富余 ${surplus.items[k]}`:'日常储备'}`}</small></div><strong>${fmt(s.resources[k])}</strong><div class="inventory-actions">${this.button('sell-surplus',k,'卖富余',!surplus.items[k],'small-button quiet')}${this.button('sell',k,'卖出 5',s.resources[k]<5,'inventory-sell-five')}</div></div>`).join('')}`;
      }).join('')}</div>${barn?this.upgradeDetails(barn):'<p class="muted">现有仓库均已满级，按需生产会随总容量调整保留量。</p>'}`;
  }

  /**
   * The traveller's market: a way out of a shortage, priced so it is never a way to a profit.
   * Each row states the unit price, so the trade-off is legible before anything is spent.
   */
  private marketSection(): string {
    const s = this.world.state;
    const rows = this.world.observe().market;
    const ready = this.world.observe().marketReady;
    const free = s.capacity - RESOURCE_KEYS.reduce((n,k)=>n+s.resources[k],0);
    const amounts = [1, 5, 20];
    return `<section class="market-section"><div class="stock-policy-title">${icon('caravan',20)}<b>集市进货</b></div>
      <p>缺一件现成的成品又不想等一轮生产，可以在这里买。价钱是卖出价的 18 倍——这是应急，不是生意。仓库还有 ${fmt(free)} 格。</p>
      ${ready ? '' : `<div class="service-note">${icon('home',22)} 先建一座可用的集市，才能在这里进货</div>`}
      <div class="market-list">${rows.map(({resource,unit}) => {
        const afford = Math.floor(s.coins/unit);
        return `<div class="market-row"><button class="inventory-icon" data-action="supply" data-value="${resource}" aria-label="查看${RESOURCES[resource].name}的来源">${icon(resource,25)}</button>
          <div class="inventory-name"><b>${RESOURCES[resource].name}</b><small>${unit} 金币 / 份 · 现有 ${fmt(s.resources[resource])}${afford < 20 ? ` · 最多买 ${afford}` : ''}</small></div>
          ${amounts.map(n=>this.button('buy',`${resource}:${n}`,`买 ${n}`,!ready||n>afford||n>free,'small-button quiet')).join('')}
        </div>`;
      }).join('')}</div>
      <small class="muted">集市只卖成品：原料与中间品（木材、小麦、面粉、羊毛、布料、矿石……）和建材包都不卖——缺原料的正确解法是建那座工坊。</small></section>`;
  }

  private livestockDetails(b:Building){
    const spec=livestockSpec(b.kind)!,adult=chickAge(b)>=spec.seconds;
    return `<div class="soil-card"><div><b>${spec.name}日记 · ${adult?spec.adult:spec.young}</b><small>${adult?'自动喂食生产，动物会一直留在这里。':`${b.chickFeedPaid?'成长口粮已备好':`需要 ${spec.feed} 袋饲料作成长口粮`} · 还需 ${Math.ceil(spec.seconds-chickAge(b))} 秒照料`}</small><small>缺料只暂停；搬迁、升级保留成长，没有死亡惩罚。</small></div></div>`;
  }
  private homeGrowthDetails(b:Building){
    const age=b.livedSeconds??0;
    return `<div class="soil-card"><div><b>家的日常 · 已安居 ${Math.floor(age/60)} 分钟</b><small>有居民入住就自然积累，离线也成长；外观免费切换。</small></div></div><div class="recipe-options" role="group" aria-label="住宅外观">${Object.entries(HOME_STYLES).map(([key,style])=>`<button data-action="home-style" data-value="${b.id}:${key}" aria-pressed="${(b.homeStyle??'original')===key}" ${age<style.seconds||rareCount(this.world.state.farming)<rareStyleRequirement(key)?'disabled':''}>${style.name}${rareCount(this.world.state.farming)<rareStyleRequirement(key)?` · 珍品 ${rareCount(this.world.state.farming)}/${rareStyleRequirement(key)}`:age<style.seconds?` · 再住 ${Math.ceil((style.seconds-age)/60)} 分钟`:''}</button>`).join('')}</div>`;
  }
  private workerDetails(b:Building){
    const max=BUILDINGS[b.kind].workers||0;if(!max)return '';
    const current=b.workers??max,free=this.world.state.population-this.world.state.buildings.reduce((n,v)=>n+(v.workers||0),0);
    return `<div class="workforce-row"><div><b>在岗居民 ${current} / ${max}</b><small>小镇还有 ${free} 位空闲居民</small></div>${this.button('workers',`${b.id}:${current-1}`,`${icon('minus',15)}<span class="sr-only">减少工人</span>`,current<=0,'small-button quiet')}${this.button('workers',`${b.id}:${current+1}`,`${icon('plus',15)}<span class="sr-only">增加工人</span>`,current>=max||free<=0,'small-button')}</div>`;
  }
  private upgradeDetails(b:Building){
    if(b.level>=3)return '<div class="upgrade-block"><div><b>已经是最好的样子</b><small>已达到最高等级 3</small></div></div>';
    const s=this.world.state,def=BUILDINGS[b.kind],coins=Math.ceil(def.cost*.65*b.level);
    const items={wood:Math.ceil(def.wood*.5*b.level),stone:Math.ceil(def.stone*.5*b.level),materials:3*b.level};
    const enough=s.coins>=coins&&Object.entries(items).every(([k,v])=>s.resources[k as Resource]>=v);
    const benefit=b.kind==='warehouse'?`增加 ${this.world.warehouseIncrement()} 格仓储空间`:def.housing?`增加 ${def.housing} 个居民床位`:def.populationCap?`增加 ${def.populationCap} 位社区人口名额`:(def.waterRadius||def.fireRadius)?'服务半径扩大 1 格':def.cycle?'增加每轮产量，加快生产':b.kind==='market'?'缩短商队旅程':def.environment?`增加 ${def.environment} 点环境值`:'提升建筑服务能力';
    return `<div class="upgrade-block"><div><b>升至 ${b.level+1} 级</b><small>${benefit}</small></div>${this.button('upgrade',b.id,b.damaged?'先修复':enough?`${icon('hammer',16)} 升级`:'资源不足',b.damaged||!enough,'small-button')}</div><p class="muted">${icon('coin',15)} ${fmt(coins)} 金币${s.coins<coins?' · 金币不足':''}</p>${this.goods(items,true)}`;
  }
  /** Hazard name, its cause, and the repair job with the exact cost for this hazard. */
  private repairDetails(b:Building){
    if(!b.damaged)return '';
    const s=this.world.state;
    const hazard=DISASTERS[(b.damageKind??'fire') as DisasterKind];
    if(b.repairingUntil!==undefined){
      const left=Math.max(0,Math.ceil(b.repairingUntil-s.gameTime));
      return `<div class="repair-block"><b>${hazard.name} · 工匠正在修缮</b><small>约 ${left} 秒后恢复生产（共需 ${REPAIR_SECONDS} 秒）</small></div>`;
    }
    const cost=this.world.repairQuote(b);
    const enough=s.coins>=cost.coins&&s.resources.wood>=cost.wood&&s.resources.stone>=cost.stone;
    const items={wood:cost.wood,stone:cost.stone};
    return `<div class="repair-block"><b>${hazard.name}：需要修缮</b><small>${hazard.advice}</small>${this.button('repair',b.id,'安排修缮',!enough,'game-button wide')}</div><p class="muted">${icon('coin',15)} ${fmt(cost.coins)} 金币${s.coins<cost.coins?' · 金币不足':''}${cost.bought.wood>0||cost.bought.stone>0?' · 材料现买':''}</p>${this.goods(items,true)}`;
  }
  /** A neighbour's portrait, cropped from the story-portraits atlas like any other art. */
  private portrait(frame:string,className=''){
    const {width,height}=atlasSize('story-portraits');
    const f=atlasFrames('story-portraits')[frame];
    if(!f)return '';
    return `<svg class="portrait ${className}" viewBox="0 0 ${f.w} ${f.h}" aria-hidden="true"><svg width="${f.w}" height="${f.h}" overflow="hidden"><image href="${GENERATED_ATLASES['story-portraits'].image}" x="${-f.x}" y="${-f.y}" width="${width}" height="${height}"/></svg></svg>`;
  }
  /** The named neighbours, each tied to the home and workshop they actually use. */
  private neighbourCard(){
    const s=this.world.state;
    const stories=this.world.observe().stories;
    if(!stories.length)return `<div class="activity-card"><b>${icon('people',19)} 邻居们</b><small>再多几位居民，小镇就会有自己的熟人故事。</small></div>`;
    const rows=stories.map(record=>{
      const definition=NEIGHBOURS.find(entry=>entry.portrait===record.portrait)!;
      const home=s.buildings.find(b=>b.id===record.homeId);
      const work=s.buildings.find(b=>b.id===record.workplaceId);
      const where=record.unsettled?'住处正在修缮，暂时借住在别处':home?`住在 ${BUILDINGS[home.kind].name}`:'还没找到住处';
      const job=work?work.kind===definition.workplace?`在 ${BUILDINGS[work.kind].name} 做事`:`暂在 ${BUILDINGS[work.kind].name} 帮忙，盼着 ${BUILDINGS[definition.workplace].name} 建好`:'在镇上帮忙';
      // Two lines, doing different jobs: the greeting says who they are, the news says what
      // changed near their door. The design review asked for the second instead of a platitude,
      // not instead of an introduction.
      const greeting=neighbourGreeting(definition,'小镇');
      const news=neighbourNews(home??null,s.buildings,s.population);
      const pending=record.pending;
      const storyBlock=pending
        ?`<div class="story-stage"><b>${esc(pending.title)}</b><p>${esc(pending.prompt)}</p><div class="story-choices">${pending.choices.map(choice=>this.button('story-choice',`${record.portrait}|${choice.id}`,`${esc(choice.label)}<small>${esc(choice.description)} · ${esc(choice.perk)}</small>`,false,'story-choice-button')).join('')}</div></div>`
        :record.history.length>=3?`<div class="story-done">${icon('check',13)} 三段故事都已说完。</div>`:record.history.length?`<small class="story-locked">已留下 ${record.history.length} 段回忆，下一段会随小镇成长慢慢展开。</small>`:`<small class="story-locked">${icon('lock',12)} 等住处安顿好、${BUILDINGS[definition.workplace].name}立起来，他会和你聊聊。</small>`;
      const history=record.history.length?`<ol class="story-history">${record.history.map(entry=>`<li><b>${esc(entry.title)}</b> — ${esc(entry.label)}<small>${esc(entry.perk)}</small></li>`).join('')}</ol>`:'';
      return `<article class="neighbour-row"><span class="neighbour-face">${this.portrait(record.portrait)}</span><div><h4>${esc(record.name)}</h4><p>${esc(greeting)}</p><p class="neighbour-news">${icon('spark',12)} ${esc(news)}</p><small>${icon('home',13)} ${esc(where)} · ${icon('hammer',13)} ${esc(job)}</small>${storyBlock}${history}</div>${home?this.button('inspect',home.id,`${icon('focus',14)} 去住处`,false,'text-button'):''}</article>`;
    }).join('');
    return `<div class="activity-card neighbour-card"><b>${icon('people',19)} 邻居们 ${stories.length} 位熟人</b><small>每位邻居都有自己的住处和做事的地方；他们说的话会提到附近真正新建的东西。</small><div class="neighbour-list">${rows}</div></div>`;
  }
  /** The voluntary activity for the current season, with its exact contribution. */
  private activityCard(){
    const s=this.world.state,asset=SEASONAL_ACTIVITIES[s.season],running=s.activity&&s.activity.endsAt>s.gameTime&&s.activity.season===s.season;
    if(running){
      const left=Math.max(0,Math.ceil(s.activity!.endsAt-s.gameTime));
      return `<div class="activity-card running"><b>${asset.name} · 进行中</b><small>还有约 ${left} 秒，邻居们正在享受这场${asset.name}。幸福度 +${asset.happiness} 已经生效。</small></div>`;
    }
    const shortfall=this.world.activityShortfall();
    const missing=Object.keys(shortfall).length>0;
    return `<div class="activity-card"><b>${icon(s.season==='winter'?'spark':s.season==='autumn'?'leaf':'sun',19)} ${asset.name}</b><small>${asset.description}本季不办也毫无损失，下个季节还会有新的活动。</small>${this.goods(asset.items,true)}<p class="muted">${icon('coin',15)} ${fmt(asset.coins)} 金币 · 幸福度 +${asset.happiness}${missing?` · ${Object.entries(shortfall).map(([k,v])=>`缺 ${v} ${RESOURCES[k as Resource].name}`).join('、')}`:''}</p>${this.button('activity','',missing?'物资还不够':'办一场',missing,'game-button wide')}</div>`;
  }
  /** Adopted pets, plus an adoption option per kind while the town has room. */
  private petCard(){
    const s=this.world.state,pets=s.pets??[],limit=this.world.petLimit();
    const issue=this.world.petAdoptionIssue();
    const owned=PET_KINDS.map(kind=>`<span class="pet-chip">${icon('heart',15)} ${PETS[kind].name} × ${pets.filter(p=>p.kind===kind).length}</span>`).join('');
    return `<div class="activity-card pet-card"><b>${icon('heart',19)} 小动物 ${pets.length} / ${limit}</b><small>${pets.length?'它们会跟着邻居在小镇里散步，走得慢的那只会落在后面。':'领养一只小猫或小狗，让它跟着邻居一起出门；小猫走得慢，小狗跑得快。'}</small><div class="pet-chips">${owned}</div>${PET_KINDS.map(kind=>{const pet=PETS[kind];const short=issue?issue:s.coins<pet.coins?'金币不足':'';return `${this.button('adopt',kind,short?`${pet.name} · ${short}`:`领养${pet.name} · ${pet.coins} 金币`,Boolean(issue)||s.coins<pet.coins,'small-button')}`;}).join('')}${pets.length?this.button('release-pet','','送走最后一只',false,'text-button'):''}<p class="muted">${PET_KINDS.map(kind=>PETS[kind].description).join(' ')}</p></div>`;
  }
  /**
   * Labels each manual save slot with what it holds. The panel is built synchronously while
   * reading saves is asynchronous, so the summaries are filled in once they arrive.
   */
  private async refreshSaveSlots(){
    const host=this.root.querySelector('#panel-host');
    if(!host)return;
    let summaries:{slot:string;savedAt:number;level:number;population:number}[]=[];
    try{summaries=await this.cb.listSaves();}catch{return;}
    if(this.panel!=='settings')return;
    const bySlot=new Map(summaries.map(summary=>[summary.slot,summary]));
    for(const node of host.querySelectorAll('.slot-summary')){
      const summary=bySlot.get((node as HTMLElement).dataset.slot??'');
      if(!summary){node.textContent='还没有存档';continue;}
      const minutes=Math.max(0,Math.round((Date.now()-summary.savedAt)/60000));
      const when=minutes<1?'刚刚':minutes<60?`${minutes} 分钟前`:minutes<60*24?`${Math.round(minutes/60)} 小时前`:`${Math.round(minutes/(60*24))} 天前`;
      node.textContent=`${summary.population} 位居民 · LV.${summary.level} · ${when}`;
    }
  }

  renderPanel(){
    this.lastPanelRender=Date.now();const host=this.root.querySelector('#panel-host')!;const context=`${this.panel}:${this.panel==='supply'?this.supplyResource:this.panel==='building'?this.selected:''}:${this.demolishId||''}:${this.panel==='farming'?`${this.farmId}:${this.gardenAlbum}`:''}:${this.panel==='quests'?`${this.journeyTab}:${this.world.state.projects?.active}:${Object.values(this.world.state.projects?.stages??{}).join(',')}`:''}`;const scroll=this.renderedContext===context?host.querySelector('.panel-content')?.scrollTop||0:0;this.renderedContext=context;const s=this.world.state;
    if(!this.panel){host.innerHTML='';return;}
    const titles:Record<Exclude<Panel,null>,[string,string,string]>={farming:['GROW A LITTLE EVERY DAY','我的田园','wheat'],layout:['MAKE ROOM FOR BEAUTY','调整小镇布局','move'],roads:['PATHS OF EVERYDAY LIFE','把生活连成小路','road'],build:['BUILD YOUR DREAM','让小镇再长大一点','hammer'],warehouse:['A LITTLE ABUNDANCE','丰收仓库','box'],orders:['FROM YOUR NEIGHBORS','邻里订单','orders'],caravan:['BEYOND THE RIVER','河畔商队','caravan'],residents:['A PLACE TO CALL HOME','我们的邻居','people'],quests:['THE STORY SO FAR','小镇旅程','book'],settings:['MAKE YOURSELF AT HOME','小镇设置','gear'],building:['YOUR LITTLE TOWN','建筑详情','home'],help:['A SLOWER KIND OF LIFE','小镇生活指南','help'],mayor:['A HELPING HAND','小镇副官','spark'],technology:['A NEW CHAPTER','小镇的明日蓝图','research'],supply:['EVERY LITTLE THING','物资的来处','box'],map:['ACROSS THE VALLEY','河的两岸，都是家','map']};
    if(this.panel==='settings')void this.refreshSaveSlots();
    const [eyebrow,title,ico]=titles[this.panel];let content='';
    if(this.panel==='farming'){content=farmingContent(this.world,this.farmId,this.gardenAlbum);
    } else if(this.panel==='layout'){content=this.layoutContent();
    } else if(this.panel==='roads'){content=this.roadContent();
    } else if(this.panel==='map'){content=this.mapContent();
    } else if(this.panel==='technology'){content=this.technologyContent();
    } else if(this.panel==='supply'){content=this.supplyContent();
    } else if(this.panel==='build'){
      const cats=[['all','全部'],['homes','住宅'],['production','生产'],['services','市政'],['decoration','装饰']];
      content=`${this.button('open','layout',`${icon('move',17)} 调整已有建筑的位置`,false,'secondary-button wide')}<div class="catalog-categories">${cats.map(([key,name])=>this.button('category',key,name,false,`category ${this.category===key?'active':''}`)).join('')}</div><div class="build-catalog">${(Object.entries(BUILDINGS) as [BuildingKind,typeof BUILDINGS.cottage][]).sort(([,a],[,b])=>Number(Boolean(a.technology))-Number(Boolean(b.technology))).filter(([k,b])=>k!=='townhall'&&(this.category==='all'||b.category===this.category)).map(([kind,b])=>{const ornament=this.world.ornamentLock(kind);const locked=!this.world.isUnlocked(kind)||Boolean(ornament);const shortage=locked?ornament??`研究 · ${TECHNOLOGIES[b.technology!].name}`:s.coins<b.cost?'金币不足':s.resources.wood<b.wood||s.resources.stone<b.stone||Object.entries(b.materials||{}).some(([k,v])=>s.resources[k as Resource]<v!)?'材料不足':kind==='farm'&&s.buildings.filter(b=>b.kind==='farm').length>=Math.floor(s.population/2)+2?'居民不足':null;const affordable=!shortage;return `<button class="building-card ${locked?'blueprint-locked':''}" data-action="${locked?'open':'choose-build'}" data-value="${locked?'technology':kind}" ${!affordable&&!locked?'disabled':''} title="${esc(b.description)}"><span class="building-preview">${this.art(kind)}</span><strong>${b.name}</strong><span class="build-benefit">${this.buildingEffects(kind)}</span><span class="build-price">${icon('coin',16)} ${fmt(b.cost)}</span><span class="build-materials">${icon('wood',13)}${b.wood} ${icon('stone',13)}${b.stone}${b.materials?.materials?`${icon('materials',13)}${b.materials.materials}`:''}</span>${shortage?`<span class="unavailable">${shortage}</span>`:''}</button>`;}).join('')}</div><p class="catalog-footnote">${icon('leaf',14)} 选一座建筑，然后在小镇的空地上安家。把供应原料的作坊建在旁边——按居民实际要走的格数算，最近时加工时间省一成，越远越少。</p>`;
    } else if(this.panel==='building'){
      const b=s.buildings.find(b=>b.id===this.selected);if(!b){this.close();return;}const def=BUILDINGS[b.kind];
      const production=this.world.observe().production.find(p=>p.buildingId===b.id);
      const free=s.capacity-RESOURCE_KEYS.reduce((n,k)=>n+s.resources[k],0);
      const stockSize=Object.values(b.stock).reduce((n,v)=>n+(v||0),0);
      const hazard=b.damaged?DISASTERS[b.damageKind??'fire']:null;
      const blocked=b.repairingUntil!==undefined?'修缮中':b.damaged?hazard!.name:b.paused?'已暂停':def.workers&&b.workers===0?'缺少工人':production?.blocked==='materials'?'原料不足':production?.blocked==='warehouse'?'仓位不足':production?.blocked==='target'?'库存充足':production?.blocked==='reserve'?'保留建造木材':null;
      const animal=livestockSpec(b.kind),growing=Boolean(animal&&chickAge(b)<animal.seconds);
      const growthBlocked=b.repairingUntil!==undefined?'修缮中':b.damaged?hazard!.name:b.paused?'已暂停':b.workers===0?'缺少工人':animal&&!b.chickFeedPaid&&s.resources.feed<animal.feed?'等待成长口粮':null;
      const shownProgress=growing?chickAge(b)/animal!.seconds:b.progress;
      const stat=growing?(growthBlocked||'正在照料幼崽'):b.ready?(free<stockSize?'仓位不足':'收获时刻'):blocked|| (def.cycle?'正在生产':'温暖运转中');
      content=`<div class="detail-hero">${this.art(b.kind)}<span class="level-tag">等级 ${b.level}</span></div><div class="detail-heading"><h3>${def.name}</h3><span class="state-badge ${b.ready?'ready':''}">${stat}</span></div>${this.button('move',b.id,`${icon('move',16)} 免费搬迁 · 调整小镇布局`,false,'secondary-button wide')}<p class="description">${def.description}</p>${def.housing?this.homeGrowthDetails(b):''}${livestockSpec(b.kind)?this.livestockDetails(b):''}${b.kind==='orchardhouse'?`<div class="soil-card"><div><b>果园手记 · ${orchardStage(b.progress,b.ready)}</b><small>树龄 ${Math.floor((b.treeAge??0)/60)} 分钟 · 累计结果 ${b.orchardHarvests??0} 茬</small><small>品种记录：${orchardVarieties(b.orchardHarvests).join('、')}</small><small>结果 8 / 30 茬后自然留下新品种记录。采收后树体保留，下轮继续开花结果。</small></div></div>`:''}${b.kind==='mine'?`<div class="recipe-options" role="group" aria-label="开采的矿脉">${([['copper','铜矿脉'],['silver','银矿脉'],['gold','金矿脉'],['platinum','铂金矿脉']] as const).map(([key,label])=>`<button data-action="recipe" data-value="${b.id}:${key}" aria-pressed="${(b.productionFocus||'copper')===key}">${label}</button>`).join('')}</div><p class="muted">越深的矿脉出得越慢、越值钱：铜 5 份即换 1 锭，银出 4 份但慢三成，金出 3 份慢六成，铂金出 2 份慢九成。冶炼厂会自己挑仓里最富的那种矿，不用另设。</p><div class="recipe-options" role="group" aria-label="挖矿工具">${MINING_TOOLS.map(tool=>`<button data-action="mine-tool" data-value="${b.id}:${tool}" ${(this.world.state.resources[tool]||0)>0&&!b.ready?'':'disabled'}>${icon(tool,16)} ${MINING_TOOL_NAMES[tool]} ×${this.world.state.resources[tool]||0}</button>`).join('')}</div><p class="muted">工具不增产，只把井里这一批当场起出来，另得金币；偶尔能挖到古董藏品。${this.world.state.resources.antique?`已有古董藏品 ${this.world.state.resources.antique} 件。`:''}</p>`:''}${b.kind==='zooenclosure'?`<div class="recipe-options" role="group" aria-label="展区住户">${([['zebra','斑马'],['giraffe','长颈鹿'],['elephant','大象'],['lion','狮子']] as const).map(([key,label])=>`<button data-action="recipe" data-value="${b.id}:${key}" aria-pressed="${(b.productionFocus||'zebra')===key}">${label}</button>`).join('')}</div><p class="muted">每种动物的口粮与吸引力都不同：斑马 2 饲料 → 3 纪念品，长颈鹿 3 → 4，大象 4 → 6，狮子 3 → 5。换动物不影响已经收好的纪念品。</p>`:''}${b.kind==='winery'?`<div class="recipe-options" role="group" aria-label="酿酒坊生产方向">${([['wine','酿葡萄酒'],['beer','酿啤酒']] as const).map(([key,label])=>`<button data-action="recipe" data-value="${b.id}:${key}" aria-pressed="${(b.productionFocus||'wine')===key}">${label}</button>`).join('')}</div><p class="muted">酿葡萄酒：6 串葡萄 → 3 桶葡萄酒；酿啤酒：6 篮啤酒花 → 3 桶啤酒。啤酒要送到晚风酒馆才会被喝掉，否则只能卖出去。切换不会影响已经完成的那一批。</p>`:''}${b.kind==='lumber'?`<div class="recipe-options" role="group" aria-label="木工坊生产方向">${([['balanced','均衡补货'],['wood','木材优先'],['plank','木板优先']] as const).map(([key,label])=>`<button data-action="recipe" data-value="${b.id}:${key}" aria-pressed="${(b.productionFocus||'balanced')===key}">${label}</button>`).join('')}</div><p class="muted">木材优先：基础产量 10 木材；木板优先：2 木材 + 4 木板。按需采集缺少的物资，够用就休工；切换不影响已完成产物。</p>`:''}${def.cycle?`<div class="production-recipe">${production&&Object.keys(production.input).length?this.goods(production.input,!b.ready):`<span class="recipe-natural">${icon('leaf',20)} 自然馈赠</span>`}${icon('arrow',18)}${this.goods(b.ready?b.stock:production?.output||def.output||{})}</div><div class="production-label"><span>${growing?'成长进度 · 成年后自动生产':b.ready?'已经准备好':`本轮进度 · 约 ${Math.ceil(production?.cycle||def.cycle)} 秒 / 轮`}</span><b>${Math.round(shownProgress*100)}%</b></div><div class="large-progress"><i style="width:${shownProgress*100}%"></i></div>${this.button('collect',b.id,`${icon('wheat',20)} ${b.ready?(free<stockSize?'先腾出仓位':'收获物资'):def.autoCollect?'产物会自动收好':'等待收获'}`,!b.ready||free<stockSize,'game-button wide')}${stat==='库存充足'?'<p class="production-advice">库存已达到保留量，工坊正在休息。建造、加工或出售消耗后，会自动补货。</p>':stat==='保留建造木材'?`<p class="production-advice">保留 ${this.world.woodReserve()} 份木材供建造和冬季取暖，补足后工坊自动开工。</p>`:stat==='仓位不足'?this.button('open','warehouse','去仓库出售富余物资',false,'secondary-button wide'):stat==='原料不足'?'<p class="muted">备齐上方配方中的原料后，会自动继续生产。</p>':stat==='缺少工人'?'<p class="muted">保证住房和幸福度，等待更多居民入住。</p>':''}<div class="button-row">${this.button('production',b.id,`${icon(b.paused?'play':'pause',15)} ${b.paused?'继续生产':'暂停生产'}`,false,'text-button')}${this.button('focus',b.id,`${icon('focus',15)} 定位`,false,'text-button')}</div>`:`<div class="service-note">${icon(def.housing?'people':'heart',21)}${b.damaged?'受损停用，修复后恢复以下服务：<br>':''}${this.buildingEffects(b.kind,b.level)}</div>`}
      ${b.kind==='townhall'?this.button('open','technology',`${icon('research',19)} 研究小镇科技`,false,'game-button wide')+this.button('open','residents','查看居民与税收',false,'secondary-button wide'):b.kind==='market'?this.button('open','orders','看看邻里订单',false,'game-button wide'):b.kind==='warehouse'?this.button('open','warehouse','打开丰收仓库',false,'game-button wide'):''}${production?.haul!==null&&production?.haul!==undefined?`<p class="local-supply">${icon('check',15)} 原料走 ${production.haul} 格就到：每轮生产时间 −${Math.round((1-this.world.supplyFactorAt(production.haul))*100)}%。越近越省。</p>${this.journeyNote(production.freight)}`:def.input?`<p class="muted">${icon('move',14)} 把产出它原料的作坊搬到步行 6 格以内，每轮生产时间最多可省一成——越近省得越多。</p>`:''}${this.workerDetails(b)}${this.upgradeDetails(b)}${this.repairDetails(b)}${b.kind!=='townhall'?this.button('demolish-confirm',b.id,`${icon('trash',13)} 拆除并回收部分材料`,false,'danger-link'):''}`;
    } else if(this.panel==='warehouse'){
      content=this.button('open','orders','邻里订单 · 可选出售富余物资',false,'secondary-button wide')+this.warehouseContent();
    } else if(this.panel==='orders'){
      content=`<p class="panel-intro">一份小小的心意，让邻里更亲近。</p><div class="orders-list">${s.orders.map((o,i)=>{const cooldown=(o.cooldownUntil||0)>s.gameTime;const can=!cooldown&&Object.entries(o.items).every(([k,v])=>s.resources[k as Resource]>=v!);return `<article class="order-card${o.bulk?' bulk-order':''}"><div class="order-person"><span class="npc-avatar npc-${i%4}">${esc(o.npc.slice(0,1))}</span><div><small>${esc(o.npc)}</small><h3>${esc(o.title)}${o.bulk?' <span class="bulk-tag">大单</span>':''}</h3></div></div>${this.goods(o.items,true)}<div class="order-footer"><span class="reward">${icon('coin',17)} ${o.rewardCoins} <span>${icon('star',14)} ${o.rewardXp}</span></span>${this.button('order',o.id,cooldown?duration(o.cooldownUntil!-s.gameTime):can?'交付订单':'物资不足',!can,`small-button ${can?'':'quiet'}`)}</div>${!cooldown&&!o.bulk?this.button('cancel-order',o.id,'换一份委托',false,'cancel-order'):''}</article>`;}).join('')}</div>`;
    } else if(this.panel==='caravan'){
      const slots=this.world.caravanFleet(),capacity=this.world.caravanCapacity(),market=s.buildings.some(b=>b.kind==='market'&&!b.damaged);
      // The panel edits one slot at a time; default to the first one the player can act on so
      // the common case (one cart) needs no extra click.
      const active=slots.find(slot=>slot.id===this.caravanSlot)??slots.find(slot=>slot.status==='returned')??slots[0];
      if(active&&this.caravanSlot!==active.id)this.caravanSlot=active.id;
      const chosen=destinationOf(active?.destination);
      const cargoReady=!!active&&Object.entries(active.cargo).every(([k,v])=>s.resources[k as Resource]>=v!);
      const room=s.capacity-RESOURCE_KEYS.reduce((n,k)=>n+s.resources[k],0);
      const marketLevel=Math.max(1,...s.buildings.filter(b=>b.kind==='market').map(b=>b.level));
      const harbor=!!s.projects?.stages?.harbor&&s.projects.stages.harbor>0;
      const routes=availableDestinations(s.researched,this.world.hasHarbor());
      const routeCards=routes.map(destination=>{
        const missing=missingCargo(destination,s.resources);
        const short=Object.entries(missing).map(([k,v])=>`缺 ${v} ${RESOURCES[k as Resource].name}`).join('、');
        const mine=slots.filter(slot=>(slot.destination??'valley')===destination.id).length;
        const isActive=destination.id===chosen.id;
        return `<button class="route-card ${isActive?'active':''}" data-action="choose-route" data-value="${destination.id}" aria-pressed="${isActive}" ${active?.status==='traveling'?'disabled':''}>
          <b>${esc(destination.name)}${isActive?` <span class="route-mark">本队</span>`:''}${mine>1?` <span class="route-mark">${mine} 队在跑</span>`:''}</b>
          <small>${esc(destination.description)}</small>
          <span class="route-facts">${Object.entries(destination.cargo).map(([k,v])=>`${v} ${RESOURCES[k as Resource].name}`).join(' · ')}</span>
          <span class="route-facts">${icon('coin',13)} ${destination.rewardCoins} · ${Object.entries(destination.rewardItems).map(([k,v])=>`${v} ${RESOURCES[k as Resource].name}`).join('、')} · 约 ${Math.round(caravanDuration(destination,marketLevel,harbor))} 秒</span>
          <span class="route-cost ${short?'shortage':''}">${short||'货物已备齐'}</span>
        </button>`;
      }).join('');
      const unlocked=destinationIds.filter(id=>!routes.some(r=>r.id===id));
      // The slot strip only appears once the town can actually run more than one cart.
      const slotStrip=capacity<=1?'':`<div class="section-label">本镇商队 · ${slots.length} / ${capacity}</div><div class="caravan-slots">${slots.map(slot=>{
        const destination=destinationOf(slot.destination);
        const state=slot.status==='traveling'?`在路上 · ${Math.max(0,Math.ceil(slot.returnAt-s.gameTime))} 秒`:slot.status==='returned'?'已归来，等你领取':'待出发';
        return `<button class="caravan-slot ${slot.id===active?.id?'active':''} ${slot.status}" data-action="caravan-slot" data-value="${slot.id}" aria-pressed="${slot.id===active?.id}"><b>商队 ${slot.id.replace('caravan-','')}</b><small>${esc(destination.name)}</small><span>${state}</span></button>`;
      }).join('')}</div>`;
      const waiting=slots.filter(slot=>slot.status==='returned').length;
      const heading=!market?'先建一座集市，才能组织商队。':active?.status==='traveling'?'带着小镇的心意，向远方出发':active?.status==='returned'?'远方的礼物，已经到家':`商队 ${active?.id.replace('caravan-','')} · 下一趟：${esc(chosen.name)}`;
      const hint=!market?'集市是小队出发的地方。':capacity<=1?'选择路线后装车出发；不同路线走不同的桥，货物与回报也各不相同。集市升到 2 级就能同时派出第 2 支商队。':`每支商队各自选路线、各自往返，最多同时派出 ${capacity} 支。${waiting>1?`有 ${waiting} 支已经回来了。`:''}`;
      const giftItems=active?.rewardItems??{};const giftSize=Object.values(giftItems).reduce((n,v)=>n+(v??0),0);
      const gift=active?.status==='returned'?`<div class="returned-gift">${icon('box',26)}<div><b>带回 ${Object.entries(giftItems).map(([k,v])=>`${v} ${RESOURCES[k as Resource].name}`).join('、')}与 ${active.rewardCoins} 金币</b><small>${room<giftSize?'仓位不足，先腾出空间再领取。':'点击下方按钮领取。'}</small></div></div>`:'';
      content=`<div class="caravan-illustration">${this.art('market')}${icon('caravan',60)}</div><div class="destination-label"><span>青岚小镇</span><i></i>${icon('caravan',24)}<i></i><span>${esc(chosen.name)}</span></div><h3 class="center-title">${heading}</h3><p class="description centered">${hint}</p>${slotStrip}<div class="section-label">可选路线</div><div class="route-list">${routeCards}${unlocked.map(id=>`<div class="route-card locked"><b>${esc(destinationOf(id).name)}</b><small>研究「${esc(TECHNOLOGIES[DESTINATIONS[id].technology!].name)}」后开放。</small></div>`).join('')}</div>${gift}${this.button('caravan','',!active?'先建一座集市':active.status==='traveling'?'商队在路上':active.status==='returned'?'迎接商队 · 领取物资':market&&cargoReady?'装好货物，出发':market?'货物还没备齐':'先建一座集市',!market||!active||(active.status==='idle'&&!cargoReady),'game-button wide')}`;
    } else if(this.panel==='residents'){
      content=`<div class="residents-summary"><span class="happiness-face">${icon('smile',54)}</span><div><strong>${Math.round(s.happiness)}<small>%</small></strong><span>${s.happiness>=70?'这里是安心的家':'邻居们需要更多照顾'}</span></div></div><div class="people-count"><span>${icon('people',21)} 常住居民 <b>${s.population}</b></span><span>${icon('home',21)} 总床位 <b>${this.world.housingCapacity()}</b></span></div><div class="population-plan"><b>当前可住 ${Math.min(this.world.housingCapacity(),this.world.communityCapacity())} 人</b><span>社区人口名额 ${this.world.communityCapacity()} · 床位 ${this.world.housingCapacity()}</span><p>学校、诊所与剧院增加人口名额；住宅增加床位。幸福度达到 70%、备足三天口粮时，每个游戏日可迎来一位新邻居。</p>${this.button('open','build','建造住宅与市政设施',false,'secondary-button wide')}</div>${this.citizenRoster()}<div class="needs-list">${[['food','食物','bread'],['water','饮水','water'],['services','社区生活','home'],['environment','环境','leaf'],['comfort','衣着','clothing'],['leisure','闲适','heart'],['faith','信仰','spark'],['health','康健','shield']].map(([key,label,ico])=>`<div class="need-row${['comfort','leisure','faith','health'].includes(key)?' bonus':''}"><span>${icon(ico,20)} ${label}</span><div><i style="width:${s.needs[key as keyof typeof s.needs]}%"></i></div><b>${Math.round(s.needs[key as keyof typeof s.needs])}%</b></div>`).join('')}<p class="muted">衣着、闲适、信仰与康健都是额外的关照：备足衣物与点心，让诊所有余力照顾邻居，再有一座教堂，居民会更满足——对重税也更从容；一时没有也不会让心情变差。</p></div>${this.neighbourCard()}${this.activityCard()}${this.petCard()}<div class="section-label">税收政策 <small>多一点关照，多一份长久</small></div><div class="tax-options">${TAX_RATES.map((rate,i)=>this.button('tax',String(i),`<b>${rate}%</b><span>${TAX_NAMES[i]}</span>`,false,`tax-option ${s.taxRate===i?'active':''}`)).join('')}</div><p class="muted">较高的税率会减少幸福度；食物、清水与花园让更多新邻居愿意留下。</p><div class="festival-card"><span>${icon('spark',28)}</span><div><b>今夜，办一场小镇庆典</b><small>短时提升幸福感 · 180 金币</small></div>${this.button('festival','','举办',s.coins<180,'small-button')}</div>`;
    } else if(this.panel==='quests'){
      content=`<div class="journey-tabs">${this.button('journey-tab','weekly','每周挑战',false,this.journeyTab==='weekly'?'active':'')}${this.button('journey-tab','growth','田园成长',false,this.journeyTab==='growth'?'active':'')}${this.button('journey-tab','achievements','成就',false,this.journeyTab==='achievements'?'active':'')}${this.button('journey-tab','styles','街区风格',false,this.journeyTab==='styles'?'active':'')}${this.button('journey-tab','projects','建设收藏',false,this.journeyTab==='projects'?'active':'')}${this.button('journey-tab','quests','旧日手记',false,this.journeyTab==='quests'?'active':'')}</div>`+(this.journeyTab==='weekly'?this.weeklyContent():this.journeyTab==='growth'?growthContent(this.world):this.journeyTab==='achievements'?this.achievementsContent():this.journeyTab==='styles'?this.stylesContent():this.journeyTab==='projects'?this.projectsContent():`<div class="journey-heading"><span>${icon('book',38)}</span><div><h3>把日子，过成喜欢的样子</h3><p>每一个小小的进步，都值得被记住。</p></div></div><div class="journey-list">${s.quests.map((q,i)=>`<article class="journey-item ${q.claimed?'completed':''}"><span class="journey-number">${q.claimed?icon('check',18):String(i+1).padStart(2,'0')}</span><div><h3>${esc(q.title)}</h3><p>${esc(q.description)}</p><div class="quest-progress"><i style="width:${Math.min(100,q.progress/q.target*100)}%"></i></div><span class="reward">${icon('coin',15)} ${q.rewardCoins} ${icon('star',13)} ${q.rewardPrestige} 声望</span></div>${this.button('quest',q.id,q.claimed?'已完成':q.progress>=q.target?'领取':`${Math.min(q.progress,q.target)}/${q.target}`,q.claimed||q.progress<q.target,'small-button quiet')}</article>`).join('')}</div>`);
    } else if(this.panel==='settings'){
      content=`<div class="setting-row"><div><b>小镇音效</b><small>点击、收获与奖励的提示音，以及按远近混合的建筑环境音</small></div><button role="switch" aria-checked="${s.settings.sound}" aria-label="小镇音效" class="toggle ${s.settings.sound?'on':''}" data-action="sound"><i></i></button></div><div class="setting-row"><div><b>自然挑战</b><small>随季节出现火情、水患、旱情、雹灾与虫害，考验小镇的布局与防护</small></div><button role="switch" aria-checked="${s.settings.disasters}" aria-label="自然挑战" class="toggle ${s.settings.disasters?'on':''}" data-action="disasters"><i></i></button></div><div class="setting-row"><div><b>小镇副官</b><small>离线规则助手 · 自动收获、交单、调税</small></div><button role="switch" aria-checked="${s.settings.autoMayor}" aria-label="小镇副官" class="toggle ${s.settings.autoMayor?'on':''}" data-action="mayor"><i></i></button></div>${this.button('open','mayor',`${icon('book',17)} 看看副官的工作手记`,false,'text-button')}<div class="setting-row"><div><b>离线游玩</b><small>${esc(this.offlineStatus)}</small></div>${icon('leaf',21)}</div><div class="section-label">把今天好好保存 <small>${esc(this.saveLabel)}</small></div><div class="save-slots">${[1,2,3].map(i=>`<div class="save-slot"><span>${icon('save',20)} 手动存档 ${i}<small class="slot-summary" data-slot="slot-${i}">读取中…</small></span>${this.button('save',`slot-${i}`,'保存',false,'small-button')}${this.button('load',`slot-${i}`,'读取',false,'small-button quiet')}</div>`).join('')}</div><div class="button-row">${this.button('export','',`${icon('download',17)} 导出备份`,false,'secondary-button')}${this.button('import','',`${icon('upload',17)} 导入存档`,false,'secondary-button')}</div><p class="muted">每 30 秒自动保存。读取或导入会切换当前小镇，可先存入其他槽位。离开后，小镇最多为你积攒 8 小时的收获。存档留在这台设备上，可导出带走。</p><div class="settings-footer">DREAM TOWN <span>田园与成长 · 2.8</span></div>`;
          content+=`<div class="setting-row"><div><b>轻量动画</b><small>减少飘动、粒子与镜头移动，保留操作提示</small></div>${this.button('motion','',(s.settings.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches)?'已开启':'未开启',false,'small-button')}</div>`;
    } else if(this.panel==='mayor'){
      content=`<div class="mayor-header">${icon('spark',36)}<h3>${s.settings.autoMayor?'副官正在照顾小镇':'需要一只帮忙的手吗'}</h3><p>规则助手根据库存与需求执行操作，所有决定都遵守小镇的经营规则。</p>${this.button('mayor','',s.settings.autoMayor?'让副官休息':'请副官上岗',false,'game-button wide')}</div><div class="section-label">工作手记</div><div class="town-logs">${s.logs.slice(0,16).map(log=>`<div class="town-log ${log.type}"><span>${duration(log.time)}</span><p>${esc(log.message)}</p></div>`).join('')}</div>`;
    } else if(this.panel==='help'){
      content=`<div class="help-intro">${icon('leaf',38)}<h3>慢一点，也没关系。</h3><p>这里没有充值和竞争。种一片麦田、烤一炉面包，慢慢建起喜欢的生活。</p></div><ol class="help-steps"><li><b>把丰收收进口袋</b><span>点选带有 ✓ 的麦田或工坊，或点「一键收取」收好所有可入库的成熟产物。仓位不足的产物留在工坊。</span></li><li><b>帮邻居完成小心愿</b><span>打开「订单」，交付物资，赚取金币与经验。新订单会带来下一步目标。</span></li><li><b>让小镇再长大一点</b><span>打开「建造」，选择建筑，再点选地图空地。点选已有建筑可以升级与管理。</span></li><li><b>铺一条有质感的小路</b><span>左侧「道路规划」可铺土路、石子路与石板路；点起点再点终点，升级只补差价。路面和建筑不能互相占用。</span></li><li><b>别忘了邻居的心情</b><span>保证食物与饮水、保持合适税收。派商队带回建材，扩建更大的仓库。</span></li><li><b>把手艺传给明天</b><span>在「科技」中用声望研究工坊蓝图。点物资图标能找到生产来源，按链条建造并安排工人。</span></li></ol><div class="shortcut-grid">${[['F','打开田园'],['拖动','移动地图'],['滚轮 / 双指','缩放地图'],['空格','暂停 / 继续'],['B','打开建造'],['I','打开仓库'],['O','打开订单'],['T','研究科技'],['M','河谷地图'],['R','道路规划'],['L','调整布局'],['C','一键收取'],['Esc','关闭 / 取消'],['H','回到小镇中心']].map(([key,label])=>`<span><kbd>${key}</kbd>${label}</span>`).join('')}</div>`;
    }
    if(this.demolishId){
      const b=s.buildings.find(b=>b.id===this.demolishId);
      if(b){
        const def=BUILDINGS[b.kind],refund={wood:Math.floor(def.wood*.3),stone:Math.floor(def.stone*.3)};
        const used=RESOURCE_KEYS.reduce((n,k)=>n+s.resources[k],0),removed=b.kind==='warehouse'?this.world.warehouseIncrement()*b.level:0;
        const blocked=this.world.demolitionCapacityIssue(b)?.message??(used+refund.wood+refund.stone>s.capacity-removed?'拆除后的仓库放不下现有库存与回收材料，请先腾出空间。':null);
        content=`<div class="help-intro">${icon('hammer',42)}<h3>拆除${def.name}？</h3><p>返还 ${Math.floor(def.cost*.35)} 金币、${refund.wood} 木材与 ${refund.stone} 石料。${removed?`仓储容量减少 ${removed} 格。`:def.housing?`床位减少 ${b.level*def.housing} 个。`:def.populationCap?`社区人口名额减少 ${b.level*def.populationCap} 位。`:''}${b.ready?'尚未收取的产物会一同丢失。':''}拆除后无法撤销。</p>${blocked?`<p>${blocked}</p>`:''}</div><div class="button-row">${this.button('cancel-demolish','','再想想',false,'secondary-button')}${this.button('demolish',b.id,'确认拆除',Boolean(blocked),'game-button')}</div>`;
      }else this.demolishId=null;
    }
    this.html(host,`<section class="game-panel ${this.panel==='build'?'catalog-panel':this.panel==='technology'?'technology-panel':this.panel==='map'?'map-panel':''} ${['orders','quests'].includes(this.panel)?'wide-panel':''}" role="dialog" aria-label="${this.demolishId?'确认拆除建筑':title}"><div class="panel-heading"><span class="panel-emblem">${icon(ico,24)}</span><div><small>${eyebrow}</small><h2>${this.demolishId?'确认拆除建筑':title}</h2></div><button class="close-button" data-action="close" aria-label="关闭面板">${icon('close',20)}</button></div><div class="panel-content">${content}</div></section>`);
    const body=host.querySelector('.panel-content');if(body)body.scrollTop=scroll;
  }
  updateMapViewport(x:number,y:number){
    const point={x:x/116+y/58,y:y/58-x/116};
    this.html(this.root.querySelector('#mini-map')!,valleyMap(this.world.state.buildings,point,this.world.state.regions));
  }
  /** Earned achievements first, then the ones still in progress, grouped by theme. */
  private stylesContent(){
    const rows=this.world.observe().collections;
    const done=rows.filter(row=>row.next===null).length;
    const card=(row:typeof rows[number])=>{
      const style=COLLECTIONS[row.id];
      const next=row.next;
      const target=next?next.need:style.tiers[style.tiers.length-1]!.need;
      return `<article class="achievement style-card ${next?'':'earned'}"><span class="achievement-badge">${icon(style.icon,20)}</span><div>
        <h4>${esc(style.name)}<small> ${row.tier} / ${style.tiers.length}</small></h4>
        <p>${esc(style.description)}</p>
        <div class="quest-progress"><i style="width:${Math.min(100,Math.round(row.count/target*100))}%"></i></div>
        <small>一带已有 ${row.count} 件（${row.distinct} 种）${next?` · 下一步「${esc(next.name)}」需 ${next.need} 件 / ${next.distinct} 种`:' · 已成型'}</small>
        ${style.tiers.map((tier,index)=>`<span class="style-step ${row.tier>index?'reached':''}">${row.tier>index?icon('check',12):icon('minus',12)} ${esc(tier.name)}${tier.unlocks?` · ${esc(BUILDINGS[tier.unlocks].name)}`:''}</span>`).join('')}
      </div>${next?'':`<span class="achievement-mark">${icon('star',14)} 已成型</span>`}</article>`;
    };
    return `<div class="journey-heading"><span>${icon('flower',38)}</span><div><h3>让街角，有它自己的样子</h3><p>把相关的装饰摆在一处，连成一片就会成为风格。风格一旦成形就永久保留，还会解锁纪念摆件。</p></div></div>
      <div class="research-ledger"><span>已成形 <b>${done} / ${rows.length}</b> 种街区风格</span></div>
      <div class="achievement-list">${rows.map(card).join('')}</div>`;
  }

  /**
   * The week's board. Three tasks, a clock, and what finishing them all is worth — docs/02 §9
   * replaces the Regatta with rotating weekly challenges, so this is the one screen in the game
   * with a deadline on it.
   */
  /**
   * The townspeople, one at a time, as far as the portraits go.
   *
   * docs/07 §2 puts a roster of individual residents in the save, and this is where it shows: each
   * named neighbour with the house they live in and the workshop they staff. Residents past the
   * twelve portraits are counted rather than listed, because the game's direction is few names.
   */
  private citizenRoster(){
    const roster=this.world.observe().citizens;
    const named=roster.filter(citizen=>citizen.name);
    if(!named.length)return '';
    const homeless=roster.filter(citizen=>!citizen.homeKind).length;
    const idle=roster.filter(citizen=>!citizen.workKind).length;
    // Each named neighbour shows the portrait they already have in the story atlas, so the roster
    // and the story panel are plainly the same twelve people.
    const card=(citizen:typeof named[number])=>`<article class="citizen-card">${citizen.portrait?`<span class="citizen-face">${this.portrait(citizen.portrait)}</span>`:`<span class="citizen-face">${icon('people',18)}</span>`}<div><b>${esc(citizen.name!)}</b><small>${citizen.homeKind?`住在${esc(citizen.homeKind)}`:'还没有住处'} · ${citizen.workKind?`在${esc(citizen.workKind)}做事`:'暂时空闲'}</small></div></article>`;
    return `<h3 class="inventory-group">街坊名录 · ${named.length} 位<span class="muted">（${homeless} 位还没住处 · ${idle} 位暂时空闲）</span></h3><div class="citizen-list">${named.map(card).join('')}</div>`;
  }

  private weeklyContent(){
    const board=this.world.observe().weekly;
    const daysLeft=Math.ceil(board.remaining*7);
    const card=(task:typeof board.tasks[number])=>`<article class="weekly-task ${task.done?'done':''}"><span class="weekly-check">${icon(task.done?'check':'clock',18)}</span><div><h4>${esc(task.name)}</h4><p>${esc(task.description)}</p><div class="quest-progress"><i style="width:${Math.round(task.current/task.target*100)}%"></i></div><small>${task.current} / ${task.target} · 奖励 ${task.prestige} 声望${task.coins?` + ${task.coins} 金币`:''}</small></div>${task.done?`<span class="achievement-mark">${icon('star',14)} 完成</span>`:''}</article>`;
    const owed=board.tasks.reduce((n,task)=>n+task.prestige,0);
    const coins=board.tasks.reduce((n,task)=>n+task.coins,0);
    return `<div class="journey-heading"><span>${icon('clock',38)}</span><div><h3>本周的挑战</h3><p>七天一届，到期换新。全部完成会自动结算，不用领取。</p></div></div>
      <div class="research-ledger"><span>还剩 <b>${daysLeft} / 7</b> 天${board.complete?` · <b>${board.rewarded?'已结算':'结算中'}</b>`:''}</span><span>全清 <b>${owed}</b> 声望${coins?` / ${coins} 金币`:''}</span></div>
      <div class="weekly-list">${board.tasks.map(card).join('')}</div>
      <p class="muted">进度按本周新增计算，不吃老本；到期未完成的会作废，下周换一批任务。任务是从池子里按周抽的，读档不会换到更容易的一批。</p>`;
  }

  /**
   * The two journeys a batch pays for, stated in the same terms as the bonus above it: what it
   * costs, in per cent of the batch. A workshop with a supplier next door and homes next door
   * shows nothing, because that is the good case and there is nothing to explain.
   */
  private journeyNote(row:{haul:number;commute:number;carry:number;walk:number}){
    const carry=Math.round(row.carry*100), walk=Math.round(row.walk*100);
    const parts:string[]=[];
    // Worded as a cost in time, and set apart from the proximity bonus above it, so the two
    // rules on one card are not read as one contradictory number.
    if(carry>0)parts.push(`${icon('box',14)} 另有搬运耗时 <b>+${carry}%</b>：原料从 ${Number.isFinite(row.haul)?`${row.haul} 格外`:'无来源'}运来`);
    if(walk>0)parts.push(`${icon('people',14)} 另有通勤耗时 <b>+${walk}%</b>：居民从 ${Number.isFinite(row.commute)?`${row.commute} 格外`:'极远处'}来上工`);
    return parts.length?`<p class="muted journey-note">${parts.join('<br>')}</p>`:'';
  }

  private achievementsContent(){
    const rows=this.world.observe().achievements;
    const earned=rows.filter(row=>row.unlocked).length;
    const byCategory=(category:string)=>rows.filter(row=>row.category===category);
    const card=(row:typeof rows[number])=>{
      const done=row.unlocked;
      return `<article class="achievement ${done?'earned':''}"><span class="achievement-badge">${icon(done?'check':row.icon,20)}</span><div><h4>${esc(row.name)}</h4><p>${esc(row.description)}</p>${done?'':`<div class="quest-progress"><i style="width:${Math.round(row.progress/row.target*100)}%"></i></div><small>${row.progress} / ${row.target}</small>`}</div>${done?`<span class="achievement-mark">${icon('star',14)} 已达成</span>`:''}</article>`;
    };
    return `<div class="journey-heading"><span>${icon('trophy',38)}</span><div><h3>走过的每一步，都算数</h3><p>成就自动达成，不用领取；奖励是声望，用来研究新的手艺。</p></div></div>
      <div class="research-ledger"><span>已达成 <b>${earned} / ${rows.length}</b> 项成就</span></div>
      ${(Object.keys(ACHIEVEMENT_CATEGORY_NAMES) as (keyof typeof ACHIEVEMENT_CATEGORY_NAMES)[]).map(category=>{
        const group=byCategory(category);
        if(!group.length)return '';
        const done=group.filter(row=>row.unlocked).length;
        return `<h3 class="inventory-group">${ACHIEVEMENT_CATEGORY_NAMES[category]} · ${done} / ${group.length}</h3><div class="achievement-list">${group.map(card).join('')}</div>`;
      }).join('')}`;
  }
  private projectsContent(){
    const s=this.world.state,active=s.projects?.active,allDone=PROJECT_IDS.every(id=>s.projects?.stages[id]===3);
    return `<div class="project-intro"><span class="eyebrow">小镇的下一段故事</span><h3>想把这里，变成什么样？</h3><p>选一个喜欢的方向。没有截止时间，换方向也保留已完成的阶段。</p></div><div class="project-choices">${PROJECT_IDS.map(id=>{const p=PROJECTS[id],done=s.projects?.stages[id]??0;return `<button data-action="project-select" data-value="${id}" class="project-choice ${active===id?'active':''}" ${done===3?'disabled':''} aria-pressed="${active===id}">${icon(p.icon,24)}<strong>${p.name}</strong><span>${done===3?'已获得 · '+p.title:done+' / 3 阶段'}</span></button>`;}).join('')}</div>${active?(()=>{const p=PROJECTS[active],v=this.world.projectStatus(active);if(!v.stage)return '';return `<article class="project-detail"><div class="project-byline">${icon(p.icon,20)} ${p.resident}<span>第 ${v.completed+1} / 3 阶段</span></div><h3>${v.stage.name}</h3><p class="project-story">${v.stage.story}</p><div class="project-requirements">${v.requirements.map(r=>`<div class="project-requirement ${r.current>=r.target?'fulfilled':''}"><div><b>${icon(r.current>=r.target?'check':'flag',16)} ${r.label}</b><strong>${Math.min(r.current,r.target)} / ${r.target}${r.metric==='water'?'%':''}</strong></div><div class="quest-progress"><i style="width:${Math.min(100,r.current/r.target*100)}%"></i></div><p>${r.tip}</p>${r.current<r.target&&r.category?this.button('project-build',r.category,'去'+({homes:'建住宅',production:'配套生产',services:'完善市政',decoration:'布置花木'}[r.category]),false,'text-button'):''}</div>`).join('')}</div><div class="project-contribution"><b>落成筹备 · 确认时交付</b>${this.goods(v.stage.contribution,true)}<small>额外保留建造木材；交付食物后留足三天口粮。</small></div><div class="project-reward">${icon('star',20)}<span>本阶段：${v.completed+2} 声望 · ${150+v.completed*50} 经验<br><b>最终称号「${p.title}」</b> · ${p.perk}</span></div>${this.button('project-complete',active,v.ready?'完成筹备 · 举行落成仪式':v.reason,!v.ready,'game-button wide')}</article>`;})():`<div class="project-invitation">${icon('flag',38)}<p>${allDone?'三枚称号已经点亮。把喜欢的街区继续布置下去，永久效果会一直陪伴小镇。':'选中上方计划，看看邻居希望一起完成什么。'}</p></div>`}<div class="project-titles">${PROJECT_IDS.map(id=>{const p=PROJECTS[id],done=s.projects?.stages[id]===3;return `<div class="project-title ${done?'earned':''}">${icon(done?'star':'flag',20)}<div><b>${p.title}</b><small>${p.perk}</small></div><span>${done?'已获得':'待点亮'}</span></div>`;}).join('')}</div>`;
  }
  private roadContent(){
    const roads=this.world.state.roads??[];
    return `<p class="panel-intro">从田间土路到青石街巷，让每一步都有质感。</p><div class="road-catalog">${(Object.keys(ROAD_TYPES) as RoadKind[]).map(kind=>{const d=ROAD_TYPES[kind];return `<article class="road-card"><div class="road-sample road-${kind}"><i></i></div><div><h3>${d.name}</h3><p>${d.description}</p><small>${d.coins} 金币${d.stone?` · ${d.stone} 石料`:''} / 新铺一格</small><small>已铺 ${roads.filter(r=>r.kind===kind).length} 格</small></div>${this.button('choose-road',kind,'铺设 / 升级',false,'small-button')}</article>`;}).join('')}</div><div class="road-instructions"><b>两点成路，逐级升级</b><p>选择路面后，点起点、再点终点，可连续铺设一段转角道路。同一格点两次可单格操作，拖动地图仍可浏览两岸。</p><p>升级仅补差价：土路 → 石子路需 8 金币 + 1 石料；石子路 → 石板路需 16 金币 + 2 石料。路线经过建筑或河道时整段不会施工；已有桥梁保留。</p></div>${this.button('choose-road','remove','移除路面 · 腾出空地',false,'game-button wide quiet')}`;
  }
  private mapContent(){
    const s=this.world.state;
    return `<p class="panel-intro">沿着青岚河，在两岸慢慢建起喜欢的生活。</p><div class="large-valley-map">${valleyMap(s.buildings,undefined,s.regions)}</div><div class="district-cards">${REGION_IDS.map(id=>`<article class="district-card"><div><h3>${REGIONS[id].name}</h3><p>${REGIONS[id].description}</p>${this.button('region-open',id,s.regions?.includes(id)?'已开放':s.level>=REGIONS[id].level?'免费开放':`小镇 ${REGIONS[id].level} 级开放`,!!s.regions?.includes(id)||s.level<REGIONS[id].level,'small-button')}${this.button('district',id,'前往查看',false,'text-button')}</div></article>`).join('')}</div><div class="map-stats"><span><b>64 × 64</b> 河谷地格</span><span><b>2</b> 跨河桥梁</span><span><b>4</b> 规划分区</span></div><div class="district-cards">${DISTRICT_KEYS.map(id=>{const d=DISTRICTS[id],n=s.buildings.filter(b=>districtAt(b.x,b.y)===id).length;return `<button data-action="district" data-value="${id}" class="district-card"><span>${icon(d.icon,28)}</span><div><h3>${d.name}</h3><p>${d.subtitle}</p><small>${n} 座建筑 · 点击前往</small></div>${icon('arrow',18)}</button>`;}).join('')}</div>${this.button('district','overview',`${icon('expand',18)} 鸟瞰整座河谷`,false,'game-button wide')}<div class="section-label">让产业各得其所</div><p class="muted">一键把农田和牧场放到农业区，工坊放到工业区，矿场放到山麓。现有住宅和市政建筑留在原处；全部等级、库存、工人与生产进度保留。之后可在建筑详情中免费搬迁。</p>${this.button('arrange','',`${icon('move',17)} 按建议分区整理工坊`,false,'secondary-button wide')}${s.layoutUndo?.length?this.button('undo-arrange','',`${icon('back',16)} 还原整理前的位置`,false,'secondary-button wide'):''}<p class="muted">分区是规划建议，陆地可自由建设。河道、桥梁和陡峭山峰不能放置建筑。新地图兼容原有存档。</p>`;
  }
  private technologyContent(){
    const s=this.world.state;
    const node=(id:TechnologyId)=>{
      const t=TECHNOLOGIES[id],status=this.world.researchStatus(id);
      return `<article class="technology-node ${status.completed?'learned':status.available?'researchable':'research-locked'}" aria-label="${t.name}"><div class="technology-title"><span class="technology-seal">${icon(status.completed?'check':t.icon,25)}</span><div><small>${status.completed?'已经掌握':`LV. ${t.level} · ${t.requires.length?'进阶手艺':'起步蓝图'}`}</small><h3>${t.name}</h3></div></div><p>${t.description}</p>${t.unlocks.length?`<div class="blueprint-buildings">${t.unlocks.map(kind=>`<button data-action="${status.completed?'choose-build':'open'}" data-value="${status.completed?kind:'technology'}" ${!status.completed?'disabled':''} aria-label="建造${BUILDINGS[kind].name}">${this.art(kind)}<span>${BUILDINGS[kind].name}</span></button>`).join('')}</div>`:''}${status.completed?'':`<div class="technology-cost">${icon('star',15)} ${t.prestige} 声望 · ${icon('coin',15)} ${fmt(t.coins)}</div>${this.goods(t.items,true)}${this.button('research',id,status.available?'研究这项手艺':status.reason,true,'game-button wide')}`}</article>`;
    };
    const chain=(keys:Resource[])=>`<div class="chain-ribbon" aria-label="生产链">${keys.map((k,i)=>`${i?icon('chevron',12):''}<button data-action="supply" data-value="${k}" title="查看${RESOURCES[k].name}来源">${icon(k,21)}<span>${RESOURCES[k].name}</span></button>`).join('')}</div>`;
    // Branches, their chains and their technologies all come from the technology data,
    // so adding a technology cannot leave the page showing a stale list.
    const BRANCHES=[['industry','山野炉火','工业之路','ore'],['pastoral','麦穗与暖衣','田园之路','wool'],['town','把日子过好','小镇之路','home']] as const;
    const CHAINS:Record<string,Resource[]>={industry:['ore','ingot','tools'],pastoral:['feed','wool','cloth','clothing','milk','grape','wine'],town:[]};
    return `<div class="research-intro"><div><span class="eyebrow">写给明天的小镇</span><h3>好手艺，让梦想生根。</h3><p>选一条喜欢的路，慢慢成为小镇的拿手好戏。</p></div><div class="prestige-pouch">${icon('star',27)}<b>${s.prestige}</b><small>可用声望</small></div></div><div class="research-ledger"><span>已掌握 <b>${s.researched.length} / ${TECHNOLOGY_KEYS.length}</b> 项手艺 · 荣誉 <b>${honourLevelsTaken(s.honours??{})} / ${HONOUR_TRACK_IDS.reduce((n,id)=>n+HONOURS[id].levels.length,0)}</b> 级</span>${this.button('open','quests','做旅程任务，积攒声望',false,'text-button')}</div>${s.researched.length===TECHNOLOGY_KEYS.length?`<p class="research-done">${icon('check',14)} 手艺已经全部学完。往后攒下的声望，就投在下面的「小镇荣誉」里——三条线各八级，一级比一级贵，效果永久。</p>`:''}<div class="research-branches">${BRANCHES.map(([branch,title,subtitle,branchIcon])=>{
      const ids=TECHNOLOGY_KEYS.filter(id=>TECHNOLOGIES[id].branch===branch).sort((a,b)=>TECHNOLOGIES[a].level-TECHNOLOGIES[b].level);
      const keys=CHAINS[branch]??[];
      return `<section class="research-branch ${branch}-branch"><h3>${icon(branchIcon,20)} ${title} <small>${subtitle}</small></h3>${keys.length?chain(keys):''}${ids.map((id,i)=>`${i?`<div class="branch-thread">${icon('chevron',15)}</div>`:''}${node(id)}`).join('')}</section>`;
    }).join('')}</div>${this.honoursSection()}`;
  }

  /**
   * Town honours: what standing buys once it has nowhere else to go. Each track states its
   * own price and effect, so the exchange is legible without a separate tutorial.
   */
  private honoursSection(){
    const rows=this.world.observe().honours;
    const spent=rows.reduce((total,row)=>total+row.level,0);
    const card=(row:typeof rows[number])=>{
      const next=row.next;
      const affordable=next?this.world.state.prestige>=next.cost:false;
      const state=!row.unlocked?`达 ${row.unlockLevel} 级开放`:!next?'已做到头':`第 ${row.level} / ${row.max} 级`;
      const effect=row.earned?`当前 +${row.earned} ${row.unit}`:'还没有投入';
      return `<article class="honour-card ${row.unlocked?'':'locked'} ${next?'':'complete'}">
        <span class="honour-seal">${icon(row.icon,22)}</span>
        <div><h4>${esc(row.name)} <small>${esc(state)}</small></h4><p>${esc(row.description)}</p>
        <small class="honour-effect">${esc(effect)}${next?` · 下一级 +${next.value} ${row.unit}（${next.cost} 声望）`:' · 已满级'}</small></div>
        ${next&&row.unlocked?this.button('deepen-honour',row.id,`${next.note} · ${next.cost}`,!affordable,'small-button'):''}
      </article>`;
    };
    return `<section class="honour-section" id="honours"><h3>${icon('star',20)} 小镇荣誉 <small>把攒下的声望，变成留得下的东西</small></h3>
      <p class="muted">声望不只是研究的手续费。每一条荣誉都能再做几级，一级比一级贵，效果永久保留。</p>
      <div class="honour-list">${rows.map(card).join('')}</div>
      <div class="research-ledger"><span>已投入 <b>${spent}</b> 级荣誉</span></div></section>`;
  }

  private supplyContent(){
    const key=this.supplyResource,s=this.world.state;
    const producers=(Object.entries(BUILDINGS) as [BuildingKind,typeof BUILDINGS.cottage][]).filter(([,def])=>def.output?.[key]);
    return `${this.button('open',this.supplyOrigin||'technology',`${icon('back',15)} 返回${this.supplyOrigin==='orders'?'订单':this.supplyOrigin==='technology'?'科技蓝图':this.supplyOrigin==='warehouse'?'仓库':'上一页'}`,false,'text-button')}<div class="supply-heading">${icon(key,49)}<div><h3>${RESOURCES[key].name}</h3><p>仓库现有 ${s.resources[key]} 份 · 售价 ${RESOURCES[key].sellPrice} 金币</p></div></div><p class="panel-intro">点配方里的物资，继续追溯它的来处。</p>${key==='materials'?`<div class="service-note">${icon('caravan',26)} 只有远行商队能带回建材</div>${this.button('open','caravan','去安排商队',false,'game-button wide')}`:producers.map(([kind,def])=>{
      const unlocked=this.world.isUnlocked(kind),existing=s.buildings.filter(b=>b.kind===kind);
      return `<article class="supply-producer"><div class="detail-hero">${this.art(kind)}</div><h3>${def.name}</h3><p class="description">${def.description}</p><div class="production-recipe">${def.input?this.goods(def.input,true):`<span class="recipe-natural">${icon('leaf',19)} 自然采集</span>`}${icon('arrow',18)}${this.goods(def.output||{})}</div>${existing.length?existing.map(b=>this.button('inspect',b.id,`${icon('focus',16)} 查看 ${def.name} · ${b.workers||0} 位工人`,false,'secondary-button wide')).join(''):unlocked?this.button('choose-build',kind,`${icon('hammer',18)} 建造${def.name}`,false,'game-button wide'):this.button('open','technology',`${icon('lock',17)} 先研究「${TECHNOLOGIES[def.technology!].name}」`,false,'game-button wide')}</article>`;
    }).join('')}<p class="muted">工坊建好后，在详情中安排空闲居民。原料充足才会开始生产，收取后可用于下一段加工或交付订单。</p>`;
  }
  private showDemolish(id:string){if(!this.world.state.buildings.some(b=>b.id===id))return;this.demolishId=id;this.renderPanel();this.root.querySelector<HTMLElement>('[data-action="cancel-demolish"]')?.focus();}
}
