# Agentrix 桌宠形态系统设计 v5（产品 RFC）

> **版本**：v5
> **日期**：2026-05-21
> **状态**：Draft（Sprint P-1 实施中）
> **关联代码**：`desktop/src-tauri/src/pet_window.rs`、`desktop/src/components/PetCompanionWindow.tsx`、（新增）`desktop/src/components/PetAvatar.tsx`
> **关联 sprite brief**：[`docs/business/PET_SPRITE_DOUBAO_BRIEF_v2.zh-CN.md`](./business/PET_SPRITE_DOUBAO_BRIEF_v2.zh-CN.md)

## 1. 一句话总命题

> **桌宠不是装饰，是 Agentrix AI 的可视化人格**。它在用户做不同事情时形态会切换，让用户感觉「灵狐在陪我工作」，而不是「桌面上有个会动的图标」。

## 2. 为什么重新设计

### v4 现状问题

桌面端同时存在三处灵狐渲染，用户认知混乱：

1. **桌宠**（`pet-companion` window）：全屏 transparent overlay，sprite 漫游
2. **悬浮球**（`main` 窗口折叠态 80×80）：渲染 `PetFloatingBall`（VRM / PNG）
3. **Pro Mode 标题栏头像**（`ChatPanel` 内）：又渲染了一次 `<FloatingBall />`

加上桌宠还有出界 / 黑洞 / 吞点击的 bug，整体观感是"桌面上飘了三只外观相似但行为不一的灵狐，还都不太能用"。

### v5 取舍

**业界对照**（2026-05 调研）：

| 产品 | 形态切换 | 工作台融合 | Computer Use 视觉化 |
|---|---|---|---|
| OpenAI Codex Pet | ✅ idle/thinking/done | ❌ 不融合 IDE | ❌ |
| Verdent Companion | ✅ 5 表情 | ❌ | ❌ |
| Steam AI Desktop Pet | ✅ Live2D/VRM/Spine | ❌ | ❌ |
| Dokk75 VRM Pet | ✅ VRM 表情 | ❌ | ❌ |
| **Agentrix v5** | ✅ 8 形态 | ✅ ChatPanel 头像 | ✅ **业界首家** |

Anthropic Claude Computer Use、OpenAI Operator、Google Mariner 都没有"角色化身"，操作过程是抽象的指针轨迹。Agentrix 把它变成"灵狐在帮你做事"——这是认知锚点级别的差异。

## 3. 形态系统（8 种）

```
┌────────────────────────────────────────────────────────────────┐
│ Mode 1  Idle Companion       桌面漫游、stretch、blink、jump     │
│ Mode 2  Listening            听用户说话，耳朵竖起 + 声波光环    │
│ Mode 3  Speaking             AI TTS / 流式回复，嘴巴开合 + 气泡 │
│ Mode 4  Pro Mode (working)   ChatPanel 标题栏头像，思考 / 打字  │
│ Mode 5  Sleep                趴下 + 💤                          │
│ Mode 6  Wardrobe             商人态 / 衣柜预览                  │
│ Mode 7  Computer Use         跟随光标 + 握鼠标动画 ★Agentrix 独家│
│ Mode 8  Approval             跑到 modal 旁警觉 + ⚠️             │
└────────────────────────────────────────────────────────────────┘
```

### Sprite 映射

| Mode | sprite | 帧数 | 行为 |
|---|---|---|---|
| Idle Companion | `walk.png` / `idle.png` / `sit.png` | 6/4/1 | 漫游 + Bezier 路径 |
| Listening | `listen.png` ★ | 4 | 停止漫游，凑近鼠标，头顶声波光环 |
| Speaking | `talk.png` ★ | 6 | 停在视线区，头顶气泡显示文字 |
| Pro Mode（思考） | `pro-thinking.png` ★ | 4 | 飞进 ChatPanel 标题栏，64×64 |
| Pro Mode（打字） | `pro-typing.png` ★ | 4 | 同上 |
| Pro Mode（完成） | `pro-done.png` ★ | 4 单次 | 同上，单次播放后接 idle |
| Sleep | `sleep.png` | 2 | 趴在屏幕角落 |
| Wardrobe | `idle.png` | 4 | 在 Wardrobe Panel 内站位 |
| Computer Use | `cu-mouse.png` ★ | 4 | 跟随光标，always-on-top |
| Approval | `alert.png` ★ | 2 | 跑到 modal 旁，头顶 ⚠️ |

★ = v2 新增 sprite，详见 brief。

## 4. 窗口架构（v5）

