# Agentrix 商业计划书 — 红杉中国 YUE 加速器申请

**公司名称**: Agentrix (CutaGames)
**日期**: 2026-03-16
**网站**: https://www.agentrix.top
**联系**: team@agentrix.top

---

## 〇、YUE 加速器表单参考答案

### 一句话介绍公司业务 (≤30字)

> **AI Agent跨端协同经济平台，让Agent替你交易支付**

### 市场 (≤1000字)

> AI Agent 是2026年公认最大的技术风口。Gartner预测2027年全球AI Agent市场规模达$470B，麦肯锡预测AI Agent将为全球经济贡献$4.4万亿年化产值。
>
> 三个不可逆趋势正在交汇：
>
> 1. **AI Agent从对话走向行动**：ChatGPT/Claude等产品验证了用户对AI的需求，但当前AI只能"给建议"不能"做事情"——不能下单、不能支付、不能代表用户与外部世界交互。这是一个万亿级的执行层缺口。
>
> 2. **Web3支付标准化**：HTTP X402支付协议被Coinbase/a16z推动，ERC-4337账户抽象让Gasless交易成为可能，Agent自主支付的基础设施首次就位。
>
> 3. **跨端协同成为刚需**：用户在手机、桌面、手表、Telegram、Discord等多个终端与AI交互，但每个平台是独立孤岛。谁先实现"一个Agent，所有终端"的统一体验，谁就占据入口。
>
> 我们判断：2026年是AI Agent从"聊天工具"进化为"数字分身"的元年。Agent交易市场规模百万亿级别，目前正处于爆发前夜。Agentrix要做的就是这个"数字分身"的操作系统和经济底座。

### 产品 (≤1000字)

> Agentrix是一个完整的AI Agent经济平台，让每个用户拥有多个持续在线的AI Agent分身，跨设备、跨应用、跨社交渠道协作，并具备自主交易支付能力。
>
> **已上线产品矩阵**：
> - **ClawLink移动端** (React Native)：50+屏幕，8种登录，SSE流式对话，5200+Skills市场，MPC钱包，佣金仪表盘
> - **桌面端** (Tauri 2.x)：悬浮球+聊天面板双窗口，多标签页，Git集成，截图，凭证库，自动更新
> - **后端** (NestJS)：82个业务模块，5个AI模型路由，完整支付引擎(Stripe/Crypto/X402)，五协议栈(X402/ERC-8004/MCP/A2A/UCP)
> - **智能合约** (Solidity)：8个合约(BSC Testnet)，佣金分账/AutoPay/授权/审计
> - **JS SDK**：30+API资源类，TypeDoc文档
>
> **核心差异化 — Agent Presence**：
> 用户创建多个Agent分身（如市场Agent、开发Agent、生活Agent），每个Agent跨Telegram/Discord/Twitter/手机/桌面/手表保持同一身份和记忆。任一渠道的消息进入统一时间线，Agent根据授权级别自动回复/待审核/自主执行。
>
> 目前主要面向C端，同时提供B端定制服务。www.agentrix.top 可下载体验。

### 竞争 (≤1000字)

> **直接竞品**：
> - **Coinbase Agentic Wallet**：仅支持Base链USDC支付，无移动端App，无Skill生态，协议仅X402。Agentrix拥有五协议栈+多链+5200+Skills+原生移动端。
> - **AutoGPT/AgentGPT**：开源Agent框架，无支付能力，无移动端，约50个Skills，单AI模型。
> - **Coze(字节)/Dify**：聚焦Agent搭建工具，无自主支付，无跨端协同，无经济飞轮。
>
> **潜在竞品**：
> - **大厂**（OpenAI/Google/Apple）：有AI能力但缺乏Agent经济层和跨端协同，短期内不会做Agent支付和佣金体系。
> - **Web3项目**（Virtuals/ai16z）：聚焦Agent代币化，无实际产品闭环。
>
> **竞争壁垒**：
> 1. 五协议栈全行业唯一（X402+ERC-8004+MCP+A2A+UCP），形成跨平台互操作壁垒
> 2. 已建成82个后端模块+50+移动端屏幕+桌面端的完整产品，不是PPT项目
> 3. Agent跨端Presence架构（统一消息总线+Session Handoff+设备协同）是核心技术壁垒
> 4. 双层佣金经济模型创造增长飞轮，大厂难以复制

### 公司的核心竞争力

> 1. **全栈产品已落地**：82个后端模块+多端App+8个智能合约+5200+Skills，不是概念验证而是可体验的完整产品。
> 2. **五协议栈**：业界唯一同时实现X402、ERC-8004、MCP、A2A、UCP五大协议的团队，享有标准制定者红利。
> 3. **Agent经济闭环**：从发现→购买→支付→佣金→推荐，Agent全链路自主执行，双层佣金驱动增长飞轮。
> 4. **跨端Agent Presence**：一个Agent跨手机/桌面/手表/Telegram/Discord保持统一身份、记忆和上下文，这是竞品完全没有的能力。
> 5. **团队执行力**：3个月完成从0到82模块+多端产品+智能合约的全栈开发，104次迭代发布。

