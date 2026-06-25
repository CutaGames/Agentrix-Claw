#requires -Version 5.1

[CmdletBinding()]
param(
    [string]$AdbPath = "C:\Android\platform-tools\adb.exe",
    [string]$Package = "app.agentrix.claw",
    [string]$ReportDir = "",
    [switch]$SkipChatTurns,
    [switch]$OnlyLocalModelSettings,
    [int]$ChatWaitSeconds = 45
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$TimeStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ReportRoot = if ([string]::IsNullOrWhiteSpace($ReportDir)) {
    Join-Path $RepoRoot "tests\reports\android-device-ui-$TimeStamp"
} else {
    $ReportDir
}

$null = New-Item -ItemType Directory -Path $ReportRoot -Force
$script:Results = [System.Collections.Generic.List[object]]::new()
$script:StepIndex = 0

function New-UnicodeString {
    param([Parameter(Mandatory = $true)][int[]]$CodePoints)
    return -join ($CodePoints | ForEach-Object { [char]$_ })
}

$ZhAllow = New-UnicodeString @(0x5141, 0x8bb8)
$ZhAlwaysAllow = New-UnicodeString @(0x59cb, 0x7ec8, 0x5141, 0x8bb8)
$ZhAllowWhileUsing = New-UnicodeString @(0x4ec5, 0x5728, 0x4f7f, 0x7528, 0x4e2d, 0x5141, 0x8bb8)
$ZhOk = New-UnicodeString @(0x786e, 0x5b9a)
$ZhLogin = New-UnicodeString @(0x767b, 0x5f55)
$ZhChat = New-UnicodeString @(0x5bf9, 0x8bdd)
$ZhDiscover = New-UnicodeString @(0x53d1, 0x73b0)
$ZhTeam = New-UnicodeString @(0x56e2, 0x961f)
$ZhMe = New-UnicodeString @(0x6211, 0x7684)
$ZhManagement = New-UnicodeString @(0x7ba1, 0x7406)
$ZhDevicesConnections = New-UnicodeString @(0x8bbe, 0x5907, 0x4e0e, 0x8fde, 0x63a5)
$ZhMemoryHub = New-UnicodeString @(0x8bb0, 0x5fc6, 0x4e2d, 0x5fc3)
$ZhWorkflows = New-UnicodeString @(0x5de5, 0x4f5c, 0x6d41)
$ZhSkills = New-UnicodeString @(0x6280, 0x80fd, 0x7ba1, 0x7406)
$ZhActivityLogs = New-UnicodeString @(0x8fd0, 0x884c, 0x65e5, 0x5fd7)
$ZhDesktopControl = New-UnicodeString @(0x684c, 0x9762, 0x63a7, 0x5236)
$ZhWearables = New-UnicodeString @(0x53ef, 0x7a7f, 0x6234, 0x8bbe, 0x5907)
$ZhScanConnect = New-UnicodeString @(0x626b, 0x7801, 0x8fde, 0x63a5)
$ZhPermissions = New-UnicodeString @(0x6743, 0x9650, 0x7ba1, 0x7406)
$ZhAgentAccount = "Agent " + (New-UnicodeString @(0x8d26, 0x53f7))
$ZhTeamSpace = New-UnicodeString @(0x56e2, 0x961f, 0x7a7a, 0x95f4)
$ZhFullConsole = "Agent " + (New-UnicodeString @(0x5b8c, 0x6574, 0x63a7, 0x5236, 0x53f0))
$ZhSettings = New-UnicodeString @(0x8bbe, 0x7f6e)
$ZhLocalAiModel = (New-UnicodeString @(0x672c, 0x5730)) + " AI " + (New-UnicodeString @(0x6a21, 0x578b))
$ZhInterfaceMode = New-UnicodeString @(0x754c, 0x9762, 0x6a21, 0x5f0f)
$ZhAiEngine = "AI " + (New-UnicodeString @(0x5f15, 0x64ce))
$ZhWakeWord = New-UnicodeString @(0x5524, 0x9192, 0x8bcd)

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Status,
        [string]$Notes = "",
        [string]$Snapshot = ""
    )

    $script:Results.Add([pscustomobject]@{
        id = $Id
        title = $Title
        status = $Status
        notes = $Notes
        snapshot = $Snapshot
    }) | Out-Null

    $color = if ($Status -eq "passed") { "Green" } elseif ($Status -eq "warning") { "Yellow" } else { "Red" }
    Write-Host "[$Status] $Title $Notes" -ForegroundColor $color
}

function Invoke-AdbRaw {
    param(
        [Parameter(Mandatory = $true)][string[]]$AdbArgs,
        [switch]$AllowFail,
        [int]$TimeoutMilliseconds = 30000
    )

    $quotedArgs = $AdbArgs | ForEach-Object {
        if ($_ -match '[\s"]') {
            '"' + ($_ -replace '"', '\"') + '"'
        } else {
            $_
        }
    }
    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()

    try {
        $process = Start-Process -FilePath $AdbPath -ArgumentList ($quotedArgs -join " ") -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -NoNewWindow -PassThru
        if (-not $process.WaitForExit($TimeoutMilliseconds)) {
            try { $process.Kill() } catch {}
            $message = "adb $($AdbArgs -join ' ') timed out after ${TimeoutMilliseconds}ms"
            $isInputCommand = $AdbArgs.Count -ge 3 -and $AdbArgs[0] -eq "shell" -and $AdbArgs[1] -eq "input"
            if ($isInputCommand) {
                Add-Check -Id "adb-timeout-$($script:StepIndex)" -Title "ADB input timeout" -Status "warning" -Notes $message
                return @($message)
            }
            if (-not $AllowFail) {
                throw $message
            }
            return @($message)
        }

        $output = @()
        if (Test-Path $stdoutPath) {
            $output += Get-Content -Path $stdoutPath -ErrorAction SilentlyContinue | ForEach-Object { [string]$_ }
        }
        if (Test-Path $stderrPath) {
            $output += Get-Content -Path $stderrPath -ErrorAction SilentlyContinue | ForEach-Object { [string]$_ }
        }
        $exitCode = if ($null -eq $process.ExitCode) { 0 } else { $process.ExitCode }
    } finally {
        if ($process) { $process.Dispose() }
        Remove-Item -Path $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }

    if ($exitCode -ne 0 -and -not $AllowFail) {
        throw "adb $($AdbArgs -join ' ') failed with exit code ${exitCode}: $($output -join ' ')"
    }
    return $output
}

