# Agentrix E2E Test Plan — Post Gap-Analysis Fix Verification

> Generated after completing P0-P3 fixes from `BUILD91_GAP_ANALYSIS.md`

## 1. Overview

| Item | Detail |
|------|--------|
| Target | Backend: `https://api.agentrix.top/api` / Mobile: Expo Dev Client |
| Framework | Playwright (API tests) + Manual (mobile UI) |
| Specs | `tests/e2e/commerce-all-modules.spec.ts` (existing) |
|       | `tests/e2e/gap-fixes-verification.spec.ts` (new) |
| Config | `tests/e2e/playwright.config.ts` |

## 2. Test Matrix — Backend API (Playwright)

### Phase A: Run automated Playwright tests

```bash
# From project root (WSL):
npx playwright test -c tests/e2e/playwright.config.ts --project=chromium --reporter=line 2>&1 | tee tests/reports/e2e-full.log
```

| Test ID | Priority | Endpoint | Expected |
|---------|----------|----------|----------|
| H-1 | P0 | `GET /health` | 200 + `{status:'ok'}` |
| H-2 | P2 | `GET /docs` | 200 (Swagger UI) |
| DM-1 | P0 | `GET /messaging/conversations` | ≠404 |
| DM-2 | P0 | `POST /messaging/dm/:id` | ≠404 |
| GC-1 | P0 | `GET /messaging/groups/:id/messages` | ≠404 |
| GC-2 | P0 | `POST /messaging/groups/:id/messages` | ≠404 |
| AG-1 | P0 | `POST /agent-accounts/:id/suspend` | ≠404 |
| AG-2 | P0 | `POST /agent-accounts/:id/resume` | ≠404 |
| AG-3 | P1 | `GET /agent-accounts` | ≠404 |
| AG-4 | P2 | `POST /agent-accounts` (create) | ≠404 |
| AU-1 | P1 | `POST /agent-authorization/check-permission` | ≠404 |
| AU-2 | P1 | `DELETE /agent-authorization/:id` | ≠404 |
| OC-1 | P0 | `GET /openclaw/bridge/skill-hub/search` | ≠404, <500 |
| OC-2 | P0 | `GET /openclaw/bridge/skill-hub/categories` | ≠404, <500 |
| DA-1 | P1 | `GET /developer-accounts/my` | ≠404 |
| DA-2 | P1 | `GET /developer-accounts/dashboard` | ≠404 |
| DA-3 | P1 | `GET /seller/my` | =404 (removed) |
| SC-1 | P3 | `GET /social/callback/status` | 200 + 3 platforms |
| SC-2 | P3 | `GET /social/callback/events` | 200 + events array |
| PN-1 | P3 | `POST /notifications/register` | ≠404 |
| PN-2 | P3 | `GET /notifications/unread-count` | ≠404 |
| MP-1 | P2 | `GET /unified-marketplace/search` | <500 |
| CL-1 | P2 | `POST /claude/chat` | ≠404 |

### Phase B: Manual verification on failing tests

For any test receiving unexpected status codes:
1. Check backend logs: `ssh agentrix.top 'docker logs agentrix_backend --tail 100'`
2. Verify env vars: `ssh agentrix.top 'docker exec agentrix_backend env | grep -E "TELEGRAM|DISCORD|TWITTER|EXPO"'`
3. Fix and re-run

## 3. Test Matrix — Mobile UI (Manual / Emulator)

After APK build, test these flows on Android emulator or physical device:

### 3a. Navigation & Core Flows

| ID | Screen | Actions | Expected |
|----|--------|---------|----------|
| M-1 | Agent Tab | Tap → Console | Shows 3-card overview (⚡🟢☁️) |
| M-2 | Agent Console | Tap model switcher | Opens LLMEngine screen (not Alert) |
| M-3 | LLMEngine | Switch modes: Platform/BYOK/Local | All 3 tabs render; beginner sees only Platform |
| M-4 | Agent Console | Complete 3/3 onboarding | Confetti animation plays |
| M-5 | Agent Console | Tap download banner links | Opens browser (Linking.openURL) |
| M-6 | Create Agent | Tap + Create | 3-step wizard: Identity → Limits → Review |
| M-7 | Explore Tab | Browse marketplace | Skills load; if empty, shows [Preview] prefix |
| M-8 | Social Tab | Open feed | Posts load; if API fails, shows [Preview] posts |
| M-9 | Social Tab | Open DM | Calls `/messaging/dm/` (not `/social/dm/`) |
| M-10 | Me Tab | Open settings | UiComplexity toggle works |

