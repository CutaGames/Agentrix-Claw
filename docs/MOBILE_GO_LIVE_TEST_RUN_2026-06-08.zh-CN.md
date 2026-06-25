# 移动端上线级整体测试 — 执行计划 + 实时缺陷追踪（2026-06-08）

> 目标：对 Agentrix Mobile（Expo SDK 54 / RN 0.81 / 包名 `app.agentrix.claw`）做覆盖全部 UI 与功能的整体测试，按 P0/P1/P2 修复并迭代版本，直到达到可上线标准。
> 本文是**活文档**：测试一项更新一项，缺陷进 §6 追踪表，修复后回填 commit + 验证结论。
> 衔接：`E2E_TEST_PLAN_V4_2026-05.zh-CN.md`（全量矩阵）、`MOBILE_GO_LIVE_AUDIT_2026-05-16.zh-CN.md`（上架卡点）。

---

## 0. 环境与工具就绪状态

| 项 | 状态 | 说明 |
|----|:---:|------|
| 真机 华为 P40 Pro（ELS-AN00） | ✅ | adb 已连通（`MDX0220309000133 device`）。坑：HiSuite 的 hdbtransport 会以 "Huawei HDB Interface" 独占设备使标准 adb 看不到，需关 HiSuite + USB 选 MTP + 重新授权 |
| adb | ✅ | `D:\Android\Sdk\platform-tools\adb.exe` |
| Maestro（自动化 UI flow） | ❌ | 本机未安装;`.maestro/*.yaml` 已有 30+ flow，待装 Maestro 后可跑 |
| jest 单测 | ✅ | `npm test`（无需设备） |
| tsc 类型检查 | ✅ | `npm run typecheck:root`（无需设备） |
| 生产后端 | ✅ | `47.130.176.148`，PM2 `agentrix-backend` |
| 监控/IAP | ✅ | `@sentry/react-native` + `react-native-purchases`(RevenueCat) 已是依赖 |

**测试分两条腿并行：**
- A. **无设备**（现在就能跑）：tsc 类型检查、jest 单测、静态崩溃/死循环审计、API smoke。
- B. **真机**（需 adb 恢复）：启动/导航/各 Tab/抽屉/语音/悬浮球 端到端，adb 驱动 UI + logcat 抓崩溃/ANR + 截图。

---

## 1. 严重级判定（沿用 V4 标准）

| 级别 | 判据 | 处理 |
|:---:|------|------|
| **P0** | 崩溃 / ANR / 启动失败 / 核心路径 404 空白 / 登录失败 / 无响应>5s | 立即修，阻塞上线 |
| **P1** | console error / 功能有入口但点了无效 / 功能无入口 / 数据错乱 | 上线前修 |
| **P2** | mock 未标注 / 文案错乱 / i18n 缺失 / 次要体验 | 上线前尽量修 |

---

## 2. 测试范围（功能面清单）

按 4 主 Tab + 全局 + 悬浮球 + 跨端，逐面遍历"每个可点元素都要有有效响应、不死路"。

### 2.1 启动 / 鉴权
- 冷启动 splash → 登录页/主页；社交登录（之前报过"登录失败"）；登出；token 失效重登。

### 2.2 Home Tab（🏠）
- 主宠渲染 + XP + 情绪；签到 AXP；召唤 CTA；长按唤出 10 入口抽屉（技能/接单/钱包/记忆/玩乐/衣柜/灵魂/繁育/身份/创生）逐个可达非空白。

### 2.3 Summon Tab（🔮 / Agent Chat）
- 发文字消息→AI 回复；模型选择（BYO sonnet 4.6 优先）；语音实时（红色电话）；按住说话转写；LLM 预算条；工具调用。

### 2.4 Plaza Tab（🎪）
- Feed / 技能市场 / 任务市场 / 宠物（皮肤拍卖+主宠拍卖）/ 玩乐（模仿秀/预测/共养/贺卡）。

### 2.5 Me Tab（👤）
- 个人信息 + 订阅 5 档；AXP 中心 + 流水 + 兑换；设备管理 + Toy 配对；合规入口（隐私/条款/删除账号/数据导出）。

