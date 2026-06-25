# Agentrix 多平台产品上线审计与完善计划

## 概述
Agentrix 是一个成熟的 AI 智能体平台，具有完整的支付协议、技能市场和多钱包支持。完整的全栈架构已基本搭建完成，从单一 NestJS 后端为移动端、桌面端和网页端提供服务。系统架构逻辑清晰、设计合理，但距离产品公开上线仍存在关键性的功能缺陷和安全隐患，需要系统性的完善。

---

## 当前系统架构总览

| 模块 | 就绪度 | 核心优势 | 主要缺陷 |
|------|------|---------|--------|
| **后端** (NestJS 10, 80+ 模块) | ~75% | 支付系统(47+ 服务商)、认证(6种方式)、AI集成、技能系统 | 社交→智能体分发未实现、缺少速率限制、密钥存储在代码库中 |
| **网页端** (Next.js 13.5) | ~65% | 架构设计优秀、11个Context、国际化(EN/ZH)、技能市场完整 | 管理后台工作流40%完成、Passkey仅为UI、无WebSocket、缺SEO文件 |
| **移动端** (Expo SDK 54) | ~85% | 聊天、技能市场(5200+技能)、任务市场、社交、钱包 | 空投/自动收益为占位符、分享URL硬编码、部分错误提示基础 |
| **桌面端** (Tauri 2.2) | ~45% | 聊天流、语音I/O、文件树、跨设备同步 | Alpha版本(v0.1.0)、QA登录硬编码在dist、唤醒词未配置 |
| **智能合约** (8个Solidity合约) | 测试网前置 | 多场景分佣、X402、ERC8004会话密钥 | 3个临界问题 + 5个高危问题(内部审计) |

---

## 技术栈详情

### 后端
- **框架**: NestJS 10.x (TypeScript)
- **数据库**: PostgreSQL (TypeORM ORM)
- **认证**: JWT + Passport.js (OAuth策略)
- **API**: HTTP REST (Express) + WebSocket (Socket.io)
- **进程管理**: PM2 (agentrix-backend, agentrix-frontend, openclaw-gateway)
- **服务器**: 18.139.157.116 (新加坡) | 域名: agentrix.top | PEM密钥: hq.pem(桌面)

### 网页前端
- **框架**: Next.js 13.5.6 (React 18)
- **样式**: Tailwind CSS
- **状态管理**: React Context (11个Provider) + React Query
- **Web3**: ethers.js, viem, wagmi
- **支付**: Stripe集成、多链钱包适配

### 移动端
- **框架**: React Native (Expo SDK 54)
- **状态管理**: Zustand
- **导航**: React Navigation 7.x
- **存储**: Expo SecureStore (加密令牌), AsyncStorage
- **特性**: 摄像头、二维码扫描、语音、生物识别、推送通知

### 桌面端
- **框架**: Tauri 2.2 (Rust后端 + React 18 + Vite前端)
- **窗口**: 浮球UI(400x400可拖拽) + 聊天面板
- **功能**: 系统剪贴板监控、语音I/O、文件树、Git集成、跨设备同步
- **存储**: Tauri加密Store + OS keychain

### 智能合约
- **语言**: Solidity 0.8.20
- **框架**: Hardhat
- **目标链**: BSC主网/测试网 (网络ID: 56/97)
- **核心合约**: AutoPay, Commission, PaymentRouter, X402Adapter, ERC8004SessionManager, AuditProof, BudgetPool

---

## 后端模块完整清单 (80+ 模块)

### ✅ 完成度 90%+ 的模块
- **认证系统**: JWT + OAuth (Google/Apple/Twitter/Discord/Telegram) + 钱包签名
- **支付系统**: 47+ 服务商路由 (Stripe, Transak, Uphold, Monerium, OSL, ramp-network等)
- **钱包管理**: 多链支持 (EVM/Solana), MPC钱包, NFT管理
- **AI集成**: Claude, OpenAI, Groq, Gemini, Bedrock多模型支持
- **技能系统**: OpenAPI导入、动态工具适配、生态导入器、发布工作流
- **OpenClaw代理**: 聊天代理、技能代理、WebSocket桥接、Telegram机器人集成
- **账户系统**: 用户、商家、开发者、代理账户管理
- **区块链支持**: ERC-4337账户抽象, ERC-8004快速支付, X-402协议

