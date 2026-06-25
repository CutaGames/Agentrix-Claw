# Multi-Agent V2 完整账户体系 / LLM 路由 / 商业模式讨论稿

**日期**: 2026-05-26
**作者**: Multi-Agent V1 Ship Captain
**目的**: PM 问 "W7+W8 完成了?全部完成后账户体系是怎样?LLM/provider/模型怎么对接?成本/隐私/偏好/商业模式整体怎么考虑?"
**前置 audit**: [`MULTI_AGENT_LLM_PROVIDER_AUDIT_2026-05-26.zh-CN.md`](./MULTI_AGENT_LLM_PROVIDER_AUDIT_2026-05-26.zh-CN.md)
**性质**: **讨论稿,非 ship 决策**。需要 PM 在 §10 各 OPEN ISSUE 上拍板,我才能写正式 v2.1 spec。

---

## 1. W7 + W8 真实完成度(代码层 audit)

### 1.1 W7 marketplace-hire — 代码 ship,产品未 enable

| 项 | spec task | commit | 状态 |
|---|---|---|---|
| W7.1 backend dispatch unblock | 7.1 | `74e02ef7d` | ✅ 代码 ship |
| W7.1 `MultiAgentMarketplaceService` | 7.1 | 同上 | ✅ findCandidate / setListed / recordHireEarning / listMyMarketplacePets |
| W7.1 endpoints | 7.1 | 同上 | ✅ `/marketplace/my-pets`、`/marketplace/list/:id` |
| W7.2 desktop Leader hire CTA | 7.2 | — | ⚠️ **未 ship**(spec task 7.2 没人写代码) |
| W7.3 隐私边界 | 7.3 | `74e02ef7d` | ⚠️ **部分** scope.tools whitelist 已经在 spawn 检查,**workspace files / chat history 不传**这条只在文档里没硬 enforce(`agent-task-spawn` 没 sanitize prompt) |
| W7.4 "earned from work" badge | 7.4 | `74e02ef7d` | ⚠️ backend ship, desktop 只在 AgentTeamPanel 留了占位(没在 Pet detail screen 接) |
| W7.5 双账号 E2E 验证 | 7.5 | — | ❌ 没跑 |
| feature flag | — | `74e02ef7d` | ✅ `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=1`,默认 OFF |
| 70/30 platform fee | 7.3 | `74e02ef7d` | ✅ recordHireEarning 70% seller / 30% platform |

### 1.2 W8 Pet Arena — 代码 ship,产品未 enable

| 项 | spec task | commit | 状态 |
|---|---|---|---|
| W8.1 schema | 8.1 | `74e02ef7d` | ⚠️ **改路线**:不扩 `world_engine_battles`(因为该表不存在),自己开了 `pet_arena_match` + `pet_arena_ladder_snapshot` |
| W8.2 PetArenaService | 8.2 | `74e02ef7d` | ✅ createMatch / resolveMatch / ELO K=32 / getMyLadder / getPetProductivityScore |
| W8.2 endpoints | 8.2 | `74e02ef7d` | ✅ 4 个 |
| W8.3 desktop Arena + Ladder tabs | 8.3 | `74e02ef7d` | ✅ tabs 激活,Pro/Simple split |
| W8.4 productivity score in Pet detail | 8.4 | `74e02ef7d` | ⚠️ backend ship,Pet detail UI 没接(deferred 到 v2.1) |
| feature flag | — | `74e02ef7d` | ✅ `MULTI_AGENT_PET_ARENA_ENABLED=1`,默认 OFF |
| schema apply 到 prod | — | confirmed | ✅ `1797000003000` 已 applied 到 paymind |

### 1.3 一句话总结

**W7+W8 后端代码 ship 在 v2 branch + schema apply 到 prod,但 feature flag 默认 OFF,前端 critical UI 缺(Leader hire CTA + Pet detail badge),双账号 E2E 没跑。当前等价 "后端完成度 70%, 前端 30%, 产品就绪度 0%"。**

---


## 2. W7+W8 全 enable 后的账户体系总览

### 2.1 实体层级(从 UX 到 runtime)

