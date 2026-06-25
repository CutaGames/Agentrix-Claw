param(
    [switch]$KeepStage,
    [ValidateSet('all', 'gui', 'standard', 'aio')]
    [string]$Variant = 'all'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$iexpressPath = Join-Path $env:WINDIR 'System32\iexpress.exe'
if (-not (Test-Path $iexpressPath)) {
    throw 'IExpress was not found on this Windows machine.'
}

$buildRoot = Join-Path $PSScriptRoot '..\builds'
$logoSource = Join-Path (Join-Path $PSScriptRoot '..\Agentrix Logo') 'agentrix_logo_square_transparent.png'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

function New-StageFile {
    param(
        [string]$Path,
        [string]$Content
    )

    Set-Content -Path $Path -Value $Content -Encoding ASCII
}

function New-IexpressPackage {
    param(
        [string]$Name,
        [string]$FriendlyName,
        [string]$AppLaunched,
        [System.Collections.IEnumerable]$PayloadFiles,
        [hashtable]$GeneratedFiles = @{}
    )

    $stageDir = Join-Path $buildRoot ($Name + '-stage')
    if (Test-Path $stageDir) {
        Remove-Item $stageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

    foreach ($file in $PayloadFiles) {
        if (-not (Test-Path $file.Source)) {
            throw "Required payload file not found: $($file.Source)"
        }
        Copy-Item $file.Source (Join-Path $stageDir $file.Target) -Force
    }

    foreach ($generatedName in $GeneratedFiles.Keys) {
        New-StageFile -Path (Join-Path $stageDir $generatedName) -Content $GeneratedFiles[$generatedName]
    }

    $allFileNames = @($PayloadFiles | ForEach-Object { $_.Target }) + @($GeneratedFiles.Keys)
    $outputPath = [System.IO.Path]::GetFullPath((Join-Path $buildRoot ($Name + '.exe')))
    if (Test-Path $outputPath) {
        Remove-Item $outputPath -Force
    }

    $resolvedStageDir = [System.IO.Path]::GetFullPath($stageDir)
    $sourceLines = @()
    $stringLines = @()
    for ($i = 0; $i -lt $allFileNames.Count; $i++) {
        $sourceLines += ('%FILE{0}%=' -f $i)
        $stringLines += ('FILE{0}="{1}"' -f $i, $allFileNames[$i])
    }

    $sedPath = Join-Path $stageDir ($Name + '.sed')
    $sedContent = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
ExtractOnly=0
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$outputPath
FriendlyName=$FriendlyName
AppLaunched=$AppLaunched
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$resolvedStageDir\
[SourceFiles0]
$(($sourceLines -join "`r`n"))
[Strings]
$(($stringLines -join "`r`n"))
"@
    Set-Content -Path $sedPath -Value $sedContent -Encoding ASCII

    Write-Host ("[Agentrix] Building {0}..." -f ([System.IO.Path]::GetFileName($outputPath))) -ForegroundColor Cyan
    $process = Start-Process -FilePath $iexpressPath -ArgumentList @('/N', '/Q', $sedPath) -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        throw "IExpress failed for $Name with exit code $($process.ExitCode)."
    }
    if (-not (Test-Path $outputPath)) {
        throw "IExpress completed but no EXE was produced for $Name."
    }

    Write-Host "[Agentrix] EXE ready: $outputPath" -ForegroundColor Green

    if (-not $KeepStage) {
        Remove-Item $stageDir -Recurse -Force
    }
}

$commonPayload = @(
    @{ Source = $logoSource; Target = 'agentrix_logo_square_transparent.png' }
)

if ($Variant -in @('all', 'gui')) {
    $guiPayload = @(
        @{ Source = (Join-Path $PSScriptRoot 'install-gui.ps1'); Target = 'install-gui.ps1' },
        @{ Source = (Join-Path $PSScriptRoot 'Setup.bat'); Target = 'Setup.bat' }
    ) + $commonPayload

    $launchGuiVbs = @"
' Agentrix-Claw GUI Launcher
' IExpress extracts to a temp dir and cleans it up as soon as the launch process exits.
' To survive that cleanup we FIRST copy the payload to a persistent folder, THEN
' launch PowerShell from there (visible window, fire-and-forget so IExpress can finish).
Set shell = CreateObject(""WScript.Shell"")
Set fso   = CreateObject(""Scripting.FileSystemObject"")
srcDir  = fso.GetParentFolderName(WScript.ScriptFullName)
destDir = shell.ExpandEnvironmentStrings(""%APPDATA%"") & ""\Agentrix-Claw-Installer""

' Ensure persistent destination directory exists
If Not fso.FolderExists(destDir) Then fso.CreateFolder(destDir)

' Copy installer script
ps1Src = srcDir  & ""\install-gui.ps1""
ps1Dst = destDir & ""\install-gui.ps1""
If fso.FileExists(ps1Src) Then fso.CopyFile ps1Src, ps1Dst, True

' Copy logo (used by the GUI for branding)
logoSrc = srcDir  & ""\agentrix_logo_square_transparent.png""
logoDst = destDir & ""\agentrix_logo_square_transparent.png""
If fso.FileExists(logoSrc) Then fso.CopyFile logoSrc, logoDst, True

' Write a launch log
logPath = shell.ExpandEnvironmentStrings(""%TEMP%"") & ""\agentrix-claw-iexpress-launch.log""
Set logFile = fso.OpenTextFile(logPath, 8, True)
logFile.WriteLine Now & "" GUI launch: "" & ps1Dst
logFile.Close

' Launch from persistent dir — mode 1 (normal visible window), False = don't wait
' (IExpress can exit; files are safe in %APPDATA%)
cmd = ""powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File """""" & ps1Dst & """"""""
shell.Run cmd, 1, False
"@

    New-IexpressPackage -Name 'Agentrix-Claw-Setup' -FriendlyName 'Agentrix-Claw GUI Setup' -AppLaunched 'wscript.exe Launch-GUI.vbs' -PayloadFiles $guiPayload -GeneratedFiles @{
        'Launch-GUI.vbs' = $launchGuiVbs
    }
}

if ($Variant -in @('all', 'standard')) {
    $standardPayload = @(
        @{ Source = (Join-Path $PSScriptRoot 'install-standard.ps1'); Target = 'install-standard.ps1' }
    )

    $launchStandardCmd = @"
@echo off
title Agentrix-Claw Standard Setup
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-standard.ps1"
echo.
echo Agentrix-Claw Standard installer finished. Press any key to close.
pause >nul
"@

    New-IexpressPackage -Name 'Agentrix-Claw-Standard-Setup' -FriendlyName 'Agentrix-Claw Standard Setup' -AppLaunched 'cmd.exe /c Launch-Standard.cmd' -PayloadFiles $standardPayload -GeneratedFiles @{
        'Launch-Standard.cmd' = $launchStandardCmd
    }
}

if ($Variant -in @('all', 'aio')) {
    $aioPayload = @(
        @{ Source = (Join-Path $PSScriptRoot 'install-aio.ps1'); Target = 'install-aio.ps1' }
    )

    $launchAioCmd = @"
@echo off
title Agentrix-Claw AIO Setup
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-aio.ps1"
echo.
echo Agentrix-Claw AIO installer finished. Press any key to close.
pause >nul
"@

    New-IexpressPackage -Name 'Agentrix-Claw-AIO-Setup' -FriendlyName 'Agentrix-Claw AIO Setup' -AppLaunched 'cmd.exe /c Launch-AIO.cmd' -PayloadFiles $aioPayload -GeneratedFiles @{
        'Launch-AIO.cmd' = $launchAioCmd
    }
}
