import type Phaser from 'phaser';
import { REGION_IDS, REGIONS, regionAt, type RegionId } from '../sim/regions';
import { PLAYABLE_SIZE, TILE_W, TILE_H, iso, terrainAt } from '../sim/terrain';

/** Cached land shading and signs make expansion permissions visible in the world. */
export class RegionLayer {
  private ground:Phaser.GameObjects.Graphics;
  private signs:Phaser.GameObjects.Text[]=[];
  private signature='';
  constructor(private scene:Phaser.Scene,private openMap:()=>void){this.ground=scene.add.graphics().setDepth(-850);}
  sync(open:RegionId[],level:number){
    const signature=REGION_IDS.filter(id=>open.includes(id)).join(',')+':'+Math.min(level,8);
    if(signature===this.signature)return;this.signature=signature;
    this.ground.clear();this.signs.forEach(s=>s.destroy());this.signs=[];
    for(let x=1;x<=PLAYABLE_SIZE;x++)for(let y=1;y<=PLAYABLE_SIZE;y++){
      const id=regionAt(x,y);if(!id||open.includes(id)||terrainAt(x,y)!=='land')continue;
      const p=iso(x,y),g=this.ground;
      g.fillStyle(0x536b56,.2);g.beginPath();g.moveTo(p.x,p.y-TILE_H/2);g.lineTo(p.x+TILE_W/2,p.y);g.lineTo(p.x,p.y+TILE_H/2);g.lineTo(p.x-TILE_W/2,p.y);g.closePath();g.fillPath();
    }
    for(const id of REGION_IDS){
      const r=REGIONS[id],p=iso(r.x,r.y),unlocked=open.includes(id);
      const text=this.scene.add.text(p.x,p.y-45,`${r.name}\n${unlocked?'已开放 · 自由建设':level>=r.level?'可免费开放 · 点击查看':`小镇 ${r.level} 级开放 · 点击查看`}`,{fontFamily:'sans-serif',fontSize:'19px',align:'center',color:'#fff3cf',backgroundColor:unlocked?'#59784a':'#596750',padding:{x:15,y:10}}).setOrigin(.5).setDepth(p.y+80).setAlpha(.9).setInteractive({useHandCursor:true});
      text.on('pointerdown',(_pointer:Phaser.Input.Pointer,_x:number,_y:number,event:Phaser.Types.Input.EventData)=>{event.stopPropagation();this.openMap();});this.signs.push(text);
    }
  }
}
