//! Desktop D3 — third-party AI guard (Claude Code hooks), part 1.
//!
//! Agentrix's emergency stop must also stop AIs that Agentrix does not run
//! itself. Claude Code runs a PreToolUse hook before every tool call; the hook
//! script `src-tauri/hooks/agentrix-guard` (installed as `agentrix-guard.sh`)
//! blocks the call while the stop is engaged.
//!
//! This module keeps the state the script reads: `<app data>/hooks/
//! kill-switch.state`, one line, `engaged` or `released`, mode 0600 in a 0700
//! directory, replaced atomically. It is written on every change of the Rust
//! kill switch (`kill_switch::{engage, set, release}`).
//!
//! On startup the last state is kept (not overwritten with the in-memory
//! default), and an `engaged` file engages the Rust gate right away — the stop
//! survives a restart even before any window has loaded. It only ever merges
//! towards "engaged"; a `released` file never releases anything.
use serde::Serialize;
use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const STATE_FILE: &str = "kill-switch.state";
/// File name and body of the script installed into the hooks directory and
/// registered in Claude Code's user settings (`install_claude`).
pub const GUARD_SCRIPT: &str = "agentrix-guard.sh";
pub const GUARD_SCRIPT_SOURCE: &str = include_str!("../hooks/agentrix-guard");

static HOOKS_DIR: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoredState {
    Engaged,
    Released,
    /// Present but not one of the two values (the script blocks on it).
    Unrecognised,
}

/// Read the state file in `dir`. `None` when there is no file.
pub fn read_state(dir: &Path) -> Option<StoredState> {
    let raw = std::fs::read_to_string(dir.join(STATE_FILE)).ok()?;
    Some(match raw.lines().next().unwrap_or("") {
        "engaged" => StoredState::Engaged,
        "released" => StoredState::Released,
        _ => StoredState::Unrecognised,
    })
}

/// Write `engaged` / `released` atomically (temp file + rename), 0600 / 0700.
pub fn write_state(dir: &Path, engaged: bool) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    let target = dir.join(STATE_FILE);
    let temp = dir.join(format!(".{STATE_FILE}.{}.tmp", std::process::id()));
    {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(if engaged { b"engaged\n" } else { b"released\n" })?;
        file.sync_all()?;
    }
    std::fs::rename(&temp, &target)?;
    Ok(target)
}

/// Called once from `setup` with `<app data>/hooks`. Keeps the last state on
/// disk and engages the Rust gate when that state is (or cannot be read as
/// anything but) engaged.
pub fn init(dir: PathBuf) {
    let stored = read_state(&dir);
    if HOOKS_DIR.set(dir.clone()).is_err() {
        return;
    }
    match stored {
        Some(StoredState::Engaged) | Some(StoredState::Unrecognised) => crate::kill_switch::set(true),
        Some(StoredState::Released) => {}
        None => {
            let _ = write_state(&dir, crate::kill_switch::is_engaged());
        }
    }
}

/// Mirror a kill-switch change to disk. No-op until `init` has run (tests).
pub fn mirror(engaged: bool) {
    if let Some(dir) = HOOKS_DIR.get() {
        if let Err(error) = write_state(dir, engaged) {
            eprintln!("[agent_hooks] could not write {STATE_FILE}: {error}");
        }
    }
}

// ── Part 2: Claude Code user settings (`~/.claude/settings.json`) ────────────
//
// Detection reads the file in Rust and returns only a verdict; the WebView
// never sees the settings content. Install / uninstall run only from an
// explicit click in "我的 AI 们", back the original file up first, touch only
// Agentrix's own PreToolUse entry, and refuse (without writing anything) when
// the file is not a JSON object with the expected shape.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Protection {
    /// No `~/.claude` directory: Claude Code has not been used here.
    NotInstalled,
    /// Claude Code is here, the Agentrix guard is not registered.
    Unprotected,
    /// Registered with the exact command for this machine's guard script.
    Protected,
    /// Registered, but the script file is gone (re-install fixes it).
    ScriptMissing,
    /// `settings.json` exists but cannot be read or is not a JSON object.
    Unreadable,
    /// Not supported on this platform yet (Windows).
    Unsupported,
}

