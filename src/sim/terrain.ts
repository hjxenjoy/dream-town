import type { BuildingKind } from './data.ts';

export const PLAYABLE_SIZE = 64;
export const LEGACY_SIZE = 46;
export const MAP_SIZE = PLAYABLE_SIZE + 2;
export const TILE_W = 116;
export const TILE_H = 58;
export const iso = (x:number,y:number) => ({x:(x-y)*TILE_W/2,y:(x+y)*TILE_H/2});
/**
 * The tiles a footprint of `footprint` × `footprint` covers, anchored at its north-west
 * corner. Everything that asks "is this tile free" — placement, paving, pathfinding — asks
 * about every one of these, so a building's ground is the ground it actually stands on.
 */
export function footprintTiles(x:number,y:number,footprint=1):{x:number;y:number}[]{
  const side=Math.max(1,Math.floor(footprint));
  const tiles:{x:number;y:number}[]=[];
  for(let dx=0;dx<side;dx++)for(let dy=0;dy<side;dy++)tiles.push({x:x+dx,y:y+dy});
  return tiles;
}
/** Where a footprint sits in tile coordinates: the point its art is drawn on. */
export const footprintCenter = (x:number,y:number,footprint=1)=>({x:x+(footprint-1)/2,y:y+(footprint-1)/2});
/** Where a building's art is drawn: the middle of the ground it stands on. */
export const buildingIso = (b:{x:number;y:number;footprint?:number})=>{const c=footprintCenter(b.x,b.y,b.footprint??1);return iso(c.x,c.y);};
export const BRIDGES = [15, 33] as const;
export type District = 'residential' | 'agriculture' | 'industry' | 'mining';
export const DISTRICTS: Record<District,{name:string;subtitle:string;icon:string;color:string;x:number;y:number}> = {
  residential:{name:'河西居民区',subtitle:'邻里、商铺与社区生活',icon:'home',color:'#d7bf8b',x:10,y:10},
  agriculture:{name:'南岸农业区',subtitle:'麦田、风车与牧场',icon:'wheat',color:'#d7c76f',x:10,y:31},
  industry:{name:'河东工业区',subtitle:'木工、冶炼与纺织工坊',icon:'tools',color:'#baaa90',x:33,y:31},
  mining:{name:'北岭矿区',subtitle:'山麓矿脉与采石场',icon:'ore',color:'#a7afb0',x:34,y:10},
};
export const DISTRICT_KEYS = Object.keys(DISTRICTS) as District[];
export const riverX = (y:number) => 22 + Math.sin(y/7)*1.7;
export function terrainAt(x:number,y:number): 'land'|'water'|'bridge'|'mountain'|'outside' {
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<1||y<1||x>PLAYABLE_SIZE||y>PLAYABLE_SIZE)return 'outside';
  if(Math.abs(x-riverX(y))<1.7)return BRIDGES.some(row=>row===y)?'bridge':'water';
  if(x<=LEGACY_SIZE&&(x>=29&&y<=5 || x>=43&&y<=17))return 'mountain';
  return 'land';
}
export const districtAt=(x:number,y:number):District=>x<riverX(y)?(y<21?'residential':'agriculture'):(y<21?'mining':'industry');
export function preferredDistrict(kind:BuildingKind):District {
  if(['mine','quarry'].includes(kind))return 'mining';
  if(['flowernursery','orchardhouse','chickencoop','jamkitchen','farm','windmill','feedmill','pasture','fishpond','cowbarn','dairy','apiary','vineyard','winery','cellar'].includes(kind))return 'agriculture';
  if(['lumber','kiln','smelter','smithy','weaver','tailor','forester','sawmill','brickworks'].includes(kind))return 'industry';
  return 'residential';
}
export function terrainReason(x:number,y:number):string|null {
  const type=terrainAt(x,y);
  return type==='water'?'这里是河道，请选择河岸陆地。':type==='mountain'?'这里是陡峭山峰，请在山麓空地建造。':type==='bridge'?'桥梁要留给两岸通行，请选择旁边的空地。':type==='outside'?'请选择河谷范围内的空地。':null;
}
// Main roads connect each district and the two crossings. Shared by the renderer and map overview.
export const ROADS: number[][] = [[5,8,17,8],[9,4,9,17],[5,12,17,12],[16,8,16,36],[9,28,9,36],[5,30,16,30],[5,34,16,34],[16,15,36,15],[16,33,37,33],[33,9,33,38],[29,12,39,12],[29,28,39,28],[29,36,39,36]];
