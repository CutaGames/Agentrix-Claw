# 游戏 / 竞技 / PvP 全盘点(2026-05-25)

> 作者:Dev Agent
> 触发:用户问 "spec 冲突吗 + 移动端有什么游戏"
> 关联:`MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md` ·
>   `PET_PVP_AND_SPATIAL_AI_2026-05-24.zh-CN.md` ·
>   `WORLD_ENGINE_AUDIT_2026-05-20.zh-CN.md`

---

## TL;DR(2 段答完)

1. **`MULTI_AGENT_RESEARCH` 和 `PET_PVP_AND_SPATIAL_AI` 不需要变两个独立 spec
   并行做**。它们大部分是同一个东西(都建在 Pet Team / pet-a2a / Agent
   Team 之上),应该**合并成一个 spec — `pet-arena-and-team-2026-06`**,以
   "Pet Team 数据模型"为基础,把 PvP / Arena / Multi-agent collaboration
   都当作 team 的不同 use case。这个 spec **不会和 reality-ai-world-engine
   spec 冲突**,因为 World Engine 已经独立实现了"Battle / Dungeon / Asset
   PK"那条线 — 我们要做的是 **"用户的 Pet"层** 和 **"用户的现实物体角色"
   层** 之间打通。
2. **移动端目前已有 / 已实现的游戏 + 玩法共 9 个,远超你的印象**(下文 §2
   有完整清单)。其中"世界资产 PK / 副本"在 World Engine 里已经 90%
   ship,只是没在 Plaza 里被显著暴露。**真正缺的不是"造游戏",是"游戏总
   览页"和"统一入口"**。

---

## 1. 当前 spec 状态(只看正在或将要做的)

| spec 目录 | 用途 | 当前状态 | 与 PvP / multi-agent 的关系 |
|-----------|-----|---------|---------------------------|
| `reality-ai-world-engine/` | 现实物体扫描 → 3D 资产 → 战斗 / 副本 / 交易 | **核心 Phase 1 已 ship**,4 个 mobile 屏 + 28 backend 文件 + 5 张表 + 14 个服务 + Property 1/4/5/7 PBT 全 PASS。剩 prod secrets / mobile mirror push / 灰度发布 | **基本上就是"现实物体 PK"** — 已经覆盖 PvP feasibility 文档里 v1 的一半 |
| `mobile-pet-companion-redesign/` | 移动端 Pet Companion UI | 已 ship(P9 final summary),companion ball / lock-screen pet / handoff banner 全在 | 提供了 PvP / Arena 的 UI 触发位(浮球收挑战通知,锁屏提示) |
| `mobile-pet-companion-upgrade/` | Pet companion 升级 | 历史 spec,已合入 redesign | — |
| `pro-mode-coding-views-2026-05/` | 桌面 Pro Mode F1-F3 | 5/16 任务 done,F1/F2/F3 路上,velocity window 内 | 不冲突,完全独立 |
| `desktop-go-live/` / `desktop-ga-internal-beta/` | 桌面 launch 准备 | 历史 ship | — |
| `marketplace-ecosystem/` | 经济闭环 | 已 ship | Arena 复用其 escrow / pricing |
| `creator-studio-mvp/` | 桌面 creator | 已 ship | — |
| `positioning-revision-2026-05/` | 定位文档双人群修订 | 进行中(13/13 PASS),需考虑要不要纳入 §3.2 第 6 项"Pet Arena" | 决定 PvP 是否上升为正式差异化 |

**关键观察**:`reality-ai-world-engine` spec 已经把 *Battle / Dungeon /
Asset 经济* 全部覆盖。它的"Battle"就是 1v1 PvP MVP,我们其实已经有 PvP
v1 的 70% 代码。

---

## 2. 移动端已有 / 已部署的"游戏"清单(共 9 个)

按"是 PvP / 单人玩 / 经济玩"3 个角度盘点。**截图 / Maestro 验证状态见
"Mobile Audit 2026-05-16"。**

