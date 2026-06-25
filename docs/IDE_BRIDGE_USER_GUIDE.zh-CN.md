# IdeBridge 用户指南 — Agentrix × Cursor / VS Code

> Agentrix 与 Cursor / VS Code / Windsurf 的协作桥接(C_Path 主形态)。
>
> 出处:`docs/agentrix-positioning-2026-05.zh-CN.md` §7 P3
> 更新日期:2026-05-24

---

## 一句话总结

**Agentrix 不和 Cursor / VS Code 卷编辑器**——我们做的是把 Agentrix 独有的
**跨工具记忆 / 长任务后台 / 跨端协作**注入你已有的 IDE 工作流。

两个方向:

1. **Agentrix → IDE**(已可用):桌面端**右键浮球 → "在 IDE 打开"**,把当前
   工作区一键拉到 Cursor / VS Code。`OpenInIdeButton` 也散布在 Pro Mode
   的 Workspace Diff Workbench / 工具卡片旁。
2. **IDE → Agentrix**(P3 阶段 v0.1 脚手架已就绪):VS Code / Cursor / Windsurf
   扩展把 Agentrix agent 注入 IDE 的 chat 面板。本节文档解释怎么用。

---

## 1. 桌面端:右键浮球"在 IDE 打开"

### 入口位置

**右键 Agentrix 桌面浮球 → 滚动到"🔗 在 IDE 打开 (Cursor / VS Code)"**

> 如果你没看到这一项:菜单可能被屏幕底截断。Sprint 2026-05-24 已修复
> (popup 窗口高度 480 → 600,菜单 maxHeight 跟视口),如果仍有问题,
> 请把浮球拖到屏幕中部再右键。

### 行为

| 用户动作 | 结果 |
|---------|------|
| 点击菜单项 | 调用 `openInIde({ path: ".", editor })`,把当前工作区根目录在你偏好的 IDE 里打开 |
| 第一次点击 | 默认打开 Cursor。如果你 Pro Mode 用过 OpenInIdeButton 且选过 VS Code,会持久化为 VS Code |

### 切换偏好的 IDE

| 方式 | 操作 |
|------|------|
| Pro Mode 内 | 进入 More 菜单 → Workspace Diff(Pro 用户) → 文件 diff 视图 → "在 IDE 打开"按钮的 chevron(▾) → 选 Cursor 或 VS Code,自动持久化到 `localStorage["agentrix_ide_target"]` |
| 直接编辑 | DevTools Console 跑 `localStorage.setItem('agentrix_ide_target', 'vscode')` |
| 重置 | `localStorage.removeItem('agentrix_ide_target')` → 回到默认 Cursor |

### 失败排查

| 现象 | 原因 | 修复 |
|------|------|------|
| 点击菜单后什么都没发生 | Cursor / VS Code 未安装,或不在 PATH | 装一个 IDE,或修改 `agentrix_ide_target` 到你装的那个 |
| 打开了但没跳到具体文件 | `openInIde({ path: "." })` 只打开工作区,不带具体文件 | 用 OpenInIdeButton(在 file diff 旁)精确跳行 |
| 提示"未找到 Cursor / VS Code 安装" | Tauri 没找到 IDE 命令 | 确认 `cursor` 或 `code` 命令在终端能跑 |

---

## 2. Pro Mode:OpenInIdeButton 精确跳行

### 入口位置

`Pro Mode → More 菜单 → 🔍 Workspace Diff` → 选中改动文件 → 右上 "在 IDE 打开" 按钮

### 行为

调用 `openInIde({ path: <relative_file>, line: 1, editor: <persisted> })`
打开具体文件并定位到行号。Chevron(▾)菜单切换 IDE。

### 当前覆盖的位置

- ✅ Workspace Diff Workbench(Pro Mode)
- ✅ TaskWorkbench 的文件 diff 视图(Standard / Pro)
- 🟡 消息流 file artifact 卡片(planned,未在 v0.4.5 上)

---

## 3. VS Code / Cursor / Windsurf 扩展(P3 v0.1 脚手架)

### 当前状态

代码完整,**未发布到 Marketplace**。需要本地从源码打包。

仓库位置:`extensions/vscode-agentrix/`

### 本地打包安装(开发者)

```bash
cd extensions/vscode-agentrix
npm install
npm run compile
npx @vscode/vsce package    # 产出 agentrix-0.1.0.vsix
```

然后在 VS Code / Cursor:

```
Ctrl+Shift+P → "Extensions: Install from VSIX..." → 选 agentrix-0.1.0.vsix
```

### 扩展提供的能力

| 命令(Cmd+Shift+P) | 作用 |
|---------------------|------|
| `Agentrix: Sign In` | 输入你的 PAT(从 agentrix.top/account/tokens),token 存在 VS Code SecretStorage,**不写明文** |
| `Agentrix: Sign Out` | 删除本地 token |
| `Agentrix: Open Chat` | 切到 Agentrix activity bar(侧边栏图标 ✨) |
| `Agentrix: Create Long-Running Task` | 创建后台 agent task(关上 IDE 还在 server 跑) |
| `Agentrix: Recall Cross-Tool Memory` | 拉出 Agentrix 跨 Chrome / Office / 桌宠记的上下文 |

| Activity bar 视图 | 作用 |
|-------------------|------|
| Chat | 在 IDE 内对 Agentrix 说人话,后端走 `/api/claude/chat`(同桌面端) |
| Background Tasks | 列出你跑中的长任务,30s 自动刷新 |

