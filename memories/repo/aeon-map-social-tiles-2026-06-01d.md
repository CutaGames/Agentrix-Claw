# Aeon map social + de-watermarked ground tiles (2026-06-01 session E)

Commit `b81df914e`. Backend DEPLOYED + migration run + verified. APK build branch
`build/aeon-social-2026-06-01`.

## Ground tiles (de-watermark + single-tile)
- User delivered 6 single tiles `deliverables/图片/agentrix-world/单块地转1-6.png` (2048²).
- Script `.tmp_apk/sprite-tools/process-aeon-tiles.mjs` (pngjs): erases bottom-right
  watermark zone (x>62%, y>92% → alpha 0), crop content bbox, resize to 512² → wrote
  `assets/aeon/tiles/{floor-base,glow,road,grass,water,edge}.png`.
- Registered in `aeonAssets.ts`: `AEON_TILES` map + `tileImage(kind)`. Ready for a tilemap
  renderer (not yet replacing the AeonScene ImageBackground — that's the next art-integration step).
- Watermark erase verified (br region ~transparent). Mapping order: 1 base, 2 glow-edge,
  3 road, 4 grass, 5 water, 6 edge/float.

## Map social (backend deployed + verified)
- `PlotService.listMarkers` now populates `ownerName` via RAW query
  `SELECT id,nickname,paymind_id FROM users WHERE id=ANY($1)` (no User entity import →
  no circular dep). Verified: markers return ownerName "Jacky".
- NEW plot guestbook: entity `aeon_plot_messages` (snake_case cols) + migration
  `1800300000000-AeonPlotMessages` (RUN on prod via dist data-source workaround) +
  `PlotMessageService` (list/post/inbox) + plot.controller routes:
  - GET `/v1/aeon/plots/messages/inbox`  ⚠️ declared BEFORE `:id` (route-order lesson again)
  - GET `/v1/aeon/plots/:id/messages`
  - POST `/v1/aeon/plots/:id/messages` {body}
  Verified: inbox returns 200 (not swallowed by :id).
- Wired entity+service into aeon.module (TypeOrmModule.forFeature + providers).

## Map social (mobile)
- aeonApi: listPlotMessages/postPlotMessage/listMyPlotMessages + AeonPlotMessageDto.
- NEW `AeonPlotVisitScreen`: owner card (name+plot), 🏙️进入领地, 💬 guestbook (list+post),
  👋 私信地主 → cross-tab `navigate('Plaza',{screen:'DirectMessage',params:{userId,userName}})`.
  Self plots hide the DM button.
- AeonMapScreen: tapping a marker (real-map ViewAnnotation w/ owner-name label + degraded list
  w/ 👤 owner row) now routes to AeonPlotVisit (was direct enter). My own plots ("我的领地" row)
  still onEnter directly. Registered AeonPlotVisit route.

## Battle (session D, also in this APK build) — recap
- skillIndex now preserves ORIGINAL index (filtered-array bug fixed); HP bars + damage popups +
  hit-flash added. Backend verified: train+step return 201 with full rounds; skills data has
  damageBase (Strike 20/Surge 35). "skills empty" was an OLD APK.
- Dungeon room→battle: room w/ enemies/BOSS launches PvE training battle (difficulty scales).
- Aeon market street hub (AeonMarketScreen) cross-links all markets.

## Honest remaining gaps
- Tilemap renderer: tiles are in assets + registered, but AeonScene still uses the single
  ImageBackground; swapping to a tiled grid render is the next step.
- "加好友" = currently routes to DM (private message). No persistent friend graph yet.
- Dungeon room "cleared" after win is optimistic (no battle→dungeon return callback).

## ENV reminders (reconfirmed)
- prod migration: `node ./node_modules/typeorm/cli.js migration:run -d dist/config/data-source.js`
  (ts-node path crashes on stray .entity.js). Worked cleanly here.
- users table cols: nickname, paymind_id (agentrixId), avatarUrl.
- mobile mirror script is slow (full copy) → run via control_pwsh_process background, poll log.


## SESSION F — real isometric tilemap (replaces ImageBackground)
Commits `1912a519d` + `575ffd81b` (seam fix). Build branch `build/aeon-tilemap-2026-06-01`
(APK building; JS bundle passed, Gradle native compile slow on cold cache).
- New `src/components/aeon/AeonTileMap.tsx`: renders the 6 de-watermarked Doubao tiles as a
  7×7 ISO grid. Projection: left=cx0+(x-y)*tilePx/2, top=cy0+(x+y)*tilePx/4, painter's algo
  (sort by x+y depth). tilePx = (canvasW-12)/n. Center grid centered via cx0/cy0. Tiles
  rendered at 1.08× (centered) to close hairline seams from transparent margins.
  Deterministic tileKindFor(x,y,n,roomKind): edge ring, center glow, grass/road/water accents
  per room kind (market=road row, company/meeting=cross roads, public=grass ring + rare water).
- `AeonSceneScreen`: replaced `<ImageBackground source={roomImage(roomKind)}>` with
  `<AeonTileMap>`; occupant sprites projected onto grid cells via the `project(gx,gy,size)`
  callback (zIndex = gx+gy+10 for correct overlap). Canvas now fixed CANVAS_W×300.
  Removed roomImage import + TILE const. Build screen kept its top-down SQUARE grid
  (correct for precise placement; only the immersive scene view is iso).
- Honest: visual seams/scale can't be verified without a device; 1.08× overlap is the standard
  mitigation. If tiles still gap/overlap on-device, tune the 1.08 factor or the quarterH step.
