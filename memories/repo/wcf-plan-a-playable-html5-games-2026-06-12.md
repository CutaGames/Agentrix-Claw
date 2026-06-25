# 方案 A:可玩 HTML5 游戏(LLM 生成 + 模板兜底 + WebView 沙箱)— 2026-06-12

用户确认按"✅支持良好"范围开工(2D 休闲/益智/棋牌/简单塔防等单机 canvas 游戏)。
commit `a49756783`(build/world-creation-ui-v6-2026-06-10)。

## 架构
- **生成**:`game` 创作 → LLM(`BedrockIntegrationService.invokeModel`)生成自包含单文件 HTML5
  (canvas/JS,触屏优先,无外联/素材);服务端防御性校验(无 iframe/cookie/外部 fetch/import,
  大小 200..220KB,需 html+canvas/script);**校验不过 → 内置模板兜底**(保证可玩)。
- **存储**:新表 `creation_game_bundles`(creationId/version/title/engine/source/html/prompt),
  迁移 `1808000000000`。最新 version = 当前可玩版本。
- **懒生成**:`GET /v1/creations/:id/game` 无包且 type=game → 现场生成(覆盖 6 个种子 + 旧创作首玩)。
- **渲染**:移动端 `CreationExperienceScreen` game 分支 → `GameRunner` → `react-native-webview`
  WebView srcdoc 渲染;沙箱:`onShouldStartLoadWithRequest` 只放行 about/data,阻止外部导航;
  WebView 自有上下文(无 app token/cookie)。
- **内置模板**(`game/game-templates.ts`,手写验证可玩):2048 / 贪吃蛇 / 打砖块;
  `pickTemplateByPrompt` 关键词匹配,无命中默认 2048。

## 文件
- 后端:`creation/entities/creation-game-bundle.entity.ts`、`migrations/1808...`、
  `creation/game/{game-templates,creation-game.service,creation-game.controller,
  creation-game.service.spec}.ts`、`creation.module.ts`(注册实体/服务/控制器 + 导入
  BedrockIntegrationModule;LLM 注入 @Optional → 单测/降级走模板)。
- 前端:`package.json`(+`react-native-webview ^13.15.0`,lock 已同步)、`services/creationApi.ts`
  (`getCreationGame`)、`screens/world/CreationExperienceScreen.tsx`(GameRunner/WebView)。
- 端点:`GET /v1/creations/:id/game`(任意登录用户可玩,懒生成)、`POST /:id/generate-game`(owner 重生成)。

## 验证 / 部署
- 后端单测:`creation-game.service.spec` 10/10;`npx jest src/modules/creation` 18 套件/217 全绿。
- 诊断:后端 + 前端改动文件全 clean。
- **后端已部署生产**(走 build 分支,未动 main):prod reset 到 `a49756783` → npm run build →
  migration:run(1808 表 `creation_game_bundles` 已建)→ pm2 restart;`GET /api/v1/creations/:id/game`
  返回 401(已注册);PM2 稳定。生产全局前缀是 `api` → 全路径 `/api/v1/creations/:id/game`。
  注:SSH 命令常被客户端 ^C 中断但**服务端进程会跑完**(迁移即如此先跑掉了);用 base64 传脚本最稳。
- **前端在新 APK 构建中**(Claw,head a49756783)。装机后:刷到 game → 开始玩 → WebView 真能玩
  (LLM 成功用其产物,否则模板兜底)。

## 能力边界(已与用户对齐)
- ✅ 2D 休闲/益智/棋牌/简单塔防/放置/文字类(单机、canvas、触屏)。
- ❌ 3A/3D 大作、联网对战、重素材/重计算、需服务端防作弊结算、设备原生能力(相机AR/蓝牙)。
- 待办候选:更多模板(塔防/俄罗斯方块手写模板)、preview 封面图生成、入场费/打赏经济挂载、
  发布前服务端 headless 试跑校验、**桌面端复杂游戏(见下条评估)**。

## 待评估(用户要求):桌面端支持复杂游戏可行性
桌面 Tauri(WebView2 + Rust)比手机宽松得多,可评估:① 桌面 WebView 跑 Three.js/WebGL 3D;
② 通过桌面 Computer-Use/CDP + 本地引擎(Godot/Unity Web 导出)承载更重游戏;③ 桌面侧本地
LLM(已有 localLLM sidecar)生成更大代码量;④ 联网对战需后端 netcode(跨端通用)。下轮产出评估文档。
