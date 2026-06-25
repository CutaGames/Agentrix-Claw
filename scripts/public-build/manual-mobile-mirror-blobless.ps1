# Blobless variant of manual-mobile-mirror-shallow.ps1.
#
# The public Agentrix-Claw build branches carry heavy binary blobs (APK/build
# artifacts) at their tip, so even a --depth 1 --single-branch clone stalls for
# minutes in the server "compressing objects" phase. We wipe everything except
# .git and copy fresh mirror files anyway, so the branch's file BLOBS are never
# needed. `--filter=blob:none` fetches only commits + trees (fast), deferring
# blob download until checkout — and since we immediately wipe + overwrite,
# almost no blobs ever transfer.
#
# Usage:
#   pwsh ./scripts/public-build/manual-mobile-mirror-blobless.ps1 -Branch build/voice-companion-fixes-2026-06-06

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Branch
)

$ErrorActionPreference = 'Continue'
$PSNativeCommandUseErrorActionPreference = $false

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$Args)
    $output = & git @Args 2>&1
    $output | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE"
    }
}

$RepoRoot = (Resolve-Path "$PSScriptRoot/../..").Path
. (Join-Path $PSScriptRoot '_build-tmp.ps1')
$Mirror = New-BuildStagingDir

Write-Host "Mirror staging dir: $Mirror"

$publicUrl = & git -C $RepoRoot config --get remote.public_claw.url
if (-not $publicUrl) {
    throw "public_claw remote not configured."
}

& git ls-remote --exit-code --heads $publicUrl $Branch 2>$null | Out-Null
$remoteHasBranch = ($LASTEXITCODE -eq 0)

# --no-checkout is the key: a plain checkout would lazily fetch EVERY blob
# (defeating blob:none and re-stalling on the heavy APK binaries). We wipe the
# tree and copy fresh mirror files anyway, so we never need the checked-out
# working tree. With --no-checkout the working dir starts empty, we copy the
# mirror paths, and `git add -A` produces a commit containing exactly the
# mirror set (identical end-state to the original shallow script).
if ($remoteHasBranch) {
    Write-Host "Remote branch exists - blobless+no-checkout clone of $Branch (depth 1, blob:none)."
    Invoke-Git clone --depth 1 --filter=blob:none --no-checkout --branch $Branch --single-branch $publicUrl $Mirror
} else {
    Write-Host "Remote branch missing - blobless clone of default branch then orphan."
    Invoke-Git clone --depth 1 --filter=blob:none --no-checkout $publicUrl $Mirror
}

Push-Location $Mirror
try {
    if (-not $remoteHasBranch) {
        Invoke-Git checkout --orphan $Branch
    }

    Get-ChildItem -Force -Path . | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force

    $pathsFile = Join-Path $RepoRoot 'scripts/public-build/mobile_mirror_paths.txt'
    $paths = Get-Content $pathsFile | Where-Object { $_ -and -not $_.StartsWith('#') }
    foreach ($rel in $paths) {
        $rel = $rel.Trim()
        if (-not $rel) { continue }
        $src = Join-Path $RepoRoot $rel
        if (-not (Test-Path $src)) { Write-Warning "Skip missing path: $rel"; continue }
        $dst = Join-Path $Mirror $rel
        $dstParent = Split-Path -Parent $dst
        if ($dstParent -and -not (Test-Path $dstParent)) {
            New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
        }
        if ((Get-Item $src).PSIsContainer) {
            if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
            Copy-Item -Recurse -Force -Path "$src/*" -Destination $dst
        } else {
            Copy-Item -Force -Path $src -Destination $dst
        }
        Write-Host "  ok $rel"
    }

    foreach ($wf in @(
        '.github/workflows/build-apk.yml',
        '.github/workflows/build-ios-simulator.yml',
        '.github/workflows/build-watch-apk.yml'
    )) {
        $src = Join-Path $RepoRoot $wf
        if (Test-Path $src) {
            $dst = Join-Path $Mirror $wf
            New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
            Copy-Item -Force -Path $src -Destination $dst
            Write-Host "  ok $wf"
        }
    }
    foreach ($pair in @(
        @('.github/public-workflows/build-apk-trigger.yml',          '.github/workflows/build-apk-trigger.yml'),
        @('.github/public-workflows/build-ios-simulator-trigger.yml','.github/workflows/build-ios-simulator-trigger.yml')
    )) {
        $src = Join-Path $RepoRoot $pair[0]
        $dst = Join-Path $Mirror $pair[1]
        if (Test-Path $src) {
            New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
            Copy-Item -Force -Path $src -Destination $dst
            Write-Host "  ok public->$($pair[1])"
        }
    }

    if ((Test-Path "$Mirror/backend") -or (Test-Path "$Mirror/frontend")) {
        throw "Mirror must not contain backend/ or frontend/"
    }

    & git add -A 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "git add failed" }
    & git diff --cached --quiet 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "No changes - nothing to push"
        return
    }
    & git -c "user.name=agentrix-bot" -c "user.email=bot@agentrix.local" commit -m "manual mirror (blobless): companion ball crash-loop fix from CutaGames/Agentrix@$Branch" 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
    & git push origin "HEAD:$Branch" 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
    Write-Host "Pushed $Branch to $publicUrl"
} finally {
    Pop-Location
    Write-Host "Cleaning up $Mirror"
    Remove-Item -Recurse -Force -Path $Mirror -ErrorAction SilentlyContinue
}