---

## 一、执行摘要

Agentrix 是全球领先的 **AI Agent 经济平台**，让每个人拥有自己的 AI Agent 数字分身，具备自主消费、支付、投资与社交能力，并可跨设备、跨应用、跨社交渠道与用户协作。

**核心价值**：
- Agent 自主经济 — AI Agent 自行消费支付，通过 ERC-8004 Session Keys 获得用户授权
- 跨端统一 Presence — 一个 Agent 在手机/桌面/手表/Telegram/Discord 保持同一身份
- 全链路商业闭环 — 发现→购买→支付→佣金→物流→售后，全链路 Agent 化
- 协议互操作 — X402 + ERC-8004 + MCP + A2A + UCP 五协议栈

---

## 二、市场分析

### 2.1 市场规模

| 市场 | 2026E | 2027E | 来源 |
|------|-------|-------|------|
| 全球 AI Agent 市场 | $180B | $470B | Gartner |
| AI 经济年化产值 | — | $4.4T | McKinsey |
| 移动端 AI 应用 | $35B | $80B | Statista |
| Web3 支付 | $15B | $40B | Messari |

### 2.2 三大趋势交汇

1. **AI Agent 从对话到行动**：ChatGPT 月活 3 亿验证需求，但 Agent 执行层（支付/订购/社交代理）几乎空白
2. **Web3 支付基础设施就位**：X402 协议 + ERC-4337 + Gasless 让 Agent 自主支付首次可行
3. **跨端协同成刚需**：用户在 5+ 终端与 AI 交互，统一体验是下一个竞争焦点

### 2.3 目标用户

| 用户画像 | 描述 | 占比 |
|---------|------|------|
| **C端效率用户** | 25-45岁，多设备，希望AI帮忙处理日常事务 | 60% |
| **Crypto原生用户** | 熟悉Web3，需要Agent自动交易/DeFi/空投 | 25% |
| **B端企业** | 需要Agent代理客服/社群运营/定时任务 | 15% |

---

## 三、产品与技术

### 3.1 产品矩阵

```
┌──────────────── Agentrix Platform ────────────────┐
│                                                      │
│  📱 ClawLink Mobile    💻 Desktop (Tauri)            │
│  50+ Screens           双窗口 + 多Tab                │
│  React Native          Git/截图/凭证库               │
│                                                      │
│  🌐 Web Frontend       ⌚ Wearable (BLE)             │
│  Marketplace/Builder   手表/手环连接                  │
│                                                      │
│  ─────────── Agentrix Backend (82 Modules) ──────── │
│                                                      │
│  🤖 AI Engine          💰 Payment Engine              │
│  5模型路由              Stripe/Crypto/X402            │
│  Claude/GPT/Gemini     MPC Wallet + ERC-4337         │
│  DeepSeek/Groq         AutoPay + Escrow              │
│                                                      │
│  📡 Protocol Stack     🔗 Agent Runtime               │
│  X402 + ERC-8004       策略层/授权层/执行层           │
│  MCP + A2A + UCP       审计层/记忆层                  │
│                                                      │
│  📲 Agent Presence     🏪 Skill Marketplace           │
│  ChannelAdapter层      5,200+ Skills                  │
│  统一消息总线          佣金分账                       │
│  跨端Session Handoff   开发者生态                     │
│                                                      │
│  ⛓️  8 Smart Contracts (BSC)                         │
│  Commission · AutoPay · X402 · ERC8004               │
│  BudgetPool · SessionManager · FeeSplitter · Audit   │
└──────────────────────────────────────────────────────┘
```

### 3.2 核心技术壁垒

**五协议栈（业界唯一）**：

| 协议 | 功能 | 竞品 |
|------|------|------|
| X402 | HTTP原生支付 | 仅Coinbase有基础版 |
| ERC-8004 | Agent Session Key授权 | 全行业仅Agentrix |
| MCP | 模型上下文协议 | 部分竞品 |
| A2A | Agent间通信 | 无 |
| UCP | 统一商业协议 | 无 |

**Agent Presence 架构**：
- ChannelAdapter 抽象层：Telegram/Discord/Twitter/飞书/企微统一接入
- 统一消息总线 `conversation_events`：所有渠道消息进入同一时间线
- 跨端 Session Handoff：手机说一半，桌面接着做
- 设备 Presence 注册：手机/桌面/手表/IoT 统一管理
- WebSocket 实时同步：所有设备实时收到消息更新

---

## 四、商业模式

### 4.1 收入来源

| 收入来源 | 模式 | 预期占比 |
|---------|------|---------|
| 平台佣金 | 每笔Agent交易抽成 0.5%-3% | 50% |
| Pro订阅 | $9.99/月(个人) / $49.99/月(企业) | 25% |
| Gas手续费差 | Paymaster赞助后差价 | 10% |
| 企业版 | 私有部署+SLA+定制 | 10% |
| 开发者平台 | Skill发布费+分成 | 5% |

### 4.2 双层佣金经济

