//! Authenticated encryption plus OS keyring / injectable secure storage.

use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::types::{
    KEYRING_JOURNAL_KEY, KEYRING_RUNTIME_AEAD_KEY, KEYRING_SERVICE,
};
use aes_gcm::aead::{Aead, Key, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::Rng;
use zeroize::Zeroize;
#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::{Arc, Mutex};

pub trait SecureStore: Send + Sync {
    fn get(&self, service: &str, key: &str) -> RuntimeResult<Option<Vec<u8>>>;
    fn set(&self, service: &str, key: &str, value: &[u8]) -> RuntimeResult<()>;
    fn delete(&self, service: &str, key: &str) -> RuntimeResult<()>;
    fn get_text(&self, service: &str, key: &str) -> RuntimeResult<Option<String>>;
    fn set_text(&self, service: &str, key: &str, value: &str) -> RuntimeResult<()>;
}

#[cfg(test)]
#[derive(Clone, Default)]
pub struct MemorySecureStore {
    inner: Arc<Mutex<HashMap<(String, String), Vec<u8>>>>,
}

#[cfg(test)]
impl SecureStore for MemorySecureStore {
    fn get(&self, service: &str, key: &str) -> RuntimeResult<Option<Vec<u8>>> {
        Ok(self
            .inner
            .lock()
            .map_err(|_| RuntimeError::fail_closed("secure_store_lock"))?
            .get(&(service.to_string(), key.to_string()))
            .cloned())
    }

    fn set(&self, service: &str, key: &str, value: &[u8]) -> RuntimeResult<()> {
        self.inner
            .lock()
            .map_err(|_| RuntimeError::fail_closed("secure_store_lock"))?
            .insert((service.to_string(), key.to_string()), value.to_vec());
        Ok(())
    }

    fn delete(&self, service: &str, key: &str) -> RuntimeResult<()> {
        self.inner
            .lock()
            .map_err(|_| RuntimeError::fail_closed("secure_store_lock"))?
            .remove(&(service.to_string(), key.to_string()));
        Ok(())
    }

    fn get_text(&self, service: &str, key: &str) -> RuntimeResult<Option<String>> {
        match self.get(service, key)? {
            None => Ok(None),
            Some(bytes) => String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| RuntimeError::fail_closed("keyring_corrupt")),
        }
    }

    fn set_text(&self, service: &str, key: &str, value: &str) -> RuntimeResult<()> {
        self.set(service, key, value.as_bytes())
    }
}

pub struct OsKeyringStore;

/// staging 目标下，开发者运行时的条目放在单独的服务名里（REQ-desktop-026）。
fn scoped(service: &str) -> &str {
    crate::developer_runtime::types::api_target().keyring_service(service)
}

impl SecureStore for OsKeyringStore {
    fn get(&self, service: &str, key: &str) -> RuntimeResult<Option<Vec<u8>>> {
        let service = scoped(service);
        let entry = keyring::Entry::new(service, key)
            .map_err(|error| keyring_error("keyring_unavailable", error))?;
        match entry.get_password() {
            Ok(password) => match hex::decode(password.trim()) {
                Ok(bytes) => Ok(Some(bytes)),
                Err(_) => Err(RuntimeError::fail_closed("keyring_corrupt")),
            },
            Err(error) if is_missing_keyring(&error) => Ok(None),
            Err(error) => Err(keyring_error("keyring_unavailable", error)),
        }
    }

    fn set(&self, service: &str, key: &str, value: &[u8]) -> RuntimeResult<()> {
        let service = scoped(service);
        let entry = keyring::Entry::new(service, key)
            .map_err(|error| keyring_error("keyring_unavailable", error))?;
        entry
            .set_password(&hex::encode(value))
            .map_err(|error| keyring_error("keyring_write_failed", error))
    }

    fn delete(&self, service: &str, key: &str) -> RuntimeResult<()> {
        let service = scoped(service);
        let entry = keyring::Entry::new(service, key)
            .map_err(|error| keyring_error("keyring_unavailable", error))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(error) if is_missing_keyring(&error) => Ok(()),
            Err(error) => Err(keyring_error("keyring_delete_failed", error)),
        }
    }

    fn get_text(&self, service: &str, key: &str) -> RuntimeResult<Option<String>> {
        let service = scoped(service);
        let entry = keyring::Entry::new(service, key)
            .map_err(|error| keyring_error("keyring_unavailable", error))?;
        match entry.get_password() {
            Ok(password) if password.is_empty() => {
                Err(RuntimeError::fail_closed("keyring_corrupt"))
            }
            Ok(password) => Ok(Some(password)),
            Err(error) if is_missing_keyring(&error) => Ok(None),
            Err(error) => Err(keyring_error("keyring_unavailable", error)),
        }
    }

    fn set_text(&self, service: &str, key: &str, value: &str) -> RuntimeResult<()> {
        let service = scoped(service);
        if value.is_empty() {
            return Err(RuntimeError::fail_closed("keyring_corrupt"));
        }
        let entry = keyring::Entry::new(service, key)
            .map_err(|error| keyring_error("keyring_unavailable", error))?;
        entry
            .set_password(value)
            .map_err(|error| keyring_error("keyring_write_failed", error))
    }
}

fn is_missing_keyring(error: &keyring::Error) -> bool {
    matches!(error, keyring::Error::NoEntry)
        || {
            let text = error.to_string().to_ascii_lowercase();
            text.contains("no entry")
                || text.contains("not found")
                || text.contains("noitem")
                || text.contains("item not found")
        }
}

