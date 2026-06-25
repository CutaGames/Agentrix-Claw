# Agentrix 对标 OpenClaw 4.24 / Hermes Agent v0.5.0 架构功能审计与优化计划

日期：2026-04-27
状态：重新审计版，替换此前英文摘要版。

## 1. 来源与版本边界

本轮审计目标不是泛泛参考同类 Agent 项目，而是先核验 OpenClaw 4.24 与 Hermes Agent v0.5.0 的公开架构和功能，再映射到 Agentrix 当前实现。

已核验来源：

- OpenClaw 仓库与 README：`openclaw/openclaw`，README 显示最新 release 为 `openclaw 2026.4.24`，推荐 Node 24，核心定位是本地优先的个人 AI 助手；Gateway 是 sessions、channels、tools、events 的控制平面。
- OpenClaw 文档：Gateway architecture、Agent runtime、Session management、Multi-agent routing、Skills、Browser、Exec tool。
- OpenClaw 4.24 相关 issue：`#72208`、`#72434`、`#72044`、`#72370`、`#71972`、`#72465` 搜索摘要。注意：GitHub release tag 与 changelog 页面抓取器未能提取正文，因此本文不把未能复核的 release note 内容写成事实，只使用 README、文档、issue 和可抓取评论中的证据。
- Hermes Agent 源：`NousResearch/hermes-agent`，原始 `RELEASE_v0.5.0.md` 与 README 已核验。Hermes v0.5.0 对应 tag/版本号 `v2026.3.28`，release 标题为 `Hermes Agent v0.5.0 (v2026.3.28)`。
- Agentrix 当前实现：本地代码中的 `agent-orchestration`、`agent-context`、`agent-intelligence`、`query-engine`、`code-intelligence`、`auto-repair`、desktop local tool calling 等模块。

结论口径：OpenClaw 4.24 部分分为“已确认架构能力”和“4.24 issue 暴露的风险”；Hermes v0.5.0 部分可直接引用 release 原文能力；Agentrix 部分以当前代码实现为准。

## 2. OpenClaw 4.24 架构与功能审计

### 2.1 总体架构

OpenClaw 的核心不是单个聊天 UI，而是一个长期运行的本地 Gateway：

- Gateway 作为单一控制平面，维护消息平台连接，暴露 typed WebSocket API，发出 agent、chat、presence、health、heartbeat、cron 等事件。
- macOS app、CLI、Web UI、automations 通过 Gateway WebSocket 连接；macOS/iOS/Android/headless nodes 也通过 WebSocket 接入，但声明 `role: node` 和可用能力。
- Gateway 默认绑定 `127.0.0.1:18789`，可通过 Tailscale/VPN/SSH tunnel 做远程访问。
- Wire protocol 要求首帧 connect，后续 request/response/event 都是 JSON；副作用方法要求 idempotency key，用短期 dedupe cache 支持安全重试。
- Pairing 与本地信任是核心边界：设备 identity、challenge 签名、device token、非本地连接显式批准。

对 Agentrix 的启发：Agentrix 当前有 web/mobile/desktop/wearable 多端入口，但 Gateway/Runtime 还应进一步抽象为统一的“任务、事件、设备、权限、工具”控制面，而不只是一条 chat API。

### 2.2 多通道与多 Agent 路由

OpenClaw 支持 WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage/BlueBubbles、IRC、Teams、Matrix、Feishu、LINE、Mattermost、Nextcloud Talk、Nostr、Synology Chat、Tlon、Twitch、Zalo、WeChat、QQ、WebChat 等通道。多 Agent 路由的关键点是“一个 agent = 独立 brain”：

- 每个 agent 有独立 workspace、state directory、auth profiles、model registry、session store。
- Channel/account/peer/guild/team binding 决定 inbound message 路由到哪个 agent。
- Direct/group/room/cron/webhook 分别有不同 session 隔离规则；多人 DM 场景推荐 `per-channel-peer` 或更细隔离。
- Cross-agent memory search 可通过 QMD extra collections 显式配置，而不是默认共享所有上下文。
- 每个 agent 可配置单独 sandbox 和 tool allow/deny。

对 Agentrix 的启发：Agentrix 已有 11-agent team 和 AgentAccount/OpenClawInstance，但需要把“agent 身份、workspace、auth、session、工具权限、skills allowlist、审计线索”提升为强隔离边界，而不是仅作为账号和实例元数据。

### 2.3 工具执行、安全与浏览器自动化

OpenClaw 的工具体系可分三层：

- Exec/process：支持 foreground/background/process polling、`yieldMs`、timeout、host 选择 `auto | sandbox | gateway | node`、approval、allowlist、safe bins、Windows `pwsh` fallback、长任务完成事件。
- Browser：独立 `openclaw` 浏览器 profile、`user` 真实 Chrome MCP attach profile、remote CDP、Browserless/Browserbase、deterministic tabs/ref/actions/snapshots/screenshots/PDF，浏览器控制 API loopback-only，默认 SSRF fail-closed。
- Apply patch：作为 exec 子工具，默认 workspace-only，仅部分模型启用。

关键设计不是“有 shell/browser”，而是：工具能力和执行位置都可被 session/agent/sandbox/node 政策约束，且工具运行状态能形成事件流。

对 Agentrix 的启发：Agentrix 已有 desktop `run_command`、workspace search、auto-repair、backend permission engine，但还缺少 OpenClaw 级别的统一 host/sandbox/node 执行路由、safe bins/allowlist 策略、browser SSRF 策略、长进程事件唤醒和跨设备审批 UI。

### 2.4 Skills、插件与热更新

OpenClaw 使用 AgentSkills-compatible skill folder：

- `SKILL.md` 带 YAML frontmatter，至少包含 `name` 与 `description`。
- Skill 来源有明确优先级：workspace、project agent、personal agent、managed/local、bundled、extra dirs。
- Multi-agent 下，skill visibility 与 location 分离，可用 per-agent allowlist 控制。
- Plugin 可携带自己的 skills，例如 browser plugin 携带 browser-automation skill；复杂工具说明按需加载，减少常规 turn token 成本。
- Skill Workshop 可从 agent 工作中创建/更新 workspace skills，默认禁用；支持 pending approval、安全扫描、quarantine、snapshot refresh，无需 Gateway restart。
- ClawHub 提供公开 skill registry，支持 install/update/sync。
- 安全侧有 dangerous-code scanner、路径 realpath containment、env/apiKey 注入、load-time gating、watch/hot reload、token impact 估算。

对 Agentrix 的启发：Agentrix 有 `.github/agents` 与 marketplace/plugin 基础，但技能还没有成为运行时一等资产。应对齐 AgentSkills 格式、resolver、allowlist、安装安全扫描、运行时 env 注入与技能路由评估。

### 2.5 Session、memory 与 compaction

OpenClaw session 管理强调：

- Gateway 拥有 session state，UI 只查询 Gateway。
- `sessions.json` 保存 lifecycle timestamps，transcript 存 JSONL。
- daily reset、idle reset、manual reset 分别有清晰时钟语义，system events 不延长 idle freshness。
- session maintenance 可 warn/enforce，支持 cleanup dry-run。
- `/status`、`/context list`、session tools、history、compaction 作为可观测入口。

对 Agentrix 的启发：Agentrix 已有 TypeORM session/message/memory 和 desktop context compaction，但缺少跨端统一的 session lifecycle schema、transcript/summary 引用、system event 不污染 freshness 的规则，以及 release 级 session 维护/清理机制。

### 2.6 OpenClaw 4.24 暴露的风险与可借鉴修复方向

4.24 相关 issue 显示，先进架构的风险集中在启动依赖、runtime 迁移、reasoning replay、hook override、平台插件：