```
┌─────────────────────────────────────────────────────────────────┐
│ User (users 表)                                                  │
│ - id (uuid)                                                      │
│ - email / phone                                                  │
│ - subscription_tier (free / pro / business / enterprise)         │
│ - byo_credentials (JSON 加密) ← mobile + desktop chat 用,        │
│                                  v2 W7 worker 才接                │
└────┬─────────────────────────────────────────────────────────────┘
     │ 1 : N
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ LivingPet (living_pets 表) — UX 实体                             │
│ - id, name, sprite, intimacy_xp, wardrobe                       │
│ - owner_user_id                                                  │
│ - bound_agent_account_id ──┐ (W3 桥, varchar(64))                │
│ - marketplace_listed (新, W7) — 通过 AgentAccount.metadata        │
└────────────────────────────┼─────────────────────────────────────┘
                             │ 1 : 1
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ AgentAccount (agent_accounts 表) — economic identity            │
│ - id (uuid), agent_unique_id (AGT-...)                          │
│ - owner_id (User.id)                                             │
│ - preferred_model / preferred_provider ⚠ v1 worker 不读           │
│ - capabilities[], spending_limits, used_today/used_month         │
│ - credit_score (0-1000)                                          │
│ - metadata.marketplaceListed (W7)                                │
│ - metadata.lifetimeHireCount (W7)                                │
│ - metadata.lifetimeEarnedUsd (W7)                                │
│ - metadata.teamTemplateSlug / codename / modelTier               │
└────────────────────────────┬─────────────────────────────────────┘
                             │ 用作 actor_agent_id
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ AgentTask (agent_tasks 表) — work unit                          │
│ - id, owner_user_id, parent_task_id (W1)                         │
│ - target_kind: leader-direct / team-member / local-anonymous /  │
│                marketplace-hire (W7 解锁)                         │
│ - hired_from_user_id (W7)                                        │
│ - actor_agent_id (谁在跑)                                         │
│ - tier (local/smart/cloud) ⚠ v1 worker 不读                       │
│ - budget_usd, status                                             │
└────────────────────────────┬─────────────────────────────────────┘
                             │ writes 1+
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ AgentCostRecord (agent_cost_records 表) — billing               │
│ - parent_task_id (W5), event_type (llm_call / sub_task_complete)│
│ - actor_agent_id, hired_from_user_id (W7)                        │
│ - provider_name, model, tokens, estimatedCostUsd, latencyMs      │
└──────────────────────────────────────────────────────────────────┘

┌─ Side: PetArena (W8) ──────────────────────────────────────────┐
│ pet_arena_match — ELO 对战                                      │
│ pet_arena_ladder_snapshot — daily ladder cache                  │
│ pet_productivity_snapshot (W5) — productivity score 来源          │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 一只 Pet 全 enable 后的"完整账户视图"

举例: 用户 Alice 的"小狐狸 Foxy",W3+W7+W8 全 enable 后:

| 维度 | 数据来源 | 现在(v1 ship)看得到? | W7+W8 enable 后看得到? |
|---|---|---|---|
| sprite / 性格 / 装扮 | `living_pets` | ✅ | ✅ |
| 亲密度 / XP | `living_pets.intimacy_xp` | ✅ | ✅ |
| 经济身份 (`AGT-xxx`) | `agent_accounts.agentUniqueId` | ⚠ 后台有,UX 不展示 | ✅ Pro 看得到 |
| Spending limits | `agent_accounts.spending_limits` | ⚠ 字段在,UI 没接 | ✅ MemberSettingsModal |
| Credit score (0-1000) | `agent_accounts.credit_score` | ⚠ 默认 500,没真算 | ⚠ 仍待 W7+ 真算逻辑 |
| 模型偏好 | `agent_accounts.preferred_model` | ⚠ 写库,worker 不读 | ✅ W7 BYO bridge enable 后真生效 |
| Marketplace listing | `metadata.marketplaceListed` | ❌ 字段在,默认 false | ✅ W7 用户 toggle |
| 雇佣收入 | `metadata.lifetimeEarnedUsd` | ❌ 不写 | ✅ W7 worker hook 写 |
| Arena ELO | `pet_arena_ladder_snapshot.elo` | ❌ 表空 | ✅ W8 createMatch 后写 |
| Productivity score | `pet_productivity_snapshot` | ⚠ daily cron 写,UI 不展示 | ✅ W8 Pet detail 展示 |

---


## 3. LLM Provider / 模型对接现状 vs W7 全 enable 后

### 3.1 现状(v1 ship + W7+W8 schema apply,但 worker 没接)

```
sub-task 进入 worker
        │
        ▼
