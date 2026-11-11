use super::*;
use crate::developer_runtime::home_node_identity::{RuntimeError, RuntimeResult};
use crate::own_wallet_session_chain::{uncompressed_point, verify_device_signature};
use crate::own_wallet_session_store::{self as session_store, MacKey, KEY_SERVICE};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use zeroize::Zeroizing;

/// An in-memory keychain. The developer runtime's own test store is private to that module, so this one is local.
#[derive(Default)]
struct MemorySecureStore {
    inner: Mutex<HashMap<(String, String), Vec<u8>>>,
}

impl SecureStore for MemorySecureStore {
    fn get(&self, service: &str, key: &str) -> RuntimeResult<Option<Vec<u8>>> {
        let map = self.inner.lock().map_err(|_| RuntimeError::fail_closed("secure_store_lock"))?;
        Ok(map.get(&(service.to_string(), key.to_string())).cloned())
    }

    fn set(&self, service: &str, key: &str, value: &[u8]) -> RuntimeResult<()> {
        let mut map = self.inner.lock().map_err(|_| RuntimeError::fail_closed("secure_store_lock"))?;
        map.insert((service.to_string(), key.to_string()), value.to_vec());
        Ok(())
    }

    fn delete(&self, service: &str, key: &str) -> RuntimeResult<()> {
        let mut map = self.inner.lock().map_err(|_| RuntimeError::fail_closed("secure_store_lock"))?;
        map.remove(&(service.to_string(), key.to_string()));
        Ok(())
    }

    fn get_text(&self, service: &str, key: &str) -> RuntimeResult<Option<String>> {
        match self.get(service, key)? {
            None => Ok(None),
            Some(bytes) => String::from_utf8(bytes).map(Some).map_err(|_| RuntimeError::fail_closed("keyring_corrupt")),
        }
    }

    fn set_text(&self, service: &str, key: &str, value: &str) -> RuntimeResult<()> {
        self.set(service, key, value.as_bytes())
    }
}

const NOW_MS: i64 = 1_800_000_000_000;
const ACCOUNT: &str = "0x73ec209692f04b1499c2ce8a31ca502d3f977d04";
const PAYEE: &str = "0x00000000000000000000000000000000000000a1";
const OTHER: &str = "0x00000000000000000000000000000000000000b2";
const SALT: &str = "0x1111111111111111111111111111111111111111111111111111111111111111";

fn vectors() -> Value {
    serde_json::from_str(include_str!("../own_wallet_session_vectors.json")).expect("vectors parse")
}

fn payment(v: &Value, name: &str) -> String {
    for case in v["paymentCallData"].as_array().expect("paymentCallData") {
        if case["name"].as_str() == Some(name) {
            return case["callData"].as_str().expect("callData").to_string();
        }
    }
    panic!("no payment case {name}");
}

fn exec_case(v: &Value, name: &str) -> String {
    for case in v["execMode"].as_array().expect("execMode") {
        if case["name"].as_str() == Some(name) {
            return case["callData"].as_str().expect("callData").to_string();
        }
    }
    panic!("no exec case {name}");
}

fn be32_to_dec(bytes: &[u8; 32]) -> String {
    let mut digits: Vec<u8> = vec![0];
    for byte in bytes.iter() {
        let mut carry = *byte as u32;
        for digit in digits.iter_mut() {
            let value = (*digit as u32) * 256 + carry;
            *digit = (value % 10) as u8;
            carry = value / 10;
        }
        while carry > 0 {
            digits.push((carry % 10) as u8);
            carry /= 10;
        }
    }
    digits.iter().rev().map(|d| (b'0' + *d) as char).collect()
}

fn session_nonce(sequence: u8) -> String {
    let mut nonce = [0u8; 32];
    nonce[..24].copy_from_slice(&chain::session_nonce_key().expect("nonce key"));
    nonce[31] = sequence;
    be32_to_dec(&nonce)
}

fn native_policy() -> NativePolicy {
    NativePolicy {
        payee: PAYEE.to_string(),
        per_tx_wei: "2000000000000000".to_string(),
        daily_wei: "3000000000000000".to_string(),
        total_wei: "100000000000000000".to_string(),
        max_count: 10,
    }
}

