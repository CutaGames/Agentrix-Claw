# Agentrix 前后端与全端侧代码审计、体验优化与护城河战略报告

**日期**: 2026-05-01  
**范围**: `backend/`、`frontend/`、根目录 Expo Mobile、`desktop/`、`src/watch/`、`src/services/wearables/`、`contract/contracts/`、`.github/workflows/`、既有 PRD/Release 文档  
**生产上下文**: Web 前端与后端共用同一套后端，部署在新加坡服务器 `47.130.176.148`，域名 `agentrix.top` / `api.agentrix.top`。新用户 Cloud OpenClaw 后续也规划在该服务器配置。  
**安全说明**: 本报告不会记录或复述任何 PAT、私钥、token、PEM 内容。你在对话中粘贴过 GitHub PAT，建议立即在 GitHub 轮换并废弃旧 token。

---

## 0. 审计边界与方法

### 0.1 本次做了什么

- **静态代码审计**: 抽样读取核心入口、服务层、控制器、API client、端侧 bridge、支付页、同步服务、文档和 CI 配置。
- **结构扫描**: 统计核心目录规模，确认仓库为多端一体化结构。
- **风险扫描**: 检查 GitHub PAT 模式、PEM 文件、默认 secret、CORS、Swagger、限流、JWT、TypeORM 持久化等关键风险面。
- **既有报告交叉验证**: 对比 `PRD_V2_COMPREHENSIVE.md`、`CROSS_PLATFORM_LAUNCH_AUDIT.zh-CN.md`、`RELEASE_READINESS_DESKTOP_MOBILE_WEARABLE_20260426.md`，修正其中已过期结论。

### 0.2 本次没有做什么

- **未 SSH 登录生产服务器**，未使用 `hq.pem`，未对 `47.130.176.148` 执行部署或线上命令。
- **未使用 GitHub PAT**，未 push、未触发 CI/CD、未发布移动端 build。
- **未跑完整测试套件**，只做静态审计与只读命令；完成度判断基于代码证据与现有报告中的测试记录。
- **未审计密钥内容本身**，只识别敏感文件/敏感字符串位置与治理风险。

---

## 1. 一句话结论

Agentrix 已经从“移动端 + Web 支付协议原型”演进为**共享后端 + 多端 Agent Runtime + 跨设备 Presence + Wear OS/AI 眼镜桥接雏形 + OpenClaw 云端代理**的复杂平台。当前最大机会不是继续堆功能，而是把现有能力收敛成一个清晰闭环：

> **同一个 Agent，跨 Web / Mobile / Desktop / Wear OS / AI Glasses 保持同一身份、同一记忆、同一权限、同一支付能力，并可被安全审计和可控执行。**

现阶段建议战略重心：

1. **先修安全与发布基础**: 轮换泄露 PAT、移除仓库内 token 脚本、隔离 PEM、统一 secret 管理、生产 API 文档访问控制、Redis 限流。
2. **再收敛跨端体验**: 把 Agent Presence / Desktop Sync / Wearable Telemetry / OpenClaw Session 统一成 `Unified Agent Session`。
3. **最后放大差异化**: 以“跨设备 Agent OS + 端侧感知 + 可穿戴/眼镜 + MPC 支付 + Skill 市场”为护城河，而不是只做另一个聊天 App 或 IDE 插件。

---

## 2. 当前代码结构与真实实现状态

### 2.1 代码规模快照

| 目录 | 角色 | 文件数/代码文件数 | 观察 |
| --- | --- | ---: | --- |
| `backend/src/modules` | NestJS 统一后端 | 775 / 761 | 模块非常多，已覆盖 Auth、Payment、OpenClaw、Agent Presence、Desktop Sync、Wearable Telemetry 等 |
| `src` | Expo Mobile + Watch 共享代码 | 259 / 258 | 根目录就是移动端，不是 `mobile-app/` 子目录；含 Agent、Voice、Wearables、Watch |
| `frontend/pages` | Next.js 页面 | 100 / 99 | 官网、控制台、Admin、Checkout、Agent Builder 等 |
| `frontend/components` | Web 组件 | 236 / 234 | 支付、钱包、Agent Presence、营销、Agent Studio 组件完整度较高 |
| `desktop/src` | Tauri Desktop 前端 | 97 / 94 | ChatPanel、CrossDevice、Memory、MCP、Proactive、Diff、Workspace 等功能密集 |
| `contract/contracts` | Solidity 合约 | 12 / 12 | Commission、CommissionV2、PaymentRouter、X402、AutoPay、BudgetPool 等 |
| `docs` | 产品/审计文档 | 92 | PRD 和 release readiness 较多，但部分结论已被后续实现超越 |

### 2.2 最新状态相对旧审计的关键修正

旧报告中若干结论已经过期：

- **Desktop Sync 不再是全内存 Map**: `backend/src/modules/desktop-sync/desktop-sync.service.ts` 已使用 `TypeORM Repository` 持久化 `DesktopDevicePresence`、`DesktopSession`、`DesktopTask`、`DesktopApproval`、`DesktopCommand` 等实体。旧的“服务重启全部丢失”结论需要更新为“已持久化，但仍需验证迁移、索引、保留策略和 Redis 实时层”。
- **Wearable 已不再只是 PRD**: `src/services/wearables/` 已有 BLE、Data Collector、Automation Engine、Telemetry Sync、Glass Audio/Image/HUD/Gesture/Auth/Session Bridge；`src/watch/` 已有 Wear OS Watch App 入口和屏幕；后端 `wearable-telemetry` 已有 JWT 控制器、遥测落库、规则触发。
- **Web 已有 Agent Presence Dashboard**: `frontend/components/agent/AgentPresenceDashboard.tsx` 已调用 `agentPresenceApi` 拉取 Agent、timeline、channel health、devices、approvals，不再是完全缺失状态。
- **支付并非全空壳**: Web guest checkout / Stripe PaymentIntent 路径存在，`frontend/pages/api/checkout/create-intent.ts` 代理后端 `/api/payment/guest-intent`；`StripePayment.tsx` 支持 Payment Request / Card / 3DS 逻辑。但 WalletConnect、多签、X402、Passkey 的真实生产闭环仍需专项验证。

