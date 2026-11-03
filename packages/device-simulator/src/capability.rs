//! A signed capability declaration (`shared/types/device-capability.ts`, section 2).
//!
//! The device signs five lines (domain, device id, declaration id, digest of the canonical declaration, `observedAt`) with its
//! P-256 key, ECDSA / SHA-256, IEEE P1363, base64url. A declaration lives at most 15 minutes. The e-ink desk companion
//! declares one item, `display.eink.v1`. It is not in the catalogue, so it is declared in the `owner_data` category (it shows
//! the owner's day): never in the rental allow-list and off until the platform's owner-data switch is on.

use crate::canonical::{canonical_json, sha256_hex};
use crate::identity::{verify_p256, DeviceIdentity};
use crate::timeutil::{format_iso_utc, parse_iso_utc};
use crate::SimError;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{json, Value};

pub const DECLARATION_DOMAIN: &str = "agentrix.device.capability.declaration.v0";
pub const DECLARATION_MAX_TTL_SECONDS: i64 = 15 * 60;
pub const EINK_CAPABILITY_TYPE: &str = "display.eink.v1";

/// What the caller decides; everything else is fixed by the contract.
pub struct DeclarationParams<'a> {
    /// The shell session binding this device belongs to (a UUID from the platform).
    pub shell_binding_id: &'a str,
    pub signer_ref: &'a str,
    pub now_epoch_seconds: i64,
    pub ttl_seconds: i64,
    pub on_power: Option<bool>,
}

fn is_uuid(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    bytes.iter().enumerate().all(|(index, b)| match index {
        8 | 13 | 18 | 23 => *b == b'-',
        14 => (b'1'..=b'8').contains(b),
        19 => matches!(*b, b'8' | b'9' | b'a' | b'b' | b'A' | b'B'),
        _ => b.is_ascii_hexdigit(),
    })
}

fn random_uuid_v4() -> Result<String, SimError> {
    let mut bytes = [0u8; 16];
    SystemRandom::new().fill(&mut bytes).map_err(|_| SimError::Crypto)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex = crate::canonical::hex_encode(&bytes);
    Ok(format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32]))
}

fn tri_state(value: Option<bool>) -> Value {
    match value {
        Some(flag) => json!(flag),
        None => Value::Null,
    }
}

/// The declaration body (no signature in it, so the digest covers every field).
pub fn build_declaration(device_id: &str, params: &DeclarationParams<'_>) -> Result<Value, SimError> {
    if !is_uuid(params.shell_binding_id) {
        return Err(SimError::Invalid("shell binding id must be a uuid"));
    }
    if params.signer_ref.is_empty() || params.signer_ref.len() > 128 || !params.signer_ref.bytes().all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b)) {
        return Err(SimError::Invalid("signer ref"));
    }
    if params.ttl_seconds <= 0 || params.ttl_seconds > DECLARATION_MAX_TTL_SECONDS {
        return Err(SimError::Invalid("a declaration lives at most 15 minutes"));
    }
    Ok(json!({
        "schemaVersion": 0,
        "declarationId": random_uuid_v4()?,
        "deviceId": device_id,
        "kind": "hardware",
        "shellBindingRef": {"type": "shell_session_binding", "id": params.shell_binding_id, "version": 1},
        "attestedBy": "device_key",
        "signerRef": params.signer_ref,
        "items": [{
            "type": EINK_CAPABILITY_TYPE,
            "category": "owner_data",
            "state": "available",
            "limits": {"maxBookings": 12}
        }],
        "conditions": {"onPower": tri_state(params.on_power), "thermalOk": Value::Null, "idle": Value::Null},
        "observedAt": format_iso_utc(params.now_epoch_seconds),
        "expiresAt": format_iso_utc(params.now_epoch_seconds + params.ttl_seconds),
    }))
}

/// `sha256:` plus the SHA-256 of the canonical JSON of the whole declaration.
pub fn declaration_digest(declaration: &Value) -> Result<String, SimError> {
    Ok(format!("sha256:{}", sha256_hex(canonical_json(declaration)?.as_bytes())))
}

/// The five signed lines, joined with `\n`, no trailing newline.
pub fn signing_message(device_id: &str, declaration_id: &str, digest: &str, observed_at: &str) -> String {
    [DECLARATION_DOMAIN, device_id, declaration_id, digest, observed_at].join("\n")
}

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, SimError> {
    value.get(key).and_then(Value::as_str).ok_or(SimError::Invalid("declaration field"))
}

