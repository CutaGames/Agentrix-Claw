# Fresh-Install Check — Sprint G-1 / US-G1-2
#
# Wipes Agentrix Desktop user state and re-installs the freshly-built NSIS
# package, then prints the checklist the human tester needs to verify.
#
# Usage (run as the test user, NOT admin):
#   pwsh desktop/scripts/fresh-install-check.ps1
#
# The script will:
#   1. Kill any running agentrix-desktop.exe
#   2. Uninstall existing Agentrix Desktop (best-effort)
#   3. Wipe %APPDATA%/Agentrix Desktop and the registry uninstall key
#   4. Run the NSIS installer in /S silent mode
#   5. Launch the new install
#   6. Print the human checklist
#
# Exit codes: 0 = ready for human verification, non-zero = setup failed.

$ErrorActionPreference = "Stop"

$repo = (Resolve-Path "$PSScriptRoot/../..").Path
$installer = Join-Path $repo "desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.1.2_x64-setup.exe"
if (-not (Test-Path $installer)) {
    $alt = Get-ChildItem "$repo/desktop/src-tauri/target/release/bundle/nsis/" -Filter "Agentrix Desktop_*_x64-setup.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($alt) {
        $installer = $alt.FullName
        Write-Host "Using latest installer: $installer"
    } else {
        Write-Error "No NSIS installer found. Run 'npm run tauri build' first."
        exit 1
    }
}

Write-Host "==> 1/6 Killing any running agentrix-desktop.exe..."
Get-Process -Name "agentrix-desktop" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force
    Write-Host "    killed PID $($_.Id)"
}
Start-Sleep -Seconds 2

Write-Host "==> 2/6 Uninstalling existing Agentrix Desktop (best-effort)..."
$uninstallKey = Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\" -ErrorAction SilentlyContinue |
    Where-Object { (Get-ItemProperty -Path $_.PsPath -Name DisplayName -ErrorAction SilentlyContinue).DisplayName -like "Agentrix Desktop*" } |
    Select-Object -First 1
if ($uninstallKey) {
    $uninstaller = (Get-ItemProperty -Path $uninstallKey.PsPath -Name UninstallString).UninstallString
    if ($uninstaller) {
        Write-Host "    found uninstaller: $uninstaller"
        try {
            $args = "/S"
            $cmd, $rest = ($uninstaller -split ' ', 2)
            Start-Process -FilePath $cmd.Trim('"') -ArgumentList $args -Wait
            Write-Host "    uninstall complete"
        } catch {
            Write-Warning "    uninstall returned: $($_.Exception.Message)"
        }
    }
} else {
    Write-Host "    no existing install detected"
}
Start-Sleep -Seconds 2

Write-Host "==> 3/6 Wiping %APPDATA%/Agentrix Desktop..."
$appdata = Join-Path $env:APPDATA "Agentrix Desktop"
if (Test-Path $appdata) {
    Remove-Item -Recurse -Force $appdata
    Write-Host "    removed $appdata"
}

Write-Host "==> 4/6 Running NSIS installer in silent mode..."
Start-Process -FilePath $installer -ArgumentList "/S" -Wait
Write-Host "    install complete"

Write-Host "==> 5/6 Launching freshly-installed Agentrix Desktop..."
$installedExe = Join-Path $env:LOCALAPPDATA "Agentrix Desktop\agentrix-desktop.exe"
if (-not (Test-Path $installedExe)) {
    $installedExe = Join-Path "${env:ProgramFiles}" "Agentrix Desktop\agentrix-desktop.exe"
}
if (-not (Test-Path $installedExe)) {
    Write-Warning "Could not locate installed exe; please launch from Start menu and continue with checklist."
} else {
    Start-Process -FilePath $installedExe
    Write-Host "    launched: $installedExe"
}

Write-Host ""
Write-Host "==> 6/6 Human verification checklist (US-G1-2)" -ForegroundColor Cyan
Write-Host ""
Write-Host "[ ] App window appears within 2 seconds (no blank 80×80)"
Write-Host "[ ] SplashScreen visible briefly (purple spinner + 'Agentrix' text)"
Write-Host "[ ] LoginPanel renders with all images / fonts intact"
Write-Host "[ ] Window is at least 480×640 (not collapsed to 80×80)"
Write-Host "[ ] DevTools Network tab shows /pets/kitsune-default.png 200 (not 404)"
Write-Host "[ ] Login with email -> OnboardingPanel renders"
Write-Host "[ ] Complete onboarding -> window resizes to 80×80 + real kitsune PNG"
Write-Host "[ ] Right-click ball -> 'Wardrobe' opens INSIDE the same window (taskbar count = 1)"
Write-Host "[ ] localStorage.agentrix_onboarded_at is set to a unix timestamp"
Write-Host ""
Write-Host "Report results to: tests/reports/fresh-install-$(Get-Date -Format yyyy-MM-dd).md"
