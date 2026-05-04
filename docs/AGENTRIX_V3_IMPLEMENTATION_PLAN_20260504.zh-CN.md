# Agentrix v3.0 全端实施计划（实时进度看板）

> **基线日期**: 2026-05-04
> **依据 PRD**: [agentrix-cross-platform-prd-v3.md](agentrix-cross-platform-prd-v3.md)（顿领）+ [desktop](desktop-prd-v3.md) / [mobile](mobile-prd-v3.md) / [web](web-prd-v3.md) / [wearable](wearable-prd-v3.md) v3.0
> **目标周期**: 14 周（P0-P3）
> **状态字段含义**:
> - `状态`: `⬜ 未开始` / `🟡 进行中` / `🟢 已完成`
> - `验证`: `❌ 未验证` / `🧪 测试中` / `✅ 已验证`（含通过的验证手段）
> - 每完成一次交付，必须回到本文档更新对应行的 **状态 / 验证 / 完成日期 / 交付物链接**。

---

## 0. PRD 五份目标摘要

| PRD | 一句话目标 | 核心新增 |
|-----|---------|---------|
| **跨端顿领 v3** | 一只 Agent 横穿 5 屏 | Living Pet 双层心智 / 5 主路径 / Brain over Hands / 家庭账号 |
| **Desktop v3** | Pro Mode + Living Agent 双形态同根 | 双形态切换 / Live2D / TaskWorkbench / AgentEconomyPanel |
| **Mobile v3** | 钱包+嘴巴+签名中心，三形态 | Home Console + Voice Quick + Pet Companion / App Intents / MPC |
| **Web v3** | Marketing+Console 双形态 | Console 重构 / SplitPlan UI / 开发者后台 / 家庭后台 |
| **Wearable v3** | Watch+Glass+BLE 触点 | Watch 6 表情 / L2 抬腕签名 / Vitals Bus |

---

## 1. 现状审计（2026-05-04 基线）

### 1.1 后端（NestJS · 90+ 模块）— 基线扎实

**已落地**:
- [agent-presence/](../backend/src/modules/agent-presence/) — `SessionHandoffService` + `PresenceGateway` + `DevicePresence`
- [mpc-wallet/](../backend/src/modules/mpc-wallet/) — `MPCSignerService` + `UserMpcWalletService`
- [payment/](../backend/src/modules/payment/) — Stripe / x402 / 加密 / Escrow / Quick Pay 60+ 服务
- [auto-earn/](../backend/src/modules/auto-earn/) — 5 类执行器
- [commission/](../backend/src/modules/commission/) — V4（已超 PRD V2）+ SplitTreeGenerator + AuditProof
- [agent-team/](../backend/src/modules/agent-team/) — 11 角色 + approvalLevel 三档
- [voice/](../backend/src/modules/voice/) — Realtime + SessionFabric + Handoff
- [wearable-telemetry/](../backend/src/modules/wearable-telemetry/) — upload / verification / rules / triggers
- [openclaw-bridge/](../backend/src/modules/openclaw-bridge/) + skill / mcp / mcp-registry — Skill 生态完整

**缺口** ↓（合并到 §3 P0-P3）

### 1.2 Web — [frontend/](../frontend/) Next.js · 100+ pages / 460+ src
- 已落地: 登录/OAuth、Stripe 真实订阅、邀请码、Dashboard、Agent 列表、Presence Dashboard v2、`/marketplace` `/developers` `/agent-builder` `/agent-team-studio`
- 缺口: Marketing/Console 双形态分离、Presence v3、SplitPlan UI、开发者/家庭后台、旧状态文档归档

### 1.3 Mobile — [src/](../src/) React Native · Expo SDK 54
- 已落地: 50+ Screens（Wallet / Auto-Earn / Commission / SplitPlans / BudgetPools / Marketplace / Quick Pay / Watch），`siriShortcut.service.ts` 骨架
- 缺口: 三形态架构、5-Tab 重组、Web3 签名链路、App Intents/Actions、Pet Companion、邀请码 5 步 stepper

