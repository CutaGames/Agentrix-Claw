# 移动端正式上线审计（2026-05-16）

> 目的：判断 Agentrix Mobile (Expo SDK 54 / React Native) 距离 GA 还需要多少工作。
> 输入：[`docs/mobile-prd-v4.md`](mobile-prd-v4.md)、[`docs/MOBILE_V4_AUDIT_2026-05-12.zh-CN.md`](MOBILE_V4_AUDIT_2026-05-12.zh-CN.md)、`src/` 静态扫描、Maestro 测试目录、`app.json` / `eas.json`。
> 当前移动端版本：`app.json` `version: "1.1.0"`；包名 `app.agentrix.claw`；公开镜像仓 `CutaGames/Agentrix-Claw`。

---

## TL;DR

**移动端 V4 功能完成度 ≈ 90 %**（沿用 `MOBILE_V4_AUDIT_2026-05-12` Sprint I/J 之后的数字），但**距离 GA 上线还差 ~12 个工作日**，分四类卡点：

1. **打包 / 分发链路（P0，强阻塞）**：iOS App Store + Google Play 元数据 / 截图 / 隐私问卷 / 审核流程 0% 完成
2. **运行期稳定 + 监控（P0）**：Sentry / Crashlytics / 用户埋点链路移动端尚未接入
3. **后端联调 endpoints（P0）**：3-4 个前端 API 已就绪等后端补的 endpoint
4. **合规 + 法律（P1）**：隐私政策 / 服务条款 in-app 入口、APP 内删除账号路径、AXP 代币合规标注、GDPR / COPPA 检查

下面按优先级列具体任务。

---

## 1. 当前状态速读

| 维度 | 状态 | 说明 |
|------|:---:|------|
| **PRD 功能** | 90% | 见 `MOBILE_V4_AUDIT_2026-05-12` §8 |
| **导航 / Tab 骨架** | 97% | 4 主 Tab + 6 隐藏遗留 Tab + 30+ 抽屉/子页 |
| **Maestro E2E** | 21 个 flow ✅ | `01-04` 启动/导航；`10-15` 现网；`20-30` V4 全量 |
| **i18n** | 中文为主 + 英文部分 | `useLocalization` 已有但不少屏 hardcode 中文 |
| **打包链路** | EAS preview ✅ / production ❌ | `eas.json` 有 production profile 但未跑过商店包 |
| **后端联调** | 4 个 endpoint 待补 | 前端 API 层就绪 |
| **崩溃 / 性能监控** | ❌ 未接入 | 桌面端有 crashReport，移动端没有等价物 |
| **应用商店元数据** | ❌ 0 % | App Store / Play Store 截图、文案、隐私问卷全空 |
| **签名 / 证书** | iOS ❌ / Android 🟡 | iOS 未办 Apple Dev 账号；Android 已有 keystore |
| **合规 in-app 入口** | ❌ | 设置页缺隐私政策 / 删除账号 / 数据导出入口 |

---

## 2. P0 — 必须做才能上架（~12 天）

### M-P0-1：iOS App Store 审核包（5-7 天，含 Apple 审核）

**前置依赖**：
- [ ] Apple Developer 账号（$99/年，即时开通）
- [ ] Distribution Certificate + Provisioning Profile（EAS 自动管）
- [ ] Bundle ID `app.agentrix.claw` 在 App Store Connect 注册

**任务**：
- [ ] `eas build --platform ios --profile production` 跑通
- [ ] App Store Connect 创建应用
- [ ] 应用截图（iPhone 6.7" / 6.5" / 5.5" 各 5-10 张）+ iPad（如保留 supportsTablet）
- [ ] 应用描述 / 关键词 / 主类别 / 次类别（中英双语）
- [ ] 隐私问卷（**重点**）：要列出
  - 摄像头（PetCreator 图生 / 摄像头扫描 V5）
  - 麦克风（语音聊天 / Wake Word）
  - 蓝牙（Toy 配对）
  - NFC（盲盒兑换）
  - 通讯录 / 位置 = 不收集
  - 数据用于跟踪 / 第三方分享 = **否**（除支付走 Stripe）
