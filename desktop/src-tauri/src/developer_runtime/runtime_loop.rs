//! Rust-owned background loop. WebView never drives claim/adapter lifecycle.

use crate::developer_runtime::error::RuntimeResult;
use crate::developer_runtime::host::RuntimeHost;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// E32: how often the loop looks at the runtime credential's `refreshAfter`
/// (tokens live 30 minutes and can be refreshed after 20).
const CREDENTIAL_CHECK_EVERY: Duration = Duration::from_secs(60);

/// Refresh the runtime credential when it is due, then hand the new token to
/// the host. Outside the host lock: it is one HTTPS call.
fn refresh_credential_if_due(host: &Arc<Mutex<RuntimeHost>>) {
    use crate::developer_runtime::channel::ReqwestTransport;
    use crate::developer_runtime::crypto::OsKeyringStore;
    use crate::developer_runtime::device_identity::DeviceIdentity;
    let store = OsKeyringStore;
    let Ok(Some(identity)) = DeviceIdentity::load(&store) else {
        return;
    };
    let Ok(runtime_id) = crate::developer_runtime::device_identity::load_or_create_runtime_id(&store) else {
        return;
    };
    let policy = crate::developer_runtime::policy::TrustPolicy::default();
    let transport = ReqwestTransport;
    let api = crate::developer_runtime::enrollment::production_api(&transport, &policy);
    let now = crate::developer_runtime::types::now_iso();
    if let Ok(true) = crate::developer_runtime::enrollment::refresh_if_due(&api, &store, &identity, &runtime_id, &now) {
        if let Ok(mut guard) = host.lock() {
            guard.reload_channel_credential();
        }
    }
}

pub fn start(host: Arc<Mutex<RuntimeHost>>) {
    thread::Builder::new()
        .name("developer-runtime-loop".into())
        .spawn(move || {
            let mut backoff_ms = 1_000u64;
            let mut last_credential_check: Option<std::time::Instant> = None;
            loop {
                if last_credential_check.map(|at| at.elapsed() >= CREDENTIAL_CHECK_EVERY).unwrap_or(true)
                    && !crate::kill_switch::is_engaged()
                {
                    last_credential_check = Some(std::time::Instant::now());
                    refresh_credential_if_due(&host);
                }
                let tick = {
                    let mut guard = match host.lock() {
                        Ok(guard) => guard,
                        Err(_) => break,
                    };
                    // Desktop D2: the emergency stop also ends the loop even
                    // before the detached revoke has taken the lock.
                    if guard.should_stop_loop() || crate::kill_switch::is_engaged() {
                        break;
                    }
                    guard.drive_once()
                };
                match tick {
                    Ok(()) => {
                        backoff_ms = 1_000;
                        thread::sleep(Duration::from_millis(
                            crate::developer_runtime::types::HEARTBEAT_INTERVAL_MS,
                        ));
                    }
                    Err(_) => {
                        if let Ok(mut guard) = host.lock() {
                            let _ = guard.recover_query_first();
                        }
                        thread::sleep(Duration::from_millis(backoff_ms));
                        backoff_ms = (backoff_ms * 2).min(30_000);
                    }
                }
            }
        })
        .ok();
}

pub fn offers_from_list(data: &Value) -> Vec<Value> {
    data.get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

pub fn drive_offers(host: &mut RuntimeHost, items: Vec<Value>) -> RuntimeResult<()> {
    for item in items {
        if host.should_stop_loop() {
            break;
        }
        let _ = host.claim_offer(item);
    }
    Ok(())
}
