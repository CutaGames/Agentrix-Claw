//! L5 device rental, inference only (E100, REQ-desktop-060): one rented task
//! runs in a restricted inference process on the host. Default off; there is
//! no task source yet (backend item 6), so nothing calls `run_task` outside
//! tests.
//!
//! The process:
//! - is the pinned inference runtime (allowlisted by SHA-256) reading a
//!   pinned model (allowlisted by SHA-256). The renter cannot bring a model:
//!   model files are untrusted input to their parsers.
//! - runs under macOS `sandbox-exec` with `(deny default)` plus Apple's
//!   `dyld-support.sb`: it may execute only the runtime; read only the
//!   runtime, its libraries, the model and system libraries; cannot even
//!   test whether owner paths exist (`/Users`, `/Volumes`, temp folders);
//!   writes nothing, forks nothing, and has no network at all (verified on
//!   macOS 14.8 Intel, see `sandbox_tests`). Where the profile cannot load
//!   (older macOS without `dyld-support.sb`), the task fails closed.
//! - gets the prompt on stdin (never in argv, so `ps` cannot see it), an
//!   empty environment, `/` as working directory, and `ulimit` CPU / open
//!   files / core limits from a fixed `/bin/sh` wrapper.
//! - is a fresh process per task; wall time, CPU time, resident memory and
//!   output size are watched and the process is killed (SIGKILL) past any
//!   limit, and at once when the emergency stop is engaged. XNU only sends
//!   SIGXCPU at the CPU limit (no SIGKILL at the hard limit), so a runtime
//!   that ignores SIGXCPU is caught by the sampled CPU check instead.
//! - Neither the prompt nor the output is logged or stored here; the receipt
//!   carries only digests and meters.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

/// `shared/types/device-capability.ts`: local model inference (E100 ①).
pub const CAPABILITY_TYPE: &str = "llm.generate.v1";
pub const RECEIPT_SCHEMA_VERSION: u32 = 1;
pub const SANDBOX_EXEC: &str = "/usr/bin/sandbox-exec";
const POLL: Duration = Duration::from_millis(100);
/// Sample RSS / CPU every 5 polls (500 ms).
const SAMPLE_EVERY: u32 = 5;
/// Owner data roots the runtime may not even stat. Pinned files under them
/// are allowed again by later, more specific rules.
const HIDDEN_ROOTS: [&str; 4] = ["/Users", "/Volumes", "/private/tmp", "/private/var/folders"];

/// One allowlisted file: absolute path and its SHA-256 (lowercase hex).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedFile {
    pub path: PathBuf,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub model_id: String,
    pub file: PinnedFile,
}

/// The inference program and how to call it. `args` may use `{model}` and
/// `{max_tokens}`; any other `{…}` is refused. The prompt always goes on stdin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEntry {
    pub runtime_id: String,
    pub binary: PinnedFile,
    /// Extra files the runtime loads (its own dylibs), each pinned.
    #[serde(default)]
    pub libraries: Vec<PinnedFile>,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub wall: Duration,
    pub cpu_seconds: u32,
    pub max_rss_bytes: u64,
    pub max_output_bytes: usize,
    pub max_prompt_bytes: usize,
    pub max_tokens: u32,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            wall: Duration::from_secs(120),
            cpu_seconds: 480,
            max_rss_bytes: 6 * 1024 * 1024 * 1024,
            max_output_bytes: 256 * 1024,
            max_prompt_bytes: 32 * 1024,
            max_tokens: 1024,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EndReason {
    Completed,
    /// The runtime exited non-zero (including a sandbox refusal).
    Failed,
    Timeout,
    CpuLimit,
    MemoryLimit,
    OutputLimit,
    KillSwitch,
}

/// What the receipt is built from. No prompt, no output text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMeter {
    pub end_reason: EndReason,
    pub wall_ms: u64,
    /// From the last `ps` sample (±0.5 s).
    pub cpu_ms: u64,
    pub peak_rss_bytes: u64,
    pub output_bytes: u64,
    /// `sha256:<hex>` of the output; None when the task did not complete.
    pub output_sha256: Option<String>,
    /// Always 0: the sandbox has no network.
    pub egress_bytes: u64,
}

pub struct TaskOutcome {
    pub meter: TaskMeter,
    /// Returned to the caller only on `Completed`; zeroised on drop.
    pub output: Option<Zeroizing<Vec<u8>>>,
}

