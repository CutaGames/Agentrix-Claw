# Requirements Document

> **Spec**: Positioning Revision 2026-05
> **Target document**: `docs/agentrix-positioning-2026-05.zh-CN.md`

## Introduction

本 spec 描述对现有团队共识文档 `docs/agentrix-positioning-2026-05.zh-CN.md`
(391 行)的**修订**(revision),不是新建。

**修订动机**:现版本把定位写得过于极端 —— 将"非编程用户"作为**唯一**核心、
将"程序员不是核心"作为**硬约束**、将"出 VS Code 扩展"列入"❌ 不做"清单。
产品负责人(CEO)纠正:Agentrix 的正确定位是 **AI 协作伙伴**,**程序员 +
非编程用户都是目标人群**;**Coding Plan 是行业核心盈利手段,不能放弃**;
对待 Cursor / VS Code 不是"不竞争 + 不接触",而是**A+C 双路径**——
**A 路径**(差异化护城河:跨工具记忆、长任务、人话交付)+ **C 路径**
(协作伴侣形态:VS Code/Cursor 扩展 + ideBridge 双向桥接)。

**4 个明确决策**(产品负责人在前置 Q&A 中已锁定):

1. **用户优先级**:非编程**优先**(默认 Simple 模式),但**程序员可一键切 Pro**
2. **付费侧目标**:**统一 Agent 套餐**,不出独立 coding plan,通过统一订阅覆盖所有人
3. **与 Cursor/VS Code 协作姿态**:**两者都做**——出 VS Code/Cursor 扩展(注入 Agentrix agent)+ ideBridge 双向桥接(IDE 调 Agentrix、Agentrix 调 IDE)
4. **Simple 默认 + 一键切换**:第一次进入 = Simple,程序员手动切 Pro,**不做自动检测**

本 spec 的**最终交付物**是修订后的 `docs/agentrix-positioning-2026-05.zh-CN.md`
(以及附带的下游影响清单,作为 follow-up 项目)。

## Glossary

- **Positioning_Document**:`docs/agentrix-positioning-2026-05.zh-CN.md`,
  本 spec 的唯一主修订对象。所有"修订"都指对这个文件内容的修改。
- **A_Path**(差异化护城河路径):Agentrix 独有、Cursor/VS Code 无法复刻的
  能力集合,包括跨工具上下文记忆、长任务后台执行、跨端协作、人话总结+自动验证、
  Living Pet 灵魂 + Marketplace。**A_Path 是产品壁垒,优先级最高。**
- **C_Path**(协作伴侣路径):Agentrix 通过 IDE 扩展 + ideBridge 与现有
  IDE(VS Code、Cursor、Windsurf)**协作而非竞争**的形态集合。
  **C_Path 的存在不削弱 A_Path,反而把 A_Path 注入到 IDE 工作流。**
- **B_Path**(被否决路径):做一个新 IDE,与 Cursor/VS Code 在编辑器层面正面
  竞争。**B_Path 已被产品负责人明确否决**,本 spec 不引入 B_Path 内容。
- **IdeBridge**:Agentrix 与外部 IDE 的双向桥接协议,允许:
  (a) IDE 内的 chat/agent 调用 Agentrix 的 agent 与长记忆;
  (b) Agentrix 桌面端 / 浮球反向调用 IDE 的命令(打开文件、跳转、运行任务)。
- **VS_Code_Extension**(VS Code/Cursor 扩展):Agentrix 发布到 VS Code
  Marketplace 与 Cursor / Windsurf(同 VSX 生态)的扩展包,把 Agentrix
  agent 注入 IDE 的 chat 面板,作为 C_Path 的主要落地形态之一。
- **Unified_Agent_Plan**(统一 Agent 套餐):覆盖所有用户人群(非编程 + 程序员)
  的**单一**订阅 SKU。不出"Coding Plan / Creator Plan / Pro Coder Plan"等
  按身份切分的独立 plan。Coding 体验通过 Pro Mode 解锁,而非通过单独购买。
