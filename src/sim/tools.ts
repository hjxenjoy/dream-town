import { PLAYABLE_SIZE } from './terrain.ts';
import { CROP_IDS, type CropId } from './farming.ts';
import { PROJECT_IDS, type ProjectId } from './projects.ts';
import type { RoadKind } from './roads.ts';
import { BUILDING_KEYS, MARKET_GOODS, TECHNOLOGY_KEYS, RESOURCE_KEYS, type Resource, type TechnologyId, type BuildingKind } from './data.ts';
import { SimWorld, type ActionResult } from './world.ts';

type Parameters = Record<string, unknown>;
interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Parameters };
}
const coordinate = { type: 'integer', minimum: 1, maximum: PLAYABLE_SIZE };
const string = { type: 'string' };
function tool(name: string, description: string, properties: Parameters = {}, required: string[] = []): ToolDefinition {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } };
}

/** Portable function-calling descriptions. Providers are intentionally kept outside the simulation. */
export const GAME_TOOLS: ToolDefinition[] = [
  tool('get_garden','查看园艺成长、作物解锁、土地状态与收获图鉴。'),
  tool('plant_crop','选择下一茬作物，保留正在生长或成熟的收成；省略 buildingId 则批量换种并为磨坊保留一块小麦田。',{cropId:{type:'string',enum:CROP_IDS},buildingId:string},['cropId']),
  tool('set_auto_replant','开启或关闭收获后的自动续种，不改变正在生长的作物。',{enabled:{type:'boolean'}},['enabled']),
  tool('get_town_projects', '查看三条建设计划、当前阶段、筹备条件与永久效果。'),
  tool('choose_town_project', '选择当前建设方向；可免费切换，保留已完成阶段。', {projectId:{type:'string',enum:PROJECT_IDS}}, ['projectId']),
  tool('complete_town_project', '明确交付当前建设阶段的筹备物资；校验建设条件并保留口粮与木材，不可重复领奖。', {projectId:{type:'string',enum:PROJECT_IDS}}, ['projectId']),
  tool('sell_surplus', '按仓库保留量批量出售富余物资，保留当前订单原料和全部建材包；不传 resource 则出售全部富余种类。', { resource: { type: 'string', enum: RESOURCE_KEYS } }),
  tool('buy_resource', '从集市买进物资，价格是卖出价的数倍，用于应急；建材包与商队货物不在此列。', { resource: { type: 'string', enum: MARKET_GOODS }, amount: { type: 'integer', minimum: 1, maximum: 999 } }, ['resource', 'amount']),
  tool('collect_all', '一键收取所有可入库的成熟产物，满仓批次留在工坊。'),
  tool('pave_road', '以两个端点铺设转角道路；升级仅补差价，建筑与道路不得重叠。', { x:coordinate,y:coordinate,endX:coordinate,endY:coordinate,surface:{type:'string',enum:['dirt','gravel','stone','remove']} }, ['x','y','endX','endY','surface']),
  tool('research_technology', '消耗声望、金币和材料掌握科技；检查等级、前置科技且不可重复研究。', { technologyId: { type: 'string', enum: TECHNOLOGY_KEYS } }, ['technologyId']),
  tool('get_technologies', '查询科技的前置条件、消耗、效果和当前可研究状态。'),
  tool('move_building', '免费搬迁建筑，保留等级、工人、库存与进度；不能放在河道、桥梁和山峰。', { buildingId: string, x: coordinate, y: coordinate }, ['buildingId','x','y']),
  tool('build_building', '在空地建造建筑；校验地块、人口、金币和材料。', { x: coordinate, y: coordinate, buildingType: { type: 'string', enum: BUILDING_KEYS } }, ['x', 'y', 'buildingType']),
  tool('demolish_building', '拆除建筑并回收部分材料；居民住房与仓储受保护。', { x: coordinate, y: coordinate }, ['x', 'y']),
  tool('upgrade_building', '消耗金币和商队建材升级建筑，最高三级。', { x: coordinate, y: coordinate }, ['x', 'y']),
  tool('set_tax_rate', '调整税率，在收入与幸福度间取得平衡。', { level: { type: 'string', enum: ['very_low', 'low', 'medium', 'high', 'extortion'] } }, ['level']),
  tool('fulfill_order', '从仓库交付物资，获得金币与经验。', { orderId: string }, ['orderId']),
  tool('dispatch_caravan', '派出补给商队前往已选定的目的地；返回后同一工具领取货物。', { caravan: { type: 'string' } }),
  tool('choose_caravan_route', '为某支商队选择下一趟目的地。不同路线货物、时长与回报不同，并走不同的桥。', { destination: { type: 'string', enum: ['valley', 'hilltown', 'rivermouth'] }, caravan: { type: 'string' } }, ['destination']),
  tool('collect_production', '收取成熟农田或已完工工坊的产物。', { buildingId: string }, ['buildingId']),
  tool('set_production_focus', '木工坊可选择 balanced 均衡、wood 木材优先、plank 木板优先；其他工坊恢复默认配方。', { buildingId: string, recipeId: { type: 'string', enum: ['default', 'balanced', 'wood', 'plank', ...BUILDING_KEYS] } }, ['buildingId', 'recipeId']),
  tool('adjust_workforce', '在现有居民范围内安排工坊工人。', { buildingId: string, workerCount: { type: 'integer', minimum: 0, maximum: 2 } }, ['buildingId', 'workerCount']),
  tool('emergency_repair', '修复发生小火情的建筑，需要金币和材料。', { x: coordinate, y: coordinate }, ['x', 'y']),
  tool('host_festival', '花费180金币举办庆典，提高幸福度；庆典期间不能重复举办。', {}),
  tool('get_town_status', '查询人口、幸福度、资源、仓库、季节、税收和预警。'),
  tool('get_production_flow', '查询生产配方、速度、暂停与缺料/满仓状态。'),
  tool('get_pending_orders', '查询当前订单的物资要求、奖励和冷却；bulk 为真的订单是远方商会的大单，不能取消。'),
  tool('get_caravan_routes', '查询已解锁的商队路线、各自货物与是否备齐。'),
  tool('get_disaster_alerts', '查询当前受损建筑、位置，以及是否正在流行疫病。'),
  tool('adopt_pet', '领养一只小动物，它会跟着邻居在小镇里散步。', { kind: { type: 'string', enum: ['cat', 'dog'] } }, ['kind']),
  tool('release_pet', '送走最近领养的小动物。'),
  tool('start_seasonal_activity', '举办当前季节的自愿活动，只动用富余物资。'),
  tool('get_town_life', '查询季节活动、小动物与幸福度相关的生活状态。'),
  tool('get_achievements', '查询成就进度与已达成项。'),
  tool('get_honours', '查询小镇荣誉各条线的等级、当前效果与下一级价格。'),
  tool('deepen_honour', '花费声望把一条小镇荣誉再提升一级，效果永久保留。', { track: { type: 'string', enum: ['granary', 'craft', 'welcome'] } }, ['track']),
  tool('get_street_styles', '查询三种街区风格各自的进度、已达成的阶段与下一步要求。'),
  tool('get_town_clock', '查询小镇的当前时刻、第几天与所处时段。'),
  tool('get_neighbour_stories', '查询邻居们的关系故事：当前待说的一段、可选做法与已经说过的段落。'),
  tool('choose_story_option', '回应邻居故事中的一段，二选一。礼物会立刻入库，长期做法会留下永久环境加成。', { neighbour: { type: 'string' }, option: { type: 'string' } }, ['neighbour', 'option']),
];

