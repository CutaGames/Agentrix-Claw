# Multi-Agent LLM Provider 架构 Audit (v1 ship)

**日期**: 2026-05-26
**作者**: Multi-Agent V1 Ship Captain
**触发**: PM 在 v0.7.3 真机验证时问:"subagent 绑定的 LLM api 是主 agent 的 api 吗?是独立的类似 openclaw 的实例还是不是?所有 living pet 应该都是 openclaw 实例?用户默认是我们 AWS bedrock api,默认接的是 Haiku 4.5 模型。这个可以同时多少用户在线使用,用户新增的 living pet 或者 subagent 是怎么安排 LLM?"
**目的**: 把 v1 ship 时刻 multi-agent / sub-agent / LivingPet 三层之间真实的 LLM provider 路由 + 并发上限 + BYO API 行为白纸黑字写下来,避免后续 sprint 误以为某层"已经独立"。

---

## TL;DR(给赶时间的人 5 行)

1. **Sub-agent 不是 OpenclawInstance**。两者不是同一层。`AgentAccount` 是 v1 的 sub-agent 实体,**没有独立的 inference instance / 进程 / 容器**。
2. **v1 worker 永远走平台 AWS Bedrock + `claude-haiku-4-5-20251001`**,**不读** `AgentAccount.preferredModel/preferredProvider`,**也不读**用户私有 BYO key。所有 sub-task 共享同一份平台 token,在同一个 NestJS 进程里 in-process 调用 Bedrock。
3. **LivingPet 不是 LLM instance**。它在 v1 是个数据库实体(`living_pets` 表),通过 W3 ship 的 `bound_agent_account_id` 列绑到一个 `AgentAccount`,LLM 路由还是走 #2 的同一条路径。
4. **平台并发硬上限**: `AgentTaskWorker.MAX_PARALLEL` 默认 **2**(单 PM2 进程),Bedrock cross-region inference profile `us.anthropic.claude-haiku-4-5` 实测 **40 RPM / 400k TPM** 是 us-east-1 默认 quota,**今天的瓶颈是 worker 串行,不是 Bedrock**。
5. **用户 BYO API**(mobile 端已 ship)在 desktop multi-agent 链路 v1 **完全没接通**。W7+ 才会让 sub-task / pet member 继承用户 BYO key。

---

## 1. 三层实体的真实身份

### 1.1 OpenclawInstance(最底层 — runtime)

- 文件: `backend/src/modules/ai-integration/openclaw/`
- 是什么: 一个 **per-user 的 sandbox** Docker 容器或远程 VM,跑实际的工具(读写文件、执行 shell、用浏览器),状态长期持有,通过 `/openclaw/proxy/:id/stream` 暴露给 chat。
- 一个用户**最多 1 个**(默认 free 用户共享平台公共 instance,Pro/Business 才独占)。
- **跟 LLM 无直接关系** — OpenclawInstance 只负责执行工具,LLM 调用走 ai-integration 的另一条路径。

### 1.2 AgentAccount(中间层 — economic identity)

- 文件: `backend/src/entities/agent-account.entity.ts`
- 是什么: 一行数据库记录,**经济身份 / signing identity / capability 列表 / spending limits**。**不是**一个 inference instance,**没有进程**。
- 字段:
  - `agent_unique_id`(全局唯一 `AGT-<ts>-<rand>`)
  - `preferred_model`、`preferred_provider`(覆盖默认模型/厂商,**当前 v1 worker 不读**)
  - `spending_limits`、`used_today_amount`、`used_month_amount`(W7 marketplace 才校验)
  - `capabilities`(MCP tool 列表,目前 worker 不读)
- 创建路径: `agent-team.service.provisionTeam()` 给 template 里每个 role 各创建一个 `AgentAccount`。
- W3 之后 `living_pets.bound_agent_account_id` 把 LivingPet 桥到这里。

### 1.3 LivingPet(最上层 — UX 实体)

- 文件: `backend/src/entities/living-pet.entity.ts`
- 是什么: 用户在 desktop 桌宠浮窗 / mobile 看到的"那只小狐狸 / 小猫",有 sprite、性格、亲密度、装扮。
- **不是 LLM instance**,**不是 sandbox**。
- W3 W3.5: 用户点 "🦊 把我的宠物加入团队" 触发 `bindLivingPets`,backend 给该 LivingPet 创建/复用一个 `AgentAccount` 并写到 `living_pets.bound_agent_account_id`。
- 此后 sub-task 跑在该 pet 的"代理"下时,`agent_cost_records.actor_agent_id = bound_agent_account_id`(W5.2 ship)。

