use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use crate::BallPosition;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use std::sync::mpsc;
use std::sync::Mutex;
use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::time::{Duration, Instant};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCommandResult {
    pub command: String,
    pub working_directory: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopReadFileResult {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub total_lines: usize,
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopListDirectoryResult {
    pub path: String,
    pub entries: Vec<FileEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWriteFileResult {
    pub path: String,
    pub bytes_written: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWindowInfo {
    pub title: String,
    pub process_name: Option<String>,
    pub process_id: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopContextResult {
    pub platform: String,
    pub active_window: Option<DesktopWindowInfo>,
    pub clipboard_text_preview: Option<String>,
    pub workspace_hint: Option<String>,
    pub file_hint: Option<String>,
}

static BALL_POS: Mutex<Option<BallPosition>> = Mutex::new(None);
static WORKSPACE_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);
static SUSPEND_CANCEL: Mutex<Option<std::sync::Arc<std::sync::atomic::AtomicBool>>> = Mutex::new(None);

fn workspace_state_file() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .map(|base| base.join("Agentrix Desktop").join("workspace.txt"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(config_home) = std::env::var_os("XDG_CONFIG_HOME") {
            return Some(PathBuf::from(config_home).join("agentrix-desktop").join("workspace.txt"));
        }

        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|home| home.join(".config").join("agentrix-desktop").join("workspace.txt"))
    }
}

fn persist_workspace_dir(path: &Path) -> Result<(), String> {
    let Some(state_file) = workspace_state_file() else {
        return Ok(());
    };

    if let Some(parent) = state_file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(state_file, path.display().to_string()).map_err(|e| e.to_string())
}

fn load_workspace_dir() -> Result<Option<PathBuf>, String> {
    {
        let ws = WORKSPACE_DIR.lock().map_err(|e| e.to_string())?;
        if let Some(path) = ws.as_ref() {
            return Ok(Some(path.clone()));
        }
    }

    let Some(state_file) = workspace_state_file() else {
        return Ok(None);
    };

    if !state_file.is_file() {
        return Ok(None);
    }

    let saved = std::fs::read_to_string(&state_file).map_err(|e| e.to_string())?;
    let trimmed = saved.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let candidate = PathBuf::from(trimmed);
    if !candidate.is_dir() {
        return Ok(None);
    }

    let canonical = candidate.canonicalize().map_err(|e| e.to_string())?;
    let mut ws = WORKSPACE_DIR.lock().map_err(|e| e.to_string())?;
    *ws = Some(canonical.clone());
    Ok(Some(canonical))
}

fn require_workspace_dir() -> Result<PathBuf, String> {
    load_workspace_dir()?.ok_or("No workspace directory set".into())
}

fn resolve_user_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is required".into());
    }

    let candidate = PathBuf::from(trimmed);
    if candidate.is_absolute() {
        return Ok(candidate);
    }

    if let Some(workspace) = load_workspace_dir()? {
        return validate_path(&workspace, trimmed);
    }

    std::env::current_dir()
        .map(|cwd| cwd.join(trimmed))
        .map_err(|e| e.to_string())
}

fn store_workspace_dir(path: PathBuf) -> Result<String, String> {
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", path.display()));
    }

    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    persist_workspace_dir(&canonical)?;

    let display = canonical.display().to_string();
    let mut ws = WORKSPACE_DIR.lock().map_err(|e| e.to_string())?;
    *ws = Some(canonical);
    Ok(display)
}

fn apply_chat_panel_mode(win: &tauri::WebviewWindow, pro_mode: bool) -> Result<(), String> {
    let (width, height, min_width, min_height) = if pro_mode {
        (1100.0, 820.0, 720.0, 560.0)
    } else {
        (480.0, 640.0, 360.0, 480.0)
    };

    win
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|e| e.to_string())?;
    win
        .set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
            width: min_width,
            height: min_height,
        })))
        .map_err(|e| e.to_string())?;
    let _ = win.set_always_on_top(!pro_mode);

    Ok(())
}

pub fn open_chat_panel(app: AppHandle, pro_mode: Option<bool>) -> Result<(), String> {
    let pro_mode = pro_mode.unwrap_or(false);

    // Cancel any pending suspend timer
    if let Ok(mut guard) = SUSPEND_CANCEL.lock() {
        if let Some(flag) = guard.take() {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }

    if let Some(win) = app.get_webview_window("chat-panel") {
        win.show().map_err(|e| e.to_string())?;
        apply_chat_panel_mode(&win, pro_mode)?;
        win.set_focus().map_err(|e| e.to_string())?;
        // Resume frontend state if it was suspended
        let _ = win.eval("window.__agentrix_resume?.()");
        return Ok(());
    }

    // Fire-and-forget: spawn window creation on a separate thread to avoid
    // deadlocking the main thread (WebviewWindowBuilder::build() needs the
    // event loop, which may be blocked by the IPC call).
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let (width, height, min_width, min_height) = if pro_mode {
            (1100.0, 820.0, 720.0, 560.0)
        } else {
            (480.0, 640.0, 360.0, 480.0)
        };

        if let Ok(win) = WebviewWindowBuilder::new(&app_clone, "chat-panel", WebviewUrl::App("index.html".into()))
            .title("Agentrix")
            .inner_size(width, height)
            .min_inner_size(min_width, min_height)
            .decorations(false)
            .always_on_top(!pro_mode)
            .resizable(true)
            .visible(true)
            .drag_and_drop(false)
            .build()
        {
            let _ = apply_chat_panel_mode(&win, pro_mode);
            let _ = win.set_focus();
            // Grant WebView2 permissions (microphone, etc.) to the new chat-panel
            #[cfg(target_os = "windows")]
            crate::grant_webview2_permissions(&win);
        }
    });

    Ok(())
}

pub fn close_chat_panel(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("chat-panel") {
        win.hide().map_err(|e| e.to_string())?;

        // Start 5-minute suspend timer to reclaim WebView memory
        let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        if let Ok(mut guard) = SUSPEND_CANCEL.lock() {
            // Cancel previous timer if any
            if let Some(old) = guard.take() {
                old.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            *guard = Some(cancel.clone());
        }
        let app_clone = app.clone();
        let flag = cancel;
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(300)); // 5 minutes
            if flag.load(std::sync::atomic::Ordering::Relaxed) {
                return; // Cancelled — panel was re-opened
            }
            if let Some(win) = app_clone.get_webview_window("chat-panel") {
                let _ = win.eval("window.__agentrix_suspend?.()");
            }
        });
    }
    Ok(())
}

