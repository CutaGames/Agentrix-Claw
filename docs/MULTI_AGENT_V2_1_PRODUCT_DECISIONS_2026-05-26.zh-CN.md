# Multi-Agent V2.1 Product Decisions(PM Signoff)

**日期**: 2026-05-26
**PM**: 老板
**作者**: Multi-Agent V2 Ship Captain
**输入**: [`MULTI_AGENT_V2_ACCOUNT_LLM_BUSINESS_DISCUSSION_2026-05-26.zh-CN.md`](./MULTI_AGENT_V2_ACCOUNT_LLM_BUSINESS_DISCUSSION_2026-05-26.zh-CN.md) §10 八个 OPEN ISSUE
**性质**: **决策固化文件,v2.1 spec / 实施依据**

---

## 1. 决策矩阵

| # | Issue | PM 决策 | 备注 |
|---|---|---|---|
| 1 | 商业模式 | **E 混合** | sub + BYO + marketplace 三条腿 |
| 2 | Free tier daily cap | **20 sub-tasks/天** | 1k free DAU ≈ $240/天平台成本(Haiku) |
| 3 | Pro 月含 sub-tasks | **200 sub-tasks/月** | Pro $19,LLM 成本 $2.4,毛利率 87% |
| 4 | Marketplace 雇主端定价 | **Uber 上限模式** | 显示估价 + 实际不超估价 |
| 5 | Arena 是否匿名 | **❌ 不匿名** | 默认显示真名;Pro 用户可选匿名 |
| 6 | Mobile 展示 AgentAccount | **✅ 全部** | 包括 spending limits / credit score / earnings / ELO |
| 7 | Subscription tier ladder | 见 §2 | **Pro = Sonnet 4.6**(不是 4) |
| 8 | W7 marketplace flag 时机 | **v2.1 ship OFF + v2.2 单独 launch** | 给市场推广留时间 |

---

## 2. Subscription Tier Model Ladder(Issue 7 — 最终版)

| Tier | 默认模型 | On-demand 解锁 | 月含 sub-tasks | LLM 成本预估 |
|---|---|---|---|---|
| **Free** | `claude-haiku-4-5-20251001` | — | 20/天(600/月封顶) | $7.2/月/用户 |
| **Pro ($19/月)** | `claude-sonnet-4-6` | Opus 4.7(用户主动选,$0.15/spawn 加价) | 200/月 | $9/月/用户 |
| **Business ($99/月)** | `claude-sonnet-4-6` | Opus 4.7 默认可用 | 1000/月 | $45/月/用户 |
| **Enterprise (custom)** | 全部 + 用户自部署 Bedrock | — | 无限 | 用户自承担 |

### 2.1 Sonnet 4.6 真实 Bedrock model id

代码已存在(`backend/src/modules/llm-router/tier-resolver.service.ts:67`):
```
'anthropic.claude-sonnet-4-6-v1:0' → friendly 'claude-sonnet-4-6'
跨 region: 'us.anthropic.claude-sonnet-4-6-v1:0'
当前 alias 重定向到: 'us.anthropic.claude-sonnet-4-20250514-v1:0'
```

**注**: Bedrock 当前的 `claude-sonnet-4-6-v1:0` alias 实际指向 `claude-sonnet-4-20250514-v1:0`(2025 年 5 月版)。当 Bedrock 上线真实 4.6 时,`bedrock-integration.service.ts:71` 的映射要更新。

### 2.2 Opus 4.7 已经存在

代码:`'us.anthropic.claude-opus-4-7-20260401-v1:0'`(`cost-tracker.service.ts:69`)。$15/M input, $75/M output。

---

## 3. Free Tier 限制实施细节

### 3.1 Hard limits

```typescript
const FREE_TIER_LIMITS = {
  dailySubTasksCap: 20,
  monthlySubTasksHardCap: 600,  // 200% of daily × 30 (let burst)
  spawnFanOutCap: 3,             // 一次 spawn 最多产 3 个 sub-task (vs Pro 4)
  budgetUsdPerSpawnCap: 0.5,     // 单 spawn 不超 $0.5 (vs Pro $1)
  modelTier: 'haiku-only',       // 强制 Haiku 4.5
  byoBridgeEnabled: false,       // BYO key 即使填了也不接通
  marketplaceHire: 'browse-only',// 能浏览不能雇佣
  arenaWagerCurrency: 'AXP',     // 不能用真钱赌
};
```

### 3.2 Pro Tier limits

