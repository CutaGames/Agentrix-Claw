# Agentrix 桌面端代码审计 + 优化计划

> 版本：v1.0 · 2026-05-11
> 上游：[MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05](MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md)
> 目标：移动端在 Sprint A-D + G1 重构后，桌面端需要对齐的所有改动
> 代码基线：`desktop/src/` 149 TS/TSX 文件 + `desktop/src-tauri/` 10 Rust 文件 + `lib.rs` 1077 行

---

## 0. 一句话诊断

**桌面端是另一个次元**。它有高度成熟的 Pro Mode 编码/Pet Companion 双形态架构、完整的 Agent Economy Panel、Rive/VRM 渲染管线、本地 LLM、实时 SSE 成本追踪——但对移动端刚刚落地的 **AXP 积分体系、5 档订阅、签到、共养、贺卡、宠物模仿秀** 全部**零感知**。

**更根本的问题（2026-05-11 补充）**：桌面 main 窗口的默认载体是**抽象紫色球 FloatingBall**，宠物形态是可选的 `pet-companion` 次要窗口（需用户手动从菜单 toggle）。这意味着——**用户第一眼看到的、日常陪伴他的、所有动作的载体，都不是主宠，而是一个工具按钮**。这和"Pet-as-Agent Economy"的产品哲学冲突。

这是第二次大对齐的开始。桌面端不是"抄移动端 UI"，而是"桌面该怎么呈现同一个生态"。**先修定位（Sprint D0），再补功能（Sprint DA-DE）**。

---

## Sprint D0 · Pet-as-Floating-Ball（定位翻转，2 天）🔴

### D0 目标

**把 main 窗口的默认载体从抽象紫色球换成宠物形态**。用户第一眼看到的就是他的主宠，所有动作（语音/剪贴板/AXP/审批/通知）都通过宠物表达。

### D0 核心交互重映射

| 用户动作 | 之前（抽象球）| 之后（主宠形态）|
|---|---|---|
| 单击 | 打开语音 | 宠物点头 + 打开语音（瞳孔聚焦）|
| 双击 | 打开 Pro Mode | 宠物跳起 + 打开 Pro Mode |
| 长按 | 推到说话 | 宠物张嘴 + 举爪 |
| 拖拽 | 移动球 | 宠物被"拎起" + 四肢蹬动 |
| 空闲 30s | 淡出透明 | 宠物趴下睡觉（Zzz 表情）|
| hover | 放大 | 宠物抬头 + 尾巴摇 |
| 粘贴复制 | 旁边弹方框 | 宠物嘴里叼出来剪贴板气泡 |
| **AXP 到账** | （无反馈）| **宠物头顶飘 +N AXP ☀️**（替代 AxpToastHost 的定位）|
| Pro Mode 工作 | 球缩 | 宠物伏在 ChatPanel 右下角打盹 |
| 长任务执行 | 色变 | 宠物盯屏 + 进度条从嘴里出 |
| 审批 | 红点 | 宠物拽袖子（抖动 + 举爪 + 气泡）|
| 通知 | 角标 | 宠物耳朵竖 + 小铃铛 |

### D0 技术拆解

| # | 任务 | 工程量 |
|--:|-----|-------:|
| D0-1 | `App.tsx` main 窗口分支：从 `<FloatingBall />` 切到 `<PetCompanionWindow />`（或新的 `PetFloatingBall` 组件，复用 PetRenderer）| 0.5d |
| D0-2 | 把 `FloatingBall.tsx` 的全部交互逻辑（voice / clipboard / approval badge / session handoff）抽到 `hooks/useBallInteractions.ts`，让 pet 版本复用 | 0.5d |
| D0-3 | 新建 `components/PetFloatingBall.tsx`：PetRenderer 作为视觉 + useBallInteractions 作为行为 | 0.5d |
| D0-4 | 情绪驱动：根据当前 state（idle/recording/thinking/speaking）切换 `PetEmotion`，通过 `petSdk.setLocalEmotion` | 0.3d |
| D0-5 | 粘贴板气泡：改 `PetProactiveBubble` 支持 "clipboard preview" 类型，从宠物嘴里方向出 | 0.3d |
| D0-6 | 审批需要：宠物抖动动画 + "举爪"姿势，保留现有 `approvalBadge` 状态但通过 Rive motion 表达 | 0.3d |
| D0-7 | Rust `pet_window.rs` 不再独立开窗——把逻辑合并到 main 窗口（单窗口容纳宠物 + chat panel）| 0.5d |
| D0-8 | 保留 `FloatingBall.tsx` 作为 `src_deprecated/` 备份（Sprint DE 再删）| 0.1d |
| D0-9 | 设置里加开关 "Use abstract ball"（给不习惯的老用户保留选项）| 0.2d |

