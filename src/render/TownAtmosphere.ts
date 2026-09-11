import Phaser from 'phaser';
import { iso } from '../sim/terrain';
import { BUILDINGS } from '../sim/data';
import type { Building } from '../sim/world';

/** Reused graphics avoid allocating emitters or particles for every factory. */
export class TownAtmosphere {
  private ground:Phaser.GameObjects.Graphics;
  private air:Phaser.GameObjects.Graphics;
  private clock=0;
  constructor(private scene:Phaser.Scene){
    this.ground=scene.add.graphics().setDepth(3);
    this.air=scene.add.graphics().setDepth(9990);
  }
  update(delta:number,buildings:Building[],running:Set<string>,festival:boolean,reduced:boolean){
    this.ground.clear();this.air.clear();if(reduced||delta<=0)return;
    this.clock+=Math.min(delta,100)/1000;
    const view=this.scene.cameras.main.worldView,t=this.clock;let visible=0;
    for(const b of buildings){
      const p=iso(b.x,b.y);if(!Phaser.Geom.Rectangle.Contains(view,p.x,p.y)||b.damaged)continue;
      const flow=running.has(b.id),water=['well','watertower','fountain'].includes(b.kind)||flow&&['fishery','fishpond'].includes(b.kind);
      if(!flow&&!water)continue;if(visible++>=30)break;
      const phase=t*.65+(b.x*7+b.y*3)%13;
      if(water){
        for(let i=0;i<2;i++){const f=(phase*.7+i*.5)%1;this.ground.lineStyle(1.4,0xe3ffff,(1-f)*.5).strokeEllipse(p.x,p.y+5,18+f*67,7+f*23);}
      }else if(flow){
        this.ground.lineStyle(1.5,0xf4e7ae,.15+Math.sin(phase*2)*.08).strokeEllipse(p.x,p.y+4,63,25);
      }
      if(flow&&['kiln','smelter','brickworks','bakery'].includes(b.kind)){
        for(let i=0;i<3;i++){const f=(phase*.45+i/3)%1;this.air.fillStyle(0xf1eddf,(1-f)*.23).fillCircle(p.x+25+Math.sin(f*3+phase)*9,p.y-70-f*50,3+f*9);}
      }else if(flow&&BUILDINGS[b.kind].input){
        for(let i=0;i<2;i++){const f=(phase+i*.5)%1;this.air.fillStyle(0xffdc7d,Math.sin(f*Math.PI)*.7).fillCircle(p.x-17+i*27,p.y-25-f*20,1.5);}
      }
    }
    if(festival){
      const hall=buildings.find(b=>b.kind==='townhall');if(hall){const p=iso(hall.x,hall.y);for(let i=0;i<20;i++){const f=(t*.18+i*.071)%1;this.air.fillStyle([0xf4bf67,0xf1db9c,0xe69491,0xc0d69d][i%4],Math.sin(f*Math.PI)*.85).fillRect(p.x-110+(i*41)%220+Math.sin(t+i)*9,p.y-200+f*180,3,6);}}
    }
  }
}
