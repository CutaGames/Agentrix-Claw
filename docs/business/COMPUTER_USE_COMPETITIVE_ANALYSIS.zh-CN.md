# Computer Use 竞品分析：Agentrix vs Claude Code vs Codex vs Genspark

**日期：** 2026-05-18  
**目的：** 对比 Agentrix Desktop 的 Computer Use 能力与主要竞品，识别差距和优化方向

---

## 一、产品定位对比

| 维度 | Agentrix Desktop | Claude Code | OpenAI Codex | Genspark |
|------|-----------------|-------------|--------------|----------|
| **核心定位** | AI Agent 经济平台（跨端） | 开发者编码 Agent | 云端编码 Agent | AI 浏览器 + Super Agent |
| **形态** | 桌面浮球 + 聊天面板 | CLI + Desktop App + IDE | Web App + CLI + Desktop | AI 浏览器 |
| **目标用户** | 普通用户 + 开发者 | 专业开发者 | 专业开发者 | 普通用户 + 知识工作者 |
| **平台** | Windows (Tauri) | macOS/Linux/Windows | macOS/Windows | Windows/macOS |
| **模型** | Bedrock Claude + 本地 Gemma | Claude Sonnet 4.6 | GPT-5 Codex | 多模型路由 |
| **开源** | 否 | CLI 开源 | CLI 开源 | 否 |

---

## 二、Computer Use 能力详细对比

### 2.1 屏幕交互

| 能力 | Agentrix | Claude Code | Codex | Genspark |
|------|----------|-------------|-------|----------|
| 截图 | ✅ xcap + 自动缩放 1024px + JPEG 压缩 | ✅ 内置 MCP server | ✅ 后台截图（不占用户屏幕） | ❌ 无桌面截图 |
| 鼠标点击 | ✅ 坐标点击 + 左/右/双击 | ✅ 坐标点击 | ✅ 后台独立光标 | ❌ |
| 鼠标移动 | ✅ | ✅ | ✅ | ❌ |
| 键盘输入 | ✅ 文字 + 组合键 | ✅ | ✅ | ❌ |
| 窗口列表 | ✅ window_tree | ✅ | ✅ | ❌ |
| **多显示器** | ✅ monitor_index | ✅ | ✅ | ❌ |
| **后台执行** | ❌ 占用用户屏幕 | ❌ 占用用户屏幕 | ✅ **独立后台光标** | N/A |
| **并行 Agent** | ❌ 单 Agent | ❌ 单 Agent | ✅ **多 Agent 并行** | ✅ 多任务 |

### 2.2 浏览器自动化

| 能力 | Agentrix | Claude Code | Codex | Genspark |
|------|----------|-------------|-------|----------|
| 打开 URL | ✅ CDP 控制 Chrome | ✅ 通过 Computer Use 点击 | ✅ 内置浏览器 | ✅ **原生浏览器** |
| 列出标签页 | ✅ CDP | ❌ 需截图识别 | ✅ | ✅ |
| 执行 JS | ✅ CDP eval | ❌ | ✅ | ✅ |
| CSS 选择器点击 | ✅ CDP | ❌ 需坐标 | ✅ | ✅ |
| **表单填写** | ⚠️ 需组合 type+click | ✅ 自动识别 | ✅ | ✅ **原生支持** |
| **网页内容提取** | ⚠️ 需 eval | ✅ | ✅ | ✅ **Sparkpage 结构化** |
| **广告屏蔽** | ❌ | ❌ | ❌ | ✅ |
| **MCP 集成** | ❌ | ✅ 300+ 服务 | ❌ | ✅ MCP Store |

### 2.3 文件系统 & 终端

| 能力 | Agentrix | Claude Code | Codex | Genspark |
|------|----------|-------------|-------|----------|
| 读文件 | ✅ + 行范围 | ✅ + 智能搜索 | ✅ 沙箱内 | ❌ |
| 写文件 | ✅ | ✅ + diff 预览 | ✅ + PR 提交 | ❌ |
| 目录列表 | ✅ | ✅ | ✅ | ❌ |
| 执行命令 | ✅ + 超时控制 | ✅ + 交互式终端 | ✅ 沙箱 | ❌ |
| **Git 操作** | ❌ 需手动命令 | ✅ **原生 git 工作流** | ✅ **自动 PR** | ❌ |
| **代码搜索** | ❌ | ✅ grep/ripgrep | ✅ | ❌ |
| **LSP 集成** | ❌ | ✅ 类型检查 + 诊断 | ❌ | ❌ |

### 2.4 安全 & 审批

| 能力 | Agentrix | Claude Code | Codex | Genspark |
|------|----------|-------------|-------|----------|
| 分级审批 | ✅ L0-L3 | ✅ 3 级权限模式 | ✅ 沙箱隔离 | ⚠️ 有限 |
| 会话记忆审批 | ✅ | ✅ | N/A | ❌ |
| **沙箱隔离** | ❌ 直接操作用户系统 | ❌ 直接操作 | ✅ **云端沙箱** | ✅ 浏览器沙箱 |
| **操作回滚** | ❌ | ✅ git revert | ✅ 沙箱丢弃 | ❌ |
| **注入防护** | ❌ | ✅ 自动扫描 | ✅ | ⚠️ |

---

## 三、架构对比

