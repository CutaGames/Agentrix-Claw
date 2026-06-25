# Agentrix 产品定位 — 团队共识(2026-05-24 修订版,路线图状态对账于 2026-05-24)

> 这是一份对内对齐的"我们是谁、我们不是谁"的文档。任何产品决策、PRD
> 撰写、营销话术、销售对话、招聘 JD、投资人陈述,都应该回到这里检查
> 是否一致。
>
> 撰稿:CEO + Dev + Brand + 产品负责人(2026-05-24 修订)
> 适用范围:Web / Desktop / Mobile / Watch / Toy 全端
> 上一次更新:2026-05-24(路线图状态对账,§6 / §7)

---

## 术语(本文档专用)

下列术语在本定位文档与下游 PRD 中具有统一含义。新成员阅读时**先看这一段**。

| 术语 | 含义 |
|------|------|
| **A_Path**(差异化护城河) | Cursor / VS Code 无法复刻的能力:**跨工具上下文记忆**、**长任务后台执行**、**跨端协作**、**人话总结 + 自动验证**、**Living Pet 灵魂 + Marketplace**。这是产品壁垒,优先级最高。 |
| **C_Path**(IDE 协作伴侣) | 通过 **VS Code / Cursor 扩展** + **IdeBridge** 双向桥接,与现有 IDE **协作而非竞争**。C_Path 不削弱 A_Path,反而把 A_Path 注入 IDE 工作流。 |
| **B_Path**(做新 IDE) | **已被产品负责人否决**——做不过 Cursor / VS Code,我们的核心用户也不在编辑器里。本文档**不引入** B_Path 内容。 |
| **IdeBridge** | Agentrix 与外部 IDE 的双向桥接协议:(a) IDE 内 chat / agent 调 Agentrix agent 与长记忆;(b) Agentrix 桌面端 / 浮球反向调 IDE 命令(打开文件、跳转、运行任务)。 |
| **Unified_Agent_Plan**(统一 Agent 套餐) | 覆盖所有用户人群(U1–U5)的**单一**订阅 SKU。**不出独立 Coding Plan**(也不出 Creator Plan / Pro Coder Plan)。Coding 体验通过切到 Pro Mode 解锁,而非单独购买。 |
| **Coding_Plan_Revenue** | 通过 Unified_Agent_Plan 覆盖到的、以编程为主要使用场景的用户产生的订阅营收。即使没有独立 SKU,这部分营收**可拆分、可衡量**,**仍是行业核心盈利来源**。 |
| **Simple / Standard / Pro Mode** | 用户分段位 UI 深度,对应 P-3 已落地的 mode picker。Simple 屏蔽工程化概念,Pro 暴露 memory wiki / tier router / ideBridge / diff preview / approval 流程。 |

(其他既有术语如 Living Pet、Marketplace、Workspace context、ambient HUD
保持原义,见各 PRD。)

---

## 0. TL;DR — 一句话定位

**Agentrix 是面向所有想把 idea 做成现实的人(程序员 + 非编程用户)的 AI 协作伙伴**,陪你把 idea 落地成"能跑、能用、能赚钱"的产品 / 作品 / 业务。

它**不卷 IDE 编辑器层**——但通过 **VS Code / Cursor 扩展 + IdeBridge** 与现有 IDE **协作赋能**,把 Agentrix 独有的**跨工具记忆 / 长任务 / 跨端协作**注入你已有的工作流。**默认是 Simple 模式**(非编程友好),程序员一键切 Pro 模式即获得完整 coding 视图。

---

## 1. 谁是我们的用户

按目标重要性排序(**所有 5 段都是目标人群**,不存在"非核心"):

| 段位 | 画像 | 占比目标 | 他们今天怎么干活 |
|------|------|---------|-----------------|
| **U1 — 不会代码的个人创业者** | 1 人公司、独立电商、独立创作者 | 35% | 用 Notion + Canva + ChatGPT 拼凑,卡在落地 |
| **U2 — 产品经理 / 设计师 / 运营** | 大厂 PM、独立产品人 | 25% | 写 PRD 给程序员,等排期 |
| **U3 — 普通用户(轻业务)** | 自由职业、教师、自媒体 | 18% | 用 ChatGPT 问东西,做不出真东西 |
| **U4 — 半技术 / 轻技术** | 设计师懂一点 HTML、运营会写公式 | 7% | 能用 Cursor / GitHub 但磕磕绊绊 |
| **U5 — 专业程序员** | Cursor / VS Code 重度用户、独立开发者 | 15% | 用 Cursor / Windsurf / Claude Code 写代码,把 chat 当 raw diff 工具。**我们对他们 = 跨工具记忆 + 长任务 + 跨端协作的增量,不替代编辑器** |

**关键判断**:

- **优先级**:**非编程用户(U1–U3)优先**——产品默认行为、首次进入体验、营销主轴都向 U1–U3 倾斜。但 U4 / U5 是**目标人群**,不是"非核心"。
- **代码可见性**:**Simple 模式下用户不需要自己改代码;Pro 模式下程序员可以直接接管代码、查看 diff、调用 IDE 桥接**。两种深度共存,不存在"用户永远不需要看代码"的硬约束——那是 Simple 模式的承诺,不是产品的承诺。
- **成长曲线**:用户会成长,U1 → U2 → U4 / U5 的迁移天然存在。产品要分段位适配,而不是把高阶用户挡在门外。
- **商业基本盘**:**Coding_Plan_Revenue(以编程为主要场景的订阅营收)仍是行业核心盈利来源**(参见 Cursor / GitHub Copilot 营收数据)。**Unified_Agent_Plan 必须能承载这一营收**,通过 Pro Mode 的 coding 体验深度让 U4 / U5 愿意付费,而不是单独 SKU。

---

## 2. 我们和谁竞争 / 协作 / 互补

| 工具 | 它的核心用户 | 它的核心场景 | 我们的关系 |
|------|------------|------------|-----------|
| **VS Code / Cursor / Windsurf / Kilo Code** | 专业程序员 | 写代码、改代码 | **差异化协作**——不在编辑器层正面竞争,而是通过 **VS Code / Cursor 扩展 + IdeBridge** 把 Agentrix 的**跨工具记忆 + 长任务 + 跨端协作**能力**注入** IDE 工作流。他们的核心 loop 是"光标在代码里 → AI 辅助",我们补上"离开 IDE 之后,agent 仍在跨工具/跨端/后台干活"。 |
| **Cline / Claude Code / aider** | 半专业开发 | 命令行 / IDE 内的 agent 模式 | **chat + agent 体验对标**——同档的输入输出流畅度(`@` mentions / `/` slash / inline tool calls),差异化在**跨工具上下文 / 跨端协作 / 长任务后台**。他们的输出是 raw diff,我们补"做完的事 + 人话总结 + 自动验证"。 |
| **ChatGPT / Claude / Gemini** | 所有人 | 问问题、写文档 | **不竞争**。他们停在"答案",我们做到"落地"(执行、修改文件、跨端、跨工具)。 |
| **Notion AI / Coze / Dify / Bolt / Lovable** | 创作者 / 一般用户 | 写文档 / 做 bot / 做 mini app | **是真正的竞争对手**。这一档是我们要赢的。 |
| **Devin / OpenAI Operator / Anthropic Computer Use** | 早期采用者 | 通用 AI agent | 同档 + 重要参照,但他们偏 demo,我们偏可日常用。 |

**结论**:我们的真正对手是 **Notion AI / Coze / Bolt / Lovable / Devin**。
对 Cursor / VS Code 我们采取**协作姿态**,通过 C_Path 注入差异化能力,不正面卷编辑器。

### 2.1 A_Path(差异化护城河)与 C_Path(IDE 协作伴侣)

- **A_Path**:Cursor / VS Code **无法复刻**的能力集合——跨工具上下文记忆、长任务后台执行、跨端协作、人话总结 + 自动验证、Living Pet 灵魂 + Marketplace。**A_Path 是产品壁垒,优先级最高**,所有 sprint 优先确保 A_Path 能力可见可用。
- **C_Path**:通过 **VS Code / Cursor 扩展** + **IdeBridge** 双向桥接,把 A_Path 注入 IDE 工作流。C_Path **不削弱** A_Path——相反,把 A_Path 推到程序员每天都打开的 IDE 里,扩大 A_Path 触达面。
- **B_Path**(做新 IDE,在编辑器层面与 Cursor 正面对抗):**已被产品负责人明确否决**。理由:(a) 编辑器是 20 年红海,Cursor 都还在烧钱;(b) 我们的核心用户(U1–U3)根本不在编辑器里;(c) U5 程序员已经有顺手 IDE,不需要换。本文档以 B_Path 为反面参照,**不引入 B_Path 内容**。

---

## 3. 我们提供什么 — 不只是 chat

Cursor / Cascade / Cline 的 chat 输出是**"代码 + 你自己 review + 你自己 apply"**。我们对标这一层 chat 但**输出和闭环都不一样**:

### 3.1 对话框 + Agent 模式的"对标层"

我们对标的不是 IDE 编辑器本身,而是 IDE 内**那个 chat 框**:

