# Desktop Go-Live Sprint G-1 + G-2 — Requirements

> 把桌面端从内测候选打磨到 GA 候选 (`v0.1.1` → `v0.2.0`) 的需求集合。
> 输入：[docs/DESKTOP_GO_LIVE_AUDIT_2026-05-15.zh-CN.md](../../../docs/DESKTOP_GO_LIVE_AUDIT_2026-05-15.zh-CN.md)
> 周期：2 个 sprint × 1 周 = 10 工作日
> 决策日：2026-05-15
> GA 触发线：崩溃率 < 0.5 % / DAU、签名 + SmartScreen 通过率 > 80 %、自动更新稳定 ≥ 3 天、关键路径 P0 = 0

---

## 1. 范围

**Sprint G-1（稳定性收口，本周）**：
- 多窗口路径回归
- 首次启动 / 登录 / 引导端到端冒烟
- 已知 P1 修复（Agent Economy 跳转、idleTimer 内存泄漏）

**Sprint G-2（上线前打磨，下周）**：
- 登录前的本地资源可见性
- 多显示器坐标归一化
- 自动更新通道（tauri-plugin-updater + manifest 服务）
- 崩溃上报
- 首跑关键事件遥测（**默认关闭，opt-in**）
- VRM 真实资产实装（默认灵狐 .vrm 文件下发 + PetVRM 渲染验证）

**决策日期**：2026-05-15
- 小规模内测阶段，**Windows 代码签名延后到 v0.3 公开发布前**（内测用户用 SmartScreen "More info → Run anyway" 通过即可）
- 数据库 3 张新表使用**独立 schema** `agentrix_desktop`（与主业务库隔离）
- 遥测**默认关闭** + 设置里有明显的 opt-in 开关 + 首跑后第 3 天弹一次温和的 opt-in 提示

**不在范围**：
- Windows EV 代码签名（v0.3）
- Spotlight 视觉重设计（P2）
- Rust dead_code 清理（P2）
- 渠道分发（GitHub Releases / 微软商店）

---

## 2. 用户故事 + 验收标准（EARS）

### US-G1-1：浮球右键菜单不再生成额外窗口
**作为**桌面端用户，**我想**从悬浮球右键菜单进入任何子面板（衣柜、创建、成长、视频、设置、灵魂、Coraising、Greeting、Breeding），**以便**功能在我当前的窗口里打开，而不是另起一个 Agentrix 实例。

**验收标准：**
- WHEN 用户在 `main` 窗口的悬浮球上右键并选中任意菜单项 THEN 系统 SHALL 在当前窗口中打开 Pro Mode 并把对应面板挂到上面
- WHEN 用户右键菜单触发了打开行为 THEN 系统 SHALL NOT 创建额外的 `chat-panel` Tauri 窗口（任务栏图标个数保持 1）
- WHEN 用户从 `pet-companion` / dev `floating-ball` 窗口触发右键菜单 THEN 系统 SHALL 走 IPC 打开 `chat-panel` 窗口（这是这两个 label 的预期行为）
- WHEN 用户连续 3 次以上来回右键菜单 → 关闭面板 → 再次右键 THEN 系统 SHALL 不出现窗口堆积
- 验证方式：Maestro 桌面 E2E 脚本覆盖 12 个浮球右键菜单项 + 6 个 Pro More 菜单项

> 注：D-P0-1 / D-P0-2 已在 commit `7e3f2dc2` 修复，本需求等于"通过 E2E 把这条修复锁住，避免回归"。

---

### US-G1-2：首次启动用户能完成登录与引导
**作为**全新用户，**我想**安装 Agentrix Desktop 后启动就能看到登录界面，**以便**输入凭据后顺利进入引导流程，最终看到我的悬浮灵狐。

