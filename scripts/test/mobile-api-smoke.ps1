# Mobile API smoke test — Sprint M-P0/P1/P2 endpoints.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/test/mobile-api-smoke.ps1
param(
    [string]$Base = 'https://agentrix.top'
)
$ErrorActionPreference = 'Continue'
$pass = 0
$fail = 0

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Path,
        [string]$Body,
        [int[]]$Expected
    )
    $url = "$Base$Path"
    $args = @('-s', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '15', $url)
    if ($Method -eq 'POST') {
        $args = @('-X', 'POST', '-H', 'Content-Type: application/json', '--data-raw', $Body) + $args
    }
    $code = & curl.exe @args
    $codeInt = [int]$code
    if ($Expected -contains $codeInt) {
        Write-Host ("  [OK]   {0,-5} {1,-50} -> {2}" -f $Method, $Path, $code) -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host ("  [FAIL] {0,-5} {1,-50} -> {2} (expected {3})" -f $Method, $Path, $code, ($Expected -join ',')) -ForegroundColor Red
        $script:fail++
    }
}

Write-Host "Mobile API smoke against $Base" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────"

# Asset linking
Test-Endpoint -Method GET -Path '/.well-known/assetlinks.json' -Expected @(200)
Test-Endpoint -Method GET -Path '/.well-known/apple-app-site-association' -Expected @(200)

# AXP redeem (requires auth — should 401)
Test-Endpoint -Method GET -Path '/api/v1/axp/redeem/catalog' -Expected @(401)
Test-Endpoint -Method POST -Path '/api/v1/axp/redeem' -Body '{"item_id":"sub_discount_5"}' -Expected @(401)

# Mobile Stripe Checkout (requires auth — should 401)
Test-Endpoint -Method POST -Path '/api/v1/checkout/session' -Body '{}' -Expected @(401)
Test-Endpoint -Method POST -Path '/api/v1/checkout/payment-intent' -Body '{}' -Expected @(401)

# IAP webhook (Public, but signature-checked in prod — 401 fail-closed)
Test-Endpoint -Method POST -Path '/api/v1/payment/iap-webhook' -Body '{"event":{"type":"INITIAL_PURCHASE"}}' -Expected @(401)

# Mobile analytics (Public, accepts batch)
$ev = '{\"events\":[{\"deviceId\":\"smoke-device\",\"sessionId\":\"smoke-session\",\"eventName\":\"mobile_launch\",\"appVersion\":\"1.1.0\",\"osPlatform\":\"android_14\",\"occurredAt\":1747363200000}]}'
Test-Endpoint -Method POST -Path '/api/v1/mobile/analytics' -Body $ev -Expected @(202)

# Marketplace public endpoints (sanity)
Test-Endpoint -Method GET -Path '/api/v1/marketplace/leaderboard?board=gmv' -Expected @(200)
Test-Endpoint -Method GET -Path '/api/v1/marketplace/pets' -Expected @(200)

Write-Host "─────────────────────────────────────────────────────"
Write-Host ("Total: pass={0} fail={1}" -f $pass, $fail) -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Yellow' })
exit $fail
