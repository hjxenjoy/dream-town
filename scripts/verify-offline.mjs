import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

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
const html = readFileSync('dist/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)) {
  assert(urls.has(match[1]), `启动资源未缓存：${match[1]}`);
}
console.log(`离线构建检查通过：${entries.length} 个资源，清单无冲突且包含全部启动资源。`);
