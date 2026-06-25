# 多 Agent — 工作助手 vs Pet PvP 优先级与执行方案

> 作者:Dev Agent
> 触发:用户问 "Multi-agent 不仅仅是玩游戏,核心是帮助用户干活,
>   是否可以先做 multi-agent-research 的 V1/V0 完整可视化?还是按
>   两个 spec 执行?"
> 关联:
> - [`MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md`](MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md)
> - [`PET_PVP_AND_SPATIAL_AI_2026-05-24.zh-CN.md`](PET_PVP_AND_SPATIAL_AI_2026-05-24.zh-CN.md)
> - [`GAMES_INVENTORY_2026-05-25.zh-CN.md`](GAMES_INVENTORY_2026-05-25.zh-CN.md)

---

## TL;DR(三段)

1. **优先做 multi-agent collaboration v0/v1(干活方向)**,而**不是先合并去
   做 Pet Arena spec**。理由:用户 / 投资人对 Agentrix 的核心心智是"AI
   帮我干活",PvP / Arena 是衍生玩法 — 在主能力没成型前推 Arena 会稀释
   定位。
2. **不需要并行两个 spec**。开**一个** `.kiro/specs/multi-agent-collaboration-2026-06/`,
   严格做 Codex / Composer / 贾维斯式的"帮干活"形态(Layer 1-3)。Pet
   Arena 作为这条主线**在 v1 之后**才落到 Layer 4(Living Pet)和 Layer 5
   (Marketplace)上 — 那时 Pet 自然变成 multi-agent 的一种身份载体,而
   不是单独造一套竞技 entity。
3. **桌面端比想象中近**。盘点显示 v0 80% 的基建已经 ship(WorktreePanel
   + Agent Team Sandbox MVP + TaskTimeline 的 sub-agent kind + agent-team
   provision API + agent-task worker)。**v0 sprint 的核心是"接线 +
   暴露",不是"造新东西"**。

---

## 1. 我的判断 — 为什么"干活"必须先做

### 1.1 定位锚点

`docs/agentrix-positioning-2026-05.zh-CN.md` 主轴是"AI 协作伙伴",§3.2
A_Path 五项差异化是:

1. 跨工具记忆
2. 长任务后台
3. 跨端协作
4. **多 agent 协作**(已写入,只是未落地 v1)
5. Living Pet 经济

PvP / Arena 在文档里是 §3.2 第 6 项的**候选**,需要 PM 明确表态才升格。
**主线 4 没落地,先去做候补 6,叙事会乱**。

### 1.2 心智优先级

| 用户类型 | 期望 | 多 agent 帮干活 | Pet Arena |
|---------|-----|----------------|-----------|
| U1 投资人 | "这能成 IPO 吗"| ✅ 直接对应"AI 帮人类干所有工作"叙事 | 🟡 衍生品,可作 marketplace 增长引擎讲 |
| U2 产品经理 | "这能解我的问题吗"| ✅ 把多个工具搬到一个 agent 团队跑通 | ❌ 不直接相关 |
| U3 创作者 | "这能批量生产吗"| ✅ 多 pet/agent 并行做内容 | 🟡 也许 |
| U4 程序员 | "这能比 Cursor 快吗"| ✅ 必须证明 — 不然他不上 Pro | ❌ 不相关 |
| U5 重度程序员 | "我能直接接我的 IDE 吗"| ✅ C_Path IdeBridge | ❌ 不相关 |

5 类用户里 5/5 都吃"干活",只有 1.5 类对 Arena 感兴趣。**优先级清楚**。

### 1.3 已 ship 资产沉默率

桌面端已经有 Worktree Board / Agent Team Sandbox / TaskTimeline 的 sub-
agent 事件流 / agent-team provision API,但**没人能从主 chat 里 trigger
他们运转**。这是最浪费的状态 — 基建在,UI 没接,用户感觉"什么也没有"。
**v0 干一次接线就能让 50% 的现有沉默资产跑起来**。

---

## 2. v0/v1 真正的 gap 清单(很短)

基于 [GAMES_INVENTORY §6.2](GAMES_INVENTORY_2026-05-25.zh-CN.md) 和
desktop 代码盘点:

### 2.1 桌面端已有的(列出来,不要重写)