- `#72208`：Windows npm global 升级 2026.4.24 后，LiteLLM/OpenRouter pricing fetch timeout 会卡住 Gateway 启动，dashboard 不可达，Ctrl+C 无法退出。评论建议把 pricing refresh 从启动/关闭关键路径解耦，并覆盖 Windows npm-global、dashboard readiness、SIGINT 回归测试。
- `#72434`：4.23 到 4.24 的 `claude-cli` runtime/harness 迁移导致旧配置 `agents.defaults.embeddedHarness.runtime: "claude-cli"` 被当作未注册 AgentHarness id，所有 gateway request 失败。current main 评论指向 `agentRuntime` migration、CLI backend alias、startup plugin owner loading。教训是 runtime/provider/model 配置迁移必须有兼容层与 doctor 检查。
- `#72044`：DeepSeek-v4-pro thinking high 在多轮 tool-call / `sessions_spawn` 路径中要求真实 `reasoning_content` replay，空字符串或缺失都导致 400，并静默 fallback 到其他模型。教训是 reasoning fields 必须作为 transcript 的一等字段保留和重放，fallback 也要显式告知用户。
- `#72370`：workspace hooks 与 managed hooks 同名时被拒绝，managed 版本又无 events，导致 guardrail 实际 no-op 且只在日志里出现。教训是 hook/skill/plugin override 规则必须可解释、可审计、可在 status/doctor 中暴露。
- `#71972`：Windows Bonjour/mDNS `CIAO PROBING CANCELLED` unhandled rejection crash loop，current main 已通过统一 unhandled rejection registry 修复。教训是插件迁移时必须保留 shared error boundary，并为平台插件加 crash loop regression test。
- `#72465` 搜索摘要：CLI context 下 bundled `qqbot` extension 报 `PlatformAdapter not registered`，说明平台插件注册和 CLI/Gateway context 的边界也需要 doctor 检查。

这些风险对 Agentrix 非常关键：我们不能只复制功能，还要复制其回归测试与升级迁移策略。

## 3. Hermes Agent v0.5.0 架构与功能审计

Hermes v0.5.0 是 “hardening release”，不是单一大功能发布。它的价值在于把 provider、agent loop、gateway、tools、skills、安全、性能同时往生产态推进。

### 3.1 Provider 与模型路由

已核验 release 要点：

- Nous Portal 支持 400+ 模型，作为单 provider endpoint。
- Hugging Face 成为 first-class inference provider，含 auth、setup wizard、model picker、live `/models` probe、OpenRouter analogues curated picker。
- `/model` overhaul：抽出 CLI 与 gateway 共用的 `switch_model()` pipeline，支持 custom endpoint 和 provider-aware routing。
- 保留 `custom` provider，不再静默 remap 到 OpenRouter。
- Anthropic 输出上限改为 per-model native output limits，避免硬编码 16K 导致 direct Anthropic API 截断和 thinking budget exhaustion。
- fallback、retry、compression events 会作为格式化消息暴露给用户。

对 Agentrix 的启发：Agentrix 的模型配置必须从“一个默认模型”升级为 provider-aware runtime：模型、provider、endpoint、auth profile、runtime backend、fallback 原因、token limit、streaming capability 都应被结构化记录。

### 3.2 Agent loop、streaming、reasoning 与 session

Hermes v0.5.0 的 agent loop 改进集中在可靠性：

- GPT_TOOL_USE_GUIDANCE 防止 GPT 模型描述“将要调用工具”而不实际调用工具。
- 自动清理历史里的 stale budget warning，避免跨 turn 让模型持续回避工具。
- 始终优先 streaming，防止 subagent hung；stream failure 后有安全 non-streaming fallback。
- Subagents 有独立 iteration budgets，避免共享预算过早耗尽。
- Tool tokens 纳入 context preflight estimate。
- API timeout 默认 900s 提升到 1800s，适配 slow-thinking models。
- Reasoning 在 gateway session turns 中持久化，schema v6 加 `reasoning`、`reasoning_details`、`codex_reasoning_items`。
- Stale SSE connection detect/kill；Gemini thought signatures 在 streamed tool calls 中保留。
- Session 支持 recent sessions 搜索、`/resume`、third-party source isolation、silent SessionDB failure surfacing。
- Context compression 从死配置变为 ratio-based scaling，暴露 target ratio、protect last n、threshold，压缩后更新 context pressure/token estimate。

对 Agentrix 的启发：当前 QueryEngine 有 retry、auto-compaction、tool loop、SSE events，但 reasoning fields、fallback cause、compression lifecycle、subagent budgets、stale SSE kill、stream/non-stream fallback 还需要结构化落库和前端可见。

### 3.3 Gateway 与多平台消息

Hermes Gateway 支持 CLI 与消息平台共享能力，README 明确提到 Telegram、Discord、Slack、WhatsApp、Signal、Email。v0.5.0 还包括：

- Telegram Private Chat Topics：在单个 Telegram chat 内按项目隔离会话，并可绑定功能 skill。
- Telegram DNS-over-HTTPS fallback IP、reply threading、`Message thread not found` fallback、502 reconnect。
- Slack 工具进度发到正确 thread，Discord phantom typing indicator 修复，WhatsApp 支持 document/audio/video media download。
- Gateway core 支持 config-gated `/verbose`、background review notifications、send retry exhaustion notification、`/stop` hard-kill session lock、thread-safe SessionStore、background task references。

对 Agentrix 的启发：Agentrix 不一定要立即复制所有平台，但要先统一“长任务通知、stop/cancel、进度 thread、media attachment、source isolation”这些跨端语义，服务 web/mobile/desktop/wearable 后再扩展第三方消息平台。

### 3.4 工具系统、终端后端、MCP 与 API server

Hermes README 和 release 显示其工具体系很深：

- 40+ tools 与 toolset system。
- 六种 terminal backend：local、Docker、SSH、Daytona、Singularity、Modal；Daytona/Modal 提供 serverless persistence。
- Programmatic Tool Calling：模型可写 Python 脚本，经 RPC 调 Hermes tools，把多步工具链压缩为低上下文成本 turn。
- API server 支持 Idempotency-Key、body size limit、OpenAI error envelope、SSE disconnect 时 cancel orphaned agent 和 true interrupt。
- Terminal/file：V4A patch parser 支持 addition-only hunks，persistent shell polling exponential backoff，context reference subprocess timeout。
- Browser/Vision：vision credit errors、browser timeout config。
- MCP：runtime/config toolset resolution，tool name collision protection。
- Auto-repair：可修复带 invalid control characters 的 `jobs.json`。
- Fine-grained tool streaming for Claude/OpenRouter。

对 Agentrix 的启发：Agentrix 已有桌面本地工具、run_command、auto-repair、MVP code intelligence，但缺少统一 toolset registry、MCP collision protection、API idempotency、SSE disconnect cancellation、remote sandbox backend、PTC/RPC 脚本执行模式。

### 3.5 Skills、memory、插件和自学习闭环

Hermes README 强调“closed learning loop”：

- Agent-curated memory、periodic nudges、autonomous skill creation、skills self-improve、FTS5 session search + LLM summarization、Honcho user modeling。
- Skills Hub / agentskills.io 兼容。
- v0.5.0 增加 skills env passthrough、skills prompt cache、减少重复文件读取、Git Trees API 防止安装时丢失子目录、trust agent-created skills、OpenClaw migration v2。
- 插件 lifecycle hooks `pre_llm_call`、`post_llm_call`、`on_session_start`、`on_session_end` 在 agent loop 与 CLI/gateway 中生效。
- Memory provider plugin 支持 BuiltinMemoryProvider + 外部 provider，Honcho/Hindsight 等通过 lifecycle 与 tools 接入。

对 Agentrix 的启发：Agentrix 的记忆目前以 TypeORM AgentMemory + layered recall 为主，技能生态和插件 lifecycle 尚未形成“工作中学到流程 -> 生成/改进 skill -> 通过评估 -> 带权限上线”的闭环。

### 3.6 安全、供应链与可靠性

Hermes v0.5.0 的安全和可靠性修复很值得直接转化为 Agentrix release gate：

- `browser_navigate`、vision_tools、web_tools SSRF protection。
- 子 agent toolset 限制为 parent enabled set。
- self-update zip-slip path traversal 防护。
- shell injection 防护、dangerous command detection 前输入 normalize、tirith block 可审批。
- 移除 compromised `litellm`、固定 dependency ranges、lockfile hashes、PR supply-chain scanning、CVEs 修复。
- SQLite WAL write-lock contention、SQLite concurrency、session transcript integrity、cron crash/restart loop、cron session completion 状态修复。

对 Agentrix 的启发：Agentrix 的 production gate 要覆盖工具安全、供应链、DB 并发、cron/后台任务幂等性，不应只跑 build/test。

## 4. Agentrix 当前 Agent 架构对照

### 4.1 已有基础

Agentrix 当前不是空白，已具备以下可继续演进的底座：

