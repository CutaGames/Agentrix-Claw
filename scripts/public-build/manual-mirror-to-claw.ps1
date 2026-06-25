# Manual mirror script — replicates .github/workflows/sync-mobile-build-repo.yml
# Used when the GitHub Action sync fails or needs to be triggered immediately.
#
# Usage: pwsh ./scripts/public-build/manual-mirror-to-claw.ps1

$ErrorActionPreference = 'Stop'

$SourceDir = (Get-Location).Path
. (Join-Path $PSScriptRoot '_build-tmp.ps1')
$TargetDir = New-BuildStagingDir
$TargetRepo = 'public_claw'
$TargetBranch = 'main'
$SourceSha = (git rev-parse HEAD).Trim()

Write-Host "═══ Manual Mirror to Agentrix-Claw ═══"
Write-Host "Source:  $SourceDir"
Write-Host "Target:  $TargetDir"
Write-Host "Branch:  $TargetBranch"
Write-Host "SHA:     $SourceSha"
Write-Host ""

# Get the public_claw URL (with token from git remote)
$PublicClawUrl = (git remote get-url $TargetRepo).Trim()
if (-not $PublicClawUrl) {
    Write-Error "Remote '$TargetRepo' not found."
    exit 1
}

Write-Host "Cloning $PublicClawUrl..."
git clone $PublicClawUrl $TargetDir 2>&1 | Out-Null

Push-Location $TargetDir
try {
    git checkout -B $TargetBranch "origin/$TargetBranch" 2>&1 | Out-Null

    Write-Host "Cleaning target dir..."
    Get-ChildItem -Path $TargetDir -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force

    Write-Host "Copying mobile mirror paths..."
    $MirrorPaths = Get-Content (Join-Path $SourceDir 'scripts/public-build/mobile_mirror_paths.txt') | Where-Object { $_.Trim() -ne '' }

    foreach ($rel in $MirrorPaths) {
        $rel = $rel.Trim()
        $srcPath = Join-Path $SourceDir $rel
        $dstPath = Join-Path $TargetDir $rel
        if (Test-Path $srcPath) {
            $dstParent = Split-Path -Parent $dstPath
            if (-not (Test-Path $dstParent)) {
                New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
            }
            if ((Get-Item $srcPath).PSIsContainer) {
                Copy-Item -Path $srcPath -Destination $dstPath -Recurse -Force
            } else {
                Copy-Item -Path $srcPath -Destination $dstPath -Force
            }
            Write-Host "  ✓ $rel"
        } else {
            Write-Host "  - $rel (missing)"
        }
    }

    # Copy GitHub workflows
    Write-Host "Copying workflows..."
    @('build-apk.yml', 'build-ios-simulator.yml', 'build-watch-apk.yml') | ForEach-Object {
        $src = Join-Path $SourceDir ".github/workflows/$_"
        $dst = Join-Path $TargetDir ".github/workflows/$_"
        if (Test-Path $src) {
            $dstParent = Split-Path -Parent $dst
            if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }
            Copy-Item $src $dst -Force
            Write-Host "  ✓ workflows/$_"
        }
    }

    @('build-apk-trigger.yml', 'build-ios-simulator-trigger.yml') | ForEach-Object {
        $src = Join-Path $SourceDir ".github/public-workflows/$_"
        $dst = Join-Path $TargetDir ".github/workflows/$_"
        if (Test-Path $src) {
            Copy-Item $src $dst -Force
            Write-Host "  ✓ workflows/$_ (from public-workflows)"
        }
    }

    # Validate no backend/frontend leakage
    if ((Test-Path (Join-Path $TargetDir 'backend')) -or (Test-Path (Join-Path $TargetDir 'frontend'))) {
        Write-Error "ERROR: Public mirror must not include backend or frontend"
        exit 1
    }

    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add -A 2>&1 | Out-Null

    $hasChanges = (git diff --cached --quiet; $LASTEXITCODE -ne 0)
    if (-not $hasChanges) {
        Write-Host "No changes to sync."
        exit 0
    }

    Write-Host "Committing and pushing..."
    git commit -m "sync mobile frontend from CutaGames/Agentrix@$SourceSha (manual mirror)" 2>&1 | Out-Null
    git push origin "HEAD:$TargetBranch" 2>&1

    $newSha = (git rev-parse HEAD).Trim()
    Write-Host ""
    Write-Host "✅ Mirror pushed: $newSha"
    Write-Host "→ APK build will be triggered at https://github.com/CutaGames/Agentrix-Claw/actions"
} finally {
    Pop-Location
    Write-Host "Cleaning up $TargetDir..."
    if (Test-Path $TargetDir) {
        Remove-Item -Recurse -Force $TargetDir -ErrorAction SilentlyContinue
    }
}