fn is_lower_hex64(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// The file is a regular file (not a symlink) and has exactly the pinned digest.
pub fn verify_pinned(file: &PinnedFile) -> Result<(), &'static str> {
    if !is_lower_hex64(&file.sha256) {
        return Err("pin_invalid");
    }
    sbpl_path(&file.path)?;
    let meta = std::fs::symlink_metadata(&file.path).map_err(|_| "pinned_file_missing")?;
    if !meta.file_type().is_file() {
        return Err("pinned_file_not_regular");
    }
    match sha256_file(&file.path) {
        Ok(digest) if digest == file.sha256 => Ok(()),
        Ok(_) => Err("pinned_file_digest_mismatch"),
        Err(_) => Err("pinned_file_unreadable"),
    }
}

/// A path that can sit inside an SBPL string literal: absolute, UTF-8, and
/// none of `"`, `\`, control characters.
pub fn sbpl_path(path: &Path) -> Result<&str, &'static str> {
    let text = path.to_str().ok_or("path_not_utf8")?;
    if !path.is_absolute() || text.chars().any(|c| c == '"' || c == '\\' || c.is_control()) {
        return Err("path_unsafe");
    }
    Ok(text)
}

fn literals(paths: &[&str]) -> String {
    paths.iter().map(|p| format!("(literal \"{p}\")")).collect::<Vec<_>>().join(" ")
}

/// The sandbox profile. Order matters (later rules win): system reads, then
/// the hidden owner roots, then the pinned files, then the absolute denials.
/// `gpu` adds the IOKit classes Metal needs on Apple silicon (untested here:
/// the machines on hand are Intel).
pub fn sandbox_profile(runtime: &RuntimeEntry, model: &ModelEntry, gpu: bool) -> Result<String, &'static str> {
    let binary = sbpl_path(&runtime.binary.path)?;
    let model_path = sbpl_path(&model.file.path)?;
    let mut code = vec![binary];
    for library in &runtime.libraries {
        code.push(sbpl_path(&library.path)?);
    }
    let mut reads = code.clone();
    reads.push(model_path);
    let hidden = HIDDEN_ROOTS.iter().map(|r| format!("(subpath \"{r}\")")).collect::<Vec<_>>().join(" ");

    let mut profile = String::from("(version 1)\n(deny default)\n(import \"dyld-support.sb\")\n");
    profile.push_str(
        "(allow file-read* (subpath \"/usr/lib\") (subpath \"/System/Library\") (literal \"/dev/null\") \
         (literal \"/dev/urandom\") (literal \"/dev/random\"))\n",
    );
    profile.push_str(
        "(allow file-map-executable (subpath \"/usr/lib\") (subpath \"/System/Library/Frameworks\") \
         (subpath \"/System/Library/PrivateFrameworks\"))\n",
    );
    profile.push_str("(allow sysctl-read)\n");
    profile.push_str(&format!("(deny file-read* file-test-existence {hidden})\n"));
    profile.push_str(&format!("(allow process-exec (literal \"{binary}\"))\n"));
    profile.push_str(&format!("(allow file-read* file-test-existence {})\n", literals(&reads)));
    profile.push_str(&format!("(allow file-map-executable {})\n", literals(&code)));
    if gpu {
        profile.push_str(
            "(allow iokit-open (iokit-user-client-class \"AGXDeviceUserClient\" \"IOSurfaceRootUserClient\" \
             \"IOAccelerationUserClient\"))\n",
        );
    }
    profile.push_str("(deny network*)\n(deny file-write*)\n(deny process-fork)\n");
    Ok(profile)
}

/// Runtime arguments with `{model}` / `{max_tokens}` filled in.
pub fn runtime_args(runtime: &RuntimeEntry, model: &ModelEntry, max_tokens: u32) -> Result<Vec<String>, &'static str> {
    let model_path = sbpl_path(&model.file.path)?;
    runtime
        .args
        .iter()
        .map(|arg| {
            let filled = arg.replace("{model}", model_path).replace("{max_tokens}", &max_tokens.to_string());
            if filled.contains('{') || filled.contains('}') {
                Err("runtime_args_invalid")
            } else {
                Ok(filled)
            }
        })
        .collect()
}

