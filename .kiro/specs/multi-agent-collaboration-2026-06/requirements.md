# Requirements Document

> **Spec**: `multi-agent-collaboration-2026-06`
> **Sprint**: Post-launch P0(launch+30-60 天)
> **Branch**: 主开发分支由各 wave sprint 切;requirements + design 在
>   `perf/desktop-pre-launch-p1` 起草并 push
> **Predecessor**: `positioning-revision-2026-05/`(已落地);
>   `pro-mode-coding-views-2026-05/`(进行中)
> **Related Docs**:
> - `docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md`
> - `docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md`
> - `docs/GAMES_INVENTORY_2026-05-25.zh-CN.md`

## Introduction

Agentrix 定位文档 §3.2 A_Path 第 4 项已经把 **"多 agent 协作"**列为命名
差异化,但产品里**没有落地完整 v1**。当前桌面端虽然零散有
`WorktreePanel` / `TaskWorkbenchPanel` 里的 Agent Team Sandbox MVP /
`TaskTimeline` 的 sub-agent 事件类型,后端有完整的 `agent-team`
provision API + `agent-task` worker + `pet-team` + `pet-a2a` — 但是
**主对话里 leader agent 没有调用入口**,**agent 的协作过程不可见**,
**Simple Mode 用户完全看不到团队在干活**。

本 spec 把"多 agent 协作"作为**帮用户干活**的核心能力交付:用户始终
和**一个主导 agent**对话(leader),leader 在后台把任务派给 sub-agent
或 team member 完成,过程**可见、可控、可观察**,而**不是把多 agent
当游戏 / Arena**(Arena 是 W8 在同一个底座上的衍生 mode)。

**核心设计原则**:

- **不在主 chat 里渲染多 agent 对话** — 用户看到的永远是 leader 的回
  复;sub-agent 的工作以 timeline 卡 + 单独 lane 的形式呈现,而不是消
  息流。
- **leader 是用户选择的**(主宠 / 默认 agent),member 是用户养的其他
  pet 或 marketplace 雇佣的 agent。
- **每一个 sub-task 都必须可视化** — 哪只 pet/agent 在干哪件事 / 进
  度多少 / 花了多少 token / 结果是啥 — 这是非编程友好的关键。
- **任务隔离用 git worktree + 跨设备 lane**(已 ship)。
- **协作可观测,不是黑盒** — Codex / Composer 隐藏 sub-agent 让用户怀
  疑"是不是真的多 agent",我们让协作 _被看到_。
- **经济属性是默认就 enabled 的** — 每次 sub-task 完成自动写
  `agent_cost_records`,用户在 Pro Mode 能看到周报。
- **跨用户 A2A 必须有 audit + 隐私边界** — 不在 v1 默认开,W7 v2 才
  开放 marketplace 雇佣。

## Glossary

> 词表统一使用,后续 design.md / tasks.md 引用同名 term 即可。

- **Leader_Agent**:用户**主对话**的对象。在 v1 它就是当前 chat 的主
  agent(单个 persona / pet 灵魂),在 v3 之后可由用户为不同 task 临
  时切换。Leader 是 spawn 决策的发起者。
- **Sub_Agent**:Leader 临时 spawn 出来执行一个 sub-task 的 worker。
  分两种:**Anonymous Sub-Agent**(无 pet 身份,任务结束销毁)和
  **Named Member Sub-Agent**(有 pet/agent 身份,从 team member 选)。
- **Agent_Team**:用户拥有的 agent 集合,有一个 Leader 和 0-N 个
  Member。基于现有 backend `agent-team` 模块的 provision 概念扩展。
- **Pet_Member**:Living Pet 作为 Agent_Team 里的 Member,具体形态是
  LivingPet entity 在 v1 sprint 里桥接到 AgentAccount(W3 落)。
- **Sub_Task**:Leader 派出的一个独立工作单元,有自己的 prompt /
  tools scope / budget / 期望产出。后端用现有 `agent-task` entity 承
  载,新增 `parent_task_id` 字段串成 task graph。
- **Worktree_Lane**:已 ship 的 `WorktreePanel` 里一条 lane = 一个
  git worktree branch + 一个 sub-task。v1 给每条 lane 加上
  `agent_id` 显示。
- **Agent_Team_Panel**:从 `TaskWorkbenchPanel` 里的 "Agent Team
  Sandbox" 提出来的顶层独立 panel,显示当前 Team 的全景(Leader +
  Member + 进行中的 task graph)。
- **Spawn_Tool** (`agent_run`):Leader 主对话能直接调用的内部工具,
  签名 `agent_run(role, prompt, scope, budget)`。后端最终 dispatch
  到 `agent-task.create()`。
- **Sub_Agent_Event**:Timeline 里专门表达 sub-agent 生命周期的事件,
  已 ship 的 kinds 是 `agent_spawn` / `agent_invoke` / `agent_result`。
- **Team_Activity_Surface**:Simple Mode 不显示 worktree / lane 详情,
  但要给非编程用户一个**ambient 信号**:一个浮球 / 角标 / Pet Tab 顶
  部小卡,告诉他"团队正在干 X 件事,完成 Y 件"。
