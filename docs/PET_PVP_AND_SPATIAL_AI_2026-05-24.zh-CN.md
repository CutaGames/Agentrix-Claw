# Pet 竞技游戏化 + 空间智能调研 — 开放讨论

> 议题:把 Pet team 协作扩展成"开放竞技游戏"是否可行?
> 调研:Astrocade(李飞飞投资,AI 游戏创作)+ World Labs(李飞飞创立,空间智能 / Marble 世界模型)
> 撰稿:CEO + Dev(2026-05-24)
> 状态:**开放讨论稿**,尚未变成 spec
> 关联文档:
> - [MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md](MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md) Pet team 多 agent 协作设计
> - [agentrix-positioning-2026-05.zh-CN.md](agentrix-positioning-2026-05.zh-CN.md) 主定位

---

## 一句话结论

**完全可行,而且是 Agentrix 独有的护城河延伸**——但**不能上来就做王者荣耀级别**,从最简的"AI 灵魂赛跑 + 任务擂台"起步,后续可拓展到 MMO 级别的 spatial 多人对战(借助 World Labs Marble 的 3D 世界生成能力)。

三阶演进:

```
v1: 任务擂台(2 个 agent / 团队解同一个任务,谁先 / 谁好)
v2: 实时小游戏(回合制 / 卡牌 / 简单 PvP,2-4 只 pet 对决)
v3: 开放世界 MMO(多人组队,Marble 风格生成场景,类王者荣耀)
```

---

## 一、行业调研

### 1.1 Astrocade — AI prompt-driven 游戏创作平台

**最新数据**(2026-05 Series A+B,$56M,Sequoia + Sea + Google + Nvidia):

- **5M MAU**,140M monthly gameplays,75K games created in 80 countries(8 个月)
- 核心机制:**用户用自然语言 prompt → AI 生成可玩的小游戏**
- 平台 host 千万计的 user-generated 游戏,可分享、可 remix
- 2024-06 seed $12M(NVIDIA Ventures、Eric Schmidt)→ 2026-05 A+B $56M

**Astrocade 的成功公式**(我们的复述):

| 元素 | 怎么做 |
|------|--------|
| 创作门槛 | 几乎为 0(自然语言 prompt) |
| 游戏复杂度 | 浅(休闲、卡牌、roguelike、jump-and-run) |
| 社交 | 强(分享 / remix / leaderboard) |
| 经济 | 暂未明示分成机制(但用户参与度极高) |
| 平台模型 | UGC + AI 工坊,类比 Roblox / TikTok |

**对 Agentrix 的启示**:
- ✅ "**用户 prompt 一句话生成游戏**"已经被市场验证,我们能复用 LLM 能力
- ✅ Agentrix Pet 自带"角色"和"经济属性",**比 Astrocade 更深 1 层**(他们的游戏是 stateless,我们的 pet 跨场景持久)
- ⚠️ 不要去**建造游戏创作平台**(Astrocade 已经占位),我们做**游戏的"对手 / 队友"** — 即 Pet 在游戏里参与,不是用户在 prompt 游戏机制

### 1.2 World Labs — 空间智能 + Marble 3D 世界生成

**关键事实**:
- **2024-09 创立**,Fei-Fei Li 任 CEO,Andrej Karpathy / Justin Johnson 等参与
- 2024 早期估值 ~$1B(独角兽);**a16z + NEA + Radical Ventures** 等领投
- 2025-11 发布**Marble**——**生成式 3D 世界模型**:
  - Input:text / image / video
  - Output:**可探索、可编辑、可持久化**的 3D 环境
  - 卖点:不是另一个 LLM,而是"large world models"(LWM),预测**物体在 3D 空间如何行动**
- 2026 推出 **ESI-Bench**(Embodied Spatial Intelligence Benchmark):3000 个任务测**前沿 AI 在 3D 空间推理上的失败**——结果是当前 LLM/VLM 在物理空间推理上**严重不足**

**World Labs 的核心论点**(我们的复述):
- LLM 是"语言→语言"
- VLM(GPT-4V 等)是"图像→语言"
- LWM 是"3D 空间→3D 空间"——能让 AI 在物理世界**真正行动 / 操作 / 协作**