**总计 3.2d ≈ 2.5 天**

### D0 验收

- ✅ 全新安装用户打开桌面 → 第一眼看到宠物（不是紫球）
- ✅ 所有交互（单击/双击/长按/拖拽/粘贴/空闲）都能通过宠物情绪/动画表达
- ✅ AXP 到账通过宠物头顶飘字（不需要再做 Sprint DA 的 AxpToastHost）
- ✅ Pro Mode 下宠物伏在右下角（不遮挡编码区）
- ✅ Settings 里有"Use abstract ball"兜底开关
- ✅ `lib.rs` 菜单项"🐾 Toggle Living Pet"改成"🟣 Use Abstract Ball"（反转默认）

### D0 非目标

- ❌ 不做 Live2D 完整接入（P3 单独做，先用现有 Rive/VRM/fallback 三层）
- ❌ 不做宠物物理碰撞 / 拖到桌面边缘回弹（保留现有 wandering 逻辑）
- ❌ 不做多宠同时显示（Phase 2）

---

## 1. 现状基线审计

### 1.1 桌面端已有能力矩阵（继承自 v2/v3 PRD）

| 层 | 组件 | 完成度 | 备注 |
|----|------|:----:|------|
| **双形态壳** | `App.tsx`、`PetCompanionWindow`、`FloatingBall`、`ChatPanel` | ✅ 100% | 窗口 label 路由 + resize 协议就绪 |
| **Chat/Pro Mode** | `ChatPanel`/`ChatPanelImpl`、`PlanTimeline`、`SkillCanvasPanel`、`TaskWorkbenchPanel` | ✅ 95% | 实时 SSE 成本追踪已上（`streamCost`） |
| **Pet Renderer** | `PetRenderer`、`PetRive`、`PetVRM`、`PetCanvas`、fallback SVG | ✅ 90% | 3 层渲染降级（VRM→Rive→SVG） |
| **Pet SDK** | `services/petSdk.ts`、`petSoulSdk`、`petCompanion`、`riveEmotionMap` | ✅ 95% | 10 种情绪 + 亲密度 Level 表 + 交互 xpGain |
| **Agent Economy** | `AgentEconomyPanel`、`PetEconomyPanel`、A2A/Transaction 流 | ✅ 80% | 面板完整，但**只有钱包维度** |
| **Voice/Wake** | `wakeWord`（Porcupine）、`realtimeVoice`、`liveSpeech`、`vad` | ✅ 90% | Desktop-only 全功能 |
| **Computer Use** | `src-tauri/computer_use/`（CDP + xdotool + xcap） | ✅ 85% | Phase B1-B6 已上 |
| **Cross-device** | `CrossDevicePanel`、`desktopSync`、`sessionSync`、`HandoffBanner` | ✅ 85% | Handoff 协议就绪 |
| **本地 LLM** | `localChat`、`localLLM`、`localInferenceTelemetry` | ✅ 80% | llama.cpp 桥接 |

### 1.2 与移动端对齐后的**核心缺口** 🔴

