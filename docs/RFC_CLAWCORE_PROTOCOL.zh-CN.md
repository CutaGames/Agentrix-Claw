# RFC: ClawCore Protocol v0 (Phase 4 W7 — HW-8.1)

> Status: **Draft / Phase 4 review** · Owners: `@hardware` `@shared`
> Target audience: hardware partners, mobile/desktop/wearable engineers, security review

ClawCore is the protocol + SDK boundary that lets Agentrix pets cross from
the cloud + app surfaces onto **physical devices** (smart toys, wearables,
ambient displays, controllers). It defines **how a pet identity, energy
budget, approval state, and event stream are projected onto a device** with
strong replay/forgery protection and clear capability scoping.

This RFC freezes the **v0 surface** that Phase 5 (W9-W12) will implement in
Rust.

---

## 1. Goals

1. Single canonical wire format for "pet on device" — no per-vendor forks.
2. Three SDK layers (per PRD §3.3): a **transport** layer, a **protocol**
   layer, and a **policy** layer. Vendors implement transport, link against
   protocol crate, configure policy per device class.
3. Energy + risk + approval state **only ever flow downstream** from
   Agentrix backend. Devices may **request** but never authoritatively mutate.
4. L3 cosign artifacts (mobile Face ID + web Passkey assertion tokens)
   travel as opaque opaque blobs through devices — devices never see private
   key material.

## 2. Non-goals (v0)

- 3-D rendering / pet skin assets (handled by Agentrix mobile / Tauri apps).
- Voice / camera streaming (deferred to Phase 5+).
- Peer-to-peer device → device relay (deferred to Phase 6+).

## 3. Three-layer SDK

```
┌──────────────────────────────────────────────────┐
│ Layer 3 — POLICY                                 │
│ • risk_level mapping → device UX                 │
│ • auto-earn local toggle, energy display rules   │
│ • L3 capture: trigger Face ID / Passkey via app  │
├──────────────────────────────────────────────────┤
│ Layer 2 — PROTOCOL                               │
│ • PetState, PetEvent, ApprovalRequest schemas    │
│ • Replay protection (nonce + monotonic seq)      │
│ • Server-issued device session token (DST)       │
├──────────────────────────────────────────────────┤
│ Layer 1 — TRANSPORT                              │
│ • WS, BLE GATT, MQTT/QUIC adapters               │
│ • Frame: { len:u16, type:u8, body:bytes, crc:u32 }│
└──────────────────────────────────────────────────┘
```

Each layer is a separate Rust crate so vendors can pick (e.g. BLE-only).

## 4. Wire types (Protocol layer)

All payloads are **JSON** in v0; v1 (Phase 5) adds Protobuf in parallel.
Snake_case keys throughout.

### 4.1 `pet_state` (server → device, broadcast)

```json
{
  "type": "pet_state",
  "seq": 412,
  "pet_skin_id": "pet_a1b2c3",
  "energy": 78,
  "paused": false,
  "paused_reason": null,
  "daily_spend_cents": 230,
  "ts": 1754000000000
}
```

### 4.2 `pet_event` (server → device)

```json
{
  "type": "pet_event",
  "seq": 413,
  "pet_skin_id": "pet_a1b2c3",
  "kind": "task_completed | task_failed | reward_earned | risk_paused",
  "amount_cents": 50,
  "message": "earned 50¢ from skill x"
}
```

### 4.3 `approval_request` (server → device)

```json
{
  "type": "approval_request",
  "seq": 414,
  "request_id": "req_xyz",
  "risk_level": "L1 | L2 | L3",
  "summary": "spend $0.50 on llm",
  "amount_cents": 50,
  "deadline_ts": 1754000060000
}
```

Devices that cannot capture L3 cosign **must** show "Open phone to confirm"
and forward the `request_id` via QR or BLE handshake to the paired mobile.

### 4.4 `approval_response` (device → server)

```json
{
  "type": "approval_response",
  "request_id": "req_xyz",
  "decision": "approve | deny",
  "cosign_token": "fid:....  | pk:....",   // L3 only
  "device_attestation": "<DST-derived HMAC of (request_id|decision|nonce)>"
}
```

## 5. Replay + identity model

- Each device pairs once via **QR-driven handshake** (existing flow in
  `desktop-pair` / mobile). Server issues a **Device Session Token (DST)**
  scoped to one `(user_id, device_id)`.
- DST is HMAC-SHA256 keyed; device stores derived key in secure element when
  available, falling back to OS keychain.
- Every device → server frame carries `nonce: u64` (monotonic per session).
  Server rejects gaps > 64 and duplicates.

## 6. Failure modes

| Class | Behaviour |
|------|----------|
| transport disconnect | device shows last known `pet_state` for ≤ 60 s, then dims |
| missed `pet_state` for > 5 min | device displays "Sync paused" |
| `paused` flips to `true` | LED ring red, motion stops, controller buttons greyed |
| approval timeout | device clears UI, no decision sent |

## 7. Open questions for Phase 5

1. Should `pet_event` frames be batched on BLE links to save power?
2. Do we ship a JSON Schema **and** Protobuf simultaneously, or stage?
3. How do we revoke a DST when a phone is lost? — proposal: server-pushed
   `dst_revoked` frame + grace timer.

## 8. Test plan link

Phase 5 testing: see PRD test plan §8.2 ("ClawCore SDK 测试").
Phase 6 certification: 100-item L3 cert suite (QA-12.2).

---

*This RFC is the authoritative source for v0. Updates require a PR with
`@hardware` + `@ceo` review.*