```
Tauri Desktop 窗口架构
├─ Window A: pet-companion（全屏 transparent overlay）
│   - 单例，永远存在（用户除非显式关闭）
│   - 承载 Mode 1, 2, 3, 5, 7, 8（"在桌面上"的所有形态）
│   - Sprite 渲染：PetSpriteCanvas
│
├─ Window B: main（Pro Mode 工作台 ChatPanel）
│   - 默认 hidden
│   - 大小固定 1100×820（不再有"折叠态"）
│   - 标题栏左上角嵌入 <PetAvatar mode="pro-thinking" /> (64×64)
│   - 承载 Mode 4, 6（"在工作台里"的形态）
│
└─ 触发关系
   - 双击桌宠 / Ctrl+Shift+S → main.show()
   - 关闭 main → main.hide()（保留 React state）
   - 桌宠和 PetAvatar 通过 Tauri event 同步 mode
```

**关键变化**：

- ❌ 删除 main 窗口 80×80 折叠态（`PetFloatingBall` 路径）
- ❌ 删除 ChatPanel 标题栏的旧 `<FloatingBall />`
- ✅ 新增 `<PetAvatar />` 组件，按 mode 渲染对应 sprite
- ✅ Ctrl+Shift+S 改为 main.show / hide

## 5. 状态机（前端）

```typescript
export type PetMode =
  | "idle"          // 漫游 / 站立 / 睡觉空闲
  | "listening"     // 唤醒词 / 长按
  | "speaking"      // AI 回复中
  | "thinking"      // Pro Mode AI 思考
  | "typing"        // Pro Mode AI 写代码
  | "done"          // 任务完成（单次）
  | "sleep"         // 长时间无操作
  | "wardrobe"      // 衣柜 / 灵魂选择
  | "computer-use"  // Computer Use 操作中
  | "approval";     // 求批准

// 触发源
window event "agentrix:pet-mode" { mode: PetMode }
```

各 mode 切换由不同事件触发：

| 触发事件 | 期望切换到 |
|---|---|
| `agentrix:voice-start` | listening |
| `agentrix:voice-end` | idle |
| `agentrix:llm-stream-start` | speaking 或 thinking（看是否 Pro Mode） |
| `agentrix:llm-stream-end` | done → idle |
| `agentrix:pro-mode-opened` | thinking（默认） |
| `agentrix:pro-mode-closed` | idle |
| `agentrix:cu-active` | computer-use |
| `agentrix:approval-active` | approval |
| 10 min 无 input | sleep |

## 6. Sprint 切分

### Sprint P-1：架构整合 + 修 bug ✅ shipped 2026-05-21

- [x] 修桌宠 4 个 bug（出界 / 黑洞 / 吞点击 / loadError 占位）
- [x] 关掉 main 窗口的"折叠态悬浮球"，main 改成"Pro Mode 显示 / 隐藏"
- [x] ChatPanel 标题栏 `<FloatingBall />` 替换为 `<PetAvatar />`（先用 idle 占位）
- [x] 桌宠右键菜单补齐：语音、剪贴板、approval inbox 入口
- [x] Ctrl+Shift+S 重定向为 main.show()
- [x] PetVRM `loadError` 改静默 fallback（不再显示黑色圆形）
- [x] 默认不 seed 21.4MB GLB（除非用户硬件 ≥ vrm-high）

**笔记**：`memories/repo/pet-sprint-p-1-shipped-2026-05-21.md`

### Sprint P-2：形态状态机 ✅ shipped 2026-05-21

- [x] 引入 `PetMode` 类型与全局事件 `agentrix:pet-mode`
  （`desktop/src/services/petMode.ts`）
- [x] PetSpriteCanvas 扩展 `PetAction` 联合类型 + 新 7 个 sprite specs
- [x] PetCompanionWindow 接 mode → sprite 路由（mode 优先于 local state）
- [x] PetAvatar 接 mode → sprite 路由 + AVATAR_OVERRIDES 处理小尺寸不可读
- [x] `bootPetModeBus()` 把现有的 `agentrix:voice-*` / `agentrix:llm-stream-*`
  / `agentrix:cu-active` / `agentrix:approval-active` 事件路由到 mode 总线
- [x] 接入语音触发源（PetCompanionWindow 长按 / 右键菜单 / 全局快捷键）
- [x] 接入 Pro Mode 流式触发源（useStreamingTurn 派发 stream-start / end）
- [x] 接入 Computer Use 触发源（desktopAgentSync wrapper 派发 cu-active）
- [x] 接入 approval 触发源（已有 `agentrix:approval-active` 事件）
- [x] 9 个新单测锁定 mode 总线契约

**笔记**：`memories/repo/pet-sprint-p-2-p-3-shipped-2026-05-21.md`

### Sprint P-3：sprite 资源 + 视觉打磨 ✅ shipped 2026-05-21