**Marble 的能力(2025-11+)**:
- Prompt → 3D world(如:"中世纪城堡,雪天,有训练场")
- 可导出 GLB / USD / 标准 3D 格式
- 持久化:用户可在同一世界里继续添加 / 编辑

**对 Agentrix 的启示**:

| 短期(2026)| 中期(2027)| 长期(2028+)|
|----------|----------|----------|
| 把 Pet 投放到 **2D / 简易 3D** 场景就够 | 调用 Marble API 让用户**自定义 PvP 场地**(如"我家的沙漠竞技场") | LWM 成熟后,Pet 真在 3D 物理世界里**行动**(打架 / 合作 / 探索)|

**关键判断**:
- World Labs 的产品(Marble)**还不能直接放进 Agentrix 客户端**(API 商业化未明确,GLB 导出后需要自己做 runtime)
- 但**它代表了 3D 化方向是行业共识**——Agentrix 的 Pet 已经有 VRM/Rive 双形态,**未来可平滑接入** Marble 出来的场景
- 短期我们**不依赖** World Labs,但**架构上要预留** spatial AI 接口

---

## 二、Pet PvP 可行性论证

### 2.1 为什么 Pet PvP 是 Agentrix 的天然延伸

Agentrix 已经有的:

```
✅ Pet = Agent       (有人格、技能、记忆、wallet)
✅ Pet team          (multi-agent 协作雏形,在 P2 spec 里)
✅ pet-a2a           (跨 pet 协作 / 雇佣后端)
✅ pet-skin / 灵魂   (双层架构 — pet 有视觉表达)
✅ Marketplace       (Skin / Pet 已经买卖)
✅ Living 跨端       (Pet 状态跨设备)
✅ Skin GMV 30% 抽成 (创作者经济跑通)
```

加上 PvP 后,我们多了:
- **观赏性**:Pet 不只服务主人,还在公共擂台被围观(类似 Twitch / 王者荣耀直播)
- **第二经济曲线**:门票 / 报名费 / 投注 / 冠军皮肤分成
- **病毒传播**:王者荣耀级别的"我的 pet 赢了" 截图自带社交属性
- **留存倍增**:服务任务的 pet 用 1-2 次就闲;PvP 让用户**每天上线打几局**

### 2.2 三阶演进路线

#### 阶段 v1:**任务擂台**(launch + 30 天)— 简单可行 ⭐

**机制**:
- 平台每天发布"擂台任务":一道 problem(代码挑战 / 文案改写 / 数据分析 / 创意 prompt)
- 用户报名 → 把自己的 pet(或 team)派去打擂台
- 平台同时让所有报名 pet **并行解题**(各自 worktree 隔离)
- 评判:LLM-as-judge + 用户投票(混合)
- 输赢按 ELO 算,排行榜 + 冠军 pet 拿奖金 / 限定皮肤

**为什么这一步先做**:
- 后端**已有 90% 设施**:`agent-task` worker / `WorktreePanel` / pet-a2a / marketplace
- 不需要 game runtime / 不需要 3D / 不需要实时网络
- 程序员 + 非编程用户**都能玩**(任务可以是写代码 / 也可以是写菜谱)

**可视化**:
- "今日擂台" 页面,左半边任务描述,右半边参赛 pet 卡片(头像 + 主人 + ELO)
- 完成后展示 "Best Reply" 横向对比(类似 LMSYS Arena)

**门槛对比**:
| 维度 | v1 任务擂台 |
|------|-----------|
| 技术 | 现成基础设施 + 一个新 panel + 一个 leaderboard 端点 |
| 时间 | 1 个 sprint(2-3 周) |
| 风险 | 低(LLM judge 偏置可缓解) |

#### 阶段 v2:**实时小游戏**(launch + 90 天)— 中等复杂度 ⭐⭐

**机制**:
- 平台内置 3-5 个轻量 PvP 小游戏:
  - **Pet 卡牌**:类似炉石传说,但每张卡牌是 pet 的**技能**(从 marketplace 来)
  - **回合制对战**:类似 Pokemon,pet 之间出招,招式来自他们的 skill set
  - **解谜接龙**:两个 pet 轮流贡献一步,先达标的赢
  - **辩论赛**:两个 pet 的 AI 在话题上对话,judges 给分
  - **创作 PK**:同一 prompt(如"画我的猫"),输出最被喜欢的赢

