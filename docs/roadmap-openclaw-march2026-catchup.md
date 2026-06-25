# Agentrix × OpenClaw 2026.3 补齐路线图

> 对标 Claude Code v2.0 — v2.1.87 全部核心功能，结合 Agentrix 多端协同特色，制定按优先级排序的实施计划。

---

## 当前已完成 (P0 — P3) ✅

| 编号 | 功能 | 对标 OpenClaw | 状态 |
|------|------|--------------|------|
| P0 | Copilot 模型目录 (2→20, tier/premium) | `/model` picker | ✅ `0b94dbf3` |
| P1a | web_search + web_fetch 工具 | WebSearch + WebFetch tools | ✅ `0b94dbf3` |
| P1b | 桌面端 tool_use UI (tool chips, model meta) | Tool call display | ✅ `0b94dbf3` |
| P1c | 语音+Copilot 混合 | Voice mode | ✅ 已有 Gemini Live |
| P2 | 浏览器控制 (open_url + Tauri native) | Chrome integration | ✅ `c7c19e6f` |
| P3a | 多轮 Agent 循环 (Bedrock/OpenAI/Anthropic, 5轮) | Agent multi-turn loop | ✅ `c7c19e6f` |
| P3b | 代码沙箱 (code_eval, Node vm) | Bash sandbox | ✅ `c7c19e6f` |

---

## Phase 4: 核心 Agent 智能 (🔴 高优先级)

> 目标: 让 Agent 具备规划、记忆、长会话能力，对标 OpenClaw Plan Mode + Auto-Memory + Compaction

### 4.1 Plan Mode (规划模式)
**对标**: OpenClaw v2.0.28 Plan Mode, v2.0.51 精确 Plan
**工作量**: 5-7天

- [ ] 后端: 新增 `plan_mode` 标志位，当用户请求 "制定计划" 时，先让 LLM 输出结构化计划 JSON
- [ ] 后端: 计划步骤拆分 → 逐步执行 → 每步结果反馈
- [ ] 前端 (Web/Desktop/Mobile): 计划预览 UI，用户可编辑/审批/拒绝计划
- [ ] 多端协同: 桌面端制定计划 → 移动端审批 → 桌面端执行

**涉及文件**:
- `backend/src/modules/openclaw-proxy/openclaw-proxy.service.ts` — 添加 plan mode 路由
- `backend/src/modules/ai-integration/claude/claude-integration.service.ts` — plan 模式循环
- `desktop/src/components/PlanView.tsx` — 新建
- `clawlink/screens/agent/PlanApprovalScreen.tsx` — 新建

### 4.2 Auto-Memory (自动记忆)
**对标**: OpenClaw v2.1.59 Auto-Memory, v2.1.75 Memory timestamps
**工作量**: 4-5天

- [ ] 后端: `agent_memory` 表 (agent_id, user_id, key, content, updated_at)
- [ ] 后端: 每轮对话结束后，LLM 自动提取有用信息存入 memory
- [ ] 后端: 下一次对话时，自动注入相关 memory 到 system prompt
- [ ] 前端: `/memory` 管理界面 (查看、编辑、删除记忆)
- [ ] 多端协同: 全设备共享同一 memory store (通过后端 API)

**涉及文件**:
- `backend/src/entities/agent-memory.entity.ts` — 新建
- `backend/src/modules/agent/agent-memory.service.ts` — 新建
- `backend/src/modules/ai-integration/` — 注入 memory context

### 4.3 会话压缩 (Conversation Compaction)
**对标**: OpenClaw v2.0.47 Auto-compact, v2.1.76 Compaction improvements
**工作量**: 3-4天

- [ ] 后端: 当对话 token 数超过阈值 (如 context 的 80%) 时，自动压缩历史消息
- [ ] 后端: 压缩策略 — LLM 总结历史 → 替换为压缩摘要 + 保留最近 N 条
- [ ] 前端: 显示 context 使用率进度条 (token used %)
- [ ] `/compact` API 端点 — 手动触发压缩

### 4.4 会话恢复 (Session Resume/Continue)
**对标**: OpenClaw `--continue`, `--resume`
**工作量**: 3-4天

- [ ] 后端: 会话持久化已有 (agent_session + agent_message)，补充 session 元数据 (title, tags, last_active)
- [ ] 前端: 会话列表 → 点击恢复 → 加载历史 + 自动注入 memory
- [ ] 多端协同: 在移动端看到桌面端的对话历史，可选择继续

---

## Phase 5: 多端智能体协同 (🟡 核心差异化 — Agentrix USP)