fn token_policy() -> TokenPolicy {
    TokenPolicy { payee: PAYEE.to_string(), per_transfer: "5000000".to_string(), daily: "6000000".to_string(), total: "100000000".to_string() }
}

/// An ACTIVE slot built from the layout-B key and the first permission id of the vectors.
fn slot_for(v: &Value, chain_id: u64) -> Slot {
    Slot {
        slot_id: "ows_test".to_string(),
        owner_user_id: "user-1".to_string(),
        device_id: "desk-1".to_string(),
        account_id: "acc-1".to_string(),
        account: ACCOUNT.to_string(),
        chain_id,
        pub_key_x: v["layoutB"]["pubKeyX"].as_str().expect("x").to_string(),
        pub_key_y: v["layoutB"]["pubKeyY"].as_str().expect("y").to_string(),
        salt: Some(SALT.to_string()),
        permission_id: Some(v["permissionId"][0]["permissionId"].as_str().expect("id").to_string()),
        status: SlotStatus::Active,
        policy: LocalPolicy { native: Some(native_policy()), token: Some(token_policy()) },
        created_at: NOW_MS - 1000,
        valid_until: NOW_MS / 1000 + 3600,
        usage: Usage::default(),
    }
}

fn op_for(call_data: &str) -> UserOp {
    UserOp {
        sender: ACCOUNT.to_string(),
        nonce: session_nonce(5),
        factory: None,
        factory_data: "0x".to_string(),
        call_data: call_data.to_string(),
        call_gas_limit: "300000".to_string(),
        verification_gas_limit: "1200000".to_string(),
        pre_verification_gas: "100000".to_string(),
        max_fee_per_gas: "3000000000".to_string(),
        max_priority_fee_per_gas: "1000000000".to_string(),
        paymaster: None,
        paymaster_verification_gas_limit: "0".to_string(),
        paymaster_post_op_gas_limit: "0".to_string(),
        paymaster_data: "0x".to_string(),
        signature: "0x".to_string(),
    }
}

fn rehash(request: &mut SignRequest) {
    if let (Ok(packed), Some(entry_point)) = (pack(&request.user_op), addr20(&request.entry_point)) {
        request.user_op_hash = to_hex(&user_op_hash(&packed, &entry_point, request.chain_id));
    }
}

fn request_for(slot: &Slot, call_data: &str) -> SignRequest {
    let mut request = SignRequest {
        owner_user_id: slot.owner_user_id.clone(),
        request_ref: "ur_test".to_string(),
        permission_id: slot.permission_id.clone().expect("permission id"),
        chain_id: slot.chain_id,
        entry_point: chain::ENTRY_POINT_V07.to_string(),
        user_op: op_for(call_data),
        user_op_hash: String::new(),
    };
    rehash(&mut request);
    request
}

/// Builds a fresh request for a payment case, lets the test change slot and request, re-hashes, and expects `code`.
fn refused(code: &str, case: &str, change: impl FnOnce(&mut Slot, &mut SignRequest)) {
    let v = vectors();
    let mut slot = slot_for(&v, 97);
    let mut request = request_for(&slot, &payment(&v, case));
    change(&mut slot, &mut request);
    rehash(&mut request);
    assert_eq!(authorize(&slot, &request, NOW_MS).err(), Some(code), "{case}: {code}");
}

#[test]
fn the_policy_is_accepted_on_both_test_networks() {
    let v = vectors();
    for (chain_id, native_case, token_case) in [(97u64, "native 97", "token 97"), (84532u64, "native 84532", "token 84532")] {
        let slot = slot_for(&v, chain_id);
        let native = authorize(&slot, &request_for(&slot, &payment(&v, native_case)), NOW_MS).expect("native payment");
        assert_eq!((native.kind, native.amount), (Kind::Native, 1_000_000_000_000_000));
        let token = authorize(&slot, &request_for(&slot, &payment(&v, token_case)), NOW_MS).expect("token payment");
        assert_eq!((token.kind, token.amount), (Kind::Token, 2_500_000));
        // the hash that will be signed is the one computed here
        let request = request_for(&slot, &payment(&v, native_case));
        assert_eq!(to_hex(&native.user_op_hash), request.user_op_hash);
    }
}