---

## 3. 综合完成度评估

> 评分为本次静态审计估算，不等于上线验收。上线前必须补真实设备、真实账号、生产环境、合约审计与 E2E 测试。

| 模块 | 当前完成度 | 上次/旧印象 | 本次判断 |
| --- | ---: | ---: | --- |
| 后端 Backend | **88%** | 85%-88% | 模块完整度高，Presence/Sync/Wearable 已增强；风险在安全治理、模块复杂度、生产可观测性 |
| 移动端 Mobile | **84%** | 78%-82% | 登录、OpenClaw、Agent、Voice、Local AI、Wearable 入口较完整；需要真实设备与长链路验证 |
| 桌面端 Desktop | **84%** | 72%-80% | Tauri 2 功能密集，ChatPanel 已拆分部分子组件，支持多 tab/本地模型/工具/同步；仍需生产签名与权限策略 |
| Web 前端 | **72%** | 65% | API client 和部分支付/Presence 已落地；Admin/支付高级路径/运营数据仍需真实数据闭环 |
| Wear OS / 可穿戴 | **68%** | 15%-50% | Wear OS 代码、Data Layer bridge、后端 telemetry 已具备；缺真机 Wear E2E 和 release 包治理 |
| AI 眼镜 | **45%** | PRD 阶段 | 已有 bridge/service skeleton；缺目标设备 SDK、vendor-specific GATT、真实音视频链路 |
| Smart Contracts | **65%** | 50%-75% | 合约目录完整；缺最新第三方审计、主网部署、测试覆盖确认 |
| 跨端同步 / Agent Presence | **74%** | 35%-55% | Presence Phases 1-5、Desktop Sync 持久化、Unified Device API 存在；缺统一 UX 和跨端真实场景闭环 |
| 安全/合规/运维 | **55%** | 50%-60% | 基础 Helmet/JWT/Validation/RateLimit 存在，但凭证泄露风险、默认 secret fallback、生产文档和限流需要加固 |
| 总体上线准备度 | **76%** | 63%-68% | 代码功能已明显前进；短板从“没实现”转为“安全、真实设备、发布、观测、商业闭环” |

---

## 4. 后端 Backend 审计

### 4.1 架构现状

后端是 NestJS 10 + TypeORM + PostgreSQL 的统一 API 层，所有端侧共享：

- **用户与认证**: `AuthModule`、JWT、OAuth、Wallet login、Email OTP、Admin auth。
- **Agent Runtime**: `OpenClawProxyModule`、`AgentPresenceModule`、`AgentIntelligenceModule`、`LlmRouterModule`、`ToolRegistryModule`、`QueryEngineModule`。
- **支付与商业**: `PaymentModule`、`AutoPayModule`、`CommissionModule`、`CommerceModule`、`UnifiedMarketplaceModule`、`MPCWalletModule`、`AccountAbstractionModule`。
- **跨端**: `DesktopSyncModule`、`AgentPresenceModule`、`WearableTelemetryModule`、`WebSocketModule`。
- **运维与增长**: `AdminModule`、`HqModule`、`InvitationModule`、`SocialModule`、`MessagingModule`、`OperationsControlPlaneModule`。

`AppModule` 引入模块超过 80 个，说明平台能力丰富，但也带来启动复杂度、依赖环、测试隔离和部署变更风险。

### 4.2 已完成的关键能力

- **统一后端入口**: `backend/src/main.ts` 配置全局 `api` prefix、ValidationPipe、HttpExceptionFilter、LoggingInterceptor、Helmet、CORS、Swagger。
- **OpenClaw 统一聊天路径**: `openclaw-proxy.controller.ts` 提供默认实例 chat/stream、指定实例 chat/stream、skills、platform tools、local messages sync。
- **Agent Presence**: `agent-presence.controller.ts` 覆盖 Agent CRUD、channel binding、timeline、memory、share policy、approval、handoff、device、dashboard。
- **Desktop Sync 已持久化**: `desktop-sync.service.ts` 使用 TypeORM repository，已不再是纯 Map。
- **Wearable Telemetry 已落库**: `wearable-telemetry.service.ts` 保存 telemetry samples、rules、trigger events；controller 使用 `JwtAuthGuard`。
- **安全基础**: JWT 生产启动时校验、Helmet、CORS 白名单、request-id、全局 DTO whitelist、基础 rate limit。

### 4.3 P0 风险

#### 4.3.1 凭证与敏感文件治理

审计发现：

- 工作区根目录存在 `hq.pem` 与 `agentrix-ssh.pem`。
- 多个脚本文件存在 GitHub PAT 模式匹配，包括 `_push_watch_to_claw*.ps1`、`_set_secret.js`、`_trigger_watch.ps1`、`scripts/deploy/deploy_sg_frontend.sh` 等。
- `git ls-files` 未显示 `.pem` 已被跟踪，但根目录明文 PEM 本身仍然是高风险操作习惯。
- 用户在对话中粘贴了 GitHub PAT，必须视为泄露。

