//! L8 E4 — the desktop's device key for the private vault (`shared/types/private-vault.ts`).
//!
//! The vault key (32 bytes) is made in the WebView and wrapped here under a key that lives in the OS keychain and never leaves
//! Rust: the WebView sends the vault key in, gets ciphertext back, and the server stores that ciphertext. To open the vault the
//! WebView sends the ciphertext back in and receives the vault key for as long as it keeps the vault open.
//!
//! The old `desktop_bridge_keychain_*` commands are NOT used for this: they write an XOR-obfuscated file, not the OS keychain.
//! This module goes through `OsKeyringStore` (the same store the developer runtime keys use).
//!
//! Nothing here logs a key, a plaintext or a ciphertext, and errors are short codes. Unwrapping never mints a new device key: a
//! missing key is an error (`no_device_key`), so a lost keychain entry cannot silently turn into a different, empty key.
use crate::developer_runtime::crypto::{JournalAead, OsKeyringStore, SecureStore};
use crate::developer_runtime::types::KEYRING_SERVICE;
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;
use zeroize::Zeroize;

/// Keychain account of the vault's device key (under the developer runtime service).
pub const KEYRING_PRIVATE_VAULT_KEY: &str = "private_vault_kek_v1";
const VAULT_KEY_BYTES: usize = 32;
const IV_BYTES: usize = 12;
/// Tag included: 32-byte vault key + 16-byte tag.
const WRAPPED_BYTES: usize = 48;
const MAX_AAD_BYTES: usize = 512;

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WrappedVaultKey {
    /// base64, 12 bytes.
    pub iv: String,
    /// base64, 48 bytes (the wrapped vault key and its tag).
    pub ciphertext: String,
}

fn decode(value: &str, max: usize, code: &str) -> Result<Vec<u8>, String> {
    // Bound the text before decoding it.
    if value.len() > max.saturating_mul(4) / 3 + 8 {
        return Err(code.to_string());
    }
    let bytes = STANDARD.decode(value).map_err(|_| code.to_string())?;
    if bytes.len() > max {
        return Err(code.to_string());
    }
    Ok(bytes)
}

/// Whether the keychain already holds this device's vault key.
pub fn status_with(store: &dyn SecureStore) -> Result<bool, String> {
    match store.get(KEYRING_SERVICE, KEYRING_PRIVATE_VAULT_KEY) {
        Ok(Some(_)) => Ok(true),
        Ok(None) => Ok(false),
        Err(_) => Err("keychain_unavailable".to_string()),
    }
}

/// Wrap the vault key under the keychain key (made on first use). `aad` binds owner, slot id and slot kind.
pub fn wrap_with(store: &dyn SecureStore, vault_key_b64: &str, aad_b64: &str) -> Result<WrappedVaultKey, String> {
    let mut vault_key = decode(vault_key_b64, VAULT_KEY_BYTES, "vault_key_invalid")?;
    let result: Result<WrappedVaultKey, String> = (|| {
        if vault_key.len() != VAULT_KEY_BYTES {
            return Err("vault_key_invalid".to_string());
        }
        let aad = decode(aad_b64, MAX_AAD_BYTES, "aad_invalid")?;
        if aad.is_empty() {
            return Err("aad_invalid".to_string());
        }
        let aead = JournalAead::load_or_create_named(store, KEYRING_PRIVATE_VAULT_KEY).map_err(|_| "keychain_unavailable".to_string())?;
        let (ciphertext, nonce) = aead.seal(&vault_key, &aad).map_err(|_| "wrap_failed".to_string())?;
        Ok(WrappedVaultKey { iv: STANDARD.encode(nonce), ciphertext: STANDARD.encode(ciphertext) })
    })();
    vault_key.zeroize();
    result
}

