# Codex 桌面端调研报告 & vs Genspark / Agentrix Gap 分析

> 调研日期：2026-05-07
> 调研人：@ceo / @dev
> 数据来源：OpenAI 官方 (openai.com/index/introducing-codex、developers.openai.com/codex/app)、help.openai.com、OpenAI 官方变更日志

---

## 一、Codex 桌面端公司/产品概况

| 项目 | 数据 |
|---|---|
| 母公司 | OpenAI |
| 产品形态 | **Codex 是一个跨形态 Agent 矩阵**：Codex Web (chatgpt.com/codex) + Codex CLI (开源) + Codex IDE Extension (VS Code 系) + **Codex Desktop App** (macOS / Windows，本调研重点) |
| 桌面端发布 | 2025 下半年起，2026 已支持 macOS + Windows，Linux 名单制 |
| 底层模型 | `codex-1`（o3 蒸馏 SWE 优化）/ `codex-mini-latest`（o4-mini 蒸馏）/ 最新 `gpt-5.3-codex` |
| 商业化 | 含在 ChatGPT Plus / Pro / Business / Enterprise / Edu 套餐内（限时 Free/Go 也可用），不单独计费；企业按 Codex credits |
| 关键差异化 | **Desktop = "命令中心"**：本地+云双线程并行 / Worktrees / 内置 Browser / **Computer Use** 操作整台电脑 |

---

## 二、Codex 桌面端核心功能列表

### 2.1 多线程与项目工作流
- **Multitask across projects**：左栏项目侧边栏，可同时挂多个仓库与多个 Codex 线程并行
- **Worktrees**：基于 Git worktree 的"为每条任务自动创建独立工作树"，多 Agent 同时改同一仓不打架
- **Local Environments**：本地一键启动 dev server / 测试 / lint，作为 Agent 的可调用 action
- **Cloud Threads**：把任务派发到 OpenAI 云沙箱执行（与 Codex Web 同源），桌面端可观察、回收
- **Sync with IDE Extension**：和 VS Code/Cursor 扩展共享会话，桌面端 ↔ IDE 切换不丢上下文

### 2.2 Review / Git 工作流
- **Review Pane**：内置 diff 查看、行级评论、就地让 Codex 修改
- **Git 内建**：commit / branch / PR 全流程，可直接开 GitHub PR
- **Integrated Terminal**：内置终端，Codex 可看到输出（与 macOS 系统终端隔离，**Computer Use 不能操作终端**——安全设计）

### 2.3 In-app Browser（内置浏览器）
- 内嵌 Chromium，专为"本地 dev server / file-backed 预览 / 公开页面"设计
- **Browser Comments**：在渲染好的页面上选元素留批注，再让 Codex 据此改代码（视觉调试杀手级）
- 显式不支持登录态、Cookie、扩展、用户 Profile —— **明确把"敏感场景"踢给 Computer Use**

### 2.4 ⭐ Computer Use（操作整台电脑，本调研重点）
- **能力**：让 Codex 看屏幕、动鼠标、敲键盘、读剪贴板，**操作 macOS 上几乎任何 GUI 应用**（目前限 macOS，EU/UK/CH 暂不可用）
- **触发方式**：在 prompt 里 `@Computer` 或 `@AppName`（如 `@Chrome`、`@Calculator`）
- **典型场景（官方列出）**：
  - 测试自家在做的 macOS App / iOS Simulator 流程
  - **打开浏览器去任意网站完成任务**（含登录态页面）
  - 复现仅出现在 GUI 的 bug
  - 改 App 设置（点几屏 UI 那种）
  - 操作没有 plugin/MCP 的应用、读取数据
  - 跨多个 App 的工作流
- **登录/注册行为**：官方安全说明明确——"如果 Codex 用你的浏览器，它能与你已登录的页面交互。审核网站操作就像你自己在做，因为站点会把已批准的点击、表单提交、登录态行为视为来自你的账号"。 → **意味着可以替用户在已登录环境下完成"在网站填表注册/购买/发帖"等操作**，但需要每个 App 首次授权 + 敏感动作弹窗。
- **权限模型**（三层）：
  1. **macOS 系统层**：屏幕录制 + 辅助功能 (Accessibility) 权限（一次性授予）
  2. **App 层**：每个目标 App 首次使用必须用户批准，可选 "Always allow"
  3. **敏感动作层**：账号/支付/隐私/网络/凭证类操作每次单独询问
