//! Rust-owned background loop. WebView never drives claim/adapter lifecycle.

use crate::developer_runtime::error::RuntimeResult;
use crate::developer_runtime::host::RuntimeHost;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

pub fn start(host: Arc<Mutex<RuntimeHost>>) {
    thread::Builder::new()
        .name("developer-runtime-loop".into())
        .spawn(move || {
            let mut backoff_ms = 1_000u64;
            loop {
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