> 目标: 构建 OpenClaw 完全不具备的跨设备协作能力，这是 Agentrix 的核心竞争力

### 5.1 跨设备 Agent 状态同步
**独创功能** — OpenClaw 无此能力
**工作量**: 5-7天

- [ ] 后端: WebSocket 房间 per session — 实时广播 agent 消息、工具调用、计划状态
- [ ] 后端: `AgentSyncGateway` WebSocket gateway (基于现有 `websocket/` 模块)
- [ ] 移动端: 实时显示桌面端 agent 正在做什么 (streaming 状态)
- [ ] 桌面端: 显示移动端的审批/输入

**涉及文件**:
- `backend/src/modules/websocket/` — 扩展 agent sync namespace
- `desktop/src/services/websocket.ts` — 订阅 agent 同步
- `clawlink/services/websocket.ts` — 订阅 agent 同步

### 5.2 多 Agent 子任务 (Sub-agents)
**对标**: OpenClaw v2.0.64 Task tool, v2.0.60 Background agents, v2.1.49 Worktrees
**工作量**: 5-7天

- [ ] 后端: `agent_task` 表 — 子任务 (parent_session_id, child_session_id, status, result)
- [ ] 后端: 主 Agent 可调用 `create_subtask` 工具 → 生成子 Agent 会话
- [ ] 后端: 子 Agent 独立运行，完成后结果返回主 Agent
- [ ] 前端: 子任务面板 — 显示所有子任务状态树
- [ ] 多端协同: 子任务分配到不同设备 (桌面版工作类, 移动端审批类)

### 5.3 桌面-移动端 Bridge (设备桥接)
**对标**: OpenClaw Remote Control (v2.1.51+), but BETTER — 完全双向
**工作量**: 5-7天

- [ ] QR Code 配对: 桌面端显示 QR → 移动端扫描 → 建立 WebSocket bridge
- [ ] 桌面→移动: 将需要审批的操作推送到手机 (文件修改确认、敏感 API 调用)
- [ ] 移动→桌面: 手机端快速发送指令给桌面 Agent
- [ ] 远程文件浏览: 在手机上浏览桌面端的项目文件结构
- [ ] 支持拍照上传: 移动端拍照 → 通过 bridge → 桌面 Agent 分析图片

**涉及文件**:
- `desktop/src/services/bridge.ts` — 新建
- `clawlink/screens/bridge/` — 新建
- Tauri: 利用现有 `desktop_bridge_*` 命令扩展

### 5.4 Agent Teams (多 Agent 协作)
**对标**: OpenClaw v2.1.32 Agent teams (experimental)
**工作量**: 7-10天

- [ ] 后端: Agent Team 配置 → N 个 Agent 并行工作
- [ ] 后端: Team Leader/Worker 角色分配
- [ ] 前端: 多窗格显示每个 teammate 的工作状态
- [ ] 多端协同: 一个 Agent 在桌面、另一个 Agent 在移动端并行工作

---

## Phase 6: 开发者扩展能力 (🟢 中优先级)

> 目标: 补齐 OpenClaw 的 Hook/Plugin/MCP 生态

### 6.1 Hook 系统
**对标**: OpenClaw v1.0.38 Hooks, PreToolUse/PostToolUse/SessionStart/SessionEnd
**工作量**: 4-5天

- [ ] 后端: `hook_config` 表 — 定义钩子 (event_type, handler_script, priority)
- [ ] 后端: Hook 触发点 — PreToolUse, PostToolUse, SessionStart, SessionEnd, PlanAccept
- [ ] 后端: Hook 执行器 — 支持 HTTP webhook + 内置处理
- [ ] 前端: Hook 管理 UI

### 6.2 自定义 Slash 命令
**对标**: OpenClaw v0.2.31 Custom slash commands, v2.0.20 Skills
**工作量**: 3-4天

- [ ] 后端: 解析 `.agentrix/commands/` 目录下的 markdown 文件作为自定义命令
- [ ] 后端: 命令执行 → 注入 prompt → 执行
- [ ] 前端: `/` 命令菜单 (已有部分功能，需补齐自定义命令支持)

### 6.3 MCP Server 完整支持
**对标**: OpenClaw MCP stdio/SSE/HTTP transports, OAuth, Elicitation
**工作量**: 5-7天

