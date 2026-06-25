# World Engagement: P0 score/leaderboard + Prediction Market (2026-06-15)

## Shipped + verified live
### P0 keystone — score authority + weekly leaderboard + render_game_to_text
- NEW backend module `backend/src/modules/world-engagement/` (wired in app.module):
  - GameScoreEntity (game_scores) + GameScoreService: submitScore (clamp MAX_SCORE=50M, 12/min rate
    limit, weekKey ISO), leaderboard(period week|all) = MAX(score) per user, awards game_participate AXP
    (AxpService daily cap 5 tolerated). Endpoints: POST /v1/arena/creations/:id/score, GET .../leaderboard.
  - migration 1813000000000-CreateWorldEngagement (game_scores + prediction_* tables + indexes + seed).
- Corpus games instrumented: on game-over they `window.ReactNativeWebView.postMessage(JSON {type:'gameover',score})`
  + set `window.render_game_to_text()`. Done in snake/breakout/runner/shooter/rhythm/racing/towerdefense/match3
  (tetris/poker not yet). _smoke.mjs still ALL OK. Served copies updated (shooter served grep ReactNativeWebView=1).
- Mobile: src/services/worldEngagementApi.ts; GameRunner in CreationExperienceScreen.tsx now onMessage→submitGameScore,
  shows score toast + 🏆 weekly leaderboard modal (themed).
- VERIFIED LIVE: score 1234 → rank 1, +30 AXP; leaderboard returns {rank:1,name:Jacky,score:1234,isMe:true}.

### Prediction Market (parimutuel pooled, AXP) — explicit user ask (World Cup)
- PredictionMarketEntity + PredictionStakeEntity + PredictionService: list/get/stake/create/lock/settle/cancel.
  parimutuel: winners split totalPool*(1-rakeBps/1e4) ∝ their stake; no-winner → refund-all (push);
  cancel → refund all. Admin gate = FALLBACK_ADMIN 90060951-... + env PREDICTION_ADMIN_USER_IDS.
  AXP sources added: spend prediction_stake/arena_entry, earn prediction_payout/prediction_refund/arena_prize.
- Endpoints under /v1/predictions (+ /admin/is-admin). Seeded demo market id
  b1000001-0000-4000-a000-000000000001 「世界杯决赛:谁能夺冠?」 (bra/arg/fra/other), open, rake 5%.
- Mobile: PredictionMarketScreen.tsx (list→pick option→stake modal w/ chips), registered in
  PlazaStackNavigator as 'PredictionMarket', entry card in PlazaScreen Play section. Themed (useThemedStyles).
- VERIFIED LIVE: stake 100 on bra → pool 100; admin gate false for normal user; list returns demo market.
- COMPLIANCE: AXP = utility points (not currency); parimutuel pooled; flagged region-limit + entertainment
  disclaimer in UI. Betting/竞猜 needs legal sign-off + region gating before wide launch.

## Deploy notes (this session)
- Commit a-side 89b680b mirror → APK. Backend: git reset + `npm run build` + `npm run migration:run`
  (ran CreateWorldEngagement OK) + pm2 restart (health 200). Served games cp loop (snake/shooter/match3/
  tetris/towerdefense have games/ dirs; breakout/runner/rhythm/racing corpus-only).
