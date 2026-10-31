//! L8-6 S7 part 2: what the desktop remembers about its device sessions (design 1b (c), W3.6, P6).
//!
//! - The owner's LOCAL policy of each session (payee, per-payment and per-day limits, expiry) lives only here. It is set
//!   once when the session is created on this computer and never changed by anything the server sends.
//! - The session private key is made here, kept in the OS keychain through `SecureStore` (PKCS#8, one entry per session)
//!   and never leaves Rust: there is no command that returns, exports or imports it.
//! - The file `own-wallet-session.json` (0600) is authenticated with HMAC-SHA256 under a keychain key. A file that does
//!   not verify counts as empty and off. It holds public values and the local policy only, no key material.
use crate::developer_runtime::home_node_identity::SecureStore;
use crate::own_wallet_session_chain::{addr20, key_fingerprint, parse_u128, to_hex, word32, Res};
use ring::rand::SystemRandom;
use ring::signature::{EcdsaKeyPair, KeyPair, ECDSA_P256_SHA256_FIXED_SIGNING};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use zeroize::{Zeroize, Zeroizing};

pub const FILE_NAME: &str = "own-wallet-session.json";
pub const MAC_KEY_SERVICE: &str = "agentrix.own_wallet_session";
pub const MAC_KEY_ACCOUNT: &str = "mac_key_v1";
/// The keychain service of the session private keys: its own name, so `OsKeyringStore` keeps it the same on production
/// and on the staging target (only the developer runtime's service is renamed there).
pub const KEY_SERVICE: &str = "agentrix.own_wallet_session";
const MAC_DOMAIN: &[u8] = b"agentrix.own-wallet-session.v1\n";
const SCHEMA_VERSION: u32 = 1;
const KEY_ACCOUNT_PREFIX: &str = "own_wallet_session_key_v1:";
pub const MAX_SESSIONS: usize = 20;
pub const MAX_LOG: usize = 50;
pub const DAY_MS: i64 = 86_400_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SlotStatus {
    /// Made on this computer, waiting for the owner's root signature on the wallet origin: signs nothing.
    Pending,
    /// The owner enabled it; the permission id was computed here from this key and the salt.
    Active,
    /// Revoked here (the key is deleted): signs nothing, ever.
    Revoked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativePolicy {
    pub payee: String,
    /// One payment at most (the chain's ValueLimit is cumulative, so this one exists on the device only).
    pub per_tx_wei: String,
    /// This computer's own cap per UTC day.
    pub daily_wei: String,
    /// The chain-side cumulative cap (ValueLimit).
    pub total_wei: String,
    /// The chain-side payment count (UsageLimit).
    pub max_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TokenPolicy {
    pub payee: String,
    pub per_transfer: String,
    pub daily: String,
    pub total: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalPolicy {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native: Option<NativePolicy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<TokenPolicy>,
}

/// What this key has signed on the current UTC day (decimal strings, wei and token units).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Usage {
    pub day: i64,
    pub native_wei: String,
    pub token_units: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Slot {
    pub slot_id: String,
    pub owner_user_id: String,
    pub device_id: String,
    pub account_id: String,
    /// The Agent's smart account (lower-case 0x address) this key may pay from.
    pub account: String,
    pub chain_id: u64,
    pub pub_key_x: String,
    pub pub_key_y: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub salt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permission_id: Option<String>,
    pub status: SlotStatus,
    pub policy: LocalPolicy,
    pub created_at: i64,
    /// Unix seconds, the TimeFrame `validUntil` the owner signs on the wallet origin.
    pub valid_until: i64,
    pub usage: Usage,
}

/// One line of the local log. Never a UserOp, an address or an amount: only the outcome and a reason code.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogEntry {
    pub at: i64,
    pub request_ref: String,
    pub outcome: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Store {
    pub schema_version: u32,
    /// The owner's switch on this computer. Off by default; while off nothing is created and nothing is signed.
    pub enabled: bool,
    pub sessions: Vec<Slot>,
    pub log: Vec<LogEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mac: Option<String>,
}

impl Default for Store {
    fn default() -> Self {
        Store { schema_version: SCHEMA_VERSION, enabled: false, sessions: Vec::new(), log: Vec::new(), mac: None }
    }
}

/// How the stored file read back.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Integrity {
    Empty,
    Ok,
    /// Present but unreadable or not verified: treated as empty and off.
    Tampered,
    /// The keychain key cannot be read: treated as empty and off.
    KeyUnavailable,
}

/// The MAC key (the OS keychain; tests use memory).
pub trait MacKey {
    fn get(&self, create: bool) -> Option<Zeroizing<[u8; 32]>>;
}

pub struct KeychainMacKey;

fn decode_key(text: &str) -> Option<Zeroizing<[u8; 32]>> {
    let bytes = Zeroizing::new(hex::decode(text.trim()).ok()?);
    let array: [u8; 32] = bytes.as_slice().try_into().ok()?;
    Some(Zeroizing::new(array))
}

impl MacKey for KeychainMacKey {
    fn get(&self, create: bool) -> Option<Zeroizing<[u8; 32]>> {
        let entry = keyring::Entry::new(MAC_KEY_SERVICE, MAC_KEY_ACCOUNT).ok()?;
        match entry.get_password() {
            Ok(text) => decode_key(&Zeroizing::new(text)),
            Err(keyring::Error::NoEntry) if create => {
                let fresh = Zeroizing::new(rand::random::<[u8; 32]>());
                entry.set_password(&Zeroizing::new(hex::encode(fresh.as_slice()))).ok()?;
                entry.get_password().ok().and_then(|text| decode_key(&Zeroizing::new(text)))
            }
            Err(_) => None,
        }
    }
}

fn mac_input(store: &Store) -> Option<Vec<u8>> {
    let mut unsigned = store.clone();
    unsigned.mac = None;
    let mut bytes = MAC_DOMAIN.to_vec();
    bytes.extend(serde_json::to_vec(&unsigned).ok()?);
    Some(bytes)
}

fn sign_store(store: &mut Store, key: &[u8; 32]) {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine as _;
    store.mac = None;
    if let Some(input) = mac_input(store) {
        let tag = ring::hmac::sign(&ring::hmac::Key::new(ring::hmac::HMAC_SHA256, key), &input);
        store.mac = Some(URL_SAFE_NO_PAD.encode(tag.as_ref()));
    }
}

fn verify_store(store: &Store, key: &[u8; 32]) -> bool {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine as _;
    let Some(mac) = store.mac.as_deref() else { return false };
    if store.schema_version != SCHEMA_VERSION {
        return false;
    }
    let (Ok(tag), Some(input)) = (URL_SAFE_NO_PAD.decode(mac), mac_input(store)) else {
        return false;
    };
    ring::hmac::verify(&ring::hmac::Key::new(ring::hmac::HMAC_SHA256, key), &input, &tag).is_ok()
}

/// Reads the store. Anything that does not verify is empty and off.
pub fn load(path: &Path, key: &dyn MacKey) -> (Store, Integrity) {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return (Store::default(), Integrity::Empty),
        Err(_) => return (Store::default(), Integrity::Tampered),
    };
    let Ok(store) = serde_json::from_slice::<Store>(&bytes) else {
        return (Store::default(), Integrity::Tampered);
    };
    let Some(mac_key) = key.get(false) else {
        return (Store::default(), Integrity::KeyUnavailable);
    };
    if !verify_store(&store, &mac_key) {
        return (Store::default(), Integrity::Tampered);
    }
    (store, Integrity::Ok)
}

/// Signs and writes atomically (0600).
pub fn save(path: &Path, store: &Store, key: &dyn MacKey) -> Res<()> {
    let mac_key = key.get(true).ok_or("session_store_key_unavailable")?;
    let mut signed = store.clone();
    signed.schema_version = SCHEMA_VERSION;
    sign_store(&mut signed, &mac_key);
    let bytes = serde_json::to_vec_pretty(&signed).map_err(|_| "session_store_write_failed")?;
    let dir = path.parent().ok_or("session_store_write_failed")?;
    std::fs::create_dir_all(dir).map_err(|_| "session_store_write_failed")?;
    let temp = dir.join(format!(".{FILE_NAME}.{}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
        return Err("session_store_write_failed");
    }
    Ok(())
}

// ── The session key in the keychain ──────────────────────────────────────────────────────────────────────────

fn key_account(slot_id: &str) -> String {
    format!("{KEY_ACCOUNT_PREFIX}{slot_id}")
}

/// Makes a P-256 key, stores its PKCS#8 under this slot and returns the public point (x, y). The private key is
/// zeroized here and read back from the keychain only to sign.
pub fn generate_session_key(keys: &dyn SecureStore, slot_id: &str) -> Res<([u8; 32], [u8; 32])> {
    let rng = SystemRandom::new();
    let document = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng).map_err(|_| "keygen_failed")?;
    let mut pkcs8 = document.as_ref().to_vec();
    let result = (|| -> Res<([u8; 32], [u8; 32])> {
        let pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &pkcs8, &rng).map_err(|_| "keygen_failed")?;
        let point = pair.public_key().as_ref();
        if point.len() != 65 || point[0] != 0x04 {
            return Err("keygen_failed");
        }
        let mut x = [0u8; 32];
        x.copy_from_slice(&point[1..33]);
        let mut y = [0u8; 32];
        y.copy_from_slice(&point[33..65]);
        keys.set(KEY_SERVICE, &key_account(slot_id), &pkcs8).map_err(|_| "keychain_unavailable")?;
        // Read it back: a key that was not really stored must not become a session.
        match keys.get(KEY_SERVICE, &key_account(slot_id)) {
            Ok(Some(mut back)) => {
                let same = back == pkcs8;
                back.zeroize();
                if !same {
                    return Err("keychain_unavailable");
                }
            }
            _ => return Err("keychain_unavailable"),
        }
        Ok((x, y))
    })();
    pkcs8.zeroize();
    result
}

