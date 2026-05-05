param(
    [string]$Branch = (git rev-parse --abbrev-ref HEAD).Trim()
)

$ErrorActionPreference = "Stop"
# Git writes progress/info to stderr; don't treat as errors.
$env:GIT_TERMINAL_PROMPT = "0"
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & git @GitArgs 2>&1 | ForEach-Object { Write-Host $_ }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "git $($GitArgs -join ' ') failed with exit code $code" }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoRoot

node scripts/public-build/validate_mobile_mirror.cjs
if ($LASTEXITCODE -ne 0) {
    throw "Public build mirror validation failed"
}

$sourceSha = (git rev-parse HEAD).Trim()
$commitMessage = "sync mobile frontend from CutaGames/Agentrix@$sourceSha"

$tmpRoot = "D:\tmp_agentrix"
if (-not (Test-Path $tmpRoot)) { New-Item -ItemType Directory -Path $tmpRoot | Out-Null }

$stageDir = Join-Path $tmpRoot ("public-build-stage-" + [guid]::NewGuid().ToString("N"))
$clawDir = Join-Path $tmpRoot ("claw-clone-" + [guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir ".github\workflows") | Out-Null

$manifest = Join-Path $repoRoot "scripts\public-build\mobile_mirror_paths.txt"
$mirrorPaths = Get-Content $manifest | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith("#") }

Write-Host "Staging $($mirrorPaths.Count) mirror paths..."
foreach ($rel in $mirrorPaths) {
    $src = Join-Path $repoRoot $rel
    $dst = Join-Path $stageDir $rel
    if (-not (Test-Path $src)) { continue }
    $parent = Split-Path -Parent $dst
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item -Recurse -Force $src $dst
}

foreach ($blocked in @("backend", "frontend")) {
    if (Test-Path (Join-Path $stageDir $blocked)) {
        throw "Public build stage must not include '$blocked'"
    }
}

# Workflows
$wfSources = @(
    @{ src = ".github\workflows\build-apk.yml"; dst = ".github\workflows\build-apk.yml" },
    @{ src = ".github\workflows\build-ios-simulator.yml"; dst = ".github\workflows\build-ios-simulator.yml" },
    @{ src = ".github\public-workflows\build-apk-trigger.yml"; dst = ".github\workflows\build-apk-trigger.yml" },
    @{ src = ".github\public-workflows\build-ios-simulator-trigger.yml"; dst = ".github\workflows\build-ios-simulator-trigger.yml" }
)
foreach ($wf in $wfSources) {
    $s = Join-Path $repoRoot $wf.src
    $d = Join-Path $stageDir $wf.dst
    if (Test-Path $s) {
        $parent = Split-Path -Parent $d
        if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        Copy-Item -Force $s $d
    }
}

Write-Host "Cloning CutaGames/Agentrix-Claw (shallow)..."
$claw = (git remote get-url public_claw).Trim()
$remoteHeads = & git ls-remote --heads $claw $Branch 2>$null
if ($remoteHeads) {
    Invoke-Git clone --depth=1 --branch $Branch --single-branch $claw $clawDir
    Set-Location $clawDir
} else {
    Invoke-Git clone --depth=1 $claw $clawDir
    Set-Location $clawDir
    Invoke-Git checkout --orphan $Branch
    & git rm -rf . 2>&1 | Out-Null
}

# Wipe working tree (except .git)
Get-ChildItem -Force -Path $clawDir | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

# Copy staged content
Copy-Item -Recurse -Force -Path (Join-Path $stageDir "*") -Destination $clawDir

Invoke-Git config user.name "Agentrix Local Sync"
Invoke-Git config user.email "dev@agentrix.top"
Invoke-Git add -A

$diff = & git diff --cached --name-only
if (-not $diff) {
    Write-Host "PUBLIC_BUILD_NO_CHANGES"
    $sha = (& git rev-parse --short HEAD).Trim()
    Write-Host "CURRENT_PUBLIC_BUILD_SHA=$sha"
} else {
    Invoke-Git commit -m $commitMessage
    Write-Host "Pushing to CutaGames/Agentrix-Claw branch $Branch..."
    Invoke-Git push origin "HEAD:$Branch"
    $sha = (& git rev-parse --short HEAD).Trim()
    Write-Host "PUBLIC_BUILD_PUSH_OK"
    Write-Host "CURRENT_PUBLIC_BUILD_SHA=$sha"
}

Set-Location $repoRoot
Remove-Item -Recurse -Force $stageDir -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $clawDir -ErrorAction SilentlyContinue

Write-Host "SOURCE_SHA=$sourceSha"
Write-Host "TARGET_BRANCH=$Branch"
