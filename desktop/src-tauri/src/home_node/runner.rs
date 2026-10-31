//! L8 D3: what the node does with one job it was handed, and the capability declaration it signs.
//!
//! `process_claim` is the whole life of a job on this side: decode, gate (`jobs::refusal`), do the one thing the job
//! names, then ALWAYS answer with a signed receipt, even when the job was refused, so nobody waits for a job that
//! will never run. The edges (network, files, the clock, the device key) sit behind `NodeIo`, so every rule is tested
//! with a fake. The content of a job, its answer and every token stay out of logs and out of the receipt: the
//! receipt carries only the status and the digest of the answer.
use crate::home_node::jobs::{self, Capabilities, Claim, Task};
use chrono::{DateTime, Utc};
use serde_json::{json, Map, Value};

/// The answer of a text job may be this long at most (`HOME_JOB_OUTPUT_MAX_CHARS` on the platform).
pub const OUTPUT_MAX_CHARS: usize = 32_000;
pub const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 1024;
pub const DECLARATION_TTL_SECONDS: i64 = 600;

pub trait NodeIo {
    /// The emergency stop: true when it is engaged, or when its state cannot be read.
    fn stopped(&self) -> bool;
    fn now(&self) -> DateTime<Utc>;
    /// One completion from the model server on this computer.
    fn infer(&self, prompt: &str, max_tokens: u32) -> Result<String, &'static str>;
    /// One Home Assistant call (already granted and confirmed). Returns the text that goes into the receipt digest.
    fn ha(&self, entity_id: &str, action: &str, data: Option<&Map<String, Value>>) -> Result<String, &'static str>;
    fn sign_receipt(&self, job_ref: &str, status: &str, result_digest: &str, finished_at: &str) -> Result<String, &'static str>;
    fn post_receipt(&self, job_ref: &str, body: &Value) -> Result<(), &'static str>;
    fn post_output(&self, job_ref: &str, output: &str) -> Result<(), &'static str>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    pub job_ref: String,
    /// `completed` or `failed`.
    pub status: &'static str,
    /// Why it ended, for the owner's log (no content).
    pub reason: &'static str,
}

/// `YYYY-MM-DDTHH:MM:SS.mmmZ`, what `Date.prototype.toISOString()` writes.
pub fn iso_ms(at: DateTime<Utc>) -> String {
    at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// Runs one job and reports it. `Err` only when no receipt could be made or sent (a job reference the platform could
/// not have issued, a key that would not sign, the platform unreachable); the platform then lets the job expire.
pub fn process_claim(value: &Value, caps: Capabilities, io: &dyn NodeIo) -> Result<Outcome, &'static str> {
    let decoded = jobs::decode_claim(value)?;
    let claim: Claim = match decoded {
        Ok(claim) => claim,
        Err(job_ref) => return finish(&job_ref, Err("service_not_allowed"), io),
    };
    let result = execute(&claim, caps, io);
    finish(&claim.job_ref, result, io)
}

/// What a job produced: the text of the answer, or the reason it did not run.
fn execute(claim: &Claim, caps: Capabilities, io: &dyn NodeIo) -> Result<(String, bool), &'static str> {
    // The stop is read at the moment of the decision and again right before the node touches anything.
    if let Some(reason) = jobs::refusal(claim, io.stopped(), caps, io.now()) {
        return Err(reason);
    }
    match &claim.task {
        Task::Llm { prompt, max_output_tokens } => {
            let text = io.infer(prompt, max_output_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS))?;
            if io.stopped() {
                return Err("kill_switch_engaged");
            }
            if text.chars().count() > OUTPUT_MAX_CHARS {
                return Err("output_too_large");
            }
            Ok((text, true))
        }
        Task::Ha { entity_id, action, data } => {
            if io.stopped() {
                return Err("kill_switch_engaged");
            }
            let text = io.ha(entity_id, action, data.as_ref())?;
            Ok((text, false))
        }
    }
}

