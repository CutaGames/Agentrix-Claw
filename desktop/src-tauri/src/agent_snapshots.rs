//! Desktop D3 slice 5 — "undo" for edits made by other AIs (Claude Code, Cursor).
//!
//! Claude Code runs a PreToolUse hook before `Write` / `Edit` / `MultiEdit` /
//! `NotebookEdit`. Agentrix registers this binary as that hook
//! (`'<exe>' --agentrix-claude-snapshot '<store>'`, see `agent_hooks`). In hook
//! mode the binary never starts Tauri: it reads the event JSON from stdin,
//! copies the file that is about to change into the snapshot store, and exits.
//!
//! Cursor (checked against 3.7.42) runs the same command as a `preToolUse`
//! hook with matcher `Write|Delete`: `Write` carries `tool_input.file_path`
//! and the whole new content (Cursor's edits all go through it), `Delete`
//! carries `tool_input.file_path`. Every Cursor hook event has a
//! `cursor_version` string, which is how a record gets `agent: "cursor"`.
//! Cursor also imports Claude Code's user hooks; it drops an imported hook
//! whose command equals one in `~/.cursor/hooks.json`, so an edit is
//! snapshotted once.
//!
//! - Store: `<app data>/agent-snapshots/snap-<ms>-<12 hex>.json`, 0600 files in
//!   a 0700 directory, kept 7 days (at most 2000 files).
//! - Exit codes (Claude Code): 0 and no stdout = "no opinion" (never an
//!   allow); 2 = block, reason on stderr. A snapshot that cannot be written
//!   blocks the edit: Agentrix promised it could be undone. Events it cannot
//!   read are recorded as "no snapshot" and let through (the emergency-stop
//!   guard, not this hook, is what stops an AI).
//! - Files larger than 2 MiB, directories and special files are recorded
//!   without content ("skipped"); undo is not offered for them.
//!
//! Undo (`revert`) runs only from a click in "今天的改动". The WebView passes an
//! id; Rust reads the record, refuses protected targets (Claude Code settings,
//! Agentrix hook files, the store itself) and restores the exact bytes and
//! mode.
//!
//! Forged records: a record makes a later undo click write its bytes to its
//! path, so an AI that could plant one could launder a write past its own
//! permission prompt. Claude Code's file tools are blocked from the store by
//! this hook, and Agentrix's own AI treats the store as secret-class (fence).
//! Records are also authenticated (schema 2): HMAC-SHA256 over the whole
//! record, keyed by 32 random bytes in the OS keychain
//! (`agentrix.agent_snapshots` / `record_mac_key_v1`). A shell command the
//! user lets Claude Code run can still write the store, but without the key
//! its record does not verify and undo refuses it.
//! - The key is created when protection is switched on (and by the hook if it
//!   is missing). If the hook cannot read it (keychain locked or denied), the
//!   edit is not blocked: the record is written unsigned and shown as "cannot
//!   be undone" (undo refuses it, `snapshot_unverified`).
//! - macOS: the keychain item trusts the binary that created it; the hook is
//!   the same binary, so it reads without a prompt. Other programs (e.g.
//!   `security` run from a shell) make macOS ask the owner first. After an app
//!   update macOS may ask once ("Always Allow").
//! - Windows: Credential Manager lets any program of the same user read it,
//!   so there the MAC only stops forgers that do not look for the key.
#![allow(dead_code)]

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use zeroize::Zeroizing;

pub const HOOK_FLAG: &str = "--agentrix-claude-snapshot";
/// Claude Code tools that change a file named in `tool_input`.
pub const HOOK_MATCHER: &str = "Write|Edit|MultiEdit|NotebookEdit";
/// Cursor tools that change or remove a file named in `tool_input.file_path`.
pub const CURSOR_HOOK_MATCHER: &str = "Write|Delete";
pub const STORE_DIR_NAME: &str = "agent-snapshots";
pub const AGENT_CLAUDE_CODE: &str = "claude-code";
pub const AGENT_CURSOR: &str = "cursor";

/// 2 = authenticated (`mac`). Version 1 records (before the MAC) still list,
/// but never verify.
const SCHEMA_VERSION: u32 = 2;
const MAC_DOMAIN: &[u8] = b"agentrix.agent-snapshot.record.v2\n";
pub const MAC_KEY_SERVICE: &str = "agentrix.agent_snapshots";
pub const MAC_KEY_ACCOUNT: &str = "record_mac_key_v1";
const MAX_SNAPSHOT_BYTES: u64 = 2 * 1024 * 1024;
const MAX_EVENT_BYTES: u64 = 64 * 1024 * 1024;
const RETENTION_MS: i64 = 7 * 24 * 60 * 60 * 1000;
const MAX_RECORDS: usize = 2000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRecord {
    pub schema_version: u32,
    pub id: String,
    pub agent: String,
    pub tool: String,
    /// Absolute, lexically normalised path. Empty when the event was unreadable.
    pub target_path: String,
    pub created_at: i64,
    pub existed_before: bool,
    pub size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_base64: Option<String>,
    /// Why there is no content: `too_large`, `not_regular_file`, `unreadable_event`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skipped: Option<String>,
    /// HMAC-SHA256 (base64url, no padding) over `MAC_DOMAIN` and this record
    /// serialised without `mac`. Missing when the hook could not get the key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mac: Option<String>,
}

/// Where the record MAC key comes from (the OS keychain; tests use memory).
pub trait RecordKey {
    /// The key, creating it first when `create` is true and there is none.
    /// `None` = unavailable (never an error the hook reports).
    fn get(&self, create: bool) -> Option<Zeroizing<[u8; 32]>>;
}

pub struct KeychainRecordKey;

fn decode_key(text: &str) -> Option<Zeroizing<[u8; 32]>> {
    let bytes = Zeroizing::new(hex::decode(text.trim()).ok()?);
    let array: [u8; 32] = bytes.as_slice().try_into().ok()?;
    Some(Zeroizing::new(array))
}

impl RecordKey for KeychainRecordKey {
    fn get(&self, create: bool) -> Option<Zeroizing<[u8; 32]>> {
        let entry = keyring::Entry::new(MAC_KEY_SERVICE, MAC_KEY_ACCOUNT).ok()?;
        match entry.get_password() {
            Ok(text) => decode_key(&Zeroizing::new(text)),
            Err(keyring::Error::NoEntry) if create => {
                let fresh = Zeroizing::new(rand::random::<[u8; 32]>());
                entry.set_password(&Zeroizing::new(hex::encode(fresh.as_slice()))).ok()?;
                // Two first runs at once: both use whichever key won.
                entry.get_password().ok().and_then(|text| decode_key(&Zeroizing::new(text)))
            }
            Err(_) => None,
        }
    }
}

