# Agentrix 移动端产品需求文档 (PRD)

> **版本**: v1.0  
> **日期**: 2026-04-03  
> **状态**: 规划中  
> **整体完成度**: ~72%

---

## 1. 产品概述

Agentrix 移动端是 AI Agent 经济平台的核心入口，支持用户通过手机管理 AI Agent、进行语音/文字交互、参与 Agent 经济活动（任务市场、技能市场、拆分计划）、管理团队协作和社交展示。

**技术栈**: React Native (Expo SDK 54) · 双仓库架构  
- `Agentrix-website/src/` — 共享代码（screens/services/stores/navigation）  
- `Agentrix-Claw` — 移动端独有代码（原生模块、入口配置）

---

## 2. 当前架构

```
RootNavigator
├── AuthNavigator (Login → AuthCallback → WalletConnect → InvitationGate)
├── OnboardingNavigator (DeploySelect → Cloud/Local/Existing → SocialBind)
└── DrawerNavigator + GlobalFloatingBall
    └── MainTabNavigator (4 tabs)
        ├── Agent 💬 (22 screens) — 核心 AI 交互
        ├── Discover 🔍 (14 screens) — 市场发现
        ├── Team 👥 (8 screens) — 团队协作
        └── Me 👤 (10 screens) — 个人中心
```

**数据层**: 6 个 Zustand Store + 42 个 API Service + MMKV 持久化  
**后端**: 85+ NestJS Module · TypeORM · PostgreSQL

---

## 3. 各模块完成度评估

### 3.1 Chat & AI 核心 (85% ✅)

| 功能 | 状态 | 说明 |
|------|------|------|
| 文字聊天 | ✅ 完成 | SSE 双通道 (`/openclaw/proxy/:id/stream` + `/claude/chat`) |
| 语音聊天 | ✅ 完成 | WebSocket 实时流、VAD、唤醒词、可穿戴设备支持 |
| 多模型切换 | ✅ 完成 | settingsStore 支持模型选择 |
| 工具调用 | ✅ 完成 | MCP 工具注册表，工具结果渲染 |
| 错误边界 | ✅ 完成 | ScreenErrorBoundary 包裹关键屏幕 |
| 附件上传 | ✅ 完成 | chat-attachment API |
| **待优化** | ⚠️ | 流式消息自动压缩（参考 Claude Code harness） |
| **待优化** | ⚠️ | Chat context window 管理 |

### 3.2 Agent 管理 (85% ✅)

| 功能 | 状态 | 说明 |
|------|------|------|
| Agent 账户 CRUD | ✅ 完成 | AgentAccountScreen 完整 |
| 统一 Agent 视图 | ✅ 完成 | `/agents/unified` 端点，Instance + Account 1:1 |
| Agent 部署 | ✅ 完成 | 云端/本地/已有实例 3 种路径 |
| 权限管理 | ✅ 完成 | AgentPermissionsScreen |
| 工具管理 | ✅ 完成 | AgentToolsScreen |
| Agent 日志 | ✅ 完成 | AgentLogsScreen |
| 工作流 | ✅ 完成 | WorkflowList + WorkflowDetail |
| 桌面控制 | ✅ 完成 | DesktopControlScreen |
| **待修复** | 🔴 | Balance API 响应未正确解包 `{success, data}` (已修复) |
| **待补充** | ⚠️ | Agent 性能分析仪表盘 |

### 3.3 团队协作 (65% ⚠️)

| 功能 | 状态 | 说明 |
|------|------|------|
| 团队仪表盘 | ✅ 完成 | 审批列表 + Agent 列表 + 团队模板 |
| 审批流程 | ✅ 完成 | ApprovalCard + 一键审批/拒绝 |
| 团队空间 | ✅ 完成 | TeamSpaceScreen 管理 |
| 任务看板 | ✅ 完成 | TaskBoardScreen 创建/分配/完成 |
| 任务详情 | ✅ 完成 | TaskDetailScreen 含 Agent 对话 |
| Agent 画像 | ✅ 完成 | AgentProfileScreen 含状态/聊天/任务 |
| **已修复** | 🔴 | ~~任务启动"任务不存在"~~ → 后端 `acceptTask` 已增加 userId 回退查询 |
| **待补充** | 🔴 | A2A 协议 UI — Agent↔Agent 任务委托可视化 |
| **待补充** | ⚠️ | 团队成员权限管理 UI |
| **待补充** | ⚠️ | 团队 OKR/进度总览 |

### 3.4 市场/商业 (70% ⚠️)

| 功能 | 状态 | 说明 |
|------|------|------|
| 技能市场浏览 | ✅ 完成 | ClawMarketplaceScreen + 分类/搜索 |
| 技能详情 | ✅ 完成 | ClawSkillDetailScreen |
| 技能安装 | ✅ 完成 | SkillInstallScreen |
| 结账流程 | ✅ 完成 | CheckoutScreen (含 QR 扫码支付) |
| 任务市场 | ✅ 完成 | TaskMarketScreen + PostTaskScreen |
| 佣金预览 | ✅ 完成 | CommissionPreviewScreen |
| 订单管理 | ✅ 完成 | MyOrdersScreen |
| **待补充** | 🔴 | 拆分计划 (Split Plans) UI — 后端已完成 |
| **待补充** | 🔴 | 预算池 (Budget Pools) 可视化 — 后端已完成 |
| **待补充** | ⚠️ | 技能上传/发布 UI |
| **待补充** | ⚠️ | Auto-Earn 仪表盘 |

