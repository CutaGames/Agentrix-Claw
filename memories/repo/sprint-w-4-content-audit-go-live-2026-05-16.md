# Sprint W-4 + Go-Live audit (2026-05-16)

> Continuation of `sprint-mobile-p2-p3-manual-invitation-2026-05-16.md`.
> Production commits: `4a01e340` + `1d8fb37a`. Web frontend rebuilt
> twice (first build failed because of UTF-8 corruption in invite.tsx;
> second build OK after cache clean + invite.tsx revert).

## What landed

### Web content audit

`docs/WEB_CONTENT_AUDIT_2026-05-16.zh-CN.md` — 10-issue prioritized
audit of the marketing site. Of these, two P0 fixes shipped this
sprint; the rest queue for W-5.

### P0 fix: V3 -> V4 messaging consistency

`frontend/components/marketing/sections/V3FeaturesSection.tsx` rebuilt:
- Renamed array to `V4_FEATURES`, badge to "v4.0", id to `v4-features`
- 8 cards: 4 carry-over + 4 V4 New (Soul × Skin / PetCreator 4 modes /
  Skin Marketplace with Cinderella Boost / Toy + NFC). Each new card
  carries a "V4 New" pill in the corner.

### P0 fix: Multi-platform download hub

`frontend/pages/download.tsx` rewritten as a 5-card hub:
- Windows (live, 7 MB) | Android APK (v1.1.0, 124 MB) |
  iOS (App Store review pending) | Watch APK (52 MB) |
  macOS (planned 2026-Q3)
- Auto-detects User-Agent, pre-highlights "Your device" card with
  ring + "Your device" pill
- Backend tracker accepts per-platform `platform` field
- Two install guides: Windows SmartScreen 4-step + Android sideload 3-step
- System Requirements split: Desktop / Mobile / Network / Watch & Toy

`frontend/pages/downloads.tsx` (legacy multi-platform 5-surface page)
deleted; `next.config.js` redirects `/downloads -> /download` (308
permanent).

All in-repo references to `/downloads` updated:
- MarketingHeader nav (`/downloads -> /download`)
- HeroLiving CTA
- DownloadCallout section
- `tools/[slug].tsx` and `invite.tsx`

### Desktop build + upload

- `npm run tauri build` from local Windows machine produced
  `desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.2.0
  _x64-setup.exe` at 7.03 MB (15-20 min build).
- SCP'd to prod `/home/ubuntu/Agentrix/frontend/public/downloads/Agentrix-Setup.exe`,
  replacing the 52 KB placeholder.
- Public URL `https://agentrix.top/downloads/Agentrix-Setup.exe`
  returns 200 with content (curl truncated at 30s --max-time but
  delivers the bytes).

### Final go-live audit

`tests/reports/GO_LIVE_AUDIT_2026-05-16.md` — 7-section synthesis:
- Web: 35/35 prod smoke + 30+ Playwright + 141/141 jest
- Desktop: 71/71 vitest + 7.03 MB setup.exe uploaded
- Mobile: backend endpoints all green, asset linking deployed,
  124 MB APK on prod, mobile typecheck 0 errors
- Decision: Web + Desktop ready for immediate GA. Android APK
  ready for early-seed sideload. iOS waits for Apple account.

## Production verification

```
[35/35 PASS]
home / pricing / download / market / market/leaderboard / market/sell /
market/auction/dummy-id / market/creator/dummy-user / help / help/desktop /
help/desktop/faq / help/mobile / privacy / terms / clan (308) / clans /
blog / 500 (500) / 404 (404) / showcase (307) / about / assetlinks /
apple-app-site-association / pets-browse / pets-leaderboard /
pets-detail / axp-redeem-cat (401) / checkout-session (401) /
checkout-pi (401) / axp-balance (401) / iap-webhook (401) /
mobile-analytics (202) / desktop-analytics (202) / desktop-crashes (202) /
desktop-update (204) / pets-bids
```

```
[Downloads]
Setup.exe 7.1 MB  ✅ uploaded
ClawLink-latest.apk 124 MB  ✅ already there since 2026-05-15
agentrix-watch.apk 52 MB  ✅ already there
```

## Issues / gotchas (this sprint)

- **PowerShell `Set-Content` corrupted UTF-8 in invite.tsx**. The
  `(Get-Content -Raw) -replace ...| Set-Content` pattern re-encodes
  the file under code-page-936 (Chinese Windows default), breaking
  the original UTF-8 Chinese characters. **Fix**: revert with
  `git checkout -- file` then use `str_replace` tool which preserves
  UTF-8.
- **Next.js build cached stale 500.html artifacts** from the
  pre-W-3 build. After we shipped `pages/500.tsx`, the first prod
  rebuild tried to rename `.next/export/500.html ->
  .next/server/pages/500.html` and ENOENT'd. **Fix**:
  `rm -rf .next/export .next/cache` before `npm run build`.
- **scp upload of Agentrix Desktop with space in filename**: must
  quote both source and destination; quoted `"Agentrix Desktop_0.2.0_x64-setup.exe"`
  works fine, but the destination on prod uses no-space `Agentrix-Setup.exe`
  to keep URLs clean.

## What's next (Sprint W-5, 5 days)

- /partners /investors /blog substantive content
- /use-cases /security content depth
- Lighthouse fix for /market/leaderboard (SSR first paint)
- i18n full migration (ja / ko / vi)
- iOS App Store flow once Apple Developer account opens