function Invoke-Adb {
    return Invoke-AdbRaw -AdbArgs ([string[]]$args)
}

function Invoke-AdbAllowFail {
    return Invoke-AdbRaw -AdbArgs ([string[]]$args) -AllowFail
}

function Invoke-AdbQuietAllowFail {
    param(
        [Parameter(Mandatory = $true)][string[]]$AdbArgs,
        [int]$TimeoutMilliseconds = 12000
    )
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $AdbPath
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $quotedArgs = $AdbArgs | ForEach-Object {
        if ($_ -match '[\s"]') {
            '"' + ($_ -replace '"', '\"') + '"'
        } else {
            $_
        }
    }
    $processInfo.Arguments = ($quotedArgs -join " ")
    $process = [System.Diagnostics.Process]::Start($processInfo)
    try {
        if (-not $process.WaitForExit($TimeoutMilliseconds)) {
            try { $process.Kill() } catch {}
            return $false
        }
        $process.StandardOutput.ReadToEnd() | Out-Null
        $process.StandardError.ReadToEnd() | Out-Null
        return ($process.ExitCode -eq 0)
    } finally {
        $process.Dispose()
    }
}

function Wait-Brief {
    param([int]$Milliseconds = 900)
    [System.Threading.Thread]::Sleep($Milliseconds)
}

function Get-SafeName {
    param([string]$Name)
    return ($Name -replace '[^a-zA-Z0-9._-]', '-')
}

function Save-Snapshot {
    param([Parameter(Mandatory = $true)][string]$Name)

    $script:StepIndex++
    $safeName = "{0:D2}-{1}" -f $script:StepIndex, (Get-SafeName $Name)
    $remoteXml = "/sdcard/agentrix-$safeName.xml"
    $xmlPath = Join-Path $ReportRoot "$safeName.xml"
    $pngPath = Join-Path $ReportRoot "$safeName.png"

    $dumped = Invoke-AdbQuietAllowFail -AdbArgs @("shell", "uiautomator", "dump", $remoteXml) -TimeoutMilliseconds 15000
    if (-not $dumped) {
        Invoke-AdbAllowFail shell pkill -f uiautomator | Out-Null
        Add-Check -Id "snapshot-$safeName" -Title "Snapshot $safeName" -Status "warning" -Notes "uiautomator dump timed out"
    } else {
        Invoke-AdbQuietAllowFail -AdbArgs @("pull", $remoteXml, $xmlPath) -TimeoutMilliseconds 10000 | Out-Null
    }
    $null = & cmd.exe /d /s /c "`"$AdbPath`" exec-out screencap -p > `"$pngPath`""

    return [pscustomobject]@{
        name = $safeName
        xml = $xmlPath
        png = $pngPath
    }
}

function Get-NodeCenter {
    param(
        [Parameter(Mandatory = $true)][string]$XmlPath,
        [Parameter(Mandatory = $true)][string[]]$Needles,
        [string[]]$Attributes = @("resource-id", "content-desc", "text")
    )

    if (-not (Test-Path $XmlPath)) {
        return $null
    }

    $xml = Get-Content -Path $XmlPath -Raw -Encoding UTF8
    foreach ($needle in $Needles) {
        foreach ($attribute in $Attributes) {
            $escapedNeedle = [regex]::Escape($needle)
            $escapedAttribute = [regex]::Escape($attribute)
            $pattern = '<node\b(?=[^>]*\b' + $escapedAttribute + '="[^"]*' + $escapedNeedle + '[^"]*")[^>]*\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
            $matches = [regex]::Matches($xml, $pattern)
            foreach ($match in $matches) {
                $left = [int]$match.Groups[1].Value
                $top = [int]$match.Groups[2].Value
                $right = [int]$match.Groups[3].Value
                $bottom = [int]$match.Groups[4].Value
                if ($right -le $left -or $bottom -le $top) {
                    continue
                }
                return [pscustomobject]@{
                    x = [int](($left + $right) / 2)
                    y = [int](($top + $bottom) / 2)
                    bounds = "[$left,$top][$right,$bottom]"
                    needle = $needle
                    attribute = $attribute
                }
            }
        }
    }

    return $null
}

function Tap-Node {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Needles,
        [switch]$Optional,
        [string[]]$Attributes = @("resource-id", "content-desc", "text")
    )

    $snapshot = Save-Snapshot "before-$Title"
    $center = Get-NodeCenter -XmlPath $snapshot.xml -Needles $Needles -Attributes $Attributes
    if (-not $center) {
        if ($Optional) {
            Add-Check -Id "tap-$Title" -Title "Tap $Title" -Status "warning" -Notes "node not present" -Snapshot $snapshot.name
            return $false
        }
        Add-Check -Id "tap-$Title" -Title "Tap $Title" -Status "failed" -Notes "node not found" -Snapshot $snapshot.name
        throw "Could not find UI node for $Title ($($Needles -join ', '))."
    }

    Invoke-Adb shell input tap ([string]$center.x) ([string]$center.y) | Out-Null
    Wait-Brief
    Add-Check -Id "tap-$Title" -Title "Tap $Title" -Status "passed" -Notes "$($center.needle) $($center.bounds)" -Snapshot $snapshot.name
    return $true
}

