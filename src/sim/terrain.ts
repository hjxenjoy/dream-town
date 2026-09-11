import type { BuildingKind } from './data.ts';

export const MAP_SIZE = 48;
export const TILE_W = 116;
export const TILE_H = 58;
export const iso = (x:number,y:number) => ({x:(x-y)*TILE_W/2,y:(x+y)*TILE_H/2});
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
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<1||y<1||x>46||y>46)return 'outside';
  if(Math.abs(x-riverX(y))<1.7)return BRIDGES.some(row=>row===y)?'bridge':'water';
  if(x>=29&&y<=5 || x>=43&&y<=17)return 'mountain';
  return 'land';
}
export const districtAt=(x:number,y:number):District=>x<riverX(y)?(y<21?'residential':'agriculture'):(y<21?'mining':'industry');
export function preferredDistrict(kind:BuildingKind):District {
  if(['mine','quarry'].includes(kind))return 'mining';
  if(['farm','windmill','feedmill','pasture','fishpond'].includes(kind))return 'agriculture';
  if(['lumber','kiln','smelter','smithy','weaver','tailor','forester','sawmill','brickworks'].includes(kind))return 'industry';
  return 'residential';
}
export function terrainReason(x:number,y:number):string|null {
  const type=terrainAt(x,y);
  return type==='water'?'这里是河道，请选择河岸陆地。':type==='mountain'?'这里是陡峭山峰，请在山麓空地建造。':type==='bridge'?'桥梁要留给两岸通行，请选择旁边的空地。':type==='outside'?'请选择河谷范围内的空地。':null;
}
// Main roads connect each district and the two crossings. Shared by the renderer and map overview.
export const ROADS: number[][] = [[5,8,17,8],[9,4,9,17],[5,12,17,12],[16,8,16,36],[9,28,9,36],[5,30,16,30],[5,34,16,34],[16,15,36,15],[16,33,37,33],[33,9,33,38],[29,12,39,12],[29,28,39,28],[29,36,39,36]];
