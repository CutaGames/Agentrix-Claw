//! Tauri invoke surface. WebView only gets presentation / bootstrap / query.

use crate::developer_runtime::host::DeveloperRuntimeState;
use crate::developer_runtime::policy::presentation_strip;
use crate::developer_runtime::types::{BindingBootstrap, RuntimePresentation};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

fn journal_path(app: &AppHandle) -> Result<PathBuf, crate::developer_runtime::error::RuntimeError> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| {
            crate::developer_runtime::error::RuntimeError::fail_closed("app_data_dir_unavailable")
        })?
        .join("developer_runtime")
        .join("journal.sqlite"))
}

fn with_host<F>(state: &DeveloperRuntimeState, enabled_gate: bool, op: F) -> RuntimePresentation
where
    F: FnOnce(
        &mut crate::developer_runtime::host::RuntimeHost,
    ) -> Result<Value, crate::developer_runtime::error::RuntimeError>,
{
    let mut host = match state.inner.lock() {
        Ok(guard) => guard,
        Err(_) => return RuntimePresentation::fail_closed("runtime_lock", false),
    };
    if enabled_gate {
        host.enable_from_flags();
    }
    let result = op(&mut host);
    host.presentation(result)
}

/// Desktop D2 — while the emergency stop is engaged, nothing may (re)bind the
/// runtime or widen its workspace trust. Read, query, cancel and revoke stay
/// available. `engaged` is a parameter so the gate is testable without the
/// process-wide switch.
fn refuse_while_stopped(engaged: bool) -> Option<RuntimePresentation> {
    engaged.then(|| RuntimePresentation::fail_closed("kill_switch_engaged", false))
}

#[tauri::command]
pub fn developer_runtime_presentation(
    state: State<'_, DeveloperRuntimeState>,
) -> RuntimePresentation {
    with_host(&state, true, |host| Ok(presentation_strip(host.status_payload())))
}

#[tauri::command]
pub fn developer_runtime_bootstrap(
    app: AppHandle,
    state: State<'_, DeveloperRuntimeState>,
    bootstrap: BindingBootstrap,
) -> RuntimePresentation {
    if let Some(refused) = refuse_while_stopped(crate::kill_switch::is_engaged()) {
        return refused;
    }
    let shown = match journal_path(&app) {
        Ok(path) => with_host(&state, true, |host| host.bootstrap(&bootstrap.bootstrap_ref, path)),
        Err(error) => RuntimePresentation::fail_closed(&error.reason_code, false),
    };
    if shown.outcome == "ok" {
        state.start_loop();
    }
    shown
}

#[tauri::command]
pub fn developer_runtime_refresh(
    app: AppHandle,
    state: State<'_, DeveloperRuntimeState>,
    bootstrap: BindingBootstrap,
) -> RuntimePresentation {
    if let Some(refused) = refuse_while_stopped(crate::kill_switch::is_engaged()) {
        return refused;
    }
    let shown = match journal_path(&app) {
        Ok(path) => with_host(&state, true, |host| host.refresh(&bootstrap.bootstrap_ref, path)),
        Err(error) => RuntimePresentation::fail_closed(&error.reason_code, false),
    };
    if shown.outcome == "ok" {
        state.start_loop();
    }
    shown
}

#[tauri::command]
pub fn developer_runtime_events(
    state: State<'_, DeveloperRuntimeState>,
    instruction_ref: String,
) -> RuntimePresentation {
    with_host(&state, true, |host| host.events(&instruction_ref))
}

#[tauri::command]
pub fn developer_runtime_query(
    state: State<'_, DeveloperRuntimeState>,
    instruction_ref: String,
) -> RuntimePresentation {
    with_host(&state, true, |host| host.query(&instruction_ref))
}

#[tauri::command]
pub fn developer_runtime_cancel(
    state: State<'_, DeveloperRuntimeState>,
    instruction_ref: String,
) -> RuntimePresentation {
    with_host(&state, true, |host| host.cancel(&instruction_ref))
}

#[tauri::command]
pub fn developer_runtime_revoke(state: State<'_, DeveloperRuntimeState>) -> RuntimePresentation {
    with_host(&state, false, |host| {
        let rows = host.revoke()?;
        Ok(json!({ "revoked": true, "inFlight": rows.len(), "queryFirst": true }))
    })
}

#[tauri::command]
pub fn developer_runtime_probe_vendor(
    state: State<'_, DeveloperRuntimeState>,
) -> RuntimePresentation {
    with_host(&state, true, |host| {
        serde_json::to_value(host.probe_vendor()).map_err(|_| {
            crate::developer_runtime::error::RuntimeError::fail_closed("unknown_schema")
        })
    })
}

#[tauri::command]
pub fn developer_runtime_trust_selected_workspace(
    app: AppHandle,
    state: State<'_, DeveloperRuntimeState>,
) -> RuntimePresentation {
    if let Some(refused) = refuse_while_stopped(crate::kill_switch::is_engaged()) {
        return refused;
    }
    let picked = pick_runtime_workspace(&app);
    match picked {
        Ok(Some(path)) => with_host(&state, true, |host| host.trust_workspace_path(path)),
        Ok(None) => RuntimePresentation::fail_closed("workspace_trust_missing", false),
        Err(error) => RuntimePresentation::fail_closed(&error, false),
    }
}

fn pick_runtime_workspace(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = rfd::FileDialog::new()
            .set_title("Select trusted workspace")
            .pick_folder();
        let _ = tx.send(result);
    })
    .map_err(|error| error.to_string())?;
    rx.recv().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::refuse_while_stopped;

    #[test]
    fn emergency_stop_refuses_bind_and_trust() {
        let refused = refuse_while_stopped(true).expect("must refuse while engaged");
        assert_eq!(refused.outcome, "fail_closed");
        assert_eq!(refused.reason_code.as_deref(), Some("kill_switch_engaged"));
        assert!(!refused.enabled);
        assert!(refuse_while_stopped(false).is_none());
    }
}
