# Agentrix Voice System Handoff Report

Updated: 2026-03-26

## 1. Executive Summary

This report summarizes the current end-to-end mobile voice solution in Agentrix, including:

- wake word activation
- realtime duplex voice conversation
- backend streaming/fallback transcription behavior
- validation status
- remaining risks and unfinished work
- public build and workflow trigger procedure

Current state in one line:

- the voice stack has already had multiple real root-cause fixes applied across frontend and backend, but the latest user-reported issue showed that server-side final transcript reached the client without being inserted into chat UI; that specific UI bridge has now been fixed locally, but full real-device verification for this newest fix is still pending.

## 2. Scope Of The Voice System

The current voice experience has two major capability groups.

### 2.1 Wake Word

- local wake word model
- system speech fallback
- floating ball activation path

### 2.2 Realtime Voice Conversation

- duplex microphone capture
- streaming / fallback STT
- message insertion into chat UI
- LLM response streaming
- sentence-level TTS playback

## 3. Current Architecture Overview

### 3.1 Frontend / Mobile

Main files:

- [src/components/GlobalFloatingBall.tsx](src/components/GlobalFloatingBall.tsx)
- [src/services/localWakeWord.service.ts](src/services/localWakeWord.service.ts)
- [src/services/realtimeMicrophone.service.ts](src/services/realtimeMicrophone.service.ts)
- [src/services/realtimeVoice.service.ts](src/services/realtimeVoice.service.ts)
- [src/hooks/useVoiceSession.ts](src/hooks/useVoiceSession.ts)
- [src/screens/agent/AgentChatScreen.tsx](src/screens/agent/AgentChatScreen.tsx)

Responsibilities:

- `GlobalFloatingBall`: wake-word listener entry and voice UI activation
- `localWakeWord.service.ts`: local template-based wake-word recording, template matching, readiness, self-check
- `realtimeMicrophone.service.ts`: 16k PCM microphone frames, speech start/end detection, pause/cooldown control
- `realtimeVoice.service.ts`: Socket.IO `/voice` transport, session lifecycle, transcript/agent event callbacks
- `useVoiceSession.ts`: orchestration layer for wake word, live speech, realtime mic, duplex state machine, TTS queue, interrupt logic
- `AgentChatScreen.tsx`: chat UI, message list, streaming assistant bubble management, voice settings and status bar

### 3.2 Backend

Main files:

- [backend/src/modules/voice/realtime-voice.gateway.ts](backend/src/modules/voice/realtime-voice.gateway.ts)
- [backend/src/modules/voice/realtime-voice.gateway.spec.ts](backend/src/modules/voice/realtime-voice.gateway.spec.ts)
- [backend/src/modules/voice/adapters/deepgram-stt.adapter.ts](backend/src/modules/voice/adapters/deepgram-stt.adapter.ts)
- [backend/src/modules/voice/voice.service.ts](backend/src/modules/voice/voice.service.ts)
- [backend/src/modules/openclaw-proxy/openclaw-proxy.service.ts](backend/src/modules/openclaw-proxy/openclaw-proxy.service.ts)

Responsibilities:

- `realtime-voice.gateway.ts`: Socket.IO voice protocol, streaming STT, buffered PCM fallback, agent response start, TTS/audio events
- `deepgram-stt.adapter.ts`: realtime streaming STT session handling
- `voice.service.ts`: buffered transcription providers and fallback chain
- `openclaw-proxy.service.ts`: stream assistant reply chunks to callbacks

### 3.3 Public Build Repo / Release Path

Main files and repos:

- [scripts/public-build/push_public_build_via_server.ps1](scripts/public-build/push_public_build_via_server.ps1)
- `scripts/public-build/mobile_mirror_paths.txt`
- public repo: `CutaGames/Agentrix-Claw`
- public workflows: `Build → Test → Release APK`, `Build iOS Simulator`

## 4. Completed Work So Far

### 4.1 Wake Word / Local Model

Already implemented earlier:

- local template wake-word model service
- settings UI for engine selection, sample count, reset, self-check
- readiness threshold adjusted from effectively 1 sample to recommended minimum behavior around 3 samples
- settings page displays actual engine state more clearly, such as local-template vs system-speech
- floating ball engine switching already integrated

Related context:

- PRD exists and is already documented in [docs/PRD_LOCAL_WAKEWORD_MOBILE.zh-CN.md](docs/PRD_LOCAL_WAKEWORD_MOBILE.zh-CN.md)

### 4.2 Backend Realtime Voice Fixes

Already completed and previously validated:

- added streaming finalization timeout in [backend/src/modules/voice/realtime-voice.gateway.ts](backend/src/modules/voice/realtime-voice.gateway.ts)
- added buffered PCM fallback path when streaming final transcript does not arrive in time
- enhanced Deepgram streaming open/pending/end handling in [backend/src/modules/voice/adapters/deepgram-stt.adapter.ts](backend/src/modules/voice/adapters/deepgram-stt.adapter.ts)
- added gateway tests in [backend/src/modules/voice/realtime-voice.gateway.spec.ts](backend/src/modules/voice/realtime-voice.gateway.spec.ts)
- repaired [backend/src/entities/openclaw-instance.entity.ts](backend/src/entities/openclaw-instance.entity.ts) after corruption

Root cause fixed at that stage:

- with fast pacing, backend sometimes only emitted interim transcript and never finalized the turn, so no agent reply started

### 4.3 Frontend Realtime Session Stability Fixes

Already completed:

- stabilized `useVoiceSession` callback identities with refs in [src/hooks/useVoiceSession.ts](src/hooks/useVoiceSession.ts)
- removed unstable outer callback dependencies from the main realtime effect
- prevented repeated socket teardown / recreate loops caused by parent re-render + inline callbacks

Root cause fixed at that stage:

- socket reconnect storm caused by effect cleanup/restart when callback identities changed

### 4.4 React Native Audio Payload Fix

Already completed:

- [src/services/realtimeVoice.service.ts](src/services/realtimeVoice.service.ts) now converts audio chunks into buffer-like JSON payloads
- backend `normalizeAudioChunk()` path already supports React Native buffer-like payloads

Root cause fixed at that stage:

- raw `ArrayBuffer` over RN Socket.IO / WebSocket path was too fragile and likely contributed to device-side instability

### 4.5 Latest Local Fix: Final Transcript -> Chat UI Bridge

Latest newly completed local fix:

- [src/hooks/useVoiceSession.ts](src/hooks/useVoiceSession.ts) now bridges realtime final transcript into `onRealtimeUserMessage`
- this means server-side final STT now creates the user bubble and assistant placeholder through `beginRealtimeVoiceTurn()` in [src/screens/agent/AgentChatScreen.tsx](src/screens/agent/AgentChatScreen.tsx)
- a short dedupe window was added so duplicated final events (`voice:stt:final` and `voice:transcript:final`) do not insert the same user message twice

Root cause fixed at this stage:

- final transcript was reaching the frontend, but the hook only updated `transcriptPreview`; it did not create a user message in the chat list

## 5. Validation History

### 5.1 Validated Earlier

These validations had already been completed before the newest UI bridge fix:

- backend build passed
- backend gateway Jest coverage for realtime fallback behavior passed
- production smoke had previously confirmed backend finalization race was fixed
- public build publishing pipeline was repaired after server disk exhaustion and public repo sync issues

### 5.2 Validated In Current Session

Validated successfully in the current session:

- `npm run test:e2e:voice-ui`
  - result: `4 passed, 1 skipped`
  - note: this is a web voice UI regression suite; it checks general voice UI flows, not the full real backend duplex chain
- `backend npm test -- --runInBand realtime-voice.gateway.spec.ts`
  - result: `3 passed`
  - confirms gateway fallback and RN buffer-like audio payload handling remain good
- static error check on changed files returned no errors for:
  - [src/testing/e2e.ts](src/testing/e2e.ts)
  - [src/services/realtimeVoice.service.ts](src/services/realtimeVoice.service.ts)
  - [src/screens/agent/AgentChatScreen.tsx](src/screens/agent/AgentChatScreen.tsx)
  - [src/hooks/useVoiceSession.ts](src/hooks/useVoiceSession.ts)
  - [tests/e2e/ui/voice-ui.spec.ts](tests/e2e/ui/voice-ui.spec.ts)

### 5.3 Validation Still Missing For The Newest Fix

Not yet fully validated end-to-end:

- real-device verification that the newest `final transcript -> user bubble` bridge fix works in APK / device runtime
- confirmation that user transcript appears in chat UI and assistant streaming starts on a real backend-connected session
- confirmation that the previous user-reported `Transcription failed` path is either gone or isolated to a separate backend provider issue

## 6. Latest In-Progress Test Work

To make the newest bug reproducible in automated tests, local-only E2E hooks were added in these files:

- [src/testing/e2e.ts](src/testing/e2e.ts)
- [src/services/realtimeVoice.service.ts](src/services/realtimeVoice.service.ts)
- [src/screens/agent/AgentChatScreen.tsx](src/screens/agent/AgentChatScreen.tsx)
- [tests/e2e/ui/voice-ui.spec.ts](tests/e2e/ui/voice-ui.spec.ts)

Purpose of these in-progress changes:

- inject a simulated realtime final transcript in Playwright
- verify it creates exactly one user bubble
- verify assistant chunks append to the correct assistant placeholder

Current status of this automation work:

- code added locally
- static errors: clean
- full Playwright rerun after adding this new scenario: not yet executed at the time of this report

## 7. Current Known Problems / Open Items

### 7.1 Still Needs Verification

High priority:

- verify on real device that saying a sentence in duplex mode now results in:
  - final transcript
  - one user message bubble
  - assistant streaming text
  - TTS playback
- verify no regressions in interruption, reconnect, or speaking/listening phase transitions

### 7.2 Still Needs Investigation

Known unresolved issue:

- `voice:error { error: 'Transcription failed', code: 'STT_ERROR' }` can still happen from buffered fallback transcription in [backend/src/modules/voice/realtime-voice.gateway.ts](backend/src/modules/voice/realtime-voice.gateway.ts)

Interpretation:

- this is a backend/provider-side failure path
- it is separate from the frontend UI bridge bug
- if it still appears after the UI bridge fix, it should be debugged as a provider/transcription issue, not as a chat UI issue

### 7.3 Wake Word Still Needs More Real-Device Tuning

Still needs further tuning:

- repeated `local-wake:utterance-ignored` behavior around utterance duration and filtering
- threshold tuning for false negatives / false positives
- more real-device sample collection under different environments

### 7.4 Long-Term Platform Work Still Not Done

Not yet implemented and still out of current scope for this release cycle:

- Android native overlay + foreground service background hotword path
- desktop persistent local wake-word service beyond chat panel lifetime

## 8. Current Branch / Build Context

Relevant branch/build history:

- local branch currently: `build138`
- local branch was previously ahead of remote with multiple voice fixes
- backend/public build timeline already went through `build138`, `build139`, and `build140`

Important commits already referenced during the voice work:

- `ccd09bb4` — earlier voice fix bundle on local `build138`
- `98ef0783` — `origin/build139`
- `354a07b` — public repo `Agentrix-Claw/build139`
- `528745e9` — focused commit for realtime session stability and audio payload fix
- `51c1d8a` — public repo `Agentrix-Claw/build140`

Last confirmed public repo state:

- `Agentrix-Claw/build140` exists
- latest commit on `build140` was confirmed as `51c1d8a`
- Actions page last confirmed:
  - `Build → Test → Release APK #53` for `build140` was running
  - `Build iOS Simulator #49` for the same commit completed successfully
- last confirmed release page still showed `Build #52` as latest published release at the time of the last public web check, which means `build140` APK publication should be re-checked before using it as the next known-good package reference

## 9. What Has Been Verified vs What Has Not

### Verified

- backend streaming finalization fallback logic
- React Native buffer-like audio payload handling
- general web voice UI regression suite
- no current syntax/type diagnostics in changed voice files
- public repo mirror/push process and workflow trigger path

### Not Fully Verified Yet

- latest `final transcript -> user bubble` fix on real device
- full duplex chain on real APK:
  - speak
  - transcript final arrives
  - user bubble inserted
  - assistant response streams
  - TTS plays
- whether `Transcription failed` is still reproducible after the newest frontend fix

## 10. Recommended Next Validation Sequence

Recommended immediate next steps, in order:

1. rerun Playwright voice UI suite after the new E2E realtime transcript test is included
2. commit only the voice-relevant frontend changes and test harness updates
3. publish a new public mobile build branch
4. wait for APK workflow completion
5. install APK on real device and verify the exact chain below