pub fn claude_settings_path(home: &Path) -> PathBuf {
    home.join(".claude").join("settings.json")
}

/// The hook command for this machine: the script path in single quotes.
/// Refuses a path the shell could reinterpret inside single quotes.
pub fn guard_command(hooks_dir: &Path) -> Result<String, &'static str> {
    let script = hooks_dir.join(GUARD_SCRIPT);
    let text = script.to_str().ok_or("hooks_path_not_utf8")?;
    if text.contains('\'') || text.contains('\n') || text.contains('\r') {
        return Err("hooks_path_unsafe");
    }
    Ok(format!("'{text}'"))
}

fn is_guard_hook(hook: &Value) -> bool {
    hook.get("command")
        .and_then(Value::as_str)
        .map(|command| command.contains(GUARD_SCRIPT))
        .unwrap_or(false)
}

fn matches_every_tool(group: &Value) -> bool {
    match group.get("matcher") {
        None => true,
        Some(Value::String(matcher)) => matcher.is_empty() || matcher == "*",
        _ => false,
    }
}

/// True when `settings` has a PreToolUse group for every tool whose command
/// hook runs exactly `command`.
fn has_exact_guard(settings: &Value, command: &str) -> bool {
    settings
        .pointer("/hooks/PreToolUse")
        .and_then(Value::as_array)
        .map(|groups| {
            groups.iter().any(|group| {
                matches_every_tool(group)
                    && group
                        .get("hooks")
                        .and_then(Value::as_array)
                        .map(|hooks| {
                            hooks.iter().any(|hook| {
                                hook.get("type").and_then(Value::as_str) == Some("command")
                                    && hook.get("command").and_then(Value::as_str) == Some(command)
                            })
                        })
                        .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn read_settings(path: &Path) -> Result<Option<Value>, &'static str> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(path).map_err(|_| "settings_unreadable")?;
    let value: Value = serde_json::from_str(&raw).map_err(|_| "settings_unreadable")?;
    if !value.is_object() {
        return Err("settings_unreadable");
    }
    Ok(Some(value))
}

/// The shapes we are willing to edit: `hooks` absent or an object;
/// `hooks.PreToolUse` absent or an array of objects.
fn check_editable(settings: &Value) -> Result<(), &'static str> {
    match settings.get("hooks") {
        None => Ok(()),
        Some(Value::Object(hooks)) => match hooks.get("PreToolUse") {
            None => Ok(()),
            Some(Value::Array(groups)) if groups.iter().all(Value::is_object) => Ok(()),
            _ => Err("settings_unexpected_shape"),
        },
        _ => Err("settings_unexpected_shape"),
    }
}

pub fn claude_status(home: &Path, hooks_dir: &Path) -> Protection {
    if cfg!(windows) {
        return Protection::Unsupported;
    }
    if !home.join(".claude").is_dir() {
        return Protection::NotInstalled;
    }
    let settings = match read_settings(&claude_settings_path(home)) {
        Ok(Some(value)) => value,
        Ok(None) => return Protection::Unprotected,
        Err(_) => return Protection::Unreadable,
    };
    let Ok(command) = guard_command(hooks_dir) else {
        return Protection::Unprotected;
    };
    if !has_exact_guard(&settings, &command) {
        return Protection::Unprotected;
    }
    if !hooks_dir.join(GUARD_SCRIPT).is_file() {
        return Protection::ScriptMissing;
    }
    Protection::Protected
}

/// Remove every Agentrix guard hook; drop groups this leaves empty, then an
/// empty `PreToolUse` and an empty `hooks`. Returns how many hooks it removed.
fn remove_guard_hooks(settings: &mut Value) -> usize {
    let mut removed = 0;
    let Some(hooks) = settings.get_mut("hooks").and_then(Value::as_object_mut) else {
        return 0;
    };
    if let Some(groups) = hooks.get_mut("PreToolUse").and_then(Value::as_array_mut) {
        groups.retain_mut(|group| {
            let Some(list) = group.get_mut("hooks").and_then(Value::as_array_mut) else {
                return true;
            };
            let before = list.len();
            list.retain(|hook| !is_guard_hook(hook));
            let dropped = before - list.len();
            removed += dropped;
            !(dropped > 0 && list.is_empty())
        });
        if groups.is_empty() {
            hooks.remove("PreToolUse");
        }
    }
    if hooks.is_empty() {
        if let Some(object) = settings.as_object_mut() {
            object.remove("hooks");
        }
    }
    removed
}

pub(crate) fn write_private(path: &Path, bytes: &[u8], mode: u32) -> std::io::Result<()> {
    let dir = path.parent().ok_or_else(|| std::io::Error::other("no parent"))?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let temp = dir.join(format!(".{name}.{}.agentrix.tmp", std::process::id()));
    {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(mode);
        }
        #[cfg(not(unix))]
        let _ = mode;
        let mut file = options.open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    std::fs::rename(&temp, path)
}

fn existing_mode(path: &Path) -> u32 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            return meta.permissions().mode() & 0o777;
        }
    }
    let _ = path;
    0o600
}

