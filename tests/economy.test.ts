import test from 'node:test';
import assert from 'node:assert/strict';
import { SimWorld, validateSave, type Building } from '../src/sim/world.ts';
import { BUILDINGS, BULK_ORDER_MIN, BULK_ORDER_RATIO, BULK_ORDER_UNLOCK_LEVEL, CARE_BONUS, LEISURE_GOODS, TERMINAL_GOODS, MARKET_GOODS, MARKET_MARKUP, RESOURCES, RESOURCE_KEYS, dailyGoods, emptyResources, type BuildingKind, type Resource } from '../src/sim/data.ts';
import { DESTINATIONS } from '../src/sim/destinations.ts';
import { executeGameTool } from '../src/sim/tools.ts';

function isolated(kind: BuildingKind) {
  const world = new SimWorld();
  world.state.resources = emptyResources();
  for (const b of world.state.buildings) { b.paused=true; b.ready=false; b.stock={}; b.progress=0; }
  const b = world.state.buildings.find(b=>b.kind===kind)!;
  b.paused=false;
  return {world,b};
}

test('full warehouses still allow equal-volume and space-saving processing', () => {
  const {world,b}=isolated('windmill');
  world.state.resources.wheat=world.state.capacity;
  world.tick(28);
  assert.equal(b.ready,true);
  assert.equal(world.collect(b.id).ok,true);
  assert.equal(world.state.resources.flour,3);
  assert.equal(world.observe().warehouseFree,0);
  assert.equal(validateSave(world.state),true);
});

test('sources rest at target, preserve progress, and resume after stock is used', () => {
  const {world,b}=isolated('farm');
  world.state.resources.wheat=world.stockTargets().wheat;
  b.progress=.4;
  world.tick(30);
  assert.equal(b.ready,false); assert.equal(b.progress,.4);
  assert.equal(world.observe().production.find(p=>p.buildingId===b.id)!.blocked,'target');
  world.sell('wheat',5); world.tick(30);
  assert.equal(b.ready,true);
});

test('pending harvest is counted toward quotas so many farms cannot flood storage', () => {
  const world=new SimWorld(); world.state.resources=emptyResources();
  for(const b of world.state.buildings){b.ready=false;b.stock={};b.progress=0;b.paused=b.kind!=='farm';}
  for(let i=0;i<60;i++)world.tick(1);
  const wheat=world.state.buildings.reduce((n,b)=>n+(b.stock.wheat??0),0);
  assert.ok(wheat<=world.stockTargets().wheat+BUILDINGS.farm.output!.wheat!);
});

test('wood directions persist, validate, and never rewrite completed harvests', () => {
  const {world,b}=isolated('lumber');
  const before=JSON.stringify(world.state);
  assert.equal(world.setProductionFocus(b.id,'gold').ok,false);
  assert.equal(JSON.stringify(world.state),before);
  assert.equal(executeGameTool(world,'set_production_focus',{buildingId:b.id,recipeId:'wood'}).ok,true);
  world.tick(24); assert.deepEqual(b.stock,{wood:10});
  world.setProductionFocus(b.id,'plank'); assert.deepEqual(b.stock,{wood:10});
  world.collect(b.id); world.tick(24); assert.deepEqual(b.stock,{wood:2,plank:4});
  const restored=new SimWorld(world.state);
  assert.equal(restored.state.buildings.find(x=>x.id===b.id)!.productionFocus,'plank');
  const invalid=structuredClone(world.state); invalid.buildings[0].productionFocus='wood';
  assert.equal(validateSave(invalid),false);
});

test('full boards never block replenishing wood in balanced mode', () => {
  const {world,b}=isolated('lumber');
  world.state.resources.plank=world.stockTargets().plank;
  world.tick(24); assert.deepEqual(b.stock,{wood:10});
});

test('kilns protect construction timber online and offline, kitchens can still bake', () => {
  const {world}=isolated('bakery');
  world.state.researched=['mining'];
  for(const b of world.state.buildings){b.workers=0;b.staffing=0;b.staffing=0;}
  const kiln: Building={id:'test-kiln',kind:'kiln',x:2,y:2,level:1,paused:false,ready:false,stock:{},progress:.5,workers:1};
  world.state.buildings.push(kiln);
  world.state.resources.wood=world.woodReserve(); world.state.resources.flour=6; world.state.resources.sugar=6;
  world.tick(32); assert.equal(kiln.progress,.5);
  world.offline(100); assert.equal(world.state.resources.wood,world.woodReserve());
  const bakery=world.state.buildings.find(b=>b.kind==='bakery')!;
  bakery.workers=2; world.tick(38);
  assert.equal(bakery.ready,true); assert.equal(world.state.resources.sugar,5,'the bakery spends sugar, not timber');
});

