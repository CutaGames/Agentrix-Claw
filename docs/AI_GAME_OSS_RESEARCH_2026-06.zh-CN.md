# 开源「AI 做游戏」项目调研 + 对我们路线的借鉴(2026-06)

> 目的:回答"桌面端真复杂游戏(3D/重逻辑)是否有可借鉴的开源项目"。结论先行:**有,而且
> 直接验证了我们已选的技术路线**(模板/语料 + 参数变异 + 发布前自动试跑 + 自修复),并给出
> 两个可以马上抄的具体机制。内容据各项目公开 README/论文整理改写(已为合规改写)。

---

## 0. 一句话结论
- **裸 LLM「从零生成整局游戏」会塌**——学术与工程界已是共识(见 §3 论文);主流开源做法和我们
  一致:**复制可运行模板 → 在其上改 → 每步自动 QA → 失败自修复**。我们的 clone-mutate + play-test
  方向是对的。
- **马上能抄的两件事**:① `render_game_to_text()` 状态自描述约定(把 play-test 从"没崩"升级成
  "玩法真的通"+ 反哺 AI 对手/反作弊);② 模板化 + 每步 QA 子代理 + 自修复回路(我们已有精简版,
  对方是"北极星"实现)。
- **桌面 D1(富 2D/轻 3D)有现成可抄的工程骨架与 3D 示例**(Phaser/Three.js 模板,MIT)。

---

## 1. 重点项目(按对我们的相关度排序)