**建议**:

1. 立即轮换 GitHub PAT，删除旧 token 权限。
2. 清理脚本中的 PAT，改用 GitHub Actions Secrets、服务器环境变量或本地 credential manager。
3. 将 PEM 移出仓库目录，例如放到用户主目录安全位置，并限制权限。
4. 增加 pre-commit / CI secret scanning，例如 `gitleaks` 或 GitHub secret scanning。
5. 对 GitHub PAT 模式历史提交做一次 GitHub secret scanning，如果已进入历史，按泄露处理而不是仅删除当前文件。

#### 4.3.2 默认 secret fallback

代码中多个模块仍有默认 fallback：

- `JWT_SECRET` fallback: `default-secret`、`agentrix-secret`、`your-secret-key`。
- `SESSION_SECRET` fallback: `agentrix-secret-key-2025`。
- `DatabaseConfig` 中有默认数据库密码字符串。

`main.ts` 生产启动会阻止部分弱 secret，但模块内部 fallback 仍建议统一清除。

**建议**:

- 建立 `ConfigValidationModule`，用 Zod/Joi 在启动时强校验所有生产必填 env。
- 禁止所有生产环境 fallback secret。
- Swagger、Admin、HQ、OpenClaw provisioning 相关 env 分级管理。

#### 4.3.3 生产 API 文档与 Admin 暴露

`SwaggerModule.setup('api/docs')` 默认可用。生产环境若开放到公网，可能暴露接口面。

**建议**:

- 生产环境默认关闭 Swagger，或加 Basic Auth / IP allowlist。
- Admin 路由使用独立域名、独立 cookie/session、MFA、审计日志。
- HQ 后台 `main-hq.ts` 中 `origin: true` 的 CORS 仅可用于开发，生产需要白名单。

### 4.4 P1 架构风险

#### 4.4.1 AppModule 过大

`AppModule` 单点引入过多模块，功能扩张后容易产生：

- 编译慢、启动慢。
- 任一模块异常影响整个后端。
- 很难按业务域拆分部署。
- 测试上下文过重。

**建议分层**:

- `CoreApiAppModule`: Auth/User/Agent/Payment/OpenClaw。
- `RealtimeAppModule`: WebSocket/Voice/Presence。
- `OpsAppModule`: Admin/HQ/Operations。
- `WorkerAppModule`: Cron/Scheduler/Indexing/Dreaming。
- `ProvisioningAppModule`: Cloud OpenClaw 创建、健康检查、资源回收。

#### 4.4.2 限流仍是进程内 Map

`RateLimitGuard` 使用进程内 `Map`，多实例部署、PM2 cluster 或重启都会失效。

**建议**:

- 改 Redis token bucket。
- 区分匿名、登录、chat、upload、payment、admin 的 rate limit。
- 对 `/openclaw/proxy/*/stream`、`/voice/*`、`/wearable-telemetry/upload` 单独设限。

#### 4.4.3 Cloud OpenClaw 单服务器资源风险

新用户 Cloud OpenClaw 规划在 `47.130.176.148` 上配置，会带来：

- CPU/内存/磁盘竞争。
- 用户实例隔离不足。
- 无 idle suspend 导致成本不可控。
- 失败实例占用资源。
- 单点故障影响所有新用户。

**建议 MVP 级方案**:

- 每个 OpenClaw instance 使用 Docker/container 隔离。
- 增加 `instance_quota`、idle timeout、health probe、auto-restart、log retention。
- Provisioning 队列化，避免瞬时创建压垮服务器。
- 在后端建立 `OpenClawInstanceRuntime` 状态表，记录 port、container id、health、lastActiveAt、cost。

---

## 5. 移动端 Mobile 审计

### 5.1 架构现状

根目录为 Expo SDK 54 + React Native 0.81 移动端：

- `App.tsx`: 初始化 auth、push、OpenClaw instances、wake word、llama bridge、watch data layer。
- `src/services/auth.ts`: backend-mediated OAuth、wallet/email/OpenClaw binding、MPC wallet 自动创建。
- `src/services/api.ts`: 统一 `apiFetch`，SecureStore token，upload attachment，local conversation sync。
- `src/services/*voice*`: realtime voice、local whisper、wake word、audio queue。
- `src/services/wearables/*`: BLE、Wear OS、AI glasses bridge。
- `src/screens/agent/AgentChatScreen.tsx`: 主 Agent 对话屏，约 4097 行。

### 5.2 已完成能力

- **生产 API 配置**: `src/config/env.ts` 指向 `https://api.agentrix.top/api`，移动端 release 默认生产。
- **OAuth 登录链路**: `AuthSession.makeRedirectUri` + backend-mediated OAuth，避免 Expo Go / standalone callback 不一致。
- **SecureStore token**: `api.ts` 使用 `expo-secure-store` 存储主 token。
- **MPC Wallet 方向正确**: 登录后异步 `ensureMPCWallet`，符合自建 MPC 策略。
- **本地 AI**: `llama.rn`、`whisper.rn`、wake word、OTA model download、local tool calling 已有实现线索。
- **Wearable 集成**: BLE pairing、telemetry upload、Watch Data Layer、Glass bridge 已在代码中出现。

### 5.3 UX 问题

#### 5.3.1 AgentChatScreen 仍过大

`src/screens/agent/AgentChatScreen.tsx` 约 4097 行，承担 SSE、本地推理、语音、附件、工具显示、会话、模型路由等多重职责。

**建议拆分**:

