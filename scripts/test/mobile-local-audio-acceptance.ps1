#requires -Version 5.1

param(
    [string]$ModelId = "qwen2.5-omni-3b",
    [string]$CloudModel = "claude-sonnet-4-20250514",
    [string]$RealtimeCloudModel = "",
    [string]$ApkPath = "",
    [string]$DeviceId = "",
    [string]$ReportDir = "",
    [Nullable[int]]$CloudInputTokens = $null,
    [Nullable[int]]$CloudOutputTokens = $null,
    [Nullable[int]]$CloudCacheReadTokens = $null,
    [Nullable[int]]$CloudCacheWriteTokens = $null,
    [switch]$SyntaxCheck,
    [switch]$SkipInstall,
    [switch]$SkipTests,
    [switch]$TryOfflineToggle
)

$ErrorActionPreference = "Stop"

$RepoRoot = "D:\wsl\Ubuntu-24.04\Code\Agentrix\Agentrix-website"
$PackageName = "app.agentrix.claw"
$ActivityName = "$PackageName/.MainActivity"
$TimeStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ReportRoot = if ($ReportDir) { $ReportDir } else { Join-Path $RepoRoot "tests\reports\mobile-local-audio-$TimeStamp" }
$null = New-Item -ItemType Directory -Path $ReportRoot -Force
$EffectiveRealtimeCloudModel = if ([string]::IsNullOrWhiteSpace($RealtimeCloudModel)) { $CloudModel } else { $RealtimeCloudModel }

$script:StepResults = [System.Collections.Generic.List[object]]::new()

function Write-Info([string]$Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Pass([string]$Message) {
    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Section([string]$Message) {
    Write-Host "`n== $Message ==" -ForegroundColor Magenta
}

function Get-AdbPath {
    $candidates = @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "$env:ANDROID_HOME\platform-tools\adb.exe",
        "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($candidates.Count -gt 0) {
        return $candidates[0]
    }

    $adbFromPath = Get-Command adb -ErrorAction SilentlyContinue
    if ($adbFromPath) {
        return $adbFromPath.Source
    }

    return $null
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $adb = Get-AdbPath
    if (-not $adb) {
        throw "未找到 ADB。请先安装 Android platform-tools，或配置 ANDROID_HOME。"
    }

    $finalArgs = @()
    if ($script:ResolvedDeviceId) {
        $finalArgs += "-s"
        $finalArgs += $script:ResolvedDeviceId
    }
    $finalArgs += $Arguments
    return & $adb @finalArgs 2>&1
}

function Resolve-DeviceId {
    if ($DeviceId) {
        return $DeviceId
    }

    $adb = Get-AdbPath
    if (-not $adb) {
        throw "未找到 ADB。请先安装 Android platform-tools，或配置 ANDROID_HOME。"
    }

    $devices = & $adb devices 2>&1
    $online = @($devices | Where-Object { $_ -match "\tdevice$" } | ForEach-Object { ($_ -split "\t")[0].Trim() })
    if ($online.Count -eq 0) {
        throw "未检测到 Android 真机。请连接设备，并确认 adb devices 显示为 'device'。"
    }
    if ($online.Count -gt 1) {
        throw "检测到多台设备。请使用 -DeviceId <serial> 重新执行。"
    }

    return $online[0]
}

function Find-ApkPath {
    if ($ApkPath) {
        if (-not (Test-Path $ApkPath)) {
            throw "未找到 APK：$ApkPath"
        }
        return (Resolve-Path $ApkPath).Path
    }

    $candidates = @(
        (Join-Path $RepoRoot "android\app\build\outputs\apk\debug\app-debug.apk"),
        (Join-Path $RepoRoot "android\app\build\outputs\apk\release\app-release.apk")
    ) | Where-Object { Test-Path $_ }

    if ($candidates.Count -eq 0) {
        return ""
    }

    return (Resolve-Path $candidates[0]).Path
}

function Save-StageLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageId
    )

    $logPath = Join-Path $ReportRoot "$StageId.log"
    Invoke-Adb -Arguments @("logcat", "-d") | Out-File -FilePath $logPath -Encoding utf8
    Invoke-Adb -Arguments @("logcat", "-c") | Out-Null
    return $logPath
}