### 2.1 World Engine — 现实物体大冒险 (4 屏完整链路)
> 入口:Pet Tab → "🌍 世界扫描" / "🎒 世界资产" 卡片
> 状态:Phase 1 已 ship(待 prod secrets + 灰度)

| 屏幕 | 玩法 | 状态 |
|------|-----|------|
| **WorldEngineScannerScreen** | 拍现实物体 → 3D 重建 → AI 解读 → 角色 / 副本 / 资产 3 选 1。Quick Scan 1-3 张 / 15 秒,Detail Scan 8 张 / 90 秒,Room Scan 360°(全景副本)。三层 Quality Gate 实时打分 | UI 100%,需 prod 3D Provider key |
| **WorldAssetInventoryScreen** | 库存网格(2 列),长按菜单:重命名 / 重生 / 绑定 Agent / 上架 / 赠送 / 删除。卡显示战绩 / 等级 / 集合徽章 | 100% |
| **WorldBattleArenaScreen** | **1v1 PvP**,挑战者 vs 防御者,turn-based 20 回合,确定性战斗(seed)+ HP 条动画 + damage popup + MVP skill 结算 + XP 奖励(winner 30-100 / loser 10-40)。15 秒回放视频可分享 | 95%,API 已对接,真机回放视频 stub |
| **WorldDungeonExplorerScreen** | **Dungeon attempt** — 6-12 位分享码进入别人房间生成的副本,fog-of-war 探索,enemy / loot / boss 配置;支持自己房间扫描后生成 | 90%,API 已对接 |
| **WorldBattlePickerScreen** | 选择挑战者 / 防御者 → 跳转 Arena | 100% |

**已实现的玩法**(全在 `backend/src/modules/world-engine/`):
- 异步挑战(72h 过期),分享链接 `agentrix://world-engine/battle/{id}`
- 战斗 ELO 雏形(battleWins / battleLosses / xp 三字段)
- Marketplace 集成("Battle-Proven" badge:>10 战 + >70% 胜率自动推送)
- 跨用户深度链接 → mobile companion ball 闪 + lock-screen pet 提示

### 2.2 Plaza · 宠物模仿秀(G1 Photo Mimic Season)
> 入口:Plaza → Feed → "📸 宠物模仿秀 · 每周赛季"
> 状态:已 ship(`backend/src/modules/photo-mimic/`)

**玩法**:每周一个主题(比如"穿越赛博朋克的胖橘"),用户拍照 + AI 生成
新形态 → 提交 → 投票阶段每天 N 票 → 周日结算,top X 分奖金池(AXP + 限定
皮肤 + 称号)。

| 阶段 | 时长 | 用户做什么 |
|-----|------|----------|
| Submitting | 3-5 天 | 拍照 / 选 pet / 写 caption,首次提交 +30 AXP |
| Voting | 2-3 天 | 每天 N 票,投票得 +5 AXP |
| Settle | 1 天 | 排名结算,top 10% 分奖金池 |

**这本质上是"创意 PvP / 内容 PvP"** — Photo Mimic 已经在 mobile 上跑了。

### 2.3 Plaza · 宠物拍卖(PetAuction Sprint G #17)
> 入口:Plaza → Pets → "🏆 宠物拍卖"
> 状态:已 ship

**玩法**:
- 用户列出整只 pet 拍卖(灵魂 + 皮肤 + 战绩 + 成就一起卖)
- 起拍价 / 当前出价 / 剩余时间显示
- L2+ 金额(>100 USD)需要 Mobile Trust 3 证明
- 血脉稀有度(common / rare / epic / legendary)影响估值
- bid_count / 倒计时 5 分钟自动延长(防 snipping)

**这是经济类 PvP**(出价 vs 出价)。

### 2.4 Plaza · 皮肤拍卖(SkinAuction)
> 状态:已 ship

类似 §2.3,但只卖皮肤(不带灵魂)。比 pet 拍卖低门槛高频次。

### 2.5 Plaza · 共养 Pet(Co-raising / Greeting Card)
> 入口:Plaza → Play → 共养
> 状态:已 ship,P9 redesign 完成

