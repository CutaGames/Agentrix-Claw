# Sprint P-8 P2 — Marketplace + Battle picker + Dungeon auto-trigger + DB migration (2026-05-22)

**Date**: 2026-05-22
**Branch**: `build/mobile-pet-forms-p6-2026-05-22`
**Origin commit**: `13307b0e`
**Public mirror commit**: `cb73930d` on `CutaGames/Agentrix-Claw`

## The biggest finding this round

User said "TC secret 应该已经配置过了, 我们之前都做了好几次视频和 3D 模型了, 请确认下". I SSH'd to `47.130.176.148` to verify and discovered:

1. **TC_SecretId / TC_SecretKey / OpenAI / Gemini / Bedrock are ALL configured** — user was right, my "P0 secrets blocker" lifted from the audit doc was outdated.
2. The 3D models and videos user has previously generated came from the **`pet-generation` module** (a separate pipeline that also uses Hunyuan3D). That works fine.
3. **But the World Engine pipeline has its own DB schema, and the migration `1793000000000-CreateWorldEngineTables` had NEVER been run on production**. So `world_assets`, `scan_sessions`, `battles`, `dungeons`, `world_asset_moderation_decisions` tables didn't exist. Even if mobile had been calling the API correctly (which it wasn't until P-8), backend would have 500'd on the DB write.

Ran the missing migration via `npx typeorm migration:run -d dist/config/data-source.js` (the
`npm run migration:run` wrapper failed with a ts-node decorator error,
the JS-data-source bypass works). All 6 World Engine tables now exist
on prod. PM2 restart confirmed healthy.

The "previous audit thought secrets were the blocker" was misdirection
— the actual blocker was **migrations not run on production**.
Combined with the mobile client being stub, that's why no World Engine
artifacts ever materialized for users.

## P2 features shipped

### `WorldAssetListingScreen.tsx` (NEW)

Marketplace listing flow:
- Auto-fetches `getSuggestedPrice(assetId)` and pre-fills the AI-suggested price.
- USD / AXP currency picker (chip toggle).
- Numeric price input with platform-fee transparency note.
- Validates: numeric > 0, USD ≥ $0.50, AXP ≥ 1.
- On submit: `createMarketplaceListing({assetId, price, currency})` → success Alert → goBack.
- Honest fee disclosure ("平台抽成 30%").
- testID `world-asset-listing` + `world-asset-listing-submit`.

### `WorldBattlePickerScreen.tsx` (NEW)

Battle setup flow:
- Loads owned characters via `listWorldAssets({category: 'character'})`.
- Two slot cards (challenger / defender); active slot indicated with border.
- 3-column grid of asset tiles with image / name / level.
- Tap on tile fills the active slot, auto-rotates to the other slot.
- Validates non-equal asset IDs.
- "开始战斗" navigates to `WorldBattleArena` with both IDs as params, which
  triggers the real `createBattle` backend call (vs the deterministic mock
  used when the arena is opened without IDs).
- testID `world-battle-picker` + `world-battle-picker-start`.

### `ReconstructionProgressScreen` — dungeon auto-trigger

When `route.params.scanMode === 'room'` and the asset reconstruction
completes successfully, the screen now auto-calls `generateDungeon({
scanSessionId })` in the background, then surfaces the dungeon code +
"进入副本" deep-link button below the primary "打开资产库" CTA.

This closes the loop the user complained about ("没有任何反馈") —
after a room scan, they get BOTH a 3D asset AND a playable dungeon,
visible right on the success screen.

### `WorldAssetInventoryScreen` — wiring

- `handleListForSale` → `navigation.navigate('WorldAssetListing', {assetId, assetName})`
- New ⚔ FAB next to the + scan FAB on header → `WorldBattlePicker`
- `handleGift` updated: explicit "后端尚未开放" copy with workaround suggestion (use marketplace as proxy)

### `worldEngineApi.ts` — +4 marketplace endpoints