### 🟡 完成度 50-80% 的模块
- **社交系统** (⚠️严重): 事件持久化✅、事件→智能体分发❌
- **商务系统**: UI完整✅、后端逻辑80%✅
- **市场**: 旧市场(已禁用) + 统一市场V2.0并存，需清理
- **分析统计**: 框架就绪，实时数据缺失
- **工作流自动化**: 调度器存在，与支付/社交/智能体的集成不完整

### 🔴 完成度 <50% 的模块
- **密钥认证(Passkey)**: 仅UI存根，无WebAuthn实现
- **音频/语音集成**: Bedrock配置， agent工作流集成缺失
- **工作流触发**: 存根日志记录，不执行
- **智能体→智能体协作**: 框架存在，消息路由未实现

---

## 开发现状详情

### 🔐 安全隐患

**临界风险**:
1. `.env`文件纳入版本控制，包含所有API密钥、私钥、数据库凭证
2. JWT_SECRET、SESSION_SECRET使用默认值
3. 生产环境`ALLOW_GPTs=true`时CORS允许所有源(CSRF风险)
4. Telegram webhook仅URL验证，无签名验证
5. 管理端点缺少RBAC强制

**缺失的功能**:
- 全局速率限制中间件
- 2FA/MFA多因素认证
- 支付敏感数据脱敏
- Webhook重试和重复事件处理

### 📊 智能合约安全审计结果

**临界问题(3个)**:
- AutoPay授权模式不一致
- X402签名验证跨域漏洞
- Commission对非标ERC20(USDT)处理缺陷

**高危问题(5个)**:
- 缺少重入保护(ReentrancyGuard)
- 分佣拆分精度损失
- 批量执行Gas限制风险
- Provider/Relayer权限边界模糊
- 小数位数硬编码

**结论**: 不推荐主网部署，需先完成所有临界+高危修复并通过外部审计

### 🔌 核心集成缺陷

**社交→智能体分发(最严重)**:
```
Twitter/Telegram/Discord事件 (webhook)
    ↓
社交回调控制器 ✅ (接收、持久化)
    ↓
dispatchEvent() ❌ (TODO存根)
    ↓
智能体执行 ❌ (未实现)
    ↓
响应路由回社交平台 ❌ (未实现)
```

当前状态: 事件持久化到数据库，但智能体无法自动响应。这是产品价值主张的核心缺陷。

**后端集成TODO项**:
- Launchpad集成: 3处存根需实现真实API
- DEX集成: 需实现真实API调用
- AI模型选择: 仍为mock数据
- 合约监听器: 合约地址硬编码，需从DB读取
- Solana签名验证: wallet.service.ts 未实现
- 策略验证: 协议强制执行从DB读取(待实现)

---

## 网页端 (Next.js) 审计结果

### ✅ 完成的功能 (90%+)
- **基础设施**: TypeScript零错误、React 18、Context API、Tailwind CSS
- **认证**: 邮箱/密码、Web3钱包(MetaMask可用)、OAuth存根
- **国际化**: 中英文完整支持，动态切换
- **导航**: 响应式设计，移动/平板/桌面布局
- **市场功能**: 搜索(去抖300ms)、分类筛选、评分排序、翻译链接、分页
- **错误处理**: ErrorBoundary组件、404/500页面、MetaMask错误静默处理
- **布局**: 粘性顶部导航、页脚、仪表盘布局

### 🟡 部分完成的功能 (50-80%)
- **支付流程**(70%): Stripe✅、UI✅、意图创建✅、Passkey❌(UI仅)、X402❌(演示版)、Transak❌(预配置未测)
- **智能体生成器**(60%): 模板库✅、UI✅、KYC集成✅、自定义工作流❌、收入计算❌
- **钱包集成**(50%): MetaMask✅、WalletConnect v2❌、Phantom(Solana)❌、OKX❌、状态持久化❌
- **管理面板**(40%): 数据表✅、搜索筛选✅、商家审批工作流❌、产品评审❌、风险管理❌
- **技能生态**(65%): 搜索✅、分类✅、发布工作流❌、代码生成环境❌、版本管理❌