| 维度 | Cursor Chat / Cascade | Agentrix Desktop |
|------|---------------------|------------------|
| **输入侧** | `@file` `@symbol` `@docs` `@web` mentions、`/` slash commands | 同档,**+ 自动判断"用户在说哪个项目/页面/数据"**,不用 PM 自己 mention |
| **过程侧** | 显示 plan + tool calls,可以打断 | 同档,**+ 用人话解释每一步**(非"Reading file X" 而是"我在看你的页面是怎么实现的") |
| **结果侧** | 给 raw diff,用户自己 apply | **+ 自动跑构建、自动截图、自动用人话报"我做完了,看,网页是这样的"** |
| **失败侧** | "Continue" 续接 | **+ 当遇到不可逆决策时,翻译成"安全/需要确认/危险"3 级,不用 L0-L3** |
| **跨 Turn** | session memory | **+ 长记忆 ambient HUD: 我记得你上次...** |
| **跨设备** | 不可能 | **+ 关闭桌面任务继续跑,手机收到完成推送** |
| **跨工具** | 不可能 | **+ 浮球记住跨 Chrome / Office / VS Code 的上下文** |

### 3.2 Cursor 们做不到的差异化

这五件是**我们独有**的护城河,不只是 nice-to-have:

1. **跨工具上下文记忆**(浮球 + 桌宠 + 长记忆系统):用户从 Chrome 切到 Office 切到 VS Code,Agentrix 都跟着记上下文。Cursor 只活在它自己窗口里。
2. **长任务后台执行**:用户白天提"帮我把这周的小红书内容做了",合上电脑去吃饭,晚上回来看结果。Cursor 必须前台开着。
3. **跨端协作**:在桌面给 agent 派活,去开会用手机看进度,在 watch 收到完成提醒。Cursor 没有移动端。
4. **人话总结 + 自动验证**:agent 改完 → 自动跑 → 自动截图 → 用人话告诉你"做完了,看上去是这样的"。Cursor 给你 diff,你自己跑。
5. **Living Pet 灵魂 + Marketplace**:一个有人格、能成长、能买卖的 agent 灵魂。Cursor 是工具,我们是**伙伴**。

### 3.3 用户成长 3 段位 → 产品 3 种深度

| 段位 | UI 默认深度 | 屏蔽 / 暴露 |
|------|------------|------------|
| **L1 第一次用** | Simple Mode | 屏蔽:Plan/Agent/Ask 切换、tier router、L0-L3 级别、9 个 More 面板。暴露:chat、人话总结、安全/确认/危险三级 |
| **L2 用了 1 个月** | Standard Mode | 暴露:tool call 详情、diff preview、approval 流程、跨端 handoff |
| **L3 高阶用户 / 程序员** | Pro Mode | 全暴露:memory wiki、自进化 dashboard、agent persona 编辑、tier router、IDE 桥接、raw diff、`@symbol` mention |

**关键设计原则**:**默认 = L1**。让用户**主动选择往深处走**,而不是被默认深度淹死。

**默认行为承诺(产品负责人 2026-05-24 决策)**:

- 用户**首次进入应用时**,默认是 **Simple Mode**。
- Simple / Standard / Pro 之间切换是**手动一键(mode picker)**,**不做基于行为或注册元数据的自动检测**。
- 程序员用户首次进入也是 Simple Mode,需要**手动**切到 Pro Mode 才能看到 raw diff / IDE 桥接 / tier router 等 coding 视图。
- 任何未来 PRD 提议"自动检测程序员身份预设 Pro Mode",**以本文档为准被否决**。

### 3.4 C_Path coding 体验对等维度(对程序员用户的对等承诺)

A_Path 是我们独有,**C_Path coding 体验**是我们与 Cursor / VS Code chat 在 IDE 内**对等**的维度——这一档不做差异化,只做"程序员用着不会比 Cursor 差":

| 维度 | 当前状态 |
|------|---------|
| **`@file` / `@symbol` / `@docs` / `@web` mentions** | ✅ P-3 已落地 |
| **`/` slash commands** | ✅ P-3 已落地 |
| **工具调用 inline 默认展开 + diff preview** | ✅ Pro Mode 暴露 |
| **Plan / Agent / Ask 三种交互模式切换** | ✅ Standard / Pro 暴露 |
| **Tab autocomplete / Cmd+K inline edit** | ❌ 不在 Agentrix 自有界面做(见 §4)。**通过 VS Code 扩展场景下复用 IDE 原生** |

**实现路径**:这些 coding 维度的可达性是 **(a) Agentrix 自身桌面端 Pro Mode 暴露** + **(b) 通过 VS Code / Cursor 扩展把 Agentrix agent 注入 IDE 的 chat 面板**,**不是**构建 Agentrix 自己的编辑器界面。换言之,Pro Mode 给程序员一份"在 Agentrix 内的 coding chat",VS Code 扩展把同一份 agent 推到他们更熟悉的 IDE 工作流。

---

## 4. 我们不做什么(对内的"不"清单)

