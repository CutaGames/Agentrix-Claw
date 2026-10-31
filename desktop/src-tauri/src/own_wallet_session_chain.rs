//! L8-6 S7 part 2: the pure byte rules of the desktop session signer (design 1b (b) and (c)).
//!
//! No key, no file, no network here. It mirrors, byte for byte, the TypeScript source of truth:
//! - `shared/types/agent-own-wallet.ts`: `execModeProblemV1`, `paymasterProblemV1`, `gasCapsProblemV1`;
//! - `backend/.../userop/packed-user-op.ts`: the RPC form -> packed form -> EntryPoint v0.7 `getUserOpHash`;
//! - `backend/.../session/smart-sessions.encoder.ts`: layout B of the session validator config (320 bytes), the
//!   permission id, the fixed `authenticatorData` and `clientDataJSON` of the device signature.
//!
//! The vectors in `own_wallet_session_vectors.json` come from on-chain `eth_call` values (userOpHash on 97 and 84532, the
//! S2 layout-B and device-signature vectors) and from an independent Keccak-256; a backend spec compares that file with
//! the TypeScript side, so a change on one side fails the other.
//!
//! Keccak-256 is written out here (about forty lines) because the design allows no new crate (1e).
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use ring::rand::SystemRandom;
use ring::signature::{EcdsaKeyPair, KeyPair, UnparsedPublicKey, ECDSA_P256_SHA256_FIXED, ECDSA_P256_SHA256_FIXED_SIGNING};
use serde::Deserialize;

/// A reason code (short, lower case, never a value).
pub type Res<T> = Result<T, &'static str>;

// ── Keccak-256 (the original padding 0x01, not SHA-3's 0x06) ─────────────────────────────────────────────────

const KECCAK_RC: [u64; 24] = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000, 0x000000000000808b, 0x0000000080000001,
    0x8000000080008081, 0x8000000000008009, 0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
    0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003, 0x8000000000008002, 0x8000000000000080,
    0x000000000000800a, 0x800000008000000a, 0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
];
const KECCAK_ROTC: [u32; 24] = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];
const KECCAK_PILN: [usize; 24] = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];

fn keccak_f(st: &mut [u64; 25]) {
    for round in 0..24 {
        let mut bc = [0u64; 5];
        for i in 0..5 {
            bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20];
        }
        for i in 0..5 {
            let t = bc[(i + 4) % 5] ^ bc[(i + 1) % 5].rotate_left(1);
            let mut j = 0;
            while j < 25 {
                st[j + i] ^= t;
                j += 5;
            }
        }
        let mut t = st[1];
        for i in 0..24 {
            let j = KECCAK_PILN[i];
            let saved = st[j];
            st[j] = t.rotate_left(KECCAK_ROTC[i]);
            t = saved;
        }
        let mut j = 0;
        while j < 25 {
            let mut b = [0u64; 5];
            for i in 0..5 {
                b[i] = st[j + i];
            }
            for i in 0..5 {
                st[j + i] ^= (!b[(i + 1) % 5]) & b[(i + 2) % 5];
            }
            j += 5;
        }
        st[0] ^= KECCAK_RC[round];
    }
}

fn keccak_absorb(st: &mut [u64; 25], block: &[u8]) {
    for i in 0..17 {
        let mut lane = [0u8; 8];
        lane.copy_from_slice(&block[i * 8..i * 8 + 8]);
        st[i] ^= u64::from_le_bytes(lane);
    }
}

pub fn keccak256(data: &[u8]) -> [u8; 32] {
    const RATE: usize = 136;
    let mut st = [0u64; 25];
    let mut offset = 0usize;
    while data.len() - offset >= RATE {
        keccak_absorb(&mut st, &data[offset..offset + RATE]);
        keccak_f(&mut st);
        offset += RATE;
    }
    let mut block = [0u8; RATE];
    let rest = &data[offset..];
    block[..rest.len()].copy_from_slice(rest);
    block[rest.len()] ^= 0x01;
    block[RATE - 1] ^= 0x80;
    keccak_absorb(&mut st, &block);
    keccak_f(&mut st);
    let mut out = [0u8; 32];
    for i in 0..4 {
        out[i * 8..i * 8 + 8].copy_from_slice(&st[i].to_le_bytes());
    }
    out
}

pub fn sha256(data: &[u8]) -> Vec<u8> {
    ring::digest::digest(&ring::digest::SHA256, data).as_ref().to_vec()
}

// ── Hex and decimal text ─────────────────────────────────────────────────────────────────────────────────────

/// `0x` plus an even number of hex digits, lower-cased. Anything else is `None`.
pub fn norm_hex(text: &str) -> Option<String> {
    let body = text.strip_prefix("0x")?;
    if body.len() % 2 != 0 || !body.bytes().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some(format!("0x{}", body.to_ascii_lowercase()))
}

pub fn hex_to_bytes(text: &str) -> Option<Vec<u8>> {
    let normalized = norm_hex(text)?;
    hex::decode(&normalized[2..]).ok()
}

