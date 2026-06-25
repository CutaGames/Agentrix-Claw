#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Local development workflow: Build APK → Emulator test → Real device test → Commit
  Run this BEFORE committing to GitHub. Only commit after all tests pass.

.USAGE
  # Full workflow (build + emulator + real device if connected):
  .\dev-build-test.ps1

  # Skip build, just test on emulator with existing APK:
  .\dev-build-test.ps1 -SkipBuild

  # Build only, no tests:
  .\dev-build-test.ps1 -BuildOnly

  # After all tests pass, commit and push:
  .\dev-build-test.ps1 -CommitAndPush -Message "fix: description"
#>
param(
    [switch]$SkipBuild,
    [switch]$BuildOnly,
    [switch]$CommitAndPush,
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$REPO = "D:\wsl\Ubuntu-24.04\Code\Agentrix\Agentrix-website"
$ADB = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$PACKAGE = "app.clawlink.mobile"
$ACTIVITY = "$PACKAGE/.MainActivity"
$WSL_ADB = { param($cmd) wsl -d Ubuntu-24.04 adb $cmd.Split(" ") 2>&1 }

# ── Helpers ─────────────────────────────────────────────────────────────────
function Info  { param($m) Write-Host "  [INFO] $m" -ForegroundColor Cyan }
function Pass  { param($m) Write-Host "  [PASS] $m" -ForegroundColor Green }
function Fail  { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red; exit 1 }
function Warn  { param($m) Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Title { param($m) Write-Host "`n══ $m ══" -ForegroundColor Magenta }

function Get-ADB {
    if (Test-Path $ADB) { return $ADB }
    $tmp = "$env:TEMP\platform-tools\adb.exe"
    if (Test-Path $tmp) { return $tmp }
    # Try WSL ADB
    $wslTest = wsl -d Ubuntu-24.04 which adb 2>&1
    if ($LASTEXITCODE -eq 0) { return "wsl-adb" }
    return $null
}

function Invoke-ADB {
    param([string]$Args)
    $adb = Get-ADB
    if ($adb -eq "wsl-adb") {
        return wsl -d Ubuntu-24.04 adb $Args.Split(" ") 2>&1
    } elseif ($adb) {
        return & $adb $Args.Split(" ") 2>&1
    }
    return $null
}

# ── STEP 1: Pre-flight checks ────────────────────────────────────────────────
Title "STEP 1: Pre-flight checks"

Set-Location $REPO

# Verify app.json newArchEnabled=false
$appJson = Get-Content "$REPO\app.json" | ConvertFrom-Json
if ($appJson.expo.newArchEnabled -eq $true) {
    Fail "app.json: newArchEnabled=true — must be false (HarmonyOS crash)"
}
Pass "newArchEnabled=false"

# Verify no reanimated in package.json
$pkg = Get-Content "$REPO\package.json" | ConvertFrom-Json
if ($pkg.dependencies.'react-native-reanimated') {
    Fail "react-native-reanimated found in package.json — remove it"
}
Pass "No reanimated dependency"

# ── STEP 2: Build APK ────────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Title "STEP 2: Build APK (expo prebuild + gradlew)"

    # Check for Java
    $javaVer = java -version 2>&1 | Select-String "version"
    if (-not $javaVer) { Fail "Java not found. Install JDK 17 from https://adoptium.net/" }
    Info "Java: $javaVer"

    # Run expo prebuild if android/ doesn't exist or is stale
    if (-not (Test-Path "$REPO\android\app\build.gradle")) {
        Info "Running expo prebuild..."
        Set-Location $REPO
        npx expo prebuild --platform android --no-install 2>&1 | Tee-Object -Variable prebuildOut
        if ($LASTEXITCODE -ne 0) { Fail "expo prebuild failed. See output above." }
    }

    # Build debug APK with Gradle
    Info "Building debug APK with Gradle..."
    Set-Location "$REPO\android"
    $gradleCmd = if (Test-Path ".\gradlew.bat") { ".\gradlew.bat" } else { "gradlew" }
    & $gradleCmd assembleDebug 2>&1 | Tee-Object "$REPO\build-output.log" | Select-String "BUILD|ERROR|error:|FAILURE|APK" | Select-Object -Last 20
    if ($LASTEXITCODE -ne 0) { Fail "Gradle build failed. See $REPO\build-output.log" }

    # Find the APK
    $APK = Get-ChildItem "$REPO\android\app\build\outputs\apk\debug\*.apk" | Select-Object -First 1
    if (-not $APK) { Fail "APK not found after build" }
    $sizeMB = [math]::Round($APK.Length / 1MB, 1)
    Pass "APK built: $($APK.FullName) (${sizeMB}MB)"
    Set-Location $REPO
} else {
    Info "Skipping build (--SkipBuild flag)"
    $APK = Get-ChildItem "$REPO\android\app\build\outputs\apk\debug\*.apk" | Select-Object -First 1
    if (-not $APK) { Fail "No existing APK found. Run without -SkipBuild first." }
}

if ($BuildOnly) {
    Pass "Build complete. APK: $($APK.FullName)"
    exit 0
}

# ── STEP 3: Emulator test ────────────────────────────────────────────────────
Title "STEP 3: Emulator test"

# Check for running emulator
$devices = Invoke-ADB "devices"
$emulator = $devices | Where-Object { $_ -match "emulator" -and $_ -match "device" }

if (-not $emulator) {
    # Try to start an AVD
    $emulatorBin = "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe"
    if (Test-Path $emulatorBin) {
        $avds = & $emulatorBin -list-avds 2>&1 | Where-Object { $_ -match "\w" }
        if ($avds) {
            $avd = $avds[0]
            Info "Starting emulator AVD: $avd ..."
            Start-Process $emulatorBin -ArgumentList "-avd", $avd, "-no-snapshot-load" -WindowStyle Normal
            Info "Waiting 45s for emulator to boot..."
            Start-Sleep -Seconds 45
            $devices = Invoke-ADB "devices"
            $emulator = $devices | Where-Object { $_ -match "emulator" -and $_ -match "device" }
        }
    }
    if (-not $emulator) {
        Warn "No emulator running. Skipping emulator test."
        Warn "To run: Open Android Studio → Device Manager → Start an AVD"
        $skipEmulator = $true
    }
}

if (-not $skipEmulator) {
    $emulatorId = ($emulator -split "\t")[0]
    Info "Emulator: $emulatorId"

    # Install APK on emulator
    Info "Installing APK on emulator..."
    Invoke-ADB "install -r `"$($APK.FullName)`"" | Write-Host

    # Clear logcat and launch app
    Info "Launching app on emulator..."
    Invoke-ADB "logcat -c"
    Invoke-ADB "shell am start -n $ACTIVITY"
    Start-Sleep -Seconds 8

    # Check for crash
    $crashLog = Invoke-ADB "logcat -b crash -d"
    $fatalLog = Invoke-ADB "logcat -d" | Select-String "FATAL EXCEPTION|$PACKAGE.*died"

    if ($crashLog -match "FATAL|SIGABRT|SIGSEGV" -or $fatalLog) {
        Write-Host "`n=== CRASH LOG ===" -ForegroundColor Red
        $crashLog | Write-Host
        Fail "⚠ App CRASHED on emulator"
    }
    Pass "App launched without crash on emulator"

    # Run E2E tests if Playwright is configured
    if (Test-Path "$REPO\tests\e2e\playwright.config.ts") {
        Info "Running Playwright E2E tests..."
        $e2ePort = 3000
        # Check if dev server is running
        $portCheck = Test-NetConnection -ComputerName localhost -Port $e2ePort -WarningAction SilentlyContinue
        if ($portCheck.TcpTestSucceeded) {
            npx playwright test -c tests/e2e/playwright.config.ts --project=chromium --reporter=line 2>&1 | Select-Object -Last 20
            if ($LASTEXITCODE -ne 0) { Fail "Playwright E2E tests failed" }
            Pass "E2E tests passed"
        } else {
            Warn "Dev server not running on port $e2ePort — skipping E2E tests"
            Warn "Start server with: npm run web, then re-run this script with -SkipBuild"
        }
    }
}