pub fn set_ball_position(x: f64, y: f64) -> Result<(), String> {
    let mut pos = BALL_POS.lock().map_err(|e| e.to_string())?;
    *pos = Some(BallPosition { x, y });
    Ok(())
}

pub fn get_ball_position() -> Result<Option<BallPosition>, String> {
    let pos = BALL_POS.lock().map_err(|e| e.to_string())?;
    Ok(pos.clone())
}

pub fn set_panel_position_near_ball(app: AppHandle) -> Result<(), String> {
    let pos = BALL_POS.lock().map_err(|e| e.to_string())?;
    if let (Some(ball_pos), Some(panel)) = (pos.as_ref(), app.get_webview_window("chat-panel")) {
        let panel_x = (ball_pos.x - 500.0).max(0.0);
        let panel_y = (ball_pos.y - 320.0).max(0.0);
        panel
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: panel_x as i32,
                y: panel_y as i32,
            }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Snap the floating-ball window to the nearest screen edge (half-hidden).
pub fn snap_ball_to_edge(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("main window not found")?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let size = win.outer_size().map_err(|e| e.to_string())?;

    // Get monitor the window is on
    let monitor = win.current_monitor().map_err(|e| e.to_string())?
        .ok_or("No monitor found")?;
    let screen_pos = monitor.position();
    let screen_size = monitor.size();

    let wx = pos.x as f64;
    let wy = pos.y as f64;
    let ww = size.width as f64;
    let wh = size.height as f64;
    let sx = screen_pos.x as f64;
    let sy = screen_pos.y as f64;
    let sw = screen_size.width as f64;
    let sh = screen_size.height as f64;

    // Center of the window
    let cx = wx + ww / 2.0;
    let cy = wy + wh / 2.0;

    // Distances to each edge from center
    let d_left = cx - sx;
    let d_right = (sx + sw) - cx;
    let d_top = cy - sy;
    let d_bottom = (sy + sh) - cy;

    let min_d = d_left.min(d_right).min(d_top).min(d_bottom);
    let half_hide = ww * 0.35; // hide 35% of the ball on the edge

    let (snap_x, snap_y) = if min_d == d_left {
        (sx - half_hide, wy) // left edge
    } else if min_d == d_right {
        (sx + sw - ww + half_hide, wy) // right edge
    } else if min_d == d_top {
        (wx, sy - half_hide) // top edge
    } else {
        (wx, sy + sh - wh + half_hide) // bottom edge
    };

    // Clamp vertical within screen bounds
    let final_y = snap_y.max(sy - half_hide).min(sy + sh - wh + half_hide);
    let final_x = snap_x.max(sx - half_hide).min(sx + sw - ww + half_hide);

    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: final_x as i32,
        y: final_y as i32,
    })).map_err(|e| e.to_string())?;

    // Also save the snapped position
    let mut ball = BALL_POS.lock().map_err(|e| e.to_string())?;
    *ball = Some(BallPosition { x: final_x, y: final_y });

    Ok(())
}

/// Return a list of all available monitors with positions and sizes.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitorInfo {
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

pub fn get_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .into_iter()
        .map(|m| MonitorInfo {
            name: m.name().map(|n| n.to_string()),
            x: m.position().x,
            y: m.position().y,
            width: m.size().width,
            height: m.size().height,
            scale: m.scale_factor(),
        })
        .collect())
}

/// Move the floating-ball to the given monitor (by index) and snap to the nearest edge.
pub fn move_ball_to_monitor(app: AppHandle, monitor_index: usize) -> Result<(), String> {
    let monitors: Vec<_> = app.available_monitors().map_err(|e| e.to_string())?;
    let target = monitors.get(monitor_index).ok_or("Monitor index out of range")?;
    let win = app.get_webview_window("main").ok_or("main window not found")?;

    // Place ball at center-right of the target monitor initially
    let mx = target.position().x as f64;
    let my = target.position().y as f64;
    let mw = target.size().width as f64;
    let mh = target.size().height as f64;
    let size = win.outer_size().map_err(|e| e.to_string())?;
    let ww = size.width as f64;

    let new_x = mx + mw - ww * 0.65; // right edge, partially hidden
    let new_y = my + mh / 2.0 - 28.0; // vertically centered

    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: new_x as i32,
        y: new_y as i32,
    }))
    .map_err(|e| e.to_string())?;

    let mut ball = BALL_POS.lock().map_err(|e| e.to_string())?;
    *ball = Some(BallPosition { x: new_x, y: new_y });

    Ok(())
}

// ─── Workspace / Coding Agent Filesystem Commands ───────

/// Validate that a path is safely within the workspace root (no traversal)
fn validate_path(workspace: &Path, relative: &str) -> Result<PathBuf, String> {
    // Block obvious traversal attempts
    if relative.contains("..") {
        return Err("Path traversal not allowed".into());
    }
    let full = workspace.join(relative);
    let canonical = full.canonicalize().unwrap_or_else(|_| full.clone());
    let ws_canonical = workspace.canonicalize().unwrap_or_else(|_| workspace.to_path_buf());
    if !canonical.starts_with(&ws_canonical) {
        return Err("Path is outside workspace".into());
    }
    Ok(full)
}

pub fn set_workspace_dir(path: String) -> Result<String, String> {
    store_workspace_dir(PathBuf::from(path))
}

pub fn pick_workspace_dir(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = mpsc::channel::<Result<Option<String>, String>>();

    app.run_on_main_thread(move || {
        let result = match rfd::FileDialog::new()
            .set_title("Select Workspace Folder")
            .pick_folder()
        {
            Some(path) => store_workspace_dir(path).map(Some),
            None => Ok(None),
        };

        let _ = tx.send(result);
    })
    .map_err(|e| format!("Failed to schedule workspace picker on main thread: {e}"))?;

    rx.recv()
        .map_err(|e| format!("Failed to receive workspace picker result: {e}"))?
}

pub fn get_workspace_dir() -> Result<Option<String>, String> {
    Ok(load_workspace_dir()?.map(|path| path.display().to_string()))
}

pub fn list_workspace_dir(relative_path: String) -> Result<Vec<FileEntry>, String> {
    let workspace = require_workspace_dir()?;
    let target = if relative_path.is_empty() {
        workspace.clone()
    } else {
        validate_path(&workspace, &relative_path)?
    };
    if !target.is_dir() {
        return Err(format!("Not a directory: {}", target.display()));
    }
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&target).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        entries.push(FileEntry {
            name,
            is_dir: ft.is_dir(),
            size,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });
    Ok(entries)
}

