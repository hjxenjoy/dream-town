import { CROPS, CROP_IDS, freshFarming, validFarming, gardenLevel, soilLevel, harvestQuote, type CropId, type CropHarvest, type FarmingState } from './farming.ts';
import { PROJECT_IDS, PROJECTS, freshProjects, validProjects, projectMetrics, hasProjectTitle, type ProjectId, type ProjectState } from './projects.ts';
import { stockTargets, woodReserve } from './economy.ts';
import { initialRoads, roadLine, roadQuote, ROAD_TYPES, tileKey, type Road, type RoadKind, type Tile } from './roads.ts';
import { terrainAt, terrainReason, districtAt, DISTRICTS, preferredDistrict, type District } from './terrain.ts';
import { BUILDINGS, BUILDING_KEYS, CARAVAN_CARGO, CARAVAN_DURATION, emptyResources, GAME_DAY_SECONDS, MAP_SIZE, MAX_OFFLINE_SECONDS, RESOURCE_KEYS, RESOURCES, SEASON_SECONDS, TAX_NAMES, TAX_RATES, TECHNOLOGIES, TECHNOLOGY_KEYS, PRODUCTION_SEQUENCE, type TechnologyId, type BuildingKind, type Resource, type ResourceMap } from './data.ts';
import { DISASTERS, DISASTER_INTERVAL, DISASTER_KINDS, REPAIR_SECONDS, canStrike, disasterOf, type DisasterKind, type SeasonKey } from './disasters.ts';
import { ACTIVITY_HAPPINESS, SEASONAL_ACTIVITIES, activityOf, type ActivityState } from './seasonal.ts';
import { PETS, PET_KINDS, adoptionIssue, petCapacity, type PetKind, type PetState } from './pets.ts';
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, achievementById, achievementProgress, unlockedBy, type AchievementId, type AchievementMetrics } from './achievements.ts';
import { DESTINATION_IDS, availableDestinations, caravanDuration, destinationOf, missingCargo, type DestinationId } from './destinations.ts';
import { COLLECTIONS, COLLECTION_IDS, collectionEnvironment, collectionProgress, newlyReached, ornamentRequirement, type CollectionId } from './collections.ts';
import { STORY_PORTRAITS, STORY_STAGES, nextStoryStage, storyChoiceIds, storyEffect, storyEnvironment, storyHistory, type StoryProgress } from './stories.ts';
import { residentRoster } from './residents.ts';
export type { BuildingKind, Resource, ResourceMap } from './data.ts';

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  level: number;
  progress: number;
  ready: boolean;
  paused: boolean;
  stock: Partial<ResourceMap>;
  damaged?: boolean;
  /** Which hazard struck this building, and when its repair finishes. */
  damageKind?: DisasterKind;
  repairingUntil?: number;
  workers?: number;
  crop?: CropId;
  nextCrop?: CropId;
  tended?: number;
  fallow?: boolean;
  cropHarvest?: CropHarvest;
  productionFocus?: 'balanced' | 'wood' | 'plank';
}
export interface Order {
  id: string;
  npc: string;
  title: string;
  items: Partial<ResourceMap>;
  rewardCoins: number;
  rewardXp: number;
  cooldownUntil?: number;
}
export interface Caravan {
  status: 'idle' | 'traveling' | 'returned';
  returnAt: number;
  duration: number;
  cargo: Partial<ResourceMap>;
  rewardCoins: number;
  rewardMaterials: number;
  trips: number;
  /** Chosen destination. Absent on saves written before routes were selectable. */
  destination?: DestinationId;
}
export interface Quest {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardCoins: number;
  rewardXp: number;
  rewardPrestige: number;
  claimed: boolean;
}
export interface TownLog {
  id: string;
  time: number;
  message: string;
  type: 'success' | 'warning' | 'info' | 'mayor';
}
export interface SimState {
  version: 2;
  researched: TechnologyId[];
  roads?: Road[];
  projects?: ProjectState;
  farming?: FarmingState;
  layoutUndo?: {id:string;x:number;y:number}[];
  createdAt: number;
  savedAt: number;
  gameTime: number;
  coins: number;
  xp: number;
  level: number;
  prestige: number;
  taxRate: number;
  population: number;
  happiness: number;
  capacity: number;
  resources: ResourceMap;
  buildings: Building[];
  orders: Order[];
  caravan: Caravan;
  quests: Quest[];
  season: keyof typeof import('./data.ts').SEASON_NAMES;
  needs: { food: number; water: number; services: number; environment: number };
  settings: { sound: boolean; disasters: boolean; autoMayor: boolean; reducedMotion?: boolean };
  /** `activities` counts seasonal activities and is absent from saves written before it existed. */
  stats: { collected: number; ordersCompleted: number; buildingsBuilt: number; caravansCompleted: number; coinsEarned: number; festivals: number; repairs: number; toolsProduced: number; clothingProduced: number; activities?: number };
  /** Unlocked achievement ids, in the order they were earned. */
  achievements?: AchievementId[];
  /** Street styles collected, and how many tiers of each were banked. */
  collections?: Partial<Record<CollectionId, number>>;
  /** Which story choice each neighbour made, stage by stage. */
  stories?: StoryProgress;
  logs: TownLog[];
  nextId: number;
  festivalUntil: number;
  /** The voluntary seasonal activity in progress, if the player started one. */
  activity?: ActivityState;
  /** Adopted pets. Each trails one resident on the map. */
  pets?: PetState[];
  lastMayorAt: number;
  lastDisasterAt: number;
}
export type GameState = SimState;
export interface ActionResult {
  ok: boolean;
  message: string;
  code?: string;
  buildingId?: string;
  items?: Partial<ResourceMap>;
  coins?: number;
  xp?: number;
  prestige?: number;
  farmCoins?: number;
  cropQuantity?: number;
}
export interface OfflineReport {
  seconds: number;
  elapsed: number;
  capped: boolean;
  produced: ResourceMap;
  consumed: ResourceMap;
  coins: number;
  tax: number;
  caravanReturned: boolean;
  happinessChange: number;
  farmCoins?: number;
  cropQuantity?: number;
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function sum(items: Partial<ResourceMap>): number { return Object.values(items).reduce((a, b) => a + (b ?? 0), 0); }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function nonnegative(value: unknown): value is number { return finite(value) && value >= 0; }
function whole(value: unknown): value is number { return nonnegative(value) && Number.isInteger(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function resourceLabel(items: Partial<ResourceMap>): string { return RESOURCE_KEYS.filter(key => (items[key] ?? 0) > 0).map(key => `${RESOURCES[key].name} ×${items[key]}`).join('、'); }

const INITIAL_ORDERS: Order[] = [
  { id: 'order-1', npc: '艾米 · 花店主人', title: '花店的午后茶会', items: { bread: 4, fish: 2 }, rewardCoins: 180, rewardXp: 35 },
  { id: 'order-2', npc: '老乔 · 木匠', title: '修缮河畔长椅', items: { wood: 8, plank: 3 }, rewardCoins: 155, rewardXp: 30 },
  { id: 'order-3', npc: '苏菲 · 烘焙师', title: '明天也要麦香满屋', items: { flour: 6, wheat: 4 }, rewardCoins: 170, rewardXp: 32 },
  { id: 'order-4', npc: '米洛 · 旅行商人', title: '旅途中的小小补给', items: { bread: 3, fish: 5 }, rewardCoins: 190, rewardXp: 38 },
  { id: 'order-5', npc: '伊芙 · 园丁', title: '给花园铺一条小径', items: { stone: 8, wood: 4 }, rewardCoins: 160, rewardXp: 30 },
  { id: 'order-6', npc: '诺亚 · 渔夫', title: '欢迎新邻居的晚餐', items: { fish: 8, bread: 2 }, rewardCoins: 210, rewardXp: 40 },
];

export function createInitialState(now = Date.now()): SimState {
  const layout: [BuildingKind, number, number][] = [
    ['townhall', 8, 7], ['cottage', 6, 6], ['cottage', 10, 6], ['cottage', 11, 8],
    ['windmill', 5, 10], ['bakery', 7, 11], ['warehouse', 10, 10], ['market', 8, 9],
    ['well', 9, 6], ['lumber', 4, 6], ['fishery', 12, 12], ['quarry', 4, 4],
    ['garden', 11, 5], ['farm', 4, 9], ['farm', 4, 10], ['farm', 4, 11],
    ['farm', 3, 9], ['farm', 3, 10], ['farm', 3, 11],
  ];
  const buildings = layout.map(([kind, x, y], index): Building => {
    const ready = ['fishery', 'lumber'].includes(kind) || (kind === 'farm' && y === 9);
    return { id: `building-${index + 1}`, kind, x, y, level: 1, progress: ready ? 1 : ((index * 17) % 70) / 100, ready, paused: false, stock: ready ? { ...BUILDINGS[kind].output } : {}, workers: BUILDINGS[kind].workers ?? 0 };
  });
  return {
    version: 2, researched: [], createdAt: now, savedAt: now, gameTime: 0, coins: 2800, xp: 80, level: 3, prestige: 6,
    taxRate: 1, population: 12, happiness: 86, capacity: 240,
    resources: { ...emptyResources(), wood: 42, stone: 25, wheat: 24, flour: 12, bread: 10, fish: 20, plank: 12, materials: 10 },
    buildings, orders: clone(INITIAL_ORDERS),
    caravan: { status: 'idle', returnAt: 0, duration: CARAVAN_DURATION, cargo: { ...CARAVAN_CARGO }, rewardCoins: 420, rewardMaterials: 8, trips: 0 },
    quests: [
      { id: 'harvest', title: '第一份丰收', description: '收取 12 份新鲜物资', target: 12, progress: 0, rewardCoins: 160, rewardXp: 35, rewardPrestige: 1, claimed: false },
      { id: 'orders', title: '邻里好帮手', description: '完成 3 笔居民订单', target: 3, progress: 0, rewardCoins: 280, rewardXp: 60, rewardPrestige: 2, claimed: false },
      { id: 'builder', title: '小镇多一点美好', description: '新建 2 座建筑或麦田', target: 2, progress: 0, rewardCoins: 300, rewardXp: 70, rewardPrestige: 2, claimed: false },
      { id: 'caravan', title: '远方的礼物', description: '迎回 1 支满载的商队', target: 1, progress: 0, rewardCoins: 350, rewardXp: 80, rewardPrestige: 3, claimed: false },
      { id: 'population', title: '越来越热闹', description: '吸引 18 位居民定居', target: 18, progress: 12, rewardCoins: 420, rewardXp: 100, rewardPrestige: 4, claimed: false },
      { id: 'festival', title: '今夜有好心情', description: '举办 1 场邻里庆典', target: 1, progress: 0, rewardCoins: 120, rewardXp: 40, rewardPrestige: 2, claimed: false },
      ...expansionQuests(),
    ],
    season: 'spring', needs: { food: 100, water: 100, services: 90, environment: 75 },
    settings: { sound: true, disasters: false, autoMayor: false },
    stats: { collected: 0, ordersCompleted: 0, buildingsBuilt: 0, caravansCompleted: 0, coinsEarned: 0, festivals: 0, repairs: 0, toolsProduced: 0, clothingProduced: 0 },
    logs: [{ id: 'log-1', time: 0, message: '欢迎来到青岚小镇。麦田已经成熟，新的故事正等你开始。', type: 'info' }],
    nextId: 100, festivalUntil: 0, lastMayorAt: 0, lastDisasterAt: 0,
  };
}

function expansionQuests(): Quest[] {
  return [
    { id: 'research', title: '把梦想画成蓝图', description: '完成 1 项科技研究', target: 1, progress: 0, rewardCoins: 240, rewardXp: 80, rewardPrestige: 2, claimed: false },
    { id: 'tools', title: '叮当声里的新生活', description: '从铁匠铺收获 6 套工具', target: 6, progress: 0, rewardCoins: 600, rewardXp: 140, rewardPrestige: 4, claimed: false },
    { id: 'clothing', title: '给四季一份温暖', description: '从裁缝铺收获 6 件衣物', target: 6, progress: 0, rewardCoins: 520, rewardXp: 140, rewardPrestige: 4, claimed: false },
  ];
}

/** Only the known v1 format receives defaults. Corrupt or incomplete v2 saves stay rejected. */
export function migrateSave(value: unknown): SimState | null {
  if (validateSave(value)) return clone(value);
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.resources) || !isRecord(value.stats) || !Array.isArray(value.quests)) return null;
  const legacyResources = ['wood', 'stone', 'wheat', 'flour', 'bread', 'fish', 'plank', 'materials'];
  if (Object.keys(value.resources).length !== legacyResources.length || legacyResources.some(key => !whole((value.resources as Record<string, unknown>)[key]))) return null;
  if ('researched' in value || 'toolsProduced' in value.stats || 'clothingProduced' in value.stats) return null;
  const migrated = clone({ ...value, version: 2, researched: [], resources: { ...emptyResources(), ...value.resources }, stats: { ...value.stats, toolsProduced: 0, clothingProduced: 0 }, quests: [...value.quests, ...expansionQuests()] });
  return validateSave(migrated) ? migrated : null;
}

/** Strict boundary for imports: reject corrupt data instead of replacing a good save. */
export function validateSave(value: unknown): value is SimState {
  if (!isRecord(value) || value.version !== 2) return false;
  if (value.farming !== undefined && !validFarming(value.farming)) return false;
  if (value.projects !== undefined && !validProjects(value.projects)) return false;
  if (!Array.isArray(value.researched) || value.researched.some(id => !TECHNOLOGY_KEYS.includes(id)) || new Set(value.researched).size !== value.researched.length) return false;
  const researched = value.researched as TechnologyId[];
  if (researched.some(id => TECHNOLOGIES[id].requires.some(prerequisite => !researched.includes(prerequisite)))) return false;
  for (const key of ['createdAt', 'savedAt', 'gameTime', 'coins', 'xp', 'prestige', 'population', 'capacity', 'nextId', 'festivalUntil', 'lastMayorAt', 'lastDisasterAt']) if (!nonnegative(value[key])) return false;
  if (!whole(value.level) || value.level < 1 || !whole(value.taxRate) || value.taxRate > 4 || !whole(value.population) || !whole(value.capacity) || !whole(value.nextId) || !nonnegative(value.happiness) || value.happiness > 100) return false;
  if (!isRecord(value.resources) || RESOURCE_KEYS.some(key => !whole((value.resources as Record<string, unknown>)[key]))) return false;
  if (Object.keys(value.resources).some(key => !RESOURCE_KEYS.includes(key as Resource)) || sum(value.resources as ResourceMap) > (value.capacity as number)) return false;
  if (!['spring', 'summer', 'autumn', 'winter'].includes(value.season as string)) return false;
  if (!Array.isArray(value.buildings) || !Array.isArray(value.orders) || !Array.isArray(value.quests) || !Array.isArray(value.logs)) return false;
  const positions = new Set<string>(); const ids = new Set<string>();
  let assignedWorkers = 0;
  const validItems = (items: unknown): boolean => isRecord(items) && Object.entries(items).every(([key, count]) => RESOURCE_KEYS.includes(key as Resource) && whole(count));
  for (const building of value.buildings) {
    if (!isRecord(building) || typeof building.id !== 'string' || ids.has(building.id) || !BUILDING_KEYS.includes(building.kind as BuildingKind) || !whole(building.x) || !whole(building.y) || building.x >= MAP_SIZE || building.y >= MAP_SIZE || !whole(building.level) || building.level < 1 || building.level > 3 || !nonnegative(building.progress) || building.progress > 1 || typeof building.ready !== 'boolean' || typeof building.paused !== 'boolean' || !validItems(building.stock)) return false;
    if (terrainAt(building.x,building.y) !== 'land') return false;
    if (['crop','nextCrop','tended','fallow','cropHarvest'].some(key=>building[key]!==undefined)&&building.kind!=='farm') return false;
    for (const field of ['crop','nextCrop']) if(building[field]!==undefined&&(!CROP_IDS.includes(building[field] as CropId)||CROPS[building[field] as CropId].level>gardenLevel((value.farming as FarmingState|undefined)?.xp??0).level))return false;
    if(building.tended!==undefined&&!whole(building.tended))return false;
    if(building.fallow!==undefined&&typeof building.fallow!=='boolean')return false;
    if(building.cropHarvest!==undefined){const h=building.cropHarvest;if(!isRecord(h)||!building.ready||h.crop!==building.crop||h.crop==='wheat'||!CROP_IDS.includes(h.crop as CropId)||!whole(h.quantity)||h.quantity<1||typeof h.rare!=='boolean'||sum(building.stock as Partial<ResourceMap>)>0)return false;}
    if(building.kind==='farm'&&building.crop&&building.crop!=='wheat'&&building.ready&&building.cropHarvest===undefined)return false;
    if (building.productionFocus !== undefined && (building.kind !== 'lumber' || !['balanced', 'wood', 'plank'].includes(building.productionFocus as string))) return false;
    if (building.damaged !== undefined && typeof building.damaged !== 'boolean') return false;
    if (building.damageKind !== undefined && !DISASTER_KINDS.includes(building.damageKind as DisasterKind)) return false;
    // A hazard kind and a repair timer only make sense on a building that is out of action.
    if (building.damageKind !== undefined && building.damaged !== true) return false;
    if (building.repairingUntil !== undefined && (building.damaged !== true || !nonnegative(building.repairingUntil))) return false;
    const technology = BUILDINGS[building.kind as BuildingKind].technology;
    if (technology && !researched.includes(technology)) return false;
    const maximumWorkers = BUILDINGS[building.kind as BuildingKind].workers ?? 0;
    if (building.workers !== undefined && (!whole(building.workers) || building.workers > maximumWorkers)) return false;
    assignedWorkers += Number(building.workers ?? maximumWorkers);
    const position = `${building.x},${building.y}`;
    if (positions.has(position)) return false;
    positions.add(position); ids.add(building.id);
  }
  if(value.roads!==undefined){
    if(!Array.isArray(value.roads)||value.roads.length>2116)return false;
    const roadTiles=new Set<string>();
    for(const r of value.roads){
      if(!isRecord(r)||!Object.hasOwn(ROAD_TYPES,String(r.kind))||!whole(r.x)||!whole(r.y)||terrainAt(r.x,r.y)!=='land')return false;
      const key=`${r.x},${r.y}`;if(positions.has(key)||roadTiles.has(key))return false;roadTiles.add(key);
    }
  }
  if (value.layoutUndo !== undefined) {
    if (!Array.isArray(value.layoutUndo)) return false;
    const layoutIds=new Set<string>();const layoutTiles=new Set<string>();
    for(const tile of value.layoutUndo){
      if(!isRecord(tile)||typeof tile.id!=='string'||!ids.has(tile.id)||layoutIds.has(tile.id)||!whole(tile.x)||!whole(tile.y)||terrainAt(tile.x,tile.y)!=='land'||layoutTiles.has(`${tile.x},${tile.y}`))return false;
      layoutIds.add(tile.id);layoutTiles.add(`${tile.x},${tile.y}`);
    }
  }
  if (assignedWorkers > value.population) return false;
  for (const order of value.orders) if (!isRecord(order) || typeof order.id !== 'string' || typeof order.npc !== 'string' || typeof order.title !== 'string' || !validItems(order.items) || !whole(order.rewardCoins) || !whole(order.rewardXp) || (order.cooldownUntil !== undefined && !nonnegative(order.cooldownUntil))) return false;
  for (const quest of value.quests) if (!isRecord(quest) || typeof quest.id !== 'string' || typeof quest.title !== 'string' || typeof quest.description !== 'string' || !whole(quest.target) || !whole(quest.progress) || !whole(quest.rewardCoins) || !whole(quest.rewardXp) || !whole(quest.rewardPrestige) || typeof quest.claimed !== 'boolean') return false;
  if (!isRecord(value.caravan) || !['idle', 'traveling', 'returned'].includes(value.caravan.status as string) || !validItems(value.caravan.cargo) || ['returnAt', 'duration', 'rewardCoins', 'rewardMaterials', 'trips'].some(key => !nonnegative((value.caravan as Record<string, unknown>)[key]))) return false;
  if (value.caravan.destination !== undefined && !DESTINATION_IDS.includes(value.caravan.destination as DestinationId)) return false;
  if (value.pets !== undefined) {
    if (!Array.isArray(value.pets) || value.pets.length > 6) return false;
    const petIds = new Set<string>();
    for (const pet of value.pets) {
      if (!isRecord(pet) || typeof pet.id !== 'string' || petIds.has(pet.id) || !PET_KINDS.includes(pet.kind as PetKind) || !whole(pet.follows) || pet.follows < 0) return false;
      petIds.add(pet.id);
    }
    if (value.pets.length > petCapacity(value.population as number)) return false;
  }
  if (value.activity !== undefined) {
    if (!isRecord(value.activity) || !['spring', 'summer', 'autumn', 'winter'].includes(value.activity.season as string) || !nonnegative(value.activity.endsAt)) return false;
  }
  if (!isRecord(value.settings) || ['sound', 'disasters', 'autoMayor'].some(key => typeof (value.settings as Record<string, unknown>)[key] !== 'boolean')) return false;
  if (value.settings.reducedMotion !== undefined && typeof value.settings.reducedMotion !== 'boolean') return false;
  if (value.achievements !== undefined) {
    if (!Array.isArray(value.achievements) || value.achievements.length > ACHIEVEMENT_IDS.length) return false;
    if (new Set(value.achievements).size !== value.achievements.length) return false;
    if (value.achievements.some(id => !ACHIEVEMENT_IDS.includes(id as AchievementId))) return false;
  }
  // Absent on saves written before neighbours had stories. Every recorded choice must be a
  // real option for that neighbour at that stage, so a corrupt save cannot invent a reward.
  if (value.stories !== undefined) {
    if (!isRecord(value.stories)) return false;
    for (const [portrait, choices] of Object.entries(value.stories)) {
      if (!STORY_PORTRAITS.includes(portrait)) return false;
      if (!Array.isArray(choices) || choices.length > STORY_STAGES) return false;
      if (choices.some((choice, index) => !storyChoiceIds(portrait, index).includes(choice as string))) return false;
    }
  }
  // Absent on saves written before street styles existed. Tier counts must be in range,
  // so a corrupt number cannot unlock an ornament that was never earned.
  if (value.collections !== undefined) {
    if (!isRecord(value.collections)) return false;
    for (const [id, tier] of Object.entries(value.collections)) {
      if (!COLLECTION_IDS.includes(id as CollectionId)) return false;
      if (!whole(tier) || (tier as number) < 0 || (tier as number) > COLLECTIONS[id as CollectionId].tiers.length) return false;
    }
  }
  if (!isRecord(value.needs) || ['food', 'water', 'services', 'environment'].some(key => !nonnegative((value.needs as Record<string, unknown>)[key]) || Number((value.needs as Record<string, unknown>)[key]) > 100)) return false;
  if (!isRecord(value.stats) || ['collected', 'ordersCompleted', 'buildingsBuilt', 'caravansCompleted', 'coinsEarned', 'festivals', 'repairs', 'toolsProduced', 'clothingProduced'].some(key => !whole((value.stats as Record<string, unknown>)[key]))) return false;
  // Absent on saves written before seasonal activities were counted, so only its type is checked.
  if (value.stats.activities !== undefined && !whole(value.stats.activities)) return false;
  for (const log of value.logs) if (!isRecord(log) || typeof log.id !== 'string' || typeof log.message !== 'string' || !nonnegative(log.time) || !['success', 'warning', 'info', 'mayor'].includes(log.type as string)) return false;
  return true;
}

export class SimWorld {
  state: SimState;
  constructor(state?: unknown) {
    const restored = state === undefined ? createInitialState() : migrateSave(state);
    if (!restored) throw new Error('存档格式无效，原存档未被修改。');
    this.state = restored;
    this.state.projects ??= freshProjects();
    this.state.farming ??= freshFarming();
    this.state.achievements ??= [];
    this.state.stats.activities ??= 0;
    this.state.caravan.destination ??= 'valley';
    this.state.collections ??= {};
    this.state.stories ??= {};
    for (const building of this.state.buildings) building.workers ??= BUILDINGS[building.kind].workers ?? 0;
    this.syncQuests();
    if(state===undefined){this.arrangeDistricts();delete this.state.layoutUndo;}
    this.state.roads??=initialRoads(this.state.buildings);
  }

