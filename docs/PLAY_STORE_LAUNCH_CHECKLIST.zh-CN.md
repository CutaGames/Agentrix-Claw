# Google Play Store 上架检查清单

> Sprint M-P0-2（Android 优先）。iOS App Store 流程见 `IOS_APP_STORE_LAUNCH_CHECKLIST.zh-CN.md`（待办）。
>
> 目标：Agentrix Android `app.agentrix.claw` 通过 Play 内测 → 公开测试 → 正式上架。

---

## 0. 状态

- App version：`1.1.0`（`app.json`）
- 包名：`app.agentrix.claw`
- EAS production profile：`.aab` build 已配置（`eas.json`）
- 签名：upload key 由 EAS 管理；待 Play Console 创建后配置 App Signing
- Crash 监控：Sentry 接入完成（`src/services/crashReport.ts`），需要在 Play Console 应用内启用
- IAP：`react-native-purchases`（RevenueCat）SDK 已集成；产品需在 Play Console 创建

---

## 1. 前置工作

| # | 任务 | 状态 | 说明 |
|---|------|:---:|------|
| 1 | Google Play Console 账号 | ⏳ 待开 | $25 一次性，公司主体（Agentrix Pte. Ltd.） |
| 2 | EAS production keystore | ✅ 自动 | 首次 `eas build --platform android --profile production` 生成；记录 SHA-256 供 assetlinks 用 |
| 3 | Sentry DSN | ⏳ 待配 | 在 Sentry 创建 `agentrix-mobile-android` project，DSN 注入 `EXPO_PUBLIC_SENTRY_DSN` |
| 4 | RevenueCat Android API Key | ⏳ 待配 | RevenueCat dashboard 创建 app，注入 `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` |
| 5 | Play Console 应用创建 | ⏳ 待开 | 包名 `app.agentrix.claw`，应用名 "Agentrix" |
| 6 | 商品列表 | ⏳ 待建 | 见下文 §3 |

---

## 2. 应用商店元数据

### 2.1 应用基本信息

| 字段 | 中文 | English |
|------|------|---------|
| 应用名称 | Agentrix - AI 萌宠助手 | Agentrix - AI Pet Companion |
| 短描述（80 字） | 你的智能体伙伴：聊天、创作、配对玩具、陪伴成长 | Your AI agent companion: chat, create, bond, grow together |
| 完整描述 | 见 `docs/business/STORE_DESCRIPTION_LONG.md`（待写）| 同 |
| 主类别 | 生活方式 / 工具 | Lifestyle / Tools |
| 次类别 | 社交 / 实用工具 | Social / Productivity |
| 标签 | AI, 助手, 萌宠, 钱包, NFC | AI, assistant, pet, wallet, NFC |

### 2.2 图形资产（必备）

| 资产 | 尺寸 | 数量 | 状态 |
|------|------|:---:|:---:|
| 应用图标 | 512×512 PNG | 1 | ✅ 已有（`Agentrix Logo/agentrix_app_icon_1024.png` 缩放） |
| 功能图 | 1024×500 PNG | 1 | ⏳ 待设计 |
| 手机截图 | 1080×1920+ | 5-8 | ⏳ 待截 |
| 平板截图（可选） | 1600×2560+ | 0-8 | 可跳过 |
| 推广视频 | YouTube URL | 1 | ⏳ 用 `docs/business/VIDEO_PRODUCTION_PLAN_v3_FINAL.zh-CN.md` 60s 版本 |

**截图策略（5 张）**：
1. Home Tab 主宠 + 抽屉 10 入口
2. Summon Tab 与 AI 聊天界面
3. Plaza · Skins 集市
4. Wardrobe / SoulPicker 灵魂切换
5. AXP Center / Subscribe 5 档对照

---

## 3. 内购商品（IAP）

需在 Play Console → Monetize → Products 创建：

### 3.1 订阅产品（Subscriptions）

| 产品 ID | 周期 | 价格 (USD) | 状态 |
|---------|------|:---------:|:---:|
| sub_lite_monthly | 月 | $9.90 | ⏳ |
| sub_lite_yearly | 年 | $99.00 | ⏳ |
| sub_plus_monthly | 月 | $19.90 | ⏳ |
| sub_plus_yearly | 年 | $199.00 | ⏳ |
| sub_pro_monthly | 月 | $49.90 | ⏳ |
| sub_pro_yearly | 年 | $499.00 | ⏳ |
| sub_elite_monthly | 月 | $99.90 | ⏳ |
| sub_elite_yearly | 年 | $999.00 | ⏳ |