/// `POST /api/devices/:deviceId/capabilities` body: `{ declaration, signature }`.
pub fn signed_upload(identity: &DeviceIdentity, params: &DeclarationParams<'_>) -> Result<Value, SimError> {
    let declaration = build_declaration(identity.device_id(), params)?;
    let digest = declaration_digest(&declaration)?;
    let message = signing_message(identity.device_id(), text(&declaration, "declarationId")?, &digest, text(&declaration, "observedAt")?);
    let signature = identity.sign(&message)?;
    Ok(json!({"declaration": declaration, "signature": signature}))
}

/// Why the platform side would refuse an upload.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UploadRefusal {
    Shape,
    WrongDevice,
    Expired,
    TooLong,
    SignatureInvalid,
}

/// What the platform checks: shape, route device, validity window (`now_epoch_seconds`), then the signature with the key the
/// device is bound to (`x` / `y` are the raw 32-byte coordinates of its public key).
pub fn verify_upload(upload: &Value, route_device_id: &str, x: &[u8], y: &[u8], now_epoch_seconds: i64) -> Result<(), UploadRefusal> {
    let object = upload.as_object().ok_or(UploadRefusal::Shape)?;
    if object.len() != 2 {
        return Err(UploadRefusal::Shape);
    }
    let declaration = upload.get("declaration").ok_or(UploadRefusal::Shape)?;
    let signature = upload.get("signature").and_then(Value::as_str).ok_or(UploadRefusal::Shape)?;
    if signature.len() != 86 {
        return Err(UploadRefusal::Shape);
    }
    let device_id = text(declaration, "deviceId").map_err(|_| UploadRefusal::Shape)?;
    if device_id != route_device_id {
        return Err(UploadRefusal::WrongDevice);
    }
    if declaration.get("attestedBy").and_then(Value::as_str) != Some("device_key") {
        return Err(UploadRefusal::Shape);
    }
    let observed = parse_iso_utc(text(declaration, "observedAt").map_err(|_| UploadRefusal::Shape)?).ok_or(UploadRefusal::Shape)?;
    let expires = parse_iso_utc(text(declaration, "expiresAt").map_err(|_| UploadRefusal::Shape)?).ok_or(UploadRefusal::Shape)?;
    if expires <= observed {
        return Err(UploadRefusal::Shape);
    }
    if expires - observed > DECLARATION_MAX_TTL_SECONDS {
        return Err(UploadRefusal::TooLong);
    }
    if expires <= now_epoch_seconds {
        return Err(UploadRefusal::Expired);
    }
    let digest = declaration_digest(declaration).map_err(|_| UploadRefusal::Shape)?;
    let declaration_id = text(declaration, "declarationId").map_err(|_| UploadRefusal::Shape)?;
    let observed_at = text(declaration, "observedAt").map_err(|_| UploadRefusal::Shape)?;
    let message = signing_message(device_id, declaration_id, &digest, observed_at);
    verify_p256(x, y, &message, signature).map_err(|_| UploadRefusal::SignatureInvalid)
}