  private id(prefix: string): string { return `${prefix}-${this.state.nextId++}`; }
  private fail(message: string, code = 'INVALID_ACTION'): ActionResult { return { ok: false, message, code }; }
  private log(message: string, type: TownLog['type'] = 'info'): void {
    this.state.logs.unshift({ id: this.id('log'), time: this.state.gameTime, message, type });
    this.state.logs = this.state.logs.slice(0, 60);
  }
  private success(message: string, extra: Omit<ActionResult, 'ok' | 'message'> = {}): ActionResult { this.log(message, 'success'); this.syncProgress(); return { ok: true, message, ...extra }; }
  private has(items: Partial<ResourceMap>): boolean { return RESOURCE_KEYS.every(key => this.state.resources[key] >= (items[key] ?? 0)); }
  private deduct(items: Partial<ResourceMap>): void { for (const key of RESOURCE_KEYS) this.state.resources[key] -= items[key] ?? 0; }
  private add(items: Partial<ResourceMap>): void { for (const key of RESOURCE_KEYS) this.state.resources[key] += items[key] ?? 0; }
  private room(): number { return Math.max(0, this.state.capacity - sum(this.state.resources)); }
  private earn(coins: number, xp = 0): void {
    this.state.coins += coins; this.state.stats.coinsEarned += coins; this.state.xp += xp;
    let threshold = this.state.level * 140;
    while (this.state.xp >= threshold) { this.state.xp -= threshold; this.state.level++; this.state.prestige++; this.log(`小镇升至 ${this.state.level} 级，获得 1 点声望。`, 'success'); threshold = this.state.level * 140; }
  }
  /** Everything the achievement table can read, computed from state on demand. */
  private achievementMetrics(): AchievementMetrics {
    const s = this.state;
    const kinds = new Set(s.buildings.map(b => b.kind));
    const decor = [...kinds].filter(kind => BUILDINGS[kind].category === 'decoration').length;
    const industry = [...kinds].filter(kind => BUILDINGS[kind].cycle !== undefined && kind !== 'farm').length;
    const soil = Math.max(1, ...s.buildings.filter(b => b.kind === 'farm').map(b => soilLevel(b.tended).level));
    return {
      collected: s.stats.collected,
      crops: s.farming?.harvested ?? 0,
      rareCrops: Object.values(s.farming?.rare ?? {}).reduce((n, v) => n + v, 0),
      cropVarieties: Object.values(s.farming?.album ?? {}).filter(n => n > 0).length,
      gardenLevel: gardenLevel(s.farming?.xp ?? 0).level,
      soilLevel: soil,
      orders: s.stats.ordersCompleted,
      caravans: s.stats.caravansCompleted,
      built: s.stats.buildingsBuilt,
      repairs: s.stats.repairs,
      festivals: s.stats.festivals,
      activities: s.stats.activities ?? 0,
      coinsEarned: s.stats.coinsEarned,
      population: s.population,
      level: s.level,
      technologies: s.researched.length,
      tools: s.stats.toolsProduced,
      clothing: s.stats.clothingProduced,
      pets: (s.pets ?? []).length,
      decorKinds: decor,
      industryKinds: industry,
      projectStages: Object.values(s.projects?.stages ?? {}).reduce((n, v) => n + v, 0),
    };
  }

