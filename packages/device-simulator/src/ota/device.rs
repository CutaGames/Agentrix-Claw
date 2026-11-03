//! The device: pinned keys, the running version, the anti-rollback counter, and the install steps.

use super::manifest::{parse_version, signing_message, OtaManifest, OtaRefusal};
use crate::canonical::{hex_decode, sha256_hex};
use crate::SimError;
use base64::{engine::general_purpose::STANDARD, engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::Deserialize;

/// An Ed25519 release key the device trusts. The id must be the id of the key (`ota-` and the first 16 hex characters of
/// the SHA-256 of the 32 public-key bytes), so a key cannot be pinned under a name that is not its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinnedKey {
    key_id: String,
    public_key: [u8; 32],
}

impl PinnedKey {
    pub fn from_hex(key_id: &str, public_key_hex: &str) -> Result<PinnedKey, SimError> {
        let bytes = hex_decode(public_key_hex).ok_or(SimError::Invalid("public key hex"))?;
        PinnedKey::from_bytes(key_id, &bytes)
    }

    pub fn from_bytes(key_id: &str, bytes: &[u8]) -> Result<PinnedKey, SimError> {
        let raw: [u8; 32] = bytes.try_into().map_err(|_| SimError::Invalid("an Ed25519 public key is 32 bytes"))?;
        let expected = format!("ota-{}", &sha256_hex(&raw)[..16]);
        if key_id != expected {
            return Err(SimError::Invalid("key id is not the id of this public key"));
        }
        Ok(PinnedKey { key_id: key_id.to_string(), public_key: raw })
    }

    pub fn key_id(&self) -> &str {
        &self.key_id
    }
}

/// One chunk as `GET /v1/ota/:packageId/chunk/:i` serves it (`data` is standard base64).
#[derive(Debug, Clone, Deserialize)]
pub struct OtaChunk {
    pub index: u32,
    pub total: u32,
    pub data: String,
    pub chunk_sha256: String,
}

pub trait ChunkSource {
    fn chunk(&self, package_id: &str, index: u32) -> Result<OtaChunk, SimError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallReceipt {
    pub package_id: String,
    pub version: String,
    pub size_bytes: u64,
}

pub struct OtaDevice {
    device_class: String,
    running_version: String,
    highest_accepted: Option<String>,
    pinned: Vec<PinnedKey>,
}

impl OtaDevice {
    /// A fresh board: no counter yet (the running version is the floor until the first install).
    pub fn new(device_class: &str, running_version: &str, pinned: Vec<PinnedKey>) -> Result<OtaDevice, SimError> {
        OtaDevice::restore(device_class, running_version, None, pinned)
    }

    /// A board whose counter survived a reset: the running image may be older than the counter says.
    pub fn restore(device_class: &str, running_version: &str, highest_accepted: Option<&str>, pinned: Vec<PinnedKey>) -> Result<OtaDevice, SimError> {
        if parse_version(running_version).is_none() || highest_accepted.map(|v| parse_version(v).is_none()).unwrap_or(false) {
            return Err(SimError::Invalid("version must be x.y.z"));
        }
        Ok(OtaDevice {
            device_class: device_class.to_string(),
            running_version: running_version.to_string(),
            highest_accepted: highest_accepted.map(str::to_string),
            pinned,
        })
    }

    pub fn running_version(&self) -> &str {
        &self.running_version
    }

    pub fn highest_accepted(&self) -> Option<&str> {
        self.highest_accepted.as_deref()
    }

    fn signature_valid(key: &PinnedKey, manifest: &OtaManifest) -> bool {
        match URL_SAFE_NO_PAD.decode(&manifest.signature) {
            Ok(signature) if signature.len() == 64 => UnparsedPublicKey::new(&ED25519, key.public_key)
                .verify(signing_message(manifest).as_bytes(), &signature)
                .is_ok(),
            _ => false,
        }
    }

    /// Steps 1 to 6: would this device install this manifest? Changes nothing.
    pub fn evaluate(&self, manifest: &OtaManifest) -> Result<(), OtaRefusal> {
        let key = self.pinned.iter().find(|k| k.key_id == manifest.key_id).ok_or(OtaRefusal::UnknownKey)?;
        if !OtaDevice::signature_valid(key, manifest) {
            return Err(OtaRefusal::SignatureInvalid);
        }
        if manifest.device_class != self.device_class {
            return Err(OtaRefusal::DeviceClassMismatch);
        }
        let offered = parse_version(&manifest.version).ok_or(OtaRefusal::VersionInvalid)?;
        let running = parse_version(&self.running_version).ok_or(OtaRefusal::VersionInvalid)?;
        if offered == running {
            return Err(OtaRefusal::SameVersion);
        }
        if offered < running {
            return Err(OtaRefusal::DowngradeRefused);
        }
        if let Some(highest) = &self.highest_accepted {
            let counter = parse_version(highest).ok_or(OtaRefusal::VersionInvalid)?;
            if offered <= counter {
                return Err(OtaRefusal::DowngradeRefused);
            }
        }
        if let Some(floor) = &manifest.min_version {
            let floor = parse_version(floor).ok_or(OtaRefusal::VersionInvalid)?;
            if running < floor {
                return Err(OtaRefusal::MinVersionNotMet);
            }
        }
        Ok(())
    }

    /// All seven steps. On any refusal the device is left exactly as it was.
    pub fn install(&mut self, manifest: &OtaManifest, source: &dyn ChunkSource) -> Result<InstallReceipt, OtaRefusal> {
        self.evaluate(manifest)?;
        let chunk_size = u64::from(manifest.chunk_size);
        let mut image: Vec<u8> = Vec::with_capacity(manifest.size_bytes as usize);
        for index in 0..manifest.chunk_count {
            let chunk = source.chunk(&manifest.package_id, index).map_err(|_| OtaRefusal::ChunkUnavailable)?;
            if chunk.index != index || chunk.total != manifest.chunk_count {
                return Err(OtaRefusal::ChunkOutOfRange);
            }
            let bytes = STANDARD.decode(&chunk.data).map_err(|_| OtaRefusal::ChunkHashMismatch)?;
            let expected_len = if index + 1 == manifest.chunk_count { manifest.size_bytes - u64::from(index) * chunk_size } else { chunk_size };
            if bytes.len() as u64 != expected_len {
                return Err(OtaRefusal::SizeMismatch);
            }
            if sha256_hex(&bytes) != chunk.chunk_sha256 {
                return Err(OtaRefusal::ChunkHashMismatch);
            }
            image.extend_from_slice(&bytes);
        }
        if image.len() as u64 != manifest.size_bytes {
            return Err(OtaRefusal::SizeMismatch);
        }
        if sha256_hex(&image) != manifest.sha256 {
            return Err(OtaRefusal::ImageHashMismatch);
        }
        self.running_version = manifest.version.clone();
        self.highest_accepted = Some(manifest.version.clone());
        Ok(InstallReceipt { package_id: manifest.package_id.clone(), version: manifest.version.clone(), size_bytes: manifest.size_bytes })
    }
}
