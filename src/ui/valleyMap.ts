import { REGIONS, REGION_IDS, regionAt, type RegionId } from '../sim/regions';
import { PLAYABLE_SIZE, MAP_SIZE, DISTRICTS, DISTRICT_KEYS, BRIDGES, riverX, terrainAt, type District } from '../sim/terrain';
import type { Building } from '../sim/world';
import { BUILDINGS } from '../sim/data';
import { presetRoads, type MapPreset } from '../sim/presets';
import { icon } from './icons';

const project=(x:number,y:number)=>({x:160+(x-y)*146/MAP_SIZE,y:12+(x+y)*74/MAP_SIZE});
export function valleyMap(buildings:Building[],focus?:{x:number;y:number},regions:readonly RegionId[]=[]) {
  const river=Array.from({length:MAP_SIZE+1},(_,y)=>{const p=project(riverX(y),y);return `${p.x},${p.y}`;}).join(' ');
  const terrain:string[]=[];
  const locked:string[]=[];
  for(let x=1;x<=PLAYABLE_SIZE;x++)for(let y=1;y<=PLAYABLE_SIZE;y++){const r=regionAt(x,y);if(r&&!regions.includes(r)&&terrainAt(x,y)==='land'){const p=project(x,y);locked.push(`M${p.x},${p.y-1.2}l2.3,1.2-2.3,1.2-2.3,-1.2Z`);}}
  for(let x=1;x<=PLAYABLE_SIZE;x++)for(let y=1;y<=PLAYABLE_SIZE;y++)if(terrainAt(x,y)==='mountain'){const p=project(x,y);terrain.push(`M${p.x},${p.y-2}l3,2-3,2-3,-2Z`);}
  return `<svg class="valley-map" viewBox="0 0 320 176" role="img" aria-label="青岚河两岸地图：居民与农业在西岸，山麓矿区与工业在东岸"><path d="M160 10 306 85 160 160 14 85Z" fill="#c8d29e" stroke="#a2b583" stroke-width="2"/><path d="M160 10 306 85 233 122 87 48Z" fill="#c3c9a6" opacity=".5"/><path d="${terrain.join('')}" fill="#8e9e92"/><polyline points="${river}" fill="none" stroke="#f3e6b7" stroke-width="13"/><polyline points="${river}" fill="none" stroke="#77afae" stroke-width="9"/>${BRIDGES.map(y=>{const a=project(riverX(y)-2.4,y),b=project(riverX(y)+2.4,y);return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#917a50" stroke-width="4"/>`;}).join('')}<path d="${locked.join('')}" fill="#526a4b" opacity=".3"/>${REGION_IDS.map(id=>{const d=REGIONS[id],p=project(d.x,d.y);return `<text x="${p.x}" y="${p.y}" text-anchor="middle" font-size="7" fill="#42543b">${d.name}${regions.includes(id)?'':' · 待开放'}</text>`;}).join('')}${buildings.map(b=>{const p=project(b.x,b.y);return `<circle cx="${p.x}" cy="${p.y}" r="${b.kind==='farm'?1.2:1.9}" fill="${b.kind==='farm'?'#bf9949':'#906142'}" stroke="#fff2cc" stroke-width=".5"/>`;}).join('')}${DISTRICT_KEYS.map(id=>{const d=DISTRICTS[id],p=project(d.x,d.y);return `<text x="${p.x}" y="${p.y-9}" text-anchor="middle" fill="#526a4b" font-size="8" font-family="serif">${d.name}</text>`;}).join('')}${focus?(()=>{const p=project(focus.x,focus.y);return `<rect x="${p.x-12}" y="${p.y-7}" width="24" height="14" rx="3" fill="#fff9db33" stroke="#fff9db" stroke-width="1.4"/>`;})():''}</svg>`;
}
/**
 * A map blueprint drawn as a thumbnail: the river, the streets and every planned building,
 * coloured by what it is. This is what the preset picker shows, so a map is chosen by
 * looking at the plan rather than reading a list of features.
 */
export function presetMap(map: MapPreset) {
  const palette: Record<string, string> = { homes: '#e6c78d', production: '#c2925c', services: '#a86f52', decoration: '#8fb26a' };
  const river = Array.from({ length: MAP_SIZE + 1 }, (_, y) => { const p = project(riverX(y), y); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
  const roads = presetRoads(map).map(road => { const p = project(road.x, road.y); return `<rect x="${(p.x - 1).toFixed(1)}" y="${(p.y - 1).toFixed(1)}" width="2" height="2"/>`; }).join('');
  const buildings = map.placements.map(placement => {
    const p = project(placement.x, placement.y);
    return `<rect x="${(p.x - 1.7).toFixed(1)}" y="${(p.y - 1.7).toFixed(1)}" width="3.4" height="3.4" fill="${palette[BUILDINGS[placement.kind].category]}"/>`;
  }).join('');
  return `<svg class="preset-map" viewBox="0 0 320 176" role="img" aria-label="${map.name}规划图"><path d="M160 10 306 85 160 160 14 85Z" fill="#c8d29e" stroke="#a2b583" stroke-width="2"/><polyline points="${river}" fill="none" stroke="#77afae" stroke-width="9"/><g fill="#e8d9a0" opacity=".9">${roads}</g>${buildings}</svg>`;
}
export const districtButtons=()=>DISTRICT_KEYS.map(id=>{const d=DISTRICTS[id];return `<button data-action="district" data-value="${id}" aria-label="前往${d.name}" title="${d.subtitle}">${icon(d.icon,17)}<span>${d.name.replace('河西','').replace('南岸','').replace('河东','').replace('北岭','')}</span></button>`;}).join('');
export type MapDestination=District|RegionId|'overview';