```
┌────────────────────────────────────────────────┐
│ LivingPet (UX)                                 │
│ - sprite, intimacy_xp, wardrobe                │
│ - bound_agent_account_id ──┐                   │
└────────────────────────────┼───────────────────┘
                             │ W3 桥
┌────────────────────────────▼───────────────────┐
│ AgentAccount (economic identity)               │
│ - preferredModel / preferredProvider           │
│ - spendingLimits, capabilities                 │
│ - 不持有 inference 进程 ─────────┐               │
└──────────────────────────────────┼─────────────┘
                                   │ v1 worker invoke
┌──────────────────────────────────▼─────────────┐
│ AgentTaskWorker (单 NestJS 进程内 setInterval) │
│ - MAX_PARALLEL=2 (env override)                │
│ - 直接调 BedrockIntegrationService.invokeModel │
│ - 不读 AgentAccount.preferredModel ⚠           │
└──────────────────────────────────┬─────────────┘
                                   │ in-process call
┌──────────────────────────────────▼─────────────┐
│ AWS Bedrock                                    │
│ us.anthropic.claude-haiku-4-5-20251001-v1:0    │
│ 平台 Bearer token (默认),用户 BYOK 暂不接通    │
└────────────────────────────────────────────────┘
```

---

## 2. v1 sub-task 真实 LLM 调用链

引用 `backend/src/modules/agent-task/agent-task.worker.ts:407-449`(v1 ship 状态):

```ts
private async execute(task: AgentTaskEntity): Promise<{ text: string; costUsd?: number }> {
  if (!this.bedrock) {
    const stub = `[stub] ${task.title}\n\n(BedrockIntegrationService not provisioned in this environment.)`;
    return { text: stub, costUsd: 0 };
  }
  // ... emit agent_invoke event ...
  const prompt = this.buildPrompt(task);
  const text = await this.bedrock.invokeModel(prompt);  // ⚠ 只传 prompt,没传 model / userCreds
  // ...
  return { text, costUsd: 0 };  // ⚠ costUsd 还是 0 占位 (W5.2 通过 ALS 写 cost row,但 worker 自己不算)
}
```

`BedrockIntegrationService.invokeModel` 默认参数(`backend/src/modules/ai-integration/bedrock/bedrock-integration.service.ts:289`):

```ts
async invokeModel(
  prompt: string,
  modelId: string = 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  userCredentials?: BedrockUserCredentials,
): Promise<string>
```

→ **每个 sub-task 都用 Haiku 4.5,平台 Bearer token,无 BYOK,无 sub-agent 偏好覆盖。**

### 2.1 这意味着什么

| 维度 | v1 实际行为 | 文档/UX 暗示 | 是否一致 |
|------|------------|--------------|---------|
| 模型选择 | 永远 Haiku 4.5 | `MemberSettingsModal` 让 Pro 用户选 `local/smart/cloud` tier | ❌ 不一致(UI 写库,worker 不读) |
| Provider | 永远 AWS Bedrock 平台 token | `AgentAccount.preferredProvider` 字段存在 | ❌ 不一致(字段被忽略) |
| 用户 BYO key | 不接通 | mobile 已 ship "用户连自己 API"流程 | ❌ 不一致(desktop chat 用,multi-agent worker 不用) |
| 计费 | W5.2 写 `agent_cost_records.parent_task_id`,cost USD 由 cost-tracker 算 | spec R10 要求按真实 token 写 | ✅ 一致(cost 行有写,只是 worker `execute()` 返 0,真正 cost 是 cost-tracker 通过 AsyncLocalStorage 截获) |

### 2.2 v1 这样设计的合理性

- 老板原话:"先 ship,velocity window"。
- 只用 Haiku 4.5 → cost predictable($0.80/M input, $4/M output)。Spec §R5 说默认 `budget_usd=$1` per spawn,够 Haiku 跑 1.25M output tokens。
- 不接 BYO key → 避免 v1 出现"用户 key 用完 / quota 错配 / SigV4 签名失败"等长尾问题阻塞 ship。