- [x] v2 7 个新 sprite 接入（`reprocess-v10-forms.mjs` ETL 流水线）
- [x] 13/13 sprite 全部 RGBA Format32bppArgb，55–72% 透明像素健康范围
- [x] PetCompanionWindow lean-in 行为：进入 listening / speaking 时桌宠
  通过 PathPlayer 平滑滑向光标附近（offset +40, +60）
- [x] PetCompanionWindow Computer Use 跟随：cu-mouse 模式下桌宠跟着光标
  以 `cursor + (32, 24)` 偏移移动（不挡住点击目标）
- [x] PetAvatar 180ms opacity transition + key-driven canvas remount

### Sprint P-4：可选后续 ✅ shipped 2026-05-21

- [x] **typing 触发器**：`useStreamingTurn` 在 chunk 累积 ≥ 500 字符时派发
  `agentrix:llm-stream-typing`,长代码输出走 pro-typing
- [x] **跨窗口 PetMode 同步**:`desktop_pet_broadcast_mode` Tauri 命令 +
  `Emitter::emit("agentrix:pet-mode-broadcast", ...)`,3 个 webview 全部
  自动同步形态,wake-word 在 main 触发后桌宠也立即切到 listen sprite
- [x] **自动 sleep + 单击唤醒**:10 min 无操作进 sleep,单击 sleep 状态
  桌宠优先唤醒(不再触发语音)
- [x] **不需要 mobile mirror**(桌面端独立产品)

### Sprint P-5:Light 主题修复 + 启动空窗口修复 ✅ shipped 2026-05-22

**Round 1 (v0.3.7)** — 菜单污染修复 + 启动空白窗口修复 + light 主题第一波反相
**Round 2 (v0.3.8)** — light 主题第二波反相(SubscriptionBadge tier pills、TaskWorkbench、WorkspaceContext、outline 按钮、placeholder)
**Round 3 (v0.3.9)** — sky tint 0.10→0.18 提透明度、sky 文字强制 sky-900、action-bar 渐变 pill 反相、title-bar icon button 反相、`var(--text-dim)` 全局加深

- [x] **菜单污染修复**:v0.3.6 引入的 `[role="menu"] { background: white }`
  规则污染了桌宠右键菜单(白底白字)。`global.css` 加 `:not([data-pet-window="1"])`
  排除桌宠 webview,并加 `html[data-pet-window="1"] [role="menu"]` 兜底强制
  深色,任何主题下桌宠菜单永远是 `rgba(20,20,28,0.96)` 深底 + 白字
- [x] **启动空白窗口修复**:已 onboarded 用户启动时 main 窗口为空(panelOpen=false
  且没自动 hide),用户看到桌面中央一个空 1100×820 灰窗。`App.tsx` 加
  `autoOpenedRef` + auto-open Pro Mode useEffect:已 onboarded 用户启动后
  自动调 `openProPanel()` + `showMainWindow()`,首次出现就是完整工作台,
  不再有空窗口
- [x] **Light 主题第一波(v0.3.7)**:`global.css` 加 attribute selector
  全局覆盖 `rgba(15,23,42,*)`/`rgba(148,163,184,*)`/`rgba(255,255,255,0.0X)`/
  `#cbd5e1`/`#94a3b8` 等硬编码深色字面量
- [x] **Light 主题第二波(v0.3.8)**:补 SubscriptionBadge 6 档 tier pills
  (`rgba(156,163,175,*)` free / `rgba(96,165,250,*)` lite / `rgba(167,139,250,*)`
  plus / `rgba(244,114,182,*)` pro / `rgba(251,191,36,*)` elite / `rgba(249,115,22,*)`
  enterprise) + WorkspaceContext sky tint(`rgba(125,211,252,*)`) + outline 按钮
  border + placeholder 加深 + 标题栏图标按钮 hover affordance + TaskWorkbench
  MM/AA pills 字色加深
- [x] **Mobile mirror 规划**:`docs/PET_FORMS_MOBILE_MIRROR_PLAN_v6.zh-CN.md`
  完整 6 天工时拆分,11/13 形态适用,移除 cu-mouse

**笔记**:
- `memories/repo/pet-sprint-p-5-shipped-2026-05-22.md` (round 1)
- `memories/repo/pet-sprint-p-5-r2-shipped-2026-05-22.md` (round 2)

### Sprint P-6:Mobile Mirror ✅ shipped 2026-05-22

- [x] **Phase 6.1 基础架构** — `src/services/petMode.ts` 移动端总线 +
  `src/components/PetSpriteImage.tsx` RN sprite 渲染器(View overflow:hidden +
  Image translateX 帧切换) + 8 jest 测试
- [x] **Phase 6.2 GlobalFloatingBall 接形态** — 替换 "AX" 文字标记为 `PetSpriteImage`,
  capsule 模式 brand slot 也接,subscribe PetMode bus,cross-wire ballState ↔ petMode