### 🔴 缺失的功能 (<50%)
- **Passkey认证**: 仅WebAuthn UI存根，无生物识别实现
- **高级支付**: 多签支付、X402协议、Smart Routing后端验证、Escrow管理
- **实时特性**: WebSocket集成、通知系统、订单实时更新、实时分析
- **本地化SEO**: 无robots.txt / sitemap.xml、Meta标签不完整、代码分割最少
- **性能优化**: 无图片优化、无懒加载策略、Bundle大小原始状态

### 📋 50+ 页面清单

**公开营销页面**: 首页、特性、用例、开发者中心  
**市场探索**: 统一市场、任务市场、产品详情页、技能详情页  
**智能体生成**: 5分钟生成器、增强工作区、工作台v3、体验预览、独立查看器  
**支付结账**: 结账流程、成功页、支付演示(代理/商家/Smart Routing/X402/用户)、guest结账  
**应用仪表盘**: 单一动态路由`app/[[...path]]`服务多角色(用户/代理/商家/开发者)子页面  
**管理面板**: 15+页面(开发者、商家、用户、产品、技能、基金路径、风险、邀请码等)  
**认证**: 登录、注册、回调、OAuth登录  
**生产就绪分数**: **6/10**

---

## 移动端 (Expo SDK 54) 审计结果

### 📊 40+ 屏幕完整清单

**核心功能屏幕** ✅ (正常工作):
- HomeScreen (多身份中心)
- AgentChatScreen (1640行，实时聊天、语音、OpenClaw集成)
- MarketplaceScreen (5200+技能，搜索/筛选)
- TaskMarketScreen (赏金、投标、X402链上结算)
- 社交栈 (7屏): 信息流、发帖、创建、DM、群聊、用户资料
- WalletConnectScreen (MetaMask、OKX、imToken、Bitget、TokenPocket)
- MyAgentsScreen (OpenClaw实例管理)
- 个人资料 & 设置屏幕

**代理工具 & 管理** (15屏):
- AgentSpace, AgentTools, AgentLogs, AgentConsole, AgentPermissions
- MemoryManagement, StoragePlan, SkillInstall, SkillPack, WorkflowDetail
- DesktopControl, LocalConnect, OpenClawBind, TeamSpace, TeamInvite

**盈利和商务**:
- CommissionEarnings, CommissionRules, CommissionPreview
- BudgetPools, SplitPlans, QuickPay, Settlements
- ReferralDashboard, MyLinks, CreateLink

**⚠️ 占位符屏幕**:
- AirdropScreen.tsx: Mock数据(Jupiter, LayerZero, zkSync) + TODO注释
- AutoEarnScreen.tsx: Mock DeFi策略(Aave, Lido, Marinade) + 硬编码数据

### 📦 Zustand状态管理

| Store | 用途 | 关键状态 |
|-------|------|---------|
| authStore | 认证+实例 | user, token, activeInstance, onboarding |
| identityStore | 身份切换 | activeIdentity, pending |
| settingsStore | 用户偏好 | 主题, 语言 |
| notificationStore | 推送/Toast | unreadCount, notifications |
| i18nStore | 国际化(EN/ZH) | language, translate |

**Token存储**: Expo SecureStore, 降级到MMKV/AsyncStorage

### 🔌 API集成与配置

```
开发环境    → https://api.agentrix.top/api
Staging    → https://staging-api.agentrix.top/api
生产       → https://api.agentrix.top/api
WebSocket  → wss://api.agentrix.top
分享URL    → https://clawlink.app (硬编码为生产，始终)
```

### 🚨 硬编码值和问题

**临界问题**:
- `SHARE_BASE_URL` 始终指向生产，即使在dev/staging — sharecard链接错误
- Picovoice访问密钥默认为空

### 📊 功能矩阵

| 功能 | 状态 | 备注 |
|------|------|------|
| 聊天 | ✅ | 流式、历史、OpenClaw集成 |
| 市场/技能 | ✅ | 5200+真实技能 |
| 任务赏金 | ✅ | 投标、提案、X402链上结算 |
| 社交 | ✅ | 发帖、DM、群聊、分享卡 |
| 钱包 | ✅ | 多链、多钱包、MPC备份 |
| 认证 | ✅ | 6个服务商，全部可用 |
| 自动收益 | ⚠️ | Mock DeFi策略，无API |
| 空投 | ⚠️ | Mock空投，TODO API |
| 商务/佣金 | ⚠️ | UI完整，后端需工作 |
| 市场列表 | ✅ | 发布技能、管理 |
| 推荐计划 | ⚠️ | UI存在，API集成不完整 |

