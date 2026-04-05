# Agentrix Agent Team Studio — PRD v4

> Human 审批 + CEO Agent (Opus) 统帅的 AI Agent 团队，半自动化运营 Agentrix 全业务线

**版本**: v4.0  
**日期**: 2026-03-31  
**状态**: Draft  
**v4 变更**:
1. CEO 角色回归 Opus 4.6 Agent，你只做审批 (可手动/自动审批，不阻塞执行)
2. 新增资源猎手 Agent — 全网搜刮免费资源、加速器、黑客松、Grants
3. 新增财务官 Agent — 自主钱包，唯一目标：让钱变多
4. 最大化每次 Premium request：一次调用捆绑多任务，不浪费 Opus/Standard 的长时间会话能力

---

## 1. 目标与愿景

### 1.1 核心目标

1. **你只做审批** — CEO Agent (Opus) 负责战略、决策、调度；你做最终审批
2. **审批不阻塞** — 审批可设为手动或自动，避免 Agent 等你而空转
3. **开发 3 Agent 精干不变** — CEO/架构师 (Opus) + 全栈开发 (Standard) + QA/DevOps (Free)
4. **业务线各有专职** — 增长、运营、品牌、生态、社区、自媒体
5. **两个特殊 Agent** — 资源猎手 (开源节流) + 财务官 (钱生钱)
6. **一次 request 捆绑多任务** — 不浪费 Premium 的长会话能力
7. **Agent 即产品** — 团队本身是 Agentrix 平台可售卖的产品模板

### 1.2 运营哲学

```
你的角色: 审批者 (Approver)
  → 不是 CEO (CEO 是 Opus Agent)
  → 不是执行者 (Agent 执行)
  → 你设定方向，审批关键产出，其余 Agent 自行流转
  → 审批可以设定规则: 自动通过 / 手动审核 / 超时自动通过

CEO Agent (Opus) 的角色: 统帅
  → 战略规划、架构设计、重大决策、Agent 间任务协调
  → 每次被激活时捆绑处理多个任务 (架构 + 财务决策 + 资源评估)
  → 一次 Opus request 跑 30min-数小时，处理 3-5 个不同领域任务
```

### 1.3 Request 效率最大化原则

```
❌ 浪费: 一次 Opus request 只做一件事
   Opus → 写一个 RFC → 结束 (消耗 3 credits，只用了 20 分钟)

✅ 高效: 一次 Opus request 捆绑多任务
   Opus → 写 RFC → 审查财务 Agent 的交易日志 → 评估资源猎手找到的 AWS 计划
        → 制定下周 Sprint 优先级 → 更新 Roadmap
   (消耗同样 3 credits，用了 2 小时，产出 5 倍)

捆绑策略:
  1. 每次激活 Opus → 主任务 + 顺带做 1-2 个附属任务
  2. 附属任务来源: 财务官待审决策、资源猎手新发现、增长实验结果分析
  3. Standard 模型同理: 写完代码后顺带更新相关文档、跑测试
```

---

## 2. 资源预算与模型分层

### 2.1 Copilot Pro+ 资源池

| 资源类型 | 额度 | 说明 |
|---------|------|------|
| Premium Requests | 1,500+/月 | 按模型消耗倍率计费 |
| Free Requests | ∞ 无限 | GPT-4.1, GPT-5 mini, Raptor mini 等 |

### 2.2 模型层级与消耗倍率

| 层级 | 倍率 | 代表模型 | 适用场景 |
|------|------|---------|---------|
| 💎 **Premium** | 3× | Claude Opus 4.6 | CEO 统帅、架构、每次捆绑多任务 |
| 🔥 **Standard** | 1× | Sonnet 4.6 / GPT-5.4 | 全栈开发、增长策略 |
| ⚡ **Budget** | 0.25–0.33× | Claude Haiku / Gemini Flash | 生态对接、资源搜索 |
| 🆓 **Free** | 0× | GPT-4.1, GPT-5 mini | 高频日常：QA、运维、内容、社区 |

---

## 3. 完整团队架构

### 3.1 组织架构总览

```
┌────────────────────────────────────────────────────────────┐
│                    你 (Human Approver)                      │
│         手动/自动审批 · 方向设定 · 最终否决权                  │
└──────────────────────────┬─────────────────────────────────┘
                           │ 审批
┌──────────────────────────┴─────────────────────────────────┐
│                  💎 CEO Agent (Opus 4.6)                    │
│   战略·架构·决策·协调·每次 request 捆绑多任务                  │
└──────┬──────────┬──────────┬──────────┬────────────────────┘
       │          │          │          │
  ┌────┴────┐┌───┴────┐┌───┴────┐┌───┴───────────────┐
  │🔧 开发组 ││📈增长运营││🌐生态品牌││💰 特殊任务组         │
  │ 2 Agent ││ 3 Agent││ 3 Agent││ 2 Agents          │
  └────┬────┘└───┬────┘└───┬────┘└───┬───────────────┘
       │         │         │         │
    🔥  🆓    🔥  🆓  🆓   ⚡  🆓  🆓  🆓  🆓
   全栈 QA/ 增长 运营 自   生态 社区 品牌 资源 财务
   开发 Ops  官  官  媒体  官  管理 内容 猎手 官
```

### 3.2 全团队清单 (11 Agents)

| # | Agent | 代号 | 组 | 模型 | 层级 | 日频次 | 月 Credits |
|---|-------|------|----|------|------|-------|-----------|
| 1 | **CEO/架构师** | `ceo` | 统帅 | Opus 4.6 | 💎 3× | ~6 次 (捆绑多任务) | **540** |
| 2 | 全栈开发 | `dev` | 开发 | Sonnet 4.6 / GPT-5.4 | 🔥 1× | ~15 次 | **450** |
| 3 | QA/DevOps | `qa-ops` | 开发 | GPT-4.1 | 🆓 0× | ∞ | **0** |
| 4 | 增长官 | `growth` | 增长运营 | Sonnet 4.6 | 🔥 1× | ~5 次 | **150** |
| 5 | 运营官 | `ops` | 增长运营 | GPT-5 mini | 🆓 0× | ∞ | **0** |
| 6 | 自媒体运营 | `media` | 增长运营 | GPT-4.1 | 🆓 0× | ∞ | **0** |
| 7 | 生态官 | `ecosystem` | 生态品牌 | Haiku / Gemini Flash | ⚡ 0.33× | ~8 次 | **80** |
| 8 | 社区管理 | `community` | 生态品牌 | GPT-5 mini | 🆓 0× | ∞ | **0** |
| 9 | 品牌与内容 | `brand` | 生态品牌 | GPT-4.1 | 🆓 0× | ∞ | **0** |
| 10 | **资源猎手** | `hunter` | 特殊任务 | GPT-4.1 | 🆓 0× | ∞ | **0** |
| 11 | **财务官** | `treasury` | 特殊任务 | GPT-5 mini | 🆓 0× | ∞ | **0** |

