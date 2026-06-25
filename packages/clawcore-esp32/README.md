# clawcore-esp32 — Reference firmware skeleton (Phase 5 W9)

> ⚠️ Skeleton only — does **not** flash a board out-of-tree. Concrete
> `esp-hal` BSP wiring lands in **Phase 5 W10**. Until then this crate
> exists to:
>
> 1. Pin the public Rust surface for `clawcore-protocol` so partner
>    firmware (nRF52, Zephyr, etc.) can start vendor branches.
> 2. Mirror the wire types in [`docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md`](../../docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md)
>    one-to-one so the cert suite ([backend/src/modules/device-registry/clawcore-cert.suite.spec.ts](../../backend/src/modules/device-registry/clawcore-cert.suite.spec.ts)) has a counterpart.
> 3. Give @hardware a single review surface for the layered crate split
>    (transport / protocol / policy).

## Layout

```
packages/clawcore-esp32/
├── Cargo.toml         # Pinned deps; embassy + esp-hal targets in W10
├── README.md          # this file
└── src/
    ├── lib.rs         # crate root, public types
    ├── hal.rs         # Hardware trait — BSPs implement
    ├── transport.rs   # Layer 1 — frame format + Transport trait
    ├── protocol.rs    # Layer 2 — JSON wire shapes from RFC §4
    └── policy.rs      # Layer 3 — risk_level → on-device UX
```

## Roadmap

| Phase | Item | Owner | ETA |
|---|---|---|---|
| 5 W9  | This skeleton + RFC review                                    | @hardware | DONE  |
| 5 W10 | esp-hal BSP for ESP32-S3 + WS adapter                         | @hardware | W10   |
| 5 W10 | Host-test loopback (`cargo test`) so wire format is verifiable | @hardware | W10   |
| 5 W11 | BLE GATT adapter                                              | @hardware | W11   |
| 5 W11 | nRF52 sister crate (`clawcore-nrf-ref`) consuming protocol/   | community | W11   |
| 5 W12 | MQTT adapter for ClawSpeaker class devices                    | @hardware | W12   |
| 6 W?  | `policy-l3-capture` (on-device cosign) once SE pipeline lands | @security | TBD   |

## Mapped to RFC sections

| RFC §  | Source file              |
|--------|---------------------------|
| §3     | `lib.rs`, `transport.rs`, `protocol.rs`, `policy.rs` (layer split) |
| §4.1–4 | `protocol.rs` (`PetState`, `PetEvent`, `ApprovalRequest`, `ApprovalResponse`) |
| §5     | `protocol.rs::SeqWindow` (replay) + `lib.rs::DeviceIdentity` (DST) |
| §6     | `policy.rs::Policy::on_pause` / `on_sync_paused` |

## Why no `main.rs` yet

The W9 skeleton does not include a `main.rs` because Embassy's
`#[embassy_executor::main]` requires the concrete BSP target chosen during
W10. Shipping a stub `main.rs` would force every partner consuming this
crate via path dep to deal with a phantom binary; we keep it as a `lib`
crate until W10.

## Cert suite handshake

Backend cert suite `clawcore-cert.suite.spec.ts` already exercises the
wire format via the desktop bridge. Once W10 lands the host loopback,
those tests gain a Rust-side mirror so JSON Schema → Rust type drift is
caught at CI time.