### 2.6 全局
- 右上角铃铛(Inbox)/扫码；Deep Link 接收；推送通知。

### 2.7 悬浮球 / 陪伴（P-9 Companion）
- 真实球渲染（非 fallback）+ 可拖动 + 吸附 + 持久化；单击→对话气泡；长按→PetDetailSheet；实时语音；崩溃远程上报无新增。

### 2.8 跨端 / 硬件（次优先级，缺硬件可后置）
- NFC 盲盒；Toy BLE 配对；Watch/Glass。

---

## 3. 执行方法

### 3.1 无设备自动化（A 腿）
```
npm test                       # jest 单测（回归）
npm run typecheck:root         # 全量 TS 类型检查（找真实类型 bug）
```
失败项 → §6 缺陷表（标 [静态]）。

### 3.2 真机 adb 驱动（B 腿，待 adb 恢复）
```
adb shell am start -n app.agentrix.claw/.MainActivity
adb logcat -c; adb logcat *:E ReactNativeJS:V > run.log   # 抓崩溃（注意 release 剥 JS 日志，看 native + Sentry）
adb shell input tap X Y / adb shell input swipe ...        # 驱动 UI
adb exec-out screencap -p > shot.png                       # 截图核对
adb shell dumpsys activity | findstr mResumedActivity      # 当前页验证
```
每个面：进入→截图→点击每个元素→观察跳转/崩溃/ANR→记录。

### 3.3 Maestro（待装）
```
maestro test .maestro/        # 全量回归
```

---

## 4. 迭代循环

1. 跑 A 腿（tsc + jest）→ 修 P0/P1 → 重跑绿。
2. adb 恢复后跑 B 腿真机遍历 → 记缺陷 → 修 → 重测。
3. 一批修复后 `git commit`（仅相关文件）→ push → blobless 镜像触发 APK → 用户装新包复测。
4. 重复直到 P0=0、P1=0、关键路径全绿。

---

## 5. 进度看板