export type GameToolResult = ActionResult | { ok: true; data: unknown };

/** Untrusted tool calls are intent only. Every mutation goes through SimWorld rules. */
export function executeGameTool(world: SimWorld, name: string, args: unknown = {}): GameToolResult {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return { ok: false, code: 'INVALID_ARGUMENTS', message: '工具参数必须是对象。' };
  const values = args as Record<string, unknown>;
  const definition = GAME_TOOLS.find(candidate => candidate.function.name === name);
  if (!definition) return { ok: false, code: 'UNKNOWN_TOOL', message: '没有这个游戏工具。' };
  const schema = definition.function.parameters;
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  if (Object.keys(values).some(key => !Object.hasOwn(properties, key))) return { ok: false, code: 'INVALID_ARGUMENTS', message: '工具参数包含未知字段。' };
  for (const key of schema.required as string[]) if (!Object.hasOwn(values, key)) return { ok: false, code: 'INVALID_ARGUMENTS', message: `缺少参数：${key}。` };
  for (const [key, value] of Object.entries(values)) {
    const rule = properties[key];
    if ((rule.type === 'boolean' && typeof value !== 'boolean') || (rule.type === 'string' && typeof value !== 'string') || (rule.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value))) || (Array.isArray(rule.enum) && !rule.enum.includes(value)) || (typeof value === 'number' && ((typeof rule.minimum === 'number' && value < rule.minimum) || (typeof rule.maximum === 'number' && value > rule.maximum)))) return { ok: false, code: 'INVALID_ARGUMENTS', message: `参数 ${key} 不合法。` };
  }
  const atTile = () => world.state.buildings.find(building => building.x === values.x && building.y === values.y)?.id ?? '';
  switch (name) {
    case 'get_garden':return {ok:true,data:world.garden()};
    case 'plant_crop':return world.plantCrop(values.cropId as CropId,values.buildingId as string|undefined);
    case 'set_auto_replant':return world.setAutoReplant(values.enabled as boolean);
    case 'get_town_projects': return {ok:true,data:world.observe().projects};
    case 'choose_town_project': return world.chooseProject(values.projectId as ProjectId);
    case 'complete_town_project': return world.completeProject(values.projectId as ProjectId);
    case 'sell_surplus': return world.sellSurplus(values.resource as Resource | undefined);
    case 'buy_resource': return world.buyResource(values.resource as Resource, values.amount as number);
    case 'collect_all':return world.collectAll();
    case 'pave_road':return world.paveRoad({x:values.x as number,y:values.y as number},{x:values.endX as number,y:values.endY as number},values.surface as RoadKind|'remove');
    case 'research_technology': return world.research(values.technologyId as TechnologyId);
    case 'get_technologies': return { ok: true, data: world.observe().technologies };
    case 'move_building': return world.moveBuilding(values.buildingId as string,values.x as number,values.y as number);
    case 'build_building': return world.build(values.buildingType as BuildingKind, values.x as number, values.y as number);
    case 'demolish_building': return world.demolish(atTile());
    case 'upgrade_building': return world.upgrade(atTile());
    case 'set_tax_rate': return world.setTax(['very_low', 'low', 'medium', 'high', 'extortion'].indexOf(values.level as string));
    case 'fulfill_order': return world.fulfillOrder(values.orderId as string);
    case 'dispatch_caravan': return world.dispatchCaravan(values.caravan === undefined ? undefined : String(values.caravan));
    case 'choose_caravan_route': return world.chooseCaravanDestination(values.destination as 'valley' | 'hilltown' | 'rivermouth', values.caravan === undefined ? undefined : String(values.caravan));
    case 'collect_production': return world.collect(values.buildingId as string);
    case 'set_production_focus': return world.setProductionFocus(values.buildingId as string, values.recipeId as string);
    case 'adjust_workforce': return world.adjustWorkforce(values.buildingId as string, values.workerCount as number);
    case 'emergency_repair': return world.repair(atTile());
    case 'host_festival': return world.festival();
    case 'get_town_status': return { ok: true, data: world.observe() };
    case 'get_production_flow': return { ok: true, data: world.observe().production };
    case 'get_pending_orders': return { ok: true, data: world.observe().orders };
    case 'get_caravan_routes': return { ok: true, data: world.observe().caravanRoutes };
    case 'get_achievements': return { ok: true, data: world.observe().achievements };
    case 'get_honours': return { ok: true, data: { tracks: world.observe().honours, bonus: world.observe().honourBonus } };
    case 'deepen_honour': return world.deepenHonour(String(values.track) as 'granary' | 'craft' | 'welcome');
    case 'get_street_styles': return { ok: true, data: world.observe().collections };
    case 'get_town_clock': return { ok: true, data: world.observe().clock };
    case 'get_neighbour_stories': return { ok: true, data: world.observe().stories };
    case 'choose_story_option': return world.chooseStoryOption(String(values.neighbour), String(values.option));
    case 'get_disaster_alerts': return { ok: true, data: { alerts: world.observe().alerts, plague: world.observe().plague, illness: world.observe().illness } };
    case 'adopt_pet': return world.adoptPet(values.kind as 'cat' | 'dog');
    case 'release_pet': return world.releasePet();
    case 'start_seasonal_activity': return world.startActivity();
    case 'get_town_life': {
      const seen = world.observe();
      return { ok: true, data: { activity: seen.activity, pets: seen.pets, petLimit: seen.petLimit, happiness: seen.happiness, alerts: seen.alerts } };
    }
    default: return { ok: false, code: 'UNKNOWN_TOOL', message: '没有这个游戏工具。' };
  }
}
