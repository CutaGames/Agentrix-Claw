# Tri-Tier Execution E2E Test Checklist — build142-phase0-hardening

**Scope**: Verify the new `local-only / auto / cloud-only` execution router, the 30s/15s local timeout, the persona sanitizer, and cloud fallback gating across desktop and mobile.

**Commit**: `3db3ccbe` (Agentrix) / claw `10eb9228` / desktop installer `Agentrix Desktop_0.1.1_x64-setup.exe` 5.65MB @ 17:44

## Pre-flight
- [ ] Install new desktop build from `desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.1.1_x64-setup.exe`
- [ ] Install new mobile APK once Claw CI run `24558802107` finishes (or its replacement after dispatch `24558829766`)
- [ ] Pair desktop with a Gemma-capable agent instance; pair mobile with same
- [ ] DevTools / Logcat open to capture `[local-inference-telemetry]` events

## Expected UI
- [ ] Desktop: chip row above the input reads `🔒 端侧 / 🤖 智能 / ☁️ 云端`, persists across restart (localStorage key `agentrix_desktop_execution_mode`)
- [ ] Mobile: same chip row above the input bar, persists across app restart (MMKV `settings` v5 with `executionMode` field)

## Matrix A — Text, Mobile

| # | Mode | Model | Input | Expected |
|---|------|-------|-------|----------|
| A1 | 🤖 智能 | Gemma Local | "你好，自我介绍" | Replies from local Gemma. **Must NOT** claim to be "Gemini 3.1 Pro" / "Claude" / "GPT". Header label = Gemma. |
| A2 | 🤖 智能 | Gemma Local | Long prompt >400 chars with multi-step keywords ("先... 再... 然后...") | Auto-classifier routes to cloud. Header label swaps to cloud model. |
| A3 | 🔒 端侧 | Gemma Local | "你好" | Local-only; no cloud fallback even if local errors. On error, user sees `端侧模型不可用或超时。请切换到「智能 / 云端」模式`. |
| A4 | ☁️ 云端 | Any cloud | "你好" | Skips local entirely. Uses cloud immediately. |
| A5 | 🔒 端侧 | Cloud model selected | "你好" | Falls back to cloud (because no local model picked → tier resolves to cloud per router rules). |

## Matrix B — Voice (PTT), Mobile

| # | Mode | Model | Action | Expected |
|---|------|-------|--------|----------|
| B1 | 🤖 智能 | Gemma Local | 按住 2s "天气如何" | Transcribes, replies ≤30s. **Never hangs >30s**. |
| B2 | 🔒 端侧 | Gemma Local | 按住 4s with a complex query | If local sidecar stalls >15s w/o new tokens → stall timeout error surfaces; if total >30s → timeout error. Circle stops. |
| B3 | 🤖 智能 | Gemma Local | Send an image + voice caption request | Auto-classifier may send to cloud (non-image attachment or long text). If local handles it, no "I am Gemini 3.1 Pro" claim. |
| B4 | ☁️ 云端 | Cloud | 按住 2s "简介下 Opus 4.7" | Cloud Opus 4.7 replies; identity is Agentrix (Opus identity allowed in cloud tier). |

## Matrix C — Desktop

Repeat A1–A5 and B1–B4 on desktop with the same assertions. Additional desktop-specific checks:
- [ ] C1: Close desktop → reopen → execution mode chip still reflects prior selection.
- [ ] C2: When local sidecar is not installed, 🔒 端侧 shows `本地模型不可用` error inline (not silent cloud fallback).
- [ ] C3: 🤖 智能 + local sidecar installed = auto picks local for short prompts, cloud for long / tool-heavy.

## Matrix D — Telemetry (Spot Check)

Open DevTools (desktop) or Logcat (mobile) and grep `local-inference-telemetry`:

- [ ] D1: Successful local turn → event with `outcome: "success"`, `durationMs < 30000`, `tokensOut > 0`
- [ ] D2: Forced local-only with sidecar down → event with `outcome: "error"` or `"fallback-to-cloud"`
- [ ] D3: Long voice turn that hits stall → event with `outcome: "stall"` or `"timeout"`
- [ ] D4: User interrupts mid-stream → event with `outcome: "aborted"`

## Matrix E — Regression

- [ ] E1: Cloud Opus 4.7 (`claude-opus-4-7-20260401`) still reaches real Opus 4 (`claude-opus-4-20250514`) via `ai-provider.service.ts:738` remap.
- [ ] E2: Agent Studio / Team screens still hydrate (no crash from sanitized agent context).
- [ ] E3: Existing tool-calling flows on cloud path unaffected.

## Reporting
Record failures inline under each row with model id, reason, and telemetry event (if any). File a bug with the commit sha `3db3ccbe` in the title.