**验收标准：**
- WHEN 用户首次启动且 `localStorage` 没有 `agentrix_token` THEN 系统 SHALL 显示 `LoginPanel`，窗口大小 SHALL 至少为 480×640（不能是 80×80 隐形方块）
- WHEN 用户登录成功（邮箱密码 / 钱包 / 社交登录任一）THEN 系统 SHALL 显示 `OnboardingPanel`
- WHEN 用户完成 onboarding（点击"开始使用"）THEN 系统 SHALL 把窗口缩到 80×80 并展示真实灵狐 PNG
- WHEN 用户首次启动且本地资源（`/pets/kitsune-default.png` 等）加载失败 THEN 系统 SHALL 退回 SVG fallback 而不是黑屏
- WHEN 用户登录前在 Pro 模式下访问页面 THEN 系统 SHALL 不出现 PNG 404 警告
- 验证方式：手动 + Maestro fresh-install 冒烟脚本（卸载干净 → 安装 → 启动 → 登录 → onboarding → 看到灵狐）

---

### US-G1-3：Agent Economy → PetCreator 跳转不重叠
**作为**还没创建主宠的用户，**我想**在空的 Agent Economy 面板上点 `[✨ 创建 / 选择主宠]` CTA，**以便**直接进入 PetCreator，而不是看到两个面板叠在一起。

**验收标准：**
- WHEN 用户点击 Agent Economy 空状态的 CTA 按钮 THEN 系统 SHALL 先关闭 Agent Economy 面板（dispatch `onClose()`）再 dispatch `agentrix:open-pet-creator`
- WHEN 跳转完成 THEN 用户 SHALL 看到 `PetCreatorPanel` 占据全屏，不应有 Agent Economy 半透明残影
- WHEN 用户从 PetCreator 关闭返回 THEN 系统 SHALL 回到 ChatPanel 默认视图（不重新弹出 Agent Economy）
- 验证方式：单元测试 `AgentEconomyPanel` 空状态点击事件序列；手动验证视觉

---

### US-G1-4：Pro 模式 idle timer 不泄漏内存
**作为**长时间挂着 Agentrix 的用户，**我想**Pro 模式 idle 自动回到 compact 形态时，相关事件监听器被正确清理，**以便**长时间运行不会内存爬升。

**验收标准：**
- WHEN Pro 模式被打开 THEN 系统 SHALL 注册 5 个 user-activity listener（mousemove / keydown / mousedown / wheel / touchstart）+ 1 个 30s interval
- WHEN Pro 模式被关闭、切回 compact、组件卸载、useEffect deps 变化 THEN 系统 SHALL 移除全部 5 个 listener 并清理 interval
- WHEN Agentrix 持续运行 6 小时 THEN heap snapshot 中绑在 window 上的 mousemove listener 数量 SHALL = 1（来自其他长生命周期模块），不会随时间累积
- 验证方式：Chrome DevTools Memory > Allocation Timeline 在反复 open/close Pro 模式 10 次后对比 listener count

---

### US-G2-1：Windows 安装器签名 — **延后到 v0.3**

> 决策（2026-05-15）：小规模内测阶段不做代码签名，给内测用户提供 README 引导通过 SmartScreen 的"详细信息 → 仍要运行"。
> 公开发布前在 v0.3 sprint 重新评估 Azure Trusted Signing vs EV cert。

**当前 Sprint 仅需要的工作**：
- WHEN 内测用户首次执行安装器 THEN 我们 SHALL 在 README 和分发邮件里提供"通过 SmartScreen"的截图引导
- WHEN 内测用户向我们反馈 SmartScreen 拦截 THEN 我们 SHALL 在 FAQ 里有标准回复
- 其余原 EV 签名 / signtool 验证等验收标准 → **作废，留 v0.3**

---

### US-G2-2：自动更新通道上线
**作为**已安装用户，**我想**Agentrix 启动后能自动检测新版本并提示更新，**以便**我不用重新去官网下载。

