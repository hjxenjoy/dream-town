import { DISTRICTS, DISTRICT_KEYS, BRIDGES, riverX, terrainAt, type District } from '../sim/terrain';
import type { Building } from '../sim/world';
import { icon } from './icons';

const project=(x:number,y:number)=>({x:160+(x-y)*3.05,y:12+(x+y)*1.54});
export function valleyMap(buildings:Building[],focus?:{x:number;y:number}) {
  const river=Array.from({length:49},(_,y)=>{const p=project(riverX(y),y);return `${p.x},${p.y}`;}).join(' ');
  const terrain:string[]=[];
  for(let x=1;x<47;x++)for(let y=1;y<47;y++)if(terrainAt(x,y)==='mountain'){const p=project(x,y);terrain.push(`M${p.x},${p.y-2}l3,2-3,2-3,-2Z`);}
  return `<svg class="valley-map" viewBox="0 0 320 176" role="img" aria-label="青岚河两岸地图：居民与农业在西岸，山麓矿区与工业在东岸"><path d="M160 10 306 85 160 160 14 85Z" fill="#c8d29e" stroke="#a2b583" stroke-width="2"/><path d="M160 10 306 85 233 122 87 48Z" fill="#c3c9a6" opacity=".5"/><path d="${terrain.join('')}" fill="#8e9e92"/><polyline points="${river}" fill="none" stroke="#f3e6b7" stroke-width="13"/><polyline points="${river}" fill="none" stroke="#77afae" stroke-width="9"/>${BRIDGES.map(y=>{const a=project(riverX(y)-2.4,y),b=project(riverX(y)+2.4,y);return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#917a50" stroke-width="4"/>`;}).join('')}${buildings.map(b=>{const p=project(b.x,b.y);return `<circle cx="${p.x}" cy="${p.y}" r="${b.kind==='farm'?1.2:1.9}" fill="${b.kind==='farm'?'#bf9949':'#906142'}" stroke="#fff2cc" stroke-width=".5"/>`;}).join('')}${DISTRICT_KEYS.map(id=>{const d=DISTRICTS[id],p=project(d.x,d.y);return `<text x="${p.x}" y="${p.y-9}" text-anchor="middle" fill="#526a4b" font-size="8" font-family="serif">${d.name}</text>`;}).join('')}${focus?(()=>{const p=project(focus.x,focus.y);return `<rect x="${p.x-12}" y="${p.y-7}" width="24" height="14" rx="3" fill="#fff9db33" stroke="#fff9db" stroke-width="1.4"/>`;})():''}</svg>`;
}
export const districtButtons=()=>DISTRICT_KEYS.map(id=>{const d=DISTRICTS[id];return `<button data-action="district" data-value="${id}" aria-label="前往${d.name}" title="${d.subtitle}">${icon(d.icon,17)}<span>${d.name.replace('河西','').replace('南岸','').replace('河东','').replace('北岭','')}</span></button>`;}).join('');
export type MapDestination=District|'overview';
