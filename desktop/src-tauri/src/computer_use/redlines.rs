//! Codex-borrow Phase B4/B5 — hardcoded red-lines for Computer Use.
//!
//! These are the **non-negotiable** safety checks. Even if a user clicks
//! "Approve" in the UI, any action targeting a red-line entity must still
//! be refused at the Rust boundary. This is the moat behind which all
//! softer policy (whitelist, per-action approval, scope-of-work) lives.

use super::ComputerUseError;

/// Process / app names that must NEVER be controlled by Computer Use.
///
/// Mirrors `shared/types/computer-use.ts::COMPUTER_USE_BLOCKED_PROCESSES`.
pub const BLOCKED_PROCESSES: &[&str] = &[
    // Terminals — clicking inside a shell is a privilege-escalation vector.
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "WindowsTerminal.exe",
    "wt.exe",
    "Terminal.app",
    "iTerm.app",
    "iTerm2.app",
    "Alacritty",
    // Self — never let the agent drive its own desktop window.
    "agentrix-desktop",
    "agentrix-desktop.exe",
    "Agentrix.app",
];

/// Substrings inside typed/keyed text that look like privilege escalation.
/// Matched case-insensitively.
const PRIV_ESCALATION_NEEDLES: &[&str] = &[
    "sudo ",
    "sudo\t",
    "runas /",
    "runas.exe",
    " su -",
    "rm -rf /",
    "rm -rf ~",
    "format c:",
    "format /q",
    "del /f /s /q",
    "diskpart",
    "shutdown -s",
    "shutdown /s",
    "reg delete",
    "registry::",
    "powershell -enc",
    "powershell -e ",
    "iex (",
];

pub fn enforce_no_priv_escalation(text: &str) -> Result<(), ComputerUseError> {
    let lower = text.to_ascii_lowercase();
    for needle in PRIV_ESCALATION_NEEDLES {
        if lower.contains(needle) {
            return Err(ComputerUseError::Redline(format!(
                "input contains privilege-escalation pattern '{}'; refused",
                needle.trim()
            )));
        }
    }
    Ok(())
}

pub fn enforce_window_allowed(app_name: &str) -> Result<(), ComputerUseError> {
    let lower = app_name.to_ascii_lowercase();
    for blocked in BLOCKED_PROCESSES {
        if lower == blocked.to_ascii_lowercase() || lower.contains(&blocked.to_ascii_lowercase()) {
            return Err(ComputerUseError::Redline(format!(
                "target '{}' is on the hardcoded blocklist; refused",
                app_name
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priv_escalation_blocks_sudo() {
        assert!(enforce_no_priv_escalation("hello sudo apt update").is_err());
        assert!(enforce_no_priv_escalation("hi runas /user:admin").is_err());
        assert!(enforce_no_priv_escalation("rm -rf / now").is_err());
    }

    #[test]
    fn priv_escalation_allows_normal_text() {
        assert!(enforce_no_priv_escalation("Hello, please summarise the doc.").is_ok());
        assert!(enforce_no_priv_escalation("买一杯咖啡").is_ok());
    }

    #[test]
    fn window_blocklist_blocks_terminals() {
        assert!(enforce_window_allowed("cmd.exe").is_err());
        assert!(enforce_window_allowed("PowerShell.exe").is_err());
        assert!(enforce_window_allowed("Terminal.app").is_err());
        assert!(enforce_window_allowed("agentrix-desktop.exe").is_err());
    }

    #[test]
    fn window_blocklist_allows_normal_apps() {
        assert!(enforce_window_allowed("chrome.exe").is_ok());
        assert!(enforce_window_allowed("Notepad").is_ok());
        assert!(enforce_window_allowed("Code.exe").is_ok());
    }
}
