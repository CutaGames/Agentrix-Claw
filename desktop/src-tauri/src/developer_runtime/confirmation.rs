//! Rust-owned L3 user-present confirmation. Never derived from decisionRef.

use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::policy::is_opaque;
use crate::developer_runtime::types::{now_iso, DigestRef};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfirmationFence {
    pub confirmation_ref: String,
    pub approval_ref: String,
    pub request_digest: DigestRef,
    pub confirmed_at: String,
}

pub fn assert_independent_confirmation(
    confirmation_ref: &str,
    decision_ref: &str,
) -> RuntimeResult<()> {
    if !is_opaque(confirmation_ref) {
        return Err(RuntimeError::fail_closed("local_confirmation_required"));
    }
    if confirmation_ref == format!("local-{decision_ref}")
        || confirmation_ref.ends_with(decision_ref)
        || confirmation_ref.contains(decision_ref)
    {
        return Err(RuntimeError::fail_closed("local_confirmation_forged"));
    }
    Ok(())
}

pub fn mint_confirmation_ref() -> String {
    let bytes: [u8; 12] = rand::random();
    format!("l3c-{}", hex::encode(bytes))
}

pub fn confirm_l3_once(
    approval_ref: &str,
    request_digest: &DigestRef,
    fixture: Option<bool>,
) -> RuntimeResult<LocalConfirmationFence> {
    let allowed = match fixture {
        Some(value) => value,
        None => native_user_present_dialog(approval_ref)?,
    };
    if !allowed {
        return Err(RuntimeError::unavailable("local_confirmation_rejected"));
    }
    Ok(LocalConfirmationFence {
        confirmation_ref: mint_confirmation_ref(),
        approval_ref: approval_ref.to_string(),
        request_digest: request_digest.clone(),
        confirmed_at: now_iso(),
    })
}

fn native_user_present_dialog(approval_ref: &str) -> RuntimeResult<bool> {
    let shown = rfd::MessageDialog::new()
        .set_title("Developer Runtime permission")
        .set_description(&format!(
            "Allow this one-time L3 permission for {approval_ref}?"
        ))
        .set_buttons(rfd::MessageButtons::OkCancel)
        .show();
    Ok(matches!(shown, rfd::MessageDialogResult::Ok))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_decision_ref_derived_confirmation() {
        assert_eq!(
            assert_independent_confirmation("local-decision-1", "decision-1")
                .unwrap_err()
                .code(),
            "local_confirmation_forged"
        );
        let fence = confirm_l3_once(
            "approval-1",
            &DigestRef {
                algorithm: "sha-256".into(),
                canonicalization: "jcs/1".into(),
                value: "a".repeat(64),
            },
            Some(true),
        )
        .unwrap();
        assert!(fence.confirmation_ref.starts_with("l3c-"));
        assert_independent_confirmation(&fence.confirmation_ref, "decision-1").unwrap();
    }
}
