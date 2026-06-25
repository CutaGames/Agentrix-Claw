# Phase 5 Follow-On Validation Report

**Date**: 2026-05-06
**Branch**: `v3-p0-w1-presence-contracts`
**Commits**: `c3f81e18` (Phase 5 software slice) → `25e269b3` (report) → **`bc0a???` feat** → **`79e0c24f` chore (force-add scripts)**
**Server**: `47.130.176.148` (`api.agentrix.top`), PM2 `agentrix-backend`
**Migration applied**: `PartnerInquiriesPhase5W121782770000000`

---

## Scope

Follow-on slice covering items left after the Phase 5 software-only landing:

| Track | Item | Status |
|-------|------|--------|
| EMQX broker | Operator config + ACL + apply/smoke scripts | ✅ committed (not yet applied to live broker) |
| MQTT authn | `POST /v1/devices/mqtt/authn` PUBLIC endpoint per EMQX 5 HTTP authn protocol | ✅ deployed |
| Bridge SDK | Cross-platform `ClawCoreBridge` interface contracts (TS / Kotlin / Swift / Rust) | ✅ committed |
| Cert dashboard | Auto-generated `clawcore-cert.json` + `/developers/cert` page | ✅ deployed |
| Partner inquiry | `POST /v1/partners/inquiry` PUBLIC capture endpoint + DB table | ✅ deployed |

Mobile RN/Expo work (`MB-7.x`, `MB-9.x`) remains in `CutaGames/Agentrix-Claw` per `.github/copilot-instructions.md` and is intentionally deferred.

---

## Deliverables

### 1. EMQX broker config (committed, **not yet applied**)

