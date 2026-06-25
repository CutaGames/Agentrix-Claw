Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$dir = Join-Path $PSScriptRoot "store-assets"
New-Item -ItemType Directory -Path $dir -Force | Out-Null

function New-Tile {
    param(
        [int]$Width,
        [int]$Height,
        [string]$Path,
        [string]$Subtitle = ""
    )
    $bmp = New-Object System.Drawing.Bitmap $Width, $Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    # Background: deep ink → purple gradient
    $rect = New-Object System.Drawing.Rectangle 0, 0, $Width, $Height
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(7, 8, 11),
        [System.Drawing.Color]::FromArgb(91, 33, 182),
        25.0
    )
    $g.FillRectangle($brush, $rect)

    # Logo square
    $logoSize = [int]($Height * 0.35)
    $logoX = [int]($Width * 0.08)
    $logoY = [int]($Height / 2 - $logoSize / 2)
    $logoRect = New-Object System.Drawing.Rectangle $logoX, $logoY, $logoSize, $logoSize
    $logoBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $logoRect,
        [System.Drawing.Color]::FromArgb(124, 58, 237),
        [System.Drawing.Color]::FromArgb(34, 211, 255),
        135.0
    )
    $g.FillRectangle($logoBrush, $logoRect)
    $logoFont = New-Object System.Drawing.Font("Arial", ([int]($logoSize * 0.55)), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $logoTextRect = [System.Drawing.RectangleF]::FromLTRB($logoX, $logoY, ($logoX + $logoSize), ($logoY + $logoSize))
    $g.DrawString("A", $logoFont, [System.Drawing.Brushes]::White, $logoTextRect, $sf)

    # Title
    $titleX = [int]($logoX + $logoSize + $Width * 0.05)
    $titleSize = [int]($Height * 0.18)
    $titleFont = New-Object System.Drawing.Font("Arial", $titleSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawString("Agentrix", $titleFont, [System.Drawing.Brushes]::White, $titleX, ($Height / 2 - $titleSize * 0.95))

    # Subtitle
    if ($Subtitle) {
        $subSize = [int]($Height * 0.085)
        $subFont = New-Object System.Drawing.Font("Arial", $subSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
        $subBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 230, 245))
        $g.DrawString($Subtitle, $subFont, $subBrush, $titleX, ($Height / 2 + $titleSize * 0.15))
    }

    $g.Dispose()
    $brush.Dispose()
    $logoBrush.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $Path"
}

New-Tile -Width 440 -Height 280 -Path (Join-Path $dir "promo-440x280.png") -Subtitle "AI Agent Sidebar"
New-Tile -Width 1400 -Height 560 -Path (Join-Path $dir "marquee-1400x560.png") -Subtitle "The AI Agent Economy — in your sidebar"
