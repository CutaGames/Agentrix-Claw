//! Vendor permission → shared approval projection. Default L3 / once / local.

use crate::developer_runtime::confirmation::assert_independent_confirmation;
use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::jcs::jcs_digest;
use crate::developer_runtime::journal::EncryptedJournal;
use crate::developer_runtime::policy::{is_opaque, looks_like_absolute_path};
use crate::developer_runtime::types::{now_iso, AuthorityDecision, DigestRef};
use serde_json::{json, Map, Value};

pub const DEFAULT_RISK: &str = "L3";
pub const DEFAULT_GRANT: &str = "once";

pub fn project_permission_request(raw: &Value) -> RuntimeResult<Value> {
    let object = raw
        .as_object()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    let session_ref = require_opaque(object, "sessionRef")?;
    let session_version = require_u32(object, "sessionVersion")?;
    let adapter_session_ref = require_opaque(object, "adapterSessionRef")?;
    let instruction_ref = require_opaque(object, "instructionRef")?;
    let action_ref = require_opaque(object, "actionRef")?;
    let workspace_ref = require_opaque(object, "workspaceRef")?;
    let tool_call_id = require_opaque(object, "toolCallId")?;
    let tool_name = require_opaque(object, "toolName")?;
    let instruction_digest: DigestRef = serde_json::from_value(
        object
            .get("instructionDigest")
            .cloned()
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?,
    )
    .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
    let workspace_digest: DigestRef = serde_json::from_value(
        object
            .get("workspaceDigest")
            .cloned()
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?,
    )
    .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
    let argument_digest_source = object
        .get("argumentDigestSource")
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if looks_like_absolute_path(&tool_name) || looks_like_absolute_path(&tool_call_id) {
        return Err(RuntimeError::fail_closed("path_in_control_plane"));
    }
    let issued_at = now_iso();
    let expires_at = (chrono::Utc::now() + chrono::Duration::minutes(4))
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let tool_arguments_digest = jcs_digest(argument_digest_source)?;
    let request_digest = jcs_digest(&json!({
        "adapterRequestRef": tool_call_id,
        "toolArgumentsDigest": tool_arguments_digest,
        "workspaceScopeDigest": workspace_digest,
        "instructionRequestDigest": instruction_digest,
        "sessionRef": session_ref,
        "sessionVersion": session_version,
    }))?;
    Ok(json!({
        "schemaVersion": 1,
        "contractType": "developer_approval_request",
        "approvalRef": format!("approval-{tool_call_id}"),
        "approvalVersion": 1,
        "status": "pending",
        "decisionSequence": 0,
        "instructionRef": instruction_ref,
        "actionRef": action_ref,
        "sessionRef": session_ref,
        "sessionVersion": session_version,
        "adapterSessionRef": adapter_session_ref,
        "adapterRequestRef": tool_call_id,
        "workspaceRef": workspace_ref,
        "operationKind": "permission_change",
        "toolName": tool_name,
        "toolArgumentsDigest": tool_arguments_digest,
        "workspaceScopeDigest": workspace_digest,
        "instructionRequestDigest": instruction_digest,
        "requestDigest": request_digest,
        "risk": DEFAULT_RISK,
        "sideEffectClass": "irreversible",
        "estimatedCost": { "status": "not_applicable" },
        "requestedGrantScopes": [DEFAULT_GRANT],
        "requiresLocalConfirmation": true,
        "userVisibleSummary": format!("Permission request for {tool_name}"),
        "redactedArgumentsSummary": "Arguments redacted to digest",
        "issuedAt": issued_at,
        "expiresAt": expires_at,
    }))
}

fn require_digest(object: &Map<String, Value>, key: &str) -> RuntimeResult<DigestRef> {
    serde_json::from_value(
        object
            .get(key)
            .cloned()
            .ok_or_else(|| RuntimeError::unavailable("authority_decision_pending"))?,
    )
    .map_err(|_| RuntimeError::fail_closed("unknown_schema"))
}

fn require_opaque_field(object: &Map<String, Value>, key: &str) -> RuntimeResult<String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| is_opaque(value))
        .map(ToOwned::to_owned)
        .ok_or_else(|| RuntimeError::unavailable("authority_decision_pending"))
}

