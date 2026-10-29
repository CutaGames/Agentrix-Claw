# Desktop V4 Full Audit Test Runner
# Runs all desktop E2E tests and generates a JSON report
#
# Usage:
#   cd desktop
#   powershell -ExecutionPolicy Bypass -File tests/run-v4-audit.ps1
#
# Prerequisites:
#   - npm run dev running (or exe with --remote-debugging-port=9222)
#   - npx playwright install chromium

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$reportDir = "tests/reports/v4-desktop-$timestamp"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Agentrix Desktop V4 Full Audit Test Run" -ForegroundColor Cyan
Write-Host "  $timestamp" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if dev server is running
$devServerUp = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:1420" -TimeoutSec 3 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $devServerUp = $true }
} catch {}

# Check if CDP is available
$cdpUp = $false
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:9222/json/version" -TimeoutSec 3 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $cdpUp = $true }
} catch {}

if (-not $devServerUp -and -not $cdpUp) {
    Write-Host "[WARN] Neither dev server (1420) nor CDP (9222) is reachable." -ForegroundColor Yellow
    Write-Host "       Tests will attempt to start dev server via playwright config." -ForegroundColor Yellow
    Write-Host ""
}

$results = @()
$totalPass = 0
$totalFail = 0
$totalSkip = 0

# Test specs to run
$specs = @(
    @{ name = "V4 Full Audit (Base)"; file = "tests/e2e/v4-full-audit.spec.ts" },
    @{ name = "V4 Panels Deep"; file = "tests/e2e/v4-panels-deep.spec.ts" }
)

foreach ($spec in $specs) {
    Write-Host "─── Running: $($spec.name) ───" -ForegroundColor Yellow
    $startTime = Get-Date

    $output = npx playwright test $spec.file --config=tests/playwright.config.ts --reporter=json 2>&1
    $exitCode = $LASTEXITCODE
    $duration = ((Get-Date) - $startTime).TotalSeconds

    # Parse JSON output for pass/fail counts
    $jsonOutput = $output | Where-Object { $_ -match '^\{' } | Out-String
    $passed = 0
    $failed = 0
    $skipped = 0

    if ($jsonOutput) {
        try {
            $parsed = $jsonOutput | ConvertFrom-Json
            if ($parsed.stats) {
                $passed = $parsed.stats.expected
                $failed = $parsed.stats.unexpected
                $skipped = $parsed.stats.skipped
            }
        } catch {}
    }

    # Fallback: count from text output
    if ($passed -eq 0 -and $failed -eq 0) {
        $passMatch = ($output | Select-String -Pattern "(\d+) passed").Matches
        $failMatch = ($output | Select-String -Pattern "(\d+) failed").Matches
        $skipMatch = ($output | Select-String -Pattern "(\d+) skipped").Matches
        if ($passMatch) { $passed = [int]$passMatch[0].Groups[1].Value }
        if ($failMatch) { $failed = [int]$failMatch[0].Groups[1].Value }
        if ($skipMatch) { $skipped = [int]$skipMatch[0].Groups[1].Value }
    }

    $status = if ($exitCode -eq 0) { "PASS" } else { "FAIL" }
    $statusColor = if ($exitCode -eq 0) { "Green" } else { "Red" }

    Write-Host "  [$status] $($spec.name): $passed passed, $failed failed, $skipped skipped ($([math]::Round($duration, 1))s)" -ForegroundColor $statusColor

    $totalPass += $passed
    $totalFail += $failed
    $totalSkip += $skipped

    $results += @{
        name = $spec.name
        file = $spec.file
        passed = $passed
        failed = $failed
        skipped = $skipped
        duration = [math]::Round($duration, 1)
        status = $status
        output = ($output | Select-Object -Last 30) -join "`n"
    }
}

# Generate report
$report = @{
    date = $timestamp
    platform = "desktop"
    profile = "v4-full-audit"
    summary = "$totalPass/$($totalPass + $totalFail) ($([math]::Round($totalPass / [math]::Max(1, $totalPass + $totalFail) * 100))%)"
    totalPassed = $totalPass
    totalFailed = $totalFail
    totalSkipped = $totalSkip
    results = $results
}

$reportJson = $report | ConvertTo-Json -Depth 4
$reportJson | Out-File -FilePath "$reportDir/summary.json" -Encoding utf8

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  SUMMARY: $($report.summary)" -ForegroundColor $(if ($totalFail -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Passed: $totalPass | Failed: $totalFail | Skipped: $totalSkip" -ForegroundColor Gray
Write-Host "  Report: $reportDir/summary.json" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan

exit $(if ($totalFail -eq 0) { 0 } else { 1 })
