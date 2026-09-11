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
for (const required of ['index.html','assets/valley-scenery.png','assets/buildings.png','assets/industry.png','assets/citizens.png','assets/decorations.png','assets/town-expansion.png','assets/crops.png','assets/frames.json','favicon.svg','manifest.webmanifest']) {
  assert(urls.has(required), `游戏必需文件未缓存：${required}`);
}
const atlasCatalog = JSON.parse(readFileSync('dist/assets/expansion-assets.json', 'utf8'));
assert.equal(atlasCatalog.atlases.length, 10, '扩展图集数量不完整');
assert(urls.has('asset-preview.html') && urls.has('assets/expansion-assets.json'), '素材册与帧目录必须可离线查看');
for (const atlas of atlasCatalog.atlases) {
  for (const file of [atlas.image.slice(1), `assets/${atlas.name}-frames.json`, `assets/${atlas.name}-prompts.json`]) assert(urls.has(file), `扩展素材未缓存：${file}`);
  assert.equal(Object.keys(atlas.frames).length, atlas.activeFrames);
  for (const frame of Object.values(atlas.frames)) assert(frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0 && frame.x + frame.w <= atlas.width && frame.y + frame.h <= atlas.height, `图集帧越界：${atlas.name}`);
}
// Assets deliberately kept out of the offline payload must be genuinely unloadable, so a
// typo here can never silently strip something the game needs to start.
const IGNORED = ['assets/world.png'];
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
