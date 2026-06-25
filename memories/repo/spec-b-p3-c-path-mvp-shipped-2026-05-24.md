# Spec B — P3 C_Path MVP Shipped (2026-05-24)

## TL;DR

C_Path 主形态从规划落到代码:**VS Code / Cursor / Windsurf 扩展 v0.1
脚手架** + **IdeBridge 双向协议层(`shared/types/ide-bridge.ts`)** +
**桌面端反向 RPC dispatcher 升级**。

Branch: `perf/desktop-pre-launch-p1`
Predecessor: `b695525c0`(Spec A — Self-Evolution Dashboard)

## 落地内容

### 1. IdeBridge 协议层 — `shared/types/ide-bridge.ts`

新文件,200+ 行 wire-level types:

- `IDE_BRIDGE_PROTOCOL_VERSION = 1`(显式版本化)
- 方向 (a) IDE → Agentrix:
  - `IdeBridgeHandshakeRequest/Response`(初次 sign-in)
  - `IdeBridgeChatRequest`(IDE 上下文 + 消息)
  - `IdeBridgeChatEvent`(streamed envelopes;镜像 `/openclaw/proxy/:id/stream`
    与 `/claude/chat`,**遵守 AGENTS.md 硬规则 #2**)
- 方向 (b) Agentrix → IDE:
  - `IdeBridgeReverseCommand`(union: `open-file` / `show-diff` / `run-task` /
    `run-command` / `reveal-symbol`)
  - `IdeBridgeReverseRequest/Response` 信封
- `IDE_BRIDGE_BACKEND_PATHS`(常量 catalog,backend / 扩展 / 桌面共享)

通过 `shared/types/index.ts` re-export,Web / Desktop / Mobile / 扩展共用
同一份契约。

### 2. VS Code 扩展 v0.1 — `extensions/vscode-agentrix/`

新目录结构(8 个文件):

```
extensions/vscode-agentrix/
├── package.json          # vsce manifest, 5 commands, 2 views, agentrix activity bar
├── tsconfig.json
├── README.md             # what it does / does not do
├── .gitignore
└── src/
    ├── extension.ts      # entry, command registration, sub provider wiring
    ├── apiClient.ts      # PAT auth, handshake, sendChat (NDJSON), createAgentTask, recallMemory
    ├── chatView.ts       # webview chat panel (theme-aware HTML, streaming)
    └── tasksView.ts      # tree view of background agent tasks (auto-refresh 30s)
```

**功能 v0.1**:
- Sign in via Personal Access Token(VS Code SecretStorage,**不写明文**)
- 在 IDE activity bar 显示 Agentrix 图标
- chat sidebar 转发到 `/api/claude/chat`(streaming NDJSON)
- 后台任务 tree view 列 `/api/agent-tasks`(30s 自动刷新)
- 5 个 commands: openChat / signIn / signOut / createAgentTask / recallMemory
- 2 个配置: `agentrix.apiBaseUrl`, `agentrix.preferredMode`

**不做的** (per positioning §4 + README):
- ❌ Tab autocomplete(让 IDE 原生处理)
- ❌ Cmd+K inline edit(同上)
- ❌ Bundle Monaco(diff 用 `vscode.diff` 命令)
- ❌ 与 IDE chat 在编辑器层竞争

**MVP 状态**:**代码 + manifest 完整**,但**未本地 npm install / build /
打包成 .vsix**。这是 v0.1 commit,后续在 VS Code 实际打包测试再补
.vsix artifact + Marketplace publish。`activationEvents=onStartupFinished`
+ `engines.vscode=^1.92.0` 已配置。

### 3. 桌面端反向 RPC dispatcher 升级 — `desktop/src/services/ideBridge.ts`

重写为统一的 `sendIdeBridgeCommand(request)` dispatcher,**所有反向命令
通过单一 chokepoint**。每种 command 映射到 Tauri 命令(现有 `desktop_bridge_open_in_ide`
或未来 stub):

- `open-file` → `openInIde`(已实现)
- `show-diff` → fallback 到 `open-file` right-hand(phase-2 实现真 diff)
- `run-task` / `run-command` / `reveal-symbol` → 软 no-op,返回 `ok=false +
  error="phase-2"`(不抛异常,调用者可优雅处理)

新增 5 个 convenience wrapper:`openFileInIde` / `showDiffInIde` / `runIdeTask` /
`runIdeCommand` / `revealSymbolInIde`。

**保留原 `openInIde({path, line, column, editor})`**——既有
`OpenInIdeButton.tsx` 不需改动。

## 验证

- `validate-positioning.mjs`: 12/12 PASS
- `desktop/ tsc --noEmit`: clean
- `shared/types/ tsc --noEmit -p shared/types/tsconfig.json`: clean
- vitest: 91/91 PASS

## 不在本 sprint(后续 phase / version)

- ❌ VS Code 扩展实际打包成 .vsix(需要本地 vsce 环境)
- ❌ Marketplace publish(需要 publisher account)
- ❌ Backend `/api/ide-bridge/handshake` 路由(扩展 v0.1 假设端点存在,
  实际 backend 路由需要在 ide-bridge module 落地;初次 handshake fail
  时扩展会显示错误,不阻塞 sign-in)
- ❌ Backend `/api/ide-bridge/chat` SSE(扩展 v0.1 复用 `/api/claude/chat`,
  路径常量已预留)
- ❌ Tauri 后端实现 `show-diff` / `run-task` / `run-command` 命令
- ❌ Device-code OAuth flow(v0.2)
- ❌ Coding_Plan_Revenue 归因脚本(post-launch 数据驱动)

## 重要 Gotcha

- VS Code 扩展引用 `shared/types/ide-bridge` 时**不能**用 alias 路径,因为
  vsce 打包时不解析 tsconfig paths。固定使用相对路径
  `../../../shared/types/ide-bridge`。
- 扩展 `tsconfig.json` 的 `rootDir: src` 会拒绝 `import` 跨界外部目录文件
  ——这是 vsce 推荐的最严配置,但**会导致 shared/types 引用失败**。MVP 通过
  `tsc --noEmit` 验证 type 兼容,实际打包时需要 webpack / esbuild 把 shared
  types 内联,这是 v0.1 → v0.2 之间的 build 改造任务。
- Backend `/api/ide-bridge/*` 路由**尚未实现**,扩展 v0.1 在 sign-in 时会
  返回 `HTTP 404`。这是已知的——扩展会显示 "Handshake failed" 提示但
  仍然把 token 存在 SecretStorage 里供 chat 调用使用(chat 走的是已经存在
  的 `/api/claude/chat`)。后续 backend module 落地后扩展无需改动即可享受
  完整 handshake。
- AGENTS.md 硬规则 #2:`/openclaw/proxy/:id/stream` 与 `/claude/chat`
  必须保持同步。本 sprint 的 `IdeBridgeChatEvent` 类型反映的是这两条
  路径已有的 envelope 形态,新增字段时**两边都要更新**。

## 下一步

C_Path 已经从"路线图项"变成"可演进的代码骨架"。后续动作:

1. **Backend ide-bridge module**:`backend/src/modules/ide-bridge/` 落
   handshake / chat passthrough 路由(2-3 小时)
2. **本地 vsce 打包**:`cd extensions/vscode-agentrix && npm install &&
   npm run package` 产出 .vsix,装到 Cursor 测试 sign-in / chat / tasks
3. **OpenVSX publish**:让 Cursor / Windsurf 用户也能装(VS Code Marketplace
   也行,但 OpenVSX 是 Cursor 的 default registry)
4. **Coding_Plan_Revenue 归因脚本**:留 launch 后 30 天数据
5. **Toy BLE / Wi-Fi**:留硬件到位

## Sprint 链总结

```
bf3e57e1e (P-1 perf)
  → 94f474f52 (P-2 light theme round 1)
    → fae6ab6d2 (P-2 light theme round 2)
      → c42413cfa (P-3 9 项 UX)
        → 4c8a0a344 (post-launch P-1: 跨端 + 长任务前端)
          → f93365552 (positioning revision dual-persona)
            → 00bba7b40 (Pro Mode F1+F2+F3)
              → a5e94ae0c (路线图对账)
                → b695525c0 (Spec A: Self-Evolution + Marketplace audit)
                  → (this) Spec B: P3 C_Path MVP
```

10+ commits,branch `perf/desktop-pre-launch-p1` 已经 ahead of `main`
20+ 个 commits。launch 前 merge 到 main 时建议**保留所有 commit**(不
squash),让 sprint 链可追溯。
