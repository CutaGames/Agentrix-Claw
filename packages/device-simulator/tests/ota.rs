//! B5: the device side of the signed OTA manifest. Every key is made here at run time; the known-answer vector carries only a
//! public key and a signature (the same vector `backend/src/contracts/gadget-firmware-ota.shared.spec.ts` checks).

use base64::{engine::general_purpose::STANDARD, engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use device_simulator::canonical::sha256_hex;
use device_simulator::ota::{signing_message, ChunkSource, OtaChunk, OtaDevice, OtaManifest, OtaRefusal, PinnedKey};
use device_simulator::SimError;
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};
use serde_json::{json, Value};

struct Release {
    pair: Ed25519KeyPair,
    key_id: String,
}

fn release() -> Release {
    let rng = SystemRandom::new();
    let document = Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
    let pair = Ed25519KeyPair::from_pkcs8(document.as_ref()).unwrap();
    let public: &[u8] = pair.public_key().as_ref();
    let key_id = format!("ota-{}", &sha256_hex(public)[..16]);
    Release { pair, key_id }
}

fn pinned(r: &Release) -> PinnedKey {
    let public: &[u8] = r.pair.public_key().as_ref();
    PinnedKey::from_bytes(&r.key_id, public).unwrap()
}

fn image(len: u32) -> Vec<u8> {
    (0..len).map(|i| (i % 251) as u8).collect()
}

fn manifest(r: &Release, class: &str, version: &str, min: Option<&str>, image: &[u8]) -> OtaManifest {
    let mut m = OtaManifest {
        package_id: "pkg-1".to_string(),
        device_class: class.to_string(),
        version: version.to_string(),
        min_version: min.map(str::to_string),
        channel: "stable".to_string(),
        size_bytes: image.len() as u64,
        sha256: sha256_hex(image),
        chunk_size: 256,
        chunk_count: image.len().div_ceil(256) as u32,
        mandatory: false,
        key_id: r.key_id.clone(),
        signature: "A".repeat(86),
    };
    let signature = r.pair.sign(signing_message(&m).as_bytes());
    let bytes: &[u8] = signature.as_ref();
    m.signature = URL_SAFE_NO_PAD.encode(bytes);
    m
}

fn wire(m: &OtaManifest) -> Value {
    json!({
        "package_id": m.package_id, "device_class": m.device_class, "version": m.version, "min_version": m.min_version,
        "channel": m.channel, "size_bytes": m.size_bytes, "sha256": m.sha256, "chunk_size": m.chunk_size,
        "chunk_count": m.chunk_count, "mandatory": m.mandatory, "key_id": m.key_id, "signature": m.signature
    })
}

/// Serves chunks the way the backend does; `corrupt` flips a bit after the hash was taken, `down` makes one chunk unavailable.
struct Server {
    image: Vec<u8>,
    corrupt: Option<u32>,
    down: Option<u32>,
}

impl Server {
    fn of(image: &[u8]) -> Server {
        Server { image: image.to_vec(), corrupt: None, down: None }
    }
}

impl ChunkSource for Server {
    fn chunk(&self, _package_id: &str, index: u32) -> Result<OtaChunk, SimError> {
        if self.down == Some(index) {
            return Err(SimError::Invalid("unavailable"));
        }
        let start = index as usize * 256;
        if start >= self.image.len() {
            return Err(SimError::Invalid("range"));
        }
        let end = (start + 256).min(self.image.len());
        let mut bytes = self.image[start..end].to_vec();
        let chunk_sha256 = sha256_hex(&bytes);
        if self.corrupt == Some(index) {
            bytes[0] ^= 1;
        }
        Ok(OtaChunk { index, total: self.image.len().div_ceil(256) as u32, data: STANDARD.encode(&bytes), chunk_sha256 })
    }
}

#[test]
fn installs_a_newer_signed_image_and_moves_the_counter() {
    let r = release();
    let img = image(1000);
    let mut device = OtaDevice::new("yowo_gadget", "1.1.0", vec![pinned(&r)]).unwrap();
    let receipt = device.install(&manifest(&r, "yowo_gadget", "1.2.0", Some("1.0.0"), &img), &Server::of(&img)).unwrap();
    assert_eq!(receipt.version, "1.2.0");
    assert_eq!(receipt.size_bytes, 1000);
    assert_eq!(device.running_version(), "1.2.0");
    assert_eq!(device.highest_accepted(), Some("1.2.0"));
}

