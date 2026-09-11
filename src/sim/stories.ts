import type { ResourceMap } from './data.ts';
import type { BuildingKind } from './data.ts';
import type { Building } from './world.ts';

/**
 * A lasting or one-off reward for a story choice. Every option gives something: the review
 * doc asked for choices that differ in style rather than choices that can be got wrong.
 */
export interface StoryEffect {
  /** Goods handed over at the moment of the choice. */
  items?: Partial<ResourceMap>;
  coins?: number;
  prestige?: number;
  /** Permanent environment bonus, granted once and kept. */
  environment?: number;
  /** What the panel says this choice left behind. */
  perk: string;
}

export interface StoryChoice {
  id: string;
  label: string;
  description: string;
  effect: StoryEffect;
  /** What the neighbour says back. */
  reply: string;
}

/** What must genuinely exist in town before a stage can be told. */
export interface StoryRequirement {
  /** The neighbour needs a home of their own. */
  home?: boolean;
  /** And the workshop they talk about. */
  workplace?: boolean;
  level?: number;
  population?: number;
}

export interface StoryStage {
  title: string;
  /** What the player is being asked, in the neighbour's own situation. */
  prompt: string;
  requires: StoryRequirement;
  choices: readonly StoryChoice[];
}

export interface NeighbourStory {
  portrait: string;
  /** A one-line description of the arc, for the panel header. */
  arc: string;
  stages: readonly StoryStage[];
}

/** Stages per neighbour. Three, as the review doc asked for. */
export const STORY_STAGES = 3;

/**
 * The requirement ladder. It is the same for everyone and it is built from things the player
 * really did: a home for them to move into, the workshop they work at, and a town that has
 * grown. Nothing here is a hidden counter.
 */
const LADDER: readonly StoryRequirement[] = [
  { home: true },
  { home: true, workplace: true, level: 4 },
  { home: true, workplace: true, level: 6, population: 12 },
];

function stage(title: string, prompt: string, index: number, choices: readonly StoryChoice[]): StoryStage {
  return { title, prompt, requires: LADDER[index]!, choices };
}

/** A gift now: goods and coin handed over at the moment of the choice. */
function gift(perk: string, items: Partial<ResourceMap>, coins?: number): StoryEffect {
  return { items, perk, ...(coins === undefined ? {} : { coins }) };
}

/** Something that stays: a permanent environment bonus, and no goods. */
function lasting(perk: string, environment: number, prestige?: number): StoryEffect {
  return { environment, perk, ...(prestige === undefined ? {} : { prestige }) };
}

/**
 * Every neighbour's three-stage arc. The prompts are about their trade, and the trigger is
 * always a building the player actually put down, so the story cannot fire in a town that
 * does not have the place it is about.
 */