test('surplus sale preserves timber, caravan materials and all visible orders; pays once', () => {
  const world=new SimWorld(); world.state.capacity=3360;
  world.state.resources={...emptyResources(),wood:67,stone:339,wheat:943,flour:598,plank:6,materials:56,ore:1,charcoal:31,ingot:14,tools:254,feed:271,wool:1,clothing:759};
  const quote=world.surplusQuote(), before=structuredClone(world.state);
  assert.ok(quote.quantity>1800); assert.equal(quote.items.wood,undefined); assert.equal(quote.items.materials,undefined);
  assert.equal(world.sellSurplus().ok,true);
  assert.equal(world.state.coins,before.coins+quote.coins);
  for(const key of RESOURCE_KEYS) assert.equal(world.state.resources[key],before.resources[key]-(quote.items[key]??0));
  for(const order of world.state.orders) for(const key of RESOURCE_KEYS) if(before.resources[key]>=(order.items[key]??0)) assert.ok(world.state.resources[key]>=(order.items[key]??0));
  const after=JSON.stringify(world.state);
  assert.equal(world.sellSurplus().code,'NO_SURPLUS'); assert.equal(JSON.stringify(world.state),after);
});

test('mayor clears bulky surplus, harvests food and still completes orders', () => {
  const world=new SimWorld(); world.state.capacity=1000; world.state.settings.autoMayor=true;
  world.state.resources={...emptyResources(),wood:22,wheat:970};
  world.tick(5);
  assert.ok(world.state.resources.wheat<200);
  assert.ok(world.state.resources.wood>=22,'never sells scarce timber first');
  assert.ok(world.state.resources.fish>0);
  for(let i=0;i<300;i++)world.tick(1);
  assert.ok(world.state.stats.ordersCompleted>0,'harvesting must not starve order handling');
});

function expandedTown() {
  const world=new SimWorld();
  world.state.capacity=2560; // base space + ten level-three warehouses
  world.state.buildings.find(b=>b.kind==='warehouse')!.level=3;
  for(let i=0;i<9;i++)world.state.buildings.push({id:`barn-${i}`,kind:'warehouse',x:2+i,y:2,level:3,paused:false,ready:false,stock:{},progress:0,workers:0});
  world.state.resources={...emptyResources(),wood:10,wheat:1800,flour:600};
  assert.equal(validateSave(world.state),true);
  world.sellSurplus();
  return world;
}

test('ten upgraded warehouses sustain eight offline hours without wheat crowding out food or wood', () => {
  const world=expandedTown(), before={...world.state.resources};
  const report=world.offline(8*3600), targets=world.stockTargets();
  assert.ok(world.state.resources.wood>=targets.wood-10);
  assert.ok(world.state.resources.bread+world.state.resources.fish>=Math.ceil(world.state.population/4)*3);
  assert.ok(world.state.resources.wheat<=targets.wheat+4);
  assert.ok(world.observe().warehouseUsed<world.state.capacity*.9);
  assert.ok(report.produced.fish>500,'food production resumes as residents consume it');
  for(const key of RESOURCE_KEYS)assert.equal(world.state.resources[key],before[key]+report.produced[key]-report.consumed[key]);
  assert.equal(validateSave(world.state),true);
});

test('extended manual harvest play retains food and timber with ten warehouses', () => {
  const world=expandedTown();
  for(let seconds=0;seconds<3600;seconds++){world.tick(1);if(seconds%5===0)world.collectAll();}
  assert.ok(world.state.resources.wood>200);
  assert.ok(world.state.resources.bread+world.state.resources.fish>20);
  assert.ok(world.observe().warehouseUsed<world.state.capacity*.9);
  assert.equal(validateSave(world.state),true);
});

/** A quiet town with plenty of food and no hazards, so only the care rules move happiness. */
function caredTown() {
  const w = new SimWorld();
  w.state.settings.disasters = false; w.state.settings.autoMayor = false;
  w.state.population = 12;
  // A middle tax rate, so the town sits well below the ceiling and the whole care bonus
  // is visible instead of being cut off by the clamp at 100%.
  w.state.taxRate = 2;
  w.state.capacity = 2000;
  w.state.resources = { ...emptyResources(), fish: 200, bread: 200, wheat: 100 };
  return w;
}

test('clothes and comforts add happiness and never take it away', () => {
  const bare = caredTown(); bare.tick(90);
  // Missing goods cost nothing: the town lands exactly where the four original needs put it.
  const needs = bare.observe().needs;
  const four = needs.food * .4 + needs.water * .25 + needs.services * .2 + needs.environment * .15;
  assert.ok(Math.abs(bare.state.happiness - (four - 6)) < .01, `missing clothes must not lower the mood: ${bare.state.happiness} vs ${four - 6}`);
  assert.equal(needs.comfort, 0); assert.equal(needs.leisure, 0);

  // Stocked to the brim, the same town gains exactly the care bonus and no more.
  const stocked = caredTown();
  stocked.state.resources.clothing = 40;
  for (const key of LEISURE_GOODS) stocked.state.resources[key] = 40;
  stocked.tick(90);
  const full = stocked.observe().needs;
  assert.equal(full.comfort, 100); assert.equal(full.leisure, 100);
  assert.ok(Math.abs(stocked.state.happiness - bare.state.happiness - CARE_BONUS) < .01, 'a fully stocked town is happier by the care bonus');
  assert.equal(validateSave(stocked.state), true);
});

