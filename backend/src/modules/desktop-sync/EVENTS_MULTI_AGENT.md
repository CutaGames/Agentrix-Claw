# Multi-Agent Collaboration — desktop-sync.companion-presence channel events

> **Spec**: `multi-agent-collaboration-2026-06`
> **Wave**: W0 (Pre-flight audit) — Task 0.2
> **Date**: 2026-05-26
> **Status**: ✅ Channel infrastructure verified additive-safe

This document catalogues the 4 new events the multi-agent v1 sprint
adds to the existing `desktop-sync.companion-presence` channel. Channel
infrastructure already ships (verified by reading
`companion-presence.helpers.ts`), and **all new events are additive**
— no existing payload shape is altered.

## Channel emit API

All emits go through:

```typescript
emitDesktopSyncEvent(userId, topic, payload)
  // ↓
desktopSyncEventBus.publish → PresenceGateway.server.to(`user:${userId}`).emit(topic, payload)
```

Front-end (desktop / mobile) subscribes by topic name on its socket.io
client; payload is JSON-serializable.

## New events (W1 - W5)

### 1. `presence:multi-agent.team-activity-update`

**Wave**: W1, Task 1.9
**Requirements**: R5.1, R5.6
**Producer**: `agent-task.worker.ts` after each `agent_tasks.status` change
**Throttle**: ≤ 1 emit per 3 seconds per user (R5.6 SLA)
**Helper**: `emitTeamActivityUpdate({ userId, activeSubTasks, oneLineSummary?, occurredAt? })`

**Payload schema**:
```json
{
  "user_id": "string",
  "active_sub_tasks": "number",
  "one_line_summary": "string | null",
  "occurred_at": "number (ms)"
}
```

**Consumer**:
- Desktop `PetCompanionWindow.tsx` updates Simple Mode badge (R5.1)
- Mobile `GlobalFloatingBall` mirror (out-of-scope for v1 desktop)

### 2. `presence:multi-agent.sub-task-completed`

**Wave**: W4, Task 4.2
**Requirements**: R9.3, R9.4
**Producer**: `agent-task.worker.ts` on terminal status (succeeded/failed/canceled)
**Helper**: `emitSubTaskCompleted({ userId, subTaskId, parentTaskId, ok, summary, totalCostUsd, durationMs, occurredAt? })`

**Payload schema**:
```json
{
  "user_id": "string",
  "sub_task_id": "uuid",
  "parent_task_id": "uuid | null",
  "ok": "boolean",
  "summary": "string (<=200)",
  "total_cost_usd": "number",
  "duration_ms": "number",
  "occurred_at": "number"
}
```

**Consumers**:
- Desktop CompanionBall: green pulse on `ok=true`, red pulse on `ok=false`
- Lock-screen pet (P9 redesign existing handler) — same render
- Mobile push notification (separate path via `device-registry`)
- Desktop `BackgroundTasksStore` updates inflight tracking

### 3. `presence:multi-agent.sub-task-stalled`

**Wave**: W4, Task 4.2
**Requirements**: R9.5
**Producer**: `agent-presence.scheduler.ts` cron `*/5 * * * *` scanning `agent_tasks WHERE status='running' AND now() - started_at > 60min`
**Helper**: `emitSubTaskStalled({ userId, subTaskId, durationMs, title, occurredAt? })`

**Payload schema**:
```json
{
  "user_id": "string",
  "sub_task_id": "uuid",
  "duration_ms": "number",
  "title": "string",
  "occurred_at": "number"
}
```

**Consumer**:
- Desktop CompanionBall: amber pulse + 3-button UI [Abort] [Extend +30min] [Ask Leader]
- Mobile: amber badge + tap to open task detail

### 4. `presence:multi-agent.budget-warning`

**Wave**: W5, Task 5.4
**Requirements**: R10.6
**Producer**: `agent-task.worker.ts` after each cost write — fires at 80% (warning) and 100% (refusal) of `userBudgetService.getBudget(userId)`
**Helper**: `emitBudgetWarning({ userId, level, usedUsd, budgetUsd, occurredAt? })`

**Payload schema**:
```json
{
  "user_id": "string",
  "level": "80 | 100",
  "used_usd": "number",
  "budget_usd": "number",
  "occurred_at": "number"
}
```

**Consumer**:
- Leader chat injects warning message ("you've used 80% of today's budget")
- At level=100 the chat pipeline blocks new `agent_run` calls until midnight reset (UTC+8)

## Audit verification

✅ All 4 helpers added to `companion-presence.helpers.ts` (W0.2)
✅ `desktopSyncEventBus.publish` path is shared with existing 4 helpers — same delivery semantics (per-user room emit)
✅ No existing topic name is altered or shadowed
✅ Front-end consumers will be added in W1.8 (TeamActivitySurface) / W4.3 (CompanionBall pulse handlers) / W5 (BudgetWarning Leader inject)

## Throttling guidance

- `team-activity-update`: throttle to ≤ 1 emit per 3 s **per user** (use existing `lodash.throttle` or simple in-memory Map keyed by userId with last-emit timestamp).
- Other 3 events are **fire-once** per state transition; no throttle needed.

## Test path

W1 task 1.10 / W4 task 4.9 / W5 task 5.12 verification will manually
trigger each event and verify front-end handler reaction. No new
backend test — channel is exercised end-to-end in those wave
verifications.