pub fn read_workspace_file(relative_path: String) -> Result<String, String> {
    let workspace = require_workspace_dir()?;
    let target = validate_path(&workspace, &relative_path)?;
    if !target.is_file() {
        return Err(format!("Not a file: {}", target.display()));
    }
    // Limit reads to 2MB to avoid memory issues
    let meta = std::fs::metadata(&target).map_err(|e| e.to_string())?;
    if meta.len() > 2 * 1024 * 1024 {
        return Err("File too large (>2MB). Use a specific range or smaller file.".into());
    }
    std::fs::read_to_string(&target).map_err(|e| e.to_string())
}

pub fn write_workspace_file(relative_path: String, content: String) -> Result<(), String> {
    let workspace = require_workspace_dir()?;
    let target = validate_path(&workspace, &relative_path)?;
    // Create parent directories if needed
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&target, &content).map_err(|e| e.to_string())
}

pub fn list_directory(path: String) -> Result<DesktopListDirectoryResult, String> {
    let target = if path.trim().is_empty() {
        load_workspace_dir()?
            .or_else(|| std::env::current_dir().ok())
            .ok_or("Unable to resolve directory".to_string())?
    } else {
        resolve_user_path(&path)?
    };

    if !target.is_dir() {
        return Err(format!("Not a directory: {}", target.display()));
    }

    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&target).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        entries.push(FileEntry {
            name,
            is_dir: ft.is_dir(),
            size,
        });
    }

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));

    Ok(DesktopListDirectoryResult {
        path: target.display().to_string(),
        entries,
    })
}

fn build_shell_command(command: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", command]);
        cmd
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new("sh");
        cmd.args(["-lc", command]);
        cmd
    }
}

fn read_pipe(mut pipe: Option<impl Read>) -> String {
    let mut buf = String::new();
    if let Some(ref mut reader) = pipe {
        let _ = reader.read_to_string(&mut buf);
    }
    buf
}

pub fn run_command(command: String, working_directory: Option<String>, timeout_ms: u64) -> Result<DesktopCommandResult, String> {
    let started = Instant::now();
    let mut shell = build_shell_command(&command);
    let resolved_working_directory = if let Some(dir) = working_directory.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        Some(dir.to_string())
    } else {
        load_workspace_dir()?.map(|workspace| workspace.display().to_string())
    };

    if let Some(dir) = resolved_working_directory.as_ref() {
        shell.current_dir(dir);
    }
    shell.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = shell.spawn().map_err(|e| e.to_string())?;
    let timeout = Duration::from_millis(timeout_ms.max(1));

    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            let stdout = read_pipe(child.stdout.take());
            let stderr = read_pipe(child.stderr.take());
            return Ok(DesktopCommandResult {
                command,
                working_directory: resolved_working_directory.clone(),
                stdout,
                stderr,
                exit_code: status.code(),
                timed_out: false,
                duration_ms: started.elapsed().as_millis(),
            });
        }

        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            let stdout = read_pipe(child.stdout.take());
            let stderr = read_pipe(child.stderr.take());
            return Ok(DesktopCommandResult {
                command,
                working_directory: resolved_working_directory.clone(),
                stdout,
                stderr,
                exit_code: None,
                timed_out: true,
                duration_ms: started.elapsed().as_millis(),
            });
        }

        std::thread::sleep(Duration::from_millis(50));
    }
}

pub fn read_file(path: String, start_line: Option<usize>, end_line: Option<usize>) -> Result<DesktopReadFileResult, String> {
    let target = resolve_user_path(&path)?;
    if !target.is_file() {
        return Err(format!("Not a file: {}", target.display()));
    }
    let metadata = std::fs::metadata(&target).map_err(|e| e.to_string())?;
    if metadata.len() > 2 * 1024 * 1024 {
        return Err("File too large (>2MB).".into());
    }
    let full_content = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
    let all_lines: Vec<&str> = full_content.lines().collect();
    let total_lines = all_lines.len();
    let (resolved_start_line, resolved_end_line, content) = if total_lines == 0 {
        (0usize, 0usize, String::new())
    } else {
        let requested_start = start_line.unwrap_or(1).max(1);
        let requested_end = end_line.unwrap_or(total_lines).max(requested_start);
        let clamped_start = requested_start.min(total_lines);
        let clamped_end = requested_end.min(total_lines);
        (
            clamped_start,
            clamped_end,
            all_lines[(clamped_start - 1)..clamped_end].join("\n"),
        )
    };

    Ok(DesktopReadFileResult {
        path: target.display().to_string(),
        content,
        size: metadata.len(),
        total_lines,
        start_line: resolved_start_line,
        end_line: resolved_end_line,
    })
}

pub fn write_file(path: String, content: String) -> Result<DesktopWriteFileResult, String> {
    let target = resolve_user_path(&path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&target, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(DesktopWriteFileResult {
        path: target.display().to_string(),
        bytes_written: content.as_bytes().len(),
    })
}

pub fn open_browser(url: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(url)
}

#[cfg(target_os = "windows")]
fn run_powershell_script(script: &str) -> Result<String, String> {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut child = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(script.as_bytes()).map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if !stderr.is_empty() { stderr } else { stdout });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
fn active_window_script() -> &'static str {
    r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class AgentrixWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@;
$hwnd = [AgentrixWin32]::GetForegroundWindow();
if ($hwnd -eq [IntPtr]::Zero) { return }
$titleBuilder = New-Object System.Text.StringBuilder 2048;
[void][AgentrixWin32]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity);
$title = $titleBuilder.ToString().Trim();
$pid = 0;
[void][AgentrixWin32]::GetWindowThreadProcessId($hwnd, [ref]$pid);
$processName = $null;
if ($pid -gt 0) {
  try { $processName = (Get-Process -Id $pid -ErrorAction Stop).ProcessName } catch {}
}
[pscustomobject]@{
  title = $title
  processName = $processName
  processId = if ($pid -gt 0) { $pid } else { $null }
} | ConvertTo-Json -Compress
"#
}

#[cfg(target_os = "windows")]
fn list_windows_script() -> &'static str {
    r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
