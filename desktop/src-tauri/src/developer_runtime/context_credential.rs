//! A6 / D4 — the "shared memory" credential (audience `context_gateway`) on this computer.
//!
//! The owner, in "我的 AI 们", gives one client (Cursor, Claude Code, Kiro) a short-lived credential. This
//! module only does the parts that must stay in Rust:
//!
//! - sign the issue / refresh messages with the device key (`shared/types/context-memory.ts`, nine and
//!   seven lines); the key never leaves Rust, the WebView sends the HTTP request with the owner's sign-in;
//! - keep the issued credential in the OS keychain, one entry per client, where the `--agentrix-mcp` process
//!   (`mcp_stdio.rs`) reads it. The WebView never gets the token back: `status` has no token field.
//!
//! The credential's categories are fixed when it is issued. Turning `agent_memory` on or off means issuing a
//! new one (the server revokes the old one for the same device and client). The emergency stop refuses to
//! sign or store anything; revoking (a stop-type action) is never blocked.

use crate::developer_runtime::crypto::SecureStore;
pub use crate::developer_runtime::device_identity::ShellBindingRef;
use crate::developer_runtime::device_identity::{
    is_context_gateway_category_set, is_context_gateway_credential_ref, DeviceIdentity, CONTEXT_GATEWAY_CLIENT_IDS_V1,
};
use crate::developer_runtime::enrollment::EnrollmentState;
use crate::developer_runtime::types::KEYRING_SERVICE;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Keychain service of the issued credentials (not scoped by API target; the entry says which origin it is for).
pub const KEYRING_SERVICE_CONTEXT_GATEWAY: &str = "agentrix.context_gateway";
pub const CREDENTIAL_AUDIENCE: &str = "context_gateway";
const MAX_TOKEN_CHARS: usize = 4096;

pub fn keyring_account(client_id: &str) -> String {
    format!("credential_v1:{client_id}")
}

pub fn is_client_id(client_id: &str) -> bool {
    CONTEXT_GATEWAY_CLIENT_IDS_V1.contains(&client_id)
}

/// What the keychain holds. `token` is a bearer secret: never logged, never sent to the WebView.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredContextCredential {
    pub credential_ref: String,
    pub token: String,
    pub client_id: String,
    pub categories: Vec<String>,
    pub device_id: String,
    pub issued_at: String,
    pub expires_at: String,
    pub refresh_after: String,
    /// The API origin this credential was issued by (`https://…`, no path).
    pub api_origin: String,
    pub binding_ref: ShellBindingRef,
}

impl std::fmt::Debug for StoredContextCredential {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StoredContextCredential")
            .field("credential_ref", &self.credential_ref)
            .field("client_id", &self.client_id)
            .field("categories", &self.categories)
            .field("expires_at", &self.expires_at)
            .finish_non_exhaustive()
    }
}

fn parse_ms(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value).ok().map(|at| at.timestamp_millis())
}

impl StoredContextCredential {
    pub fn expired_at(&self, now_ms: i64) -> bool {
        parse_ms(&self.expires_at).map(|at| at <= now_ms).unwrap_or(true)
    }
}

/// Read one client's credential. `Ok(None)` = none issued; a damaged entry is an error (never "none").
pub fn load(store: &dyn SecureStore, client_id: &str) -> Result<Option<StoredContextCredential>, String> {
    if !is_client_id(client_id) {
        return Err("client_invalid".into());
    }
    let Some(text) = store
        .get_text(KEYRING_SERVICE_CONTEXT_GATEWAY, &keyring_account(client_id))
        .map_err(|_| "keychain_unavailable".to_string())?
    else {
        return Ok(None);
    };
    let credential: StoredContextCredential =
        serde_json::from_str(&text).map_err(|_| "credential_corrupt".to_string())?;
    // An entry under another client's name, or one that is not a D4 credential, is not trusted.
    if credential.client_id != client_id
        || !is_context_gateway_credential_ref(&credential.credential_ref)
        || !is_context_gateway_category_set(&credential.categories)
        || !is_known_api_origin(&credential.api_origin)
    {
        return Err("credential_corrupt".into());
    }
    Ok(Some(credential))
}

