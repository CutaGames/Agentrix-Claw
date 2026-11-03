//! The wire manifest, its shape check, the signed message, and the refusal codes.

use serde::Deserialize;
use serde_json::Value;

pub const SIGNATURE_DOMAIN: &str = "agentrix.ota.manifest.v1";
pub const FIRMWARE_BYTES_MAX: u64 = 16 * 1024 * 1024;
pub const CHUNK_SIZE_MIN: u32 = 256;
pub const CHUNK_SIZE_MAX: u32 = 65_536;

const WIRE_KEYS: [&str; 12] = [
    "package_id",
    "device_class",
    "version",
    "min_version",
    "channel",
    "size_bytes",
    "sha256",
    "chunk_size",
    "chunk_count",
    "mandatory",
    "key_id",
    "signature",
];

/// `x.y.z`, each part 1 to 3 digits.
pub fn parse_version(text: &str) -> Option<(u16, u16, u16)> {
    fn part(p: &str) -> Option<u16> {
        if p.is_empty() || p.len() > 3 || !p.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        p.parse().ok()
    }
    let mut parts = text.split('.');
    let a = parts.next()?;
    let b = parts.next()?;
    let c = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    Some((part(a)?, part(b)?, part(c)?))
}

fn name_ok(text: &str, min: usize, max: usize, allow_leading_digit: bool) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() < min || bytes.len() > max {
        return false;
    }
    let first = bytes[0];
    let first_ok = first.is_ascii_lowercase() || (allow_leading_digit && first.is_ascii_digit());
    first_ok && bytes.iter().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'_' || *b == b'-')
}

/// Why a device refuses. The first six codes are the same strings as `OtaManifestReasonCodeV1` in the shared contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OtaRefusal {
    UnknownKey,
    SignatureInvalid,
    VersionInvalid,
    SameVersion,
    DowngradeRefused,
    MinVersionNotMet,
    Malformed(&'static str),
    DeviceClassMismatch,
    ChunkUnavailable,
    ChunkOutOfRange,
    ChunkHashMismatch,
    SizeMismatch,
    ImageHashMismatch,
}

impl OtaRefusal {
    pub fn code(&self) -> &'static str {
        match self {
            OtaRefusal::UnknownKey => "unknown_key",
            OtaRefusal::SignatureInvalid => "signature_invalid",
            OtaRefusal::VersionInvalid => "version_invalid",
            OtaRefusal::SameVersion => "same_version",
            OtaRefusal::DowngradeRefused => "downgrade_refused",
            OtaRefusal::MinVersionNotMet => "min_version_not_met",
            OtaRefusal::Malformed(_) => "malformed_manifest",
            OtaRefusal::DeviceClassMismatch => "device_class_mismatch",
            OtaRefusal::ChunkUnavailable => "chunk_unavailable",
            OtaRefusal::ChunkOutOfRange => "chunk_out_of_range",
            OtaRefusal::ChunkHashMismatch => "chunk_hash_mismatch",
            OtaRefusal::SizeMismatch => "size_mismatch",
            OtaRefusal::ImageHashMismatch => "image_hash_mismatch",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OtaManifest {
    pub package_id: String,
    pub device_class: String,
    pub version: String,
    pub min_version: Option<String>,
    pub channel: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub chunk_size: u32,
    pub chunk_count: u32,
    pub mandatory: bool,
    pub key_id: String,
    pub signature: String,
}

/// The text the Ed25519 signature covers: the domain and seven fields, eight lines joined with `\n`, no trailing newline.
pub fn signing_message(m: &OtaManifest) -> String {
    let size = m.size_bytes.to_string();
    let lines: [&str; 8] = [
        SIGNATURE_DOMAIN,
        m.device_class.as_str(),
        m.version.as_str(),
        m.channel.as_str(),
        size.as_str(),
        m.sha256.as_str(),
        m.min_version.as_deref().unwrap_or(""),
        m.key_id.as_str(),
    ];
    lines.join("\n")
}

impl OtaManifest {
    /// Reads the manifest as the server serves it with the switch on: every key present, none extra, every value in range.
    /// The signature is NOT checked here.
    pub fn from_value(value: &Value) -> Result<OtaManifest, OtaRefusal> {
        let object = value.as_object().ok_or(OtaRefusal::Malformed("manifest is not an object"))?;
        for key in WIRE_KEYS {
            if !object.contains_key(key) {
                return Err(OtaRefusal::Malformed("missing field"));
            }
        }
        let m: OtaManifest = serde_json::from_value(value.clone()).map_err(|_| OtaRefusal::Malformed("field type or unknown field"))?;
        m.check_shape()?;
        Ok(m)
    }

    fn check_shape(&self) -> Result<(), OtaRefusal> {
        let bad = OtaRefusal::Malformed;
        if self.package_id.is_empty() || self.package_id.len() > 64 || !self.package_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
            return Err(bad("package_id"));
        }
        if !name_ok(&self.device_class, 2, 32, false) {
            return Err(bad("device_class"));
        }
        let version = parse_version(&self.version).ok_or(OtaRefusal::VersionInvalid)?;
        if let Some(floor) = &self.min_version {
            match parse_version(floor) {
                Some(f) if f <= version => {}
                _ => return Err(bad("min_version")),
            }
        }
        if !name_ok(&self.channel, 2, 16, false) {
            return Err(bad("channel"));
        }
        if self.size_bytes == 0 || self.size_bytes > FIRMWARE_BYTES_MAX {
            return Err(bad("size_bytes"));
        }
        if self.sha256.len() != 64 || crate::canonical::hex_decode(&self.sha256).is_none() {
            return Err(bad("sha256"));
        }
        if self.chunk_size < CHUNK_SIZE_MIN || self.chunk_size > CHUNK_SIZE_MAX {
            return Err(bad("chunk_size"));
        }
        let expected_chunks = self.size_bytes.div_ceil(u64::from(self.chunk_size));
        if u64::from(self.chunk_count) != expected_chunks {
            return Err(bad("chunk_count"));
        }
        if self.key_id.len() < 3 || self.key_id.len() > 64 || !name_ok(&self.key_id, 3, 64, true) {
            return Err(bad("key_id"));
        }
        if self.signature.len() != 86 || !self.signature.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') {
            return Err(bad("signature"));
        }
        Ok(())
    }
}
