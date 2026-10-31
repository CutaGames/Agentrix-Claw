//! L8-6 S7 part 2: the desktop session signer (design 1b (b) and (c), W3.6, P6). Default off.
//!
//! The cloud Agent pays from its own smart account with a SmartSessions session whose key lives on this computer. The
//! server hands this module a complete unsigned UserOp; before the key signs, EVERYTHING is checked again here against
//! the policy the owner set on this computer (not against anything the server says):
//! the owner, the chain, the pinned EntryPoint, the session's registered permission id and account, the expiry, the hash
//! (recomputed here, never taken from the server), the SmartSessions nonce key, `execute` single + default, no paymaster
//! on a test network, the gas caps, and the payment itself (native coin to the one payee, or the pinned token's
//! `transfer` to the one payee) within the per-payment and the per-day limit of this computer.
//!
//! What is deliberately NOT here: a command that signs given bytes, a command that returns or imports a key, any path
//! that changes a policy except creating a new session. The owner's screen is the only caller of these commands (no chat
//! tool or remote channel maps to them; the fence registry has none of them). The emergency stop blocks every command
//! that could lead to a signature.
//!
//! The pure byte rules are in `own_wallet_session_chain.rs`, the stored state in `own_wallet_session_store.rs`.
use crate::developer_runtime::home_node_identity::{OsKeyringStore, SecureStore};
use crate::own_wallet_session_chain::{
    self as chain, addr20, be32_to_u128, decode_single_execute, exec_mode_problem, gas_problem, hex_to_bytes, pack, parse_u128, paymaster_problem, to_hex,
    user_op_hash, word32, Res, UserOp,
};
use crate::own_wallet_session_store::{
    address_ok, day_of, delete_session_key, generate_session_key, ident_ok, load_session_key, used_today, LocalPolicy, LogEntry, NativePolicy, Slot, SlotStatus,
    Store, TokenPolicy, Usage, MAX_LOG, MAX_SESSIONS,
};
use crate::own_wallet_session_store::{self as session_store, Integrity, KeychainMacKey, View};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

const MIN_LIFETIME_SECONDS: i64 = 60;
const MAX_LIFETIME_SECONDS: i64 = 30 * 24 * 60 * 60;
const MAX_COUNT: u32 = 1000;

// ── The request the server's pending payment becomes ─────────────────────────────────────────────────────────

