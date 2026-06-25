// SPDX-License-Identifier: Apache-2.0
// Agentrix ClawCore ESP32 reference firmware — Phase 5 W9 skeleton.
//
// This file intentionally targets **#![no_std]** so the reference firmware
// can move directly to esp-hal/Embassy without macro reshuffling. For the
// W9 skeleton we keep the surface compileable as host-tests via
// `cargo test --features host-tests` (added in W10 once the loopback
// harness lands).
//
// Layered exactly per RFC_CLAWCORE_PROTOCOL.zh-CN.md §3:
//   • mod transport — Layer 1 (WS / BLE GATT / MQTT adapters)
//   • mod protocol  — Layer 2 (PetState / PetEvent / Approval JSON frames)
//   • mod policy    — Layer 3 (risk_level mapping → on-device UX)
//
// All wire shapes mirror RFC §4 verbatim. JSON only in v0; Protobuf is
// added in parallel during Phase 5+ once the schema freezes.

#![cfg_attr(not(test), no_std)]
#![allow(dead_code)]

pub mod hal;
pub mod transport;
pub mod protocol;
pub mod policy;

/// Static identity for the device itself. Provisioned during the QR-driven
/// pairing handshake (RFC §5). The `dst_key` is HMAC-SHA256 keyed material
/// stored in secure element when available, OS keychain otherwise.
pub struct DeviceIdentity<'a> {
    pub device_id: &'a str,
    pub user_id: &'a str,
    pub dst_key: &'a [u8; 32],
}

/// Top-level firmware error surface. Every layer maps into this so the
/// main loop can render a consistent failure UX (RFC §6).
#[derive(Debug)]
pub enum ClawCoreError {
    Transport,
    DecodeFrame,
    NonceReplay,
    NonceGap,
    BadHmac,
    Timeout,
    PolicyReject,
}

impl core::fmt::Display for ClawCoreError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(match self {
            ClawCoreError::Transport    => "transport",
            ClawCoreError::DecodeFrame  => "decode_frame",
            ClawCoreError::NonceReplay  => "nonce_replay",
            ClawCoreError::NonceGap     => "nonce_gap",
            ClawCoreError::BadHmac      => "bad_hmac",
            ClawCoreError::Timeout      => "timeout",
            ClawCoreError::PolicyReject => "policy_reject",
        })
    }
}
