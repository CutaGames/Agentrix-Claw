# Sprint M-P2 wrap + M-P3 cleanup + Mobile manual + Invitation design (2026-05-16)

> Continuation of `sprint-mobile-p2-and-v4-e2e-shipped-2026-05-16.md`.
> Production commit `6e9e5ed6` deployed; backend untouched, frontend
> rebuilt to expose `/help/mobile`.

## What landed

### M-P2-5 Multi-account
**Already shipped earlier**. `AgentDrawerContent` and `AgentConsoleScreen`
both have instance picker chips wired to `authStore.setActiveInstance`.
Added a documentation pointer in mobile manual §8.3 instead of
introducing new UI.

### M-P3 Typecheck cleanup (was 22 errors, now 0)

Six surgical fixes to pre-existing errors flagged by the V4 E2E report:

- `src/navigation/types.ts` — added `NftMint: undefined` to
  `HomeStackParamList` (Sprint J registered the screen but missed the type).
- `src/services/mobilePetSdk.ts` — added optional `biasTowardA?: number`
  param to `breedPet()` so `BreedScreen` can pass the slider value.
- `src/screens/pet/CameraScanScreen.tsx` — replaced
  `FileSystem.EncodingType.Base64` (removed in expo-file-system v19+)
  with the literal `'base64'`.
- `src/services/axpCashback.service.ts` — `useAxpToastStore` exposes
  `push()` not `showToast()`. Updated to use the canonical store API
  with `reason: { en, zh }` and `direction: 'earn'`.
- `src/services/nfc.service.ts` — coerce `record.payload` to `Uint8Array`
  before passing to `Ndef.uri.decodePayload` / `Ndef.text.decodePayload`.
- `src/services/clawcore/firmwareSigning.ts` — cast `Uint8Array` args to
  `BufferSource` for `crypto.subtle.importKey` / `verify` (TS 5.9 stricter
  ArrayBufferLike vs ArrayBuffer typing).

`npx tsc --noEmit -p tsconfig.json` now exits 0.

### Mobile user manual

`docs/USER_MANUAL_MOBILE_V4.zh-CN.md` — 14-section guide following the
desktop manual structure:

1. Quick start
2. Install & launch (4 login methods including Apple SIWA)
3. **Invitation code** — explicit answer to product/ops questions
4. 4-Tab structure (Home / Summon / Plaza / Me)
5-7. Per-Tab detail with 10-drawer / 5-segment / 8-entry breakdowns
8. **Multi-platform pairing** — desktop QR scan flow
9. NFC redemption flow
10. Toy pairing OOB 6-digit
11. iOS App Intents + Android App Actions
12. Privacy & telemetry (default OFF + opt-in)
13. OTA updates (EAS Update vs store update)
14. Troubleshooting (5 categories)
+ Appendix A: version history

Web exposure:
- Added `mobile` slug to `frontend/pages/help/[...slug].tsx` DOC_MAP
- Help index card for mobile manual
- Footer nav links between desktop/mobile/FAQ

Verified `https://agentrix.top/help/mobile` returns 200 after
frontend rebuild + pm2 restart.

### Invitation code design doc

`docs/INVITATION_CODE_DESIGN.zh-CN.md` — answers the user's three
questions canonically and documents:

- **Mobile-only gate**: `InvitationGateScreen` triggered between
  auth and onboarding by `RootNavigator` when
  `isAuthenticated && !hasValidInvitation`.
- **Codes have optional `expiresAt`**; default null means no fixed
  expiry. Operations sets per batch.
- **One code = one account binding**; account is multi-platform
  shared. So:
  - Desktop / Web do NOT have an invitation gate
  - Logged-in mobile user → scan QR pairs desktop / web → no
    invitation re-validation needed
  - Same code can NOT be reused by another account (default
    `maxUses=1`)
- **Recommended ops config** per scenario (KOL multi-use, earlybird
  time-limited, customer-support 1-1, etc.)
- **Known limits** (no recovery flow, no batch CSV export, no
  cross-platform invitation gate, referrer AXP not auto-credited)
- **User-facing FAQ table** for customer support

## Production verification

| Path | Status |
|------|--------|
| `https://agentrix.top/help` | 200 (with new Mobile manual card) |
| `https://agentrix.top/help/desktop` | 200 |
| `https://agentrix.top/help/desktop/faq` | 200 |
| `https://agentrix.top/help/mobile` | 200 (first ISR request slow, second cached) |

Mobile typecheck `npx tsc --noEmit -p tsconfig.json` exits 0.
Web ISR cache for `/help/mobile` is 1h per the existing `revalidate`.

## Direct answers to user's question 3

> 目前邀请码机制在移动端是否仍然有效？

✅ 有效。`POST /api/invitation/validate` + `POST /api/invitation/redeem`
都在生产，`InvitationGateScreen` 拦截首次登录。

> 是否有有效期？

✅ 可配置。`invitation_codes.expiresAt` 字段；运营生成批次时指定。
默认 null（无固定期限）。

> 移动端有邀请码的扫码就可以拓展到桌面端？

⚠️ 有部分误解。**桌面端不通过邀请码扫码激活**，而是通过移动端**扫
桌面端的登录二维码**（agentrix.top/pair?session=...）来登录。一旦
扫码登录成功，桌面端继承了移动端账号的所有状态，不需要再走邀请码
流程。

> 一个邀请码多端通用？

📋 看怎么定义"多端通用"：

- 一个码激活同一账号 → 该账号在所有端共享会员状态：✅ 是。
- 一个码可以分别在 Mobile / Desktop / Web 各激活一次：❌ 否。
  邀请码绑定的是**账号 redeem 事件**，被消费后码就 USED 了。

详见 `docs/INVITATION_CODE_DESIGN.zh-CN.md` §3.3。

## Gotchas

- `frontend/pages/help/[...slug].tsx` 的 `getStaticProps` 用
  `process.cwd() + '..'` 找 repo root，依赖 Next 在 `frontend/` 下运行。
  EAS / Vercel 部署时如果改了 cwd 需要调整。
- `expo-file-system` v19 把 `EncodingType` enum 删了。如果将来回退到
  v17 / v18，需要恢复 `EncodingType.Base64` 写法。
- `Uint8Array<ArrayBufferLike>` 类型在 TS 5.9 比 5.7 严格。如果跑
  CI 时遇到此类报错，先检查是否需要 `as unknown as BufferSource` 桥接。
- 帮助页 ISR 1h 缓存：刚部署时第一次访问 `/help/mobile` 可能慢
  20-30 秒生成静态 HTML，之后缓存。如果着急可以手动 trigger 一次
  访问。
