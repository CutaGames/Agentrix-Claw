//! Canonical JSON (the same bytes as `canonicalize` in `shared/soul-core-l1/v1_1/canonical.ts`: keys sorted by UTF-16 code
//! unit, no whitespace, integers only) and the small hex/SHA-256 helpers the rest of the crate uses.

use crate::SimError;
use ring::digest::{digest, SHA256};
use serde_json::Value;

pub fn hex_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(TABLE[(byte >> 4) as usize] as char);
        out.push(TABLE[(byte & 15) as usize] as char);
    }
    out
}

fn nibble(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        _ => None,
    }
}

/// Lower-case hex only, like every digest in the contracts.
pub fn hex_decode(text: &str) -> Option<Vec<u8>> {
    let bytes = text.as_bytes();
    if bytes.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(bytes.len() / 2);
    let mut i = 0;
    while i < bytes.len() {
        let high = nibble(bytes[i])?;
        let low = nibble(bytes[i + 1])?;
        out.push((high << 4) | low);
        i += 2;
    }
    Some(out)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex_encode(digest(&SHA256, bytes).as_ref())
}

/// Serialises `value` the way the TypeScript side does. Floats are refused: the contracts carry integers and strings only.
pub fn canonical_json(value: &Value) -> Result<String, SimError> {
    let mut out = String::new();
    write_value(value, &mut out)?;
    Ok(out)
}

fn write_value(value: &Value, out: &mut String) -> Result<(), SimError> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(flag) => out.push_str(if *flag { "true" } else { "false" }),
        Value::Number(number) => {
            if let Some(signed) = number.as_i64() {
                out.push_str(&signed.to_string());
            } else if let Some(unsigned) = number.as_u64() {
                out.push_str(&unsigned.to_string());
            } else {
                return Err(SimError::Invalid("non-integer number in canonical json"));
            }
        }
        Value::String(text) => {
            let quoted = serde_json::to_string(text).map_err(|_| SimError::Invalid("string"))?;
            out.push_str(&quoted);
        }
        Value::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_value(item, out)?;
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (index, key) in keys.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                let quoted = serde_json::to_string(key.as_str()).map_err(|_| SimError::Invalid("key"))?;
                out.push_str(&quoted);
                out.push(':');
                if let Some(inner) = map.get(key.as_str()) {
                    write_value(inner, out)?;
                }
            }
            out.push('}');
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sorts_keys_and_drops_whitespace() {
        let value = json!({"b": 1, "a": {"y": [true, null, "x"], "x": -5}});
        assert_eq!(canonical_json(&value).unwrap(), r#"{"a":{"x":-5,"y":[true,null,"x"]},"b":1}"#);
    }

    #[test]
    fn refuses_floats() {
        assert_eq!(canonical_json(&json!({"a": 1.5})), Err(SimError::Invalid("non-integer number in canonical json")));
    }

    #[test]
    fn hex_round_trip_and_case() {
        assert_eq!(hex_encode(&[0, 15, 255]), "000fff");
        assert_eq!(hex_decode("000fff"), Some(vec![0, 15, 255]));
        assert_eq!(hex_decode("000FFF"), None);
        assert_eq!(hex_decode("abc"), None);
    }

    #[test]
    fn sha256_of_abc() {
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
