# Desktop pet rebuild W1 — shipped (v0.6.4, 2026-05-26)

> Closes the v0.5.7 → v0.6.4 saga. Hotfixes #6-#12 (v0.5.1-v0.5.7) all
> failed because they followed the sprint-memory "200×240 small window"
> design which **never actually worked end-to-end** on Windows. The
> first version that genuinely worked on real-device install was the
> earlier `9d5824d02 fullscreen transparent overlay`.

## What v0.5.7 looked like

- Pet stuck in top-left corner, never moved
- GPU snow / checkerboard around sprite
- Click / drag / right-click all dead
- ChatTitleBar PetAvatar at top of main window worked fine (red herring)

## Why 6 attempts failed before v0.6.4

| Attempt | Approach | Why it failed |
|---|---|---|
| v0.5.8 | 200×240 transparent + DwmExtendFrame | WebView2 small-transparent renders checkerboard fallback |
| v0.5.9 | + DwmEnableBlurBehindWindow + spawn-thread removed | Same — small surface still triggers tauri#4881 |
| v0.6.0 | Static-config 200×240 transparent | Tauri 2 + WebView2 small-transparent unreliable across versions |
| v0.6.1 | LAYERED + LWA_COLORKEY (#FF00FF magenta) | LAYERED + WebView2 child HWND don't compose — magenta stayed visible |
| v0.6.2 | Opaque dark 200×240 (Plan B from 25148c3c5) | Worked but user wants real transparency |
| v0.6.3 | + sprite v11 flood-fill | Fixed gray-pixel "checkerboard"; still 200×240 opaque |
| v0.6.4 | **Fullscreen transparent overlay (1920×1080)** | ✅ ships |

## The architecture that actually works

Restored from commit `9d5824d02`:

```
┌─────────────────────────────────────────────────────────────┐
│  pet-companion webview = full primary monitor (1920×1080)   │
│  - transparent: true                                        │
│  - decorations: false                                       │
│  - alwaysOnTop: true                                        │
│  - skipTaskbar: true                                        │
│  - default: set_ignore_cursor_events(true) → click-through  │
│                                                             │
│  Sprite element positioned via CSS at positionRef.x/y       │
│  (screen-space logical px). Wander engine updates           │
│  positionRef → triggers re-render → CSS left/top updates.   │
│                                                             │
│  Right-click menu uses position: fixed inside the overlay.  │
│  vh = full screen height, so menu always fits.              │
│                                                             │
│  When cursor enters sprite hitbox:                          │
│    JS calls desktop_pet_window_set_passthrough(false)       │
│    → window captures clicks                                 │
│  When cursor leaves:                                        │
│    JS calls desktop_pet_window_set_passthrough(true)        │
│    → clicks pass through to desktop                         │
└─────────────────────────────────────────────────────────────┘
```

## Why fullscreen instead of small (200×240)?

WebView2 + Tauri 2 + transparent on Windows fails on small surfaces:
- DComp swap-chain redirection bitmap renders as checkerboard pattern
- LAYERED + LWA_COLORKEY don't take effect on the WebView2 child HWND
- DwmExtendFrame + DwmEnableBlurBehind doesn't help with tauri#4881
- Fullscreen surface stays GPU-stable because the swap chain is large
  enough to bypass the buggy small-rect path

## Sprite v11 flood-fill (separate fix in same wave)

Symptom: gray "checkerboard" around the sprite in opaque mode.
Root cause: doubao returns RGB-only PNGs; v9-truealpha used a
`min(R,G,B) >= 240` per-pixel threshold. Top regions of source PNGs
contain ~227 gray pixels that fail the threshold and stay opaque,
visible as gray blobs around the sprite.
Fix: switch to corner-seed flood fill with strict `>= 248` (already
authored as `reprocess-v11-floodfill.mjs`, just hadn't been re-run).

```
node .tmp_apk/sprite-tools/reprocess-v11-floodfill.mjs
```

Outputs to:
- `desktop/public/pets/sprites/default/*.png` (13 sprites)
- `assets/pets/sprites/default/*.png` (mobile mirror)

## Files of record (v0.6.4)

| File | Change |
|---|---|
| `desktop/src-tauri/src/pet_window.rs` | Rewritten for fullscreen overlay; `move_to` / `resize_for_popup` / `restore_size` become no-ops; `set_passthrough` is real toggle |
| `desktop/src-tauri/src/lib.rs` | Registers 5 new commands (`resize_for_popup`, `restore_size`, `relay_event`, `broadcast_mode`, `set_passthrough` already existed) |
| `desktop/src-tauri/src/main.rs` | 5 GPU args (was 2) — keeps the keep-alive trio for sprite snow defense |
| `desktop/src-tauri/tauri.conf.json` | `pet-companion` static-declared with `transparent:true` + `1920×1080` |
| `desktop/src-tauri/permissions/desktop-commands.toml` | ACL allow-list for the 5 commands |
| `desktop/src/components/PetCompanionWindow.tsx` | Hitbox uses `positionRef.current` directly; inHitbox checks `positionRef + PET_W_NUM/H_NUM`; `petCenterX = positionRef.x + PET_W_NUM/2` |
| `desktop/src/styles/global.css` | `html[data-pet-window="1"] { background: transparent }` (kept) |
| `desktop/public/pets/sprites/default/*.png` | 13 sprites reprocessed via v11 flood-fill |
| `assets/pets/sprites/default/*.png` | mobile mirror, same v11 output |

## Verification

- TS typecheck: 0 errors
- Cargo check / build release: clean (3 unrelated warnings)
- Real-device install (Windows 11 + WebView2):
  - Pet truly transparent — desktop visible all around sprite
  - Drag, click, double-click work natively
  - Right-click menu pops in correct position with all 16 items
  - Light theme + dark theme both clean
- Minor known cosmetic: `idle.png` and `sit.png` show very light snow
  flicker in some frames (acceptable per user)

## What's NOT done in W1 (parked for W2-W7)

- Wander engine drift verification (pet should glide between spots)
- Lean-in (pet glides toward cursor when listening / speaking)
- cu-mouse cursor shadow (computer-use form follows cursor)
- 13-form sprite switching verification (each PetMode → its sprite)
- voice flag end-to-end (right-click "🎙️ 语音对话" → mic actually starts)
- approval inbox (right-click "✅ 待审批操作" → notification center opens)
- drag-to-taskbar dock (drag pet near bottom edge → 48×48 corner thumbnail)
- Real-device .exe artifacts at `desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.6.4_x64-setup.exe`

## Branch + commit

- Branch: `perf/desktop-pre-launch-p1`
- HEAD: `45d5e0bbd` (after v0.6.4)
- Push: auto-approved per AGENTS.md velocity-window policy

## Don't repeat my mistakes (for the next agent)

1. **NEVER attempt a 200×240 transparent WebView2 window on Windows**.
   It does not work. Period. Use fullscreen overlay or opaque.
2. The sprint-memory "Sprint P-1.2 architecture pivot to small window"
   describes a design that was **never successfully verified on
   Windows real device**. The earlier `9d5824d02` fullscreen overlay
   was the last commit that genuinely worked on real install.
3. Before `apply_windows_transparency` patches (LAYERED, blur-behind,
   DwmExtendFrame), try the simpler "fullscreen + transparent + click
   through" pattern. It's what every working Windows pet app uses
   (WindowPet, etc.).
4. v9-truealpha threshold 240 is too strict — gray pixels at ~227 stay
   opaque and look like checkerboard. Always use v11 flood-fill or
   verify alpha distribution after running an ETL.
