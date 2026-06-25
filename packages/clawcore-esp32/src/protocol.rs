// SPDX-License-Identifier: Apache-2.0
// Layer 2 — PROTOCOL
//
// JSON wire types lifted verbatim from RFC_CLAWCORE_PROTOCOL.zh-CN.md §4.
// Snake_case mandatory; serde rename_all = "snake_case" enforces it.
//
// Replay protection (RFC §5):
//   • monotonic per-session `seq` on server → device frames
//   • monotonic per-session `nonce` on device → server frames
//   • every device → server frame carries `device_attestation` =
//       HMAC-SHA256(dst_key, request_id || decision || nonce)

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct PetState<'a> {
    #[serde(rename = "type")]
    pub kind: &'a str, // always "pet_state"
    pub seq: u64,
    pub pet_skin_id: &'a str,
    pub energy: u8,
    pub paused: bool,
    pub paused_reason: Option<&'a str>,
    pub daily_spend_cents: u32,
    pub ts: u64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct PetEvent<'a> {
    #[serde(rename = "type")]
    pub kind: &'a str, // always "pet_event"
    pub seq: u64,
    pub pet_skin_id: &'a str,
    pub event: &'a str, // task_completed | task_failed | reward_earned | risk_paused
    pub amount_cents: u32,
    pub message: Option<&'a str>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalRequest<'a> {
    #[serde(rename = "type")]
    pub kind: &'a str, // always "approval_request"
    pub seq: u64,
    pub request_id: &'a str,
    pub risk_level: &'a str, // L1 | L2 | L3
    pub summary: &'a str,
    pub amount_cents: u32,
    pub deadline_ts: u64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalResponse<'a> {
    #[serde(rename = "type")]
    pub kind: &'a str, // always "approval_response"
    pub request_id: &'a str,
    pub decision: &'a str, // approve | deny
    pub cosign_token: Option<&'a str>, // L3 only — opaque blob (fid:.. / pk:..)
    pub device_attestation: &'a str,   // hex/base64 HMAC of (request_id|decision|nonce)
}

/// Server's monotonic-seq tracker. Rejects gaps > 64 and duplicates per RFC §5.
#[derive(Default)]
pub struct SeqWindow {
    last: u64,
    initialised: bool,
}

impl SeqWindow {
    pub fn accept(&mut self, seq: u64) -> Result<(), crate::ClawCoreError> {
        if !self.initialised {
            self.last = seq;
            self.initialised = true;
            return Ok(());
        }
        if seq <= self.last {
            return Err(crate::ClawCoreError::NonceReplay);
        }
        if seq - self.last > 64 {
            return Err(crate::ClawCoreError::NonceGap);
        }
        self.last = seq;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seq_window_rejects_replay() {
        let mut w = SeqWindow::default();
        w.accept(10).unwrap();
        w.accept(11).unwrap();
        assert!(matches!(w.accept(11), Err(crate::ClawCoreError::NonceReplay)));
    }

    #[test]
    fn seq_window_rejects_gap() {
        let mut w = SeqWindow::default();
        w.accept(10).unwrap();
        assert!(matches!(w.accept(200), Err(crate::ClawCoreError::NonceGap)));
    }
}
