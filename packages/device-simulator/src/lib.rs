//! Software simulator of an Agentrix hardware device (L8 batch 4, lane 4B hw, B5).
//!
//! It exists so the device side of the hardware contracts can be tested in CI without a board (T22, T24):
//!
//! * [`identity`]: a P-256 device key made at run time, the self-certifying device id, and the pairing proof of possession
//!   (`shared/types/device-pairing-proof.ts`).
//! * [`capability`]: a capability declaration signed with that key (`shared/types/device-capability.ts`, message of five lines).
//! * [`ota`]: the signed OTA manifest of `shared/types/gadget-firmware.ts`. The device installs only a manifest signed by a key
//!   it has pinned, only a version strictly newer than both the running one and the highest it ever accepted (the anti-rollback
//!   counter), and only an image whose size and SHA-256 are the signed ones.
//! * [`eink`]: pulls today's bookings through a trait and renders the e-ink day view of `shared/types/device-gateway-g1.ts`.
//!
//! No real key lives here. Nothing is stored on disk and nothing talks to a network: the platform side is a trait or a
//! plain JSON value, so every test runs offline.

pub mod canonical;
pub mod capability;
pub mod eink;
pub mod identity;
pub mod ota;
pub mod timeutil;

use std::fmt;

/// Errors of the simulator itself (not the refusals the contracts define, which have their own enums).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SimError {
    /// The crypto library refused (key generation, signing).
    Crypto,
    /// An input was not acceptable; the text names which one.
    Invalid(&'static str),
}

impl fmt::Display for SimError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SimError::Crypto => write!(f, "crypto operation failed"),
            SimError::Invalid(what) => write!(f, "invalid input: {what}"),
        }
    }
}

impl std::error::Error for SimError {}