pub fn addr20(text: &str) -> Option<[u8; 20]> {
    let bytes = hex_to_bytes(text)?;
    if bytes.len() != 20 {
        return None;
    }
    let mut out = [0u8; 20];
    out.copy_from_slice(&bytes);
    Some(out)
}

pub fn word32(text: &str) -> Option<[u8; 32]> {
    let bytes = hex_to_bytes(text)?;
    if bytes.len() != 32 {
        return None;
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Some(out)
}

pub fn to_hex(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

/// A decimal string (no sign, no leading zeros, at most 78 digits) as 32 big-endian bytes. Overflow is `None`.
pub fn dec_to_be32(text: &str) -> Option<[u8; 32]> {
    if text.is_empty() || text.len() > 78 || (text.len() > 1 && text.starts_with('0')) {
        return None;
    }
    let mut out = [0u8; 32];
    for ch in text.bytes() {
        if !ch.is_ascii_digit() {
            return None;
        }
        let mut carry = (ch - b'0') as u32;
        for byte in out.iter_mut().rev() {
            let v = (*byte as u32) * 10 + carry;
            *byte = (v & 0xff) as u8;
            carry = v >> 8;
        }
        if carry != 0 {
            return None;
        }
    }
    Some(out)
}

pub fn be32_to_u128(word: &[u8; 32]) -> Option<u128> {
    if word[..16].iter().any(|b| *b != 0) {
        return None;
    }
    let mut a = [0u8; 16];
    a.copy_from_slice(&word[16..]);
    Some(u128::from_be_bytes(a))
}

pub fn parse_u128(text: &str) -> Option<u128> {
    be32_to_u128(&dec_to_be32(text)?)
}

fn word_addr(address: &[u8; 20]) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[12..].copy_from_slice(address);
    w
}

fn word_u64(value: u64) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[24..].copy_from_slice(&value.to_be_bytes());
    w
}

fn word_to_usize(word: &[u8]) -> Option<usize> {
    if word.len() != 32 || word[..24].iter().any(|b| *b != 0) {
        return None;
    }
    let mut a = [0u8; 8];
    a.copy_from_slice(&word[24..]);
    usize::try_from(u64::from_be_bytes(a)).ok()
}

// ── Pinned values (the same as shared/types/agent-own-wallet.ts) ────────────────────────────────────────────

pub const ENTRY_POINT_V07: &str = "0x0000000071727de22e5e9d8baf0edac6f37da032";
pub const SMART_SESSIONS: &str = "0x00000000008bdaba73cd9815d79069c247eb4bda";
pub const WEBAUTHN_VALIDATOR: &str = "0x0000000000578c4cb0e472a5462da43c495c3f33";
pub const ERC20_TRANSFER_SELECTOR: [u8; 4] = [0xa9, 0x05, 0x9c, 0xbb];

/// Per chain: the pinned token and the gas caps (`OWN_WALLET_PINNED_TOKENS_V1`, `OWN_WALLET_GAS_CAPS_V1`).
pub struct ChainRules {
    pub chain_id: u64,
    pub token: &'static str,
    pub max_verification: u128,
    pub max_call: u128,
    pub max_pre_verification: u128,
    pub max_fee: u128,
    pub max_priority: u128,
    pub max_total_fee: u128,
}

static CHAINS: [ChainRules; 2] = [
    ChainRules {
        chain_id: 97,
        token: "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",
        max_verification: 2_000_000,
        max_call: 1_000_000,
        max_pre_verification: 1_000_000,
        max_fee: 5_000_000_000,
        max_priority: 2_000_000_000,
        max_total_fee: 20_000_000_000_000_000,
    },
    ChainRules {
        chain_id: 84532,
        token: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
        max_verification: 2_000_000,
        max_call: 1_000_000,
        max_pre_verification: 1_000_000,
        max_fee: 5_000_000_000,
        max_priority: 1_000_000_000,
        max_total_fee: 20_000_000_000_000_000,
    },
];

/// The two test networks only. A mainnet (or any other chain) has no rules, so nothing is ever signed there.
pub fn chain_rules(chain_id: u64) -> Option<&'static ChainRules> {
    CHAINS.iter().find(|c| c.chain_id == chain_id)
}

/// The 24-byte nonce key of a SmartSessions UserOp: mode 0, type 1, the SmartSessions address, key 0.
pub fn session_nonce_key() -> Option<[u8; 24]> {
    let address = addr20(SMART_SESSIONS)?;
    let mut key = [0u8; 24];
    key[1] = 0x01;
    key[2..22].copy_from_slice(&address);
    Some(key)
}

// ── ExecMode, paymaster, gas ─────────────────────────────────────────────────────────────────────────────────

