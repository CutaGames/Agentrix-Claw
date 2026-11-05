//! B5: the simulator carries no real key and has no way to reach a network or keep a key on disk.

use std::fs;
use std::path::{Path, PathBuf};

fn files_under(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files_under(&path, out);
            } else {
                out.push(path);
            }
        }
    }
}

fn crate_files(subdir: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    files_under(&Path::new(env!("CARGO_MANIFEST_DIR")).join(subdir), &mut out);
    out
}

#[test]
fn no_private_key_block_anywhere_in_the_crate() {
    // The marker is built from pieces so this file does not contain it.
    let marker = format!("{} {}", "-----BEGIN", "");
    let private = format!("{}{}", "PRIVATE", " KEY-----");
    let mut files = crate_files("src");
    files.extend(crate_files("tests"));
    files.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"));
    assert!(files.len() >= 8);
    for file in files {
        let text = fs::read_to_string(&file).unwrap_or_default();
        for line in text.lines() {
            assert!(!(line.contains(marker.trim_end()) && line.contains(&private)), "key block in {}", file.display());
        }
    }
}

#[test]
fn the_library_source_opens_no_socket_and_writes_no_file() {
    let banned = [
        format!("{}{}", "std::", "net"),
        format!("{}{}", "Tcp", "Stream"),
        format!("{}{}", "req", "west"),
        format!("{}{}", "std::", "fs"),
        format!("{}{}", "std::", "process"),
        format!("{}{}", "File::", "create"),
    ];
    for file in crate_files("src") {
        let text = fs::read_to_string(&file).unwrap_or_default();
        for word in &banned {
            assert!(!text.contains(word.as_str()), "{} appears in {}", word, file.display());
        }
    }
}

#[test]
fn dependencies_are_pinned_to_exact_versions() {
    let manifest = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml")).unwrap();
    let mut in_dependencies = false;
    let mut seen = 0;
    for line in manifest.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_dependencies = trimmed == "[dependencies]";
            continue;
        }
        if in_dependencies && !trimmed.is_empty() && !trimmed.starts_with('#') {
            assert!(trimmed.contains("\"="), "dependency is not pinned with =: {trimmed}");
            seen += 1;
        }
    }
    assert_eq!(seen, 4);
}
