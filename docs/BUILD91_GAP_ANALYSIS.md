# Build 91 完整差距分析报告

> 对照文档：
> - **Doc1**: `APP_EVOLUTION_BLUEPRINT.md` — 四阶段演进蓝图
> - **Doc2**: `Untitled-1` — 账户/钱包体系 + Agent模块优化 (Build 55目标)  
> 审计时间: 2025-07  
> 审计方法: 逐项对照文档需求 → 精确到代码行级别的源码验证

---

## 总览（Executive Summary）

| 维度 | Doc标注状态 | 实际代码状态 | 差距评级 |
|------|-------------|-------------|----------|
| Marketplace 支付链路 | ✅ 已完成 | ⚠️ 支付跳转未实现 | 🔴 严重 |
| OpenClaw 技能聚合 | ✅ 已完成 | ⚠️ 前端回退30条占位 | 🟡 中等 |
| Task Market 任务大厅 | ✅ 已完成 | ✅ API层完整，UI含种子数据回退 | 🟢 基本达标 |
| Agent Console 驾驶舱 | ✅ 已完成 | ⚠️ 结构在，细节缺失 | 🟡 中等 |
| 权限矩阵 | Doc2新增需求 | ⚠️ UI存在但核心功能空壳 | 🔴 严重 |
| LLM引擎配置 | Doc2新增需求 | ❌ 仅Alert弹窗选择 | 🔴 严重 |
| Social API路径 | ✅ 已完成 | 🔴 DM/群聊调用错误端点 | 🔴 严重 |
| 悬浮球 FloatingChat | ⚠️ 框架就绪 | ❌ 死代码，未挂载 | 🟡 中等 |
| 语音对话 VoiceChat | ⚠️ 骨架就绪 | ✅ 录音→转写→回复→TTS 完整 | 🟢 达标 |

---

## 一、Doc1 逐项对照（APP_EVOLUTION_BLUEPRINT 四阶段）

### 阶段一：Marketplace (集市与交易) — Doc标注"Build 52 已完成"

#### 1.1 资源与技能聚合 — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 整合 OpenClaw 5200+ 技能 | ⚠️ 部分 | 前端 `openclawHub.service.ts` 尝试 `hub.openclaw.ai` 和 `registry.openclaw.ai`（均不可达），回退到 **30条 HUB_PLACEHOLDER** 硬编码数据 |
| 后端 Singapore 服务器有技能数据 | ⚠️ 后端有，前端没调 | 后端 `openclaw-skill-hub.service.ts` 配置了 `18.139.157.116:3001/8080/11435` 四个URL，但**前端故意跳过后端桥接端点**（注释: "intentionally skip the backend bridge"）|
| 对接 `/unified-marketplace/search` | ✅ 真实API | `marketplace.api.ts` 调用 `GET /unified-marketplace/search`，但空结果或异常时回退到 **12条 MOCK_SKILLS** |
| 仅展示含真实价格的资产 | ❌ 不符 | HUB_PLACEHOLDER 全部 `price: 0, priceUnit: 'free'`；MOCK_SKILLS 价格是硬编码虚拟值 |

**关键差距**: 前端 `openclawHub.service.ts` 试图直连公网 `hub.openclaw.ai`（不存在），完全没有调用后端的 Singapore 桥接服务。后端 `OpenClawSkillHubService` 已经正确配置了 `18.139.157.116` 的多个端口，但前端没有走这个通道。

#### 1.2 分享与裂变传播 — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| `ShareCardView` 精美二维码海报 | ✅ 完整 | `react-native-qrcode-svg` 真实QR + `react-native-view-shot` 截图分享 |
| 拼接专属 Referral Code `?ref=userId` | ✅ 服务端拼接 | `referral.api.ts` 调用 `POST /referral/links` 由服务端生成含ref的短链 |
| expo-sharing 分享 | ✅ 完整 | 截图PNG分享 + 文本fallback |

**状态**: ✅ **达标**

