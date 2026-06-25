# Agentrix 综合产品需求文档 (PRD V2.0)

**版本**: 2.0  
**日期**: 2026-03-15  
**愿景**: 让用户在任意时间、任意地点、跨设备跨应用与同一个 Agent 交流，所有端侧数据共享、记忆共享

---

## 一、项目全景与架构总览

### 1.1 系统组成

| 组件 | 技术栈 | 部署状态 | 代码仓库 |
|------|--------|----------|----------|
| **Backend** | NestJS 10 + TypeORM + PostgreSQL 16 | ✅ 新加坡 EC2 (18.139.157.116) | github.com/CutaGames/Agentrix |
| **Web Frontend** | Next.js 13.5 + Tailwind + ethers v6 | ✅ agentrix.top | 同上 |
| **Mobile App** | Expo SDK 54 + RN 0.81 + Zustand | ✅ 功能完整，EAS Build | github.com/CutaGames/Agentrix-claw |
| **Desktop App** | Tauri 2.x + React + Vite | 🟡 开发完成，未正式发布 | 同 Agentrix 仓库 |
| **Smart Contracts** | Solidity 0.8.x / BSC Testnet | 🟡 已部署测试网，审计中 | 同上 |
| **JS SDK** | TypeScript / ESM+CJS / TypeDoc | ✅ 已发布 | 同上 |

### 1.2 后端模块全景 (82 模块)

**核心业务**: Auth, User, Agent, Wallet, Payment, Commission, Order, Product, Merchant, Skill, Commerce  
**AI 引擎**: AI-Capability, AI-Integration (OpenAI/Claude/Gemini/DeepSeek/Groq/Bedrock), AI-RAG, LLM-Router, AI-Provider  
**协议层**: MCP, UCP, X402, A2A, Protocol, ERC-8004 Session  
**区块链**: Contract, Relayer, MPC-Wallet, Account-Abstraction (ERC-4337), OnChain-Indexer  
**商业**: Marketplace, Unified-Marketplace, Auto-Earn, Auto-Pay, Trading, Liquidity, Pricing, Tax  
**社交**: Social, Messaging, Referral, Invitation, Notification, WebSocket  
**运维**: Admin, HQ, Analytics, Statistics, Cache, Search, Risk, Compliance, KYC, Sandbox  
**多端协同**: Desktop-Sync, OpenClaw-Bridge, OpenClaw-Connection, OpenClaw-Proxy, Token-Quota, Workspace

---

## 二、各模块功能完成度评估

### 2.1 后端完成度

| 模块领域 | 完成度 | 详细说明 |
|----------|--------|----------|
| **认证体系** | 95% | Google/Apple/Twitter/Discord/Telegram/Email OTP/Wallet 七种登录；Mobile OAuth backend-mediated 已实现；缺 Apple 真实配置 |
| **Agent Runtime** | 90% | 策略层/授权层/执行层/审计层/记忆层完整；agent.service.ts 1799行；P0 集成服务 120K；缺长期记忆持久化优化 |
| **AI 多模型路由** | 90% | Claude (Bedrock)/GPT-4o/Gemini/DeepSeek/Groq 5家已接入；Model Router 配置齐全；缺模型质量评分和自动降级 |
| **支付引擎** | 85% | Stripe Connect/Crypto/X402/QR Pay/QuickPay/Refund/Escrow/AML 全链路；62个文件；payment.service.ts 50K；Transak 法币入金已对接；缺主网上线和合规审计 |
| **佣金体系** | 85% | 双层佣金(Agent层+Human层)；Split-Tree Generator/Policy Validator/Audit Proof/Dispute 完整；14个文件；缺链上佣金分配主网验证 |
| **MCP 协议** | 90% | OAuth 2.0 + OIDC 鉴权；Guest Checkout；130K mcp.service.ts；Intent Confirmation + NL Intent；Agent Payment Skill；缺完整 MCP 合规测试 |
| **UCP 商业协议** | 80% | UCP Scanner 16K + ucp.service 48K；Checkout Session 完整；缺第三方电商平台实际对接 |
| **A2A 协议** | 75% | a2a.service 26K + 控制器 5K + MCP Tools 7.8K；spec 测试 26K；缺多 Agent 实际协作场景验证 |
| **OpenClaw Bridge** | 85% | 5200+ Skills 聚合 (clawhub-snapshot 4MB)；实例探测/迁移/Skill Hub 完整；缺自动扩容和健康监控 |
| **Desktop Sync** | 80% | Heartbeat/Task/Approval/Session/Command 全内存存储；WebSocket 实时推送；缺数据持久化(全部 Map 存储，重启丢失) |
| **ERC-8004 Session** | 85% | SessionService 与链上合约交互完整；Session 创建/撤销/查询；缺主网部署 |
| **ERC-4337 AA** | 70% | account-abstraction 模块存在；Paymaster/Bundler/Smart Account；缺 Bundler 基础设施和生产环境验证 |
| **Trading 引擎** | 60% | Atomic Settlement/Intent Engine/Market Monitor/Strategy Graph；缺实际交易所对接和回测 |
| **MPC Wallet** | 80% | 3-of-3 Shamir 分片；创建/签名/恢复；缺安全审计和恢复流程 E2E 测试 |
| **通知系统** | 75% | Expo Push + 后端通知实体；缺 FCM/APNs 生产证书配置；WebSocket 推送基础完成 |
| **管理后台 (HQ)** | 70% | main-hq.ts 独立入口；HQ 模块 8 文件；缺完整的运营数据面板 |