| 资产 | 路径 | 状态 |
|------|-----|------|
| `WorktreePanel.tsx` | `desktop/src/components/WorktreePanel.tsx` | ship,Pro Mode 入口已挂 ChatTitleBar More |
| `TaskWorkbenchPanel.tsx` | 同上 | ship,内部有 "Agent Team Sandbox (MVP)" Planner/Coder/Reviewer 3 卡 |
| `TaskTimeline.tsx` | 同上 | ship,识别 `agent_spawn` / `agent_invoke` / `agent_result` kind,显示"🤖 Sub-Agents active" |
| `inferAgentTeamRole()` | 同上 | ship,从 timeline 自动分类 role |
| Backend `agent-team` | `backend/src/modules/agent-team/` | ship,provision API + 11-agent 默认模板(CEO/Architect/Coder/Reviewer/QA/...) |
| Backend `agent-task` | `backend/src/modules/agent-task/` | ship,worker + Bedrock 集成 + log 流 + cancel |
| Backend `pet-team` | `backend/src/modules/pet-team/` | ship,LivingPet leader+member+role+budget |
| Backend `pet-a2a` | `backend/src/modules/pet-a2a/` | ship,跨 pet escrow dispatch |

### 2.2 v0/v1 真正缺的 4 件事

| # | gap | 触发位置 | 影响 |
|---|-----|---------|------|
| 1 | **主 chat 没法发 `agent_spawn`** | `ChatPanelImpl.tsx` 的 LLM tool list 里没暴露 `agent_run` / `dispatch_team` 工具 | leader 无法从对话直接派活给 sub-agent |
| 2 | **Agent Team panel 没独立入口** | "Agent Team Sandbox" 是 TaskWorkbenchPanel 里一段,没顶层快捷键 | 用户看不到 team 视图 |
| 3 | **WorktreePanel 不显示 agent 身份** | 每条 lane 有 branch 没 agent_id | 用户看不到"哪只 pet 在哪条 lane 干啥" |
| 4 | **Pro Mode 之外不可见** | Worktree Board 是 Pro tier-only | Simple/Standard 用户完全看不到团队工作 |

**v0 sprint 范围 = 解掉这 4 件事,其他都不动**。

---

## 3. 推荐 spec 结构

### 3.1 spec 名字

```
.kiro/specs/multi-agent-collaboration-2026-06/
```

(沿用 multi-agent research 文档建议的命名)

### 3.2 requirements.md 草拟(只列 R 标题,QA 后定 AC)

| # | Requirement | 涵盖 Layer |
|---|------------|-----------|
| **R1** | 主 chat 里 leader agent 可以 spawn ad-hoc sub-agent(Composer 风格)| L1 → L2 |
| **R2** | sub-agent 在 timeline 可见,有 progress + 结果折叠卡 | L2 |
| **R3** | leader 可以选择把 sub-task 派给具名 agent / pet member 而不是 anonymous sub-agent | L2 → L4 |
| **R4** | 每条 worktree lane 显示 agent 身份(头像 / 名字 / role) | L3 |
| **R5** | 用户可以通过"Agent Team"独立 panel 看团队全景(provision 从模板 / 加 member / 移除) | L3 + L4 |
| **R6** | 长任务后台跑:用户关掉 chat / app,任务继续;完成 / 失败时通过 companion ball / 锁屏 / push 回流 | L3(借现成 background-tasks 基建)|
| **R7** | Simple Mode 用户能看到团队工作(只读可视化,看动画)+ 团队跑完后看一句话总结,不需要懂 worktree | L3 简化 |
| **R8** | Pro Mode 用户能编辑 sub-task prompt / role / 模型 tier / 预算 | L4 |
| **R9** | sub-task 失败 / 冲突时,用户能看到 conflict 提示 + 一键回滚 / 手工解决 | 健壮性 |
| **R10** | 跨用户 A2A:leader 找不到合适 member 时建议 marketplace 雇佣(opt-in,默认关)| L5 — **可推到 v2**|
| **R11** | 经济属性:每次 sub-task 完成自动写 `agent_cost_records`,team 详情页显示本周花了多少 | L5 |
| **R12** | Pet 视角(L4):用户的 LivingPet 可以作为 team member 加入(role 由 pet skill 自动推断) | L4 |
| **R13** | World Engine 现有 Battle / Dungeon 的 sub-agent 拆解(扫现实 → AI Interpreter → Char Generator → Battle Engine 链)是 multi-agent 的一个真实 use case,要复用 visualization | 整合 |

R10 / R12 / R13 在 v1 不一定全做,但要在 design 阶段**画进数据模型**,
否则后面 Pet Arena 时还要改 schema。

### 3.3 design.md 顶层结构