/// `execModeProblemV1`: the outer call is `execute(bytes32,bytes)`; the mode is single (or batch for a root UserOp) +
/// default, the other 30 bytes are zero. A session UserOp may only be single.
pub fn exec_mode_problem(call_data: &str, session: bool) -> Option<&'static str> {
    let Some(normalized) = norm_hex(call_data) else {
        return Some("calldata_malformed");
    };
    let hex_text = &normalized[2..];
    if hex_text.len() < 8 {
        return Some("calldata_malformed");
    }
    if &hex_text[..8] != "e9ae5c53" {
        return Some("outer_selector_not_allowed");
    }
    if hex_text.len() < 2 * (4 + 32 + 32 + 32) {
        return Some("calldata_malformed");
    }
    let mode = &hex_text[8..8 + 64];
    let call_type = &mode[..2];
    if call_type != "00" && call_type != "01" {
        return Some("call_type_not_allowed");
    }
    if &mode[2..4] != "00" {
        return Some("exec_type_not_allowed");
    }
    if !mode[4..].bytes().all(|c| c == b'0') {
        return Some("mode_reserved_nonzero");
    }
    if session && call_type != "00" {
        return Some("session_batch_not_allowed");
    }
    None
}

/// `paymasterProblemV1`. `pins` are the pinned mainnet paymasters as (chain id, address); empty on purpose today.
pub fn paymaster_problem(chain_id: u64, paymaster_and_data: &str, pins: &[(u64, String)]) -> Option<&'static str> {
    let Some(data) = norm_hex(paymaster_and_data) else {
        return Some("paymaster_data_malformed");
    };
    if chain_rules(chain_id).is_some() {
        return if data == "0x" { None } else { Some("paymaster_not_allowed_on_testnet") };
    }
    if chain_id != 56 && chain_id != 8453 {
        return Some("chain_not_allowed");
    }
    let pin = pins.iter().find(|(id, _)| *id == chain_id).map(|(_, address)| address.to_ascii_lowercase());
    let Some(pin) = pin else {
        return Some("paymaster_not_configured");
    };
    if addr20(&pin).is_none() {
        return Some("paymaster_not_configured");
    }
    if data == "0x" {
        return Some("paymaster_required");
    }
    if data.len() < 42 || data[..42] != pin {
        return Some("paymaster_mismatch");
    }
    None
}

// ── The UserOp (the RPC form the backend sends) ──────────────────────────────────────────────────────────────

/// `OwnWalletUserOpV1`: every number a decimal string, every byte string 0x hex.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserOp {
    pub sender: String,
    pub nonce: String,
    pub factory: Option<String>,
    pub factory_data: String,
    pub call_data: String,
    pub call_gas_limit: String,
    pub verification_gas_limit: String,
    pub pre_verification_gas: String,
    pub max_fee_per_gas: String,
    pub max_priority_fee_per_gas: String,
    pub paymaster: Option<String>,
    pub paymaster_verification_gas_limit: String,
    pub paymaster_post_op_gas_limit: String,
    pub paymaster_data: String,
    pub signature: String,
}

pub struct Packed {
    pub sender: [u8; 20],
    pub nonce: [u8; 32],
    pub init_code: Vec<u8>,
    pub call_data: Vec<u8>,
    pub account_gas_limits: [u8; 32],
    pub pre_verification_gas: [u8; 32],
    pub gas_fees: [u8; 32],
    pub paymaster_and_data: Vec<u8>,
}

fn u128_bytes(text: &str) -> Res<[u8; 16]> {
    parse_u128(text).map(|v| v.to_be_bytes()).ok_or("user_op_malformed")
}

/// RPC form -> the packed form EntryPoint v0.7 hashes. Anything that is not exactly the form is `user_op_malformed`.
pub fn pack(op: &UserOp) -> Res<Packed> {
    let sender = addr20(&op.sender).ok_or("user_op_malformed")?;
    let nonce = dec_to_be32(&op.nonce).ok_or("user_op_malformed")?;
    let factory_data = hex_to_bytes(&op.factory_data).ok_or("user_op_malformed")?;
    let init_code = match &op.factory {
        None => {
            if !factory_data.is_empty() {
                return Err("user_op_malformed");
            }
            Vec::new()
        }
        Some(factory) => {
            let mut v = addr20(factory).ok_or("user_op_malformed")?.to_vec();
            v.extend_from_slice(&factory_data);
            v
        }
    };
    let call_data = hex_to_bytes(&op.call_data).ok_or("user_op_malformed")?;
    let verification = u128_bytes(&op.verification_gas_limit)?;
    let call = u128_bytes(&op.call_gas_limit)?;
    let mut account_gas_limits = [0u8; 32];
    account_gas_limits[..16].copy_from_slice(&verification);
    account_gas_limits[16..].copy_from_slice(&call);
    let pre_verification_gas = dec_to_be32(&op.pre_verification_gas).ok_or("user_op_malformed")?;
    let priority = u128_bytes(&op.max_priority_fee_per_gas)?;
    let max_fee = u128_bytes(&op.max_fee_per_gas)?;
    let mut gas_fees = [0u8; 32];
    gas_fees[..16].copy_from_slice(&priority);
    gas_fees[16..].copy_from_slice(&max_fee);
    let paymaster_data = hex_to_bytes(&op.paymaster_data).ok_or("user_op_malformed")?;
    let paymaster_and_data = match &op.paymaster {
        None => {
            if op.paymaster_verification_gas_limit != "0" || op.paymaster_post_op_gas_limit != "0" || !paymaster_data.is_empty() {
                return Err("user_op_malformed");
            }
            Vec::new()
        }
        Some(paymaster) => {
            let mut v = addr20(paymaster).ok_or("user_op_malformed")?.to_vec();
            v.extend_from_slice(&u128_bytes(&op.paymaster_verification_gas_limit)?);
            v.extend_from_slice(&u128_bytes(&op.paymaster_post_op_gas_limit)?);
            v.extend_from_slice(&paymaster_data);
            v
        }
    };
    Ok(Packed { sender, nonce, init_code, call_data, account_gas_limits, pre_verification_gas, gas_fees, paymaster_and_data })
}