### 3.3 月度 Credits 汇总

| 组 | Premium Credits/月 | 占比 |
|----|-------------------|------|
| 💎 CEO/架构师 (捆绑多任务) | 540 | 36% |
| 🔧 开发组 | 450 | 30% |
| 📈 增长运营组 | 150 | 10% |
| 🌐 生态品牌组 | 80 | 5% |
| 💰 特殊任务组 | 0 (Free) | 0% |
| **总消耗** | **1,220 / 1,500** | **81%** |
| **弹性储备** | **~280 (19%)** | |

> 资源猎手和财务官均用 Free 高频运转 + 搭便车每次 Opus 会话做深度审查。

---

## 4. 审批机制 (你的核心职能)

### 4.1 审批模式

```
┌─────────────────────────────────────────────────────────────────┐
│                        审批模式设定                                │
├───────────┬─────────────────────────────────────────────────────┤
│ 🟢 自动通过 │ 低风险、日常任务 → Agent 产出后直接执行                  │
│           │ 文档更新、内容发布、测试执行、数据报表、FAQ 更新            │
│           │ 资源猎手的信息收集、财务官小额操作 (< 设定阈值)            │
├───────────┼─────────────────────────────────────────────────────┤
│ 🟡 超时自动 │ 中等风险 → 待审 24h，你不处理则自动通过                   │
│           │ 代码 push (到非 main 分支)、社交媒体内容                  │
│           │ 增长实验方案、生态合作初步提案                             │
├───────────┼─────────────────────────────────────────────────────┤
│ 🔴 手动必审 │ 高风险、不可逆 → 必须你手动审批                          │
│           │ 生产部署、数据库迁移、架构变更 (RFC)                      │
│           │ 财务官大额操作 (> 阈值)、定价变更                         │
│           │ 合作协议签署、服务器操作、删除操作                         │
│           │ Push 到 main/build 分支                                │
└───────────┴─────────────────────────────────────────────────────┘
```

### 4.2 审批矩阵

| 事项 | 审批模式 | 说明 |
|------|---------|------|
| 代码 commit (feature 分支) | 🟢 自动 | Agent 自主提交 |
| 代码 push (feature 分支) | 🟡 超时自动 24h | 你不看则自动 push |
| 代码 push (main/build 分支) | 🔴 手动 | 必须你审 |
| 生产部署 | 🔴 手动 | 必须你审 |
| 数据库迁移 | 🔴 手动 | 必须你审 |
| 架构变更 (RFC) | 🔴 手动 | CEO 产出 → 你审 |
| 增长策略/实验方案 | 🟡 超时自动 24h | |
| 内容/社交媒体发布 | 🟡 超时自动 12h | 日常内容不能等 |
| 文档/FAQ 更新 | 🟢 自动 | |
| 测试执行 | 🟢 自动 | |
| 数据报表 | 🟢 自动 | |
| 资源猎手推荐 | 🟢 自动 (收集)，🔴 手动 (申请) | 收集免费，申请你批 |
| 财务官交易 (< $50) | 🟢 自动 | 小额自主 |
| 财务官交易 ($50-500) | 🟡 超时自动 12h | |
| 财务官交易 (> $500) | 🔴 手动 | 大额你批 |
| 定价变更 | 🔴 手动 | |
| 合作伙伴协议 | 🔴 手动 | |
| 服务器操作 | 🔴 手动 | |
| 删文件/删分支 | 🔴 手动 | |

### 4.3 审批不阻塞原则

```
传统问题: Agent 产出 RFC → 等你审批 → 你忙 → Agent 闲置 3 天 → 浪费

v4 解法:
1. 超时自动通过: 中风险事项 12-24h 不审 → 自动执行
2. 并行推进: 等审批的同时 Agent 继续做下一个任务
3. 你的审批窗口: 每日 2 个时段集中批量审批
4. 拒绝 = 立即回退: 你否决后 Agent 立即修正
```

---

## 5. CEO Agent (Opus 4.6) — 统帅

### 5.1 核心定位

**CEO Agent 不只是架构师，它是整个 Agent 团队的大脑。**

每次 Opus request (~6 次/天) 都是一次 **"综合会议"**，捆绑处理多个任务：

```
一次典型 Opus request (花 1-2 小时):
├── 🏗️ 主任务: 设计新的 commission 多级结算架构 (RFC)
├── 💰 附属1: 审查财务官昨日交易日志，给出下一步策略建议
├── 🔍 附属2: 评估资源猎手发现的 AWS Activate 计划，决定是否申请
├── 📊 附属3: 分析增长官提交的上周实验数据，确认下周优先级
└── 🗓️ 附属4: 更新本周 Sprint 计划和 Roadmap
```

### 5.2 职能范围

| 类别 | 具体任务 |
|------|---------|
| **战略规划** | 季度 OKR、Roadmap、优先级排序、投资人材料 |
| **架构设计** | 新模块架构、跨端方案、数据库 schema、系统集成 |
| **体系建立** | 支付/佣金/Agent Economy/协议 (X402/ERC-8004/MCP) |
| **重构审计** | 大规模重构方案、性能分析、安全审计 |
| **决策协调** | 各组优先级仲裁、资源分配、跨组冲突解决 |
| **财务审查** | 审查财务官操作日志、确认交易策略 (捆绑任务) |
| **资源评估** | 评估资源猎手发现，决定申请哪些 (捆绑任务) |
| **增长复盘** | 分析增长实验结果、确认下一步 (捆绑任务) |

### 5.3 捆绑任务队列机制

```
各 Agent 将待 CEO 处理的事项放入队列:
┌──────────────────────────────────────────────┐
│              CEO 待办队列 (Task Queue)         │
├──────────────────────────────────────────────┤
│ 📌 主任务: [你或 Agent 提出的核心任务]          │
│ 💰 财务审查: 财务官提交的交易日志和决策请求      │
│ 🔍 资源评估: 资源猎手新发现的免费资源列表        │
│ 📈 增长复盘: 增长官提交的实验报告               │
│ 🔧 技术债务: 开发 Agent 提交的技术债清单        │
│ 📊 运营指标: 运营官提交的异常指标               │
└──────────────────────────────────────────────┘

每次 Opus 被激活 → 取主任务 + 2-3 个附属任务一起处理
结果: 6 次/天 × (1 主 + 2-3 附) = 实际处理 18-24 个任务/天
```

