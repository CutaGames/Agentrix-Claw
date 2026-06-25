// SPDX-License-Identifier: Apache-2.0
// Layer 3 — POLICY
//
// Maps RFC §6 failure-mode behaviour and §3.5 risk levels onto the device
// HAL. Vendors may override `Policy::risk_to_ux` per device class
// (e.g. eink display vs LED ring).

use crate::hal::DeviceUx;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum RiskLevel { L1, L2, L3 }

impl RiskLevel {
    pub fn parse(s: &str) -> Option<RiskLevel> {
        match s {
            "L1" => Some(Self::L1),
            "L2" => Some(Self::L2),
            "L3" => Some(Self::L3),
            _ => None,
        }
    }
}

pub trait Policy {
    fn risk_to_ux(&self, level: RiskLevel) -> DeviceUx;

    /// L3 cosign capture is **not** done on-device in v0 (devices are
    /// "passthru only"). When `policy-l3-capture` feature lands in
    /// Phase 5+, override this with secure-element backed flow.
    fn supports_l3_local_capture(&self) -> bool { false }

    /// Behaviour when the server's `pet_state.paused` flips to `true`
    /// (RFC §6 third row): LED ring red, motion stops, controls greyed.
    fn on_pause(&self, ux: &mut DeviceUx) {
        ux.led_ring_color = (255, 0, 0);
        ux.motion_enabled = false;
        ux.controls_enabled = false;
    }

    /// Sync-paused fallback after no `pet_state` for > 5 min (RFC §6 row 2).
    fn on_sync_paused(&self, ux: &mut DeviceUx) {
        ux.label = "Sync paused";
        ux.led_ring_color = (60, 60, 60);
    }
}

/// Default policy used by the L1/L2 reference toy. L3 cert-target devices
/// override this with their own implementation.
pub struct DefaultPolicy;

impl Policy for DefaultPolicy {
    fn risk_to_ux(&self, level: RiskLevel) -> DeviceUx {
        match level {
            RiskLevel::L1 => DeviceUx { label: "Tap to approve",      led_ring_color: (60, 200, 60),  motion_enabled: true,  controls_enabled: true },
            RiskLevel::L2 => DeviceUx { label: "Confirm on watch",    led_ring_color: (240, 180, 60), motion_enabled: true,  controls_enabled: true },
            RiskLevel::L3 => DeviceUx { label: "Open phone to confirm", led_ring_color: (255, 80, 80), motion_enabled: false, controls_enabled: false },
        }
    }
}