/// For the `--agentrix-mcp` process, which lives outside `developer_runtime` and so cannot name the keychain type.
pub fn load_from_os_keychain(client_id: &str) -> Result<Option<StoredContextCredential>, String> {
    load(&crate::developer_runtime::crypto::OsKeyringStore, client_id)
}

pub fn delete(store: &dyn SecureStore, client_id: &str) -> Result<(), String> {
    if !is_client_id(client_id) {
        return Err("client_invalid".into());
    }
    store
        .delete(KEYRING_SERVICE_CONTEXT_GATEWAY, &keyring_account(client_id))
        .map_err(|_| "keychain_unavailable".to_string())
}

/// The only two places a credential may point at (the same two the app itself talks to).
pub fn is_known_api_origin(value: &str) -> bool {
    value == crate::developer_runtime::types::PRODUCTION_API_ORIGIN
        || value == crate::developer_runtime::types::STAGING_API_ORIGIN
}

/// Check the server's answer (`ContextGatewayCredentialV1`) against what this computer asked for, then keep it.
/// Returns the status row (no token).
pub fn store_issued(
    store: &dyn SecureStore,
    identity: &DeviceIdentity,
    api_origin: &str,
    credential: &Value,
    now_ms: i64,
) -> Result<Value, String> {
    let text = |key: &str| credential.get(key).and_then(Value::as_str).map(str::to_string);
    let invalid = || "credential_invalid".to_string();
    if credential.get("schemaVersion") != Some(&json!(1))
        || credential.get("tokenType").and_then(Value::as_str) != Some("Bearer")
        || credential.get("audience").and_then(Value::as_str) != Some(CREDENTIAL_AUDIENCE)
    {
        return Err(invalid());
    }
    let credential_ref = text("credentialRef").ok_or_else(invalid)?;
    let token = text("token").ok_or_else(invalid)?;
    let client_id = text("clientId").ok_or_else(invalid)?;
    let device_id = text("deviceId").ok_or_else(invalid)?;
    let categories: Vec<String> = serde_json::from_value(credential.get("categories").cloned().unwrap_or(Value::Null))
        .map_err(|_| invalid())?;
    let binding_ref: ShellBindingRef =
        serde_json::from_value(credential.get("bindingRef").cloned().unwrap_or(Value::Null)).map_err(|_| invalid())?;
    let (issued_at, expires_at, refresh_after) = (
        text("issuedAt").ok_or_else(invalid)?,
        text("expiresAt").ok_or_else(invalid)?,
        text("refreshAfter").ok_or_else(invalid)?,
    );
    if !is_context_gateway_credential_ref(&credential_ref)
        || token.is_empty()
        || token.chars().count() > MAX_TOKEN_CHARS
        || token.chars().any(|c| c.is_control() || c.is_whitespace())
        || !is_client_id(&client_id)
        || !is_context_gateway_category_set(&categories)
        // A credential for another computer is not ours to keep.
        || device_id != identity.device_id()
        || binding_ref.kind != "shell_session_binding"
        || !is_known_api_origin(api_origin)
    {
        return Err(invalid());
    }
    let expires = parse_ms(&expires_at).ok_or_else(invalid)?;
    if expires <= now_ms || parse_ms(&issued_at).is_none() || parse_ms(&refresh_after).is_none() {
        return Err(invalid());
    }
    let stored = StoredContextCredential {
        credential_ref,
        token,
        client_id: client_id.clone(),
        categories,
        device_id,
        issued_at,
        expires_at,
        refresh_after,
        api_origin: api_origin.to_string(),
        binding_ref,
    };
    let body = serde_json::to_string(&stored).map_err(|_| invalid())?;
    store
        .set_text(KEYRING_SERVICE_CONTEXT_GATEWAY, &keyring_account(&client_id), &body)
        .map_err(|_| "keychain_unavailable".to_string())?;
    Ok(status_row(&client_id, Some(&stored), now_ms))
}

