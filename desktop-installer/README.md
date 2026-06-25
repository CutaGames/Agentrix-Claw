# Agentrix Desktop Installer

The main Windows deliverable is the graphical one-click installer `Agentrix-Claw-Setup.exe`. It launches the GUI wizard, installs the local agent, and shows the QR code for mobile pairing.

Two script variants are also kept in source form for manual setup. All options generate a QR / deep-link for mobile connection.

---

## Windows GUI `.exe`

Build the local Windows installer wrapper from source:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\build-exe.ps1
```

Output:

- `builds/Agentrix-Claw-Setup.exe`

This EXE bundles `Setup.bat`, `install-gui.ps1`, and the official Agentrix logo asset, then launches the installer automatically after extraction.

---

## Version Comparison

| Feature | **Standard** | **AIO (All-in-One)** |
|---------|-------------|---------------------|
| Target user | Developers (Node.js already installed) | Non-technical users / clean machines |
| Installs Node.js | ❌ (requires Node ≥18 pre-installed) | ✅ via nvm / winget |
| Auto-start service | ❌ (manual start via script) | ✅ systemd / LaunchAgent / Task Scheduler |
| Relay QR code | ✅ | ✅ |
| Install size | ~5 MB | ~80 MB |

---

## Standard Edition (for developers)

> **Requires Node.js ≥18** — download at https://nodejs.org

### Linux / macOS
```bash
curl -fsSL https://cdn.agentrix.io/install-standard.sh | bash
# or from source:
bash install-standard.sh
```

### Windows (PowerShell)
```powershell
irm https://cdn.agentrix.io/install-standard.ps1 | iex
# or from source:
Set-ExecutionPolicy Bypass -Scope Process -Force
.\install-standard.ps1
```

---

## AIO Edition (for everyone — no prerequisites)

One-click: installs Node.js runtime, OpenClaw agent, and starts a local Agentrix relay that generates a QR code for mobile connection.

### Linux / macOS
```bash
curl -fsSL https://cdn.agentrix.io/install-aio.sh | bash
# or from source:
bash install-aio.sh
```

### Windows (PowerShell — run as Administrator)
```powershell
irm https://cdn.agentrix.io/install-aio.ps1 | iex
# or from source:
Set-ExecutionPolicy Bypass -Scope Process -Force
.\install-aio.ps1
```

---

## What both versions do
1. Generate a unique instance ID + connection token
2. Show QR code / deep-link URL for mobile app scanning
3. Start the local Agentrix-Claw agent (port 7474 by default)

## Mobile Connection
After running the installer:
1. Open **Agentrix** mobile app
2. Go to **Agent** tab → **+ New Instance**
3. Tap **Import via QR** and scan, or paste the `agentrix://connect?...` URL
4. Your local agent will appear as a connected instance

## Files
| File | Description |
|------|-------------|
| `install-standard.sh` | Standard Linux/macOS installer |
| `install-standard.ps1` | Standard Windows installer |
| `install-aio.sh` | AIO Linux/macOS installer (bundles Node.js) |
| `install-aio.ps1` | AIO Windows installer (bundles Node.js) |
| `build-exe.ps1` | Builds `Agentrix-Claw-Setup.exe` with IExpress |
| `~/.agentrix/config.json` | Instance config (Linux/macOS) |
| `%APPDATA%\Agentrix\config.json` | Instance config (Windows) |

## Uninstall
**Linux/macOS:**
```bash
systemctl --user stop agentrix-openclaw
systemctl --user disable agentrix-openclaw
rm -rf ~/.agentrix
```

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/io.agentrix.openclaw.plist
rm ~/Library/LaunchAgents/io.agentrix.openclaw.plist
rm -rf ~/.agentrix
```

**Windows:**
```powershell
Unregister-ScheduledTask -TaskName AgentrixOpenClaw -Confirm:$false
Remove-Item "$env:APPDATA\Agentrix" -Recurse -Force
```
