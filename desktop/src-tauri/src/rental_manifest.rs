//! L8 DG6: the signed list of inference programs and models for rented jobs, and the device config written from it
//! (`rental-inference.json`, read by `rental_jobs::load_config`).
//!
//! The list is a compact JWS (`<header>.<payload>.<signature>`, Ed25519 = "EdDSA") signed by a PERSON's release key and
//! served by the backend (`GET /device-rental/manifest`, `backend/.../device-rental-manifest.ts`). This side does not
//! trust the server: it checks the signature against the signer keys built into the app
//! (`AGENTRIX_RENTAL_MANIFEST_SIGNERS` at build time, a JSON object `kid -> Ed25519 JWK`; none built in means no list
//! ever verifies), the validity window and the shape, then looks for the files of one entry for THIS platform in the
//! app's `rental-runtime` folder. Only when every file is a regular file (not a link) with the listed SHA-256 and size
//! is `rental-inference.json` written. Nothing is downloaded and nothing is executed here. A renter cannot bring a model:
//! the model is whatever the signed list pins.
use crate::rental_inference::{self, ModelEntry, PinnedFile, RuntimeEntry};
use crate::rental_jobs::InferenceConfig;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::Deserialize;
use std::path::Path;

pub const SCOPE: &str = "device_rental_inference_v1";
/// Build-time environment variable with the signer allowlist (JSON `kid -> Ed25519 JWK`). Empty by default.
#[allow(dead_code)] // documents the name `compiled_signers` reads through `option_env!`
pub const SIGNERS_BUILD_ENV: &str = "AGENTRIX_RENTAL_MANIFEST_SIGNERS";
/// Folder (inside the app data directory) where the owner puts the files the list names.
pub const RUNTIME_DIR_NAME: &str = "rental-runtime";
const JWS_CHARS_MAX: usize = 262_144;
const LIFETIME_SECS_MAX: i64 = 90 * 24 * 60 * 60;
const ENTRIES_MAX: usize = 16;
const LIBRARIES_MAX: usize = 16;
const ARGS_MAX: usize = 32;
const ARG_CHARS_MAX: usize = 256;
const FILE_SIZE_MAX: u64 = 64 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FileSpec {
    pub name: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RuntimeSpec {
    pub runtime_id: String,
    pub binary: FileSpec,
    pub libraries: Vec<FileSpec>,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ModelSpec {
    pub model_id: String,
    pub file: FileSpec,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntrySpec {
    pub entry_id: String,
    pub platform: String,
    pub runtime: RuntimeSpec,
    pub model: ModelSpec,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Manifest {
    pub manifest_version: u32,
    pub scope: String,
    pub issued_at: String,
    pub expires_at: String,
    pub entries: Vec<EntrySpec>,
}

/// kid and the 32 raw bytes of its Ed25519 public key.
pub type Signer = (String, Vec<u8>);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Provisioned {
    pub entry_id: String,
    pub runtime_id: String,
    pub model_id: String,
}

fn id_ok(value: &str) -> bool {
    !value.is_empty() && value.len() <= 64 && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

fn file_name_ok(value: &str) -> bool {
    let bytes = value.as_bytes();
    !value.is_empty()
        && value.len() <= 128
        && bytes[0].is_ascii_alphanumeric()
        && bytes.iter().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
        && !value.contains("..")
}

fn sha256_ok(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn platform_ok(value: &str) -> bool {
    let Some((os, arch)) = value.split_once('-') else { return false };
    matches!(os, "macos" | "linux" | "windows") && matches!(arch, "x86_64" | "aarch64")
}

/// `{model}` and `{max_tokens}` are the only placeholders, at most one per argument; any other brace is refused.
fn arg_ok(value: &str) -> bool {
    if value.len() > ARG_CHARS_MAX || value.chars().any(|c| c.is_control()) {
        return false;
    }
    let rest = value.replacen("{model}", "", 1);
    let rest = if rest.len() == value.len() { rest.replacen("{max_tokens}", "", 1) } else { rest };
    !rest.contains('{') && !rest.contains('}')
}

fn file_ok(file: &FileSpec) -> bool {
    file_name_ok(&file.name) && sha256_ok(&file.sha256) && file.size >= 1 && file.size <= FILE_SIZE_MAX
}

fn unix_of(text: &str) -> Option<i64> {
    if !text.ends_with('Z') {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(text).ok().map(|at| at.timestamp())
}

/// Signer keys from a JSON object `kid -> Ed25519 JWK`. Anything malformed, private or not Ed25519 is dropped.
pub fn parse_signers(json: &str) -> Vec<Signer> {
    let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(json) else { return Vec::new() };
    let mut out = Vec::new();
    for (kid, jwk) in map {
        let Some(jwk) = jwk.as_object() else { continue };
        if !id_ok(&kid)
            || jwk.get("kty").and_then(|v| v.as_str()) != Some("OKP")
            || jwk.get("crv").and_then(|v| v.as_str()) != Some("Ed25519")
            || jwk.contains_key("d")
        {
            continue;
        }
        let Some(x) = jwk.get("x").and_then(|v| v.as_str()) else { continue };
        if let Ok(bytes) = URL_SAFE_NO_PAD.decode(x) {
            if bytes.len() == 32 {
                out.push((kid, bytes));
            }
        }
    }
    out
}

/// The signer keys built into this app. Empty unless the release build set `AGENTRIX_RENTAL_MANIFEST_SIGNERS`.
pub fn compiled_signers() -> Vec<Signer> {
    parse_signers(option_env!("AGENTRIX_RENTAL_MANIFEST_SIGNERS").unwrap_or(""))
}

fn validate(manifest: &Manifest, now_unix: i64) -> Result<(), &'static str> {
    if manifest.manifest_version != 1 || manifest.scope != SCOPE {
        return Err("manifest_invalid");
    }
    let (Some(issued), Some(expires)) = (unix_of(&manifest.issued_at), unix_of(&manifest.expires_at)) else {
        return Err("manifest_invalid");
    };
    if expires <= issued || expires - issued > LIFETIME_SECS_MAX {
        return Err("manifest_invalid");
    }
    if manifest.entries.is_empty() || manifest.entries.len() > ENTRIES_MAX {
        return Err("manifest_invalid");
    }
    let mut ids = std::collections::HashSet::new();
    for entry in &manifest.entries {
        if !ids.insert(entry.entry_id.as_str()) || !id_ok(&entry.entry_id) || !platform_ok(&entry.platform) {
            return Err("manifest_invalid");
        }
        let runtime = &entry.runtime;
        if !id_ok(&runtime.runtime_id) || !id_ok(&entry.model.model_id) || runtime.libraries.len() > LIBRARIES_MAX || runtime.args.len() > ARGS_MAX {
            return Err("manifest_invalid");
        }
        if !runtime.args.iter().all(|arg| arg_ok(arg)) {
            return Err("manifest_invalid");
        }
        let mut names = std::collections::HashSet::new();
        for file in std::iter::once(&runtime.binary).chain(runtime.libraries.iter()).chain(std::iter::once(&entry.model.file)) {
            if !file_ok(file) || !names.insert(file.name.as_str()) {
                return Err("manifest_invalid");
            }
        }
    }
    if now_unix < issued {
        return Err("manifest_not_yet_valid");
    }
    if now_unix >= expires {
        return Err("manifest_expired");
    }
    Ok(())
}

/// Check a compact JWS against the signers and the clock; returns the list only when everything holds.
pub fn verify(jws: &str, signers: &[Signer], now_unix: i64) -> Result<Manifest, &'static str> {
    if jws.is_empty() || jws.len() > JWS_CHARS_MAX {
        return Err("manifest_malformed");
    }
    let parts: Vec<&str> = jws.split('.').collect();
    let b64url = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if parts.len() != 3 || !parts.iter().all(|part| b64url(part)) || parts[2].len() != 86 {
        return Err("manifest_malformed");
    }
    let header = URL_SAFE_NO_PAD.decode(parts[0]).map_err(|_| "manifest_malformed")?;
    let header: serde_json::Value = serde_json::from_slice(&header).map_err(|_| "manifest_malformed")?;
    let kid = header.get("kid").and_then(|v| v.as_str()).filter(|kid| id_ok(kid)).ok_or("manifest_malformed")?;
    let (_, key) = signers.iter().find(|(name, _)| name == kid).ok_or("signer_unknown")?;
    // The header must be exactly what the signer builds: no other alg, no `crit`, no extra member.
    if parts[0] != URL_SAFE_NO_PAD.encode(format!("{{\"alg\":\"EdDSA\",\"kid\":\"{kid}\"}}")) {
        return Err("signature_invalid");
    }
    let signature = URL_SAFE_NO_PAD.decode(parts[2]).map_err(|_| "manifest_malformed")?;
    let signing_input = format!("{}.{}", parts[0], parts[1]);
    UnparsedPublicKey::new(&ED25519, key).verify(signing_input.as_bytes(), &signature).map_err(|_| "signature_invalid")?;
    let payload = URL_SAFE_NO_PAD.decode(parts[1]).map_err(|_| "manifest_malformed")?;
    let manifest: Manifest = serde_json::from_slice(&payload).map_err(|_| "manifest_invalid")?;
    validate(&manifest, now_unix)?;
    Ok(manifest)
}

/// `macos-x86_64`, `macos-aarch64`, `linux-x86_64`, `windows-x86_64` ...
pub fn current_platform() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

fn pinned(dir: &Path, file: &FileSpec) -> Result<PinnedFile, &'static str> {
    let pin = PinnedFile { path: dir.join(&file.name), sha256: file.sha256.clone() };
    rental_inference::verify_pinned(&pin)?;
    // The listed size must be the real size too (a second check beside the digest).
    let meta = std::fs::symlink_metadata(&pin.path).map_err(|_| "pinned_file_missing")?;
    if meta.len() != file.size {
        return Err("pinned_file_size_mismatch");
    }
    Ok(pin)
}

fn config_for(entry: &EntrySpec, dir: &Path) -> Result<InferenceConfig, &'static str> {
    let binary = pinned(dir, &entry.runtime.binary)?;
    let libraries = entry.runtime.libraries.iter().map(|library| pinned(dir, library)).collect::<Result<Vec<_>, _>>()?;
    let file = pinned(dir, &entry.model.file)?;
    Ok(InferenceConfig {
        runtime: RuntimeEntry { runtime_id: entry.runtime.runtime_id.clone(), binary, libraries, args: entry.runtime.args.clone() },
        model: ModelEntry { model_id: entry.model.model_id.clone(), file },
    })
}

/// Writes `out` from the first entry for `platform` whose files are all in `dir` and match. Nothing is written when no
/// entry matches (an older config stays as it was). `dir` must be an absolute folder.
pub fn provision(manifest: &Manifest, platform: &str, dir: &Path, out: &Path) -> Result<Provisioned, &'static str> {
    if !dir.is_absolute() {
        return Err("runtime_dir_unsafe");
    }
    let mut seen = false;
    for entry in manifest.entries.iter().filter(|entry| entry.platform == platform) {
        seen = true;
        let Ok(config) = config_for(entry, dir) else { continue };
        let text = serde_json::to_vec_pretty(&config).map_err(|_| "config_unwritable")?;
        let temp = out.with_extension("json.tmp");
        std::fs::write(&temp, &text).map_err(|_| "config_unwritable")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600));
        }
        std::fs::rename(&temp, out).map_err(|_| "config_unwritable")?;
        return Ok(Provisioned { entry_id: entry.entry_id.clone(), runtime_id: entry.runtime.runtime_id.clone(), model_id: entry.model.model_id.clone() });
    }
    Err(if seen { "files_not_ready" } else { "no_entry_for_platform" })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::rand::SystemRandom;
    use ring::signature::{Ed25519KeyPair, KeyPair};
    use sha2::{Digest, Sha256};

    const NOW: i64 = 1_791_590_400; // 2026-10-10T00:00:00Z

    struct Key {
        pair: Ed25519KeyPair,
    }

    fn key() -> Key {
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
        Key { pair: Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap() }
    }

    fn signers_of(kid: &str, key: &Key) -> Vec<Signer> {
        vec![(kid.to_string(), key.pair.public_key().as_ref().to_vec())]
    }

    fn sign(kid: &str, key: &Key, payload: &str) -> String {
        let header = URL_SAFE_NO_PAD.encode(format!("{{\"alg\":\"EdDSA\",\"kid\":\"{kid}\"}}"));
        sign_with_header(&header, key, payload)
    }

    fn sign_with_header(header: &str, key: &Key, payload: &str) -> String {
        let body = URL_SAFE_NO_PAD.encode(payload);
        let signature = key.pair.sign(format!("{header}.{body}").as_bytes());
        format!("{header}.{body}.{}", URL_SAFE_NO_PAD.encode(signature.as_ref()))
    }

    fn hex_sha(bytes: &[u8]) -> String {
        hex::encode(Sha256::digest(bytes))
    }

    fn payload(entries: &str) -> String {
        format!(
            "{{\"manifestVersion\":1,\"scope\":\"device_rental_inference_v1\",\"issuedAt\":\"2026-10-01T00:00:00Z\",\"expiresAt\":\"2026-12-01T00:00:00Z\",\"entries\":[{entries}]}}"
        )
    }

    fn entry(id: &str, platform: &str, binary: (&str, &[u8]), model: (&str, &[u8])) -> String {
        format!(
            "{{\"entryId\":\"{id}\",\"platform\":\"{platform}\",\"runtime\":{{\"runtimeId\":\"rt\",\"binary\":{{\"name\":\"{}\",\"sha256\":\"{}\",\"size\":{}}},\"libraries\":[],\"args\":[\"-m\",\"{{model}}\",\"-n\",\"{{max_tokens}}\"]}},\"model\":{{\"modelId\":\"m\",\"file\":{{\"name\":\"{}\",\"sha256\":\"{}\",\"size\":{}}}}}}}",
            binary.0,
            hex_sha(binary.1),
            binary.1.len(),
            model.0,
            hex_sha(model.1),
            model.1.len()
        )
    }

    fn basic() -> String {
        payload(&entry("e1", "macos-x86_64", ("llama", b"binary-bytes"), ("tiny.gguf", b"model-bytes")))
    }

    #[test]
    fn a_list_signed_by_an_allowed_key_inside_its_window_is_accepted() {
        let k = key();
        let manifest = verify(&sign("rel-1", &k, &basic()), &signers_of("rel-1", &k), NOW).unwrap();
        assert_eq!(manifest.entries[0].entry_id, "e1");
    }

    #[test]
    fn no_signers_an_unknown_signer_another_key_or_a_changed_payload_never_verify() {
        let (k, other) = (key(), key());
        let jws = sign("rel-1", &k, &basic());
        assert_eq!(verify(&jws, &[], NOW), Err("signer_unknown"));
        assert_eq!(verify(&jws, &signers_of("someone-else", &k), NOW), Err("signer_unknown"));
        assert_eq!(verify(&jws, &signers_of("rel-1", &other), NOW), Err("signature_invalid"));
        let parts: Vec<&str> = jws.split('.').collect();
        let swapped = URL_SAFE_NO_PAD.encode(basic().replace("e1", "e2"));
        assert_eq!(verify(&format!("{}.{swapped}.{}", parts[0], parts[2]), &signers_of("rel-1", &k), NOW), Err("signature_invalid"));
    }

    #[test]
    fn a_header_that_is_not_exactly_the_signers_is_refused_even_when_signed() {
        let k = key();
        for header in [
            "{\"alg\":\"EdDSA\",\"kid\":\"rel-1\",\"crit\":[\"x\"]}",
            "{\"kid\":\"rel-1\",\"alg\":\"EdDSA\"}",
            "{\"alg\":\"none\",\"kid\":\"rel-1\"}",
            "{\"alg\":\"HS256\",\"kid\":\"rel-1\"}",
        ] {
            let jws = sign_with_header(&URL_SAFE_NO_PAD.encode(header), &k, &basic());
            assert_eq!(verify(&jws, &signers_of("rel-1", &k), NOW), Err("signature_invalid"), "{header}");
        }
    }

    #[test]
    fn malformed_input_is_refused() {
        let k = key();
        let signers = signers_of("rel-1", &k);
        for bad in ["", "a.b", "a.b.c.d", "a.b.c", &"x".repeat(300_000)] {
            assert_eq!(verify(bad, &signers, NOW), Err("manifest_malformed"));
        }
    }

    #[test]
    fn expired_not_yet_valid_and_over_long_lifetimes_are_refused() {
        let k = key();
        let signers = signers_of("rel-1", &k);
        let jws = sign("rel-1", &k, &basic());
        assert_eq!(verify(&jws, &signers, 1_796_083_200), Err("manifest_expired")); // 2026-12-01
        assert_eq!(verify(&jws, &signers, 1_790_726_400), Err("manifest_not_yet_valid")); // 2026-09-30
        let long = basic().replace("2026-12-01T00:00:00Z", "2027-03-01T00:00:00Z");
        assert_eq!(verify(&sign("rel-1", &k, &long), &signers, NOW), Err("manifest_invalid"));
    }

    #[test]
    fn unknown_fields_path_names_bad_digests_and_other_placeholders_are_refused() {
        let k = key();
        let signers = signers_of("rel-1", &k);
        let cases = [
            basic().replace("\"scope\"", "\"extra\":1,\"scope\""),
            basic().replace("\"name\":\"llama\"", "\"name\":\"../llama\""),
            basic().replace("\"name\":\"llama\"", "\"name\":\"bin/llama\""),
            basic().replace("\"args\":[\"-m\"", "\"args\":[\"{prompt}\",\"-m\""),
            basic().replace("\"libraries\":[]", "\"libraries\":[],\"x\":1"),
            basic().replace("macos-x86_64", "macos"),
            basic().replace("\"size\":12", "\"size\":0"),
            payload(""),
        ];
        for case in cases {
            assert_eq!(verify(&sign("rel-1", &k, &case), &signers, NOW), Err("manifest_invalid"), "{case}");
        }
        // A digest that is not lower-case hex.
        let digest = hex_sha(b"binary-bytes");
        assert_eq!(verify(&sign("rel-1", &k, &basic().replace(&digest, &digest.to_uppercase())), &signers, NOW), Err("manifest_invalid"));
    }

    #[test]
    fn signer_keys_are_parsed_and_private_or_wrong_type_entries_are_dropped() {
        let x = URL_SAFE_NO_PAD.encode([7u8; 32]);
        let good = format!("{{\"a\":{{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"{x}\"}}}}");
        assert_eq!(parse_signers(&good), vec![("a".to_string(), vec![7u8; 32])]);
        for bad in [
            format!("{{\"a\":{{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"{x}\",\"d\":\"AAAA\"}}}}"),
            format!("{{\"a\":{{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"{x}\"}}}}"),
            "{\"a\":{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"short\"}}".to_string(),
            "not json".to_string(),
            String::new(),
        ] {
            assert!(parse_signers(&bad).is_empty(), "{bad}");
        }
        // No signers built into this test build: nothing verifies.
        assert!(option_env!("AGENTRIX_RENTAL_MANIFEST_SIGNERS").is_none() || !compiled_signers().is_empty());
    }

    fn put(dir: &Path, name: &str, bytes: &[u8]) {
        std::fs::write(dir.join(name), bytes).unwrap();
    }

    #[test]
    fn matching_files_for_this_platform_write_the_config_and_nothing_else_does() {
        let k = key();
        let signers = signers_of("rel-1", &k);
        let manifest = verify(&sign("rel-1", &k, &basic()), &signers, NOW).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("rental-inference.json");
        // Nothing in the folder yet: nothing written.
        assert_eq!(provision(&manifest, "macos-x86_64", dir.path(), &out), Err("files_not_ready"));
        assert!(!out.exists());
        put(dir.path(), "llama", b"binary-bytes");
        put(dir.path(), "tiny.gguf", b"model-bytes");
        // Another platform has no entry.
        assert_eq!(provision(&manifest, "linux-x86_64", dir.path(), &out), Err("no_entry_for_platform"));
        assert!(!out.exists());
        let done = provision(&manifest, "macos-x86_64", dir.path(), &out).unwrap();
        assert_eq!((done.entry_id.as_str(), done.model_id.as_str()), ("e1", "m"));
        let config = crate::rental_jobs::load_config(&out).expect("the config reads back");
        assert_eq!(config.model.file.sha256, hex_sha(b"model-bytes"));
        assert_eq!(config.runtime.binary.path, dir.path().join("llama"));
        assert!(crate::rental_jobs::config_ready(&config));
    }

    #[test]
    fn a_changed_file_a_wrong_size_or_a_link_writes_nothing_and_leaves_the_old_config() {
        let k = key();
        let manifest = verify(&sign("rel-1", &k, &basic()), &signers_of("rel-1", &k), NOW).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("rental-inference.json");
        std::fs::write(&out, "OLD").unwrap();
        put(dir.path(), "llama", b"binary-bytes");
        put(dir.path(), "tiny.gguf", b"model-bytez");
        assert_eq!(provision(&manifest, "macos-x86_64", dir.path(), &out), Err("files_not_ready"));
        assert_eq!(std::fs::read_to_string(&out).unwrap(), "OLD");
        // Same size, wrong content is caught by the digest; a different size by the size check.
        put(dir.path(), "tiny.gguf", b"model-bytes-longer");
        assert_eq!(provision(&manifest, "macos-x86_64", dir.path(), &out), Err("files_not_ready"));
        // A symbolic link in place of a pinned file is refused.
        #[cfg(unix)]
        {
            let target = dir.path().join("elsewhere");
            put(dir.path(), "elsewhere", b"model-bytes");
            std::fs::remove_file(dir.path().join("tiny.gguf")).unwrap();
            std::os::unix::fs::symlink(&target, dir.path().join("tiny.gguf")).unwrap();
            assert_eq!(provision(&manifest, "macos-x86_64", dir.path(), &out), Err("files_not_ready"));
        }
        assert_eq!(std::fs::read_to_string(&out).unwrap(), "OLD");
        assert_eq!(provision(&manifest, "macos-x86_64", Path::new("relative/dir"), &out), Err("runtime_dir_unsafe"));
    }

    #[test]
    fn the_second_entry_is_used_when_the_first_one_is_not_on_disk() {
        let k = key();
        let two = payload(&format!(
            "{},{}",
            entry("big", "macos-x86_64", ("llama", b"binary-bytes"), ("big.gguf", b"big-model")),
            entry("small", "macos-x86_64", ("llama", b"binary-bytes"), ("tiny.gguf", b"model-bytes"))
        ));
        let manifest = verify(&sign("rel-1", &k, &two), &signers_of("rel-1", &k), NOW).unwrap();
        let dir = tempfile::tempdir().unwrap();
        put(dir.path(), "llama", b"binary-bytes");
        put(dir.path(), "tiny.gguf", b"model-bytes");
        let out = dir.path().join("rental-inference.json");
        assert_eq!(provision(&manifest, "macos-x86_64", dir.path(), &out).unwrap().entry_id, "small");
    }
}