/// One row per client for the panel. Never carries the token.
pub fn status_row(client_id: &str, credential: Option<&StoredContextCredential>, now_ms: i64) -> Value {
    match credential {
        None => json!({ "clientId": client_id, "issued": false }),
        Some(c) => json!({
            "clientId": client_id,
            "issued": true,
            "credentialRef": c.credential_ref,
            "deviceId": c.device_id,
            "categories": c.categories,
            "memoryOn": c.categories.iter().any(|category| category == "agent_memory"),
            "expiresAt": c.expires_at,
            "refreshAfter": c.refresh_after,
            "expired": c.expired_at(now_ms),
        }),
    }
}

pub fn status_all(store: &dyn SecureStore, now_ms: i64) -> Vec<Value> {
    CONTEXT_GATEWAY_CLIENT_IDS_V1
        .iter()
        .map(|client_id| match load(store, client_id) {
            Ok(credential) => status_row(client_id, credential.as_ref(), now_ms),
            Err(reason) => json!({ "clientId": client_id, "issued": false, "error": reason }),
        })
        .collect()
}

fn enrolled_binding(store: &dyn SecureStore) -> Result<(ShellBindingRef, String), String> {
    let state = EnrollmentState::load(store)
        .map_err(|_| "enrollment_unreadable".to_string())?
        .ok_or_else(|| "not_enrolled".to_string())?;
    match (state.paired, state.binding, state.signer_ref) {
        (true, Some(binding), Some(signer)) => Ok((binding, signer)),
        _ => Err("not_enrolled".into()),
    }
}

/// The signed issue request for `POST /api/v1/devices/:deviceId/context-credentials`.
/// Refuses while the emergency stop is engaged, for a client or category D4 does not know, and when this
/// computer is not enrolled.
pub fn sign_issue(
    store: &dyn SecureStore,
    engaged: bool,
    client_id: &str,
    categories: &[String],
    request_id: &str,
    signed_at: &str,
) -> Result<Value, String> {
    if engaged {
        return Err("kill_switch_engaged".into());
    }
    if !is_client_id(client_id) {
        return Err("client_invalid".into());
    }
    if !is_context_gateway_category_set(categories) {
        return Err("category_not_allowed".into());
    }
    let identity = DeviceIdentity::load(store)
        .map_err(|_| "device_identity_unavailable".to_string())?
        .ok_or_else(|| "not_enrolled".to_string())?;
    let (binding, signer) = enrolled_binding(store)?;
    let command = identity
        .context_gateway_credential_issue_command(request_id, client_id, categories, &signer, &binding, signed_at)
        .map_err(|error| error.code().to_string())?;
    Ok(json!({
        "deviceId": identity.device_id(),
        "apiOrigin": crate::developer_runtime::types::api_origin(),
        "command": command,
    }))
}

/// The signed refresh request. The old credential's reference comes from the keychain, not from the WebView,
/// and a refresh never changes the client or the categories.
pub fn sign_refresh(
    store: &dyn SecureStore,
    engaged: bool,
    client_id: &str,
    request_id: &str,
    signed_at: &str,
) -> Result<Value, String> {
    if engaged {
        return Err("kill_switch_engaged".into());
    }
    let current = load(store, client_id)?.ok_or_else(|| "no_credential".to_string())?;
    let identity = DeviceIdentity::load(store)
        .map_err(|_| "device_identity_unavailable".to_string())?
        .ok_or_else(|| "not_enrolled".to_string())?;
    if current.device_id != identity.device_id() {
        return Err("credential_other_device".into());
    }
    let (binding, _) = enrolled_binding(store)?;
    let command = identity
        .context_gateway_credential_refresh_command(&current.credential_ref, request_id, &binding, signed_at)
        .map_err(|error| error.code().to_string())?;
    Ok(json!({
        "deviceId": identity.device_id(),
        "apiOrigin": current.api_origin,
        "command": command,
        "token": current.token,
    }))
}