### 3.2 一次性消耗品（AXP 充值）

| 产品 ID | AXP 数量 | 价格 (USD) | 备注 |
|---------|:------:|:---------:|------|
| axp_pack_100 | 100 | $0.99 | 入门包 |
| axp_pack_500 | 500 | $4.99 | 标准包 (无奖励) |
| axp_pack_1200 | 1200 | $9.99 | 推荐包 (+20%) |
| axp_pack_3000 | 3000 | $19.99 | 中级包 (+50%) |
| axp_pack_8000 | 8000 | $49.99 | 大包 (+60%) |

后端 IAP webhook (`POST /v1/payment/iap-webhook`) 已就绪；按 `axp_pack_<amount>` 命名约定自动入账。

---

## 4. 隐私 / 数据安全表单

Play Console → App content → Data safety。重点字段：

### 4.1 收集的数据类型

| 类别 | 是否收集 | 用途 | 必选 / 可选 |
|------|:------:|------|:----------:|
| 个人信息（邮箱） | ✅ | 账号 / 客服 | 必选 |
| 身份证明（钱包地址） | ✅ | 账号 / 支付 | 可选 |
| 用户名 / 头像 | ✅ | 账号 | 必选 |
| 财务信息（信用卡） | ❌ | Stripe 直接处理，App 不接触 | – |
| 健康 / 运动 | ❌ | 不收集 | – |
| 通讯录 | ❌ | 不收集 | – |
| 位置（粗略） | ❌ | 仅在用户主动请求时（Play 集成）| – |
| 网页浏览历史 | ❌ | 不收集 | – |
| 应用日志 | ✅ | 崩溃报告（Sentry）| 可关闭 |
| 设备 / 其他 ID | ✅ | 防欺诈 | 必选 |
| 照片 / 视频 | ✅ | PetCreator 图生 / 摄像头扫描 | 仅本地 |
| 音频 | ✅ | 语音聊天 / Wake Word | 用户确认 |

### 4.2 第三方共享

| 第三方 | 用途 | 数据类型 |
|--------|------|----------|
| Stripe | 信用卡支付 | 支付 token（不含卡号） |
| RevenueCat | IAP webhook | 购买记录 / 用户 ID |
| Sentry | 崩溃监控 | 设备 ID / 脱敏栈追踪 |
| Anthropic / OpenAI / Google AI | 云端 AI 推理 | 对话内容（仅当用户使用 cloud tier）|
| Cloudflare | CDN | 标准请求日志 |

### 4.3 安全

| 字段 | 状态 |
|------|:---:|
| 数据加密传输（HTTPS） | ✅ 已用 |
| 数据加密存储 | ✅ 后端 Postgres + secret rotation |
| 用户可删除数据 | ✅ 通过 App 内"删除账号"入口（Sprint M-P0-6） |
| 独立安全审计 | ⏳ 推迟到 GA 后 |

### 4.4 内容分级（IARC 问卷）

| 维度 | 应答 |
|------|------|
| 暴力 | 无 |
| 性内容 | 无 |
| 粗俗语言 | 用户生成（评论 / Marketplace 描述）— 选"用户生成内容" |
| 受控物质 | 无 |
| **数字货币 / 加密交易** | **是** — Marketplace 含 NFT 预售、AXP 积分 |
| 在线交互 | 是（多人 / 公开聊天） |
| 个人信息共享 | 是（已在数据安全表单声明） |

预期 ESRB / PEGI 分级：**T (13+)** / PEGI **12**。

---

## 5. 权限说明

每个权限在 Play Console 都需要附用途说明：

| 权限 | 用途 |
|------|------|
| RECORD_AUDIO | 语音聊天与本地唤醒词 |
| CAMERA | PetCreator 图生 + V5 摄像头扫描 |
| BLUETOOTH_* | Toy 玩具配对 |
| ACCESS_*_LOCATION | 仅在用户使用位置相关功能时（如附近共养邀请） |
| FOREGROUND_SERVICE_MICROPHONE | 后台保留唤醒词监听 |
| SYSTEM_ALERT_WINDOW | Android 悬浮球（系统级悬浮窗）|
| READ/WRITE_EXTERNAL_STORAGE | 保存生成的宠物 / 头像 |
| USE_BIOMETRIC | 钱包生物识别签名 |
| RECEIVE_BOOT_COMPLETED | 重启后恢复后台唤醒服务 |