### 配置(VS Code Settings)

| Setting | Default | 说明 |
|---------|---------|------|
| `agentrix.apiBaseUrl` | `https://api.agentrix.top` | 后端 base URL,自托管时改 |
| `agentrix.preferredMode` | `pro` | Simple / Standard / Pro |

### 已知限制(v0.1)

- 🔴 后端 `/api/ide-bridge/handshake` 路由**未实现**——sign-in 时会显示 "Handshake failed (HTTP 404)" 但 token 仍会被保存,chat 调用走的是已经存在的 `/api/claude/chat` 因此可用。
- 🟡 Streaming 是粗糙 NDJSON parser,真正 SSE 兼容留 v0.2。
- 🟡 没做 Device-Code OAuth,只支持 PAT。
- 🔴 不在 Marketplace,装包要本地 vsce build。

这些会在 v0.2 / v0.3 里补。

---

## 4. IdeBridge 协议层(技术参考)

仓库位置:`shared/types/ide-bridge.ts`

定义:

- `IDE_BRIDGE_PROTOCOL_VERSION = 1`
- `IdeBridgeHandshakeRequest/Response`
- `IdeBridgeChatRequest/Event`(双链路:`/openclaw/proxy/:id/stream` + `/claude/chat`,**AGENTS.md 硬规则 #2**)
- `IdeBridgeReverseCommand`:`open-file` / `show-diff` / `run-task` / `run-command` / `reveal-symbol`
- `IDE_BRIDGE_BACKEND_PATHS` 常量 catalog

桌面端 dispatcher:`desktop/src/services/ideBridge.ts`

```ts
import { sendIdeBridgeCommand, openFileInIde, showDiffInIde } from "./services/ideBridge";

await openFileInIde("cursor", "src/foo.ts", 42);
// 或
const res = await sendIdeBridgeCommand({
  protocolVersion: 1,
  target: "vscode",
  command: { kind: "open-file", path: "src/foo.ts", line: 42 },
});
// res = { ok: true, launched: "vscode://..." }
```

支持的命令:

| Kind | 状态 | 说明 |
|------|------|------|
| `open-file` | ✅ Phase-1 实现 | 通过 vscode:// / cursor:// URL 调用 |
| `show-diff` | 🟡 Fallback to open-file | Phase-2 实现真 diff |
| `run-task` | 🔴 Phase-2 stub | 返回 ok=false + error="phase-2" |
| `run-command` | 🔴 Phase-2 stub | 同上 |
| `reveal-symbol` | 🔴 Phase-2 stub | 同上 |

---

## 5. 路线图

| 版本 | 时间 | 内容 |
|------|------|------|
| v0.1(本版本)| 2026-05-24 | 桌宠菜单 IDE 入口、协议层、扩展脚手架、PAT 认证 |
| v0.2 | 2026-06 | Backend `/api/ide-bridge/*` 路由、SSE 兼容、Device-Code OAuth |
| v0.3 | 2026-07 | Phase-2 reverse 命令(show-diff / run-task / run-command / reveal-symbol)|
| v1.0 | 2026-08+ | VS Code Marketplace 与 OpenVSX(Cursor / Windsurf)正式发布 |

---

## 6. 文档反馈 / FAQ

**Q1: 我点了菜单的"在 IDE 打开",但什么都没发生**
A: 大概率是 Cursor 或 VS Code 命令不在 PATH。打开终端跑 `cursor --version` 或 `code --version`,如果报命令找不到就需要把 IDE 装上或加到 PATH。

**Q2: 我用的是 Windsurf,默认打开 Cursor 不对**
A: 当前桌宠菜单只支持 Cursor / VS Code 二选一。Windsurf 走扩展通道(它装 vsix 是兼容的)。Windsurf 直接桥接的菜单项留 v0.3。

**Q3: Pro Mode 必须开吗?**
A: 桌宠菜单的"在 IDE 打开"**不要求 Pro Mode**(任何模式可用)。但 OpenInIdeButton 在文件 diff 旁的精确跳行**仅 Pro 可见**——这是定位文档 §3.3 的承诺(Pro 才显示 raw diff / IDE 桥接)。

**Q4: 我的 PAT 在哪里拿?**
A: 上 `agentrix.top/account/tokens`(待 v0.2 PAT 管理界面上线;在那之前可用 backend `POST /api/auth/personal-access-tokens` 直接拿,或者在 Agentrix 桌面端登录后从 DevTools 复制 `localStorage.agentrix_token`)。

**Q5: 我能不能用 Agentrix 替代 Cursor?**
A: **不建议**。Agentrix 不做编辑器层(B_Path 已被否决,定位文档 §2.1)。
我们做的是 Cursor 不做的:跨工具记忆、长任务后台、跨端协作、人话总结。
Cursor 写代码,Agentrix 帮你管全流程。

---

## 7. 引用

- 主决策:`docs/agentrix-positioning-2026-05.zh-CN.md`
- 营销话术(对外口径):`docs/business/POSITIONING_MESSAGING_v2026-05.zh-CN.md`
- 协议层源码:`shared/types/ide-bridge.ts`
- 桌面 dispatcher:`desktop/src/services/ideBridge.ts`
- 扩展源码:`extensions/vscode-agentrix/`
- VS Code 扩展 README:`extensions/vscode-agentrix/README.md`