// ── Tauri commands (thin wrappers; all logic above is tested without the OS keychain) ────────────────

fn new_request_id(prefix: &str) -> String {
    format!("{prefix}-{}", hex::encode(rand::random::<[u8; 12]>()))
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[tauri::command(async)]
pub async fn desktop_bridge_context_credential_sign_issue(client_id: String, categories: Vec<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        sign_issue(
            &crate::developer_runtime::crypto::OsKeyringStore,
            crate::kill_switch::is_engaged(),
            &client_id,
            &categories,
            &new_request_id("cgi"),
            &crate::developer_runtime::types::now_iso(),
        )
    })
    .await
    .map_err(|_| "sign_failed".to_string())?
}

/// The refresh request, plus the old token: the WebView needs it as the bearer for `.../refresh` (the server
/// requires the old credential). It is the one place the token leaves Rust, and only for a refresh.
#[tauri::command(async)]
pub async fn desktop_bridge_context_credential_sign_refresh(client_id: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        sign_refresh(
            &crate::developer_runtime::crypto::OsKeyringStore,
            crate::kill_switch::is_engaged(),
            &client_id,
            &new_request_id("cgr"),
            &crate::developer_runtime::types::now_iso(),
        )
    })
    .await
    .map_err(|_| "sign_failed".to_string())?
}

/// Keep what the server issued (checked against this computer). Refused while the emergency stop is engaged.
#[tauri::command(async)]
pub async fn desktop_bridge_context_credential_store(api_origin: String, credential: Value) -> Result<Value, String> {
    if crate::kill_switch::is_engaged() {
        return Err("kill_switch_engaged".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let store = crate::developer_runtime::crypto::OsKeyringStore;
        let identity = DeviceIdentity::load(&store)
            .map_err(|_| "device_identity_unavailable".to_string())?
            .ok_or_else(|| "not_enrolled".to_string())?;
        store_issued(&store, &identity, &api_origin, &credential, now_ms())
    })
    .await
    .map_err(|_| "store_failed".to_string())?
}

#[tauri::command(async)]
pub async fn desktop_bridge_context_credential_status() -> Result<Vec<Value>, String> {
    tauri::async_runtime::spawn_blocking(|| status_all(&crate::developer_runtime::crypto::OsKeyringStore, now_ms()))
        .await
        .map_err(|_| "status_failed".to_string())
}

/// Forget the local copy (after the server revoked it, or when the owner just wants it gone). Never blocked by
/// the emergency stop.
#[tauri::command(async)]
pub async fn desktop_bridge_context_credential_remove(client_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete(&crate::developer_runtime::crypto::OsKeyringStore, &client_id))
        .await
        .map_err(|_| "remove_failed".to_string())?
}