**验收标准：**
- WHEN 应用启动 THEN 系统 SHALL 在 30 秒后向 `https://api.agentrix.top/api/desktop/update/{target}/{arch}/{current_version}` 发请求
- WHEN 服务器返回 `204 No Content` THEN 系统 SHALL 静默不显示提示
- WHEN 服务器返回 `200` + `{ version, notes, pub_date, signature, url }` JSON 且 `version > current_version` THEN 系统 SHALL 在通知中心显示 `🎉 新版本 vX.Y.Z 可用 [立即更新] [稍后]`
- WHEN 用户点击 `[立即更新]` THEN 系统 SHALL 下载 `.nsis` 包到临时目录、校验签名（用配置中的 `pubkey`）、下载完成后弹出"下载完成，5 秒后重启安装"toast、自动重启
- WHEN 签名校验失败 THEN 系统 SHALL 中止安装并写崩溃日志，不能装上未签名 / 被篡改的包
- 服务端：`api.agentrix.top/api/desktop/update/:target/:arch/:current_version` GET → 查 `desktop_releases` 表里 latest stable，对比版本号
- 数据库新表：`desktop_releases (id, version, channel='stable'|'beta', target, arch, url, signature, pub_date, notes_md, is_active)`
- 验证方式：3 天稳定运行测试 — 部署 v0.2.0 后部署 v0.2.1，10 台测试机自动收到提示、点击安装、重启后版本号变更

---

### US-G2-3：崩溃报告自动收集
**作为**产品团队，**我想**用户的崩溃自动上报到中心服务器，**以便**能快速定位问题并衡量是否达到 GA 触发线（崩溃率 < 0.5 %）。

**验收标准：**
- WHEN Rust 后端 panic THEN `setup_panic_hook` SHALL 写入 `~/AppData/Roaming/Agentrix Desktop/crashes/<timestamp>.json`（已实现）
- WHEN 应用启动 THEN 系统 SHALL 读取最近 24 小时的 crash 报告并通过 `desktop_bridge_get_recent_crashes` 上报
- WHEN React webview 抛出 unhandled error 或 promise rejection THEN ErrorBoundary SHALL 捕获并上报
- WHEN 上报到达后端 THEN 后端 SHALL 写入 `desktop_crash_records (id, device_id, user_id?, version, type, message, stack, location, occurred_at, platform, arch)` 表
- WHEN 同一 device_id 短时间（10 分钟内）重复同一指纹（type + message 前 100 字符）的崩溃 THEN 后端 SHALL 去重为单条 + `count` 累加
- 上报必须脱敏：不包含本地文件路径绝对值（替换为相对 `<workspace>/...`）、不包含 token / API key
- 验证方式：触发一次故意 `panic!` → 观察 `desktop_crash_records` 表 → 触发 5 次相同 panic → 表里只有 1 条 `count = 5`

---

### US-G2-4：首跑关键事件遥测（**默认关闭，opt-in**）
**作为**产品团队，**我想**在用户**主动开启**遥测后收集首跑路径的关键事件，**以便**计算激活率、登录漏斗、首次对话率等核心指标，并保持隐私合规。

**验收标准：**
- WHEN 用户首次启动 THEN 系统 SHALL 默认关闭遥测（`localStorage.agentrix_telemetry_opt_in === '0'` 或缺失视为关闭）
- WHEN 用户首次完成 onboarding 且经过 3 天活跃使用 THEN 系统 SHALL 显示一次温和的 opt-in toast：「帮助我们改进 Agentrix → 匿名分享使用数据 [开启] [先不用]」（一次性，无论用户选什么都不再弹）
- WHEN 用户在 SettingsPanel `隐私` 区开关 THEN `localStorage.agentrix_telemetry_opt_in` SHALL 切换为 `'1'` / `'0'`
- WHEN `agentrix_telemetry_opt_in === '1'` THEN 以下事件 SHALL 上报：
  - `desktop_launch`（每次启动，含 version / OS / 第一次启动标志）
  - `desktop_login`（登录成功，含 method = email/wallet/social/guest）
  - `desktop_onboarding_complete`
  - `desktop_first_chat`（首次对话发出，含 mode = ask/agent/plan）
  - `desktop_first_pet_view`（首次看到悬浮灵狐）
  - `desktop_form_switch`（compact ↔ pro 切换）
  - `desktop_crash_detected`（崩溃，独立机制，**始终上报**用于稳定性监控，但脱敏）