public static class AgentrixWin32 {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@;
$items = New-Object System.Collections.Generic.List[object];
$callback = [EnumWindowsProc]{
  param($hwnd, $lParam)
  if (-not [AgentrixWin32]::IsWindowVisible($hwnd)) { return $true }
  $length = [AgentrixWin32]::GetWindowTextLength($hwnd)
  if ($length -le 0) { return $true }
  $builder = New-Object System.Text.StringBuilder ($length + 1)
  [void][AgentrixWin32]::GetWindowText($hwnd, $builder, $builder.Capacity)
  $title = $builder.ToString().Trim()
  if ([string]::IsNullOrWhiteSpace($title)) { return $true }
  $pid = 0
  [void][AgentrixWin32]::GetWindowThreadProcessId($hwnd, [ref]$pid)
  $processName = $null
  if ($pid -gt 0) {
    try { $processName = (Get-Process -Id $pid -ErrorAction Stop).ProcessName } catch {}
  }
  $items.Add([pscustomobject]@{
    title = $title
    processName = $processName
    processId = if ($pid -gt 0) { $pid } else { $null }
  }) | Out-Null
  return $true
}
[void][AgentrixWin32]::EnumWindows($callback, [IntPtr]::Zero)
$items | Sort-Object title -Unique | ConvertTo-Json -Compress
"#
}

#[cfg(target_os = "windows")]
fn read_clipboard_script() -> &'static str {
    r#"
try {
  $text = Get-Clipboard -Raw -ErrorAction Stop
  if ($null -eq $text) { return }
  $text
} catch {
  return
}
"#
}

#[cfg(target_os = "windows")]
fn set_clipboard_text(text: &str) -> Result<(), String> {
    let json = serde_json::to_string(text).map_err(|e| e.to_string())?;
    let script = format!(
        r#"
$value = {json} | ConvertFrom-Json
Set-Clipboard -Value $value
"#,
    );
    run_powershell_script(&script).map(|_| ())
}

pub fn get_active_window() -> Result<Option<DesktopWindowInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = run_powershell_script(active_window_script())?;
        if output.trim().is_empty() {
            return Ok(None);
        }
        let window = serde_json::from_str::<DesktopWindowInfo>(&output).map_err(|e| e.to_string())?;
        if window.title.trim().is_empty() {
            return Ok(None);
        }
        return Ok(Some(window));
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

pub fn list_windows() -> Result<Vec<DesktopWindowInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = run_powershell_script(list_windows_script())?;
        if output.trim().is_empty() {
            return Ok(vec![]);
        }
        if output.trim_start().starts_with('[') {
            return serde_json::from_str::<Vec<DesktopWindowInfo>>(&output).map_err(|e| e.to_string());
        }
        let single = serde_json::from_str::<DesktopWindowInfo>(&output).map_err(|e| e.to_string())?;
        return Ok(vec![single]);
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

pub fn get_clipboard_text() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = run_powershell_script(read_clipboard_script())?;
        let trimmed = output.trim().to_string();
        if trimmed.is_empty() {
            return Ok(None);
        }
        return Ok(Some(trimmed));
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

pub fn get_context() -> Result<DesktopContextResult, String> {
    let workspace_hint = load_workspace_dir()?
        .map(|path| path.display().to_string());
    let active_window = get_active_window()?;
    let clipboard_text_preview = get_clipboard_text()?.map(|text| {
        let normalized = text.replace('\r', "").replace('\n', " ");
        normalized.chars().take(240).collect::<String>()
    });
    let file_hint = active_window
        .as_ref()
        .and_then(|window| window.title.split(['-', '–', '—']).next_back())
        .map(|segment| segment.trim().to_string())
        .filter(|segment| !segment.is_empty());

    Ok(DesktopContextResult {
        platform: std::env::consts::OS.to_string(),
        active_window,
        clipboard_text_preview,
        workspace_hint,
        file_hint,
    })
}

// ─── Screen Capture (P3.2) ─────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScreenCaptureResult {
    pub width: u32,
    pub height: u32,
    pub data_base64: String,
    pub file_path: Option<String>,
}

pub fn capture_screen(app: &AppHandle, save_to_file: bool) -> Result<ScreenCaptureResult, String> {
    #[cfg(target_os = "windows")]
    {
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$graphics.Dispose()
$ms = New-Object System.IO.MemoryStream
$bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
$bytes = $ms.ToArray()
$ms.Dispose()
$b64 = [Convert]::ToBase64String($bytes)
[pscustomobject]@{
    width = $screen.Width
    height = $screen.Height
    base64 = $b64
} | ConvertTo-Json -Compress
"#;
        let output = run_powershell_script(script)?;
        let parsed: serde_json::Value = serde_json::from_str(&output).map_err(|e| e.to_string())?;
        let width = parsed["width"].as_u64().unwrap_or(0) as u32;
        let height = parsed["height"].as_u64().unwrap_or(0) as u32;
        let b64 = parsed["base64"].as_str().unwrap_or("").to_string();

        let file_path = if save_to_file {
            let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let screenshots_dir = dir.join("screenshots");
            std::fs::create_dir_all(&screenshots_dir).map_err(|e| e.to_string())?;
            let filename = format!("screenshot_{}.png", chrono_now_millis());
            let full_path = screenshots_dir.join(&filename);
            // Decode base64 and write
            let bytes = base64_decode(&b64)?;
            std::fs::write(&full_path, &bytes).map_err(|e| e.to_string())?;
            Some(full_path.display().to_string())
        } else {
            None
        };

        return Ok(ScreenCaptureResult { width, height, data_base64: b64, file_path });
    }

    #[cfg(target_os = "macos")]
    {
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let screenshots_dir = dir.join("screenshots");
        std::fs::create_dir_all(&screenshots_dir).map_err(|e| e.to_string())?;
        let filename = format!("screenshot_{}.png", chrono_now_millis());
        let full_path = screenshots_dir.join(&filename);
        let output = Command::new("screencapture")
            .args(["-x", &full_path.display().to_string()])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("screencapture failed".into());
        }
        let bytes = std::fs::read(&full_path).map_err(|e| e.to_string())?;
        let b64 = base64_encode(&bytes);
        // Read image dimensions from PNG header
        let (w, h) = png_dimensions(&bytes).unwrap_or((0, 0));
        let fp = if save_to_file { Some(full_path.display().to_string()) } else {
            let _ = std::fs::remove_file(&full_path);
            None
        };
        return Ok(ScreenCaptureResult { width: w, height: h, data_base64: b64, file_path: fp });
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Err("Screen capture not yet implemented for Linux".into())
    }
}

