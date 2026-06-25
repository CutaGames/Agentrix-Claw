# Sprint W-1 P1 + W-2 + W-3 shipped (2026-05-16)

> Web go-live readiness sprint completion. Production commit `2b40cda1`
> deployed to `47.130.176.148`.

## Files added

- `frontend/pages/500.tsx` — branded server-error page (uses `Button`/`Card`
  from `components/ui/ax`)
- `frontend/pages/privacy.tsx` — GDPR/CCPA policy
- `frontend/pages/terms.tsx` — terms of service (SG law)
- `frontend/components/CookieConsent.tsx` — opt-in banner persisting to
  `localStorage` key `agentrix_cookie_consent`. Sets global flag
  `window.__agentrixAnalyticsAllowed = true` only when user clicks
  "全部接受". Listeners can subscribe via `window.addEventListener('agentrix-consent-change')`.
- `scripts/check/lighthouse-audit.ts` — moved from `scripts/` (gitignored)
  to `scripts/check/` (whitelisted in `.gitignore`)
- `frontend/pages/market/auction/[id].tsx` — 10s polling auction hall
- `frontend/pages/market/creator/[userId].tsx` — creator profile

## Backend

- `marketplace-pet.controller.ts`: added `@Public()` to `GET pets`,
  `GET pets/:id`, `GET pets/:id/bids`, plus `GET leaderboard`.
- `marketplace-listing.service.ts` already had `leaderboard()` from
  prior commit.

## Wiring notes

- `_app.tsx` mounts `<CookieConsent />` only when `!isAdminPage`. Banner
  defers 1s after mount so it doesn't compete with first paint.
- Default consent state is **necessary only**. Analytics services that
  want to gate on consent should check `window.__agentrixAnalyticsAllowed`
  or listen to `agentrix-consent-change` event.

## Production verification (2026-05-16)

13/13 critical paths return 200 OK after deploy:
`/`, `/help`, `/help/desktop`, `/market`, `/market/leaderboard`,
`/market/sell`, `/market/auction/<id>`, `/market/creator/<id>`,
`/blog`, `/clan`, `/privacy`, `/terms`, `/download`.

`agentrix_cookie_consent` literal verified present in deployed
`_next/static/chunks/pages/_app-796b0f1c17fae999.js`.

`/api/v1/marketplace/leaderboard?board=gmv` returns 200
`{"board":"gmv","items":[]}` (empty items expected — no marketplace
sales in production yet).

## Known gaps (not blocking go-live)

- Lighthouse audit script created but not yet run against prod
  (requires `npx lighthouse` chrome runtime; defer to QA pre-launch).
- i18n full migration deferred (current pages mix `useLocalization` +
  hardcoded zh; acceptable for default-zh policy).
- Sentry monitoring not yet integrated.

## Gotchas

- `.gitignore` line 50 excludes `scripts/*` except whitelisted subdirs.
  Always create new tracked scripts under `scripts/{check,build,deploy,
  test,setup,public-build}/` or they will silently not commit.
- Building backend on prod: `nest build` reports success but doesn't
  emit `dist/main.js` — the `scripts/build-backend.mjs` falls back to
  `tsc` automatically. Don't be alarmed by the warning.
- Next.js `pages/500.tsx` returns HTTP 500 status by design when
  rendered via the Next.js error pipeline — this is expected, not a
  deploy regression. Direct GET `/500` also returns 500 because Next
  treats it as the error page.
