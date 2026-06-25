# Desktop Go-Live Sprint G-1 + G-2 — Tasks

> 实施任务清单。每个 task 都关联 [requirements.md](requirements.md) 的具体 US，并落到 [design.md](design.md) 的具体文件路径。
> Sprint G-1 ≈ 1.5 工作日（轻），Sprint G-2 ≈ 6.5 工作日（重）。

---

## Sprint G-1：稳定性收口（本周）

### Task 1: 浮球右键菜单回归测试
**关联**：US-G1-1
**依赖**：commit `7e3f2dc2` 已完成代码修复
- [ ] 1.1 创建 `desktop/src/test/floating-ball-menu.e2e.test.tsx`，覆盖 `main` window label 路径
  - mock `__TAURI_INTERNALS__.metadata.currentWindow.label = "main"`
  - 渲染 `<App />`，触发 `dispatchUiAction("open-wardrobe")`
  - 断言 `invoke("desktop_bridge_open_chat_panel")` **NOT** 被调用
  - 断言 `agentrix:open-panel-pro` 和 `agentrix:open-wardrobe` 都被 dispatch
- [ ] 1.2 创建 `desktop/src/test/floating-ball-menu-petcompanion.test.tsx`，验证 `pet-companion` 路径仍然走 IPC
  - mock label = `"pet-companion"`，期望 `invoke` 被调用
- [ ] 1.3 把测试加入 `npm run test`，CI 必跑
- [ ] 1.4 写 memory note `memories/repo/duplicate-window-fix-2026-05-15.md`

### Task 2: 首次启动 / 登录 / 引导冒烟
**关联**：US-G1-2
- [ ] 2.1 创建 `desktop/src/components/SplashScreen.tsx`（CSS spinner + Agentrix logo，纯静态 200ms 兜底）
- [ ] 2.2 修改 `App.tsx`：在 `(!loggedIn || !onboarded)` 分支前添加 SplashScreen 200ms 显示
- [ ] 2.3 写 fresh-install 检查脚本 `desktop/scripts/fresh-install-check.ps1`：
  - 删 `%APPDATA%/Agentrix Desktop/`
  - 启动 exe → 截图 LoginPanel → 检查图片是否完整加载
  - 不依赖网络也能完成检查
- [ ] 2.4 在 Win 10 + Win 11 各跑一次，记录截图到 `tests/reports/fresh-install-2026-05-1X.md`
- [ ] 2.5 修复脚本里发现的视觉问题（如有）

### Task 3: Agent Economy → PetCreator 跳转修复
**关联**：US-G1-3
- [ ] 3.1 修改 `desktop/src/components/AgentEconomyPanel.tsx` 空状态 CTA：先 `onClose()` 再延后 dispatch
- [ ] 3.2 创建 `desktop/src/test/AgentEconomyPanel.test.tsx`，断言事件顺序
- [ ] 3.3 手动验证视觉：打开 → 点击 CTA → 期望看到 PetCreator 单独显示

### Task 4: idle timer cleanup 验证
**关联**：US-G1-4
- [ ] 4.1 仔细审视 `App.tsx` 第 ~340 行 useEffect，确认 cleanup 正确（已审视 → 正确）
- [ ] 4.2 创建 `desktop/src/test/idle-cleanup.test.tsx`：spy `addEventListener`/`removeEventListener`，mount → switch to Pro → unmount → 断言对称调用
- [ ] 4.3 写 memory note `memories/repo/idle-timer-cleanup-2026-05-15.md` 说明审计文档误报，实际逻辑正确

### Task 5: Sprint G-1 Build & Verify
- [ ] 5.1 `npm run test` 全部通过
- [ ] 5.2 `npm run tauri build` 产出 `Agentrix Desktop_v0.1.2_x64-setup.exe`
- [ ] 5.3 升级 `tauri.conf.json` version `0.1.1 → 0.1.2`
- [ ] 5.4 commit + push + 内测分发

---

## Sprint G-2：上线前打磨（下周）

### Task 6: 数据库 schema 迁移
**关联**：US-G2-2/3/4 共用
- [ ] 6.1 创建 `backend/src/migrations/1779400000000-CreateAgentrixDesktopSchema.ts`
  - 包含 `CREATE SCHEMA agentrix_desktop`
  - 三张表：releases / crash_records / analytics_events
  - 索引按 design.md §3.1 全套创建
  - down 是 `DROP SCHEMA agentrix_desktop CASCADE`
- [ ] 6.2 创建 3 个 entity 文件 `backend/src/entities/desktop-{release,crash-record,analytics-event}.entity.ts`
  - 使用 `@Entity({ schema: 'agentrix_desktop', name: 'releases' })` 等
  - **不要**在 `@Column` 写 `name: 'snake_case'`（SnakeNamingStrategy 自动处理）
- [ ] 6.3 本地 docker-compose Postgres 验证 migration up + down 干净
- [ ] 6.4 部署到生产 (`npm run migration:run` on `47.130.176.148`)