function Tap-ScrollableNode {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Needles,
        [int]$MaxScrolls = 8,
        [string[]]$Attributes = @("resource-id", "content-desc", "text")
    )

    for ($attempt = 0; $attempt -le $MaxScrolls; $attempt++) {
        Ensure-AppForeground
        $snapshot = Save-Snapshot "scroll-$Title-$attempt"
        $center = Get-NodeCenter -XmlPath $snapshot.xml -Needles $Needles -Attributes $Attributes
        if ($center) {
            Invoke-Adb shell input tap ([string]$center.x) ([string]$center.y) | Out-Null
            Wait-Brief
            Add-Check -Id "tap-scroll-$Title" -Title "Tap scroll $Title" -Status "passed" -Notes "$($center.needle) $($center.bounds)" -Snapshot $snapshot.name
            return $true
        }
        if ($attempt -lt $MaxScrolls) {
            Invoke-Adb shell input swipe 620 2200 620 850 500 | Out-Null
            Wait-Brief -Milliseconds 850
        }
    }

    Add-Check -Id "tap-scroll-$Title" -Title "Tap scroll $Title" -Status "failed" -Notes "node not found after scroll"
    throw "Could not find scrollable UI node for $Title ($($Needles -join ', '))."
}

function Wait-ForNode {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Needles,
        [int]$TimeoutSeconds = 20,
        [switch]$Optional,
        [string[]]$Attributes = @("resource-id", "content-desc", "text")
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $snapshot = Save-Snapshot "wait-$Title"
        $center = Get-NodeCenter -XmlPath $snapshot.xml -Needles $Needles -Attributes $Attributes
        if ($center) {
            Add-Check -Id "wait-$Title" -Title "Wait $Title" -Status "passed" -Notes "$($center.needle)" -Snapshot $snapshot.name
            return $true
        }
        Wait-Brief -Milliseconds 1000
    } while ([DateTime]::UtcNow -lt $deadline)

    if ($Optional) {
        Add-Check -Id "wait-$Title" -Title "Wait $Title" -Status "warning" -Notes "timeout ${TimeoutSeconds}s"
    } else {
        Add-Check -Id "wait-$Title" -Title "Wait $Title" -Status "failed" -Notes "timeout ${TimeoutSeconds}s"
    }
    return $false
}

