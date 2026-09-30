//! 设备身份密钥（E32、E53；REQ-desktop-018 / 019）。
//!
//! - 一把 ECDSA P-256 密钥，Rust 生成，PKCS#8 存进系统钥匙串（`SecureStore`），WebView 拿不到。
//! - 设备 id 是自证的：`dev_` + 公钥 thumbprint 的前 32 位小写十六进制
//!   （`shared/types/device-pairing-proof.ts` 的 `deriveSelfCertifyingDeviceIdV1`）。
//! - 签名一律 ECDSA-SHA256、IEEE P1363（r||s）、base64url 无填充（64 字节 → 86 个字符）。
//! - 没有"签任意字符串"的入口：`sign` 是私有的，只有下面几个固定格式的原文能签，
//!   每个原文的每个字段都先校验格式（不能带换行，不能伪造另一种原文）。
//!   审批的本机确认 ref 由 Rust 自己生成，调用方不能指定；只签"批准"。
//!   现有四种：配对证明、登记签名凭据的持有证明、桌面绑定（六行）、审批本机确认。
//! - 这台电脑的运行时 id（`drt_` + 32 位十六进制）也由 Rust 生成、存钥匙串。
//!
//! 默认关：还没有 Tauri 命令调用这里，等 backend E32 第 3–4 片（运行时凭据、绑定前在线登记）
//! 的合同到了一起接线。
#![allow(dead_code)]

use crate::developer_runtime::confirmation::mint_confirmation_ref;
use crate::developer_runtime::crypto::{sha256_hex, SecureStore};
use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::jcs::{canonicalize_json, jcs_digest};
use crate::developer_runtime::types::KEYRING_SERVICE;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use ring::rand::SystemRandom;
use ring::signature::{EcdsaKeyPair, KeyPair, ECDSA_P256_SHA256_FIXED_SIGNING};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use zeroize::Zeroize;

/// 钥匙串条目：服务名沿用 `agentrix.developer_runtime`，值是 PKCS#8 的十六进制。
pub const KEYRING_DEVICE_IDENTITY_KEY: &str = "device_identity_p256_v1";

pub const DEVICE_PAIRING_PROOF_SCHEMA_VERSION: u32 = 1;
pub const DEVICE_PAIRING_ALGORITHM_P256: &str = "ecdsa-p256-sha256";
/// 与 `DEVICE_PAIRING_PROOF_DOMAIN_V1` 相同。
pub const DEVICE_PAIRING_PROOF_DOMAIN_V1: &str = "agentrix.device.pair.v1";
/// 与 `APPROVAL_LOCAL_CONFIRMATION_DOMAIN_V1` 相同。
pub const APPROVAL_LOCAL_CONFIRMATION_DOMAIN_V1: &str = "agentrix.desktop.approval.local.v1";
/// 与 `DEVICE_SIGNING_CREDENTIAL_REGISTER_PROOF_DOMAIN_V1` 相同（backend `17b118bd`）。
pub const DEVICE_SIGNING_CREDENTIAL_REGISTER_PROOF_DOMAIN_V1: &str =
    "agentrix.device.signing-credential.register.v1";

/// 与 `DESKTOP_DEVICE_BINDING_DOMAIN_V1` 相同（backend `6871b6f7`，`shared/types/device-runtime-binding.ts`）。
pub const DESKTOP_DEVICE_BINDING_DOMAIN_V1: &str = "agentrix.desktop.binding.v1";
pub const DESKTOP_DEVICE_BINDING_SCHEMA_VERSION: u32 = 1;
/// 与 shared/types 的 `DEVELOPER_RUNTIME_CREDENTIAL_*_DOMAIN_V1`、`DEVELOPER_RUNTIME_PRESENCE_DOMAIN_V1` 相同
/// （backend `7d544a6e`、`e264772f`）。
pub const DEVELOPER_RUNTIME_CREDENTIAL_ISSUE_DOMAIN_V1: &str = "agentrix.developer-runtime.credential.issue.v1";
pub const DEVELOPER_RUNTIME_CREDENTIAL_REFRESH_DOMAIN_V1: &str =
    "agentrix.developer-runtime.credential.refresh.v1";
pub const DEVELOPER_RUNTIME_PRESENCE_DOMAIN_V1: &str = "agentrix.developer-runtime.presence.v1";
pub const DEVELOPER_RUNTIME_SCHEMA_VERSION: u32 = 1;
const PRESENCE_MAX_WORKSPACES: usize = 20;
/// 钥匙串条目：这台电脑上开发者运行时的 id（`drt_` + 32 位小写十六进制）。
pub const KEYRING_RUNTIME_ID_KEY: &str = "runtime_id_v1";
const RUNTIME_ID_PREFIX: &str = "drt_";
const DESKTOP_BINDING_MIN_TTL_SECONDS: u32 = 60;
const DESKTOP_BINDING_MAX_TTL_SECONDS: u32 = 24 * 60 * 60;

const DEVICE_ID_PREFIX: &str = "dev_";
const DEVICE_ID_HEX_LENGTH: usize = 32;
const P256_COORDINATE_BYTES: usize = 32;
const P1363_SIGNATURE_BYTES: usize = 64;
const MAX_TITLE_CHARS: usize = 120;

/// 公钥 JWK，只有 `kty` `crv` `x` `y` 四个字段（`DeviceSigningPublicJwkV1`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicJwk {
    pub kty: String,
    pub crv: String,
    pub x: String,
    pub y: String,
}

/// `DevicePairingProofV1`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePairingProof {
    pub schema_version: u32,
    pub algorithm: String,
    pub public_jwk: PublicJwk,
    pub signature: String,
}

/// `DeviceSigningKeyProofV1`（登记签名凭据时的持有证明）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceSigningKeyProof {
    pub signature: String,
}

/// `ApprovalLocalConfirmationV1`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovalLocalConfirmation {
    #[serde(rename = "ref")]
    pub confirmation_ref: String,
    pub signature: String,
}

/// 要本人确认的一条审批。`title` / `risk_level` 只用来在原生确认框里显示，不进签名原文。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalConfirmationRequest {
    pub approval_id: String,
    pub request_digest: String,
    pub title: String,
    pub risk_level: String,
}

/// `{ type: 'shell_session_binding', id, version }`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShellBindingRef {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: String,
    pub version: u32,
}

/// `DesktopDeviceBindingCreateCommandV1`（`POST /api/v1/devices/:deviceId/desktop-binding`）。
/// 只能由 `DeviceIdentity::desktop_binding_command` 生成：签名和字段来自同一组输入。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBindingCreateCommand {
    pub schema_version: u32,
    pub request_id: String,
    pub agent_account_id: String,
    pub runtime_id: String,
    pub signer_ref: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl_seconds: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supersedes_binding_ref: Option<ShellBindingRef>,
    pub signed_at: String,
    pub signature: String,
}

/// 建绑定要的输入（`signedAt` 由调用方给，便于测试；接线时用当前时间）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopBindingRequest<'a> {
    pub request_id: &'a str,
    pub agent_account_id: &'a str,
    pub runtime_id: &'a str,
    pub signer_ref: &'a str,
    pub ttl_seconds: Option<u32>,
    pub supersedes_binding_ref: Option<ShellBindingRef>,
    pub signed_at: &'a str,
}

/// `DeveloperRuntimeCredentialIssueCommandV1`（`POST /api/v1/devices/:deviceId/runtime-credentials`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCredentialIssueCommand {
    pub schema_version: u32,
    pub request_id: String,
    pub runtime_id: String,
    pub signer_ref: String,
    pub binding_ref: ShellBindingRef,
    pub signed_at: String,
    pub signature: String,
}

/// `DeveloperRuntimeCredentialRefreshCommandV1`（`.../runtime-credentials/refresh`，带旧 token）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCredentialRefreshCommand {
    pub schema_version: u32,
    pub request_id: String,
    pub binding_ref: ShellBindingRef,
    pub signed_at: String,
    pub signature: String,
}

/// `DigestRef`：`{ algorithm: 'sha-256', canonicalization: 'jcs/1', value }`。
pub use crate::developer_runtime::types::DigestRef as PresenceDigest;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceWorkspace {
    pub path_digest: PresenceDigest,
    pub display_name: String,
    /// `trusted` / `untrusted`。
    pub trust: String,
    pub trust_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trusted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PresenceMachine {
    pub label: String,
    /// `macos` / `windows` / `linux`。
    pub os: String,
}

/// `DeveloperRuntimePresenceV1`（`POST /api/v1/developer/runtime/presence`，运行时凭据）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePresence {
    pub schema_version: u32,
    pub request_id: String,
    pub device_ref: String,
    pub runtime_id: String,
    pub machine: PresenceMachine,
    pub workspaces: Vec<PresenceWorkspace>,
    pub signed_at: String,
    pub signature: String,
}

pub struct DeviceIdentity {
    key_pair: EcdsaKeyPair,
    public_jwk: PublicJwk,
    thumbprint_hex: String,
    device_id: String,
}

impl std::fmt::Debug for DeviceIdentity {
    // 不打印私钥。
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DeviceIdentity")
            .field("device_id", &self.device_id)
            .finish_non_exhaustive()
    }
}

