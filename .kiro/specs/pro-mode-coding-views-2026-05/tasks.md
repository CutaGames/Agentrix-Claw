# Implementation Plan

> **Spec**: Pro Mode Coding Views & Positioning Follow-up 2026-05
> **Branch**: `perf/desktop-pre-launch-p1`(继续)

## Overview

把 F1+F2+F3 打成一个 sprint。目标:让定位文档承诺的 "Pro Mode coding 视图"
**真的兑现**;话术参考库新建供后续营销团队复用;3 份下游 PRD 各加一个
"双人群对齐补丁"小节,**不重写正文**。

**修改的代码 / 文档**:

- 新建 `desktop/src/components/OpenInIdeButton.tsx`
- 新建 `desktop/src/components/WorkspaceDiffWorkbench.tsx`
- 改 `desktop/src/components/chatPanel/ChatTitleBar.tsx`(More 菜单加 Pro 项)
- 改 `desktop/src/components/chatPanel/MentionAutocomplete.tsx`(`@symbol` 真做 picker)
- 改 `desktop/src/services/workspace.ts` 加 `searchSymbols` API
- 改 Tauri 后端加 `workspace_grep_symbols` 命令 + ACL
- 新建 `desktop/tests/e2e/pro-mode-coding-views.spec.ts`
- 新建 `docs/business/POSITIONING_MESSAGING_v2026-05.zh-CN.md`
- 改(追加补丁) 3 份 PRD:`agentrix-cross-platform-prd-v5.md` / `desktop-prd-v4.md` / `mobile-prd-v5.md`

## Tasks

- [ ] 1. F2 营销话术参考库 — 新建 `docs/business/POSITIONING_MESSAGING_v2026-05.zh-CN.md`
  - 8 个段:Hero / 副标题 / 给非技术朋友 / 给产品经理 / 给程序员朋友(新版) / 给投资人 / Press kit boilerplate(中英) / Blog post 开头模板(技术 + 创作者各一份)
  - "禁用话术"表(列出旧版本 + 替代)
  - YAML/JSON 结构化片段附录(供 i18n 消费)
  - 文末附"出处"链接到 positioning-revision spec
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 2. F3 — 给 `docs/agentrix-cross-platform-prd-v5.md` 追加 "2026-05-24 双人群对齐补丁" 段
  - SSOT 声明 + 已知不一致段落占位 TODO + spec 链接
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 3. F3 — 给 `docs/desktop-prd-v4.md` 追加 "2026-05-24 双人群对齐补丁" 段
  - 补充 desktop-specific TODO(Pro Mode coding 视图 / Simple 默认承诺)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 4. F3 — 给 `docs/mobile-prd-v5.md` 追加 "2026-05-24 双人群对齐补丁" 段
  - 补充 mobile-specific TODO(移动端不暴露 Pro,但保持跨端镜像 + push)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 5. F1 后端 — 加 Tauri 命令 `workspace_grep_symbols`
  - 入参 `query / workspace_dir / limit`
  - 实现:walker 扫工作区 .ts/.tsx/.js/.jsx/.py/.rs/.go/.java/.kt 文件,正则匹配 `function/class/def/interface/type/const/export`
  - 返回 `Vec<{name, kind, file, line}>`
  - 注册到 `tauri::Builder` invoke_handler + ACL toml
  - _Requirements: 3.2_

- [ ] 6. F1 前端 — 加 `searchSymbols` 到 `desktop/src/services/workspace.ts`
  - export `interface SymbolHit` + `async function searchSymbols(query, workspaceDir, limit?)`
  - try/catch,失败返回空数组(不抛)
  - _Requirements: 3.2, 3.4_

- [ ] 7. F1 — 新建 `desktop/src/components/OpenInIdeButton.tsx`
  - props `{ path; line?; column?; className? }`
  - 内部 useUserMode 判断,非 Pro 返回 null
  - 主按钮调 `openInIde(...)`,chevron 切 Cursor / VS Code,持久化 localStorage
  - 失败显示 tooltip "未找到 Cursor / VS Code 安装"
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 8. F1 — 在消息工具卡片接入 `OpenInIdeButton`
  - 找到 ToolCallView / file artifact 渲染处,在 file path 旁注入按钮
  - _Requirements: 2.1_

- [ ] 9. F1 — ChatTitleBar More 菜单加 "Workspace Diff"(Pro)
  - 添加 `{ emoji: "🔍", label: "Workspace Diff", action, tier: "pro" }`
  - 状态接到 zustand 或 ChatPanelImpl
  - _Requirements: 1.1, 1.2, 1.4_

