# Agentrix V4 测试执行指南

> **版本**：v1.0 · 2026-05-12
> **配套文档**：
> - `E2E_TEST_PLAN_V4_2026-05.zh-CN.md` — 总体测试计划
> - `UI_ELEMENT_AUDIT_DESKTOP_2026-05.zh-CN.md` — 桌面端审计
> - `UI_ELEMENT_AUDIT_WEB_2026-05.zh-CN.md` — Web 端审计
> - `UI_ELEMENT_AUDIT_MOBILE_2026-05.zh-CN.md` — 移动端审计

---

## 快速开始

### 一键运行所有测试

```powershell
# Smoke（CI 级别，~3 分钟）
npm run test:v4:smoke

# 完整（桌面 + Web + 移动，~20 分钟）
npm run test:v4:full

# 硬件（Watch + Toy + Glass，~10 分钟）
npm run test:v4:hardware
```

### 分端运行

```powershell
# 后端 API 烟雾测试
npm run test:v4:api

# Web 前端 E2E
npm run test:v4:web

# 桌面端 E2E
npm run test:v4:desktop

# 移动端 Maestro
npm run test:v4:mobile

# 硬件测试
npm run test:hardware:watch
npm run test:hardware:toy
npm run test:hardware:glass
```

---

## 测试文件清单

### 桌面端（Playwright）

| 文件 | 覆盖范围 | 运行命令 |
|------|---------|---------|
| `desktop/tests/e2e/v4-full-audit.spec.ts` | 200+ 元素全覆盖 | `npm run test:v4:desktop` |
| `desktop/tests/e2e/desktop-e2e.spec.ts` | 基础健康检查 | 同上 |
| `desktop/tests/e2e/p2-p3-comprehensive.spec.ts` | P2-P3 功能 | 同上 |

### Web 端（Playwright）

| 文件 | 覆盖范围 | 运行命令 |
|------|---------|---------|
| `tests/e2e/frontend/web-v4-full.spec.ts` | 全部页面 + 交互 | `npm run test:v4:web` |
| `tests/e2e/frontend/pet-soul-console.spec.ts` | 灵魂切换 | 同上 |
| `tests/e2e/frontend/passkey-web-authn.spec.ts` | Passkey 认证 | 同上 |
| `tests/e2e/backend-api-smoke.spec.ts` | 后端 API 可达性 | `npm run test:v4:api` |

### 移动端（Maestro）

| 文件 | 覆盖范围 | 运行命令 |
|------|---------|---------|
| `.maestro/10-4tab-smoke.yaml` | 4 Tab 导航 | `maestro test .maestro/10-*.yaml` |
| `.maestro/11-plaza-5segments.yaml` | Plaza 5 段 | `maestro test .maestro/11-*.yaml` |
| `.maestro/12-home-pet-drawer.yaml` | Home 抽屉 | `maestro test .maestro/12-*.yaml` |
| `.maestro/13-me-subscribe-axp.yaml` | Me/订阅/AXP | `maestro test .maestro/13-*.yaml` |
| `.maestro/14-coraising-greeting.yaml` | 共养/贺卡 | `maestro test .maestro/14-*.yaml` |
| `.maestro/15-global-inbox-scan.yaml` | 全局 Inbox | `maestro test .maestro/15-*.yaml` |
| `.maestro/20-v4-home-full.yaml` | V4 Home 完整 | `npm run test:v4:mobile` |
| `.maestro/21-v4-summon-chat.yaml` | V4 Summon 聊天 | 同上 |
| `.maestro/22-v4-plaza-full.yaml` | V4 Plaza 完整 | 同上 |
| `.maestro/23-v4-me-axp-subscribe.yaml` | V4 Me/AXP/设备 | 同上 |
| `.maestro/24-v4-pet-creator-wardrobe.yaml` | V4 PetCreator | 同上 |
| `.maestro/25-v4-global-inbox-deeplink.yaml` | V4 Deep Link | 同上 |
| `.maestro/26-v4-coraising-greeting.yaml` | V4 共养/贺卡 | 同上 |

### 硬件测试（Node.js）

| 文件 | 覆盖范围 | 运行命令 |
|------|---------|---------|
| `tests/hardware/watch-e2e.mjs` | Watch ADB 测试 | `npm run test:hardware:watch` |
| `tests/hardware/toy-ble-e2e.mjs` | Toy BLE 协议 | `npm run test:hardware:toy` |
| `tests/hardware/glass-hud-e2e.mjs` | Glass HUD 模拟 | `npm run test:hardware:glass` |

### 测试数据

| 文件 | 用途 |
|------|------|
| `tests/e2e/fixtures/mock-data.ts` | 共享 Mock 数据 |
| `tests/e2e/fixtures/api-mocker.ts` | Playwright API 拦截器 |
| `tests/e2e/fixtures/seed-test-data.mjs` | 后端数据种子脚本 |

---

## 环境准备

### 1. 安装依赖

```powershell
npm install
npx playwright install chromium
```

### 2. 桌面端准备