fn finish(job_ref: &str, result: Result<(String, bool), &'static str>, io: &dyn NodeIo) -> Result<Outcome, &'static str> {
    let (status, reason, output, deliver) = match result {
        Ok((text, deliver)) => ("completed", "completed", text, deliver),
        Err(reason) => ("failed", reason, String::new(), false),
    };
    let digest = crate::rental_jobs::result_digest(&output);
    let finished_at = iso_ms(io.now());
    let signature = io.sign_receipt(job_ref, status, &digest, &finished_at)?;
    let body = json!({
        "schemaVersion": 1,
        "jobRef": job_ref,
        "status": status,
        "resultDigest": digest,
        "finishedAt": finished_at,
        "signature": signature,
    });
    io.post_receipt(job_ref, &body)?;
    // The answer of a text job goes second and separately; the platform keeps it only if it hashes to the digest just signed.
    if deliver {
        io.post_output(job_ref, &output).map_err(|_| "output_not_delivered")?;
    }
    Ok(Outcome { job_ref: job_ref.to_string(), status, reason })
}

/// This node's capability declaration (`DeviceCapabilityDeclarationV0`), to be signed by the device key. What it
/// offers follows its configuration: no model server, no text jobs; no Home Assistant, no appliance jobs.
pub fn build_declaration(
    device_id: &str,
    declaration_id: &str,
    signer_ref: &str,
    binding_id: &str,
    binding_version: u32,
    caps: Capabilities,
    now: DateTime<Utc>,
) -> Value {
    let mut items = Vec::new();
    if caps.llm {
        items.push(json!({ "type": jobs::LLM_KIND, "category": "compute", "state": "available", "limits": { "maxOutputTokens": jobs::MAX_OUTPUT_TOKENS_MAX } }));
    }
    if caps.ha {
        items.push(json!({ "type": jobs::HA_KIND, "category": "actuation", "state": "available", "limits": {} }));
    }
    json!({
        "schemaVersion": 0,
        "declarationId": declaration_id,
        "deviceId": device_id,
        "kind": "desktop",
        "shellBindingRef": { "type": "shell_session_binding", "id": binding_id, "version": binding_version },
        "attestedBy": "device_key",
        "signerRef": signer_ref,
        "items": items,
        "conditions": { "onPower": null, "thermalOk": null, "idle": null },
        "observedAt": iso_ms(now),
        "expiresAt": iso_ms(now + chrono::Duration::seconds(DECLARATION_TTL_SECONDS)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};

    const JOB: &str = "hj_0123456789abcdef0123456789abcdef";

    struct Fake {
        stopped: Cell<bool>,
        /// The stop becomes true after this many reads (None = never).
        stop_after_reads: Cell<Option<u32>>,
        reads: Cell<u32>,
        infer_reply: RefCell<Result<String, &'static str>>,
        ha_reply: RefCell<Result<String, &'static str>>,
        infer_calls: Cell<u32>,
        ha_calls: RefCell<Vec<(String, String)>>,
        receipts: RefCell<Vec<Value>>,
        outputs: RefCell<Vec<String>>,
        sign_fails: Cell<bool>,
        post_fails: Cell<bool>,
    }

    impl Fake {
        fn new() -> Self {
            Self {
                stopped: Cell::new(false),
                stop_after_reads: Cell::new(None),
                reads: Cell::new(0),
                infer_reply: RefCell::new(Ok("the answer".to_string())),
                ha_reply: RefCell::new(Ok("ok".to_string())),
                infer_calls: Cell::new(0),
                ha_calls: RefCell::new(vec![]),
                receipts: RefCell::new(vec![]),
                outputs: RefCell::new(vec![]),
                sign_fails: Cell::new(false),
                post_fails: Cell::new(false),
            }
        }
    }

    impl NodeIo for Fake {
        fn stopped(&self) -> bool {
            let reads = self.reads.get() + 1;
            self.reads.set(reads);
            self.stopped.get() || self.stop_after_reads.get().map(|n| reads > n).unwrap_or(false)
        }
        fn now(&self) -> DateTime<Utc> {
            DateTime::parse_from_rfc3339("2026-10-20T02:00:00Z").unwrap().with_timezone(&Utc)
        }
        fn infer(&self, _prompt: &str, _max_tokens: u32) -> Result<String, &'static str> {
            self.infer_calls.set(self.infer_calls.get() + 1);
            self.infer_reply.borrow().clone()
        }
        fn ha(&self, entity_id: &str, action: &str, _data: Option<&Map<String, Value>>) -> Result<String, &'static str> {
            self.ha_calls.borrow_mut().push((entity_id.to_string(), action.to_string()));
            self.ha_reply.borrow().clone()
        }
        fn sign_receipt(&self, job_ref: &str, status: &str, digest: &str, finished_at: &str) -> Result<String, &'static str> {
            if self.sign_fails.get() {
                return Err("sign_failed");
            }
            Ok(format!("sig({job_ref},{status},{digest},{finished_at})"))
        }
        fn post_receipt(&self, _job_ref: &str, body: &Value) -> Result<(), &'static str> {
            if self.post_fails.get() {
                return Err("platform_unreachable");
            }
            self.receipts.borrow_mut().push(body.clone());
            Ok(())
        }
        fn post_output(&self, _job_ref: &str, output: &str) -> Result<(), &'static str> {
            self.outputs.borrow_mut().push(output.to_string());
            Ok(())
        }
    }

    fn caps() -> Capabilities {
        Capabilities { llm: true, ha: true }
    }

    fn llm_job() -> Value {
        json!({ "jobRef": JOB, "capabilityType": "llm.generate.v1", "task": { "kind": "llm.generate.v1", "prompt": "hello" }, "confirmed": true, "grant": null })
    }

    fn ha_job(entity: &str, action: &str, confirmed: bool, grant: Value) -> Value {
        json!({ "jobRef": JOB, "capabilityType": "ha.call.v1", "task": { "kind": "ha.call.v1", "entityId": entity, "action": action }, "confirmed": confirmed, "grant": grant })
    }

    fn grant(entity: &str, actions: &[&str]) -> Value {
        json!({ "entityId": entity, "actions": actions, "expiresAt": null })
    }

    #[test]
    fn a_text_job_runs_then_a_signed_receipt_goes_first_and_the_answer_second() {
        let io = Fake::new();
        let outcome = process_claim(&llm_job(), caps(), &io).unwrap();
        assert_eq!((outcome.status, outcome.reason), ("completed", "completed"));
        let receipts = io.receipts.borrow();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0]["status"], "completed");
        assert_eq!(receipts[0]["jobRef"], JOB);
        assert_eq!(receipts[0]["resultDigest"], crate::rental_jobs::result_digest("the answer"));
        assert_eq!(receipts[0]["finishedAt"], "2026-10-20T02:00:00.000Z");
        assert!(receipts[0]["signature"].as_str().unwrap().starts_with("sig(hj_"));
        assert!(receipts[0].get("output").is_none(), "the receipt never carries the answer");
        assert_eq!(*io.outputs.borrow(), vec!["the answer".to_string()]);
    }

    #[test]
    fn a_permitted_appliance_call_is_made_once_and_nothing_but_a_digest_leaves() {
        let io = Fake::new();
        let outcome = process_claim(&ha_job("light.kitchen", "turn_on", false, grant("light.kitchen", &["turn_on"])), caps(), &io).unwrap();
        assert_eq!(outcome.status, "completed");
        assert_eq!(*io.ha_calls.borrow(), vec![("light.kitchen".to_string(), "turn_on".to_string())]);
        assert!(io.outputs.borrow().is_empty(), "an appliance job delivers no answer text");
        assert_eq!(io.receipts.borrow()[0]["resultDigest"], crate::rental_jobs::result_digest("ok"));
    }

    #[test]
    fn negative_the_emergency_stop_ends_every_job_as_a_failed_receipt_and_nothing_runs() {
        for job in [llm_job(), ha_job("light.kitchen", "turn_on", true, grant("light.kitchen", &["turn_on"]))] {
            let io = Fake::new();
            io.stopped.set(true);
            let outcome = process_claim(&job, caps(), &io).unwrap();
            assert_eq!((outcome.status, outcome.reason), ("failed", "kill_switch_engaged"));
            assert_eq!(io.infer_calls.get(), 0);
            assert!(io.ha_calls.borrow().is_empty());
            assert!(io.outputs.borrow().is_empty());
            let receipts = io.receipts.borrow();
            assert_eq!(receipts[0]["status"], "failed");
            assert_eq!(receipts[0]["resultDigest"], crate::rental_jobs::result_digest(""));
        }
    }

    #[test]
    fn negative_a_stop_that_arrives_while_the_model_is_thinking_throws_the_answer_away() {
        let io = Fake::new();
        io.stop_after_reads.set(Some(1));
        let outcome = process_claim(&llm_job(), caps(), &io).unwrap();
        assert_eq!((outcome.status, outcome.reason), ("failed", "kill_switch_engaged"));
        assert_eq!(io.infer_calls.get(), 1);
        assert!(io.outputs.borrow().is_empty());
    }

    #[test]
    fn negative_a_stop_that_arrives_between_the_decision_and_the_appliance_call_prevents_the_call() {
        let io = Fake::new();
        io.stop_after_reads.set(Some(1));
        let outcome = process_claim(&ha_job("light.kitchen", "turn_on", true, grant("light.kitchen", &["turn_on"])), caps(), &io).unwrap();
        assert_eq!((outcome.status, outcome.reason), ("failed", "kill_switch_engaged"));
        assert!(io.ha_calls.borrow().is_empty());
    }

    #[test]
    fn negative_an_appliance_without_a_grant_never_reaches_home_assistant() {
        let io = Fake::new();
        let outcome = process_claim(&ha_job("light.kitchen", "turn_on", true, Value::Null), caps(), &io).unwrap();
        assert_eq!((outcome.status, outcome.reason), ("failed", "appliance_not_granted"));
        let other = process_claim(&ha_job("light.kitchen", "turn_on", true, grant("light.bedroom", &["turn_on"])), caps(), &io).unwrap();
        assert_eq!(other.reason, "appliance_not_granted");
        assert!(io.ha_calls.borrow().is_empty());
    }

    #[test]
    fn negative_a_lock_alarm_cover_or_valve_without_a_yes_is_not_touched() {
        let io = Fake::new();
        for entity in ["lock.front_door", "alarm_control_panel.house", "cover.garage", "valve.water"] {
            let outcome = process_claim(&ha_job(entity, "turn_off", false, grant(entity, &["turn_off"])), caps(), &io).unwrap();
            assert_eq!((outcome.status, outcome.reason), ("failed", "confirmation_required"), "{entity}");
        }
        assert!(io.ha_calls.borrow().is_empty());
        let yes = process_claim(&ha_job("lock.front_door", "turn_off", true, grant("lock.front_door", &["turn_off"])), caps(), &io).unwrap();
        assert_eq!(yes.status, "completed");
        assert_eq!(io.ha_calls.borrow().len(), 1);
    }

    #[test]
    fn negative_a_shell_or_any_unknown_service_is_answered_with_a_failure_and_executes_nothing() {
        let io = Fake::new();
        for kind in ["shell.exec", "ssh.open", "home_tunnel", "remote_desktop"] {
            let value = json!({ "jobRef": JOB, "capabilityType": kind, "task": { "kind": kind, "command": "rm -rf /" } });
            let outcome = process_claim(&value, caps(), &io).unwrap();
            assert_eq!((outcome.status, outcome.reason), ("failed", "service_not_allowed"), "{kind}");
        }
        assert_eq!(io.infer_calls.get(), 0);
        assert!(io.ha_calls.borrow().is_empty());
        assert_eq!(io.receipts.borrow().len(), 4);
    }

    #[test]
    fn a_node_set_up_for_one_thing_refuses_the_other() {
        let io = Fake::new();
        let no_llm = process_claim(&llm_job(), Capabilities { llm: false, ha: true }, &io).unwrap();
        assert_eq!(no_llm.reason, "inference_not_configured");
        let no_ha = process_claim(&ha_job("light.kitchen", "turn_on", true, grant("light.kitchen", &["turn_on"])), Capabilities { llm: true, ha: false }, &io).unwrap();
        assert_eq!(no_ha.reason, "ha_not_configured");
        assert_eq!(io.infer_calls.get(), 0);
        assert!(io.ha_calls.borrow().is_empty());
    }

    #[test]
    fn a_failing_model_or_home_assistant_is_a_failed_receipt_with_no_answer() {
        let io = Fake::new();
        *io.infer_reply.borrow_mut() = Err("local_inference_failed");
        let outcome = process_claim(&llm_job(), caps(), &io).unwrap();
        assert_eq!((outcome.status, outcome.reason), ("failed", "local_inference_failed"));
        *io.ha_reply.borrow_mut() = Err("ha_call_failed");
        let outcome = process_claim(&ha_job("light.kitchen", "turn_on", true, grant("light.kitchen", &["turn_on"])), caps(), &io).unwrap();
        assert_eq!((outcome.status, outcome.reason), ("failed", "ha_call_failed"));
        assert!(io.outputs.borrow().is_empty());
        assert!(io.receipts.borrow().iter().all(|r| r["status"] == "failed" && r["resultDigest"] == crate::rental_jobs::result_digest("")));
    }

    #[test]
    fn an_answer_longer_than_the_platform_takes_is_a_failure_not_a_cut_answer() {
        let io = Fake::new();
        *io.infer_reply.borrow_mut() = Ok("x".repeat(OUTPUT_MAX_CHARS + 1));
        let outcome = process_claim(&llm_job(), caps(), &io).unwrap();
        assert_eq!((outcome.status, outcome.reason), ("failed", "output_too_large"));
        *io.infer_reply.borrow_mut() = Ok("x".repeat(OUTPUT_MAX_CHARS));
        assert_eq!(process_claim(&llm_job(), caps(), &io).unwrap().status, "completed");
    }

    #[test]
    fn no_receipt_means_an_error_for_the_caller_and_no_answer_is_sent() {
        let io = Fake::new();
        io.sign_fails.set(true);
        assert_eq!(process_claim(&llm_job(), caps(), &io), Err("sign_failed"));
        let io = Fake::new();
        io.post_fails.set(true);
        assert_eq!(process_claim(&llm_job(), caps(), &io), Err("platform_unreachable"));
        assert!(io.outputs.borrow().is_empty());
        let io = Fake::new();
        for bad in [json!({ "jobRef": "nope", "task": {} }), json!(null), json!({ "task": {} })] {
            assert_eq!(process_claim(&bad, caps(), &io), Err("job_invalid"));
        }
        assert!(io.receipts.borrow().is_empty());
    }

    #[test]
    fn the_declaration_offers_only_what_is_set_up_and_is_the_shape_the_platform_decodes() {
        let now = DateTime::parse_from_rfc3339("2026-10-20T02:00:00Z").unwrap().with_timezone(&Utc);
        let id = "33333333-4444-4555-8666-777777777777";
        let both = build_declaration("dev_0123456789abcdef0123456789abcdef", id, "dsc_key_1", "22222222-3333-4444-8555-666666666666", 3, caps(), now);
        assert_eq!(both["kind"], "desktop");
        assert_eq!(both["attestedBy"], "device_key");
        assert_eq!(both["shellBindingRef"], json!({ "type": "shell_session_binding", "id": "22222222-3333-4444-8555-666666666666", "version": 3 }));
        assert_eq!(both["observedAt"], "2026-10-20T02:00:00.000Z");
        assert_eq!(both["expiresAt"], "2026-10-20T02:10:00.000Z");
        let types: Vec<&str> = both["items"].as_array().unwrap().iter().map(|i| i["type"].as_str().unwrap()).collect();
        assert_eq!(types, vec!["llm.generate.v1", "ha.call.v1"]);
        assert_eq!(both["items"][1]["category"], "actuation");
        let only_ha = build_declaration("dev_0123456789abcdef0123456789abcdef", id, "dsc_key_1", "22222222-3333-4444-8555-666666666666", 3, Capabilities { llm: false, ha: true }, now);
        assert_eq!(only_ha["items"].as_array().unwrap().len(), 1);
        let nothing = build_declaration("dev_0123456789abcdef0123456789abcdef", id, "dsc_key_1", "22222222-3333-4444-8555-666666666666", 3, Capabilities { llm: false, ha: false }, now);
        assert!(nothing["items"].as_array().unwrap().is_empty());
    }
}