### 3.5 钱包/金融 (60% ⚠️)

| 功能 | 状态 | 说明 |
|------|------|------|
| MPC 钱包创建 | ✅ 完成 | 分片 A/C 存储 + 恢复码 |
| WalletConnect | ✅ 完成 | WalletConnectScreen |
| 钱包备份 | ✅ 完成 | WalletBackupScreen |
| Agent 余额查看 | ✅ 完成 | AgentBalanceScreen + BalanceBadge |
| 链上身份注册 | ✅ 完成 | ChainIdentityBadge |
| 推荐人仪表盘 | ✅ 完成 | ReferralDashboardScreen |
| **待补充** | 🔴 | 支出分析仪表盘 |
| **待补充** | 🔴 | Token 配额用量可视化 |
| **待补充** | ⚠️ | 充值/提现流程 |
| **待补充** | ⚠️ | 交易历史筛选增强 |

### 3.6 社交/展示 (55% ⚠️)

| 功能 | 状态 | 说明 |
|------|------|------|
| Feed 浏览 | ✅ 完成 | FeedScreen + PostDetailScreen |
| 分享卡片 | ✅ 完成 | ShareCardScreen (Twitter/Discord) |
| 社交监听 | ✅ 完成 | SocialListenerScreen (X/Discord 桥) |
| **待补充** | 🔴 | 发帖创作 UI 完善 |
| **待补充** | 🔴 | 私信/DM 完整流程 |
| **待补充** | ⚠️ | Agent 展示页 (公开 Profile) |
| **待补充** | ⚠️ | 社交互动 (点赞/评论/转发) |

### 3.7 设置 (80% ✅)

| 功能 | 状态 | 说明 |
|------|------|------|
| 多语言 (EN/ZH) | ✅ 完成 | i18nStore |
| 语音设置 | ✅ 完成 | ClawSettingsScreen |
| API Key 管理 | ✅ 完成 | ApiKeysScreen (多 AI 供应商) |
| 账户管理 | ✅ 完成 | AccountScreen |
| **待补充** | ⚠️ | 主题/暗黑模式切换 |
| **待补充** | ⚠️ | 通知偏好设置 |

### 3.8 可穿戴设备 (75% ✅)

| 功能 | 状态 | 说明 |
|------|------|------|
| 设备发现 & 连接 | ✅ 完成 | WearableHubScreen |
| 设备监控 | ✅ 完成 | WearableMonitorScreen |
| 语音交互 | ✅ 完成 | wearableVoice.service |
| **待补充** | ⚠️ | 完整遥测数据展示 |
| **待补充** | ⚠️ | 设备设置定制 |

---

## 4. 已修复问题 (本次)

### Bug 1: Agent 账户页面崩溃 🔴→✅

**现象**: 在团队标签点击任意 Agent 账户时崩溃，报错 `Cannot read property 'amount' of undefined`

**根因**: `fetchAgentBalance()` 和 `fetchOnchainStatus()` 直接返回 `apiFetch` 的结果，但后端返回 `{ success: true, data: { platformBalance: ... } }` 包装格式。未解包 `.data`，导致 `balance.platformBalance` 为 `undefined`。

**修复文件**:
- `src/screens/agent/AgentAccountScreen.tsx` — `fetchAgentBalance` 和 `fetchOnchainStatus` 增加 `.data` 解包
- `src/screens/agent/AgentBalanceScreen.tsx` — `fetchBalance` 增加 `.data` 解包

### Bug 2: 团队任务启动"任务不存在" 🔴→✅

**现象**: 在团队中给 Agent 分配任务后点击"启动任务"，提示"任务不存在"

**根因**: 
1. `createTask()` 前端未传 `merchantId`，导致任务的 `merchantId` 为 `undefined`（已修复：默认使用 `userId`）
2. `acceptTask()` 和 `updateTaskProgress()` 仅按 `{ id, merchantId }` 查询，当用户自己创建的任务 `merchantId` 不匹配时报错（已修复：增加 `userId` 回退查询）

**修复文件**:
- `backend/src/modules/merchant-task/merchant-task.service.ts` 
  - `createTask`: `merchantId` 默认使用 `userId`
  - `acceptTask`: 增加按 `userId` 的回退查询
  - `updateTaskProgress`: 增加按 `userId` 的回退查询
  - `completeTask`: 增加按 `userId` 的回退查询

---

## 5. 优先级规划 (P0~P3)

### P0 — 紧急修复 (本次已完成)
- [x] Agent 账户页面崩溃修复
- [x] 团队任务启动失败修复
- [ ] 部署到生产环境验证

### P1 — 高优先级 (下一个 Sprint)