function Read-Confirmation {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Prompt
    )

    while ($true) {
        $value = (Read-Host "$Prompt [pass/fail/skip]").Trim().ToLowerInvariant()
        if ($value -in @("pass", "fail", "skip")) {
            return $value
        }
    }
}

function Add-StepResult {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Id,
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$Instructions
    )

    Write-Section $Title
    Write-Host $Instructions
    $status = Read-Confirmation -Prompt "Step status"
    $notes = Read-Host "Notes (optional)"
    $logPath = Save-StageLog -StageId $Id
    $script:StepResults.Add([pscustomobject]@{
        Id = $Id
        Title = $Title
        Status = $status
        Notes = $notes
        LogPath = $logPath
    }) | Out-Null
}

function Set-NetworkState {
    param(
        [Parameter(Mandatory = $true)]
        [bool]$Offline
    )

    $wifiState = if ($Offline) { "disable" } else { "enable" }
    $dataState = if ($Offline) { "disable" } else { "enable" }

    try {
        Invoke-Adb -Arguments @("shell", "svc", "wifi", $wifiState) | Out-Null
        Invoke-Adb -Arguments @("shell", "svc", "data", $dataState) | Out-Null
        Start-Sleep -Seconds 2
        return $true
    } catch {
        return $false
    }
}

function Get-DeviceInfo {
    $model = (Invoke-Adb -Arguments @("shell", "getprop", "ro.product.model") | Out-String).Trim()
    $androidVersion = (Invoke-Adb -Arguments @("shell", "getprop", "ro.build.version.release") | Out-String).Trim()
    return [pscustomobject]@{
        DeviceId = $script:ResolvedDeviceId
        Model = $model
        AndroidVersion = $androidVersion
    }
}

function Invoke-FocusedTests {
    $command = "cd /mnt/d/wsl/Ubuntu-24.04/Code/Agentrix/Agentrix-website && npx --yes tsx --test src/services/mobileLocalMultimodalRouting.service.spec.ts src/services/localVoiceCapabilityPlanner.service.spec.ts src/services/localPcmWav.service.spec.ts src/services/liveSpeechSession.service.spec.ts"
    $output = wsl bash -lc $command 2>&1
    $outputPath = Join-Path $ReportRoot "00-focused-tests.log"
    $output | Out-File -FilePath $outputPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "聚焦测试失败。详情见：$outputPath"
    }
    return $outputPath
}

function Read-TokenValue {
    param(
        [string]$Name,
        [Nullable[int]]$CurrentValue
    )

    if ($null -ne $CurrentValue) {
        return [int]$CurrentValue
    }

    $raw = Read-Host "$Name (leave empty to skip cost compare)"
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }

    $parsed = 0
    if ([int]::TryParse($raw, [ref]$parsed)) {
        return $parsed
    }

    return $null
}

function Get-IntOrZero {
    param(
        [Nullable[int]]$Value
    )

    if ($null -eq $Value) {
        return 0
    }

    return [int]$Value
}

function Get-CostSummary {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Model,
        [Parameter(Mandatory = $true)]
        [int]$InputTokens,
        [Parameter(Mandatory = $true)]
        [int]$OutputTokens,
        [Parameter(Mandatory = $true)]
        [int]$CacheReadTokens,
        [Parameter(Mandatory = $true)]
        [int]$CacheWriteTokens
    )

    $linuxCommand = @(
        "cd /mnt/d/wsl/Ubuntu-24.04/Code/Agentrix/Agentrix-website/backend",
        "npx ts-node scripts/calc-turn-cost.ts --model '$Model' --input '$InputTokens' --output '$OutputTokens' --cache-read '$CacheReadTokens' --cache-write '$CacheWriteTokens'"
    ) -join " && "

    $raw = wsl bash -lc $linuxCommand 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "成本计算失败：$raw"
    }

    return $raw | ConvertFrom-Json
}

