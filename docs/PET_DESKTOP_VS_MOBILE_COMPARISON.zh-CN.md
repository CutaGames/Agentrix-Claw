# 桌面端 vs 移动端 萌宠功能对照表

> 2026-05-22 — Sprint P-8 之后的真实状态
> 用于回答"移动端萌宠和桌面端萌宠功能形态等的区别"

## TL;DR

桌面端是**全功能宠物伴侣**(13 形态 + 双击进 Pro Mode + Computer Use 跟光标 + 右键菜单 16 项 + always-on-top + 跨 webview 同步)。
移动端是**精简浮球**(12 形态 sprite + 长按语音 + 拖拽定位 + 漫游浮球),**不做** Pro Mode / Computer Use / 漫游漫画 / 系统级 always-on / 16 项菜单。

| 维度 | 桌面端 (Tauri 2.0) | 移动端 (RN Expo) |
|---|---|---|
| **窗口形态** | 200×240 跟随小窗口(`pet_window.rs`) | 48×48 屏内浮球(`GlobalFloatingBall.tsx`) |
| **always-on-top** | ✅ 系统级,跨 app 可见 | ❌ 仅 App 内可见,App 退到后台浮球消失 |
| **可移动** | ✅ 拖动(Rust `set_position`) | ✅ 拖动(PanResponder, 仅 App 内坐标系) |
| **吸边贴靠** | ✅ taskbar-corner snap-hide | ✅ 屏幕边缘吸附 + 半隐藏 |
| **形态总数** | **13**(idle / walk / sleep / sit / jump / eat / listen / talk / pro-thinking / pro-typing / pro-done / cu-mouse / alert) | **12**(去掉 `cu-mouse`,因为移动端没 Computer Use) |
| **桌宠心情同步** | ✅ Tauri Emitter 跨 webview | ✅ socket.io `presence:pet.state` |
| **右键 / 长按菜单** | 16 项菜单(语音 / 待审批 / 喂食 / 衣柜 / 灵魂 / 视频工作室 / 设置 / 睡眠 / 隐藏 / 关闭等) | ❌ 无菜单(长按 = 进语音模式) |
| **左键单击** | 进入语音聆听 | 单击 = 弹出语音 capsule + 跳到 AgentChat |
| **左键双击** | 弹出 1100×820 Pro Mode 工作台 | ❌ 无 Pro Mode |
| **Pro Mode** | ✅ 全功能 chat panel + tools / files / approval flow | ❌ Mobile 无 Pro Mode,移动端 Chat 在 AgentChatScreen |
| **唤醒词** | ✅ Picovoice Porcupine,常驻监听 | ✅ Porcupine + 系统语音(Android 后台监听需要权限) |
| **Computer Use 跟光标** | ✅ 桌宠跟着鼠标移动,`cu-mouse` sprite | ❌ 移动端无 CU(系统级权限不允许) |
| **流式回复 → talk** | ✅ `agentrix:llm-stream-typing` 派发 | ✅ AgentChatScreen 流式 → setPetMode('speaking') |
| **AXP 涨级 → done** | ✅ 庆祝 sprite + 散落动画 | ✅ `celebratePet('axp-level-up')` |
| **审批 modal → alert** | ✅ 桌宠跑到 modal 旁,alert sprite | ✅ DeviceEventEmitter 接 `presence:approval:wrist-trigger` → alert 4 秒 |
| **GPU keep-alive 防雪花** | ✅ 1px hidden element 60ms RAF | N/A(无透明窗口) |
| **flying transition** | ✅ Pro Mode 打开时桌宠飞进标题栏 | ❌ 不需要(没 Pro Mode) |
| **tray icon 跟随 mode** | ✅ 13 形态 PNG → 系统托盘动态切换 | ❌ 移动端没 tray |
| **Wardrobe / 装扮 / 节日** | ✅ `petVariant` 8 层 fallback chain + UI 选择器 | ⚠️ 有 sprite 渲染器但没 wardrobe UI(可后续补) |
| **多氏族 sprite (clan-A/B/C)** | ✅ 架构就绪,等美术资产 | ✅ 架构同上 |
| **挂载位置** | 独立 Tauri 窗口 `pet-companion` webview | HomeScreen 内 `<View style={absoluteFillObject} pointerEvents="box-none">` 覆盖层 |
| **可见范围** | 整个桌面任何 app | 仅 Home tab(P-8 v0.4.7 起;后续会扩展到 Plaza/Summon/Me) |

## 形态触发来源对比

### 桌面端 13 形态全开

```
PetMode 总线(`desktop/src/services/petMode.ts`)
   ├ ballState 改变 → 改 mode
   ├ 跨 webview 广播(`desktop_pet_broadcast_mode` Tauri 命令)
   ├ Tray icon 同步切换(`desktop_pet_set_tray_mode`)
   └ 桌宠 + Pro Mode 标题栏 PetAvatar + 系统托盘三处同步
```

### 移动端 12 形态(去 cu-mouse)

```
PetMode 总线(`src/services/petMode.ts`)
   ├ Set listeners(纯 JS,无跨 webview)
   ├ thinking/typing → 降级为 talk(没 Pro Mode UI)
   ├ computer-use → 自动转 idle(没 CU)
   └ 仅 GlobalFloatingBall 一处订阅
```

## 为什么"移动端长得不如桌面端丰富"

是设计上的取舍,不是 bug:

1. **Pro Mode = 桌面端独占**。移动屏幕容不下 1100×820 工作台,且移动场景偏轻量交互。
2. **Computer Use = 桌面端独占**。iOS / Android 沙箱严格,系统不允许 app 模拟鼠标点击。
3. **always-on 跨 app = 桌面端独占**。Android `SYSTEM_ALERT_WINDOW` 权限申请审核很严,iOS 完全不可能。
4. **wander 漫游引擎 = 桌面端独占**。移动屏太小,浮球漫游会持续遮挡内容,体验差。

## 移动端 P-8 v0.4.7 当前状态

- ✅ Sprite 真实渲染(12 形态,动画帧动起来)
- ✅ ballState ↔ petMode bus 双向同步
- ✅ 后端 `presence:pet.state` emotion → mode
- ✅ 长按浮球进语音
- ✅ 单击浮球 → 跳 AgentChat + 触发语音
- ✅ 拖拽到屏幕边缘吸附半隐藏
- ⚠️ **当前只在 Home tab 渲染**(P-8 v0.4.6 hotfix 临时方案,避免 navigation context 崩溃)
- ⚠️ **暂未实现 wardrobe UI 移动端**(变体仍可用 `setPetVariant({...})` 编程控制,UI 等下一轮)

## 后续 mobile P-9 计划

| 项 | 优先级 |
|---|---|
| 把浮球扩展到 Plaza / Summon / Me 4 个 tab(在每个 root screen 重复 mount) | P0 |
| 移动端 Wardrobe UI(类似桌面端 `WardrobeVariantPanel`) | P2 |
| 移动端长按打开**简化版菜单**(不是完整 16 项,精选 5-6 项) | P2 |
| AXP 涨级 / 审批 push 触发 sprite 庆祝 | P1 |
| Maestro E2E 真机验证 sprite 拖拽 + 单击 + 长按全部可用 | P1 |