/// EntryPoint v0.7 `getUserOpHash`: keccak256(abi.encode(keccak256(abi.encode(sender, nonce, keccak256(initCode),
/// keccak256(callData), accountGasLimits, preVerificationGas, gasFees, keccak256(paymasterAndData))), entryPoint, chainId)).
pub fn user_op_hash(packed: &Packed, entry_point: &[u8; 20], chain_id: u64) -> [u8; 32] {
    let mut inner = Vec::with_capacity(256);
    inner.extend_from_slice(&word_addr(&packed.sender));
    inner.extend_from_slice(&packed.nonce);
    inner.extend_from_slice(&keccak256(&packed.init_code));
    inner.extend_from_slice(&keccak256(&packed.call_data));
    inner.extend_from_slice(&packed.account_gas_limits);
    inner.extend_from_slice(&packed.pre_verification_gas);
    inner.extend_from_slice(&packed.gas_fees);
    inner.extend_from_slice(&keccak256(&packed.paymaster_and_data));
    let mut outer = Vec::with_capacity(96);
    outer.extend_from_slice(&keccak256(&inner));
    outer.extend_from_slice(&word_addr(entry_point));
    outer.extend_from_slice(&word_u64(chain_id));
    keccak256(&outer)
}

/// `gasCapsProblemV1`: every gas field a decimal string within the chain's caps.
pub fn gas_problem(chain: &ChainRules, op: &UserOp) -> Option<&'static str> {
    let verification = parse_u128(&op.verification_gas_limit);
    let call = parse_u128(&op.call_gas_limit);
    let pre = parse_u128(&op.pre_verification_gas);
    let max_fee = parse_u128(&op.max_fee_per_gas);
    let priority = parse_u128(&op.max_priority_fee_per_gas);
    let (Some(verification), Some(call), Some(pre), Some(max_fee), Some(priority)) = (verification, call, pre, max_fee, priority) else {
        return Some("gas_value_invalid");
    };
    if verification > chain.max_verification
        || call > chain.max_call
        || pre > chain.max_pre_verification
        || max_fee > chain.max_fee
        || priority > chain.max_priority
        || priority > max_fee
    {
        return Some("gas_limits_exceeded");
    }
    // Every operand is within its cap now, so the sum and the product cannot overflow a u128.
    let total = (verification + call + pre) * max_fee;
    if total > chain.max_total_fee {
        return Some("gas_limits_exceeded");
    }
    None
}

// ── execute(single, ...) call data ───────────────────────────────────────────────────────────────────────────

/// One `execute(mode, abi.encodePacked(target, value, data))` of mode single.
pub struct SingleExec {
    pub target: [u8; 20],
    pub value: [u8; 32],
    pub data: Vec<u8>,
}

/// Strict decoder: selector, mode, offset 0x40, length, then exactly the padded bytes (zero padding), nothing else.
/// The mode word itself is checked by `exec_mode_problem`.
pub fn decode_single_execute(call_data: &[u8]) -> Option<SingleExec> {
    if call_data.len() < 100 {
        return None;
    }
    if word_to_usize(&call_data[36..68])? != 0x40 {
        return None;
    }
    let len = word_to_usize(&call_data[68..100])?;
    if len < 52 || len > 4096 {
        return None;
    }
    let padded = (len + 31) / 32 * 32;
    if call_data.len() != 100 + padded || call_data[100 + len..].iter().any(|b| *b != 0) {
        return None;
    }
    let exec = &call_data[100..100 + len];
    let mut target = [0u8; 20];
    target.copy_from_slice(&exec[..20]);
    let mut value = [0u8; 32];
    value.copy_from_slice(&exec[20..52]);
    Some(SingleExec { target, value, data: exec[52..].to_vec() })
}

// ── The device-format signature (design 1b (b)) ──────────────────────────────────────────────────────────────

pub const P256_ORDER: [u8; 32] = [
    0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xbc, 0xe6, 0xfa, 0xad, 0xa7, 0x17, 0x9e, 0x84, 0xf3, 0xb9,
    0xca, 0xc2, 0xfc, 0x63, 0x25, 0x51,
];
pub const P256_HALF_ORDER: [u8; 32] = [
    0x7f, 0xff, 0xff, 0xff, 0x80, 0x00, 0x00, 0x00, 0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xde, 0x73, 0x7d, 0x56, 0xd3, 0x8b, 0xcf, 0x42, 0x79, 0xdc,
    0xe5, 0x61, 0x7e, 0x31, 0x92, 0xa8,
];

