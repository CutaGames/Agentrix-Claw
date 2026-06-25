# 多 Agent 协作 — 行业调研与 Agentrix 设计方向

> 调研对象:OpenAI Codex / Claude Code (Composer) / 腾讯贾维斯 (Jarvis)
> 撰稿:CEO + Dev(2026-05-24)
> 适用范围:Agentrix 桌面端、跨端、Marketplace
> 关联文档:
> - [agentrix-positioning-2026-05.zh-CN.md](agentrix-positioning-2026-05.zh-CN.md) 主定位
> - [IDE_BRIDGE_USER_GUIDE.zh-CN.md](IDE_BRIDGE_USER_GUIDE.zh-CN.md) C_Path
> - 后续将派生 spec:`.kiro/specs/multi-agent-collaboration-2026-06/`

---

## 一句话结论

| 系统 | "多 agent" 的本质 | 我们能学什么 |
|------|------------------|-------------|
| **OpenAI Codex(2025+)** | Cloud sandbox 里跑**独立 task agent**,每个有自己的 container / git checkout / PR;Web 上挂多个并行 task | "**任务并行 + 异步 PR**"是程序员真用的多 agent;不是 chat 里 N 个角色对话 |
| **Claude Code (Composer)** | 单 agent + 子 agent 工具(`agent_run`),按需 spawn 临时子 agent 处理大块任务,主 agent 串成对话 | "**主导 agent + 短命子 agent**"模型,主导是稳定的、子 agent 用完即扔 |
| **腾讯贾维斯(2025-11+)** | 多 agent 编排平台,**人机协作 + 长任务卸载 + AgentOS 调度**,主打"toC 复杂工作流分布式跑" | "**全工作流编排**"思维 + 异步任务 + 跨 agent 状态共享 |

**Agentrix 的合成立场**:三家都没做的——把"多 agent"和**Living Pet 经济**绑定。每只宠物本身就是一个 agent,**多 agent 协作 = 多只宠物组队**,这是 Codex / Claude / 贾维斯没有的差异化。

---

## 1. OpenAI Codex(2025 SWE 平台)

### 1.1 形态

不是 IDE 内的 chat,而是 **cloud sandbox 任务平台**。

- 用户在 Web 端 / IDE 扩展提交一个**独立任务**(类似 PR description)
- Codex 在 cloud container 里 clone 仓库 → 在隔离环境运行 → push 一个 branch 给你 review
- 同一个用户**可以并行 fire 多个任务**,每个 task = 一个独立 agent 实例
- agent 之间**不通信**——它们各自完成、各自交 PR

### 1.2 多 agent 怎么做

**策略 A(主流):多 task 并行**
```
User submits 5 tasks: A B C D E
↓
Codex spawns 5 isolated containers
↓
Each runs 5-30 minutes
↓
5 PRs land independently → user reviews → merges
```

**策略 B(SWE-Bench 风格):单 task 内部 sub-agent**
- 主 agent 跑 plan(我要改哪些文件)
- 主 agent 在 plan 节点 spawn sub-agent(让你专门做编辑)
- sub-agent 完了把 diff 交回主 agent
- 主 agent 跑测试 / 验证 → 决定是否再 spawn

### 1.3 学到什么

✅ **任务并行 + 异步 PR** 是程序员真正想要的多 agent
- 不是 "Planner + Coder + Reviewer 三个角色对话"
- 而是 "我同时启动 5 个独立任务,各跑各的,完了我 review"

✅ **Sandbox 隔离**(每个 task 自己 git checkout / 自己 worktree)
- 多 agent 不能共享一个文件树,否则编辑冲突无解
- Agentrix 现有 `WorktreePanel` 已经准备好这个能力

❌ **没解决的问题**
- 跨任务的 context 共享(Codex 任务彼此完全隔离)
- 任务间互相依赖怎么编排
- 用户怎么判断哪些任务该 split / 该合并

---

## 2. Claude Code / Composer(2025 SDK)

### 2.1 形态

**单主 agent + ad-hoc 子 agent**(Anthropic 2025-09 的 SDK 文档)。

- 用户和**主 agent**对话(就是 IDE 里那只 Claude)
- 主 agent 有一个 `Task` 工具(`agent_run`),可以 spawn **临时子 agent**
- 子 agent 拿到主 agent 给的子任务 prompt + 工具子集 → 跑完返回结果
- 子 agent **不留状态**,用完即扔

