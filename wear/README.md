# Agentrix Wear OS — 原生薄壳 (Program E3 · thin-shell rebuild)

原生 Kotlin + Jetpack Compose for Wear 重构，取代旧的 RN/Expo 手表包（52MB，健康数据是
`Math.random` 模拟）。**薄壳**只做 4 件事：腕上审批 / 一瞥在场 / 抬腕一句话 / 健康→关怀。
灵魂真身在云 + 手机；手表只呈现只读摘要、上送脱敏语义。

> ⚠️ **状态：重构中，未真机实测。** 本目录是可在 Android Studio / Gradle 环境构建的完整脚手架，
> 需一次 `build-fix` + 真机联调（配对 → token 同步 → 握手 → 审批 → 一瞥 → 一句话 → 真心率）
> 方可上线。**尚未声称已验证或已达体积目标**（体积目标 <15MB / 硬上限 <30MB，需 assembleRelease 实测）。

## 目录结构

```
wear/
├─ settings.gradle.kts          # 独立项目（与 Expo 的 android/ 分离）
├─ build.gradle.kts             # 插件版本
├─ gradle.properties
├─ gradle/wrapper/gradle-wrapper.properties   # 需生成 gradle-wrapper.jar（见下）
└─ app/
   ├─ build.gradle.kts          # Compose Wear + Health Services + Tiles + Data Layer + Ktor + R8/arm64
   ├─ proguard-rules.pro
   └─ src/
      ├─ main/
      │  ├─ AndroidManifest.xml
      │  ├─ kotlin/app/agentrix/wear/
      │  │  ├─ AgentrixWearApp.kt              # Application + service locator
      │  │  ├─ MainActivity.kt                 # 一瞥 / 审批 / 一句话 三屏 pager + 系统语音
      │  │  ├─ core/
      │  │  │  ├─ Models.kt                     # E3/E1 DTO（镜像后端契约）
      │  │  │  ├─ TokenStore.kt                 # 加密 token 存储（只存 token，不存私钥/生理数据）
      │  │  │  ├─ ApiClient.kt                  # Ktor + JWT：handshake/perception/glance/approvals/quick-ask
      │  │  │  ├─ AuthBridge.kt                 # Data Layer token 同步 + 未认证兜底引导
      │  │  │  ├─ SoulShellClient.kt            # E3 握手（watch capabilities 协商）
      │  │  │  └─ AgentrixWearableListenerService.kt  # 收 /agentrix/** 消息
      │  │  ├─ ui/  GlanceScreen / GlanceViewModel / QuickAskScreen
      │  │  ├─ approval/  ApprovalScreen / ApprovalViewModel（失败闭合）
      │  │  ├─ health/  HealthMonitor（真实传感）+ ActivityClassifier（纯函数，可测）
      │  │  └─ tile/  AgentrixTileService + AgentrixComplicationService
      │  └─ res/  strings / colors / 图标 / tile 预览
      └─ test/  ActivityClassifierTest（JVM 单测）
```

## 构建

**前置**：Android Studio (Koala+) 或 CLI 装好 Android SDK (compileSdk 34) + JDK 17。

```bash
# 1) 生成 gradle wrapper jar（本仓库未提交二进制）
cd wear
gradle wrapper --gradle-version 8.9        # 或在 Android Studio 打开 wear/ 自动生成

# 2) Debug 构建
./gradlew :app:assembleDebug

# 3) Release（R8 + 资源收缩 + arm64 单架构，出体积基线）
./gradlew :app:assembleRelease
#   产物：app/build/outputs/apk/release/app-release.apk

# 4) 单元测试（JVM，纯逻辑）
./gradlew :app:testDebugUnitTest

# 5) 体积检查（硬上限 30MB）
#   见 .github/workflows/wear-build.yml 的 size-gate 步骤
```

## 后端契约（复用，不新造基座）

| 能力 | 端点 | env 门控 |
|------|------|----------|
| 灵魂握手（只读摘要） | `POST /soul-shell/handshake` | `SOUL_SHELL_PROTOCOL_ENABLED`（默认关，关→404） |
| 脱敏感知上送 | `POST /embodiment/perception/signal` | `EMBODIMENT_PERCEPTION_ENABLED`（默认关，关→404） |
| 一瞥聚合（收益/未读/待审批） | `GET /wearable-telemetry/glance` | 待后端补（薄封装，见下） |
| 待审批列表 / 回传 | `GET /wearable-telemetry/approvals`、`POST .../approvals/:id` | 待后端补 |
| 抬腕一句话 | `POST /wearable-telemetry/quick-ask` | 复用手机端已验证对话路径（待接线） |

> ⚠️ `wearable-telemetry/{glance,approvals,quick-ask}` 端点为手表薄壳新增的**只读/薄封装**契约，
> 后端可能尚未提供对应路由。客户端对 404 优雅降级为「功能未开启 / 暂无数据」（不崩溃、不误放行）。
> 上线前需在后端补这几个薄封装（或映射到既有审批/收益聚合），并绑定 E3 的
> `PRESENCE_QUERY_PORT` / `WALLET_SESSION_PORT`。

## Data Layer（复用既有手机↔手表桥，协议不变）

原生 Wear 直接用 Google Wearable API 对接与 RN `WatchDataLayerService` **相同的 path**，手机端无需改动：

- `Phone → Watch`  `/agentrix/auth/state`（token 同步，DataItem/Message）
- `Watch → Phone`  `/agentrix/auth/request`（请求 token）
- `Phone → Watch`  `/agentrix/approval/request`（推送待审批）
- `Watch → Phone`  `/agentrix/approval/response`（回传决策）

## 红线（对齐 design Correctness Properties）

1. **薄壳**：不持久化灵魂真身 / 私钥 / 原始生理读数；仅只读摘要 + 脱敏语义。
2. **审批失败闭合**：网络失败/超时 = 未批准；最终放行仍由 S1/S3/SettlementCore。
3. **真实传感**：Health Services 真心率/步数（非模拟），经 `BODY_SENSORS` 权限 + `perceptionEnabled`（默认关）双门。
4. **体积达标**：R8 + 资源收缩 + arm64 单架构；CI size-gate >30MB 失败。
5. **认证兜底**：无 token → 明确「在手机上打开 Agentrix 登录」，不静默 401 死循环。
6. **零回归**：新增独立壳，不改手机/桌面既有端与后端既有行为。
7. **诚实口径**：未实测标「重构中/路线图」；AXP 与稳定币分列，非投资建议。

## 迁移

真机通过后，再归档/下线旧 RN 手表（`src/watch/**`、`index.watch.js`、RN watch 构建 workflow），
下载服务器（`agentrix.top/downloads/agentrix-watch.apk`）替换为原生包。