每条都附理由,**这一条很重要**——产品成功一半是知道不做什么。

| 不做 | 理由 |
|------|------|
| ❌ 嵌入 Monaco 做**主**编辑器 | 卷不过 Cursor + 我们用户根本不在编辑器里写字。**注**:这只针对 Agentrix 自有界面;VS Code 扩展场景**复用 IDE 原生 Monaco**。 |
| ❌ Tab autocomplete | 同上 + 我们用户没"光标在代码里"这个动作。**注**:在 Agentrix 自有界面不做;VS Code 扩展场景**复用 IDE 原生**的 Tab 补全。 |
| ❌ Cmd+K inline edit | 同上。**注**:在 Agentrix 自有界面不做;VS Code 扩展场景**复用 IDE 原生**的 Cmd+K。 |
| ❌ Go to Definition / Find All References / F2 重命名 | 编辑器内动作,不是我们用户的 loop。**注**:在 Agentrix 自有界面不做;VS Code 扩展场景**复用 IDE 原生**。 |
| ❌ 在 chat 里教用户写代码 | 是 ChatGPT 的事,不是我们的事。 |
| ❌ 给用户看"raw diff"作为主体验 | 用户不懂 diff,看了焦虑。raw diff 应该是 Pro Mode 才暴露。 |
| ❌ 用 L0 / L1 / L2 / L3 这种工程化级别 | 翻译成"安全 / 需要你确认 / 危险"。 |
| ❌ 用 "tier: local / smart / cloud" 这种工程化 router | 翻译成"快 / 平衡 / 最强",或者直接默认 smart 不暴露。 |
| ❌ 期待用户理解 "session / turn / context window / token" | 全部翻译成"对话 / 这次提问 / 记忆 / 对话长度",或者直接 ambient 显示进度条。 |
| ❌ 做新 IDE(B_Path) | 已被产品负责人否决,见 §2.1 / 术语表。 |

### 4.1 我们做但不作为主入口(C_Path 形态)

下列**不是**"不做"——它们是 C_Path 的承载形态,**做但不放在主入口**:

| 形态 | 角色 | 不放主入口的理由 |
|------|------|----------------|
| **VS Code / Cursor 扩展** | C_Path 主形态。把 Agentrix agent 注入 IDE 的 chat 面板,服务 U4 / U5 程序员 | 主入口仍是 Agentrix 桌面端 / 浮球 / 跨端体验。扩展是**触达**程序员、扩大 A_Path 注入面的渠道,不取代桌面端体验。 |
| **IdeBridge 双向桥接协议** | C_Path 协议层。IDE 内调 Agentrix、Agentrix 反向调 IDE | 同上。是接口能力,不是入口形态。 |
| **CLI 入口(`agentrix` / `axp` 命令)** | 兜底入口,主要服务 U5 程序员调试 | 不暴露在 onboarding,Pro Mode 才发现。 |

---

## 5. 我们的话术 — 对外怎么说

### 5.1 一句话宣传(按场景)

| 场景 | 话术 |
|------|------|
| 落地页大字 | "和 Agentrix 一起,把 idea 做成现实" |
| 一句话副标题 | "你说人话,它把事做完——AI 协作伙伴" |
| 给非技术朋友 | "ChatGPT 帮你想,Agentrix 帮你做" |
| 给产品经理 | "你写 PRD 给 Agentrix,它直接交付,不用排期" |
| 给程序员朋友 | "Agentrix 让 Cursor / VS Code **多一层**:跨工具记忆 + 跨端协作 + 长任务后台,补在你已有的 IDE 工作流之上" |
| 给投资人 | "面向 LLM 时代的全人群,Unified_Agent_Plan 单一订阅覆盖非编程 + 程序员两边市场,+ 跨端 + 跨工具 + 长任务" |

### 5.2 不要说什么

| ❌ 不要说 | ✅ 改成 |
|----------|--------|
| "AI IDE" | "AI 协作伙伴" |
| "代码生成工具" | "把 idea 做成现实的伙伴" |
| "Agent 编排平台" | "AI 团队帮你干活" |
| "Cursor 替代品" | "Agentrix 与 Cursor / VS Code **协作而非替代**——通过扩展 + IdeBridge 把跨工具记忆 / 长任务 / 跨端注入 IDE 工作流" |
| "只服务非编程用户" | "默认非编程友好,程序员一键切 Pro 模式" |
| "全自动开发" | "陪你做事,关键时刻你确认" |
| "L2 risk approval needed" | "需要你确认一下" |
| "context tokens used 75%" | "对话长度:约 3/4 满"或干脆不显示 |

### 5.3 视觉语言

