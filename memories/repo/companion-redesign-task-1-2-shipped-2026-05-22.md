# Companion Redesign T1 + T2 shipped — 2026-05-22

> Sprint P-9 wave 1+2 — frontend foundation: companionEvents bus + 8 CompanionMode + 4-tab IA.
> Commit `0a9e82a4a` on origin/build/mobile-pet-forms-p6-2026-05-22.

## Tasks done

- T1.1 ✅ `npm install @gorhom/bottom-sheet expo-battery@~9.0.0 --legacy-peer-deps`
- T1.2 ✅ `src/services/companionEvents.service.ts` — central event bus (PII redact + voiceDiagnostics auto-log + 18 event types)
- T1.3 ✅ `src/services/petMode.ts` extended with 8 `CompanionMode` + transition matrix (`resolveTransition()` priority + Local_Action_Wins + 30s flip-debounce)
- T1.4 ✅ `src/services/__tests__/petMode.companion.test.ts` — 18/18 passing
- T2.1 ✅ `src/navigation/WorldStackNavigator.tsx` + `src/screens/world/WorldHubScreen.tsx` + `worldEngineApi.fetchWorldEngineFlag()`
- T2.2 ✅ MainTabNavigator → 4 visible tabs (World / Summon / Plaza / Me), default = World
- T2.3 (deferred to T6.7 — CompanionSettings goes with full sheet section work)
- T2.4 ✅ legacyRouteTable extended with home/* → world / me/* redirects (~30 new mappings)
- T2.5 ✅ Deleted 9 files: 7 navigators (Home/Drawer/Wallet/Pet/Agent/Team/Discover/Today + Drawer) + 2 screens (HomeScreen/PetHubScreen)
- T2.6 (deferred — Maestro 47-* full E2E waits for T3+ ball mount)

## Net changes

```
22 files changed, 1346 insertions(+), 1768 deletions(-)
                                         ^^^^^^^^^^^^^^^
                                         net -422 lines, simpler IA
```

Files:
- new: WorldHubScreen / WorldStackNavigator / companionEvents / petMode.companion.test
- modified: MainTabNavigator / types.ts / legacyRouteTable / petMode / worldEngineApi / package.json / package-lock.json
- deleted: 7 legacy navigators + 2 legacy screens (Home tab + Pet hub)

## Test status

- Unit: `petMode.test.ts` (8) + `petMode.companion.test.ts` (18) + `petModeAdapters.test.ts` (7) + `legacyRouteTable.test.ts` (111) = **144 / 144 passing** ✅
- TSC: 0 new errors. 4 pre-existing errors verified via stash test:
  - `MobilePetProactiveBanner.tsx:76` (PetProactivePayload cast)
  - `WorldBattleArenaScreen.tsx:110` (BattlePhase enum)
  - `defaultIntentHandlers.ts:51` (intent dispatch arg type)
  - `worldEngineCache.ts:27` (expo-file-system cacheDirectory)

## Key design decisions made during implementation

1. **PetMode + CompanionMode are orthogonal layers**, not replacements. PetMode is the sprite-level key (idle/listen/talk/...). CompanionMode is the user-facing semantic (companion/vigil/journey/...). One CompanionMode resolves to one PetMode for rendering. This preserves backwards compat with all existing `setPetMode()` callers (PetCompanionScreen, GlobalFloatingBall, etc.).

2. **`force: true` on resolveTransition() bypasses BOTH Local_Action_Wins AND priority arbitration**. Initial implementation only bypassed Local_Action_Wins, which broke TTL revert (whisper → companion was rejected by priority logic). Now force is the explicit "I really mean it, override everything" signal.

3. **Local_Action_Wins window = 5s** + **mode-debounce window = 30s with 3 max flips** (per requirements R2.10 + R1.8). Tested both branches.

4. **MainTabNavigator deletes ALL 6 hidden legacy tabs** (not just hides them). The legacyRouteTable.ts handles deep-link compat — `agentrix://home/pet/wardrobe` → `agentrix://me/companion/wardrobe`, etc.

5. **HomeStackParamList / AgentStackParamList / etc. types are KEPT in types.ts** even though their navigators are deleted. Reason: 16+ existing screens (AgentChatScreen, AgentConsoleScreen, etc.) still import them as type hints. They compile as pure types with no runtime impact. Phase 2 cleanup will rename these screens to use new ParamLists.

6. **WorldHubScreen does optimistic cohort detection**: on /v1/world-engine/quota/status 404 → render coming-soon, on 401/network → optimistic enabled. Better UX than aggressive blocking.

## Gotchas

- `npm install` requires `--legacy-peer-deps` due to pre-existing expo-three/three peer conflict (unrelated to our deps).
- `expo-battery@56` (latest) is incompatible with Expo SDK 54 — must pin to `~9.0.0`.
- `src/screens/HomeScreen.tsx` (root-level, the IdentityTabs legacy file) and `src/screens/home/HomeScreen.tsx` (the actual P-9 deletion target) are TWO DIFFERENT files. Initially deleted only the wrong one; corrected in-flight.
- PowerShell doesn't support `&&` — must use `;`. `head` doesn't exist; use `Select-Object -First N`.

## What's NOT done yet

- T3 Companion_Ball upgrade (56pt + 8 mode mapping + signing lock) — depends on T1 ✅
- T4 CompanionLayer global mount — depends on T2 ✅ + T3
- T5 ConversationBubble — depends on T4 + @gorhom/bottom-sheet ✅
- T6 PetDetailSheet — depends on T4 + @gorhom/bottom-sheet ✅

T3-T6 can all start now in next session.

## Verification path for next session

```
npx jest src/services/__tests__/petMode.companion.test.ts  # should be 18/18
npx tsc --noEmit  # should report 4 pre-existing errors only
```

## Files

```
src/services/companionEvents.service.ts          (new, 215 lines)
src/services/petMode.ts                          (extended +220 lines)
src/services/__tests__/petMode.companion.test.ts (new, 207 lines)
src/services/worldEngineApi.ts                   (extended +30 lines)
src/screens/world/WorldHubScreen.tsx             (new, 270 lines)
src/navigation/WorldStackNavigator.tsx           (new, 130 lines)
src/navigation/MainTabNavigator.tsx              (rewrote, 110 lines)
src/navigation/types.ts                          (modified)
src/navigation/legacyRouteTable.ts               (extended +50 lines)
package.json + package-lock.json                 (deps added)
DELETED: 9 files (4×Navigator + 2×Screen + 1×Drawer + Today + legacy Wallet/Agent/Discover/Team/Pet/Home navigators)
```
