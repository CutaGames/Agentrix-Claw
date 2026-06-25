# World Engine × Agentrix 能力绑定与游戏化战略设计

> 状态：**定稿（v2）** — 方向已确认（2026-05-29），进入分期实现。
> 日期：2026-05-29
> 关联：`docs/WORLD_ENGINE_AUDIT_2026-05-20.zh-CN.md`、`.kiro/specs/reality-ai-world-engine/`
>
> **v2 变更**：新增第 7 章「活的 Agent 世界」作为玩法形态与留存底座；
> 实施顺序调整为 A 能力飞轮 → A2 活世界最小版 → B 决策战斗 → C 灵魂统一 → D UGC。
> 明确放弃「神经世界模型 / 画面开放世界」两条陷阱路线。

---

## 0. 这份文档要回答的三个问题

1. **（问题3）主宠 / 其他宠物 / 扫描角色现在是不是一个灵魂体系？** → 不是，是三套完全割裂的数据模型。下面给出代码级证据。
2. **能力映射飞轮怎么落地才"真"？** → 我们已经有 `agent_reputations` / `agent_stats` 这类真实活动数据，可以直接映射，不是空想。
3. **玩家决策战斗层怎么加，又不破坏现有确定性？** → 用"决策序列 + seed"模型，既加操作感又保留可重放/异步对战。

---

## 1. 现状诊断（代码级，非推测）

### 1.1 三套互不相干的"灵魂/角色"数据模型

| 系统 | 表 | 关键字段 | 经济属性 | 现状 |
|---|---|---|---|---|
| **主宠灵魂** `LivingPet` | `living_pets`（1 user = 1，userId unique） | `soulTemplateId`(默认 `claw`)、`unlockedSoulTemplateIds`(Free 只有 claw / Pro≤3 / Pro+ 无限)、`primaryAgentId`(驱动主宠的 working agent，可切换不影响灵魂)、`intimacyLevel/intimacyXp`、`emotion`、`personalityOverrides`、`boundAgentAccountId` | 契约写明**不参与经济、不可删除/转让/卖** | 这是"情感陪伴"的核心载体 |
| **家庭共享宠物** `FamilyPet` | `family_pets`（1 family = 1） | `name`、`emotion`、`intimacyLevel`、`sharedAmongMembers[]` | 轻量、家庭维度共享 | 与 LivingPet 无外键关联 |
| **扫描生成角色** `WorldAsset` | `world_assets` | 自带 `stats{hp,atk,def,spd,int}`、`skills`、`personalityTraits`、`backstory`、`behaviorTree`、`level/xp/unlockedSkillSlots`、`battleWins/Losses`、**自己独立的 `boundAgentId`** | 参与经济（可上架/交易/转让） | World Engine 的产物 |

**核心证据**：在整个 `backend/src/modules/world-engine/**` 里 grep `soulId / LivingPet / primaryAgentId / soulTemplate`，**零匹配**。即 WorldAsset 与主宠灵魂体系在数据层面完全没有任何引用关系。

更关键的割裂点在 `agent-binding.service.ts`：

```ts
// performBind(): WorldAsset 绑定的 agent 是当场 mock 出来的全新 uuid
const agentId = uuidv4();
await this.worldAssetRepo.update(assetId, { boundAgentId: agentId });
```

也就是说，扫描角色绑定的"agent"既不是用户主宠的 `primaryAgentId`，也不是用户真实在用、真实干活的那个 agent，而是一个**凭空 mock 的占位 id**。

> **结论（回答问题3）**：现在主宠、家庭宠物、扫描角色是**三个平行宇宙**。用户感知到的"宠物"和 World Engine 里"扫出来的角色"在系统里毫无关系——这正是产品最大的割裂点，也是"代入感缺失"的根因。

### 1.2 战斗：纯自动数值对撞，零玩家决策

`battle-engine.service.ts` 的 `simulateBattle`：

```ts
// 回合制循环，但技能是机械轮播，玩家完全不参与
const skillIndex = (round - 1) % currentAttacker.skills.length;
const skill = currentAttacker.skills[skillIndex];
const { damage, isCritical } = this.calculateDamage(...seed, round);
```