#### 1.3 支付与结算链路 — Doc标注 ✅ 🔴关键差距

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 重建 CheckoutScreen 对齐 Web 端 | ❌ 未对齐 | 仅3个按钮(Stripe/Transak/X402)，无Web端设计的折叠面板UI |
| CRYPTO: QuickPay (MPC钱包自动检测) | ❌ 未实现 | CheckoutScreen无MPC钱包检测/余额显示逻辑 |
| CRYPTO: WalletConnect 深链 | ❌ 未实现 | 无WalletConnect import或深链处理 |
| CRYPTO: Scan to Pay (二维码+轮询) | ❌ 未实现 | 无二维码生成或pay-intents轮询 |
| FIAT: Stripe 折叠面板 Credit/Debit | ❌ 未实现 | 仅一个按钮，无Stripe SDK集成、无WebView |
| BSC TESTNET badge (__DEV__感知) | ❌ 未实现 | 无`__DEV__`条件渲染 |
| 对接 `/unified-marketplace/purchase` | ✅ 真实API | `POST /unified-marketplace/purchase` with `paymentMethod` |
| checkoutUrl 跳转 | 🔴 **断裂** | 后端返回 `checkoutUrl` 后，代码只有 `Alert.alert('Payment', 'Redirecting...')`，**从未打开URL**。无WebView、无Linking.openURL、无深链回调 |

**关键差距**: 结算链路的"最后一公里"——打开支付页面——完全断裂。`Alert.alert` 替代了实际跳转。QuickPayScreen 是 100% UI Mockup（零API调用）。

#### 1.4 Task Market 任务大厅 — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 发单展现 (PostTaskScreen) | ✅ 真实API | `POST /merchant-tasks/marketplace/publish`，无fallback |
| 接单展现 (TaskMarketScreen) | ✅ + 种子数据 | `GET /merchant-tasks/marketplace/search`，空结果回退10条SEED_TASKS |
| 竞标/接受/拒绝 | ✅ 真实API | submitBid/acceptBid/rejectBid 全部apiFetch |
| Developer 身份状态管理 | ⚠️ 部分 | `/seller/dashboard` 被调用但后端路径实为 `/developer-accounts/dashboard`（路径不匹配） |

**状态**: ✅ **基本达标**（seller/dashboard 路径需修正）

#### 1.5 分佣结算看板 — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| ReferralDashboardScreen | ✅ 存在 | 在MeStack中注册 |
| PromoteScreen | ✅ 存在 | 在MeStack中注册 |
| TypeScript 类型错误修复 | ✅ | 无TS编译错误 |

**状态**: ✅ **达标**

---

### 阶段二：Agent (智能体操控) — Doc标注"Build 53 核心功能已完成"

#### 2.1 核心通信层重构 — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 全双工 WebSocket/SSE | ✅ 真实 | `realtime.service.ts` 中 `streamProxyChatSSE()` 使用EventSource |
| 流式对话逐字输出 | ✅ 真实 | SSE token-by-token rendering |
| Bedrock Claude fallback 流式连接 | ✅ 真实 | `streamDirectClaude()` 走 `/api/claude/chat` |

**状态**: ✅ **达标**

#### 2.2 执行透明度 (Thought Chain) — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 微缩执行轨迹 [Tool Call] / Thinking | ✅ 真实 | AgentChatScreen 解析并渲染思维链 |
| Trajectory 可视化 | ✅ 真实 | 执行节点UI |

**状态**: ✅ **达标**

#### 2.3 扫码连接 — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 类WhatsApp扫码机制 | ✅ 真实 | `SocialBindScreen` + `generateTelegramQr()` → `POST /openclaw/social/telegram/qr` |

**状态**: ✅ **达标**

#### 2.4 记忆库 Memory 管理 — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| MemoryManagementScreen | ✅ 存在 | AgentStack 中注册并可从快捷操作进入 |

**状态**: ✅ **达标**