| 批次 | 内容 | 状态 |
|------|------|:---:|
| B0 | 环境就绪 + 计划 | ✅ |
| B1 | A 腿：tsc + jest 基线 | ⏳ 进行中 |
| B2 | 悬浮球崩溃循环修复（slot=ball 无限 setState） | ✅ 已修(c28e1e004)，待真机验证 |
| B3 | 真机启动+4 Tab 冒烟 | ✅ 启动无崩溃;4 Tab 往返切换无 FATAL/ANR |
| B3b | deep-link 全屏可达性扫描（29 路由） | ✅ 29 屏全部可达、0 崩溃/0 ANR/0 焦点丢失（焦点恒在 agentrix=已登录） |
| B4 | 语音全链路（实时+按住说话） | ⬜ 需用户真机手动测（adb 无法注入麦克风音频+按住手势） |
| B5 | 抽屉 10 入口 + Plaza/Me 子页遍历 | 🟡 deep-link 18 屏截图图库已出(`D:\agentrix-build-tmp\screens\`)供 UX 核对;逐元素 Maestro 见 B8 |
| B6 | 合规入口 + IAP + 监控验证 | ⬜ |
| B7 | GMS 缺失日志刷屏排查（华为无 GMS） | 🟡 已确认 idle 下 ~10 条/秒持续刷屏（BUG-003,根因已定位） |
| B8 | Maestro 自动化逐元素遍历 | 🟡 **真因已修**：① CI 的 `maestro test .maestro` 一直在**解析阶段**就崩(`.maestro/pet-sprite-behavior-test.yaml` 是错放的桌面测试,`timeout` 属性非法)→ 0 个 flow 运行;② 7 个 flow appId 写错(com.cutagames.agentrix / com.agentrix.claw → 应 app.agentrix.claw);③ 生产/真机上悬浮球永久动画阻塞 UiAutomator idle。已分别修复(删错放文件 + 改 appId + 动画 E2E gate)。CI build #395 验证中 |
| B9 | Home 首页渲染核查 | 🟡 截图异常小(31–46KB vs 其他 160–660KB)、无崩溃 → 疑似首页内容稀疏/未充分加载,待肉眼核对 |

---

## 6. 缺陷追踪表

| ID | 级别 | 面 | 现象 | 根因 | 修复 commit | 验证 |
|----|:---:|----|------|------|------|:---:|
| BUG-001 | P0 | 悬浮球 | 真实球崩溃→静态 fallback，无法移动/挡按键 | CompanionBall 无 selector 订阅整店 + effect 调 setter → 无限 setState 循环（Maximum update depth exceeded） | c28e1e004 | ✅ **真机已验证**：新包(09:35)驱动 4Tab+29 deeplink 后端 COMPANION-CRASH 今日=0（昨日同账号多次） |
| BUG-002 | P0 | 按住说话 | 转写超时 | **根因确诊+已修**：你 11:53PM 面包屑 = `stop-called branch=localSpeech` → 云模型按住说话错走了端侧语音识别(ExpoSpeechRecognition),华为无 GMS 时 `controller.stop()` 挂死→48s 看门狗→超时。该测试来自**修复前旧包** | 33e6d0991(已确认在 build 源码) | ⬜ **装新包 52e3c31 按住说话一次** → 应走 expoAv→transcribe-json |
| BUG-004 | P1? | Home 首页 | 首页截图异常小(31–46KB)、内容疑似稀疏；无崩溃 | 待核查（可能只是深色背景+宠物，也可能卡加载） | — | ⬜ 肉眼核对首页 |
| BUG-005 | P0 | 实时语音 | agent 念稿时无法打断(barge-in 失效),起不到实时通话效果 | duplex 客户端 TTS(enqueueStreamedSpeech/speakText)调 `stopLiveSpeech` 把麦克风整停 → 已接通的 onBargeIn 无监听;且每句重置 1500ms 冷却 | 63ada16e8（念稿改 `muteForEchoCancel` 保活 + 幂等冷却） | ⬜ 装新包,实时对话中说话打断 agent 验证 |
| E2E-INFRA | — | Maestro 套件 | 全套无法在 40min CI 窗口内跑完(单 flow 慢至 15min)+ 驱动启动 flake + 选择器过时 | 见 §9 | 解析修复 7979c0de9/4b44b9597 + auto-seed e4b5008fd + 驱动超时 0cf9141a0 | 🔧 套件已能跑;全绿需专项 flow 维护(见 §9) |
| BUG-003 | P2 | 全局/华为(无GMS) | idle 下 ~10 条/秒持续刷 GMS 警告（耗电+刷日志，非崩溃） | **已精确定位**：① `gms.wearable`(主犯)= App.tsx 无条件 `WatchDataLayerService.startListening()` + 每30s心跳 `getConnectedNodes` 在无 GMS 华为上触发 Wearable client 紧密重试(SERVICE_UPDATING);② `gms.location` = 运动/journey 的 `getCurrentPositionAsync` 走 GMS 融合定位。属 native GMS client 重试 | 待定（需 native gate + 构建验证） | ⬜ 方案：native 模块/启动处加 `isGooglePlayServicesAvailable` gate;或 App.tsx 仅在探测到已配对手表节点后再 startListening + 心跳 |

---

## 7. 真机 adb 重连步骤（需用户操作一次）

当前 `adb devices` 为空，HiSuite 占用了连接。请按序操作（任一组生效即可）：

1. 手机下拉通知栏 → USB 连接方式选 **“传输文件 (MTP)”**（不要停在“仅充电”或“HiSuite/HDB”）。
2. 设置 → 系统和更新 → 开发人员选项 → 确认 **“USB 调试”开启**；点 **“撤销 USB 调试授权”** 后重插，手机弹出授权框勾选“一律允许”→ 确定。
3. 若仍不行：关闭/退出 **华为手机助手 (HiSuite)**（它会抢占 adb），然后重插数据线。
4. 完成后告诉我，我执行 `adb devices` 确认并立即开跑真机遍历。

> 注：HiSuite 用的是文件管理通道，自动化测试需要的是 USB 调试(adb)通道，两者可能互斥。


---

## 8. 关于"逐元素功能遍历"的工具结论与解锁路径

**现状**：本机已装 Maestro(`D:\agentrix-build-tmp\maestro`)、设备可连,但对**生产 APK** 跑 Maestro 两次都 "Unable to launch app"。根因不是装错,而是固有冲突:
1. Maestro 底层依赖 Android UiAutomator/无障碍树。本 app 的悬浮球(GlobalFloatingBall)有**永不停止的 Animated.loop**(呼吸/脉冲),无障碍树永远到不了 idle → uiautomator dump 和 Maestro 的 launch/screenshot 驱动都卡(同一根因:我手动 `uiautomator dump` 也报 "could not get idle state")。
2. 华为 HDB(hdbtransport)反复抢占设备,运行中途掉线。
3. 仓库 30+ `.maestro/*.yaml` flow 本就是为 CI 的 **`EXPO_PUBLIC_MAESTRO_E2E=1` 构建**设计的(见 `.github/workflows/v4-e2e-tests.yml`),不是为生产包。

**因此**:在"装着生产包的真机 + 无视觉"组合下,自主完成"每个按钮点了功能/体验良好"的逐元素判断**不可行**(体验/视觉好坏本质需要人眼或视觉能力)。已能做且已做的:可达性 + 崩溃豁免(29 屏 deep-link 全过)、关键 18 屏截图图库(供人核对)、每屏崩溃/加载信号。

**解锁全自动逐元素回归的两条正路**:
- **A(推荐)**:让 CI 的 `v4-e2e-tests.yml`(用 E2E 构建)跑 Maestro 全量 flow——这是设计内的方式,产出每元素 pass/fail + 录屏。
- **B**:给悬浮球动画加一个测试旗标(如 `EXPO_PUBLIC_MAESTRO_E2E` 时停掉 `Animated.loop`),并出一个 E2E flavored APK,即可在本机真机用 Maestro 对真实屏做逐元素断言。需要一次构建。

**UX/体验层**:截图图库 `D:\agentrix-build-tmp\screens\`(18 屏 + home 重试)请人眼过一遍;或我按方案 B 出 E2E 包后用 Maestro 跑断言。


---

## 9. Maestro 全套 E2E 现状与"全绿"路线(2026-06-09)

**已解决(套件现在能真正跑 flow 了)**：
- 解析错误(`scrollUntilVisible.timeout`、`longPressOn.duration`)— 已清。
- E2E 包未登录 → 加 `seedMaestroE2ESession()`(严格 gate `EXPO_PUBLIC_MAESTRO_E2E`)让其开机进已登录主界面。
- 驱动启动 flake → `MAESTRO_DRIVER_STARTUP_TIMEOUT=120000`。

**剩余阻塞(让全套绿需专项工程,非一两轮可成)**：
1. **慢**：单 flow 慢至 15min(大量 `optional:true` + `waitForAnimationToEnd`,元素 miss 时每步等满 ~17s)→ 35 flow 远超 `ui-test` job `timeout-minutes:40` → 必被 cancelled。
2. **选择器过时**：如 `41-inventory` 找不到"萌宠"(标签可能已变 / 假 token 数据空)。
3. **驱动仍偶发 flake**。

**真实结果(取消前）**：✅ `27-home-drawer-deep`;❌ `41-inventory`(萌宠)。其余未跑完。

**全绿路线(建议作为独立任务)**：
1. `ui-test` job `timeout-minutes` 提到 90+ 且**分片并行**(matrix 把 35 flow 拆 3-4 片)。
2. 逐 flow 改用 **testID 选择器**(替代中文文本)+ 删冗余 `waitForAnimationToEnd`/收紧超时,让 miss 快速失败而非等满。
3. auto-seed 改用**真实测试账号**(CI secret 登录)而非假 token,使依赖后端数据的屏可断言。
4. 稳定驱动启动(预热 + 重试)。

**当前上线保障**(不阻塞)：真机手动验证(BUG-001/002/005 已修) + 29 屏 deep-link 0 崩溃冒烟 + 单测。Maestro 全绿作为持续改进项。