fn mac_input(record: &SnapshotRecord) -> Option<Vec<u8>> {
    let mut unsigned = record.clone();
    unsigned.mac = None;
    let mut bytes = MAC_DOMAIN.to_vec();
    bytes.extend(serde_json::to_vec(&unsigned).ok()?);
    Some(bytes)
}

fn sign_record(record: &mut SnapshotRecord, key: &[u8; 32]) {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    record.mac = None;
    if let Some(input) = mac_input(record) {
        let tag = ring::hmac::sign(&ring::hmac::Key::new(ring::hmac::HMAC_SHA256, key), &input);
        record.mac = Some(URL_SAFE_NO_PAD.encode(tag.as_ref()));
    }
}

/// Schema 2, has a MAC, and the MAC matches (constant-time compare).
pub fn verify_record(record: &SnapshotRecord, key: Option<&[u8; 32]>) -> bool {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let (Some(key), Some(mac)) = (key, record.mac.as_deref()) else {
        return false;
    };
    if record.schema_version != SCHEMA_VERSION {
        return false;
    }
    let (Ok(tag), Some(input)) = (URL_SAFE_NO_PAD.decode(mac), mac_input(record)) else {
        return false;
    };
    ring::hmac::verify(&ring::hmac::Key::new(ring::hmac::HMAC_SHA256, key), &input, &tag).is_ok()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HookOutcome {
    Recorded(String),
    Ignored,
    Blocked(String),
}

/// Called first thing in `main`. `Some(code)` means "hook mode ran; exit now".
pub fn hook_main_if_requested() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    if args.next()? != HOOK_FLAG {
        return None;
    }
    let Some(store) = args.next().map(PathBuf::from) else {
        eprintln!("Agentrix snapshot: store directory missing; blocked. (Agentrix：快照目录缺失，已拦截。)");
        return Some(2);
    };
    let mut input = Vec::new();
    let _ = std::io::stdin().take(MAX_EVENT_BYTES).read_to_end(&mut input);
    // Drain anything beyond the limit so Claude Code never sees a broken pipe.
    let _ = std::io::copy(&mut std::io::stdin(), &mut std::io::sink());
    match run_hook(&store, &input, now_ms(), &KeychainRecordKey) {
        HookOutcome::Recorded(_) | HookOutcome::Ignored => Some(0),
        HookOutcome::Blocked(reason) => {
            eprintln!("{reason}");
            Some(2)
        }
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// The hook body, without process I/O (tests call this directly).
pub fn run_hook(store: &Path, input: &[u8], now: i64, keys: &dyn RecordKey) -> HookOutcome {
    if !store.is_absolute() {
        return HookOutcome::Blocked(blocked_text("store directory is not absolute"));
    }
    let event: Option<Value> = serde_json::from_slice(input).ok();
    let agent = event_agent(event.as_ref());
    let tool = event
        .as_ref()
        .and_then(|value| value.get("tool_name"))
        .and_then(Value::as_str)
        .unwrap_or("");
    // Unreadable input or no tool name: record "no snapshot" below.
    // A readable event for some other tool: not ours.
    if !tool.is_empty() && !is_snapshot_tool(agent, tool) {
        return HookOutcome::Ignored;
    }
    let target = if tool.is_empty() {
        None
    } else {
        event.as_ref().and_then(|value| resolve_target(value, tool))
    };
    let mut record = SnapshotRecord {
        schema_version: SCHEMA_VERSION,
        id: new_id(now),
        agent: agent.into(),
        tool: if tool.is_empty() { "unknown".into() } else { tool.into() },
        target_path: String::new(),
        created_at: now,
        existed_before: false,
        size: 0,
        mode: None,
        previous_base64: None,
        skipped: None,
        mac: None,
    };
    match target {
        None => record.skipped = Some("unreadable_event".into()),
        Some(path) => {
            // A forged record would make a later "undo" click write whatever
            // the AI wants. Its file tools never get to write the store.
            if targets_store(&path, store) {
                return HookOutcome::Blocked(
                    "Agentrix: this is Agentrix's undo snapshot folder; AI tools cannot write it. \
(Agentrix：这是撤回快照的目录，AI 不能写。)"
                        .into(),
                );
            }
            record.target_path = match path.to_str() {
                Some(text) => text.to_string(),
                None => {
                    record.skipped = Some("unreadable_event".into());
                    String::new()
                }
            };
            if record.skipped.is_none() {
                match capture(&path) {
                    Capture::Missing => {}
                    Capture::Directory => return HookOutcome::Ignored,
                    Capture::Skipped { reason, size, mode } => {
                        record.existed_before = true;
                        record.size = size;
                        record.mode = mode;
                        record.skipped = Some(reason.into());
                    }
                    Capture::Content { bytes, mode } => {
                        record.existed_before = true;
                        record.size = bytes.len() as u64;
                        record.mode = mode;
                        record.previous_base64 = Some(B64.encode(&bytes));
                    }
                    Capture::Failed => {
                        return HookOutcome::Blocked(blocked_text("the file could not be read"));
                    }
                }
            }
        }
    }
    // Without the key the record is still written (undo will refuse it);
    // a locked keychain must not stop the owner's own work in Claude Code.
    if let Some(key) = keys.get(true) {
        sign_record(&mut record, &key);
    }
    if let Err(error) = write_record(store, &record) {
        return HookOutcome::Blocked(blocked_text(&format!("the snapshot could not be saved ({error})")));
    }
    prune(store, now);
    HookOutcome::Recorded(record.id)
}

/// Whether `path` is the store or inside it: lexically, after resolving
/// symlinks in the deepest existing ancestor, and case-insensitively on macOS
/// and Windows (their default file systems ignore case).
fn targets_store(path: &Path, store: &Path) -> bool {
    fn resolved(path: &Path) -> PathBuf {
        let mut existing = path.to_path_buf();
        let mut rest = Vec::new();
        while !existing.exists() {
            match (existing.file_name().map(|n| n.to_os_string()), existing.parent()) {
                (Some(name), Some(parent)) => {
                    rest.push(name);
                    existing = parent.to_path_buf();
                }
                _ => return path.to_path_buf(),
            }
        }
        let mut out = std::fs::canonicalize(&existing).unwrap_or(existing);
        for name in rest.into_iter().rev() {
            out.push(name);
        }
        out
    }
    fn inside(path: &Path, store: &Path) -> bool {
        if path.starts_with(store) {
            return true;
        }
        if cfg!(any(target_os = "macos", windows)) {
            let (p, s) = (path.to_string_lossy().to_lowercase(), store.to_string_lossy().to_lowercase());
            let s = s.trim_end_matches(['/', '\\']);
            return p == s || p.starts_with(&format!("{s}/")) || p.starts_with(&format!("{s}\\"));
        }
        false
    }
    inside(path, store) || inside(&resolved(path), &resolved(store))
}

fn blocked_text(detail: &str) -> String {
    format!(
        "Agentrix could not keep an undo snapshot: {detail}. The edit was blocked so it stays undoable. \
To continue without snapshots, remove the protection in Agentrix → 我的 AI 们. \
(Agentrix 没能留下撤回快照，这次改动已拦下；不需要快照的话，在 Agentrix → 我的 AI 们 里移除保护。)"
    )
}

/// Cursor puts `cursor_version` on every hook event; Claude Code never does.
/// An event that is not JSON at all is labelled Claude Code, as before Cursor
/// was supported (such records are never undoable either way).
fn event_agent(event: Option<&Value>) -> &'static str {
    match event.and_then(|value| value.get("cursor_version")) {
        Some(Value::String(_)) => AGENT_CURSOR,
        _ => AGENT_CLAUDE_CODE,
    }
}

fn is_snapshot_tool(agent: &str, tool: &str) -> bool {
    let matcher = if agent == AGENT_CURSOR { CURSOR_HOOK_MATCHER } else { HOOK_MATCHER };
    matcher.split('|').any(|name| name == tool)
}

fn is_known_agent(agent: &str) -> bool {
    agent == AGENT_CLAUDE_CODE || agent == AGENT_CURSOR
}

/// `tool_input.file_path` (or `notebook_path`), made absolute against `cwd`
/// and normalised lexically. None when missing or when `..` climbs above root.
fn resolve_target(event: &Value, tool: &str) -> Option<PathBuf> {
    let input = event.get("tool_input")?;
    let key = if tool == "NotebookEdit" { "notebook_path" } else { "file_path" };
    let raw = input
        .get(key)
        .or_else(|| input.get("file_path"))
        .and_then(Value::as_str)?;
    if raw.is_empty() || raw.contains('\0') {
        return None;
    }
    let path = Path::new(raw);
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        let cwd = event.get("cwd").and_then(Value::as_str).map(Path::new)?;
        if !cwd.is_absolute() {
            return None;
        }
        cwd.join(path)
    };
    normalize(&absolute)
}