### 2.3 但要明白的代价

- **Pro 用户的 `MemberSettingsModal` 现在是个"半残设置"** — UI 让他改 tier 和 model,backend 存了,但 worker 跑时不看。**v1 ship 后 24-48h 内必须发一条说明文** 或在该 Modal 顶部加个"v1 暂用 Haiku 4.5,W7 接通 BYO/tier"提示,否则用户会觉得"我点了 Sonnet 但跑出来还是 Haiku 速度,产品有 bug"。
- 所有用户共享平台 Bedrock quota → 见 §3 并发分析。

---

## 3. 平台并发上限分析

### 3.1 进程层

`agent-task.worker.ts:39`:

```ts
private readonly MAX_PARALLEL = parseInt(process.env.AGENT_TASK_MAX_PARALLEL || '2', 10);
```

- 默认 **2 个并发 sub-task per PM2 进程**。
- prod 当前 PM2 cluster mode = **1 instance**(`pm2 list` 确认),所以**全平台同时跑 2 个 sub-task**。
- PostgreSQL `FOR UPDATE SKIP LOCKED` 让 worker scale-out 安全(可以加 instance),但目前没 scale。

### 3.2 Bedrock quota 层

us-east-1 default quota for `us.anthropic.claude-haiku-4-5-20251001-v1:0`(我们的 main inference profile):

- **Requests per minute (RPM)**: 40(账号默认,可申请提高)
- **Tokens per minute (TPM)**: 400,000(同上)
- 单次 Haiku 调用平均 ~3-5s, ~2k input + ~1k output tokens

→ 理论上限: 40 RPM × ~3k tokens = 120k TPM,**TPM 不会触顶**;**RPM 是 binding constraint**。
→ 平均一个 sub-task 4s, 40 RPM = 40/min = ~2.66 tasks/sec → **持续 ~2.66 sub-tasks/sec 处理力**。

### 3.3 现实瓶颈

**Worker MAX_PARALLEL=2 远比 Bedrock 40 RPM 紧**。

- 2 并发 × (1 task / 4s) = **0.5 sub-tasks/sec** 实际吞吐
- 一天 ~43,200 sub-tasks(理论);Bedrock 限 40 RPM × 60min × 24h = **57,600 tasks/天**
- 平台目前每天实际跑 sub-task 数 << 1000(W5 ship 后日数据,无负载)

### 3.4 同时在线用户上限(乐观估算)

假设:
- 每用户每分钟最多发 1 个 spawn 命令
- 每 spawn 平均产 2 个 sub-task(spec R5: spawn fan-out cap 4,但实际 leader 通常派 1-3)
- → 每用户每分钟 ~2 sub-tasks
- 平台吞吐 0.5 sub-tasks/sec = 30 sub-tasks/min
- → **同时 ~15 个活跃 multi-agent 用户** 就把 worker 跑满

**结论**: 当前配置撑不住超过 ~15-20 个同时跑 multi-agent 的用户。

### 3.5 短期扩容方案(不需改代码)

| 操作 | 效果 | 风险 |
|------|------|------|
| `pm2 scale agentrix-backend 4` | worker 数 4× → 8 并发 | 每个 worker 还是单进程,DB 连接池压力 4× |
| `AGENT_TASK_MAX_PARALLEL=8` | 单进程 4× | 内存压力 + Bedrock RPM 接近 40 上限 |
| 申请 Bedrock RPM 提到 200(工单) | RPM 40 → 200 | 需要 1-3 业务日 |

### 3.6 中期(W7+)需要做

- **Sub-agent 用 BYO key** → 把单用户的 LLM 配额从平台池子里拆出来,平台只管 free tier 用户。
- **按 priority queue 调度** — 现在 FIFO,Pro 用户排在 free 后面会很难看。
- **Bedrock 跨 region failover** — 已有 ap-southeast-1 profile 但 worker 默认走 us-east-1。

---

## 4. 用户自连 API / 订阅在 multi-agent 链路中的状态

### 4.1 Mobile 已 ship 的 BYO API 流程

