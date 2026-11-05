// ClawCore Desktop Bridge SDK — interface skeleton (Phase 5 HW-10.6).
//
// Source-of-truth contract: shared/clawcore/v1/bridge.ts
//
// Real implementation will be a Rust crate exposed to the Tauri app via
// `#[tauri::command]` wrappers. This file freezes the trait so the desktop
// team and partner integrations can plan against a stable surface.

use std::pin::Pin;
use std::future::Future;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PairResult {
    pub device_id: String,
    pub dst: String,
    pub device_class: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScanHit {
    pub device_id: String,
    pub rssi: i32,
    pub adv_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BridgeEvent {
    Connected { device_id: String },
    Disconnected { device_id: String, reason: Option<String> },
    PetStateFrame { raw_json: String },
    PetEventFrame { raw_json: String },
    ApprovalRequestFrame { raw_json: String },
    OtaProgress { device_id: String, index: u32, total: u32 },
    Error { device_id: Option<String>, code: String, message: String },
}

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait ClawCoreBridge: Send + Sync {
    fn init<'a>(&'a self, api_base: &'a str, mqtt_host: &'a str, mqtt_port: u16)
        -> BoxFuture<'a, Result<(), String>>;
    fn scan<'a>(&'a self, timeout_ms: u64) -> BoxFuture<'a, Result<Vec<ScanHit>, String>>;
    fn pair<'a>(&'a self, ticket: &'a str, device_id: &'a str)
        -> BoxFuture<'a, Result<PairResult, String>>;
    fn connect<'a>(&'a self, device_id: &'a str, dst: &'a str) -> BoxFuture<'a, Result<(), String>>;
    fn disconnect<'a>(&'a self, device_id: &'a str) -> BoxFuture<'a, Result<(), String>>;
    fn send_approval_response<'a>(&'a self, frame_json: &'a str) -> BoxFuture<'a, Result<(), String>>;
    fn send_event<'a>(&'a self, frame_json: &'a str) -> BoxFuture<'a, Result<(), String>>;
    fn begin_ota<'a>(&'a self, device_id: &'a str)
        -> BoxFuture<'a, Result<(String /*package_id*/, String /*version*/), String>>;
    /// Subscribe — events delivered via Tauri event bus to JS side.
    fn subscribe<'a>(&'a self, callback: Box<dyn Fn(BridgeEvent) + Send + Sync>)
        -> BoxFuture<'a, Result<u32 /*subscription_id*/, String>>;
}

/// Error codes — must match shared/clawcore/v1/bridge.ts BridgeErrorCodes.
pub mod codes {
    pub const NOT_INITIALISED: &str = "BRIDGE_NOT_INITIALISED";
    pub const TRANSPORT_UNAVAILABLE: &str = "BRIDGE_TRANSPORT_UNAVAILABLE";
    pub const PAIR_TICKET_INVALID: &str = "BRIDGE_PAIR_TICKET_INVALID";
    pub const AUTH_REJECTED: &str = "BRIDGE_AUTH_REJECTED";
    pub const REPLAY_DETECTED: &str = "BRIDGE_REPLAY_DETECTED";
    pub const OTA_INTEGRITY_FAIL: &str = "BRIDGE_OTA_INTEGRITY_FAIL";
    pub const OTA_RESUMED: &str = "BRIDGE_OTA_RESUMED";
    pub const TIMEOUT: &str = "BRIDGE_TIMEOUT";
}