- **明确禁止**：不能自动化终端 App、不能自动化 Codex 自身、不能批准系统安全/隐私权限弹窗、不能以管理员身份认证 → **故意留一道"人在回路"红线**
- **可中断**：用户随时可接管鼠标键盘 / 取消任务

### 2.5 自动化与扩展生态
- **Automations**：定时/触发式让 Codex 跑任务（CI 之外的本地 cron-like 编排）
- **Skills / Subagents**：官方文档已上线 skill 体系和 subagent 体系
- **Plugins**：Browser、Computer Use 都是 plugin，Enterprise 可白名单管控
- **MCP Server / Codex SDK / App Server**：把 Codex 当后端，向第三方 IDE/工具暴露能力
- **Hooks / Rules / AGENTS.md**：仓库级行为约束（与 Anthropic 的 `CLAUDE.md` 体系类似）
- **GitHub Action**：把 Codex 变成 PR/issue 自动响应 bot

### 2.6 输出与交互
- **Image Generation**：内置图像生成 artifact
- **Richer Outputs / Artifacts**：表格、图表、文件预览等
- **Memories**：跨线程记忆，含 Computer Use 截图
- **Image inputs**（最新已支持，弥补早期短板）

---

## 三、Codex 桌面端的"杀手级"特征

| 能力 | 为什么是杀手级 |
|---|---|
| **Computer Use（系统级）** | 能看屏幕 + 操作所有 GUI App + 操作浏览器登录态 → 真正实现"AI 雇员"，不只是写代码。一句话"打开 Chrome 帮我去 X 网站注册账号"在原理上可行 |
| **Worktrees + 多线程并行** | 一个仓库同时开 5 条互不冲突的 Agent 线，"AI 团队"具象化 |
| **In-app Browser + 视觉批注** | 让 PM/Designer 也能直接"圈点"页面让 AI 改，**模糊了"使用者"和"工程师"边界** |
| **本地 + 云双轨** | Local 模式用电脑算力 + 隐私好；Cloud 模式扔云沙箱 + 可关电脑。两种心智一个 App |
| **明确分层的安全模型** | macOS 权限 / App 批准 / 敏感动作三道闸 + 不能操作终端 / 不能批系统弹窗 → 给企业松绑落地空间 |
| **跨形态共享会话**（CLI / IDE / Web / Desktop / Mobile-via-Web） | "Codex" 不是一个 App，是一个跨端 Agent 身份，桌面端只是它的"控制塔" |
| **AGENTS.md / Rules / Hooks** | 把"项目记忆"标准化，复刻成 OSS 标准（Anthropic CLAUDE.md 同源思想） |

---

## 四、核心问题：Codex 真的能"几乎操作电脑上所有功能、帮用户去网站注册"吗？

**结论：原则上是的，但有明确边界，需要用户每步授权。**

| 能否做到 | 行为 | 备注 |
|---|---|---|
| ✅ | 打开任意 macOS App、点击菜单、输入表单 | 需 App 首次授权 |
| ✅ | 控制 Chrome/Safari，访问任意网站 | 含已登录态 → **可帮用户在已登录站点注册子账号、提交表单、下单** |
| ✅ | 读屏幕截图、动剪贴板、跨 App 拷贝 | 截图会进入 ChatGPT 数据控制范围 |
| ✅ | 长时间在后台运行某个流程 | "Run a scoped task in the background while you keep working elsewhere" |
| ⚠️ | 全新网站从 0 注册（需收验证码/邮件） | 触发"敏感动作"会停下等用户 |
| ⚠️ | 涉及支付、密码、改账号设置 | 强制单步批准，不能 Always Allow 跳过 |
| ❌ | 操作 Terminal.app / iTerm / 自动化 Codex 本身 | 安全策略硬禁止 |
| ❌ | 同意 macOS 系统权限弹窗、提权为管理员 | 安全策略硬禁止 |
| ❌ | Windows 平台目前无 Computer Use | macOS Only（截至 2026-05） |
| ❌ | 欧洲/英国/瑞士 macOS 用户 | 法规原因暂不可用 |

→ **正确表述**：Codex Desktop 是一个"在用户监督下、由用户每个 App 授权过的"通用 GUI Agent，**不是一个无监督的全自动机器人**。这恰好是和 Manus / Genspark 走"云沙箱+无监督"路线的根本区别。