#### 2.5 端侧基础能力 Device Bridging — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| DeviceBridgingService (GPS/剪贴板/相册) | ✅ 真实 | `deviceBridging.service.ts`，expo-image-picker 已改为 lazy require (b90 fix) |

**状态**: ✅ **达标**

---

### 阶段三：Social (社交与社区) — Doc标注"Build 54 代码层已完成"

#### 3.1 社交媒体反馈回路 — Doc标注 ✅(后端已完成)

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| social-callback.controller.ts Webhook | ✅ 后端存在 | Twitter/Telegram/Discord 三平台接收 |
| 环境变量配置 | ⚠️ 未确认 | 需配置 `TWITTER_CONSUMER_SECRET` / `TELEGRAM_BOT_TOKEN` / `DISCORD_PUBLIC_KEY` |

**状态**: ⚠️ **后端就绪，生产配置待完成**

#### 3.2 人机混编群聊 — Doc标注 ✅ 🔴关键差距

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| @AgentName 调用 /claude/chat | ✅ 代码存在 | `GroupChatScreen` 解析mention → `POST /claude/chat` |
| 群消息获取 | 🔴 **端点不存在** | 调用 `GET /social/groups/{id}/messages`，后端无此路由（404） |
| 群消息发送 | 🔴 **端点不存在** | 调用 `POST /social/groups/{id}/messages`，后端无此路由（404） |

**关键差距**: 群聊功能完全不可用。虽然@Agent调用的代码在，但基础的消息收发端点在后端不存在。

#### 3.3 Community Feed Fork & Install — Doc标注 ✅

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| Post含skillId/skillName | ✅ 代码存在 | FeedScreen帖子类型扩展 |
| ⚡ Install 按钮→Checkout | ✅ 代码存在 | 点击跳转Market/Checkout |
| Feed数据来源 | ⚠️ 回退 | `GET /social/posts` 真实调用，空时回退4条 PLACEHOLDER_POSTS |

**状态**: ✅ **基本达标**

#### 3.4 Push Notifications — Doc标注 ✅(框架已完成)

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| Expo Push projectId 配置 | ✅ 真实值 | `96a641e0-ce03-45ff-9de7-2cd89c488236` |
| Token注册到后端 | ✅ 代码存在 | `registerTokenWithBackend()` |
| 生产证书 | ⚠️ 未配置 | 需FCM Service Account + APNs证书 |

**状态**: ⚠️ **框架就绪，生产配置待完成**

---

### 阶段四：终极交互形态升级 — Doc标注"Build 55+ 骨架就绪"

#### 4.1 全局悬浮唤醒 FloatingChatButton — Doc标注 ⚠️框架就绪

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 可拖拽悬浮球 | ✅ 代码完整 | PanResponder + edge-snapping，312行 |
| QuickChatSheet 调用 /claude/chat | ✅ 代码完整 | 但从未渲染 |
| 长按进入 VoiceChatScreen | ✅ 代码完整 | 600ms长按触发 |
| **是否挂载到App中** | 🔴 **否** | FloatingChatButton **从未被import或渲染**，是完全的死代码 |

**关键差距**: 功能完整的312行组件，但没有在任何地方挂载渲染。

#### 4.2 全天候流式语音 Voice-to-Voice — Doc标注 ⚠️骨架就绪

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| expo-av 录音 | ✅ lazy require + graceful degradation |
| 后端 `/api/voice/transcribe` (Whisper) | ✅ 真实API |
| `/hq/chat` 生成回复 | ✅ 真实API |
| expo-speech TTS 回读 | ✅ lazy require + graceful degradation |
| VAD 语音端点检测 | ❌ 未实现 | 手动"按住说话"模式 |

**状态**: ✅ **骨架达标**（VAD为未来需求）

#### 4.3 跨应用设备协同 — Doc标注 ❌未开始

**状态**: ❌ 未开始（符合预期）

---

## 二、Doc2 逐项对照（账户/钱包体系 + Agent模块优化）

### §一 账户与钱包体系架构

