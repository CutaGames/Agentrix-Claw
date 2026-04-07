param(
    [string]$ShadowsocksPath = "C:\Users\15279\Desktop\Shadowsocks.exe",
    [int]$Port = 1080,
    [string]$LogPath = "C:\Users\15279\Desktop\network-backups\shadowsocks-resume-guard.log"
)

$ErrorActionPreference = "Stop"

function Write-GuardLog {
    param([string]$Message)

    $directory = Split-Path -Parent $LogPath
    if ($directory -and -not (Test-Path $directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }

    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $LogPath -Value $line
}

function Get-ShadowsocksProcesses {
    return @(Get-Process Shadowsocks -ErrorAction SilentlyContinue)
}

function Get-ListeningOwners {
    return @(
        Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $_.LocalPort -eq $Port } |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
}

function Test-GuardHealthy {
    $shadowsocksPids = @(Get-ShadowsocksProcesses | Select-Object -ExpandProperty Id)
    if (-not $shadowsocksPids.Count) {
        return $false
    }

    $listenerOwners = Get-ListeningOwners
    return @($listenerOwners | Where-Object { $_ -in $shadowsocksPids }).Count -gt 0
}

try {
    if (-not (Test-Path $ShadowsocksPath)) {
        throw "Shadowsocks executable not found: $ShadowsocksPath"
    }

    if (Test-GuardHealthy) {
        Write-GuardLog "Healthy: Shadowsocks already owns port $Port."
        exit 0
    }

    $existing = Get-ShadowsocksProcesses
    if ($existing.Count -gt 0) {
        Write-GuardLog "Unhealthy: port $Port missing. Restarting existing Shadowsocks PID(s): $($existing.Id -join ', ')."
        $existing | Stop-Process -Force
    } else {
        Write-GuardLog "Unhealthy: Shadowsocks process not found. Starting a new instance."
    }

    @(Get-Process 'v2ray-plugin' -ErrorAction SilentlyContinue) | Stop-Process -Force -ErrorAction SilentlyContinue

    Start-Process -FilePath $ShadowsocksPath
    Write-GuardLog "Restart issued for $ShadowsocksPath."
    exit 0
} catch {
    Write-GuardLog "ERROR: $($_.Exception.Message)"
    throw
}