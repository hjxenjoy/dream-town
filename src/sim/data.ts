/** Short names for the two construction materials, used in costs and refusals. */
export const RESOURCE_LABELS: Record<'wood' | 'stone', string> = { wood: '木材', stone: '石料' };

export type Resource = 'flowers' | 'fruit' | 'eggs' | 'jam' | 'wood' | 'stone' | 'wheat' | 'flour' | 'bread' | 'fish' | 'plank' | 'materials' | 'ore' | 'charcoal' | 'ingot' | 'tools' | 'feed' | 'wool' | 'cloth' | 'clothing' | 'milk' | 'cheese' | 'honey' | 'grape' | 'wine' | 'vintage' | 'sugarcane' | 'sugar';
export type ResourceMap = Record<Resource, number>;
export type BuildingCategory = 'homes' | 'production' | 'services' | 'decoration';
export type BuildingKind = 'flowernursery' | 'orchardhouse' | 'chickencoop' | 'jamkitchen' | 'teahouse' | 'homestead' | 'cottage' | 'windmill' | 'bakery' | 'townhall' | 'lumber' | 'quarry' | 'fishery' | 'market' | 'well' | 'warehouse' | 'firetower' | 'garden' | 'farm' | 'mine' | 'kiln' | 'smelter' | 'smithy' | 'feedmill' | 'pasture' | 'weaver' | 'tailor' | 'oak' | 'cherry' | 'pine' | 'maple' | 'fountain' | 'gazebo' | 'bench' | 'flowerarch' | 'flowerbox' | 'trellis' | 'archlights' | 'boardwalk' | 'railing' | 'parasol' | 'willow' | 'dock' | 'crates' | 'barrels' | 'anvil' | 'signflags' | 'cowbarn' | 'dairy' | 'apiary' | 'vineyard' | 'winery' | 'cellar' | 'farmhouse' | 'rowhouse' | 'apartment' | 'forester' | 'sawmill' | 'fishpond' | 'brickworks' | 'school' | 'clinic' | 'theatre' | 'watertower' | 'firestation' | 'chapel' | 'flowercart' | 'picniccorner' | 'harvestpile' | 'barracks' | 'guardpost' | 'wall' | 'canefield' | 'sugarmill';

export interface BuildingDefinition {
  name: string;
  description: string;
  category: BuildingCategory;
  cost: number;
  wood: number;
  stone: number;
  frame: number | null;
  technology?: TechnologyId;
  materials?: Partial<ResourceMap>;
  cycle?: number;
  autoCollect?: boolean;
  input?: Partial<ResourceMap>;
  output?: Partial<ResourceMap>;
  workers?: number;
  environment?: number;
  housing?: number;
  populationCap?: number;
  services?: number;
  /** Residents this building keeps well, at one per resident. */
  health?: number;
  /** Households this building gives a settled, believing life to. */
  faith?: number;
  waterRadius?: number;
  fireRadius?: number;
  /** Tile radius within which a guardpost or barracks turns bandits away. */
  guardRadius?: number;
  preserveWood?: boolean;
}