### Task 7: 自动更新通道（前端）
**关联**：US-G2-2
- [ ] 7.1 `cd desktop && npm install @tauri-apps/plugin-updater`
- [ ] 7.2 `desktop/src-tauri/Cargo.toml` 加 `tauri-plugin-updater = "2"`
- [ ] 7.3 `desktop/src-tauri/src/lib.rs` 注册 updater plugin
- [ ] 7.4 修改 `tauri.conf.json` 把 `endpoints` 路径改成 `/api/v1/desktop/update/{{target}}/{{arch}}/{{current_version}}`
- [ ] 7.5 创建 `desktop/src/services/updater.ts`：启动后 30s 检查更新，dispatch 通知
- [ ] 7.6 创建 `desktop/src/components/UpdateNotification.tsx`：在通知中心展示 [立即更新] [稍后]
- [ ] 7.7 在 `App.tsx` 调用 `bootUpdater()`
- [ ] 7.8 生成升级私钥 `tauri signer generate -w ~/.tauri/agentrix.key`，把公钥写进 `tauri.conf.json` `pubkey`

### Task 8: 自动更新通道（后端）
**关联**：US-G2-2
- [ ] 8.1 创建 `backend/src/modules/desktop-lifecycle/desktop-lifecycle.module.ts`
- [ ] 8.2 创建 `desktop-update.controller.ts`（GET endpoint）
- [ ] 8.3 创建 `desktop-update.service.ts`（查 latest active release，semver 比较）
- [ ] 8.4 加灰度逻辑：根据 `device_id_hash` 取模 100 决定是否返回更新（`rollout_percent` 字段在 v0.2.1 可选）
- [ ] 8.5 写单元测试 `backend/test/desktop-update.controller.spec.ts`：
  - 当前版本 = latest → 204
  - 当前版本 < latest → 200 + manifest
  - 不同 target/arch 返回对应 release

### Task 9: 崩溃上报（前端）
**关联**：US-G2-3
- [ ] 9.1 创建 `desktop/src/services/crashReport.ts`：
  - `reportCrash(type, error, ...)` 函数
  - 注册 `window.addEventListener('error')` 和 `'unhandledrejection'`
  - 本地 `localStorage.agentrix_crash_queue`，最多 50 条 FIFO
  - 网络 OK 时批量 POST
- [ ] 9.2 增强 `ErrorBoundary.tsx`：在 `componentDidCatch` 调用 `reportCrash('react_error', error, info)`
- [ ] 9.3 修改 `App.tsx` 启动时调用 `bootCrashReport()`
- [ ] 9.4 现有 `desktop_bridge_get_recent_crashes` 上报 Rust panic 的逻辑保留 + 接入 `reportCrash`

### Task 10: 崩溃上报（后端）
**关联**：US-G2-3
- [ ] 10.1 创建 `desktop-crash.controller.ts` + `service.ts`
- [ ] 10.2 实现 fingerprint 计算 = `sha256("${type}:${message.slice(0,100)}")`
- [ ] 10.3 实现 `sanitizePath` 函数 + 单元测试覆盖 Win/Mac/Linux 三种路径模式
- [ ] 10.4 实现 10 分钟去重窗口（同 device_id_hash + fingerprint → count++）
- [ ] 10.5 创建 `desktop-crash.controller.spec.ts`：
  - 同一指纹 5 次 → DB 表里只有 1 条 count=5
  - sanitize 三种路径 → 全部替换为 `<user>`

### Task 11: 遥测 opt-in（前端）
**关联**：US-G2-4
- [ ] 11.1 修改 `desktop/src/services/analytics.ts`：默认值改为关闭 (`agentrix_telemetry_opt_in === '1'`)
- [ ] 11.2 添加 6 个埋点：
  - `App.tsx` 初始化 → `desktop_launch`
  - `LoginPanel.tsx` 成功 → `desktop_login`
  - `OnboardingPanel.tsx` 完成 → `desktop_onboarding_complete`（同时写 `localStorage.agentrix_onboarded_at`）
  - `ChatPanelImpl.tsx` 首次发对话 → `desktop_first_chat`（用 `localStorage.agentrix_first_chat_seen` 防重）
  - `App.tsx` 浮球首次渲染 → `desktop_first_pet_view`
  - `App.tsx` panelMode 变化 → `desktop_form_switch`
- [ ] 11.3 创建 `desktop/src/components/FirstRunTelemetryPrompt.tsx`：onboarded 第 3 天弹一次温和 toast
- [ ] 11.4 在 `SettingsPanel.tsx` 添加 toggle "发送匿名使用数据"
- [ ] 11.5 单元测试 `desktop/src/test/analytics-opt-in.test.tsx`：
  - 默认状态 `_enabled = false`
  - 触发 trackEvent → 队列空
  - 调用 optIn → 触发 trackEvent → 队列有事件
  - 调用 optOut → 队列清空

### Task 12: 遥测 opt-in（后端）
**关联**：US-G2-4
- [ ] 12.1 创建 `desktop-analytics.controller.ts`：`POST /api/v1/desktop/analytics`
- [ ] 12.2 接受批量 events，校验 device_id_hash 形式（64 字符 hex）
- [ ] 12.3 写入 `agentrix_desktop.analytics_events`
- [ ] 12.4 单元测试覆盖批量插入 + invalid event_name 拒绝

