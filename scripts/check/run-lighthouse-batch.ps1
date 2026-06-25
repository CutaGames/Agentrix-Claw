# Run Lighthouse against P0 URLs and write report.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/check/run-lighthouse-batch.ps1 [-FormFactor mobile|desktop]
param(
  [ValidateSet('mobile','desktop')]
  [string]$FormFactor = 'mobile',
  [string]$BaseUrl = 'https://agentrix.top'
)

$ErrorActionPreference = 'Continue'
$urls = @(
  '/',
  '/pricing',
  '/download',
  '/market',
  '/market/leaderboard',
  '/help/desktop',
  '/privacy',
  '/terms'
)

$outDir = 'tests/reports/lh'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$results = @()
foreach ($p in $urls) {
  $url = "$BaseUrl$p"
  $slug = ($p -replace '/', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($slug)) { $slug = 'home' }
  $jsonOut = "$outDir/$slug-$FormFactor.json"
  Write-Host "  $p ..." -NoNewline
  $args = @(
    '--yes', '-p', 'lighthouse@12', 'lighthouse', $url, '--quiet',
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
    '--output=json', "--form-factor=$FormFactor",
    '--throttling-method=simulate',
    '--max-wait-for-load=45000',
    "--output-path=$jsonOut"
  )
  & npx @args 2>$null | Out-Null
  if (Test-Path $jsonOut) {
    $summary = node scripts/check/parse-lighthouse.mjs $jsonOut | ConvertFrom-Json
    $results += $summary
    Write-Host "  perf=$($summary.perf) lcp=$([Math]::Round($summary.lcpMs/1000,1))s tbt=$($summary.tbtMs)ms"
  } else {
    Write-Host "  FAIL"
  }
}

$today = (Get-Date).ToString('yyyy-MM-dd')
$mdPath = "tests/reports/LIGHTHOUSE_${FormFactor}_${today}.md"

$lines = @()
$lines += "# Lighthouse Audit · $FormFactor · $today"
$lines += ''
$lines += "> Base URL: ``$BaseUrl``"
$lines += ''
$lines += '## GA targets'
$lines += ''
$lines += '- Performance score >= **80**'
$lines += '- LCP < **2.5s**'
$lines += '- TBT < **200ms**'
$lines += '- CLS < **0.1**'
$lines += ''
$lines += '## Results'
$lines += ''
$lines += '| Path | Perf | A11y | BP | SEO | LCP | FCP | TBT | CLS | TTI | Bytes |'
$lines += '| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |'
foreach ($r in $results) {
  $path = $r.url -replace [regex]::Escape($BaseUrl), ''
  if ([string]::IsNullOrEmpty($path)) { $path = '/' }
  $perfBadge = if ($r.perf -ge 80) { '[OK]' } elseif ($r.perf -ge 50) { '[~]' } else { '[!!]' }
  $lcpBadge  = if ($r.lcpMs -lt 2500) { '[OK]' } elseif ($r.lcpMs -lt 4000) { '[~]' } else { '[!!]' }
  $tbtBadge  = if ($r.tbtMs -lt 200)  { '[OK]' } elseif ($r.tbtMs -lt 600)  { '[~]' } else { '[!!]' }
  $clsBadge  = if ($r.cls   -lt 0.1)  { '[OK]' } elseif ($r.cls   -lt 0.25) { '[~]' } else { '[!!]' }
  $bytesKB = [Math]::Round($r.totalBytes / 1024)
  $lines += ("| ``$path`` | $perfBadge $($r.perf) | $($r.a11y) | $($r.bp) | $($r.seo) | $lcpBadge $([Math]::Round($r.lcpMs/1000,1))s | $([Math]::Round($r.fcpMs/1000,1))s | $tbtBadge $($r.tbtMs)ms | $clsBadge $($r.cls) | $([Math]::Round($r.ttiMs/1000,1))s | ${bytesKB}KB |")
}

if ($results.Count -gt 0) {
  $avgPerf = [Math]::Round(($results | Measure-Object perf -Average).Average)
  $avgLcp  = ($results | Measure-Object lcpMs -Average).Average
  $avgTbt  = ($results | Measure-Object tbtMs -Average).Average
  $avgCls  = ($results | Measure-Object cls -Average).Average
  $lines += ''
  $lines += '## Summary'
  $lines += ''
  $lines += "- Avg perf: **$avgPerf**"
  $lines += "- Avg LCP:  **$([Math]::Round($avgLcp/1000,2))s**"
  $lines += "- Avg TBT:  **$([Math]::Round($avgTbt))ms**"
  $lines += "- Avg CLS:  **$([Math]::Round($avgCls,3))**"
}

$lines | Set-Content -Encoding UTF8 $mdPath
Write-Host "`n[OK] Wrote $mdPath"
