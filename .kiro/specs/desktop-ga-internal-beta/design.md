# Desktop GA Sprint G-3 — Design

> Implement notes for the 8 user stories in [requirements.md](requirements.md).

---

## 1. 架构

```
Internal Beta Distribution (US-G3-1)
  ┌──────────────────────────┐
  │ agentrix.top/download    │  → 下载页（公开）
  │ Telegram / 邀请码         │
  └────────────┬─────────────┘
               │ download click → POST /api/v1/desktop/download/track
               ▼
       agentrix_desktop.download_events  (新表)
               │
               ▼
  ┌──────────────────────────┐
  │ Tauri auto-update        │ ← /api/v1/desktop/update/* (G-2 已就绪)
  │ Crash report             │ ← /api/v1/desktop/crashes  (G-2 已就绪)
  │ Telemetry (opt-in)       │ ← /api/v1/desktop/analytics(G-2 已就绪)
  └────────────┬─────────────┘
               │
               ▼
  agentrix_desktop.{releases, crash_records, analytics_events, download_events}
               │
               ▼
  ┌──────────────────────────┐  GET /api/v1/admin/desktop/dashboard
  │ /admin/desktop 看板        │  (US-G3-2)
  │  - 崩溃 / 漏斗 / 自动更新   │
  │  - DAU / 7d 对比            │
  └──────────────────────────┘
```

---

## 2. US-G3-1：下载页 + 招募

**新表**：`agentrix_desktop.download_events`
```sql
CREATE TABLE agentrix_desktop.download_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utm_source VARCHAR(64),
  utm_campaign VARCHAR(64),
  utm_medium VARCHAR(64),
  referrer TEXT,
  user_agent_hash VARCHAR(64),  -- 防爬虫去重
  ip_country VARCHAR(8),
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dl_time ON agentrix_desktop.download_events (occurred_at DESC);
```

**新接口**：`POST /api/v1/desktop/download/track`
- 公开接口（不要求 auth）
- 接受 `{ utm_source?, utm_campaign?, utm_medium?, referrer? }`
- 用 `req.headers['cf-ipcountry']` 解析国家（Cloudflare 头）
- 返回 `{ ok: true, downloadUrl }` — 同时给前端用作真正的 redirect

**新页面**：`frontend/pages/download.tsx`
- Hero：下载按钮 + "v0.2.0 · 7 MB · Windows 10/11"
- 第二屏：SmartScreen 引导 5 步截图（"详细信息 → 仍要运行"）
- 第三屏：硬件要求（GPU tier、内存、磁盘）
- 第四屏：Telegram / Discord 链接
- 下载按钮 onClick → POST track → `window.location = downloadUrl`

**邀请码**（可选 P1）：
- 表 `agentrix_desktop.invitation_codes(code, max_uses, used_count, expires_at)`
- 下载页加 input；如果填了，验证后才放行
- 内测 100 人发 100 个唯一码

---

## 3. US-G3-2：Admin Dashboard

**新接口**：`GET /api/v1/admin/desktop/dashboard?days=7`

返回结构：
```ts
{
  generatedAt: string;
  windowDays: number;
  versionDistribution: Array<{ version: string; deviceCount: number }>;
  crashStats: {
    totalCrashes: number;
    uniqueDevices: number;
    crashRate: number;        // crashes / DAU
    topFingerprints: Array<{ fingerprint: string; type: string; sampleMessage: string; count: number }>;
    delta7dPercent: number;
  };
  funnel: {
    launches: number;
    logins: number;
    onboardingsComplete: number;
    firstChats: number;
    loginRate: number;
    onboardingRate: number;
    firstChatRate: number;
  };
  updateStats: {
    available: number;       // count of update-check 200 responses
    installed: number;       // desktop_update_installed events
    failed: number;          // desktop_update_failed events
    successRate: number;
    failuresByReason: Array<{ reason: string; count: number }>;
  };
  dau: { current: number; delta7dPercent: number };
  downloads: { current: number; bySource: Array<{ source: string; count: number }> };
  alerts: Array<{ severity: 'info'|'warn'|'crit'; message: string }>;
}
```