#### 两层账户体系 (AuthUser + AgentAccount)

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| AuthUser 个人钱包 | ✅ | 登录响应中填充 `walletAddress` |
| AgentAccount 专属钱包 | ✅ 已自动化 | `openWalletForAgent()` → `POST /mpc-wallet/create`，在agent创建成功回调中**自动触发** |
| MPC shard存储 | ✅ | `SecureStore.deleteItemAsync('mpc_shard_a')` 清理时删除 |

**与Doc2提出的问题对比**: Doc2指出"如果用户不主动点击Open Wallet，Agent就没有支付能力"。**此问题已修复** — `onSuccess` 回调自动调用 `openWalletForAgent(result.id)`。

### §2.1 钱包生成体验重设计（三步Wizard）

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| Step 1: 配置身份（名称/类型/能力） | ⚠️ 简化版 | CreateAgentModal 有 name + type，无"能力范围描述" |
| Step 2: 设置支出限额 | ❌ 未实现 | 创建时不设置 spendingLimits，使用后端默认值 |
| Step 3: 激活钱包（不可跳过） | ✅ 自动完成 | 自动调用，不走交互式wizard |
| 允许币种选择 | ❌ 未在创建流程 | 仅在 AgentPermissionsScreen 中可切换 |
| 二次确认金额阈值 | ❌ 未在创建流程 | 仅在 AgentPermissionsScreen 中可设 |
| 完成后充值$10激活按钮 | ❌ 未实现 | Agent Fund按钮是Alert.alert空壳 |

**差距**: Doc2要求的三步Wizard未实现。当前是一步Modal创建+自动钱包。功能性够用但体验不符设计。

### §2.2 Agent Console 改版：从控制台到驾驶舱

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| Agent切换下拉 + 添加按钮 | ✅ | 有instanceSelector + 添加 |
| Token能量条 + 百分比 | ✅ | 存储条 + token用量显示 |
| 切换引擎按钮 | ✅ (Alert) | `Alert.alert` 选择模型，非专属页面 |
| **[💬 开始对话] 最大按钮** | ✅ | `chatCta` 全宽卡片，标题 "Chat with {name}" |
| **4个子Tab: Overview/Skills/Tasks/权限** | ✅ (条件) | 4个Tab存在，权限Tab仅advanced/professional模式可见 |
| Overview 三卡片 (Skills数/Status/Type) | ⚠️ 部分 | 有存储条和用量，但非Doc2设计的三卡片布局 |
| 快捷操作: 活动日志/记忆库/工作流/语音/团队/Agent账户 | ✅ 完整 | 6个快捷入口全部存在 |
| 💻 下载桌面端 banner | ❌ 未实现 | 无 desktop download banner |

**差距**: 整体结构符合驾驶舱设计，UI布局细节（三卡片Overview、桌面端banner）缺失。

### §2.3 权限矩阵 Tab（全新功能）🔴关键差距

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 💳 支付权限区域 | ✅ UI存在 | auto-pay toggle + approval threshold + currency chips |
| 支出限额（单笔/日/月）可编辑 | ⚠️ 只读 | spendingLimits 从AgentAccount数据展示但**不可编辑** |
| 💻 设备控制权限 | ✅ UI存在 | 文件读取/程序启动/剪贴板/截屏/GPS 5项toggle |
| 🌐 网络 & Tool权限 | ✅ UI存在 | Web搜索/邮件/Twitter/Telegram/MCP Tools |
| MCP工具 "Manage →" | 🔴 **死按钮** | `<TouchableOpacity>` **无onPress handler** |
| 暂停Agent | ⚠️ HTTP方法不匹配 | 前端 `PATCH /agent-accounts/:id/suspend`，后端使用 `POST`（405） |
| 终止Agent | 🔴 **空壳** | `onPress: () => {}` — 完全无操作 |
| 权限状态持久化 | 🔴 **断裂** | toggle变更只保存到本地state(DEFAULT_PERMISSIONS)，`handleSave` 发送 `PATCH` 到后端（后端用PUT），且**页面加载时不从后端读取权限状态** |