### Task 13: 资源加载验证
**关联**：US-G2-5
- [ ] 13.1 在 `desktop/src/services/petAssets.ts` 添加 `verifyDefaultPngs()` 函数：启动后异步 fetch `/pets/*.png`，失败则 console.warn + 触发 `agentrix:asset-fallback`
- [ ] 13.2 验证 `npm run tauri build` 后 `dist/pets/` 三个 png 都存在
- [ ] 13.3 离线验证：断网 → 启动 → 浮球仍能渲染

### Task 14: 多显示器坐标归一化
**关联**：US-G2-6
- [ ] 14.1 `desktop/src-tauri/src/commands.rs` 新增 `validate_ball_position` 函数（见 design.md §3.6）
- [ ] 14.2 `desktop/src-tauri/src/lib.rs` 注册 `desktop_bridge_validate_ball_position` invoke handler
- [ ] 14.3 `App.tsx` 启动后调用一次 `desktop_bridge_validate_ball_position`
- [ ] 14.4 现有 `snap_ball_to_edge` 已用 `current_monitor()`，确认 DPI scale 正确
- [ ] 14.5 双显示器物理测试（100% + 150% scale）：拖拽到副屏 → 自动贴边 → 重启位置保持 → 拔副屏 → 回到主屏

### Task 15: 默认 VRM 资产实装
**关联**：US-G2-7
- [ ] 15.1 资产生成（择一）：
  - 主路径：用 VRoid Studio / vrm-converter 把 `deliverables/pets_v2/kitsune-C-v2-refined.glb` (+ pro/economy) 转成 .vrm
  - 退路：直接复用 .glb（PetVRM 支持）
- [ ] 15.2 上传到 `agentrix.top/assets/pets/kitsune-{default,pro,economy}.{vrm|glb}`
- [ ] 15.3 修改 `desktop/src/services/petSdk.ts` 的 `bootPetSdk`：未设置 vrm_url 时注入默认 URL
- [ ] 15.4 监听 `agentrix:app-mode-changed`：仅当无自定义皮肤时切换默认 URL
- [ ] 15.5 PetVRM 加载失败 → 自动降级 PetCanvas PNG（已有 `imgError` fallback）
- [ ] 15.6 验证渲染：呼吸动画 + 慢眨眼 + 情绪 BlendShape 切换

### Task 16: Sprint G-2 集成测试 + 发版
**关联**：所有 G-2 US
- [ ] 16.1 升级 `tauri.conf.json` version `0.1.2 → 0.2.0`
- [ ] 16.2 `npm run tauri build` 产出 v0.2.0 NSIS + MSI
- [ ] 16.3 部署后端：SSH `47.130.176.148` → `git pull` + `npm run build` + `npm run migration:run` + `pm2 restart agentrix-backend`
- [ ] 16.4 INSERT v0.2.0 到 `agentrix_desktop.releases` 表（`is_active = true`，旧版 false）
- [ ] 16.5 在 10 台测试机上跑 design.md §7.2 手动测试矩阵
- [ ] 16.6 跑完整 GA Gate Demo 流程（requirements.md §6 共 12 步）
- [ ] 16.7 commit + push + tag `v0.2.0`

---

## 任务汇总

| Sprint | 任务数 | 后端 | 前端 | 测试 | Rust | 总人天 |
| --- | --- | --- | --- | --- | --- | --- |
| G-1 | 5 | 0 | 5 | 4 | 0 | 1.5 |
| G-2 | 11 | 4 | 5 | 4 | 1 | 6.5 |
| **合计** | **16** | **4** | **10** | **8** | **1** | **8** |

**预留缓冲**：2 天（应对 VRM 资产生成、Win 10/11 差异、自动更新灰度问题）。
**总周期**：10 工作日 = 2 周（符合 G-1+G-2 sprint 周期）。

---

## 完成定义（DoD）

每个 task 必须满足：
1. 代码改动通过 `tsc --noEmit`
2. 关联的单元测试 / E2E 测试通过
3. 改动文件在本地 `npm run tauri build` 通过
4. 关联的 US 在 requirements.md 上打钩
5. memory note（如适用）写到 `memories/repo/`

---

## 任务依赖

```
Task 1 ──→ Task 5 (G-1 build)
Task 2 ──→ Task 5
Task 3 ──→ Task 5
Task 4 ──→ Task 5

Task 6 (DB schema) ──┬──→ Task 8 (update API)
                     ├──→ Task 10 (crash API)
                     └──→ Task 12 (analytics API)
Task 7 (updater FE) ──→ Task 16
Task 8 ──→ Task 16
Task 9 (crash FE) ──→ Task 16
Task 10 ──→ Task 16
Task 11 (analytics FE) ──→ Task 16
Task 12 ──→ Task 16
Task 13 (assets) ──→ Task 16
Task 14 (monitor) ──→ Task 16
Task 15 (VRM) ──→ Task 16
```

Task 6 是 G-2 关键路径前置；Task 1-5 (G-1) 完全独立可并行。