### 2.2 Web 前端完成度

| 模块 | 完成度 | 详细说明 |
|------|--------|----------|
| **首页/营销页** | 95% | Hero/Features/AgentRoles/Alliance/CTA 完整；双语支持 |
| **Agent 交互 (Claw)** | 85% | 云端/本地/BYOC 三种部署模式介绍；Skill 市场展示 |
| **Marketplace** | 80% | 统一大市场 + Skill 市场；搜索/过滤/详情；缺购买流转闭环 |
| **Workbench** | 75% | Agent Builder 基础；工作台 v3；缺可视化流程编排 |
| **支付页** | 70% | Stripe/Crypto/X402/Passkey UI 存在；**大量组件仅有 UI 无实际逻辑**；Passkey/X402/多签皆为展示层 |
| **钱包连接** | 40% | 仅 MetaMask 基础连接；WalletConnect v2 模拟；缺 Phantom/OKX/多链管理 |
| **佣金/结算** | 50% | 设置页完成；收益面板 UI 存在；缺后端数据集成 |
| **Admin 后台** | 65% | 17 个管理页面；用户/商品/开发者/营销/风控/邀请码；缺实际数据绑定 |
| **开发者中心** | 70% | developers.tsx 33K；SDK 文档展示；缺 Skill 发布实际流程 |
| **国际化** | 85% | LocalizationContext 29K；中英双语全覆盖 |

### 2.3 移动端 (Mobile App) 完成度

| 模块 | 完成度 | 详细说明 |
|------|--------|----------|
| **认证** | 95% | 8 种登录方式全部实现；Backend-mediated OAuth；MPC Wallet 自动创建 |
| **Onboarding** | 90% | 云端/本地/BYOC 三路径；Social Bind；缺首次体验引导优化 |
| **Agent Console** | 90% | SSE 流式对话；Thought Chain 可视化；语音聊天骨架；Memory 管理；88K AgentChatScreen |
| **Agent 权限** | 85% | AgentPermissionsScreen 48K；ERC-8004 授权管理 |
| **Skill 市场** | 85% | 5200+ Skills 浏览/搜索/安装；MarketplaceScreen + SkillDetailScreen |
| **任务集市** | 85% | TaskMarketScreen 36K；发单/接单/详情/投标 |
| **商城/购买** | 80% | QuickPay/WalletPay/Scan/Stripe 四路径；缺完整购物车结账流程 |
| **佣金仪表盘** | 80% | CommissionEarnings/Rules/Preview 三屏；缺实时数据 |
| **社交** | 70% | Feed/Post/DM/Group Chat/Social Listener 10 屏；缺实际消息推送 |
| **推荐裂变** | 80% | ShareCard/CreateLink/Promote/MyLinks；ShareSheet+SharePoster |
| **穿戴设备** | 50% | WearableHubScreen 28K；BLE Gateway/Device Adapter/Agent Capability 三层；Phase 1 基本完成；Phase 2 部分 |
| **桌面控制** | 65% | DesktopControlScreen 16K；LocalConnectScreen 15K；缺实际跨端通信测试 |
| **设置/个人** | 90% | SettingsScreen 20K + AccountScreen 23K；多语言/通知/安全/主题 |

