import { ROADS, terrainAt, PLAYABLE_SIZE } from './terrain.ts';
export type RoadKind = 'dirt' | 'gravel' | 'stone';
export interface Tile { x:number; y:number }
export interface Road extends Tile { kind:RoadKind }
export const ROAD_TYPES:Record<RoadKind,{name:string;coins:number;stone:number;rank:number;description:string}> = {
  dirt:{name:'田园土路',coins:4,stone:0,rank:1,description:'夯实的暖色泥土，草边与车辙留住乡野气息。'},
  gravel:{name:'细石子路',coins:12,stone:1,rank:2,description:'碎石铺面与整齐路缘，适合工坊和田间通行。'},
  stone:{name:'青石板路',coins:28,stone:3,rank:3,description:'青石铺面与苔色接缝，让街巷更精致。'},
};
export const tileKey=(p:Tile)=>`${p.x},${p.y}`;
export function roadLine(a:Tile,b:Tile):Tile[]{
  if(![a.x,a.y,b.x,b.y].every(Number.isInteger)||[a.x,a.y,b.x,b.y].some(n=>n<1||n>PLAYABLE_SIZE))return [];
  const tiles=[{...a}];let x=a.x,y=a.y;
  while(x!==b.x){x+=Math.sign(b.x-x);tiles.push({x,y});}
  while(y!==b.y){y+=Math.sign(b.y-y);tiles.push({x,y});}
  return tiles;
}
export function initialRoads(buildings:Tile[]):Road[]{
  const occupied=new Set(buildings.map(tileKey)),tiles=new Map<string,Road>();
  for(const [x,y,bx,by] of ROADS)for(const t of roadLine({x,y},{x:bx,y:by})){
    if(terrainAt(t.x,t.y)==='land'&&!occupied.has(tileKey(t)))tiles.set(tileKey(t),{...t,kind:'dirt'});
  }
  return [...tiles.values()];
}
export function roadQuote(roads:Road[],tiles:Tile[],kind:RoadKind|'remove'){
  const existing=new Map(roads.map(r=>[tileKey(r),r]));let coins=0,stone=0,changed=0;
  for(const t of tiles){const current=existing.get(tileKey(t));
    if(kind==='remove'){if(current)changed++;continue;}
    if(current&&ROAD_TYPES[current.kind].rank>=ROAD_TYPES[kind].rank)continue;
    coins+=ROAD_TYPES[kind].coins-(current?ROAD_TYPES[current.kind].coins:0);
    stone+=ROAD_TYPES[kind].stone-(current?ROAD_TYPES[current.kind].stone:0);changed++;
  }
  return {coins,stone,changed};
}
