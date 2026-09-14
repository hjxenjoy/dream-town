import { BUILDINGS, type BuildingKind, type ResourceMap } from './data.ts';
import { LOCAL_SUPPLY_RANGE, supplyHauls } from './layout.ts';
import type { SimState } from './world.ts';

export const PROJECT_IDS = ['garden', 'craft', 'harbor'] as const;
export type ProjectId = typeof PROJECT_IDS[number];
export interface ProjectState { active: ProjectId | null; stages: Record<ProjectId, number> }
export type ProjectMetric = 'greenHomes' | 'water' | 'civic' | 'population' | 'timber' | 'sawmill' | 'links' | 'protectedProduction' | 'farms' | 'windmill' | 'bakery' | 'foodDays' | 'fishpond' | 'caravans';
interface Requirement { metric: ProjectMetric; label: string; target: number; tip: string; category?: 'homes'|'production'|'services'|'decoration' }
interface ProjectStage { name: string; story: string; requirements: Requirement[]; contribution: Partial<ResourceMap> }
export const PROJECTS: Record<ProjectId, {name:string;resident:string;icon:string;description:string;title:string;perk:string;stages:ProjectStage[]}> = {
  garden:{name:'花园里的家',resident:'艾米 · 花店主人',icon:'leaf',description:'把住宅连成有树荫、有照料的生活街区。',title:'花园家园',perk:'永久增加 12 位社区人口名额',stages:[
    {name:'窗外有树荫',story:'「比起再盖一排房子，我更想让邻居推开窗就看见绿色。」',requirements:[{metric:'greenHomes',label:'花木相伴的住宅',target:3,tip:'在不同住宅 3 格内布置树木或花园，同一棵树可惠及邻居。',category:'decoration'}],contribution:{wood:12,stone:8}},
    {name:'有人照料的街区',story:'「孩子有课堂，邻居有诊所，这里才像一个长久的家。」',requirements:[{metric:'civic',label:'学校或诊所',target:2,tip:'建造两座可用的学校或诊所，也会增加社区人口名额。',category:'services'},{metric:'water',label:'住宅供水率',target:95,tip:'将水井或供水塔搬到缺水住宅附近。',category:'services'}],contribution:{clothing:8,bread:12}},
    {name:'一起住下来的理由',story:'「等到六十位邻居都愿意留下，我们就把这条花巷写进小镇的名字。」',requirements:[{metric:'population',label:'定居居民',target:60,tip:'同时补足床位、社区名额与三天口粮，幸福度达到 70%。',category:'homes'},{metric:'greenHomes',label:'花木相伴的住宅',target:8,tip:'把绿意延伸到更多住宅，搬迁同样有效。',category:'decoration'}],contribution:{cloth:16,plank:24}},
  ]},
  craft:{name:'河谷匠人街',resident:'阿岳 · 铁匠师傅',icon:'tools',description:'让原料、工坊和消防形成一片真正运转的产业区。',title:'精工之乡',perk:'所有工坊生产时间永久减少 5%',stages:[
    {name:'从一根原木开始',story:'「木料和木板分开供应，才能留出余力做更精细的活。」',requirements:[{metric:'timber',label:'原木生产点',target:1,tip:'准备一座伐木屋或木工坊。',category:'production'},{metric:'sawmill',label:'河谷锯木厂',target:1,tip:'完成采矿研究后建造锯木厂。',category:'production'}],contribution:{plank:16}},
    {name:'成为彼此的邻居',story:'「炉子旁有炭窑，铁匠身边有锯木厂，手艺人也需要好邻居。」',requirements:[{metric:'links',label:'就近配套的加工坊',target:3,tip:'原料作坊要在步行 6 格以内——沿着能走的地面算，不是直线；每座加工坊计一次。',category:'production'}],contribution:{ingot:6,tools:8}},
    {name:'长明的炉火',story:'「六家工坊协作，还有人守望炉火，这就是我们的匠人街。」',requirements:[{metric:'links',label:'就近配套的加工坊',target:6,tip:'搬迁工坊，让原料作坊走到它不超过 6 格；隔着河或绕远路都不算近。',category:'production'},{metric:'protectedProduction',label:'消防覆盖的生产建筑',target:6,tip:'用消防站或瞭望塔覆盖生产区，升级可以扩大范围。',category:'services'}],contribution:{tools:20,materials:12}},
  ]},
  harbor:{name:'丰收与远方',resident:'米洛 · 旅行商人',icon:'caravan',description:'把田野的收获变成餐桌上的安心，再走向河谷外的世界。',title:'丰收之港',perk:'商队旅程永久缩短 10%',stages:[
    {name:'面包的来处',story:'「有麦田、有磨坊，再有一家面包房，才是一顿好早餐的开始。」',requirements:[{metric:'farms',label:'麦田',target:3,tip:'开垦三块麦田。',category:'production'},{metric:'windmill',label:'风车磨坊',target:1,tip:'将小麦加工成面粉。',category:'production'},{metric:'bakery',label:'晨光面包房',target:1,tip:'把面粉烤成口粮。',category:'production'}],contribution:{bread:12,fish:12}},
    {name:'留够大家的晚餐',story:'「生意可以慢一点，邻居的晚饭不能少。」',requirements:[{metric:'foodDays',label:'当前口粮可用天数',target:3,tip:'备足三天口粮；捐赠后仍会保留三天口粮。',category:'production'},{metric:'fishpond',label:'碧水养鱼场',target:1,tip:'研究畜牧后，用饲料养出稳定的口粮。',category:'production'}],contribution:{feed:20,bread:20}},
    {name:'河谷外也知道我们',story:'「人多起来，商队跑远了，小镇的名字也跟着麦香传出去。」',requirements:[{metric:'population',label:'定居居民',target:45,tip:'改善住房与社区名额，吸引新邻居。',category:'homes'},{metric:'caravans',label:'累计迎回商队',target:20,tip:'从商队面板出发并领取返程货物，旧有成绩也计入。'}],contribution:{clothing:12,bread:30}},
  ]},
};
export const freshProjects = ():ProjectState => ({active:null,stages:{garden:0,craft:0,harbor:0}});
export function validProjects(value:unknown):value is ProjectState {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const p=value as ProjectState;
  if(p.active!==null&&!PROJECT_IDS.includes(p.active))return false;
  if(!p.stages||typeof p.stages!=='object'||Array.isArray(p.stages)||Object.keys(p.stages).length!==3)return false;
  return PROJECT_IDS.every(id=>Number.isInteger(p.stages[id])&&p.stages[id]>=0&&p.stages[id]<=PROJECTS[id].stages.length);
}
export function hasProjectTitle(state:SimState,id:ProjectId){return state.projects?.stages[id]===PROJECTS[id].stages.length;}
export function projectMetrics(state:SimState):Record<ProjectMetric,number> {
  const healthy=state.buildings.filter(b=>!b.damaged);
  const count=(...kinds:BuildingKind[])=>healthy.filter(b=>kinds.includes(b.kind)).length;
  const homes=healthy.filter(b=>BUILDINGS[b.kind].housing);
  const greenery=healthy.filter(b=>BUILDINGS[b.kind].category==='decoration'&&BUILDINGS[b.kind].environment);
  const producers=healthy.filter(b=>BUILDINGS[b.kind].cycle);
  const towers=healthy.filter(b=>BUILDINGS[b.kind].fireRadius);
  const wells=healthy.filter(b=>BUILDINGS[b.kind].waterRadius);
  const near=(a:{x:number;y:number},b:{x:number;y:number},r:number)=>Math.hypot(a.x-b.x,a.y-b.y)<=r;
  // Every building is passed: damaged ones still block the walk, they simply supply nothing.
  const hauls=supplyHauls(state.buildings);
  const beds=homes.reduce((n,b)=>n+BUILDINGS[b.kind].housing!*b.level,0);
  const watered=homes.filter(h=>wells.some(w=>near(h,w,BUILDINGS[w.kind].waterRadius!+w.level-1))).reduce((n,b)=>n+BUILDINGS[b.kind].housing!*b.level,0);
  return {
    greenHomes:homes.filter(h=>greenery.some(g=>near(h,g,3))).length,
    water:beds?Math.floor(watered/beds*100):0,civic:count('school','clinic'),population:state.population,
    timber:count('forester','lumber'),sawmill:count('sawmill'),
    // The 匠人街 checklist counts exactly the workshops the proximity bonus pays out to:
    // same predicate, same range, so the tick on the card and the effect are one fact.
    links:producers.filter(b=>(hauls.get(b.id) ?? Infinity) < LOCAL_SUPPLY_RANGE).length,
    protectedProduction:producers.filter(b=>towers.some(t=>near(b,t,BUILDINGS[t.kind].fireRadius!+t.level-1))).length,
    farms:count('farm'),windmill:count('windmill'),bakery:count('bakery'),fishpond:count('fishpond'),
    foodDays:Math.floor((state.resources.bread+state.resources.fish)/Math.max(1,Math.ceil(state.population/4))),caravans:state.stats.caravansCompleted,
  };
}