- [ ] 后端: MCP Server 注册 → 连接管理 → 工具发现
- [ ] 后端: 支持 stdio, SSE, Streamable HTTP 三种传输
- [ ] 后端: MCP OAuth 认证流程
- [ ] 前端: MCP Server 管理 UI (启用/禁用/重连)
- [ ] 多端协同: 桌面端连接本地 MCP Server → 移动端通过后端中转使用

### 6.4 Plugin 架构
**对标**: OpenClaw v2.0.12 Plugin system
**工作量**: 7-10天 (长期)

- [ ] 后端: Plugin manifest 解析 (commands, agents, hooks, MCP servers)
- [ ] 后端: Plugin 安装/卸载/启用/禁用
- [ ] 前端: Plugin marketplace 浏览+安装
- [ ] 安全: Plugin sandbox — 隔离运行，权限控制

---

## Phase 7: UX 精打细磨 (🔵 持续优化)

> 目标: 匹配 OpenClaw 的高级 UX 特性

### 7.1 流式响应增强
- [ ] SSE 逐行流式 (当前 RN 不支持 ReadableStream，需 polyfill 或降级方案)
- [ ] 工具调用进度指示 (spinner + tool name)
- [ ] 思考过程展示 (thinking blocks)

### 7.2 语音增强
**对标**: OpenClaw Voice mode 20 languages, push-to-talk
- [ ] 移动端: Push-to-talk (已有 Gemini Live 基础，补齐 UI)
- [ ] 桌面端: 麦克风输入 → Whisper 转文字 → Agent 处理
- [ ] 多语言 STT 支持

### 7.3 Agent 运行沙箱
**对标**: OpenClaw Sandbox mode (v2.0.24+)
- [ ] 桌面端: 沙箱化 code_eval (现有 Node vm，改为 Docker 容器或 WASM)
- [ ] 文件系统权限控制 (读/写白名单)

### 7.4 会话管理增强
**对标**: OpenClaw session titles, search, export, fork
- [ ] AI 自动命名会话 (基于首条消息)
- [ ] 会话搜索 (按关键词搜索历史对话)
- [ ] 会话导出 (`/export` markdown)
- [ ] 会话分叉 (`/fork` — 从某个点创建分支对话)
- [ ] 多端: 全设备统一会话列表

### 7.5 Context 可视化
**对标**: OpenClaw `/context` 命令
- [ ] 显示当前 context window 使用情况 (tool schemas + memory + history)
- [ ] Token 计数器 (实时显示 used/remaining)
- [ ] 优化建议 (哪些工具占用过多 context)

---

## Phase 8: 跨平台深度集成 (🟣 Agentrix 独有)

> 完全独创的跨平台能力，竞品不具备

### 8.1 统一会话历史
- [ ] 所有设备 (Web / Desktop / Mobile) 的会话历史在后端统一存储
- [ ] 任一设备可查看全部历史 (已有 agent_session/agent_message 基础)

### 8.2 Remote Control 增强
- [ ] 移动端作为遥控器控制桌面 Agent (发指令, 查看输出, 审批操作)
- [ ] 桌面端通知推送到移动端 (Agent 完成任务 / 需要输入)

### 8.3 设备能力互补
- [ ] 移动端: 拍照 → 发送给 Agent → 桌面端处理
- [ ] 移动端: GPS 定位 → Agent 位置感知能力
- [ ] 桌面端: 屏幕截图 → Agent 分析 (已有 capture_screen Tauri 命令)
- [ ] 桌面端: 本地文件系统操作 → 移动端确认

### 8.4 共享 Agent 工作区 (Team Collaboration)
- [ ] 多用户共享同一 Agent 实例
- [ ] 权限控制 (查看/编辑/管理)
- [ ] 实时协作 (类似 Google Docs for Agent conversations)

---

## 实施优先级总览

```
                    重要性
                      ↑
   Phase 5          |  Phase 4
   多端协同 (USP)    |  核心Agent智能
   ─────────────────┼─────────────────→ 紧急性
   Phase 8          |  Phase 6
   跨平台深度集成    |  开发者扩展
                    |  Phase 7: UX (持续)
```

## 推荐实施顺序