impl DeviceIdentity {
    /// 生成一把新密钥。返回的 PKCS#8 由调用方存进钥匙串后清零。
    fn generate() -> RuntimeResult<(Self, Vec<u8>)> {
        let rng = SystemRandom::new();
        let document = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng)
            .map_err(|_| RuntimeError::fail_closed("device_identity_keygen_failed"))?;
        let pkcs8 = document.as_ref().to_vec();
        let identity = Self::from_pkcs8(&pkcs8)?;
        Ok((identity, pkcs8))
    }

    fn from_pkcs8(pkcs8: &[u8]) -> RuntimeResult<Self> {
        let rng = SystemRandom::new();
        let key_pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, pkcs8, &rng)
            .map_err(|_| RuntimeError::fail_closed("device_identity_key_invalid"))?;
        let public_jwk = public_jwk_from_uncompressed(key_pair.public_key().as_ref())?;
        let thumbprint_hex = jwk_thumbprint_hex(&public_jwk)?;
        let device_id = derive_device_id(&thumbprint_hex)?;
        Ok(Self {
            key_pair,
            public_jwk,
            thumbprint_hex,
            device_id,
        })
    }

    /// 读钥匙串里的密钥。没有返回 None；内容坏了报错（不当成"没有"）。
    pub fn load(store: &dyn SecureStore) -> RuntimeResult<Option<Self>> {
        match store.get(KEYRING_SERVICE, KEYRING_DEVICE_IDENTITY_KEY)? {
            None => Ok(None),
            Some(mut bytes) => {
                let result = Self::from_pkcs8(&bytes);
                bytes.zeroize();
                result.map(Some)
            }
        }
    }

    /// 有就读出来，没有就生成一把并存进钥匙串。
    /// 钥匙串里的内容坏了不覆盖：覆盖会换掉设备 id，已经配对的记录就对不上了。
    pub fn load_or_create(store: &dyn SecureStore) -> RuntimeResult<Self> {
        if let Some(existing) = Self::load(store)? {
            return Ok(existing);
        }
        let (created, mut pkcs8) = Self::generate()?;
        let stored = store.set(KEYRING_SERVICE, KEYRING_DEVICE_IDENTITY_KEY, &pkcs8);
        pkcs8.zeroize();
        stored?;
        // 存完再读一次，确认钥匙串里的就是刚生成的这把。
        match Self::load(store)? {
            Some(reloaded) if reloaded.device_id == created.device_id => Ok(reloaded),
            _ => Err(RuntimeError::fail_closed("device_identity_store_mismatch")),
        }
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    pub fn public_jwk(&self) -> &PublicJwk {
        &self.public_jwk
    }

    pub fn thumbprint_hex(&self) -> &str {
        &self.thumbprint_hex
    }

    /// 配对持有证明：对 `devicePairingProofMessageV1({ ticket, deviceId })` 签名。
    pub fn pairing_proof(&self, ticket: &str) -> RuntimeResult<DevicePairingProof> {
        let message = device_pairing_proof_message(ticket, &self.device_id)?;
        Ok(DevicePairingProof {
            schema_version: DEVICE_PAIRING_PROOF_SCHEMA_VERSION,
            algorithm: DEVICE_PAIRING_ALGORITHM_P256.into(),
            public_jwk: self.public_jwk.clone(),
            signature: self.sign(&message)?,
        })
    }

    /// 登记签名凭据的持有证明：对 `deviceSigningCredentialRegisterProofMessageV1` 签名。
    /// device id 和公钥 thumbprint 都取自这把密钥本身，调用方只能给 requestId。
    /// 后端要求自证 id 的设备登记的就是推导出 id 的那把公钥，所以桌面用同一把密钥登记。
    pub fn signing_credential_register_proof(
        &self,
        request_id: &str,
    ) -> RuntimeResult<DeviceSigningKeyProof> {
        let message = signing_credential_register_proof_message(
            &self.device_id,
            request_id,
            &self.thumbprint_hex,
        )?;
        Ok(DeviceSigningKeyProof {
            signature: self.sign(&message)?,
        })
    }

    /// 建桌面绑定的请求体：先校验每个字段，再签 `desktopDeviceBindingMessageV1`。
    /// deviceId 取自这把密钥本身。
    pub fn desktop_binding_command(
        &self,
        request: &DesktopBindingRequest<'_>,
    ) -> RuntimeResult<DesktopBindingCreateCommand> {
        if !is_uuid(request.agent_account_id) {
            return Err(RuntimeError::fail_closed("agent_account_id_invalid"));
        }
        if let Some(ttl) = request.ttl_seconds {
            if !(DESKTOP_BINDING_MIN_TTL_SECONDS..=DESKTOP_BINDING_MAX_TTL_SECONDS).contains(&ttl) {
                return Err(RuntimeError::fail_closed("binding_ttl_invalid"));
            }
        }
        if let Some(previous) = &request.supersedes_binding_ref {
            if previous.kind != "shell_session_binding" || !is_uuid(&previous.id) || previous.version < 1 {
                return Err(RuntimeError::fail_closed("supersedes_binding_ref_invalid"));
            }
        }
        let message = desktop_device_binding_message(
            &self.device_id,
            request.request_id,
            request.runtime_id,
            request.signer_ref,
            request.signed_at,
        )?;
        Ok(DesktopBindingCreateCommand {
            schema_version: DESKTOP_DEVICE_BINDING_SCHEMA_VERSION,
            request_id: request.request_id.into(),
            agent_account_id: request.agent_account_id.into(),
            runtime_id: request.runtime_id.into(),
            signer_ref: request.signer_ref.into(),
            ttl_seconds: request.ttl_seconds,
            supersedes_binding_ref: request.supersedes_binding_ref.clone(),
            signed_at: request.signed_at.into(),
            signature: self.sign(&message)?,
        })
    }

    /// 签发运行时凭据的请求体（第 4 步）。
    pub fn runtime_credential_issue_command(
        &self,
        request_id: &str,
        runtime_id: &str,
        signer_ref: &str,
        binding: &ShellBindingRef,
        signed_at: &str,
    ) -> RuntimeResult<RuntimeCredentialIssueCommand> {
        let message =
            runtime_credential_issue_message(&self.device_id, request_id, runtime_id, signer_ref, binding, signed_at)?;
        Ok(RuntimeCredentialIssueCommand {
            schema_version: DEVELOPER_RUNTIME_SCHEMA_VERSION,
            request_id: request_id.into(),
            runtime_id: runtime_id.into(),
            signer_ref: signer_ref.into(),
            binding_ref: binding.clone(),
            signed_at: signed_at.into(),
            signature: self.sign(&message)?,
        })
    }

    /// 刷新运行时凭据的请求体。`credential_ref` 是旧凭据的（`drc_…`）。
    pub fn runtime_credential_refresh_command(
        &self,
        credential_ref: &str,
        request_id: &str,
        binding: &ShellBindingRef,
        signed_at: &str,
    ) -> RuntimeResult<RuntimeCredentialRefreshCommand> {
        let message =
            runtime_credential_refresh_message(&self.device_id, credential_ref, request_id, binding, signed_at)?;
        Ok(RuntimeCredentialRefreshCommand {
            schema_version: DEVELOPER_RUNTIME_SCHEMA_VERSION,
            request_id: request_id.into(),
            binding_ref: binding.clone(),
            signed_at: signed_at.into(),
            signature: self.sign(&message)?,
        })
    }

    /// 绑定前在线登记（第 5 步）：校验每个字段，按合同算去掉签名后的 JCS 摘要，再签四行原文。
    /// `deviceRef` 取自这把密钥本身。
    pub fn runtime_presence(
        &self,
        request_id: &str,
        runtime_id: &str,
        machine: PresenceMachine,
        workspaces: Vec<PresenceWorkspace>,
        signed_at: &str,
    ) -> RuntimeResult<RuntimePresence> {
        validate_request_id(request_id)?;
        if !is_runtime_id(runtime_id) {
            return Err(RuntimeError::fail_closed("runtime_id_invalid"));
        }
        validate_signed_at(signed_at)?;
        validate_presence_machine(&machine)?;
        validate_presence_workspaces(&workspaces, signed_at)?;
        let mut presence = RuntimePresence {
            schema_version: DEVELOPER_RUNTIME_SCHEMA_VERSION,
            request_id: request_id.into(),
            device_ref: self.device_id.clone(),
            runtime_id: runtime_id.into(),
            machine,
            workspaces,
            signed_at: signed_at.into(),
            signature: String::new(),
        };
        let digest = runtime_presence_digest(&presence)?;
        let message = runtime_presence_message(request_id, &digest, signed_at)?;
        presence.signature = self.sign(&message)?;
        Ok(presence)
    }

    /// 只在本人已经在原生确认框里点了"批准"之后调用（`confirm_and_sign_approval`）。
    /// ref 由这里生成，调用方不能指定；决定固定为 approved（拒绝不需要签名）。
    fn sign_approved_confirmation(
        &self,
        approval_id: &str,
        request_digest: &str,
    ) -> RuntimeResult<ApprovalLocalConfirmation> {
        let confirmation_ref = mint_confirmation_ref();
        let message = approval_local_confirmation_message(
            approval_id,
            request_digest,
            "approved",
            &confirmation_ref,
        )?;
        Ok(ApprovalLocalConfirmation {
            confirmation_ref,
            signature: self.sign(&message)?,
        })
    }

    /// 私有：只给上面几个固定格式的原文用。
    fn sign(&self, message: &str) -> RuntimeResult<String> {
        let rng = SystemRandom::new();
        let signature = self
            .key_pair
            .sign(&rng, message.as_bytes())
            .map_err(|_| RuntimeError::fail_closed("device_identity_sign_failed"))?;
        let bytes = signature.as_ref();
        if bytes.len() != P1363_SIGNATURE_BYTES {
            return Err(RuntimeError::fail_closed("device_identity_sign_failed"));
        }
        Ok(URL_SAFE_NO_PAD.encode(bytes))
    }
}

// ── Device safety events (REQ-desktop-010 / REQ-backend-047, shared/types/device-safety-event.ts) ──
//
// The emergency-stop receipt: the WebView posts it with the owner's login;
// the device key proves which computer it came from. Only the fixed five-line
// message over a validated event is ever signed.

pub const DEVICE_SAFETY_EVENT_DIGEST_DOMAIN_V1: &str = "AGENTRIX_DEVICE_SAFETY_EVENT_V1";
pub const DEVICE_SAFETY_EVENT_SIGNATURE_DOMAIN_V1: &str = "AGENTRIX_DEVICE_SAFETY_EVENT_SIGNATURE_V1";
const DEVICE_SAFETY_EVENT_KEYS: &[&str] = &[
    "id", "kind", "at", "origin", "reason", "approvalsRejected", "nativeGate", "runtime", "settledAfterMs", "withinBudget",
];
const DEVICE_SAFETY_ORIGINS: &[&str] = &["tray", "settings", "shortcut", "local-user", "remote-stop"];
const DEVICE_SAFETY_GATES: &[&str] = &["confirmed", "not_confirmed", "unavailable"];
const DEVICE_SAFETY_BUDGET_MS: u64 = 3000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSafetyEventSignature {
    pub device_id: String,
    pub signer_ref: String,
    pub signed_at: String,
    pub signature: String,
    pub event_digest: String,
}

