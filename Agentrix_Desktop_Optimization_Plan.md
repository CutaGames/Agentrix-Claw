# Agentrix Desktop & Backend 体验优化与未来演进方案

基于对当前桌面端（Tauri + React）和后端（Node.js + Agent Loop + 工具注册表）的全面代码审计，本报告提炼了核心的 UX 体验痛点、架构重构建议，以及桌面端未来的差异化与功能拓展方向。

---

## 第一部分：UX 体验优化方案 (近期 P0-P1)

### 1. 聊天面板 (ChatPanel) 的解耦与重构
**现状**：`ChatPanel.tsx` 高达 4700+ 行，包含了消息渲染、状态管理、流式解析、工具调用展示、审批拦截等所有逻辑，导致热更新极慢、偶发卡顿，且极易引发类似 `approvalId undefined` 的状态竞争 Bug。
**优化方案**：
*   **模块化拆分**：将组件拆分为 `MessageList`, `InputZone`, `ToolExecutionBlock`, `ApprovalModal`, `FileContextZone`。
*   **状态下放**：引入 Zustand 或 Jotai 替代顶层庞大的 React State，将 `isStreaming`, `currentApproval`, `workspaceChanges` 做到局部订阅刷新，提升输入流畅度。

### 2. 工具执行的透明度与可控性
**现状**：Agent 执行后台任务（如大范围扫描文件、连续执行终端命令）时，用户只能看到加载动画或生硬的代码块，缺乏掌控感。长任务中断时，自动 Continue 机制参数传递不稳导致崩溃。
**优化方案**：
*   **流式工具状态树**：在 UI 渲染出类似 Cursor 的工具步骤树，展示实时的终端 stdout/stderr 输出（Tail logs）。
*   **优雅的 Continue 交互**：引入显著的「▶ 继续生成 (Continue)」按钮，代替生硬的内部断点。
*   **撤销与回退 (Undo/Revert)**：由于接通了真实的 `desktop_write_file`，修改文件前自动在本地创建 `.agentrix/backup`，UI 提供一键「撤销本次修改」功能。

### 3. 工作区感知与反馈
**现状**：已实现底层同步，但 UI 未暴露。用户不知道 Agent 改了什么文件。
**优化方案**：
*   **集成 WorkspaceFileStatus**：将新写的 Git 状态组件融入左侧边栏或侧滑面板。
*   **内联 Diff 对比**：Agent 修改文件后，不仅返回成功，还在聊天流中生成一个轻量级的内联 Diff 视图（类似 GitHub PR 视图）。

---

## 第二部分：桌面端未来功能拓展方向

桌面端的独特优势在于**本地算力**和**操作系统级权限**，这是 Web 端和 Mobile 端无法比拟的。

### 1. 深度系统集成 (Deep OS Integration)
*   **全局唤醒 (Spotlight / Raycast 模式)**：注册全局快捷键（如 `Cmd+Space`），唤醒悬浮搜索框，支持直接向 Agent 下发系统级指令。
*   **屏幕与上下文感知**：利用 Tauri 的屏幕捕获能力，让 Agent 能够“看”到用户当前活跃的窗口（浏览器、设计软件），实现跨应用问答。

### 2. 本地 AI 算力与隐私优先模式 (Local-First Intelligence)
*   **无缝混合路由 (Hybrid Routing)**：完善 `turnRouter.ts`。日常问答、隐私文件检索走本地模型；复杂编码无缝平滑切换到云端。
*   **本地工作区向量化库**：在本地静默建立工作区代码、个人笔记的向量索引（Local RAG）。

### 3. IDE 伴生与无缝桥接
*   与其完全替代 VSCode，不如做最好的“伴生平台”。
*   提供 VSCode/Cursor 插件，实现**双向通信**：在 Agentrix 沟通方案，Agent 生成补丁后，直接通过 IPC 将光标移动到 VSCode 对应文件并高亮修改区域。

---

## 第三部分：差异化与护城河策略 (Agentrix vs 竞品)

当前市场已有 Cursor, Windsurf, GitHub Copilot，Agentrix 的核心破局点在于**生态、跨端与 A2A 协作**。

### 1. 技能市场与微交易 (Marketplace & QuickPay)
*   **本地执行付费技能**：结合 X402/QuickPay，桌面端可以直接订阅并下载第三方开发的高级自动化流（如飞书文档管理、自动化PPT）。
*   桌面端提供专属的**技能画布 (Skill Canvas)**，用户可以通过拖拽组合流。

### 2. A2A 多智能体协作 (Swarm on Desktop)
*   单体 Agent 的能力有上限。桌面端应引入 **Agent Team (多 Agent 并行)** 机制。
*   **差异化场景**：生成一个 `Planner`, 一个 `Coder`, 一个 `Reviewer`。在桌面的本地沙盒中协作执行。

### 3. 全端数据与上下文流转 (Omni-channel Context)
*   **Mobile 到 Desktop 的接力**：在通勤时用手机端确认架构，Agent 将结论存入 `memory`。打开桌面端，Agentrix 主动提示开始写代码。这是纯桌面 IDE 无法做到的。