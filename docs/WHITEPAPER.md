# Agentrix 白皮书 / Whitepaper

**Agentrix — The Personal AI Agent Economy Platform**

> 让每个人拥有自己的 AI Agent，自主完成消费、支付、投资与社交任务

**Version 1.0 · March 2026**

---

## 目录 / Table of Contents

1. [执行摘要 Executive Summary](#1-执行摘要)
2. [问题与机遇 Problem & Opportunity](#2-问题与机遇)
3. [产品架构 Product Architecture](#3-产品架构)
4. [核心技术 Core Technology](#4-核心技术)
5. [协议栈 Protocol Stack](#5-协议栈)
6. [智能合约体系 Smart Contracts](#6-智能合约体系)
7. [佣金与经济模型 Commission & Economics](#7-佣金与经济模型)
8. [Agent Skill 生态 Skill Marketplace](#8-agent-skill-生态)
9. [安全与合规 Security & Compliance](#9-安全与合规)
10. [完成度与路线图 Completion & Roadmap](#10-完成度与路线图)
11. [竞争分析 Competitive Analysis](#11-竞争分析)
12. [附录 Appendix](#12-附录)

---

## 1. 执行摘要

**Agentrix** 是一个完整的个人 AI Agent 经济平台，由以下核心组件构成：

| 组件 | 说明 | 状态 |
|------|------|------|
| **ClawLink Mobile App** | React Native 移动端（Expo SDK 54） | ✅ 已上线 (Build 104) |
| **Agentrix Backend** | NestJS 后端（82 个业务模块） | ✅ 生产环境运行 |
| **Agentrix JS SDK** | 30+ API 资源类，TypeDoc 文档 | ✅ 发布 |
| **Smart Contracts** | 8 个 Solidity 合约（BSC Testnet） | ✅ 已部署（审计中） |
| **OpenClaw Bridge** | 聚合 5,200+ 外部 AI Skills | ✅ 已集成 |
| **Multi-AI Engine** | Claude / GPT / Gemini / DeepSeek / Groq | ✅ 可用 |

**核心价值主张：**

1. **Agent 自主经济** — AI Agent 可以自行消费、支付和决策，通过 ERC-8004 Session Keys 获得用户授权
2. **全链路商业闭环** — 发现 → 购买 → 支付 → 佣金 → 物流 → 售后，全链路 Agent 化
3. **协议互操作** — X402 + ERC-8004 + MCP + A2A + UCP 五协议栈，与 OpenAI / Claude / Cursor 等生态无缝对接
4. **人人可参与的 AI 经济** — 佣金分润、推荐裂变、空投激励，让普通用户成为 AI 经济的参与者而非旁观者

---

## 2. 问题与机遇

### 2.1 当前 AI Agent 面临的问题

| 痛点 | 现状 |
|------|------|
| **Agent 无法消费** | 现有 AI Agent（ChatGPT、Claude）只能给建议，不能执行购买/支付 |
| **跨平台割裂** | 每个 AI 平台是独立孤岛，用户需要在多个 App 间切换 |
| **缺乏经济激励** | 用户没有动力推广 AI 工具，开发者难以变现 |
| **安全与授权** | Agent 操作需要可控的权限管理，现有方案缺失 |
| **支付摩擦** | Web3 支付体验差（Gas、签名、等待确认） |

### 2.2 市场机遇

- **AI Agent 市场**：预计 2027 年达到 $470B（Gartner，2025）
- **Web3 + AI 交叉赛道**：AI Agent 需要链上身份、链上支付与链上授权
- **移动端 AI 缺口**：当前 AI Agent 以桌面/API 为主，移动端生态空白巨大
- **协议标准窗口**：X402、MCP、A2A 等新协议刚形成，早期参与者享有标准制定红利

### 2.3 Agentrix 的解法

```
用户 ──> ClawLink App ──> Agentrix Agent
                              │
                     ┌────────┴────────┐
                     │  ERC-8004 授权   │
                     └────────┬────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   发现 Skill           执行支付              社交裂变
   (OpenClaw Hub)     (X402 + MPC)         (推荐佣金)
   5,200+ Skills       Gasless 交易          双层佣金
```

---

## 3. 产品架构

### 3.1 系统全景

```
┌──────────────────── Agentrix Platform ────────────────────┐
│                                                            │
│  ┌─── Mobile App (ClawLink) ───┐  ┌─── JS SDK ──────┐    │
│  │ 40+ Screens                  │  │ 30+ Resources   │    │
│  │ React Native + Expo SDK 54   │  │ ESM + CJS       │    │
│  │ Zustand + React Query        │  │ TypeDoc Docs    │    │
│  └──────────────┬───────────────┘  └────────┬────────┘    │
│                  │                           │             │
│  ┌───────────────┴───────────────────────────┴─────────┐  │
│  │              NestJS Backend (82 模块)                │  │
│  │                                                      │  │
│  │  ┌─ Agent ─┐ ┌─ Commerce ─┐ ┌─ Payment ─┐         │  │
│  │  │ Runtime │ │ Cart/Order │ │ X402/ERC8004│         │  │
│  │  │ Auth    │ │ Commission │ │ MPC Wallet  │         │  │
│  │  │ Policy  │ │ Marketplace│ │ Relayer     │         │  │
│  │  └─────────┘ └────────────┘ └─────────────┘         │  │
│  │                                                      │  │
│  │  ┌─ AI Engine ──┐ ┌─ Protocol ──┐ ┌─ Social ──┐    │  │
│  │  │ Claude (AWS) │ │ X402        │ │ Feed      │    │  │
│  │  │ GPT-4o       │ │ MCP + OAuth │ │ Messaging │    │  │
│  │  │ Gemini       │ │ A2A         │ │ Referral  │    │  │
│  │  │ DeepSeek     │ │ UCP         │ │ Airdrop   │    │  │
│  │  │ Groq         │ │ ERC-8004    │ │ Callback  │    │  │
│  │  │ Model Router │ │ ERC-4337    │ │ WebSocket │    │  │
│  │  └──────────────┘ └─────────────┘ └───────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                │
│  ┌────────────────────────┴──────────────────────────┐    │
│  │         Smart Contracts (BSC Testnet)              │    │
│  │  Commission · PaymentRouter · AutoPay · X402Adapter│    │
│  │  ERC8004SessionManager · BudgetPool · AuditProof   │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ┌─── OpenClaw Bridge ────┐  ┌─── Infrastructure ────┐   │
│  │ 5,200+ External Skills  │  │ PostgreSQL 16         │   │
│  │ Skill Hub Aggregation   │  │ PM2 + Nginx           │   │
│  │ X402 Enabled Inference  │  │ AWS (Singapore/Tokyo)  │   │
│  └─────────────────────────┘  └────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

### 3.2 移动端功能矩阵

| 功能区 | 核心屏幕 | 完成度 |
|--------|----------|--------|
| **首页** | 动态流、推荐、快捷操作 | ✅ 100% |
| **Agent 控制台** | 聊天、语音、执行轨迹 | ✅ 95% |
| **Skill 市场** | 5,200+ Skills 浏览/搜索/购买 | ✅ 90% |
| **商城** | 商品详情、购物车、结账 | ✅ 85% |
| **支付** | 加密/法币/QuickPay/WalletPay | ✅ 90% |
| **佣金仪表盘** | 收益、结算、规则 | ✅ 85% |
| **社交** | 动态、消息、联盟 | ✅ 70% |
| **推荐裂变** | 分享卡、创建链接、推广 | ✅ 80% |
| **我的** | 个人资料、钱包、设置 | ✅ 90% |

---

## 4. 核心技术

### 4.1 Agent Runtime 架构

Agent 运行时由以下层次组成：

| 层 | 说明 | 实现 |
|----|------|------|
| **策略层 (Policy)** | 权限评估、预算检查、风控规则 | `policy-evaluator.service.ts` |
| **授权层 (Authorization)** | ERC-8004 Session Key + Agent 授权 | `agent-authorization.service.ts` |
| **执行层 (Execution)** | Skill 调用、支付执行、事务记录 | `agent-execute-payment.service.ts` |
| **审计层 (Audit)** | EAS 证明、链上审计锚定 | `audit-anchoring.service.ts` |
| **记忆层 (Memory)** | 上下文保持、偏好学习 | `memory.service.ts` |

### 4.2 MPC Wallet（多方计算钱包）

采用 **3-of-3 阈值签名** 方案：

| 分片 | 存储位置 | 用途 |
|------|----------|------|
| **Shard A** | 用户浏览器 (IndexedDB) | 日常授权 |
| **Shard B** | 服务端（绑定 Social ID） | 交易签名 |
| **Shard C** | 用户备份（恢复码） | 账户恢复 |

- 加密算法：AES-256-GCM + scrypt 密钥派生
- 每笔交易需 Shard A + Shard B 联合签名
- 用户丢失设备时通过 Shard B + Shard C 恢复

### 4.3 ERC-4337 Account Abstraction

Build 104 引入的 Account Abstraction 模块：

```
用户 EOA (MPC Wallet)
       │
       ▼
Smart Account (ERC-4337) ── counterfactual address
       │
       ├── Paymaster (Gas 赞助)
       │     ├── 全额赞助（新用户/活动）
       │     └── USDC 付 Gas
       │
       ├── Bundler Client
       │     └── 提交 UserOperation → 链上
       │
       └── Smart Account Service
             ├── 单笔转账 (execute)
             └── 批量转账 (executeBatch)
```

**Gas 赞助策略：**
- 新用户前 30 天全额赞助
- 日限额 $5 USD / 用户
- 超限后切换为 USDC Token Paymaster
- 白名单用户无限额

### 4.4 Multi-AI Model Router

支持的模型及路由策略：

| 模型 | 提供商 | 用途 | 延迟 |
|------|--------|------|------|
| Claude 3.5 Sonnet | AWS Bedrock | 复杂推理 / 主聊天 | ~2s |
| GPT-4o | OpenAI | 代码 / 工具调用 | ~1.5s |
| Gemini 1.5 Pro | Google | 多模态 / 长上下文 | ~2s |
| DeepSeek V3 | DeepSeek | 中文任务 / 性价比 | ~1s |
| Groq (Llama 3) | Groq | 快速响应 / 简单任务 | ~0.3s |

路由规则：按任务复杂度、语言、延迟要求、成本预算自动选择最优模型。

---

## 5. 协议栈

Agentrix 实现了完整的 Web3 AI Agent 协议栈：

### 5.1 X402 — HTTP Payment Protocol

```
Client ──> Server
       402 Payment Required
       ←── X-402-Price: 0.001 USDC
       ←── X-402-Recipient: 0x...
       ←── X-402-Network: BSC

Client ──> Agentrix Relayer
       签名 + 支付
       ←── 交易凭证

Client ──> Server
       X-402-Receipt: 0x...
       ──> 200 OK (获取资源)
```

**Agentrix 增强：**
- 自动绑定 ERC-8004 Session（无需每次签名）
- 佣金路由（商户、平台、推荐人自动分账）
- Gas 压缩（批量打包交易）

### 5.2 ERC-8004 — Session Key Protocol

```solidity
struct Session {
    address signer;        // Agent 地址
    address owner;         // 用户地址
    uint256 singleLimit;   // 单笔限额
    uint256 dailyLimit;    // 日限额
    uint256 usedToday;     // 今日已用
    uint256 expiry;        // 过期时间
    bool isActive;         // 激活状态
}
```

让用户可以：
- 一次授权，Agent 在限额内自主执行
- 随时撤销，链上可验证
- 自动过期，安全可控

### 5.3 MCP — Model Context Protocol

Agentrix 的 MCP 实现支持：
- OAuth 2.0 + OIDC 鉴权
- Guest Checkout（无需注册）
- 工具注册（Commerce Tools 自动暴露给 AI 模型）
- Claude Desktop / Cursor / Windsurf 均可直接调用

### 5.4 A2A — Agent-to-Agent Protocol

Agent 间的通信协议，支持：
- 任务委托（Agent A 委托 Agent B 执行购买）
- 能力发现（查询其他 Agent 的 Skill 列表）
- 多 Agent 协作（复杂任务分解并行执行）

### 5.5 UCP — Unified Commerce Protocol

统一商业协议，标准化：
- 商品发现接口
- 价格/库存查询
- 下单/支付/退款流程
- 物流追踪

---

## 6. 智能合约体系

### 6.1 合约清单

| 合约 | 功能 | 安全等级 |
|------|------|----------|
| **CommissionDistributorV2** | 佣金分配（多层级、多角色） | 审计中 |
| **PaymentRouter** | 支付路由（多链、多币种） | 审计中 |
| **AutoPay** | 自动扣款授权 | 需修复 |
| **X402Adapter** | X402 协议适配 | 需加强签名验证 |
| **ERC8004SessionManager** | Session Key 管理 | ✅ 已审计 |
| **BudgetPool** | 预算池管理 | 审计中 |
| **AuditProof** | 链上审计证明 | ✅ 低风险 |

### 6.2 佣金分配公式

```
TotalPayment = MerchantAmount + ExecutionFee + PlatformFee + ReferralFee

示例: 130 USDC 支付
├── Merchant:  100 USDC (76.92%)
├── Execution:  10 USDC ( 7.69%) — Agent 执行费
├── Platform:   15 USDC (11.54%) — Agentrix 平台费
└── Referral:    5 USDC ( 3.85%) — 推荐人奖励
```

所有佣金分配在链上执行，可审计、可追溯、不可篡改。

---

## 7. 佣金与经济模型

### 7.1 双层佣金架构

```
                    ┌─────────────────┐
                    │   消费者支付     │
                    │  (130 USDC)     │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │CommissionDistV2 │
                    │  (链上合约)      │
                    └────────┬────────┘
                             │
          ┌──────────┬───────┼───────┬──────────┐
          │          │       │       │          │
     商户收入    Agent 层  平台层   人类层    审计
     100 USDC   10 USDC  15 USDC  5 USDC    链上锚定
                   │              │
              Agent 执行费    推荐人/分销商
              (按技能计费)    (多级分润)
```

**Agent 层佣金**：
- Agent 每次成功执行 Skill（如完成购买），获得执行费
- 费率由 Skill 发布者设定（建议 5-15%）

**人类层佣金**：
- 推荐新用户：一次性奖励 + 持续分润（最多 3 级）
- 分享商品/Skill：成交后获佣金
- 联盟营销：自定义佣金规则

### 7.2 增长飞轮

```
更多用户 ──> 更多 Agent 使用 ──> 更多交易
    ▲                                │
    │                                ▼
推荐奖励 <── 更多佣金收入 <── 更多 Skill 调用
```

### 7.3 订阅与变现

| 层级 | 价格 | 权益 |
|------|------|------|
| **Free** | $0 | 基础 Agent，有限 Skill 次数 |
| **Pro** | $9.99/月 | 高级模型、无限 Skill、Gas 赞助 |
| **Business** | $49.99/月 | 团队协作、自定义 Agent、API 配额 |
| **Enterprise** | 定制 | 私有部署、SLA、专属支持 |

---

## 8. Agent Skill 生态

### 8.1 Skill Marketplace

| 指标 | 数值 |
|------|------|
| **总 Skill 数** | 5,200+ |
| **自有 Skill** | 15+ (商业 + 支付 + 投资) |
| **OpenClaw 聚合** | 5,000+ (来自 OpenClaw Hub) |
| **分类** | 商业、金融、开发、设计、数据、社交 |

### 8.2 核心商业 Skill

| Skill | 功能 | 状态 |
|-------|------|------|
| `product-search` | 商品搜索与比价 | ✅ |
| `buy-item` | 一键购买 | ✅ |
| `add-to-cart` | 加购物车 | ✅ |
| `checkout` | 结账（含多支付方式） | ✅ |
| `payment` | 执行支付（X402 / 法币 / 深度链接） | ✅ |
| `cancel-order` | 取消订单 | ✅ |
| `price-comparison` | AI 价格比较 | ✅ |
| `best-execution` | 最优执行路径 | ✅ |
| `airdrop` | 空投分发 | ✅ |
| `auto-earn` | 自动收益策略 | ✅ |
| `mint-nft` | NFT 铸造 | ✅ |
| `book-service` | 服务预订 | ✅ |

### 8.3 Skill 开发者

- 提供 SDK (`sdk-js`) 让第三方开发者创建 Skill
- 开发者获得其 Skill 的调用佣金
- MCP 协议让任何 REST API 快速封装为 Skill

---

## 9. 安全与合规

### 9.1 安全措施

| 层级 | 措施 |
|------|------|
| **链上安全** | 合约审计（进行中）、ERC-8004 限额、多签管理 |
| **服务端安全** | JWT + API Key 双鉴权、Rate Limiting、CORS |
| **客户端安全** | MPC 分片存储、Secure Store、生物识别 |
| **交易安全** | 风控引擎（`risk/`）、AML 检查、合规模块 |
| **隐私** | 无用户私钥存储、零知识证明（规划中） |

### 9.2 合规框架

- KYC 模块：身份验证 + 地址证明
- AML 模块：交易监控 + 可疑行为报告
- 合规模块：区域законодательство适配
- 审计证明：链上不可篡改记录

---

## 10. 完成度与路线图

### 10.1 当前完成度（截至 Build 104，2026 年 3 月）

```
总体完成度: ████████████████████░░░░ 80%

Backend (82 modules):     ██████████████████████ 95%
Mobile App (40+ screens): ████████████████████░░ 85%
Smart Contracts:          ████████████████░░░░░░ 70%
SDK:                      ██████████████████████ 95%
Protocol Integration:     ████████████████████░░ 85%
Security Audit:           ████████████░░░░░░░░░░ 50%
Documentation:            ████████████████░░░░░░ 65%
Cross-device Sync:        ████░░░░░░░░░░░░░░░░░░ 15%
```

### 10.2 路线图

| 阶段 | 时间 | 里程碑 |
|------|------|--------|
| **Phase 1** ✅ | 2025 Q4 | 核心架构、Agent Runtime、支付引擎 |
| **Phase 2** ✅ | 2026 Q1 | Marketplace V2、OpenClaw 集成、Mobile App 上线 |
| **Phase 3** 🔄 | 2026 Q2 | ERC-4337 (Account Abstraction)、安全审计、主网部署 |
| **Phase 4** 📋 | 2026 Q3 | **跨应用设备协同** — 桌面/手表/汽车/IoT |
| **Phase 5** 📋 | 2026 Q4 | Agent 自主经济体、DAO 治理、Token 发行 |
| **Phase 6** 📋 | 2027 Q1 | 全球化、多语言、区域合规、企业版 |

### 10.3 Phase 4 — 跨应用设备协同（重点规划）

**目标：让用户在任何时间、任何地点都能与 Agent 交互**

```
                    ┌─────────────┐
                    │ Agent Brain │
                    │ (Cloud)     │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
    │   Mobile    │ │  Desktop    │ │  Wearable   │
    │   (Phone)   │ │  (Browser)  │ │  (Watch)    │
    └─────────────┘ └─────────────┘ └─────────────┘
           │               │               │
    ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
    │   Car       │ │  Smart Home │ │  AR/VR      │
    │   (CarPlay) │ │  (IoT Hub)  │ │  (Spatial)  │
    └─────────────┘ └─────────────┘ └─────────────┘
```

**技术方案：**

1. **统一 Agent Session** — 一个 ERC-8004 Session 跨设备共享
2. **实时状态同步** — WebSocket + CRDT 实现多设备状态一致
3. **Context Handoff** — 手机对话无缝切换到桌面/手表
4. **设备能力适配** — 根据设备尺寸/能力自动调整交互模式
5. **离线优先** — 本地 Agent 推理 + 上线同步

---

## 11. 竞争分析

### Agentrix vs Coinbase Agentic Wallet vs Others

| 维度 | **Agentrix** | Coinbase Agentic | Replit Agent | AutoGPT |
|------|-------------|------------------|--------------|---------|
| **Skill 数量** | 5,200+ | ~7 | N/A | ~50 |
| **支付方式** | 加密 + 法币 + X402 | USDC on Base | 无 | 无 |
| **链支持** | BSC + ETH + 多链 | Base only | N/A | ETH |
| **佣金体系** | 双层（Agent + 人类） | 无 | 无 | 无 |
| **协议栈** | X402+ERC8004+MCP+A2A+UCP | 基础 X402 | 无 | 无 |
| **移动端** | ✅ 原生 App | ❌ | ❌ | ❌ |
| **AI 模型** | 5+ (Claude/GPT/...) | 1 (GPT) | 1 | 1 (GPT) |
| **MPC 钱包** | ✅ 3-of-3 | ❌ | ❌ | ❌ |
| **Gas 赞助** | ✅ ERC-4337 | ❌ | N/A | ❌ |
| **SDK** | ✅ 30+ Resources | ❌ | ❌ | ❌ |
| **开源** | ✅ | 部分 | 否 | ✅ |

### 核心竞争壁垒

1. **协议栈完整度** — 唯一同时实现 X402 + ERC-8004 + MCP + A2A + UCP 的平台
2. **商业闭环** — 从发现到支付到佣金的全链路 Agent 化
3. **移动端优先** — 唯一提供原生移动 App 的 AI Agent 经济平台
4. **经济飞轮** — 佣金 + 推荐 + 空投的增长引擎

---

## 12. 附录

### 12.1 技术栈详情

| 层 | 技术 |
|----|------|
| **Frontend** | React Native 0.81.5, Expo SDK 54, TypeScript, Zustand, React Query |
| **Backend** | NestJS 7.0, TypeORM, PostgreSQL 16, PM2, Nginx |
| **Blockchain** | Solidity 0.8.x, ethers.js v6, BSC (Testnet & Mainnet) |
| **AI** | AWS Bedrock (Claude), OpenAI API, Google AI, Groq, DeepSeek |
| **Infra** | AWS EC2 (Singapore + Tokyo), GitHub Actions CI/CD |
| **Protocol** | X402 (HTTP 402), ERC-8004 (Session Key), MCP, A2A, UCP |

### 12.2 团队联系

- **Website**: https://agentrix.top
- **GitHub**: https://github.com/CutaGames/Agentrix-Clawlink
- **API Endpoint**: http://18.139.157.116/api/

### 12.3 术语表

| 术语 | 说明 |
|------|------|
| **X402** | HTTP 402 Payment Required 协议，让 Web 请求可以携带支付信息 |
| **ERC-8004** | 以太坊会议密钥标准，让 Agent 在用户授权范围内自主操作 |
| **MCP** | Model Context Protocol，Anthropic 提出的模型上下文协议 |
| **A2A** | Agent-to-Agent 协议，Agent 间的通信标准 |
| **MPC** | 多方计算，将私钥分为多个分片，单个分片无法还原私钥 |
| **ERC-4337** | 账户抽象标准，让智能合约账户可以发起交易（Gasless） |
| **Gas** | 区块链上执行交易所需的手续费 |
| **Paymaster** | ERC-4337 中代付 Gas 的合约 |
| **Skill** | AI Agent 可执行的单个能力（如搜索商品、执行支付） |
| **Session Key** | 临时授权密钥，有限额和有效期 |

---

> **Agentrix — Building the Economy Where AI Agents Work for You**
>
> © 2026 Agentrix. All Rights Reserved.