/// sha256("agentrix-device-session") || 0x01 (UP) || signCount 0: 37 bytes.
pub fn authenticator_data() -> Vec<u8> {
    let mut v = sha256(b"agentrix-device-session");
    v.push(0x01);
    v.extend_from_slice(&[0, 0, 0, 0]);
    v
}

/// `{"type":"webauthn.get","challenge":"<base64url(userOpHash)>"}`, byte for byte.
pub fn client_data_json(user_op_hash: &[u8; 32]) -> String {
    format!("{{\"type\":\"webauthn.get\",\"challenge\":\"{}\"}}", URL_SAFE_NO_PAD.encode(user_op_hash))
}

/// `authenticatorData || sha256(clientDataJSON)`: what the key signs (ECDSA-P256-SHA256 hashes it once more).
pub fn signed_message(user_op_hash: &[u8; 32]) -> Vec<u8> {
    let mut message = authenticator_data();
    message.extend_from_slice(&sha256(client_data_json(user_op_hash).as_bytes()));
    message
}

fn sub_be32(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let mut borrow = 0i16;
    for i in (0..32).rev() {
        let mut v = a[i] as i16 - b[i] as i16 - borrow;
        if v < 0 {
            v += 256;
            borrow = 1;
        } else {
            borrow = 0;
        }
        out[i] = v as u8;
    }
    out
}

/// `s > n/2` becomes `n - s` (WebAuthnValidator refuses a high `s`).
pub fn normalize_low_s(signature: &mut [u8; 64]) {
    let mut s = [0u8; 32];
    s.copy_from_slice(&signature[32..]);
    if s > P256_HALF_ORDER {
        let low = sub_be32(&P256_ORDER, &s);
        signature[32..].copy_from_slice(&low);
    }
}

/// The 65-byte uncompressed point.
pub fn uncompressed_point(x: &[u8; 32], y: &[u8; 32]) -> Vec<u8> {
    let mut v = Vec::with_capacity(65);
    v.push(0x04);
    v.extend_from_slice(x);
    v.extend_from_slice(y);
    v
}

/// Whether `r || s` is a valid signature of this UserOp hash in the device format under this public key.
pub fn verify_device_signature(public_key: &[u8], user_op_hash: &[u8; 32], signature: &[u8; 64]) -> bool {
    UnparsedPublicKey::new(&ECDSA_P256_SHA256_FIXED, public_key).verify(&signed_message(user_op_hash), signature).is_ok()
}

/// Signs the fixed device-format message with a PKCS#8 P-256 key, takes the low `s`, and checks the result with the
/// key's own public point before it returns.
pub fn sign_device_message(pkcs8: &[u8], user_op_hash: &[u8; 32]) -> Res<[u8; 64]> {
    let rng = SystemRandom::new();
    let pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, pkcs8, &rng).map_err(|_| "session_key_invalid")?;
    let signature = pair.sign(&rng, &signed_message(user_op_hash)).map_err(|_| "sign_failed")?;
    let bytes = signature.as_ref();
    if bytes.len() != 64 {
        return Err("sign_failed");
    }
    let mut out = [0u8; 64];
    out.copy_from_slice(bytes);
    normalize_low_s(&mut out);
    if !verify_device_signature(pair.public_key().as_ref(), user_op_hash, &out) {
        return Err("sign_failed");
    }
    Ok(out)
}

// ── Layout B, the permission id, the fingerprint ─────────────────────────────────────────────────────────────

/// Layout B of the session validator config (320 bytes, ten words, design 1b (a)).
pub fn session_validator_data(x: &[u8; 32], y: &[u8; 32]) -> Vec<u8> {
    let mut one = [0u8; 20];
    one[19] = 1;
    let mut credential = Vec::with_capacity(96);
    credential.extend_from_slice(x);
    credential.extend_from_slice(y);
    credential.extend_from_slice(&word_addr(&one));
    let credential_id = keccak256(&credential);
    let mut out = Vec::with_capacity(320);
    out.extend_from_slice(&word_u64(0));
    out.extend_from_slice(&word_u64(1));
    out.extend_from_slice(&word_u64(0x80));
    out.extend_from_slice(&word_u64(0xc0));
    out.extend_from_slice(&word_u64(1));
    out.extend_from_slice(&credential_id);
    out.extend_from_slice(&word_u64(1));
    out.extend_from_slice(x);
    out.extend_from_slice(y);
    out.extend_from_slice(&word_u64(0));
    out
}

/// SmartSessions' permission id: keccak256(abi.encode(WebAuthnValidator, sessionValidatorInitData, salt)). The device
/// computes it from its own key and the salt; it does not take the server's.
pub fn permission_id(x: &[u8; 32], y: &[u8; 32], salt: &[u8; 32]) -> Option<[u8; 32]> {
    let validator = addr20(WEBAUTHN_VALIDATOR)?;
    let data = session_validator_data(x, y);
    let mut encoded = Vec::with_capacity(96 + 32 + data.len());
    encoded.extend_from_slice(&word_addr(&validator));
    encoded.extend_from_slice(&word_u64(0x60));
    encoded.extend_from_slice(salt);
    encoded.extend_from_slice(&word_u64(data.len() as u64));
    encoded.extend_from_slice(&data);
    Some(keccak256(&encoded))
}