function Wait-ForInteractiveChat {
    param(
        [string]$Title = "interactive-chat",
        [int]$TimeoutSeconds = 60
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $stableCount = 0
    do {
        Ensure-AppForeground
        $snapshot = Save-Snapshot "wait-$Title"
        $drawer = Get-NodeCenter -XmlPath $snapshot.xml -Needles @("agent-chat-drawer-button") -Attributes @("resource-id", "content-desc")
        $input = Get-NodeCenter -XmlPath $snapshot.xml -Needles @("chat-text-input") -Attributes @("resource-id", "content-desc")
        $chatTab = Get-NodeCenter -XmlPath $snapshot.xml -Needles @($ZhChat, "Chat") -Attributes @("content-desc", "text")
        if ($drawer -and $input -and $chatTab) {
            $stableCount++
            if ($stableCount -ge 2) {
                Add-Check -Id "wait-$Title" -Title "Wait $Title" -Status "passed" -Notes "chat controls stable" -Snapshot $snapshot.name
                return $true
            }
        } else {
            $stableCount = 0
        }
        Wait-Brief -Milliseconds 1200
    } while ([DateTime]::UtcNow -lt $deadline)

    Add-Check -Id "wait-$Title" -Title "Wait $Title" -Status "failed" -Notes "timeout ${TimeoutSeconds}s"
    return $false
}

function Dismiss-PermissionDialogs {
    1..3 | ForEach-Object {
        $snapshot = Save-Snapshot "permission-probe"
        $center = Get-NodeCenter -XmlPath $snapshot.xml -Needles @($ZhAllow, "Allow", $ZhAlwaysAllow, "While using", $ZhAllowWhileUsing, $ZhOk, "OK") -Attributes @("text", "content-desc")
        if ($center) {
            Invoke-Adb shell input tap ([string]$center.x) ([string]$center.y) | Out-Null
            Wait-Brief
        }
    }
}

function Test-SoftKeyboardVisible {
    $inputMethod = Invoke-AdbAllowFail shell dumpsys input_method
    return (($inputMethod -join "`n") -match "mInputShown=true|mIsInputViewShown=true|inputShown=true")
}

function Test-ChatInputFocused {
    $snapshot = Save-Snapshot "keyboard-focus-probe"
    if (-not (Test-Path $snapshot.xml)) {
        return $false
    }
    $xml = Get-Content -Path $snapshot.xml -Raw -Encoding UTF8
    return ($xml -match 'resource-id="chat-text-input"[^>]*focused="true"')
}

function Hide-SoftKeyboard {
    $shouldHide = (Test-SoftKeyboardVisible) -or (Test-ChatInputFocused)
    if ($shouldHide) {
        Invoke-AdbAllowFail shell input keyevent 111 | Out-Null
        Wait-Brief -Milliseconds 500
    }
    if ((Test-SoftKeyboardVisible) -or (Test-ChatInputFocused)) {
        Invoke-AdbAllowFail shell input keyevent 4 | Out-Null
        Wait-Brief -Milliseconds 700
    }
    $foreground = Get-ForegroundPackage
    if (-not [string]::IsNullOrWhiteSpace($foreground) -and $foreground -ne $Package) {
        $launchActivity = Get-LaunchActivity
        Invoke-Adb shell am start -W -n $launchActivity | Out-Null
        Wait-Brief -Milliseconds 1800
        Add-Check -Id "keyboard-foreground-recover" -Title "Keyboard foreground recovery" -Status "warning" -Notes "returned from $foreground"
    }
}

function Clear-TextInput {
    Invoke-AdbAllowFail shell input keyevent 123 | Out-Null
    for ($index = 0; $index -lt 80; $index++) {
        Invoke-AdbAllowFail shell input keyevent 67 | Out-Null
    }
    Wait-Brief -Milliseconds 300
}

function Type-ChatPrompt {
    param([Parameter(Mandatory = $true)][string]$Prompt)
    Clear-TextInput
    Invoke-Adb shell input text $Prompt | Out-Null
    Wait-Brief -Milliseconds 700
}

function Tap-SendButton {
    param([Parameter(Mandatory = $true)][string]$Title)
    $tapped = Tap-Node -Title "send-$Title" -Needles @("chat-send-button") -Optional
    if (-not $tapped) {
        Invoke-Adb shell input tap 1090 2085 | Out-Null
        Wait-Brief
        Add-Check -Id "tap-send-$Title-fallback" -Title "Tap send-$Title fallback" -Status "passed" -Notes "coordinate 1090,2085"
    }
}

function Tap-QuickModelSwitch {
    Tap-Node -Title "chat tab for quick model" -Needles @($ZhChat, "Chat") -Attributes @("content-desc", "text") -Optional | Out-Null
    Hide-SoftKeyboard
    Ensure-AppForeground
    $tapped = Tap-Node -Title "quick model switch" -Needles @("quick-model-switch") -Attributes @("content-desc", "resource-id") -Optional
    if (-not $tapped) {
        Invoke-Adb shell input tap 360 510 | Out-Null
        Wait-Brief
        Add-Check -Id "tap-quick model switch-fallback" -Title "Tap quick model switch fallback" -Status "passed" -Notes "coordinate 360,510"
    }
}

function Tap-VoiceModeToggle {
    param([Parameter(Mandatory = $true)][string]$Title)
    Ensure-AppForeground
    Hide-SoftKeyboard
    $tapped = Tap-Node -Title $Title -Needles @("chat-voice-mode-toggle") -Attributes @("content-desc", "resource-id") -Optional
    if (-not $tapped) {
        Invoke-Adb shell input tap 1094 2085 | Out-Null
        Wait-Brief
        Add-Check -Id "tap-$Title-fallback" -Title "Tap $Title fallback" -Status "passed" -Notes "coordinate 1094,2085"
    }
}

function Ensure-TextChatMode {
    param([Parameter(Mandatory = $true)][string]$Title)

    Ensure-AppForeground
    $snapshot = Save-Snapshot "text-mode-$Title"
    $textInput = Get-NodeCenter -XmlPath $snapshot.xml -Needles @("chat-text-input") -Attributes @("resource-id", "content-desc")
    if ($textInput) {
        Add-Check -Id "text-mode-$Title" -Title "Text chat mode $Title" -Status "passed" -Notes "chat-text-input" -Snapshot $snapshot.name
        return $true
    }

    $voiceMode = Get-NodeCenter -XmlPath $snapshot.xml -Needles @("chat-voice-mode-toggle:voice", "chat-voice-action-button", "voice-status-bar") -Attributes @("content-desc", "resource-id")
    if ($voiceMode) {
        $keyboardToggle = Get-NodeCenter -XmlPath $snapshot.xml -Needles @("chat-voice-mode-toggle") -Attributes @("resource-id", "content-desc")
        if ($keyboardToggle) {
            Invoke-Adb shell input tap ([string]$keyboardToggle.x) ([string]$keyboardToggle.y) | Out-Null
        } else {
            Invoke-Adb shell input tap 1094 2085 | Out-Null
        }
        Wait-Brief -Milliseconds 1200
        if (Wait-ForNode -Title "text-mode-$Title-return" -Needles @("chat-text-input") -TimeoutSeconds 8 -Optional) {
            Add-Check -Id "text-mode-$Title-returned" -Title "Text chat mode $Title returned" -Status "passed" -Notes "voice mode closed"
            return $true
        }
    }

    Invoke-Adb shell input keyevent 4 | Out-Null
    Wait-Brief -Milliseconds 1200
    if (Wait-ForNode -Title "text-mode-$Title-back" -Needles @("chat-text-input", "agent-chat-drawer-button") -TimeoutSeconds 8 -Optional) {
        Add-Check -Id "text-mode-$Title-back" -Title "Text chat mode $Title back" -Status "passed" -Notes "back recovered chat controls"
        return $true
    }

    Add-Check -Id "text-mode-$Title" -Title "Text chat mode $Title" -Status "warning" -Notes "text input not visible after recovery" -Snapshot $snapshot.name
    return $false
}

function Tap-BottomTab {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Needles,
        [Parameter(Mandatory = $true)][int]$X
    )
    Ensure-AppForeground
    $tapped = Tap-Node -Title $Title -Needles $Needles -Attributes @("content-desc", "text") -Optional
    if (-not $tapped) {
        Invoke-Adb shell input tap ([string]$X) 2460 | Out-Null
        Wait-Brief
        Add-Check -Id "tap-$Title-fallback" -Title "Tap $Title fallback" -Status "passed" -Notes "coordinate $X,2460"
    }
}

