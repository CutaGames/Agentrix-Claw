# _build-tmp.ps1 — shared build/mirror staging-root resolver.
#
# Why: the source repo lives on D:, but Windows %TEMP% is on C: which keeps
# filling up. Shallow-cloning the public Agentrix-Claw repo into C:\...\Temp
# then fails with `git clone ... No space left on device` (exit 128).
# We standardise all mirror/sync staging dirs onto a single build-temp root.
#
# Resolution order (first that works):
#   1. $env:AGENTRIX_BUILD_TMP        (explicit override, any drive)
#   2. D:\agentrix-build-tmp          (default — D: has space)
#   3. C:\Users\<you>\agentrix-build-tmp (fallback if D: missing)
#   4. $env:TEMP                       (last resort)
#
# Dot-source this file then call Get-BuildTmpRoot / New-BuildStagingDir.

function Get-BuildTmpRoot {
    $candidates = @()
    if ($env:AGENTRIX_BUILD_TMP) { $candidates += $env:AGENTRIX_BUILD_TMP }
    $candidates += 'D:\agentrix-build-tmp'
    $candidates += (Join-Path $env:USERPROFILE 'agentrix-build-tmp')
    $candidates += $env:TEMP

    foreach ($root in $candidates) {
        if (-not $root) { continue }
        try {
            $drive = [System.IO.Path]::GetPathRoot($root)
            # Skip a candidate whose drive doesn't exist (e.g. D: on a machine without it).
            if ($drive -and -not (Test-Path $drive)) { continue }
            if (-not (Test-Path $root)) {
                New-Item -ItemType Directory -Path $root -Force -ErrorAction Stop | Out-Null
            }
            return $root
        } catch {
            continue
        }
    }
    # Absolute last resort.
    return $env:TEMP
}

# Returns a fresh unique staging dir under the build-temp root (created).
function New-BuildStagingDir {
    param([string]$Prefix = 'agentrix-claw-mirror')
    $root = Get-BuildTmpRoot
    $dir = Join-Path $root ("$Prefix-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    return $dir
}
