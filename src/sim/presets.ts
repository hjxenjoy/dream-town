/**
 * 预制地图（开局蓝图）：一张已经规划好的河谷——街区、道路、工坊与装饰都摆在图纸上。
 *
 * 这里只有数据与展开道路的小工具，不碰模拟规则：`world.ts` 的 `createInitialState` 拿着
 * 蓝图装配 `SimState`，`tests/presets.test.ts` 逐项校验蓝图本身（地形、重叠、人手、床位、
 * 仓储、科技前置）。地图不是随机生成的——每张图都像一张小镇规划图：主街连着两座桥，
 * 街区里排着住宅，田地、工坊、矿区各占一片，街角摆着长椅、花箱和树。
 *
 * 坐标即地块（x 向东、y 向南，1..64）。地形规律见 `terrain.ts`：河道在 x≈22 一线，
 * 西岸 x≤18、东岸 x≥26 才是陆地；桥面在 y=15 与 y=33；东北角是山。预制图都按这条
 * 规律排，因此每一块地都是真的能建、能走、能通车的。
 *
 * 排布约定（与各图的街网一一对应，避免建筑压路）：
 * - 河西居民区：纵街 x=4/8/12/16，横街 y=4/9/15/19 → 用列 {2,3}/{5..7}/{9..11}/{13..15}/{17,18} 与行 {2,3}/{5..8}/{10..14}/{16..18}；
 * - 南岸农业区：纵街 x=5/10/15，横街 y=24/29/33/38 → 用列 {2..4}/{6..9}/{11..14}/{16..18}；
 * - 河东工业区：纵街 x=28/33/38 → 用列 {26,27}/{29..32}/{34..37}/{39..42}；
 * - 北岭矿区：横街 y=11/15、纵街 x=33 → 用行 {6..10}/{12..14}/{16..20}。
 */
import { BUILDINGS, type BuildingKind, type ProductionFocus, type ResourceMap, type TechnologyId } from './data.ts';
import type { CropId } from './farming.ts';
import type { RegionId } from './regions.ts';
import { roadLine, type RoadKind } from './roads.ts';
import { terrainAt } from './terrain.ts';

export interface MapPlacement {
  kind: BuildingKind;
  x: number;
  y: number;
  level?: 1 | 2 | 3;
  /** A field's crop; wheat fields may also stand ready with their corn waiting. */
  crop?: CropId;
  /** A workshop's chosen recipe: which ore a mine digs, which drink a winery brews. */
  focus?: ProductionFocus;
  /** Ready to collect, stock already waiting — the ✓ the player can click at once. */
  ready?: boolean;
  /** Production progress, so the street shows workshops mid-cycle rather than all at zero. */
  progress?: number;
  /** Adult livestock, so a yard is visibly inhabited from the first frame. */
  grown?: boolean;
}

/** A planned street: a straight run of paving between two corners, inclusive. */
export type MapStreet = [x1: number, y1: number, x2: number, y2: number, kind: RoadKind];

export interface MapPreset {
  id: MapPresetId;
  name: string;
  tagline: string;
  description: string;
  /** The first line in the town log, written for this map. */
  welcome: string;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  level: number;
  coins: number;
  prestige: number;
  xp: number;
  taxRate: number;
  /** How many residents live here from the first frame; the crowd on the street follows it. */
  population: number;
  researched: TechnologyId[];
  regions: RegionId[];
  resources: Partial<ResourceMap>;
  /** Garden experience, so the fields may hold the crops this map plants. */
  farmingXp: number;
  placements: MapPlacement[];
  streets: MapStreet[];
}

/**
 * A planned map has planned the whole valley, so every expansion region is already open:
 * the dark "not yet opened" wash would otherwise ring a finished-looking town. `frontier`
 * keeps them closed, which is where a growing town meets that mechanic.
 */
const OPEN_REGIONS: RegionId[] = ['south', 'east', 'riverside'];

const at = (kind: BuildingKind, x: number, y: number, extra: Partial<Omit<MapPlacement, 'kind' | 'x' | 'y'>> = {}): MapPlacement => ({ kind, x, y, ...extra });
/** A run of identical buildings along a street — the way a row of houses actually faces one. */
const row = (kind: BuildingKind, x: number, y: number, dx: number, dy: number, count: number, extra: Partial<Omit<MapPlacement, 'kind' | 'x' | 'y'>> = {}): MapPlacement[] =>
  Array.from({ length: count }, (_, index) => at(kind, x + dx * index, y + dy * index, extra));
/** A run of paving, filtered to real land when the state is assembled. */
const pave = (streets: MapStreet[]): { x: number; y: number; kind: RoadKind }[] => {
  const tiles = new Map<string, { x: number; y: number; kind: RoadKind }>();
  for (const [x1, y1, x2, y2, kind] of streets) for (const tile of roadLine({ x: x1, y: y1 }, { x: x2, y: y2 })) {
    if (terrainAt(tile.x, tile.y) !== 'land') continue;
    const key = `${tile.x},${tile.y}`;
    if (!tiles.has(key)) tiles.set(key, { ...tile, kind });
  }
  return [...tiles.values()];
};
export const presetRoads = (preset: MapPreset) => pave(preset.streets);

/** Fields with a crop in the ground: wheat stands ready (it feeds the mill), the rest are colour. */
const fields = (x: number, y: number, crops: CropId[]): MapPlacement[] =>
  crops.map((crop, index) => at('farm', x + (index % 3), y + Math.floor(index / 3), {
    crop,
    ...(crop === 'wheat' ? { ready: true } : { progress: [0.18, 0.46, 0.74, 0.3, 0.6, 0.12][index % 6] }),
  }));

