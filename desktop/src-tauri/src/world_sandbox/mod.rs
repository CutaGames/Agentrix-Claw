//! World Creation v6 — L2 WASM sandbox + Tier_C window isolation (task 5.2).
//!
//! Implements the desktop (Rust/Tauri) half of the Capability_Sandbox L2 layer
//! for the AI World Creation Platform:
//!
//!   - [`wasm_runtime`]    — a hardened `wasmtime` engine that runs a Tier_C
//!                           logic module's `compute.run` entry with **no host
//!                           syscalls** and watchdog hooks (fuel/epoch).
//!   - [`capability_guard`]— deny-by-default authorization: a module may only
//!                           use capabilities it declared and that are on the
//!                           World_API whitelist (R5.1/5.2/5.6).
//!   - [`isolated_window`] — runs high-risk / Tier_C experiences in a separate
//!                           Tauri WebView window, isolated from the map (R6.4).
//!
//! The flow for [`compute_run`]:
//!   1. authorize the module declared `compute.run` (deny-by-default);
//!   2. compile the untrusted WASM (validates structure);
//!   3. run `entry` over JSON input under a fuel budget;
//!   4. return JSON output (the *intents*) to the host, which later applies
//!      them through `scene.*` / `ui.*` under the same capability gate.
//!
//! The Tauri commands at the bottom expose this to the desktop front-end.

pub mod capability_guard;
pub mod isolated_window;
pub mod wasm_runtime;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use capability_guard::DenyReason;
use wasm_runtime::WasmModule;

/// The single capability gating L2 execution (R5.6). A logic module must
/// declare this to be allowed to run inside the WASM sandbox.
pub const COMPUTE_RUN_CAP: &str = "compute.run";

/// Default fuel budget for one `compute.run` tick. The Resource_Watchdog
/// (task 5.3) refines per-device budgets; this is a safe structural cap so an
/// un-watched tick still cannot loop forever.
pub const DEFAULT_TICK_FUEL: u64 = 1_000_000_000;

/// Errors raised by the L2 WASM sandbox. Carries enough detail for the host to
/// surface a structured `RESOURCE_EXCEEDED` / `CAP_DENIED` style error.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "detail")]
pub enum SandboxError {
    /// The requested capability was denied (not whitelisted / not granted).
    CapDenied(String),
    /// Failed to initialize the wasmtime engine.
    EngineInit(String),
    /// Untrusted bytecode failed to validate/compile.
    ModuleCompile(String),
    /// Instantiation failed — typically the guest imported a host syscall we
    /// deliberately do not provide (deny-by-default at the linker).
    Instantiate(String),
    /// The guest does not conform to the `wsab` ABI (missing export, etc.).
    Abi(String),
    /// Setting the fuel budget failed.
    Fuel(String),
    /// The guest trapped at runtime (fuel/epoch exhaustion, panic, OOB).
    Trap(String),
    /// Input/output JSON (de)serialization failed.
    Codec(String),
}

impl SandboxError {
    /// Stable machine code for the host bridge / audit log.
    pub fn code(&self) -> &'static str {
        match self {
            SandboxError::CapDenied(_) => "CAP_DENIED",
            SandboxError::EngineInit(_) => "ENGINE_INIT",
            SandboxError::ModuleCompile(_) => "MODULE_COMPILE",
            SandboxError::Instantiate(_) => "INSTANTIATE",
            SandboxError::Abi(_) => "ABI",
            SandboxError::Fuel(_) => "FUEL",
            SandboxError::Trap(_) => "TRAP",
            SandboxError::Codec(_) => "CODEC",
        }
    }
}

impl std::fmt::Display for SandboxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let detail = match self {
            SandboxError::CapDenied(d)
            | SandboxError::EngineInit(d)
            | SandboxError::ModuleCompile(d)
            | SandboxError::Instantiate(d)
            | SandboxError::Abi(d)
            | SandboxError::Fuel(d)
            | SandboxError::Trap(d)
            | SandboxError::Codec(d) => d,
        };
        write!(f, "{}: {}", self.code(), detail)
    }
}

impl std::error::Error for SandboxError {}

fn deny_reason_detail(cap: &str, reason: DenyReason) -> SandboxError {
    let msg = match reason {
        DenyReason::NotWhitelisted => {
            format!("capability \"{cap}\" is not in the World_API whitelist")
        }
        DenyReason::NotGranted => {
            format!("capability \"{cap}\" was not granted to this logic module")
        }
    };
    SandboxError::CapDenied(msg)
}