- **Task_Graph**:从一次主对话发起的 sub-task 形成的 DAG(tree 居
  多)。design.md 会决定是否把 Task_Graph entity 化,还是在
  `agent_task` 上加 `parent_task_id` 软维护。
- **Agent_Identity_Card**:每个 agent / pet 显示在 lane 边上的小卡
  (头像 emoji / 名字 / role / 当前状态 dot)。

## Design Constraints / Tradeoff Notes

> 解释下文 Acceptance Criteria 里关键魔法数字与硬性约束的来源,避免
> design 阶段无从权衡。

- **Sub_Task 数量上限 = 8**:WorktreePanel 在 27 寸 4K 显示器上目测能
  容纳 8 条 lane 不滚动,SubAgent 事件流在 timeline 上 8 条以内不爆;
  超过则用户跟丢。**这是 v1 上限,v2 可以放开 + 折叠**。
- **Sub_Task 默认 budget = $1 USD per spawn**:当前
  `agent_cost_records` 里普通 chat 的 P95 单轮成本 ~$0.18,留 5x 余量
  覆盖多步 reasoning;超过 budget 则 leader 收到 `budget_exceeded` 事件
  并主动询问用户。
- **Spawn fan-out 上限 = 4 并发**:与现有 BullMQ 默认 concurrency 5 一
  致,留 1 给 chat 主线;避免一次 spawn 拖死 LLM 配额。
- **Anonymous Sub-Agent 无状态 = 必须**:跑完销毁所有 context;否则
  长会话会无限累积 sub-agent。这复刻 Claude Composer 的设计(用户始
  终对话主 leader)。
- **Member 派活时必须 role 匹配**:Leader 决定 spawn 时调用
  `selectMember(role)`;若 team 里没有匹配 role,fall back 到
  Anonymous Sub-Agent(v1)或询问用户雇佣 marketplace pet(v2)。
- **Simple Mode 不暴露 worktree**:Simple 用户看不到 lane / branch /
  diff;只看到 ambient 球 + 一句话总结。Pro 才有完整可视化。
- **Pet Quota 沿用 WorkspacePlan**:FREE=3 / PRO=10 / BUSINESS=50 /
  ENTERPRISE=200,见 `backend/src/modules/workspace/workspace.service.ts`。
  Pet_Member 和现有 Pet/Agent 共享同一额度。

## Requirements

> **Part 1 — Foundation & Visibility (R1-R5)** is the only segment in
> this revision. Parts 2-4 will land in follow-up commits. Each
> requirement below is independently spec-complete (User Story +
> EARS-style ACs) so design.md / tasks.md can begin against Part 1
> alone.

### Requirement 1: Leader 主对话可以 spawn sub-agent

**User Story:** As a user chatting with my main agent (Leader), I want
the Leader to spawn a sub-agent for a sub-task without leaving the
chat, so that complex multi-step work gets done in the background while
I continue talking to the Leader naturally.

#### Acceptance Criteria

1. WHEN the Leader_Agent's system prompt assembly runs in Pro or
   Standard mode, THE chat pipeline SHALL include a `Spawn_Tool` named
   `agent_run` in the Leader's tool list with the signature
   `agent_run(role: string, prompt: string, scope?: object, budget_usd?: number)`.
2. WHEN the Leader_Agent calls `agent_run`, THE chat pipeline SHALL
   create a new Sub_Task via `POST /api/agent-tasks` with
   `parent_task_id` set to the current chat's primary task id and
   shall return a `subTaskId` to the Leader inline within 1 second of
   the dispatch call.
3. WHEN the Leader_Agent calls `agent_run` in Simple mode, THE chat
   pipeline SHALL silently allow the call but SHALL NOT expose any
   tool-call UI to the user; the Sub_Task progress is shown via the
   Team_Activity_Surface (R5) instead.
4. THE `Spawn_Tool` SHALL enforce a hard cap of 4 concurrent in-flight
   Sub_Tasks per Leader (Spawn fan-out 上限 = 4) — additional spawn
   calls receive a `spawn_rate_limited` error with retry guidance the
   Leader can surface to the user.
5. THE `Spawn_Tool` SHALL apply a default `budget_usd = 1.00` if the
   Leader did not specify one and SHALL reject any `budget_usd > 10`
   without explicit user approval (approval flow defined in R8).
6. WHEN the Leader spawns more than 8 active Sub_Tasks in the same
   chat session (cumulative, not concurrent), THE chat pipeline SHALL
   warn the Leader inline: "you've delegated 8 sub-tasks; consider
   waiting for results before spawning more" and shall require explicit
   user "continue" acknowledgement before allowing the 9th spawn.

### Requirement 2: Sub-agent 工作过程在 Timeline 可见

**User Story:** As a user, I want to see what sub-agents are doing
without leaving the chat, so that I trust the Leader actually delegated
work to real workers and I can intervene if anything looks wrong.

#### Acceptance Criteria

1. WHEN a Sub_Task is created via R1, THE TaskTimeline SHALL emit a
   `agent_spawn` event card showing the sub-agent's role, the abridged
   prompt (first 80 chars), and a "running" status spinner.
