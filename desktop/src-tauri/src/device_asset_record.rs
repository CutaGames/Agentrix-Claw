// L9 S17 (L2): this computer reads its own serial number, battery cycle count and capacity, and signs them with its
// device key for one "My things" item (`shared/types/device-assets.ts`, `deviceAssetRecordMessageV1`).
//
// - Read only. The commands are fixed: macOS `system_profiler SPHardwareDataType SPPowerDataType -json`; Windows
//   `powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_BIOS | Select-Object SerialNumber | ConvertTo-Json"`
//   and `powercfg /batteryreport /xml /output <a temp file this module names, deleted after reading>`. They run without a
//   shell (`std::process::Command`), from their system paths, with no outside input on any command line; each gets 10 s
//   and at most 256 KB of output is read. Only six facts are taken (the contract's fields); everything else is dropped.
// - The item reference from the WebView is checked and goes only into the signed message. The fields and their digest
//   are computed here from what the system said, so the WebView cannot have anything else signed.
// - The private key never leaves `DeviceIdentity`. It is "read and signed by this computer", not an inspection.
// Each platform uses its own reader (the tests use them all), so outside tests the others are unused there.
#![cfg_attr(not(test), allow(dead_code))]

use crate::developer_runtime::home_node_identity::{DeviceIdentity, OsKeyringStore};
use serde::Serialize;
use serde_json::Value;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub const READ_TIMEOUT: Duration = Duration::from_secs(10);
pub const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const CYCLE_COUNT_MAX: u64 = 100_000;
const CAPACITY_MAX: u64 = 1_000_000;
const PERCENT_MAX: u64 = 200;
/// What some firmware puts where a serial number should be: no serial.
const PLACEHOLDER_SERIALS: [&str; 8] = [
    "to be filled by o.e.m.",
    "default string",
    "system serial number",
    "not applicable",
    "none",
    "n/a",
    "0",
    "123456789",
];

/// The contract's six fields (`DeviceAssetRecordFieldsV1`); `None` is "the system did not report it".
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordFields {
    pub serial_number: Option<String>,
    pub battery_cycle_count: Option<u64>,
    pub battery_design_capacity: Option<u64>,
    pub battery_full_charge_capacity: Option<u64>,
    pub battery_capacity_unit: Option<&'static str>,
    pub battery_maximum_capacity_percent: Option<u64>,
}

impl RecordFields {
    /// The contract's rule: a unit exactly when one of the two capacities is there.
    fn with_unit(mut self, unit: &'static str) -> Self {
        let any = self.battery_design_capacity.is_some() || self.battery_full_charge_capacity.is_some();
        self.battery_capacity_unit = if any { Some(unit) } else { None };
        self
    }
}

/// What the command hands the WebView: the reading and its signature.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedRecord {
    pub device_id: String,
    pub asset_ref: String,
    pub read_at: String,
    pub fields: RecordFields,
    pub digest: String,
    pub signature: String,
}

/// The ledger's serial number pattern (`^[A-Za-z0-9 ._/-]{1,64}$`), trimmed; a firmware placeholder is no serial.
fn clean_serial(raw: &str) -> Option<String> {
    let text = raw.trim();
    if text.is_empty() || text.len() > 64 {
        return None;
    }
    if !text.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b' ' | b'.' | b'_' | b'/' | b'-')) {
        return None;
    }
    if PLACEHOLDER_SERIALS.contains(&text.to_ascii_lowercase().as_str()) {
        return None;
    }
    Some(text.to_string())
}

fn bounded(value: Option<u64>, min: u64, max: u64) -> Option<u64> {
    value.filter(|v| *v >= min && *v <= max)
}