| 需求 | 工作量 | 说明 |
|------|--------|------|
| 拆分计划 (Split Plans) UI | 3-5d | 后端已完成，需要前端展示和交互 |
| 预算池 (Budget Pools) UI | 3-5d | 后端已完成，需金额/用量可视化 |
| A2A 任务委托 UI | 5-8d | Agent↔Agent 任务流可视化，使用 `/api/a2a/tasks/*` 端点 |
| 移动端仓库 Team Tab 同步 | 1-2d | Agentrix-Claw 的 MainTabNavigator 缺少 Team Tab |
| Token 配额用量仪表盘 | 2-3d | 用量条/饼图 + 告警 |

### P2 — 中优先级 (1~2 个 Sprint)

| 需求 | 工作量 | 说明 |
|------|--------|------|
| Agent 性能分析 | 5d | 后端 analytics 模块数据图表化 |
| 支出分析仪表盘 | 3d | 按日/月/Agent 的支出分析 |
| 技能上传/发布 | 5d | MCP 技能打包上传流程 |
| 社交发帖增强 | 3d | 富文本编辑 + 图片 + 跨平台发布 |
| 私信 DM 完整流程 | 5d | 消息持久化 + 分页 + 通知 |
| Auto-Earn 仪表盘 | 3d | 策略管理 + 收益追踪 |
| 充值/提现流程 | 5d | 法币/加密入金/出金 |
| Chat 自动压缩 | 3d | 参考 Claude Code harness 的上下文管理 |

### P3 — 低优先级 (规划中)

| 需求 | 工作量 | 说明 |
|------|--------|------|
| Agent 公开 Profile 页 | 3d | 独立可分享页面 |
| 社交互动 (点赞/评论) | 3d | Feed 功能完善 |
| 暗黑/浅色主题切换 | 2d | 当前仅暗色主题 |
| 通知偏好设置 | 2d | 精细化通知控制 |
| 可穿戴完整遥测 | 3d | 心率/运动/环境传感器 |
| 离线模式增强 | 5d | 消息队列 + 本地缓存 |
| 跨平台会话同步 | 3d | 手机↔桌面上下文无缝衔接 |

---

## 6. 移动端仓库同步清单

以下是 `Agentrix-Claw` 移动端仓库需要与 `Agentrix-website/src/` 共享代码库同步的关键差异：

| 项目 | 当前状态 | 需要同步 |
|------|----------|----------|
| MainTabNavigator | ❌ 仅 3 tabs (缺 Team) | 增加 Team Tab + TeamStackNavigator |
| types.ts | ❌ 缺 TeamStackParamList | 添加 Team 相关导航类型 |
| TeamDashboardScreen | ❌ 不存在 | 从共享代码同步 |
| TaskBoardScreen | ❌ 不存在 | 从共享代码同步 |
| TaskDetailScreen (Team) | ❌ 不存在 | 从共享代码同步 |
| AgentProfileScreen | ❌ 不存在 | 从共享代码同步 |
| unifiedAgent.ts | ❌ 可能过期 | 确保使用 `/agents/unified` |
| notificationStore.ts | ❌ 缺 approvalCount | 同步审批计数逻辑 |

---

## 7. 技术债务 & 架构优化

| 项目 | 优先级 | 说明 |
|------|--------|------|
| API 响应解包统一化 | 🔴 高 | 统一处理 `{success, data}` 包装格式，避免再次出现类似 Bug 1 |
| 导航类型安全 | 🟡 中 | AgentAccountScreen 在 Team 上下文中使用 AgentStackParamList 导航类型不匹配 |
| Service 层缓存策略 | 🟡 中 | 统一 react-query staleTime/retry 配置 |
| 组件错误边界覆盖 | 🟡 中 | 更多屏幕添加 ScreenErrorBoundary |
| E2E 测试覆盖 | 🟡 中 | 关键路径 (Agent创建→余额查看→任务创建→启动) 自动化测试 |
| 性能监控 | 🔵 低 | 页面加载时间 / API 延迟跟踪 |

---

## 8. 成功指标

| 指标 | 目标 |
|------|------|
| 崩溃率 | < 0.5% |
| 冷启动时间 | < 3s |
| 核心路径完成率 | Agent 创建→聊天→任务分配 > 95% |
| 用户评分 | App Store 4.5+ |
| 功能完成度 | P1 全部完成后达 85%+ |

---

## 附录: 文件结构索引

```
src/
├── navigation/           # 导航配置
│   ├── RootNavigator.tsx
│   ├── MainTabNavigator.tsx (4 tabs)
│   ├── AgentStackNavigator.tsx
│   ├── DiscoverStackNavigator.tsx
│   ├── TeamStackNavigator.tsx
│   ├── MeStackNavigator.tsx
│   └── types.ts
├── screens/              # 96 个功能屏幕
│   ├── agent/            # Agent 管理 (22)
│   ├── team/             # 团队协作 (4+4 共享)
│   ├── market/           # 市场发现 (14)
│   ├── me/               # 个人中心 (10)
│   └── auth/             # 登录/注册 (8)
├── services/             # 42 个 API 服务
├── stores/               # 6 个 Zustand Store
├── theme/                # 主题配置
└── components/           # 共享组件
```
