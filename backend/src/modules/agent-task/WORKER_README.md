# Agent Task Worker — Architecture & Multi-Agent v1 Audit

> **Wave**: W0 (Pre-flight audit) — Task 0.3
> **Date**: 2026-05-26
> **Auditor**: Dev Agent

## Summary

`agent-task.worker.ts` is **NOT a BullMQ worker** — it is a
`setInterval` poller using Postgres `FOR UPDATE SKIP LOCKED` for
distributed claim semantics. This design pre-dates the spec writing
and has been verified by reading source.

**Worker config (verified from code)**:

- Poll interval: `5000 ms` (POLL_INTERVAL_MS)
- Concurrency: `MAX_PARALLEL = 2` (env override `AGENT_TASK_MAX_PARALLEL`)
- Disable flag: `AGENT_TASK_WORKER_DISABLED=1` (CI / test mode)
- Atomic claim: `UPDATE agent_tasks SET status='running' WHERE id IN (SELECT id FROM agent_tasks WHERE status='queued' ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED)`

## Spec correction needed

`design.md §1.2` and `tasks.md` claimed "BullMQ queue agent-tasks
concurrency 5" — that was **incorrect** based on a sprint-memory note
from earlier. Reality:

| Doc claim (incorrect) | Actual code |
|------------------------|-------------|
| BullMQ queue `agent-tasks` | `setInterval` poller |
| Concurrency 5 | MAX_PARALLEL=2 (env-tunable) |
| Job payload `{ taskId, parentTaskId }` | DB row claim, no payload |

### Impact on Multi-Agent v1 design

This is **not blocking** — the design still works, with these
adjustments:

1. **Spawn fan-out cap (R1.4 = 4 concurrent)** is enforced at the
   `AgentTaskSpawnService` layer (per-leader counter), not at worker
   layer. Worker concurrency 2 is **system-wide**, not per-leader.

2. **W2 task 2.2 enqueue** does NOT enqueue a BullMQ job — instead it
   simply calls `AgentTaskService.create({...})` which inserts a row
   with `status='queued'`. The poller picks it up within 5 s.

3. **W4 task 4.1 background mode** stays the same — 30 s wall-clock
   threshold is client-side; backend just keeps running the task.

4. **W5 task 5.3 cost summary** still works — worker `finally` block
   runs after each task; no BullMQ coupling needed.

### Tasks.md updates

`tasks.md` Wave 0 task 0.3 is **complete** with this README. The
following 4 tasks reference "BullMQ" and need a `_Note: see WORKER_README.md_`
suffix:

- W0.3 (this audit) ✅ done
- W2.2 ("enqueue BullMQ job") — change to "insert AgentTask row;
  poller claims within 5s"
- W4.1 (30 s threshold) — unchanged, but client-side only
- W5.3 (`agent-task.worker.ts` finally block) — unchanged

## Future work — BullMQ migration?

Switching to BullMQ would buy:
- Priority queues (high-priority leader chat sub-tasks)
- Retries with exponential backoff
- Dead letter queue (currently W5.3 manually handles via `cost-tracker.deadletter` queue)
- Better scheduler / cron interplay

Cost: 1-2 sprints of refactor work, not blocking v1.
**Not in scope for multi-agent-collaboration-2026-06.**

## Field extension safety (for W2)

W2.2 will not modify `agent-task.worker.ts` core loop. It only:
1. Reads `task.parent_task_id` if non-null (additive — existing rows have NULL)
2. Reads `task.target_kind` to decide tool routing
3. Calls new `cost-tracker` AsyncLocalStorage (W5.2) — no behavior change to other callers

**Verdict**: ✅ additive-safe, no existing flow disrupted.