function Write-Report {
    param(
        [Parameter(Mandatory = $true)]
        [object]$DeviceInfo,
        [Parameter(Mandatory = $true)]
        [string]$FocusedTestLog,
        [object]$CostSummary
    )

    $reportPath = Join-Path $ReportRoot "report.md"
    $lines = New-Object System.Collections.Generic.List[string]
        $lines.Add("# 移动端本地音频与 realtime 语音验收报告") | Out-Null
    $lines.Add("") | Out-Null
        $lines.Add("- 时间：$(Get-Date -Format s)") | Out-Null
        $lines.Add("- 验收模型：$ModelId") | Out-Null
        $lines.Add("- 云端 realtime 模型：$EffectiveRealtimeCloudModel") | Out-Null
        $lines.Add("- 云端基线模型：$CloudModel") | Out-Null
        $lines.Add("- 设备：$($DeviceInfo.Model)") | Out-Null
        $lines.Add("- Android 版本：$($DeviceInfo.AndroidVersion)") | Out-Null
        $lines.Add("- 设备 ID：$($DeviceInfo.DeviceId)") | Out-Null
        $lines.Add("- 聚焦测试日志：$(if ($FocusedTestLog) { $FocusedTestLog } else { '已跳过' })") | Out-Null
    $lines.Add("") | Out-Null
        $lines.Add("## 总览") | Out-Null
    $lines.Add("") | Out-Null
        $lines.Add("- 通过步骤：$(@($script:StepResults | Where-Object { $_.Status -eq 'pass' }).Count)") | Out-Null
        $lines.Add("- 失败步骤：$(@($script:StepResults | Where-Object { $_.Status -eq 'fail' }).Count)") | Out-Null
        $lines.Add("- 跳过步骤：$(@($script:StepResults | Where-Object { $_.Status -eq 'skip' }).Count)") | Out-Null
    $lines.Add("") | Out-Null
        $lines.Add("## 验收步骤") | Out-Null
    $lines.Add("") | Out-Null

    foreach ($step in $script:StepResults) {
        $lines.Add("### $($step.Id) $($step.Title)") | Out-Null
        $lines.Add("") | Out-Null
                $lines.Add("- 状态：$($step.Status)") | Out-Null
                $lines.Add("- 备注：$($step.Notes)") | Out-Null
                $lines.Add("- 日志：$($step.LogPath)") | Out-Null
        $lines.Add("") | Out-Null
    }

        $lines.Add("## 成本对比") | Out-Null
    $lines.Add("") | Out-Null
    if ($CostSummary) {
      $savingPct = if ($CostSummary.costUsd -gt 0) { 100 } else { 0 }
        $lines.Add('- 端侧本地路径 API 成本：$0.0000') | Out-Null
            $lines.Add("- 云端基线模型：$($CostSummary.model)") | Out-Null
            $lines.Add("- 云端基线 token：in=$($CostSummary.inputTokens), out=$($CostSummary.outputTokens), cacheRead=$($CostSummary.cacheReadTokens), cacheWrite=$($CostSummary.cacheWriteTokens)") | Out-Null
            $lines.Add("- 云端基线成本：$($CostSummary.formattedCost) ($([math]::Round([double]$CostSummary.costUsd, 6)))") | Out-Null
            $lines.Add("- 本轮 API 成本节省：${savingPct}%") | Out-Null
    } else {
            $lines.Add("- 尚未提供云端 token 数据。请在跑完云端基线后，从 usage/cost 面板或后端日志补填。") | Out-Null
    }

    $lines.Add("") | Out-Null
        $lines.Add("## 证据") | Out-Null
    $lines.Add("") | Out-Null
        $lines.Add("- 如需导出语音诊断，请在 App 中打开：Me -> Debug Logs -> Share。") | Out-Null
        $lines.Add("- 每个阶段的 logcat 都保存在本报告旁边。") | Out-Null

    $lines | Out-File -FilePath $reportPath -Encoding utf8
    return $reportPath
}

if ($SyntaxCheck) {
    Write-Host "SYNTAX_CHECK_OK"
    exit 0
}