/// `/bin/sh -c 'ulimit …; exec sandbox-exec -p "$profile" "$@"'` with the
/// profile, binary and arguments as positional parameters (never spliced
/// into the shell text). Empty environment, `/` as working directory.
pub fn build_command(profile: &str, binary: &str, args: &[String], limits: &Limits) -> Command {
    let script = format!(
        "ulimit -t {} && ulimit -n 64 && ulimit -c 0 && profile=\"$1\" && shift && exec {SANDBOX_EXEC} -p \"$profile\" \"$@\"",
        limits.cpu_seconds.max(1)
    );
    let mut command = Command::new("/bin/sh");
    command
        .arg("-c")
        .arg(script)
        .arg("agentrix-rental")
        .arg(profile)
        .arg(binary)
        .args(args)
        .env_clear()
        .current_dir("/")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    command
}

/// `rss` (KiB) and cumulative CPU time from `ps` for one pid.
fn sample(pid: u32) -> Option<(u64, u64)> {
    let output = Command::new("/bin/ps").args(["-o", "rss=,time=", "-p", &pid.to_string()]).env_clear().output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut parts = text.split_whitespace();
    let rss_kib: u64 = parts.next()?.parse().ok()?;
    Some((rss_kib * 1024, parse_cpu_time(parts.next()?)?))
}

/// `ps` CPU time: `M:SS.ss`, `H:MM:SS` or `D-HH:MM:SS` → milliseconds.
pub fn parse_cpu_time(text: &str) -> Option<u64> {
    let (days, rest) = match text.split_once('-') {
        Some((d, rest)) => (d.parse::<u64>().ok()?, rest),
        None => (0, text),
    };
    let fields: Vec<&str> = rest.split(':').collect();
    let seconds: f64 = fields.last()?.parse().ok()?;
    let (hours, minutes) = match fields.len() {
        2 => (0, fields[0].parse::<u64>().ok()?),
        3 => (fields[0].parse::<u64>().ok()?, fields[1].parse::<u64>().ok()?),
        _ => return None,
    };
    Some(((days * 24 + hours) * 3600 + minutes * 60) * 1000 + (seconds * 1000.0) as u64)
}

/// Run one task. `engaged` is the emergency stop (polled every 100 ms); the
/// caller passes a check that returns true when the state cannot be read.
pub fn run_task(
    runtime: &RuntimeEntry,
    model: &ModelEntry,
    prompt: &[u8],
    limits: &Limits,
    gpu: bool,
    engaged: &dyn Fn() -> bool,
) -> Result<TaskOutcome, &'static str> {
    if engaged() {
        return Err("kill_switch_engaged");
    }
    if prompt.len() > limits.max_prompt_bytes {
        return Err("prompt_too_large");
    }
    verify_pinned(&runtime.binary)?;
    for library in &runtime.libraries {
        verify_pinned(library)?;
    }
    verify_pinned(&model.file)?;
    let profile = sandbox_profile(runtime, model, gpu)?;
    let args = runtime_args(runtime, model, limits.max_tokens)?;
    let binary = sbpl_path(&runtime.binary.path)?.to_string();

    let started = Instant::now();
    let mut child = build_command(&profile, &binary, &args, limits).spawn().map_err(|_| "runtime_spawn_failed")?;
    let pid = child.id();
    {
        let mut stdin = child.stdin.take().ok_or("runtime_spawn_failed")?;
        let prompt = Zeroizing::new(prompt.to_vec());
        // A runtime that does not read its stdin must not hang us: write in a thread.
        std::thread::spawn(move || {
            let _ = stdin.write_all(&prompt);
        });
    }
    let mut stdout = child.stdout.take().ok_or("runtime_spawn_failed")?;
    let cap = limits.max_output_bytes;
    let over_cap = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let over_flag = over_cap.clone();
    let reader = std::thread::spawn(move || {
        let mut out = Zeroizing::new(Vec::new());
        let mut chunk = [0u8; 8192];
        loop {
            match stdout.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    out.extend_from_slice(&chunk[..n]);
                    if out.len() > cap {
                        over_flag.store(true, std::sync::atomic::Ordering::SeqCst);
                        break;
                    }
                }
            }
        }
        out
    });

    let cpu_cap_ms = u64::from(limits.cpu_seconds.max(1)) * 1000;
    let mut reason: Option<EndReason> = None;
    let (mut peak_rss, mut cpu_ms) = (0u64, 0u64);
    let mut tick = 0u32;
    let status = loop {
        if let Ok(Some(status)) = child.try_wait() {
            break Some(status);
        }
        if engaged() {
            reason = Some(EndReason::KillSwitch);
        } else if started.elapsed() > limits.wall {
            reason = Some(EndReason::Timeout);
        } else if over_cap.load(std::sync::atomic::Ordering::SeqCst) {
            reason = Some(EndReason::OutputLimit);
        }
        if reason.is_none() && tick % SAMPLE_EVERY == 0 {
            if let Some((rss, cpu)) = sample(pid) {
                peak_rss = peak_rss.max(rss);
                cpu_ms = cpu_ms.max(cpu);
                if rss > limits.max_rss_bytes {
                    reason = Some(EndReason::MemoryLimit);
                } else if cpu >= cpu_cap_ms {
                    // The runtime ignored SIGXCPU.
                    reason = Some(EndReason::CpuLimit);
                }
            }
        }
        if reason.is_some() {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        tick = tick.wrapping_add(1);
        std::thread::sleep(POLL);
    };
    let output = reader.join().unwrap_or_default();
    let wall_ms = started.elapsed().as_millis() as u64;
    let over = output.len() > cap;
    let end_reason = match (reason, status) {
        (Some(reason), _) => reason,
        (None, _) if over => EndReason::OutputLimit,
        (None, Some(status)) if status.success() => EndReason::Completed,
        (None, Some(status)) if killed_by_cpu_limit(status) => EndReason::CpuLimit,
        (None, _) => EndReason::Failed,
    };
    let completed = end_reason == EndReason::Completed;
    let meter = TaskMeter {
        end_reason,
        wall_ms,
        cpu_ms,
        peak_rss_bytes: peak_rss,
        output_bytes: output.len().min(cap) as u64,
        output_sha256: completed.then(|| format!("sha256:{}", hex::encode(Sha256::digest(&output[..])))),
        egress_bytes: 0,
    };
    Ok(TaskOutcome { meter, output: completed.then_some(output) })
}