- [ ] 出口加密合规（Encryption Compliance）= 仅使用标准加密（HTTPS / Wallet ECDSA）
- [ ] 内购 IAP 接入（订阅 5 档 + AXP 充值）— **iOS 要求虚拟商品必须走 IAP，不能用 Stripe**
  - 订阅档位作为 auto-renewable subscription 注册
  - AXP 包作为 consumable IAP 注册
  - 或：本期改成「在 iOS 关闭虚拟商品付款，仅做展示+引导用户去 Web 充值」（合规但 UX 差）
- [ ] **TestFlight 内测 7-14 天**（含 50-100 名内部测试者）

**估时**：纯开发 3 天 + 资料整理 1 天 + Apple 审核 2-7 天

### M-P0-2：Google Play 审核包（3-5 天，含 Play 审核）

**前置依赖**：
- [ ] Google Play Console 账号（$25 一次性）
- [ ] Upload key + signing key（EAS 自动管）

**任务**：
- [ ] `eas build --platform android --profile production` 跑通 (.aab)
- [ ] Play Console 创建应用
- [ ] 截图（手机 + 平板）+ 功能图 + 应用图标
- [ ] 隐私政策 URL（指向 `https://agentrix.top/privacy`，本周 Sprint W-3 已上线）
- [ ] 数据安全表单（与 iOS 隐私问卷类似的 17 项）
- [ ] 内容分级问卷 IARC（含「数字货币 / 虚拟物品交易」勾选）
- [ ] **Play Billing**：与 iOS 同理，订阅 / AXP 必须走 Google Play Billing 而不是 Stripe
- [ ] **闭环测试 7 天**（Internal testing track）

**估时**：纯开发 2 天 + 资料 1 天 + Play 审核 1-3 天

### M-P0-3：双端 IAP 真实接入（4 天，与 P0-1 / P0-2 并行）

`expo-in-app-purchases` 已废弃，建议用 `react-native-iap` 或 RevenueCat。

**任务**：
- [ ] 选定方案（推荐 RevenueCat，可一套代码同时管 iOS / Android + 后端 webhook）
- [ ] 替换 `stripeCheckout.service.ts` 中订阅 / AXP 充值的 iOS / Android 路径
- [ ] 后端 `subscription/iap-webhook` 接收 RevenueCat / App Store / Play Server 通知
- [ ] **Web 仍走 Stripe，移动端走 IAP**（双轨）

**估时**：4 天

### M-P0-4：崩溃 / 性能 / 用户行为监控（2 天）

桌面端 G-2 已上线 `crashReport.ts`；移动端需要等价能力。

**任务**：
- [ ] **Sentry 接入**（`@sentry/react-native` 6.x）
  - `App.tsx` 入口 init
  - source map 自动上传（EAS hooks）
  - 接 React Navigation breadcrumbs（已有 `@sentry/react-native/navigation`）
  - error boundary 包住 RootNavigator
- [ ] 复用 `analytics.service.ts`（如已有）扩展启动 / 登录 / 首次召唤 / 首次 NFC / 首次 Toy 配对等关键事件埋点
- [ ] 默认 OFF + opt-in（与桌面端 G-2 一致；隐私至上）
- [ ] App 设置页加 Privacy 段落开关

**估时**：2 天

### M-P0-5：后端 endpoint 联调（1 天，待后端就绪即可）

依据 `MOBILE_V4_AUDIT_2026-05-12 §8` 列出，前端 API 层全部就绪：

| 前端调用 | 后端 endpoint | 是否就绪 |
|---------|--------------|:------:|
| AXP 兑换 | `POST /v1/axp/redeem/catalog` `POST /v1/axp/redeem` | ❌ 待补 |
| Stripe Checkout（Web fallback） | `POST /v1/payment/checkout/session` | ❌ 待补 |
| 摄像头扫描 | `POST /v1/pet-generation/scan` | ❌ 待补（若 V5 才上则可推后） |
| RevenueCat webhook | `POST /v1/subscription/iap-webhook` | ❌ 待补 |
| AXP 过期推送 cron | 后端定时任务 | ❌ 待补 |

