# Sprint G-3 — Tasks

> 实施清单。引用 [requirements.md](requirements.md) 和 [design.md](design.md)。
> 周期：2026-05-20 → 2026-06-02 (10 工作日)。

---

## 阶段 1：下载渠道 + 招募（2 d）

### Task 1: download_events 表 + 接口
**关联**：US-G3-1
- [x] 1.1 创建 migration `1791000000001-AddDesktopDownloadEvents.ts` 加 `download_events` 表 + 索引
- [x] 1.2 创建 entity `desktop-download-event.entity.ts`
- [x] 1.3 在 `DesktopLifecycleModule` 加新 service + controller
- [x] 1.4 实现 `POST /api/v1/desktop/download/track`（公开接口，无需 auth）
- [x] 1.5 单元测试：去重、CF country header 解析

### Task 2: 下载页 `/download`
**关联**：US-G3-1
- [x] 2.1 新建 `frontend/pages/download.tsx`
- [x] 2.2 Hero + 下载按钮 → onClick → POST track → redirect
- [x] 2.3 SmartScreen 引导 5 张占位图 + 文案
- [x] 2.4 硬件要求展示
- [x] 2.5 Telegram / Discord 链接
- [x] 2.6 SEO meta（og:title / og:image）

### Task 3: 邀请码（可选 P1）
- [ ] 3.1 邀请码表 + service _(P1, 推到 G-4)_
- [ ] 3.2 Generate 100 个码，记到 spreadsheet
- [ ] 3.3 下载页加 input 校验

---

## 阶段 2：Admin 数据看板（2 d）

### Task 4: 看板聚合 API
**关联**：US-G3-2
- [x] 4.1 创建 `backend/src/modules/desktop-admin/`
- [x] 4.2 `desktop-admin.controller.ts` + `desktop-admin.service.ts`
- [x] 4.3 实现所有 SQL（version distribution / crash stats / funnel / update stats / DAU / downloads）
- [ ] 4.4 Cache 60s（@nestjs/cache-manager）_(待加，先跑通主流程)_
- [x] 4.5 admin guard：JwtAuthGuard + AdminGuard role check
- [x] 4.6 单元测试覆盖（mock repo · 3 测试）

### Task 5: 看板前端页
**关联**：US-G3-2
- [x] 5.1 `frontend/pages/admin/desktop.tsx`
- [x] 5.2 复用现有 admin token 认证
- [x] 5.3 各模块卡片（崩溃 / 漏斗 / 自动更新 / DAU / 下载）
- [ ] 5.4 用 recharts 画趋势线 _(P1 推到 G-4，先用静态数字)_
- [x] 5.5 顶部告警 bar（红/黄/绿）
- [x] 5.6 7 天 vs 上 7 天对比 ↑/↓

---

## 阶段 3：VRM 资产实装（1.5 d）

### Task 6: VRM 资产生成 + 上传
**关联**：US-G3-3
- [ ] 6.1 用 VRoid Studio / vrm-converter 把 `deliverables/pets_v2/kitsune-{C-v2-refined,pro,economy}.glb` 转 .vrm
- [ ] 6.2 验证文件 < 5 MB（gzip 压缩）
- [ ] 6.3 上传到 `agentrix.top/assets/pets/kitsune-{default,pro,economy}.vrm`
- [ ] 6.4 设 CDN 缓存 max-age=86400
- [ ] 6.5 退路：直接以 .glb 提供（PetVRM 已支持）

### Task 7: VRM 渲染验证
**关联**：US-G3-3
- [ ] 7.1 v0.2.0 已装机情况下，删除 `localStorage.agentrix_pet_vrm_url` 重启 → 看是否自动 seed
- [ ] 7.2 切到 Pro mode → URL 变 `kitsune-pro.vrm`
- [ ] 7.3 切到 Economy panel → URL 变 `kitsune-economy.vrm`
- [ ] 7.4 模拟 404 → fallback PNG（DevTools Block request）
- [ ] 7.5 BlendShape：派发 `agentrix:pet-state happy` → 笑

---

## 阶段 4：代码签名 + v0.2.1 发版（2 d）

### Task 8: Azure Trusted Signing 设置
**关联**：US-G3-4
- [ ] 8.1 在 Azure 申请 Trusted Signing 账号（同步开始，等审核 5-10 天）
- [ ] 8.2 创建 cert profile `agentrix-prod`
- [ ] 8.3 配置 GitHub Actions secrets：`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET`

### Task 9: CI 签名集成
**关联**：US-G3-4
- [ ] 9.1 修改 `.github/workflows/build-desktop.yml`：在 NSIS step 后加 Azure 签名 step
- [ ] 9.2 加 `signtool verify /pa` 验证 step
- [ ] 9.3 测试：触发 release tag → 看到产出包是签名的
- [ ] 9.4 在 5 台干净 Win 11 跑：双击 → SmartScreen 行为记录

### Task 10: v0.2.1 发版（先签名再灰度）
**关联**：US-G3-5
- [ ] 10.1 整理 G-2 内测反馈的 P0/P1 列表 → 修复
- [ ] 10.2 bump 0.2.0 → 0.2.1，build 签名包
- [ ] 10.3 上传到 `agentrix.top/downloads/desktop/`
- [ ] 10.4 INSERT 到 `agentrix_desktop.releases` 表，`rollout_percent = 10`
- [ ] 10.5 先 UPDATE v0.2.0 `is_active = false`，避免老版本同时 serve