/// SIGXCPU from `ulimit -t`; Windows has no signals.
fn killed_by_cpu_limit(status: std::process::ExitStatus) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        status.signal() == Some(24)
    }
    #[cfg(not(unix))]
    {
        let _ = status;
        false
    }
}

// ── Receipt ─────────────────────────────────────────────────────────────────

/// What the device signs at the end of a rented task (REQ-desktop-060 §4).
/// No prompt, no output: digests and meters only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RentalReceipt {
    pub schema_version: u32,
    pub task_id: String,
    pub capability_type: &'static str,
    pub model_id: String,
    pub model_sha256: String,
    pub runtime_id: String,
    pub runtime_sha256: String,
    pub started_at: String,
    pub ended_at: String,
    #[serde(flatten)]
    pub meter: TaskMeter,
    /// Rented tasks never touch the owner's files: nothing to undo.
    pub undo: &'static str,
}

pub fn receipt(
    task_id: &str,
    runtime: &RuntimeEntry,
    model: &ModelEntry,
    started_at: &str,
    ended_at: &str,
    meter: TaskMeter,
) -> RentalReceipt {
    RentalReceipt {
        schema_version: RECEIPT_SCHEMA_VERSION,
        task_id: task_id.to_string(),
        capability_type: CAPABILITY_TYPE,
        model_id: model.model_id.clone(),
        model_sha256: format!("sha256:{}", model.file.sha256),
        runtime_id: runtime.runtime_id.clone(),
        runtime_sha256: format!("sha256:{}", runtime.binary.sha256),
        started_at: started_at.to_string(),
        ended_at: ended_at.to_string(),
        meter,
        undo: "not_applicable",
    }
}

/// `sha256:<hex>` of the receipt's JSON (stable field order from serde).
pub fn receipt_digest(receipt: &RentalReceipt) -> String {
    let bytes = serde_json::to_vec(receipt).unwrap_or_default();
    format!("sha256:{}", hex::encode(Sha256::digest(&bytes)))
}

#[cfg(test)]
mod pure_tests {
    use super::*;

    fn pinned(path: &str) -> PinnedFile {
        PinnedFile { path: PathBuf::from(path), sha256: "a".repeat(64) }
    }
    fn runtime(args: &[&str]) -> RuntimeEntry {
        RuntimeEntry {
            runtime_id: "rt".into(),
            binary: pinned("/Users/o/Library/Agentrix/llama"),
            libraries: vec![pinned("/Users/o/Library/Agentrix/libggml.dylib")],
            args: args.iter().map(|a| a.to_string()).collect(),
        }
    }
    fn model() -> ModelEntry {
        ModelEntry { model_id: "m".into(), file: pinned("/Users/o/Library/Agentrix/models/m.gguf") }
    }