/// The first 8 bytes of sha256(0x04 || x || y) as four groups of four hex digits (`keyFingerprintV1`).
pub fn key_fingerprint(x: &[u8; 32], y: &[u8; 32]) -> String {
    let digest = sha256(&uncompressed_point(x, y));
    let text = hex::encode(&digest[..8]);
    format!("{} {} {} {}", &text[0..4], &text[4..8], &text[8..12], &text[12..16])
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const VECTORS: &str = include_str!("own_wallet_session_vectors.json");

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).expect("vectors parse")
    }

    fn text<'a>(value: &'a Value, key: &str) -> &'a str {
        value[key].as_str().unwrap_or_else(|| panic!("missing {key}"))
    }

    #[test]
    fn keccak_known_values() {
        assert_eq!(hex::encode(keccak256(b"")), "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
        assert_eq!(hex::encode(keccak256(b"abc")), "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
        // exactly one rate block (136 bytes) and one byte more: the padding edge cases
        let block = vec![0xa3u8; 136];
        assert_ne!(keccak256(&block), keccak256(&block[..135]));
        assert_ne!(keccak256(&block), keccak256(&[block.clone(), vec![0xa3]].concat()));
    }

    #[test]
    fn user_op_hash_matches_the_on_chain_values_on_both_chains() {
        let v = vectors();
        let cases = v["userOpHash"].as_array().expect("userOpHash");
        assert_eq!(cases.len(), 2);
        for case in cases {
            let op: UserOp = serde_json::from_value(case["userOp"].clone()).expect("rpc form");
            let packed = pack(&op).expect("packs");
            let entry_point = addr20(text(case, "entryPoint")).expect("entry point");
            let chain_id = case["chainId"].as_u64().expect("chain id");
            assert_eq!(to_hex(&user_op_hash(&packed, &entry_point, chain_id)), text(case, "expected"), "{}", text(case, "name"));
        }
        // the same op on the two chains hashes differently (the chain id is covered)
        assert_ne!(text(&cases[0], "expected"), text(&cases[1], "expected"));
    }

    #[test]
    fn pack_refuses_what_is_not_the_form() {
        let v = vectors();
        let base: UserOp = serde_json::from_value(v["userOpHash"][0]["userOp"].clone()).expect("rpc form");
        let mut bad = base.clone();
        bad.nonce = "01".into();
        assert_eq!(pack(&bad).err(), Some("user_op_malformed"));
        let mut bad = base.clone();
        bad.sender = "0x1234".into();
        assert_eq!(pack(&bad).err(), Some("user_op_malformed"));
        let mut bad = base.clone();
        bad.max_fee_per_gas = "340282366920938463463374607431768211456".into(); // 2^128
        assert_eq!(pack(&bad).err(), Some("user_op_malformed"));
        let mut bad = base.clone();
        bad.factory = None;
        bad.factory_data = "0x00".into();
        assert_eq!(pack(&bad).err(), Some("user_op_malformed"));
        let mut bad = base.clone();
        bad.paymaster = None;
        bad.paymaster_data = "0x00".into();
        assert_eq!(pack(&bad).err(), Some("user_op_malformed"));
        let mut bad = base.clone();
        bad.call_data = "0xabc".into();
        assert_eq!(pack(&bad).err(), Some("user_op_malformed"));
        assert!(serde_json::from_value::<UserOp>(serde_json::json!({ "sender": "0x00", "extra": 1 })).is_err());
    }

    #[test]
    fn exec_mode_vectors() {
        let v = vectors();
        let cases = v["execMode"].as_array().expect("execMode");
        assert_eq!(cases.len(), 18);
        for case in cases {
            let expected = case["expected"].as_str();
            assert_eq!(exec_mode_problem(text(case, "callData"), case["session"].as_bool().expect("session")), expected, "{}", text(case, "name"));
        }
    }

    #[test]
    fn paymaster_vectors() {
        let v = vectors();
        let cases = v["paymasterRules"].as_array().expect("paymasterRules");
        assert_eq!(cases.len(), 13);
        for case in cases {
            let mut pins: Vec<(u64, String)> = Vec::new();
            if let Some(object) = case["pins"].as_object() {
                for (key, value) in object {
                    pins.push((key.parse::<u64>().expect("chain"), value.as_str().expect("address").to_string()));
                }
            }
            let got = paymaster_problem(case["chainId"].as_u64().expect("chain"), text(case, "paymasterAndData"), &pins);
            assert_eq!(got, case["expected"].as_str(), "{}", text(case, "name"));
        }
    }

    #[test]
    fn gas_caps_follow_the_shared_table() {
        let v = vectors();
        // the caps in the vectors file are the TypeScript table (a backend spec compares them); `chain_rules` equals them
        assert_eq!(v["gasCaps"].as_object().expect("gasCaps").len(), 2);
        for (id, caps) in v["gasCaps"].as_object().expect("gasCaps") {
            let rules = chain_rules(id.parse::<u64>().expect("chain id")).expect("chain");
            let n = |key: &str| -> u128 { text(caps, key).parse().expect("number") };
            assert_eq!(
                (rules.max_verification, rules.max_call, rules.max_pre_verification, rules.max_fee, rules.max_priority, rules.max_total_fee),
                (n("verificationGasLimit"), n("callGasLimit"), n("preVerificationGas"), n("maxFeePerGas"), n("maxPriorityFeePerGas"), n("maxTotalFeeWei")),
                "{id}"
            );
        }
        let mut op: UserOp = serde_json::from_value(v["userOpHash"][0]["userOp"].clone()).expect("rpc form");
        op.verification_gas_limit = "1200000".into();
        op.call_gas_limit = "300000".into();
        op.pre_verification_gas = "100000".into();
        op.max_fee_per_gas = "3000000000".into();
        op.max_priority_fee_per_gas = "1000000000".into();
        let c97 = chain_rules(97).expect("97");
        let c84532 = chain_rules(84532).expect("84532");
        assert_eq!(gas_problem(c97, &op), None);
        assert_eq!(gas_problem(c84532, &op), None);
        // 84532 allows a priority fee of 1 gwei, 97 up to 2 gwei
        op.max_priority_fee_per_gas = "2000000000".into();
        assert_eq!(gas_problem(c97, &op), None);
        assert_eq!(gas_problem(c84532, &op), Some("gas_limits_exceeded"));
        op.max_priority_fee_per_gas = "4000000000".into(); // above the max fee
        assert_eq!(gas_problem(c97, &op), Some("gas_limits_exceeded"));
        op.max_priority_fee_per_gas = "1000000000".into();
        op.verification_gas_limit = "2000001".into();
        assert_eq!(gas_problem(c97, &op), Some("gas_limits_exceeded"));
        op.verification_gas_limit = "2000000".into();
        op.call_gas_limit = "1000000".into();
        op.pre_verification_gas = "1000000".into();
        op.max_fee_per_gas = "5000000000".into(); // 4M gas x 5 gwei = 0.02 ETH is exactly the cap
        assert_eq!(gas_problem(c97, &op), None);
        op.call_gas_limit = "1000000".into();
        op.verification_gas_limit = "2000000".into();
        op.pre_verification_gas = "1000000".into();
        op.max_fee_per_gas = "5000000001".into();
        assert_eq!(gas_problem(c97, &op), Some("gas_limits_exceeded"));
        op.call_gas_limit = "abc".into();
        assert_eq!(gas_problem(c97, &op), Some("gas_value_invalid"));
        assert!(chain_rules(1).is_none() && chain_rules(8453).is_none() && chain_rules(56).is_none());
    }

    #[test]
    fn pinned_values_are_the_shared_ones() {
        let v = vectors();
        assert_eq!(text(&v, "entryPoint"), ENTRY_POINT_V07);
        assert_eq!(text(&v, "smartSessions"), SMART_SESSIONS);
        assert_eq!(text(&v, "webAuthnValidator"), WEBAUTHN_VALIDATOR);
        assert_eq!(text(&v["pinnedTokens"], "97"), chain_rules(97).expect("97").token);
        assert_eq!(text(&v["pinnedTokens"], "84532"), chain_rules(84532).expect("84532").token);
        assert_eq!(to_hex(&session_nonce_key().expect("key")), text(&v, "sessionNonceKey"));
        assert_eq!(to_hex(&P256_ORDER), text(&v, "p256Order"));
        assert_eq!(to_hex(&P256_HALF_ORDER), text(&v, "p256HalfOrder"));
    }

    #[test]
    fn layout_b_permission_id_and_fingerprint_vectors() {
        let v = vectors();
        let layout = &v["layoutB"];
        let x = word32(text(layout, "pubKeyX")).expect("x");
        let y = word32(text(layout, "pubKeyY")).expect("y");
        let data = session_validator_data(&x, &y);
        assert_eq!(data.len(), 320);
        assert_eq!(to_hex(&data), text(layout, "sessionValidatorData"));
        assert_eq!(key_fingerprint(&x, &y), text(layout, "fingerprint"));
        for case in v["permissionId"].as_array().expect("permissionId") {
            let x = word32(text(case, "pubKeyX")).expect("x");
            let y = word32(text(case, "pubKeyY")).expect("y");
            let salt = word32(text(case, "salt")).expect("salt");
            assert_eq!(to_hex(&permission_id(&x, &y, &salt).expect("id")), text(case, "permissionId"), "{}", text(case, "name"));
        }
    }

    #[test]
    fn the_device_signature_bytes_are_the_chain_verified_ones() {
        let v = vectors();
        let s = &v["deviceSignature"];
        let hash = word32(text(s, "hash")).expect("hash");
        assert_eq!(to_hex(&authenticator_data()), text(s, "authenticatorData"));
        assert_eq!(client_data_json(&hash), text(s, "clientDataJSON"));
        let x = word32(text(s, "pubKeyX")).expect("x");
        let y = word32(text(s, "pubKeyY")).expect("y");
        let point = uncompressed_point(&x, &y);
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&hex_to_bytes(text(s, "signature")).expect("signature"));
        // the vector the chain accepted verifies here too, a different hash does not
        assert!(verify_device_signature(&point, &hash, &signature));
        let mut other = hash;
        other[0] ^= 1;
        assert!(!verify_device_signature(&point, &other, &signature));
        // the high-s twin also verifies as an ECDSA signature, and normalizing brings it back to the low one
        let mut high = [0u8; 64];
        high.copy_from_slice(&hex_to_bytes(text(s, "highSSignature")).expect("high"));
        assert_ne!(high, signature);
        assert!(verify_device_signature(&point, &hash, &high));
        normalize_low_s(&mut high);
        assert_eq!(high, signature);
        // a low s is left alone
        let mut again = signature;
        normalize_low_s(&mut again);
        assert_eq!(again, signature);
    }

    #[test]
    fn signing_gives_a_low_s_signature_that_verifies_and_is_bound_to_the_hash() {
        let rng = SystemRandom::new();
        let document = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng).expect("keygen");
        let pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, document.as_ref(), &rng).expect("load");
        let point = pair.public_key().as_ref().to_vec();
        let mut hash = [0u8; 32];
        for i in 0..32 {
            hash[i] = i as u8;
        }
        // several signatures: about half would be high-s without the normalization
        for round in 0..16 {
            hash[0] = round;
            let signature = sign_device_message(document.as_ref(), &hash).expect("signs");
            let mut s = [0u8; 32];
            s.copy_from_slice(&signature[32..]);
            assert!(s <= P256_HALF_ORDER);
            assert!(verify_device_signature(&point, &hash, &signature));
            let mut other = hash;
            other[31] ^= 0x80;
            assert!(!verify_device_signature(&point, &other, &signature));
        }
        assert_eq!(sign_device_message(b"not a key", &hash).err(), Some("session_key_invalid"));
    }

    #[test]
    fn single_execute_decoding_is_strict() {
        let v = vectors();
        for case in v["paymentCallData"].as_array().expect("paymentCallData") {
            let call_data = hex_to_bytes(text(case, "callData")).expect("hex");
            assert_eq!(exec_mode_problem(text(case, "callData"), true), None);
            let exec = decode_single_execute(&call_data).expect("decodes");
            let amount: u128 = text(case, "amount").parse().expect("amount");
            if text(case, "kind") == "native" {
                assert!(exec.data.is_empty());
                assert_eq!(be32_to_u128(&exec.value), Some(amount));
                assert_eq!(to_hex(&exec.target), text(case, "to"));
            } else {
                assert_eq!(to_hex(&exec.target), text(case, "token"));
                assert_eq!(be32_to_u128(&exec.value), Some(0));
                assert_eq!(exec.data.len(), 68);
                assert_eq!(exec.data[..4], ERC20_TRANSFER_SELECTOR);
            }
            // trailing bytes, a short buffer, a non-zero padding byte, another offset: all refused
            let mut longer = call_data.clone();
            longer.push(0);
            assert!(decode_single_execute(&longer).is_none());
            assert!(decode_single_execute(&call_data[..call_data.len() - 1]).is_none());
            let mut offset = call_data.clone();
            offset[67] = 0x60;
            assert!(decode_single_execute(&offset).is_none());
            let last = call_data.len() - 1;
            let mut padding = call_data.clone();
            if padding[last] == 0 && 100 + (padding.len() - 100) > 100 {
                // the last byte is padding only when the length is not a multiple of 32
                let len = word_to_usize(&call_data[68..100]).expect("len");
                if len % 32 != 0 {
                    padding[last] = 1;
                    assert!(decode_single_execute(&padding).is_none());
                }
            }
        }
    }

    #[test]
    fn decimal_and_hex_parsing_edges() {
        assert_eq!(parse_u128("0"), Some(0));
        assert_eq!(parse_u128("340282366920938463463374607431768211455"), Some(u128::MAX));
        assert_eq!(parse_u128("340282366920938463463374607431768211456"), None);
        for bad in ["", "01", "-1", "1.5", " 1", "1 ", "0x10", "١٢"] {
            assert!(dec_to_be32(bad).is_none(), "{bad}");
        }
        assert!(dec_to_be32(&"9".repeat(79)).is_none());
        // 2^256 - 1 fits, 2^256 does not
        let max = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        assert_eq!(dec_to_be32(max), Some([0xff; 32]));
        assert!(dec_to_be32("115792089237316195423570985008687907853269984665640564039457584007913129639936").is_none());
        assert_eq!(norm_hex("0xAbCd"), Some("0xabcd".to_string()));
        for bad in ["abcd", "0x", "0xabc", "0xzz", "0X12"] {
            if bad == "0x" {
                assert_eq!(norm_hex(bad), Some("0x".to_string()));
            } else {
                assert!(norm_hex(bad).is_none(), "{bad}");
            }
        }
        assert!(addr20("0x00").is_none());
    }
}
