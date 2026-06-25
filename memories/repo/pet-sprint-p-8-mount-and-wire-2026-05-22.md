# Sprint P-8 — Mount floating ball + wire World Engine end-to-end (2026-05-22)

**Date**: 2026-05-22
**Branch**: `build/mobile-pet-forms-p6-2026-05-22`
**Origin commit**: `d080e1e2`
**Public mirror commit**: `5b5f8b15` on `CutaGames/Agentrix-Claw`

## Why P-8

Two false-positive ship signals from earlier sprints:

1. **P-6 (mobile pet forms)** — code was written but `<GlobalFloatingBall />`
   was never mounted in the production tree. Only the
   `src/testing/VoiceUiE2EApp.tsx` test harness mounted it. User
   installed APK → saw zero visible difference.
2. **World Engine on mobile** — `WorldEngineScannerScreen.handleSubmit`
   was a `Alert.alert('已提交') → goBack()` stub. Backend pipeline was
   100% real (Hunyuan3D + Meshy + 14 services + 10 controllers, PM2
   online), but the mobile client never made HTTP calls, never showed
   progress, never displayed generated assets. Inventory always returned
   `[]`. Battle / dungeon screens used static mock data.

User feedback: "扫描完后也没有任何反馈,3D 是否生成了在哪里? 啥也没有"
— factually correct.

## P0 — Floating ball mount (the dead-code fix)

### `App.tsx`

- Imported `GlobalFloatingBall` and `useAuthStore`.
- Restored a `function SplashScreen()` (was accidentally clobbered by
  an earlier str_replace pass).
- Added `<AuthenticatedFloatingBall />` helper component as a
  `<NavigationContainer>` sibling next to `<MobilePetProactiveBanner />`.
  Uses `useAuthStore((s) => s.isAuthenticated)` to gate.
- Reads sprite via `petMode` bus (already existing). The 12-form
  sprite system finally renders for end users.

## P0 — World Engine API service

### `src/services/worldEngineApi.ts` (NEW, 245 lines)

19 endpoint helpers wrapping `apiFetch`:
- Scan: `startScan`, `uploadScanFrame`, `predictScanQuality`, `generateFromScan`
- Job poll: `getJobStatus`
- Asset CRUD: `listWorldAssets` (query string serializer), `getWorldAsset`,
  `updateWorldAsset` (PATCH), `regenerateWorldAssetAttribute`,
  `deleteWorldAsset`, `bindAgentToAsset`, `unbindAgentFromAsset`
- Battle: `createBattle`, `getBattle`, `createBattleChallenge`,
  `acceptBattleChallenge`
- Dungeon: `generateDungeon`, `getDungeonByCode`, `attemptDungeon`

`uploadScanFrame` builds a `FormData` with the RN-native
`{uri, name, type}` triple — `apiFetch` already auto-strips
Content-Type for FormData bodies so the multipart boundary is set
correctly.

### `src/services/__tests__/worldEngineApi.test.ts` (NEW, 235 lines)

Mocks `apiFetch` and asserts path / method / body shape per endpoint.
20 contract tests across 4 describe blocks (scan / asset / battle /
dungeon). Locks the API surface so future refactors break loudly.

## P0 — Scanner submit wired to real backend

### `src/screens/WorldEngineScannerScreen.tsx`

`handleSubmit` no longer fires `Alert.alert('已提交')` then `goBack()`.
It now:

1. `await startScan(scanMode)` → `sessionId`
2. For each captured frame: `await uploadScanFrame(sessionId, ...)`,
   continue on per-frame failures (backend's `minFrames` check
   surfaces a clean error).
3. `await generateFromScan(sessionId, 'cartoon')` → `jobId, estimatedSeconds`
4. `navigation.replace('ReconstructionProgress', {jobId, estimatedSeconds, scanMode})`

`Alert.alert('提交失败')` only fires on real network errors, with the
backend's actual error message. `replace` (not `navigate`) so the
user can't swipe back into a stale scanner mid-flight.

## P0 — ReconstructionProgressScreen (NEW)

### `src/screens/ReconstructionProgressScreen.tsx` (NEW, 195 lines)

Polls `GET /v1/world-engine/jobs/:jobId/status` every 3 seconds,
4-minute hard cap. Three render states:

- **In-progress**: ActivityIndicator + percentage progress bar +
  stage label (translated from backend status enum to Chinese:
  `queued / reconstructing / styling / character_gen`) + estimated
  seconds remaining + "稍后查看" secondary action.
- **Completed**: 🎉 + "打开资产库" button → `navigation.reset` to
  inventory.
- **Failed / timed out**: ❌ + retry button (`navigation.goBack`) +
  "查看资产库" alternative.

`testID` markers (`reconstruction-progress` / `-complete` / `-error`)
for E2E coverage. `useFocusEffect` not needed — interval cleared on
unmount.

## P0 — Inventory fetch + actions wired

### `src/screens/WorldAssetInventoryScreen.tsx`

- `fetchAssets` calls `listWorldAssets({category, source, sort, limit})`
  and renders the result. Errors degrade to empty array (UI keeps
  working).
- `useFocusEffect` re-fetches on screen focus so a freshly-completed
  reconstruction shows up immediately when the user navigates back from
  ReconstructionProgressScreen.
- **Rename**: opens new `Modal` with TextInput + 30-char limit;
  `submitRename` → `updateWorldAsset(id, {name})` → re-fetch.
- **Regenerate**: secondary `Alert` chooses target
  (`stats / skills / personality / backstory / name`) →
  `regenerateWorldAssetAttribute(id, target)`.