export const STORIES: readonly NeighbourStory[] = [
  {
    portrait: 'gardener', arc: '从第一畦菜地，到把整条街都种上花。',
    stages: [
      stage('新家门前的一小块地', '林莳搬进新家，说门前的空地荒着可惜，想种点什么。', 0, [
        { id: 'seed', label: '送她一包菜种', description: '把仓里的收成匀一些出来。', effect: gift('林莳记着这份种子情。', { wheat: 6 }), reply: '有了这包种子，我明天就下地。' },
        { id: 'bench', label: '帮她把门前收拾整齐', description: '不送东西，出力把角落清出来。', effect: lasting('门前齐整，街坊都爱在这儿歇脚。', 1), reply: '空出来这一块，够我种一夏的花了。' },
      ]),
      stage('田里的事，也想请你看看', '林莳的田已经连着收了几年，她说想按你的意思挑下一季种什么。', 1, [
        { id: 'grain', label: '种粮食，先让大家吃饱', description: '稳妥的选择，仓里马上多一份口粮。', effect: gift('田里留下一片稳当的口粮。', { wheat: 14, flour: 6 }), reply: '种粮踏实，锅里有饭，人心就定。' },
        { id: 'flowers', label: '留一畦种花', description: '少收一些粮，换来一整年的好景致。', effect: lasting('田埂上的花带，成了小镇的一景。', 3), reply: '粮食少一点不要紧，花开的时候大家都来看。' },
      ]),
      stage('把花种满整条街', '林莳说小镇大了，想把花从自己门前一路种到街尾，问你怎么种。', 2, [
        { id: 'lane', label: '把花扎成花束卖给花市', description: '剪下来的花扎成花束装车送走，换回一批建材。', effect: gift('花市认了小镇的花。', { materials: 8 }, 260), reply: '花市认了我们的花，往后年年都来收。' },
        { id: 'corner', label: '每个路口种一丛', description: '不求连片，让每个转弯都有花。', effect: lasting('每个街角都留了一丛花。', 3, 2), reply: '走到哪里都有花看，这样也好。' },
      ]),
    ],
  },
  {
    portrait: 'carpenter', arc: '从一根梁开始，给小镇立起自己的屋檐。',
    stages: [
      stage('新家的梁', '鲁班生看着新房子，说想亲手给它加一道梁，只是手头缺料。', 0, [
        { id: 'timber', label: '拨一批木材给他', description: '好木料要留给会用它的人。', effect: gift('这根梁上留着他的记号。', { wood: 8 }), reply: '好料子，我给它做一道经得住雪的梁。' },
        { id: 'plain', label: '先用现成的材料', description: '不额外拨料，把工序做扎实就好。', effect: lasting('房子不豪奢，但接缝严实。', 1), reply: '料子差一点没关系，活儿不能差。' },
      ]),
      stage('工坊的门面', '鲁班生的木工房要翻修，他问是不是该做个像样的招牌。', 1, [
        { id: 'sign', label: '做一块好招牌', description: '木工房立刻能接更多的活。', effect: gift('招牌立起来，活计也多了。', { plank: 10, wood: 6 }), reply: '挂上这块，人家老远就知道这儿有木匠。' },
        { id: 'rafters', label: '不如把屋檐加宽些', description: '不显眼，但雨天工匠们有地方躲。', effect: lasting('屋檐下的那一排长凳，雨天总坐满人。', 2), reply: '屋檐宽了，雨天大家有地方站。' },
      ]),
      stage('给小镇立一座牌楼', '鲁班生攒够了手艺，说想在镇口立一座牌楼，问你要什么样式。', 2, [
        { id: 'gate', label: '先接一批外镇的订单', description: '牌楼不急，先把木工房的活排满。', effect: gift('外镇的订单排满了木工房。', { plank: 12, wood: 8 }, 240), reply: '外镇的订单先接，牌楼等开春。' },
        { id: 'bridge', label: '把力气花在桥栏杆上', description: '牌楼不必大，让过河的人走得稳当。', effect: lasting('桥上换了新栏杆，夜里也看得清路。', 3, 3), reply: '木头用在人天天走的地方，才算没白费。' },
      ]),
    ],
  },
  {
    portrait: 'herbalist', arc: '从认得出几种草，到让整镇的人夜里都睡得安稳。',
    stages: [
      stage('窗台上晒的药草', '苏草的新家窗台空空，她想晒些药草，又怕占了你家的向阳处。', 0, [
        { id: 'herbs', label: '把向阳那面让给她', description: '药草晒得干，冬天少生病。', effect: gift('晒干的药草分给了左邻右舍。', { bread: 6 }), reply: '这几味晒好了，冬天咳两声就能压下去。' },
        { id: 'shelf', label: '帮她搭个晒架', description: '一次出力，往后年年都用得上。', effect: lasting('窗外的晒架成了巷子里的一景。', 1), reply: '有了架子，多少草都晒得开。' },
      ]),
      stage('诊所里缺一味药', '苏草的诊所开起来了，只是常用的一味药要去很远的地方买。', 1, [
        { id: 'buy', label: '先买回来备着', description: '仓里立刻多一份成药。', effect: gift('诊所的药柜终于满了。', { honey: 8, bread: 6 }), reply: '存够了，我心里就不慌。' },
        { id: 'garden', label: '在诊所旁开一小片药圃', description: '以后不用再往外跑。', effect: lasting('诊所旁边多了一片药草园。', 3), reply: '自己种的药，看谁家需要就摘。' },
      ]),
      stage('把问诊开到家门口', '苏草说小镇大了，想每月去几个街坊家转转，问你走哪边。', 2, [
        { id: 'sick', label: '把药方抄给邻镇', description: '留下的方子换回一批谢礼。', effect: gift('药方换回了邻镇的谢礼。', { honey: 8 }, 220), reply: '方子传出去，人家也把好东西送来。' },
        { id: 'all', label: '每条街都走到', description: '谁也不落下，就是她自己多跑一些。', effect: lasting('镇上每条街都有她走过的脚印。', 4, 2), reply: '多走几步路的事，认得门就好。' },
      ]),
    ],
  },
  {
    portrait: 'farmer', arc: '从守着风车，到让磨盘一天到晚都不空转。',
    stages: [
      stage('风不常来', '田伯说新家离磨坊有些远，风不常来的时候，磨盘就停着。', 0, [
        { id: 'grain', label: '先匀一批麦子给他', description: '有粮在手，不怕磨盘停。', effect: gift('粮仓里留了一角给他。', { wheat: 10 }), reply: '有这些垫着，停了风也不慌。' },
        { id: 'windmill', label: '在磨坊旁添几棵树挡风', description: '树长起来，风向也会稳一些。', effect: lasting('磨坊旁的那几棵树，夏天最凉快。', 1), reply: '树下凉快，等着磨面的人也有地方坐。' },
      ]),
      stage('磨坊的旧石磨', '田伯的磨坊石头磨了几年，出粉慢，他问要不要换一副新磨。', 1, [
        { id: 'stone', label: '给他一副新磨盘', description: '磨得快，面粉立刻见多。', effect: gift('新磨盘转起来又轻又快。', { flour: 12, plank: 4 }), reply: '新磨就是不一样，一天能多磨好几斗。' },
        { id: 'repair', label: '把旧磨修细一些', description: '省下石料，粉也磨得更匀。', effect: lasting('旧磨修细了，磨出的粉反而更白。', 2), reply: '老伙计还能用，我把它磨纹修细一点。' },
      ]),
      stage('磨坊要传给谁', '田伯年纪大了，说该想想磨坊以后交给谁。', 2, [
        { id: 'apprentice', label: '先把存粮卖出去', description: '磨坊的事慢慢来，这季的粮先出手。', effect: gift('这一季的粮卖了个好价钱。', { flour: 14, bread: 8 }, 280), reply: '粮价正好，先卖一批，钱在手里踏实。' },
        { id: 'mill', label: '把磨坊改成大家都能用的', description: '不收钱，谁家要磨谁来。', effect: lasting('磨坊成了全镇公用的地方。', 4, 3), reply: '谁家要磨就来，收钱做什么。' },
      ]),
    ],
  },
  {
    portrait: 'merchant', arc: '从一辆小车，到让小镇的名字出现在远方的账本上。',
    stages: [
      stage('第一趟买卖', '米洛搬进新家，想先做一趟小买卖试试水，缺一点本钱。', 0, [
        { id: 'capital', label: '给他一笔本钱', description: '买卖做起来，镇上也热闹。', effect: gift('第一趟买卖赚了回来。', { bread: 8 }), reply: '本钱已经翻了一倍，你看。' },
        { id: 'stall', label: '先帮他支个摊子', description: '不乱花钱，先把地方稳住。', effect: lasting('集市口多了一个干净的小摊。', 1), reply: '有个固定摊子，客人就认得我了。' },
      ]),
      stage('集市该卖什么', '米洛说集市上什么都有一点，反而什么都不显眼，问你主推什么。', 1, [
        { id: 'staple', label: '主推口粮', description: '人人要买，周转最快。', effect: gift('集市当天就卖空了。', { bread: 10, fish: 8 }), reply: '粮食最好卖，当天就空了摊。' },
        { id: 'craft', label: '主推手工物件', description: '卖得慢，但小镇的名声会传出去。', effect: lasting('外乡人开始专程来买镇上的手工。', 3), reply: '卖得慢一点，可是人家记得住。' },
      ]),
      stage('商队要往哪儿走', '米洛攒够了本钱，说镇上该自己派商队了，问你头一趟走哪边。', 2, [
        { id: 'near', label: '先跑一趟近的，把本钱收回来', description: '不图名声，先把这一趟的利落进口袋。', effect: gift('第一趟的利落进了口袋。', { materials: 6 }, 340), reply: '路近，钱回来得也快。' },
        { id: 'far', label: '直接去最远的地方', description: '一趟远路，换一个响亮的名声。', effect: lasting('小镇的名声跟着商队去了远方。', 3, 5), reply: '远是远，可人家会记住青岚这个名字。' },
      ]),
    ],
  },
  {
    portrait: 'fisher', arc: '从守住一段河湾，到让人人吃得上新鲜鱼。',
    stages: [
      stage('新家门口的水声', '老渔说新家离河岸近，夜里听着水声才睡得着，只是缺一叶小舟。', 0, [
        { id: 'boat', label: '给他造一条小船', description: '有船才能出得去。', effect: gift('小船当天就下了水。', { fish: 10 }), reply: '船小，可河宽，够我使唤了。' },
        { id: 'dock', label: '在岸边搭一段木台', description: '不必下水，也能钓上来。', effect: lasting('岸边多了一处可以坐着钓鱼的木台。', 1), reply: '有这块木台，我坐着也能钓一天。' },
      ]),
      stage('网眼的大小', '老渔说这几年鱼少了，他问你该不该把网眼放密一些。', 1, [
        { id: 'fine', label: '眼下先多打一些', description: '仓里立刻多一批鲜鱼。', effect: gift('这几网打得满。', { fish: 16 }), reply: '今天这一网，够全镇吃两顿。' },
        { id: 'wide', label: '把网眼放宽，留住小鱼', description: '今年少打些，往后年年有鱼。', effect: lasting('河里的鱼一年比一年多。', 3), reply: '小鱼放回去，明年它再回来。' },
      ]),
      stage('河上的雾', '老渔说下游一段早上起雾，行船的人常迷失方向，问你要不要做点什么。', 2, [
        { id: 'buoy', label: '把这一季的鱼都卖了', description: '河上的事往后放，鲜鱼趁早出手。', effect: gift('这一季的鱼没糟蹋。', { fish: 18 }, 230), reply: '鱼不等人，卖了才不糟蹋。' },
        { id: 'lamp', label: '在岸边点一盏长明灯', description: '不拦人，只给人一个方向。', effect: lasting('岸边那盏灯，成了下游的记号。', 4, 2), reply: '看见那点光，就知道到家了。' },
      ]),
    ],
  },
  {
    portrait: 'baker', arc: '从第一炉面包，到整条街都闻着麦香醒来。',
    stages: [
      stage('第一炉', '麦香搬进新家，说想烤一炉面包，可手上没有面粉。', 0, [
        { id: 'flour', label: '给她一批面粉', description: '炉子当天就能热起来。', effect: gift('第一炉面包分给了整条街。', { bread: 8 }), reply: '趁热吃，凉了就少了那股甜。' },
        { id: 'oven', label: '帮她把炉子砌好', description: '火候稳了，往后省心。', effect: lasting('那口炉子的火，从来没断过。', 1), reply: '火稳了，烤什么都香。' },
      ]),
      stage('面包的价钱', '麦香说穷人家买不起白面包，问你该不该做一些便宜的。', 1, [
        { id: 'profit', label: '还是照常卖', description: '先把生意稳住。', effect: gift('面包房这一季结余不错。', { bread: 12 }), reply: '这个月账上好看了一点，我心里有底了。' },
        { id: 'cheap', label: '每天烤一炉粗粮的', description: '赚得少些，但没人饿着。', effect: lasting('每天傍晚都有一炉便宜面包出炉。', 3), reply: '粗粮的也顶饱，谁家紧就多拿一个。' },
      ]),
      stage('香味该飘多远', '麦香说炉子只有一口，问你该不该为全镇多烤些。', 2, [
        { id: 'midnight', label: '接一单外镇的订货', description: '炉子先为订货开着，名声的事以后再说。', effect: gift('外镇的订货填满了炉子。', { bread: 16 }, 260), reply: '外镇的单子一接，炉子就闲不下来。' },
        { id: 'knead', label: '教几个邻居一起做', description: '把方子分出去，各家自己烤。', effect: lasting('镇上好些人家都会烤那种面包了。', 4, 2), reply: '方子又不是我的，大家会了才好。' },
      ]),
    ],
  },
  {
    portrait: 'blacksmith', arc: '从打一把好锄头，到镇上人人认得那叮当声。',
    stages: [
      stage('炉子还没点', '阿岳的新家有了，可打铁的炉子还缺石料。', 0, [
        { id: 'stone', label: '给他一批石料木料', description: '炉子垒起来就能开工。', effect: gift('炉子当天就生起了火。', { stone: 8, wood: 6 }), reply: '火一起来，这屋子就有生气了。' },
        { id: 'bricks', label: '用旧料垒一个', description: '不额外取材，够用就好。', effect: lasting('粗垒的炉子，火烧了许多年。', 1), reply: '丑一点怕什么，好用就行。' },
      ]),
      stage('先打什么', '阿岳说排队的活儿不少，问你他该先赶哪一批。', 1, [
        { id: 'tools', label: '先打农具', description: '田里的活不能等。', effect: gift('新农具直接送进了田里。', { tools: 6 }), reply: '先把锄头给他们，田误不得。' },
        { id: 'ornament', label: '先打些门上的铁饰', description: '不急着用，但街面上好看。', effect: lasting('街上的门环和铁饰都出自他手。', 3), reply: '铁也能好看，你等着瞧。' },
      ]),
      stage('手艺传给谁', '阿岳说打铁苦，年轻人未必肯学，问你怎么办。', 2, [
        { id: 'forge', label: '先赶一批铁器出去卖', description: '教徒弟的事不急，先把手上的活换成钱。', effect: gift('铁器出手快，先赚这一笔。', { tools: 8 }, 300), reply: '铁器出手快，先赚这一笔。' },
        { id: 'open', label: '把打铁的日子定成集市日', description: '不专门教，让人来看。', effect: lasting('每逢集市，炉边总围着一圈人。', 4, 2), reply: '看的人多了，总有人手痒。' },
      ]),
    ],
  },
  {
    portrait: 'teacher', arc: '从一块黑板，到孩子们自己办起一场展览。',
    stages: [
      stage('教室还没有黑板', '闻书的新家安顿好了，可学堂缺一块像样的黑板。', 0, [
        { id: 'board', label: '给他一块好木板', description: '课当天就能上起来。', effect: gift('黑板挂上去，孩子们当天就来了。', { plank: 8 }), reply: '有了这块板，明天就能开课。' },
        { id: 'yard', label: '先把院子清出来', description: '屋里挤，不如在外面讲。', effect: lasting('晴天的课都在院子里上。', 1), reply: '在院子里讲，孩子们反倒坐得住。' },
      ]),
      stage('课要教什么', '闻书说孩子们脑子快，问你除了认字，还该教什么。', 1, [
        { id: 'letters', label: '先把字认全', description: '基础打牢，往后什么都好学。', effect: gift('孩子们的字帖攒了一摞。', { plank: 6 }), reply: '字认全了，往后看什么都容易。' },
        { id: 'hands', label: '多教些动手的', description: '算数、丈量、看天气，都教一点。', effect: lasting('孩子们会算收成，也会看云识天气。', 3), reply: '庄稼人认得云，孩子也该认得。' },
      ]),
      stage('孩子们想办个展览', '闻书说孩子们想把自己做的东西摆出来给人看，问你要不要腾地方。', 2, [
        { id: 'square', label: '让孩子们把字帖抄出去卖', description: '展览先不办，字帖换回纸墨钱。', effect: gift('孩子们的抄本换回了纸墨钱。', { plank: 8 }, 200), reply: '孩子们自己抄的，卖得还挺好。' },
        { id: 'hall', label: '在议事厅门口办', description: '郑重一些，让大人也认真看。', effect: lasting('议事厅门口的那场展览，办了三天。', 4, 2), reply: '在这儿办，大人就不当是哄孩子了。' },
      ]),
    ],
  },
  {
    portrait: 'doctor', arc: '从一间小诊室，到让夜里也有人应门。',
    stages: [
      stage('诊室还没有灯', '安和搬进新家，说诊室夜里暗，看诊不方便。', 0, [
        { id: 'lamp', label: '给他一盏好灯', description: '夜里也能看清。', effect: gift('灯点上的当晚就有人来敲门。', { plank: 4 }), reply: '灯一亮，夜里敲门的人就来了。' },
        { id: 'window', label: '开一扇朝街的窗', description: '白天省灯，也看得见街上。', effect: lasting('朝街的那扇窗，白天总是开的。', 1), reply: '开着窗，谁路过喊一声我就听见。' },
      ]),
      stage('药要留给谁', '安和说存货不多，问你该先紧着谁用。', 1, [
        { id: 'workers', label: '先保干活的人', description: '工坊停一天，损失更大。', effect: gift('工坊这一天没人缺勤。', { bread: 8, honey: 4 }), reply: '干活的人先好起来，镇子才转得动。' },
        { id: 'everyone', label: '谁先来给谁', description: '不分轻重，先到先得。', effect: lasting('诊室门口那把长凳，从来没人白坐。', 3), reply: '排队就好，谁也别托人说情。' },
      ]),
      stage('夜里也该有人应门', '安和说夜里病来得急，问你该不该把诊室改成昼夜都开。', 2, [
        { id: 'night', label: '收一趟远门的诊金', description: '昼夜开诊的事再议，先跑一趟远门。', effect: gift('远门这一趟收回了药钱。', { honey: 10 }, 240), reply: '远门跑一趟，药钱就有出处了。' },
        { id: 'bell', label: '在门口挂一口铃', description: '不用人守着，有急事摇铃。', effect: lasting('门口那口铃，夜里响过好几回。', 4, 2), reply: '摇铃我就醒，比干等着强。' },
      ]),
    ],
  },
  {
    portrait: 'beekeeper', arc: '从两箱蜂，到让镇上的花开得有来有回。',
    stages: [
      stage('蜂箱放在哪儿', '花间搬进新家，带了两箱蜂，怕放错地方蜇到邻居。', 0, [
        { id: 'corner', label: '放到巷子最里头', description: '安静，也离人远。', effect: gift('新蜂箱当天就架好了。', { plank: 6 }), reply: '有了这几只箱子，蜂就有地方住了。' },
        { id: 'garden', label: '放到花园边上', description: '花多，蜜也多，就是人要走得近些。', effect: lasting('花园边的蜂箱，让那片花开得更密了。', 1), reply: '花就在旁边，蜜蜂省了一半力气。' },
      ]),
      stage('花不够的时候', '花间说蜂群长大了，附近的花不够它们跑，问你怎么办。', 1, [
        { id: 'sugar', label: '先喂糖水顶上', description: '省事，蜜能收上来。', effect: gift('这一季的蜜照常收了上来。', { honey: 10 }), reply: '糖水喂着，蜜还是有得收。' },
        { id: 'sow', label: '在河滩撒一把花籽', description: '今年少收些蜜，往后花自己长。', effect: lasting('河滩上那片野花，一年比一年旺。', 3), reply: '撒下去就不用管了，明年自己开。' },
      ]),
      stage('蜜要卖给谁', '花间说城里人出高价收蜜，可镇上也有人想要，问你卖给谁。', 2, [
        { id: 'city', label: '把蜜装车卖给城里', description: '镇上先匀一匀，剩下的整车出手。', effect: gift('整车蜜卖出了好价钱。', { honey: 12 }, 320), reply: '整车卖出去，价钱谈得比往年好。' },
        { id: 'share', label: '先留给镇上', description: '不图那点差价，留下甜味。', effect: lasting('镇上谁家给孩子冲水，都舍得放一勺蜜。', 4, 2), reply: '镇上的孩子也该尝得到甜。' },
      ]),
    ],
  },
  {
    portrait: 'winemaker', arc: '从一畦葡萄，到地窖里存得下几个好年份。',
    stages: [
      stage('头一茬葡萄', '陈酿搬进新家，说头一茬葡萄太少，连一只桶都装不满，可惜。', 0, [
        { id: 'barrel', label: '给他几只装酒的木桶', description: '哪怕只酿一小桶，也得有桶。', effect: gift('那一小桶没舍得卖，留着自己喝。', { plank: 6 }), reply: '少是少，可这是头一年，得留着。' },
        { id: 'leave', label: '先让藤长壮再说', description: '今年不采，把力气留给以后。', effect: lasting('那片葡萄藤，第二年果然壮了不少。', 1), reply: '今年不采，明年它才给得起。' },
      ]),
      stage('酒要什么时候开', '陈酿说新酒涩，问你该不该压着不卖，等它变好。', 1, [
        { id: 'sell', label: '趁早卖出去', description: '回本快，账上立刻见钱。', effect: gift('新酒很快就卖完了。', { grape: 6 }), reply: '新酒不等人，卖了也好。' },
        { id: 'wait', label: '压一年再开', description: '今年没钱进账，明年味道不一样。', effect: lasting('晚开的那一批，成了镇上的招牌。', 3), reply: '再等一年，你到时候尝一口就懂了。' },
      ]),
      stage('地窖要挖多深', '陈酿说想把地窖挖深一些，好存得下几个年份，问你值不值。', 2, [
        { id: 'deep', label: '先把新酒卖一轮', description: '地窖的事明年动工，新酒先见钱。', effect: gift('新酒卖了一轮，地窖钱有了。', { wine: 10 }, 360), reply: '新酒卖了一轮，开春正好动工。' },
        { id: 'shallow', label: '先存够眼前的', description: '不折腾，够用就行。', effect: lasting('地窖不大，但每一桶都是好年份。', 4, 2), reply: '窖小，我就不存孬东西。' },
      ]),
    ],
  },
];