### ① PlayableIntelligence/game-creator —— 最值得抄(2D Phaser + 3D Three.js)
[github.com/PlayableIntelligence/game-creator](https://github.com/PlayableIntelligence/game-creator) · MIT(音频用 @strudel 时受 AGPL 约束)

- **核心做法与我们一致**:`/viral-game` 从 `templates/` **复制可运行启动工程**,而非从零生成
  ——这正是我们 clone-mutate 的思路。
- **每步 QA 子代理(5 阶段)**,改一步跑一遍:`build` → `runtime`(无头 Chromium 查 WebGL/未捕获
  异常/console error)→ `gameplay`(动作回放,验证计分与死亡触发)→ `architecture`(模式校验)→
  `visual`(Playwright 截图)。任一阶段失败 → autofix 子代理打补丁 → 重跑(最多 3 次)。这就是
  我们 play-test gate + 自修复回路的"加强版"。
- **`render_game_to_text()` 约定**:每个游戏暴露 `window.render_game_to_text()` 返回当前状态 JSON,
  让 AI **不靠看像素**就能读懂游戏状态。⭐ 这是最有价值的可抄点(见 §2)。
- **工程骨架**:EventBus(模块间只走 pub/sub)/ GameState(单一状态源 + `reset()`)/ Constants
  (零硬编码、按比例 + DPR 缩放)。配 `verify-runtime.mjs` / `iterate-client.js`(动作回放+截图)/
  `validate-architecture.mjs`。
- **3D 示例(Three.js)**:`flappy-bird-3d`、`flight-simulator`(带地形)、`labyrinth`(3D 迷宫)、
  `singularity-run`(无限跑+矩阵雨)——直接对应我们桌面 D1 的"轻 3D"语料种子。
- **变现**:接 Play.fun(OpenGameProtocol),按计分系统设反作弊上限,SDK 非阻塞、本地缓冲分数、
  game-over 时同步——和我们"服务端权威 + 不信任客户端分数"的经济设计同源。

### ② Donchitos/Claude-Code-Game-Studios —— 多代理「工作室」编排(21.6k★)
[github.com/Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) · MIT

- 把一个 Claude Code 会话变成"游戏工作室":**49 agents / 73 skills / 12 hooks / 11 路径规则**,
  三层(总监 Opus → 部门 lead Sonnet → 专员 Sonnet/Haiku)。
- 含 Godot4 / Unity / Unreal5 三套引擎专员;skill 里有 `/smoke-check`、`/playtest-report`、
  `/soak-test`、`/regression-suite`、`/balance-check` 等**质量门**;规则里强制
  `src/networking/** 服务端权威`。
- **定位差异**:这是**开发期编排模板(给人用 Claude Code 做游戏)**,不是**运行期生成服务**。
  我们要的是"用户一句话→平台出可玩游戏",所以**选择性借鉴它的门控/规则清单**(尤其 smoke/
  playtest/server-authoritative),不照搬整套工作室。

### ③ abagames/claude-one-button-game-creation —— 一键(one-button)玩法配方
[github.com/abagames/claude-one-button-game-creation](https://github.com/abagames/claude-one-button-game-creation) · MIT
- 用 Claude 设计"单按钮动作游戏"的方法论 + 脚本。**移动优先、单指可玩、规则极简但有 juice**——
  和我们手机端"随手玩"的甜区高度吻合,可作为**手机端语料的玩法蓝本**(单键跳/冲/翻)。

### ④ lappemic/awesome-ai-built-games —— 案例清单
[github.com/lappemic/awesome-ai-built-games](https://github.com/lappemic/awesome-ai-built-games)
- 主要由 LLM 提示生成的游戏精选集,可作为"语料品类灵感库"与竞品观察,不含可复用框架。

---

## 2. ⭐ 立刻可落地的两个借鉴(优先级最高)

### A. 引入 `render_game_to_text()` 状态自描述约定
**问题**:我们现在的 play-test 只能证明"加载不崩、循环不抛错",证明不了"玩法真的通"(分数会涨、
能通关/死亡)。**做法**:约定每个游戏在 `window` 上暴露:
```js
window.render_game_to_text = () => JSON.stringify({ score, lives, level, over, /* 关键状态 */ });
window.__advanceTime?.(ms);     // 可选:让无头环境快进
```
**收益(三连)**:
1. **play-test 升级为玩法验证**:无头跑 N 帧后读 `render_game_to_text()`,断言 `score` 增长、
   `over` 能被触发——把"没崩"升级成"能玩"。
2. **AI 对手/陪练**(我们差异化主线):agent 读文本状态即可决策,不必解析像素。
3. **经济反作弊**:服务端可对照"状态轨迹"判定分数合理性,而非盲信客户端上报。
- **改动**:① 给 10 个自研语料游戏各加一个 `render_game_to_text()`(小);② 在 `buildPrompt` 里
  要求 LLM 产物也暴露它;③ `GamePlaytestService` 读取并断言关键状态。**这是把现有 play-test 提质
  的最高 ROI 一步。**

### B. 把"每步 QA + 自修复"升级到桌面端真无头 Chromium
我们后端的 `GamePlaytestService` 用 Node `vm` + DOM 桩(零依赖、够拦"一跑就崩")。game-creator 证明
**真无头 Chromium + 动作回放 + 截图**能更进一步(查 WebGL 错、跑真实交互、看可见性)。
- **桌面端我们本来就有 Computer-Use/CDP**(见 `DESKTOP_COMPLEX_GAMES_FEASIBILITY` §4):正好用它做
  **发布前真机试跑**——桌面富 2D/轻 3D 产物用 CDP 加载 → 注入 `example-actions.json` 式动作回放 →
  读 `render_game_to_text()` 断言 → 截图视觉检查 → 失败回喂自修复(≤3 次)。
- **分层策略**:手机端/后端继续用轻量 vm 桩(快、零依赖);桌面端用 CDP 真机 QA(强、能验 3D)。

---

## 3. 学术佐证(为什么不赌裸 codegen)
- **《Open Agentic Coding for Games》**(arXiv 2604.18394):LLM/代码代理能解孤立编程任务,但要从高层
  设计产出**一局完整可玩游戏**时常**崩**于跨文件不一致、场景接线断裂、逻辑不自洽。→ 支撑我们
  "模板/语料为骨、变异为肉、试跑为关"的策略。[arxiv.org/html/2604.18394](https://arxiv.org/html/2604.18394)
- **AutoUE《Automated Generation of 3D Games in Unreal via Multi-Agent Systems》**(arXiv 2603.07106):
  多代理协同做 3D(模型检索→场景生成→玩法/交互代码合成→自动测试)。说明**真 3D 自动生成仍是研究
  阶段**,对应我们路线里的 **D3(远期/合作)**,现在不投。[arxiv.org/html/2603.07106](https://arxiv.org/html/2603.07106)

> 注:以上论文/项目内容为合规改写概述,细节以原文为准。

---

## 4. 对我们路线图的净建议(优先级)
1. **(本周可做)`render_game_to_text()` 约定** → play-test 升级为玩法验证 + 为 AI 对手/反作弊铺路。**最高 ROI。**
2. **(已在做,继续)模板/语料 + 参数变异 + play-test gate + 自修复** —— 与主流开源、学术结论一致,持续扩语料。
3. **(桌面 D1)抄 game-creator 的 Three.js 模板骨架**(EventBus/GameState/Constants + InputSystem 触控/键盘),
   把它的 3D 示例(迷宫/飞行/无限跑)作为**桌面轻 3D 语料种子**;用 Computer-Use/CDP 做发布前真机 QA。
4. **(选择性)借 Claude-Code-Game-Studios 的质量门清单**(smoke/playtest/balance + 服务端权威网络规则)
   到我们更重的"桌面创作器"流程;**不照搬**整套 49-agent 工作室(那是开发期工具,非运行期服务)。
5. **(经济)对齐 Play.fun 式反作弊**:按计分系统设上限、客户端只缓冲、服务端权威结算——我们 AXP 已同向。

## 5. 许可与合规
- game-creator、Claude-Code-Game-Studios、one-button、awesome 列表均 **MIT**;借用代码/模板需保留版权与
  署名。**注意**:game-creator 的音频依赖 `@strudel/web` 为 **AGPL-3.0**——若直接用其音频方案,整个游戏
  需 AGPL 兼容许可;我们若自做程序化音频(Web Audio 裸写)可规避该传染性。
- 借鉴**思想/架构模式**(EventBus、render_to_text、每步 QA)不构成衍生作品;**直接复制其模板/示例代码**
  才触发署名义务——抄代码时按文件保留 LICENSE 头并在 NOTICE 记录来源。
