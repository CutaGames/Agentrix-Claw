# Sprint W-4 content fixes shipped (2026-05-16)

> Continuation of `sprint-w-4-content-audit-go-live-2026-05-16.md`. The
> initial sprint shipped only the 2 P0 fixes (V3->V4 messaging,
> multi-platform download hub). This sprint completes the 5 P1 items
> that were queued for W-4. Production commits `94b1df3c` (content)
> and `22795b69` (quote fix) deployed to `47.130.176.148`.

## What landed

5 substantive new pages + 2 expanded pages + nav/footer rewire.

### NEW: /partners (4 partnership tracks)
- Brand IP / KOL / Tech Integration / Education-NGO
- Each track: pitch + 4 benefits + 3 we-deliver + dedicated email
- Trust strip + custom-partnership escape hatch (hi@agentrix.top)

### NEW: /investors
- 4-pillar thesis (Mobile-first / Pet-as-Agent / Open protocols / Privacy fence)
- KPI snapshot (4 cards) + 4-quarter timeline + use-of-funds
- investors@agentrix.top + pitch deck link

### NEW: /contact (8-channel hub)
- support / bd / growth / investors / privacy / legal / edu / press
- Each with topic-specific email + per-channel SLA
- Community panel: Telegram / Discord / X / GitHub

### NEW: /blog (3 inaugural posts)
- /blog/agentrix-v4-launch — release announcement
- /blog/pet-as-agent-thesis — design philosophy
- /blog/beta-100-progress — 30-day learnings (with real numbers)
- Markdown source: `frontend/lib/blog-content/*.md`
- Registry: `frontend/lib/blog-posts.ts` (typed, easy to extend)
- Renderer: `frontend/pages/blog/[slug].tsx` (marked + ISR 1h)

### NEW: /market/become-creator
- 5-step journey (PetCreator -> name/desc -> 5-step list -> promote -> wallet)
- Revenue split visual: 70% creator / 10% Cinderella Boost / 5-15% platform / Remix
- 4 DO/DON'T tips from top sellers
- 4 creator-specific FAQs

### EXPANDED: /use-cases (3 -> 6 detailed scenarios)
- Lin Xia (designer) / Zhang Ming (engineer) / Li Ming (freelancer)
  / Zhang Momo (creator) / Wang (student) / Chen family
- Each: pitch + day-in-life timeline w/ surface icons + capabilities + CTA

### EXPANDED: /security (6 pillars -> 9 sections)
- §1 6 pillars (preserved)
- §2 ASCII MPC 3-share architecture diagram (Mobile/Server/Recovery)
- §3 ERC-8004 identity model (user wallet vs agent wallet split)
- §4 X402 micropay HTTP 402 protocol walkthrough (6-step flow)
- §5 L0-L4 permission tiers table
- §6 4-zone privacy fence (Financial/Health/Relationships/Location)
- §7 audit log + transparency
- §8 compliance roadmap (GDPR ✅ / SOC 2 / ISO 27001 / HIPAA / pen test)
- §9 security disclosure -> security@agentrix.top

### Pricing FAQ (8 -> 12 items)
- Added: cancel anytime / discounts / AXP earn-spend / refund policy

### NAV REWIRE
- MarketingHeader: New "Community" dropdown (Blog / Partners /
  Investors / Contact / Help). Market dropdown removed `disabled`
  flags from auction & leaderboard, added "Become a Creator".
  Mobile menu mirrors community group.
- MarketingFooter: 4 columns rewired with all new pages exposed.

## Build issues encountered (and fixed)

### Issue 1: Unbalanced quotes (Chinese strings with embedded ")
Two strings had `'... 文本 "embedded" 文本',` which broke parser:
- `pages/use-cases.tsx` line 61 (Lin Xia Watch action)
- `pages/market/become-creator.tsx` TIPS[0].no

Both were Chinese text with `"` embedded (commonly happens when
typing Chinese punctuation). Fixed by replacing with full-width 「」
or removing the `"`.

**Lesson**: when authoring large i18n string blocks in Chinese, run
`getDiagnostics` on each new file before committing, not just
`tsc --noEmit`. The build server's swc parser is stricter than the
TS server in Cursor's editor.

### Issue 2: Stale `.next` cache
Even after `rm -rf .next/cache`, the build kept failing on
`unlink .next/server/pages/a2a.js` and `rmdir .next/export`.
Root cause: PM2 was holding open file handles in `.next/standalone/`
when the build tried to remove the previous build artifacts.

Fix workflow:
```
pm2 stop agentrix-frontend
cd /home/ubuntu/Agentrix/frontend
rm -rf .next
npm run build
pm2 restart agentrix-frontend
```

## Production verification

```
13/13 W-4 pages 200 OK:
  /              200
  /partners      200
  /investors     200
  /contact       200
  /blog          200
  /blog/agentrix-v4-launch       200
  /blog/pet-as-agent-thesis      200
  /blog/beta-100-progress        200
  /use-cases     200
  /security      200
  /market/become-creator  200
  /pricing       200
  /help/mobile   200

35/35 V4 prod smoke ✅ unchanged
```

## What's next (Sprint W-5)

- Lighthouse fix `/market/leaderboard` SSR first paint
- i18n full migration (ja / ko / vi)
- Real visual hero video (60s product demo)
- Sentry DSN provisioning
- Apple Developer / Play Console / RevenueCat dashboard setup

## Gotchas (general)

- Authoring i18n string blocks: prefer template strings or escape
  embedded quotes carefully. Chinese punctuation shifts the
  invisible quote-context for the parser.
- After landing a new ISR page (e.g. /blog/[slug]), the first prod
  request is slow (~20-30s) while Next generates the static HTML.
  Subsequent requests serve from cache for `revalidate` seconds.
- Production rebuild after major changes: `pm2 stop` -> `rm -rf .next`
  -> `npm run build` -> `pm2 restart`. Just `rm -rf .next/cache`
  is not enough when PM2 has the previous build's files open.