- `AgentOrchestrationService`：支持 `spawn()` 与 `coordinate()`，可自动拆分任务、并发运行 worker lanes、timeout isolation、merge parallelism telemetry。当前 worker 执行仍是 deterministic delegated-subagent setup result，不是真实 LLM worker runtime。
- `AgentContextService`：支持 system / agent_profile / user_memory / plan_mode 分层上下文，session -> agent -> user 的 memory recall，缓存 breakpoint 设计。
- `AgentIntelligenceService`：支持 plan mode、active plans、subtasks、agent team、cross-device sync payload 类型；但 plan/subtask/team registry 仍主要是 in-memory。
- `QueryEngineService`：实现 Claude Code-style agentic loop，包含 message normalization、LLM retry、auto-compaction、usage/cost event、tool execution loop、permission engine、denial fallback hint。
- `ToolExecutor`：能把 read-only/concurrency-safe tools 并发执行，write/unsafe tools 串行执行，并发有 limit，支持 timeout、abort、permission check、approval_required event。
- `CodeIntelligenceService`：提供 workspace indexing、regex symbol extraction、document symbols、deterministic vector semantic search。当前是内存索引，不是真 AST/LSP/pgvector。
- `AutoRepairService`：能解析 TypeScript/Rust/ESLint/Jest diagnostics，构造 repair prompt，并通过 callback 跑 command -> generate patch -> apply patch -> retry。当前不直接运行 shell，也未持久化 repair job 和审批。
- Desktop local tools：本地 llama sidecar 支持 tool calling，已有 workspace search、code intelligence、auto repair exact text edit、parallel local tool calls、context compaction。
- 后端 `DesktopUpdateModule` 与 CI signing scaffold：已有 updater manifest endpoint 与 Windows signing secret 注入逻辑，但真实证书、签名 secret、artifact hosting 仍是上线阻塞项。

### 4.2 主要差距

对照 OpenClaw/Hermes 后，Agentrix 的差距集中在这些方面：

- Parallel Lanes 是 MVP：没有持久化 lane job、lane event、lease/heartbeat/reclaim、SSE fan-in、parent cancel 递归、真实 LLM worker runtime。
- Session/runtime 边界不够强：web/mobile/desktop/wearable 尚未共享 OpenClaw 式 Gateway event contract、idempotency、device pairing、source isolation、reset lifecycle。
- Provider/runtime 迁移不足：缺少 Hermes 式 provider-aware model switch pipeline、runtime backend alias、auth profile refresh、fallback reason event、doctor migration。
- Reasoning/streaming 未一等化：thinking/reasoning 字段、tool-call replay、SSE stale detect/kill、SSE disconnect cancellation、fallback visibility 不完整。
- Code intelligence 仍是轻量索引：没有 tree-sitter/TS compiler/LSP 符号图、references/call graph、incremental invalidation、pgvector/hybrid RRF。
- Auto repair 缺少生产安全闭环：没有 persisted attempts、diff audit、approval policy、rollback、CI doctor UI、chat path parity tests。
- Skills/plugin 不是运行时一等资产：缺少 AgentSkills-compatible resolver、per-agent allowlist、skill gating/env injection、hot reload、dangerous scanner、routing evals、Skill Workshop。
- Tool execution 安全策略不足：缺少 host/sandbox/node 路由、safe bins、allowlist、browser SSRF、MCP collision protection、toolset inheritance、subagent toolset restriction。
- 多平台消息和通知能力不完整：缺少 Telegram/Slack/Discord/Email 等 gateway adapter 级能力；对现有 mobile/desktop/wearable 也还需统一 stop/cancel/progress/notification 语义。
- 运维治理不足：敏感工具、生产部署、DB migration、财务、证书、credential access 还缺少统一 approval record 与 audit timeline。

## 5. 差距矩阵

| 能力域 | OpenClaw 4.24 | Hermes v0.5.0 | Agentrix 当前 | Agentrix 差距 | 优先级 |
|---|---|---|---|---|---|
| Gateway/control plane | 本地 Gateway 统一 sessions/channels/tools/events/nodes | CLI + messaging gateway + dashboard | 多 API/chat path + desktop/mobile/wearable sync | 缺少统一 WS/event/idempotency/device contract | P0/P1 |
| 多 Agent 隔离 | agentId 独立 workspace/auth/session/tool policy | subagents 独立 iteration budget | AgentAccount + orchestration MVP | 隔离边界与预算/权限未完全落库 | P1 |
| Parallel Lanes | sessions_spawn / subagents / process events | isolated subagents + parallel workstreams | coordinate 并发 MVP | 无持久 lane、真实 LLM worker、lease/retry/cancel | P0/P1 |
| Provider/runtime | model refs + fallback + runtime migration风险暴露 | switch_model pipeline、400+ models、HF、custom endpoint | provider 由调用路径散落配置 | 缺 runtime/backend alias、auth refresh、fallback event | P0 |
| Streaming/reasoning | issue 暴露 reasoning replay 风险 | reasoning fields 持久化、stale SSE kill | SSE/text/thinking event 基础 | reasoning 不是 transcript 一等字段，断连取消不足 | P1 |
| Tool execution | exec/process/browser/apply_patch/sandbox/node/approvals | 40+ tools、六终端后端、MCP、PTC、idempotency | backend tool registry + desktop tools | 缺 host/sandbox/node 统一策略、PTC、MCP collision | P1/P2 |
| Code intelligence | 浏览器/exec/skills 更强，代码索引非主要公开卖点 | session search/FTS5/trajectory | 内存 regex symbol + deterministic vectors | 缺 AST/LSP/call graph/pgvector/RRF | P1/P2 |
| Auto repair/doctor | doctor/status/security audit 贯穿 | doctor、dump、update、jobs repair | AutoRepairService MVP + signing/updater scaffold | 缺 persisted repair job、approval、doctor board | P0/P1 |
| Skills/plugin | AgentSkills、ClawHub、Skill Workshop、hot reload | Skills Hub、自学习、plugin lifecycle hooks | agents 配置 + marketplace 基础 | 缺 resolver/evals/safety scanner/env injection | P2 |
| 安全/供应链 | sandbox、SSRF、pairing、exec allowlist | SSRF、zip-slip、shell injection、lockfile hash、supply-chain CI | permission engine + approval event 基础 | 缺供应链 gate、toolset inheritance、safe bins | P0/P1 |
| 多端连续性 | nodes + channel routing | CLI + messaging + cron delivery | web/mobile/desktop/wearable 已铺开 | 缺统一 task event/notification/cancel 规范 | P1 |
| 运维治理 | status/doctor/audit 线索分散 | dashboard、dump、doctor | release docs + CI scaffold | 缺 approval timeline、ops board、incident replay | P2 |

## 6. 完善优化计划

### P0：上线阻塞与架构安全底线

1. 桌面签名与 updater 完成闭环。
   - 配置真实 Windows Authenticode 证书 thumbprint 和 CI secret。
   - 配置 Tauri updater artifact hosting、签名、公钥/私钥流程、manifest smoke test。
   - release tag 下强制 `REQUIRE_WINDOWS_SIGNING=true`，无签名直接失败。

2. Chat path parity 强制测试。
   - 覆盖 `/openclaw/proxy/:id/stream` 与 `/claude/chat` 的工具集合、tool result schema、stream event、permission/approval、orchestration/repair tool parity。
   - 将“新增工具必须两条 chat path 同步”变成 CI gate。

3. Provider/runtime migration 与 doctor。
   - 引入结构化 `agent_runtime`：provider、model、backend、authProfile、endpoint、fallbackPolicy、reasoningMode、streamingCapability。
   - 增加 legacy config migration 和 doctor 检查，避免 OpenClaw 4.24 `claude-cli` 类迁移事故。
   - fallback/retry/compression/model switch 必须对用户和日志暴露原因。

4. Auto repair 生产安全闭环。
   - 新增 `agent_repair_jobs`、`agent_repair_attempts`、`agent_repair_patches` 表。
   - patch apply 默认需要 approval，记录 diff、审批人、命令、diagnostics、retry 结果。
   - exact text edit / unified diff 都必须 workspace-contained，支持 rollback 或至少记录反向 patch。

### P1：可靠 Agent Runtime

1. Durable Parallel Lanes。
   - 新增 `agent_lane_jobs`、`agent_lane_events`、`agent_lane_artifacts`。
   - lane 有 lease owner、heartbeat、retry count、timeout、cancelledBy、parentJobId、role、budget、toolPolicy、transcript pointer。
   - worker 进程从 DB 领取 lane，backend restart 后可 reclaim。
   - coordinator 通过 fan-in aggregator 合并 completed/failed/timedOut/cancelled，部分失败必须出现在最终结果中。
   - 提供 `/api/agent-orchestration/jobs/:id/events` SSE，desktop/web/mobile 可订阅。

