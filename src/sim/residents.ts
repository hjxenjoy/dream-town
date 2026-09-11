import { BUILDINGS, type BuildingKind } from './data.ts';
import type { Building } from './world.ts';

/**
 * The named neighbours. Each has a portrait in the `story-portraits` atlas and the
 * workshop they work at, so a name always points at real buildings on the map.
 */
export interface NeighbourDefinition {
  name: string;
  /** Frame in the `story-portraits` atlas. */
  portrait: string;
  /** Where this neighbour works, if that building exists in town. */
  workplace: BuildingKind;
  /** What they say about the town. `%s` is replaced with the town name. */
  greeting: string;
}

export const NEIGHBOURS: readonly NeighbourDefinition[] = [
  { name: '林莳', portrait: 'gardener', workplace: 'farm', greeting: '我照看%的田地，土壤一年比一年松软。' },
  { name: '鲁班生', portrait: 'carpenter', workplace: 'lumber', greeting: '%的木头经我手，能撑起整条街的屋檐。' },
  { name: '苏草', portrait: 'herbalist', workplace: 'clinic', greeting: '谁家孩子夜里咳嗽，来%的诊所找我就好。' },
  { name: '田伯', portrait: 'farmer', workplace: 'windmill', greeting: '风一起，%的磨坊就转，我听着那声音才安心。' },
  { name: '米洛', portrait: 'merchant', workplace: 'market', greeting: '商队的事交给我，%的东西能卖到很远。' },
  { name: '老渔', portrait: 'fisher', workplace: 'fishery', greeting: '天没亮我就守在%的河边，鲜鱼要趁早。' },
  { name: '麦香', portrait: 'baker', workplace: 'bakery', greeting: '%第一炉面包的味道，是麦子晒够了太阳。' },
  { name: '阿岳', portrait: 'blacksmith', workplace: 'smithy', greeting: '叮当声一响，%的铁器就有了去处。' },
  { name: '闻书', portrait: 'teacher', workplace: 'school', greeting: '孩子们在%的课堂里认识世界，也认识彼此。' },
  { name: '安和', portrait: 'doctor', workplace: 'clinic', greeting: '有我在%看着，大家夜里睡得踏实。' },
  { name: '花间', portrait: 'beekeeper', workplace: 'apiary', greeting: '%的花开得好，我的蜜蜂就酿得出甜。' },
  { name: '陈酿', portrait: 'winemaker', workplace: 'winery', greeting: '好年份的酒要在%的地窖里慢慢等。' },
];

/** A neighbour's tie to the town, derived from buildings that actually exist. */
export interface ResidentRecord {
  id: string;
  name: string;
  portrait: string;
  /** The home building this neighbour lives in, once one is available. */
  homeId: string | null;
  /** The workshop they work at, once it exists. */
  workplaceId: string | null;
  /** Whether their home is damaged and they are waiting for a repair. */
  unsettled: boolean;
}

/** How many neighbours are introduced. One per two residents, capped by the portraits. */
export function namedResidentCount(population: number): number {
  return Math.min(NEIGHBOURS.length, Math.floor(Math.max(0, population) / 2));
}

/**
 * Builds the roster from the town's own buildings. Assignments are by stable index
 * over position-sorted buildings, so the same town always yields the same neighbours.
 */
export function residentRoster(buildings: Building[], population: number): ResidentRecord[] {
  const homes = buildings.filter(b => (b.kind === 'cottage' || b.kind === 'farmhouse' || b.kind === 'rowhouse' || b.kind === 'apartment'))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return NEIGHBOURS.slice(0, namedResidentCount(population)).map((definition, index) => {
    const home = homes[index % Math.max(1, homes.length)];
    // Fall back to any workshop the town actually has, so a name never points at nothing.
    const workplace = buildings.find(b => b.kind === definition.workplace)
      ?? buildings.find(b => BUILDINGS[b.kind].cycle !== undefined);
    return {
      id: `neighbour-${definition.portrait}`,
      name: definition.name,
      portrait: definition.portrait,
      homeId: home?.id ?? null,
      workplaceId: workplace?.id ?? null,
      unsettled: home?.damaged === true,
    };
  });
}

/** The greeting a neighbour gives, mentioning the town only when it reads naturally. */
export function neighbourGreeting(definition: NeighbourDefinition, townName: string): string {
  return definition.greeting.replace(/%/g, townName);
}