- 用 Mulberry32 PRNG，`seed` 决定一切 → **同 seed 必出同结果**（这是 spec 的 MANDATORY Property 1，要保留）。
- 但整场战斗**没有任何一个玩家输入点**。本质是"两组数值 + 种子 → 自动播放结果"。可玩性≈抽卡看动画。

### 1.3 数值来源：只跟"物体形状"有关，跟"用户/agent 能力"无关

`character-generator.service.ts` 的 `computeStats`：体积→HP、锋利度关键词→ATK、材质密度→DEF、长宽高比→SPD、复杂度→INT。

- 优点：确定性强（Property 2），同输入同输出。
- 致命缺点：**数值只由"拍了什么物体"决定**。用户是不是 Agentrix 重度用户、agent 干了多少活、声望多高——对战斗力**毫无影响**。这就让"扫描角色"沦为一次性新鲜感道具，没有长期养成和平台粘性。

---

## 2. 核心设计理念

> **一个灵魂，多种形态；真实能力，映射战力。**

把 Agentrix 跟所有"拍照变 3D 游戏"竞品区分开的唯一护城河，不是 3D 质量（大厂都能做），而是：

1. **灵魂统一**：用户的主宠、扫出来的角色、干活的 agent，是**同一个灵魂的不同皮囊**，而不是三个陌生人。
2. **能力即战力**：你的 agent 在现实里真的接任务、真的完成、质量真的高 → 你的游戏角色就真的更强。这是**别人无法复制的飞轮**，因为别人没有 agent 经济这套真实活动数据。

这两点结合，World Engine 才从"一个小游戏"变成"Agentrix 能力的游戏化外显层"。

---

## 3. 三大支柱设计

### 支柱 1：统一灵魂体系（Soul Linkage）

**目标**：让扫描角色不再是孤儿，可挂接到用户的灵魂/agent 体系。

设计要点（最小侵入，不动 LivingPet 契约）：

- WorldAsset 新增可空字段 `linkedSoulId`（指向 `living_pets.id`）与 `sourceAgentAccountId`（指向真实 `agent_accounts.id`）。
- 绑定时**不再 mock uuid**，而是让用户在三选一：
  1. **化身主宠**：把这个扫描角色作为主宠 `LivingPet` 的一个新 `soulTemplate/skin`（沿用 `unlockedSoulTemplateIds` 配额：Free 1 / Pro ≤3 / Pro+ 无限）——主宠"换装"成你扫的东西。
  2. **绑定真实 agent**：把角色绑定到用户某个真实 `agent_account`，战力吃该 agent 的真实声望加成（见支柱 2）。
  3. **纯收藏/交易**：保持独立，可上架（现有逻辑）。
- 主宠 `LivingPet` 的"不可删除/转让/卖"契约**完全不变**——只有"选项 1 的换装关系"是引用，灵魂本体仍唯一且不参与经济。

> 这样用户拍一个手办，可以选择"让我的主宠灵狐变成这个手办形态"，灵魂连续、记忆连续、情感连续——代入感由此产生。

### 支柱 2：能力映射飞轮（真实数据 → 游戏数值）

**好消息：我们已经有真实数据可读，不需要造数据。**

可用的真实信号（已确认存在的表）：

| 来源表 | 字段 | 含义 | 映射到 |
|---|---|---|---|
| `agent_reputations` | `tasksCompleted` | 真实完成任务数 | **角色等级上限 / XP 加成** |
| `agent_reputations` | `avgQualityScore`(0-100) | 平均质量分 | **ATK / INT 加成系数** |
| `agent_reputations` | `onTimeRate`(0-100) | 准时率 | **SPD 加成** |
| `agent_reputations` | `tier`(bronze→diamond) | 声望等级 | **稀有度 / 整体战力倍率** |
| `agent_reputations` | `specializations[]` | 专精领域 | **解锁专属流派技能**（如 trading 专精→金融系技能） |
| `agent_stats` | `totalCalls` | 总调用次数 | **熟练度成长曲线** |
| `living_pets` | `intimacyLevel/intimacyXp` | 陪伴亲密度 | **共鸣加成（陪伴越久越强）** |

