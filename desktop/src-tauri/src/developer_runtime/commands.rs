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

// ── E32: bind this computer (REQ-desktop-018, shared/types/device-runtime-binding.ts) ──
//
// The WebView hands over the owner's JWT once, for `developer_runtime_enroll`;
// Rust uses it for steps 1–4 and drops it. Device key, DST and runtime
// credential stay in the keychain. Every command here is a local-user action
// from "这台电脑": none is in the execution fence, no chat tool or remote
// channel maps to them.

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrollRequest {
    user_jwt: String,
    agent_account_id: String,
    label: String,
}

impl Drop for EnrollRequest {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.user_jwt.zeroize();
    }
}

fn enroll_blocking(
    inner: std::sync::Arc<std::sync::Mutex<crate::developer_runtime::host::RuntimeHost>>,
    request: EnrollRequest,
    workspace: Option<PathBuf>,
    journal: Result<PathBuf, crate::developer_runtime::error::RuntimeError>,
) -> Result<(Value, bool), crate::developer_runtime::error::RuntimeError> {
    use crate::developer_runtime::channel::ReqwestTransport;
    use crate::developer_runtime::crypto::OsKeyringStore;
    use crate::developer_runtime::device_identity::{load_or_create_runtime_id, DeviceIdentity};
    use crate::developer_runtime::enrollment;
    use crate::developer_runtime::types::now_iso;

    let store = OsKeyringStore;
    let identity = DeviceIdentity::load_or_create(&store)?;
    let runtime_id = load_or_create_runtime_id(&store)?;
    let label = enrollment::clean_label(&request.label);
    let policy = crate::developer_runtime::policy::TrustPolicy::default();
    let transport = ReqwestTransport;
    let api = enrollment::production_api(&transport, &policy);
    enrollment::enroll_after_probe(
        &api,
        &store,
        &identity,
        &enrollment::EnrollmentInput {
            user_jwt: &request.user_jwt,
            agent_account_id: &request.agent_account_id,
            label: &label,
            runtime_id: &runtime_id,
            binding_ttl_seconds: None,
        },
        &now_iso(),
    )?;
    drop(request);

    let mut bootstrapped = false;
    let mut runtime = json!({ "outcome": "skipped", "reasonCode": "runtime_default_off" });
    if let Some(path) = workspace {
        crate::developer_runtime::workspace_trust::record_rust_owned_selection(&path)?;
        let canonical = path.canonicalize().map_err(|_| {
            crate::developer_runtime::error::RuntimeError::fail_closed("workspace_untrusted")
        })?;
        let issued = enrollment::presence_and_bootstrap(
            &api,
            &store,
            &identity,
            &runtime_id,
            &label,
            &enrollment::PickedWorkspace { path: canonical.clone() },
            &now_iso(),
        )?;
        let mut host = inner
            .lock()
            .map_err(|_| crate::developer_runtime::error::RuntimeError::fail_closed("runtime_lock"))?;
        host.reload_channel_credential();
        host.bootstrap(&issued.bootstrap_ref, journal?)?;
        host.trust_workspace_path(canonical)?;
        bootstrapped = true;
        runtime = json!({ "outcome": "ok", "machineRef": issued.machine_ref, "workspaceRef": issued.workspace_ref });
    }
    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut status = enrollment::status_json(&store, Some(identity.device_id()), now_ms);
    status["runtime"] = runtime;
    Ok((status, bootstrapped))
}

/// `code` or `code:SERVER_CODE` (the server code only when it adds something).
fn error_text(error: &crate::developer_runtime::error::RuntimeError) -> String {
    if error.message.is_empty() || error.message == error.reason_code {
        error.code().to_string()
    } else {
        format!("{}:{}", error.code(), error.message)
    }
}

/// 本人点"绑定这台电脑"：配对、登记签名凭据、建绑定、签发运行时凭据；开发者运行时打开时
/// （Gate B 开关）再让本人选一个工作区，在线登记并完成 bootstrap。
#[tauri::command(async)]
pub async fn developer_runtime_enroll(
    app: AppHandle,
    state: State<'_, DeveloperRuntimeState>,
    request: EnrollRequest,
) -> Result<Value, String> {
    if crate::kill_switch::is_engaged() {
        return Err("kill_switch_engaged".into());
    }
    let workspace = if crate::developer_runtime::types::runtime_opt_in() {
        let app_for_pick = app.clone();
        tauri::async_runtime::spawn_blocking(move || pick_runtime_workspace(&app_for_pick))
            .await
            .map_err(|_| "workspace_pick_failed".to_string())??
    } else {
        None
    };
    let inner = state.inner.clone();
    let journal = journal_path(&app);
    let (status, bootstrapped) =
        tauri::async_runtime::spawn_blocking(move || enroll_blocking(inner, request, workspace, journal))
            .await
            .map_err(|_| "enroll_failed".to_string())?
            .map_err(|error| error_text(&error))?;
    if bootstrapped {
        state.start_loop();
    }
    Ok(status)
}