### 2.4 桌面端 (Desktop App) 完成度

| 模块 | 完成度 | 详细说明 |
|------|--------|----------|
| **Tauri 框架** | 85% | 双窗口架构 (FloatingBall + ChatPanel)；Rust 后端桥接 |
| **悬浮球** | 85% | 可拖拽；吸附屏幕边缘；多显示器切换；Logo 点击打开面板 |
| **Chat Panel** | 80% | 41K ChatPanel.tsx；流式对话；Session 管理；缺 Skill 调用 UI |
| **登录** | 80% | LoginPanel 19K；账号密码 + 访客模式；缺社交登录 |
| **Onboarding** | 75% | OnboardingPanel 10K；功能引导 |
| **Session Sync** | 70% | sessionSync.ts 6.7K + desktopAgentSync.ts 7K；后端 Desktop-Sync API；**全部内存存储，重启丢失** |
| **语音** | 60% | VoiceButton 4.7K + voice.ts 6K；录音+转写骨架；缺 VAD |
| **剪贴板监听** | 70% | clipboard.ts 2.7K；基础监听 |
| **全局快捷键** | 85% | Ctrl+Shift+S 面板切换；Ctrl+Shift+A 语音 |
| **Proactive** | 50% | proactive.ts 6.5K；主动提示框架；缺实际触发策略 |

### 2.5 智能合约完成度

| 合约 | 完成度 | 详细说明 |
|------|--------|----------|
| **Commission.sol (V5)** | 85% | 多角色佣金分配；已部署测试网；缺安全审计 |
| **CommissionV2.sol** | 80% | SplitPlan 多层级分润；缺主网验证 |
| **PaymentRouter.sol** | 75% | 多链多币种路由；缺完整测试覆盖 |
| **ERC8004SessionManager.sol** | 85% | Session Key 创建/撤销/查询/限额；已审计 |
| **AutoPay.sol** | 60% | 自动扣款授权；**审计报告标注"需修复"** |
| **BudgetPool.sol** | 70% | 预算池管理；审计中 |
| **X402Adapter.sol** | 65% | X402 协议适配；**审计报告标注"需加强签名验证"** |
| **AuditProof.sol** | 90% | 链上审计证明；低风险 |

### 2.6 综合完成度打分

```
后端 (82 modules)        ████████████████████░░  85%
移动端 (50+ screens)     ████████████████████░░  82%
Web 前端                 ██████████████░░░░░░░░  65%
桌面端                   ███████████████░░░░░░░  72%
智能合约                 ███████████████░░░░░░░  75%
SDK                      ██████████████████████  95%
协议集成 (MCP/UCP/A2A)   ████████████████████░░  83%
跨设备协同               ████████░░░░░░░░░░░░░░  35%
安全审计                 ██████████░░░░░░░░░░░░  50%
测试覆盖                 ██████░░░░░░░░░░░░░░░░  30%
文档与运营工具           █████████████░░░░░░░░░  60%
─────────────────────────────────────────────────
总体完成度               ███████████████░░░░░░░  68%
```

---

## 三、核心差距分析 (Gap Analysis)

### 3.1 🔴 关键缺失 (P0 — 不补齐无法上线)

| # | 缺失项 | 影响范围 | 当前状态 | 工作量 |
|---|--------|----------|----------|--------|
| G1 | **跨设备记忆/Session 持久化** | 全端 | Desktop-Sync 全部 Map 存储，重启即丢；Agent Memory 缺统一持久化层 | 2-3 周 |
| G2 | **Web 前端支付逻辑空壳** | Web | Passkey/X402/多签/WalletConnect 全部仅 UI，无实际执行逻辑 | 3-4 周 |
| G3 | **智能合约安全审计** | 全端 | AutoPay "需修复"、X402Adapter "需加强签名验证"；未完成第三方审计 | 4-6 周 |
| G4 | **BSC 主网部署** | 全端 | 全部在 Testnet (ChainID 97)；主网需要审计通过后才能部署 | 1-2 周 |
| G5 | **推送通知生产配置** | Mobile/Desktop | 缺 FCM Service Account (Android) 和 APNs 证书 (iOS) | 1 天 |
| G6 | **Apple OAuth 真实配置** | Mobile | APPLE_TEAM_ID 仍为占位符；iOS 上架必须 | 1 天 |
| G7 | **测试覆盖率** | 全端 | 仅零星 spec 文件；无 E2E 测试；无回归测试 | 持续 |