$script:ResolvedDeviceId = Resolve-DeviceId
$deviceInfo = Get-DeviceInfo

Write-Section "Preflight"
Write-Info "设备：$($deviceInfo.Model) Android $($deviceInfo.AndroidVersion) [$($deviceInfo.DeviceId)]"

$focusedTestLog = ""
if (-not $SkipTests) {
    $focusedTestLog = Invoke-FocusedTests
    Write-Pass "本地音频聚焦测试通过"
} else {
    Write-Warn "已跳过聚焦测试"
}

Invoke-Adb -Arguments @("logcat", "-c") | Out-Null

$resolvedApkPath = Find-ApkPath
if (-not $SkipInstall) {
    if (-not $resolvedApkPath) {
        throw "未找到 APK。请传入 -ApkPath，或先构建 android/app/build/outputs/apk/debug/app-debug.apk。"
    }
    Write-Section "安装 APK"
    Write-Info "正在安装 $resolvedApkPath"
    Invoke-Adb -Arguments @("install", "-r", $resolvedApkPath) | Out-Host
    Write-Pass "APK 安装完成"
} else {
    Write-Warn "已跳过 APK 安装"
}

Write-Section "启动 App"
Invoke-Adb -Arguments @("shell", "am", "start", "-n", $ActivityName) | Out-Host
Start-Sleep -Seconds 4
Write-Pass "App 已启动"

Add-StepResult -Id "01" -Title "下载本地模型" -Instructions @"
请在真机上完成以下操作：
1. 打开 Me -> Local AI Model。
2. 下载并选中 $ModelId 的完整包。
3. 确认页面显示完整包已就绪，且模型元数据包含音频输入能力。
4. 如页面能看到语音输出附件状态，也一并确认是否已具备端侧 speech output 资产。
完成后回到终端，输入 pass / fail / skip。
"@

Add-StepResult -Id "02" -Title "本地持麦语音 -> 本地推理" -Instructions @"
请在真机上完成以下操作：
1. 打开 AgentChat，并确认当前选中的模型是 $ModelId。
2. 打开 Me -> Debug Logs，清空旧诊断。
3. 按住麦克风，说一条固定口令，例如：'请在本地用一句话总结这段音频。'
4. 预期结果：
    - 录音结束后，App 直接进入本地推理。
    - 不会触发云端 /voice/transcribe 路径。
    - 会返回正常的 assistant 回复。
5. 在 AgentChat 的 Voice Diagnostics 或 Me -> Debug Logs 中确认至少出现 hold-local-audio-started 和 hold-local-audio-stop。
6. 如果本轮失败，请在备注里写清楚是录音失败、转本地附件失败，还是本地模型回复失败。
完成后输入 pass / fail / skip。
"@

Add-StepResult -Id "03" -Title "本地 duplex 连续语音" -Instructions @"
请在真机上完成以下操作：
1. 继续使用本地模型 $ModelId。
2. 打开 Voice Mode，并在设置里开启 duplex / live mode。
3. 说一条简短口令，例如：'你好，请用一句话回应我。'
4. 预期结果：
    - 能直接连续说话，不需要按住按钮。
    - 用户这一轮仍然进入本地模型，而不是切回云端 realtime socket。
    - assistant 能正常返回一条本地回复。
5. 在 AgentChat 的 Voice Diagnostics 或 Me -> Debug Logs 中确认：
    - 至少出现 local-duplex-audio-started，或在当前设备路径上出现 live-speech-final。
    - 不应把这一轮描述成云端 realtime session；如果日志里出现 realtime-voice socket-connected / session-ready，请在备注里说明当时的模型与页面状态。
完成后输入 pass / fail / skip。
"@

Add-StepResult -Id "04" -Title "云端 realtime duplex 会话" -Instructions @"
请在真机上完成以下操作：
1. 手动切换到一个云端模型，例如 $EffectiveRealtimeCloudModel。
2. 保持 voice mode，开启 duplex / live mode。
3. 说一条固定口令，例如：'请确认 realtime 语音会话已经接通。'
4. 预期结果：
    - 设备会建立真实的 realtime voice session，而不是浏览器模拟。
    - 一轮 final transcript 能进入会话，assistant 会返回实时回复或语音播放。
