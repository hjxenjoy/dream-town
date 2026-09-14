export const CROP_IDS=['wheat','carrot','corn','tomato','strawberry','pumpkin','sunflower','grape','apple'] as const;
export type CropId=typeof CROP_IDS[number];
export interface CropDefinition { name:string; level:number; cycle:number; yield:number; price:number; color:number; description:string }
export const CROPS:Record<CropId,CropDefinition>={
  wheat:{name:'金色小麦',level:1,cycle:30,yield:4,price:2,color:0xe6c76b,description:'留在仓库供磨坊和饲料坊使用。'},
  carrot:{name:'甜心胡萝卜',level:1,cycle:24,yield:5,price:3,color:0xed9552,description:'长得快的小菜，收获后自动送农摊。'},
  corn:{name:'阳光玉米',level:2,cycle:42,yield:7,price:4,color:0xecc64f,description:'金灿灿的玉米棒，让田野慢慢热闹。'},
  tomato:{name:'红宝石番茄',level:3,cycle:55,yield:8,price:5,color:0xd9634e,description:'小木架上挂满红果实，每次采摘都是好心情。'},
  strawberry:{name:'奶油草莓',level:4,cycle:75,yield:9,price:7,color:0xe77a87,description:'花开之后等一等，甜甜的小浆果就成熟了。'},
  pumpkin:{name:'暖秋南瓜',level:5,cycle:100,yield:10,price:9,color:0xe8a145,description:'长得慢一点，收成也更丰盛。'},
  sunflower:{name:'向阳花田',level:6,cycle:120,yield:12,price:10,color:0xebc13e,description:'把阳光留在花盘里，收获花籽送往农摊。'},
  grape:{name:'紫露葡萄',level:7,cycle:150,yield:14,price:12,color:0x9975b1,description:'搭好葡萄架，一串串等待河谷的晚风。'},
  apple:{name:'蜜糖苹果',level:8,cycle:180,yield:16,price:14,color:0xd66a58,description:'从一块田到一片小果园，树上挂满自己的收获。'},
};
export interface FarmingState { xp:number; harvested:number; coinsEarned:number; autoReplant:boolean; album:Record<CropId,number>; rare:Record<CropId,number> }
export interface CropHarvest { crop:CropId; quantity:number; rare:boolean }
export const freshFarming=():FarmingState=>({xp:0,harvested:0,coinsEarned:0,autoReplant:true,album:Object.fromEntries(CROP_IDS.map(id=>[id,0])) as Record<CropId,number>,rare:Object.fromEntries(CROP_IDS.map(id=>[id,0])) as Record<CropId,number>});
const whole=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function validFarming(v:unknown):v is FarmingState {
  if(!v||typeof v!=='object'||Array.isArray(v))return false;const f=v as FarmingState;
  const record=(a:Record<CropId,number>)=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===CROP_IDS.length&&CROP_IDS.every(id=>whole(a[id]));
  return whole(f.xp)&&whole(f.harvested)&&whole(f.coinsEarned)&&typeof f.autoReplant==='boolean'&&!!record(f.album)&&!!record(f.rare)&&CROP_IDS.every(id=>f.rare[id]<=f.album[id])&&CROP_IDS.reduce((n,id)=>n+f.album[id],0)===f.harvested;
}
export function gardenLevel(xp:number){let level=1,left=xp;while(level<30){const need=level*80;if(left<need)break;left-=need;level++;}return {level,progress:left,next:level===30?0:level*80};}
export function soilLevel(harvests=0){const thresholds=[0,8,24,60,140];let index=0;for(let i=1;i<thresholds.length;i++)if(harvests>=thresholds[i])index=i;return {level:index+1,name:['新垦土地','松软沃土','丰饶良田','金穗田园','传家沃土'][index],harvests,next:thresholds[index+1]??null,bonus:index};}
export function cropMastery(amount:number){return amount>=1500?'传家品种':amount>=500?'丰收能手':amount>=150?'熟练种植':amount>=30?'初尝收获':amount>0?'初试种植':'等待收获';}

/** The ready flag is authoritative: a full progress bar may still await settlement. */
export function cropGrowthStage(progress:number, ready:boolean, fallow=false): 'fallow'|'sprouting'|'growing'|'ripening'|'ready' {
  if(ready)return 'ready';
  if(fallow)return 'fallow';
  if(progress>=.72)return 'ripening';
  if(progress>=.22)return 'growing';
  return 'sprouting';
}
export const CROP_GROWTH_LABELS={fallow:'等待播种',sprouting:'正在萌芽',growing:'枝叶渐丰',ripening:'快成熟了',ready:'可以收获'};
export function harvestQuote(crop:CropId,buildingLevel:number,harvests:number,seed:number):CropHarvest {
  const def=CROPS[crop],soil=soilLevel(harvests);
  // A deterministic lucky harvest survives refreshes and offline settlement.
  const rare=(Math.imul(harvests+1,17)+seed*13)%Math.max(7,15-soil.level)===0;
  return {crop,quantity:Math.floor(def.yield*(1+(buildingLevel-1)*.5))+soil.bonus+(rare?2:0),rare};
}

export const CROP_ATLAS={width:1254,height:1254};
export const CROP_FRAMES:Record<CropId,{x:number;y:number;w:number;h:number;anchor:number}>={
  wheat:{x:0,y:0,w:410,h:400,anchor:.75},carrot:{x:410,y:0,w:417,h:400,anchor:.75},corn:{x:827,y:0,w:427,h:400,anchor:.75},
  tomato:{x:0,y:400,w:410,h:400,anchor:.76},strawberry:{x:410,y:400,w:417,h:400,anchor:.75},pumpkin:{x:827,y:400,w:427,h:400,anchor:.76},
  sunflower:{x:0,y:800,w:410,h:454,anchor:.71},grape:{x:410,y:800,w:417,h:454,anchor:.71},apple:{x:827,y:800,w:427,h:454,anchor:.71},
};