#[test]
fn the_session_must_be_active_the_owners_and_unexpired() {
    refused("session_not_active", "native 97", |s, _| s.status = SlotStatus::Pending);
    refused("session_not_active", "native 97", |s, _| s.status = SlotStatus::Revoked);
    refused("owner_mismatch", "native 97", |_, r| r.owner_user_id = "user-2".to_string());
    refused("session_expired", "native 97", |s, _| s.valid_until = NOW_MS / 1000);
    refused("session_expired", "native 97", |s, _| s.valid_until = NOW_MS / 1000 - 5);
}

#[test]
fn the_chain_the_entry_point_and_the_registration_must_match() {
    refused("chain_mismatch", "native 97", |_, r| r.chain_id = 84532);
    refused("chain_not_allowed", "native 97", |s, r| {
        s.chain_id = 8453;
        r.chain_id = 8453;
    });
    refused("entry_point_not_pinned", "native 97", |_, r| r.entry_point = OTHER.to_string());
    refused("entry_point_not_pinned", "native 97", |_, r| r.entry_point = "0x12".to_string());
    let other_permission = vectors()["permissionId"][2]["permissionId"].as_str().expect("id").to_string();
    refused("permission_not_registered", "native 97", move |_, r| r.permission_id = other_permission);
    refused("permission_not_registered", "native 97", |_, r| r.permission_id = "0x00".to_string());
    refused("permission_not_registered", "native 97", |s, _| s.permission_id = None);
    refused("account_not_registered", "native 97", |_, r| r.user_op.sender = OTHER.to_string());
}

#[test]
fn the_user_op_must_be_the_plain_unsigned_session_form() {
    refused("init_code_not_allowed", "native 97", |_, r| r.user_op.factory = Some(OTHER.to_string()));
    refused("signature_not_empty", "native 97", |_, r| r.user_op.signature = "0x00".to_string());
    refused("user_op_malformed", "native 97", |_, r| r.user_op.nonce = "abc".to_string());
    refused("nonce_not_session", "native 97", |_, r| r.user_op.nonce = "5".to_string());
    refused("paymaster_not_allowed_on_testnet", "native 97", |_, r| {
        r.user_op.paymaster = Some(OTHER.to_string());
        r.user_op.paymaster_verification_gas_limit = "100000".to_string();
        r.user_op.paymaster_post_op_gas_limit = "50000".to_string();
    });
    refused("gas_limits_exceeded", "native 97", |_, r| r.user_op.verification_gas_limit = "2000001".to_string());
    // a gas value that does not fit 128 bits cannot even be packed (the packed form is what is hashed)
    refused("user_op_malformed", "native 97", |_, r| r.user_op.call_gas_limit = "340282366920938463463374607431768211456".to_string());
}

#[test]
fn a_hash_the_server_computed_differently_is_refused() {
    let v = vectors();
    let slot = slot_for(&v, 97);
    let mut request = request_for(&slot, &payment(&v, "native 97"));
    request.user_op_hash = to_hex(&[1u8; 32]);
    assert_eq!(authorize(&slot, &request, NOW_MS).err(), Some("user_op_hash_mismatch"));
    request.user_op_hash = "not a hash".to_string();
    assert_eq!(authorize(&slot, &request, NOW_MS).err(), Some("user_op_hash_mismatch"));
    // changing any signed field after the hash was made breaks it too
    let mut request = request_for(&slot, &payment(&v, "native 97"));
    request.user_op.max_fee_per_gas = "2999999999".to_string();
    assert_eq!(authorize(&slot, &request, NOW_MS).err(), Some("user_op_hash_mismatch"));
}