pub fn canonical_authority_decision(
    item: &Value,
    expected_request_digest: Value,
) -> RuntimeResult<AuthorityDecision> {
    let object = item
        .as_object()
        .ok_or_else(|| RuntimeError::unavailable("authority_decision_pending"))?;
    let decision_ref = require_opaque_field(object, "decisionRef")?;
    let approval_ref = require_opaque_field(object, "approvalRef")?;
    let adapter_request_ref = require_opaque_field(object, "adapterRequestRef")?;
    let decision = object
        .get("decision")
        .and_then(Value::as_str)
        .ok_or_else(|| RuntimeError::unavailable("authority_decision_pending"))?;
    if !matches!(decision, "approved" | "rejected" | "cancelled") {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    let request_digest = require_digest(object, "requestDigest")?;
    let expected: DigestRef = serde_json::from_value(expected_request_digest)
        .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
    if request_digest != expected {
        return Err(RuntimeError::fail_closed("exact_digest_mismatch"));
    }
    let decision_digest = require_digest(object, "decisionDigest")?;
    let decided_at = object
        .get("decidedAt")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| RuntimeError::unavailable("authority_decision_pending"))?
        .to_string();
    let authority_digest = require_digest(object, "authorityDigest")?;
    let expected_authority = jcs_digest(&json!({
        "decisionRef": decision_ref,
        "approvalRef": approval_ref,
        "requestDigest": request_digest,
        "decision": decision,
    }))?;
    if expected_authority != authority_digest {
        return Err(RuntimeError::fail_closed("authority_digest_mismatch"));
    }
    let grant_scope = object
        .get("grantScope")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let authority_grant_ref = object.get("authorityGrantRef").cloned();
    if decision == "approved" {
        if grant_scope.as_deref() != Some(DEFAULT_GRANT) {
            return Err(RuntimeError::fail_closed("grant_scope_locked"));
        }
        if authority_grant_ref.is_none() {
            return Err(RuntimeError::unavailable("authority_decision_pending"));
        }
        let expected_canonical = jcs_digest(&json!({
            "adapterRequestRef": adapter_request_ref,
            "approvalRef": approval_ref,
            "authorityDigest": authority_digest,
            "authorityGrantRef": authority_grant_ref,
            "decidedAt": decided_at,
            "decision": decision,
            "decisionRef": decision_ref,
            "grantScope": grant_scope,
            "requestDigest": request_digest,
        }))?;
        if object.get("canonicalDigest").is_some()
            && object.get("canonicalDigest") != Some(&serde_json::to_value(&expected_canonical).unwrap_or(Value::Null))
        {
            return Err(RuntimeError::fail_closed("exact_digest_mismatch"));
        }
    }
    if object.get("localConfirmationRef").and_then(Value::as_str) == Some(&format!("local-{decision_ref}"))
    {
        return Err(RuntimeError::fail_closed("local_confirmation_forged"));
    }
    Ok(AuthorityDecision {
        decision_ref,
        approval_ref,
        adapter_request_ref,
        request_digest,
        decision: decision.to_string(),
        grant_scope,
        local_confirmation_ref: None,
        decided_at,
        authority_digest,
        decision_digest,
        authority_grant_ref,
    })
}