  /**
   * Grants every achievement the town now qualifies for. Unlocking first and rewarding
   * second means a reward that raises another metric (coins earned, say) is picked up by
   * the next pass of the same loop, and no achievement can pay out twice.
   */
  private syncAchievements(): void {
    this.state.achievements ??= [];
    for (let pass = 0; pass < ACHIEVEMENTS.length; pass++) {
      const newly = unlockedBy(this.achievementMetrics(), this.state.achievements);
      if (!newly.length) return;
      for (const id of newly) {
        const entry = achievementById(id)!;
        this.state.achievements.push(id);
        this.state.prestige += entry.prestige;
        this.log(`成就达成「${entry.name}」：${entry.description} 获得 ${entry.prestige} 点声望。`, 'success');
      }
    }
  }

  /** Quest, achievement and street-style progress always move together, so none is forgotten. */
  private syncProgress(): void {
    this.syncQuests();
    this.syncAchievements();
    this.syncCollections();
  }

  /**
   * Records any street style the town has just completed. A tier is banked once and never
   * revoked, so taking the flowers up again does not take back what was already awarded.
   */
  private syncCollections(): void {
    const banked = this.state.collections ?? (this.state.collections = {});
    for (const { id, tier } of newlyReached(collectionProgress(this.state.buildings, banked), banked)) {
      banked[id] = tier;
      const reached = COLLECTIONS[id].tiers[tier - 1]!;
      this.state.prestige += 4 * tier;
      const ornament = reached.unlocks ? ` 解锁纪念摆件「${BUILDINGS[reached.unlocks].name}」。` : '';
      this.log(`${COLLECTIONS[id].name}成形：${reached.name}。${reached.perk}${ornament} 获得 ${4 * tier} 点声望。`, 'success');
    }
  }

  private syncQuests(): void {
    const progress: Record<string, number> = { harvest: this.state.stats.collected, orders: this.state.stats.ordersCompleted, builder: this.state.stats.buildingsBuilt, caravan: this.state.stats.caravansCompleted, population: this.state.population, festival: this.state.stats.festivals, research: this.state.researched.length, tools: this.state.stats.toolsProduced, clothing: this.state.stats.clothingProduced };
    for (const quest of this.state.quests) quest.progress = Math.min(quest.target, Math.max(quest.progress, progress[quest.id] ?? 0));
  }

  /**
   * Why a street-style ornament cannot be built yet, or null when it can. The build panel
   * asks the same question, so what it shows and what the simulation accepts never differ.
   */
  ornamentLock(kind: BuildingKind): string | null {
    const ornament = ornamentRequirement(kind);
    if (!ornament || (this.state.collections?.[ornament.id] ?? 0) >= ornament.tier) return null;
    const style = COLLECTIONS[ornament.id];
    const tier = style.tiers[ornament.tier - 1]!;
    return `「${BUILDINGS[kind].name}」是${style.name}的纪念摆件：先让「${tier.name}」成形（一处 ${tier.need} 件、${tier.distinct} 种）。`;
  }

  /**
   * The named neighbours, with what they are ready to talk about. Assignments come from
   * real buildings, so a story only opens once the place it is about actually stands.
   */
  private storyContext(portrait: string) {
    const record = residentRoster(this.state.buildings, this.state.population)
      .find(entry => entry.portrait === portrait);
    return {
      record,
      context: {
        home: Boolean(record?.homeId) && record?.unsettled === false,
        workplace: Boolean(record?.workplaceId),
        level: this.state.level,
        population: this.state.population,
      },
    };
  }

  /** Every neighbour's story state, for the panel and the tools. */
  neighbourStories() {
    const progress = this.state.stories ?? {};
    return residentRoster(this.state.buildings, this.state.population).map(record => {
      const { context } = this.storyContext(record.portrait);
      const pending = nextStoryStage(record.portrait, progress, context);
      return {
        ...record,
        pending: pending ? { index: pending.index, title: pending.stage.title, prompt: pending.stage.prompt, choices: pending.stage.choices.map(choice => ({ id: choice.id, label: choice.label, description: choice.description, perk: choice.effect.perk })) } : null,
        history: storyHistory(record.portrait, progress),
      };
    });
  }

  /**
   * Answers a neighbour's story stage. The choice applies immediately: goods go to the
   * warehouse, or a lasting bonus is banked. An unaffordable gift is refused before
   * anything is recorded, so a refusal leaves the save exactly as it was.
   */
  chooseStoryOption(portrait: string, choiceId: string): ActionResult {
    const record = residentRoster(this.state.buildings, this.state.population)
      .find(entry => entry.portrait === portrait);
    if (!record) return this.fail('还没有这位邻居的消息。', 'UNKNOWN_NEIGHBOUR');
    const progress = this.state.stories ?? (this.state.stories = {});
    const { context } = this.storyContext(portrait);
    const pending = nextStoryStage(portrait, progress, context);
    if (!pending) return this.fail('这位邻居眼下没有什么要说的。', 'NO_STORY');
    const choice = pending.stage.choices.find(entry => entry.id === choiceId);
    if (!choice) return this.fail('没有这个选项。', 'INVALID_CHOICE');
    const effect = storyEffect(portrait, pending.index, choiceId)!;
    if (effect.items && !this.has(effect.items)) return this.fail(`需要${resourceLabel(effect.items)}，仓里还不够。`, 'INSUFFICIENT_RESOURCES');
    if (this.room() < sum(effect.items ?? {})) return this.fail('仓库腾不出位置，先清理一下库存。', 'WAREHOUSE_FULL');

    progress[portrait] = [...(progress[portrait] ?? []), choiceId];
    if (effect.items) this.add(effect.items);
    if (effect.coins) this.state.coins += effect.coins;
    if (effect.prestige) this.state.prestige += effect.prestige;
    this.log(`${record.name}：${choice.reply}`, 'success');
    return this.success(choice.reply, { items: effect.items, coins: effect.coins, prestige: effect.prestige });
  }

  isUnlocked(kind: BuildingKind): boolean {
    const technology = BUILDINGS[kind].technology;
    return !technology || this.state.researched.includes(technology);
  }

  warehouseIncrement(): number { return this.state.researched.includes('logistics') ? 96 : 80; }

  researchStatus(id: TechnologyId): { completed: boolean; available: boolean; reason: string } {
    const definition = TECHNOLOGIES[id];
    if (!definition) return { completed: false, available: false, reason: '没有这项科技' };
    if (this.state.researched.includes(id)) return { completed: true, available: false, reason: '已掌握' };
    const missing = definition.requires.filter(key => !this.state.researched.includes(key));
    const reason = missing.length ? `先研究「${TECHNOLOGIES[missing[0]].name}」`
      : this.state.level < definition.level ? `小镇达到 ${definition.level} 级`
      : this.state.prestige < definition.prestige ? `还需 ${definition.prestige - this.state.prestige} 声望`
      : this.state.coins < definition.coins ? `还需 ${definition.coins - this.state.coins} 金币`
      : !this.has(definition.items) ? '研究材料不足' : '';
    return { completed: false, available: !reason, reason };
  }

  research(id: TechnologyId): ActionResult {
    if (!TECHNOLOGY_KEYS.includes(id)) return this.fail('没有这项科技。', 'UNKNOWN_TECHNOLOGY');
    const status = this.researchStatus(id);
    if (!status.available) return this.fail(status.reason, status.completed ? 'ALREADY_RESEARCHED' : 'RESEARCH_LOCKED');
    const definition = TECHNOLOGIES[id];
    this.state.coins -= definition.coins; this.state.prestige -= definition.prestige;
    this.deduct(definition.items); this.state.researched.push(id);
    if (id === 'logistics') this.state.capacity = Math.floor(this.state.capacity * 1.2);
    this.updateNeeds();
    return this.success(`已掌握「${definition.name}」！${definition.unlocks.length ? '新的工坊蓝图已收入建造目录。' : definition.description}`, { coins: -definition.coins });
  }

  placementIssue(x:number,y:number,movingId?:string): {code:string;message:string}|null {
    if(!whole(x)||!whole(y)||x<1||y<1||x>=MAP_SIZE-1||y>=MAP_SIZE-1)return {code:'INVALID_TILE',message:'请选择小镇范围内的空地。'};
    const terrain=terrainReason(x,y);
    if(terrain)return {code:'INVALID_TERRAIN',message:terrain};
    if(this.roadAt(x,y))return {code:'ROAD_OCCUPIED',message:'这里是道路，建筑和树木不能占用路面。请选择旁边空地，或先移除这段道路。'};
    if(this.state.buildings.some(b=>b.id!==movingId&&b.x===x&&b.y===y))return {code:'TILE_OCCUPIED',message:'这里已有建筑或树木，请选择空地。'};
    return null;
  }

  build(kind: BuildingKind, x: number, y: number): ActionResult {
    if (!BUILDING_KEYS.includes(kind)) return this.fail('没有这种建筑。', 'UNKNOWN_BUILDING');
    if (!this.isUnlocked(kind)) return this.fail(`先研究「${TECHNOLOGIES[BUILDINGS[kind].technology!].name}」，获得工坊蓝图。`, 'TECHNOLOGY_REQUIRED');
    const ornamentReason = this.ornamentLock(kind);
    if (ornamentReason) return this.fail(ornamentReason, 'ORNAMENT_LOCKED');
    if (!whole(x) || !whole(y) || x < 1 || y < 1 || x >= MAP_SIZE - 1 || y >= MAP_SIZE - 1) return this.fail('请选择小镇范围内的空地。', 'INVALID_TILE');
    const issue=this.placementIssue(x,y);if(issue)return this.fail(issue.message,issue.code);
    if (kind === 'townhall' && this.state.buildings.some(building => building.kind === kind)) return this.fail('小镇已有议事厅，可以升级现有建筑。', 'UNIQUE_BUILDING');
    if (kind === 'farm' && this.state.buildings.filter(building => building.kind === 'farm').length >= Math.floor(this.state.population / 2) + 2) return this.fail('现有居民能照料的农田已满，迎接新居民后再开垦吧。', 'POPULATION_REQUIRED');

    const definition = BUILDINGS[kind];
    const materials = { wood: definition.wood, stone: definition.stone, ...definition.materials };
    if (this.state.coins < definition.cost) return this.fail(`还需要 ${definition.cost - this.state.coins} 金币。`, 'INSUFFICIENT_GOLD');
    if (!this.has(materials)) return this.fail(`建造需要${resourceLabel(materials)}。`, 'INSUFFICIENT_RESOURCES');
    this.state.coins -= definition.cost; this.deduct(materials);
    const availableWorkers = Math.max(0, this.state.population - this.assignedWorkers());
    const building: Building = { id: this.id('building'), kind, x, y, level: 1, progress: 0, ready: false, paused: false, stock: {}, workers: Math.min(definition.workers ?? 0, availableWorkers) };
    this.state.buildings.push(building); this.state.stats.buildingsBuilt++;
    if (kind === 'warehouse') this.state.capacity += this.warehouseIncrement();
    this.earn(0, 15); this.updateNeeds();
    const staffingMessage = (building.workers ?? 0) < (definition.workers ?? 0) ? '空闲居民不足，可在工坊安排人手。' : '';
    return this.success(`${definition.name}建好了，小镇又多了一份生机。${staffingMessage}`, { buildingId: building.id, coins: -definition.cost });
  }