/// The raw public coordinates of an identity, for the platform-side check.
pub fn public_coordinates(identity: &DeviceIdentity) -> Result<(Vec<u8>, Vec<u8>), SimError> {
    let jwk = identity.public_jwk();
    let x = jwk.get("x").and_then(Value::as_str).ok_or(SimError::Invalid("jwk"))?;
    let y = jwk.get("y").and_then(Value::as_str).ok_or(SimError::Invalid("jwk"))?;
    Ok((
        URL_SAFE_NO_PAD.decode(x).map_err(|_| SimError::Invalid("jwk"))?,
        URL_SAFE_NO_PAD.decode(y).map_err(|_| SimError::Invalid("jwk"))?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_792_000_000; // 2026-10-14T..Z, any fixed instant
    const BINDING: &str = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

    fn params(ttl: i64) -> DeclarationParams<'static> {
        DeclarationParams { shell_binding_id: BINDING, signer_ref: "key:sim-1", now_epoch_seconds: NOW, ttl_seconds: ttl, on_power: Some(true) }
    }

    #[test]
    fn signing_message_has_the_five_lines() {
        assert_eq!(
            signing_message("dev_a", "id-1", "sha256:ab", "2026-10-21T00:00:00Z"),
            "agentrix.device.capability.declaration.v0\ndev_a\nid-1\nsha256:ab\n2026-10-21T00:00:00Z"
        );
    }

    #[test]
    fn a_signed_upload_verifies_and_carries_one_eink_item() {
        let identity = DeviceIdentity::generate().unwrap();
        let upload = signed_upload(&identity, &params(600)).unwrap();
        let (x, y) = public_coordinates(&identity).unwrap();
        assert_eq!(verify_upload(&upload, identity.device_id(), &x, &y, NOW + 1), Ok(()));
        let items = upload["declaration"]["items"].as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["type"], EINK_CAPABILITY_TYPE);
        assert_eq!(items[0]["category"], "owner_data");
        assert_eq!(upload["declaration"]["kind"], "hardware");
        assert!(is_uuid(upload["declaration"]["declarationId"].as_str().unwrap()));
        assert_eq!(upload["signature"].as_str().unwrap().len(), 86);
    }

    #[test]
    fn any_changed_field_breaks_the_signature() {
        let identity = DeviceIdentity::generate().unwrap();
        let (x, y) = public_coordinates(&identity).unwrap();
        let upload = signed_upload(&identity, &params(600)).unwrap();
        for (path, replacement) in [("kind", json!("desktop")), ("signerRef", json!("key:other")), ("attestedBy", json!("device_key"))] {
            let mut changed = upload.clone();
            changed["declaration"][path] = replacement;
            let expected = if path == "attestedBy" { Ok(()) } else { Err(UploadRefusal::SignatureInvalid) };
            assert_eq!(verify_upload(&changed, identity.device_id(), &x, &y, NOW + 1), expected, "{path}");
        }
        let mut more = upload.clone();
        more["declaration"]["items"][0]["state"] = json!("busy");
        assert_eq!(verify_upload(&more, identity.device_id(), &x, &y, NOW + 1), Err(UploadRefusal::SignatureInvalid));
        let mut widened = upload.clone();
        widened["declaration"]["items"][0]["category"] = json!("compute");
        assert_eq!(verify_upload(&widened, identity.device_id(), &x, &y, NOW + 1), Err(UploadRefusal::SignatureInvalid));
    }

    #[test]
    fn another_devices_key_does_not_verify() {
        let identity = DeviceIdentity::generate().unwrap();
        let other = DeviceIdentity::generate().unwrap();
        let (ox, oy) = public_coordinates(&other).unwrap();
        let upload = signed_upload(&identity, &params(600)).unwrap();
        assert_eq!(verify_upload(&upload, identity.device_id(), &ox, &oy, NOW + 1), Err(UploadRefusal::SignatureInvalid));
        let (x, y) = public_coordinates(&identity).unwrap();
        assert_eq!(verify_upload(&upload, other.device_id(), &x, &y, NOW + 1), Err(UploadRefusal::WrongDevice));
    }

    #[test]
    fn expired_and_too_long_declarations_are_refused() {
        let identity = DeviceIdentity::generate().unwrap();
        let (x, y) = public_coordinates(&identity).unwrap();
        let upload = signed_upload(&identity, &params(600)).unwrap();
        assert_eq!(verify_upload(&upload, identity.device_id(), &x, &y, NOW + 600), Err(UploadRefusal::Expired));
        assert_eq!(verify_upload(&upload, identity.device_id(), &x, &y, NOW + 599), Ok(()));
        assert_eq!(signed_upload(&identity, &params(901)).unwrap_err(), SimError::Invalid("a declaration lives at most 15 minutes"));
        assert_eq!(signed_upload(&identity, &params(0)).unwrap_err(), SimError::Invalid("a declaration lives at most 15 minutes"));
        // a longer window written by hand is refused even if it were signed
        let mut long = upload.clone();
        long["declaration"]["expiresAt"] = json!(format_iso_utc(NOW + 901));
        assert_eq!(verify_upload(&long, identity.device_id(), &x, &y, NOW + 1), Err(UploadRefusal::TooLong));
    }

    #[test]
    fn bad_binding_and_signer_refs_are_refused_and_extra_upload_fields_too() {
        let identity = DeviceIdentity::generate().unwrap();
        let mut bad = params(600);
        bad.shell_binding_id = "not-a-uuid";
        assert_eq!(signed_upload(&identity, &bad).unwrap_err(), SimError::Invalid("shell binding id must be a uuid"));
        let mut bad_signer = params(600);
        bad_signer.signer_ref = "key with space";
        assert_eq!(signed_upload(&identity, &bad_signer).unwrap_err(), SimError::Invalid("signer ref"));
        let (x, y) = public_coordinates(&identity).unwrap();
        let mut upload = signed_upload(&identity, &params(600)).unwrap();
        upload["extra"] = json!(1);
        assert_eq!(verify_upload(&upload, identity.device_id(), &x, &y, NOW + 1), Err(UploadRefusal::Shape));
    }
}
