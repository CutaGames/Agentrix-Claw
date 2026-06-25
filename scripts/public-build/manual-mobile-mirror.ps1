# Manual mobile mirror — emulates `.github/workflows/sync-mobile-build-repo.yml`
# locally so we can push to CutaGames/Agentrix-Claw without the bad
# `deliverables/pet_3d_regen_v4.json` Tencent Secret tripping GitHub
# secret-scanning.
#
# Usage:
#   pwsh ./scripts/public-build/manual-mobile-mirror.ps1 -Branch build/mobile-pet-forms-p6-2026-05-22
#
# Requires:
#   - The `public_claw` git remote already configured with a working PAT
#   - PowerShell 5+ (Windows-native ok)

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Branch
)

# Tolerate git's noisy stderr — PowerShell would otherwise treat it as
# an error and abort with NativeCommandError.
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

# 1) Clone the public repo into a temp dir using the existing public_claw URL
$publicUrl = & git -C $RepoRoot config --get remote.public_claw.url
if (-not $publicUrl) {
    throw "public_claw remote not configured. git remote add public_claw <url> first."
}

Invoke-Git clone $publicUrl $Mirror

Push-Location $Mirror
try {
    # 2) Set up branch — orphan if missing remotely
    & git ls-remote --exit-code --heads origin $Branch 2>$null | Out-Null
    $remoteHasBranch = ($LASTEXITCODE -eq 0)

    if ($remoteHasBranch) {
        Invoke-Git checkout -B $Branch "origin/$Branch"
    } else {
        Invoke-Git checkout --orphan $Branch
    }

    # 3) Wipe everything except .git
    Get-ChildItem -Force -Path . | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force

    # 4) Read mirror paths and copy each one
    $pathsFile = Join-Path $RepoRoot 'scripts/public-build/mobile_mirror_paths.txt'
    $paths = Get-Content $pathsFile | Where-Object { $_ -and -not $_.StartsWith('#') }
    foreach ($rel in $paths) {
        $rel = $rel.Trim()
        if (-not $rel) { continue }
        $src = Join-Path $RepoRoot $rel
        if (-not (Test-Path $src)) {
            Write-Warning "Skip missing path: $rel"
            continue
        }
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

    # 5) Copy public workflow files
    foreach ($wf in @(
        '.github/workflows/build-apk.yml',
        '.github/workflows/build-ios-simulator.yml',
        '.github/workflows/build-watch-apk.yml'
    )) {
        $src = Join-Path $RepoRoot $wf
        if (Test-Path $src) {
            $dst = Join-Path $Mirror $wf
            $dstParent = Split-Path -Parent $dst
            New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
            Copy-Item -Force -Path $src -Destination $dst
            Write-Host "  ok $wf"
        }
    }
    foreach ($pair in @(
        @('.github/public-workflows/build-apk-trigger.yml',         '.github/workflows/build-apk-trigger.yml'),
        @('.github/public-workflows/build-ios-simulator-trigger.yml','.github/workflows/build-ios-simulator-trigger.yml')
    )) {
        $src = Join-Path $RepoRoot $pair[0]
        $dst = Join-Path $Mirror $pair[1]
        if (Test-Path $src) {
            $dstParent = Split-Path -Parent $dst
            New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
            Copy-Item -Force -Path $src -Destination $dst
            Write-Host "  ok public->$($pair[1])"
        }
    }

    # 6) Sanity: must NOT contain backend/ or frontend/
    if ((Test-Path "$Mirror/backend") -or (Test-Path "$Mirror/frontend")) {
        throw "Mirror must not contain backend/ or frontend/"
    }

    # 7) Commit + push
    & git add -A 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "git add failed" }
    & git diff --cached --quiet 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "No changes - nothing to push"
        return
    }
    & git -c "user.name=agentrix-bot" -c "user.email=bot@agentrix.local" commit -m "manual mirror: mobile P-6 (Sprint pet forms) from CutaGames/Agentrix@$Branch" 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
    & git push origin "HEAD:$Branch" 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
    Write-Host "Pushed $Branch to $publicUrl"
} finally {
    Pop-Location
    Write-Host "Cleaning up $Mirror"
    Remove-Item -Recurse -Force -Path $Mirror -ErrorAction SilentlyContinue
}
