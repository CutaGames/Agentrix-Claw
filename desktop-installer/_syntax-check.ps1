# Validates all installer PS1 files using Windows PowerShell 5.1's own AST parser.
# The C# launcher prepends a UTF-8 BOM before executing the script, so we simulate
# that here: copy each file to a temp location WITH BOM, then parse the BOM'd copy.
# Without this, PS5.1 ParseFile treats UTF-8 as ANSI and multi-byte chars (►, ✅, ━)
# cause false parse errors inside perfectly valid here-strings.

$root = $PSScriptRoot
$files = @('install-aio.ps1', 'install-gui.ps1')
$totalErrors = 0
$bom = [byte[]]@(0xEF, 0xBB, 0xBF)

foreach ($name in $files) {
    $file = Join-Path $root $name
    if (-not (Test-Path $file)) { Write-Host "  SKIP (not found): $name" -ForegroundColor Yellow; continue }

    # Write a BOM-prefixed temp copy (exactly what build-exe.ps1 does at runtime)
    $tmpFile = [System.IO.Path]::GetTempFileName() -replace '\.tmp$','.ps1'
    try {
        $bytes    = [System.IO.File]::ReadAllBytes($file)
        $withBom  = New-Object byte[] ($bom.Length + $bytes.Length)
        [Array]::Copy($bom,   0, $withBom, 0,           $bom.Length)
        [Array]::Copy($bytes, 0, $withBom, $bom.Length, $bytes.Length)
        [System.IO.File]::WriteAllBytes($tmpFile, $withBom)

        $errs = $null; $toks = $null
        [System.Management.Automation.Language.Parser]::ParseFile($tmpFile, [ref]$toks, [ref]$errs) | Out-Null

        if ($errs.Count -eq 0) {
            Write-Host "  OK  $name" -ForegroundColor Green
        } else {
            Write-Host "  FAIL $name — $($errs.Count) error(s):" -ForegroundColor Red
            foreach ($e in $errs) {
                Write-Host "       Line $($e.Extent.StartLineNumber) col $($e.Extent.StartColumnNumber): $($e.Message)" -ForegroundColor Red
            }
            $totalErrors += $errs.Count
        }
    } finally {
        Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
    }
}

if ($totalErrors -eq 0) {
    Write-Host "SYNTAX CHECK PASSED — all installer scripts are PS5.1 compatible" -ForegroundColor Green
} else {
    Write-Host "SYNTAX CHECK FAILED — $totalErrors error(s) found" -ForegroundColor Red
    exit 1
}