const BY_PORTRAIT = new Map(STORIES.map(story => [story.portrait, story]));

export function storyOf(portrait: string): NeighbourStory | undefined {
  return BY_PORTRAIT.get(portrait);
}

/** The names a save is allowed to contain. */
export const STORY_PORTRAITS = STORIES.map(story => story.portrait);

/** Which choices a neighbour has actually made, indexed by stage. */
export type StoryProgress = Record<string, string[]>;

/**
 * Whether a stage's requirement is satisfied. Everything is read from buildings that exist
 * and numbers the town really has, so a story cannot fire in a town without the place it is
 * about.
 */
export function storyRequirementMet(
  requires: StoryRequirement,
  context: { home: boolean; workplace: boolean; level: number; population: number },
): boolean {
  if (requires.home && !context.home) return false;
  if (requires.workplace && !context.workplace) return false;
  if (requires.level !== undefined && context.level < requires.level) return false;
  if (requires.population !== undefined && context.population < requires.population) return false;
  return true;
}

/** The stage a neighbour is ready to tell next, or null when they have nothing waiting. */
export function nextStoryStage(
  portrait: string,
  progress: StoryProgress,
  context: { home: boolean; workplace: boolean; level: number; population: number },
): { index: number; stage: StoryStage } | null {
  const story = storyOf(portrait);
  if (!story) return null;
  const done = progress[portrait]?.length ?? 0;
  const stage = story.stages[done];
  // Stages are told in order, so a later stage never arrives before an earlier one.
  if (!stage) return null;
  return storyRequirementMet(stage.requires, context) ? { index: done, stage } : null;
}

