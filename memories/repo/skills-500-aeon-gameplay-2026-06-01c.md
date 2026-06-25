# Skills-500 REAL root cause + Aeon gameplay loop + local desktop build (2026-06-01 session c)

Branch `feat/multi-agent-v2-1-llm-router-byo`. Commits `67f10da72` (skills route fix),
`7836571a5` (aeon gameplay). Skills fix DEPLOYED + VERIFIED on prod. APK build branch
`build/world-gameplay-2026-06-01`.

## Bug 2 (skills) — THE REAL ROOT CAUSE (prior "focus refetch" fix was treating wrong cause)
`GET /api/skills/installed` was returning **HTTP 500** the whole time. Reason: NestJS route
registration order in `skill.controller.ts` — `@Get(':id')` (findOne) was declared BEFORE
`@Get('installed')`, so `/skills/installed` matched the `:id` wildcard, treating "installed"
as a skill UUID → Postgres `invalid input syntax for type uuid: "installed"` → 500. The mobile
list swallowed the 500 → always empty. **A focus-refetch can't fix a 500.**
FIX: moved `@Get('installed')` ABOVE `@Get(':id')` (and `@Get()`). Verified on prod:
`/api/skills/installed` now → 200, success true, total 22, 20 items.
DIAGNOSIS METHOD (reusable): prod DB tables are `user_installed_skills` (snake_case cols:
user_id/skill_id) + `claw_installed_skills` (⚠️ CAMELCASE cols: "instanceId"/"installedByUserId"/
"skillId" — this entity does NOT use SnakeNamingStrategy). Data was always correct (96 claw rows,
valid installer+skill+published). Minted a JWT with prod JWT_SECRET for the real user and curled
localhost:3000 → saw the 500 → grep PM2 error log → "invalid input syntax for type uuid: installed".
LESSON: any `@Get('literal')` MUST be declared before `@Get(':id')` in the same controller.

## Bug 6 (battle) — backend VERIFIED WORKING; user is on an old APK
Ran a real train+step against prod as the user (minted JWT, picked their character asset):
- POST /battles/interactive/train → 201 with battleId + state (hp 97, energy 1)
- POST /battles/interactive/:id/step {attack} → 201 with full round (dmg 11 vs 9, hp updated).
So the battle API works end-to-end. The "attack→blank" is the client swallowing errors (already
fixed: error banner mid-battle) + the user testing an APK that predates the fix. The picker
grey-button fix (removed `disabled`, training needs 1 char, dual-hint) is also in. New APK has all.

## Bug 3/4 (Aeon "怎么玩 / no gameplay / map decorative") — added a real loop
Backend had a full economy (tasks/orgs/marketplace/news/leaderboard/inbox/reality-reward) but
mobile surfaced almost none → dead-end. Added:
- `AeonTasksScreen` — browse/post/accept bounties (the real /v1/aeon/tasks loop: post→accept→
  deliver→verify→AXP). Wired task endpoints into aeonApi (listOpenTasks/postTask/acceptTask/
  submitTask/verifyTask).
- `AeonNewsScreen` — world news + AXP leaderboard (endpoints already in aeonApi).
- `AeonScene` — new "接下来做什么" action bar (任务广场/建造/世界动态/地图); tutorial rewritten
  with the real loop + CTA → task plaza.
- Registered AeonTasks/AeonNews routes in WorldStackNavigator.
NOTE: backend aeon task POST body = {title, description?, rewardAmount, kind:'plaza'|'bounty'|'kpi'};
list returns {items}. Verified shapes match.
STILL a gap (told user honestly): map markers all enter generic scene; per-player coords/social
on map is a bigger design item (deferred). True isometric tilemap also deferred.

## Bug 1 (local desktop build) — fixed a stray-compiled-file interop break
`npm run build` (Vite) in desktop failed: `"AGENT_RUN_TOOL_SCHEMA" is not exported by
"../shared/types/agent-tools.js"`. Cause: stray COMPILED `shared/types/agent-tools.js`(+.map/.d.ts)
sat next to `agent-tools.ts`; Vite/rollup resolved the CommonJS `.js` and couldn't read its named
export as ESM. spawnTool.ts imports `"../../../shared/types/agent-tools"` (no ext).
FIX (local): deleted stray compiled `shared/types/{agent-tools,remote-control}.{js,js.map,d.ts}` so
Vite resolves the `.ts`. Local `npx tauri build` then passed the frontend bundle and proceeded to
Rust compile. Output: `desktop/src-tauri/target/release/agentrix-desktop.exe` (the user's known path).
These stray .js are git-untracked; CI uses npm ci + its own build and isn't affected.

## ENV
- prod DB via discrete DB_* env vars (not DATABASE_URL); psql with PGPASSWORD + DB_HOST/PORT/USERNAME/DATABASE.
- bash readonly var: don't use `UID` as a var name in scripts.
- claw_installed_skills uses camelCase columns — quote them in SQL: c."installedByUserId".


## SESSION D follow-up (same day) — battle juice + dungeon battle + Aeon market
Commit `446d38c81`. Build branch `build/world-gameplay-v2-2026-06-01`.

### Battle "技能空 / 没意思" — diagnosed + improved
- Verified via prod DB: characters DO have offensive skills with damageBase (Strike 20, Surge 35).
  Backend train+step returns 201 with full rounds. So "skills empty" = user on OLD APK.
- FIXED a real latent bug: client filtered skills to offensive then submitted the FILTERED-array
  index as skillIndex, but backend stepRound uses the FULL skills list index → selecting Surge
  actually triggered Guard. Now each skill carries its original `skillIndex`.
- Battle JUICE (the "没意思" complaint): added animated HP bars (green→amber→red), floating
  damage popups (-N, crit bigger/gold), hit-flash on the struck combatant. maxHp tracked from
  initial state. Drives off log[0] (latest round).

### Dungeon room → battle (Task B done)
- WorldDungeonExplorerScreen: entering a room with enemies/BOSS now launches a real PvE
  interactive (training) battle; difficulty = hard if BOSS, normal if ≥3 enemies, else easy.
  Loads player's top character via listWorldAssets. Added difficulty+dungeonRoomId to the
  WorldInteractiveBattle nav params; battle screen passes difficulty to startTrainingBattle.

### Aeon market street (Task 3 done)
- New AeonMarketScreen '市场街区' hub: cross-navigates to ALL existing markets without
  duplicating them — WorldAssetMarketplace (World stack), Plaza>Skills (技能), Me>PetSkinMarketplace
  (皮肤), Me>PetBreed (宠物), Plaza>PlazaRoot (集市), Me>ApiKeys (AI 订阅). Added 🏬 chip to
  AeonScene action bar. Registered AeonMarket route.

### STILL deferred / honest gaps
- Map coordinate social: markers already = players' claimed plots + tap-to-visit works, but
  markers don't show owner name/social affordances yet (bigger design, not done this pass).
- Dungeon room "cleared" state after winning is optimistic/visual only (no battle→dungeon
  callback wired; RN nav makes return-result awkward — acceptable for PvE).
- Doubao art: user sent 2 isometric floor-tile sheets (good, on-style). Need to crop into
  individual tiles + wire into a tilemap renderer (replacing the single ImageBackground in
  AeonScene) — separate art-integration task.
