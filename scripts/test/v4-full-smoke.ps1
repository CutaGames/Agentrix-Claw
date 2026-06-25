# V4 Full smoke against production — Sprint M-P2 + W-3 + Desktop GA closure.
# Combined check covering web pages, marketplace, mobile, desktop, AXP redeem, IAP webhook.
param(
    [string]$Base = 'https://agentrix.top'
)
$ErrorActionPreference = 'Continue'
$pass = 0
$fail = 0
$results = @()

$bodyDir = 'tests/reports/smoke-bodies'
function Test-Endpoint {
    param([string]$Name, [string]$Method, [string]$Path, [string]$BodyFile, [int[]]$Expected)
    $url = "$Base$Path"
    $args = @('-s', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '20', $url)
    if ($Method -eq 'POST') {
        $bf = "$bodyDir/$BodyFile"
        if (-not (Test-Path $bf)) {
            Write-Host ("  [FAIL] {0,-32} body file missing: {1}" -f $Name, $bf) -ForegroundColor Red
            $script:fail++
            return
        }
        $args = @('-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', "@$bf") + $args
    }
    $code = & curl.exe @args
    $codeInt = [int]$code
    $ok = $Expected -contains $codeInt
    if ($ok) {
        Write-Host ("  [OK]   {0,-32} {1,-5} {2,-44} -> {3}" -f $Name, $Method, $Path, $code) -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host ("  [FAIL] {0,-32} {1,-5} {2,-44} -> {3} (expect {4})" -f $Name, $Method, $Path, $code, ($Expected -join ',')) -ForegroundColor Red
        $script:fail++
    }
    $script:results += @{ name = $Name; path = $Path; method = $Method; code = $codeInt; ok = $ok }
}

Write-Host "V4 Full Smoke against $Base" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════════════════════"

Write-Host "`n## Web pages (public)" -ForegroundColor Yellow
Test-Endpoint 'home'              GET  '/' '' @(200)
Test-Endpoint 'pricing'           GET  '/pricing' '' @(200)
Test-Endpoint 'download'          GET  '/download' '' @(200)
Test-Endpoint 'market'            GET  '/market' '' @(200)
Test-Endpoint 'market-leaderboard' GET '/market/leaderboard' '' @(200)
Test-Endpoint 'market-sell'       GET  '/market/sell' '' @(200)
Test-Endpoint 'market-auction'    GET  '/market/auction/dummy-id' '' @(200)
Test-Endpoint 'market-creator'    GET  '/market/creator/dummy-user' '' @(200)
Test-Endpoint 'help-index'        GET  '/help' '' @(200)
Test-Endpoint 'help-desktop'      GET  '/help/desktop' '' @(200)
Test-Endpoint 'help-faq'          GET  '/help/desktop/faq' '' @(200)
Test-Endpoint 'privacy'           GET  '/privacy' '' @(200)
Test-Endpoint 'terms'             GET  '/terms' '' @(200)
Test-Endpoint 'clan'              GET  '/clan' '' @(200, 308)
Test-Endpoint 'clans'             GET  '/clans' '' @(200)
Test-Endpoint 'blog'              GET  '/blog' '' @(200)
Test-Endpoint '500-direct'        GET  '/500' '' @(500)
Test-Endpoint '404-unknown'       GET  '/this-does-not-exist-zxy' '' @(404)
Test-Endpoint 'showcase'          GET  '/showcase' '' @(200, 307)
Test-Endpoint 'about'             GET  '/about' '' @(200)

Write-Host "`n## Asset linking (mobile)" -ForegroundColor Yellow
Test-Endpoint 'assetlinks'        GET  '/.well-known/assetlinks.json' '' @(200)
Test-Endpoint 'aasa'              GET  '/.well-known/apple-app-site-association' '' @(200)

Write-Host "`n## Marketplace public APIs" -ForegroundColor Yellow
Test-Endpoint 'pets-browse'       GET  '/api/v1/marketplace/pets' '' @(200)
Test-Endpoint 'pets-leaderboard'  GET  '/api/v1/marketplace/leaderboard?board=gmv' '' @(200)
Test-Endpoint 'pets-detail-fake'  GET  '/api/v1/marketplace/pets/00000000-0000-0000-0000-000000000000' '' @(404, 200)

Write-Host "`n## Auth-guarded APIs (should 401)" -ForegroundColor Yellow
Test-Endpoint 'axp-redeem-cat'    GET  '/api/v1/axp/redeem/catalog' '' @(401)
Test-Endpoint 'checkout-session'  POST '/api/v1/checkout/session' 'empty-object.json' @(401)
Test-Endpoint 'checkout-pi'       POST '/api/v1/checkout/payment-intent' 'empty-object.json' @(401)
Test-Endpoint 'axp-balance'       GET  '/api/v1/axp/balance' '' @(401)

Write-Host "`n## Public APIs that fail-closed in prod" -ForegroundColor Yellow
Test-Endpoint 'iap-webhook'       POST '/api/v1/payment/iap-webhook' 'iap-webhook.json' @(401)

Write-Host "`n## Mobile analytics ingest" -ForegroundColor Yellow
Test-Endpoint 'mobile-analytics'  POST '/api/v1/mobile/analytics' 'mobile-analytics.json' @(202)

Write-Host "`n## Desktop lifecycle" -ForegroundColor Yellow
Test-Endpoint 'desktop-analytics' POST '/api/desktop/analytics' 'desktop-analytics.json' @(202)
Test-Endpoint 'desktop-crashes'   POST '/api/desktop/crashes' 'desktop-crashes.json' @(202)
Test-Endpoint 'desktop-update'    GET  '/api/desktop/update/win/x64/0.1.0' '' @(204, 200)

Write-Host "`n## Marketplace public auctions endpoint" -ForegroundColor Yellow
Test-Endpoint 'pets-bids-fake'    GET  '/api/v1/marketplace/pets/00000000-0000-0000-0000-000000000000/bids' '' @(200, 404)

Write-Host "`n════════════════════════════════════════════════════════════════════════════════"
Write-Host ("Total: pass={0} fail={1}" -f $pass, $fail) -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Yellow' })

# Write a JSON report
$today = (Get-Date).ToString('yyyy-MM-dd_HH-mm')
$reportPath = "tests/reports/V4_SMOKE_${today}.json"
$report = @{ date = (Get-Date).ToString('o'); base = $Base; pass = $pass; fail = $fail; total = $pass + $fail; results = $results }
$report | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $reportPath
Write-Host "[OK] Report: $reportPath"

exit $fail