### 3b. Payment Flow

| ID | Flow | Expected |
|----|------|----------|
| P-1 | Checkout screen | BSC Testnet badge visible in __DEV__ |
| P-2 | QuickPay button | Highlighted MPC QuickPay renders above methods |
| P-3 | Begin checkout | `Linking.openURL(checkoutUrl)` opens browser |
| P-4 | Order polling | `pollOrderStatus()` polls after redirect |

### 3c. Agent Permissions

| ID | Flow | Expected |
|----|------|----------|
| AP-1 | Permissions screen | Loads from backend via useEffect |
| AP-2 | MCP Manage | Navigates correctly |
| AP-3 | Terminate agent | Calls DELETE endpoint |

### 3d. FloatingChatButton

| ID | Flow | Expected |
|----|------|----------|
| FC-1 | Visible on all tabs | Button rendered in MainTabNavigator |
| FC-2 | Tap | Opens chat interface |
| FC-3 | Drag | Button repositions (if draggable) |

### 3e. UiComplexity

| ID | Flow | Expected |
|----|------|----------|
| UC-1 | Set Beginner | Quick actions filtered; model switcher hidden |
| UC-2 | Set Advanced | More quick actions visible |
| UC-3 | Set Professional | All features visible |

## 4. Execution Workflow

```
┌─────────────────────┐
│ 1. Run Playwright    │
│    E2E tests (API)   │
├─────────────────────┤
│ 2. Fix any failures  │
│    in backend/       │
├─────────────────────┤
│ 3. Build APK         │
│    (Gradle / EAS)    │
├─────────────────────┤
│ 4. Install on        │
│    emulator/device   │
├─────────────────────┤
│ 5. Run manual        │
│    mobile tests      │
├─────────────────────┤
│ 6. Fix frontend      │
│    issues found      │
├─────────────────────┤
│ 7. Rebuild APK       │
│    if needed         │
├─────────────────────┤
│ 8. Commit & push     │
│    to GitHub         │
└─────────────────────┘
```

## 5. Commands Reference

```bash
# Run all E2E tests
npx playwright test -c tests/e2e/playwright.config.ts --project=chromium --reporter=line

# Run only gap-fix verification
npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/gap-fixes-verification.spec.ts --project=chromium

# Run only commerce suite
npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/commerce-all-modules.spec.ts --project=chromium

# Build APK (Gradle)
cd mobile-app && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease

# Build APK (EAS local)
cd mobile-app && eas build --platform android --profile preview --local

# Install on emulator
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## 6. Pass/Fail Criteria

- **Backend API**: All 23 Playwright tests pass (≠404 for existing endpoints, correct status for new ones)
- **Mobile UI**: All 18 manual test cases pass without crashes
- **No regressions**: Existing `commerce-all-modules.spec.ts` tests still pass
- **Build success**: APK builds without errors and installs on emulator

## 7. Files Modified (P0-P3)

| File | Changes |
|------|---------|
| `mobile-app/src/screens/agent/AgentConsoleScreen.tsx` | LLMEngine nav, 3-card, confetti, download URLs |
| `mobile-app/src/screens/agent/AgentAccountScreen.tsx` | 3-step wizard |
| `mobile-app/src/screens/agent/LLMEngineScreen.tsx` | NEW: LLM engine config |
| `mobile-app/src/screens/market/CheckoutScreen.tsx` | BSC badge, QuickPay, Linking |
| `mobile-app/src/navigation/types.ts` | LLMEngine type, removed ChatStackParamList |
| `mobile-app/src/navigation/AgentStackNavigator.tsx` | LLMEngineScreen route |
| `mobile-app/src/services/openclawHub.service.ts` | [Preview] prefix |
| `mobile-app/src/services/marketplace.api.ts` | [Preview] prefix |
| `mobile-app/src/screens/TaskMarketScreen.tsx` | [Preview] prefix |
| `mobile-app/src/screens/social/FeedScreen.tsx` | [Preview] prefix |
| `backend/.env.example` | Added push notification + social env vars |
| `backend/src/main.ts` | Startup env validation warnings |
| `backend/src/modules/notification/notification.service.ts` | sendPushNotification via Expo |