### 3.2 🟡 重要缺失 (P1 — 影响核心体验)

| # | 缺失项 | 影响范围 | 说明 |
|---|--------|----------|------|
| G8 | **统一 Agent Session 跨端共享** | 跨端核心 | 手机/桌面/Web 之间无法续接对话，是产品愿景的核心缺口 |
| G9 | **Web 前端多钱包支持** | Web | 仅 MetaMask 基础连接；缺 WalletConnect v2/Phantom/OKX |
| G10 | **Admin 后台数据绑定** | 运营 | 17 个管理页面多为 mock 数据；缺实际 API 对接 |
| G11 | **Trading 引擎生产化** | 支付/交易 | Atomic Settlement/Intent Engine/Market Monitor 框架在，缺交易所对接 |
| G12 | **ERC-4337 Bundler 基础设施** | Gasless | Account Abstraction 模块存在，缺 Bundler 节点和 Paymaster 合约部署 |
| G13 | **Cloud OpenClaw 资源管控** | 运维 | 单 EC2 无容器资源限制；无自动扩容；无 idle 休眠 |
| G14 | **穿戴设备 Phase 2-3** | 硬件协同 | BLE 基础扫描完成；缺 Notification Stream/Gesture Event/Background BLE |

### 3.3 🟢 优化项 (P2 — 提升竞争力)

| # | 优化项 | 说明 |
|---|--------|------|
| G15 | 模型质量评分 & 自动降级 | LLM Router 缺 fallback 策略和质量监控 |
| G16 | 离线优先本地推理 | 本地 Agent 推理 + 上线同步 (产品愿景中提到) |
| G17 | 语音连续对话 (VAD) | VoiceChatScreen 仅"按住说话"，缺 VAD 端点检测 |
| G18 | 跨应用自动化 (Accessibility) | Android Accessibility Service 原生模块；屏幕理解 |
| G19 | DAO 治理 & Token 发行 | Phase 5 规划中 |
| G20 | 多语言本地化深化 | 中英完成；缺日/韩/西/阿等 |

---

## 四、重新制定的 PRD — 分阶段实施计划

### Phase A: 基础加固 (2026 Q2 Apr-May, 8 周)

**目标**: 补齐安全、持久化、测试三大基础短板，为公测做好准备。

#### A1. 跨端 Session & 记忆持久化 [P0, 3 周]

**现状**: Desktop-Sync 所有数据存储在 Node.js Map 中，服务重启即丢失。Agent Memory 无统一持久化层。

**需求**:
1. 将 `DesktopSyncService` 中的 devices/tasks/approvals/sessions/commands 五个 Map 迁移到 PostgreSQL + Redis 缓存
2. 新建 `agent_memory` 表，支持长期记忆 (knowledge) + 短期偏好 (preference) + 对话摘要 (summary)
3. 实现 `MemorySyncService`：所有端产生的记忆写入统一存储，各端按 userId + agentId 拉取
4. Agent Session 增加 `deviceChain` 字段，记录对话在哪些设备间流转

**验收标准**:
- 后端重启后所有 Desktop-Sync 数据不丢失
- 手机端产生的 Agent 记忆，在桌面端和 Web 端可查看
- Session Handoff: 手机上进行到一半的对话，桌面端可续接

#### A2. 智能合约安全修复 & 审计 [P0, 4 周]

**需求**:
1. 修复 `AutoPay.sol` 审计报告中的问题
2. 加强 `X402Adapter.sol` 签名验证（增加 nonce、deadline、链上 replay protection）
3. 对 Commission.sol V5 / CommissionV2.sol / PaymentRouter.sol 补充单元测试（覆盖率 >90%）
4. 提交第三方审计 (推荐 Certik / Trail of Bits / OpenZeppelin)
5. 准备 BSC 主网部署脚本和多签治理流程