```
§0  调研背景(直接 link MULTI_AGENT_RESEARCH 文档,不重写)
§1  Layer 1-5 模型 + 当前已 ship 资产盘点(直接 link 本文 §2.1)
§2  数据模型 — 把 agent-team / agent-task / pet-team / pet-a2a 现有
    schema 列出来 + 需要新增的字段(WorktreeLane.agent_id /
    AgentTask.parent_task_id 等)
§3  spawn 协议 — 主 chat 工具 `agent_run(role, prompt, scope, budget)`
    的 schema,以及它和 agent-task.create() 的对应关系
§4  可见性协议 — TaskTimeline 已经有 agent_spawn / agent_invoke /
    agent_result,定义事件 schema 让前后端对齐
§5  Agent Team Panel UI — 从 TaskWorkbench 提出来,加 provision /
    invite member / kick / set leader 控件
§6  WorktreeLane × Agent 桥接 — 每条 lane 加 agent_id 显示
§7  长任务回流(借 companion ball / lock-screen / push)— 借 P9 现成
§8  失败 / 冲突 — 模仿 git rebase 的两种解决:auto-merge / 用户手工
§9  Simple Mode 简化视图 — 不显示 worktree,只显示 "5 只宠物在干活" 球
§10 Pro Mode 完整视图 — 全部细节
§11 Pet 视角(L4)桥接 — LivingPet ↔ AgentAccount 字段对照
§12 经济属性 — agent_cost_records 写入 + 周报视图
§13 跨用户 A2A(v2 占位)— pet-a2a 模块如何接入 leader spawn 决策
§14 与 World Engine 的整合(把扫描 / 生成 / 战斗的 4 步看作 multi-
    agent task graph)
```

### 3.4 tasks.md 草拟(只 wave 标题)

| Wave | 范围 | 预计 | 关键交付 |
|------|-----|------|---------|
| **W1** | UI 暴露 + 数据接线 | 1 sprint | ChatTitleBar 加 Agent Team 入口 + 独立 panel + WorktreeLane 加 agent_id 显示 + Simple Mode 球 |
| **W2** | spawn 协议落地 | 1 sprint | leader 主 chat 注入 `agent_run` 工具 + sub-agent kind 事件全链路打通(前后端)+ 一句话总结回流 |
| **W3** | Pet member(L4 桥接) | 1 sprint | LivingPet → AgentAccount 字段映射 + Pet Hub 加 "我的 Team" 入口 + member 派 sub-task 真跑通 |
| **W4** | 长任务 + companion ball + 锁屏回流 | 1 sprint | 借 P9 现成,只接事件类型 |
| **W5** | 失败 / 冲突 + 经济属性 | 1 sprint | 用户体验防卡死;agent_cost_records 写入 + 周报 |
| **W6**(可选)| World Engine 整合 | 1 sprint | 把 scan → interpret → generate → battle 全链路展示为 task graph |
| **W7**(post-launch)| 跨用户 A2A v2 | 2 sprint | marketplace pet 雇佣进 spawn 决策 |
| **W8**(post-launch)| Pet Arena = multi-agent collab 的对抗 mode | 2 sprint | Battle.mode = duel/task/tournament/arena_room 扩展;Arena UI 是 Agent Team Panel 的"对抗 view"切换 |

**v1 = W1+W2+W3+W4+W5(5 sprint,launch+30-60 天)**
**v2 = W6+W7+W8(launch+90 天起)**

### 3.5 PvP / Arena 怎么吸收

不开独立 spec,而是**作为 multi-agent v2 的一个 mode 落到 W8**。理由:

| Pet Arena 数据需求 | multi-agent 已经造的 |
|-------------------|--------------------|
| 多 pet 组队 | `pet-team` + Agent Team Panel(W3) |
| 1v1 PvP entity | `world-engine.battle` 已 ship — 加一个 mode 字段 |
| 跨用户 a2a | `pet-a2a` + W7 marketplace 雇佣 |
| 任务竞速可视化 | WorktreePanel + Agent Team Panel(W1)的 lane 视图直接复用 |
| LLM-judge | 在 leader 的 spawn 协议里增加 `judge` role 类型(W2 顺手) |

**Arena 单独开 spec 会重复造 entity / 重复造 panel / 重复造 sub-agent
事件流。先做主线,Arena 自然 fall out**。

---

## 4. 与 reality-ai-world-engine 的关系

reality-ai-world-engine spec 已 ship Battle / Dungeon / Asset。它**和
multi-agent collaboration 是正交的**:

- World Engine 关心:**实体**(WorldAsset / Battle / Dungeon)和**玩法**
- Multi-agent 关心:**调度**(谁派活给谁、可视化、长任务)

W6(W6 = World Engine 整合)只做一件事:**把 World Engine 的 scan →
interpret → generate → battle 4 步链路在 Agent Team Panel 里以 task
graph 形式可视化**,让用户看到"啊原来后面是 4 个 agent 接力跑的"。
这增强了 World Engine 体验,不动它的数据模型。

---

## 5. 决策建议

### 选项 A — **推荐**:做 multi-agent v0/v1(干活)

- 1 个 spec:`multi-agent-collaboration-2026-06`
- v1 = W1-W5,5 sprint,launch+30-60 天
- Pet Arena 作为 W8 在 v2 落地
- **好处**:核心定位 §3.2 第 4 项落地;沉默资产激活;W8 时 Arena 几乎
  free
- **代价**:Arena 上线晚 launch+90 天

### 选项 B — 做两个并行 spec(原方案)

- 2 个 spec 同时跑:multi-agent collaboration + pet-arena-team
- **风险**:数据模型 / UI 组件双造;sprint 资源稀释;v0 出货质量下降
- **好处**:Arena 早 60 天上线 — 但是只是"第一版孤岛"

### 选项 C — 只做 Pet Arena,multi-agent 推到 launch 后

- **不推荐**:违反 §3.2 第 4 项主线;Arena 没有 multi-agent 基础就是
  个简单 PK 模式,没有差异化护城河

**强烈推荐选项 A**。

---

## 6. 立刻可做的下一步(无论选哪个,这两件都不会浪费)

1. **Plaza Play 段填 8 张卡**(GAMES_INVENTORY §7-1)
   - World Engine Battle / Dungeon / Pet Auction / Skin Auction /
     Photo Mimic / Co-raising / Pet Greeting / Prediction Market
   - 1 sprint,backend 全 ship
   - **任何方向都需要这一步** — 让用户看到现有"游戏 / 玩法"是 launch
     必须项

2. **Pet 详情页加"战绩"段**(GAMES_INVENTORY §7-2)
   - 显示 battleWins / battleLosses / 最近 5 场 battle / 加入的 team
   - 1 sprint,直接读现有字段
   - **W3 的 prep**(Pet 视角接入 Agent Team)

---

## 7. Open questions(等 PM 拍板)

1. ✅ **去做 multi-agent v0/v1 优先**(选项 A)?还是平行(选项 B)?
2. v1 W1 启动时,**Simple Mode 的"团队工作球"放浮球**(P9 companion
   ball 旁多一个气泡)还是 Pet Tab 顶部"今日团队动态"?
3. v1 W3 时,LivingPet 接 AgentAccount 这一步是否需要让用户**重新签
   approval**(因为 pet 现在能花钱了)?
4. v1 W5 经济属性的"周报"放 Me Tab 还是 Pet Tab?
5. v2 W8 Pet Arena 落地时,**默认 opt-in 还是 opt-out**?
   (PvP feasibility doc §8.2 已经是 opt-in 倾向 — 此处只确认)

---

## 附录:相关文件路径速查

```
桌面已 ship 多 agent 资产:
  desktop/src/components/WorktreePanel.tsx        🌿 Worktree Board
  desktop/src/components/TaskWorkbenchPanel.tsx   🤖 Agent Team Sandbox
  desktop/src/components/TaskTimeline.tsx         ⏱  agent_spawn/result kind
  desktop/src/components/chatPanel/ChatTitleBar.tsx (Pro Mode More 菜单)

后端:
  backend/src/modules/agent-team/                 11-agent 模板 + provision
  backend/src/modules/agent-task/                 worker + Bedrock + log 流
  backend/src/modules/pet-team/                   LivingPet leader+member
  backend/src/modules/pet-a2a/                    跨 pet escrow dispatch
  backend/src/modules/agent-presence/             scheduler / operations dashboard
  backend/src/modules/agent-orchestration/        (看名字,可能是底层)

文档:
  docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md
  docs/PET_PVP_AND_SPATIAL_AI_2026-05-24.zh-CN.md
  docs/GAMES_INVENTORY_2026-05-25.zh-CN.md
  docs/agentrix-positioning-2026-05.zh-CN.md  §3.2 A_Path 第 4 项
  docs/agentrix-cross-platform-prd-v5.md
```