AgentTaskWorker.execute()
        │
        ├─ 不读 task.actor_agent_id → AgentAccount.preferredModel ❌
        ├─ 不读 task.userId → users.byo_credentials ❌
        ├─ 不读 task.tier (local/smart/cloud) ❌
        ▼
BedrockIntegrationService.invokeModel(prompt)
        │
        ▼
默认 us.anthropic.claude-haiku-4-5-20251001-v1:0
平台 Bearer token (us-east-1)
```

**结果**: 不管谁的 pet、谁雇的、什么 tier、有没有 BYO key、template role 写了什么 preferredModel,**全部走平台 Bedrock + Haiku 4.5**。

### 3.2 W7 BYO bridge 全 enable 后(目标态)

```
sub-task 进入 worker
        │
        ▼
LLMRouter.resolve(task)
        │
        ├─ 读 task.target_kind
        │   ├─ 'marketplace-hire' → 强制平台 token (隐私 + 计费分账)
        │   └─ 其他 → 继续 BYO 解析
        ├─ 读 task.userId → users.byo_credentials
        │   ├─ 有 → BYO (用户的 Anthropic / OpenAI / Gemini key)
        │   └─ 无 → 平台 Bedrock fallback
        ├─ 读 task.actor_agent_id → AgentAccount.preferredModel
        │   ├─ 有 → 用 (subject to tier cap)
        │   └─ 无 → 用 task.tier 默认
        ├─ 读 task.tier
        │   ├─ local → ollama / lmstudio (用户机器)
        │   ├─ smart → Haiku 4.5 / Gemini Flash
        │   └─ cloud → Sonnet 4 / GPT-4o / Gemini Pro
        ▼
统一调度到对应 provider
        │
        ▼
