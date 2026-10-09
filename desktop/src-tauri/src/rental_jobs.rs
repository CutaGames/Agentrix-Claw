//! L5 B4: one rented job from the platform, run on this computer
//! (`shared/types/device-capability.ts` section 7, backend `device-rental`).
//!
//! The WebView fetches the job (`GET /api/device-rental/jobs/next`) and
//! uploads the receipt; this side decides whether the job runs, runs it in the
//! restricted inference process (`rental_inference::run_task`) and builds the
//! receipt the device key signs. A job that was handed to this computer always
//! ends in a receipt: anything that stops it from running (emergency stop,
//! rental off, an input that does not match its digest, a job this computer
//! does not support, no pinned runtime) becomes a failed receipt with zero
//! units, so the buyer's hold is refunded instead of waiting for it to expire.
//! The input and the output are never logged or stored here.
use crate::rental_inference::{self, EndReason, ModelEntry, RuntimeEntry, TaskOutcome};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Where the platform's pinned runtime and model for rented jobs are kept
/// (app data directory). Absent means rented jobs are not taken.
pub const INFERENCE_FILE_NAME: &str = "rental-inference.json";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobInput {
    pub job_ref: String,
    pub capability_type: String,
    pub unit: String,
    pub max_units: u32,
    pub input: String,
    pub input_digest: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceConfig {
    pub runtime: RuntimeEntry,
    pub model: ModelEntry,
}

/// What the device key signs over, before the signature.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsignedReceipt {
    pub job_ref: String,
    /// `completed` or `failed`.
    pub status: &'static str,
    pub units_used: u32,
    pub result_digest: String,
    pub finished_at: String,
    /// Only on `completed`.
    pub output: Option<String>,
    /// Why it ended, for the owner's log (no content).
    pub end_reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedReceipt {
    #[serde(flatten)]
    pub receipt: UnsignedReceipt,
    pub signature: String,
}

/// `deviceRentalResultDigestV0`: `sha256:` + hex(sha256(UTF-8)).
pub fn result_digest(text: &str) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(text.as_bytes())))
}

pub fn is_job_ref(value: &str) -> bool {
    value.len() == 36 && value.starts_with("drj_") && value[4..].bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn failed(job: &JobInput, finished_at: &str, reason: &str) -> UnsignedReceipt {
    UnsignedReceipt {
        job_ref: job.job_ref.clone(),
        status: "failed",
        units_used: 0,
        result_digest: result_digest(""),
        finished_at: finished_at.to_string(),
        output: None,
        end_reason: reason.to_string(),
    }
}

fn end_reason_text(reason: EndReason) -> &'static str {
    match reason {
        EndReason::Completed => "completed",
        EndReason::Failed => "failed",
        EndReason::Timeout => "timeout",
        EndReason::CpuLimit => "cpu_limit",
        EndReason::MemoryLimit => "memory_limit",
        EndReason::OutputLimit => "output_limit",
        EndReason::KillSwitch => "kill_switch_engaged",
    }
}