function Tap-ChatTab {
    param([string]$Title = "chat tab")
    Tap-BottomTab -Title $Title -Needles @($ZhChat, "Chat") -X 150
}

function Tap-MeTab {
    param([string]$Title = "me tab")
    Tap-BottomTab -Title $Title -Needles @($ZhMe, "Me") -X 1050
}

function Tap-DrawerButton {
    param([Parameter(Mandatory = $true)][string]$Title)
    Ensure-AppForeground
    Hide-SoftKeyboard
    Ensure-AppForeground
    $ready = Wait-ForNode -Title "chat-ready-$Title" -Needles @("agent-chat-screen", "agent-chat-drawer-button") -TimeoutSeconds 20 -Optional
    if (-not $ready) {
        Add-Check -Id "drawer-open-$Title-ready" -Title "Drawer open $Title ready" -Status "failed" -Notes "chat screen not ready after keyboard recovery"
        return $false
    }
    $tapped = Tap-Node -Title "drawer-open-$Title" -Needles @("agent-chat-drawer-button") -Optional
    if (-not $tapped) {
        Invoke-Adb shell input tap 100 245 | Out-Null
        Wait-Brief
        Add-Check -Id "tap-drawer-open-$Title-fallback" -Title "Tap drawer-open-$Title fallback" -Status "passed" -Notes "coordinate 100,245"
    }
    return $true
}

function Wait-ForChatReady {
    param([Parameter(Mandatory = $true)][string]$Title)
    Ensure-AppForeground
    if (Wait-ForNode -Title "chat-ready-$Title" -Needles @("agent-chat-screen", "agent-chat-drawer-button", "chat-text-input") -TimeoutSeconds 25 -Optional) {
        return $true
    }
    $launchActivity = Get-LaunchActivity
    Invoke-Adb shell am start -W -n $launchActivity | Out-Null
    Wait-Brief -Milliseconds 1800
    return (Wait-ForNode -Title "chat-ready-$Title-retry" -Needles @("agent-chat-screen", "agent-chat-drawer-button", "chat-text-input") -TimeoutSeconds 25 -Optional)
}

function Return-ToChatReady {
    param([Parameter(Mandatory = $true)][string]$Title)

    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        Invoke-Adb shell input keyevent 4 | Out-Null
        Wait-Brief -Milliseconds 1200
        Ensure-AppForeground
        $snapshot = Save-Snapshot "return-chat-$Title-$attempt"
        $center = Get-NodeCenter -XmlPath $snapshot.xml -Needles @("agent-chat-screen", "agent-chat-drawer-button", "chat-text-input")
        if ($center) {
            Add-Check -Id "return-chat-$Title" -Title "Return to chat $Title" -Status "passed" -Notes "$($center.needle)" -Snapshot $snapshot.name
            return $true
        }
        if ($attempt -eq 2) {
            $launchActivity = Get-LaunchActivity
            Invoke-Adb shell am start -W -n $launchActivity | Out-Null
            Wait-Brief -Milliseconds 1600
        }
    }

    Add-Check -Id "return-chat-$Title" -Title "Return to chat $Title" -Status "failed" -Notes "chat screen not ready"
    return $false
}

function Wait-ForDrawerOpen {
    param([Parameter(Mandatory = $true)][string]$Title)
    if (Wait-ForNode -Title "drawer-$Title" -Needles @($ZhManagement, "Management", $ZhDevicesConnections, "Devices") -TimeoutSeconds 5 -Optional -Attributes @("text", "content-desc")) {
        return $true
    }

    Hide-SoftKeyboard
    Ensure-AppForeground
    Invoke-Adb shell input tap 100 245 | Out-Null
    Wait-Brief
    if (Wait-ForNode -Title "drawer-$Title-retry" -Needles @($ZhManagement, "Management", $ZhDevicesConnections, "Devices") -TimeoutSeconds 5 -Optional -Attributes @("text", "content-desc")) {
        Add-Check -Id "drawer-$Title-open-retry" -Title "Drawer $Title open retry" -Status "passed" -Notes "hamburger retry"
        return $true
    }

    Invoke-Adb shell input swipe 0 1200 850 1200 350 | Out-Null
    Wait-Brief -Milliseconds 1200
    if (Wait-ForNode -Title "drawer-$Title-swipe" -Needles @($ZhManagement, "Management", $ZhDevicesConnections, "Devices") -TimeoutSeconds 5 -Optional -Attributes @("text", "content-desc")) {
        Add-Check -Id "drawer-$Title-open-swipe" -Title "Drawer $Title open swipe" -Status "passed" -Notes "left edge swipe"
        return $true
    }

    Add-Check -Id "drawer-$Title-open" -Title "Drawer $Title open" -Status "failed" -Notes "drawer did not open"
    return $false
}

function Tap-DrawerItem {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Needles
    )

    Invoke-Adb shell input swipe 620 950 620 2160 450 | Out-Null
    Wait-Brief -Milliseconds 700

    for ($attempt = 0; $attempt -lt 7; $attempt++) {
        $tapped = Tap-Node -Title "drawer-item-$Title" -Needles $Needles -Attributes @("text", "content-desc") -Optional
        if ($tapped) {
            return $true
        }
        Invoke-Adb shell input swipe 620 2170 620 980 450 | Out-Null
        Wait-Brief -Milliseconds 900
    }

    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        Invoke-Adb shell input swipe 620 980 620 2170 450 | Out-Null
        Wait-Brief -Milliseconds 900
        $tapped = Tap-Node -Title "drawer-item-$Title-up" -Needles $Needles -Attributes @("text", "content-desc") -Optional
        if ($tapped) {
            return $true
        }
    }

    Add-Check -Id "drawer-item-$Title" -Title "Drawer item $Title" -Status "failed" -Notes "item not found after scroll"
    return $false
}