---

## 五、Codex Desktop vs Genspark — 对比差异分析

| 维度 | **Codex Desktop（OpenAI）** | **Genspark Workspace** |
|---|---|---|
| **核心定位** | "AI 工程师/AI 雇员的命令中心"，开发者优先 + 企业渗透 | "AI 全能助手"，C 端/SMB 优先 |
| **运行位置** | 主推**本地**（用户机器）+ 可选云线程 | 主推**云沙箱**（每用户独立 Cloud Computer），桌面端 (Claw) 也是 |
| **操作电脑能力** | **Computer Use 直接驱动你本机的 macOS GUI**（看你屏幕、动你的鼠标） | Cloud Computer：在远端 VM 内"自己有一台电脑"操作，**不动你本机** |
| **登录态/账号** | 用**你本机已登录**的浏览器 → 自然继承所有登录态 | 远端 VM，新 session，**需要单独登录**或带 cookie |
| **隐私模型** | 数据可能进截图，但系统资源在你手里；权限分层非常细 | 屏幕和数据完全在 OpenAI/Genspark 云端 |
| **多 Agent 并行** | Worktrees + 项目侧边栏，多线程一屏 | Super Agent 单流为主，多 Agent 编排弱 |
| **内容生成（PPT/视频/海报）** | **没有**（Codex 是工程导向） | **30+ 垂直工具矩阵**（Slides、Pitch、Logo、Music、Video...） |
| **AI 电话** | 无 | 有（爆款） |
| **代码 / 工程能力** | **业内最强**（codex-1/gpt-5.3-codex 专项 SWE RL）；Worktree、PR、Review、Diff 全套 | 弱，靠 Claude/GPT 通用能力 |
| **Browser** | In-app Browser（开发预览）+ Computer Use 操作系统浏览器（生产）双轨 | 远端浏览器，统一在云沙箱 |
| **价格** | 含在 ChatGPT 套餐内（$20-$200/月），无附加费 | $25-$200/月独立订阅 |
| **平台** | macOS + Windows（Linux 排队），**Computer Use 仅 macOS** | Web 主战场 + Mobile + 桌面 (Claw) |
| **生态/插件** | MCP / Skills / Subagents / SDK / GitHub Action / Hooks/Rules — 工程师生态完整 | 全闭源工具矩阵，无第三方扩展 |
| **目标用户** | 开发者 + 企业工程团队 + 想"调度 AI 干工程活"的高阶用户 | 个人/SMB/知识工作者 |

### 5.1 哲学差异（最重要）
- **Genspark = "AI 在云上替你做"**：用户给指令，结果送达，过程在远端 VM
- **Codex Desktop = "AI 在你的桌面上和你一起做"**：你的本机就是工作台，AI 作为同事坐在你身边操作

→ 两条路线各有市场。**Codex 路线对开发者/工程团队/重度生产者更有粘性**；Genspark 路线对普通消费者更友好。

---

## 六、Agentrix 应该借鉴 Codex 桌面端的哪些部分？

> 我们已有 Tauri 桌面端 (Agentrix Desktop / Pro 模式)、OpenClaw 多 Agent 实例、远程 handoff 等基础。Codex 提供了几条非常清晰的产品方向。

### 🔴 P0 必做（Agentrix 缺失但 Codex 已验证）

1. **Computer Use 能力上桌面端**
   - 在 Tauri 桌面端做"系统级 GUI 操作"plugin：先 Windows（用户基数大、Codex 还没覆盖 → **窗口期**），再 macOS
   - 实现路径：Windows 用 UI Automation API + screen capture；macOS 用 Accessibility + ScreenCaptureKit
   - **复用 Codex 的三层授权模型**（系统权限 / App 白名单 / 敏感动作弹窗），照抄红线（不能操作终端、不能批系统弹窗、不能提权）
   - 这能直接补齐 Agentrix Gap 分析里的"P0 #2 Cloud Sandbox / Computer-Use"（且选了相反路径：本机操作而非云沙箱，更贴近"AI 雇员"叙事）