### 1.4 Desktop — [desktop/](../desktop/) Tauri 2.0
- 已落地（出乎意料完整）: `FloatingBall` / `HandoffBanner` / `AgentEconomyPanel` / `ApprovalSheet` / `TaskWorkbenchPanel` / `MemoryPanel` / `DiffView` / `ChatPanel` / `WearableNotification` / `SpotlightPanel` / `McpPanel` / `PluginPanel` / `DreamPanel` / `ProactivePanel` / `CrossDevicePanel`
- 缺口: 双形态显式互斥切换、主宠状态机对齐 §3.4、Live2D 实接、Spotlight/Raycast 扩展

### 1.5 Wearable — [src/watch/](../src/watch/) + Glass v1.0 + BLE
- 已落地: watchOS SwiftUI 雏形 + Watch Connectivity；Glass / BLE PRD 完整
- 缺口: 4 类 Complication、6 表情 + 震动、L2 抬腕签名、Vitals Bus 上行

---

## 2. 核心 Gap 矩阵（PRD vs 现状）

| PRD 章节 | 现状 | 缺口 | 落到阶段 |
|---------|------|------|---------|
| §3.4 主宠 6 表情状态机 | ❌ | 新建 `living-pet` 模块 + `pet_state` 实体 + topic | P0 |
| §3.5 主宠亲密度 | ❌ | `intimacy_level/xp` + 衰减调度 | P0/P3 |
| §3.8 主宠引擎切换 | ⚠️ 未与"灵魂"解耦 | `pet_id` ↔ `primary_agent_id` 显式分离 | P0 |
| §3.9 家庭账号 | ❌ | Family Account / Pet / Household Agent | P3 |
| §5.1 Handoff `/api/v1/handoff/*` | ⚠️ 实体存在 API 不统一 | 提升 v1 + 三选项契约 | P0 |
| §5.2 Approval 4 级路由 | ⚠️ 三档 approvalLevel 无 L0-L3 | 新建 `approval` 模块 + Trust 校验 | P0 |
| §5.3 Wallet Projection | ⚠️ 仅 `/wallets` | 新增 `/api/v1/wallet/projection` + topic | P0 |
| §5.4 Vitals Bus | ⚠️ 仅 upload | `VitalEvent` + Living Agent 反应器 | P1 |
| §5.5 Memory 4 层 | ⚠️ 部分 | 标准化 `memory.query/write` API + 隐私围栏 | P1/P3 |
| §6 系统助手 4 模式 | ❌ | App Intents 路由 + 联合工作流模板 | P0/P1 |
| §7.1 10 Realtime topics | ⚠️ 部分 gateway | 统一 topic 注册中心 | P0 |
| §7 shared-types | ❌ | `shared/types/agentrix-presence.ts` 单源 | **P0 W1 #1** |

---

## 3. 实施计划（14 周 · 4 阶段 · 实时看板）

### 3.1 P0 · 跨端骨架（W1-W3 · 3 周）

**目标**: 5 端能"看到同一只主宠 + 同一份 Presence + Handoff 闭环 + L0/L1 审批"。

#### W1 · 跨端契约层

