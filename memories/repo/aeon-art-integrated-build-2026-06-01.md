# Aeon art integrated + APK build triggered (2026-06-01)

## Art processing (Doubao deliverables → game assets)
- Source: `deliverables/图片/agentrix-world/` (10 buildings + 5 rooms, 2048²/2732×1534,
  opaque Format24bppRgb) + `deliverables/图片/{灵狐,猫头鹰,鲸,毛绒熊}/` (clan sprite strips).
- Scripts (committed under `.tmp_apk/sprite-tools/`):
  - `process-aeon-art.mjs` — corner-seed flood-fill transparency (tolerance-based, handles
    晨昏渐变 bg) + bilinear resize. Buildings → 512/768² transparent; rooms → 1280×720 opaque;
    CA-1 ground → 1024² opaque (`assets/aeon/world/plot-ground.png`).
  - `process-clans-2026-06.mjs` — flood-fill (threshold 244) + resize to N×256 grid (N from
    SPRITE_SPECS). Filename normalize (Jump→jump, pro-typeing→pro-typing), skip 定妆.
    Clans: 灵狐→default(13), 猫头鹰→C(12), 鲸→E(10, eat/listen still fallback), 毛绒熊→F(12).
- GOTCHA: 毛绒熊 unicode = 6bdb **7ed2** 718a (not 7ed6 — typo cost one rerun).
- Verified: buildings corner alpha=0 + center alpha=255; sprites 1024×256 transparent.

## Code wiring
- `src/components/aeon/aeonAssets.ts` — static require map: AEON_BUILD_IMAGES (10),
  AEON_ROOM_IMAGES (5), AEON_PLOT_GROUND. `buildImage()`/`roomImage()` with undefined→fallback.
- `AeonBuildScreen`: catalog panel + grid cells render `<Image>` (emoji fallback); grid sits on
  plot-ground `ImageBackground`.
- `AeonSceneScreen`: room `ImageBackground` by kind; sprite halo readability safety-net (prior commit).
- Clan sprites: code already registered C/E/F in CLAN_SPRITE_SOURCES — files just overwritten, no
  code change. B(团子猫)/D(哥布) only have 定妆 (no strips) → still fall back to default.

## .gitignore / .easignore gotcha (again)
- Global `build/` pattern caught `assets/aeon/build/`. Added negation exceptions in BOTH
  `.gitignore` and `.easignore` (`!assets/aeon/build/` + `/**`). Without the .easignore one the
  buildings would be dropped from the APK.
- Raw 2K deliverables under `deliverables/图片/` kept UNTRACKED (would bloat repo ~60MB).
  Processed/optimized assets committed (~46MB total staged across sprites+art).

## Build + deploy
- Commits `565453c81` (art+wiring) + `c2fb14d4e` (scripts) on feat/multi-agent-v2-1-llm-router-byo.
- Backend unchanged since B5/B7 (`f46f9d44`); E2E re-run = 22 passed / 0 failed.
- APK: mirrored to CutaGames/Agentrix-Claw branch `build/aeon-world-2026-06-01` via
  `manual-mobile-mirror-shallow.ps1`. CI "Build → Test → Release APK" run 26718921034 — passed
  npm install / expo prebuild / asset verify, reached Gradle "Build public release APK".

## Known for real-device verification (user doing this)
- MapLibre NOT added (AeonMapScreen gracefully degrades to list/coordinate selection). Map shows
  list mode; scene/build/sprites/art all functional. Add MapLibre in a later EAS rebuild.
- E clan eat/listen sprites missing (fallback to default). B/D clans need full action strips
  (only 定妆 delivered).
- Aeon entry: World tab → "Aeon · 永曜城" (AeonMap route) → claim/enter plot → AeonScene (room bg
  + sprites) → 建造 (AeonBuild, plot-ground bg + building art).
