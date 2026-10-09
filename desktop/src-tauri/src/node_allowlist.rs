//! L5 "always-on node", slice N0 (REQ-desktop-057 §3 / §6): the owner's
//! local allowlist. Default off.
//!
//! What it relaxes (decided in TypeScript, `nodeAllowlist.ts`; Rust only
//! answers "is this target covered?"): two L1 steps of tasks started from this
//! computer's own chat — opening a page whose origin is on the list, and
//! writing a file inside a folder on the list. Clicking, typing, keys, page
//! scripts, shell commands and anything L2 / L3 still ask every time, and
//! the emergency stop turns the list off.
//!
//! - Only the owner edits it: the add / remove / enable commands are reached
//!   from "这台电脑 → 常开节点" only; no chat tool or remote channel maps to
//!   them (not in the fence registry). Folders come from a native picker, so
//!   the path is the owner's click, not text from the WebView.
//! - Stored at `<app data>/node-allowlist.json` (0600), authenticated with
//!   HMAC-SHA256 under a key in the OS keychain
//!   (`agentrix.node_allowlist` / `mac_key_v1`). A file that does not verify
//!   (edited by a shell command, planted, keychain unreadable) counts as
//!   empty and off.
//! - Entries expire (default 30 days, at most 90).
//! - Folder matching resolves symlinks in the deepest existing ancestor, so a
//!   link inside an allowed folder that points outside is not covered.
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use zeroize::Zeroizing;

pub const FILE_NAME: &str = "node-allowlist.json";
pub const MAC_KEY_SERVICE: &str = "agentrix.node_allowlist";
pub const MAC_KEY_ACCOUNT: &str = "mac_key_v1";
const MAC_DOMAIN: &[u8] = b"agentrix.node-allowlist.v1\n";
const SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_DAYS: u32 = 30;
pub const MAX_DAYS: u32 = 90;
pub const MAX_ENTRIES: usize = 50;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    Site,
    Folder,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub kind: EntryKind,
    /// Site: `https://host[:port]`. Folder: canonical absolute path.
    pub value: String,
    pub added_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    pub schema_version: u32,
    pub enabled: bool,
    pub entries: Vec<Entry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mac: Option<String>,
}

impl Default for Store {
    fn default() -> Self {
        Store { schema_version: SCHEMA_VERSION, enabled: false, entries: Vec::new(), mac: None }
    }
}

/// How the stored file read back.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Integrity {
    /// No file yet.
    Empty,
    /// Read and verified.
    Ok,
    /// Present but unreadable or not verified: treated as empty and off.
    Tampered,
    /// The keychain key cannot be read: treated as empty and off.
    KeyUnavailable,
}

/// The MAC key (the OS keychain; tests use memory).
pub trait AllowlistKey {
    fn get(&self, create: bool) -> Option<Zeroizing<[u8; 32]>>;
}

pub struct KeychainAllowlistKey;

fn decode_key(text: &str) -> Option<Zeroizing<[u8; 32]>> {
    let bytes = Zeroizing::new(hex::decode(text.trim()).ok()?);
    let array: [u8; 32] = bytes.as_slice().try_into().ok()?;
    Some(Zeroizing::new(array))
}

impl AllowlistKey for KeychainAllowlistKey {
    fn get(&self, create: bool) -> Option<Zeroizing<[u8; 32]>> {
        let entry = keyring::Entry::new(MAC_KEY_SERVICE, MAC_KEY_ACCOUNT).ok()?;
        match entry.get_password() {
            Ok(text) => decode_key(&Zeroizing::new(text)),
            Err(keyring::Error::NoEntry) if create => {
                let fresh = Zeroizing::new(rand::random::<[u8; 32]>());
                entry.set_password(&Zeroizing::new(hex::encode(fresh.as_slice()))).ok()?;
                entry.get_password().ok().and_then(|text| decode_key(&Zeroizing::new(text)))
            }
            Err(_) => None,
        }
    }
}

fn mac_input(store: &Store) -> Option<Vec<u8>> {
    let mut unsigned = store.clone();
    unsigned.mac = None;
    let mut bytes = MAC_DOMAIN.to_vec();
    bytes.extend(serde_json::to_vec(&unsigned).ok()?);
    Some(bytes)
}

