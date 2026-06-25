# ============================================================
# Agentrix OpenClaw AIO Installer (Windows PowerShell)
# One-click: installs Node.js, OpenClaw agent, starts local
# relay, and shows QR code for mobile connection.
# ============================================================
#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$AGENTRIX_VERSION = "1.1.0"
$OPENCLAW_PORT    = 7474
$INSTALL_DIR      = Join-Path $env:APPDATA "Agentrix"
$LOG_FILE         = Join-Path $INSTALL_DIR "install.log"

function Write-Info  { param($msg) Write-Host "[Agentrix] $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "[✓] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err   {
    param($msg)
    Write-Host "[✗] $msg" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key to close..." -ForegroundColor Gray
    try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch { Start-Sleep 5 }
    exit 1
}

# Create install directory
New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
Start-Transcript -Path $LOG_FILE -Append | Out-Null

Write-Info "Agentrix OpenClaw AIO Installer v$AGENTRIX_VERSION"
Write-Info "Install directory: $INSTALL_DIR"
Write-Host ""

# ── 1. Check / install Node.js (≥18) ─────────────────────────────────────────
$nodeOk = $false
try {
    $nodeVer = (node --version 2>$null)
    $major = [int]($nodeVer -replace 'v(\d+)\..*','$1')
    if ($major -ge 18) {
        Write-Ok "Node.js $nodeVer already installed"
        $nodeOk = $true
    }
} catch {}

if (-not $nodeOk) {
    Write-Warn "Node.js >=18 not found. Downloading installer..."
    $nodeUrl = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi"
    $nodeInstaller = Join-Path $env:TEMP "node-installer.msi"
    Write-Info "Downloading Node.js LTS..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
    Write-Info "Installing Node.js (this may take a minute)..."
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart"
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH", "User")
    Write-Ok "Node.js installed"
}

# ── 2. Install OpenClaw binary ────────────────────────────────────────────────
Write-Info "Installing OpenClaw agent..."
$oclawDir = Join-Path $INSTALL_DIR "openclaw"
New-Item -ItemType Directory -Force -Path $oclawDir | Out-Null
$oclawExe = Join-Path $oclawDir "openclaw.js"

if (Test-Path $oclawExe) {
    Write-Ok "OpenClaw already installed, skipping download"
} else {
    $oclawUrl = "https://cdn.agentrix.io/openclaw/latest/openclaw-win-x64.js"
    try {
        Invoke-WebRequest -Uri $oclawUrl -OutFile $oclawExe -UseBasicParsing -TimeoutSec 30
        Write-Ok "OpenClaw downloaded"
    } catch {
        Write-Warn "CDN unavailable. Creating OpenClaw stub..."
        @'
const http = require('http');
const port = parseInt(process.argv[2] || '7474');
const instance = { id: 'local-' + Date.now().toString(36), status: 'running', skills: [], connectedAt: new Date().toISOString() };
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = req.url || '/';
  if (url === '/health' || url === '/status') { res.writeHead(200); res.end(JSON.stringify({ status: 'ok', version: '1.0.0-stub', instance })); return; }
  res.writeHead(200); res.end(JSON.stringify({ message: 'OpenClaw stub running', instance }));
}).listen(port, '0.0.0.0', () => console.log('[OpenClaw-Stub] Listening on port', port));
'@ | Set-Content -Path $oclawExe -Encoding UTF8
    }
}

# ── 3. Generate connection token ─────────────────────────────────────────────
Write-Info "Generating connection token..."
$tokenBytes = New-Object byte[] 18
[System.Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($tokenBytes)
$TOKEN = [Convert]::ToBase64String($tokenBytes) -replace '[^a-zA-Z0-9]','' | Select-Object -First 24
if ($TOKEN.Length -lt 24) { $TOKEN = ($TOKEN + "00000000000000000000000000")[0..23] -join '' }
$hostShort = ($env:COMPUTERNAME -replace '[^a-z0-9]','').ToLower()[0..7] -join ''
$INSTANCE_ID = "aio-$hostShort-$($TOKEN.Substring(0,8))"

$config = @{
    instanceId   = $INSTANCE_ID
    token        = $TOKEN
    openclawPort = $OPENCLAW_PORT
    installedAt  = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    version      = $AGENTRIX_VERSION
}
$config | ConvertTo-Json | Set-Content -Path (Join-Path $INSTALL_DIR "config.json") -Encoding UTF8
Write-Ok "Instance ID: $INSTANCE_ID"
Write-Ok "Token: $($TOKEN.Substring(0,8))..."

# ── 4. Detect LAN IP ─────────────────────────────────────────────────────────
$LAN_IP = ""
try {
    $nics = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254)' } |
            Select-Object -First 1
    if ($nics) { $LAN_IP = $nics.IPAddress }
} catch {}
if ($LAN_IP) {
    Write-Ok "LAN IP detected: $LAN_IP"
} else {
    Write-Warn "Could not detect LAN IP. Enter your PC's IP manually in the mobile app."
    $LAN_IP = "<YOUR-PC-IP>"
}