**估时**：后端 1 天 + 前端联调 0.5 天

### M-P0-6：合规 in-app 入口（1 天）

应用商店审核会要求：

- [ ] 设置 → 「关于」→ 「隐私政策」（链接到 `https://agentrix.top/privacy`）
- [ ] 设置 → 「关于」→ 「服务条款」（链接到 `https://agentrix.top/terms`）
- [ ] 设置 → 「账号」→ 「删除账号」（在 App 内可发起；调 `DELETE /v1/users/me`，30 天 cooling-off）
- [ ] 设置 → 「数据导出」（GDPR Article 20，可 email 触发）
- [ ] 首次启动 onboarding：勾选「同意条款」+ 「隐私政策」前不能继续
- [ ] **AXP 不是货币**的免责声明（在 AxpCenter 顶部加小字"AXP 是平台积分，不可与法币双向兑换"）

**估时**：1 天

---

## 3. P1 — 强烈建议在 GA 后 1-2 周内补（~5 天）

### M-P1-1：iOS App Intents 真实测试（1 天）

`MOBILE_V4_AUDIT_2026-05-12 §7` 已新建 `ios/AgentrixIntents/AgentrixIntents.swift` 4 个 Intent，但需要：
- [ ] Native module 接入（Expo prebuild + Swift compile）
- [ ] 物理 iPhone 真机验证 Siri 短语
- [ ] App Shortcut 注册到系统

### M-P1-2：Android App Actions 真实测试（1 天）

`shortcuts.xml` 已写，需要：
- [ ] `android.intent.action.VIEW` deep link 在 manifest 中正确声明
- [ ] Google Assistant 测试（开发者预览版）

### M-P1-3：i18n 全量补齐（2 天）

当前移动端中文为主：
- [ ] grep `Text>[^<]*[\u4e00-\u9fff]` 找出 hardcode 中文
- [ ] 改成 `t({ zh, en })`
- [ ] 审核英文翻译质量
- [ ] 加日语、韩语、越南语（若 SE Asia 上线优先级高）

### M-P1-4：VRM 高面 PBR 渲染管线（1 天 + 后端 CDN 1 天）

依赖后端 KTX2 / Draco / 高质量贴图 CDN 管线。前端 PetVrmRenderer 已支持，需后端就绪即可。

### M-P1-5：Watch / 灵动岛 / 锁屏 Widget（5+ 天，若决定做）

需要 Xcode Widget Extension + WidgetKit + ActivityKit，超出纯 RN 范围。建议：
- 选项 A：跳过，作为 v1.1 增量
- 选项 B：单独做一个 native module（iOS-only）

---

## 4. P2 — GA 后 30 天内（~3 天）

| # | 任务 | 估时 |
|--:|------|:---:|
| 1 | OTA 灰度发布（EAS Update channels） | 0.5d |
| 2 | A/B 实验框架接入（PostHog / Statsig） | 1d |
| 3 | 推送通知服务（expo-notifications + 后端 cron） | 1d |
| 4 | App-clip / Instant App（首次体验，不需安装） | 2d |
| 5 | 多账号切换 / 子账号 | 2d |

---

## 5. 已就绪 / 不阻塞上线的项

| 项 | 状态 | 备注 |
|---|:---:|------|
| 4-Tab 主结构 | ✅ | MainTabNavigator + 30+ 屏 |
| 21 个 Maestro flow | ✅ | `.maestro/01-30*.yaml` |
| AXP / 订阅 / 共养 / 贺卡 | ✅ | UI 层完整 |
| NFC 盲盒 / Toy 配对 | ✅ | UI + ble.service / nfc.service |
| ClawCore SDK 骨架 | ✅ | `src/services/clawcore/` |
| 本地 LLM (llama.rn) + Whisper + Porcupine | ✅ | 已装 |
| iOS / Android Intents 文件 | ✅ | `ios/AgentrixIntents/` `android/.../shortcuts.xml` |
| Universal Links AASA + assetlinks | ✅ | `public/.well-known/` |
| 28 签名灵魂全量解锁 | ✅ | SoulPicker B-F unlock |
| Plaza · Pet Auction MVP | ✅ | `PetAuctionScreen` |
| LLM 预算条 + 超额三选一 | ✅ | `LlmBudgetBar.tsx` |
| 公开镜像仓 | ✅ | `CutaGames/Agentrix-Claw` 持续同步 |

