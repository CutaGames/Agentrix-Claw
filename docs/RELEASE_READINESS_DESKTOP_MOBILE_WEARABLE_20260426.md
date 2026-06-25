# Agentrix Desktop / Mobile / Wearable Release Readiness - 2026-04-26

## 结论

当前版本已经完成桌面端、移动端、Wear OS/可穿戴后端链路的关键实现和本地构建验证。桌面端已有本地 EXE/MSI/NSIS 产物和 Playwright 报告；移动端已有设备 UI smoke、local-only 模型入口验证、根 TypeScript 验证；Wear OS 已补齐 Android Google Wear Data Layer 原生 bridge，并完成完整 Debug APK 打包。

离正式上线仍有差距：必须补真实设备/真实账号的端到端验证，尤其是 Wear OS 手机-手表配对、Agent 账号差异、生产后端 wearable endpoint 部署、桌面安装包签名与干净 Windows 安装验证。当前 Wear APK 是 Debug 产物，不是可分发 Release 包。

## 本次新增/修复

- Wear OS 原生通信：新增 Android `AgentrixWearDataLayerModule` 与 `AgentrixWearDataLayerPackage`，通过 Google Play Services Wearable MessageClient/DataClient 暴露 `startListening`、`getConnectedNodes`、`sendMessage`、`putDataItem` 等能力。
- 手机到手表认证同步：移动端启动 Data Layer，处理 `/agentrix/auth/request`，向手表同步 token/auth state；手表端 `useWatchAuth` 监听 `/agentrix/auth/state` 并在 wearable API 请求里附带 token。
- 可穿戴验证上报：移动端 BLE pairing verification 会进入离线队列并调用后端 verification endpoint；monitor telemetry upload 也接入统一同步服务。
- 后端 wearable verification：新增 DTO、controller/service 入口和 service spec，本轮重跑目标测试 33/33 通过。
- Expo SDK 54 依赖对齐：`expo-image` 等包升级到 SDK 54 期望版本，解决 Kotlin 2.1 下 `expo-image` 编译失败。
- `llama.rn` Expo plugin 兼容：新增 `plugins/withLlamaRN.js`，避免第三方 `app.plugin.js` 的 ESM/CJS 加载错误，同时保留 C++20/OpenCL manifest 行为。
- 本地构建环境：Android SDK、Gradle cache、npm cache 迁到 D 盘；Gradle heap/metaspace 调整到可完成 RN/Expo dex merge。
- 桌面端卡顿优化：流式 token 改为 50ms 批处理，streaming 中用纯文本轻渲染，完成后再渲染 Markdown/highlight；自动滚动不再对每个 chunk 强制 smooth scroll。
- 移动端卡顿优化：主 Agent chat 的 SSE/local/realtime voice chunk 改为 50ms 批处理，FlatList 跟随滚动改为非动画，消息 bubble 增加 memo，减少输入框被流式输出拖慢。

## 验证证据

| 平台/模块 | 当前状态 | 证据 |
| --- | --- | --- |
| 桌面端构建产物 | 已生成本地可执行文件和安装包 | `desktop/src-tauri/target/release/agentrix-desktop.exe` 18.48 MB；`desktop/src-tauri/target/release/bundle/msi/Agentrix Desktop_0.1.1_x64_en-US.msi` 7.25 MB；`desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.1.1_x64-setup.exe` 5.39 MB |
| 桌面端前端构建 | 已通过 | `desktop` 下 `npm ci` 后 `npm run build`：tsc + Vite build 通过，只有 chunk size/dynamic import warnings |
| 桌面端自动化 | 本轮重跑完整桌面 Playwright | `npm run test:desktop:full`：30 passed、0 failed、14 skipped；报告 `tests/e2e/tests/reports/desktop-html/index.html` |
| 移动端 UI smoke | 已过快速设备回归 | `tests/reports/android-device-ui-final-quick-20260425-194024/summary.md`：112 passed、16 warnings、0 failed |
| 移动端本地模型入口 | 已过 local-only 设置入口验证 | `tests/reports/android-device-ui-local-only-20260425-193445/summary.md`：13 passed、0 warnings、0 failed |
| 移动端完整 rerun | 当前环境无在线设备，未完成 | `tests/reports/android-device-ui-release-full-20260425-current/summary.md`：0 passed、1 failed，原因是 no online Android device |
| 根 TypeScript | 本轮重跑通过 | `npm run typecheck:root` exit 0 |
| Expo SDK 依赖矩阵 | 已通过 | `CI=1 npx expo install --check`：Dependencies are up to date |
| Wear OS Kotlin/native | 已通过 | `:app:assembleDebug -Pagentrix.wearos=true` 内含 `:app:compileDebugKotlin`、CMake/native libs、JNI merge |
| Wear OS Debug APK | 已生成 | `android/app/build/outputs/apk/debug/app-debug.apk` 151.88 MB，`BUILD SUCCESSFUL in 20m 55s` |
| 后端 wearable spec | 本轮重跑通过 | `backend` 下 `npm test -- src/modules/wearable-telemetry/wearable-telemetry.service.spec.ts --runInBand`：33 passed、0 failed |
| Android/Wear 设备可用性 | 当前阻塞 | 用 `C:\Android\platform-tools\adb.exe devices` 启动 adb daemon 后列表为空，无在线 Android/Wear 设备 |
| C 盘空间/缓存迁移 | 已完成并可用 | `C:\Android` junction -> `D:\Android\Sdk`；`%USERPROFILE%\.gradle` -> `D:\agentrix-gradle-cache`；`%LOCALAPPDATA%\npm-cache` -> `D:\agentrix-npm-cache`；当前 C free 20.29 GB，D free 113.05 GB |