2. WHILE a Sub_Task is in `running` state, THE TaskTimeline SHALL emit
   `agent_invoke` event(s) at each tool call the Sub_Task makes,
   collapsed by default so the user sees the count, not the noise.
3. WHEN a Sub_Task completes (success or failure), THE TaskTimeline
   SHALL emit a `agent_result` event card showing duration, total cost
   (USD, sourced from `agent_cost_records`), and a one-line summary.
4. WHEN the user clicks an `agent_spawn` / `agent_invoke` /
   `agent_result` event card, THE UI SHALL navigate to the relevant
   Worktree_Lane (R4) so the user can see the underlying file changes /
   diff / log without re-opening the panel manually.
5. IF a Sub_Task fails or is cancelled, THE `agent_result` card SHALL
   render in red and SHALL include the error message + a "retry" /
   "rollback" button (rollback wired in Part 4 R12).
6. THE Leader_Agent's main-chat reply SHALL reference Sub_Tasks by an
   inline anchor like `[sub-task #3]` that links to the corresponding
   timeline event card; the user SHALL be able to scroll the timeline
   from the chat by clicking the anchor.

### Requirement 3: Agent Team Panel 提到顶层

**User Story:** As a user (Pro mode programmer or Standard mode product
manager), I want to open an "Agent Team" panel from a top-level entry
point, so that I can see who's on my team, who's leader, and who's
working on what right now.

#### Acceptance Criteria

1. THE ChatTitleBar More menu SHALL include a top-level item "🤖 Agent
   Team" / "Agent 团队" with `tier: "standard"` (visible in Standard
   AND Pro; not Simple).
2. WHEN the user clicks the item, THE Agent_Team_Panel SHALL open as a
   side panel (NOT a full-screen workbench) showing three sections:
   (a) **Leader** card with the current main agent's identity card,
   (b) **Members** grid (0-N cards, each is an Agent_Identity_Card),
   (c) **Active Sub_Tasks** list grouped by member.
3. THE Agent_Team_Panel content SHALL be sourced from
   `GET /api/agent-teams/:id`, which is the existing endpoint;
   no new backend API is required for v1.