**关键差距**: 权限矩阵看似完整但是空壳：
1. 权限状态每次打开页面都重制为DEFAULT_PERMISSIONS默认值
2. MCP管理按钮无功能
3. 终止按钮无功能
4. Suspend 使用错误HTTP方法(PATCH vs POST)
5. Save 使用错误HTTP方法(PATCH vs PUT)

### §2.4 可视化LLM引擎配置 🔴严重缺失

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 专属设置页 | ❌ | 仅Alert.alert弹窗，7个预置模型 |
| 平台托管模式 | ✅ 默认 | 默认走平台Bedrock |
| 自备API Key模式 (BYOK) | ❌ | 无输入自有OpenAI/Anthropic Key的入口 |
| 本地模型 (Ollama/LM Studio) | ❌ | 无Ollama/LM Studio/自定义端点配置 |
| 高级路由（对话/代码/长文档→不同模型） | ❌ | 无任务类型→模型映射 |
| 参数调节 (temperature/maxTokens/topP) | ❌ | maxTokens 硬编码2048，无UI控制 |

**关键差距**: Doc2设计了完整的三模式LLM配置页面（平台托管/BYOK/本地模型）+ 高级路由 + 参数调节。当前仅有Alert弹窗选择7个预置模型名。

### §2.5 渐进式用户成长体系（界面复杂度滑块）

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| UiComplexity 类型定义 | ✅ | `'beginner' | 'advanced' | 'professional'` in settingsStore |
| 默认beginner | ✅ | 默认值 `'beginner'` |
| AsyncStorage 持久化 | ✅ | zustand/persist |
| SettingsScreen 模式切换UI | ✅ | ClawSettingsScreen 有三按钮（🌱新手/🔧进阶/⚡专业） |
| **条件渲染覆盖面** | 🔴 **极小** | **仅在AgentConsoleScreen 1处**使用（控制权限Tab是否显示），Doc2功能矩阵中11项差异化渲染**零实现** |

**差距明细 — Doc2 要求的差异化渲染**:

| 功能项 | 新手→隐藏 | 代码中是否条件渲染 |
|--------|-----------|-------------------|
| 模型切换 | 新手隐藏 | ❌ 所有模式都显示 |
| 工作流列表 | 新手隐藏 | ❌ 所有模式都显示 |
| 记忆库/RAG | 新手隐藏 | ❌ 所有模式都显示 |
| Agent账户权限矩阵 | 新手/进阶隐藏 | ✅ 仅此一项 |
| 自定义LLM端点 | 新手/进阶隐藏 | ❌ 功能本身不存在 |
| 工作流节点图编辑 | 新手/进阶隐藏 | ❌ 未条件渲染 |
| MCP工具白名单 | 新手/进阶隐藏 | ❌ 未条件渲染 |
| API Key管理 | 新手隐藏 | ❌ 未条件渲染 |
| 团队空间 | 新手隐藏 | ❌ 未条件渲染 |

### §2.6 新手引导（Onboarding Checklist）

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 3步任务清单卡片 | ✅ 完整 | AgentConsoleScreen顶部，3步 |
| Step 1: 部署Agent | ✅ | 有activeInstance时自动标记 |
| Step 2: 安装Skill→前往市场 | ✅ | "Browse Market →" 跳转SkillInstall |
| Step 3: 创建工作流→创建 | ✅ | "Create →" 跳转WorkflowList |
| 2步完成→自动升级advanced | ✅ | 代码中 `setUiComplexity('advanced')` |
| 完成后卡片自动消失 | ✅ | 3步全Done时隐藏 |
| 庆祝动效 | ❌ | 无动效 |

**状态**: ✅ **基本达标**（缺庆祝动效，minor）

---

### §三 底部导航栏优化

| 需求项 | 实际状态 | 详情 |
|--------|----------|------|
| 从5Tab合并为4Tab | ✅ 已完成 | `[Agent] [Explore] [Social] [Me]` |
| Social内含 Feed+私信+群组 | ⚠️ 部分 | SocialStack有Feed/群聊，但私信路由调用错误API |
| Chat独立Tab消除 | ✅ | 无独立Chat Tab |

