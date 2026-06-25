# Market real pet thumbnails shipped — 2026-05-16

## What changed

Replaced the "abstract pet silhouette" placeholders on `/market` and
`/market/skin/[id]` with the real 3D-rendered PNG thumbnails that were
already produced under `deliverables/pets_v2/` and `deliverables/pets/`.

## What we discovered

We have 12 finished 3D pet models (.glb, 22-29 MB each) in
`deliverables/pets_v2/` and `deliverables/pets/` plus matching 512x512
rendered PNG thumbnails. None of them had been deployed or referenced
by the production database — so the marketplace was rendering the
abstract SVG silhouette I had generated in earlier sprints.

The 6 high-res `灵狐1-6.png` (2048x2048) renders in `deliverables/图片/`
are the original concept art and would also work well for hero shots.

## Where the images live now (production)

`/home/ubuntu/Agentrix/frontend/public/downloads/pets/`:
- `kitsune-A-white-purple.png` — clan A office / business
- `kitsune-B-crystal-tech.png` — clan E web3 / tech aesthetic
- `kitsune-C-round-qversion.png` — Q-version round/cute
- `kitsune-C-v2-refined.png` — refined/intellectual
- `marketplace-mecha-rabbit.png` — cyber mecha
- `marketplace-nebula-cat.png` — cosmic gentle
- `marketplace-prism-dragon.png` — energetic playful
- `marketplace-sakura-bunny-v2.png` — soft warm
- `agentrix_pet_economy.png` — bear-ish brown
- `kitsune-hero-1.png` / `kitsune-hero-3.png` / `kitsune-hero-5.png` —
  4 MB high-res concept art, currently unused but available for
  detail-page hero or OG image upgrades.

URL pattern: `https://agentrix.top/downloads/pets/<filename>.png`.
nginx serves them with `Content-Type: application/octet-stream`
(browsers still render correctly inside `<img>`).

## DB mapping

29 platform skins, 9 distinct images, varied per clan to avoid
visual repetition. See `.tmp_apk/update-skin-thumbs.sql` for the
canonical mapping. Each `display_name` matches uniquely so the
update is idempotent — re-running the script is safe.

Themed Chinese-named skins map to their best-matching render
(e.g. 灵狐 Q版 → kitsune-C-round-qversion.png).

## Verification

- `curl https://agentrix.top/downloads/pets/<file>.png` → HTTP 200,
  90-150 KB each, real PNG content.
- `/api/v1/market/skins?sort=popular&limit=24` → 9 unique
  `thumbnailUrl` values across 24 items.
- `/api/v1/market/skins?sort=featured&limit=8` → 7 unique URLs.
- No DB rows still reference the old `clan_*_default.svg` /
  legacy `marketplace-*.png` placeholders.
- Frontend HTML now embeds `pets/<real>.png` URLs directly.

## Next step (medium term, deferred)

Upload the 12 `.glb` 3D models to the CDN and add a `<model-viewer>`
element to `/market/skin/[id]` so the existing
"3D / VRM live preview (coming soon)" placeholder finally works.
12 × ~25 MB = ~300 MB upload; could go to the existing `/assets/pets/`
location which already serves a few sample `.glb` files.

Recommended sprint task: "Wire model-viewer 3D preview into skin
detail page" — turns the placeholder banner into the actual selling
point of the marketplace.

## Commit list for this session

- `15cca25f` — fix /market cards empty + skin detail crash + console
  presence d.map error
- `43734877` — SkinCard graceful image fallback + unoptimized loader
- `f22981d9` — wire AXP purchase modal directly into skin detail
- (this work) — DB-only update, no code commit needed; SQL kept under
  `.tmp_apk/update-skin-thumbs.sql` for re-application if seed reruns.