---

## 6. GA 时间窗口

| 阶段 | 时长 | 累计 |
|------|------|------|
| Sprint M-1（P0-3 + P0-4 + P0-6） | 5 d | D+5 |
| Sprint M-2（P0-1 + P0-2 双端打包 + 元数据） | 4 d | D+9 |
| 双商店审核 | 3-7 d | D+12 ~ D+16 |
| TestFlight / Play 内测 | 与审核并行 | – |
| **GA** | – | **2026-06-01 ~ 2026-06-05** |

可与 Web GA（`WEB_GO_LIVE_AUDIT_2026-05-16` §6 估 ~15 天）/ 桌面 GA（`DESKTOP_GO_LIVE_AUDIT_2026-05-15` 估 ~10 天）三端在 **2026-06-06 前后同步上线**。

---

## 7. 风险与建议

| 风险 | 影响 | 缓解 |
|------|------|------|
| iOS IAP 强制 — 不接将被拒审 | iOS 被拒 | M-P0-3 必须做；预算 4-5 天 |
| 隐私问卷选项设错（如未声明 NFC / 蓝牙） | 拒审 / 下架 | 复制 PRD §5、§6 实物清单逐条对照 |
| AXP 被认为是证券 | 法律风险 | M-P0-6 加免责说明 + 不与法币双向兑 |
| Apple Dev 账号未办 → 全卡 | M-P0-1 阻塞 | 立即开通（即时） |
| 应用截图 / 视频缺 | 商店元数据卡住 | 用桌面 G-2 时录的视频复用 + 移动端 5-10 张关键路径截图 |
| Sentry / Crashlytics 未接 | 上线后无法定位线上崩溃 | M-P0-4 必做 |

---

## 8. 立即行动建议（按优先级）

**今天**：
1. 开通 Apple Developer 账号 + Google Play Console 账号
2. 决定 IAP 方案（推荐 **RevenueCat**）

**本周**：
3. M-P0-3（IAP 接入）→ 4 天
4. M-P0-4（Sentry / 崩溃监控）→ 2 天
5. M-P0-6（合规 in-app 入口）→ 1 天

**下周**：
6. M-P0-5（后端 4 个 endpoint 联调）→ 1.5 天
7. M-P0-1 / M-P0-2（双端打包 + 元数据）→ 4 天
8. 提审

**再下周**：
9. 审核 + TestFlight / 闭环测试

---

## 9. 与已有审计文档关系

| 文档 | 关系 |
|------|------|
| `MOBILE_V4_AUDIT_2026-05-12.zh-CN.md` | 功能完成度审计（90%）；本审计是其 GA 上线工作的接续 |
| `UI_ELEMENT_AUDIT_MOBILE_2026-05.zh-CN.md` | 180+ 元素 testID 清单；Maestro flow 编写参考 |
| `WEARABLE_TOY_V4_AUDIT_2026-05-12.zh-CN.md` | 配套硬件审计；本审计仅覆盖 App 端，不涉及 Watch / Toy 量产 |
| `WEB_GO_LIVE_AUDIT_2026-05-16.zh-CN.md` | Web 端 GA 审计；同期同节奏推进 |
| `DESKTOP_GO_LIVE_AUDIT_2026-05-15.zh-CN.md` | 桌面端 GA 审计；签名外部审核中 |

---

> 本审计基于 2026-05-16 仓库快照。下次审计：商店首次提审后 7 天复盘。
