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
const html = readFileSync('dist/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)) {
  assert(urls.has(match[1]), `启动资源未缓存：${match[1]}`);
}
console.log(`离线构建检查通过：${entries.length} 个资源，清单无冲突且包含全部启动资源。`);
