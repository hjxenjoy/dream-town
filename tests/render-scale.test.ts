import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { atlasFrames, generatedSprite, housingLevelFrame } from '../src/sim/atlases.ts';
import { BUILDINGS } from '../src/sim/data.ts';
import { DISASTERS, DISASTER_KINDS } from '../src/sim/disasters.ts';
import { GENERATED_ATLASES } from '../src/sim/atlases.ts';
import { WALL_PIECES } from '../src/sim/walls.ts';

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

test('setting a frame and sizing it are inseparable',()=>{
  // The rule keys on setTexture, not on setDisplaySize. The shipped disaster bug applied
  // no size anywhere near the frame swap — it sized once at creation and swapped frames
  // later — so a rule that watched for setDisplaySize could not see it. Watching the
  // frame swap catches the shape regardless of where the missing size should have been.
  for(const [name,source] of rendererSources()){
    if(name==='atlasSprite.ts')continue;
    // Statement granularity, not line windows: a nearby call for a *different* sprite
    // must not count as sizing this one. That mistake made this rule pass while the
    // disaster layer was drawing every hazard at its neighbour's scale.
    const offset=(index:number)=>source.slice(0,index).split('\n').length;
    for(const match of source.matchAll(/[^;{}\n]*setTexture\([^;]*/g)){
      const statement=match[0];
      assert.ok(match[0].includes('setTexture('),'guard');
      const sizesThisSprite=/drawFrame(Width|Scale)\(/.test(statement);
      const singleFrameTexture=SINGLE_FRAME_TEXTURES.some(texture=>statement.includes(`'${texture}'`));
      assert.ok(
        sizesThisSprite||singleFrameTexture,
        `${name}:${offset(match.index!)} swaps a frame without sizing that sprite from that frame; use drawFrameWidth/drawFrameScale`,
      );
      if(singleFrameTexture&&!sizesThisSprite){
        assert.ok(/setDisplaySize/.test(statement),`${name}:${offset(match.index!)} leaves a single-frame sprite unsized`);
      }
    }
  }
});

/**
 * Every frame name a renderer can display for a given sprite, taken from the atlas it
 * draws. Used to confirm a sprite is sized from the frame actually shown.
 */
test('no renderer sizes a multi-frame atlas from anything but its current frame',()=>{
  for(const [name,source] of rendererSources()){
    if(name==='atlasSprite.ts')continue;
    // A width taken from the atlas as a whole (rather than the frame) is the other half of
    // the same mistake: it ignores that frames within one sheet differ in size.
    const atlasWide=/texture\.source\[0\]\.(width|height)|texture\.getSourceImage\(\)\.(width|height)/.test(source);
    assert.equal(atlasWide,false,`${name} sizes from the atlas rather than the displayed frame`);
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
  // The sheet comes from the overlay, because a hazard may ship its art in another atlas
  // (the bandits are drawn from the duel sheet). Pinning one atlas here would let a hazard
  // render from the wrong sheet without this rule noticing.
  assert.match(layer,/drawFrameWidth\(sprite, overlay\.atlas, overlay\.frame, EFFECT_WIDTH\)/,'every effect frame uses one width, from its own sheet');
  assert.match(layer,/drawFrameWidth\(alert, 'disasters',[\s\S]{0,80}BELL_WIDTH\)/,'and the bell has its own, smaller width');
  // Every hazard must have its frames in the sheet it names, or a kind would render nothing.
  for(const kind of DISASTER_KINDS){
    const definition=DISASTERS[kind];
    const frames=atlasFrames(definition.atlas??'disasters');
    for(const frame of definition.frames) assert.ok(frames[frame],`${kind} frame ${frame} exists in ${definition.atlas??'disasters'}`);
  }
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
  collect('TownScene.ts',/const (CROP_WIDTH|FARM_WIDTH|FARM_PLOT_WIDTH) = (\d+)/g);
  collect('../sim/machines.ts',/const (PART_WIDTH) = (\d+)/g);
  assert.ok(widths.length>=7,`found ${widths.length} render widths`);
  for(const [label,width] of widths){
    assert.ok(width>=24&&width<=260,`${label} draws at ${width}px, within the map's scale`);
  }
});

test('a renderer that creates atlas sprites goes through the shared sizer',()=>{
  // The machine-part bug was this shape: a sprite created from a 444px atlas cell and
  // never scaled at all. There is no frame swap to watch, so the tell is that the file
  // draws atlas art without consulting the sizer that knows the frame's size.
  const atlasTextures=Object.keys(GENERATED_ATLASES);
  for(const [name,source] of rendererSources()){
    if(name==='atlasSprite.ts')continue;
    const createsAtlasSprite=atlasTextures.some(texture=>source.includes(`'${texture}'`))
      &&/add\.image\(/.test(source);
    if(!createsAtlasSprite)continue;
    assert.match(source,/from '\.\/atlasSprite'/,`${name} creates atlas sprites but never consults the sizer`);
  }
});

test('one derivation of scale exists, shared by every caller',()=>{
  // Two places computing "target width / frame width" is how the machine layer and the
  // hazard layer drifted apart in the first place.
  const helper=readFileSync(new URL('atlasSprite.ts',RENDER_DIR),'utf8');
  assert.match(helper,/export function frameScale\(frameWidth: number, targetWidth: number\): number \{\s*return targetWidth \/ frameWidth;/,'the sizer owns the division');
  const machines=readFileSync(new URL('../sim/machines.ts',RENDER_DIR),'utf8');
  assert.match(machines,/frameScale\(frame\.w, targetWidth\)/,'the machine layout uses the shared derivation');
  assert.equal(/targetWidth \/ frame\.w/.test(machines),false,'and does not repeat the division itself');
});

/**
 * A sprite registered against an atlas the scene never loads draws as a black placeholder.
 * That shipped once: the cane field and the sugar mill were mapped to `production-expansion`
 * in the registry while the scene's load list still ended at the defence atlases, so both
 * buildings came up as empty rectangles with a green outline. The registry and the load list
 * are two places that must agree, so this checks they cannot drift apart silently.
 */
test('every atlas the registry points a sprite at is actually loaded by the scene',()=>{
  const scene=readFileSync(new URL('TownScene.ts',RENDER_DIR),'utf8');
  const listed=/const SCENE_ATLASES = \[([^\]]*)\]/.exec(scene)?.[1] ?? '';
  const loaded=new Set(listed.split(',').map(part=>part.trim().replace(/['"]/g,'')).filter(Boolean));
  assert.ok(loaded.size>0,'the scene names its atlases');
  const check=(label:string,atlas:string)=>{
    assert.ok(loaded.has(atlas),`${label} draws from ${atlas}, which the scene never loads`);
  };
  // Every building that resolves through the generated registry.
  for(const kind of Object.keys(BUILDINGS) as (keyof typeof BUILDINGS)[]){
    const sprite=generatedSprite(kind as never);
    if(sprite) check(`building ${kind}`,sprite.atlas);
    const housing=housingLevelFrame(kind as never,1);
    if(housing) check(`housing ${kind}`,housing.atlas);
  }
  // Every hazard, which may name a sheet of its own.
  for(const kind of DISASTER_KINDS) check(`hazard ${kind}`,DISASTERS[kind].atlas??'disasters');
  // And every wall tile, straight from the tiling table.
  for(const piece of Object.values(WALL_PIECES)) check(`wall tile ${piece.frame}`,piece.atlas);
});