- GOTCHA: first big SSH deploy command got cut mid-build → dist module missing → had to re-run `npm run build`
  explicitly and confirm dist/modules/world-engagement/*.js present before restart. migration:run runs from
  source (ts) so it succeeded even before the module dist build.

## Still TODO from the P0→P2 plan (next sessions)
- P0-① AI 解说/陪练 in HTML games (now feasible: render_game_to_text exists → feed state to LLM coach).
- P0-② skill prize pools (arena_entry→pool→split; AXP sources already added, pool logic not built).
- B-③ social front-end: surface likes/comments/follow + a "关注" feed tab (data layer exists).
- P0-③ Remix lineage + royalties (extend creation-revenue-share to fork lineage).
- P1-④ drama 追更 + 活体 agent 角色; P1-⑤⑥ live commerce / seasonal; P2 B2B/O2O.
- tetris/poker score instrumentation; per-creation leaderboard surfaced in CreationDetail too.


## Continued: P0-① coach + P0-② prize pools + B-③ social frontend (2026-06-15 pt2, all live)
### P0-① AI coach/commentary (LIVE, verified)
- CoachService (world-engagement) @Optional LlmCompletionService. POST /v1/arena/coach {creationId,title,state,history}
  → LLM (platformModel haiku, BYO-first) → 1 short Chinese tip; clean() strips markdown/prefix, ≤90 chars;
  keyword fallback if no LLM. Games expose window.render_game_to_text() (added in pt1 instrumentation).
- Mobile: GameRunner 🧠 button → webRef.injectJavaScript reads render_game_to_text → postMessage 'coachState'
  → coachGame() → coach bubble overlay. VERIFIED: coach returned real sonnet tip for shooter state.
### P0-② skill prize-pool tournaments (LIVE, full flow verified)
- arena_tournaments + arena_entries (migration 1814000000000). ArenaTournamentService: create(admin)/list/get/
  join(spend arena_entry→pool)/settle(rank by MAX game_scores since startsAt → top-N split payoutSplits of
  pool×(1-rake) → earn arena_prize)/cancel(refund arena_refund). Endpoints /v1/arena/tournaments*.
  Admin gate same as prediction (FALLBACK_ADMIN 90060951 + env PREDICTION_ADMIN_USER_IDS).
- AXP sources added: spend arena_entry, earn arena_prize + arena_refund.
- Mobile: tournaments surfaced inside GameRunner 🏆 leaderboard modal (open tournaments + 报名/join).
- VERIFIED LIVE: create(fee50,splits[1.0]) → join(pool50) → score5000(rank1) → settle(distributable45,payout45).
### B-③ social front-end (LIVE, mobile-only — backend endpoints already existed)
- creationApi.listCreationComments(id) (GET /v1/creations/:id/comments). CreationDetailScreen now loads
  comments on open (useEffect) — previously the wall was always empty. like/comment/follow/share were already wired.
- CreationFeedScreen SORT_TABS += 'following' (关注 tab). Backend discovery controller backfills viewerAccountId
  from auth + CreationFollowResolver bound → following feed works (degrades to newest if resolver unavailable).

## Deploy state
- Backend deployed twice this session (coach commit 5c95f1e build+restart; arena commit ff505ca build+migration:run+restart).
  Health 200. Served games already have render_game_to_text (pt1).
- Mirrors: 082a244 (coach+arena UI), b95de4e (social frontend). APK building.

## REMAINING P0→P2 (next sessions, in order)
- P0-③ Remix lineage + royalties: fork a creation → derived variant → sale splits to original lineage
  (extend economy/creation-revenue-share to a lineage chain; add parentCreationId + royalty bps).
- P1-④ Drama 追更 + 活体 agent 角色 (episode unlock exists; add 角色好感/分支 + summon character agent to chat).
- P1-⑤ Live commerce (LiveRoom + buy offerings live), P1-⑥ seasonal events (reuse photo-mimic season infra).
- P2 B2B playable ads (clone-mutate) + O2O coupon redemption (reality checkin exists).


## P0-③ Remix lineage + royalties (LIVE, verified)
- creations += parent_creation_id / root_creation_id (migration 1815000000000, additive nullable + index).
  CreateCreationInput/create() accept lineage. POST /v1/creations/:id/fork (CreationAuthoringService.forkCreation):
  copies type/title("·Remix")/summary/substrateTier/ecsVersionId/preview/offerings, owner=remixer, sets
  parent=src, root=src.root??src; publishes immediately (parent already moderated + preview copied).
- Royalty: creation-social.service payLineageRoyalty() — on purchase/tip of a creation with parentCreationId,
  10% (LINEAGE_ROYALTY_BPS=1000) of gross goes to PARENT creation's originalCreator (resolve account→user),
  owner earns gross-royalty. AXP earn source 'remix_royalty'. Skips if parent creator == owner.
- Mobile: creationApi.forkCreation; CreationDetailScreen 🔀 Remix button → fork → navigate to new creation.
- VERIFIED LIVE: test user forked shooter (published, owned by forker) → owner tipped fork 100 →
  fork owner ledger shows creation_tip:90/earn (NOT 100) → 10 royalty split to parent creator. ✓
- DEPLOY GOTCHA: `npm run build` clean step hit flaky ENOTEMPTY on dist/modules/payment (nest build failed
  → script auto-fell-back to tsc and succeeded). If build "fails" at clean, `rm -rf dist` then rebuild; tsc
  fallback emits dist. Verify dist has new symbols (grep forkCreation/payLineageRoyalty) before trusting restart.
- Mirror 8272a503 → APK. Migrations live: 1813(engagement)/1814(arena)/1815(lineage).

## NOTE: toCreationDto does NOT expose parent/root lineage fields (royalty reads entity directly).
  If UI needs to show "Remixed from X", add them to the DTO + shared Creation type later.

## REMAINING: P1-④ drama 追更+活体角色, P1-⑤ live commerce, P1-⑥ seasonal, P2 B2B/O2O.


## P1-④/⑤/⑥ (2026-06-15 pt3)
- P1-④ drama 追更 + 活体角色: ALREADY DONE pre-session. DramaRunner has episodic AXP unlock (追更) +
  summonCharacter() → builds roleplay persona prefill + navigates to Summon (live agent plays the character,
  chat continues outside the drama). creation-drama.service unlock is server-authoritative. No new work needed.
- P1-⑤ live commerce (LIVE, mobile-only): LiveRoom (CreationExperienceScreen) now shows a shoppable offerings
  strip; buy-while-watching reuses server-authoritative purchaseCreation. Parent passes offerings/onBuy/buyingId
  to LiveRoom. Mirror 89a2bf37/a6673a6.
- P1-⑥ Events Center (LIVE, mobile-only): NEW EventsCenterScreen aggregates open arena tournaments (cross-game)
  + open prediction markets; join tournament / go predict. listTournaments(creationId?) now optional (no arg =
  all). Registered in PlazaStackNavigator + Plaza Play card. Mirror 1f9e3a76. Seasonal events = themed
  time-boxed tournaments (P0-② infra: create with endsAt + prize pool), surfaced here.

## P2 status (NOT built — business/ops-gated, hooks exist)
- O2O coupons: hook = creation-reality.service GPS check-in (awards AXP). A coupon = a redeemable offering at a
  POI + a redemption record (one-time, merchant verify). Net-new redemption flow + merchant side → needs product/biz scope.
- B2B playable ads: hook = clone-mutate (near-zero-cost branded game gen) + a 'sponsored' creation flag + feed
  placement. Advertiser onboarding/targeting/billing = business, not blind code.
- Recommendation: scope P2 with business input; don't build shells.

## FULL ROADMAP STATUS: P0 (score/leaderboard, AI coach, prize pools) ✅ | prediction market ✅ |
   B-③ social frontend ✅ | P0-③ remix royalties ✅ | P1-④ drama ✅ (pre-existing) | P1-⑤ live commerce ✅ |
   P1-⑥ events center ✅ | P2 ⏸ (business-gated).