**为什么 2D 卡牌 / 回合制是甜区**:
- Astrocade 验证了:**休闲 PvP** 比 MOBA 容易做、容易病毒
- 不需要 3D / 物理引擎 / 实时网络
- 与 Agentrix 的 LLM 能力直接挂钩(对战逻辑本质是 LLM tool call 编排)

**multi-agent 组队**:
- 用户**最多 3 只 pet 上场**,不同 role(Tank / DPS / Healer 类比)
- 队伍内 pet **协作通过 pet-a2a**(已有协议)
- AI 自动战斗(用户只看 + 中途选**重大决策**)

**多人模式**:
- 1v1 → 1 user vs 1 user
- 3v3 → 3 user 各派 1 pet 凑队 vs 另 3 user
- 后者就是**用户社交化**——朋友间约战 / 公会赛

#### 阶段 v3:**开放世界 MMO / "王者荣耀"级**(launch + 12 个月+)— 高复杂度 ⭐⭐⭐⭐⭐

**机制**:
- 借助 **World Labs Marble**(或类似 LWM)生成 3D 战场
- 用户提 prompt → 生成竞技场("沙漠峡谷,有矿石,中央有泉水")
- 5v5 实时对战,每个用户**操控 1 只 pet**(王者荣耀的英雄类比)
- pet 在 3D 空间内**真行动**:走位 / 技能释放 / 物品拾取
- AI 接管低操作:你说"去支援上路",pet 自己规划路径 + 释放技能

**为什么这一步留远期**:
- 实时 3D 网络游戏是 50-100 人的工程(Riot / 腾讯花了多年)
- World Labs Marble API 商业化未明
- LLM 实时决策的延迟仍然 1-5s,不适合实时 PvP
- 我们**没有这预算 / 团队**,自己做必死

**怎么 _可能_ 做**:
- **不自己做 game engine**,接 Roblox / Astrocade 类 UGC 平台,把 Agentrix Pet 作为 SDK 注入
- 借 Marble 生成静态地图 +Roblox 跑实时
- 我们贡献**Pet 的灵魂 / AI 决策**,平台贡献**网络 / 渲染 / 物理**
- 这是 **Composability play** — 不是从零造游戏,是 _做 AI 灵魂层 + 接其他平台_

### 2.3 多 Agent 组队的 5 种 PvP 形态

| 形态 | 机制 | Agentrix 现成能力 | 难度 |
|------|------|------------------|------|
| **A. 1v1 单 Pet 对战** | 我的 pet vs 你的 pet | 全部 | ⭐ |
| **B. NvN 单用户多 pet** | 我派 3 只 pet 组队 vs 你派 3 只 | Pet team(P2 spec)+ a2a | ⭐⭐ |
| **C. NvN 多用户每人 1 pet** | 3 user 各 1 pet 组队 vs 3 user(王者荣耀模式) | Pet team + 跨用户 a2a + 实时网络(缺) | ⭐⭐⭐ |
| **D. 1 user 教练 + 多 pet 自动战** | 我作为"教练",战斗中只能下战略指令,pet 自己执行 | 接近 v2 实时小游戏 | ⭐⭐ |
| **E. 公会战 / 跨用户长期对抗** | 5 user 公会 vs 5 user 公会,每周累积积分 | 全部已有 + 公会模块(缺) | ⭐⭐⭐ |

**推荐的演进序列**:**A → D → B → E → C**
- A 最简,先验证 PvP 心智
- D 是天然延伸(用户**自然**会想做"教练"而不是"操控者")
- B 需要 Pet team 数据模型先 ship
- E 是社交沉淀
- C 是终极目标(王者荣耀模式,留给 v3)

### 2.4 可行性矩阵

