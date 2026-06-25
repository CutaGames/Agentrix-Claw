# Agentrix 依赖安装脚本 (PowerShell - 英文文件名)
# 自动检测项目根目录并安装依赖

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 Agentrix Dependency Installation" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 自动查找项目根目录（包含 backend 和 agentrixfrontend 的目录）
$currentDir = $PWD.Path
$projectRoot = $currentDir

# 向上查找项目根目录
while ($projectRoot -ne "" -and $projectRoot -ne $null) {
    $backendExists = Test-Path (Join-Path $projectRoot "backend")
    $frontendExists = Test-Path (Join-Path $projectRoot "agentrixfrontend")
    
    if ($backendExists -and $frontendExists) {
        break
    }
    
    $parent = Split-Path $projectRoot -Parent
    if ($parent -eq $projectRoot) {
        break
    }
    $projectRoot = $parent
}

if (-not (Test-Path (Join-Path $projectRoot "backend")) -or -not (Test-Path (Join-Path $projectRoot "agentrixfrontend"))) {
    Write-Host "❌ 无法找到项目根目录" -ForegroundColor Red
    Write-Host "   当前目录: $currentDir" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "请确保您在项目目录中运行此脚本" -ForegroundColor Yellow
    Write-Host "项目根目录应包含 'backend' 和 'agentrixfrontend' 文件夹" -ForegroundColor Yellow
    exit 1
}

if ($projectRoot -ne $currentDir) {
    Write-Host "📍 检测到您在子目录中，切换到项目根目录..." -ForegroundColor Yellow
    Write-Host "   从: $currentDir" -ForegroundColor Gray
    Write-Host "   到: $projectRoot" -ForegroundColor Gray
    Set-Location $projectRoot
    Write-Host ""
}

Write-Host "✅ 项目根目录: $projectRoot" -ForegroundColor Green
Write-Host ""

# 检查脚本文件是否存在（优先使用英文文件名）
$scriptPath = Join-Path $projectRoot "install.sh"
if (-not (Test-Path $scriptPath)) {
    # 尝试中文文件名
    $scriptPath = Join-Path $projectRoot "安装依赖-WSL.sh"
    if (-not (Test-Path $scriptPath)) {
        Write-Host "❌ 找不到安装脚本" -ForegroundColor Red
        Write-Host ""
        Write-Host "请确保项目根目录中有 install.sh 或 安装依赖-WSL.sh" -ForegroundColor Yellow
        exit 1
    }
    $scriptName = "安装依赖-WSL.sh"
} else {
    $scriptName = "install.sh"
}

Write-Host "✅ 找到安装脚本: $scriptName" -ForegroundColor Green
Write-Host ""

# 检查 WSL 是否可用
if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
    Write-Host "❌ WSL 未安装或未启用" -ForegroundColor Red
    Write-Host ""
    Write-Host "请先安装 WSL:" -ForegroundColor Yellow
    Write-Host "  wsl --install" -ForegroundColor White
    exit 1
}

Write-Host "✅ WSL 可用" -ForegroundColor Green
Write-Host ""

# 将 Windows 路径转换为 WSL 路径
# D:\wsl\Ubuntu-24.04\Code\Paymind\agentrix-website
# 转换为: /mnt/d/wsl/Ubuntu-24.04/Code/Paymind/agentrix-website
$driveLetter = $projectRoot.Substring(0, 1).ToLower()
$pathWithoutDrive = $projectRoot.Substring(2) -replace '\\', '/'
$wslPath = "/mnt/$driveLetter$pathWithoutDrive"
Write-Host "WSL 路径: $wslPath" -ForegroundColor Blue
Write-Host ""

Write-Host "开始安装依赖..." -ForegroundColor Yellow
Write-Host ""

# 在 WSL 中运行安装脚本
wsl bash -c "cd '$wslPath' && bash $scriptName"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "✅ 安装完成！" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 下一步:" -ForegroundColor Yellow
    Write-Host "  运行: .\start.ps1" -ForegroundColor White
    Write-Host "  或: wsl bash start.sh" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ 安装过程中出现错误" -ForegroundColor Red
    Write-Host ""
    Write-Host "请检查:" -ForegroundColor Yellow
    Write-Host "  1. WSL 是否正常运行" -ForegroundColor White
    Write-Host "  2. 网络连接是否正常" -ForegroundColor White
    Write-Host "  3. 是否有足够的权限" -ForegroundColor White
    Write-Host ""
}