- **不要**:终端配色、绿底黑字、cyber neon、冷色科技感(那是 Cursor / Hacker News 美学)
- **要**:暖色 / 浅色 / 圆润 / 桌宠 / 像在跟一个角色对话(那是 Notion / Coze / 我们独有的 Living Pet)

---

## 6. 现状盘点(2026-05-24 更新版)

### 6.1 已有的、可以放大的(✅ Shipped)

桌面端基础(Pre-launch P-1 / P-2 / P-3 + Post-launch P-1 + Pro Mode F1 sprint 已完成,见 §7 时间线)。

- ✅ 双链路 chat(`/openclaw/proxy/:id/stream` + `/claude/chat`)
- ✅ 长记忆系统、自进化系统(后端)
- ✅ 多 agent 编排(`desktopAgentSync`)
- ✅ 跨端推送(presence socket)
- ✅ 桌宠 Living Pet(灵魂 × 皮肤双层架构)
- ✅ 桌面端基础性能(Pre-launch P-1 之后)
- ✅ Light / Dark 主题完整对齐(Pre-launch P-2 codemod + e2e luminance 检查)
- ✅ Computer Use(截屏、点击、CDP 浏览器)
- ✅ Approval 三层授权 + 人话化文案(安全 / 需要确认 / 危险)
- ✅ Workspace context 自动注入(2 级目录树)
- ✅ **Simple / Standard / Pro 三档 mode picker**(默认 Simple,Pre-launch P-3)
- ✅ **`@file` / `@symbol` / `@web` / `@docs` mention + `/` slash command**(Pre-launch P-3 + Pro Mode F1)
- ✅ **TurnSummaryFooter**(任务结束人话总结 + 下一步,Pre-launch P-3)
- ✅ **AmbientMemoryHUD**(长记忆 / 自进化能见度,Pre-launch P-3)
- ✅ **TodaysChangesPanel + 一键撤销**(信任感,Pre-launch P-3)
- ✅ **自动验证 + 截图**(快赢版,Pre-launch P-3)
- ✅ **长任务后台执行前端**(REST 客户端 → `/api/agent-tasks`,自适应 6s/30s polling,Post-launch P-1)
- ✅ **跨工具上下文记忆**(浮球 ambient memory bar,8s polling + 12 类 app classify,Post-launch P-1)
- ✅ **跨端协作 UI**(HandoffBanner、PushToDeviceButton、More 菜单按 mode 过滤,Post-launch P-1)
- ✅ **Pro Mode coding 视图**(Workspace Diff Workbench / OpenInIdeButton / `@symbol` picker,Pro Mode F1 sprint)
- ✅ **营销话术参考库**(`docs/business/POSITIONING_MESSAGING_v2026-05.zh-CN.md`,Pro Mode F2)
- ✅ **下游 PRD 双人群对齐补丁**(cross-platform-v5 / desktop-v4 / mobile-v5,Pro Mode F3)

### 6.2 待办(launch-ready 收尾 + Post-launch)

P0 / 上线前必须做完的项目此时**已经全部完成**(全部从 §6.2 移到 §6.1)。

剩下的项目按时间分布在下面 §7 路线图里:

- 🔄 **Backend agent-task worker 收尾**(P-1 残留唯一项):前端已对接 `/api/agent-tasks` 但 backend job runner 实际执行 agent 任务的 worker 部分尚未在生产 push,留 launch 前 1-2 天补完。
- 🟡 Marketplace + Living Pet 灵魂 × 皮肤完整闭环(P2)
- 🟡 Toy 联动 BLE / Wi-Fi 直驱(P2,需硬件)
- 🟡 自进化 dashboard 公开化(P2)
- 🟡 IdeBridge UI 雏形(P2,与 P3 扩展形态衔接)
- 🟢 VS Code / Cursor 扩展(P3,2026-08+)
- 🟢 IdeBridge 完整双向桥接(P3)
- 🟢 Coding_Plan_Revenue 归因脚本(上线 30 天后,数据驱动)

### 6.3 不优先做、避免分心

- ❌ B_Path:卷 IDE 编辑器(见 §2.1 / 术语)
- ❌ 在 Agentrix 自有界面做 Tab autocomplete(VS Code 扩展场景复用 IDE 原生)
- ❌ 冷色 cyber neon UI 改造

> **注**:VS Code / Cursor 扩展(C_Path 主形态)**不**在"不优先做"清单——
> 见 §7 Sprint Post-launch P3。Pre-launch 阶段聚焦 Simple Mode + 9 项 quick win,
> 扩展形态留到 Post-launch 立项。

### 6.4 商业模型 — Unified_Agent_Plan

**Agentrix 的付费侧采用 Unified_Agent_Plan(统一 Agent 套餐)单一订阅,覆盖所有人群(U1–U5)**。

