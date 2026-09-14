import type { Building } from './world.ts';
export const ORCHARD_VARIETIES = ['青苹果', '红苹果', '蜜苹果'] as const;
export function orchardStage(progress:number,ready:boolean) {
  return ready || progress >= .72 ? '果实渐熟' : progress >= .3 ? '满树花开' : '枝叶生长';
}
export function orchardVarieties(harvests=0) {
  return ORCHARD_VARIETIES.slice(0,harvests>=30?3:harvests>=8?2:1);
}
export function growOrchards(buildings:Building[],seconds:number) {
  for(const b of buildings)if(b.kind==='orchardhouse'&&!b.paused&&!b.damaged)
    b.treeAge=Math.min(31536000,(b.treeAge??0)+seconds);
}
export function recordOrchard(b:Building,batches=1) {
  if(b.kind==='orchardhouse')b.orchardHarvests=Math.min(1000000,(b.orchardHarvests??0)+batches);
}