test('residents wear clothes and share comforts every day', () => {
  const w = caredTown();
  w.state.resources = { ...emptyResources(), fish: 100, bread: 100, clothing: 5, honey: 4 };
  const goods = dailyGoods(w.state.population);
  assert.equal(goods.clothing, 2); assert.equal(goods.luxury, 2);
  w.tick(90);
  assert.equal(w.state.resources.clothing, 3, 'one day of clothes is worn');
  assert.equal(w.state.resources.honey, 2, 'comforts are drawn cheapest first, so honey goes before wine');
  assert.equal(w.state.resources.wine, 0, 'and nothing is taken that the town does not have');

  const before = { ...w.state.resources };
  const report = w.offline(180);
  for (const key of RESOURCE_KEYS) assert.equal(w.state.resources[key], before[key] + report.produced[key] - report.consumed[key], `${key} must be conserved`);
  assert.ok(report.consumed.clothing > 0, 'the offline report says what was worn');
  assert.equal(validateSave(w.state), true);
});

test('the comfort and leisure readings measure against a three-day reserve', () => {
  const w = caredTown();
  w.state.resources = emptyResources();
  assert.equal(w.observe().needs.comfort, 0); assert.equal(w.observe().needs.leisure, 0);

  const need = dailyGoods(w.state.population);
  w.state.resources.clothing = need.clothing * 3 / 2;
  w.state.resources.honey = need.luxury * 3 / 2;
  assert.equal(Math.round(w.observe().needs.comfort), 50, 'half a reserve reads as half');
  assert.equal(Math.round(w.observe().needs.leisure), 50);

  // Comforts pool across kinds: one kind is worth a third of the reserve, and two kinds
  // totalling a full reserve fill the bar.
  w.state.resources = emptyResources();
  w.state.resources.cheese = need.luxury;
  assert.equal(Math.round(w.observe().needs.leisure), 33, 'a third of a reserve from one kind');
  w.state.resources.honey = need.luxury * 2;
  assert.equal(w.observe().needs.leisure, 100, 'honey and cheese together fill the same bar');
});

test('the market sells in at a premium and never as a way to make money', () => {
  const w = new SimWorld();
  assert.ok(w.state.buildings.some(b => b.kind === 'market'), 'the opening town has a market to trade with');

  // Too poor: the purchase is refused and nothing moves.
  const poor = new SimWorld();
  poor.state.coins = w.marketPrice('bread')! - 1;
  const before = { coins: poor.state.coins, bread: poor.state.resources.bread };
  assert.equal(poor.buyResource('bread', 1).code, 'INSUFFICIENT_GOLD');
  assert.deepEqual({ coins: poor.state.coins, bread: poor.state.resources.bread }, before, 'a refused purchase changes nothing');

  w.state.coins = 100000;
  const coins = w.state.coins, bread = w.state.resources.bread;
  const price = w.marketPrice('bread')!;
  assert.ok(w.buyResource('bread', 10).ok, 'the goods arrive once they are paid for');
  assert.equal(w.state.resources.bread, bread + 10, 'ten loaves were added to the barn');
  assert.equal(w.state.coins, coins - price * 10, 'and charged at exactly the quoted unit price');

  // Every unit the market sells in costs far more than the town would get selling it back.
  for (const { resource, unit } of w.observe().market) {
    assert.ok(unit > RESOURCES[resource].sellPrice, `${resource} is dearer to buy than to sell`);
    assert.equal(w.marketPrice(resource), unit);
  }
  // Raw materials and intermediates are NOT traded: buying one and processing it is the loop
  // that made this feature a money press (x266 at workshop level three).
  for (const raw of ['wheat', 'wool', 'cloth', 'flour', 'ore', 'ingot', 'feed', 'wood', 'stone', 'materials'] as const) {
    assert.equal(w.marketPrice(raw), null, `${raw} is not for sale`);
    assert.equal(w.buyResource(raw, 1).code, 'NOT_TRADED');
  }
  assert.equal(w.buyResource('bread', 0).code, 'INVALID_AMOUNT');
  assert.equal(w.buyResource('bread', 1.5).code, 'INVALID_AMOUNT');
  assert.equal(validateSave(w.state), true);
});

test('a purchase is not income and cannot be turned into one', () => {
  const w = new SimWorld();
  w.state.coins = 100000;
  const earned = w.state.stats.coinsEarned;
  w.buyResource('bread', 20);
  assert.equal(w.state.stats.coinsEarned, earned, 'buying must not count toward lifetime earnings');

  // The coins -> goods -> coins round trip always loses: that is the whole point of the
  // markup, since otherwise the market would be a printing press.
  const price = w.marketPrice('bread')!;
  const coins = w.state.coins;
  w.buyResource('bread', 10);
  w.sell('bread', 10);
  assert.ok(w.state.coins < coins, `the round trip lost money as it must: ${coins} -> ${w.state.coins}`);
  assert.ok(price > RESOURCES.bread.sellPrice * 5, 'the markup is steep enough to swallow any resale');
});