**SQL（关键查询）**：
```sql
-- DAU
SELECT COUNT(DISTINCT device_id_hash) AS dau
FROM agentrix_desktop.analytics_events
WHERE event_name = 'desktop_launch'
  AND reported_at > NOW() - INTERVAL '24 hours';

-- 崩溃 Top 10
SELECT fingerprint, type, MIN(message) AS sample_message, SUM(count) AS total
FROM agentrix_desktop.crash_records
WHERE reported_at > NOW() - INTERVAL '7 days'
GROUP BY fingerprint, type
ORDER BY total DESC
LIMIT 10;

-- 漏斗
SELECT
  COUNT(*) FILTER (WHERE event_name='desktop_launch') AS launches,
  COUNT(*) FILTER (WHERE event_name='desktop_login') AS logins,
  COUNT(*) FILTER (WHERE event_name='desktop_onboarding_complete') AS onboardings,
  COUNT(*) FILTER (WHERE event_name='desktop_first_chat') AS first_chats
FROM agentrix_desktop.analytics_events
WHERE reported_at > NOW() - INTERVAL '7 days';
```

**Admin 模块**：放到 `backend/src/modules/desktop-admin/`
- Guard：复用 `JwtAuthGuard` + 检查 `user.role === 'admin'`
- Service 缓存 60s（看板没必要实时秒级）

**前端页面**：`frontend/pages/admin/desktop.tsx`
- 复用现有 admin 框架（layout / sidebar）
- 用 chart.js 或 recharts 画柱状图 / 趋势线
- 顶部告警 bar：崩溃率 ≥ 0.5% 红 / 0.3-0.5% 黄 / < 0.3% 绿

---

## 4. US-G3-3：VRM 资产实装

**资产生成流程**：
```
1. 拿到 deliverables/pets_v2/kitsune-C-v2-refined.glb (default)
   + kitsune-pro.glb + kitsune-economy.glb (G-1 时已生成)
2. VRoid Studio 导入 .glb → 设置 humanoid bones → 导出 .vrm
   备选：vrm-converter npm 包，命令行批转
3. 上传到 agentrix.top 静态目录 /assets/pets/
   - kitsune-default.vrm (~3-5 MB 目标)
   - kitsune-pro.vrm
   - kitsune-economy.vrm
4. 配 CDN 缓存（max-age=86400 即 1 天）
5. 验证 PetVRM 加载：
   localStorage.setItem('agentrix_pet_vrm_url', 'https://agentrix.top/assets/pets/kitsune-default.vrm');
   重启 → 浮球渲染真实 3D
```

**退路**（如果 VRM 转换有难度）：
- 直接以 .glb 提供（PetVRM 检测 `gltf.userData.vrm` 不存在时走 plain GLB 路径，已实装）
- URL 用 .vrm 后缀但实际是 .glb 内容也行（PetVRM 不严格校验后缀）

**petSdk.ts 已就绪**：
- `bootPetSdk()` 自动 seed `localStorage.agentrix_pet_vrm_url`
- `agentrix:app-mode-changed` 事件触发时切换默认 URL（mode → variant）
- 用户上传自定义皮肤后不会被覆盖（检测 URL 是否在 default 列表内）

**测试清单**：
- [ ] DevTools 看到 `kitsune-default.vrm` 200
- [ ] 切 Pro 模式 → URL 变成 `kitsune-pro.vrm`
- [ ] 拔网络 → 静默降级 PetCanvas PNG
- [ ] BlendShape 测试：`window.dispatchEvent(new CustomEvent('agentrix:pet-state', { detail: { emotion: 'happy', ... } }))` → 笑

---

## 5. US-G3-4：Windows 代码签名

**方案 A：Azure Trusted Signing（默认）**

GitHub Actions 步骤：
```yaml
- name: Azure Login
  uses: azure/login@v2
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUB_ID }}

- name: Sign with Azure Trusted Signing
  uses: azure/trusted-signing-action@v0.5
  with:
    azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
    azure-client-secret: ${{ secrets.AZURE_CLIENT_SECRET }}
    endpoint: https://eus.codesigning.azure.net/
    trusted-signing-account-name: agentrix-signing
    certificate-profile-name: agentrix-prod
    files-folder: desktop/src-tauri/target/release/bundle/nsis
    files-folder-filter: exe
    files-folder-recurse: true
```

**方案 B：EV cert（兜底）**
- DigiCert 或 Sectigo 申请（5-7 个工作日）
- 硬件 token 存到保险柜（HSM 推荐）
- 用 `signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a setup.exe`

**验证**：
```powershell
signtool verify /pa /v "Agentrix Desktop_v0.2.1_x64-setup.exe"
# 期望: Successfully verified
```

---

## 6. US-G3-5：自动更新灰度

**runbook**：`docs/RUNBOOK_AUTO_UPDATE_ROLLOUT.zh-CN.md`

