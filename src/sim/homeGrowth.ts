import { BUILDINGS } from './data.ts';
import type { Building } from './world.ts';
export const HOME_STYLES = {
  mint: { name: '薄荷庭院', seconds: 0 },
  rose: { name: '玫瑰花窗', seconds: 0 },
  harvest: { name: '丰收农庄', seconds: 0 },
  original: { name: '原貌', seconds: 0 },
  flowers: { name: '门前花窗', seconds: 600 },
  courtyard: { name: '绿意庭院', seconds: 1800 },
  laundry: { name: '晴日晾衣', seconds: 3600 },
} as const;
export type HomeStyle = keyof typeof HOME_STYLES;
export function growHomes(buildings: Building[], population: number, elapsed: number) {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return;
  // Stable allocation does not change when a home is moved to a new street.
  let remaining = Math.max(0, population);
  for (const b of buildings.filter(b => BUILDINGS[b.kind].housing && !b.damaged).sort((a,b)=>a.id.localeCompare(b.id))) {
    const occupied = Math.min(remaining, BUILDINGS[b.kind].housing! * b.level);
    remaining -= occupied;
    if (occupied > 0) b.livedSeconds = Math.min(3600, (b.livedSeconds ?? 0) + elapsed);
  }
}