- WHEN `agentrix_telemetry_opt_in === '0'` THEN 系统 SHALL NOT 上报任何 desktop_* 事件（崩溃除外）+ 本地 IndexedDB 队列 SHALL 被清空
- WHEN 网络可用 THEN 队列 SHALL 5 分钟内通过 `POST /api/v1/analytics/desktop` 批量上报
- WHEN 网络不可用 THEN 事件 SHALL 累积在本地最多 7 天，连上后批量补发
- 隐私豁免：`desktop_crash_detected` 是稳定性指标（GA Gate 必需），即使 opt-out 也上报，但只携带 `device_id_hash`、不携带任何用户内容
- 验证方式：fresh install → opt-in 后完整路径 → 服务端 `agentrix_desktop.analytics_events` 表能查到 6 条事件；opt-out 路径下表里只有 crash 一条
- **注**：opt-in 默认关闭会让首跑漏斗数据量大幅下降（预估保留 20-30 %），需要团队接受这个代价

---

### US-G2-5：登录前本地资源能加载
**作为**安装后第一次启动的用户，**我想**LoginPanel / OnboardingPanel 上的所有图片、字体、PNG 都能正常显示，**以便**首次见到 Agentrix 不是一堆破图标。

**验收标准：**
- WHEN 用户首次启动且未登录 THEN `/pets/kitsune-default.png` `/pets/kitsune-pro.png` `/pets/kitsune-economy.png` SHALL 全部从 Tauri `dist/` 目录被正确响应（不应 404）
- WHEN 网络不可用且本地资源仍在 dist 内 THEN 资源 SHALL 仍能加载（不依赖外网 CDN）
- WHEN 资源加载失败 THEN 应用 SHALL 退回 SVG fallback 而不是显示破图占位
- WHEN 资源加载成功 THEN PetCanvas 渲染时间 SHALL < 200ms（首屏不显示加载占位）
- 验证方式：DevTools Network → Disable cache → 刷新 → 看 `/pets/*.png` 都是 200，没有 404

---

### US-G2-6：多显示器坐标归一化
**作为**有多个显示器（不同 DPI / 缩放）的用户，**我想**把悬浮球从主屏拖到副屏，**以便**球继续紧贴副屏边缘而不是出现在屏幕外或回弹到主屏。

**验收标准：**
- WHEN 用户从主屏拖动悬浮球到副屏 THEN 系统 SHALL 在拖拽结束 300ms 后调用 `desktop_bridge_snap_ball_to_edge`，球贴到 **副屏** 当前最近的边缘
- WHEN 主屏缩放 100 %、副屏缩放 150 % THEN 拖拽后球的物理坐标 SHALL 映射回逻辑像素正确（不会因为 DPI 差变成 1.5× 偏移）
- WHEN 用户重启应用 THEN 球的位置 SHALL 恢复到上次的副屏边缘位置
- WHEN 副屏被拔出（外接显示器断开）THEN 应用启动时 SHALL 检测无效坐标并回到主屏右下角默认位置
- 验证方式：双显示器物理测试 + `desktop_bridge_get_monitors` 列出实际可用监视器与缩放因子

---

### US-G2-7：默认灵狐 VRM 实装（**塞进 G-2**）
**作为**任意已登录用户，**我想**桌面端在默认情况下就用真实的 3D VRM 灵狐渲染，而不是 PNG 图片，**以便**我能看到模型在多形态/多情绪下的真实立体动效。

**验收标准：**
- WHEN 应用首次启动并完成登录 THEN 系统 SHALL 检查 `localStorage.agentrix_pet_vrm_url`：
  - 不存在或为空 → 自动写入默认值 `https://agentrix.top/assets/pets/kitsune-default.vrm`
  - 已存在（用户自定义皮肤）→ 保留用户值
- WHEN `agentrix_pet_vrm_url` 有值 THEN `petSdk.refreshPetRenderers()` 应当激活 `vrm` renderer 而非 `fallback`
- WHEN VRM renderer 激活成功 THEN PetRenderer SHALL 渲染 `<PetVRM>` 而非 `<PetCanvas>`，并且 3 个形态变体（living/pro/economy）SHALL 各自加载独立 VRM URL：
  - `kitsune-default.vrm` → 萌态
  - `kitsune-pro.vrm` → 专家态
  - `kitsune-economy.vrm` → 商人态
