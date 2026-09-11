import { terrainAt } from './terrain.ts';
import { tileKey, type Tile, type Road } from './roads.ts';
const neighbors=(p:Tile):Tile[]=>[{x:p.x+1,y:p.y},{x:p.x-1,y:p.y},{x:p.x,y:p.y+1},{x:p.x,y:p.y-1}];
/** Four-neighbor paths never cut diagonally across building corners. */
export class TownNavigation {
  blocked:Set<string>; streets:Set<string>;
  constructor(buildings:Tile[],roads:Road[]=[]){this.blocked=new Set(buildings.map(tileKey));this.streets=new Set(roads.map(tileKey));}
  canWalk(p:Tile){const t=terrainAt(p.x,p.y);return (t==='land'||t==='bridge')&&!this.blocked.has(tileKey(p));}
  entrances(p:Tile){return neighbors(p).filter(n=>this.canWalk(n));}
  nearest(p:Tile):Tile|null{
    const origin={x:Math.max(1,Math.min(46,Math.round(p.x))),y:Math.max(1,Math.min(46,Math.round(p.y)))};
    if(this.canWalk(origin))return origin;
    for(let radius=1;radius<47;radius++)for(let dx=-radius;dx<=radius;dx++)for(const dy of [-radius+Math.abs(dx),radius-Math.abs(dx)]){
      const t={x:origin.x+dx,y:origin.y+dy};if(this.canWalk(t))return t;
    }
    return null;
  }
  path(start:Tile,end:Tile):Tile[]{
    if(!this.canWalk(start)||!this.canWalk(end))return [];
    const heuristic=(p:Tile)=>(Math.abs(p.x-end.x)+Math.abs(p.y-end.y))*.55;
    const open=[start],came=new Map<string,Tile>(),g=new Map([[tileKey(start),0]]),closed=new Set<string>();
    while(open.length){
      open.sort((a,b)=>(g.get(tileKey(a))!+heuristic(a))-(g.get(tileKey(b))!+heuristic(b)));
      const current=open.shift()!,key=tileKey(current);if(closed.has(key))continue;
      if(key===tileKey(end)){const result=[current];let p=current;while(came.has(tileKey(p))){p=came.get(tileKey(p))!;result.unshift(p);}return result;}
      closed.add(key);
      for(const n of neighbors(current)){
        if(!this.canWalk(n)||closed.has(tileKey(n)))continue;
        const score=g.get(key)!+(this.streets.has(tileKey(n))||terrainAt(n.x,n.y)==='bridge'?.55:1);
        if(score<(g.get(tileKey(n))??Infinity)){g.set(tileKey(n),score);came.set(tileKey(n),current);open.push(n);}
      }
    }
    return [];
  }
}