**验收标准**:
- 所有合约通过 Slither / Mythril 静态分析无 High/Critical
- 第三方审计报告获得至少 B+ 评级
- 主网部署 Dry-run 成功

#### A3. 测试体系建设 [P0, 持续]

**需求**:
1. 后端: 为每个核心 Service 编写 unit test（目标 60% 覆盖率）
2. 后端: 为 Auth/Payment/Commission/Agent 四条主线编写 E2E 测试
3. 移动端: Maestro E2E 测试 (Login → Chat → Marketplace → Checkout → Commission 主流程)
4. Web 前端: Playwright E2E 测试覆盖核心页面
5. CI/CD: GitHub Actions 中增加 test gate，PR 不通过不能合并

**验收标准**:
- 后端 `npm test` 通过率 100%，覆盖率 >60%
- Maestro 移动端主流程自动化测试通过
- PR merge 有 CI test gate

#### A4. 生产配置补齐 [P0, 1 天]

**需求**:
1. 配置 Apple OAuth (APPLE_TEAM_ID, APPLE_SERVICE_ID, APPLE_KEY_ID)
2. 配置 FCM Service Account (Android 推送)
3. 配置 APNs 证书 (iOS 推送)
4. 确认所有 OAuth Client ID/Secret 为生产值

---

### Phase B: 支付 & 交易闭环 (2026 Q2 May-Jun, 6 周)

**目标**: 补齐 Web 前端支付空壳，完善交易全链路，为 Agent 经济提供坚实的支付基础设施。

#### B1. Web 前端支付逻辑实现 [P0, 4 周]

**现状**: `components/payment/` 下 Passkey/X402/MultisigPayment 全部为展示层。

**需求**:
1. **WalletConnect v2 完整集成**: 替换当前模拟实现，支持 EVM + Solana 多链
2. **Stripe 支付**: 对接 `stripe-connect.controller.ts` 已有的后端 API
3. **X402 支付**: 
   - 创建 `lib/x402/` 客户端库
   - 对接后端 `x402.service.ts` + `x402-authorization.service.ts`
   - 实现 Session Key 绑定的自动支付
4. **Passkey 支付**: WebAuthn API 集成，对接后端 MPC Wallet 联合签名
5. **QR Scan Pay**: 对接后端 `qr-payment.controller.ts`

**验收标准**:
- 用户可通过 Web 端完成 Stripe 信用卡购买
- 用户可通过 WalletConnect 连接钱包并完成加密支付
- X402 自动支付 Demo 可在 Web 端演示

#### B2. Trading 引擎 MVP [P1, 3 周]

**需求**:
1. 对接至少 1 个 DEX 聚合器 (1inch / Jupiter)
2. `intent-engine.service.ts` 实现基础交易意图解析
3. `atomic-settlement.service.ts` 对接链上合约完成原子结算
4. `market-monitor.service.ts` 接入价格 Oracle (Chainlink / Pyth)
5. 移动端 `StrategyDetailScreen` 对接真实数据

**验收标准**:
- Agent 可执行 "帮我用 10 USDC 买 BNB" 类型的交易意图
- 交易结果在 Audit Proof 中有链上记录

#### B3. ERC-4337 Account Abstraction 生产化 [P1, 2 周]

**需求**:
1. 部署或对接 Bundler 服务 (推荐 Biconomy/StackUp/自建 Alto)
2. 部署 Paymaster 合约 (VerifyingPaymaster + Token Paymaster)
3. 实现 Gas 赞助策略: 新用户前 30 天全额赞助，日限额 $5
4. 后端 `account-abstraction/` 模块对接 Bundler API

**验收标准**:
- 新用户 MPC Wallet 创建后，前 30 天链上操作无需自付 Gas
- 超限后自动切换 USDC Token Paymaster

---

### Phase C: 跨端协同 — 核心差异化 (2026 Q3 Jul-Aug, 8 周)

**目标**: 实现 Agentrix 最核心的产品愿景 — 跨设备无缝 Agent 交互。

#### C1. 统一 Agent Session 协议 [P0, 3 周]

**需求**:
1. 设计 `AgentSessionProtocol`:
   ```
   Session {
     sessionId: UUID
     userId: string
     agentId: string
     deviceChain: DeviceEntry[]  // 记录设备流转
     messages: Message[]
     memory: MemorySnapshot
     activeDeviceId: string
     lastHandoffAt: timestamp
   }
   ```
