# Spec A — P1 Finalization + P2 Self-Evolution Dashboard Shipped (2026-05-24)

## TL;DR

P1 计划项中"backend agent-task worker"**实际早已 ship**(commit `a15408566`
在 main,生产 `/api/agent-tasks` 401 = OK)。本 sprint 实际完成 P2 的核心
增量项:**Self-Evolution Dashboard 公开化** + Marketplace 闭环 audit。

Branch: `perf/desktop-pre-launch-p1`
Predecessor: `a5e94ae0c`(roadmap 对账)

## P1 状态(已 ship,无新动作)

- ✅ `agent-task` 模块完整(controller + service + worker)
- ✅ Worker 单进程 poll + `FOR UPDATE SKIP LOCKED` 多实例安全
- ✅ Bedrock LLM 调用 + 5min timeout + 错误处理 → status=failed
- ✅ 生产部署:`https://api.agentrix.top/api/agent-tasks` 401(已 deploy)
- ✅ Concurrency cap = `AGENT_TASK_MAX_PARALLEL`(默认 2)

需要的话上线后**手动 hit `/api/agent-tasks` 创建一个 stub task** 验证 worker
真的在 spinning(已通过认证 token)。本 sprint 不阻塞。

## P2 已落地(本 sprint)

### 1. Self-Evolution Dashboard(差异化 #5 的能见度)

新文件:

- `desktop/src/services/selfEvolution.ts`
  - `fetchDreamingStats(token)` — `/api/dreaming/stats`
  - `fetchMemoryStats(token)` — `/api/v1/memory/stats`(支持 `{tier:n}` 与 `{stats:{...}}` 两种返回结构)
  - `fetchWikiGraph(token)` — `/api/memory-wiki/graph`(自计算 top-pages by inbound count)
  - `fetchSelfEvolutionSnapshot(token)` — Promise.all 并行
- `desktop/src/components/SelfEvolutionDashboardPanel.tsx`
  - Hero 3 stat cards:总记忆 / 梦境次数 / Wiki 网络
  - 4 层记忆 bar chart(session / working / longterm / wiki,带颜色)
  - Wiki Top-N 引用最多页面
  - 梦境状态分布
  - 空数据态友好文案("继续聊会儿吧")
  - Esc / 点击外部关闭
  - createPortal,full-screen modal

集成:

- `ChatTitleBar.tsx`:More 菜单加 `🌱 Self-Evolution`(tier=standard,Standard / Pro 都可见)
- `ChatPanelImpl.tsx`:`selfEvolutionPanelOpen` state + render

### 2. Marketplace + Living Pet 闭环 audit

新文件:`docs/MARKETPLACE_PET_AUDIT_2026-05-24.zh-CN.md`

主要发现:**代码闭环已存在**——3 个 marketplace 模块 + 17 个 pet-* 模块 +
11 个 web 路由 + 跨端 desktop / mobile 入口齐全。**P2 不再是"造闭环",而是
"基于真实数据的运营调整"**。剩余真正缺口仅 3 项,其中 Toy BLE 需硬件,
其余 launch 后再做。

## 验证

- `validate-positioning.mjs`: 12/12 PASS
- `tsc --noEmit`: clean
- vitest: 91/91 PASS

## 不在本 sprint(P3 留下次)

- VS Code / Cursor 扩展(P3,新项目脚手架)
- IdeBridge 双向桥接(P3,协议层 + 桌面反向 RPC)
- Coding_Plan_Revenue 归因脚本(launch 后 30 天数据驱动)
- Toy BLE / Wi-Fi(P2 阻塞项,需硬件)

## 重要 Gotcha

- `apiFetch` + `API_BASE` 在 `desktop/src/services/store.ts`,新 API client
  必须从这里 import,**不要**写裸 `fetch`。
- backend `/api/v1/memory/stats` vs `/api/memory-tiers/stats` 路由前缀差异:
  实际是 `v1/memory`(模块 controller 上 `@Controller('v1/memory')`)。
- backend `dreaming.controller.ts` 的 `@Controller('dreaming')` 没 v1 前缀,
  与 `memory-tiers` 不一致——前端 `/dreaming/stats` vs `/v1/memory/stats`
  两个路径都对。
- backend `memory-wiki.controller.ts` 的 `@Controller('memory-wiki')`,
  路径是 `/memory-wiki/...`。
- 这三个端点的根 prefix 都是 `/api`(NestJS global prefix 在 main.ts
  设置,见 `setGlobalPrefix('api')`)。
- 三个端点都用 `JwtAuthGuard`,前端 client 必须传 `Authorization: Bearer
  <token>`,fan-out 时如果某个端点 401 不要整体失败(safeFetch 已处理)。

## 下一步建议

- 跑桌面端本地构建 .exe + manual UI 检查 SelfEvolutionDashboard 真的能
  open / fetch / render
- 然后启动 Spec B(P3 C_Path):VS Code 扩展 MVP + IdeBridge 协议层
