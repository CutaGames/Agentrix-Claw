# World Engine 后续计划（2026-05-20 起）

> **状态**: Phase 1 (Wave 0-16) 已落地，等待生产 secrets 配置 + 灰度发布
> **当前生产状态**: 后端 ✅ online (PM2 pid 1671699+), 7/7 路由验证通过, feature flag 默认关闭

---

## 0. 当前阶段总览

| 阶段 | 状态 | 期望 GO/NO-GO 时点 |
|------|------|-------------------|
| **Phase 1 — 代码与基础设施** | ✅ 完成 | 2026-05-20 |
| **Phase 2 — 灰度发布与冒烟** | ⏳ Pending secrets | 2026-05-21 ~ 05-22 |
| **Phase 3 — 1% cohort 24h 软发布** | ⏳ 待开始 | 2026-05-23 |
| **Phase 4 — 10% cohort 7 天软发布** | ⏳ 待开始 | 2026-05-30 |
| **Phase 5 — 100% 全量** | ⏳ 待开始 | 2026-06-06 |
| **V5.1 sprint** | 📅 计划中 | Q3 2026 |

**Halt criteria**（任一触发即立即停止灰度并回滚）:
- 拒绝率 > 5%（人脸 / 版权 / 违禁词 / 配额 / 网络）
- p99 端到端延迟 > 2× 设计目标（Quick Scan > 60s, Detail Scan > 180s）
- Provider 成本失控告警（任意 Provider 7 日均成本超历史 3×）
- MANDATORY 属性测试任一失败

---

## 1. P0 — Go-live 阻塞项（必须在 1% cohort 前完成）

### 1.1 配置生产 secrets（Task 23.1）
**Owner**: DevOps
**ETA**: 1-2 天

需要在生产服务器（47.130.176.148）的 `.env` 或 secret manager 中配置：

```bash
# 必填（否则无法实际生成 3D）
HUNYUAN_SECRET_ID=...        # 腾讯云 AI3D 主路径
HUNYUAN_SECRET_KEY=...
MESHY_API_KEY=...            # Meshy fallback (Quick Scan only)
OPENAI_API_KEY=...           # GPT-4V for AI Interpreter
GEMINI_API_KEY=...           # Gemini Vision fallback

# 可选（增强 cn-region 合规）
BAIDU_MODERATION_API_KEY=...
ALIYUN_MODERATION_API_KEY=...

# 可选（Phase 2）
LAMBDA_LABS_API_KEY=...
RUNPOD_API_KEY=...
```

**验证步骤**:
1. `ssh ubuntu@47.130.176.148`
2. 编辑 `/home/ubuntu/Agentrix/backend/.env`
3. `pm2 restart agentrix-backend`
4. 触发一次 quick scan，验证 Hunyuan3D 调用成功（查看 `agent_cost_records` 表）

### 1.2 首次免责声明 mobile UI（R12.1）
**Owner**: Mobile dev
**ETA**: 0.5 天
**位置**: `src/screens/WorldEngineScannerScreen.tsx` 入口拦截

**实现要点**:
- 进入 Scanner 时调用 `GET /api/v1/world-engine/disclaimer/status`
- 如未确认：显示 modal（中英文双语），用户点"我同意"后调用 `POST /api/v1/world-engine/disclaimer/acknowledge`
- 已确认则直接进入 Scanner

**当前状态**: 后端 endpoint 已就绪（`ModerationService.acknowledgeDisclaimer`），mobile UI 是唯一 gap。

### 1.3 Quality Gate L2 可视化边框（R14.3）
**Owner**: Mobile dev
**ETA**: 0.5 天
**位置**: `WorldEngineScannerScreen.tsx`

**当前状态**: 评分逻辑已实现，但仅触发 haptic + 后台 console 输出，缺可视化反馈。
**需补**: 拍摄按钮外围 4 个角落或半透明边框，颜色根据 `Math.min(sharpness, exposure, angleNovelty)` 动态变化（绿 ≥70 / 黄 40-69 / 红 <40）。

### 1.4 完整 E2E 冒烟（带认证 token）
**Owner**: QA
**ETA**: 0.5 天
**已就绪**: `tests/e2e/world-engine-full-flow.smoke.mjs`

**执行命令**:
```bash
BASE_URL=http://47.130.176.148:3000 \
TEST_TOKEN_SELLER=eyJ... \
TEST_TOKEN_BUYER=eyJ... \
node tests/e2e/world-engine-full-flow.smoke.mjs
```