---

## 6. 开发组 (2 Agents + CEO 架构能力)

> CEO Agent 兼任架构师角色，开发组只需全栈开发 + QA/DevOps

### 6.1 🔥 全栈开发 (Dev)

**模型**: Sonnet 4.6 / GPT-5.4 (1×)  
**日频次**: ~15 次/天  
**代号**: `dev`

**同 v3 — 一个 request 全栈搞定:**
- 后端 NestJS + 前端 Next.js/RN + Desktop Tauri + 迁移 + 测试
- Sonnet 4.6 (理解深) vs GPT-5.4 (工具调用强)

**捆绑效率**: 全栈开发也应最大化每次 request:
```
一次 Standard request (花 1 小时):
├── 主任务: 实现 skill review 功能 (后端+前端+测试)
├── 附属: 顺手修复 QA 报告的 2 个小 Bug
└── 附属: 更新相关 API 文档
```

### 6.2 🆓 QA/DevOps (qa-ops)

**模型**: GPT-4.1 (Free, ∞)  
**代号**: `qa-ops`  
**同 v3** — 测试、CI/CD、部署、监控、DB 运维

---

## 7. 增长运营组 (3 Agents)

### 7.1 🔥 增长官 (Growth)

**模型**: Sonnet 4.6 (1×)  
**日频次**: ~5 次/天  
**代号**: `growth`  
**同 v3** — 增长策略、实验设计、渠道策略、定价优化、Campaign 策划、竞品分析

### 7.2 🆓 运营官 (Ops)

**模型**: GPT-5 mini (Free, ∞)  
**代号**: `ops`  
**同 v3** — OKR、数据分析、流程管理、用户反馈、成本追踪

### 7.3 🆓 自媒体运营 (Media)

**模型**: GPT-4.1 (Free, ∞)  
**代号**: `media`  
**同 v3** — Twitter/X、技术博客、Newsletter、SEO、视频脚本、中英双语

---

## 8. 生态品牌组 (3 Agents)

### 8.1 ⚡ 生态官 (Ecosystem)

**模型**: Haiku / Gemini Flash (0.25-0.33×)  
**日频次**: ~8 次/天  
**代号**: `ecosystem`  
**同 v3** — 开发者关系、Skill 生态、MCP 生态、合作伙伴、Marketplace、协议推广

### 8.2 🆓 社区管理 (Community)

**模型**: GPT-5 mini (Free, ∞)  
**代号**: `community`  
**同 v3** — Discord/Telegram、GitHub、活动策划、用户故事、FAQ、社区健康

### 8.3 🆓 品牌与内容 (Brand)

**模型**: GPT-4.1 (Free, ∞)  
**代号**: `brand`  
**同 v3** — 品牌文案、落地页、设计方向、演示材料、品牌一致性、ASO/SEO

---

## 9. 特殊任务组 (2 Agents) — 🆕 v4 新增

### 9.1 🆓 资源猎手 (Resource Hunter)

**模型**: GPT-4.1 (Free, ∞)  
**代号**: `hunter`

**核心使命**: 全网搜罗一切免费/低成本资源，为 Agentrix 开源节流。

> 你们之前已经拿到了 AWS $2,000+ 抵扣券。这个 Agent 把这种事变成系统化、持续化的能力。

**职能**:

| 类别 | 具体目标 |
|------|---------|
| **云服务 Credits** | AWS Activate / Azure Startups / GCP Startups / DigitalOcean / Vercel / Railway / Render 等各种创业公司免费额度 |
| **算力资源** | GPU Credits (Lambda / CoreWeave / Together AI)、TPU (Google)、推理免费额度 |
| **大模型 Credits** | OpenAI Startup 计划、Anthropic 合作、Google AI 计划、各种 LLM 免费 API 额度 |
| **存储/CDN** | Cloudflare Free、Backblaze B2、各种 Storage 免费 Tier |
| **加速器/孵化器** | Y Combinator / Techstars / 500 Startups / Web3 加速器 / AI 加速器 申请机会 |
| **Grants & 资金** | Ethereum Foundation / Solana Foundation / Filecoin Grants / 各种 Open Source Grants |
| **黑客松** | ETHGlobal / Devpost / MLH / Gitcoin / 各平台黑客松，找资金+合作伙伴+曝光 |
| **Partnerships** | 技术合作伙伴 (互换资源)、Marketing 互推、渠道合作 |
| **开发者工具** | 免费 CI/CD (GitHub Actions)、免费监控 (Grafana Cloud)、免费错误追踪 (Sentry Free) |
| **法律/合规** | Stripe Atlas / Clerky / 各种创业法律服务免费额度 |

**工作方式**:

```
持续扫描 (每日, Free ∞):
  → 爬取 startup programs 页面
  → 监控 HackerNews/Reddit/Twitter 上的 grants/credits 公告
  → 检查已获取资源的到期日和续期方式
  → 追踪申请进度

输出:
  → 周报: 新发现资源清单 + 推荐申请优先级
  → 放入 CEO 待办队列 → Opus 下次会话时评估决定

审批:
  → 信息收集: 🟢 自动
  → 填写申请: 🔴 你审批 (涉及公司信息/承诺)
```

**Memory 积累**:
```
/memories/agents/hunter/
├── active-resources.md        # 当前已获取的免费资源清单及到期日
├── application-tracker.md     # 申请进度追踪
├── rejected-reasons.md        # 被拒原因分析，下次改进
├── program-calendar.md        # 各加速器/黑客松日历
└── partner-leads.md           # 潜在合作伙伴线索
```

**典型产出**:
```
资源猎手 (周报):
  🟢 已获取: AWS Activate $2,000 (到期 2026-09)
  🆕 新发现:
    1. ★★★ Anthropic AI Startup Program — 免费 Claude API credits $1,000
       申请链接: xxx | 截止: 2026-04-15 | 条件: AI startup
    2. ★★☆ Vercel Pro Free for OSS — 免费部署
       申请链接: xxx | 条件: 开源项目
    3. ★★☆ ETHGlobal 2026 线上黑客松 — $50K 奖金池
       报名截止: 2026-04-20 | 建议参赛方向: Agent Payment Protocol
  ⏰ 到期提醒:
    - GCP Credits $300 → 2026-04-02 到期，申请续期

  → 放入 CEO 队列 → Opus 评估 → 你审批申请
```

---

### 9.2 🆓 财务官 (Treasury Agent)

**模型**: GPT-5 mini (Free, ∞) + CEO Opus 审查  
**代号**: `treasury`