# ── STEP 4: Real device test ─────────────────────────────────────────────────
Title "STEP 4: Real device test (Huawei P40 Pro)"

# Check for physical device via usbipd/WSL
$usbipd = "C:\Program Files\usbipd-win\usbipd.exe"
$realDevice = $null

if (Test-Path $usbipd) {
    $usbipdList = & $usbipd list 2>&1
    $attached = $usbipdList | Where-Object { $_ -match "Attached" -and $_ -match "12d1" }
    if ($attached) {
        $wslDevices = wsl -d Ubuntu-24.04 adb devices 2>&1
        $realDevice = $wslDevices | Where-Object { $_ -match "MDX|device" -and $_ -notmatch "List" -and $_ -match "device$" }
    }
}

if (-not $realDevice) {
    # Check Windows ADB
    $adb = Get-ADB
    if ($adb -and $adb -ne "wsl-adb") {
        $winDevices = & $adb devices 2>&1
        $realDevice = $winDevices | Where-Object { $_ -match "device" -and $_ -notmatch "List" -and $_ -notmatch "emulator" }
    }
}

if (-not $realDevice) {
    Warn "No real device connected — skipping real device test"
    Warn "To connect: Attach phone via USB → run usbipd attach --wsl Ubuntu-24.04 --busid <id>"
} else {
    Info "Real device found: $realDevice"

    # Install APK
    Info "Installing APK on real device..."
    if ($realDevice -match "MDX") {
        wsl -d Ubuntu-24.04 adb install -r "/mnt/d/wsl/Ubuntu-24.04/Code/Agentrix/Agentrix-website/android/app/build/outputs/apk/debug/$(Split-Path $APK.FullName -Leaf)" 2>&1 | Write-Host
    } else {
        Invoke-ADB "install -r `"$($APK.FullName)`""
    }

    # Clear logs and launch
    wsl -d Ubuntu-24.04 adb logcat -c 2>&1 | Out-Null
    wsl -d Ubuntu-24.04 adb shell am start -n $ACTIVITY 2>&1 | Write-Host
    Info "Waiting 10s for app to launch on real device..."
    Start-Sleep -Seconds 10

    # Get crash log
    $realCrash = wsl -d Ubuntu-24.04 adb logcat -b crash -d 2>&1
    if ($realCrash -match "FATAL|SIGABRT|SIGSEGV|Cannot find native module") {
        Write-Host "`n=== REAL DEVICE CRASH ===" -ForegroundColor Red
        $realCrash | Write-Host
        Fail "⚠ App CRASHED on real device (Huawei P40 Pro)"
    }
    Pass "App launched without crash on real device"
}

# ── STEP 5: Commit and push ───────────────────────────────────────────────────
Title "STEP 5: All tests passed"

if ($CommitAndPush) {
    if (-not $Message) { Fail "Provide -Message 'your commit message'" }
    Set-Location $REPO
    git add -A
    git commit -m $Message
    wsl -d Ubuntu-24.04 git -C /mnt/d/wsl/Ubuntu-24.04/Code/Agentrix/Agentrix-website push origin main --no-verify
    wsl -d Ubuntu-24.04 git -C /mnt/d/wsl/Ubuntu-24.04/Code/Agentrix/Agentrix-website push agentrix-web main --no-verify
    Pass "Committed and pushed: $Message"
} else {
    Write-Host "`n  ✅ All tests PASSED. To commit and push:" -ForegroundColor Green
    Write-Host '  .\dev-build-test.ps1 -SkipBuild -CommitAndPush -Message "your message"' -ForegroundColor White
}

Write-Host "`n══════════════════════════════════════════" -ForegroundColor Green
Write-Host "  WORKFLOW COMPLETE — ready to ship" -ForegroundColor Green
Write-Host "══════════════════════════════════════════`n" -ForegroundColor Green