#[test]
fn known_answer_vector_from_the_typescript_side_installs() {
    let key = PinnedKey::from_hex("ota-65b60673d6ed884b", "79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664").unwrap();
    let img = b"firmware-bytes-v1.2.0".to_vec();
    let m = OtaManifest {
        package_id: "pkg-kat".to_string(),
        device_class: "yowo_gadget".to_string(),
        version: "1.2.0".to_string(),
        min_version: Some("1.0.0".to_string()),
        channel: "stable".to_string(),
        size_bytes: 21,
        sha256: "c1e3ad3118355b18ab81a472fc11495bb14668078e18c846ec3a5ec2013cbb25".to_string(),
        chunk_size: 256,
        chunk_count: 1,
        mandatory: false,
        key_id: "ota-65b60673d6ed884b".to_string(),
        signature: "fZHk5A8nuHLBrc9H0goCs9WOiV4gXpxYV9V6Ff3qWPznCYtJfGvxq-_PellqARdVHYH9qV9g3gLG_NkT5I-3Dw".to_string(),
    };
    assert_eq!(sha256_hex(&img), m.sha256);
    let mut device = OtaDevice::new("yowo_gadget", "1.1.0", vec![key.clone()]).unwrap();
    assert!(device.install(&m, &Server::of(&img)).is_ok());
    // one changed signed field and the same signature no longer verifies
    let mut other_version = m.clone();
    other_version.version = "1.2.1".to_string();
    let mut other_channel = m.clone();
    other_channel.channel = "beta".to_string();
    let mut no_floor = m.clone();
    no_floor.min_version = None;
    let mut other_size = m.clone();
    other_size.size_bytes = 22;
    for changed in [other_version, other_channel, no_floor, other_size] {
        let fresh = OtaDevice::new("yowo_gadget", "1.1.0", vec![key.clone()]).unwrap();
        assert_eq!(fresh.evaluate(&changed), Err(OtaRefusal::SignatureInvalid));
    }
}

#[test]
fn refusals_leave_the_device_exactly_as_it_was() {
    let r = release();
    let other = release();
    let img = image(600);
    let good = manifest(&r, "yowo_gadget", "1.2.0", None, &img);
    let mut flipped = good.clone();
    flipped.signature = format!("{}{}", if good.signature.starts_with('A') { 'B' } else { 'A' }, &good.signature[1..]);
    let mut renamed = good.clone();
    renamed.version = "1.2.1".to_string();
    let cases: Vec<(&str, OtaDevice, OtaManifest, OtaRefusal)> = vec![
        ("key not pinned", OtaDevice::new("yowo_gadget", "1.1.0", vec![pinned(&other)]).unwrap(), good.clone(), OtaRefusal::UnknownKey),
        ("no keys pinned at all", OtaDevice::new("yowo_gadget", "1.1.0", vec![]).unwrap(), good.clone(), OtaRefusal::UnknownKey),
        ("signature flipped", OtaDevice::new("yowo_gadget", "1.1.0", vec![pinned(&r)]).unwrap(), flipped, OtaRefusal::SignatureInvalid),
        ("signed field edited", OtaDevice::new("yowo_gadget", "1.1.0", vec![pinned(&r)]).unwrap(), renamed, OtaRefusal::SignatureInvalid),
        ("other device class", OtaDevice::new("plush", "1.1.0", vec![pinned(&r)]).unwrap(), good.clone(), OtaRefusal::DeviceClassMismatch),
        ("same version", OtaDevice::new("yowo_gadget", "1.2.0", vec![pinned(&r)]).unwrap(), good.clone(), OtaRefusal::SameVersion),
        ("downgrade", OtaDevice::new("yowo_gadget", "1.3.0", vec![pinned(&r)]).unwrap(), good.clone(), OtaRefusal::DowngradeRefused),
        (
            "counter: running image is old but the board accepted 1.5.0 before",
            OtaDevice::restore("yowo_gadget", "1.0.0", Some("1.5.0"), vec![pinned(&r)]).unwrap(),
            good.clone(),
            OtaRefusal::DowngradeRefused,
        ),
        (
            "below the signed floor",
            OtaDevice::new("yowo_gadget", "0.9.0", vec![pinned(&r)]).unwrap(),
            manifest(&r, "yowo_gadget", "1.2.0", Some("1.0.0"), &img),
            OtaRefusal::MinVersionNotMet,
        ),
    ];
    for (label, mut device, m, expected) in cases {
        let before = (device.running_version().to_string(), device.highest_accepted().map(str::to_string));
        assert_eq!(device.install(&m, &Server::of(&img)), Err(expected), "{label}");
        assert_eq!((device.running_version().to_string(), device.highest_accepted().map(str::to_string)), before, "{label}");
    }
}

