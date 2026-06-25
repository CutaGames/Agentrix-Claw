# Agentrix Watch App PRD

## 产品名称
**Agentrix Claw Watch** — AI Agent 手腕伴侣

## 版本
v0.1 MVP | 2026-03-31

---

## 一、产品定位

在手腕上运行的 **Agentrix 裁剪版**，聚焦三件事：
1. **快速对话** — 抬腕即可对 Agent 说话/打字，获得精简回复
2. **实时健康** — 直接读取手表传感器数据，推送到平台
3. **通知+快捷操作** — Agent 触发的告警/任务一键确认

**不做的事**（留给手机端）：
- 完整 Agent 配置/创建
- 钱包支付/签名
- 技能市场浏览
- 社交/社区功能
- 复杂的自动化规则编辑

---

## 二、目标平台

### MVP 阶段：Wear OS（Android）
- **技术栈**：React Native（复用现有 Expo 生态 + 共享服务层）
- **原因**：
  - Expo SDK 54 + React Native 0.81 可通过自定义 Gradle 配置生成 Wear OS APK
  - 复用现有 `src/services/` 层（API客户端、token管理、i18n）
  - 开发成本最低，与手机端共享代码库
  - 三星 Galaxy Watch、Pixel Watch 等设备覆盖率足够
- **最低支持**：Wear OS 3.0+（API 30+）

### 后续阶段：watchOS（Apple Watch）
- 需要 Swift/SwiftUI 原生开发（WatchKit）
- 通过 WatchConnectivity 与手机端同步
- Phase 2 再启动

---

## 三、用户场景

| # | 场景 | 描述 | 优先级 |
|---|------|------|--------|
| S1 | 抬腕问 Agent | 用户抬起手腕，语音/文字快速提问，Agent 返回精简回答 | P0 |
| S2 | 健康数据推送 | 手表每分钟采集心率/步数/电量，自动同步到平台 | P0 |
| S3 | 智能告警 | Agent 根据规则触发通知（如心率过高），手表震动提醒 | P0 |
| S4 | 快捷确认 | Agent 发来任务/交易确认请求，手表上一键 "确认/拒绝" | P1 |
| S5 | 状态一览 | 抬腕看 Agent 状态、今日任务摘要、收益概览 | P1 |
| S6 | 离线缓存 | 无手机连接时，缓存最近对话和健康数据，恢复后同步 | P2 |

---

## 四、信息架构

```
[手表 App 入口]
    │
    ├── 🏠 主表盘 (Home Tile)
    │   ├── Agent 状态指示灯 (在线/离线)
    │   ├── 最新消息预览 (1行)
    │   └── 今日步数/心率迷你卡
    │
    ├── 💬 对话 (Chat)
    │   ├── 最近3条消息气泡
    │   ├── 语音输入按钮 (长按说话)
    │   ├── 快捷回复 chips (好的/稍后/取消)
    │   └── 文字输入 (系统键盘)
    │
    ├── ❤️ 健康 (Health)
    │   ├── 实时心率 (大数字 + 波形图)
    │   ├── 今日步数
    │   ├── 电池电量
    │   └── 同步状态
    │
    ├── 🔔 通知 (Alerts)
    │   ├── Agent 规则触发告警列表
    │   ├── 交易确认请求
    │   └── 一键确认/拒绝
    │
    └── ⚙️ 设置 (Settings)
        ├── 登录状态 / Token
        ├── 同步间隔 (30s/1min/5min)
        ├── 通知偏好
        └── 关于
```

---

## 五、技术架构

### 5.1 项目结构

```
src/
  watch/                          # 手表端专属代码
    WatchApp.tsx                  # 入口组件 (替代App.tsx)
    screens/
      WatchHomeScreen.tsx         # 主表盘
      WatchChatScreen.tsx         # 对话
      WatchHealthScreen.tsx       # 健康数据
      WatchAlertsScreen.tsx       # 通知/告警
      WatchSettingsScreen.tsx     # 设置
    components/
      WatchHeader.tsx             # 圆形表头导航
      WatchMessageBubble.tsx      # 精简消息气泡
      WatchHealthCard.tsx         # 健康数据卡片
      WatchAlertCard.tsx          # 告警卡片
      WatchQuickReply.tsx         # 快捷回复chips
    hooks/
      useWatchSensors.ts          # 手表传感器数据采集
      useWatchAuth.ts             # Token 管理
      useWatchSync.ts             # 后台数据同步
    services/
      watchHealthService.ts       # 健康数据采集+上报
      watchNotificationService.ts # 本地通知+震动
    theme/
      watchColors.ts              # 手表配色 (AMOLED优化)
      watchLayout.ts              # 圆形屏幕布局常量
    navigation/
      WatchNavigator.tsx          # 手表端导航 (滑动翻页)
```

### 5.2 共享代码（直接复用）

| 共享模块 | 路径 | 用途 |
|---------|------|------|
| API 客户端 | `src/lib/apiClient.ts` | HTTP 请求 + Token 刷新 |
| 类型定义 | `src/services/wearables/wearableTypes.ts` | 遥测/规则/条件类型 |
| i18n | `src/i18n/` | 中英文翻译 |
| Token 存储 | `src/services/auth/` | JWT 存储和刷新 |

### 5.3 手表专有需求

| 需求 | 实现方式 |
|------|---------|
| 心率读取 | Android Health Services API (`WearableListenerService`) 或 `react-native-health-connect` |
| 步数读取 | Android Health Services Passive Goals |
| 震动反馈 | `expo-haptics` (已有) / `Vibrator` API |
| 常亮显示 | Wear OS Ambient Mode 支持 |
| 圆形UI | 自适应布局 + `WearableRecyclerView` 概念 |

### 5.4 通信流