fn sign(store: &mut Store, key: &[u8; 32]) {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine as _;
    store.mac = None;
    if let Some(input) = mac_input(store) {
        let tag = ring::hmac::sign(&ring::hmac::Key::new(ring::hmac::HMAC_SHA256, key), &input);
        store.mac = Some(URL_SAFE_NO_PAD.encode(tag.as_ref()));
    }
}

fn verify(store: &Store, key: &[u8; 32]) -> bool {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine as _;
    let Some(mac) = store.mac.as_deref() else { return false };
    if store.schema_version != SCHEMA_VERSION {
        return false;
    }
    let (Ok(tag), Some(input)) = (URL_SAFE_NO_PAD.decode(mac), mac_input(store)) else {
        return false;
    };
    ring::hmac::verify(&ring::hmac::Key::new(ring::hmac::HMAC_SHA256, key), &input, &tag).is_ok()
}

/// Read the store. Anything that does not verify is empty and off.
pub fn load(path: &Path, keys: &dyn AllowlistKey) -> (Store, Integrity) {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return (Store::default(), Integrity::Empty),
        Err(_) => return (Store::default(), Integrity::Tampered),
    };
    let Ok(store) = serde_json::from_slice::<Store>(&bytes) else {
        return (Store::default(), Integrity::Tampered);
    };
    let Some(key) = keys.get(false) else {
        return (Store::default(), Integrity::KeyUnavailable);
    };
    if !verify(&store, &key) {
        return (Store::default(), Integrity::Tampered);
    }
    (store, Integrity::Ok)
}

/// Sign and write atomically (0600).
pub fn save(path: &Path, store: &Store, keys: &dyn AllowlistKey) -> Result<(), &'static str> {
    let key = keys.get(true).ok_or("allowlist_key_unavailable")?;
    let mut signed = store.clone();
    signed.schema_version = SCHEMA_VERSION;
    sign(&mut signed, &key);
    let bytes = serde_json::to_vec_pretty(&signed).map_err(|_| "allowlist_write_failed")?;
    let dir = path.parent().ok_or("allowlist_write_failed")?;
    std::fs::create_dir_all(dir).map_err(|_| "allowlist_write_failed")?;
    let temp = dir.join(format!(".{FILE_NAME}.{}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
        return Err("allowlist_write_failed");
    }
    Ok(())
}

// ── Sites ───────────────────────────────────────────────────────────────────

/// `https://host[:port]` (lowercase host, default port dropped), or
/// `http://localhost` / `http://127.0.0.1` with an optional port. No path,
/// query, user info or wildcard; an exact origin, not "any subdomain".
pub fn normalize_origin(raw: &str) -> Option<String> {
    let text = raw.trim().trim_end_matches('/');
    let (scheme, rest) = text.split_once("://")?;
    let scheme = scheme.to_ascii_lowercase();
    if rest.is_empty() || rest.contains(['/', '?', '#', '@', '*', '\\', ' ']) {
        return None;
    }
    let (host, port) = match rest.rsplit_once(':') {
        Some((host, port)) if !host.contains(']') || host.ends_with(']') => {
            if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) || port.len() > 5 {
                return None;
            }
            let number: u32 = port.parse().ok()?;
            if number == 0 || number > 65535 {
                return None;
            }
            (host, Some(number))
        }
        _ => (rest, None),
    };
    let host = host.to_ascii_lowercase();
    let label_ok = |label: &str| {
        !label.is_empty()
            && label.len() <= 63
            && label.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            && !label.starts_with('-')
            && !label.ends_with('-')
    };
    if host.is_empty() || host.len() > 253 || !host.split('.').all(label_ok) {
        return None;
    }
    let local = host == "localhost" || host == "127.0.0.1";
    match scheme.as_str() {
        "https" => {}
        "http" if local => {}
        _ => return None,
    }
    let default_port = if scheme == "https" { 443 } else { 80 };
    Some(match port {
        Some(p) if p != default_port => format!("{scheme}://{host}:{p}"),
        _ => format!("{scheme}://{host}"),
    })
}

/// The origin of a page URL, in the same normal form (None for anything
/// that is not http(s)).
pub fn origin_of_url(url: &str) -> Option<String> {
    let text = url.trim();
    let (scheme, rest) = text.split_once("://")?;
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.contains('@') {
        return None;
    }
    normalize_origin(&format!("{scheme}://{authority}"))
}