- `AgentChatRuntimeProvider`: SSE/local/realtime 状态机。
- `MessageTimeline`: FlatList、memoized bubble、chunk flush。
- `VoiceDock`: 语音输入、实时语音状态、wake word 提示。
- `ToolCallSheet`: 工具调用折叠、审批、日志。
- `ModelExecutionBanner`: local/cloud/auto 解释与切换。
- `AttachmentComposer`: 图片/音频/文件。
- `HandoffPrompt`: 桌面/手表续接提示。

#### 5.3.2 首次体验需要“少选项、快成功”

当前移动端功能很多：OpenClaw、MPC、Agent、Marketplace、Task、Commission、Wearables、Local AI。新用户容易迷失。

**建议首登路径**:

1. 登录成功后自动创建/绑定 Cloud OpenClaw。
2. 只问一个问题：“你想先做什么？”
   - 和 Agent 聊天。
   - 控制桌面。
   - 连接手表/眼镜。
   - 赚取/购买技能。
3. 进入后再渐进显示高级模块。

#### 5.3.3 移动端应定位为“遥控器 + 传感器 + 钱包”

移动端不应和桌面端争夺复杂生产力场景，而应强化：

- 远程审批桌面 Agent 操作。
- 随手语音/拍照/定位输入。
- MPC 钱包签名确认。
- Push 通知与任务监控。
- Wear OS / AI 眼镜中继。

### 5.4 P0/P1 优化计划

| 优先级 | 项目 | 目标 | 验收 |
| --- | --- | --- | --- |
| P0 | 完整真机回归 | Android/iOS 登录、聊天、支付、Push、OpenClaw | 登录后 3 分钟内完成首次 Agent 对话 |
| P0 | PAT/secret 清理后重新构建 | 确保移动 build repo 不依赖明文 PAT | GitHub Actions secrets 驱动发布 |
| P0 | AgentChatScreen 拆分第一阶段 | 降低卡顿和维护风险 | 主文件 < 1800 行，消息渲染 FPS 稳定 |
| P1 | 移动端跨设备控制中心 | 设备列表、远程 approval、handoff、桌面状态 | 手机可看到桌面任务进度并 approve/reject |
| P1 | 语音优先模式 | 一键语音、可打断、低延迟反馈 | 首 token/首语音反馈 < 1.5s 可感知 |
| P1 | MPC 钱包恢复 UX | 用户能理解分片、恢复和安全边界 | 恢复流程 E2E 通过 |

---

## 6. 桌面端 Desktop 审计

### 6.1 架构现状

Desktop 是 Tauri 2 + React + Vite：

- `desktop/src/components/ChatPanel.tsx`: 约 4187 行，但已拆出 `chatPanel/` 子组件。
- 子组件已包括 `MessageList`、`InputZone`、`ApprovalModal`、`ToolExecutionBlock`、`FileContextZone`、`OfflineStatusBanner` 等。
- 功能包含多 tab、语音、截图、Git、workspace file、local model sidecar、MCP、memory、handoff、desktop sync、notifications。

### 6.2 已完成能力

- **本地 OS 权限**: Tauri plugin shell/dialog/clipboard/global-shortcut/notification/updater。
- **工具能力**: Git status/diff/log/commit/branch、screen capture、workspace read/write、file tree、diff view。
- **本地 AI**: local sidecar、local-only/auto/cloud-only turn routing。
- **跨端**: `desktopSync`、`sessionSync`、`HandoffBanner`、`CrossDevicePanel`。
- **安全交互雏形**: `ApprovalModal`、workspace backups、revert。
- **Release readiness 证据**: 既有报告记录 desktop build、MSI/NSIS、Playwright 30 passed。

### 6.3 UX 问题

#### 6.3.1 桌面端仍太像“功能集合”，需要形成 IDE 伴生闭环

当前功能很强，但用户心智可能不清晰：

- 是聊天助手？
- 是本地代码 agent？
- 是 OpenClaw 控制台？
- 是桌面自动化工具？
- 是钱包/商业入口？

**建议定位**: 桌面端 = **Agentrix Command Center for Work**。

核心首屏应聚焦三件事：

1. 当前工作区上下文。
2. Agent 正在做什么。
3. 哪些操作需要我批准。

#### 6.3.2 ChatPanel 主文件仍需继续拆分

虽然已有子组件，但主文件仍有 4187 行。

**建议第二阶段拆分**:

- `useStreamingChatRuntime`
- `useToolExecutionTimeline`
- `useWorkspaceChangeReview`
- `useDesktopApprovals`
- `useLocalModelRuntime`
- `useCrossDeviceHandoff`
- `ChatPanelLayout`

目标：主文件变为 orchestration shell，而不是所有业务逻辑集中点。

#### 6.3.3 工具执行透明度还要产品化

需要像 IDE Agent 一样清楚展示：

- 正在读取哪些文件。
- 即将写哪些文件。
- 命令风险等级。
- 可回滚点。
- 本次修改 diff。
- 用户批准记录。

### 6.4 P0/P1 优化计划

| 优先级 | 项目 | 目标 | 验收 |
| --- | --- | --- | --- |
| P0 | 干净 Windows 安装验证 | MSI/NSIS、WebView2、sidecar、权限、卸载 | 新机器 10 分钟内可完成登录和一次 Agent 任务 |
| P0 | Code signing / updater | 正式分发可信 | 安装包无 SmartScreen 高危警告或有明确签名策略 |
| P0 | 工具权限策略文档化 | 降低自动执行风险 | L0-L3 风险策略和 UI 一致 |
| P1 | Workspace Review 面板 | Agent 修改可审计可撤销 | 每次写入都有 diff + revert |
| P1 | IDE bridge | 与 VSCode/Cursor 双向联动 | 能从 Agentrix 打开具体文件行并应用 patch |
| P1 | Agent Team 本地沙盒 | Planner/Coder/Reviewer 并行 | 一个任务可拆分多 Agent 并生成审计轨迹 |

