import Phaser from 'phaser';
import { TownCrowd } from '../sim/crowd';
import { PETS } from '../sim/pets';
import { iso } from '../sim/terrain';
import type { SimWorld } from '../sim/world';
export class Residents {
  crowd=new TownCrowd();
  private sprites:Phaser.GameObjects.Image[]=[];
  private shadows:Phaser.GameObjects.Ellipse[]=[];
  private petSprites:Phaser.GameObjects.Image[]=[];
  private petShadows:Phaser.GameObjects.Ellipse[]=[];
  constructor(private scene:Phaser.Scene){
    const texture=scene.textures.get('citizens');
    for(let row=0;row<6;row++)for(let col=0;col<4;col++)texture.add(`${row}-${col}`,0,col*256,row*256,256,256);
  }
  sync(world:SimWorld){
    this.crowd.sync(world.state.buildings,world.state.roads??[],world.state.population);
    this.crowd.syncPets(world.state.pets??[]);
  }
  update(time:number,delta:number){
    this.crowd.tick(Math.min(delta,.2));
    while(this.sprites.length>this.crowd.walkers.length){this.sprites.pop()!.destroy();this.shadows.pop()!.destroy();}
    this.crowd.walkers.forEach((w,i)=>{
      let sprite=this.sprites[i];
      if(!sprite){this.shadows.push(this.scene.add.ellipse(0,0,14,6,0x425138,.23));sprite=this.scene.add.image(0,0,'citizens',`${w.style}-0`).setOrigin(.5,.95).setDisplaySize(42+(i%3)*2,42+(i%3)*2);this.sprites.push(sprite);}
      const p=iso(w.x,w.y),screenX=w.headingX-w.headingY,screenY=w.headingX+w.headingY;
      const pose=screenY<0?2:0,step=w.walking&&delta>0?Math.floor(time/280+i)%2:0;
      sprite.setFrame(`${w.style}-${pose+step}`).setFlipX(screenX<0).setPosition(p.x,p.y+(w.walking&&delta>0?Math.sin(time/140+i)*.6:0)).setDepth(p.y+6);
      if(w.relocated){w.relocated=false;sprite.setAlpha(0);this.scene.tweens.add({targets:sprite,alpha:1,duration:300});}
      this.shadows[i].setPosition(p.x,p.y).setDepth(p.y-1);
    });
    while(this.petSprites.length>this.crowd.pets.length){this.petSprites.pop()!.destroy();this.petShadows.pop()!.destroy();}
    this.crowd.pets.forEach((pet,i)=>{
      let sprite=this.petSprites[i];
      if(!sprite){
        this.petShadows.push(this.scene.add.ellipse(0,0,9,4,0x425138,.2));
        sprite=this.scene.add.image(0,0,'pets',PETS[pet.kind].frames.front[0]).setOrigin(.5,.93).setDisplaySize(34,34);
        this.petSprites.push(sprite);
      }
      const p=iso(pet.x,pet.y),screenX=pet.headingX-pet.headingY,screenY=pet.headingX+pet.headingY;
      const facing=screenY<0?'back':'front';
      const step=pet.walking&&delta>0?Math.floor(time/300+i)%2:0;
      sprite.setTexture('pets',PETS[pet.kind].frames[facing][step]).setFlipX(screenX<0).setPosition(p.x,p.y).setDepth(p.y+4);
      this.petShadows[i].setPosition(p.x,p.y).setDepth(p.y-1);
    });
  }
}
