import { farmingContent, growthContent, cropArt } from './farmingPanel';
import { CROPS, CROP_IDS, gardenLevel, type CropId } from '../sim/farming';
import { PROJECT_IDS, PROJECTS, type ProjectId } from '../sim/projects';
import { ROAD_TYPES, type RoadKind } from '../sim/roads';
import { DISTRICTS, DISTRICT_KEYS, districtAt, preferredDistrict, type District } from '../sim/terrain';
import { valleyMap, districtButtons, type MapDestination } from './valleyMap';
import { SimWorld, type Building, type BuildingKind, type Resource, type ActionResult, type OfflineReport } from '../sim/world';
import { BUILDINGS, RESOURCES, RESOURCE_KEYS, SEASON_NAMES, TAX_NAMES, TAX_RATES, TECHNOLOGIES, TECHNOLOGY_KEYS, INDUSTRY_KINDS, INDUSTRY_FRAMES, DECORATION_SPRITES, DECORATION_ATLAS, EXPANSION_SPRITES, EXPANSION_ATLAS, EXPANSION_FRAMES, DECORATION_FRAMES, type TechnologyId } from '../sim/data';
import { icon } from './icons';
import { DISASTERS, REPAIR_SECONDS, type DisasterKind } from '../sim/disasters';
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const fmt = (n:number)=>Math.floor(n).toLocaleString('zh-CN');
const duration=(n:number)=>`${Math.floor(Math.max(0,n)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,n)%60).toString().padStart(2,'0')}`;
type Panel='farming'|'layout'|'build'|'warehouse'|'orders'|'caravan'|'residents'|'quests'|'settings'|'building'|'help'|'mayor'|'technology'|'supply'|'map'|'roads'|null;
export interface UICallbacks { action: (fn:()=>ActionResult,id?:string,effect?:string)=>void; build:(kind:BuildingKind|null)=>void; road:(kind:RoadKind|'remove'|null)=>void; focus:(id:string)=>void; zoom:(delta:number)=>void; home:()=>void; district:(id:MapDestination)=>void; move:(id:string)=>void; speed:(value:number)=>void; sound:()=>void; save:(slot?:string)=>Promise<void>; load:(slot:string)=>Promise<void>; export:()=>void; import:(file:File)=>Promise<void>; fullscreen:()=>void; }
export class GameUI {
  panel:Panel=null; selected:string|null=null; speed=1; buildKind:BuildingKind|null=null; category='all'; moveId:string|null=null; supplyResource:Resource='wood'; journeyTab:'growth'|'projects'|'quests'='growth'; farmId:string|null=null; gardenAlbum=false;
  roadMode:RoadKind|'remove'|null=null;
  private toastTimer=0; private root:HTMLElement; private frames:Record<string,{x:number;y:number;w:number;h:number}>={};
  private lastPanelRender=0; private saveLabel='已启用自动存档'; private offlineStatus='正在准备离线游玩…'; private offlineReport:OfflineReport|null=null;
  private renderedContext=''; private supplyOrigin:Panel='technology';
  private demolishId:string|null=null; private panelOpener:HTMLElement|null=null; private offlineOpener:HTMLElement|null=null;
  constructor(public world:SimWorld,private cb:UICallbacks){
    this.root=document.querySelector('#ui')!;
    this.root.innerHTML=`<div class="vignette"></div><header class="top-hud"><button class="town-identity" data-action="open" data-value="residents" aria-label="查看青岚小镇居民"><span class="level-badge"><span>LV.</span><b id="level">3</b></span><span class="town-name"><small>DREAM TOWN</small><strong>青岚小镇 ${icon('chevron',14)}</strong><span class="xp-track"><i id="xp-progress"></i></span></span></button><div class="resources" id="resources"></div><div class="calendar" id="calendar"></div></header>
    <nav class="side-tools" aria-label="游戏工具"><button class="round-button" data-action="open" data-value="layout" title="调整布局 L" aria-label="调整布局">${icon('move')}</button><button class="round-button" data-action="open" data-value="map" title="河谷地图 M" aria-label="河谷地图">${icon('map')}</button><button class="round-button" data-action="open" data-value="roads" title="道路规划 R" aria-label="道路规划">${icon('road')}</button><button class="round-button" data-action="open" data-value="settings" title="设置与存档" aria-label="设置与存档">${icon('gear')}</button><button class="round-button" data-action="sound" id="sound-toggle" title="声音" aria-label="切换音效">${icon('sound')}</button><button class="round-button" data-action="fullscreen" title="全屏" aria-label="全屏">${icon('expand')}</button><button class="round-button mobile-home" data-action="home" aria-label="回到小镇中心">${icon('focus')}</button><span class="tool-divider"></span><button class="round-button" data-action="open" data-value="help" title="操作指南" aria-label="操作指南">${icon('help')}</button></nav>
    <div class="town-status" id="town-status"></div><nav class="district-nav" aria-label="分区导航">${districtButtons()}<button data-action="district" data-value="overview" aria-label="查看全地图">${icon('expand',17)}</button></nav><button class="mini-map-card" data-action="open" data-value="map" aria-label="展开河谷地图"><span class="mini-map-caption">${icon('map',13)} 青岚河谷 <small>46 × 46</small></span><span id="mini-map"></span></button><button class="harvest-all" id="harvest-all" data-action="collect-all" aria-label="一键收取">${icon('harvest',22)}<span>一键收取</span><b id="harvest-count">0</b></button><aside class="quest-peek" id="quest-peek"></aside><div class="build-hint" id="build-hint" hidden></div><div class="panel-host" id="panel-host"></div><div class="offline-host" id="offline-host"></div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <footer class="bottom-hud"><div class="world-caption"><span class="live-dot"></span><span id="world-caption">春风正好，万物生长</span><small id="save-status">${icon('save',12)} 本地自动存档</small></div><div class="dock-wrap"><div class="dock-label"><i></i> 你的小镇，你的节奏 <i></i></div><nav class="game-dock" aria-label="小镇管理">${[['farming','wheat','田园','F'],['build','hammer','建造','B'],['warehouse','box','仓库','I'],['caravan','caravan','商队',''],['residents','people','居民',''],['technology','research','科技','T'],['quests','book','成长','']].map(([key,ico,label,k])=>`<button class="dock-button ${key==='farming'?'primary-dock':''}" data-action="open" data-value="${key}" aria-label="${label}"><span class="dock-icon">${icon(ico,29)}<i class="dock-notification" id="badge-${key}" hidden></i></span><span>${label}</span>${k?`<kbd>${k}</kbd>`:''}</button>`).join('')}</nav></div><div class="camera-controls"><div class="zoom-controls"><button data-action="zoom-out" aria-label="缩小">${icon('minus',18)}</button><button data-action="home" aria-label="回到小镇中心" title="回到小镇中心">${icon('focus',18)}</button><button data-action="zoom-in" aria-label="放大">${icon('plus',18)}</button></div><div class="time-controls" id="time-controls"></div></div></footer><div class="touch-tip">拖动探索 · 双指缩放</div><input type="file" id="import-file" accept=".json,application/json" hidden>`;
    this.root.addEventListener('click',event=>{const target=(event.target as HTMLElement).closest<HTMLElement>('[data-action]');if(target&&!target.hasAttribute('disabled'))this.handle(target.dataset.action!,target.dataset.value);});
    this.root.addEventListener('change',event=>{const target=event.target as HTMLSelectElement;if(target.id==='farm-scope'){this.farmId=target.value||null;this.renderPanel();}});
    this.root.addEventListener('keydown',event=>{if(!this.offlineReport)return;event.stopPropagation();if(event.key==='Tab'){event.preventDefault();this.root.querySelector<HTMLElement>('[data-action="offline-close"]')?.focus();}if(event.key==='Escape'){event.preventDefault();this.cancel();}});
    this.root.querySelector('#import-file')!.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input.files?.[0])void this.cb.import(input.files[0]);input.value='';});
    fetch('/assets/frames.json').then(r=>{if(!r.ok)throw new Error('素材索引未就绪');return r.json();}).then(data=>{this.frames=data.frames;this.renderPanel();this.renderOffline();}).catch(()=>{});
    this.update();
  }
  art(kind:BuildingKind,className=''){if(EXPANSION_SPRITES.some(k=>k===kind)){const f=EXPANSION_FRAMES[kind as keyof typeof EXPANSION_FRAMES];return `<svg class="art ${className}" viewBox="0 0 ${f.w} ${f.h}" aria-hidden="true"><svg width="${f.w}" height="${f.h}" overflow="hidden"><image href="/assets/town-expansion.png" x="${-f.x}" y="${-f.y}" width="${EXPANSION_ATLAS.width}" height="${EXPANSION_ATLAS.height}" ${f.clip?`clip-path="url(#atlas-${kind})"`:""}/>${f.clip?`<defs><clipPath id="atlas-${kind}" clipPathUnits="userSpaceOnUse"><polygon points="${f.clip.map(([x,y])=>`${x},${y}`).join(" ")}"/></clipPath></defs>`:""}</svg></svg>`;}const decor=DECORATION_SPRITES.findIndex(k=>k===kind);if(decor>=0){const {width,height}=DECORATION_ATLAS,{x,y,w,h}=DECORATION_FRAMES[DECORATION_SPRITES[decor]];return `<svg class="art ${className}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><svg width="${w}" height="${h}" overflow="hidden"><image href="/assets/decorations.png" x="${-x}" y="${-y}" width="${width}" height="${height}"/></svg></svg>`;}if(INDUSTRY_KINDS.includes(kind)){const f=INDUSTRY_FRAMES[kind as keyof typeof INDUSTRY_FRAMES];return `<svg class="art ${className}" viewBox="0 0 ${f.w} ${f.h}" aria-hidden="true"><svg width="${f.w}" height="${f.h}" overflow="hidden"><image href="/assets/industry.png" x="${-f.x}" y="${-f.y}" width="1774" height="887"/></svg></svg>`;}const key=kind==='firetower'?'watchtower':kind;const f=this.frames[key];if(kind==='farm')return cropArt('wheat',className);if(!f)return `<span class="art ${className}">${icon('home',42)}</span>`;return `<svg class="art ${className}" viewBox="0 0 ${f.w} ${f.h}" aria-hidden="true"><svg width="${f.w}" height="${f.h}" overflow="hidden"><image href="/assets/buildings.png" x="${-f.x}" y="${-f.y}" width="1448" height="1086"/></svg></svg>`;}
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
      case 'production':this.cb.action(()=>this.world.toggleProduction(value!),value);break;
      case 'repair':this.cb.action(()=>this.world.repair(value!),value);break;
      case 'inspect':this.cb.focus(value!);this.select(value!);return;
      case 'research':this.cb.action(()=>this.world.research(value as TechnologyId),undefined,'research');break;
      case 'supply':this.supplyResource=value as Resource;if(this.panel!=='supply'){this.supplyOrigin=this.panel;this.open('supply');}else this.renderPanel();return;
      case 'order':this.cb.action(()=>this.world.fulfillOrder(value!));break;
      case 'cancel-order':this.cb.action(()=>this.world.cancelOrder(value!));break;
      case 'caravan':this.cb.action(()=>this.world.dispatchCaravan(),undefined,'caravan');break;
      case 'tax':this.cb.action(()=>this.world.setTax(Number(value)));break;
      case 'festival':this.cb.action(()=>this.world.festival(),undefined,'festival');break;
      case 'sell-surplus':this.cb.action(()=>this.world.sellSurplus((value||undefined) as Resource|undefined));break;
      case 'recipe':{const [id,recipe]=value!.split(':');this.cb.action(()=>this.world.setProductionFocus(id,recipe),id);break;}
      case 'sell':this.cb.action(()=>this.world.sell(value as Resource,5));break;
      case 'journey-tab':this.journeyTab=value as 'growth'|'projects'|'quests';this.renderPanel();return;
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
    this.html(this.root.querySelector('#calendar')!,`<span class="season-icon">${icon(s.season==='winter'?'spark':s.season==='autumn'?'leaf':'sun',29)}</span><span><b>${SEASON_NAMES[s.season]} <em>第 ${Math.floor(s.gameTime/90)+1} 天</em></b><small>${s.season==='winter'?'冬日慢生长 · 记得备粮':'晴朗 · 宜耕作，宜出门'}</small></span>`);
    this.html(this.root.querySelector('#town-status')!,`<button data-action="open" data-value="residents">${icon('people',18)}<b>${s.population}</b><span>位邻居</span></button><i></i><button data-action="open" data-value="residents">${icon('smile',18)}<b>${Math.round(s.happiness)}%</b><span>${s.happiness>=70?'安居乐业':'需要关怀'}</span></button>`);
    const garden=gardenLevel(s.farming!.xp),nextCrop=CROP_IDS.find(id=>CROPS[id].level>garden.level);
    this.html(this.root.querySelector('#quest-peek')!,`<div class="quest-top"><span>${icon('leaf',16)} 我的田园 · Lv.${garden.level}</span><button data-action="open" data-value="farming" aria-label="打开田园">${icon('chevron',16)}</button></div><h3>${nextCrop?'下一份期待，'+CROPS[nextCrop].name:'把土地养成自己的风景'}</h3><p>${s.farming!.harvested} 份收获 · ${s.farming!.autoReplant?'收完自动续种':'自由选种，慢慢生长'}</p><div class="quest-progress"><i style="width:${garden.next?Math.min(100,garden.progress/garden.next*100):100}%"></i></div><div class="quest-bottom"><span>${garden.next?`${garden.progress} / ${garden.next} 园艺经验`:'园艺已满级'}</span><button data-action="open" data-value="farming">去田园 ${icon('arrow',14)}</button></div>`);
    this.html(this.root.querySelector('#sound-toggle')!,icon(s.settings.sound?'sound':'mute'));
    this.html(this.root.querySelector('#time-controls')!,`<button data-action="speed" data-value="${this.speed===0?1:0}" class="${this.speed===0?'active':''}" aria-label="${this.speed===0?'继续游戏':'暂停游戏'}">${icon(this.speed===0?'play':'pause',15)}</button>${[1,2,4].map(n=>`<button data-action="speed" data-value="${n}" class="${this.speed===n?'active':''}" aria-label="${n} 倍速">${n}×</button>`).join('')}`);
    this.root.querySelector('#world-caption')!.textContent=this.buildKind?'为新的故事，留一块地方':this.speed===0?'时间暂停，慢慢想一想':ready?`${ready} 处收获，正在等你`:'春风正好，万物生长';
    this.root.querySelectorAll<HTMLElement>('.dock-button').forEach(b=>b.classList.toggle('selected',b.dataset.value===this.panel));
    for(const key of ['quests','caravan','technology']){const el=this.root.querySelector(`#badge-${key}`) as HTMLElement;if(!el)continue;const n=key==='caravan'?Number(s.caravan.status==='returned'):0;el.hidden=!n;el.textContent=String(n);}
    this.root.classList.toggle('panel-open',this.panel!==null);this.root.classList.toggle('building-mode',this.buildKind!==null||this.roadMode!==null);
    void total;
    if(this.panel&&Date.now()-this.lastPanelRender>1000)this.renderPanel();
  }
  setPlacementHint(text:string){const el=this.root.querySelector('#placement-preview-hint');if(el)el.textContent=text;}
  setRoadHint(text:string){const el=this.root.querySelector('#road-preview-hint');if(el)el.textContent=text;}
  private updateBuildHint(){const el=this.root.querySelector('#build-hint') as HTMLElement;if(this.roadMode){el.hidden=false;el.innerHTML=`${icon('road',22)}<span><strong>${this.roadMode==='remove'?'移除路面':ROAD_TYPES[this.roadMode].name}</strong><small>${this.roadMode==='remove'?'移除不返还材料，桥梁保留':'高等级路面只补差价 · 不会降级已有路面'}</small><small id="road-preview-hint">点起点，再点终点 · 同格点两次可单格操作</small></span><button data-action="cancel-build" aria-label="结束道路规划">${icon('close',19)}</button>`;return;}el.hidden=!this.buildKind;el.innerHTML=this.buildKind?`${icon('hammer',20)}<span>${this.moveId?'搬迁':'放置'}<strong>${BUILDINGS[this.buildKind].name}</strong><small>${this.moveId?'免费搬迁 · 保留等级、产物和进度':`${fmt(BUILDINGS[this.buildKind].cost)} 金币 · ${BUILDINGS[this.buildKind].wood} 木材 · ${BUILDINGS[this.buildKind].stone} 石料${BUILDINGS[this.buildKind].materials?.materials?` · ${BUILDINGS[this.buildKind].materials!.materials} 建材`:""}`}</small><small id="placement-preview-hint">建筑、树木与道路互不重叠</small><small>推荐${DISTRICTS[preferredDistrict(this.buildKind)].name} · 点选空地${this.moveId?'搬迁':'建造'} · 拖动可移动地图</small></span><button data-action="cancel-build" aria-label="${this.moveId?'取消搬迁':'取消建造'}">${icon('close',19)}</button>`:'';}
  private goods(items:Partial<Record<Resource,number>>,compare=false){const s=this.world.state;return `<div class="goods-row">${Object.entries(items).map(([k,v])=>`<button data-action="supply" data-value="${k}" title="查看${RESOURCES[k as Resource].name}的生产来源" aria-label="${RESOURCES[k as Resource].name} ${compare?`${Math.floor(s.resources[k as Resource])} / `:''}${v}，查看生产来源" class="goods ${compare&&s.resources[k as Resource]<v!?'shortage':''}">${icon(k,24)}<span>${compare?`${Math.floor(s.resources[k as Resource])}<small> / ${v}</small>`:`${v}`}</span>${compare?`<small>${RESOURCES[k as Resource].name}</small>`:''}</button>`).join('')}</div>`;}
  private button(action:string,value:string,label:string,disabled=false,cls='game-button'){return `<button class="${cls}" data-action="${action}" data-value="${esc(value)}" ${disabled?'disabled':''}>${label}</button>`;}
  private layoutContent(): string {
    const s=this.world.state;
    return `<div class="layout-intro">${icon('move',30)}<div><h3>给喜欢的风景，换个位置</h3><p>选择下方建筑，再点地图空地。搬迁免费，保留等级、工人、产物和进度。红色地块不能放置。</p></div></div>${this.button('decorate','',`${icon('leaf',17)} 添置装饰与树木`,false,'secondary-button wide')}
      ${DISTRICT_KEYS.map(key=>{const buildings=s.buildings.filter(b=>districtAt(b.x,b.y)===key);return `<h3 class="inventory-group">${DISTRICTS[key].name} · ${buildings.length}</h3><div class="layout-list">${buildings.map(b=>`<article class="layout-building">${this.art(b.kind)}<div><b>${BUILDINGS[b.kind].name}</b><small>等级 ${b.level} · 地块 ${b.x}, ${b.y}</small></div><button class="small-button" data-action="move" data-value="${b.id}" aria-label="搬迁${BUILDINGS[b.kind].name}，地块${b.x},${b.y}">${icon('move',15)} 搬迁</button></article>`).join('')}</div>`;}).join('')}`;
  }

  private warehouseContent(): string {
    const s=this.world.state, used=RESOURCE_KEYS.reduce((n,k)=>n+s.resources[k],0);
    const targets=this.world.stockTargets(), surplus=this.world.surplusQuote();
    const barn=s.buildings.filter(b=>b.kind==='warehouse'&&b.level<3).sort((a,b)=>a.level-b.level)[0];
    const groups: [string,Resource[]][]=[['建造与采集',['wood','plank','stone','materials','ore']],['居民口粮',['fish','bread']],['农产与加工',['wheat','flour','charcoal','ingot','feed','wool','cloth']],['成品与贸易',['tools','clothing']]];
    return `<div class="warehouse-hero">${this.art('warehouse')}<div><strong>${fmt(used)}<small> / ${s.capacity}</small></strong><span>已使用空间 · 空闲 ${fmt(s.capacity-used)}</span></div></div>
      <div class="large-progress ${used>=s.capacity?'full':''}"><i style="width:${Math.min(100,used/s.capacity*100)}%"></i></div>
      <section class="stock-policy"><div class="stock-policy-title">${icon('leaf',20)}<b>按需生产 · 自动补货</b></div><p>库存够用就休工，消耗后自动复产。优先留足木材和口粮，给新收成留出周转空间。</p><div class="stock-reserve">${icon('wood',18)} 炭窑与锯木厂保留 ${this.world.woodReserve()} 木材供建造与取暖</div>
      ${this.button('sell-surplus','',surplus.quantity?`出售富余 · ${fmt(surplus.quantity)} 份`:'库存均在保留量内',!surplus.quantity,'game-button wide')}
      <small>${surplus.quantity?`可腾出 ${fmt(surplus.quantity)} 格 · 获得 ${fmt(surplus.coins)} 金币`:'没有富余物资需要清理'}<br>保留日常用量与当前订单所需物资，建材包不出售。</small></section>
      <div class="inventory-list">${groups.map(([label,keys])=>{
        const visible=keys.filter(k=>targets[k]>0||s.resources[k]>0);
        if(!visible.length)return '';
        return `<h3 class="inventory-group">${label}</h3>${visible.map(k=>`<div class="inventory-row economy-row"><button class="inventory-icon" data-action="supply" data-value="${k}" aria-label="查看${RESOURCES[k].name}的来源">${icon(k,27)}</button><div class="inventory-name"><b>${RESOURCES[k].name}</b><small>${k==='materials'?'商队专属 · 全部保留':`补货至 ${targets[k]} · ${surplus.items[k]?`富余 ${surplus.items[k]}`:'日常储备'}`}</small></div><strong>${fmt(s.resources[k])}</strong><div class="inventory-actions">${this.button('sell-surplus',k,'卖富余',!surplus.items[k],'small-button quiet')}${this.button('sell',k,'卖出 5',s.resources[k]<5,'inventory-sell-five')}</div></div>`).join('')}`;
      }).join('')}</div>${barn?this.upgradeDetails(barn):'<p class="muted">现有仓库均已满级，按需生产会随总容量调整保留量。</p>'}`;
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
    const cost=hazard.repair;
    const enough=s.coins>=cost.coins&&s.resources.wood>=cost.wood&&s.resources.stone>=cost.stone;
    const items={wood:cost.wood,stone:cost.stone};
    return `<div class="repair-block"><b>${hazard.name}：需要修缮</b><small>${hazard.advice}</small>${this.button('repair',b.id,'安排修缮',!enough,'game-button wide')}</div><p class="muted">${icon('coin',15)} ${fmt(cost.coins)} 金币${s.coins<cost.coins?' · 金币不足':''}</p>${this.goods(items,true)}`;
  }
  renderPanel(){
    this.lastPanelRender=Date.now();const host=this.root.querySelector('#panel-host')!;const context=`${this.panel}:${this.panel==='supply'?this.supplyResource:this.panel==='building'?this.selected:''}:${this.demolishId||''}:${this.panel==='farming'?`${this.farmId}:${this.gardenAlbum}`:''}:${this.panel==='quests'?`${this.journeyTab}:${this.world.state.projects?.active}:${Object.values(this.world.state.projects?.stages??{}).join(',')}`:''}`;const scroll=this.renderedContext===context?host.querySelector('.panel-content')?.scrollTop||0:0;this.renderedContext=context;const s=this.world.state;
    if(!this.panel){host.innerHTML='';return;}
    const titles:Record<Exclude<Panel,null>,[string,string,string]>={farming:['GROW A LITTLE EVERY DAY','我的田园','wheat'],layout:['MAKE ROOM FOR BEAUTY','调整小镇布局','move'],roads:['PATHS OF EVERYDAY LIFE','把生活连成小路','road'],build:['BUILD YOUR DREAM','让小镇再长大一点','hammer'],warehouse:['A LITTLE ABUNDANCE','丰收仓库','box'],orders:['FROM YOUR NEIGHBORS','邻里订单','orders'],caravan:['BEYOND THE RIVER','河畔商队','caravan'],residents:['A PLACE TO CALL HOME','我们的邻居','people'],quests:['THE STORY SO FAR','小镇旅程','book'],settings:['MAKE YOURSELF AT HOME','小镇设置','gear'],building:['YOUR LITTLE TOWN','建筑详情','home'],help:['A SLOWER KIND OF LIFE','小镇生活指南','help'],mayor:['A HELPING HAND','小镇副官','spark'],technology:['A NEW CHAPTER','小镇的明日蓝图','research'],supply:['EVERY LITTLE THING','物资的来处','box'],map:['ACROSS THE VALLEY','河的两岸，都是家','map']};
    const [eyebrow,title,ico]=titles[this.panel];let content='';
    if(this.panel==='farming'){content=farmingContent(this.world,this.farmId,this.gardenAlbum);
    } else if(this.panel==='layout'){content=this.layoutContent();
    } else if(this.panel==='roads'){content=this.roadContent();
    } else if(this.panel==='map'){content=this.mapContent();
    } else if(this.panel==='technology'){content=this.technologyContent();
    } else if(this.panel==='supply'){content=this.supplyContent();
    } else if(this.panel==='build'){
      const cats=[['all','全部'],['homes','住宅'],['production','生产'],['services','市政'],['decoration','装饰']];
      content=`${this.button('open','layout',`${icon('move',17)} 调整已有建筑的位置`,false,'secondary-button wide')}<div class="catalog-categories">${cats.map(([key,name])=>this.button('category',key,name,false,`category ${this.category===key?'active':''}`)).join('')}</div><div class="build-catalog">${(Object.entries(BUILDINGS) as [BuildingKind,typeof BUILDINGS.cottage][]).sort(([,a],[,b])=>Number(Boolean(a.technology))-Number(Boolean(b.technology))).filter(([k,b])=>k!=='townhall'&&(this.category==='all'||b.category===this.category)).map(([kind,b])=>{const locked=!this.world.isUnlocked(kind);const shortage=locked?`研究 · ${TECHNOLOGIES[b.technology!].name}`:s.coins<b.cost?'金币不足':s.resources.wood<b.wood||s.resources.stone<b.stone||Object.entries(b.materials||{}).some(([k,v])=>s.resources[k as Resource]<v!)?'材料不足':kind==='farm'&&s.buildings.filter(b=>b.kind==='farm').length>=Math.floor(s.population/2)+2?'居民不足':null;const affordable=!shortage;return `<button class="building-card ${locked?'blueprint-locked':''}" data-action="${locked?'open':'choose-build'}" data-value="${locked?'technology':kind}" ${!affordable&&!locked?'disabled':''} title="${esc(b.description)}"><span class="building-preview">${this.art(kind)}</span><strong>${b.name}</strong><span class="build-benefit">${this.buildingEffects(kind)}</span><span class="build-price">${icon('coin',16)} ${fmt(b.cost)}</span><span class="build-materials">${icon('wood',13)}${b.wood} ${icon('stone',13)}${b.stone}${b.materials?.materials?`${icon('materials',13)}${b.materials.materials}`:''}</span>${shortage?`<span class="unavailable">${shortage}</span>`:''}</button>`;}).join('')}</div><p class="catalog-footnote">${icon('leaf',14)} 选一座建筑，然后在小镇的空地上安家。</p>`;
    } else if(this.panel==='building'){
      const b=s.buildings.find(b=>b.id===this.selected);if(!b){this.close();return;}const def=BUILDINGS[b.kind];
      const production=this.world.observe().production.find(p=>p.buildingId===b.id);
      const free=s.capacity-RESOURCE_KEYS.reduce((n,k)=>n+s.resources[k],0);
      const stockSize=Object.values(b.stock).reduce((n,v)=>n+(v||0),0);
      const hazard=b.damaged?DISASTERS[b.damageKind??'fire']:null;
      const blocked=b.repairingUntil!==undefined?'修缮中':b.damaged?hazard!.name:b.paused?'已暂停':def.workers&&b.workers===0?'缺少工人':production?.blocked==='materials'?'原料不足':production?.blocked==='warehouse'?'仓位不足':production?.blocked==='target'?'库存充足':production?.blocked==='reserve'?'保留建造木材':null;
      const stat=b.ready?(free<stockSize?'仓位不足':'收获时刻'):blocked|| (def.cycle?'正在生产':'温暖运转中');
      content=`<div class="detail-hero">${this.art(b.kind)}<span class="level-tag">等级 ${b.level}</span></div><div class="detail-heading"><h3>${def.name}</h3><span class="state-badge ${b.ready?'ready':''}">${stat}</span></div>${this.button('move',b.id,`${icon('move',16)} 免费搬迁 · 调整小镇布局`,false,'secondary-button wide')}<p class="description">${def.description}</p>${b.kind==='lumber'?`<div class="recipe-options" role="group" aria-label="木工坊生产方向">${([['balanced','均衡补货'],['wood','木材优先'],['plank','木板优先']] as const).map(([key,label])=>`<button data-action="recipe" data-value="${b.id}:${key}" aria-pressed="${(b.productionFocus||'balanced')===key}">${label}</button>`).join('')}</div><p class="muted">木材优先：基础产量 10 木材；木板优先：2 木材 + 4 木板。按需采集缺少的物资，够用就休工；切换不影响已完成产物。</p>`:''}${def.cycle?`<div class="production-recipe">${def.input?this.goods(def.input,!b.ready):`<span class="recipe-natural">${icon('leaf',20)} 自然馈赠</span>`}${icon('arrow',18)}${this.goods(b.ready?b.stock:production?.output||def.output||{})}</div><div class="production-label"><span>${b.ready?'已经准备好':`本轮进度 · 约 ${Math.ceil(production?.cycle||def.cycle)} 秒 / 轮`}</span><b>${Math.round(b.progress*100)}%</b></div><div class="large-progress"><i style="width:${b.progress*100}%"></i></div>${this.button('collect',b.id,`${icon('wheat',20)} ${b.ready?(free<stockSize?'先腾出仓位':'收获物资'):'等待收获'}`,!b.ready||free<stockSize,'game-button wide')}${stat==='库存充足'?'<p class="production-advice">库存已达到保留量，工坊正在休息。建造、加工或出售消耗后，会自动补货。</p>':stat==='保留建造木材'?`<p class="production-advice">保留 ${this.world.woodReserve()} 份木材供建造和冬季取暖，补足后工坊自动开工。</p>`:stat==='仓位不足'?this.button('open','warehouse','去仓库出售富余物资',false,'secondary-button wide'):stat==='原料不足'?'<p class="muted">备齐上方配方中的原料后，会自动继续生产。</p>':stat==='缺少工人'?'<p class="muted">保证住房和幸福度，等待更多居民入住。</p>':''}<div class="button-row">${this.button('production',b.id,`${icon(b.paused?'play':'pause',15)} ${b.paused?'继续生产':'暂停生产'}`,false,'text-button')}${this.button('focus',b.id,`${icon('focus',15)} 定位`,false,'text-button')}</div>`:`<div class="service-note">${icon(def.housing?'people':'heart',21)}${b.damaged?'受损停用，修复后恢复以下服务：<br>':''}${this.buildingEffects(b.kind,b.level)}</div>`}
      ${b.kind==='townhall'?this.button('open','technology',`${icon('research',19)} 研究小镇科技`,false,'game-button wide')+this.button('open','residents','查看居民与税收',false,'secondary-button wide'):b.kind==='market'?this.button('open','orders','看看邻里订单',false,'game-button wide'):b.kind==='warehouse'?this.button('open','warehouse','打开丰收仓库',false,'game-button wide'):''}${this.workerDetails(b)}${this.upgradeDetails(b)}${this.repairDetails(b)}${b.kind!=='townhall'?this.button('demolish-confirm',b.id,`${icon('trash',13)} 拆除并回收部分材料`,false,'danger-link'):''}`;
    } else if(this.panel==='warehouse'){
      content=this.button('open','orders','邻里订单 · 可选出售富余物资',false,'secondary-button wide')+this.warehouseContent();
    } else if(this.panel==='orders'){
      content=`<p class="panel-intro">一份小小的心意，让邻里更亲近。</p><div class="orders-list">${s.orders.map((o,i)=>{const cooldown=(o.cooldownUntil||0)>s.gameTime;const can=!cooldown&&Object.entries(o.items).every(([k,v])=>s.resources[k as Resource]>=v!);return `<article class="order-card"><div class="order-person"><span class="npc-avatar npc-${i%4}">${esc(o.npc.slice(0,1))}</span><div><small>${esc(o.npc)}</small><h3>${esc(o.title)}</h3></div></div>${this.goods(o.items,true)}<div class="order-footer"><span class="reward">${icon('coin',17)} ${o.rewardCoins} <span>${icon('star',14)} ${o.rewardXp}</span></span>${this.button('order',o.id,cooldown?duration(o.cooldownUntil!-s.gameTime):can?'交付订单':'物资不足',!can,`small-button ${can?'':'quiet'}`)}</div>${!cooldown?this.button('cancel-order',o.id,'换一份委托',false,'cancel-order'):''}</article>`;}).join('')}</div>`;
    } else if(this.panel==='caravan'){
      const c=s.caravan,market=s.buildings.some(b=>b.kind==='market'&&!b.damaged),cargoReady=Object.entries(c.cargo).every(([k,v])=>s.resources[k as Resource]>=v!),room=s.capacity-RESOURCE_KEYS.reduce((n,k)=>n+s.resources[k],0);content=`<div class="caravan-illustration">${this.art('market')}${icon('caravan',60)}</div><div class="destination-label"><span>青岚小镇</span><i></i>${icon('caravan',24)}<i></i><span>溪谷集落</span></div><h3 class="center-title">${c.status==='traveling'?'带着小镇的心意，向远方出发':c.status==='returned'?'远方的礼物，已经到家':'去河的另一边，换一份惊喜'}</h3><p class="description centered">${c.status==='traveling'?'商队正在路上，继续照顾你的小镇吧。':'把面包与物资装上车，带回扩建仓库所需的建材。'}</p><div class="section-label">${c.status==='idle'?'准备装车':'旅途中的物资'}</div>${this.goods(c.cargo,c.status==='idle')}<div class="caravan-reward"><span>${icon('coin',30)}<b>${c.rewardCoins}</b><small>金币</small></span><span>${icon('materials',30)}<b>${c.rewardMaterials}</b><small>建材包</small></span><span>${icon('clock',28)}<b>${duration(c.status==='idle'?Math.max(60,120*(1-(Math.max(1,...s.buildings.filter(b=>b.kind==='market'&&!b.damaged).map(b=>b.level))-1)*.2)):c.duration)}</b><small>游戏时间</small></span></div>${c.status==='traveling'?`<div class="large-progress"><i style="width:${100*(1-(c.returnAt-s.gameTime)/c.duration)}%"></i></div><p class="countdown">${icon('clock',18)} ${duration(c.returnAt-s.gameTime)} 后归来</p>`:this.button('caravan','',`${icon(c.status==='returned'?'box':'caravan',20)} ${c.status==='returned'?(room<c.rewardMaterials?'先腾出仓位':'欢迎回家 · 领取物资'):!market?'需要可用的集市':!cargoReady?'备齐货物再出发':'装好货物，出发'}`,c.status==='idle'?(!market||!cargoReady):room<c.rewardMaterials,'game-button wide')}${c.status==='returned'&&room<c.rewardMaterials?`<p class="muted centered">商队带回 ${c.rewardMaterials} 份建材，还需腾出 ${Math.ceil(c.rewardMaterials-room)} 格仓位。</p>`:''}<p class="muted centered">已经走过 ${c.trips} 趟温暖的旅程</p>`;
    } else if(this.panel==='residents'){
      content=`<div class="residents-summary"><span class="happiness-face">${icon('smile',54)}</span><div><strong>${Math.round(s.happiness)}<small>%</small></strong><span>${s.happiness>=70?'这里是安心的家':'邻居们需要更多照顾'}</span></div></div><div class="people-count"><span>${icon('people',21)} 常住居民 <b>${s.population}</b></span><span>${icon('home',21)} 总床位 <b>${this.world.housingCapacity()}</b></span></div><div class="population-plan"><b>当前可住 ${Math.min(this.world.housingCapacity(),this.world.communityCapacity())} 人</b><span>社区人口名额 ${this.world.communityCapacity()} · 床位 ${this.world.housingCapacity()}</span><p>学校、诊所与剧院增加人口名额；住宅增加床位。幸福度达到 70%、备足三天口粮时，每个游戏日可迎来一位新邻居。</p>${this.button('open','build','建造住宅与市政设施',false,'secondary-button wide')}</div><div class="needs-list">${[['food','食物','bread'],['water','饮水','water'],['services','社区生活','home'],['environment','环境','leaf']].map(([key,label,ico])=>`<div class="need-row"><span>${icon(ico,20)} ${label}</span><div><i style="width:${s.needs[key as keyof typeof s.needs]}%"></i></div><b>${Math.round(s.needs[key as keyof typeof s.needs])}%</b></div>`).join('')}</div><div class="section-label">税收政策 <small>多一点关照，多一份长久</small></div><div class="tax-options">${TAX_RATES.map((rate,i)=>this.button('tax',String(i),`<b>${rate}%</b><span>${TAX_NAMES[i]}</span>`,false,`tax-option ${s.taxRate===i?'active':''}`)).join('')}</div><p class="muted">较高的税率会减少幸福度；食物、清水与花园让更多新邻居愿意留下。</p><div class="festival-card"><span>${icon('spark',28)}</span><div><b>今夜，办一场小镇庆典</b><small>短时提升幸福感 · 180 金币</small></div>${this.button('festival','','举办',s.coins<180,'small-button')}</div>`;
    } else if(this.panel==='quests'){
      content=`<div class="journey-tabs">${this.button('journey-tab','growth','田园成长',false,this.journeyTab==='growth'?'active':'')}${this.button('journey-tab','projects','建设收藏',false,this.journeyTab==='projects'?'active':'')}${this.button('journey-tab','quests','旧日手记',false,this.journeyTab==='quests'?'active':'')}</div>`+(this.journeyTab==='growth'?growthContent(this.world):this.journeyTab==='projects'?this.projectsContent():`<div class="journey-heading"><span>${icon('book',38)}</span><div><h3>把日子，过成喜欢的样子</h3><p>每一个小小的进步，都值得被记住。</p></div></div><div class="journey-list">${s.quests.map((q,i)=>`<article class="journey-item ${q.claimed?'completed':''}"><span class="journey-number">${q.claimed?icon('check',18):String(i+1).padStart(2,'0')}</span><div><h3>${esc(q.title)}</h3><p>${esc(q.description)}</p><div class="quest-progress"><i style="width:${Math.min(100,q.progress/q.target*100)}%"></i></div><span class="reward">${icon('coin',15)} ${q.rewardCoins} ${icon('star',13)} ${q.rewardPrestige} 声望</span></div>${this.button('quest',q.id,q.claimed?'已完成':q.progress>=q.target?'领取':`${Math.min(q.progress,q.target)}/${q.target}`,q.claimed||q.progress<q.target,'small-button quiet')}</article>`).join('')}</div>`);
    } else if(this.panel==='settings'){
      content=`<div class="setting-row"><div><b>小镇音效</b><small>轻快的点击、收获与奖励声音</small></div><button role="switch" aria-checked="${s.settings.sound}" aria-label="小镇音效" class="toggle ${s.settings.sound?'on':''}" data-action="sound"><i></i></button></div><div class="setting-row"><div><b>自然挑战</b><small>随季节出现火情、水患、旱情、雹灾与虫害，考验小镇的布局与防护</small></div><button role="switch" aria-checked="${s.settings.disasters}" aria-label="自然挑战" class="toggle ${s.settings.disasters?'on':''}" data-action="disasters"><i></i></button></div><div class="setting-row"><div><b>小镇副官</b><small>离线规则助手 · 自动收获、交单、调税</small></div><button role="switch" aria-checked="${s.settings.autoMayor}" aria-label="小镇副官" class="toggle ${s.settings.autoMayor?'on':''}" data-action="mayor"><i></i></button></div>${this.button('open','mayor',`${icon('book',17)} 看看副官的工作手记`,false,'text-button')}<div class="setting-row"><div><b>离线游玩</b><small>${esc(this.offlineStatus)}</small></div>${icon('leaf',21)}</div><div class="section-label">把今天好好保存 <small>${esc(this.saveLabel)}</small></div><div class="save-slots">${[1,2,3].map(i=>`<div class="save-slot"><span>${icon('save',20)} 手动存档 ${i}</span>${this.button('save',`slot-${i}`,'保存',false,'small-button')}${this.button('load',`slot-${i}`,'读取',false,'small-button quiet')}</div>`).join('')}</div><div class="button-row">${this.button('export','',`${icon('download',17)} 导出备份`,false,'secondary-button')}${this.button('import','',`${icon('upload',17)} 导入存档`,false,'secondary-button')}</div><p class="muted">每 30 秒自动保存。读取或导入会切换当前小镇，可先存入其他槽位。离开后，小镇最多为你积攒 8 小时的收获。存档留在这台设备上，可导出带走。</p><div class="settings-footer">DREAM TOWN <span>田园与成长 · 2.8</span></div>`;
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
    this.html(this.root.querySelector('#mini-map')!,valleyMap(this.world.state.buildings,point));
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
    return `<p class="panel-intro">沿着青岚河，在两岸慢慢建起喜欢的生活。</p><div class="large-valley-map">${valleyMap(s.buildings)}</div><div class="map-stats"><span><b>46 × 46</b> 河谷地格</span><span><b>2</b> 跨河桥梁</span><span><b>4</b> 规划分区</span></div><div class="district-cards">${DISTRICT_KEYS.map(id=>{const d=DISTRICTS[id],n=s.buildings.filter(b=>districtAt(b.x,b.y)===id).length;return `<button data-action="district" data-value="${id}" class="district-card"><span>${icon(d.icon,28)}</span><div><h3>${d.name}</h3><p>${d.subtitle}</p><small>${n} 座建筑 · 点击前往</small></div>${icon('arrow',18)}</button>`;}).join('')}</div>${this.button('district','overview',`${icon('expand',18)} 鸟瞰整座河谷`,false,'game-button wide')}<div class="section-label">让产业各得其所</div><p class="muted">一键把农田和牧场放到农业区，工坊放到工业区，矿场放到山麓。现有住宅和市政建筑留在原处；全部等级、库存、工人与生产进度保留。之后可在建筑详情中免费搬迁。</p>${this.button('arrange','',`${icon('move',17)} 按建议分区整理工坊`,false,'secondary-button wide')}${s.layoutUndo?.length?this.button('undo-arrange','',`${icon('back',16)} 还原整理前的位置`,false,'secondary-button wide'):''}<p class="muted">分区是规划建议，陆地可自由建设。河道、桥梁和陡峭山峰不能放置建筑。新地图兼容原有存档。</p>`;
  }
  private technologyContent(){
    const s=this.world.state;
    const node=(id:TechnologyId)=>{
      const t=TECHNOLOGIES[id],status=this.world.researchStatus(id);
      return `<article class="technology-node ${status.completed?'learned':status.available?'researchable':'research-locked'}" aria-label="${t.name}"><div class="technology-title"><span class="technology-seal">${icon(status.completed?'check':t.icon,25)}</span><div><small>${status.completed?'已经掌握':`LV. ${t.level} · ${t.requires.length?'进阶手艺':'起步蓝图'}`}</small><h3>${t.name}</h3></div></div><p>${t.description}</p>${t.unlocks.length?`<div class="blueprint-buildings">${t.unlocks.map(kind=>`<button data-action="${status.completed?'choose-build':'open'}" data-value="${status.completed?kind:'technology'}" ${!status.completed?'disabled':''} aria-label="建造${BUILDINGS[kind].name}">${this.art(kind)}<span>${BUILDINGS[kind].name}</span></button>`).join('')}</div>`:''}${status.completed?`<div class="learned-label">${icon('check',15)} ${t.unlocks.length?'蓝图已入册 · 点工坊开始建造':'已永久生效'}</div>`:`<div class="research-cost"><span>${icon('star',16)} ${t.prestige} 声望</span><span>${icon('coin',17)} ${t.coins}</span>${this.goods(t.items,true)}</div>${this.button('research',id,status.available?`${icon('research',17)} 研究这项手艺`:status.reason,!status.available,'game-button wide')}`}</article>`;
    };
    const chain=(keys:Resource[])=>`<div class="chain-ribbon" aria-label="生产链">${keys.map((k,i)=>`${i?icon('chevron',12):''}<button data-action="supply" data-value="${k}" title="查看${RESOURCES[k].name}来源">${icon(k,21)}<span>${RESOURCES[k].name}</span></button>`).join('')}</div>`;
    return `<div class="research-intro"><div><span class="eyebrow">写给明天的小镇</span><h3>好手艺，让梦想生根。</h3><p>选一条喜欢的路，慢慢成为小镇的拿手好戏。</p></div><div class="prestige-pouch">${icon('star',27)}<b>${s.prestige}</b><small>可用声望</small></div></div><div class="research-ledger"><span>已掌握 <b>${s.researched.length} / ${TECHNOLOGY_KEYS.length}</b> 项手艺</span>${this.button('open','quests','做旅程任务，积攒声望',false,'text-button')}</div><div class="research-branches"><section class="research-branch industry-branch"><h3>${icon('ore',20)} 山野炉火 <small>工业之路</small></h3>${chain(['ore','ingot','tools'])}${node('mining')}<div class="branch-thread">${icon('chevron',15)}</div>${node('metallurgy')}</section><section class="research-branch pastoral-branch"><h3>${icon('wool',20)} 麦穗与暖衣 <small>田园之路</small></h3>${chain(['feed','wool','cloth','clothing'])}${node('husbandry')}<div class="branch-thread">${icon('chevron',15)}</div>${node('tailoring')}</section></div><div class="town-research-title"><span>${icon('home',22)}</span><div><h3>把日子过得更从容</h3><p>用新手艺产出的物资，改善整座小镇。</p></div></div><div class="town-research">${(['efficiency','logistics','civics'] as TechnologyId[]).map(node).join('')}</div><p class="muted centered">研究消耗显示的声望、金币和材料。完成后永久保留，建造工坊仍需支付建造费用。</p>`;
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