/// One pending payment (`OwnWalletDeviceRequestV1`) plus the owner who is signed in on this computer.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SignRequest {
    pub owner_user_id: String,
    pub request_ref: String,
    pub permission_id: String,
    pub chain_id: u64,
    pub entry_point: String,
    pub user_op: UserOp,
    pub user_op_hash: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Native,
    Token,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Approved {
    pub user_op_hash: [u8; 32],
    pub kind: Kind,
    pub amount: u128,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignOutcome {
    /// `0x` + `r || s` (128 hex digits), low `s`.
    pub signature: String,
    pub permission_id: String,
    pub user_op_hash: String,
    pub kind: String,
}

// ── The decision (design 1b (c)) ─────────────────────────────────────────────────────────────────────────────

/// Every check, in a fixed order, as a reason code. Pure: no key, no file, no clock except `now_ms`.
pub fn authorize(slot: &Slot, request: &SignRequest, now_ms: i64) -> Res<Approved> {
    if slot.status != SlotStatus::Active {
        return Err("session_not_active");
    }
    if request.owner_user_id != slot.owner_user_id {
        return Err("owner_mismatch");
    }
    let rules = chain::chain_rules(slot.chain_id).ok_or("chain_not_allowed")?;
    if request.chain_id != slot.chain_id {
        return Err("chain_mismatch");
    }
    let entry_point = addr20(&request.entry_point).ok_or("entry_point_not_pinned")?;
    if Some(entry_point) != addr20(chain::ENTRY_POINT_V07) {
        return Err("entry_point_not_pinned");
    }
    if now_ms >= slot.valid_until.saturating_mul(1000) {
        return Err("session_expired");
    }
    let requested = word32(&request.permission_id).ok_or("permission_not_registered")?;
    if slot.permission_id.as_deref() != Some(to_hex(&requested).as_str()) {
        return Err("permission_not_registered");
    }
    let op = &request.user_op;
    if addr20(&op.sender) != addr20(&slot.account) || addr20(&slot.account).is_none() {
        return Err("account_not_registered");
    }
    if op.factory.is_some() {
        return Err("init_code_not_allowed");
    }
    if op.signature != "0x" {
        return Err("signature_not_empty");
    }
    let packed = pack(op)?;
    // The hash the key signs is the one computed here. The server's hash only has to agree with it.
    let hash = user_op_hash(&packed, &entry_point, slot.chain_id);
    let claimed = word32(&request.user_op_hash).ok_or("user_op_hash_mismatch")?;
    if claimed != hash {
        return Err("user_op_hash_mismatch");
    }
    let nonce_key = chain::session_nonce_key().ok_or("chain_not_allowed")?;
    if packed.nonce[..24] != nonce_key[..] {
        return Err("nonce_not_session");
    }
    if let Some(code) = exec_mode_problem(&op.call_data, true) {
        return Err(code);
    }
    let paymaster_data = to_hex(&packed.paymaster_and_data);
    if let Some(code) = paymaster_problem(slot.chain_id, &paymaster_data, &[]) {
        return Err(code);
    }
    if let Some(code) = gas_problem(rules, op) {
        return Err(code);
    }
    let call_data = hex_to_bytes(&op.call_data).ok_or("user_op_malformed")?;
    let exec = decode_single_execute(&call_data).ok_or("calldata_not_allowed")?;
    let value = be32_to_u128(&exec.value).ok_or("amount_over_limit")?;
    let (used_native, used_token) = used_today(slot, now_ms);
    if exec.data.is_empty() {
        // The native coin to the one payee.
        let policy = slot.policy.native.as_ref().ok_or("action_not_allowed")?;
        let payee = addr20(&policy.payee).ok_or("policy_invalid")?;
        if exec.target != payee {
            return Err("payee_not_allowed");
        }
        if value == 0 {
            return Err("amount_zero");
        }
        let per_tx = parse_u128(&policy.per_tx_wei).ok_or("policy_invalid")?;
        let daily = parse_u128(&policy.daily_wei).ok_or("policy_invalid")?;
        if value > per_tx {
            return Err("amount_over_limit");
        }
        match used_native.checked_add(value) {
            Some(total) if total <= daily => {}
            _ => return Err("daily_limit_exceeded"),
        }
        return Ok(Approved { user_op_hash: hash, kind: Kind::Native, amount: value });
    }
    // The pinned token's transfer(to, amount) to the one payee, with no native value.
    let policy = slot.policy.token.as_ref().ok_or("action_not_allowed")?;
    if Some(exec.target) != addr20(rules.token) || value != 0 {
        return Err("action_not_allowed");
    }
    if exec.data.len() != 68 || exec.data[..4] != chain::ERC20_TRANSFER_SELECTOR[..] || exec.data[4..16].iter().any(|b| *b != 0) {
        return Err("action_not_allowed");
    }
    let payee = addr20(&policy.payee).ok_or("policy_invalid")?;
    if exec.data[16..36] != payee[..] {
        return Err("payee_not_allowed");
    }
    let mut amount_word = [0u8; 32];
    amount_word.copy_from_slice(&exec.data[36..68]);
    let amount = be32_to_u128(&amount_word).ok_or("amount_over_limit")?;
    if amount == 0 {
        return Err("amount_zero");
    }
    let per_transfer = parse_u128(&policy.per_transfer).ok_or("policy_invalid")?;
    let daily = parse_u128(&policy.daily).ok_or("policy_invalid")?;
    if amount > per_transfer {
        return Err("amount_over_limit");
    }
    match used_token.checked_add(amount) {
        Some(total) if total <= daily => {}
        _ => return Err("daily_limit_exceeded"),
    }
    Ok(Approved { user_op_hash: hash, kind: Kind::Token, amount })
}

// ── Creating, activating, revoking, signing ──────────────────────────────────────────────────────────────────

/// What the owner types on this computer. Everything here is checked again in `create_slot`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateInput {
    pub owner_user_id: String,
    pub device_id: String,
    pub account_id: String,
    pub account: String,
    pub chain_id: u64,
    /// Unix seconds.
    pub valid_until: i64,
    #[serde(default)]
    pub native: Option<NativePolicy>,
    #[serde(default)]
    pub token: Option<TokenPolicy>,
}