| 批次 | 阶段 | 功能 | 预估工作量 | 说明 |
|------|------|------|-----------|------|
| **第1批** | P4.1 | Plan Mode | 5-7天 | Agent 必备，所有高级功能的基础 |
| **第1批** | P4.2 | Auto-Memory | 4-5天 | 用户粘性关键，与 Plan Mode 并行 |
| **第1批** | P4.3 | 会话压缩 | 3-4天 | 长会话必须，否则 context overflow |
| **第2批** | P5.1 | 跨设备同步 | 5-7天 | Agentrix 核心差异化，优先做 |
| **第2批** | P4.4 | 会话恢复 | 3-4天 | 与跨设备同步配合 |
| **第2批** | P5.3 | 设备桥接 | 5-7天 | USP 功能, 与跨设备同步一起 |
| **第3批** | P5.2 | 多Agent子任务 | 5-7天 | 进阶 agentic 能力 |
| **第3批** | P6.3 | MCP 完整支持 | 5-7天 | 生态对接必须 |
| **第3批** | P6.1 | Hook 系统 | 4-5天 | 扩展性基础 |
| **第4批** | P5.4 | Agent Teams | 7-10天 | 高级多 Agent |
| **第4批** | P6.4 | Plugin 架构 | 7-10天 | 长期生态 |
| **第4批** | P7.* | UX 精打细磨 | 持续 | 穿插在各批次中 |
| **第5批** | P8.* | 跨平台深度集成 | 持续 | 基于 P5 进一步深化 |

---

## 与 OpenClaw 功能对照表

| OpenClaw 功能 | 版本 | Agentrix 状态 | 计划阶段 |
|---------------|------|---------------|----------|
| Multi-model picker | v1.0 | ✅ 已有 (20 models) | — |
| Web Search / Fetch | v0.2.105 | ✅ 已有 | — |
| Tool Use + Multi-turn | v1.0 | ✅ 5轮循环 | — |
| Code sandbox | v2.0.24 | ✅ code_eval (vm) | P7.3 增强 |
| Voice mode | v0.2.105 | ✅ Gemini Live | P7.2 增强 |
| Chrome / Browser | v2.0.72 | ✅ open_url + Tauri | — |
| **Plan Mode** | v2.0.28 | ❌ 缺失 | **P4.1** |
| **Auto-Memory** | v2.1.59 | ❌ 缺失 | **P4.2** |
| **Auto-Compact** | v2.0.47 | ❌ 缺失 | **P4.3** |
| **Session Resume** | v0.2.93 | 🟡 部分 (有DB, 无UI) | **P4.4** |
| **Background Agents** | v2.0.60 | ❌ 缺失 | **P5.2** |
| **Agent Teams** | v2.1.32 | ❌ 缺失 | **P5.4** |
| **Remote Control** | v2.1.51 | ❌ 缺失 | **P5.3** |
| **Hooks** | v1.0.38 | ❌ 缺失 | **P6.1** |
| **Slash Commands** | v0.2.31 | 🟡 部分 | **P6.2** |
| **MCP Full** | v1.0.27 | 🟡 有 proxy | **P6.3** |
| **Plugin System** | v2.0.12 | ❌ 缺失 | **P6.4** |
| **Thinking Display** | v0.2.44 | ❌ 缺失 | **P7.1** |
| **Context Viz** | v1.0.86 | ❌ 缺失 | **P7.5** |
| Worktree isolation | v2.1.49 | N/A (非 CLI) | — |
| File watch / LSP | v2.0.74 | N/A (非 IDE) | — |
| Terminal UI | v2.0 | N/A (非 CLI) | — |

### Agentrix 独有能力 (OpenClaw 不具备)

| 能力 | 说明 |
|------|------|
| 🌟 三端统一 | Web + Desktop + Mobile 共享后端 |
| 🌟 跨设备会话同步 | 实时 WebSocket 同步 Agent 状态 |
| 🌟 设备桥接 | QR 配对 + 双向控制 |
| 🌟 移动端审批 | 手机端审批桌面端操作 |
| 🌟 设备能力互补 | 摄像头+GPS (移动) + 文件系统 (桌面) |
| 🌟 商业化完整 | 支付+钱包+Marketplace+Escrow |
| 🌟 Agent 经济体 | 技能市场+任务市场+佣金体系 |

---

## 技术风险 & 注意事项

1. **RN SSE 限制**: React Native 不支持 `ReadableStream`，移动端流式响应需要 WebSocket 或 EventSource polyfill
2. **Context Window**: 当前 5 轮循环可能不够，Auto-Compact (P4.3) 是解锁长会话的关键
3. **MCP 生态**: 完整 MCP 实现需要 stdio transport (仅桌面端可用)，移动端需要后端中转
4. **Agent Teams**: Token 消耗极高，需要成本控制机制
5. **WebSocket 稳定性**: 跨设备同步需要断线重连 + 消息队列缓冲

---

*最后更新: build138 commit `c7c19e6f`*
*对标: Claude Code (OpenClaw) v2.1.87*
