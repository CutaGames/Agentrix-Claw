# Sprint Mobile P0+P1 (Android-first) shipped — 2026-05-16

> Continuation of `sprint-w-1-w-2-w-3-shipped-2026-05-16.md` /
> `sentry-lighthouse-mobile-audit-2026-05-16.md`. Production commit
> `249d99fa` deployed (backend + frontend, both `pm2 restart`'d).
> iOS-specific work (App Store flow, App Intents native compile)
> deferred per user instruction.

## What landed

### Backend endpoints (M-P0-5)

1. **AXP Redeem** (`backend/src/modules/axp/redeem.service.ts`)
   - `GET /v1/axp/redeem/catalog` — 8-item catalog matching mobile
     fallback in `AxpRewardShopScreen.tsx`
   - `POST /v1/axp/redeem` — spends AXP via `AxpService.spend`,
     decrements stock for limited items, maps category → AXP source
   - 6/6 jest passing on `redeem.service.spec.ts`

2. **Mobile Stripe Checkout** (`mobile-checkout.controller.ts`)
   - `POST /v1/checkout/session` — Stripe-hosted Checkout for web
     fallback (subscription + payment modes)
   - `POST /v1/checkout/payment-intent` — native PaymentSheet
     (Apple Pay / Google Pay) with ephemeralKey + customer id
   - `GET /v1/checkout/session/:id/verify` — poll completion state

3. **IAP Webhook** (`iap-webhook.controller.ts`)
   - `POST /v1/payment/iap-webhook` — `@Public()` route receives
     RevenueCat events. Verifies `REVENUECAT_WEBHOOK_SECRET` from
     env (fail-closed in production when secret missing).
   - Maps `axp_pack_<amount>` product IDs → AxpService.earn() with
     source `admin_grant`. Subscription receipts logged for now;
     full subscription extension waits for SubscriptionService.

### Mobile RN services (M-P0-3 / M-P0-4)

1. **Sentry** (`src/services/crashReport.ts` + `App.tsx`)
   - `@sentry/react-native@8.11.1` installed (legacy-peer-deps for
     React 19 compatibility).
   - DSN read from `app.json` extra or `EXPO_PUBLIC_SENTRY_DSN`.
     Without DSN, init is a no-op.
   - `beforeSend` sanitizer strips wallet (0x...), email, file
     paths (`/Users/...`), and `Bearer <token>` strings.
   - Always-on error capture (safety net) but breadcrumbs gated
     by `agentrix_telemetry_opt_in === '1'`.
   - User binding via `setUser(userId)` after login.

2. **RevenueCat / IAP** (`src/services/iap.service.ts` + `App.tsx`)
   - `react-native-purchases@8.x` installed.
   - Lazy-loads SDK so Expo Go / web doesn't blow up on the
     missing native module.
   - `initIap(userId)` configures with `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`
     (or iOS variant). User binding rotates with auth state.

### In-app compliance (M-P0-6)

`src/screens/me/ClawSettingsScreen.tsx`:
- About section grew from 3 → 5 items: Terms, Privacy, Export My
  Data, Delete Account.
- Terms / Privacy use `Linking.openURL` to open
  `https://agentrix.top/{terms,privacy}` (the W-3 pages shipped in
  prior commit `2b40cda1`).
- Export / Delete launch a `mailto:privacy@agentrix.top` with
  pre-filled subject + body. Confirmation Alert explains GDPR
  Article 20 timeline (30 days to deliver export, 7 days to delete).

`src/screens/me/AxpCenterScreen.tsx`:
- Added a footer disclaimer: "AXP is a platform-internal reward.
  Not a currency, not a security, cannot be exchanged for fiat or
  transferred between accounts."

### Android App Actions + App Links (M-P1-2)

`android/app/src/main/AndroidManifest.xml`:
- `<meta-data android:name="com.google.android.actions" android:resource="@xml/actions"/>`
  — wires the existing `res/xml/actions.xml` (6 BIIs) into Google
  Assistant.
- HTTPS intent-filter on `agentrix.top` gains `android:autoVerify="true"`.

`frontend/public/.well-known/`:
- `assetlinks.json` package name fixed: `com.agentrix.claw` →
  `app.agentrix.claw` (matches `app.json`).
- SHA-256 fingerprint placeholder remains until first prod
  keystore exists.
- `next.config.js` headers serve `/.well-known/{assetlinks.json,
  apple-app-site-association}` with `application/json`
  content-type and a 5-minute cache.

### Documentation (M-P0-2)

`docs/PLAY_STORE_LAUNCH_CHECKLIST.zh-CN.md` — 10-section playbook:
1. Prerequisites (Play Console $25, RevenueCat dashboard, Sentry
   DSN, etc.)
2. Store metadata (titles / descriptions / screenshots / video)
3. IAP product table (8 subscription SKUs + 5 AXP packs)
4. Data Safety form (every collected field + third-party share)
5. IARC content rating (T/13+, PEGI 12; flags virtual currency
   + user-generated content)
6. Permission justifications (FOREGROUND_SERVICE_MICROPHONE
   needs video evidence per 2024-07 Play policy)
7. App Links verification (assetlinks.json + adb verification)
8. Release tracks (Internal → Closed → Open → Production)
9. Post-launch monitoring (Vitals, Sentry link, A/B testing)
10. iOS deltas (deferred to its own checklist)

## Production verification

| Endpoint | Result |
|----------|:------:|
| `https://agentrix.top/.well-known/assetlinks.json` | 200 + `application/json` ✓ |
| `https://agentrix.top/.well-known/apple-app-site-association` | 200 ✓ |
| `GET /api/v1/axp/redeem/catalog` | 401 JWT-required ✓ |
| `POST /api/v1/checkout/session` | 401 JWT-required ✓ |
| `POST /api/v1/payment/iap-webhook` | 401 (production fails closed without `REVENUECAT_WEBHOOK_SECRET`) ✓ |

## Required ops follow-ups

To activate the new mobile pipeline in production:

1. Open Google Play Console + register `app.agentrix.claw`
2. Open Sentry, create `agentrix-mobile-android` project, get DSN,
   inject as `EXPO_PUBLIC_SENTRY_DSN` build-time env on EAS
3. Open RevenueCat dashboard, create app, get Android API key,
   inject as `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`
4. Generate Play Console webhook shared secret in RevenueCat,
   set `REVENUECAT_WEBHOOK_SECRET` on prod backend env, restart
   `agentrix-backend`
5. After first `eas build --profile production --platform android`,
   extract SHA-256 from upload keystore and replace placeholder in
   `frontend/public/.well-known/assetlinks.json`, redeploy frontend.
6. Trigger Play Internal track build with `eas build --profile production --platform android`
   then `eas submit --platform android`.

## Known gotchas

- `react-native-purchases` requires `--legacy-peer-deps` because of
  React 19 RC; once libraries declare React 19 support this can be
  dropped.
- `@sentry/react-native` engine warning at install time (Node ≥
  20.19.4 required, machine has 20.11). Build still succeeds; no
  runtime impact in production.
- `apple-app-site-association` still has placeholder
  `TEAM_ID.com.agentrix.claw` (wrong package_name); fix when
  doing iOS App Store sprint.
- Android App Actions only fire after a native module
  (`AgentrixIntentBridgeModule`) bridges the deep-link path back
  into JS. Currently the deep-link `agentrix://intent/...` lands in
  the existing linking handler; we just don't have explicit
  per-intent JS handlers yet. Acceptable for first store submission
  because Assistant simply opens the app at the deep link.
- Mobile typecheck reports 22 errors in unrelated pre-existing
  files (`HomeStackNavigator`, `BreedScreen`, `clawcore/firmwareSigning`,
  etc.). None introduced by this sprint.

## Deferred (iOS)

Per user instruction, all iOS-specific work is deferred:

- `eas build --platform ios --profile production`
- App Store Connect app creation + IAP catalog
- `ios/AgentrixIntents/AgentrixIntents.swift` native compilation
- `apple-app-site-association` TEAM_ID prefix correction
- TestFlight 7-14 day soak

When iOS sprint resumes, the codebase already supports it — just
need the App Store Connect side + Xcode native module wiring.