#[test]
fn only_a_single_default_execute_is_signed() {
    let v = vectors();
    for (name, code) in [
        ("batch in a session UserOp", "session_batch_not_allowed"),
        ("delegatecall 0xff", "call_type_not_allowed"),
        ("static 0xfe", "call_type_not_allowed"),
        ("try exec type 0x01", "exec_type_not_allowed"),
        ("reserved byte non-zero", "mode_reserved_nonzero"),
        ("executeUserOp prefix", "outer_selector_not_allowed"),
        ("direct installModule", "outer_selector_not_allowed"),
        ("upgradeTo", "outer_selector_not_allowed"),
        ("too short for selector + mode + offset", "calldata_malformed"),
    ] {
        let call_data = exec_case(&v, name);
        refused(code, "native 97", move |_, r| r.user_op.call_data = call_data);
    }
    // an execute whose bytes do not end where the length says is not decoded
    let longer = format!("{}{}", payment(&v, "native 97"), "00".repeat(32));
    refused("calldata_not_allowed", "native 97", move |_, r| r.user_op.call_data = longer);
}

#[test]
fn a_native_payment_goes_to_the_one_payee_within_the_limits() {
    refused("payee_not_allowed", "native 97", |s, _| s.policy.native.as_mut().expect("native").payee = OTHER.to_string());
    refused("amount_over_limit", "native 97", |s, _| s.policy.native.as_mut().expect("native").per_tx_wei = "999999999999999".to_string());
    refused("action_not_allowed", "native 97", |s, _| s.policy.native = None);
    refused("policy_invalid", "native 97", |s, _| s.policy.native.as_mut().expect("native").per_tx_wei = "x".to_string());
    refused("daily_limit_exceeded", "native 97", |s, _| {
        s.usage = Usage { day: day_of(NOW_MS), native_wei: "2500000000000000".to_string(), token_units: "0".to_string() };
    });
    // a value that does not parse counts as used up
    refused("daily_limit_exceeded", "native 97", |s, _| {
        s.usage = Usage { day: day_of(NOW_MS), native_wei: "zz".to_string(), token_units: "0".to_string() };
    });
}

#[test]
fn a_token_payment_is_the_pinned_tokens_transfer_to_the_one_payee() {
    refused("payee_not_allowed", "token 97", |s, _| s.policy.token.as_mut().expect("token").payee = OTHER.to_string());
    refused("amount_over_limit", "token 97", |s, _| s.policy.token.as_mut().expect("token").per_transfer = "2499999".to_string());
    refused("action_not_allowed", "token 97", |s, _| s.policy.token = None);
    refused("daily_limit_exceeded", "token 97", |s, _| {
        s.usage = Usage { day: day_of(NOW_MS), native_wei: "0".to_string(), token_units: "5000000".to_string() };
    });
    // the 84532 token is not the 97 token: the payment is refused on the other chain
    let v = vectors();
    let slot = slot_for(&v, 97);
    let request = request_for(&slot, &payment(&v, "token 84532"));
    assert_eq!(authorize(&slot, &request, NOW_MS).err(), Some("action_not_allowed"));
}

#[test]
fn yesterdays_use_does_not_count_today() {
    let v = vectors();
    let mut slot = slot_for(&v, 97);
    slot.usage = Usage { day: day_of(NOW_MS) - 1, native_wei: "3000000000000000".to_string(), token_units: "6000000".to_string() };
    assert!(authorize(&slot, &request_for(&slot, &payment(&v, "native 97")), NOW_MS).is_ok());
    assert!(authorize(&slot, &request_for(&slot, &payment(&v, "token 97")), NOW_MS).is_ok());
    slot.usage.day = day_of(NOW_MS);
    assert_eq!(authorize(&slot, &request_for(&slot, &payment(&v, "native 97")), NOW_MS).err(), Some("daily_limit_exceeded"));
}

fn input() -> CreateInput {
    CreateInput {
        owner_user_id: "user-1".to_string(),
        device_id: "desk-1".to_string(),
        account_id: "acc-1".to_string(),
        account: ACCOUNT.to_string(),
        chain_id: 97,
        valid_until: NOW_MS / 1000 + 3600,
        native: Some(native_policy()),
        token: Some(token_policy()),
    }
}