  moveBuilding(id:string,x:number,y:number):ActionResult {
    const building=this.state.buildings.find(b=>b.id===id);
    if(!building)return this.fail('没有找到这座建筑。','BUILDING_NOT_FOUND');
    if(building.x===x&&building.y===y)return this.fail('建筑已经在这里了。','NO_CHANGE');
    const issue=this.placementIssue(x,y,id);if(issue)return this.fail(issue.message,issue.code);
    building.x=x;building.y=y;this.updateNeeds();
    return this.success(`${BUILDINGS[building.kind].name}已搬到${DISTRICTS[districtAt(x,y)].name}，生产进度与物资已保留。`,{buildingId:id});
  }

  arrangeDistricts():ActionResult {
    // Keep homes and services together, then distribute workshops into their suggested districts.
    const occupied=new Set(this.state.buildings.filter(b=>preferredDistrict(b.kind)==='residential').map(b=>`${b.x},${b.y}`));
    const changes: {building:Building;x:number;y:number}[]=[];
    for(const building of this.state.buildings){
      const district=preferredDistrict(building.kind);if(district==='residential')continue;
      const center=DISTRICTS[district];
      const choices:{x:number;y:number;distance:number}[]=[];
      for(let x=2;x<MAP_SIZE-2;x++)for(let y=2;y<MAP_SIZE-2;y++){
        if(terrainAt(x,y)!=='land'||districtAt(x,y)!==district||occupied.has(`${x},${y}`)||this.roadAt(x,y))continue;
        choices.push({x,y,distance:Math.hypot(x-center.x,y-center.y)+(x%2===0&&y%2===0?0:4)});
      }
      choices.sort((a,b)=>a.distance-b.distance||a.y-b.y||a.x-b.x);
      const tile=choices[0];if(!tile)return this.fail('对应分区没有足够空地。','NO_SPACE');
      occupied.add(`${tile.x},${tile.y}`);changes.push({building,x:tile.x,y:tile.y});
    }
    if(!changes.length)return this.fail('暂时没有需要整理的生产建筑。','NO_CHANGE');
    this.state.layoutUndo=this.state.buildings.map(({id,x,y})=>({id,x,y}));
    for(const {building,x,y} of changes){building.x=x;building.y=y;}
    this.updateNeeds();return this.success('工坊与农田已按分区安置。等级、工人、产物和进度全部保留，可随时单独搬迁。');
  }

  undoArrangement():ActionResult {
    const previous=this.state.layoutUndo;
    if(!previous?.length)return this.fail('没有待还原的分区整理。','NO_LAYOUT_BACKUP');
    const targets=new Map(previous.map(t=>[t.id,t]));const occupied=new Set<string>();
    for(const b of this.state.buildings){const t=targets.get(b.id)||b,key=`${t.x},${t.y}`;if(occupied.has(key)||terrainAt(t.x,t.y)!=='land'||this.roadAt(t.x,t.y))return this.fail('原位置已有建筑或道路，请先移开后再还原。','TILE_OCCUPIED');occupied.add(key);}
    for(const b of this.state.buildings){const t=targets.get(b.id);if(t){b.x=t.x;b.y=t.y;}}
    delete this.state.layoutUndo;this.updateNeeds();return this.success('已还原整理前的建筑位置，经营进度保持不变。');
  }

  roadAt(x:number,y:number){return this.state.roads?.find(r=>r.x===x&&r.y===y);}
  paveRoad(a:Tile,b:Tile,kind:RoadKind|'remove'):ActionResult {
    if(kind!=='remove'&&!Object.hasOwn(ROAD_TYPES,kind))return this.fail('没有这种路面。','INVALID_ROAD');
    const tiles=roadLine(a,b);if(!tiles.length)return this.fail('请在河谷内选择道路起点和终点。','INVALID_TILE');
    for(const t of tiles){
      if(terrainAt(t.x,t.y)==='bridge')continue;
      if(terrainReason(t.x,t.y))return this.fail('路线经过河道或山峰，请沿河岸或已有桥梁规划。','INVALID_TERRAIN');
      if(this.state.buildings.some(v=>v.x===t.x&&v.y===t.y))return this.fail('路线经过建筑，请绕开建筑再铺设。','TILE_OCCUPIED');
    }
    const land=tiles.filter(t=>terrainAt(t.x,t.y)==='land');
    const roads=this.state.roads??[],quote=roadQuote(roads,land,kind);
    if(!quote.changed)return this.fail('这段路已是相同或更高等级，无需重复铺设。','NO_CHANGE');
    if(this.state.coins<quote.coins||this.state.resources.stone<quote.stone)return this.fail(`本段需要 ${quote.coins} 金币、${quote.stone} 石料。`,'INSUFFICIENT_RESOURCES');
    const next=new Map(roads.map(r=>[tileKey(r),r]));
    for(const t of land){const key=tileKey(t),old=next.get(key);
      if(kind==='remove')next.delete(key);
      else if(!old||ROAD_TYPES[old.kind].rank<ROAD_TYPES[kind].rank)next.set(key,{...t,kind});
    }
    this.state.coins-=quote.coins;this.state.resources.stone-=quote.stone;this.state.roads=[...next.values()];
    return this.success(kind==='remove'?`已移除 ${quote.changed} 格路面，空地可以重新规划。`:`已铺好 ${quote.changed} 格${ROAD_TYPES[kind].name}，花费 ${quote.coins} 金币、${quote.stone} 石料。`,{coins:-quote.coins});
  }
  plantCrop(crop:CropId,id?:string):ActionResult {
    if(!CROP_IDS.includes(crop))return this.fail('没有这个作物品种。','UNKNOWN_CROP');
    const level=gardenLevel(this.state.farming!.xp).level;
    if(CROPS[crop].level>level)return this.fail(`园艺达到 ${CROPS[crop].level} 级，自然解锁${CROPS[crop].name}。`,'CROP_LOCKED');
    const fields=this.state.buildings.filter(b=>b.kind==='farm'&&(!id||b.id===id));
    if(!fields.length)return this.fail('先开垦一块田地，再来选种子。','FARM_REQUIRED');
    const keepWheat=!id&&crop!=='wheat'&&fields.length>1&&this.state.buildings.some(b=>!b.damaged&&BUILDINGS[b.kind].input?.wheat);
    for(const [index,b] of fields.entries()){const chosen=keepWheat&&index===0?'wheat':crop;if(b.ready||b.progress>0){if((b.crop??'wheat')===chosen)delete b.nextCrop;else b.nextCrop=chosen;}else{b.crop=chosen;delete b.nextCrop;}b.fallow=false;}
    return this.success(`${fields.length-(keepWheat?1:0)} 块田选择了${CROPS[crop].name}。${keepWheat?'已为磨坊保留 1 块小麦田。':''}现有作物收完后换种，种子免费。`);
  }
  setAutoReplant(enabled:boolean):ActionResult {
    if(typeof enabled!=='boolean')return this.fail('请选择是否自动续种。','INVALID_ARGUMENTS');
    this.state.farming!.autoReplant=enabled;
    if(enabled)for(const b of this.state.buildings)if(b.kind==='farm')b.fallow=false;
    return this.success(enabled?'已开启自动续种，收获后会继续种同样的作物。':'收获后田地会休耕，选一次种子即可再种。');
  }
  private recordFarmHarvest(b:Building,quantity:number,rare=false,coins=0){
    const f=this.state.farming!,crop=b.crop??'wheat';
    if(crop==='wheat')rare=harvestQuote(crop,b.level,b.tended??0,Number(b.id.replace(/\D/g,''))||1).rare;
    f.album[crop]+=quantity;f.rare[crop]+=Number(rare);f.harvested+=quantity;f.xp+=quantity+(rare?10:0);f.coinsEarned+=coins;
    b.tended=(b.tended??0)+1;
    if(b.nextCrop){b.crop=b.nextCrop;delete b.nextCrop;}
    b.fallow=!f.autoReplant;
  }
  private takeCrop(b:Building){
    const harvest=b.cropHarvest!,coins=harvest.quantity*CROPS[harvest.crop].price*(harvest.rare?2:1);
    this.earn(coins);this.state.stats.collected+=harvest.quantity;
    this.recordFarmHarvest(b,harvest.quantity,harvest.rare,coins);
    delete b.cropHarvest;b.stock={};b.ready=false;b.progress=0;
    return {coins,quantity:harvest.quantity,name:CROPS[harvest.crop].name,rare:harvest.rare};
  }
  collectAll():ActionResult {
    const ready=this.state.buildings.filter(b=>b.ready&&(sum(b.stock)>0||b.cropHarvest)).sort((a,b)=>this.harvestPriority(b)-this.harvestPriority(a));
    if(!ready.length)return this.fail('暂时没有成熟产物，稍后再来看看。','NOT_READY');
    const items:Partial<ResourceMap>={};let count=0,skipped=0,farmCoins=0,cropQuantity=0;
    for(const b of ready){
      if(b.cropHarvest){const crop=this.takeCrop(b);farmCoins+=crop.coins;cropQuantity+=crop.quantity;count++;continue;}
      if(sum(b.stock)>this.room()){skipped++;continue;}
      for(const key of RESOURCE_KEYS)items[key]=(items[key]??0)+(b.stock[key]??0);
      this.add(b.stock);this.state.stats.collected+=sum(b.stock);this.trackCrafts(b.stock);
      if(b.kind==='farm')this.recordFarmHarvest(b,sum(b.stock));
      b.stock={};b.ready=false;b.progress=0;count++;
    }
    if(!count)return this.fail('仓库已满，产物保留在工坊。先交订单或出售物资再收取。','WAREHOUSE_FULL');
    this.earn(0,count*2);this.updateNeeds();
    return this.success(`已一键收取 ${count} 处产物${resourceLabel(items)?`：${resourceLabel(items)}`:''}。${cropQuantity?`果蔬 ${cropQuantity} 份送到农摊，收入 ${farmCoins} 金币。`:''}${skipped?`仓位不足，另有 ${skipped} 处保留待收。`:''}`,{items,xp:count*2,farmCoins,cropQuantity});
  }

  collect(id: string): ActionResult {
    const building = this.state.buildings.find(candidate => candidate.id === id);
    if (!building) return this.fail('这座建筑已不在这里。', 'BUILDING_NOT_FOUND');
    if(building.ready&&building.cropHarvest){const h=this.takeCrop(building);this.earn(0,2);return this.success(`收获${h.name} ×${h.quantity}${h.rare?' · 珍品丰收！':'。'}农摊收入 ${h.coins} 金币。`,{buildingId:id,coins:h.coins,farmCoins:h.coins,cropQuantity:h.quantity,xp:2});}
    if (!building.ready || sum(building.stock) === 0) return this.fail('还没有可收取的产物，再等一小会儿。', 'NOT_READY');
    if (this.room() < sum(building.stock)) return this.fail('仓库快满了，先交订单、出售物资或扩建仓库。', 'WAREHOUSE_FULL');
    const items = { ...building.stock };
    this.add(items); this.state.stats.collected += sum(items); this.trackCrafts(items);
    if(building.kind==='farm')this.recordFarmHarvest(building,sum(items));
    building.stock = {}; building.ready = false; building.progress = 0;
    this.earn(0, 2); this.updateNeeds();
    return this.success(`收获${resourceLabel(items)}。`, { items, buildingId: id, xp: 2 });
  }

  upgrade(id: string): ActionResult {
    const building = this.state.buildings.find(candidate => candidate.id === id);
    if (!building) return this.fail('没有找到这座建筑。', 'BUILDING_NOT_FOUND');
    if (building.level >= 3) return this.fail('这座建筑已经达到最高等级。', 'MAX_LEVEL');
    if (building.damaged) return this.fail('请先修复建筑，再进行升级。', 'BUILDING_DAMAGED');
    const definition = BUILDINGS[building.kind];
    const cost = Math.ceil(definition.cost * 0.65 * building.level);
    const items: Partial<ResourceMap> = { wood: Math.ceil(definition.wood * 0.5 * building.level), stone: Math.ceil(definition.stone * 0.5 * building.level), materials: 3 * building.level };
    if (this.state.coins < cost) return this.fail(`升级需要 ${cost} 金币。`, 'INSUFFICIENT_GOLD');
    if (!this.has(items)) return this.fail(`升级需要${resourceLabel(items)}；建材可由商队带回。`, 'INSUFFICIENT_RESOURCES');
    this.state.coins -= cost; this.deduct(items); building.level++;
    if (building.kind === 'warehouse') this.state.capacity += this.warehouseIncrement();
    this.earn(0, 25); this.updateNeeds();
    return this.success(`${definition.name}升至 ${building.level} 级。`, { buildingId: id, coins: -cost });
  }