5. 在 Voice Diagnostics / Debug Logs 中确认至少出现：
    - realtime-voice socket-connected
    - realtime-voice session-ready
    - realtime-voice final-transcript
完成后输入 pass / fail / skip。
"@

Add-StepResult -Id "05" -Title "云端 realtime 打断与 barge-in" -Instructions @"
请在真机上完成以下操作：
1. 保持上一轮的云端 realtime duplex 模式。
2. 当 assistant 还在播报或回复时，立刻再说一句新口令，例如：'停止刚才的回答，换成一句更短的回复。'
3. 预期结果：
    - 当前 assistant 播报被打断。
    - 新口令被当成新一轮用户输入继续处理。
4. 在 Voice Diagnostics / Debug Logs 中优先确认：
    - voice-session barge-in
    - 或 realtime-voice final-transcript 与后续新回复衔接正常。
完成后输入 pass / fail / skip。
"@

$offlineToggleWorked = $false
if ($TryOfflineToggle) {
    $offlineToggleWorked = Set-NetworkState -Offline $true
    if ($offlineToggleWorked) {
        Write-Pass "已通过 adb 关闭设备网络"
    } else {
        Write-Warn "adb 关闭网络失败。请继续前手动关闭 Wi-Fi 和移动数据。"
    }
} else {
    Write-Warn "未请求自动断网。请在下一步前手动关闭 Wi-Fi 和移动数据。"
}

Add-StepResult -Id "06" -Title "离线本地推理" -Instructions @"
请在设备保持离线时，再重复一轮按住说话：
1. 继续使用 $ModelId。
2. 说一条新的固定口令，例如：'请在离线状态下总结这段音频。'
3. 预期结果：
    - 录音、本地音频推理、回复三步都能在离线状态下完成。
    - 看不到云端转写成功的迹象。
4. 如果失败，请在备注里写明失败点属于模型下载校验、会话初始化，还是本地推理本身。
完成后输入 pass / fail / skip。
"@

if ($TryOfflineToggle -and $offlineToggleWorked) {
    [void](Set-NetworkState -Offline $false)
    Write-Pass "已通过 adb 恢复设备网络"
} else {
    Write-Warn "请在云端基线步骤前手动恢复 Wi-Fi 和移动数据。"
}

Add-StepResult -Id "07" -Title "云端基线与成本对比" -Instructions @"
网络恢复后，请跑一轮云端基线：
1. 切换到云端模型，例如 $CloudModel。
2. 用与本地测试相近的口令，再录一轮。
3. 从 usage/cost 面板、诊断或后端日志中记录本轮 token 数。
4. 回到终端，输入 pass / fail / skip，然后填入 token 数做成本计算。
完成后输入 pass / fail / skip。
"@

$inputTokens = Read-TokenValue -Name "云端输入 token" -CurrentValue $CloudInputTokens
$outputTokens = Read-TokenValue -Name "云端输出 token" -CurrentValue $CloudOutputTokens
$cacheReadTokens = Read-TokenValue -Name "云端 cache-read token" -CurrentValue $CloudCacheReadTokens
$cacheWriteTokens = Read-TokenValue -Name "云端 cache-write token" -CurrentValue $CloudCacheWriteTokens

$costSummary = $null
if ($null -ne $inputTokens -and $null -ne $outputTokens) {
    $costSummary = Get-CostSummary -Model $CloudModel -InputTokens $inputTokens -OutputTokens $outputTokens -CacheReadTokens (Get-IntOrZero $cacheReadTokens) -CacheWriteTokens (Get-IntOrZero $cacheWriteTokens)
    Write-Pass "云端基线成本：$($costSummary.formattedCost)"
} else {
    Write-Warn "由于未提供 token 输入，已跳过成本计算"
}

$reportPath = Write-Report -DeviceInfo $deviceInfo -FocusedTestLog $focusedTestLog -CostSummary $costSummary
Write-Section "完成"
Write-Host "报告：$reportPath"
Write-Host "日志：$ReportRoot"