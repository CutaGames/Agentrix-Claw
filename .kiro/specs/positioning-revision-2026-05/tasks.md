# Implementation Plan

> **Spec**: Positioning Revision 2026-05
> **Target**: 修订 `docs/agentrix-positioning-2026-05.zh-CN.md`(原地,不新建)
> **Strategy**: 跳过 design 阶段。Requirements 已精确指向各小节,直接落 task。
> **Validation**: 每完成一组小节,跑 `desktop/scripts/validate-positioning.mjs`
> 校验 C1–C12 自检清单,全 PASS 才进入下一组。

## Overview

本 implementation plan 把 `requirements.md` 的 16 个 Requirement 落成 7 个
phase、共 19 个 task。所有 task 仅修改 4 个文件:

1. `docs/agentrix-positioning-2026-05.zh-CN.md`(主修订对象,原地改)
2. `desktop/scripts/validate-positioning.mjs`(新建,机械化自检)
3. `.kiro/specs/positioning-revision-2026-05/requirements.md`(已存在,不动)
4. `.kiro/specs/positioning-revision-2026-05/tasks.md`(本文档)

**不修改**任何下游 PRD、不写代码 feature、不动视觉品牌段(§5.3 freeze)。
所有修订必须使 `validate-positioning.mjs` 输出 `12/12 PASS`,否则回退。

## Tasks

---

## Phase 1: 自检脚本 + 元信息

- [ ] **Task 1.1: 写机械化自检脚本 `desktop/scripts/validate-positioning.mjs`**
  - 读取 `docs/agentrix-positioning-2026-05.zh-CN.md` 全文
  - 实现 C1–C12 全部检查项,返回 `{ passed, failed, details }` 结构
  - 失败时 `process.exit(1)`,CI 友好
  - 支持 `--verbose` 输出每一项 PASS/FAIL 行号定位
  - _Requirements: 15 (Correctness Properties), 验收所有其他 Requirement 用_

- [ ] **Task 1.2: 更新文档元信息块**
  - 修改"上一次更新: 2026-05-23" → "上一次更新: 2026-05-24"
  - 撰稿行加入 "+ 产品负责人 (修订)"
  - 文末新增"## 修订记录"小节,登记本次修订:日期、触发(产品负责人 4 项决策)、变更摘要
  - _Requirements: 1.1, 1.3, 1.4_

---

## Phase 2: 核心定位陈述(§0 + §1 + §10)

- [ ] **Task 2.1: 重写 §0 TL;DR(双人群化)**
  - 第一行从"面向不会写代码的人的 AI 协作伙伴"改为"面向所有想把 idea 做成现实的人(程序员 + 非编程用户)的 AI 协作伙伴"
  - 第二行"它不是 IDE,不是 Cursor / Windsurf / Cline 的替代,不和 VS Code 卷编辑器"改为"它**不卷 IDE 编辑器层**,但通过 VS Code / Cursor 扩展 + IdeBridge **协作赋能**,把 Agentrix 的跨工具记忆 / 长任务 / 跨端协作注入你已有的工作流"
  - 验收:C7 PASS(单独一行不再是排他陈述)
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ] **Task 2.2: 重写 §1 用户画像表(去 U5 删除线 + 加 Coding_Plan_Revenue 注脚)**
  - U5 去掉 `~~ ~~` 删除线
  - U5 描述改为:"专业程序员、Cursor / VS Code 重度用户、独立开发者"
  - U5 占比目标设为 `15%`(将原 U1-U4 的 40/30/20/10 等比缩到 35/25/18/7,留 15% 给 U5)
  - U5"今天怎么干活"列填:"用 Cursor / Windsurf / Claude Code 写代码,把 chat 当 raw diff 工具"
  - U5 关系列追加:"我们对他们 = 跨工具记忆 + 长任务 + 跨端协作的增量,不替代编辑器"
  - 删除"~~不是核心~~,他们用 Cursor / Windsurf 更顺手"行
  - "关键判断"段落:第一条"我们的核心用户**永远不需要自己改代码**"改写为"**Simple 模式下用户不需要自己改代码;Pro 模式下程序员可以直接接管代码、查看 diff、调用 IDE 桥接**"
  - 加新条目:"**Coding_Plan_Revenue(以编程为主要场景的订阅营收)仍是行业核心盈利来源**,Unified_Agent_Plan 必须能承载这一营收"
  - 验收:C2-a PASS, C2-b PASS, C9 PASS
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] **Task 2.3: 重写 §10 结论(双人群提问)**
  - 保留"AI 协作伙伴"主轴
  - "任何产品决策,先问一句:'这一步对不会写代码的人友好吗?'"改为"任何产品决策,先问两句:'这一步对**不会写代码**的人友好吗?对**会写代码**的程序员有效率提升吗?'"
  - 不要加任何排他程序员的句子
  - 验收:C8 PASS
  - _Requirements: 14.1, 14.2, 14.3_