test('the market needs a working building and a free shelf', () => {
  const w = new SimWorld();
  w.state.coins = 100000;
  const market = w.state.buildings.find(b => b.kind === 'market')!;
  market.damaged = true; market.damageKind = 'fire';
  assert.equal(w.buyResource('bread', 5).code, 'MARKET_REQUIRED', 'a burnt market trades nothing');
  market.damaged = false;

  w.state.buildings = w.state.buildings.filter(b => b.kind !== 'market');
  assert.equal(w.buyResource('bread', 5).code, 'MARKET_REQUIRED', 'and neither does a town without one');

  const town = new SimWorld();
  town.state.coins = 100000;
  town.state.resources = { ...emptyResources(), wood: town.state.capacity };
  assert.equal(town.buyResource('bread', 5).code, 'WAREHOUSE_FULL', 'no room means no delivery');
  const state = JSON.stringify(town.state);
  assert.equal(town.buyResource('bread', 5).ok, false);
  assert.equal(JSON.stringify(town.state), state, 'a refused purchase changes nothing at all');
});

/** A rich, quiet town with room to spare, for auditing what the market can and cannot do. */
function trader() {
  const w = new SimWorld();
  w.state.settings.disasters = false; w.state.settings.autoMayor = false;
  w.state.coins = 1_000_000; w.state.capacity = 100_000;
  w.state.resources = emptyResources();
  for (const b of w.state.buildings) b.paused = true;
  return w;
}

test('the markup outruns every processing chain the recipe book allows, at every level', () => {
  // The guard this test replaces was too weak in two ways, and both were real: it only looked
  // at level-1 recipes, and it guarded the markup by a number rather than by construction.
  // Workshops multiply their output by level, and the multiplier compounds along a chain, so
  // the wheat-to-clothing route amplifies a purchase x16.7 at level one — safe against an 18x
  // markup — but x75 at level two and x266 at level three. That was a live money press.
  //
  // The market now sells only goods nothing consumes, so the amplification is 1 by
  // construction. This recomputes it from BUILDINGS anyway, at every workshop level, so that a
  // future recipe, level curve, or market change has to clear the same bar.
  const sellValue = (items: Partial<Record<string, number>>) =>
    Object.entries(items).reduce((n, [key, amount]) => n + RESOURCES[key as Resource].sellPrice * amount, 0);
  const scaledOutput = (level: number, amount: number) => Math.max(1, Math.floor(amount * (1 + (level - 1) * 0.5)));
  const recipes = (Object.entries(BUILDINGS) as [BuildingKind, typeof BUILDINGS.cottage][])
    .filter(([, def]) => def.input && def.output);

  let worstOverAllLevels = { resource: '', amplification: 0, level: 0 };
  for (const level of [1, 2, 3]) {
    // What one unit costs in sell-value when only market goods may be bought.
    const cost: Record<string, number> = {};
    for (const key of RESOURCE_KEYS) cost[key] = MARKET_GOODS.includes(key) ? RESOURCES[key].sellPrice : Infinity;
    for (let pass = 0; pass < 60; pass++) {
      let changed = false;
      for (const [, def] of recipes) {
        const spend = Object.entries(def.input!).reduce((n, [key, amount]) => n + cost[key as Resource]! * amount, 0);
        if (!Number.isFinite(spend) || spend <= 0) continue;
        for (const [out, amount] of Object.entries(def.output!)) {
          const per = spend / scaledOutput(level, amount);
          if (per < cost[out]! - 1e-9) { cost[out] = per; changed = true; }
        }
      }
      if (!changed) break;
    }
    for (const key of RESOURCE_KEYS) {
      if (!Number.isFinite(cost[key]!) || cost[key]! <= 0) continue;
      const amplification = RESOURCES[key].sellPrice / cost[key]!;
      if (amplification > worstOverAllLevels.amplification) worstOverAllLevels = { resource: key, amplification, level };
    }
  }

  assert.ok(worstOverAllLevels.amplification < MARKET_MARKUP,
    `${worstOverAllLevels.resource} amplifies bought value x${worstOverAllLevels.amplification.toFixed(2)} at level ${worstOverAllLevels.level}, which the x${MARKET_MARKUP} markup must exceed`);
  assert.ok(MARKET_MARKUP / worstOverAllLevels.amplification > 1.05, 'the markup clears the worst chain with margin');

  // And the reason it is safe: what the market sells is exactly what nothing consumes, so
  // there is no recipe to launder a purchase through in the first place.
  const consumed = new Set<string>();
  for (const [, def] of recipes) for (const key of Object.keys(def.input!)) consumed.add(key);
  for (const key of MARKET_GOODS) assert.ok(!consumed.has(key), `${key} is sold but also consumed — that reopens the loop`);
  for (const key of RESOURCE_KEYS) if (key !== 'materials' && !consumed.has(key)) assert.ok(MARKET_GOODS.includes(key), `${key} is finished, so the market should trade it`);

  // The same accounting with real coins: buying finished goods and reselling them loses.
  const w = trader();
  const coins = w.state.coins;
  const price = w.marketPrice('clothing')!;
  assert.ok(w.buyResource('clothing', 20).ok, 'finished goods can be bought');
  assert.equal(w.state.coins, coins - price * 20);
  assert.ok(price > RESOURCES.clothing.sellPrice, 'and cost more than they fetch');
  assert.equal(validateSave(w.state), true);
});

