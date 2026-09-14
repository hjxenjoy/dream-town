import Phaser from 'phaser';
import { residentMotion } from '../sim/visualMotion';
import { TownCrowd } from '../sim/crowd';
import { PETS } from '../sim/pets';
import { atlasFrames } from '../sim/atlases';
import { drawFrameScale, drawFrameWidth } from './atlasSprite';
import { iso } from '../sim/terrain';
import type { SimWorld } from '../sim/world';
/** Which of the six action rows each walking style uses, in the original citizens order. */
const NEIGHBOUR_STYLE=['gardener','carpenter','herbalist','farmer','merchant','fisher'];
/**
 * Scale for the action atlas. Its frames are cropped tight to each pose (median 186px
 * tall, ~90% of that being the figure) while the walking cells are 256px with margins.
 * Sizing by frame width would make a hauling resident nearly twice the height of the
 * same resident strolling, so both atlases are matched on the figure, not the cell.
 */
const ACTION_SCALE=0.264;
/** Pets are small but must stay readable next to a resident. */
const PET_SIZE=34;
/** Walking cells are square, so one width drives both axes. */
const walkerWidth=(i:number)=>42+(i%3)*2;

export class Residents {
  crowd=new TownCrowd();
  private sprites:Phaser.GameObjects.Image[]=[];
  private shadows:Phaser.GameObjects.Ellipse[]=[];
  private freightSprites:Phaser.GameObjects.Image[]=[];
  private freightShadows:Phaser.GameObjects.Ellipse[]=[];
  private petSprites:Phaser.GameObjects.Image[]=[];
  private petShadows:Phaser.GameObjects.Ellipse[]=[];
  constructor(private scene:Phaser.Scene){
    const texture=scene.textures.get('citizens');
    for(let row=0;row<6;row++)for(let col=0;col<4;col++)texture.add(`${row}-${col}`,0,col*256,row*256,256,256);
    // The carrying/working atlas registers from its catalog like every other generated one.
    const actions=scene.textures.get('citizens-actions');
    Object.entries(atlasFrames('citizens-actions')).forEach(([name,frame])=>actions.add(name,0,frame.x,frame.y,frame.w,frame.h));
  }
  sync(world:SimWorld){
    this.crowd.sync(world.state.buildings,world.state.roads??[],world.state.population,world.state.buildings.map(b=>b.kind),world.state.gameTime);
    this.crowd.syncFreight(world.freightRoutes());
    this.crowd.syncPets(world.state.pets??[]);
  }
  update(time:number,delta:number,reduced=false){
    this.crowd.tick(Math.min(delta,.2));
    while(this.sprites.length>this.crowd.walkers.length){this.sprites.pop()!.destroy();this.shadows.pop()!.destroy();}
    this.crowd.walkers.forEach((w,i)=>{
      let sprite=this.sprites[i];
      if(!sprite){this.shadows.push(this.scene.add.ellipse(0,0,14,6,0x425138,.23));sprite=this.scene.add.image(0,0,'citizens',`${w.style}-0`).setOrigin(.5,.95);this.sprites.push(sprite);}
      const p=iso(w.x,w.y),screenX=w.headingX-w.headingY,screenY=w.headingX+w.headingY;
      const motion=residentMotion(time,i,delta,w.walking,w.task==='work',reduced);
      const step=motion.frame;
      if(w.task==='carry'||w.task==='work'){
        // Hauling and working come from the action atlas: eight columns per resident,
        // front then back, two frames each. Resting at home uses the walking atlas, because
        // that atlas has no rest pose and a resident at home is simply standing on their step.
        const persona=NEIGHBOUR_STYLE[w.style]??'gardener';
        const facing=screenY<0?'back':'front';
        drawFrameScale(sprite,'citizens-actions',`${persona}-${w.task}-${facing}-${step}`,ACTION_SCALE);
      }else{
        const pose=screenY<0?2:0;
        drawFrameWidth(sprite,'citizens',`${w.style}-${pose+step}`,walkerWidth(i));
      }
      sprite.setFlipX(screenX<0).setPosition(p.x,p.y+motion.bob).setDepth(p.y+6);
      if(w.relocated){w.relocated=false;if(!reduced){sprite.setAlpha(0);this.scene.tweens.add({targets:sprite,alpha:1,duration:300});}}
      this.shadows[i].setPosition(p.x,p.y).setDepth(p.y-1);
    });
    // Carriers are residents too: same sprite, same hauling pose, drawn between walkers and pets.
    while(this.freightSprites.length>this.crowd.freight.length){this.freightSprites.pop()!.destroy();this.freightShadows.pop()!.destroy();}
    this.crowd.freight.forEach((w,i)=>{
      let sprite=this.freightSprites[i];
      if(!sprite){this.freightShadows.push(this.scene.add.ellipse(0,0,14,6,0x425138,.23));sprite=this.scene.add.image(0,0,'citizens-actions','gardener-carry-front-0').setOrigin(.5,.95);this.freightSprites.push(sprite);}
      const p=iso(w.x,w.y),screenX=w.headingX-w.headingY,screenY=w.headingX+w.headingY;
      const motion=residentMotion(time,i,delta,w.walking,w.task==='work',reduced);
      const step=motion.frame;
      // The carrier keeps its own look, like the commuters above: deriving it from the array
      // index would make a carrier change person whenever the list of loads shifts.
      const persona=NEIGHBOUR_STYLE[w.style]??'gardener';
      const facing=screenY<0?'back':'front';
      drawFrameScale(sprite,'citizens-actions',`${persona}-carry-${facing}-${step}`,ACTION_SCALE);
      sprite.setFlipX(screenX<0).setPosition(p.x,p.y+motion.bob).setDepth(p.y+6);
      if(w.relocated){w.relocated=false;if(!reduced){sprite.setAlpha(0);this.scene.tweens.add({targets:sprite,alpha:1,duration:300});}}
      this.freightShadows[i].setPosition(p.x,p.y).setDepth(p.y-1);
    });
    while(this.petSprites.length>this.crowd.pets.length){this.petSprites.pop()!.destroy();this.petShadows.pop()!.destroy();}
    this.crowd.pets.forEach((pet,i)=>{
      let sprite=this.petSprites[i];
      if(!sprite){
        this.petShadows.push(this.scene.add.ellipse(0,0,9,4,0x425138,.2));
        sprite=this.scene.add.image(0,0,'pets',PETS[pet.kind].frames.front[0]).setOrigin(.5,.93);
        this.petSprites.push(sprite);
      }
      const p=iso(pet.x,pet.y),screenX=pet.headingX-pet.headingY,screenY=pet.headingX+pet.headingY;
      const facing=screenY<0?'back':'front';
      const step=residentMotion(time,i,delta,pet.walking,false,reduced).frame;
      drawFrameWidth(sprite,'pets',PETS[pet.kind].frames[facing][step],PET_SIZE);
      sprite.setFlipX(screenX<0).setPosition(p.x,p.y).setDepth(p.y+4);
      this.petShadows[i].setPosition(p.x,p.y).setDepth(p.y-1);
    });
  }
}