**状态**: ✅ **结构达标**（API路径问题见下）

---

## 三、跨文档 — 高频场景端到端流程分析

### 🎯 场景1: 语音 → Agent检索 → 安装技能

```
用户语音 → expo-av录音 → POST /api/voice/transcribe
→ 文字 → POST /api/hq/chat → Agent回复
→ expo-speech TTS → 用户听到回复
→ ... 用户手动导航到Market → 搜索 → 安装
```

| 步骤 | 状态 | 问题 |
|------|------|------|
| 语音录制 | ✅ | expo-av, lazy require |
| 语音转文字 | ✅ | POST /api/voice/transcribe |
| Agent理解并回复 | ✅ | POST /api/hq/chat |
| TTS回读 | ✅ | expo-speech |
| **Agent主动搜索技能** | ❌ | Agent无法调用marketplace search工具 |
| **语音中直接安装** | ❌ | 无语音→安装的自动化链路 |

**差距**: 语音对话本身可用，但Agent没有marketplace搜索/安装的Tool能力，无法实现"用户说话→Agent检索→安装"的闭环。

### 🎯 场景2: 发布技能

```
用户 → 无专门的"发布技能"入口
后端有 /developer-accounts，但前端 seller.api.ts 调用 /seller/dashboard（404）
```

| 步骤 | 状态 | 问题 |
|------|------|------|
| 开发者注册 | ⚠️ | seller.api.ts 的API路径与后端不匹配 |
| 技能上传界面 | ❌ | 无 PublishSkillScreen 或类似页面 |
| 技能审核状态 | ⚠️ | seller.api.ts getMySkills() fallback到MOCK |

**差距**: 前端无"发布技能"完整入口，seller API路径不匹配后端。

### 🎯 场景3: 发布任务 / 接受任务

```
用户 → PostTaskScreen → POST /merchant-tasks/marketplace/publish ✅
用户 → TaskMarketScreen → 浏览任务 → TaskDetailScreen → submitBid ✅
```

| 步骤 | 状态 | 问题 |
|------|------|------|
| 发布任务 | ✅ | PostTaskScreen → publish API |
| 浏览任务 | ✅ | TaskMarketScreen (空时显示SEED_TASKS) |
| 投标 | ✅ | submitBid API |
| 接受投标 | ✅ | acceptBid/rejectBid API |
| 我的任务/投标 | ✅ | getMyTasks/getMyBids API |

**状态**: ✅ **基本达标**

### 🎯 场景4: 支付（购买技能/资源）

```
用户 → CheckoutScreen → 选择支付方式 → POST /unified-marketplace/purchase
→ 后端返回 checkoutUrl → ❌ Alert.alert 替代了实际跳转
→ 永远无法完成支付
```

| 步骤 | 状态 | 问题 |
|------|------|------|
| 选择商品 | ✅ | marketplace detail → checkout |
| 选择支付方式 | ✅ | stripe/transak/x402 按钮 |
| 发起购买请求 | ✅ | POST /unified-marketplace/purchase |
| **打开支付页面** | 🔴 **断裂** | `Alert.alert('Redirecting...')` 替代 Linking.openURL() |
| **支付完成回调** | 🔴 **不存在** | 无 deep link listener，无 polling，无 webhook handler |
| **支付状态更新** | 🔴 **不存在** | 无订单状态轮询或监听 |

**差距**: 支付链路最关键的部分（打开外部支付页 + 回调确认）完全缺失。

---

## 四、API 路径不匹配汇总