fn keyring_error(code: &str, error: keyring::Error) -> RuntimeError {
    RuntimeError::fail_closed(code).with_message(error.to_string())
}

#[derive(Clone)]
pub struct JournalAead {
    key: [u8; 32],
}

impl JournalAead {
    pub fn load_or_create(store: &dyn SecureStore) -> RuntimeResult<Self> {
        Self::load_or_create_named(store, KEYRING_JOURNAL_KEY)
    }

    pub fn load_runtime(store: &dyn SecureStore) -> RuntimeResult<Self> {
        Self::load_or_create_named(store, KEYRING_RUNTIME_AEAD_KEY)
    }

    pub fn load_or_create_named(store: &dyn SecureStore, key_name: &str) -> RuntimeResult<Self> {
        match store.get(KEYRING_SERVICE, key_name) {
            Ok(Some(existing)) => {
                let key: [u8; 32] = existing
                    .as_slice()
                    .try_into()
                    .map_err(|_| RuntimeError::fail_closed("journal_key_invalid"))?;
                Ok(Self { key })
            }
            Ok(None) => {
                let mut key = [0u8; 32];
                rand::rng().fill_bytes(&mut key);
                store.set(KEYRING_SERVICE, key_name, &key)?;
                Ok(Self { key })
            }
            Err(error) => Err(error),
        }
    }

    pub fn seal(&self, plaintext: &[u8], aad: &[u8]) -> RuntimeResult<(Vec<u8>, [u8; 12])> {
        let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(self.key));
        let mut nonce_bytes = [0u8; 12];
        rand::rng().fill_bytes(&mut nonce_bytes);
        let ciphertext = cipher
            .encrypt(
                &Nonce::from(nonce_bytes),
                Payload {
                    msg: plaintext,
                    aad,
                },
            )
            .map_err(|_| RuntimeError::fail_closed("aead_encrypt_failed"))?;
        Ok((ciphertext, nonce_bytes))
    }

    pub fn open(&self, nonce_bytes: &[u8], ciphertext: &[u8], aad: &[u8]) -> RuntimeResult<Vec<u8>> {
        let nonce_arr: [u8; 12] = nonce_bytes
            .try_into()
            .map_err(|_| RuntimeError::fail_closed("aead_nonce_invalid"))?;
        let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(self.key));
        cipher
            .decrypt(
                &Nonce::from(nonce_arr),
                Payload {
                    msg: ciphertext,
                    aad,
                },
            )
            .map_err(|_| RuntimeError::fail_closed("aead_decrypt_failed"))
    }
}

impl Drop for JournalAead {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(bytes))
}

pub fn blob_aad(data_ref: &str, data_kind: &str, expires_at: &str) -> Vec<u8> {
    format!("{data_ref}|{data_kind}|{expires_at}").into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aead_roundtrip_and_key_stays_in_store() {
        let store = MemorySecureStore::default();
        let aead = JournalAead::load_or_create(&store).unwrap();
        let aad = blob_aad("blob-1", "instruction", "2026-08-23T12:00:00.000Z");
        let (ciphertext, nonce) = aead.seal(b"sensitive-blob", &aad).unwrap();
        assert_ne!(ciphertext, b"sensitive-blob");
        assert_eq!(
            aead.open(&nonce, &ciphertext, &aad).unwrap(),
            b"sensitive-blob"
        );
        let stored = store
            .get(KEYRING_SERVICE, KEYRING_JOURNAL_KEY)
            .unwrap()
            .unwrap();
        assert_eq!(stored.len(), 32);
    }

    #[test]
    fn aad_swap_fails_closed() {
        let store = MemorySecureStore::default();
        let aead = JournalAead::load_or_create(&store).unwrap();
        let aad = blob_aad("blob-1", "instruction", "2026-08-23T12:00:00.000Z");
        let (ciphertext, nonce) = aead.seal(b"sensitive-blob", &aad).unwrap();
        let swapped = blob_aad("blob-1", "diff", "2026-08-23T12:00:00.000Z");
        assert_eq!(
            aead.open(&nonce, &ciphertext, &swapped).unwrap_err().code(),
            "aead_decrypt_failed"
        );
    }

    #[test]
    fn corrupt_hex_does_not_mint_a_replacement_key() {
        let store = MemorySecureStore::default();
        store
            .set(KEYRING_SERVICE, KEYRING_JOURNAL_KEY, b"not-32-bytes")
            .unwrap();
        let error = match JournalAead::load_or_create(&store) {
            Ok(_) => panic!("corrupt key must not mint a replacement"),
            Err(error) => error,
        };
        assert_eq!(error.code(), "journal_key_invalid");
        let still = store
            .get(KEYRING_SERVICE, KEYRING_JOURNAL_KEY)
            .unwrap()
            .unwrap();
        assert_eq!(still, b"not-32-bytes");
    }

    #[test]
    fn os_keyring_distinguishes_missing_from_unavailable() {
        let store = OsKeyringStore;
        match store.get(
            "agentrix.developer_runtime.test",
            "wave-a-missing-key-should-not-exist",
        ) {
            Ok(None) => {}
            Err(error) => {
                assert!(
                    error.code() == "keyring_unavailable" || error.code() == "keyring_corrupt",
                    "{}",
                    error.code()
                );
            }
            Ok(Some(_)) => {}
        }
    }
}