/** The four house-and-service blocks of the west bank, reused by every planned map. */
function westBankHomes(homes: [kind: BuildingKind, level?: 1 | 2 | 3][]): MapPlacement[] {
  const [north, northLevel] = homes[0]!;
  return [
    ...row(north, 5, 2, 1, 0, 3, northLevel ? { level: northLevel } : {}), ...row(homes[1]![0], 9, 2, 1, 0, 3), ...row(homes[2]![0], 13, 2, 1, 0, 3),
    ...row(homes[3]![0], 5, 3, 1, 0, 3), ...row(homes[4]![0], 9, 3, 1, 0, 3), ...row(homes[5]![0], 13, 3, 1, 0, 3),
    ...row(homes[6]![0], 5, 5, 1, 0, 3), ...row(homes[7]![0], 9, 5, 1, 0, 3), ...row(homes[8]![0], 13, 5, 1, 0, 3),
    ...row(homes[9]![0], 5, 7, 1, 0, 3), ...row(homes[10]![0], 9, 7, 1, 0, 3), ...row(homes[11]![0], 13, 7, 1, 0, 3),
  ];
}

/**
 * 河谷新村：默认开局图。河西是住宅与市集，南岸是田地，河东是木工与窑火，北岭是矿场。
 * 主街在 y=15 与 y=33 跨过两座桥，把四片街区串成一个真的小镇。
 */
function riverbend(): MapPreset {
  return {
    id: 'riverbend',
    name: '河谷新村',
    tagline: '河两岸的完整小镇',
    description: '议事厅广场、临街住宅、南岸田地、河东工坊与北岭矿场都已经安排好：主街跨过两座桥，居民一开局就在街上走。想改布局，随时可以搬迁任何一座建筑。',
    welcome: '欢迎来到青岚小镇。河两岸的街区、道路与田地都已经规划好，新的故事正等你开始。',
    season: 'spring', level: 8, coins: 6800, prestige: 26, xp: 560, taxRate: 1, population: 54,
    researched: ['husbandry', 'mining'], regions: OPEN_REGIONS, farmingXp: 240,
    resources: { wood: 120, stone: 80, wheat: 40, flour: 20, bread: 30, fish: 20, plank: 30, materials: 15, feed: 15, sugarcane: 10, sugar: 6, ore: 8, charcoal: 6 },
    streets: [
      // 河西居民区：四条横街、四条纵街围出六个街区
      [2, 4, 18, 4, 'gravel'], [2, 9, 18, 9, 'gravel'], [2, 15, 21, 15, 'stone'], [2, 19, 18, 19, 'dirt'],
      [4, 2, 4, 19, 'dirt'], [8, 2, 8, 19, 'gravel'], [12, 2, 12, 19, 'gravel'], [16, 2, 16, 19, 'dirt'],
      // 北桥 → 北岭矿区
      [26, 15, 40, 15, 'stone'], [26, 11, 40, 11, 'dirt'], [33, 6, 33, 20, 'gravel'],
      // 南岸农业区
      [5, 21, 5, 42, 'dirt'], [10, 21, 10, 42, 'dirt'], [15, 21, 15, 42, 'dirt'],
      [2, 24, 18, 24, 'dirt'], [2, 29, 18, 29, 'dirt'], [2, 33, 18, 33, 'stone'], [2, 38, 18, 38, 'dirt'],
      // 南桥 → 河东工业区
      [26, 33, 40, 33, 'stone'], [26, 26, 40, 26, 'gravel'], [26, 38, 40, 38, 'dirt'],
      [28, 22, 28, 42, 'dirt'], [33, 22, 33, 42, 'gravel'], [38, 22, 38, 42, 'dirt'],
    ],
    placements: [
      // —— 河西居民区：两排住宅对着街，中间是广场、学堂与市集 ——
      ...westBankHomes([
        ['cottage', 2], ['cottage'], ['rowhouse'], ['cottage'], ['farmhouse'], ['cottage'],
        ['cottage'], ['rowhouse', 2], ['cottage'], ['cottage'], ['homestead'], ['cottage'],
      ]),
      at('well', 5, 10), at('school', 6, 11), at('clinic', 6, 13), at('flowerbox', 7, 10), at('garden', 7, 12), at('bench', 5, 12),
      at('market', 10, 11), at('bakery', 9, 12, { progress: 0.52 }), at('teahouse', 11, 12), at('signflags', 11, 10), at('parasol', 9, 14), at('flowerbox', 11, 14),
      at('townhall', 14, 12, { level: 2 }), at('fountain', 13, 12), at('garden', 15, 12), at('signflags', 14, 10), at('bench', 13, 14), at('archlights', 15, 14),
      ...row('cottage', 5, 16, 1, 0, 3), ...row('rowhouse', 9, 16, 1, 0, 3), ...row('cottage', 13, 16, 1, 0, 3),
      ...row('farmhouse', 5, 18, 1, 0, 3), ...row('cottage', 9, 18, 1, 0, 3), ...row('apartment', 13, 18, 1, 0, 2),
      at('cherry', 2, 6), at('oak', 2, 11), at('maple', 2, 17), at('cherry', 18, 5), at('oak', 18, 8),
      // 河滨步道：栏杆、木栈道、垂柳与小码头贴着河岸排开
      at('railing', 18, 11), at('boardwalk', 18, 12), at('railing', 18, 13), at('willow', 18, 14), at('dock', 18, 17), at('boardwalk', 18, 18),
      // —— 北岭矿区：矿井、采石场与窑火 ——
      at('quarry', 27, 8, { level: 2, progress: 0.4 }), at('mine', 30, 8, { focus: 'copper', progress: 0.62 }), at('kiln', 29, 10, { progress: 0.3 }),
      at('firetower', 26, 7), at('guardpost', 34, 6), at('crates', 28, 9), at('anvil', 31, 9),
      ...row('cottage', 35, 8, 1, 0, 3), ...row('pine', 35, 10, 1, 0, 4), at('signflags', 34, 12), at('bench', 36, 12),
      at('guardpost', 26, 18), at('pine', 26, 19), at('pine', 27, 20),
      // —— 河东工业区：木工、锯木、窑火与仓储 ——
      at('lumber', 27, 23, { level: 2, progress: 0.55 }), at('sawmill', 29, 23, { progress: 0.34 }), at('forester', 27, 25, { ready: true }),
      at('warehouse', 34, 24, { level: 2 }), at('warehouse', 36, 24), at('brickworks', 36, 25, { progress: 0.2 }),
      at('firetower', 26, 22), at('hunterlodge', 39, 24, { ready: true }), at('herbgarden', 41, 24, { progress: 0.6 }),
      at('crates', 26, 24), at('barrels', 30, 24), at('anvil', 32, 25), at('signflags', 31, 22),
      ...row('cottage', 29, 28, 1, 0, 3), ...row('rowhouse', 34, 28, 1, 0, 3), at('well', 37, 28), at('bench', 40, 28),
      // 城墙与城门：工业区中腰的一段防线，街口留空通行
      ...row('wall', 26, 32, 1, 0, 2), at('citygate', 29, 32), ...row('wall', 30, 32, 1, 0, 3), ...row('wall', 34, 32, 1, 0, 4),
      at('citygate', 39, 32), ...row('wall', 40, 32, 1, 0, 3), at('guardpost', 34, 31),
      at('oak', 36, 31), at('cherry', 37, 31), at('maple', 39, 31),
      at('warehouse', 27, 35), at('warehouse', 26, 37), at('crates', 29, 36), at('barrels', 30, 37),
      ...row('cottage', 34, 35, 1, 0, 3), at('well', 37, 35), at('bench', 40, 35), at('flowerbox', 41, 35),
      at('oak', 26, 40), at('pine', 27, 41), at('oak', 31, 41),
      // —— 南岸农业区：田地、风车、果园与牧场 ——
      at('windmill', 12, 23), at('flowernursery', 6, 23, { ready: true }), at('sugarmill', 3, 31, { progress: 0.45 }),
      ...fields(6, 25, ['wheat', 'wheat', 'carrot', 'wheat', 'corn', 'wheat']),
      ...fields(11, 25, ['wheat', 'carrot', 'wheat', 'wheat', 'corn', 'wheat']),
      at('canefield', 17, 25, { progress: 0.5 }), at('canefield', 17, 26, { ready: true }), at('fishery', 16, 31, { ready: true }),
      at('fishpond', 17, 34, { progress: 0.28 }), at('orchardhouse', 6, 35, { ready: true }), at('jamkitchen', 7, 35, { progress: 0.6 }),
      at('chickencoop', 12, 35, { grown: true, progress: 0.4 }), at('pasture', 13, 35, { grown: true, progress: 0.35 }), at('feedmill', 12, 37, { progress: 0.5 }),
      at('hunterlodge', 3, 40), at('herbgarden', 4, 40, { ready: true }), at('garden', 11, 31), at('trellis', 12, 31), at('flowerarch', 13, 31),
      at('oak', 2, 22), at('cherry', 3, 23), at('maple', 2, 35), at('oak', 4, 37), at('willow', 17, 40), at('dock', 16, 42),
      at('bench', 7, 31), at('parasol', 8, 31), at('crates', 13, 32), at('barrels', 14, 32),
      ...row('farmhouse', 2, 42, 1, 0, 3), ...row('cottage', 11, 42, 1, 0, 3),
    ],
  };
}