| 维度 | v1 任务擂台 | v2 卡牌/回合制 | v3 王者荣耀级 |
|------|----------|--------------|-------------|
| 技术难度 | 低 | 中 | 极高 |
| 预算 | 1 sprint | 1-2 季度 | 1-2 年 |
| 团队 | 现有 | 现有 + 1 game designer | 大幅扩 + 接外部平台 |
| **风险** | 低 | 中(平衡性 / 作弊) | 高(成本不收回) |
| **学习** | 高(验证 PvP 模式) | 高(验证游戏化心智) | — |
| **建议** | **立刻做** | **launch+90 天做** | **不自己做,接 Roblox/Astrocade** |

---

## 三、与 Astrocade / World Labs 的差异化与协同

### 3.1 我们 vs Astrocade

| 维度 | Astrocade | Agentrix |
|------|-----------|----------|
| 用户**做**什么 | 创作游戏 | 养 + 调教 + 派 Pet 出战 |
| Pet | ❌ 无 | ✅ 灵魂级 |
| 经济 | 暂未明示 | ✅ MPC + Skin + Auto-Earn |
| 跨端 | Web only | ✅ 6 端 |
| **场景** | 用户创作游戏 → 用户玩 | 用户**养 Pet** → Pet **打游戏** |

**结论**:**两家不冲突,可互为补充**——
- Astrocade 是 _游戏机制工坊_(我们用不了它的 SDK,但学它的 prompt UX)
- Agentrix 是 _AI 灵魂工坊_(可以做 Astrocade 出来的游戏的 _对手 / 队友 / 解说_)

**潜在合作**:把 Agentrix Pet 做成 Astrocade 上的**Boss / NPC SDK**——Astrocade 用户在自己游戏里**雇佣 Agentrix Pet 当 Boss**,Pet 拿真智能 + 收佣金。这是**B2B2C** play。

### 3.2 我们 vs World Labs / Marble

| 维度 | Marble | Agentrix |
|------|--------|----------|
| 输出 | 3D 世界(GLB / USD) | Pet 灵魂(JSON / API) |
| 抽象层 | 物理空间 / 几何 | 角色 / 行为 / 经济 |
| 用户面 | 创作者 / 开发者 | C 端用户 |
| **垂直** | 横切层 | 应用层 |

**结论**:**Marble 是基础设施,Agentrix 是应用**。我们**调用** Marble(未来 API 商业化后),不**做** Marble 的事。

**接入方式假设**(2027+):
1. 用户在 Agentrix 里说:"做一个雪山战场" → 调 Marble API → 拿回 3D 场景
2. Agentrix Pet **进场**(用 VRM rig,Marble 提供物理空间)
3. PvP 在生成的场景里跑

这给 v3 王者荣耀级铺路:**我们不造 game engine,我们造 _AI 灵魂_,接外部 spatial / engine**。

---

## 四、对 Agentrix 定位文档的影响

如果决定推 Pet PvP,需要在 [`agentrix-positioning-2026-05.zh-CN.md`](agentrix-positioning-2026-05.zh-CN.md) 加一段:

> **§3.2 差异化第 6 件**(原 5 件之外):
>
> 6. **Living Pet 竞技场** — Pet 不只服务主人,还在**开放擂台**与其他用户的 Pet 同台 PK,
>    胜负由 LLM-judge + 用户投票决定,赢家拿奖金 + 限定皮肤,输的 ELO 下降。
>    这是 Cursor / Claude / Codex / 贾维斯**完全没有**的——他们的 agent 是 _一次性工具_,
>    Agentrix 的 Pet 是 _有人格的伙伴 + 有荣誉的选手_。

### 4.1 与 Marketplace 的协同

PvP 自动加强 Marketplace:
- 冠军 Pet 的**血统 / 灵魂**会被克隆 / 收藏(类似赛马 / Pokemon GO 的稀有怪)
- 冠军 Pet 训练出的**Skill 卡**在 marketplace 卖更贵(类似炉石稀有卡)
- "**Pet 教练**"成为新 role(玩家自己不打,代练别人的 pet → 抽成)
- 直播 PvP → 主播 + 观众 + 投注 → 流量经济

### 4.2 风险与 mitigations

