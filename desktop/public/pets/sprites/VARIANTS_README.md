# Pet Sprite Variants — Resource Delivery Manifest

> Engineering done. **Awaiting art delivery from 豆包 / mascot designer.**

The `petVariant` resolver (`desktop/src/services/petVariant.ts`) supports
clan / skin / festival overrides via folder convention. Drop new PNGs at
the right path and they're picked up automatically — no code changes.

## Folder convention

```
desktop/public/pets/sprites/
├── default/                          # ✅ shipped (13 sprites, v11 flood-fill)
│   ├── walk.png idle.png sit.png ...
│   └── jump.png eat.png sleep.png
│
├── default/<festival>/                # 🟡 awaiting art (P-7+ deferred)
│   └── e.g. default/spring/listen.png
│         (overrides default/listen.png when festival="spring" is active)
│
├── <skin>/                           # 🟡 awaiting art (Wardrobe marketplace)
│   └── e.g. kitsune-academy/walk.png
│
├── <clan>/                           # 🟡 awaiting art (Clan unlock at L20)
│   └── e.g. clan-A/walk.png
│
└── <clan>/<skin>/<festival>/         # 🟡 most-specific tier
    └── e.g. clan-A/kitsune-academy/spring/walk.png
```

## Variant precedence (first match wins)

1. `<clan>/<skin>/<festival>/<action>.png`
2. `<clan>/<skin>/<action>.png`
3. `<clan>/<festival>/<action>.png`
4. `<clan>/<action>.png`
5. `<skin>/<festival>/<action>.png`
6. `<skin>/<action>.png`
7. `default/<festival>/<action>.png`
8. `default/<action>.png` (always exists)

## What art is needed (P-7+ delivery list)

### Festival decorations (5 themes × 13 actions = 65 files)

- **`spring/`** — 樱花飘 (Mar-Apr)
- **`summer/`** — 西瓜 / 荷花 (Jun-Aug)
- **`autumn/`** — 枫叶 (Sep-Nov)
- **`christmas/`** — 圣诞帽 / 雪 (Dec)
- **`lunar-new-year/`** — 红包 / 鞭炮 (Lunar Jan)

The festival sprite reuses the base pet pose with seasonal accessories
(hat, leaves, etc.) overlayed — **the body silhouette MUST match
default/ exactly** so wander engine motion stays smooth across themes.

### Clan variants (3 clans × 13 actions = 39 files)

- **`clan-A/`** — Office (商务装,蓝色调)
- **`clan-B/`** — Creator (休闲装,粉/紫色调)
- **`clan-C/`** — Maker (工装,黄/橙色调)

Different fur colors / outfits, same poses.

### Skins (Wardrobe marketplace)

Initial drop:
- `kitsune-academy/` — 学院风 (graduation cap)
- `kitsune-ninja/` — 忍者
- `kitsune-mage/` — 法师 (cape + staff)

## Sprite spec (per file)

Identical to `default/`:
- Format: RGBA PNG (Format32bppArgb), corner-seed flood-fill alpha
- Width: `frame_count × 256` (e.g. walk = 1536×256 for 6 frames)
- Frames laid out horizontally, frame 0 = left-most
- Source PNG processed via `.tmp_apk/sprite-tools/reprocess-v11-floodfill.mjs`

## Delivery checklist

For each new sprite folder:
- [ ] All 13 sprites present (or document which actions are mode-locked)
- [ ] Run `node .tmp_apk/sprite-tools/reprocess-v11-floodfill.mjs` after
      dropping source images into `deliverables/图片/<variant>/`
- [ ] Verify alpha distribution: corners A=0, body A=255, no gray fringe
- [ ] (Tray icons) Run `node .tmp_apk/sprite-tools/generate-tray-icons.mjs`
      if the variant should also customize the tray (currently only
      `default/` drives tray icons)

## Code locations

- Variant resolver: `desktop/src/services/petVariant.ts`
- Sprite renderer:  `desktop/src/components/PetSpriteCanvas.tsx`
- Variant store:    `desktop/src/services/petVariant.ts` (zustand)
- Wardrobe UI:      `desktop/src/components/WardrobeVariantPanel.tsx`