灰度 SQL：
```sql
-- 第 1 天：10% 灰度
INSERT INTO agentrix_desktop.releases (version, channel, target, arch, url, signature, notes_md, rollout_percent, is_active)
VALUES ('0.2.1', 'stable', 'windows', 'x86_64',
        'https://agentrix.top/downloads/desktop/Agentrix Desktop_0.2.1_x64-setup.exe',
        '<ed25519 signature from CI>', 'Bug 修复 + xxx', 10, true);

-- 老版本不再 active（可选；保留以便回滚）
UPDATE agentrix_desktop.releases SET is_active = false
WHERE version = '0.2.0' AND target = 'windows' AND arch = 'x86_64';

-- 第 4 天：观测 3 天稳定后扩到 100%
UPDATE agentrix_desktop.releases SET rollout_percent = 100
WHERE version = '0.2.1' AND target = 'windows' AND arch = 'x86_64';
```

**回滚**：
```sql
-- 紧急情况：回滚到 v0.2.0
UPDATE agentrix_desktop.releases SET is_active = false WHERE version = '0.2.1';
UPDATE agentrix_desktop.releases SET is_active = true WHERE version = '0.2.0';
```

**监控**：通过 admin 看板的 `updateStats.successRate`，< 90% 自动告警 Telegram。

---

## 7. US-G3-6 + 7：用户手册 + FAQ

文档结构：
```
docs/
├── USER_MANUAL_DESKTOP_V4.zh-CN.md       (主文档，Markdown)
│   ├── 1. 安装与启动
│   ├── 2. 浮球（萌态 / 专家态 / 商人态）
│   ├── 3. Pro Mode + 标题栏
│   ├── 4. 输入区与发送
│   ├── 5. 25 个面板逐一说明
│   ├── 6. 9 个全局快捷键
│   ├── 7. 隐私与遥测
│   ├── 8. 自动更新
│   └── 9. 故障排除
├── FAQ_DESKTOP.zh-CN.md                  (FAQ 20+ 条)
└── RUNBOOK_AUTO_UPDATE_ROLLOUT.zh-CN.md  (运营 runbook)
```

文档发布：
- markdown 文件先合到 git
- 后续 web 项目 `frontend/pages/help/[slug].tsx` 把 markdown 渲染成 SEO 友好页面
- agentrix.top/help/desktop 直接打开 USER_MANUAL_DESKTOP_V4

---

## 8. US-G3-8：稳定性观测

每日跑：
```sql
-- 崩溃率
SELECT
  app_version,
  SUM(count) FILTER (WHERE reported_at > NOW() - INTERVAL '24 hours') AS crashes_24h,
  (SELECT COUNT(DISTINCT device_id_hash)
   FROM agentrix_desktop.analytics_events
   WHERE event_name='desktop_launch' AND reported_at > NOW() - INTERVAL '24 hours') AS dau,
  ROUND(SUM(count) FILTER (WHERE reported_at > NOW() - INTERVAL '24 hours')::numeric
        / NULLIF((SELECT COUNT(DISTINCT device_id_hash)
                  FROM agentrix_desktop.analytics_events
                  WHERE event_name='desktop_launch'
                    AND reported_at > NOW() - INTERVAL '24 hours'), 0), 4) AS crash_rate
FROM agentrix_desktop.crash_records
WHERE app_version LIKE '0.2.%'
GROUP BY app_version;
```

写到 `tests/reports/INTERNAL_BETA_DAILY_<date>.md`，运营负责。

---

## 9. 任务依赖

```
Task 1 (download events table) ──┐
Task 2 (download tracking API) ──┴──→ Task 3 (download page)
Task 4 (admin dashboard SQL) ────────→ Task 5 (admin dashboard page)
Task 6 (VRM asset upload) ───────────→ Task 7 (VRM verification)
Task 8 (Azure signing setup) ────────→ Task 9 (signed v0.2.1 build)
Task 10 (rollout runbook) ───────────→ Task 11 (灰度发布)
Task 12 (user manual) ────────┬──→ Task 14 (官网集成)
Task 13 (FAQ) ────────────────┘
Task 15 (daily monitoring) ──────────→ Task 16 (GA gate review)
```

Task 1-5 是关键路径（看板必须先有，否则看不到内测数据）。Task 6-7 也是关键路径（VRM 是核心卖点）。Task 8-11 是上线门槛。Task 12-14 是用户支持。Task 15-16 是 gate。
