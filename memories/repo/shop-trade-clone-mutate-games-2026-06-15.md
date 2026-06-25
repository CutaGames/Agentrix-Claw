# Shop trade loop + deeper games + clone-mutate engine (2026-06-15)

## #3 Shop: real list-goods + trade (DONE, verified live)
- `POST /v1/creations/:id/offerings` (owner): list products {name,priceAxp,description} ->
  creation.offerings (verbs=['order']); publish derives -> status `listed`.
- `POST /v1/creations/:id/purchase` (buyer): server-authoritative price FROM creation.offerings
  (ignores client price) -> AXP `spend(buyer)` -> `earn(owner)` + metrics.sales. This is the REAL
  human purchase path (the old `invoke order` only charged the AGENT preset budget, never paid the
  creator). Added `creation_purchase` to AXP spend+earn allowlists.
- Frontend: creator shop product editor (name/AXP rows + 保存商品); CreationExperienceScreen.onBuy
  now calls purchaseCreation (real AXP buyer->owner), not invokeCreation.
- VERIFIED: set 2 offerings on 羽毛球馆; buyer 90060951 bought o1 -> {ok, amount:50, to owner}. self-buy rejected.

## #1 Deeper games (DONE, live server-side, no APK needed)
Authored games are embed (served from backend/games/<slug>/, copied from backend/games-authored/).
- shooter (星轨战机): 3 ship types, 5 weapon tiers (upgradable), 4 enemy types, waves/levels,
  boss every 3 levels (3 bullet patterns), power-ups, bombs, particles/shake. ~17KB.
- match3 (幻彩消消乐): row/col/color special tiles, cascade combo multipliers, level goals +
  move limits, special+special chain. ~14KB.
- Deploy a game update: edit games-authored/<slug>/index.html -> commit -> on server git reset +
  `cp games-authored/<slug>/index.html games/<slug>/index.html` (static, no restart).

## #2 Clone-mutate generator (DONE, verified) — the "many + complex, reliably playable" engine
- `CloneMutateService` (backend/.../game/clone-mutate.service.ts): corpus of verified authored games
  (shooter/match3/tetris) with keyword matchers. `generateVariant(title,prompt)` picks a base by
  keyword, samples a config {title,difficulty(easy/normal/hard from prompt words or random),seed},
  injects `<script>window.__GAME_CONFIG={...}</script>` before the template's <script>, returns the
  guaranteed-playable HTML. No LLM dice-roll for common archetypes.
- shooter & match3 read `window.__GAME_CONFIG` (title + difficulty knobs: enemy speed/spawn, target/moves).
- CreationGameService.generateForCreation: corpus match -> clone-mutate FIRST (source='llm',
  modelUsed='clone-mutate:<base>'), else LLM, else template. Templates read from
  process.cwd()/games-authored/<file> (cwd=backend on server; present after git reset).
- VERIFIED: created game prompt "地狱难度的飞机射击游戏" -> modelUsed=clone-mutate:shooter, config
  injected, difficulty=hard auto-detected.

## Corpus expansion (DONE, verified routing)
- Added 3 config-aware authored games: breakout (霓虹弹球), runner (霓虹酷跑), snake (霓虹贪吃蛇).
- CloneMutateService corpus now 6 bases: shooter/match3/tetris/breakout/runner/snake (keyword matchers).
- VERIFIED: breakout/runner/snake prompts route to correct clone-mutate base. NOTE deploy gotcha caught:
  first deploy restarted WITHOUT `npm run build` (stale dist had old corpus) — ALWAYS build before restart.

## #5 Mobile Light Mode (DONE, applies on app RELOAD)
- src/theme/colors.ts: darkColors + lightColors palettes; reads mmkv `app_theme_mode` synchronously at
  module load → builds `colors`; setThemeMode() persists + mutates in place.
- ClawSettingsScreen 设置→主题 row toggles dark/light + prompts reload (expo-updates reloadAsync →
  DevSettings.reload → manual hint).
- CAVEAT: module-scope StyleSheet.create freezes colors at import → light mode applies on RELOAD (all
  module StyleSheets re-evaluate). Covers all `colors`-token usages; hardcoded hex won't switch.
  Live switch w/o restart = large per-screen migration (useColors() hook), deferred.
- Committed + APK mirrored (89150323). No backend change.

## Deferred (offered, not yet chosen by user)
- More corpus templates (poker/tower-defense/rhythm/racing) → 8-9 archetypes, OR
- Live light-mode switch w/o restart (per-screen useColors() migration), OR
- Deepen drama/livestream creation types.

## Corpus +4 archetypes + free-codegen play-test gate + boot-crash fix (2026-06-15 pt2)

### Corpus 6 -> 10 bases (DONE, all play-tested)
Added 4 config-aware authored games (read window.__GAME_CONFIG title+difficulty):
- poker/index.html (霓虹扑克, video-poker Jacks-or-Better, DOM cards, tap-to-hold) — no canvas/rAF, DOM-only.
- towerdefense/index.html (霓虹塔防, grid path + place towers + waves + auto-fire), canvas.
- rhythm/index.html (霓虹节奏, 4-lane falling notes + judge line + combo), canvas.
- racing/index.html (霓虹飞驰, vertical endless dodge + lane swipe + coins), canvas.
CloneMutateService corpus matchers updated (扑克|塔防|节奏|赛车 + EN). cwd/games-authored on server.