#[test]
fn creating_a_session_checks_every_input() {
    create_refused("input_invalid", |i| i.owner_user_id = String::new());
    create_refused("input_invalid", |i| i.device_id = "a:b".to_string());
    create_refused("input_invalid", |i| i.account_id = "x".repeat(65));
    create_refused("input_invalid", |i| i.account = "0x1234".to_string());
    create_refused("chain_not_allowed", |i| i.chain_id = 8453);
    create_refused("expiry_invalid", |i| i.valid_until = NOW_MS / 1000 + 30);
    create_refused("expiry_invalid", |i| i.valid_until = NOW_MS / 1000 + 31 * 24 * 3600);
    create_refused("policy_invalid", |i| {
        i.native = None;
        i.token = None;
    });
    create_refused("policy_invalid", |i| i.native.as_mut().expect("native").payee = "0x0000000000000000000000000000000000000000".to_string());
    create_refused("policy_invalid", |i| i.native.as_mut().expect("native").payee = ACCOUNT.to_string());
    create_refused("policy_invalid", |i| i.native.as_mut().expect("native").per_tx_wei = "0".to_string());
    create_refused("policy_invalid", |i| i.native.as_mut().expect("native").per_tx_wei = "4000000000000000".to_string());
    create_refused("policy_invalid", |i| i.native.as_mut().expect("native").max_count = 0);
    create_refused("policy_invalid", |i| i.native.as_mut().expect("native").max_count = 1001);
    create_refused("policy_invalid", |i| i.token.as_mut().expect("token").per_transfer = "7000000".to_string());
    create_refused("policy_invalid", |i| i.token.as_mut().expect("token").total = "01".to_string());
}

/// Changes a valid input, expects `create_slot` to refuse it with `code`, and that nothing was stored or keyed.
fn create_refused(code: &str, change: impl FnOnce(&mut CreateInput)) {
    let keys = MemorySecureStore::default();
    let mut store = Store::default();
    let mut bad = input();
    change(&mut bad);
    assert_eq!(create_slot(&mut store, &keys, &bad, NOW_MS).err(), Some(code), "{code}");
    assert!(store.sessions.is_empty(), "{code}: nothing is stored on a refusal");
    assert!(keys.inner.lock().expect("lock").is_empty(), "{code}: no key is made on a refusal");
}

#[test]
fn the_grant_params_are_what_the_main_site_passes_on_and_hold_no_secret() {
    let keys = MemorySecureStore::default();
    let mut store = Store::default();
    let out = create_slot(&mut store, &keys, &input(), NOW_MS).expect("creates");
    let json = serde_json::to_value(&out.grant_params).expect("serializes");
    let mut names: Vec<&str> = json.as_object().expect("object").keys().map(|k| k.as_str()).collect();
    names.sort();
    assert_eq!(names, vec!["deviceId", "native", "sessionPubKeyX", "sessionPubKeyY", "token", "validUntil"]);
    assert_eq!(json["native"], serde_json::json!({ "payee": PAYEE, "perTxWei": "2000000000000000", "totalWei": "100000000000000000", "maxCount": 10 }));
    assert_eq!(json["token"], serde_json::json!({ "payee": PAYEE, "perTransfer": "5000000", "total": "100000000" }));
    assert!(!json.to_string().contains("daily"), "the per-day limit stays on this computer");
    // the public key is a real point of the key in the keychain, the fingerprint has four groups
    assert_eq!(out.fingerprint.split(' ').count(), 4);
    let slot = &store.sessions[0];
    assert_eq!((slot.status, slot.permission_id.is_none()), (SlotStatus::Pending, true));
    assert_eq!(json["sessionPubKeyX"], serde_json::Value::String(slot.pub_key_x.clone()));
    // a pending session signs nothing
    assert_eq!(authorize(slot, &request_for_pending(slot), NOW_MS).err(), Some("session_not_active"));
}

