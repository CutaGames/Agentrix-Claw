//! Deterministic JCS/1 canonicalization matching shared `canonicalizeJson`.

use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::types::DigestRef;
use serde_json::Value;

pub fn canonicalize_json(value: &Value) -> RuntimeResult<String> {
    write_canonical(value)
}

pub fn jcs_digest(value: &Value) -> RuntimeResult<DigestRef> {
    let canonical = canonicalize_json(value)?;
    Ok(DigestRef {
        algorithm: "sha-256".into(),
        canonicalization: "jcs/1".into(),
        value: crate::developer_runtime::crypto::sha256_hex(canonical.as_bytes()),
    })
}

fn write_canonical(value: &Value) -> RuntimeResult<String> {
    match value {
        Value::Null => Ok("null".into()),
        Value::Bool(true) => Ok("true".into()),
        Value::Bool(false) => Ok("false".into()),
        Value::Number(number) => {
            if let Some(float) = number.as_f64() {
                if !float.is_finite() {
                    return Err(RuntimeError::fail_closed("non_finite_number"));
                }
            }
            Ok(number.to_string())
        }
        Value::String(text) => serde_json::to_string(text)
            .map_err(|_| RuntimeError::fail_closed("unknown_schema")),
        Value::Array(items) => {
            let mut parts = Vec::with_capacity(items.len());
            for item in items {
                parts.push(write_canonical(item)?);
            }
            Ok(format!("[{}]", parts.join(",")))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut parts = Vec::new();
            for key in keys {
                let encoded_key = serde_json::to_string(key)
                    .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
                parts.push(format!("{}:{}", encoded_key, write_canonical(&map[key])?));
            }
            Ok(format!("{{{}}}", parts.join(",")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sorts_object_keys() {
        let left = canonicalize_json(&json!({ "b": 1, "a": "café" })).unwrap();
        let right = canonicalize_json(&json!({ "a": "café", "b": 1 })).unwrap();
        assert_eq!(left, right);
        assert_eq!(left, r#"{"a":"café","b":1}"#);
    }
}