```
手表 App
    │
    ├── 直连后端 (WiFi/LTE)
    │   POST /api/wearable-telemetry/upload    ← 健康数据
    │   POST /api/claude/chat                  ← Agent 对话
    │   GET  /api/wearable-telemetry/triggers  ← 告警拉取
    │   
    └── 通过手机中继 (BLE/Wear Data Layer)
        仅在无网络时使用手机中继
```

### 5.5 屏幕尺寸约束

| 参数 | 典型值 |
|------|--------|
| 屏幕尺寸 | 1.2"-1.5" (圆形/方形) |
| 分辨率 | 396×396 (圆形) / 450×450 (方形) |
| 可用区域 | ~320×320dp (去除圆角) |
| 字体最小 | 12sp (正文), 10sp (辅助) |
| 触控目标 | ≥48dp |
| 列表项高度 | ≥52dp |

---

## 六、UI 设计规范

### 6.1 配色（AMOLED 优化）

```javascript
watchColors = {
  bg: '#000000',            // 纯黑 (AMOLED 省电)
  surface: '#1A1A2E',       // 卡片背景
  surfaceLight: '#252540',  // 活跃卡片
  primary: '#1a77e0',       // 品牌蓝 (与手机端一致)
  accent: '#00d4ff',        // 强调色
  text: '#FFFFFF',          // 主文字
  textSecondary: '#8ba3be', // 副文字
  textMuted: '#4d6278',     // 弱化文字
  heartRate: '#EF4444',     // 心率红
  steps: '#10B981',         // 步数绿
  battery: '#F59E0B',       // 电量黄
  alert: '#EF4444',         // 告警红
  success: '#10B981',       // 成功绿
}
```

### 6.2 布局原则

1. **一屏一任务** — 每个屏幕只做一件事
2. **大字号** — 核心数据 40sp+，一眼可读
3. **圆形安全区** — 重要元素在内切圆内
4. **垂直滚动** — 只允许上下滑动
5. **左右翻页** — 屏幕间切换
6. **底部操作区** — 主按钮放在6点钟位置

---

## 七、MVP 功能清单

### Phase 1：MVP（本次交付）

| # | 功能 | 描述 | 屏幕 |
|---|------|------|------|
| F1 | 手表端项目架构 | 独立入口 + 导航 + AMOLED主题 | - |
| F2 | 主表盘 | Agent状态 + 最新消息 + 心率/步数速览 | WatchHome |
| F3 | Agent对话 | 语音/文字输入 → Agent回复(精简) | WatchChat |
| F4 | 实时心率 | 读取手表传感器 → 大数字显示 | WatchHealth |
| F5 | 步数/电量 | 当日累计步数 + 手表电量 | WatchHealth |
| F6 | 健康数据同步 | 定时上报遥测到后端 | 后台 |
| F7 | Agent通知 | 规则触发告警 → 手表震动 + 卡片 | WatchAlerts |
| F8 | 一键确认/拒绝 | 告警卡片上的操作按钮 | WatchAlerts |
| F9 | 设置页 | Token/同步间隔/通知偏好 | WatchSettings |

### Phase 2（后续）

| # | 功能 |
|---|------|
| F10 | watchOS 原生版本 |
| F11 | 表盘 Complication / Tile |
| F12 | 离线缓存 + 重连同步 |
| F13 | 手势快捷操作（甩手接听等） |
| F14 | 多 Agent 切换 |
| F15 | 支付确认（手表端快速授权） |

---

## 八、后端接口（已有，直接复用）

| 接口 | 方法 | 用途 |
|------|------|------|
| `/api/claude/chat` | POST | Agent 对话（精简 system prompt） |
| `/api/wearable-telemetry/upload` | POST | 健康遥测上报 |
| `/api/wearable-telemetry/triggers` | GET | 拉取告警事件 |
| `/api/wearable-telemetry/triggers/:id/acknowledge` | POST | 确认告警 |
| `/api/wearable-telemetry/triggers/unacknowledged/count` | GET | 未读告警数 |
| `/api/auth/refresh` | POST | Token 刷新 |

无需新增后端接口，所有 API 已就绪。

---

## 九、构建方案

### Wear OS APK

```
Expo SDK 54 → EAS Build (custom android flavor)
  app.json 新增 wear 配置：
    - 独立 entry point: src/watch/WatchApp.tsx  
    - minSdkVersion: 30 (Wear OS 3.0)
    - 移除不需要的权限 (CAMERA, PHOTO_LIBRARY)
    - 添加 <uses-feature android:name="android.hardware.type.watch" />
    - 圆形屏幕 + Ambient Mode 声明
```

### 开发调试

```
1. 手表模拟器：Android Studio → Wear OS AVD
2. 实机：Galaxy Watch / Pixel Watch 开发者模式 ADB
3. 热更新：Expo Go 不支持 Wear → 需要 dev-client build
```

---

## 十、成功指标

| 指标 | MVP 目标 |
|------|---------|
| 手表端安装到首次对话 | < 30秒 |
| 心率数据延迟（传感器→平台） | < 5秒 |
| 对话响应时间 | < 3秒（首 token） |
| 电池消耗 | < 5%/小时（后台同步） |
| APK 体积 | < 15MB |

---

## 十一、风险与对策

| 风险 | 对策 |
|------|------|
| React Native 在 Wear OS 上性能不佳 | 精简组件数，禁用动画，使用 FlatList 虚拟化 |
| 圆形屏幕适配复杂 | 统一使用 padding 安全区，避免边角内容 |
| BLE react-native-ble-plx 在 Wear 兼容性 | 手表直接用 Health Services API，不走 BLE |
| Expo 不原生支持 Wear OS build target | 自定义 android/build.gradle + config plugin |
| Token 在手表上过期 | 实现静默刷新 + 扫码快速登录 |