### Task 11: 自动更新灰度上线
**关联**：US-G3-5
- [x] 11.1 写 runbook `docs/RUNBOOK_AUTO_UPDATE_ROLLOUT.zh-CN.md`
- [ ] 11.2 第 1 天 rollout 10% → 监控 `desktop_update_*` 三个事件 _(等 v0.2.1 build 出来后)_
- [ ] 11.3 第 4 天评估：成功率 > 90% → UPDATE 100%
- [ ] 11.4 第 7 天复盘 → 写到 `tests/reports/AUTO_UPDATE_BETA_REPORT.md`
- [ ] 11.5 紧急回滚演练：UPDATE rollback SQL 在 staging 验证一次

---

## 阶段 5：用户文档（2 d，与签名并行）

### Task 12: 用户手册 v2
**关联**：US-G3-6
- [ ] 12.1 写 `docs/USER_MANUAL_DESKTOP_V4.zh-CN.md`
  - 第 1 章：安装与启动（含 SmartScreen 引导）
  - 第 2 章：浮球（萌态/专家态/商人态 + 12 个右键菜单）
  - 第 3 章：Pro Mode + 18 个标题栏按钮
  - 第 4 章：输入区与发送（语音/附件/Tier/Mode）
  - 第 5 章：25 个面板逐一说明（衣柜/灵魂/Creator/Memory/Wiki/MCP …）
  - 第 6 章：9 个全局快捷键
  - 第 7 章：隐私与遥测设置
  - 第 8 章：自动更新流程
  - 第 9 章：故障排除入口
- [ ] 12.2 占位 `[图片：xxx]` 等待设计师补图
- [ ] 12.3 找 3 个内测用户读文档自助安装 → 收集"读完仍要问"的问题

### Task 13: FAQ
**关联**：US-G3-7
- [ ] 13.1 写 `docs/FAQ_DESKTOP.zh-CN.md`，至少 20 条
  - 安装类 5 条
  - 启动类 3 条
  - 登录类 3 条
  - 浮球 / 多显示器 3 条
  - 对话 / 萌宠 3 条
  - 经济 / AXP 2 条
  - 自动更新 / 隐私 1 条
- [ ] 13.2 每条 Q + A + （可选）截图
- [ ] 13.3 每天根据群问题补 1-2 条

### Task 14: 官网集成
**关联**：US-G3-6
- [ ] 14.1 `frontend/pages/help/[slug].tsx` 通用 markdown 渲染器
- [ ] 14.2 `agentrix.top/help/desktop` 渲染用户手册
- [ ] 14.3 `agentrix.top/help/desktop/faq` 渲染 FAQ
- [ ] 14.4 SEO（标题/og/sitemap）

---

## 阶段 6：稳定性观测 + GA Gate（1.5 d）

### Task 15: 每日观测
**关联**：US-G3-8
- [x] 15.1 写每日 SQL 报告脚本 `scripts/daily-internal-beta-report.ts`
- [x] 15.2 自动写到 `tests/reports/INTERNAL_BETA_DAILY_<date>.md`
- [ ] 15.3 配 cronjob: 每天早 9 点跑 + Telegram 推送给运营 _(部署到 prod 后再起 cron)_
- [x] 15.4 关键指标失效自动告警（崩溃率 > 0.5% / 自动更新成功率 < 90% → 退出码 1 触发 cron 邮件 + Telegram digest）

### Task 16: GA Gate 评审
**关联**：US-G3-8
- [ ] 16.1 7 天后聚合数据
- [ ] 16.2 与 GA 触发线对比
- [ ] 16.3 写 `tests/reports/GA_READINESS_<date>.md`
- [ ] 16.4 团队会议决策：进入 G-4 / 延期 7 天 / 修 v0.2.2

---

## 任务总览

| 阶段 | 任务数 | 后端 | 前端 | 文档 | 运营 | 工天 |
| --- | --- | --- | --- | --- | --- | --- |
| 1. 下载渠道 | 3 | 1 | 1 | 0 | 1 | 2 |
| 2. Admin 看板 | 2 | 1 | 1 | 0 | 0 | 2 |
| 3. VRM 资产 | 2 | 0 | 1 | 0 | 1 | 1.5 |
| 4. 签名 + 发版 | 4 | 0 | 0 | 1 | 1 | 2 |
| 5. 文档 | 3 | 0 | 1 | 2 | 0 | 2 |
| 6. 观测 + Gate | 2 | 1 | 0 | 0 | 1 | 1.5 |
| **合计** | **16** | **3** | **4** | **3** | **4** | **11** |

预留缓冲 1 天，总 12 天稍超 10 天 sprint 范围。如必要，邀请码 (Task 3) 和官网集成 (Task 14) 可以推到 G-4。

---

## DoD

- 每个 task 完成后：
  - 关联 US 在 requirements.md 打钩
  - 改动文件 build / test 通过
  - 内部 demo 在团队群同步
- Sprint 结束时：
  - 100 内测用户 device_id_hash 数据沉淀
  - GA 触发线 4 个指标全部达成
  - 用户手册 + FAQ 已上线 agentrix.top
  - 已签名的 v0.2.1 跑过 7 天 OTA 灰度