    #[test]
    fn parses_ps_cpu_time() {
        assert_eq!(parse_cpu_time("0:01.50"), Some(1500));
        assert_eq!(parse_cpu_time("1:02:03"), Some(3_723_000));
        assert_eq!(parse_cpu_time("2-01:00:00"), Some(49 * 3600 * 1000));
        assert_eq!(parse_cpu_time("abc"), None);
        assert_eq!(parse_cpu_time("1:2:3:4"), None);
    }

    #[test]
    fn sbpl_path_refuses_what_could_break_out_of_a_literal() {
        assert!(sbpl_path(Path::new("/opt/a b/c")).is_ok());
        // Parentheses inside a quoted literal are inert; the quote is what matters.
        assert!(sbpl_path(Path::new("/a)(allow default)")).is_ok());
        for bad in ["relative/x", "/a\"b", "/a\\b", "/a\nb", "/a\tb"] {
            assert!(sbpl_path(Path::new(bad)).is_err(), "{bad}");
        }
    }

    #[test]
    fn runtime_args_fill_only_known_placeholders() {
        let args = runtime_args(&runtime(&["-m", "{model}", "-n", "{max_tokens}"]), &model(), 64).unwrap();
        assert_eq!(args, vec!["-m", "/Users/o/Library/Agentrix/models/m.gguf", "-n", "64"]);
        assert_eq!(runtime_args(&runtime(&["{prompt}"]), &model(), 64), Err("runtime_args_invalid"));
        assert_eq!(runtime_args(&runtime(&["{model"]), &model(), 64), Err("runtime_args_invalid"));
    }

    #[test]
    fn profile_denies_by_default_and_names_only_pinned_files() {
        let profile = sandbox_profile(&runtime(&[]), &model(), false).unwrap();
        assert!(profile.starts_with("(version 1)\n(deny default)\n(import \"dyld-support.sb\")\n"));
        assert!(profile.ends_with("(deny network*)\n(deny file-write*)\n(deny process-fork)\n"));
        let hidden = profile
            .find("(deny file-read* file-test-existence (subpath \"/Users\") (subpath \"/Volumes\") (subpath \"/private/tmp\") (subpath \"/private/var/folders\"))")
            .expect("hidden roots");
        let exec = profile.find("(allow process-exec (literal \"/Users/o/Library/Agentrix/llama\"))\n").expect("exec");
        let reads = profile
            .find(
                "(allow file-read* file-test-existence (literal \"/Users/o/Library/Agentrix/llama\") \
                 (literal \"/Users/o/Library/Agentrix/libggml.dylib\") (literal \"/Users/o/Library/Agentrix/models/m.gguf\"))\n",
            )
            .expect("pinned reads");
        let maps = profile
            .find(
                "(allow file-map-executable (literal \"/Users/o/Library/Agentrix/llama\") \
                 (literal \"/Users/o/Library/Agentrix/libggml.dylib\"))\n",
            )
            .expect("pinned code");
        // Later rules win: the pinned files must come after the hidden roots.
        assert!(hidden < exec && hidden < reads && hidden < maps);
        assert_eq!(profile.matches("(allow process-exec").count(), 1);
        for absent in ["allow network", "allow file-write", "allow process-fork", "allow default", "iokit", "models/m.gguf\") (literal"] {
            assert!(!profile.contains(absent), "{absent}");
        }
        assert!(sandbox_profile(&runtime(&[]), &model(), true).unwrap().contains("(allow iokit-open"));
        let mut bad = model();
        bad.file.path = PathBuf::from("/x\") (allow default) (literal \"/y");
        assert_eq!(sandbox_profile(&runtime(&[]), &bad, false), Err("path_unsafe"));
    }

    #[test]
    fn prompt_never_goes_into_argv_and_env_is_empty() {
        let command = build_command("(version 1)", "/opt/agentrix/llama", &["-m".into()], &Limits::default());
        let args: Vec<String> = command.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(args[0], "-c");
        assert_eq!(
            args[1],
            "ulimit -t 480 && ulimit -n 64 && ulimit -c 0 && profile=\"$1\" && shift && exec /usr/bin/sandbox-exec -p \"$profile\" \"$@\""
        );
        assert_eq!(&args[2..], ["agentrix-rental", "(version 1)", "/opt/agentrix/llama", "-m"]);
        assert_eq!(command.get_envs().count(), 0);
        assert_eq!(command.get_current_dir(), Some(Path::new("/")));
    }