cost-tracker 写 agent_cost_records:
- provider_name = 实际用的
- model = 实际用的
- BYO 时 estimatedCostUsd 仍写(给用户看月度统计),但平台不收钱
```

### 3.3 各模型 / provider 对接矩阵(W7 全 enable 后)

| Provider | 模型 | 默认走谁 | BYO 支持 | 文件 | 当前 worker 接? |
|---|---|---|---|---|---|
| AWS Bedrock | Haiku 4.5, Sonnet 4, Opus 4.7 | 平台 token + BYOK | ✅ `BedrockUserCredentials` | `bedrock-integration.service.ts` | ✅ 但只用默认 Haiku |
| Anthropic 直连 | Claude 3/4 系列 | 用户 BYO key | ✅ | `claude-integration.service.ts` | ❌ worker 不调 |
| OpenAI | GPT-4o, GPT-4 Turbo, o1/o3-mini | 用户 BYO key | ✅ | `openai-integration.service.ts` | ❌ worker 不调 |
| Google Gemini | 2.0 Flash / 1.5 Pro/Flash | 用户 BYO key + 平台 GEMINI_API_KEY | ✅ | `gemini-integration.service.ts` | ❌ worker 不调 |
| Groq | Llama 3.3 70B / 3.1 8B | 用户 BYO key | ✅ | `groq-integration.service.ts` | ❌ worker 不调 |
| DeepSeek | deepseek-chat | 用户 BYO key | ✅ | `deepseek-integration.service.ts` | ❌ worker 不调 |
| Ollama / LMStudio (local) | 用户本地 | 平台 — | N/A | `desktop/src-tauri/src/computer_use/local_llm.rs` | ❌ worker 不调,只 desktop chat 用 |

→ **W7 full enable 需要做的真实工作**: 在 `agent-task.worker.ts` 抽出一个 `LLMRouter`,把 7 条 provider 路径都 wire up,根据 task / agent / user 解析出最终 (provider, model, credentials)。**这是 v2.1 真正的工作量**,目前 spec 没单独 task,需补。

### 3.4 Pet Marketplace-hire 时的 LLM 路由(强约束)

W7.3 隐私边界硬性要求:**marketplace-hire 必须走平台 token**,不能用任何用户 BYO key。理由:

1. 雇主 B 不能让卖家 A 的 API key 被使用(B 看不到 A 的 key)
2. A 的 pet 给 B 干活时,如果用 A 的 BYO key,A 的余额会被消耗 → 商业上不合理
3. 平台收 30% fee 必须能拿到真实成本,只有平台 token 才能做透明分账

**结论**: marketplace-hire 是唯一**强制平台 token + 平台默认模型(当前 Haiku 4.5)**的路径。

---


## 4. 成本结构(平台层)

### 4.1 单 sub-task 成本基线

引用 `cost-tracker.service.ts:60-95` 的 MODEL_PRICING 表(USD/M tokens):

| 模型 | input | output | cache read | cache write | 单 sub-task ~ |
|---|---|---|---|---|---|
| `claude-haiku-4-5` (默认) | $0.80 | $4.00 | $0.08 | $1.00 | ~**$0.012**(~2k in + ~1k out) |
| `claude-sonnet-4` | $3.00 | $15.00 | $0.30 | $3.75 | ~$0.045 |
| `claude-opus-4-7` | $15.00 | $75.00 | $1.50 | $18.75 | ~$0.225 |
| `gpt-4o-mini` | $0.15 | $0.60 | — | — | ~$0.0009 |
| `gemini-2.0-flash-lite` | $0.02 | $0.08 | — | — | ~$0.00012 |
| `gemini-2.0-flash` | $0.10 | $0.40 | — | — | ~$0.0006 |

→ Haiku 4.5 比 Gemini Flash Lite **贵 100×**,比 GPT-4o-mini **贵 13×**。**这是 v2.1 商业模式的关键决策点**: 默认还用 Haiku 4.5 吗?见 §10 OPEN ISSUE 1。

### 4.2 平台月成本估算(假设)

假设条件:
- 1k 活跃用户(DAU)
- 每用户每天 5 个 spawn,每 spawn ~2 sub-tasks → **10 sub-tasks/user/day**
- 全部用 Haiku 4.5 默认

→ 1k × 10 × 30 × $0.012 = **$3,600/月** Bedrock 成本

放大到 10k DAU: **$36,000/月**

### 4.3 平台 quota 上限(再次确认 §audit 的)

- AWS Bedrock us-east-1 default `claude-haiku-4-5`: 40 RPM, 400k TPM
- Worker MAX_PARALLEL=2(单 PM2 instance)→ ~0.5 sub-tasks/sec → ~30/min → 远低于 40 RPM
- → **真实瓶颈是 worker 串行,不是 Bedrock quota**

### 4.4 W7 marketplace 后的 cost split

70/30 split 含义:

```
雇主 B spawn 一个 marketplace-hire sub-task,budget $1
  → 实际跑 LLM 成本 $0.012(Haiku 4.5)
  → 平台计费向 B 收 $1(spec design §13.3)
  → 卖家 A 得 $0.70
  → 平台留 $0.30(覆盖 LLM 成本 + 平台费)
  → 平台净利 $0.30 - $0.012 = $0.288 / sub-task