test('no market purchase can be resold, processed or shipped at a profit', () => {
  const w = trader();
  const coins = w.state.coins;

  // 1. Buy and resell the same good.
  for (const { resource } of w.observe().market) {
    const unit = w.marketPrice(resource)!;
    assert.ok(unit > RESOURCES[resource].sellPrice * 2, `${resource} cannot be immediately resold for profit`);
  }

  // A good the market does not trade simply cannot be funded at all, which is the strongest
  // possible answer to "can this be bought cheaply?".
  const spendOn = (items: Partial<Record<Resource, number>>) => Object.entries(items)
    .reduce((n, [key, amount]) => {
      const unit = w.marketPrice(key as Resource);
      return unit === null ? Infinity : n + unit * amount!;
    }, 0);

  // 2. Buy a caravan's whole manifest and ship it.
  for (const destination of Object.values(DESTINATIONS)) {
    assert.ok(destination.rewardCoins < spendOn(destination.cargo), `${destination.id} cannot be funded from the market for a profit`);
  }

  // 3. Buy an order's ingredients and deliver it.
  for (const order of w.state.orders) {
    assert.ok(order.rewardCoins < spendOn(order.items), `order ${order.id} cannot be filled from the market for a profit`);
  }
  assert.equal(w.state.coins, coins, 'auditing spends nothing');
});

/** Places a building on the first tile the rules accept, wherever that is. */
function raise(w: SimWorld, kind: BuildingKind) {
  for (let y = 2; y < 45; y++) for (let x = 2; x < 45; x++) {
    const result = w.build(kind, x, y);
    if (result.ok) return;
    if (result.code !== 'INVALID_TERRAIN' && result.code !== 'TILE_OCCUPIED') throw new Error(`${kind}: ${result.message}`);
  }
  throw new Error(`${kind}: nowhere to build`);
}

/**
 * A town that qualifies for commissions: big enough, and **holding** a surplus of at least three
 * finished goods. Holding is the requirement, not merely being able to make them — see the
 * commissionPool note in world.ts — so the fixture stocks three goods that nothing consumes.
 */
function commissioned() {
  const w = new SimWorld();
  w.state.settings.disasters = false; w.state.settings.autoMayor = false;
  w.state.coins = 100000; w.state.capacity = 20000; w.state.level = 8; w.state.population = 24;
  w.state.resources = { ...emptyResources(), wood: 400, stone: 300, plank: 200, bread: 60, fish: 60, wheat: 300, flour: 200, materials: 60 };
  for (const technology of ['tailoring', 'husbandry'] as const) if (!w.state.researched.includes(technology)) w.state.researched.push(technology);
  // Bread and fish come from the opening village; a third finished good that residents do not
  // wear or eat is what makes a commission possible.
  for (const kind of ['apiary', 'apiary'] as BuildingKind[]) raise(w, kind);
  w.state.resources.honey = 60;
  return w;
}

test('a bulk commission arrives on schedule and never asks for what the town cannot make', () => {
  const w = commissioned();
  const ordinary = w.state.orders.length;
  assert.equal(w.observe().orders.some(o => o.bulk), false, 'a fresh town has no commission yet');

  // Advance to just before the due time, then past it.
  w.state.gameTime = (w.state.nextBulkOrderAt ?? 0) - 1;
  w.tick(0.5);
  assert.equal(w.state.orders.some(o => o.bulk), false, 'it does not arrive early');
  w.state.gameTime = (w.state.nextBulkOrderAt ?? 0) + 1;
  w.tick(0.5);

  const bulk = w.state.orders.find(o => o.bulk);
  assert.ok(bulk, 'the commission arrives when due');
  assert.equal(w.state.orders.length, ordinary + 1, 'it is an extra card, not a replacement');
  assert.ok(Object.keys(bulk.items).length >= 3, `it asks for several goods: ${JSON.stringify(bulk.items)}`);
  for (const [key, amount] of Object.entries(bulk.items)) {
    assert.ok(w.state.buildings.some(b => BUILDINGS[b.kind].output?.[key as Resource]), `${key} is something the town can make`);
    assert.ok(amount! >= 1, `${key} is asked for in a real quantity`);
    // The load-bearing rule: nothing may consume it, or the order could never be stocked up.
    assert.ok(!(Object.values(BUILDINGS) as typeof BUILDINGS.cottage[]).some(def => (def.input?.[key as Resource] ?? 0) > 0),
      `${key} is a finished good, so no workshop drains it before the order is filled`);
    assert.ok(TERMINAL_GOODS.includes(key as Resource), `${key} is a terminal good`);
    // And it is already in the barn, so the order can be filled the moment it arrives.
    assert.ok(w.state.resources[key as Resource] >= amount!, `${key}: the town already holds what is asked for`);
  }
  assert.ok(bulk.bulkUntil! > w.state.gameTime, 'and it carries the deadline the company will honour');
  assert.equal(bulk.bulk, true, 'the flag is what the interface marks it by');
  assert.equal(validateSave(w.state), true);
});

