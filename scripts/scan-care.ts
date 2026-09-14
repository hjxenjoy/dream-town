// Long-run scan in the docs/15 style: drive SimWorld directly and assert every observable
// stays inside its bounds while the care rules consume finished goods. Run with
// `npx tsx scripts/scan-care.ts`. It prints ALL INVARIANTS HELD, or the first breaches.
import { SimWorld, validateSave } from '../src/sim/world.ts';
import { BUILDINGS, CARE_BONUS, RESOURCE_KEYS, TECHNOLOGY_KEYS, type BuildingKind, type Resource } from '../src/sim/data.ts';

const STEP = 0.5;
function check(w: SimWorld, seen: string[], label: string) {
  const s = w.state;
  const o = w.observe();
  const bad = (cond: boolean, msg: string) => { if (!cond) seen.push(`${label}: ${msg}`); };
  bad(Number.isFinite(s.coins) && s.coins >= 0, 'coins');
  bad(Number.isFinite(s.prestige) && s.prestige >= 0, 'prestige');
  bad(s.happiness >= 0 && s.happiness <= 100, 'happiness');
  // During a repair window the damaged house is uninhabitable, so the live capacity dips below
  // the population. docs/15 §五 fixes the criterion: compare against every building intact.
  const broken = s.buildings.filter(b => b.damaged);
  for (const b of broken) b.damaged = false;
  const intactCapacity = w.observe().populationCapacity;
  for (const b of broken) b.damaged = true;
  bad(s.population >= 4 && s.population <= intactCapacity, `population ${s.population}/${intactCapacity} (live ${o.populationCapacity})`);
  bad(RESOURCE_KEYS.every(k => Number.isInteger(s.resources[k]) && s.resources[k] >= 0), 'resources');
  bad(RESOURCE_KEYS.reduce((n, k) => n + s.resources[k], 0) <= s.capacity, 'capacity');
  bad(['food','water','services','environment','comfort','leisure'].every(k => s.needs[k as 'food'] >= 0 && s.needs[k as 'food'] <= 100), 'needs');
  bad(s.buildings.every(b => b.progress >= 0 && b.progress <= 1 && b.level >= 1 && b.level <= 3), 'buildings');
  bad(s.logs.length <= 60, 'logs');
  bad(validateSave(s), 'save validation');
}

function build(w: SimWorld, kind: BuildingKind) {
  // Placement is not what this scan is about, so take the first tile the rules accept
  // rather than guessing coordinates that may fall in the river.
  for (let y = 2; y < 45; y++) for (let x = 2; x < 45; x++) {
    const r = w.build(kind, x, y);
    if (r.ok) return w.state.buildings.find(b => b.id === r.buildingId)!;
    if (r.code !== 'INVALID_TERRAIN' && r.code !== 'TILE_OCCUPIED') throw new Error(`build ${kind}: ${r.message} (${r.code})`);
  }
  throw new Error(`build ${kind}: no free land`);
}

/** A town with the whole tree researched and every chain standing, so goods really flow. */
function industrious() {
  const w = new SimWorld();
  w.state.settings.disasters = false; w.state.settings.autoMayor = false;
  w.state.coins = 1_000_000; w.state.capacity = 12_000;
  // Population is set to what the town has beds for; over-filling it would be a fixture bug,
  // not a finding (docs/15 records the bed-count criterion for this check).
  w.state.population = 18; w.state.level = 20; w.state.prestige = 500;
  for (const key of RESOURCE_KEYS) w.state.resources[key] = 300;
  for (const id of TECHNOLOGY_KEYS) { const r = w.research(id); if (!r.ok) throw new Error(`research ${id}: ${r.message}`); }
  w.state.researched = [...TECHNOLOGY_KEYS];
  for (const b of w.state.buildings) { b.paused = true; b.workers = 0; b.staffing = 0; b.ready = false; b.stock = {}; b.progress = 0; }
  return w;
}

function scenario(label: string, setup: (w: SimWorld) => void, hours: number, collect = false) {
  const w = industrious();
  setup(w);
  const seen: string[] = [];
  const steps = Math.round(hours * 3600 / STEP);
  const started = performance.now();
  let peakComfort = 0, peakLeisure = 0;
  for (let i = 0; i < steps; i++) {
    w.tick(STEP);
    // Roughly every five in-game minutes a player would sweep the map for finished work.
    if (collect && i % 10 === 0) w.collectAll();
    const needs = w.observe().needs;
    peakComfort = Math.max(peakComfort, needs.comfort);
    peakLeisure = Math.max(peakLeisure, needs.leisure);
    if (i % 200 === 0) check(w, seen, label);
  }
  peaks.push({ label, comfort: peakComfort, leisure: peakLeisure });
  timings.push({ label, ms: performance.now() - started, buildings: w.state.buildings.length });
  const o = w.observe();
  console.log(`${label.padEnd(22)}${' '+ String(Math.round(peakComfort)).padStart(3) + '/' + String(Math.round(peakLeisure)).padStart(3) + ' 峰值'} 人口 ${String(w.state.population).padStart(3)} 幸福 ${w.state.happiness.toFixed(1).padStart(6)} 温饱 ${String(Math.round(o.needs.comfort)).padStart(3)} 闲适 ${String(Math.round(o.needs.leisure)).padStart(3)} 衣物 ${String(w.state.resources.clothing).padStart(4)} 蜂蜜 ${String(w.state.resources.honey).padStart(4)} 酒 ${String(w.state.resources.wine).padStart(4)} 金币 ${Math.round(w.state.coins)}`);
  return seen;
}

