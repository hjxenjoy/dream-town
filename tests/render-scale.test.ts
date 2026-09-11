import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { atlasFrames } from '../src/sim/atlases.ts';
import { BUILDINGS } from '../src/sim/data.ts';

const RENDER_DIR = new URL('../src/render/', import.meta.url);

function rendererSources(): [string, string][] {
  return readdirSync(RENDER_DIR)
    .filter((name: string) => name.endsWith('.ts'))
    .map((name: string) => [name, readFileSync(new URL(name, RENDER_DIR), 'utf8')] as [string, string]);
}

/**
 * Sizing an atlas sprite is only correct if it is derived from the frame currently
 * displayed. Doing it once at creation and then swapping frames leaves whatever scale
 * the first frame produced, which shipped twice: hazard effects of identical intent drew
 * at 112–164px, and a machine part drew at its raw 444px atlas size.
 */
/**
 * Textures created by the game at runtime, each with exactly one frame. A one-off
 * setDisplaySize is safe for these because there is no other frame to swap in whose
 * dimensions could disagree with the size that was applied.
 */
const SINGLE_FRAME_TEXTURES = ['farm0', 'farm1', 'farm2'];

test('atlas sprites are never sized by hand',()=>{
  // The shipped bug twice over: size applied once at creation, frames swapped later, so
  // the sprite kept the first frame's scale. Multi-frame atlases must go through the helper.
  for(const [name,source] of rendererSources()){
    if(name==='atlasSprite.ts')continue;
    for(const line of source.split('\n')){
      if(!line.includes('setDisplaySize'))continue;
      const runtimeOnly=SINGLE_FRAME_TEXTURES.some(texture=>line.includes(`'${texture}'`));
      assert.ok(
        runtimeOnly,
        `${name}: ${line.trim()} sizes a multi-frame atlas by hand; use drawFrameWidth/drawFrameScale`,
      );
    }
  }
});

