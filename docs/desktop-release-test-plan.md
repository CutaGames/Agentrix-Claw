# Agentrix Desktop Release Test Plan

## Scope

This plan gates the Agentrix Desktop v2.0 seed release against the core requirements in `docs/desktop-prd.md`:

- desktop authentication and onboarding continuity
- floating entry point and chat panel usability
- desktop context sensing and native tool execution
- task timeline and approval safety model
- desktop to backend sync and mobile remote approval loop
- voice interaction ergonomics for real-world usage
- crash, offline, recovery, and multi-instance stability

Release target: production-ready for seed users on Windows desktop, with known non-blockers tracked separately.

## Release Gates

The build is releaseable only when all of the following are true:

1. Desktop web build passes.
2. Tauri Rust compile/check passes.
3. Backend TypeScript compile passes.
4. P0 manual scenarios pass end to end.
5. No open P0 defects and no unresolved auth, approval, or destructive-action regressions.
6. Seed-user telemetry/log capture path is verified before rollout.

## Test Matrix

### P0: Must Pass Before Seed Release

1. Login and desktop bootstrap
   - Fresh login succeeds.
   - Returning session restores securely without forcing QR/login again.
   - Post-login lands in the assistant workflow, not a misleading onboarding loop.

2. Floating ball and panel entry
   - Floating ball opens panel reliably.
   - Global shortcut opens panel.
   - Long-press voice from floating ball still works.
   - Panel close and reopen preserves current session cleanly.

3. Voice interaction
   - Hold-to-talk records, transcribes, and sends.
   - Tap-to-talk records on first tap and sends on second tap.
   - Cancel during recording works.
   - TTS auto-play obeys settings.
   - Mic denial shows a recoverable error state.

4. Proactive suggestions and templates
   - Suggestions appear when clipboard or active window context changes.
   - Suggestions never block normal chat input.
   - Workflow template clicks prefill or launch the expected prompt.
   - Suggestions remain relevant when IDE/browser context changes.

5. Native tool execution and safety
   - Command execution works for safe commands.
   - File read/write tools work on a controlled test file.
   - Browser open action works.
   - Dangerous actions require approval when risk policy says they should.
   - Rejected actions never execute.

6. Task timeline
   - Timeline shows ordered steps, status, timestamps, and duration.
   - Failed steps surface output clearly enough for debugging.
   - Approved steps continue after approval.

7. Desktop sync and remote approval
   - Heartbeat reaches backend.
   - Desktop task updates appear in sync state.
   - Approval created on desktop is visible remotely.
   - Remote approval decision returns to desktop and resumes or aborts correctly.

8. Stability and recovery
   - App restart restores login and basic session continuity.
   - Temporary backend unavailability does not corrupt local UI state.
   - Network recovery resumes sync on next cycle.

### P1: Required for Wide Rollout

1. Multi-instance switching preserves the right conversation and instance label.
2. Clipboard preview is accurate and does not expose stale content after copy changes.
3. Active window and inferred workspace/file hints are credible for VS Code/Cursor/browser workflows.
4. Autostart toggle behaves correctly on supported environments.
5. Long-running assistant responses do not wedge TTS or voice state.

### P2: Track But Do Not Block Seed Access

1. More advanced continuous voice mode.
2. OCR or richer UI tree sensing.
3. Additional retry/handover controls on each timeline step.

## Execution Procedure

### Automated Validation

Run before manual testing:

1. Desktop frontend build.
2. Desktop Tauri `cargo check`.
3. Backend TypeScript compile.

### Manual Validation Pass

Use a clean Windows machine profile and one existing account with backend access.

1. Run fresh login flow.
2. Validate panel, floating ball, and shortcut entry.
3. Validate both voice modes.
4. Run one safe command, one file read, one file write, and one browser open action.
5. Trigger one approval-required action and verify desktop plus remote approval loop.
6. Copy a large block of text and confirm proactive suggestions update.
7. Work inside VS Code/Cursor and confirm context-aware templates remain useful.
8. Kill and relaunch desktop app, then verify session restore.
9. Disconnect network temporarily, retry sync, reconnect, and confirm recovery.

## Defect Triage Rules

- P0: auth loss, wrong-instance routing, dangerous action without approval, approval mismatch, broken voice send, app crash, unrecoverable blank panel
- P1: suggestion irrelevance, stale context hints, autostart mismatch, intermittent TTS issues
- P2: cosmetic layout issues, low-signal prompt wording, missing template variant

P0 defects block release. P1 defects require an explicit waive decision. P2 defects can ship with tracking.

## Seed Rollout Recommendation

1. Ship to 5 to 10 seed users first.
2. Keep backend log capture enabled for desktop sync, approval transitions, and voice failures.
3. Review first 48 hours for auth churn, approval friction, and suggestion usefulness.
4. Expand rollout only if no P0 and no repeated P1 pattern appears.

## Current Release Assessment

Current desktop baseline is strong enough for a seed production release if the validation gates above pass after the latest Phase 5 changes. The main differentiator is now execution depth plus safety plus cross-device continuity. The remaining release risk is interaction polish under real usage, especially voice ergonomics and suggestion relevance.