2. 真正 LLM worker runtime。
   - `executeSubAgentTask()` 从 deterministic setup result 升级为调用 QueryEngine/Runtime adapter。
   - 每个 lane 使用独立 conversation state、预算、tool allowlist、reasoning level、model override。
   - 子 agent toolset 必须是 parent enabled set 的子集，禁止递归无限 spawn。

3. Streaming/reasoning 一等化。
   - transcript schema 增加 reasoning/thinking/tool-call metadata/fallback cause。
   - SSE 增加 stale detector、client disconnect cancel、idempotent resume marker。
   - 多轮 tool-call provider replay 覆盖 DeepSeek/Gemini/Codex/Anthropic reasoning fields。

4. 统一 task event contract。
   - 定义 `task.started/progress/tool.started/tool.finished/lane.finished/approval.requested/repair.patched/task.cancelled/task.completed`。
   - web/mobile/desktop/wearable 使用同一事件结构，平台只负责展示差异。

### P2：代码智能、记忆与 Skills 生态

1. Code intelligence 从 MVP 升级。
   - TypeScript 使用 TS compiler/LSP 获取 symbols/references/call hierarchy；Rust 优先 rust-analyzer 或 tree-sitter + cargo metadata。
   - 建立 incremental index：文件 hash、mtime、language、symbol graph、chunk graph。
   - pgvector 存储 embeddings，keyword + vector + graph proximity 做 reciprocal-rank fusion。
   - 搜索结果必须给出 source span/citation，不允许只有摘要。

2. Memory graph 与 session search。
   - AgentMemory 增加 typed edges：user/entity/project/task/tool/symbol/skill/agent。
   - 增加 session transcript search：recent sessions、source isolation、summary fallback、stale overwrite protection。
   - 长任务完成后把 durable artifact、决策、失败原因写入可检索 memory。

3. AgentSkills-compatible skills。
   - 支持 `SKILL.md` frontmatter、metadata.gating、requires.bins/env/config、per-agent allowlist、workspace/project/personal/managed/bundled 优先级。
   - skill env/API key 注入只在 agent run scope 生效，结束恢复。
   - 加 dangerous-code scanner、install quarantine、hot reload、token impact 统计。
   - 建立 skill routing evals：`intent -> expectedSkill`，CI 统计 accuracy/ambiguity/unreachable。

4. Skill Workshop / 自学习闭环。
   - agent 工作中识别可复用流程，生成 pending skill proposal。
   - 默认人工 approval；通过 lint/test/eval/security scanner 后才能安装。
   - agent-created skills 标记来源、版本、适用 workspace、最后验证时间。

### P3：工具后端、安全与治理

1. Tool execution policy 统一化。
   - 增加 host/sandbox/node/cloud backend 抽象，优先支持 local + Docker + remote SSH；Modal/Daytona 作为后续云后端。
   - safe bins、allowlist、strict inline eval、env PATH/loader override 防护。
   - MCP tool name collision protection；toolset registry 支持 per-agent/per-platform allowlist。
   - Browser automation 单独隔离 profile，默认 SSRF fail-closed。

2. Programmatic Tool Calling。
   - 允许 agent 生成受限脚本，通过 RPC 调用已授权 tools，把多步数据处理压缩为一次 lane 内工具执行。
   - 脚本运行必须在 sandbox/backend 中，所有 RPC tool call 仍走 permission/audit。

3. Operations control plane。
   - 新增 task board：lane jobs、repair jobs、deploy jobs、approval requests、incidents。
   - 敏感工具统一 approval classes：生产部署、DB migration、财务、credential access、destructive filesystem、external publish。
   - 审计 timeline 记录 tool call、lane event、model fallback、repair patch、update check、signing action。

### P4：多平台体验和生态迁移

1. 多端连续性。
   - mobile/desktop/web/wearable 共享 task list、progress、cancel、follow-up。
   - Wear OS 只承载摘要、审批、短 follow-up；重工具自动升级到 desktop/cloud lane。
   - 多模态附件 metadata 统一：image/audio/video/document/source device。

2. OpenClaw/Hermes 迁移兼容。
   - 支持导入 SOUL/AGENTS/USER/MEMORY、skills、allowlist、auth profile 映射、workspace instructions。
   - 提供 dry-run、conflict strategy、secret allowlist、迁移报告。

3. 消息平台扩展。
   - 先实现 Telegram/Discord/Slack 中最小闭环：session isolation、tool progress thread、approval buttons、stop/cancel、media download。
   - 再扩展 WhatsApp/Email/Feishu/WeChat/QQ 等。

## 7. 验收标准

### P0 验收

- Windows release CI 在缺少 signing secret 时失败；配置真实 thumbprint 后能产出签名 installer。
- Tauri updater endpoint 返回真实 artifact manifest，desktop canary 能检测并应用更新。
- `/openclaw/proxy/:id/stream` 与 `/claude/chat` 工具 parity 测试覆盖 orchestration、code intelligence、auto repair、permission events。
- Auto repair 每次 patch apply 都有 persisted diff + approval record；未审批不能写文件。
- provider/runtime doctor 能检测 legacy runtime、无效 auth profile、provider endpoint 缺失、fallback loop。

### P1 验收

- 5-lane 任务执行中重启 backend，worker 能 reclaim 未完成 lane，最终结果包含已完成/失败/超时 lane。
- parent cancel 能递归取消子 lane、正在运行命令、SSE stream，并通知所有订阅端。
- 子 agent 使用真实 LLM runtime，独立 budget/maxTurns/tool allowlist 生效。
- SSE disconnect 会取消 orphaned agent 或转入明确 background policy。
- reasoning replay 测试覆盖至少一个需要 reasoning content 的 provider 与 3+ tool-call turn。

### P2 验收

- Code index 支持 TypeScript references/callers/callees，Rust 至少支持 symbols + references MVP。
- Retrieval benchmark 对固定 Agentrix QA 集输出 precision@5/recall@5。
- 新 skill 通过 scaffold -> lint -> security scan -> routing eval -> install 全流程。
- Agent-created skill 默认 pending approval，unsafe proposal 被 quarantine。

### P3/P4 验收

- Docker/SSH backend 命令执行通过 permission/audit，PATH/LD/DYLD override 被拒绝。
- MCP 同名工具 collision 被阻止并出现在 doctor 报告。
- Operations board 能回放一个失败任务的模型调用、工具调用、lane、repair、approval 全链路。
- mobile 发起的长任务可在 desktop 查看进度并取消，Wear OS 可收到完成摘要并发起 follow-up。

## 8. 当前实际进展、验收状态、注意事项与跟进项

本节记录 2026-04-27 已完成的对标落地情况。它不是路线图愿望清单，而是当前代码、部署与验证状态的交付快照。

### 8.1 已落地能力

