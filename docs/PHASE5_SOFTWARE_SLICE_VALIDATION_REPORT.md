# Phase 5 — Software Slice Validation Report

> Branch: `v3-p0-w1-presence-contracts` · Commit: `c3f81e18` · Server: `47.130.176.148` (api.agentrix.top)
> Date: 2026-05-06 · Scope: Phase 5 W9-W12 software-only deliverables

---

## 1. Scope

Phase 5 (PRD `docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md` §8) is the **camera scan + ClawCore SDK v1 + first wave of co-branded hardware** phase. Most W11/W12 items require physical devices (ESP32 boards, nRF52, BLE radios, XReal Glass, partner ODM samples). This commit ships every **software-only** item that can be reviewed and merged without hardware in the loop, plus the test scaffolds the partner test rigs will fill in during W11-W12.

Out-of-scope here (deferred to dedicated work or to the Agentrix-Claw repo):
- MB-9.1/9.2/9.3 mobile camera scan UI → **CutaGames/Agentrix-Claw**
- HW-10.2/10.3 esp32-rs / nRF52 firmware → physical device + hardware contractor
- HW-10.4/10.5 Android / iOS Bridge SDK builds → physical device
- HW-11.1/11.2/11.4 L2 reference firmware + OTA on partner samples → physical device
- GL-11.1-11.4 Glass HUD on XReal Light 3 → physical glasses
- BD partner onboarding (HW-11.3 / HW-11.5 / HW-12.1 / HW-12.2)

## 2. Summary

| Stream | Status | Evidence |
|--------|--------|----------|
| HW-10.1 ClawCore proto v1 (JSON Schema + TS) | ✅ | `shared/clawcore/v1/*.schema.json` + `index.ts` |
| BE-10.1 MQTT topic constants | ✅ | `ClawCoreTopics` in `shared/clawcore/v1/index.ts` |
| BE-10.2 Device registry + DST | ✅ | `device-registry.service.ts` + 7/7 spec |
| BE-10.3 OTA chunk service (L1) | ✅ | `ota.service.ts` + 3/3 spec |
| BE-10.x REST surface | ✅ | `device-registry.controller.ts` (5 routes, all 401-gated) |
| HW-12.4 100-item cert suite scaffold | ✅ | `clawcore-cert.suite.spec.ts` — 22 implemented + 78 todo |
| HW-12.3 Developer portal v1 | ✅ | `frontend/pages/developers/index.tsx` |
| WB-12.1 Co-branded hardware store | ✅ | `frontend/pages/hardware/index.tsx` |
| MB-9.x mobile scan UI | ⏸️ deferred | Agentrix-Claw repo |
| HW-10.2-10.6 firmware + native bridges | ⏸️ deferred | physical hardware |
| GL-11.x Glass HUD | ⏸️ deferred | physical XReal |

## 3. Test ID coverage

### 3.1 BE / HW unit tests (Phase 5)
| ID | Description | Status | Evidence |
|----|-------------|--------|---------|
| BE-T5.pair.1 | issueTicket → pair round-trip mints unique DST | ✅ | `device-registry.service.spec.ts` |
| BE-T5.pair.2 | rejects ticket re-use | ✅ | spec |
| BE-T5.pair.3 | rejects pairing same device under another user | ✅ | spec |
| HW-T5.9     | replay nonce + forged HMAC rejected | ✅ | spec "verifyAttestation accepts correct HMAC and rejects nonce replay" + "rejects forged HMAC" |
| BE-T5.revoke | revoke clears DST hash | ✅ | spec |
| BE-T5.presence | markPresence updates online + lastSeenAt | ✅ | spec |
| HW-T5.8 / T5.15 (logical) | OTA publish → manifest → chunk round-trip + integrity | ✅ | `ota.service.spec.ts` |
| HW-T5.8.b | OTA rejects out-of-range chunk | ✅ | spec |
| HW-T5.8.c | manifestFor throws when none present | ✅ | spec |

### 3.2 ClawCore certification suite (HW-T5.10 — 100 items)