- **Simple_Mode** / **Standard_Mode** / **Pro_Mode**:用户分段位 UI 深度,
  对应 P-3 已实现的 mode picker(详见 `desktop-prd-v4.md`)。
  Simple 屏蔽 tier router、Plan/Agent/Ask 切换、L0-L3 等工程化概念;
  Pro 暴露 memory wiki、tier router、ideBridge、diff preview、approval 流程。
- **Coding_Plan_Revenue**(Coding Plan 营收):指**通过统一套餐覆盖到的、
  以编程为主要使用场景的用户产生的订阅营收**。即使没有独立的 coding plan
  SKU,这部分营收仍要可拆分、可衡量。
- **Positioning_Statement**:Positioning_Document 中的"一句话定位"段落
  (现版本 §0 TL;DR)。修订后必须同时点出**程序员 + 非编程用户**两类人群。
- **Hard_Constraint_Removed_List**(软化清单):本次修订**必须从** Positioning_Document
  **删除或软化的**关于"程序员 / IDE / 编辑器扩展"的硬约束条目,具体包括但
  不限于"❌ 出 VS Code 扩展"、"❌ 嵌入 Monaco"等。
- **U5**:专业程序员人群。修订前被标注为"~~不是核心~~",修订后改为
  "次要但商业重要,Coding_Plan_Revenue 的承载人群"。
- **Downstream_Document_List**(下游受影响文档清单):Positioning_Document
  修订后**可能需要回溯校正**的关联文档列表,包括 `agentrix-cross-platform-prd-v5.md`、
  `desktop-prd-v3.md`(及更高版本)、`mobile-prd-v5.md`、营销话术文件、
  Settings 默认值文档等。本 spec 仅**列出清单**,具体回溯由 follow-up 处理。
- **Spec_Editor**:执行本 spec 修订工作的人/agent。

## Requirements

### Requirement 1: Positioning_Document 必须原地修订(不新建)

**User Story:** As a Spec_Editor, I want to revise the existing
Positioning_Document in place rather than create a new file, so that
团队所有外链、PR 引用、memory 索引保持稳定,避免"哪个版本是最新"的混乱。

#### Acceptance Criteria

1. THE Spec_Editor SHALL retain the file path
   `docs/agentrix-positioning-2026-05.zh-CN.md` unchanged after revision.
2. THE Spec_Editor SHALL NOT create a parallel file such as
   `agentrix-positioning-2026-05.v2.zh-CN.md` for this revision.
3. WHEN the revision is complete, THE Positioning_Document SHALL contain a
   "修订记录" (Revision Log) section that records the date `2026-05-23` (or
   the actual revision date), the revision summary, and the trigger
   ("产品负责人 4 项决策").
4. WHEN the revision is complete, THE Positioning_Document SHALL keep the
   top-of-file metadata block (撰稿、适用范围、上一次更新) and update only
   the "上一次更新" date to the revision date.

### Requirement 2: 用户画像表必须双轨化(非编程 + 程序员)

**User Story:** As a Spec_Editor, I want the user persona table in §1 to
treat both non-coding users and programmers as target audiences, so that
团队后续 PRD、营销话术、招聘 JD 不再误以为程序员"不是我们的用户"。

#### Acceptance Criteria

1. THE Positioning_Document SHALL list U1 through U5 as target user
   segments in §1 without strikethrough formatting on U5.
2. THE Positioning_Document SHALL describe U5 (专业程序员) as "次要但商业
   重要,Coding_Plan_Revenue 的承载人群" or equivalent wording, and SHALL
   provide a non-zero "占比目标" percentage for U5.
3. THE Positioning_Document SHALL state that "我们的核心用户**永远不需要
   自己改代码**" SHALL be revised to a softer statement such as "Simple
   模式下用户**不需要**自己改代码;Pro 模式下程序员**可以**直接接管代码"
   so that the hard constraint "永远不需要" is removed.
4. WHEN a reader searches for the literal string "不是核心" in the user
   persona section, THE Positioning_Document SHALL NOT contain that string
   applied to U5.
5. THE Positioning_Document SHALL preserve the "用户优先级 = 非编程优先"
   intent by stating that Simple_Mode is the default first-run experience.

### Requirement 3: 竞争关系表必须区分 A_Path 与 C_Path