#[test]
fn a_bad_transfer_installs_nothing() {
    let r = release();
    let img = image(1000);
    let m = manifest(&r, "yowo_gadget", "1.2.0", None, &img);
    let mut other_image = img.clone();
    other_image[500] ^= 0xff;
    let shorter = img[..990].to_vec();
    let transfers: Vec<(&str, Server, OtaRefusal)> = vec![
        ("a chunk changed in transit", Server { image: img.clone(), corrupt: Some(2), down: None }, OtaRefusal::ChunkHashMismatch),
        ("a chunk is unavailable", Server { image: img.clone(), corrupt: None, down: Some(1) }, OtaRefusal::ChunkUnavailable),
        ("other bytes with matching chunk hashes", Server::of(&other_image), OtaRefusal::ImageHashMismatch),
        ("a shorter image", Server::of(&shorter), OtaRefusal::SizeMismatch),
    ];
    for (label, server, expected) in transfers {
        let mut device = OtaDevice::new("yowo_gadget", "1.1.0", vec![pinned(&r)]).unwrap();
        assert_eq!(device.install(&m, &server), Err(expected), "{label}");
        assert_eq!(device.running_version(), "1.1.0", "{label}");
        assert_eq!(device.highest_accepted(), None, "{label}");
    }
}

#[test]
fn a_sequence_of_updates_only_ever_moves_forward() {
    let r = release();
    let img = image(300);
    let mut device = OtaDevice::new("yowo_gadget", "1.0.0", vec![pinned(&r)]).unwrap();
    for (version, ok) in [("1.1.0", true), ("1.0.5", false), ("1.1.0", false), ("1.10.0", true), ("1.9.0", false), ("2.0.0", true)] {
        let result = device.install(&manifest(&r, "yowo_gadget", version, None, &img), &Server::of(&img));
        assert_eq!(result.is_ok(), ok, "{version}");
    }
    assert_eq!(device.running_version(), "2.0.0");
}

#[test]
fn the_manifest_shape_is_checked_before_anything_else() {
    let r = release();
    let img = image(600);
    let good = wire(&manifest(&r, "yowo_gadget", "1.2.0", Some("1.0.0"), &img));
    assert!(OtaManifest::from_value(&good).is_ok());
    let mut extra = good.clone();
    extra["extra"] = json!(1);
    assert!(matches!(OtaManifest::from_value(&extra), Err(OtaRefusal::Malformed(_))));
    let mut missing = good.clone();
    missing.as_object_mut().unwrap().remove("min_version");
    assert!(matches!(OtaManifest::from_value(&missing), Err(OtaRefusal::Malformed(_))));
    let mut null_floor = good.clone();
    null_floor["min_version"] = Value::Null;
    assert!(OtaManifest::from_value(&null_floor).is_ok());
    for (field, value) in [
        ("chunk_count", json!(9)),
        ("size_bytes", json!(0)),
        ("chunk_size", json!(16)),
        ("sha256", json!("XYZ")),
        ("signature", json!("short")),
        ("device_class", json!("Bad Class")),
        ("min_version", json!("2.0.0")),
        ("mandatory", json!("yes")),
    ] {
        let mut bad = good.clone();
        bad[field] = value;
        assert!(matches!(OtaManifest::from_value(&bad), Err(OtaRefusal::Malformed(_))), "{field}");
    }
    let mut version = good.clone();
    version["version"] = json!("1.2");
    assert_eq!(OtaManifest::from_value(&version), Err(OtaRefusal::VersionInvalid));
}

#[test]
fn a_key_cannot_be_pinned_under_a_name_that_is_not_its_own() {
    let r = release();
    let public: &[u8] = r.pair.public_key().as_ref();
    assert!(PinnedKey::from_bytes("ota-0000000000000000", public).is_err());
    assert!(PinnedKey::from_bytes(&r.key_id, &public[..31]).is_err());
    assert!(PinnedKey::from_hex(&r.key_id, "zz").is_err());
    assert!(PinnedKey::from_bytes(&r.key_id, public).is_ok());
}

#[test]
fn refusal_codes_are_the_strings_of_the_shared_contract() {
    let codes = [
        (OtaRefusal::UnknownKey, "unknown_key"),
        (OtaRefusal::SignatureInvalid, "signature_invalid"),
        (OtaRefusal::VersionInvalid, "version_invalid"),
        (OtaRefusal::SameVersion, "same_version"),
        (OtaRefusal::DowngradeRefused, "downgrade_refused"),
        (OtaRefusal::MinVersionNotMet, "min_version_not_met"),
    ];
    for (refusal, code) in codes {
        assert_eq!(refusal.code(), code);
    }
}