```powershell
# 方式 A：启动 dev server
cd desktop
npm run dev

# 方式 B：启动 exe（带 CDP 调试端口）
# 设置环境变量 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'
# 然后启动 agentrix-desktop.exe
```

### 3. Web 端准备

```powershell
cd frontend
npm install
npm run dev
# 等待 http://127.0.0.1:3000 可访问
```

### 4. 移动端准备

```powershell
# Android 真机通过 USB 连接
adb devices  # 确认设备可见

# 安装 Maestro CLI
# https://maestro.mobile.dev/getting-started/installing-maestro

# 确认 App 已安装
adb shell pm list packages | grep agentrix
```

### 5. 硬件准备

```powershell
# Watch: ADB 连接
adb devices  # 确认手表可见

# Toy: ESP32 串口连接
# 确认 COM 端口可用

# NFC: NTAG215 贴纸已写入测试 token
```

### 6. 测试数据种子

```powershell
# 设置管理员 token
$env:AGENTRIX_ADMIN_TOKEN = "your-admin-jwt"

# 运行种子脚本
node tests/e2e/fixtures/seed-test-data.mjs

# 重置并重新种子
node tests/e2e/fixtures/seed-test-data.mjs --reset
```

---

## CI/CD 集成

### GitHub Actions

自动触发条件：
- Push 到 `main` / `develop` / `feature/**`
- 修改 `frontend/` / `backend/` / `desktop/src/` / `src/` / `tests/`

工作流文件：`.github/workflows/v4-e2e-tests.yml`

自动执行：
1. Backend API Smoke（~2 min）
2. Web Frontend E2E（~5 min）
3. TypeScript Check（~1 min）

### 手动触发

```
GitHub → Actions → V4 E2E Tests → Run workflow → 选择 profile
```

---

## 测试报告

### 报告位置

```
tests/reports/
├── v4-e2e-YYYY-MM-DD_HH-mm-ss/   # PowerShell runner 报告
│   └── summary.json
├── watch-YYYY-MM-DD/               # Watch 测试报告
│   └── watch-results.json
├── toy-YYYY-MM-DD/                 # Toy 测试报告
│   └── toy-results.json
├── glass-YYYY-MM-DD/               # Glass 测试报告
│   └── glass-results.json
└── frontend-pet-html/              # Playwright HTML 报告
```

### 报告格式

```json
{
  "date": "2026-05-12 14:30:00",
  "profile": "full",
  "summary": "18/20 (90%)",
  "results": [
    { "name": "Backend API Smoke", "passed": true, "duration": 3.2 },
    { "name": "Web V4 Full", "passed": true, "duration": 12.5 },
    { "name": "Desktop V4 Audit", "passed": false, "duration": 8.1, "output": "..." }
  ]
}
```

---

## 故障排除

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Playwright 连接超时 | Dev server 未启动 | 先启动 `npm run dev` |
| CDP 连接失败 | Exe 未开启调试端口 | 设置 `--remote-debugging-port=9222` |
| Maestro 找不到设备 | USB 未连接 | `adb devices` 确认 |
| API 返回 401 | Token 过期 | 重新获取 token |
| NFC 测试跳过 | 无 NFC 贴纸 | 购买 NTAG215 贴纸 |
| Watch 测试跳过 | 手表未连接 | ADB 连接手表 |

### 调试模式

```powershell
# Playwright 带 UI 调试
npx playwright test --debug tests/e2e/frontend/web-v4-full.spec.ts

# Playwright 带 trace
npx playwright test --trace on tests/e2e/frontend/web-v4-full.spec.ts

# Maestro 带截图
maestro test --debug-output ./maestro-debug .maestro/20-v4-home-full.yaml
```

---

## 测试覆盖度目标

| 端 | 当前覆盖 | 目标 | 差距 |
|----|:--------:|:----:|:----:|
| 桌面端 | ~70% | 90% | 需补充面板内部交互 |
| Web 端 | ~60% | 85% | 需补充 Console 深度测试 |
| 移动端 | ~65% | 85% | 需补充 NFC/Camera 真机测试 |
| Watch | ~40% | 70% | 需真机 + companion APK |
| Toy | ~50% | 75% | 需 ESP32 固件 + BLE 真实通信 |
| Glass | ~30% | 60% | 需 ESP32 GATT 模拟 |

---

## 下一步计划

- [ ] 补充桌面端面板内部交互测试（AgentEconomy 6 Tab、Marketplace 筛选等）
- [ ] 补充 Web Console 深度测试（钱包操作、AXP 兑换流程等）
- [ ] 移动端 NFC 真机测试（需 NTAG215 贴纸）
- [ ] 移动端 Camera 扫描测试（需真机 + AR 环境）
- [ ] Watch companion APK 安装 + 真机验证
- [ ] ESP32 固件烧录 + BLE 真实通信测试
- [ ] 性能基线建立（LCP/FID/CLS for Web, 启动时间 for Mobile）
- [ ] 视觉回归测试（Percy / Chromatic 集成）