---

## Phase 3: 竞争 / 协作姿态(§2 + §3)

- [ ] **Task 3.1: 重写 §2 竞争关系表(VS Code / Cline 行)**
  - VS Code/Cursor/Windsurf/Kilo Code 行的关系列从"**不竞争**"改为"**差异化协作**——不在编辑器层正面竞争,而是通过 VS Code 扩展 + IdeBridge 把 Agentrix 的跨工具记忆 / 长任务能力**注入** IDE 工作流"
  - Cline/Claude Code/aider 行的关系列改为"**chat+agent 体验对标**——同档输入输出流畅度,差异化在跨工具上下文 / 跨端协作 / 长任务后台"
  - "结论"段保留对手是"Notion AI / Coze / Bolt / Lovable / Devin"
  - 验收:C5(部分,§2 中含 ideBridge),不引入 B_Path
  - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [ ] **Task 3.2: 在 §2 末尾加 A_Path / C_Path 子节**
  - 新增"### 2.1 A_Path(差异化护城河)与 C_Path(IDE 协作伴侣)"
  - A_Path 一句话:"Cursor/VS Code 无法复刻的能力——跨工具上下文记忆、长任务后台、跨端协作、人话总结+自动验证、Living Pet 灵魂+Marketplace。这是产品壁垒,优先级最高"
  - C_Path 一句话:"通过 VS Code/Cursor 扩展 + IdeBridge 双向桥接,与现有 IDE 协作而非竞争。C_Path 不削弱 A_Path,反而把 A_Path 注入 IDE 工作流"
  - 显式说明:"**B_Path(做新 IDE 与 Cursor 正面对抗)已被产品负责人否决**——做不过、用户也不在我们这里"
  - 验收:C4-a 部分(§2 含 ideBridge), C11 PASS
  - _Requirements: 3.3, 16.2_

- [ ] **Task 3.3: §3.2 之后新增 §3.4 "C_Path coding 体验对等维度"**
  - 列出至少 3 个维度,例如:
    - `@file/@symbol/@docs/@web` mentions(已有)
    - 工具调用 inline 展开 + diff preview
    - `/` slash commands(已有 P-3 落地)
    - tool call inline 默认展开
  - 显式声明:"这些 coding 维度的实现路径是 (a) Agentrix 自身桌面端 Pro Mode 暴露 + (b) 通过 VS Code/Cursor 扩展把 Agentrix agent 注入 IDE 的 chat 面板,而不是构建 Agentrix 自己的编辑器界面"
  - 不要修改 §3.1 (chat 对标层) 或 §3.2 (5 大差异化)
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] **Task 3.4: §3.3 段位表加"Simple 默认 + 一键切换"明文承诺**
  - 在表格下加一段:"**默认行为承诺**:用户首次进入应用时,默认是 **Simple Mode**。Simple/Standard/Pro 之间切换是 **手动一键(mode picker)**,**不做基于行为或注册元数据的自动检测**。任何未来 PRD 提议自动检测程序员身份预设 Pro Mode 的,以本文档为准被否决"
  - 验收:C10 PASS
  - _Requirements: 10.1, 10.2, 10.3_

---

## Phase 4: "不做"清单软化(§4)