/// `validateDeviceSafetyEventV1`, the same rules (a little stricter on control characters).
pub fn validate_device_safety_event(event: &Value) -> RuntimeResult<()> {
    let bad = |field: &str| Err(RuntimeError::fail_closed("safety_event_invalid").with_message(field.to_string()));
    let Some(object) = event.as_object() else {
        return bad("event");
    };
    if let Some(key) = object.keys().find(|key| !DEVICE_SAFETY_EVENT_KEYS.contains(&key.as_str())) {
        return bad(key);
    }
    let text = |key: &str| object.get(key).and_then(Value::as_str);
    let id_ok = text("id")
        .and_then(|id| id.strip_prefix("es-"))
        .and_then(|rest| rest.split_once('-'))
        .map(|(ms, seq)| {
            (10..=16).contains(&ms.len())
                && ms.bytes().all(|b| b.is_ascii_digit())
                && (1..=6).contains(&seq.len())
                && seq.bytes().all(|b| b.is_ascii_digit())
        })
        .unwrap_or(false);
    if !id_ok {
        return bad("id");
    }
    let kind = text("kind");
    if !matches!(kind, Some("engaged") | Some("released")) {
        return bad("kind");
    }
    // Exactly `Date.prototype.toISOString()` (24 characters, milliseconds, Z).
    let at_ok = text("at")
        .map(|at| {
            at.len() == 24
                && at.as_bytes()[19] == b'.'
                && chrono::DateTime::parse_from_rfc3339(at)
                    .map(|t| t.with_timezone(&chrono::Utc).format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string() == at)
                    .unwrap_or(false)
        })
        .unwrap_or(false);
    if !at_ok {
        return bad("at");
    }
    if !text("origin").map(|o| DEVICE_SAFETY_ORIGINS.contains(&o)).unwrap_or(false) {
        return bad("origin");
    }
    if let Some(reason) = object.get("reason") {
        if !reason.as_str().map(|r| is_display_text(r, 80)).unwrap_or(false) {
            return bad("reason");
        }
    }
    let int_in = |key: &str, max: u64| object.get(key).map(|v| v.as_u64().map(|n| n <= max).unwrap_or(false));
    if int_in("approvalsRejected", 10_000) == Some(false) {
        return bad("approvalsRejected");
    }
    let gate = |key: &str| object.get(key).map(|v| v.as_str().map(|g| DEVICE_SAFETY_GATES.contains(&g)).unwrap_or(false));
    if gate("nativeGate") != Some(true) {
        return bad("nativeGate");
    }
    match gate("runtime") {
        Some(false) => return bad("runtime"),
        Some(true) if kind == Some("released") => return bad("runtime"),
        _ => {}
    }
    if int_in("settledAfterMs", 3_600_000) == Some(false) {
        return bad("settledAfterMs");
    }
    if let Some(within) = object.get("withinBudget") {
        let Some(within) = within.as_bool() else {
            return bad("withinBudget");
        };
        let settled = object.get("settledAfterMs").and_then(Value::as_u64);
        if within && (text("nativeGate") != Some("confirmed") || settled.map(|ms| ms > DEVICE_SAFETY_BUDGET_MS).unwrap_or(true)) {
            return bad("withinBudget");
        }
    }
    Ok(())
}

/// `deviceSafetyEventDigestV1`: `sha256:` + hex(sha256(domain + "\n" + JCS(event))).
pub fn device_safety_event_digest(event: &Value) -> RuntimeResult<String> {
    let canonical = crate::developer_runtime::jcs::canonicalize_json(event)?;
    let input = format!("{DEVICE_SAFETY_EVENT_DIGEST_DOMAIN_V1}\n{canonical}");
    Ok(format!("sha256:{}", crate::developer_runtime::crypto::sha256_hex(input.as_bytes())))
}

/// `deviceSafetyEventMessageV1`: five lines, `\n`, no trailing newline.
pub fn device_safety_event_message(device_id: &str, signer_ref: &str, event_digest: &str, signed_at: &str) -> RuntimeResult<String> {
    validate_device_id(device_id)?;
    if !is_opaque(signer_ref, 128) {
        return Err(RuntimeError::fail_closed("signer_ref_invalid"));
    }
    let digest_ok = event_digest.strip_prefix("sha256:").map(|hex| is_lower_hex(hex, 64)).unwrap_or(false);
    if !digest_ok {
        return Err(RuntimeError::fail_closed("safety_event_digest_invalid"));
    }
    validate_signed_at(signed_at)?;
    Ok([DEVICE_SAFETY_EVENT_SIGNATURE_DOMAIN_V1, device_id, signer_ref, event_digest, signed_at].join("\n"))
}

impl DeviceIdentity {
    /// Signs the receipt of one emergency-stop event (validated first).
    pub fn sign_device_safety_event(&self, signer_ref: &str, event: &Value, signed_at: &str) -> RuntimeResult<DeviceSafetyEventSignature> {
        validate_device_safety_event(event)?;
        let event_digest = device_safety_event_digest(event)?;
        let message = device_safety_event_message(&self.device_id, signer_ref, &event_digest, signed_at)?;
        Ok(DeviceSafetyEventSignature {
            device_id: self.device_id.clone(),
            signer_ref: signer_ref.to_string(),
            signed_at: signed_at.to_string(),
            signature: self.sign(&message)?,
            event_digest,
        })
    }
}

/// 在原生确认框里请本人确认这条审批，点了"确定"才签。格式不对的请求连确认框都不弹。
pub fn confirm_and_sign_approval(
    identity: &DeviceIdentity,
    request: &ApprovalConfirmationRequest,
) -> RuntimeResult<ApprovalLocalConfirmation> {
    confirm_with(identity, request, &native_approval_dialog)
}

/// Same, with the caller showing the dialog (the Tauri command shows it on the
/// main thread). The text still comes from Rust (`ApprovalDialogText`).
pub fn confirm_and_sign_approval_with(
    identity: &DeviceIdentity,
    request: &ApprovalConfirmationRequest,
    present: &dyn Fn(&ApprovalDialogText) -> bool,
) -> RuntimeResult<ApprovalLocalConfirmation> {
    confirm_with(identity, request, present)
}

/// Show the approval dialog with rfd (callers put this on the main thread).
pub fn show_native_approval_dialog(text: &ApprovalDialogText) -> bool {
    native_approval_dialog(text)
}

fn confirm_with(
    identity: &DeviceIdentity,
    request: &ApprovalConfirmationRequest,
    present: &dyn Fn(&ApprovalDialogText) -> bool,
) -> RuntimeResult<ApprovalLocalConfirmation> {
    validate_approval_id(&request.approval_id)?;
    validate_request_digest(&request.request_digest)?;
    let text = approval_dialog_text(request);
    if !present(&text) {
        return Err(RuntimeError::unavailable("local_confirmation_rejected"));
    }
    identity.sign_approved_confirmation(&request.approval_id, &request.request_digest)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovalDialogText {
    pub title: String,
    pub description: String,
    pub high_risk: bool,
}

/// 确认框里的文字全由 Rust 拼：标题去掉控制字符、最多 120 字；级别未知按 L3；摘要显示前 8 位。
fn approval_dialog_text(request: &ApprovalConfirmationRequest) -> ApprovalDialogText {
    let risk = normalize_risk_level(&request.risk_level);
    let mut title: String = request
        .title
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .trim()
        .chars()
        .take(MAX_TITLE_CHARS)
        .collect();
    if title.is_empty() {
        title = "(no title)".into();
    }
    let digest_prefix = request.request_digest.get(..8).unwrap_or("");
    ApprovalDialogText {
        title: format!("Agentrix · {risk} approval"),
        description: format!(
            "{title}\n\nRisk: {risk}\nRequest: {digest_prefix}…\n\nThis computer will sign the approval with its device key. Approve only if you started or expect this action."
        ),
        high_risk: risk == "L3",
    }
}

fn native_approval_dialog(text: &ApprovalDialogText) -> bool {
    let level = if text.high_risk {
        rfd::MessageLevel::Warning
    } else {
        rfd::MessageLevel::Info
    };
    let shown = rfd::MessageDialog::new()
        .set_level(level)
        .set_title(&text.title)
        .set_description(&text.description)
        .set_buttons(rfd::MessageButtons::OkCancel)
        .show();
    matches!(shown, rfd::MessageDialogResult::Ok)
}

fn normalize_risk_level(value: &str) -> &'static str {
    match value {
        "L0" => "L0",
        "L1" => "L1",
        "L2" => "L2",
        _ => "L3",
    }
}

// ---- 固定格式的原文（与 shared/types 逐字节相同） -------------------------------------------

/// `devicePairingProofMessageV1`：三行，`\n` 分隔，没有结尾换行。
pub fn device_pairing_proof_message(ticket: &str, device_id: &str) -> RuntimeResult<String> {
    validate_ticket(ticket)?;
    validate_device_id(device_id)?;
    Ok(format!("{DEVICE_PAIRING_PROOF_DOMAIN_V1}\n{ticket}\n{device_id}"))
}

/// `approvalLocalConfirmationMessageV1`：五行，`\n` 分隔，没有结尾换行。
pub fn approval_local_confirmation_message(
    approval_id: &str,
    request_digest: &str,
    decision: &str,
    confirmation_ref: &str,
) -> RuntimeResult<String> {
    validate_approval_id(approval_id)?;
    validate_request_digest(request_digest)?;
    if decision != "approved" && decision != "rejected" {
        return Err(RuntimeError::fail_closed("approval_decision_invalid"));
    }
    validate_confirmation_ref(confirmation_ref)?;
    Ok([
        APPROVAL_LOCAL_CONFIRMATION_DOMAIN_V1,
        approval_id,
        request_digest,
        decision,
        confirmation_ref,
    ]
    .join("\n"))
}

/// `deviceSigningCredentialRegisterProofMessageV1`：四行，`\n` 分隔，没有结尾换行。
pub fn signing_credential_register_proof_message(
    device_id: &str,
    request_id: &str,
    public_key_thumbprint: &str,
) -> RuntimeResult<String> {
    validate_device_id(device_id)?;
    if !is_opaque(request_id, 255) {
        return Err(RuntimeError::fail_closed("request_id_invalid"));
    }
    if !is_lower_hex(public_key_thumbprint, 64) {
        return Err(RuntimeError::fail_closed("device_identity_thumbprint_invalid"));
    }
    Ok([
        DEVICE_SIGNING_CREDENTIAL_REGISTER_PROOF_DOMAIN_V1,
        device_id,
        request_id,
        public_key_thumbprint,
    ]
    .join("\n"))
}

/// `developerRuntimeCredentialIssueMessageV1`：八行，`\n` 分隔，没有结尾换行。
pub fn runtime_credential_issue_message(
    device_id: &str,
    request_id: &str,
    runtime_id: &str,
    signer_ref: &str,
    binding: &ShellBindingRef,
    signed_at: &str,
) -> RuntimeResult<String> {
    validate_device_id(device_id)?;
    validate_request_id(request_id)?;
    if !is_runtime_id(runtime_id) {
        return Err(RuntimeError::fail_closed("runtime_id_invalid"));
    }
    if !is_opaque(signer_ref, 255) {
        return Err(RuntimeError::fail_closed("signer_ref_invalid"));
    }
    validate_binding_ref(binding)?;
    validate_signed_at(signed_at)?;
    Ok([
        DEVELOPER_RUNTIME_CREDENTIAL_ISSUE_DOMAIN_V1,
        device_id,
        request_id,
        runtime_id,
        signer_ref,
        binding.id.as_str(),
        &binding.version.to_string(),
        signed_at,
    ]
    .join("\n"))
}

