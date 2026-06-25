#requires -Version 5.1

[CmdletBinding()]
param(
    [ValidateSet("smoke", "full", "ci", "device")]
    [string]$Profile = "smoke",
    [string]$ReportDir = "",
    [string]$ApiUrl = "https://api.agentrix.top/api",
    [string]$AndroidPackage = "app.agentrix.claw",
    [string]$IosBundleIdentifier = "app.agentrix.claw",
    [switch]$RunApiE2E,
    [switch]$RunExpoWebE2E,
    [switch]$RunAndroidDevice,
    [switch]$RunIosSimulator,
    [switch]$RunDesktopPackage,
    [switch]$SkipMobile,
    [switch]$SkipBackend,
    [switch]$SkipDesktop,
    [switch]$SkipFrontend,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$TimeStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ReportRoot = if ([string]::IsNullOrWhiteSpace($ReportDir)) {
    Join-Path $RepoRoot "tests\reports\full-app-validation-$TimeStamp"
} else {
    $ReportDir
}

$null = New-Item -ItemType Directory -Path $ReportRoot -Force
$script:Results = [System.Collections.Generic.List[object]]::new()

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Add-Result {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Status,
        [int]$ExitCode = 0,
        [string]$LogPath = "",
        [string]$Notes = ""
    )

    $script:Results.Add([pscustomobject]@{
        id = $Id
        title = $Title
        status = $Status
        exitCode = $ExitCode
        logPath = $LogPath
        notes = $Notes
    }) | Out-Null
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Command,
        [hashtable]$Environment = @{}
    )

    $logPath = Join-Path $ReportRoot "$Id.log"
    Write-Section $Title
    Write-Host "cwd: $WorkingDirectory"
    Write-Host "cmd: $Command"

    if ($DryRun) {
        Add-Result -Id $Id -Title $Title -Status "dry-run" -LogPath $logPath
        return
    }

    $oldEnv = @{}
    foreach ($key in $Environment.Keys) {
        $oldEnv[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], "Process")
    }

    Push-Location $WorkingDirectory
    try {
        $redirectedCommand = "$Command > `"$logPath`" 2>&1"
        & cmd.exe /d /s /c $redirectedCommand
        $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
        if (Test-Path $logPath) {
            Get-Content -Path $logPath -Tail 80 | ForEach-Object { Write-Host $_ }
        }
        if ($exitCode -eq 0) {
            Add-Result -Id $Id -Title $Title -Status "passed" -ExitCode $exitCode -LogPath $logPath
        } else {
            Add-Result -Id $Id -Title $Title -Status "failed" -ExitCode $exitCode -LogPath $logPath
        }
    } catch {
        $_ | Out-File -FilePath $logPath -Encoding utf8 -Append
        Add-Result -Id $Id -Title $Title -Status "failed" -ExitCode 1 -LogPath $logPath -Notes $_.Exception.Message
    } finally {
        Pop-Location
        foreach ($key in $Environment.Keys) {
            [Environment]::SetEnvironmentVariable($key, $oldEnv[$key], "Process")
        }
    }
}

function Add-Skipped {
    param([string]$Id, [string]$Title, [string]$Notes)
    Write-Section "$Title (skipped)"
    Write-Host $Notes -ForegroundColor Yellow
    Add-Result -Id $Id -Title $Title -Status "skipped" -Notes $Notes
}

function Test-Tool {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-AndroidSmoke {
    $id = "android-device-smoke"
    $title = "Android device launch smoke"
    $logPath = Join-Path $ReportRoot "$id.log"
    Write-Section $title

    if ($DryRun) {
        Add-Result -Id $id -Title $title -Status "dry-run" -LogPath $logPath
        return
    }

    if (-not (Test-Tool "adb")) {
        Add-Result -Id $id -Title $title -Status "failed" -ExitCode 1 -LogPath $logPath -Notes "adb not found"
        return
    }

    $output = New-Object System.Collections.Generic.List[string]
    try {
        $output.Add("adb devices") | Out-Null
        $output.AddRange((& adb devices 2>&1 | ForEach-Object { [string]$_ }))
        $deviceCount = @(& adb devices 2>&1 | Where-Object { $_ -match "\tdevice$" }).Count
        if ($deviceCount -lt 1) {
            throw "No online Android device found."
        }

        & adb logcat -c | Out-Null
        $output.Add("adb shell monkey -p $AndroidPackage 1") | Out-Null
        $output.AddRange((& adb shell monkey -p $AndroidPackage 1 2>&1 | ForEach-Object { [string]$_ }))
        Start-Sleep -Seconds 6
        $logcat = & adb logcat -d -t 500 2>&1
        $output.AddRange(($logcat | ForEach-Object { [string]$_ }))
        $output | Out-File -FilePath $logPath -Encoding utf8

        $crash = $logcat | Select-String -Pattern "FATAL EXCEPTION|AndroidRuntime|Process $AndroidPackage.*has died|signal 6|signal 11"
        if ($crash) {
            Add-Result -Id $id -Title $title -Status "failed" -ExitCode 1 -LogPath $logPath -Notes "Crash pattern found in logcat."
        } else {
            Add-Result -Id $id -Title $title -Status "passed" -ExitCode 0 -LogPath $logPath
        }
    } catch {
        $output.Add($_.Exception.Message) | Out-Null
        $output | Out-File -FilePath $logPath -Encoding utf8
        Add-Result -Id $id -Title $title -Status "failed" -ExitCode 1 -LogPath $logPath -Notes $_.Exception.Message
    }
}

function Invoke-IosSimulatorSmoke {
    $id = "ios-simulator-smoke"
    $title = "iOS simulator launch smoke"
    $logPath = Join-Path $ReportRoot "$id.log"
    Write-Section $title

    if ($DryRun) {
        Add-Result -Id $id -Title $title -Status "dry-run" -LogPath $logPath
        return
    }

    if (-not (Test-Tool "xcrun")) {
        Add-Result -Id $id -Title $title -Status "failed" -ExitCode 1 -LogPath $logPath -Notes "xcrun not found. Run this step on macOS with Xcode tools."
        return
    }

    try {
        $output = & xcrun simctl launch booted $IosBundleIdentifier 2>&1
        $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
        $output | Out-File -FilePath $logPath -Encoding utf8
        if ($exitCode -eq 0) {
            Add-Result -Id $id -Title $title -Status "passed" -ExitCode 0 -LogPath $logPath
        } else {
            Add-Result -Id $id -Title $title -Status "failed" -ExitCode $exitCode -LogPath $logPath
        }
    } catch {
        $_ | Out-File -FilePath $logPath -Encoding utf8
        Add-Result -Id $id -Title $title -Status "failed" -ExitCode 1 -LogPath $logPath -Notes $_.Exception.Message
    }
}

function Save-Reports {
    $jsonPath = Join-Path $ReportRoot "summary.json"
    $mdPath = Join-Path $ReportRoot "summary.md"
    $script:Results | ConvertTo-Json -Depth 5 | Out-File -FilePath $jsonPath -Encoding utf8

    $passed = @($script:Results | Where-Object { $_.status -eq "passed" }).Count
    $failed = @($script:Results | Where-Object { $_.status -eq "failed" }).Count
    $skipped = @($script:Results | Where-Object { $_.status -eq "skipped" }).Count
    $dryRun = @($script:Results | Where-Object { $_.status -eq "dry-run" }).Count

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("# Agentrix full app validation") | Out-Null
    $lines.Add("") | Out-Null
    $lines.Add("- Profile: $Profile") | Out-Null
    $lines.Add("- API URL: $ApiUrl") | Out-Null
    $lines.Add("- Passed: $passed") | Out-Null
    $lines.Add("- Failed: $failed") | Out-Null
    $lines.Add("- Skipped: $skipped") | Out-Null
    $lines.Add("- Dry run: $dryRun") | Out-Null
    $lines.Add("") | Out-Null
    $lines.Add("| ID | Status | Exit | Log | Notes |") | Out-Null
    $lines.Add("| --- | --- | ---: | --- | --- |") | Out-Null
    foreach ($result in $script:Results) {
        $relativeLog = if ($result.logPath) { Resolve-Path -Path $result.logPath -Relative -ErrorAction SilentlyContinue } else { "" }
        $notes = ([string]$result.notes).Replace("|", "/")
        $lines.Add("| $($result.id) | $($result.status) | $($result.exitCode) | $relativeLog | $notes |") | Out-Null
    }
    $lines | Out-File -FilePath $mdPath -Encoding utf8

    Write-Section "Summary"
    Write-Host "Report: $mdPath"
    Write-Host "JSON:   $jsonPath"
    Write-Host "Passed: $passed; Failed: $failed; Skipped: $skipped; DryRun: $dryRun"

    if ($failed -gt 0) {
        exit 1
    }
}

$effectiveRunApiE2E = $RunApiE2E.IsPresent -or $Profile -eq "full" -or $Profile -eq "ci"
$effectiveRunExpoWebE2E = $RunExpoWebE2E.IsPresent -or $Profile -eq "full"
$effectiveRunAndroidDevice = $RunAndroidDevice.IsPresent -or $Profile -eq "device"
$effectiveRunIosSimulator = $RunIosSimulator.IsPresent -or $Profile -eq "device"

Write-Section "Agentrix full app validation"
Write-Host "Repo: $RepoRoot"
Write-Host "Report: $ReportRoot"
Write-Host "Profile: $Profile"

if (-not $SkipMobile) {
    Invoke-Step -Id "mobile-typecheck" -Title "Mobile TypeScript baseline" -WorkingDirectory $RepoRoot -Command "npm run typecheck:root"
} else {
    Add-Skipped -Id "mobile-typecheck" -Title "Mobile TypeScript baseline" -Notes "-SkipMobile was provided."
}

if (-not $SkipBackend) {
    Invoke-Step -Id "backend-build" -Title "Backend NestJS build" -WorkingDirectory (Join-Path $RepoRoot "backend") -Command "npm run build"
} else {
    Add-Skipped -Id "backend-build" -Title "Backend NestJS build" -Notes "-SkipBackend was provided."
}

if (-not $SkipDesktop) {
    Invoke-Step -Id "desktop-web-build" -Title "Desktop React/Vite build" -WorkingDirectory (Join-Path $RepoRoot "desktop") -Command "npm run build"
} else {
    Add-Skipped -Id "desktop-web-build" -Title "Desktop React/Vite build" -Notes "-SkipDesktop was provided."
}

if (-not $SkipFrontend) {
    Invoke-Step -Id "frontend-next-build" -Title "Frontend Next.js build" -WorkingDirectory (Join-Path $RepoRoot "frontend") -Command "npm run build"
} else {
    Add-Skipped -Id "frontend-next-build" -Title "Frontend Next.js build" -Notes "-SkipFrontend was provided."
}

if ($effectiveRunApiE2E) {
    Invoke-Step -Id "api-cross-platform-e2e" -Title "API cross-platform Playwright regression" -WorkingDirectory $RepoRoot -Command "npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/cross-platform-regression.spec.ts" -Environment @{ API_URL = $ApiUrl }
} else {
    Add-Skipped -Id "api-cross-platform-e2e" -Title "API cross-platform Playwright regression" -Notes "Use -RunApiE2E or -Profile full/ci."
}

if ($effectiveRunExpoWebE2E) {
    Invoke-Step -Id "expo-web-user-journeys" -Title "Expo Web local AI and voice user journeys" -WorkingDirectory $RepoRoot -Command "npm run test:e2e:local-ai-user-flows"
} else {
    Add-Skipped -Id "expo-web-user-journeys" -Title "Expo Web local AI and voice user journeys" -Notes "Use -RunExpoWebE2E or -Profile full."
}

if ($RunDesktopPackage) {
    Invoke-Step -Id "desktop-tauri-package" -Title "Desktop Tauri package build" -WorkingDirectory (Join-Path $RepoRoot "desktop") -Command "npm run tauri -- build"
} else {
    Add-Skipped -Id "desktop-tauri-package" -Title "Desktop Tauri package build" -Notes "Use -RunDesktopPackage when Rust/Tauri build environment is ready."
}

if ($effectiveRunAndroidDevice) {
    Invoke-AndroidSmoke
} else {
    Add-Skipped -Id "android-device-smoke" -Title "Android device launch smoke" -Notes "Use -RunAndroidDevice or -Profile device."
}

if ($effectiveRunIosSimulator) {
    Invoke-IosSimulatorSmoke
} else {
    Add-Skipped -Id "ios-simulator-smoke" -Title "iOS simulator launch smoke" -Notes "Use -RunIosSimulator or -Profile device on macOS."
}

Save-Reports