```

→ 平台从 marketplace-hire 单笔 take rate **~28.8%(扣 LLM 后)**, 这个 take rate 看起来 ok,**但前提是雇主 B 愿意付 $1**。**§10 OPEN ISSUE 4**: 雇主端定价透明度。

---


## 5. 用户隐私 + 用户偏好

### 5.1 隐私边界(W7+W8 全 enable 后)

| 场景 | 数据流 | 风险 | 当前 mitigations |
|---|---|---|---|
| 普通 sub-task | user A 的 prompt → 平台 worker → Bedrock | 平台读得到 prompt | Bedrock SLA + 公司 PII policy |
| BYO key sub-task | user A 的 prompt → 平台 worker → Anthropic 直连(用 A 的 key) | 平台仍能读 prompt | 同上,但成本 attributable to A |
| Marketplace-hire | user B 的 prompt → 平台 worker → 卖家 A 的 pet "执行"(实际仍用平台 LLM) → 结果回 B | 1) A 的 pet metadata 暴露给 B?2) B 的 prompt 能否被 A 看到? | spec W7.3 要求 prompt 不传给 A 的设备,但当前代码**没硬 enforce** |
| Pet Arena (W8) | A 的 pet vs B 的 pet 对战 | 双方 ELO 公开 → ladder | 默认 anonymize 名字?需决策(§10 OPEN ISSUE 5) |

### 5.2 W7.3 隐私边界的真实代码状态

引用 `74e02ef7d` commit message:
> Hired pet receives only prompt + scope (whitelist) + budget
> hired_from_user_id stamped on agent_tasks for audit

但实际 `agent-task-spawn.service.ts` 在 marketplace-hire 路径上**没有 sanitize prompt**(没去除 workspace path / chat history reference)。**这是 v2.1 上 W7 真正可发布前的硬阻塞**。

### 5.3 用户偏好层级(W7 全 enable 后)

```
偏好优先级 (从高到低):
1. AgentAccount.preferred_model (Pro 用户在 MemberSettingsModal 设)
2. AgentAccount.metadata.modelTier (template 创建时的)
3. task.tier (Leader 在 spawn 时指定)
4. user.subscription_tier 默认值:
   - free: Haiku 4.5 only
   - pro: Sonnet 4 默认 + Opus on-demand (cap)
   - business: 同 pro + 高 quota
   - enterprise: 全部 + 平台 SLA
