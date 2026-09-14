import { LEGACY_SIZE, riverX } from './terrain.ts';

export const REGION_IDS=['south','east','riverside'] as const;
export type RegionId=typeof REGION_IDS[number];
export const REGIONS={
  south:{name:'南部田园',description:'开辟田地、果园和牧场，让农庄舒展开来。',level:4,x:12,y:54},
  east:{name:'东部缓坡',description:'为作坊和仓储留出宽敞空间。',level:6,x:54,y:30},
  riverside:{name:'河畔休闲地',description:'沿延伸的河岸布置花园、步道和野餐角。',level:8,x:27,y:55},
} as const;

/** The old valley remains untouched; extension regions partition the new land. */
export function regionAt(x:number,y:number):RegionId|null {
  if(x<=LEGACY_SIZE&&y<=LEGACY_SIZE)return null;
  if(y>LEGACY_SIZE&&Math.abs(x-riverX(y))<8)return 'riverside';
  return x>LEGACY_SIZE?'east':'south';
}

export function validRegions(value:unknown):value is RegionId[]{
  return Array.isArray(value)&&value.every(id=>REGION_IDS.includes(id))&&new Set(value).size===value.length;
}