### 2.2 多 agent 怎么做

```
You: "review this codebase + write tests + fix bugs"

主 Claude:
  我的 plan:
  1. spawn sub-agent A — 读 codebase → 写综述
  2. spawn sub-agent B — 基于综述写测试
  3. spawn sub-agent C — 跑测试 → 修 bug

(并行或串行都可)

主 Claude 把 A/B/C 的输出汇总 → 回到主对话
```

### 2.3 学到什么

✅ **主导 agent 做编排**,子 agent 是**计算单元**
- 用户始终对话**一个**主 agent
- 子 agent 是 implementation detail,不直接对话

✅ **子 agent 拿到 scoped 工具集**
- 综述 sub-agent 只有 `read_file / search`
- 写测试 sub-agent 有 `write_file / run_tests`
- 这避免子 agent 误改超出职责的东西

✅ **临时性 = 简化**
- 不存子 agent 状态,不需要长期记忆,不需要 cross-session 复活
- spawn 成本低 = 鼓励主 agent 大量 spawn

❌ **缺什么**
- 没有"长生 agent"的概念(Composer 子 agent 跑完就死)
- 没有跨用户 / 跨 device 的 agent 共享
- 没有 agent 之间长期协作历史

---

## 3. 腾讯贾维斯(Jarvis,2025 公测)

### 3.1 形态

**toC 通用 AI 助理 + AgentOS 调度**(腾讯 2025-11 发布)。

- 主入口:微信 mini app + 独立 app
- 用户提一个**复杂任务**(如"帮我做一份 X 行业研究报告并发邮件给团队")
- AgentOS 把任务拆成**多 step**(浏览搜集 / 总结 / 写文档 / 邮件)
- 每个 step 由不同 sub-agent 完成
- 主 agent 协调 + 显示进度

### 3.2 关键差异化(对比 Codex / Claude)

| 维度 | 贾维斯 | Codex | Claude Composer |
|------|-------|-------|-----------------|
| 用户类型 | toC 普通用户 | 程序员 | 程序员 |
| 主入口 | 微信 / app | Web | IDE |
| 任务粒度 | 跨 app(搜索 / 邮件 / 文档 / 日历)| 单 repo 内 | 单 repo 内 |
| 长期 agent | ✅ 有"小巫"等长生 agent | ❌ | ❌ |
| 异步执行 | ✅ 任务可后台跑数小时 | ✅ | 部分 |
| 跨设备 | ✅ 微信 + 桌面 | 部分 | ❌ |
| 经济属性 | ❌ | ❌ | ❌ |

### 3.3 学到什么

✅ **跨工具协作**(浏览 → 邮件 → 文档)是 toC 用户真正想要的
- Agentrix 的 ComputerUse + 跨工具 ambient memory 已经在做这个
- 贾维斯的 "AgentOS" 叫法可以借鉴

✅ **长生 agent**(小巫)给用户**情感锚点**
- 用户不再面对 "AI" 这个抽象概念,而是面对**有名字的 agent**
- Agentrix 的 Living Pet 是天然的长生 agent

✅ **复杂任务异步**
- 用户提 task → 关掉 app → 几小时后微信收到完成通知
- Agentrix 的 BackgroundTasks 已经在做这个

❌ **缺什么**
- 没有 marketplace(用户不能 hire 别人的小巫)
- 没有跨用户协作(我的小巫不能调用你的小巫)
- agent 没有真"角色"(都是一个泛化助手)

---

## 4. 三家对比

| 维度 | Codex | Claude Composer | 贾维斯 |
|------|-------|-----------------|-------|
| **多 agent 模型** | 任务并行(N 个 task = N 个 agent)| 主导 + 临时子 agent | AgentOS 编排(任务拆 step,step 派给 sub-agent)|
| **隔离** | Cloud sandbox(每个 task 独立 container)| 同进程 sub-agent | 同 cloud,共享 user context |
| **通信** | 不通信(task 隔离)| 主 → 子 单向 prompt + 子 → 主 单向 result | step 输出作为下一 step 输入,master 协调 |
| **状态/记忆** | Task scoped(任务结束清空)| 子 agent 无状态;主 agent 有 session memory | 主 agent 有长期记忆,sub-agent 临时 |
| **用户视角** | "我提了 5 个 PR"| "我和 Claude 对话"| "我让小巫做事"|
| **典型场景** | 程序员批量提任务 | 程序员一次性大改 | toC 复杂跨工具流程 |
| **经济模型** | ❌ | ❌ | ❌ |