/**
 * 工坊之城：冶炼、纺织与建材的工业图。东岸连成一片工坊，西岸是成排联排屋，
 * 城墙围着工坊广场，兵营与消防站守着生产线。
 */
function milltown(): MapPreset {
  return {
    id: 'milltown',
    name: '工坊之城',
    tagline: '炉火、织机与城墙',
    description: '矿石进炉、锭铁进铺、羊毛进织机：一条完整的工业链从北岭一路排到河东，城墙与兵营守住工坊广场。适合研究精工与纺织的长线玩法。',
    welcome: '欢迎来到青岚小镇。炉火已经生起，工坊广场正等着开工。',
    season: 'summer', level: 12, coins: 14000, prestige: 68, xp: 1400, taxRate: 2, population: 74,
    researched: ['husbandry', 'mining', 'metallurgy', 'tailoring', 'civics'], regions: OPEN_REGIONS, farmingXp: 240,
    resources: { wood: 140, stone: 120, ore: 50, charcoal: 30, ingot: 10, tools: 12, plank: 60, materials: 40, cloth: 16, clothing: 12, wool: 20, feed: 30, wheat: 60, flour: 24, bread: 30, fish: 24 },
    streets: [
      [2, 4, 18, 4, 'stone'], [2, 9, 18, 9, 'stone'], [2, 15, 21, 15, 'stone'], [2, 19, 18, 19, 'gravel'],
      [4, 2, 4, 19, 'gravel'], [8, 2, 8, 19, 'stone'], [12, 2, 12, 19, 'stone'], [16, 2, 16, 19, 'gravel'],
      [26, 15, 42, 15, 'stone'], [26, 11, 42, 11, 'gravel'], [26, 20, 42, 20, 'gravel'], [33, 6, 33, 20, 'stone'],
      [26, 26, 42, 26, 'stone'], [26, 31, 42, 31, 'gravel'], [26, 36, 42, 36, 'gravel'], [26, 41, 42, 41, 'dirt'],
      [28, 22, 28, 42, 'gravel'], [33, 22, 33, 42, 'stone'], [38, 22, 38, 42, 'gravel'],
      [2, 24, 18, 24, 'gravel'], [2, 33, 18, 33, 'stone'], [5, 21, 5, 42, 'gravel'], [10, 21, 10, 42, 'gravel'], [15, 21, 15, 42, 'gravel'],
    ],
    placements: [
      // 西岸：成排联排屋与公寓，街角是议事厅、学堂、诊所与剧院
      ...westBankHomes([
        ['rowhouse', 2], ['rowhouse'], ['apartment'], ['rowhouse'], ['rowhouse'], ['apartment'],
        ['rowhouse'], ['rowhouse'], ['rowhouse'], ['cottage'], ['homestead'], ['cottage'],
      ]),
      at('townhall', 6, 11, { level: 3 }), at('fountain', 5, 11), at('garden', 7, 11), at('signflags', 6, 10), at('bench', 5, 13), at('archlights', 7, 13),
      at('school', 10, 11, { level: 2 }), at('clinic', 10, 13, { level: 2 }), at('chapel', 11, 11), at('well', 9, 11), at('flowerbox', 9, 13), at('trellis', 11, 13),
      at('theatre', 14, 11, { level: 2 }), at('market', 14, 13), at('bakery', 15, 11, { progress: 0.6 }), at('teahouse', 13, 13), at('parasol', 15, 13), at('bench', 13, 11),
      ...row('rowhouse', 5, 16, 1, 0, 3, { level: 2 }), ...row('rowhouse', 9, 16, 1, 0, 3), ...row('apartment', 13, 16, 1, 0, 3),
      ...row('cottage', 5, 18, 1, 0, 3), ...row('rowhouse', 9, 18, 1, 0, 3), ...row('rowhouse', 13, 18, 1, 0, 3),
      at('oak', 2, 6), at('cherry', 2, 11), at('maple', 2, 17), at('oak', 18, 6), at('cherry', 18, 12),
      at('railing', 18, 14), at('boardwalk', 18, 16), at('willow', 18, 18), at('dock', 18, 13),
      // 北岭：两座矿井、采石场与炭窑，碎石路一直修到山脚
      at('mine', 30, 8, { focus: 'silver', progress: 0.5 }), at('mine', 32, 8, { focus: 'copper', progress: 0.2 }), at('quarry', 27, 8, { level: 3, ready: true }),
      at('kiln', 29, 10, { progress: 0.66 }), at('kiln', 31, 10, { ready: true }), at('firetower', 26, 7), at('guardpost', 34, 6),
      ...row('cottage', 35, 8, 1, 0, 3), ...row('pine', 35, 10, 1, 0, 4), at('crates', 28, 9), at('anvil', 30, 9), at('signflags', 34, 12),
      // 河东工坊广场：冶炼、锻造、纺织与建材围成一圈，城墙与兵营守着
      at('smelter', 27, 23, { progress: 0.62 }), at('smithy', 29, 23, { focus: 'pickaxe', progress: 0.35 }), at('sawmill', 31, 23, { progress: 0.5 }),
      at('brickworks', 34, 23, { progress: 0.25 }), at('warehouse', 36, 23, { level: 3 }), at('warehouse', 39, 23, { level: 2 }),
      at('weaver', 27, 25, { progress: 0.48 }), at('tailor', 29, 25, { progress: 0.3 }), at('feedmill', 31, 25, { ready: true }),
      at('firestation', 34, 25), at('barracks', 36, 25), at('guardpost', 40, 25),
      at('pasture', 27, 28, { grown: true, progress: 0.4 }), at('lumber', 29, 28, { level: 2, progress: 0.7 }), at('forester', 31, 28, { progress: 0.3 }),
      at('smelter', 34, 28, { progress: 0.15 }), at('smithy', 36, 28, { focus: 'dynamite', progress: 0.55 }), at('warehouse', 40, 28, { level: 2 }),
      ...row('wall', 26, 30, 1, 0, 2), at('citygate', 29, 30), ...row('wall', 30, 30, 1, 0, 3), ...row('wall', 34, 30, 1, 0, 4),
      at('citygate', 39, 30), ...row('wall', 40, 30, 1, 0, 3), at('signflags', 34, 32), at('crates', 35, 32),
      at('anvil', 26, 32), at('crates', 27, 33), at('barrels', 30, 33), at('anvil', 36, 33), at('crates', 39, 33),
      ...row('rowhouse', 29, 35, 1, 0, 3), ...row('cottage', 34, 35, 1, 0, 3), at('well', 37, 35), at('bench', 40, 35), at('flowerbox', 41, 35),
      at('warehouse', 27, 39), at('warehouse', 26, 40), at('guardpost', 34, 39), at('firetower', 39, 39),
      at('oak', 26, 42), at('pine', 30, 42), at('oak', 35, 42), at('maple', 39, 42),
      // 南岸：粮食与牧场供养这座工业城
      at('windmill', 12, 23, { level: 2 }), at('bakery', 7, 23, { progress: 0.4 }), at('flowernursery', 6, 23, { ready: true }),
      ...fields(6, 25, ['wheat', 'wheat', 'wheat', 'carrot', 'wheat', 'corn']),
      ...fields(11, 25, ['wheat', 'wheat', 'corn', 'wheat', 'wheat', 'carrot']),
      ...fields(2, 30, ['wheat', 'wheat', 'carrot', 'wheat', 'wheat', 'corn']),
      at('sugarmill', 17, 25, { progress: 0.4 }), at('canefield', 17, 26, { ready: true }), at('fishery', 16, 31, { ready: true }),
      at('cowbarn', 6, 35, { grown: true, progress: 0.4 }), at('dairy', 7, 35, { progress: 0.5 }), at('pasture', 9, 35, { grown: true, progress: 0.2 }),
      at('chickencoop', 12, 35, { grown: true }), at('pigfarm', 13, 35, { grown: true, progress: 0.3 }), at('butcher', 14, 35, { progress: 0.45 }),
      at('orchardhouse', 6, 40, { ready: true }), at('jamkitchen', 7, 40, { progress: 0.5 }), at('herbgarden', 4, 40),
      at('garden', 11, 31), at('trellis', 12, 31), at('oak', 2, 22), at('cherry', 3, 23), at('maple', 2, 38), at('willow', 17, 40),
      ...row('farmhouse', 2, 42, 1, 0, 3), ...row('cottage', 11, 42, 1, 0, 3),
    ],
  };
}

