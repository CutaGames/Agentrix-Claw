# Aeon company ops + build-persistence fix + realtime VERIFIED (2026-06-01 session F)

Commit `b8efac7ca`. Build branch `build/aeon-company-2026-06-01`. No backend code change
(org endpoints already deployed); mobile + test only.

## Q1 build "进去又从头开始" — NOT a persistence bug
Prod DB proof: Jacky owns 3 plots named "我的领地"; main plot `6e066512` has 10 build items,
`c2ecd729` has 9. Builds PERSIST. The 8 "E2E 测试领地" sandbox plots (owner 2aabdc21) each
have 1 item — the user kept tapping different sandbox markers → landed on a different empty plot.
FIX: AeonMapScreen now has a prominent "🏙️ 进入我的领地" CTA (both real-map overlay + degraded
banner) → onEnterMyTerritory enters mine[0] (user's primary plot) every time. Same base, builds visible.

## Q2 company operations — backend existed, NO mobile UI (now built)
Backend `/v1/aeon/orgs/*` full loop was deployed but unreachable from mobile (grep confirmed zero
org UI). Built `src/screens/aeon/AeonCompanyScreen.tsx`:
  create company (on your plot) → fund AXP ledger → hire agent employee (uses authStore
  activeInstance.id) → clock-in (agent enters company room, auto-runs a KPI work turn) →
  settle (measureOutput → payWage if completed>0) + a 怎么运营 5-step guide.
Added org API fns to aeonApi (listMyCompanies/createCompany/getCompany/listCompanyMembers/
fundCompany/hireAgentEmployee/clockInMember/clockOutMember/settleMember). 🏢 chip in scene action bar.
Org economic loop (backend, verified by reading service): fund→hire(wage)→clock-in(worker.runOneTurn
接 KPI 任务)→settle(产出达标 economy.transfer from org wallet to employee owner + reality.creditWallet).
NOTE: Android lacks Alert.prompt → fund falls back to fixed 100 AXP (documented in-code).

## Q3 realtime — was BUILT but NEVER E2E-verified; now VERIFIED PASS
/aeon socket.io gateway is deployed (engine.io handshake 200, gateway is a Nest provider).
Wrote a 2-client same-room presence test; FIRST run "failed" — but that was MY test bug (listened
for 'aeon:server_event'; real event name is 'aeon:server' per AEON_SYNC.SERVER_EVENT). After fix:
**PASS — A receives B's char_upsert in real time in the same room**. Realtime multi-user presence
works on prod. Saved reusable test: tests/e2e/aeon-realtime-presence.smoke.mjs (needs socket.io-client
+ 2 JWTs; run on backend host). Backend has NO socket.io-client dep (only server socket.io) — install
--no-save transiently to run.
GOTCHA for future: AEON_SYNC event names = JOIN 'aeon:join', CLIENT_EVENT 'aeon:client',
SERVER_EVENT 'aeon:server', LEAVE 'aeon:leave', NAMESPACE '/aeon', room 'aeon:room:<id>'.

## STILL OPEN (told user — bigger design, proposed not built)
Group-social venues (脱口秀/live show/co-build/team activities): backend has room kinds
venue/market/public + news/event concept + realtime gateway (now verified) — the foundation exists.
A real "live venue with on-stage + audience chat" is a multi-day feature (event entity, schedule,
stage roles, realtime chat room UI). Proposed phased plan to user; not built this pass.
Entering others' plots currently: 进入领地(2.5D scene) + 留言板 + 私信 + (their builds visible).