**期望结果**: 全部 10 个 step 通过，含完整 scan→generate→bind→battle→share→list→purchase 链路。

### 1.5 Mobile build push（Task 23.4）
**Owner**: Mobile CI
**ETA**: 自动触发
**当前状态**: ✅ 已自动触发 — push 到 `origin/main` 后 `sync-mobile-build-repo.yml` 已镜像到 `CutaGames/Agentrix-Claw`，APK CI 在公共仓库异步运行。

**验证**: 检查 https://github.com/CutaGames/Agentrix-Claw/actions 查看 build 状态。

---

## 2. P1 — 1% cohort 期间补齐项

### 2.1 分享卡片 GIF 实际渲染
**Owner**: Backend
**ETA**: 1-2 天
**位置**: `services/share.service.ts:performCardGeneration`

**当前状态**: Phase 1 仅返回 S3 占位路径 `world-engine/share/cards/{type}/{assetId}.gif`，实际未生成。
**需补**:
- 服务端 headless Three.js（Puppeteer + WebGL context）渲染 styled .glb 为 3s 1080×1080 GIF
- 叠加 stats overlay（角色名 + 前 3 属性）
- 上传到 S3，回写 cardUrl 到 cost_records

### 2.2 战斗 replay 视频 FFmpeg
**Owner**: Backend
**ETA**: 2-3 天
**位置**: `services/share.service.ts:performVideoGeneration`

**需补**:
- FFmpeg 服务端渲染（15s, 9:16, 720p）
- 输入: `battles.rounds` JSON + 角色 styled mesh
- 输出: 带 Agentrix 水印 + QR code 的 .mp4
- 写入 S3，更新 `battles.replayVideoUrl`

### 2.3 Manual review dashboard 前端
**Owner**: Web dev
**ETA**: 2 天
**位置**: 新建 `frontend/app/admin/world-engine-moderation/page.tsx`

**需补**: 列出所有 `decision='pending'` 的 `world_asset_moderation_decisions` 记录，提供 approve/reject/escalate 按钮，调用 `PATCH /api/admin/world-engine/moderation/:id`。

### 2.4 真机 FPS 性能基线 CI
**Owner**: QA / DevOps
**ETA**: 3 天
**位置**: 新建 `.maestro/perf-baseline-world-engine.yaml` + GitHub Action

**需补**:
- Maestro flow 在真机/模拟器跑：进入 Scanner → 拍 8 帧 → 进入库存 → 进入战斗
- 收集 FPS p99（应 ≥ 30），内存占用（应 ≤ 设计 §8 budget）
- 失败则 PR 阻断

---

## 3. P2 — V5.1 sprint（Q3 2026）

### 3.1 Style Renderer 真实 Blender 管线
- Phase 1 metadata-driven（客户端渲染）
- V5.1: 真实 Blender Python headless（5 风格 × 几何平滑 × 输出 .glb + 缩略图 + GIF）
- Provider: 自建 Blender worker pool 或 Modal serverless

### 3.2 GPU fallback pool（Task 23.2）
- Lambda Labs / RunPod 1× A10 24GB 起步
- 自动伸缩 1-3 实例（根据 BullMQ queue depth）
- 对接 Provider Registry healthcheck

### 3.3 Desktop World Asset 浏览器
- 高分辨率 3D 查看器（Three.js OrbitControls + 高清纹理）
- 创作者管理后台（批量重生、批量上架）
- 不增加 World Engine 主路径，仅辅助

### 3.4 战斗投注经济（Phase 2）
- 用户对异步挑战押注 AXP
- 平台抽 10%，赢家分剩余 90%
- 需要 PM 决策赔率算法 + 反作弊（同 IP / 关联账户限制）

---

## 4. P3 — V6（2027）

| 功能 | 描述 | 依赖 |
|------|------|------|
| AR 副本叠加现实 | 手机摄像头看见自己房间里的怪物 | iOS ARKit / Android ARCore |
| 多人副本 | 4 人协作通关 | WebSocket gateway 扩容 |
| Web3 NFT 桥接 | World Asset on-chain（Ethereum L2 / Solana） | 钱包合约 + 桥接 oracle |
| Glass 视觉识别推荐 | 智能眼镜看到物体推荐扫描 | Glass HUD + on-device CV |

---

## 5. 灰度发布 Runbook

### 5.1 1% cohort（24h soak）
**触发**:
```sql
-- 在 admin_configs 中开启 flag
UPDATE admin_configs
SET value = '{"enabled": true, "percentage": 1}'
WHERE key = 'world_engine_enabled';
```

