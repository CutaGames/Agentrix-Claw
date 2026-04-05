$token = "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"
$h = @{Authorization="token $token"; "Content-Type"="application/json"}
$repo = "CutaGames/Agentrix-Claw"
$srcDir = "d:\wsl\Ubuntu-24.04\Code\Agentrix\Agentrix-website"

# 1. Get current HEAD
$ref = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/ref/heads/build138" -Headers $h
$currentHead = $ref.object.sha
Write-Host "Current HEAD: $currentHead"

# 2. Get current tree
$commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/commits/$currentHead" -Headers $h
$currentTree = $commit.tree.sha
Write-Host "Current tree: $currentTree"

# 3. Create blobs for all watch files
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
    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $b64 = [Convert]::ToBase64String($bytes)
    $body = @{content=$b64; encoding="base64"} | ConvertTo-Json
    $blob = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/blobs" -Headers $h -Body $body
    $treeItems += @{path=$f; mode="100644"; type="blob"; sha=$blob.sha}
    Write-Host "  + $f"
}

# 4. Create new tree based on current tree
$treeBody = @{base_tree=$currentTree; tree=$treeItems} | ConvertTo-Json -Depth 5
$newTree = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/trees" -Headers $h -Body $treeBody
Write-Host "New tree: $($newTree.sha)"

# 5. Create commit with CURRENT head as parent
$commitBody = @{
    message="feat(watch): Wear OS MVP + CI workflow`n`n- WatchApp entry, 5 screens, hooks, services, theme`n- build-watch-apk.yml CI workflow`n- Wear OS manifest overlay"
    tree=$newTree.sha
    parents=@($currentHead)
} | ConvertTo-Json -Depth 3
$newCommit = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/git/commits" -Headers $h -Body $commitBody
Write-Host "New commit: $($newCommit.sha)"

# 6. Update branch ref
$updateRef = @{sha=$newCommit.sha} | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$repo/git/refs/heads/build138" -Headers $h -Body $updateRef | Out-Null
Write-Host "`nSuccess! Claw build138 updated to $($newCommit.sha)"