/// Lexical normalisation: drops `.`, resolves `..`; refuses to climb above root.
pub fn normalize(path: &Path) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => out.push(prefix.as_os_str()),
            Component::RootDir => out.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() || !out.has_root() {
                    return None;
                }
            }
            Component::Normal(part) => out.push(part),
        }
    }
    if out.is_absolute() {
        Some(out)
    } else {
        None
    }
}

enum Capture {
    Missing,
    Directory,
    Skipped { reason: &'static str, size: u64, mode: Option<u32> },
    Content { bytes: Vec<u8>, mode: Option<u32> },
    Failed,
}

fn file_mode(meta: &std::fs::Metadata) -> Option<u32> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return Some(meta.permissions().mode() & 0o777);
    }
    #[cfg(not(unix))]
    {
        let _ = meta;
        None
    }
}

fn capture(path: &Path) -> Capture {
    let meta = match std::fs::metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Capture::Missing,
        Err(_) => return Capture::Failed,
    };
    if meta.is_dir() {
        return Capture::Directory;
    }
    let mode = file_mode(&meta);
    if !meta.is_file() {
        return Capture::Skipped { reason: "not_regular_file", size: 0, mode };
    }
    if meta.len() > MAX_SNAPSHOT_BYTES {
        return Capture::Skipped { reason: "too_large", size: meta.len(), mode };
    }
    let mut bytes = Vec::new();
    match std::fs::File::open(path).and_then(|file| file.take(MAX_SNAPSHOT_BYTES + 1).read_to_end(&mut bytes)) {
        Ok(_) if bytes.len() as u64 > MAX_SNAPSHOT_BYTES => {
            Capture::Skipped { reason: "too_large", size: bytes.len() as u64, mode }
        }
        Ok(_) => Capture::Content { bytes, mode },
        Err(_) => Capture::Failed,
    }
}

fn new_id(now: i64) -> String {
    let bytes: [u8; 6] = rand::random();
    format!("snap-{now:013}-{}", hex::encode(bytes))
}