  demolish(id: string): ActionResult {
    const building = this.state.buildings.find(candidate => candidate.id === id);
    if (!building) return this.fail('没有找到这座建筑。', 'BUILDING_NOT_FOUND');
    if (building.kind === 'townhall') return this.fail('议事厅是小镇的中心，不能拆除。', 'PROTECTED_BUILDING');
    const capacityIssue = this.demolitionCapacityIssue(building);
    if (capacityIssue) return this.fail(capacityIssue.message, capacityIssue.code);
    const definition = BUILDINGS[building.kind];
    const refund = { wood: Math.floor(definition.wood * 0.3), stone: Math.floor(definition.stone * 0.3) };
    const capacityRemoved = building.kind === 'warehouse' ? this.warehouseIncrement() * building.level : 0;
    if (sum(this.state.resources) + sum(refund) > this.state.capacity - capacityRemoved) return this.fail('拆除后仓储不足，先腾出一些空间。', 'WAREHOUSE_FULL');
    this.state.buildings = this.state.buildings.filter(candidate => candidate.id !== id);
    if(this.state.layoutUndo)this.state.layoutUndo=this.state.layoutUndo.filter(t=>t.id!==id);
    this.state.capacity -= capacityRemoved; this.add(refund);
    const coins = Math.floor(definition.cost * 0.35); this.earn(coins);
    this.updateNeeds();
    return this.success(`已拆除${definition.name}，回收 ${coins} 金币及部分材料。`, { coins, items: refund, buildingId: id });
  }

  toggleProduction(id: string): ActionResult {
    const building = this.state.buildings.find(candidate => candidate.id === id);
    if (!building) return this.fail('没有找到这座建筑。', 'BUILDING_NOT_FOUND');
    if (!BUILDINGS[building.kind].cycle) return this.fail('这座建筑没有生产队列。', 'NOT_PRODUCTION');
    building.paused = !building.paused;
    return this.success(`${BUILDINGS[building.kind].name}已${building.paused ? '暂停' : '恢复'}生产。`, { buildingId: id });
  }

  adjustWorkforce(id: string, workerCount: number): ActionResult {
    const building = this.state.buildings.find(candidate => candidate.id === id);
    if (!building) return this.fail('没有找到这座建筑。', 'BUILDING_NOT_FOUND');
    const maximum = BUILDINGS[building.kind].workers ?? 0;
    if (!maximum) return this.fail('这座建筑不需要专职工人。', 'NOT_PRODUCTION');
    if (!whole(workerCount) || workerCount > maximum) return this.fail(`这座工坊可安排 0 至 ${maximum} 位工人。`, 'INVALID_WORKFORCE');
    const elsewhere = this.state.buildings.filter(candidate => candidate.id !== id).reduce((total, candidate) => total + (candidate.workers ?? 0), 0);
    if (elsewhere + workerCount > this.state.population) return this.fail('空闲居民不足，请先调整其他工坊的人手。', 'INSUFFICIENT_WORKFORCE');
    building.workers = workerCount;
    return this.success(`${BUILDINGS[building.kind].name}现在安排 ${workerCount} 位工人。`, { buildingId: id });
  }

  setProductionFocus(id: string, recipeId: string): ActionResult {
    const building = this.state.buildings.find(candidate => candidate.id === id);
    if (!building) return this.fail('没有找到这座建筑。', 'BUILDING_NOT_FOUND');
    if (!BUILDINGS[building.kind].cycle) return this.fail('这座建筑没有生产配方。', 'NOT_PRODUCTION');
    if (building.kind === 'lumber' && ['default', 'lumber', 'balanced', 'wood', 'plank'].includes(recipeId)) {
      const focus = (recipeId === 'default' || recipeId === 'lumber' ? 'balanced' : recipeId) as NonNullable<Building['productionFocus']>;
      if ((building.productionFocus ?? 'balanced') === focus && !building.paused) return this.fail('已经采用这个生产方向。', 'NO_CHANGE');
      building.productionFocus = focus; building.paused = false;
      return this.success(`木工坊已切换为${focus === 'wood' ? '木材优先' : focus === 'plank' ? '木板优先' : '均衡补货'}。已完成的产物保持不变。`, { buildingId: id });
    }
    if (recipeId !== building.kind && recipeId !== 'default') return this.fail('这座工坊尚未解锁该配方。', 'RECIPE_LOCKED');
    if (!building.paused) return this.fail('当前配方已经在生产中。', 'NO_CHANGE');
    building.paused = false;
    return this.success(`${BUILDINGS[building.kind].name}已恢复默认配方。`, { buildingId: id });
  }

  fulfillOrder(id: string): ActionResult {
    const index = this.state.orders.findIndex(order => order.id === id);
    if (index < 0) return this.fail('这笔订单已经离开了订单板。', 'ORDER_NOT_FOUND');
    const order = this.state.orders[index];
    if ((order.cooldownUntil ?? 0) > this.state.gameTime) return this.fail('新订单还在路上。', 'ORDER_COOLDOWN');
    if (!this.has(order.items)) return this.fail(`还没备齐${resourceLabel(order.items)}，去工坊看看吧。`, 'INSUFFICIENT_RESOURCES');
    this.deduct(order.items); this.earn(order.rewardCoins, order.rewardXp); this.state.stats.ordersCompleted++;
    this.state.orders[index] = this.generateOrder();
    return this.success(`已交付「${order.title}」，获得 ${order.rewardCoins} 金币。`, { coins: order.rewardCoins, xp: order.rewardXp });
  }

  cancelOrder(id: string): ActionResult {
    const index = this.state.orders.findIndex(order => order.id === id);
    if (index < 0) return this.fail('没有找到这笔订单。', 'ORDER_NOT_FOUND');
    if ((this.state.orders[index].cooldownUntil ?? 0) > this.state.gameTime) return this.fail('商人正在准备新订单。', 'ORDER_COOLDOWN');
    const replacement = this.generateOrder();
    replacement.cooldownUntil = this.state.gameTime + 60;
    this.state.orders[index] = replacement;
    return this.success('订单已取消，1 分钟后会收到新的委托。');
  }

  /** Picks where the next caravan goes. Only possible between trips, and only if unlocked. */
  chooseCaravanDestination(id: DestinationId): ActionResult {
    const options = availableDestinations(this.state.researched);
    const chosen = options.find(destination => destination.id === id);
    if (!chosen) return this.fail('这条路线还没有打听到，先研究对应的手艺吧。', 'DESTINATION_LOCKED');
    if (this.state.caravan.status === 'traveling') return this.fail('商队还在路上，等它回来再定下一趟。', 'CARAVAN_BUSY');
    if (this.state.caravan.destination === id) return this.success(`下一趟仍然前往${chosen.name}。`);
    this.state.caravan.destination = id;
    return this.success(`下一趟商队将前往${chosen.name}：${chosen.description}`);
  }

  dispatchCaravan(): ActionResult {
    const caravan = this.state.caravan;
    if (caravan.status === 'traveling') return this.fail('商队正在旅途中，回来后会带给你消息。', 'CARAVAN_BUSY');
    if (caravan.status === 'returned') {
      if (this.room() < caravan.rewardMaterials) return this.fail(`商队带回 ${caravan.rewardMaterials} 份建材，请先为它们腾出仓位。`, 'WAREHOUSE_FULL');
      const coins = caravan.rewardCoins; const items = { materials: caravan.rewardMaterials };
      this.add(items); this.earn(coins, 60); this.state.stats.caravansCompleted++; caravan.trips++;
      caravan.status = 'idle'; caravan.returnAt = 0;
      return this.success(`商队平安归来！获得 ${coins} 金币与 ${items.materials} 份建材。`, { coins, xp: 60, items });
    }
    if (!this.state.buildings.some(building => building.kind === 'market' && !building.damaged)) return this.fail('需要一座可用的集市来组织商队。', 'MARKET_REQUIRED');
    const destination = destinationOf(caravan.destination);
    // Everything is decided locally first: a refused departure must leave the caravan
    // exactly as it was, so the manifest is only written once the cargo is confirmed.
    const cargo = { ...destination.cargo };
    if (!this.has(cargo)) return this.fail(`前往${destination.name}需要${resourceLabel(cargo)}。`, 'INSUFFICIENT_RESOURCES');
    caravan.cargo = cargo;
    caravan.rewardCoins = destination.rewardCoins;
    caravan.rewardMaterials = destination.rewardMaterials;
    this.deduct(caravan.cargo); caravan.status = 'traveling';
    const marketLevel = Math.max(1, ...this.state.buildings.filter(building => building.kind === 'market').map(building => building.level));
    caravan.duration = caravanDuration(destination, marketLevel, hasProjectTitle(this.state, 'harbor'));
    caravan.returnAt = this.state.gameTime + caravan.duration;
    return this.success(`商队出发了，正前往${destination.name}。`);
  }

  setTax(rate: number): ActionResult {
    if (!whole(rate) || rate > 4) return this.fail('税率只能选择 0 至 4 档。', 'INVALID_TAX_RATE');
    if (this.state.taxRate === rate) return this.fail('当前已经采用这一档税率。', 'NO_CHANGE');
    this.state.taxRate = rate; this.updateNeeds();
    return this.success(`税率调整为${TAX_NAMES[rate]}（${TAX_RATES[rate]}%），居民的心情会逐渐变化。`);
  }

  festival(): ActionResult {
    if (this.state.festivalUntil > this.state.gameTime) return this.fail('庆典正在进行，尽情享受这段好时光吧。', 'FESTIVAL_ACTIVE');
    const cost = 180;
    if (this.state.coins < cost) return this.fail(`举办庆典需要 ${cost} 金币。`, 'INSUFFICIENT_GOLD');
    this.state.coins -= cost; this.state.happiness = Math.min(100, this.state.happiness + 12);
    this.state.festivalUntil = this.state.gameTime + 150; this.state.stats.festivals++;
    return this.success('邻里庆典开始了！幸福度 +12，欢快的气氛将持续一段时间。', { coins: -cost });
  }

  /** How many pets the town will take in at its current population. */
  petLimit(): number {
    return petCapacity(this.state.population);
  }

  /** How many more pets the town will take in, and why not when it is full. */
  petAdoptionIssue(): string | null {
    return adoptionIssue(this.state.pets ?? [], this.state.population);
  }

  /** Adoption is voluntary and permanent; the pet then trails a resident on the map. */
  adoptPet(kind: PetKind): ActionResult {
    if (!PET_KINDS.includes(kind)) return this.fail('没有这种小动物。', 'INVALID_PET');
    const definition = PETS[kind];
    const issue = this.petAdoptionIssue();
    if (issue) return this.fail(issue, 'PET_LIMIT');
    if (this.state.coins < definition.coins) return this.fail(`领养${definition.name}需要 ${definition.coins} 金币。`, 'INSUFFICIENT_GOLD');
    if (!this.has(definition.materials)) return this.fail(`还需要${Object.keys(definition.materials).length} 份${RESOURCES.materials.name}布置小屋。`, 'INSUFFICIENT_RESOURCES');
    this.state.coins -= definition.coins; this.deduct(definition.materials);
    this.state.pets ??= [];
    this.state.pets.push({ id: this.id('pet'), kind, follows: this.state.pets.length });
    this.state.happiness = Math.min(100, this.state.happiness + 2);
    return this.success(`${definition.name}住进了小镇，它会跟着邻居们一起散步。`);
  }

  /** Releases the most recently adopted pet. */
  releasePet(): ActionResult {
    const pets = this.state.pets ?? [];
    if (!pets.length) return this.fail('小镇还没有小动物。', 'NO_PETS');
    const [gone] = pets.splice(-1);
    return this.success(`${PETS[gone!.kind].name}去别处安家了。`);
  }

  /** A seasonal activity runs only while its own season lasts and the timer has not run out. */
  activityActive(): boolean {
    const activity = this.state.activity;
    return activity !== undefined && activity.endsAt > this.state.gameTime && activity.season === this.state.season;
  }

  /** Items the activity asks for that the town cannot spare, ignoring protected reserves. */
  activityShortfall(season: SeasonKey = this.state.season): Partial<ResourceMap> {
    const activity = activityOf(season);
    const shortfall: Partial<ResourceMap> = {};
    const woodReserve = this.woodReserve();
    const foodReserve = Math.max(3, Math.ceil(this.state.population / 4) * 3);
    for (const [key, amount] of Object.entries(activity.items) as [Resource, number][]) {
      if (this.state.resources[key] < amount) shortfall[key] = amount - this.state.resources[key];
    }
    // The activity must not eat the timber needed for building or the three-day larder.
    if (activity.items.wood && this.state.resources.wood - activity.items.wood < woodReserve) {
      shortfall.wood = activity.items.wood + woodReserve - this.state.resources.wood;
    }
    const foodAsked = (activity.items.bread ?? 0) + (activity.items.fish ?? 0);
    const foodHeld = this.state.resources.bread + this.state.resources.fish;
    if (foodAsked && foodHeld - foodAsked < foodReserve) {
      const missing = foodAsked + foodReserve - foodHeld;
      const key = (activity.items.bread ?? 0) >= missing ? 'bread' : 'fish';
      shortfall[key] = (shortfall[key] ?? 0) + missing;
    }
    return shortfall;
  }