/** Every choice a neighbour has made, with the labels, for the panel. */
export function storyHistory(portrait: string, progress: StoryProgress): { title: string; label: string; perk: string }[] {
  const story = storyOf(portrait);
  if (!story) return [];
  return (progress[portrait] ?? []).flatMap((choiceId, index) => {
    const stage = story.stages[index];
    const choice = stage?.choices.find(entry => entry.id === choiceId);
    return stage && choice ? [{ title: stage.title, label: choice.label, perk: choice.effect.perk }] : [];
  });
}

/** Permanent environment bonus from every choice that left something behind. */
export function storyEnvironment(progress: StoryProgress): number {
  return Object.entries(progress).reduce((total, [portrait, choices]) => {
    const story = storyOf(portrait);
    if (!story) return total;
    return total + choices.reduce((sum, choiceId, index) => {
      const choice = story.stages[index]?.choices.find(entry => entry.id === choiceId);
      return sum + (choice?.effect.environment ?? 0);
    }, 0);
  }, 0);
}

/** The choice a player made, folded into the state the simulation applies. */
export function storyEffect(portrait: string, stageIndex: number, choiceId: string): StoryEffect | null {
  const stage = storyOf(portrait)?.stages[stageIndex];
  return stage?.choices.find(choice => choice.id === choiceId)?.effect ?? null;
}

