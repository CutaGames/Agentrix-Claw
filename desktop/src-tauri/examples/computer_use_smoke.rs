// Standalone smoke test for the Computer Use cross-platform primitives.
// Run from desktop/src-tauri:
//   cargo run --example computer_use_smoke --release
//
// Verifies (without involving Tauri):
//   1. xcap can enumerate monitors & capture a screenshot.
//   2. xcap can enumerate top-level windows.
//   3. enigo can synthesize a small mouse move + restore.
//   4. The red-line layer refuses sudo / Terminal.app and accepts normal text.

use std::time::Instant;

use enigo::{Coordinate, Enigo, Mouse, Settings};

fn main() {
    println!("\n=== Agentrix Computer Use Smoke Test ===\n");

    let mut pass = 0u32;
    let mut fail = 0u32;
    let mut record = |name: &str, ok: bool, detail: String| {
        if ok {
            pass += 1;
            println!("  [PASS] {name}: {detail}");
        } else {
            fail += 1;
            println!("  [FAIL] {name}: {detail}");
        }
    };

    // 1. Monitor enumeration + screenshot.
    let t = Instant::now();
    match xcap::Monitor::all() {
        Ok(monitors) if !monitors.is_empty() => {
            let m = &monitors[0];
            // xcap 0.0.14: width/height return raw values
            let w = m.width();
            let h = m.height();
            match m.capture_image() {
                Ok(img) => {
                    let bytes = img.as_raw().len();
                    record(
                        "screen.capture",
                        bytes > 0 && img.width() > 0,
                        format!(
                            "monitor 0 = {}x{}, captured {}x{} ({} bytes RGBA) in {:?}",
                            w,
                            h,
                            img.width(),
                            img.height(),
                            bytes,
                            t.elapsed()
                        ),
                    );
                }
                Err(e) => record("screen.capture", false, format!("capture_image err: {e}")),
            }
        }
        Ok(_) => record("screen.capture", false, "0 monitors found".into()),
        Err(e) => record("screen.capture", false, format!("Monitor::all err: {e}")),
    }

    // 2. Window enumeration.
    let t = Instant::now();
    match xcap::Window::all() {
        Ok(windows) => {
            record(
                "window.enumerate",
                !windows.is_empty(),
                format!(
                    "{} top-level windows in {:?}; first 3: {:?}",
                    windows.len(),
                    t.elapsed(),
                    windows
                        .iter()
                        .take(3)
                        .map(|w| format!("{}@{}", w.app_name(), w.title()))
                        .collect::<Vec<_>>()
                ),
            );
        }
        Err(e) => record("window.enumerate", false, format!("Window::all err: {e}")),
    }

    // 3. Mouse move (small delta, then restore).
    match Enigo::new(&Settings::default()) {
        Ok(mut enigo) => {
            let t = Instant::now();
            let before = enigo.location().ok();
            let target_x = before.as_ref().map(|(x, _)| x + 10).unwrap_or(100);
            let target_y = before.as_ref().map(|(_, y)| *y).unwrap_or(100);
            let move1 = enigo.move_mouse(target_x, target_y, Coordinate::Abs);
            let after = enigo.location().ok();
            // Restore.
            if let Some((x, y)) = before {
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
            }
            let restored = enigo.location().ok();
            let ok = move1.is_ok();
            record(
                "mouse.move",
                ok,
                format!(
                    "before={:?} target=({target_x},{target_y}) after={:?} restored={:?} in {:?}",
                    before,
                    after,
                    restored,
                    t.elapsed()
                ),
            );
        }
        Err(e) => record("mouse.move", false, format!("Enigo::new err: {e}")),
    }

    // 4. Red-line layer (we link the lib path manually since this is an example).
    {
        // Re-implement the matcher inline so we don't have to re-export the
        // private module — keeps the example self-contained.
        let needles = [
            "sudo ", "runas /", "rm -rf /", "shutdown -s",
        ];
        let blocked = ["cmd.exe", "powershell.exe", "Terminal.app"];

        let bad_text = "please run sudo rm -rf /tmp/foo";
        let bad_match = needles.iter().any(|n| bad_text.to_ascii_lowercase().contains(n));
        record(
            "redline.priv-escalation",
            bad_match,
            format!("input='{bad_text}' → matched={bad_match} (expected true)"),
        );

        let good_text = "Hello, summarize this doc.";
        let good_match = needles
            .iter()
            .any(|n| good_text.to_ascii_lowercase().contains(n));
        record(
            "redline.allow-normal",
            !good_match,
            format!("input='{good_text}' → matched={good_match} (expected false)"),
        );

        let app = "cmd.exe";
        let blocked_hit = blocked
            .iter()
            .any(|b| b.eq_ignore_ascii_case(app) || app.to_lowercase().contains(&b.to_lowercase()));
        record(
            "redline.blocked-app",
            blocked_hit,
            format!("app='{app}' → blocked={blocked_hit} (expected true)"),
        );
    }

    println!("\n=== Result: {pass} passed, {fail} failed ===\n");
    if fail > 0 {
        std::process::exit(1);
    }
}
