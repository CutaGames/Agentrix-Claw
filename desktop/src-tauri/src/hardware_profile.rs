// D-MESH Phase 2.A — Hardware Profile detection.
//
// Detects GPU (nvidia-smi on Win/Linux, system_profiler on macOS), total
// system RAM, CPU logical cores, and available disk space at the Tauri
// app data dir. Returns a `HardwareProfile` the frontend uses to classify
// the machine into one of four tiers: unsupported / light / standard /
// enthusiast.
//
// IMPORTANT: detection is best-effort and NEVER blocks startup. If any
// probe fails we return `None` for that field and let the frontend fall
// back to the "light" tier (safe default).

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareProfile {
    pub gpu_name: Option<String>,
    pub gpu_vram_mb: Option<u64>,
    pub cpu_cores: u32,
    pub ram_total_mb: u64,
    pub disk_free_mb: Option<u64>,
    pub os: &'static str,
    pub recommended_tier: String,
    pub can_run_local_llm: bool,
    pub can_run_pet_gen: bool,
    pub can_run_video_gen: bool,
}

fn detect_cpu_cores() -> u32 {
    std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(2)
}

fn detect_ram_mb() -> u64 {
    // Lightweight: read from /proc/meminfo on Linux, wmic on Windows,
    // sysctl on macOS. Fall back to 8GB if all fail (generic safe default).
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("wmic")
            .args(["computersystem", "get", "TotalPhysicalMemory", "/value"])
            .output()
        {
            if let Ok(s) = String::from_utf8(output.stdout) {
                if let Some(line) = s.lines().find(|l| l.starts_with("TotalPhysicalMemory=")) {
                    if let Some(val) = line.split('=').nth(1) {
                        if let Ok(bytes) = val.trim().parse::<u64>() {
                            return bytes / 1024 / 1024;
                        }
                    }
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/proc/meminfo") {
            if let Some(line) = content.lines().find(|l| l.starts_with("MemTotal:")) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    if let Ok(kb) = parts[1].parse::<u64>() {
                        return kb / 1024;
                    }
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("sysctl").args(["-n", "hw.memsize"]).output() {
            if let Ok(s) = String::from_utf8(output.stdout) {
                if let Ok(bytes) = s.trim().parse::<u64>() {
                    return bytes / 1024 / 1024;
                }
            }
        }
    }
    8 * 1024 // 8 GB safe default
}

fn detect_gpu() -> (Option<String>, Option<u64>) {
    // Try nvidia-smi first — available on Windows + Linux with NVIDIA driver
    if let Ok(output) = Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
    {
        if output.status.success() {
            if let Ok(s) = String::from_utf8(output.stdout) {
                let line = s.lines().next().unwrap_or("").trim();
                let parts: Vec<&str> = line.split(',').map(|p| p.trim()).collect();
                if parts.len() >= 2 {
                    let name = parts[0].to_string();
                    let vram = parts[1].parse::<u64>().ok();
                    return (Some(name), vram);
                }
            }
        }
    }

    // macOS: system_profiler (detects Apple Silicon unified memory as proxy)
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("system_profiler")
            .args(["SPDisplaysDataType"])
            .output()
        {
            if let Ok(s) = String::from_utf8(output.stdout) {
                // Extract "Chipset Model: Apple M2 Pro" etc.
                for line in s.lines() {
                    let trimmed = line.trim();
                    if let Some(rest) = trimmed.strip_prefix("Chipset Model:") {
                        let name = rest.trim().to_string();
                        if !name.is_empty() {
                            return (Some(name), None);
                        }
                    }
                }
            }
        }
    }

    // Windows: wmic path win32_VideoController (fallback)
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("wmic")
            .args(["path", "win32_videocontroller", "get", "Name,AdapterRAM", "/value"])
            .output()
        {
            if let Ok(s) = String::from_utf8(output.stdout) {
                let mut name: Option<String> = None;
                let mut ram: Option<u64> = None;
                for line in s.lines() {
                    let t = line.trim();
                    if let Some(v) = t.strip_prefix("Name=") {
                        if !v.trim().is_empty() {
                            name = Some(v.trim().to_string());
                        }
                    } else if let Some(v) = t.strip_prefix("AdapterRAM=") {
                        if let Ok(bytes) = v.trim().parse::<u64>() {
                            ram = Some(bytes / 1024 / 1024);
                        }
                    }
                }
                return (name, ram);
            }
        }
    }

    (None, None)
}

fn detect_disk_free_mb() -> Option<u64> {
    // Cross-platform disk space detection is non-trivial without a dep.
    // Leave as None for Phase 2.A; add sysinfo crate in Phase 2.B when we
    // actually gate downloads on free space.
    None
}

fn classify_tier(vram_mb: Option<u64>, ram_mb: u64) -> (&'static str, bool, bool, bool) {
    // Returns (tier, can_llm, can_pet_gen, can_video_gen).
    //
    // Thresholds per docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN §D-MESH Phase 2.A.
    // All tiers fall back to "light" if detection failed (vram_mb = None).
    let v = vram_mb.unwrap_or(0);

    if ram_mb < 8 * 1024 && v < 4 * 1024 {
        return ("unsupported", false, false, false);
    }
    if v >= 12 * 1024 {
        return ("enthusiast", true, true, true);
    }
    if v >= 6 * 1024 {
        return ("standard", true, true, false);
    }
    // Light tier: small LLMs + speech OK; no 3D / video.
    ("light", true, false, false)
}

#[tauri::command]
pub fn desktop_bridge_detect_hardware() -> HardwareProfile {
    let cpu_cores = detect_cpu_cores();
    let ram_total_mb = detect_ram_mb();
    let (gpu_name, gpu_vram_mb) = detect_gpu();
    let disk_free_mb = detect_disk_free_mb();
    let (tier, can_llm, can_pet, can_video) = classify_tier(gpu_vram_mb, ram_total_mb);

    HardwareProfile {
        gpu_name,
        gpu_vram_mb,
        cpu_cores,
        ram_total_mb,
        disk_free_mb,
        os: std::env::consts::OS,
        recommended_tier: tier.to_string(),
        can_run_local_llm: can_llm,
        can_run_pet_gen: can_pet,
        can_run_video_gen: can_video,
    }
}
