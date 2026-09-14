import type { Building } from './world.ts';
import type { BuildingKind, ResourceMap } from './data.ts';
export const LIVESTOCK = {
  chickencoop: {seconds:90,feed:1,name:'鸡群',young:'毛茸茸的幼鸡',adult:'成年鸡群'},
  pasture: {seconds:120,feed:2,name:'羊群',young:'软绵绵的小羊',adult:'成年羊群'},
  cowbarn: {seconds:150,feed:2,name:'牛群',young:'蹒跚的小牛',adult:'成年牛群'},
} as const;
export function livestockSpec(kind:BuildingKind){return LIVESTOCK[kind as keyof typeof LIVESTOCK];}
export const CHICK_GROW_SECONDS = LIVESTOCK.chickencoop.seconds;
/** Absent age means established adult livestock in an older save. */
export function chickAge(b:Building) { return b.animalAge ?? (livestockSpec(b.kind)?.seconds??0); }
export function raiseChicks(b:Building,resources:ResourceMap,elapsed:number):number {
  const spec=livestockSpec(b.kind);
  if(!spec||chickAge(b)>=spec.seconds)return elapsed;
  if(b.paused||b.damaged||b.workers===0)return 0;
  if(!b.chickFeedPaid){
    if(resources.feed<spec.feed)return 0;
    resources.feed-=spec.feed;b.chickFeedPaid=true;
  }
  const used=Math.min(elapsed,spec.seconds-chickAge(b));
  b.animalAge=chickAge(b)+used;
  return elapsed-used;
}

export function livestockFrame(b:Building):string|null {
  const spec=livestockSpec(b.kind);if(!spec)return null;
  const young=chickAge(b)<spec.seconds;
  return b.kind==='chickencoop'?(young?'chicks':'hens'):b.kind==='pasture'?(young?'lamb':'sheep'):(young?'calf':'cow');
}