**玩法**:多用户共同养一只 pet,贡献养成度,共享成长奖励;贺卡是社交触
发器 — 一只 pet 给另一只 pet 发节日卡片,双方都涨 intimacy_xp。

### 2.6 Plaza · 宠物迷你游戏(PetMinigame Phase 6 S5)
> Backend:`backend/src/modules/pet-minigame/`
> Mobile entry:`Plaza → Play → 小游戏`(占位,UI 是 Sprint B6)

**已有 API**:
- `GET /v1/pet/minigames/leaderboard?game_key=` 排行榜
- `GET /v1/pet/minigames/history` 历史
- `POST /v1/pet/minigames/submit { game_key, score }` 提交分

**问题**:**Backend ship 了,UI 没接,玩法未定**。这是 PvP feasibility
v2 文档说的"实时小型 PvP"的 backend 容器,但没人填 game_key。建议 v2
sprint 直接拿这个模块当卡牌 / 跑酷 / 谁画得快的承载层。

### 2.7 Plaza · Prediction Market(预测市场)
> Backend:`backend/src/modules/prediction-market/`
> 状态:Backend ship,Mobile UI 是 placeholder

**玩法**(规划):用户对"哪只 pet 会赢""哪个事件会发生"下注;agent 也
能下注。这是 "**用户 vs 用户的预测 PvP**"。

### 2.8 Pet Auction L2 — Sovereign / Bloodline 进化
> Backend:`backend/src/modules/pet-sovereign/` + `pet-breeding/` + `pet-soul-template/`
> 状态:Backend ship

**玩法**:配种生新 pet(soul 杂交),进化路径 sovereign 觉醒。这是"宠物
成长 PvP" — 谁的血脉更强谁的市场价更高。

### 2.9 Pet Greeting / 长记忆社交
> Backend:`pet-greeting` + `pet-memory-album` + `pet-coraising`
> 状态:已 ship

不是严格的 PvP,但是 social / 社交触发(给别人 pet 发卡 → 别人回卡 →
intimacy 涨 → 长期关系沉淀)。

---

## 3. 后端基础设施 — 你以为没有,其实都已经在了

| 模块 | 路径 | 用途 | 当前状态 |
|------|-----|------|---------|
| **pet-team** | `backend/src/modules/pet-team/` | 多宠物组队,Leader + Member 角色 + 预算 + scope | controller + service + spec test 已 ship |
| **agent-team** | `backend/src/modules/agent-team/` | Agent 团队模板 + provision(参考腾讯贾维斯) | ship,有模板系统 |
| **pet-a2a** | `backend/src/modules/pet-a2a/` | Pet 之间 dispatch / escrow 协议 | ship,backed by entity |
| **pet-energy** | `backend/src/modules/pet-energy/` | 能量管理 + 风控 + LLM usage 追踪 | ship |
| **pet-minigame** | `backend/src/modules/pet-minigame/` | leaderboard / submit / history | ship,**等 UI 接** |
| **photo-mimic** | `backend/src/modules/photo-mimic/` | 宠物模仿秀赛季 | ship |
| **prediction-market** | `backend/src/modules/prediction-market/` | 预测下注 | ship,**等 UI 接** |
| **agent-task** | `backend/src/modules/agent-task/` | 长任务 worker(Bedrock 集成) | ship — **PvP v1 Task Arena 直接复用** |
| **a2a-matching** | `backend/src/modules/a2a-matching/` | 跨用户 a2a 匹配引擎 | ship |
| **marketplace-pet** | `backend/src/modules/marketplace-pet/` | Pet 经济(整只 / 皮肤 / 灵魂) | ship |
| **world-engine.battle** | `backend/src/modules/world-engine/controllers/battle.controller.ts` | 1v1 PvP 完整 API | **ship**,简洁干净的 5 个 endpoint |
| **world-engine.dungeon** | `backend/src/modules/world-engine/controllers/dungeon.controller.ts` | 副本生成 / 加载 / attempt | ship |