fn request_for_pending(slot: &Slot) -> SignRequest {
    let v = vectors();
    SignRequest {
        owner_user_id: slot.owner_user_id.clone(),
        request_ref: "ur_test".to_string(),
        permission_id: v["permissionId"][0]["permissionId"].as_str().expect("id").to_string(),
        chain_id: slot.chain_id,
        entry_point: chain::ENTRY_POINT_V07.to_string(),
        user_op: op_for(&payment(&v, "native 97")),
        user_op_hash: to_hex(&[0u8; 32]),
    }
}

#[test]
fn activating_computes_the_permission_id_here() {
    let keys = MemorySecureStore::default();
    let mut store = Store::default();
    let out = create_slot(&mut store, &keys, &input(), NOW_MS).expect("creates");
    let x = word32(&store.sessions[0].pub_key_x).expect("x");
    let y = word32(&store.sessions[0].pub_key_y).expect("y");
    let salt = word32(SALT).expect("salt");
    let expected = to_hex(&chain::permission_id(&x, &y, &salt).expect("id"));
    assert_eq!(activate(&mut store, "ows_unknown", SALT, None, NOW_MS).err(), Some("session_not_found"));
    assert_eq!(activate(&mut store, &out.slot_id, "0x11", None, NOW_MS).err(), Some("input_invalid"));
    assert_eq!(activate(&mut store, &out.slot_id, SALT, Some(&to_hex(&[7u8; 32])), NOW_MS).err(), Some("permission_id_mismatch"));
    assert_eq!(activate(&mut store, &out.slot_id, SALT, None, NOW_MS + 3_700_000).err(), Some("session_expired"));
    assert_eq!(store.sessions[0].status, SlotStatus::Pending, "a refused activation changes nothing");
    assert_eq!(activate(&mut store, &out.slot_id, SALT, Some(&expected.to_uppercase().replace("0X", "0x")), NOW_MS), Ok(expected.clone()));
    assert_eq!((store.sessions[0].status, store.sessions[0].permission_id.clone()), (SlotStatus::Active, Some(expected)));
    assert_eq!(activate(&mut store, &out.slot_id, SALT, None, NOW_MS).err(), Some("session_not_pending"));
}

#[test]
fn a_whole_session_from_the_key_to_a_verified_signature_and_the_daily_limit() {
    let v = vectors();
    let keys = MemorySecureStore::default();
    let mut store = Store::default();
    let out = create_slot(&mut store, &keys, &input(), NOW_MS).expect("creates");
    activate(&mut store, &out.slot_id, SALT, None, NOW_MS).expect("activates");
    let slot = store.sessions[0].clone();
    let point = uncompressed_point(&word32(&slot.pub_key_x).expect("x"), &word32(&slot.pub_key_y).expect("y"));
    let native = payment(&v, "native 97");
    // three payments of 0.001 fill the 0.003 of the day; every signature verifies under the session public key
    for round in 0..3 {
        let request = request_for(&slot, &native);
        let outcome = sign(&mut store, &keys, &request, NOW_MS + round).expect("signs");
        assert_eq!((outcome.kind.as_str(), outcome.permission_id.as_str()), ("native", slot.permission_id.clone().expect("id").as_str()));
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&hex_to_bytes(&outcome.signature).expect("signature hex"));
        let hash = word32(&outcome.user_op_hash).expect("hash");
        assert!(verify_device_signature(&point, &hash, &signature));
        assert!(signature[32..] <= chain::P256_HALF_ORDER[..]);
    }
    assert_eq!(store.sessions[0].usage.native_wei, "3000000000000000");
    assert_eq!(sign(&mut store, &keys, &request_for(&slot, &native), NOW_MS + 5).err(), Some("daily_limit_exceeded"));
    // the token has its own count
    assert!(sign(&mut store, &keys, &request_for(&slot, &payment(&v, "token 97")), NOW_MS + 6).is_ok());
    assert_eq!(store.sessions[0].usage.token_units, "2500000");
    // the next UTC day starts again (a session that lives that long: this one was made for one hour)
    store.sessions[0].valid_until = NOW_MS / 1000 + 3 * 86_400;
    assert!(sign(&mut store, &keys, &request_for(&slot, &native), NOW_MS + DAY_MS_TEST).is_ok());
    assert_eq!(store.sessions[0].usage.native_wei, "1000000000000000");
    // the log has the outcomes and reason codes only: no address, no amount
    let log = serde_json::to_string(&store.log).expect("log json");
    assert!(log.contains("daily_limit_exceeded") && log.contains("signed"));
    for secret in [ACCOUNT, PAYEE, "1000000000000000", "2500000"] {
        assert!(!log.contains(secret), "the log must not hold {secret}");
    }
    // revoking stops it at once and deletes the key
    assert_eq!(revoke(&mut store, &keys, &slot.slot_id), Ok(true));
    assert!(matches!(keys.get(KEY_SERVICE, &format!("own_wallet_session_key_v1:{}", slot.slot_id)), Ok(None)));
    assert_eq!(sign(&mut store, &keys, &request_for(&slot, &native), NOW_MS + DAY_MS_TEST + 1).err(), Some("session_not_active"));
    assert_eq!(revoke(&mut store, &keys, "ows_unknown").err(), Some("session_not_found"));
}