fn chrono_now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[allow(dead_code)]
fn base64_encode(data: &[u8]) -> String {
    use std::io::Write;
    let mut buf = Vec::new();
    let mut encoder = Base64Encoder::new(&mut buf);
    let _ = encoder.write_all(data);
    let _ = encoder.finish();
    String::from_utf8(buf).unwrap_or_default()
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lookup = [255u8; 256];
    for (i, &c) in alphabet.iter().enumerate() {
        lookup[c as usize] = i as u8;
    }
    let filtered: Vec<u8> = s.bytes().filter(|&b| b != b'\n' && b != b'\r' && b != b' ').collect();
    let mut out = Vec::with_capacity(filtered.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits = 0;
    for b in filtered {
        if b == b'=' { break; }
        let val = lookup[b as usize];
        if val == 255 { continue; }
        buf = (buf << 6) | val as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

#[allow(dead_code)]
struct Base64Encoder<'a> {
    inner: &'a mut Vec<u8>,
    buffer: Vec<u8>,
}

impl<'a> Base64Encoder<'a> {
    fn new(inner: &'a mut Vec<u8>) -> Self {
        Self { inner, buffer: Vec::new() }
    }
    fn finish(self) -> std::io::Result<()> {
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let chunks = self.buffer.chunks(3);
        for chunk in chunks {
            match chunk.len() {
                3 => {
                    let n = (chunk[0] as u32) << 16 | (chunk[1] as u32) << 8 | chunk[2] as u32;
                    self.inner.push(alphabet[((n >> 18) & 0x3F) as usize]);
                    self.inner.push(alphabet[((n >> 12) & 0x3F) as usize]);
                    self.inner.push(alphabet[((n >> 6) & 0x3F) as usize]);
                    self.inner.push(alphabet[(n & 0x3F) as usize]);
                }
                2 => {
                    let n = (chunk[0] as u32) << 16 | (chunk[1] as u32) << 8;
                    self.inner.push(alphabet[((n >> 18) & 0x3F) as usize]);
                    self.inner.push(alphabet[((n >> 12) & 0x3F) as usize]);
                    self.inner.push(alphabet[((n >> 6) & 0x3F) as usize]);
                    self.inner.push(b'=');
                }
                1 => {
                    let n = (chunk[0] as u32) << 16;
                    self.inner.push(alphabet[((n >> 18) & 0x3F) as usize]);
                    self.inner.push(alphabet[((n >> 12) & 0x3F) as usize]);
                    self.inner.push(b'=');
                    self.inner.push(b'=');
                }
                _ => {}
            }
        }
        Ok(())
    }
}

impl<'a> std::io::Write for Base64Encoder<'a> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buffer.extend_from_slice(buf);
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> { Ok(()) }
}

#[allow(dead_code)]
fn png_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    // PNG IHDR: bytes 16-19 = width, 20-23 = height (big-endian)
    if data.len() < 24 { return None; }
    let w = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
    let h = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
    Some((w, h))
}

// ─── Git Integration (P3.3) ────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub branch: String,
    pub changes: Vec<GitFileChange>,
    pub ahead: u32,
    pub behind: u32,
    pub is_clean: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    pub status: String,
    pub file: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResult {
    pub hash: String,
    pub message: String,
    pub files_changed: usize,
}

fn git_command(args: &[&str], cwd: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git {} failed with exit code {:?}", args.join(" "), output.status.code())
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn git_status() -> Result<GitStatusResult, String> {
    let workspace = require_workspace_dir()?;

    let branch_raw = git_command(&["branch", "--show-current"], &workspace)?;
    let branch = branch_raw.trim().to_string();

    let status_raw = git_command(&["status", "--porcelain=v1"], &workspace)?;
    let changes: Vec<GitFileChange> = status_raw
        .lines()
        .filter(|line| line.len() >= 3)
        .map(|line| {
            let status = line[..2].trim().to_string();
            let file = line[3..].to_string();
            GitFileChange { status, file }
        })
        .collect();

    let is_clean = changes.is_empty();

    // Try to get ahead/behind counts
    let (ahead, behind) = match git_command(&["rev-list", "--left-right", "--count", &format!("{}...@{{u}}", branch)], &workspace) {
        Ok(output) => {
            let parts: Vec<&str> = output.trim().split('\t').collect();
            let a = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0u32);
            let b = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0u32);
            (a, b)
        }
        Err(_) => (0, 0),
    };

    Ok(GitStatusResult { branch, changes, ahead, behind, is_clean })
}

pub fn git_diff(staged: bool, file_path: Option<String>) -> Result<String, String> {
    let workspace = require_workspace_dir()?;
    let mut args = vec!["diff"];
    if staged { args.push("--cached"); }
    args.push("--stat");
    args.push("--patch");
    if let Some(ref fp) = file_path {
        args.push("--");
        args.push(fp);
    }
    git_command(&args, &workspace)
}

pub fn git_log(count: u32) -> Result<Vec<GitLogEntry>, String> {
    let workspace = require_workspace_dir()?;
    let n = count.min(50).max(1).to_string();
    let raw = git_command(
        &["log", &format!("-{}", n), "--pretty=format:%H%n%h%n%an%n%ai%n%s%n---END---"],
        &workspace,
    )?;
    let mut entries = Vec::new();
    let mut lines = raw.lines().peekable();
    while lines.peek().is_some() {
        let hash = lines.next().unwrap_or("").to_string();
        let short_hash = lines.next().unwrap_or("").to_string();
        let author = lines.next().unwrap_or("").to_string();
        let date = lines.next().unwrap_or("").to_string();
        let message = lines.next().unwrap_or("").to_string();
        // Skip the ---END--- marker
        if let Some(end) = lines.next() {
            if end.trim() != "---END---" { break; }
        }
        if !hash.is_empty() {
            entries.push(GitLogEntry { hash, short_hash, author, date, message });
        }
    }
    Ok(entries)
}