- [ ] 10. F1 — 新建 `desktop/src/components/WorkspaceDiffWorkbench.tsx`
  - 全屏 panel,左侧改动文件列表,右侧 `<DiffView>`
  - 复用 `services/workspaceBackups.ts` 的 listBackups
  - close / Esc 关闭
  - _Requirements: 1.2, 1.3_

- [ ] 11. F1 — MentionAutocomplete 接入 `@symbol` symbol picker
  - 检测 `@s` / `@sym` 等 trigger 在 Pro Mode 下调 `searchSymbols`
  - Simple/Standard 退化为 `@file`
  - 空结果 fallback `@file`
  - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [ ] 12. F1 — 新建 `desktop/tests/e2e/pro-mode-coding-views.spec.ts`
  - 切 simple → 断言不可见;切 standard → 断言不可见;切 pro → 断言三件套都可见
  - 失败信息明确含 mode 与 missing element
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 13. 全量校验 — `validate-positioning.mjs` 仍 12/12 PASS
  - 确认本 sprint 未误改 positioning 文档
  - _Requirements: 7.3_

- [ ] 14. 全量校验 — vitest + tsc --noEmit
  - `npm run test:run` ≥ 91/91 + `npx tsc --noEmit` 无新错误
  - _Requirements: 7.1, 7.4_

- [ ] 15. 全量校验 — e2e 至少跑 pro-mode-coding-views + light-theme-smoke
  - 时间允许跑全量,允许 ≤ 2 个 conditional skip
  - _Requirements: 7.2_

- [ ] 16. git commit + push 到 `perf/desktop-pre-launch-p1`
  - commit message 引用本 spec 与上一个 commit `f93365552`
  - push(velocity window 自动批准)
  - _Requirements: 通用_

## Task Dependency Graph

```
Wave 1 (1, 2, 3, 4)         ─→ 文档先行
Wave 2 (5, 6)               ─→ 后端 Tauri 命令 + 前端 wrapper
Wave 3 (7, 8, 9, 10, 11)    ─→ 前端组件并行
Wave 4 (12)                 ─→ e2e 测试
Wave 5 (13, 14, 15)         ─→ 全量校验
Wave 6 (16)                 ─→ commit + push
```

```json
{
  "waves": [
    {
      "wave": 1,
      "parallel": ["1", "2", "3", "4"],
      "description": "F2 营销话术 + F3 三份 PRD 补丁(纯文档,完全独立可并行)"
    },
    {
      "wave": 2,
      "parallel": ["5", "6"],
      "description": "F1 后端 — Tauri 命令 + 前端 wrapper"
    },
    {
      "wave": 3,
      "parallel": ["7", "8", "9", "10", "11"],
      "description": "F1 前端组件 — OpenInIdeButton / Workspace Diff / @symbol picker(改不同文件,可并行)"
    },
    {
      "wave": 4,
      "parallel": ["12"],
      "description": "F1 e2e 测试"
    },
    {
      "wave": 5,
      "parallel": ["13", "14", "15"],
      "description": "全量校验:validate-positioning + vitest + tsc + e2e smoke"
    },
    {
      "wave": 6,
      "parallel": ["16"],
      "description": "commit + push"
    }
  ]
}
```

**关键路径**:`1 → 2 → 3 → 4 → 5 → 6 → 7 ... 11 → 12 → 13/14/15 → 16`

## Notes

### Why this order

- Wave 1 是纯文档,**先做完**留时间给代码工作。
- Wave 2 后端 Tauri 命令在前,前端 wrapper 紧随。
- Wave 3 五个前端组件改不同文件,可完全并行。
- Wave 5 三项校验互相独立但都需在 commit 前通过。

### 预计耗时

- Wave 1: 50 min(纯文档,4 个文件)
- Wave 2: 60 min(写 Rust 命令 + 注册 + ACL + 前端 wrapper)
- Wave 3: 60–90 min(5 个组件复用既有)
- Wave 4: 30 min(playwright spec)
- Wave 5: 20 min(校验)
- Wave 6: 10 min(commit + push)
- **总计**: ~3.5 小时

### 不动什么

- `frontend/pages/index.tsx` 与所有 `frontend/components/marketing/`(GTM 决策另立)
- 移动端实质内容(只追加补丁段)
- Simple / Standard 用户的体验(Pro Mode 加法,非减法)
- `positioning-revision-2026-05` spec 的 requirements / tasks(已完成,不再动)

### Velocity Window 策略

AGENTS.md:本次属 "Auto-approved docs / tests / 桌面端 feature branch push",
**无需用户逐 task 确认**。失败回退点在每个 wave 结束做 smoke check。
Wave 6 push 到现有分支 `perf/desktop-pre-launch-p1`,不新建 branch。
