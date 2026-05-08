# Pet Phase 6 — 桌宠生态全面增强方案

> 制定日期：2026-05-08  
> 范围：桌面优先 + Web/Mobile 同步推进 + 后端模块 + E2E + .exe  
> 共 6 个 Sprint，每 Sprint 独立可发布。

## 背景

用户反馈：当前桌宠是固定圆球，不是真正的"活体桌宠"。已有 PRD 但未排期的项目：
1. 屏幕游荡桌宠窗口
2. 点击宠物说话
3. 拖到任务栏躲藏
4. 跨设备状态同步
5. 亲密度解锁的"被宠物提醒"
6. 宠物商店

竞品对标差距（Replika / Tamagotchi / Vtuber tools）：
- 缺少进化/成长可视化
- 缺少时光相册/记忆回放
- 缺少迷你游戏
- 缺少主动陪伴消息
- 缺少社交/繁育系统
- 缺少 AR 试穿

## 总体架构升级

```
当前：FloatingBall(52px) + PetRenderer (内嵌 PetVRM/PetRive/PetCanvas)
           ↓
目标：FloatingBall (chat tray) + PetCompanionWindow (160×200 独立桌宠窗口)
           ↓ 共用
       PetCompanionService (状态机、漫游、跨端同步)
           ↓ 后端
       pet-companion-engine + pet-achievement + pet-memory-album
       + pet-minigame + pet-breeding（新模块）
       + pet-soul-template (修 gating) + presence (扩 topic)
```

---

## Sprint S1 — Living Pet Window（核心 MVP）⭐ 本轮立刻开始

**目标**：固定圆球 → 真正在屏幕游荡的桌宠窗口；含点击说话、拖拽、任务栏吸附。

### S1.1 Tauri 独立窗口
- 新窗口 label `pet-companion`，size 160×200，`transparent: true`、`decorations: false`、`alwaysOnTop: true`、`skipTaskbar: true`、`resizable: false`
- 启动时由 floating-ball 升级而来；失败回退 ball
- Rust 命令：
  - `desktop_pet_window_open(monitor_index?: u32)`
  - `desktop_pet_window_close()`
  - `desktop_pet_window_move_to(x, y)`（带 ease 时长参数）
  - `desktop_pet_window_set_state(state: "idle"|"wander"|"sleep"|...)`
  - `desktop_pet_window_minimize_to_tray()` / `restore()`
- 文件：`desktop/src-tauri/src/pet_window.rs`（新）；`lib.rs` 注册 commands

### S1.2 漫游路径引擎
- 新组件 `desktop/src/components/PetCompanionWindow.tsx`
- 状态机：`idle` → `wander` → `idle` → `play` → `sleep`（按时间和情绪切换）
- 路径生成：屏幕等分网格，每次随机选一个临近点，Bezier 平滑插值，3~6 秒到达
- 边缘检测：`primaryMonitor()` 拿屏幕宽高，留 32 px 安全边距
- 跟随光标：状态 `follow` 时距光标 80 px，避免遮挡

### S1.3 拖拽 + 任务栏吸附
- 鼠标按下且移动 > 5 px → 进入 `dragging`，监听 `pointermove` 实时 `set_position`
- 松开时检测：若窗口 Y > screenHeight - 64 px → 吸附为缩略图
- 缩略图：24×24 in tray-corner，pulsing 微光呼吸
- 双击缩略图 → 还原（`restore`），恢复到松开前的位置

### S1.4 直接交互
- 单击宠物：触发 `agentrix:voice-activate` → 沿用 voice 流（与 Ctrl+Shift+V 一致）
- 双击：`open_chat_panel`
- 长按 ≥ 300 ms：进入 push-to-talk 模式
- 右键：菜单 = 选择灵魂 / 衣柜 / 主屏切换 / 进入睡眠 / 隐藏到托盘

### S1.5 验证
- TS / Cargo 编译通过
- 桌面 E2E 新场景：`pet.window.present`、`pet.click-target`、`pet.drag-snap`、`pet.right-click-menu`
- .exe 重建（NSIS）≤ 7.5 MB
- 手测剧本：开机 → 桌宠出现 → 漫游 → 拖到任务栏 → 双击恢复 → 单击说话 → 双击开 chat