/// "88%" → 88.
fn parse_percent(text: &str) -> Option<u64> {
    let digits = text.trim().strip_suffix('%')?.trim();
    if digits.is_empty() || digits.len() > 3 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

/// `system_profiler SPHardwareDataType SPPowerDataType -json`: the serial number from the hardware entry; from the battery
/// entry the cycle count, the full charge capacity (Intel Macs, `sppower_battery_max_capacity`, mAh) and the maximum
/// capacity (Apple silicon, `sppower_battery_health_maximum_capacity`, "88%"). macOS reports no design capacity.
pub fn parse_macos(json: &[u8]) -> RecordFields {
    let Ok(root) = serde_json::from_slice::<Value>(json) else {
        return RecordFields::default();
    };
    let serial = root
        .get("SPHardwareDataType")
        .and_then(Value::as_array)
        .and_then(|items| items.iter().find_map(|item| item.get("serial_number").and_then(Value::as_str)))
        .and_then(clean_serial);
    let battery = root.get("SPPowerDataType").and_then(Value::as_array).and_then(|items| {
        items
            .iter()
            .find(|item| item.get("sppower_battery_health_info").is_some() || item.get("sppower_battery_charge_info").is_some())
    });
    let health = battery.and_then(|item| item.get("sppower_battery_health_info"));
    let charge = battery.and_then(|item| item.get("sppower_battery_charge_info"));
    let cycles = health.and_then(|info| info.get("sppower_battery_cycle_count")).and_then(Value::as_u64);
    let full = charge.and_then(|info| info.get("sppower_battery_max_capacity")).and_then(Value::as_u64);
    let percent = health
        .and_then(|info| info.get("sppower_battery_health_maximum_capacity"))
        .and_then(Value::as_str)
        .and_then(parse_percent);
    RecordFields {
        serial_number: serial,
        battery_cycle_count: bounded(cycles, 0, CYCLE_COUNT_MAX),
        battery_design_capacity: None,
        battery_full_charge_capacity: bounded(full, 1, CAPACITY_MAX),
        battery_capacity_unit: None,
        battery_maximum_capacity_percent: bounded(percent, 1, PERCENT_MAX),
    }
    .with_unit("mAh")
}

/// `ConvertTo-Json` of `Win32_BIOS | Select-Object SerialNumber`: `{"SerialNumber":"…"}`, or a list of them.
pub fn parse_windows_bios(json: &[u8]) -> Option<String> {
    let text = decode_text(json);
    let value: Value = serde_json::from_str(text.trim()).ok()?;
    let first = match &value {
        Value::Array(items) => items.first()?,
        other => other,
    };
    first.get("SerialNumber").and_then(Value::as_str).and_then(clean_serial)
}

/// A whole number between `<tag>` and `</tag>` in `block`.
fn tag_number(block: &str, tag: &str) -> Option<u64> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = block.find(&open)? + open.len();
    let end = block[start..].find(&close)? + start;
    let text = block[start..end].trim();
    if text.is_empty() || text.len() > 9 || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

/// `powercfg /batteryreport /xml`: the first battery's `DesignCapacity`, `FullChargeCapacity` (mWh) and `CycleCount`.
/// Many Windows machines report a cycle count of 0 when the firmware does not count; 0 is taken as "not reported".
pub fn parse_windows_battery(xml: &str) -> (Option<u64>, Option<u64>, Option<u64>) {
    let Some(start) = xml.find("<Battery>") else {
        return (None, None, None);
    };
    let rest = &xml[start..];
    let block = match rest.find("</Battery>") {
        Some(end) => &rest[..end],
        None => rest,
    };
    let cycles = tag_number(block, "CycleCount").filter(|count| *count > 0);
    (tag_number(block, "DesignCapacity"), tag_number(block, "FullChargeCapacity"), cycles)
}

pub fn windows_fields(bios_json: Option<&[u8]>, battery_xml: Option<&str>) -> RecordFields {
    let serial = bios_json.and_then(parse_windows_bios);
    let (design, full, cycles) = battery_xml.map(parse_windows_battery).unwrap_or((None, None, None));
    RecordFields {
        serial_number: serial,
        battery_cycle_count: bounded(cycles, 0, CYCLE_COUNT_MAX),
        battery_design_capacity: bounded(design, 1, CAPACITY_MAX),
        battery_full_charge_capacity: bounded(full, 1, CAPACITY_MAX),
        battery_capacity_unit: None,
        battery_maximum_capacity_percent: None,
    }
    .with_unit("mWh")
}

/// UTF-16 LE with a byte order mark (what Windows tools often write), UTF-8 with or without one.
fn decode_text(bytes: &[u8]) -> String {
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let units: Vec<u16> = bytes[2..].chunks_exact(2).map(|pair| u16::from_le_bytes([pair[0], pair[1]])).collect();
        return String::from_utf16_lossy(&units);
    }
    let body = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { &bytes[3..] } else { bytes };
    String::from_utf8_lossy(body).into_owned()
}

