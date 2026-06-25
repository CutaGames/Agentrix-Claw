# Stitch individual frame PNGs into a horizontal sprite sheet.
#
# Usage:
#   .\scripts\pet\stitch-sprite-sheet.ps1 walk frame1.png frame2.png frame3.png ...
#
# Output: desktop/public/pets/sprites/default/walk.png
#
# Requires ImageMagick (`magick` on PATH).

param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$Action,

  [Parameter(Mandatory=$true, Position=1, ValueFromRemainingArguments=$true)]
  [string[]]$Frames
)

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  Write-Error "ImageMagick not found. Install from https://imagemagick.org/script/download.php"
  exit 1
}

if ($Frames.Count -lt 1) {
  Write-Error "Need at least 1 frame"
  exit 1
}

$outDir = Join-Path $PSScriptRoot "..\..\desktop\public\pets\sprites\default"
$null = New-Item -ItemType Directory -Force -Path $outDir
$outFile = Join-Path $outDir "$Action.png"

Write-Host "Stitching $($Frames.Count) frames into $outFile..."

$framePaths = $Frames | ForEach-Object { Resolve-Path $_ }

# `+append` concatenates horizontally
& magick @framePaths +append $outFile

if ($LASTEXITCODE -eq 0) {
  $info = magick identify -format "%wx%h" $outFile
  Write-Host "OK — $outFile ($info)"
} else {
  Write-Error "magick failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}
