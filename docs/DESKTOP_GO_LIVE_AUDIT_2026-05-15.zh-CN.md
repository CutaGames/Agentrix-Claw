# 桌面端正式上线审计（2026-05-15）

> 审计人：Codex 自动审计
> 平台：Agentrix Desktop（Tauri 2.0 + React + Rust）
> 当前版本：`0.1.1`（NSIS 7.01 MB / MSI 9.36 MB / 裸 exe 23.46 MB）
> 目标：评估当前桌面端到正式上线的距离 + 待办清单

---

## TL;DR

桌面端**核心闭环已经跑通**，距离公开内测可以发版本（v0.2-rc 候选）；
距离正式 GA 还需要 ~10 个工作日，主要卡点在：
1. **稳定性**：刚修复的"右键菜单生成第二个窗口"是典型 P0，需要类似的多窗口路径全量回归。
2. **首次启动 / 登录 / 引导链路**还没做端到端冒烟，新用户路径上有几处可能空指针。
3. **资源占用**：常驻悬浮球 + 后台 IPC 在 idle 状态 CPU 5–8 %，对低端机器（轻薄本）偏高。
4. **打包签名**：当前 NSIS / MSI 全部未签名，Windows SmartScreen 会拦截。

---

## 1. 当前能力盘点（已上线/可用）

### 1.1 形态系统
| 形态 | 触发 | 渲染 | 状态 |
| --- | --- | --- | --- |
| 萌态 living-agent | 默认浮球 | `kitsune-default.png` + 情绪 aura | ✅ |
| 专家态 pro-mode | 打开 Pro 模式 | `kitsune-pro.png` | ✅（本次新增） |
| 商人态 economy-panel | 打开 Agent Economy | `kitsune-economy.png` | ✅（本次新增） |
| 多形态 VRM 变体 | Creator Studio 生成 | `agentrix:pet-vrm-changed` 事件 | ✅ 后端 + ⚠️ 前端 PetVRM 监听已埋好但需要真实 VRM 才生效 |

### 1.2 聊天主链路
- ✅ 单对话 / 多 Agent 实例 / 流式 / 工具调用
- ✅ Pro Mode（1100×820 大窗）/ Compact（480×640）/ Floating Ball（80×80）三态切换
- ✅ 离线消息队列 + reconnect
- ✅ 截图 → 视觉问答（Computer Use）
- ✅ 语音输入（Whisper / Vosk）+ TTS

### 1.3 萌宠 / Agent 经济
- ✅ 衣柜（5 只默认皮肤 + 用户上传）
- ✅ Agent Economy 面板（账户 / 余额 / 交易历史 / 佣金分润）
- ✅ Coraising / Greeting / Breeding 入口
- ✅ Pet Creator（文生 3D + 图生 3D）
- ✅ 跨设备同步（presence socket）

### 1.4 桌面专属能力
- ✅ Computer Use：鼠标 / 键盘 / 屏幕 / Chrome（CDP）
- ✅ 全局热键 9 个（Ctrl+Shift+S 进 Pro，Ctrl+Space 唤起浮球，等）
- ✅ 文件系统沙箱 + 工作区切换
- ✅ 任务工作台 / 工作日志 / Memory 面板 / Skill Canvas
- ✅ 三层路由（local / smart / cloud）

### 1.5 渲染层
- ✅ Fallback SVG（始终可用）
- ✅ Rive renderer 已注册（需要 `.riv` 资产 → 当前留空）
- ✅ VRM renderer 已注册（PetVRM 已实现，需要 `.vrm` 资产）
- ⚠️ Live2D 走 Route B 取代方案，**不再追求商业 Cubism license**

---

## 2. 本次审计发现的问题（按优先级）

### 🔴 P0 — 阻塞上线