/// 绑定状态（界面用）：设备 id、是否已绑定、到期时间。不含任何秘密。
#[tauri::command(async)]
pub async fn developer_runtime_enrollment_status(state: State<'_, DeveloperRuntimeState>) -> Result<Value, String> {
    let connected = state.inner.lock().map(|host| host.is_bootstrapped()).unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::crypto::OsKeyringStore;
        let store = OsKeyringStore;
        let identity = crate::developer_runtime::device_identity::DeviceIdentity::load(&store)
            .map_err(|error| error_text(&error))?;
        let device_id = identity.as_ref().map(|i| i.device_id().to_string());
        let mut status = crate::developer_runtime::enrollment::status_json(
            &store,
            device_id.as_deref(),
            chrono::Utc::now().timestamp_millis(),
        );
        status["runtimeConnected"] = serde_json::json!(connected);
        Ok(status)
    })
    .await
    .map_err(|_| "status_failed".to_string())?
}

/// 急停回执的设备签名（REQ-desktop-010）。急停拉着时也能签：回执就是为急停留的。
/// 只签固定格式、先校验过的事件，服务端只记录、不据此做任何事。
#[tauri::command(async)]
pub async fn developer_runtime_sign_safety_event(event: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::crypto::OsKeyringStore;
        use crate::developer_runtime::device_identity::DeviceIdentity;
        let store = OsKeyringStore;
        let identity = DeviceIdentity::load(&store)
            .map_err(|error| error_text(&error))?
            .ok_or_else(|| "not_enrolled".to_string())?;
        crate::developer_runtime::enrollment::safety_event_request(
            &store,
            &identity,
            &event,
            &crate::developer_runtime::types::now_iso(),
        )
        .map_err(|error| error_text(&error))
    })
    .await
    .map_err(|_| "sign_failed".to_string())?
}
/// 审批的本机确认（审批卡合同 v1）：Rust 在主线程弹原生确认框，本人点确定后用设备密钥签。
/// 急停拉下时、这台电脑还没绑定时都拒绝。
#[tauri::command(async)]
pub async fn developer_runtime_sign_approval(
    app: AppHandle,
    request: crate::developer_runtime::device_identity::ApprovalConfirmationRequest,
) -> Result<crate::developer_runtime::device_identity::ApprovalLocalConfirmation, String> {
    if crate::kill_switch::is_engaged() {
        return Err("kill_switch_engaged".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::crypto::OsKeyringStore;
        use crate::developer_runtime::device_identity::{
            confirm_and_sign_approval_with, show_native_approval_dialog, ApprovalDialogText, DeviceIdentity,
        };
        let store = OsKeyringStore;
        let identity = DeviceIdentity::load(&store)
            .map_err(|error| error_text(&error))?
            .ok_or_else(|| "not_enrolled".to_string())?;
        let status = crate::developer_runtime::enrollment::status_json(
            &store,
            Some(identity.device_id()),
            chrono::Utc::now().timestamp_millis(),
        );
        if status["bound"] != json!(true) {
            return Err("not_enrolled".to_string());
        }
        let present = |text: &ApprovalDialogText| -> bool {
            let (tx, rx) = std::sync::mpsc::channel();
            let shown = text.clone();
            if app
                .run_on_main_thread(move || {
                    let _ = tx.send(show_native_approval_dialog(&shown));
                })
                .is_err()
            {
                return false;
            }
            rx.recv().unwrap_or(false)
        };
        confirm_and_sign_approval_with(&identity, &request, &present).map_err(|error| error_text(&error))
    })
    .await
    .map_err(|_| "sign_failed".to_string())?
}