| # | 缺口 | 影响面 | 移动端对应 |
|--:|------|------|---------|
| 1 | **无 AXP 概念** | 整个经济闭环在桌面上看不见 | `AxpCenterScreen` + `CheckinCard` + `AxpToastHost` |
| 2 | **无订阅档感知** | 看不到自己是 Free/Plus/Pro，配额用尽没提醒 | `SubscribePlanScreen` + tier badge |
| 3 | **无每日签到** | 桌面是每日最久驻留的端，反而错过签到 | `CheckinCard` |
| 4 | **无 AXP 领奖飘字** | 后台 earn 事件（chat_active / task_complete）用户无感 | `AxpToastHost` |
| 5 | **无共养入口** | 在桌面也应能邀请/接受共养 | `CoRaisingInviteScreen` |
| 6 | **无贺卡入口** | 桌面是社交内容制作的主场 | `GreetingCard*Screen` |
| 7 | **无 Photo Mimic 模仿秀入口** | 桌面是创作工作室的主场，最应展示 | `PhotoMimicSeasonScreen` |
| 8 | **`AgentEconomyPanel` 只有钱包维度** | 没有 AXP、订阅、返现、quota | 需要扩张 |
| 9 | **Pet Creator 在桌面独立实现，无 Home CTA** | 移动端做了主 CTA 上移，桌面也应有 | 同步 |
| 10 | **LLM 成本条 vs 订阅预算脱节** | `streamCost` 只显示每次 tokens，没和月预算挂钩 | 需要接 `GET /me/quota` |

### 1.3 桌面端独有的**增量机会** 🟢

桌面的 real estate 让某些功能**比移动端更应该做**：

| 机会 | 说明 |
|------|------|
| **Plaza Dock** | 在 Pro Mode 侧边栏固定一列"集市小 widget"：Skill 热榜 / Task 匹配 / Photo Mimic 本周赛季 / 共养今日进度 |
| **Pet Feed In Companion** | Living Agent 形态下主宠头顶气泡轮播："朋友帮我喂了 +2 能量" / "本周 Photo Mimic 新赛季" / "5 人正在投你的作品" |
| **桌面参赛模式** | Photo Mimic 投稿支持**拖拽本地图片到 Companion Window** → 自动上传 + 提交 |
| **AXP Desktop Corner Indicator** | 任务栏/屏幕角悬浮一颗小小 "💎 12,340" 值始终可见，点击打开 AXP Center 浮窗 |
| **Creator Studio** | 扩展现有 `PetCreatorPanel`、`VideoStudioPanel`、`SkillCanvasPanel`，再加 `PhotoMimicStudioPanel`，统一成"创作工作室"大区 |
| **订阅预算 HUD** | ChatPanel 顶部 HUD：`本月 $12.30/$20 · 还能聊 X 轮` + 预算耗尽时弹三选一（AXP 抵扣/现金/BYOK） |
| **跨端同步展示** | 手机签到 → 桌面浮球冒一颗 `+20 AXP ☀️` 泡泡，让用户看到"我在哪端赚的 AXP 都汇总" |

### 1.4 技术债 🟡

| # | 债 | 影响 |
|--:|-----|-----|
| 1 | `expanded.rs` 和一堆 `tmp_*.cjs` 调试脚本污染仓库根 | 清理 |
| 2 | `lib.rs.bak` 存在 | 删除 |
| 3 | `ChatPanel.tsx` 是路由、`ChatPanelImpl.tsx` 是实现，命名易混 | 合并或重命名 |
| 4 | 部分 service 文件名重复（`desktop.ts` / `desktopSync.ts` / `desktopBus.ts` / `desktopAgentSync.ts` / `desktopToolCalling.ts`）— 5 个"desktop\*" | 梳理职责 |
| 5 | 没有 AGENTS.md desktop 专属段落（仅跨端 PRD v3） | 补 |

---

## 2. 优化目标（与移动端 Sprint 同等优先级）

目标：**桌面端 Sprint D0 + DA-DE（6 个 Sprint）**。每个 Sprint 2-3 天，覆盖 14 天连做。

**前置**：Sprint D0（见 §0 上方）必须最先做，因为它决定了后续 Sprint 的视觉载体——AXP 飘字是"从宠物嘴里吐出来"还是"屏幕右上角 pill"，取决于 D0 是否已落地。

### Sprint DA · 基础经济对齐（3 天） 🔴