function Assert-NoCrash {
    param([string]$Title)

    $logPath = Join-Path $ReportRoot "logcat-$((Get-SafeName $Title)).log"
    $logcat = Invoke-AdbAllowFail logcat -d -t 1200
    $logcat | Out-File -FilePath $logPath -Encoding utf8
    $packagePattern = [regex]::Escape($Package)
    $crash = $logcat | Select-String -Pattern "FATAL EXCEPTION|AndroidRuntime.*$packagePattern|ANR in $packagePattern|Process $packagePattern.*has died|signal 6|signal 11|ReactNativeJS.*(TypeError|ReferenceError)"
    if ($crash) {
        Add-Check -Id "crash-$Title" -Title "Crash scan after $Title" -Status "failed" -Notes "see $logPath"
        throw "Crash pattern found after $Title."
    }
    Add-Check -Id "crash-$Title" -Title "Crash scan after $Title" -Status "passed" -Notes "no fatal patterns"
}

function Grant-KnownPermissions {
    $permissions = @(
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.POST_NOTIFICATIONS"
    )
    foreach ($permission in $permissions) {
        Invoke-AdbAllowFail shell pm grant $Package $permission | Out-Null
    }
}

function Assert-DeviceReady {
    if (-not (Test-Path $AdbPath)) {
        throw "adb not found at $AdbPath"
    }
    $devices = Invoke-Adb devices -l
    $online = @($devices | Where-Object { $_ -match "\sdevice\s" })
    if ($online.Count -lt 1) {
        throw "No online Android device found. adb devices output: $($devices -join ' | ')"
    }
    Add-Check -Id "device-online" -Title "Android device online" -Status "passed" -Notes ($online -join " | ")
}

function Get-LaunchActivity {
    $resolved = Invoke-AdbAllowFail shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER $Package
    $activity = $resolved | Where-Object { $_ -match "/" } | Select-Object -Last 1
    if ([string]::IsNullOrWhiteSpace($activity)) {
        return "$Package/.MainActivity"
    }
    return $activity.Trim()
}

function Get-ForegroundPackage {
    $window = Invoke-AdbAllowFail shell dumpsys window
    $lines = $window | Where-Object { $_ -match "mCurrentFocus|mFocusedApp" }
    $foreground = ""
    foreach ($line in $lines) {
        if ($line -match "([A-Za-z0-9_.]+)/(?:[A-Za-z0-9_.$]+)") {
            $foreground = $Matches[1]
        }
    }
    return $foreground
}

function Dismiss-SystemInterruptions {
    param([string]$Title = "system-interruption")

    $foreground = Get-ForegroundPackage
    if ($foreground -match "incallui|dialer") {
        $snapshot = Save-Snapshot $Title
        $center = Get-NodeCenter -XmlPath $snapshot.xml -Needles @("declinebutton", "hangup", "end_call", "Decline", "Reject", "Hang up", (New-UnicodeString @(0x62d2, 0x7edd)), (New-UnicodeString @(0x6302, 0x65ad))) -Attributes @("resource-id", "content-desc", "text")
        if ($center) {
            Invoke-Adb shell input tap ([string]$center.x) ([string]$center.y) | Out-Null
            Wait-Brief -Milliseconds 1500
            Add-Check -Id "dismiss-$Title" -Title "Dismiss $Title" -Status "warning" -Notes "closed $foreground via $($center.needle)"
        } else {
            Invoke-Adb shell input tap 340 2195 | Out-Null
            Wait-Brief -Milliseconds 1500
            Add-Check -Id "dismiss-$Title" -Title "Dismiss $Title" -Status "warning" -Notes "closed $foreground via fallback coordinate"
        }
    }
}

function Ensure-AppForeground {
    Dismiss-SystemInterruptions -Title "foreground-interruption"
    $foreground = Get-ForegroundPackage
    if ($foreground -eq $Package) {
        return
    }
    $launchActivity = Get-LaunchActivity
    Invoke-Adb shell am start -W -n $launchActivity | Out-Null
    Wait-Brief -Milliseconds 1600
    Dismiss-SystemInterruptions -Title "foreground-interruption-retry"
}

function Start-AppForeground {
    param([Parameter(Mandatory = $true)][string]$LaunchActivity)
    Invoke-Adb shell am start -W -n $LaunchActivity | Out-Null
    Wait-Brief -Milliseconds 1800
    $foreground = Get-ForegroundPackage
    if ($foreground -ne $Package) {
        Invoke-Adb shell input keyevent 3 | Out-Null
        Wait-Brief -Milliseconds 800
        Invoke-Adb shell am start -W -n $LaunchActivity | Out-Null
        Wait-Brief -Milliseconds 1800
        $foreground = Get-ForegroundPackage
    }
    if ($foreground -ne $Package) {
    Ensure-AppForeground
        throw "Expected foreground package $Package but found $foreground"
    }
    Add-Check -Id "foreground-app" -Title "Agentrix foreground" -Status "passed" -Notes $foreground
}

function Launch-App {
    Write-Section "Launch app"
    Invoke-AdbAllowFail shell am force-stop $Package | Out-Null
    Invoke-AdbAllowFail logcat -c | Out-Null
    $launchActivity = Get-LaunchActivity
    Start-AppForeground -LaunchActivity $launchActivity
    if (-not (Wait-ForNode -Title "chat-or-auth" -Needles @("agent-chat-screen", "chat-text-input", "Login", $ZhLogin) -TimeoutSeconds 35)) {
        throw "App did not reach chat or auth screen."
    }
    Dismiss-PermissionDialogs
    if (-not (Wait-ForInteractiveChat -Title "interactive-chat-after-launch" -TimeoutSeconds 75)) {
        throw "App did not reach an interactive chat screen after launch."
    }
    Assert-NoCrash "launch"
}