5. 系统默认: Haiku 4.5
```

**当前缺失**: 第 4 层(基于 user subscription_tier 的默认 ladder)**完全没实现**。所有 free/pro/business 用户的 sub-task 都跑同样的 Haiku 4.5 → 这是商业模式的硬伤。

### 5.4 BYO key 在 multi-agent 链路里的 4 种状态

| 用户场景 | 当前 v1 | W7 BYO bridge enable 后 | 商业意义 |
|---|---|---|---|
| 用户没设 BYO,免费 tier | 平台 Haiku | 平台 Haiku(同) | 平台担当成本 |
| 用户没设 BYO,Pro tier | 平台 Haiku | 平台 Sonnet 4(via tier ladder) | Pro 订阅价值 |
| 用户设了 BYO Anthropic key,免费 | 平台 Haiku(没用 BYO) | BYO Sonnet 4 / Opus(用户付) | 平台抽 0,但成本 0 |
| 用户设了 BYO,marketplace-hire | 平台 Haiku(因隐私) | 平台 Haiku(强制) | 30% fee 给平台 |

→ 第 3 行是关键:**用户设了 BYO 后,平台收入降到 0(只剩订阅费)**。这是 OpenAI 加价订阅 vs API 直连 的同一困境。

---


## 6. 商业模式 — 收入来源与盈亏分析

### 6.1 当前(v1 ship)收入来源

只有一项: **subscription**(free / pro / business / enterprise),对应不同 quota 和功能开关。**multi-agent 不收钱**, 用户用 1 个 spawn 还是 100 个,都不影响月费。

### 6.2 W7+W8 全 enable 后的收入来源(目标态)

| 来源 | 收谁 | 当前可行? | 月度估算(10k DAU) |
|---|---|---|---|
| **Subscription** | Pro/Business 月费($10-50/mo) | ✅ ship | ~$50k(假设 10% 转化率,$50/mo) |
| **Multi-agent overage** | 超 quota 的 spawn 单次计费 | ❌ 没 ship | 取决 quota 设置 |
| **Marketplace 30% fee** | 雇主 B 的 hire 总额 | ⚠️ schema ship,无 UI | 取决 hire 频率 |
| **BYO 用户的"平台 access fee"** | 用户用 BYO 也得交 $X/mo for 平台编排能力 | ❌ 政策未定 | — |
| **Pet Arena Tournament 入场费** | 选手 / 赞助商 | ❌ schema ship,无 UI | — |
| **Skin / Wardrobe 微交易** | 现有 mobile 已 ship | ✅ | 现有 |

### 6.3 5 种可行商业模式的对比

#### 模式 A: 纯 subscription + multi-agent 包含

> Pro $19/mo 含 N 个 sub-tasks/月,超额 cap 后 throttle

- **优点**: 简单透明,Cursor / Copilot 路线
- **缺点**: 重度用户撑不起 BYO 价值;平台需自吞 Bedrock cost
- **盈亏**: Pro 用户 $19/mo,假设跑 100 sub-tasks/月 × $0.012 = $1.2 LLM 成本,**净利 $17.8**。但 power user 可能跑 1000+ → 净亏

#### 模式 B: subscription + per-spawn metering(Tencent Jarvis 模式)

> Pro $9/mo 给 base quota,超额 $0.01/sub-task,无上限

- **优点**: 重度用户付更多
- **缺点**: 用户对"AI 跳表"敏感,体验差;计费 UX 复杂
- **盈亏**: 跟 OpenAI 一样,take rate ~5-10%

#### 模式 C: BYO-first + 平台收"编排费"(Cursor 升级模式)

> 用户必须 BYO key,平台收 $19/mo "编排 + Pet + Multi-agent" 服务费

- **优点**: 平台不担 LLM 成本,只赚订阅
- **缺点**: 流失大量"我懒得搞 BYO"的用户;Free tier 不可持续
- **盈亏**: 净利率高(95%+),但 ARPU 低

#### 模式 D: Marketplace-driven(Agentrix Economy 真实路线)

> Free tier 限制:1 个 leader pet,只能用平台 anonymous sub-agent。要用别人的 pet → 进 marketplace,30% take。要把自己 pet 出租 → 在 marketplace 列表

- **优点**: 网络效应;平台从两端都赚;符合 "Agent Economy" PRD 大方向
- **缺点**: 需要双边市场冷启动;用户需要先有 pet 才有可卖的;v2.1 才接 UI
- **盈亏**: 取决 hire 频率,理论上 take rate 30% 是最高的之一

#### 模式 E: 混合(推荐)

> Pro $19/mo + 含 100 sub-tasks/月 + BYO bridge 解锁(超额自动用 BYO)+ marketplace 30% take

- **优点**: 多收入来源对冲;BYO 用户也付订阅费;marketplace 当 upside
- **缺点**: 计费 UX 仍复杂,需做"统一 dashboard"
- **盈亏**: 相对稳健,但 v2.1 才能 ship

### 6.4 推荐选择(我的判断,需 PM 拍板)

**短期(v2.1, 30 天内): 走模式 E 简化版**
- Pro 月费保持
- 上 BYO bridge(W7 deploy) — 让 power user 用 BYO,平台减负
- marketplace-hire 默认 OFF,先做 "earned from work" badge 给情绪价值

**中期(v2.2-v2.3, 60-90 天): marketplace 真启用**
- AgentTeamPanel 加 "雇佣他人的 pet" CTA
- 30% take 收 → 第一笔真实 marketplace revenue

**长期(v3, 6 个月+): Pet Arena 商业化**
- Tournament 入场费 + 赞助商
- Pet skin 跨平台微交易

→ **§10 OPEN ISSUE 1**: PM 选哪个模式?

---


## 7. 用户视角的"完整账户体验"(W7+W8 全 enable 后)

### 7.1 Free 用户

- 1 个 Leader Pet(平台默认配)
- 用 anonymous sub-agent 跑 spawn,Haiku 4.5 only
- 每天 cap **20 sub-tasks**(防滥用)
- 看不到 "Pro Mode" 设置面板
- Marketplace: **只能浏览,不能雇佣**(避免免费用户撸 AI 资源)
- Arena: 可以参加,赌注是 AXP(虚拟币),不是 USD

### 7.2 Pro 用户($19/mo)

- 自己 pet 数无上限(实际 cap 10,UX 限制)
- BYO key 可以填,自动接管所有 sub-task
- MemberSettingsModal 可改 model tier(Sonnet 4 / Opus 4.7 cap based on plan)
- 月含 200 sub-tasks 平台额度,超额走 BYO 或 throttle
- Marketplace: 可雇佣(平台 30% take),可出租(收 70%)
- Arena: 真钱赌注 ≤ $20/match
- Weekly summary 每周日推送

### 7.3 Business 用户($99/mo)

- 同 Pro + 团队(5 个用户共享 marketplace 收益)
- 月含 1000 sub-tasks 平台额度
- Workspace audit log 30 天
- API access(programmatic spawn)

### 7.4 Enterprise 用户(custom)

- 自部署 Bedrock(用户自己的 AWS account)
- SSO + SLA
- Marketplace 内部模式(只在企业内 hire)

---

## 8. 跨平台账户一致性(mobile / desktop / wearable)

### 8.1 现状

| 平台 | LivingPet 看得到? | AgentAccount 看得到? | sub-task 跑得动? | BYO key 设得了? |
|---|---|---|---|---|
| Mobile | ✅ | ❌ | ❌(只看,不 spawn) | ✅ |
| Desktop | ✅ | ⚠️ AgentTeamPanel 才看 | ✅(via spawn) | ⚠️ Settings 接了一半 |
| Wearable | ✅ sprite | ❌ | ❌ | ❌ |
| Web (next.js) | ⚠️ chat 用 | ❌ | ❌ | ⚠️ 部分 |

### 8.2 W7+W8 后的目标态

- **Mobile**: AgentAccount 一栏(`Pet 详情 → 经济身份`)展示 spending limits + earnings
- **Desktop**: AgentTeamPanel 是 control plane(已 ship)
- **Wearable**: 只展示 pet sprite + 简单 ack (sub-task 完成时震动)
- **Web**: 不重做,留给 Pro Mode 后期

→ §10 OPEN ISSUE 6: mobile 是否要展示完整 AgentAccount?

---


## 9. 把"全 enable"真正落地需要做什么(v2.1 工作量)

按依赖关系排序:

### P0 — 必须做(没这些 W7+W8 上不了)

1. **`LLMRouter` 抽象层** — `agent-task.worker.ts` 里把 `bedrock.invokeModel(prompt)` 替换成 `llmRouter.execute(task, prompt)`,内部分发到 7 条 provider 路径(~3-5 天)
2. **BYO bridge 测试** — desktop chat 已有 BYO 注入,worker 没;需端到端 + Anthropic / OpenAI / Gemini 三条路径打通(~2 天)
3. **Marketplace prompt sanitize** — `agent-task-spawn.service.ts` 在 marketplace-hire 路径上去掉 workspace path / chat history reference(~1 天)
4. **Subscription tier ladder** — `users.subscription_tier` → 默认模型 ladder(free=Haiku, pro=Sonnet, business=Opus on-demand),写在 `LLMRouter`(~1 天)
5. **Per-spawn metering 表 + cron** — 当前 cost-tracker 写 row,但没 monthly aggregate;需 `user_subscription_usage` 表 + 每日 reset cron(~2 天)
6. **MemberSettingsModal banner** — "v2.1 模型 tier 真生效,以前不生效"提示(~0.5 天)
7. **W7 双账号 E2E** — A 出租 / B 雇佣,跑通完整闭环(~1 天)
8. **W7.2 Leader hire CTA UI** — desktop 缺(spec 要求的,没 ship)(~1 天)

→ **小计 ~12-15 天 1 个工程师**

### P1 — 必须做(没这些用户体验差)

9. Pet detail "earned from work" badge UI(~1 天)
10. Pet detail productivity score UI(~1 天)
11. Mobile AgentAccount viewer(~2 天)
12. Free tier daily cap 实现(~1 天)
13. Marketplace "雇佣" UI(~3 天)

→ **小计 ~8 天**

### P2 — 后做(可 post-launch)

14. Arena tournament UI
15. Wearable ack
16. Enterprise SSO

### 9.1 v2.1 ship 时间预估

- **15-20 个工程师日** = 1 个工程师 3-4 周, 或 2 个工程师 1.5 周
- 配合 PM 决策(§10)+ QA + 真机验证, **30-45 天**可 ship

---

## 10. OPEN ISSUES — 需 PM 拍板的 8 个决策

### Issue 1: 商业模式选哪个(§6.3)

A: 纯 sub / B: per-spawn metering / C: BYO-first / D: Marketplace-driven / E: 混合

> **我的推荐**: E 简化版(短期),D 中期。**PM 决策**: ___

### Issue 2: Free tier daily cap 数字

是 20 / 50 / 100 sub-tasks/天?太低用户跑不动,太高平台扛不住。

> **我的推荐**: 20(对应 ~$0.24/天/用户成本,1k free DAU = $240/天)。**PM 决策**: ___

### Issue 3: Pro tier 包含的 sub-task 数

100 / 200 / 500 sub-tasks/月?

> **我的推荐**: 200。**PM 决策**: ___

### Issue 4: Marketplace 雇主端定价透明度

雇主 B 看到的 "$X" 是 LLM 真实成本 + markup,还是包年包月套餐?

> **我的推荐**: 显示估价 + 实际不超 (类似 Uber 上限定价)。**PM 决策**: ___

### Issue 5: Arena 默认 anonymize?

A 的 pet "Foxy" vs B 的 pet "Kuma" 对战 → ladder 是否显示真名?

> **我的推荐**: 默认匿名(`Pet#3829` ),Pro 用户可选公开真名。**PM 决策**: ___