**生产就绪度: 85%**

---

## 桌面端 (Tauri 2.2) 审计结果

### 🎨 8个核心面板

1. **ChatPanel** - 多标签聊天、语音I/O、附件、Git集成
2. **FloatingBall** - 可拖拽启动器
3. **LoginPanel** - OAuth + 钱包 + 邮箱
4. **OnboardingPanel** - 实例/工作区设置
5. **SettingsPanel** - 唤醒词(Picovoice)、工作区路径、API配置
6. **SpotlightPanel** - 命令面板(/ 前缀)
7. **FileTreePanel** - 工作区文件浏览器 + Git操作
8. **NotificationCenter** - 徽章 + Toast通知

### 🚨 硬编码值and问题

**临界问题**:
- desktop/dist/qa-login.json 硬编码在dist中 - 生产构建中的安全风险

**警告**:
- Picovoice访问密钥需要但默认为空
- 工作区路径用户可设置但验证最少

### 📊 功能矩阵

| 功能 | 状态 | 备注 |
|------|------|------|
| 聊天 | ✅ | 多标签、流式、文件附件 |
| 语音I/O | ⚠️ | 录音✅、合成✅、唤醒词需配置 |
| 唤醒词 | ⚠️ | 配置驱动，Picovoice，默认为空 |
| 工作区 | ⚠️ | 文件树✅，Git操作基础 |
| Git集成 | ✅ | 状态、diff、log、提交 |
| 跨设备同步 | ⚠️ | Beta，会话同步工作中 |
| 剪贴板监控 | ✅ | 上下文检测 |
| 设置 | ✅ | 主题、唤醒词、工作区路径 |
| 通知 | ✅ | 桌面toast + 徽章 |
| 自动更新 | ✅ | Tauri更新器已配置 |

**生产就绪度: 45%** (Alpha v0.1.0)

---

## 智能合约详情

### 📄 8个核心合约

| 合约 | 功能 |
|------|------|
| AutoPay.sol | 基于ERC20授权的自动支付基金 |
| Commission.sol | 多场景分佣结算 |
| CommissionV2.sol | 改进版本 |
| PaymentRouter.sol | 多token支付路由 & 提现管理 |
| X402Adapter.sol | X402协议会话管理 + 签名验证 |
| ERC8004SessionManager.sol | ERC8004会话管理，日重置逻辑 |
| AuditProof.sol | 任务审计和资金支付 |
| BudgetPool.sol | 代理预算管理 |

### 🔐 安全审计报告结论
**状态**: ⚠️ 不推荐主网部署

**临界问题(3个)** + **高危问题(5个)** → 需完成修复后进行外部审计

---

## 测试基础设施

### 🎭 E2E测试 (Playwright)
- **框架**: Playwright + Chromium  
- **超时**: 30秒/测试, 重试1次  
- **报告**: HTML输出 (`tests/reports/e2e-html/`)  
- **基础URL**: https://api.agentrix.top/api

**规格文件**:
1. commerce-all-modules.spec.ts - 综合3阶段测试
2. openclaw-hub-skills.spec.ts - 技能中心桥接
3. gap-fixes-verification.spec.ts - 差距闭合验证
4. desktop-sync-approval-agent.spec.ts - 桌面同步流程
5. cross-platform-regression.spec.ts - 多平台兼容性

### 📋 后端单元测试
**状态**: 最少，API端点仅商务阶段有覆盖

### 💾 智能合约单元测试
**状态**: 基础流程完成；边界案例和攻击场景需扩展

---

## CI/CD & 部署基础设施

### 🚀 GitHub Actions工作流
1. **deploy-backend-prod.yml** - 手动生产部署 (build136)
2. **build-apk.yml** - 移动APK构建
3. **build-ios-simulator.yml** - iOS模拟器构建
4. **build-desktop.yml** - 多平台桌面构建(Tauri)
5. **sync-mobile-build-repo.yml** - 移动端repo同步

### 📊 部署细节

**生产IP**: 18.139.157.116 (新加坡)  
**服务器**: ubuntu@18.139.157.116  
**部署路径**: /home/ubuntu/Agentrix  
**PEM密钥**: hq.pem (C:\Users\15279\Desktop\hq.pem)  
**进程管理**: PM2  
- agentrix-backend (port 3001)
- agentrix-frontend (port 3000)
- openclaw-gateway