`scripts/clawcore-mqtt/`:
- `README.md` — operator runbook + topic vocabulary (`agentrix/devices/${clientid}/{up,down,presence,ota}`)
- `emqx.conf` — HOCON: TLS listener `:8883` + WSS `:8084` (Let's Encrypt certs at `/etc/letsencrypt/live/api.agentrix.top/`); HTTP authn → `https://api.agentrix.top/api/v1/devices/mqtt/authn`; file-based ACL with `no_match=deny`
- `acl.conf` — admin user `agentrix-admin` full access; devices may publish only their own `…/up|presence`, subscribe only their own `…/down|ota`; catch-all deny
- `apply.sh` — `scp` configs + `sudo emqx ctl conf reload || sudo systemctl restart emqx`
- `client_test.sh` — `mosquitto_pub`/`mosquitto_sub` smoke against TLS listener

> Application to a live EMQX broker is opt-in; touches shared infra and requires user authorization.

### 2. MQTT HTTP authn endpoint (deployed)

`backend/src/modules/device-registry/mqtt-authn.controller.ts`
- `@Controller('v1/devices/mqtt')` POST `authn` — **PUBLIC** (no `JwtAuthGuard`); EMQX broker calls it on every CONNECT
- Request: `{ username, password, clientid }` — `username == clientid == device_id`
- Compares `sha256(password)` to `device.dst_hash` via `crypto.timingSafeEqual` (constant-time)
- On allow: marks `device.online=true`, refreshes `last_seen_at`
- Response shape per EMQX 5: `{ result: 'allow' | 'deny' }`
- Tests: 5/5 passing — bad input → deny; unknown device → deny; wrong dst → deny; correct dst → allow + presence updated; revoked device → deny

### 3. Bridge SDK interface contracts (committed)

`shared/clawcore/v1/bridge.{ts,android.kt,ios.swift,desktop.rs}` — canonical cross-language contract that every native bridge must implement:
- `init(config) → void`
- `scan(timeoutMs) → PairTicket[]`
- `pair(ticket) → PairResult { device_id, dst }`
- `connect(device_id) / disconnect(device_id)`
- `sendApprovalResponse(req_id, decision)`
- `sendEvent(name, payload)`
- `beginOta(manifest_url, expected_sha256)`
- Stream: `on(event)` / `Flow<BridgeEvent>` / `AnyPublisher` / `mpsc::Receiver`
- `BridgeEvent` union: `pairResult | event | approvalRequest | otaProgress | error | presenceChanged`
- Standardised `BridgeErrorCodes`: `NOT_INITIALISED | TRANSPORT_UNAVAILABLE | PAIR_TICKET_INVALID | AUTH_REJECTED | REPLAY_DETECTED | OTA_INTEGRITY_FAIL | OTA_RESUMED | TIMEOUT`

These files are reference contracts; concrete native implementations (Android BLE bridge, iOS BLE bridge, Tauri serial bridge) live in `MB-9.x` / `HW-10.4-6` and remain pending.

### 4. ClawCore certification dashboard (deployed)

- `scripts/clawcore-cert/build-dashboard.mjs` — runs `npx jest src/modules/device-registry/clawcore-cert.suite --json`, parses `assertionResults`, groups by suite (`describe`), extracts `CERT-NNN` IDs, emits `frontend/public/clawcore-cert.json`
- `frontend/public/clawcore-cert.json` — current snapshot: **total=100, passed=22, failed=0, todo=78**
- `frontend/pages/developers/cert.tsx` — fetches the JSON; renders 4 summary tiles + per-group lists with status badges; data-testids `cert-title|cert-summary|cert-group|cert-item`

> Future: hook the exporter into CI so the JSON is regenerated on every backend test run.

### 5. Partner inquiry capture (deployed)

- `backend/src/entities/partner-inquiry.entity.ts` — `partner_inquiries` (id, name, email, company, expected_volume, status `new`, created_at)
- `backend/src/modules/partner-inquiry/partner-inquiry.controller.ts` — `@Controller('v1/partners')` POST `inquiry` — **PUBLIC**; validates `name|email|company` non-empty; email regex `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`; length-slices fields; returns `{ ok: true, id }`
- Migration: `1782770000000-PartnerInquiriesPhase5W12.ts` — applied on remote
- Frontend `pages/hardware/index.tsx` already POSTs to this endpoint (best-effort, UI succeeds either way)

---

## Validation Gates

### Local

```
backend $ npx tsc -p tsconfig.build.json   # clean (after rm tsbuildinfo + dist)
backend $ npx jest src/modules/device-registry src/modules/partner-inquiry
   Test Suites: 4 passed, 4 total
   Tests:       78 todo, 37 passed, 115 total
frontend $ npx tsc --noEmit                # clean for new pages
```

### Remote build & migration

```
HEAD is now at 79e0c24f chore(phase5): EMQX broker config + cert dashboard exporter
✅ Build succeeded: dist/main.js (7884 bytes)
Migration PartnerInquiriesPhase5W121782770000000 has been executed successfully.
[PM2] [agentrix-backend] online
```

### Live smoke (`api.agentrix.top`)

| Endpoint | Body | Status | Body |
|----------|------|--------|------|
| `POST /v1/devices/mqtt/authn` | `{}` | **200** | `{"result":"deny"}` |
| `POST /v1/partners/inquiry` | `{}` | **400** | `name, email, company required` |
| `POST /v1/partners/inquiry` | valid | **201** | `{"ok":true,"id":"1c7a3849-…"}` |

All three behave per spec.

---

## Deferred / Not Done

- Live EMQX broker apply (config files committed; `apply.sh` ready but not run — touches shared infra)
- Native bridge implementations (Android/iOS/Tauri) — `MB-9.x`, `HW-10.4-6`
- Mobile UX work in `CutaGames/Agentrix-Claw` — `MB-7.x`
- Firmware (`HW-10.2/10.3`) and Glass (`GL-11.x`) — physical hardware required
- CI hook for `build-dashboard.mjs` — manual run only for now

---

## Branch Status

`v3-p0-w1-presence-contracts` @ `79e0c24f` — pushed, deployed, smoke green.