### S1.6 关键文件
| 文件 | 动作 |
| --- | --- |
| `desktop/src-tauri/src/pet_window.rs` | 新 |
| `desktop/src-tauri/src/lib.rs` | 注册命令 + setup 时启动 pet 窗口 |
| `desktop/src-tauri/tauri.conf.json` | 加 `pet-companion` 窗口配置 |
| `desktop/src/components/PetCompanionWindow.tsx` | 新 |
| `desktop/src/services/petCompanion.ts` | 新（状态机 + 路径） |
| `desktop/src/App.tsx` | `windowLabel === "pet-companion"` 分支 |
| `desktop/src-tauri/examples/desktop_e2e.rs` | 加场景 |

---

## Sprint S2 — 主动陪伴 + 亲密度解锁

**目标**：宠物从"被动响应" → "主动找你"；亲密度等级解锁生活化功能。

### S2.1 主动消息引擎（后端）
- 新模块 `backend/src/modules/pet-companion-engine/`
  - `pet-companion-engine.service.ts` Cron 每 30 min 评估每个用户
  - 评估输入：`last_interaction_at`、`intimacy_level`、`current_emotion`、`pomodoro_active`、本地时间
  - 输出触发器：`miss_you / morning_greet / pomodoro_break / night_wind_down / intimacy_unlock_<N> / weekly_diary`
  - 通过 `agentrix:pet-proactive` WS 推送到 desktop/mobile/web
- 迁移：`pet_companion_event` 表（user_id, kind, payload, sent_at, dismissed_at, channel）
- 防爆量：每用户每 4 h ≤ 1 条；连续 dismiss 3 次 → 静音 24 h；用户可调上限 1~24 h

### S2.2 桌面端 UI
- `desktop/src/components/PetProactiveBubble.tsx` — 宠物头顶气泡 + 可选 TTS
- 点击气泡 → 展开 chat 携带宠物初始消息；点 X → `dismissed_at`
- 移动端 `src/components/PetProactiveToast.tsx`；Web 端 `frontend/components/pet/WebProactiveBubble.tsx`

### S2.3 亲密度解锁矩阵
- 新表 `pet_intimacy_unlock(level, feature_key, label_zh, label_en, description)`
- 等级 → 功能：

| Lv | feature_key | 描述 |
| --- | --- | --- |
| 1 | morning_greet | 早安问候 |
| 3 | pomodoro_buddy | 番茄钟陪练（25/5） |
| 5 | night_care | >23:00 提醒喝水睡觉 |
| 8 | birthday_remember | 生日记忆 + 主动祝福 |
| 12 | mood_detect | 多次负面输入 → 主动安抚 |
| 18 | anxiety_companion | 焦虑陪伴模式 |
| 25 | weekly_diary | 每周自动日记 |

### S2.4 验证
- `pet-companion-engine.service.spec.ts` 单测（mock 时间）≥ 80%
- E2E：模拟 24 h 跑过 → 应触发 morning_greet + pomodoro
- 部署后端到 47.130.176.148 + migration

---

## Sprint S3 — 跨端实时状态同步 + Rive runtime

**目标**：桌面摸宠物 → 5 秒内手机看到 emotion 变化；摆脱 stub。

### S3.1 Presence 主题扩展
- `shared/types/agentrix-presence.ts` 新增 / 确认：
  - `pet.state`（已有）、`pet.energy`、`pet.intimacy`、`pet.proactive`
- backend `presence.gateway.ts` 加广播 hook
- desktop / mobile / web 三端订阅同一 socket

### S3.2 真 Rive runtime
- 桌面：替换 stub `desktop/src/components/PetRive.tsx` 真跑 `@rive-app/canvas`
- 移动：`src/screens/pet/PetRiveCanvas.tsx`（react-native-rive）
- web：`frontend/components/pet/WebPetRive.tsx`
- 资源走 CDN: `https://cdn.agentrix.top/pets/rive/<id>.riv`

### S3.3 E2E
- `tests/e2e/pet-cross-device.spec.ts`：起 desktop e2e + Playwright web，desktop 触 emotion change，web 5 s 内 PetState 更新
- 桌面 E2E 加 `pet.cross-device-sync`

---

## Sprint S4 — 商店 v2 + 成长可视化

**目标**：浏览/试穿/购买/上架闭环；用户能看到自己宠物长大。