**健康检查**: `GET /api/health` → `{status: 'ok'}`  
**默认部署分支**: build136

---

## 📋 5阶段完善计划 (6-7周)

### 第1阶段: 安全 & 紧急修复 (P0) — 1.5周

#### 1.1 密钥管理
- ✅ `.env` 已在 `.gitignore` 中，未被版本控制追踪
- ❌ 轮换所有暴露的密钥 (JWT_SECRET, SESSION_SECRET, API密钥, 私钥)
- ❌ 移至环境变量注入 (PM2生态config或AWS Secrets Manager)

#### 1.2 后端安全加固
- ✅ 全局速率限制已注册 (RateLimitGuard via APP_GUARD, 100req/60s/IP, 可配置)
- ✅ CORS已修复: 移除 `origin: true` 通配符，改为显式白名单 + GPT源
- ✅ 生产环境强制 JWT_SECRET/SESSION_SECRET 非默认值（否则拒绝启动）
- ✅ Telegram webhook 添加 `X-Telegram-Bot-Api-Secret-Token` 头验证
- ✅ Admin控制器添加 AdminGuard (检查JWT中 type==='admin'，拒绝普通用户令牌)
- ❌ 细粒度RBAC: AdminRole.permissions 数据已存在但未执行权限检查 (P1)

#### 1.3 智能合约临界修复 (3个临界问题)
- ✅ ReentrancyGuard 已存在于 AutoPay / Commission / X402Adapter — 确认无缺失
- ⚠️ X402Adapter `emergencyWithdraw` 缺少 EmergencyWithdraw 事件 — 低风险，主网前修复
- ⚠️ Commission `_autoSplit` 精度损失兜底：剩余金额转入 paymindTreasury — 可接受
- ❌ X402签名验证未包含 nonce，可能遭受重放攻击 — 主网前必须修复
- ❌ Commission 硬编码 USDT 6位小数假设 — 需确认所有目标链代币精度一致
- ❌ Provider/Relayer 权限边界需文档化 + 单元测试覆盖

#### 1.4 桌面端安全
- ✅ 从 desktop/public/ 移除了 qa-login.json（硬编码 QA 凭据）
- ✅ 在 .gitignore 中添加 `**/qa-login.json` 防止重新提交
- ❌ 确保Tauri Store加密密钥非硬编码

**关键路径** | **必须在阶段2之前完成**

---

### 第2阶段: 核心功能完善 (P1) — 2.5周

#### 2.1 社交→智能体分发管道 (最大后端缺陷)
- ❌ 实现从社交事件发现智能体 (哪个智能体处理哪个平台)
- ❌ 实现从持久化社交事件触发智能体执行
- ❌ 实现响应路由回社交平台 (Twitter回复、Discord消息、Telegram回复)
- ❌ 统一Social Listener路径和TelegramBotService为单一管道
- ❌ 实现错误处理和重试逻辑

#### 2.2 移动端占位符屏幕
- ❌ **AirdropScreen**: 将Mock数据替换为真实 `/api/airdrop` 端点
- ❌ **AutoEarnScreen**: 将Mock DeFi策略替换为真实 `/api/auto-earn` 端点
- ❌ **推荐计划**: 完成推荐仪表盘API集成

#### 2.3 网页前端工作流
- ❌ 实现管理批准工作流 (商家、产品评审、技能发布)
- ❌ 完成WalletConnect v2 + Phantom(Solana)钱包集成
- ❌ 添加WebSocket集成用于实时通知/订单更新
- ❌ 创建robots.txt + sitemap.xml用于SEO
- ❌ 添加OG meta标签到所有公开页面

#### 2.4 桌面端功能完善
- ❌ 完成Git操作 (分支、推送、合并)
- ❌ 文档化和配置唤醒词 (Picovoice密钥设置)
- ❌ 改进工作区文件沙箱化和验证
- ❌ 完善跨设备会话握手可靠性

#### 2.5 后端集成TODO项
- ❌ **Launchpad集成**: 实现3个TODO存根为真实API调用
- ❌ **DEX集成**: 实现真实API调用
- ❌ **AI模型选择**: 实现真实模型选择(非mock)
- ❌ **合约监听器**: 从DB解析合约地址(非硬编码)
- ❌ **Solana签名验证**: 实现Solana签名验证
- ❌ **策略验证**: 实现协议强制执行从DB读取