- WHEN VRM 文件下载失败（网络异常 / 404）THEN 系统 SHALL 安全降级到 PetCanvas PNG 渲染，不能黑屏
- WHEN VRM 加载成功 THEN 渲染应当满足：
  - 待机呼吸动画（`vrm.scene.position.y` 正弦摆动 ±0.5 cm）
  - 头部缓慢左右摆动（±0.05 弧度）
  - 慢眨眼（每 ~5s 触发一次）
  - 情绪切换 → BlendShape 平滑过渡（happy / sad / angry / surprised / relaxed）
- WHEN 用户在低端 GPU 设备（`recommended_tier === 'unsupported' || 'light'`）THEN 系统 SHALL 跳过 VRM 直接使用 PetCanvas PNG 渲染（已实现：`getGpuRendererCap` → `'rive-only'`）
- 资产准备：
  - 现成 `kitsune-default.png` / `kitsune-pro.png` / `kitsune-economy.png` 已经在 `desktop/public/pets/`
  - 需要补：将这 3 个形态的 VRM 文件上传到 `https://agentrix.top/assets/pets/kitsune-{default,pro,economy}.vrm`
  - VRM 来源：从已有的 `kitsune-C-v2-refined.glb` 通过 VRM 转换工具（VRoid Studio 导入 / glb-to-vrm 工具）转换；如时间不够可临时复用 `pets_v2/` 下的同名 .glb 直接以 `vrm` URL 后缀提供（PetVRM 也接受 .glb fallback）
- 验证方式：
  - 启动应用 → DevTools Network 看到 `kitsune-default.vrm` 请求 200
  - 双击悬浮球 → 触发 `triggerPetInteraction("double_click")` → 看到表情切换
  - 进入 Pro 模式 → URL 切换到 `kitsune-pro.vrm`
  - 模拟 VRM URL 404 → 自动 fallback 到 PNG，无黑屏
- **注**：如果 VRM 资产 sprint 内做不出来，本 US 可降级为"GLB 渲染验证"——`PetVRM` 已经支持 plain .glb 加载（auto-fit + Y rotation），把 `desktop/public/pets/*.glb` 复用过来即可

---

## 3. 非功能需求

| 类别 | 指标 | 当前 | 目标 |
| --- | --- | --- | --- |
| **稳定性** | 崩溃率（崩溃次数 / DAU）| 未测 | < 0.5 % |
| **性能** | idle CPU（仅悬浮球，登录中）| 1-3 % | 不超过 5 % |
| **性能** | idle 内存（Pro 模式无对话）| ~210 MB | 不超过 280 MB |
| **性能** | Webview 启动到 LoginPanel 可见 | ~1.8s | < 2.5s |
| **性能** | VRM 模型首次加载到首帧 | N/A（未实装）| < 3s（Wi-Fi） |
| **可信度** | SmartScreen 红色拦截率 | 100 %（未签名）| **接受 100 %**（v0.3 再优化） |
| **可恢复** | 自动更新成功率（10 台测试机）| N/A | > 95 % |
| **隐私** | 遥测**默认关闭** + opt-in toggle | N/A | 必须支持 |
| **数据隔离** | 桌面端表与主业务库的逻辑边界 | N/A | 单独 schema `agentrix_desktop` |

---

## 4. 依赖

- **后端**：
  - 新 schema `agentrix_desktop`（与主业务 schema 隔离）
  - `agentrix_desktop.releases`（自动更新 manifest）
  - `agentrix_desktop.crash_records`（崩溃上报）
  - `agentrix_desktop.analytics_events`（首跑遥测，opt-in only）
  - 新接口 3 个（GET update / POST crash / POST analytics）
- **资产**：
  - `kitsune-default.vrm` / `kitsune-pro.vrm` / `kitsune-economy.vrm` 上传到 `agentrix.top/assets/pets/`
  - 退路：复用 `kitsune-*.glb` 通过 `<PetVRM url=".glb">` 加载
- **基础设施**：
  - 升级密钥对生成（已有：`tauri.conf.json` 里的 `pubkey`）
  - 升级私钥（生成 `~/.tauri/agentrix.key`，CI 加密注入）