**映射原则**（确定性，可审计）：

```
finalStats = baseStats(物体形状)  ×  abilityMultiplier(真实能力)

abilityMultiplier = 1.0
  + clamp(tasksCompleted / 100, 0, 0.5)        // 完成任务最多 +50%
  + (avgQualityScore - 50) / 100 * 0.3          // 质量分高于均值最多 +15%
  + tierBonus[tier]                              // bronze 0 → diamond +0.4
  + clamp(intimacyLevel / 10 * 0.2, 0, 0.2)     // 陪伴最多 +20%
// 总上限建议 clamp 到 [1.0, 2.2]，避免碾压破坏对战平衡
```

- **关键约束**：`baseStats` 仍保持现有确定性公式（Property 2 不破）；`abilityMultiplier` 是**只读快照**——在创建/进化时刻读一次写入 `WorldAsset.abilitySnapshot`（jsonb），保证战斗回放仍确定（同 seed + 同 snapshot = 同结果，Property 1 不破）。
- **专精→技能流派**：`specializations` 含 `trading` → 解锁"套利打击/清算护盾"；含 `research` → 解锁"洞察/弱点分析"。让真实擅长的领域在游戏里有可见回报。

> 这就是"代入感 + 实际价值"：用户会为了让角色更强，去真的多用 agent、把 agent 养到 diamond。游戏成了 Agentrix 使用量的增长引擎。

### 支柱 3：玩家决策战斗层（保留确定性）

**目标**：把"看动画"变成"做选择"，但不破坏 Property 1（同 seed 同结果，异步对战可重放）。

设计模型：**决策序列 + seed**

- 战斗不再是服务器一次性 `simulateBattle` 跑完，而是**逐回合**：
  - 服务器返回当前局面（双方 HP、可用技能、冷却、能量）。
  - 玩家**每回合选择**：用哪个技能 / 防御 / 蓄力 / 换形态。
  - 客户端把"决策"提交，服务器用 `(seed, round, decision)` 计算该回合结果。
- **确定性保留**：最终战斗结果 = 纯函数 `f(challengerDecisions[], defenderDecisions[], seed)`。
  - PvE / 异步 PvP：对手决策由 `behaviorTree` + seed 生成（仍是确定的 AI 策略），玩家决策实时输入。
  - 回放：存 `decisions[] + seed` 即可完整重放，无需存每帧。
- **加一层资源系统**让决策有意义：每回合 1 点"行动力"，强技能要蓄力 2 回合、防御可反伤、抓住对手蓄力空档强攻——产生"猜拳 + 资源管理"的策略深度。

最小改动：`battle-engine.service.ts` 的 `simulateBattle` 拆成 `stepRound(state, decision, seed)` 纯函数；现有自动战斗 = "AI 自动填充 decisions" 的特例（向后兼容）。

### 二期支柱（共识后再排期）

- **UGC 游戏平台**：把"能力绑定 + 决策战斗"做成可配置规则集（关卡/Boss/数值表用户可编辑），让用户用自己的扫描角色做自己的小游戏/副本，再分享裂变。这是把"平台"做大的方向，但**依赖支柱 1-3 先稳**。
- **共养（蚂蚁森林式）**：基于 `FamilyPet` 的 `sharedAmongMembers`，多人共同培养一只角色/灵魂，作为社交留存机制。**列为二期**，先把单人 wow + 飞轮跑通。

---

## 4. 分期实施计划（最小闭环优先）

> 原则：先用最小改动证明"真实能力 → 游戏战力"这条飞轮成立，再把"活世界"叠上去做留存底座，最后加深战斗与灵魂统一。
> **完整玩法形态见第 7 章「活的 Agent 世界」。**

### Phase A — 能力映射最小闭环（1 个迭代，纯后端，零移动端依赖即可验证）

