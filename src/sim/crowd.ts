import { TownNavigation } from './navigation.ts';
import { tileKey, type Road, type Tile } from './roads.ts';
import { PETS, petLeash, type PetState } from './pets.ts';
export interface Walker { x:number;y:number;route:Tile[];step:number;wait:number;style:number;headingX:number;headingY:number;walking:boolean;relocated:boolean }
/** A pet trails one resident, re-pathing to that resident's tile instead of wandering. */
export interface PetWalker extends Walker { kind:PetState['kind']; follows:number }
/** Decorative citizens share the same blocked cells as construction. No straight-line shortcuts. */
export class TownCrowd {
  walkers:Walker[]=[];
  pets:PetWalker[]=[];
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
  /** Keeps one walker per adopted pet, each leashed to a resident. */
  syncPets(pets:readonly PetState[]){
    while(this.pets.length>pets.length)this.pets.pop();
    while(this.pets.length<pets.length){
      const pet=pets[this.pets.length]!,spot=this.destinations.length?this.destinations[this.pets.length%this.destinations.length]:{x:1,y:1};
      this.pets.push({...spot,route:[],step:0,wait:0,style:this.pets.length%2,headingX:1,headingY:0,walking:false,relocated:false,kind:pet.kind,follows:0});
    }
    for(const [i,pet] of this.pets.entries()) pet.follows=petLeash(pets[i]!,this.walkers.length);
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
    // Pets re-path toward the resident they follow, so they always trail someone.
    for(const pet of this.pets){
      pet.walking=false;
      const target=this.walkers[pet.follows];
      if(!target)continue;
      const here={x:Math.round(pet.x),y:Math.round(pet.y)},goal={x:Math.round(target.x),y:Math.round(target.y)};
      if(Math.abs(here.x-goal.x)+Math.abs(here.y-goal.y)<=PETS[pet.kind].leash){
        pet.route=[];pet.wait=0;continue;
      }
      if(!pet.route.length){
        const route=this.navigation.path(here,goal);
        if(route.length>1){pet.route=route;pet.step=1;}
        else{pet.wait=1;continue;}
      }
      let remaining=seconds*PETS[pet.kind].pace;
      while(remaining>0&&pet.step<pet.route.length){
        const next=pet.route[pet.step];
        if(!this.navigation.canWalk(next)){pet.route=[];break;}
        const dx=next.x-pet.x,dy=next.y-pet.y,distance=Math.abs(dx)+Math.abs(dy);
        pet.headingX=Math.sign(dx);pet.headingY=Math.sign(dy);pet.walking=true;
        if(remaining>=distance){pet.x=next.x;pet.y=next.y;remaining-=distance;pet.step++;}
        else{pet.x+=dx/distance*remaining;pet.y+=dy/distance*remaining;remaining=0;}
      }
      if(pet.step>=pet.route.length)pet.route=[];
    }
  }
}