**社交分发最关键** | **可与阶段3并行**

---

### 第3阶段: 测试 & 质量 (P1) — 2周

#### 3.1 后端单元测试
- ❌ 添加支付流程单元测试 (Stripe、加密、Escrow)
- ❌ 添加认证流程集成测试 (6个提供者)
- ❌ 添加关键路径API端点测试 (订单生命周期、技能发布、代理聊天)
- ❌ 目标覆盖率 ≥60% for modules/

#### 3.2 网页前端测试
- ❌ 添加关键web用户旅程的E2E测试 (注册→市场→结账→支付)
- ❌ 添加支付表单、钱包连接的组件测试
- ❌ 添加管理工作流E2E测试

#### 3.3 智能合约安全测试
- ❌ 扩展边界案例覆盖 (重入、溢出、Gas限制)
- ❌ 添加攻击场景测试 (前体运行、重放攻击)
- ❌ 运行Slither/Mythril静态分析
- ❌ 完成多链部署测试 (BSC + Base)

#### 3.4 跨平台E2E
- ❌ 扩展现有Playwright套件覆盖社交webhook→代理响应周期
- ❌ 添加桌面同步/审批流程测试
- ❌ 测试移动端↔桌面端会话握手

**可与阶段2并行**

---

### 第4阶段: 基础设施 & 可观测性 (P2) — 1.5周

#### 4.1 监控 & 告警
- ❌ 添加结构化日志记录 (Winston/Pino JSON格式)
- ❌ 设置日志聚合 (CloudWatch或ELK)
- ❌ 添加应用监控 (PM2指标 + 自定义健康仪表盘)
- ❌ 配置api.agentrix.top正常运行时间监控
- ❌ 设置错误追踪 (Sentry) for所有平台

#### 4.2 数据库 & 性能
- ❌ 审查和优化慢查询 (添加缺失的索引)
- ❌ 设置数据库自动备份 (pg_dump或RDS快照)
- ❌ 配置Redis缓存(生产应必需)
- ❌ 审查TypeORM迁移策略用于零停机部署

#### 4.3 CI/CD改进
- ❌ 添加Staging环境和部署管道
- ❌ 将数据库迁移作为CI管道的一部分
- ❌ 添加部署后冒烟测试 (健康检查 + 关键端点)
- ❌ 修复artifact上传配额问题 (使用替代存储)

#### 4.4 SSL & 域名
- ❌ 验证agentrix.top的SSL证书自动续期
- ❌ 配置适当的HTTPS重定向 (所有HTTP→HTTPS)
- ❌ 为前端静态资源设置CDN

**可在阶段2/3后进行**

---

### 第5阶段: 抛光 & 发布准备 (P2) — 1.5周

#### 5.1 网页前端抛光
- ❌ 为所有公开页面添加proper meta标签/OG标签
- ❌ 性能审计 (Lighthouse, Bundle大小优化)
- ❌ 实现骨架屏用于加载状态
- ❌ WCAG 2.1 AA无障碍通过
- ❌ 添加Cookie同意/隐私政策页面

#### 5.2 移动端抛光
- ❌ 修复硬编码SHARE_BASE_URL (应使用env配置)
- ❌ 添加适当的错误消息 (替换通用Alert.alert)
- ❌ 添加应用更新提示 (Expo Updates OTA)
- ❌ iOS构建和TestFlight提交
- ❌ Android Play Store列表准备

#### 5.3 桌面端抛光
- ❌ 版本升级 0.1.0 → 1.0.0
- ❌ 完成NSIS安装程序本地化
- ❌ macOS代码签名和公证
- ❌ 自动更新器端点生产配置
- ❌ 唤醒词设置用户文档

#### 5.4 智能合约部署
- ❌ 将修复后的合约部署到BSC测试网用于集成测试
- ❌ 进行外部安全审计 (内部修复后)
- ❌ 使用多签Admin进行主网部署
- ❌ 在BscScan验证所有合约

**并发执行**

---

## 📊 验证检查清单

