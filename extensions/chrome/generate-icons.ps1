Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$dir = Join-Path $PSScriptRoot "icons"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
foreach ($size in @(16, 32, 48, 128)) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(91, 33, 182),
        [System.Drawing.Color]::FromArgb(124, 58, 237),
        45.0
    )
    $g.FillRectangle($brush, $rect)
    $fontSize = [int]($size * 0.55)
    $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("A", $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::FromLTRB(0, 0, $size, $size), $sf)
    $g.Dispose()
    $brush.Dispose()
    $font.Dispose()
    $out = Join-Path $dir "icon$size.png"
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $out"
}
