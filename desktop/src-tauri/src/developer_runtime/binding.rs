//! Verified Backend binding projections. WebView never supplies binding truth.

use crate::developer_runtime::channel::OutboundChannelClient;
use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::jcs::jcs_digest;
use crate::developer_runtime::policy::{assert_control_plane_safe, is_opaque, TrustPolicy};
use crate::developer_runtime::types::{
    now_iso, ActiveBinding, DigestRef, VerifiedBinding, AUDIENCE_DESKTOP_RUNTIME,
};
use serde_json::{json, Value};

pub trait BindingSource: Send + Sync {
    fn fetch(&self, bootstrap_ref: &str) -> RuntimeResult<Value>;
}

pub struct HttpsBindingSource {
    client: std::sync::Mutex<crate::developer_runtime::channel::HttpsOutboundClient>,
}

impl HttpsBindingSource {
    pub fn new(client: crate::developer_runtime::channel::HttpsOutboundClient) -> Self {
        Self {
            client: std::sync::Mutex::new(client),
        }
    }
}

impl BindingSource for HttpsBindingSource {
    fn fetch(&self, bootstrap_ref: &str) -> RuntimeResult<Value> {
        if !is_opaque(bootstrap_ref) {
            return Err(RuntimeError::fail_closed("unknown_schema"));
        }
        let mut client = self
            .client
            .lock()
            .map_err(|_| RuntimeError::fail_closed("channel_lock"))?;
        let data = client.get("/binding", &[("bootstrapRef", bootstrap_ref)])?;
        if data.get("binding").is_some() {
            return Ok(data);
        }
        Err(RuntimeError::unavailable("binding_bootstrap_unavailable"))
    }
}

pub struct UnavailableBindingSource;

impl BindingSource for UnavailableBindingSource {
    fn fetch(&self, _bootstrap_ref: &str) -> RuntimeResult<Value> {
        Err(RuntimeError::unavailable("binding_bootstrap_unavailable"))
    }
}

pub fn verify_projection(
    projection: &Value,
    now: &str,
    policy: &TrustPolicy,
) -> RuntimeResult<VerifiedBinding> {
    assert_control_plane_safe(projection)?;
    let object = projection
        .as_object()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if object.get("schemaVersion") != Some(&json!(1))
        || object.get("contractType") != Some(&json!("developer_runtime_binding_projection"))
    {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    let audience = require_str(object, "audience")?;
    if audience != AUDIENCE_DESKTOP_RUNTIME {
        return Err(RuntimeError::fail_closed("audience_mismatch"));
    }
    let binding_version = object
        .get("bindingVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))? as u32;
    let authentication_ref = require_str(object, "authenticationRef")?;
    if !is_opaque(&authentication_ref) {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    if object.get("signatureRef").is_some() {
        return Err(RuntimeError::fail_closed("unsigned_projection_forbidden"));
    }
    if object
        .get("authentication")
        .and_then(|value| value.get("kind"))
        != Some(&json!("tls_bearer_bootstrap"))
    {
        return Err(RuntimeError::fail_closed("unauthenticated_projection"));
    }
    let binding_value = object
        .get("binding")
        .cloned()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    let mut binding: ActiveBinding = serde_json::from_value(binding_value.clone())
        .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
    binding.workspace_path = None;
    binding.audience = audience.clone();
    binding.binding_version = binding_version;
    policy.validate_binding(&binding, now)?;
    let expected = jcs_digest(&unsigned_binding_body(
        &binding_value,
        &audience,
        binding_version,
    ))?;
    let provided: DigestRef = serde_json::from_value(
        object
            .get("digest")
            .cloned()
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?,
    )
    .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
    if provided != expected {
        return Err(RuntimeError::fail_closed("binding_digest_mismatch"));
    }
    Ok(VerifiedBinding {
        binding,
        audience,
        binding_version,
        digest: provided,
        authentication_ref,
    })
}

fn unsigned_binding_body(binding: &Value, audience: &str, binding_version: u32) -> Value {
    json!({
        "schemaVersion": 1,
        "contractType": "developer_runtime_binding_projection",
        "audience": audience,
        "bindingVersion": binding_version,
        "binding": binding,
    })
}

fn require_str(
    object: &serde_json::Map<String, Value>,
    key: &str,
) -> RuntimeResult<String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))
}