4. THE Agent_Team_Panel SHALL allow the user to "promote a member to
   leader" via right-click — this dispatches `PATCH /api/agent-teams/
   :id/leader` (existing endpoint).
5. WHILE the Agent_Team_Panel is open, THE existing "Agent Team
   Sandbox (MVP)" subsection inside `TaskWorkbenchPanel` SHALL hide
   its Planner/Coder/Reviewer cards (they are now duplicated by R3.2);
   `TaskWorkbenchPanel` keeps its other subsections unchanged.
6. IF the user has not yet provisioned a team, THE Agent_Team_Panel
   SHALL render a "Provision from template" CTA listing the existing
   `agent-team` templates (CEO/Architect/Coder/Reviewer 11-agent +
   any user templates).
7. WHEN the user provisions a team via the CTA, THE existing
   `POST /api/agent-teams/provision` endpoint SHALL be called with the
   selected template; on success the panel SHALL refresh within 2
   seconds.

### Requirement 4: WorktreeLane 显示 agent 身份

**User Story:** As a Pro mode user with multiple sub-agents working in
parallel, I want each Worktree lane to show which agent owns it, so I
can tell at a glance who's editing which branch.

#### Acceptance Criteria

1. THE WorktreeLane data model SHALL be extended with an optional
   `agent_id` field (nullable for human-owned lanes).
2. WHEN a Sub_Task is created via R1 with a worktree-creating tool
   call, THE backend SHALL auto-link the resulting Worktree_Lane to the
   Sub_Task's `agent_id`.
3. THE WorktreePanel rendering SHALL show an Agent_Identity_Card on
   the left of each lane whose `agent_id` is set: avatar emoji
   (16×16) + name (max 20 chars) + role tag + status dot
   (running/idle/done/error).
4. WHEN the user clicks an Agent_Identity_Card on a lane, THE UI SHALL
   open the Agent_Team_Panel filtered to that agent's active Sub_Tasks.
5. THE Agent_Identity_Card status dot SHALL update via the existing
   WebSocket task-status stream within 2 seconds of an underlying state
   change in `agent_task`.

### Requirement 5: Simple Mode 也能感知"团队在工作"

**User Story:** As a Simple mode user (non-coder), I want a friendly,
ambient way to know my pet team is working on something for me without
seeing worktree / branch / diff details, so that I feel cared-for
rather than overwhelmed.

#### Acceptance Criteria

1. WHEN the Leader_Agent has at least 1 active Sub_Task AND user mode
   is Simple, THE Companion_Ball (existing P9 redesign) SHALL display a
   small badge showing `N` active sub-tasks (capped at "9+") and a
   subtle "working" pulse animation.
2. WHEN the user taps the badge in Simple mode, THE UI SHALL open the
   Team_Activity_Surface — a non-technical full-screen view containing:
   (a) an emoji-driven progress timeline ("🦊 阿喵 in progress…
   reading 5 files"), (b) plain-language one-line summaries (no
   filenames / diff / branch names), (c) an "ask Leader for an
   update" button.
3. WHEN all Sub_Tasks complete in Simple mode, THE Companion_Ball
   SHALL emit a one-time success animation and SHALL push a single
   plain-language summary line to the chat as the Leader (e.g., "🦊
   阿喵 整理了 5 个文件,我已经准备好了。要看看吗?").
4. THE Team_Activity_Surface SHALL never expose `agent_id`,
   `parent_task_id`, branch names, file paths, or USD amounts to
   Simple mode users; those are Pro-only details.
5. IF a Sub_Task fails in Simple mode, THE Team_Activity_Surface SHALL
   show a friendly recovery prompt ("阿喵 卡住了 — 要让另一只宠物试
   试吗?") with "yes" / "no" buttons that map to retry / abort
   without exposing the error stack.
6. THE Companion_Ball badge in Simple mode SHALL update its count
   within 3 seconds of an underlying `agent_task` state change, using
   the existing P9 desktop-sync presence channel rather than a new
   websocket.

---

## Requirements — Part 2: Pet Bridge & Roles (R6-R8)

> 本段范围:把 Living Pet 接到 multi-agent collaboration,让 Leader
> 能优先把 sub-task 派给具名的 pet member 而不是 anonymous sub-agent;
> Pro Mode 用户能编辑每只 pet 的 role / scope / budget。**v1 Wave 3
> 落地。**

### Requirement 6: Leader 优先派活给 pet member

**User Story:** As a user with multiple Living Pets in my Agent Team,
I want my Leader to prefer one of my own pets over an anonymous
sub-agent when delegating a sub-task whose role matches a pet's
declared skills, so that my pets get the work (and the XP / token
spend / reputation) instead of being bypassed.

#### Acceptance Criteria

1. WHEN the Leader_Agent calls `agent_run(role, prompt, …)` AND the
   user has a Pet_Member in the Agent_Team whose declared role
   includes `role` (case-insensitive substring match), THE backend
   `selectMember(role)` resolver SHALL pick that Pet_Member as the
   target Sub_Agent rather than spawning an Anonymous Sub-Agent.
2. WHEN multiple Pet_Members match the same role, THE selector SHALL
   pick the one with the **lowest current in-flight Sub_Task count**;
   ties broken by **highest reputation score** from
   `agent_account.reputation`; further ties broken by `created_at`
   ascending (oldest pet wins).
3. IF no Pet_Member matches the role, THE selector SHALL fall back to
   spawning an Anonymous Sub-Agent (the v1 default behaviour from R1).
4. WHEN a Pet_Member is selected as Sub_Agent target, THE
   `agent_spawn` event card (R2.1) SHALL render the pet's avatar +
   name + clan emoji instead of the generic "🤖 sub-agent" icon.
5. THE selector SHALL be implementable as a single backend service
   method that wraps existing `pet-team` `listMembers()` +
   `agent-account.find()` queries; it SHALL NOT introduce a new
   entity in v1.
6. IF the matched Pet_Member is in `paused` or `disabled` state (per
   existing pet-team scope flag), THE selector SHALL skip it as if it
   did not match the role.

### Requirement 7: LivingPet ↔ AgentAccount 桥接

**User Story:** As a Pet owner, I want my Living Pet to be reusable as
an Agent_Team Member with the same identity (avatar / name /
intimacy_xp / wallet), so that the work my pet does in the team
contributes to its long-term growth instead of creating a parallel
disembodied "agent identity".

#### Acceptance Criteria

1. THE LivingPet entity SHALL be extended with an optional
   `bound_agent_account_id` field (nullable, FK to
   `agent_accounts.id`) representing the AgentAccount this pet acts
   as when it serves as a Sub_Agent.
2. WHEN the user provisions an Agent_Team via R3.6 AND selects "use my
   pets as members", THE backend SHALL ensure each selected
   LivingPet has a matching AgentAccount: if `bound_agent_account_id`
   is null, create an AgentAccount with `displayName = pet.name`,
   `avatarUrl = pet.thumbnail_url`, `personaConfig` derived from the
   pet's `soul_template_id`, and persist the back-reference on
   LivingPet.
3. WHEN a Sub_Task is dispatched to a Pet_Member (R6), THE backend
   SHALL write `agent_cost_records.actorAgentId =
   pet.bound_agent_account_id` AND SHALL increment
   `living_pet.intimacy_xp` by the existing per-task XP formula on
   completion.
4. IF a Pet's wallet balance is below the Sub_Task budget AND the user
   has linked the pet to a personal wallet (`spending_limits.source =
   'owner'`), THE backend SHALL deduct from the owner wallet up to
   `daily_budget_usd`; otherwise the dispatch SHALL be rejected with
   `pet_budget_exceeded` and bubble back to the Leader.
5. THE binding SHALL be reversible: a `DELETE
   /api/v1/pet/team/:parentLivingPetId/members/:memberId` call (the
   existing endpoint) SHALL set the LivingPet's
   `bound_agent_account_id` to null but SHALL NOT delete the
   AgentAccount itself (the pet may have historical
   `agent_cost_records` referencing it).
6. WHEN a user views a Pet detail screen in Simple Mode, THE binding
   status SHALL be surfaced as a friendly badge ("🤖 也是我的工作伙伴")
   without exposing the AgentAccount technicality.

### Requirement 8: Pro Mode 可编辑 role / scope / budget / model tier

**User Story:** As a Pro mode programmer, I want to manually edit each
member pet's role, allowed tools (scope), daily budget, and preferred
model tier, so that I can tune cost / latency / capability for my
specific workload without going through the Leader.

#### Acceptance Criteria

1. WHEN the user is in Pro mode AND opens an Agent_Identity_Card
   (R3.2 / R4.4), THE card SHALL expose an "Edit" button that opens
   a Member_Settings_Modal.
2. THE Member_Settings_Modal SHALL allow editing the following fields,
   each with the listed validation:
   (a) **role** — string, 1-30 chars, lowercase preferred
   (b) **scope.tools** — multi-select from the agent's tool registry
       (existing `tool-registry` module catalogue); at least 1 tool
       required
   (c) **scope.workspace_paths** — array of glob patterns scoped to
       current workspace; supports negative globs (`!secrets/**`)
   (d) **daily_budget_usd** — number, 0.10–100, default 1.00
   (e) **preferred_model_tier** — enum `local | smart | cloud`
       (sourced from existing `tier-router` module)
3. WHEN the user clicks "Save", THE UI SHALL call existing endpoint
   `PATCH /api/v1/pet/team/:parentLivingPetId/members/:memberId` with
   the updated scope / daily_budget_usd / display_name / role; on
   success the card SHALL refresh within 2 seconds.
4. IF the new `scope.tools` list is missing a tool that the pet
   currently has an in-flight Sub_Task using, THE save SHALL succeed
   but the in-flight task SHALL run to completion under the OLD scope;
   only future spawns use the new scope.
5. THE Member_Settings_Modal SHALL show a per-field "reset to default"
   button that restores the value from the team's source template
   (existing `agent_team_template.roles[].defaultScope`).
6. THE Member_Settings_Modal SHALL NOT be visible in Simple or
   Standard mode; non-Pro users edit team composition only via R3.6
   (template provisioning) and R3.4 (promote to leader).
7. IF the user attempts to set a `daily_budget_usd` that exceeds their
   subscription tier's per-pet cap (FREE=$2 / PRO=$20 / BUSINESS=$200
   / ENTERPRISE=unlimited), THE save SHALL be rejected with a clear
   inline message including the current tier's cap and an upgrade CTA.

---

## Requirements — Part 3: Long Tasks & Economy (R9-R11)

> 本段范围:让长 task 在用户关掉 chat / 切桌面 / 锁屏 时仍跑;完成
> 时通过 companion ball / 锁屏 / push 回流;每个 sub-task 自动写经济
> 记录,Pro Mode 用户能看周报。**v1 Wave 4 + Wave 5 落地。**

### Requirement 9: 长任务后台执行 + 多通道回流

**User Story:** As a busy user, I want to delegate a long sub-task to
my pet team, close the chat / lock my desktop / switch to mobile, and
get a friendly notification when it completes, so that multi-agent
collaboration is actually useful for tasks that take 5-30 minutes
rather than only short ones I can babysit.

#### Acceptance Criteria

1. WHEN a Sub_Task's wall-clock duration crosses 30 seconds AND the
   chat is the foreground window, THE chat pipeline SHALL convert
   the task to "background mode" by enqueueing it on the existing
   `agent-task` BullMQ worker and detaching the in-chat spinner;
   the timeline event card from R2 stays visible.
2. WHILE a Sub_Task is in background mode AND the user closes the
   chat or minimizes the desktop window, THE Sub_Task SHALL continue
   executing without interruption.
3. WHEN a backgrounded Sub_Task completes successfully, THE backend
   SHALL emit a `SubTaskCompleted` event on the existing
   `desktop-sync.companion-presence` channel; the desktop
   Companion_Ball SHALL pulse green and SHALL show a one-line summary
   tooltip on hover.
4. WHEN a backgrounded Sub_Task completes AND the desktop client is
   asleep / locked, THE backend SHALL deliver the same notification
   via:
   (a) the existing **lock-screen pet** push channel (P9 redesign,
       `desktop-sync.lock-screen-pet`),
   (b) the existing **mobile push** channel for the user's registered
       devices (`device-registry` module).
   The mobile push payload SHALL deep-link to the relevant Sub_Task
   detail (`agentrix://multi-agent/sub-task/:id`).
5. IF a backgrounded Sub_Task exceeds 60 minutes wall-clock without
   completing, THE backend SHALL emit a `SubTaskStalled` event on the
   same channels; the Companion_Ball SHALL pulse amber and offer
   "abort" / "extend +30min" / "ask Leader to pivot".
6. WHEN the user clicks the Companion_Ball badge AND there are
   completed Sub_Task results not yet acknowledged, THE Leader chat
   SHALL inject a single message summarizing all unacknowledged
   completions (one bullet per Sub_Task, abbreviated, with
   `[sub-task #N]` anchors per R2.6).
7. THE timeout / retry / cancel semantics for backgrounded tasks SHALL
   match the existing `agent-task` policy (cancellable via existing
   `POST /api/agent-tasks/:id/cancel` endpoint); no new cancellation
   API is introduced.

### Requirement 10: 经济记账 — 每个 sub-task 自动写 agent_cost_records

**User Story:** As a user (Simple or Pro), I want every sub-task my
pet team runs to be tracked in a single source of truth for cost, so
that I never get a "surprise bill" from multi-agent and so that pet
owners earn fair credit for the work their pets do.

#### Acceptance Criteria

1. WHEN a Sub_Task makes any LLM API call OR third-party tool call
   that incurs cost, THE `agent-task` worker SHALL write one row to
   `agent_cost_records` per call with the standard schema fields:
   `userId`, `actorAgentId`, `parentTaskId` (the Sub_Task's id),
   `providerName`, `tier`, `estimatedCostUsd`, `latencyMs`, `tokens`.
2. WHEN a Sub_Task is dispatched to a Pet_Member (R6 / R7), THE
   `actorAgentId` SHALL be `pet.bound_agent_account_id`; for
   Anonymous Sub-Agents it SHALL be the user's primary AgentAccount.
3. WHEN a Sub_Task completes (success, failure, or cancellation), THE
   worker SHALL write one final `agent_cost_records` row with
   `eventType = 'sub_task_complete'` summing the Sub_Task's total
   cost; this row SHALL be the canonical "cost of this sub-task"
   reference for UI surfaces.
4. THE write path SHALL be best-effort: if `agent_cost_records` is
   unavailable, THE Sub_Task itself SHALL NOT fail; the
   `cost_log_failed` event SHALL be emitted to the existing
   `cost-tracker` module's dead-letter queue for later replay.
5. THE write path SHALL not be opt-out via Pro/Simple Mode toggle:
   tracking is always on (per design constraint above).
6. WHEN a single chat session's accumulated `estimatedCostUsd` from
   multi-agent dispatches crosses 80% of the user's daily budget,
   THE backend SHALL emit a `BudgetWarning` event the Leader can
   surface to the user inline; at 100% the Leader SHALL refuse
   further `agent_run` calls until the user acknowledges.

### Requirement 11: Pro Mode 周报 — 团队工作总览

**User Story:** As a Pro mode user, I want a weekly summary of what
my agent team did, how much it cost, and which pets contributed, so
that I can decide whether to upgrade my plan, swap pets in/out, or
adjust budgets without manually parsing `agent_cost_records`.

#### Acceptance Criteria

1. THE existing **Me Tab** (mobile) AND **Pet Tab** (desktop) SHALL
   each render a "Team Weekly" card visible to Pro mode users only
   (filtered by `useUserMode() === 'pro'`).
2. THE Team_Weekly card SHALL aggregate the past 7 days of
   `agent_cost_records` rows where `parentTaskId` was a Sub_Task and
   render the following metrics:
   (a) **Total Sub_Tasks** completed
   (b) **Total cost in USD**
   (c) **Top 3 contributing pets** by Sub_Task count, each with
       avatar + name + count + cost
   (d) **Top 3 most expensive Sub_Tasks** with title + cost + date
3. THE Team_Weekly card SHALL link to a full **Team_Activity_Report**
   panel (Pro Mode only) showing the same data with filtering by
   pet / date range / Sub_Task status.
4. THE Team_Activity_Report SHALL allow exporting the past 30 days of
   Sub_Task records as CSV (existing `analytics` module supports CSV
   download patterns; reuse rather than rebuild).
5. WHEN the user is in Simple Mode, THE Team_Weekly card SHALL NOT
   render; instead a single one-line summary appears in Pet Tab top
   strip ("本周阿喵帮你完成了 12 件事 ✨") with no USD / token /
   technical details.
6. THE Team_Weekly aggregation query SHALL execute on a daily cron
   (existing `agent-presence.scheduler`) and cache the result per
   user; live UI reads the cache and refreshes on Pro Mode entry,
   not per-render.
7. IF a user has zero Sub_Tasks in the past 7 days, THE Team_Weekly
   card SHALL render a friendly empty state ("还没派活 — 试试问主宠
   '帮我整理一下昨天的笔记' 吧") with a one-tap suggested prompt.

---

## Requirements — Part 4: Reliability & Future Hooks (R12-R15)

> 本段范围:失败 / 冲突回滚(v1 Wave 5),跨用户 A2A 雇佣 v2(W7
> 占位但 schema 不挡路),World Engine 整合(W6 可选),Pet Arena 数
> 据预留(W8 post-launch)。**v1 Wave 5 落 R12,其他作为 v2 占位 +
> 预留约束以避免 v1 schema 锁死。**

### Requirement 12: Sub-task 失败 / 冲突 — 一键回滚或手工解决

**User Story:** As a user whose pet team made conflicting edits or
hit an irreversible error, I want a one-click rollback or a clear
manual-resolve path, so that multi-agent collaboration doesn't leave
my working tree in an unrecoverable state.

#### Acceptance Criteria

1. WHEN a Sub_Task that owns a Worktree_Lane (R4) fails (non-zero
   exit, exception, timeout), THE WorktreeLane status dot SHALL turn
   red and the lane row SHALL expose two buttons inline: **"Rollback"**
   (discards the lane's branch and uncommitted changes) and **"Open
   diff"** (jumps to existing `WorkspaceDiffWorkbench` filtered to
   that branch).
2. WHEN the user clicks "Rollback", THE backend SHALL execute the
   existing `services/workspaceBackups.ts` rollback flow against the
   lane's branch; on success the WorktreeLane SHALL be removed from
   the panel and a `lane_rolled_back` toast SHALL appear.
3. WHEN two Sub_Tasks attempt to merge / rebase to the same target
   branch AND a conflict is detected, THE backend SHALL refuse the
   second merge automatically and emit a `LaneConflict` event; the
   WorktreePanel SHALL render both lanes with a yellow "⚠️ conflict"
   badge linking to a Conflict_Resolver_Modal.
4. THE Conflict_Resolver_Modal SHALL render the conflicting hunks
   side-by-side (existing `DiffView` rendering) with three options:
   **"Keep mine"** (lane A), **"Keep theirs"** (lane B), **"Edit
   manually"** (opens the file in `Open_In_Ide_Button` flow from
   pro-mode-coding-views-2026-05 spec).
5. IF the user is in Simple Mode AND a Sub_Task fails, THE failure
   SHALL surface only via R5.5 friendly recovery prompt ("阿喵 卡住
   了"); Simple Mode users SHALL NOT see the Rollback / Conflict
   modal directly. The recovery prompt's "yes" button SHALL trigger
   the same backend rollback flow that Pro users invoke manually.
6. WHEN any rollback executes (Pro manual or Simple "yes"), THE
   action SHALL be logged to `agent_task_log` with `eventType =
   'rollback'` so the audit trail captures who triggered it and why.
7. IF a Sub_Task wrote to files OUTSIDE its declared
   `scope.workspace_paths` (R8.2c), THE post-completion validation
   SHALL flag the Sub_Task as `out_of_scope`, refuse the merge, and
   require explicit Pro Mode user approval to accept the off-scope
   diff (no Simple Mode auto-accept).

### Requirement 13: 跨用户 A2A 雇佣 — v2 占位 (W7)

**User Story:** As a future v2 user, I want my Leader to be able to
hire someone else's pet from the marketplace when my own team has no
member matching the required role, so that I'm not blocked by my own
team's gaps. **In v1 this requirement is intentionally NOT
user-facing — only the data shape and gating logic are reserved so v1
schema does not have to break later.**

#### Acceptance Criteria

1. THE `agent_run` Spawn_Tool signature SHALL include an optional
   `target` discriminator from v1 onward, accepting `"local-anonymous"
   | "team-member" | "marketplace-hire"`. v1 backend SHALL accept all
   three values but SHALL only execute `local-anonymous` and
   `team-member`; `marketplace-hire` SHALL return
   `not_implemented_in_v1` with explanatory message and SHALL log a
   `marketplace_hire_attempted` analytics event so we can size demand.
2. THE Sub_Task entity SHALL include an optional `hired_from_user_id`
   nullable field from v1 schema onward, recording the seller user
   when (in v2) the Sub_Task came from marketplace hire.
3. THE backend SHALL NOT expose any UI surface for marketplace hire
   in v1 — no buttons, no "find a pet" flow, no marketplace listing
   that mentions A2A hire. v1 mentions of the field exist only in
   schema and `agent_run` signature.
4. WHEN v2 W7 lands, THE marketplace-hire flow SHALL reuse the
   existing `pet-a2a` escrow protocol; v1 SHALL not extend `pet-a2a`
   in any way that would block this future integration.
5. WHEN the v2 marketplace hire flow eventually runs, the hired pet
   SHALL execute on its OWNER's compute (not the hirer's), per
   privacy constraint from `MULTI_AGENT_RESEARCH §6.7`. v1 schema
   SHALL allow this distinction by storing `hired_from_user_id`
   separately from `actorAgentId` on `agent_cost_records`.

### Requirement 14: World Engine 整合 — 把扫描链路视为 task graph (W6 optional)

**User Story:** As a user who scans a real-world object via World
Engine, I want to see the 4-step generation pipeline (scan →
interpret → generate → battle-ready) visualized as a multi-agent task
graph in the same Agent_Team_Panel I use for normal work, so that the
"AI is working for me" mental model is consistent across product
surfaces.

#### Acceptance Criteria

1. WHEN a user submits a scan via existing `WorldEngineScannerScreen`
   AND the user has multi-agent v1 enabled, THE backend
   `world-engine.scan` controller SHALL emit `agent_spawn` events on
   the same TaskTimeline channel for each of the 4 stages:
   `reconstruction` → `ai-interpretation` → `character-generation` →
   (optional) `battle-prep`.
2. THE 4 events SHALL share a common `parent_task_id` so they form a
   single task graph; the Agent_Team_Panel (R3) SHALL render this
   graph as a "World Asset Generation" task tree with one row per
   stage.
3. EACH stage row SHALL display the existing per-stage progress (from
   `world-engine.feature-flag.service`-controlled telemetry); no new
   progress event types are introduced.
4. WHEN the user is in Simple Mode, THE 4-stage graph SHALL collapse
   to a single ambient progress card ("📷 阿喵 正在让你的玩具变成游戏
   角色…") consistent with R5.2 / R5.3.
5. THE integration SHALL be feature-flagged behind
   `multi_agent_world_engine_visualization` and SHALL NOT block W6
   from being deferred or rolled back without affecting v1 W1-W5
   shipped behaviour.
6. THE existing `world-engine.battle.controller`'s
   `emitWorldEngineBattlePending` companion-presence event SHALL be
   rebroadcast through the multi-agent SubTask channel as a
   `agent_result` event when the battle outcome resolves.

### Requirement 15: Pet Arena 数据预留 — v2 W8 post-launch

**User Story:** As a future Pet Arena user, I want my pet's
multi-agent collaboration history (Sub_Tasks completed, success rate,
total cost contributed) to count toward my pet's Arena rating, so
that pets that "do real work" gain an in-game advantage and the
Arena rewards productive pets, not just lucky-dice ones. **In v1 this
is schema-only.**

#### Acceptance Criteria

1. THE existing `world_engine.battle` entity's `mode` enum SHALL be
   extended (in v1 design.md, applied in v2 W8 migration) to support:
   `duel | task_arena | tournament | arena_room`. v1 SHALL not write
   any rows with the new modes; only `duel` (the existing default)
   continues to be used.
2. THE existing `world_engine.battle` entity SHALL gain an optional
   `subject_kind` field (nullable enum: `world_asset | living_pet`)
   to bridge LivingPet vs WorldAsset PvP in v2. v1 SHALL leave this
   field NULL on all rows; the migration adding the column SHALL run
   in v1 but the column SHALL not be read or written by v1 code paths.
3. THE Sub_Task aggregation cron from R11.6 SHALL also write a
   per-pet "productivity score" to a new lightweight table
   `pet_productivity_snapshot` (pet_id, week_start, sub_tasks_completed,
   sub_tasks_failed, total_cost_usd_contributed). v1 SHALL populate
   this table but SHALL not surface it in any UI; v2 W8 Arena ladder
   SHALL consume it.
4. THE multi-agent collaboration UI SHALL NOT mention Arena, PvP, or
   competition in v1; the spec from `PET_PVP_AND_SPATIAL_AI` is
   strictly v2 W8 material per `MULTI_AGENT_PRIORITIZATION` Option A
   decision.
5. WHEN v2 W8 lands, the Arena UI SHALL be a new "competition view"
   tab inside the same Agent_Team_Panel from R3 — not a new panel.
   v1 panel layout SHALL leave a top-level tab strip even though
   only one tab ("Active") is present, so v2 can add tabs without
   re-architecture.

---

## Validation: 完整 R 总览

| # | Requirement | v1 Wave | Layer (research §5.1) |
|---|-------------|---------|----------------------|
| R1 | Leader spawn sub-agent | W2 | L1 → L2 |
| R2 | Sub-agent timeline 可见 | W2 | L2 → L3 |
| R3 | Agent Team Panel 顶层入口 | W1 | L3 + L4 |
| R4 | WorktreeLane 显示 agent 身份 | W1 | L3 |
| R5 | Simple Mode "团队在工作"球 | W1 | L1 简化 |
| R6 | Leader 优先派活给 pet member | W3 | L4 |
| R7 | LivingPet ↔ AgentAccount 桥接 | W3 | L4 |
| R8 | Pro Mode 编辑 role/scope/budget | W3 | L4 |
| R9 | 长任务后台 + 多通道回流 | W4 | L3 + cross-device |
| R10 | agent_cost_records 自动写 | W5 | L5 economy |
| R11 | Pro Mode 周报 | W5 | L5 economy |
| R12 | 失败/冲突 一键回滚/手工解决 | W5 | reliability |
| R13 | 跨用户 A2A v2 占位 | W7 (post) | L5 schema-only in v1 |
| R14 | World Engine 整合 (optional) | W6 | integration |
| R15 | Pet Arena 数据预留 (post) | W8 (post) | future-proof schema |

**v1 必交付**: R1-R12(12 个 R,5 个 Wave,launch+30-60 天)
**v2 / 占位**: R13-R15(schema 在 v1 落地,功能在 W6/W7/W8 后续 sprint)

---

## Next steps after requirements approval

1. design.md — 14 段(详见 [`MULTI_AGENT_PRIORITIZATION §3.3`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md))
2. tasks.md — Wave 1-8 拆细到子任务,每个 task 引用 R/AC ID
3. v1 W1 启动 — UI 暴露 + lane×agent + Simple Mode ball
4. open questions(详见 [`MULTI_AGENT_PRIORITIZATION §7`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md))
   等用户拍板后写进 design.md 决策记录
