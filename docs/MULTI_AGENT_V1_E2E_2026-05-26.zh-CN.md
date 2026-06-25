# Multi-Agent v1 E2E 测试计划 (2026-05-26)

> **Spec**: `multi-agent-collaboration-2026-06`
> **Wave**: V1 ship gate (W1-W5 完成)
> **Branch**: `perf/desktop-pre-launch-p1`
> **Desktop version**: v0.7.1
> **Backend**: prod `47.130.176.148` PM2 `agentrix-backend`
> **Backend version**: 7.0.0 (multi-agent v1 routes registered)

## 0. 准备 (5 min)

1. 装 `Agentrix Desktop_0.7.1_x64-setup.exe`(本地路径
   `desktop/src-tauri/target/release/bundle/nsis/`)
2. 用一个有 LivingPet + 已经 provisionTeam 的账号登录
3. 切换 chat 到云端模式 (Claude Sonnet 4.6 推荐)
4. 打开 **Pet 详情** 看一下 `pet.bound_agent_account_id` 当前 NULL
   (verify: pre-bind state)

## 1. W1 — Schema + Agent Team Panel + Simple Mode badge

| # | 验证项 | 期望 | Pass? |
|---|--------|------|-------|
| 1.1 | 主对话窗口 More 菜单 → "🤖 Agent 团队" | 打开 AgentTeamPanel 抽屉 | |
| 1.2 | AgentTeamPanel 顶部 tabs 显示 `Active / Arena (v2) / Ladder (v2)` | v2 placeholder 灰色 | |
| 1.3 | Active tab 渲染 Leader + Members + Active Sub-Tasks 三段 | 正常 | |
| 1.4 | 切到 Simple Mode → Pet 浮窗左上角应**没**有 badge | 无活动子任务时不渲染 | |
| 1.5 | 任意 worktree-lane 接桥 sub-task → Simple Mode 出现红色 数字 badge | 3 秒内出现 | |
| 1.6 | 点击 badge → 派发 `agentrix:open-team-activity-surface` | (currently no listener — placeholder OK) | |

## 2. W2 — Spawn dispatcher + agent_run + timeline

需要云端 chat 模式,Agent Team 已 provision,Pet 已绑定成员。

| # | 验证项 | 期望 | Pass? |
|---|--------|------|-------|
| 2.1 | 让 Leader 调用工具:"派 researcher 调查 X 主题" | LLM 调 `agent_run` tool → 返 `subTaskId` | |
| 2.2 | Chat 内出现 `[sub-task #abc12345]` 蓝色 chip | clickable | |
| 2.3 | 点击 chip → TaskTimeline 自动滚到对应行 | 滚动 + highlight 效果 | |
| 2.4 | TaskTimeline 行内显示 actor (AgentIdentityCard) + 状态 emoji + 时长 | sm 头像渲染 | |
| 2.5 | 子任务完成后 TaskTimeline 行加绿色 cost chip `$0.0xxx` | 1 秒内出现 | |
| 2.6 | 连续派 5 个 sub-task → 第 5 个被拦下 `spawn_rate_limited` warning | inline streamFeedback warning | |
| 2.7 | 派一个 budget_usd=15 → 弹"🔐 子任务预算 $15.00 需要审批" | client 拦下,server 也会 HTTP 402 | |
| 2.8 | 后端 401 unprotected: `curl POST /api/agent-tasks/spawn -d {}` | 返 401 (路由 OK) | |

## 3. W3 — Pet bridge

| # | 验证项 | 期望 | Pass? |
|---|--------|------|-------|
| 3.1 | AgentTeamPanel → "🦊 把我的宠物加入团队" 按钮 | 显示 | |
| 3.2 | 点击 → confirm 弹窗 "你的所有 LivingPet 即将成为 Agent Team 成员…" | 确认后绑定 | |
| 3.3 | 绑定成功 → "✅ 已将 N 只宠物绑定为成员" | 来自 backend response | |
| 3.4 | DB 验证: `\d living_pets` 有 `bound_agent_account_id` 列 | psql 查询 | |
| 3.5 | DB 验证: `pet_team_members.bound_agent_account_id` 已写值 | psql 查询 | |
| 3.6 | 派一个 role="coder" sub-task → backend selectMember 选中 pet member,不是 anonymous | 验证 `agent_tasks.target_kind = 'team-member'` | |
| 3.7 | 子任务完成 → pet `intimacy_xp += 1` + `last_interaction_at` updated | psql 查询 | |
| 3.8 | Pro Mode → AgentIdentityCard 上点 [Edit] → MemberSettingsModal 打开 | modal 渲染 | |
| 3.9 | Modal 改 dailyBudgetUsd 设 25 → save | Pro cap = $20,会显示错误 "Daily budget must be 0.10 - 20.00 for pro tier" | |
| 3.10 | 改 dailyBudgetUsd 设 15 → save | 保存成功,关闭 modal | |
| 3.11 | Backend 再次 PATCH dailyBudgetUsd=30(绕过 client cap) → 返 400 budget cap error | server 强制 enforcement (W5.7 currently hard-coded free $2 cap; expect 400) | |
| 3.12 | Pet 详情 unbind: `POST /api/agent-teams/unbind-pet/:id` → success | LivingPet.bound = null,AgentAccount status = revoked,history 保留 | |

## 4. W4 — Long-task ball pulse + push