Real-device checklist:

1. open AgentChat in voice mode
2. ensure realtime session becomes ready
3. speak one short sentence
4. confirm final transcript appears in preview and then as a user bubble
5. confirm assistant placeholder exists immediately after the user bubble
6. confirm assistant streaming text arrives
7. confirm TTS plays
8. confirm a second turn still works without reconnect storm or stuck state
9. confirm wake word can still launch voice experience

## 11. Public Build / Workflow Trigger Procedure

### 11.1 Normal Path

If local GitHub network is healthy:

1. commit the focused voice fix on the working branch
2. push to the desired public build branch target, for example `build141`
3. ensure `Agentrix-Claw` branch receives the mobile-only mirror contents
4. verify GitHub Actions starts automatically

### 11.2 Current Reliable Fallback Path

If local machine cannot push to GitHub over 443, use the server-side public build mirror script:

- [scripts/public-build/push_public_build_via_server.ps1](scripts/public-build/push_public_build_via_server.ps1)

What it does:

- reads `scripts/public-build/mobile_mirror_paths.txt`
- stages only the public mobile mirror paths
- copies build workflow files into the stage directory
- archives the staged mobile repo snapshot
- uploads the archive to the server over SSH
- server clones `CutaGames/Agentrix-Claw`
- server checks out or creates the target branch
- server replaces repo contents with the staged snapshot
- server commits and pushes to the target branch

Important inputs:

- branch name, for example `build141`
- server host: default `ubuntu@18.139.157.116`
- SSH key: default `C:\Users\15279\Desktop\hq.pem`
- token env file on server: `/home/ubuntu/.config/agentrix/public-build.env`

Example usage:

```powershell
./scripts/public-build/push_public_build_via_server.ps1 -Branch build141
```

### 11.3 Workflow Files Included In Public Build Stage

The script ensures these are copied into the public mirror:

- `.github/workflows/build-apk.yml`
- `.github/workflows/build-ios-simulator.yml`
- `.github/public-workflows/build-apk-trigger.yml` -> `.github/workflows/build-apk-trigger.yml`
- `.github/public-workflows/build-ios-simulator-trigger.yml` -> `.github/workflows/build-ios-simulator-trigger.yml`

Expected result after push:

- `Build → Test → Release APK` workflow auto-triggers on the public build branch
- `Build iOS Simulator` workflow auto-triggers on the public build branch

### 11.4 Post-Push Verification Checklist

After public branch push:

1. confirm target branch exists in `CutaGames/Agentrix-Claw`
2. confirm latest commit SHA on that branch
3. confirm APK workflow run started
4. confirm iOS simulator workflow run started
5. wait for APK workflow completion
6. confirm release artifact / release tag if generated

## 12. Current Working Tree Notes

Current working tree is dirty for unrelated reasons, including:

- Android gradle cache/state files
- backend smoke JSON artifacts
- generated test reports

Relevant tracked functional voice change already present in working tree:

- [src/hooks/useVoiceSession.ts](src/hooks/useVoiceSession.ts)

Relevant new local validation/harness changes also present in working tree:

- [src/testing/e2e.ts](src/testing/e2e.ts)
- [src/services/realtimeVoice.service.ts](src/services/realtimeVoice.service.ts)
- [src/screens/agent/AgentChatScreen.tsx](src/screens/agent/AgentChatScreen.tsx)
- [tests/e2e/ui/voice-ui.spec.ts](tests/e2e/ui/voice-ui.spec.ts)

Recommendation for the next commit:

- stage only the voice-related source files and any test files intentionally included for this fix
- do not include unrelated smoke JSON artifacts, gradle cache, or generated report files

## 13. Short Session Handoff Summary

If continuing in a new session, the fastest accurate summary is:

- backend finalization race was already fixed earlier and validated
- frontend reconnect storm was already fixed earlier and validated
- RN audio chunk transport was already fixed earlier and validated
- newest user-reported issue was that final transcript arrived but did not enter the chat UI
- local fix now bridges server final transcript into the actual chat message pipeline with dedupe
- generic voice UI web regression and backend realtime gateway tests currently pass
- full real-device validation for this newest bridge fix is still pending
- next correct move is: run the new targeted E2E test, commit focused voice changes, publish next public build branch, then verify on device
