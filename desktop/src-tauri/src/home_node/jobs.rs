//! L8 D3: what a home job is, and the gate every job passes before the node does anything for it.
//!
//! The platform decides who may send a job (`backend/src/modules/home-node`); this side decides again, because the
//! node is the one that touches the house. Only two kinds of task exist, `llm.generate.v1` (local inference) and
//! `ha.call.v1` (Home Assistant). A shell, SSH, a tunnel or any other kind never gets as far as a decision: it ends as
//! a failed receipt. Nothing here reads a file, opens a socket or logs the content of a job.
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Map, Value};

pub const LLM_KIND: &str = "llm.generate.v1";
pub const HA_KIND: &str = "ha.call.v1";
pub const PROMPT_MAX_CHARS: usize = 16_000;
pub const MAX_OUTPUT_TOKENS_MAX: u32 = 4096;
pub const DATA_KEYS_MAX: usize = 8;
pub const DATA_STRING_MAX: usize = 200;
/// Home Assistant domains where every change needs a yes, even with a grant (`HOME_CONFIRM_EACH_TIME_DOMAINS_V0`).
pub const CONFIRM_EACH_TIME_DOMAINS: [&str; 4] = ["lock", "alarm_control_panel", "cover", "valve"];
pub const ACTIONS: [&str; 4] = ["read", "turn_on", "turn_off", "set"];

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "kind")]
pub enum Task {
    #[serde(rename = "llm.generate.v1", rename_all = "camelCase")]
    Llm {
        prompt: String,
        #[serde(default)]
        max_output_tokens: Option<u32>,
    },
    #[serde(rename = "ha.call.v1", rename_all = "camelCase")]
    Ha {
        entity_id: String,
        action: String,
        #[serde(default)]
        data: Option<Map<String, Value>>,
    },
}

/// `HomeApplianceGrantV0`, as the platform hands it over with the job.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Grant {
    pub entity_id: String,
    pub actions: Vec<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
}

/// One job as `GET /api/home-node/jobs/next` returns it.
#[derive(Debug, Clone, PartialEq)]
pub struct Claim {
    pub job_ref: String,
    pub capability_type: String,
    pub task: Task,
    /// A person has said yes to this job (only after a confirmation).
    pub confirmed: bool,
    pub grant: Option<Grant>,
}

/// `hj_` + 32 lowercase hex, the only job reference the platform issues.
pub fn is_job_ref(value: &str) -> bool {
    value.len() == 35 && value.starts_with("hj_") && value[3..].bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// Reads a claim. `Err("job_invalid")` when there is no usable job reference (nothing to report a receipt against);
/// `Ok(Err(reference))` when the job is real but its task is not one this node knows (answered with a failed receipt).
pub fn decode_claim(value: &Value) -> Result<Result<Claim, String>, &'static str> {
    let object = value.as_object().ok_or("job_invalid")?;
    let job_ref = object.get("jobRef").and_then(Value::as_str).ok_or("job_invalid")?;
    if !is_job_ref(job_ref) {
        return Err("job_invalid");
    }
    let capability_type = object.get("capabilityType").and_then(Value::as_str).unwrap_or("").to_string();
    let confirmed = object.get("confirmed").and_then(Value::as_bool).unwrap_or(false);
    let grant = object.get("grant").filter(|grant| !grant.is_null()).and_then(|grant| serde_json::from_value::<Grant>(grant.clone()).ok());
    let task = object.get("task").cloned().unwrap_or(Value::Null);
    Ok(match serde_json::from_value::<Task>(task) {
        Ok(task) => Ok(Claim { job_ref: job_ref.to_string(), capability_type, task, confirmed, grant }),
        Err(_) => Err(job_ref.to_string()),
    })
}

/// What this node is set up to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Capabilities {
    pub llm: bool,
    pub ha: bool,
}