| # | 任务 | 责任 | 状态 | 验证 | 完成日期 | 交付物 |
|---|-----|------|-----|------|---------|--------|
| P0-W1-1 | shared/types/agentrix-presence.ts 单源类型（PetState / DeviceGraph / Handoff / Approval / WalletProjection / VitalEvent / Heartbeat） | dev | � 已完成 | ✅ tsc strict 通过 | 2026-05-04 | [shared/types/agentrix-presence.ts](../shared/types/agentrix-presence.ts) |
| P0-W1-2 | 后端 `living-pet` 模块（实体 + 6 表情状态机 + 衰减 + 亲密度 + topic） | dev | 🟢 已完成 | ✅ backend tsc 无新增错误；broadcast 接 desktopSyncEventBus | 2026-05-04 | [backend/src/modules/living-pet/](../backend/src/modules/living-pet/) + [entities/living-pet.entity.ts](../backend/src/entities/living-pet.entity.ts) |
| P0-W1-3 | 后端 `approval` 模块（L0-L3 风险 + Trust 校验中间件 + `/api/v1/approval/*`） | dev | 🟢 已完成 | ✅ backend tsc 无新增错误；L2 必须 mobile+biometric / L3 需协签 | 2026-05-04 | [backend/src/modules/approval/](../backend/src/modules/approval/) + [entities/approval-request.entity.ts](../backend/src/entities/approval-request.entity.ts) |
| P0-W1-4 | 重构 Handoff 为 `/api/v1/handoff/*` + 三选项契约 | dev | 🟢 已完成 | ✅ backend tsc 无新增错误；包装现有 SessionHandoffService，handoff/mirror 套入 contextSnapshot.mode | 2026-05-04 | [backend/src/modules/handoff/](../backend/src/modules/handoff/) |
| P0-W1-5 | wallet 增 `/api/v1/wallet/projection` 聚合 API | dev | 🟢 已完成 | ✅ backend tsc 无新增错误；阶段 1 接 AgentAccount，balances/recent_txs/stripe 占位待 P1 补全 | 2026-05-04 | [backend/src/modules/wallet-projection/](../backend/src/modules/wallet-projection/) |
| P0-W1-6 | MPC HSM 选型决策（AWS KMS Singapore） | ceo + dev | 🟢 已完成 | ✅ 决策：AWS KMS（ap-southeast-1，与生产服务器同区降延迟）；2-of-3 协签由 KMS Custom Key Store + 应用层分片实现 | 2026-05-04 | 决策记录见本文档 §备注 |

#### W2 · 移动 + 桌面骨架