pub fn vendor_allow_once(
    journal: &EncryptedJournal,
    pending_request: &Value,
    decision: &AuthorityDecision,
    binding_fresh: bool,
) -> RuntimeResult<Value> {
    if !binding_fresh {
        return Err(RuntimeError::fail_closed("stale_binding"));
    }
    if !is_opaque(&decision.decision_ref) {
        return Err(RuntimeError::fail_closed("authority_decision_missing"));
    }
    let request_digest = pending_request
        .get("requestDigest")
        .cloned()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    let expected = serde_json::to_value(&decision.request_digest)
        .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
    if request_digest != expected {
        return Err(RuntimeError::fail_closed("exact_digest_mismatch"));
    }
    let authority_expected = jcs_digest(&json!({
        "decisionRef": decision.decision_ref,
        "approvalRef": decision.approval_ref,
        "requestDigest": decision.request_digest,
        "decision": decision.decision,
    }))?;
    if authority_expected != decision.authority_digest {
        return Err(RuntimeError::fail_closed("authority_digest_mismatch"));
    }
    if pending_request.get("risk").and_then(Value::as_str) != Some(DEFAULT_RISK) {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    if decision.decision == "approved" {
        if decision.grant_scope.as_deref() != Some(DEFAULT_GRANT) {
            return Err(RuntimeError::fail_closed("grant_scope_locked"));
        }
        let confirmation = decision
            .local_confirmation_ref
            .as_deref()
            .ok_or_else(|| RuntimeError::fail_closed("local_confirmation_required"))?;
        assert_independent_confirmation(confirmation, &decision.decision_ref)?;
        if decision.authority_grant_ref.is_none() {
            return Err(RuntimeError::fail_closed("authority_grant_missing"));
        }
    }
    let decision_json = serde_json::to_value(decision)
        .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
    journal.fence_decision(&decision.approval_ref, &request_digest, &decision_json)?;
    match decision.decision.as_str() {
        "approved" => Ok(json!({ "outcome": { "outcome": "selected", "optionId": "allow-once" } })),
        "rejected" => Ok(json!({ "outcome": { "outcome": "selected", "optionId": "reject-once" } })),
        "cancelled" => Ok(json!({ "outcome": { "outcome": "cancelled" } })),
        _ => Err(RuntimeError::fail_closed("unknown_schema")),
    }
}

fn require_opaque(object: &Map<String, Value>, key: &str) -> RuntimeResult<String> {
    let value = object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if !is_opaque(value) {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    Ok(value.to_string())
}

fn require_u32(object: &Map<String, Value>, key: &str) -> RuntimeResult<u32> {
    object
        .get(key)
        .and_then(Value::as_u64)
        .map(|value| value as u32)
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::crypto::MemorySecureStore;
    use crate::developer_runtime::journal::EncryptedJournal;
    use crate::developer_runtime::types::JournalRecord;

    fn digest() -> DigestRef {
        jcs_digest(&json!({ "n": 1 })).unwrap()
    }

    #[test]
    fn missing_fields_fail_closed_without_defaults() {
        assert_eq!(
            project_permission_request(&json!({})).unwrap_err().code(),
            "unknown_schema"
        );
    }

    #[test]
    fn rejected_without_digest_stays_pending() {
        assert_eq!(
            canonical_authority_decision(
                &json!({ "decision": "rejected", "approvalRef": "approval-1" }),
                serde_json::to_value(&digest()).unwrap(),
            )
            .unwrap_err()
            .code(),
            "authority_decision_pending"
        );
    }

    #[test]
    fn allow_once_requires_authority_digest_confirmation_and_fence() {
        let dir = tempfile::tempdir().unwrap();
        let store = MemorySecureStore::default();
        let journal = EncryptedJournal::open(dir.path().join("j.sqlite"), &store).unwrap();
        journal
            .reserve(&JournalRecord {
                binding_ref: "binding-1".into(),
                adapter_session_ref: "adapter-session-1".into(),
                instruction_ref: Some("instruction-1".into()),
                idempotency_key: "idem-1".into(),
                nonce_domain: "developer-remote-workspace".into(),
                nonce: "nonce-1".into(),
                sequence: 1,
                state: "awaiting_approval".into(),
                refs_json: json!({ "instructionRef": "instruction-1" }),
                created_at: now_iso(),
                updated_at: now_iso(),
            })
            .unwrap();
        let request = project_permission_request(&json!({
            "sessionRef": "session-1",
            "sessionVersion": 1,
            "adapterSessionRef": "adapter-session-1",
            "instructionRef": "instruction-1",
            "actionRef": "action-1",
            "workspaceRef": "workspace-1",
            "toolCallId": "adapter-request-1",
            "toolName": "test_runner",
            "instructionDigest": digest(),
            "workspaceDigest": digest(),
            "argumentDigestSource": { "target": "selected-suite" },
        }))
        .unwrap();
        journal
            .record_approval_request(
                "approval-adapter-request-1",
                request.get("requestDigest").unwrap(),
            )
            .unwrap();
        let request_digest =
            serde_json::from_value(request.get("requestDigest").unwrap().clone()).unwrap();
        let mut decision = AuthorityDecision {
            decision_ref: "decision-1".into(),
            approval_ref: "approval-adapter-request-1".into(),
            adapter_request_ref: "adapter-request-1".into(),
            request_digest,
            decision: "approved".into(),
            grant_scope: Some("once".into()),
            local_confirmation_ref: None,
            decided_at: now_iso(),
            authority_digest: digest(),
            decision_digest: digest(),
            authority_grant_ref: Some(json!({
                "type": "authority_grant",
                "id": "auth-grant-1",
                "version": 1
            })),
        };
        decision.authority_digest = jcs_digest(&json!({
            "decisionRef": decision.decision_ref,
            "approvalRef": decision.approval_ref,
            "requestDigest": decision.request_digest,
            "decision": decision.decision,
        }))
        .unwrap();
        assert_eq!(
            vendor_allow_once(&journal, &request, &decision, true)
                .unwrap_err()
                .code(),
            "local_confirmation_required"
        );
        decision.local_confirmation_ref = Some("local-decision-1".into());
        assert_eq!(
            vendor_allow_once(&journal, &request, &decision, true)
                .unwrap_err()
                .code(),
            "local_confirmation_forged"
        );
        decision.local_confirmation_ref = Some("l3c-fixture-1".into());
        let allowed = vendor_allow_once(&journal, &request, &decision, true).unwrap();
        assert_eq!(allowed["outcome"]["optionId"], "allow-once");
        decision.decision = "rejected".into();
        decision.authority_digest = jcs_digest(&json!({
            "decisionRef": decision.decision_ref,
            "approvalRef": decision.approval_ref,
            "requestDigest": decision.request_digest,
            "decision": decision.decision,
        }))
        .unwrap();
        assert_eq!(
            vendor_allow_once(&journal, &request, &decision, true)
                .unwrap_err()
                .code(),
            "terminal_rewrite"
        );
    }
}