  /** Starts the activity for the current season. Optional: skipping a season never costs anything. */
  startActivity(): ActionResult {
    const activity = activityOf(this.state.season);
    if (this.state.activity && this.state.activity.endsAt > this.state.gameTime) {
      return this.fail(`「${activityOf(this.state.activity.season).name}」正在进行，先享受这段好时光吧。`, 'ACTIVITY_ACTIVE');
    }
    if (this.state.coins < activity.coins) return this.fail(`举办${activity.name}需要 ${activity.coins} 金币。`, 'INSUFFICIENT_GOLD');
    const shortfall = this.activityShortfall();
    if (Object.keys(shortfall).length) {
      const missing = Object.entries(shortfall).map(([key, amount]) => `${amount} ${RESOURCES[key as Resource].name}`).join('、');
      return this.fail(`还差 ${missing}；活动只取富余物资，不动建造木材与三日口粮。`, 'INSUFFICIENT_RESOURCES');
    }
    this.state.coins -= activity.coins; this.deduct(activity.items);
    this.state.stats.activities = (this.state.stats.activities ?? 0) + 1;
    this.state.activity = { season: this.state.season, endsAt: this.state.gameTime + activity.duration };
    this.state.happiness = Math.min(100, this.state.happiness + activity.happiness);
    return this.success(`${activity.name}开始了！幸福度 +${activity.happiness}，好心情会持续一季中的这一小段。`, { coins: -activity.coins });
  }

  private completeActivities(): void {
    const activity = this.state.activity;
    if (!activity || activity.endsAt > this.state.gameTime) return;
    const name = SEASONAL_ACTIVITIES[activity.season].name;
    delete this.state.activity;
    this.log(`${name}结束了，邻居们还在回味。下一个季节再见。`, 'info');
  }

  sell(resource: Resource, amount: number): ActionResult {
    if (!RESOURCE_KEYS.includes(resource) || !whole(amount) || amount <= 0) return this.fail('请选择有效的物资和正整数数量。', 'INVALID_QUANTITY');
    if (this.state.resources[resource] < amount) return this.fail(`${RESOURCES[resource].name}库存不足。`, 'INSUFFICIENT_RESOURCES');
    const coins = RESOURCES[resource].sellPrice * amount;
    this.state.resources[resource] -= amount; this.earn(coins);
    return this.success(`售出 ${amount} 份${RESOURCES[resource].name}，获得 ${coins} 金币。`, { coins });
  }

  projectStatus(id:ProjectId) {
    const completed=this.state.projects?.stages[id]??0,project=PROJECTS[id];
    const stage=project.stages[completed];
    if(!stage)return {completed,stage:null,requirements:[],progress:100,ready:false,reason:'已获得小镇称号'};
    const metrics=projectMetrics(this.state);
    const requirements=stage.requirements.map(r=>({...r,current:metrics[r.metric]}));
    const progress=Math.floor(requirements.reduce((n,r)=>n+Math.min(1,r.current/r.target),0)/requirements.length*100);
    const foodLeft=this.state.resources.bread+this.state.resources.fish-(stage.contribution.bread??0)-(stage.contribution.fish??0);
    const reason=this.state.projects?.active!==id?'先将这个计划设为当前目标':requirements.some(r=>r.current<r.target)?'先完成上方建设目标':!this.has(stage.contribution)?'筹备物资还没备齐':this.state.resources.wood-(stage.contribution.wood??0)<this.woodReserve()?'先留足建造和取暖木材':((stage.contribution.bread??0)+(stage.contribution.fish??0)>0&&foodLeft<Math.ceil(this.state.population/4)*3)?'捐赠后需为居民留足三天口粮':'';
    return {completed,stage,requirements,progress,ready:!reason,reason};
  }
  chooseProject(id:ProjectId):ActionResult {
    if(!PROJECT_IDS.includes(id))return this.fail('没有这个小镇计划。','UNKNOWN_PROJECT');
    if(hasProjectTitle(this.state,id))return this.fail('这个计划已经完成，可以选择其他方向。','PROJECT_COMPLETE');
    this.state.projects??=freshProjects();
    this.state.projects.active=id;
    return this.success(`正在筹备「${PROJECTS[id].name}」。可以随时更换方向，已完成的阶段会保留。`);
  }
  completeProject(id:ProjectId):ActionResult {
    if(!PROJECT_IDS.includes(id))return this.fail('没有这个小镇计划。','UNKNOWN_PROJECT');
    const status=this.projectStatus(id);
    if(!status.ready||!status.stage)return this.fail(status.reason,'PROJECT_NOT_READY');
    this.deduct(status.stage.contribution);
    const projects=this.state.projects!,stage=++projects.stages[id];
    const xp=100+stage*50;this.earn(0,xp);this.state.prestige+=stage+1;
    const final=stage===PROJECTS[id].stages.length;
    if(final)projects.active=null;
    this.updateNeeds();
    return this.success(final?`「${PROJECTS[id].name}」落成！获得称号「${PROJECTS[id].title}」，${PROJECTS[id].perk}。`:`「${status.stage.name}」已完成，${PROJECTS[id].name}进入下一阶段。`,{xp});
  }

  claimQuest(id: string): ActionResult {
    this.syncQuests();
    const quest = this.state.quests.find(candidate => candidate.id === id);
    if (!quest) return this.fail('没有找到这个目标。', 'QUEST_NOT_FOUND');
    if (quest.claimed) return this.fail('这份奖励已经领过了。', 'ALREADY_CLAIMED');
    if (quest.progress < quest.target) return this.fail('还差一点点就能完成这个目标。', 'QUEST_INCOMPLETE');
    quest.claimed = true; this.earn(quest.rewardCoins, quest.rewardXp); this.state.prestige += quest.rewardPrestige;
    return this.success(`目标「${quest.title}」达成！获得 ${quest.rewardCoins} 金币与 ${quest.rewardPrestige} 声望。`, { coins: quest.rewardCoins, xp: quest.rewardXp });
  }

  /** Repairing takes time and shows scaffolding; the building stays out of production until done. */
  repair(id: string): ActionResult {
    const building = this.state.buildings.find(candidate => candidate.id === id);
    if (!building) return this.fail('没有找到这座建筑。', 'BUILDING_NOT_FOUND');
    if (!building.damaged) return this.fail('这座建筑目前不需要修缮。', 'NOT_DAMAGED');
    if (building.repairingUntil !== undefined) return this.fail('工匠已经在修缮这座建筑了。', 'REPAIR_IN_PROGRESS');
    const cost = disasterOf(building.damageKind).repair;
    if (this.state.coins < cost.coins || !this.has({ wood: cost.wood, stone: cost.stone })) {
      return this.fail(`修缮需要 ${cost.coins} 金币、${cost.wood} 木材和 ${cost.stone} 石料。`, 'INSUFFICIENT_RESOURCES');
    }
    this.state.coins -= cost.coins; this.deduct({ wood: cost.wood, stone: cost.stone });
    building.repairingUntil = this.state.gameTime + REPAIR_SECONDS;
    this.state.stats.repairs++;
    return this.success(`工匠开始修缮${BUILDINGS[building.kind].name}，稍后就恢复生产。`, { buildingId: id, coins: -cost.coins });
  }

  /** Finishes any repair whose scaffolding time is up. Shared by online and offline time. */
  private completeRepairs(): void {
    for (const building of this.state.buildings) {
      if (building.repairingUntil === undefined || building.repairingUntil > this.state.gameTime) continue;
      building.damaged = false; delete building.damageKind; delete building.repairingUntil;
      this.state.happiness = Math.min(100, this.state.happiness + 3);
      this.log(`${BUILDINGS[building.kind].name}已经修好，可以继续使用了。`, 'success');
    }
  }

  housingCapacity(excludeId?: string): number {
    return this.state.buildings.filter(b => b.id !== excludeId && !b.damaged).reduce((total, b) => total + (BUILDINGS[b.kind].housing ?? 0) * b.level, 0);
  }
  communityCapacity(excludeId?: string): number {
    return 12 + (gardenLevel(this.state.farming?.xp??0).level-1)*2 + (hasProjectTitle(this.state,'garden')?12:0) + this.state.buildings.filter(b => b.id !== excludeId && !b.damaged).reduce((total, b) => total + (BUILDINGS[b.kind].populationCap ?? 0) * b.level, 0);
  }
  demolitionCapacityIssue(building: Building): { code: string; message: string } | null {
    const def = BUILDINGS[building.kind];
    if (def.housing && this.housingCapacity(building.id) < this.state.population) return { code: 'HOUSING_REQUIRED', message: '这里还住着居民，请先建造足够的新住房。' };
    if (def.populationCap && this.communityCapacity(building.id) < this.state.population) return { code: 'COMMUNITY_REQUIRED', message: '社区人口名额不足，请先建造或升级其他学校、诊所或剧院。' };
    return null;
  }
  private assignedWorkers(): number { return this.state.buildings.reduce((total, building) => total + (building.workers ?? BUILDINGS[building.kind].workers ?? 0), 0); }
  private reconcileWorkforce(): void {
    let available = this.state.population;
    for (const building of this.state.buildings) {
      building.workers = Math.min(building.workers ?? BUILDINGS[building.kind].workers ?? 0, available);
      available -= building.workers;
    }
  }
  private populationCapacity(): number {
    return Math.min(this.housingCapacity(), this.communityCapacity());
  }
  private updateNeeds(): void {
    const homes = this.state.buildings.filter(building => BUILDINGS[building.kind].housing && !building.damaged);
    const wells = this.state.buildings.filter(building => BUILDINGS[building.kind].waterRadius && !building.damaged);
    const watered = homes.filter(home => wells.some(well => Math.hypot(home.x - well.x, home.y - well.y) <= BUILDINGS[well.kind].waterRadius! + well.level - 1));
    const food = this.state.resources.fish + this.state.resources.bread;
    this.state.needs.food = clamp(food / Math.max(1, Math.ceil(this.state.population / 4) * 3) * 100, 0, 100);
    this.state.needs.water = homes.length ? watered.reduce((n, b) => n + BUILDINGS[b.kind].housing! * b.level, 0) / this.housingCapacity() * 100 : 0;
    this.state.needs.services = clamp(this.state.buildings.filter(building => BUILDINGS[building.kind].services && !building.damaged).reduce((total, building) => total + building.level * BUILDINGS[building.kind].services!, 10), 0, 100);
    this.state.needs.environment = clamp(60 + this.state.buildings.filter(building => !building.damaged).reduce((total, building) => total + building.level * (BUILDINGS[building.kind].environment ?? 0), 0) + collectionEnvironment(this.state.collections ?? {}) + storyEnvironment(this.state.stories ?? {}), 0, 100);
  }
  private targetHappiness(): number {
    const needs = this.state.needs;
    const basePenalty = [-5, 0, 6, 12, 20][this.state.taxRate];
    const penalty = basePenalty > 0 && this.state.researched.includes('civics') ? basePenalty / 2 : basePenalty;
    const damage = this.state.buildings.filter(building => building.damaged).length * 5;
    return clamp(needs.food * 0.4 + needs.water * 0.25 + needs.services * 0.2 + needs.environment * 0.15 - penalty - damage + (this.state.festivalUntil > this.state.gameTime ? 12 : 0) + (this.activityActive() ? ACTIVITY_HAPPINESS : 0), 10, 100);
  }
  private taxPerDay(happiness = this.state.happiness): number {
    if (this.state.needs.food <= 0 || happiness < 25) return 0;
    return Math.floor(this.state.population * this.state.taxRate * 3 * (happiness / 100));
  }
  private trackCrafts(items: Partial<ResourceMap>): void {
    this.state.stats.toolsProduced += items.tools ?? 0;
    this.state.stats.clothingProduced += items.clothing ?? 0;
  }
  stockTargets(): ResourceMap { return stockTargets(this.state); }
  woodReserve(): number { return woodReserve(this.state); }