/// 退出登录：吊销这台电脑的运行时凭据，删掉本机 token（设备密钥和绑定记录保留）。
#[tauri::command(async)]
pub async fn developer_runtime_unenroll() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use crate::developer_runtime::channel::ReqwestTransport;
        use crate::developer_runtime::crypto::OsKeyringStore;
        let store = OsKeyringStore;
        let Some(identity) = crate::developer_runtime::device_identity::DeviceIdentity::load(&store)
            .map_err(|error| error_text(&error))?
        else {
            return Ok(json!({ "revoked": false, "serverConfirmed": false }));
        };
        let policy = crate::developer_runtime::policy::TrustPolicy::default();
        let transport = ReqwestTransport;
        let api = crate::developer_runtime::enrollment::production_api(&transport, &policy);
        let confirmed = crate::developer_runtime::enrollment::revoke_local_credential(&api, &store, &identity)
            .map_err(|error| error_text(&error))?;
        Ok(json!({ "revoked": true, "serverConfirmed": confirmed }))
    })
    .await
    .map_err(|_| "unenroll_failed".to_string())?
}

// ── D5 slice 2: the computer drafts the delivery (order contract v0.11, REQ-backend-060) ──
//
// Only read-one-order and write-the-draft, with the runtime credential from the
// keychain (the WebView never sees it). Delivering stays on the owner's sign-in
// in the order desk. Both refuse under the emergency stop. Not in the execution
// fence: no chat tool or remote channel maps to them.

fn order_draft_ledger(app: &AppHandle) -> Result<crate::developer_runtime::order_runtime::DraftLedger, String> {
    use crate::developer_runtime::order_runtime::DraftLedger;
    let dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?;
    Ok(DraftLedger::at(
        dir.join("developer_runtime")
            .join(DraftLedger::file_name(crate::developer_runtime::api_target_name())),
    ))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderDraftRequest {
    order_id: String,
    expected_version: u64,
    answer_text: String,
}

/// Without the developer runtime loop (the default), nothing refreshes the
/// runtime credential in the background: refresh it here when it is due. When
/// the loop runs it owns refreshing, so this stays out of its way (two refreshes
/// with the same old token would get one of them refused and the token dropped).
fn refresh_credential_before_use(
    api: &crate::developer_runtime::enrollment::Api<'_>,
    store: &crate::developer_runtime::crypto::OsKeyringStore,
    loop_owns_refresh: bool,
) {
    if loop_owns_refresh {
        return;
    }
    let Ok(Some(identity)) = crate::developer_runtime::device_identity::DeviceIdentity::load(store) else {
        return;
    };
    let Ok(runtime_id) = crate::developer_runtime::device_identity::load_or_create_runtime_id(store) else {
        return;
    };
    let _ = crate::developer_runtime::enrollment::refresh_if_due(
        api,
        store,
        &identity,
        &runtime_id,
        &crate::developer_runtime::types::now_iso(),
    );
}

fn loop_owns_refresh(state: &DeveloperRuntimeState) -> bool {
    state.inner.lock().map(|host| host.is_bootstrapped()).unwrap_or(true)
}

/// 读一张单（卖方视图），给"让电脑先备一份"拿最新的 `version` 和买方的问题。
#[tauri::command(async)]
pub async fn developer_runtime_order_get(state: State<'_, DeveloperRuntimeState>, order_id: String) -> Result<Value, String> {
    if crate::kill_switch::is_engaged() {
        return Err("kill_switch_engaged".into());
    }
    let loop_owns = loop_owns_refresh(&state);
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::channel::ReqwestTransport;
        use crate::developer_runtime::crypto::OsKeyringStore;
        let policy = crate::developer_runtime::policy::TrustPolicy::default();
        let transport = ReqwestTransport;
        let api = crate::developer_runtime::enrollment::production_api(&transport, &policy);
        refresh_credential_before_use(&api, &OsKeyringStore, loop_owns);
        crate::developer_runtime::order_runtime::get_order(
            &api,
            &OsKeyringStore,
            &order_id,
            chrono::Utc::now().timestamp_millis(),
            crate::kill_switch::is_engaged(),
        )
        .map_err(|error| error_text(&error))
    })
    .await
    .map_err(|_| "order_get_failed".to_string())?
}

/// 列出这台电脑绑定的那只 Agent 的单（卖方视图，最多 50 条，新的在前）。只给 D5 后台起草用：
/// `desktop-sync/state` 的 `orderDrafts` 说有新付款的单时才调（REQ-desktop-047）。急停时不发请求。
#[tauri::command(async)]
pub async fn developer_runtime_order_list(state: State<'_, DeveloperRuntimeState>) -> Result<Value, String> {
    if crate::kill_switch::is_engaged() {
        return Err("kill_switch_engaged".into());
    }
    let loop_owns = loop_owns_refresh(&state);
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::channel::ReqwestTransport;
        use crate::developer_runtime::crypto::OsKeyringStore;
        let policy = crate::developer_runtime::policy::TrustPolicy::default();
        let transport = ReqwestTransport;
        let api = crate::developer_runtime::enrollment::production_api(&transport, &policy);
        refresh_credential_before_use(&api, &OsKeyringStore, loop_owns);
        crate::developer_runtime::order_runtime::list_orders(
            &api,
            &OsKeyringStore,
            chrono::Utc::now().timestamp_millis(),
            crate::kill_switch::is_engaged(),
        )
        .map(|items| json!({ "items": items }))
        .map_err(|error| error_text(&error))
    })
    .await
    .map_err(|_| "order_list_failed".to_string())?
}