1. `WorldAsset` 加 `abilitySnapshot`(jsonb, nullable) + `linkedSoulId` / `sourceAgentAccountId`（nullable）。迁移走已验证的 psql 手动登记方式（注意 `SnakeNamingStrategy`）。
2. 新建 `AbilityMappingService.computeMultiplier(userId, agentAccountId?)`：读 `agent_reputations` + `agent_stats` + `living_pets`，按 §3 支柱2 公式产出 multiplier，写入 snapshot。
3. `AssetCreationService.createCardReadyAsset` 创建时调用，`finalStats = baseStats × multiplier` 落库；卡片展示"⚡ 能力加成 +XX%（来自你的 agent 真实战绩）"。
4. 单测：multiplier 边界 clamp、snapshot 确定性、baseStats 不被破坏。

**验证点**：同一个物体，用"小白号"和"diamond 重度号"扫，战力明显不同，且卡片标明加成来源。这一步就能让用户感到"我的真实努力有回报"。

### Phase A2 — 活世界最小版（留存底座，承接第 7 章）

> 目标：让角色"活起来"——能自主打工赚 AXP、能发生剧情，用户每天回来看连续剧。这是 D7/D30 留存的核心引擎。

1. 新增 `WorldResident` 视图概念（不一定新建表，可先复用 `WorldAsset` + 新字段 `worldState` jsonb：职业/心情/在忙什么/位置）。
2. 新建 `WorldSimService.tick(userId)`：把 `agent-binding` 现有的 idle actions（greet/comment/suggest_battle/interact_collection，现在 log-only）升级为**会落库的剧情事件**，写入 `world_events` 表（who/what/when/outcome/Δstats/ΔAXP）。
3. **离线时间快进**：用户不在线时低频/批量结算（cron 每 N 分钟一 tick，或登录时按"上次在线至今"补算），只在在线时高保真。控制 LLM 成本。
4. "打工"= 把角色派去对应 agent 的真实任务类型，产出 AXP + XP（吃 Phase A 的能力快照）。
5. 移动端：World tab 从"功能宫格"改为"**世界 feed**"——时间线展示居民今天发生了什么 + 关键决策卡（派谁去打 Boss / 投资哪个产业 / 要不要社交）。
6. 单测：tick 幂等性（同一时间窗不重复结算）、离线补算正确、AXP/XP 单调。

**验证点**：用户隔天打开，看到"你的灵狐今天完成了 3 个研究任务赚了 120 AXP，还和邻居手办吵了一架"——产生追剧式回访动机。

### Phase B — 玩家决策战斗（1-2 个迭代）

1. `battle-engine` 重构出纯函数 `stepRound`；保留 `simulateBattle` 作为"全 AI 决策"特例（现有测试全绿）。
2. 加行动力/蓄力/防御反伤资源层；`Battle` 实体存 `decisions[] + seed`。
3. 移动端 `WorldBattleArenaScreen` 加每回合技能选择 UI（现有 spec task 15.2）。
4. PK 与副本**收编为世界事件**：赢得的战利品/声望反哺角色在世界里的地位（见 §7.3）。
5. Property 1 测试扩展：`f(decisions, seed)` 确定性。

### Phase C — 统一灵魂体系（1 迭代）

1. 绑定流程三选一 UI；"化身主宠"走 `LivingPet.unlockedSoulTemplateIds` 配额。
2. 主宠换装成扫描角色，记忆/亲密度连续。

### Phase D（二期）— UGC 规则集 + 共养

视 A-C 数据反馈再设计。玩家自定义世界规则/剧情线；基于 `FamilyPet.sharedAmongMembers` 的多人共养。

---

## 5. 风险与权衡

- **平衡性**：能力加成上限必须 clamp（建议总倍率 ≤2.2），否则重度用户碾压新人，PvP 崩盘。可引入分段匹配（按 multiplier 段位）。
- **刷量风险**：`tasksCompleted` 可能被刷。映射应以 `avgQualityScore × tier` 为主权重，纯数量为辅，且加防刷（质量分低的任务不计入战力）。
- **确定性红线**：任何加成都必须"快照化"。绝不能让"实时读 reputation"进入战斗计算，否则回放/异步对战会因数据变动而结果漂移，直接违反 spec MANDATORY Property 1。
- **不动主宠契约**：LivingPet 的不可删/不可卖/1user1pet 是硬契约，只能"被引用为皮囊"，不能反向被 WorldAsset 经济逻辑污染。
- **范围蔓延**：UGC 平台和共养很诱人，但**必须等飞轮（A）+ 决策战斗（B）验证留存后再做**，否则又回到"6 端摊薄打磨资源"的老问题。