/** Which story option ids are legal for a given neighbour and stage. */
export function storyChoiceIds(portrait: string, stageIndex: number): string[] {
  return storyOf(portrait)?.stages[stageIndex]?.choices.map(choice => choice.id) ?? [];
}

/**
 * What a neighbour says about the town right now. It names a building that really stands
 * near their home, preferring the most recently built one, so the line reflects what the
 * player actually did rather than a random pleasantry.
 */
export function neighbourNews(
  home: Building | null,
  buildings: readonly Building[],
  population: number,
): string {
  if (!home) return `我正在找地方落脚，${population} 位邻居里，就我还没安顿下来。`;
  if (home.damaged) return '屋顶还漏着，等修缮的人手空出来。';
  // Building ids are handed out in build order, so the highest id nearby is the newest thing.
  const nearby = buildings
    .filter(building => building.id !== home.id && Math.hypot(building.x - home.x, building.y - home.y) <= 8)
    .map(building => ({ building, order: Number(building.id.split('-')[1] ?? 0) }))
    .sort((a, b) => b.order - a.order);
  const newest = nearby[0]?.building;
  if (!newest) return '这一带还空着，正适合慢慢收拾。';
  return `这边最近立起了${buildingLabel(newest)}，我天天路过。`;
}

/** A short, human label for a building, used when a neighbour mentions it. */
function buildingLabel(building: Building): string {
  return BUILDING_LABELS[building.kind] ?? '一处新房子';
}