**结论**:**multi-agent research 文档 P0 说"要建 pet_team 数据模型"** —
**已经建好了**。**PvP feasibility 文档说"v1 Task Arena 90% 复用"** — **这
90% 已经在了**。

---

## 4. 关键认知矫正(对照之前两份文档)

### 4.1 multi-agent-collaboration spec 不需要从零开 P0

之前 `MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md` 建议:

> **MVP(P0)— Pet Team 数据模型**
> entity:`pet_team`(team_id, owner_id, leader_pet_id, member_pet_ids[], roles)
> entity:`team_task`(task_id, team_id, title, prompt, plan[], assignments[]:Map<role,pet_id>, status)

但 `pet-team/pet-team.service.ts` 已经实现了 LivingPet leader + member
+ role + scope + daily_budget,完整可用。我们 spec 应该跳过 P0,直接做
**P1 — sub-agent UI 可视化** + **P2 — Pet member 接 sub-task**。

### 4.2 pet-arena spec 不需要"建 arena_round / arena_entry entity"

之前 `PET_PVP_AND_SPATIAL_AI_2026-05-24.zh-CN.md` v1 说:

> 新建(只 3 件事):
> - `arena_round` entity
> - `arena_entry` entity
> - `ArenaPanel.tsx` desktop 入口

但 `world-engine.battle` 的 Battle entity 已经有 challenger / defender /
seed / rounds / xpAwarded / status 全套字段。**我们应该把"Task Arena"
看作 Battle 的一种 mode,而不是新表**:加 `Battle.mode = 'task' | 'duel'
| 'tournament'` 字段就行。

### 4.3 reality-ai-world-engine 把"现实物体 PK"和"宠物 PK"是分开的两套

| | reality-ai-world-engine | pet 系列模块 |
|--|------------------------|---------|
| 主体 | WorldAsset(扫现实物体生成) | LivingPet(soul template + skin) |
| 战斗 | Battle entity(Mulberry32 PRNG) | 没有 1v1 战斗,只有 minigame leaderboard |
| 入口 | Pet Tab → 世界扫描 | Plaza / Companion ball |
| 经济 | world-engine.marketplace(单独) | marketplace-pet(单独)|

**它们没有合并 PK**(我的现实物体角色 vs 你的 LivingPet),这是一个**真
实的 gap** — 也是 PvP feasibility v1 真正应该做的事。

---

## 5. 三份文档的合并 / 拆分建议

### 5.1 **不要**开两个独立 spec

如果按之前 PvP doc 末尾那一句"两个 spec 并行写"做,会出现:
- pet-arena spec 里造 arena_round / arena_entry — 和 world-engine.battle 重复
- multi-agent spec 里造 pet_team — 和现有 pet-team 模块重复
- 两个 spec 各做 ArenaPanel.tsx,UI 设计割裂

### 5.2 **应该**合并成一个 spec:`pet-arena-and-team-2026-06`

**结构(草案)**:

```
.kiro/specs/pet-arena-and-team-2026-06/
├── requirements.md
│   R1. Pet Team 可视化(已有 backend,补 desktop + mobile UI)
│   R2. Cross-asset PK(LivingPet 和 WorldAsset 互通战斗)
│   R3. Task Arena(同一题多队竞速,LLM-judge + 社区投票)
│   R4. Real-time Mini PvP(填 pet-minigame 的具体玩法)
│   R5. Pet 在 Arena 里的策略可调(Pro Mode 编辑 prompt)
│   R6. 跨用户 Pet 团队战(用 pet-a2a 协议)
│   R7. 隐私 / opt-in / 公平性 / 反外挂
├── design.md
│   §1. 复用现有 pet-team / world-engine.battle / pet-minigame / a2a-matching 模块的依赖图
│   §2. Battle.mode 扩展(duel | task | tournament | arena_room)
│   §3. UI:Plaza Play 段加 "Arena" 入口,Pet Tab 加 "战绩" 段
│   §4. Pet vs WorldAsset 跨域战斗(stats 桥接)
│   §5. 公平性 — tier router 强制裁判同 tier
└── tasks.md
    Wave 1:UI 暴露(Plaza Arena 入口 / Pet Tab 战绩)— 1 sprint
    Wave 2:Battle.mode 扩展 + LivingPet 接入战斗 — 1 sprint
    Wave 3:Task Arena LLM-judge 闭环 — 1 sprint
    Wave 4:Mini PvP 填 pet-minigame(2-3 款游戏)— 2 sprint
    Wave 5:跨用户 Team Battle — 2 sprint(post-launch)
    Wave 6:外接 Astrocade / Roblox 评估 — research only
```