const DAY_MS_TEST: i64 = 86_400_000;

#[test]
fn a_missing_key_signs_nothing_and_a_refusal_is_logged() {
    let v = vectors();
    let keys = MemorySecureStore::default();
    let mut store = Store::default();
    let out = create_slot(&mut store, &keys, &input(), NOW_MS).expect("creates");
    activate(&mut store, &out.slot_id, SALT, None, NOW_MS).expect("activates");
    let slot = store.sessions[0].clone();
    assert!(delete_session_key(&keys, &slot.slot_id));
    let request = request_for(&slot, &payment(&v, "native 97"));
    assert_eq!(sign(&mut store, &keys, &request, NOW_MS).err(), Some("session_key_missing"));
    assert_eq!(store.sessions[0].usage, Usage::default(), "nothing was counted");
    assert_eq!(store.log.last().map(|e| (e.outcome.as_str(), e.reason.as_str())), Some(("refused", "session_key_missing")));
    // a request for a permission nobody registered here
    let mut stranger = request.clone();
    stranger.permission_id = to_hex(&[9u8; 32]);
    assert_eq!(sign(&mut store, &keys, &stranger, NOW_MS).err(), Some("permission_not_registered"));
    // an unsafe request reference is not written to the log
    let mut odd = request;
    odd.request_ref = "a b\nc".to_string();
    let _ = sign(&mut store, &keys, &odd, NOW_MS);
    assert_eq!(store.log.last().map(|e| e.request_ref.as_str()), Some("invalid"));
    for _ in 0..80 {
        let _ = sign(&mut store, &keys, &odd, NOW_MS);
    }
    assert_eq!(store.log.len(), MAX_LOG);
}

#[test]
fn the_list_is_bounded_and_revoked_sessions_make_room() {
    let keys = MemorySecureStore::default();
    let mut store = Store::default();
    let mut ids = Vec::new();
    for _ in 0..MAX_SESSIONS {
        ids.push(create_slot(&mut store, &keys, &input(), NOW_MS).expect("creates").slot_id);
    }
    assert_eq!(create_slot(&mut store, &keys, &input(), NOW_MS).err(), Some("too_many_sessions"));
    revoke(&mut store, &keys, &ids[0]).expect("revokes");
    create_slot(&mut store, &keys, &input(), NOW_MS).expect("room after a revoke");
    assert_eq!(store.sessions.len(), MAX_SESSIONS);
    assert!(store.sessions.iter().all(|s| s.slot_id != ids[0]));
}

struct MemoryMac([u8; 32]);

impl MacKey for MemoryMac {
    fn get(&self, _create: bool) -> Option<Zeroizing<[u8; 32]>> {
        Some(Zeroizing::new(self.0))
    }
}

struct NoMac;

impl MacKey for NoMac {
    fn get(&self, _create: bool) -> Option<Zeroizing<[u8; 32]>> {
        None
    }
}

