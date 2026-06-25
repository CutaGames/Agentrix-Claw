# Requirements Part 2 — Work Execution (R1-R6)

> Read alongside: [`requirements.md`](requirements.md) (index)
> Foundation: [`requirements.part1.foundation.md`](requirements.part1.foundation.md)

---

## Scope of this part

R1-R6 cover the **core work-execution loop**: how the user gets work
done with multi-agent help, from main-chat dispatch to long-task
rejoin to conflict resolution. This part is the heart of v0/v1 and
must be approved before Part 3 (cross-mode + Pet bridge) and Part 4
(economy + future).

The 6 requirements:

| # | Title | Wave | Layer |
|---|-------|------|-------|
| R1 | Leader_Pet can spawn sub-agents from main chat | W2 | L1 → L2 |
| R2 | Sub-agent activity is observable in TaskTimeline + WorktreePanel | W1 | L2 → L3 |
| R3 | Member_Pet (LivingPet bound) can receive sub-tasks | W3 | L4 |
| R4 | Long tasks survive app close + rejoin via companion ball / lock-screen / push | W4 | L3 |
| R5 | Agent_Team_Panel exists as a top-level surface (lifted from TaskWorkbench Sandbox) | W1 | L3 + L4 |
| R6 | Sub-task failure / git conflict surfaces with one-click rollback or manual resolve | W5 | L3 |

---

## Requirement 1 — Leader_Pet can spawn sub-agents from main chat

**User Story:** As a user (Simple or Pro) chatting with my Leader_Pet,
I want my pet to be able to dispatch part of a request to a sub-agent
so a complex task gets done faster than a single agent could manage,
without me having to manually orchestrate.

### Acceptance Criteria

1. WHEN the Leader_Pet is composing a turn AND the system prompt
   includes the Spawn_Tool tool definition, THE Leader_Pet SHALL be
   able to call `agent_run({ role, prompt, scope?, budget?, target? })`
   exactly as defined in the Glossary (Part 1).
2. WHEN `agent_run` is called, THE chat backend SHALL forward the
   call to `agent-task.create()` (existing service) with
   `parent_task_id` set to the current top-level Team_Task and
   `agent_account_id` set per `target` resolution rules in AC 4.
3. WHEN `agent-task.create()` returns a `taskId` within the 3-second
   spawn-ack timeout (Part 1 design constraints), THE chat backend
   SHALL emit a `Spawn_Event` to the chat session of kind
   `agent_spawn` containing `taskId`, `role`, `promptSummary` (first
   80 chars), `target`, `parentTaskId`.
4. WHEN `target.kind === "anonymous"`, THE chat backend SHALL provision
   an ephemeral `AgentAccount` for the sub-task lifetime; WHEN
   `target.kind === "member_pet"` AND `target.petId` resolves to a
   `LivingPet` the user owns AND that pet is currently a member of
   the user's `Pet_Team`, THE chat backend SHALL bind the sub-task to
   that pet's existing `AgentAccount`; OTHERWISE THE chat backend
   SHALL reject the spawn with an error message identifying the
   reason.
5. IF the spawn-ack timeout (3 s) is exceeded, THEN THE chat backend
   SHALL emit an `agent_spawn` event with `status: "failed"` and
   `errorReason: "ack_timeout"`, AND the Leader_Pet's next turn SHALL
   be allowed to retry the spawn at most twice before falling back to
   the Leader_Pet handling the work itself.
6. THE Leader_Pet SHALL NOT be able to spawn more than 5 concurrent
   sub-agents per Team_Task (Part 1 quota); attempts beyond the cap
   return a `quota_exceeded` error from `agent-task.create()` and the
   Leader_Pet must wait for an existing sub-task to finish or
   explicitly cancel one.
7. WHEN the per-task budget cap of $5 USD (Part 1 quota) is exceeded
   based on running `agent_cost_records` total for the Team_Task, THE
   chat backend SHALL reject further `agent_run` calls with
   `budget_exceeded` until either (a) the user explicitly extends the
   budget via Pro Mode (R8 in Part 3) or (b) the Team_Task completes.
8. THE Spawn_Tool SHALL be available in **all** ChatModes (`ask`,
   `agent`, `plan`, `team`); the existing `team` mode keeps its
   Pre-launch P-2 hotfix #4 prompt-rewrite shim and is unaffected by
   this requirement.

