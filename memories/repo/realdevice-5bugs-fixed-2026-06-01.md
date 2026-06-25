# Real-device 5-bug fixes (2026-06-01, commit 16028760d, deployed)

User real-device testing found 5 issues. Root-caused via context-gatherer sub-agent, fixed honestly.

## Bug 1 — installed skills not in 我的技能 (FIXED)
- Root: `OpenClawBridgeService.installHubSkillToInstance` only persisted an Agentrix-side row
  for PLATFORM-HOSTED instances; self-hosted hub installs wrote nothing to DB → UNION read query
  in `findUserInstalledSkills` had nothing to find. Also hub skills lack a marketplace `Skill` row.
- Fix: added `SkillService.ensureHubSkillRow()` (upsert published Skill by externalSkillId) +
  `recordUserHubInstall()` (persist claw_installed_skill keyed to user). Bridge now ALWAYS calls
  recordUserHubInstall in BOTH hosting paths before activating. `skill.service.ts` + `openclaw-bridge.service.ts`.

## Bug 2 — cross-device 在线 fake + Computer Use can't start (PARTIALLY fixed, honest)
- Root: presence derived from `instance.status==='active'` (config state, NOT a live heartbeat).
  Worse: desktop app does NOT join `/remote-control` namespace → can never receive `remote-control:run`.
- Fix (mobile, honest relabel): `RemoteControlPanel` 在线→已配对/未配对 + hint "发送后若桌面端在线会立即执行".
  No longer lies. **Desktop receiver is still NOT implemented** — that's a desktop-app change + rebuild,
  out of scope for the mobile APK. Documented as remaining work.

## Bug 3 — Aeon 测试领地 no room / no build (FIXED)
- Root: `plot.claim()` created plot only (no room); no UI to create a room or reach AeonBuild.
- Fix: `PlotService.ensureDefaultRoom()` auto-creates a default 广场 room on claim AND on owner enter
  (touchActivity, backfills legacy plots). Added 🏗️建造 button in AeonSceneScreen → navigate AeonBuild.
  PlotService now injects AeonRoom repo (already in module forFeature).

## Bug 4 — battle unplayable (FIXED)
- Root A: `WorldBattleArenaScreen` set invalid phase `'preBattle'` on error (type only has
  waiting/fighting/result) → quick battle stuck with no buttons. Fixed → `'waiting'`.
- Root B: decision picker filtered to damageBase>0; could look empty. Added 基础攻击 fallback entry.
  (Backend already injects Basic Attack(dmg 10) so attacks never error — verified.)

## Bug 5 — UGC 玩法 empty shells (FIXED — was a real stub)
- Root: rulesets were create→store→list only; `effectiveRules` were NEVER read by any battle engine.
- Fix: added `BattleRules` (optional param) to `InteractiveBattleEngineService.stepRound` + computeDamage
  (damageMultiplier, maxRounds, critEnabled, winCondition). `battle.controller` start/train accept
  `ruleSetShareCode` → resolves via `UgcGameService.play()` → persists rules in `interactiveState.rules`
  (server-authoritative, survives step replay; preserved alongside defenderSpec). Mobile: ▶️开打 button
  on each ruleset → WorldBattlePicker (carries shareCode+name, shows banner) → battle applies rules.
  worldEngineApi start/train signatures + WorldStackParamList updated.
- VERIFIED on prod: created ruleset (dmgMult 2, maxRounds 10) → train battle started with
  rulesInState={maxRounds:10,damageMultiplier:2,...} → step round 1 dealt damage. Real now.

## Deploy/verify
- Backend built + deployed (pm2 restart, online). Aeon E2E still 22/22. UGC-battle path verified live.
- Property tests: stepRound new param is OPTIONAL → existing fast-check specs unaffected (defaults = old behavior).

## Remaining (honest)
- Bug 2 desktop receiver: desktop must join `/remote-control` ns + handle `remote-control:run` →
  trigger Computer Use. Needs desktop rebuild. Also a real device presence heartbeat (`presence:device.list`).
- E clan eat/listen sprites + B/D full action strips still pending art.
