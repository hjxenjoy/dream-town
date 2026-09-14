import { CROP_IDS, type FarmingState } from './farming.ts';
import type { BuildingKind } from './data.ts';
export const RARE_REWARDS = [
 {count:5,name:'丰收堆',kind:'harvestpile'},
 {count:15,name:'花车',kind:'flowercart'},
 {count:30,name:'薄荷庭院',style:'mint'},
 {count:60,name:'玫瑰花窗',style:'rose'},
 {count:100,name:'丰收农庄外观',style:'harvest'},
] as const;
export function rareCount(f?:FarmingState){return CROP_IDS.reduce((n,id)=>n+(f?.rare[id]??0),0);}
export function rareOrnamentUnlocked(kind:BuildingKind,f?:FarmingState){return RARE_REWARDS.some(r=>'kind' in r&&r.kind===kind&&rareCount(f)>=r.count);}
export function rareStyleRequirement(style:string){return RARE_REWARDS.find(r=>'style' in r&&r.style===style)?.count??0;}
