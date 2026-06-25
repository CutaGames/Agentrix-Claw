# 三端 Go-Live Audit — 2026-05-16

> 本次 audit 目的：在三端（Web / Desktop / Mobile）GA 上线之前做最后一次综合检查，确认实际可用，并汇总剩余阻塞 / 已就绪状态。
>
> Production commit: `1d8fb37a` (latest deploy on `47.130.176.148`).

---

## 总览

| 端 | 自动化测试 | 安装包 | 上线状态 |
|----|:--------:|:----:|:--------:|
| **Web** | Playwright 30+ tests · Backend Jest 141/141 · 35/35 prod smoke | N/A（直接访问 `agentrix.top`）| ✅ **可上线** |
| **Desktop** | Vitest 71/71 · Tauri build OK | `Agentrix-Setup.exe` 7.03 MB ✅ 已上传 | ✅ **可上线（内测无签名）** |
| **Mobile (Android)** | 后端 endpoint 全通 · asset-linking 200 | `ClawLink-latest.apk` 124 MB ✅ 已上传 v1.1.0 | ✅ **可 APK 旁加载** |
| **Mobile (iOS)** | 代码就绪 | App Store 待审 | ⏳ 等运营开 Apple Developer 账号 |
| **Watch** | — | `agentrix-watch.apk` 52 MB ✅ 已上传 | ✅ **配套 APK 可用** |

**结论**：Web 和 Desktop（Windows）可立即上线。Android 可 APK 旁加载（Play Store 走运营节奏）。iOS 走 Apple 审核节奏。

---

## 1. Web 端

### 1.1 测试结果

| 测试套 | 通过 / 总数 | 时长 |
|--------|:----------:|:----:|
| Web V4 Full (Playwright Chromium) | 30+ tests | 9.5 min |
| Backend Jest 18 套件 | 141 / 141 | 6.5 min |
| Production V4 Full Smoke (35 endpoints) | 35 / 35 | 1 min |

**详细 smoke 通过项**：
- 20 个 web 公开页面：/ /pricing /download /market 系列（5）/ /help 系列（3）/ /privacy /terms /clan /clans /blog /500 /404 /showcase /about
- 2 个 asset linking：assetlinks.json + apple-app-site-association
- 3 个 marketplace public APIs：pets / leaderboard / pets/:id
- 4 个 auth-guarded APIs（401 expected）：axp/redeem/catalog · checkout/session · checkout/payment-intent · axp/balance
- 1 个 fail-closed API（401 expected）：iap-webhook
- 1 个 mobile analytics ingest（202）
- 3 个 desktop lifecycle（analytics / crashes / update）
- 1 个 marketplace bids endpoint

### 1.2 内容审计本轮修复

参考 `docs/WEB_CONTENT_AUDIT_2026-05-16.zh-CN.md`，本轮已修复：

- ✅ **首页 V3 → V4 文案统一**：FeaturesSection 重写为 8 张卡（含 4 张 V4 New 标记）：Living Pet、Soul × Skin（V4 NEW）、PetCreator 4 模式（V4 NEW）、Skin Marketplace（V4 NEW）、Wallet、AXP、Toy / NFC（V4 NEW）、Auto-Earn
- ✅ **下载页多平台**：`/download` 升级 5 卡 hub（Windows / Android / iOS / Watch / macOS），自动检测 User-Agent 高亮当前设备
- ✅ **`/downloads` → `/download` 308 redirect**：单一下载入口
- ✅ **Hero CTA** 文案改 "下载 Agentrix"，链接到 hub
- ✅ **Android sideload 引导** 加在 download 页
- ✅ **System requirements** 加 Mobile 栏

**未做（推迟到 W-5）**：
- 加 `/partners` `/investors` `/blog` 实质内容
- `/use-cases` `/security` 内容深化
- 多语言（日 / 韩 / 越）

---

## 2. Desktop 端 (Windows)

### 2.1 构建产物

| 项 | 数据 |
|---|---|
| **版本** | v0.2.0 |
| **构建工具** | Tauri 2.0 + Rust + WebView2 |
| **NSIS Setup.exe 大小** | **7.03 MB** |
| **构建路径** | `desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.2.0_x64-setup.exe` |
| **代码签名** | ❌ 未签名（内测期；Azure Trusted Signing 申请中） |
| **下载 URL** | `https://agentrix.top/downloads/Agentrix-Setup.exe` ✅ 已上传 |

### 2.2 测试结果

`desktop/tests/` Vitest 12 套件 71/71 通过：
- desktopBus（IPC 路由 + 窗口栈回归）6
- WardrobePanel V4 4
- SoulPicker（DT-T1.3 / 1.4 / 1.5）4
- PetPhase6（成就墙 / 繁殖邀请）20
- SplashScreen 3
- AgentEconomyPanel（empty-state CTA）1
- riveEmotionMap 10
- petSoulSdk 6
- analytics-opt-in 4
- petCompanion 8
- PetRenderer 3
- petSdk 2

### 2.3 SmartScreen 引导

`/download` 页已有完整 4 步通过指南。v0.2.1+ 接入 Azure Trusted Signing 后此提示消失。

---

## 3. Mobile 端 (Android)

### 3.1 构建产物

