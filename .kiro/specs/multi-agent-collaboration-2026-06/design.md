# Design Document

> **Spec**: `multi-agent-collaboration-2026-06`
> **Phase**: design (post requirements approval)
> **Author**: Dev Agent + CEO
> **Date**: 2026-05-26
> **Branch**: `perf/desktop-pre-launch-p1`(起草);wave sprint 切自己分支
> **Predecessor**: `requirements.md`(R1-R15 已 approved)
> **Reference for §s**: [`MULTI_AGENT_PRIORITIZATION §3.3`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md#33-designmd-顶层结构)

## Overview

本设计文档落地 `multi-agent-collaboration-2026-06` spec 的全部 15 个
requirements(R1-R15)。核心命题:**用户始终和一个 Leader_Agent 对话,
Leader 在后台把任务派给 Sub_Agent 或 team member 完成,过程可见、可
控、可观察**;不在主 chat 渲染多 agent 对话(违反核心原则,详见
§0)。Living Pet 是长生 agent 的载体,跨用户雇佣是 v2 占位。

详细 14 节展开见下方 §0 - §14;实现路径速查见 §16;风险登记见 §17。

## Architecture

5-Layer 模型(详见 §1.1):

```
L5 Marketplace          (跨用户 A2A 雇佣 — v2 W7)
L4 Living Pet           (长生 agent — W3)
L3 Worktree / Task      (任务并行沙盒 — W1, W4)
L2 Sub-agent dispatch   (主 + 临时子 agent — W2)
L1 Single-agent chat    (主对话 — 已 ship)
```

v1(W1-W5)= L1 + L2 + L3 + L4 完整接线。详细架构见 §3 (Spawn 协议)
+ §5 (UI panel 布局) + §7 (长任务回流 4 通道)。

## Components and Interfaces

新增 + 复用组件清单见 §1.2(已 ship 资产)+ §16(每个 R 的 file-level
实现清单)。Spawn 协议 `agent_run` tool schema 见 §3.2;Sub_Agent_Event
schema 见 §4.1;Agent_Team_Panel UI 布局见 §5.3。

## Data Models

详细数据模型见 §2(现有 schema 引用 + 8 个新增 SQL DDL + 关系图)。
关键新增:

- `agent_tasks.parent_task_id` (R1, R10) — 形成 task graph
- `agent_tasks.target_kind` (R1, R13) — leader-direct / local-anonymous / team-member / marketplace-hire
- `worktree_lanes` table (R4) — 从 localStorage 迁到 backend
- `living_pets.bound_agent_account_id` (R7) — Pet ↔ Agent 桥
- `pet_productivity_snapshot` (R15) — v1 写,v2 W8 读
- 详见 §2.2 全部 8 项 migration

## Error Handling

详见 §8 (Sub-task 失败 + 冲突解决) + §10.5 (budget cap 拒绝) + §13.1
(marketplace-hire v1 reject)。

关键 error path:
- Spawn rate-limit (R1.4)
- Budget exceeded warning at 80%, refusal at 100% (R10.6)
- Sub-task failure → Pro mode rollback / Simple mode friendly prompt (§8)
- Lane conflict → Conflict_Resolver_Modal (§8.3)
- Cost tracking failure → DLQ best-effort (§12.3)
- Marketplace-hire in v1 → 400 not_implemented_in_v1 (§13.1)

## Testing Strategy

每个 R 的 acceptance criteria 已在 requirements.md EARS 形式锁定,
本 design 不重复;核心 test scenarios:

1. **R1 spawn rate-limit** — 触发 5 个并发 spawn,第 5 个 reject
2. **R2 timeline 可见** — 派 sub-task,3 类 event 都出现在 TaskTimeline
3. **R5 Simple Mode** — 切 Simple,触发 sub-task,verify ball badge 出现
   + 完成后 Leader 自动 inject 一句话总结
4. **R6 selectMember** — 用户有 2 个 coder member,verify 选 in-flight 少
   的那个
5. **R8 budget cap** — Pro user 输入 $25,reject;Business user 输入
   $25,accept
6. **R9 background** — 30s 阈值后 timeline 显示 background badge
7. **R12 rollback** — failed sub-task 点 rollback,worktree 干净
8. **R14 World Engine** — flag on 时 4 阶段在 timeline / panel 可见;
   flag off 时无变化
9. **R15 schema-only** — v1 代码不写 task_arena mode;migration 跑通

详细 test plan 在 tasks.md 每个 wave 末尾给出。

## Correctness Properties

参考 PET_FORMS_DESIGN_v5 / desktop-pet-rebuild bugfix spec 的格式,本
design 锁定以下 7 条 property,每条都在 tasks.md W5 sprint 有对应
regression test:

### Property 1: Task graph 无环

**Statement**: `agent_tasks.parent_task_id` 形成的有向图不能含环;每
个 sub-task 至多一个直接 parent。

**Validates: Requirements 1.2, 14.2**

**Rationale**: 防止"sub-task 派 sub-task" 时把自己派回去导致死循环。

**Verified by**: backend `agent-task-spawn.service.ts` 在 dispatch 时
跑 `detectCycle(parentTaskId, candidateChild)`;W5 e2e 测试构造 chain
A → B → C,然后 try B → A,verify reject。

### Property 2: Spawn fan-out cap

**Statement**: 同一 leader chat 同时 in-flight sub-task 数 ≤ 4。

**Validates: Requirements 1.4**

**Rationale**: BullMQ 默认 concurrency 5,留 1 给主 chat;超过会拖死
LLM 配额。

**Verified by**: `spawnTool.ts` 客户端检查 + `agent-task-spawn.service.ts`
后端检查;W2 e2e 触发 5 个并发,verify 第 5 个返回 spawn_rate_limited。

### Property 3: Cost log 完整性

**Statement**: 每个 sub-task 终态(succeeded / failed / canceled)必
有恰好一条 `event_type='sub_task_complete'` 汇总行写入
`agent_cost_records`。

**Validates: Requirements 10.1, 10.3**

**Rationale**: UI 直接读这条汇总行作为"sub-task 总成本";若缺失则
R2.3 卡片显示 N/A。

**Verified by**: `agent-task.worker.ts` 的 finally 块强制写一条;DLQ
保护 best-effort(R10.4);W5 测试制造 DB outage,verify task 仍完成,
DLQ 包含未写的汇总行。

### Property 4: Lane ↔ agent 唯一性

**Statement**: 每个 `worktree_lanes.id` 至多 bind 一个 `agent_id`;每
个 sub-task `agent_tasks.id` 至多 bind 一个 `worktree_lanes.id`。

**Validates: Requirements 4.1, 4.2**

**Rationale**: 多个 agent 写同一 lane 会冲突;同一 sub-task 跨 lane
工作语义混乱(spawn 一个新 sub-task 即可)。

**Verified by**: `worktree_lanes` 表结构 `agent_id` + `agent_task_id`
不是 unique 但 worker 层 enforce(`UPDATE ... WHERE agent_id IS NULL`
optimistic lock);W4 测试两个 worker 抢同一 lane,verify 第 2 个 reject。

### Property 5: Simple Mode 字段隔离

**Statement**: Simple Mode UI 不能渲染 `agent_id` / `parent_task_id` /
`taskId` / git branch name / file path / USD / token count /
`errorMessage` 原文。

**Validates: Requirements 5.4**

**Rationale**: Simple Mode 用户被这些字段吓退;违反 R5.4 acceptance。

**Verified by**: `TeamActivitySurface.tsx` props type **不接受** 这些
字段(TypeScript 编译时强制);UI snapshot test 抓取 DOM,grep 不应
出现 `0x` / `agent_account_` / `.ts$` / `.py$` / `\$\d` 模式。

### Property 6: V2 占位字段在 v1 永不写

**Statement**: 在 v1 代码 grep 不到任何对 `agent_tasks.hired_from_user_id`
/ `world_engine_battles.subject_kind` / `mode IN ('task_arena','tournament','arena_room')`
的写入。

**Validates: Requirements 13.3, 15.1, 15.2**

**Rationale**: 防止 v1 sprint 误把这些字段提前激活,导致 v2 W7/W8
schema 假设崩塌。

**Verified by**: CI lint rule(custom AST 检查 `INSERT/UPDATE` SQL +
TypeORM `repo.update/insert` 调用),v1 sprint W1-W5 任何 PR 触发该
lint 即 fail。

### Property 7: Broadcast SLA

**Statement**: leader 在 main 窗口 spawn 的 sub-task 状态变化,
Companion_Ball badge 在 ≤ 3 秒内反映。

**Validates: Requirements 5.6, 4.5**

**Rationale**: R5.6 acceptance;>3s 体感是"app 卡了"。

**Verified by**: `desktop-sync.companion-presence` 通道在 status 变
化时 emit;前端 `useActiveSubTasksCount` 监听并 setState;W5 e2e 用
高分辨率 timer 测 dispatch → DOM update 间隔。

---

# 详细章节展开(§0 - §14)

> 以下为按 [`MULTI_AGENT_PRIORITIZATION §3.3`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md#33-designmd-顶层结构)
> 14 节标题展开的设计内容。Kiro spec format 标准 section 已在上方
> Overview/Architecture/Components/Data Models/Error Handling/Testing
> Strategy/Correctness Properties 给出索引。

## 文档结构

| § | 范围 | 关联 R |
|---|------|--------|
| §0 | 调研背景与决策回顾 | — |
| §1 | Layer 1-5 模型 + 已 ship 资产盘点 | — |
| §2 | 数据模型(现有 + 新增) | R1, R7, R10, R13, R15 |
| §3 | Spawn 协议 — `agent_run` 工具 + dispatch 链路 | R1, R6, R13 |
| §4 | 可见性协议 — Sub_Agent_Event schema 前后端对齐 | R2 |
| §5 | Agent_Team_Panel UI(从 TaskWorkbench 提出) | R3 |
| §6 | WorktreeLane × Agent 桥接 | R4 |
| §7 | 长任务回流(companion ball / lock-screen / push) | R9 |
| §8 | 失败 / 冲突 — auto-merge / 手工 / 回滚 | R12 |
| §9 | Simple Mode 简化视图(Team_Activity_Surface) | R5 |
| §10 | Pro Mode 完整视图 + Member_Settings_Modal | R8 |
| §11 | LivingPet ↔ AgentAccount 桥接 | R7 |
| §12 | 经济属性 — agent_cost_records + 周报 | R10, R11 |
| §13 | 跨用户 A2A v2 占位(W7 schema 不锁) | R13 |
| §14 | World Engine 整合(W6 optional)+ Pet Arena 数据预留(W8) | R14, R15 |

## §0 调研背景与决策回顾

调研三家(Codex / Claude Composer / 腾讯贾维斯)详见
[`MULTI_AGENT_RESEARCH §1-§4`](../../../docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md)。
本 design 不重复其内容,只列出**指导本文设计选择**的核心结论:

1. **不在主 chat 渲染多 agent 对话** — 三家都汇聚到这个结论。Agentrix
   遵循:Leader 主对话保持单一 persona,sub-agent 通过 timeline 卡 +
   单独 lane 呈现。
2. **任务并行 + 异步 PR**(Codex)是程序员真实需求 — Agentrix 已 ship
   `WorktreePanel` 完成 git worktree 隔离,本 design 在其上加 `agent_id`
   归属。
3. **主导 + 临时子 agent**(Claude Composer)是清晰的执行模型 — Agentrix
   `agent_run` Spawn_Tool 直接复刻其签名(`role, prompt, scope, budget`)。
4. **跨工具 + 长任务 + 长生 agent**(贾维斯)是 toC 友好 — Agentrix 用
   LivingPet 作为长生 agent 的载体,不另造概念。
5. **经济属性是 Agentrix 独有差异化** — 三家都没有 agent 之间真实
   $/AXP 流动;`agent_cost_records` + `pet-a2a` escrow 已 ship,本
   design 把它们接入 sub-task 完成路径。

[`MULTI_AGENT_PRIORITIZATION`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md#5-决策建议)
**选项 A 已 PM 拍板**:1 个 spec,v1 = W1-W5(launch+30-60 天),Arena
作为 W8 在 v2 落地。本 design 只设计 R1-R12 的 v1 实现 + R13-R15 的
schema 占位,不实现 v2 功能。

## §1 Layer 1-5 模型与已 ship 资产盘点

### §1.1 Layer 模型(直接 link [`MULTI_AGENT_RESEARCH §5.1`](../../../docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md#51-agentrix-多-agent-的-5-层模型))

```
┌────────────────────────────────────────────────────┐
│ L5 Marketplace          跨用户 A2A 雇佣            │ R13 (v2 W7)
├────────────────────────────────────────────────────┤
│ L4 Living Pet           长生 agent / 灵魂           │ R6, R7, R8 (W3)
├────────────────────────────────────────────────────┤
│ L3 Worktree / Task      任务并行 / 沙盒             │ R3, R4, R9 (W1, W4)
├────────────────────────────────────────────────────┤
│ L2 Sub-agent dispatch   主 + 临时子 agent          │ R1, R2 (W2)
├────────────────────────────────────────────────────┤
│ L1 Single-agent chat    主对话(已 ship)            │ — baseline
└────────────────────────────────────────────────────┘
```

v1 W1-W5 = L1 + L2 + L3 + L4 完整接线。L5 schema 在 v1 落地,功能 W7。

### §1.2 已 ship 资产清单(直接复用,不重写)

引用源:[`MULTI_AGENT_PRIORITIZATION §2.1`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md#21-桌面端已有的列出来不要重写)。本 design
基于以下 8 个**已 ship 桌面组件 / 后端模块**展开:

**桌面端(已 ship,本 design 接线 / 扩字段)**:

| 组件 | 路径 | 本 design 改动 |
|------|-----|----------------|
| `WorktreePanel.tsx` | `desktop/src/components/WorktreePanel.tsx` | §6:`WorktreeLane` 加 `agent_id` 字段 + Agent_Identity_Card 渲染 |
| `TaskWorkbenchPanel.tsx` Agent Team Sandbox 段 | 同上 | §5:把 Sandbox 提到 `Agent_Team_Panel.tsx` 顶层 panel |
| `TaskTimeline.tsx` agent_spawn/invoke/result 事件 | 同上 | §4:补强 schema(`subTaskId` / `parentTaskId` / `actorAgentId`)|
| `ChatTitleBar.tsx` More 菜单 | `desktop/src/components/chatPanel/` | §5:加 "🤖 Agent Team" 入口(`tier: "standard"`) |
| `inferAgentTeamRole()` | `TaskWorkbenchPanel.tsx` | §4:作为 fallback role 推断,新事件优先用显式 `role` 字段 |

**后端(已 ship,本 design 加 endpoint / migration)**:

| 模块 | 路径 | 本 design 改动 |
|------|-----|----------------|
| `agent-team` | `backend/src/modules/agent-team/` | §3:`agent-team.service` 加 `selectMember(role)` 解析器 |
| `agent-task` | `backend/src/modules/agent-task/` | §2:entity 加 `parent_task_id` migration + worker 写 `agent_cost_records.parent_task_id` |
| `agent-team-template` entity | `backend/src/entities/agent-team-template.entity.ts` | 不变;§5 直接读取 11-agent 模板 |
| `pet-team` | `backend/src/modules/pet-team/` | §11:`PetTeamMember` 接 AgentAccount(`bound_agent_account_id`) |
| `pet-a2a` | `backend/src/modules/pet-a2a/` | §13:v1 不动;v2 W7 复用现有 escrow |
| `agent-cost-record` entity | `backend/src/entities/agent-cost-record.entity.ts` | §12:加 `parent_task_id` 字段 + `event_type='sub_task_complete'` 汇总行 |
| `agent-orchestration` | `backend/src/modules/agent-orchestration/` | §3:`agent_run` 调度走它现有 Bull queue |

### §1.3 不属于本 spec 的边界

- **chat 主对话渲染** — 仍由 `ChatPanelImpl.tsx` 负责,本 design 只
  注入 `agent_run` 工具到 LLM tool list,**不改 message bubble 渲染**。
- **Worktree git 操作底层** — 仍由 `services/worktree.ts` /
  `services/git.ts` 负责;本 design 只在 lane 元数据上加 `agent_id`。
- **LLM 路由 / tier 决策** — 仍由 `tier-router` 模块负责;sub-agent
  的 model tier 沿用现有 router,只是 `Sub_Task` 携带 tier hint。
- **CompanionBall 浮球渲染** — 仍由 P9 redesign 负责,本 design 只
  通过 `desktop-sync.companion-presence` 通道往球上加 badge / pulse。



## §2 数据模型 — 现有 schema + 新增字段

> 现状基于 `backend/src/entities/*.entity.ts` 真实代码 audit
> (2026-05-26)。新增字段以 migration 落地,不改既有列。

### §2.1 现有 schema(不动 — 引用)

| Entity | 关键字段 | 本 design 用途 |
|--------|---------|----------------|
| `agent_tasks` | `id`, `userId`, `agentId` (string nullable), `instanceId`, `title`, `prompt`, `status`, `progress`, `tier`, `costUsd`, `resultSummary`, `errorMessage`, `startedAt`, `completedAt` | Sub_Task 主载体,**复用** `agentId` 塞 pet member 的 AgentAccount.id |
| `agent_task_logs` | `taskId`, `kind`, `message`, `payload jsonb` | Sub_Agent 生命周期事件存这,timeline 从这里读 |
| `agent_team_templates` | `slug`, `roles[]: AgentRoleDefinition`, `teamSize`, `creatorId` | §5 Provision flow 直接读 |
| `pet_team_members` | `parentLivingPetId`, `userId`, `role`, `soulTemplateId`, `displayName`, `scope`, `dailyBudgetUsd`, `walletAddress`, `status` | §11 LivingPet ↔ AgentAccount 桥的中间表 |
| `agent_cost_records` | `userId`, `sessionId`, `agentId` (actor), `instanceId`, `model`, `provider`, `tokens`, `costUsd`, `routingReason`, `tier` | §12 经济记账,**复用** `agentId` |

### §2.2 新增字段 / 表(v1 migration)

#### 新增 1:`agent_tasks.parent_task_id` (R1.2, R10.1, R14.2)

```sql
-- migrations/2026-06-01-multi-agent-task-graph.ts
ALTER TABLE agent_tasks
  ADD COLUMN parent_task_id uuid NULL REFERENCES agent_tasks(id);
CREATE INDEX idx_agent_tasks_parent ON agent_tasks(parent_task_id, created_at DESC);
```

- nullable;主对话 task 的 `parent_task_id = null`,sub-task 指向父
- self-referencing FK 形成 task graph(tree 居多,World Engine §14
  也可以是 chain)

#### 新增 2:`agent_tasks.target_kind` (R1, R13.1)

```sql
ALTER TABLE agent_tasks
  ADD COLUMN target_kind varchar(24) NOT NULL DEFAULT 'leader-direct';
-- enum-like, no DB enum to keep migration simple:
-- 'leader-direct'      — 主对话 task (parent_task_id IS NULL)
-- 'local-anonymous'    — 临时 anonymous sub-agent
-- 'team-member'        — 派给具名 pet member(agentId 指向其 AgentAccount)
-- 'marketplace-hire'   — v2 W7 跨用户雇佣 (v1: REJECT with not_implemented)
CREATE INDEX idx_agent_tasks_target_kind ON agent_tasks(target_kind, status);
```

#### 新增 3:`agent_tasks.hired_from_user_id` (R13.2 — v1 schema-only)

```sql
ALTER TABLE agent_tasks
  ADD COLUMN hired_from_user_id varchar(64) NULL;
-- v1: 永远是 NULL;v2 W7 marketplace hire 时存卖方用户 id
```

#### 新增 4:`agent_cost_records.parent_task_id` (R10.1)

```sql
ALTER TABLE agent_cost_records
  ADD COLUMN parent_task_id uuid NULL;
ALTER TABLE agent_cost_records
  ADD COLUMN event_type varchar(32) NULL;
-- 'llm_call' (default) | 'sub_task_complete' (汇总行) | 'tool_call'
CREATE INDEX idx_acr_parent_task ON agent_cost_records(parent_task_id, created_at DESC);
```

#### 新增 5:`worktree_lanes` 表(R4.1)

> 现状:`WorktreePanel.tsx` 把 lane 存 **localStorage**(`loadStoredLanes()`),
> 没有 backend 表。R4 要求 lane × agent 跨设备一致,所以 v1 落 backend
> 表 + 同步,localStorage 退化为 cache。

```sql
CREATE TABLE worktree_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(64) NOT NULL,
  workspace_dir text NOT NULL,
  base_branch varchar(200) NOT NULL,
  worktree_branch varchar(200) NOT NULL,
  worktree_directory varchar(200) NOT NULL,
  mission text NOT NULL DEFAULT '',
  focus_files text NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'idle', -- idle | running | review | blocked
  agent_id varchar(64) NULL,                  -- AgentAccount.id (可空 → 人类拥有的 lane)
  agent_task_id uuid NULL,                    -- 关联 agent_tasks.id (sub-task 创建的 lane)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_worktree_lanes_user_workspace ON worktree_lanes(user_id, workspace_dir);
CREATE INDEX idx_worktree_lanes_agent ON worktree_lanes(agent_id);
CREATE INDEX idx_worktree_lanes_task ON worktree_lanes(agent_task_id);
```

迁移策略:启动时把 `localStorage[agentrix_worktree_lanes]` 读出 →
`POST /api/worktree-lanes/bulk-import`(idempotent) → 后续读
`GET /api/worktree-lanes`,localStorage 仅做 first-paint cache。

#### 新增 6:`living_pets.bound_agent_account_id` (R7.1)

```sql
ALTER TABLE living_pets
  ADD COLUMN bound_agent_account_id varchar(64) NULL REFERENCES agent_accounts(id);
CREATE INDEX idx_living_pets_bound_agent ON living_pets(bound_agent_account_id);
```

#### 新增 7:`pet_productivity_snapshot` 表(R15.3 — v1 写,v2 读)

```sql
CREATE TABLE pet_productivity_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL,
  user_id varchar(64) NOT NULL,
  week_start date NOT NULL,
  sub_tasks_completed int NOT NULL DEFAULT 0,
  sub_tasks_failed int NOT NULL DEFAULT 0,
  total_cost_usd_contributed numeric(10, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_pet_productivity_unique ON pet_productivity_snapshot(pet_id, week_start);
```

v1 cron 周日 UTC+8 02:00 跑 → 聚合上周 `agent_cost_records` →
upsert per pet。**v1 不读它,v2 W8 Pet Arena ladder 读**。

#### 新增 8:`world_engine.battle.mode` enum 扩展(R15.1 — schema-only)

```sql
-- v1 migration; v1 代码不写新值,只是允许列接受新值
ALTER TYPE battle_mode ADD VALUE IF NOT EXISTS 'task_arena';
ALTER TYPE battle_mode ADD VALUE IF NOT EXISTS 'tournament';
ALTER TYPE battle_mode ADD VALUE IF NOT EXISTS 'arena_room';
ALTER TABLE world_engine_battles
  ADD COLUMN subject_kind varchar(16) NULL; -- 'world_asset' | 'living_pet'
```

### §2.3 关系图(简版)

```
agent_accounts (existing)
   ▲                    ▲
   │ bound_agent_       │ agent_id (actor)
   │ account_id         │
living_pets ◄──┐        agent_cost_records
               │              ▲
               │              │ parent_task_id
   pet_team_   │              │
   members ────┘        agent_tasks ──┐
   (parent +       (id)│      ▲       │
   role + soul)        │      │       │ parent_task_id (self ref)
                       └──────┴───────┘
                              │
                              │ agent_task_id
                              ▼
                       worktree_lanes
                       (per workspace,
                        per user)
```

### §2.4 不动的资产(明确说出来,避免后人重造)

- `agent_team_templates.roles[].codename` 是 11-agent 模板的 role
  代号(`ceo` / `dev` / `qa_ops` / ...),**直接复用**,不另造 enum。
- `pet_team_members.role` 已是 `PetTeamRole` 11 值,**直接复用**。
- `agent-task.worker` 的 BullMQ queue 名 `agent-tasks`,concurrency 5,
  已 ship,**v1 sub-task 走同一 queue**(R9.1)。
- `desktop-sync.companion-presence` 通道(P9 redesign 已 ship)是 v1
  CompanionBall badge 推送通道(R5.6, R9.3)。



## §3 Spawn 协议 — `agent_run` 工具 + dispatch 链路

> 满足:R1 (Leader spawn) + R6 (Pet member preference) + R13 (target_kind)

### §3.1 Tool 注入点

`agent_run` 是一个 **LLM tool**,不是 Tauri 命令。注入位置:

```
desktop/src/services/agentTools/registry.ts (existing tool registry)
   └─ register('agent_run', { schema, executor })
```

注入条件:`useUserMode() in ('standard', 'pro')` AND
`workspaceTier !== 'simple'`(R1.1, R1.3)。Simple Mode 也注入但 UI
不显示 tool-call card(R1.3 silently allow)。

### §3.2 Tool schema(LLM 看到的)

```typescript
// shared/types/agent-tools.ts (NEW)
export const AGENT_RUN_TOOL_SCHEMA = {
  name: "agent_run",
  description:
    "Delegate a sub-task to a sub-agent. Returns a subTaskId that " +
    "you can reference in your reply with [sub-task #N] anchors. " +
    "Sub-agents run in the background — do NOT wait for results " +
    "before continuing the conversation.",
  parameters: {
    type: "object",
    required: ["role", "prompt"],
    properties: {
      role: {
        type: "string",
        description:
          "Agent role tag (e.g. 'researcher', 'coder', 'reviewer', " +
          "'qa_ops'). If a team member's role matches, the member is " +
          "selected automatically (see §3.4 selectMember).",
      },
      prompt: {
        type: "string",
        description: "Self-contained instructions for the sub-agent.",
        maxLength: 8000,
      },
      scope: {
        type: "object",
        description:
          "Optional tool/path scope. Defaults to leader's scope minus " +
          "destructive tools.",
        properties: {
          tools: { type: "array", items: { type: "string" } },
          workspace_paths: { type: "array", items: { type: "string" } },
        },
      },
      budget_usd: {
        type: "number",
        description:
          "Hard cap on USD spend. Default 1.00. Values >10 require " +
          "explicit user approval (will queue an approval modal).",
        minimum: 0.1,
        maximum: 100,
      },
      target: {
        type: "string",
        enum: ["local-anonymous", "team-member", "marketplace-hire"],
        description:
          "Optional. Default 'team-member' if a member matches role, " +
          "else 'local-anonymous'. 'marketplace-hire' is v2 only and " +
          "currently rejects.",
      },
    },
  },
} as const;
```

### §3.3 Executor 流程

```
LLM emits tool_call: agent_run({ role: "researcher", prompt: "...", budget_usd: 2.0 })
   ↓
[client side: useStreamingTurn]
   1. budget_usd > 10 ? → dispatch agentrix:approval-needed → wait
   2. concurrent count > 4 ? → return spawn_rate_limited (R1.4)
   3. cumulative > 8 in same chat session ? → require user "continue" (R1.6)
   4. POST /api/agent-tasks/spawn { parentTaskId, role, prompt, scope, budget, target }
   ↓
[backend: agent-task.controller.spawn]
   5. AgentTaskSpawnService.dispatch(dto)
      ├─ a. resolve target:
      │     if target === "marketplace-hire" → 400 not_implemented_in_v1
      │                                          + analytics event (R13.1)
      │     if target === "team-member" or unspecified:
      │        member = AgentTeamService.selectMember(userId, role)  ← §3.4
      │        if member found → target_kind = "team-member"
      │        else            → target_kind = "local-anonymous"
      │     if target === "local-anonymous": skip member resolve
      ├─ b. AgentTaskService.create({
      │        userId, agentId: member?.bound_agent_account_id ?? primaryAgent,
      │        title: role + " — " + prompt.slice(0,80),
      │        prompt, parentTaskId, target_kind, tier
      │     })
      ├─ c. enqueue BullMQ job 'agent-tasks' { taskId, parentTaskId }
      └─ d. emit agent_spawn event:
            { taskId, parentTaskId, role, actorAgentId, target_kind }
   ↓
[response]
   { subTaskId, status: 'queued', target_kind }
   ↓
[client]
   inject "[sub-task #N]" anchor in chat (N = position in this turn)
   leader's reply continues streaming with the anchor reference
```

### §3.4 `selectMember(role)` 解析器 — R6 核心

```typescript
// backend/src/modules/agent-team/agent-team.service.ts (EXTEND)
export class AgentTeamService {
  async selectMember(
    userId: string,
    role: string,
  ): Promise<PetTeamMember | null> {
    // R6.1: case-insensitive substring match on declared role
    const normalizedRole = role.toLowerCase().trim();

    // 1. Find all active pet members for this user
    const members = await this.petTeamMemberRepo.find({
      where: { userId, status: 'active' },
    });
    if (!members.length) return null;

    // 2. Filter by role match (substring match per R6.1)
    const matches = members.filter((m) =>
      m.role.toLowerCase().includes(normalizedRole) ||
      normalizedRole.includes(m.role.toLowerCase()),
    );
    if (!matches.length) return null;

    // R6.2: tie-break — least in-flight sub-tasks → highest reputation
    //                  → oldest createdAt
    const withMetrics = await Promise.all(
      matches.map(async (m) => ({
        member: m,
        inFlight: await this.countInFlightSubTasks(m.parentLivingPetId),
        reputation: m.bound_agent_account_id
          ? await this.agentAccountRepo.findOneBy({
              id: m.bound_agent_account_id,
            }).then((a) => a?.reputation ?? 0)
          : 0,
      })),
    );

    withMetrics.sort((a, b) => {
      if (a.inFlight !== b.inFlight) return a.inFlight - b.inFlight;
      if (a.reputation !== b.reputation) return b.reputation - a.reputation;
      return a.member.createdAt.getTime() - b.member.createdAt.getTime();
    });

    return withMetrics[0].member;
  }

  private async countInFlightSubTasks(parentLivingPetId: string): Promise<number> {
    const member = await this.petTeamMemberRepo.findOneBy({
      parentLivingPetId,
    });
    if (!member?.bound_agent_account_id) return 0;
    return this.agentTaskRepo.count({
      where: {
        agentId: member.bound_agent_account_id,
        status: In(['queued', 'running', 'awaiting_input']),
      },
    });
  }
}
```

### §3.5 Approval 闸口(budget > 10)

复用现有 approval 流(`agentrix:approval-needed` 事件 → ApprovalCenter
modal)。Spawn 自动 stash 到一个临时 Map,审批通过后再 dispatch:

```typescript
const pendingHighBudgetSpawns = new Map<string, SpawnDTO>();
// approval modal fires `agentrix:approval-resolved { commandId, action }`
// where action = 'approve' | 'reject'
window.addEventListener('agentrix:approval-resolved', (e) => {
  const { commandId, action } = (e as CustomEvent).detail;
  const dto = pendingHighBudgetSpawns.get(commandId);
  if (!dto) return;
  pendingHighBudgetSpawns.delete(commandId);
  if (action === 'approve') void dispatchSpawn(dto);
});
```

### §3.6 不在 v1 范围

- `target = "marketplace-hire"` → 返回 400 not_implemented(R13.1)
- `agent_run` 在 Simple Mode 仍然可调用,但 `tool_call` UI 完全隐藏
  (R1.3 — 用户只看 Team_Activity_Surface)
- LLM 调 `agent_run` 时不允许 spawn `target = "team-member"` 强制要求
  特定 member id;只能传 role,具名 member 选择由 backend 决定(避免
  LLM 越权用别人的 pet)



## §4 可见性协议 — Sub_Agent_Event schema 前后端对齐

> 满足:R2 (Timeline 可见) + R10 (cost log)

### §4.1 三类事件 schema(后端 emit)

`agent-task-log` 表的 `kind` 字段,在 v1 用以下三类(已 ship,只是把
schema 文档化):

#### kind = `agent_spawn`(创建)

```typescript
// payload jsonb on agent_task_logs
{
  taskId: string,            // 此 sub-task 自己的 id
  parentTaskId: string,      // 主对话或父 sub-task
  role: string,              // 'researcher' / 'coder' / ...
  actorAgentId: string,      // AgentAccount.id (anonymous 时是 leader 的 fallback agent)
  target_kind: 'local-anonymous' | 'team-member' | 'marketplace-hire',
  petMemberId?: string,      // 若 target_kind === 'team-member'
  promptPreview: string,     // 前 80 字符
  budgetUsd: number,
  tier?: string,
  spawnedAt: number,         // ms timestamp
}
```

#### kind = `agent_invoke`(每次工具调用)

```typescript
{
  taskId: string,
  toolName: string,
  toolCallId: string,
  argsPreview?: string,      // 前 200 字符
  invokedAt: number,
}
```

#### kind = `agent_result`(完成)

```typescript
{
  taskId: string,
  parentTaskId: string,
  status: 'succeeded' | 'failed' | 'canceled',
  durationMs: number,
  totalCostUsd: number,      // 来源:agent_cost_records sum where parent_task_id = taskId
  resultSummary: string,     // <= 200 字符
  errorMessage?: string,     // 仅 status=failed
  completedAt: number,
}
```

### §4.2 前端 timeline 渲染 — 复用 `TaskTimeline.tsx`

```typescript
// desktop/src/components/TaskTimeline.tsx (existing)
// 已 ship: agent_spawn / agent_invoke / agent_result kinds
// 本 design 新增:
//   - 渲染 actor identity (头像 + 名字 + role tag)
//   - inline anchor "[sub-task #N]" 在 chat message 里点击 → 滚动到对应卡

const KIND_LABELS = {
  agent_spawn: "🤖 Sub-Agent",
  agent_result: "🤖 Sub-Agent",
  agent_invoke: "🤖 Sub-Agent",
  ...
};
// 改为支持具名 pet:
function renderEventCard(event) {
  const isPetMember = event.payload.target_kind === 'team-member';
  const icon = isPetMember
    ? <PetAvatarMini petId={event.payload.petMemberId} />
    : <span>🤖</span>;
  // ...rest unchanged
}
```

### §4.3 跨 chat → timeline 的 anchor

```typescript
// MessageBubble.tsx renders chat message with markdown
// inject custom remark plugin: matches "[sub-task #N]" → makes clickable
// onClick → window.dispatchEvent(new CustomEvent('agentrix:scroll-to-sub-task', { detail: { n }}))
// TaskTimeline subscribes → scrolls + flashes the matching event card
```

### §4.4 折叠 invocation noise(R2.2)

`agent_invoke` 事件可能数十条 — 默认折叠成 `🔧 read 5 files, edit 2,
run 1 test (8 tool calls)` 一行,点开展开。复用 TaskTimeline 现有的
collapsed-by-default + click-to-expand UX。

### §4.5 失败的 result card UX(R2.5)

```jsx
{event.status === 'failed' && (
  <div style={{ borderLeft: '3px solid var(--tone-danger-text)' }}>
    <div>{event.errorMessage}</div>
    <button onClick={() => retrySpawn(event.taskId)}>Retry</button>
    <button onClick={() => rollback(event.taskId)}>Rollback</button>
    {/* rollback 实际行为见 §8 */}
  </div>
)}
```

## §5 Agent_Team_Panel UI — 从 TaskWorkbench 提到顶层

> 满足:R3 (顶层入口 + side panel + provision flow) + 关联 R5 R6 R8

### §5.1 入口

`ChatTitleBar.tsx` More 菜单已经有 `🌿 Worktree Board` / `🤖 Agent Team
Sandbox` 等条目,本 design 加一条:

```
🤖 Agent 团队  (tier: standard, 可见 standard + pro)
```

实现:`ChatTitleBar.tsx` 的 menu items 数组里加一项,onClick 派发
`agentrix:open-agent-team-panel`,ChatPanelImpl 监听打开 panel state。

### §5.2 文件结构

```
desktop/src/components/AgentTeamPanel.tsx          (NEW)
  ├─ <AgentTeamPanel open={...} onClose={...} />
  ├─ § sections:
  │    1. Leader card (Agent_Identity_Card large)
  │    2. Members grid (Agent_Identity_Card small × N)
  │    3. Active Sub_Tasks list (per member)
  └─ Modes:
       - empty → Provision CTA from template
       - populated → 3 sections above

desktop/src/components/AgentIdentityCard.tsx        (NEW)
  ├─ <AgentIdentityCard size="lg|md|sm" agent={agent} status={...} onClick={...} />
  └─ Renders: avatar emoji + name + role tag + status dot
              + (Pro Mode) Edit button → MemberSettingsModal

desktop/src/components/MemberSettingsModal.tsx     (NEW)
  └─ Pro Mode 编辑 role/scope/budget/tier (§10)

desktop/src/services/agentTeam.ts                  (NEW thin client)
  └─ wraps GET /api/agent-teams/:id
         POST /api/agent-teams/provision
         PATCH /api/agent-teams/:id/leader
         PATCH /api/v1/pet/team/:parentLivingPetId/members/:memberId
```

### §5.3 panel 布局

```
┌──────────────────────────────────────────────────────────────┐
│ Agent 团队                                            [×]    │
├──────────────────────────────────────────────────────────────┤
│ Leader                                                       │
│ ┌──────┐                                                     │
│ │ 🦊  │ 阿喵 (Architect)                  [Edit] [Switch] │
│ │ idle │ 主对话 agent · v0.3 灵魂                           │
│ └──────┘                                                     │
├──────────────────────────────────────────────────────────────┤
│ Members (4/10 · Pro)                              [+ Invite] │
│ ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                      │
│ │ 🐶  │  │ 🐰  │  │ 🐱  │  │ ✨  │                          │
│ │旺财  │  │小白  │  │黑炭  │  │alice │                       │
│ │coder │  │qa    │  │revw  │  │hire  │                       │
│ │● 2  │  │ idle │  │● 1  │  │— v2 │                          │
│ └──────┘  └──────┘  └──────┘  └──────┘                      │
├──────────────────────────────────────────────────────────────┤
│ Active Sub-Tasks (3)                                         │
│   #12  整理 5 个 README 文件     旺财  ████████░ 80%   $0.18 │
│   #13  跑测试 + 总结失败原因      黑炭  ████░░░░░ 35%   $0.04 │
│   #14  ⚠️ stalled 60min          旺财  待处理  [abort/extend]│
└──────────────────────────────────────────────────────────────┘
```

### §5.4 Provision flow(R3.6, R3.7)

empty state 显示 "Provision from template" CTA → 列出
`agent_team_templates` 表的可见模板(`visibility=public|official` +
`creator_id=userId`)。点击 → `POST /api/agent-teams/provision { templateSlug }`
→ panel 2 秒内 refresh。

### §5.5 Promote leader(R3.4)

右键 member card → context menu `[Promote to Leader]` → confirm 后调
`PATCH /api/agent-teams/:id/leader { agentId }`。Leader 切换后,主对话
自动 reload(派发 `agentrix:leader-changed`,ChatPanelImpl 重置 system
prompt + tool list)。

### §5.6 隐藏 Sandbox 重复 UI(R3.5)

`TaskWorkbenchPanel.tsx` 当前的 "Agent Team Sandbox (MVP)" 子段(三
张 Planner/Coder/Reviewer 卡)在 `AgentTeamPanel` 打开时**隐藏**:

```typescript
// TaskWorkbenchPanel.tsx
const agentTeamPanelOpen = useAgentTeamPanelOpen(); // new zustand selector
return (
  <>
    {/* ... other sections ... */}
    {!agentTeamPanelOpen && (
      <section data-task-workbench-agent-team-sandbox>...</section>
    )}
  </>
);
```

并在该 panel 顶部加一条 banner:`Agent Team 已升级为独立 panel,这里
保留旧视图供回顾`。R3.5 acceptance 满足。

### §5.7 数据来源

- Leader & Members:`GET /api/agent-teams/:teamId` 返回
  `{ team, leader, members[] }`
- Active Sub_Tasks:`GET /api/agent-tasks?status=running,queued,awaiting_input`
  并 group by `agentId`
- Cost per sub-task:聚合 `agent_cost_records` where `parent_task_id`
  匹配(§12 周报视图)

### §5.8 Tab 占位(R15.5 future-proof)

panel header 留一行 tab strip:

```
[ Active ]    (v2: [ Active ] [ Arena ] [ Tournament ])
```

v1 只渲染 "Active" tab,但 DOM 结构留 `<TabBar>`,v2 W8 加 tab 即可。



## §6 WorktreeLane × Agent 桥接

> 满足:R4 (Lane 显示 agent 身份)

### §6.1 数据迁移 — localStorage → backend

现状(audit 自 `WorktreePanel.tsx`):lane 存 `localStorage[agentrix_worktree_lanes]`,
schema 是 `WorktreeLane` interface(id / agent (string) / baseBranch /
worktreeBranch / worktreeDirectory / mission / focusFiles / status /
updatedAt / worktreePath)。**`agent` 字段是 string,不是 agent_id**。

v1 迁移路径:

1. 落地 `worktree_lanes` 表(§2.2 新增 5)
2. 启动时(`useServiceBootstrapper.ts`)读 localStorage → bulk-import
3. WorktreePanel.tsx 切换数据源:
   - `loadStoredLanes()` 改为读 backend(SWR style cache + localStorage
     fallback for offline)
   - `setLanes(...)` 改为写 backend(`PATCH /api/worktree-lanes/:id`)
4. 现有 `agent` string 字段映射规则:
   - 如果与 `agent_team_templates.roles[].codename` 匹配 → 留给
     legacy display name
   - 同时新增 `agent_id` 字段填充实际 AgentAccount.id(初始迁移时
     全为 null,运行时由 R4.2 backend auto-link 填充)

### §6.2 Auto-link sub-task → lane(R4.2)

```typescript
// agent-task.worker.ts (extend)
async handleSubTaskJob(job) {
  const task = await this.taskService.findById(job.data.taskId);
  // ... existing tool execution ...
  if (task.target_kind === 'team-member' && createdWorktree) {
    await this.worktreeLaneRepo.update(
      { worktreeBranch: createdWorktree.branch, userId: task.userId },
      { agent_id: task.agentId, agent_task_id: task.id },
    );
  }
}
```

如果 sub-task 没有创建 worktree(只是读文件 / 跑工具),lane 关联跳过;
WorktreePanel 看不到这条 sub-task,但 timeline 仍可见(§4)。

### §6.3 Agent_Identity_Card 在 lane 上的渲染

```typescript
// WorktreePanel.tsx — 每条 lane row
<div style={laneRowStyle}>
  {lane.agent_id && (
    <AgentIdentityCard
      size="sm"
      agentId={lane.agent_id}
      status={mapLaneStatusToAgentStatus(lane.status)}
      onClick={() => openAgentTeamPanel({ filterAgentId: lane.agent_id })}
    />
  )}
  <div style={laneMetaStyle}>
    {lane.worktreeBranch}  {lane.mission}
  </div>
  ...
</div>
```

### §6.4 Status dot 实时更新(R4.5)

复用现有 `desktop-sync.companion-presence` 通道,后端在 `agent_tasks.
status` 改变时 emit `task-status` event(已 ship)。前端
`AgentTeamPanel` + `WorktreePanel` 都订阅,共享一个 `useAgentTaskStatus(agentId)`
zustand store(NEW thin selector)。

### §6.5 v1 不做

- Lane 主动给 agent 派活的 reverse path(用户在 lane 上点 "派给 X
  agent")— 这反向流是 v2,v1 只支持 sub-task → lane 单向 auto-link。

## §7 长任务回流 — companion ball / lock-screen / push

> 满足:R9 (背景执行 + 多通道回流)

### §7.1 何时进 background mode(R9.1)

```typescript
// desktop/src/components/chatPanel/useStreamingTurn.ts
// 现有的 sub-task spawn 后立刻 enqueue,前端 30s wall-clock 内若仍
// running → 转 "background mode":
//   1. 把 timeline 的 spinner 卡置为 "🌙 后台运行中" badge
//   2. 解除 chat 主输入的"等结果"阻塞 — 用户可继续聊
//   3. 把 task id 加入 BackgroundTasksStore (existing P9 redesign store)
const BG_THRESHOLD_MS = 30_000;
useEffect(() => {
  const timer = setInterval(() => {
    inFlightSubTasks.forEach((task) => {
      if (Date.now() - task.startedAt > BG_THRESHOLD_MS && !task.backgrounded) {
        task.backgrounded = true;
        backgroundTasksStore.add(task);
      }
    });
  }, 5000);
  return () => clearInterval(timer);
}, []);
```

### §7.2 完成回流 4 通道(R9.3, R9.4)

| 通道 | 触发 | payload | 实现 |
|------|------|---------|------|
| **CompanionBall pulse** | task 完成 | `{ subTaskId, summary, ok }` | `desktop-sync.companion-presence` channel emit `SubTaskCompleted` → CompanionBall 已 ship 的 pulse 动画 + tooltip |
| **Lock-screen pet** | 桌面 idle / locked | 同上 | `desktop-sync.lock-screen-pet` channel 已 ship,直接 emit 同事件 |
| **Mobile push** | 用户已注册 push device | + `deeplink: agentrix://multi-agent/sub-task/:id` | `device-registry` 模块已 ship,`POST /api/notification/push` |
| **Chat inject** | 用户回到 app + 点击 ball | aggregated message | Leader 主动 inject 一条消息汇总未 ack 的 sub-task(R9.6) |

### §7.3 Stalled 检测(R9.5)

后端 cron(已 ship `agent-presence.scheduler`)每 5 分钟扫一次 `agent_tasks
WHERE status='running' AND now() - started_at > 60min`,emit `SubTaskStalled`
event。CompanionBall 收到 → pulse amber + 显示 `[abort] [extend +30min]
[ask Leader to pivot]`。

### §7.4 Aggregated Leader inject(R9.6)

```typescript
// 用户点 CompanionBall badge → 派发 agentrix:open-chat-with-summary
// ChatPanelImpl 监听 → fetch unacknowledged sub-tasks → 通过 Leader
// 注入一条 system message:
const summaryMsg = `
我帮你跑了 ${tasks.length} 个 sub-task:
${tasks.map((t, i) => `- [sub-task #${i+1}] ${t.summary}`).join('\n')}
要看哪个的详情?
`;
```

### §7.5 Cancel 语义(R9.7)

`POST /api/agent-tasks/:id/cancel` 已 ship。CompanionBall amber
state 的 `[abort]` 直接调用此 API,worker 收到 cancel signal 后清理。
不引入新 endpoint。

## §8 失败 / 冲突 — auto-merge / 手工 / 回滚

> 满足:R12 (失败回滚 + 冲突解决)

### §8.1 Sub-task 失败的 lane recovery

```
Sub-task fails → lane.status = 'blocked' → lane row 红色描边 + 两个按钮:

  [Rollback]      [Open diff]
     │                │
     ▼                ▼
  POST                navigate to existing
  /api/worktree-      WorkspaceDiffWorkbench
  lanes/:id/rollback  (filter by lane.worktreeBranch)
     │
     ▼
  services/workspaceBackups.ts (existing) — git stash + checkout
  之前的 base_branch + delete worktree dir
```

### §8.2 双 sub-task 同 branch 冲突(R12.3)

```
sub-task A 想 merge → main, sub-task B 也想 merge → main
   ↓
backend in pet-team-coordinator (NEW thin module)
   1. 第一个 merge 走 git merge --no-ff,成功
   2. 第二个 merge 探测到 base 已变 → emit LaneConflict event
       payload: { laneAId, laneBId, conflictFiles[] }
   3. WorktreePanel 给 A、B 两个 lane 都打 ⚠️ conflict 黄色 badge
```

### §8.3 Conflict_Resolver_Modal(R12.4)

```
新组件:desktop/src/components/ConflictResolverModal.tsx
   ├─ 三栏布局:
   │    Left  = lane A 的 hunks (复用 services/git diff)
   │    Mid   = base
   │    Right = lane B 的 hunks
   └─ 三个按钮:
        [Keep mine]      → 取 A 的 hunk,B abort
        [Keep theirs]    → 取 B 的 hunk,A abort
        [Edit manually]  → 调 OpenInIde flow (existing,
                            from pro-mode-coding-views-2026-05)
                            打开冲突文件让用户解决
```

### §8.4 Out-of-scope detection(R12.7)

```typescript
// agent-task.worker.ts on completion
async validateScope(task, files_modified) {
  const allowed = task.scope.workspace_paths || ['**'];
  const violations = files_modified.filter(
    (f) => !matchesAnyGlob(f, allowed),
  );
  if (violations.length) {
    await this.taskService.update(task.id, { status: 'out_of_scope' });
    await this.appendLog(task.id, 'error', 'out_of_scope_violation', { violations });
    // R12.7: refuse merge, require Pro Mode user approval
    return { canMerge: false, requiresApproval: true };
  }
  return { canMerge: true };
}
```

### §8.5 Simple Mode failure recovery(R12.5)

Simple Mode 不暴露 modal,而是 R5.5 的友好 prompt:

```
"阿喵 卡住了 — 要让另一只宠物试试吗?"
   [yes]  [no]
     │      │
     │      └─ silently rollback (走和 Pro 同样的 backend rollback flow)
     └─ retrySpawn(taskId, fallback=AnonymousSubAgent)
```

R12.5 + R12.6 都满足 — `agent_task_log` 写 `eventType='rollback'`
+ 触发者(`triggered_by_mode='simple_yes'` / `'pro_manual'`)。



## §9 Simple Mode 简化视图 — Team_Activity_Surface

> 满足:R5 (Simple Mode 团队工作中球) + R12.5 友好失败 prompt

### §9.1 Companion_Ball badge

复用 P9 redesign 已 ship 的 CompanionBall(`desktop/src/components/PetCompanionWindow.tsx`
+ `services/petPresence.ts`)。本 design 在 ball 渲染层加一个 badge:

```typescript
// PetCompanionWindow.tsx (extend)
const activeSubTasks = useActiveSubTasksCount(); // R5.1 zustand selector
return (
  <div ...>
    <PetSpriteCanvas {...} />
    {userMode === 'simple' && activeSubTasks > 0 && (
      <span style={badgeStyle}>
        {activeSubTasks > 9 ? '9+' : activeSubTasks}
      </span>
    )}
  </div>
);
```

`useActiveSubTasksCount` 订阅 `desktop-sync.companion-presence` 通道
的 `team-activity-update` event(本 design 新增 event,后端 R5.6 emit
间隔 ≤ 3s)。

### §9.2 Team_Activity_Surface 全屏视图

```
desktop/src/components/TeamActivitySurface.tsx (NEW)
   ├─ 顶部:🦊 阿喵 + N 个伙伴在帮你忙
   ├─ Timeline:emoji-driven plain language (NO file paths / branch
   │            names / USD,只有 "正在读 5 个文件" 这样的表述)
   ├─ "ask Leader for an update" 按钮 → 派发主对话 inject
   │   "Leader, 任务到哪了?" 让 Leader 自己生成进度
   └─ 一条横向进度条(总进度 = 完成 sub-task 数 / 总数)
```

R5.4 不暴露技术细节的实现:`TeamActivitySurface` 只接受 `simplifiedSubTasks[]`
prop,**形状**:

```typescript
{
  emoji: string;        // 🦊 from member.avatar
  petName: string;      // 阿喵
  plainStatus: string;  // "正在读 5 个文件"(后端 LLM-generated 一句话)
  progress: 0-100;
}
```

后端在 `agent_task.worker.ts` 完成每个工具 step 时,调一次
`localPlainSummarize(toolCall, mode='simple')`(本 design 新增,但
fallback 到 hardcoded 模板,初期不调 LLM 节流)。

### §9.3 完成时的 Leader inject(R5.3)

完成 → ball pulse 一次 → 自动 inject 一条 Leader 消息:

```
🦊 阿喵 整理了 5 个文件,我已经准备好了。要看看吗?
   [看摘要] [继续聊]
```

实现:`useStreamingTurn.ts` 监听 `SubTaskCompleted` event,如果
userMode='simple',**自动作为 Leader 发出一条 assistant 消息**(无
需用户输入)。这个能力已 ship(P9 ambient 进度更新),只是新派一种
event。

### §9.4 R5 不暴露字段清单(test 用)

明确列出 Simple Mode **绝不可见**的字段(R5.4):

- `agent_id` / `parent_task_id` / `taskId`(都 hash 后再渲染)
- 任何 git branch name / file path
- 任何 USD / token 数字
- `errorMessage` 原文(改为 friendly recovery prompt)
- `agent_task_log.payload`(原始 jsonb)

## §10 Pro Mode 完整视图 + Member_Settings_Modal

> 满足:R8 (Pro Mode 编辑 role / scope / budget / tier)

### §10.1 入口位置

`AgentTeamPanel` 的 `AgentIdentityCard` 在 Pro mode 显示一个 [Edit]
button → 弹出 `MemberSettingsModal`。Simple/Standard mode 不渲染
[Edit] button(R8.6)。

### §10.2 Modal 字段

| 字段 | UI 控件 | 验证 | 数据源 |
|------|---------|------|--------|
| `role` | `<input>` | 1-30 chars, lowercase preferred | `pet_team_members.role` |
| `scope.tools` | multi-select chip from tool registry | min 1 tool | `tool-registry` 模块的 catalogue |
| `scope.workspace_paths` | textarea(每行一个 glob) | 支持 `!negate` | jsonb scope.workspace_paths |
| `daily_budget_usd` | `<input type=number>` | 0.10–100, default 1.00 | `pet_team_members.dailyBudgetUsd` |
| `preferred_model_tier` | radio: local / smart / cloud | enum | `tier-router.preferredTier` |
| (per-field) reset to template default | small button | 来源 `agent_team_template.roles[].codename` lookup | template entity |

### §10.3 Save flow(R8.3)

```typescript
const handleSave = async (memberId, patch) => {
  // R8.7 budget cap check
  if (patch.daily_budget_usd) {
    const cap = SUBSCRIPTION_TIER_CAPS[user.tier];
    if (patch.daily_budget_usd > cap) {
      throw new Error(`Daily budget cap for ${user.tier} is $${cap}. Upgrade for more.`);
    }
  }
  // existing endpoint
  await fetch(`/api/v1/pet/team/${parentLivingPetId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  // panel refresh within 2s — invalidate SWR cache
  mutateTeamData();
};
```

### §10.4 In-flight scope mutation(R8.4)

新 scope 只对 future spawn 生效,in-flight task 用 OLD scope 跑完。
实现:`agent-task.worker.ts` 在 spawn 时拷贝当前 scope snapshot 到
`agent_tasks.scope_snapshot` jsonb 字段(NEW migration,可选,实际
v1 把 snapshot 直接写进 `agent_task_logs.payload[0]`,不加新列)。

### §10.5 Subscription tier caps(R8.7)

```typescript
// shared/types/subscription.ts (NEW)
export const PER_PET_DAILY_BUDGET_CAPS = {
  free: 2,
  pro: 20,
  business: 200,
  enterprise: Number.POSITIVE_INFINITY,
} as const;
```

UI inline 错误 message:
```
当前套餐 (FREE) 每只宠物每天最多 $2.
升级到 Pro $20/天,Business $200/天,Enterprise 无上限。
[升级]  [稍后]
```

## §11 LivingPet ↔ AgentAccount 桥接

> 满足:R7

### §11.1 Schema 桥(已在 §2.2 定义)

```sql
ALTER TABLE living_pets
  ADD COLUMN bound_agent_account_id varchar(64) NULL REFERENCES agent_accounts(id);
```

### §11.2 自动 binding 流程(R7.2)

```
User in AgentTeamPanel → "Use my pets as members" CTA
   ↓
POST /api/agent-teams/:teamId/bind-pets
   payload: { livingPetIds: string[] }
   ↓
backend:
  for each livingPetId:
    if pet.bound_agent_account_id is null:
      const aa = await agentAccountService.create({
        userId: pet.userId,
        displayName: pet.name,
        avatarUrl: pet.thumbnail_url,
        personaConfig: deriveFromSoul(pet.soul_template_id),
        // existing AgentAccount fields
      });
      await livingPetRepo.update(pet.id, { bound_agent_account_id: aa.id });
    // ensure pet_team_members row exists
    await petTeamMemberService.upsert({
      parentLivingPetId: pet.id,
      role: deriveRoleFromSoul(pet.soul_template_id),
      // ...
    });
```

### §11.3 Sub-task 完成 → XP + cost(R7.3)

```typescript
// agent-task.worker.ts on success
if (task.target_kind === 'team-member' && task.parent_task_id) {
  const pet = await livingPetRepo.findOneBy({
    bound_agent_account_id: task.agentId,
  });
  if (pet) {
    // XP formula 已存在 (services/petXp.ts)
    await petXpService.grant(pet.id, calculateSubTaskXp(task));
  }
  // cost record (§12)
  await costRecordService.write({
    userId: task.userId,
    actorAgentId: task.agentId,
    parent_task_id: task.id,
    event_type: 'sub_task_complete',
    costUsd: task.costUsd,
    // ...
  });
}
```

### §11.4 Wallet 路由(R7.4)

```typescript
// pet-team.service.ts on dispatch
async chargeWallet(memberId, amountUsd) {
  const m = await this.repo.findOneBy({ id: memberId });
  if (m.walletAddress) {
    return this.petWalletService.deduct(m.walletAddress, amountUsd);
  }
  // fallback: deduct from owner's wallet (linked via spending_limits.source='owner')
  const ownerCanCover = await this.checkOwnerDailyBudget(m.userId, amountUsd);
  if (!ownerCanCover) throw new BudgetExceededError('pet_budget_exceeded');
  return this.userWalletService.deduct(m.userId, amountUsd);
}
```

### §11.5 解绑(R7.5)

`DELETE /api/v1/pet/team/:parentLivingPetId/members/:memberId` 已
ship,本 design 在该 endpoint 加一行:

```typescript
async removeMember(parentLivingPetId, memberId) {
  const member = await this.repo.findOneBy({ id: memberId });
  // existing soft-delete logic
  await this.repo.delete({ id: memberId });
  // R7.5: clear binding but keep AgentAccount (历史 cost record 引用)
  if (member.parentLivingPetId) {
    await this.livingPetRepo.update(
      { id: member.parentLivingPetId },
      { bound_agent_account_id: null },
    );
  }
}
```

### §11.6 Pet 详情页 binding badge(R7.6)

```jsx
{pet.bound_agent_account_id && (
  <span className="pet-binding-badge">🤖 也是我的工作伙伴</span>
)}
```

不暴露 AgentAccount.id / 任何技术词,Simple Mode 友好。

## §12 经济属性 — agent_cost_records + 周报

> 满足:R10 (cost log) + R11 (Pro Mode 周报)

### §12.1 写入路径(R10.1)

```typescript
// backend/src/modules/cost-tracker/cost-tracker.service.ts (extend)
async persistCost(record: CostRecord) {
  // existing impl
  // BUT: when called from agent-task.worker, attach parent_task_id:
  await this.repo.insert({
    ...record,
    parent_task_id: this.currentTaskContext.parentTaskId ?? null,
    event_type: record.eventType ?? 'llm_call',
  });
}
```

`agent-task.worker.ts` 维护 `AsyncLocalStorage` 的
`currentTaskContext`,把 `parentTaskId` 透传到 cost-tracker。

### §12.2 Sub_Task 完成汇总行(R10.3)

```typescript
// agent-task.worker.ts on terminal status
const totalCost = await this.repo.sum('costUsd', {
  parent_task_id: task.id,
  event_type: 'llm_call',
});
await costTracker.persistCost({
  userId: task.userId,
  agentId: task.agentId,
  sessionId: task.sessionId,
  parent_task_id: task.id,
  event_type: 'sub_task_complete',
  costUsd: totalCost,
  // ...
});
```

UI 在 R2.3 的 `agent_result` card 直接读这个 summary 行的 costUsd。

### §12.3 Best-effort + DLQ(R10.4)

```typescript
try {
  await costTracker.persistCost(record);
} catch (e) {
  await deadLetterQueue.enqueue('cost_log_failed', { record, error: e.message });
  // task still completes
}
```

DLQ 用现有 BullMQ 模式(`cost-tracker.deadletter` queue 已 ship)。

### §12.4 Budget warning(R10.6)

```typescript
// agent-task.worker.ts after each cost write
const dailyTotal = await this.repo.sum('costUsd', {
  userId,
  created_at: '>= today',
});
const dailyBudget = await this.userBudgetService.getBudget(userId);
if (dailyTotal >= 0.8 * dailyBudget && !this.warned80) {
  this.warned80 = true;
  await this.emitter.emit('agentrix:budget-warning', {
    userId, level: 80, used: dailyTotal, budget: dailyBudget,
  });
}
if (dailyTotal >= dailyBudget) {
  // 100% — refuse further agent_run calls
  await this.userFlagService.set(userId, 'agent_run_refused', true);
}
```

前端 `agent_run` executor 在 dispatch 前检查此 flag,返回
`budget_exhausted` 让 Leader 通知用户。

### §12.5 周报视图(R11)

```
desktop/src/components/TeamWeeklyCard.tsx (NEW)
   └─ 在 Pet Tab(desktop) 和 Me Tab(mobile mirror) 嵌入
   └─ 数据源:GET /api/multi-agent/weekly-summary?userId=...
                   返回 cron 缓存结果(R11.6)
```

```typescript
// API response
{
  weekStart: '2026-05-19',
  totalSubTasks: 47,
  totalCostUsd: 3.42,
  topPets: [
    { petId, name, avatar, count: 18, costUsd: 1.24 },
    { petId, name, avatar, count: 12, costUsd: 0.92 },
    { petId, name, avatar, count: 8, costUsd: 0.51 },
  ],
  topExpensiveSubTasks: [
    { taskId, title, costUsd: 0.89, completedAt },
    ...
  ],
}
```

### §12.6 Cron 聚合(R11.6)

```typescript
// agent-presence.scheduler.ts (extend)
@Cron('0 2 * * *') // daily 02:00 UTC+8
async aggregateTeamWeeklyForAllUsers() {
  const users = await this.userRepo.find({ where: { active: true } });
  for (const u of users) {
    const summary = await this.computeWeeklySummary(u.id);
    await this.cacheService.set(`team-weekly:${u.id}`, summary, 26 * 3600);
    // R15.3: also write per-pet productivity snapshot
    for (const petStat of summary.topPets) {
      await this.petProductivitySnapshotRepo.upsert({
        pet_id: petStat.petId,
        user_id: u.id,
        week_start: summary.weekStart,
        sub_tasks_completed: petStat.count,
        total_cost_usd_contributed: petStat.costUsd,
      });
    }
  }
}
```

### §12.7 CSV export(R11.4)

复用 `analytics` 模块的 CSV pattern:

```typescript
// GET /api/multi-agent/team-activity-report?userId=...&format=csv&days=30
// returns text/csv with columns:
// taskId,parentTaskId,actorAgentId,petName,role,startedAt,completedAt,costUsd,status,resultSummary
```



## §13 跨用户 A2A v2 占位 — schema 不锁路径(W7)

> 满足:R13 (v1 schema-only,v2 W7 functional)

### §13.1 v1 schema 已落地

`agent_tasks.target_kind` 接受 `'marketplace-hire'`,但 v1
`AgentTaskSpawnService.dispatch` 在该 kind 走到时 **return
`not_implemented_in_v1`**(R13.1):

```typescript
// agent-task-spawn.service.ts
if (dto.target === 'marketplace-hire') {
  this.analytics.track('marketplace_hire_attempted', { userId, role });
  throw new HttpException(
    {
      error: 'not_implemented_in_v1',
      message:
        'Marketplace hire is coming in v2 (Q3 2026). Your team will use ' +
        'a local anonymous sub-agent for now.',
    },
    HttpStatus.NOT_IMPLEMENTED,
  );
}
```

### §13.2 v1 不暴露任何 marketplace UI(R13.3)

- `AgentTeamPanel.tsx` Members grid 不显示 "find marketplace pet"
  按钮
- 主对话工具签名 `agent_run` 的 `target` enum 在 LLM 看到的
  description 里**不提 `marketplace-hire`**(避免 LLM 主动尝试)
- 但 schema 接受该值 — backend 防御(以防自定义客户端 / future
  prompt injection)

### §13.3 v2 W7 复用现有 escrow(R13.4)

后端 `pet-a2a` 模块已 ship 完整 escrow:
- `pet-a2a.controller.ts` 已有 `POST /api/pet-a2a/dispatch`
- `pet-a2a-dispatch.service.ts` 已有 escrow / settle / refund 三态机

v2 W7 只需把 `marketplace-hire` 分支接到 `pet-a2a-dispatch.service`,
**v1 不动 pet-a2a 任何代码**(隐性约束:本 design 在 v1 wave 不允许
任何 PR 改 `pet-a2a` 的 controller / service,以防意外 breaking)。

### §13.4 跨用户 actor 隔离(R13.5)

```sql
-- v1 schema 已通过 §2.2 新增 3 准备:
agent_tasks.hired_from_user_id        -- 卖方 user (v2 W7 写)
agent_cost_records.actorAgentId       -- 始终是执行 task 的 agent
                                      -- (v2 W7 时,marketplace hire 的 actor
                                      --  是卖方的 pet AgentAccount,跑在
                                      --  卖方的 device)
```

v1 schema 已支持 actor != owner 的语义,v2 W7 直接用。

## §14 World Engine 整合 (W6 optional) + Pet Arena 数据预留 (W8)

> 满足:R14 (W6) + R15 (W8)

### §14.1 World Engine 链路 task graph 化(R14.1, R14.2)

World Engine 现有 4 阶段链(`world-engine` 模块):

```
1. reconstruction         (扫描照片 → 3D mesh / point cloud)
2. ai-interpretation      (LLM 理解物体 → 角色蓝图)
3. character-generation   (生成 sprite + soul template)
4. battle-prep            (可选:挂入 battle queue)
```

R14.1 把每个阶段 emit 一个 `agent_spawn` event,共享 `parent_task_id =
worldEngineRunId`:

```typescript
// backend/src/modules/world-engine/services/world-engine.service.ts
async runScan(scanInput) {
  const wer = await this.worldEngineRunRepo.create({
    userId, source: scanInput.source,
  });
  // 4 stages 各 spawn 一个 agent_task
  for (const stage of ['reconstruction', 'ai-interpretation', 'character-generation', 'battle-prep']) {
    await this.agentTaskService.create({
      userId,
      title: `WE: ${stage}`,
      prompt: `Stage ${stage} for run ${wer.id}`,
      parent_task_id: null, // chain pattern: parent = previous stage
      target_kind: 'leader-direct', // not from a chat
      tier: 'cloud',
    });
    // 完成后再 spawn 下一个
  }
}
```

### §14.2 Agent_Team_Panel 渲染 task tree(R14.2)

`AgentTeamPanel.tsx` 在 `Active Sub-Tasks` 段下方加一个 `Task Graph` 折
叠区,显示 `parent_task_id` 形成的树:

```
Task Graph
  📷 World Asset Generation (run #abc123)
    ├── ✅ reconstruction (12s · $0.01)
    ├── 🔄 ai-interpretation (running · 45% · $0.08)
    ├── ⏸ character-generation (queued)
    └── ⏸ battle-prep (queued)
```

### §14.3 Simple Mode 折叠(R14.4)

Simple Mode 把 4 阶段折成一句:`📷 阿喵 正在让你的玩具变成游戏角色…`,
逻辑在 `TeamActivitySurface.tsx` 检测 `parent_task_id` 链,深度 ≥ 2 时
折叠展示 root + 当前 active stage。

### §14.4 Feature flag(R14.5)

```typescript
// backend/src/modules/world-engine/services/world-engine.feature-flag.service.ts
export const FLAG_MA_WE_VIZ = 'multi_agent_world_engine_visualization';
// 默认 false in v1;W6 sprint 切到 true
```

W6 是**可选 sprint**,如果资源紧 → flag 保持 false,v1 W1-W5 不
被影响。

### §14.5 Pet Arena 数据预留(R15.1, R15.2, R15.3)

**v1 写,v2 读**:

```typescript
// agent-presence.scheduler 已经在 §12.6 cron 里 upsert
// pet_productivity_snapshot 表(see §2.2 新增 7)
// v1 v1 此表持续填充;v2 W8 Arena 写一个 ladder query:

SELECT pet_id, SUM(sub_tasks_completed) as productivity_score
FROM pet_productivity_snapshot
WHERE week_start >= now() - interval '4 weeks'
GROUP BY pet_id
ORDER BY productivity_score DESC;
```

`world_engine.battle.mode` 的新 enum 值(`task_arena` /
`tournament` / `arena_room`)在 v1 落 migration **但 v1 代码永远不
写不读**(R15.1):

```typescript
// world-engine.battle.entity.ts
@Column({
  type: 'varchar',
  length: 16,
  default: 'duel',
})
mode: 'duel' | 'task_arena' | 'tournament' | 'arena_room';
// v1 always writes 'duel'
```

### §14.6 v1 UI 不提 Arena(R15.4)

- `AgentTeamPanel` 不展示 ladder
- `Pet 详情页` 不展示 productivity_score
- `Worktree` 不展示 `subject_kind` 字段
- 任何文案不提 `Arena` / `PvP` / `competition`

### §14.7 v2 W8 Tab 占位(R15.5)

`AgentTeamPanel` panel header 已在 §5.8 留 `<TabBar>` 结构,v2 W8 直
接加:

```jsx
<TabBar>
  <Tab key="active" label="Active" /> {/* v1 only */}
  <Tab key="arena" label="Arena" />   {/* v2 W8 */}
  <Tab key="ladder" label="Ladder" />  {/* v2 W8 */}
</TabBar>
```

不需要 panel 重构。

---

## §15 决策记录(等 PM 拍板的 5 个 open question)

引用 [`MULTI_AGENT_PRIORITIZATION §7`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md#7-open-questions等-pm-拍板)
的 5 个 open question,本 design 暂以**默认决策**前进,任意改动需在
本 §15 记录:

| # | 问题 | 默认决策(本 design) | 改动入口 |
|---|------|----------------------|----------|
| 1 | 选项 A vs B vs C | **A:1 个 spec,v1 = W1-W5,Arena W8** | 已 PM 拍板,不可改 |
| 2 | Simple Mode 团队工作球放哪 | CompanionBall 加 badge(§9.1)— 不在 Pet Tab 顶部 | §9.1 改 component |
| 3 | LivingPet 接 AgentAccount 是否需要重新 approval | **是** — 第一次 bind 弹一次 "你的宠物现在能花钱了" approval modal,后续无 | §11.2 加 approval gate |
| 4 | 经济周报放 Me Tab 还是 Pet Tab | **两个都放**(R11.1)— 不挑场所,Pro 用户哪个 tab 都看到 | §12.5 |
| 5 | v2 W8 Pet Arena 默认 opt-in 还是 opt-out | **opt-in**(PvP feasibility doc §8.2 倾向已确认) | v2 W8 spec(本 spec 不决定) |

---

## §16 实现路径速查(给 tasks.md 参考)

每个 R → 对应代码改动文件清单(供 tasks.md 拆 wave):

| R | Files (NEW = ★, EXTEND = △) |
|---|------------------------------|
| R1 | △ `desktop/src/services/agentTools/registry.ts`<br>★ `desktop/src/services/spawnTool.ts`<br>★ `backend/src/modules/agent-task/agent-task-spawn.service.ts`<br>★ `shared/types/agent-tools.ts`<br>★ migration: `parent_task_id` + `target_kind` + `hired_from_user_id` |
| R2 | △ `desktop/src/components/TaskTimeline.tsx`<br>★ `desktop/src/components/AgentEventCard.tsx`<br>△ `MessageBubble.tsx` (anchor markdown plugin)<br>△ `agent-task.worker.ts` emit 3 event kinds |
| R3 | ★ `desktop/src/components/AgentTeamPanel.tsx`<br>★ `desktop/src/components/AgentIdentityCard.tsx`<br>★ `desktop/src/services/agentTeam.ts`<br>△ `chatPanel/ChatTitleBar.tsx` (More menu 加项)<br>△ `TaskWorkbenchPanel.tsx` (隐藏 Sandbox section) |
| R4 | △ `desktop/src/components/WorktreePanel.tsx`<br>★ migration: `worktree_lanes` table<br>★ `backend/src/modules/worktree-lane/`<br>★ `desktop/src/services/worktreeLanes.ts`<br>△ `agent-task.worker.ts` auto-link |
| R5 | △ `desktop/src/components/PetCompanionWindow.tsx` (badge)<br>★ `desktop/src/components/TeamActivitySurface.tsx`<br>★ `desktop/src/services/teamActivityStore.ts`<br>△ `desktop-sync.companion-presence` 通道补 event |
| R6 | △ `backend/src/modules/agent-team/agent-team.service.ts` `selectMember()` |
| R7 | ★ migration: `living_pets.bound_agent_account_id`<br>△ `backend/src/modules/agent-team/agent-team.controller.ts` `bindPets()` |
| R8 | ★ `desktop/src/components/MemberSettingsModal.tsx`<br>△ `AgentIdentityCard.tsx` Edit button (Pro only)<br>△ `pet-team.controller.ts` PATCH 加 budget cap 检查 |
| R9 | △ `useStreamingTurn.ts` background mode 30s 阈值<br>△ `desktop-sync.companion-presence` SubTaskCompleted/Stalled events<br>△ `agent-presence.scheduler` 60min stalled detection |
| R10 | △ `cost-tracker.service.ts` parent_task_id passthrough<br>★ migration: `agent_cost_records.parent_task_id` + `event_type` |
| R11 | ★ `desktop/src/components/TeamWeeklyCard.tsx`<br>★ `desktop/src/components/TeamActivityReportPanel.tsx`<br>★ `backend/src/modules/multi-agent-summary/` (NEW)<br>△ `agent-presence.scheduler` daily aggregation cron |
| R12 | ★ `desktop/src/components/ConflictResolverModal.tsx`<br>★ `backend/src/modules/pet-team-coordinator/` (NEW)<br>△ `WorktreePanel.tsx` rollback / conflict UI<br>△ `agent-task.worker.ts` validateScope |
| R13 | △ schema-only(已在 R1 migration 落)<br>△ `agent-task-spawn.service.ts` 拒绝 marketplace-hire |
| R14 | △ `world-engine.service.ts` 4-stage spawn agent_spawn events<br>△ `AgentTeamPanel.tsx` Task Graph rendering<br>△ feature flag `multi_agent_world_engine_visualization` |
| R15 | ★ migration: `pet_productivity_snapshot` + `world_engine.battle` mode/subject_kind 扩展<br>△ `agent-presence.scheduler` 写 productivity snapshot |

---

## §17 Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| R1 spawn 被 LLM 滥用导致 fan-out > 4 | 用户体验:卡死 | R1.4 hard cap 4 concurrent + spawn_rate_limited error |
| 长任务 60min 没完 用户失联 | 用户怀疑 app 坏了 | R9.5 stalled detection + amber pulse + 3 选项 |
| LivingPet bind AgentAccount 之后用户卸载 app | 历史 cost 引用悬挂 | R7.5 不删 AgentAccount,只 nullify pet 的 binding |
| MarketplaceHire 在 v1 prompt 里被 LLM 试 | 重复 attempt 浪费 LLM token | R13.1 backend reject + analytics 计数,LLM description 不提 |
| Worktree 表迁移 vs 老 localStorage 冲突 | 数据丢失 | bulk-import idempotent + localStorage 仅 cache,not source-of-truth |
| Cost tracking failure 导致 task 失败 | 任务卡住 | R10.4 best-effort + DLQ |
| Simple Mode 用户被 ambient ball 烦 | 卸载率上升 | R5.2 仅在 active sub-tasks > 0 时 badge 显示;无任务时 silent |
| World Engine W6 资源不够 | v1 W1-W5 受拖累 | R14.5 feature flag,W6 默认 OFF,v1 不依赖 |

---

## §18 Out of scope(明确写出来)

- 多 leader chat(用户同时和 N 个 leader 对话)— v3
- Cross-device sub-task 在用户手机/桌面 split 跑 — v3 post-launch
- Sub-agent 通过 chat 直接和用户对话(skip Leader)— **永不**(违反核心原则 1)
- LLM-judge agent / 评分 agent 角色 — 进 W8 时再加
- Sub-task 之间互相调用(member spawn member)— v3,v1 单向 Leader → member
- 自定义 sub-task tools(用户写 Python plugin)— 走 marketplace plugin 路径
- A/B 测试不同 leader persona 的效果 — analytics 只记录,UI v3
- 备份 / 还原整个 team 配置 — 沿用现有 settings export

---

## §19 验收

design.md 落地后 **PM signoff** 需要:

1. ✅ 所有 R1-R15 在 design 中至少 1 段对应内容(§3-§14)
2. ✅ 数据模型(§2)对每个新增字段 / 表给出 SQL DDL
3. ✅ §16 给 tasks.md 提供 wave 拆解的 file-level guide
4. ✅ Open question 5 个都有默认决策(§15)
5. ✅ Risk register 8 项有 mitigation(§17)

design 通过 → 开 tasks.md(W1-W8 + sub-tasks)。

---

## 关联 commits / branches

- 起草分支: `perf/desktop-pre-launch-p1`
- W1 sprint 切: `feat/multi-agent-w1-ui-exposure`(待 W1 启动)
- W2 sprint 切: `feat/multi-agent-w2-spawn-protocol`
- W3 sprint 切: `feat/multi-agent-w3-pet-bridge`
- W4 sprint 切: `feat/multi-agent-w4-long-tasks`
- W5 sprint 切: `feat/multi-agent-w5-economy-reliability`

每个 wave 一个 sprint(launch+30-60 天 总 v1)。

