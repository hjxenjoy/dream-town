import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';

/** Every file under a directory, as paths relative to that directory. */
function walk(dir, prefix = '') {
  return readdirSync(join(dir, prefix)).flatMap((name) => {
    const relative = prefix ? join(prefix, name) : name;
    return statSync(join(dir, relative)).isDirectory() ? walk(dir, relative) : [relative];
  });
}

const worker = readFileSync('dist/sw.js', 'utf8');
const entries = [...worker.matchAll(/url:"([^"]+)",revision:("[^"]*"|null)/g)].map(match => ({url: match[1], revision: match[2]}));
const urls = new Set();
for (const entry of entries) {
  assert(!urls.has(entry.url), `离线清单重复：${entry.url}`);
  urls.add(entry.url);
  assert(existsSync(resolve('dist', entry.url)), `离线文件缺失：${entry.url}`);
}
for (const required of ['index.html','assets/valley-scenery.png','assets/buildings.png','assets/industry.png','assets/citizens.png','assets/decorations.png','assets/town-expansion.png','assets/herd-growth.webp','assets/herd-growth-frames.json','assets/living-farm.webp', 'assets/living-farm-frames.json', 'assets/homestead.webp','assets/homestead-frames.json','assets/crops.png','assets/frames.json','favicon.svg','manifest.webmanifest']) {
  assert(urls.has(required), `游戏必需文件未缓存：${required}`);
}
const atlasCatalog = JSON.parse(readFileSync('dist/assets/expansion-assets.json', 'utf8'));
assert(atlasCatalog.atlases.length > 0, '扩展素材目录为空');
assert(urls.has('asset-preview.html') && urls.has('assets/expansion-assets.json'), '素材册与帧目录必须可离线查看');
for (const atlas of atlasCatalog.atlases) {
  for (const file of [atlas.image.slice(1), `assets/${atlas.name}-frames.json`, `assets/${atlas.name}-prompts.json`]) assert(urls.has(file), `扩展素材未缓存：${file}`);
  assert.equal(Object.keys(atlas.frames).length, atlas.activeFrames);
  for (const frame of Object.values(atlas.frames)) assert(frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0 && frame.x + frame.w <= atlas.width && frame.y + frame.h <= atlas.height, `图集帧越界：${atlas.name}`);
}
// Every optional pack is registered and validated, but only cached after first use.
const registry = readFileSync('src/sim/expansion-atlases.ts', 'utf8');
const packNames = ['expansion-2026-09', 'accessories-2026-09', 'readiness-2026-09'];
const tracks = [];
let coverage;
for (const pack of packNames) {
  const manifest = JSON.parse(readFileSync(`dist/assets/${pack}/manifest.json`, 'utf8'));
  const catalogFiles = walk(`dist/assets/${pack}`).filter(f=>f.endsWith('-frames.json'));
  assert.equal(manifest.atlases.length, catalogFiles.length, `图集目录与文件数不符：${pack}`);
  assert.equal(manifest.activeFrames, manifest.atlases.reduce((sum,a)=>sum+Object.keys(a.frames).length,0));
  for (const atlas of manifest.atlases) {
    assert(registry.includes(`/${pack}/${atlas.name}-frames.json`), `图集未注册：${atlas.name}`);
    const catalog = JSON.parse(readFileSync(`dist/assets/${pack}/${atlas.name}-frames.json`, 'utf8'));
    assert.deepEqual(atlas, catalog, `目录与独立帧表不同步：${atlas.name}`);
    assert(existsSync(resolve('dist', atlas.image.slice(1))));
    assert.equal(atlas.qa.edgeWarnings.length, 0, `切片截断：${atlas.name}`);
    assert.equal(Object.keys(atlas.frames).length, atlas.activeFrames);
    for (const f of Object.values(atlas.frames)) {
      assert(f.x>=0 && f.y>=0 && f.w>0 && f.h>0 && f.x+f.w<=atlas.width && f.y+f.h<=atlas.height);
      assert(f.pivot?.length===2 && f.pivot[0]>=0 && f.pivot[0]<=f.w && f.pivot[1]>=0 && f.pivot[1]<=f.h);
    }
    for (const seq of Object.values(atlas.sequences??{})) {
      assert(seq.frames.length>=2 && seq.frameRate>0);
      for (const id of seq.frames) assert(atlas.frames[id], `动作帧缺失：${id}`);
    }
    for (const g of Object.values(atlas.geometry??{})) {
      assert.deepEqual(g.projection, {x:[256,-256],y:[128,128]});
      assert(g.tangentSlopes.every(s=>Math.abs(s)===.5));
    }
  }
  for (const file of walk(`dist/assets/${pack}`)) assert(!urls.has(`assets/${pack}/${file}`), `可选素材不应预缓存：${file}`);
  const audioPath=`dist/assets/${pack}/audio/manifest.json`;
  if (existsSync(audioPath)) {
    const audio=JSON.parse(readFileSync(audioPath,'utf8'));
    tracks.push(...audio.tracks);
    if(audio.buildingCoverage)coverage=audio.buildingCoverage;
    assert.equal(audio.tracks.length,walk(`dist/assets/${pack}/audio`).filter(f=>f.endsWith('.wav')).length);
  }
}
assert(worker.includes('optional-town-assets-v1'), '可选素材按需缓存策略缺失');
const kindDeclaration = readFileSync('src/sim/data.ts', 'utf8').match(/export type BuildingKind = ([^;]+);/)[1];
const buildingKinds = [...kindDeclaration.matchAll(/'([^']+)'/g)].map(m=>m[1]);
assert.deepEqual(Object.keys(coverage).sort(),buildingKinds.sort(),'建筑环境音映射不完整');
const trackByUrl=new Map(tracks.map(t=>[t.url,t]));
for(const entry of Object.values(coverage))assert(trackByUrl.has(entry.url));
for(const track of tracks){
 const wav=readFileSync(resolve('dist',track.url.slice(1)));
 assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
 assert.equal(wav.readUInt32LE(24),22050);assert.equal(wav.readUInt32LE(40),22050*8*2);
 assert.equal(wav.readInt16LE(44),wav.readInt16LE(wav.length-2));
 for(let p=44;p<wav.length;p+=2)assert(Math.abs(wav.readInt16LE(p))<32767,`音频削波：${track.name}`);
}
// Assets deliberately kept out of the offline payload must be genuinely unloadable, so a
// typo here can never silently strip something the game needs to start.
// The two-state crop art was replaced by the four-stage sheets: a field now draws
// crop-stages-1/2/3, so this atlas is kept on disk for comparison but nothing loads it.
const IGNORED = ['assets/world.png', 'assets/crops-growing.webp', 'assets/crops-growing-frames.json'];
const shipped = [...walk('dist')];
for (const ignored of IGNORED) {
  assert(existsSync(resolve('dist', ignored)), `被排除的素材在构建产物中不存在：${ignored}`);
  assert(!urls.has(ignored), `被排除的素材仍进了离线清单：${ignored}`);
  // Only code counts as a reference. Atlas catalogs are inlined into the bundle, so a
  // registry-loaded sprite still shows up in the JS; a descriptive `path` field in
  // frames.json does not mean anything loads the file.
  const referenced = shipped.filter(file => /\.(js|css|html)$/.test(file))
    .some(file => readFileSync(resolve('dist', file), 'utf8').includes(ignored.split('/').pop()));
  assert(!referenced, `被排除的素材仍在代码中被引用，不能排除：${ignored}`);
}

const html = readFileSync('dist/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)) {
  assert(urls.has(match[1]), `启动资源未缓存：${match[1]}`);
}
const cachedBytes = entries.reduce((total, entry) => total + statSync(resolve('dist', entry.url)).size, 0);
console.log(`离线构建检查通过：${entries.length} 个资源（${(cachedBytes / 1024 / 1024).toFixed(2)} MB），清单无冲突、包含全部启动资源，${IGNORED.length} 项已排除且确认无人引用。`);