/** The same definitions drive the simulation, catalog and tool descriptions. */
export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  flowernursery:{name:'四季花圃',description:'自动培育并收好花束，为花色养成留下一份积累。',category:'production',cost:360,wood:12,stone:4,frame:null,cycle:65,output:{flowers:3},workers:1,environment:4,autoCollect:true},
  orchardhouse:{name:'果园小屋',description:'照看一片小果园，自动采收鲜果，供果酱坊加工。',category:'production',cost:480,wood:16,stone:6,frame:null,cycle:75,output:{fruit:5},workers:1,autoCollect:true},
  chickencoop:{name:'咯咯鸡舍',description:'自动用一袋饲料照顾鸡群，收好三枚鸡蛋；没有饲料时歇一歇。',category:'production',cost:300,wood:12,stone:3,frame:null,cycle:45,input:{feed:1},output:{eggs:3},workers:1,autoCollect:true},
  jamkitchen:{name:'甜果果酱坊',description:'自动将三份鲜果熬成两罐果酱。果酱为邻居添一份闲适，也可出售。',category:'production',cost:620,wood:18,stone:12,frame:null,cycle:55,input:{fruit:3},output:{jam:2},workers:1,autoCollect:true},
  teahouse:{name:'河畔茶屋',description:'邻居歇脚聊天的地方，每级提供六个社区名额与十点服务。',category:'services',cost:720,wood:18,stone:10,frame:null,populationCap:6,services:10,environment:5},
  homestead:{name:'花窗农庄',description:'带庭院、花窗与晾衣角的农庄住宅，每级提供十个床位。',category:'homes',cost:680,wood:20,stone:12,frame:null,housing:10,environment:5},
  mine: { name: '赤岩矿场', description: '循着山石里的赤色纹路，每轮开采 5 份矿石。冶炼产业从这里起步。', category: 'production', cost: 520, wood: 14, stone: 12, frame: 0, technology: 'mining', cycle: 38, output: { ore: 5 }, workers: 2 },
  kiln: { name: '松烟炭窑', description: '将 2 份木材烧成 2 份木炭，自动保留建造用木材，为炉火准备燃料。', category: 'production', cost: 380, wood: 12, stone: 10, frame: 1, technology: 'mining', cycle: 32, input: { wood: 2 }, output: { charcoal: 2 }, workers: 1, preserveWood: true },
  smelter: { name: '炉光冶炼坊', description: '用 5 份矿石与 2 份木炭冶炼 1 块金属锭，点亮小镇的工业梦想。', category: 'production', cost: 860, wood: 18, stone: 24, materials: { materials: 3 }, frame: 2, technology: 'metallurgy', cycle: 60, input: { ore: 5, charcoal: 2 }, output: { ingot: 1 }, workers: 2 },
  smithy: { name: '叮当铁匠铺', description: '将 1 块金属锭和 2 块木板打造成 2 套工具。工具可出口，也用于研究精工技术。', category: 'production', cost: 920, wood: 20, stone: 18, materials: { materials: 3 }, frame: 3, technology: 'metallurgy', cycle: 48, input: { ingot: 1, plank: 2 }, output: { tools: 2 }, workers: 2 },
  feedmill: { name: '谷穗饲料坊', description: '将 3 份小麦配成 4 袋饲料，给牧场的小羊准备一顿饱饭。', category: 'production', cost: 340, wood: 12, stone: 6, frame: 4, technology: 'husbandry', cycle: 28, input: { wheat: 3 }, output: { feed: 4 }, workers: 1 },
  pasture: { name: '绵绵牧场', description: '先用 2 袋口粮照料小羊 120 秒，成年后每轮用 2 袋饲料产出 3 团羊毛，自动收好。', category: 'production', cost: 460, wood: 18, stone: 6, frame: 5, technology: 'husbandry', cycle: 40, input: { feed: 2 }, output: { wool: 3 }, workers: 1, autoCollect: true },
  weaver: { name: '蓝梭织布坊', description: '把 3 团羊毛织成 2 卷布料，接着交给裁缝，或用于改良仓储。', category: 'production', cost: 640, wood: 20, stone: 12, materials: { materials: 2 }, frame: 6, technology: 'tailoring', cycle: 42, input: { wool: 3 }, output: { cloth: 2 }, workers: 2 },
  tailor: { name: '暖衣裁缝铺', description: '用 2 卷布料缝制 2 件衣物，让小镇的手艺走进邻居的生活。', category: 'production', cost: 760, wood: 18, stone: 14, materials: { materials: 2 }, frame: 7, technology: 'tailoring', cycle: 48, input: { cloth: 2 }, output: { clothing: 2 }, workers: 2 },
  farmhouse: { name: '田园小院', description: '带小庭院的乡间住宅，每级提供 8 个床位与 3 点环境值。适合低密度的田园街区。', category: 'homes', cost: 460, wood: 14, stone: 8, frame: null, housing: 8, environment: 3 },
  rowhouse: { name: '彩窗联排屋', description: '两家相邻，共享一条花巷。每级提供 12 个床位，适合沿街成排布置。', category: 'homes', cost: 820, wood: 18, stone: 18, materials: { materials: 3 }, frame: null, housing: 12 },
  apartment: { name: '晴空公寓', description: '有花阳台的三层住宅，每级提供 18 个床位。记得配齐社区人口名额与饮水。', category: 'homes', cost: 1480, wood: 20, stone: 30, materials: { materials: 8 }, frame: null, housing: 18 },
  forester: { name: '青林伐木屋', description: '专注供应原木，每轮采集 10 份木材。库存够用自动休工，为建造与取暖储备木料。', category: 'production', cost: 540, wood: 10, stone: 8, frame: null, cycle: 26, output: { wood: 10 }, workers: 2 },
  sawmill: { name: '河谷锯木厂', description: '将 4 份木材加工成 6 块木板。自动保留建造与取暖所需木材，适合商队和铁匠铺集中供货。', category: 'production', cost: 680, wood: 16, stone: 12, frame: null, technology: 'mining', cycle: 36, input: { wood: 4 }, output: { plank: 6 }, workers: 1, preserveWood: true },
  fishpond: { name: '碧水养鱼场', description: '用 3 袋饲料养出 8 条鲜鱼，四季稳定供应口粮，让麦田也能养活更多邻居。', category: 'production', cost: 580, wood: 14, stone: 10, frame: null, technology: 'husbandry', cycle: 40, input: { feed: 3 }, output: { fish: 8 }, workers: 1 },
  brickworks: { name: '窑火建材坊', description: '将 6 份石料和 1 份木炭制成 1 包建材，补充商队带回的物资，支持住宅与市政扩建。', category: 'production', cost: 980, wood: 14, stone: 24, frame: null, technology: 'mining', cycle: 65, input: { stone: 6, charcoal: 1 }, output: { materials: 1 }, workers: 2 },
  school: { name: '晨读小学', description: '铃声响起，孩子们有了课堂。每级增加 12 位社区人口名额与 18 点社区服务。', category: 'services', cost: 1100, wood: 20, stone: 18, materials: { materials: 5 }, frame: null, populationCap: 12, services: 18 },
  clinic: { name: '安心诊所', description: '照顾邻居的日常健康。每级让 10 位居民康健，并增加 10 位社区人口名额与 25 点社区服务。', category: 'services', cost: 900, wood: 12, stone: 20, materials: { materials: 4 }, frame: null, populationCap: 10, services: 25, health: 10 },
  theatre: { name: '星幕小剧院', description: '灯光与戏剧丰富夜晚。每级增加 16 位社区人口名额、30 点社区服务与 5 点环境值。', category: 'services', cost: 1800, wood: 24, stone: 28, materials: { materials: 8 }, frame: null, technology: 'civics', populationCap: 16, services: 30, environment: 5 },
  chapel: { name: '河畔小教堂', description: '钟声安顿人心。每级为 14 户邻居带来信仰与安定的生活，并增加 8 位社区人口名额。', category: 'services', cost: 1500, wood: 22, stone: 26, materials: { materials: 6 }, frame: null, populationCap: 8, faith: 14 },
  guardpost: { name: '路口岗哨', description: '巡逻半径 5 格，把打家劫舍的强盗挡在外面。每级扩大 1 格。', category: 'services', cost: 350, wood: 12, stone: 8, frame: null, guardRadius: 5 },
  barracks: { name: '青岚兵营', description: '常驻守备队，警戒半径 8 格，挡住强盗的洗劫。每级扩大 1 格。', category: 'services', cost: 1500, wood: 28, stone: 30, materials: { materials: 8 }, frame: null, technology: 'metallurgy', guardRadius: 8 },
  wall: { name: '石砌城墙', description: '一段城墙，连成一片就成一道防线。相邻的墙会自动接上。', category: 'decoration', cost: 90, wood: 0, stone: 6, frame: null, environment: 1 },
  watertower: { name: '蓝顶供水塔', description: '为半径 7 格内的住宅供水，每次升级扩大 1 格，适合扩张中的住宅区。', category: 'services', cost: 780, wood: 10, stone: 24, materials: { materials: 3 }, frame: null, waterRadius: 7 },
  firestation: { name: '赤砖消防站', description: '守护半径 7 格内的建筑，每次升级扩大 1 格，让工业区也能安心生产。', category: 'services', cost: 1050, wood: 16, stone: 24, materials: { materials: 4 }, frame: null, technology: 'metallurgy', fireRadius: 7 },
  cottage: { name: '林间小屋', description: '温暖的新家，提供 6 个床位。居民幸福、粮食充足时会迎来新邻居。', category: 'homes', cost: 320, wood: 12, stone: 5, frame: 0, housing: 6 },
  windmill: { name: '风车磨坊', description: '风吹麦香。将 3 份小麦磨成 3 袋面粉，是面包产业的起点。', category: 'production', cost: 560, wood: 18, stone: 8, frame: 1, cycle: 28, input: { wheat: 3 }, output: { flour: 3 }, workers: 2 },
  bakery: { name: '晨光面包房', description: '用 3 袋面粉和 1 份砂糖烤出 4 个面包，为居民与订单准备早餐。', category: 'production', cost: 720, wood: 20, stone: 12, frame: 2, cycle: 38, input: { flour: 3, sugar: 1 }, output: { bread: 4 }, workers: 2 },
  townhall: { name: '小镇议事厅', description: '小镇的心脏。提升社区人口上限，承载居民共同的梦想。', category: 'services', cost: 1200, wood: 35, stone: 25, frame: 3, populationCap: 6, services: 35 },
  lumber: { name: '林间木工坊', description: '每轮采集 6 份木材、加工 2 块木板。可切换木材或木板优先，均衡模式会按库存补货。', category: 'production', cost: 380, wood: 10, stone: 5, frame: 4, cycle: 24, output: { wood: 6, plank: 2 }, workers: 2 },
  quarry: { name: '山麓采石场', description: '采集结实的山石，每轮提供 3 份石料，支持小镇扩建。', category: 'production', cost: 420, wood: 12, stone: 5, frame: 5, cycle: 32, output: { stone: 3 }, workers: 2 },
  fishery: { name: '河畔渔屋', description: '四季都有收获，每轮捕获 4 条鲜鱼，是可靠的日常食物来源。', category: 'production', cost: 280, wood: 10, stone: 3, frame: 6, cycle: 22, output: { fish: 4 }, workers: 1 },
  market: { name: '旅行者集市', description: '邻镇商人汇聚于此。订单与商队将小镇的收获变成扩建的机会。', category: 'services', cost: 640, wood: 18, stone: 12, frame: 7, services: 35 },
  well: { name: '清泉水井', description: '为半径 4 格内的居民提供清水，改善饮水需求。', category: 'services', cost: 180, wood: 5, stone: 10, frame: 8, waterRadius: 4 },
  warehouse: { name: '丰收仓库', description: '妥善保管每份收获。扩建增加 80 格容量，需要商队带回的建材。', category: 'services', cost: 680, wood: 20, stone: 15, frame: 9 },
  firetower: { name: '森林瞭望塔', description: '守望半径 4 格内的建筑，预防火灾，让居民安心入睡。', category: 'services', cost: 560, wood: 18, stone: 15, frame: 10, fireRadius: 4 },
  garden: { name: '花语小花园', description: '为小镇增添花香与散步的去处，每座花园改善环境和心情。', category: 'decoration', cost: 120, wood: 2, stone: 3, frame: 11, environment: 15 },
  oak: { name: '青荫橡树', description: '种下一片宽阔树荫，为街角和家门添绿。环境 +5，不需要工人。', category: 'decoration', cost: 60, wood: 0, stone: 0, frame: null, environment: 5 },
  cherry: { name: '春樱花树', description: '粉色花冠点亮河岸，留一条路给邻居赏花。环境 +6。', category: 'decoration', cost: 95, wood: 0, stone: 0, frame: null, environment: 6 },
  pine: { name: '常青松树', description: '四季常青的松树，适合矿区边缘和林间小径。环境 +4。', category: 'decoration', cost: 40, wood: 0, stone: 0, frame: null, environment: 4 },
  maple: { name: '晚霞红枫', description: '一树暖红，为住宅和田野添一抹秋色。环境 +6。', category: 'decoration', cost: 85, wood: 0, stone: 0, frame: null, environment: 6 },
  fountain: { name: '涟漪喷泉', description: '石雕喷泉与清澈水声，让街角有了小广场的气息。环境 +12，不替代水井。', category: 'decoration', cost: 320, wood: 0, stone: 12, frame: null, environment: 12 },
  gazebo: { name: '听风凉亭', description: '红瓦木亭，适合安放在花园与河畔空地。环境 +10。', category: 'decoration', cost: 260, wood: 12, stone: 4, frame: null, environment: 10 },
  bench: { name: '花畔长椅', description: '一张木长椅与两盆鲜花，给街边留个歇脚的地方。环境 +4。', category: 'decoration', cost: 65, wood: 3, stone: 1, frame: null, environment: 4 },
  flowerarch: { name: '蔷薇花拱门', description: '开满蔷薇的小拱门，布置在花园入口旁。环境 +8，占用装饰地块，不能铺路穿过。', category: 'decoration', cost: 180, wood: 6, stone: 2, frame: null, environment: 8 },
  flowerbox: { name: '临街花箱', description: '一排木花箱，把门前的窄边也种满花。环境 +5。', category: 'decoration', cost: 70, wood: 3, stone: 0, frame: null, environment: 5 },
  trellis: { name: '蔷薇花架', description: '让蔷薇顺着木架往上爬，适合贴着墙面布置。环境 +7。', category: 'decoration', cost: 110, wood: 5, stone: 1, frame: null, environment: 7 },
  archlights: { name: '串灯花门', description: '花门挂起一串暖灯，傍晚的街角会亮起来。环境 +9。', category: 'decoration', cost: 190, wood: 6, stone: 2, frame: null, environment: 9 },
  boardwalk: { name: '木栈道', description: '沿河铺一段木板路，雨天也好走。环境 +6。', category: 'decoration', cost: 130, wood: 8, stone: 2, frame: null, environment: 6 },
  railing: { name: '滨河栏杆', description: '一道矮木栏，把河岸收得整齐些。环境 +4。', category: 'decoration', cost: 55, wood: 4, stone: 0, frame: null, environment: 4 },
  parasol: { name: '遮阳伞座', description: '一顶条纹遮阳伞配桌椅，是午后最好的位置。环境 +8。', category: 'decoration', cost: 160, wood: 5, stone: 2, frame: null, environment: 8 },
  willow: { name: '垂柳', description: '枝条垂到水面上，适合种在河湾。环境 +7。', category: 'decoration', cost: 100, wood: 0, stone: 0, frame: null, environment: 7 },
  dock: { name: '浮动码头', description: '小木筏停靠的地方，给河边添一点生活气。环境 +8。', category: 'decoration', cost: 175, wood: 9, stone: 3, frame: null, environment: 8 },
  crates: { name: '木箱堆', description: '工坊门口的木箱，堆得稳当也是一景。环境 +4。', category: 'decoration', cost: 60, wood: 4, stone: 0, frame: null, environment: 4 },
  barrels: { name: '橡木酒桶', description: '两只旧木桶，摆在酒坊和市集旁正合适。环境 +4。', category: 'decoration', cost: 75, wood: 5, stone: 1, frame: null, environment: 4 },
  anvil: { name: '旧铁砧', description: '退役的铁砧与木墩，铁匠铺门口的老伙计。环境 +5。', category: 'decoration', cost: 90, wood: 2, stone: 3, frame: null, environment: 5 },
  signflags: { name: '彩旗招牌', description: '挂着彩旗的木招牌，让街口一眼就认得出。环境 +6。', category: 'decoration', cost: 105, wood: 5, stone: 1, frame: null, environment: 6 },
  cowbarn: { name: '青草牛舍', description: '先用 2 袋口粮照料小牛 150 秒，成年后每轮用 2 袋饲料产出 4 份鲜奶，自动收好。', category: 'production', cost: 520, wood: 16, stone: 8, frame: null, technology: 'husbandry', cycle: 34, input: { feed: 2 }, output: { milk: 4 }, workers: 1, autoCollect: true },
  dairy: { name: '山泉奶坊', description: '把 4 桶鲜奶做成 2 块奶酪，存放越久越值钱。', category: 'production', cost: 780, wood: 18, stone: 14, materials: { materials: 2 }, technology: 'husbandry', frame: null, cycle: 42, input: { milk: 4 }, output: { cheese: 2 }, workers: 2 },
  apiary: { name: '百花蜂场', description: '沿着花田放蜂箱，每轮自然采集 3 罐蜂蜜，不需要原料。', category: 'production', cost: 360, wood: 12, stone: 4, frame: null, technology: 'husbandry', cycle: 30, output: { honey: 3 }, workers: 1 },
  vineyard: { name: '南坡葡萄园', description: '向阳的坡地适合种葡萄，每轮自然结出 6 串。', category: 'production', cost: 460, wood: 14, stone: 6, frame: null, technology: 'viniculture', cycle: 38, output: { grape: 6 }, workers: 1 },
  winery: { name: '木桶酿酒坊', description: '把 6 串葡萄酿成 3 桶葡萄酒，是小镇最能卖出价钱的手艺。', category: 'production', cost: 860, wood: 20, stone: 16, materials: { materials: 3 }, technology: 'viniculture', frame: null, cycle: 56, input: { grape: 6 }, output: { wine: 3 }, workers: 2 },
  cellar: { name: '石阶酒窖', description: '把 3 桶葡萄酒再存成 2 瓶陈年佳酿，慢慢来的味道更好，也更值得上远方的订单。', category: 'production', cost: 980, wood: 16, stone: 26, materials: { materials: 4 }, technology: 'viniculture', frame: null, cycle: 70, input: { wine: 3 }, output: { vintage: 2 }, workers: 1 },
  // The sugar chain, per docs/04 §2: 农田 → 甘蔗 → 糖厂 → 糖 → 面包房. The field is its own
  // building rather than a selectable crop, which is how the vineyard already works, and the
  // shipped art agrees: `sugarcane-field` is a whole field, not a stage of a farm plot.
  canefield: { name: '河湾甘蔗田', description: '湿热的水边适合甘蔗，每轮收 6 捆，送往糖厂熬成砂糖。', category: 'production', cost: 400, wood: 12, stone: 6, frame: null, cycle: 34, output: { sugarcane: 6 } },
  sugarmill: { name: '老石糖厂', description: '把 6 捆甘蔗熬成 3 份砂糖。糖是面包房的新配方，也是远方才见得着的好价钱。', category: 'production', cost: 640, wood: 16, stone: 14, frame: null, cycle: 40, input: { sugarcane: 6 }, output: { sugar: 3 }, workers: 1 },
  flowercart: { name: '花车', description: '花巷成型后立起的纪念花车，四季都装着刚剪下的花。环境 +6。', category: 'decoration', cost: 160, wood: 6, stone: 1, frame: null, environment: 6 },
  picniccorner: { name: '野餐角', description: '滨河步道连成一线后添的野餐桌，晴天总有人坐着。环境 +6。', category: 'decoration', cost: 160, wood: 7, stone: 1, frame: null, environment: 6 },
  harvestpile: { name: '丰收堆', description: '工坊广场成气候后堆起的南瓜与谷物，是小镇给手艺人的记功。环境 +6。', category: 'decoration', cost: 160, wood: 2, stone: 2, frame: null, environment: 6 },
  farm: { name: '田园农田', description: '免费选种，收获后自动续种。园艺成长解锁果蔬，土地越种越肥沃；小麦留仓，果蔬自动送农摊。', category: 'production', cost: 90, wood: 3, stone: 0, frame: null, cycle: 30, output: { wheat: 4 }, workers: 0 },
};

