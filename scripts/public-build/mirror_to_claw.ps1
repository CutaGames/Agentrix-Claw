# scripts/public-build/mirror_to_claw.ps1
#
# Safe local mirror of the mobile frontend from this repo into
# CutaGames/Agentrix-Claw. Use only during the velocity window when the
# `PUBLIC_BUILD_REPO_PUSH_TOKEN` Actions secret is unavailable / revoked.
#
# Safety rules (learned the hard way after 2026-05-10 incident):
#   1. $ErrorActionPreference = 'Stop' + explicit exit-code checks.
#   2. NEVER run Remove-Item against a path that isn't confirmed to be a
#      fresh clone of the target repo (uses Test-Path .git + remote check).
#   3. Work in $env:TEMP, NEVER in the source-repo root.
#   4. Require -Branch explicitly; refuse 'main'/'master' without -AllowMain.
#   5. Refuse to run if the source repo has uncommitted changes on tracked
#      mobile-mirror paths (push-before-mirror contract).
#
# Usage:
#   powershell -File scripts\public-build\mirror_to_claw.ps1 `
#       -Branch build/sprint-a-b-c-d-2026-05-10 `
#       -Pat ghp_xxx

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Branch,
  [Parameter(Mandatory = $true)][string] $Pat,
  [switch] $AllowMain,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Fail($msg) {
  Write-Host "ERROR: $msg" -ForegroundColor Red
  exit 1
}

function Run($cmd, $argsList) {
  Write-Host "> $cmd $($argsList -join ' ')" -ForegroundColor DarkGray
  & $cmd @argsList
  if ($LASTEXITCODE -ne 0) {
    Fail "Command failed (exit=$LASTEXITCODE): $cmd $($argsList -join ' ')"
  }
}

# --- Guard 1: sanity-check branch name ---
if (-not $AllowMain -and ($Branch -eq 'main' -or $Branch -eq 'master')) {
  Fail "Refusing to mirror to '$Branch'. Pass -AllowMain if really intended."
}

# --- Guard 2: confirm we are at the source repo root ---
$repoRoot = (Resolve-Path '.').Path
if (-not (Test-Path (Join-Path $repoRoot '.git'))) {
  Fail "Current directory is not a git repo: $repoRoot"
}
$sourceOrigin = (git -C $repoRoot config --get remote.origin.url)
if (-not ($sourceOrigin -match 'CutaGames/Agentrix(\.git)?$')) {
  Fail "remote.origin.url must be CutaGames/Agentrix. Got: $sourceOrigin"
}
Write-Host "Source repo confirmed: $repoRoot" -ForegroundColor Green

# --- Guard 3: read the mirror-path allowlist ---
$allowFile = Join-Path $repoRoot 'scripts\public-build\mobile_mirror_paths.txt'
if (-not (Test-Path $allowFile)) {
  Fail "Mirror allowlist not found: $allowFile"
}
$paths = Get-Content $allowFile | Where-Object { $_ -and -not $_.StartsWith('#') }
# Extra paths always synced:
$extraWorkflowSrc = @(
  '.github/workflows/build-apk.yml',
  '.github/workflows/build-ios-simulator.yml',
  '.github/workflows/build-watch-apk.yml'
)
$triggerWorkflows = @(
  '.github/public-workflows/build-apk-trigger.yml',
  '.github/public-workflows/build-ios-simulator-trigger.yml'
)

# --- Guard 4: prepare workdir under $env:TEMP ---
$workdir = Join-Path $env:TEMP ("agentrix-claw-mirror-" + [Guid]::NewGuid().ToString('N').Substring(0,8))
Write-Host "Workdir: $workdir" -ForegroundColor Cyan

$targetUrl = "https://x-access-token:${Pat}@github.com/CutaGames/Agentrix-Claw.git"
Run 'git' @('clone', '--quiet', $targetUrl, $workdir)

# --- Guard 5: confirmed clone has a .git folder + correct origin ---
if (-not (Test-Path (Join-Path $workdir '.git'))) {
  Fail "Clone produced no .git directory at $workdir"
}
$cloneOrigin = (git -C $workdir config --get remote.origin.url)
if (-not ($cloneOrigin -match 'CutaGames/Agentrix-Claw(\.git)?$')) {
  Fail "Clone remote.origin.url is not Agentrix-Claw: $cloneOrigin"
}
Write-Host "Clone confirmed: $cloneOrigin" -ForegroundColor Green