/// `Home Assistant entity id`, for example `light.kitchen`: lower-case domain, a dot, a short name. No wildcards.
pub fn is_entity_id(value: &str) -> bool {
    let Some((domain, name)) = value.split_once('.') else { return false };
    (2..=32).contains(&domain.len())
        && domain.bytes().all(|b| b.is_ascii_lowercase() || b == b'_')
        && (1..=64).contains(&name.len())
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

pub fn entity_domain(entity_id: &str) -> &str {
    entity_id.split('.').next().unwrap_or("")
}

/// Reads never ask; any change in a sensitive domain always asks (`homeApplianceNeedsConfirmV0`).
pub fn needs_confirmation(entity_id: &str, action: &str) -> bool {
    action != "read" && CONFIRM_EACH_TIME_DOMAINS.contains(&entity_domain(entity_id))
}

/// True only when the grant names exactly this entity and action and has not run out (`homeApplianceActionAllowedV0`).
/// A grant whose end time cannot be read counts as run out.
pub fn grant_allows(grant: Option<&Grant>, entity_id: &str, action: &str, now: DateTime<Utc>) -> bool {
    let Some(grant) = grant else { return false };
    if grant.entity_id != entity_id || !grant.actions.iter().any(|a| a == action) {
        return false;
    }
    match &grant.expires_at {
        None => true,
        Some(text) => DateTime::parse_from_rfc3339(text).map(|end| end.with_timezone(&Utc) > now).unwrap_or(false),
    }
}

/// Keys a job may never carry in `data`: Home Assistant merges them into the target set of a call, so one could widen
/// a grant for one entity into an area, floor, label or device (`HOME_DATA_DENIED_KEYS_V1`).
pub const DATA_DENIED_KEYS: [&str; 6] = ["entity_id", "device_id", "area_id", "floor_id", "label_id", "code"];

/// The only `data` keys a job may carry, by (domain, action); any other pair takes none (`HOME_DATA_KEYS_V1`).
pub fn data_keys_for(domain: &str, action: &str) -> &'static [&'static str] {
    match (domain, action) {
        ("light", "turn_on" | "set") => &["brightness", "brightness_pct", "color_temp", "color_temp_kelvin", "transition"],
        ("fan", "turn_on") => &["percentage"],
        ("climate", "set") => &["temperature"],
        ("cover", "set") => &["position"],
        ("number" | "input_number", "set") => &["value"],
        _ => &[],
    }
}

fn data_ok(entity_id: &str, action: &str, data: &Option<Map<String, Value>>) -> bool {
    let Some(data) = data else { return true };
    if action != "turn_on" && action != "set" {
        return false;
    }
    if data.is_empty() || data.len() > DATA_KEYS_MAX {
        return false;
    }
    let allowed = data_keys_for(entity_domain(entity_id), action);
    data.iter().all(|(key, value)| {
        let key_ok = !key.is_empty()
            && key.len() <= 32
            && key.as_bytes()[0].is_ascii_lowercase()
            && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
            && !DATA_DENIED_KEYS.contains(&key.as_str())
            && allowed.contains(&key.as_str());
        let value_ok = match value {
            Value::Bool(_) => true,
            Value::Number(_) => true,
            Value::String(text) => text.chars().count() <= DATA_STRING_MAX && !text.chars().any(|c| c.is_control()),
            _ => false,
        };
        key_ok && value_ok
    })
}

/// Why a job is not run, or `None` when it may run. `stopped` is the emergency stop (true when it cannot be read).
/// The order is the order of the checks: the stop first, then what the job is, then what it needs.
pub fn refusal(claim: &Claim, stopped: bool, caps: Capabilities, now: DateTime<Utc>) -> Option<&'static str> {
    if stopped {
        return Some("kill_switch_engaged");
    }
    match &claim.task {
        Task::Llm { prompt, max_output_tokens } => {
            if claim.capability_type != LLM_KIND {
                return Some("job_invalid");
            }
            if !caps.llm {
                return Some("inference_not_configured");
            }
            if prompt.trim().is_empty() || prompt.chars().count() > PROMPT_MAX_CHARS {
                return Some("job_invalid");
            }
            if max_output_tokens.map(|n| n == 0 || n > MAX_OUTPUT_TOKENS_MAX).unwrap_or(false) {
                return Some("job_invalid");
            }
            None
        }
        Task::Ha { entity_id, action, data } => {
            if claim.capability_type != HA_KIND {
                return Some("job_invalid");
            }
            if !caps.ha {
                return Some("ha_not_configured");
            }
            if !is_entity_id(entity_id) || !ACTIONS.contains(&action.as_str()) || !data_ok(entity_id, action, data) {
                return Some("job_invalid");
            }
            if !grant_allows(claim.grant.as_ref(), entity_id, action, now) {
                return Some("appliance_not_granted");
            }
            if needs_confirmation(entity_id, action) && !claim.confirmed {
                return Some("confirmation_required");
            }
            None
        }
    }
}