fn backup(path: &Path, stamp: &str) -> Result<Option<PathBuf>, &'static str> {
    if !path.exists() {
        return Ok(None);
    }
    let name = path.file_name().and_then(|n| n.to_str()).ok_or("settings_unreadable")?;
    let target = path.with_file_name(format!("{name}.agentrix-backup-{stamp}"));
    let bytes = std::fs::read(path).map_err(|_| "settings_unreadable")?;
    write_private(&target, &bytes, 0o600).map_err(|_| "backup_failed")?;
    Ok(Some(target))
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EditOutcome {
    pub status: Protection,
    pub changed: bool,
    pub backed_up: bool,
}

fn serialize(settings: &Value) -> Result<Vec<u8>, &'static str> {
    let mut bytes = serde_json::to_vec_pretty(settings).map_err(|_| "settings_unreadable")?;
    bytes.push(b'\n');
    Ok(bytes)
}

/// Install (or repair) the guard for Claude Code. `stamp` names the backup.
pub fn install_claude(home: &Path, hooks_dir: &Path, stamp: &str) -> Result<EditOutcome, &'static str> {
    if cfg!(windows) {
        return Err("unsupported_platform");
    }
    if !home.join(".claude").is_dir() {
        return Err("claude_code_not_found");
    }
    let command = guard_command(hooks_dir)?;
    let path = claude_settings_path(home);
    let original = read_settings(&path)?;
    let mut settings = original.clone().unwrap_or_else(|| json!({}));
    check_editable(&settings)?;

    // Script first: a registered hook must never point at a missing file.
    std::fs::create_dir_all(hooks_dir).map_err(|_| "script_write_failed")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(hooks_dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "script_write_failed")?;
    }
    write_private(&hooks_dir.join(GUARD_SCRIPT), GUARD_SCRIPT_SOURCE.as_bytes(), 0o700)
        .map_err(|_| "script_write_failed")?;

    if original.as_ref().map(|value| has_exact_guard(value, &command)).unwrap_or(false) {
        return Ok(EditOutcome { status: claude_status(home, hooks_dir), changed: false, backed_up: false });
    }
    remove_guard_hooks(&mut settings);
    let hooks = settings
        .as_object_mut()
        .ok_or("settings_unreadable")?
        .entry("hooks")
        .or_insert_with(|| json!({}));
    let groups = hooks
        .as_object_mut()
        .ok_or("settings_unexpected_shape")?
        .entry("PreToolUse")
        .or_insert_with(|| json!([]));
    groups
        .as_array_mut()
        .ok_or("settings_unexpected_shape")?
        .push(json!({
            "matcher": "*",
            "hooks": [{ "type": "command", "command": command, "timeout": 10 }]
        }));
    let backed_up = backup(&path, stamp)?.is_some();
    let mode = if original.is_some() { existing_mode(&path) } else { 0o600 };
    write_private(&path, &serialize(&settings)?, mode).map_err(|_| "settings_write_failed")?;
    Ok(EditOutcome { status: claude_status(home, hooks_dir), changed: true, backed_up })
}

