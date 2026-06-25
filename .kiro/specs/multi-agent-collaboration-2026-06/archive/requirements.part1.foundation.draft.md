# Requirements Part 1 — Foundation & Vision

> Read alongside: [`requirements.md`](requirements.md) (index)

---

## Introduction

Multi-Agent Collaboration v0/v1 is the productization of Agentrix's
A_Path differentiator number 4 (per
[`docs/agentrix-positioning-2026-05.zh-CN.md`](../../../docs/agentrix-positioning-2026-05.zh-CN.md)
section 3.2). The platform already has an unusually deep stack of
multi-agent backend modules and partial desktop scaffolding (see
[`docs/GAMES_INVENTORY_2026-05-25.zh-CN.md`](../../../docs/GAMES_INVENTORY_2026-05-25.zh-CN.md)
section 3 and [`docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md)
section 2.1) but **the user cannot trigger any of it from the main
chat**. v0/v1 is therefore a **wiring + visibility** sprint cluster,
not a from-scratch architecture project.

The model follows the 5-layer composition from
[`docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md`](../../../docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md)
section 5.1:

```
Layer 5: Marketplace (cross-user agent hire)        ← Agentrix-unique
Layer 4: Living Pet (long-lived agent / soul)       ← Agentrix-unique
Layer 3: Worktree / Task (parallel sandbox)         ← learned from Codex
Layer 2: Sub-agent dispatch (master + ephemeral)    ← learned from Claude Composer
Layer 1: Single-agent chat (the master)             ← industry baseline
```

v1 covers Layers 1-4. Layer 5 (cross-user A2A hire) and the Pet Arena
opt-in mode are deferred to v2 in tasks.md but their data shape is
called out in this spec so v1 schema does not have to break later.

**Core design principles** (carried forward from the research doc and
binding for design.md):

1. **The main chat does not render multiple agent voices.** The user
   always converses with a single leader. Multi-agent execution is
   visible as **lanes / cards / progress**, not as another chat stream.
   Codex / Composer / Tencent Jarvis all converged on this; ignoring
   it produces "noisy" multi-agent UX users reject.
2. **Sub-agents are observable, not hidden.** Codex's silent
   sub-agents and Composer's invisible spawns make users doubt that
   anything multi-agent is actually happening. Agentrix renders every
   spawn / dispatch / result event in `TaskTimeline` with role +
   progress + result.
3. **Reuse before rebuild.** Every requirement in this spec must list
   the **already-shipped** module or component it builds on. New
   entities are only added when an existing one cannot be extended
   with a single nullable column.
4. **Simple Mode visibility is mandatory, not optional.** Pro-only
   multi-agent would violate positioning section 3.2 ("default Simple,
   one-click Pro"). At minimum a non-coder user must see "5 pets are
   working" in an ambient surface (companion ball / Pet Hub strip)
   without entering Pro Mode.
5. **Economic accounting is not opt-in.** Every sub-task that costs
   tokens / API calls writes to `agent_cost_records` (already shipped
   table) regardless of whether the user is in Pro or Simple Mode.

**Out of scope** (do not let these creep in):

- ❌ VS Code / Cursor extension wiring (P3 spec, separate)
- ❌ Cross-device lane (lane that physically moves between phone /
  desktop / server) — that is post-launch P1 in cross-platform PRD,
  not this spec
- ❌ A new chat UI for multi-agent — existing main chat must work;
  changes are additive panels and event renderers
- ❌ Pet Arena UI surface — absorbed as v2 W8, not v1
- ❌ Generic prompt-engineering improvements unrelated to multi-agent

---

## Glossary

> **Convention**: `Like_This` for spec terms, `like_this` for code
> identifiers, `Like_This_Module` for backend module names that already
> exist on disk.

### Roles and entities

- **Leader_Pet / Leader_Agent** — The single agent the user converses
  with in the main chat. Owns the master memory, decides when to
  spawn / dispatch. In v0/v1 this maps 1:1 to the user's main
  `LivingPet` (already shipped concept) or, if no pet is bound, to a
  generic `AgentAccount`.
- **Member_Pet** — A `LivingPet` (other than the leader) that the user
  has explicitly added to a `Pet_Team`. Member pets can be assigned
  sub-tasks and have their own scope / budget / role. Backed by the
  shipped `Pet_Team_Module`.
- **Sub_Agent** — An ephemeral agent process spawned by the leader to
  carry out a sub-task. May be:
  - **Anonymous** (no pet identity, lives only for the task duration)
    — analogous to Claude Composer's `agent_run` tool result
  - **Bound** (carries a Member_Pet identity) — Composer-style
    dispatch but the result is attributed to a specific Member_Pet
- **Agent_Team_Template** — A reusable role bundle (CEO / Architect /
  Coder / Reviewer / QA / etc.) the user provisions once and reuses
  across tasks. Backed by the already-shipped `agent-team` module
  with its 11-role default template.
- **Pet_Team** — The user's actual instance of a team, composed of one
  Leader_Pet and N Member_Pets. Backed by `pet-team` module.
- **Team_Task** — A user request that the Leader_Pet decomposes into
  multiple sub-tasks, each assigned to a sub-agent / member pet.
  Logged top-level into `agent-task` (already shipped); sub-tasks
  reference parent via `parent_task_id` (new column).

### Surfaces and events

- **Main_Chat** — `desktop/src/components/ChatPanelImpl.tsx` plus the
  existing `ChatTitleBar` / `InputZone` components. v0/v1 adds new
  events / tools but does not restructure the chat itself.
- **Task_Timeline** — `desktop/src/components/TaskTimeline.tsx`
  (already shipped). Already understands `agent_spawn`,
  `agent_invoke`, `agent_result` event kinds; v1 fills the actual
  event stream end-to-end.
- **Agent_Team_Panel** — A new top-level panel lifted out of the
  existing `TaskWorkbenchPanel.tsx` "Agent Team Sandbox (MVP)"
  section. Hosts team provision, member management, role editing,
  per-team activity. Replaces the Sandbox section in
  TaskWorkbenchPanel (which becomes a thin link to the panel).
- **Worktree_Panel** — `desktop/src/components/WorktreePanel.tsx`
  (already shipped). v1 extends each lane with an `agent_id` so the
  user can see which agent is on which lane.
- **Companion_Ball** — The desktop pet companion window (`desktop/src/
  components/PetCompanionWindow.tsx`) and its mobile equivalent. In
  v1 the ball gains a "team is working" ambient state.
- **Lock_Screen_Pet** — Mobile pet on lock screen (P9 redesign,
  shipped). v1 adds long-task rejoin notifications.

### Protocol terms

- **Spawn_Tool** — A new system-prompt-level tool the Leader_Pet can
  call to dispatch work. Schema:
  ```
  agent_run({
    role: string,            // e.g. "Coder", "Researcher"
    prompt: string,
    scope?: { paths?: string[]; readonly?: boolean },
    budget?: { maxUsd?: number; maxTokens?: number; maxMinutes?: number },
    target?: { kind: "anonymous" | "member_pet"; petId?: string }
  }) -> { taskId, statusUrl }
  ```
- **Dispatch_Decision** — The Leader_Pet's choice between calling
  `Spawn_Tool` itself (Layer 2) or routing to a Member_Pet (Layer 4)
  or proposing a marketplace hire (Layer 5, v2).
- **Spawn_Event** — A `TaskTimeline` row of kind `agent_spawn`
  containing `role`, `prompt summary`, `target`, `parentTaskId`.
- **Result_Event** — A `TaskTimeline` row of kind `agent_result`
  containing `taskId`, `status` (success / fail / cancelled),
  `summary text`, optional `costUsd`, optional `artifactPaths`.
- **Conflict_Event** — When two sub-tasks edit the same file path
  with non-mergeable changes. Surfaced as a Conflict_Card in the
  Task_Timeline (see Part 2 R6 and design section 8 to be drafted).

### Visibility tiers

- **Simple_Mode** — Default user mode. Sees only ambient summaries
  ("team is working", "X tasks done today") on companion ball / Pet
  Hub strip. Does not see lanes / role editor / cost numbers.
- **Standard_Mode** — Slightly more detail (a single timeline strip
  in the chat) but still no Pro-only widgets.
- **Pro_Mode** — Full panel access: Worktree_Panel, Agent_Team_Panel
  edit mode, per-task cost, role prompt editor, conflict resolution
  UI.

---

## Design Constraints / Tradeoff Notes

This section explains the non-obvious magic numbers and design
decisions so the design.md author does not treat them as arbitrary.

### Quotas and limits

- **Max sub-agents per Team_Task = 5 in v1**. Codex permits unlimited
  parallel containers; Composer's spawn graph in practice rarely
  exceeds 5; Jarvis's agent count is unspecified but the public demos
  use 3-4. Five is the lower of (a) the smallest Pet_Team headcount
  cap that does not require a workspace plan upgrade for free users
  (`WorkspacePlan.FREE.maxAgents = 3` from `workspace.service.ts` —
  a free user can lead 1 + dispatch up to 4 ephemeral Sub_Agents
  reusing 2 anonymous slots), and (b) the count beyond which
  TaskTimeline's per-row visual density becomes unreadable on a 1080p
  monitor.

- **Single sub-task budget cap = $0.50 USD or 5 minutes wall clock,
  whichever first**. Per-call cost ceiling matches existing
  `agent_cost_records` median outlier (p95 single-call cost in
  production telemetry as of 2026-05). 5 minutes is the longest a
  user will wait for a sub-task without explicit progress; longer
  tasks must enter "background mode" (R4 in Part 2).

- **Total Team_Task cap = $5 USD per task in v1**. Hard ceiling on
  user expense without explicit confirmation. Pro Mode users may
  raise via per-task budget control (R8 in Part 3).

### Time and timeout

- **Spawn ack timeout = 3 seconds**. If the Leader_Pet calls
  Spawn_Tool and `agent-task.create()` does not return a `taskId`
  within 3 s, the spawn surfaces as failed in TaskTimeline with
  retry button. 3 s is the existing `agent-task.controller.ts`
  worker handshake p99 latency.

- **Sub-task heartbeat = 10 seconds**. Sub_Agent must heartbeat to
  parent `agent-task` row at least every 10 s; missing heartbeat for
  30 s marks status `stuck`. Matches existing `agent-task.worker.ts`
  heartbeat cadence for parent tasks.

- **Conflict detection window = at the moment two sub-tasks both try
  to lock-acquire the same git worktree path**. Worktree per-task
  isolation is the primary defense (each sub-task gets its own
  branch); conflict only emerges at merge time.

### Schema reuse vs new columns

- **`agent_task` reuse**: Add `parent_task_id` (uuid, nullable) and
  `agent_account_id` (uuid, nullable) columns to existing
  `agent_tasks` table. No new table. Justification: 99 % of
  Team_Task work is already representable as a tree of agent_task
  rows; the new columns add the tree edges.

- **`pet_team` reuse**: Existing `pet-team` module already models
  leader + members + role + scope + daily budget. No new table.

- **`battle.mode` extension (deferred to v2 W8)**: When Pet Arena
  absorbed in v2, `world_engine.battles.mode` adds enum values
  `task_arena | tournament | arena_room` alongside the existing
  implicit `duel` mode.

- **`agent_cost_records` reuse**: Already writes per-call cost. v1
  adds nothing new; aggregation happens in a view / weekly job.

### Visibility / privacy

- **Sub-task prompt redaction**: When a Sub_Agent is shown to the
  user in Simple_Mode, only the role + first 80 characters of prompt
  + result summary are shown — full prompt is Pro-only. Justification:
  prompts may contain workspace path or user PII the non-coder user
  did not knowingly share with the Leader_Pet.

- **Cross-user A2A is opt-in (v2 R14)**: Default off. When enabled
  by user, the marketplace pet hire decision still requires explicit
  user approval per spawn (no autopilot). Per
  [`docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md`](../../../docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md)
  section 6 design principle 7.

### Existing-asset inventory (read-only, MUST reference in design)

> Anything below is on disk today. The design.md author MUST treat it
> as the foundation, not as future work.

#### Backend (NestJS)

| Module | Path | Status | Used by which Requirement |
|--------|------|--------|---------------------------|
| `agent-team` | `backend/src/modules/agent-team/` | Shipped — controller + service + 11-role default template + provision API | R1, R5, R8 |
| `agent-task` | `backend/src/modules/agent-task/` | Shipped — worker + Bedrock integration + log stream + cancel | R1, R4, R6 |
| `pet-team` | `backend/src/modules/pet-team/` | Shipped — LivingPet leader+member+role+scope+budget | R3, R8 |
| `pet-a2a` | `backend/src/modules/pet-a2a/` | Shipped — cross-pet escrow dispatch | R14, R15 (v2) |
| `agent-presence` | `backend/src/modules/agent-presence/` | Shipped — scheduler + operations dashboard | R4 |
| `agent-orchestration` | `backend/src/modules/agent-orchestration/` | Partial — needs investigation in design | R1 |
| `agent-context` | `backend/src/modules/agent-context/` | Shipped | R5 (cross-task context) |
| `agent-runtime` | `backend/src/modules/agent-runtime/` | Shipped | R1 |
| `agent_cost_records` (table) | various writes | Shipped — every call writes here | R13 |
| `world-engine` (battle, dungeon, scan) | `backend/src/modules/world-engine/` | Shipped Phase 1 | R12 (v2) |

#### Desktop (React + Tauri)

| Component | Path | Status | Used by which Requirement |
|-----------|------|--------|---------------------------|
| `WorktreePanel.tsx` | `desktop/src/components/WorktreePanel.tsx` | Shipped — Pro tier in ChatTitleBar More | R2 (extend with agent_id) |
| `TaskWorkbenchPanel.tsx` | same dir | Shipped — has "Agent Team Sandbox (MVP)" section | R5 (lift Sandbox to top-level Agent_Team_Panel) |
| `TaskTimeline.tsx` | same dir | Shipped — recognizes `agent_spawn / invoke / result` kinds; emits "🤖 Sub-Agents active" | R2, R5 (fill the event stream) |
| `inferAgentTeamRole()` | `TaskWorkbenchPanel.tsx` | Shipped — keyword classifier | Used by R5 fallback |
| `WorkspaceDiffWorkbench.tsx` | same dir | Shipped — Pro Mode raw diff | R6 (conflict UI builds on this) |
| `ChatTitleBar.tsx` More menu | `desktop/src/components/chatPanel/ChatTitleBar.tsx` | Shipped — `tier: "pro"` filter works | R2, R8 (add Agent Team entry) |
| `PetCompanionWindow.tsx` | `desktop/src/components/PetCompanionWindow.tsx` | Shipped — companion ball | R7 (Simple Mode ambient state) |
| `WorkspaceFileStatus.tsx` | same dir | Shipped — file status list | R6 |

#### Mobile (Expo)

| Surface | Path | Status | Used by which Requirement |
|---------|------|--------|---------------------------|
| Companion_Ball mobile | P9 redesign | Shipped — emits world-engine.battle-pending | R7 (extend with team-working state) |
| Lock_Screen_Pet | P9 redesign | Shipped | R4 (long-task rejoin) |
| Notifications inbox | `src/screens/inbox/` | Shipped | R4 |
| Pet Hub | `src/screens/pet/` | Shipped | R7 (add today's team strip) |

#### Shared types

| File | Status | Used by which Requirement |
|------|--------|---------------------------|
| `shared/types/agent-task.ts` | TBD investigate — design.md must enumerate fields actually present | All |
| `shared/types/agent-team.ts` | TBD investigate | R1, R5 |
| `shared/types/pet-team.ts` | TBD investigate | R3 |

> **Design.md responsibility**: Open each shared/types file, document
> the exact field shape, and propose the minimal additions for v1.
> No new shared/types file unless an existing one cannot host the
> field.

---

## Acceptance for Part 1

Part 1 is approved when:

- The reviewer can answer "is X already shipped?" for any component
  named in this part by checking the inventory tables above.
- The 5 design principles are no longer disputed (or amendments are
  recorded in this file before Part 2 review).
- Glossary terms are stable (Part 2-4 use them as-is).

When Part 1 is approved, proceed to Part 2 — Work Execution
Requirements.