/**
 * 田园牧歌：农业与酒的地图。田地按作物分块，南坡葡萄园、牧场、牛舍与蜂场连成一片，
 * 酒窖把葡萄酒存成陈年佳酿。
 */
function pastoral(): MapPreset {
  return {
    id: 'pastoral',
    name: '田园牧歌',
    tagline: '葡萄、奶酪与麦香',
    description: '九种作物分块种在南岸，葡萄园沿坡排开，酿酒坊与酒窖一前一后；牧场、牛舍、蜂场围着饲料坊。加工链从麦田一路走到陈年佳酿。',
    welcome: '欢迎来到青岚小镇。田里的庄稼正在熟，葡萄园的架子已经搭好。',
    season: 'autumn', level: 11, coins: 11000, prestige: 52, xp: 1100, taxRate: 1, population: 62,
    researched: ['husbandry', 'mining', 'viniculture', 'tailoring'], regions: OPEN_REGIONS, farmingXp: 2240,
    resources: { wood: 80, stone: 60, wheat: 40, flour: 16, bread: 24, fish: 16, feed: 30, wool: 14, cloth: 8, clothing: 8, milk: 12, cheese: 8, honey: 8, grape: 16, wine: 8, vintage: 4, sugarcane: 8, sugar: 6, plank: 16, materials: 12 },
    streets: [
      [2, 4, 18, 4, 'gravel'], [2, 9, 18, 9, 'gravel'], [2, 15, 21, 15, 'stone'], [2, 19, 18, 19, 'dirt'],
      [4, 2, 4, 19, 'dirt'], [8, 2, 8, 19, 'gravel'], [12, 2, 12, 19, 'gravel'], [16, 2, 16, 19, 'dirt'],
      [26, 15, 40, 15, 'stone'], [26, 11, 40, 11, 'dirt'], [33, 6, 33, 20, 'gravel'],
      [5, 21, 5, 42, 'dirt'], [10, 21, 10, 42, 'dirt'], [15, 21, 15, 42, 'dirt'],
      [2, 24, 18, 24, 'dirt'], [2, 29, 18, 29, 'gravel'], [2, 33, 18, 33, 'stone'], [2, 38, 18, 38, 'gravel'],
      [26, 33, 40, 33, 'stone'], [26, 26, 40, 26, 'gravel'], [26, 38, 40, 38, 'dirt'],
      [28, 22, 28, 42, 'dirt'], [33, 22, 33, 42, 'gravel'], [38, 22, 38, 42, 'dirt'],
    ],
    placements: [
      // 河西：花窗农庄与林间小屋，围着小镇广场
      ...westBankHomes([
        ['farmhouse', 2], ['cottage'], ['homestead'], ['farmhouse'], ['cottage'], ['homestead'],
        ['cottage'], ['farmhouse'], ['cottage'], ['cottage'], ['rowhouse'], ['cottage'],
      ]),
      at('townhall', 6, 11, { level: 2 }), at('fountain', 5, 11), at('garden', 7, 11), at('bench', 6, 10), at('flowerarch', 6, 13), at('trellis', 7, 13),
      at('market', 10, 11), at('bakery', 10, 13, { progress: 0.55 }), at('teahouse', 11, 11), at('well', 9, 11), at('parasol', 9, 13), at('flowerbox', 11, 13),
      at('school', 14, 11), at('clinic', 14, 13), at('chapel', 15, 11), at('signflags', 13, 11), at('bench', 13, 13), at('archlights', 15, 13),
      ...row('farmhouse', 5, 16, 1, 0, 3), ...row('cottage', 9, 16, 1, 0, 3), ...row('rowhouse', 13, 16, 1, 0, 3),
      ...row('cottage', 5, 18, 1, 0, 3), ...row('farmhouse', 9, 18, 1, 0, 3), ...row('homestead', 13, 18, 1, 0, 3),
      at('oak', 2, 6), at('cherry', 2, 12), at('maple', 2, 17), at('cherry', 18, 6), at('willow', 18, 12),
      at('railing', 18, 14), at('boardwalk', 18, 16), at('dock', 18, 18),
      // 北岭：矿与炭窑供给酒窖和砖窑
      at('mine', 30, 8, { focus: 'copper', progress: 0.4 }), at('quarry', 27, 8, { level: 2 }), at('kiln', 29, 10, { progress: 0.5 }),
      at('firetower', 26, 7), at('guardpost', 34, 6), ...row('cottage', 35, 8, 1, 0, 3), ...row('pine', 35, 10, 1, 0, 4),
      at('crates', 28, 9), at('anvil', 31, 9), at('signflags', 34, 12), at('pine', 26, 19), at('bench', 36, 12),
      // 河东：乳品、纺织与酿酒的加工区
      at('feedmill', 27, 23, { progress: 0.6 }), at('cowbarn', 29, 23, { grown: true, progress: 0.35 }), at('dairy', 31, 23, { progress: 0.5 }),
      at('pasture', 34, 23, { grown: true, progress: 0.2 }), at('weaver', 36, 23, { progress: 0.44 }), at('tailor', 39, 23, { progress: 0.3 }),
      at('winery', 27, 25, { focus: 'wine', progress: 0.6 }), at('cellar', 29, 25, { progress: 0.25 }), at('winery', 31, 25, { focus: 'beer', progress: 0.15 }),
      at('tavern', 34, 25), at('apiary', 36, 25, { ready: true }), at('warehouse', 39, 25, { level: 2 }),
      at('sawmill', 27, 28, { progress: 0.5 }), at('lumber', 29, 28, { level: 2, progress: 0.6 }), at('warehouse', 31, 28),
      at('hopsfield', 34, 28, { progress: 0.4 }), at('hopsfield', 35, 28, { ready: true }), at('vineyard', 37, 28, { progress: 0.7 }),
      at('firetower', 26, 22), at('signflags', 31, 22), at('barrels', 26, 27), at('barrels', 30, 27), at('crates', 32, 27),
      ...row('cottage', 29, 31, 1, 0, 3), ...row('rowhouse', 34, 31, 1, 0, 3), at('well', 37, 31), at('bench', 40, 31), at('flowerbox', 41, 31),
      at('vineyard', 27, 35, { progress: 0.5 }), at('vineyard', 29, 35, { ready: true }), at('vineyard', 30, 35, { progress: 0.3 }),
      at('winery', 31, 35, { focus: 'wine', progress: 0.2 }), at('cellar', 34, 35, { progress: 0.6 }), at('warehouse', 36, 35),
      at('garden', 39, 35), at('trellis', 40, 35), at('oak', 26, 35), at('maple', 30, 37), at('cherry', 37, 37),
      at('guardpost', 39, 37), at('firetower', 26, 40), at('oak', 31, 40), at('willow', 36, 40),
      // 南岸：分块种植的田地、果园与糖田
      at('windmill', 12, 23, { level: 2 }), at('flowernursery', 6, 23, { ready: true }), at('orchardhouse', 16, 23, { ready: true }),
      ...fields(2, 25, ['wheat', 'wheat', 'carrot', 'corn', 'tomato', 'strawberry']),
      ...fields(6, 25, ['pumpkin', 'sunflower', 'wheat', 'carrot', 'corn', 'tomato']),
      ...fields(11, 25, ['strawberry', 'pumpkin', 'sunflower', 'wheat', 'wheat', 'carrot']),
      at('canefield', 17, 25, { progress: 0.5 }), at('canefield', 17, 26, { ready: true }), at('sugarmill', 16, 30, { progress: 0.3 }),
      at('fishery', 2, 31, { ready: true }), at('fishpond', 3, 31, { progress: 0.4 }), at('jamkitchen', 7, 31, { progress: 0.5 }),
      at('apiary', 11, 31, { progress: 0.2 }), at('garden', 13, 31), at('flowerarch', 14, 31), at('parasol', 12, 32),
      ...fields(2, 34, ['apple', 'grape', 'sunflower', 'pumpkin', 'tomato', 'strawberry']),
      ...fields(6, 34, ['corn', 'carrot', 'wheat', 'apple', 'grape', 'sunflower']),
      at('chickencoop', 11, 34, { grown: true }), at('pasture', 12, 34, { grown: true, progress: 0.5 }), at('pigfarm', 13, 34, { grown: true, progress: 0.25 }),
      at('hunterlodge', 16, 34), at('herbgarden', 17, 34, { ready: true }), at('orchardhouse', 11, 37, { progress: 0.6 }),
      at('oak', 2, 30), at('cherry', 4, 32), at('maple', 2, 40), at('oak', 7, 40), at('willow', 16, 40), at('dock', 17, 42),
      at('bench', 8, 31), at('crates', 14, 34), at('barrels', 14, 36),
      ...row('farmhouse', 2, 42, 1, 0, 3), ...row('cottage', 11, 42, 1, 0, 3),
    ],
  };
}