const problems: string[] = [];
const peaks: { label: string; comfort: number; leisure: number }[] = [];
const timings: { label: string; ms: number; buildings: number }[] = [];

// 1. Nothing built: goods are only consumed, never replenished. Happiness must fall to exactly
//    the four-need level and stop — never below what it was before the care rules existed.
problems.push(...scenario('only consuming', w => {
  for (const b of w.state.buildings) b.paused = true;
  w.state.resources.clothing = 0;
  for (const key of ['honey', 'cheese', 'wine', 'vintage'] as Resource[]) w.state.resources[key] = 0;
}, 6));

// 2. Tailoring and the pastoral chain running, so clothes and comforts are actually made.
problems.push(...scenario('clothes+comforts', w => {
  for (const k of ['tailor', 'weaver', 'pasture', 'feedmill', 'cowbarn', 'apiary', 'winery', 'vineyard', 'dairy'] as BuildingKind[]) build(w, k);
  
  
  w.state.resources.clothing = 60;
  for (const key of ['honey', 'cheese', 'wine', 'vintage'] as Resource[]) w.state.resources[key] = 60;
}, 20, true));

// 3. Automated mayor over a long stretch, with hazards on: the worst realistic combination.
problems.push(...scenario('mayor + hazards', w => {
  w.state.settings.autoMayor = true; w.state.settings.disasters = true;
  for (const b of w.state.buildings) { b.paused = false; b.staffing = BUILDINGS[b.kind].workers ?? 0; }
  w.state.resources.clothing = 60;
  for (const key of ['honey', 'cheese', 'wine', 'vintage'] as Resource[]) w.state.resources[key] = 60;
}, 20));

// 4. Offline settlement across the cap, reconciled day by day.
{
  const w = industrious();
  for (const k of ['tailor', 'apiary'] as BuildingKind[]) build(w, k);
  w.state.resources.clothing = 80; w.state.resources.honey = 80;
  const before: Record<string, number> = { ...w.state.resources };
  const report = w.offlineUntil(w.state.savedAt + 8 * 3600 * 1000);
  for (const key of RESOURCE_KEYS) {
    const expected = before[key]! + report.produced[key] - report.consumed[key];
    if (w.state.resources[key] !== expected) problems.push(`offline: ${key} ${w.state.resources[key]} != ${expected}`);
  }
  if (!(report.consumed.clothing > 0)) problems.push('offline: no clothes were worn');
  console.log(`offline 8h            报告消耗衣物 ${report.consumed.clothing} 蜂蜜 ${report.consumed.honey} 酒 ${report.consumed.wine} 幸福变化 ${report.happinessChange.toFixed(2)}`);
}

// 5. The bonus is bounded and is never a penalty, measured against the care bonus ceiling.
{
  const w = industrious();
  w.state.taxRate = 2;
  for (const key of ['honey', 'cheese', 'wine', 'vintage'] as Resource[]) w.state.resources[key] = 0;
  w.state.resources.clothing = 0;
  w.tick(90);
  const without = w.state.happiness;
  for (const key of ['honey', 'cheese', 'wine', 'vintage'] as Resource[]) w.state.resources[key] = 500;
  w.state.resources.clothing = 500;
  w.state.capacity = 6000;
  w.tick(90);
  const gain = w.state.happiness - without;
  console.log(`care ceiling          裸镇 ${without.toFixed(2)} 富足 ${w.state.happiness.toFixed(2)} 增益 ${gain.toFixed(2)} / 上限 ${CARE_BONUS}`);
  if (without <= 0) problems.push('care: a bare town was penalised');
  if (gain > CARE_BONUS + 1e-6) problems.push(`care: gain ${gain} exceeds the ceiling ${CARE_BONUS}`);
}

// The care layer must actually be reachable, not just harmless: at least one scenario has to
// have stocked clothes and comforts through real production, or the check above proves nothing.
if (!peaks.some(p => p.comfort > 0 && p.leisure > 0)) problems.push('care: no scenario ever reached a stocked town, so the care rules were never exercised');

for (const t of timings) console.log(`  cost ${t.label.padEnd(22)} ${(t.ms / 1000).toFixed(1)}s  (${t.buildings} buildings)`);

console.log(problems.length ? `\n✗ ${problems.length} 处越界:\n${problems.slice(0, 20).join('\n')}` : '\nALL INVARIANTS HELD');
