//! Rust-owned workspace path map. WebView never supplies path truth.

use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::jcs::jcs_digest;
use crate::developer_runtime::policy::assert_exact_workspace_path;
use crate::developer_runtime::types::{now_iso, DigestRef, VerifiedBinding};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;

pub fn workspace_state_file() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .map(|base| base.join("Agentrix Desktop").join("workspace.txt"));
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(config_home) = std::env::var_os("XDG_CONFIG_HOME") {
            return Some(
                PathBuf::from(config_home)
                    .join("agentrix-desktop")
                    .join("workspace.txt"),
            );
        }
        std::env::var_os("HOME").map(PathBuf::from).map(|home| {
            home.join(".config")
                .join("agentrix-desktop")
                .join("workspace.txt")
        })
    }
}

fn rust_owned_stamp_file() -> Option<PathBuf> {
    workspace_state_file().map(|path| path.with_extension("txt.rust-owned"))
}

fn assert_state_file_trusted(path: &PathBuf) -> RuntimeResult<()> {
    let meta = std::fs::metadata(path).map_err(|_| RuntimeError::fail_closed("workspace_untrusted"))?;
    if !meta.is_file() {
        return Err(RuntimeError::fail_closed("workspace_untrusted"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let mode = meta.mode() & 0o777;
        if mode & 0o022 != 0 {
            return Err(RuntimeError::fail_closed("workspace_untrusted"));
        }
    }
    Ok(())
}

pub fn path_digest(path: &PathBuf) -> RuntimeResult<DigestRef> {
    jcs_digest(&json!({ "canonicalPath": path.to_string_lossy() }))
}

pub fn record_rust_owned_selection(path: &PathBuf) -> RuntimeResult<()> {
    let canonical = path
        .canonicalize()
        .map_err(|_| RuntimeError::fail_closed("workspace_untrusted"))?;
    assert_exact_workspace_path(&canonical)?;
    let digest = path_digest(&canonical)?;
    if let Some(state_file) = workspace_state_file() {
        if let Some(parent) = state_file.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|_| RuntimeError::fail_closed("workspace_trust_io"))?;
        }
        std::fs::write(&state_file, canonical.to_string_lossy().as_bytes())
            .map_err(|_| RuntimeError::fail_closed("workspace_trust_io"))?;
        if let Some(stamp) = rust_owned_stamp_file() {
            std::fs::write(
                stamp,
                serde_json::to_vec(&json!({
                    "rustOwned": true,
                    "pathDigest": digest,
                    "selectedAt": now_iso(),
                }))
                .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?,
            )
            .map_err(|_| RuntimeError::fail_closed("workspace_trust_io"))?;
        }
    }
    Ok(())
}

pub fn load_selected_workspace() -> RuntimeResult<Option<PathBuf>> {
    let Some(state_file) = workspace_state_file() else {
        return Ok(None);
    };
    if !state_file.is_file() {
        return Ok(None);
    }
    assert_state_file_trusted(&state_file)?;
    let Some(stamp_file) = rust_owned_stamp_file() else {
        return Err(RuntimeError::fail_closed("workspace_untrusted"));
    };
    if !stamp_file.is_file() {
        return Err(RuntimeError::fail_closed("workspace_untrusted"));
    }
    assert_state_file_trusted(&stamp_file)?;
    let saved = std::fs::read_to_string(&state_file)
        .map_err(|_| RuntimeError::fail_closed("workspace_trust_io"))?;
    let trimmed = saved.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let candidate = PathBuf::from(trimmed);
    if !candidate.is_dir() {
        return Err(RuntimeError::fail_closed("workspace_untrusted"));
    }
    let canonical = candidate
        .canonicalize()
        .map_err(|_| RuntimeError::fail_closed("workspace_untrusted"))?;
    assert_exact_workspace_path(&canonical)?;
    let digest = path_digest(&canonical)?;
    let stamp: Value = serde_json::from_slice(
        &std::fs::read(&stamp_file).map_err(|_| RuntimeError::fail_closed("workspace_trust_io"))?,
    )
    .map_err(|_| RuntimeError::fail_closed("workspace_untrusted"))?;
    if stamp.get("rustOwned") != Some(&json!(true)) {
        return Err(RuntimeError::fail_closed("workspace_untrusted"));
    }
    let stamped: DigestRef = serde_json::from_value(
        stamp
            .get("pathDigest")
            .cloned()
            .ok_or_else(|| RuntimeError::fail_closed("workspace_untrusted"))?,
    )
    .map_err(|_| RuntimeError::fail_closed("workspace_untrusted"))?;
    if stamped != digest {
        return Err(RuntimeError::fail_closed("workspace_digest_mismatch"));
    }
    Ok(Some(canonical))
}

pub fn resolve_cwd(
    binding: &VerifiedBinding,
    path_map: &HashMap<String, PathBuf>,
) -> RuntimeResult<PathBuf> {
    let path = path_map
        .get(&binding.binding.workspace_ref)
        .cloned()
        .ok_or_else(|| RuntimeError::fail_closed("workspace_trust_missing"))?;
    assert_exact_workspace_path(&path)?;
    let digest = path_digest(&path)?;
    if digest != binding.binding.workspace_digest {
        return Err(RuntimeError::fail_closed("workspace_digest_mismatch"));
    }
    Ok(path)
}

pub fn trust_dialog_path(
    path: PathBuf,
    binding: &VerifiedBinding,
    path_map: &mut HashMap<String, PathBuf>,
) -> RuntimeResult<PathBuf> {
    if !path.is_dir() {
        return Err(RuntimeError::fail_closed("workspace_untrusted"));
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| RuntimeError::fail_closed("workspace_untrusted"))?;
    assert_exact_workspace_path(&canonical)?;
    let digest = path_digest(&canonical)?;
    if digest != binding.binding.workspace_digest {
        return Err(RuntimeError::fail_closed("workspace_digest_mismatch"));
    }
    record_rust_owned_selection(&canonical)?;
    path_map.insert(binding.binding.workspace_ref.clone(), canonical.clone());
    Ok(canonical)
}

pub fn trust_selected(
    binding: &VerifiedBinding,
    path_map: &mut HashMap<String, PathBuf>,
) -> RuntimeResult<PathBuf> {
    let path = load_selected_workspace()?
        .ok_or_else(|| RuntimeError::fail_closed("workspace_trust_missing"))?;
    let digest = path_digest(&path)?;
    if digest != binding.binding.workspace_digest {
        return Err(RuntimeError::fail_closed("workspace_digest_mismatch"));
    }
    path_map.insert(binding.binding.workspace_ref.clone(), path.clone());
    Ok(path)
}