**核心使命**: 管理一个钱包，唯一目标 — **让钱包余额不断增长**。

> 这个 Agent 会被赋予一个真实钱包和起始资金，有自主交易授权。
> 小额操作自主执行，大额由你审批，策略方向由 CEO (Opus) 定期审查。

**钱包设置**:

| 配置 | 说明 |
|------|------|
| 钱包类型 | Agentrix 平台 MPC 钱包 (agent-account) |
| 起始资金 | 你设定 (建议 $100-500 起步) |
| 链 | Solana (低手续费、快速结算) / BSC / Base |
| 授权范围 | 由你设定交易限额和白名单 |
| 安全 | Session Key (ERC-8004) 限制额度 + 你的 Master Key 可随时冻结 |

**赚钱渠道**:

| 渠道 | 方式 | 风险 | 说明 |
|------|------|------|------|
| **Bounties & Tasks** | 接各平台任务赚赏金 | 低 | Gitcoin、Layer3、Galxe、Zealy Tasks |
| **Airdrop 挖矿** | 刷交互、领空投 | 低-中 | 新协议交互、测试网任务 |
| **DEX 流动性** | 提供流动性赚手续费 | 中 | 选择稳定币对 (USDC/USDT) 降低风险 |
| **Staking/Yield** | 质押生息 | 低 | SOL staking、USDC lending |
| **预测市场** | Polymarket 等预测事件 | 中-高 | CEO (Opus) 分析后给方向 |
| **NFT Mint/Flip** | 低成本打新、快速卖出 | 高 | 仅参与有高确定性的项目 |
| **任务平台** | 完成链上任务赚报酬 | 低 | Crew3、QuestN、Galxe |
| **Referral** | 推荐返佣 | 低 | 各平台 referral 积累 |

**风控机制**:

```
┌──────────────────────────────────────────────────────────┐
│                  财务官风控层级                              │
├──────────────┬───────────────────────────────────────────┤
│ 单笔 < $50   │ 🟢 自动执行，记录日志                        │
│ 单笔 $50-500 │ 🟡 提交到 CEO 队列，12h 超时自动             │
│ 单笔 > $500  │ 🔴 必须你手动审批                           │
│ 日亏损 > 10% │ 🛑 自动暂停所有交易，等你+CEO 审查            │
│ 周亏损 > 20% │ 🛑 冻结钱包，全面复盘                        │
│ 未授权合约交互│ 🛑 禁止 (仅白名单合约)                       │
└──────────────┴───────────────────────────────────────────┘
```

**与 CEO Agent (Opus) 协作**:

```
财务官 (Free, 每日):
  → 监控市场、执行低风险操作、整理日志
  → 发现高价值机会 → 提交到 CEO 队列

CEO Agent (Opus, 捆绑任务):
  → 审查财务日志: "昨天 Staking 收益 $2.3，Bounty 完成 2 个获 $35"
  → 策略建议: "增加 USDC lending 比例到 40%，减少预测市场敞口"
  → 评估新机会: "这个新 L2 的空投交互值得做，预估成本 $5，预期收益 $50-200"
```

**Memory 积累**:
```
/memories/agents/treasury/
├── wallet-status.md           # 当前钱包余额和持仓
├── trade-log.md               # 交易日志 (每笔记录)
├── strategy-playbook.md       # 有效策略积累
├── risk-incidents.md          # 亏损复盘和教训
├── opportunity-pipeline.md    # 待执行机会管道
└── earnings-summary.md        # 收益汇总 (日/周/月)
```

**KPI**:

| 指标 | 目标 (Phase 1) | 长期目标 |
|------|---------------|---------|
| 月收益率 | > 5% | > 15% |
| 最大回撤 | < 20% | < 10% |
| 日均操作数 | 3-5 笔 | 10+ 笔 |
| Bounty 完成率 | > 70% | > 90% |
| 亏损交易比例 | < 30% | < 15% |

---

## 10. Request 捆绑策略详解

### 10.1 Opus (CEO) 捆绑模板

每次 Opus 被激活时使用此捆绑结构:

```markdown
# CEO Daily Session [日期]

## 主任务 (你或系统指定)
[具体任务描述]

## 附属任务队列 (自动拉取)

### 💰 财务审查
- 昨日交易日志: [附上 treasury trade-log]
- 待决策项: [大额操作审批请求]

### 🔍 资源评估
- 资源猎手新发现: [附上 hunter 周报]
- 到期资源提醒: [附上到期清单]

### 📈 增长复盘 (如有)
- 实验数据: [附上 growth 实验报告]

### 🔧 技术债务 (如有)
- 开发组提交的技术债清单

## 输出要求
1. 主任务完整方案
2. 财务策略调整建议
3. 资源申请优先级决定
4. 增长方向确认
5. 更新本周 Sprint 优先级
```

### 10.2 Standard (全栈开发) 捆绑模板

```markdown
# Dev Session

## 主任务
[Feature 开发 / Bug 修复]

## 附属任务 (顺带完成)
- 更新相关 API 文档
- 修复 QA 报告的相关小 Bug
- 更新 Changelog
```

### 10.3 Standard (增长官) 捆绑模板

```markdown
# Growth Session

## 主任务
[增长策略 / 实验设计]

## 附属任务
- 分析上周渠道数据
- 更新竞品动态
- 草拟下周内容计划给自媒体 Agent
```

### 10.4 捆绑效率测算

| 模型 | 不捆绑 | 捆绑后 | 效率提升 |
|------|--------|--------|---------|
| Opus (6次/天) | 6 个任务 | 18-24 个任务 | **3-4×** |
| Standard Dev (15次/天) | 15 个任务 | 25-30 个任务 | **1.7-2×** |
| Standard Growth (5次/天) | 5 个任务 | 8-10 个任务 | **1.6-2×** |
| **总日产出** | **26 个任务** | **51-64 个任务** | **~2.2×** |

---

## 11. 月度 Premium 额度策略

### 11.1 额度分配 (同 v3)

| Agent | 层级 | 日频次 | 月 Credits |
|-------|------|--------|-----------|
| 💎 CEO/架构师 | 3× | ~6/天 | 540 |
| 🔥 全栈开发 | 1× | ~15/天 | 450 |
| 🔥 增长官 | 1× | ~5/天 | 150 |
| ⚡ 生态官 | 0.33× | ~8/天 | 80 |
| 🆓 × 7 | 0× | ∞ | 0 |
| **总计** | | | **1,220/1,500** |
| **弹性** | | | **280 (19%)** |

### 11.2 额度保护

