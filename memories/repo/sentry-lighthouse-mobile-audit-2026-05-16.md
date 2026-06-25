# Sentry + Lighthouse + Mobile audit shipped (2026-05-16)

> Continuation of `sprint-w-1-w-2-w-3-shipped-2026-05-16.md` —
> closes the W-2 / W-3 leftover items and lands the mobile go-live
> audit. Production commit `05cfc5f3` deployed.

## What landed

### Sentry (frontend)

- `@sentry/nextjs@10.53.1` installed in `frontend/package.json`.
- Three new config files (no-op without `SENTRY_DSN`):
  - `frontend/sentry.client.config.ts` — browser SDK + cookie-consent gate
  - `frontend/sentry.server.config.ts` — Node runtime
  - `frontend/sentry.edge.config.ts` — Edge runtime
- `frontend/next.config.js` wraps with `withSentryConfig` only when DSN
  is provided. Build is unaffected when DSN is absent (production
  currently runs without DSN — needs ops to provision DSN before SDK
  starts capturing).

To activate: set `SENTRY_DSN` (and optionally `NEXT_PUBLIC_SENTRY_DSN`
+ `SENTRY_ORG` + `SENTRY_PROJECT`) on the prod host's environment, then
`pm2 restart agentrix-frontend`. Source-map upload is opt-in via the
same envs.

### Lighthouse baseline

- `scripts/check/parse-lighthouse.mjs` — extracts perf/LCP/TBT/CLS from
  Lighthouse JSON reports.
- `scripts/check/run-lighthouse-batch.ps1` — PowerShell wrapper that
  loops through 8 P0 URLs, writes `tests/reports/LIGHTHOUSE_<form>_<date>.md`
- `tests/reports/LIGHTHOUSE_mobile_2026-05-16.md` — first prod baseline.
  Headlines:
  - Avg perf **63** (target 80)
  - Avg LCP **3.9s** (target 2.5s)
  - Avg TBT **888ms** (target 200ms)
  - Avg CLS **0.009** (target 0.1) ✅
  - SEO 100, Best Practices 99, A11y 97 — all good
  - **Outlier:** `/market/leaderboard` perf=36 LCP=11.1s — needs SSR
    first paint fix (currently fetches client-side then renders hero).

Raw JSON reports under `tests/reports/lh/` are gitignored
(too large — ~3 MB each).

### Mobile go-live audit

- `docs/MOBILE_GO_LIVE_AUDIT_2026-05-16.zh-CN.md` — distance to GA
  ~12 working days, gated mainly by:
  1. iOS App Store + Google Play metadata + IAP (RevenueCat) wiring
  2. Sentry / Crashlytics on RN side
  3. 4 backend endpoints not yet shipped (`POST /v1/axp/redeem*`,
     `POST /v1/payment/checkout/session`, `POST /v1/pet-generation/scan`,
     RevenueCat webhook)
  4. In-app privacy/terms/delete-account links
- App version is `1.1.0`, package `app.agentrix.claw`, no production
  store metadata yet. EAS `production` profile exists in `eas.json`
  but has not been used to ship a store build.

## Deferred (not blocking)

- **i18n full migration** — pulled out of W-2 scope into post-GA
  follow-up. Mobile audit P1-3 covers it.
- **Lighthouse fix wave** — performance scores measured but not yet
  acted on. /market/leaderboard SSR fix is the highest-ROI single
  change identified.
- **Sentry DSN provisioning** — code path is in place; ops needs to
  create a Sentry org/project and inject env vars.

## Gotchas

- `lighthouse@13` requires Node ≥ 22.19; this machine has Node 20.11
  so the script pins `lighthouse@12` via `npx --yes -p lighthouse@12`.
- The `run-lighthouse-batch.ps1` outputs ASCII status markers (`[OK]` /
  `[~]` / `[!!]`) instead of emoji to avoid PowerShell encoding
  mojibake when the script file is interpreted as code-page-936.
- LH JSON report files are 2-3 MB each and bloat the repo if committed.
  Stage only the `LIGHTHOUSE_*.md` summary, not `tests/reports/lh/*`.
- `withSentryConfig` from `@sentry/nextjs` is only wired when DSN is
  set; without DSN the wrapper is bypassed, which keeps build times
  identical for unconfigured environments.
- Production frontend `npm install` after pulling W-2/W-3 commit
  installed 137 new packages (Sentry + transitive). Build time on
  prod was unaffected (~28 s previously, ~30 s after).

## Production verification (post-deploy)

`/` → 200, `/privacy` → 200 after `pm2 restart agentrix-frontend`.
PM2 process `agentrix-frontend` came back online cleanly.