**预计**:Wave 1-3 在 launch+30-90 天可以全 ship,**因为 80% 是 UI / 数
据接线,backend 早就在了**。

### 5.3 文档归档建议

- `MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md` → 保留作为**调研背景**(进
  spec design.md §0)
- `PET_PVP_AND_SPATIAL_AI_2026-05-24.zh-CN.md` → 保留作为**调研背景**(进
  spec design.md §0)
- 本 `GAMES_INVENTORY_2026-05-25.zh-CN.md` → spec 启动后归档为
  `assumptions.md` 入参

---

## 6. 缺口 / 真正需要补的 UI

按"用户用桌面 / 用户用移动 / 用户用浮球"分:

### 6.1 移动端(优先级最高 — 玩法都在,入口分散)

- ❌ **Plaza → Play 段**:目前是 placeholder,B6 sprint 才填。**应该现
  在就接 PetMinigame + PetAuction + PhotoMimic + 预测市场入口**(8 张卡)。
- ❌ **首页 / Pet Hub**:World Engine Battle / Dungeon 入口在 Pet Tab
  深处,**应该在首页有"今日战绩"或"PVP 邀请"小卡**。
- ❌ **Pet 详情页**:没有"战绩"段。`battleWins / battleLosses` 在数据
  库里,UI 没显示。
- ❌ **跨用户挑战收件箱**:`agentrix://world-engine/battle/{id}` 收到的
  挑战进了 Inbox,但 Inbox 没有 PvP 类别的 filter。

### 6.2 桌面(空白居多)

- ❌ **没有 ArenaPanel**:桌面端 0 个 PvP UI(World Engine 也没桌面入口)
- ❌ **没有 Pet Team 编辑器**:虽然 `agent-team.controller.ts` 有 template
  CRUD,desktop 没有任何调用方
- ❌ **没有 Live Worktree 模式渲染 Arena lane**:已有的 WorktreePanel 渲染 task
  分支,把它扩展成"多队伍并行 Arena"几乎不要写新组件

### 6.3 浮球 / 锁屏

- ✅ World Engine Battle Pending **已有** companion ball 抖动 + lock screen
  text(`emitWorldEngineBattlePending` 在 battle controller 里)
- ❌ Photo Mimic / PetAuction 倒计时**没有** companion ball 提醒
- ❌ Pet Team task 进展 / member 完成 sub-task **没有** companion ball

---

## 7. 推荐动作(供产品负责人定 1-3 项立刻干)

按"投入产出比"排:

1. **(超低成本 / 立竿见影)Plaza → Play 段一次性填满 8 张卡**
   - PetMinigame leaderboard / PetAuction / SkinAuction / Photo Mimic /
     Pet Co-raising / Pet Greeting / Prediction Market / **新加 World
     Engine 'Asset Battle'** 入口
   - 1 个 sprint,**全部 backend 就绪**,只缺 8 张 SectionCard

2. **(低成本 / 关键缺口)Pet 详情页加"战绩 + 进 Battle"段**
   - 复用 World Engine Battle Picker 逻辑,把 LivingPet → 借调到 Battle
   - Battle entity 加 `subjectKind = 'world_asset' | 'living_pet'` 字段
     + 一次 migration
   - 1 个 sprint,统一 Pet 和 WorldAsset 的 PK 入口