**目标**：桌面端用户能看到 AXP、做签到、收到奖励飘字。**前提**：D0 已落地，所以 AXP toast 的载体是"宠物头顶飘字"而不是独立 pill。

| # | 任务 | 复用的移动端产出 | 工程量 |
|--:|-----|---------------|-------:|
| DA1 | `services/axp.ts`：AXP client（balance/history/checkin/status） | 复用 `src/services/axp.api.ts` 模式 | 0.3d |
| DA2 | `components/PetHeadToast.tsx`：宠物头顶飘字容器（替代移动端 AxpToastHost）| 桌面独有 | 0.4d |
| DA3 | `stores/axpToast.ts`（zustand，复用移动端 shape） | — | 0.2d |
| DA4 | `components/AxpCornerIndicator.tsx`：屏幕右下角 "💎 N" 值 + 点击展开 | 桌面独有 | 0.5d |
| DA5 | **右键菜单第一项加 "🌟 Check-in +N AXP"**（直接点按领取，不开新窗口）| 镜像 `src/screens/home/CheckinCard.tsx` | 0.4d |
| DA6 | Chat 每 10 轮完成后前端主动调 `POST /v1/axp/earn {source:'chat_active'}` + 宠物头顶飘字 | 同步移动端 P1-3（推迟项） | 0.2d |

### Sprint DB · 订阅与配额（2 天） 🟡

**目标**：用户在桌面能看到自己档位 + 预算 + 升级。

| # | 任务 | 工程量 |
|--:|-----|-------:|
| DB1 | `services/subscription.ts` 从 mobile 同步类型 + catalog/quota API | 0.3d |
| DB2 | `components/SubscriptionBadge.tsx`：ChatPanel 顶栏右侧档位 badge（FREE/PLUS/PRO/ELITE） | 0.3d |
| DB3 | `components/SubscribeModal.tsx`：点击 badge → 弹 5 档 sheet + AXP 抵扣 slider | 0.7d |
| DB4 | ChatPanel 月预算条（复用现有 `streamCost` 状态）"本月已用 $12.30 / $20 ━━━ 62%" | 0.3d |
| DB5 | 预算耗尽弹窗三选一（AXP 抵扣 / 现金 / BYOK） | 0.5d |

### Sprint DC · 共养 + 贺卡 + 模仿秀（3 天） 🟡

**目标**：桌面也是社交裂变端。

| # | 任务 | 工程量 |
|--:|-----|-------:|
| DC1 | `services/coraising.ts` + `services/greeting.ts` + `services/photoMimic.ts`（从移动端迁移） | 0.5d |
| DC2 | Pet Companion 气泡轮播"朋友帮我喂了" / "新赛季" / "X 人投你" | 0.5d |
| DC3 | `components/CoRaisingPanel.tsx`：侧边抽屉，创建/管理邀请 | 0.5d |
| DC4 | `components/GreetingStudioPanel.tsx`：多模板 + 富文本编辑（桌面能做得比手机更好） | 0.7d |
| DC5 | `components/PhotoMimicStudioPanel.tsx`：**拖拽图片到浮球 → 自动提交** + 作品榜可视化 | 0.8d |

### Sprint DD · 创作工作室统一（2 天） 🟡

**目标**：把分散的创作面板整合成一个统一的 Creator Studio。

| # | 任务 | 工程量 |
|--:|-----|-------:|
| DD1 | 创建 `CreatorStudioHub` Tab（顶部 IDE 风 tab：Skill / Video / PhotoMimic / Pet / Wardrobe） | 0.5d |
| DD2 | 统一 header（筛选/搜索/导出/AXP 奖励预览） | 0.3d |
| DD3 | 给 `PetCreatorPanel` 加完成 toast + AXP +50 奖励钩子（同 mobile P0-4） | 0.2d |
| DD4 | Pet Home CTA："从照片/文字生成专属宠" 放在 Living Agent 右键菜单顶部 | 0.3d |
| DD5 | `VideoStudioPanel` 上架流程加奖励 hint："每个上架视频 +30 AXP" | 0.2d |
| DD6 | `AgentEconomyPanel` 扩展：加 AXP/订阅/配额 3 列 tab | 0.5d |