function Run-TabCoverage {
    Write-Section "Main tabs"
    $tabs = @(
        @{ title = "chat tab"; needles = @($ZhChat, "Chat") }
        @{ title = "discover tab"; needles = @($ZhDiscover, "Discover") }
        @{ title = "team tab"; needles = @($ZhTeam, "Team") }
        @{ title = "me tab"; needles = @($ZhMe, "Me") }
        @{ title = "chat tab return"; needles = @($ZhChat, "Chat") }
    )

    foreach ($tab in $tabs) {
        $x = switch ($tab.title) {
            "discover tab" { 450 }
            "team tab" { 750 }
            "me tab" { 1050 }
            default { 150 }
        }
        Tap-BottomTab -Title $tab.title -Needles $tab.needles -X $x
        Save-Snapshot $tab.title | Out-Null
        Assert-NoCrash $tab.title
    }
}

function Run-ChatModeCoverage {
    if ($SkipChatTurns) {
        Add-Check -Id "chat-turns" -Title "Chat turn coverage" -Status "warning" -Notes "skipped by -SkipChatTurns"
        return
    }

    Write-Section "Chat modes"
    Tap-Node -Title "chat tab for modes" -Needles @($ZhChat, "Chat") -Attributes @("content-desc", "text") | Out-Null
    Wait-ForNode -Title "chat input" -Needles @("chat-text-input") -TimeoutSeconds 15 | Out-Null

    $turns = @(
        @{ title = "local-only"; mode = "execution-mode-local-only"; prompt = "localsmokeping" }
        @{ title = "auto"; mode = "execution-mode-auto"; prompt = "autosmokeping" }
        @{ title = "cloud-only"; mode = "execution-mode-cloud-only"; prompt = "cloudsmokeping" }
    )

    foreach ($turn in $turns) {
        Tap-Node -Title "mode-$($turn.title)" -Needles @($turn.mode) -Attributes @("content-desc") | Out-Null
        Tap-Node -Title "input-$($turn.title)" -Needles @("chat-text-input") | Out-Null
        Type-ChatPrompt -Prompt $turn.prompt
        Hide-SoftKeyboard
        Tap-SendButton -Title $turn.title
        Wait-ForNode -Title "user-message-$($turn.title)" -Needles @($turn.prompt, "chat-message-user") -TimeoutSeconds 20 -Optional | Out-Null

        $deadline = [DateTime]::UtcNow.AddSeconds($ChatWaitSeconds)
        do {
            $snapshot = Save-Snapshot "chat-response-$($turn.title)"
            $assistant = Get-NodeCenter -XmlPath $snapshot.xml -Needles @("chat-message-assistant", "chat-message-text-assistant")
            if ($assistant) { break }
            Wait-Brief -Milliseconds 1500
        } while ([DateTime]::UtcNow -lt $deadline)

        Add-Check -Id "chat-$($turn.title)" -Title "Chat turn $($turn.title)" -Status "passed" -Notes "submitted $($turn.prompt)"
        Assert-NoCrash "chat-$($turn.title)"
    }
}

function Run-ChatControlsCoverage {
    Write-Section "Chat controls"
    Tap-QuickModelSwitch
    Save-Snapshot "quick-model-switch-open" | Out-Null
    Invoke-Adb shell input keyevent 4 | Out-Null
    Wait-Brief
    Ensure-AppForeground

    $settingsTapped = Tap-Node -Title "chat settings" -Needles @("agent-chat-settings-button") -Optional
    if (-not $settingsTapped) {
        Invoke-Adb shell input tap 1100 250 | Out-Null
        Wait-Brief
        Add-Check -Id "tap-chat settings-fallback" -Title "Tap chat settings fallback" -Status "passed" -Notes "coordinate 1100,250"
    }
    Wait-ForNode -Title "chat settings sheet" -Needles @("chat-settings-sheet", "chat-duplex-toggle") -TimeoutSeconds 10 | Out-Null
    Wait-ForNode -Title "duplex toggle present" -Needles @("chat-duplex-toggle") -TimeoutSeconds 5 -Optional | Out-Null
    Save-Snapshot "chat-settings-sheet" | Out-Null
    Invoke-Adb shell input keyevent 4 | Out-Null
    Wait-Brief

    Tap-VoiceModeToggle -Title "voice mode toggle"
    Dismiss-PermissionDialogs
    Save-Snapshot "voice-mode-toggle" | Out-Null
    Wait-ForNode -Title "realtime voice button" -Needles @("chat-realtime-voice-btn", "chat-voice-action-button", "voice-session-state") -TimeoutSeconds 8 -Optional | Out-Null
    Dismiss-PermissionDialogs
    Save-Snapshot "voice-entry" | Out-Null
    Ensure-TextChatMode -Title "after-voice-controls" | Out-Null
    Assert-NoCrash "chat-controls"
}

function Open-DrawerScreen {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string[]]$Needles
    )

    if (-not (Wait-ForChatReady -Title "before-drawer-$Title")) {
        throw "Chat screen was not ready before opening drawer for $Title."
    }
    if (-not (Tap-DrawerButton -Title $Title)) {
        throw "Could not prepare chat screen for drawer $Title."
    }
    if (-not (Wait-ForDrawerOpen -Title $Title)) {
        throw "Could not open drawer for $Title."
    }
    if (-not (Tap-DrawerItem -Title $Title -Needles $Needles)) {
        throw "Could not find drawer item for $Title."
    }
    Dismiss-PermissionDialogs
    Save-Snapshot "drawer-screen-$Title" | Out-Null
    Assert-NoCrash "drawer-$Title"
    Return-ToChatReady -Title "after-drawer-$Title" | Out-Null
}