### Free-codegen long-tail: play-test gate + self-repair/retire (DONE)
- NEW GamePlaytestService (backend/.../game/game-playtest.service.ts): zero new deps. Uses Node `vm`
  + a minimal DOM/Canvas stub to ACTUALLY RUN the generated inline <script> for up to 120 rAF frames:
  (1) syntax-compile via new vm.Script (catches truncation), (2) dispatch 'start' clicks + resize +
  keydown, (3) pump rAF frames, (4) capture any sync throw -> not playable. Catches the #1 LLM
  codegen failure mode (crashes on load/loop). Can't catch visual/logic bugs (no real render).
  Harness errors are inconclusive=pass (don't block); only DEFINITE crashes fail. ctx stub uses an
  explicit STR_PROPS allowlist (fillStyle etc) -> everything else is a no-op fn (so setLineDash etc work).
- CreationGameService.verifyOrRepair(): LLM codegen -> static validate -> play-test; FAIL -> feed
  reason back via buildRepairPrompt, regenerate ONCE, re-validate+re-playtest; still fail -> return
  null => caller retires to clone-mutate/template. modelUsed gets '+repair' suffix when repaired.
  GamePlaytestService injected @Optional into CreationGameService; registered in creation.module.ts.

### BOOT-CRASH FIX in 4 existing corpus games (DONE — was breaking ALL their clone-mutate variants!)
- snake/breakout/runner/shooter called loop()/requestAnimationFrame(loop) BEFORE newGame() inited
  state. In a real browser the first rAF fires before any click -> draw() reads undefined arrays/state
  -> throws -> since rAF reschedule is AFTER draw() in the loop body, the loop DIES -> clicking Start
  does nothing (frozen). Confirmed via vm harness in real-browser order (pump frames before click).
  FIX: boot now inits state then pauses, matching the new games' pattern:
    snake/breakout/runner: `...newGame();running=false;loop()/requestAnimationFrame(loop);`
    shooter: `newGame();state.running=false;state.over=false;loop();`
  step()/update() already guard `if(!running)return`; draw renders inited state behind overlay. All 10
  games now pass both click-first AND real-browser-order (pump-before-click) play-test.
- Regression tool: backend/games-authored/_smoke.mjs (node, replicates harness over all corpus +
  negative control). Run: `node games-authored/_smoke.mjs` from backend/.

### Deploy note
Backend TS changes (services/module) require git reset + `npm run build` + pm2 restart.
Game HTML changes also need `cp games-authored/<slug>/index.html games/<slug>/index.html` for any
slug with a LIVE creation (shooter/match3/tetris served as embed). New bases (poker/td/rhythm/racing)
need no games/ copy unless seeded — clone-mutate reads games-authored/ directly.

## Light Mode live switch (no-reload) infra + Settings migrated (DONE, mobile)
- src/theme/colors.ts: added subscribeTheme(listener), getPalette(mode); setThemeMode now NOTIFIES
  subscribers (live) in addition to mutating `colors` in place.
- NEW src/theme/useTheme.ts: useThemeMode()/useColors()/useTheme()/useThemedStyles(makeStyles) via
  useSyncExternalStore. Pattern to migrate a screen: module-scope `const styles=StyleSheet.create({..colors..})`
  -> `function makeStyles(c:Palette){return StyleSheet.create({..c..})}` + in component
  `const c=useColors(); const styles=useThemedStyles(makeStyles)` + JSX colors.x -> c.x. Type-safe
  (Palette=typeof darkColors) so getDiagnostics catches mistakes without running the app.
- Migrated src/screens/me/ClawSettingsScreen.tsx (the toggle screen) -> recolors INSTANTLY on toggle.
  Toggle alert reworded ("已适配页面实时生效;旧页面重启后刷新"). Reload button kept for legacy screens.
- WHY only partial: module-scope StyleSheet freeze means there is NO global trick; each screen must read
  colors at render time. Remaining screens flip on reload until migrated. Guide:
  docs/LIGHT_THEME_LIVE_SWITCH_GUIDE.zh-CN.md (priority: 4 tab roots -> shared components -> rest).
- Mirrored to Claw (18a9b80) -> APK CI building. No backend change.

## OSS research doc (DONE): docs/AI_GAME_OSS_RESEARCH_2026-06.zh-CN.md
- Surveyed PlayableIntelligence/game-creator (MIT; Phaser2D+Three.js3D; **template-copy not from-scratch**;
  per-step QA subagent build/runtime/gameplay/architecture/visual + autofix x3; **render_game_to_text()**
  state-as-text convention; 3D examples maze/flight/runner), Donchitos/Claude-Code-Game-Studios (21.6k*,
  49 agents/73 skills, dev-time orchestration template, has /smoke-check //playtest-report + server-auth
  rule), abagames/one-button (mobile one-button recipes), awesome-ai-built-games. Papers: arXiv 2604.18394
  (LLMs collapse producing full playable games -> validates template+variation+playtest), 2603.07106 AutoUE
  (multi-agent 3D Unreal = research-stage = our D3/later).
- TOP recommended next borrows: (A) adopt render_game_to_text() in our 10 corpus games + require it from LLM
  codegen -> upgrade play-test from "doesn't crash" to "gameplay works" (assert score++/over) + powers AI
  opponents + anti-cheat. (B) Desktop D1: use Computer-Use/CDP for REAL headless-Chromium QA (action replay +
  screenshot) on rich 2D/light-3D bundles; reuse their Three.js template skeleton + 3D examples as desktop
  seeds. License: all MIT (game-creator audio @strudel = AGPL -> do our own Web Audio to avoid).


## 3 fixes: poster download / light-mode main pages / world map (2026-06-15 pt3)
### Poster QR/link → official APK download (DONE, live)
- The poster QR points to /c/:code landing. frontend/pages/c/[code].tsx only offered dead Google Play.
  Now leads with OFFICIAL download: android → https://agentrix.top/downloads/ClawLink-latest.apk,
  else → https://agentrix.top/download (the existing multi-platform hub, auto-detects). + tertiary
  "全部下载方式" link + hint "Google Play 上架审核中". Deployed agentrix-frontend (next build + pm2),
  verified https://agentrix.top/c/DRAMADEMO001 = 200 with download hub link present.
### Light-mode now covers MAIN pages (DONE, mirrored APK)
- Migrated to useColors/useThemedStyles (live, no-reload): MainTabNavigator (tab bar, frames all),
  WorldHubScreen, UnifiedWorldMapScreen, plaza/PlazaScreen, me/ProfileScreen (+ ClawSettingsScreen prior).
- PATTERN for files with helper sub-components sharing module `styles`: make `function makeStyles(c:Palette)`
  and call `const styles=useThemedStyles(makeStyles)` IN EACH sub-component (they're function comps).
  Did this for PlazaScreen (SectionCard) and ProfileScreen (QuotaCell/MenuItem/Section).
- STILL pending (reload-to-apply): Summon root = src/screens/agent/AgentChatScreen.tsx (big chat) +
  secondary pages. Guide: docs/LIGHT_THEME_LIVE_SWITCH_GUIDE.zh-CN.md (已迁移/待迁移 lists updated).
### World map was a boring list → real visual map (DONE, mirrored APK)
- src/screens/world/UnifiedWorldMapScreen.tsx rewritten: pannable canvas (680x920) with 4 districts by
  type (商业区/游戏区/演艺区/居民区), markers absolute-positioned via stable id-hash within district,
  terrain gradient (dark/light aware via c.bg check) + grid lines, cover-thumb pins, tap→experience/detail,
  empty-world center hint, FAB create. No native MapLibre dep (build-safe). Themed. Fixes "地图消失成列表".
- Mirror e3b420b → APK CI. Frontend ea162b2e live.


## Light Mode 做全 — app-wide via themedStyles codemod (2026-06-15 pt4, DONE, mirrored APK)
- Problem: ~206 files still had module-scope `const styles = StyleSheet.create({...colors...})` (frozen
  at import). Hand-migrating all is impractical.
- Solution (no per-component hooks needed):
  1. NEW `themedStyles(() => StyleSheet.create({...}))` in src/theme/useTheme.ts — returns a Proxy that
     on every property access returns the StyleSheet for the CURRENT mode (built lazily + cached per
     mode; builds a non-current mode by briefly Object.assign-swapping the live `colors`). Type:
     `themedStyles<T>(factory:()=>T):T` → keeps `styles` exact type (zero new tsc errors).
  2. App.tsx root now `useThemeMode()` → toggling re-renders the whole tree; combined with `colors`
     mutated-in-place + themedStyles per-mode read → ALL screens (incl. JSX `colors.x`) repaint LIVE,
     no reload. StatusBar style also follows mode.
  3. CODEMOD scripts/codemod-themed-styles.mjs (babel: LOCATE StyleSheet.create call spans → wrap by
     string offset, preserving formatting/comments; inject `themedStyles` import after last import via
     AST end-offset — IMPORTANT: regex `^import` injection breaks multi-line imports, use AST offset).
     Wrapped 230 calls across 206 files. Idempotent; skips hook-migrated files (they use makeStyles,
     no top-level `const styles=StyleSheet.create`). Re-run: node scripts/codemod-themed-styles.mjs [--apply].
- Verified: `npx tsc --noEmit` → only 28 PRE-EXISTING errors (vscode-ext, vitest, react-native-webview,
  shared/types ambiguity, AeonTileMap pointerEvents, etc.); ZERO themedStyles/StyleSheet-related.
- Hook-based (instant) screens stay: Settings, World/Plaza/Me roots, tab bar, world map. Rest switch on
  next render (root re-render makes that immediate). Commit 74d4554d, mirror a314998 → APK building.
- NOTE codemod script is under scripts/ which is .gitignored → not committed (kept locally only).