- [x] **Phase 6.3 触发源接入** — AgentChatScreen 流式 → speaking / 完成 → done(ttl 1200);
  PetTapGameModal level-up → `celebratePet('axp-level-up', 1500)`
- [x] **Phase 6.4 后端 presence 联动** — `src/services/petModeAdapters.ts`:lazy-require
  RN/petPresence,登录后 `bootPetModeAdapters` 启动,`presence:pet.state` emotion
  → `mapEmotionToMode` → `setPetMode`;`DeviceEventEmitter.presence:approval:wrist-trigger`
  → `setPetMode('approval', ttl 4000)`
- [x] **Phase 6.5 测试 + 文档** — `.maestro/44-mobile-pet-forms.yaml` E2E
  (sprite testID 挂载断言 + 3 张截图);`docs/USER_MANUAL_MOBILE_PETS.zh-CN.md`
  中文用户手册;`src/services/__tests__/petModeAdapters.test.ts` 7 jest 测试
  (合计 15/15 通过)

**笔记**:
- `memories/repo/pet-sprint-p-6-phase-6.1-6.2-6.3-shipped-2026-05-22.md`(phases 6.1-6.3)
- `memories/repo/pet-sprint-p-5-r3-and-p-6-phase-6.4-6.5-shipped-2026-05-22.md`(phase 6.4-6.5 + P-5 r3)

### Sprint P-7+ (deferred):Post-launch polish

- [ ] **Tray 图标按 mode 切换**:需要为 13 形态做 PNG→ICO 转换
- [ ] **flying transition**:Pro Mode 打开时桌宠飞进标题栏的视觉过渡
- [ ] **Wardrobe-specific sprite**:目前共用 idle.png
- [ ] **节日装饰**:`listen-festival-spring.png` 等节庆变体
- [ ] **多氏族变体**:clan-A/B/C 各自的 sprite 集
- [ ] **Light 主题完整 audit**:每个组件 variabilize(替代当前的 attribute
  selector 反相)

## 7. 风险与权衡

| 风险 | 影响 | 缓解 |
|---|---|---|
| 唤醒词监听依赖 webview 生命周期 | 桌宠关闭后无法语音唤醒 | 短期接 pet-companion webview；长期 Rust 端 cpal 直接监听（脱离 webview） |
| 关掉 main 折叠态后用户找不到 Pro Mode 入口 | 首次使用易迷茫 | 桌宠 onboarding 时显示 1 次"双击我打开工作台"提示 |
| pet-companion always-on-top 抢焦点 | 全屏游戏 / 全屏视频时挡住内容 | 已有逻辑：approvalActive 时暂停 RAF；扩展加 fullscreen detection |
| 业界第一家做 CU 角色化，没有先例验证 | 用户接受度未知 | Sprint P-3 之前先内测，量化"宠物可见时用户对 CU 的信任度" |

## 8. 度量与验收

### Sprint P-1 验收

| Item | 期待 |
|---|---|
| 启动后桌面元素 | 只看到 1 只桌宠 + 任务栏图标，**不再有右下角悬浮球** |
| 双击桌宠 | 1100×820 Pro Mode 弹出，标题栏左上角是 `<PetAvatar />` 静态头像 |
| 关闭 Pro Mode | main 隐藏，桌宠恢复漫游 |
| Ctrl+Shift+S | main.show()（不论之前是否打开） |
| 桌宠 hitbox 点击 | 100% 响应，永不丢点 |
| 桌宠漫游边界 | DPI 1.0 / 1.25 / 1.5 都不出界 |
| Pet 黑洞现象 | 完全消失（loadError 静默 fallback） |
| 启动 main 内存 | 不再因 PetVRM 加载 21.4MB GLB 卡顿 |

### Sprint P-2 验收（后续）

| Item | 期待 |
|---|---|
| 长按桌宠 | 桌宠播 listen sprite + 头顶声波光环 |
| AI 流式回复 | 桌宠播 talk sprite + 头顶气泡 |
| 打开 Pro Mode | PetAvatar 切到 thinking sprite |
| Computer Use 启动 | 桌宠跟着光标移动 + cu-mouse sprite |
| 高风险 approval | 桌宠跑到 modal 旁 + alert sprite |

## 9. 历史足迹

- 2026-05-08 Phase 6 S1：引入 pet-companion 独立窗口（小尺寸方案）
- 2026-05-15 多次踩 WebView2 小透明窗口 snow bug
- 2026-05-20 转向 fullscreen overlay 架构（[笔记](../memories/repo/desktop-pet-fullscreen-overlay-2026-05-20.md)）
- 2026-05-21 v5：合并悬浮球 + 桌宠 + Pro Mode 头像（本文档）