/// Unwrap a vault key made by `wrap_with`. Returns it as base64 for the WebView; the keychain key stays here.
pub fn unwrap_with(store: &dyn SecureStore, iv_b64: &str, ciphertext_b64: &str, aad_b64: &str) -> Result<String, String> {
    let iv = decode(iv_b64, IV_BYTES, "iv_invalid")?;
    let ciphertext = decode(ciphertext_b64, WRAPPED_BYTES, "ciphertext_invalid")?;
    let aad = decode(aad_b64, MAX_AAD_BYTES, "aad_invalid")?;
    if iv.len() != IV_BYTES || ciphertext.len() != WRAPPED_BYTES || aad.is_empty() {
        return Err("input_invalid".to_string());
    }
    // Never make a key here: opening with a freshly made key could only fail, and would hide that the real one is gone.
    match store.get(KEYRING_SERVICE, KEYRING_PRIVATE_VAULT_KEY) {
        Ok(Some(_)) => {}
        Ok(None) => return Err("no_device_key".to_string()),
        Err(_) => return Err("keychain_unavailable".to_string()),
    }
    let aead = JournalAead::load_or_create_named(store, KEYRING_PRIVATE_VAULT_KEY).map_err(|_| "keychain_unavailable".to_string())?;
    let mut opened = aead.open(&iv, &ciphertext, &aad).map_err(|_| "cannot_open".to_string())?;
    if opened.len() != VAULT_KEY_BYTES {
        opened.zeroize();
        return Err("cannot_open".to_string());
    }
    let encoded = STANDARD.encode(&opened);
    opened.zeroize();
    Ok(encoded)
}

#[tauri::command(async)]
pub async fn desktop_bridge_private_vault_status() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| status_with(&OsKeyringStore))
        .await
        .map_err(|_| "status_failed".to_string())?
}

#[tauri::command(async)]
pub async fn desktop_bridge_private_vault_wrap(vault_key_b64: String, aad_b64: String) -> Result<WrappedVaultKey, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut vault_key_b64 = vault_key_b64;
        let result = wrap_with(&OsKeyringStore, &vault_key_b64, &aad_b64);
        vault_key_b64.zeroize();
        result
    })
    .await
    .map_err(|_| "wrap_failed".to_string())?
}