/** Short names for buildings as neighbours would say them, not as the catalog does. */
const BUILDING_LABELS: Partial<Record<BuildingKind, string>> = {
  farm: '一片新开的田', windmill: '一架风车', bakery: '一间面包房', market: '一个集市',
  lumber: '一个锯木场', quarry: '一处采石场', fishery: '一个渔场', smithy: '一间铁匠铺',
  weaver: '一间织坊', tailor: '一间裁缝铺', school: '一间学堂', clinic: '一间诊室',
  theatre: '一座戏台', well: '一口井', garden: '一座小花园', townhall: '议事厅',
  warehouse: '一座仓库', firetower: '一座望火塔', mine: '一处矿口', kiln: '一座砖窑',
  smelter: '一座熔炉', feedmill: '一座饲料坊', pasture: '一片牧场', apiary: '一排蜂箱',
  vineyard: '一片葡萄园', winery: '一间酒坊', cellar: '一个地窖', cowbarn: '一间牛舍',
  dairy: '一间奶坊', forester: '一片林场', sawmill: '一座锯木厂', fishpond: '一口鱼塘',
  brickworks: '一座制砖场', watertower: '一座水塔', firestation: '一间消防站',
  cottage: '一栋小屋', farmhouse: '一座农家院', rowhouse: '一排出租房', apartment: '一栋公寓',
};