| 前端调用 | 后端实际 | 类型 | 影响 |
|----------|----------|------|------|
| `GET /social/groups/{id}/messages` | ❌ 不存在 | 404 | 群聊不可用 |
| `POST /social/groups/{id}/messages` | ❌ 不存在 | 404 | 群聊发消息不可用 |
| `GET /social/dm/{userId}/messages` | `GET /messaging/dm/{partnerId}` | 路径不匹配 | 私信不可用 |
| `POST /social/dm/{userId}/messages` | `POST /messaging/dm/{receiverId}` | 路径不匹配 | 发送私信不可用 |
| `GET /social/feed/following` | `GET /social/posts?sort=following` | 路径不匹配 | 关注Feed不可用 |
| `PATCH /agent-accounts/{id}` | `PUT /agent-accounts/{id}` | 方法不匹配 | 权限保存405 |
| `PATCH /agent-accounts/{id}/suspend` | `POST /agent-accounts/{id}/suspend` | 方法不匹配 | 暂停Agent 405 |
| `PATCH /agent-accounts/{id}/resume` | `POST /agent-accounts/{id}/resume` | 方法不匹配 | 恢复Agent 405 |
| `POST /mpc-wallet/check` | `GET /mpc-wallet/check` | 方法不匹配 | 钱包检查405 |
| `GET /seller/dashboard` | `GET /developer-accounts/dashboard` | 路径不匹配 | 卖家看板404 |

---

## 五、死代码 / 孤儿文件