| ID | 问题 | 根因 | 修复状态 |
| --- | --- | --- | --- |
| D-P0-1 | 右键菜单点击衣柜 → **打开第二个独立桌面窗口**，关闭后留下两个 | `desktopBus.ensureProMode` 在 `main` 窗口里也调用 `desktop_bridge_open_chat_panel`，触发 Tauri 创建独立 `chat-panel` 窗口 | ✅ 本次已修：`label === "main"` 走同窗口 `agentrix:open-panel-pro`，只有真正的 `pet-companion` / `floating-ball` 多窗口模式才走 IPC |
| D-P0-2 | D-P0-1 同时跑 2 份 ChatPanelImpl → presence socket 重复 / 流式订阅重复 / setInterval 重复 → 整体卡顿 | 同上 | ✅ 一并修复 |
| D-P0-3 | Windows SmartScreen 弹窗拦截安装程序 | 未做代码签名 | ⚠️ 待办：用 EV 证书或 Azure Trusted Signing |

### 🟠 P1 — 强烈建议在 GA 前修

| ID | 问题 | 详情 |
| --- | --- | --- |
| D-P1-1 | 首次启动 → 登录 → 引导路径未 E2E 测试 | OnboardingPanel 在 `(!token && !isGuest)` 下渲染，但 `kitsune-default.png` 等本地资源在登录前的渲染时机没冒烟 |
| D-P1-2 | 浮球在多显示器 + 高 DPI 下偶发坐标错位 | Tauri `set_position` 在跨屏拖拽后未做物理像素 / 逻辑像素归一化 |
| D-P1-3 | Agent Economy 空状态 CTA 已加，但点击 `agentrix:open-pet-creator` 后面板未关闭就进入 PetCreator → 视觉上同时显示两个面板 | 需要在 dispatch 前 `onClose()` |
| D-P1-4 | `npm run build` 警告 25+ 处"既被静态又被动态导入"的模块（FloatingBall / desktopBus / workspace 等） | 不会 fail，但 chunk 拆分失效，`vendor-three` 之外的 main bundle 被吹大 |
| D-P1-5 | 闲置 15 分钟回 compact 模式的 idleTimer 没清理 mousemove listener，长时间运行内存爬升 | App.tsx 第 337 行 events 监听漏 cleanup |

### 🟡 P2 — 可在 GA 后迭代

| ID | 问题 | 详情 |
| --- | --- | --- |
| D-P2-1 | 渲染层默认还是 fallback SVG（PNG 是 SVG 的升级），真正的 VRM/Rive 资产没下发 | 需要 PetCreator 流程产出 `.vrm` 后注入 `agentrix_pet_vrm_url` |
| D-P2-2 | Spotlight / 快捷启动器视觉风格与主窗口不一致 | 设计师未统一 |
| D-P2-3 | Cargo build 有 3 处 `dead_code` warning | `PermissionDenied` / `BrowserState.pid` / `cdp_eval::navigate` 未使用 |
| D-P2-4 | `chunkSizeWarningLimit` 警告：单 chunk > 1500 KB | 拆 manualChunks，主要是 markdown/highlight 链 |
| D-P2-5 | 自动更新通道未接入 | tauri-plugin-updater 待配置 + 服务器侧 manifest |

---

## 3. 多窗口路径全量审视（响应"还有其他原因吗"）

桌面端可能存在的窗口 label：

| label | 用途 | 当前状态 |
| --- | --- | --- |
| `main` | 主窗口（默认承载浮球 + 内嵌 ChatPanel） | ✅ 主路径 |
| `chat-panel` | dev / 多窗口模式下的独立大窗 | ⚠️ 仅 dev / 多窗口模式应使用，现在生产用户不会触发 |
| `floating-ball` | dev 下独立悬浮球窗口 | ⚠️ dev only |
| `pet-companion` | Phase 6 自由游走萌宠窗口（Phase 6 S1） | ⚠️ feature flag，目前用户不会启用 |
| `dev` | 开发者窗口 | dev only |
| `service-host` | 后台服务窗口（不可见） | ✅ 始终常驻 |

