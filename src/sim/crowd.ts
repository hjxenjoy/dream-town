import { TownNavigation } from './navigation.ts';
import { tileKey, type Road, type Tile } from './roads.ts';
import { PETS, petLeash, type PetState } from './pets.ts';
import { BUILDINGS, type BuildingKind } from './data.ts';
import { isWorkHour } from './clock.ts';
export type WalkerTask = 'walk' | 'carry' | 'work' | 'rest';
export interface Walker { x:number;y:number;route:Tile[];step:number;wait:number;style:number;headingX:number;headingY:number;walking:boolean;relocated:boolean;
  /** What the resident is doing: strolling, hauling to a workshop, or working in it. */
  task:WalkerTask;
  /** The kind of building this trip is headed for, which decides the task above. */
  goalKind?:BuildingKind;
  /** Where this resident lives and works, once the town has both. Commuters follow the clock. */
  home?:Tile;
  /** The workshop this resident commutes to, and what it makes, so the pose is right. */
  work?:{tile:Tile;kind:BuildingKind};
  /** Why the current trip is happening, which decides the pose on arrival. */
  heading?:'work'|'home' }
/** A pet trails one resident, re-pathing to that resident's tile instead of wandering. */
export interface PetWalker extends Walker { kind:PetState['kind']; follows:number }
/** Decorative citizens share the same blocked cells as construction. No straight-line shortcuts. */
export class TownCrowd {
  walkers:Walker[]=[];
  pets:PetWalker[]=[];
  navigation=new TownNavigation([]);
  private signature='';private destinations:Tile[]=[];private trip=0;
  /** The town clock, refreshed on every sync, which decides where commuters are heading. */
  private gameTime=0;
  /** Homes and workshops, so a resident can be sent to the right one for the hour. */
  private homes:Tile[]=[];private workplaces:{tile:Tile;kind:BuildingKind}[]=[];
  /** The kind of building each destination belongs to, so a resident knows where they are. */
  private destinationKind:BuildingKind[]=[];
  /**
   * `kinds` names the building each entry of `buildings` belongs to, so a resident can
   * tell a workshop from a house and pick the right pose. Optional for callers that
   * only care about movement.
   */
  sync(buildings:Tile[],roads:Road[],population:number,kinds?:BuildingKind[],gameTime=0){
    this.gameTime=gameTime;
    const signature=buildings.map(tileKey).join('|')+';'+roads.map(tileKey).join('|');
    if(signature!==this.signature){
      this.signature=signature;this.navigation=new TownNavigation(buildings,roads);
      this.destinations=buildings.flatMap(b=>this.navigation.entrances(b));
      this.destinationKind=kinds
        ? buildings.flatMap((b,i)=>this.navigation.entrances(b).map(()=>kinds[i]!))
        : [];
      // Homes are where people sleep, workshops are where the town actually makes things.
      this.homes=kinds?buildings.flatMap((b,i)=>BUILDINGS[kinds[i]!].housing?this.navigation.entrances(b):[]):[];
      this.workplaces=kinds?buildings.flatMap((b,i)=>{
        const kind=kinds[i]!;
        return BUILDINGS[kind].cycle?this.navigation.entrances(b).map(tile=>({tile,kind})):[];
      }):[];
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
      // Most residents hold a job and follow the clock to it; the rest are children, elders
      // and visitors, who keep the streets alive while everyone else is at a workbench.
      const commutes = i % 3 !== 0;
      const home=commutes&&this.homes.length?this.homes[i%this.homes.length]:undefined;
      const work=commutes&&this.workplaces.length?this.workplaces[i%this.workplaces.length]:undefined;
      this.walkers.push({...p,route:[],step:0,wait:i*.17,style:i%6,headingX:1,headingY:0,walking:false,relocated:false,task:'walk',...(home?{home}:{}),...(work?{work}:{})});
    }
  }
  /** Keeps one walker per adopted pet, each leashed to a resident. */
  syncPets(pets:readonly PetState[]){
    while(this.pets.length>pets.length)this.pets.pop();
    while(this.pets.length<pets.length){
      const pet=pets[this.pets.length]!,spot=this.destinations.length?this.destinations[this.pets.length%this.destinations.length]:{x:1,y:1};
      this.pets.push({...spot,route:[],step:0,wait:0,style:this.pets.length%2,headingX:1,headingY:0,walking:false,relocated:false,task:'walk',kind:pet.kind,follows:0});
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
        // A resident with both a home and a workshop commutes: the hour decides the goal, so
        // the same person is at the workshop all day and back home in the evening.
        const commuting=w.home&&w.work;
        const atWork=isWorkHour(this.gameTime);
        const goal=commuting?(atWork?w.work!.tile:w.home!):null;
        if(goal){
          w.heading=atWork?'work':'home';
          if(goal.x===start.x&&goal.y===start.y){
            // Already where the hour says they should be. Staying put is the whole point of a
            // commute: wandering off to a random doorway would undo it.
            w.task=atWork?'work':'rest';w.wait=1.2+(i%4)*.5;continue;
          }
          const route=this.navigation.path(start,goal);
          // The pose follows the reason for the trip: hauling into a workshop, or going home.
          if(route.length>1){w.route=route;w.step=1;w.goalKind=atWork?w.work!.kind:undefined;continue;}
        }
        if(!w.route.length){
          w.heading=undefined;
          for(let n=0;n<6;n++){
            const pick=(this.trip++*13+i*7)%this.destinations.length;
            const goal=this.destinations[pick];if(!goal)break;
            const route=this.navigation.path(start,goal);if(route.length>1){w.route=route;w.step=1;w.goalKind=this.destinationKind[pick];break;}
          }
        }
        if(!w.route.length){w.wait=2;continue;}
      }
      // Hauling to a workshop looks like carrying; waiting there looks like working.
      const commuting=w.home&&w.work;
      w.task=commuting&&w.heading
        ?(isWorkHour(this.gameTime)?'carry':'walk')
        :(w.goalKind&&BUILDINGS[w.goalKind].cycle)?'carry':'walk';
      let remaining=seconds*(.57+(i%4)*.045);
      while(remaining>0&&w.step<w.route.length){
        const target=w.route[w.step];
        if(!this.navigation.canWalk(target)){w.route=[];break;}
        const dx=target.x-w.x,dy=target.y-w.y,distance=Math.abs(dx)+Math.abs(dy);
        w.headingX=Math.sign(dx);w.headingY=Math.sign(dy);w.walking=true;
        if(remaining>=distance){w.x=target.x;w.y=target.y;remaining-=distance;w.step++;}
        else{w.x+=dx/distance*remaining;w.y+=dy/distance*remaining;remaining=0;}
      }
      if(w.step>=w.route.length){
        w.route=[];w.wait=1.5+(i%5)*.6;
        // What the resident does on arrival: work at the workshop, rest at home, else stroll.
        w.task=w.heading==='work'?'work':w.heading==='home'?'rest':(w.goalKind&&BUILDINGS[w.goalKind].cycle)?'work':'walk';
      }
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