### Sprint DE · 跨端同步 + 清理（2 天） 🟢

| # | 任务 | 工程量 |
|--:|-----|-------:|
| DE1 | 手机 AXP 事件 → desktop 浮球冒气泡（走 `sessionSync` 推送通道） | 0.5d |
| DE2 | 删除 `expanded.rs` + `lib.rs.bak` + 所有 `tmp_*.cjs` | 0.1d |
| DE3 | 统一 `desktop*.ts` 5 个 service 文件的职责边界（写入 README）| 0.3d |
| DE4 | `ChatPanel.tsx` 和 `ChatPanelImpl.tsx` 合并（或明确 router/impl 分工）| 0.5d |
| DE5 | 桌面端 E2E 测试脚本补齐（参照 `MOBILE_USER_JOURNEY_E2E_2026-05`） | 0.7d |

---

## 3. 屏幕/组件迁移表

### 3.1 直接复用移动端（逻辑 + API 相同）

| 移动端 | 桌面对应 | 动作 |
|--------|---------|------|
| `src/services/axp.api.ts` | `desktop/src/services/axp.ts` | ♻️ 镜像 |
| `src/services/coraising.api.ts` | `desktop/src/services/coraising.ts` | ♻️ 镜像 |
| `src/services/greeting.api.ts` | `desktop/src/services/greeting.ts` | ♻️ 镜像 |
| `src/services/photoMimic.api.ts` | `desktop/src/services/photoMimic.ts` | ♻️ 镜像 |
| `src/services/subscription.api.ts` | `desktop/src/services/subscription.ts` | ♻️ 镜像 |
| `src/stores/axpToastStore.ts` | `desktop/src/stores/axpToast.ts` | ♻️ 镜像 |

### 3.2 重新设计（桌面视觉习惯）

| 移动屏 | 桌面形态 | 原因 |
|--------|---------|------|
| `CheckinCard`（Home 卡片） | **浮球长按 → 全屏 modal** | 桌面没有 Home Tab |
| `AxpCenterScreen`（独立屏）| **AgentEconomyPanel AXP tab** | 桌面是面板式 |
| `SubscribePlanScreen`（独立屏）| **顶栏 SubscriptionBadge → 点击展开 sheet** | 桌面是抽屉式 |
| `PhotoMimicSeasonScreen`（独立屏）| **CreatorStudioHub PhotoMimic tab** | 桌面是工作室 |
| `CoRaisingInviteScreen`（独立屏）| **侧边 CoRaisingPanel** | 桌面是多面板 |
| `GreetingCardComposeScreen`（独立屏）| **GreetingStudioPanel 大窗**（桌面可加视频/3D）| 富媒体 |
| `PosterShareCard`（1080×1920 移动）| **1920×1080 横向海报**（桌面分享到 Twitter/Discord 更合适）| 方向反转 |
| `AxpToastHost`（顶部 pill）| **屏幕右上角 pill + framer-motion 淡入**  | 屏幕更大 |

### 3.3 桌面独创

| 组件 | 用途 |
|------|------|
| `AxpCornerIndicator` | 右下角 "💎 N" 悬浮 |
| `SubscriptionBadge` | ChatPanel 顶栏档位 + 预算条 |
| `LivingAgentBubbleFeed` | 主宠头顶轮播跨端事件 |
| `CreatorStudioHub` | Skill/Video/PhotoMimic/Pet/Wardrobe 统一 |
| `BudgetHud` | ChatPanel 月预算可视化 |

---

## 4. 后端影响

移动端已经部署了这些端点，桌面**直接复用，不需要后端新增**：

```
AXP:       GET /v1/axp/balance, /v1/axp/checkin/status, POST /v1/axp/checkin, /v1/axp/earn, /v1/axp/spend
Subscribe: GET /v1/subscription/catalog, /v1/subscription, /v1/me/quota
CoRaising: POST/GET/DELETE /v1/pet/coraising/invites, POST /v1/pet/coraising/feed
Greeting:  GET /v1/pet/greeting/catalog, GET /v1/pet/greeting/inbox, POST /v1/pet/greeting/send
PhotoMimic: GET /v1/games/photo-mimic/seasons/current + leaderboard, POST /v1/games/photo-mimic/entries + votes
```