test('only one commission is on the board at a time, and filling it brings the next', () => {
  const w = commissioned();
  const spawn = () => { w.state.gameTime = (w.state.nextBulkOrderAt ?? 0) + 1; w.tick(0.5); };
  spawn();
  const first = w.state.orders.find(o => o.bulk)!;
  // A second interval passing must not stack a second commission on the same board.
  spawn();
  assert.equal(w.state.orders.filter(o => o.bulk).length, 1, 'commissions do not pile up');

  for (const [key, amount] of Object.entries(first.items)) w.state.resources[key as Resource] = amount! + 50;
  const coins = w.state.coins, completed = w.state.stats.ordersCompleted;
  assert.equal(w.fulfillOrder(first.id).ok, true);
  assert.equal(w.state.orders.some(o => o.id === first.id), false, 'the card leaves the board once filled');
  assert.equal(w.state.orders.filter(o => o.bulk).length, 0, 'and does not refill instantly like an ordinary order');
  assert.ok(w.state.coins > coins, 'it pays');
  assert.equal(w.state.stats.ordersCompleted, completed + 1, 'and counts as an order for quests and achievements');
  assert.equal(validateSave(w.state), true);
});

test('a commission cannot be cancelled, and the refund-free refusal is honest', () => {
  const w = commissioned();
  w.state.gameTime = (w.state.nextBulkOrderAt ?? 0) + 1; w.tick(0.5);
  const bulk = w.state.orders.find(o => o.bulk)!;
  const before = JSON.stringify(w.state.orders);
  const refused = w.cancelOrder(bulk.id);
  assert.equal(refused.code, 'BULK_ORDER_LOCKED', 'a commission is not swappable like an ordinary order');
  assert.equal(JSON.stringify(w.state.orders), before, 'and the refusal changes nothing');

  // An ordinary order still cancels exactly as it always did.
  const plain = w.state.orders.find(o => !o.bulk)!;
  assert.equal(w.cancelOrder(plain.id).ok, true);
});

test('a commission pays better per item than the board and worse than a caravan', () => {
  // The design claim, checked against the numbers the rest of the economy actually uses.
  const w = commissioned();
  w.state.gameTime = (w.state.nextBulkOrderAt ?? 0) + 1; w.tick(0.5);
  const bulk = w.state.orders.find(o => o.bulk)!;
  const value = Object.entries(bulk.items).reduce((n, [key, amount]) => n + RESOURCES[key as Resource].sellPrice * amount!, 0);
  const ratio = bulk.rewardCoins / value;
  assert.ok(Math.abs(ratio - BULK_ORDER_RATIO) < 0.02, `commission pays ${ratio.toFixed(2)}x its goods`);
  assert.ok(BULK_ORDER_RATIO > 2.8, 'better than the ordinary board');
  assert.ok(BULK_ORDER_RATIO < 4.4, 'and clearly worse than a caravan run, which stays the best use of a surplus');
});

test('the mayor fills a commission when the reserves allow, and holds back when they do not', () => {
  // Spawned with the mayor off, so the commission is on the board before the decision begins:
  // a town that already holds everything would otherwise see it filled within the same tick,
  // which is correct behaviour and simply not what this test measures.
  const w = commissioned();
  w.state.gameTime = (w.state.nextBulkOrderAt ?? 0) + 1; w.tick(0.5);
  const bulk = w.state.orders.find(o => o.bulk)!;
  assert.ok(bulk, 'the commission is on the board');
  for (const [key, amount] of Object.entries(bulk.items)) w.state.resources[key as Resource] = amount! + 200;
  // Keep the timber and rations reserves the mayor is required to protect.
  w.state.resources.wood = 300; w.state.resources.bread = 200; w.state.resources.fish = 200;
  w.state.settings.autoMayor = true; w.state.happiness = 95; w.state.taxRate = 1; w.state.lastMayorAt = 0;
  w.tick(6);
  assert.equal(w.state.orders.some(o => o.id === bulk.id), false, 'the mayor takes a commission it can afford');

  // Short of provisions, it leaves the commission alone rather than emptying the larder.
  const poor = commissioned();
  poor.state.gameTime = (poor.state.nextBulkOrderAt ?? 0) + 1; poor.tick(0.5);
  const wanted = poor.state.orders.find(o => o.bulk)!;
  assert.ok(wanted, 'the poor town received one too');
  for (const key of RESOURCE_KEYS) poor.state.resources[key] = 0;
  poor.state.resources.bread = 1;
  poor.state.settings.autoMayor = true; poor.state.happiness = 95; poor.state.lastMayorAt = 0;
  poor.tick(6);
  assert.equal(poor.state.orders.some(o => o.id === wanted.id), true, 'a hungry town keeps the commission waiting');
});