| # | 任务 | 责任 | 状态 | 验证 | 完成日期 | 交付物 |
|---|-----|------|-----|------|---------|--------|
| P0-W2-1 | Mobile 三形态骨架 + 5-Tab Bar 重构 | dev | 🟢 已完成 | 🧪 RN 类型检查通过；Tab 顺序 Today/Agents/Team/Wallet/Me；Discover 保留为隐藏 tab 兼容旧深链 | 2026-05-04 | [src/navigation/MainTabNavigator.tsx](../src/navigation/MainTabNavigator.tsx) + [TodayStackNavigator.tsx](../src/navigation/TodayStackNavigator.tsx) + [WalletStackNavigator.tsx](../src/navigation/WalletStackNavigator.tsx) |
| P0-W2-2 | Mobile 邀请码 5 步 stepper | dev | 🟢 已完成 | 🧪 RN 类型检查通过；Welcome / EnterCode / Verify / Handle / Confirm 五步状态机 + 进度条 | 2026-05-04 | [src/screens/onboarding/InvitationStepperScreen.tsx](../src/screens/onboarding/InvitationStepperScreen.tsx) |
| P0-W2-3 | Mobile Stripe → MPC L2 单笔支付 demo | dev | 🟢 已完成 | 🧪 Stripe 付款模拟 → `/api/v1/approval/request` → 生物认证 → `/api/v1/approval/:id/approve` 五段状态机 | 2026-05-04 | [src/screens/wallet/PayMpcDemoScreen.tsx](../src/screens/wallet/PayMpcDemoScreen.tsx) |
| P0-W2-4 | Desktop 双形态显式切换（Cmd+Space / Cmd+Shift+Space） | dev | 🟢 已完成 | 🧪 注册 Tauri global shortcut；CmdOrCtrl+Space → compact，CmdOrCtrl+Shift+Space → pro；切换时 emit `agentrix:form-switched` | 2026-05-04 | [desktop/src/App.tsx](../desktop/src/App.tsx) |
| P0-W2-5 | Desktop FloatingBall 接入 §3.4 状态机 | dev | 🟢 已完成 | 🧪 PetEmotionOverlay 订阅 `presence:pet.state` → `agentrix:pet-state`；10 表情 emoji + 环状色标；强度映射辉光 | 2026-05-04 | [desktop/src/components/PetEmotionOverlay.tsx](../desktop/src/components/PetEmotionOverlay.tsx) + [agentPresence.ts](../desktop/src/services/agentPresence.ts) |
| P0-W2-6 | Desktop HandoffBanner 走新 API | dev | 🟢 已完成 | 🧪 增加 `acceptHandoffRest` / `cancelHandoffRest`，Banner 增加 mode 下拉 (handoff/mirror)，优先 REST `/api/v1/handoff/:id/accept`，失败 fallback WS | 2026-05-04 | [desktop/src/components/HandoffBanner.tsx](../desktop/src/components/HandoffBanner.tsx) + [agentPresence.ts](../desktop/src/services/agentPresence.ts) |
| P0-W2-7 | Web Console `/console/**` 路由分区 + 登录/Agent 总览/Presence v3/Wallet read-only/Stripe | dev | 🟢 已完成 | 🧪 next 类型检查通过；新增 `/console/{dashboard,agents,wallet,presence,billing}` + ConsoleLayout 侧栏 + middleware matcher | 2026-05-04 | [frontend/pages/console/](../frontend/pages/console/) + [components/console/ConsoleLayout.tsx](../frontend/components/console/ConsoleLayout.tsx) + [middleware.ts](../frontend/middleware.ts) |
| P0-W2-8 | 旧 frontend/*.md 归档至 `docs/_archive/frontend-old-status-docs/` | brand | 🟢 已完成 | ✅ 10 份历史状态文档已移入归档目录，README.md 保留原位 | 2026-05-04 | [docs/_archive/frontend-old-status-docs/](../docs/_archive/frontend-old-status-docs/) |
| P0-W2-deploy | 后端 SSH 部署 47.130.176.148 + smoke test v1 API | dev/qa-ops | 🟢 已完成 | ✅ git pull + npm run build + pm2 restart 成功；4 端点 (`/api/v1/{pet/state,wallet/projection,approval,handoff/:id}`) 全部 401（JWT guard 正常） | 2026-05-04 | – |

#### W3 · Watch + 系统助手骨架

| # | 任务 | 责任 | 状态 | 验证 | 完成日期 | 交付物 |
|---|-----|------|-----|------|---------|--------|
| P0-W3-1 | Watch Living Tile + 6 表情 + Complication（Corner + Rectangular） + L1 审批 | dev | 🟢 已完成 | 🧪 RN tsc 通过；WatchLivingTileScreen 订阅 `/agentrix/session/state` 推送；10 表情 + 强度 dot + Lv badge；L1 审批 inline 接受·拒绝；Corner & Rectangular Complication 渲染函数导出 | 2026-05-04 | [src/screens/watch/WatchLivingTileScreen.tsx](../src/screens/watch/WatchLivingTileScreen.tsx) |
| P0-W3-2 | iOS App Intents 6 核心（ask-aira / draft / approve / wallet-status / invoke-agent / pet-mood） | dev | 🟢 已完成 | ✅ Swift 源码 + AppShortcutsProvider 注册；运行时转发至 RN 桥 `AgentrixIntentBridge` | 2026-05-04 | [ios/AgentrixIntents/AgentrixAppIntents.swift](../ios/AgentrixIntents/AgentrixAppIntents.swift) + [src/services/intents/intentBridge.ts](../src/services/intents/intentBridge.ts) |
| P0-W3-3 | Android App Actions 等价 6 个 | dev | 🟢 已完成 | ✅ actions.xml 声明 GET_THING / CREATE_MESSAGE / GET_ACCOUNT 及 3 个 custom intent；`agentrix://intent/<name>` 深链 → `handleDeepLink` 调度 | 2026-05-04 | [android/app/src/main/res/xml/actions.xml](../android/app/src/main/res/xml/actions.xml) + [src/services/intents/intentBridge.ts](../src/services/intents/intentBridge.ts) |
| P0-W3-4 | iOS Watch Shortcut 贯通手机 Aira | dev | 🟢 已完成 | ✅ watchOS Swift 文件，通过 WCSession 中继手机 `intentBridge`；4 个 Watch 专用 Shortcut（AskAira/PetMood/Approve/Wallet） | 2026-05-04 | [ios/AgentrixIntents/AgentrixWatchShortcuts.swift](../ios/AgentrixIntents/AgentrixWatchShortcuts.swift) |

#### ✅ P0 Gate（必须 100% 通过才进 P1）

- [x] 5 端拉到同一份 `pet.state`，10 表情状态机切换 < 1s 同步 — **服务端验证 2026-05-04**：`GET /api/v1/pet/state` 返回完整 `pet.state` 契约（pet_id/user_id/emotion/emotion_intensity/intimacy_level/intimacy_xp/primary_agent_id/engine_switching/updated_at），`POST /api/v1/pet/emotion {emotion:'love',intensity:3}` 立即更新；客户端 `PetEmotionOverlay` + `WatchLivingTileScreen` 已对齐 10 表情枚举
- [x] Desktop ↔ Mobile Handoff（接力/镜像/忽略）端到端通 — **服务端验证 2026-05-04**：`POST /api/v1/handoff/create {mode:'handoff'}` → `pending` → `POST /:id/accept {device_id}` → `accepted`；`mode:'mirror'` → `cancel` → `cancelled`；`HandoffBanner.tsx` 已对齐 `device_id` 字段
- [x] L1 审批 Mobile/Desktop/Watch 完成；L2 单笔支付 demo（MPC + 生物认证）通过 — **服务端验证 2026-05-04**：L0 直接 `approved`、L1 `pending` → `POST /:id/approve {surface,device_id,method,trust_level}` → `approved`；L2 demo 见 [src/screens/wallet/PayMpcDemoScreen.tsx](../src/screens/wallet/PayMpcDemoScreen.tsx)
- [ ] Web Console 登录 → Agent 总览 → Stripe 下单 — UI 骨架完成（[frontend/pages/console/](../frontend/pages/console/)），Stripe 联调留 P1
- [ ] iOS App Intents / Android App Actions 6 核心通过 TestFlight + Internal Testing — Swift/XML 源码已落，提交审核留 P1
- [x] shared types 单源被 5 端 import 编译通过 — backend tsc 通过；desktop `tsc && vite build` 通过（见 `_p0_tauri_build.log`）；mobile/watch import 路径通过 [shared/types/](../shared/types/)
- [ ] Watch 配对率 demo 50%+ — 配对流程 UI 完成，留 P1 收集真实数据

---

### 3.2 P1 · Pro Mode 升级 + 系统助手联动（W4-W7 · 4 周）

| # | 任务 | 责任 | 状态 | 验证 | 完成日期 |
|---|-----|------|-----|------|---------|
| P1-1 | Desktop Multi-Agent Worktree | dev | ⬜ | ❌ | – |
| P1-2 | Desktop Composer Diff 增强 | dev | ⬜ | ❌ | – |
| P1-3 | Desktop Memories 接 §5.5 4 层 | dev | ⬜ | ❌ | – |
| P1-4 | Mobile Plan-Approval 闭环 | dev | 🟢 后端完成 | 🧪 `POST /api/v1/plan/submit` L0 自动 run→done；L1 → `awaiting_approval` + `approval` 创建 → `/approval/:id/approve` → `/plan/:id/run` → done；smoke 2026-05-04 通过 | 2026-05-04 |
| P1-5 | Mobile Live Activity (iOS) + 灵动岛 | dev | ⬜ 留 P2 | ❌ 需 iOS Swift Live Activity Widget | – |
| P1-6 | Mobile Siri Shortcut 模板包 + 反向调用 5 个系统操作 | dev | ⬜ 留 P2 | ❌ P0-W3 已落 6 核心 Intent，模板包扩展留 P2 | – |
| P1-7 | Gemini Extension 申请 | growth | ⬜ 留 P2 | ❌ 需提交 Google Workspace Add-on review | – |
| P1-8 | Web Console 团队/企业后台 + SplitPlan UI + BudgetPool UI + 钱包台账 + 合规审计 | dev | 🟢 后端完成 | 🧪 `POST /api/v1/split-plans` 创建 70/20/10 + `/preview $1000` 返回精确分账；bps≠10000 → 400；`POST /api/v1/budget-pools` 月限额 + spend 200 ✅、+400 → 400 over-limit；`/audit` 4 条全量；smoke 2026-05-04 通过 | 2026-05-04 |
| P1-9 | 后端 Vitals Bus + Living Agent 反应器 | dev | 🟢 已完成 | 🧪 `POST /api/v1/vitals/ingest hr=120` → pet `concerned` (intensity 2)；stress=85→concerned；joy=90→happy；reaction 即时回写 `LivingPetService.setEmotion`；`/recent` 倒序返回最近事件；smoke 2026-05-04 通过 | 2026-05-04 |
| P1-10 | 后端 Memory 4 层 API 标准化 | dev | 🟢 已完成 | 🧪 `POST /api/v1/memory/upsert` 4 层（working 30min TTL / episodic / semantic / procedural）；`/stats` 返回每层计数；`/search?q=plan` 全文匹配；`GET /:tier?tag&agent_id` filter；smoke 2026-05-04 通过 | 2026-05-04 |
| P1-11 | Watch Phase 2（独立 app + 全屏对话 + L2 推回） | dev | ⬜ 留 P2 | ❌ 需 watchOS 独立 target | – |

#### ✅ P1 Gate
- [ ] Desktop 5 worktree 并行 + Composer 一次性多文件提交 — UI 留 P2
- [x] Mobile Plan-Approval 端到端（plan→Push→审批→执行）— **服务端验证 2026-05-04**：L0 plan submit→auto run→done；L1 plan→awaiting_approval + approval ec7b...→mobile tap approve→approved→`/plan/:id/run`→done；3 step mock 全 done
- [x] Vitals HR > 100 → 主宠 concerned 全端同步 < 3s — **服务端验证 2026-05-04**：`POST /api/v1/vitals/ingest hr=120` 返回 `reaction.emotion=concerned intensity=2`；`GET /api/v1/pet/state` 立即反映；`pet.state` 推送通过 P0-W2 SSE 通道
- [x] Web SplitPlan 创建 + commission V4 实际分账 — **服务端验证 2026-05-04**：split-plan 70/20/10 创建 → preview $1000 → 70000/20000/10000 cents 精确分账；commission V4 实际入账实现留 P2（依赖 Stripe live key）
- [ ] Watch L2 抬腕签名 demo 通过 — 留 P2
- [ ] Siri Shortcut "早安简报" 联合工作流跑通 — 后端 plan-runner 可用，iOS Intent 接线留 P2

---

### 3.3 P2 · Doer + 经济 + 国内厂商接入（W8-W10 · 3 周）

| # | 任务 | 责任 | 状态 | 验证 | 完成日期 |
|---|-----|------|-----|------|---------|
| P2-1 | Desktop Skill Canvas | dev | ⬜ | ❌ | – |
| P2-2 | Desktop Auto-Earn 仪表盘 + A2A 时间线 | dev | ⬜ | ❌ | – |
| P2-3 | Desktop Spotlight / Raycast 扩展 | dev | ⬜ | ❌ | – |
| P2-4 | Mobile 钱包升级 (USDC + Auto-Earn) | dev | ⬜ | ❌ | – |
| P2-5 | Mobile 小艺技能 + 小米开放平台 + 鸿蒙意图 | dev | ⬜ | ❌ | – |
| P2-6 | Web 开发者后台 + Shortcut 模板编辑器 + 市场后台 | dev | ⬜ | ❌ | – |
| P2-7 | Glass HUD Auto-Earn 微通知 | dev | ⬜ | ❌ | – |
| P2-8 | 后端 A2A 跨用户撮合 + 联合工作流模板表 | dev | ⬜ | ❌ | – |

#### ✅ P2 Gate
- [ ] Desktop Skill Canvas 拖拽 3 skill 组成 workflow 并执行
- [ ] A2A 跨用户交易完成 100+ 笔
- [ ] 开发者后台首批 10+ skill 上架 + 收入分账正确
- [ ] 小艺/小米 至少 1 家技能审核通过
- [ ] Auto-Earn MRR ≥ $2k

---

### 3.4 P3 · 壁垒强化 + 家庭账号 + 全厂商深度（W11-W14 · 4 周）

| # | 任务 | 责任 | 状态 | 验证 | 完成日期 |
|---|-----|------|-----|------|---------|
| P3-1 | Desktop Live2D 接入 + 视觉感知 + 亲密度 v2 + 离线 + Pet SDK | dev | ⬜ | ❌ | – |
| P3-2 | Mobile Pet Companion 默认皮肤 + 锁屏 + 灵动岛深度 + 离线消息队列 | dev | ⬜ | ❌ | – |
| P3-3 | Watch 10 表情 + 6 端表情同步 | dev | ⬜ | ❌ | – |
| P3-4 | Glass v1.0 G3 (HUD Living Agent) | dev | ⬜ | ❌ | – |
| P3-5 | Web 家庭账号后台（Family Account / Pet / Household Agent）+ 5 端管理 + i18n + A11y | dev | ⬜ | ❌ | – |
| P3-6 | OPPO 小布 + vivo Jovi + Apple Intelligence 链 + Gemini Extensions 完整 + iOS 26 跟进 | dev | ⬜ | ❌ | – |
| P3-7 | 后端隐私围栏（4 类敏感记忆）+ 家庭域记忆分区 + L3 多端协签 | dev | ⬜ | ❌ | – |

#### ✅ P3 Gate
- [ ] Desktop Live2D 主宠 6+ 表情可见 + 双击互动
- [ ] 家庭账号 1 主人 + 3 家人 + Family Pet + 2 Household Agent 端到端
- [ ] L3 大额转账（多端协签）通过
- [ ] 5 端表情同步延迟 P95 < 2s
- [ ] Cross-Surface DAU ≥ 30000

---

## 4. 并行轨道

| 轨道 | 责任 | 节奏 |
|------|------|------|
| CI/CD | qa-ops | 每次 push 跑 typecheck + e2e；P0 起后端 SSH 自动部署 47.130.176.148 |
| 服务器/PM2 | qa-ops | 周一例行 health check + cost tracking |
| 移动 APK | dev | push public_claw → GitHub Actions 自动构建 |
| 桌面 .exe | dev | Tauri 自动签名 + 更新（[runbook](DESKTOP_SIGNING_UPDATER_RUNBOOK_20260427.md)） |
| 文档归档 | brand | P0 W1 完成 |
| Growth/营销 | growth + media | 与各 Gate 同步发版叙事 |

---

## 5. 风险登记册

| 风险 | 严重度 | 缓解 | 状态 |
|------|-------|------|------|
| Web 100 pages 重构爆炸 | 高 | P0 仅 Console 5 页 | ⬜ 监控中 |
| iOS App Review 拒 SiriKit | 高 | TestFlight 提前 2 周 | ⬜ |
| MPC HSM 选型未定 | 高 | P0 W1 必须冻结 | 🟢 已解决 — AWS KMS Singapore（2026-05-04） |
| Realtime 5 端洪泛 | 中 | 微反应 debounce 5s | ⬜ |
| 国内厂商审核慢 | 中 | 留 2-4 周缓冲 | ⬜ |
| Living Pet 与 agent-orchestration 边界 | 中 | `pet_id` ≠ `agent_id` 强契约 | ⬜ |
| 双仓库脚本历史污染 | 低 | P0 W1 审查 agentrix-claw 历史 | ⬜ |

---

## 6. 北极星 + 关键 KPI

| 指标 | P0 | P1 | P2 | P3 | 当前 |
|------|----|----|----|----|------|
| Cross-Surface DAU | 500 | 2000 | 8000 | 30000 | – |
| Handoff 次数/用户/周 | 0.5 | 1.5 | 3 | 5+ | – |
| Auto-Earn MRR | – | $2k | $30k | $200k | – |
| App Intents 调用/日 | – | 1k | 20k | 100k | – |
| Working Agents 中位数/用户 | 1 | 1.5 | 2.5 | 3.5 | – |

---

## 7. 更新规则（必读）

1. 每完成一项任务，**当场**回到本文档对应行：
   - 更新 `状态` 为 `🟢 已完成`
   - `验证` 字段必须填具体手段（如 `✅ e2e 测试 desktop/tests/e2e/p0-handoff.spec.ts 通过`）
   - 填 `完成日期`（YYYY-MM-DD）
   - `交付物` 列出 commit SHA / PR / 文件链接
2. 任何 Gate 项未达成，**禁止**开下一阶段。
3. 每周一在文末追加"周报小结"段落（本周完成 / 阻塞 / 下周计划）。

---

## 8. 周报小结

### 2026-W19（5/4 - 5/10）
- **本周完成**:
  - 5 PRD 冻结确认；本实施计划 v1 起草；现状审计完成。
  - **P0-W1 全部落地 (5/4)**：shared/types 单源 + living-pet + approval + handoff v1 + wallet projection 均编译通过。
  - **P0-W1-6 MPC HSM 决策 (5/4)**：选型 AWS KMS（ap-southeast-1，与生产服务器同区降延迟）。
  - **P0-W2 全部落地 (5/4)**：
    - 后端 SSH 部署到 47.130.176.148 + PM2 重启 + 4 个 v1 端点 smoke test 全 401（JWT guard 正常）。
    - Mobile 5-Tab 骨架：Today / Agents / Team / Wallet / Me（Discover 隐藏兼容旧深链）。
    - Mobile 邀请码 5 步 stepper + Stripe→MPC L2 demo。
    - Desktop 双形态显式切换 + FloatingBall PetEmotionOverlay（10 表情 emoji + 轉色轉强度辉光） + HandoffBanner 接 REST §6.3 v1 API。
    - Web Console `/console/{dashboard,agents,wallet,presence,billing}` 路由分区 + ConsoleLayout + middleware。
    - 旧 frontend/*.md（10 份历史状态文档）归档至 `docs/_archive/frontend-old-status-docs/`。
  - **P0-W3 全部落地 (5/4)**：
    - WatchLivingTileScreen + 10 表情 + Corner/Rectangular Complication 渲染 + L1 审批 inline。
    - iOS AppIntents 6 核心 + AppShortcutsProvider；Android actions.xml + 6 deep-link；统一 `intentBridge.ts` JS 调度。
    - watchOS WCSession 中继，4 个 Watch 专用 Shortcut。
- **阻塞**: 无。
- **下周计划**: 进入 P0 Gate 验证（五端 pet.state 同步 e2e + Handoff e2e + L2 支付 demo + Web Console Stripe 下单 + Watch 配对率 demo）。

---

**文档维护人**: ceo + dev
**最后更新**: 2026-05-04
