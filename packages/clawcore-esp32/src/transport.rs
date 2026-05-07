// SPDX-License-Identifier: Apache-2.0
// Layer 1 — TRANSPORT
//
// Three concrete adapters share a single `Transport` trait so `protocol`
// and `policy` are unaware of how bytes move. Phase 5 W9 ships the trait
// + a loopback impl; W10/W11 ship WS, BLE GATT, and MQTT bindings against
// the @hardware reference target.
//
// Wire frame (RFC §3):
//   { len:u16, type:u8, body:bytes, crc:u32 }

use crate::ClawCoreError;

/// Maximum body size for a single frame on the wire. Sized to fit the
/// largest realistic JSON payload (`approval_request` w/ summary string)
/// while still flowing through a single BLE GATT MTU on most chipsets.
pub const MAX_FRAME_BODY: usize = 512;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum FrameType {
    PetState        = 0x01,
    PetEvent        = 0x02,
    ApprovalRequest = 0x03,
    ApprovalResponse= 0x83,
    Hello           = 0xF0,
    Heartbeat       = 0xF1,
    DstRevoked      = 0xFE,
}

#[async_trait::async_trait(?Send)]
pub trait Transport {
    async fn send(&mut self, frame_type: FrameType, body: &[u8]) -> Result<(), ClawCoreError>;
    async fn recv<'a>(
        &mut self,
        buf: &'a mut [u8; MAX_FRAME_BODY],
    ) -> Result<(FrameType, &'a [u8]), ClawCoreError>;
}

/// CRC-32 helper used by every transport adapter to seal frames. We pick
/// the standard IEEE polynomial so it matches the desktop / mobile bridge
/// implementations bit-for-bit (validated by `clawcore-test-suite`).
pub fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &b in data {
        crc ^= b as u32;
        for _ in 0..8 {
            let mask = -((crc & 1) as i32) as u32;
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}