### Issue 6: Mobile 是否展示完整 AgentAccount?

简单做:只展示 earnings;复杂做:credit score / spending limits 一切。

> **我的推荐**: 简单(只 earnings + ELO,其他 desktop 才看)。**PM 决策**: ___

### Issue 7: Subscription ladder 默认模型对应表

| Tier | 默认模型 | 推荐 |
|---|---|---|
| Free | Haiku 4.5 | Haiku 4.5 |
| Pro | ? | Sonnet 4 |
| Business | ? | Sonnet 4 默认 + Opus on-demand |
| Enterprise | ? | 全部 |

> **PM 决策**: ___

### Issue 8: 何时 enable W7 marketplace flag?

- 选项 1: v2.1 ship 即开
- 选项 2: v2.1 ship 但 OFF,v2.2 单独 launch event 开
- 选项 3: 永远 staged rollout (10% / 50% / 100%)

> **我的推荐**: 选项 2(给市场推广留时间)。**PM 决策**: ___

---

## 11. 下一步行动

PM 在 §10 上回答完后,我会:

1. 把决策写成 `MULTI_AGENT_V2_1_PRODUCT_DECISIONS_2026-05-XX.zh-CN.md`
2. 更新 `.kiro/specs/multi-agent-collaboration-2026-06/{requirements,design,tasks}.md`(增 §16-18 v2.1 章节)
3. 在 `feat/multi-agent-w7-w8-v2` branch 上接 P0 9 个 task
4. 30-45 天 ship v2.1