export const RESOURCES: Record<Resource, { name: string; icon: string; sellPrice: number }> = {
  flowers:{name:'花束',icon:'flowers',sellPrice:6},fruit:{name:'鲜果',icon:'fruit',sellPrice:4},eggs:{name:'鸡蛋',icon:'eggs',sellPrice:5},jam:{name:'果酱',icon:'jam',sellPrice:10},
  ore: { name: '矿石', icon: 'ore', sellPrice: 5 },
  charcoal: { name: '木炭', icon: 'charcoal', sellPrice: 7 },
  ingot: { name: '金属锭', icon: 'ingot', sellPrice: 60 },
  tools: { name: '工具', icon: 'tools', sellPrice: 48 },
  feed: { name: '饲料', icon: 'feed', sellPrice: 3 },
  wool: { name: '羊毛', icon: 'wool', sellPrice: 6 },
  cloth: { name: '布料', icon: 'cloth', sellPrice: 14 },
  clothing: { name: '衣物', icon: 'clothing', sellPrice: 25 },
  wood: { name: '木材', icon: 'wood', sellPrice: 3 },
  stone: { name: '石料', icon: 'stone', sellPrice: 4 },
  wheat: { name: '小麦', icon: 'wheat', sellPrice: 2 },
  flour: { name: '面粉', icon: 'flour', sellPrice: 6 },
  bread: { name: '面包', icon: 'bread', sellPrice: 11 },
  fish: { name: '鲜鱼', icon: 'fish', sellPrice: 4 },
  plank: { name: '木板', icon: 'plank', sellPrice: 8 },
  materials: { name: '建材包', icon: 'materials', sellPrice: 12 },
  milk: { name: '鲜奶', icon: 'milk', sellPrice: 5 },
  cheese: { name: '奶酪', icon: 'cheese', sellPrice: 18 },
  honey: { name: '蜂蜜', icon: 'honey', sellPrice: 12 },
  grape: { name: '葡萄', icon: 'grape', sellPrice: 6 },
  wine: { name: '葡萄酒', icon: 'wine', sellPrice: 26 },
  vintage: { name: '陈年佳酿', icon: 'vintage', sellPrice: 60 },
  // Sugar is made from cane and is an ingredient, not a finished article: it is not in
  // TERMINAL_GOODS, so the market neither buys nor sells it.
  sugarcane: { name: '甘蔗', icon: 'sugarcane', sellPrice: 4 },
  sugar: { name: '砂糖', icon: 'sugar', sellPrice: 9 },
};