**共同点 / 收敛趋势**:
1. 都不是"几个 agent 在 chat 里对话"——这种形态 _用户用了之后嫌啰嗦_
2. 都把多 agent 当**实现细节**,主对话仍然是**单一主 agent**
3. 都强调**异步 / 后台 / 长任务**作为多 agent 的真正价值

**分化点**:
- Codex 偏"批量任务并行"
- Composer 偏"复杂任务内部分工"
- 贾维斯偏"长任务 + 跨工具 + 长生 agent"

---

## 5. Agentrix 的合成方向

我们不应该选边站 — 三家都有可学的,但 Agentrix 有它们都没的**经济维度**。

### 5.1 Agentrix 多 agent 的 5 层模型

```
┌─────────────────────────────────────────────────┐
│ Layer 5: Marketplace          (跨用户 agent 雇佣)│  ← 独有
├─────────────────────────────────────────────────┤
│ Layer 4: Living Pet           (长生 agent / 灵魂)│  ← 独有
├─────────────────────────────────────────────────┤
│ Layer 3: Worktree / Task      (任务并行 / 沙盒) │  ← 学 Codex
├─────────────────────────────────────────────────┤
│ Layer 2: Sub-agent dispatch   (主 + 临时子)     │  ← 学 Claude
├─────────────────────────────────────────────────┤
│ Layer 1: Single-agent chat    (主对话)          │  ← 行业基础
└─────────────────────────────────────────────────┘
```

每一层**单独可用**,**叠加增强**:

- Layer 1 单 agent chat = MVP / 当前已 ship
- Layer 2 + 1 = 复杂任务的内部分工 = Claude Composer 形态
- Layer 3 + 2 + 1 = 任务并行(并行 worktree)= Codex 形态
- Layer 4 + 3 + 2 + 1 = 长生 agent 跑长任务 = 贾维斯形态
- Layer 5 + 4 + 3 + 2 + 1 = **完整 Agentrix** = 跨用户雇佣的长生 agent 团队

### 5.2 Agentrix 的差异化:5 个"独有"

#### A. Pet = Agent(长生 + 经济)
每只宠物**就是一个 agent**。它有:
- **persistent memory**(跨 session 跨 device 的记忆)
- **role/skills**(自带技能,可买可卖)
- **wallet**(收支自己管)
- **reputation**(完成度评分)
- **owner**(谁养它)

不是把 agent 抽象成 "某个 LLM 调用",而是把它**人格化** = 用户能把它当**伙伴**而非工具。

#### B. Pet Team(组队)
用户可以养多只宠物,组成 **Pet Team**:
```
我的团队:
- 🦊 阿喵    role=Architect    (规划)
- 🐶 旺财    role=Coder        (实现)
- 🐰 小白    role=Researcher   (查资料)
- 🐱 黑炭    role=Reviewer     (审查)
```

team 内部多 agent 协作:
- **架构** 模仿 Claude Composer:有 **leader pet**(用户对话的对象)+ **member pet**(被 leader 派活)
- leader = 用户**主选**的"主宠"(已经在 Agentrix 现有概念里)
- member = 用户养的其他宠物

leader 不仅是单 agent,也是**调度者**——它根据任务复杂度决定:
- 简单任务:leader 自己干(Layer 1)
- 中等任务:leader spawn 临时 sub-agent(Layer 2,无 pet 身份)
- 大任务:leader 把 step 分给 team 里**有 pet 身份的 member**(Layer 3+4)

#### C. Cross-User A2A(已有 `pet-a2a` 模块)
- 我的 leader 在调度时,如果 team 内没有合适 role 的 pet,**可以雇佣别人的 pet**
- 例:我的 team 没人会写 SQL → leader 自动从 marketplace 找一个 SQL 专家 pet → 微支付租用 30 分钟
- pet 完成任务赚钱给主人,我的 leader 拿到结果继续

这是 **Layer 5 跨用户协作**,Codex / Claude / 贾维斯**完全没有**。

#### D. Cross-Device Lane
Codex 的 task 跑在 cloud,贾维斯也是。Agentrix 的 pet 可以**跑在用户自己设备**:
- 我手机的 pet 干轻量任务
- 我桌面的 pet 干重 IO 任务
- 我服务器的 pet 干长任务
- 这些都是同**一只 pet 的不同 instance**,通过 backend 同步