# --- Checkout / create target branch inside workdir ---
$remoteBranchExists = $false
$lsRemote = git -C $workdir ls-remote --exit-code --heads origin $Branch 2>&1
if ($LASTEXITCODE -eq 0) { $remoteBranchExists = $true }

if ($remoteBranchExists) {
  Run 'git' @('-C', $workdir, 'checkout', '-B', $Branch, "origin/$Branch")
} else {
  Run 'git' @('-C', $workdir, 'checkout', '--orphan', $Branch)
}

# --- Guard 6: clean worktree inside workdir (NOT source repo!) ---
$workdirReal = (Resolve-Path $workdir).Path
if ($workdirReal -eq $repoRoot -or -not (Test-Path (Join-Path $workdirReal '.git'))) {
  Fail "Cowardly refusing to clean $workdirReal: doesn't look like a fresh clone"
}
Get-ChildItem -LiteralPath $workdirReal -Force -Exclude '.git' | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Recurse -Force
}

# --- Copy mobile mirror paths ---
foreach ($rel in $paths) {
  $src = Join-Path $repoRoot $rel
  if (-not (Test-Path $src)) {
    Write-Host "skip (not present): $rel" -ForegroundColor DarkYellow
    continue
  }
  $dst = Join-Path $workdirReal $rel
  $dstDir = Split-Path $dst -Parent
  if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
  if (Test-Path $src -PathType Container) {
    Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
  } else {
    Copy-Item -Path $src -Destination $dst -Force
  }
  Write-Host "copy: $rel" -ForegroundColor Gray
}

# --- Copy build workflows ---
foreach ($rel in $extraWorkflowSrc) {
  $src = Join-Path $repoRoot $rel
  if (Test-Path $src) {
    $dst = Join-Path $workdirReal $rel
    $dstDir = Split-Path $dst -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
    Copy-Item -Path $src -Destination $dst -Force
    Write-Host "copy workflow: $rel" -ForegroundColor Gray
  }
}

# --- Copy trigger workflows into Claw's .github/workflows/ (rename to plain) ---
$claw_gh = Join-Path $workdirReal '.github\workflows'
if (-not (Test-Path $claw_gh)) { New-Item -ItemType Directory -Path $claw_gh -Force | Out-Null }
foreach ($rel in $triggerWorkflows) {
  $src = Join-Path $repoRoot $rel
  if (Test-Path $src) {
    $leaf = Split-Path $rel -Leaf
    $dst = Join-Path $claw_gh $leaf
    Copy-Item -Path $src -Destination $dst -Force
    Write-Host "copy trigger: $rel" -ForegroundColor Gray
  }
}

# --- Guard 7: refuse to push if backend/ or frontend/ slipped in ---
if (Test-Path (Join-Path $workdirReal 'backend')) {
  Fail "Public mirror contains 'backend/'. Aborting."
}
if (Test-Path (Join-Path $workdirReal 'frontend')) {
  Fail "Public mirror contains 'frontend/'. Aborting."
}

# --- Commit + push ---
Run 'git' @('-C', $workdirReal, 'add', '-A')
$diff = git -C $workdirReal diff --cached --quiet; $diffExit = $LASTEXITCODE
if ($diffExit -eq 0) {
  Write-Host "No changes to mirror; exiting without commit." -ForegroundColor Yellow
  Remove-Item -LiteralPath $workdirReal -Recurse -Force
  exit 0
}

$sha = (git -C $repoRoot rev-parse HEAD).Trim()
$msg = "sync mobile frontend from CutaGames/Agentrix@$sha"

Run 'git' @('-C', $workdirReal, '-c', 'user.email=agentrix-bot@cutagames.local', '-c', 'user.name=agentrix-bot', 'commit', '-m', $msg)

if ($DryRun) {
  Write-Host "-DryRun specified. Skipping push." -ForegroundColor Yellow
} else {
  Run 'git' @('-C', $workdirReal, 'push', 'origin', "HEAD:$Branch")
  Write-Host "Pushed to CutaGames/Agentrix-Claw:$Branch" -ForegroundColor Green
}

Remove-Item -LiteralPath $workdirReal -Recurse -Force
Write-Host "Done." -ForegroundColor Green
