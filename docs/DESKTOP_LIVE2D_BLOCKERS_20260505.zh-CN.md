# Desktop Live2D Blocker 清单（2026-05-05）

## 当前已核实状态

- 桌面端当前只有矢量浮球 / 聊天壳，没有任何 Live2D renderer、模型加载器、动作映射或 Pet SDK 对外接口。
- `desktop/package.json` 当前没有 `live2d-cubism-core` 或其他 Cubism runtime 依赖，说明仓库里还没有可编译的 Live2D 运行时接入。
- 桌面端已有截图原语（`desktop/src/services/screenshot.ts`），但还没有把截图 / 视觉感知结果接回主宠状态、互动动作或亲密度系统。
- 本文档只整理 blocker 和落地前置条件，不代表 `P3-1` 已经开始实现，更不代表已经完成。

## Blocker 清单

1. 授权与资产
   - 尚未申请 Live2D Cubism 商业 license。
   - 仓库内没有可分发的 `.moc3` / `.model3.json` / 贴图 / 动作资源，也没有明确使用官方免费模型还是自有商业模型。

2. 运行时缺失
   - 桌面包清单里没有 Live2D runtime 依赖。
   - `desktop/src` 下没有 Live2D renderer 组件、模型生命周期管理、动作队列、lip-sync / idle / emotion bridge。

3. 状态映射缺失
   - 当前主宠可视表达还是浮球，没有“emotion -> motion/expression -> interaction”映射表。
   - 亲密度 v2 的等级、解锁动作、装扮 / 背景切换规则还没有代码契约。

4. 视觉感知链路缺失
   - 截图原语已经存在，但没有视觉分析服务、频率控制、隐私边界、结果缓存，也没有把感知结果回写到主宠行为层。

5. 离线与分发策略缺失
   - 没有模型资源下载、版本管理、缓存目录、校验、更新、回滚方案。
   - 没有定义离线模式下哪些 Live2D 能力可用，哪些能力必须降级到静态浮球。

6. SDK / 对外能力缺失
   - 没有 Pet SDK 的 API 草案、事件模型、权限边界、宿主集成方式。
   - 没有确定 Live2D 层与现有 Tauri bridge / desktop shell / agent presence 的边界。

## 落地前置条件

1. 先拿到 Live2D license，并确定模型来源与可商用范围。
2. 明确桌面技术选型：JS runtime 方案、Tauri 打包方式、资源目录与更新策略。
3. 先写清 emotion / intimacy / interaction 三张映射表，再开始做 renderer。
4. 先定义视觉感知的隐私边界与产品策略，再把截图原语接进主宠行为链。
5. 先定义离线降级方案：无模型资源时退回浮球；无视觉感知时仍可保留基础互动。
6. 先确定 Pet SDK 的最小 API 面，再决定是否把 Live2D 实现暴露给外部插件或只保留内部能力。

## 建议落地顺序

1. 授权 / 模型 / runtime 选型
2. 最小 renderer + 6 个 emotion 动作映射
3. 双击互动 / idle / intimacy v2
4. 视觉感知回写
5. 离线资源与更新策略
6. Pet SDK 文档与开放接口