//! L5 device rental, the owner's rules on this computer (REQ-desktop-060 §3,
//! E100; coord on REQ-desktop-062). Default off.
//!
//! The rule itself is a `DeviceCapabilityRuleV0` from
//! `shared/types/device-capability.ts`. TypeScript validates it with
//! `validateDeviceCapabilityRuleV0` and decides with the contract's own
//! functions (`deviceCapabilityRentableV0`, `deviceRuleWindowContainsV0`);
//! Rust does not judge the rule. Rust keeps:
//! - the signed local copy of the rule (until the server stores rules), plus
//!   the local switch and this machine's limits (idle minutes, cores,
//!   memory), at `<app data>/rental-rules.json` (0600), HMAC-SHA256 under the
//!   always-on node allowlist's keychain key with its own domain
//!   (`agentrix.rental-rules.v1`), so there is no second keychain prompt. A
//!   file that does not verify counts as "off";
//! - the readings TypeScript needs: idle time, power source, thermal state,
//!   emergency stop. Anything unreadable is reported as unknown.
//!
//! Only the owner edits these, from "这台电脑 → 出租（试验）"; no chat tool or
//! remote channel maps to the commands (not in the fence registry).
use crate::node_allowlist::AllowlistKey;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;

pub const FILE_NAME: &str = "rental-rules.json";
const MAC_DOMAIN: &[u8] = b"agentrix.rental-rules.v1\n";
const SCHEMA_VERSION: u32 = 1;
/// A `DeviceCapabilityRuleV0` is a few hundred bytes; anything far larger is not one.
pub const MAX_RULE_BYTES: usize = 8 * 1024;
pub const MIN_IDLE_MINUTES: u32 = 5;
pub const MAX_IDLE_MINUTES: u32 = 240;
pub const DEFAULT_IDLE_MINUTES: u32 = 15;
pub const DEFAULT_MAX_CORES: u32 = 2;
pub const DEFAULT_MAX_MEMORY_GIB: u32 = 4;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stored {
    pub schema_version: u32,
    /// The local switch ("暂停出租" turns it off).
    pub enabled: bool,
    /// The owner's `DeviceCapabilityRuleV0` for `llm.generate.v1`, as JSON.
    pub rule: Option<serde_json::Value>,
    pub idle_minutes: u32,
    pub max_cores: u32,
    pub max_memory_gib: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mac: Option<String>,
}

impl Default for Stored {
    fn default() -> Self {
        Stored {
            schema_version: SCHEMA_VERSION,
            enabled: false,
            rule: None,
            idle_minutes: DEFAULT_IDLE_MINUTES,
            max_cores: DEFAULT_MAX_CORES,
            max_memory_gib: DEFAULT_MAX_MEMORY_GIB,
            mac: None,
        }
    }
}

/// What the WebView may send: everything but the version and the MAC.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoredInput {
    pub enabled: bool,
    pub rule: Option<serde_json::Value>,
    pub idle_minutes: u32,
    pub max_cores: u32,
    pub max_memory_gib: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Integrity {
    Empty,
    Ok,
    Tampered,
    KeyUnavailable,
}

/// The local limits are checked here; the rule's shape is the contract's
/// job (TypeScript). Rust only refuses what cannot be a rule at all.
pub fn validate(input: StoredInput) -> Result<Stored, &'static str> {
    if let Some(rule) = &input.rule {
        if !rule.is_object() {
            return Err("rule_invalid");
        }
        let size = serde_json::to_vec(rule).map(|b| b.len()).unwrap_or(usize::MAX);
        if size > MAX_RULE_BYTES {
            return Err("rule_too_large");
        }
    }
    if input.enabled && input.rule.is_none() {
        return Err("rule_missing");
    }
    if !(MIN_IDLE_MINUTES..=MAX_IDLE_MINUTES).contains(&input.idle_minutes) {
        return Err("idle_minutes_invalid");
    }
    if !(1..=256).contains(&input.max_cores) {
        return Err("max_cores_invalid");
    }
    if !(1..=4096).contains(&input.max_memory_gib) {
        return Err("max_memory_invalid");
    }
    Ok(Stored {
        schema_version: SCHEMA_VERSION,
        enabled: input.enabled,
        rule: input.rule,
        idle_minutes: input.idle_minutes,
        max_cores: input.max_cores,
        max_memory_gib: input.max_memory_gib,
        mac: None,
    })
}