#### 6.4.1 本轮已落地 / MVP 状态

- **工具权限策略文档化**
  - 桌面端已有 `L0-L3` 风险分级：`L0` 只读、`L1` 低风险写入/跳转、`L2` 命令执行、`L3` 高风险破坏性动作。
  - Approval UI 已补充风险解释文案，避免只显示风险码不解释含义。

- **Workspace Review 面板**
  - 当前桌面 Task Workbench 已能展示 workspace 修改列表。
  - 每个文件支持：inline diff、backup 标记、revert/undo、Open in Cursor / VS Code。
  - 已形成最小可用的“Agent 修改可审计可撤销”闭环。

- **IDE bridge**
  - 本轮已补充桌面桥接命令：可从 Agentrix 直接把文件按 `file:line:column` 打开到 Cursor 或 VS Code。
  - 当前属于单向 MVP：`Agentrix -> IDE`。
  - 反向 `IDE -> Agentrix` 上下文回传、patch apply 回执、selection sync 仍是后续增强项。

- **Agent Team 本地沙盒**
  - 本轮先做审计层 MVP，不硬造新的多 Agent 执行内核。
  - Task Workbench 已新增 `Agent Team Sandbox (MVP)` 视图，将现有 timeline / event 轨迹归并为 `Planner / Coder / Reviewer` 三类角色卡片。
  - 这意味着审计轨迹开始可视化、角色分工开始可见，但严格意义上的本地并行多 Agent scheduler / sandbox 隔离仍需后续实现。

---
 
## 7. Web 前端审计

### 7.1 架构现状

Web 是 Next.js 13.5 + Tailwind + React 18：

- 官网/营销页完整。
- Agent Builder / Agent Team Studio / Agent Presence Dashboard 存在。
- Admin 页面较多。
- 支付和钱包组件较多。
- `frontend/lib/api/client.ts` 自动生产同源 `/api` 代理或 SSR `https://api.agentrix.top/api`。

### 7.2 已完成能力

- **Agent Presence Dashboard**: 已有 Agent、timeline、approval、channel health、devices 的 dashboard 组件。
- **Guest Checkout**: `checkout/pay.tsx` + `pages/api/checkout/create-intent.ts` + Stripe PaymentElement。
- **Stripe Payment**: `StripePayment.tsx` 支持 Card、Payment Request、3DS。
- **MPC Wallet Web 组件**: `SocialMPCWallet.tsx`、`MPCWalletSetup.tsx`、`MPCWalletCard.tsx`。
- **Admin 页面体系**: 用户、商户、开发者、商品、风控、营销、邀请码等。

### 7.3 风险与不足

#### 7.3.1 API proxy 路径需要统一

Web 中存在多种 API 调用方式：

- `apiClient` 使用 `API_BASE_URL`。
- checkout 页面直接 fetch `/api/products/${productId}` 与 `/api/checkout/create-intent`。
- Next API route 再代理到 `${API_BASE_URL}/api/payment/guest-intent`。

**建议**:

- 统一 `frontend/lib/api/serverClient.ts` 与 `frontend/lib/api/client.ts`。
- Next API routes 统一做 auth/cookie/token forwarding。
- 避免产品页面直连不一致路径。

#### 7.3.2 高级支付路径需验真

Stripe 路径较实，但 WalletConnect/X402/Passkey/多签仍需要逐条验收：

- 是否真实签名？
- 是否创建后端 payment intent/order？
- 是否链上确认？
- 是否写入 ledger/commission/settlement？
- 失败/退款/超时是否处理？

#### 7.3.3 Admin/HQ 需要真实数据闭环

Admin 页面数量足够，但需要确认每页：

- 是否 mock 数据。
- 是否有 loading/error/empty state。
- 是否有权限控制。
- 是否有审计日志。
- 是否能追踪生产事件。

### 7.4 P0/P1 优化计划

| 优先级 | 项目 | 目标 | 验收 |
| --- | --- | --- | --- |
| P0 | Web 支付路径专项 E2E | Stripe/Wallet/X402 每条路径真实支付或 test mode 完成 | order/payment/ledger/commission 全部一致 |
| P0 | Admin 权限与数据绑定审计 | 防止运营后台空壳/越权 | 每页有 RBAC + audit log |
| P1 | Agent Presence Web 工作台 | Web 成为跨渠道运营控制台 | 可查看所有 channel、devices、handoffs、approvals |
| P1 | Agent Builder 到发布闭环 | 从模板创建、测试、发布、计费 | 一个技能/Agent 可发布到 marketplace |
| P1 | 响应式移动 Web | 移动浏览器可完成登录/支付/分享 | Core Web Vitals 达标 |

---

## 8. Wear OS / 可穿戴设备审计

### 8.1 Wear OS 当前实现

`src/watch/` 已具备：

- `WatchApp.tsx`: Wear OS 入口。
- `WatchNavigator.tsx`: 手表端导航。
- `WatchHomeScreen` / `WatchChatScreen` / `WatchHealthScreen` / `WatchAlertsScreen` / `WatchSettingsScreen`。
- `useWatchAuth`: 通过 Watch Data Layer 请求手机端 auth state，AsyncStorage 存 token。
- `watchHealthService`: 上传健康 telemetry 到 `/wearable-telemetry/upload`。
- `useWatchSensors` / `useWatchSync`: 传感器和同步 hooks。

