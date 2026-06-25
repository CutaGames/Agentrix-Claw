# ═══════════════════════════════════════════════════════════════════════════════
# Agentrix V4 Full E2E Test Runner
# ═══════════════════════════════════════════════════════════════════════════════
#
# Usage:
#   .\scripts\test\run-v4-e2e-full.ps1 [-Profile <smoke|full|hardware>]
#
# Profiles:
#   smoke    — Backend API + Web pages (CI-friendly, ~3 min)
#   full     — All automated tests (Desktop + Web + Mobile, ~20 min)
#   hardware — Hardware tests only (Watch + Toy + Glass, ~10 min)
#
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [ValidateSet("smoke", "full", "hardware")]
    [string]$Profile = "smoke"
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$reportDir = "tests\reports\v4-e2e-$timestamp"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Agentrix V4 E2E Test Suite — Profile: $Profile" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$results = @()

function Run-Test {
    param([string]$Name, [string]$Command)
    
    Write-Host ">> $Name" -ForegroundColor Yellow
    $start = Get-Date
    
    try {
        $output = Invoke-Expression $Command 2>&1
        $exitCode = $LASTEXITCODE
        $duration = ((Get-Date) - $start).TotalSeconds
        
        if ($exitCode -eq 0) {
            Write-Host "  [PASS] ($([math]::Round($duration, 1))s)" -ForegroundColor Green
            $script:results += @{ name = $Name; passed = $true; duration = $duration }
        } else {
            Write-Host "  [FAIL] (exit code: $exitCode, $([math]::Round($duration, 1))s)" -ForegroundColor Red
            $script:results += @{ name = $Name; passed = $false; duration = $duration; output = ($output | Select-Object -Last 20) -join "`n" }
        }
    } catch {
        $duration = ((Get-Date) - $start).TotalSeconds
        Write-Host "  [ERROR] $_" -ForegroundColor Red
        $script:results += @{ name = $Name; passed = $false; duration = $duration; error = $_.ToString() }
    }
    Write-Host ""
}

# ─── SMOKE PROFILE ───────────────────────────────────────────────────────────

if ($Profile -eq "smoke" -or $Profile -eq "full") {
    Write-Host "── Backend API Smoke ──────────────────────────────" -ForegroundColor Magenta
    Run-Test "Backend API Smoke" "npx playwright test tests/e2e/backend-api-smoke.spec.ts -c tests/e2e/playwright.config.ts --reporter=list"
    
    Write-Host "── Web Frontend Pages ─────────────────────────────" -ForegroundColor Magenta
    Run-Test "Web V4 Full" "npx playwright test tests/e2e/frontend/web-v4-full.spec.ts -c tests/e2e/playwright.frontend.config.ts --reporter=list"
}

# ─── FULL PROFILE ────────────────────────────────────────────────────────────

if ($Profile -eq "full") {
    Write-Host "── Desktop E2E ────────────────────────────────────" -ForegroundColor Magenta
    Run-Test "Desktop V4 Audit" "npx playwright test desktop/tests/e2e/v4-full-audit.spec.ts -c desktop/tests/playwright.config.ts --reporter=list"
    
    Write-Host "── Mobile Maestro ─────────────────────────────────" -ForegroundColor Magenta
    Run-Test "Mobile 4-Tab Smoke" "maestro test .maestro/10-4tab-smoke.yaml"
    Run-Test "Mobile V4 Home" "maestro test .maestro/20-v4-home-full.yaml"
    Run-Test "Mobile V4 Summon" "maestro test .maestro/21-v4-summon-chat.yaml"
    Run-Test "Mobile V4 Plaza" "maestro test .maestro/22-v4-plaza-full.yaml"
    Run-Test "Mobile V4 Me/AXP" "maestro test .maestro/23-v4-me-axp-subscribe.yaml"
    Run-Test "Mobile V4 PetCreator" "maestro test .maestro/24-v4-pet-creator-wardrobe.yaml"
    Run-Test "Mobile V4 Inbox/DeepLink" "maestro test .maestro/25-v4-global-inbox-deeplink.yaml"
    Run-Test "Mobile V4 CoRaising" "maestro test .maestro/26-v4-coraising-greeting.yaml"
}

# ─── HARDWARE PROFILE ────────────────────────────────────────────────────────

if ($Profile -eq "hardware") {
    Write-Host "── Hardware Tests ─────────────────────────────────" -ForegroundColor Magenta
    Run-Test "Watch E2E (ADB)" "node tests/hardware/watch-e2e.mjs"
    Run-Test "Toy BLE E2E (ClawCore)" "node tests/hardware/toy-ble-e2e.mjs"
    Run-Test "Glass HUD E2E" "node tests/hardware/glass-hud-e2e.mjs"
}

# ─── REPORT ──────────────────────────────────────────────────────────────────

Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$passed = ($results | Where-Object { $_.passed }).Count
$total = $results.Count
$pct = if ($total -gt 0) { [math]::Round($passed / $total * 100) } else { 0 }

foreach ($r in $results) {
    $icon = if ($r.passed) { "[PASS]" } else { "[FAIL]" }
    $dur = [math]::Round($r.duration, 1)
    Write-Host "  $icon $($r.name) ($dur`s)"
}

Write-Host ""
Write-Host "  Total: $passed / $total ($pct%)" -ForegroundColor $(if ($pct -ge 80) { "Green" } elseif ($pct -ge 50) { "Yellow" } else { "Red" })
Write-Host ""

# Save JSON report
$report = @{
    date = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    profile = $Profile
    summary = "$passed/$total ($pct%)"
    results = $results
}
$report | ConvertTo-Json -Depth 5 | Out-File "$reportDir\summary.json" -Encoding UTF8
Write-Host "📊 Report: $reportDir\summary.json" -ForegroundColor Gray
