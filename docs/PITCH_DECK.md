---
marp: true
theme: default
paginate: true
backgroundColor: #0a0a1a
color: #f0f0f0
style: |
  section {
    font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  }
  h1 {
    color: #00d4ff;
    font-size: 2.2em;
  }
  h2 {
    color: #00d4ff;
    font-size: 1.6em;
  }
  h3 {
    color: #7dd3fc;
  }
  table {
    font-size: 0.75em;
  }
  th {
    background-color: #1a1a3a;
    color: #00d4ff;
  }
  td {
    background-color: #0f0f2a;
  }
  strong {
    color: #00d4ff;
  }
  code {
    background-color: #1a1a3a;
    color: #7dd3fc;
  }
  a {
    color: #00d4ff;
  }
  section.lead h1 {
    font-size: 3em;
    text-align: center;
  }
  section.lead p {
    text-align: center;
    font-size: 1.3em;
  }
  .highlight {
    color: #fbbf24;
    font-weight: bold;
  }
---

<!-- _class: lead -->

# AGENTRIX

**The Personal AI Agent Economy Platform**

让每个人拥有自己的 AI Agent，自主消费、支付与社交

*Seed Round · March 2026*

---

# 🏗 我们在做什么

## AI Agent 不应该只是聊天工具，它应该能替你**花钱、赚钱**

Agentrix 构建了完整的 **AI Agent 经济平台**：

- 🤖 **Agent 运行时** — 5 个 AI 模型，5,200+ Skills
- 💰 **全链路支付** — 加密 + 法币，Gasless 交易
- 🔗 **协议互联** — X402 + ERC-8004 + MCP + A2A + UCP
- 📱 **移动端优先** — 唯一有原生 App 的 AI Agent 平台
- 💎 **经济飞轮** — 双层佣金 + 推荐裂变

---

# 💡 为什么是现在

## 三个不可逆趋势的交汇

| 趋势 | 数据 |
|------|------|
| **AI Agent 爆发** | 2027 全球市场 **$470B** (Gartner) |
| **Web3 支付标准化** | HTTP X402 协议被 Coinbase / a]16z 推动 |
| **协议窗口期** | X402, MCP, A2A 刚发布，**标准制定者享有红利** |

### 痛点

1. ChatGPT / Claude **只能给建议，不能执行支付**
2. 每个 AI 平台是**独立孤岛**
3. 用户**无法从 AI 经济中获利**

---

# 🎯 产品概览

## Agentrix 平台 = ClawLink App + Backend + SDK + 合约

```
┌─── ClawLink App ────┐   ┌─── Backend ──────┐
│  40+ 屏幕            │   │  82 个 NestJS 模块  │
│  React Native        │   │  PostgreSQL 16    │
│  Expo SDK 54         │   │  PM2 + Nginx      │
└──────────┬───────────┘   └────────┬──────────┘
           │                        │
    ┌──────┴────────────────────────┴───────┐
    │         8 Smart Contracts             │
    │  Commission · PaymentRouter · AutoPay │
    │  X402 · ERC8004 · BudgetPool · Audit │
    └───────────────────────────────────────┘
```

---

# 📊 核心数据

## 已建成、可验证

| 指标 | 数值 |
|------|------|
| **后端模块数** | 82 modules |
| **移动端屏幕** | 40+ screens |
| **集成 AI Skills** | 5,200+ (OpenClaw Bridge) |
| **智能合约** | 8 (BSC Testnet) |
| **SDK 资源类** | 30+ |
| **AI 模型** | 5 (Claude, GPT, Gemini, DeepSeek, Groq) |
| **代码提交** | 104 builds |
| **服务器** | 2 (Singapore + Tokyo AWS) |

---

# 🔑 核心竞争力 (1/3)

## 1. 五协议栈 — 业界唯一

| 协议 | 功能 | 竞品拥有？ |
|------|------|-----------|
| **X402** | HTTP 支付 | Coinbase ✅ (仅此) |
| **ERC-8004** | Session Key 授权 | ❌ 全行业仅 Agentrix |
| **MCP** | 模型上下文 | 部分 |
| **A2A** | Agent 间通信 | ❌ |
| **UCP** | 统一商业 | ❌ |

> Coinbase Agentic Wallet 只有**基础 X402**
> Agentrix 有**全部五个协议** + 桥接

---

# 🔑 核心竞争力 (2/3)

## 2. 双层佣金经济