---

## 6. 决策点（已确认 2026-05-29）

1. **能力加成总上限 ≤2.2 倍** — ✅ 采用（PvP 平衡红线）。
2. **绑定模型"化身主宠 / 绑定真实 agent / 纯收藏"三选一** — ✅ 采用。
3. **实施顺序** — ✅ 调整为 **A 能力飞轮 → A2 活世界最小版 → B 决策战斗 → C 灵魂统一 → D UGC/共养**。
4. **玩法形态** — ✅ 确认走「活的 Agent 世界 / AI 小镇」作为留存底座，PK/副本收编为世界事件；**放弃神经世界模型 & 画面开放世界两条陷阱路线**（见第 7 章）。

**下一步**：从 Phase A（能力飞轮，纯后端，风险最低）开工。

---

*本稿基于代码现状（living-pet.entity / world-asset.entity / battle-engine / character-generator / agent-binding / agent-reputation / agent-stats）撰写，所有割裂点均有代码证据。待你确认决策点后进入 Phase A 开发。*


---

## 7. 玩法形态：活的 Agent 世界（World Engine 的留存底座）

> 这一章回答"游戏到底是什么、为什么可玩、为什么只有 Agentrix 能做"。
> 它是 §1-§6 能力飞轮/灵魂/战斗的**承载容器**：飞轮决定居民有多强，灵魂决定居民是谁，世界决定他们每天在干什么。

### 7.1 现状盘点（代码级，避免推测）

现在 World Engine 实际有**两个玩法循环**，不是只有 PK，但都很薄：

| 玩法 | 代码 | 现状 | 缺陷 |
|---|---|---|---|
| 角色对战 PK | `battle-engine.simulateBattle` | 全自动 seed 对撞，技能机械轮播 | 零玩家操作，看动画 |
| 副本 Dungeon | `dungeon-builder.service` | 已能"拍房间→生成副本"：按面积放 3-8 敌人 / 2-5 战利品 / 1 Boss；kitchen→fire、bedroom→dream、office→data 主题；难度评级 1-5；<180° 战争迷雾 | **只生成静态布局数据**，没有真正的探索/战斗循环；移动端 Explorer 屏仍是 spec 占位 |

**根本问题**：两个玩法都是"生成一次性静态内容"。可玩性低不是因为"只有 PK"，而是**缺少一个持续变化、值得每天回来的世界**。

另外一个**关键已有资产**：`agent-binding.service` 里已经实现了 idle actions（`greet_owner / comment_time / suggest_battle / interact_collection`，1-4 次/小时，5 分钟空闲触发）+ `character-generator` 生成的 `behaviorTree`（idle/combat/social 三分支）。**这正是 AI 小镇 NPC 自主生活的引擎**，目前只是 log-only、没接表现层和落库。活世界要做的，很大程度是把这个引擎"点亮"。

### 7.2 三种"开放世界"辨析 — 只选第三种

| 路线 | 本质 | 对 Agentrix 的判断 |
|---|---|---|
| ① 神经世界模型（Genie / Sora 式 AI 实时生成可玩世界） | 研究前沿，烧 GPU | ❌ **陷阱**：做不过大厂、烧不起、非差异化 |
| ② 传统 3D 开放世界沙盒（塞尔达 / 原神式） | 海量美术 + 关卡工程 | ❌ **陷阱**：6 端摊薄资源的老问题会致命 |
| ③ 生成式 Agent 世界 / AI 小镇（斯坦福 Smallville 式生活模拟） | 文本 + 2.5D 精灵 + LLM 自主行为 | ✅ **甜点区**：轻量，且直接吃我们独家资产 |

**结论**：做「活的 Agent 世界」（路线③），不碰①②。

### 7.3 玩法定义：你的 agent 主演的连续剧