// ── Signed storage ──────────────────────────────────────────────────────────

fn mac_input(stored: &Stored) -> Option<Vec<u8>> {
    let mut unsigned = stored.clone();
    unsigned.mac = None;
    let mut bytes = MAC_DOMAIN.to_vec();
    bytes.extend(serde_json::to_vec(&unsigned).ok()?);
    Some(bytes)
}

fn hmac_key(key: &[u8; 32]) -> ring::hmac::Key {
    ring::hmac::Key::new(ring::hmac::HMAC_SHA256, key)
}

fn sign(stored: &mut Stored, key: &[u8; 32]) {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine as _;
    stored.mac = None;
    if let Some(input) = mac_input(stored) {
        stored.mac = Some(URL_SAFE_NO_PAD.encode(ring::hmac::sign(&hmac_key(key), &input).as_ref()));
    }
}

fn verify(stored: &Stored, key: &[u8; 32]) -> bool {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine as _;
    let Some(mac) = stored.mac.as_deref() else { return false };
    if stored.schema_version != SCHEMA_VERSION {
        return false;
    }
    let (Ok(tag), Some(input)) = (URL_SAFE_NO_PAD.decode(mac), mac_input(stored)) else {
        return false;
    };
    ring::hmac::verify(&hmac_key(key), &input, &tag).is_ok()
}

/// Read the rules. Anything that does not verify is the default (off, no rule).
pub fn load(path: &Path, keys: &dyn AllowlistKey) -> (Stored, Integrity) {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return (Stored::default(), Integrity::Empty),
        Err(_) => return (Stored::default(), Integrity::Tampered),
    };
    let Ok(stored) = serde_json::from_slice::<Stored>(&bytes) else {
        return (Stored::default(), Integrity::Tampered);
    };
    let Some(key) = keys.get(false) else {
        return (Stored::default(), Integrity::KeyUnavailable);
    };
    if !verify(&stored, &key) {
        return (Stored::default(), Integrity::Tampered);
    }
    (stored, Integrity::Ok)
}

/// Sign and write atomically (0600).
pub fn save(path: &Path, stored: &Stored, keys: &dyn AllowlistKey) -> Result<(), &'static str> {
    let key = keys.get(true).ok_or("rental_rules_key_unavailable")?;
    let mut signed = stored.clone();
    signed.schema_version = SCHEMA_VERSION;
    sign(&mut signed, &key);
    let bytes = serde_json::to_vec_pretty(&signed).map_err(|_| "rental_rules_write_failed")?;
    let dir = path.parent().ok_or("rental_rules_write_failed")?;
    std::fs::create_dir_all(dir).map_err(|_| "rental_rules_write_failed")?;
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
        return Err("rental_rules_write_failed");
    }
    Ok(())
}

// ── Readings ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Thermal {
    Nominal,
    Elevated,
    Unknown,
}

/// `pmset -g therm`. Nominal only when it says no thermal warning has been
/// recorded and no CPU speed / scheduler limit is below 100; any recorded
/// warning or a lower limit is elevated; anything else is unknown.
pub fn parse_pmset_therm(output: &str) -> Thermal {
    let mut no_thermal_warning = false;
    let mut elevated = false;
    for line in output.lines().map(str::trim) {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("note: no thermal warning level") {
            no_thermal_warning = true;
        } else if (lower.contains("thermal warning level") || lower.contains("performance warning level")) && !lower.starts_with("note: no ") {
            elevated = true;
        }
        for key in ["CPU_Speed_Limit", "CPU_Scheduler_Limit"] {
            if let Some(rest) = line.strip_prefix(key) {
                match rest.trim().trim_start_matches('=').trim().parse::<u32>() {
                    Ok(limit) if limit >= 100 => {}
                    Ok(_) => elevated = true,
                    Err(_) => return Thermal::Unknown,
                }
            }
        }
    }
    if elevated {
        Thermal::Elevated
    } else if no_thermal_warning {
        Thermal::Nominal
    } else {
        Thermal::Unknown
    }
}

