//! The device key and pairing (`shared/types/device-pairing-proof.ts`).
//!
//! The key is a fresh P-256 pair made at run time with the system random source. It is never written anywhere and no
//! test fixture holds one. The device id is self-certifying: `dev_` plus the first 32 hex characters of the SHA-256 of the
//! canonical public JWK, so nobody who only knows an id (from a BLE advertisement, say) can pair as that device.

use crate::canonical::{canonical_json, hex_decode, sha256_hex};
use crate::SimError;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ring::rand::SystemRandom;
use ring::signature::{EcdsaKeyPair, KeyPair, UnparsedPublicKey, ECDSA_P256_SHA256_FIXED, ECDSA_P256_SHA256_FIXED_SIGNING};
use serde_json::{json, Value};

pub const PAIRING_DOMAIN: &str = "agentrix.device.pair.v1";
pub const PAIRING_ALGORITHM: &str = "ecdsa-p256-sha256";
const TICKET_CHARS_MAX: usize = 256;

/// The three lines the device signs: domain, ticket, device id.
pub fn pairing_message(ticket: &str, device_id: &str) -> String {
    format!("{PAIRING_DOMAIN}\n{ticket}\n{device_id}")
}

/// `dev_` plus the first 32 characters of a 64-character lower-case hex thumbprint.
pub fn derive_device_id(thumbprint_hex: &str) -> Result<String, SimError> {
    if thumbprint_hex.len() != 64 || hex_decode(thumbprint_hex).is_none() {
        return Err(SimError::Invalid("thumbprint must be 64 lower-case hex characters"));
    }
    Ok(format!("dev_{}", &thumbprint_hex[..32]))
}

fn public_jwk(x: &str, y: &str) -> Value {
    json!({"kty": "EC", "crv": "P-256", "x": x, "y": y})
}

pub struct DeviceIdentity {
    key: EcdsaKeyPair,
    rng: SystemRandom,
    x: String,
    y: String,
    device_id: String,
}

impl DeviceIdentity {
    pub fn generate() -> Result<Self, SimError> {
        let rng = SystemRandom::new();
        let pkcs8 = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng).map_err(|_| SimError::Crypto)?;
        let key = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, pkcs8.as_ref(), &rng).map_err(|_| SimError::Crypto)?;
        let (x, y) = {
            let point: &[u8] = key.public_key().as_ref();
            if point.len() != 65 || point[0] != 4 {
                return Err(SimError::Crypto);
            }
            (URL_SAFE_NO_PAD.encode(&point[1..33]), URL_SAFE_NO_PAD.encode(&point[33..65]))
        };
        let thumbprint = sha256_hex(canonical_json(&public_jwk(&x, &y))?.as_bytes());
        let device_id = derive_device_id(&thumbprint)?;
        Ok(DeviceIdentity { key, rng, x, y, device_id })
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    /// The public JWK (`kty`, `crv`, `x`, `y`): the only key material that ever leaves the device.
    pub fn public_jwk(&self) -> Value {
        public_jwk(&self.x, &self.y)
    }

    /// IEEE P1363 (r || s, 64 bytes), base64url without padding: 86 characters.
    pub fn sign(&self, message: &str) -> Result<String, SimError> {
        let signature = self.key.sign(&self.rng, message.as_bytes()).map_err(|_| SimError::Crypto)?;
        let bytes: &[u8] = signature.as_ref();
        Ok(URL_SAFE_NO_PAD.encode(bytes))
    }

    /// `POST /v1/devices/pair` body with the proof of possession. The ticket is opaque but must not hold control characters,
    /// because it is one line of the signed message.
    pub fn pair_request(&self, ticket: &str, device_class: &str, firmware_version: &str) -> Result<Value, SimError> {
        if ticket.is_empty() || ticket.chars().count() > TICKET_CHARS_MAX || ticket.chars().any(|c| c.is_control()) {
            return Err(SimError::Invalid("pairing ticket"));
        }
        let signature = self.sign(&pairing_message(ticket, &self.device_id))?;
        Ok(json!({
            "ticket": ticket,
            "device_id": self.device_id,
            "device_class": device_class,
            "vendor": "simulator",
            "firmware_version": firmware_version,
            "proof": {
                "schemaVersion": 1,
                "algorithm": PAIRING_ALGORITHM,
                "publicJwk": self.public_jwk(),
                "signature": signature,
            }
        }))
    }
}