/// `developerRuntimeCredentialRefreshMessageV1`：七行，`\n` 分隔，没有结尾换行。
/// `credential_ref` 是旧凭据的。
pub fn runtime_credential_refresh_message(
    device_id: &str,
    credential_ref: &str,
    request_id: &str,
    binding: &ShellBindingRef,
    signed_at: &str,
) -> RuntimeResult<String> {
    validate_device_id(device_id)?;
    if !is_runtime_credential_ref(credential_ref) {
        return Err(RuntimeError::fail_closed("runtime_credential_ref_invalid"));
    }
    validate_request_id(request_id)?;
    validate_binding_ref(binding)?;
    validate_signed_at(signed_at)?;
    Ok([
        DEVELOPER_RUNTIME_CREDENTIAL_REFRESH_DOMAIN_V1,
        device_id,
        credential_ref,
        request_id,
        binding.id.as_str(),
        &binding.version.to_string(),
        signed_at,
    ]
    .join("\n"))
}

/// `developerRuntimePresenceMessageV1`：四行，`\n` 分隔，没有结尾换行。`digest` 是
/// `developerRuntimePresenceDigestV1`（去掉 `signature` 后整个请求体的 JCS sha-256）。
pub fn runtime_presence_message(request_id: &str, digest: &str, signed_at: &str) -> RuntimeResult<String> {
    validate_request_id(request_id)?;
    if !is_lower_hex(digest, 64) {
        return Err(RuntimeError::fail_closed("presence_digest_invalid"));
    }
    validate_signed_at(signed_at)?;
    Ok([DEVELOPER_RUNTIME_PRESENCE_DOMAIN_V1, request_id, digest, signed_at].join("\n"))
}

/// `developerRuntimePresenceDigestV1`：去掉 `signature` 以后整个请求体的 JCS sha-256（小写十六进制）。
pub fn runtime_presence_digest(presence: &RuntimePresence) -> RuntimeResult<String> {
    let mut value =
        serde_json::to_value(presence).map_err(|_| RuntimeError::fail_closed("presence_serialize_failed"))?;
    value
        .as_object_mut()
        .ok_or_else(|| RuntimeError::fail_closed("presence_serialize_failed"))?
        .remove("signature");
    Ok(jcs_digest(&value)?.value)
}

fn validate_presence_machine(machine: &PresenceMachine) -> RuntimeResult<()> {
    if !is_display_text(&machine.label, 64) {
        return Err(RuntimeError::fail_closed("presence_machine_label_invalid"));
    }
    if !matches!(machine.os.as_str(), "macos" | "windows" | "linux") {
        return Err(RuntimeError::fail_closed("presence_machine_os_invalid"));
    }
    Ok(())
}

fn validate_presence_workspaces(workspaces: &[PresenceWorkspace], signed_at: &str) -> RuntimeResult<()> {
    if workspaces.len() > PRESENCE_MAX_WORKSPACES {
        return Err(RuntimeError::fail_closed("presence_too_many_workspaces"));
    }
    let signed_at_ms = chrono::DateTime::parse_from_rfc3339(signed_at)
        .map(|t| t.timestamp_millis())
        .map_err(|_| RuntimeError::fail_closed("signed_at_invalid"))?;
    let mut seen = std::collections::HashSet::new();
    for workspace in workspaces {
        let digest = &workspace.path_digest;
        if digest.algorithm != "sha-256" || digest.canonicalization != "jcs/1" || !is_lower_hex(&digest.value, 64) {
            return Err(RuntimeError::fail_closed("presence_path_digest_invalid"));
        }
        if !seen.insert(digest.value.clone()) {
            return Err(RuntimeError::fail_closed("presence_path_digest_duplicate"));
        }
        if !is_display_text(&workspace.display_name, 64) {
            return Err(RuntimeError::fail_closed("presence_display_name_invalid"));
        }
        if workspace.trust != "trusted" && workspace.trust != "untrusted" {
            return Err(RuntimeError::fail_closed("presence_trust_invalid"));
        }
        if workspace.trust_source != "owner_folder_pick" {
            return Err(RuntimeError::fail_closed("presence_trust_source_invalid"));
        }
        if let Some(trusted_at) = &workspace.trusted_at {
            if workspace.trust != "trusted" {
                return Err(RuntimeError::fail_closed("presence_trusted_at_invalid"));
            }
            validate_signed_at(trusted_at).map_err(|_| RuntimeError::fail_closed("presence_trusted_at_invalid"))?;
            let at = chrono::DateTime::parse_from_rfc3339(trusted_at)
                .map(|t| t.timestamp_millis())
                .map_err(|_| RuntimeError::fail_closed("presence_trusted_at_invalid"))?;
            if at > signed_at_ms {
                return Err(RuntimeError::fail_closed("presence_trusted_at_invalid"));
            }
        }
    }
    Ok(())
}

/// `DEVELOPER_RUNTIME_CREDENTIAL_REF_PATTERN`：`drc_` + 32 位小写十六进制。
pub fn is_runtime_credential_ref(value: &str) -> bool {
    value
        .strip_prefix("drc_")
        .map(|hex| is_lower_hex(hex, 32))
        .unwrap_or(false)
}

/// `desktopDeviceBindingMessageV1`：六行，`\n` 分隔，没有结尾换行。
pub fn desktop_device_binding_message(
    device_id: &str,
    request_id: &str,
    runtime_id: &str,
    signer_ref: &str,
    signed_at: &str,
) -> RuntimeResult<String> {
    validate_device_id(device_id)?;
    if !is_opaque(request_id, 128) {
        return Err(RuntimeError::fail_closed("request_id_invalid"));
    }
    if !is_runtime_id(runtime_id) {
        return Err(RuntimeError::fail_closed("runtime_id_invalid"));
    }
    if !is_opaque(signer_ref, 255) {
        return Err(RuntimeError::fail_closed("signer_ref_invalid"));
    }
    validate_signed_at(signed_at)?;
    Ok([
        DESKTOP_DEVICE_BINDING_DOMAIN_V1,
        device_id,
        request_id,
        runtime_id,
        signer_ref,
        signed_at,
    ]
    .join("\n"))
}

/// `DESKTOP_RUNTIME_ID_PATTERN`：`drt_` + 32 位小写十六进制。
pub fn is_runtime_id(value: &str) -> bool {
    value
        .strip_prefix(RUNTIME_ID_PREFIX)
        .map(|hex| is_lower_hex(hex, 32))
        .unwrap_or(false)
}

pub fn mint_runtime_id() -> String {
    let bytes: [u8; 16] = rand::random();
    format!("{RUNTIME_ID_PREFIX}{}", hex::encode(bytes))
}

/// 这台电脑的运行时 id：有就读，没有就生成并存进钥匙串。内容不对报错、不覆盖
/// （覆盖会让已有绑定里的 `runtimeRef.id` 对不上）。
pub fn load_or_create_runtime_id(store: &dyn SecureStore) -> RuntimeResult<String> {
    if let Some(existing) = store.get_text(KEYRING_SERVICE, KEYRING_RUNTIME_ID_KEY)? {
        return if is_runtime_id(&existing) {
            Ok(existing)
        } else {
            Err(RuntimeError::fail_closed("runtime_id_corrupt"))
        };
    }
    let created = mint_runtime_id();
    store.set_text(KEYRING_SERVICE, KEYRING_RUNTIME_ID_KEY, &created)?;
    match store.get_text(KEYRING_SERVICE, KEYRING_RUNTIME_ID_KEY)? {
        Some(reloaded) if reloaded == created => Ok(created),
        _ => Err(RuntimeError::fail_closed("runtime_id_store_mismatch")),
    }
}

/// thumbprint = SHA-256(JCS({crv, kty, x, y}))，64 位小写十六进制
/// （后端 `computeEmbeddedCanonicalSha256V1({ crv, kty, x, y })`）。
pub fn jwk_thumbprint_hex(jwk: &PublicJwk) -> RuntimeResult<String> {
    let canonical = canonicalize_json(&json!({
        "crv": jwk.crv,
        "kty": jwk.kty,
        "x": jwk.x,
        "y": jwk.y,
    }))?;
    Ok(sha256_hex(canonical.as_bytes()))
}

/// `deriveSelfCertifyingDeviceIdV1`。
pub fn derive_device_id(thumbprint_hex: &str) -> RuntimeResult<String> {
    if !is_lower_hex(thumbprint_hex, 64) {
        return Err(RuntimeError::fail_closed("device_identity_thumbprint_invalid"));
    }
    Ok(format!(
        "{DEVICE_ID_PREFIX}{}",
        &thumbprint_hex[..DEVICE_ID_HEX_LENGTH]
    ))
}

fn public_jwk_from_uncompressed(point: &[u8]) -> RuntimeResult<PublicJwk> {
    if point.len() != 1 + 2 * P256_COORDINATE_BYTES || point[0] != 0x04 {
        return Err(RuntimeError::fail_closed("device_identity_public_key_invalid"));
    }
    Ok(PublicJwk {
        kty: "EC".into(),
        crv: "P-256".into(),
        x: URL_SAFE_NO_PAD.encode(&point[1..1 + P256_COORDINATE_BYTES]),
        y: URL_SAFE_NO_PAD.encode(&point[1 + P256_COORDINATE_BYTES..]),
    })
}

// ---- 字段校验：任何字段都不能带换行或别的分隔符，防止拼出另一种原文 -------------------------

fn validate_ticket(ticket: &str) -> RuntimeResult<()> {
    // 后端票据是 18 字节随机数的 base64url（24 个字符）；这里放宽到 16–128。
    let ok = (16..=128).contains(&ticket.len()) && ticket.bytes().all(is_base64url_byte);
    if ok {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("pairing_ticket_invalid"))
    }
}

fn validate_device_id(device_id: &str) -> RuntimeResult<()> {
    let ok = device_id.len() == DEVICE_ID_PREFIX.len() + DEVICE_ID_HEX_LENGTH
        && device_id.starts_with(DEVICE_ID_PREFIX)
        && is_lower_hex(&device_id[DEVICE_ID_PREFIX.len()..], DEVICE_ID_HEX_LENGTH);
    if ok {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("device_id_invalid"))
    }
}

fn validate_approval_id(approval_id: &str) -> RuntimeResult<()> {
    if is_opaque(approval_id, 128) {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("approval_id_invalid"))
    }
}

/// shared/types 的 OPAQUE：首字符是字母或数字，其余是字母、数字、`.` `_` `:` `-`。
fn is_opaque(value: &str, max_len: usize) -> bool {
    let bytes = value.as_bytes();
    (1..=max_len).contains(&bytes.len())
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
}

fn validate_request_digest(request_digest: &str) -> RuntimeResult<()> {
    if is_lower_hex(request_digest, 64) {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("approval_request_digest_invalid"))
    }
}