/// Decides and runs one job. `rental_on` is the owner's rule switch, `engaged`
/// the emergency stop (true when it cannot be read), `run` the restricted
/// inference process (None when no pinned runtime is configured). Errors only
/// for a job reference the platform could not have issued: there is nothing
/// to report a receipt against.
pub fn execute_job(
    job: &JobInput,
    rental_on: bool,
    engaged: &dyn Fn() -> bool,
    run: Option<&dyn Fn(&[u8]) -> Result<TaskOutcome, &'static str>>,
    finished_at: &dyn Fn() -> String,
) -> Result<UnsignedReceipt, &'static str> {
    if !is_job_ref(&job.job_ref) {
        return Err("job_invalid");
    }
    if engaged() {
        return Ok(failed(job, &finished_at(), "kill_switch_engaged"));
    }
    if !rental_on {
        return Ok(failed(job, &finished_at(), "rental_off"));
    }
    if job.capability_type != rental_inference::CAPABILITY_TYPE || !matches!(job.unit.as_str(), "job" | "minute") || job.max_units == 0 {
        return Ok(failed(job, &finished_at(), "job_unsupported"));
    }
    if result_digest(&job.input) != job.input_digest {
        return Ok(failed(job, &finished_at(), "input_digest_mismatch"));
    }
    let Some(run) = run else {
        return Ok(failed(job, &finished_at(), "inference_not_configured"));
    };
    let outcome = match run(job.input.as_bytes()) {
        Ok(outcome) => outcome,
        Err(reason) => return Ok(failed(job, &finished_at(), reason)),
    };
    let reason = outcome.meter.end_reason;
    let text = match (reason, outcome.output.as_ref()) {
        (EndReason::Completed, Some(bytes)) => match std::str::from_utf8(bytes) {
            Ok(text) => text.to_string(),
            Err(_) => return Ok(failed(job, &finished_at(), "output_not_utf8")),
        },
        _ => return Ok(failed(job, &finished_at(), end_reason_text(reason))),
    };
    let units = if job.unit == "job" {
        1
    } else {
        let minutes = (outcome.meter.wall_ms.saturating_add(59_999) / 60_000).max(1);
        u32::try_from(minutes).unwrap_or(u32::MAX).min(job.max_units)
    };
    Ok(UnsignedReceipt {
        job_ref: job.job_ref.clone(),
        status: "completed",
        units_used: units,
        result_digest: result_digest(&text),
        finished_at: finished_at(),
        output: Some(text),
        end_reason: "completed".into(),
    })
}