pub fn git_commit(message: String, add_all: bool) -> Result<GitCommitResult, String> {
    let workspace = require_workspace_dir()?;
    if add_all {
        git_command(&["add", "-A"], &workspace)?;
    }
    git_command(&["commit", "-m", &message], &workspace)?;
    let hash_raw = git_command(&["rev-parse", "HEAD"], &workspace)?;
    let hash = hash_raw.trim().to_string();
    // Count files changed in this commit
    let stat = git_command(&["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], &workspace)?;
    let files_changed = stat.lines().count();
    Ok(GitCommitResult { hash, message, files_changed })
}

pub fn git_branch_list() -> Result<Vec<String>, String> {
    let workspace = require_workspace_dir()?;
    let raw = git_command(&["branch", "-a", "--format=%(refname:short)"], &workspace)?;
    Ok(raw.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

// ─── Secure Credential Vault (P3.5) ───────────────────────

pub fn keychain_set(app: &AppHandle, service: &str, key: &str, value: &str) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let vault_dir = dir.join("vault");
    std::fs::create_dir_all(&vault_dir).map_err(|e| e.to_string())?;
    let file = vault_dir.join(format!("{}_{}.enc", service, key));
    // Simple XOR obfuscation with machine-specific key (not cryptographically secure,
    // but prevents casual reads — proper OS keychain would need platform crates)
    let machine_key = machine_key_bytes();
    let encrypted: Vec<u8> = value.as_bytes().iter().enumerate()
        .map(|(i, &b)| b ^ machine_key[i % machine_key.len()])
        .collect();
    std::fs::write(&file, &encrypted).map_err(|e| e.to_string())
}

pub fn keychain_get(app: &AppHandle, service: &str, key: &str) -> Result<Option<String>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file = dir.join("vault").join(format!("{}_{}.enc", service, key));
    if !file.is_file() { return Ok(None); }
    let encrypted = std::fs::read(&file).map_err(|e| e.to_string())?;
    let machine_key = machine_key_bytes();
    let decrypted: Vec<u8> = encrypted.iter().enumerate()
        .map(|(i, &b)| b ^ machine_key[i % machine_key.len()])
        .collect();
    let value = String::from_utf8(decrypted).map_err(|e| e.to_string())?;
    Ok(Some(value))
}

pub fn keychain_delete(app: &AppHandle, service: &str, key: &str) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file = dir.join("vault").join(format!("{}_{}.enc", service, key));
    if file.is_file() {
        std::fs::remove_file(&file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn machine_key_bytes() -> Vec<u8> {
    // Derive a machine-specific key from hostname + username + OS
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-host".to_string());
    let username = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_default();
    let seed = format!("agentrix-vault-{}-{}-{}", hostname, username, std::env::consts::OS);
    // Simple hash to get 32 bytes
    let mut hash = [0u8; 32];
    for (i, b) in seed.bytes().enumerate() {
        hash[i % 32] ^= b;
        hash[(i + 13) % 32] = hash[(i + 13) % 32].wrapping_add(b);
    }
    hash.to_vec()
}

// ─── Spotlight Mode (Sprint 5) ─────────────────────────

/// Grab the currently selected text from the foreground application.
/// Windows: simulates Ctrl+C, waits briefly, then reads clipboard.
/// macOS: uses AppleScript to get selection.
pub fn get_selected_text() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        // Save current clipboard
        let prev = get_clipboard_text()?;

        let script = r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AgentrixKeys {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public const byte VK_CONTROL = 0x11;
    public const byte VK_C = 0x43;
    public const uint KEYEVENTF_KEYUP = 0x0002;
}
"@;
[AgentrixKeys]::keybd_event([AgentrixKeys]::VK_CONTROL, 0, 0, [UIntPtr]::Zero)
[AgentrixKeys]::keybd_event([AgentrixKeys]::VK_C, 0, 0, [UIntPtr]::Zero)
[AgentrixKeys]::keybd_event([AgentrixKeys]::VK_C, 0, [AgentrixKeys]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
[AgentrixKeys]::keybd_event([AgentrixKeys]::VK_CONTROL, 0, [AgentrixKeys]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 120
try { Get-Clipboard -Raw -ErrorAction Stop } catch { "" }
"#;
        let output = run_powershell_script(script)?;
        let text = output.trim().to_string();
        if let Some(prev_text) = prev.as_ref() {
            let _ = set_clipboard_text(prev_text);
        }
        if text.is_empty() {
            return Ok(None);
        }
        return Ok(Some(text));
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to keystroke \"c\" using command down"])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Ok(None);
        }
        std::thread::sleep(Duration::from_millis(120));
        let clip = Command::new("pbpaste")
            .output()
            .map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&clip.stdout).trim().to_string();
        if text.is_empty() {
            return Ok(None);
        }
        return Ok(Some(text));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Ok(None)
    }
}

/// Open (or show) the Spotlight window. Creates it if it doesn't exist.
pub fn open_spotlight(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("spotlight") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        // Notify frontend to re-focus input
        let _ = win.eval("window.dispatchEvent(new CustomEvent('agentrix:spotlight-focus'))");
        return Ok(());
    }

    let app_clone = app.clone();
    std::thread::spawn(move || {
        // Center on primary monitor
        let (cx, cy) = if let Ok(monitors) = app_clone.available_monitors() {
            if let Some(m) = monitors.first() {
                let mx = m.position().x as f64;
                let my = m.position().y as f64;
                let mw = m.size().width as f64;
                let mh = m.size().height as f64;
                (mx + (mw - 600.0) / 2.0, my + mh * 0.28)
            } else {
                (400.0, 200.0)
            }
        } else {
            (400.0, 200.0)
        };

        if let Ok(win) = WebviewWindowBuilder::new(
            &app_clone,
            "spotlight",
            WebviewUrl::App("index.html".into()),
        )
        .title("Agentrix Spotlight")
        .inner_size(600.0, 400.0)
        .min_inner_size(400.0, 60.0)
        .position(cx, cy)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .visible(true)
        .drag_and_drop(true)
        .build()
        {
            #[cfg(target_os = "windows")]
            crate::grant_webview2_permissions(&win);
        }
    });

    Ok(())
}

/// Hide the Spotlight window.
pub fn close_spotlight(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("spotlight") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Local LLM Sidecar (llama.cpp) ───────────────────────

static LLM_SIDECAR_PID: Mutex<Option<u32>> = Mutex::new(None);

/// Start a llama.cpp server as a sidecar process.
/// The binary must exist at the given path or be resolvable via PATH.
pub fn start_llm_sidecar(
    model_path: String,
    port: u16,
    n_gpu_layers: u32,
    context_size: u32,
    threads: Option<u32>,
) -> Result<(), String> {
    // Kill existing sidecar if running
    stop_llm_sidecar().ok();

    // Validate model file exists
    if !Path::new(&model_path).is_file() {
        return Err(format!("Model file not found: {}", model_path));
    }

    // Look for llama-server binary
    let binary = find_llama_server_binary()
        .ok_or_else(|| "llama-server binary not found. Please install llama.cpp or place llama-server in app directory.".to_string())?;

    let mut cmd = Command::new(&binary);
    cmd.arg("--model").arg(&model_path)
       .arg("--port").arg(port.to_string())
       .arg("--ctx-size").arg(context_size.to_string())
         .arg("--n-gpu-layers").arg(n_gpu_layers.to_string())
         .arg("--reasoning").arg("off")
         .arg("--reasoning-format").arg("none");

    if let Some(t) = threads {
        cmd.arg("--threads").arg(t.to_string());
    }

    cmd.stdout(Stdio::null())
       .stderr(Stdio::null());

    // Detach process on Windows so it doesn't block
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let child = cmd.spawn().map_err(|e| format!("Failed to start llama-server: {}", e))?;
    let pid = child.id();

    let mut guard = LLM_SIDECAR_PID.lock().map_err(|e| e.to_string())?;
    *guard = Some(pid);

    Ok(())
}

/// Stop the llama.cpp sidecar process.
pub fn stop_llm_sidecar() -> Result<(), String> {
    let mut guard = LLM_SIDECAR_PID.lock().map_err(|e| e.to_string())?;
    if let Some(pid) = guard.take() {
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .creation_flags(0x08000000)
                .output();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output();
        }
    }
    Ok(())
}