| 项 | 数据 |
|---|---|
| **版本** | v1.1.0 |
| **构建工具** | Expo SDK 54 + React Native 0.81.5 |
| **APK 大小** | **124 MB** |
| **包名** | `app.agentrix.claw` |
| **下载 URL** | `https://agentrix.top/downloads/ClawLink-latest.apk` ✅ 已上传 |
| **Watch APK** | `agentrix-watch.apk` 52 MB ✅ 也已上传 |

### 3.2 后端 endpoints 验证

| endpoint | 状态 |
|----------|:----:|
| `POST /v1/mobile/analytics` | 202 Accepted ✅ |
| `GET /v1/axp/redeem/catalog` | 401 JWT-required ✅ |
| `POST /v1/checkout/session` | 401 JWT-required ✅ |
| `POST /v1/checkout/payment-intent` | 401 JWT-required ✅ |
| `POST /v1/payment/iap-webhook` | 401 fail-closed (REVENUECAT_WEBHOOK_SECRET 未配) ✅ |

### 3.3 移动端代码质量

- `npx tsc --noEmit -p tsconfig.json` exit 0（22 个 pre-existing 错误本轮全部修完）
- 22/21 Maestro 测试就绪（待真机执行）

### 3.4 资产链接

```
GET /.well-known/assetlinks.json -> 200
{
  "package_name": "app.agentrix.claw",
  "sha256_cert_fingerprints": ["PLACEHOLDER_REPLACE_WITH_PRODUCTION_KEYSTORE_SHA256"]
}
```

⚠️ **未补 SHA-256 fingerprint**（需要 production keystore；EAS 首次 build 时自动生成）。当前是占位符。Play Console 上架前必须替换。

### 3.5 IAP / 监控外部依赖

| 项 | 状态 | 备注 |
|---|:---:|---|
| RevenueCat dashboard 创建 | ⏳ 待开 | 注册即用，免费额度足够内测 |
| Sentry 移动端 project | ⏳ 待开 | 同上 |
| Google Play Console 注册 | ⏳ 待开 | $25 一次性，1 工作日 |
| Apple Developer 账号 | ⏳ 待开 | $99/年；iOS 上架阻塞 |

---

## 4. 已就绪 / 不阻塞

### Web

- 35 端点 smoke 全通
- 25 个公开页面全 200
- 资产链接（assetlinks + AASA）已部署
- HTTPS / HSTS / CSP 配置就绪
- /privacy /terms /404 /500 自定义页就绪
- Cookie consent banner 已上线
- Help center 三本手册（desktop / desktop FAQ / mobile）

### Desktop

- v0.2.0 setup.exe 7.03 MB 已上传
- 71 单元 + 集成测试全过
- 自动更新 endpoint 就绪（`GET /api/desktop/update/...`）
- 崩溃 + analytics endpoint 就绪
- 用户手册 `/help/desktop` + FAQ `/help/desktop/faq`

### Mobile

- v1.1.0 APK 124 MB 已上传
- 后端 4 个新 endpoint 全通
- Sentry RN + RevenueCat IAP 服务接入完成（无 DSN 时 no-op）
- 隐私入口（导出 / 删除账号 / Terms / Privacy）就绪
- AXP 不是货币免责声明就绪
- 邀请码体系完整（含跨端通用规则文档）
- 用户手册 `/help/mobile` 已上线

---

## 5. 上线决策建议

### 立即可做

1. **Web GA 公告**：当前生产已可正式宣称 v4 GA
2. **Desktop 内测**：发 setup.exe 给 100 内测用户
3. **Android APK 旁加载**：开放给早期种子用户（Twitter / Discord / Telegram 群）

### 7-14 天内做

4. **Apple Developer 账号 + iOS TestFlight**（运营开账号即可启动）
5. **Google Play Console 提审 Internal Testing**（运营开账号即可启动）
6. **Azure Trusted Signing 申请**（5-10 天审核）
7. **RevenueCat + Sentry DSN 注入** prod 环境变量

### 30 天内 Sprint W-5

8. **Web 内容深化**：partners / investors / blog / use-cases / security
9. **Lighthouse 性能优化** `/market/leaderboard` SSR 修复
10. **多语言**：日 / 韩 / 越

---

## 6. 上线立即可发布的内容

```
🎉 Agentrix v4 公开发布！

🌐 Web: https://agentrix.top
🖥️ Windows: https://agentrix.top/download
📱 Android: https://agentrix.top/download
⌚ Watch: https://agentrix.top/download
📚 用户手册: https://agentrix.top/help

5 端联动 · MPC 钱包 · 1 AXP = $0.001
内测邀请码：findme on Telegram @agentrix
```

---

## 7. 下次 audit 时机

- **GA 公告后 24 小时**：监控 Sentry crash rate + 下载量
- **GA 公告后 7 天**：复盘+下一轮内容优化
- **iOS 上架后**：补 iOS 平台的端到端测试

---

> 报告生成时间：2026-05-16 16:30 UTC+8
> 自动化运行：[v4-full-smoke.ps1](../../scripts/test/v4-full-smoke.ps1) 35/35 PASS
> 详细技术报告：`tests/reports/E2E_REPORT_2026-05-16.md`
> Web 内容审计：`docs/WEB_CONTENT_AUDIT_2026-05-16.zh-CN.md`