**等你回复 §10 八个 issue 的决策。**

---

## 附录 A: 引用代码位点速查

| 文件 | 行 | 关键 |
|---|---|---|
| `backend/src/modules/agent-task/agent-task.worker.ts` | 39 | `MAX_PARALLEL=2` |
| 同上 | 435 | `bedrock.invokeModel(prompt)` — 路由瓶颈 |
| `backend/src/modules/ai-integration/bedrock/bedrock-integration.service.ts` | 289 | `invokeModel` 默认 Haiku 4.5 |
| `backend/src/modules/multi-agent/multi-agent-marketplace.service.ts` | 全文 | W7 service(v2 branch) |
| `backend/src/modules/pet-arena/pet-arena.service.ts` | 全文 | W8 service(v2 branch) |
| `backend/src/entities/agent-account.entity.ts` | 329 | `preferred_model` 字段 — worker 不读 |
| `backend/src/modules/cost-tracker/cost-tracker.service.ts` | 60-95 | MODEL_PRICING 表 |
| `desktop/src/components/AgentTeamPanel.tsx` | 全文 | UI 入口 |
| `desktop/src/components/MemberSettingsModal.tsx` | 全文 | tier 设置(v1 不生效) |

## 附录 B: Branch / Tag 状态

- v1 ship: `perf/desktop-pre-launch-p1` @ `ac2123f6e`(刚 ship 的 v0.7.4 hotfix)
- v2: `feat/multi-agent-w7-w8-v2` @ `7889e8c16`
- v1 tag: `v1-multi-agent-ship-2026-05-26`
- v2 tag: `v2-multi-agent-w7-w8-2026-05-26`
- prod backend: `47.130.176.148`,PM2 `agentrix-backend` v7.0.0,DB `paymind`
- prod feature flags: 都 OFF(`MULTI_AGENT_MARKETPLACE_HIRE_ENABLED` + `MULTI_AGENT_PET_ARENA_ENABLED`)