/// Remove the guard from Claude Code's settings. The script file stays (it is
/// harmless on its own); nothing else in the file changes.
pub fn uninstall_claude(home: &Path, hooks_dir: &Path, stamp: &str) -> Result<EditOutcome, &'static str> {
    if cfg!(windows) {
        return Err("unsupported_platform");
    }
    let path = claude_settings_path(home);
    let Some(original) = read_settings(&path)? else {
        return Ok(EditOutcome { status: claude_status(home, hooks_dir), changed: false, backed_up: false });
    };
    let mut settings = original.clone();
    if remove_guard_hooks(&mut settings) == 0 {
        return Ok(EditOutcome { status: claude_status(home, hooks_dir), changed: false, backed_up: false });
    }
    let backed_up = backup(&path, stamp)?.is_some();
    write_private(&path, &serialize(&settings)?, existing_mode(&path)).map_err(|_| "settings_write_failed")?;
    Ok(EditOutcome { status: claude_status(home, hooks_dir), changed: true, backed_up })
}

/// The directory `init` was given (`<app data>/hooks`).
pub fn hooks_dir() -> Option<PathBuf> {
    HOOKS_DIR.get().cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_round_trips_and_replaces_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let hooks = dir.path().join("hooks");
        assert_eq!(read_state(&hooks), None);
        write_state(&hooks, true).unwrap();
        assert_eq!(read_state(&hooks), Some(StoredState::Engaged));
        write_state(&hooks, false).unwrap();
        assert_eq!(read_state(&hooks), Some(StoredState::Released));
        assert_eq!(std::fs::read_to_string(hooks.join(STATE_FILE)).unwrap(), "released\n");
        // No temp files left behind.
        let names: Vec<String> = std::fs::read_dir(&hooks)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec![STATE_FILE.to_string()]);
    }

    #[cfg(unix)]
    #[test]
    fn state_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let hooks = dir.path().join("hooks");
        let path = write_state(&hooks, true).unwrap();
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        assert_eq!(std::fs::metadata(&hooks).unwrap().permissions().mode() & 0o777, 0o700);
    }

    #[test]
    fn anything_but_the_two_values_is_unrecognised() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(STATE_FILE), "Engaged\n").unwrap();
        assert_eq!(read_state(dir.path()), Some(StoredState::Unrecognised));
        std::fs::write(dir.path().join(STATE_FILE), "").unwrap();
        assert_eq!(read_state(dir.path()), Some(StoredState::Unrecognised));
        std::fs::write(dir.path().join(STATE_FILE), "engaged").unwrap();
        assert_eq!(read_state(dir.path()), Some(StoredState::Engaged));
    }

    #[test]
    fn the_guard_script_is_embedded_and_never_prints_to_stdout() {
        assert!(GUARD_SCRIPT_SOURCE.starts_with("#!/bin/sh"));
        assert!(GUARD_SCRIPT_SOURCE.contains(STATE_FILE));
        // Every `echo` in the script goes to stderr: an empty stdout means
        // "no opinion" to Claude Code, so the guard can never auto-approve.
        for line in GUARD_SCRIPT_SOURCE.lines() {
            let code = line.trim_start();
            if code.starts_with("echo ") {
                assert!(code.ends_with(">&2"), "stdout write in guard: {line}");
            }
        }
    }

    // ── Part 2: Claude Code settings ────────────────────────────────────────

    struct Fixture {
        _root: tempfile::TempDir,
        home: PathBuf,
        hooks: PathBuf,
    }

    fn fixture(with_claude_dir: bool) -> Fixture {
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("home");
        std::fs::create_dir_all(&home).unwrap();
        if with_claude_dir {
            std::fs::create_dir_all(home.join(".claude")).unwrap();
        }
        let hooks = root.path().join("Application Support").join("top.agentrix.desktop").join("hooks");
        Fixture { _root: root, home, hooks }
    }

    fn settings_of(f: &Fixture) -> Value {
        serde_json::from_str(&std::fs::read_to_string(claude_settings_path(&f.home)).unwrap()).unwrap()
    }

    fn guard_hooks_in(settings: &Value) -> usize {
        settings
            .pointer("/hooks/PreToolUse")
            .and_then(Value::as_array)
            .map(|groups| {
                groups
                    .iter()
                    .flat_map(|group| group.get("hooks").and_then(Value::as_array).cloned().unwrap_or_default())
                    .filter(is_guard_hook)
                    .count()
            })
            .unwrap_or(0)
    }

    fn backups(f: &Fixture) -> Vec<PathBuf> {
        std::fs::read_dir(f.home.join(".claude"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.to_string_lossy().contains(".agentrix-backup-"))
            .collect()
    }

    #[cfg(unix)]
    #[test]
    fn status_reports_each_state_honestly() {
        let absent = fixture(false);
        assert_eq!(claude_status(&absent.home, &absent.hooks), Protection::NotInstalled);
        let f = fixture(true);
        assert_eq!(claude_status(&f.home, &f.hooks), Protection::Unprotected);
        std::fs::write(claude_settings_path(&f.home), "{ not json").unwrap();
        assert_eq!(claude_status(&f.home, &f.hooks), Protection::Unreadable);
        std::fs::write(claude_settings_path(&f.home), "[]").unwrap();
        assert_eq!(claude_status(&f.home, &f.hooks), Protection::Unreadable);
    }

    #[cfg(unix)]
    #[test]
    fn install_creates_settings_and_an_owner_only_script() {
        use std::os::unix::fs::PermissionsExt;
        let f = fixture(true);
        let outcome = install_claude(&f.home, &f.hooks, "t1").unwrap();
        assert_eq!(outcome, EditOutcome { status: Protection::Protected, changed: true, backed_up: false });
        let script = f.hooks.join(GUARD_SCRIPT);
        assert_eq!(std::fs::read_to_string(&script).unwrap(), GUARD_SCRIPT_SOURCE);
        assert_eq!(std::fs::metadata(&script).unwrap().permissions().mode() & 0o777, 0o700);
        let path = claude_settings_path(&f.home);
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        let settings = settings_of(&f);
        assert_eq!(settings["hooks"]["PreToolUse"][0]["matcher"], "*");
        assert_eq!(settings["hooks"]["PreToolUse"][0]["hooks"][0]["command"], guard_command(&f.hooks).unwrap());
        assert!(guard_command(&f.hooks).unwrap().starts_with('\''));
    }

    #[cfg(unix)]
    #[test]
    fn install_keeps_everything_else_and_backs_up_the_original_bytes() {
        use std::os::unix::fs::PermissionsExt;
        let f = fixture(true);
        let path = claude_settings_path(&f.home);
        let original = r#"{
  "permissions": { "allow": ["Bash(ls:*)"] },
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "/usr/local/bin/other-guard" }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "/usr/local/bin/fmt" }] }]
  },
  "model": "sonnet"
}"#;
        std::fs::write(&path, original).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        let outcome = install_claude(&f.home, &f.hooks, "t2").unwrap();
        assert!(outcome.changed && outcome.backed_up);
        let settings = settings_of(&f);
        assert_eq!(settings["permissions"]["allow"][0], "Bash(ls:*)");
        assert_eq!(settings["model"], "sonnet");
        assert_eq!(settings["hooks"]["PostToolUse"][0]["hooks"][0]["command"], "/usr/local/bin/fmt");
        assert_eq!(settings["hooks"]["PreToolUse"][0]["hooks"][0]["command"], "/usr/local/bin/other-guard");
        assert_eq!(guard_hooks_in(&settings), 1);
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o644);
        let saved = backups(&f);
        assert_eq!(saved.len(), 1);
        assert_eq!(std::fs::read_to_string(&saved[0]).unwrap(), original);
    }

    #[cfg(unix)]
    #[test]
    fn install_is_idempotent_and_replaces_a_stale_entry() {
        let f = fixture(true);
        let path = claude_settings_path(&f.home);
        std::fs::write(
            &path,
            r#"{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"'/old/place/agentrix-guard.sh'"}]}]}}"#,
        )
        .unwrap();
        assert_eq!(claude_status(&f.home, &f.hooks), Protection::Unprotected);
        install_claude(&f.home, &f.hooks, "t3").unwrap();
        let again = install_claude(&f.home, &f.hooks, "t4").unwrap();
        assert!(!again.changed);
        let settings = settings_of(&f);
        assert_eq!(guard_hooks_in(&settings), 1);
        assert_eq!(settings["hooks"]["PreToolUse"][0]["hooks"][0]["command"], guard_command(&f.hooks).unwrap());
        assert_eq!(claude_status(&f.home, &f.hooks), Protection::Protected);
    }

    #[cfg(unix)]
    #[test]
    fn install_refuses_unexpected_shapes_without_writing_anything() {
        for body in [
            r#"{"hooks":[]}"#,
            r#"{"hooks":{"PreToolUse":{}}}"#,
            r#"{"hooks":{"PreToolUse":["not an object"]}}"#,
            "{ not json",
            "[]",
        ] {
            let f = fixture(true);
            let path = claude_settings_path(&f.home);
            std::fs::write(&path, body).unwrap();
            assert!(install_claude(&f.home, &f.hooks, "t5").is_err(), "{body}");
            assert_eq!(std::fs::read_to_string(&path).unwrap(), body);
            assert!(backups(&f).is_empty());
            assert!(!f.hooks.join(GUARD_SCRIPT).exists());
        }
    }

    #[cfg(unix)]
    #[test]
    fn install_needs_claude_code_and_a_safe_path() {
        let absent = fixture(false);
        assert_eq!(install_claude(&absent.home, &absent.hooks, "t6").unwrap_err(), "claude_code_not_found");
        assert!(!claude_settings_path(&absent.home).exists());
        let f = fixture(true);
        let unsafe_dir = f.hooks.join("it's");
        assert_eq!(install_claude(&f.home, &unsafe_dir, "t7").unwrap_err(), "hooks_path_unsafe");
        assert!(!claude_settings_path(&f.home).exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_guard_limited_to_one_tool_does_not_count_and_a_missing_script_is_reported() {
        let f = fixture(true);
        let command = guard_command(&f.hooks).unwrap();
        std::fs::write(
            claude_settings_path(&f.home),
            json!({"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":command}]}]}}).to_string(),
        )
        .unwrap();
        assert_eq!(claude_status(&f.home, &f.hooks), Protection::Unprotected);
        install_claude(&f.home, &f.hooks, "t8").unwrap();
        std::fs::remove_file(f.hooks.join(GUARD_SCRIPT)).unwrap();
        assert_eq!(claude_status(&f.home, &f.hooks), Protection::ScriptMissing);
        assert_eq!(install_claude(&f.home, &f.hooks, "t9").unwrap().status, Protection::Protected);
    }

    #[cfg(unix)]
    #[test]
    fn uninstall_removes_only_the_guard_and_backs_up() {
        let f = fixture(true);
        let path = claude_settings_path(&f.home);
        std::fs::write(
            &path,
            r#"{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"/usr/local/bin/other-guard"}]}]},"model":"opus"}"#,
        )
        .unwrap();
        install_claude(&f.home, &f.hooks, "t10").unwrap();
        let outcome = uninstall_claude(&f.home, &f.hooks, "t11").unwrap();
        assert_eq!(outcome, EditOutcome { status: Protection::Unprotected, changed: true, backed_up: true });
        let settings = settings_of(&f);
        assert_eq!(guard_hooks_in(&settings), 0);
        assert_eq!(settings["model"], "opus");
        assert_eq!(settings["hooks"]["PreToolUse"].as_array().unwrap().len(), 1);
        assert_eq!(settings["hooks"]["PreToolUse"][0]["hooks"][0]["command"], "/usr/local/bin/other-guard");
        assert_eq!(backups(&f).len(), 2);
        // Nothing to remove the second time: no write, no backup.
        assert!(!uninstall_claude(&f.home, &f.hooks, "t12").unwrap().changed);
        assert_eq!(backups(&f).len(), 2);
    }

    #[cfg(unix)]
    #[test]
    fn uninstall_drops_containers_it_emptied() {
        let f = fixture(true);
        install_claude(&f.home, &f.hooks, "t13").unwrap();
        uninstall_claude(&f.home, &f.hooks, "t14").unwrap();
        assert_eq!(settings_of(&f), json!({}));
    }
}
