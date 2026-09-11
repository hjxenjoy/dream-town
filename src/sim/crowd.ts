import { TownNavigation } from './navigation.ts';
import { tileKey, type Road, type Tile } from './roads.ts';
export interface Walker { x:number;y:number;route:Tile[];step:number;wait:number;style:number;headingX:number;headingY:number;walking:boolean;relocated:boolean }
/** Decorative citizens share the same blocked cells as construction. No straight-line shortcuts. */
export class TownCrowd {
  walkers:Walker[]=[];
  navigation=new TownNavigation([]);
  private signature='';private destinations:Tile[]=[];private trip=0;
  sync(buildings:Tile[],roads:Road[],population:number){
    const signature=buildings.map(tileKey).join('|')+';'+roads.map(tileKey).join('|');
    if(signature!==this.signature){
      this.signature=signature;this.navigation=new TownNavigation(buildings,roads);
      this.destinations=buildings.flatMap(b=>this.navigation.entrances(b));
      for(const w of this.walkers){
        const current={x:Math.round(w.x),y:Math.round(w.y)};
        if(!this.navigation.canWalk(current)||w.route.slice(w.step).some(t=>!this.navigation.canWalk(t))){
          const p=this.navigation.nearest(w);w.route=[];w.step=0;w.wait=.1;
          if(p){w.relocated=true;w.x=p.x;w.y=p.y;}
        }
      }
    }
    const count=Math.min(36,population);
    while(this.walkers.length>count)this.walkers.pop();
    while(this.walkers.length<count&&this.destinations.length){
      const i=this.walkers.length,p=this.destinations[(i*7)%this.destinations.length];
      this.walkers.push({...p,route:[],step:0,wait:i*.17,style:i%6,headingX:1,headingY:0,walking:false,relocated:false});
    }
  }
  tick(seconds:number){
    if(seconds<=0)return;
    for(let i=0;i<this.walkers.length;i++){
      const w=this.walkers[i];w.walking=false;
      if(w.wait>0){w.wait-=seconds;continue;}
      if(!w.route.length){
        const start={x:Math.round(w.x),y:Math.round(w.y)};
        for(let n=0;n<6;n++){
          const goal=this.destinations[(this.trip++*13+i*7)%this.destinations.length];if(!goal)break;
          const route=this.navigation.path(start,goal);if(route.length>1){w.route=route;w.step=1;break;}
        }
        if(!w.route.length){w.wait=2;continue;}
      }
      let remaining=seconds*(.57+(i%4)*.045);
      while(remaining>0&&w.step<w.route.length){
        const target=w.route[w.step];
        if(!this.navigation.canWalk(target)){w.route=[];break;}
        const dx=target.x-w.x,dy=target.y-w.y,distance=Math.abs(dx)+Math.abs(dy);
        w.headingX=Math.sign(dx);w.headingY=Math.sign(dy);w.walking=true;
        if(remaining>=distance){w.x=target.x;w.y=target.y;remaining-=distance;w.step++;}
        else{w.x+=dx/distance*remaining;w.y+=dy/distance*remaining;remaining=0;}
      }
      if(w.step>=w.route.length){w.route=[];w.wait=1.5+(i%5)*.6;}
    }
  }
}