export const RESOURCE_KEYS = ['flowers','fruit','eggs','jam','wood', 'stone', 'wheat', 'flour', 'bread', 'fish', 'plank', 'materials', 'ore', 'charcoal', 'ingot', 'tools', 'feed', 'wool', 'cloth', 'clothing', 'milk', 'cheese', 'honey', 'grape', 'wine', 'vintage', 'sugarcane', 'sugar'] as Resource[];
export const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKind[];
export { MAP_SIZE } from './terrain.ts';
export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
export const GAME_DAY_SECONDS = 90;
export const SEASON_SECONDS = GAME_DAY_SECONDS * 4;
export const CARAVAN_DURATION = 120;
export const CARAVAN_CARGO: Partial<ResourceMap> = { bread: 6, plank: 4, fish: 5 };
export const TAX_RATES = [0, 5, 10, 15, 20] as const;
export const TAX_NAMES = ['免税', '轻税', '均衡', '高税', '重税'] as const;
export const SEASON_NAMES = { spring: '春日', summer: '盛夏', autumn: '金秋', winter: '冬日' } as const;

/**
 * Bulk commissions: the periodic, multi-good order that 《06》§1 designed as a step above the
 * ordinary board. One arrives every eight game days once the town is big enough to fill it,
 * and asking for several kinds at volume makes it a job rather than a formality.
 */