**监控指标（前 24h）**:
- 转化漏斗：`GET /api/admin/world-engine/go-live-dashboard`
- 成本：`GET /api/admin/world-engine/cost-summary`
- 错误率：Sentry `world-engine` 标签
- p99 延迟：APM (Datadog) `world-engine.scan.*` metrics

**Halt 触发立即回滚**:
```sql
UPDATE admin_configs
SET value = '{"enabled": false, "percentage": 0}'
WHERE key = 'world_engine_enabled';
```

### 5.2 10% cohort（7 天 soak）
- 所有 1% 阶段指标继续监控
- 增加 GMV 监控：`SUM(marketplace_listing.price) WHERE status='sold' AND assetType='world_asset'`
- A/B baseline：与 v4 用户对比留存率（D1/D7/D30）

### 5.3 100% 全量
- Halt criteria 仍然有效
- 切换 admin dashboard 默认视图为 World Engine
- PR / 营销启动

---

## 6. 关键文件索引

### 已完成（不需要再修改）
- ✅ `backend/src/modules/world-engine/**/*.ts` (23 文件)
- ✅ `src/screens/WorldEngine*.tsx` (4 屏幕)
- ✅ `src/utils/{faceDetection,worldEngineShare,worldEngineCache}.ts`
- ✅ `shared/types/world-engine.ts` + `world-engine-api.ts`
- ✅ `backend/src/migrations/1793000000000-CreateWorldEngineTables.ts`

### 等待补完（按优先级）
- 🟥 P0: `src/screens/WorldEngineScannerScreen.tsx` — 添加首次免责声明 modal
- 🟥 P0: 同上 — Quality Gate L2 可视化边框
- 🟧 P1: `backend/src/modules/world-engine/services/share.service.ts` — 真实 GIF/MP4 渲染
- 🟧 P1: `frontend/app/admin/world-engine-moderation/page.tsx` — 新建（manual review）
- 🟨 P2: `backend/src/modules/world-engine/style-renderer/*.ts` — Blender 管线

### 文档维护
- `docs/agentrix-cross-platform-prd-v5.md` — V5 跨端 PRD（本次新建）
- `docs/mobile-prd-v5.md` — V5 移动端 PRD（本次新建）
- `docs/WORLD_ENGINE_AUDIT_2026-05-20.zh-CN.md` — Wave 0-16 audit（本次新建）
- `docs/WORLD_ENGINE_NEXT_STEPS_2026-05-20.zh-CN.md` — 本文档

---

## 7. 风险登记

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Hunyuan3D 配额不足 | 中 | 高 | Meshy 备份 + Provider Registry 自动切换；监控 Hunyuan3D quota usage |
| 用户投诉版权（米老鼠） | 中 | 中 | 关键词匹配 + manual review；保留 12 个月审计 |
| 月成本超 $5 上限 / 免费用户 | 高 | 中 | 软警告 80% + 硬阻断 100%；引导购买 AXP 配额 |
| 移动端首次扫描失败率高 | 中 | 高 | Quality Gate L2 可视化（P0）+ 离线队列 + 5 分钟自动重试 |
| Battle PRNG 被破解 | 低 | 中 | Mulberry32 seed 服务端生成；客户端无法影响；Property 1 PBT 守护 |
| Marketplace 双花 | 低 | 极高 | 两阶段提交 + @VersionColumn 乐观锁 + Property 4 PBT 守护 |
| Redis 故障 | 中 | 中 | Phase 1 in-memory fallback；Phase 2 Redis Sentinel |
| iOS App Store 拒绝（人脸扫描合规） | 中 | 高 | MLKit on-device + 不留存被拒帧；提交时携带合规说明 |

---

## 8. Sign-off

- [x] 代码: backend + mobile 已 commit + push
- [x] 测试: 4 MANDATORY property tests + 7/7 路由 smoke
- [x] 文档: V5 PRDs + audit + next steps
- [x] 部署: PM2 online，Redis 安装并运行
- [ ] **DevOps**: 配置生产 secrets（**P0 阻塞**）
- [ ] **Mobile**: 首次免责声明弹窗 + Quality Gate L2 可视化（**P0 阻塞**）
- [ ] **PM**: 决定 1% cohort 用户筛选标准（按 userId hash / 邀请码 / 内部员工）
- [ ] **QA**: 完整 E2E 冒烟通过（带 token）
- [ ] **PM**: 1% cohort go/no-go 决定（建议 2026-05-23）

---

**下一步**: 等待 DevOps 配置 secrets 后，PM 主导 go-live 决策会议。
