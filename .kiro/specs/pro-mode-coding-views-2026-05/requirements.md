# Requirements Document

> **Spec**: Pro Mode Coding Views & Positioning Follow-up 2026-05
> **Predecessor**: `.kiro/specs/positioning-revision-2026-05/`(已完成)
> **Branch**: `perf/desktop-pre-launch-p1`(继续)

## Introduction

`positioning-revision-2026-05` spec 已修订完定位文档,对外承诺:

> "**默认是 Simple 模式**(非编程友好),**程序员一键切 Pro 模式即获得完整 coding 视图**。"
>
> "Pro Mode 暴露:**memory wiki / 自进化 dashboard / agent persona 编辑 / tier router / IDE 桥接 / raw diff / `@symbol` mention**。"

但实际产品里 Pro Mode **只控制了 More 菜单的 9 项可见性**,**没有兑现 coding 视图承诺**:

- ❌ raw diff:已实现 `WorkspaceFileStatus` + `DiffView`,但**没有 Pro Mode 入口**
- ❌ IDE bridge:`ideBridge.ts` 已实现 `openInIde({path,line,column,editor})`,**没有 UI 触发点**
- ❌ `@symbol` mention:`MentionAutocomplete` kind 含 `"symbol"`,但**只用在 slash commands 里**,`@symbol` 没填充任何 symbol provider

加上 follow-up 待办:

- F2: 营销话术更新(双人群对齐)
- F3: 下游 PRD 三份(`agentrix-cross-platform-prd-v5.md` / `desktop-prd-v4.md` / `mobile-prd-v5.md`)双人群一致性补丁

本 spec **三件事打包一个 sprint**,统一在 `perf/desktop-pre-launch-p1` 推。

**不在 scope**:

- ❌ VS Code / Cursor 扩展实现(P3 sprint)
- ❌ IdeBridge 反向桥接(IDE→Agentrix,P3)
- ❌ Coding_Plan_Revenue 度量脚本(上线后)
- ❌ frontend pet-as-agent 落地页改写(GTM 决策,另立)

## Glossary

- **Pro_Mode_Coding_Surface**:Pro Mode 下程序员可见的 coding 视图集合,
  包括 raw diff workbench、IDE bridge button、`@symbol` mention picker。
  Simple / Standard 模式不暴露这一组。
- **Workspace_Diff_Workbench**:基于现有 `WorkspaceFileStatus` + `DiffView`
  的全屏 / 侧栏 diff 浏览器。Pro Mode 在 More 菜单或 ChatTitleBar 暴露入口。
- **Open_In_Ide_Button**:消息列表 / file artifact 卡片上的"在 Cursor / VS Code 打开"
  按钮,调用 `openInIde({path,line,column,editor})`。
- **Symbol_Mention_Provider**:`@symbol` 触发后向 Tauri 调用 `desktop_symbol_search`
  或类似命令,返回当前工作区的 function/class/method 列表。**MVP 用文件名+行号代替**,
  避免引入 LSP 依赖。
- **Marketing_Messaging_Doc**:新建 `docs/business/POSITIONING_MESSAGING_v2026-05.zh-CN.md`,
  作为话术参考库,**不动 frontend 落地页代码**(那是另一档 pet-as-agent GTM 决策)。
- **Downstream_PRD_List**:本次需要双人群对齐的 3 份 PRD,
  每份只追加一个 "双人群对齐补丁(2026-05-24)" 小节,**不重写既有内容**。
- **Frontend_Landing_Page_Freeze**:本 spec 主动 freeze frontend
  pet-as-agent 落地页(`pages/index.tsx`),不在 scope 改写。

## Requirements

### Requirement 1: Pro Mode 入口暴露 raw diff workbench

**User Story:** As a programmer (U5) using Pro Mode, I want to open a
Workspace_Diff_Workbench from the chat title bar More menu, so that I
can see all recent file changes as raw diff and confirm what the agent
modified before pushing.

#### Acceptance Criteria

1. THE ChatTitleBar More menu in Pro Mode SHALL include an item
   "Workspace Diff" / "工作区 Diff" with `tier: "pro"`.
2. WHEN the user clicks the item in Pro Mode, THE Workspace_Diff_Workbench
   panel SHALL open and display all files that have been modified by the
   agent in the current session, with raw unified-diff format.
3. THE Workspace_Diff_Workbench panel SHALL be implemented as a thin
   wrapper around existing `WorkspaceFileStatus` + `DiffView` components,
   NOT a fresh implementation.
4. IF the user is in Simple or Standard mode, THE Workspace Diff menu
   item SHALL NOT be visible (since `tier: "pro"` is filtered).

### Requirement 2: 消息工具卡片暴露 Open in IDE button

