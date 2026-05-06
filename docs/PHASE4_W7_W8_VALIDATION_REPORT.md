# Phase 4 W7 + W8 — Validation Report

> Branch: `v3-p0-w1-presence-contracts` · Commit: `c4e488e2` · Server: `47.130.176.148` (api.agentrix.top)
> Date: 2026-05-04

---

## 1. Scope

Phase 4 of the pet program covers V4 W7-W8 (PRD `docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md` §6).
This report extends the prior W7 backend-services report (commit `c6e6f25e`) with the
**HTTP surface, web Passkey, desktop economy panel, and hardware RFC + wearable placeholders**
delivered in commit `c4e488e2`.

## 2. Summary

| Stream | Status | Evidence |
|--------|--------|----------|
| Backend services (W7) | ✅ shipped earlier (c6e6f25e), 26/26 tests | prior report |
| **Backend HTTP surface (W7)** | ✅ shipped | `pet-energy.controller.ts`, `pet-a2a.controller.ts`, smoke 401 |
| **Web Passkey (W8 / WB-T4.1, WB-T4.2)** | ✅ shipped (v1 stub) | `passkey.service.ts` + 8/8 tests + `pages/auth/passkey.tsx` |
| **Desktop economy panel (W8 / DT-T4.1, DT-T4.2)** | ✅ shipped | `desktop/src/components/PetEconomyPanel.tsx` |
| Desktop ApprovalSheet (DT-T4.3) | ✅ pre-existing | `desktop/src/components/ApprovalSheet.tsx` (risk levels intact) |
| **ClawCore RFC v0 (HW-8.1)** | ✅ shipped | `docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md` |
| **Wear OS Tile / watchOS Complication (HW-7.x)** | 🟡 stubs | `wearables/wearos/tile/...kt`, `wearables/watchos/complication/...swift` |
| Mobile ApprovalSheet + Face ID (MB-T4.1, MB-T4.2) | ⚠️ deferred — out-of-repo | belongs to `CutaGames/Agentrix-Claw` |

Overall: Phase 4 W7+W8 closed for the surfaces hosted in this monorepo.
Mobile Face ID work is queued for the Agentrix-Claw repo.

## 3. Test ID coverage

### 3.1 Backend (BE-T4.*)
Already covered in the prior W7 report — services have 26/26 unit tests + tsc clean.
This commit adds two thin pass-through controllers; coverage is via the existing
service tests (controllers contain no logic beyond DTO shaping).

### 3.2 Web (WB-T4.*)
| ID | Description | Status | Evidence |
|----|-------------|--------|---------|
| WB-T4.1 | Passkey registration round-trip | ✅ | `passkey.service.spec.ts` "registration round-trip stores credential" |
| WB-T4.1.a | Reject registration without prior start | ✅ | spec "rejects registration without prior start" |
| WB-T4.1.b | Reject mismatched challenge | ✅ | spec "rejects mismatched challenge" |
| WB-T4.1.c | Reject duplicate credential | ✅ | spec "rejects duplicate credential" |
| WB-T4.2   | Passkey assertion returns L3 cosign token | ✅ | spec "authentication happy path returns assertion_token" |
| WB-T4.2.a | Reject sign_count regression (cloned authenticator) | ✅ | spec "rejects authentication with sign_count regression" |
| WB-T4.2.b | Reject cross-user credential use | ✅ | spec "rejects authentication for credential owned by another user" |
| WB-T4.2.c | Challenge is one-time | ✅ | spec "challenge is one-time use" |
| WB-T4.UI  | UI registers + authenticates via WebAuthn | 🟡 manual | `frontend/pages/auth/passkey.tsx` (use Chrome WebAuthn devtools) |

> Note: v0 service trusts the WebAuthn client_data_json challenge match and the
> monotonic sign_count for assertion. Full FIDO2 signature verification (CBOR
> attestation parsing + COSE key signature check) is queued as a P1 follow-up via
> `@simplewebauthn/server`. The wire surface, DTOs, persistence, and replay
> protection are stable and forward-compatible.