- [ ] **Task 4.1: 重写 §4 关于 IDE 扩展的硬约束**
  - "❌ 出 VS Code 扩展" 整行删除,在 §4 之后另起 §4.1 "我们做但不作为主入口" 子节,其中说明:"**VS Code/Cursor 扩展是 C_Path 的主形态之一**,通过把 Agentrix agent 注入 IDE 的 chat 面板服务程序员用户。但它不是主入口——主入口仍是 Agentrix 桌面端 / 浮球 / 跨端体验"
  - "❌ 嵌入 Monaco 做编辑器" 改为"❌ 嵌入 Monaco 做**主**编辑器"(加"主"限定)
  - "❌ Tab autocomplete" / "❌ Cmd+K inline edit" 保留,但加注脚:"(在 Agentrix 自有界面内不做。VS Code 扩展场景中**复用 IDE 原生**的对应能力)"
  - "❌ Go to Definition / Find All References / F2 重命名" 保留,加同上注脚
  - "❌ 在 chat 里教用户写代码" 保留(这是定位决策,非硬约束的歧义)
  - 验收:C1 PASS(grep "❌ 出 VS Code 扩展" 返回 0)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

---

## Phase 5: 话术 / 衡量 / 商业模型(§5 + §6 + §8 + §9)

- [ ] **Task 5.1: 重写 §5.1 "给程序员朋友"行**
  - 原文 "Cursor 帮你写代码,Agentrix 帮你管全流程——从需求到上线到运营" 改为"Agentrix 让 Cursor / VS Code **多一层**:跨工具记忆 + 跨端协作 + 长任务后台,补在 IDE 工作流之上"
  - 验收:C6 PASS(grep "Cursor 是给程序员的" 返回 0)
  - _Requirements: 6.1, 6.2_

- [ ] **Task 5.2: 重写 §5.2 "不要说什么"表 "Cursor 替代品"行**
  - ❌ 列保持 "Cursor 替代品"
  - ✅ 列从 "Cursor 是给程序员的,Agentrix 是给所有人的" 改为 "Agentrix 与 Cursor / VS Code **协作而非替代**——通过扩展 + IdeBridge 把跨工具记忆/长任务/跨端注入 IDE 工作流"
  - _Requirements: 6.4_

- [ ] **Task 5.3: 保留 §5.1 "给非技术朋友"行 verbatim**
  - 这一行 "ChatGPT 帮你想,Agentrix 帮你做" 不动
  - 验收:C12 PASS
  - _Requirements: 6.3_

- [ ] **Task 5.4: §5.3 视觉语言段 freeze**
  - 不修改这一段任何字
  - 在 PR diff 中明确标注 "§5.3 视觉语言: NO CHANGE"
  - _Requirements: 13.1, 13.2, 13.3_

- [ ] **Task 5.5: §6 现状盘点新增 §6.4 "商业模型"**
  - 新建 §6.4 "商业模型 — Unified_Agent_Plan"
  - 内容:"Agentrix 的付费侧采用 **Unified_Agent_Plan**(统一 Agent 套餐)单一订阅,覆盖所有人群(U1–U5)。**不出独立 Coding Plan**(也不出 Creator Plan / Pro Coder Plan)。Coding 高阶能力的解锁通过 mode picker 切到 Pro Mode 完成,不通过单独购买"
  - 追加:"**Coding_Plan_Revenue 仍是行业核心盈利来源**(Cursor / GitHub Copilot 数据),Unified_Agent_Plan 必须能承载这一营收。Coding_Plan_Revenue 在内部归因口径为:把 Unified_Agent_Plan 营收按用户使用 Pro Mode 占比加权(具体 N% 阈值留待 design 阶段定)"
  - 验收:C3 PASS
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] **Task 5.6: §8 衡量指标双轨化**
  - 保留现有 "非技术用户 (U1+U2+U3) 占活跃用户比例 ≥ 70%" 一行,目标值不变
  - 新增 "程序员用户 (U4+U5) 付费率" 行,30 天目标 `≥ 25%`
  - 新增 "Coding_Plan_Revenue 占总营收比例" 行,30 天目标 `≥ 35%`,加注脚说明"按 Pro Mode 使用占比归因,不依赖独立 SKU"
  - 不引入需要独立 Coding Plan SKU 的指标
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] **Task 5.7: §9 与现有 PRD 关系表新增 Downstream_Document_List**
  - 在 §9 现有表格之后追加 "### 9.1 下游受影响文档清单(本次修订之 follow-up)"
  - 列出 5 项:`agentrix-cross-platform-prd-v5.md`, `desktop-prd-v3.md` (及 v4/v5), `mobile-prd-v5.md`, 营销话术文件, Settings 默认值文档
  - 每项一句话说明可能需要更新什么
  - 显式声明:"本次修订**不修改下游文档实质内容**,仅列入清单作为 follow-up"
  - _Requirements: 11.1, 11.2_