export const BULK_ORDER_INTERVAL = GAME_DAY_SECONDS * 8;
/**
 * How long a commission waits before the trading company withdraws it.
 *
 * A commission cannot be cancelled, and only one is on the board at a time, so a request the
 * town cannot actually fill — because residents wear more clothes than its tailors sew, because
 * a chain is short of workers, or because of some recipe added later — would sit there forever
 * and block every later commission. Rather than trying to predict each way a good can turn out
 * to be unreachable, the board is allowed to clear itself: after three intervals the company
 * takes its business elsewhere. Bounded failure beats an unbounded assumption.
 */
export const BULK_ORDER_PATIENCE = BULK_ORDER_INTERVAL * 3;
export const BULK_ORDER_UNLOCK_LEVEL = 6;
/**
 * Pays a little better per item than an ordinary order (2.8×) and clearly worse than a
 * caravan run (4.4×), so filling it is a good use of a surplus but never the best one.
 */
export const BULK_ORDER_RATIO = 3.2;
/**
 * The smallest amount a commission asks of each good.
 *
 * It is also the floor a town must be able to *stock* before a good is eligible: workshops rest
 * once a good reaches its stock target, which is fixed by how much warehouse space the town
 * has, so a small town cannot accumulate 8 of anything whose target is lower — and a commission
 * naming such a good could never be filled. See `generateBulkOrder`.
 */
