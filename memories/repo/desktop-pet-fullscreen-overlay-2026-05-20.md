# Desktop pet — fullscreen transparent overlay (2026-05-20)

After 9 iterations of trying to make a small (160×160) transparent
WebView2 window work on Windows, we finally landed on the architecture
the rest of the desktop-pet ecosystem (e.g. WindowPet) uses:

## What changed

* **Rust side (already in earlier commits)**:
  `pet_window.rs` opens the `pet-companion` window covering the entire
  primary monitor with `transparent(true)` + `set_ignore_cursor_events(true)`.
  A new command `desktop_pet_window_set_passthrough(enabled)` toggles
  cursor capture so clicks fall through everywhere except inside the
  pet's hit-box. `move_pet_to` is now a no-op kept for legacy callers.
  GPU env var `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--ignore-gpu-blocklist
  --enable-gpu-rasterization` is set in `main.rs` so WebView2 has stable
  hardware compositing for the fullscreen transparent surface.

* **JS side (commit `b56627f2` 2026-05-20)**:
  `PetCompanionWindow.tsx` was rewritten to **never** drive the native
  window — the pet sprite is positioned via CSS `left/top` inside the
  overlay, the wander RAF loop bumps a `renderTick` state at ~30 Hz to
  re-render the new position, and an inner `data-pet-hitbox="1"` div
  re-enables `pointer-events: auto` around the visible sprite. Mouse
  enter/leave invokes `desktop_pet_window_set_passthrough` so clicks pass
  through transparently except inside the hit-box. While the right-click
  menu is open, passthrough is forced off so users can interact with menu
  items even when the cursor leaves the pet's bounding box.

* **Sprite rendering**:
  `PetSpriteCanvas.tsx` removed its old Mac-canvas + white-to-alpha path
  entirely. The v9 sprite sheets are RGBA PNGs (colorType=6, ~33–61 % of
  pixels alpha=0 from `.tmp_apk/sprite-tools/reprocess-v9-truealpha.mjs`)
  so the browser composites the alpha channel correctly through the
  transparent overlay. Direct CSS `background-image` rendering is used
  on every platform.

## Why this works when the small-transparent-window approach didn't

WebView2 on Windows has a documented bug (tauri#4881, #4891) where
small transparent windows render snowflake / checkerboard artifacts
because the GPU compositor surface is unstable. A fullscreen surface
keeps the GPU happy, transparent regions composite cleanly, and the
OS routes clicks through anything outside the hit-box.

## Files of interest

- `desktop/src-tauri/src/pet_window.rs` — Rust side (fullscreen spawn,
  passthrough toggle command).
- `desktop/src-tauri/src/main.rs` — `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`.
- `desktop/src/components/PetCompanionWindow.tsx` — overlay+hitbox JS.
- `desktop/src/components/PetSpriteCanvas.tsx` — direct RGBA rendering.
- `desktop/src/styles/global.css` — `html[data-pet-window="1"]` rules
  (transparent + `pointer-events: none` outer / `auto` on hit-box).
- `desktop/public/pets/sprites/default/*.png` — v9 RGBA sprite sheets.
- `assets/pets/sprites/default/*.png` — mobile mirror of the same sprites.

## How to verify next time

1. Rebuild the desktop app with `npm run tauri build` from `desktop/`.
2. Launch — the pet window must NOT show snow / checkerboard, and the
   pet should wander across the whole primary monitor (CSS-positioned).
3. Click anywhere outside the pet → click should reach the desktop /
   underlying app, not the overlay (verifies passthrough toggle).
4. Right-click pet → menu opens at cursor; click any menu item → menu
   closes (verifies forced passthrough-off while menu is up).