**唯一新增**：sessionSync 推送 "axp:earned" 事件到桌面 socket.io（DE1）。

---

## 5. 风险清单

| 风险 | 严重度 | 缓解 |
|-----|-------|------|
| 桌面启动后 socket.io 延迟拿到 AXP 事件，toast 可能叠 bomb | 中 | 每次拉取最近 N 秒，dedupe |
| 拖拽图片上传（Photo Mimic）需 Tauri file drop + S3 预签名 URL | 中 | 用现有 `tauri-plugin-dialog` + 后端 `/upload/presigned` |
| 订阅预算条查询频繁 → rate limit | 低 | 本地缓存 + 30s stale |
| 签到小窗 × 浮球右键菜单冲突 | 低 | 菜单独立项，不占常驻入口 |
| Windows/macOS 平台差异（浮球位置/拖拽）| 中 | 已有 `pet_window.rs` 适配层，扩展即可 |
| 多窗口同时显示 AxpToast 可能重复 | 中 | 中心化 store + 窗口标识去重 |

---

## 6. 非目标（桌面不做）

- ❌ 不做完整签到日历（AXP Center 的历史已经够）
- ❌ 不做 Plaza 5 段完整镜像（桌面用 Dock 小 widget 代替）
- ❌ 不做 Me Tab 镜像（桌面 SettingsPanel 已够）
- ❌ 不做 Stripe checkout 流程（跳 web subscribe 页面，桌面打开浏览器完成）
- ❌ 不做移动端的 Voice Quick FAB（桌面用全局热键）
- ❌ 不做宠物独立游戏（延后 Phase 2+）

---

## 7. 下一步

1. **本周内**：Sprint DA（3 天）上线 AXP 基础 + 签到
2. **下周**：Sprint DB + DC（5 天）订阅 + 共养/贺卡/模仿秀
3. **第三周**：Sprint DD + DE（4 天）Creator Studio 统一 + 跨端同步 + 清理
4. **验收**：写桌面端用户路径 E2E 测试文档（参照 `MOBILE_USER_JOURNEY_E2E_2026-05`）

**总工作量**：14 天连做，1 人工程师满勤即可。

---

## 8. 附录：关键文件变更清单

### 新建（约 18 个）
- `desktop/src/services/{axp,coraising,greeting,photoMimic,subscription}.ts`（5）
- `desktop/src/stores/axpToast.ts`
- `desktop/src/components/{AxpToastHost,AxpCornerIndicator,CheckinCard,SubscriptionBadge,SubscribeModal,BudgetHud,CoRaisingPanel,GreetingStudioPanel,PhotoMimicStudioPanel,CreatorStudioHub,LivingAgentBubbleFeed}.tsx`（11）
- `desktop/README-services.md`（文件职责说明）

### 修改（约 8 个）
- `App.tsx`（挂载 AxpToastHost + AxpCornerIndicator + CreatorStudioHub）
- `ChatPanelImpl.tsx`（加 SubscriptionBadge + BudgetHud）
- `PetCompanionWindow.tsx`（右键菜单加 CheckIn + CoRaise + PhotoMimic）
- `AgentEconomyPanel.tsx`（扩展 AXP/Subscribe/Quota tab）
- `PetCreatorPanel.tsx`（加 AXP 完成钩子）
- `VideoStudioPanel.tsx`（加 AXP 奖励 hint）
- `services/sessionSync.ts`（接入 axp:earned 事件）
- `services/store.ts`（增加 AXP / subscription / quota 缓存）

### 删除
- `desktop/expanded.rs`
- `desktop/src-tauri/src/lib.rs.bak`
- `desktop/tmp_*.cjs` / `desktop/tmp_*.js`（全部 tmp_ 前缀调试脚本）

---

*Agentrix Desktop Engineering · 2026-05-11*
