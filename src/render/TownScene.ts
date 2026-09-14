import { livestockFrame } from '../sim/livestock';
import { drawSoilDetails, drawHomeDetails } from './SoilDetails';
import { REGIONS, type RegionId } from '../sim/regions';
import { CROP_FRAMES, soilLevel, cropGrowthStage } from '../sim/farming';
import { TownAtmosphere } from './TownAtmosphere';
import { DisasterLayer } from './DisasterLayer';
import { CaravanCart } from './CaravanCart';
import { SeasonalProps } from './SeasonalProps';
import { MachineLayer } from './MachineLayer';
import { valleyCameraCenter } from './cameraBounds';
import { Residents } from './Residents';
import { RoadLayer } from './RoadLayer';
import { roadLine, roadQuote, ROAD_TYPES, type RoadKind, type Tile } from '../sim/roads';
import Phaser from 'phaser';
import { SimWorld, type Building, type BuildingKind } from '../sim/world';
import { BUILDINGS, EXPANSION_SPRITES, EXPANSION_FRAMES, INDUSTRY_KINDS, INDUSTRY_FRAMES, DECORATION_SPRITES, DECORATION_FRAMES } from '../sim/data';
import { GENERATED_ATLASES, atlasFrames, generatedSprite, housingLevelFrame } from '../sim/atlases';
import { drawFrameWidth } from './atlasSprite';
import { MAP_SIZE, TILE_W, TILE_H, iso, terrainAt, terrainReason, DISTRICTS, type District } from '../sim/terrain';
import { drawValley } from './ValleyTerrain';

export { TILE_W, TILE_H, iso } from '../sim/terrain';
/** Generated atlases the scene draws. Preloading and frame registration both read this. */
const SCENE_ATLASES = ['herd-growth','living-farm','homestead','crops-growing','disasters','street-decor','housing-levels','caravan','season-props','pets','machine-layers','industry2','citizens-actions','chapel'] as const;
/** On-screen widths for the two farm visuals, which are drawn from generated textures. */
const CROP_WIDTH = 130;
const FARM_WIDTH = 116;
const FARM_HEIGHT = 86;

const deiso = (x: number, y: number) => ({ x: Math.round(x / TILE_W + y / TILE_H), y: Math.round(y / TILE_H - x / TILE_W) });
type BuildingVisual = { sprite: Phaser.GameObjects.Image; badge: Phaser.GameObjects.Container; progress: Phaser.GameObjects.Graphics; ready: boolean; soil: Phaser.GameObjects.Graphics; soilLevel: number; homeStyle?: string; companion?: Phaser.GameObjects.Image };
export class TownScene extends Phaser.Scene {
  world: SimWorld;
  onChoose: (id: string) => void;
  onPlace: (kind: BuildingKind, x: number, y: number) => void;
  visuals = new Map<string, BuildingVisual>();
  buildKind: BuildingKind | null = null;
  selectedId: string | null = null;
  ready = false;
  private ground!: Phaser.GameObjects.Graphics;
  moveId:string|null=null;
  onMove:(id:string,x:number,y:number)=>void=()=>{};
  onViewport:(x:number,y:number,zoom:number)=>void=()=>{};
  private grid!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private ghost?: Phaser.GameObjects.Image;
  private residents!: Residents;
  private roads!: RoadLayer;
  roadMode:RoadKind|'remove'|null=null;
  private roadStart:Tile|null=null;
  onRoad:(a:Tile,b:Tile,kind:RoadKind|'remove')=>boolean=()=>false;
  onPlacementHint:(text:string)=>void=()=>{};
  onRoadHint:(text:string)=>void=()=>{};
  simulationSpeed=1;
  private pointerStart = { x: 0, y: 0, sx: 0, sy: 0 };
  private down = false;
  private moved = false;
  private candidate: string | null = null;
  private syncAt = 0;
  private pinchDistance = 0;
  private atmosphere!:TownAtmosphere;
  private disasterLayer!:DisasterLayer;
  private caravanCart!:CaravanCart;
  private seasonalProps!:SeasonalProps;
  private machineLayer!:MachineLayer;
  private running=new Set<string>();
  private progressSnapshot=new Map<string,number>();
  private lastSeason = '';