#[test]
fn the_stored_file_is_authenticated_and_holds_no_key() {
    let dir = tempfile::tempdir().expect("temp dir");
    let file = dir.path().join(session_store::FILE_NAME);
    let mac = MemoryMac([7u8; 32]);
    assert_eq!(session_store::load(&file, &mac).1, Integrity::Empty);
    let keys = MemorySecureStore::default();
    let mut store = Store::default();
    store.enabled = true;
    let out = create_slot(&mut store, &keys, &input(), NOW_MS).expect("creates");
    session_store::save(&file, &store, &mac).expect("saves");
    let (read, integrity) = session_store::load(&file, &mac);
    assert_eq!(integrity, Integrity::Ok);
    assert_eq!(read.sessions, store.sessions);
    assert!(read.enabled);
    // the private key never reaches the file
    let text = std::fs::read_to_string(&file).expect("file text");
    let pkcs8 = keys.get(KEY_SERVICE, &format!("own_wallet_session_key_v1:{}", out.slot_id)).expect("keychain").expect("key");
    assert!(!text.contains(&hex::encode(&pkcs8[..24])));
    assert!(!text.to_lowercase().contains("pkcs8") && !text.to_lowercase().contains("private"));
    // a hand-edited file counts as empty and off
    std::fs::write(&file, text.replace("\"enabled\": true", "\"enabled\": false").replace("\"maxCount\": 10", "\"maxCount\": 999")).expect("edits");
    let (edited, integrity) = session_store::load(&file, &mac);
    assert_eq!((integrity, edited.sessions.len(), edited.enabled), (Integrity::Tampered, 0, false));
    // a policy raised by hand is refused even when only one number changed
    std::fs::write(&file, text.replace("\"perTxWei\": \"2000000000000000\"", "\"perTxWei\": \"2999999999999999\"")).expect("edits");
    assert_eq!(session_store::load(&file, &mac).1, Integrity::Tampered);
    // another keychain key does not verify it, an unreadable one is its own state
    std::fs::write(&file, &text).expect("restores");
    assert_eq!(session_store::load(&file, &MemoryMac([8u8; 32])).1, Integrity::Tampered);
    assert_eq!(session_store::load(&file, &NoMac).1, Integrity::KeyUnavailable);
    assert_eq!(session_store::save(&file, &store, &NoMac).err(), Some("session_store_key_unavailable"));
    // the view is off unless the file verified
    let off = session_store::view(&read, Integrity::Tampered, NOW_MS);
    assert!(!off.enabled);
    let on = session_store::view(&read, Integrity::Ok, NOW_MS);
    assert!(on.enabled);
    assert_eq!(on.sessions[0].fingerprint.split(' ').count(), 4);
    assert!(!on.sessions[0].expired);
}

#[test]
fn there_is_no_command_that_signs_given_bytes_or_hands_out_a_key() {
    let source = include_str!("../own_wallet_session.rs");
    let commands: Vec<&str> = source.lines().filter(|line| line.trim_start().starts_with("pub fn desktop_bridge_own_wallet_session_")).collect();
    let names: Vec<&str> = commands.iter().map(|line| line.trim_start().trim_start_matches("pub fn ").split('(').next().expect("name")).collect();
    assert_eq!(
        names,
        vec![
            "desktop_bridge_own_wallet_session_get",
            "desktop_bridge_own_wallet_session_set_enabled",
            "desktop_bridge_own_wallet_session_create",
            "desktop_bridge_own_wallet_session_activate",
            "desktop_bridge_own_wallet_session_revoke",
            "desktop_bridge_own_wallet_session_sign",
        ]
    );
    assert_eq!(source.matches("#[tauri::command").count(), 6);
    for line in &commands {
        let lower = line.to_lowercase();
        for word in ["bytes", "message", "digest", "pkcs8", "private", "secret", "key:", "hash"] {
            assert!(!lower.contains(word), "a command takes {word}: {line}");
        }
    }
    // the only place that turns a key into a signature is the checked path
    assert_eq!(source.matches("sign_device_message(").count(), 1);
    let store_source = include_str!("../own_wallet_session_store.rs");
    assert!(!store_source.contains("pub fn export") && !store_source.contains("pub fn import"));
    assert!(!store_source.contains("hex::encode(&pkcs8") && !store_source.contains("hex::encode(pkcs8"));
}
