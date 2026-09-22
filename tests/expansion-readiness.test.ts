import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_ATLASES, atlasFrames } from '../src/sim/atlases.ts';
import { EXPANSION_SPRITES } from '../src/sim/expansion-sprites.ts';

test('expansion art IDs resolve, with corrected curves taking precedence',()=>{
 for(const sprite of Object.values(EXPANSION_SPRITES))assert(atlasFrames(sprite.atlas)[sprite.frame]);
 for(const direction of ['north','east','south','west'] as const)
  assert.equal(EXPANSION_SPRITES[`rail-curve-${direction}`].atlas,'rail-curves-corrected');
});

test('all eleven crops have ordered four-stage art and all eight animals have walk cycles',()=>{
 const crops=['wheat','carrot','corn','tomato','strawberry','pumpkin','sunflower','grape','apple','sugarcane','hops'];
 const animals=['elephant','giraffe','zebra','lion','lamb','sheep','calf','cow'];
 const sequences=Object.values(GENERATED_ATLASES).flatMap(a=>'sequences' in a?Object.entries(a.sequences):[]);
 for(const [names,suffix] of [[crops,'growth'],[animals,'walk']] as const){
  for(const name of names){
   const seq=sequences.find(([id])=>id===`${name}-${suffix}`)?.[1];
   assert(seq,`${name} sequence missing`);assert.equal(seq.frames.length,4);assert.equal(new Set(seq.frames).size,4);
  }
 }
 assert.equal(GENERATED_ATLASES['plague-animation'].sequences['plague-pulse'].frames.length,2);
});

test('curves share the 2:1 world projection and diagonal endpoint tangents',()=>{
 for(const geometry of Object.values(GENERATED_ATLASES['rail-curves-corrected'].geometry)){
  const {x,y}=geometry.projection;
  assert.equal(x[0]/y[0],2);assert.equal(x[1]/y[1],-2);
  assert(geometry.tangentSlopes.every(s=>Math.abs(s)===.5));
  for(const [px,py] of geometry.endpoints){
   const u=((px-320)/256+(py-180)/128)/2;
   const v=((py-180)/128-(px-320)/256)/2;
   assert(Math.abs(u)+Math.abs(v)===.5,'endpoint is at a tile edge midpoint');
  }
 }
});