test('a town that holds no surplus of three finished goods gets no commission', () => {
  // The gate is the honest statement of what a commission needs. Capability alone is not
  // enough: a town can have a complete tailoring chain and still never hold any clothes,
  // because its residents wear them as fast as they are sewn. Commissions ask for what is
  // actually in the barn, so a town holding nothing gets nothing — and is not left with an
  // unfillable card either.
  const bare = () => {
    const w = new SimWorld();
    w.state.settings.disasters = false; w.state.settings.autoMayor = false;
    w.state.coins = 100000; w.state.capacity = 20000; w.state.level = 8; w.state.population = 24;
    w.state.resources = { ...emptyResources(), wood: 400, stone: 300, bread: 200, fish: 200, wheat: 300, flour: 200 };
    return w;
  };

  // The opening village bakes and fishes, and holds nothing else finished.
  const hungry = bare();
  hungry.state.gameTime = (hungry.state.nextBulkOrderAt ?? 0) + 1;
  hungry.tick(0.5);
  assert.equal(hungry.state.orders.some(o => o.bulk), false, 'bread and fish alone are not a variety');

  // Stocking a third finished good — food it can hold, not clothes it wears — lets one through.
  const stocked = bare();
  stocked.state.resources.honey = 60;
  stocked.state.researched.push('husbandry');
  raise(stocked, 'apiary');
  stocked.state.gameTime = (stocked.state.nextBulkOrderAt ?? 0) + 1;
  stocked.tick(0.5);
  assert.equal(stocked.state.orders.some(o => o.bulk), true, 'a third good it can hold lets one through');

  // And a good the town cannot make is not counted, however much of it is on the shelf.
  const exotic = bare();
  exotic.state.resources.vintage = 500;
  exotic.state.gameTime = (exotic.state.nextBulkOrderAt ?? 0) + 1;
  exotic.tick(0.5);
  assert.equal(exotic.state.orders.some(o => o.bulk), false, 'stock alone is not enough — the town must be able to make it');
});

test('offline settlement neither invents nor fills a commission', () => {
  // The commission is a decision the player makes when present, like the mayor's other
  // actions: coming back must not find one that appeared or vanished while away.
  const w = commissioned();
  const before = w.state.orders.length;
  const report = w.offline(3600);
  assert.equal(w.state.orders.length, before, 'no commission is invented while away');
  assert.equal(w.state.orders.some(o => o.bulk), false, 'and none is filled');
  assert.ok(report.tax >= 0);
  assert.equal(validateSave(w.state), true);
});

test('a commission never asks for more of a good than the barn can hold', () => {
  // The bug this pins: commissions asked for 8-13 of every good, but a workshop rests once a
  // good reaches its stock target, which is set by how much warehouse space the town has. In a
  // small town the target for honey is 6 and for cheese 10, so a commission naming honey could
  // never be filled — and because a commission cannot be cancelled and blocks the next one, it
  // jammed the board permanently.
  const small = () => {
    const w = new SimWorld();
    w.state.settings.disasters = false; w.state.settings.autoMayor = false;
    w.state.capacity = 400; w.state.level = 8; w.state.population = 30; w.state.coins = 1_000_000;
    w.state.researched = ['husbandry', 'tailoring', 'metallurgy', 'mining', 'viniculture'];
    w.state.resources = { ...emptyResources(), wood: 600, stone: 400, materials: 60 };
    for (const kind of ['feedmill', 'cowbarn', 'dairy', 'apiary', 'pasture', 'weaver', 'tailor'] as BuildingKind[]) raise(w, kind);
    w.state.resources.wood = 60; w.state.resources.stone = 40; w.state.resources.materials = 5;
    return w;
  };

  for (const capacity of [400, 1000, 4000]) {
    const w = small();
    w.state.capacity = capacity;
    w.state.resources = { ...w.state.resources, wood: 60, stone: 40, materials: 5, wheat: 40, feed: 40 };
    w.state.gameTime = (w.state.nextBulkOrderAt ?? 0) + 1;
    w.tick(0.5);
    const bulk = w.state.orders.find(o => o.bulk);
    if (!bulk) continue;   // fewer than three stockable finished goods: correctly no commission
    const targets = w.stockTargets();
    for (const [key, amount] of Object.entries(bulk.items)) {
      assert.ok(amount! <= targets[key as Resource], `${key}: asks ${amount}, barn can hold ${targets[key as Resource]}`);
      assert.ok(amount! >= BULK_ORDER_MIN, `${key}: still asks for a meaningful volume`);
    }
    assert.ok(Object.keys(bulk.items).length >= 3, 'and still asks for several kinds');
  }

  // A town that cannot stock three kinds gets no commission rather than an unfillable one.
  const cramped = small();
  cramped.state.capacity = 240;
  cramped.state.gameTime = (cramped.state.nextBulkOrderAt ?? 0) + 1;
  cramped.tick(0.5);
  const offered = cramped.state.orders.find(o => o.bulk);
  if (offered) {
    const targets = cramped.stockTargets();
    for (const [key, amount] of Object.entries(offered.items)) {
      assert.ok(amount! <= targets[key as Resource], `even a cramped town is only asked for what it can hold: ${key}`);
    }
  }
});