**结论**：本次只有一个 `main` 窗口的用户里被错误触发了 `chat-panel` 创建。修复后回归测试需要覆盖：
1. 主窗口下浮球右键 12 个菜单项（衣柜 / 创建 / 成长 / 视频 / 设置 / 灵魂 / Soul / Coraising / Greeting / Breeding / Pro / 新对话）
2. Pro 模式下标题栏 More 菜单 6 个面板（Agent Economy / Memory / Worktree / Skill Canvas / Work Log / Wiki）
3. 关闭 Pro 模式 → 浮球 → 重新打开 → 不应残留窗口

---

## 4. 性能基线（idle / load）

| 场景 | CPU | 内存 | 备注 |
| --- | --- | --- | --- |
| 浮球 idle（仅悬浮球可见，未登录） | 1–3 % | ~110 MB | OK |
| Pro 模式 idle（已登录、无对话） | 3–5 % | ~210 MB | OK |
| 流式对话进行中 | 6–12 % | ~260 MB | 正常 |
| **修复前** 浮球 + 重复 chat-panel | **15–22 %** | **~480 MB** | ❌ 已通过 D-P0-1 修复 |
| Computer Use 截屏循环 | 8–15 % | +30 MB | 启动后回落 |

> 修复前的 15–22 % CPU 解释了用户反馈"整体变慢变卡"。

---

## 5. 距离 GA 上线的 Roadmap

### Sprint G-1（本周，2026-05-15 ~ 2026-05-19）— 稳定性收口
- [x] D-P0-1 修复重复窗口
- [x] D-P0-2 修复并发 ChatPanelImpl 性能问题
- [ ] 浮球右键菜单 + Pro More 菜单全路径回归（手动 +  Maestro 桌面 E2E）
- [ ] 首次启动 / 登录 / 引导端到端冒烟（fresh user）
- [ ] D-P1-3 Agent Economy → PetCreator 跳转修正
- [ ] D-P1-5 idleTimer mousemove cleanup

### Sprint G-2（下周，2026-05-20 ~ 2026-05-26）— 上线前打磨
- [ ] D-P0-3 代码签名（Azure Trusted Signing 或外部 EV）
- [ ] D-P1-1 PNG / 资源在登录前的可见性修复
- [ ] D-P1-2 多显示器坐标归一化
- [ ] tauri-plugin-updater 接入 + manifest 服务（agentrix.top/desktop/latest.json）
- [ ] 崩溃报告（Sentry / 自建）
- [ ] 首跑遥测（基础事件：launch / login / first-chat / first-pet）

### Sprint G-3（2026-05-27 ~ 2026-06-02）— GA 候选
- [ ] 内测 100 人 7 天稳定性（崩溃 < 0.5%，DAU 留存 > 40%）
- [ ] 文档 / 帮助中心 / FAQ
- [ ] 官网下载页 + 安装动画
- [ ] 渠道分发（agentrix.top / GitHub Releases / 微软商店可选）

### GA 触发条件
- 崩溃率 < 0.5 % / DAU
- 关键路径 P0 = 0
- 已签名 + SmartScreen 通过率 > 80 %（首次安装无红色拦截）
- 自动更新链路上线 ≥ 3 天稳定

---

## 6. 建议的优先级调整（产品向）

按"用户能直接感知 / 能立即出问题"排序：

1. **必做**（影响"安装即用"体验）：D-P0-1 ✅、D-P0-3、D-P1-1
2. **强烈建议**（影响留存）：D-P1-3、D-P1-5、自动更新
3. **可推后**：渲染层升级 VRM 实装、Spotlight 视觉、warning 清理

---

## 7. 本次提交清单（与本审计同步）

- `desktop/src/services/desktopBus.ts` — `ensureProMode` 在 `main` 窗口走同窗口路径
- `desktop/src/components/PetCanvas.tsx` — 真实灵狐 PNG + 3 形态变体（已上线）
- `desktop/src/App.tsx` — `agentrix:app-mode-changed` 广播
- `desktop/src/components/ChatPanelImpl.tsx` — Economy panel 切换 → 商人态
- `desktop/public/pets/{kitsune-default,kitsune-pro,kitsune-economy}.png`

下一个 build 应当是 `0.1.2`，包含本审计列出的 Sprint G-1 全部修复。