**User Story:** As a Spec_Editor, I want the §2 "我们不和谁竞争" table to
explicitly separate the differentiation moat (A_Path) from the IDE
collaboration posture (C_Path), so that 团队既不做 B_Path(新 IDE),又
不放弃 C_Path(VS Code/Cursor 扩展 + ideBridge)的赋能。

#### Acceptance Criteria

1. THE Positioning_Document SHALL revise the row for "VS Code / Cursor /
   Windsurf / Kilo Code" so that the relationship column is **NOT** the
   single word "不竞争" and **DOES** include both "差异化协作" and
   "通过 VS_Code_Extension + IdeBridge 赋能" as relationship descriptors.
2. THE Positioning_Document SHALL revise the row for "Cline / Claude Code /
   aider" so that the relationship column reflects "同档 chat+agent 体验对标,
   差异化在跨工具/跨端/长任务" rather than only "部分竞争".
3. THE Positioning_Document SHALL add a new sub-section (or footnote) under
   §2 that defines A_Path and C_Path explicitly, with at least one sentence
   each.
4. THE Positioning_Document SHALL NOT introduce B_Path content (i.e., shall
   not propose building a new IDE editor surface).
5. WHEN a reader searches for the exact substring "**不竞争**" applied to
   "VS Code", THE Positioning_Document SHALL NOT contain that wording in §2.

### Requirement 4: 差异化清单保留 A_Path 5 件 + 补充 C_Path coding 体验维度

**User Story:** As a Spec_Editor, I want §3.2 to keep the existing 5
A_Path differentiators AND add a new sub-section listing C_Path "coding
体验维度", so that 团队对外既能讲"Cursor 做不到的"也能讲"Cursor 能做的、
我们也做得好"。

#### Acceptance Criteria

1. THE Positioning_Document SHALL retain all 5 existing A_Path
   differentiators in §3.2 (跨工具上下文记忆 / 长任务后台执行 / 跨端协作 /
   人话总结+自动验证 / Living Pet 灵魂+Marketplace).
2. THE Positioning_Document SHALL add a new sub-section §3.4 (or rename
   3.2 → 3.2a/3.2b) titled "C_Path coding 体验对等维度" that lists at
   least 3 dimensions where Agentrix matches Cursor-class IDE chat
   experience (示例:`@file/@symbol/@docs` mentions、diff preview、tool
   call inline 展开、`/` slash commands).
3. THE Positioning_Document SHALL state that C_Path coding 维度的实现路径
   是通过 VS_Code_Extension 注入 Agentrix agent 与通过 IdeBridge 双向桥接,
   NOT through building Agentrix's own editor surface.

### Requirement 5: "不做"清单必须移除关于 IDE 扩展的硬约束

**User Story:** As a Spec_Editor, I want the §4 "我们不做什么" list to
remove or rewrite the hard constraints that block IDE-extension and
programmer-facing surfaces, so that 团队后续可以基于 C_Path 落地 VS Code
扩展与 ideBridge 而不与定位文档冲突。

#### Acceptance Criteria

1. THE Positioning_Document SHALL remove or rewrite the row "❌ 出 VS Code
   扩展" so that the resulting wording reflects "通过扩展形态实现 C_Path,
   不作为主入口" instead of a hard prohibition.
2. THE Positioning_Document SHALL remove or rewrite the row "❌ 嵌入
   Monaco 做编辑器" so that the resulting wording either (a) keeps it as
   "不嵌入 Monaco 做主编辑器" with explicit qualifier "主"/"primary",
   or (b) removes it entirely if redundant with B_Path rejection.
3. THE Positioning_Document SHALL retain the rows "❌ Tab autocomplete"
   and "❌ Cmd+K inline edit" UNLESS they are explicitly contradicted by
   C_Path; if retained, THE Positioning_Document SHALL add a clarifier
   noting these are within Agentrix's own surface, not the IDE extension.
4. WHEN a reader searches the revised Positioning_Document for the literal
   string "❌ 出 VS Code 扩展", THE Positioning_Document SHALL NOT contain
   that exact prohibition (correctness property, see §Correctness).
5. WHEN a reader searches the revised Positioning_Document for "嵌入 Monaco",
   THE Positioning_Document SHALL either not contain the prohibition form,
   or contain it only with an explicit "主编辑器" qualifier.