// ── Folders ─────────────────────────────────────────────────────────────────

/// Lexical normalisation; refuses to climb above root.
fn normalize(path: &Path) -> Option<PathBuf> {
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
    out.is_absolute().then_some(out)
}

/// Symlinks resolved in the deepest existing ancestor; the rest kept as is.
pub fn resolve(path: &Path) -> Option<PathBuf> {
    let path = normalize(path)?;
    let mut existing = path.clone();
    let mut rest = Vec::new();
    while !existing.exists() {
        let name = existing.file_name()?.to_os_string();
        rest.push(name);
        existing = existing.parent()?.to_path_buf();
    }
    let mut out = std::fs::canonicalize(&existing).ok()?;
    for name in rest.into_iter().rev() {
        out.push(name);
    }
    Some(out)
}

fn inside(path: &Path, folder: &Path) -> bool {
    if path.starts_with(folder) {
        return true;
    }
    if cfg!(any(target_os = "macos", windows)) {
        let (p, f) = (path.to_string_lossy().to_lowercase(), folder.to_string_lossy().to_lowercase());
        let f = f.trim_end_matches(['/', '\\']);
        return p == f || p.starts_with(&format!("{f}/")) || p.starts_with(&format!("{f}\\"));
    }
    false
}

/// Folders an allowlist entry may never cover, as `(path, also refuse its ancestors)`.
pub fn protected_folders(home: &Path, app_data: &Path) -> Vec<PathBuf> {
    let mut list = vec![app_data.to_path_buf()];
    for name in [".ssh", ".gnupg", ".aws", ".config/gcloud", ".kube", ".docker", ".claude", ".cursor", ".codex", "Library/Keychains"] {
        list.push(home.join(name));
    }
    list
}

/// A folder the owner may add: a directory, not the root, not the home
/// folder or above it, and neither inside nor above a protected folder.
pub fn check_folder(candidate: &Path, home: &Path, protected: &[PathBuf]) -> Result<PathBuf, &'static str> {
    let canonical = std::fs::canonicalize(candidate).map_err(|_| "folder_unreadable")?;
    if !canonical.is_dir() {
        return Err("folder_unreadable");
    }
    let home = std::fs::canonicalize(home).unwrap_or_else(|_| home.to_path_buf());
    if canonical.parent().is_none() || inside(&home, &canonical) {
        return Err("folder_too_broad");
    }
    for folder in protected {
        let folder = resolve(folder).unwrap_or_else(|| folder.clone());
        if inside(&canonical, &folder) || inside(&folder, &canonical) {
            return Err("folder_protected");
        }
    }
    Ok(canonical)
}

// ── Editing ─────────────────────────────────────────────────────────────────

fn new_id(now: i64) -> String {
    let bytes: [u8; 6] = rand::random();
    format!("nal-{now:013}-{}", hex::encode(bytes))
}

pub fn clamp_days(days: Option<u32>) -> u32 {
    days.unwrap_or(DEFAULT_DAYS).clamp(1, MAX_DAYS)
}

/// Add (or renew) an entry. Same kind and value: the old one is replaced.
pub fn add_entry(store: &mut Store, kind: EntryKind, value: String, days: Option<u32>, now: i64) -> Result<Entry, &'static str> {
    store.entries.retain(|entry| entry.expires_at > now && !(entry.kind == kind && entry.value == value));
    if store.entries.len() >= MAX_ENTRIES {
        return Err("allowlist_full");
    }
    let entry = Entry {
        id: new_id(now),
        kind,
        value,
        added_at: now,
        expires_at: now + i64::from(clamp_days(days)) * DAY_MS,
    };
    store.entries.push(entry.clone());
    Ok(entry)
}

pub fn remove_entry(store: &mut Store, id: &str) -> bool {
    let before = store.entries.len();
    store.entries.retain(|entry| entry.id != id);
    before != store.entries.len()
}

// ── Matching ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MatchRequest {
    /// Opening a page.
    Site { url: String },
    /// Writing a file: a workspace-relative path (Rust joins its own workspace).
    Folder { path: String },
}

