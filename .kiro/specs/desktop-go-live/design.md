# Desktop Go-Live Sprint G-1 + G-2 — Design

> 把 [requirements.md](requirements.md) 的 9 条用户故事拆成可实施的技术方案。
> 范围：v0.1.1 → v0.2.0 桌面端正式上线收口。
> 决策日：2026-05-15。

---

## 1. 架构总览

```
┌─────────────────────── Desktop Client ────────────────────────┐
│ Tauri 2.0 (Rust)                                              │
│  ├─ panic_hook       → AppData/Agentrix Desktop/crash-logs/   │
│  ├─ updater plugin   → /api/v1/desktop/update/*               │
│  ├─ single-instance  → 防止重复启动                            │
│  └─ commands.rs      → snap_ball / monitors / crashes         │
│                                                                │
│ React 19 + Vite                                               │
│  ├─ App.tsx                                                   │
│  │   ├─ panel mode broadcast (✅ 已实装)                       │
│  │   ├─ idle timer cleanup (US-G1-4)                          │
│  │   └─ first-run telemetry (US-G2-4)                         │
│  ├─ desktopBus.ts                                             │
│  │   └─ ensureProMode (✅ 已修复 main 窗口路径)                │
│  ├─ services/                                                 │
│  │   ├─ analytics.ts    → opt-in gate + IndexedDB queue       │
│  │   ├─ crashReport.ts  → 新增，桥接 panic_hook 上报            │
│  │   ├─ updater.ts      → 新增，包装 tauri-plugin-updater      │
│  │   ├─ monitor.ts      → 新增，多显示器坐标归一化              │
│  │   └─ petAssets.ts    → 注入默认 VRM URL (US-G2-7)           │
│  └─ components/                                               │
│      ├─ AgentEconomyPanel.tsx → CTA onClose 修复 (US-G1-3)    │
│      ├─ SettingsPanel.tsx     → 遥测 opt-in toggle             │
│      ├─ FirstRunTelemetryPrompt.tsx (新增)                    │
│      └─ UpdateNotification.tsx (新增)                         │
└────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
┌──────────────── Backend (NestJS + PG) ────────────────────────┐
│ schema: agentrix_desktop  ← 单独 schema                       │
│  ├─ releases              ← 自动更新 manifest                  │
│  ├─ crash_records         ← 崩溃聚合                          │
│  └─ analytics_events      ← 首跑遥测（opt-in）                 │
│                                                                │
│ modules/desktop-lifecycle/  ← 新模块                           │
│  ├─ desktop-update.controller.ts                              │
│  ├─ desktop-crash.controller.ts                               │
│  └─ desktop-analytics.controller.ts                           │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Sprint G-1：稳定性收口

### 2.1 US-G1-1：浮球右键菜单不开第二窗口（已修，需 E2E 锁住）

**已完成**：`desktop/src/services/desktopBus.ts` `ensureProMode` 区分 label。

**新增工作**：
- 写 Maestro 桌面 E2E 脚本 `.maestro/desktop/01-floating-ball-menu.yaml`
  - 启动 → 登录 → 看到悬浮球
  - 右键浮球 → 点击"我的萌宠 (衣柜)"→ 断言：当前窗口出现衣柜 + 任务栏只有 1 个 Agentrix 图标
  - 关闭衣柜 → 右键 → 点击"创建新萌宠"→ 断言同上
  - 重复 5 次随机菜单项 → 断言任务栏图标始终 = 1
- 因为 Maestro 主要为移动端设计，桌面 E2E 用 Tauri 自带的 `mockIPC` + Vitest 替代：
  - 新建 `desktop/src/test/floating-ball-menu.e2e.test.tsx`
  - mock `__TAURI_INTERNALS__.metadata.currentWindow.label = "main"`
  - 渲染 `<App />` → 模拟右键 → 点击衣柜
  - 断言 `invoke("desktop_bridge_open_chat_panel")` **NOT called**
  - 断言 `agentrix:open-panel-pro` event 被 dispatch
  - 断言 `agentrix:open-wardrobe` event 被 dispatch

### 2.2 US-G1-2：首次启动登录与引导

**改动文件**：
- `desktop/src/App.tsx` — 已有逻辑保持，但需要补：
  - 在 `(!loggedIn || !onboarded)` 分支，**强制窗口至少 480×640**（已有 `resizeMainWindow(480, 640)`，但要确保 Tauri 命令完成前不渲染内容，避免 80×80 闪一下）
  - LoginPanel 渲染前，显示 `<SplashScreen />`（200ms minimum）兜底
- `desktop/public/pets/*.png` — 已存在，关键是 vite 把它们打进 `dist/`（默认行为 ✅）
- 新增 `desktop/src/components/SplashScreen.tsx`：纯 CSS Spinner + Agentrix logo，避免登录前空白

**Fresh-install 测试矩阵**：

| 状态 | 断言 |
| --- | --- |
| 无 token、未 onboarded | 窗口 480×640 + LoginPanel 完整可见 |
| 有 token、未 onboarded | 窗口 480×640 + OnboardingPanel |
| 有 token、已 onboarded | 窗口 80×80 + 真实灵狐悬浮球 |
| 资源 404 (mock failed image load) | PetCanvas 退回 SVG fallback，不黑屏 |

### 2.3 US-G1-3：Agent Economy → PetCreator 跳转

**改动**：`desktop/src/components/AgentEconomyPanel.tsx`

```tsx
// BEFORE
onClick={() => {
  window.dispatchEvent(new CustomEvent("agentrix:open-pet-creator"));
}}

// AFTER
onClick={() => {
  onClose();                      // ① 先关 Economy panel
  setTimeout(() => {              // ② 等 unmount 一帧
    window.dispatchEvent(new CustomEvent("agentrix:open-pet-creator"));
  }, 0);
}}
```

**测试**：`desktop/src/test/AgentEconomyPanel.test.tsx`
- mock `onClose` + global `dispatchEvent`
- 渲染空状态 → 点击 CTA → 断言 `onClose` 在 `dispatchEvent` 之前被调用

### 2.4 US-G1-4：idle timer cleanup

**改动**：`desktop/src/App.tsx` 的 `useEffect` (第 ~340 行)

当前代码：
```tsx
useEffect(() => {
  if (!panelOpen || panelMode !== "pro") return;
  const events: Array<keyof WindowEventMap> = ["mousemove", ...];
  events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
  const interval = window.setInterval(...);
  return () => {
    events.forEach((ev) => window.removeEventListener(ev, reset));  // ✅ 已正确
    window.clearInterval(interval);                                  // ✅ 已正确
  };
}, [panelMode, panelOpen, windowLabel]);
```

仔细审查后**逻辑已正确**。问题在审计文档里被标错了。但还是要：
1. 加单元测试 `desktop/src/test/idle-cleanup.test.tsx`：mount 组件 → 切到 Pro → spy `addEventListener` → unmount → 断言 `removeEventListener` 被对称调用 5 次
2. 把"误报"记到 `memories/repo/idle-timer-cleanup-2026-05-15.md`

---

## 3. Sprint G-2：上线前打磨

### 3.1 数据库 Schema：`agentrix_desktop`

**Migration**：`backend/src/migrations/1779400000000-CreateAgentrixDesktopSchema.ts`

```sql
-- Up
CREATE SCHEMA IF NOT EXISTS agentrix_desktop;

-- 1) Releases (自动更新 manifest)
CREATE TABLE agentrix_desktop.releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(32) NOT NULL,                  -- "0.2.0"
  channel VARCHAR(16) NOT NULL DEFAULT 'stable', -- 'stable' | 'beta' | 'dev'
  target VARCHAR(32) NOT NULL,                   -- 'windows' | 'darwin' | 'linux'
  arch VARCHAR(16) NOT NULL,                     -- 'x64' | 'aarch64'
  url TEXT NOT NULL,                             -- 下载链接
  signature TEXT NOT NULL,                       -- ed25519 签名 (tauri pubkey 校验)
  notes_md TEXT,
  pub_date TIMESTAMP NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (version, channel, target, arch)
);
CREATE INDEX idx_releases_active_lookup
  ON agentrix_desktop.releases (channel, target, arch, is_active, pub_date DESC);

-- 2) Crash records (崩溃聚合)
CREATE TABLE agentrix_desktop.crash_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id_hash VARCHAR(64) NOT NULL,           -- SHA256(device_id) 脱敏
  user_id UUID,                                  -- 可选；用户登录时带上
  app_version VARCHAR(32) NOT NULL,
  fingerprint VARCHAR(128) NOT NULL,             -- type + first 100 chars of message
  type VARCHAR(64) NOT NULL,                     -- 'rust_panic' | 'js_error' | 'unhandled_rejection'
  message TEXT NOT NULL,
  stack TEXT,
  location VARCHAR(255),
  os_platform VARCHAR(32),                       -- 'windows' | 'darwin' | 'linux'
  os_version VARCHAR(64),
  arch VARCHAR(16),
  occurred_at TIMESTAMP NOT NULL,
  reported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  count INT NOT NULL DEFAULT 1,                  -- 去重累加
  UNIQUE (device_id_hash, fingerprint, occurred_at) -- 同一设备同一指纹同一时间只一条
);
CREATE INDEX idx_crash_fingerprint_window
  ON agentrix_desktop.crash_records (fingerprint, reported_at DESC);
CREATE INDEX idx_crash_version
  ON agentrix_desktop.crash_records (app_version, reported_at DESC);

-- 3) Analytics events (首跑遥测，opt-in)
CREATE TABLE agentrix_desktop.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id_hash VARCHAR(64) NOT NULL,           -- 同上
  user_id UUID,
  session_id VARCHAR(64),                        -- 应用会话级，重启更新
  event_name VARCHAR(64) NOT NULL,               -- desktop_launch / desktop_login / ...
  event_props JSONB,                             -- {method, mode, version, ...}
  app_version VARCHAR(32) NOT NULL,
  os_platform VARCHAR(32),
  occurred_at TIMESTAMP NOT NULL,
  reported_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_analytics_event_time
  ON agentrix_desktop.analytics_events (event_name, reported_at DESC);
CREATE INDEX idx_analytics_device
  ON agentrix_desktop.analytics_events (device_id_hash, reported_at DESC);
```

**Down**：`DROP SCHEMA agentrix_desktop CASCADE;`

**TypeORM**：3 个 entity 文件加 `@Entity({ schema: 'agentrix_desktop', name: 'releases' })` 等。**严禁** 在 `@Column()` 写 `name: 'snake_case'`（AGENTS.md 硬规则）。

### 3.2 US-G2-2：自动更新通道

**Tauri 端**：
- `desktop/src-tauri/Cargo.toml` 加 `tauri-plugin-updater = "2"`
- `desktop/src-tauri/src/lib.rs` 注册 `.plugin(tauri_plugin_updater::Builder::new().build())`
- `tauri.conf.json` 已经配好 `endpoints` 和 `pubkey`（要把 `endpoints` 路径改成 `/api/v1/desktop/update/...`）
- 升级私钥：CI 加密注入 `TAURI_SIGNING_PRIVATE_KEY` env

**新增前端服务**：`desktop/src/services/updater.ts`

```ts
import { check } from '@tauri-apps/plugin-updater';
import { addNotification } from './notifications';

export async function bootUpdater(): Promise<void> {
  // 启动 30s 后检查
  setTimeout(async () => {
    try {
      const update = await check();
      if (!update) return;
      addNotification(
        "info",
        `🎉 新版本 v${update.version} 可用`,
        update.body || "包含 bug 修复和新功能",
        { label: "立即更新", event: "agentrix:install-update" }
      );
      window.addEventListener("agentrix:install-update", async () => {
        await update.downloadAndInstall((evt) => {
          // 显示进度 toast
        });
        await import('@tauri-apps/plugin-process').then(m => m.relaunch());
      }, { once: true });
    } catch (e) {
      console.warn("update check failed:", e);
    }
  }, 30_000);
}
```

**后端 endpoint**：`backend/src/modules/desktop-lifecycle/desktop-update.controller.ts`

```ts
@Get('desktop/update/:target/:arch/:current_version')
async checkForUpdate(
  @Param('target') target: string,
  @Param('arch') arch: string,
  @Param('current_version') currentVersion: string,
  @Query('channel') channel = 'stable',
  @Res() res: Response,
) {
  const latest = await this.releasesRepo.findOne({
    where: { target, arch, channel, isActive: true },
    order: { pubDate: 'DESC' },
  });
  if (!latest || semver.lte(latest.version, currentVersion)) {
    return res.status(204).send();
  }
  return res.json({
    version: latest.version,
    notes: latest.notesMd,
    pub_date: latest.pubDate.toISOString(),
    platforms: {
      [`${target}-${arch}`]: { signature: latest.signature, url: latest.url },
    },
  });
}
```

**灰度策略**：
- `releases` 表加 `rollout_percent INT DEFAULT 100`（先不实装 SQL，留接口扩展）
- 后端在响应前根据 `device_id_hash` 取模 100 决定是否返回（写在控制器的 `if` 里）
- v0.2.0 → v0.2.1 灰度 10 % → 验证 3 天 → 100 %

### 3.3 US-G2-3：崩溃上报

**已有**：Rust 端 `setup_panic_hook` 写文件 + `desktop_bridge_get_recent_crashes` 读取。

**新增**：
1. **JS 端 ErrorBoundary 增强**：现有 `ErrorBoundary` 添加 `componentDidCatch` 上报逻辑
2. **全局 unhandled rejection / error**：`desktop/src/services/crashReport.ts`
   ```ts
   window.addEventListener('error', (e) => reportCrash('js_error', e.error));
   window.addEventListener('unhandledrejection', (e) => reportCrash('unhandled_rejection', e.reason));
   ```
3. **上报队列**：本地 `localStorage.agentrix_crash_queue`（最多 50 条），网络 OK 后批量 POST

**后端**：
```ts
@Post('desktop/crashes')
async reportCrash(@Body() dto: CrashReportDto, @Req() req) {
  const fingerprint = sha256(`${dto.type}:${dto.message.slice(0, 100)}`);
  const deviceIdHash = sha256(dto.deviceId);

  // 10 分钟去重窗口
  const existing = await this.crashRepo.findOne({
    where: {
      deviceIdHash,
      fingerprint,
      reportedAt: MoreThan(new Date(Date.now() - 10 * 60_000)),
    },
  });
  if (existing) {
    existing.count += 1;
    await this.crashRepo.save(existing);
    return { ok: true, deduped: true };
  }

  // 路径脱敏
  const sanitizedMessage = sanitizePath(dto.message);
  const sanitizedStack = dto.stack ? sanitizePath(dto.stack) : null;

  await this.crashRepo.save({
    deviceIdHash,
    userId: dto.userId,
    appVersion: dto.appVersion,
    fingerprint,
    type: dto.type,
    message: sanitizedMessage,
    stack: sanitizedStack,
    location: dto.location,
    osPlatform: dto.osPlatform,
    osVersion: dto.osVersion,
    arch: dto.arch,
    occurredAt: new Date(dto.occurredAt),
  });
  return { ok: true };
}

function sanitizePath(text: string): string {
  // C:\Users\xxx\... → <user>\...
  return text
    .replace(/[A-Z]:\\Users\\[^\\]+/gi, '<user>')
    .replace(/\/Users\/[^/]+/g, '/Users/<user>')
    .replace(/\/home\/[^/]+/g, '/home/<user>');
}
```

### 3.4 US-G2-4：首跑遥测（opt-in）

**改动**：`desktop/src/services/analytics.ts`

```ts
// BEFORE
_enabled = localStorage.getItem("agentrix_analytics_optout") !== "1";

// AFTER (默认关闭)
_enabled = localStorage.getItem("agentrix_telemetry_opt_in") === "1";
```

**新增触发点**：
- `App.tsx` 初始化时 `trackEvent("desktop_launch", { ... })`
- `LoginPanel.tsx` 登录成功 `trackEvent("desktop_login", { method })`
- `OnboardingPanel.tsx` complete `trackEvent("desktop_onboarding_complete")`
- `ChatPanelImpl.tsx` 首次发对话 `trackEvent("desktop_first_chat", { mode })` —— 用 `localStorage.agentrix_first_chat_seen` 标志位防重
- `App.tsx` 浮球首次渲染 `trackEvent("desktop_first_pet_view")`
- `App.tsx` panelMode 变化 `trackEvent("desktop_form_switch", { from, to })`

**FirstRunTelemetryPrompt 组件**：

```tsx
// desktop/src/components/FirstRunTelemetryPrompt.tsx
// 在 onboarding 完成后第 3 天触发；非阻塞 toast 样式
export default function FirstRunTelemetryPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const completedAt = Number(localStorage.getItem('agentrix_onboarded_at') || '0');
    const promptShown = localStorage.getItem('agentrix_telemetry_prompt_shown') === '1';
    if (!completedAt || promptShown) return;
    const daysSince = (Date.now() - completedAt) / (1000 * 60 * 60 * 24);
    if (daysSince >= 3) setShow(true);
  }, []);
  // ... toast UI: [开启] → optInAnalytics() ; [先不用] → 标记 prompt_shown=1
}
```

**SettingsPanel 新增 toggle**：
```tsx
<SettingsRow
  label="发送匿名使用数据"
  hint="帮助我们改进 Agentrix。崩溃报告独立机制，仅含设备指纹。"
  checked={isOptIn}
  onChange={(v) => v ? optInAnalytics() : optOutAnalytics()}
/>
```

**后端 endpoint**：`POST /api/v1/desktop/analytics`，body 是 events 数组，批量插入。schema 见 §3.1。

### 3.5 US-G2-5：登录前本地资源

**审视**：`vite.config.ts` 默认 `publicDir = 'public'`，文件被复制到 `dist/`。✅

**问题**：CSP 头限制 `img-src 'self' data: https://*.agentrix.top` —— `self` 包含 Tauri scheme，✅ OK。

**新增检查**：
- `desktop/src/services/petAssets.ts` 启动时主动 fetch `/pets/kitsune-default.png`，失败则在 console 打 warning 并触发 `agentrix:asset-fallback` 事件
- PetCanvas 已有 `imgError` fallback，验证它确实生效

### 3.6 US-G2-6：多显示器坐标归一化

**Rust 端**：`desktop/src-tauri/src/commands.rs`
- 现有 `snap_ball_to_edge` 用 `current_monitor()` ✅
- 新增 `validate_ball_position()`：启动时调用，检查 saved position 是否在任一可用 monitor 范围内，否则重置到主屏右下角
  ```rust
  pub fn validate_ball_position(app: AppHandle) -> Result<(), String> {
      let saved = BALL_POS.lock()...;
      let Some(pos) = saved.as_ref() else { return Ok(()); };
      let monitors = app.available_monitors()?;
      let in_range = monitors.iter().any(|m| {
          let mp = m.position();
          let ms = m.size();
          pos.x >= mp.x as f64 && pos.x < (mp.x + ms.width as i32) as f64
          && pos.y >= mp.y as f64 && pos.y < (mp.y + ms.height as i32) as f64
      });
      if !in_range {
          // 重置到主屏右下角
          let main = monitors.first().ok_or("no monitor")?;
          let new_x = main.position().x as f64 + main.size().width as f64 - 100.0;
          let new_y = main.position().y as f64 + main.size().height as f64 - 100.0;
          *saved = Some(BallPosition { x: new_x, y: new_y });
      }
      Ok(())
  }
  ```
- App 启动时 `desktop_bridge_validate_ball_position`

**前端**：`desktop/src/services/monitor.ts`
- 拖拽结束 300ms debounce → `desktop_bridge_snap_ball_to_edge`（已有）
- 监听 `tauri://window-moved` 检测跨屏

### 3.7 US-G2-7：默认 VRM 资产

**资产准备**：
- 主路径：把 `deliverables/pets_v2/kitsune-C-v2-refined.glb` + `pro` + `economy` 转成 VRM
  - 工具：`vrm-converter` npm 包 / VRoid Studio 手动导入
  - 命名：`kitsune-default.vrm` / `kitsune-pro.vrm` / `kitsune-economy.vrm`
  - 上传到 `agentrix.top/assets/pets/` (S3/COS CDN)
- 退路：直接复用 `.glb`（PetVRM 已支持）
  - URL 改成 `agentrix.top/assets/pets/kitsune-default.glb`
  - localStorage 注入 `agentrix_pet_vrm_url`（renderer 接受 .glb fallback）

**petSdk.ts 修改**：

```ts
const DEFAULT_KITSUNE_VRM_URLS: Record<DesktopAppMode, string> = {
  'living-agent': 'https://agentrix.top/assets/pets/kitsune-default.vrm',
  'pro-mode':     'https://agentrix.top/assets/pets/kitsune-pro.vrm',
  'economy-panel':'https://agentrix.top/assets/pets/kitsune-economy.vrm',
};

export function bootPetSdk(): void {
  // ... 已有逻辑
  // 注入默认 VRM URL（如未设置）
  if (!localStorage.getItem('agentrix_pet_vrm_url')) {
    localStorage.setItem('agentrix_pet_vrm_url', DEFAULT_KITSUNE_VRM_URLS['living-agent']);
    void refreshPetRenderers();
  }
}

// 监听 app-mode-changed → 切换默认 URL（仅当用户没装自定义皮肤）
window.addEventListener("agentrix:app-mode-changed", (e) => {
  const mode = (e as CustomEvent).detail?.mode as DesktopAppMode;
  if (!mode) return;
  // ...
  // 只在没有 _activeSkinVariants（用户未装自定义）的时候覆盖
  if (!_activeSkinVariants && DEFAULT_KITSUNE_VRM_URLS[mode]) {
    localStorage.setItem('agentrix_pet_vrm_url', DEFAULT_KITSUNE_VRM_URLS[mode]);
    window.dispatchEvent(new CustomEvent("agentrix:pet-vrm-changed"));
  }
});
```

**PetVRM 已支持 BlendShape + .glb fallback**，不需改。

**降级链**：
1. VRM/GLB 加载成功 → 渲染 PetVRM
2. 加载失败（`loadError`）→ PetVRM 显示"VRM load failed"占位
3. 整个渲染器栈降级到 `fallback`（GPU tier 检测）→ PetCanvas PNG
4. PNG 加载失败 → SVG fallback

---

## 4. 任务拆分总览

| Sprint | US | 主要文件 | 估算 |
| --- | --- | --- | --- |
| G-1 | US-G1-1 | 写 vitest e2e + 记 memory note | 0.5 d |
| G-1 | US-G1-2 | App.tsx + 新增 SplashScreen | 0.5 d |
| G-1 | US-G1-3 | AgentEconomyPanel.tsx + test | 0.25 d |
| G-1 | US-G1-4 | App.tsx 单测 + memory note | 0.25 d |
| G-2 | US-G2-2 | tauri-plugin-updater + 后端 endpoint + entity + migration | 2 d |
| G-2 | US-G2-3 | crashReport.ts + 后端 endpoint + entity + 脱敏 | 1 d |
| G-2 | US-G2-4 | analytics.ts opt-in + 6 个埋点 + FirstRunPrompt + Settings toggle + 后端 | 1.5 d |
| G-2 | US-G2-5 | 资源加载验证 + petAssets self-check | 0.5 d |
| G-2 | US-G2-6 | validate_ball_position + 拖拽测试 | 0.5 d |
| G-2 | US-G2-7 | VRM 资产生成 + 上传 + petSdk 默认值 | 1 d |

**总计**：8 工作日 + 缓冲 2 天 = 2 周（符合 G-1+G-2 sprint 周期）

---

## 5. 关键技术决策

| 决策 | 选择 | 替代方案 | 理由 |
| --- | --- | --- | --- |
| 多窗口防重 | 修复事件路由（已做）| 加 single-instance plugin | 现有架构合理，问题在事件路由；single-instance 反而限制 dev 多窗口 |
| 自动更新插件 | tauri-plugin-updater | 自研下载器 | 官方插件已成熟，签名校验、回滚机制免费 |
| 崩溃去重 | DB-level fingerprint + count | 客户端去重 | 客户端去重对跨设备无效，DB-level 干净 |
| 遥测存储 | IndexedDB 队列 + 5min flush | 立即上报 | 离线友好；5min 可承受丢失 |
| VRM 资产 | CDN URL + localStorage | 打包进 dist/ | dist 包大小敏感（VRM ~5-10 MB × 3）；CDN 还能 hot-swap |
| schema 隔离 | `agentrix_desktop` 单独 schema | 同 public 加 `desktop_*` 前缀 | 业务边界清晰 + 未来好备份/迁移 |

---

## 6. 风险 & 缓解（与 requirements §5 同步）

| 风险 | 设计端缓解 |
| --- | --- |
| 自动更新签名错误装不上 | 灰度字段 `rollout_percent`；保留人工下载 fallback |
| 崩溃上报含敏感路径 | sanitizePath 函数 + 单测覆盖 Win/Mac/Linux 路径模式 |
| 遥测 IndexedDB 占满 | 队列上限 1000 条，超出 FIFO 丢弃 |
| VRM CDN 在国内访问慢 | 用 agentrix.top 自有 CDN（已有 .png 验证可用）|
| schema 隔离破坏 TypeORM 迁移 | migration 显式 `IF NOT EXISTS`；本地用 docker-compose 验证 |

---

## 7. 验证矩阵

### 7.1 自动化测试

| 文件 | 覆盖 |
| --- | --- |
| `desktop/src/test/floating-ball-menu.e2e.test.tsx` | US-G1-1 |
| `desktop/src/test/AgentEconomyPanel.test.tsx` | US-G1-3 |
| `desktop/src/test/idle-cleanup.test.tsx` | US-G1-4 |
| `desktop/src/test/analytics-opt-in.test.tsx` | US-G2-4 |
| `desktop/src/test/crash-sanitize.test.ts` | US-G2-3 |
| `backend/test/desktop-update.controller.spec.ts` | US-G2-2 |
| `backend/test/desktop-crash.controller.spec.ts` | US-G2-3 |
| `backend/test/desktop-analytics.controller.spec.ts` | US-G2-4 |

### 7.2 手动测试矩阵

- 双显示器 (US-G2-6)：100 % + 150 % DPI / 拔副屏
- Fresh install (US-G1-2)：Win 10 / Win 11 各一次
- Update flow (US-G2-2)：v0.2.0 → v0.2.1 OTA
- VRM render (US-G2-7)：网络断开 → fallback PNG → SVG 三级降级

完成后进入 **tasks.md** 拆解到可执行任务。
