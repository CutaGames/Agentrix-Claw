# Sprint Pre-launch P-1 (2026-05-23) — bulk-mark all sync Tauri commands as
# #[tauri::command(async)] so they run on the async runtime thread pool
# instead of the main thread.
#
# Per Tauri v2 docs (calling-rust):
#   "Commands without the async keyword are executed on the main thread
#    unless defined with #[tauri::command(async)]."
#
# Using `#[tauri::command(async)]` instead of changing `fn` -> `async fn`
# avoids the std::sync::Mutex-across-await problem (we have several global
# mutexes) while still moving the work off the main thread.

# IMPORTANT: read/write as UTF-8 (without BOM) so the existing Chinese comments
# in lib.rs survive intact. PowerShell 5.1's default `Set-Content` is ANSI.

$path = 'desktop/src-tauri/src/lib.rs'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$content = [System.IO.File]::ReadAllText($path, $utf8NoBom)
$pattern = '(?m)^#\[tauri::command\]\r?\nfn '
$replacement = '#[tauri::command(async)]' + [Environment]::NewLine + 'fn '
$updated = [regex]::Replace($content, $pattern, $replacement)
if ($updated -eq $content) {
  Write-Output 'No sync commands matched - nothing changed'
  exit 0
}
[System.IO.File]::WriteAllText($path, $updated, $utf8NoBom)
$count = ([regex]::Matches($updated, '#\[tauri::command\(async\)\]')).Count
Write-Output "Total #[tauri::command(async)] markers in lib.rs: $count"
