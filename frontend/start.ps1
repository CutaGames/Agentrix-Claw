# Agentrix 服务启动脚本 (PowerShell - 英文文件名)
# 自动检测项目根目录并启动服务

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 Agentrix Services Startup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 自动查找项目根目录
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
$scriptPath = Join-Path $projectRoot "start.sh"
if (-not (Test-Path $scriptPath)) {
    # 尝试中文文件名
    $scriptPath = Join-Path $projectRoot "WSL启动服务.sh"
    if (-not (Test-Path $scriptPath)) {
        Write-Host "❌ 找不到启动脚本" -ForegroundColor Red
        exit 1
    }
    $scriptName = "WSL启动服务.sh"
} else {
    $scriptName = "start.sh"
}

# 检查 WSL 是否可用
if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
    Write-Host "❌ WSL 未安装或未启用" -ForegroundColor Red
    exit 1
}

# 将 Windows 路径转换为 WSL 路径
# D:\wsl\Ubuntu-24.04\Code\Paymind\agentrix-website
# 转换为: /mnt/d/wsl/Ubuntu-24.04/Code/Paymind/agentrix-website
$driveLetter = $projectRoot.Substring(0, 1).ToLower()
$pathWithoutDrive = $projectRoot.Substring(2) -replace '\\', '/'
$wslPath = "/mnt/$driveLetter$pathWithoutDrive"

Write-Host "✅ 找到启动脚本: $scriptName" -ForegroundColor Green
Write-Host "WSL 路径: $wslPath" -ForegroundColor Blue
Write-Host ""

Write-Host "启动所有服务..." -ForegroundColor Yellow
Write-Host ""
Write-Host "服务将在以下地址启动:" -ForegroundColor Cyan
Write-Host "  🌐 前端应用:    http://localhost:3000" -ForegroundColor White
Write-Host "  🔧 后端API:     http://localhost:3001/api" -ForegroundColor White
Write-Host "  📖 API文档:     http://localhost:3001/api/docs" -ForegroundColor White
Write-Host "  📚 SDK文档:     http://localhost:8080" -ForegroundColor White
Write-Host ""
Write-Host "按 Ctrl+C 停止所有服务" -ForegroundColor Yellow
Write-Host ""

# 在 WSL 中运行启动脚本
wsl bash -c "cd '$wslPath' && bash $scriptName"