- 流程: 用户在 mobile 设置页填 API key → 写到 `users.byo_credentials`(JSON 加密) → mobile chat 调 `/claude/chat` 时 backend 读 user 的 BYO key 注入到 `BedrockIntegrationService.invokeModel({userCredentials})`。
- 仅作用于 **mobile chat 主对话**(`/claude/chat`),不作用于 multi-agent worker。

### 4.2 Desktop 已 ship 的 BYO 流程

- desktop `/openclaw/proxy/:id/stream` 主聊天:有 BYO 注入(用户 API 设置面板)。
- desktop multi-agent worker:**没有** BYO 注入(见 §2 worker 代码)。

### 4.3 现实后果

- 用户 A 在 mobile 上设了自己的 Anthropic API key,subscription 是 Pro
- 用户 A 在 desktop 上跑一个 spawn,产生 3 个 sub-task
- 这 3 个 sub-task 全部走**平台 Bedrock token**,用平台账上的 Haiku quota,**用户的 Anthropic key 不被消耗**
- ✅ 优点:对用户透明,不会"用户 key 没钱了导致 sub-task fail"
- ❌ 缺点:平台 cost 不能转嫁给用户;用户 Pro 订阅的"更高 quota / 更好模型"等价物,在 sub-task 里看不到

### 4.4 W7 计划(spec §R8 + §R7 marketplace-hire)

- W7 会 ship `MULTI_AGENT_BYO_BRIDGE_ENABLED=1` flag,worker 启动时读 task owner 的 `users.byo_credentials`,有 BYO key 就用 BYO,没有就 fallback 平台 token。
- W7 marketplace-hire 路径 **强制** 用平台 token(避免雇佣方拿到员工 key)。
- 此 audit ship 时 W7 还在 v2 branch (`feat/multi-agent-w7-w8-v2`),**v1 launch branch 还没接**。

---

## 5. Pet 加入团队 → LLM 路由实际发生什么

### 5.1 触发流程

1. 用户在 `AgentTeamPanel` 点 "🦊 把我的宠物加入团队"
2. 弹 `@tauri-apps/plugin-dialog.ask()` 确认框(v0.7.4 hotfix 修了之前 Tauri 阻塞 `window.confirm` 静默失败的 bug)
3. desktop client `bindLivingPets({ livingPetIds: ['*'] })` → `POST /api/agent-teams/bind-pets`
4. backend `AgentTeamService.bindLivingPets` 给每只 pet 创建/复用 `AgentAccount`,写 `living_pets.bound_agent_account_id`
5. desktop reload → 显示新成员卡

### 5.2 之后 spawn → pet member 路径

1. Leader 调 `agent_run(role='pet:Foxy', prompt='...', budget_usd=1)`
2. `MultiAgentSpawnService.spawnSubTask` 把 task `assignee_kind='pet_member'`、`actor_agent_id = pet.bound_agent_account_id`
3. `AgentTaskWorker.execute` 调 Bedrock(**完全不读 actor_agent_id 偏好**,见 §2)
4. cost-tracker 通过 ALS 拿到 `parent_task_id`,写一行 `agent_cost_records` 带 `actor_agent_id`(W5.2 ship)
5. worker 完成 → emit `SubTaskCompleted` → desktop ring pulse 绿色

### 5.3 关键观察

- pet ↔ AgentAccount 桥**只影响计费 attribution**(谁的 pet 赚了 XP),**不影响 LLM 选型**
- 计费正确性是**真**的(cost row 上 actor_agent_id 准),但"Pet 用了什么模型/谁的 token"在 v1 只有一个答案: Haiku 4.5 + 平台 token

---

## 6. 给 PM 的回答(逐条对应原始 query)