`watchDataLayerBridge.service.ts` 已抽象 Google Wear Data Layer：

- `/agentrix/auth/request`
- `/agentrix/auth/state`
- `/agentrix/voice/command`
- `/agentrix/approval/request`
- `/agentrix/approval/response`
- `/agentrix/session/state`
- `/agentrix/heartbeat`

### 8.2 后端 Wearable Telemetry

后端 `wearable-telemetry` 已具备：

- `POST /wearable-telemetry/upload`
- `POST /wearable-telemetry/verification`
- `GET /wearable-telemetry/samples`
- `GET /wearable-telemetry/devices/:deviceId/latest`
- `POST/GET/PATCH/DELETE /wearable-telemetry/rules`
- `GET/ACK /wearable-telemetry/triggers`

并使用 `JwtAuthGuard`，支持用户隔离。

### 8.3 Wear OS 风险

- **token 存储**: Watch 使用 AsyncStorage 存 token，安全性弱于 SecureStore。Wear OS 上可考虑 Android Keystore 原生封装。
- **真实传感器**: 静态代码存在，但需要 Wear Health Services 真机/模拟器验证。
- **release 包**: 既有报告显示 Debug APK 已生成，但上线需要 release flavor、applicationId、签名、ABI/feature split。
- **APK 体积**: 既有报告记录 Debug APK 约 151MB，需 shrink/split，避免把移动端本地模型 native lib 全带入 Watch。
- **手表 UX**: 必须一屏一任务，避免复刻手机复杂 UI。

### 8.4 Wear OS 优化计划

| 阶段 | 目标 | 关键任务 |
| --- | --- | --- |
| W1 P0 | 真机 E2E | 手机-手表配对、auth state、health upload、alerts ack、watch chat |
| W2 P0 | Release 包 | 独立 Wear flavor、签名、versioning、ProGuard/R8、ABI split |
| W3 P1 | 安全存储 | Android Keystore token wrapper、短 token + refresh policy |
| W4 P1 | 低功耗 | 同步间隔、后台限制、battery-aware 上传 |
| W5 P2 | Watch-first UX | complication/tile、快捷确认、震动模式、离线缓存 |

---

## 9. AI 眼镜与其他可穿戴审计

### 9.1 当前实现

AI 眼镜不是独立 App，而是手机中继：

- `glassSessionBridge.service.ts`: 管理 BLE 连接、Voice Gateway session、audio/image/HUD/gesture relay。
- `wearableAudioRelay.service.ts`: BLE mic/speaker relay 到 voice socket。
- `wearableImageRelay.service.ts`: BLE image frame relay。
- `glassHUDController.service.ts`: HUD 文本推送。
- `glassGestureHandler.service.ts`: touch/IMU gesture 转 Agent command。
- `glassAuthInterceptor.service.ts`: 眼镜端支付/敏感操作拦截到手机 MPC 确认。
- `glassVendorAdapters.service.ts` / `wearableVendorRegistry.service.ts`: vendor profile 与 GATT 映射方向。

### 9.2 真实差距

AI 眼镜目前属于**工程骨架已成型，硬件适配未闭环**：

- 缺首批目标硬件实测。
- 缺 vendor-specific BLE service/characteristic 真实 UUID。
- BLE 音频吞吐与 Opus/LC3 编解码链路需要验证。
- HUD 字符长度、刷新频率、断连重连、手机后台限制需要实测。
- 摄像头帧涉及隐私与合规，需要强权限提示与本地 redaction。

### 9.3 推荐硬件策略

不要自研硬件，优先做三层适配：

1. **BLE-only 音频/按键设备**: 最快验证“戴着设备叫 Agent”。
2. **Wear OS 手表**: 最快发布可用产品，复用 Android 生态。
3. **开放 SDK AI 眼镜**: 作为差异化 demo 和开发者生态样板。

### 9.4 AI 眼镜 UX 策略

眼镜端只做：

- 语音输入。
- 简短 HUD 输出。
- 一键中断/确认/拒绝。
- 场景识别触发。

手机端做：

- 权限解释。
- 支付/MPC 签名。
- 长文本结果。
- 图片/视频预览。
- 设备管理。

桌面端做：

- 会议/维修/工作流的详细记录。
- 生成文档、代码、任务。

---

## 10. Smart Contracts 审计

### 10.1 当前合约目录

`contract/contracts/` 包含：

- `Commission.sol`
- `CommissionV2.sol`
- `PaymentRouter.sol`
- `X402Adapter.sol`
- `ERC8004SessionManager.sol`
- `AutoPay.sol`
- `BudgetPool.sol`
- `AuditProof.sol`
- interfaces 与 mock ERC20。

### 10.2 风险

合约是 Agentrix 商业闭环的底层，但当前静态审计未看到最新第三方审计结果与主网部署证据。

重点风险：

- 自动扣款授权 `AutoPay`。
- X402 签名防重放、nonce、deadline、chainId、domain separator。
- Commission 分润 rounding、dust、异常 token、黑名单 token。
- PaymentRouter 多币种、多链、退款与 dispute。
- Admin/multisig 权限。

### 10.3 建议

- 合约主网前必须完成 Slither + Foundry fuzz + 第三方审计。
- 合约 deployment script 加入 chainId guard 与 dry-run。
- 所有 relayer/private key 改为多签或 KMS 管理。
- 先小额白名单 mainnet beta，再公开放量。

---

## 11. 跨端统一架构建议

### 11.1 当前问题

现在跨端相关能力存在多个子系统：