test('commissions only appear once the town is big enough, not before', () => {
  // The unlock level had no test: lowering it from 6 to 2 left the whole suite green, so
  // nothing defended the intended pacing.
  const at = (level: number) => {
    const w = commissioned();
    w.state.level = level;
    w.state.gameTime = (w.state.nextBulkOrderAt ?? 0) + 1;
    w.tick(0.5);
    return w.state.orders.some(o => o.bulk);
  };
  assert.equal(at(BULK_ORDER_UNLOCK_LEVEL - 1), false, `no commission at level ${BULK_ORDER_UNLOCK_LEVEL - 1}`);
  assert.equal(at(BULK_ORDER_UNLOCK_LEVEL), true, `and one is due at level ${BULK_ORDER_UNLOCK_LEVEL}`);

  // Time alone does not unlock it either: a small town that waits several intervals still gets none.
  const small = commissioned();
  small.state.level = 3;
  for (let i = 0; i < 5; i++) { small.state.gameTime = (small.state.nextBulkOrderAt ?? 0) + 1; small.tick(0.5); }
  assert.equal(small.state.orders.some(o => o.bulk), false, 'waiting does not bypass the level gate');
});

test('the market is reachable through the tool surface, with the same rules', () => {
  // The agent interface is a public contract — it was wired but never exercised.
  const w = commissioned();
  w.state.coins = 100000;
  const before = { coins: w.state.coins, bread: w.state.resources.bread };

  const ok = executeGameTool(w, 'buy_resource', { resource: 'bread', amount: 3 });
  assert.equal(ok.ok, true, 'a finished good can be bought through the tool');
  assert.equal(w.state.coins, before.coins - w.marketPrice('bread')! * 3);
  assert.equal(w.state.resources.bread, before.bread + 3);

  // A raw material is refused by the schema itself, before the simulation ever sees it.
  assert.equal(executeGameTool(w, 'buy_resource', { resource: 'wheat', amount: 3 }).ok, false, 'raw materials are not on the menu');
  assert.equal(executeGameTool(w, 'buy_resource', { resource: 'bread', amount: 100000 }).ok, false, 'nor is an absurd quantity');
  assert.equal(executeGameTool(w, 'buy_resource', { resource: 'bread' }).ok, false, 'the amount is required');

  // And the tool reports the commission flag the interface keys off.
  const orders = executeGameTool(w, 'get_pending_orders', {});
  assert.equal(orders.ok, true);
});

test('a commission the town never fills is withdrawn, so the board can never jam', () => {
  // The failure this bounds: a commission cannot be cancelled and only one exists at a time, so
  // an unfillable one would sit on the board forever and block every later commission. Rather
  // than predict each way a good can turn out to be unreachable, the company gives up.
  const w = commissioned();
  w.state.gameTime = (w.state.nextBulkOrderAt ?? 0) + 1;
  w.tick(0.5);
  const bulk = w.state.orders.find(o => o.bulk)!;
  assert.ok(bulk.bulkUntil! > w.state.gameTime, 'the deadline is set when it arrives');

  // Empty the barn so it genuinely cannot be filled, then wait past the deadline.
  w.state.resources = emptyResources();
  const ordersBefore = w.state.orders.length;
  w.state.gameTime = bulk.bulkUntil! - 1; w.tick(0.5);
  assert.equal(w.state.orders.some(o => o.id === bulk.id), true, 'it is still waiting just before the deadline');

  w.state.gameTime = bulk.bulkUntil! + 1; w.tick(0.5);
  assert.equal(w.state.orders.some(o => o.id === bulk.id), false, 'and withdrawn once the company loses patience');
  assert.equal(w.state.orders.length, ordersBefore - 1, 'leaving the board smaller, not bigger');
  assert.ok(w.state.logs.some(l => l.message.includes('撤回去了')), 'and the town is told why it vanished');

  // The schedule then moves on rather than offering a replacement in the same instant.
  assert.ok((w.state.nextBulkOrderAt ?? 0) > w.state.gameTime, 'the next one is scheduled forward, not queued up');
  assert.equal(validateSave(w.state), true);
});