pub fn load_session_key(keys: &dyn SecureStore, slot_id: &str) -> Res<Zeroizing<Vec<u8>>> {
    match keys.get(KEY_SERVICE, &key_account(slot_id)) {
        Ok(Some(bytes)) => Ok(Zeroizing::new(bytes)),
        Ok(None) => Err("session_key_missing"),
        Err(_) => Err("keychain_unavailable"),
    }
}

/// True when the keychain no longer holds the key (deleted, or it was never there).
pub fn delete_session_key(keys: &dyn SecureStore, slot_id: &str) -> bool {
    if keys.delete(KEY_SERVICE, &key_account(slot_id)).is_err() {
        return false;
    }
    matches!(keys.get(KEY_SERVICE, &key_account(slot_id)), Ok(None))
}

// ── Views for the owner's screen ─────────────────────────────────────────────────────────────────────────────

pub fn day_of(now_ms: i64) -> i64 {
    now_ms.div_euclid(DAY_MS)
}

/// (native wei, token units) signed today. A stored value that does not parse counts as used up (fail closed).
pub fn used_today(slot: &Slot, now_ms: i64) -> (u128, u128) {
    if slot.usage.day != day_of(now_ms) {
        return (0, 0);
    }
    (parse_u128(&slot.usage.native_wei).unwrap_or(u128::MAX), parse_u128(&slot.usage.token_units).unwrap_or(u128::MAX))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotView {
    pub slot_id: String,
    pub owner_user_id: String,
    pub device_id: String,
    pub account_id: String,
    pub account: String,
    pub chain_id: u64,
    pub pub_key_x: String,
    pub pub_key_y: String,
    pub fingerprint: String,
    pub permission_id: Option<String>,
    pub status: SlotStatus,
    pub policy: LocalPolicy,
    pub created_at: i64,
    pub valid_until: i64,
    pub expired: bool,
    pub native_used_today: String,
    pub token_used_today: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub enabled: bool,
    pub integrity: Integrity,
    pub sessions: Vec<SlotView>,
    pub log: Vec<LogEntry>,
}

pub fn view(store: &Store, integrity: Integrity, now_ms: i64) -> View {
    let sessions = store
        .sessions
        .iter()
        .map(|slot| {
            let fingerprint = match (word32(&slot.pub_key_x), word32(&slot.pub_key_y)) {
                (Some(x), Some(y)) => key_fingerprint(&x, &y),
                _ => String::new(),
            };
            let (native, token) = used_today(slot, now_ms);
            SlotView {
                slot_id: slot.slot_id.clone(),
                owner_user_id: slot.owner_user_id.clone(),
                device_id: slot.device_id.clone(),
                account_id: slot.account_id.clone(),
                account: slot.account.clone(),
                chain_id: slot.chain_id,
                pub_key_x: slot.pub_key_x.clone(),
                pub_key_y: slot.pub_key_y.clone(),
                fingerprint,
                permission_id: slot.permission_id.clone(),
                status: slot.status,
                policy: slot.policy.clone(),
                created_at: slot.created_at,
                valid_until: slot.valid_until,
                expired: now_ms >= slot.valid_until.saturating_mul(1000),
                native_used_today: native.to_string(),
                token_used_today: token.to_string(),
            }
        })
        .collect();
    View { enabled: store.enabled && integrity == Integrity::Ok, integrity, sessions, log: store.log.clone() }
}

/// A short, plain identifier (owner id, device id, account id, request ref): letters, digits, `. _ - :`, at most 64.
pub fn ident_ok(text: &str) -> bool {
    !text.is_empty() && text.len() <= 64 && text.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b'-' | b':'))
}

/// A lower-case 0x address that is not the zero address.
pub fn address_ok(text: &str) -> Option<String> {
    let bytes = addr20(text)?;
    if bytes == [0u8; 20] {
        return None;
    }
    Some(to_hex(&bytes))
}