### Agentrix
```
用户 → 桌面端 WebView → Backend (Bedrock Claude) → desktop-sync 命令队列 → 桌面端 Tauri 执行
```
- **优势**：云端模型 + 本地执行，支持 3-tier 路由
- **劣势**：命令轮询延迟 2.5s，截图需 JPEG 压缩绕过 body 限制

### Claude Code
```
用户 → CLI/Desktop App → 本地 Claude API 调用 → 本地工具执行
```
- **优势**：零延迟本地执行，MCP 扩展生态
- **劣势**：依赖 Anthropic API，无本地模型 fallback

### OpenAI Codex
```
用户 → Web/Desktop App → 云端沙箱 (独立 VM) → 后台执行
```
- **优势**：后台并行、沙箱安全、不占用户屏幕
- **劣势**：无法操作用户本地应用

### Genspark
```
用户 → AI 浏览器 → 云端 Super Agent → 浏览器内执行
```
- **优势**：原生浏览器集成、MCP Store、多模型路由
- **劣势**：仅限浏览器内操作，无桌面/文件系统能力

---

## 四、Agentrix 的独特优势

1. **跨平台 Agent 经济**：不仅是工具，是一个 Agent 市场 + 经济系统（AXP 代币）
2. **3-tier 执行**：本地 → 智能路由 → 云端，适应不同网络/隐私需求
3. **萌宠 + 游戏化**：独特的用户粘性机制
4. **CDP 浏览器自动化**：比 Claude Code 的坐标点击更精准（CSS 选择器）
5. **移动端协同**：手机可远程控制桌面 Agent

---

## 五、关键差距 & 优化建议（按优先级排序）

### P0 — 必须立即修复

| # | 差距 | 竞品参考 | 建议方案 | 预估工作量 |
|---|------|---------|---------|-----------|
| 1 | **截图不在对话框显示** | Claude Code 内联显示 | ✅ 已修复（本次 onEvent 改动） | 已完成 |
| 2 | **命令轮询延迟 2.5s** | Claude Code 即时执行 | WebSocket 推送替代轮询 | 2天 |
| 3 | **无操作回滚** | Claude Code git revert / Codex 沙箱 | 文件操作前自动 snapshot + undo 按钮 | 3天 |

### P1 — 短期优化（1-2 周）

| # | 差距 | 竞品参考 | 建议方案 |
|---|------|---------|---------|
| 4 | **无后台执行** | Codex 独立光标 | 虚拟桌面 / 隐藏窗口模式执行 CU 操作 |
| 5 | **无 Git 原生支持** | Claude Code 完整 git 工作流 | 添加 `desktop_git_*` 工具集（status/commit/push/diff） |
| 6 | **无代码搜索** | Claude Code grep/ripgrep | 添加 `desktop_search_files` 工具（ripgrep） |
| 7 | **无 MCP 扩展** | Claude Code 300+ MCP / Genspark MCP Store | 支持用户自定义 MCP server 连接 |
| 8 | **截图质量 vs 大小** | Codex 后台高清截图 | 自适应质量：WiFi 高清 / 移动端压缩 |

### P2 — 中期规划（1-2 月）

| # | 差距 | 竞品参考 | 建议方案 |
|---|------|---------|---------|
| 9 | **无并行 Agent** | Codex 多 Agent 并行 | 支持多 session 并行执行不同任务 |
| 10 | **无 LSP 集成** | Claude Code 类型检查 | 集成 LSP 提供代码诊断 + 自动修复 |
| 11 | **无 Prompt Injection 防护** | Claude Code 自动扫描 | 截图 OCR 内容过滤 + 工具输出审计 |
| 12 | **无调度/定时任务** | Claude Code Scheduled Tasks | 支持 cron-like 定时 Agent 任务 |
| 13 | **浏览器自动化需手动启动 Chrome** | Genspark 原生浏览器 | 内置 Chromium 或自动检测系统 Chrome |

### P3 — 长期差异化

| # | 方向 | 说明 |
|---|------|------|
| 14 | **Agent 协作网络** | 多个 Agent 之间可以互相调用工具、共享上下文 |
| 15 | **视觉 Grounding** | 用 UI 元素检测（而非坐标）定位点击目标，提高准确率 |
| 16 | **录制 & 回放** | 用户操作录制为 Agent 可执行的 workflow |
| 17 | **跨设备 Agent 迁移** | 手机发起任务 → 桌面执行 → 手机查看结果（已有基础） |

---

## 六、总结

Agentrix 的 Computer Use 在**功能完整度**上已经接近 Claude Code（14 个工具全部 e2e 验证通过），在**浏览器自动化**方面（CDP 集成）甚至优于 Claude Code（后者依赖坐标点击）。

但在以下方面存在明显差距：
1. **执行延迟**（轮询 vs 即时）
2. **开发者工具链**（Git/LSP/代码搜索）
3. **安全性**（沙箱/回滚/注入防护）
4. **并行能力**（单 Agent vs 多 Agent）
5. **生态扩展**（MCP 协议支持）

**核心竞争力建议**：不要试图在"编码 Agent"赛道与 Claude Code/Codex 正面竞争，而是发挥 Agentrix 的独特优势——**跨平台 Agent 经济 + 游戏化 + 普通用户友好**。让 Computer Use 成为"AI 助手帮你完成日常电脑操作"的入口，而非仅服务开发者。