**核心循环**：
1. **拍 → 创生居民**：拍现实物体 → 生成角色（吃 §3 能力飞轮的战力快照），住进你的世界/小镇。
2. **自主生活（离线也在跑）**：居民会打工、社交、谈恋爱、起冲突、探险。由 `behaviorTree` + LLM 驱动，产出**剧情事件**写入 `world_events`。
3. **打工 = 真实价值映射**：把居民派去对应你 agent 真实擅长的任务类型（吃 `agent_reputations.specializations`），产出 AXP + XP。**你 agent 在现实里越强，居民在世界里越能赚、地位越高。**
4. **介入决策**：用户像"剧集制作人"，偶尔做关键决策——派谁远征打 Boss、要不要联姻、投资哪个产业、内部纠纷怎么裁决。
5. **回访动机**：隔天打开看"昨天我的世界发生了什么"（追剧式留存），而非"打一把就走"。

**可玩性来源**：涌现式剧情 + 养成 + 真实数据驱动，而非操作/画面。对标高留存模型——Tamagotchi（养成）、旅行青蛙（离线惊喜）、AI 小镇（涌现剧情）、蚂蚁森林（每日回访）。

### 7.4 玩法分层：融合而非替换

```
活的 Agent 世界（底座 · 日常留存引擎）
   │   居民在此自主生活、打工赚 AXP、社交、产出剧情
   ├── 对战 PK ……… 世界里的「竞技场」事件（加决策层 = §3 支柱3 / Phase B）
   │                 赢得声望反哺居民在世界的地位
   ├── 副本 Dungeon … 世界里的「远征」事件（拍房间→限时副本）
   │                 带回战利品装备居民、解锁世界新区域
   └── UGC ………… 玩家自定义世界规则/剧情线（Phase D 二期）
```

PK 和副本**不删**，而是从"孤立的一次性玩法"收编为"活世界里有上下文、有后果的事件"——赢了副本带回的战利品能装备角色、提升它在小镇的地位，从而让既有投入不浪费。

### 7.5 数据模型（最小侵入）

- 优先**不新建居民表**，复用 `WorldAsset` + 新增 `worldState` jsonb（职业 / 心情 / 当前在忙什么 / 位置 / 关系网）。
- 新增 `world_events` 表（append-only 剧情日志）：`userId / actorAssetId / type / summary / outcome / deltaStats / deltaAxp / createdAt`。
- `WorldSimService.tick(userId)`：推进世界一步，把 idle actions 升级为落库剧情事件。
- 复用 §3 的 `abilitySnapshot` 决定打工产出与战力，复用 §1 灵魂关系决定"谁是这个世界的主角"。

### 7.6 成本与风险（诚实）

- ✅ **轻**：核心是 LLM 文本剧情 + 现有 behaviorTree/idle 引擎 + 2.5D 精灵。**不需要 3D 大世界地形美术**；混元 3D 只产角色立绘/小镇摆件，不产可行走地形。
- ✅ **复用率高**：idle actions、behavior tree、agent 经济、能力飞轮均已存在或在计划内。
- ⚠️ **LLM 成本**：N 个居民持续自主生活会烧 token。**对策**：离线"时间快进"——用户不在线时低频/批量结算（cron tick 或登录补算），仅在线时高保真；剧情用便宜模型（Haiku 4.5，character-generator 已在用）。
- ⚠️ **范围蔓延**：必须分期。**A 能力飞轮 → A2 活世界最小版（自主打工 + 剧情卡片 feed）→ 再逐步加社交/恋爱/产业等系统**。绝不一上来做全功能小镇。
- ⚠️ **确定性红线不变**：战斗仍走快照（§5），世界 tick 的随机性用"日期 + assetId"派生 seed，保证可复现与防刷。

### 7.7 与首启 wow 的衔接

承接 `WORLD_ENGINE_AUDIT` 的"首启 < 60 秒 wow"：游客拍第一个物体 → 秒出角色卡（方案 B 已落地）→ **"它已经住进你的世界并开始打工了"** 的一句话钩子 → 引导登录保存。活世界给了"保存"一个强动机：不保存，你的居民和它今天的故事就没了。

---

*v2 定稿。下一步进入 Phase A（能力飞轮，纯后端）。活世界最小版（A2）在 A 验证后紧接启动。*