    #[test]
    fn verify_pinned_checks_format_type_and_digest() {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let file = root.join("model.bin");
        std::fs::write(&file, b"weights").unwrap();
        let digest = sha256_file(&file).unwrap();
        assert_eq!(verify_pinned(&PinnedFile { path: file.clone(), sha256: digest.clone() }), Ok(()));
        assert_eq!(verify_pinned(&PinnedFile { path: file.clone(), sha256: digest.to_uppercase() }), Err("pin_invalid"));
        assert_eq!(verify_pinned(&PinnedFile { path: file.clone(), sha256: "b".repeat(64) }), Err("pinned_file_digest_mismatch"));
        assert_eq!(verify_pinned(&PinnedFile { path: root.join("missing"), sha256: digest.clone() }), Err("pinned_file_missing"));
        let link = root.join("link.bin");
        std::os::unix::fs::symlink(&file, &link).unwrap();
        assert_eq!(verify_pinned(&PinnedFile { path: link, sha256: digest.clone() }), Err("pinned_file_not_regular"));
        assert_eq!(verify_pinned(&PinnedFile { path: root.clone(), sha256: digest }), Err("pinned_file_not_regular"));
    }

    #[test]
    fn run_task_refuses_before_spawning() {
        let limits = Limits { max_prompt_bytes: 4, ..Limits::default() };
        let never = || false;
        assert_eq!(run_task(&runtime(&[]), &model(), b"hi", &limits, false, &|| true).err(), Some("kill_switch_engaged"));
        assert_eq!(run_task(&runtime(&[]), &model(), b"hello", &limits, false, &never).err(), Some("prompt_too_large"));
        // Pins do not match anything on disk: refused, nothing runs.
        assert_eq!(run_task(&runtime(&[]), &model(), b"hi", &limits, false, &never).err(), Some("pinned_file_missing"));
    }

    #[test]
    fn receipt_carries_digests_and_meters_only() {
        let meter = TaskMeter {
            end_reason: EndReason::Completed,
            wall_ms: 10,
            cpu_ms: 5,
            peak_rss_bytes: 1024,
            output_bytes: 3,
            output_sha256: Some("sha256:00".into()),
            egress_bytes: 0,
        };
        let r = receipt("t1", &runtime(&[]), &model(), "2026-10-01T00:00:00Z", "2026-10-01T00:00:01Z", meter);
        let json: serde_json::Value = serde_json::to_value(&r).unwrap();
        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(|k| k.as_str()).collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "capabilityType", "cpuMs", "egressBytes", "endReason", "endedAt", "modelId", "modelSha256", "outputBytes",
                "outputSha256", "peakRssBytes", "runtimeId", "runtimeSha256", "schemaVersion", "startedAt", "taskId",
                "undo", "wallMs"
            ]
        );
        assert_eq!(json["capabilityType"], "llm.generate.v1");
        assert_eq!(json["endReason"], "completed");
        assert_eq!(json["undo"], "not_applicable");
        assert_eq!(json["modelSha256"], format!("sha256:{}", "a".repeat(64)));
        assert_eq!(receipt_digest(&r), receipt_digest(&r.clone()));
        let mut other = r.clone();
        other.task_id = "t2".into();
        assert_ne!(receipt_digest(&r), receipt_digest(&other));
    }
}