/// List GGUF model files in a directory.
pub fn list_local_models(models_dir: String) -> Result<Vec<LocalModelInfo>, String> {
    let resolved_dir = resolve_models_dir(&models_dir)?;
    let dir = resolved_dir.as_path();
    if !dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut models = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "gguf") {
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            models.push(LocalModelInfo {
                name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                size_bytes: meta.len(),
            });
        }
    }
    models.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(models)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalModelInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelDownloadEvent {
    pub model_id: String,
    pub file_name: String,
    pub status: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub progress: f64,
    pub path: Option<String>,
    pub message: Option<String>,
}

fn desktop_app_data_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        return std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .map(|base| base.join("Agentrix Desktop"))
            .ok_or_else(|| "APPDATA is not available".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(config_home) = std::env::var_os("XDG_CONFIG_HOME") {
            return Ok(PathBuf::from(config_home).join("agentrix-desktop"));
        }

        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|home| home.join(".config").join("agentrix-desktop"))
            .ok_or_else(|| "HOME is not available".to_string())
    }
}

fn resolve_models_dir(models_dir: &str) -> Result<PathBuf, String> {
    let trimmed = models_dir.trim();
    if trimmed.is_empty() {
        return Ok(desktop_app_data_dir()?.join("models"));
    }

    let candidate = PathBuf::from(trimmed);
    if candidate.is_absolute() {
        return Ok(candidate);
    }

    Ok(desktop_app_data_dir()?.join(candidate))
}

fn emit_local_model_download(app: &AppHandle, payload: LocalModelDownloadEvent) {
    let _ = app.emit("local-model-download", payload);
}

pub async fn download_model(
    app: AppHandle,
    model_id: String,
    url: String,
    models_dir: String,
    file_name: String,
) -> Result<LocalModelInfo, String> {
    let sanitized_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid model file name".to_string())?
        .to_string();

    if sanitized_name != file_name {
        return Err("Invalid model file name".to_string());
    }

    let dir = resolve_models_dir(&models_dir)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let final_path = dir.join(&sanitized_name);
    if final_path.is_file() {
        let meta = std::fs::metadata(&final_path).map_err(|e| e.to_string())?;
        let info = LocalModelInfo {
            name: sanitized_name.clone(),
            path: final_path.to_string_lossy().to_string(),
            size_bytes: meta.len(),
        };
        emit_local_model_download(
            &app,
            LocalModelDownloadEvent {
                model_id,
                file_name: sanitized_name,
                status: "completed".to_string(),
                downloaded_bytes: info.size_bytes,
                total_bytes: Some(info.size_bytes),
                progress: 100.0,
                path: Some(info.path.clone()),
                message: Some("Model already exists locally".to_string()),
            },
        );
        return Ok(info);
    }

    let partial_path = dir.join(format!("{}.partial", sanitized_name));
    if partial_path.exists() {
        let _ = std::fs::remove_file(&partial_path);
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut response = client
        .get(&url)
        .header(USER_AGENT, "Agentrix Desktop/0.1")
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status {}", response.status()));
    }

    let total_bytes = response.content_length();
    emit_local_model_download(
        &app,
        LocalModelDownloadEvent {
            model_id: model_id.clone(),
            file_name: sanitized_name.clone(),
            status: "started".to_string(),
            downloaded_bytes: 0,
            total_bytes,
            progress: 0.0,
            path: Some(final_path.to_string_lossy().to_string()),
            message: None,
        },
    );

    let mut file = tokio::fs::File::create(&partial_path)
        .await
        .map_err(|e| format!("Failed to create model file: {}", e))?;
    let mut downloaded_bytes = 0_u64;

    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(err) => {
                let message = format!("Download stream failed: {}", err);
                let _ = tokio::fs::remove_file(&partial_path).await;
                emit_local_model_download(
                    &app,
                    LocalModelDownloadEvent {
                        model_id: model_id.clone(),
                        file_name: sanitized_name.clone(),
                        status: "error".to_string(),
                        downloaded_bytes,
                        total_bytes,
                        progress: 0.0,
                        path: None,
                        message: Some(message.clone()),
                    },
                );
                return Err(message);
            }
        };

        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| format!("Failed to write model chunk: {}", e))?;

        downloaded_bytes += chunk.len() as u64;
        let progress = if let Some(total) = total_bytes {
            if total == 0 {
                0.0
            } else {
                downloaded_bytes as f64 * 100.0 / total as f64
            }
        } else {
            0.0
        };

        emit_local_model_download(
            &app,
            LocalModelDownloadEvent {
                model_id: model_id.clone(),
                file_name: sanitized_name.clone(),
                status: "progress".to_string(),
                downloaded_bytes,
                total_bytes,
                progress,
                path: None,
                message: None,
            },
        );
    }

    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(|e| format!("Failed to flush model file: {}", e))?;
    drop(file);

    tokio::fs::rename(&partial_path, &final_path)
        .await
        .map_err(|e| format!("Failed to finalize model file: {}", e))?;

    let meta = std::fs::metadata(&final_path).map_err(|e| e.to_string())?;
    let info = LocalModelInfo {
        name: sanitized_name.clone(),
        path: final_path.to_string_lossy().to_string(),
        size_bytes: meta.len(),
    };

    emit_local_model_download(
        &app,
        LocalModelDownloadEvent {
            model_id,
            file_name: sanitized_name,
            status: "completed".to_string(),
            downloaded_bytes: info.size_bytes,
            total_bytes: Some(info.size_bytes),
            progress: 100.0,
            path: Some(info.path.clone()),
            message: None,
        },
    );

    Ok(info)
}

fn find_llama_server_binary() -> Option<PathBuf> {
    // Check common locations
    let candidates = [
        // Same directory as the app
        std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join("llama-server"))),
        std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join("llama-server.exe"))),
        // App data directory
        #[cfg(target_os = "windows")]
        std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("Agentrix Desktop").join("bin").join("llama-server.exe")),
        #[cfg(not(target_os = "windows"))]
        std::env::var_os("HOME").map(|d| PathBuf::from(d).join(".local").join("bin").join("llama-server")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    // Try PATH
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("where").arg("llama-server").creation_flags(0x08000000).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(PathBuf::from(path.lines().next().unwrap_or(&path)));
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = Command::new("which").arg("llama-server").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(PathBuf::from(path));
                }
            }
        }
    }

    None
}