```
消费者支付 130 USDC
    │
    ├── 商户收入    100 USDC  (76.92%)
    ├── Agent 费     10 USDC  ( 7.69%) ← AI 赚钱
    ├── 平台费       15 USDC  (11.54%) ← Agentrix
    └── 推荐奖励      5 USDC  ( 3.85%) ← 用户赚钱
```

### 增长飞轮

**更多用户** → 更多 Agent 使用 → 更多交易 → 更多佣金 → 推荐奖励 → **更多用户**

---

# 🔑 核心竞争力 (3/3)

## 3. 对比 Coinbase Agentic Wallet

| | **Agentrix** | Coinbase | AutoGPT |
|--|-------------|----------|---------|
| Skills | **5,200+** | ~7 | ~50 |
| 支付 | 加密+法币+X402 | USDC only | 无 |
| 链 | **多链** | Base only | ETH |
| 佣金 | **双层** | 无 | 无 |
| 移动端 | **✅ 原生 App** | ❌ | ❌ |
| AI 模型 | **5个** | 1 | 1 |
| MPC 钱包 | **✅** | ❌ | ❌ |
| Gas 赞助 | **✅ ERC-4337** | ❌ | ❌ |
| SDK | **30+ 类** | ❌ | ❌ |

---

# 💳 支付架构

## Gasless、多币种、自动分账

```
用户点击"购买"
    │
    ▼
Agent 自动执行 (ERC-8004 授权范围内)
    │
    ├── MPC Wallet 签名 (Shard A + B)
    ├── ERC-4337 Paymaster 赞助 Gas
    ├── X402 支付协议 (HTTP 402)
    │
    ▼
CommissionDistributorV2 (链上分账)
    │
    ├── 商户 → 76.92%
    ├── Agent → 7.69%
    ├── 平台 → 11.54%
    └── 推荐人 → 3.85%
```

---

# 🛒 商业场景

## Agent 替你完成全链路

### 场景 1: AI 购物
> "帮我买最便宜的 AirPods Pro"
> → Agent 搜索比价 → 下单 → 支付 → 追踪物流

### 场景 2: 自动理财
> "每天定投 10 USDC 到最高收益池"
> → Agent 分析收益 → AutoPay 合约自动执行

### 场景 3: 服务预订
> "帮我订明天下午的翻译服务"
> → Agent 查找服务商 → 匹配时间 → 预订付款

### 场景 4: 跨 Agent 协作
> Agent A (购物) 委托 Agent B (物流) 找最优配送

---

# 🗺 路线图

## 从移动端到全设备

| 阶段 | 时间 | 目标 | 状态 |
|------|------|------|------|
| Phase 1 | 2025 Q4 | 架构 + Agent Runtime + 支付 | ✅ 完成 |
| Phase 2 | 2026 Q1 | Marketplace V2 + OpenClaw + App | ✅ 完成 |
| **Phase 3** | **2026 Q2** | **ERC-4337 + 审计 + 主网** | **🔄 进行中** |
| Phase 4 | 2026 Q3 | **跨应用设备协同** | 📋 |
| Phase 5 | 2026 Q4 | Agent 自主经济 + DAO + Token | 📋 |
| Phase 6 | 2027 Q1 | 全球化 + 企业版 | 📋 |

---

# 📱💻⌚ Phase 4: 跨设备协同

## 让用户在任何时间、任何地点与 Agent 交互

```
             ┌────── Agent Brain (Cloud) ──────┐
             │                                  │
     ┌───────┼───────┬──────────┬──────────┐   │
     │       │       │          │          │   │
  📱 手机  💻 桌面  ⌚ 手表   🚗 汽车  🏠 家居  │
     │       │       │          │          │   │
     └───────┴───────┴──────────┴──────────┘   │
                         │                      │
              WebSocket + CRDT 状态同步          │
              ERC-8004 跨设备 Session            │
              Context Handoff (无缝切换)         │
             └──────────────────────────────────┘
```

**一次授权，所有设备共享 Agent Session**

---

# 💰 商业模型

## 多元收入来源

| 收入来源 | 模式 | 预期占比 |
|---------|------|---------|
| **平台佣金** | 每笔交易 11.54% | 55% |
| **订阅** | Pro $9.99/月, Biz $49.99/月 | 25% |
| **Gas 手续费差** | Paymaster 赞助后差价 | 10% |
| **企业版** | 私有部署 + SLA | 10% |

### 单位经济

- **用户获取成本 (CAC)**: ~$3 (推荐裂变 + 空投)
- **用户终身价值 (LTV)**: ~$180 (基于月均 3 笔交易)
- **LTV/CAC**: **60x**

---

