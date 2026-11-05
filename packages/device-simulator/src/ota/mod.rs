//! The device side of the signed OTA manifest (`shared/types/gadget-firmware.ts`, "Signed OTA manifest v1").
//!
//! The device installs an image only when ALL of this holds, checked in this order:
//! 1. the manifest names a key id the device has pinned (the keys are handed in by the caller, none is built in);
//! 2. the Ed25519 signature verifies over the eight-line message ([`manifest::signing_message`]);
//! 3. the signed device class is this device's class;
//! 4. the version is strictly newer than the running one (no same-version re-install, no downgrade);
//! 5. the version is strictly newer than the highest version this device ever accepted (the anti-rollback counter, so a
//!    board reset to an old image still cannot be walked back);
//! 6. the device is at or above the signed floor `min_version`;
//! 7. every chunk matches its hash, the sizes add up, and the whole image has the signed SHA-256.
//!
//! The running version and the counter change only after step 7, in one assignment, so an interrupted or refused update
//! leaves the device exactly as it was.

pub mod device;
pub mod manifest;

pub use device::{ChunkSource, InstallReceipt, OtaChunk, OtaDevice, PinnedKey};
pub use manifest::{parse_version, signing_message, OtaManifest, OtaRefusal};