```typescript
const PRO_TIER_LIMITS = {
  monthlySubTasksIncluded: 200,
  spawnFanOutCap: 4,
  budgetUsdPerSpawnCap: 1.0,
  modelTier: 'sonnet-default',   // Sonnet 4.6 默认
  opusOnDemand: true,             // 用户主动选,加价 $0.15/spawn
  byoBridgeEnabled: true,         // BYO key 接通
  marketplaceHire: 'enabled',
  arenaWagerCurrency: ['AXP', 'USD'],
  arenaWagerUsdCap: 20,
};
```

### 3.3 Business Tier limits

```typescript
const BUSINESS_TIER_LIMITS = {
  monthlySubTasksIncluded: 1000,
  teamMembers: 5,                  // 5 人共享 marketplace 收益
  spawnFanOutCap: 6,
  budgetUsdPerSpawnCap: 5.0,
  modelTier: 'sonnet-with-opus',   // Opus 4.7 默认可用
  byoBridgeEnabled: true,
  marketplaceHire: 'enabled',
  apiAccess: true,                 // programmatic spawn API
  workspaceAuditLogDays: 30,
};
```

---

## 4. Mobile AgentAccount 完整展示(Issue 6 — 全部展示)

### 4.1 Pet 详情页新增 "经济身份" Tab

```
┌─ Pet 详情 ─────────────────────────────────┐
│ 🦊 Foxy                                    │
│ ┌─ Tab ─────────────────────────────────┐  │
│ │ 性格 │ 装扮 │ 经济身份 ⭐ │ Arena    │  │
│ └───────────────────────────────────────┘  │
│                                            │
│ Agent ID: AGT-1748256000-a3b2              │
│ 信用评分: 568 / 1000  (★★★☆☆)             │
│ 风险等级: low                               │
│                                            │
│ ── 收支 ─────────────────────────────────  │
│ 已用今日: $0.42 / $1.00                    │
│ 已用本月: $8.15 / $30.00                   │
│ 雇佣收入: $2.10 (帮 7 人完成任务)            │
│                                            │
│ ── 偏好 ─────────────────────────────────  │
│ 偏好模型: Claude Sonnet 4.6                │
│ 偏好厂商: AWS Bedrock                      │
│ [编辑偏好 →]                                │
│                                            │
│ ── Marketplace ──────────────────────────  │
│ 状态: 已上架 / 已下架  [Toggle]              │
│ 历史雇佣: 7 次,平均评分 4.5 ★              │
└────────────────────────────────────────────┘
```

### 4.2 Mobile 视图字段映射

```typescript
GET /api/v1/pet/:livingPetId/account
返回 (mobile + desktop 共用):
{
  agentUniqueId: string,
  creditScore: number,
  riskLevel: 'low'|'medium'|'high'|'critical',
  spendingLimits: { singleTxLimit, dailyLimit, monthlyLimit },
  usedTodayAmount: number,
  usedMonthAmount: number,
  preferredModel: string,
  preferredProvider: string,
  marketplaceListed: boolean,
  lifetimeHireCount: number,
  lifetimeEarnedUsd: number,
  arenaCurrentElo: number,
  arenaWins: number,
  arenaLosses: number,
}
```

→ 这是 v2.1 backend 必交付的 endpoint。

---

## 5. Arena 不匿名(Issue 5 — PM 改了我的推荐)

### 5.1 默认行为

- ladder 默认显示 **真实 pet 名 + owner username**
- 公共 leaderboard 在 mobile / desktop / web 三端都显示
- 排行榜 top 100 公开

### 5.2 Pro 用户可选匿名

- Pro Settings 加一个 "在 Arena 匿名参赛" toggle
- 开启后该用户的 pet 显示为 `Pet#3829`,owner 显示为 `Anonymous Trainer`
- Free 用户不能匿名(加一个 Pro upsell point)

### 5.3 隐私边界

- Arena 显示真名 ≠ 暴露 LLM 偏好或 chat 历史
- Pet 的 ELO / wins / losses 是公开的;`spending_limits`、`creditScore` 仍只 owner 自己看

---

## 6. Marketplace Uber 上限定价(Issue 4)

### 6.1 雇主体验流程