### S4.1 商店 v2（三端统一）
- 后端 `marketplace-pet/skin.controller.ts` 增 `GET /skins/preview/:id`（返回 VRM URL + 试穿临时 token）
- 桌面 `WardrobePanel.tsx` 重做：左 Tab（VRM/GLB/Rive/套装）/ 中网格 + 筛选 / 右试穿大预览（PetVRM 渲染）/ 购买走 Stripe wallet
- web `frontend/pages/marketplace/skins/index.tsx`（修 404）
- 移动 `src/screens/pet/SkinMarketplaceScreen.tsx` 加 VRM 预览
- 上架：PetCreator 出来的 skin → "上架" 按钮 → 后端 review queue

### S4.2 成长可视化
- 新组件 `PetGrowthDashboard.tsx`（三端共用 props）
  - Lv 进度条
  - 成就徽章墙（25 个：第一次说话、第一次换装、第一次合体...，hover 提示要求）
  - 时光相册（按日期分组的 thumbnail，点击展开 chat 历史）
  - 进化形态预览（Lv 10/20/30/50 解锁，未解锁灰色）
- 后端：
  - `pet-achievement` 模块 + 表
  - `pet-memory-album` 模块 + 表（每条 memory 关联 thumbnail_url）

---

## Sprint S5 — 迷你游戏 + 社交繁育

**目标**：高频留存触达 + 社交破圈拉新。

### S5.1 迷你游戏框架
- `desktop/src/games/`，每游戏一文件夹
- 初版 3 款：
  - **抓抓** — 30 s 内点屏幕飞过的"光点"，命中 +intimacy_xp
  - **喂食** — 拖拽食物 emoji 到宠物嘴上，combo +xp
  - **写代码陪练** — 用户码字时宠物在旁打字风格跟随，每 100 字 +1 xp
- 都奖励 `pet-energy` + `intimacy_xp`
- 后端 `pet-minigame` 模块：得分记录 + 防作弊速率上限

### S5.2 社交繁育
- 新模块 `pet-breeding`：
  - 双用户 invite → 选两只宠物 "合体"
  - LLM 混合两 soul + 两 skin 属性 → 调 Hunyuan3D 生成混合外观
  - 5 天孵化期，期间双方都看到"蛋"动画
  - 出生后双方各得 1 只血统宠；NFT 归属 50/50（仅 Max 可铸造）
- 用户互访：进入好友页 → 看到对方宠物在他头像旁；可远程"摸一下"（限速 1 次/天）
- 血统树 UI：`PetLineageTree.tsx` 递归展示 3 代

---

## Sprint S6 — PRD 缺口收尾

### S6.1 套餐 gating 实化
- `pet-soul-template.service.ts` 实装 plan tier 过滤
- Free → 族 A；Pro → 解锁 BCDEF；Max → 付费 / NSFW
- 抛 `ForbiddenException` + 升级 CTA

### S6.2 Web 路由 404 修
- 检查 `frontend/pages/auth/passkey.tsx`、marketplace 路由的生产 404
- 若 dynamic route 没生成 → 加 `getStaticPaths` 或 `dynamic = 'force-dynamic'`

### S6.3 Wear OS 桌宠（可选）
- `wearables/PetWatchFace.tsx` — 表盘 Lottie 缩略宠物
- 与桌面状态同步

---

## 验证（每 Sprint 末执行）

1. `tsc --noEmit` 三端通过
2. 新后端模块单测 ≥ 60%
3. 桌面 E2E 场景从当前 10 → S5 末扩到 25+
4. 后端部署 `47.130.176.148` PM2 + migration
5. NSIS .exe 重建（保持 6.86 MB ±10%）
6. 写 `/memories/repo/pet-phase6-s<N>-shipped-<date>.md`

## 关键架构决策

- **桌宠用独立 Tauri 窗口**：不是 always-on-top div，因为拖拽吸附 / 多屏 / 任务栏躲藏都需要真窗口位置 API
- **主动消息默认 4 h 上限可调**：避 Replika 早期骚扰翻车
- **繁育双方各扣 200 credits**，NFT 仅 Max 用户可铸造
- **AR / 进化形态排到 P7** 单做，本轮不含
- **提交策略**：每 Sprint 单独 commit + push + .exe（非合并大 PR），用户随时可叫停

## 进度

- [ ] S1 Living Pet Window — 本轮立刻开始
- [ ] S2 主动陪伴
- [ ] S3 跨端同步 + Rive
- [ ] S4 商店 v2 + 成长
- [ ] S5 迷你游戏 + 繁育
- [ ] S6 缺口收尾