export const BULK_ORDER_MIN = 8;

/**
 * A town kept well recovers faster from anything that hurts its mood: good health buys back
 * part of the tax penalty a high rate would otherwise cost, which is the concrete decision
 * 《05》's L4 layer was meant to feed.
 */
export const HEALTH_TAX_RELIEF = 0.4;

/**
 * Hazard resistance bought by looking after people. At full health repairs are cheaper, at
 * none they cost what they always did — so a town without a clinic is exactly where it was,
 * not worse off. Capped well below 1 so a well-run town still has to pay for its mistakes.
 */
export const HEALTH_REPAIR_RELIEF = 0.3;

export function emptyResources(): ResourceMap {
  return { flowers:0,fruit:0,eggs:0,jam:0,ore: 0, charcoal: 0, ingot: 0, tools: 0, feed: 0, wool: 0, cloth: 0, clothing: 0, wood: 0, stone: 0, wheat: 0, flour: 0, bread: 0, fish: 0, plank: 0, materials: 0, milk: 0, cheese: 0, honey: 0, grape: 0, wine: 0, vintage: 0, sugarcane: 0, sugar: 0 };
}

/**
 * How many residents one unit of finished goods serves each day. Rations already work this
 * way; these two finish the layers the design calls 温饱 and 小康, so the deepest chains have
 * somewhere to go besides the market and the caravan.
 */
export const CLOTHING_RESIDENTS_PER_UNIT = 8;
export const LUXURY_RESIDENTS_PER_UNIT = 10;

/** Enjoyed by residents, drawn cheapest first so a rare vintage is left for trade. */
export const LEISURE_GOODS: Resource[] = ['jam', 'honey', 'cheese', 'wine', 'vintage'];