  constructor(world: SimWorld, choose: (id: string) => void, place: (kind: BuildingKind, x: number, y: number) => void) {
    super('Town'); this.world = world; this.onChoose = choose; this.onPlace = place;
  }
  preload() {
    this.load.image('crops','/assets/crops.png');
    this.load.image('expansion','/assets/town-expansion.png');
    this.load.image('decorations','/assets/decorations.png');
    this.load.image('citizens','/assets/citizens.png');
    this.load.image('scenery', '/assets/valley-scenery.png');
    this.load.image('industry', '/assets/industry.png');
    this.load.image('buildings', '/assets/buildings.png');
    // Every generated atlas is loaded and registered from its own catalog, so a new
    // atlas needs one entry here rather than a matching pair of edits.
    for(const atlas of SCENE_ATLASES) this.load.image(atlas, GENERATED_ATLASES[atlas].image);
    this.load.json('frames', '/assets/frames.json');
  }
  create() {
    const crops=this.textures.get('crops');
    Object.entries(CROP_FRAMES).forEach(([name,f])=>crops.add(name,0,f.x,f.y,f.w,f.h));
    const texture = this.textures.get('buildings');
    const frames = this.cache.json.get('frames').frames;
    Object.entries(frames).forEach(([name, f]) => { const r = f as { x: number; y: number; w: number; h: number }; texture.add(name === 'watchtower' ? 'firetower' : name, 0, r.x, r.y, r.w, r.h); });
    const industry = this.textures.get('industry');
    Object.entries(INDUSTRY_FRAMES).forEach(([name,r])=>industry.add(name,0,r.x,r.y,r.w,r.h));
    const expansion=this.textures.get('expansion');
    Object.entries(EXPANSION_FRAMES).forEach(([name,f])=>{
      if(!f.clip){expansion.add(name,0,f.x,f.y,f.w,f.h);return;}
      const isolated=this.textures.createCanvas(`expansion-${name}`,f.w,f.h)!;
      const ctx=isolated.context;ctx.beginPath();
      f.clip.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();
      ctx.drawImage(expansion.getSourceImage() as HTMLImageElement,f.x,f.y,f.w,f.h,0,0,f.w,f.h);
      isolated.add(name,0,0,0,f.w,f.h);isolated.refresh();
    });
    const decor=this.textures.get('decorations');
    Object.entries(DECORATION_FRAMES).forEach(([name,f])=>decor.add(name,0,f.x,f.y,f.w,f.h));
    // Every generated atlas registers its frames from the same catalog the asset
    // preview page reads, so a sprite's location is never restated in source.
    for(const atlas of SCENE_ATLASES){
      const texture=this.textures.get(atlas);
      Object.entries(atlasFrames(atlas)).forEach(([name,f])=>texture.add(name,0,f.x,f.y,f.w,f.h));
    }
    this.disasterLayer=new DisasterLayer(this);
    this.caravanCart=new CaravanCart(this);
    this.seasonalProps=new SeasonalProps(this);
    this.machineLayer=new MachineLayer(this);
    this.ground=drawValley(this);
    this.atmosphere=new TownAtmosphere(this);
    this.cameras.main.setBackgroundColor('#98a96b');
    // Phaser anchors oversized viewports to an edge; the valley uses centered bounds instead.
    this.cameras.main.removeBounds();
    this.makeFarmTextures();
    this.grid = this.add.graphics().setDepth(0).setVisible(false);
    this.highlight = this.add.graphics().setDepth(1);
    this.residents = new Residents(this);this.roads=new RoadLayer(this);
    for(let x=1;x<MAP_SIZE-1;x++)for(let y=1;y<MAP_SIZE-1;y++){
      const p=iso(x,y),valid=terrainAt(x,y)==='land';this.diamond(this.grid,p.x,p.y,valid?0xffffff:0xc36c53,valid?.025:.10,valid?0xf7f0c9:0xe6a28a,valid?.22:.3);
    }
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      this.down = true; this.moved = false; this.pointerStart = {x:p.x,y:p.y,sx:this.cameras.main.scrollX,sy:this.cameras.main.scrollY};
      this.candidate = objects[0]?.getData('buildingId') || null;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const a=this.input.pointer1,b=this.input.pointer2;
      if(a.isDown && b.isDown) {
        const d=Phaser.Math.Distance.Between(a.x,a.y,b.x,b.y);
        if(this.pinchDistance) this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom*d/this.pinchDistance,this.minimumZoom(),1.8));
        this.pinchDistance=d;this.moved=true;return;
      }
      this.pinchDistance=0;
      if(this.down && p.isDown) {
        if(Phaser.Math.Distance.Between(p.x,p.y,this.pointerStart.x,this.pointerStart.y)>6) this.moved=true;
        if(this.moved){this.cameras.main.scrollX=this.pointerStart.sx-(p.x-this.pointerStart.x)/this.cameras.main.zoom;this.cameras.main.scrollY=this.pointerStart.sy-(p.y-this.pointerStart.y)/this.cameras.main.zoom;}
      }
      if(this.roadMode)this.previewRoad(p);
      else if(this.buildKind) this.updateGhost(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if(!this.moved && this.down) {
        if(this.roadMode){
          const point=this.cameras.main.getWorldPoint(p.x,p.y),tile=deiso(point.x,point.y);
          if(!this.roadStart){if((terrainAt(tile.x,tile.y)==='land'||terrainAt(tile.x,tile.y)==='bridge')&&!this.world.state.buildings.some(b=>b.x===tile.x&&b.y===tile.y)){this.roadStart=tile;this.previewRoad(p);}else this.onRoadHint('请选择空地或已有路面作为起点');}
          else if(this.onRoad(this.roadStart,tile,this.roadMode)){this.roadStart=null;this.highlight.clear();this.onRoadHint('继续点起点和终点铺设 · 同一格点两次可单格操作');}
        }
        else if(this.buildKind){const point=this.cameras.main.getWorldPoint(p.x,p.y), tile=deiso(point.x,point.y);if(this.moveId)this.onMove(this.moveId,tile.x,tile.y);else this.onPlace(this.buildKind,tile.x,tile.y);}
        else if(this.candidate) this.onChoose(this.candidate);
      }
      this.down=false;this.pinchDistance=0;
    });
    this.input.on('wheel', (_p:unknown,_o:unknown,_dx:number,dy:number)=>this.zoomBy(dy>0?-.08:.08));
    this.scale.on('resize',()=>this.resetCamera());
    this.resetCamera();this.syncBuildings();this.ready=true;
    this.cameras.main.fadeIn(700,229,232,193);
  }
  private diamond(g:Phaser.GameObjects.Graphics,x:number,y:number,fill:number,alpha=1,line=fill,lineAlpha=1,scale=1) {
    const w=TILE_W/2*scale,h=TILE_H/2*scale;
    g.fillStyle(fill,alpha);g.lineStyle(1.5,line,lineAlpha);g.beginPath();g.moveTo(x,y-h);g.lineTo(x+w,y);g.lineTo(x,y+h);g.lineTo(x-w,y);g.closePath();g.fillPath();g.strokePath();
  }
  private makeFarmTextures(){
    for(let stage=0;stage<3;stage++) {
      const g=this.make.graphics({x:0,y:0});
      const points=[new Phaser.Math.Vector2(58,25),new Phaser.Math.Vector2(110,51),new Phaser.Math.Vector2(58,77),new Phaser.Math.Vector2(6,51)];
      g.fillStyle(0x6e522f);g.fillPoints(points,true);g.lineStyle(3,0xbaa175);g.strokePoints(points,true);
      for(let x=0;x<5;x++) for(let y=0;y<5;y++) {
        const px=58+(x-y)*9,py=33+(x+y)*4.5;
        g.lineStyle(2,0x977044,.8);g.lineBetween(px-4,py,px+4,py+3);
        if(stage){const h=stage===2?14:7;g.lineStyle(1.6,stage===2?0xc5a344:0x71893e);g.lineBetween(px,py,px,py-h);g.fillStyle(stage===2?0xebcc67:0xa4bd60);g.fillEllipse(px-2,py-h+4,4,7);g.fillEllipse(px+2,py-h+1,4,7);}
      }
      g.generateTexture(`farm${stage}`,116,86);g.destroy();
    }
  }
  /** Which atlas and frame draw this building at this level. */
  private spriteSource(kind:BuildingKind,level:number):{texture:string;frame?:string} {
    if(kind==='school'||kind==='firestation')return{texture:`expansion-${kind}`};
    const housing=housingLevelFrame(kind,level);if(housing)return{texture:housing.atlas,frame:housing.frame};
    const generated=generatedSprite(kind);if(generated)return{texture:generated.atlas,frame:generated.frame};
    if(EXPANSION_SPRITES.some(k=>k===kind))return{texture:'expansion'};
    if(DECORATION_SPRITES.some(k=>k===kind))return{texture:'decorations'};
    if(INDUSTRY_KINDS.includes(kind))return{texture:'industry'};
    return{texture:'buildings'};
  }
  private spriteWidth(kind:BuildingKind):number {
    if(EXPANSION_SPRITES.some(k=>k===kind))return kind==='watertower'?124:kind==='apartment'?156:160;
    if(DECORATION_SPRITES.some(k=>k===kind))return kind==='bench'?108:kind==='fountain'?108:kind==='gazebo'?126:kind==='flowerarch'?120:170;
    if(generatedSprite(kind))return kind==='willow'?150:kind==='parasol'?120:kind==='railing'?150:kind==='chapel'?150:130;
    if(housingLevelFrame(kind,1))return 150;
    return kind==='townhall'?177:kind==='well'?100:kind==='garden'?139:151;
  }
  private syncBuildings(){
    const current=new Set(this.world.state.buildings.map(b=>b.id));
    this.visuals.forEach((v,id)=>{if(!current.has(id)){v.sprite.destroy();v.badge.destroy();v.progress.destroy();v.soil.destroy();v.companion?.destroy();this.visuals.delete(id);}});
    this.running.clear();
    for(const id of this.progressSnapshot.keys())if(!current.has(id))this.progressSnapshot.delete(id);
    for(const b of this.world.state.buildings){
      if(!b.paused&&!b.ready&&!b.damaged&&b.progress!==(this.progressSnapshot.get(b.id)??b.progress))this.running.add(b.id);
      this.progressSnapshot.set(b.id,b.progress);
      let v=this.visuals.get(b.id);const p=iso(b.x,b.y);
      if(!v){
        const source=this.spriteSource(b.kind,b.level);
        const sprite=b.kind==='farm'?this.add.image(p.x,p.y,'farm0').setOrigin(.5,.65):this.add.image(p.x,p.y,source.texture,source.frame??b.kind).setOrigin(.5,.86);
        if(b.kind!=='farm')drawFrameWidth(sprite,source.texture,source.frame??b.kind,this.spriteWidth(b.kind));
        sprite.setDepth(p.y+5).setInteractive({useHandCursor:true,pixelPerfect:true,alphaTolerance:50}).setData('buildingId',b.id);
        sprite.on('pointerover',()=>{if(!this.down&&!this.buildKind)sprite.setTint(0xfff0c6);});sprite.on('pointerout',()=>sprite.clearTint());
        const bg=this.add.graphics().fillStyle(0x3a553b,.22).fillRoundedRect(-21,-18,42,39,12).fillStyle(0xfff7df).fillRoundedRect(-21,-22,42,38,12).lineStyle(2,0xfffef4).strokeRoundedRect(-21,-22,42,38,12);
        bg.fillStyle(0xfff7df).fillTriangle(-6,15,6,15,0,22);
        const text=this.add.text(0,-3,'✓',{fontSize:'24px',fontStyle:'bold',color:'#658844'}).setOrigin(.5);
        const badge=this.add.container(p.x,p.y-(b.kind==='farm'?sprite.displayHeight*.65:sprite.displayHeight*.7),[bg,text]).setDepth(p.y+220).setSize(44,44).setInteractive({useHandCursor:true}).setData('buildingId',b.id);
        const progress=this.add.graphics().setDepth(p.y+200);
        const soil=this.add.graphics();
        v={sprite,badge,progress,ready:false,soil,soilLevel:0};this.visuals.set(b.id,v);
        this.tweens.add({targets:sprite,alpha:{from:0,to:1},duration:300});
      }
      // Cottage and farmhouse art is per-level, so an upgrade swaps the frame in place.
      if(b.kind!=='farm'){
        const source=this.spriteSource(b.kind,b.level);
        const current=v.sprite.texture.key;
        if(source.frame&&(current!==source.texture||v.sprite.frame.name!==source.frame)){
          drawFrameWidth(v.sprite,source.texture,source.frame,this.spriteWidth(b.kind));
        }
      }
      v.sprite.setPosition(p.x,p.y).setDepth(p.y+5);v.badge.setPosition(p.x,p.y-(b.kind==='farm'?v.sprite.displayHeight*.65:v.sprite.displayHeight*.7)).setDepth(p.y+220);v.progress.setDepth(p.y+200);
      if(b.kind==='farm'){
        const level=soilLevel(b.tended).level;
        if(v.soilLevel!==level){drawSoilDetails(v.soil,level);v.soilLevel=level;}
        v.soil.setPosition(p.x,p.y).setDepth(p.y+6).setAlpha(b.id===this.moveId?.28:b.paused?.65:1);
        const crop=b.crop??'wheat',f=CROP_FRAMES[crop],stage=cropGrowthStage(b.progress,b.ready,b.fallow);
        if(stage==='ready'||stage==='ripening'){drawFrameWidth(v.sprite,'crops',crop,CROP_WIDTH);v.sprite.setOrigin(.5,f.anchor);if(!b.ready)v.sprite.setTint(0xc3d995);else v.sprite.clearTint();}
        else if(stage==='growing'||stage==='sprouting'&&(crop==='apple'||crop==='grape')){
          const growing=GENERATED_ATLASES['crops-growing'].frames[crop];
          drawFrameWidth(v.sprite,'crops-growing',crop,CROP_WIDTH);v.sprite.setOrigin(.5,growing.anchor).clearTint();
        }
        // farm0 is a single-frame texture generated at runtime, so sizing it
        // once is correct: there is no other frame whose dimensions could disagree.
        else{v.sprite.setTexture('farm0').setOrigin(.5,.65).setDisplaySize(FARM_WIDTH,FARM_HEIGHT);v.sprite.setTint(soilLevel(b.tended).level>2?0xf6e6ae:0xffffff);}
      }
      if(BUILDINGS[b.kind].housing){
        const style=b.homeStyle??'original';
        if(v.homeStyle!==style){drawHomeDetails(v.soil,style);v.homeStyle=style;}
        v.soil.setPosition(p.x,p.y).setDepth(p.y+6).setVisible(!b.damaged).setAlpha(b.id===this.moveId?.28:1);
      }
      if(b.kind==='orchardhouse'||livestockFrame(b)){
        const orchard=b.kind==='orchardhouse';
        const frame=orchard?(b.ready||b.progress>=.72?'tree-fruit':b.progress>=.3?'tree-blossom':'tree-leaves'):livestockFrame(b)!;
        const herd=b.kind==='pasture'||b.kind==='cowbarn',atlas=herd?'herd-growth':'living-farm';
        if(!v.companion)v.companion=this.add.image(p.x,p.y,atlas,frame).setOrigin(.5,.93);
        drawFrameWidth(v.companion,atlas,frame,herd?atlasFrames('herd-growth')[frame].w*.12:orchard?78:48);
        v.companion.setPosition(p.x+(orchard?30:16),p.y+17).setDepth(p.y+7).setVisible(!b.damaged).setAlpha(b.id===this.moveId?.28:b.paused?.65:1);
      }
      v.badge.setVisible(b.ready||!!b.damaged);const text=v.badge.list[1] as Phaser.GameObjects.Text;
      text.setText(b.damaged?'!':'✓').setColor(b.damaged?'#bc6643':'#658844');
      if(b.ready&&!v.ready){this.tweens.add({targets:v.badge,scale:{from:.6,to:1},duration:420,ease:'Back.Out'});}
      v.ready=b.ready;v.progress.clear();
      if(BUILDINGS[b.kind].cycle&&!b.ready){v.progress.fillStyle(0x34513e,.35).fillRoundedRect(p.x-23,p.y+12,46,5,2);v.progress.fillStyle(b.paused?0xbba773:0xf5e7a1).fillRoundedRect(p.x-23,p.y+12,Math.max(1,46*b.progress),5,2);}
      v.sprite.setAlpha(b.id===this.moveId?.28:b.paused?.65:1);
    }
    this.roads.sync(this.world.state.roads??[]);this.residents.sync(this.world);
    this.drawSelection();
  }
  private drawSelection(){
    if(this.roadMode)return;this.highlight.clear();const b=this.world.state.buildings.find(b=>b.id===this.selectedId);if(!b||this.buildKind)return;
    const p=iso(b.x,b.y);this.diamond(this.highlight,p.x,p.y,0xf3edb3,.22,0xfffbd9,1,1.05);
    const def=BUILDINGS[b.kind],radius=def.waterRadius??def.fireRadius;
    if(radius&&!b.damaged){const diameter=Math.SQRT2*(radius+b.level-1);this.highlight.lineStyle(2,def.waterRadius?0xb4e9f5:0xffc49a,.6).strokeEllipse(p.x,p.y,TILE_W*diameter,TILE_H*diameter);}
  }
  private updateGhost(p:Phaser.Input.Pointer){
    if(!this.buildKind||!this.ghost)return;const pt=this.cameras.main.getWorldPoint(p.x,p.y),t=deiso(pt.x,pt.y),a=iso(t.x,t.y);
    const issue=this.world.placementIssue(t.x,t.y,this.moveId??undefined),valid=!issue;
    this.onPlacementHint(issue?.message??`可放置 · 地块 ${t.x}, ${t.y} · 点击确认${this.moveId?'搬迁':'建造'}`);
    this.ghost.setPosition(a.x,a.y).setTint(valid?0xc2e6a0:0xe88768).setDepth(a.y+300);this.highlight.clear();this.diamond(this.highlight,a.x,a.y,valid?0xeff6b5:0xff9775,.4,0xffffff,1);
  }
  private paintPlacementGrid(){
    this.grid.clear();
    for(let x=1;x<MAP_SIZE-1;x++)for(let y=1;y<MAP_SIZE-1;y++){
      const p=iso(x,y),blocked=!!this.world.placementIssue(x,y,this.moveId??undefined);
      this.diamond(this.grid,p.x,p.y,blocked?0xc9765c:0xffffff,blocked?.15:.025,blocked?0xe0a08c:0xf7f0c9,blocked?.38:.22);
    }
  }
  setBuildMode(kind:BuildingKind|null){
    this.roadMode=null;this.roadStart=null;this.moveId=null;this.buildKind=kind;if(!this.ready)return;this.grid.setVisible(!!kind);this.ghost?.destroy();this.ghost=undefined;this.highlight.clear();
    if(kind){this.paintPlacementGrid();const source=this.spriteSource(kind,1);this.ghost=kind==='farm'?this.add.image(0,0,'farm2').setOrigin(.5,.65):this.add.image(0,0,source.texture,source.frame??kind).setOrigin(.5,.86);if(kind!=='farm')drawFrameWidth(this.ghost,source.texture,source.frame??kind,this.spriteWidth(kind));this.ghost.setAlpha(.6);this.updateGhost(this.input.activePointer);}else this.drawSelection();
  }
  setRoadMode(kind:RoadKind|'remove'|null){this.setBuildMode(null);this.roadMode=kind;if(!this.ready)return;this.grid.setVisible(!!kind);this.highlight.clear();}
  private previewRoad(pointer:Phaser.Input.Pointer){
    if(!this.roadMode)return;
    const p=this.cameras.main.getWorldPoint(pointer.x,pointer.y),end=deiso(p.x,p.y),tiles=roadLine(this.roadStart??end,end);
    const valid=tiles.length>0&&tiles.every(t=>(terrainAt(t.x,t.y)==='land'||terrainAt(t.x,t.y)==='bridge')&&!this.world.state.buildings.some(b=>b.x===t.x&&b.y===t.y));
    this.highlight.clear();
    for(const t of tiles){const p=iso(t.x,t.y);this.diamond(this.highlight,p.x,p.y,valid?0xe8d9a0:0xdd7757,.55,valid?0xffedb7:0xffb096,1,.94);}
    const quote=roadQuote(this.world.state.roads??[],tiles.filter(t=>terrainAt(t.x,t.y)==='land'),this.roadMode);
    this.onRoadHint(!valid?'路线有建筑、河道或山峰，请换一个终点':this.roadStart?`${quote.changed} 格 · ${quote.coins} 金币 / ${quote.stone} 石料 · 点击终点确认`:'点起点，再点终点 · 同一格点两次可单格操作');
  }
  setMoveMode(id:string){const b=this.world.state.buildings.find(b=>b.id===id);if(!b)return;this.setBuildMode(b.kind);this.moveId=id;this.paintPlacementGrid();this.syncBuildings();this.updateGhost(this.input.activePointer);}
  focusDistrict(key:District|RegionId|'overview'){
    if(!this.ready)return;
    if(key==='overview'){this.cameras.main.setZoom(Math.min(this.scale.width/(MAP_SIZE*TILE_W+132),(this.scale.height-160)/(MAP_SIZE*TILE_H+116)));this.cameras.main.centerOn(0,MAP_SIZE*TILE_H/2);return;}
    const d=key in REGIONS?REGIONS[key as RegionId]:DISTRICTS[key as District],p=iso(d.x,d.y);this.cameras.main.setZoom(this.scale.width<650?.66:.85);if(this.reducedMotion())this.cameras.main.centerOn(p.x,p.y-45);else this.cameras.main.pan(p.x,p.y-45,650,'Sine.easeInOut');
  }
  select(id:string|null){this.selectedId=id;if(this.ready)this.drawSelection();}
  focusBuilding(id:string){const b=this.world.state.buildings.find(b=>b.id===id);if(b&&this.ready){const p=iso(b.x,b.y);if(this.reducedMotion())this.cameras.main.centerOn(p.x+80,p.y-10);else this.cameras.main.pan(p.x+80,p.y-10,600,'Sine.easeInOut');this.select(id);}}
  private minimumZoom(){return Math.min(.22,Math.max(.06,Math.min(this.scale.width/(MAP_SIZE*TILE_W+132),(this.scale.height-160)/(MAP_SIZE*TILE_H+116))));}
  zoomBy(delta:number){if(this.ready)this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom+delta,this.minimumZoom(),1.8));}
  resetCamera(){const w=this.scale.width;this.cameras.main.setZoom(w<650?.62:Math.min(.85,w/1550));const p=iso(12,12);this.cameras.main.centerOn(p.x,p.y-70);}
  reducedMotion(){return this.world.state.settings.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
  screenPoint(id?:string){
    if(!this.ready)return undefined;const b=this.world.state.buildings.find(b=>b.id===id);if(!b)return undefined;
    const p=iso(b.x,b.y),c=this.cameras.main;
    return {x:c.width/2+(p.x-c.midPoint.x)*c.zoom,y:c.height/2+(p.y-65-c.midPoint.y)*c.zoom};
  }
  feedback(id:string|undefined,message:string,good=true,effect=''){
    if(!this.ready)return;this.syncBuildings();
    const b=this.world.state.buildings.find(b=>b.id===id);const p=b?iso(b.x,b.y):{x:this.cameras.main.midPoint.x,y:this.cameras.main.midPoint.y};
    const reduced=this.reducedMotion();
    // Long results are already readable in the HUD toast.
    if(b&&message.length<45){
      const text=this.add.text(p.x,p.y-95,message,{fontFamily:'"PingFang SC", sans-serif',fontSize:'18px',fontStyle:'bold',color:good?'#fff8cb':'#ffccb0',stroke:'#385039',strokeThickness:4}).setOrigin(.5).setDepth(10000);
      this.tweens.add({targets:text,y:text.y-(reduced?0:45),alpha:0,duration:reduced?700:1200,ease:'Cubic.Out',onComplete:()=>text.destroy()});
    }
    if(reduced||!good)return;
    const visual=id?this.visuals.get(id):undefined;
    if(visual&&['build','upgrade','move','harvest'].includes(effect)){
      const sprite=visual.sprite;this.tweens.killTweensOf(sprite);sprite.setAlpha(1);
      const scale=this.spriteWidth(b!.kind)/sprite.frame.width;
      if(b!.kind!=='farm')sprite.setScale(scale);
      const sx=sprite.scaleX,sy=sprite.scaleY;
      sprite.setScale(sx*(effect==='build'?.8:1.04),sy*(effect==='build'?.8:.95));
      this.tweens.add({targets:sprite,scaleX:sx,scaleY:sy,duration:effect==='build'?520:320,ease:'Back.Out'});
    }
    if(['build','upgrade','project','festival','research'].includes(effect)){
      const count=effect==='project'||effect==='festival'?22:12;
      for(let i=0;i<count;i++){
        const angle=i/count*Math.PI*2,spark=this.add.circle(p.x,p.y-30,2+i%3,[0xffe598,0xf8efca,0xc6e09c][i%3]).setDepth(9999);
        this.tweens.add({targets:spark,x:p.x+Math.cos(angle)*(55+i%4*13),y:p.y-45+Math.sin(angle)*35-35,alpha:0,duration:650+i%4*90,ease:'Cubic.Out',onComplete:()=>spark.destroy()});
      }
    }
  }
  update(time:number){
    if(!this.ready)return;
    const camera=this.cameras.main,center=valleyCameraCenter(camera.scrollX+camera.width/2,camera.scrollY+camera.height/2,camera.width,camera.height,camera.zoom);
    camera.scrollX=center.x-camera.width/2;camera.scrollY=center.y-camera.height/2;
    if(time-this.syncAt>200){this.syncBuildings();this.syncAt=time;this.onViewport(this.cameras.main.midPoint.x,this.cameras.main.midPoint.y,this.cameras.main.zoom);}
    if(this.buildKind)this.updateGhost(this.input.activePointer);
    const reduced=this.reducedMotion();
    this.residents.update(time,this.game.loop.delta/1000*this.simulationSpeed,reduced);
    this.disasterLayer.sync(this.world.state.buildings,time,reduced);
    this.caravanCart.sync(this.world,time,reduced);
    this.seasonalProps.sync(this.world);
    this.machineLayer.sync(this.world.state.buildings,this.running,this.game.loop.delta*(this.simulationSpeed>0?1:0),reduced);
    this.atmosphere.update(this.game.loop.delta*(this.simulationSpeed>0?1:0),this.world.state.buildings,this.running,this.world.state.festivalUntil>this.world.state.gameTime,reduced);
    if(!reduced&&this.simulationSpeed>0)this.visuals.forEach((v,id)=>{if(v.ready){const b=this.world.state.buildings.find(b=>b.id===id)!;const p=iso(b.x,b.y);v.badge.y=p.y-(b.kind==='farm'?v.sprite.displayHeight*.65:v.sprite.displayHeight*.7)+Math.sin(time/430)*3;}});
    for(const b of this.world.state.buildings){
      const companion=this.visuals.get(b.id)?.companion;
      if(!companion)continue;
      const active=!reduced&&this.simulationSpeed>0&&!b.paused&&!b.damaged;
      // Subtle foliage sway and a slow peck, always reset when motion is disabled.
      companion.setAngle(active?Math.sin(time/(b.kind==='orchardhouse'?1400:650)+b.x)*.9:0);
    }
    if(this.lastSeason!==this.world.state.season){this.lastSeason=this.world.state.season;this.ground.setAlpha(this.lastSeason==='winter'?.78:1);}
  }
}
