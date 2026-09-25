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
 * 排布约定（与各图的街网一一对应，建筑按 `footprint` 整块占地落位、互不相压）：
 * - 街网：西岸纵街 x=2/7/12/17、横街 y=5/10/15/20 与 25/30/33/38；东岸纵街 x=26/31/36/41、横街对称。
 *   y=15 与 y=33 是跨桥主街，直通两座桥面。
 * - 街区是街与街之间 4×4 的地块：`block([...4 种], x, y)` 在它的四个角各放一座 2×2 建筑
 *   （锚点即西北角），四家各占自己的院落；`row(kind, x, y, 2, 0, n)` 沿街排一行。
 * - 3×3 的地标（议事厅、城堡、剧院、河湾码头）独占一个街区，四角留给喷泉、长椅与招牌。
 * - 装饰与农田是 1×1，填在街区边角、两岸空地（西岸 x=1/18、东岸 x=42）与田块里。
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
  /**
   * Every building stands on one tile, whatever its kind claims today. Only 从零起步 sets
   * this: it is the compact hamlet every simulation test is written against, and the paper a
   * player plans the valley on themselves.
   */
  compact?: boolean;
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
/** Four buildings on a block's corners: every one of them stands on its own four tiles. */
const block = (kinds: [kind: BuildingKind, extra?: Partial<Omit<MapPlacement, 'kind' | 'x' | 'y'>>][], x: number, y: number): MapPlacement[] =>
  kinds.slice(0, 4).map(([kind, extra], index) => at(kind, x + (index % 2) * 2, y + Math.floor(index / 2) * 2, extra ?? {}));
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
    description: '议事厅广场、临街住宅、南岸田地、河东工坊与北岭矿场都已经安排好：主街跨过两座桥，每座建筑都带着自己的院落，居民一开局就在街上走。想改布局，随时可以搬迁任何一座建筑。',
    welcome: '欢迎来到青岚小镇。河两岸的街区、道路与田地都已经规划好，新的故事正等你开始。',
    season: 'spring', level: 8, coins: 6800, prestige: 26, xp: 560, taxRate: 1, population: 54,
    researched: ['husbandry', 'mining'], regions: OPEN_REGIONS, farmingXp: 240,
    resources: { wood: 120, stone: 80, wheat: 40, flour: 20, bread: 30, fish: 20, plank: 30, materials: 15, feed: 15, sugarcane: 10, sugar: 6, ore: 8, charcoal: 6 },
    streets: [
      // 西岸：纵街 x=2/7/12/17，横街 y=5/10/15/20 与 25/30/33/38，主街 y=15 与 y=33 直通两座桥
      [2, 2, 2, 42, 'dirt'], [7, 2, 7, 42, 'gravel'], [12, 2, 12, 42, 'gravel'], [17, 2, 17, 42, 'dirt'],
      [2, 5, 18, 5, 'gravel'], [2, 10, 18, 10, 'gravel'], [2, 15, 21, 15, 'stone'], [2, 20, 18, 20, 'dirt'],
      [2, 25, 18, 25, 'dirt'], [2, 30, 18, 30, 'dirt'], [2, 33, 18, 33, 'stone'], [2, 38, 18, 38, 'dirt'],
      // 东岸：纵街 x=26/31/36/41，横街对称，桥面在 y=15 与 y=33 接上
      [26, 6, 26, 42, 'dirt'], [31, 6, 31, 42, 'gravel'], [36, 6, 36, 42, 'gravel'], [41, 6, 41, 42, 'dirt'],
      [26, 6, 42, 6, 'dirt'], [26, 11, 42, 11, 'dirt'], [26, 15, 41, 15, 'stone'], [26, 20, 42, 20, 'dirt'],
      [26, 25, 42, 25, 'gravel'], [26, 30, 42, 30, 'dirt'], [26, 33, 40, 33, 'stone'], [26, 38, 42, 38, 'dirt'],
    ],
    placements: [
      // —— 河西居民区：住宅街区、议事厅广场与市集 ——
      ...block([['cottage', { level: 2 }], ['cottage'], ['rowhouse'], ['cottage']], 3, 6),
      ...block([['cottage'], ['farmhouse'], ['cottage'], ['cottage']], 8, 6),
      ...block([['rowhouse'], ['rowhouse', { level: 2 }], ['cottage'], ['cottage']], 13, 6),
      ...block([['school'], ['clinic'], ['well'], ['teahouse']], 3, 11),
      at('townhall', 8, 11, { level: 2 }), at('fountain', 11, 11), at('garden', 11, 13), at('bench', 11, 14), at('signflags', 8, 14), at('archlights', 11, 12),
      ...block([['market'], ['bakery', { progress: 0.52 }], ['warehouse'], ['cottage']], 13, 11),
      ...block([['rowhouse'], ['cottage'], ['cottage'], ['cottage']], 3, 16),
      ...block([['apartment'], ['cottage'], ['rowhouse'], ['cottage']], 8, 16),
      ...block([['cottage'], ['cottage'], ['rowhouse'], ['rowhouse']], 13, 16),
      at('cherry', 18, 4), at('willow', 18, 8), at('boardwalk', 18, 11), at('railing', 18, 12), at('flowerbox', 18, 16), at('dock', 18, 17),
      at('oak', 1, 6), at('maple', 1, 11), at('parasol', 1, 14), at('cherry', 1, 17), at('bench', 1, 20), at('well', 18, 22),
      at('signflags', 1, 25), at('bench', 18, 27), at('crates', 1, 30), at('barrels', 18, 32), at('flowerarch', 1, 38), at('parasol', 18, 40),
      // —— 北岭矿区：矿井、采石场与窑火 ——
      ...block([['quarry', { level: 2, progress: 0.4 }], ['mine', { focus: 'copper', progress: 0.62 }], ['kiln', { progress: 0.3 }], ['firetower']], 27, 7),
      ...block([['cottage'], ['cottage'], ['guardpost'], ['crates']], 32, 7),
      ...block([['pine'], ['pine'], ['anvil'], ['signflags']], 37, 7),
      ...row('cottage', 27, 12, 2, 0, 2), ...row('pine', 32, 12, 2, 0, 2), ...row('bench', 37, 12, 2, 0, 2),
      ...block([['pine'], ['cottage'], ['oak'], ['pine']], 27, 16),
      ...block([['cottage'], ['cottage'], ['oak'], ['bench']], 32, 16),
      ...block([['pine'], ['pine'], ['signflags'], ['flowerbox']], 37, 16),
      at('guardpost', 42, 22), at('pine', 42, 24),
      // —— 河东：工坊、仓储与防线 ——
      ...block([['lumber', { level: 2, progress: 0.55 }], ['sawmill', { progress: 0.34 }], ['forester', { ready: true }], ['brickworks', { progress: 0.2 }]], 27, 21),
      ...block([['warehouse', { level: 2 }], ['warehouse'], ['hunterlodge', { ready: true }], ['herbgarden', { progress: 0.6 }]], 32, 21),
      ...block([['cottage'], ['rowhouse'], ['firetower'], ['guardpost']], 37, 21),
      ...block([['cottage'], ['cottage'], ['crates'], ['barrels']], 27, 26),
      ...block([['anvil'], ['signflags'], ['cottage'], ['cottage']], 32, 26),
      ...block([['warehouse'], ['cottage'], ['bench'], ['flowerbox']], 37, 26),
      ...row('cottage', 27, 31, 2, 0, 2),
      ...row('wall', 32, 31, 1, 0, 3), at('citygate', 35, 31), ...row('wall', 37, 31, 1, 0, 3), at('citygate', 40, 31),
      ...block([['cottage'], ['cottage'], ['oak'], ['cherry']], 27, 34),
      ...block([['oak'], ['maple'], ['bench'], ['flowerbox']], 32, 34),
      ...block([['cottage'], ['cottage'], ['pine'], ['oak']], 37, 34),
      ...block([['cottage'], ['cottage'], ['oak'], ['signflags']], 27, 39),
      ...block([['oak'], ['pine'], ['bench'], ['parasol']], 32, 39),
      ...block([['cottage'], ['cottage'], ['maple'], ['oak']], 37, 39),
      at('barrels', 42, 31), at('crates', 42, 32), at('signflags', 42, 42),
      at('barrels', 42, 27), at('crates', 42, 29),
      // —— 南岸农业区：田地、风车、果园与牧场 ——
      ...block([['windmill', { level: 2 }], ['flowernursery', { ready: true }], ['garden'], ['trellis']], 3, 26),
      ...block([['sugarmill', { progress: 0.45 }], ['canefield', { ready: true }], ['canefield', { progress: 0.5 }], ['fishery', { ready: true }]], 8, 26),
      ...block([['orchardhouse', { ready: true }], ['jamkitchen', { progress: 0.6 }], ['fishpond', { progress: 0.28 }], ['bench']], 13, 26),
      at('farm', 3, 21, { crop: 'wheat' }), at('farm', 4, 21, { crop: 'carrot' }), at('farm', 5, 21, { crop: 'wheat' }), at('farm', 6, 21, { crop: 'corn' }),
      at('farm', 3, 22, { crop: 'wheat' }), at('farm', 4, 22, { crop: 'wheat' }), at('farm', 5, 22, { crop: 'carrot' }), at('farm', 6, 22, { crop: 'wheat' }),
      at('farm', 8, 21, { crop: 'wheat' }), at('farm', 9, 21, { crop: 'corn' }), at('farm', 10, 21, { crop: 'wheat' }), at('farm', 11, 21, { crop: 'carrot' }),
      at('farm', 8, 22, { crop: 'wheat' }), at('farm', 9, 22, { crop: 'wheat' }), at('farm', 10, 22, { crop: 'corn' }), at('farm', 11, 22, { crop: 'wheat' }),
      at('farm', 13, 21, { crop: 'wheat' }), at('farm', 14, 21, { crop: 'carrot' }), at('farm', 15, 21, { crop: 'wheat' }), at('farm', 16, 21, { crop: 'wheat' }),
      at('farm', 13, 22, { crop: 'corn' }), at('farm', 14, 22, { crop: 'wheat' }), at('farm', 15, 22, { crop: 'wheat' }), at('farm', 16, 22, { crop: 'carrot' }),
      ...row('chickencoop', 3, 31, 2, 0, 2), ...row('pasture', 8, 31, 2, 0, 2), ...row('feedmill', 13, 31, 2, 0, 2),
      ...block([['farmhouse'], ['cottage'], ['oak'], ['maple']], 3, 34),
      ...block([['hunterlodge'], ['herbgarden', { ready: true }], ['oak'], ['flowerarch']], 8, 34),
      ...block([['cottage'], ['cottage'], ['willow'], ['bench']], 13, 34),
      ...block([['cottage'], ['farmhouse'], ['maple'], ['oak']], 3, 39),
      ...block([['oak'], ['cherry'], ['bench'], ['parasol']], 8, 39),
      ...block([['cottage'], ['cottage'], ['garden'], ['flowerarch']], 13, 39),
      at('dock', 18, 34), at('willow', 18, 39),
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
    description: '矿石进炉、锭铁进铺、羊毛进织机：一条完整的工业链从北岭一路排到河东，城墙与兵营守住工坊广场。每座工坊都带着自己的院落，适合研究精工与纺织的长线玩法。',
    welcome: '欢迎来到青岚小镇。炉火已经生起，工坊广场正等着开工。',
    season: 'summer', level: 12, coins: 14000, prestige: 68, xp: 1400, taxRate: 2, population: 74,
    researched: ['husbandry', 'mining', 'metallurgy', 'tailoring', 'civics'], regions: OPEN_REGIONS, farmingXp: 240,
    resources: { wood: 140, stone: 120, ore: 50, charcoal: 30, ingot: 10, tools: 12, plank: 60, materials: 40, cloth: 16, clothing: 12, wool: 20, feed: 30, wheat: 60, flour: 24, bread: 30, fish: 24 },
    streets: [
      // 西岸：纵街 x=2/7/12/17，横街 y=5/10/15/20 与 25/30/33/38，主街 y=15 与 y=33 直通两座桥
      [2, 2, 2, 42, 'gravel'], [7, 2, 7, 42, 'stone'], [12, 2, 12, 42, 'stone'], [17, 2, 17, 42, 'gravel'],
      [2, 5, 18, 5, 'stone'], [2, 10, 18, 10, 'stone'], [2, 15, 21, 15, 'stone'], [2, 20, 18, 20, 'gravel'],
      [2, 25, 18, 25, 'gravel'], [2, 30, 18, 30, 'gravel'], [2, 33, 18, 33, 'stone'], [2, 38, 18, 38, 'gravel'],
      // 东岸：纵街 x=26/31/36/41，横街对称，桥面在 y=15 与 y=33 接上
      [26, 6, 26, 42, 'gravel'], [31, 6, 31, 42, 'stone'], [36, 6, 36, 42, 'stone'], [41, 6, 41, 42, 'gravel'],
      [26, 6, 42, 6, 'gravel'], [26, 11, 42, 11, 'gravel'], [26, 15, 41, 15, 'stone'], [26, 20, 42, 20, 'gravel'],
      [26, 25, 42, 25, 'stone'], [26, 30, 42, 30, 'gravel'], [26, 33, 40, 33, 'stone'], [26, 38, 42, 38, 'gravel'],
    ],
    placements: [
      // —— 河西：联排屋与公寓，广场、学堂、诊所、教堂与剧院 ——
      ...block([['rowhouse', { level: 2 }], ['rowhouse'], ['apartment'], ['apartment']], 3, 6),
      ...block([['rowhouse'], ['rowhouse', { level: 2 }], ['apartment'], ['cottage']], 8, 6),
      ...block([['rowhouse'], ['rowhouse'], ['cottage'], ['cottage']], 13, 6),
      ...block([['school', { level: 2 }], ['clinic', { level: 2 }], ['chapel'], ['teahouse']], 3, 11),
      at('townhall', 8, 11, { level: 3 }), at('fountain', 11, 11), at('garden', 11, 13), at('bench', 11, 14), at('signflags', 8, 14), at('archlights', 11, 12),
      at('theatre', 13, 11, { level: 2 }), at('fountain', 16, 11), at('garden', 16, 13), at('bench', 16, 14), at('signflags', 13, 14), at('trellis', 16, 12),
      ...block([['rowhouse', { level: 2 }], ['rowhouse'], ['apartment'], ['cottage']], 3, 16),
      ...block([['market'], ['bakery', { progress: 0.6 }], ['warehouse'], ['cottage']], 8, 16),
      ...block([['rowhouse'], ['rowhouse'], ['cottage'], ['cottage']], 13, 16),
      at('cherry', 18, 4), at('willow', 18, 8), at('boardwalk', 18, 11), at('railing', 18, 12), at('flowerbox', 18, 16), at('dock', 18, 17),
      at('oak', 1, 6), at('maple', 1, 11), at('parasol', 1, 14), at('cherry', 1, 17), at('bench', 1, 20), at('well', 18, 22),
      at('signflags', 1, 25), at('bench', 18, 27), at('crates', 1, 30), at('barrels', 18, 32), at('flowerarch', 1, 38), at('parasol', 18, 40),
      at('dock', 18, 34), at('willow', 18, 39),
      // —— 北岭矿区 ——
      ...block([['mine', { focus: 'silver', progress: 0.5 }], ['mine', { focus: 'copper', progress: 0.2 }], ['quarry', { level: 3, ready: true }], ['kiln', { progress: 0.66 }]], 27, 7),
      ...block([['kiln', { ready: true }], ['firetower'], ['guardpost'], ['crates']], 32, 7),
      ...block([['cottage'], ['cottage'], ['anvil'], ['signflags']], 37, 7),
      ...row('cottage', 27, 12, 2, 0, 2), ...row('pine', 32, 12, 2, 0, 2), ...row('bench', 37, 12, 2, 0, 2),
      ...block([['pine'], ['cottage'], ['oak'], ['pine']], 27, 16),
      ...block([['cottage'], ['cottage'], ['oak'], ['bench']], 32, 16),
      ...block([['pine'], ['pine'], ['signflags'], ['flowerbox']], 37, 16),
      at('guardpost', 42, 22), at('pine', 42, 24),
      // —— 河东：工坊、仓储与防线 ——
      ...block([['smelter', { progress: 0.62 }], ['smithy', { focus: 'pickaxe', progress: 0.35 }], ['sawmill', { progress: 0.5 }], ['brickworks', { progress: 0.25 }]], 27, 21),
      ...block([['weaver', { progress: 0.48 }], ['tailor', { progress: 0.3 }], ['feedmill', { ready: true }], ['warehouse', { level: 3 }]], 32, 21),
      ...block([['firestation'], ['barracks'], ['guardpost'], ['warehouse', { level: 2 }]], 37, 21),
      ...block([['pasture', { grown: true, progress: 0.4 }], ['lumber', { level: 2, progress: 0.7 }], ['forester', { progress: 0.3 }], ['smelter', { progress: 0.15 }]], 27, 26),
      ...block([['smithy', { focus: 'dynamite', progress: 0.55 }], ['warehouse', { level: 2 }], ['crates'], ['barrels']], 32, 26),
      ...block([['anvil'], ['signflags'], ['cottage'], ['cottage']], 37, 26),
      ...row('cottage', 27, 31, 2, 0, 2),
      ...row('wall', 32, 31, 1, 0, 3), at('citygate', 35, 31), ...row('wall', 37, 31, 1, 0, 3), at('citygate', 40, 31),
      ...block([['cottage'], ['cottage'], ['oak'], ['cherry']], 27, 34),
      ...block([['oak'], ['maple'], ['bench'], ['flowerbox']], 32, 34),
      ...block([['cottage'], ['cottage'], ['pine'], ['oak']], 37, 34),
      ...block([['cottage'], ['cottage'], ['oak'], ['signflags']], 27, 39),
      ...block([['oak'], ['pine'], ['bench'], ['parasol']], 32, 39),
      ...block([['cottage'], ['cottage'], ['maple'], ['oak']], 37, 39),
      at('barrels', 42, 31), at('crates', 42, 32), at('signflags', 42, 42),
      // —— 南岸农业区 ——
      ...block([['windmill', { level: 2 }], ['flowernursery', { ready: true }], ['garden'], ['trellis']], 3, 26),
      ...block([['sugarmill', { progress: 0.4 }], ['canefield', { ready: true }], ['fishery', { ready: true }], ['fishpond', { progress: 0.3 }]], 8, 26),
      ...block([['cowbarn', { grown: true, progress: 0.4 }], ['dairy', { progress: 0.5 }], ['pasture', { grown: true, progress: 0.2 }], ['chickencoop', { grown: true }]], 13, 26),
      at('farm', 3, 21, { crop: 'wheat' }), at('farm', 4, 21, { crop: 'carrot' }), at('farm', 5, 21, { crop: 'wheat' }), at('farm', 6, 21, { crop: 'corn' }),
      at('farm', 3, 22, { crop: 'wheat' }), at('farm', 4, 22, { crop: 'wheat' }), at('farm', 5, 22, { crop: 'carrot' }), at('farm', 6, 22, { crop: 'wheat' }),
      at('farm', 8, 21, { crop: 'wheat' }), at('farm', 9, 21, { crop: 'corn' }), at('farm', 10, 21, { crop: 'wheat' }), at('farm', 11, 21, { crop: 'carrot' }),
      at('farm', 8, 22, { crop: 'wheat' }), at('farm', 9, 22, { crop: 'wheat' }), at('farm', 10, 22, { crop: 'corn' }), at('farm', 11, 22, { crop: 'wheat' }),
      at('farm', 13, 21, { crop: 'wheat' }), at('farm', 14, 21, { crop: 'carrot' }), at('farm', 15, 21, { crop: 'wheat' }), at('farm', 16, 21, { crop: 'wheat' }),
      at('farm', 13, 22, { crop: 'corn' }), at('farm', 14, 22, { crop: 'wheat' }), at('farm', 15, 22, { crop: 'wheat' }), at('farm', 16, 22, { crop: 'carrot' }),
      ...row('pigfarm', 3, 31, 2, 0, 2), ...row('butcher', 8, 31, 2, 0, 2), ...row('herbgarden', 13, 31, 2, 0, 2),
      ...block([['farmhouse'], ['cottage'], ['oak'], ['maple']], 3, 34),
      ...block([['orchardhouse', { ready: true }], ['jamkitchen', { progress: 0.5 }], ['oak'], ['flowerarch']], 8, 34),
      ...block([['cottage'], ['cottage'], ['willow'], ['bench']], 13, 34),
      ...block([['cottage'], ['farmhouse'], ['maple'], ['oak']], 3, 39),
      ...block([['oak'], ['cherry'], ['bench'], ['parasol']], 8, 39),
      ...block([['cottage'], ['cottage'], ['garden'], ['flowerarch']], 13, 39),
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
    description: '九种作物分块种在南岸，葡萄园沿坡排开，酿酒坊与酒窖一前一后；牧场、牛舍、蜂场围着饲料坊。加工链从麦田一路走到陈年佳酿，每座建筑都留着自己的院子。',
    welcome: '欢迎来到青岚小镇。田里的庄稼正在熟，葡萄园的架子已经搭好。',
    season: 'autumn', level: 11, coins: 11000, prestige: 52, xp: 1100, taxRate: 1, population: 62,
    researched: ['husbandry', 'mining', 'viniculture', 'tailoring'], regions: OPEN_REGIONS, farmingXp: 2240,
    resources: { wood: 80, stone: 60, wheat: 40, flour: 16, bread: 24, fish: 16, feed: 30, wool: 14, cloth: 8, clothing: 8, milk: 12, cheese: 8, honey: 8, grape: 16, wine: 8, vintage: 4, sugarcane: 8, sugar: 6, plank: 16, materials: 12 },
    streets: [
      // 西岸：纵街 x=2/7/12/17，横街 y=5/10/15/20 与 25/30/33/38，主街 y=15 与 y=33 直通两座桥
      [2, 2, 2, 42, 'dirt'], [7, 2, 7, 42, 'gravel'], [12, 2, 12, 42, 'gravel'], [17, 2, 17, 42, 'dirt'],
      [2, 5, 18, 5, 'gravel'], [2, 10, 18, 10, 'gravel'], [2, 15, 21, 15, 'stone'], [2, 20, 18, 20, 'dirt'],
      [2, 25, 18, 25, 'dirt'], [2, 30, 18, 30, 'gravel'], [2, 33, 18, 33, 'stone'], [2, 38, 18, 38, 'gravel'],
      // 东岸：纵街 x=26/31/36/41，横街对称，桥面在 y=15 与 y=33 接上
      [26, 6, 26, 42, 'dirt'], [31, 6, 31, 42, 'gravel'], [36, 6, 36, 42, 'gravel'], [41, 6, 41, 42, 'dirt'],
      [26, 6, 42, 6, 'dirt'], [26, 11, 42, 11, 'dirt'], [26, 15, 41, 15, 'stone'], [26, 20, 42, 20, 'dirt'],
      [26, 25, 42, 25, 'gravel'], [26, 30, 42, 30, 'gravel'], [26, 33, 40, 33, 'stone'], [26, 38, 42, 38, 'gravel'],
    ],
    placements: [
      // —— 河西：花窗农庄与林间小屋围着小镇广场 ——
      ...block([['farmhouse', { level: 2 }], ['farmhouse'], ['homestead'], ['homestead']], 3, 6),
      ...block([['cottage'], ['cottage'], ['farmhouse'], ['homestead']], 8, 6),
      ...block([['cottage'], ['farmhouse'], ['cottage'], ['cottage']], 13, 6),
      ...block([['market'], ['bakery', { progress: 0.55 }], ['teahouse'], ['well']], 3, 11),
      at('townhall', 8, 11, { level: 2 }), at('fountain', 11, 11), at('garden', 11, 13), at('bench', 11, 14), at('signflags', 8, 14), at('flowerarch', 11, 12),
      ...block([['school'], ['clinic'], ['chapel'], ['trellis']], 13, 11),
      ...block([['farmhouse'], ['cottage'], ['rowhouse'], ['cottage']], 3, 16),
      ...block([['cottage'], ['farmhouse'], ['cottage'], ['cottage']], 8, 16),
      ...block([['homestead'], ['cottage'], ['cottage'], ['cottage']], 13, 16),
      at('cherry', 18, 4), at('willow', 18, 8), at('boardwalk', 18, 11), at('railing', 18, 12), at('flowerbox', 18, 16), at('dock', 18, 17),
      at('oak', 1, 6), at('maple', 1, 11), at('parasol', 1, 14), at('cherry', 1, 17), at('bench', 1, 20), at('well', 18, 22),
      at('signflags', 1, 25), at('bench', 18, 27), at('crates', 1, 30), at('barrels', 18, 32), at('flowerarch', 1, 38), at('parasol', 18, 40),
      at('dock', 18, 34), at('willow', 18, 39),
      // —— 北岭矿区 ——
      ...block([['mine', { focus: 'copper', progress: 0.4 }], ['quarry', { level: 2 }], ['kiln', { progress: 0.5 }], ['firetower']], 27, 7),
      ...block([['cottage'], ['cottage'], ['guardpost'], ['crates']], 32, 7),
      ...block([['pine'], ['pine'], ['anvil'], ['signflags']], 37, 7),
      ...row('cottage', 27, 12, 2, 0, 2), ...row('pine', 32, 12, 2, 0, 2), ...row('bench', 37, 12, 2, 0, 2),
      ...block([['pine'], ['cottage'], ['oak'], ['pine']], 27, 16),
      ...block([['cottage'], ['cottage'], ['oak'], ['bench']], 32, 16),
      ...block([['pine'], ['pine'], ['signflags'], ['flowerbox']], 37, 16),
      at('guardpost', 42, 22), at('pine', 42, 24),
      // —— 河东：乳品、纺织与酿酒 ——
      ...block([['feedmill', { progress: 0.6 }], ['cowbarn', { grown: true, progress: 0.35 }], ['dairy', { progress: 0.5 }], ['pasture', { grown: true, progress: 0.2 }]], 27, 21),
      ...block([['weaver', { progress: 0.44 }], ['tailor', { progress: 0.3 }], ['warehouse', { level: 2 }], ['tavern']], 32, 21),
      ...block([['winery', { focus: 'wine', progress: 0.6 }], ['cellar', { progress: 0.25 }], ['winery', { focus: 'beer', progress: 0.15 }], ['warehouse']], 37, 21),
      ...block([['sawmill', { progress: 0.5 }], ['lumber', { level: 2, progress: 0.6 }], ['hopsfield', { progress: 0.4 }], ['hopsfield', { ready: true }]], 27, 26),
      ...block([['vineyard', { progress: 0.7 }], ['apiary', { ready: true }], ['firetower'], ['barrels']], 32, 26),
      ...block([['cottage'], ['cottage'], ['crates'], ['signflags']], 37, 26),
      ...row('cottage', 27, 31, 2, 0, 2),
      ...row('wall', 32, 31, 1, 0, 3), at('citygate', 35, 31), ...row('wall', 37, 31, 1, 0, 3), at('citygate', 40, 31),
      ...block([['cottage'], ['cottage'], ['oak'], ['cherry']], 27, 34),
      ...block([['oak'], ['maple'], ['bench'], ['flowerbox']], 32, 34),
      ...block([['cottage'], ['cottage'], ['pine'], ['oak']], 37, 34),
      ...block([['cottage'], ['cottage'], ['oak'], ['signflags']], 27, 39),
      ...block([['oak'], ['pine'], ['bench'], ['parasol']], 32, 39),
      ...block([['cottage'], ['cottage'], ['maple'], ['oak']], 37, 39),
      at('barrels', 42, 31), at('crates', 42, 32), at('signflags', 42, 42),
      // —— 南岸：田地、果园与糖田 ——
      ...block([['windmill', { level: 2 }], ['flowernursery', { ready: true }], ['orchardhouse', { ready: true }], ['garden']], 3, 26),
      ...block([['sugarmill', { progress: 0.3 }], ['canefield', { ready: true }], ['canefield', { progress: 0.5 }], ['fishery', { ready: true }]], 8, 26),
      ...block([['fishpond', { progress: 0.4 }], ['jamkitchen', { progress: 0.5 }], ['apiary', { progress: 0.2 }], ['garden']], 13, 26),
      at('farm', 3, 21, { crop: 'wheat' }), at('farm', 4, 21, { crop: 'carrot' }), at('farm', 5, 21, { crop: 'corn' }), at('farm', 6, 21, { crop: 'tomato' }),
      at('farm', 3, 22, { crop: 'strawberry' }), at('farm', 4, 22, { crop: 'pumpkin' }), at('farm', 5, 22, { crop: 'sunflower' }), at('farm', 6, 22, { crop: 'grape' }),
      at('farm', 8, 21, { crop: 'apple' }), at('farm', 9, 21, { crop: 'wheat' }), at('farm', 10, 21, { crop: 'carrot' }), at('farm', 11, 21, { crop: 'corn' }),
      at('farm', 8, 22, { crop: 'tomato' }), at('farm', 9, 22, { crop: 'strawberry' }), at('farm', 10, 22, { crop: 'pumpkin' }), at('farm', 11, 22, { crop: 'sunflower' }),
      at('farm', 13, 21, { crop: 'grape' }), at('farm', 14, 21, { crop: 'apple' }), at('farm', 15, 21, { crop: 'wheat' }), at('farm', 16, 21, { crop: 'carrot' }),
      at('farm', 13, 22, { crop: 'corn' }), at('farm', 14, 22, { crop: 'tomato' }), at('farm', 15, 22, { crop: 'strawberry' }), at('farm', 16, 22, { crop: 'pumpkin' }),
      ...row('chickencoop', 3, 31, 2, 0, 2), ...row('pasture', 8, 31, 2, 0, 2), ...row('pigfarm', 13, 31, 2, 0, 2),
      ...block([['farmhouse'], ['cottage'], ['oak'], ['maple']], 3, 34),
      ...block([['hunterlodge'], ['herbgarden', { ready: true }], ['oak'], ['flowerarch']], 8, 34),
      ...block([['cottage'], ['cottage'], ['willow'], ['bench']], 13, 34),
      ...block([['cottage'], ['farmhouse'], ['maple'], ['oak']], 3, 39),
      ...block([['orchardhouse', { progress: 0.6 }], ['jamkitchen', { ready: true }], ['bench'], ['parasol']], 8, 39),
      ...block([['cottage'], ['cottage'], ['garden'], ['flowerarch']], 13, 39),
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
    regions: OPEN_REGIONS, farmingXp: 2240,
    resources: { wood: 160, stone: 130, materials: 90, bread: 60, fish: 40, wheat: 60, flour: 24, plank: 60, tools: 20, clothing: 20, cheese: 16, honey: 16, wine: 20, beer: 16, vintage: 8, sausages: 12, souvenir: 12, feed: 40, sugar: 10 },
    streets: [
      // 西岸：纵街 x=2/7/12/17，横街 y=5/10/15/20 与 25/30/33/38，主街 y=15 与 y=33 直通两座桥
      [2, 2, 2, 42, 'gravel'], [7, 2, 7, 42, 'stone'], [12, 2, 12, 42, 'stone'], [17, 2, 17, 42, 'gravel'],
      [2, 5, 18, 5, 'stone'], [2, 10, 18, 10, 'stone'], [2, 15, 21, 15, 'stone'], [2, 20, 18, 20, 'gravel'],
      [2, 25, 18, 25, 'gravel'], [2, 30, 18, 30, 'gravel'], [2, 33, 18, 33, 'stone'], [2, 38, 18, 38, 'gravel'],
      // 东岸：纵街 x=26/31/36/41，横街对称，桥面在 y=15 与 y=33 接上
      [26, 6, 26, 42, 'gravel'], [31, 6, 31, 42, 'stone'], [36, 6, 36, 42, 'stone'], [41, 6, 41, 42, 'gravel'],
      [26, 6, 42, 6, 'gravel'], [26, 11, 42, 11, 'stone'], [26, 15, 41, 15, 'stone'], [26, 20, 42, 20, 'gravel'],
      [26, 25, 42, 25, 'stone'], [26, 30, 42, 30, 'gravel'], [26, 33, 40, 33, 'stone'], [26, 38, 42, 38, 'gravel'],
      // 镇外专线：动物园的入口街与园内横路
      [47, 26, 61, 26, 'stone'], [52, 21, 52, 26, 'gravel'], [47, 32, 61, 32, 'dirt'],
    ],
    placements: [
      // —— 河西：商栈街区，联排屋与公寓围着教堂、剧院与广场 ——
      ...block([['rowhouse', { level: 2 }], ['apartment'], ['rowhouse', { level: 2 }], ['rowhouse']], 3, 6),
      ...block([['apartment'], ['rowhouse'], ['cottage'], ['rowhouse']], 8, 6),
      ...block([['rowhouse'], ['rowhouse'], ['cottage'], ['cottage']], 13, 6),
      ...block([['school', { level: 2 }], ['clinic', { level: 2 }], ['chapel'], ['teahouse']], 3, 11),
      at('townhall', 8, 11, { level: 3 }), at('fountain', 11, 11), at('garden', 11, 13), at('bench', 11, 14), at('signflags', 8, 14), at('archlights', 11, 12),
      at('theatre', 13, 11, { level: 2 }), at('fountain', 16, 11), at('garden', 16, 13), at('bench', 16, 14), at('signflags', 13, 14), at('trellis', 16, 12),
      ...block([['rowhouse'], ['rowhouse', { level: 2 }], ['apartment'], ['cottage']], 3, 16),
      ...block([['market'], ['bakery', { progress: 0.5 }], ['tavern', { level: 2 }], ['warehouse']], 8, 16),
      ...block([['rowhouse'], ['rowhouse'], ['cottage'], ['cottage']], 13, 16),
      at('cherry', 18, 4), at('willow', 18, 8), at('boardwalk', 18, 11), at('railing', 18, 12), at('flowerbox', 18, 16), at('dock', 18, 17),
      at('oak', 1, 6), at('maple', 1, 11), at('parasol', 1, 14), at('cherry', 1, 17), at('bench', 1, 20), at('well', 18, 22),
      at('signflags', 1, 25), at('bench', 18, 27), at('crates', 1, 30), at('barrels', 18, 32), at('flowerarch', 1, 38), at('parasol', 18, 40),
      at('dock', 18, 34), at('willow', 18, 39),
      // —— 北岭矿区 ——
      ...block([['mine', { focus: 'gold', progress: 0.45 }], ['mine', { focus: 'silver', progress: 0.2 }], ['quarry', { level: 3, ready: true }], ['kiln', { progress: 0.6 }]], 27, 7),
      ...block([['smelter', { progress: 0.3 }], ['firetower'], ['guardpost'], ['crates']], 32, 7),
      ...block([['cottage'], ['cottage'], ['anvil'], ['signflags']], 37, 7),
      ...row('cottage', 27, 12, 2, 0, 2), ...row('pine', 32, 12, 2, 0, 2), ...row('bench', 37, 12, 2, 0, 2),
      ...block([['pine'], ['cottage'], ['oak'], ['pine']], 27, 16),
      ...block([['cottage'], ['cottage'], ['oak'], ['bench']], 32, 16),
      ...block([['pine'], ['pine'], ['signflags'], ['flowerbox']], 37, 16),
      at('guardpost', 42, 22), at('pine', 42, 24),
      // —— 河东：码头与城堡各占一个街区，商栈与仓储排在城墙内 ——
      at('harbor', 27, 21), at('crates', 30, 21), at('barrels', 30, 22), at('signflags', 30, 23), at('bench', 27, 24), at('flowerbox', 28, 24),
      ...block([['warehouse', { level: 2 }], ['warehouse', { level: 2 }], ['firestation'], ['barracks']], 32, 21),
      at('castle', 37, 21), at('crates', 40, 21), at('anvil', 40, 22), at('signflags', 40, 23), at('bench', 37, 24), at('flowerbox', 38, 24),
      ...block([['market', { level: 2 }], ['smithy', { focus: 'tnt', progress: 0.5 }], ['sawmill', { progress: 0.4 }], ['tailor', { progress: 0.35 }]], 27, 26),
      ...block([['winery', { focus: 'beer', progress: 0.55 }], ['butcher', { progress: 0.4 }], ['dairy', { progress: 0.3 }], ['guardpost']], 32, 26),
      ...block([['warehouse', { level: 3 }], ['warehouse', { level: 3 }], ['bench'], ['flowerbox']], 37, 26),
      ...row('cottage', 27, 31, 2, 0, 2),
      ...row('wall', 32, 31, 1, 0, 3), at('citygate', 35, 31), ...row('wall', 37, 31, 1, 0, 3), at('citygate', 40, 31),
      ...block([['cottage'], ['cottage'], ['oak'], ['cherry']], 27, 34),
      ...block([['oak'], ['maple'], ['bench'], ['flowerbox']], 32, 34),
      ...block([['cottage'], ['cottage'], ['pine'], ['oak']], 37, 34),
      ...block([['cottage'], ['cottage'], ['oak'], ['signflags']], 27, 39),
      ...block([['oak'], ['pine'], ['bench'], ['parasol']], 32, 39),
      ...block([['cottage'], ['cottage'], ['maple'], ['oak']], 37, 39),
      at('barrels', 42, 31), at('crates', 42, 32), at('signflags', 42, 42),
      // —— 南岸：粮田、牧场与果园 ——
      ...block([['windmill', { level: 2 }], ['flowernursery', { ready: true }], ['bakery', { progress: 0.4 }], ['garden']], 3, 26),
      ...block([['sugarmill', { progress: 0.5 }], ['canefield', { ready: true }], ['fishery', { ready: true }], ['hunterlodge']], 8, 26),
      ...block([['cowbarn', { grown: true, progress: 0.4 }], ['dairy', { progress: 0.45 }], ['pasture', { grown: true, progress: 0.2 }], ['chickencoop', { grown: true }]], 13, 26),
      at('farm', 3, 21, { crop: 'wheat' }), at('farm', 4, 21, { crop: 'carrot' }), at('farm', 5, 21, { crop: 'corn' }), at('farm', 6, 21, { crop: 'tomato' }),
      at('farm', 3, 22, { crop: 'strawberry' }), at('farm', 4, 22, { crop: 'pumpkin' }), at('farm', 5, 22, { crop: 'sunflower' }), at('farm', 6, 22, { crop: 'grape' }),
      at('farm', 8, 21, { crop: 'apple' }), at('farm', 9, 21, { crop: 'wheat' }), at('farm', 10, 21, { crop: 'carrot' }), at('farm', 11, 21, { crop: 'corn' }),
      at('farm', 8, 22, { crop: 'tomato' }), at('farm', 9, 22, { crop: 'strawberry' }), at('farm', 10, 22, { crop: 'pumpkin' }), at('farm', 11, 22, { crop: 'sunflower' }),
      at('farm', 13, 21, { crop: 'grape' }), at('farm', 14, 21, { crop: 'apple' }), at('farm', 15, 21, { crop: 'wheat' }), at('farm', 16, 21, { crop: 'carrot' }),
      at('farm', 13, 22, { crop: 'corn' }), at('farm', 14, 22, { crop: 'tomato' }), at('farm', 15, 22, { crop: 'strawberry' }), at('farm', 16, 22, { crop: 'pumpkin' }),
      ...row('pigfarm', 3, 31, 2, 0, 2), ...row('apiary', 8, 31, 2, 0, 2), ...row('herbgarden', 13, 31, 2, 0, 2),
      ...block([['orchardhouse', { ready: true }], ['jamkitchen', { progress: 0.5 }], ['oak'], ['maple']], 3, 34),
      ...block([['farmhouse'], ['cottage'], ['oak'], ['flowerarch']], 8, 34),
      ...block([['cottage'], ['cottage'], ['willow'], ['bench']], 13, 34),
      ...block([['cottage'], ['farmhouse'], ['maple'], ['oak']], 3, 39),
      ...block([['oak'], ['cherry'], ['bench'], ['parasol']], 8, 39),
      ...block([['cottage'], ['cottage'], ['garden'], ['flowerarch']], 13, 39),
      // —— 镇外东部：青岚动物园，大门 → 四个展区 → 纪念品铺 ——
      at('zoogate', 50, 23), at('zooenclosure', 47, 28, { focus: 'zebra', progress: 0.5 }), at('zooenclosure', 51, 28, { focus: 'giraffe', progress: 0.3 }),
      at('zooenclosure', 55, 28, { focus: 'elephant', progress: 0.6 }), at('zooenclosure', 59, 28, { focus: 'lion', progress: 0.2 }),
      at('zooshop', 57, 23), at('garden', 47, 23), at('fountain', 54, 23), at('bench', 53, 30), at('bench', 57, 30), at('parasol', 61, 23),
      at('signflags', 52, 33), at('oak', 47, 34), at('cherry', 55, 34), at('maple', 60, 34), at('flowerbox', 49, 23), at('trellis', 61, 28),
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
    researched: [], regions: [], farmingXp: 0, compact: true,
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