/// How a client starts the local MCP server: this program, in `--agentrix-mcp` mode. The owner copies it into
/// the client's own MCP settings; Agentrix does not edit those files.
#[tauri::command]
pub fn desktop_bridge_context_mcp_launch(client_id: String) -> Result<Value, String> {
    if !is_client_id(&client_id) {
        return Err("client_invalid".into());
    }
    let exe = std::env::current_exe().map_err(|_| "exe_unknown".to_string())?;
    let args = vec!["--agentrix-mcp".to_string(), "--client".to_string(), client_id];
    Ok(json!({ "command": exe.to_string_lossy(), "args": args }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::crypto::MemorySecureStore;
    use crate::developer_runtime::enrollment::KEYRING_ENROLLMENT_STATE;

    const BINDING_ID: &str = "3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b";
    const NOW: i64 = 1_792_000_000_000;

    fn binding() -> ShellBindingRef {
        ShellBindingRef { kind: "shell_session_binding".into(), id: BINDING_ID.into(), version: 2 }
    }

    fn enrolled() -> (MemorySecureStore, DeviceIdentity) {
        let store = MemorySecureStore::default();
        let identity = DeviceIdentity::load_or_create(&store).unwrap();
        let state = EnrollmentState {
            device_id: identity.device_id().to_string(),
            paired: true,
            signer_ref: Some("dsc_1".into()),
            binding: Some(binding()),
            ..Default::default()
        };
        store
            .set_text(KEYRING_SERVICE, KEYRING_ENROLLMENT_STATE, &serde_json::to_string(&state).unwrap())
            .unwrap();
        (store, identity)
    }

    fn issued(device_id: &str, client: &str, categories: &[&str]) -> Value {
        json!({
            "schemaVersion": 1,
            "credentialRef": format!("cgc_{}", "b".repeat(32)),
            "token": "tok.en.value",
            "tokenType": "Bearer",
            "audience": "context_gateway",
            "deviceId": device_id,
            "clientId": client,
            "categories": categories,
            "bindingRef": { "type": "shell_session_binding", "id": BINDING_ID, "version": 2 },
            "issuedAt": "2026-10-18T13:00:00.000Z",
            "expiresAt": "2099-01-01T00:00:00.000Z",
            "refreshAfter": "2098-12-31T23:40:00.000Z",
        })
    }

    #[test]
    fn issue_is_signed_only_for_known_clients_and_categories_and_never_while_stopped() {
        let (store, _) = enrolled();
        let cats = vec!["agent_profile".to_string(), "agent_memory".to_string()];
        let ok = sign_issue(&store, false, "cursor", &cats, "cgi-1", "2026-10-18T13:00:00Z").unwrap();
        assert_eq!(ok["command"]["clientId"], "cursor");
        assert_eq!(ok["command"]["signature"].as_str().unwrap().len(), 86);
        // The emergency stop: nothing is signed.
        assert_eq!(sign_issue(&store, true, "cursor", &cats, "cgi-1", "2026-10-18T13:00:00Z").unwrap_err(), "kill_switch_engaged");
        assert_eq!(sign_issue(&store, false, "vscode", &cats, "cgi-1", "2026-10-18T13:00:00Z").unwrap_err(), "client_invalid");
        for denied in ["relationship_graph", "financial_summary", "credential_metadata"] {
            let err = sign_issue(&store, false, "kiro", &[denied.to_string()], "cgi-1", "2026-10-18T13:00:00Z").unwrap_err();
            assert_eq!(err, "category_not_allowed", "{denied}");
        }
        // A computer that is not enrolled signs nothing.
        let bare = MemorySecureStore::default();
        assert_eq!(sign_issue(&bare, false, "cursor", &cats, "cgi-1", "2026-10-18T13:00:00Z").unwrap_err(), "not_enrolled");
    }

    #[test]
    fn store_keeps_a_valid_credential_and_status_never_shows_the_token() {
        let (store, identity) = enrolled();
        let row = store_issued(
            &store,
            &identity,
            "https://api.agentrix.top",
            &issued(identity.device_id(), "cursor", &["agent_profile", "agent_memory"]),
            NOW,
        )
        .unwrap();
        assert_eq!(row["memoryOn"], true);
        assert!(!row.to_string().contains("tok.en.value"));
        let all = status_all(&store, NOW);
        assert_eq!(all.len(), 5);
        assert!(all.iter().all(|r| !r.to_string().contains("tok.en.value")));
        assert_eq!(all[0]["clientId"], "cursor");
        assert_eq!(all[0]["issued"], true);
        assert_eq!(all[1]["issued"], false);
        let loaded = load(&store, "cursor").unwrap().unwrap();
        assert_eq!(loaded.token, "tok.en.value");
        // Debug never prints the token.
        assert!(!format!("{loaded:?}").contains("tok.en.value"));
        delete(&store, "cursor").unwrap();
        assert!(load(&store, "cursor").unwrap().is_none());
    }

    #[test]
    fn store_refuses_what_this_computer_did_not_ask_for() {
        let (store, identity) = enrolled();
        let device = identity.device_id().to_string();
        let origin = "https://api.agentrix.top";
        let good = issued(&device, "cursor", &["agent_profile"]);
        let mutate = |key: &str, value: Value| {
            let mut copy = good.clone();
            copy[key] = value;
            copy
        };
        let cases = [
            mutate("deviceId", json!("dev_00000000000000000000000000000000")),
            mutate("audience", json!("developer_runtime")),
            mutate("tokenType", json!("Basic")),
            mutate("clientId", json!("vscode")),
            mutate("categories", json!(["credential_metadata"])),
            mutate("categories", json!([])),
            mutate("credentialRef", json!(format!("drc_{}", "b".repeat(32)))),
            mutate("token", json!("has space")),
            mutate("token", json!("")),
            mutate("expiresAt", json!("2020-01-01T00:00:00.000Z")),
            mutate("schemaVersion", json!(2)),
        ];
        for case in cases {
            assert_eq!(store_issued(&store, &identity, origin, &case, NOW).unwrap_err(), "credential_invalid", "{case}");
        }
        // Only the two Agentrix origins.
        assert!(store_issued(&store, &identity, "https://evil.example", &good, NOW).is_err());
        assert!(load(&store, "cursor").unwrap().is_none());
    }

    #[test]
    fn a_damaged_or_misfiled_entry_is_an_error_not_an_empty_slot() {
        let (store, _) = enrolled();
        store.set_text(KEYRING_SERVICE_CONTEXT_GATEWAY, &keyring_account("kiro"), "{not json").unwrap();
        assert_eq!(load(&store, "kiro").unwrap_err(), "credential_corrupt");
        assert_eq!(status_all(&store, NOW)[2]["error"], "credential_corrupt");
        // Cursor's credential filed under Kiro's name is not trusted for Kiro.
        let (store2, identity) = enrolled();
        store_issued(&store2, &identity, "https://api.agentrix.top", &issued(identity.device_id(), "cursor", &["agent_profile"]), NOW).unwrap();
        let text = store2.get_text(KEYRING_SERVICE_CONTEXT_GATEWAY, &keyring_account("cursor")).unwrap().unwrap();
        store2.set_text(KEYRING_SERVICE_CONTEXT_GATEWAY, &keyring_account("kiro"), &text).unwrap();
        assert_eq!(load(&store2, "kiro").unwrap_err(), "credential_corrupt");
        assert_eq!(load(&store2, "../x").unwrap_err(), "client_invalid");
    }

    #[test]
    fn refresh_uses_the_stored_reference_and_is_refused_while_stopped() {
        let (store, identity) = enrolled();
        assert_eq!(sign_refresh(&store, false, "cursor", "cgr-1", "2026-10-18T13:20:00Z").unwrap_err(), "no_credential");
        store_issued(&store, &identity, "https://api.agentrix.top", &issued(identity.device_id(), "cursor", &["agent_profile"]), NOW).unwrap();
        let ok = sign_refresh(&store, false, "cursor", "cgr-1", "2026-10-18T13:20:00Z").unwrap();
        assert_eq!(ok["apiOrigin"], "https://api.agentrix.top");
        assert_eq!(ok["command"]["signature"].as_str().unwrap().len(), 86);
        // The refresh body has no client or categories to change.
        assert!(ok["command"].get("categories").is_none() && ok["command"].get("clientId").is_none());
        assert_eq!(sign_refresh(&store, true, "cursor", "cgr-1", "2026-10-18T13:20:00Z").unwrap_err(), "kill_switch_engaged");
    }
}