- `AgentPresence`: Agent identity、timeline、memory、handoff、device。
- `DesktopSync`: desktop device/task/approval/session/command。
- `OpenClawProxy`: chat/session/local sync。
- `WearableTelemetry`: wearable samples/rules/triggers。
- `Notification`: push/system notifications。
- `WebSocket/Voice`: realtime channel。

这些能力都存在，但产品体验仍可能割裂。

### 11.2 目标抽象: Unified Agent Session

建议建立统一领域模型：

```text
User
 └── Agent
      └── UnifiedAgentSession
           ├── ConversationEvents
           ├── DeviceChain
           ├── ToolRuns
           ├── Approvals
           ├── Memories
           ├── Payments
           ├── WearableSignals
           └── Handoffs
```

每个端侧只关心：

- 当前 session 是什么。
- 当前 Agent 正在哪个设备上工作。
- 我是否需要审批。
- 有哪些上下文/记忆被使用。
- 有哪些工具/支付/外部操作被执行。

### 11.3 API 收敛建议

- `GET /agent-presence/sessions/:sessionId/overview`
- `POST /agent-presence/sessions/:sessionId/events`
- `POST /agent-presence/sessions/:sessionId/handoff`
- `POST /agent-presence/sessions/:sessionId/approvals/:id/respond`
- `GET /agent-presence/devices/unified/online`
- `POST /agent-presence/devices/:deviceId/capabilities`
- `GET /agent-presence/agents/:agentId/memory/context`

### 11.4 UX 收敛建议

| 端 | 主要职责 | 不应承担 |
| --- | --- | --- |
| Web | 运营、配置、Agent Studio、支付管理、Marketplace | 重型本地文件/OS 操作 |
| Mobile | 遥控器、传感器、MPC 钱包、Push、Wearable hub | 大规模代码编辑 |
| Desktop | 本地生产力、代码/文件/OS 工具、本地模型、长任务 | 复杂商户后台运营 |
| Wear OS | 快速语音、健康信号、震动提醒、一键确认 | 钱包签名、复杂配置 |
| AI Glasses | 免手持语音/视觉入口、HUD 提示 | 长文本阅读、复杂输入 |

---

## 12. UX 体验优化总计划

### 12.1 P0：信任与稳定优先

- **凭证安全**: 轮换 PAT、清理脚本、PEM 移出仓库、secret scanning。
- **生产可观测性**: Sentry、structured logs、request-id、OpenClaw instance health、LLM provider metrics。
- **发布链路**: Desktop signing、Mobile release keystore/EAS、Wear release flavor、Web/Backend rollback。
- **真实设备矩阵**: Android、iOS、Windows clean VM、Wear OS、至少一个 BLE wearable。

### 12.2 P1：跨端主路径体验

设计一个统一 demo 主路径：

1. 用户在手机登录。
2. 自动创建 Cloud OpenClaw。
3. 手机问一个任务。
4. 桌面收到 handoff，继续执行文件/代码任务。
5. 桌面发起高风险工具操作，手机/手表收到审批。
6. Agent 完成任务，Web Dashboard 看到 timeline。
7. 如果涉及支付，手机 MPC 确认。
8. 结果写入 Agent memory，下次任意端可续接。

### 12.3 P2：高级体验

- **语音全双工**: Mobile/Wear/Glass 共享 voice session。
- **端侧模型**: Mobile/desktop local-first，云端 only for heavy tasks。
- **主动 Agent**: wearable telemetry / calendar / desktop context 触发建议。
- **Skill Canvas**: Web/desktop 可视化组合技能。
- **Agent Team**: Planner/Coder/Reviewer/Operator 多 Agent 协作。

---

## 13. 后续重点拓展方向

### 13.1 第一增长曲线：OpenClaw Cloud + Agentrix Command Center

目标用户：开发者、创业者、自动化重度用户。

核心卖点：

- 新用户无需自建 OpenClaw，登录即有云端 Agent。
- 移动端随时下任务。
- 桌面端执行本地生产力任务。
- Web 端配置/监控/支付/市场。

### 13.2 第二增长曲线：Agent 支付协议 + Skill Marketplace

目标用户：Agent 开发者、商户、自动化服务商。

核心卖点：

- Skill 可以收费。
- Agent 可以自动支付小额资源。
- MPC 钱包降低 Web3 门槛。
- Commission 双层架构促进分发裂变。

### 13.3 第三增长曲线：Wearables / AI Glasses Agent Interface

目标用户：高频移动场景、会议、现场服务、翻译、维修、健康提醒。

核心卖点：

- Agent 不再被限制在屏幕里。
- 手表做审批与健康信号。
- 眼镜做视觉/语音入口。
- 手机做安全与算力中继。

### 13.4 第四增长曲线：Enterprise Omni-channel Agent

目标用户：企业运营、客服、销售、内部自动化。

核心卖点：

- Telegram/Discord/Twitter/Slack/Feishu/WeCom/WhatsApp adapters 已有基础。
- Agent Presence 统一 timeline 和审批。
- 企业能控制 Agent 权限、审计、成本。

---

## 14. 差异化护城河策略

### 14.1 护城河一：跨端上下文连续性

竞品通常是单端强：

- Cursor/Windsurf 强在 IDE。
- ChatGPT/Claude 强在通用聊天。
- Rabbit/Humane 类硬件强在新入口但生态弱。

Agentrix 可以差异化为：

> 手机记录灵感，桌面执行任务，手表审批，眼镜采集现场，Web 运营 Agent，所有上下文进入同一 Agent memory。

### 14.2 护城河二：Agent + Payment 原生闭环