**敏感权限审核**：`FOREGROUND_SERVICE_MICROPHONE` 在 Play Store 是新规要求（2024 年 7 月起），需提供视频证据演示前台服务实际使用麦克风的合法场景（唤醒词监听）。

---

## 6. App Links 验证

### 6.1 Manifest 已配

`android/app/src/main/AndroidManifest.xml` 已加：
- `<meta-data android:name="com.google.android.actions" android:resource="@xml/actions"/>` （App Actions 6 BIIs）
- `<intent-filter android:autoVerify="true">` `https://agentrix.top` （Universal Links）

### 6.2 服务端 assetlinks.json

`https://agentrix.top/.well-known/assetlinks.json` 已部署（包名 `app.agentrix.claw`）。

**SHA-256 fingerprint 替换**：构建 production .aab 后用以下命令获取签名：

```bash
keytool -list -v -keystore ~/eas-android-keystore.jks \
  -alias agentrix-claw -storepass <password>
```

把输出的 SHA-256 替换 `frontend/public/.well-known/assetlinks.json` 中的
`PLACEHOLDER_REPLACE_WITH_PRODUCTION_KEYSTORE_SHA256`。

### 6.3 验证

发布后用 Google 工具验证：

```bash
adb shell pm get-app-links app.agentrix.claw
# 期望：状态 = verified
```

---

## 7. 发布轨道（Release tracks）

```
Internal testing → Closed testing → Open testing → Production
   ↓                  ↓                ↓               ↓
   100 测试者          200 测试者        所有 opt-in       全球
   即时审核            1-2 天           2-7 天            2-7 天
```

**建议路径**：
1. **Internal**（D+0）：100 名内部测试 + 团队 + 早期 Beta 用户
2. **Closed**（D+7）：扩展到 200 名 Beta + 受邀种子用户
3. 视质量，决定走 **Open testing 或直接 Production**

---

## 8. 上线后

| # | 任务 | 触发时机 |
|---|------|---------|
| 1 | 在 Play Console 启用 Vitals 监控（ANR / Crash 率告警） | 首次发布即开 |
| 2 | 关联 Sentry 与 Play Vitals（DSN 关联） | 同上 |
| 3 | 关联 RevenueCat 与 Play 订阅 | 上线前 |
| 4 | A/B 测试启用（Listing experiments） | 30 天后 |
| 5 | OTA 更新（EAS Update + Play in-app update API） | 持续 |

---

## 9. 已就绪 / 阻塞

### ✅ 已就绪

- App version + 包名稳定（1.1.0 + `app.agentrix.claw`）
- EAS production .aab 配置
- Sentry 接入 + opt-in 隐私网关
- RevenueCat SDK 集成 + 后端 webhook 骨架
- 后端 4 个 endpoint：AXP redeem catalog/redeem + Mobile checkout session/intent + IAP webhook
- Manifest App Actions 引用 + autoVerify intent-filter
- assetlinks.json 上线 (`https://agentrix.top/.well-known/assetlinks.json`)
- 隐私政策 + 服务条款 in-app 链接（Settings → About）
- 删除账号 / 数据导出 入口（邮件触发）
- AXP 不是货币的免责声明（AxpCenter 底部）

### ⏳ 阻塞外部审核 / 账号

- Google Play Console 账号未开（5 分钟）
- Sentry / RevenueCat dashboard 未建（10 分钟）
- 应用截图 5 张（用 `docs/business/VIDEO_PRODUCTION_PLAN_v3_FINAL.zh-CN.md` 录制时复用）
- 隐私问卷 / 内容分级填写（30 分钟）
- 第一次 production .aab build + upload（30 分钟）

预计 **D+1 ~ D+2** 完成所有内部准备 → 提交内测审核 → **D+3 ~ D+5** 进入 Closed testing。

---

## 10. 与 iOS 的关系

iOS 流程整体类似但有以下差异：

1. **Apple Developer 账号** $99/年（vs Play Console $25 一次性）
2. **审核更严**：1-7 天 vs Play 1-2 天
3. **IAP 必须真接入** — Apple 不允许虚拟商品走 Stripe；Android 同要求但执行较松
4. **Sign in with Apple** 强制 — 任何用第三方登录的应用必须提供 SIWA
5. **App Tracking Transparency** 框架 — 跨应用追踪需用户授权
6. **TestFlight** 内测期 7-14 天（vs Play Internal 即开即用）

iOS 流程留待 `IOS_APP_STORE_LAUNCH_CHECKLIST.zh-CN.md`（M-P0-1）下一轮处理。

---

> 本文档随上架进度更新。下次更新时机：Play Console 账号注册完成。