| 文件 | 状态 | 说明 |
|------|------|------|
| `FloatingChatButton.tsx` | 死代码 | 312行完整实现，从未import/渲染 |
| `DMListScreen.tsx` | 孤儿 | 调用正确API路径(/messaging/*)但未注册到导航 |
| `DMChatScreen.tsx` | 孤儿 | 调用正确API路径(/messaging/*)但未注册到导航 |
| `ChatStackNavigator.tsx` | 死代码 | 定义了但未被任何地方import |
| `SettingsScreen.tsx` (根目录) | 疑似孤儿 | 根级别settings，ClawSettingsScreen在MeStack中使用 |
| `QuickPayScreen.tsx` | UI Mockup | 100% mock数据，零API调用 |

---

## 六、OpenClaw Singapore 服务器集成状态

### 后端 (Tokyo → Singapore)
- `openclaw-skill-hub.service.ts`: 配置了 `18.139.157.116` 的4个端口 (3001/8080/11435/80)
- `openclaw-connection.service.ts`: `CLOUD_HOST = process.env.CLOUD_HOST || '18.139.157.116'`
- 后端每5分钟 cron 刷新缓存，尝试 7个endpoint path × 4个baseUrl = 28种组合
- **问题**: docs/issues-2026-02-25.md 记录"后端搜索 Singapore 服务器的 OpenClaw Hub API 全部超时"

### 前端 (Mobile → ?)
- `openclawHub.service.ts`: 只尝试 `hub.openclaw.ai` 和 `registry.openclaw.ai`（公网域名，不可达）
- **完全没有调用后端的 `/openclaw/bridge/skill-hub` 端点**
- 注释明确写: *"We intentionally skip the backend bridge because it returns internal Agentrix system tools"*
- 回退到 30条 HUB_PLACEHOLDER 硬编码数据

### 差距
前端应该通过后端桥接来获取Singapore技能数据，而不是直连不存在的公网域名。或者，Singapore服务器需要开放一个可直达的API端点并更新前端URL。

---

## 七、优先级排序修复计划

### P0 — 阻断用户核心流程（必须修复）

| # | 修复项 | 工作量估计 | 影响 |
|---|--------|-----------|------|
| 1 | **CheckoutScreen 支付跳转**: `Alert.alert` → `Linking.openURL(checkoutUrl)` + 返回App后轮询订单状态 | 2-3h | 支付完全不可用 |
| 2 | **Social DM API路径修正**: 将活跃的 `DirectMessageScreen` 改为调用 `/messaging/dm/:partnerId` (或用orphaned的DMChatScreen替换) | 1-2h | 私信不可用 |
| 3 | **GroupChat API路径**: 后端需新增 `/social/groups/:id/messages` 端点，或前端改调已有的messaging模块 | 2-3h | 群聊不可用 |
| 4 | **HTTP方法修正 (PATCH→POST/PUT)**: agent-accounts suspend/resume/update, mpc-wallet check | 1h | 权限保存/暂停/恢复405 |
| 5 | **OpenClaw前端→后端桥接**: 前端改为调用 `/openclaw/bridge/skill-hub` 获取Singapore技能数据，不再直连不存在的域名 | 2h | 技能列表只有占位数据 |

### P1 — 功能严重不完整

| # | 修复项 | 工作量估计 | 影响 |
|---|--------|-----------|------|
| 6 | **权限矩阵修复**: 页面加载时从后端读取权限状态 + MCP Manage按钮功能 + Terminate按钮功能 | 3-4h | 权限页是空壳 |
| 7 | **FloatingChatButton挂载**: 在MainTabNavigator或App.tsx中渲染FloatingChatButton | 30min | 完整功能的组件未使用 |
| 8 | **seller/dashboard路径修正**: `seller.api.ts` 改为 `/developer-accounts/dashboard` | 30min | 卖家看板404 |
| 9 | **UiComplexity条件渲染扩展**: 在Console快捷操作和各Stack中根据complexity隐藏/显示功能 | 3-4h | 复杂度滑块无效果 |

### P2 — 新功能开发（Doc2 Build 55目标）

| # | 修复项 | 工作量估计 | 影响 |
|---|--------|-----------|------|
| 10 | **LLM引擎配置页**: 替换Alert弹窗为专属设置页，支持BYOK和本地模型 | 8-12h | 用户体验提升 |
| 11 | **三步Agent创建Wizard**: 替换单步Modal为引导式创建流程 | 4-6h | 用户体验提升 |
| 12 | **Agent Console Overview三卡**: 重构Overview区域为Doc2设计的三卡片布局 | 2-3h | UI美化 |
| 13 | **支付完整重建**: QuickPay/WalletConnect/ScanToPay/Stripe折叠面板 | 16-24h | 完整Web端对齐 |
| 14 | **庆祝动效**: onboarding完成时Lottie/Confetti | 1h | 体验细节 |

### P3 — 清理与优化

| # | 修复项 | 工作量估计 | 影响 |
|---|--------|-----------|------|
| 15 | **清理死代码**: 删除或集成 DMListScreen/DMChatScreen/ChatStackNavigator/QuickPayScreen | 1h | 代码卫生 |
| 16 | **MOCK/PLACEHOLDER数据标记**: 所有mock fallback加 `[Preview]` 或 `[Sample Data]` UI标记 | 2h | 用户不被误导 |
| 17 | **生产Push Notifications配置**: FCM + APNs证书 | 2h | 推送不可用 |
| 18 | **social-callback env配置**: Twitter/Telegram/Discord API keys | 1h | 社交回路不通 |

---

## 八、数据真实性总结

| 数据来源 | 来源方式 | 何时使用 |
|----------|----------|----------|
| HUB_PLACEHOLDER (30条) | 前端硬编码 | hub.openclaw.ai不可达时（永远） |
| MOCK_SKILLS (12条) | 前端硬编码 | marketplace search空/失败时 |
| SEED_TASKS (10条) | 前端硬编码 | task search空/失败时 |
| PLACEHOLDER_POSTS (4条) | 前端硬编码 | social/posts空/失败时 |
| MOCK_DASHBOARD | 前端硬编码 | seller dashboard失败时（永远，路径不对） |
| MOCK_SELLER_SKILLS | 前端硬编码 | seller skills失败时 |
| DEFAULT_PERMISSIONS | 前端硬编码 | 每次打开权限页（不从后端读取） |
| 后端40条built-in skills | 后端硬编码 | Singapore全部超时后的后端fallback |

> **结论**: 当前用户看到的绝大部分数据是 mock/placeholder（因为 OpenClaw Hub 不可达、API路径不匹配等原因），真实后端数据仅在 Agent对话(claude/chat)、Agent实例管理(openclaw/*)、社交帖子(social/posts) 等少数场景可达。
