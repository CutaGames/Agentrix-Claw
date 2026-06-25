#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Force GPU hardware acceleration for WebView2 on Windows.
    // Five flags that together eliminate the snow / checkerboard artifacts
    // on small transparent WebView2 windows (tauri#4881). See also the CSS
    // keep-alive in global.css and the multi-frame sprite animation.
    #[cfg(target_os = "windows")]
    {
        let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        if !existing.contains("--ignore-gpu-blocklist") {
            let gpu_args = [
                "--ignore-gpu-blocklist",
                "--enable-gpu-rasterization",
                "--enable-zero-copy",
                "--disable-gpu-driver-bug-workarounds",
                "--enable-features=UseSkiaRenderer",
            ].join(" ");
            let merged = if existing.is_empty() {
                gpu_args
            } else {
                format!("{existing} {gpu_args}")
            };
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", merged);
        }
    }

    agentrix_desktop_lib::run();
}