```
月消耗 < 75%:  ✅ 正常
月消耗 75-90%: ⚠️ CEO 降到 4 次/天
月消耗 90-95%: 🔶 CEO 2 次/天 + 增长官 3 次/天
月消耗 > 95%:  🔴 仅 P0 事项用 Premium
```

---

## 12. 自我进化机制

### 12.1 Memory 积累系统

```
/memories/agents/
├── ceo/                           # CEO/架构师
│   ├── architecture-decisions.md
│   ├── strategy-log.md
│   └── sprint-retrospectives.md
├── dev/                           # 全栈开发
│   ├── common-bugs.md
│   ├── code-conventions.md
│   └── deployment-log.md
├── growth/                        # 增长官
│   ├── experiment-results.md
│   ├── channel-performance.md
│   └── competitor-intel.md
├── ecosystem/                     # 生态官
│   ├── partner-playbook.md
│   └── dev-community-insights.md
├── ops/                           # 运营官
│   └── kpi-baselines.md
├── media/                         # 自媒体
│   ├── content-templates.md
│   └── best-performing-posts.md
├── community/                     # 社区
│   └── faq-answers.md
├── brand/                         # 品牌
│   └── brand-voice-guide.md
├── hunter/                        # 资源猎手 🆕
│   ├── active-resources.md
│   ├── application-tracker.md
│   └── program-calendar.md
└── treasury/                      # 财务官 🆕
    ├── wallet-status.md
    ├── trade-log.md
    ├── strategy-playbook.md
    └── earnings-summary.md
```

### 12.2 进化指标

| 组 | 指标 | 目标 |
|----|------|------|
| CEO | 决策被你否决率 | < 20% |
| CEO | 捆绑任务日均处理量 | ≥ 18 |
| 开发 | 一次 request 完成率 | > 80% |
| 增长 | 增长实验成功率 | > 30% |
| 资源猎手 | 月发现有效资源数 | ≥ 5 |
| 资源猎手 | 已获取免费资源总价值 | 持续增长 |
| 财务官 | 月钱包增长率 | > 5% |
| 财务官 | 最大回撤 | < 20% |

---

## 13. 实施计划

### Phase 1: 立即启动 — OpenClaw 实例部署 (Day 1-5)

- [ ] **Day 1**: 改名 4 个现有实例 (03→ceo, 04→treasury, myagent→dev, wesley→hunter)
- [ ] **Day 1**: 创建 7 个新 cloud 实例 (growth, ops, media, ecosystem, community, brand, qa-ops)
- [ ] **Day 1-2**: 为每个实例配置 personality 系统提示词 (§16.5)
- [ ] **Day 2**: 为每个实例配置技能开关 (§16.4)
- [ ] **Day 2**: 创建 11 个 `.agent.md` 文件 + `.github/copilot-instructions.md`
- [ ] **Day 2-3**: 为 Treasury 绑定 AgentAccount + Solana 钱包 + 注入起始资金
- [ ] **Day 3**: A2A 冒烟测试 (CEO↔Treasury, CEO↔Hunter, Growth↔Media)
- [ ] **Day 3-5**: Hunter 首轮全网资源扫描
- [ ] **Day 3-5**: Treasury 初始化交易策略 (低风险: Lending + Staking + Bounty)
- [ ] **Day 5**: CEO 产出第一版季度 OKR (捆绑: 财务审查 + 资源评估)

### Phase 2: 工作流跑通 + 自我成长 (2-4 周)

- [ ] CEO 捆绑任务队列机制跑通 (日均处理 18+ 任务)
- [ ] 财务官完成首批 Bounty 收益 + DeFi yield 启动
- [ ] 资源猎手获取至少 1 项新免费资源
- [ ] 增长官完成第一个实验闭环
- [ ] 各 Agent 通过 skill_search + skill_install 自主安装新技能 (≥ 3 个/Agent)
- [ ] 各 Agent 的 agent 级 Memory 积累 ≥ 5 条
- [ ] A2A 跨 Agent 协作正常运转 (CEO 可调用所有 Agent)

### Phase 3: 产品化 — 封装为模板 (4-8 周)

- [ ] Dog-fooding 问题修复完毕，团队稳定运转
- [ ] "Agent 工作室模板" 封装 (一键创建 11 实例 + 配置)
- [ ] Marketplace 上架模板
- [ ] Team 管理 Dashboard (Agent 状态 + 审批 + A2A 可视化)
- [ ] 财务官月收益率 > 5%
- [ ] 资源猎手累计获取 > $5,000 等值资源

### Phase 4: 提升自动化 (8-12 周)

- [ ] 你的日常参与度从 80% → 50%
- [ ] 财务官策略成熟，自主运转
- [ ] 资源猎手建立完整的 Program 日历和自动申请流程
- [ ] Agent 团队自我进化: 每个 Agent 的技能库 > 30 个

---

## 14. 盈利模型

### 14.1 成本结构

| 成本项 | 月费 |
|-------|------|
| Copilot Pro+ | ~$39 |
| 服务器 (18.139.157.116) | ~$50-100 |
| 域名 + SSL | ~$5 |
| 财务官起始资金 | $100-500 (一次性) |
| **总月运营成本** | **~$100-150** |

### 14.2 收入来源

| 来源 | 类型 | 说明 |
|------|------|------|
| 💰 财务官自主收益 | 持续 | 钱包增长 → 直接变现 |
| 🔍 资源猎手节约 | 持续 | 免费资源 = 省下的真金白银 |
| 🛒 Agent 模板销售 | 产品 | $99-499/套 |
| 📦 工作室订阅 | 产品 | $199-999/月 |
| 💸 Marketplace 佣金 | 平台 | 5-15% 抽成 |
| 🏢 企业定制 | 服务 | $2,000-10,000/项目 |

### 14.3 等效产出价值

```
总等效价值: $21,000-38,000/月 (同 v3)
+ 资源猎手: 月均节约 $500-2,000 (云资源/工具/加速器)
+ 财务官: 月均增长 $50-500 (从 $1,000 本金计)
总成本: ~$150/月
ROI: 150-280×
```

---

## 15. 风险与应对

| 风险 | 应对 |
|------|------|
| CEO Agent 决策偏差 | 🔴 高风险事项你手动审批 + CEO Memory 持续校准 |
| 财务官亏损 | 分层风控 (限额+止损+白名单) + CEO 定期审查策略 |
| 资源猎手申请被拒 | 分析原因存 Memory → 改进下次申请 |
| Premium 额度紧张 | 19% 弹性 + 动态降级 + 捆绑提效 |
| 审批堆积 | 超时自动通过机制 + 你每日 2 窗口集中处 |
| 失控风险 | 审批制 + 破坏性操作必须手动确认 + 钱包可随时冻结 |