/// Check if llama-server binary is available on this system.
pub fn check_llama_server_available() -> Result<LlamaServerStatus, String> {
    match find_llama_server_binary() {
        Some(path) => Ok(LlamaServerStatus {
            available: true,
            path: Some(path.to_string_lossy().to_string()),
            message: None,
        }),
        None => Ok(LlamaServerStatus {
            available: false,
            path: None,
            message: Some("llama-server binary not found".to_string()),
        }),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlamaServerStatus {
    pub available: bool,
    pub path: Option<String>,
    pub message: Option<String>,
}

/// Download llama-server binary from llama.cpp GitHub releases.
pub async fn download_llama_server(app: AppHandle) -> Result<LlamaServerStatus, String> {
    let bin_dir = desktop_app_data_dir()?.join("bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| format!("Failed to create bin dir: {}", e))?;

    #[cfg(target_os = "windows")]
    let target_binary = bin_dir.join("llama-server.exe");
    #[cfg(target_os = "macos")]
    let target_binary = bin_dir.join("llama-server");
    #[cfg(target_os = "linux")]
    let target_binary = bin_dir.join("llama-server");

    // If already present, skip download
    if target_binary.is_file() {
        return Ok(LlamaServerStatus {
            available: true,
            path: Some(target_binary.to_string_lossy().to_string()),
            message: Some("llama-server already installed".to_string()),
        });
    }

    // Download URL for latest stable llama.cpp release
    // Try ghfast.top mirror first (GFW-friendly), fall back to GitHub directly
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    #[cfg(target_os = "windows")]
    let asset_candidates = ["bin-win-cpu-x64.zip", "win-cpu-x64.zip"];
    #[cfg(target_os = "macos")]
    let asset_candidates = ["bin-macos-arm64.tar.gz", "macos-arm64.tar.gz"];
    #[cfg(target_os = "linux")]
    let asset_candidates = ["bin-ubuntu-x64.tar.gz", "ubuntu-x64.tar.gz"];

    // Try mirror first, then direct GitHub
    let api_urls = [
        "https://ghfast.top/https://api.github.com/repos/ggml-org/llama.cpp/releases/latest",
        "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest",
        "https://ghfast.top/https://api.github.com/repos/ggerganov/llama.cpp/releases/latest",
        "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest",
    ];

    let mut release: Option<serde_json::Value> = None;
    let mut last_err = String::new();
    for api_url in &api_urls {
        match client
            .get(*api_url)
            .header(USER_AGENT, "Agentrix Desktop/0.1")
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await
        {
            Ok(resp) => {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if json.get("assets").is_some() {
                        release = Some(json);
                        break;
                    }
                }
            }
            Err(e) => {
                last_err = format!("{}", e);
            }
        }
    }

    let release = release.ok_or_else(|| format!("Failed to fetch release info (all mirrors failed): {}", last_err))?;

    let assets = release["assets"].as_array()
        .ok_or_else(|| "No assets in release".to_string())?;

    // Find the right binary asset (prefer non-cuda, non-vulkan for broadest compatibility)
    let matched_asset = assets.iter()
        .filter_map(|a| {
            let name = a["name"].as_str()?;
            let url = a["browser_download_url"].as_str()?;
            if asset_candidates.iter().any(|candidate| name.contains(candidate)) && !name.contains("cuda") && !name.contains("vulkan") && !name.contains("sycl") && !name.contains("hip") {
                Some((name.to_string(), url.to_string()))
            } else {
                None
            }
        })
        .next()
        .ok_or_else(|| format!("No matching llama.cpp asset found. Candidates: {}", asset_candidates.join(", ")))?;

    let (asset_name, download_url) = matched_asset;

    let tag = release["tag_name"].as_str().unwrap_or("unknown");

    let _ = app.emit("llama-server-download", serde_json::json!({
        "status": "downloading",
        "message": format!("Downloading llama-server {} ({}) ...", tag, asset_name),
    }));

    // Try downloading via mirror first, then direct
    let download_urls = vec![
        format!("https://ghfast.top/{}", download_url),
        download_url.clone(),
    ];

    let mut zip_bytes: Option<Vec<u8>> = None;
    for url in &download_urls {
        match client
            .get(url)
            .header(USER_AGENT, "Agentrix Desktop/0.1")
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(data) = resp.bytes().await {
                    zip_bytes = Some(data.to_vec());
                    break;
                }
            }
            _ => continue,
        }
    }

    let zip_bytes = zip_bytes.ok_or_else(|| "Download failed: all mirrors exhausted".to_string())?;

    let _ = app.emit("llama-server-download", serde_json::json!({
        "status": "extracting",
        "message": "Extracting llama-server...",
    }));

    // Extract the Windows runtime bundle so llama-server has all required DLLs.
    // New llama.cpp releases ship multiple ggml/llama runtime DLLs alongside the EXE.
    let cursor = std::io::Cursor::new(&zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Failed to open zip: {}", e))?;

    #[cfg(target_os = "windows")]
    let server_name = "llama-server.exe";
    #[cfg(not(target_os = "windows"))]
    let server_name = "llama-server";

    let mut extracted = false;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Zip entry error: {}", e))?;
        let name = file.name().to_string();
        if file.is_dir() {
            continue;
        }

        let Some(file_name) = std::path::Path::new(&name).file_name() else {
            continue;
        };

        let out_path = bin_dir.join(file_name);
        let mut out = std::fs::File::create(&out_path)
            .map_err(|e| format!("Failed to create extracted file {}: {}", out_path.to_string_lossy(), e))?;
        std::io::copy(&mut file, &mut out)
            .map_err(|e| format!("Failed to extract {}: {}", name, e))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&out_path, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("Failed to set permissions: {}", e))?;
        }

        if name.ends_with(server_name) {
            extracted = true;
        }
    }

    if !extracted {
        return Err(format!("Could not find {} in downloaded archive", server_name));
    }

    let _ = app.emit("llama-server-download", serde_json::json!({
        "status": "completed",
        "message": format!("llama-server {} installed", tag),
        "path": target_binary.to_string_lossy().to_string(),
    }));

    Ok(LlamaServerStatus {
        available: true,
        path: Some(target_binary.to_string_lossy().to_string()),
        message: Some(format!("Installed llama-server {}", tag)),
    })
}