- **不出独立 Coding Plan**(也不出 Creator Plan / Pro Coder Plan)。
- Coding 高阶能力的解锁通过 **mode picker 切到 Pro Mode** 完成,**不通过单独购买**(P-3 已落地 mode picker)。
- **Coding_Plan_Revenue 仍是行业核心盈利来源**(参见 Cursor / GitHub Copilot 营收数据)。Unified_Agent_Plan 必须能承载这一营收。
- **内部归因口径**:Coding_Plan_Revenue 不依赖独立 SKU,而是把 Unified_Agent_Plan 营收按用户使用 **Pro Mode 占比加权**计算。具体阈值(N% sessions in Pro Mode → 归入 coding 营收)留待 design 阶段或后续 business spec 决定。

**为什么不做独立 Coding Plan**:
- 独立 SKU 强迫用户**自我分类**,违背 Simple → Pro 的成长曲线设想。
- U2(产品经理)等中间段位用户**两侧都想要**,独立 SKU 会逼他们二选一。
- Unified_Agent_Plan 让定价**简单**,运营**统一**,营销话术**不分裂**。

---

## 7. 路线图(2026-05 → 2026-08+)

### 已完成(2026-05-23 ~ 2026-05-24)

**Sprint Pre-launch P-1 — 性能基础设施**(`bf3e57e1e`)
- `uiFeedbackStore` zustand store + `useFeedbackTimer` 集中 2s tick
- App.tsx 962→543 行(`useWindowManager` + `useServiceBootstrapper`)
- 51 个 sync `#[tauri::command]` → `async`
- vitest 91/91 + e2e 134/134

**Sprint Pre-launch P-2 — Light Theme codemod**(`94f474f52` + `fae6ab6d2`)
- 245 + 125 处 inline color → CSS variables
- `global.css` 1617 → 473 行(-71%)
- `light-theme-smoke.spec.ts` luminance 检测 e2e

**Sprint Pre-launch P-3 — 9 项非编程 UX**(`c42413cfa`)
- Simple / Standard / Pro mode picker(默认 Simple)
- Approval 文案人话化(安全 / 需要确认 / 危险)
- `@` `/` autocomplete + TurnSummaryFooter + ThinkBlock streaming
- AmbientMemoryHUD + TodaysChangesPanel + 自动验证截图
- BackgroundTasks scaffolding

**Sprint Post-launch P-1 — 跨端 + 长任务**(`4c8a0a344`)
- 长任务后台执行前端(REST 客户端 + 自适应 polling)
- 跨工具上下文记忆(浮球 ambient memory bar)
- 跨端协作 UI(HandoffBanner / PushToDeviceButton / More 菜单 mode 过滤)
- 段位 L2 / L3 切换深度差异化

**Sprint Positioning Revision**(`f93365552`)
- 本定位文档双人群修订(commit + spec `positioning-revision-2026-05`)
- 12/12 mechanical correctness checks PASS

**Sprint Pro Mode Coding Views**(`00bba7b40`)
- F1: Pro Mode 暴露 raw diff workbench / Open in IDE button / `@symbol` picker
- F2: 营销话术参考库
- F3: 3 份下游 PRD 双人群对齐补丁

### Sprint Pre-launch 收尾(launch 前 1-2 天)

**剩唯一一项**:

- 🔄 **Backend agent-task worker**:前端 P-1 已对接 `/api/agent-tasks`,但 backend 实际任务消费 worker(执行 agent 任务并写回 task status / artifacts)尚未在生产 push。需要 1-2 天:实现 NestJS worker / queue consumer + 写回结果到 `agent_task_records` + e2e 验证桌面端长任务跑通后台。

完成后即 launch-ready。

### Sprint Post-launch P2(2026-07)

- Marketplace + Living Pet 灵魂 × 皮肤完整闭环(部分已 ship,见 pet-sprint P-1 ~ P-7 系列)
- Toy 联动(BLE / Wi-Fi 直驱,需硬件)
- 自进化 dashboard 公开化(让用户主动看见 agent 在变强)
- IdeBridge UI 雏形(为 P3 扩展形态铺路;Agentrix 桌面端展示 IDE 桥接状态)

### Sprint Post-launch P3(2026-08+)— C_Path 主形态

- **VS Code / Cursor 扩展(C_Path 主形态)**:把 Agentrix agent 注入 VS Code / Cursor 的 chat 面板,**复用 IDE 原生**的代码编辑 / diff / Tab 补全;扩展只贡献 Agentrix 独有的**跨工具记忆 + 长任务 + 跨端**。目标:让 U4 / U5 程序员在不离开 Cursor / VS Code 的前提下用上 A_Path。
- **IdeBridge 完整化(双向桥接)**:
  - (a) IDE 内 chat / agent 调 Agentrix agent 与长记忆;
  - (b) Agentrix 桌面端 / 浮球反向调 IDE 命令(打开文件、跳转、运行任务、调用 IDE 内置工具)。
  - 协议层提交到 `shared/types/`,Web / Desktop / Mobile / VS Code 扩展共用同一份契约。
