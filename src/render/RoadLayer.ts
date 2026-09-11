import Phaser from 'phaser';
import { iso, terrainAt } from '../sim/terrain';
import { tileKey, type Road } from '../sim/roads';
export class RoadLayer {
  private graphics:Phaser.GameObjects.Graphics;
  private fingerprint='';
  constructor(scene:Phaser.Scene){this.graphics=scene.add.graphics().setDepth(-20);}
  sync(roads:Road[]){
    const key=JSON.stringify(roads);if(key===this.fingerprint)return;this.fingerprint=key;
    const g=this.graphics;g.clear();const tiles=new Set(roads.map(tileKey));
    const random=(n:number)=>{const x=Math.sin(n*91.73)*43758.545;return x-Math.floor(x);};
    // Paint the shared foundation first so adjacent road cells have no repeated internal borders.
    for(const r of roads){const p=iso(r.x,r.y);g.fillStyle(0x64714d,.25).fillPoints([[-1,0],[0,-1],[1,0],[0,1]].map(([x,y])=>new Phaser.Math.Vector2(p.x+x*60,p.y+y*30+2)),true);}
    for(const road of roads){
      const p=iso(road.x,road.y),seed=road.x*47+road.y;
      const dirt=road.kind==='dirt',stone=road.kind==='stone';
      const poly=(size:number,dy:number,color:number)=>{g.fillStyle(color).fillPoints([[-1,0],[0,-1],[1,0],[0,1]].map(([x,y])=>new Phaser.Math.Vector2(p.x+x*58*size,p.y+y*29*size+dy)),true);};
      poly(1.015,0,dirt?0xc2a570:stone?0x818f85:0xcac7ae);
      if(stone){
        for(let u=0;u<4;u++)for(let v=0;v<4;v++){
          const a=iso(road.x-.49+u*.25,road.y-.49+v*.25),b=iso(road.x-.26+u*.25,road.y-.49+v*.25),c=iso(road.x-.26+u*.25,road.y-.26+v*.25),d=iso(road.x-.49+u*.25,road.y-.26+v*.25);
          g.fillStyle([0xb7bbaa,0xc7c8b4,0xaeb7aa,0xd0cfb9][Math.floor(random(seed+u*12+v)*4)]).fillPoints([a,b,c,d].map(n=>new Phaser.Math.Vector2(n.x,n.y)),true);
          g.lineStyle(.7,0xe1dfca,.6).lineBetween(a.x,a.y,b.x,b.y);
        }
      }else for(let n=0;n<(dirt?28:65);n++){
        const u=(random(seed*113+n*3)-.5)*.81,v=(random(seed*127+n*3+1)-.5)*.81,a=iso(road.x+u,road.y+v);
        g.fillStyle((dirt?[0x98794d,0xd3b67b,0xbba06c]:[0x9eaa9c,0xe0d9bc,0xb0b5a1,0x8f9a90])[n%(dirt?3:4)],dirt?.45:.85).fillEllipse(a.x,a.y,dirt?2.5:3+random(n+seed)*3,dirt?1.3:2.2);
      }

      if(dirt){
        const alongX=tiles.has(`${road.x+1},${road.y}`)&&tiles.has(`${road.x-1},${road.y}`),alongY=tiles.has(`${road.x},${road.y+1}`)&&tiles.has(`${road.x},${road.y-1}`);
        for(const offset of [-.17,.17]){
          if(alongX){const a=iso(road.x-.5,road.y+offset),b=iso(road.x+.5,road.y+offset);g.lineStyle(1.5,0x967c51,.18).lineBetween(a.x,a.y,b.x,b.y);}
          if(alongY){const a=iso(road.x+offset,road.y-.5),b=iso(road.x+offset,road.y+.5);g.lineStyle(1.5,0x967c51,.18).lineBetween(a.x,a.y,b.x,b.y);}
        }
      }
    }
    for(const road of roads){
      const edges=[{dx:1,dy:0,a:[.5,-.5],b:[.5,.5]},{dx:-1,dy:0,a:[-.5,-.5],b:[-.5,.5]},{dx:0,dy:1,a:[-.5,.5],b:[.5,.5]},{dx:0,dy:-1,a:[-.5,-.5],b:[.5,-.5]}];
      for(const e of edges){
        if(tiles.has(`${road.x+e.dx},${road.y+e.dy}`)||terrainAt(road.x+e.dx,road.y+e.dy)==='bridge')continue;
        const a=iso(road.x+e.a[0],road.y+e.a[1]),b=iso(road.x+e.b[0],road.y+e.b[1]);
        g.lineStyle(road.kind==='dirt'?2:4,road.kind==='dirt'?0x9c8959:road.kind==='stone'?0xcdd0bc:0xa8b49f,.85).lineBetween(a.x,a.y,b.x,b.y);
        for(let n=0;n<6;n++){
          const t=(n+.3)/6,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
          g.fillStyle(0x6f894b,.6).fillEllipse(x,y,3,1.8);g.lineStyle(.8,0xa7b16c,.7).lineBetween(x,y,x+1,y-3);
        }
      }
    }
  }
}