/// 用运行时凭据写交付草稿，记进"本机备过的草稿"。只写草稿：交付仍要本人在交付台上看过。
#[tauri::command(async)]
pub async fn developer_runtime_order_put_draft(
    app: AppHandle,
    state: State<'_, DeveloperRuntimeState>,
    request: OrderDraftRequest,
) -> Result<Value, String> {
    if crate::kill_switch::is_engaged() {
        return Err("kill_switch_engaged".into());
    }
    let ledger = order_draft_ledger(&app)?;
    let loop_owns = loop_owns_refresh(&state);
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::channel::ReqwestTransport;
        use crate::developer_runtime::crypto::OsKeyringStore;
        use crate::developer_runtime::order_runtime::{put_draft, DraftInput};
        let policy = crate::developer_runtime::policy::TrustPolicy::default();
        let transport = ReqwestTransport;
        let api = crate::developer_runtime::enrollment::production_api(&transport, &policy);
        refresh_credential_before_use(&api, &OsKeyringStore, loop_owns);
        let outcome = put_draft(
            &api,
            &OsKeyringStore,
            &ledger,
            &DraftInput {
                order_id: &request.order_id,
                expected_version: request.expected_version,
                answer_text: &request.answer_text,
            },
            chrono::Utc::now().timestamp_millis(),
            &crate::developer_runtime::types::now_iso(),
            crate::kill_switch::is_engaged(),
        )
        .map_err(|error| error_text(&error))?;
        serde_json::to_value(outcome).map_err(|_| "order_draft_failed".to_string())
    })
    .await
    .map_err(|_| "order_draft_failed".to_string())?
}

/// "本机备过的草稿"（orderId、version、摘要，没有正文），交付台据此标"这份是电脑备的"。
#[tauri::command(async)]
pub async fn developer_runtime_order_draft_marks(app: AppHandle) -> Result<Value, String> {
    let ledger = order_draft_ledger(&app)?;
    tauri::async_runtime::spawn_blocking(move || json!({ "marks": ledger.marks() }))
        .await
        .map_err(|_| "order_marks_failed".to_string())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenewCredentialRequest {
    user_jwt: String,
}

impl Drop for RenewCredentialRequest {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.user_jwt.zeroize();
    }
}

/// 绑定还有效、运行时凭据过期了：本人在交付台点"让电脑先备一份"时交一次登录 JWT，
/// Rust 只重做第 4 步（沿用绑定和签名凭据），用完就丢。凭据还有效就什么都不发。
#[tauri::command(async)]
pub async fn developer_runtime_order_renew_credential(request: RenewCredentialRequest) -> Result<Value, String> {
    if crate::kill_switch::is_engaged() {
        return Err("kill_switch_engaged".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::channel::ReqwestTransport;
        use crate::developer_runtime::crypto::OsKeyringStore;
        use crate::developer_runtime::device_identity::{load_or_create_runtime_id, DeviceIdentity};
        let store = OsKeyringStore;
        let identity = DeviceIdentity::load(&store)
            .map_err(|error| error_text(&error))?
            .ok_or_else(|| "not_enrolled".to_string())?;
        let runtime_id = load_or_create_runtime_id(&store).map_err(|error| error_text(&error))?;
        let policy = crate::developer_runtime::policy::TrustPolicy::default();
        let transport = ReqwestTransport;
        let api = crate::developer_runtime::enrollment::production_api(&transport, &policy);
        crate::developer_runtime::enrollment::reissue_credential(
            &api,
            &store,
            &identity,
            &request.user_jwt,
            &runtime_id,
            &crate::developer_runtime::types::now_iso(),
        )
        .map_err(|error| error_text(&error))?;
        drop(request);
        Ok(crate::developer_runtime::enrollment::status_json(
            &store,
            Some(identity.device_id()),
            chrono::Utc::now().timestamp_millis(),
        ))
    })
    .await
    .map_err(|_| "renew_failed".to_string())?
}