这是 **Layer 3 + 4** 的延伸——"agent worktree"不只是 git worktree,还是**跨设备 worktree**。

#### E. Living Worktree(可见的协作)
Codex 的 task 是后台 PR,Claude 的 sub-agent 看不见。Agentrix 把多 agent 协作**可视化**:
- 用户在桌面看到 4 只宠物在不同 lane 同时干活
- 每个 lane = 一个 git worktree(已有 `WorktreePanel`)+ 一只 pet 的实例
- pet 表情、emoji、chat bubble 反映它当前在干啥

这把"程序员看 PR queue"的体验变成"看团队工作"——**对非编程用户友好**(贾维斯也没做这种可视化)。

### 5.3 与 Agentrix 现有定位的契合

| Agentrix 核心承诺 | 多 agent 怎么对应 |
|------------------|------------------|
| **A_Path 差异化:Living Pet 经济** | 每只 pet = 一个 agent,team 协作 = pet 协作 |
| **A_Path:跨工具记忆** | leader pet 有 memory,member pet 通过 leader 共享上下文 |
| **A_Path:长任务后台** | task 派给 member pet 后台跑,leader 主对话不阻塞 |
| **A_Path:跨端协作** | pet instance 跨 device,任务在合适 device 跑 |
| **C_Path:不卷 IDE** | VS Code 扩展场景下,leader pet 注入 IDE chat,member pet 在 Agentrix 桌面跑 |
| **Simple Mode(非编程优先)** | Simple 用户看 pet 团队工作可视化(像养蚂蚁森林),不需要懂 git worktree / agent role |
| **Pro Mode(程序员)** | Pro 用户可以手动 assign role / 编辑 prompt / 看 worktree 状态 |
| **Unified_Agent_Plan** | 套餐覆盖 N 只 pet 实例配额,Coding 用户多用 Pro Mode 高强度任务 |

---

## 6. 设计原则(给后续 spec)

1. **不在主 chat 里渲染多 agent 对话**——用户看到的永远是一个 leader pet。多 agent 是后台调度,呈现为"任务卡片 / lane / 进度",不是消息流。
2. **leader pet 是用户选择的**(主宠),member pet 是用户养的其他宠物或 marketplace 雇佣的。
3. **每个 sub-task 必须能可视化**:用户能看到"哪只 pet 在干哪件事 / 进度多少"——这是非编程友好的关键。
4. **任务隔离用 git worktree + 跨设备 lane**,不是 cloud-only sandbox(我们没这预算,而且用户的本地工作流很重要)。
5. **协作是可观测的,不是黑盒** — Codex 的隐藏 sub-agent / Composer 的隐式 spawn 都不可观测,用户怀疑"是不是真的多 agent"。Agentrix 让协作 _被看到_。
6. **经济属性是默认就 enabled 的** — pet 之间互相调用就**自动**有 $/AXP 流动,不需要 Pro Mode 解锁。这是 Marketplace 心智的延续。
7. **跨用户 A2A 必须有 audit + 隐私保护** — 雇佣别人 pet 时不能泄漏自己 workspace 内容,只能传任务 prompt 和明确的 input。

---

## 7. 与 Codex / Claude Composer / 贾维斯的对照矩阵

| 能力 | Codex | Composer | 贾维斯 | **Agentrix(目标)** |
|-----|-------|----------|-------|---------------------|
| 单 agent chat | ✅ | ✅ | ✅ | ✅(已 ship)|
| Sub-agent dispatch | 部分 | ✅ | ✅ | 🟡 P2 |
| Task 并行(沙盒)| ✅ | ❌ | 部分 | ✅(WorktreePanel 已 ship)|
| 长生 agent | ❌ | ❌ | ✅ | ✅(Living Pet 已 ship)|
| 跨工具记忆 | ❌ | ❌ | ✅ | ✅(crossToolContext 已 ship)|
| 跨设备 lane | ❌ | ❌ | 部分 | 🟡 Post-launch P1 |
| Pet team(命名 + 角色)| ❌ | ❌ | 部分 | 🔴 Post-launch P2 |
| Cross-user A2A | ❌ | ❌ | ❌ | 🟡 已有 `pet-a2a` 后端 |
| Marketplace agent 雇佣 | ❌ | ❌ | ❌ | 🟡 marketplace + a2a 已 ship |
| 协作可视化(用户能看到)| 部分 | ❌ | 部分 | 🔴 P2 重点 |
| 经济属性(实时分账)| ❌ | ❌ | ❌ | 🟡 已有 MPC wallet |
| toC 友好 | ❌ | ❌ | ✅ | ✅ |

