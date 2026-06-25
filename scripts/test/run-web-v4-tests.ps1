# Web Frontend V4 Full Test Runner
# Runs all web E2E tests against the frontend dev server and generates a JSON report
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/test/run-web-v4-tests.ps1
#
# Prerequisites:
#   - cd frontend && npm run dev (http://127.0.0.1:3000)
#   - npx playwright install chromium

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$reportDir = "tests/reports/v4-web-$timestamp"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Agentrix Web V4 Full E2E Test Run" -ForegroundColor Cyan
Write-Host "  $timestamp" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if frontend dev server is running
$frontendUp = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -TimeoutSec 5 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $frontendUp = $true }
} catch {}

if (-not $frontendUp) {
    Write-Host "[WARN] Frontend dev server (127.0.0.1:3000) is NOT running." -ForegroundColor Yellow
    Write-Host "       Please start it: cd frontend && npm run dev" -ForegroundColor Yellow
    Write-Host ""
}

$results = @()
$totalPass = 0
$totalFail = 0
$totalSkip = 0

# Test specs to run
$specs = @(
    @{ name = "Backend API Smoke"; file = "tests/e2e/backend-api-smoke.spec.ts" },
    @{ name = "Web V4 Full (Base)"; file = "tests/e2e/frontend/web-v4-full.spec.ts" },
    @{ name = "Web V4 Deep"; file = "tests/e2e/frontend/web-v4-deep.spec.ts" }
)

foreach ($spec in $specs) {
    Write-Host "─── Running: $($spec.name) ───" -ForegroundColor Yellow
    $startTime = Get-Date

    $configFile = "tests/e2e/playwright.frontend.config.ts"
    if ($spec.file -match "backend-api") {
        $configFile = "tests/e2e/playwright.config.ts"
    }

    $output = npx playwright test $spec.file -c $configFile --reporter=list 2>&1
    $exitCode = $LASTEXITCODE
    $duration = ((Get-Date) - $startTime).TotalSeconds

    # Count from text output
    $passed = 0; $failed = 0; $skipped = 0
    $passMatch = ($output | Select-String -Pattern "(\d+) passed").Matches
    $failMatch = ($output | Select-String -Pattern "(\d+) failed").Matches
    $skipMatch = ($output | Select-String -Pattern "(\d+) skipped").Matches
    if ($passMatch) { $passed = [int]$passMatch[0].Groups[1].Value }
    if ($failMatch) { $failed = [int]$failMatch[0].Groups[1].Value }
    if ($skipMatch) { $skipped = [int]$skipMatch[0].Groups[1].Value }

    $status = if ($exitCode -eq 0) { "PASS" } else { "FAIL" }
    $statusColor = if ($exitCode -eq 0) { "Green" } else { "Red" }

    Write-Host "  [$status] $($spec.name): $passed passed, $failed failed ($([math]::Round($duration, 1))s)" -ForegroundColor $statusColor

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
    }
}

# Generate report
$total = $totalPass + $totalFail
$pct = if ($total -gt 0) { [math]::Round($totalPass / $total * 100) } else { 0 }
$report = @{
    date = $timestamp
    platform = "web"
    profile = "v4-full"
    summary = "$totalPass/$total ($pct%)"
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
