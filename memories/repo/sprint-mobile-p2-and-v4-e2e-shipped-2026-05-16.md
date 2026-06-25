# Sprint M-P2 + V4 E2E shipped — 2026-05-16

> Continuation of `sprint-mobile-p0-p1-shipped-2026-05-16.md`. Production
> commit `0179855f` (last), backend + frontend deployed and pm2-restarted.

## What landed (Sprint M-P2)

### M-P2-1 OTA rollout
- `docs/RUNBOOK_OTA_ROLLOUT.zh-CN.md` — 8-section playbook covering
  EAS Update channel topology, hotfix flow with preview-canary
  promotion, rollback via `eas update:republish`, and Sentry-driven
  auto-stop.

### M-P2-2 Analytics
- `src/services/analytics.service.ts` — opt-in mobile telemetry, batches
  to 100 events / 5 minutes, flushes on AppState background. 10
  allow-listed event names. Hashed device id in MMKV.
- `backend/src/modules/desktop-lifecycle/mobile-analytics.controller.ts`
  on `POST /v1/mobile/analytics` reuses the desktop ingestion pipeline.
  Same `agentrix_desktop.analytics_events` table; mobile vs desktop
  events differ by event-name prefix.
- ClawSettingsScreen "Anonymous Telemetry" toggle in About.

### M-P2-3 AXP expiry cron
- `backend/src/modules/axp/axp-expiry.service.ts` — two crons:
  - 02:30 UTC daily expiry sweep (calls `AxpService.expireOldEarnRows`)
  - 08:00 UTC daily expiry warning push, idempotent via
    `metadata.expiryWarningSentAt`
- 3/3 jest passing on `axp-expiry.service.spec.ts`.

App.tsx wires the new analytics service alongside Sentry + RevenueCat.

## V4 E2E results (2026-05-16)

Comprehensive automated suite ran against production:

| Suite | Tests | Status |
|------|------|------|
| Web V4 Full (Playwright Chromium) | 30+ tests | ✅ PASS (9.5 min) |
| Backend API Smoke (Playwright) | N tests | ✅ PASS (26 s) |
| Backend Jest 18 suites (axp / desktop / marketplace) | 141 / 141 | ✅ PASS (6.5 min) |
| Desktop Vitest 12 suites | 71 / 71 | ✅ PASS (41 s) |
| V4 Production Smoke (35 endpoints) | 35 / 35 | ✅ PASS (1 min) |

Full report: `tests/reports/E2E_REPORT_2026-05-16.md`.

### Key validated

- `/.well-known/{assetlinks.json,apple-app-site-association}` — 200
- `POST /v1/mobile/analytics` — 202 with batch events
- `POST /v1/payment/iap-webhook` — 401 fail-closed without secret
- `GET /v1/axp/redeem/catalog` — 401 JWT-guarded
- All 20 web pages return expected codes (200 / 308 redirect / 500 for /500 / 404 for unknown)
- Marketplace public endpoints (browse / leaderboard / pets/:id / bids) all 200

## Issues found (none blocking GA)

- **P2** Mobile typecheck has 22 pre-existing errors in unrelated files
  (HomeStackNavigator NftMint, BreedScreen biasTowardA, clawcore
  firmwareSigning, nfc.service Uint8Array typing, axpCashback
  AxpToastState shape, CameraScanScreen EncodingType). Not introduced
  this sprint; queue for cleanup pass.
- **P2** Lighthouse mobile perf still 63 (target 80) — `/market/leaderboard`
  perf=36 LCP=11.1s is the highest-ROI fix (needs SSR first paint).
- **P2** AASA (apple-app-site-association) still has placeholder
  `TEAM_ID.com.agentrix.claw` — should be `app.agentrix.claw`. Defer
  to iOS sprint.
- **P3** `marketplace-pet/phase3-e2e.spec.ts` hangs in dev sandbox
  (Postgres E2E container). CI runs it fine. Excluded via
  `--testPathIgnorePatterns="phase3-e2e"` in our jest invocation.
- **P3** Backend jest reports "worker process has failed to exit
  gracefully" — likely an active timer in one of the marketplace
  specs. Tests pass but log is noisy.

## New scripts

- `scripts/test/v4-full-smoke.ps1` — 35-endpoint V4 prod smoke
  (uses file-based bodies under `tests/reports/smoke-bodies/`
  to avoid PowerShell quote-escaping pitfalls)
- `scripts/test/mobile-api-smoke.ps1` — focused mobile API check
- `scripts/test/run-v4-e2e-full.ps1` — fixed emoji mojibake in
  ASCII-only output

## Production verification (post-deploy)

`https://agentrix.top` running commit `0179855f`:
- agentrix-backend pm2 process online, ~32 MB RAM
- agentrix-frontend pm2 process online, ~20 MB RAM
- Backend rebuild took 16 s (new node 20.11; engine warning
  on @sentry/* installs)
- All 35 smoke endpoints return expected status codes

## Three-platform GA timeline

| Platform | Smoke | Distance to GA |
|---------|:-----:|---------------:|
| Web | 35 / 35 ✅ | Live; Lighthouse perf optimization is post-GA |
| Desktop | vitest 71/71 ✅ | Awaiting Azure Trusted Signing (5-10 day external review) |
| Mobile (Android) | Backend + asset-linking ✅ | Awaiting ops: Play Console + RevenueCat + Sentry DSN |

Target window: **2026-06-01 ~ 2026-06-06** for synchronized 3-platform GA.

## Gotchas

- Local jest can't run `marketplace-pet/phase3-e2e.spec.ts` — it
  expects a Postgres E2E container. Always exclude via
  `--testPathIgnorePatterns="phase3-e2e"` when running locally.
- Desktop vitest leaks `node (vitest)` worker processes that don't
  always get cleaned up. They eventually die. No production impact.
- PowerShell `-d '{...}'` flag breaks JSON quotes when curl is
  invoked through `& curl.exe @args` array splatting. Use
  `--data-binary @file.json` instead. The `tests/reports/smoke-bodies/`
  directory holds the canonical bodies.
- The smoke script's `assetlinks.json` path serves with
  `Content-Type: application/json` — verified via headers in the
  smoke run.