1. **安全**: `grep -r "TODO|FIXME|HACK" backend/src/` 查找所有剩余存根
2. **后端健康**: `curl https://api.agentrix.top/api/health` 返回 `{status: 'ok'}`
3. **E2E回归**: `npx playwright test -c tests/e2e/playwright.config.ts` 全部通过
4. **合约测试**: `cd contract && npx hardhat test` — 修复后所有通过
5. **前端构建**: `cd frontend && npm run build` — 零错误
6. **移动端构建**: 推送到Agentrix-Claw，验证CI构建成功
7. **桌面端构建**: `cd desktop && npm run build && cd src-tauri && cargo build --release`
8. **合约静态分析**: `cd contract && slither .` 无临界发现
9. **Web性能**: 在https://agentrix.top运行Lighthouse，≥80分
10. **跨平台**: 验证QR登录流 移动端→桌面端工作正常

---

## 🎯 关键决策

1. **智能合约就绪度**: 主网部署前**必须完成**阶段1.3所有修复 + 外部审计
2. **桌面端策略**: Alpha(v0.1.0) — 优先移动端+网页端进行初始公开发布；桌面端作为Beta
3. **社交→智能体分发**: 后端最大缺陷，也是产品**核心**
4. **网页端管理面板**: 基础运营功能就绪，但工作流需完成
5. **分级和并行化**:
   - P0阶段1必须顺序完成 (安全)
   - P1阶段2和3可并行 (功能+测试)
   - P2阶段4和5可并行 (基础设施+抛光)

---

## ⚠️ 进一步考虑

### 1. Staging环境
**当前**: 无Staging服务器  
**建议**: 在主网合约部署前部署第二个实例用于生产前测试  

### 2. iOS应用商店
**当前**: 无iOS TestFlight/应用商店发布准备  
**如果iOS在范围内**: 与阶段2并行启动iOS提交流程  

### 3. 外部安全审计
**当前**: 内部安全审计发现15+问题  
**主网前**: 内部修复完成后应进行外部审计  
**推荐**: 预算CertiK/OpenZeppelin审计

### 4. 社交平台集成完整性
**当前**: 社交事件持久化✅，但代理分发❌  
**风险**: 用户发送社交事件但代理无响应  
**优先级**: 最高 — 这是核心功能

---

## 📈 整体生产就绪度评分

| 维度 | 评分 | 评论 |
|-----|------|------|
| **架构** | 9/10 | 清晰、可扩展、组织良好 |
| **功能完整性** | 7/10 | 核心完成，高级功能缺失 |
| **安全性** | 4/10 | 基础牢固，但密钥暴露、速率限制缺失 |
| **性能** | 5/10 | 无优化、Bundle大小原始 |
| **无障碍性** | 5/10 | 基础存在，未经审计 |
| **错误处理** | 7/10 | 好的错误边界，消息有限 |
| **测试覆盖** | 0/10 | 后端单元测试最少 |
| **文档** | 6/10 | 架构md不错，代码注释稀疏 |
| **可观测性** | 2/10 | 监控、告警、日志聚合缺失 |
| **跨平台集成** | 6/10 | 会话同步部分、文件共享缺失 |

**总体生产就绪度: 5.5/10** ⚠️ **不建议启动前完成以上计划**

---

## 时间表估算

| 阶段 | 工作 | 预计时间 | 依赖关系 |
|-----|------|--------|-------|
| **P0** | 安全+合约修复 | 1.5周 | 关键路径 |
| **P1.1** | 社交分发 | 1周 | 在P0之后 |
| **P1.2** | 移动/网页/桌面功能 | 1.5周 | 可与P3并行 |
| **P2** | 后端/网页/合约测试 | 2周 | 可与P1.2并行 |
| **P3** | 监控/基础设施 | 1.5周 | 在P1之后 |
| **P4** | 抛光+审计 | 1.5周 | 可与P3并行 |
| **总计** | 全部完成到生产发布 | **6-7周** | 假设充足资源 |

---

## 结论

Agentrix系统架构设计合理、大部分功能已实现，距离多平台产品正式上线主要差距在:

1. **安全加固** (密钥、速率限制、RBAC) — 必须优先
2. **社交→智能体核心功能** — 产品价值主张
3. **占位符功能完成** (Airdrop、AutoEarn等) — 用户体验
4. **广泛的测试覆盖** — 质量和稳定性
5. **可观测性和监控** — 生产运维
6. **智能合约安全** — 金融合规

通过上述5个阶段的系统完善，Agentrix可在6-7周内达到**生产就绪状态**，具备安全、功能完整、测试充分的多平台产品上线能力。