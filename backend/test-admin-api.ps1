# Agentrix 后台管理API测试脚本 (PowerShell版本)
# 测试所有后台管理API端点

$BaseUrl = "http://localhost:3002/api/admin"
$AdminToken = ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Agentrix 后台管理API测试" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 管理员登录
Write-Host "1. 测试管理员登录..." -ForegroundColor Yellow
$loginBody = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BaseUrl/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody
    
    $AdminToken = $loginResponse.access_token
    Write-Host "✅ 登录成功，Token: $($AdminToken.Substring(0, [Math]::Min(20, $AdminToken.Length)))..." -ForegroundColor Green
} catch {
    Write-Host "❌ 登录失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "提示: 请先创建管理员账号" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 设置请求头
$headers = @{
    "Authorization" = "Bearer $AdminToken"
    "Content-Type" = "application/json"
}

# 2. 获取当前管理员信息
Write-Host "2. 测试获取当前管理员信息..." -ForegroundColor Yellow
try {
    $me = Invoke-RestMethod -Uri "$BaseUrl/auth/me" -Method GET -Headers $headers
    Write-Host "✅ 成功: $($me.username)" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 3. 获取用户列表
Write-Host "3. 测试获取用户列表..." -ForegroundColor Yellow
try {
    $users = Invoke-RestMethod -Uri "$BaseUrl/users?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($users.total) 个用户" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 4. 获取商户列表
Write-Host "4. 测试获取商户列表..." -ForegroundColor Yellow
try {
    $merchants = Invoke-RestMethod -Uri "$BaseUrl/merchants?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($merchants.total) 个商户" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 5. 获取开发者列表
Write-Host "5. 测试获取开发者列表..." -ForegroundColor Yellow
try {
    $developers = Invoke-RestMethod -Uri "$BaseUrl/developers?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($developers.total) 个开发者" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 6. 获取推广者列表
Write-Host "6. 测试获取推广者列表..." -ForegroundColor Yellow
try {
    $promoters = Invoke-RestMethod -Uri "$BaseUrl/promoters?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($promoters.total) 个推广者" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 7. 获取工单列表
Write-Host "7. 测试获取工单列表..." -ForegroundColor Yellow
try {
    $tickets = Invoke-RestMethod -Uri "$BaseUrl/tickets?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($tickets.total) 个工单" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 8. 获取营销活动列表
Write-Host "8. 测试获取营销活动列表..." -ForegroundColor Yellow
try {
    $campaigns = Invoke-RestMethod -Uri "$BaseUrl/marketing/campaigns?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($campaigns.total) 个营销活动" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 9. 获取优惠券列表
Write-Host "9. 测试获取优惠券列表..." -ForegroundColor Yellow
try {
    $coupons = Invoke-RestMethod -Uri "$BaseUrl/marketing/coupons?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($coupons.total) 个优惠券" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 10. 获取风险评估列表
Write-Host "10. 测试获取风险评估列表..." -ForegroundColor Yellow
try {
    $assessments = Invoke-RestMethod -Uri "$BaseUrl/risk/assessments?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($assessments.total) 个风险评估" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 11. 获取管理员列表
Write-Host "11. 测试获取管理员列表..." -ForegroundColor Yellow
try {
    $admins = Invoke-RestMethod -Uri "$BaseUrl/system/admins?page=1&limit=10" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($admins.total) 个管理员" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 12. 获取角色列表
Write-Host "12. 测试获取角色列表..." -ForegroundColor Yellow
try {
    $roles = Invoke-RestMethod -Uri "$BaseUrl/system/roles" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($roles.Count) 个角色" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 13. 获取系统配置列表
Write-Host "13. 测试获取系统配置列表..." -ForegroundColor Yellow
try {
    $configs = Invoke-RestMethod -Uri "$BaseUrl/system/configs" -Method GET -Headers $headers
    Write-Host "✅ 成功: 共 $($configs.Count) 个配置" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 14. 获取仪表盘概览
Write-Host "14. 测试获取仪表盘概览..." -ForegroundColor Yellow
try {
    $overview = Invoke-RestMethod -Uri "$BaseUrl/dashboard/overview" -Method GET -Headers $headers
    Write-Host "✅ 成功获取仪表盘数据" -ForegroundColor Green
    Write-Host "   用户: $($overview.users.totalUsers)" -ForegroundColor Cyan
    Write-Host "   商户: $($overview.merchants.totalMerchants)" -ForegroundColor Cyan
    Write-Host "   工单: $($overview.tickets.total)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 15. 获取统计信息
Write-Host "15. 测试获取统计信息..." -ForegroundColor Yellow
try {
    $userStats = Invoke-RestMethod -Uri "$BaseUrl/users/statistics" -Method GET -Headers $headers
    Write-Host "✅ 用户统计: 总用户 $($userStats.totalUsers)" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $merchantStats = Invoke-RestMethod -Uri "$BaseUrl/merchants/statistics" -Method GET -Headers $headers
    Write-Host "✅ 商户统计: 总商户 $($merchantStats.totalMerchants)" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $ticketStats = Invoke-RestMethod -Uri "$BaseUrl/tickets/statistics" -Method GET -Headers $headers
    Write-Host "✅ 工单统计: 总工单 $($ticketStats.total)" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $riskStats = Invoke-RestMethod -Uri "$BaseUrl/risk/statistics" -Method GET -Headers $headers
    Write-Host "✅ 风险统计: 高风险 $($riskStats.highRiskCount)" -ForegroundColor Green
} catch {
    Write-Host "❌ 失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ 所有API测试完成" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan

