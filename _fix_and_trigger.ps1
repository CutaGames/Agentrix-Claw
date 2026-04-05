$token = "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"
$h = @{Authorization="token $token"; "Content-Type"="application/json"}
$repo = "CutaGames/Agentrix-Claw"
$f = ".github/workflows/build-watch-apk.yml"
$fullPath = "d:\wsl\Ubuntu-24.04\Code\Agentrix\Agentrix-website\.github\workflows\build-watch-apk.yml"

$bytes = [System.IO.File]::ReadAllBytes($fullPath)
$b64 = [Convert]::ToBase64String($bytes)

$existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/$($f)?ref=build138" -Headers $h
Write-Host "Existing SHA: $($existing.sha)"

$body = @{
    message = "fix: secrets context in workflow if condition"
    content = $b64
    branch = "build138"
    sha = $existing.sha
} | ConvertTo-Json

$result = Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$f" -Headers $h -Body $body
Write-Host "Updated! New SHA: $($result.content.sha)"

# Now trigger the workflow
Start-Sleep -Seconds 3
$dispBody = @{ref="build138"} | ConvertTo-Json
try {
    Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/actions/workflows/build-watch-apk.yml/dispatches" -Headers $h -Body $dispBody
    Write-Host "Watch build triggered!"
} catch {
    Write-Host "Trigger error: $($_.ErrorDetails.Message)"
}
