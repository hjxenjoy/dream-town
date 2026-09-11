import Phaser from 'phaser';
import { BRIDGES, DISTRICTS, DISTRICT_KEYS, iso, riverX } from '../sim/terrain';
import { drawFrameWidth } from './atlasSprite';

/** Land, river and crossings use the same coordinates as the simulation. */
export function drawValley(scene:Phaser.Scene) {
  const land=scene.add.graphics().setDepth(-1000);
  const random=(i:number)=>{const n=Math.sin(i*127.1+43.7)*43758.5453;return n-Math.floor(n);};
  // A repeating meadow texture extends beyond every camera position, including full-valley zoom.
  const meadow=scene.make.graphics({x:0,y:0});meadow.fillStyle(0x94a75f).fillRect(0,0,1024,512);
  for(let i=0;i<420;i++){
    const x=random(i*7)*1024,y=random(i*7+1)*512;
    meadow.fillStyle([0x798f4c,0xb5bc75,0xa2ad62,0x889953][i%4],.21).fillEllipse(x,y,15+random(i*7+2)*100,8+random(i*7+3)*48);
  }
  for(let i=0;i<16000;i++){
    const x=random(i*3)*1024,y=random(i*3+1)*512;
    meadow.fillStyle([0x5e7b42,0xd4cc8b,0xaab76f,0x839b52][i%4],.42).fillEllipse(x,y,1+random(i*3+2)*2.5,1.1);
    if(i%19===0)meadow.lineStyle(.7,0xc4c887,.45).lineBetween(x,y,x+1,y-3);
  }
  meadow.generateTexture('meadow-soil',1024,512);meadow.destroy();
  scene.add.tileSprite(0,1200,28000,28000,'meadow-soil').setDepth(-1100);
  // Warm clay clearings, stony soil and mossy meadows give each district its own ground.
  for(let i=0;i<145;i++){
    const x=2+random(i*11)*44,y=2+random(i*11+1)*44;
    if(Math.abs(x-riverX(y))<3)continue;
    const p=iso(x,y),radius=40+random(i*11+2)*120;
    const soil=x>28&&y<18?0x9c9980:y>22&&x<20?0xae955d:0xc3b87a;
    const outline=Array.from({length:18},(_,n)=>{const angle=n/18*Math.PI*2,r=radius*(.65+random(i*29+n)*.35);return new Phaser.Math.Vector2(p.x+Math.cos(angle)*r,p.y+Math.sin(angle)*r*.5);});
    land.fillStyle(soil,.3).fillPoints(outline,true);
    land.fillStyle(soil,.15).fillEllipse(p.x,p.y,radius*1.6,radius*.7);
    for(let n=0;n<45;n++){
      const angle=random(i*81+n)*Math.PI*2,r=random(i*127+n)*radius*.68;
      const px=p.x+Math.cos(angle)*r,py=p.y+Math.sin(angle)*r*.5;
      land.fillStyle(n%4?0x837748:0xd3c795,.4).fillEllipse(px,py,2+random(i+n)*5,1.5+random(i*3+n)*2);
    }
  }
  const polygon=(x1:number,y1:number,x2:number,y2:number,color:number,alpha:number)=>{
    land.fillStyle(color,alpha).fillPoints([iso(x1,y1),iso(x2,y1),iso(x2,y2),iso(x1,y2)].map(p=>new Phaser.Math.Vector2(p.x,p.y)),true);
  };
  polygon(3,24,17,41,0xd3bd70,.14);polygon(27,23,41,40,0xb3a583,.17);polygon(28,3,47,18,0xa2a18a,.3);
  // Subtle fallow plots establish the agricultural landscape, with room for real player fields.
  for(const [x,y] of [[5,25],[13,27],[5,37],[13,38]]){
    polygon(x,y,x+2.7,y+2.7,0xaa955a,.22);
    for(let n=0;n<9;n++){const a=iso(x+n*.3,y),b=iso(x+n*.3,y+2.7);land.lineStyle(2,0xc6b47a,.3).lineBetween(a.x,a.y,b.x,b.y);}
  }
  const river=scene.add.graphics().setDepth(-900);
  const points=Array.from({length:593},(_,i)=>{const y=-120+i*.5;const p=iso(riverX(y),y);return new Phaser.Math.Vector2(p.x,p.y);});
  river.lineStyle(212,0x5e7950,.32).strokePoints(points,false);
  river.lineStyle(194,0xd5c895).strokePoints(points,false);
  river.lineStyle(176,0x568f96).strokePoints(points,false);
  river.lineStyle(154,0x76b1ae).strokePoints(points,false);
  river.lineStyle(112,0x81bdba,.72).strokePoints(points,false);
  for(let i=0;i<320;i++){
    const y=-15+random(i+600)*85,p=iso(riverX(y)+(random(i+1100)-.5)*2.6,y);
    river.lineStyle(1.5,0xd0e6cd,.25+random(i+900)*.35).lineBetween(p.x-9,p.y+3,p.x+8,p.y-3);
  }
  for(const row of BRIDGES){
    const center=riverX(row),a=iso(center-2.3,row),b=iso(center+2.3,row);
    const bridge=scene.add.graphics().setDepth(-10);
    bridge.lineStyle(41,0x38595a,.27).lineBetween(a.x,a.y+9,b.x,b.y+9);
    bridge.lineStyle(32,0x8d7651).lineBetween(a.x,a.y,b.x,b.y);
    bridge.lineStyle(26,0xd1b77f).lineBetween(a.x,a.y-3,b.x,b.y-3);
    for(let n=0;n<=20;n++){const t=n/20,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
      bridge.lineStyle(1.5,0x9d8057,.7).lineBetween(x-7,y+10,x+7,y-16);
      if(n%4===0){bridge.lineStyle(4,0x856e4c).lineBetween(x-9,y+11,x-9,y-8).lineBetween(x+9,y-12,x+9,y-30);bridge.fillStyle(0xe3cc94).fillCircle(x-9,y-9,3).fillCircle(x+9,y-31,3);}
    }
    bridge.lineStyle(3,0xc2a574).lineBetween(a.x-9,a.y-9,b.x-9,b.y-9).lineBetween(a.x+9,a.y-31,b.x+9,b.y-31);
  }
  const texture=scene.textures.get('scenery');
  texture.add('peak',0,12,0,809,509);texture.add('orehill',0,845,13,691,499);
  texture.add('pines',0,30,508,716,516);texture.add('grove',0,824,527,712,497);
  const scenic=(frame:string,x:number,y:number,width:number)=>{
    const p=iso(x,y),s=scene.add.image(p.x,p.y,'scenery').setOrigin(.5,.87);
    // Sized from the frame being drawn, so every scenic tile keeps its own proportions.
    drawFrameWidth(s,'scenery',frame,width);
    s.setDepth(p.y-5);return s;
  };
  // Peaks are on unbuildable terrain; the broad foothills in front remain usable for mines.
  for(const [x,y,w] of [[31,3,660],[36,3,770],[41,4,710],[46,8,680],[46,14,620]])scenic('peak',x,y,w);
  for(const [x,y,w] of [[29,5,370],[39,5,330],[43,13,330]])scenic('orehill',x,y,w);
  for(let i=0;i<82;i++){
    const side=i%4,t=1+Math.floor(i/4)*2.3;
    const x=side===0?-1.7:side===1?49.3:t,y=side===2?-1.7:side===3?49.3:t;
    if(Math.abs(x-riverX(y))<3)continue;
    scenic(i%3?'pines':'grove',x,y,220+random(i+3000)*160);
  }
  // Groves away from playable plots form green belts between districts.
  for(const [x,y] of [[3,19],[7,20],[12,20],[16,20],[28,20],[32,20],[37,20],[41,20]])scenic('grove',x,y,185);
  for(const key of DISTRICT_KEYS){
    const d=DISTRICTS[key],p=iso(d.x,d.y);
    scene.add.text(p.x,p.y-180,d.name,{fontFamily:'"Songti SC",serif',fontSize:'25px',color:'#fff5d1',stroke:'#61754a',strokeThickness:3,letterSpacing:3}).setOrigin(.5).setDepth(20000).setAlpha(.9);
  }
  const p=iso(riverX(25),25);
  scene.add.text(p.x,p.y,'青  岚  河',{fontFamily:'serif',fontSize:'24px',color:'#e4f0d7',fontStyle:'italic'}).setOrigin(.5).setRotation(-.46).setDepth(-800).setAlpha(.7);
  return land;
}