```
1. Leader 找不到 role 匹配的 team-member
2. 弹 CTA: "团队没有 [research-analyst] 角色"
   "有 12 只 marketplace pet 可以雇,平均成本 $0.6 (上限 $1.0)"
   "[雇佣 - 不超 $1.0]  [用 anonymous 替代]"
3. 用户点 [雇佣]
4. Backend 撮合:findCandidate 返回 1 只 pet
5. 实际跑完 cost = $0.42
6. 雇主 B 被收 $0.42(不是 $1.0)
7. 卖家 A 得 $0.42 × 70% = $0.294
8. 平台留 $0.42 × 30% = $0.126
```

### 6.2 实现

`agent-task-spawn.service.ts` 在 dispatch 前调 `MultiAgentMarketplaceService.estimateCost(role)`:

```typescript
estimateCost(role): {
  averageUsd: number,    // 历史平均
  ceilingUsd: number,    // 用户授权的最大
  candidateCount: number,
}
```

→ 用户看到的是 ceiling, billing 时按实际算。

---

## 7. W7 / W8 Flag 切换计划(Issue 8)

### 7.1 v2.1 Ship(预计 2026-06-15 - 2026-06-30)

- W7 backend code merged,**flag OFF**
- W8 backend code merged + Arena tab UI activated,**W8 flag ON**(因为 W8 先单独 launch 不依赖 marketplace)
- LLMRouter wired to worker(P0 task #1)
- BYO bridge enabled(P0 task #2)
- Subscription tier ladder enforced(P0 task #4)

### 7.2 v2.2 Marketplace Launch(预计 2026-07-15)

- 双账号 E2E 验证通过
- W7.2 desktop Leader hire CTA 完成
- 隐私 sanitize 硬 enforce
- 市场推广配套(博客 + 视频 demo)
- W7 flag ON

### 7.3 v2.3 Arena Tournament(预计 2026-08-30)

- Tournament 入场费 + 赞助商
- Pet skin 跨平台微交易

---

## 8. 接下来的工作清单(v2.1 P0)

按依赖排序:

| # | Task | 工程师日 | 依赖 | 状态 |
|---|---|---|---|---|
| 1 | LLMRouter wired into agent-task.worker(替换 `bedrock.invokeModel(prompt)` 直调) | 2-3 d | 已存在 LlmRouterService + TierResolverService | 🟡 ready |
| 2 | BYO bridge — worker 读 `users.byo_credentials` 并传给 ProviderRegistry | 1-2 d | #1 | 🟡 ready |
| 3 | `agent-task-spawn` marketplace prompt sanitize | 1 d | — | 🟡 ready |
| 4 | Subscription tier ladder enforcement(default model + cap by tier) | 1-2 d | #1 | 🟡 ready |
| 5 | `user_subscription_usage` 表 + monthly aggregate cron | 2 d | — | 🟡 ready |
| 6 | MemberSettingsModal "v2.1 起 tier 真生效" banner | 0.5 d | — | 🟡 ready |
| 7 | W7.2 Leader hire CTA(desktop) | 1 d | — | 🟡 ready |
| 8 | W7 双账号 E2E test | 1 d | #1-#7 | 🔴 blocks v2.2 launch |
| 9 | Pet detail "经济身份" Tab(mobile) | 2 d | #1 | 🟡 ready |
| 10 | Pet detail productivity score / ELO 展示 | 1 d | — | 🟡 ready |
| 11 | Arena ladder mobile + web view(不匿名) | 1.5 d | — | 🟡 ready |
| 12 | Pro 匿名 toggle + 后端 enforce | 1 d | #11 | 🟡 ready |

**小计 ~15-17 工程师日**, 1 工程师 ≈ **3-4 周**, 配 PM/QA 可在 **30-45 天 ship v2.1**。

---

## 9. Branch Strategy

- 当前 v2 branch: `feat/multi-agent-w7-w8-v2`(scaffold ship 完)
- 新建 v2.1 work branch: **`feat/multi-agent-v2-1-llm-router-byo`**(从 v2 fork)
- v2.1 完成 → merge 回 `feat/multi-agent-w7-w8-v2`,然后把整支 merge 到 `main`
- v1 ship branch `perf/desktop-pre-launch-p1` **完全不动**(已 launch 的产品)

---

## 10. Sign-off

- ☑️ PM 决策(老板)— 2026-05-26 chat 确认
- 🟡 Engineering 实施(开始)— 2026-05-26
- 🟡 v2.1 ship — 预计 2026-06-30
- 🟡 v2.2 marketplace launch — 预计 2026-07-15

附:本决策 doc 推翻或修改时请创建 `MULTI_AGENT_V2_1_PRODUCT_DECISIONS_AMENDMENT_<date>.zh-CN.md`,不要 in-place 改本文。