/// The pinned runtime and model, or None when the file is missing or not a
/// configuration. Pins are checked again by `run_task` on every job.
pub fn load_config(path: &std::path::Path) -> Option<InferenceConfig> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Ready to take jobs: configured, and the pinned files still match.
pub fn config_ready(config: &InferenceConfig) -> bool {
    rental_inference::verify_pinned(&config.runtime.binary).is_ok()
        && config.runtime.libraries.iter().all(|library| rental_inference::verify_pinned(library).is_ok())
        && rental_inference::verify_pinned(&config.model.file).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rental_inference::TaskMeter;
    use std::cell::Cell;
    use zeroize::Zeroizing;

    const JOB_REF: &str = "drj_0123456789abcdef0123456789abcdef";
    const AT: &str = "2026-10-03T06:00:00Z";

    fn job(input: &str) -> JobInput {
        JobInput {
            job_ref: JOB_REF.into(),
            capability_type: "llm.generate.v1".into(),
            unit: "job".into(),
            max_units: 3,
            input: input.into(),
            input_digest: result_digest(input),
        }
    }

    fn outcome(reason: EndReason, wall_ms: u64, output: Option<&[u8]>) -> TaskOutcome {
        TaskOutcome {
            meter: TaskMeter {
                end_reason: reason,
                wall_ms,
                cpu_ms: 0,
                peak_rss_bytes: 0,
                output_bytes: output.map(|o| o.len() as u64).unwrap_or(0),
                output_sha256: None,
                egress_bytes: 0,
            },
            output: output.map(|o| Zeroizing::new(o.to_vec())),
        }
    }

    fn at() -> String {
        AT.to_string()
    }

    #[test]
    fn result_digest_matches_the_contract() {
        assert_eq!(result_digest(""), "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(result_digest("abc"), "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn a_completed_job_reports_its_output_digest_and_units() {
        let ran = Cell::new(0);
        let run = |prompt: &[u8]| {
            ran.set(ran.get() + 1);
            assert_eq!(prompt, b"hello");
            Ok(outcome(EndReason::Completed, 1_500, Some("world".as_bytes())))
        };
        let receipt = execute_job(&job("hello"), true, &|| false, Some(&run), &at).unwrap();
        assert_eq!(ran.get(), 1);
        assert_eq!(receipt.status, "completed");
        assert_eq!(receipt.units_used, 1);
        assert_eq!(receipt.result_digest, result_digest("world"));
        assert_eq!(receipt.output.as_deref(), Some("world"));

        let mut minutes = job("hello");
        minutes.unit = "minute".into();
        let long = |_: &[u8]| Ok(outcome(EndReason::Completed, 125_000, Some(b"x")));
        assert_eq!(execute_job(&minutes, true, &|| false, Some(&long), &at).unwrap().units_used, 3);
        let longer = |_: &[u8]| Ok(outcome(EndReason::Completed, 600_000, Some(b"x")));
        assert_eq!(execute_job(&minutes, true, &|| false, Some(&longer), &at).unwrap().units_used, 3, "never more than the job allows");
    }

    #[test]
    fn whatever_stops_a_job_is_a_failed_receipt_with_zero_units_and_the_runtime_is_not_started() {
        let ran = Cell::new(0);
        let run = |_: &[u8]| {
            ran.set(ran.get() + 1);
            Ok(outcome(EndReason::Completed, 10, Some(b"x")))
        };
        let mut tampered = job("hello");
        tampered.input_digest = result_digest("something else");
        let mut other_type = job("hello");
        other_type.capability_type = "sandbox.code.v1".into();
        let mut tokens = job("hello");
        tokens.unit = "thousand_tokens".into();
        let cases: Vec<(JobInput, bool, bool, &str)> = vec![
            (job("hello"), true, true, "kill_switch_engaged"),
            (job("hello"), false, false, "rental_off"),
            (tampered, true, false, "input_digest_mismatch"),
            (other_type, true, false, "job_unsupported"),
            (tokens, true, false, "job_unsupported"),
        ];
        for (input, rental_on, engaged, reason) in cases {
            let receipt = execute_job(&input, rental_on, &|| engaged, Some(&run), &at).unwrap();
            assert_eq!((receipt.status, receipt.units_used, receipt.end_reason.as_str()), ("failed", 0, reason));
            assert_eq!(receipt.result_digest, result_digest(""));
            assert!(receipt.output.is_none());
        }
        assert_eq!(ran.get(), 0);
        let receipt = execute_job(&job("hello"), true, &|| false, None, &at).unwrap();
        assert_eq!((receipt.status, receipt.end_reason.as_str()), ("failed", "inference_not_configured"));
    }

    #[test]
    fn a_run_that_does_not_complete_keeps_no_output() {
        for (result, reason) in [
            (Ok(outcome(EndReason::KillSwitch, 10, None)), "kill_switch_engaged"),
            (Ok(outcome(EndReason::Timeout, 10, None)), "timeout"),
            (Ok(outcome(EndReason::OutputLimit, 10, None)), "output_limit"),
            (Ok(outcome(EndReason::Completed, 10, Some(&[0xff, 0xfe]))), "output_not_utf8"),
            (Err("runtime_pin_mismatch"), "runtime_pin_mismatch"),
        ] {
            let cell = std::cell::RefCell::new(Some(result));
            let run = |_: &[u8]| cell.borrow_mut().take().unwrap();
            let receipt = execute_job(&job("hello"), true, &|| false, Some(&run), &at).unwrap();
            assert_eq!((receipt.status, receipt.units_used, receipt.end_reason.as_str()), ("failed", 0, reason));
            assert!(receipt.output.is_none());
        }
    }

    #[test]
    fn a_job_reference_the_platform_could_not_issue_is_refused() {
        for bad in ["", "drj_0123", "dro_0123456789abcdef0123456789abcdef", "drj_0123456789ABCDEF0123456789abcdef"] {
            let mut input = job("hello");
            input.job_ref = bad.into();
            assert_eq!(execute_job(&input, true, &|| false, None, &at).unwrap_err(), "job_invalid");
        }
    }

    #[test]
    fn a_missing_or_malformed_config_means_no_jobs() {
        let dir = std::env::temp_dir().join(format!("agentrix-rental-jobs-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join(INFERENCE_FILE_NAME);
        assert!(load_config(&file).is_none());
        std::fs::write(&file, "{\"runtime\": 1}").unwrap();
        assert!(load_config(&file).is_none());
        let pinned = |path: &str| serde_json::json!({ "path": path, "sha256": "a".repeat(64) });
        let config = serde_json::json!({
            "runtime": { "runtimeId": "llama", "binary": pinned("/usr/local/bin/llama"), "args": ["-m", "{model}"] },
            "model": { "modelId": "qwen", "file": pinned("/usr/local/share/qwen.gguf") },
        });
        std::fs::write(&file, config.to_string()).unwrap();
        let loaded = load_config(&file).expect("parses");
        assert!(!config_ready(&loaded), "pins that do not match the files are not ready");
        let _ = std::fs::remove_file(&file);
        let _ = std::fs::remove_dir(&dir);
    }
}