#[tauri::command(async)]
pub async fn desktop_bridge_private_vault_unwrap(iv_b64: String, ciphertext_b64: String, aad_b64: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || unwrap_with(&OsKeyringStore, &iv_b64, &ciphertext_b64, &aad_b64))
        .await
        .map_err(|_| "unwrap_failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::crypto::MemorySecureStore;

    const AAD: &str = "YWdlbnRyaXgucHJpdmF0ZS12YXVsdC5zbG90LnYxCnVzZXItMQpzbG90LTEKZGV2aWNlX2tleWNoYWlu";

    fn vault_key_b64(fill: u8) -> String {
        STANDARD.encode([fill; 32])
    }

    #[test]
    fn wraps_and_unwraps_and_the_device_key_stays_in_the_store() {
        let store = MemorySecureStore::default();
        assert_eq!(status_with(&store), Ok(false));
        let key = vault_key_b64(7);
        let wrapped = wrap_with(&store, &key, AAD).unwrap();
        assert_eq!(STANDARD.decode(&wrapped.iv).unwrap().len(), 12);
        assert_eq!(STANDARD.decode(&wrapped.ciphertext).unwrap().len(), 48);
        assert_ne!(wrapped.ciphertext, key);
        assert_eq!(status_with(&store), Ok(true));
        assert_eq!(unwrap_with(&store, &wrapped.iv, &wrapped.ciphertext, AAD).unwrap(), key);
        // the stored device key is 32 bytes and is not the vault key
        let stored = store.get(KEYRING_SERVICE, KEYRING_PRIVATE_VAULT_KEY).unwrap().unwrap();
        assert_eq!(stored.len(), 32);
        assert_ne!(stored, vec![7u8; 32]);
    }

    #[test]
    fn wrapping_twice_gives_different_ciphertext() {
        let store = MemorySecureStore::default();
        let key = vault_key_b64(1);
        let a = wrap_with(&store, &key, AAD).unwrap();
        let b = wrap_with(&store, &key, AAD).unwrap();
        assert_ne!(a.iv, b.iv);
        assert_ne!(a.ciphertext, b.ciphertext);
    }

    #[test]
    fn another_binding_another_device_key_or_a_changed_byte_cannot_open() {
        let store = MemorySecureStore::default();
        let wrapped = wrap_with(&store, &vault_key_b64(9), AAD).unwrap();
        // different additional data (another owner / slot / kind)
        let other_aad = STANDARD.encode(b"agentrix.private-vault.slot.v1\nuser-2\nslot-1\ndevice_keychain");
        assert_eq!(unwrap_with(&store, &wrapped.iv, &wrapped.ciphertext, &other_aad), Err("cannot_open".to_string()));
        // another computer's keychain
        let elsewhere = MemorySecureStore::default();
        wrap_with(&elsewhere, &vault_key_b64(3), AAD).unwrap();
        assert_eq!(unwrap_with(&elsewhere, &wrapped.iv, &wrapped.ciphertext, AAD), Err("cannot_open".to_string()));
        // a changed ciphertext byte
        let mut bytes = STANDARD.decode(&wrapped.ciphertext).unwrap();
        bytes[0] ^= 1;
        assert_eq!(unwrap_with(&store, &wrapped.iv, &STANDARD.encode(bytes), AAD), Err("cannot_open".to_string()));
        // a changed iv
        let mut iv = STANDARD.decode(&wrapped.iv).unwrap();
        iv[0] ^= 1;
        assert_eq!(unwrap_with(&store, &STANDARD.encode(iv), &wrapped.ciphertext, AAD), Err("cannot_open".to_string()));
    }

    #[test]
    fn unwrapping_never_makes_a_device_key() {
        let store = MemorySecureStore::default();
        let result = unwrap_with(&store, &STANDARD.encode([0u8; 12]), &STANDARD.encode([0u8; 48]), AAD);
        assert_eq!(result, Err("no_device_key".to_string()));
        assert_eq!(status_with(&store), Ok(false));
    }

    #[test]
    fn refuses_a_vault_key_of_the_wrong_size_bad_base64_or_oversized_input() {
        let store = MemorySecureStore::default();
        assert_eq!(wrap_with(&store, &STANDARD.encode([1u8; 16]), AAD), Err("vault_key_invalid".to_string()));
        assert_eq!(wrap_with(&store, &STANDARD.encode([1u8; 33]), AAD), Err("vault_key_invalid".to_string()));
        assert_eq!(wrap_with(&store, "not base64!", AAD), Err("vault_key_invalid".to_string()));
        assert_eq!(wrap_with(&store, &vault_key_b64(1), ""), Err("aad_invalid".to_string()));
        assert_eq!(wrap_with(&store, &vault_key_b64(1), &"A".repeat(4000)), Err("aad_invalid".to_string()));
        assert_eq!(wrap_with(&store, &vault_key_b64(1), "!!"), Err("aad_invalid".to_string()));
        // nothing was made in the keychain by the refusals
        assert_eq!(status_with(&store), Ok(false));
        assert_eq!(unwrap_with(&store, "AAAA", &STANDARD.encode([0u8; 48]), AAD), Err("input_invalid".to_string()));
        assert_eq!(unwrap_with(&store, &STANDARD.encode([0u8; 12]), &STANDARD.encode([0u8; 47]), AAD), Err("input_invalid".to_string()));
        assert_eq!(unwrap_with(&store, &STANDARD.encode([0u8; 12]), &STANDARD.encode([0u8; 200]), AAD), Err("ciphertext_invalid".to_string()));
    }

    #[test]
    fn the_wrapped_bytes_do_not_contain_the_vault_key() {
        let store = MemorySecureStore::default();
        let wrapped = wrap_with(&store, &vault_key_b64(0x5a), AAD).unwrap();
        let bytes = STANDARD.decode(&wrapped.ciphertext).unwrap();
        assert!(!bytes.windows(8).any(|window| window == [0x5a; 8]));
    }
}