/// Runs one fixed command without a shell: no stdin, stderr dropped, at most `MAX_OUTPUT_BYTES` of stdout, killed after
/// `READ_TIMEOUT`. `None` for anything but a clean exit within both limits.
fn run_capped(program: &str, args: &[&str]) -> Option<Vec<u8>> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let stdout = child.stdout.take()?;
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout.take(MAX_OUTPUT_BYTES as u64 + 1).read_to_end(&mut buffer);
        let _ = sender.send(buffer);
    });
    let deadline = Instant::now() + READ_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    }?;
    let wait = deadline.saturating_duration_since(Instant::now()) + Duration::from_millis(500);
    let output = receiver.recv_timeout(wait).ok()?;
    if status.success() && output.len() <= MAX_OUTPUT_BYTES {
        Some(output)
    } else {
        None
    }
}

#[cfg(target_os = "macos")]
fn read_fields() -> RecordFields {
    run_capped("/usr/sbin/system_profiler", &["SPHardwareDataType", "SPPowerDataType", "-json"])
        .map(|output| parse_macos(&output))
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn read_fields() -> RecordFields {
    let root = std::env::var("SystemRoot")
        .ok()
        .filter(|value| !value.is_empty() && !value.contains('"'))
        .unwrap_or_else(|| "C:\\Windows".to_string());
    let powershell = format!("{root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    let powercfg = format!("{root}\\System32\\powercfg.exe");
    let bios = run_capped(
        &powershell,
        &["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_BIOS | Select-Object SerialNumber | ConvertTo-Json"],
    );
    let battery = temp_report_path().and_then(|path| {
        let text = path.to_str().map(str::to_string).and_then(|target| {
            run_capped(&powercfg, &["/batteryreport", "/xml", "/output", target.as_str()])?;
            read_head(&path)
        });
        let _ = std::fs::remove_file(&path);
        text
    });
    windows_fields(bios.as_deref(), battery.as_deref())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn read_fields() -> RecordFields {
    RecordFields::default()
}

/// A temp file name this module makes up (16 random bytes): nothing from outside goes on powercfg's command line.
#[cfg(target_os = "windows")]
fn temp_report_path() -> Option<std::path::PathBuf> {
    use ring::rand::SecureRandom;
    let mut bytes = [0u8; 16];
    ring::rand::SystemRandom::new().fill(&mut bytes).ok()?;
    let name: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    Some(std::env::temp_dir().join(format!("agentrix-battery-{name}.xml")))
}

/// The first `MAX_OUTPUT_BYTES` of a file (the battery section is at the top of the report; the usage history after it
/// can be long and is not needed).
fn read_head(path: &std::path::Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut bytes = Vec::new();
    file.take(MAX_OUTPUT_BYTES as u64).read_to_end(&mut bytes).ok()?;
    Some(decode_text(&bytes))
}

fn is_asset_ref(value: &str) -> bool {
    value.len() == 36 && value.starts_with("das_") && value[4..].bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn now_seconds() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Signs one reading with this computer's device key.
pub fn sign_reading(identity: &DeviceIdentity, asset_ref: &str, fields: RecordFields, read_at: &str) -> Result<SignedRecord, String> {
    if !is_asset_ref(asset_ref) {
        return Err("asset_ref_invalid".to_string());
    }
    let value = serde_json::to_value(&fields).map_err(|_| "read_failed".to_string())?;
    let signed = identity
        .sign_device_asset_record(asset_ref, &value, read_at)
        .map_err(|_| "sign_failed".to_string())?;
    Ok(SignedRecord {
        device_id: identity.device_id().to_string(),
        asset_ref: asset_ref.to_string(),
        read_at: read_at.to_string(),
        fields,
        digest: signed.digest,
        signature: signed.signature,
    })
}

/// L9 S17: read this computer and sign the reading for one item. Only the item reference comes from the WebView.
#[tauri::command]
pub async fn device_asset_record_read(asset_ref: String) -> Result<SignedRecord, String> {
    if !is_asset_ref(&asset_ref) {
        return Err("asset_ref_invalid".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let identity = DeviceIdentity::load(&OsKeyringStore)
            .map_err(|_| "not_enrolled".to_string())?
            .ok_or_else(|| "not_enrolled".to_string())?;
        let fields = read_fields();
        sign_reading(&identity, &asset_ref, fields, &now_seconds())
    })
    .await
    .map_err(|_| "read_failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::home_node_identity::{RuntimeResult, SecureStore};
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine as _;
    use std::collections::HashMap;
    use std::sync::Mutex;

    /// The same vector as `shared/types/device-assets.ts` (`device-asset-records.spec.ts`, `deviceAssetRecord.test.ts`).
    const VECTOR_DIGEST: &str = "sha256:7270154289f496da5537fd3761e2f42dbbcef66787ffc1b768245593a0ff68d6";
    const ITEM: &str = "das_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    #[derive(Default)]
    struct MemoryStore(Mutex<HashMap<(String, String), Vec<u8>>>);

    impl SecureStore for MemoryStore {
        fn get(&self, service: &str, key: &str) -> RuntimeResult<Option<Vec<u8>>> {
            Ok(self.0.lock().unwrap().get(&(service.to_string(), key.to_string())).cloned())
        }
        fn set(&self, service: &str, key: &str, value: &[u8]) -> RuntimeResult<()> {
            self.0.lock().unwrap().insert((service.to_string(), key.to_string()), value.to_vec());
            Ok(())
        }
        fn delete(&self, service: &str, key: &str) -> RuntimeResult<()> {
            self.0.lock().unwrap().remove(&(service.to_string(), key.to_string()));
            Ok(())
        }
        fn get_text(&self, service: &str, key: &str) -> RuntimeResult<Option<String>> {
            Ok(self.get(service, key)?.map(|bytes| String::from_utf8_lossy(&bytes).into_owned()))
        }
        fn set_text(&self, service: &str, key: &str, value: &str) -> RuntimeResult<()> {
            self.set(service, key, value.as_bytes())
        }
    }

    fn vector_fields() -> RecordFields {
        RecordFields {
            serial_number: Some("C02XYZ123ABC".to_string()),
            battery_cycle_count: Some(245),
            battery_design_capacity: None,
            battery_full_charge_capacity: Some(5103),
            battery_capacity_unit: Some("mAh"),
            battery_maximum_capacity_percent: None,
        }
    }

    fn verifies(identity: &DeviceIdentity, message: &str, signature: &str) -> bool {
        let jwk = identity.public_jwk();
        let mut point = vec![4u8];
        point.extend(URL_SAFE_NO_PAD.decode(&jwk.x).unwrap());
        point.extend(URL_SAFE_NO_PAD.decode(&jwk.y).unwrap());
        let key = ring::signature::UnparsedPublicKey::new(&ring::signature::ECDSA_P256_SHA256_FIXED, point);
        let Ok(bytes) = URL_SAFE_NO_PAD.decode(signature) else {
            return false;
        };
        key.verify(message.as_bytes(), &bytes).is_ok()
    }

    #[test]
    fn an_intel_mac_report_gives_the_serial_cycles_and_full_charge_capacity_in_mah() {
        let json = br#"{
          "SPHardwareDataType": [{ "_name": "hardware_overview", "machine_model": "MacBookPro16,2", "serial_number": "C02XYZ123ABC", "platform_UUID": "ignored" }],
          "SPPowerDataType": [
            { "_name": "spbattery_information",
              "sppower_battery_charge_info": { "sppower_battery_fully_charged": "TRUE", "sppower_battery_max_capacity": 5103, "sppower_battery_state_of_charge": 100 },
              "sppower_battery_health_info": { "sppower_battery_cycle_count": 245, "sppower_battery_health": "Good" },
              "sppower_battery_model_info": { "sppower_battery_serial_number": "BATTERY-SERIAL-IGNORED" } },
            { "_name": "sppower_information", "AC Power": { "Current Power Source": "TRUE" } }
          ]
        }"#;
        assert_eq!(parse_macos(json), vector_fields());
    }

    #[test]
    fn an_apple_silicon_report_gives_the_maximum_capacity_percentage_and_no_unit() {
        let json = br#"{
          "SPHardwareDataType": [{ "serial_number": "FVFXY12345" }],
          "SPPowerDataType": [{ "sppower_battery_health_info": { "sppower_battery_cycle_count": 112, "sppower_battery_health": "Good", "sppower_battery_health_maximum_capacity": "88%" } }]
        }"#;
        let fields = parse_macos(json);
        assert_eq!(fields.serial_number.as_deref(), Some("FVFXY12345"));
        assert_eq!(fields.battery_cycle_count, Some(112));
        assert_eq!(fields.battery_maximum_capacity_percent, Some(88));
        assert_eq!((fields.battery_design_capacity, fields.battery_full_charge_capacity, fields.battery_capacity_unit), (None, None, None));
    }

    #[test]
    fn a_desktop_mac_without_battery_or_a_broken_report_gives_nothing_it_did_not_see() {
        let json = br#"{ "SPHardwareDataType": [{ "serial_number": "C07ABCDEF123" }], "SPPowerDataType": [{ "_name": "sppower_information" }] }"#;
        let fields = parse_macos(json);
        assert_eq!(fields.serial_number.as_deref(), Some("C07ABCDEF123"));
        assert_eq!(fields.battery_cycle_count, None);
        assert_eq!(fields.battery_capacity_unit, None);
        assert_eq!(parse_macos(b"not json"), RecordFields::default());
        // Out of range, wrong type, or a serial that is not the ledger's pattern: dropped, not guessed.
        let odd = br#"{ "SPHardwareDataType": [{ "serial_number": "<script>" }], "SPPowerDataType": [{ "sppower_battery_health_info": { "sppower_battery_cycle_count": "245", "sppower_battery_health_maximum_capacity": "880%" }, "sppower_battery_charge_info": { "sppower_battery_max_capacity": 0 } }] }"#;
        assert_eq!(parse_macos(odd), RecordFields::default());
    }

    #[test]
    fn windows_bios_and_battery_report_give_the_serial_and_both_capacities_in_mwh() {
        assert_eq!(parse_windows_bios(br#"{"SerialNumber":"  5CD1234XYZ  "}"#).as_deref(), Some("5CD1234XYZ"));
        assert_eq!(parse_windows_bios(br#"[{"SerialNumber":"PF2ABCDE"},{"SerialNumber":"other"}]"#).as_deref(), Some("PF2ABCDE"));
        assert_eq!(parse_windows_bios(br#"{"SerialNumber":"To be filled by O.E.M."}"#), None);
        assert_eq!(parse_windows_bios(br#"{"SerialNumber":"Default string"}"#), None);
        assert_eq!(parse_windows_bios(b"garbage"), None);
        let xml = r#"<?xml version="1.0" encoding="utf-8"?><BatteryReport xmlns="http://schemas.microsoft.com/battery/2012"><Batteries><Battery><Id>DELL 1VX1H</Id><DesignCapacity>56000</DesignCapacity><FullChargeCapacity> 48210 </FullChargeCapacity><CycleCount>312</CycleCount></Battery><Battery><DesignCapacity>1</DesignCapacity></Battery></Batteries><RecentUsage/></BatteryReport>"#;
        let fields = windows_fields(Some(&br#"{"SerialNumber":"5CD1234XYZ"}"#[..]), Some(xml));
        assert_eq!(
            fields,
            RecordFields {
                serial_number: Some("5CD1234XYZ".to_string()),
                battery_cycle_count: Some(312),
                battery_design_capacity: Some(56000),
                battery_full_charge_capacity: Some(48210),
                battery_capacity_unit: Some("mWh"),
                battery_maximum_capacity_percent: None,
            }
        );
        // A desktop PC: no battery section; a firmware that does not count cycles says 0.
        assert_eq!(windows_fields(None, Some("<BatteryReport><Batteries></Batteries></BatteryReport>")), RecordFields::default());
        assert_eq!(parse_windows_battery("<Battery><CycleCount>0</CycleCount></Battery>"), (None, None, None));
    }

    #[test]
    fn utf16_and_bom_text_is_read() {
        let mut bytes = vec![0xFF, 0xFE];
        for unit in r#"{"SerialNumber":"ABC123"}"#.encode_utf16() {
            bytes.extend(unit.to_le_bytes());
        }
        assert_eq!(parse_windows_bios(&bytes).as_deref(), Some("ABC123"));
        let mut utf8 = vec![0xEF, 0xBB, 0xBF];
        utf8.extend(br#"{"SerialNumber":"ABC124"}"#);
        assert_eq!(parse_windows_bios(&utf8).as_deref(), Some("ABC124"));
    }

    #[test]
    fn the_reading_is_signed_over_the_five_line_message_with_the_shared_vector_digest() {
        let identity = DeviceIdentity::load_or_create(&MemoryStore::default()).unwrap();
        let at = "2026-10-31T05:10:00Z";
        let signed = sign_reading(&identity, ITEM, vector_fields(), at).unwrap();
        assert_eq!(signed.digest, VECTOR_DIGEST);
        assert_eq!(signed.device_id, identity.device_id());
        let message = format!("agentrix.device.asset.record.v1\n{}\n{}\n{}\n{}", identity.device_id(), ITEM, VECTOR_DIGEST, at);
        assert!(verifies(&identity, &message, &signed.signature));
        assert!(!verifies(&identity, &message.replace(ITEM, "das_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), &signed.signature), "the item is part of what is signed");
        // What the WebView receives: the contract's keys, camelCase, nulls included.
        let value = serde_json::to_value(&signed).unwrap();
        let mut keys: Vec<&str> = value.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(keys, vec!["assetRef", "deviceId", "digest", "fields", "readAt", "signature"]);
        assert_eq!(value["fields"]["batteryDesignCapacity"], Value::Null);
        assert_eq!(value["fields"].as_object().unwrap().len(), 6);
    }

    #[test]
    fn nothing_but_a_well_formed_item_time_and_six_fields_is_signed() {
        let identity = DeviceIdentity::load_or_create(&MemoryStore::default()).unwrap();
        let at = "2026-10-31T05:10:00Z";
        assert!(sign_reading(&identity, "das_0123", RecordFields::default(), at).is_err());
        assert!(sign_reading(&identity, &format!("{}\nextra", ITEM), RecordFields::default(), at).is_err());
        assert!(sign_reading(&identity, ITEM, RecordFields::default(), "2026-10-31T05:10:00.000Z").is_err());
        assert!(sign_reading(&identity, ITEM, RecordFields::default(), "yesterday").is_err());
        assert!(identity.sign_device_asset_record(ITEM, &serde_json::json!({ "serialNumber": "x" }), at).is_err());
        assert!(identity.sign_device_asset_record(ITEM, &serde_json::json!("text"), at).is_err());
        let mut seven = serde_json::to_value(RecordFields::default()).unwrap();
        seven["raw"] = Value::String("everything".to_string());
        assert!(identity.sign_device_asset_record(ITEM, &seven, at).is_err());
        assert!(sign_reading(&identity, ITEM, RecordFields::default(), at).is_ok());
    }

    #[test]
    fn the_commands_are_fixed_and_bounded() {
        assert_eq!(READ_TIMEOUT, Duration::from_secs(10));
        assert_eq!(MAX_OUTPUT_BYTES, 256 * 1024);
        let source = include_str!("device_asset_record.rs");
        assert!(!source.contains(concat!("Command::new(", "\"sh\"")) && !source.contains(concat!("Command::new(", "\"cmd\"")));
        assert!(source.contains(concat!("\"/usr/sbin/", "system_profiler\"")));
    }
}