/// `APPROVAL_LOCAL_CONFIRMATION_REF_PATTERN`：`l3c-` + 16–128 位小写十六进制。
fn validate_confirmation_ref(confirmation_ref: &str) -> RuntimeResult<()> {
    let ok = confirmation_ref
        .strip_prefix("l3c-")
        .map(|hex| (16..=128).contains(&hex.len()) && is_lower_hex(hex, hex.len()))
        .unwrap_or(false);
    if ok {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("local_confirmation_ref_invalid"))
    }
}

/// shared/types 的 OPAQUE（128 字以内）。
fn validate_request_id(request_id: &str) -> RuntimeResult<()> {
    if is_opaque(request_id, 128) {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("request_id_invalid"))
    }
}

/// `{ type: 'shell_session_binding', id: UUID, version ≥ 1 }`。
fn validate_binding_ref(binding: &ShellBindingRef) -> RuntimeResult<()> {
    if binding.kind == "shell_session_binding" && is_uuid(&binding.id) && binding.version >= 1 {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("binding_ref_invalid"))
    }
}

/// 界面文字：去掉首尾空白后不为空，最多 `max` 个字符，不含控制字符。
fn is_display_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max && !value.chars().any(|c| c.is_control())
}

/// RFC 3339 UTC，秒或毫秒：`2026-09-28T13:00:00Z` / `2026-09-28T13:00:00.123Z`。
/// 只接受这两种写法，签名原文里不会出现别的字符。
fn validate_signed_at(value: &str) -> RuntimeResult<()> {
    let shape_ok = matches!(value.len(), 20 | 24)
        && value.ends_with('Z')
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || matches!(b, b'-' | b':' | b'T' | b'.' | b'Z'));
    if shape_ok && chrono::DateTime::parse_from_rfc3339(value).is_ok() {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("signed_at_invalid"))
    }
}

/// shared/types 的 UUID：8-4-4-4-12，版本位 1–8，变体位 8/9/a/b（不分大小写）。
fn is_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (index, byte) in bytes.iter().enumerate() {
        let ok = match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            14 => (b'1'..=b'8').contains(byte),
            19 => matches!(byte.to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b'),
            _ => byte.is_ascii_hexdigit(),
        };
        if !ok {
            return false;
        }
    }
    true
}