/// The entry that covers this step, or None. Off, kill switch engaged,
/// expired entries and anything that does not resolve are never covered.
pub fn match_entry<'a>(
    store: &'a Store,
    request: &MatchRequest,
    workspace: Option<&Path>,
    protected: &[PathBuf],
    now: i64,
    engaged: bool,
) -> Option<&'a Entry> {
    if !store.enabled || engaged {
        return None;
    }
    let live = store.entries.iter().filter(|entry| entry.expires_at > now);
    match request {
        MatchRequest::Site { url } => {
            let origin = origin_of_url(url)?;
            live.filter(|entry| entry.kind == EntryKind::Site).find(|entry| entry.value == origin)
        }
        MatchRequest::Folder { path } => {
            let relative = Path::new(path.trim());
            let climbs = relative.components().any(|c| matches!(c, Component::ParentDir));
            if path.trim().is_empty() || relative.is_absolute() || path.contains('\0') || climbs {
                return None;
            }
            let target = resolve(&workspace?.join(relative))?;
            if protected.iter().any(|folder| inside(&target, &resolve(folder).unwrap_or_else(|| folder.clone()))) {
                return None;
            }
            live.filter(|entry| entry.kind == EntryKind::Folder)
                .find(|entry| inside(&target, Path::new(&entry.value)))
        }
    }
}

/// What the WebView sees: no MAC, expiry flagged.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub enabled: bool,
    pub integrity: Integrity,
    pub entries: Vec<ViewEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewEntry {
    pub id: String,
    pub kind: EntryKind,
    pub value: String,
    pub added_at: i64,
    pub expires_at: i64,
    pub expired: bool,
}

