param(
    [string]$TaskName = "Agentrix-Shadowsocks-Resume-Guard"
)

$ErrorActionPreference = "Stop"

schtasks /Delete /TN $TaskName /F | Out-Null

Write-Output "Removed scheduled task: $TaskName"