/// `snap-` + 13 digits + `-` + 12 lowercase hex.
pub fn is_valid_id(id: &str) -> bool {
    let Some(rest) = id.strip_prefix("snap-") else {
        return false;
    };
    let bytes = rest.as_bytes();
    bytes.len() == 13 + 1 + 12
        && bytes[..13].iter().all(u8::is_ascii_digit)
        && bytes[13] == b'-'
        && bytes[14..].iter().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn id_time(id: &str) -> Option<i64> {
    if !is_valid_id(id) {
        return None;
    }
    id[5..18].parse().ok()
}

fn ensure_private_dir(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

/// Temp file in the same directory, then rename.
fn write_atomic(path: &Path, bytes: &[u8], mode: Option<u32>) -> std::io::Result<()> {
    let dir = path.parent().ok_or_else(|| std::io::Error::other("no parent"))?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let suffix: [u8; 4] = rand::random();
    let temp = dir.join(format!(".{name}.{}.{}.agentrix.tmp", std::process::id(), hex::encode(suffix)));
    let result = (|| {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(mode.unwrap_or(0o600) & 0o777);
        }
        #[cfg(not(unix))]
        let _ = mode;
        let mut file = options.open(&temp)?;
        file.write_all(bytes)?;
        #[cfg(unix)]
        {
            // The umask may have narrowed the create mode; set it exactly.
            // Permission bits only: no setuid / setgid / sticky from a record.
            if let Some(mode) = mode {
                use std::os::unix::fs::PermissionsExt;
                file.set_permissions(std::fs::Permissions::from_mode(mode & 0o777))?;
            }
        }
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

fn write_record(store: &Path, record: &SnapshotRecord) -> std::io::Result<()> {
    ensure_private_dir(store)?;
    let bytes = serde_json::to_vec(record).map_err(std::io::Error::other)?;
    write_atomic(&store.join(format!("{}.json", record.id)), &bytes, Some(0o600))
}

fn record_ids(store: &Path) -> Vec<(i64, String)> {
    let Ok(entries) = std::fs::read_dir(store) else {
        return Vec::new();
    };
    let mut ids: Vec<(i64, String)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let id = name.strip_suffix(".json")?.to_string();
            Some((id_time(&id)?, id))
        })
        .collect();
    ids.sort();
    ids
}

/// Drop records older than 7 days, then the oldest beyond 2000. Best effort.
fn prune(store: &Path, now: i64) {
    let ids = record_ids(store);
    let mut keep = Vec::new();
    for (time, id) in ids {
        if time < now - RETENTION_MS {
            let _ = std::fs::remove_file(store.join(format!("{id}.json")));
        } else {
            keep.push(id);
        }
    }
    if keep.len() > MAX_RECORDS {
        for id in &keep[..keep.len() - MAX_RECORDS] {
            let _ = std::fs::remove_file(store.join(format!("{id}.json")));
        }
    }
}

// ── Reading and undo (app side, Tauri commands in lib.rs) ───────────────────

/// Whether the file on disk still differs from the snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CurrentState {
    /// The file is as it was before the edit (the edit was refused, or undone).
    Same,
    /// Undo would change the file.
    Changed,
    /// No content kept, or the file cannot be read now.
    Unknown,
}

/// What the WebView sees: never the file content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSummary {
    pub id: String,
    pub agent: String,
    pub tool: String,
    pub target_path: String,
    pub created_at: i64,
    pub existed_before: bool,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped: Option<String>,
    pub current: CurrentState,
    /// The record's MAC checks out. Undo refuses records that do not.
    pub verified: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevertOutcome {
    pub target_path: String,
    /// `restored`, `deleted` or `nothing_to_do`.
    pub action: &'static str,
}

/// Base64 of 2 MiB plus the JSON around it.
const MAX_RECORD_FILE_BYTES: u64 = 4 * 1024 * 1024;

pub fn read_record(store: &Path, id: &str) -> Result<SnapshotRecord, &'static str> {
    if !is_valid_id(id) {
        return Err("snapshot_id_invalid");
    }
    let path = store.join(format!("{id}.json"));
    let mut bytes = Vec::new();
    std::fs::File::open(&path)
        .and_then(|file| file.take(MAX_RECORD_FILE_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|_| "snapshot_not_found")?;
    if bytes.len() as u64 > MAX_RECORD_FILE_BYTES {
        return Err("snapshot_unreadable");
    }
    let record: SnapshotRecord = serde_json::from_slice(&bytes).map_err(|_| "snapshot_unreadable")?;
    if record.id != id || !(1..=SCHEMA_VERSION).contains(&record.schema_version) || !is_known_agent(&record.agent) {
        return Err("snapshot_unreadable");
    }
    Ok(record)
}

fn previous_bytes(record: &SnapshotRecord) -> Option<Vec<u8>> {
    record.previous_base64.as_deref().and_then(|text| B64.decode(text).ok())
}

pub fn current_state(record: &SnapshotRecord) -> CurrentState {
    if record.skipped.is_some() || record.target_path.is_empty() {
        return CurrentState::Unknown;
    }
    let target = Path::new(&record.target_path);
    if !record.existed_before {
        return match std::fs::symlink_metadata(target) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => CurrentState::Same,
            Ok(meta) if !meta.is_dir() => CurrentState::Changed,
            _ => CurrentState::Unknown,
        };
    }
    let Some(previous) = previous_bytes(record) else {
        return CurrentState::Unknown;
    };
    let mut now = Vec::new();
    match std::fs::File::open(target).and_then(|file| file.take(MAX_SNAPSHOT_BYTES + 1).read_to_end(&mut now)) {
        Ok(_) if now == previous => CurrentState::Same,
        Ok(_) => CurrentState::Changed,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => CurrentState::Changed,
        Err(_) => CurrentState::Unknown,
    }
}

/// Newest first; `since` in epoch ms; unreadable records are skipped.
pub fn list(store: &Path, since: Option<i64>, limit: usize, keys: &dyn RecordKey) -> Vec<SnapshotSummary> {
    let key = keys.get(false);
    let mut ids = record_ids(store);
    ids.reverse();
    ids.into_iter()
        .filter(|(time, _)| since.map(|since| *time >= since).unwrap_or(true))
        .filter_map(|(_, id)| read_record(store, &id).ok())
        .take(limit)
        .map(|record| SnapshotSummary {
            verified: verify_record(&record, key.as_deref()),
            current: current_state(&record),
            id: record.id,
            agent: record.agent,
            tool: record.tool,
            target_path: record.target_path,
            created_at: record.created_at,
            existed_before: record.existed_before,
            size: record.size,
            skipped: record.skipped,
        })
        .collect()
}

/// Hook configuration files of AI tools: undo never writes them (the same
/// set the execution fence treats as secret-class).
fn is_ai_hook_config(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let parent = path
        .parent()
        .and_then(Path::file_name)
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let parts: Vec<&std::ffi::OsStr> = path.components().map(|c| c.as_os_str()).collect();
    let under_cursor_hooks = parts.windows(2).any(|pair| pair[0] == ".cursor" && pair[1] == "hooks");
    (parent == ".claude" && (name == "settings.json" || name == "settings.local.json"))
        || (parent == ".cursor" && name == "hooks.json")
        || under_cursor_hooks
        || name == "kill-switch.state"
        || name == "agentrix-guard.sh"
}

fn is_protected(target: &Path, store: &Path, protected: &[PathBuf]) -> bool {
    target.starts_with(store)
        || protected.iter().any(|p| target.starts_with(p))
        || is_ai_hook_config(target)
}

