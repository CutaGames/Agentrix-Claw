//! D5 background drafting (REQ-desktop-047) only runs on mains power:
//! "接电源才起草". This module answers one question — is this computer on
//! mains power right now — and answers "unknown" whenever it cannot tell, so
//! the caller treats anything but `Ac` as "do not start".
//!
//! - macOS: `/usr/bin/pmset -g ps` (absolute path, no shell, no arguments from
//!   the WebView). The first line says where power is drawn from:
//!   `Now drawing from 'AC Power'` / `'Battery Power'` / `'UPS Power'`.
//!   A desktop Mac without a battery also reports `'AC Power'`.
//! - Linux: `/sys/class/power_supply/*/{type,online}` — any `Mains` supply
//!   with `online` = 1 is mains; otherwise a `Battery` supply means battery.
//! - Windows: not read yet (`GetSystemPowerStatus` needs a `windows` crate
//!   feature that is not enabled, and dependency changes need approval), so
//!   `Unknown`: background drafting stays off there.
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PowerSource {
    Ac,
    Battery,
    Unknown,
}

/// `pmset -g ps` output → where power comes from. UPS counts as battery
/// (mains is gone); anything unrecognised is unknown.
pub fn parse_pmset(output: &str) -> PowerSource {
    let Some(first) = output.lines().map(str::trim).find(|line| !line.is_empty()) else {
        return PowerSource::Unknown;
    };
    let Some(rest) = first.strip_prefix("Now drawing from '") else {
        return PowerSource::Unknown;
    };
    match rest.split('\'').next() {
        Some("AC Power") => PowerSource::Ac,
        Some("Battery Power") | Some("UPS Power") => PowerSource::Battery,
        _ => PowerSource::Unknown,
    }
}

/// One `/sys/class/power_supply/<name>` entry: its `type` and `online` files.
pub fn classify_linux_supplies(supplies: &[(String, Option<String>)]) -> PowerSource {
    let mut saw_battery = false;
    for (kind, online) in supplies {
        match kind.trim() {
            "Mains" | "USB" if online.as_deref().map(str::trim) == Some("1") => return PowerSource::Ac,
            "Battery" => saw_battery = true,
            _ => {}
        }
    }
    if saw_battery {
        PowerSource::Battery
    } else {
        PowerSource::Unknown
    }
}

#[cfg(target_os = "macos")]
pub fn current() -> PowerSource {
    match std::process::Command::new("/usr/bin/pmset").args(["-g", "ps"]).output() {
        Ok(output) if output.status.success() => parse_pmset(&String::from_utf8_lossy(&output.stdout)),
        _ => PowerSource::Unknown,
    }
}

#[cfg(target_os = "linux")]
pub fn current() -> PowerSource {
    let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") else {
        return PowerSource::Unknown;
    };
    let supplies: Vec<(String, Option<String>)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let kind = std::fs::read_to_string(entry.path().join("type")).ok()?;
            let online = std::fs::read_to_string(entry.path().join("online")).ok();
            Some((kind, online))
        })
        .collect();
    classify_linux_supplies(&supplies)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn current() -> PowerSource {
    PowerSource::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pmset_output_is_read_from_the_first_line_only() {
        let ac = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234)\t100%; charged; 0:00 remaining present: true\n";
        assert_eq!(parse_pmset(ac), PowerSource::Ac);
        let battery = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t73%; discharging; 5:10 remaining present: true\n";
        assert_eq!(parse_pmset(battery), PowerSource::Battery);
        assert_eq!(parse_pmset("Now drawing from 'UPS Power'\n"), PowerSource::Battery);
        // A Mac mini: no battery lines, still AC.
        assert_eq!(parse_pmset("Now drawing from 'AC Power'\n"), PowerSource::Ac);
        assert_eq!(parse_pmset("\n\nNow drawing from 'AC Power'\n"), PowerSource::Ac);
    }

    #[test]
    fn anything_unrecognised_is_unknown_never_ac() {
        for output in [
            "",
            "garbage",
            "Now drawing from AC Power",
            "Now drawing from 'Solar Power'",
            "Now drawing from 'ac power'",
            // AC mentioned, but not on the first line.
            "Now drawing from 'Battery Power'\nNow drawing from 'AC Power'",
            " -InternalBattery-0 AC attached\nNow drawing from 'AC Power'",
        ] {
            assert_ne!(parse_pmset(output), PowerSource::Ac, "{output:?}");
        }
        assert_eq!(parse_pmset(" -InternalBattery-0 AC attached\nNow drawing from 'AC Power'"), PowerSource::Unknown);
    }

    #[test]
    fn linux_supplies() {
        let s = |kind: &str, online: Option<&str>| (kind.to_string(), online.map(str::to_string));
        assert_eq!(classify_linux_supplies(&[s("Mains\n", Some("1\n")), s("Battery", None)]), PowerSource::Ac);
        assert_eq!(classify_linux_supplies(&[s("Mains", Some("0")), s("Battery", None)]), PowerSource::Battery);
        assert_eq!(classify_linux_supplies(&[s("Battery", None)]), PowerSource::Battery);
        assert_eq!(classify_linux_supplies(&[s("Mains", None)]), PowerSource::Unknown);
        assert_eq!(classify_linux_supplies(&[]), PowerSource::Unknown);
    }

    #[test]
    fn serialises_as_snake_case() {
        assert_eq!(serde_json::to_string(&PowerSource::Ac).unwrap(), "\"ac\"");
        assert_eq!(serde_json::to_string(&PowerSource::Battery).unwrap(), "\"battery\"");
        assert_eq!(serde_json::to_string(&PowerSource::Unknown).unwrap(), "\"unknown\"");
    }
}