/**
 * 商路枢纽：集市、码头、酒馆、剧院与动物园。四条商路在这里交汇，
 * 城墙围出的商栈区与镇外的动物园是这张图的两个中心。
 */
function crossroads(): MapPreset {
  return {
    id: 'crossroads',
    name: '商路枢纽',
    tagline: '集市、码头与动物园',
    description: '旅行者集市守着北桥，河湾码头通向四座小岛，晚风酒馆与星幕小剧院点亮夜晚；镇外的青岚动物园住着四群动物。适合商队、收藏与每周挑战的长线玩法。',
    welcome: '欢迎来到青岚小镇。集市开张、码头通航，商队正在路上。',
    season: 'winter', level: 14, coins: 22000, prestige: 90, xp: 1800, taxRate: 2, population: 70,
    researched: ['husbandry', 'mining', 'metallurgy', 'tailoring', 'viniculture', 'civics', 'efficiency', 'logistics'],
    regions: OPEN_REGIONS, farmingXp: 480,
    resources: { wood: 160, stone: 130, materials: 90, bread: 60, fish: 40, wheat: 60, flour: 24, plank: 60, tools: 20, clothing: 20, cheese: 16, honey: 16, wine: 20, beer: 16, vintage: 8, sausages: 12, souvenir: 12, feed: 40, sugar: 10 },
    streets: [
      [2, 4, 18, 4, 'stone'], [2, 9, 18, 9, 'stone'], [2, 15, 21, 15, 'stone'], [2, 19, 18, 19, 'gravel'],
      [4, 2, 4, 19, 'gravel'], [8, 2, 8, 19, 'stone'], [12, 2, 12, 19, 'stone'], [16, 2, 16, 19, 'gravel'],
      [26, 15, 42, 15, 'stone'], [26, 11, 42, 11, 'stone'], [26, 20, 42, 20, 'gravel'], [33, 6, 33, 20, 'stone'],
      [26, 26, 42, 26, 'stone'], [26, 31, 42, 31, 'gravel'], [26, 36, 42, 36, 'gravel'],
      [28, 22, 28, 42, 'gravel'], [33, 22, 33, 42, 'stone'], [38, 22, 38, 42, 'gravel'],
      [2, 24, 18, 24, 'gravel'], [2, 33, 18, 33, 'stone'], [5, 21, 5, 42, 'gravel'], [10, 21, 10, 42, 'gravel'], [15, 21, 15, 42, 'gravel'],
      // 镇外通往动物园的专线：入口街、进园小路与园内横路，正落在东部缓坡的中心
      [48, 26, 58, 26, 'stone'], [52, 22, 52, 26, 'gravel'], [48, 37, 58, 37, 'dirt'],
    ],
    placements: [
      // 西岸：商栈街区，联排屋与公寓围着教堂和剧院
      ...westBankHomes([
        ['rowhouse', 2], ['apartment'], ['rowhouse'], ['rowhouse'], ['apartment'], ['rowhouse'],
        ['rowhouse'], ['cottage'], ['rowhouse'], ['cottage'], ['homestead'], ['cottage'],
      ]),
      at('townhall', 6, 11, { level: 3 }), at('fountain', 5, 11), at('garden', 7, 11), at('signflags', 6, 10), at('bench', 5, 13), at('archlights', 7, 13),
      at('theatre', 10, 11, { level: 2 }), at('chapel', 11, 13), at('school', 9, 13, { level: 2 }), at('clinic', 10, 13, { level: 2 }),
      at('flowerbox', 9, 11), at('trellis', 11, 11), at('parasol', 9, 12), at('bench', 13, 10),
      at('tavern', 14, 11, { level: 2 }), at('teahouse', 15, 11), at('market', 14, 13), at('bakery', 15, 13, { progress: 0.5 }),
      at('signflags', 13, 11), at('barrels', 13, 13), at('flowerbox', 17, 12),
      ...row('rowhouse', 5, 16, 1, 0, 3), ...row('rowhouse', 9, 16, 1, 0, 3, { level: 2 }), ...row('apartment', 13, 16, 1, 0, 3),
      ...row('cottage', 5, 18, 1, 0, 3), ...row('rowhouse', 9, 18, 1, 0, 3), ...row('rowhouse', 13, 18, 1, 0, 3),
      at('oak', 2, 6), at('cherry', 2, 11), at('maple', 2, 17), at('cherry', 18, 6),
      at('boardwalk', 18, 12), at('railing', 18, 13), at('dock', 18, 14), at('willow', 18, 17), at('boardwalk', 18, 18), at('oak', 18, 8),
      // 北岭：矿与窑火，供给商队的货物
      at('mine', 30, 8, { focus: 'gold', progress: 0.45 }), at('mine', 32, 8, { focus: 'silver', progress: 0.2 }), at('quarry', 27, 8, { level: 3, ready: true }),
      at('kiln', 29, 10, { progress: 0.6 }), at('smelter', 31, 10, { progress: 0.3 }), at('firetower', 26, 7), at('guardpost', 34, 6),
      ...row('cottage', 35, 8, 1, 0, 3), ...row('pine', 35, 10, 1, 0, 4), at('crates', 28, 9), at('anvil', 30, 9), at('signflags', 34, 12),
      // 河东：集市、码头与仓储，城墙围出商栈区
      at('market', 27, 23, { level: 2 }), at('harbor', 29, 23), at('warehouse', 31, 23, { level: 3 }),
      at('warehouse', 35, 23, { level: 3 }), at('warehouse', 36, 23, { level: 2 }), at('warehouse', 37, 23, { level: 2 }),
      at('firestation', 39, 23), at('barracks', 41, 23),
      at('smithy', 27, 25, { focus: 'tnt', progress: 0.5 }), at('sawmill', 29, 25, { progress: 0.4 }), at('tailor', 31, 25, { progress: 0.35 }),
      at('winery', 34, 25, { focus: 'beer', progress: 0.55 }), at('butcher', 35, 25, { progress: 0.4 }), at('dairy', 36, 25, { progress: 0.3 }),
      at('guardpost', 39, 25), at('castle', 41, 25),
      ...row('wall', 26, 28, 1, 0, 2), at('citygate', 29, 28), ...row('wall', 30, 28, 1, 0, 3), ...row('wall', 34, 28, 1, 0, 4),
      at('citygate', 39, 28), ...row('wall', 40, 28, 1, 0, 3),
      at('signflags', 27, 30), at('crates', 26, 30), at('barrels', 30, 30), at('anvil', 32, 30), at('barrels', 35, 30), at('anvil', 37, 30), at('crates', 40, 30),
      ...row('rowhouse', 29, 33, 1, 0, 3), ...row('cottage', 34, 33, 1, 0, 3), at('well', 37, 33), at('bench', 40, 33), at('flowerbox', 41, 33),
      at('warehouse', 27, 35), at('warehouse', 26, 37), at('guardpost', 34, 35), at('firetower', 39, 35),
      at('oak', 26, 39), at('pine', 30, 39), at('maple', 35, 39), at('oak', 39, 39),
      at('warehouse', 27, 40), at('crates', 29, 40), at('barrels', 31, 40), at('signflags', 34, 40),
      // 镇外东部：青岚动物园，大门 → 四个展区 → 纪念品铺
      at('zoogate', 52, 28), at('zooenclosure', 49, 30, { focus: 'zebra', progress: 0.5 }), at('zooenclosure', 52, 30, { focus: 'giraffe', progress: 0.3 }),
      at('zooenclosure', 55, 30, { focus: 'elephant', progress: 0.6 }), at('zooenclosure', 58, 30, { focus: 'lion', progress: 0.2 }),
      at('zooshop', 52, 33), at('garden', 49, 27), at('garden', 55, 27), at('fountain', 54, 27), at('bench', 50, 33), at('bench', 54, 33),
      at('signflags', 52, 35), at('oak', 48, 31), at('cherry', 57, 31), at('maple', 59, 31), at('parasol', 56, 27), at('flowerbox', 48, 27),
      // 南岸：粮田、牧场与果园供养商队
      at('windmill', 12, 23, { level: 2 }), at('flowernursery', 6, 23, { ready: true }), at('bakery', 3, 23, { progress: 0.4 }),
      ...fields(6, 25, ['wheat', 'wheat', 'carrot', 'corn', 'tomato', 'wheat']),
      ...fields(11, 25, ['wheat', 'carrot', 'strawberry', 'wheat', 'wheat', 'corn']),
      at('sugarmill', 16, 25, { progress: 0.5 }), at('canefield', 17, 26, { ready: true }), at('fishery', 16, 31, { ready: true }),
      at('cowbarn', 6, 35, { grown: true, progress: 0.4 }), at('dairy', 7, 35, { progress: 0.45 }), at('pasture', 9, 35, { grown: true, progress: 0.2 }),
      at('chickencoop', 12, 35, { grown: true }), at('pigfarm', 13, 35, { grown: true, progress: 0.35 }), at('apiary', 16, 35, { ready: true }),
      at('orchardhouse', 6, 40, { ready: true }), at('jamkitchen', 7, 40, { progress: 0.5 }), at('herbgarden', 4, 40), at('hunterlodge', 3, 31),
      at('garden', 11, 31), at('trellis', 12, 31), at('oak', 2, 22), at('cherry', 4, 23), at('maple', 2, 38), at('willow', 17, 40),
      at('bench', 8, 31), at('parasol', 9, 31), at('crates', 13, 31), at('barrels', 14, 32),
      ...row('farmhouse', 2, 42, 1, 0, 3), ...row('cottage', 11, 42, 1, 0, 3),
    ],
  };
}