/**
 * The most happiness a well-dressed, well-supplied town gains. It is a bonus and never a
 * penalty: a town without clothes is exactly where it was, not below it.
 */
export const CARE_BONUS = 8;

/** What one day of getting dressed and enjoying a little costs a town of this size. */
export function dailyGoods(population: number): { clothing: number; luxury: number } {
  const people = Math.max(0, Math.floor(population));
  return { clothing: Math.ceil(people / CLOTHING_RESIDENTS_PER_UNIT), luxury: Math.ceil(people / LUXURY_RESIDENTS_PER_UNIT) };
}

/**
 * How well the town keeps its people in clothes and small comforts, 0–100, each measured
 * against a three-day reserve — the same shape as rations, so one number still answers
 * "am I stocked?".
 */
export function careNeeds(resources: ResourceMap, population: number): { comfort: number; leisure: number } {
  const goods = dailyGoods(population);
  const luxury = LEISURE_GOODS.reduce((total, key) => total + resources[key], 0);
  // Both are measured against a three-day reserve, the same shape rations already use.
  const comfort = Math.min(100, Math.max(0, resources.clothing / Math.max(1, goods.clothing * 3) * 100));
  const leisure = Math.min(100, Math.max(0, luxury / Math.max(1, goods.luxury * 3) * 100));
  return { comfort, leisure };
}


/**
 * How much dearer than the town's own selling price the traveller's market is, per unit.
 *
 * Steep on purpose: like the emergency repair price, this is a way out of a shortage, never a
 * way to make a living. It must also clear the best-paying thing a good can be turned into, so
 * that a purchase can never be laundered into profit — see MARKET_GOODS for why that bound is
 * met structurally rather than by this number alone.
 */
export const MARKET_MARKUP = 18;

/**
 * Goods that nothing else in the town consumes — the finished articles a trading company
 * would actually order.
 *
 * Derived from the recipe book rather than listed by hand, because the distinction matters:
 * anything consumed by a downstream workshop (wool, cloth, flour, planks…) is drained as fast
 * as it is made by a town that is still working toward its stock targets, so an order asking
 * for those in bulk could be structurally impossible to fill. Terminal goods are never
 * drained, so stockpiling them always works.
 */
export const TERMINAL_GOODS: Resource[] = RESOURCE_KEYS.filter(key =>
  key !== 'materials' && !BUILDING_KEYS.some(kind => (BUILDINGS[kind].input?.[key] ?? 0) > 0));

/**
 * What the traveller's market will sell in — the same finished articles a trading company
 * orders, because those are the only goods a purchase cannot be turned into profit with.
 *
 * This started as the opposite: raw materials and intermediates, which is the more obvious
 * thing for a market to stock. It was a money press. A bought input is not worth its shelf
 * price to a town that can process it, and workshops multiply their output by level — at level
 * three the wheat-to-clothing chain amplifies a purchase by **x266**, against a markup of 18.
 * A price high enough to cover that (over 500 coins for a single wheat) would make the feature
 * pointless, and any price-based guard can be defeated again the next time a recipe or a level
 * curve changes. Selling only goods that nothing consumes removes the loop by construction:
 * their amplification is exactly 1, so the markup only has to beat resale, the caravan and the
 * order board — all of which pay well under 18x.
 *
 * It also happens to be what the original design asked for: 《03》 describes the market as
 * buying scarce *tools*, not raw materials. A town that is short of an ingredient builds the
 * workshop that makes it; that is the game.
 */
export const MARKET_GOODS: Resource[] = TERMINAL_GOODS;