### Requirement 6: 对外话术必须重写"给程序员朋友"那条

**User Story:** As a Spec_Editor, I want the §5 messaging table row for
"给程序员朋友" to be rewritten so that it does NOT position Cursor as
"only for programmers" and INSTEAD positions Agentrix as upgrading the
Cursor/VS Code experience, so that 销售/PR 在与程序员沟通时不再无意识
划走自己的目标人群。

#### Acceptance Criteria

1. THE Positioning_Document SHALL rewrite the row "给程序员朋友" in §5.1
   so that the resulting copy does NOT contain the phrase "Cursor 是给
   程序员的".
2. THE Positioning_Document SHALL rewrite the row "给程序员朋友" so that
   the resulting copy DOES contain wording that positions Agentrix as
   enhancing or upgrading the Cursor/VS Code workflow (示例:"Agentrix
   让 Cursor / VS Code 多一层跨工具记忆 + 跨端协作 + 长任务能力").
3. THE Positioning_Document SHALL revise the row "给非技术朋友" in §5.1
   to keep "ChatGPT 帮你想,Agentrix 帮你做" (or equivalent) — this row
   is NOT in scope for change in this revision.
4. THE Positioning_Document SHALL revise the §5.2 "不要说什么" table row
   "Cursor 替代品" so that the ✅ replacement copy is updated from
   "Cursor 是给程序员的,Agentrix 是给所有人的" to wording that reflects
   "Agentrix 与 Cursor / VS Code 协作而非替代" or similar.

### Requirement 7: 路线图必须新增 C_Path 的 Post-launch 项

**User Story:** As a Spec_Editor, I want the §7 roadmap to include
explicit Post-launch items for VS_Code_Extension and IdeBridge full
implementation, so that C_Path 在路线图层面有承诺,不只是话术。

#### Acceptance Criteria

1. THE Positioning_Document SHALL include in §7 (路线图) a Post-launch
   item titled "VS Code / Cursor 扩展(C_Path 主形态)" with at least one
   sentence describing scope.
2. THE Positioning_Document SHALL include in §7 a Post-launch item titled
   "IdeBridge 完整化(双向桥接)" or equivalent, with at least one sentence
   describing scope.
3. THE Positioning_Document SHALL place the new C_Path roadmap items into
   the existing "Sprint Post-launch P2(2026-07-08)" section OR create a
   "Sprint Post-launch P3" section if scope warrants; in either case, the
   placement SHALL NOT collide with existing P1 (long-task / cross-tool
   memory / handoff) items in scheduling priority.
4. THE Positioning_Document SHALL NOT promote VS_Code_Extension or
   IdeBridge into the Pre-launch sprint, since the Pre-launch sprint is
   focused on Simple_Mode + 9 quick wins.

### Requirement 8: 衡量指标必须双轨化(非编程留存 + 程序员付费)

**User Story:** As a Spec_Editor, I want §8 metrics to add programmer-facing
revenue and retention indicators alongside the existing non-coding-user
indicators, so that 团队对"商业基本盘"的衡量不被遗漏。

#### Acceptance Criteria

1. THE Positioning_Document SHALL retain the existing §8 metric "非技术
   用户(U1+U2+U3)占活跃用户比例 ≥ 70%" UNCHANGED in target value, OR
   adjust it to a defensible new target if the U5 inclusion changes the
   denominator; in either case, the row SHALL exist.
2. THE Positioning_Document SHALL add a new metric row "程序员用户(U4+U5)
   付费率" with a 30-day target percentage.
3. THE Positioning_Document SHALL add a new metric row "Coding_Plan_Revenue
   占总营收比例" with a 30-day target percentage. The metric SHALL clarify
   that even though there is no separate Coding Plan SKU, this slice is
   computed by attributing Unified_Agent_Plan revenue to users whose
   primary mode is Pro_Mode for ≥ N% of sessions (N to be defined in
   the design phase).
4. THE Positioning_Document SHALL NOT introduce a metric that requires
   selling a separate Coding Plan SKU, since Unified_Agent_Plan is the
   committed business model.

### Requirement 9: 必须明确 Unified_Agent_Plan 商业模型

**User Story:** As a Spec_Editor, I want the Positioning_Document to add
a new section (or augment §6 现状盘点 / new §6.4) that explicitly states
the business model is Unified_Agent_Plan (no separate Coding Plan SKU),
so that 销售/产品/财务在 SKU 设计时不再走"独立 coding plan"分支。

#### Acceptance Criteria

1. THE Positioning_Document SHALL contain at least one paragraph stating
   "Agentrix 的付费侧采用 Unified_Agent_Plan 单一订阅,覆盖所有人群"
   or equivalent.
2. THE Positioning_Document SHALL state that Pro_Mode 是 coding 用户解锁
   高阶能力的入口,但解锁本身**不通过单独购买**,而是通过 mode picker 切换
   (which is already implemented in P-3).
3. THE Positioning_Document SHALL NOT propose introducing a "Coding Plan"
   or "Pro Coder Plan" as a separate SKU.
4. THE Positioning_Document SHALL acknowledge that Coding_Plan_Revenue 仍是
   行业核心盈利来源,Unified_Agent_Plan 必须能承载这一营收。

### Requirement 10: Simple 默认 + 一键切换的明文承诺

**User Story:** As a Spec_Editor, I want the Positioning_Document to
state explicitly that Simple_Mode is the first-run default and that mode
switching is one-click manual (no auto-detection), so that 工程团队后续
不会被"自动检测程序员身份"的反复需求拉扯。

#### Acceptance Criteria

1. THE Positioning_Document SHALL state in §3.3 (or equivalent location)
   that "用户首次进入应用时,默认是 Simple_Mode".
2. THE Positioning_Document SHALL state that mode switching among
   Simple_Mode / Standard_Mode / Pro_Mode is **manual one-click via the
   mode picker**, NOT auto-detected from user behavior or signup metadata.
3. WHERE a future PRD proposes auto-detecting programmer identity to
   pre-set Pro_Mode, THE Positioning_Document SHALL serve as the source
   of truth that overrides such proposals.

### Requirement 11: 修订必须列出 Downstream_Document_List

**User Story:** As a Spec_Editor, I want the Positioning_Document
revision (or this spec's tasks.md, see follow-up) to enumerate the
downstream documents that may need follow-up correction, so that 团队
不至于让 v5 跨端 PRD、桌面 PRD、移动 PRD 与新定位长期不一致。

#### Acceptance Criteria

1. THE Positioning_Document SHALL include in §9 (与现有 PRD 的关系) at
   least the following Downstream_Document_List entries with a brief
   note on what may need updating:
   - `docs/agentrix-cross-platform-prd-v5.md`
   - `docs/desktop-prd-v3.md`(及 v4/v5)
   - `docs/mobile-prd-v5.md`
   - 营销话术文件(landing copy, blog templates)
   - Settings 默认值文档(Simple/Standard/Pro mode picker)
2. THE Positioning_Document SHALL NOT make changes to the downstream
   documents themselves as part of this revision; downstream changes are
   tracked as follow-up tasks.
3. WHEN this spec's tasks.md is generated, THE tasks SHALL include a
   "downstream audit" task that reads each Downstream_Document_List entry
   and flags any direct contradiction with the revised Positioning_Document.

### Requirement 12: TL;DR(§0)的一句话定位必须双人群化

**User Story:** As a Spec_Editor, I want the §0 TL;DR one-liner to
mention both 程序员 and 非编程用户 explicitly (or use an inclusive
phrasing), so that 任何只读 TL;DR 的人不会再把 Agentrix 误读为"只服务
非编程"。

#### Acceptance Criteria

1. THE Positioning_Document SHALL revise §0 TL;DR so that the one-liner
   does NOT contain the literal phrase "面向不会写代码的人的 AI 协作伙伴"
   as the **sole** positioning statement.
2. THE Positioning_Document SHALL revise §0 TL;DR so that the resulting
   one-liner contains EITHER (a) inclusive language such as "面向所有
   想把 idea 做成现实的人(程序员 + 非编程用户)的 AI 协作伙伴", OR
   (b) two adjacent sentences where one targets each persona.
3. THE Positioning_Document SHALL revise the §0 second-line "它不是 IDE,
   不是 Cursor / Windsurf / Cline 的替代,不和 VS Code 卷编辑器" so that
   the resulting wording reflects "不卷 IDE 编辑器层,但通过 VS_Code_Extension
   + IdeBridge **协作**". The phrase "不和 VS Code 卷编辑器" MAY remain
   if explicitly qualified by "在编辑器层".
4. WHEN a reader searches §0 for "不是 Cursor / Windsurf / Cline 的替代",
   THE Positioning_Document SHALL either not contain that exact phrase, or
   contain it together with a follow-up sentence introducing C_Path
   collaboration.

### Requirement 13: 视觉/品牌语言段(§5.3)保持不变

**User Story:** As a Spec_Editor, I want §5.3 视觉语言 (warm/light/round
vs. cyber neon) to remain unchanged, so that 视觉品牌资产(Living Pet、
暖色 UI、桌宠)不被本次修订意外影响。

#### Acceptance Criteria

1. THE Positioning_Document SHALL preserve §5.3 视觉语言 verbatim.
2. THE Positioning_Document SHALL NOT introduce "cyber neon"/"终端配色"/
   "Hacker News 美学" as acceptable visual styles in §5.3.
3. WHEN a reader compares §5.3 before and after revision, the diff SHALL
   be empty (modulo whitespace).

### Requirement 14: 修订必须通过定位结论(§10)的双人群表述

**User Story:** As a Spec_Editor, I want §10 结论 to reflect the dual-persona
positioning while keeping the spirit "我们做的是 AI 协作伙伴", so that 团队
内部最终引用的"一句话总结"不再排斥程序员。

#### Acceptance Criteria

1. THE Positioning_Document SHALL preserve the spirit "AI 协作伙伴" in §10.
2. THE Positioning_Document SHALL revise the §10 line "任何产品决策,先问一
   句:'这一步对不会写代码的人友好吗?'" so that the resulting question SHALL
   include BOTH personas (示例:"这一步对不会写代码的人友好吗?对会写代码
   的人有效率提升吗?").
3. THE Positioning_Document SHALL NOT contain in §10 any wording that
   excludes programmers as a target persona.

### Requirement 15: 修订必须给出 Correctness Properties 自检清单

**User Story:** As a Spec_Editor, I want the revised Positioning_Document
to be validated against an explicit set of correctness properties (search
strings that should NOT appear, search strings that SHOULD appear, structure
checks), so that 修订完成后 reviewer 不需要主观判断,可以**机械化**验收。

#### Acceptance Criteria

1. WHEN the revision is complete, THE Spec_Editor SHALL be able to run the
   following correctness checks against the revised Positioning_Document
   and have all of them PASS:
   - **C1**: Searching for "❌ 出 VS Code 扩展" returns ZERO matches.
   - **C2**: Searching for "U5" returns at least one match in §1, and the
     matching block does NOT contain the literal string "不是核心" applied
     to U5.
   - **C3**: Searching for "Unified_Agent_Plan" or "统一 Agent 套餐"
     returns at least one match in §6 / §8 / §9.
   - **C4**: Searching for "ideBridge" or "IdeBridge" returns at least one
     match in §2 (or §3) AND at least one match in §7.
   - **C5**: Searching for "VS Code" / "Cursor" extension returns at least
     one match in §7 (路线图 Post-launch).
   - **C6**: Searching for "Cursor 是给程序员的" returns ZERO matches.
   - **C7**: Searching for "面向不会写代码的人的 AI 协作伙伴" returns ZERO
     matches when used as the SOLE positioning statement (i.e., not
     adjacent to a complementary statement targeting programmers).
   - **C8**: §10 contains a question that mentions BOTH "不会写代码" /
     "非编程" AND "会写代码" / "程序员".
2. THE Spec_Editor SHALL include this self-check list as an inline section
   in the Positioning_Document (e.g., a hidden HTML comment block or an
   appendix), OR keep it as part of this spec's tasks.md.
3. IF any correctness check fails after revision, THEN THE Spec_Editor
   SHALL re-revise the failing section before marking the spec complete.

### Requirement 16: A_Path/C_Path/B_Path 术语必须在 Glossary 中定义

**User Story:** As a Spec_Editor, I want A_Path / C_Path / B_Path /
ideBridge / Unified_Agent_Plan to be added to the Positioning_Document's
own glossary (or a new "术语" section), so that 团队成员阅读修订版时不
需要回到本 spec 的 Glossary 才能理解。

#### Acceptance Criteria

1. THE Positioning_Document SHALL contain a "术语" or "Glossary" section
   (new or augmented) that defines A_Path, C_Path, B_Path, IdeBridge, and
   Unified_Agent_Plan.
2. THE Positioning_Document SHALL state that B_Path (做新 IDE)是已被否决的
   路径,并解释 why.
3. THE Positioning_Document SHALL preserve all existing definitions
   (Living Pet, Marketplace, Workspace context, ambient HUD) without
   modification.

---

## Correctness Properties (Executable Acceptance)

下面这些检查是**机械化可执行**的成功判据,可以通过 grep / ripgrep
对修订后的 `docs/agentrix-positioning-2026-05.zh-CN.md` 直接运行得到
PASS / FAIL 结论,不依赖人工主观判断。

| 编号 | 检查 | 期望结果 |
|------|------|---------|
| **C1** | `grep -c "❌ 出 VS Code 扩展"` | `0` |
| **C2-a** | `grep -c "U5"` | `≥ 1` |
| **C2-b** | `grep -A 2 "U5" \| grep -c "不是核心"` | `0` |
| **C3** | `grep -cE "(Unified_Agent_Plan\|统一 Agent 套餐)"` | `≥ 1` |
| **C4-a** | `grep -ic "idebridge"` | `≥ 2`(§2/§3 + §7) |
| **C5** | 在 §7 路线图段内 `grep -ic "(VS Code 扩展\|Cursor 扩展)"` | `≥ 1` |
| **C6** | `grep -c "Cursor 是给程序员的"` | `0` |
| **C7** | TL;DR §0 的"一句话定位"行单独 grep `"面向不会写代码的人的 AI 协作伙伴$"` | `0`(必须有补充人群) |
| **C8** | 在 §10 内同时包含 `"不会写代码"` 与 `"程序员\|会写代码"` | `2`(都命中) |
| **C9** | `grep -c "Coding_Plan_Revenue\|Coding Plan 营收"` | `≥ 1` |
| **C10** | `grep -c "Simple_Mode\|Simple 模式"` 在 §3.3 或 §10 附近出现 | `≥ 1` |
| **C11** | `grep -c "B_Path\|做新 IDE"` 且语义为"已否决" | `≥ 1` |
| **C12** | `grep -c "ChatGPT 帮你想,Agentrix 帮你做"` | `≥ 1`(§5.1 给非技术朋友 行未被改坏) |

**Round-trip property**(对 Positioning_Document 的"读 → 抽取关键定位 → 与
本 requirements 比对 → 不回退")暂不形式化,但本 spec 的 design 阶段会
给出一个可执行的 `validate-positioning.mjs` 草案,把 C1–C12 跑成 CI 友好
退出码,作为 design 阶段的 deliverable。

---

## 修订范围以外(Out of Scope)

以下事项**不属于本 spec**,即使紧密相关:

1. ❌ 实际开发 VS_Code_Extension 或 IdeBridge 的代码 —— 这是后续 sprint 的
   feature spec,本 spec 只把它们写入路线图。
2. ❌ 修改下游 PRD(`agentrix-cross-platform-prd-v5.md`、`desktop-prd-v3.md` 等)
   的实质内容 —— 仅列入 Downstream_Document_List 作为 follow-up。
3. ❌ 改变 Simple/Standard/Pro mode picker 的 UI 实现 —— P-3 已实现,本次
   修订只把它写入定位文档作为承诺。
4. ❌ 设计 Coding_Plan_Revenue 的具体口径(N% sessions 的 N 取值) ——
   本 spec 留到 design 阶段或 follow-up business spec 决定。
5. ❌ 修改视觉品牌(§5.3)—— 本 spec 主动 freeze 这一段(见 Requirement 13)。