| 对标能力 | 当前落地 | 完成状态 | 验收证据 | 注意事项与跟进 |
|---|---|---|---|---|
| Operations control plane | 新增 `operations-control-plane` 后端模块，聚合 lane jobs、repair jobs、desktop sync、approvals、tool policy、continuity、wearable summary；Web `/operations`、desktop workbench、mobile Desktop Control 已接入 | 已完成 P3/P4 MVP | 后端 spec 通过；前端 `/operations` 本地与服务器构建通过；`https://agentrix.top/operations` 返回 200 | 还需要把 `/operations` 从只读控制台升级为可审批、可取消、可回放的运维 board |
| Durable Parallel Lanes | 新增 `agent_lane_jobs`、`agent_lane_events`、`agent_lane_artifacts` 实体与 migration；orchestration 开始写入 durable job/event/artifact | P1 基础完成，真实 worker 仍待做 | `agent-orchestration.service.spec.ts` 纳入回归；生产 migration 已执行 | 下一步补 worker reclaim、SSE fan-in、parent cancel、真实 LLM lane runtime |
| Auto repair persistence | 新增 `agent_repair_jobs`、`agent_repair_attempts`、`agent_repair_patches`，repair 默认 approvalRequired，并记录 patch/audit 数据 | P0/P1 基础完成 | `auto-repair.service.spec.ts` 纳入回归；生产表已建 | 还需前端审批 UI、rollback 入口、CI doctor 展示、真实 patch apply policy 分级 |
| Runtime doctor | 新增 `runtime-doctor` 模块，检查 runtime/provider、chat path parity、tool policy 等风险 | P0 MVP 完成 | `runtime-doctor.service.spec.ts` 通过 | 还需接入 CI gate、前端 doctor 页面、legacy config migration 自动建议 |
| Tool control plane | 新增 `tool-control-plane`，实现 tool policy、risk band、MCP collision、Programmatic Tool Calling dry-run/guardrail 基础 | P1/P3 MVP 完成 | 后端 build 与 spec 通过；工具通过 OpenClaw proxy 暴露 | Programmatic Tool Calling 目前应默认 dry-run/低风险；L2/L3 和外部发布必须 human approval |
| Chat path parity | 新增 `chat-path-parity.contract.ts`，把 `/openclaw/proxy/:id/stream` 与 `/claude/chat` 的工具与事件对齐检查结构化 | P0 基础完成 | runtime doctor 测试覆盖 parity pass | 还未成为强 CI gate；新增工具仍需工程规范强约束 |
| Code intelligence MVP+ | code intelligence 增加更丰富的 symbol/search/reference/call graph 接口，并接入 OpenClaw proxy 工具 | P1/P2 MVP 完成 | `code-intelligence.service.spec.ts` 通过 | 仍不是完整 LSP/pgvector/RRF；下一步要做增量索引和真实 references benchmark |
| AgentSkills resolver | agent-runtime skills 增加 `SKILL.md` frontmatter parser、resolver、danger scanner、routing eval 基础 | P2 基础完成 | `skills.service.spec.ts` 通过 | 还未接入 marketplace install、hot reload、quarantine、Workshop approval |
| Memory graph/session search | 新增 `agent_memory_edges`，memory service 支持 session summary freshness 与 graph edge 查询 | P2 基础完成 | `memory.service.spec.ts` 通过；生产表已建 | 还需 transcript search、source isolation、长期 artifact 写入策略 |
| 多端连续性 | desktop、mobile、wearable summary、web operations 已能共享 operations continuity | P4 MVP 完成 | desktop build、Tauri build、root typecheck、frontend build 通过 | Wear OS 仍只适合摘要/审批/短 follow-up；重工具应自动升级到 desktop/cloud lane |
| 自进化方案 | 文档新增 Agent 框架、Agent 团队、Agentrix 产品三条自我进化闭环 | 方案完成 | 本文第 10 章 | 下一步要从文档变成 Self-Evolution Control Plane 数据表、API 与每日经营日报 |

### 8.2 已完成验收

- 本地后端回归：7 个 spec suite、22 个测试通过，覆盖 operations、runtime doctor、orchestration、auto repair、code intelligence、memory、skills。
- 本地后端构建：`npm run build:tsc` 通过。
- 本地根 typecheck：`npm run typecheck:root` 通过。
- 本地 web 前端：`npx tsc --noEmit --pretty false` 与 `npm run build` 通过。
- 本地 desktop 前端：`npm run build` 通过。
- 本地 Tauri desktop：`npm run tauri build` 通过，产出 `agentrix-desktop.exe`、MSI、NSIS setup。
- 生产服务器：已部署提交 `ec3a5f40` 到 `build142-phase0-hardening`，后端 build 成功，DB 备份成功，migration `CreateAgentRuntimeOperationsTables1782200000000` 已执行，PM2 后端/前端/openclaw-gateway 均 online。
- 生产外部 smoke：`https://api.agentrix.top/api/health` 返回 200，`https://agentrix.top/operations` 返回 200。
- 生产内部 smoke：`http://127.0.0.1:3000/api/health` 返回 200，`http://127.0.0.1:3001/operations` 返回 200；`http://127.0.0.1:3000/operations` 返回 404 是预期的，因为 3000 是 API 服务，不承载 web route。

### 8.3 当前注意事项

- 生产部署脚本最后一次 smoke 循环因为 PowerShell/Bash 引号拼接问题报 `unexpected end of file`，但核心部署、build、migration、PM2 restart 均已完成，并已用独立命令补验健康检查。
- 服务器和本地工作树都有历史生成物与缓存噪音，例如 `tsbuildinfo`、Android/Gradle/Kotlin session、测试报告、logs、runs/jobs JSON；不要在未筛选情况下 `git add -A`。
- 生产前端 `npm install` 曾触发 Next 自动安装 `typescript`/`@types/react` 并改变服务器本地 frontend package 文件；这属于服务器 node_modules/lockfile 漂移风险，后续部署应使用 `npm ci` 或固定 `--legacy-peer-deps` 的干净 install 策略。
- 服务器 PM2 后端历史 restart count 很高，需要单独调查长期重启原因；本次部署后状态 online，但不能把历史重启数视为本次回归。
- GitHub CLI 在当前 Windows/WSL 环境不可用，移动端 workflow 状态不能直接通过 `gh run list` 验证；需要通过 public repo branch、GitHub API 或服务器侧 public build script 兜底确认。
- OpenClaw proxy 文件存在较大换行 diff 历史，后续提交要继续用 Windows Git 统一处理，避免 WSL/CRLF 造成重复 churn。

### 8.4 必须跟进的工程项

2026-04-27 本轮已把 8.4 从“待办提醒”升级成工程执行面板。能低风险落地的项已接入仓库；需要较大产品/后端改造的项已拆成明确 PR 切片，不能用文档状态掩盖真实工程量。

| 工程项 | 本轮完成状态 | 已落地资产 | 下一步 PR 切片 | 验收口径 |
|---|---|---|---|---|
| Runtime doctor CI gate | 已接入 release gate | `backend/package.json` 增加 `test:runtime-doctor`；`one-click-release.yml` 增加 Runtime doctor release gate，覆盖 chat path parity、provider/runtime policy、desktop signing/updater、tool control plane readiness | 后续新增 PR/build branch workflow 时复用同一脚本；前端 doctor 页面读取 `/runtime-doctor` | release workflow 中 `npm run test:runtime-doctor` 必须通过 |
| Operations board 可操作化 | 后端基础已完成，UI 操作仍待独立 PR | `operations-control-plane` 已聚合 approvals、repair、lane、tool policy、continuity；`/operations` 生产可访问 | PR-1 approval decision/cancel job；PR-2 repair diff/retry/rollback；PR-3 lane event/model fallback/tool audit timeline | 每个敏感动作有 risk band、审批状态、audit trail，且失败任务可回放 |
| 真实 LLM lane runtime | durable lane 基础已完成，真实 worker 待独立 PR | `coordinateDurable` 与 lane job/event/artifact 表已存在 | PR-1 QueryEngine/Runtime adapter 接入；PR-2 lane budget/model/tool allowlist/reasoning level；PR-3 SSE fan-in、parent cancel、worker reclaim | 一个多 lane 任务能独立选模型、记录成本、取消父任务并保留 artifacts |
| Production-grade auto repair | persistence 已完成，执行治理待独立 PR | repair job/attempt/patch 表、approvalRequired 默认策略已落地 | PR-1 patch approval UI；PR-2 workspace containment 与 reverse diff；PR-3 CI command result、attempt replay、rollback | repair patch 不经审批不能写入高风险路径；每次 attempt 有命令结果和回滚材料 |
| 移动构建可观测性 | 已补工具化查询与同步触发保护 | `scripts/public-build/check_public_build_status.ps1` 可用服务器 token 查询 public run、jobs、artifacts、APK 下载头；`push_public_build_via_server.ps1` 默认切到可用服务器并同步 watch workflow；`sync-mobile-build-repo.yml` 监听 `.maestro`、plugins、scripts/build | 可选后续 PR：把查询结果写入 release summary 或 operations board | 每次 public build 能输出 branch、run id、job status、artifact、APK URL、Last-Modified |

第 8.4 的优先级：先保证 release gate 和 public build 可观测，再做 Operations board 写操作；真实 lane runtime 与 auto repair production 化作为 P1/P2 成组推进，避免把风险动作直接交给 7x24 自运营 agent。

## 9. 具体执行顺序、产品界面与商业化落地

下面的顺序把“做什么”拆成产品前端、后端、桌面/移动、增长运营和营收闭环，避免只停留在架构层。

### 9.1 第 0 阶段：发布卫生与可售卖入口，1-3 天

目标：把已完成的 operations/runtime hardening 变成可演示、可销售、可追踪的产品入口。

前端产品界面：

1. `/operations` 增加真实运营首页布局。
   - 顶部 KPI：active tasks、failed tasks、pending approvals、repair jobs、tool risk、device continuity、今日 token/cost。
   - 中部 task board：lane jobs、repair jobs、approval requests、incidents 四列。
   - 右侧 timeline：tool call、lane event、repair patch、model fallback、deploy/update check。
   - 每个敏感动作按钮必须显示风险等级与审批状态。

