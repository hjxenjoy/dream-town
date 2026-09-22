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

/** How many frames a shipped walk cycle has. */
export const WALK_STEPS = 4;

/**
 * The scale each walking animal is drawn at, measured rather than picked.
 *
 * A still is drawn at a flat 12% of its FRAME width, and the walk cells are framed differently —
 * a sheep's still is a tight 400px crop while its walk cells are 444px with wide margins. Drawing
 * both at 0.12 made a walking sheep 65px wide against a standing sheep's 48px: the herd visibly
 * popped every time it started moving. (Measuring the *visible* pixels instead gives a different
 * wrong answer, because the still and the walk cell pad their subjects unequally.)
 *
 * So each scale is derived from the one number the renderer actually uses:
 * `still frame width × 0.12 ÷ mean walk frame width`. Equal frame widths mean equal drawn sizes.
 * Re-derive with those two numbers if the art is ever regenerated.
 */
export const WALK_SCALE: Record<'lamb' | 'sheep' | 'calf' | 'cow', number> = {
  lamb: 0.071161,
  sheep: 0.10823,
  calf: 0.082255,
  cow: 0.116888,
};

/**
 * Which atlas and frame draw a herd animal mid-stride, with the scale that keeps it the same
 * size as the same animal standing still. Null when the animal has no walk art.
 *
 * Sheep and cattle were delivered with four-frame gaits; the poultry were not, so a chicken run
 * keeps the single pair of stills it has always had rather than being given a gait the art
 * cannot show. That asymmetry is the art's, not a preference — `animal-walk-3` holds lamb and
 * sheep, `animal-walk-4` holds calf and cow, and nothing holds a walking chicken.
 *
 * A step outside the cycle wraps, so a caller can pass a free-running counter.
 */
export function livestockWalk(b:Building, step:number):{atlas:'animal-walk-3'|'animal-walk-4';frame:string;scale:number}|null {
  const spec=livestockSpec(b.kind);if(!spec)return null;
  const young=chickAge(b)<spec.seconds;
  const leg=((Math.floor(step)%WALK_STEPS)+WALK_STEPS)%WALK_STEPS;
  const animal=young?(b.kind==='pasture'?'lamb':'calf'):(b.kind==='pasture'?'sheep':'cow');
  if(b.kind!=='pasture'&&b.kind!=='cowbarn')return null;
  return {
    atlas:b.kind==='pasture'?'animal-walk-3':'animal-walk-4',
    frame:`${animal}-walk-${leg+1}`,
    scale:WALK_SCALE[animal],
  };
}