/**
 * 从零起步：最早那张小开局图——一小片空地、几间起步小屋与一段自动连上的土路。
 * 它是模拟测试的基线地图，也是给想自己规划的玩家留的空图纸。
 */
function frontier(): MapPreset {
  return {
    id: 'frontier',
    name: '从零起步',
    tagline: '一小片空地，自己规划',
    description: '只有议事厅、几间小屋、一块麦田与一间磨坊的最小开局，道路随建筑自动连接。想从一张白纸开始规划整个河谷，就用这张图。',
    welcome: '欢迎来到青岚小镇。麦田已经成熟，新的故事正等你开始。',
    season: 'spring', level: 3, coins: 2800, prestige: 6, xp: 80, taxRate: 1, population: 13,
    researched: [], regions: [], farmingXp: 0,
    resources: { wood: 42, stone: 25, wheat: 24, flour: 12, bread: 10, fish: 20, plank: 12, materials: 10 },
    streets: [],
    placements: [
      at('townhall', 8, 7), at('cottage', 6, 6), at('cottage', 10, 6), at('cottage', 11, 8),
      at('windmill', 5, 10), at('bakery', 7, 11), at('warehouse', 10, 10), at('market', 8, 9),
      at('well', 9, 6), at('lumber', 4, 6, { ready: true }), at('fishery', 12, 12, { ready: true }), at('quarry', 4, 4),
      // 面包要砂糖，所以开局必须能熬出糖：少了这两座，面包房就再也烤不动了。
      at('canefield', 2, 10), at('sugarmill', 2, 12),
      at('garden', 11, 5),
      at('farm', 4, 9, { ready: true }), at('farm', 4, 10), at('farm', 4, 11),
      at('farm', 3, 9), at('farm', 3, 10), at('farm', 3, 11),
    ],
  };
}