| # | 验证项 | 期望 | Pass? |
|---|--------|------|-------|
| 4.1 | 派一个长任务(prompt: "请慢慢思考 30 秒后回复…") → 触发 30s+ | TaskTimeline 显示 spinner,主 chat 不阻塞 | |
| 4.2 | sub-task 成功完成 → CompanionBall 周围出现 1 秒绿色 pulse ring | 视觉确认 | |
| 4.3 | sub-task 失败 → 红色 pulse 800ms | 视觉确认 | |
| 4.4 | 强制 60min stalled task (mock: 直接 SQL 把 started_at 改老) → cron 5 min 后 emit stalled | 验证: amber pulse | |
| 4.5 | 移动端登录后 sub-task 完成 → 收到 push notification "🦊 sub-task 完成" + deeplink | iOS/Android 收到 | |
| 4.6 | desktopAgentSync.refreshState 不再产生 "Session not found" 刷屏 | chat 列表干净 | |

## 5. W5 — Economy + reliability + summary

| # | 验证项 | 期望 | Pass? |
|---|--------|------|-------|
| 5.1 | psql `\d agent_cost_records` 有 `parent_task_id, event_type` 列 | column 存在 | |
| 5.2 | psql `\d pet_productivity_snapshot` 表存在 + index | 表 + 3 个 index | |
| 5.3 | 派 sub-task → DB `agent_cost_records WHERE parent_task_id=<id>` 有 N 行 llm_call | 验证 N 行 + 1 行 sub_task_complete | |
| 5.4 | sub_task_complete 行 `cost_usd` = SUM 所有 llm_call 行 | 数学验证 | |
| 5.5 | AgentTeamPanel 顶部:Pro Mode 看 TeamWeeklyCard | 数字 + Top 3 pets + Top 3 expensive | |
| 5.6 | TeamWeeklyCard "⤓ CSV" 按钮 | 浏览器下载 `agentrix-team-activity-YYYY-MM-DD.csv` | |
| 5.7 | CSV 包含 header + 30 天 sub-task 记录 | 用 Excel 打开验证 | |
| 5.8 | 切到 Simple Mode → "本周阿喵帮你完成了 N 件事 ✨" 单行(无 USD) | R11.5 验证 | |
| 5.9 | 设 `AGENTRIX_DAILY_BUDGET_USD=0.50` → 第二个 sub-task 派发返 402 budget_exhausted | client 收 budget_pending error | |
| 5.10 | 80% threshold 触发 → 客户端收 budget-warning DOM event | 视觉确认(banner 或 toast) | |

## 6. 7 个 Correctness Property regression

| # | Property | 验证 |
|---|----------|------|
| P1 | parent_task_id 不允许 cycle | 用 SQL 设 task A.parent=B + B.parent=A → server detectCycle 返 BadRequest |
| P2 | 5 concurrent spawn → 第 5 拦下 | 已在 2.6 验证 |
| P3 | DB outage 期间 sub-task 完成 → 不丢失 cost(写入 DLQ) | (v1 暂用 logger.warn 而非 DLQ;验证 worker 不 crash + summary row write 失败 logs OK) |
| P4 | 两 worker 同时 grab 同 task → SKIP LOCKED 保证只有 1 个 | psql `EXPLAIN` 看 FOR UPDATE SKIP LOCKED 在 query plan 里 |
| P5 | Simple Mode UI snapshot 无 agentId / branch / USD 泄露 | grep DOM dump 0 命中 |
| P6 | `npm run lint:forbid-v2` 返 0 | exit 0 |
| P7 | spawn → ball badge 内 3 秒更新 | wall-clock 验证(throttle 3 s) |

## 7. 退出准则 (V1 ship gate)

✅ 所有 sec 1-6 全 pass
✅ Property P1-P7 全 pass
✅ 真机装好 .exe 至少跑 30 分钟无 crash
✅ Backend logs 无 ERROR-level multi-agent 异常 (warn 级别 OK)
✅ DB 无 column does not exist 报错

满足以上 → tag `v1-multi-agent-ship-2026-05-26`,push tag,**multi-agent
v1 正式 ship**。

## 8. 已知 deferred items (不阻塞 v1 ship)

- W5.10 out-of-scope detection: v1 worker 仅 LLM 文本输出,无文件写,
  workspace_paths 检查无目标 → 留 W5+ 接 PlanRunner
- W5.13 jest 后端测试: 用 E2E checklist 验证行为,留 W5+ 写
- W5.8/9 lane conflict: WorktreePanel 还在 localStorage,backend 路由
  就绪但 panel 没接 → 留 W5+
- W4.4 lock-screen-pet emit (P9 redesign integration)
- W4.6 mobile deeplink → 在 mobile spec
- W4.7 aggregated chat inject on ball click
- W3.7 真实 subscription tier 解析 (现 hard-code 'free')

这些都不影响 v1 R1-R12 行为,可在 v1.1 / W5+ 补。

## 9. v1 → v2 firewall (Property 6)

CI lint `lint:forbid-v2` 已 ship,scan:
- `target_kind = 'marketplace-hire'` 不允许写 (除 reject 路径)
- `hired_from_user_id` 不允许 set
- `subject_kind` (W6 World Engine) 不允许 set
- battle mode `task_arena / tournament / arena_room` 不允许 set

任何 PR 触发该 lint 失败 → block merge。
