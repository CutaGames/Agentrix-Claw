# Desktop Pet Interaction Spec — Living Pet Window (P1-1)

> 状态：v1（2026-05-08，Pet Phase 6 P1）。本文将桌宠交互语义从代码注释提取
> 为正式契约，三方（PRD ↔ 实现 ↔ E2E）必须保持一致。变更需同时改三处。

## 1. 交互快查

| 输入                   | 桌宠当前形态  | 行为                                                | 实现位置 |
|------------------------|---------------|-----------------------------------------------------|---------|
| 单击（&lt; 220ms 内只 1 次）   | 主窗体        | 触发语音输入（push-to-listen 短指令）+ `interaction='tap'` | `PetCompanionWindow.tsx` `dispatchVoice()` |
| 单击                   | dock 小球     | 还原主窗体到上次位置                                | `desktop_pet_window_restore()` Tauri cmd |
| 双击（&le; 220ms 内 2 次）     | 主窗体        | 打开聊天面板                                        | `PetCompanionWindow.tsx` `openChatPanel()` |
| 长按（&ge; 350ms，无拖动）     | 主窗体 / dock | 进入按住即说（push-to-talk）模式，松手停止          | `agentrix:voice-start` / `voice-stop` 事件 |
| 拖动（位移 &ge; 8 px）         | 主窗体        | 跟随光标移动；位移 &ge; 64 px 进入"吸附预览"          | drag handler in `PetCompanionWindow.tsx` |
| 拖动至屏幕边缘 64 px 内 | 主窗体        | 释放后吸附为 dock 小球（taskbar / 屏幕边）         | `dockToEdge()` |
| 右键 / 长按弹菜单      | 主窗体 / dock | 打开 context menu（灵魂、皮肤、休眠、隐藏、关闭）  | `PetContextMenu.tsx` |

## 2. 多显示器

- `monitor_index`：每个桌宠位置都带 `monitor_index: number`（来自 Tauri
  `Monitor::position` 顺序）。`move_ball_to_monitor(idx)` 切换屏幕时同步
  更新。截图（screenshot tool）也使用同字段定位窗口归属屏。
- 跨屏拖动：拖动跨过 `monitor.bounds` 边界时，`monitor_index` 立刻更新；
  释放时按目标屏 dock。
- 配置持久化：`monitor_index` + `position{x,y}` 写入 `pet_window_state`
  本地配置；下次启动时按上次值还原。如果该 `monitor_index` 已不存在
  （拔显示器），fallback 到 `0`（主屏）并重新落点到屏幕中下区域。

## 3. 窗口移动 easing

- 用户主动拖动：1:1 跟随，无 easing。
- 程序触发的位置调整（dock / 还原 / 跨屏）：使用 `cubic-bezier(0.22, 1, 0.36, 1)`，
  时长 220ms。dock → 主窗体的还原使用 280ms 同曲线避免突兀。
- 吸附预览（拖动到边缘 64 px 时显示半透明轮廓）：fade-in 120ms，松手后
  位置由 easing 接管。

## 4. 与陪伴气泡的优先级

- `presence:pet.proactive` 弹出时，用户的下一次单击/双击仍按本表执行；
  气泡的 ACK / Dismiss / CTA 按钮**不**消费桌宠点击事件。
- 长按状态下不渲染新气泡，避免误吞 push-to-talk。

## 5. 测试断言（E2E 必含）

- click → `dispatchVoice` 调用次数 +1；double-click → `openChatPanel` +1，
  且不重复触发 `dispatchVoice`。
- mouseDown 350ms+ → `voice-start` 事件触发；mouseUp → `voice-stop`。
- drag &ge; 64 px to right edge → 触发 `dockToEdge('right')`。
- dock 小球 click → `desktop_pet_window_restore` Tauri cmd 调用 1 次。
- 拔显示器后启动：`monitor_index` 自动 fallback 到 0。

## 6. 变更流程

修改桌宠交互需同时更新：

1. 本文件（spec）。
2. `desktop/src/components/PetCompanionWindow.tsx` 实现。
3. `desktop/src/test/pet-interaction.e2e.ts`（或 Playwright 等价 E2E）的
   断言。

如果只改其一，CI 应在 `desktop-spec-drift-check` step 失败。