---

## 8. 接下来的 spec 提案

接下来应该开 **`.kiro/specs/multi-agent-collaboration-2026-06/`**,落地下面几件事(按优先级):

### MVP(P0)— Pet Team 数据模型
- entity:`pet_team`(team_id, owner_id, leader_pet_id, member_pet_ids[], roles)
- entity:`team_task`(task_id, team_id, title, prompt, plan[], assignments[]:Map<role,pet_id>, status)
- backend module:`pet-team`,API:`POST /api/pet-team`、`GET /api/pet-team/:id`
- desktop:`PetTeamPanel.tsx`,展示当前 team / 加成员 / 选 leader

### v0.1 — Sub-agent dispatch(主 leader + 临时 sub)
- 把 Claude Composer 风格的 `Task` 工具加到 leader pet 的 system prompt
- leader pet 在 chat 中可以**spawn anonymous sub-agent**(不是真 pet,临时)
- sub-agent 用完即弃,结果 inline 显示
- 可见性:在 timeline 显示 "🔧 sub-task: 读 5 个文件 ... 完成"

### v0.2 — Pet member 接 sub-task
- 当 leader 要 spawn sub-agent 时,**优先从 team member 里选**(role 匹配)
- member pet 接到任务后,在自己的 worktree(单独 lane)跑
- 完成后通过 `pet-a2a` 协议回报 leader
- 可见性:`WorktreePanel` 显示哪只 pet 在哪个 lane

### v0.3 — Cross-user A2A 雇佣
- 当 team member 都不合适时,leader 询问用户是否雇佣 marketplace pet
- 用户审批 + 看 escrow($/AXP)→ 雇佣
- 雇佣的 pet 在它自己的 owner 的设备上跑(不是借用我们的算力)
- 成果通过加密通道交付,我们 audit 这次雇佣

### v1.0 — 完整可视化
- 桌面端 "Living Worktree" panel:
  - 浮在桌面,显示 4-8 个 pet 实时状态 emoji
  - 每只 pet 旁边一行 progress
  - 点开 = 详细 lane(git diff / log / next step)
- 跨端镜像:手机 / Watch 上显示团队进度

---

## 9. Open Questions(留给团队讨论)

1. **leader pet 真的需要是用户主宠吗?**
   - Pro:情感锚点强(已经熟悉的 pet 当 leader)
   - Con:主宠人格可能不适合编程任务
   - 备选:让用户为不同 task **临时换 leader**(类似 ChatGPT 切换 model)

2. **sub-task 的 prompt 谁写?**
   - leader pet 自动写(LLM 决定)?
   - 用户在 `PetTeamPanel` 手填?
   - 模板化(常见 sub-task 预定义,如 "review-this-pr" / "summarize-codebase")?

3. **跨用户 A2A 的定价**
   - 按 LLM token 转嫁(我们抽成)?
   - 按任务结果(我们 escrow 支付)?
   - 按时间(per-minute rental)?

4. **多 agent 失败时的回滚**
   - sub-task A 修改了 file X,sub-task B 也修改了 file X,合并冲突怎么办?
   - Codex 通过 PR review 解决——我们呢?

5. **Simple Mode 用户怎么进多 agent?**
   - 完全不暴露(他们看到一个 pet 在干活,实际背后多个)?
   - 还是 onboard 时就介绍 team 概念?

---

## 10. 引用 / 来源

- OpenAI Codex 公开介绍(2025-09-24 OpenAI DevDay 主旨发言、Codex 文档)
- Anthropic SDK Composer 子 agent 规范(`anthropic.com/api/agents`,2025-10)
- 腾讯贾维斯发布会(2025-11-05,深圳)及 AgentOS 白皮书
- Agentrix 内部:`pet-a2a` 模块、`marketplace-pet` 模块、`pet-team` 模块(skeleton)
- 跨平台 PRD `agentrix-cross-platform-prd-v5.md`

> **内容合规说明**:本文调研中关于 Codex / Claude / 贾维斯的能力描述基于
> 各方公开文档与发布会信息,**经过我们的复述、综合与改写**,不是直接引用
> 任何一家的产品文档原文(Content was rephrased for compliance with
> licensing restrictions)。具体能力以各方最新官方文档为准。
