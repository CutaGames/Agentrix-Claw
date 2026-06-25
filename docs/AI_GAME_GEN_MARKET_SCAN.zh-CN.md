# AI 生成游戏:市场 + 主要公司 + 对 Agentrix 的借鉴(2026-06)

> 内容据公开报道整理并改写以符合引用规范;关键来源附链接。

## 一、赛道分两大阵营

### A. UGC「文生游戏」消费平台(与我们最相关)
低门槛"打字→出可玩游戏→社区玩/改/分享"。产出的是**真实可玩的游戏 + 社区**,已被验证能起量。
- **Astrocade**(李飞飞联合创办):2026-05 完成 A+B 轮约 **$56M**;约 **500 万月活、每月约 1.4 亿次游戏、
  8 万+ 创作者游戏**;核心是文生游戏 + **边玩边改(remix)** + 社区分享。
  [Fortune/Yahoo](https://finance.yahoo.com/sectors/technology/articles/sequoia-backed-astrocade-raises-56-103734493.html)
- **Rosebud AI**:文生游戏 + 社区 remix/分享,主打"小团队也能做好游戏"。
  [rosebud.ai](https://lab.rosebud.ai/blog/new-years-eve-reset-how-2025-changed-game-creation----and-why-2026-belongs-to-creators)
- **Roblox**(UGC 基准/天花板):2025 约 **1.26 亿日活、年流水约 $68 亿**——证明 UGC + 经济系统的规模上限。
  [KuCoin 摘要](https://www.kucoin.com/news/flash/astrocade-secures-56m-in-a-b-funding-to-revolutionize-ugc-gaming-with-ai)

### B. 生成式「世界模型/引擎」(前沿、重资本、暂非消费变现)
直接生成可交互的 3D 世界/画面,算力极重,目前多为研究/基建,未形成消费级游戏变现。
- **Google DeepMind Genie 3 / Project Genie**:文本→可实时漫游 3D 世界(约 24fps),2026-01 对 Google AI Ultra 订阅开放。
  [Wikipedia](https://en.wikipedia.org/wiki/Genie_(world_model)) · [techloy](https://www.techloy.com/google-deepmind-launches-project-genie-to-turn-text-into-playable-game-worlds/)
- **Decart Oasis 3**:实时世界模型(API),2026-06 **转向机器人/自动驾驶仿真**(说明纯世界模型在消费游戏侧变现难)。
  [TechCrunch](https://techcrunch.com/2026/06/10/decarts-new-world-model-can-simulate-hours-of-photorealistic-driving-with-some-caveats/)
- **Microsoft Muse / WHAM**:面向"玩法构思"的生成模型(研究阶段,Nature 发表)。
  [Microsoft Research](https://www.microsoft.com/en-us/research/blog/introducing-muse-our-first-generative-ai-model-designed-for-gameplay-ideation/)

## 二、市场规模
- 全球游戏市场 2024 已超 **$1800 亿**([Google Cloud](https://cloud.google.com/blog/products/gaming/games-start-ups-developers-partners-innovating-with-gen-ai))。
- "AI 游戏"细分预计到 2034 约 **$379 亿**(KuCoin 引 2025 数据)。

## 三、对 Agentrix 的借鉴(可落地)

1. **押 A 阵营(UGC 代码生成 + 社区),别碰 B 阵营(世界模型)**。
   世界模型是前沿大厂/重资本的游戏,且连 Decart 都转去做机器人仿真——消费游戏侧暂不变现。
   我们做的"HTML5 代码生成 + 精选开源 + WebView"正是务实、可上手机的正确车道。

2. **真正的引擎是"创建→玩→remix→分享→关注"的循环,而非"生成"本身**。
   Astrocade 的杀手锏是**边玩边改(remix)** + 社区,不是模型多强。
   → 我们应补强:**一键 remix/二次创作**(基于已有创作生成变体)、关注/榜单/合集,把创作流做成留存飞轮。

3. **分发与留存是护城河,不是生成器**。Astrocade 5M MAU 是壁垒;但业内普遍**还没答好留存/变现**
   ([战略分析](https://strategicforesightinai.substack.com/p/the-ai-game-platform-fei-fei-li-co))。
   → 我们的差异化正在这:**原生 agent 经济 + AXP + 打赏/交易**。多数 AI 游戏平台**没有原生经济系统**,我们有。

4. **纯 LLM 生成的游戏普遍偏浅 → 必须"生成 + 模板/精选 + 可改"组合**。
   与我们实战一致(弱模型回退模板、精选自托管精品)。建议:把"AI 生成"定位成**改写/换皮/出关卡**,
   而非从零造复杂游戏;复杂度交给模板/精选底座。

5. **手机优先 + 即时可玩 + 低门槛**是消费侧关键(我们已在做:竖屏/触屏/高 DPI/单人 vs AI)。

## 四、我们已有的差异化 & 建议下一步
**独有优势**:agent 经济闭环(AXP/打赏/交易/agent 可调用)、跨端、agent 主播/陪玩。这是 Astrocade/Rosebud 没有的。
建议优先级:
1. **Remix/二次创作**:基于已发布创作"再创作一个变体/换皮/加关卡"(把单向生成变成社区共创)。
2. **经济闭环做实**:游戏内购(关卡/皮肤用 AXP)、创作者分成、打赏榜——把"有经济"变成"经济真的转起来"。
3. **创作流即玩(feed-as-play)**:卡片内直接试玩 3-5 秒预览,提升转化(Astrocade 式"边刷边玩")。
4. **agent 差异化玩法**:AI 陪玩/AI 出题/AI 主播带玩——我们独有,别人难抄。

> 一句话:对标 **Astrocade/Rosebud(UGC 文生游戏 + 社区 remix)**,别追世界模型;
> 我们的胜负手是把它们**缺失的"原生 agent 经济 + 跨端 agent 玩法"**补上,并把创作流做成"创建-玩-改-赚"的飞轮。