- **CI/CD**：
  - GitHub Actions `build-desktop.yml` 生成已签名 `.sig` 文件 + 上传到 release manifest
  - 发版时自动 INSERT 到 `agentrix_desktop.releases` 表（设 `is_active = true`，旧版本设 `false`）
- **暂不需要**（v0.3）：
  - Azure Trusted Signing 账号
  - EV 代码签名证书

---

## 5. 风险

| 风险 | 概率 | 缓解 |
| --- | --- | --- |
| 内测用户被 SmartScreen 红色拦截放弃安装 | 中 | README 截图引导 + 邮件 + Telegram 群一句话标准回复；每周收集放弃率，> 30 % 就紧急上签名 |
| 自动更新签名校验逻辑写错导致用户装不上新版 | 中 | 灰度 10 % → 验证 3 天 → 100 %；保留人工下载链接 |
| 多显示器拖拽逻辑在不同 Windows 版本表现差异 | 中 | 在 Win 10 / 11 / 不同 DPI 矩阵手测 |
| 遥测 opt-in 默认关闭导致首跑数据稀缺 | **必然发生** | 接受现状；用 `crash_records` 反推总活跃用户数（每个用户至少能看到 1 条 launch crash 上报，可去重得 DAU）；v0.3 再考虑友好 opt-in 弹窗时机 |
| VRM 资产上线前没就绪 | 中 | 退路：复用现有 .glb 文件（PetVRM 已支持）；再退一步：保留 PNG 渲染（已经能用） |
| 单独 schema `agentrix_desktop` 需要后端额外迁移 | 低 | TypeORM `synchronize: false` + 显式 migration 文件 |

---

## 6. 验收 Demo 流程（GA Gate）

1. 卸载旧版 Agentrix Desktop
2. 在干净的 Win 11 + Win 10 各下载 `Agentrix Desktop_v0.2.0_x64-setup.exe`
3. 双击运行 → SmartScreen 红屏 → 内测用户按 README 走 "More info → Run anyway" 通过（不签名是已接受的现状）
4. 安装完成 → 自动启动 → LoginPanel 完整显示，所有图片都加载正常
5. 邮箱登录 → onboarding → 看到右下角 **真实 VRM 灵狐**（带呼吸 + 慢眨眼）；网络不可用时降级到 PNG
6. 浮球右键 → 衣柜 → 在当前窗口弹出衣柜（任务栏只有 1 个图标）
7. 关闭 → Pro Mode → 灵狐切换到专家态 VRM；Agent Economy → 切换到商人态 VRM；空状态点击 CTA → PetCreator 单独显示
8. 拖动悬浮球到副屏 → 自动贴边
9. 服务端推送 v0.2.1 → 30s 内收到通知 → 点击更新 → 重启后版本号变化
10. 故意触发 `panic!` → 重启 → 看到 toast "Agentrix 从崩溃中恢复" + 后端 `agentrix_desktop.crash_records` 收到记录
11. 设置里看到遥测开关 **默认关闭**；用户主动打开后，后续事件流入 `agentrix_desktop.analytics_events`；关闭后停止
12. 第 3 天弹一次温和 opt-in toast；用户选择"先不用"后再不弹

全部通过即达到 GA 候选条件，进入 Sprint G-3 内测。

---

## 7. 关键决策记录（2026-05-15）

| 议题 | 决策 | 理由 |
| --- | --- | --- |
| 代码签名 | **延后到 v0.3 公开发布前** | 内测阶段用户是有手动操作能力的种子用户，可以走 SmartScreen 跳过 |
| 数据库 schema | 单独 `agentrix_desktop` schema | 桌面端表与主业务库逻辑隔离，未来好独立迁移 / 备份 |
| 遥测策略 | 默认关闭 + opt-in toast 第 3 天弹 1 次 | 隐私优先；接受首跑数据稀缺代价 |
| VRM 实装 | 塞进 G-2 | 桌面端核心卖点是"立体感觉"，PNG 不够；有 .glb fallback 兜底 |