# 🎯 融资计划

## Seed Round

| | |
|--|--|
| **融资金额** | $2M |
| **估值** | $15M (Pre-money) |
| **轮次** | Seed |
| **资金用途** | 见下 |

### 资金分配

| 用途 | 占比 | 金额 |
|------|------|------|
| **产品研发** | 45% | $900K |
| **安全审计 + 主网** | 20% | $400K |
| **市场推广** | 20% | $400K |
| **运营 + 法务** | 15% | $300K |

---

# 🏁 为什么投资 Agentrix

## 5 个理由

### 1. 领先的技术壁垒
82 个后端模块、8 个智能合约、5 个协议栈 — **已建成**

### 2. 唯一的移动端 AI Agent 经济体
从发现到支付到佣金的全链路 — **无竞品**

### 3. 5,200+ Skills 的生态飞轮
OpenClaw Bridge 已接入 5,200+ 外部 AI Skills — **Day 1 即有生态**

### 4. 双层佣金 = 自增长引擎
Agent 赚钱 + 人类赚钱 — **人人有动力参与**

### 5. 协议标准窗口
X402 + ERC-8004 正在被行业采纳 — **早期参与者红利**

---

<!-- _class: lead -->

# Thank You

**Agentrix — Building the Economy Where AI Agents Work for You**

🌐 agentrix.top
📧 contact@agentrix.top
🔗 github.com/CutaGames/Agentrix-Clawlink

---

*Appendix slides follow →*

---

# 📎 附录 A: 技术栈

| Layer | Technology |
|-------|-----------|
| **Mobile** | React Native 0.81.5 + Expo SDK 54 + TypeScript |
| **State** | Zustand + React Query + MMKV |
| **Backend** | NestJS 7.0 + TypeORM + PostgreSQL 16 |
| **Blockchain** | Solidity 0.8.x + ethers.js v6 + BSC |
| **AI** | AWS Bedrock (Claude) + OpenAI + Gemini + DeepSeek + Groq |
| **Infrastructure** | AWS EC2 (Singapore + Tokyo) + PM2 + Nginx |
| **CI/CD** | GitHub Actions + EAS Build |
| **SDK** | TypeScript + TypeDoc + ESM/CJS dual build |

---

# 📎 附录 B: 智能合约审计状态

| Contract | Auditor | Status | Risk |
|----------|---------|--------|------|
| CommissionDistributorV2 | Pending | 🟡 In Review | Medium |
| PaymentRouter | Pending | 🟡 In Review | Medium |
| AutoPay | Internal | 🔴 Needs Fix | High — missing auth |
| X402Adapter | Internal | 🟡 Needs Strengthen | Medium — sig check |
| ERC8004SessionManager | Internal | 🟢 Passed | Low |
| BudgetPool | Pending | 🟡 In Review | Medium |
| AuditProof | Internal | 🟢 Low Risk | Low |

> 主网部署前将完成第三方审计 (Q2 2026)

---

# 📎 附录 C: MPC 钱包安全架构

```
┌─────────────────────────────────┐
│       User Device               │
│  ┌──────────────────────────┐   │
│  │  Shard A (IndexedDB)     │   │
│  │  AES-256-GCM Encrypted   │   │
│  └────────────┬─────────────┘   │
│               │ Co-sign          │
└───────────────┼─────────────────┘
                │
┌───────────────┼─────────────────┐
│  Agentrix Server                │
│  ┌────────────┴─────────────┐   │
│  │  Shard B (HSM / Encrypted)│   │
│  │  Bound to Social ID      │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  User Backup                    │
│  ┌──────────────────────────┐   │
│  │  Shard C (Recovery Code) │   │
│  │  scrypt Key Derivation   │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘

Recovery: Shard B + Shard C → Full Key
Daily:    Shard A + Shard B → Transaction
```

---

# 📎 附录 D: 佣金计算示例

### 场景: 用户通过 Agent 购买 100 USDC 商品

```
用户实际支付:     130 USDC

链上自动分配:
├── 商户:          100 USDC (Merchant Amount)
├── Agent 执行费:   10 USDC (Skill Execution Fee)
├── 平台费:         15 USDC (Platform Commission)  
└── 推荐人奖励:      5 USDC (Referral Bonus)

推荐链分润:
├── 直接推荐人:      3 USDC (60% of referral)
├── 二级推荐人:      1.5 USDC (30%)
└── 三级推荐人:      0.5 USDC (10%)
```

全部通过 `CommissionDistributorV2` 合约链上执行，**0 人工介入**。
