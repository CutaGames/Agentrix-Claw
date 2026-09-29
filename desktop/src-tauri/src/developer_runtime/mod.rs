//! Developer Runtime Host.
//!
//! Default-off Tauri trust boundary: outbound HTTPS channel, verified binding
//! bootstrap, encrypted journal, locked `agent acp` process host, and
//! presentation-only WebView projections.

mod approval;
mod binding;
mod channel;
mod confirmation;
pub mod commands;
mod crypto;
mod error;
mod host;
mod jcs;
mod journal;
mod payload;
mod policy;
mod process;
mod runtime_loop;
mod types;
mod workspace_trust;

#[cfg(test)]
mod harness;

pub use host::DeveloperRuntimeState;