/// The platform's reasons to refuse a pairing proof (the simulator checks its own output with this in tests).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairRefusal {
    TicketMismatch,
    ProofShape,
    DeviceIdMismatch,
    SignatureInvalid,
}

/// Re-derives the id from the public key and verifies the signature over the ticket and id.
pub fn verify_pair_request(request: &Value, expected_ticket: &str) -> Result<(), PairRefusal> {
    if request.get("ticket").and_then(Value::as_str) != Some(expected_ticket) {
        return Err(PairRefusal::TicketMismatch);
    }
    let device_id = request.get("device_id").and_then(Value::as_str).ok_or(PairRefusal::ProofShape)?;
    let proof = request.get("proof").and_then(Value::as_object).ok_or(PairRefusal::ProofShape)?;
    if proof.len() != 4
        || proof.get("schemaVersion").and_then(Value::as_i64) != Some(1)
        || proof.get("algorithm").and_then(Value::as_str) != Some(PAIRING_ALGORITHM)
    {
        return Err(PairRefusal::ProofShape);
    }
    let jwk = proof.get("publicJwk").and_then(Value::as_object).ok_or(PairRefusal::ProofShape)?;
    if jwk.len() != 4 || jwk.get("kty").and_then(Value::as_str) != Some("EC") || jwk.get("crv").and_then(Value::as_str) != Some("P-256") {
        return Err(PairRefusal::ProofShape);
    }
    let x = jwk.get("x").and_then(Value::as_str).ok_or(PairRefusal::ProofShape)?;
    let y = jwk.get("y").and_then(Value::as_str).ok_or(PairRefusal::ProofShape)?;
    let x_bytes = URL_SAFE_NO_PAD.decode(x).map_err(|_| PairRefusal::ProofShape)?;
    let y_bytes = URL_SAFE_NO_PAD.decode(y).map_err(|_| PairRefusal::ProofShape)?;
    if x_bytes.len() != 32 || y_bytes.len() != 32 {
        return Err(PairRefusal::ProofShape);
    }
    let canonical = canonical_json(&public_jwk(x, y)).map_err(|_| PairRefusal::ProofShape)?;
    let derived = derive_device_id(&sha256_hex(canonical.as_bytes())).map_err(|_| PairRefusal::ProofShape)?;
    if derived != device_id {
        return Err(PairRefusal::DeviceIdMismatch);
    }
    let signature = proof.get("signature").and_then(Value::as_str).ok_or(PairRefusal::ProofShape)?;
    verify_p256(&x_bytes, &y_bytes, &pairing_message(expected_ticket, device_id), signature).map_err(|_| PairRefusal::SignatureInvalid)
}

