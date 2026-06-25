// SPDX-License-Identifier: Apache-2.0
// Hardware abstraction surface — kept intentionally thin so the same
// protocol crate can target ESP32-S3 (esp-hal), nRF52 (Zephyr/Embassy),
// and host-test loopback without code changes.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DeviceUx {
    pub label: &'static str,
    pub led_ring_color: (u8, u8, u8),
    pub motion_enabled: bool,
    pub controls_enabled: bool,
}

impl DeviceUx {
    pub const IDLE: DeviceUx = DeviceUx {
        label: "",
        led_ring_color: (0, 0, 0),
        motion_enabled: false,
        controls_enabled: false,
    };
}

/// Minimal hardware contract — concrete impls land in:
///   • `bsp/esp32s3.rs`  — Phase 5 W10
///   • `bsp/nrf52.rs`    — Phase 5 W11
///   • `bsp/host.rs`     — host-test loopback (W9)
pub trait Hardware {
    fn paint(&mut self, ux: &DeviceUx);
    fn buzz(&mut self, ms: u16);
    fn battery_pct(&self) -> u8;
}
