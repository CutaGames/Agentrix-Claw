# Marketplace + Living Pet 闭环 Audit · 2026-05-24

> 针对 `docs/agentrix-positioning-2026-05.zh-CN.md` §7 路线图 P2 项
> "Marketplace + Living Pet 灵魂 × 皮肤完整闭环",做一次现状盘点,
> 列出已 ship 与剩余缺口。
>
> 出处 spec:`.kiro/specs/positioning-revision-2026-05/`(SSOT)

---

## TL;DR

**Marketplace 与 Living Pet 双轨道在代码层面已经基本完整**——大部分 P2
计划项早在 P-1~P-7 pet sprints + P-9 companion-redesign 中陆续 ship。
P2 阶段不再是"造闭环",而是 **launch 后基于真实数据的运营调整**与
若干**小补丁**。

剩余真正缺的项目 ≤ 3 项,见 §3。

---

## 1. 后端模块清单(已 ship)

### 1.1 Marketplace 三联

| 模块 | 文件 | 暴露能力 |
|------|------|---------|
| `marketplace` | `agent-marketplace.service.ts` (6.6 KB) + `marketplace.controller.ts` (4.1 KB) + `asset-aggregation.service.ts` (5.5 KB) | Agent 模板上架、聚合、跨类查询 |
| `marketplace-pet` | `marketplace-listing.service.ts` (9.8 KB) / `auction.service.ts` (6.3 KB) / `rental.service.ts` (3.6 KB) / `remix-breeding.service.ts` (4.4 KB) / `ancestor-chain.service.ts` (1.5 KB) / `reverse-image-search.service.ts` (3.9 KB) | 宠物上架 / 一口价 / 拍卖 / 租赁 / Remix 二创 / 祖先链分成 / 反向图搜 |
| `unified-marketplace` | `unified-marketplace.service.ts` (20.9 KB,带 spec) + `unified-marketplace.controller.ts` (9.9 KB) + `cart.service.ts` (4.4 KB) + `search-fallback.service.ts` (9.5 KB) | 统一搜索 / 购物车 / 结算 / fallback |

### 1.2 Living Pet 灵魂 × 皮肤

| 模块 | 角色 | 状态 |
|------|------|------|
| `living-pet` | 主宠灵魂层 | ✅ |
| `pet-soul-template` | 灵魂模板 / 6 族群 / 28 签名人格 | ✅ |
| `pet-skin` | 皮肤上架 / 装备 / GMV | ✅ |
| `pet-generation` + `pet-gen-quota` | 文生 / 图生 3D 宠物 + 配额 | ✅ |
| `pet-breeding` | 繁育 + 血统 | ✅ |
| `pet-coraising` | 共养好友的宠 | ✅(裂变发动机) |
| `pet-greeting` | 宠物贺卡 | ✅ |
| `pet-a2a` | 宠物间雇佣 / 协作 | ✅ |
| `pet-achievement` | 成就 / 资产估值因子 | ✅ |
| `pet-energy` | 体力 / Auto-Earn 资源 | ✅ |
| `pet-memory-album` | 主宠回忆相册 | ✅ |
| `pet-minigame` | 共玩游戏 | ✅ |
| `pet-nft` | NFT mint 确权 | ✅ |
| `pet-team` | 多宠队伍 | ✅ |
| `pet-sovereign` | 主宠主权 / 唯一性 | ✅ |
| `pet-companion-engine` | 桌宠主引擎 | ✅ |
| `pet-rive-asset` | Rive 动效资源 | ✅ |

### 1.3 自进化系统(对 A_Path 差异化 #5 的承载)

| 模块 | 暴露 API |
|------|---------|
| `dreaming` | `/api/dreaming/sessions`, `/start`, `/stats`, `/cancel` |
| `memory-tiers` | `/api/v1/memory/upsert`, `/:tier`, `/search`, `/stats`, `/item/:id` |
| `memory-wiki` | `/api/memory-wiki/pages`, `/graph`, `/resolve-links` |

(Pre-launch 已 ship。本 sprint 新增 `services/selfEvolution.ts` 前端聚合。)