---

## Phase 6: 路线图 + 术语表(§7 + §0 之前的 Glossary)

- [ ] **Task 6.1: §7 路线图新增 Sprint Post-launch P3**
  - 在现有 P2 之后新增 "### Sprint Post-launch P3(2026-08+)" 小节
  - 列两项:
    - "**VS Code / Cursor 扩展(C_Path 主形态)**:把 Agentrix agent 注入 VS Code/Cursor 的 chat 面板,复用 IDE 原生的代码编辑/diff/Tab 补全,只贡献 Agentrix 独有的跨工具记忆 + 长任务 + 跨端"
    - "**IdeBridge 完整化(双向桥接)**:(a) IDE 内 chat 调 Agentrix agent 与长记忆;(b) Agentrix 桌面端 / 浮球反向调 IDE 命令(打开文件、跳转、运行任务)"
  - 不要把这两项塞进 Pre-launch 或 P1
  - 验收:C4-a (§7 含 ideBridge), C5 PASS
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] **Task 6.2: 在文档顶部 §0 之前新增 "## 术语" 小节**
  - 定义 5 个核心术语:
    - **A_Path**: 差异化护城河(跨工具记忆/长任务/跨端/人话/Living Pet)
    - **C_Path**: IDE 协作伴侣(VS Code/Cursor 扩展 + IdeBridge)
    - **B_Path**: 做新 IDE,**已被否决**
    - **IdeBridge**: Agentrix 与外部 IDE 的双向桥接协议
    - **Unified_Agent_Plan**: 统一 Agent 套餐,无独立 Coding Plan SKU
  - 不修改任何已有术语定义(Living Pet / Marketplace / Workspace context / ambient HUD)
  - _Requirements: 16.1, 16.2, 16.3_

---

## Phase 7: 校验 + 回归

- [ ] **Task 7.1: 跑 validate-positioning.mjs 全部 12 项**
  - `node desktop/scripts/validate-positioning.mjs --verbose`
  - 期望:`12/12 PASS`,`process.exit(0)`
  - 任一项 FAIL 回到对应 Phase 的 task 重做
  - _Requirements: 15.1, 15.3_

- [ ] **Task 7.2: 修订记录小节最终化**
  - 在文末"## 修订记录"小节登记:
    - 日期: 2026-05-24
    - 触发: 产品负责人 4 项决策(非编程优先 / 统一 Agent 套餐 / VS Code 扩展+IdeBridge 双做 / Simple 默认)
    - 变更摘要: §0 / §1 / §2 / §3 / §4 / §5 / §6 / §7 / §8 / §9 / §10 + 新增"术语"段
    - 校验: validate-positioning.mjs 12/12 PASS
    - Spec: `.kiro/specs/positioning-revision-2026-05/`
  - _Requirements: 1.3_

- [ ] **Task 7.3: git commit + push 到 perf/desktop-pre-launch-p1**
  - commit message: `docs(positioning): revise 2026-05 — dual-persona + Unified_Agent_Plan + C_Path roadmap`
  - 把 4 个文件一并提交:修订后的 positioning 文档、`requirements.md`、`tasks.md`、`validate-positioning.mjs`
  - push 到现有分支 `perf/desktop-pre-launch-p1`(velocity window 内自动批准)
  - _Requirements: 通用_