- **Coding_Plan_Revenue 归因脚本**:基于上线 30 天数据,确定 N% Pro Mode session 阈值,生成营收拆分 dashboard。
- **不在 P3**:扩展不会塞 Pre-launch / P1 / P2 收尾——上述阶段聚焦 A_Path 与 launch readiness。

### 路线图调整说明(2026-05-24)

> 原 P1 计划在 2026-06 完成,实际**提前到 2026-05-23 ~ 24 完成**(借 Pre-launch sprint 加速)。
> 原 P2 中"`ideBridge` UI 雏形"调整到 P3 完整 C_Path 主形态一并交付(避免半拉子 UI)。
> P3 时间窗口保持 2026-08+,但**前置依赖**(Pro Mode F1 三件套)已就绪,P3 启动时不再需要先做基础设施。

---

## 8. 衡量指标(怎么知道我们走对了)

按象限,**前两个是核心,Coding_Plan_Revenue 是商业基本盘**:

| 维度 | 指标 | 目标(上线 30 天) |
|------|------|------------------|
| **用户结构** | 非技术用户(U1+U2+U3)占活跃用户比例 | ≥ 70% |
| **价值感** | "首次完成一个落地任务"漏斗 | ≥ 60%(对比 ChatGPT-4 的 30% 是 Notion AI 数据) |
| **商业基本盘 1** | 程序员用户(U4+U5)付费率 | ≥ 25% |
| **商业基本盘 2** | Coding_Plan_Revenue 占总营收比例(按 Pro Mode 使用占比归因,**不依赖独立 SKU**) | ≥ 35% |
| 体验流畅 | 对话框 + agent 模式的 turn 完成时长 (p50) | ≤ 30s 短任务、≤ 10min 长任务 |
| 差异化能见 | 长记忆/自进化的"我记得你..."触发用户主动询问比例 | ≥ 25% |
| 留存 | 7 日留存 | ≥ 35% |
| 信任 | approval 通过率 | ≥ 85%(过低=用户不信任,过高=approval 流于形式) |
| 跨端 | 至少使用过 2 端的用户比例 | ≥ 30%(防止只是"桌面工具") |
| C_Path 触达(P3 上线后) | VS Code / Cursor 扩展 MAU 占程序员用户比例 | ≥ 40%(P3 上线后 30 天) |

> **指标说明**:
>
> - 上面三档"用户结构 / 价值感 / 商业基本盘"必须**同时**达标。只达"用户结构"(70% 非编程占比)但 Coding_Plan_Revenue 不到 35% 意味着商业模型亏损,需要复盘 Pro Mode 价值;只达 Coding_Plan_Revenue 但非编程占比低意味着我们事实上变成 Cursor 平替,违背 A_Path 定位。
> - **不引入需要独立 Coding Plan SKU 的指标**——所有"coding 营收"都通过 Pro Mode 使用占比归因。
> - "Coding_Plan_Revenue 占比 ≥ 35%"是相对**保守**的目标,反映 U4+U5 占比仅 22% 的人均付费水平。如果未来 U5 占比上升,这一目标可上调到 50%+。

---

## 9. 与现有 PRD 的关系

| PRD | 与本文档的关系 |
|-----|--------------|
| `agentrix-cross-platform-prd-v4.md` / v5 | 跨端契约层,本文档不重写,只补"非技术用户分段 + Coding_Plan_Revenue 双轨"原则 |
| `desktop-prd-v3.md` / v4 | 桌面形态规范,本文档补"Simple/Standard/Pro 三深度 + Pro 暴露 ideBridge" |
| `mobile-prd-v4.md` / v5 | 移动端,本文档补"跨端任务回看是核心,不是辅助" |
| `wearable-prd-v3.md` | Watch,本文档补"任务完成提醒是 Watch 第一价值" |
| `desktop-pre-launch-p1-perf-2026-05-23.md` 等 sprint 报告 | 落地证据 |

### 9.1 下游受影响文档清单(本次 2026-05-24 修订之 follow-up)

本次修订**不修改下游文档实质内容**,仅列入清单作为 follow-up 任务。
团队成员在更新下列文档时**应回看本定位文档**确认一致性:

| 下游文档 | 可能需要更新的内容 |
|---------|-------------------|
| `docs/agentrix-cross-platform-prd-v5.md` | 用户画像段加入 U5 程序员;商业模型段写明 Unified_Agent_Plan;路线图加 P3(VS Code 扩展 + IdeBridge) |
| `docs/desktop-prd-v3.md` / v4 / v5 | Pro Mode 章节加入 "raw diff / IDE 桥接 / `@symbol`" coding 视图;首次进入默认 Simple 写明承诺 |
| `docs/mobile-prd-v5.md` | 移动端不暴露 Pro Mode,但保持跨端任务镜像与 Coding 用户 push 通知一致 |
| 营销话术文件(landing copy / blog templates / press kit) | "给程序员朋友"话术从旧版的"Cursor 仅服务程序员"改为"Agentrix 让 Cursor 多一层";投资人话术从"非技术用户"扩展到"全人群 + Unified_Agent_Plan" |
| Settings 默认值文档 | 首次进入 = Simple Mode 的硬承诺,无自动检测;mode picker 是手动一键 |
| 招聘 JD 模板 | "我们是 AI 协作伙伴,服务非编程优先 + 程序员两条人群"取代"我们是 AI IDE"或"只服务非编程"的旧表述 |

> **执行约束**:本文档为单一信息源(SSOT)。任何下游 PRD 与本文档冲突时,**以本文档为准**。
> 如下游 PRD 的具体决策需要更新本文档,需要在 PR 中显式注明 "更新 positioning 共识"
> 并经产品负责人 review。

---

## 10. 结论 — 一句话总结给团队

> 我们做的不是"AI IDE",是 **AI 时代的协作伙伴**。
>
> 用户说人话,我们把事做完。**程序员 + 非编程用户都是目标人群**,默认 Simple 模式服务非编程优先,Pro 模式让程序员一键解锁 coding 视图。我们不卷 Cursor 的编辑器,我们做 Cursor 做不到的:**跨工具记忆、跨端协作、长任务后台、人话交付、伙伴感**。对 Cursor / VS Code 用户,我们通过 **C_Path(扩展 + IdeBridge)** 注入 Agentrix 的差异化能力,与他们既有的 IDE 工作流**协作而非替代**。
>
> 任何产品决策,先问两句:
>
> 1. "这一步对**不会写代码**的人友好吗?"(Simple 模式底线)
> 2. "这一步对**会写代码**的程序员有效率提升吗?"(Pro 模式价值,Coding_Plan_Revenue 基本盘)
>
> 如果两个都不满足,要么改、要么不做。如果只满足其一,问自己:这个决策属于 Simple 模式 vs Pro 模式哪一档,然后**只在那一档**落地,不要让另一档承担代价。


---

## 修订记录

| 日期 | 触发 | 变更摘要 | 校验 |
|------|------|---------|------|
| 2026-05-23 | 团队首版 | 初稿,**非编程用户独占**定位(后被纠正) | — |
| **2026-05-24** | **产品负责人 4 项决策** | **§0 / §1 / §2 / §3 / §4 / §5 / §6 / §7 / §8 / §9 / §10 + 新增"术语"段**,将 Agentrix 定位修订为**程序员 + 非编程用户双轨化**;明确 **Unified_Agent_Plan 单一订阅**(无独立 Coding Plan SKU);明确 **A_Path 差异化护城河 + C_Path IDE 协作伴侣**双路径;**否决 B_Path 做新 IDE**;§7 路线图新增 **P3 (VS Code 扩展 + IdeBridge)**;§8 衡量指标新增 **Coding_Plan_Revenue 双轨化** | **`desktop/scripts/validate-positioning.mjs` 12/12 PASS** |
| **2026-05-24 (路线图对账)** | **Sprint 实际进度对账** | §6.1 / §6.2 / §7 — Pre-launch P-1/P-2/P-3 + Post-launch P-1 + Pro Mode F1/F2/F3 已完成,从"缺的"清单移到"已有的"清单;P-1 计划提前到 5-23~24 完成;P-2 中 ideBridge UI 雏形并入 P-3;新增"Sprint Pre-launch 收尾"小节(剩 backend agent-task worker 一项待办) | **`desktop/scripts/validate-positioning.mjs` 12/12 PASS** |

**产品负责人 4 项决策**(本次修订的输入):

1. **用户优先级**:非编程**优先**(默认 Simple 模式),但**程序员可一键切 Pro**——两条人群都是目标。
2. **付费侧目标**:**Unified_Agent_Plan 单一订阅**,不出独立 Coding Plan SKU,通过 Pro Mode 解锁 coding 体验。
3. **与 Cursor / VS Code 协作姿态**:**两者都做**——出 VS Code / Cursor 扩展(注入 Agentrix agent)+ IdeBridge 双向桥接(IDE 调 Agentrix、Agentrix 调 IDE)。
4. **Simple 默认 + 一键切换**:第一次进入 = Simple,程序员**手动**切 Pro,**不做自动检测**。

**Spec 路径**:`.kiro/specs/positioning-revision-2026-05/`(requirements.md / tasks.md)。
