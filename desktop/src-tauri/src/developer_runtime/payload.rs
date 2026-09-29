//! Frozen data-plane contract. Never treat `ciphertext` as hex plaintext.

use crate::developer_runtime::crypto::{blob_aad, sha256_hex, JournalAead};
use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::types::{now_iso, EncryptedPayloadRef};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::Value;
use zeroize::Zeroizing;

#[derive(Debug)]
pub struct OpenedPayload {
    pub plaintext: Zeroizing<Vec<u8>>,
    pub delivery_ref: Option<String>,
}

pub fn open_instruction_payload(
    data: &Value,
    payload_ref: &EncryptedPayloadRef,
    runtime_aead: &JournalAead,
    owner_runtime_id: &str,
) -> RuntimeResult<OpenedPayload> {
    if now_iso() >= payload_ref.expires_at {
        return Err(RuntimeError::unavailable("payload_expired"));
    }
    if payload_ref.data_kind != "instruction" {
        return Err(RuntimeError::fail_closed("payload_kind_mismatch"));
    }
    if data.get("ciphertext").is_some() && data.get("plaintextBase64").is_some() {
        return Err(RuntimeError::fail_closed("payload_encoding_mislabelled"));
    }
    if let Some(size) = data.get("sizeBytes").and_then(Value::as_u64) {
        if size != payload_ref.size_bytes {
            return Err(RuntimeError::fail_closed("payload_size_mismatch"));
        }
    }
    if let Some(kind) = data.get("dataKind").and_then(Value::as_str) {
        if kind != payload_ref.data_kind {
            return Err(RuntimeError::fail_closed("payload_kind_mismatch"));
        }
    }
    if let Some(owner) = data
        .get("ownerRuntimeRef")
        .and_then(|value| value.get("id").or(Some(value)))
        .and_then(Value::as_str)
    {
        if owner != owner_runtime_id {
            return Err(RuntimeError::fail_closed("payload_acl_denied"));
        }
    }
    let encoding = data.get("encoding").and_then(Value::as_str).unwrap_or("");
    let plaintext = match encoding {
        "runtime_aead_v1" => {
            if data.get("plaintextBase64").is_some() {
                return Err(RuntimeError::fail_closed("payload_encoding_mislabelled"));
            }
            let nonce = STANDARD
                .decode(
                    data.get("nonce")
                        .and_then(Value::as_str)
                        .ok_or_else(|| RuntimeError::fail_closed("payload_corrupt"))?,
                )
                .map_err(|_| RuntimeError::fail_closed("payload_corrupt"))?;
            let ciphertext = STANDARD
                .decode(
                    data.get("ciphertext")
                        .and_then(Value::as_str)
                        .ok_or_else(|| RuntimeError::fail_closed("payload_corrupt"))?,
                )
                .map_err(|_| RuntimeError::fail_closed("payload_corrupt"))?;
            let aad = data
                .get("aad")
                .and_then(Value::as_str)
                .map(|value| value.as_bytes().to_vec())
                .unwrap_or_else(|| {
                    blob_aad(
                        &payload_ref.data_ref,
                        &payload_ref.data_kind,
                        &payload_ref.expires_at,
                    )
                });
            runtime_aead.open(&nonce, &ciphertext, &aad)?
        }
        "plaintext_base64" => {
            if data.get("ciphertext").is_some() {
                return Err(RuntimeError::fail_closed("payload_encoding_mislabelled"));
            }
            let encoded = data
                .get("plaintextBase64")
                .and_then(Value::as_str)
                .ok_or_else(|| RuntimeError::fail_closed("payload_corrupt"))?;
            STANDARD
                .decode(encoded)
                .map_err(|_| RuntimeError::fail_closed("payload_corrupt"))?
        }
        _ => {
            if data.get("ciphertext").is_some() && data.get("plaintextBase64").is_none() {
                return Err(RuntimeError::fail_closed("payload_encoding_mislabelled"));
            }
            return Err(RuntimeError::unavailable("data_plane_unavailable"));
        }
    };
    if payload_ref.size_bytes != 0 && plaintext.len() as u64 != payload_ref.size_bytes {
        return Err(RuntimeError::fail_closed("payload_size_mismatch"));
    }
    if let Some(digest) = data.get("digest") {
        let value = digest
            .get("value")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !value.is_empty() && value != payload_ref.digest.value {
            return Err(RuntimeError::fail_closed("payload_digest_mismatch"));
        }
    } else if sha256_hex(&plaintext) != payload_ref.digest.value {
        return Err(RuntimeError::fail_closed("payload_digest_mismatch"));
    }
    Ok(OpenedPayload {
        plaintext: Zeroizing::new(plaintext),
        delivery_ref: data
            .get("deliveryRef")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::crypto::MemorySecureStore;
    use crate::developer_runtime::types::DigestRef;
    use serde_json::json;

    fn payload_ref(text: &str) -> EncryptedPayloadRef {
        EncryptedPayloadRef {
            kind: "encrypted_data_ref".into(),
            data_kind: "instruction".into(),
            data_ref: "data-instruction-1".into(),
            digest: DigestRef {
                algorithm: "sha-256".into(),
                canonicalization: "jcs/1".into(),
                value: sha256_hex(text.as_bytes()),
            },
            size_bytes: text.len() as u64,
            data_class: "owner_private".into(),
            encryption: "runtime_managed".into(),
            owner_scope: "authenticated_owner".into(),
            expires_at: "2099-08-22T12:00:00.000Z".into(),
        }
    }

    #[test]
    fn rejects_hex_ciphertext_as_plaintext() {
        let store = MemorySecureStore::default();
        let aead = JournalAead::load_runtime(&store).unwrap();
        let err = open_instruction_payload(
            &json!({ "ciphertext": hex::encode("do the work") }),
            &payload_ref("do the work"),
            &aead,
            "runtime-1",
        )
        .unwrap_err();
        assert_eq!(err.code(), "payload_encoding_mislabelled");
    }

    #[test]
    fn rejects_simultaneous_ciphertext_and_plaintext() {
        let store = MemorySecureStore::default();
        let aead = JournalAead::load_runtime(&store).unwrap();
        let err = open_instruction_payload(
            &json!({
                "encoding": "plaintext_base64",
                "plaintextBase64": STANDARD.encode("do the work"),
                "ciphertext": "deadbeef"
            }),
            &payload_ref("do the work"),
            &aead,
            "runtime-1",
        )
        .unwrap_err();
        assert_eq!(err.code(), "payload_encoding_mislabelled");
    }

    #[test]
    fn opens_plaintext_base64_without_persist() {
        let store = MemorySecureStore::default();
        let aead = JournalAead::load_runtime(&store).unwrap();
        let opened = open_instruction_payload(
            &json!({
                "encoding": "plaintext_base64",
                "plaintextBase64": STANDARD.encode("do the work"),
                "sizeBytes": 11,
                "dataKind": "instruction",
                "deliveryRef": "dlev_1"
            }),
            &payload_ref("do the work"),
            &aead,
            "runtime-1",
        )
        .unwrap();
        assert_eq!(opened.plaintext.as_slice(), b"do the work");
        assert_eq!(opened.delivery_ref.as_deref(), Some("dlev_1"));
    }

    #[test]
    fn opens_runtime_aead_with_runtime_key() {
        let store = MemorySecureStore::default();
        let aead = JournalAead::load_runtime(&store).unwrap();
        let aad = blob_aad(
            "data-instruction-1",
            "instruction",
            "2099-08-22T12:00:00.000Z",
        );
        let (ciphertext, nonce) = aead.seal(b"do the work", &aad).unwrap();
        let opened = open_instruction_payload(
            &json!({
                "encoding": "runtime_aead_v1",
                "nonce": STANDARD.encode(nonce),
                "ciphertext": STANDARD.encode(ciphertext),
                "aad": String::from_utf8(aad).unwrap(),
                "sizeBytes": 11,
                "dataKind": "instruction"
            }),
            &payload_ref("do the work"),
            &aead,
            "runtime-1",
        )
        .unwrap();
        assert_eq!(opened.plaintext.as_slice(), b"do the work");
    }
}