2. 实现 **Context Handoff** API:
   - `POST /api/session/:id/handoff` — 将当前对话上下文从设备 A 交给设备 B
   - 包含最近 N 条消息 + 当前 Memory Snapshot + 执行中的 Task 状态
3. 所有端（Mobile/Desktop/Web）统一调用此 API
4. WebSocket 实时广播 Session 状态变更到所有已登录设备

**验收标准**:
- 手机上对话 → 切到桌面 → 继续对话，上下文无缝
- 多设备同时在线时，任一设备的对话都实时同步到其他设备
- Session 列表显示"最后活跃设备"标签

#### C2. 实时状态同步 (CRDT) [P1, 3 周]

**需求**:
1. 引入 CRDT (Conflict-free Replicated Data Type) 用于多端同步:
   - Agent 偏好设置 (LWW-Register)
   - Skill 安装列表 (OR-Set)
   - 对话记录 (Sequence CRDT)
2. 基于现有 WebSocket 模块实现增量同步
3. 离线缓冲: 离线时本地写入 → 上线后自动合并

**验收标准**:
- 两台设备同时修改 Agent 设置，合并无冲突
- 飞行模式下使用 Agent，落地后自动同步

#### C3. 设备能力适配层 [P1, 2 周]

**需求**:
1. 创建 `DeviceCapabilityService`:
   - 检测当前设备类型 (phone/tablet/desktop/watch/car)
   - 上报设备能力 (screen_size, has_camera, has_mic, has_ble, battery_level)
2. Agent 根据设备能力自动调整交互模式:
   - 手表: 纯语音 + 极简卡片
   - 手机: 完整 UI
   - 桌面: 悬浮球 + 侧边面板
3. 后端 `DeviceCapabilityService` 维护每个用户的设备清单

**验收标准**:
- Agent 在不同设备上自动切换交互模式
- 用户设备列表可在任一端查看和管理

---

### Phase D: 穿戴设备 & 智能硬件 (2026 Q3 Aug-Sep, 6 周)

**目标**: 实现蓝牙绑定穿戴设备 + 裁剪版智能硬件软件。

#### D1. 穿戴设备 Phase 2-3 完善 [P1, 3 周]

**需求**:
1. **Notification Stream**: Characteristic Subscription 实时数据流
2. **Vendor Profile Registry**: 支持 Apple Watch / Xiaomi Band / Samsung Galaxy Watch / Oura Ring 已知设备识别
3. **Gesture Event Mapping**: 手势 → Agent Event (如双击手环 → 触发语音)
4. **Persistent Paired Storage**: 已配对设备列表持久化到后端
5. **Background BLE**: iOS Background Modes + Android Foreground Service

**验收标准**:
- 可绑定至少 1 种真实穿戴设备
- 穿戴设备上的手势可触发 Agent 动作
- 后台保持 BLE 连接不断开

#### D2. 裁剪版智能硬件软件 [P2, 3 周]

**需求**:
1. 设计 "Agent Lite" 模式:
   - 仅包含: 语音交互 + 基础对话 + 通知展示 + 快捷支付
   - 去除: 完整 Marketplace / Social / Commission Dashboard
2. 适配低算力设备 (ARM Cortex-M / RISC-V):
   - HTTP 长轮询替代 WebSocket
   - 压缩协议 (Protobuf / CBOR)
   - 本地 Wake Word Detection
3. 硬件 SDK (C/Rust): BLE Peripheral → Agentrix Gateway

**验收标准**:
- 在 ESP32-S3 或树莓派上运行 Agent Lite Demo
- 语音唤醒 → 对话 → 回复 全链路打通

---

### Phase E: 增长引擎 & 商业闭环 (2026 Q4 Oct-Nov, 6 周)

#### E1. Commission 主网上线 [P0, 2 周]

- BSC 主网部署所有审计通过的合约
- 真实佣金分配和结算
- 商户接入工具和文档

#### E2. Admin 运营后台实装 [P1, 3 周]

- 17 个管理页面全部对接真实 API
- 运营数据面板: DAU/MAU、交易量、佣金总额、Skill 调用量
- 风控告警: 大额交易、异常行为、合约事件监控