| Group | Range | Implemented | Todo |
|------|-----|------------:|-----:|
| A. Wire format          | CERT-001..020 | 12 | 8 |
| B. Replay + attestation | CERT-021..040 | 5  | 15 |
| C. Pairing              | CERT-041..055 | 2  | 13 |
| D. OTA                  | CERT-056..070 | 3  | 12 |
| E. Timing + latency     | CERT-071..080 | 0  | 10 |
| F. Physical + energy    | CERT-081..100 | 0  | 20 |
| **Total**               | **100**       | **22** | **78** |

22 software-tractable certifications **pass green today**. The 78 `it.todo` items are correctly registered (counted by jest as `todo`) so the partner cert dashboard can track filling-rate as physical test rigs land in W11-W12.

## 4. Smoke tests against `api.agentrix.top`

```text
GET  /api/v1/devices                               → 401  (route registered, JwtAuthGuard active)
POST /api/v1/devices/pair/ticket                   → 401
GET  /api/v1/ota/manifest?device_class=claw_stick  → 401
```

## 5. Migrations

```
ClawCoreDevicesAndOtaPhase5W101782760000000 has been executed successfully.
```
- `clawcore_devices` (idx_clawcore_devices_user, uq_clawcore_devices_device_id)
- `clawcore_ota_packages` (idx_clawcore_ota_class_channel, uq_clawcore_ota_class_version)

## 6. Build gates

- backend `npx tsc -p tsconfig.build.json` → clean
- backend `npx jest src/modules/device-registry` → **10 passed / 10 total**
- backend `npx jest …/clawcore-cert.suite` → **22 passed + 78 todo / 100 total**
- backend `npm run build` (server) → `dist/main.js` produced

## 7. Phase 5 Exit-Gate readiness check

| # | Exit condition | Status |
|:-:|----------------|--------|
| 1 | 摄像头扫描 95% 成功率 | ⏸️ requires Agentrix-Claw mobile work |
| 2 | ClawCore SDK 通过认证试点 ≥ 3 家 | 🟡 cert scaffold ready (22/100); needs partner samples |
| 3 | Glass HUD 30 分钟无漂移 | ⏸️ requires XReal hardware |
| 4 | 联名首发合作方上架 ≥ 1 款，pair ≥ 99% | 🟡 store page + inquiry form live; partner sourcing in progress |
| 5 | OTA 升级成功率 ≥ 99% | 🟡 backend chunked service shipped; needs physical OTA rig |
| 6 | 开发者门户可注册 + 下载 SDK + 提交认证 | ✅ portal v1 published (sign-up via mailto v1; self-serve form is W12 follow-up) |

## 8. Follow-ups

1. **MB-9.x mobile scan** — handoff to `CutaGames/Agentrix-Claw` (see §9 of this report).
2. **Firmware (HW-10.2/10.3)** — needs hardware contractor + esp32 / nRF52 boards.
3. **Native Bridges (HW-10.4/10.5)** — needs Android Studio / Xcode build envs + signing certs.
4. **Glass HUD (GL-11.x)** — needs XReal Light 3 + ARKit/OpenXR setup.
5. **MQTT broker (BE-10.1 runtime)** — current commit defines topics + presence helper; production needs EMQX deploy + TLS + ACL config.
6. **Cert dashboard** — wire `clawcore-cert.suite.spec.ts` jest output → JSON → public partner page.

## 9. Mobile handoff (Agentrix-Claw repo)

Open at end of this commit (`c3f81e18`):
- **Phase 4 carry-over**: MB-7.1 ApprovalSheet RN component + MB-7.2 Face ID cosign
- **Phase 5**: MB-9.1 6-view camera wizard + MB-9.2 Expo Camera preprocessing + MB-9.3 progress page

To resume: clone `git@github.com:CutaGames/Agentrix-Claw.git` and continue from there.

## 10. Sign-off

Phase 5 software-only deliverables are **complete and deployed to production**.
Hardware + mobile + glass items are documented as deferred with concrete entry criteria. Phase 5 Exit-Gate items 1-5 unblocked once physical / mobile workstreams complete; item 6 already met for portal v1.