## 桌面端上线差距

- P0：在干净 Windows 机器上安装 NSIS/MSI，验证启动、WebView2、sidecar `127.0.0.1:8787`、Ask/Agent/Plan、local-only/auto/cloud-only、工具权限弹窗和会话同步。
- P0：安装包签名、发布渠道、自动更新策略还未确认；当前产物可本地运行，但不等于正式分发包。
- P0：14 个 skipped desktop case 需要按跳过原因复核，尤其是需要登录/OTP/真实后端状态的用例。
- P1：桌面端权限、文件系统工具、外部命令执行需要生产策略文档和拒绝/撤销路径。
- P1：长会话卡顿已用持久化 debounce、chunk 批处理、streaming 纯文本渲染和滚动降频缓解，但还需要真实多小时使用和大历史会话压测。

## 移动端上线差距

- P0：最新完整移动端回归需要在线 Android 设备重跑；当前 adb 设备列表为空，latest full rerun 因没有设备失败。
- P0：Agent 账号模块仍需要真实登录账号验证，尤其是与桌面/后端 Agent Account 数据模型不完全一致的路径。
- P0：本地模型验证目前覆盖入口和 ready 状态；还需要带真实 GGUF 模型的长对话、离线模式、内存压力和多模态输入验证。
- P0：需要 release keystore、EAS/CI release build、安装后冷启动、权限重授予、断网/弱网验证。
- P1：当前本机 Node 为 v20.11.0，React Native/Metro 期望 >=20.19.4；建议升级本机/CI Node，消除 EBADENGINE 风险。

## Wear OS / 可穿戴上线差距

- 已完成：Google Wear Data Layer native bridge、JS bridge、手机认证同步、手表 token-aware API、健康数据上传、alerts ack、watch chat fallback、BLE verification sync、后端 verification 事件落库。
- 已验证：Wear flag 下完整 Debug APK 构建通过，产物 `android/app/build/outputs/apk/debug/app-debug.apk`。
- P0：必须在真实 Wear OS 手表或官方 Wear emulator 上安装验证：手机和手表配对、`/agentrix/auth/request`、`/agentrix/auth/state`、MessageClient、DataClient、断连重连。
- P0：必须验证手表健康数据上传、alerts ack、watch chat、后台/息屏/网络切换行为。
- P0：需要 release 包配置：独立 Wear flavor 或专用 applicationId/versioning、签名、Play Console Wear listing、隐私权限文案。
- P1：当前 APK 151.88 MB，含 debug/dev 依赖和本地模型相关 native libs；上线前需要 release shrink、ABI/feature split、是否拆分手机/手表包。
- P1：Android SDK 有 `cmdline-tools/latest-2` 路径警告，建议整理为 `D:\Android\Sdk\cmdline-tools\latest`。

## AI 眼镜 / 其他可穿戴

- 已具备通用能力：BLE scan/pairing、verification 上报、telemetry collector、后端 wearable trigger event、移动端可穿戴入口。
- 尚未完成 vendor-specific 能力：眼镜摄像头/麦克风/扬声器/手势/显示投屏 SDK 接入，具体取决于目标设备厂商。
- P0：确定首批设备型号和 SDK；完成权限、隐私提示、采集范围、失败降级策略。
- P1：补充设备矩阵测试：BLE-only、Wear OS、Android-based glasses、audio-only wearable。

## 后端上线差距

- Wearable verification endpoint 代码已完成，并在当前环境通过 targeted service spec 33/33；但生产部署属于 manual approval 范围，尚未执行。
- 需要生产验证：JWT auth、verification event 入库、telemetry upload、rules trigger、OpenClaw context update。
- 两条 chat path `/openclaw/proxy/:id/stream` 与 `/claude/chat` 的工具能力同步约束仍需继续做回归，尤其是 mobile/watch 使用到的 tool/action。

## C 盘空间处理

- 已将本次 Android/Gradle/npm 大体积缓存迁到 D 盘并建立 junction，当前不再依赖 C 盘作为主要构建缓存。
- 当前 C 盘从接近 0 GB 恢复到 20.29 GB free；D 盘仍有 113.05 GB free。
- 后续建议：清理 `android/app/build`、`android/.gradle`、旧 `tests/reports`、旧 desktop target 时只删生成物，不删源码和 keystore；大型模型和 CI artifacts 继续放 D 盘。

## 下一步 P0 清单

1. 连接 Android 手机和 Wear OS 设备，安装 `app-debug.apk`，跑手机-手表认证/Data Layer/health/chat/alerts 真机 E2E。
2. 重跑移动端完整 UI smoke，补 Agent 账号真实登录验证。
3. 在干净 Windows 环境安装桌面 MSI/NSIS，验证权限、sidecar、工具调用和卸载。
4. 后端 wearable endpoint 在 staging/production 部署前走审批，部署后跑 JWT + 入库 + rule trigger 验证。
5. 生成 release 级移动/Wear/桌面签名包，并补发布渠道、隐私权限、崩溃监控和回滚方案。