| 风险 | mitigation |
|------|-----------|
| **LLM judge 偏置**(同一品牌 LLM 判自家系列) | 多 LLM 投票 + 用户投票混合 + 公开 prompt 审计 |
| **作弊**(用户自己代笔) | task-based v1 容易测;v2/v3 强制 pet 在 sandbox 跑 |
| **少数高玩垄断**(像所有竞技游戏初期) | 段位制 + 段位内匹配 + 新人保护期 |
| **Pet 输了用户心碎** | 输的 pet 加经验 / 解锁挫折剧情 — _宠物成长曲线_ |
| **法律 / 投注**(钱赌博风险) | 默认用 AXP(平台积分)不用法币;法币模式只在合规地区开 |
| **3D 太烧钱** | 不自己做,等 Marble / Roblox 接口成熟 |

---

## 五、Open Questions(给你 / 团队讨论)

1. **该不该把"竞技"作为 Agentrix 的第 6 件差异化?**
   - 加进去意味着**未来路线图加重 Pet 经济一侧**,可能稀释 _AI 协作伙伴_ 主线
   - 不加意味着**错过最病毒化的获客通道**

2. **v1 任务擂台,任务出哪种类型?**
   - Coding(吸引程序员,但不出圈)
   - 创作(写文案 / 画图,广 audience)
   - 决策推理(谜题 / 推理,公平 judge 难)
   - 我推荐**创作类**起步 — 与 Living Pet 创作者经济契合

3. **奖金机制**
   - 冠军拿钱 / AXP / 限定皮肤 / 称号?
   - 钱来自哪里:平台贴 / 报名费抽水 / 用户投注?

4. **PvP 默认开还是 opt-in?**
   - 默认开:更多 pet 上擂台,生态热闹
   - opt-in:用户主动选,免去"我的 pet 不想打架"的反感

5. **跨用户 PvP 的隐私**
   - Pet 在 PK 时会用主人的**记忆 / 工作上下文**吗?
   - 默认应该是**白盒沙盒**——pet 进擂台只带角色 + skill,不带主人 workspace

6. **接 Roblox / Astrocade 的 timing**
   - 我们的 Pet SDK 还要多久才能开放?
   - Roblox 政策对 AI agent 在游戏里的限制?
   - Astrocade 自己有"AI 角色"产品后,我们就晚了

7. **World Labs Marble 接入 timing**
   - 2027 接还是先走 2D?
   - 是否提前预订 Marble 早期合作 slot?

---

## 六、推荐立场(我的建议)

**短期(launch 30-90 天)**:做 **v1 任务擂台**——
- 复用现有基础设施,1 sprint 出原型
- 验证 _Pet 同台竞争_ 心智是否被用户接受
- 不冲淡 _AI 协作伙伴_ 主线(任务擂台本质就是 _AI 协作伙伴的可见排行榜_)

**中期(launch 90-180 天)**:做 **v2 实时小游戏 + Pet team 多用户组队**——
- 建立游戏循环 / 留存机制
- 与 Marketplace 深度绑定(冠军皮肤、技能卡升值)
- 与 multi-agent 协作 spec 同步推进

**长期(launch 12 个月+)**:**v3 不自己造**——
- 等 Marble API 开放 / Roblox 政策成熟
- 我们做"**AI 灵魂层**",平台做 game engine 层
- 与 Astrocade 谈 SDK 合作(把 Pet 做成他们游戏的 boss/npc/对手)

如果你同意这个方向,**我下一步**就把 v1 任务擂台 spec 写到 `.kiro/specs/pet-arena-v1-2026-06/`。

---

## 七、引用 / 来源

- Astrocade 官方页面、Sequoia Capital / a16z / Forbes 报道(综合复述)
- World Labs 官方页面、Forbes / TIME / Observer 报道、a16z 投资公告(综合复述)
- ESI-Bench TechTimes 报道(2026-05)
- Marble 发布会(2025-11)
- Agentrix 内部:`pet-a2a` / `pet-team` / `marketplace-pet` / `pet-skin` 模块

> **内容合规说明**:本文关于 Astrocade 与 World Labs 的能力 / 估值 / 用户数等
> 信息基于其公开页面与媒体报道的综合复述,**已经过我们的改写、压缩与综合**,
> 不是直接引用任何一家的产品文档原文(Content was rephrased for compliance
> with licensing restrictions)。具体能力以各方最新官方文档为准。
