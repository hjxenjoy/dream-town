# 第三轮素材交付

交付 14 张图集／纹理、84 帧。生成跨至 2026-09-22，保留任务开始日期的目录名。

|内容|数量|调用位置|
|---|---:|---|
|水果／橄榄／渔人岛|3|islands-completion|
|瘟疫同款双帧|2|plague-animation / plague-pulse|
|右向火车、飞机、货船、渔船|4|vehicles-return|
|九种旧作物 × 四阶段|36|crop-stages-1、2、3|
|动物园四种及羊羔、绵羊、牛犊、奶牛 × 四帧|32|animal-walk-1～4|
|四方向精确投影弯轨|4|rail-curves-corrected|
|雨、雪、雾平铺纹理|3|weather-tile-rain、snow、fog|

## 文件与重建

- 最终交付：`public/assets/readiness-2026-09/`，每张有独立帧表，manifest 汇总全部。
- 生成原图：本目录 `raw/`；最终提示词：`prompts.json`。位图全部使用内置 image_gen，未调用付费 CLI。无损 WebP 保留可见像素和 Alpha。
- 铁路及天气是新建的原生 SVG，不是对生成图片做几何变形或背景处理。源码：`scripts/generate-geometric-assets.mjs`。
- 重建顺序：`.venv/bin/python scripts/catalog-readiness-assets.py`，再 `node scripts/generate-geometric-assets.mjs`。
- 预览：`/asset-preview.html`，选择“本轮补齐”，可切片及播放动作，天气卡片另附重复平铺区。

## 注册及使用

前两轮 14 张和本轮 14 张全部登记到 `src/sim/expansion-atlases.ts`，由 `GENERATED_ATLASES` 合并。`src/sim/expansion-sprites.ts` 给出可查询的素材 ID；弯轨同名 ID 优先指向新版。旧图保留供比对。

这是素材注册，不代表 Phaser 场景已加载或规则已实现。TownScene 仍按实际使用的图集加载。新建筑尚不存在于 BuildingKind，不能把素材 ID 强行冒充建筑定义；CATALOG_BY_KIND / FRAME_BY_KIND 需在补齐建筑定义时连接。瘟疫已提供双帧，但 DISASTERS 尚未添加瘟疫规则。动物步态、新作物四阶段尚未替换现有游戏渲染。

补充包和音频移出启动预缓存，首次成功请求后按 CacheFirst 保存，最多 256 项／90 天；未在线获取过的可选素材不保证离线可用。基础游戏离线资源不变。

## 几何、锚点与验收边界

- 铁路使用世界坐标统一投影 x=256(u-v)、y=128(u+v)，四个端点切线斜率为 ±0.5，端点位于地块边中点。帧表提供 projection、endpoints、gaugeWorld、groundDiamond。**2:1 指地面投影，不是要求每种转向的可见包围盒都是 2:1。** 连接旧手绘直轨时仍需按端点和轨距设置缩放，不能直接用可见包围盒宽度作为地块尺寸。
- 雨雪用周期边界复制；雾用 SVG stitchTiles。均 512×512，可作为重复图像纹理使用。浏览器已查看重复铺设，无明显边界线。
- 序列保留原始单元大小；预览使用统一缩放。动物采用固定水平中心和脚底高度，瘟疫采用中心，作物保存土块底端参考。生成动作是四帧简短步态，不是骨骼动画；视角、体形与旧静态素材存在细微差异。
- 铁路锚点为精确地块中心，天气为纹理中心。**前两轮建筑以及本轮场景素材的实际地图占地、遮挡和落点仍待玩法集成时校准**，未把 suggested 改写成已验收。
- 所有 10 张生成位图：真实透明通道、可见像素无损、切片边界无截断。返程车辆最终尺寸较小，适合地图显示，不适合大幅放大。
- 构建／离线检查通过；既有 363 项测试通过，新增 3 项素材契约测试通过。保留已有 Phaser 包体积警告。

清单第二部分的天气状态机、瘟疫传播、强盗、运输、矿业、动物园、环境音播放及 AI 代理等模拟规则不属于此次素材生成，尚未实现。