---

## Task Dependency Graph

```
1.1 (validate script) ─┐
1.2 (metadata)         ├─→ 2.x ─→ 3.x ─→ 4.x ─→ 5.x ─→ 6.x ─→ 7.1 (validate) ─→ 7.2 ─→ 7.3
                       │       (任一阶段失败回到对应 task)
                       └─→ 6.2 (术语 — 可并行)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "parallel": ["1.1", "1.2"],
      "description": "基础设施:自检脚本 + 文档元信息"
    },
    {
      "wave": 2,
      "parallel": ["2.1", "2.2", "2.3"],
      "description": "核心定位陈述:§0 TL;DR + §1 用户画像 + §10 结论(全部为文档章节级修改,可并行)"
    },
    {
      "wave": 3,
      "parallel": ["3.1", "3.2", "3.3", "3.4"],
      "description": "竞争/协作姿态:§2 竞争表 + §2.1 A/C/B Path + §3.4 C_Path coding 维度 + §3.3 Simple 默认承诺"
    },
    {
      "wave": 4,
      "parallel": ["4.1"],
      "description": "「不做」清单软化:§4 IDE 扩展硬约束移除"
    },
    {
      "wave": 5,
      "parallel": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7"],
      "description": "话术/商业/衡量:§5 messaging + §6.4 Unified_Agent_Plan + §8 双轨指标 + §9 下游清单(改不同章节,可并行)"
    },
    {
      "wave": 6,
      "parallel": ["6.1", "6.2"],
      "description": "路线图 + 术语表:§7 P3 sprint + 顶部术语段(可并行)"
    },
    {
      "wave": 7,
      "parallel": ["7.1"],
      "description": "全量校验:跑 validate-positioning.mjs 12/12 PASS 才能进入下一波"
    },
    {
      "wave": 8,
      "parallel": ["7.2", "7.3"],
      "description": "收尾:修订记录最终化 + git commit/push 到 perf/desktop-pre-launch-p1"
    }
  ]
}
```

**关键路径**:`1.1 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2 → 4.1 → 5.5 → 6.1 → 7.1 → 7.3`

**可并行**:
- Phase 2、3、4、5、6 内部各 task 严格顺序(按文档章节 §0 → §10),但 6.2(术语)
  与 6.1(路线图)之间可并行(改的是文档不同段)
- Phase 1.1(脚本)与 Phase 6.2(术语)可并行,但 1.1 必须先于 7.1

**阻塞规则**:7.1 输出 FAIL 即视为前序 task 不完整,必须回到对应 phase 修。

## Notes

### 任务依赖与执行顺序原则

每个 phase 完成后**立即**跑 `validate-positioning.mjs` 做 smoke 检查,而不是
积累到 7.1 才校验。FAIL 越早暴露越省回退成本。

### 预计耗时

- Phase 1: 30 min(脚本写完即跑得通)
- Phase 2–6: 60–90 min(纯文档修改,每 phase 10–20 min)
- Phase 7: 15 min(校验 + commit)
- **总计**: ~2 小时

### 回退点

任一 phase 完成后跑 validate,FAIL 回到该 phase。Phase 7.1 是最终关口,
FAIL 不进 commit。

### 不动的内容(防止 over-revision)

- §5.3 视觉语言(freeze,见 Task 5.4)
- §5.1 "给非技术朋友"行 verbatim(见 Task 5.3)
- 已有术语定义 Living Pet / Marketplace / Workspace context / ambient HUD
- 任何下游 PRD 文档(仅列入 Downstream_Document_List 作为 follow-up)

### 与 AGENTS.md 协作策略一致性

本次修订**不触发**生产 SSH deploy、**不触发**移动构建分支推送,仅是文档 +
本地 Node 脚本。在 AGENTS.md 的 Velocity Window 策略下属于 "Auto-approved
docs" 类,可直接 push 到现有分支 `perf/desktop-pre-launch-p1`,无需用户
逐 task 确认。