2. 新增 `/pricing` 或重构现有定价页。
   - Free、Pro、Team、Merchant、Developer 五个套餐。
   - 明确免费额度、付费权益、超额计费、agent/team/marketplace 抽成。
   - CTA 分流：个人用户进入 agent onboarding，商户进入 merchant onboarding，开发者进入 developer console。

3. 首页和 onboarding 改成商业转化优先。
   - 首屏直接表达：个人跨端 agent、agent economy、可交易技能/服务。
   - 3 个高转化 demo：个人 agent 自动执行任务、商户上架 agent 服务、开发者发布 skill/API 并赚钱。
   - 增加 feedback widget、waitlist/邮件订阅、referral code。

后端：

1. 增加 billing entitlement 基础表。
   - `plans`、`subscriptions`、`usage_records`、`entitlements`、`invoices`。
   - 所有高成本 agent run、tool call、cloud lane、Bedrock 调用写 usage。

2. 增加 product analytics 事件。
   - `user_registered`、`agent_created`、`task_started`、`task_completed`、`approval_clicked`、`checkout_started`、`subscription_created`、`merchant_onboarded`。

3. 修复部署脚本。
   - 把当前手工部署流程固化为脚本，修复 PowerShell/Bash 引号问题。
   - 部署后自动输出 HEAD、migration status、PM2 status、API health、web route、public build branch。

桌面/移动：

1. Desktop workbench 增加 Operations tab。
   - 当前任务、审批、repair patch、follow-up 输入框。
   - 本地重工具提示升级到 desktop lane，移动端只发起和审批。

2. Mobile Desktop Control 增加付费/额度提示。
   - 免费额度剩余、任务成本预估、需要桌面在线/云 lane 的提示。

营收验收：

- 任何新用户能在 3 步内创建 agent 并完成首个任务。
- 任何高成本功能都有 usage record。
- 定价页能解释清楚为什么升级 Pro/Team/Merchant/Developer。

### 9.2 第 1 阶段：可收费服务与商业模式，3-14 天

目标：先卖最容易理解、最容易交付、最能证明价值的服务。

收费服务设计：

| 服务 | 目标用户 | 收费方式 | 免费层 | 付费理由 |
|---|---|---|---|---|
| Agentrix Pro | 个人专业用户、创作者、开发者 | 月订阅，建议 $9-$19 起 | 每日少量任务、基础 chat、有限 memory | 跨端连续性、长期记忆、桌面工具、更多 agent run、更高模型额度 |
| Agentrix Team | 小团队、创业项目 | 每席/月 + usage | 1-2 个成员试用 | 团队 agent、共享 workspace、审批、审计、任务板 |
| Merchant Agent Store | 商户、服务提供者 | 月费 + 交易佣金 | 免费上架少量服务 | 商户自动接单、客服、履约、支付、数据分析 |
| Developer Skill/API Marketplace | 开发者 | 平台抽成 + 托管/调用 usage | 免费发布、低调用额度 | 分发、计费、托管、用户获取、API key 管理 |
| Hosted Agent Runtime | 专业用户/开发者 | usage-based，按任务/模型/token/tool execution | 小额度试用 | 无需自建 infra，直接托管 agent/skill/MCP |
| Concierge Setup | 商户/企业早期客户 | 一次性 setup fee + 月费 | 免费诊断 | 帮客户把业务流程接入 agent，最快产生收入 |

前端产品改动：

1. `/pricing` 接入 Stripe/checkout 或当前支付模块。
2. `/account/billing` 显示 plan、usage、invoice、upgrade CTA。
3. `/marketplace` 增加“可赚钱”的开发者/商户入口。
4. `/merchants/dashboard` 增加 agent 服务上架、订单、收入、佣金、客户消息。
5. `/developers/console` 增加 skill/API 发布、调用数据、收益、文档生成。

后端改动：

1. Stripe subscription / checkout / webhook 闭环。
2. Usage metering：agent run、tool call、cloud lane、Bedrock token、storage、marketplace transaction。
3. Entitlement guard：限制免费层任务数、模型额度、memory size、cloud lane、商户上架数、API 调用数。
4. Commission settlement：marketplace 技能/API/服务交易自动记录平台抽成。
5. Revenue dashboard API：MRR、ARR、GMV、commission、conversion、churn、ARPU。

增长动作：

1. 发布“Agentrix Pro private beta”：用 waitlist + invite code 收集早期付费意向。
2. 招募 10 个商户/开发者做 concierge setup，优先收 setup fee 或成功佣金。
3. 每周发布 2 个真实 demo：agent 如何帮个人省时间、如何帮商户接单、如何让开发者通过 skill 赚钱。

营收验收：

- 至少 1 个真实付费入口可用。
- 至少 3 个可售套餐在前端清晰展示。
- 至少 10 个高意向 lead 进入 CRM/lead table。
- 第一个商户或开发者可完成上架/交易/佣金记录 MVP。

### 9.3 第 2 阶段：增长飞轮与用户获取，14-30 天

目标：用免费资源和 agent 团队持续扩大高质量线索，而不是无成本目标地消耗模型额度。

产品前端：

1. 新增 `/templates`。
   - 个人：研究助手、代码助手、社群运营、邮件助手、桌面执行助手。
   - 商户：客服 agent、订单 follow-up、营销素材、FAQ bot。
   - 开发者：API wrapper skill、MCP server template、agent service template。

2. 新增 referral 与 invite。
   - 用户邀请好友获得 usage credits。
   - 开发者邀请商户/用户获得佣金折扣或 marketplace boost。

3. 新增 public demo/share 页面。
   - 用户可分享 agent 完成任务的 sanitized result，带 referral CTA。

后端：

1. `growth_leads` 与 `campaigns` 表。
   - 来源：Twitter/X、GitHub、Telegram、Discord、邮件、Product Hunt、Hacker News、Reddit、LinkedIn、开发者社区。
   - 字段：persona、pain point、expected value、status、next action、owner agent、human approval。

2. `feedback_items` 与 `product_opportunities`。
   - 用户反馈、客服、社群问题、GitHub issue 自动聚类。
   - 生成 RICE/ICE score 与实验建议。

3. 邮件与社群 automation guardrail。
   - 草稿自动生成，群发和对外承诺必须人工审核。

运营：

1. Twitter/X：每天 3 个草稿、10 个高质量回复建议、5 个大 V 互动机会。
2. GitHub：每天 issue triage、docs improvement、开源示例项目维护。
3. Telegram/Discord：欢迎流、FAQ、问题升级、每周 demo 活动。
4. 邮件：分群 onboarding、激活、开发者召回、商户转化序列。
5. 免费资源申请：每周至少 10 个资源/Grant/accelerator/API trial 申请或跟进。

增长验收：

- 每周新增 Twitter/X 高质量互动、大 V 回复或关注。
- Telegram/Discord 每周活跃人数增长。
- GitHub stars/issues/PR 有增长。
- 邮件列表和 waitlist 每周增长。
- 每周至少 3 个实验有明确数据结论。

### 9.4 第 3 阶段：Self-Evolution Control Plane，30-60 天

目标：让 agent 团队真的 7x24 自运营，而不是靠手工 prompt。

前端：

1. `/operations/evolution`。
   - 经营日报、增长指标、营收、成本、资源额度、实验、agent 效率。
   - approval queue：部署、DB migration、群发邮件、外部发布、财务、合作。

2. `/operations/experiments`。
   - 实验假设、目标指标、变体、状态、结果、学习结论、下一步。

3. `/operations/resources`。
   - 免费额度、API trial、grant、过期时间、使用计划、ROI。

后端：

1. `signals`、`metrics_snapshots`、`experiments`、`agent_runs`、`resource_ledger`、`approval_queue`、`learning_backlog`。
2. 每小时 cron：拉取指标、社交、GitHub、社群、支付、反馈。
3. 每日 cron：生成经营日报、优先级任务、风险和机会。
4. 每周 cron：生成 agent 绩效复盘、prompt/skill/tool 改进建议。

Agent 团队：

1. CEO agent 负责取舍和冲突解决，不直接吞掉执行任务。
2. Growth/Media/Community 负责增长实验和内容，但外部发布进 approval。
3. Hunter/Ops/Treasury 负责免费资源和成本，付费资源必须 human 批准。
4. Dev/QA/Ops 负责 PR、测试、部署建议，生产 deploy 和 DB migration 必须 human 批准。

验收：

- 每日自动经营日报可用。
- 每周至少 3 个增长/产品实验进入执行或审核。
- Agent run 成功率、成本、人工驳回率可见。
- 免费资源 ledger 覆盖当前 Copilot Pro+、AWS Bedrock 额度和申请队列。

