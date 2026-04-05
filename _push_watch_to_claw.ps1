$token = "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"
$repo = "CutaGames/Agentrix-Claw"
$baseTree = "416eeec331e70247454de26f8db36c255139e1c3"
$headSha = "cb5e180737e2fdcae90b2da4bb9e92cb7f162645"
$srcDir = "d:\wsl\Ubuntu-24.04\Code\Agentrix\Agentrix-website"
$h = @{Authorization="token $token"; "Content-Type"="application/json"}

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

$treeItems = @()
foreach ($f in $files) {
    $fullPath = Join-Path $srcDir $f
    $content = Get-Content -Path $fullPath -Raw -Encoding UTF8
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))
    $body = @{content=$b64; encoding="base64"} | ConvertTo-Json
    $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $h -Body $body
    $treeItems += @{path=$f; mode="100644"; type="blob"; sha=$blob.sha}
    Write-Host "Blob: $f -> $($blob.sha.Substring(0,8))"
}

Write-Host "`nCreating tree with $($treeItems.Count) items..."
$treeBody = @{base_tree=$baseTree; tree=$treeItems} | ConvertTo-Json -Depth 5
$newTree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $h -Body $treeBody
Write-Host "New tree: $($newTree.sha)"

$commitBody = @{message="feat(watch): Wear OS MVP + CI workflow"; tree=$newTree.sha; parents=@($headSha)} | ConvertTo-Json -Depth 3
$newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $h -Body $commitBody
Write-Host "New commit: $($newCommit.sha)"

$updateRef = @{sha=$newCommit.sha} | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/build138" -Headers $h -Body $updateRef | Out-Null
Write-Host "`nDone! Claw build138 updated with watch files."