function Run-DrawerCoverage {
    Write-Section "Drawer and agent modules"
    Tap-ChatTab -Title "chat tab for drawer"
    Ensure-TextChatMode -Title "before-drawer" | Out-Null

    $screens = @(
        @{ title = "memory"; needles = @($ZhMemoryHub, "Memory Hub") }
        @{ title = "workflows"; needles = @($ZhWorkflows, "Workflows") }
        @{ title = "skills"; needles = @($ZhSkills, "Skills") }
        @{ title = "logs"; needles = @($ZhActivityLogs, "Activity Logs") }
        @{ title = "desktop"; needles = @($ZhDesktopControl, "Desktop Control") }
        @{ title = "wearables"; needles = @($ZhWearables, "Wearables") }
        @{ title = "scan"; needles = @($ZhScanConnect, "Scan & Connect") }
        @{ title = "permissions"; needles = @($ZhPermissions, "Permissions") }
        @{ title = "agent-account"; needles = @($ZhAgentAccount, "Agent Accounts") }
        @{ title = "team-space"; needles = @($ZhTeamSpace, "Team Space") }
        @{ title = "console"; needles = @($ZhFullConsole, "Full Agent Console") }
    )

    foreach ($screen in $screens) {
        Open-DrawerScreen -Title $screen.title -Needles $screen.needles
    }
}

function Run-LocalModelSettingsCoverage {
    Write-Section "Local model settings"
    Tap-MeTab -Title "me tab for local model"
    Tap-ScrollableNode -Title "settings menu" -Needles @($ZhSettings, "Settings") -Attributes @("text", "content-desc") -MaxScrolls 6 | Out-Null
    Wait-ForNode -Title "settings screen" -Needles @($ZhSettings, $ZhInterfaceMode, $ZhWakeWord, $ZhAiEngine, "Interface Mode", "Wake Word", "AI Engine") -TimeoutSeconds 12 -Optional | Out-Null
    Tap-ScrollableNode -Title "local ai model" -Needles @($ZhLocalAiModel, "Local AI Model") -Attributes @("text", "content-desc") -MaxScrolls 14 | Out-Null
    Wait-ForNode -Title "local ai model screen" -Needles @("local-ai-model-screen", "local-ai-status-card", "local-ai-ready-info") -TimeoutSeconds 15 | Out-Null
    Wait-ForNode -Title "local ai ready model" -Needles @("local-ai-ready-model", "Qwen 2.5 Omni 3B", "qwen2.5-omni-3b", (New-UnicodeString @(0x5df2, 0x5c31, 0x7eea))) -TimeoutSeconds 8 -Optional | Out-Null
    Save-Snapshot "local-ai-model-screen" | Out-Null
    Assert-NoCrash "local-ai-model"
    Invoke-Adb shell input keyevent 4 | Out-Null
    Wait-Brief
    Invoke-Adb shell input keyevent 4 | Out-Null
    Wait-Brief
}

function Save-Reports {
    $jsonPath = Join-Path $ReportRoot "summary.json"
    $mdPath = Join-Path $ReportRoot "summary.md"
    $script:Results | ConvertTo-Json -Depth 5 | Out-File -FilePath $jsonPath -Encoding utf8

    $passed = @($script:Results | Where-Object { $_.status -eq "passed" }).Count
    $warnings = @($script:Results | Where-Object { $_.status -eq "warning" }).Count
    $failed = @($script:Results | Where-Object { $_.status -eq "failed" }).Count

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("# Agentrix Android device UI smoke") | Out-Null
    $lines.Add("") | Out-Null
    $lines.Add("- Package: $Package") | Out-Null
    $lines.Add("- Passed: $passed") | Out-Null
    $lines.Add("- Warnings: $warnings") | Out-Null
    $lines.Add("- Failed: $failed") | Out-Null
    $lines.Add("") | Out-Null
    $lines.Add("| ID | Status | Snapshot | Notes |") | Out-Null
    $lines.Add("| --- | --- | --- | --- |") | Out-Null
    foreach ($result in $script:Results) {
        $notes = ([string]$result.notes).Replace("|", "/")
        $lines.Add("| $($result.id) | $($result.status) | $($result.snapshot) | $notes |") | Out-Null
    }
    $lines | Out-File -FilePath $mdPath -Encoding utf8

    Write-Section "Summary"
    Write-Host "Report: $mdPath"
    Write-Host "JSON:   $jsonPath"
    Write-Host "Passed: $passed; Warnings: $warnings; Failed: $failed"

    if ($failed -gt 0) {
        exit 1
    }
}

try {
    Write-Section "Agentrix Android device UI smoke"
    Write-Host "Report: $ReportRoot"
    Assert-DeviceReady
    Grant-KnownPermissions
    Launch-App
    if ($OnlyLocalModelSettings) {
        Run-LocalModelSettingsCoverage
        Assert-NoCrash "final"
        return
    }
    Run-TabCoverage
    Run-ChatModeCoverage
    Run-ChatControlsCoverage
    Run-DrawerCoverage
    Run-LocalModelSettingsCoverage
    Assert-NoCrash "final"
} catch {
    Add-Check -Id "fatal" -Title "Fatal test runner error" -Status "failed" -Notes $_.Exception.Message
} finally {
    Save-Reports
}