### 9.5 第 4 阶段：生产级 Agent Economy，60-90 天

目标：让 Agentrix 从工具变成可交易、可分发、可盈利的平台。

产品前端：

1. Marketplace 首页改成交易导向。
   - Featured agents、skills、merchant services、developer APIs。
   - 评价、成交量、响应时间、价格、试用 CTA。

2. Agent profile 页面。
   - 能力、价格、数据权限、工具权限、服务 SLA、审计摘要。

3. Merchant service listing。
   - 商户可上架“agent 服务包”：客服、内容、数据分析、自动化流程、行业模板。

4. Developer payout 页面。
   - 调用量、收入、平台抽成、结算状态、税务/身份资料。

后端：

1. Marketplace order、escrow、refund、commission、settlement 完整闭环。
2. Skill/API/agent service usage metering 与 payout。
3. Trust & safety：内容审核、工具风险、SSRF、credential access、用户投诉、封禁。
4. Partner/affiliate tracking：邀请、渠道、佣金、coupon。

营收路径：

1. 订阅收入：Pro、Team、Merchant、Developer。
2. Usage 收入：hosted agent runtime、cloud lane、tool execution、模型 token markup、storage。
3. 抽成收入：marketplace skill/API/service 交易佣金。
4. 服务收入：商户/企业 concierge setup、定制 agent workflow、培训和 support。
5. 增值收入：featured listing、priority support、advanced analytics、compliance/audit export。

验收：

- 至少一个 marketplace 交易闭环能记录订单、支付、佣金、履约状态。
- 至少一个开发者或商户能看到收益数据。
- 至少一个 agent service 能从 discovery 到 checkout 到 fulfillment。
- 每月能输出营收漏斗和增长归因报告。

本计划的核心判断：Agentrix 已经有 agent runtime 的雏形，下一阶段不能再只加工具清单，而要把任务、runtime、模型、工具、权限、session、skills、审计全部结构化、持久化、可恢复。OpenClaw 4.24 的回归提醒我们，越接近真实 Gateway，升级迁移和平台边界越重要；Hermes v0.5.0 的 hardening release 则说明，生产级 agent 的竞争力来自可靠 loop、可观测 fallback、强工具安全和自学习 skills 闭环。

## 10. Agentrix 自我迭代、自我进化与 7x24 自运营方案

Agentrix 的下一阶段目标不是“让 agent 偶尔自动化一些任务”，而是建设一个可持续学习、可审计、可控成本、以营收和增长为核心指标的运营系统。系统分三条互相反馈的自进化线：

- Agent 框架自进化：让 runtime 更智能、体验更好、单位任务成本更低。
- Agent 团队自进化：让 11-agent 团队从固定角色升级为可度量、可复盘、可改组的 7x24 自运营组织。
- Agentrix 产品自进化：持续吸收竞品、市场调研、用户反馈、增长数据和营收数据，自动形成实验、PRD、任务和发布建议。

### 10.1 总体原则

1. 营收优先，增长驱动。
   - 北极星指标分两层：第一层是净营收、毛利、付费转化、留存、ARPU、商户 GMV 或 agent economy 交易额；第二层是用户数、商户数、开发者数、专业用户数、活跃 agent 数、Twitter/X 关注与大 V 互动、Telegram/Discord 人数与活跃度、GitHub stars/forks/issues/PR、邮件订阅与打开率。
   - 所有 agent 任务都必须绑定至少一个指标或一个明确的学习目标，避免无目的 7x24 消耗资源。

2. Human-in-the-loop 只卡高风险环节。
   - 绿色自动执行：资料收集、竞品监控、数据分析、草稿生成、测试、报告、低风险 issue triage、公开资料整理。
   - 黄色可延迟审核：增长实验、内容发布排期、轻量合作触达、feature branch push、低预算付费 API 使用。
   - 红色必须人工批准：生产部署、DB migration、主分支/build 分支 push、大额成本、财务操作、credential access、外部代表性承诺、群发邮件、对外商务合作。

3. 资源利用最大化。
   - 当前可用资源 Copilot Pro+ 与 AWS Bedrock API 额度优先用于高杠杆任务：代码生成/审查、eval、调研摘要、低成本 agent worker、增长素材生成、用户反馈聚类。
   - Resource Hunter agent 持续申请免费资源：AWS Activate、Google Cloud/Azure 创业额度、Vercel/Cloudflare/Supabase/Neon/Railway/Fly/Modal/Hugging Face/Together/Groq/OpenRouter/Browserbase 等免费额度、开源赞助、hackathon、grant、accelerator、API trial。
   - 所有免费额度进入 resource ledger，记录额度、过期日、用途、消耗、ROI、负责人和替代方案。

4. 自主性必须可观测、可回滚。
   - 每个 agent run 记录目标、输入、工具、模型、成本、耗时、产出、失败原因、审批、后续影响。
   - 任何自动写代码、发内容、改配置、动生产的动作都必须有 diff/audit timeline。

### 10.2 Agent 框架自进化闭环

Agent 框架需要从“能完成任务”升级为“持续降低失败率、延迟和成本”。建议新增 Agent Runtime Eval Loop：

1. 任务轨迹采集。
   - 对每次 chat、lane、tool call、repair、deploy、growth run 记录 trajectory：意图、planner 输出、工具调用、模型 fallback、token、费用、延迟、人工介入、成功/失败标签。
   - 失败类型结构化：理解失败、工具失败、权限失败、上下文不足、模型能力不足、成本超限、用户体验差、外部平台限制。

2. 自动评测与回归集。
   - 从真实任务中抽样生成 eval case：代码修改、bug 修复、竞品调研、增长文案、用户反馈归因、客服回复、商户 onboarding。
   - 每周自动跑模型/提示词/工具路由对比：Copilot Pro+、Bedrock Claude/Nova/Llama、低成本开源路由、本地模型；输出质量、耗时、成本、稳定性。

3. 成本路由与体验优化。
   - 简单分类、摘要、去重、监控任务走低成本模型或本地模型；高风险架构/代码/商业判断走强模型。
   - 引入缓存、batch、上下文压缩、tool result summarization、skill prompt cache，避免重复读文件和重复调研。
   - 任务开始前预估成本，超过预算进入 approval 或降级策略。

4. 工具和 skill 自我修复。
   - 常见失败自动生成 tool improvement proposal 或 skill proposal。
   - 新 skill 必须通过 lint、安全扫描、routing eval、小样本真实任务 replay 后才能进入 agent allowlist。

### 10.3 Agent 团队 7x24 自运营机制

当前 11-agent 团队可作为初始角色，但不应固定不变。更推荐按经营目标组成动态 pod：

本节必须和第 9 章一起开发：第 9 章定义可销售入口、增长漏斗、付费服务和商业化 KPI，第 10 章定义让 agent 团队持续执行、复盘、学习和升级的组织系统。当前优先级不是先让 dev agent 自主改生产代码，而是先让非开发 agent 以只读采集、草稿、报告、线索和审批队列形式跑起来。启动资产见 `docs/operations/AGENT_TEAM_7X24_SELF_OPERATION_20260427.md`。

| Pod | 参与 agent | 核心目标 | 自动产出 | 人工审核点 |
|---|---|---|---|---|
| Revenue Pod | growth、treasury、ops、ceo | 付费转化、毛利、定价、商户收入 | 定价实验、漏斗报告、收入机会清单 | 价格变更、财务、合作条款 |
| Product Intelligence Pod | ceo、growth、community、dev | 竞品、用户反馈、路线图 | 竞品雷达、PRD、RICE 排序 | Roadmap 大调整 |
| Engineering Runtime Pod | dev、qa-ops、ecosystem | 架构、自修复、CI/CD、工具安全 | PR、测试、doctor、eval 报告 | deploy、migration、权限扩大 |
| Growth Media Pod | media、growth、brand、community | 内容、社群、邮件、SEO、KOL | 内容日历、草稿、互动清单 | 对外发布、群发邮件 |
| Resource Pod | hunter、ops、treasury | 免费额度、grant、API、云资源 | 申请清单、ROI 台账、到期提醒 | 需要法人/付款/承诺的申请 |

7x24 运行节奏：

1. 每小时：采集指标和信号。
   - 拉取产品 analytics、支付/订阅、GitHub、X/Twitter、Telegram、Discord、邮件、客服、竞品 RSS/网页、应用商店评论。
   - 只读任务默认自动执行，异常信号进入 incident 或 opportunity queue。