3. **(中等 / 战略级)开 spec `pet-arena-and-team-2026-06`**
   - 上文 §5.2 的结构
   - 第一个 sprint 出 Wave 1(UI 暴露)
   - 后续按 wave 推

4. **(可选 / 需 PM 判断)定位文档 §3.2 第 6 项 "Pet Arena" 是否纳入**
   - 如果纳入 — 需要重跑 `validate-positioning.mjs` + 加 Acceptance Criteria
   - 如果不纳入 — Pet Arena 仍可作为 marketplace 的延伸,不影响主定位

---

## 8. 与 Astrocade / World Labs / Roblox 的接入时机判断

不变(沿用 PvP feasibility doc 结论):

| 阶段 | 时间 | 我们做什么 | 接入哪家 |
|-----|------|---------|---------|
| **v1**(launch+30 天)| 2026-06 | Pet Arena UI 暴露 + Cross-asset PK | 都不接,**纯 Agentrix 内部** |
| **v2**(launch+90 天)| 2026-08 | 填 pet-minigame 2-3 款 + 实时观战 | 不接 |
| **v3**(launch+12 月)| 2027-Q2 | 接 Astrocade Boss SDK / Roblox 头像 / Marble 场景 | **B2B2C** — 把 Pet 灵魂层 license 出去 |

---

## 附录 A:目前 mobile 路由对照(要给 PM 截图用)

```
App.tsx
├─ Tab: Home
├─ Tab: Plaza ────▶ PlazaScreen(5 segments)
│                    ├─ Feed: 📣 NotificationFeed
│                    ├─ Skills: ⚡ SkillsList
│                    ├─ Tasks: 💼 TaskMarket
│                    ├─ Pets: 🐾 PetsMarket / 拍卖 / Mimic / 共养
│                    └─ Play: 🎮 PlazaPlaceholder(B6 待填) ⚠️
├─ Tab: Pet ──────▶ PetHub
│                    ├─ 🌍 World Scan ─▶ WorldEngineScannerScreen
│                    ├─ 🎒 World Assets ─▶ WorldAssetInventoryScreen
│                    ├─ Battle Picker ─▶ WorldBattlePickerScreen
│                    ├─ Battle Arena ─▶ WorldBattleArenaScreen
│                    └─ Dungeon ─▶ WorldDungeonExplorerScreen
├─ Tab: Inbox ────▶ Notifications(World Engine battle pending 已接)
└─ Tab: Me ──────▶ MyAgents / Profile / Wallet
```

## 附录 B:相关文件路径速查

```
后端:
  backend/src/modules/world-engine/
  backend/src/modules/pet-team/
  backend/src/modules/agent-team/
  backend/src/modules/pet-a2a/
  backend/src/modules/pet-minigame/
  backend/src/modules/photo-mimic/
  backend/src/modules/prediction-market/
  backend/src/modules/marketplace-pet/

移动:
  src/screens/WorldEngineScannerScreen.tsx
  src/screens/WorldAssetInventoryScreen.tsx
  src/screens/WorldBattleArenaScreen.tsx
  src/screens/WorldBattlePickerScreen.tsx
  src/screens/WorldDungeonExplorerScreen.tsx
  src/screens/plaza/PetAuctionScreen.tsx
  src/screens/plaza/SkinAuctionScreen.tsx
  src/screens/plaza/PhotoMimicSeasonScreen.tsx
  src/screens/plaza/PlazaPlaceholderScreens.tsx  ⚠️ Play 段未填

桌面:
  desktop/src/components/PetCompanionWindow.tsx
  desktop/src/components/WorktreePanel.tsx
  ⚠️ 0 个 PvP / Arena 组件

文档:
  docs/MULTI_AGENT_RESEARCH_2026-05-24.zh-CN.md
  docs/PET_PVP_AND_SPATIAL_AI_2026-05-24.zh-CN.md
  docs/WORLD_ENGINE_AUDIT_2026-05-20.zh-CN.md
  .kiro/specs/reality-ai-world-engine/
  .kiro/specs/mobile-pet-companion-redesign/
  .kiro/specs/positioning-revision-2026-05/
```