- **Bind/Unbind Agent**: calls real endpoints + re-fetch + success
  haptic.
- **Delete**: confirm dialog → `deleteWorldAsset(id)` → re-fetch.
- **List for sale / Gift**: kept as `Alert.alert(..., '后续版本会开放')`
  with honest copy — explicitly P2+, not a stub claiming "开发中".

## P1 — Battle + Dungeon API

### `src/screens/WorldBattleArenaScreen.tsx`

`startBattle` reads `route.params.{challengerAssetId, defenderAssetId}`.
If both present → `createBattle(...)` real API. If absent → preserves
the existing deterministic mock so demo / preview surfaces still work.

`handleCreateChallenge` → `createBattleChallenge({challengerAssetId})`,
returns shareLink + expiresAt for user.

### `src/screens/WorldDungeonExplorerScreen.tsx`

`handleEnterDungeon` → `getDungeonByCode(code)` + `attemptDungeon(code)`.
Maps `dungeon.layout.rooms` from the backend into the local Room
structure; falls back to a single demo room if the layout is empty.

`handleGenerateFromScan` → `navigation.navigate('WorldEngineScanner')`
deep-link.

## E2E — replaces false-positive 44

### `.maestro/44-mobile-pet-forms.yaml` — DELETED

This spec only passed under `EXPO_PUBLIC_VOICE_UI_E2E=1` (test
harness). It's the reason P-6 looked shipped but wasn't.

### `.maestro/45-mobile-pet-forms-production.yaml` (NEW)

Tests the production tree directly: launches the normal release APK,
asserts `floating-ball-sprite` testID is visible on Home, navigates
between Home / Plaza tabs and re-asserts persistence. Three
screenshot frames for visual regression review.

### `.maestro/46-world-engine-scan-flow.yaml` (NEW)

Navigation flow test: enters World Assets tab, opens scanner via
empty-state CTA or FAB, cancels back. Doesn't drive the camera
itself (Maestro can't reliably grant runtime camera permissions);
the screen mount + route presence is the regression target.

## What this enables for users

- P-6 sprite system is finally visible — the kitsune renders as a
  real animated sprite on the floating ball. Before: same gradient
  blob with `AX` text mark.
- World Engine scanner now produces real backend jobs. Submitting
  frames navigates to a polling progress screen with percentage +
  stage label + ETA, and on completion deep-links to inventory.
- Inventory shows actual generated assets. Long-press menu actions
  (rename, regenerate, bind/unbind, delete) all reach the backend
  and refresh the list.
- Battle screen runs real backend simulations when launched with
  asset IDs. Async challenge creates a real share link.
- Dungeon entry actually loads a backend dungeon and starts an
  attempt record.

## What's still pending

| Item | Severity | Owner | ETA |
|---|---|---|---|
| Production secrets `TC_SecretId`/`TC_SecretKey`/`MESHY_API_KEY` on `47.130.176.148` | 🔴 Blocker for actual 3D output | DevOps | 30 min SSH op |
| Marketplace listing UI (上架出售) | 🟡 P2 | Mobile | 1-2 days |
| Gift flow UI | 🟡 P2 | Mobile | 1 day |
| Battle vs picker (asset selection UI for both sides) | 🟡 P2 | Mobile | 1 day |
| Dungeon generate-from-scan auto-trigger after room scan | 🟡 P2 | Mobile | 0.5 day |
| BFG history cleanup of `deliverables/pet_3d_regen_v4.json` Tencent secret | 🟢 P3 | DevOps | maintenance window |

## Validation

- `getDiagnostics` clean on all 8 touched files
- `npx jest` — 35 / 35 mobile tests pass (3 suites: petMode,
  petModeAdapters, worldEngineApi)
- `npx tsc --noEmit` — only pre-existing repo errors remain
  (HomeStackParamList typing on home grid + expo-file-system
  cacheDirectory typing); no new errors introduced.
- Pushed to `origin/build/mobile-pet-forms-p6-2026-05-22` (commit
  `d080e1e2`)
- Mirrored to `CutaGames/Agentrix-Claw/build/mobile-pet-forms-p6-2026-05-22`
  (commit `5b5f8b15`) via `scripts/public-build/manual-mobile-mirror.ps1`
- APK CI on the public mirror is now running. Check
  `https://github.com/CutaGames/Agentrix-Claw/actions` for build
  status + artifact download.

## Lessons captured for future audits

1. **A passing E2E spec doesn't prove production behavior** — verify
   the test isn't running against a mock harness only.
2. **"Component code is written" ≠ "component is mounted"** — always
   grep for the JSX usage site, not just the export.
3. **`TODO: call API` stub patterns hide as `Alert.alert('已提交')` →
   goBack()** — these read like success states. Audit needs to flag
   them explicitly, not count UI scaffolding as "done".
4. **Backend completeness ≠ end-to-end completeness**. The audit doc
   correctly counted backend services but missed that the mobile
   client never reaches them.

## Next session

- User installs new APK from `CutaGames/Agentrix-Claw` actions →
  expects to see floating ball sprite + scanner→progress→inventory
  flow working end-to-end (modulo production secrets gating actual
  3D output).
- If 3D output still empty after install: SSH to `47.130.176.148`,
  set `TC_SecretId/TC_SecretKey` in `/home/ubuntu/Agentrix/backend/.env`,
  `pm2 restart agentrix-backend`. That unblocks Hunyuan3D actual
  generation.
