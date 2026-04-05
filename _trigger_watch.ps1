$token = "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"
$h = @{
    Authorization="token $token"
    Accept="application/vnd.github+json"
    "Content-Type"="application/json"
}
$body = '{"ref":"build138"}'
$uri = "https://api.github.com/repos/CutaGames/Agentrix-Claw/actions/workflows/build-watch-apk.yml/dispatches"

try {
    $resp = Invoke-WebRequest -Method Post -Uri $uri -Headers $h -Body $body -UseBasicParsing
    Write-Host "Triggered! Status=$($resp.StatusCode)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = ""
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message
    }
    Write-Host "HTTP $statusCode"
    Write-Host $errorBody
}
