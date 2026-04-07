param(
    [string]$TaskName = "Agentrix-Shadowsocks-Resume-Guard",
    [string]$ScriptPath = (Join-Path $PSScriptRoot "shadowsocks_resume_guard.ps1")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ScriptPath)) {
    throw "Guard script not found: $ScriptPath"
}

$escapedScript = $ScriptPath.Replace('"', '""')
$arguments = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$escapedScript`""
$eventQuery = "*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]"

schtasks /Create /TN $TaskName /TR $arguments /SC ONEVENT /EC System /MO $eventQuery /F | Out-Null

Write-Output "Installed scheduled task: $TaskName"
Write-Output "Trigger: System resume (Power-Troubleshooter / Event ID 1)"
Write-Output "Rollback: .\scripts\network\uninstall_shadowsocks_resume_guard.ps1"