### 1.4 长任务后台(P1 已落地)

`agent-task` 模块完整:`agent-task.controller.ts` + `agent-task.service.ts` + `agent-task.worker.ts`(autonomous loop with FOR UPDATE SKIP LOCKED + Bedrock invoke)。生产 `/api/agent-tasks` 401(已部署)。

---

## 2. 前端入口清单(已 ship)

### 2.1 Web Marketplace 路由

```
/market/                      入口聚合
/market/sell                  上架
/market/skills                技能 marketplace
/market/tasks                 任务接单
/market/leaderboard           创作者排行
/market/become-creator        创作者入驻
/market/auction/[id]          拍卖详情
/market/clan/[clanId]         族群页
/market/creator/[userId]      创作者主页
/market/skin/[id]             皮肤详情
/p/[petId]                    宠物公开档案(可 iframe 嵌入)
```

### 2.2 Mobile Plaza 5 段经济

`Plaza` Tab 下 Feed / Skills / Tasks / Pets / Play 5 个 segment(参见
`mobile-prd-v5.md`)。共养 + 贺卡裂变入口在 Home / Plaza 双触点。

### 2.3 Desktop

- `AgentEconomyPanel` — 主宠收入 / A2A / Auto-Earn / Skin GMV / AXP
- `WardrobePanel` — 多形态皮肤切换
- 浮球 Living Pet — 桌宠 + 多形态自动切换
- **(本 sprint 新增)** `SelfEvolutionDashboardPanel` — 长记忆 + 梦境 + Wiki 概览

---

## 3. 真正剩余的缺口(P2 真要做的事)

### 3.1 ⚠️ 自进化 dashboard 公开化(本 sprint 落地)

✅ 已通过 `SelfEvolutionDashboardPanel.tsx` + `services/selfEvolution.ts` 落地。
ChatTitleBar More 菜单(tier=standard)入口。

### 3.2 🔴 Toy 联动 BLE / Wi-Fi 直驱 — **需硬件**

无法在纯软件 sprint 中完成。Wait for BLE 玩具样品到位。

### 3.3 🟡 Marketplace 真实运营调整(launch 后驱动)

代码层完整,但**真实运营数据驱动**的调整(price floor / 分成比例 / 上架审核流程 / 反作弊)需要上线 30 天后才有数据决策。本 sprint 不做。

### 3.4 🟢 跨端价格 / 库存一致性 e2e(可选)

跨 Web / Mobile / Desktop 的 marketplace 数据流目前**通过统一 backend 保证**,
但缺一个 e2e:Web 上架皮肤 → Mobile 立刻看到 → Desktop AgentEconomyPanel 立刻
反映 GMV 增量。这个 e2e 不阻塞 launch,可在 P2 后期补。

---

## 4. 结论

**P2 计划项中"Marketplace + Living Pet 完整闭环"的代码闭环已经存在**——
从 backend(20+ 模块)到 web frontend(11 个路由)到 mobile(5 段 Plaza)到
desktop(浮球 + 多个 panel)全栈贯通。

**P2 真正剩余动作**:

1. ✅ **Self-Evolution Dashboard 公开化**(本 sprint 已 ship)
2. 🔴 Toy BLE / Wi-Fi(等硬件,P2 阻塞项)
3. 🟡 真实运营数据调整(launch 后)
4. 🟢 跨端 marketplace e2e(可延后)

**P2 不再是"造闭环",而是"基于真实数据的运营调整"**。
launch readiness 不被 P2 阻塞。

---

## 5. 引用

- 主决策:`docs/agentrix-positioning-2026-05.zh-CN.md` §7 路线图(2026-05-24 修订版)
- 核心卖点:`docs/business/CORE_SELLING_POINTS.zh-CN.md`
- 跨端契约:`docs/agentrix-cross-platform-prd-v5.md`
- 本次 spec:`.kiro/specs/positioning-revision-2026-05/` + `pro-mode-coding-views-2026-05/`
- 代码审计 commit 范围:`bf3e57e1e..a5e94ae0c`(pre-launch 全 sprint 链)