/// `ioreg -c IOHIDSystem`: `"HIDIdleTime" = <nanoseconds>` → whole seconds.
pub fn parse_hid_idle(output: &str) -> Option<u64> {
    output.lines().find_map(|line| {
        let rest = line.split("\"HIDIdleTime\"").nth(1)?;
        let value = rest.trim().strip_prefix('=')?.trim();
        value.parse::<u64>().ok().map(|ns| ns / 1_000_000_000)
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Probes {
    pub power: crate::power_source::PowerSource,
    pub idle_seconds: Option<u64>,
    pub thermal: Thermal,
    pub kill_switch: bool,
    /// Rental runs on macOS only for now (E100 ②).
    pub supported_os: bool,
}

#[cfg(target_os = "macos")]
fn run_probe(program: &str, args: &[&str]) -> Option<String> {
    let output = std::process::Command::new(program).args(args).env_clear().output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(target_os = "macos")]
pub fn probe_now() -> Probes {
    Probes {
        power: crate::power_source::current(),
        idle_seconds: run_probe("/usr/sbin/ioreg", &["-c", "IOHIDSystem", "-d", "4"]).and_then(|o| parse_hid_idle(&o)),
        thermal: run_probe("/usr/bin/pmset", &["-g", "therm"]).map(|o| parse_pmset_therm(&o)).unwrap_or(Thermal::Unknown),
        kill_switch: crate::kill_switch::is_engaged(),
        supported_os: true,
    }
}

#[cfg(not(target_os = "macos"))]
pub fn probe_now() -> Probes {
    Probes {
        power: crate::power_source::current(),
        idle_seconds: None,
        thermal: Thermal::Unknown,
        kill_switch: crate::kill_switch::is_engaged(),
        supported_os: false,
    }
}

/// Total memory in bytes (0 when unreadable, which caps rental memory at 0).
pub fn total_memory_bytes() -> u64 {
    #[cfg(target_os = "macos")]
    {
        run_probe("/usr/sbin/sysctl", &["-n", "hw.memsize"]).and_then(|o| o.trim().parse().ok()).unwrap_or(0)
    }
    #[cfg(not(target_os = "macos"))]
    {
        0
    }
}

/// Cores and memory a rented task may use: the owner's numbers, never more
/// than all cores but one and half the memory.
pub fn effective_limits(stored: &Stored, cpus: u32, total_bytes: u64) -> (u32, u64) {
    const GIB: u64 = 1024 * 1024 * 1024;
    let cores = stored.max_cores.min(cpus.saturating_sub(1)).max(1);
    let memory = (u64::from(stored.max_memory_gib) * GIB).min(total_bytes / 2);
    (cores, memory)
}

// ── What the page shows ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub enabled: bool,
    pub integrity: Integrity,
    pub rule: Option<serde_json::Value>,
    pub idle_minutes: u32,
    pub max_cores: u32,
    pub max_memory_gib: u32,
    pub probes: Probes,
    pub cpus: u32,
    pub cores_allowed: u32,
    pub memory_gib_allowed: u32,
}

pub fn view(stored: &Stored, integrity: Integrity, probes: Probes, cpus: u32, total_bytes: u64) -> View {
    let (cores, memory) = effective_limits(stored, cpus, total_bytes);
    View {
        enabled: stored.enabled && integrity == Integrity::Ok,
        integrity,
        rule: stored.rule.clone(),
        idle_minutes: stored.idle_minutes,
        max_cores: stored.max_cores,
        max_memory_gib: stored.max_memory_gib,
        probes,
        cpus,
        cores_allowed: cores,
        memory_gib_allowed: (memory / (1024 * 1024 * 1024)) as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use zeroize::Zeroizing;

    struct MemoryKey(RefCell<Option<[u8; 32]>>);
    impl AllowlistKey for MemoryKey {
        fn get(&self, create: bool) -> Option<Zeroizing<[u8; 32]>> {
            let mut slot = self.0.borrow_mut();
            if slot.is_none() && create {
                *slot = Some([7u8; 32]);
            }
            slot.map(Zeroizing::new)
        }
    }
    fn key() -> MemoryKey {
        MemoryKey(RefCell::new(None))
    }
    fn rule() -> serde_json::Value {
        serde_json::json!({
            "deviceId": "desktop-1", "capabilityType": "llm.generate.v1", "audience": ["other_agents"],
            "windows": ["22:00-07:00"], "timezone": "Asia/Shanghai", "requireIdle": true, "requireOnPower": true,
            "approval": "first_time", "minPriceCentsPerJob": 5, "maxJobsPerDay": 20, "maxMinutesPerDay": 120, "revision": 1
        })
    }
    fn input() -> StoredInput {
        StoredInput { enabled: true, rule: Some(rule()), idle_minutes: 15, max_cores: 2, max_memory_gib: 4 }
    }

    #[test]
    fn default_is_off_without_a_rule() {
        let stored = Stored::default();
        assert!(!stored.enabled);
        assert!(stored.rule.is_none());
        let probes = Probes {
            power: crate::power_source::PowerSource::Ac,
            idle_seconds: Some(3600),
            thermal: Thermal::Nominal,
            kill_switch: false,
            supported_os: true,
        };
        assert!(!view(&stored, Integrity::Empty, probes, 8, 16 << 30).enabled);
        assert!(!view(&validate(input()).unwrap(), Integrity::Tampered, probes, 8, 16 << 30).enabled);
    }

    #[test]
    fn validate_refuses_what_cannot_be_a_rule_and_bad_limits() {
        assert!(validate(input()).is_ok());
        let cases: Vec<(Box<dyn Fn(&mut StoredInput)>, &str)> = vec![
            (Box::new(|i| i.rule = Some(serde_json::json!(["not", "an", "object"]))), "rule_invalid"),
            (Box::new(|i| i.rule = Some(serde_json::json!({ "pad": "x".repeat(MAX_RULE_BYTES) }))), "rule_too_large"),
            (Box::new(|i| i.rule = None), "rule_missing"),
            (Box::new(|i| i.idle_minutes = MIN_IDLE_MINUTES - 1), "idle_minutes_invalid"),
            (Box::new(|i| i.idle_minutes = MAX_IDLE_MINUTES + 1), "idle_minutes_invalid"),
            (Box::new(|i| i.max_cores = 0), "max_cores_invalid"),
            (Box::new(|i| i.max_memory_gib = 0), "max_memory_invalid"),
        ];
        for (edit, expected) in cases {
            let mut bad = input();
            edit(&mut bad);
            assert_eq!(validate(bad).err(), Some(expected));
        }
        // Off without a rule is fine (nothing set up yet).
        let mut off = input();
        off.enabled = false;
        off.rule = None;
        assert!(validate(off).is_ok());
    }

    #[test]
    fn input_cannot_carry_a_mac_or_version() {
        for extra in ["mac", "schemaVersion"] {
            let mut raw = serde_json::json!({ "enabled": true, "rule": null, "idleMinutes": 15, "maxCores": 2, "maxMemoryGib": 4 });
            raw[extra] = serde_json::json!("forged");
            assert!(serde_json::from_value::<StoredInput>(raw).is_err(), "{extra}");
        }
    }

    #[test]
    fn signed_file_round_trips_and_edits_count_as_off() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE_NAME);
        let keys = key();
        assert_eq!(load(&path, &keys).1, Integrity::Empty);
        let stored = validate(input()).unwrap();
        save(&path, &stored, &keys).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        }
        let (loaded, integrity) = load(&path, &keys);
        assert_eq!(integrity, Integrity::Ok);
        assert_eq!(loaded.rule, Some(rule()));
        assert!(loaded.enabled);

        // A shell command widens the rule: the whole file stops counting.
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"maxJobsPerDay\": 20"));
        std::fs::write(&path, text.replace("\"maxJobsPerDay\": 20", "\"maxJobsPerDay\": 2000")).unwrap();
        let (tampered, integrity) = load(&path, &keys);
        assert_eq!(integrity, Integrity::Tampered);
        assert_eq!(tampered, Stored::default());

        // An allowlist-domain MAC does not verify here (domain separation).
        save(&path, &stored, &keys).unwrap();
        let mut forged: Stored = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        forged.mac = None;
        let mut bytes = b"agentrix.node-allowlist.v1\n".to_vec();
        bytes.extend(serde_json::to_vec(&forged).unwrap());
        use base64::Engine as _;
        let tag = ring::hmac::sign(&ring::hmac::Key::new(ring::hmac::HMAC_SHA256, &[7u8; 32]), &bytes);
        forged.mac = Some(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(tag.as_ref()));
        std::fs::write(&path, serde_json::to_vec(&forged).unwrap()).unwrap();
        assert_eq!(load(&path, &keys).1, Integrity::Tampered);

        // Garbage and a missing key.
        std::fs::write(&path, b"{not json").unwrap();
        assert_eq!(load(&path, &keys).1, Integrity::Tampered);
        save(&path, &stored, &keys).unwrap();
        assert_eq!(load(&path, &key()).1, Integrity::KeyUnavailable);
    }

    #[test]
    fn parses_pmset_therm() {
        let intel_cool = "Note: No thermal warning level has been recorded\nNote: No performance warning level has been recorded\n\
                          2026-10-01 13:21:16 +0800 CPU Power notify\n\tCPU_Scheduler_Limit \t= 100\n\tCPU_Available_CPUs \t= 4\n\tCPU_Speed_Limit \t= 100\n";
        assert_eq!(parse_pmset_therm(intel_cool), Thermal::Nominal);
        assert_eq!(parse_pmset_therm(&intel_cool.replace("CPU_Speed_Limit \t= 100", "CPU_Speed_Limit \t= 72")), Thermal::Elevated);
        assert_eq!(parse_pmset_therm(&intel_cool.replace("Scheduler_Limit \t= 100", "Scheduler_Limit \t= 50")), Thermal::Elevated);
        assert_eq!(
            parse_pmset_therm("Thermal Warning Level set to 3.\nNote: No performance warning level has been recorded\n"),
            Thermal::Elevated
        );
        assert_eq!(
            parse_pmset_therm("Note: No thermal warning level has been recorded\nPerformance Warning Level set to 1.\n"),
            Thermal::Elevated
        );
        assert_eq!(parse_pmset_therm("Note: No thermal warning level has been recorded\n"), Thermal::Nominal);
        assert_eq!(parse_pmset_therm(""), Thermal::Unknown);
        assert_eq!(parse_pmset_therm("something else\n"), Thermal::Unknown);
        assert_eq!(parse_pmset_therm(&intel_cool.replace("= 100\n\tCPU_Available", "= ?\n\tCPU_Available")), Thermal::Unknown);
    }

    #[test]
    fn parses_hid_idle_time() {
        assert_eq!(parse_hid_idle("    | |     \"HIDIdleTime\" = 1594410412\n"), Some(1));
        assert_eq!(parse_hid_idle("\"HIDIdleTime\" = 905000000000"), Some(905));
        assert_eq!(parse_hid_idle("\"HIDIdleTimeX\" = 5"), None);
        assert_eq!(parse_hid_idle("\"HIDIdleTime\" = <data>"), None);
        assert_eq!(parse_hid_idle(""), None);
    }

    #[test]
    fn limits_leave_the_owner_a_core_and_half_the_memory() {
        const GIB: u64 = 1 << 30;
        let mut stored = validate(input()).unwrap();
        assert_eq!(effective_limits(&stored, 8, 16 * GIB), (2, 4 * GIB));
        stored.max_cores = 16;
        stored.max_memory_gib = 64;
        assert_eq!(effective_limits(&stored, 8, 16 * GIB), (7, 8 * GIB));
        assert_eq!(effective_limits(&stored, 1, 0), (1, 0));
        let probes = Probes {
            power: crate::power_source::PowerSource::Unknown,
            idle_seconds: None,
            thermal: Thermal::Unknown,
            kill_switch: true,
            supported_os: true,
        };
        let v = view(&stored, Integrity::Ok, probes, 4, 8 * GIB);
        assert_eq!((v.cores_allowed, v.memory_gib_allowed, v.cpus), (3, 4, 4));
        let json = serde_json::to_value(&v).unwrap();
        assert_eq!(json["probes"]["killSwitch"], true);
        assert_eq!(json["probes"]["idleSeconds"], serde_json::Value::Null);
        assert_eq!(json["probes"]["thermal"], "unknown");
        assert_eq!(json["rule"]["capabilityType"], "llm.generate.v1");
    }
}