2. 每日：自动生成经营日报和任务队列。
   - 包含营收、增长、成本、活跃度、渠道表现、用户反馈主题、竞品变化、昨日实验结果、今日优先任务。
   - CEO agent 只做排序和取舍，不直接吞掉所有执行。

3. 每周：自我复盘和组织调整。
   - 评估每个 agent 的成功率、成本、响应时间、被人工驳回率、直接带来的增长/营收影响。
   - 低表现 agent 进入 prompt/skill/tool 调整；角色不适配可以合并、拆分或重建。

4. 每月：战略更新。
   - 输出市场地图、竞品矩阵、用户画像变化、收入模型变化、资源申请结果和下一月 OKR。

### 10.4 Agentrix 产品自进化闭环

产品自进化要把“外部市场”和“内部行为数据”转成可执行实验。

1. Signal ingestion。
   - 竞品：personal agent、agent economy、agent marketplace、AI browser、coding agent、workflow automation、local-first agent。
   - 用户：注册漏斗、激活路径、agent 创建、任务完成、付费转化、退款/流失、客服、社群问答、GitHub issues。
   - 商户/开发者：上架流程、SDK 文档阅读、API 调用、交易额、佣金、失败订单、集成阻塞。

2. Product decision engine。
   - 每个机会打分：Revenue impact、Growth impact、Confidence、Effort、Risk、Time-to-learn。
   - 自动生成 experiment brief：假设、目标指标、受众、最小实现、上线范围、回滚方式、成功阈值。

3. Build-measure-learn。
   - 小实验优先：landing copy、onboarding、agent template、定价页、商户 CTA、开发者 docs、社群活动、邮件序列。
   - 大功能必须先用假门/手动服务/小范围 beta 验证需求，再进入工程排期。

4. 产品方向持续校准。
   - Personal agent：强调跨端连续性、本地工具、个人记忆、低成本长期陪伴和执行。
   - Agent economy：强调 agent 身份、技能市场、任务交易、商户工具、开发者收益、平台抽成。
   - Professional users：强调可靠性、审计、权限、团队协作、企业/商户 ROI。

### 10.5 增长与营收自动化

增长系统不只追粉丝，而是追“可变现的注意力”。

| 指标层 | 核心指标 | Agent 自动动作 |
|---|---|---|
| 营收 | MRR、ARR、毛利、付费转化、ARPU、退款率、佣金收入 | 漏斗归因、定价实验建议、商户跟进清单、付费功能包装 |
| 用户 | 注册、激活、D1/D7/D30、任务完成率、agent 创建率 | onboarding 实验、用户访谈名单、流失原因聚类 |
| 商户 | 商户数、上架数、GMV、订单成功率、API 错误率 | 商户邮件、集成诊断、案例包装 |
| 开发者 | GitHub stars/forks/issues、SDK 安装、文档转化 | issue triage、docs PR、示例项目、hackathon 触达 |
| 社交 | X/Twitter 粉丝、大 V 关注/回复、互动率、点击率 | 内容日历、评论机会、话题监控、草稿生成 |
| 社群 | Telegram/Discord 人数、日活、发言人数、问题解决率 | FAQ 更新、活动策划、欢迎流、沉默用户召回 |
| 邮件 | 订阅、打开率、点击率、回复率、退订率 | 分群、序列草稿、A/B subject、线索打分 |

增长 playbook：

1. 内容：每天生成 3 类草稿：产品进展、技术深度、agent economy 观点；人工选择后发布。
2. 大 V：监控 agent economy/personal agent/AI automation 话题，生成高质量回复建议，避免机械刷屏。
3. 社群：Telegram/Discord 自动欢迎、FAQ、问题归类、bug 升级，重要用户由 community agent 标记给 human。
4. 邮件：按用户行为分群，生成 onboarding、激活、商户转化、开发者召回序列；群发必须人工批准。
5. 商业化：每周输出 10 个潜在商户/合作方/开发者线索，附痛点、切入语、预计价值、触达渠道。

### 10.6 免费资源与成本治理

资源策略的目标是让 agent 团队尽可能 7x24 工作，但不会失控烧钱。

1. Resource ledger。
   - 字段：provider、额度、现金价值、过期日、限制、申请状态、owner agent、使用策略、消耗速度、产出 ROI。
   - 每天检查即将过期额度，把可用额度优先分配给 eval、竞品抓取、增长实验、低风险批处理。

2. Provider 路由。
   - Copilot Pro+：代码生成、review、docs、复杂 reasoning 协作。
   - AWS Bedrock：生产候选模型评测、长上下文调研、低成本后台 agent worker、内容批处理。
   - 免费/低价 API：摘要、分类、embedding、社交监控、邮件草稿、简单客服。
   - 本地模型：隐私敏感、低优先级、可延迟任务。

3. 成本红线。
   - 每个 agent、pod、实验、provider 有日预算和月预算。
   - 超预算任务自动降级、排队或进入审批。
   - 财务和付费资源开通属于红色审批，必须 human 批准。

### 10.7 需要落地的控制平面

建议新增 Self-Evolution Control Plane，和 Operations Control Plane 打通：

| 模块 | 作用 |
|---|---|
| `signals` | 存竞品、用户反馈、社交、社群、GitHub、支付、产品行为事件 |
| `metrics_snapshots` | 存每日/每小时指标快照和目标差距 |
| `experiments` | 存增长/产品/定价实验、假设、指标、状态、结果 |
| `agent_runs` | 存 agent 任务轨迹、模型、工具、成本、质量评分 |
| `resource_ledger` | 存免费额度、API key 使用范围、预算、过期、ROI |
| `approval_queue` | 存 human 审批项，与 deploy、发布、财务、外联打通 |
| `learning_backlog` | 存待改进 prompt、skill、tool、产品机会、竞品风险 |

核心 API：

- `GET /ops/evolution/overview`：经营、增长、成本、实验、agent 效率总览。
- `POST /ops/evolution/signals/ingest`：导入竞品、反馈、社交、社群、GitHub、支付信号。
- `POST /ops/evolution/experiments`：创建实验，绑定指标和预算。
- `POST /ops/evolution/agent-runs/:id/grade`：人工或自动评价 agent run。
- `POST /ops/evolution/approvals/:id/decision`：审批发布、部署、群发、费用、合作。

### 10.8 近期落地顺序

1. 7 天内。
   - 建立经营指标日报：营收、用户、商户、开发者、社交、社群、GitHub、成本。
   - 建立 resource ledger，录入 Copilot Pro+、AWS Bedrock 额度和待申请免费资源。
   - 建立 approval queue，把 deploy、DB migration、外部发布、群发邮件、财务动作纳入统一审核。
   - 已启动非开发 agent 自运营 runbook：ops、growth、hunter 已产出首轮任务清单；media、community、brand、ecosystem、treasury 按同一 runbook 执行低风险采集与草稿。
   - release/移动构建可观测性先用 `scripts/public-build/check_public_build_status.ps1` 补齐，后续再接入 Operations board。

2. 30 天内。
   - 上线 signal ingestion MVP：GitHub、X/Twitter 手动/半自动采集、Telegram/Discord 摘要、用户反馈表、支付/订阅导入。
   - 建立 agent run eval：任务成功率、成本、人工驳回率、指标贡献。
   - 开始每周增长实验：onboarding、定价、内容、商户触达、开发者 docs。

3. 60 天内。
   - 上线 Product Intelligence Pod 自动竞品雷达和 PRD 草案。
   - 上线 Engineering Runtime Pod 的 prompt/skill/tool 自修复建议。
   - Resource Pod 每周提交免费额度/Grant/Accelerator 申请报告。

4. 90 天内。
   - 形成闭环：signal -> experiment -> implementation -> metric -> learning -> skill/tool/product update。
   - Agent 团队能 7x24 运行低风险任务，高风险事项进入 human 审批队列。
   - 每个 agent 的存在都能用增长、营收、节省成本或产品学习速度证明价值。

### 10.9 验收标准

- 每日自动生成经营日报，包含营收、增长、成本、资源、实验和风险。
- 每周至少 3 个增长/产品实验进入执行或人工审核。
- 每月输出竞品矩阵、用户反馈主题、路线图调整建议和资源申请报告。
- 80% 以上低风险运营任务自动完成，高风险任务 100% 留痕并进入审批。
- Agent run 有成本、质量、成功率统计；连续低表现 agent 会被自动提出 prompt/skill/role 调整方案。
- 免费资源 ledger 覆盖所有可用额度，过期前有使用计划，月度模型/API 花费不超过预算红线。