**User Story:** As a programmer in Pro Mode, I want to click an "Open in
IDE" button on file artifact tool calls in the chat history, so that I
can jump to the file in Cursor / VS Code at the exact line agent
mentioned.

#### Acceptance Criteria

1. WHEN a tool call result references a workspace file path with optional
   line/column AND user mode is Pro, THE message UI SHALL render an
   "Open in IDE" / "在 IDE 打开" button next to the file path.
2. WHEN the user clicks the button, THE UI SHALL call `openInIde({path,
   line?, column?, editor?})` from `services/ideBridge.ts`.
3. THE button SHALL allow the user to select editor target (Cursor / VS
   Code) via a small chevron / kebab menu, persisting the choice in
   localStorage key `agentrix_ide_target`.
4. IF the user is in Simple or Standard mode, THE button SHALL NOT
   render.
5. IF the `openInIde` call fails (Tauri command rejects), THE UI SHALL
   show a tooltip "未找到 Cursor / VS Code 安装" and NOT crash.

### Requirement 3: `@symbol` mention 接入文件级 symbol picker

**User Story:** As a programmer in Pro Mode, I want `@symbol` in the
chat input to suggest function / class names from the workspace, so
that I can mention specific code targets without typing the full path.

#### Acceptance Criteria

1. WHEN the user types `@symbol` (or `@s`) in InputZone AND user mode is
   Pro, THE MentionAutocomplete SHALL open a symbol-picker submenu
   showing top 20 candidate symbols from current workspace files.
2. THE Symbol_Mention_Provider MVP SHALL query Tauri command
   `workspace_grep_symbols` (new) which uses regex to match common
   patterns: `function \w+`, `class \w+`, `def \w+`, `interface \w+`,
   `type \w+`, `const \w+ =`, exported items only, top 200 across
   workspace.
3. WHEN the user selects a symbol, THE input SHALL insert
   `@<file>:<line>` (e.g., `@desktop/src/services/userMode.ts:18`),
   making it parseable by the existing `@file` consumer.
4. IF the Tauri command is unavailable or returns empty, THE UI SHALL
   fall back to showing files from the existing `@file` provider with
   no error.
5. IF the user is in Simple or Standard mode, THE `@symbol` trigger
   SHALL behave as the existing `@file` mention (no symbol picker).

### Requirement 4: Pro Mode UX 一致性测试

**User Story:** As a QA engineer, I want a smoke e2e test that verifies
the three Pro Mode coding views are visible only in Pro Mode and
hidden in Simple / Standard, so that future regressions don't silently
break the positioning promise.

#### Acceptance Criteria

1. THE test file `desktop/tests/e2e/pro-mode-coding-views.spec.ts` SHALL
   exist and be invoked by the standard e2e runner.
2. THE test SHALL switch user mode to Simple, navigate to ChatPanel, and
   assert that "Workspace Diff" / "Open in IDE" buttons are NOT visible.
3. THE test SHALL switch to Pro and assert all three are visible.
4. WHEN the test runs in CI, THE failure mode SHALL be a single clear
   assertion message including the actual mode and the missing/extra UI
   element.

### Requirement 5: 营销话术参考库新建(不动 frontend)

**User Story:** As a marketing / sales team member writing copy after
the 2026-05-24 positioning revision, I want a single reference doc with
dual-persona messaging templates (non-coder + programmer) for landing,
press kit, blog, investor decks, so that future copy aligns with the
positioning without case-by-case interpretation.

#### Acceptance Criteria

1. THE Marketing_Messaging_Doc SHALL be a new file at
   `docs/business/POSITIONING_MESSAGING_v2026-05.zh-CN.md`.
2. THE Marketing_Messaging_Doc SHALL contain at least the following
   sections:
   - Hero / 落地页大字 — 双人群版本
   - 一句话副标题 — 双人群版本
   - 给非技术朋友 — 话术(保留 "ChatGPT 帮你想,Agentrix 帮你做")
   - 给产品经理 — 话术
   - 给程序员朋友 — **新版**话术("Agentrix 让 Cursor / VS Code 多一层")
   - 给投资人 — Unified_Agent_Plan + 跨端 + 双人群叙事
   - Press kit boilerplate(中英)
   - Blog post 开头模板(技术博客 + 创作者博客 各一份)
3. THE Marketing_Messaging_Doc SHALL include a "禁用话术" 段,列出本次
   修订移除的旧话术(例如 "Cursor 仅服务程序员")并标注替代版本。
4. THE Marketing_Messaging_Doc SHALL include a YAML/JSON 结构化片段
   附录,方便未来 i18n string 直接消费(`messaging.zh.heroLine`,
   `messaging.zh.programmerPitch` 等)。
5. THE Marketing_Messaging_Doc SHALL NOT modify any file under
   `frontend/` 或 `mobile/`(Frontend_Landing_Page_Freeze)。