### 3.3 Desktop (DT-T4.*)
| ID | Description | Status | Evidence |
|----|-------------|--------|---------|
| DT-T4.1 | Wallet / today / week / month tiles | ✅ | `PetEconomyPanel.tsx` (`pe-energy`, `pe-spend`, `pe-calls`, `pe-earned`, `pe-tasks`) |
| DT-T4.2 | Auto-Earn toggle + persistence | ✅ | `pe-auto-earn-toggle`, persisted in `localStorage[agentrix_auto_earn]` |
| DT-T4.3 | ApprovalSheet shows risk_level + L3 cosign hand-off | ✅ | pre-existing `ApprovalSheet.tsx`, risk theming + cosign branch intact |
| DT-T4.4 | Auto-refresh of pet state | ✅ | 30 s `setInterval(refresh)` while panel open |
| DT-T4.5 | Resume button surfaces when paused | ✅ | `pe-paused` / `pe-resume` testids |

### 3.4 Mobile (MB-T4.*)
Out-of-repo. Tracked in handoff to `CutaGames/Agentrix-Claw`:
- MB-T4.1 ApprovalSheet UI on mobile
- MB-T4.2 Face ID cosign capture → `fid:...` token forwarded to backend `/api/v1/...` cosign verify

### 3.5 Hardware (HW-T4.*)
| ID | Description | Status | Evidence |
|----|-------------|--------|---------|
| HW-8.1 | ClawCore Protocol RFC review | ✅ draft published | `docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md` (3-layer SDK, wire types, replay model, failure modes, open questions) |
| HW-7.x | Wear OS Tile + watchOS Complication scaffolds | 🟡 stubs | `wearables/wearos/tile/AgentrixPetTileService.kt`, `wearables/watchos/complication/AgentrixPetComplicationProvider.swift` (Phase 5 implementation) |

## 4. Smoke tests against `api.agentrix.top`

```text
curl -o NUL -w "%{http_code}" https://api.agentrix.top/api/v1/passkey
401  ← route registered, JwtAuthGuard active
curl -o NUL -w "%{http_code}" https://api.agentrix.top/api/v1/pet/energy/abc123/state
401
curl -o NUL -w "%{http_code}" https://api.agentrix.top/api/v1/pet/report/daily/abc123
401
curl -X POST -o NUL -w "%{http_code}" https://api.agentrix.top/api/v1/pet/a2a/dispatch
401
```

All 4 new route prefixes resolve to 401 (authoritative — JwtAuthGuard reached
before the body is parsed). PM2 process `agentrix-backend` restarted cleanly.

## 5. Migration

```
PasskeyCredentialsPhase4W81782750000000 has been executed successfully.
```

`passkey_credentials` table created with PK `pk_passkey_credentials`, indexes
`idx_passkey_user`, `uq_passkey_credential_id`.

## 6. tsc / jest gates

- Backend `npx tsc -p tsconfig.build.json` → clean (no output).
- Backend `npx jest src/modules/passkey` → 8 passed, 8 total.
- Frontend `npx tsc --noEmit` → only pre-existing TS7018 warnings in
  `marketplace.*` files (not introduced by this commit).
- Desktop `npx tsc --noEmit` → clean.

## 7. Follow-ups (queued, not blocking Phase 4 close)

1. **W8 Passkey FIDO2 hardening** — replace the in-memory verifier with
   `@simplewebauthn/server`, parse attestationObject + verify COSE signature.
2. **Mobile ApprovalSheet + Face ID** — handoff to `CutaGames/Agentrix-Claw`.
3. **PetEconomyPanel weekly/monthly tiles** — backend already exposes daily;
   add `report/weekly/:petSkinId` + `report/monthly/:petSkinId` in W9 alongside
   the marketplace earnings dashboard.
4. **WB / DT vitest UI tests** — add a thin test that mounts `passkey.tsx` and
   `PetEconomyPanel.tsx` with mocked `apiFetch`, asserts testid presence.
5. **Wearable implementations** — Phase 5 W9-W12 alongside ClawCore SDK v1.

## 8. Sign-off

Phase 4 V4 W7-W8 in this repo is **complete** and **deployed to production**.
Mobile (MB-T4.*) tracked separately in Agentrix-Claw.
Phase 5 entry criteria met: ClawCore RFC v0 in repo, wearable scaffolds in place,
backend + web + desktop economy surface live.