---

## 16. OpenClaw 实例实施方案 (管理员优先)

> **策略**: 先在管理员账户 (zhouyachi2023@gmail.com) 上实施，dog-fooding 验证稳定高效后，
> 封装为产品模板推广给普通用户。

### 16.1 管理员账户现状

| 项 | 详情 |
|----|------|
| 账户 | zhouyachi2023@gmail.com (Google 登录) |
| 订阅 | Copilot Pro+ (1,500+ premium requests) |
| 现有实例 | **5 个**: 02, 03, 04, myagent, wesley |
| 保留 | **02** — 你的个人全能助手，不动 |
| 可用 | **4 个** (03, 04, myagent, wesley) + 可继续创建 |

### 16.2 每个 Agent = 1 个 OpenClaw 实例

每个 Agent 在两层存在:

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: VS Code Copilot                  │
│  .agent.md 文件 → 在 VS Code 中 @ceo @dev @hunter 调用      │
│  适合: 代码/文档/策略类任务 (利用 Copilot Pro+ 模型)          │
└──────────────────────────┬──────────────────────────────────┘
                           │ 同一个 Agent 身份
┌──────────────────────────┴──────────────────────────────────┐
│                  Layer 2: OpenClaw Instance                   │
│  平台实例 → 在 Web/Mobile/Desktop 中对话调用                   │
│  适合: 搜索/交易/A2A/Marketplace/Skill 类任务                  │
│  拥有: personality(人设) + skills(技能) + memory(记忆)         │
│        + wallet(钱包) + A2A(跨Agent通信)                      │
└─────────────────────────────────────────────────────────────┘
```

### 16.3 实例分配方案

#### 复用 4 个现有实例 (改名 + 配置):

| 现有实例 | → 改名为 | Agent 角色 | 原因 |
|---------|----------|-----------|------|
| **03** | **ceo** | 💎 CEO/架构师 | 核心统帅，第一个启用 |
| **04** | **treasury** | 💰 财务官 | 需要 wallet/payment 工具 |
| **myagent** | **dev** | 🔥 全栈开发 | 通用名改为明确角色 |
| **wesley** | **hunter** | 🔍 资源猎手 | web_search/web_fetch 重度用户 |

#### 新建 7 个实例:

| 新实例名 | Agent 角色 | 类型 |
|---------|-----------|------|
| **growth** | 📈 增长官 | platform-hosted (cloud) |
| **ops** | 📊 运营官 | platform-hosted (cloud) |
| **media** | 📱 自媒体运营 | platform-hosted (cloud) |
| **ecosystem** | 🌐 生态官 | platform-hosted (cloud) |
| **community** | 👥 社区管理 | platform-hosted (cloud) |
| **brand** | 🎨 品牌与内容 | platform-hosted (cloud) |
| **qa-ops** | 🔧 QA/DevOps | platform-hosted (cloud) |

#### 最终 12 个实例 (11 Agent + 1 个人):

```
你的 OpenClaw 实例矩阵:
┌────────┬──────────┬──────────────┬──────────────────────────┐
│ 实例名  │ 角色      │ 类型         │ 核心技能                   │
├────────┼──────────┼──────────────┼──────────────────────────┤
│ 02     │ 你的助手  │ cloud        │ 全部 (个人使用)             │
│ ceo    │ CEO/架构  │ cloud        │ agent_invoke + 全局协调     │
│ dev    │ 全栈开发  │ cloud        │ code_eval + skill_execute  │
│ qa-ops │ QA/DevOps │ cloud        │ web_fetch + code_eval      │
│ growth │ 增长官    │ cloud        │ web_search + web_fetch     │
│ ops    │ 运营官    │ cloud        │ asset_overview + code_eval │
│ media  │ 自媒体    │ cloud        │ web_search + open_url      │
│ ecosystem│ 生态官  │ cloud        │ agent_discover + web_search│
│ community│ 社区    │ cloud        │ web_search + web_fetch     │
│ brand  │ 品牌内容  │ cloud        │ web_search + web_fetch     │
│ hunter │ 资源猎手  │ cloud        │ web_search + airdrop_disc  │
│ treasury│ 财务官  │ cloud        │ get_balance + x402_pay     │
└────────┴──────────┴──────────────┴──────────────────────────┘
```

### 16.4 每个实例的配置项

每个 OpenClaw 实例需要配置:

```typescript
// 以 CEO 实例为例
{
  name: "ceo",
  instanceType: "cloud",
  status: "active",
  isPrimary: false,           // 02 保持 primary
  personality: `你是 Agentrix 项目的 CEO Agent，代号 ceo。
    你的职责：战略规划、架构设计、体系建立、Agent 团队协调。
    每次被激活时你要：
    1. 先处理主任务
    2. 然后检查 CEO 待办队列 (财务审查、资源评估、增长复盘)
    3. 通过 agent_invoke 调用其他 Agent 获取信息或分派任务
    你通过 A2A 与 treasury, hunter, growth, dev 等 Agent 协作。
    你的决策需要提交给 Human Approver 审批。`,
  capabilities: {
    platformHosted: true,
    platformTools: ["agent_invoke", "agent_discover", "web_search",
                    "web_fetch", "code_eval", "skill_search",
                    "skill_install", "task_post"],
    llmProvider: "bedrock",
    activeModel: "claude-sonnet-4-5",  // 平台侧用 Sonnet (Opus 在 Copilot 侧)
    teamRole: "ceo",
    teamId: "agentrix-core-team"
  },
  metadata: {
    agentAccountId: "<绑定的 AgentAccount UUID>",
    teamRole: "ceo",
    approvalLevel: "human-required-for-red",
    taskQueue: []    // CEO 待办队列
  }
}
```

### 16.5 各 Agent 实例 Personality (系统提示词)

| Agent | personality 核心 | 特殊技能开关 |
|-------|-----------------|-------------|
| **ceo** | "你是 CEO Agent，统帅全局，每次会话捆绑处理主任务+附属任务，通过 agent_invoke 协调团队" | agent_invoke ✅, task_post ✅ |
| **dev** | "你是全栈开发 Agent，精通 NestJS+Next.js+RN+Tauri，一次 request 搞定后端+前端+测试" | code_eval ✅, skill_execute ✅ |
| **qa-ops** | "你是 QA/DevOps Agent，负责测试执行、CI/CD 监控、部署流程、数据库运维" | code_eval ✅, web_fetch ✅ |
| **growth** | "你是增长官，负责用户增长策略、A/B 实验设计、渠道分析、竞品研究" | web_search ✅, web_fetch ✅ |
| **ops** | "你是运营官，负责 OKR 跟踪、数据报表、流程优化、用户反馈分析" | asset_overview ✅, code_eval ✅ |
| **media** | "你是自媒体运营，负责 Twitter/X、技术博客、Newsletter、SEO 内容、中英双语" | web_search ✅, open_url ✅ |
| **ecosystem** | "你是生态官，负责开发者关系、Skill 生态扩展、MCP 协议推广、合作伙伴对接" | agent_discover ✅, skill_search ✅ |
| **community** | "你是社区管理，负责 Discord/Telegram 社区、GitHub issues、活动策划" | web_search ✅, web_fetch ✅ |
| **brand** | "你是品牌内容官，负责品牌文案、落地页、演示材料、品牌一致性" | web_search ✅, web_fetch ✅ |
| **hunter** | "你是资源猎手，唯一使命：全网搜罗免费资源(云/算力/Credits/加速器/Grants/黑客松)" | web_search ✅, airdrop_discover ✅, web_fetch ✅ |
| **treasury** | "你是财务官，管理钱包，唯一目标：让钱包余额增长。低风险操作自主执行，高价值机会提交 CEO" | get_balance ✅, x402_pay ✅, quickpay ✅, airdrop_discover ✅ |

### 16.6 OpenClaw 自我成长机制

每个 Agent 都是 OpenClaw 实例，天然拥有 **自我成长** 能力:

```
┌────────────────────────────────────────────────────────────────┐
│                   Agent 自我成长闭环                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1️⃣ 发现需求                                                    │
│     Agent 在工作中发现自己缺少某个能力                              │
│     例: Treasury Agent 需要查看 DeFi 收益率                       │
│                                                                │
│  2️⃣ 搜索技能 (skill_search)                                     │
│     → 搜索 Marketplace 中是否有相关 Skill                        │
│     → 或通过 skill_recommend 获取推荐                            │
│                                                                │
│  3️⃣ 安装技能 (skill_install)                                    │
│     → 免费 Skill: 自动安装 (🟢 审批)                             │
│     → 付费 Skill: marketplace_purchase → 你审批 (🔴)             │
│                                                                │
│  4️⃣ 执行验证 (skill_execute)                                    │
│     → 用新 Skill 完成任务                                        │
│     → 不好用 → 卸载，搜索替代                                     │
│                                                                │
│  5️⃣ 知识积累 (agent memory)                                     │
│     → 有效的 Skill + 使用技巧存入 agent 级记忆                    │
│     → 下次直接调用，不再搜索                                      │
│                                                                │
│  6️⃣ 跨 Agent 共享 (shared memory)                               │
│     → 好的 Skill 推荐给其他 Agent                                │
│     → 通过 agent_invoke 分享发现                                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**具体示例**:

```
[Treasury Agent 自我成长场景]

Day 1: 只有基础 25 个 preset skills
Day 3: 发现需要查看 Solana DeFi 收益 → skill_search("defi yield")
       → 找到 "DeFi Yield Scanner" Skill → skill_install
Day 5: 需要自动执行 swap → skill_search("dex swap")
       → 找到 "Jupiter Swap" Skill → 付费 → 你审批 → 安装
Day 10: 技能库从 25 → 28，效率提升
       → 将好用的 Skill 通过 shared memory 推荐给 Hunter Agent
Day 30: 每个 Agent 平均增长 3-8 个 Skill，团队整体能力自适应提升
```

### 16.7 A2A (Agent-to-Agent) 通信拓扑

```
                       ┌──────────┐
                       │  CEO 🧠  │
                       │(agent_invoke)
                       └─────┬────┘
              ┌──────────┬───┴───┬──────────┬──────────┐
              │          │       │          │          │
         ┌────┴───┐ ┌───┴──┐ ┌─┴────┐ ┌──┴───┐ ┌───┴───┐
         │ Dev 🔥 │ │Growth│ │Ecosys│ │Hunter│ │Treas. │
         └────┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬────┘
              │        │        │        │        │
         ┌────┴───┐ ┌──┴───┐ ┌─┴────┐   │        │
         │QA/Ops  │ │ Ops  │ │Commu.│   │        │
         └────────┘ │ Media│ │Brand │   │        │
                    └──────┘ └──────┘   │        │
                                        │        │
                      资源发现 ←──────────┘        │
                      财务审查 ←───────────────────┘

A2A 调用示例:
  CEO → agent_invoke("treasury", "提交昨日交易日志")
  CEO → agent_invoke("hunter", "本周新发现的免费资源")
  Hunter → agent_invoke("ceo", "发现 AWS Activate 新计划，建议申请")
  Treasury → agent_invoke("ceo", "发现高价值 Bounty，请求 $200 授权")
  Growth → agent_invoke("media", "请发布本周增长数据推文")
  Ecosystem → agent_invoke("community", "新合作伙伴入驻，请社区公告")
```

### 16.8 Agent Memory 分层

```typescript
// 每个 Agent 实例使用 4 级 Memory:

MemoryScope.SESSION   // 单次对话内 (自动)
MemoryScope.AGENT     // Agent 长期记忆 (核心! 自我成长的基础)
MemoryScope.USER      // 跨 Agent 共享 (你的偏好，所有 Agent 可读)
MemoryScope.SHARED    // 定向共享 (CEO ↔ Treasury 共享财务策略)

// CEO agent 级记忆示例:
{
  key: "architecture_decision_001",
  scope: "agent",
  type: "workflow",
  value: {
    decision: "Commission 系统采用多级结算",
    rationale: "支持 3 级分销...",
    date: "2026-04-01",
    approved: true
  },
  metadata: { importance: 0.95, tags: ["architecture", "commission"] }
}

// Treasury agent 级记忆示例:
{
  key: "strategy_staking_yield",
  scope: "agent",
  type: "state",
  value: {
    strategy: "USDC lending on Aave",
    currentAPY: "4.2%",
    allocatedAmount: "$200",
    startDate: "2026-04-01"
  },
  metadata: { importance: 0.8, tags: ["staking", "yield", "low-risk"] }
}

// Shared memory (CEO ↔ all):
{
  key: "weekly_sprint_priorities",
  scope: "shared",
  type: "workflow",
  value: {
    week: "2026-W14",
    priorities: ["Commission MVP", "Mobile voice fix", "Hunter first scan"]
  },
  metadata: { importance: 1.0, tags: ["sprint"] }
}
```

### 16.9 执行步骤 (Action Plan)

#### Step 1: 改名现有实例 (Day 1)