```ts
createMarketplaceListing({assetId, price, currency: 'USD'|'AXP'})
getSuggestedPrice(assetId): Promise<{suggestedPrice, currency, reasoning, comparable?}>
browseMarketplaceListings({category?, minPrice?, maxPrice?, sort?, page?})
purchaseMarketplaceListing(listingId, {paymentId?})
```

All wired through the standard `apiFetch` helper. Path prefix is
`/v1/marketplace/world-assets` (the `world-assets` is intentional —
backend module mounted at that route).

### Tests

Jest contract suite extended with 4 marketplace tests (path/method/body
shape). Total: **39 / 39 mobile tests pass** across 3 suites.

## Production deployment summary

```
ssh -i hq.pem ubuntu@47.130.176.148
cd /home/ubuntu/Agentrix/backend
npx typeorm migration:run -d dist/config/data-source.js
# → CreateWorldEngineTables1793000000000 has been executed successfully.
pm2 restart agentrix-backend
# → online, 362 MB, healthy

curl http://localhost:3000/api/health                    # → 200
curl http://localhost:3000/api/v1/world-engine/assets    # → 401 (auth required) ✓
```

Tables now present:
- `world_assets`
- `scan_sessions`
- `battles`
- `dungeons`
- `world_asset_moderation_decisions`

(`reconstruction_jobs` is intentionally NOT a table — jobs live in
BullMQ + in-memory `Map` in `ReconstructionService`.)

## Files changed

| File | Change |
|---|---|
| `src/services/worldEngineApi.ts` | +4 marketplace endpoints |
| `src/services/__tests__/worldEngineApi.test.ts` | +4 marketplace contract tests (39 total) |
| `src/screens/WorldAssetListingScreen.tsx` | NEW |
| `src/screens/WorldBattlePickerScreen.tsx` | NEW |
| `src/screens/WorldAssetInventoryScreen.tsx` | handleListForSale → route; battle FAB; honest gift copy |
| `src/screens/WorldEngineScannerScreen.tsx` | passes scanSessionId to ReconstructionProgress |
| `src/screens/ReconstructionProgressScreen.tsx` | auto-generates dungeon on room-scan completion |
| `src/navigation/HomeStackNavigator.tsx` | +WorldAssetListing, +WorldBattlePicker routes |
| `src/navigation/PetStackNavigator.tsx` | same |

## Validation

- `getDiagnostics` clean on all 9 files
- `npx jest` — 39 / 39 passed
- `getDiagnostics` clean on all touched files
- Pushed `13307b0e` to origin
- Mirrored `cb73930d` to `CutaGames/Agentrix-Claw` via local
  cherry-pick + direct push (the manual-mobile-mirror.ps1 full-clone
  approach hung on this run; cherry-pick was faster and cleaner)
- APK CI now triggered on the public mirror for the new commit

## What remains (truly P3+)

- **Gift backend endpoint** — needs `/v1/world-engine/assets/:id/transfer-to/:userId` design + impl. Marketplace listing serves as workaround.
- **BFG history cleanup** of `deliverables/pet_3d_regen_v4.json` Tencent secret — would unblock the auto sync workflow but blast radius is large; defer to maintenance window.
- **Marketplace browse / purchase UI** — the API is wired in `worldEngineApi.ts` but no consumer screen yet. Inventory shows owned only; a separate "市场" tab would surface listings from others.

## Lessons for the audit doc

The "go-live audit" doc had been right that secrets were once a
blocker but missed that **migrations weren't run** on prod. Both are
infrastructure prerequisites, but they're orthogonal — checking only
secrets gave a false green.

For future audits: explicitly verify on prod, with one query per
required artifact:
1. Migration executed (`SELECT * FROM migrations WHERE name = '...'`)
2. Schema tables exist (`\dt <table>`)
3. Required secrets present (mask values, just `<set>`)
4. PM2 restart was *after* the migration (timestamps)
5. End-to-end sample call from mobile actually reaches the DB
   (not just the controller).

Without #5 you can't tell if the wiring is real.