export type TechnologyId = 'mining' | 'metallurgy' | 'husbandry' | 'tailoring' | 'viniculture' | 'efficiency' | 'logistics' | 'civics';
export interface TechnologyDefinition {
  name: string;
  description: string;
  branch: 'industry' | 'pastoral' | 'town';
  icon: string;
  level: number;
  prestige: number;
  coins: number;
  items: Partial<ResourceMap>;
  requires: TechnologyId[];
  unlocks: BuildingKind[];
}
export const TECHNOLOGIES: Record<TechnologyId, TechnologyDefinition> = {
  mining: { name: '山岩的馈赠', description: '发现矿脉，掌握烧炭手艺。', branch: 'industry', icon: 'ore', level: 3, prestige: 4, coins: 240, items: { materials: 2 }, requires: [], unlocks: ['mine', 'kiln', 'sawmill', 'brickworks'] },
  metallurgy: { name: '炉火与铁器', description: '将矿石变成金属与工具，接下更有价值的邻里委托。', branch: 'industry', icon: 'tools', level: 4, prestige: 6, coins: 480, items: { materials: 4 }, requires: ['mining'], unlocks: ['smelter', 'smithy', 'firestation'] },
  husbandry: { name: '牧野的新朋友', description: '用麦穗养育小羊，把农田延伸成牧场。', branch: 'pastoral', icon: 'wool', level: 3, prestige: 4, coins: 240, items: { materials: 2 }, requires: [], unlocks: ['feedmill', 'pasture', 'fishpond'] },
  viniculture: { name: '葡萄与酒', description: '顺着南坡种下葡萄，学会酿酒，再把好年份存进酒窖。', branch: 'pastoral', icon: 'wine', level: 5, prestige: 8, coins: 520, items: { materials: 4, plank: 6 }, requires: ['husbandry'], unlocks: ['vineyard', 'winery', 'cellar'] },
  tailoring: { name: '一针一线', description: '织出布料，缝制暖衣，发展小镇的纺织手艺。', branch: 'pastoral', icon: 'clothing', level: 4, prestige: 6, coins: 480, items: { materials: 4 }, requires: ['husbandry'], unlocks: ['weaver', 'tailor'] },
  efficiency: { name: '精工巧作', description: '所有生产建筑每轮所需时间减少 10%，离线生产同样生效。', branch: 'town', icon: 'clock', level: 5, prestige: 8, coins: 600, items: { tools: 2, materials: 5 }, requires: ['metallurgy'], unlocks: [] },
  logistics: { name: '井然有序', description: '现有仓储和今后每次扩建容量增加 20%。', branch: 'town', icon: 'box', level: 5, prestige: 8, coins: 600, items: { cloth: 2, materials: 5 }, requires: ['tailoring'], unlocks: [] },
  civics: { name: '体恤民生', description: '税收幸福度惩罚减半，并解锁星幕小剧院。', branch: 'town', icon: 'heart', level: 5, prestige: 8, coins: 500, items: { clothing: 2, materials: 4 }, requires: ['tailoring'], unlocks: ['theatre'] },
};
export const TECHNOLOGY_KEYS = Object.keys(TECHNOLOGIES) as TechnologyId[];
export const INDUSTRY_KINDS: BuildingKind[] = ['mine', 'kiln', 'smelter', 'smithy', 'feedmill', 'pasture', 'weaver', 'tailor'];
// Stable source-to-product order used by offline settlement.
export const PRODUCTION_SEQUENCE: BuildingKind[] = ['flowernursery','orchardhouse','jamkitchen','lumber', 'forester', 'quarry', 'farm', 'fishery', 'apiary', 'vineyard', 'canefield', 'mine', 'kiln', 'sawmill', 'windmill', 'feedmill', 'chickencoop', 'fishpond', 'sugarmill', 'bakery', 'pasture', 'cowbarn', 'smelter', 'brickworks', 'dairy', 'weaver', 'winery', 'smithy', 'cellar', 'tailor'];
export const INDUSTRY_FRAMES = {
  mine: { x: 0, y: 0, w: 440, h: 435 }, kiln: { x: 443, y: 0, w: 440, h: 435 },
  smelter: { x: 888, y: 0, w: 441, h: 439 }, smithy: { x: 1332, y: 0, w: 442, h: 435 },
  feedmill: { x: 0, y: 438, w: 442, h: 435 }, pasture: { x: 443, y: 440, w: 443, h: 434 },
  weaver: { x: 888, y: 442, w: 441, h: 432 }, tailor: { x: 1331, y: 438, w: 443, h: 436 },
};

export const DECORATION_SPRITES = ['oak', 'cherry', 'pine', 'maple', 'fountain', 'gazebo', 'bench', 'flowerarch'] as const;
export const DECORATION_ATLAS = { width: 1774, height: 887 };
// Individual atlas rectangles retain the generated objects' full silhouettes.
export const DECORATION_FRAMES = {
  oak: {x:0,y:0,w:485,h:447}, cherry: {x:485,y:0,w:440,h:442},
  pine: {x:925,y:0,w:420,h:458}, maple: {x:1345,y:0,w:429,h:458},
  fountain: {x:0,y:461,w:480,h:426}, gazebo: {x:495,y:443,w:427,h:444},
  bench: {x:930,y:550,w:427,h:300}, flowerarch: {x:1360,y:461,w:414,h:426},
} as const;

export const EXPANSION_SPRITES = ['farmhouse', 'rowhouse', 'apartment', 'forester', 'sawmill', 'fishpond', 'brickworks', 'school', 'clinic', 'theatre', 'watertower', 'firestation'] as const;
export const EXPANSION_ATLAS = { width: 1448, height: 1086 };
// The school grounds and fire-station finial share a narrow atlas row.
// Clip only the neighbouring sprite, keeping each building's full silhouette.
export const EXPANSION_FRAMES: Record<typeof EXPANSION_SPRITES[number], {x:number;y:number;w:number;h:number;clip?:number[][]}> = {
  farmhouse:{x:0,y:0,w:395,h:378}, rowhouse:{x:395,y:0,w:333,h:363},
  apartment:{x:730,y:0,w:350,h:372}, forester:{x:1086,y:0,w:362,h:365},
  sawmill:{x:0,y:378,w:375,h:333}, fishpond:{x:375,y:378,w:350,h:318},
  brickworks:{x:730,y:378,w:355,h:318},
  school:{x:1090,y:365,w:358,h:345,clip:[[0,0],[358,0],[358,315],[245,315],[245,345],[0,345]]},
  clinic:{x:0,y:713,w:375,h:373}, theatre:{x:390,y:702,w:335,h:384},
  watertower:{x:780,y:697,w:280,h:389},
  firestation:{x:1090,y:680,w:358,h:406,clip:[[245,0],[358,0],[358,406],[0,406],[0,25],[245,25]]},
};