#### E3. 订阅 & 变现体系 [P1, 2 周]

- 实现 Free/Pro/Business/Enterprise 四级订阅
- Token Quota 按套餐分配
- Stripe Subscription 对接
- 升级/降级/续费流程

#### E4. 增长裂变机制 [P2, 2 周]

- 邀请码系统完善 (后端 invitation 模块已有，需前端集成)
- 推荐返佣链路打通 (Referral → Commission → Settlement → Withdrawal)
- 空投活动系统 (Airdrop 实体已有)
- 联盟营销面板

---

### Phase F: 生态 & 长期演进 (2027 Q1+)

#### F1. Agent 自主经济体
- Agent 可自主注册、购买 Skill、支付费用
- Agent 间市场交易 (A2A Protocol)
- Agent DAO 治理

#### F2. Token 发行
- ARN Token 经济模型设计
- 链上治理合约
- 流动性池

#### F3. 全球化
- 多语言 (日/韩/西/阿)
- 区域合规 (GDPR, 新加坡 MAS, 日本 FSA)
- 区域支付方式 (支付宝/微信/GrabPay/LINE Pay)

#### F4. 跨应用自动化
- Android Accessibility Service
- 屏幕理解 (多模态 Vision Model)
- 跨应用 Agent 操作 (发微信/点外卖/打车)

---

## 五、技术债务清单

| 优先级 | 债务 | 位置 | 修复建议 |
|--------|------|------|----------|
| 🔴 | Desktop-Sync 内存存储 | `desktop-sync.service.ts` | 迁移到 PostgreSQL + Redis |
| 🔴 | Web 支付组件空壳 | `frontend/components/payment/*` | 实现实际逻辑 |
| 🔴 | 无统一错误处理 | Web Frontend | 建立全局 Error Boundary + Toast |
| 🟡 | 前端大量 mock 数据 | `frontend/` 多处 | 逐步替换为 API 调用 |
| 🟡 | API 调用未统一封装 | `frontend/` | 建立 `useApi` hook + interceptor |
| 🟡 | 缺统一日志系统 | 全端 | 接入 Sentry / Datadog |
| 🟡 | agent.service.ts 1799 行 | `backend/src/modules/agent/` | 拆分为独立子服务 |
| 🟡 | mcp.service.ts 130K | `backend/src/modules/mcp/` | 按功能域拆分 |
| 🟡 | payment.service.ts 50K | `backend/src/modules/payment/` | 按支付方式拆分 |
| 🟢 | 根目录大量临时脚本 | 项目根 | 清理 check_*.sh, fix_*.sh, deploy_*.sh |
| 🟢 | 根目录 .bundle 文件 65MB+ | 项目根 | 移入 .gitignore 或删除 |
| 🟢 | Next.js 13.5 过旧 | `frontend/` | 升级到 Next.js 14+ (App Router) |

---

## 六、基础设施优化建议

### 6.1 服务器架构

**现状**: 单台新加坡 EC2 承载所有服务 (Backend + Frontend + OpenClaw 容器 + PostgreSQL)

**建议**:
1. **数据库分离**: PostgreSQL 迁移到 RDS (自动备份、高可用)
2. **Redis 集群**: ElastiCache 用于缓存 + Session + 实时同步
3. **容器编排**: Cloud OpenClaw 迁移到 ECS Fargate (自动扩容)
4. **CDN**: CloudFront 加速前端静态资源
5. **监控**: CloudWatch + Sentry + Grafana

### 6.2 CI/CD

**现状**: GitHub Actions 基础 CI；无自动化测试 gate

**建议**:
1. PR 自动运行 lint + type-check + unit test
2. 合并到 main 自动部署到 staging
3. Tag release 触发生产部署
4. 移动端: EAS Build on PR (预览版)
5. 桌面端: Tauri GitHub Release pipeline

### 6.3 安全加固

1. **Secrets 管理**: 从 .env 迁移到 AWS Secrets Manager
2. **API Rate Limiting**: 现有框架支持，需实际启用
3. **HTTPS Certificate 自动续期**: 当前 Let's Encrypt，建议 ACM
4. **数据库加密**: RDS 开启 at-rest encryption
5. **审计日志**: 所有管理操作记录到不可变存储