  surplusQuote(): { items: Partial<ResourceMap>; quantity: number; coins: number } {
    const targets = this.stockTargets(); const items: Partial<ResourceMap> = {};
    for (const key of RESOURCE_KEYS) {
      // Caravan-only materials are never automatically sold. Keep every visible
      // order's ingredients as well as the normal operating buffer.
      if (key === 'materials') continue;
      const orders = this.state.orders.reduce((n, order) => n + (order.items[key] ?? 0), 0);
      const retain = Math.max(targets[key], orders, key === 'wood' ? this.woodReserve() : 0);
      const amount = Math.max(0, this.state.resources[key] - retain);
      if (amount) items[key] = amount;
    }
    return { items, quantity: sum(items), coins: RESOURCE_KEYS.reduce((n, key) => n + (items[key] ?? 0) * RESOURCES[key].sellPrice, 0) };
  }

  sellSurplus(resource?: Resource): ActionResult {
    if (resource !== undefined && !RESOURCE_KEYS.includes(resource)) return this.fail('没有这种物资。', 'UNKNOWN_RESOURCE');
    const quote = this.surplusQuote();
    const items = resource ? { [resource]: quote.items[resource] ?? 0 } : quote.items;
    const quantity = sum(items);
    if (!quantity) return this.fail('这些物资都在保留量内，暂时没有富余可出售。', 'NO_SURPLUS');
    const coins = RESOURCE_KEYS.reduce((n, key) => n + (items[key] ?? 0) * RESOURCES[key].sellPrice, 0);
    this.deduct(items); this.earn(coins); this.updateNeeds();
    return this.success(`已出售 ${quantity} 份富余物资，腾出 ${quantity} 格仓位，获得 ${coins} 金币。`, { coins });
  }

  private storedAndPending(): ResourceMap {
    const levels = { ...this.state.resources };
    for (const b of this.state.buildings) if (b.ready) for (const key of RESOURCE_KEYS) levels[key] += b.stock[key] ?? 0;
    return levels;
  }

  private harvestPriority(building: Building): number {
    const targets = this.stockTargets();
    return Math.max(0, ...RESOURCE_KEYS.filter(key => (building.stock[key] ?? 0) > 0).map(key =>
      (1 - this.state.resources[key] / Math.max(1, targets[key])) * (['wood', 'bread', 'fish'].includes(key) ? 2 : 1)));
  }

  private productionOutput(building: Building, targets = this.stockTargets(), limitStock = true): Partial<ResourceMap> {
    if(building.kind==='farm'&&building.crop&&building.crop!=='wheat')return {};
    let recipe = BUILDINGS[building.kind].output;
    if (building.kind === 'lumber') {
      const focus = building.productionFocus ?? 'balanced';
      recipe = focus === 'wood' ? { wood: 10 } : focus === 'plank' ? { wood: 2, plank: 4 }
        : this.state.resources.plank >= targets.plank ? { wood: 10 } : { wood: 6, plank: 2 };
    }
    const output: Partial<ResourceMap> = {};
    for (const key of RESOURCE_KEYS) {
      const amount = recipe?.[key];
      // Leave unneeded logs/boards at the forest: one full co-product must not
      // prevent gathering the other. Already completed stock is never rewritten.
      if (amount && !(limitStock && building.kind === 'lumber' && this.state.resources[key] >= targets[key]))
        output[key] = Math.max(1, Math.floor(amount * (1 + (building.level - 1) * 0.5))+(building.kind==='farm'?soilLevel(building.tended).bonus:0));
    }
    return output;
  }

  private productionBlock(building: Building, targets = this.stockTargets()): 'damaged' | 'workers' | 'materials' | 'reserve' | 'target' | 'warehouse' | 'fallow' | null {
    const def = BUILDINGS[building.kind];
    if (building.damaged) return 'damaged';
    if(building.kind==='farm'&&building.fallow)return 'fallow';
    if(building.kind==='farm'&&building.crop&&building.crop!=='wheat')return null;
    if (def.workers && building.workers === 0) return 'workers';
    const input = def.input ?? {}, output = this.productionOutput(building, targets);
    if (!this.has(input)) return 'materials';
    // Heating and building come before charcoal stockpiles; baking is still
    // allowed to use fuel so a low timber reserve cannot starve residents.
    if (BUILDINGS[building.kind].preserveWood && this.state.resources.wood - (input.wood ?? 0) < this.woodReserve()) return 'reserve';
    const levels = this.storedAndPending();
    if (!sum(output) || (!building.nextCrop && RESOURCE_KEYS.every(key => !(output[key] ?? 0) || levels[key] >= targets[key]))) return 'target';
    const growth = sum(output) - sum(input);
    if (growth > 0 && this.state.capacity - sum(levels) < growth) return 'warehouse';
    return null;
  }
  private cycleTime(building: Building): number {
    const definition = BUILDINGS[building.kind];
    const seasonal = building.kind === 'farm' && this.state.season === 'winter' ? 2.5 : building.kind === 'farm' && this.state.season === 'autumn' ? 0.85 : 1;
    const assigned = this.state.buildings.reduce((total, item) => total + (item.paused || item.damaged ? 0 : (item.workers ?? BUILDINGS[item.kind].workers ?? 0)), 0);
    const workforce = assigned > this.state.population ? assigned / Math.max(1, this.state.population) : 1;
    const morale = this.state.happiness < 35 ? 1.5 : 1;
    const staffing = definition.workers ? definition.workers / Math.max(1, building.workers ?? definition.workers) : 1;
    return (building.kind==='farm'?CROPS[building.crop??'wheat'].cycle:(definition.cycle??1)) * (building.kind==='farm'?1-soilLevel(building.tended).bonus*.04:1) * (this.state.researched.includes('efficiency') ? 0.9 : 1) * (hasProjectTitle(this.state,'craft')?0.95:1) * seasonal * workforce * staffing * morale * Math.max(0.6, 1 - (building.level - 1) * 0.15);
  }
  private canSupply(resource: Resource, visiting = new Set<Resource>()): boolean {
    if (visiting.has(resource)) return false;
    const next = new Set(visiting).add(resource);
    return this.state.buildings.some(building => {
      const definition = BUILDINGS[building.kind];
      return !building.damaged && !(building.kind==='farm'&&building.crop&&building.crop!=='wheat') && this.isUnlocked(building.kind) && (definition.output?.[resource] ?? 0) > 0
        && Object.keys(definition.input ?? {}).every(key => this.canSupply(key as Resource, next));
    });
  }
  private generateOrder(): Order {
    const available = RESOURCE_KEYS.filter(key => key !== 'materials' && this.canSupply(key));
    // A small starter town always retains a marketable source; otherwise request cheap wood.
    const pool = available.length ? available : ['wood' as Resource];
    const sequence = this.state.nextId;
    const first = pool[sequence % pool.length];
    const second = pool[(sequence + 3) % pool.length];
    const items: Partial<ResourceMap> = { [first]: 3 + sequence % 4 };
    if (second !== first) items[second] = 2 + sequence % 3;
    const rewardBase = RESOURCE_KEYS.reduce((total, key) => total + (items[key] ?? 0) * RESOURCES[key].sellPrice, 0);
    const template = items.tools || items.ingot ? { npc: '阿岳 · 铁匠师傅', title: '送往山外的好手艺' } : items.clothing || items.cloth ? { npc: '阿棉 · 裁缝学徒', title: '给邻居准备的新衣' } : INITIAL_ORDERS[sequence % INITIAL_ORDERS.length];
    return { id: this.id('order'), npc: template.npc, title: template.title, items, rewardCoins: Math.round(rewardBase * (this.state.season === 'winter' && ((items.bread ?? 0) + (items.fish ?? 0) > 0) ? 3.2 : 2.8)), rewardXp: 25 + sequence % 20 };
  }

  tick(seconds: number): void {
    if (!finite(seconds) || seconds <= 0) return;
    // Headless callers may advance multiple days at once; no caller can jump unbounded time.
    const elapsed = Math.min(seconds, MAX_OFFLINE_SECONDS);
    const previousTime = this.state.gameTime;
    this.state.gameTime += elapsed;
    this.state.season = (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor(this.state.gameTime / SEASON_SECONDS) % 4];
    const targets = this.stockTargets();
    for (const building of this.state.buildings) {
      const definition = BUILDINGS[building.kind];
      if (!definition.cycle || building.ready || building.paused || building.damaged || (definition.workers && building.workers === 0)) continue;
      const output = this.productionOutput(building, targets);
      if (this.productionBlock(building, targets)) continue;
      building.progress = Math.min(1, building.progress + elapsed / this.cycleTime(building));
      if (building.progress >= 1) { this.deduct(definition.input ?? {}); building.stock = output; building.ready = true;if(building.kind==='farm'&&building.crop&&building.crop!=='wheat')building.cropHarvest=harvestQuote(building.crop,building.level,building.tended??0,Number(building.id.replace(/\D/g,''))||1); }
    }
    if (this.state.caravan.status === 'traveling' && this.state.gameTime >= this.state.caravan.returnAt) {
      this.state.caravan.status = 'returned'; this.log('远方传来铃声，商队已经满载归来，去码头迎接他们吧。', 'success');
    }
    this.updateNeeds();
    this.state.happiness = clamp(this.state.happiness + (this.targetHappiness() - this.state.happiness) * Math.min(1, elapsed / 90), 0, 100);
    const newDays = Math.floor(this.state.gameTime / GAME_DAY_SECONDS) - Math.floor(previousTime / GAME_DAY_SECONDS);
    for (let day = 0; day < newDays; day++) this.settleDay();
    if (this.state.settings.disasters && this.state.gameTime - this.state.lastDisasterAt >= DISASTER_INTERVAL) this.triggerDisaster();
    this.completeRepairs();this.completeActivities();
    if (this.state.settings.autoMayor && this.state.gameTime - this.state.lastMayorAt >= 5) this.runMayor();
    this.syncProgress();
  }

  private settleDay(): void {
    let demand = Math.ceil(this.state.population / 4);
    for (const key of ['fish', 'bread'] as const) { const used = Math.min(demand, this.state.resources[key]); this.state.resources[key] -= used; demand -= used; }
    if (this.state.season === 'winter') { const fuel = Math.min(this.state.resources.wood, Math.ceil(this.state.population / 8)); this.state.resources.wood -= fuel; if (fuel === 0) this.state.happiness = Math.max(10, this.state.happiness - 3); }
    this.updateNeeds();
    const tax = this.taxPerDay(); this.earn(tax);
    if (demand > 0) { this.state.happiness = Math.max(10, this.state.happiness - 8); this.log('食物不足，居民有些担忧。收取鲜鱼或烤一些面包吧。', 'warning'); }
    const reserve = this.state.resources.fish + this.state.resources.bread;
    if (this.state.happiness >= 70 && reserve >= Math.ceil(this.state.population / 4) * 3 && this.state.population < this.populationCapacity()) {
      this.state.population++; this.log('一位新邻居搬来了！欢迎加入小镇。', 'success');
    } else if (this.state.happiness < 25 && this.state.population > 4) {
      this.state.population--; this.log('一位居民暂时离开了，请改善食物和饮水。', 'warning');
      this.reconcileWorkforce();
    }
  }

  /** Hazards are seasonal, and the player's defence is placement plus protective cover. */
  private triggerDisaster(): void {
    this.state.lastDisasterAt = this.state.gameTime;
    const season = this.state.season as SeasonKey;
    const guards = this.state.buildings.filter(building => !building.damaged && (building.kind === 'firetower' || building.kind === 'firestation'));
    const guarded = (building: Building): boolean => guards.some(tower =>
      Math.hypot(building.x - tower.x, building.y - tower.y) <= (tower.kind === 'firestation' ? 7 : 4) + tower.level - 1);

    const kind = DISASTER_KINDS[Math.floor(this.state.gameTime / DISASTER_INTERVAL) % DISASTER_KINDS.length];
    const candidates = this.state.buildings.filter(building => canStrike(kind, building, season, guarded(building)));
    if (candidates.length === 0) {
      this.log(`巡查结束：${disasterOf(kind).name}没有威胁到小镇，一切平安。`, 'info');
      return;
    }
    const building = candidates[Math.floor(this.state.gameTime / DISASTER_INTERVAL) % candidates.length];
    building.damaged = true; building.damageKind = kind;
    this.state.happiness = Math.max(10, this.state.happiness - (kind === 'fire' ? 5 : 3));
    this.log(disasterOf(kind).log.replace('%s', BUILDINGS[building.kind].name), 'warning');
  }