/// A `compute.run` request from the host: which logic module, the entry, the
/// module's declared capabilities (for the deny-by-default gate), the untrusted
/// WASM bytecode, and the JSON input value.
#[derive(Debug, Clone, Deserialize)]
pub struct ComputeRunRequest {
    /// Logic module id (matches `LogicModuleRef.moduleId`).
    pub module_id: String,
    /// Entry function to invoke (e.g. "tick").
    pub entry: String,
    /// Capabilities the module declared (`LogicModuleRef.capabilities`).
    pub capabilities: Vec<String>,
    /// Untrusted WASM bytecode (the reviewed, hash-locked module).
    pub wasm_bytes: Vec<u8>,
    /// JSON input passed to the entry (e.g. `{ dtMs, towers, enemies }`).
    pub input: serde_json::Value,
    /// Optional fuel override; defaults to [`DEFAULT_TICK_FUEL`].
    #[serde(default)]
    pub fuel: Option<u64>,
}

/// A `compute.run` result: the JSON `output` (intents) the host applies.
#[derive(Debug, Clone, Serialize)]
pub struct ComputeRunResponse {
    /// The logic module that produced this output.
    pub module_id: String,
    /// JSON output value (e.g. `{ spawns, transforms, hits, coreHpDelta }`).
    pub output: serde_json::Value,
}

/// Execute `compute.run` for a Tier_C logic module in the L2 WASM sandbox
/// (design §5.1 L2 / §11.2, R5.6, R6.3).
///
/// Deny-by-default: the module must have declared `compute.run`. The guest runs
/// with no host syscalls and a fuel budget; it returns intents only.
pub fn compute_run(req: ComputeRunRequest) -> Result<ComputeRunResponse, SandboxError> {
    // (1) Capability gate — module must have declared `compute.run` (R5.6).
    capability_guard::authorize(COMPUTE_RUN_CAP, &req.capabilities)
        .map_err(|reason| deny_reason_detail(COMPUTE_RUN_CAP, reason))?;

    // (2) Compile untrusted bytecode (structural validation).
    let module = WasmModule::compile(&req.wasm_bytes)?;

    // (3) Serialize input → run entry under fuel budget → read output bytes.
    let input_bytes = serde_json::to_vec(&req.input)
        .map_err(|e| SandboxError::Codec(e.to_string()))?;
    let output_bytes = module.run_entry(&req.entry, &input_bytes, req.fuel)?;

    // (4) Parse the JSON output (the intents the host will apply).
    let output: serde_json::Value = serde_json::from_slice(&output_bytes)
        .map_err(|e| SandboxError::Codec(e.to_string()))?;

    Ok(ComputeRunResponse {
        module_id: req.module_id,
        output,
    })
}

/// Authorize a single intent capability returned by a `compute.run` tick before
/// the host applies it (deny-by-default). The host calls this for each intent's
/// `cap` against the module's declared capabilities.
pub fn authorize_intent(cap: &str, granted: &[String]) -> Result<(), SandboxError> {
    capability_guard::authorize(cap, granted).map_err(|reason| deny_reason_detail(cap, reason))
}

// ============================================================
// Tauri commands (desktop front-end bridge)
// ============================================================

/// `compute.run` in the L2 WASM sandbox (R5.6). Invoked by the desktop sandbox
/// host when a Tier_C experience requests untrusted compute.
#[tauri::command(async)]
pub fn world_sandbox_compute_run(
    request: ComputeRunRequest,
) -> Result<ComputeRunResponse, String> {
    compute_run(request).map_err(|e| e.to_string())
}

/// Open a high-risk / Tier_C experience in a separate WebView window isolated
/// from the map process (R6.4).
#[tauri::command(async)]
pub fn world_sandbox_open_isolated_window(
    app: AppHandle,
    plot_id: String,
) -> Result<String, String> {
    isolated_window::open_isolated_experience(app, &plot_id)
}

/// Close a previously-opened isolated Tier_C experience window.
#[tauri::command(async)]
pub fn world_sandbox_close_isolated_window(
    app: AppHandle,
    plot_id: String,
) -> Result<(), String> {
    isolated_window::close_isolated_experience(app, &plot_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_run_denied_when_capability_not_declared() {
        // Module did NOT declare compute.run → deny-by-default before any WASM.
        let req = ComputeRunRequest {
            module_id: "td_core".into(),
            entry: "tick".into(),
            capabilities: vec!["scene.transform".into()],
            wasm_bytes: vec![0, 97, 115, 109], // never reached
            input: serde_json::json!({}),
            fuel: None,
        };
        let err = compute_run(req).unwrap_err();
        assert_eq!(err.code(), "CAP_DENIED");
    }

    #[test]
    fn authorize_intent_blocks_undeclared_cap() {
        let granted = vec!["compute.run".to_string(), "scene.transform".to_string()];
        assert!(authorize_intent("scene.transform", &granted).is_ok());
        let err = authorize_intent("economy.requestCharge", &granted).unwrap_err();
        assert_eq!(err.code(), "CAP_DENIED");
    }

    #[test]
    fn isolated_label_is_distinct_from_map() {
        assert_ne!(
            isolated_window::isolated_label("plot_8842"),
            isolated_window::MAP_WINDOW_LABEL
        );
    }
}
