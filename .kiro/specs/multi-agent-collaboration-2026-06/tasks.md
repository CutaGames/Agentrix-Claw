# Implementation Plan: Multi-Agent Collaboration

> **Spec**: `multi-agent-collaboration-2026-06`
> **Phase**: tasks (post design.md approval)
> **Author**: Dev Agent + CEO
> **Date**: 2026-05-26
> **Branch**: 起草在 `perf/desktop-pre-launch-p1`;每个 wave 切自己分支
> **Predecessor**: `requirements.md` (R1-R15) + `design.md` (§0-§19)
> **References**:
> - [`MULTI_AGENT_PRIORITIZATION §3.4`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md#34-tasksmd-草拟只-wave-标题) — Wave 标题草案
> - [`design.md §16`](./design.md) — 每个 R 的 file-level 实现清单

## Overview

本计划落地 multi-agent-collaboration-2026-06 spec 的全部 R1-R15。
v1(W1-W5)= L1+L2+L3+L4 完整接线,launch+30-60 天交付;v2(W6-W8)
post-launch,World Engine 整合 / 跨用户 A2A / Pet Arena。每个 wave
对应一个 sprint,切独立 feature branch,wave 末 merge 回主干。

**v1 总计 12 个 R**(R1-R12)分布到 W1-W5;**v2 总计 3 个 R**(R13-R15)
分布到 W6-W8 (其中 R13/R15 大部分是 v1 schema-only 占位)。

设计约束(详见 [`design.md §15`](./design.md#15-决策记录等-pm-拍板的-5-个-open-question)):
- 选项 A 一个 spec:1 个 spec,W1-W5 = v1,W6-W8 = v2
- LivingPet bind AgentAccount 第一次需要 approval(§15.3)
- Simple Mode 团队工作球放 CompanionBall(§15.2)
- 经济周报 Me Tab + Pet Tab 双放(§15.4)

## 全局约束(每个 task 都遵守)

- TypeORM `SnakeNamingStrategy` 全局,**不在 `@Column()` 写 `name: 'snake_case'`**
- 复用已 ship 资产(详见 [`design.md §1.2`](./design.md#12-已-ship-资产清单直接复用不重写)),**不重写**
- 任何 `INSERT/UPDATE` 不能写 v2 占位字段(`hired_from_user_id`, `subject_kind`, `mode IN task_arena/tournament/arena_room`)— Property 6 enforce
- 每个 task 引用至少 1 个 R / AC ID via `_Requirements: X.Y_`
- 每个 task 引用至少 1 个 design § via `_Design: §N_`(可选但鼓励)

## Tasks

- [ ] 0. Pre-flight audit & migration scaffolding
  - [ ] 0.1 Audit existing schema for v1 migration safety
    - Read `backend/src/entities/agent-task.entity.ts` + `agent-cost-record.entity.ts` + `pet-team-member.entity.ts` + `living-pet.entity.ts` to confirm field names
    - Document any FK collision risk in `backend/src/modules/multi-agent/COMPAT_AUDIT.md`
    - Verify `agent_team_templates.roles[].codename` matches `pet_team_members.role` enum values (11 roles: ceo/dev/qa_ops/growth/ops/media/ecosystem/community/brand/hunter/treasury)
    - _Requirements: 1.1, 6.1, 7.1_
    - _Design: §1.2, §2.1_

  - [ ] 0.2 Confirm `desktop-sync.companion-presence` channel can carry new event types
    - Verify channel emit API supports `team-activity-update` / `SubTaskCompleted` / `SubTaskStalled` event types
    - Document the event schema additions in `backend/src/modules/desktop-sync/EVENTS_MULTI_AGENT.md`
    - _Requirements: 5.6, 9.3_
    - _Design: §1.2, §7_

  - [ ] 0.3 Confirm BullMQ `agent-tasks` queue can host sub-task jobs
    - Read existing `agent-task.worker.ts` to verify concurrency=5 and job lifecycle
    - Document BullMQ job payload extension for `parentTaskId` / `target_kind` in worker README
    - _Requirements: 1.4, 9.1_
    - _Design: §3.3, §7.1_

  - [ ] 0.4 Confirm feature flag system supports `multi_agent_world_engine_visualization`
    - Verify flag system supports cohort-percentage rollout (W6 default OFF, post-launch toggle)
    - Document the flag's default value (off) in feature-flag service README
    - _Requirements: 14.5_
    - _Design: §14.4_

- [ ] 1. W1 — UI 暴露 + 数据接线 (1 sprint, 5-7 days)
  > Wave goal: 让用户从主对话顶部菜单看到 "🤖 Agent 团队" 入口,打开能
  > 看到 Leader + Members + 当前 Sub-Tasks。WorktreeLane 显示 agent
  > 身份。Simple Mode CompanionBall 出 badge。
  > Branch: `feat/multi-agent-w1-ui-exposure`

  - [ ] 1.1 Migrations — Part 1 of 2 (data shape, no behaviour)
    - Generate migration `2026-06-01-multi-agent-schema-part1.ts`:
      - `ALTER TABLE agent_tasks ADD COLUMN parent_task_id uuid NULL REFERENCES agent_tasks(id)`
      - `ALTER TABLE agent_tasks ADD COLUMN target_kind varchar(24) NOT NULL DEFAULT 'leader-direct'`
      - `ALTER TABLE agent_tasks ADD COLUMN hired_from_user_id varchar(64) NULL`
      - `CREATE INDEX idx_agent_tasks_parent ON agent_tasks(parent_task_id, created_at DESC)`
      - `CREATE INDEX idx_agent_tasks_target_kind ON agent_tasks(target_kind, status)`
      - `CREATE TABLE worktree_lanes (...)` with all columns from design §2.2 新增 5
    - Run migration on staging (47.130.176.148) + verify zero downtime impact on existing rows
    - Update `backend/src/entities/agent-task.entity.ts` to add `parentTaskId` / `targetKind` / `hiredFromUserId` columns (TypeORM camelCase)
    - Create new entity `backend/src/entities/worktree-lane.entity.ts`
    - _Requirements: 1.2, 4.1, 13.1, 13.2_
    - _Design: §2.2 新增 1, 2, 3, 5_

  - [ ] 1.2 Backend — `worktree-lane` module + bulk import endpoint
    - Create `backend/src/modules/worktree-lane/worktree-lane.module.ts` + service + controller
    - Implement `GET /api/worktree-lanes?userId=&workspaceDir=` — list user lanes filtered by workspace
    - Implement `POST /api/worktree-lanes/bulk-import` — idempotent insert from localStorage payload
    - Implement `PATCH /api/worktree-lanes/:id` — update mission / status / agent_id / agent_task_id
    - Implement `POST /api/worktree-lanes/:id/rollback` — invoke existing `services/workspaceBackups.ts` flow
    - Wire into `AppModule`
    - _Requirements: 4.1, 4.2, 4.5_
    - _Design: §6.1, §6.2_

  - [ ] 1.3 Desktop client — `agentTeam.ts` + `worktreeLanes.ts` services
    - Create `desktop/src/services/agentTeam.ts` thin client wrapping:
      - `GET /api/agent-teams/:teamId` (existing endpoint)
      - `POST /api/agent-teams/provision` (existing)
      - `PATCH /api/agent-teams/:id/leader` (existing)
      - `POST /api/agent-teams/:id/bind-pets` (NEW in W3, schema only in W1)
    - Create `desktop/src/services/worktreeLanes.ts`:
      - `listLanes()` — backend → fallback to localStorage cache
      - `bulkImportFromLocalStorage()` — call once at boot
      - `updateLane(id, patch)` / `rollback(id)`
    - Add boot hook in `useServiceBootstrapper.ts` to call `bulkImportFromLocalStorage()` once after first login
    - _Requirements: 3.3, 4.1_
    - _Design: §5.7, §6.1_

  - [ ] 1.4 Desktop UI — `AgentIdentityCard` component
    - Create `desktop/src/components/AgentIdentityCard.tsx`:
      - Props: `{ size: "sm"|"md"|"lg", agentId, status, onClick, onEdit?, mode?: "simple"|"standard"|"pro" }`
      - Renders avatar emoji (16/32/48px) + name (max 20 chars) + role tag + status dot
      - Pro mode: show [Edit] button (W3 wires up to MemberSettingsModal)
    - Add `desktop/src/services/agentIdentity.ts` to fetch + cache agent info (`GET /api/agent-accounts/:id`)
    - Snapshot test for 3 sizes × 3 modes
    - _Requirements: 4.3, 4.4, 8.1_
    - _Design: §5.2, §6.3_

  - [ ] 1.5 Desktop UI — `AgentTeamPanel` component
    - Create `desktop/src/components/AgentTeamPanel.tsx`:
      - Side panel layout per [`design.md §5.3`](./design.md#53-panel-布局)
      - 3 sections: Leader card (lg) / Members grid (md) / Active Sub-Tasks list
      - Empty state: "Provision from template" CTA listing `agent_team_templates.roles[]` (visibility=public|official + creator_id=userId)
      - Right-click member → `[Promote to Leader]` context menu
      - Tab strip header with `<TabBar>` (only "Active" tab in v1 — placeholder structure for v2 Arena tab per R15.5)
    - Wire `agentrix:open-agent-team-panel` event listener
    - _Requirements: 3.1, 3.2, 3.4, 3.6, 3.7, 15.5_
    - _Design: §5.3, §5.4, §5.5, §5.8_

  - [ ] 1.6 Desktop UI — wire ChatTitleBar More menu + hide Sandbox duplicate
    - In `desktop/src/components/chatPanel/ChatTitleBar.tsx`, More menu items 数组添加新 item:
      - `{ label: "🤖 Agent 团队", tier: "standard", onClick: () => dispatch("agentrix:open-agent-team-panel") }`
    - In `TaskWorkbenchPanel.tsx`, when `useAgentTeamPanelOpen()` is true, hide the existing "Agent Team Sandbox (MVP)" subsection (Planner/Coder/Reviewer cards)
    - Add banner inside hidden Sandbox section: "Agent Team 已升级为独立 panel,这里保留旧视图供回顾"
    - _Requirements: 3.1, 3.5_
    - _Design: §5.6_

  - [ ] 1.7 Desktop UI — extend WorktreePanel with Agent_Identity_Card
    - In `desktop/src/components/WorktreePanel.tsx`:
      - Switch lane data source from `loadStoredLanes()` (localStorage) to `worktreeLanes.listLanes()` (backend with localStorage cache fallback)
      - Update `WorktreeLane` interface to include `agent_id?: string` + `agent_task_id?: string`
      - Render `<AgentIdentityCard size="sm">` to the left of each lane row WHEN `lane.agent_id` is set
      - Click on identity card → open `AgentTeamPanel` filtered to that agent
    - Hook `useAgentTaskStatus(agentId)` zustand selector (NEW thin store) to update status dot via `desktop-sync.companion-presence` task-status events within 2s
    - _Requirements: 4.1, 4.3, 4.4, 4.5_
    - _Design: §6.3, §6.4_

  - [ ] 1.8 Desktop UI — Simple Mode CompanionBall badge + TeamActivitySurface
    - In `desktop/src/components/PetCompanionWindow.tsx`:
      - Add badge overlay rendered when `userMode === 'simple'` AND `useActiveSubTasksCount() > 0`
      - Badge text: count capped at "9+" with subtle pulse animation
      - Subscribe to `agentrix:team-activity-update` event from `desktop-sync.companion-presence`
    - Create `desktop/src/components/TeamActivitySurface.tsx`:
      - Full-screen view per design §9.2
      - Props: `simplifiedSubTasks: Array<{emoji, petName, plainStatus, progress}>`
      - Renders timeline + emoji-driven status (NO file paths / branch names / USD per R5.4)
      - "Ask Leader for an update" button → dispatches `agentrix:leader-progress-request`
    - Create `desktop/src/services/teamActivityStore.ts` zustand selector for `useActiveSubTasksCount`
    - _Requirements: 5.1, 5.2, 5.4, 5.6_
    - _Design: §9.1, §9.2, §9.4_

  - [ ] 1.9 Backend — emit `team-activity-update` events
    - In `agent-task.worker.ts`, after each `agent_tasks.status` change emit on `desktop-sync.companion-presence` channel:
      ```typescript
      { type: 'team-activity-update', userId, activeSubTasks: count, summary: oneLine }
      ```
    - Throttle to ≤ 1 emit per 3 seconds per user (R5.6 requires update within 3s)
    - _Requirements: 5.6_
    - _Design: §9.1_

  - [ ] 1.10 Wave 1 verification (real-device install)
    - tsc --noEmit + cargo check + vitest must all pass
    - Real-device install of Agentrix Desktop with the W1 build
    - Manual checklist:
      - ChatTitleBar More menu shows "🤖 Agent 团队" (Standard / Pro)
      - Click → AgentTeamPanel opens with Provision CTA (no team) or 3 sections (provisioned)
      - Provision from CEO 11-agent template → panel refreshes within 2s
      - Promote member to leader works
      - WorktreePanel lane shows agent identity card when agent_id is set
      - Simple Mode: spawn a fake sub-task (test fixture) → CompanionBall badge appears
    - Build .exe and bump version to next minor (e.g. 0.7.0)
    - _Requirements: 3.1, 3.2, 3.4, 3.6, 3.7, 4.1, 4.3, 5.1_

  - [ ]* 1.11 Unit tests for AgentTeamPanel + AgentIdentityCard
    - vitest snapshot tests for each panel state (empty / loading / 3-member / promote-leader)
    - jest test for `useAgentTaskStatus` zustand selector reaction time (mock 2 events 200ms apart)
    - _Requirements: 3.2, 4.5_



- [ ] 2. W2 — Spawn 协议落地 (1 sprint, 5-7 days)
  > Wave goal: Leader 主对话能调 `agent_run` 工具,后端 dispatch 到
  > BullMQ,timeline 显示 agent_spawn / agent_invoke / agent_result
  > 三类事件;主 chat 消息可以带 [sub-task #N] anchor。
  > Branch: `feat/multi-agent-w2-spawn-protocol`

  - [ ] 2.1 Shared types — `agent-tools.ts`
    - Create `shared/types/agent-tools.ts`:
      - `AGENT_RUN_TOOL_SCHEMA` constant (full JSON schema per [`design.md §3.2`](./design.md#32-tool-schemallm-看到的))
      - `SpawnToolInput` / `SpawnToolOutput` TypeScript types
      - `AgentSpawnEvent` / `AgentInvokeEvent` / `AgentResultEvent` payload types
    - Export from `shared/types/index.ts` so backend + desktop both consume
    - _Requirements: 1.1, 1.5, 13.1_
    - _Design: §3.2, §4.1_

  - [ ] 2.2 Backend — `agent-task-spawn.service.ts` core dispatcher
    - Create `backend/src/modules/agent-task/agent-task-spawn.service.ts`:
      - `dispatch(dto: SpawnToolInput, userId: string): Promise<{ subTaskId: string; targetKind: string }>`
      - Resolve `target` per dispatch flow in design §3.3:
        - `marketplace-hire` → return 400 not_implemented_in_v1 + analytics event `marketplace_hire_attempted`
        - `team-member` (default) → call `AgentTeamService.selectMember(userId, role)`
        - `local-anonymous` → skip member resolve
      - Enforce hard cap of 4 concurrent in-flight Sub_Tasks per leader (count `agent_tasks WHERE userId AND parent_task_id=leaderTaskId AND status IN ('queued','running','awaiting_input')`)
      - If `budget_usd > 10` → emit `agentrix:approval-needed` and return 202 awaiting_approval
      - Apply `budget_usd = 1.00` default if unspecified
      - Detect cycle: refuse if `parentTaskId` chain would form a loop (Property 1)
      - Call `AgentTaskService.create({ ...dto, parentTaskId, target_kind, agentId: member?.bound_agent_account_id })`
      - Emit `agent_spawn` event payload to `agent_task_logs` (kind='agent_spawn') per design §4.1
      - Enqueue BullMQ job `agent-tasks` { taskId, parentTaskId }
      - Return `{ subTaskId, targetKind }`
    - Wire into `AgentTaskController` as `POST /api/agent-tasks/spawn`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 6.1, 13.1, 13.2_
    - _Design: §3.3, §3.5_

  - [ ] 2.3 Backend — `selectMember(role)` resolver
    - Extend `backend/src/modules/agent-team/agent-team.service.ts`:
      - `selectMember(userId, role): Promise<PetTeamMember | null>` per [`design.md §3.4`](./design.md#34-selectmemberrole-解析器-r6-核心)
      - Tie-break: lowest in-flight count → highest reputation → oldest createdAt
      - Return null if no match (caller falls back to anonymous)
      - Skip `paused` / `revoked` status members (R6.6)
    - Add `countInFlightSubTasks(parentLivingPetId)` private helper
    - _Requirements: 6.1, 6.2, 6.3, 6.6_
    - _Design: §3.4_

  - [ ] 2.4 Backend — `agent-task.worker.ts` extend for sub-task events
    - In `agent-task.worker.ts`:
      - On job process start → emit `agent_invoke` event for each tool call the sub-task makes (kind='agent_invoke')
      - On terminal status (succeeded/failed/canceled) → emit `agent_result` event with `durationMs` / `totalCostUsd` (sum from `agent_cost_records`) / `resultSummary` / `errorMessage?`
      - For computer-use-like long jobs, throttle `agent_invoke` emissions to ≤ 4/sec to avoid timeline noise
    - Worker task context (`AsyncLocalStorage`) propagates `parentTaskId` to cost-tracker (W5 will use)
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
    - _Design: §4.1_

  - [ ] 2.5 Desktop client — `spawnTool.ts` LLM tool registration
    - Create `desktop/src/services/spawnTool.ts`:
      - Register `agent_run` tool with the existing tool registry (`desktop/src/services/agentTools/registry.ts`)
      - Tool executor: validate inputs against `AGENT_RUN_TOOL_SCHEMA`,enforce client-side caps:
        - `concurrent count > 4` → return `{ error: "spawn_rate_limited", retryAfterMs: 5000 }` (R1.4)
        - `cumulative session count > 8` → require user ack (R1.6 — dispatch `agentrix:require-continue-ack` event,wait for response)
        - `budget_usd > 10` AND no prior approval → dispatch `agentrix:approval-needed`,stash in `pendingHighBudgetSpawns` Map (per design §3.5)
      - On approval-resolved or proceed: call `POST /api/agent-tasks/spawn`
      - Inject `[sub-task #N]` anchor placeholder into the message stream so the leader can reference it
    - Tool conditionally registered: `useUserMode() in ('standard','pro')` AND `workspaceTier !== 'simple'` for visible tool calls; in Simple mode tool exists but tool-call card is suppressed (R1.3)
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_
    - _Design: §3.1, §3.3, §3.5_

  - [ ] 2.6 Desktop UI — TaskTimeline rendering of 3 event kinds
    - Extend `desktop/src/components/TaskTimeline.tsx`:
      - Already handles `agent_spawn` / `agent_invoke` / `agent_result` kinds (verified existing). Improve rendering:
        - For `agent_spawn` → show actor identity (use `AgentIdentityCard size="sm"` with pet member if `target_kind=team-member`, else generic 🤖 icon)
        - For `agent_invoke` → collapse to "🔧 X tool calls" by default,click to expand (reuse existing collapsed-by-default UX)
        - For `agent_result` → show duration + cost (USD from `totalCostUsd` field) + summary; if `status='failed'`,red border + [Retry] [Rollback] buttons
      - Click any event card → dispatch `agentrix:scroll-to-sub-task { taskId }` AND navigate to corresponding worktree lane (R2.4)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
    - _Design: §4.2, §4.4, §4.5_

  - [ ] 2.7 Desktop UI — chat message anchor markdown plugin
    - Create remark plugin `desktop/src/services/chatMarkdownPlugins/subTaskAnchor.ts`:
      - Match pattern `[sub-task #(\d+)]` in message body → render as clickable `<a>` with onClick dispatching `agentrix:scroll-to-sub-task { n }` event
    - Wire into `MessageBubble.tsx` markdown pipeline
    - TaskTimeline subscribes to event → scrolls + flashes the matching event card (yellow background pulse 600ms)
    - _Requirements: 2.6_
    - _Design: §4.3_

  - [ ] 2.8 Backend — approval flow integration for high-budget spawns
    - In `agent-task-spawn.service.ts`,when `dto.budget_usd > 10`:
      - Generate approval `commandId` (UUID)
      - Emit `agentrix:approval-needed` via existing `desktop-sync.companion-presence` channel with payload `{ commandId, type: 'high-budget-spawn', budget_usd, role, prompt: prompt.slice(0,200) }`
      - Stash spawn DTO in `pendingHighBudgetSpawns` Map (in-memory cache OK for v1)
      - Listen to `agentrix:approval-resolved { commandId, action: 'approve'|'reject' }` event
      - On approve → continue dispatch flow; on reject → return 403 with reason
      - Stash entries expire after 5 minutes (clean up via setTimeout)
    - _Requirements: 1.5_
    - _Design: §3.5_

  - [ ] 2.9 Desktop UI — Spawn rate-limit user warning (R1.6)
    - In `useStreamingTurn.ts`,listen for `spawn_rate_limited` errors from spawnTool:
      - Inline message inject: "you've delegated 8 sub-tasks; consider waiting for results before spawning more"
      - When count ≥ 8 cumulative,inject "continue" button into chat; user click → set flag → 9th spawn allowed
    - _Requirements: 1.6_
    - _Design: §3.3_

  - [ ] 2.10 Wave 2 verification (real-device install)
    - tsc --noEmit + cargo check + vitest 91/91+ pass
    - Manual checklist:
      - In Pro Mode chat,leader spawns sub-task (e.g. "go research the latest on X")
      - TaskTimeline shows `agent_spawn` card with sub-task title within 1s (R1.2)
      - Worker progresses → `agent_invoke` events appear collapsed
      - Sub-task completes → `agent_result` card with duration + cost (USD)
      - Leader's chat reply contains `[sub-task #1]` anchor → click → timeline scrolls + flashes
      - Spawn 5 sub-tasks rapid-fire → 5th gets `spawn_rate_limited` error inline
      - High-budget (`budget_usd: 25`) → approval modal pops; approve → spawn proceeds; reject → spawn aborts
    - Build .exe + bump to v0.7.x
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.6_

  - [ ]* 2.11 Backend tests for spawn dispatcher
    - jest test `selectMember`: 3 members same role,least-in-flight wins; tie → highest reputation; tie → oldest createdAt
    - jest test rate-limit: 5th concurrent spawn returns spawn_rate_limited
    - jest test cycle detection: chain A → B → C,then dispatch B → A returns 400
    - jest test marketplace-hire: target='marketplace-hire' returns 400 not_implemented_in_v1 + analytics event recorded
    - _Requirements: 1.4, 6.1, 6.2, 13.1_



- [ ] 3. W3 — Pet member 桥接 (LivingPet ↔ AgentAccount) (1 sprint, 5-7 days)
  > Wave goal: 用户的 LivingPet 可以作为 AgentTeam member 接 sub-task,
  > XP 计入 pet,wallet 自动路由,Pro 模式可编辑 role/scope/budget。
  > Branch: `feat/multi-agent-w3-pet-bridge`

  - [ ] 3.1 Migrations — Part 2 (pet bridge + scope snapshot)
    - Generate migration `2026-06-15-multi-agent-schema-part2.ts`:
      - `ALTER TABLE living_pets ADD COLUMN bound_agent_account_id varchar(64) NULL REFERENCES agent_accounts(id)`
      - `CREATE INDEX idx_living_pets_bound_agent ON living_pets(bound_agent_account_id)`
    - Update `backend/src/entities/living-pet.entity.ts` to add `boundAgentAccountId` column
    - _Requirements: 7.1_
    - _Design: §2.2 新增 6, §11.1_

  - [ ] 3.2 Backend — `agent-team.controller.bindPets` endpoint
    - Add `POST /api/agent-teams/:teamId/bind-pets` to `agent-team.controller.ts`:
      - Body: `{ livingPetIds: string[] }`
      - For each pet: if `bound_agent_account_id` is null,create AgentAccount derived from pet's soul template (`displayName=pet.name`, `avatarUrl=pet.thumbnail_url`, `personaConfig=deriveFromSoul(pet.soul_template_id)`),persist FK on LivingPet
      - Upsert `pet_team_members` row with `role=deriveRoleFromSoul(pet.soul_template_id)` + default scope/budget from `agent_team_template.roles[]` matching role
    - Service: `bindPetToTeam(teamId, petId, userId)` in `agent-team.service.ts`
    - _Requirements: 7.2_
    - _Design: §11.2_

  - [ ] 3.3 Backend — sub-task → pet XP + cost on completion
    - In `agent-task.worker.ts` on success path,when `task.target_kind === 'team-member'` AND `task.parent_task_id`:
      - Find pet via `livingPetRepo.findOneBy({ bound_agent_account_id: task.agentId })`
      - Call existing `services/petXp.ts grant(pet.id, calculateSubTaskXp(task))` (formula: floor(durationSec / 30) + (cost * 100) capped at 50 XP per sub-task)
      - Call `cost-tracker.persistCost({ ...,parent_task_id: task.id,event_type: 'sub_task_complete',costUsd: task.totalCostUsd })`
    - _Requirements: 7.3_
    - _Design: §11.3, §12.2_

  - [ ] 3.4 Backend — pet-team wallet routing
    - Extend `pet-team.service.ts`:
      - `chargeWallet(memberId, amountUsd)` per design §11.4:
        - If `m.walletAddress` set → deduct from pet wallet via `petWalletService.deduct`
        - Else fallback to owner wallet,subject to `daily_budget_usd` cap
        - On insufficient → throw `BudgetExceededError('pet_budget_exceeded')`
      - `checkOwnerDailyBudget(userId, amount)` private helper using existing `agent_cost_records` daily sum
    - Wire into `agent-task-spawn.service.ts` dispatch flow before BullMQ enqueue
    - _Requirements: 7.4_
    - _Design: §11.4_

  - [ ] 3.5 Desktop UI — Pet Bind approval modal (per design §15.3 decision)
    - On first time user clicks "Use my pets as members" CTA in `AgentTeamPanel`,show approval modal:
      - "你的 [pet.name] 即将成为 Agent Team 成员,可以代你执行任务并花费预算 ($X/day cap)。继续?"
      - Buttons: [允许] [取消]
    - On approve → call `POST /api/agent-teams/:teamId/bind-pets`
    - Persist user-level "agent-bind-acknowledged" flag in `localStorage`,后续不再弹
    - _Requirements: 7.2 (extended per §15.3)_
    - _Design: §11.2, §15.3_

  - [ ] 3.6 Desktop UI — `MemberSettingsModal` component (Pro Mode)
    - Create `desktop/src/components/MemberSettingsModal.tsx`:
      - Conditionally rendered when user clicks `[Edit]` button on `AgentIdentityCard` AND `useUserMode() === 'pro'`
      - Form fields per design §10.2:
        - `role` text input (1-30 chars)
        - `scope.tools` multi-select chips from `tool-registry` catalogue (≥ 1 required)
        - `scope.workspace_paths` textarea (1 glob per line,supports `!negate`)
        - `daily_budget_usd` number input (0.10-100,default 1.00)
        - `preferred_model_tier` radio: local/smart/cloud
      - Each field has small "reset to template default" button reading from `agent_team_template.roles[].defaultScope`
      - Save → `PATCH /api/v1/pet/team/:parentLivingPetId/members/:memberId` (existing endpoint)
      - On save success,refresh panel within 2s via SWR mutation
      - Subscription tier cap check (FREE=$2 / PRO=$20 / BUSINESS=$200 / ENTERPRISE=∞) per R8.7 — show inline error with tier upgrade CTA on violation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
    - _Design: §10.1, §10.2, §10.3, §10.4, §10.5_

  - [ ] 3.7 Backend — PATCH member endpoint enforces budget cap
    - Extend `pet-team.controller.ts` PATCH handler:
      - Read user subscription tier from `workspace.tier`
      - Cap `daily_budget_usd` against tier (Free=$2, Pro=$20, Business=$200, Enterprise=unlimited)
      - On exceed: return 422 `{ error: 'budget_exceeds_tier_cap', cap, tier }`
    - _Requirements: 8.7_
    - _Design: §10.5_

  - [ ] 3.8 Desktop UI — Pet detail screen binding badge
    - In existing pet detail screen (Pet Tab),when `pet.bound_agent_account_id` is set,render small badge: `🤖 也是我的工作伙伴`
    - Simple Mode: badge visible (友好文案,不暴露 AgentAccount 技术词)
    - Pro Mode: badge clickable → opens `AgentTeamPanel` filtered to this agent
    - _Requirements: 7.6_
    - _Design: §11.6_

  - [ ] 3.9 Backend — pet member unbind preserves history
    - Extend `pet-team.controller.ts` DELETE handler:
      - Soft-delete pet_team_members row
      - Clear `living_pets.bound_agent_account_id = null`
      - **Do NOT delete `agent_accounts` row** (历史 cost records 引用)
    - _Requirements: 7.5_
    - _Design: §11.5_

  - [ ] 3.10 Wave 3 verification (real-device install)
    - tsc + vitest + cargo all pass
    - Manual checklist:
      - User opens AgentTeamPanel,clicks "Use my pets as members" → approval modal
      - Approve → 3 pets become team members,each with role inferred from soul
      - Spawn sub-task with role="coder" → backend selectMember picks the pet member,not anonymous
      - Sub-task completes → pet gets XP increment + cost recorded
      - Pro Mode: click [Edit] on a member → modal opens,change budget to $25 (Pro cap)
      - Try setting $30 (over Pro cap) → inline error
      - Pet detail screen shows "🤖 也是我的工作伙伴" badge
      - Unbind a member → AgentAccount kept,LivingPet.bound_agent_account_id cleared
    - Build .exe + bump version
    - _Requirements: 6.1, 6.2, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.7_

  - [ ]* 3.11 Backend tests for pet bridge
    - jest: bind 3 pets,verify AgentAccount creation + back-reference set
    - jest: spawn role='coder',selectMember picks pet (not anonymous)
    - jest: pet wallet insufficient → owner wallet covers within daily cap
    - jest: budget cap by tier — Free=2 / Pro=20 / Business=200 boundary cases
    - jest: unbind → soft delete pet_team_members,LivingPet.bound_agent_account_id null,AgentAccount preserved
    - _Requirements: 6.1, 7.1-7.5, 8.7_

- [ ] 4. W4 — 长任务后台 + companion ball / lock-screen / push 回流 (1 sprint, 5-7 days)
  > Wave goal: 30 秒以上 sub-task 自动转 background,完成时通过 4 通道
  > 通知 (CompanionBall pulse / lock-screen pet / mobile push / chat
  > inject)。Stalled 60min 触发警告。
  > Branch: `feat/multi-agent-w4-long-tasks`

  - [ ] 4.1 Desktop client — background mode threshold + BackgroundTasksStore
    - In `desktop/src/components/chatPanel/useStreamingTurn.ts`:
      - After spawn,track sub-task start time
      - 30s wall-clock interval check: if still running,mark `task.backgrounded = true`
      - Add to existing `BackgroundTasksStore` (P9 redesign zustand store)
      - Update timeline event card status from spinner to 🌙 background badge
      - Detach chat main input "waiting" block — user can keep chatting with leader
    - _Requirements: 9.1, 9.2_
    - _Design: §7.1_

  - [ ] 4.2 Backend — emit `SubTaskCompleted` / `SubTaskStalled` events
    - In `agent-task.worker.ts`:
      - On terminal status (succeeded/failed/canceled) → emit `SubTaskCompleted` on `desktop-sync.companion-presence` channel with payload `{ subTaskId, summary, ok, parentTaskId, userId }`
      - Cron `agent-presence.scheduler` every 5min: scan `agent_tasks WHERE status='running' AND now() - started_at > 60min`,emit `SubTaskStalled` event for each `{ subTaskId, durationMs, userId }`
    - _Requirements: 9.3, 9.5_
    - _Design: §7.2, §7.3_

  - [ ] 4.3 Desktop — CompanionBall green/amber pulse on sub-task events
    - In `PetCompanionWindow.tsx`:
      - Listen for `SubTaskCompleted` from `desktop-sync.companion-presence`:
        - On success → green pulse animation 1s + tooltip on hover (one-line summary)
        - On failure → red pulse 800ms + tooltip with friendly error
      - Listen for `SubTaskStalled`:
        - Amber pulse pattern + 3 inline buttons: [Abort] [Extend +30min] [Ask Leader to Pivot]
        - Buttons dispatch:
          - Abort → `POST /api/agent-tasks/:id/cancel` (existing)
          - Extend → emit `agentrix:extend-deadline { taskId,minutes: 30 }` (logs only,worker continues)
          - Pivot → inject Leader message "is sub-task #N still on track? consider pivoting"
    - _Requirements: 9.3, 9.5_
    - _Design: §7.2, §7.3_

  - [ ] 4.4 Backend — `lock-screen-pet` channel emit
    - In `desktop-sync.companion-presence` already emits to companion ball; add parallel emit to `lock-screen-pet` channel (P9 redesign existing) for `SubTaskCompleted` AND `SubTaskStalled` events
    - Lock-screen pet renders the same pulse / badge / icons as ball,using existing P9 lock-screen presence handler
    - _Requirements: 9.4(a)_
    - _Design: §7.2_

  - [ ] 4.5 Backend — mobile push notification on sub-task completion
    - In `agent-task.worker.ts` on terminal status,call existing `notification.service.sendPush({...})`:
      - Payload includes `deeplink: agentrix://multi-agent/sub-task/${id}`
      - Title: "🦊 阿喵 完成了任务" (success) or "⚠️ sub-task 卡住了" (failed/stalled)
      - Body: 一句话 plain language summary (no file paths / USD)
    - Skip push if user has push disabled in `notification_preferences`
    - _Requirements: 9.4(b)_
    - _Design: §7.2_

  - [ ] 4.6 Mobile — handle `agentrix://multi-agent/sub-task/:id` deeplink
    - In `src/services/deeplink.ts` (existing),add route handler:
      - On `agentrix://multi-agent/sub-task/:id` → navigate to AgentTeam tab,scroll to the sub-task event card
    - _Requirements: 9.4(b)_
    - _Design: §7.2_

  - [ ] 4.7 Desktop — Aggregated Leader inject when ball clicked with unacknowledged completions
    - In `PetCompanionWindow.tsx`:
      - On click of CompanionBall badge AND there are unacknowledged completions:
        - Dispatch `agentrix:open-chat-with-summary { taskIds: string[] }`
    - In `ChatPanelImpl.tsx`:
      - Listen for `agentrix:open-chat-with-summary`,fetch task summaries,inject single Leader message:
        ```
        我帮你跑了 N 个 sub-task:
        - [sub-task #1] 整理了 5 个 README 文件
        - [sub-task #2] 跑测试发现 3 个失败
        要看哪个的详情?
        ```
      - Mark these tasks as acknowledged (set flag in BackgroundTasksStore)
    - _Requirements: 9.6_
    - _Design: §7.4_

  - [ ] 4.8 Cancel semantics — reuse existing endpoint
    - No new endpoint; `POST /api/agent-tasks/:id/cancel` already ships
    - W4.3 Abort button calls this endpoint via `agentTaskService.cancel(id)`
    - _Requirements: 9.7_
    - _Design: §7.5_

  - [ ] 4.9 Wave 4 verification (real-device install)
    - tsc + cargo + vitest pass
    - Manual checklist:
      - Spawn long sub-task (e.g. "research X for 90 seconds") → 30s 后 timeline 显示 🌙 background badge,主 chat 不再阻塞
      - Lock screen → wait 10 sec → unlock,verify lock-screen pet showed pulse
      - Mobile (already logged in) receives push notification with deeplink
      - Click ball badge → chat injects aggregated message with [sub-task #1] anchors
      - Force-stalled task (60min mock) → amber pulse + 3 buttons
      - Click [Abort] → task cancels successfully
    - Build .exe + bump version
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 4.10 Tests for long-task / stalled / abort flows
    - jest mock 30s timer → verify task moves to background
    - jest cron scheduler → mock `now()` advance,verify SubTaskStalled emitted
    - integration test: 4 channels all emit on completion (mock channel handlers)
    - _Requirements: 9.1-9.7_



- [ ] 5. W5 — 失败 / 冲突 + 经济属性 + 周报 (1 sprint, 5-7 days)
  > Wave goal: agent_cost_records 自动写每个 sub-task LLM call,完成时
  > 写汇总行;Pro 模式周报视图 + CSV 导出。Sub-task 失败时 lane 红
  > 边 + Rollback / Open diff 按钮;两个 sub-task 写同 branch 冲突
  > 时弹 Conflict_Resolver_Modal。
  > Branch: `feat/multi-agent-w5-economy-reliability`
  > **Wave 末尾跑 7 个 correctness property regression tests**

  - [ ] 5.1 Migrations — Part 3 (cost record + productivity snapshot)
    - Generate migration `2026-07-01-multi-agent-schema-part3.ts`:
      - `ALTER TABLE agent_cost_records ADD COLUMN parent_task_id uuid NULL`
      - `ALTER TABLE agent_cost_records ADD COLUMN event_type varchar(32) NULL`
      - `CREATE INDEX idx_acr_parent_task ON agent_cost_records(parent_task_id, created_at DESC)`
      - `CREATE TABLE pet_productivity_snapshot (...)` per design §2.2 新增 7
      - `ALTER TYPE battle_mode ADD VALUE IF NOT EXISTS 'task_arena'`
      - `ALTER TYPE battle_mode ADD VALUE IF NOT EXISTS 'tournament'`
      - `ALTER TYPE battle_mode ADD VALUE IF NOT EXISTS 'arena_room'`
      - `ALTER TABLE world_engine_battles ADD COLUMN subject_kind varchar(16) NULL`
    - Update `backend/src/entities/agent-cost-record.entity.ts` + create `pet-productivity-snapshot.entity.ts`
    - **NOTE**: v1 code 永远不写 task_arena/tournament/arena_room/subject_kind values (Property 6) — verified by W5.10 lint
    - _Requirements: 10.1, 13.2, 15.1, 15.2_
    - _Design: §2.2 新增 4, 7, 8_

  - [ ] 5.2 Backend — cost-tracker AsyncLocalStorage parent_task_id propagation
    - In `cost-tracker.service.ts`:
      - Add `AsyncLocalStorage<{ parentTaskId?: string }>` context
      - Worker calls `runWithContext(parentTaskId, () => ...)` around tool execution
      - `persistCost()` reads `als.getStore()?.parentTaskId` and writes to record
      - `event_type` defaults to `'llm_call'`,callers can override (e.g. tool_call,sub_task_complete)
    - _Requirements: 10.1, 10.2_
    - _Design: §12.1_

  - [ ] 5.3 Backend — sub-task completion writes summary cost row
    - In `agent-task.worker.ts` finally block (terminal status):
      - Sum `agent_cost_records WHERE parent_task_id=task.id AND event_type='llm_call'`
      - Write one row: `{ userId, agentId, sessionId, parent_task_id: task.id, event_type: 'sub_task_complete', costUsd: total, ...}`
      - Wrap in try/catch — on DB outage,enqueue to `cost-tracker.deadletter` BullMQ queue (existing); task itself does NOT fail (R10.4)
    - Update `task.costUsd` field with the same total
    - _Requirements: 10.3, 10.4_
    - _Design: §12.2, §12.3_

  - [ ] 5.4 Backend — daily budget warning + 100% refusal
    - In `agent-task.worker.ts` after each cost write:
      - Calculate today's total cost for user
      - Get user budget from `userBudgetService` (existing)
      - At 80% → emit `agentrix:budget-warning` event with `{ level: 80, used, budget }` (only once per day per user — flag in cache)
      - At 100% → set `userFlagService.set(userId, 'agent_run_refused', true)`
    - In `agent-task-spawn.service.ts dispatch` flow,check this flag at entry; if set → return `budget_exhausted` error,Leader surfaces to user inline
    - Reset flag at midnight UTC+8 via `agent-presence.scheduler` cron
    - _Requirements: 10.6_
    - _Design: §12.4_

  - [ ] 5.5 Backend — `multi-agent-summary` module + weekly aggregation cron
    - Create `backend/src/modules/multi-agent-summary/`:
      - `multi-agent-summary.module.ts` + `service` + `controller`
      - `GET /api/multi-agent/weekly-summary?userId=...` returns cached result
      - `GET /api/multi-agent/team-activity-report?userId=...&format=csv&days=30` returns CSV (reuse `analytics` module CSV pattern)
    - Service `computeWeeklySummary(userId)`:
      - Aggregate past 7 days of `agent_cost_records WHERE event_type='sub_task_complete'`
      - Return `{ weekStart, totalSubTasks, totalCostUsd, topPets[3], topExpensiveSubTasks[3] }`
    - Cron in `agent-presence.scheduler.ts` `@Cron('0 2 * * *')` (daily 02:00 UTC+8):
      - For each active user → compute summary → cache in Redis with 26h TTL
      - Per-pet productivity snapshot: upsert into `pet_productivity_snapshot` (R15.3 — v1 writes,v2 W8 reads)
    - _Requirements: 11.6, 15.3_
    - _Design: §12.5, §12.6_

  - [ ] 5.6 Desktop UI — `TeamWeeklyCard` (Pro Mode only)
    - Create `desktop/src/components/TeamWeeklyCard.tsx`:
      - Conditionally rendered when `useUserMode() === 'pro'`
      - Embed in Pet Tab AND Me Tab desktop layouts (per §15.4 decision — both tabs show)
      - Fetch via `GET /api/multi-agent/weekly-summary` SWR
      - Renders metrics per design §12.5:
        - Total Sub_Tasks number
        - Total cost USD
        - Top 3 contributing pets (avatar + name + count + cost)
        - Top 3 most expensive Sub_Tasks
      - Click any pet → AgentTeamPanel filtered by agentId
      - "Open Full Report" button → opens `TeamActivityReportPanel`
    - For Simple Mode: render single line "本周阿喵帮你完成了 N 件事 ✨" in Pet Tab top strip,no USD/token (R11.5)
    - Empty state per R11.7
    - _Requirements: 11.1, 11.2, 11.5, 11.7_
    - _Design: §12.5_

  - [ ] 5.7 Desktop UI — `TeamActivityReportPanel` + CSV export
    - Create `desktop/src/components/TeamActivityReportPanel.tsx`:
      - Pro-only full panel with filters: pet / date range / status
      - Reads from `GET /api/multi-agent/team-activity-report`
      - "Export CSV" button → triggers download via existing `analytics.downloadCsv()` flow
    - _Requirements: 11.3, 11.4_
    - _Design: §12.7_

  - [ ] 5.8 Backend — `pet-team-coordinator` for conflict detection
    - Create `backend/src/modules/pet-team-coordinator/`:
      - `pet-team-coordinator.module.ts` + service
      - `attemptMerge(laneId, target)` method:
        - First merge succeeds via `git merge --no-ff`
        - Subsequent merges check if base SHA changed → `LaneConflict` event with `{ laneAId, laneBId, conflictFiles[] }`
        - Refuse second merge until conflict resolved
      - Listen for `lane_completed` event,call `attemptMerge`
    - _Requirements: 12.3_
    - _Design: §8.2_

  - [ ] 5.9 Desktop UI — failure recovery + `ConflictResolverModal`
    - In `WorktreePanel.tsx`:
      - When lane.status='blocked' → red border + inline buttons [Rollback] [Open diff]
      - [Rollback] → `POST /api/worktree-lanes/:id/rollback` → lane removed + toast
      - [Open diff] → navigate to existing `WorkspaceDiffWorkbench` filtered to lane.worktreeBranch
      - When `LaneConflict` event received → both lanes render ⚠️ conflict yellow badge → click → opens `ConflictResolverModal`
    - Create `desktop/src/components/ConflictResolverModal.tsx` per design §8.3:
      - 3-column: lane A hunks / base / lane B hunks
      - Buttons: [Keep mine] / [Keep theirs] / [Edit manually] (Open in IDE flow from pro-mode-coding-views-2026-05 spec)
    - Simple Mode failure: friendly recovery prompt per R12.5 ("阿喵 卡住了 — 要让另一只宠物试试吗?") — yes triggers same backend rollback
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
    - _Design: §8.1, §8.2, §8.3, §8.5_

  - [ ] 5.10 Backend — out-of-scope detection on sub-task complete
    - In `agent-task.worker.ts` validation step before merge:
      - List files modified by the sub-task
      - Check each against `task.scope.workspace_paths` glob
      - If any violation → set `task.status = 'out_of_scope'`,refuse merge,append `agent_task_log { eventType: 'rollback',reason: 'out_of_scope_violation',violations }`
      - Pro Mode user sees in-panel approval modal to accept off-scope diff anyway
      - Simple Mode never sees out-of-scope concept,just gets rollback prompt
    - _Requirements: 12.7_
    - _Design: §8.4_

  - [ ] 5.11 CI lint rule for v2 placeholder field write protection (Property 6)
    - Create `scripts/lint/forbid-v2-fields.mjs` AST script:
      - Scan TypeScript: any TypeORM `repo.update/insert/save` with field `hired_from_user_id` / `subject_kind` non-null,or `mode in ('task_arena','tournament','arena_room')`
      - Scan SQL files: any INSERT/UPDATE matching same patterns
      - Exit 1 with helpful message including violating file:line
    - Add to `package.json` scripts: `"lint:forbid-v2": "node scripts/lint/forbid-v2-fields.mjs"`
    - Add to CI in `.github/workflows/...` as required check on all v1 sprint branches (W1-W5)
    - _Requirements: 13.3, 15.1, 15.2_
    - _Design: §17 Property 6_

  - [ ] 5.12 Wave 5 verification + 7 correctness property regression
    - tsc + cargo + vitest + jest backend tests pass
    - Manual checklist:
      - Spawn sub-task → cost recorded per LLM call + summary row on completion
      - Pro Mode opens AgentTeamPanel → TeamWeeklyCard shows numbers
      - Click "Export CSV" → CSV downloads with 30 days of records
      - Force daily budget to 80% → inline warning appears
      - Hit 100% → next agent_run rejected with budget_exhausted
      - Sub-task fails → lane red border + Rollback works,worktree clean
      - Two sub-tasks merge same branch → second hits LaneConflict → modal opens
      - Out-of-scope file write → status = out_of_scope,rollback prompt
    - **Run 7 correctness property regression suite**:
      - Property 1: cycle detection — try parent_task A → B → C,then B → A → reject
      - Property 2: 5 concurrent spawn → 5th rate-limited
      - Property 3: kill DB during sub-task completion → DLQ has the failed cost write
      - Property 4: two workers grab same lane → optimistic lock; second fails
      - Property 5: Simple Mode UI snapshot — grep no agent_id / branch / USD
      - Property 6: `npm run lint:forbid-v2` returns 0 (no violations)
      - Property 7: e2e timer,spawn sub-task → ball badge updated within 3s
    - Build .exe + bump version → **v0.7 series complete = v1 ship gate**
    - _Requirements: 10.1-10.6, 11.1-11.7, 12.1-12.7, 13.3, 15.1, 15.2_
    - _Design: §17 全部 7 个 property_

  - [ ]* 5.13 Backend tests for cost log + conflict + budget gate
    - jest: cost-tracker AsyncLocalStorage propagation
    - jest: sub-task completion writes summary row,DB outage → DLQ
    - jest: 80% / 100% budget gating
    - jest: pet-team-coordinator detects conflict on second merge
    - jest: out_of_scope_violation logged to agent_task_log
    - _Requirements: 10.1-10.6, 12.1-12.7_



---

## v1 Ship Gate (W5 完成后,launch+30-60 天)

W1-W5 全部 task 完成后,**v1 = R1-R12 全部 ship**:
- ✅ R1-R5 (W1) — UI 暴露 + 数据接线
- ✅ R1-R2 (W2) — Spawn 协议 + Timeline
- ✅ R6-R8 (W3) — Pet bridge + Pro Mode 编辑
- ✅ R9 (W4) — 长任务 + 4 通道回流
- ✅ R10-R12 (W5) — 经济记账 + 周报 + 失败回滚
- ✅ 7 个 correctness property regression test 全过
- ✅ R13-R15 schema-only(v1 永不写,v2 W6-W8 激活)

PM signoff 后 v1 进入生产。v2 (W6-W8) 作为 post-launch sprint 推进。

---

## v2 — Post-launch sprints

- [ ] 6. W6 — World Engine 整合 (1 sprint, 5-7 days, **OPTIONAL**)
  > Wave goal: 把 World Engine 4 阶段链路(reconstruction → AI
  > interpretation → character generation → battle prep)在
  > AgentTeamPanel 渲染为 task graph,Simple Mode 折叠成一句话。
  > Branch: `feat/multi-agent-w6-world-engine-viz`
  > Feature flag: `multi_agent_world_engine_visualization` 默认 OFF;
  > 如果 v1 资源紧 → 跳过整个 W6,flag 永远 OFF,v1 不被影响。

  - [ ] 6.1 Backend — `world-engine.service.ts` emit 4-stage agent_spawn events
    - In `world-engine.service.ts runScan()`:
      - When user submits scan via existing `WorldEngineScannerScreen`,iterate 4 stages
      - For each stage create `agent_tasks` row with `parent_task_id` = previous stage (chain pattern,not tree)
      - Stages: `reconstruction` / `ai-interpretation` / `character-generation` / `battle-prep`
      - Emit `agent_spawn` log on each stage start,`agent_result` on completion
      - All 4 stages share `target_kind = 'leader-direct'` (not user chat-driven)
    - Skip emission when feature flag `multi_agent_world_engine_visualization` is off
    - _Requirements: 14.1, 14.2, 14.5_
    - _Design: §14.1_

  - [ ] 6.2 Desktop UI — `AgentTeamPanel` Task Graph rendering
    - Add a "Task Graph" collapsible section to `AgentTeamPanel.tsx` below "Active Sub-Tasks"
    - Render `agent_tasks` with non-null `parent_task_id` as a tree:
      ```
      📷 World Asset Generation (run #abc)
        ├── ✅ reconstruction (12s · $0.01)
        ├── 🔄 ai-interpretation (45% · $0.08)
        ├── ⏸ character-generation (queued)
        └── ⏸ battle-prep (queued)
      ```
    - Each row: stage name + emoji status + duration + cost + click → details
    - _Requirements: 14.2, 14.3_
    - _Design: §14.2_

  - [ ] 6.3 Simple Mode — collapse 4 stages into one ambient line
    - In `TeamActivitySurface.tsx`,detect `parent_task_id` chain depth ≥ 2
    - Collapse to: `📷 阿喵 正在让你的玩具变成游戏角色…`
    - Show only root task + currently active stage
    - _Requirements: 14.4_
    - _Design: §14.3_

  - [ ] 6.4 Backend — battle outcome rebroadcast as agent_result
    - In `world-engine.battle.controller.ts emitWorldEngineBattlePending`:
      - Existing emits to companion-presence channel; add parallel emit to multi-agent SubTask channel as `agent_result` event when battle resolves
    - _Requirements: 14.6_
    - _Design: §14.1_

  - [ ] 6.5 Wave 6 verification
    - Toggle feature flag ON in staging
    - Manual: scan a real-world object → 4 stages appear in AgentTeamPanel
    - Simple Mode: stages collapse into one line
    - Battle outcome triggers agent_result event in timeline
    - _Requirements: 14.1-14.6_

- [ ] 7. W7 — 跨用户 A2A 雇佣 v2 (2 sprints, 10-14 days, post-launch)
  > Wave goal: 当 leader 找不到匹配 role 的 team member 时,提供雇佣
  > marketplace pet 选项;雇佣的 pet 在卖方设备运行,通过 escrow 结算。
  > Branch: `feat/multi-agent-w7-marketplace-hire`
  > **此 wave 触发首个 marketplace + a2a 联动**。

  - [ ] 7.1 Backend — unblock `marketplace-hire` target_kind in agent-task-spawn
    - Remove the `not_implemented_in_v1` check in `agent-task-spawn.service.ts dispatch()`
    - When `target = 'marketplace-hire'`:
      - Call `pet-a2a-dispatch.service.ts dispatchToMarketplace(role, prompt, budget)` (existing)
      - On accept → escrow `pet-a2a` reserves USD,sub-task hits hired pet's owner device
      - Set `agent_tasks.hired_from_user_id = sellerUserId`
    - _Requirements: 13.1, 13.4_
    - _Design: §13.1, §13.3_

  - [ ] 7.2 Desktop UI — Leader 询问 marketplace hire CTA
    - When `selectMember()` returns null AND user has marketplace opt-in,Leader inject:
      "团队没有 ${role} 角色 — 要从 marketplace 雇佣?约 $X (escrow)。 [是] [用 anonymous 替代]"
    - On [是] → call spawnTool with `target: 'marketplace-hire'`
    - On [用 anonymous] → fallback to `target: 'local-anonymous'`
    - _Requirements: 13.5_
    - _Design: §13.3_

  - [ ] 7.3 Backend — privacy boundary enforcement
    - Hired pet receives ONLY: prompt + scope.tools (whitelist) + budget,NO workspace files / chat history
    - All output sent back via encrypted channel,audit logged in `pet-a2a-dispatch` table
    - Settle escrow on success,refund on failure
    - _Requirements: 13.5_
    - _Design: §13.4_

  - [ ] 7.4 Desktop UI — Pet detail "earned from work" badge
    - Pet owners see when their pet was hired,how much it earned (Pro Mode); Simple Mode shows friendly "你的 [pet] 帮 N 个人完成了任务,赚了 X AXP"
    - _Requirements: 13.5_

  - [ ] 7.5 Wave 7 verification
    - Two test users (A, B): A's pet listed in marketplace,B's leader requires that role,B sees hire CTA → confirms → A's pet runs the task → A receives AXP,B sees result
    - _Requirements: 13.1-13.5_

- [ ] 8. W8 — Pet Arena = multi-agent collab 的对抗 mode (2 sprints, 10-14 days, post-launch)
  > Wave goal: 在已 ship 的 multi-agent 底座上加 Pet Arena 对抗 mode。
  > AgentTeamPanel 加 "Arena" tab; Pet vs Pet 模式由 Battle.mode +
  > subject_kind 字段激活; ladder 用 v1 已写的 pet_productivity_snapshot
  > 计算。
  > Branch: `feat/multi-agent-w8-pet-arena`

  - [ ] 8.1 Backend — activate `task_arena` / `tournament` / `arena_room` battle mode
    - In `world-engine.battle.controller.ts`:
      - Allow writing `mode = 'task_arena' | 'tournament' | 'arena_room'`
      - Allow writing `subject_kind = 'living_pet' | 'world_asset'`
    - Remove from CI lint allow-list (`scripts/lint/forbid-v2-fields.mjs` exclusion for W8 branch)
    - _Requirements: 15.1, 15.2_
    - _Design: §14.5_

  - [ ] 8.2 Backend — `pet-arena` module
    - Create `backend/src/modules/pet-arena/` with:
      - Match-maker: pair pets by productivity_score
      - Tournament bracket
      - Ladder query: read `pet_productivity_snapshot` aggregated past 4 weeks
    - _Requirements: 15.3_
    - _Design: §14.5_

  - [ ] 8.3 Desktop UI — AgentTeamPanel Arena tab
    - Activate the Arena tab in `<TabBar>` header that v1 already structured (R15.5 future-proof)
    - Tab content: ladder + my pet's standings + match invite UI
    - _Requirements: 15.5_
    - _Design: §14.7_

  - [ ] 8.4 Pet detail screen — productivity score display
    - Show pet's "productivity score" (sum from `pet_productivity_snapshot` last 4 weeks)
    - Pro Mode: detailed breakdown
    - Simple Mode: friendly metric only
    - _Requirements: 15.3_
    - _Design: §14.5_

  - [ ] 8.5 Wave 8 verification
    - End-to-end Arena flow: pet ranks on ladder,2 pets matched,battle outcome,winner gets AXP/reputation
    - _Requirements: 15.1-15.5_

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": "W0",
      "name": "Pre-flight audit & migration scaffolding",
      "depends_on": [],
      "tasks": ["0.1", "0.2", "0.3", "0.4"],
      "deliverable": "compat audit doc + bullmq + flag system verified",
      "estimate_sprints": 0.5
    },
    {
      "id": "W1",
      "name": "UI exposure + data wiring",
      "depends_on": ["W0"],
      "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10"],
      "deliverable": "AgentTeamPanel top-level + WorktreeLane × agent_id + Simple Mode CompanionBall badge",
      "requirements_covered": ["R3", "R4", "R5"],
      "estimate_sprints": 1
    },
    {
      "id": "W2",
      "name": "Spawn protocol",
      "depends_on": ["W1"],
      "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10"],
      "deliverable": "agent_run tool + 3 timeline event kinds + [sub-task #N] anchor",
      "requirements_covered": ["R1", "R2"],
      "estimate_sprints": 1
    },
    {
      "id": "W3",
      "name": "Pet bridge (LivingPet ↔ AgentAccount)",
      "depends_on": ["W2"],
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10"],
      "deliverable": "Bind pets as members + Pro Mode MemberSettingsModal + budget cap by tier",
      "requirements_covered": ["R6", "R7", "R8"],
      "estimate_sprints": 1
    },
    {
      "id": "W4",
      "name": "Long tasks + 4-channel reflux",
      "depends_on": ["W2"],
      "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9"],
      "deliverable": "30s background mode + companion ball / lock-screen / push / chat aggregation",
      "requirements_covered": ["R9"],
      "estimate_sprints": 1
    },
    {
      "id": "W5",
      "name": "Economy + reliability + v1 ship gate",
      "depends_on": ["W3", "W4"],
      "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "5.12"],
      "deliverable": "agent_cost_records summary row + weekly card + rollback / conflict modal + 7 correctness property regression",
      "requirements_covered": ["R10", "R11", "R12"],
      "ship_gate": "v1 launch — R1-R12 all green",
      "estimate_sprints": 1
    },
    {
      "id": "W6",
      "name": "World Engine task graph integration (OPTIONAL)",
      "depends_on": ["W5"],
      "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5"],
      "deliverable": "4-stage scan → AI → generation → battle-prep visualized as task graph in AgentTeamPanel",
      "requirements_covered": ["R14"],
      "feature_flag": "multi_agent_world_engine_visualization",
      "phase": "post-launch",
      "estimate_sprints": 1,
      "skippable": true
    },
    {
      "id": "W7",
      "name": "Cross-user A2A marketplace hire",
      "depends_on": ["W5"],
      "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"],
      "deliverable": "Marketplace pet hire via existing pet-a2a escrow + privacy boundary enforcement",
      "requirements_covered": ["R13"],
      "phase": "post-launch",
      "estimate_sprints": 2
    },
    {
      "id": "W8",
      "name": "Pet Arena = multi-agent collab adversarial mode",
      "depends_on": ["W5"],
      "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5"],
      "deliverable": "Activate task_arena/tournament/arena_room battle modes + ladder UI in AgentTeamPanel Arena tab",
      "requirements_covered": ["R15"],
      "phase": "post-launch",
      "estimate_sprints": 2
    }
  ],
  "ship_gates": [
    {
      "name": "v1 ship",
      "after_wave": "W5",
      "criteria": [
        "All R1-R12 tasks complete",
        "All 7 correctness property regression tests pass",
        "tsc + cargo + vitest + jest + playwright all green",
        "Real-device install verified",
        "PM signoff"
      ]
    }
  ]
}
```

ASCII summary for humans:

```
W0 (audit) ──┬─→ W1 (UI exposure) ──┬─→ W2 (spawn) ──┬─→ W3 (pet bridge) ──┐
             │                       │                │                     │
             └──→ all migrations     └──→ all 4 channels                    │
                                                                            ▼
                                                            W4 (long task) ──┬─→ W5 (economy + reliability)
                                                                              │
                                                                              ▼
                                                                        ◆ v1 SHIP GATE ◆
                                                                              │
                                                                              ▼
                                                            W6 (World Engine viz) ──┐ optional
                                                            W7 (marketplace hire)   │ post-launch
                                                            W8 (Pet Arena)          │ ladder
```

Wave-level dependency rules:

- **W2 depends on W1** — migration part 1 (`agent_tasks.parent_task_id`,
  `target_kind`,`worktree_lanes` table) must land before spawn protocol
- **W3 depends on W2 + W1** — spawn protocol routes to pet members,UI
  panel hosts member cards
- **W4 depends on W2** — timeline event types must exist for background
  task badges to render
- **W5 depends on W3 + W4** — cost logging needs pet bridge,reliability
  needs background-tasks store
- **W5 末尾 = v1 ship gate** — 所有 R1-R12 + 7 correctness property pass
- **W6 / W7 / W8 are post-launch,each independent of others** — can
  parallel,can defer,can skip (W6 with feature flag off doesn't affect
  v1 behaviour)

Within a wave,task-level order matters:
- Migration tasks (X.1) always first — entities depend on schema
- Backend services (X.2-X.5) before client code
- UI tasks (X.5-X.9) consume backend
- Verification (X.last numeric) gates the wave

## Notes

### 选项 A 决策(see [`MULTI_AGENT_PRIORITIZATION §5`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md#5-决策建议))

Multi-agent v0/v1 优先于 Pet Arena spec。本 tasks.md 是单 spec
`multi-agent-collaboration-2026-06` 的全部实现 plan;Arena 在 W8 作为
本 spec 的对抗 mode 落地,不开独立 spec(数据模型 / Panel UI / sub-agent
事件流全部复用)。

### 5 个 Open Question 决策(see [`design.md §15`](./design.md#15-决策记录等-pm-拍板的-5-个-open-question))

| # | Question | Default Decision (codified in tasks) |
|---|----------|-------------------------------------|
| 1 | A vs B vs C | **A** — 已 PM 拍板 |
| 2 | Simple Mode 团队工作球放哪 | **CompanionBall 加 badge** (W1 task 1.8) |
| 3 | LivingPet 接 AgentAccount 是否需要重新 approval | **是** — 第一次 bind 弹一次 (W3 task 3.5) |
| 4 | 经济周报放哪 tab | **Me + Pet 两个都放** (W5 task 5.6) |
| 5 | v2 W8 Arena opt-in/opt-out | **opt-in** — 留给 W8 spec(本 spec 不决定) |

### 已 ship 资产边界

per design §1.2,以下文件**只 extend,不重写** (详细清单见 Appendix E)。

### Velocity-window 政策

per AGENTS.md 2026-05-10 决定:
- 各 wave feature branch push 自动批准
- v1 ship 时 merge → `main` **需要 PM 显式 approval**(唯一例外)
- 后端 SSH deploy + migration:run + pm2 restart 自动批准

### Test task 命名约定

带 `*` suffix(如 `2.11*`)= optional test task,按 Kiro spec format 表示
single-task 不做不阻塞,但**wave verification (X.last) 必须通过**才算
wave 完成。CI 跑 lint / vitest / jest / playwright 永远必跑。

### 总 wave 时间预估

- v1 (W0-W5):W0 = 0.5 sprint,W1-W5 = 5 sprint;total ~5.5 sprint =
  launch+30-60 天目标
- v2 (W6-W8):W6 optional 1 sprint;W7 = 2 sprint;W8 = 2 sprint;total
  3-5 sprint post-launch



## Appendix B: R → Wave 完整映射

| Requirement | Wave | Tasks |
|-------------|------|-------|
| R1 (Leader spawn) | W2 | 2.1, 2.2, 2.4, 2.5 |
| R2 (timeline visible) | W2 | 2.6, 2.7 |
| R3 (Agent_Team_Panel 顶层) | W1 | 1.5, 1.6 |
| R4 (Lane × agent) | W1 | 1.1, 1.2, 1.7 |
| R5 (Simple Mode ball) | W1 | 1.8, 1.9 |
| R6 (Pet member preference) | W3 | 2.3 (W2 selector), 3.1, 3.2 |
| R7 (LivingPet ↔ AgentAccount) | W3 | 3.1-3.5, 3.8, 3.9 |
| R8 (Pro Mode 编辑) | W3 | 3.6, 3.7 |
| R9 (Long task + 回流) | W4 | 4.1-4.9 |
| R10 (Cost log) | W5 | 5.1-5.4 |
| R11 (Pro Mode 周报) | W5 | 5.5-5.7 |
| R12 (失败 / 冲突) | W5 | 5.8-5.10 |
| R13 (跨用户 A2A v2) | W7 (post) | 7.1-7.5 (v1 schema-only in 1.1, 5.11) |
| R14 (World Engine 整合) | W6 (post,optional) | 6.1-6.5 |
| R15 (Pet Arena 数据预留) | W5 (v1 write) + W8 (v2 read) | 5.1, 5.5 (v1) + 8.1-8.5 (v2) |

## Appendix C: 测试 sub-tasks 命名规则

每个测试 task 用 `*` suffix(如 `2.11*`),按 Kiro spec format 表示
optional 测试任务。每个 wave 的 lint / vitest / jest / playwright 都
是 *.optional* 但**不进 production 时不能跳过**。

## Appendix D: Branch & merge 流程

- 每个 wave 切独立 feature branch:`feat/multi-agent-wN-...`
- Wave 内 task 完成顺序遵循上方序号
- Wave 末尾 PR merge 回 `perf/desktop-pre-launch-p1`
- v1 ship 时 merge `perf/desktop-pre-launch-p1` → `main`(per AGENTS.md
  velocity-window 政策,**仅 v1 ship 这一次** main push 需要 PM 显式
  approval,不在 auto-approve 列)

## Appendix E: 已 ship 资产复用清单(精确版)

per design §1.2,以下文件**只 extend,不重写**:

**桌面**:
- `desktop/src/components/WorktreePanel.tsx` (W1 1.7)
- `desktop/src/components/TaskWorkbenchPanel.tsx` (W1 1.6 — hide section only)
- `desktop/src/components/TaskTimeline.tsx` (W2 2.6 — extend rendering)
- `desktop/src/components/chatPanel/ChatTitleBar.tsx` (W1 1.6 — add menu item)
- `desktop/src/services/agentTools/registry.ts` (W2 2.5 — register agent_run)
- `desktop/src/components/PetCompanionWindow.tsx` (W1 1.8 — add badge)
- `desktop/src/components/chatPanel/useStreamingTurn.ts` (W4 4.1 — bg threshold)

**后端**:
- `backend/src/modules/agent-team/agent-team.service.ts` (W2 2.3 — add selectMember)
- `backend/src/modules/agent-task/agent-task.service.ts` (W2 2.2 — leverage create)
- `backend/src/modules/agent-task/agent-task.worker.ts` (W2 2.4 / W4 4.2 / W5 5.3 — extend)
- `backend/src/modules/cost-tracker/cost-tracker.service.ts` (W5 5.2 — AsyncLocalStorage)
- `backend/src/modules/agent-presence/agent-presence.scheduler.ts` (W4 4.2 / W5 5.5 — add cron)
- `backend/src/modules/desktop-sync/...` (W4 4.4 — add lock-screen channel)

**Entities (extend only)**:
- `backend/src/entities/agent-task.entity.ts` (W1 1.1)
- `backend/src/entities/agent-cost-record.entity.ts` (W5 5.1)
- `backend/src/entities/living-pet.entity.ts` (W3 3.1)

**Migrations 总览**:
- 2026-06-01-multi-agent-schema-part1 (W1 1.1)
- 2026-06-15-multi-agent-schema-part2 (W3 3.1)
- 2026-07-01-multi-agent-schema-part3 (W5 5.1)