#[cfg(test)]
pub struct ScriptedBindingSource {
    projections: std::collections::HashMap<String, Value>,
}

#[cfg(test)]
impl ScriptedBindingSource {
    pub fn new() -> Self {
        Self {
            projections: std::collections::HashMap::new(),
        }
    }

    pub fn insert(&mut self, bootstrap_ref: &str, projection: Value) {
        self.projections.insert(bootstrap_ref.to_string(), projection);
    }
}

#[cfg(test)]
impl BindingSource for ScriptedBindingSource {
    fn fetch(&self, bootstrap_ref: &str) -> RuntimeResult<Value> {
        if !is_opaque(bootstrap_ref) {
            return Err(RuntimeError::fail_closed("unknown_schema"));
        }
        self.projections
            .get(bootstrap_ref)
            .cloned()
            .ok_or_else(|| RuntimeError::unavailable("binding_bootstrap_unavailable"))
    }
}

#[cfg(test)]
pub fn sign_projection(binding: &ActiveBinding) -> Value {
    let binding_value = serde_json::to_value(binding).expect("binding json");
    let digest = jcs_digest(&unsigned_binding_body(
        &binding_value,
        &binding.audience,
        binding.binding_version,
    ))
    .expect("digest");
    json!({
        "schemaVersion": 1,
        "contractType": "developer_runtime_binding_projection",
        "audience": binding.audience,
        "bindingVersion": binding.binding_version,
        "binding": binding_value,
        "digest": digest,
        "authenticationRef": "auth-runtime-1",
        "authentication": {
            "kind": "tls_bearer_bootstrap",
            "bootstrapRef": "bootstrap-1"
        },
        "verifiedAt": now_iso(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::types::{DigestRef, RecordRef};

    fn binding() -> ActiveBinding {
        ActiveBinding {
            owner_principal_ref: "principal-1".into(),
            agent_id: "agent-1".into(),
            device_ref: "device-1".into(),
            runtime_ref: RecordRef {
                kind: "runtime".into(),
                id: "runtime-1".into(),
                version: Some(1),
                digest: None,
            },
            machine_ref: "machine-1".into(),
            machine_version: 1,
            workspace_ref: "workspace-1".into(),
            workspace_digest: DigestRef {
                algorithm: "sha-256".into(),
                canonicalization: "jcs/1".into(),
                value: "a".repeat(64),
            },
            workspace_trust: "trusted".into(),
            shell_binding_ref: "binding-1".into(),
            shell_binding_version: 1,
            nonce_domain: "developer-remote-workspace".into(),
            issued_at: "2026-08-22T12:00:00.000Z".into(),
            expires_at: "2099-08-22T12:00:00.000Z".into(),
            status: "active".into(),
            audience: AUDIENCE_DESKTOP_RUNTIME.into(),
            binding_version: 3,
            workspace_path: None,
        }
    }

    #[test]
    fn accepts_signed_projection_and_rejects_forgery() {
        let policy = TrustPolicy::default();
        let signed = sign_projection(&binding());
        let verified = verify_projection(&signed, "2026-08-22T12:30:00.000Z", &policy).unwrap();
        assert_eq!(verified.binding_version, 3);
        assert_eq!(verified.audience, AUDIENCE_DESKTOP_RUNTIME);
        let mut forged = signed;
        forged["binding"]["ownerPrincipalRef"] = json!("attacker");
        assert_eq!(
            verify_projection(&forged, "2026-08-22T12:30:00.000Z", &policy)
                .unwrap_err()
                .code(),
            "binding_digest_mismatch"
        );
    }

    #[test]
    fn missing_bootstrap_is_typed_unavailable() {
        let source = ScriptedBindingSource::new();
        assert_eq!(
            source.fetch("bootstrap-1").unwrap_err().code(),
            "binding_bootstrap_unavailable"
        );
    }
}