---

## Requirement 2 — Sub-agent activity is observable

**User Story:** As a user, I want to see what my Leader_Pet has
delegated and to whom in real time, so I am not staring at a
"thinking" spinner while five agents quietly work in the background.

### Acceptance Criteria

1. WHEN a `Spawn_Event` is emitted (R1.3), THE TaskTimeline
   (`desktop/src/components/TaskTimeline.tsx`) SHALL render a row of
   kind `agent_spawn` showing role + prompt summary + target name
   (anonymous label or pet name) within 500 ms of receipt.
2. WHILE a sub-task is active, THE chat backend SHALL emit a heartbeat
   event of kind `agent_invoke` at most every 10 seconds containing
   `taskId`, `progress` (0-100 if available), `step` (free-text
   description of current step or null).
3. WHEN a sub-task transitions to terminal state (`completed`,
   `failed`, `cancelled`, `stuck`), THE chat backend SHALL emit a
   `Result_Event` of kind `agent_result` containing `taskId`,
   `status`, `summary` (≤200 chars), `costUsd` (≥0), `artifactPaths`
   (array of workspace-relative paths if any).
4. WHEN at least one `agent_spawn` is in flight, THE TaskTimeline
   header SHALL display the existing "🤖 Sub-Agents active" indicator
   (already shipped in TaskTimeline.tsx) plus a count badge `🤖 N
   active`.
5. WHEN the user clicks a `agent_spawn` row in TaskTimeline, THE
   panel SHALL expand inline to show last 5 invoke events + current
   status; clicking again collapses.
6. WHEN a Worktree lane is associated with a sub-task (sub-task ran
   in its own git worktree branch), THE WorktreePanel
   (`desktop/src/components/WorktreePanel.tsx`) SHALL display the
   sub-task's `agent_account_id` resolved name + role badge on that
   lane row, joining via the new `agent_account_id` column on
   `agent_tasks`.
7. IF a sub-task heartbeat is missing for 30 seconds (Part 1
   constraint), THEN THE TaskTimeline row SHALL switch to a
   `stuck` visual state (orange dot + "no heartbeat for Xs" caption);
   the Leader_Pet's next turn MAY query the row state and decide to
   cancel + retry or surface the stuck task to the user.
8. THE TaskTimeline event rendering SHALL be unchanged for **non**
   sub-agent tools (file reads, shell commands, web fetches) — they
   continue to render as today.

---

## Requirement 3 — Member_Pet can receive sub-tasks

**User Story:** As a user with multiple LivingPets, I want to be able
to designate them as members of my team and have my Leader_Pet
dispatch sub-tasks to them, so my own pets do the work and earn
intimacy / XP for it instead of an anonymous agent.

### Acceptance Criteria

1. WHEN the user opens Agent_Team_Panel (R5) AND has more than one
   LivingPet, THE panel SHALL allow the user to add a non-leader
   pet as a Member_Pet by selecting from a list of owned pets, with
   each entry showing the pet's avatar, name, and inferred role from
   `pet-team.service.ts` role classification.
2. WHEN the user adds a Member_Pet, THE backend SHALL call
   `pet-team.service.grant()` (existing) with the user's Leader_Pet
   as `parentLivingPetId` and the new pet as the member, persisting
   role + scope + daily_budget per existing service contract.
3. WHEN the Leader_Pet calls `agent_run` with
   `target.kind === "member_pet"`, THE chat backend SHALL resolve
   `target.petId` to that pet's `AgentAccount` (provisioning one on
   the fly via `agent-account.service` if the pet does not yet have
   one) and bind the sub-task to it.
4. WHEN a sub-task completes successfully under a Member_Pet, THE
   chat backend SHALL increment that pet's `intimacy_xp` and write a
   `pet_a2a_dispatch` row (existing entity) marking the leader → member
   dispatch for audit.
5. IF the user's `WorkspacePlan.maxAgents` quota is at cap when a
   Member_Pet binding would create a new AgentAccount, THEN the bind
   SHALL fail with `quota_exceeded`; the Agent_Team_Panel SHALL
   present the "upgrade or unbind" prompt already used by World
   Engine R6.6 in `reality-ai-world-engine` spec.