fn is_lower_hex(value: &str, len: usize) -> bool {
    value.len() == len && value.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn is_base64url_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'-' || b == b'_'
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::crypto::MemorySecureStore;
    use ring::signature::{UnparsedPublicKey, ECDSA_P256_SHA256_FIXED};
    use std::sync::atomic::{AtomicBool, Ordering};

    const TICKET: &str = "AbCdEfGhIjKlMnOpQrStUvWx";
    const APPROVAL_ID: &str = "3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b";
    const DIGEST: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn verify(jwk: &PublicJwk, message: &str, signature: &str) -> bool {
        let (Ok(x), Ok(y), Ok(sig)) = (
            URL_SAFE_NO_PAD.decode(&jwk.x),
            URL_SAFE_NO_PAD.decode(&jwk.y),
            URL_SAFE_NO_PAD.decode(signature),
        ) else {
            return false;
        };
        let mut point = vec![0x04];
        point.extend(x);
        point.extend(y);
        UnparsedPublicKey::new(&ECDSA_P256_SHA256_FIXED, point)
            .verify(message.as_bytes(), &sig)
            .is_ok()
    }

    fn fresh() -> DeviceIdentity {
        DeviceIdentity::load_or_create(&MemorySecureStore::default()).unwrap()
    }

    // ── device safety events ──

    fn safety_event() -> Value {
        json!({
            "id": "es-1790000000000-1",
            "kind": "engaged",
            "at": "2026-09-29T08:00:00.000Z",
            "origin": "tray",
            "reason": "emergency_stop",
            "approvalsRejected": 2,
            "nativeGate": "confirmed",
            "runtime": "confirmed",
            "settledAfterMs": 420,
            "withinBudget": true
        })
    }

    #[test]
    fn safety_event_signature_covers_the_digest_of_the_validated_event() {
        let identity = fresh();
        let signed = identity.sign_device_safety_event("dsc_1", &safety_event(), "2026-09-29T08:00:01.000Z").unwrap();
        assert_eq!(signed.device_id, identity.device_id());
        assert!(signed.event_digest.starts_with("sha256:") && signed.event_digest.len() == 7 + 64);
        let message = [
            DEVICE_SAFETY_EVENT_SIGNATURE_DOMAIN_V1,
            identity.device_id(),
            "dsc_1",
            &signed.event_digest,
            "2026-09-29T08:00:01.000Z",
        ]
        .join("\n");
        assert!(verify(identity.public_jwk(), &message, &signed.signature));
        // Key order does not change the digest (JCS); any value does.
        let reordered: Value = serde_json::from_str(
            r#"{"withinBudget":true,"settledAfterMs":420,"runtime":"confirmed","nativeGate":"confirmed","approvalsRejected":2,"reason":"emergency_stop","origin":"tray","at":"2026-09-29T08:00:00.000Z","kind":"engaged","id":"es-1790000000000-1"}"#,
        )
        .unwrap();
        assert_eq!(device_safety_event_digest(&reordered).unwrap(), signed.event_digest);
        let mut other = safety_event();
        other["approvalsRejected"] = json!(3);
        assert_ne!(device_safety_event_digest(&other).unwrap(), signed.event_digest);
    }

    #[test]
    fn only_well_formed_safety_events_are_signed() {
        let identity = fresh();
        let cases: Vec<(&str, Value)> = vec![
            ("extra field", json!({ "command": "rm -rf /" })),
            ("id short", json!({ "id": "es-1-1" })),
            ("id path", json!({ "id": "../x" })),
            ("kind", json!({ "kind": "paused" })),
            ("at without ms", json!({ "at": "2026-09-29T08:00:00Z" })),
            ("at with offset", json!({ "at": "2026-09-29T16:00:00.000+08:00" })),
            ("origin test", json!({ "origin": "test" })),
            ("reason multi-line", json!({ "reason": "a\nb" })),
            ("reason too long", json!({ "reason": "字".repeat(81) })),
            ("reason blank", json!({ "reason": "   " })),
            ("approvals negative", json!({ "approvalsRejected": -1 })),
            ("gate pending", json!({ "nativeGate": "pending" })),
            ("settled too long", json!({ "settledAfterMs": 3_600_001 })),
            ("within budget but slow", json!({ "settledAfterMs": 3001 })),
            ("within budget not confirmed", json!({ "nativeGate": "not_confirmed" })),
        ];
        for (label, patch) in cases {
            let mut event = safety_event();
            for (key, value) in patch.as_object().unwrap() {
                event[key] = value.clone();
            }
            let error = identity.sign_device_safety_event("dsc_1", &event, "2026-09-29T08:00:01.000Z").unwrap_err();
            assert_eq!(error.code(), "safety_event_invalid", "{label}");
        }
        let mut released = safety_event();
        released["kind"] = json!("released");
        assert!(identity.sign_device_safety_event("dsc_1", &released, "2026-09-29T08:00:01.000Z").is_err(), "runtime only when engaged");
        released.as_object_mut().unwrap().remove("runtime");
        released.as_object_mut().unwrap().remove("approvalsRejected");
        assert!(identity.sign_device_safety_event("dsc_1", &released, "2026-09-29T08:00:01.000Z").is_ok());
        assert!(identity.sign_device_safety_event("dsc 1", &safety_event(), "2026-09-29T08:00:01.000Z").is_err());
        assert!(identity.sign_device_safety_event("dsc_1", &safety_event(), "yesterday").is_err());
        assert!(identity.sign_device_safety_event("dsc_1", &json!([]), "2026-09-29T08:00:01.000Z").is_err());
    }

    fn request() -> ApprovalConfirmationRequest {
        ApprovalConfirmationRequest {
            approval_id: APPROVAL_ID.into(),
            request_digest: DIGEST.into(),
            title: "Run `git push` in ~/code/agentrix".into(),
            risk_level: "L2".into(),
        }
    }

    fn keys(value: &serde_json::Value) -> Vec<String> {
        let mut keys: Vec<String> = value.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        keys
    }

    #[test]
    fn generated_identity_is_self_certifying() {
        let identity = fresh();
        let jwk = identity.public_jwk();
        assert_eq!((jwk.kty.as_str(), jwk.crv.as_str()), ("EC", "P-256"));
        assert_eq!((jwk.x.len(), jwk.y.len()), (43, 43));
        assert_eq!(identity.thumbprint_hex(), jwk_thumbprint_hex(jwk).unwrap());
        assert_eq!(
            identity.device_id(),
            derive_device_id(identity.thumbprint_hex()).unwrap()
        );
        validate_device_id(identity.device_id()).unwrap();
    }

    #[test]
    fn key_is_kept_in_secure_store_and_reloads_to_the_same_device() {
        let store = MemorySecureStore::default();
        let first = DeviceIdentity::load_or_create(&store).unwrap();
        let second = DeviceIdentity::load_or_create(&store).unwrap();
        assert_eq!(first.device_id(), second.device_id());
        let raw = store
            .get(KEYRING_SERVICE, KEYRING_DEVICE_IDENTITY_KEY)
            .unwrap()
            .unwrap();
        assert_eq!(
            DeviceIdentity::from_pkcs8(&raw).unwrap().device_id(),
            first.device_id()
        );
        let debug = format!("{first:?}");
        assert!(debug.contains(first.device_id()));
        assert!(!debug.contains(&hex::encode(&raw)));
    }

    #[test]
    fn corrupt_keychain_entry_fails_closed_and_is_not_overwritten() {
        let store = MemorySecureStore::default();
        store
            .set(KEYRING_SERVICE, KEYRING_DEVICE_IDENTITY_KEY, b"not a key")
            .unwrap();
        let error = DeviceIdentity::load_or_create(&store).unwrap_err();
        assert_eq!(error.code(), "device_identity_key_invalid");
        assert_eq!(
            store
                .get(KEYRING_SERVICE, KEYRING_DEVICE_IDENTITY_KEY)
                .unwrap()
                .unwrap(),
            b"not a key".to_vec()
        );
    }

    #[test]
    fn pairing_proof_signs_exactly_the_contract_message() {
        let identity = fresh();
        let proof = identity.pairing_proof(TICKET).unwrap();
        assert_eq!(proof.schema_version, 1);
        assert_eq!(proof.algorithm, "ecdsa-p256-sha256");
        assert_eq!(&proof.public_jwk, identity.public_jwk());
        assert_eq!(proof.signature.len(), 86);
        let message = format!("agentrix.device.pair.v1\n{TICKET}\n{}", identity.device_id());
        assert!(verify(&proof.public_jwk, &message, &proof.signature));
        let other = format!(
            "agentrix.device.pair.v1\nZZZZZZZZZZZZZZZZZZZZZZZZ\n{}",
            identity.device_id()
        );
        assert!(!verify(&proof.public_jwk, &other, &proof.signature));
        let json = serde_json::to_value(&proof).unwrap();
        assert_eq!(keys(&json), ["algorithm", "publicJwk", "schemaVersion", "signature"]);
        assert_eq!(keys(&json["publicJwk"]), ["crv", "kty", "x", "y"]);
    }

    #[test]
    fn message_fields_cannot_smuggle_separators_or_other_formats() {
        let device = "dev_0123456789abcdef0123456789abcdef";
        assert_eq!(
            device_pairing_proof_message(TICKET, device).unwrap(),
            format!("agentrix.device.pair.v1\n{TICKET}\n{device}")
        );
        for ticket in ["short", "AbCdEfGhIjKlMnOp\nQrStUvWx", "AbCdEfGhIjKlMnOpQrStUvW=", ""] {
            assert_eq!(
                device_pairing_proof_message(ticket, device).unwrap_err().code(),
                "pairing_ticket_invalid"
            );
        }
        for bad_device in ["dev_0123456789ABCDEF0123456789abcdef", "dev_0123", "xyz_0123456789abcdef0123456789abcdef"] {
            assert_eq!(
                device_pairing_proof_message(TICKET, bad_device).unwrap_err().code(),
                "device_id_invalid"
            );
        }
        let reference = "l3c-0123456789abcdef";
        assert_eq!(
            approval_local_confirmation_message(APPROVAL_ID, DIGEST, "approved", reference).unwrap(),
            format!("agentrix.desktop.approval.local.v1\n{APPROVAL_ID}\n{DIGEST}\napproved\n{reference}")
        );
        let too_long = "a".repeat(129);
        for id in ["", "a\nb", "-leading", "has space", too_long.as_str()] {
            assert_eq!(
                approval_local_confirmation_message(id, DIGEST, "approved", reference)
                    .unwrap_err()
                    .code(),
                "approval_id_invalid"
            );
        }
        let upper = DIGEST.to_uppercase();
        let with_newline = format!("{DIGEST}\n");
        for digest in [upper.as_str(), &DIGEST[..63], with_newline.as_str()] {
            assert_eq!(
                approval_local_confirmation_message(APPROVAL_ID, digest, "approved", reference)
                    .unwrap_err()
                    .code(),
                "approval_request_digest_invalid"
            );
        }
        assert_eq!(
            approval_local_confirmation_message(APPROVAL_ID, DIGEST, "approve", reference)
                .unwrap_err()
                .code(),
            "approval_decision_invalid"
        );
        for bad_ref in ["l3c-0123456789abcde", "l3c-0123456789ABCDEF", "x3c-0123456789abcdef", "l3c-0123456789abcdef\n"] {
            assert_eq!(
                approval_local_confirmation_message(APPROVAL_ID, DIGEST, "approved", bad_ref)
                    .unwrap_err()
                    .code(),
                "local_confirmation_ref_invalid"
            );
        }
    }

    #[test]
    fn approval_is_signed_only_after_the_user_confirms() {
        let identity = fresh();
        assert_eq!(
            confirm_with(&identity, &request(), &|_| false).unwrap_err().code(),
            "local_confirmation_rejected"
        );
        let confirmation = confirm_with(&identity, &request(), &|_| true).unwrap();
        validate_confirmation_ref(&confirmation.confirmation_ref).unwrap();
        let approved = approval_local_confirmation_message(
            APPROVAL_ID,
            DIGEST,
            "approved",
            &confirmation.confirmation_ref,
        )
        .unwrap();
        assert!(verify(identity.public_jwk(), &approved, &confirmation.signature));
        // 签名只对这一条审批的"批准"有效。
        let rejected = approved.replace("\napproved\n", "\nrejected\n");
        assert!(!verify(identity.public_jwk(), &rejected, &confirmation.signature));
        let other = approved.replace(APPROVAL_ID, "another-approval");
        assert!(!verify(identity.public_jwk(), &other, &confirmation.signature));
        // ref 每次都新生成。
        let again = confirm_with(&identity, &request(), &|_| true).unwrap();
        assert_ne!(again.confirmation_ref, confirmation.confirmation_ref);
        let json = serde_json::to_value(&confirmation).unwrap();
        assert_eq!(keys(&json), ["ref", "signature"]);
    }

    #[test]
    fn register_proof_is_bound_to_this_device_and_key() {
        let identity = fresh();
        let proof = identity.signing_credential_register_proof("req-1").unwrap();
        assert_eq!(proof.signature.len(), 86);
        let message = format!(
            "agentrix.device.signing-credential.register.v1\n{}\nreq-1\n{}",
            identity.device_id(),
            identity.thumbprint_hex()
        );
        assert!(verify(identity.public_jwk(), &message, &proof.signature));
        assert!(!verify(
            identity.public_jwk(),
            &message.replace("\nreq-1\n", "\nreq-2\n"),
            &proof.signature
        ));
        assert_eq!(keys(&serde_json::to_value(&proof).unwrap()), ["signature"]);
        for bad in ["", "-req", "req\n1", "req 1"] {
            assert_eq!(
                identity
                    .signing_credential_register_proof(bad)
                    .unwrap_err()
                    .code(),
                "request_id_invalid"
            );
        }
        assert_eq!(
            signing_credential_register_proof_message(identity.device_id(), "req-1", "ABC")
                .unwrap_err()
                .code(),
            "device_identity_thumbprint_invalid"
        );
    }

    const AGENT: &str = "7d7c1f0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f";
    const PREVIOUS_BINDING: &str = "0f1e2d3c-4b5a-4968-8776-655443322110";

    fn binding_request<'a>(runtime_id: &'a str) -> DesktopBindingRequest<'a> {
        DesktopBindingRequest {
            request_id: "desktop-binding-1",
            agent_account_id: AGENT,
            runtime_id,
            signer_ref: "dsc_0123456789abcdef",
            ttl_seconds: Some(3600),
            supersedes_binding_ref: None,
            signed_at: "2026-09-28T13:00:00.000Z",
        }
    }

    #[test]
    fn desktop_binding_command_is_signed_over_the_contract_message() {
        let identity = fresh();
        let runtime_id = mint_runtime_id();
        let command = identity.desktop_binding_command(&binding_request(&runtime_id)).unwrap();
        let message = format!(
            "agentrix.desktop.binding.v1\n{}\ndesktop-binding-1\n{runtime_id}\ndsc_0123456789abcdef\n2026-09-28T13:00:00.000Z",
            identity.device_id()
        );
        assert!(verify(identity.public_jwk(), &message, &command.signature));
        assert!(!verify(
            identity.public_jwk(),
            &message.replace("desktop-binding-1", "desktop-binding-2"),
            &command.signature
        ));
        let json = serde_json::to_value(&command).unwrap();
        assert_eq!(
            keys(&json),
            ["agentAccountId", "requestId", "runtimeId", "schemaVersion", "signature", "signedAt", "signerRef", "ttlSeconds"]
        );
        // Renewal carries the predecessor.
        let mut renewal = binding_request(&runtime_id);
        renewal.ttl_seconds = None;
        renewal.supersedes_binding_ref = Some(ShellBindingRef {
            kind: "shell_session_binding".into(),
            id: PREVIOUS_BINDING.into(),
            version: 1,
        });
        let json = serde_json::to_value(identity.desktop_binding_command(&renewal).unwrap()).unwrap();
        assert_eq!(json["supersedesBindingRef"], json!({ "type": "shell_session_binding", "id": PREVIOUS_BINDING, "version": 1 }));
        assert!(json.get("ttlSeconds").is_none());
    }

    #[test]
    fn desktop_binding_command_rejects_malformed_fields_before_signing() {
        let identity = fresh();
        let runtime_id = mint_runtime_id();
        let cases: Vec<(Box<dyn Fn(&mut DesktopBindingRequest<'_>)>, &str)> = vec![
            (Box::new(|r| r.request_id = "a\nb"), "request_id_invalid"),
            (Box::new(|r| r.runtime_id = "drt_ABC"), "runtime_id_invalid"),
            (Box::new(|r| r.runtime_id = "dev_0123456789abcdef0123456789abcdef"), "runtime_id_invalid"),
            (Box::new(|r| r.signer_ref = "dsc 1"), "signer_ref_invalid"),
            (Box::new(|r| r.signed_at = "2026-09-28 13:00:00"), "signed_at_invalid"),
            (Box::new(|r| r.signed_at = "2026-09-28T13:00:00+08:00"), "signed_at_invalid"),
            (Box::new(|r| r.signed_at = "2026-02-30T13:00:00Z"), "signed_at_invalid"),
            (Box::new(|r| r.agent_account_id = "not-a-uuid"), "agent_account_id_invalid"),
            (Box::new(|r| r.ttl_seconds = Some(59)), "binding_ttl_invalid"),
            (Box::new(|r| r.ttl_seconds = Some(86_401)), "binding_ttl_invalid"),
            (
                Box::new(|r| {
                    r.supersedes_binding_ref = Some(ShellBindingRef { kind: "wallet".into(), id: PREVIOUS_BINDING.into(), version: 1 })
                }),
                "supersedes_binding_ref_invalid",
            ),
            (
                Box::new(|r| {
                    r.supersedes_binding_ref =
                        Some(ShellBindingRef { kind: "shell_session_binding".into(), id: PREVIOUS_BINDING.into(), version: 0 })
                }),
                "supersedes_binding_ref_invalid",
            ),
        ];
        for (mutate, code) in cases {
            let mut request = binding_request(&runtime_id);
            mutate(&mut request);
            assert_eq!(identity.desktop_binding_command(&request).unwrap_err().code(), code);
        }
    }

    fn binding_ref() -> ShellBindingRef {
        ShellBindingRef { kind: "shell_session_binding".into(), id: PREVIOUS_BINDING.into(), version: 2 }
    }

    fn workspace(value: char, trust: &str, trusted_at: Option<&str>) -> PresenceWorkspace {
        PresenceWorkspace {
            path_digest: PresenceDigest {
                algorithm: "sha-256".into(),
                canonicalization: "jcs/1".into(),
                value: value.to_string().repeat(64),
            },
            display_name: "agentrix".into(),
            trust: trust.into(),
            trust_source: "owner_folder_pick".into(),
            trusted_at: trusted_at.map(str::to_string),
        }
    }

    fn machine() -> PresenceMachine {
        PresenceMachine { label: "Zhou's MacBook Pro".into(), os: "macos".into() }
    }

    #[test]
    fn runtime_credential_commands_are_signed_over_the_contract_messages() {
        let identity = fresh();
        let runtime_id = mint_runtime_id();
        let issue = identity
            .runtime_credential_issue_command("issue-1", &runtime_id, "dsc_1", &binding_ref(), "2026-09-28T13:00:00Z")
            .unwrap();
        let issue_message = format!(
            "agentrix.developer-runtime.credential.issue.v1\n{}\nissue-1\n{runtime_id}\ndsc_1\n{PREVIOUS_BINDING}\n2\n2026-09-28T13:00:00Z",
            identity.device_id()
        );
        assert!(verify(identity.public_jwk(), &issue_message, &issue.signature));
        assert_eq!(
            keys(&serde_json::to_value(&issue).unwrap()),
            ["bindingRef", "requestId", "runtimeId", "schemaVersion", "signature", "signedAt", "signerRef"]
        );
        let credential_ref = format!("drc_{}", "a".repeat(32));
        let refresh = identity
            .runtime_credential_refresh_command(&credential_ref, "refresh-1", &binding_ref(), "2026-09-28T13:20:00Z")
            .unwrap();
        let refresh_message = format!(
            "agentrix.developer-runtime.credential.refresh.v1\n{}\n{credential_ref}\nrefresh-1\n{PREVIOUS_BINDING}\n2\n2026-09-28T13:20:00Z",
            identity.device_id()
        );
        assert!(verify(identity.public_jwk(), &refresh_message, &refresh.signature));
        assert!(!verify(identity.public_jwk(), &issue_message, &refresh.signature));
        assert_eq!(
            keys(&serde_json::to_value(&refresh).unwrap()),
            ["bindingRef", "requestId", "schemaVersion", "signature", "signedAt"]
        );
        // Malformed inputs never reach the key.
        let bad_binding = ShellBindingRef { kind: "shell_session_binding".into(), id: "x".into(), version: 1 };
        assert_eq!(
            identity
                .runtime_credential_issue_command("issue-1", &runtime_id, "dsc_1", &bad_binding, "2026-09-28T13:00:00Z")
                .unwrap_err()
                .code(),
            "binding_ref_invalid"
        );
        assert_eq!(
            identity
                .runtime_credential_refresh_command("drc_short", "refresh-1", &binding_ref(), "2026-09-28T13:20:00Z")
                .unwrap_err()
                .code(),
            "runtime_credential_ref_invalid"
        );
    }

    #[test]
    fn presence_signs_the_digest_of_everything_it_sends() {
        let identity = fresh();
        let runtime_id = mint_runtime_id();
        let presence = identity
            .runtime_presence(
                "presence-1",
                &runtime_id,
                machine(),
                vec![workspace('a', "trusted", Some("2026-09-28T12:59:00Z")), workspace('b', "untrusted", None)],
                "2026-09-28T13:00:00Z",
            )
            .unwrap();
        assert_eq!(presence.device_ref, identity.device_id());
        let digest = runtime_presence_digest(&presence).unwrap();
        let message = format!("agentrix.developer-runtime.presence.v1\npresence-1\n{digest}\n2026-09-28T13:00:00Z");
        assert!(verify(identity.public_jwk(), &message, &presence.signature));
        // Changing any signed field changes the digest (the server would reject the signature).
        let mut tampered = presence.clone();
        tampered.workspaces[1].trust = "trusted".into();
        assert_ne!(runtime_presence_digest(&tampered).unwrap(), digest);
        let json = serde_json::to_value(&presence).unwrap();
        assert_eq!(
            keys(&json),
            ["deviceRef", "machine", "requestId", "runtimeId", "schemaVersion", "signature", "signedAt", "workspaces"]
        );
        assert!(json["workspaces"][1].get("trustedAt").is_none());
    }

    #[test]
    fn presence_rejects_malformed_fields_before_signing() {
        let identity = fresh();
        let runtime_id = mint_runtime_id();
        let at = "2026-09-28T13:00:00Z";
        let run = |machine: PresenceMachine, workspaces: Vec<PresenceWorkspace>| {
            identity.runtime_presence("presence-1", &runtime_id, machine, workspaces, at).unwrap_err().code().to_string()
        };
        assert_eq!(run(PresenceMachine { label: " ".into(), os: "macos".into() }, vec![]), "presence_machine_label_invalid");
        assert_eq!(run(PresenceMachine { label: "a\nb".into(), os: "macos".into() }, vec![]), "presence_machine_label_invalid");
        assert_eq!(run(PresenceMachine { label: "x".repeat(65), os: "macos".into() }, vec![]), "presence_machine_label_invalid");
        assert_eq!(run(PresenceMachine { label: "m".into(), os: "ios".into() }, vec![]), "presence_machine_os_invalid");
        assert_eq!(run(machine(), (0..21).map(|_| workspace('a', "trusted", None)).collect()), "presence_too_many_workspaces");
        assert_eq!(run(machine(), vec![workspace('a', "trusted", None), workspace('a', "untrusted", None)]), "presence_path_digest_duplicate");
        let mut upper = workspace('A', "trusted", None);
        assert_eq!(run(machine(), vec![upper.clone()]), "presence_path_digest_invalid");
        upper.path_digest.value = "a".repeat(64);
        upper.path_digest.canonicalization = "none".into();
        assert_eq!(run(machine(), vec![upper]), "presence_path_digest_invalid");
        assert_eq!(run(machine(), vec![workspace('a', "maybe", None)]), "presence_trust_invalid");
        let mut source = workspace('a', "trusted", None);
        source.trust_source = "remote".into();
        assert_eq!(run(machine(), vec![source]), "presence_trust_source_invalid");
        assert_eq!(run(machine(), vec![workspace('a', "trusted", Some("2026-09-28T13:00:01Z"))]), "presence_trusted_at_invalid");
        assert_eq!(run(machine(), vec![workspace('a', "untrusted", Some("2026-09-28T12:00:00Z"))]), "presence_trusted_at_invalid");
        let mut name = workspace('a', "trusted", None);
        name.display_name = "\u{7}".into();
        assert_eq!(run(machine(), vec![name]), "presence_display_name_invalid");
        assert_eq!(
            identity.runtime_presence("presence-1", "drt_x", machine(), vec![], at).unwrap_err().code(),
            "runtime_id_invalid"
        );
    }

    #[test]
    fn runtime_id_is_kept_in_secure_store_and_never_overwritten() {
        let store = MemorySecureStore::default();
        let first = load_or_create_runtime_id(&store).unwrap();
        assert!(is_runtime_id(&first));
        assert_eq!(load_or_create_runtime_id(&store).unwrap(), first);
        assert_ne!(mint_runtime_id(), mint_runtime_id());
        let corrupt = MemorySecureStore::default();
        corrupt.set_text(KEYRING_SERVICE, KEYRING_RUNTIME_ID_KEY, "drt_nothex").unwrap();
        assert_eq!(load_or_create_runtime_id(&corrupt).unwrap_err().code(), "runtime_id_corrupt");
        assert_eq!(corrupt.get_text(KEYRING_SERVICE, KEYRING_RUNTIME_ID_KEY).unwrap().unwrap(), "drt_nothex");
    }

    static PRESENTED: AtomicBool = AtomicBool::new(false);

    fn presenter_that_records(_: &ApprovalDialogText) -> bool {
        PRESENTED.store(true, Ordering::SeqCst);
        true
    }

    #[test]
    fn malformed_request_never_reaches_the_dialog() {
        let identity = fresh();
        let mut bad_digest = request();
        bad_digest.request_digest = "not-a-digest".into();
        assert_eq!(
            confirm_with(&identity, &bad_digest, &presenter_that_records)
                .unwrap_err()
                .code(),
            "approval_request_digest_invalid"
        );
        let mut bad_id = request();
        bad_id.approval_id = "x\nagentrix.device.pair.v1".into();
        assert_eq!(
            confirm_with(&identity, &bad_id, &presenter_that_records)
                .unwrap_err()
                .code(),
            "approval_id_invalid"
        );
        assert!(!PRESENTED.load(Ordering::SeqCst));
    }

    #[test]
    fn dialog_text_is_built_in_rust() {
        let mut unusual = request();
        unusual.title = "Run\u{7} `rm -rf ~`\nnow ".repeat(20);
        unusual.risk_level = "L9".into();
        let text = approval_dialog_text(&unusual);
        assert!(text.high_risk);
        assert_eq!(text.title, "Agentrix · L3 approval");
        let first_line = text.description.lines().next().unwrap();
        assert!(first_line.chars().count() <= MAX_TITLE_CHARS);
        assert!(!first_line.chars().any(|c| c.is_control()));
        assert!(text.description.contains("Risk: L3"));
        assert!(text.description.contains("Request: 01234567…"));
        let normal = approval_dialog_text(&request());
        assert!(!normal.high_risk);
        assert!(normal.description.starts_with("Run `git push` in ~/code/agentrix\n"));
    }

    /// 对拍向量：由 `print_cross_language_vector` 生成（临时密钥，只留公钥和签名）。
    /// 桌面 vitest `src/test/deviceIdentityVector.contract.test.ts` 用 shared/types 的函数和
    /// Node 的 `ieee-p1363` 验签（和后端同一种写法）核对同一组数据。
    const VECTOR_REGISTER_REQUEST_ID: &str = "desktop-register-1";
    const VECTOR_RUNTIME_ID: &str = "drt_00112233445566778899aabbccddeeff";
    const VECTOR_CREDENTIAL_REF: &str = "drc_ffeeddccbbaa99887766554433221100";
    const VECTOR_X: &str = "QEBbpLeGsBFvcud1dLB_p-QzJ3vlt3cI9jcFVcoU-bA";
    const VECTOR_Y: &str = "gerHilylOWKbTdGp2GD7TlD74Z6nxw3DGHSPWZLMr9k";
    const VECTOR_THUMBPRINT: &str =
        "7482d5e8266683087bc822c098a68c343ba4f0f0ffa1643d0d48a1790977d1ee";
    const VECTOR_DEVICE_ID: &str = "dev_7482d5e8266683087bc822c098a68c34";
    const VECTOR_PAIR_SIGNATURE: &str =
        "rmOwXDjI9y0Iza1rZJxyMXZGDJ9XnWpZ6ckadzx3oGkoBC-_sxNdHWBd0x-Sq1tt3w8ovYC5v9-52iMn2vx6JQ";
    const VECTOR_REGISTER_SIGNATURE: &str =
        "KDnQMiDA-V2UkGNJ_TM6npbqgdCDb6DWqoGnScKteiW_TJfbM7ndHfhub6rtVfUca3lRjoL-EIw_wNxqOTKPKQ";
    const VECTOR_CONFIRMATION_REF: &str = "l3c-1d487b4cbcb71dc704e69e63";
    const VECTOR_APPROVAL_SIGNATURE: &str =
        "eA3tUBUhU_SgubsMt46TO8m5jAUUErwddm62mur3lw4B1vhae6D8TIs-hMe6EXN2bhNlAWw00AzwzQJxyf3l7A";

    const VECTOR_BINDING_SIGNATURE: &str =
        "IiHj4NcYyokrP15G2U7zZX45Rm_EBSkzYBRj2LjhlHYNqxkgJqitKX1ZLadhpYEjNoBwG5ag4A_YADs7irrrAA";

    const VECTOR_ISSUE_SIGNATURE: &str =
        "AAL0ylVv-CFWJm2r5_pA9lcWrZbgQ1XyQiBd8rbzZYT76cHPz-swWyhnzr-MynjVBPYFAX8DI24z5sF51hpB5A";
    const VECTOR_REFRESH_SIGNATURE: &str =
        "rSCvR1D072kuPL2oS2lftq0y1WRRESfmiNIIdHfbKw50s8BytDvn1is6-Z_WeE2F7FWlYeZtanxuzgSi1-C01g";

    #[test]
    fn cross_language_vector_matches_shared_types() {
        let jwk = PublicJwk {
            kty: "EC".into(),
            crv: "P-256".into(),
            x: VECTOR_X.into(),
            y: VECTOR_Y.into(),
        };
        assert_eq!(jwk_thumbprint_hex(&jwk).unwrap(), VECTOR_THUMBPRINT);
        assert_eq!(derive_device_id(VECTOR_THUMBPRINT).unwrap(), VECTOR_DEVICE_ID);
        let pair_message = device_pairing_proof_message(TICKET, VECTOR_DEVICE_ID).unwrap();
        assert_eq!(
            pair_message,
            "agentrix.device.pair.v1\nAbCdEfGhIjKlMnOpQrStUvWx\ndev_7482d5e8266683087bc822c098a68c34"
        );
        assert!(verify(&jwk, &pair_message, VECTOR_PAIR_SIGNATURE));
        let register_message = signing_credential_register_proof_message(
            VECTOR_DEVICE_ID,
            VECTOR_REGISTER_REQUEST_ID,
            VECTOR_THUMBPRINT,
        )
        .unwrap();
        assert_eq!(
            register_message,
            "agentrix.device.signing-credential.register.v1\ndev_7482d5e8266683087bc822c098a68c34\ndesktop-register-1\n7482d5e8266683087bc822c098a68c343ba4f0f0ffa1643d0d48a1790977d1ee"
        );
        assert!(verify(&jwk, &register_message, VECTOR_REGISTER_SIGNATURE));
        let approval_message = approval_local_confirmation_message(
            APPROVAL_ID,
            DIGEST,
            "approved",
            VECTOR_CONFIRMATION_REF,
        )
        .unwrap();
        assert_eq!(
            approval_message,
            "agentrix.desktop.approval.local.v1\n3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b\n0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\napproved\nl3c-1d487b4cbcb71dc704e69e63"
        );
        assert!(verify(&jwk, &approval_message, VECTOR_APPROVAL_SIGNATURE));
        assert!(!verify(&jwk, &pair_message, VECTOR_APPROVAL_SIGNATURE));
        assert!(!verify(&jwk, &approval_message, VECTOR_REGISTER_SIGNATURE));
        let binding_message = desktop_device_binding_message(
            VECTOR_DEVICE_ID,
            "desktop-binding-1",
            VECTOR_RUNTIME_ID,
            "dsc_0123456789abcdef",
            "2026-09-28T13:00:00.000Z",
        )
        .unwrap();
        assert_eq!(
            binding_message,
            format!("agentrix.desktop.binding.v1\n{VECTOR_DEVICE_ID}\ndesktop-binding-1\n{VECTOR_RUNTIME_ID}\ndsc_0123456789abcdef\n2026-09-28T13:00:00.000Z")
        );
        assert!(verify(&jwk, &binding_message, VECTOR_BINDING_SIGNATURE));
        assert!(!verify(&jwk, &register_message, VECTOR_BINDING_SIGNATURE));
        let issue_message = runtime_credential_issue_message(
            VECTOR_DEVICE_ID,
            "issue-1",
            VECTOR_RUNTIME_ID,
            "dsc_0123456789abcdef",
            &binding_ref(),
            "2026-09-28T13:00:01.000Z",
        )
        .unwrap();
        assert!(verify(&jwk, &issue_message, VECTOR_ISSUE_SIGNATURE));
        let refresh_message = runtime_credential_refresh_message(
            VECTOR_DEVICE_ID,
            VECTOR_CREDENTIAL_REF,
            "refresh-1",
            &binding_ref(),
            "2026-09-28T13:20:00.000Z",
        )
        .unwrap();
        assert!(verify(&jwk, &refresh_message, VECTOR_REFRESH_SIGNATURE));
        assert!(!verify(&jwk, &issue_message, VECTOR_REFRESH_SIGNATURE));
    }

    /// 重新生成对拍向量：`cargo test --lib device_identity::tests::print_cross_language_vector -- --ignored --nocapture`。
    /// Same data as `desktop/src/test/safetyEventReport.test.ts` (made by `print_safety_event_vector`).
    const SAFETY_VECTOR_X: &str = "IKkj4VISgzsHuLaqL3qA9lqcFy4DSZfVgOfQpfQVc60";
    const SAFETY_VECTOR_Y: &str = "f8P1gaKKe5CfL_5wmM2HWgl9ogLeyM9U6n6Lycw_3Gs";
    const SAFETY_VECTOR_DEVICE_ID: &str = "dev_9ac91377c17e4422d9c11b5b83a71e64";
    const SAFETY_VECTOR_DIGEST: &str = "sha256:58a7f0d1eab1f1b536deed77e05b9374593fb4f669fcaa437bb21e9f9a2ce637";
    const SAFETY_VECTOR_SIGNATURE: &str =
        "lUxErfoXcGtIeIllVywozlTtoMS8nI2ndsnWCh6cSQ1OPFPBNaGhLKGatQskKc_sspnV3zb7CDmgff4J1gXoYg";

    #[test]
    fn safety_event_vector_matches_shared_types() {
        let jwk = PublicJwk { kty: "EC".into(), crv: "P-256".into(), x: SAFETY_VECTOR_X.into(), y: SAFETY_VECTOR_Y.into() };
        assert_eq!(derive_device_id(&jwk_thumbprint_hex(&jwk).unwrap()).unwrap(), SAFETY_VECTOR_DEVICE_ID);
        assert_eq!(device_safety_event_digest(&safety_event()).unwrap(), SAFETY_VECTOR_DIGEST);
        let message = device_safety_event_message(
            SAFETY_VECTOR_DEVICE_ID,
            "dsc_0123456789abcdef",
            SAFETY_VECTOR_DIGEST,
            "2026-09-29T08:00:01.000Z",
        )
        .unwrap();
        assert!(verify(&jwk, &message, SAFETY_VECTOR_SIGNATURE));
        assert!(!verify(&jwk, &message.replace("dsc_0123456789abcdef", "dsc_other"), SAFETY_VECTOR_SIGNATURE));
    }

    /// 急停回执的对拍向量（REQ-backend-047）：临时密钥，只输出公钥、摘要和签名。
    #[test]
    #[ignore]
    fn print_safety_event_vector() {
        let identity = fresh();
        let signed = identity
            .sign_device_safety_event("dsc_0123456789abcdef", &safety_event(), "2026-09-29T08:00:01.000Z")
            .unwrap();
        println!(
            "SAFETY_VECTOR {}",
            json!({
                "x": identity.public_jwk().x,
                "y": identity.public_jwk().y,
                "deviceId": signed.device_id,
                "eventDigest": signed.event_digest,
                "signature": signed.signature,
            })
        );
    }

    /// 只输出公钥和签名；私钥是临时生成的，测试结束就丢弃。
    #[test]
    #[ignore]
    fn print_cross_language_vector() {
        let identity = fresh();
        let proof = identity.pairing_proof(TICKET).unwrap();
        let confirmation = confirm_with(&identity, &request(), &|_| true).unwrap();
        let register = identity
            .signing_credential_register_proof(VECTOR_REGISTER_REQUEST_ID)
            .unwrap();
        let binding = identity
            .desktop_binding_command(&binding_request(VECTOR_RUNTIME_ID))
            .unwrap();
        let issue = identity
            .runtime_credential_issue_command("issue-1", VECTOR_RUNTIME_ID, "dsc_0123456789abcdef", &binding_ref(), "2026-09-28T13:00:01.000Z")
            .unwrap();
        let refresh = identity
            .runtime_credential_refresh_command(VECTOR_CREDENTIAL_REF, "refresh-1", &binding_ref(), "2026-09-28T13:20:00.000Z")
            .unwrap();
        let presence = identity
            .runtime_presence(
                "presence-1",
                VECTOR_RUNTIME_ID,
                machine(),
                vec![workspace('a', "trusted", Some("2026-09-28T12:59:00.000Z")), workspace('b', "untrusted", None)],
                "2026-09-28T13:00:02.000Z",
            )
            .unwrap();
        let vector = json!({
            "issueCommand": issue,
            "refreshCommand": refresh,
            "credentialRef": VECTOR_CREDENTIAL_REF,
            "presence": presence,
            "presenceDigest": runtime_presence_digest(&presence).unwrap(),
            "bindingCommand": binding,
            "bindingMessage": desktop_device_binding_message(identity.device_id(), binding.request_id.as_str(), VECTOR_RUNTIME_ID, binding.signer_ref.as_str(), binding.signed_at.as_str()).unwrap(),
            "registerRequestId": VECTOR_REGISTER_REQUEST_ID,
            "registerMessage": signing_credential_register_proof_message(identity.device_id(), VECTOR_REGISTER_REQUEST_ID, identity.thumbprint_hex()).unwrap(),
            "registerSignature": register.signature,
            "publicJwk": identity.public_jwk(),
            "thumbprintHex": identity.thumbprint_hex(),
            "deviceId": identity.device_id(),
            "ticket": TICKET,
            "pairMessage": device_pairing_proof_message(TICKET, identity.device_id()).unwrap(),
            "pairSignature": proof.signature,
            "approvalId": APPROVAL_ID,
            "requestDigest": DIGEST,
            "confirmationRef": confirmation.confirmation_ref,
            "approvalMessage": approval_local_confirmation_message(APPROVAL_ID, DIGEST, "approved", &confirmation.confirmation_ref).unwrap(),
            "approvalSignature": confirmation.signature,
        });
        println!("VECTOR {}", serde_json::to_string(&vector).unwrap());
    }
}
