# OpenClaw 4.24 / HERMES Agent Optimization Plan

Date: 2026-04-27
Status: implementation follow-up plan after Parallel Lanes, code intelligence, and auto-repair MVPs.

## Source Status

- Local Agentrix baseline already tracks the prior OpenClaw/Claude Code-style work completed before this pass.
- Public search did not return a canonical repository or release page named exactly "OpenClaw 4.24". Treat any OpenClaw 4.24-specific claim as pending upstream confirmation until a maintainer URL or changelog is provided.
- Verified public references reviewed in this pass:
  - `NousResearch/hermes-agent`: CLI/gateway agent with skills, memory, MCP, cron, toolsets, platform gateways, OpenClaw migration, subagents, terminal backends, command approval, context compression, and update/doctor flows.
  - `garrytan/gbrain`: OpenClaw/Hermes-compatible brain layer with hybrid search, graph links, durable jobs/minions, skillpack install/check, routing evals, doctor/self-heal, and code-aware retrieval.
  - `abhi1693/openclaw-mission-control`: operations dashboard for organizations, boards, agent/gateway lifecycle, approvals, and audit timeline.

## What We Already Added In This Pass

- Parallel Lanes: `AgentOrchestrationService.coordinate()` can decompose a task, run worker lanes concurrently with timeout isolation, and merge lane output with parallelism telemetry.
- Code Intelligence: backend `CodeIntelligenceModule` exposes workspace indexing, symbol search, LSP-style document symbols, and deterministic semantic chunk search.
- Desktop Local Code Intelligence: desktop local tool calling now exposes `index_workspace_code`, `search_workspace_symbols`, and `semantic_search_workspace_code` for local agent mode.
- Auto Repair: backend `AutoRepairModule` provides diagnostics parsing plus a callback-driven run/diagnose/generate-patch/apply/retry loop.
- Updater: backend `DesktopUpdateModule` now serves a Tauri updater manifest endpoint matching the configured desktop updater URL.
- Windows Signing: CI can inject `WINDOWS_CERTIFICATE_THUMBPRINT` into Tauri config and blocks signed release tags when the secret is absent.

## Borrowed Patterns Worth Productizing

### 1. Durable Lane Runtime

Hermes/GBrain both point to durable background execution as the difference between a demo agent and a production agent. Agentrix should promote Parallel Lanes from in-process promises to persisted lane jobs.

Planned work:

- Add `agent_lane_jobs` and `agent_lane_events` tables with parent task id, lane id, role, status, lease owner, checkpoint, retry count, token/cost accounting, and transcript pointer.
- Add a lane worker process with lease/heartbeat/reclaim semantics so backend restarts do not lose lane work.
- Add fan-in aggregator state that can merge complete, failed, cancelled, and timed-out lanes without blocking on perfect success.
- Add `/api/agent-orchestration/jobs/:id/events` SSE for desktop/web progress streaming.
- Add idempotency keys for repeated task submission and lane retry.

Acceptance criteria:

- A 5-lane task survives backend restart and resumes from persisted checkpoints.
- Cancelling the parent cancels descendants recursively.
- Failed lanes are represented in the merged result instead of hiding partial failure.

### 2. Thin Harness, Fat Skills

Hermes/GBrain emphasize procedural skills as the durable place for repeated workflows. Agentrix already has `.github/agents`; it should also treat skills as first-class runtime assets.

Planned work:

- Introduce `skills/manifest.json` or derive a manifest from `SKILL.md` frontmatter.
- Add a resolver check that reports unreachable, overlapping, or ambiguous skills.
- Add routing eval fixtures: `{ intent, expectedSkill, ambiguousWith? }` JSONL per skill.
- Add a skill creation pipeline: scaffold, deterministic script, unit test, E2E fixture, resolver entry, and reachability check.
- Surface installed skills to desktop/web and OpenClaw instances.

Acceptance criteria:

- CI fails on unreachable required skills and missing resolver entries.
- A new skill can be scaffolded and verified by one command.
- Tool routing accuracy is tracked over time.