| Q | A |
|---|---|
| subagent 绑定的 LLM api 是主 agent 的 api 吗? | 是同一个,**不是独立的**。所有 sub-task 共用平台 Bedrock + Haiku 4.5。 |
| 是独立的类似 openclaw 的实例还是不是? | **不是**。OpenclawInstance 是 sandbox runtime,sub-agent 是 `AgentAccount`(数据库行 + spending limits),两者不同层。Sub-agent 没有独立 inference 进程。 |
| 所有 living pet 应该都是 openclaw 实例? | 否。LivingPet 是 UX 实体(sprite + 亲密度),**不是** OpenclawInstance。一个用户可能有 1 个 OpenclawInstance + 多只 LivingPet,LivingPet 共用 instance + 共用平台 Bedrock。 |
| 用户默认是 AWS Bedrock api,默认 Haiku 4.5? | 正确。worker 默认 `us.anthropic.claude-haiku-4-5-20251001-v1:0`。 |
| 同时多少用户在线? | 同时跑 multi-agent 的活跃用户 ~15-20 上限(见 §3.4)。普通 chat 用户(非 multi-agent)上限更高,Bedrock RPM 40 + 单 chat ~3 sub-tasks 等价 → 同时 ~13 个 chat 用户跑满。 |
| 用户新增的 living pet 或 subagent 是怎么安排 LLM? | **新增 pet/subagent 不分配额外 LLM 资源**。它们都共用同一份平台 Bedrock token + Haiku 4.5。每个新增只增加一行 DB(AgentAccount),增加一份 spending budget 记录,不增加 inference 容量。 |

---

## 7. 推荐 (按优先级)

### P0 (v0.7.4 / W6 deferred 必须做)

- [x] **修 `AgentTeamPanel` Bind Pets 按钮卡死** — `window.confirm` → `plugin-dialog.ask`(本 PR 已包含)
- [ ] **`MemberSettingsModal` 顶部加 banner**: "v1 暂用 Haiku 4.5(W7 接通 tier 选择)" — 防止 Pro 用户误以为 settings 立即生效

### P1 (W7 必须做)

- [ ] worker 读 `actor_agent_id → AgentAccount.preferredModel/preferredProvider`,fallback Haiku 4.5
- [ ] worker 读 `task.userId → users.byo_credentials`,有 BYO 就走 BYO(marketplace-hire 路径强制平台 token)
- [ ] `MULTI_AGENT_BYO_BRIDGE_ENABLED=1` env flag 控制

### P2 (W8 / 扩容)

- [ ] PM2 cluster mode `pm2 scale 4`(配 worker 间 DB 连接池调优)
- [ ] AWS Bedrock RPM quota 申请提到 200
- [ ] Sub-task priority queue (Pro 用户优先)

---

## 8. 引用代码位点(给下一个 Agent 接手时直接读)

| 文件 | 关键行 | 作用 |
|------|--------|------|
| `backend/src/modules/agent-task/agent-task.worker.ts:39` | `MAX_PARALLEL = parseInt(process.env.AGENT_TASK_MAX_PARALLEL \|\| '2')` | worker 并发上限 |
| `backend/src/modules/agent-task/agent-task.worker.ts:435` | `await this.bedrock.invokeModel(prompt)` | sub-task LLM 调用入口(无 BYO/无 model 偏好) |
| `backend/src/modules/ai-integration/bedrock/bedrock-integration.service.ts:289` | `invokeModel(..., modelId = 'us.anthropic.claude-haiku-4-5-20251001-v1:0', userCredentials?)` | 默认模型 + BYO 入口存在但 worker 不传 |
| `backend/src/entities/agent-account.entity.ts:329` | `@Column({ name: 'preferred_model' }) preferredModel?: string` | 字段定义,worker 不读 |
| `backend/src/modules/agent-team/agent-team.service.ts:340-410` | `provisionTeam` 创建 AgentAccount 时写入 `preferredModel` | 数据写正确,链路下游忽略 |
| `backend/src/modules/cost-tracker/cost-tracker.service.ts:60-95` | `MODEL_PRICING` 表 + Haiku 4.5 价格 | 计费用 |
| `desktop/src/components/AgentTeamPanel.tsx:227-260` | `handleBindMyPets` v0.7.4 hotfix(plugin-dialog) | Bind Pets 按钮真实 wired up |
| `desktop/src/components/MemberSettingsModal.tsx` | Pro Mode editor — settings 写库但 worker 不读 | UX/backend 不一致点 |

---

## 9. Branch / Tag 状态(写文档当时)

- v1 ship branch: `perf/desktop-pre-launch-p1`(本 audit + Bind Pets hotfix 在这条线上)
- v2 W7+W8 branch: `feat/multi-agent-w7-w8-v2`(BYO bridge 在 v2 v2 plan 中)
- v1 ship tag: `v1-multi-agent-ship-2026-05-26`
- 当前 desktop build: v0.7.3(用户已装),正在做 v0.7.4 hotfix
