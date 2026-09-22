/** Native SVG assets: exact isometric geometry and periodic weather patterns.
 * These are new vector sources, not edits or filters of generated artwork. */
import {writeFileSync,readFileSync,statSync} from 'node:fs';
const dir='public/assets/readiness-2026-09';
const write=(n,v)=>writeFileSync(`${dir}/${n}`,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');
const svg=(w,h,s)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${s}</svg>`;
const fmt=n=>Number(n.toFixed(4));
const point=p=>p.map(fmt).join(',');
const project=([u,v])=>[320+256*(u-v),180+128*(u+v)];
const rotate=([u,v],k)=>k===0?[u,v]:k===1?[-v,u]:k===2?[-u,-v]:[v,-u];
const frames={},geometry={};let sheet='';
for(let k=0;k<4;k++){
 const id=['rail-curve-north','rail-curve-east','rail-curve-south','rail-curve-west'][k];
 const at=t=>rotate([-.5*(1-t)**2,.5*t*t],k);
 const tangent=t=>rotate([1-t,t],k);
 const offset=(t,d)=>{const p=at(t),v=tangent(t),l=Math.hypot(...v);return project([p[0]-v[1]/l*d,p[1]+v[0]/l*d]);};
 let drawing='';
 for(let j=0;j<=12;j++){
  const t=j/12,a=offset(t,-.078),b=offset(t,.078);
  drawing+=`<path d="M${point(a)} L${point(b)}" stroke="#543d2b" stroke-width="11"/><path d="M${point([a[0],a[1]-1.5])} L${point([b[0],b[1]-1.5])}" stroke="#ae8050" stroke-width="7"/>`;
 }
 for(const side of [-1,1]){
  const path=Array.from({length:97},(_,i)=>(i?'L':'M')+point(offset(i/96,side*.045))).join(' ');
  drawing+=`<path d="${path}" fill="none" stroke="#454844" stroke-width="7"/><path d="${path}" fill="none" stroke="#b8beb8" stroke-width="3" transform="translate(-.5,-1)"/>`;
 }
 const x=k%2*640,y=Math.floor(k/2)*360;
 sheet+=`<g transform="translate(${x},${y})">${drawing}</g>`;
 const endpoints=[project(at(0)),project(at(1))];
 const slopes=[0,1].map(t=>{const [u,v]=tangent(t);return fmt(128*(u+v)/(256*(u-v)));});
 if(slopes.some(s=>Math.abs(s)!==.5))throw Error('Invalid rail endpoint');
 geometry[id]={projection:{x:[256,-256],y:[128,128]},endpoints,tangentSlopes:slopes,gaugeWorld:.09,groundDiamond:[[320,52],[576,180],[320,308],[64,180]]};
 frames[id]={x,y,w:640,h:360,pivot:[320,180],origin:[.5,.5]};
}
write('rail-curves-corrected.svg',svg(1280,720,sheet));
const rail={name:'rail-curves-corrected',label:'精确等距弯轨',image:'/assets/readiness-2026-09/rail-curves-corrected.svg',width:1280,height:720,activeFrames:4,frames,geometry,generator:'native SVG geometry',runtimeIntegrated:false,pivotStatus:'exact projected tile center',qa:{edgeWarnings:[],endpointSlopeVerified:true},webpBytes:0};
rail.assetBytes=statSync(`${dir}/rail-curves-corrected.svg`).size;
write('rail-curves-corrected-frames.json',rail);
// Deterministic toroidal copies: objects crossing an edge continue on the opposite edge.
let seed=91827;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const weather=[];
for(const kind of ['rain','snow','fog']){
 let content='';
 if(kind==='fog'){
  content='<defs><filter id="fog" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".0078125" numOctaves="3" seed="42" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 .88  0 0 0 0 .93  0 0 0 0 .95  0.42 0 0 0 0"/></filter></defs><rect width="512" height="512" filter="url(#fog)"/>';
 }else{
  for(let i=0;i<(kind==='rain'?90:70);i++){
   const x=random()*512,y=random()*512,r=.8+random()*2,opacity=.18+random()*.45;
   for(const dx of [-512,0,512])for(const dy of [-512,0,512]){
    const X=fmt(x+dx),Y=fmt(y+dy);
    content+=kind==='rain'?`<path d="M${X},${Y} l-4,15" stroke="#cce5ee" stroke-width="${fmt(r*.55)}" opacity="${fmt(opacity)}" stroke-linecap="round"/>`:`<circle cx="${X}" cy="${Y}" r="${fmt(r)}" fill="#f5faf8" opacity="${fmt(opacity)}"/>`;
   }
  }
 }
 const name=`weather-tile-${kind}`;write(`${name}.svg`,svg(512,512,content));
 const cat={name,label:{rain:'雨 · 无缝平铺',snow:'雪 · 无缝平铺',fog:'雾 · 无缝平铺'}[kind],image:`/assets/readiness-2026-09/${name}.svg`,width:512,height:512,activeFrames:1,frames:{[kind]:{x:0,y:0,w:512,h:512,pivot:[256,256],origin:[.5,.5]}},tileable:true,repeat:[512,512],generator:'native SVG periodic texture',seamMethod:kind==='fog'?'SVG feTurbulence stitchTiles':'toroidal translated copies',runtimeIntegrated:false,pivotStatus:'texture center',qa:{edgeWarnings:[]},webpBytes:0};
 cat.assetBytes=statSync(`${dir}/${name}.svg`).size;
 write(`${name}-frames.json`,cat);weather.push(cat);
}
const manifest=JSON.parse(readFileSync(`${dir}/manifest.json`));
manifest.atlases=manifest.atlases.filter(a=>!a.generator?.startsWith('native SVG'));
manifest.atlases.push(rail,...weather);manifest.activeFrames=manifest.atlases.reduce((n,a)=>n+a.activeFrames,0);
write('manifest.json',manifest);
console.log('Generated 4 exact curve tiles and 3 periodic weather textures.');