通过 API 或后台直接更新:
```sql
-- 改名现有 4 个实例
UPDATE openclaw_instances SET name = 'ceo',      personality = '...' WHERE name = '03'      AND user_id = '<your-user-id>';
UPDATE openclaw_instances SET name = 'treasury',  personality = '...' WHERE name = '04'      AND user_id = '<your-user-id>';
UPDATE openclaw_instances SET name = 'dev',       personality = '...' WHERE name = 'myagent' AND user_id = '<your-user-id>';
UPDATE openclaw_instances SET name = 'hunter',    personality = '...' WHERE name = 'wesley'  AND user_id = '<your-user-id>';
```

#### Step 2: 创建 7 个新实例 (Day 1)

通过 `provisionCloudInstance` API:
```
POST /api/openclaw/instances/provision
{
  "name": "growth",
  "personality": "你是增长官...",
  "llmProvider": "bedrock"
}
// 重复 7 次: growth, ops, media, ecosystem, community, brand, qa-ops
```

#### Step 3: 为财务官绑定 AgentAccount + 钱包 (Day 1-2)

```
POST /api/openclaw/instances/:treasury-id/bind-agent
{
  "agentAccountId": "<创建或绑定的 AgentAccount UUID>"
}
// AgentAccount 绑定 Solana 钱包 → treasury 实例获得交易能力
```

#### Step 4: 为每个实例配置技能开关 (Day 2)

```
PUT /api/openclaw/proxy/:instance-id/skills/:skill-id/toggle
// CEO: 开启 agent_invoke, task_post
// Treasury: 开启 airdrop_discover (默认关), get_balance, x402_pay
// Hunter: 开启 airdrop_discover, web_search, web_fetch
// 其他: 使用默认 preset skills
```

#### Step 5: 创建 VS Code .agent.md 文件 (Day 2)

```
.github/agents/
├── ceo.agent.md       # @ceo → Opus 4.6
├── dev.agent.md       # @dev → Sonnet 4.6
├── qa-ops.agent.md    # @qa-ops → Free
├── growth.agent.md    # @growth → Sonnet 4.6
├── ops.agent.md       # @ops → Free
├── media.agent.md     # @media → Free
├── ecosystem.agent.md # @ecosystem → Budget
├── community.agent.md # @community → Free
├── brand.agent.md     # @brand → Free
├── hunter.agent.md    # @hunter → Free
├── treasury.agent.md  # @treasury → Free
```

#### Step 6: 冒烟测试 A2A (Day 3)

```
测试 1: CEO → agent_invoke("treasury", "报告钱包余额")
测试 2: CEO → agent_invoke("hunter", "搜索 AWS Activate 计划")
测试 3: Hunter → agent_invoke("ceo", "发现新资源，请评估")
测试 4: Growth → agent_invoke("media", "请发布增长数据")
```

#### Step 7: 资源猎手首次扫描 (Day 3-5)

```
与 Hunter 实例对话:
"开始第一轮全网资源扫描。搜索以下类别:
 1. Cloud Credits (AWS/GCP/Azure 创业计划)
 2. AI/LLM API Credits
 3. 近期区块链黑客松
 将发现整理为清单，标注优先级。"
```

#### Step 8: 财务官初始化 (Day 3-5)

```
1. 注入起始资金到 Solana 钱包
2. 与 Treasury 实例对话:
   "初始化交易策略，从低风险开始:
    - 50% USDC Lending (Aave/Solend)
    - 30% SOL Staking
    - 20% Bounty 任务 (Gitcoin/Layer3)
    报告初始配置。"
```

### 16.10 产品化路径 (管理员验证后)

```
Phase A: 管理员 Dog-fooding (当前)
  → 11 实例在你的账号运行
  → 验证 A2A 通信、Skill 自安装、Memory 积累
  → 收集和修复问题

Phase B: 封装模板 (验证后 4-8 周)
  → "Agent 工作室模板" = 一键创建 N 个实例 + 预配置 personality + 技能
  → 模板上架 Marketplace
  → 用户购买后在自己账户一键部署 11 个 Agent Team

Phase C: 平台功能补全
  → Team 管理 UI (看板: 全部 Agent 状态/Memory/任务)
  → 审批 Dashboard (🟢🟡🔴 一目了然)
  → A2A 可视化 (消息流图)
  → Agent Memory 浏览器
```

---

## 附录 A: v1 → v4 演进摘要

| 维度 | v1 | v2 | v3 | v4 (当前) |
|------|----|----|----|----|
| 总 Agent 数 | 15 | 3 | 9 | **11** |
| CEO 角色 | Agent (Opus) | 你 (Human) | 你 (Human) | **Agent (Opus)** + 你审批 |
| 开发 Agent | 5 (拆太细) | 3 | 3 | **2** + CEO 兼架构 |
| 业务 Agent | 10 | 0 | 6 | **6** |
| 特殊 Agent | 0 | 0 | 0 | **2** (资源猎手+财务官) |
| 审批方式 | 无 | 全手动 | 全手动 | **手动/自动/超时三级** |
| Request 效率 | 低 (一任务一次) | 中 | 中 | **高 (捆绑多任务)** |
| 月 Credits | ~1,010 | ~990 | ~1,220 | **~1,220** (捆绑后产出翻倍) |
| 赚钱能力 | 无 | 无 | 无 | **财务官自主盈利** |
| 省钱能力 | 无 | 无 | 无 | **资源猎手系统化获取** |

## 附录 B: Agent 选型速查

| 你要做什么 | 选哪个 Agent | 模型 |
|-----------|-------------|------|
| 战略决策、架构设计、体系建立 | 💎 CEO | Opus 4.6 (捆绑多任务) |
| 写代码 (全栈一体) | 🔥 全栈开发 | Sonnet 4.6 / GPT-5.4 |
| 增长策略、Campaign、定价 | 🔥 增长官 | Sonnet 4.6 |
| SDK、合作方案、开发者引导 | ⚡ 生态官 | Haiku / Gemini Flash |
| 跑测试、部署、CI/CD | 🆓 QA/DevOps | GPT-4.1 |
| 日报、数据报表 | 🆓 运营官 | GPT-5 mini |
| 社交媒体、博客、Newsletter | 🆓 自媒体 | GPT-4.1 |
| Discord/Telegram | 🆓 社区 | GPT-5 mini |
| 品牌文案、落地页 | 🆓 品牌 | GPT-4.1 |
| 找免费资源/加速器/黑客松 | 🆓 资源猎手 | GPT-4.1 |
| 钱包增值、Bounty、Yield | 🆓 财务官 | GPT-5 mini |
