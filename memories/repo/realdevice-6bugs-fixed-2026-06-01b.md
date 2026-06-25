# Real-device bug batch (6 issues) — fixed 2026-06-01 (session b)

Branch `feat/multi-agent-v2-1-llm-router-byo`. Commits `db7ec4020` (summon+skills),
`2e9ed3e0c` (battle+aeon build), `67d9a3f1e` (desktop release config).
Backend deployed (Nest restarted OK). APK build branch `build/world-bugfixes-2026-06-01`.
Desktop tag `desktop-v20260601-1` → desktop build #149.

## Bug 3 — Summon (召唤) tab crashed to World on FIRST entry, worked 2nd time
ROOT CAUSE (two compounding): `src/components/summon/LlmBudgetBar.tsx`
1. `useCallback(handlePress)` was declared AFTER an early `if (!quota||!usage) return null`
   → conditional hook = Rules-of-Hooks violation → "rendered fewer hooks" crash when data
   flips undefined→defined on first fetch.
2. Unguarded nested access `quota.effective_tier.toUpperCase()` on a partial first payload.
WHY it bounced to World (not the chat error boundary): in SummonStackNavigator,
`<LlmBudgetBar/>` was a SIBLING of `<ChatScreenErrorBoundary>`, so its throw escaped to the
global AppErrorBoundary (wraps NavigationContainer), which AUTO-REMOUNTS the nav tree →
MainTabNavigator initialRouteName="World" → user lands on World.
FIX: moved all hooks above the guard; guard nested fields (effective_tier/llm_budget_cents_monthly/
usagePercent must be present); moved `<LlmBudgetBar/>` INSIDE ChatScreenErrorBoundary.

## Bug 5 — installed skill not in "我的技能 / My Skills"
ROOT CAUSE: react-query key mismatch. `MySkillsScreen` read `useQuery(['my-skills'])` (bare),
but every install site invalidated `['my-skills', activeInstance.id]` (instance-keyed) →
non-matching → never refetched (5-min staleTime). Backend UNION read was already correct
(prior memory's fix); this was a pure client cache-key bug the earlier fix missed.
FIX: `MySkillsScreen` now `useFocusEffect(refetch)` + staleTime:0 + pull-to-refresh;
SkillInstallScreen + ClawSkillDetailScreen also invalidate bare `['my-skills']`.

## Bug 6 — training/decision battle "selected attack then empty below, can't continue"
ROOT CAUSE A (decision battle unplayable w/ 1 char): picker 🎮决策对战 + ⚡快速对战 were
`disabled` unless BOTH slots filled; cold-start users have 1 char → permanently greyed.
ROOT CAUSE B (attack does nothing): `WorldInteractiveBattleScreen.submit()` set `error` on
a failed `/step`, but error was ONLY rendered in the `if (error && !state)` early-return —
never during a live battle (state is non-null) → a failed step looked like frozen/empty UI.
FIX:
- WorldInteractiveBattleScreen: dismissable error banner shows mid-battle (error && state &&
  !ended); submit() clears error before each attempt.
- Backend `assetToInteractiveParticipant`: hard-default missing/partial stats (hp=100/atk=30/
  def=20/spd=40/int=30) so `initState` never throws on null hp (card_only/legacy assets) —
  a real candidate for the swallowed 500.
- Picker: decision/quick buttons no longer silently disabled — tappable, alert explains "需选
  双方角色", + a 💡 hint routes single-char users to 🥋单人训练对战 (needs only 1 char).
NOTE: training start/step contract + DB persistence were verified correct; defect B was masking
any transient /step failure. UGC "我的玩法" ▶️开打 routes to picker (rules applied on start via
shareCode) — that's by design; the unplayable feel was the same gate+error-swallow combo.

## Bug 4 — Aeon build "你没有在此地块建造的权限" + remove Doubao watermark
ROOT CAUSE: user was on a shared E2E "测试领地" they don't own; `assertCanBuild` only allows
owner/grantees.
FIX (backend `aeon/build/build.service.ts`): plots with `config.sandbox===true` or
`config.openBuild===true` are buildable by ANY logged-in user (for test/public-experience
plots). Mobile `AeonBuildScreen`: on a permission error, show "这块地不是你的 → 回地图圈自己
的地" instead of the raw error.
⚠️ TODO (NOT done — needs operator): mark the actual E2E test plot row with
`config.sandbox=true` in prod DB (UPDATE aeon_plots SET config = jsonb_set(...)) OR users build
on their own claimed plots. Also the Doubao "豆包 AI" WATERMARK on the Aeon art (plot-ground.png
etc.) needs removal — that's an IMAGE asset edit; only pngjs available locally, can't safely
erase the watermark corner without visual verification → regenerate clean via Doubao (prompt to
provide to user) or hand-edit.

## Bug 2 — desktop .exe still 0.5.28 (user never got the new build)
ROOT CAUSE: `build-desktop.yml` used `releaseDraft:true` (draft = invisible) and the overall
run hung on STALLED macOS runners; the `deploy-update-server` job only runs on `desktop-v*`
tags (not branches), so the updater never got the new version.
FIX: `releaseDraft:false` (Windows job publishes its assets immediately, fail-fast:false lets
it complete independent of macOS); bumped 0.7.20→0.7.21; pushed tag `desktop-v20260601-1` to
trigger a release build + updater deploy. Cancelled the stuck branch run #148.
⚠️ macOS runner availability is a CI infra issue — Windows .exe should still publish.

## ENV reminders
- Stub node_modules → getDiagnostics + CI bundle are the only gates locally.
- PowerShell: no tail/&&; node -e with =>/|| gets parsed by PS → write to file + scp.
- Backend build: nest build fails on pre-existing world-engine TS errors → tsc fallback → dist OK.