pub fn view(store: &Store, integrity: Integrity, now: i64) -> View {
    View {
        enabled: store.enabled,
        integrity,
        entries: store
            .entries
            .iter()
            .map(|entry| ViewEntry {
                id: entry.id.clone(),
                kind: entry.kind.clone(),
                value: entry.value.clone(),
                added_at: entry.added_at,
                expires_at: entry.expires_at,
                expired: entry.expires_at <= now,
            })
            .collect(),
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    const NOW: i64 = 1_790_000_000_000;

    #[derive(Default)]
    struct MemoryKey(std::sync::Mutex<Option<[u8; 32]>>);
    impl AllowlistKey for MemoryKey {
        fn get(&self, create: bool) -> Option<Zeroizing<[u8; 32]>> {
            let mut slot = self.0.lock().unwrap();
            if slot.is_none() && create {
                *slot = Some(rand::random());
            }
            slot.map(Zeroizing::new)
        }
    }

    struct Fixture {
        _root: tempfile::TempDir,
        home: PathBuf,
        app: PathBuf,
        work: PathBuf,
        file: PathBuf,
        keys: MemoryKey,
    }

    fn fixture() -> Fixture {
        let root = tempfile::tempdir().unwrap();
        let base = std::fs::canonicalize(root.path()).unwrap();
        let home = base.join("home");
        let app = home.join("Library/Application Support/top.agentrix.desktop");
        let work = home.join("projects/site");
        for dir in [&app, &work, &home.join(".ssh")] {
            std::fs::create_dir_all(dir).unwrap();
        }
        let file = app.join(FILE_NAME);
        Fixture { _root: root, home, app, work, file, keys: MemoryKey::default() }
    }

    fn enabled_with(f: &Fixture, entries: &[(EntryKind, String)]) -> Store {
        let mut store = Store { enabled: true, ..Store::default() };
        for (kind, value) in entries {
            add_entry(&mut store, kind.clone(), value.clone(), None, NOW).unwrap();
        }
        save(&f.file, &store, &f.keys).unwrap();
        load(&f.file, &f.keys).0
    }

    fn site(url: &str) -> MatchRequest {
        MatchRequest::Site { url: url.into() }
    }

    fn folder(path: &str) -> MatchRequest {
        MatchRequest::Folder { path: path.into() }
    }

    #[test]
    fn origins_are_exact_and_https_only_except_localhost() {
        assert_eq!(normalize_origin("https://Mail.Google.com/").as_deref(), Some("https://mail.google.com"));
        assert_eq!(normalize_origin("https://example.com:443").as_deref(), Some("https://example.com"));
        assert_eq!(normalize_origin("https://example.com:8443").as_deref(), Some("https://example.com:8443"));
        assert_eq!(normalize_origin("http://localhost:3000").as_deref(), Some("http://localhost:3000"));
        for bad in [
            "http://example.com",
            "https://*.example.com",
            "https://example.com/path",
            "https://user@example.com",
            "https://example.com?x=1",
            "ftp://example.com",
            "example.com",
            "https://",
            "https://exa mple.com",
            "https://example.com:0",
            "https://example.com:99999",
            "javascript://alert(1)",
        ] {
            assert_eq!(normalize_origin(bad), None, "{bad}");
        }
        assert_eq!(origin_of_url("https://mail.google.com/mail/u/0/#inbox").as_deref(), Some("https://mail.google.com"));
        assert_eq!(origin_of_url("https://evil.com@mail.google.com/"), None);
        assert_eq!(origin_of_url("file:///etc/passwd"), None);
    }

    #[test]
    fn a_site_entry_covers_only_its_exact_origin() {
        let f = fixture();
        let store = enabled_with(&f, &[(EntryKind::Site, "https://mail.google.com".into())]);
        let p = protected_folders(&f.home, &f.app);
        assert!(match_entry(&store, &site("https://mail.google.com/x"), Some(&f.work), &p, NOW, false).is_some());
        for url in [
            "https://google.com/",
            "https://evil.mail.google.com/",
            "https://mail.google.com.evil.com/",
            "http://mail.google.com/",
            "https://mail.google.com:8443/",
        ] {
            assert!(match_entry(&store, &site(url), Some(&f.work), &p, NOW, false).is_none(), "{url}");
        }
    }

    #[test]
    fn a_folder_entry_covers_files_inside_it_and_nothing_a_symlink_leads_out_to() {
        let f = fixture();
        let docs = f.work.join("docs");
        std::fs::create_dir_all(&docs).unwrap();
        let store = enabled_with(&f, &[(EntryKind::Folder, docs.to_string_lossy().into_owned())]);
        let p = protected_folders(&f.home, &f.app);
        assert!(match_entry(&store, &folder("docs/a.md"), Some(&f.work), &p, NOW, false).is_some());
        assert!(match_entry(&store, &folder("docs/new/dir/b.md"), Some(&f.work), &p, NOW, false).is_some());
        assert!(match_entry(&store, &folder("src/a.ts"), Some(&f.work), &p, NOW, false).is_none());
        assert!(match_entry(&store, &folder("docs-old/a.md"), Some(&f.work), &p, NOW, false).is_none());
        assert!(match_entry(&store, &folder("docs/../src/a.ts"), Some(&f.work), &p, NOW, false).is_none());
        assert!(match_entry(&store, &folder(&docs.join("a.md").to_string_lossy()), Some(&f.work), &p, NOW, false).is_none());
        assert!(match_entry(&store, &folder("docs/a.md"), None, &p, NOW, false).is_none());
        // A link inside the allowed folder that points outside it.
        std::os::unix::fs::symlink(&f.home.join(".ssh"), docs.join("keys")).unwrap();
        assert!(match_entry(&store, &folder("docs/keys/authorized_keys"), Some(&f.work), &p, NOW, false).is_none());
        let elsewhere = f.home.join("elsewhere");
        std::fs::create_dir_all(&elsewhere).unwrap();
        std::os::unix::fs::symlink(&elsewhere, docs.join("out")).unwrap();
        assert!(match_entry(&store, &folder("docs/out/x.md"), Some(&f.work), &p, NOW, false).is_none());
    }

    #[test]
    fn off_engaged_or_expired_covers_nothing() {
        let f = fixture();
        let mut store = enabled_with(&f, &[(EntryKind::Site, "https://example.com".into())]);
        let p = protected_folders(&f.home, &f.app);
        let req = site("https://example.com/");
        assert!(match_entry(&store, &req, Some(&f.work), &p, NOW, false).is_some());
        assert!(match_entry(&store, &req, Some(&f.work), &p, NOW, true).is_none(), "emergency stop");
        let expires = store.entries[0].expires_at;
        assert_eq!(expires, NOW + 30 * DAY_MS);
        assert!(match_entry(&store, &req, Some(&f.work), &p, expires, false).is_none(), "expired");
        store.enabled = false;
        assert!(match_entry(&store, &req, Some(&f.work), &p, NOW, false).is_none(), "off");
        assert_eq!(clamp_days(Some(365)), MAX_DAYS);
        assert_eq!(clamp_days(Some(0)), 1);
    }

    #[test]
    fn folders_that_are_too_broad_or_protected_cannot_be_added() {
        let f = fixture();
        let p = protected_folders(&f.home, &f.app);
        assert!(check_folder(&f.work, &f.home, &p).is_ok());
        assert_eq!(check_folder(Path::new("/"), &f.home, &p).unwrap_err(), "folder_too_broad");
        assert_eq!(check_folder(&f.home, &f.home, &p).unwrap_err(), "folder_too_broad");
        assert_eq!(check_folder(f.home.parent().unwrap(), &f.home, &p).unwrap_err(), "folder_too_broad");
        assert_eq!(check_folder(&f.home.join(".ssh"), &f.home, &p).unwrap_err(), "folder_protected");
        assert_eq!(check_folder(&f.app, &f.home, &p).unwrap_err(), "folder_protected");
        // Above a protected folder (covers it).
        assert_eq!(check_folder(&f.home.join("Library"), &f.home, &p).unwrap_err(), "folder_protected");
        assert_eq!(check_folder(&f.home.join("missing"), &f.home, &p).unwrap_err(), "folder_unreadable");
    }

    #[test]
    fn a_file_that_does_not_verify_is_empty_and_off() {
        let f = fixture();
        assert_eq!(load(&f.file, &f.keys).1, Integrity::Empty);
        let store = enabled_with(&f, &[(EntryKind::Site, "https://example.com".into())]);
        assert!(store.enabled);
        assert_eq!(load(&f.file, &f.keys).1, Integrity::Ok);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&f.file).unwrap().permissions().mode() & 0o777, 0o600);
        }
        // Edited by something without the key: a planted entry.
        let mut raw: serde_json::Value = serde_json::from_slice(&std::fs::read(&f.file).unwrap()).unwrap();
        raw["entries"][0]["value"] = serde_json::json!("https://evil.com");
        std::fs::write(&f.file, serde_json::to_vec(&raw).unwrap()).unwrap();
        let (read, integrity) = load(&f.file, &f.keys);
        assert_eq!(integrity, Integrity::Tampered);
        assert!(!read.enabled && read.entries.is_empty());
        // Signed with another key, garbage, or no key at all.
        let other = MemoryKey::default();
        save(&f.file, &store, &other).unwrap();
        assert_eq!(load(&f.file, &f.keys).1, Integrity::Tampered);
        std::fs::write(&f.file, "{ nope").unwrap();
        assert_eq!(load(&f.file, &f.keys).1, Integrity::Tampered);
        save(&f.file, &store, &f.keys).unwrap();
        assert_eq!(load(&f.file, &MemoryKey::default()).1, Integrity::KeyUnavailable);
    }

    #[test]
    fn adding_again_renews_and_the_list_is_capped() {
        let mut store = Store::default();
        let first = add_entry(&mut store, EntryKind::Site, "https://a.com".into(), Some(7), NOW).unwrap();
        let again = add_entry(&mut store, EntryKind::Site, "https://a.com".into(), Some(7), NOW + 1000).unwrap();
        assert_eq!(store.entries.len(), 1);
        assert_ne!(first.id, again.id);
        assert!(remove_entry(&mut store, &again.id));
        assert!(!remove_entry(&mut store, &again.id));
        for i in 0..MAX_ENTRIES {
            add_entry(&mut store, EntryKind::Site, format!("https://s{i}.com"), None, NOW).unwrap();
        }
        assert_eq!(add_entry(&mut store, EntryKind::Site, "https://one-more.com".into(), None, NOW).unwrap_err(), "allowlist_full");
    }

    #[test]
    fn the_view_has_no_mac() {
        let f = fixture();
        let store = enabled_with(&f, &[(EntryKind::Site, "https://example.com".into())]);
        let json = serde_json::to_string(&view(&store, Integrity::Ok, NOW)).unwrap();
        assert!(!json.contains("mac"));
        assert!(json.contains("\"expired\":false"));
    }
}