### Requirement 6: 下游 PRD 三份双人群对齐补丁

**User Story:** As a Spec_Editor, I want the three downstream PRDs to
each receive a small "2026-05-24 dual-persona alignment" addendum
section that points to the revised positioning doc, so that future
readers of the PRDs see the dual-persona constraint without us
having to rewrite the existing content.

#### Acceptance Criteria

1. THE following 3 files SHALL each receive a new section titled
   "2026-05-24 双人群对齐补丁" (or English equivalent):
   - `docs/agentrix-cross-platform-prd-v5.md`
   - `docs/desktop-prd-v4.md`
   - `docs/mobile-prd-v5.md`
2. THE addendum SHALL be appended at the END of each file (not inserted
   mid-document) to avoid disturbing existing line references.
3. THE addendum SHALL contain:
   - 一句话:"本 PRD 的所有用户画像 / 商业模型 / 路线图条款,以
     `docs/agentrix-positioning-2026-05.zh-CN.md` (2026-05-24 修订版) 为准。"
   - 列出本 PRD 中**已知**与新定位不一致的具体段落(如有),并附 follow-up
     ticket 占位符(`TODO: 重写 §<n>` 风格)。
   - 显式声明"本次不重写正文,仅追加补丁"。
4. THE addendum SHALL link back to
   `.kiro/specs/positioning-revision-2026-05/` 作为决策出处。
5. WHEN a reader greps for "positioning-revision-2026-05" in any of
   the 3 PRDs, THE result SHALL include at least 1 hit per file.

### Requirement 7: 本次 sprint 不破坏既有功能

**User Story:** As a product owner, I want the sprint changes to keep
all existing tests green and not regress any existing UX, so that
adding Pro Mode coding surfaces doesn't break Simple / Standard users.

#### Acceptance Criteria

1. WHEN the sprint is complete, THE existing vitest 91 tests SHALL all
   pass.
2. WHEN the sprint is complete, THE existing e2e suite SHALL pass with
   ≥ 139 / 141 (allowing 2 conditional skips per prior baseline).
3. WHEN the sprint is complete, THE existing
   `desktop/scripts/validate-positioning.mjs` SHALL still output 12/12
   PASS(verifying we didn't accidentally regress positioning doc).
4. WHEN the sprint is complete, THE TypeScript compile (`tsc --noEmit`)
   SHALL succeed with no new errors in `desktop/src`.

## Correctness Properties (Executable Acceptance)

| 编号 | 检查 | 期望 |
|------|------|------|
| **C-F1-1** | grep `Workspace Diff` in `desktop/src/components/chatPanel/ChatTitleBar.tsx` | ≥ 1 |
| **C-F1-2** | grep `tier: "pro"` matches in ChatTitleBar More menu list | ≥ existing + 1 (new Diff item) |
| **C-F1-3** | grep `openInIde` in `desktop/src/components/MessageList*.tsx` 或 `MessageBubble*.tsx` | ≥ 1 |
| **C-F1-4** | new file `desktop/src/components/OpenInIdeButton.tsx` exists | exists |
| **C-F1-5** | `@symbol` mention provider exists | grep `workspace_grep_symbols` ≥ 1 in tauri commands |
| **C-F2-1** | new file `docs/business/POSITIONING_MESSAGING_v2026-05.zh-CN.md` exists | exists |
| **C-F2-2** | grep `给程序员朋友` in messaging doc | ≥ 1 |
| **C-F2-3** | messaging doc 不改 `frontend/pages/index.tsx` | git diff `frontend/` shows no change |
| **C-F3-1** | grep `2026-05-24 双人群对齐补丁` in `agentrix-cross-platform-prd-v5.md` | ≥ 1 |
| **C-F3-2** | grep `2026-05-24 双人群对齐补丁` in `desktop-prd-v4.md` | ≥ 1 |
| **C-F3-3** | grep `2026-05-24 双人群对齐补丁` in `mobile-prd-v5.md` | ≥ 1 |
| **C-F3-4** | grep `positioning-revision-2026-05` in 3 PRDs | ≥ 3 (one each) |
| **C-Reg-1** | `validate-positioning.mjs` 12/12 PASS | exit 0 |
| **C-Reg-2** | `tsc --noEmit` in desktop/ | exit 0 |

## Out of Scope

1. ❌ VS Code / Cursor 扩展(留 P3)
2. ❌ IdeBridge 反向桥接 IDE→Agentrix(留 P3)
3. ❌ LSP-based 真实 symbol provider(MVP 只用 grep)
4. ❌ frontend `pages/index.tsx` 落地页改写(pet-as-agent GTM 另立决策)
5. ❌ 改 mobile-prd 移动端实质内容(仅追加双人群补丁)
6. ❌ Coding_Plan_Revenue 度量基础设施(上线后)