### 3. Memory And Graph Retrieval

GBrain's strongest useful pattern is hybrid retrieval plus typed links, not only vector search. Agentrix should evolve Code Intelligence and memory search in that direction.

Planned work:

- Move code/document embeddings from in-memory deterministic vectors to pgvector with incremental invalidation.
- Add keyword + vector reciprocal-rank fusion for code, docs, memories, agent transcripts, and marketplace skills.
- Add typed edges for agent/team relationships, tool usage, task dependencies, code symbol references, and user/project entities.
- Rank results by exact symbol match, graph proximity, recency, and source trust.
- Add citations and source spans to every memory/code answer.

Acceptance criteria:

- Symbol lookup supports callers/callees/references for TypeScript and Rust.
- Retrieval benchmark reports precision@5/recall@5 for a fixed Agentrix QA set.
- Answers expose source file or memory page references, not opaque RAG summaries.

### 4. Self-Healing And Doctor Flows

Hermes/GBrain use doctor commands and smoke tests to make agent environments repairable. Agentrix should turn the new auto-repair loop into a controlled doctor system.

Planned work:

- Add a backend `doctor` module that runs scoped checks: backend build, desktop build, Tauri cargo check, updater readiness, signing readiness, DB connectivity, chat tool parity.
- Add repair policies: report-only, generate patch, apply patch with approval, retry.
- Persist repair attempts with command, diagnostics, patch diff, result, and final status.
- Add desktop UI for the repair loop with explicit approval before patch application.
- Add chat tool parity tests for `/openclaw/proxy/:id/stream` and `/claude/chat`.

Acceptance criteria:

- A failing TypeScript compile can be diagnosed and converted into a repair prompt automatically.
- Patch application requires approval unless an explicit safe/autopilot policy is enabled.
- Doctor reports are exportable and attachable to release verification.

### 5. Multi-Interface Continuity

Hermes highlights CLI, gateway, messaging, and cross-session continuity. Agentrix should keep web/mobile/desktop/wearables in one synchronized agent session model.

Planned work:

- Normalize session state across web, mobile, desktop, Wear OS, and future wearable devices.
- Add platform delivery metadata so a long task can notify desktop/mobile/wear when done.
- Add interruption semantics: stop/redirect current task from any device.
- Add per-platform tool availability so wearable agents can request escalation to desktop/cloud for heavy actions.

Acceptance criteria:

- A task started on mobile can be inspected and cancelled from desktop.
- Wear OS can receive lane completion summaries and request a follow-up without losing task context.

### 6. Operations Control Plane

Mission Control's useful idea is not another UI; it is governance and audit around agent work.

Planned work:

- Add org/team boards for agent tasks, approvals, and incidents.
- Attach every tool call, lane event, repair attempt, update check, and deployment action to an audit timeline.
- Add approval classes for finance, production deploy, DB migration, credential access, and destructive filesystem actions.
- Add gateway health panels for OpenClaw instances, desktop bridges, and wearable bridges.

Acceptance criteria:

- Sensitive tools cannot run without an approval record.
- Operators can reconstruct who/what/when for a failed task from the audit timeline.

## Priority Roadmap

P0 - Release blocking:

- Complete desktop updater environment deployment and signed Windows release certificate provisioning.
- Persist auto-repair attempts and require approval for patch apply.
- Add chat path parity tests for new orchestration and repair tools.

P1 - Agent reliability:

- Persist Parallel Lanes into durable lane jobs.
- Add lane event SSE and desktop/web progress UI.
- Add doctor checks for backend, desktop, updater, signing, and tool parity.

P2 - Intelligence depth:

- Replace in-memory code vectors with pgvector plus incremental indexing.
- Add symbol references/call graph for TypeScript/Rust.
- Add skill resolver, routing evals, and skillpack health checks.

P3 - Ecosystem/ops:

- Add operations board/audit timeline.
- Add OpenClaw/Hermes import compatibility for skills, memories, allowlists, and workspace instructions.
- Add marketplace skill quality gates before publishing.