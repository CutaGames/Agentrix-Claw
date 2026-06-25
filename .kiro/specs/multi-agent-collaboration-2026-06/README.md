# Spec: multi-agent-collaboration-2026-06

> Sprint:Post-launch P0(launch+30-60 天)
> Branch:`perf/desktop-pre-launch-p1`(后续 sprint 会切自己的)
> 状态:**requirements drafting** (2026-05-25)

## 文档分段写作计划

requirements.md 按下面 4 段分别落地,每段独立可 review,合起来形成完整
requirements:

| 段 | 范围 | 状态 |
|---|------|------|
| **Part 1 — Foundation & Visibility (R1-R5)** | 主 chat 暴露 spawn / sub-agent 事件可见 / Agent Team 顶层 panel / WorktreeLane 显示 agent 身份 / Simple Mode "团队工作中"球 | ✅ 2026-05-25 |
| **Part 2 — Pet Bridge & Roles (R6-R8)** | Leader 派给具名 pet member / LivingPet ↔ AgentAccount 桥接 / Pro Mode 可编辑 role/prompt/budget | ✅ 2026-05-25 |
| **Part 3 — Long Tasks & Economy (R9-R11)** | 长任务后台 + companion ball / 锁屏回流 / agent_cost_records 写入 + 周报 | ✅ 2026-05-25 |
| **Part 4 — Reliability & Future Hooks (R12-R15)** | 失败 / 冲突回滚 / 跨用户 A2A v2 占位 / Pet 视角 / World Engine 整合 / Pet Arena (W8) 数据预留 | ✅ 2026-05-25 |

**Total**: 15 R(R1-R12 v1 必交付,R13-R15 v2 占位)

下一步:开 design.md(14 段,见 `MULTI_AGENT_PRIORITIZATION` §3.3)。

## design.md 进度

| Section | Range | 状态 |
|---------|-------|------|
| §0-§1 | 调研背景 + Layer 模型 + 已 ship 资产盘点 | ✅ 2026-05-26 |
| §2 | 数据模型 — 8 个新增 SQL DDL + 关系图 | ✅ 2026-05-26 |
| §3 | Spawn 协议 — `agent_run` tool + dispatch + selectMember | ✅ 2026-05-26 |
| §4 | 可见性协议 — agent_spawn/invoke/result event schema | ✅ 2026-05-26 |
| §5 | Agent_Team_Panel UI 布局 + provision flow | ✅ 2026-05-26 |
| §6 | WorktreeLane × Agent 桥接 + 数据迁移 | ✅ 2026-05-26 |
| §7 | 长任务回流 4 通道 (ball/lock/push/chat) | ✅ 2026-05-26 |
| §8 | 失败/冲突 — rollback + ConflictResolverModal | ✅ 2026-05-26 |
| §9 | Simple Mode Team_Activity_Surface | ✅ 2026-05-26 |
| §10 | Pro Mode Member_Settings_Modal + budget caps | ✅ 2026-05-26 |
| §11 | LivingPet ↔ AgentAccount 桥接 + wallet 路由 | ✅ 2026-05-26 |
| §12 | 经济属性 — cost log + 周报 + cron + CSV | ✅ 2026-05-26 |
| §13 | 跨用户 A2A v2 占位 — schema 不锁路径 | ✅ 2026-05-26 |
| §14 | World Engine 整合 (W6) + Pet Arena 数据预留 (W8) | ✅ 2026-05-26 |
| §15 | 5 open questions 默认决策记录 | ✅ 2026-05-26 |
| §16 | 每个 R 的 file-level 实现清单(给 tasks.md) | ✅ 2026-05-26 |
| §17 | Risk register (8 项 + mitigation) | ✅ 2026-05-26 |
| §18 | Out of scope 明确清单 | ✅ 2026-05-26 |

**Total**: 14 章节 + 5 章节补充(§15-§19)= 19 段 / 64.8 KB

下一步:tasks.md — Wave 1-8 拆细到子任务,每个 task 引用 R/AC ID。

## tasks.md 进度

| Wave | Range | Tasks | Requirements | 状态 |
|------|-------|-------|--------------|------|
| W0 | Pre-flight audit | 4 | foundation | ✅ 2026-05-26 |
| W1 | UI exposure + data wiring | 11 | R3, R4, R5 | ✅ 2026-05-26 |
| W2 | Spawn protocol | 11 | R1, R2 | ✅ 2026-05-26 |
| W3 | Pet bridge | 11 | R6, R7, R8 | ✅ 2026-05-26 |
| W4 | Long tasks + 4-channel | 10 | R9 | ✅ 2026-05-26 |
| W5 | Economy + reliability + ship gate | 13 | R10, R11, R12 | ✅ 2026-05-26 |
| W6 | World Engine viz (optional) | 5 | R14 | ✅ 2026-05-26 |
| W7 | Marketplace hire (post-launch) | 5 | R13 | ✅ 2026-05-26 |
| W8 | Pet Arena (post-launch) | 5 | R15 | ✅ 2026-05-26 |

**Total**: 9 waves / 84 tasks (75 sub-tasks) / 63 KB / 1102 行

v1 ship gate 在 W5 末尾(R1-R12 + 7 correctness property 全过)。
v2 (W6-W8) post-launch,W6 optional + W7/W8 each 2 sprint。

每个 task 都引用至少 1 个 R / AC ID via `_Requirements: X.Y_`,
大多数 task 还引用 design § via `_Design: §N_`。

下一步:**spec approval gate**。等 PM signoff 后,W0 开始执行。

## 关联文档

- [`docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md`](../../../docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md) — Codex/Composer/贾维斯 调研 + 5 层模型
- [`docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md`](../../../docs/MULTI_AGENT_PRIORITIZATION_2026-05-25.zh-CN.md) — 选 A 决定
- [`docs/PET_PVP_AND_SPATIAL_AI_2026-05-24.zh-CN.md`](../../../docs/PET_PVP_AND_SPATIAL_AI_2026-05-24.zh-CN.md) — Arena 在 W8 落地
- [`docs/GAMES_INVENTORY_2026-05-25.zh-CN.md`](../../../docs/GAMES_INVENTORY_2026-05-25.zh-CN.md) — 现状盘点
- [`docs/agentrix-positioning-2026-05.zh-CN.md`](../../../docs/agentrix-positioning-2026-05.zh-CN.md) — A_Path #4 = 多 agent 协作

## 已 ship 资产(直接复用,不重写)

桌面:
- `desktop/src/components/WorktreePanel.tsx` 🌿 Worktree Board
- `desktop/src/components/TaskWorkbenchPanel.tsx` 🤖 Agent Team Sandbox + `inferAgentTeamRole`
- `desktop/src/components/TaskTimeline.tsx` agent_spawn / agent_invoke / agent_result kinds
- `desktop/src/components/chatPanel/ChatTitleBar.tsx` Pro Mode More 菜单

后端:
- `backend/src/modules/agent-team/` provision + 11-agent template
- `backend/src/modules/agent-task/` worker + Bedrock + log 流
- `backend/src/modules/pet-team/` LivingPet leader/member
- `backend/src/modules/pet-a2a/` 跨 pet escrow dispatch
- `backend/src/modules/agent-orchestration/` 底层调度
- `backend/src/modules/agent-presence/` operations dashboard