test('every renderer that swaps atlas frames goes through the shared sizer',()=>{
  const swapping=rendererSources().filter(([,source])=>/setTexture\(/.test(source));
  assert.ok(swapping.length>0,'some renderer swaps frames');
  for(const [name,source] of swapping){
    assert.match(source,/drawFrame(Width|Scale)\(/, `${name} sizes the frame it sets`);
  }
  // The helper itself is the only place that derives a scale from a frame width.
  const helper=readFileSync(new URL('atlasSprite.ts',RENDER_DIR),'utf8');
  assert.match(helper,/targetWidth \/ image\.frame\.width/,'the helper scales from the displayed frame');
  assert.match(helper,/image\.setTexture\(texture, frame\)/,'and sets the frame and size together');
});

test('hazard effects share one footprint across every kind and frame',()=>{
  // The effect width must be a single constant, not per-frame arithmetic, or the kinds
  // drift apart as the atlas evolves.
  const layer=readFileSync(new URL('DisasterLayer.ts',RENDER_DIR),'utf8');
  assert.match(layer,/const EFFECT_WIDTH = \d+/,'there is one effect width');
  assert.match(layer,/drawFrameWidth\(sprite, 'disasters', overlay\.frame, EFFECT_WIDTH\)/,'every effect frame uses it');
  assert.match(layer,/drawFrameWidth\(alert, 'disasters',[\s\S]{0,80}BELL_WIDTH\)/,'and the bell has its own, smaller width');
  // Every hazard must have its frames, or a kind would render nothing at all.
  for(const frame of ['fire-0','flood-0','drought-0','hail-0','insects-0','scaffold-0','bell-0']){
    assert.ok(atlasFrames('disasters')[frame],`${frame} exists so its width is meaningful`);
  }
  // And the shared width must be comparable to a building, not a multiple of it.
  const width=Number(/const EFFECT_WIDTH = (\d+)/.exec(layer)![1]);
  const widest=Math.max(...Object.values(atlasFrames('disasters')).map(frame=>frame.w));
  assert.ok(width<260,`effects draw at ${width}px, in the same range as buildings`);
  assert.ok(width<widest,`the effect is scaled down from its ${widest}px atlas cell`);
});

test('residents keep one apparent size across walking and working poses',()=>{
  // Walking cells are 256px with margins; action frames are cropped tight to the figure.
  // Sizing both by frame width made a hauling resident about twice the height of the
  // same resident strolling, so the action atlas is scaled to match the figure instead.
  const source=readFileSync(new URL('Residents.ts',RENDER_DIR),'utf8');
  assert.match(source,/const ACTION_SCALE=([\d.]+)/,'the action atlas uses one scale');
  const scale=Number(/const ACTION_SCALE=([\d.]+)/.exec(source)![1]);
  assert.ok(scale>0&&scale<1,`ACTION_SCALE ${scale} is a reduction`);

  const actionHeights=Object.values(atlasFrames('citizens-actions')).map(frame=>frame.h);
  const median=actionHeights.slice().sort((a,b)=>a-b)[Math.floor(actionHeights.length/2)]!;
  // Action frames are cropped to the figure, which fills roughly 90% of the frame.
  const characterHeight=median*scale*0.897;
  // Walking sprites are drawn 42–46px tall on a 256px cell that the figure nearly fills.
  assert.ok(characterHeight>=38&&characterHeight<=50,`a working resident is ${characterHeight.toFixed(1)}px tall, matching a 42–46px walker`);
});

test('pets and season props are sized to the frame, not to the atlas',()=>{
  const residents=readFileSync(new URL('Residents.ts',RENDER_DIR),'utf8');
  const pets=atlasFrames('pets');
  const petWidth=Number(/const PET_SIZE=(\d+)/.exec(residents)![1]);
  for(const kind of ['cat-front-0','dog-front-0']){
    const frame=pets[kind]!;
    // A pet must be smaller than a resident, whatever its atlas cell size.
    assert.ok(petWidth<frame.w||frame.w<64,`${kind}: pet drawn ${petWidth}px from a ${frame.w}px frame`);
  }
  assert.ok(petWidth>=24&&petWidth<=48,`pets stay small (${petWidth}px)`);

  const props=readFileSync(new URL('SeasonalProps.ts',RENDER_DIR),'utf8');
  assert.match(props,/const PROP_WIDTH = \d+/,'season props have one width');
  assert.match(props,/drawFrameWidth\(this\.sprite, 'season-props', asset\.prop, PROP_WIDTH\)/,'applied to whichever prop is showing');
});

test('sprite sizing stays inside a plausible range for the map scale',()=>{
  // Tiles are 116px wide and buildings render 100–177px, so any atlas sprite outside a
  // few multiples of that is a sizing mistake rather than a design choice.
  const widths: [string, number][] = [];
  const collect=(file:string,pattern:RegExp)=>{
    const source=readFileSync(new URL(file,RENDER_DIR),'utf8');
    for(const match of source.matchAll(pattern))widths.push([`${file}:${match[1]}`,Number(match[2])]);
  };
  collect('DisasterLayer.ts',/const (EFFECT_WIDTH|BELL_WIDTH) = (\d+)/g);
  collect('CaravanCart.ts',/const (CART_WIDTH) = (\d+)/g);
  collect('SeasonalProps.ts',/const (PROP_WIDTH) = (\d+)/g);
  collect('Residents.ts',/const (PET_SIZE)=\s*(\d+)/g);
  collect('TownScene.ts',/const (CROP_WIDTH|FARM_WIDTH) = (\d+)/g);
  collect('../sim/machines.ts',/const (PART_WIDTH) = (\d+)/g);
  assert.ok(widths.length>=7,`found ${widths.length} render widths`);
  for(const [label,width] of widths){
    assert.ok(width>=24&&width<=260,`${label} draws at ${width}px, within the map's scale`);
  }
});
