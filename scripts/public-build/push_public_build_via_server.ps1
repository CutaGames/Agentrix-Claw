param(
    [string]$Branch,
    [string]$ServerHost = "ubuntu@47.130.176.148",
    [string]$KeyPath = "C:\Users\15279\Desktop\hq.pem",
    [string]$ServerTokenPath = "/home/ubuntu/.config/agentrix/public-build.env"
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\.." )).Path
}

function Copy-IfExists {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )

    if (-not (Test-Path $SourcePath)) {
        return
    }

    $parent = Split-Path -Parent $DestinationPath
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    Copy-Item -Recurse -Force $SourcePath $DestinationPath
}

function Get-MirrorPaths {
    param(
        [string]$RepoRoot
    )

    $manifestPath = Join-Path $RepoRoot "scripts\public-build\mobile_mirror_paths.txt"
    if (-not (Test-Path $manifestPath)) {
        throw "Mobile mirror manifest not found: $manifestPath"
    }

    return Get-Content $manifestPath | Where-Object {
        $trimmed = $_.Trim()
        $trimmed -and -not $trimmed.StartsWith("#")
    }
}

function Assert-PublicBuildStage {
    param(
        [string]$StageDir
    )

    foreach ($blockedPath in @("backend", "frontend")) {
        if (Test-Path (Join-Path $StageDir $blockedPath)) {
            throw "Public build stage must not include '$blockedPath'."
        }
    }
}

if (-not (Test-Path $KeyPath)) {
    throw "SSH key not found: $KeyPath"
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
}

$sourceSha = (git rev-parse HEAD).Trim()
$sourceBranch = (git rev-parse --abbrev-ref HEAD).Trim()
$commitMessage = "sync mobile frontend from CutaGames/Agentrix@$sourceSha"

$stageDir = Join-Path "D:\tmp_agentrix" ("agentrix-public-build-stage-" + [guid]::NewGuid().ToString("N"))
$archivePath = Join-Path "D:\tmp_agentrix" ("agentrix-public-build-" + [guid]::NewGuid().ToString("N") + ".tar.gz")

New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir ".github\workflows") | Out-Null

$mirrorPaths = Get-MirrorPaths -RepoRoot $repoRoot

foreach ($relativePath in $mirrorPaths) {
    Copy-IfExists -SourcePath (Join-Path $repoRoot $relativePath) -DestinationPath (Join-Path $stageDir $relativePath)
}

Assert-PublicBuildStage -StageDir $stageDir

Copy-IfExists -SourcePath (Join-Path $repoRoot ".github\workflows\build-apk.yml") -DestinationPath (Join-Path $stageDir ".github\workflows\build-apk.yml")
Copy-IfExists -SourcePath (Join-Path $repoRoot ".github\workflows\build-ios-simulator.yml") -DestinationPath (Join-Path $stageDir ".github\workflows\build-ios-simulator.yml")
Copy-IfExists -SourcePath (Join-Path $repoRoot ".github\workflows\build-watch-apk.yml") -DestinationPath (Join-Path $stageDir ".github\workflows\build-watch-apk.yml")
Copy-IfExists -SourcePath (Join-Path $repoRoot ".github\public-workflows\build-apk-trigger.yml") -DestinationPath (Join-Path $stageDir ".github\workflows\build-apk-trigger.yml")
Copy-IfExists -SourcePath (Join-Path $repoRoot ".github\public-workflows\build-ios-simulator-trigger.yml") -DestinationPath (Join-Path $stageDir ".github\workflows\build-ios-simulator-trigger.yml")

tar -czf $archivePath -C $stageDir .

$serverArchivePath = "/tmp/agentrix-public-build-sync.tar.gz"
scp -o StrictHostKeyChecking=no -i $KeyPath $archivePath "${ServerHost}:$serverArchivePath" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload public build archive to server."
}

$escapedCommitMessage = $commitMessage.Replace("'", "'\''")

$remoteScript = @'
set -euo pipefail
source "__SERVER_TOKEN_PATH__"
if [ -z "${PUBLIC_BUILD_REPO_PUSH_TOKEN:-}" ]; then
    echo "Missing PUBLIC_BUILD_REPO_PUSH_TOKEN in __SERVER_TOKEN_PATH__" >&2
  exit 1
fi

WORK="/tmp/agentrix-public-build-push"
TARGET_REPO="CutaGames/Agentrix-Claw"
TARGET_BRANCH="__TARGET_BRANCH__"
rm -rf "$WORK"
git clone "https://x-access-token:${PUBLIC_BUILD_REPO_PUSH_TOKEN}@github.com/${TARGET_REPO}.git" "$WORK" >/dev/null 2>&1
cd "$WORK"

if git ls-remote --exit-code --heads origin "$TARGET_BRANCH" >/dev/null 2>&1; then
    git checkout -B "$TARGET_BRANCH" "origin/$TARGET_BRANCH" >/dev/null 2>&1
else
    git checkout --orphan "$TARGET_BRANCH" >/dev/null 2>&1
fi

find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
tar -xzf "__SERVER_ARCHIVE_PATH__" -C "$WORK"

git config user.name "Agentrix Server Sync"
git config user.email "dev@agentrix.top"
git add -A

if git diff --cached --quiet; then
  echo PUBLIC_BUILD_NO_CHANGES
    echo CURRENT_PUBLIC_BUILD_SHA=$(git rev-parse --short HEAD)
  exit 0
fi

git commit -m '__COMMIT_MESSAGE__' >/dev/null 2>&1
git push origin "HEAD:$TARGET_BRANCH" >/dev/null 2>&1
echo PUBLIC_BUILD_PUSH_OK
echo CURRENT_PUBLIC_BUILD_SHA=$(git rev-parse --short HEAD)
'@

$remoteScript = $remoteScript.Replace("__SERVER_TOKEN_PATH__", $ServerTokenPath)
$remoteScript = $remoteScript.Replace("__TARGET_BRANCH__", $Branch)
$remoteScript = $remoteScript.Replace("__SERVER_ARCHIVE_PATH__", $serverArchivePath)
$remoteScript = $remoteScript.Replace("__COMMIT_MESSAGE__", $escapedCommitMessage)
$remoteScript = $remoteScript -replace "`r`n", "`n"

$remoteScript | ssh -o StrictHostKeyChecking=no -i $KeyPath $ServerHost bash -s
if ($LASTEXITCODE -ne 0) {
    throw "Server-side public build push failed."
}

Remove-Item -Recurse -Force $stageDir
Remove-Item -Force $archivePath

Write-Output "SOURCE_BRANCH=$sourceBranch"
Write-Output "TARGET_BRANCH=$Branch"
Write-Output "SOURCE_SHA=$sourceSha"
