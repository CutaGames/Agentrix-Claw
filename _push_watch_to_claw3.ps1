$token = "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"
$h = @{Authorization="token $token"; "Content-Type"="application/json"}
$repo = "CutaGames/Agentrix-Claw"
$branch = "build138"
$srcDir = "d:\wsl\Ubuntu-24.04\Code\Agentrix\Agentrix-website"

$files = @(
    ".github/workflows/build-watch-apk.yml",
    "index.watch.js",
    "build-watch-apk.sh",
    "src/watch/WatchApp.tsx",
    "src/watch/hooks/useWatchAuth.ts",
    "src/watch/hooks/useWatchSensors.ts",
    "src/watch/hooks/useWatchSync.ts",
    "src/watch/navigation/WatchNavigator.tsx",
    "src/watch/screens/WatchAlertsScreen.tsx",
    "src/watch/screens/WatchChatScreen.tsx",
    "src/watch/screens/WatchHealthScreen.tsx",
    "src/watch/screens/WatchHomeScreen.tsx",
    "src/watch/screens/WatchSettingsScreen.tsx",
    "src/watch/services/watchHealthService.ts",
    "src/watch/services/watchNotificationService.ts",
    "src/watch/theme/watchColors.ts",
    "src/watch/theme/watchLayout.ts",
    "android/app/src/wearos/AndroidManifest.xml"
)

foreach ($f in $files) {
    $fullPath = Join-Path $srcDir $f
    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $b64 = [Convert]::ToBase64String($bytes)
    
    # Check if file exists first
    $sha = $null
    try {
        $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/$($f)?ref=$branch" -Headers $h
        $sha = $existing.sha
    } catch {}
    
    $body = @{
        message = "add $f for watch build"
        content = $b64
        branch = $branch
    }
    if ($sha) { $body.sha = $sha }
    
    $bodyJson = $body | ConvertTo-Json
    try {
        Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$repo/contents/$f" -Headers $h -Body $bodyJson | Out-Null
        Write-Host "[OK] $f"
    } catch {
        Write-Host "[FAIL] $f : $($_.Exception.Message)"
    }
}

Write-Host "`nDone!"