/// L5 B2: sign this computer's capability declaration with the device key (the key never leaves Rust). Not blocked by
/// the emergency stop, so a stopped computer can still report its capability as busy.
#[tauri::command]
pub async fn sign_device_capability_declaration(declaration: serde_json::Value) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::crypto::OsKeyringStore;
        use crate::developer_runtime::device_identity::DeviceIdentity;
        let store = OsKeyringStore;
        let identity = DeviceIdentity::load(&store)
            .map_err(|error| error_text(&error))?
            .ok_or_else(|| "not_enrolled".to_string())?;
        let signed = identity.sign_capability_declaration(&declaration).map_err(|error| error_text(&error))?;
        serde_json::to_value(signed).map_err(|_| "sign_failed".to_string())
    })
    .await
    .map_err(|_| "sign_failed".to_string())?
}

/// L5 B4: whether this computer takes rented jobs now, and the device that signs their receipts. Ready means
/// enrolled, rental on with intact rules, emergency stop released, and the pinned runtime and model still match.
#[tauri::command]
pub async fn desktop_bridge_rental_jobs_status(app: AppHandle) -> Result<Value, String> {
    let rules_file = crate::rental_rules_file(&app)?;
    let inference_file = crate::rental_inference_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::crypto::OsKeyringStore;
        use crate::developer_runtime::device_identity::DeviceIdentity;
        let device_id = DeviceIdentity::load(&OsKeyringStore).ok().flatten().map(|identity| identity.device_id().to_string());
        let (stored, integrity) = crate::rental_rules::load(&rules_file, &crate::node_allowlist::KeychainAllowlistKey);
        let reason = if device_id.is_none() {
            "not_enrolled"
        } else if crate::kill_switch::is_engaged() {
            "kill_switch_engaged"
        } else if !stored.enabled || integrity != crate::rental_rules::Integrity::Ok {
            "rental_off"
        } else if !crate::rental_jobs::load_config(&inference_file).map(|config| crate::rental_jobs::config_ready(&config)).unwrap_or(false) {
            "inference_not_configured"
        } else {
            "ready"
        };
        Ok(json!({ "ready": reason == "ready", "deviceId": device_id, "reason": reason }))
    })
    .await
    .map_err(|_| "rental_status_failed".to_string())?
}

/// L5 B4: runs one rented job the WebView fetched for this computer and returns the receipt signed by the device
/// key (`rental_jobs::execute_job`). A job that cannot run still gets a failed receipt, so the buyer is refunded.
#[tauri::command]
pub async fn desktop_bridge_rental_run_job(app: AppHandle, job: crate::rental_jobs::JobInput) -> Result<crate::rental_jobs::SignedReceipt, String> {
    let rules_file = crate::rental_rules_file(&app)?;
    let inference_file = crate::rental_inference_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        use crate::developer_runtime::crypto::OsKeyringStore;
        use crate::developer_runtime::device_identity::DeviceIdentity;
        use crate::rental_inference::{self, TaskOutcome};
        let identity = DeviceIdentity::load(&OsKeyringStore)
            .map_err(|error| error_text(&error))?
            .ok_or_else(|| "not_enrolled".to_string())?;
        let (stored, integrity) = crate::rental_rules::load(&rules_file, &crate::node_allowlist::KeychainAllowlistKey);
        let rental_on = stored.enabled && integrity == crate::rental_rules::Integrity::Ok;
        let config = crate::rental_jobs::load_config(&inference_file);
        let limits = rental_inference::Limits::default();
        let engaged = || crate::kill_switch::is_engaged();
        let run_task = |prompt: &[u8]| -> Result<TaskOutcome, &'static str> {
            let config = config.as_ref().ok_or("inference_not_configured")?;
            rental_inference::run_task(&config.runtime, &config.model, prompt, &limits, false, &engaged)
        };
        let run: Option<&dyn Fn(&[u8]) -> Result<TaskOutcome, &'static str>> = if config.is_some() { Some(&run_task) } else { None };
        let finished_at = || chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let receipt = crate::rental_jobs::execute_job(&job, rental_on, &engaged, run, &finished_at).map_err(str::to_string)?;
        let signature = identity
            .sign_rental_receipt(&receipt.job_ref, &receipt.result_digest, receipt.units_used, &receipt.finished_at)
            .map_err(|error| error_text(&error))?;
        Ok(crate::rental_jobs::SignedReceipt { receipt, signature })
    })
    .await
    .map_err(|_| "rental_job_failed".to_string())?
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