6. THE Leader_Pet's selection of `member_pet` vs `anonymous` SHALL
   default to:
   - **Pro Mode**: prefer matching member pet by role keyword (the
     pet whose `role` best matches the requested `role` string by
     existing `inferAgentTeamRole` keyword classifier in
     `TaskWorkbenchPanel.tsx`); fallback to anonymous.
   - **Simple Mode**: always anonymous (do not implicate the user's
     pet without explicit team configuration).
7. THE user SHALL be able to manually pause a Member_Pet from the
   Agent_Team_Panel (using existing `pet-team.service` pause method);
   while paused, the Leader_Pet's selection logic excludes that pet
   and must use anonymous Sub_Agents instead.

---

## Requirement 4 — Long tasks survive close + rejoin

**User Story:** As a user with a 30-minute Team_Task running, I want
to close the desktop app or lock my phone and come back later to
finished work, with a clear notification path that does not require
me to keep the app open.

### Acceptance Criteria

1. WHEN a Team_Task's predicted runtime exceeds 5 minutes (Part 1
   constraint, derived from existing `agent-task.service` runtime
   estimator if present, otherwise from a fixed heuristic of "task
   has at least one sub-task with `budget.maxMinutes > 5`"), THE
   chat backend SHALL automatically tag the task as `mode: "background"`.
2. WHEN a Team_Task is `mode: "background"` AND the user closes /
   minimizes the desktop app, THE backend SHALL keep the task running
   in `agent-task.worker` and SHALL NOT rely on the desktop client
   for any execution step.
3. WHEN a `mode: "background"` task transitions to terminal state,
   THE backend SHALL emit a `world-engine.battle-pending`-style
   presence event (reusing the existing
   `companion-presence.helpers.ts` pattern) of kind
   `agent-task.completed` with `taskId`, `summary`, `userId`,
   `startedAt`, `completedAt`.
4. WHEN the desktop Companion_Ball receives an `agent-task.completed`
   presence event, THE companion ball SHALL play the existing P9
   "nudge" animation + show a 2-line summary callout ("✅ Coder pet
   finished refactoring login.ts, 3 changes ready to review") for
   exactly 8 seconds or until clicked.
5. WHEN the mobile Companion_Ball receives the same event, THE mobile
   Lock_Screen_Pet SHALL show a "✅ Your team finished" headline
   reusing P9 lock-screen pet rendering; tapping the headline opens
   the in-app Inbox with the task pre-selected.
6. THE mobile inbox SHALL render `agent-task.completed` events as a
   new category "🤖 Team work" alongside existing categories (battle
   pending, photo mimic, etc.) without breaking any existing filter.
7. IF push notification permissions are granted on mobile, THEN THE
   backend SHALL also send a push (using existing notification module)
   with the same summary; if not granted, the lock-screen pet path
   in AC 5 is the only mobile rejoin signal.
8. WHEN the user reopens the desktop app, THE TaskTimeline SHALL
   restore all `agent_spawn / invoke / result` events for any
   Team_Task that completed while the app was closed, fetching from
   `agent-task.list()` history.

---

## Requirement 5 — Agent_Team_Panel as top-level surface

**User Story:** As a user, I want to see my whole agent team in one
place — who is on it, who is the leader, what each is currently doing
— without having to open Worktree Board (Pro-only) or scroll through
TaskTimeline events.

### Acceptance Criteria

1. THE ChatTitleBar More menu (`desktop/src/components/chatPanel/
   ChatTitleBar.tsx`) SHALL gain a new entry "🤖 Agent Team" with
   `tier: "standard"` (visible in Standard and Pro modes; Simple Mode
   sees an ambient surface instead per R7 in Part 3).
2. WHEN the user clicks "🤖 Agent Team", THE Agent_Team_Panel SHALL
   open as a side panel (existing pattern, like MemoryWikiPanel /
   McpPanel) showing:
   - Leader header (avatar + name + current activity)
   - Member list (avatar + role + idle/active/paused state + last
     activity timestamp)
   - "Add Member" button (R3.1)
   - "Provision from Template" button (calls existing
     `agent-team.controller.ts` template list, lets user pick a
     template, calls `provision()` API)
   - Recent Team_Task list (last 10, with status + cost)
3. THE panel SHALL be implemented as a thin wrapper that **lifts the
   "Agent Team Sandbox (MVP)" section out of TaskWorkbenchPanel.tsx**;
   TaskWorkbenchPanel's section is replaced with a "Open Agent Team
   Panel" link, NOT removed (existing Worktree details users may
   still want a one-click jump from the workbench).