  private runMayor(): void {
    this.state.lastMayorAt = this.state.gameTime;
    const damaged = this.state.buildings.find(building => building.damaged);
    if (damaged) { const result = this.repair(damaged.id); if (result.ok) { this.log('市长助手：先修缮受损建筑，让大家安心工作。', 'mayor'); return; } }
    if (sum(this.state.resources) > this.state.capacity * 0.88 && this.surplusQuote().quantity > 0) {
      this.sellSurplus(); this.log('市长助手：出售超出保留量的库存，给口粮和建造材料留出仓位。', 'mayor');
    }
    if (this.state.buildings.some(b => b.ready && sum(b.stock) <= this.room())) this.collectAll();
    if (this.state.happiness < 60 && this.state.taxRate > 1) { this.setTax(1); this.log('市长助手：居民需要缓一缓，暂时降低税率。', 'mayor'); return; }
    if (this.state.caravan.status === 'returned') { const result = this.dispatchCaravan(); if (result.ok) { this.log('市长助手：商队已经回来了，建材已收入仓库。', 'mayor'); return; } }
    const foodReserve = Math.ceil(this.state.population / 4) * 3;
    const order = this.state.orders.find(candidate => (candidate.cooldownUntil ?? 0) <= this.state.gameTime && this.has(candidate.items) && this.state.resources.wood - (candidate.items.wood ?? 0) >= this.woodReserve() && this.state.resources.fish + this.state.resources.bread - (candidate.items.fish ?? 0) - (candidate.items.bread ?? 0) >= foodReserve);
    if (order) { this.fulfillOrder(order.id); this.log('市长助手：保留三日口粮后，交付一笔邻里订单。', 'mayor'); return; }
    if (this.state.caravan.status === 'idle' && this.has(this.state.caravan.cargo) && this.state.resources.fish + this.state.resources.bread > foodReserve + 11) {
      this.dispatchCaravan(); this.log('市长助手：物资充裕，让商队出发换回扩建材料。', 'mayor');
    }
  }

  offline(seconds: number): OfflineReport {
    const elapsed = finite(seconds) ? clamp(seconds, 0, MAX_OFFLINE_SECONDS) : 0;
    const report: OfflineReport = { seconds: elapsed, elapsed, capped: finite(seconds) && seconds > MAX_OFFLINE_SECONDS, produced: emptyResources(), consumed: emptyResources(), coins: 0, tax: 0, caravanReturned: false, happinessChange: 0, farmCoins:0, cropQuantity:0 };
    if (!elapsed) return report;
    const happiness = this.state.happiness;
    let remaining = elapsed;
    // Replenish and consume together. Settling eight hours of farms first and
    // kitchens last leaves a town full of wheat but without food or fuel.
    while (remaining > 0) {
      const step = Math.min(5, remaining, GAME_DAY_SECONDS - this.state.gameTime % GAME_DAY_SECONDS);
      const slice = this.offlineSlice(step);
      for (const key of RESOURCE_KEYS) { report.produced[key] += slice.produced[key]; report.consumed[key] += slice.consumed[key]; }
      report.farmCoins=(report.farmCoins??0)+(slice.farmCoins??0);report.cropQuantity=(report.cropQuantity??0)+(slice.cropQuantity??0);
      report.coins += slice.coins; report.tax += slice.tax; report.caravanReturned ||= slice.caravanReturned;
      remaining = Math.max(0, remaining - step);
    }
    report.happinessChange = this.state.happiness - happiness;
    this.state.lastDisasterAt = this.state.gameTime; this.state.lastMayorAt = this.state.gameTime;
    this.state.savedAt = Date.now(); this.syncProgress();
    this.log(`离开期间，工坊按需补货，累计获得 ${report.tax} 金币税收。`, 'info');
    return report;
  }

  private offlineSlice(seconds: number): OfflineReport {
    const elapsed = finite(seconds) ? clamp(seconds, 0, MAX_OFFLINE_SECONDS) : 0;
    const report: OfflineReport = { seconds: elapsed, elapsed, capped: finite(seconds) && seconds > MAX_OFFLINE_SECONDS, produced: emptyResources(), consumed: emptyResources(), coins: 0, tax: 0, caravanReturned: false, happinessChange: 0, farmCoins:0, cropQuantity:0 };
    if (elapsed <= 0) return report;
    const originalHappiness = this.state.happiness;
    const originalTime = this.state.gameTime;
    // Settle every chain in source-to-product order, independent of building placement order.
    const sequence = PRODUCTION_SEQUENCE;
    const candidates = sequence.flatMap(kind => this.state.buildings.filter(candidate => candidate.kind === kind && !candidate.paused && !candidate.damaged && !(BUILDINGS[kind].workers && candidate.workers === 0)));
    for (const building of candidates) {
      const kind = building.kind;
      if(kind==='farm'){
        const receive=()=>{
          if(building.cropHarvest){const h=this.takeCrop(building);report.farmCoins=(report.farmCoins??0)+h.coins;report.cropQuantity=(report.cropQuantity??0)+h.quantity;return true;}
          if(sum(building.stock)>this.room())return false;
          const items={...building.stock};this.add(items);for(const key of RESOURCE_KEYS)report.produced[key]+=items[key]??0;
          this.state.stats.collected+=sum(items);this.recordFarmHarvest(building,sum(items));building.stock={};building.ready=false;building.progress=0;return true;
        };
        if(building.ready&&!receive())continue;
        let remaining=elapsed;
        while(remaining>1e-8&&!building.fallow&&!building.ready&&!this.productionBlock(building)){
          const cycle=this.cycleTime(building),timeToHarvest=(1-building.progress)*cycle;
          if(timeToHarvest>remaining+1e-8){building.progress+=remaining/cycle;break;}
          remaining=Math.max(0,remaining-timeToHarvest);building.progress=1;building.ready=true;
          if(building.crop&&building.crop!=='wheat'){building.stock={};building.cropHarvest=harvestQuote(building.crop,building.level,building.tended??0,Number(building.id.replace(/\D/g,''))||1);}
          else building.stock=this.productionOutput(building);
          if(!receive())break;
        }
        continue;
      }
      if (building.paused || building.damaged || (BUILDINGS[kind].workers && building.workers === 0)) continue;
      if (building.ready && sum(building.stock) <= this.room()) {
        this.add(building.stock); for (const key of RESOURCE_KEYS) report.produced[key] += building.stock[key] ?? 0;
        this.state.stats.collected += sum(building.stock); this.trackCrafts(building.stock); building.stock = {}; building.ready = false; building.progress = 0;
      }
      if (building.ready) continue;
      const cycle = this.cycleTime(building);
      const totalProgress = elapsed / cycle + building.progress;
      const desired = Math.floor(totalProgress);
      const input = BUILDINGS[kind].input ?? {};
      const output = this.productionOutput(building);
      let possible = desired;
      for (const key of RESOURCE_KEYS) if ((input[key] ?? 0) > 0) possible = Math.min(possible, Math.floor(this.state.resources[key] / input[key]!));
      if (this.productionBlock(building)) possible = 0;
      possible = Math.max(0, possible);
      for (const key of RESOURCE_KEYS) {
        const used = (input[key] ?? 0) * possible; const made = (output[key] ?? 0) * possible;
        this.state.resources[key] += made - used; report.consumed[key] += used; report.produced[key] += made;
      }
      this.state.stats.collected += sum(output) * possible;
      this.trackCrafts({ tools: (output.tools ?? 0) * possible, clothing: (output.clothing ?? 0) * possible });
      // An unfinished batch cannot accumulate work while ingredients or storage are missing.
      // Keep earlier work when nothing could run; completed batches begin again at zero.
      const canContinue = !this.productionBlock(building);
      building.progress = possible === desired && canContinue ? totalProgress - desired : possible > 0 ? 0 : building.progress;
    }
    const days = Math.floor((originalTime + elapsed) / GAME_DAY_SECONDS) - Math.floor(originalTime / GAME_DAY_SECONDS);
    let demand = Math.ceil(this.state.population / 4) * days;
    let fed = 0;
    for (const key of ['fish', 'bread'] as const) { const used = Math.min(demand, this.state.resources[key]); this.state.resources[key] -= used; report.consumed[key] += used; demand -= used; fed += used; }
    this.state.gameTime += elapsed;
    this.state.season = (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor(this.state.gameTime / SEASON_SECONDS) % 4];
    if (this.state.season === 'winter' && days > 0) {
      const fuel = Math.min(this.state.resources.wood, Math.ceil(this.state.population / 8) * days);
      this.state.resources.wood -= fuel; report.consumed.wood += fuel;
    }
    this.completeRepairs();this.completeActivities();
    this.updateNeeds();
    const shortagePenalty = demand > 0 ? Math.min(18, demand) : 0;
    this.state.happiness = clamp(originalHappiness - shortagePenalty + (this.state.taxRate === 0 ? Math.min(5, days) : 0), 25, 100);
    const averageHappiness = (originalHappiness + this.state.happiness) / 2;
    const fedDays = days === 0 ? 0 : Math.min(days, fed / Math.max(1, Math.ceil(this.state.population / 4)));
    const tax = Math.floor(fedDays * this.state.population * this.state.taxRate * 3 * averageHappiness / 100);
    this.earn(tax); report.coins = tax+(report.farmCoins??0); report.tax = tax;
    if (this.state.caravan.status === 'traveling' && this.state.caravan.returnAt <= this.state.gameTime) { this.state.caravan.status = 'returned'; report.caravanReturned = true; }
    report.happinessChange = this.state.happiness - originalHappiness;
    return report;
  }

  /** Resume from a wall-clock anchor. A repeated or backwards timestamp never settles twice. */
  offlineUntil(now = Date.now()): OfflineReport {
    const anchor = this.state.savedAt;
    const report = this.offline(finite(now) && now > anchor ? (now - anchor) / 1000 : 0);
    if (finite(now) && now > anchor) this.state.savedAt = now;
    return report;
  }

  garden(){
    return {...clone(this.state.farming!),...gardenLevel(this.state.farming!.xp),crops:CROP_IDS.map(id=>({id,...CROPS[id],unlocked:CROPS[id].level<=gardenLevel(this.state.farming!.xp).level})),fields:this.state.buildings.filter(b=>b.kind==='farm').map(b=>({id:b.id,crop:b.crop??'wheat',nextCrop:b.nextCrop,ready:b.ready,paused:b.paused,fallow:!!b.fallow,blocked:this.productionBlock(b),progress:b.progress,soil:soilLevel(b.tended),cycle:this.cycleTime(b),harvest:clone(b.cropHarvest??null)}))};
  }

  observe() {
    this.updateNeeds(); this.syncProgress();
    return {
      gameTime: this.state.gameTime, season: this.state.season, level: this.state.level,
      researched: [...this.state.researched], technologies: TECHNOLOGY_KEYS.map(id => ({ id, ...TECHNOLOGIES[id], ...this.researchStatus(id) })),
      coins: this.state.coins, population: this.state.population, populationCapacity: this.populationCapacity(),
      housingCapacity: this.housingCapacity(), communityCapacity: this.communityCapacity(), happiness: Math.round(this.state.happiness),
      map: { size: MAP_SIZE-2, districts: Object.entries(DISTRICTS).map(([id,d])=>({id,...d,buildings:this.state.buildings.filter(b=>districtAt(b.x,b.y)===id).length})) },
      warehouseUsed: sum(this.state.resources), warehouseCapacity: this.state.capacity, warehouseFree: this.room(),
      taxPerDay: this.taxPerDay(), taxRate: this.state.taxRate, needs: clone(this.state.needs),
      stockTargets: this.stockTargets(), woodReserve: this.woodReserve(), surplus: this.surplusQuote(),
      farming:this.garden(),
      projects: PROJECT_IDS.map(id=>({id,name:PROJECTS[id].name,title:PROJECTS[id].title,perk:PROJECTS[id].perk,...this.projectStatus(id)})),
      resources: { ...this.state.resources }, orders: clone(this.state.orders), caravan: clone(this.state.caravan),
      readyBuildings: this.state.buildings.filter(building => building.ready).map(building => building.id),
      activity: this.activityActive() ? { ...this.state.activity } : null,
      achievements: achievementProgress(this.achievementMetrics(), this.state.achievements ?? []),
      collections: collectionProgress(this.state.buildings, this.state.collections ?? {}),
      stories: this.neighbourStories(),
      caravanRoutes: availableDestinations(this.state.researched).map(destination => ({
        ...destination,
        chosen: (this.state.caravan.destination ?? 'valley') === destination.id,
        missing: missingCargo(destination, this.state.resources),
      })),
      pets: (this.state.pets ?? []).map(pet => ({ ...pet, name: PETS[pet.kind].name })),
      petLimit: petCapacity(this.state.population),
      alerts: this.state.buildings.filter(building => building.damaged || building.repairingUntil !== undefined).map(building => ({
        buildingId: building.id,
        type: building.damaged ? (building.damageKind ?? 'fire') : 'repairing',
        name: building.damaged ? disasterOf(building.damageKind).name : '修缮中',
        advice: building.damaged ? disasterOf(building.damageKind).advice : '',
        repairingUntil: building.repairingUntil,
        x: building.x, y: building.y,
      })),
      production: this.state.buildings.filter(building => BUILDINGS[building.kind].cycle).map(building => ({ buildingId: building.id, kind: building.kind, paused: building.paused, ready: building.ready, input: BUILDINGS[building.kind].input ?? {}, output: this.productionOutput(building, this.stockTargets(), false), cycle: this.cycleTime(building), focus: building.productionFocus ?? 'balanced', blocked: this.productionBlock(building) })),
    };
  }
}
