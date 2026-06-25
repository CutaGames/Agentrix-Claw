# E2E smoke: production web pages + API endpoints (Sprint G-3 round)
$results = @()

$webPages = @(
  @{Path='/'; Expect=@(200)},
  @{Path='/download'; Expect=@(200)},
  @{Path='/admin/desktop'; Expect=@(200)},
  @{Path='/pricing'; Expect=@(200)},
  @{Path='/showcase'; Expect=@(200,307,308)},  # i18n redirect possible
  @{Path='/market'; Expect=@(200)},
  @{Path='/console'; Expect=@(200,307,308)},  # i18n redirect possible
  @{Path='/about'; Expect=@(200)},
  @{Path='/hardware'; Expect=@(200)},
  @{Path='/marketplace/pets'; Expect=@(200)},
  @{Path='/clan'; Expect=@(200,301,302,307,308)},  # redirect to /clans
  @{Path='/help'; Expect=@(200)},
  @{Path='/help/desktop'; Expect=@(200)},
  @{Path='/help/desktop/faq'; Expect=@(200)},
  @{Path='/p/test-pet'; Expect=@(404)},  # 404 expected — pet does not exist
  @{Path='/blog'; Expect=@(200)}
)
foreach ($w in $webPages) {
  $path = $w.Path
  try {
    $r = Invoke-WebRequest "https://agentrix.top$path" -Method Head -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0
    $code = $r.StatusCode
  } catch {
    $code = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { 'ERR' }
  }
  $pass = $w.Expect -contains $code
  $results += [pscustomobject]@{ Type='Web'; Path=$path; Status=$code; Result=$(if($pass){'PASS'}else{'FAIL'}) }
}

$apiTests = @(
  @{Method='GET';Path='/desktop/update/windows/x86_64/0.0.1';Expect=@(200,204)},
  @{Method='POST';Path='/desktop/download/track';Body='{"utmSource":"e2e-test"}';Expect=@(202)},
  @{Method='POST';Path='/desktop/analytics';Body='{"events":[]}';Expect=@(202)},
  @{Method='POST';Path='/desktop/crashes';Body='{"items":[]}';Expect=@(202)},
  @{Method='GET';Path='/admin/desktop/dashboard?days=7';Expect=@(401)}
)
foreach ($t in $apiTests) {
  try {
    $params = @{Uri="https://api.agentrix.top/api$($t.Path)";Method=$t.Method;UseBasicParsing=$true;TimeoutSec=10}
    if ($t.Body) { $params.Body = $t.Body; $params.ContentType = 'application/json' }
    $r = Invoke-WebRequest @params -ErrorAction Stop
    $pass = $t.Expect -contains $r.StatusCode
    $results += [pscustomobject]@{ Type='API'; Path="$($t.Method) $($t.Path)"; Status=$r.StatusCode; Result=$(if($pass){'PASS'}else{'FAIL'}) }
  } catch {
    $code = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { 'ERR' }
    $pass = $t.Expect -contains $code
    $results += [pscustomobject]@{ Type='API'; Path="$($t.Method) $($t.Path)"; Status=$code; Result=$(if($pass){'PASS'}else{'FAIL'}) }
  }
}

$results | Format-Table -AutoSize | Out-String -Width 200
$pass = ($results | Where-Object Result -eq 'PASS').Count
$fail = ($results | Where-Object Result -eq 'FAIL').Count
"`nSummary: $pass PASS / $fail FAIL"