---

## 七、里程碑与时间线

```
2026 Q2 (Apr-Jun)
├── Phase A: 基础加固 ─────────── Apr W1 ~ May W4
│   ├── A1: Session持久化            Apr W1-W3
│   ├── A2: 合约安全审计             Apr W1 ~ May W4
│   ├── A3: 测试体系                 持续
│   └── A4: 生产配置                 Apr W1 (1天)
└── Phase B: 支付闭环 ─────────── May W1 ~ Jun W2
    ├── B1: Web支付逻辑              May W1 ~ May W4
    ├── B2: Trading MVP              May W3 ~ Jun W1
    └── B3: ERC-4337 生产化          Jun W1-W2

2026 Q3 (Jul-Sep)
├── Phase C: 跨端协同 ─────────── Jul W1 ~ Aug W4
│   ├── C1: 统一Session协议          Jul W1-W3
│   ├── C2: CRDT实时同步             Jul W3 ~ Aug W2
│   └── C3: 设备能力适配             Aug W3-W4
└── Phase D: 穿戴/硬件 ──────── Aug W3 ~ Sep W4
    ├── D1: 穿戴Phase 2-3            Aug W3 ~ Sep W2
    └── D2: 硬件裁剪版              Sep W1-W3

2026 Q4 (Oct-Dec)
└── Phase E: 增长引擎 ─────────── Oct W1 ~ Nov W2
    ├── E1: 主网上线                 Oct W1-W2
    ├── E2: Admin实装                Oct W1-W3
    ├── E3: 订阅体系                 Oct W3 ~ Nov W1
    └── E4: 裂变增长                 Nov W1-W2

2027 Q1+
└── Phase F: 生态长期 ─────────── 持续
```

---

## 八、关键指标 (KPIs)

| 阶段 | 指标 | 目标值 |
|------|------|--------|
| Phase A 完成后 | 后端测试覆盖率 | >60% |
| Phase A 完成后 | 合约审计评级 | B+ 以上 |
| Phase B 完成后 | Web 端可完成支付的比例 | >90% 场景可执行 |
| Phase C 完成后 | 跨端 Session Handoff 延迟 | <2s |
| Phase C 完成后 | 多端同时在线消息同步率 | >99.5% |
| Phase D 完成后 | 支持穿戴设备型号数 | ≥3 |
| Phase E 完成后 | 日均交易笔数 (主网) | >100 |
| Phase E 完成后 | MAU | >5,000 |

---

## 九、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 合约审计发现 Critical 漏洞 | 中 | 高 | 预留 4 周修复缓冲；内部先用 Slither/Mythril |
| 单服务器承载不了 500+ 用户 | 高 | 高 | Phase A 期间同步准备 RDS + ECS 迁移方案 |
| Apple OAuth 审核不通过 | 低 | 中 | 准备 Email OTP 作为 fallback |
| CRDT 实现复杂度超预期 | 中 | 中 | 先用 Last-Writer-Wins 简单方案，后续迭代 |
| Bundler 服务不稳定 | 中 | 中 | 对接多家 Bundler (Biconomy + StackUp)；自建备用 |

---

## 十、总结

Agentrix 已经构建了一个**架构完整但深度不均**的 AI Agent 经济平台：

**强项**:
- 后端 82 模块覆盖面极广，AI 多模型/协议栈/支付/佣金/社交全有
- 移动端 50+ 屏幕功能丰富，Onboarding/Agent/Marketplace/Social 齐全
- 协议栈 (MCP/UCP/A2A/X402/ERC-8004) 实现完整度行业领先
- SDK 文档化好

**弱项**:
- **跨设备协同几乎为零** — 这是产品愿景的核心，却是完成度最低的部分 (35%)
- Web 前端支付逻辑大量空壳
- 测试覆盖率极低 (~30%)
- 安全审计未完成
- 运维基础设施脆弱 (单服务器、无监控、内存存储)

**核心策略**: **先补基础 (安全/持久化/测试) → 再打通支付闭环 → 然后全力攻关跨端协同 (核心差异化) → 最后接入硬件和增长引擎**。

跨设备无缝 Agent 交互是 Agentrix 最大的差异化卖点，应在 Phase C (2026 Q3) 作为最高优先级突破。
