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
| P0-W1-6 | MPC HSM 选型决策（推荐 AWS KMS Singapore） | ceo + dev | ⬜ | ❌ | – | – |

#### W2 · 移动 + 桌面骨架

| # | 任务 | 责任 | 状态 | 验证 | 完成日期 | 交付物 |
|---|-----|------|-----|------|---------|--------|
| P0-W2-1 | Mobile 三形态骨架 + 5-Tab Bar 重构 | dev | ⬜ | ❌ | – | – |
| P0-W2-2 | Mobile 邀请码 5 步 stepper | dev | ⬜ | ❌ | – | – |
| P0-W2-3 | Mobile Stripe → MPC L2 单笔支付 demo | dev | ⬜ | ❌ | – | – |
| P0-W2-4 | Desktop 双形态显式切换（Cmd+Space / Cmd+Shift+Space） | dev | ⬜ | ❌ | – | – |
| P0-W2-5 | Desktop FloatingBall 接入 §3.4 状态机 | dev | ⬜ | ❌ | – | – |
| P0-W2-6 | Desktop HandoffBanner 走新 API | dev | ⬜ | ❌ | – | – |
| P0-W2-7 | Web Console `/console/**` 路由分区 + 登录/Agent 总览/Presence v3/Wallet read-only/Stripe | dev | ⬜ | ❌ | – | – |
| P0-W2-8 | 旧 frontend/*.md 归档至 `docs/_archive/frontend-old-status-docs/` | brand | ⬜ | ❌ | – | – |

#### W3 · Watch + 系统助手骨架

| # | 任务 | 责任 | 状态 | 验证 | 完成日期 | 交付物 |
|---|-----|------|-----|------|---------|--------|
| P0-W3-1 | Watch Living Tile + 6 表情 + Complication（Corner + Rectangular） + L1 审批 | dev | ⬜ | ❌ | – | – |
| P0-W3-2 | iOS App Intents 6 核心（ask-aira / draft / approve / wallet-status / invoke-agent / pet-mood） | dev | ⬜ | ❌ | – | – |
| P0-W3-3 | Android App Actions 等价 6 个 | dev | ⬜ | ❌ | – | – |
| P0-W3-4 | iOS Watch Shortcut 贯通手机 Aira | dev | ⬜ | ❌ | – | – |

#### ✅ P0 Gate（必须 100% 通过才进 P1）

- [ ] 5 端拉到同一份 `pet.state`，6 表情切换 < 1s 同步
- [ ] Desktop ↔ Mobile Handoff（接力/镜像/忽略）端到端通
- [ ] L1 审批 Mobile/Desktop/Watch 完成；L2 单笔支付 demo（MPC + 生物认证）通过
- [ ] Web Console 登录 → Agent 总览 → Stripe 下单
- [ ] iOS App Intents / Android App Actions 6 核心通过 TestFlight + Internal Testing
- [ ] shared types 单源被 5 端 import 编译通过
- [ ] Watch 配对率 demo 50%+

---

### 3.2 P1 · Pro Mode 升级 + 系统助手联动（W4-W7 · 4 周）

| # | 任务 | 责任 | 状态 | 验证 | 完成日期 |
|---|-----|------|-----|------|---------|
| P1-1 | Desktop Multi-Agent Worktree | dev | ⬜ | ❌ | – |
| P1-2 | Desktop Composer Diff 增强 | dev | ⬜ | ❌ | – |
| P1-3 | Desktop Memories 接 §5.5 4 层 | dev | ⬜ | ❌ | – |
| P1-4 | Mobile Plan-Approval 闭环 | dev | ⬜ | ❌ | – |
| P1-5 | Mobile Live Activity (iOS) + 灵动岛 | dev | ⬜ | ❌ | – |
| P1-6 | Mobile Siri Shortcut 模板包 + 反向调用 5 个系统操作 | dev | ⬜ | ❌ | – |
| P1-7 | Gemini Extension 申请 | growth | ⬜ | ❌ | – |
| P1-8 | Web Console 团队/企业后台 + SplitPlan UI + BudgetPool UI + 钱包台账 + 合规审计 | dev | ⬜ | ❌ | – |
| P1-9 | 后端 Vitals Bus + Living Agent 反应器 | dev | ⬜ | ❌ | – |
| P1-10 | 后端 Memory 4 层 API 标准化 | dev | ⬜ | ❌ | – |
| P1-11 | Watch Phase 2（独立 app + 全屏对话 + L2 推回） | dev | ⬜ | ❌ | – |

#### ✅ P1 Gate
- [ ] Desktop 5 worktree 并行 + Composer 一次性多文件提交
- [ ] Mobile Plan-Approval 端到端（plan→Push→审批→执行）
- [ ] Vitals HR > 100 → 主宠 concerned 全端同步 < 3s
- [ ] Web SplitPlan 创建 + commission V4 实际分账
- [ ] Watch L2 抬腕签名 demo 通过
- [ ] Siri Shortcut "早安简报" 联合工作流跑通

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
| MPC HSM 选型未定 | 高 | P0 W1 必须冻结 | ⬜ |
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
- **本周完成**: 5 PRD 冻结确认；本实施计划 v1 起草；现状审计完成。
  - **P0-W1 背面架构全部落地 (5/4)**：shared/types 单源 + living-pet + approval + handoff v1 + wallet projection 均编译通过。
- **阻塞**: MPC HSM 选型待 ceo 确认。
- **下周计划**: 启动 P0-W2（Mobile 三形态与五 Tab 重构 + Desktop 双形态切换 + Web Console 路由分区 + 后端 SSH 部署验证 v1 API）。

---

**文档维护人**: ceo + dev
**最后更新**: 2026-05-04