export type MapPresetId = 'riverbend' | 'milltown' | 'pastoral' | 'crossroads' | 'frontier';
export const MAP_PRESETS: Record<MapPresetId, MapPreset> = {
  riverbend: riverbend(),
  milltown: milltown(),
  pastoral: pastoral(),
  crossroads: crossroads(),
  frontier: frontier(),
};
export const MAP_PRESET_IDS = Object.keys(MAP_PRESETS) as MapPresetId[];
/** The map a brand-new town is founded on, and the one the picker opens on. */
export const DEFAULT_MAP_PRESET: MapPresetId = 'riverbend';

/**
 * Every job a preset's workshops offer, and the beds and community seats its buildings give.
 * The preset's population is checked against all three: nobody without a job, nobody without a
 * bed, and no more residents than the town's services can look after.
 */
export function presetCensus(preset: MapPreset): { jobs: number; beds: number; community: number; warehouses: number } {
  let jobs = 0, beds = 0, community = 0, warehouses = 0;
  for (const placement of preset.placements) {
    const definition = BUILDINGS[placement.kind];
    const level = placement.level ?? 1;
    jobs += definition.workers ?? 0;
    beds += (definition.housing ?? 0) * level;
    community += (definition.populationCap ?? 0) * level;
    if (placement.kind === 'warehouse') warehouses += level;
  }
  return { jobs, beds, community, warehouses };
}