/// Undo one snapshot: put the file back exactly as it was before the edit
/// (bytes and permission bits), or delete a file the edit created.
pub fn revert(store: &Path, id: &str, protected: &[PathBuf], keys: &dyn RecordKey) -> Result<RevertOutcome, &'static str> {
    let record = read_record(store, id)?;
    // Only records this binary signed: a planted one writes nothing.
    if !verify_record(&record, keys.get(false).as_deref()) {
        return Err("snapshot_unverified");
    }
    if record.skipped.is_some() || record.target_path.is_empty() {
        return Err("snapshot_not_restorable");
    }
    let target = PathBuf::from(&record.target_path);
    if normalize(&target).as_deref() != Some(target.as_path()) {
        return Err("snapshot_target_invalid");
    }
    if is_protected(&target, store, protected) {
        return Err("snapshot_target_protected");
    }
    let outcome = |action| Ok(RevertOutcome { target_path: record.target_path.clone(), action });
    let link = std::fs::symlink_metadata(&target);
    if !record.existed_before {
        return match link {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => outcome("nothing_to_do"),
            Ok(meta) if meta.is_dir() => Err("snapshot_target_is_directory"),
            Ok(_) => {
                std::fs::remove_file(&target).map_err(|_| "snapshot_revert_failed")?;
                outcome("deleted")
            }
            Err(_) => Err("snapshot_revert_failed"),
        };
    }
    let bytes = previous_bytes(&record).ok_or("snapshot_unreadable")?;
    // Write through a symlink to the file it points at (never replace the link).
    let write_to = match &link {
        Ok(meta) if meta.file_type().is_symlink() => {
            let real = std::fs::canonicalize(&target).map_err(|_| "snapshot_revert_failed")?;
            if is_protected(&real, store, protected) {
                return Err("snapshot_target_protected");
            }
            real
        }
        Ok(meta) if meta.is_dir() => return Err("snapshot_target_is_directory"),
        _ => target.clone(),
    };
    if let Some(parent) = write_to.parent() {
        std::fs::create_dir_all(parent).map_err(|_| "snapshot_revert_failed")?;
    }
    write_atomic(&write_to, &bytes, record.mode).map_err(|_| "snapshot_revert_failed")?;
    outcome("restored")
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use serde_json::json;
    use std::os::unix::fs::PermissionsExt;

    const T0: i64 = 1_790_000_000_000;

    struct Fixture {
        _root: tempfile::TempDir,
        store: PathBuf,
        work: PathBuf,
        keys: MemoryKey,
    }

    /// The keychain stand-in: empty until the first `get(true)`.
    #[derive(Default)]
    struct MemoryKey(std::sync::Mutex<Option<[u8; 32]>>);

    impl RecordKey for MemoryKey {
        fn get(&self, create: bool) -> Option<Zeroizing<[u8; 32]>> {
            let mut slot = self.0.lock().unwrap();
            if slot.is_none() && create {
                *slot = Some(rand::random());
            }
            slot.map(Zeroizing::new)
        }
    }

    /// A keychain that cannot be read (locked, or the owner said no).
    struct NoKey;

    impl RecordKey for NoKey {
        fn get(&self, _create: bool) -> Option<Zeroizing<[u8; 32]>> {
            None
        }
    }

    fn fixture() -> Fixture {
        let root = tempfile::tempdir().unwrap();
        let base = std::fs::canonicalize(root.path()).unwrap();
        let store = base.join("app").join(STORE_DIR_NAME);
        let work = base.join("project");
        std::fs::create_dir_all(&work).unwrap();
        Fixture { _root: root, store, work, keys: MemoryKey::default() }
    }

    fn event(tool: &str, path: &str, cwd: &Path) -> Vec<u8> {
        let key = if tool == "NotebookEdit" { "notebook_path" } else { "file_path" };
        json!({
            "session_id": "s1",
            "hook_event_name": "PreToolUse",
            "cwd": cwd.to_str().unwrap(),
            "tool_name": tool,
            "tool_input": { key: path, "content": "new" }
        })
        .to_string()
        .into_bytes()
    }

    fn recorded(outcome: HookOutcome) -> String {
        match outcome {
            HookOutcome::Recorded(id) => id,
            other => panic!("expected a snapshot, got {other:?}"),
        }
    }

    fn mode_of(path: &Path) -> u32 {
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn edit_is_snapshotted_and_undo_restores_exact_bytes_and_mode() {
        let f = fixture();
        let file = f.work.join("src").join("main.rs");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        let original = b"fn main() {}\r\n\xe4\xbd\xa0\xe5\xa5\xbd\n".to_vec();
        std::fs::write(&file, &original).unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o640)).unwrap();

        let id = recorded(run_hook(&f.store, &event("Edit", file.to_str().unwrap(), &f.work), T0, &f.keys));
        assert!(is_valid_id(&id));
        assert_eq!(mode_of(&f.store), 0o700);
        assert_eq!(mode_of(&f.store.join(format!("{id}.json"))), 0o600);

        let listed = list(&f.store, None, 50, &f.keys);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].current, CurrentState::Same);
        assert_eq!(listed[0].target_path, file.to_str().unwrap());
        // The summary the WebView gets never carries the content.
        let json = serde_json::to_string(&listed[0]).unwrap();
        assert!(!json.contains("previous") && !json.contains("fn main"));

        std::fs::write(&file, b"garbage").unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o666)).unwrap();
        assert_eq!(list(&f.store, None, 50, &f.keys)[0].current, CurrentState::Changed);
        let outcome = revert(&f.store, &id, &[], &f.keys).unwrap();
        assert_eq!(outcome.action, "restored");
        assert_eq!(std::fs::read(&file).unwrap(), original);
        assert_eq!(mode_of(&file), 0o640);
        assert_eq!(list(&f.store, None, 50, &f.keys)[0].current, CurrentState::Same);
    }

    #[test]
    fn a_file_the_ai_created_is_deleted_on_undo_and_relative_paths_use_cwd() {
        let f = fixture();
        let id = recorded(run_hook(&f.store, &event("Write", "notes/new.md", &f.work), T0, &f.keys));
        let record = read_record(&f.store, &id).unwrap();
        assert!(!record.existed_before);
        assert_eq!(record.target_path, f.work.join("notes/new.md").to_str().unwrap());
        assert_eq!(current_state(&record), CurrentState::Same);
        std::fs::create_dir_all(f.work.join("notes")).unwrap();
        std::fs::write(f.work.join("notes/new.md"), "hi").unwrap();
        assert_eq!(current_state(&record), CurrentState::Changed);
        assert_eq!(revert(&f.store, &id, &[], &f.keys).unwrap().action, "deleted");
        assert!(!f.work.join("notes/new.md").exists());
        assert_eq!(revert(&f.store, &id, &[], &f.keys).unwrap().action, "nothing_to_do");
    }

    #[test]
    fn notebook_edits_use_notebook_path() {
        let f = fixture();
        let nb = f.work.join("a.ipynb");
        std::fs::write(&nb, "{}").unwrap();
        let id = recorded(run_hook(&f.store, &event("NotebookEdit", nb.to_str().unwrap(), &f.work), T0, &f.keys));
        assert_eq!(read_record(&f.store, &id).unwrap().target_path, nb.to_str().unwrap());
    }

    #[test]
    fn other_tools_and_directories_are_ignored() {
        let f = fixture();
        assert_eq!(run_hook(&f.store, &event("Bash", "/tmp/x", &f.work), T0, &f.keys), HookOutcome::Ignored);
        assert_eq!(run_hook(&f.store, &event("Read", "/tmp/x", &f.work), T0, &f.keys), HookOutcome::Ignored);
        assert_eq!(run_hook(&f.store, &event("Write", f.work.to_str().unwrap(), &f.work), T0, &f.keys), HookOutcome::Ignored);
        assert!(list(&f.store, None, 50, &f.keys).is_empty());
    }

    #[test]
    fn ai_file_tools_cannot_write_the_store_by_any_spelling() {
        let f = fixture();
        std::fs::create_dir_all(&f.store).unwrap();
        let forged = f.store.join("snap-1790000000000-000000000000.json");
        let via_dots = format!("{}/../{}/x.json", f.store.display(), STORE_DIR_NAME);
        let link = f.work.join("shortcut");
        std::os::unix::fs::symlink(&f.store, &link).unwrap();
        let via_link = link.join("x.json");
        let mut attempts = vec![
            forged.to_str().unwrap().to_string(),
            via_dots,
            via_link.to_str().unwrap().to_string(),
            f.store.to_str().unwrap().to_string(),
        ];
        if cfg!(target_os = "macos") {
            attempts.push(forged.to_str().unwrap().replace(STORE_DIR_NAME, "AGENT-Snapshots"));
        }
        for path in attempts {
            for tool in ["Write", "Edit", "MultiEdit"] {
                match run_hook(&f.store, &event(tool, &path, &f.work), T0, &f.keys) {
                    HookOutcome::Blocked(reason) => assert!(reason.contains("AI 不能写"), "{path}"),
                    other => panic!("{tool} {path}: expected block, got {other:?}"),
                }
            }
        }
        assert!(list(&f.store, None, 50, &f.keys).is_empty());
    }

    #[test]
    fn unreadable_events_are_recorded_without_content_and_let_through() {
        let f = fixture();
        for input in [b"not json".to_vec(), br#"{"tool_input":{"file_path":"/x"}}"#.to_vec()] {
            let id = recorded(run_hook(&f.store, &input, T0, &f.keys));
            let record = read_record(&f.store, &id).unwrap();
            assert_eq!(record.skipped.as_deref(), Some("unreadable_event"));
            assert_eq!(current_state(&record), CurrentState::Unknown);
            assert_eq!(revert(&f.store, &id, &[], &f.keys).unwrap_err(), "snapshot_not_restorable");
        }
        // `..` above root, a relative path without cwd, NUL: no target.
        let climbing = json!({"tool_name":"Write","tool_input":{"file_path":"/../../etc/passwd"}}).to_string();
        let relative = json!({"tool_name":"Write","tool_input":{"file_path":"a.txt"}}).to_string();
        for input in [climbing, relative] {
            let id = recorded(run_hook(&f.store, input.as_bytes(), T0, &f.keys));
            assert_eq!(read_record(&f.store, &id).unwrap().skipped.as_deref(), Some("unreadable_event"));
        }
    }

    #[test]
    fn large_files_are_recorded_as_skipped() {
        let f = fixture();
        let big = f.work.join("big.bin");
        std::fs::write(&big, vec![7u8; (MAX_SNAPSHOT_BYTES + 1) as usize]).unwrap();
        let id = recorded(run_hook(&f.store, &event("Write", big.to_str().unwrap(), &f.work), T0, &f.keys));
        let record = read_record(&f.store, &id).unwrap();
        assert_eq!(record.skipped.as_deref(), Some("too_large"));
        assert!(record.previous_base64.is_none());
        assert_eq!(revert(&f.store, &id, &[], &f.keys).unwrap_err(), "snapshot_not_restorable");
    }

    #[test]
    fn a_store_that_cannot_be_written_blocks_the_edit() {
        let f = fixture();
        std::fs::create_dir_all(f.store.parent().unwrap()).unwrap();
        std::fs::write(&f.store, "a file where the directory should be").unwrap();
        let file = f.work.join("a.txt");
        std::fs::write(&file, "x").unwrap();
        match run_hook(&f.store, &event("Edit", file.to_str().unwrap(), &f.work), T0, &f.keys) {
            HookOutcome::Blocked(reason) => assert!(reason.contains("我的 AI 们")),
            other => panic!("expected block, got {other:?}"),
        }
        assert_eq!(
            run_hook(Path::new("relative/store"), &event("Edit", file.to_str().unwrap(), &f.work), T0, &f.keys),
            HookOutcome::Blocked(blocked_text("store directory is not absolute"))
        );
    }

    #[test]
    fn undo_refuses_protected_targets_forged_ids_and_tampered_records() {
        let f = fixture();
        let settings = f.work.join(".claude").join("settings.json");
        std::fs::create_dir_all(settings.parent().unwrap()).unwrap();
        std::fs::write(&settings, "{}").unwrap();
        let id = recorded(run_hook(&f.store, &event("Edit", settings.to_str().unwrap(), &f.work), T0, &f.keys));
        assert_eq!(revert(&f.store, &id, &[], &f.keys).unwrap_err(), "snapshot_target_protected");

        let guarded = f.work.join("guarded");
        std::fs::create_dir_all(&guarded).unwrap();
        std::fs::write(guarded.join("f"), "1").unwrap();
        let id2 = recorded(run_hook(&f.store, &event("Edit", guarded.join("f").to_str().unwrap(), &f.work), T0 + 1, &f.keys));
        assert_eq!(revert(&f.store, &id2, &[guarded.clone()], &f.keys).unwrap_err(), "snapshot_target_protected");

        for bad in ["../x", "snap-1", "snap-179000000000a-000000000000", "snap-1790000000000-ABCDEF000000"] {
            assert_eq!(revert(&f.store, bad, &[], &f.keys).unwrap_err(), "snapshot_id_invalid");
        }
        // Even a correctly signed record is refused when its path is not
        // normalised, or when its id does not match its file.
        let key = f.keys.get(false).unwrap();
        let mut record = read_record(&f.store, &id2).unwrap();
        record.target_path = format!("{}/../guarded/f", f.work.to_str().unwrap());
        sign_record(&mut record, &key);
        std::fs::write(f.store.join(format!("{id2}.json")), serde_json::to_vec(&record).unwrap()).unwrap();
        assert_eq!(revert(&f.store, &id2, &[], &f.keys).unwrap_err(), "snapshot_target_invalid");
        record.target_path = guarded.join("f").to_str().unwrap().into();
        record.id = "snap-1790000000000-000000000000".into();
        sign_record(&mut record, &key);
        std::fs::write(f.store.join(format!("{id2}.json")), serde_json::to_vec(&record).unwrap()).unwrap();
        assert_eq!(revert(&f.store, &id2, &[], &f.keys).unwrap_err(), "snapshot_unreadable");
    }

    // ── Record MAC ──

    /// What a shell command the owner let Claude Code run could plant:
    /// a well-formed record that writes attacker bytes to an attacker path.
    fn plant(f: &Fixture, id: &str, target: &Path, bytes: &[u8], mac: Option<String>, schema: u32) {
        let record = SnapshotRecord {
            schema_version: schema,
            id: id.into(),
            agent: "claude-code".into(),
            tool: "Edit".into(),
            target_path: target.to_str().unwrap().into(),
            created_at: T0,
            existed_before: true,
            size: bytes.len() as u64,
            mode: Some(0o600),
            previous_base64: Some(B64.encode(bytes)),
            skipped: None,
            mac,
        };
        std::fs::create_dir_all(&f.store).unwrap();
        std::fs::write(f.store.join(format!("{id}.json")), serde_json::to_vec(&record).unwrap()).unwrap();
    }

    #[test]
    fn records_are_signed_and_planted_ones_are_never_written_back() {
        let f = fixture();
        let file = f.work.join("a.txt");
        std::fs::write(&file, "mine").unwrap();
        let id = recorded(run_hook(&f.store, &event("Edit", file.to_str().unwrap(), &f.work), T0, &f.keys));
        let record = read_record(&f.store, &id).unwrap();
        assert_eq!(record.schema_version, 2);
        assert_eq!(record.mac.as_deref().map(str::len), Some(43));
        assert!(list(&f.store, None, 50, &f.keys)[0].verified);

        let victim = f.work.join(".ssh").join("authorized_keys");
        std::fs::create_dir_all(victim.parent().unwrap()).unwrap();
        std::fs::write(&victim, "owner key").unwrap();
        let forged = [
            ("snap-1790000000001-00000000000a", None),
            ("snap-1790000000002-00000000000b", Some("A".repeat(43))),
            ("snap-1790000000003-00000000000c", record.mac.clone()),
            ("snap-1790000000004-00000000000d", Some("not base64 !".into())),
        ];
        for (forged_id, mac) in forged {
            plant(&f, forged_id, &victim, b"attacker key", mac, 2);
            let summary = list(&f.store, None, 50, &f.keys).into_iter().find(|s| s.id == forged_id).unwrap();
            assert!(!summary.verified, "{forged_id}");
            assert_eq!(revert(&f.store, forged_id, &[], &f.keys).unwrap_err(), "snapshot_unverified", "{forged_id}");
            assert_eq!(std::fs::read_to_string(&victim).unwrap(), "owner key");
        }
        // Signed with some other key (another install, or a guess).
        let other = MemoryKey::default();
        let mut planted = read_record(&f.store, &id).unwrap();
        planted.target_path = victim.to_str().unwrap().into();
        sign_record(&mut planted, &other.get(true).unwrap());
        std::fs::write(f.store.join(format!("{id}.json")), serde_json::to_vec(&planted).unwrap()).unwrap();
        assert_eq!(revert(&f.store, &id, &[], &f.keys).unwrap_err(), "snapshot_unverified");
        assert_eq!(std::fs::read_to_string(&victim).unwrap(), "owner key");
    }

    #[test]
    fn changing_any_field_of_a_signed_record_breaks_it() {
        let f = fixture();
        let file = f.work.join("a.txt");
        std::fs::write(&file, "mine").unwrap();
        let id = recorded(run_hook(&f.store, &event("Edit", file.to_str().unwrap(), &f.work), T0, &f.keys));
        let key = f.keys.get(false).unwrap();
        let good = read_record(&f.store, &id).unwrap();
        assert!(verify_record(&good, Some(&key)));
        let edits: Vec<Box<dyn Fn(&mut SnapshotRecord)>> = vec![
            Box::new(|r| r.target_path.push('x')),
            Box::new(|r| r.previous_base64 = Some(B64.encode(b"other"))),
            Box::new(|r| r.mode = Some(0o777)),
            Box::new(|r| r.existed_before = false),
            Box::new(|r| r.size += 1),
            Box::new(|r| r.created_at += 1),
            Box::new(|r| r.tool = "Write".into()),
            Box::new(|r| r.skipped = Some("too_large".into())),
            Box::new(|r| r.schema_version = 1),
        ];
        for edit in edits {
            let mut changed = good.clone();
            edit(&mut changed);
            assert!(!verify_record(&changed, Some(&key)), "{changed:?}");
        }
        assert!(!verify_record(&good, None));
    }

    #[test]
    fn without_the_key_the_edit_goes_ahead_but_cannot_be_undone() {
        let f = fixture();
        let file = f.work.join("a.txt");
        std::fs::write(&file, "mine").unwrap();
        let id = recorded(run_hook(&f.store, &event("Edit", file.to_str().unwrap(), &f.work), T0, &NoKey));
        assert!(read_record(&f.store, &id).unwrap().mac.is_none());
        std::fs::write(&file, "changed").unwrap();
        // Even once the keychain works again, an unsigned record stays unsigned.
        f.keys.get(true).unwrap();
        let summary = &list(&f.store, None, 50, &f.keys)[0];
        assert!(!summary.verified);
        assert_eq!(summary.current, CurrentState::Changed);
        assert_eq!(revert(&f.store, &id, &[], &f.keys).unwrap_err(), "snapshot_unverified");
        assert_eq!(revert(&f.store, &id, &[], &NoKey).unwrap_err(), "snapshot_unverified");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "changed");
    }

    #[test]
    fn records_from_before_the_mac_are_listed_but_not_undoable() {
        let f = fixture();
        f.keys.get(true).unwrap();
        let file = f.work.join("a.txt");
        std::fs::write(&file, "now").unwrap();
        plant(&f, "snap-1790000000005-00000000000e", &file, b"before", None, 1);
        let summary = &list(&f.store, None, 50, &f.keys)[0];
        assert_eq!(summary.id, "snap-1790000000005-00000000000e");
        assert!(!summary.verified);
        assert_eq!(revert(&f.store, &summary.id, &[], &f.keys).unwrap_err(), "snapshot_unverified");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "now");
        plant(&f, "snap-1790000000006-00000000000f", &file, b"x", None, 3);
        assert!(list(&f.store, None, 50, &f.keys).iter().all(|s| s.id != "snap-1790000000006-00000000000f"));
    }

    #[test]
    fn the_key_is_only_ever_created_on_request() {
        let keys = MemoryKey::default();
        assert!(keys.get(false).is_none());
        let first = keys.get(true).unwrap();
        assert_eq!(*keys.get(false).unwrap(), *first);
        assert_eq!(*keys.get(true).unwrap(), *first);
        assert!(decode_key(&"ab".repeat(32)).is_some());
        for bad in ["", "zz", &"ab".repeat(31), &"ab".repeat(33)] {
            assert!(decode_key(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn undo_writes_through_a_symlink_instead_of_replacing_it() {
        let f = fixture();
        let real = f.work.join("real.txt");
        let link = f.work.join("link.txt");
        std::fs::write(&real, "before").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let id = recorded(run_hook(&f.store, &event("Write", link.to_str().unwrap(), &f.work), T0, &f.keys));
        std::fs::write(&real, "after").unwrap();
        assert_eq!(revert(&f.store, &id, &[], &f.keys).unwrap().action, "restored");
        assert!(std::fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        assert_eq!(std::fs::read_to_string(&real).unwrap(), "before");
    }

    #[test]
    fn listing_is_newest_first_and_old_records_are_pruned() {
        let f = fixture();
        let file = f.work.join("a.txt");
        std::fs::write(&file, "x").unwrap();
        let old = recorded(run_hook(&f.store, &event("Edit", file.to_str().unwrap(), &f.work), T0, &f.keys));
        let mid = recorded(run_hook(&f.store, &event("Edit", file.to_str().unwrap(), &f.work), T0 + 1000, &f.keys));
        let ids: Vec<String> = list(&f.store, None, 50, &f.keys).into_iter().map(|s| s.id).collect();
        assert_eq!(ids, vec![mid.clone(), old.clone()]);
        assert_eq!(list(&f.store, Some(T0 + 500), 50, &f.keys).len(), 1);
        assert_eq!(list(&f.store, None, 1, &f.keys).len(), 1);
        // A run eight days later drops both.
        let late = recorded(run_hook(&f.store, &event("Edit", file.to_str().unwrap(), &f.work), T0 + RETENTION_MS + 2000, &f.keys));
        let ids: Vec<String> = list(&f.store, None, 50, &f.keys).into_iter().map(|s| s.id).collect();
        assert_eq!(ids, vec![late]);
    }

    // ── Cursor (3.7.42 preToolUse) ──

    /// What Cursor sends: `hook_event_name` in camelCase, `cursor_version`,
    /// `tool_input.file_path`, and for `Write` the whole new content.
    fn cursor_event(tool: &str, path: &str, cwd: &Path) -> Vec<u8> {
        let input = if tool == "Write" { json!({ "file_path": path, "content": "new" }) } else { json!({ "file_path": path }) };
        json!({
            "conversation_id": "c1",
            "generation_id": "g1",
            "session_id": "c1",
            "hook_event_name": "preToolUse",
            "cursor_version": "3.7.42",
            "workspace_roots": [cwd.to_str().unwrap()],
            "cwd": cwd.to_str().unwrap(),
            "tool_name": tool,
            "tool_use_id": "t1",
            "tool_input": input
        })
        .to_string()
        .into_bytes()
    }

    #[test]
    fn cursor_writes_and_deletes_are_snapshotted_as_cursor_and_undone() {
        let f = fixture();
        let file = f.work.join("src").join("lib.rs");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, b"pub fn a() {}\n").unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o640)).unwrap();

        let write = recorded(run_hook(&f.store, &cursor_event("Write", file.to_str().unwrap(), &f.work), T0, &f.keys));
        let record = read_record(&f.store, &write).unwrap();
        assert_eq!((record.agent.as_str(), record.tool.as_str()), ("cursor", "Write"));
        assert!(record.existed_before);
        std::fs::write(&file, b"pub fn b() {}\n").unwrap();

        let delete = recorded(run_hook(&f.store, &cursor_event("Delete", file.to_str().unwrap(), &f.work), T0 + 1000, &f.keys));
        std::fs::remove_file(&file).unwrap();
        let listed = list(&f.store, None, 50, &f.keys);
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().all(|s| s.agent == "cursor" && s.verified && s.current == CurrentState::Changed));

        // Undoing the delete brings back what Cursor deleted; undoing the
        // earlier write goes back to before Cursor touched the file.
        assert_eq!(revert(&f.store, &delete, &[], &f.keys).unwrap().action, "restored");
        assert_eq!(std::fs::read(&file).unwrap(), b"pub fn b() {}\n");
        assert_eq!(revert(&f.store, &write, &[], &f.keys).unwrap().action, "restored");
        assert_eq!(std::fs::read(&file).unwrap(), b"pub fn a() {}\n");
        assert_eq!(mode_of(&file), 0o640);

        // A file Cursor creates is deleted on undo.
        let created = recorded(run_hook(&f.store, &cursor_event("Write", "notes/new.md", &f.work), T0 + 2000, &f.keys));
        std::fs::create_dir_all(f.work.join("notes")).unwrap();
        std::fs::write(f.work.join("notes/new.md"), "hi").unwrap();
        assert_eq!(revert(&f.store, &created, &[], &f.keys).unwrap().action, "deleted");
        assert!(!f.work.join("notes/new.md").exists());
    }

    #[test]
    fn each_agent_only_snapshots_its_own_file_tools() {
        let f = fixture();
        let file = f.work.join("a.txt");
        std::fs::write(&file, "x").unwrap();
        let path = file.to_str().unwrap();
        for tool in ["Shell", "Read", "Grep", "MCP:write_file", "Edit", "MultiEdit"] {
            assert_eq!(run_hook(&f.store, &cursor_event(tool, path, &f.work), T0, &f.keys), HookOutcome::Ignored, "cursor {tool}");
        }
        // Claude Code has no Delete tool; an event that says so is not ours.
        assert_eq!(run_hook(&f.store, &event("Delete", path, &f.work), T0, &f.keys), HookOutcome::Ignored);
        // Cursor deleting a directory: nothing to keep.
        assert_eq!(
            run_hook(&f.store, &cursor_event("Delete", f.work.to_str().unwrap(), &f.work), T0, &f.keys),
            HookOutcome::Ignored
        );
        assert!(list(&f.store, None, 50, &f.keys).is_empty());
        // `cursor_version` must be a string to count as Cursor.
        let mut odd: Value = serde_json::from_slice(&event("Edit", path, &f.work)).unwrap();
        odd["cursor_version"] = json!(3);
        let id = recorded(run_hook(&f.store, odd.to_string().as_bytes(), T0, &f.keys));
        assert_eq!(read_record(&f.store, &id).unwrap().agent, "claude-code");
    }

    #[test]
    fn cursor_cannot_write_or_delete_the_store() {
        let f = fixture();
        std::fs::create_dir_all(&f.store).unwrap();
        let forged = f.store.join("snap-1790000000000-000000000000.json");
        std::fs::write(&forged, "{}").unwrap();
        for tool in ["Write", "Delete"] {
            match run_hook(&f.store, &cursor_event(tool, forged.to_str().unwrap(), &f.work), T0, &f.keys) {
                HookOutcome::Blocked(reason) => assert!(reason.contains("AI 不能写"), "{tool}"),
                other => panic!("{tool}: expected block, got {other:?}"),
            }
        }
    }

    #[test]
    fn records_from_an_unknown_agent_are_not_listed_or_undone() {
        let f = fixture();
        let file = f.work.join("a.txt");
        std::fs::write(&file, "now").unwrap();
        let id = recorded(run_hook(&f.store, &cursor_event("Write", file.to_str().unwrap(), &f.work), T0, &f.keys));
        let key = f.keys.get(false).unwrap();
        let original = read_record(&f.store, &id).unwrap();
        assert!(verify_record(&original, Some(&key)));
        // The agent is covered by the MAC: relabelling breaks it.
        let mut relabelled = original.clone();
        relabelled.agent = "claude-code".into();
        assert!(!verify_record(&relabelled, Some(&key)));
        // Even correctly signed, an agent Agentrix does not know is refused.
        let mut other = original;
        other.agent = "codex".into();
        sign_record(&mut other, &key);
        std::fs::write(f.store.join(format!("{id}.json")), serde_json::to_vec(&other).unwrap()).unwrap();
        assert!(list(&f.store, None, 50, &f.keys).is_empty());
        assert_eq!(revert(&f.store, &id, &[], &f.keys).unwrap_err(), "snapshot_unreadable");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "now");
    }

    #[test]
    fn normalize_is_lexical_and_refuses_to_climb_above_root() {
        assert_eq!(normalize(Path::new("/a/./b/../c")), Some(PathBuf::from("/a/c")));
        assert_eq!(normalize(Path::new("/..")), None);
        assert_eq!(normalize(Path::new("a/b")), None);
    }
}