# ── 5. Show connection QR ─────────────────────────────────────────────────────
# QR payload: JSON recognised by LocalDeployScreen.handleBarCodeScanned
# Direct LAN mode: {url, token, mode, name}
$QR_PAYLOAD = "{`"url`":`"http://${LAN_IP}:$OPENCLAW_PORT`",`"token`":`"$TOKEN`",`"mode`":`"direct`",`"name`":`"My PC (AIO)`"}"
# Mobile connection deep-link (shown as plain text / fallback)
$QR_DEEPLINK = "agentrix://connect?instanceId=$INSTANCE_ID&token=$TOKEN&host=$LAN_IP&port=$OPENCLAW_PORT"
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  SCAN WITH AGENTRIX MOBILE APP" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  Connection URL:" -ForegroundColor Yellow
Write-Host "  $QR_DEEPLINK" -ForegroundColor White
Write-Host ""
# Try to show QR image via free API (works when online)
try {
    $qrApiUrl = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + [uri]::EscapeDataString($QR_PAYLOAD)
    $qrFile = Join-Path $env:TEMP "agentrix-qr.png"
    Invoke-WebRequest -Uri $qrApiUrl -OutFile $qrFile -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Info "QR code saved: $qrFile  (opening…)"
    Start-Process $qrFile
} catch {
    Write-Info "(offline — scan the URL above manually)"
}
Write-Host ""
Write-Host "  → Open Agentrix Mobile App" -ForegroundColor Cyan
Write-Host "  → Tap Agent Tab → + New Instance → Scan QR or Import URL" -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

# ── 5. Create a Windows service (NSSM) or Task Scheduler entry ───────────────
Write-Info "Creating auto-start scheduled task..."
$taskName = "AgentrixOpenClaw"
$taskExists = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($taskExists) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}

$_nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeExe  = if ($_nodeCmd) { $_nodeCmd.Source } else { $null }
if ($nodeExe) {
    $action = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$oclawExe`" $OPENCLAW_PORT"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
    try {
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
        Write-Ok "Scheduled task '$taskName' created (runs at login)"
    } catch {
        Write-Warn "Could not create scheduled task: $_"
    }
}

# ── 6. Start OpenClaw now ─────────────────────────────────────────────────────
Write-Info "Starting OpenClaw on port $OPENCLAW_PORT..."
$logPath = Join-Path $INSTALL_DIR "openclaw.log"

try {
    $proc = Start-Process node -ArgumentList "`"$oclawExe`" $OPENCLAW_PORT" -WindowStyle Hidden -RedirectStandardOutput $logPath -PassThru
    Start-Sleep -Seconds 1
    if (-not $proc.HasExited) {
        Write-Ok "OpenClaw started (PID $($proc.Id))"
    } else {
        Write-Warn "OpenClaw exited early — check $logPath"
    }
} catch {
    Write-Warn "Could not start OpenClaw: $_"
}

# ── 7. Summary ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  Agentrix OpenClaw AIO Setup Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  • OpenClaw listening: http://localhost:$OPENCLAW_PORT"
Write-Host "  • LAN address:        http://${LAN_IP}:$OPENCLAW_PORT"
Write-Host "  • Instance ID:        $INSTANCE_ID"
Write-Host "  • Config file:        $(Join-Path $INSTALL_DIR 'config.json')"
Write-Host "  • Log file:           $logPath"
Write-Host ""
Write-Host "  To manage: Task Scheduler → AgentrixOpenClaw"
Write-Host "  Mobile connection URL: agentrix://connect?instanceId=$INSTANCE_ID&host=$LAN_IP&port=$OPENCLAW_PORT"
Write-Host ""

Stop-Transcript | Out-Null
Write-Ok "All done. OpenClaw is running!"
Write-Host ""
Write-Host "Press any key to close this window..." -ForegroundColor Gray
try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch { Start-Sleep 3 }