/// A local inference address must be this computer: `http`, no credentials, and `127.0.0.1`, `[::1]` or `localhost`.
/// The caller never follows redirects, so an answer cannot send the node anywhere else.
pub fn local_inference_url(raw: &str) -> Result<reqwest::Url, &'static str> {
    let url = reqwest::Url::parse(raw).map_err(|_| "local_inference_url_invalid")?;
    if url.scheme() != "http" || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return Err("local_inference_url_invalid");
    }
    let host = url.host_str().ok_or("local_inference_url_invalid")?;
    let loopback = host == "localhost" || host == "[::1]" || host.parse::<std::net::Ipv4Addr>().map(|ip| ip.is_loopback()).unwrap_or(false);
    if loopback {
        Ok(url)
    } else {
        Err("local_inference_not_loopback")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const JOB: &str = "hj_0123456789abcdef0123456789abcdef";

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-20T02:00:00Z").unwrap().with_timezone(&Utc)
    }

    fn caps() -> Capabilities {
        Capabilities { llm: true, ha: true }
    }

    fn claim(task: Value, kind: &str, confirmed: bool, grant: Option<Value>) -> Claim {
        let value = json!({ "jobRef": JOB, "capabilityType": kind, "task": task, "confirmed": confirmed, "grant": grant });
        decode_claim(&value).unwrap().unwrap()
    }

    fn ha(entity: &str, action: &str, confirmed: bool, grant: Option<Value>) -> Claim {
        claim(json!({ "kind": HA_KIND, "entityId": entity, "action": action }), HA_KIND, confirmed, grant)
    }

    fn grant(entity: &str, actions: &[&str], expires: Option<&str>) -> Option<Value> {
        Some(json!({ "entityId": entity, "actions": actions, "expiresAt": expires }))
    }

    #[test]
    fn a_text_job_runs_when_inference_is_set_up() {
        let job = claim(json!({ "kind": LLM_KIND, "prompt": "hello", "maxOutputTokens": 256 }), LLM_KIND, true, None);
        assert_eq!(refusal(&job, false, caps(), now()), None);
        assert_eq!(refusal(&job, false, Capabilities { llm: false, ha: true }, now()), Some("inference_not_configured"));
    }

    #[test]
    fn the_emergency_stop_beats_everything_else() {
        let job = claim(json!({ "kind": LLM_KIND, "prompt": "hello" }), LLM_KIND, true, None);
        assert_eq!(refusal(&job, true, caps(), now()), Some("kill_switch_engaged"));
        let light = ha("light.kitchen", "turn_on", true, grant("light.kitchen", &["turn_on"], None));
        assert_eq!(refusal(&light, true, caps(), now()), Some("kill_switch_engaged"));
    }

    #[test]
    fn a_shell_or_any_other_kind_never_becomes_a_task() {
        for kind in ["shell.exec", "ssh.open", "home_tunnel", "sandbox.code.v1", ""] {
            let value = json!({ "jobRef": JOB, "capabilityType": kind, "task": { "kind": kind, "command": "ls" } });
            assert_eq!(decode_claim(&value).unwrap().unwrap_err(), JOB, "{kind} is a job the node must answer with a failure");
        }
        let missing = json!({ "jobRef": JOB, "capabilityType": LLM_KIND });
        assert_eq!(decode_claim(&missing).unwrap().unwrap_err(), JOB);
    }

    #[test]
    fn a_job_reference_the_platform_could_not_issue_is_refused() {
        for bad in ["", "hj_0123", "drj_0123456789abcdef0123456789abcdef", "hj_0123456789ABCDEF0123456789abcdef", "hj_0123456789abcdef0123456789abcdeg"] {
            let value = json!({ "jobRef": bad, "capabilityType": LLM_KIND, "task": { "kind": LLM_KIND, "prompt": "x" } });
            assert_eq!(decode_claim(&value).unwrap_err(), "job_invalid");
        }
        assert_eq!(decode_claim(&json!("not an object")).unwrap_err(), "job_invalid");
    }

    #[test]
    fn a_kind_that_does_not_match_the_task_is_refused() {
        let job = claim(json!({ "kind": LLM_KIND, "prompt": "hello" }), HA_KIND, true, None);
        assert_eq!(refusal(&job, false, caps(), now()), Some("job_invalid"));
        let light = claim(json!({ "kind": HA_KIND, "entityId": "light.kitchen", "action": "turn_on" }), LLM_KIND, true, grant("light.kitchen", &["turn_on"], None));
        assert_eq!(refusal(&light, false, caps(), now()), Some("job_invalid"));
    }

    #[test]
    fn an_appliance_without_a_grant_for_that_entity_and_action_is_refused() {
        assert_eq!(refusal(&ha("light.kitchen", "turn_on", true, None), false, caps(), now()), Some("appliance_not_granted"));
        assert_eq!(refusal(&ha("light.kitchen", "turn_off", true, grant("light.kitchen", &["turn_on"], None)), false, caps(), now()), Some("appliance_not_granted"));
        assert_eq!(refusal(&ha("light.bedroom", "turn_on", true, grant("light.kitchen", &["turn_on"], None)), false, caps(), now()), Some("appliance_not_granted"));
        assert_eq!(refusal(&ha("light.kitchen", "turn_on", true, grant("light.kitchen", &["turn_on"], Some("2026-10-20T01:59:59Z"))), false, caps(), now()), Some("appliance_not_granted"));
        assert_eq!(refusal(&ha("light.kitchen", "turn_on", true, grant("light.kitchen", &["turn_on"], Some("not a time"))), false, caps(), now()), Some("appliance_not_granted"));
        assert_eq!(refusal(&ha("light.kitchen", "turn_on", false, grant("light.kitchen", &["turn_on"], Some("2026-10-20T03:00:00Z"))), false, caps(), now()), None);
        assert_eq!(refusal(&ha("light.kitchen", "turn_on", false, grant("light.kitchen", &["turn_on", "read"], None)), false, Capabilities { llm: true, ha: false }, now()), Some("ha_not_configured"));
    }

    #[test]
    fn locks_alarms_covers_and_valves_do_not_run_without_a_yes_even_with_a_grant() {
        for entity in ["lock.front_door", "alarm_control_panel.house", "cover.garage", "valve.water"] {
            let granted = grant(entity, &["read", "turn_on", "turn_off", "set"], None);
            for action in ["turn_on", "turn_off", "set"] {
                assert_eq!(refusal(&ha(entity, action, false, granted.clone()), false, caps(), now()), Some("confirmation_required"), "{entity} {action}");
                assert_eq!(refusal(&ha(entity, action, true, granted.clone()), false, caps(), now()), None, "{entity} {action} confirmed");
            }
            assert_eq!(refusal(&ha(entity, "read", false, granted), false, caps(), now()), None, "{entity} read never asks");
        }
        assert!(!needs_confirmation("light.kitchen", "turn_on"));
    }

    #[test]
    fn a_malformed_entity_a_wildcard_or_unknown_action_or_bad_data_is_refused() {
        let g = |e: &str| grant(e, &["turn_on", "set"], None);
        for entity in ["light.*", "light", "Light.kitchen", "light.kitchen; rm", "light.", ".kitchen", "li.ght.x"] {
            assert_eq!(refusal(&ha(entity, "turn_on", true, g(entity)), false, caps(), now()), Some("job_invalid"), "{entity}");
        }
        assert_eq!(refusal(&ha("light.kitchen", "delete", true, g("light.kitchen")), false, caps(), now()), Some("job_invalid"));
        let with = |data: Value, action: &str| claim(json!({ "kind": HA_KIND, "entityId": "light.kitchen", "action": action, "data": data }), HA_KIND, true, grant("light.kitchen", &["turn_on", "turn_off", "set", "read"], None));
        assert_eq!(refusal(&with(json!({ "brightness": 120 }), "turn_on"), false, caps(), now()), None);
        assert_eq!(refusal(&with(json!({ "brightness": 120 }), "turn_off"), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&with(json!({ "brightness": 120 }), "read"), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&with(json!({ "entity_id": "lock.front_door" }), "turn_on"), false, caps(), now()), Some("job_invalid"));
        // A key that names a target set widens the grant: refused, alone or next to a good key.
        for key in ["area_id", "device_id", "floor_id", "label_id", "code", "entity_id"] {
            assert_eq!(refusal(&with(json!({ key: "garage" }), "turn_on"), false, caps(), now()), Some("job_invalid"), "{key}");
            assert_eq!(refusal(&with(json!({ "brightness": 120, key: "garage" }), "set"), false, caps(), now()), Some("job_invalid"), "{key} with a good key");
        }
        // Only the keys of that (domain, action) pass; everything else is refused.
        assert_eq!(refusal(&with(json!({ "position": 50 }), "turn_on"), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&with(json!({ "brightness": 120, "transition": 2 }), "set"), false, caps(), now()), None);
        let switch = claim(json!({ "kind": HA_KIND, "entityId": "switch.fan", "action": "turn_on", "data": { "brightness": 1 } }), HA_KIND, true, grant("switch.fan", &["turn_on"], None));
        assert_eq!(refusal(&switch, false, caps(), now()), Some("job_invalid"));
        let cover = claim(json!({ "kind": HA_KIND, "entityId": "cover.garage", "action": "set", "data": { "area_id": "garage" } }), HA_KIND, true, grant("cover.garage", &["set"], None));
        assert_eq!(refusal(&cover, false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&with(json!({ "x": { "nested": 1 } }), "turn_on"), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&with(json!({ "x": [1] }), "turn_on"), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&with(json!({}), "turn_on"), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&with(json!({ "Bad-Key": 1 }), "turn_on"), false, caps(), now()), Some("job_invalid"));
    }

    #[test]
    fn an_empty_or_oversized_prompt_or_token_limit_is_refused() {
        let llm = |prompt: String, tokens: Option<u32>| claim(json!({ "kind": LLM_KIND, "prompt": prompt, "maxOutputTokens": tokens }), LLM_KIND, true, None);
        assert_eq!(refusal(&llm("   ".into(), None), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&llm("x".repeat(PROMPT_MAX_CHARS + 1), None), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&llm("x".repeat(PROMPT_MAX_CHARS), None), false, caps(), now()), None);
        assert_eq!(refusal(&llm("hi".into(), Some(0)), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&llm("hi".into(), Some(MAX_OUTPUT_TOKENS_MAX + 1)), false, caps(), now()), Some("job_invalid"));
        assert_eq!(refusal(&llm("hi".into(), Some(MAX_OUTPUT_TOKENS_MAX)), false, caps(), now()), None);
    }

    #[test]
    fn local_inference_may_only_be_this_computer() {
        for ok in ["http://127.0.0.1:8080/v1/completions", "http://localhost:11434/v1/completions", "http://[::1]:8080/x", "http://127.0.0.5/x"] {
            assert!(local_inference_url(ok).is_ok(), "{ok}");
        }
        for bad in [
            "https://127.0.0.1/x",
            "http://192.168.1.20:8080/x",
            "http://10.0.0.1/x",
            "http://169.254.169.254/latest/meta-data",
            "http://example.com/x",
            "http://localhost.evil.com/x",
            "http://127.0.0.1.evil.com/x",
            "http://user:pass@127.0.0.1/x",
            "http://0.0.0.0:8080/x",
            "file:///etc/passwd",
            "ftp://127.0.0.1/x",
            "not a url",
            "",
        ] {
            assert!(local_inference_url(bad).is_err(), "{bad}");
        }
    }
}