/// Real `sandbox-exec` runs with system binaries standing in for the runtime.
#[cfg(all(test, target_os = "macos"))]
mod sandbox_tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn pin(path: &str) -> PinnedFile {
        let path = std::fs::canonicalize(path).unwrap();
        let sha256 = sha256_file(&path).unwrap();
        PinnedFile { path, sha256 }
    }
    fn runtime(binary: &str, args: &[&str]) -> RuntimeEntry {
        RuntimeEntry {
            runtime_id: binary.into(),
            binary: pin(binary),
            libraries: vec![],
            args: args.iter().map(|a| a.to_string()).collect(),
        }
    }
    fn zsh(script: &str) -> RuntimeEntry {
        runtime("/bin/zsh", &["-f", "-c", script])
    }
    struct Fixture {
        _dir: tempfile::TempDir,
        root: PathBuf,
        model: ModelEntry,
    }
    /// A temp folder (under `/private/var/folders`, a hidden root) with the
    /// pinned "model" and an owner file next to it.
    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let path = root.join("model.bin");
        std::fs::write(&path, b"MODEL\n").unwrap();
        std::fs::write(root.join("owner-secret.txt"), b"owner").unwrap();
        let model = ModelEntry { model_id: "fixture".into(), file: PinnedFile { sha256: sha256_file(&path).unwrap(), path } };
        Fixture { _dir: dir, root, model }
    }
    fn quick() -> Limits {
        Limits { wall: Duration::from_secs(10), cpu_seconds: 5, ..Limits::default() }
    }
    fn never() -> bool {
        false
    }
    fn go(rt: &RuntimeEntry, f: &Fixture, prompt: &[u8], limits: &Limits) -> TaskOutcome {
        run_task(rt, &f.model, prompt, limits, false, &never).unwrap()
    }
    fn text(outcome: &TaskOutcome) -> String {
        outcome.output.as_ref().map(|o| String::from_utf8_lossy(o).into_owned()).unwrap_or_default()
    }

    #[test]
    fn reads_the_pinned_model_and_stdin_and_completes() {
        let f = fixture();
        let outcome = go(&runtime("/bin/cat", &["{model}", "-"]), &f, b"prompt", &quick());
        assert_eq!(outcome.meter.end_reason, EndReason::Completed);
        assert_eq!(text(&outcome), "MODEL\nprompt");
        assert_eq!(outcome.meter.output_bytes, 12);
        assert_eq!(outcome.meter.output_sha256, Some(format!("sha256:{}", hex::encode(Sha256::digest(b"MODEL\nprompt")))));
        assert_eq!(outcome.meter.egress_bytes, 0);
    }

    #[test]
    fn cannot_read_or_even_find_owner_files() {
        let f = fixture();
        let secret = f.root.join("owner-secret.txt");
        let secret = secret.to_str().unwrap();
        let read = go(&runtime("/bin/cat", &[secret]), &f, b"", &quick());
        assert_eq!(read.meter.end_reason, EndReason::Failed);
        assert!(read.output.is_none());
        let firmlink = format!("/System/Volumes/Data{secret}");
        assert_eq!(go(&runtime("/bin/cat", &[&firmlink]), &f, b"", &quick()).meter.end_reason, EndReason::Failed);
        assert_eq!(go(&runtime("/bin/cat", &["/private/etc/hosts"]), &f, b"", &quick()).meter.end_reason, EndReason::Failed);

        let home = std::env::var("HOME").unwrap();
        let probe = format!(
            "for p in {secret} {} {home} {home}/Desktop /Volumes /private/tmp; do [[ -e $p ]] && print -r -- \"seen $p\"; done; print done",
            f.root.display()
        );
        let probed = go(&zsh(&probe), &f, b"", &quick());
        assert_eq!(probed.meter.end_reason, EndReason::Completed);
        assert_eq!(text(&probed), "done\n");
    }

    #[test]
    fn sees_an_empty_environment_and_root_as_working_directory() {
        let f = fixture();
        let outcome = go(&runtime("/usr/bin/env", &[]), &f, b"", &quick());
        assert_eq!(outcome.meter.end_reason, EndReason::Completed);
        let env = text(&outcome);
        // Only what `/bin/sh` itself sets; nothing inherited from the desktop app.
        for line in env.lines() {
            let key = line.split('=').next().unwrap_or_default();
            assert!(["PWD", "SHLVL", "_", "OLDPWD"].contains(&key), "{line}");
        }
        assert!(env.lines().all(|line| !line.starts_with("PWD=") || line == "PWD=/"), "{env}");
    }

    #[test]
    fn cannot_write() {
        let f = fixture();
        let target = f.root.join("written-by-renter");
        let t = target.to_str().unwrap();
        assert_eq!(go(&runtime("/usr/bin/touch", &[t]), &f, b"", &quick()).meter.end_reason, EndReason::Failed);
        assert_eq!(go(&zsh(&format!("print hi > {t}")), &f, b"", &quick()).meter.end_reason, EndReason::Failed);
        assert_eq!(go(&zsh("print hi > /dev/null && print ok"), &f, b"", &quick()).meter.end_reason, EndReason::Failed);
        assert!(!target.exists());
        // The model itself cannot be changed either.
        assert_eq!(go(&zsh(&format!("print x >> {}", f.model.file.path.display())), &f, b"", &quick()).meter.end_reason, EndReason::Failed);
        assert_eq!(std::fs::read(&f.model.file.path).unwrap(), b"MODEL\n");
    }

    #[test]
    fn has_no_network_even_to_loopback() {
        let f = fixture();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port().to_string();
        let nc = go(&runtime("/usr/bin/nc", &["-z", "-w", "2", "127.0.0.1", &port]), &f, b"", &quick());
        assert_eq!(nc.meter.end_reason, EndReason::Failed);
        let tcp = go(&zsh(&format!("zmodload zsh/net/tcp && ztcp 127.0.0.1 {port} && print connected")), &f, b"", &quick());
        assert_eq!(tcp.meter.end_reason, EndReason::Failed);
        assert!(!text(&tcp).contains("connected"));
        assert!(matches!(listener.accept(), Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock));
    }

    #[test]
    fn cannot_fork_or_exec_anything_else() {
        let f = fixture();
        let plain = go(&zsh("print -r -- outer"), &f, b"", &quick());
        assert_eq!(plain.meter.end_reason, EndReason::Completed);
        assert_eq!(text(&plain), "outer\n");
        // Command substitution needs a fork.
        let forked = go(&zsh("print -r -- \"[$(print -r -- inner)]\""), &f, b"", &quick());
        assert_eq!(forked.meter.end_reason, EndReason::Failed);
        assert!(!text(&forked).contains("inner"));
        assert_eq!(go(&zsh("exec /bin/echo escaped"), &f, b"", &quick()).meter.end_reason, EndReason::Failed);
        assert_eq!(go(&zsh("/bin/echo escaped"), &f, b"", &quick()).meter.end_reason, EndReason::Failed);
    }

    #[test]
    fn wall_timeout_and_kill_switch_kill_the_process() {
        let f = fixture();
        let limits = Limits { wall: Duration::from_millis(800), ..quick() };
        let timed = go(&runtime("/bin/sleep", &["30"]), &f, b"", &limits);
        assert_eq!(timed.meter.end_reason, EndReason::Timeout);
        assert!(timed.meter.wall_ms < 5000, "{}", timed.meter.wall_ms);
        assert!(timed.output.is_none());

        let started = Instant::now();
        let engaged = AtomicBool::new(false);
        let check = || {
            if started.elapsed() > Duration::from_millis(300) {
                engaged.store(true, Ordering::SeqCst);
            }
            engaged.load(Ordering::SeqCst)
        };
        let stopped = run_task(&runtime("/bin/sleep", &["30"]), &f.model, b"", &quick(), false, &check).unwrap();
        assert_eq!(stopped.meter.end_reason, EndReason::KillSwitch);
        assert!(stopped.meter.wall_ms < 3000, "{}", stopped.meter.wall_ms);
        assert!(stopped.output.is_none());
    }

    #[test]
    fn output_and_memory_limits() {
        let f = fixture();
        let big = vec![b'x'; 4096];
        let limits = Limits { max_output_bytes: 1024, ..quick() };
        let out = go(&runtime("/bin/cat", &["-"]), &f, &big, &limits);
        assert_eq!(out.meter.end_reason, EndReason::OutputLimit);
        assert!(out.output.is_none());
        assert!(out.meter.output_bytes <= 1024);
        assert_eq!(out.meter.output_sha256, None);

        let tiny = Limits { max_rss_bytes: 1, ..quick() };
        let mem = go(&runtime("/bin/sleep", &["5"]), &f, b"", &tiny);
        assert_eq!(mem.meter.end_reason, EndReason::MemoryLimit);
        assert!(mem.meter.wall_ms < 3000, "{}", mem.meter.wall_ms);
        assert!(mem.meter.peak_rss_bytes > 1);
    }

    #[test]
    fn cpu_limit_holds_even_when_sigxcpu_is_ignored() {
        let f = fixture();
        let cpu = Limits { cpu_seconds: 1, wall: Duration::from_secs(15), ..quick() };
        let burn = go(&zsh("while true; do :; done"), &f, b"", &cpu);
        assert_eq!(burn.meter.end_reason, EndReason::CpuLimit);
        assert!(burn.meter.wall_ms < 10_000, "{}", burn.meter.wall_ms);
        let stubborn = go(&zsh("trap '' XCPU; while true; do :; done"), &f, b"", &cpu);
        assert_eq!(stubborn.meter.end_reason, EndReason::CpuLimit);
        assert!(stubborn.meter.wall_ms < 10_000, "{}", stubborn.meter.wall_ms);
        assert!(stubborn.meter.cpu_ms >= 1000, "{}", stubborn.meter.cpu_ms);
    }
}