```
用户支付 130 USDC
    │
    ├── 商户收入    100 USDC  (76.92%)
    ├── Agent 费     10 USDC  ( 7.69%)  ← Agent帮用户省钱/赚钱
    ├── 平台费       15 USDC  (11.54%)  ← Agentrix收入
    └── 推荐奖励      5 USDC  ( 3.85%)  ← 推荐人收入
```

**增长飞轮**: 更多用户 → 更多Agent交易 → 更多佣金 → 推荐奖励 → 更多用户

### 4.3 单位经济

| 指标 | 数值 |
|------|------|
| 用户获取成本 (CAC) | ~$3 (推荐裂变+空投) |
| 用户终身价值 (LTV) | ~$180 (月均3笔交易) |
| LTV/CAC | **60x** |
| 毛利率 | >80% (SaaS+交易佣金) |
| 月度留存 | 目标 >40% |

---

## 五、竞争分析

### 5.1 竞争格局

| 维度 | **Agentrix** | Coinbase Agentic | AutoGPT | Coze(字节) |
|------|-------------|-----------------|---------|-----------|
| Skills | **5,200+** | ~7 | ~50 | ~200 |
| 支付 | 加密+法币+X402 | USDC only | 无 | 无 |
| 移动端 | **✅ 原生App** | ❌ | ❌ | ✅ 但无支付 |
| 桌面端 | **✅ Tauri** | ❌ | ❌ | ❌ |
| AI模型 | **5个** | 1 | 1 | 2 |
| 协议栈 | **5个** | 1 | 0 | 0 |
| MPC钱包 | **✅** | ❌ | ❌ | ❌ |
| 跨端协同 | **✅** | ❌ | ❌ | ❌ |
| 佣金经济 | **双层** | 无 | 无 | 无 |
| Agent Presence | **✅ 完整** | ❌ | ❌ | ❌ |

### 5.2 核心壁垒

1. **协议壁垒** — 五协议栈是深度技术工程，后来者需6+月追赶
2. **产品壁垒** — 82模块+多端产品已落地，不是PPT
3. **数据壁垒** — Agent记忆+交易数据形成用户粘性
4. **生态壁垒** — 5200+ Skills + 开发者佣金分成

---

## 六、战略路线图

| 阶段 | 时间 | 目标 | 状态 |
|------|------|------|------|
| Phase 1 | 2025 Q4 | 架构+Agent Runtime+支付引擎 | ✅ 完成 |
| Phase 2 | 2026 Q1 | Marketplace V2+OpenClaw+多端App | ✅ 完成 |
| **Phase 3** | **2026 Q2** | **Agent Presence+跨端协同+合约审计** | **🔄 进行中** |
| Phase 4 | 2026 Q3 | 多渠道扩展+企业版+主网部署 | 📋 计划 |
| Phase 5 | 2026 Q4 | Agent自主经济+DAO+Token | 📋 计划 |
| Phase 6 | 2027 Q1 | 硬件Hub+全球化+企业版 | 📋 计划 |

### 近期里程碑 (2026 Q2)

- [x] Agent Core 实体升级 + 统一消息表
- [x] ChannelAdapter 抽象层 (Telegram/Discord/Twitter)
- [x] 跨端 Session Handoff + WebSocket 实时同步
- [ ] 合约安全审计 + BSC 主网部署
- [ ] 企业渠道接入 (飞书/企微)
- [ ] 运营数据面板

---

## 七、融资计划

### 7.1 融资需求

**轮次**: Seed / Angel
**用途**:

| 方向 | 占比 | 说明 |
|------|------|------|
| 产品研发 | 40% | Agent经济引擎+多渠道扩展+企业版 |
| 生态建设 | 25% | 开发者激励+Skills扶持+合约审计 |
| 市场推广 | 20% | 全球用户获取+品牌建设+社区运营 |
| 团队+合规 | 15% | 核心人才+法务+牌照 |

### 7.2 关键里程碑承诺

| 里程碑 | 时间 | 指标 |
|--------|------|------|
| 主网上线 | 融资后 3 个月 | BSC Mainnet 部署 |
| 1万注册用户 | 融资后 6 个月 | DAU > 1,000 |
| 月交易额 $100K | 融资后 9 个月 | GMV 稳定增长 |
| 10万注册用户 | 融资后 12 个月 | 启动企业版 |

---

## 八、团队

由前大厂资深产品经理、区块链底层协议专家、全栈工程师共同组成。

**核心能力**:
- 3个月完成从0到82模块+多端产品+8个智能合约的全栈交付
- 104次迭代发布，持续高速执行
- 曾主导百万级DAU产品线

---

## 九、总结

Agentrix 不只是一个 AI 聊天工具，而是 **AI Agent 时代的操作系统和经济底座**。

我们已经拥有：
- ✅ 可体验的完整产品（82模块后端 + 多端App + 智能合约）
- ✅ 业界唯一的五协议栈（X402+ERC-8004+MCP+A2A+UCP）
- ✅ Agent跨端Presence架构（统一消息+Session Handoff+设备协同）
- ✅ 双层佣金经济飞轮

**我们需要的是加速器的资源和生态支持，把已验证的产品推向规模化。**

---

*Agentrix Team · 2026*
*https://www.agentrix.top*