4. WHEN no Pet_Team exists for the user, THE Agent_Team_Panel SHALL
   show an empty-state CTA "Provision a team from template" linking
   directly to the template picker (skipping the empty list state).
5. WHEN the user has a Pet_Team but no in-flight Team_Task, THE panel
   SHALL show a "Start a task" hint that focuses the main chat input
   on click.
6. THE inferAgentTeamRole keyword classifier shall continue to
   provide role-tagging for legacy Team_Tasks not yet using
   `agent_account_id`; new Team_Tasks rely on the explicit
   `agent_account_id` column.
7. THE Agent_Team_Panel SHALL NOT introduce any new entity in
   v1 — it is purely a UI for `pet-team` + `agent-team` + `agent-task`
   already-shipped data.

---

## Requirement 6 — Sub-task failure / git conflict resolution

**User Story:** As a user whose multi-agent task hit a merge conflict
or a sub-task crashed, I want a clear recovery surface that lets me
either rollback the whole Team_Task or fix the conflict by hand,
without going to a terminal.

### Acceptance Criteria

1. WHEN two sub-tasks complete successfully but produce non-mergeable
   git conflicts on shared file paths, THE chat backend SHALL emit a
   `Conflict_Event` to the chat session containing the parent
   Team_Task id, the list of conflicting file paths, and the head
   commit SHA of each contributing worktree.
2. WHEN the chat session receives a `Conflict_Event`, THE main chat
   SHALL render a Conflict_Card (new component, but built on top of
   existing `WorkspaceFileStatus.tsx` + `DiffView.tsx` — NO new
   diff-rendering implementation) displaying:
   - File path list with side-by-side diff per file
   - "Take left (worktree A)" / "Take right (worktree B)" / "Skip
     this file" / "Cancel whole Team_Task" buttons
3. WHEN the user picks per-file resolutions for all conflicting
   files, THE chat backend SHALL apply the resolution by writing the
   chosen content to the user's main worktree, then commit on
   behalf of the user with message "merge: agent team sub-tasks (N
   conflicts resolved manually)".
4. WHEN the user picks "Cancel whole Team_Task", THE chat backend
   SHALL roll back ALL sub-task worktrees by calling existing
   `services/workspaceBackups.ts` restore, AND mark the Team_Task as
   `status: "cancelled"` AND issue refunds (no charge to the user)
   per existing `agent-task` cancellation semantics.
5. IF a sub-task ends in `status: "failed"` (not stuck, not conflict,
   but explicit failure such as exception in worker), THEN THE chat
   backend SHALL emit a `Result_Event` of `status: "failed"` and the
   TaskTimeline row SHALL show a one-click "Retry this sub-task" button;
   retrying re-calls `agent_run` with the same role+prompt+scope+budget.
6. THE Conflict_Card SHALL only render in Pro Mode; in Simple /
   Standard Mode, conflict resolution surfaces as a single
   "🤝 Resolve team disagreements" Pet Hub strip card that opens a
   simplified resolver (per file: "Keep what your Coder pet did" vs
   "Keep what your Reviewer pet did" using semantic role names, not
   git terms).
7. THE conflict detection logic SHALL run only at sub-task merge time
   (not during execution); during execution each sub-task lives in
   its own worktree branch and conflicts cannot occur. This keeps
   the failure window short and predictable.
8. THE rollback path (R6.4) SHALL preserve all existing
   `agent_cost_records` rows so the user / accountant can audit
   spend even on cancelled tasks; Part 4 R13 weekly cost report
   reflects this.

---

## Acceptance for Part 2

Part 2 is approved when:

- Each AC is testable: it names a concrete file / module / event kind
  that exists today (or is explicitly marked as new in design.md).
- The 5-sub-agent cap (R1.6), $5 budget cap (R1.7), 3-s spawn ack
  (R1.5), 10-s heartbeat (R2.2), 30-s stuck threshold (R2.7), 8-s
  callout duration (R4.4) are accepted or amended in this file
  before Part 3 review.
- The Conflict_Card vs Pet Hub strip split (R6.6) is accepted as a
  reasonable Simple-vs-Pro division.

When Part 2 is approved, proceed to Part 3 — Cross-Mode and Pet
Bridge Requirements.