/// Verifies a P1363 base64url signature with the public point (x, y). Used by the platform side in tests.
pub fn verify_p256(x: &[u8], y: &[u8], message: &str, signature_b64url: &str) -> Result<(), SimError> {
    if x.len() != 32 || y.len() != 32 {
        return Err(SimError::Invalid("public point"));
    }
    let signature = URL_SAFE_NO_PAD.decode(signature_b64url).map_err(|_| SimError::Invalid("signature encoding"))?;
    if signature.len() != 64 {
        return Err(SimError::Invalid("signature length"));
    }
    let mut point = Vec::with_capacity(65);
    point.push(4u8);
    point.extend_from_slice(x);
    point.extend_from_slice(y);
    UnparsedPublicKey::new(&ECDSA_P256_SHA256_FIXED, &point)
        .verify(message.as_bytes(), &signature)
        .map_err(|_| SimError::Crypto)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_id_is_derived_from_the_key_and_has_the_contract_shape() {
        let identity = DeviceIdentity::generate().unwrap();
        let id = identity.device_id();
        assert_eq!(id.len(), 36);
        assert!(id.starts_with("dev_"));
        assert!(id[4..].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
        let other = DeviceIdentity::generate().unwrap();
        assert_ne!(identity.device_id(), other.device_id());
    }

    #[test]
    fn known_answer_for_the_device_id_of_a_fixed_public_key() {
        // The same JWK as the TypeScript side uses for `deriveSelfCertifyingDeviceIdV1(computeEmbeddedCanonicalSha256V1(jwk))`.
        let jwk = public_jwk("f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU", "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0");
        let thumbprint = sha256_hex(canonical_json(&jwk).unwrap().as_bytes());
        assert_eq!(derive_device_id(&thumbprint).unwrap(), "dev_a0a232c2f194a53553cb1310ddbc0821");
    }

    #[test]
    fn pairing_message_is_three_lines_without_a_trailing_newline() {
        assert_eq!(pairing_message("T1", "dev_x"), "agentrix.device.pair.v1\nT1\ndev_x");
    }

    #[test]
    fn a_request_it_made_verifies_for_its_own_ticket_only() {
        let identity = DeviceIdentity::generate().unwrap();
        let request = identity.pair_request("ticket-123", "desk_companion", "0.1.0").unwrap();
        assert_eq!(verify_pair_request(&request, "ticket-123"), Ok(()));
        assert_eq!(verify_pair_request(&request, "ticket-124"), Err(PairRefusal::TicketMismatch));
    }

    #[test]
    fn someone_who_only_knows_the_id_cannot_pair_as_the_device() {
        let victim = DeviceIdentity::generate().unwrap();
        let attacker = DeviceIdentity::generate().unwrap();
        let mut request = attacker.pair_request("ticket-1", "desk_companion", "0.1.0").unwrap();
        request["device_id"] = json!(victim.device_id());
        assert_eq!(verify_pair_request(&request, "ticket-1"), Err(PairRefusal::DeviceIdMismatch));
        // and with the victim's public key but the attacker's signature
        let mut forged = victim.pair_request("ticket-1", "desk_companion", "0.1.0").unwrap();
        forged["proof"]["signature"] = attacker.pair_request("ticket-1", "desk_companion", "0.1.0").unwrap()["proof"]["signature"].clone();
        assert_eq!(verify_pair_request(&forged, "ticket-1"), Err(PairRefusal::SignatureInvalid));
    }

    #[test]
    fn a_proof_made_for_another_ticket_or_with_bits_flipped_is_refused() {
        let identity = DeviceIdentity::generate().unwrap();
        let mut replay = identity.pair_request("old-ticket", "desk_companion", "0.1.0").unwrap();
        replay["ticket"] = json!("new-ticket");
        assert_eq!(verify_pair_request(&replay, "new-ticket"), Err(PairRefusal::SignatureInvalid));
        let mut flipped = identity.pair_request("t", "desk_companion", "0.1.0").unwrap();
        let signature = flipped["proof"]["signature"].as_str().unwrap().to_string();
        let first = if signature.starts_with('A') { "B" } else { "A" };
        flipped["proof"]["signature"] = json!(format!("{first}{}", &signature[1..]));
        assert_eq!(verify_pair_request(&flipped, "t"), Err(PairRefusal::SignatureInvalid));
    }

    #[test]
    fn extra_or_missing_proof_fields_and_bad_tickets_are_refused() {
        let identity = DeviceIdentity::generate().unwrap();
        let mut request = identity.pair_request("t", "desk_companion", "0.1.0").unwrap();
        request["proof"]["extra"] = json!(1);
        assert_eq!(verify_pair_request(&request, "t"), Err(PairRefusal::ProofShape));
        let mut no_proof = identity.pair_request("t", "desk_companion", "0.1.0").unwrap();
        no_proof.as_object_mut().unwrap().remove("proof");
        assert_eq!(verify_pair_request(&no_proof, "t"), Err(PairRefusal::ProofShape));
        assert_eq!(identity.pair_request("", "c", "0.1.0"), Err(SimError::Invalid("pairing ticket")));
        assert_eq!(identity.pair_request("a\nb", "c", "0.1.0"), Err(SimError::Invalid("pairing ticket")));
    }
}