Agentrix 不是只“回答”，而是能：

- 创建订单。
- 调用 Skill。
- 自动支付小额资源。
- 分润给 Agent/开发者/推广者。
- 产生可审计 ledger。

这比纯 AI chat 更接近 Agent economy OS。

### 14.3 护城河三：端侧感知与权限控制

Desktop 有 OS/file/git/screen context。  
Mobile 有 location/camera/mic/wallet/push。  
Wear 有 health/haptics/quick approval。  
Glasses 有 first-person audio/vision/HUD。  
Web 有 admin/config/marketplace。

这些端侧能力合并后形成“感知 + 执行 + 审批 + 支付”的闭环。

### 14.4 护城河四：开发者生态

通过 SDK/MCP/UCP/A2A/Skill Marketplace：

- 第三方可以发布 Agent skill。
- Skill 可以在多端触发。
- 支付与分佣内建。
- Agent Team 可以组合多个 skill。

### 14.5 护城河五：安全可审计执行

Agent 真正进入生产系统后，用户最担心失控。Agentrix 应把安全作为卖点：

- 风险分级。
- Human-in-the-loop approval。
- 手机/手表二次确认。
- 工具执行日志。
- 一键撤销。
- 合约/支付审计。

---

## 15. 90 天路线图

### Phase 1：安全与发布加固（第 1-2 周）

- 轮换 GitHub PAT，清理所有包含 GitHub PAT 模式的脚本。
- PEM 移出仓库目录，补 secret scanning。
- 生产 Swagger 加访问控制。
- 统一 env validation，去除生产 fallback secret。
- Desktop clean Windows 安装验证。
- Mobile Android/iOS release smoke。
- Wear OS 真机/模拟器 E2E。

### Phase 2：跨端主路径闭环（第 3-6 周）

- Unified Agent Session overview API。
- Mobile Control Center：桌面任务、审批、handoff。
- Desktop Workspace Review：diff、approval、revert。
- Web Agent Presence Console：timeline、devices、channels、approvals。
- Watch quick approval：approval request/response 与后端打通。
- OpenClaw Cloud provisioning：container、quota、health、idle suspend。

### Phase 3：支付与商业闭环（第 7-10 周）

- Web/Mobile Stripe test mode E2E。
- WalletConnect / MPC / X402 分路径验收。
- Order → Payment → Ledger → Commission → Settlement 全链路对账。
- 合约 Slither/Foundry 测试。
- 小额 mainnet beta 策略。

### Phase 4：差异化 Demo 与增长（第 11-13 周）

- “手机下任务 → 桌面执行 → 手表审批 → Web 审计”公开 demo。
- Wear OS release beta。
- AI 眼镜首款设备 PoC。
- Skill Marketplace 付费发布闭环。
- Agent Team Studio 模板化场景。

---

## 16. Top 20 行动清单

| 优先级 | 行动 | Owner 建议 | 备注 |
| --- | --- | --- | --- |
| P0 | 轮换已粘贴 GitHub PAT | DevOps | 立即 |
| P0 | 清理脚本中的 GitHub PAT | DevOps | 不要只删当前文件，检查历史 |
| P0 | PEM 移出仓库目录 | DevOps | 根目录仅保留说明，不保留私钥 |
| P0 | 生产 Swagger 访问控制 | Backend | 防接口暴露 |
| P0 | 统一生产 env validation | Backend | 去 fallback secret |
| P0 | Redis 限流替代进程 Map | Backend | 支持多实例 |
| P0 | Cloud OpenClaw container/quota | Backend/Infra | 新用户云实例基础 |
| P0 | Desktop clean install | Desktop QA | Windows 干净机 |
| P0 | Mobile release smoke | Mobile QA | Android+iOS |
| P0 | Wear OS real device E2E | Wear QA | Data Layer/health/chat/alerts |
| P1 | AgentChatScreen 拆分 | Mobile | 降低维护成本 |
| P1 | ChatPanel 继续拆 runtime hooks | Desktop | 主文件降到 <2000 行 |
| P1 | Web payment E2E | Web/Backend | Stripe/Wallet/X402 |
| P1 | Unified Agent Session API | Backend | 跨端核心 |
| P1 | Mobile Control Center | Mobile | 远程桌面审批 |
| P1 | Web Presence Console 产品化 | Web | 运营控制台 |
| P1 | Desktop Workspace Review | Desktop | diff + revert |
| P1 | 合约审计与 fuzz | Contract | 主网前必须 |
| P2 | AI 眼镜首款设备 PoC | Hardware/Mobile | Vendor SDK |
| P2 | Skill Marketplace 付费闭环 | Web/Backend | 增长飞轮 |

---

## 17. 结论

Agentrix 当前最强的资产是：

- **统一后端已经覆盖 Agent、支付、OpenClaw、Presence、Desktop Sync、Wearable Telemetry。**
- **移动端、桌面端、Web、Wear OS/可穿戴的代码都已不是概念阶段。**
- **跨端 Agent Presence 与 Desktop Sync 的基础已经成型。**
- **MPC 钱包、X402、Commission、Skill Marketplace 让 Agentrix 有机会形成 Agent economy 闭环。**

最危险的短板是：

- **凭证治理与发布安全。**
- **真实设备/真实生产环境 E2E 不足。**
- **多端功能很多，但主路径和用户心智仍需收敛。**
- **合约/支付商业闭环必须经过更严格审计。**

下一阶段不要再单纯增加功能，而应围绕一个核心承诺收敛：

> **Agentrix = 跨设备、可支付、可审计、可穿戴延展的个人/企业 Agent OS。**