2. **Worktrees + 多 Agent 并行工作台**
   - 我们已有 OpenClaw 多实例 + Team，但桌面端 UX 没把"一仓多线程并行"做出来
   - 桌面端引入 Git Worktree 自动创建/回收 + 项目侧栏多线程视图
   - **可以与 OpenClaw "Agent Team" 联动**：每个 Agent 跑自己的 worktree，最后合并 → 协议层抽 PR 合并费 (X402)

3. **In-app Browser + 视觉批注 (Browser Comments)**
   - 在 Tauri 内嵌 WebView 做"开发预览 + 元素圈点"
   - 让 Agent 看到鼠标圈选区域，直接定位到代码 → **PM/Designer 也能用我们的桌面端**，破开发者圈

4. **AGENTS.md / Rules / Hooks 标准**
   - Codex 已经把 `AGENTS.md` 推成事实标准（Anthropic 也认）
   - Agentrix 应**原生识别并尊重 `AGENTS.md`**，让 OpenClaw Agent 在任何仓库都能即插即用——这是低成本占位生态卡位

### 🟡 P1 强烈建议

5. **Local + Cloud 双轨清晰化**
   - 现在用户其实分不清 Agentrix 桌面是本地跑还是远端跑
   - 学 Codex：UI 顶部明确 "Local | Cloud" 切换，让用户知道权力归谁
   - 协议层：Cloud 模式按 X402 计费、Local 模式免费 → 自然推动用户做选择

6. **Plugin 化 + Always Allow 模型**
   - 把 OpenClaw tools 做成"plugin"：第一次用时弹窗、可 Always allow、企业版有白名单
   - 这是 Marketplace 收费的天然结算点

7. **跨形态会话同步**
   - Codex CLI / IDE / Desktop / Web 同源会话
   - Agentrix 已有 Mobile + Desktop + Web，应推**会话级跨端 handoff**（部分已实现，需 UX 打通到"无感"）

8. **Subagents 体系**
   - Codex 已上线 Subagents
   - Agentrix Agent Team 概念其实更超前（11 agent + 经济关系），但**桌面端没有让用户编排 subagent 的 UI**——补这块

### 🟢 P2 长线借鉴

9. **企业插件白名单 + RBAC**：Codex 企业版治理逻辑成熟，我们 OpenClaw 多租户也需要这套
10. **Memories 跨线程**：Codex Memories 已含截图；我们 mobile 已有 Memory Center，桌面端要打通
11. **GitHub Action 化**：把 Agentrix Agent 做成 GitHub Action，开发者获客最低门槛入口

### ⚪ 不建议跟进
- **不做"30+ 工具矩阵"**：那是 Genspark 的路，与 Agentrix "Agent 经济+开放生态"定位冲突
- **不做单流 Super Agent**：我们的差异化是"多 Agent 互相雇佣"，单流是退步

---

## 七、关键启示总结

| 启示 | 行动 |
|---|---|
| **桌面 Agent 的终极形态是"操作整台电脑"** | Tauri Desktop 优先做 Windows Computer Use（Codex 还没做）→ 窗口期 |
| **代替用户去网站注册/操作不是科幻，是"权限分层 + 人在回路"工程问题** | 复用 Codex 三层权限模型 + 红线清单，避免合规暴雷 |
| **Worktrees 把"多 Agent 并行"从概念落到 Git 物理隔离** | 桌面端引入 worktree-per-agent，与 OpenClaw Team 绑定 |
| **AGENTS.md 已是事实标准** | 立即原生支持，零成本卡位 |
| **Local vs Cloud 必须对用户透明** | 这是 Agentrix 收费/隐私/性能差异化叙事的基础 |
| **In-app Browser + 视觉批注让 PM/Designer 也能用** | 破开发者圈的杀手级 UX |
| **Codex 走"系统级 + 监督"，Genspark 走"云沙箱 + 自动"** | Agentrix 应**两条都走**：桌面端走 Codex 路线，云端 OpenClaw 走 Genspark 路线，**用经济协议把两者打通**——这是我们的独家叙事 |

---

## 八、附录：关键数据源

- OpenAI 公告: https://openai.com/index/introducing-codex/
- Codex App Overview: https://developers.openai.com/codex/app
- Computer Use 官方文档: https://developers.openai.com/codex/app/computer-use
- In-app Browser 文档: https://developers.openai.com/codex/app/browser
- Codex 套餐说明: https://help.openai.com/en/articles/11369540-codex-cli-getting-started
- Codex 文档总入口: https://developers.openai.com/codex