/// The `grant_session` parameters the main site passes on (`decodeSessionParamsV1`). The per-day limit stays here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantParams {
    pub device_id: String,
    pub session_pub_key_x: String,
    pub session_pub_key_y: String,
    pub valid_until: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native: Option<GrantNative>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<GrantToken>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantNative {
    pub payee: String,
    pub per_tx_wei: String,
    pub total_wei: String,
    pub max_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantToken {
    pub payee: String,
    pub per_transfer: String,
    pub total: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOutput {
    pub slot_id: String,
    pub fingerprint: String,
    pub grant_params: GrantParams,
}

fn positive(text: &str) -> Res<u128> {
    match parse_u128(text) {
        Some(v) if v > 0 => Ok(v),
        _ => Err("policy_invalid"),
    }
}

fn check_native(policy: &NativePolicy, account: &str) -> Res<NativePolicy> {
    let payee = address_ok(&policy.payee).ok_or("policy_invalid")?;
    if payee == account {
        return Err("policy_invalid");
    }
    let per_tx = positive(&policy.per_tx_wei)?;
    let daily = positive(&policy.daily_wei)?;
    let total = positive(&policy.total_wei)?;
    if per_tx > total || per_tx > daily || policy.max_count == 0 || policy.max_count > MAX_COUNT {
        return Err("policy_invalid");
    }
    Ok(NativePolicy { payee, per_tx_wei: policy.per_tx_wei.clone(), daily_wei: policy.daily_wei.clone(), total_wei: policy.total_wei.clone(), max_count: policy.max_count })
}

fn check_token(policy: &TokenPolicy, account: &str) -> Res<TokenPolicy> {
    let payee = address_ok(&policy.payee).ok_or("policy_invalid")?;
    if payee == account {
        return Err("policy_invalid");
    }
    let per = positive(&policy.per_transfer)?;
    let daily = positive(&policy.daily)?;
    let total = positive(&policy.total)?;
    if per > total || per > daily {
        return Err("policy_invalid");
    }
    Ok(TokenPolicy { payee, per_transfer: policy.per_transfer.clone(), daily: policy.daily.clone(), total: policy.total.clone() })
}

fn new_slot_id() -> String {
    format!("ows_{}", hex::encode(rand::random::<[u8; 12]>()))
}

/// Drops revoked and expired sessions (and their keys) to make room, only when the list is full.
fn make_room(store: &mut Store, keys: &dyn SecureStore, now_ms: i64) {
    if store.sessions.len() < MAX_SESSIONS {
        return;
    }
    let mut kept = Vec::with_capacity(store.sessions.len());
    for slot in store.sessions.drain(..) {
        if slot.status == SlotStatus::Revoked || now_ms >= slot.valid_until.saturating_mul(1000) {
            delete_session_key(keys, &slot.slot_id);
        } else {
            kept.push(slot);
        }
    }
    store.sessions = kept;
}

/// Makes the session key in the keychain and a pending slot. The owner signs the grant on the wallet origin afterwards.
pub fn create_slot(store: &mut Store, keys: &dyn SecureStore, input: &CreateInput, now_ms: i64) -> Res<CreateOutput> {
    if !ident_ok(&input.owner_user_id) || !ident_ok(&input.device_id) || !ident_ok(&input.account_id) {
        return Err("input_invalid");
    }
    if input.device_id.contains(':') {
        return Err("input_invalid");
    }
    let account = address_ok(&input.account).ok_or("input_invalid")?;
    if chain::chain_rules(input.chain_id).is_none() {
        return Err("chain_not_allowed");
    }
    let now_s = now_ms.div_euclid(1000);
    if input.valid_until < now_s + MIN_LIFETIME_SECONDS || input.valid_until > now_s + MAX_LIFETIME_SECONDS {
        return Err("expiry_invalid");
    }
    if input.native.is_none() && input.token.is_none() {
        return Err("policy_invalid");
    }
    let native = match &input.native {
        Some(p) => Some(check_native(p, &account)?),
        None => None,
    };
    let token = match &input.token {
        Some(p) => Some(check_token(p, &account)?),
        None => None,
    };
    make_room(store, keys, now_ms);
    if store.sessions.len() >= MAX_SESSIONS {
        return Err("too_many_sessions");
    }
    let slot_id = new_slot_id();
    let (x, y) = generate_session_key(keys, &slot_id)?;
    let slot = Slot {
        slot_id: slot_id.clone(),
        owner_user_id: input.owner_user_id.clone(),
        device_id: input.device_id.clone(),
        account_id: input.account_id.clone(),
        account,
        chain_id: input.chain_id,
        pub_key_x: to_hex(&x),
        pub_key_y: to_hex(&y),
        salt: None,
        permission_id: None,
        status: SlotStatus::Pending,
        policy: LocalPolicy { native: native.clone(), token: token.clone() },
        created_at: now_ms,
        valid_until: input.valid_until,
        usage: Usage::default(),
    };
    let grant_params = GrantParams {
        device_id: slot.device_id.clone(),
        session_pub_key_x: slot.pub_key_x.clone(),
        session_pub_key_y: slot.pub_key_y.clone(),
        valid_until: slot.valid_until,
        native: native.map(|p| GrantNative { payee: p.payee, per_tx_wei: p.per_tx_wei, total_wei: p.total_wei, max_count: p.max_count }),
        token: token.map(|p| GrantToken { payee: p.payee, per_transfer: p.per_transfer, total: p.total }),
    };
    store.sessions.push(slot);
    Ok(CreateOutput { slot_id, fingerprint: chain::key_fingerprint(&x, &y), grant_params })
}

/// The owner enabled the session on the wallet origin. The permission id is computed HERE from this key and the salt the
/// server stored; the server's own id (when given) only has to agree.
pub fn activate(store: &mut Store, slot_id: &str, salt: &str, server_permission_id: Option<&str>, now_ms: i64) -> Res<String> {
    let index = store.sessions.iter().position(|s| s.slot_id == slot_id).ok_or("session_not_found")?;
    let salt_bytes = word32(salt).ok_or("input_invalid")?;
    let (x, y, status, valid_until) = {
        let slot = &store.sessions[index];
        (word32(&slot.pub_key_x).ok_or("session_key_invalid")?, word32(&slot.pub_key_y).ok_or("session_key_invalid")?, slot.status, slot.valid_until)
    };
    if status != SlotStatus::Pending {
        return Err("session_not_pending");
    }
    if now_ms >= valid_until.saturating_mul(1000) {
        return Err("session_expired");
    }
    let id = to_hex(&chain::permission_id(&x, &y, &salt_bytes).ok_or("session_key_invalid")?);
    if let Some(given) = server_permission_id {
        if word32(given).map(|w| to_hex(&w)) != Some(id.clone()) {
            return Err("permission_id_mismatch");
        }
    }
    if store.sessions.iter().any(|s| s.permission_id.as_deref() == Some(id.as_str())) {
        return Err("permission_id_in_use");
    }
    let slot = &mut store.sessions[index];
    slot.salt = Some(to_hex(&salt_bytes));
    slot.permission_id = Some(id.clone());
    slot.status = SlotStatus::Active;
    Ok(id)
}

/// Stops signing for this session for good and deletes its key. Returns whether the key is gone from the keychain.
pub fn revoke(store: &mut Store, keys: &dyn SecureStore, slot_id: &str) -> Res<bool> {
    let slot = store.sessions.iter_mut().find(|s| s.slot_id == slot_id).ok_or("session_not_found")?;
    slot.status = SlotStatus::Revoked;
    Ok(delete_session_key(keys, &slot.slot_id))
}

fn safe_ref(text: &str) -> String {
    if ident_ok(text) {
        text.to_string()
    } else {
        "invalid".to_string()
    }
}

fn push_log(store: &mut Store, now_ms: i64, request_ref: &str, outcome: &str, reason: &str) {
    store.log.push(LogEntry { at: now_ms, request_ref: request_ref.to_string(), outcome: outcome.to_string(), reason: reason.to_string() });
    while store.log.len() > MAX_LOG {
        store.log.remove(0);
    }
}

fn sign_inner(store: &mut Store, keys: &dyn SecureStore, request: &SignRequest, now_ms: i64) -> Res<SignOutcome> {
    let requested = word32(&request.permission_id).ok_or("permission_not_registered")?;
    let requested_hex = to_hex(&requested);
    let index = store
        .sessions
        .iter()
        .position(|s| s.permission_id.as_deref() == Some(requested_hex.as_str()))
        .ok_or("permission_not_registered")?;
    let approved = authorize(&store.sessions[index], request, now_ms)?;
    let key = load_session_key(keys, &store.sessions[index].slot_id)?;
    let signature = chain::sign_device_message(&key, &approved.user_op_hash)?;
    // Count it before the signature leaves: every signature is counted, a retry included (the safe direction).
    let slot = &mut store.sessions[index];
    let (mut native, mut token) = used_today(slot, now_ms);
    match approved.kind {
        Kind::Native => native = native.saturating_add(approved.amount),
        Kind::Token => token = token.saturating_add(approved.amount),
    }
    slot.usage = Usage { day: day_of(now_ms), native_wei: native.to_string(), token_units: token.to_string() };
    Ok(SignOutcome {
        signature: to_hex(&signature),
        permission_id: requested_hex,
        user_op_hash: to_hex(&approved.user_op_hash),
        kind: match approved.kind {
            Kind::Native => "native".to_string(),
            Kind::Token => "token".to_string(),
        },
    })
}

/// Checks, signs, counts and logs. The caller must persist the store before it hands the signature on.
pub fn sign(store: &mut Store, keys: &dyn SecureStore, request: &SignRequest, now_ms: i64) -> Res<SignOutcome> {
    let result = sign_inner(store, keys, request, now_ms);
    let log_ref = safe_ref(&request.request_ref);
    match &result {
        Ok(_) => push_log(store, now_ms, &log_ref, "signed", "ok"),
        Err(reason) => push_log(store, now_ms, &log_ref, "refused", reason),
    }
    result
}

// ── Tauri commands (the owner's screen only) ─────────────────────────────────────────────────────────────────

static SESSION_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?;
    Ok(dir.join(session_store::FILE_NAME))
}

fn clock_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// The emergency stop blocks everything that could lead to a signature (revoking still works: it only narrows).
fn ensure_not_stopped() -> Result<(), String> {
    if crate::kill_switch::is_engaged() {
        return Err("kill_switch_engaged".to_string());
    }
    Ok(())
}

/// Loads the store, runs `work`, saves it. `need_enabled`: the owner's switch on this computer must be on (nothing is
/// read or written otherwise). A store that does not verify starts again empty and off. A result is only handed on after
/// the store was written; `save_on_refusal` keeps the local log line of a refusal.
fn edit<T>(app: &tauri::AppHandle, need_enabled: bool, save_on_refusal: bool, work: impl FnOnce(&mut Store, i64) -> Res<T>) -> Result<T, String> {
    let _guard = SESSION_LOCK.lock().map_err(|_| "session_lock".to_string())?;
    let file = data_file(app)?;
    let mac = KeychainMacKey;
    let (mut store, _integrity) = session_store::load(&file, &mac);
    if need_enabled && !store.enabled {
        return Err("own_wallet_session_off".to_string());
    }
    match work(&mut store, clock_ms()) {
        Ok(value) => {
            session_store::save(&file, &store, &mac).map_err(|reason| reason.to_string())?;
            Ok(value)
        }
        Err(reason) => {
            if save_on_refusal {
                let _ = session_store::save(&file, &store, &mac);
            }
            Err(reason.to_string())
        }
    }
}

fn read_view(app: &tauri::AppHandle) -> Result<View, String> {
    let _guard = SESSION_LOCK.lock().map_err(|_| "session_lock".to_string())?;
    let file = data_file(app)?;
    let (store, integrity): (Store, Integrity) = session_store::load(&file, &KeychainMacKey);
    Ok(session_store::view(&store, integrity, clock_ms()))
}

/// The sessions of this computer and the local log. Reads only.
#[tauri::command(async)]
pub fn desktop_bridge_own_wallet_session_get(app: tauri::AppHandle) -> Result<View, String> {
    read_view(&app)
}

/// The owner's switch. Turning it on is refused while the emergency stop is engaged; off always works.
#[tauri::command(async)]
pub fn desktop_bridge_own_wallet_session_set_enabled(app: tauri::AppHandle, enabled: bool) -> Result<View, String> {
    if enabled {
        ensure_not_stopped()?;
    }
    edit(&app, false, false, |store, _| {
        store.enabled = enabled;
        Ok(())
    })?;
    read_view(&app)
}

/// Makes a session key on this computer with the owner's limits. The result is the `grant_session` parameters, which the
/// main site hands to the wallet origin; the per-day limit never leaves this computer.
#[tauri::command(async)]
pub fn desktop_bridge_own_wallet_session_create(app: tauri::AppHandle, input: CreateInput) -> Result<CreateOutput, String> {
    ensure_not_stopped()?;
    edit(&app, true, false, |store, now| create_slot(store, &OsKeyringStore, &input, now))
}

/// The owner enabled the session on the wallet origin: the permission id is computed here from this key and the salt.
#[tauri::command(async)]
pub fn desktop_bridge_own_wallet_session_activate(app: tauri::AppHandle, slot_id: String, salt: String, permission_id: Option<String>) -> Result<String, String> {
    ensure_not_stopped()?;
    edit(&app, true, false, |store, now| activate(store, &slot_id, &salt, permission_id.as_deref(), now))
}

/// Stops signing for this session for good and deletes its key. Works with the switch off and with the emergency stop on.
#[tauri::command(async)]
pub fn desktop_bridge_own_wallet_session_revoke(app: tauri::AppHandle, slot_id: String) -> Result<bool, String> {
    edit(&app, false, false, |store, _| revoke(store, &OsKeyringStore, &slot_id))
}

/// Checks one pending payment against this computer's own policy and, only if everything holds, signs it.
#[tauri::command(async)]
pub fn desktop_bridge_own_wallet_session_sign(app: tauri::AppHandle, request: SignRequest) -> Result<SignOutcome, String> {
    ensure_not_stopped()?;
    edit(&app, true, true, |store, now| sign(store, &OsKeyringStore, &request, now))
}

#[cfg(test)]
mod tests;
