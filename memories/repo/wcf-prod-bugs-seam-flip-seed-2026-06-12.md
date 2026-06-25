# WCF 生产功能 bug 修复:接缝翻转 + 地图路由 + 种子 (2026-06-12)

用户在生产 APK 实测报三个 bug,均已修(需新 APK 生效)。

## Bug 3:AI 生成后「发布失败 Plot not found」
- 根因:`src/services/creationApi.ts` 的迁移接缝 `USE_UNIFIED_CREATION_BACKEND=false` 不一致:
  内容型创作(无 geo)在 legacy 无单步入口 → `createCreation` punt 到 `unified('')`
  (`POST /v1/creations`,返回统一 Creation id),但 `publishCreation` 仍走 legacy
  `worldCreationApi.publishPlot(id)` → 拿统一 id 查 v6 plot → "Plot not found"。
- 修复:**`USE_UNIFIED_CREATION_BACKEND = true`**。统一后端已部署生产(本会话早前 main 部署),
  `CreationController` create(支持 inline prompt 触发 generate)/ publish / discover / enter
  全就绪。翻转后 create/publish 同走 `/v1/creations/*`,id 一致。
- 验证统一 create:`CreationAuthoringService.createCreation` 持久化 Creation 实体 + 有 prompt
  时立即 generate,返回同一 id;publish 用同一 id。

## Bug 1:点世界地图进入后报「Viewport requires finite numeric minX...」无法继续
- 根因:截图是**旧 `WorldMapScreen`**(v6 共享地图 + WorldMapRenderer 降级模式),后端
  `world-creation/map.service.ts` 对非有限 viewport 抛错。入口来自:
  `MyWorldScreen` 现实关联链接 + `CreationFeedScreen` 空态「探索地图」按钮 → 都 navigate('WorldMap')。
  (用户路径:空 feed → 探索地图 → 旧地图报错,Bug1/2 相连。)
- 修复:两处入口改 navigate('UnifiedWorldMap')(我的新列表地图,有优雅空态,无 viewport 依赖)。
  `world-hub-map` 本就指向 UnifiedWorldMap。旧 WorldMap 仅深链 world/map 可达(E2E 77 仍过)。

## Bug 2:刷创作流是空的,需要种子创作
- 根因:冷启动种子机制(`DefaultCreationSeedSource`)从 **同一张 creations 表**拉"全局可发现
  创作"填充——表为空就无可填。需真实插入已发布创作。
- 修复:**生产库直插 6 个已发布种子创作**(SSH psql,db=`paymind`,creations 表对
  owner_account_id **无 FK 约束**;owner 用现有账户 财神 `36bba41e-...`):
  深夜手冲咖啡馆(shop)/ 塔防小镇保卫战(game)/ 樱花公园中央广场(place)/ 午夜电台直播
  (livestream)/ 开放麦脱口秀(stage)/ 旧书与黑胶小店(shop)。均 published + geo(上海簇)+
  offerings + metrics(供 hot 排序)+ 空 preview(CreationCard 有渐变占位,可刷)。幂等:
  ≥6 published 则跳过。
- 注:种子只在 **seam=true 的新 APK** 可见(旧 APK seam=false 读 legacy plots)。

## 交付
- commit `0a05d3890`(creationApi 接缝 + MyWorld/Feed 地图路由),push origin + 镜像 Claw `0f11439`
  → 新 APK 构建触发。种子已在生产库。
- **三个 bug 都需安装新 APK(0f11439 产物)才生效**。
- 待验证:新 APK 装机后 ① 发布成功(统一)② 地图进入显示创作列表(6 种子)③ 创作流可刷(6 种子)。
- E2E 风险:seam=true 后 80/81/82 走 unified,但断言的是容器/导航非后端结果,应仍绿;
  build 0f11439 的 Maestro 会复验。


## ✅ 收尾:seam=true 下整套 E2E 全绿 + flake 加固(run 27390139055 = success)

- 接缝翻转(seam=true)后:`0f11439` 验证 WCF 80/81/82 通过(统一后端创作流 OK)。
- 随后 10/64/81 间歇 flake(重型 x86_64 模拟器渲染慢,同 flow 上轮全过)——非真实 bug。
  加固:extendedWaitUntil 超时 12-15s→25s、scroll 10s→20s、加 waitForAnimationToEnd settle;
  10 精简为单一可靠 world-hub-scroll 断言(其余 tab 由 11/22/21/28/64 覆盖)。
- commit `eda150dc5`,镜像 Claw `8f47e708` → run **27390139055 = completed/success(4 分片全绿)**。
- **交付**:含三 bug 修复 + seam=true 的 arm64 release APK 已由该 run 的 Build APK job 产出
  (装机后:发布成功、地图显示 6 种子、创作流可刷)。生产库 6 个种子已在。
- **经验补充**:重型 RN app 在 GH x86_64 模拟器上,deep-link 后首屏渲染可能 >15s;
  WCF/重屏 flow 的 extendedWaitUntil 统一给 25s + settle,避免 flake。


## 第二批生产 UX bug + 体验宿主真相 (2026-06-12, commit bca6b5741)

用户实测续报:
1. **经纬度输入不合理** → CreationCreatorScreen「放到世界地图」改为 `expo-location` 取当前位置
   (📍用当前位置按钮 + locating/ok/failed 态 + 失败可仅发创作流),删除 lat/lng 原始输入。
2. **无作品管理入口** → 发布成功卡加「查看/管理我的作品」→ MyWorld;MyWorldScreen 每条
   published/listed 创作加「下架」按钮(新增 `creationApi.unpublishCreation` → POST /:id/unpublish)。
3. **开始玩 → Plot not found** → 根因:`CreationFeedScreen.onEnter` 导向**旧 PlotExperience**
   (占位,走 legacy enterPlot 查 v6 plot)。改为 `navigate('CreationExperience',{creationId,type,title})`
   (新统一宿主,走 unified enter)。CreationDetail 早已接对。
4. **(真相,未"修",需产品决策)无真实游戏运行时**:`CreationExperienceScreen` 的 game 分支
   是占位文案「游戏运行时在此渲染」——**没有任何可玩引擎**。generate 只产出 ECS 数据 spec
   (entities/components),宿主能渲染 shop 商品 + 实体列表,但**任意 AI 生成可玩游戏(俄罗斯方块/
   塔防)不存在**。6 个种子是无 ECS 内容的 DB 行,**都不可玩**;无 preview 图(生成不产图)。

**Issue 4 给用户的诚实选项(待定方向)**:
- A) **WebView HTML5 游戏**:让 LLM 生成自包含 canvas/JS 游戏代码存为 creation 内容,宿主用
  WebView 渲染 → "game" 真正可玩,LLM 很擅长写俄罗斯方块/塔防,ROI 最高。需后端(生成+存)+
  前端(WebView host)。
- B) 模板小游戏库(固定可玩模板 AI 参数化主题/难度),可玩但种类有限。
- C) 缩范围:先把 shop/place/livestream/stage 做到真能用,game 标"模板版/即将开放"。
- 另:preview 图生成(LLM 出封面)是并行改进,让 feed 卡不空。
