# 移动端 V4.1 Marketplace Ecosystem 审计与差距分析

> 审计日期：2026-05-XX
> 审计范围：`mobile-prd-v4.md` §11 (Marketplace Ecosystem Integration) 对照 `src/` 移动端代码
> 审计方法：静态代码审查 + 文件结构分析

---

## 1. 审计总览

| 审计项 | 状态 | 说明 |
|--------|------|------|
| Plaza Tab 5-segment 结构 | ✅ 已实现 | `PlazaScreen.tsx` 含 Feed/Skills/Tasks/Pets/Play 五段 |
| Skin Marketplace | ✅ 已实现 | `SkinMarketplaceScreen.tsx` + `SkinAuctionScreen.tsx` 双入口 |
| AXP 集成 | ⚠️ 部分实现 | 余额展示已有，但皮肤购买未接入 AXP 支付 |
| Deep Link 处理 | ⚠️ 部分实现 | Web 端生成 `agentrix://buy` 等链接，但移动端路由未注册这些 action |
| 官方皮肤展示 | ⚠️ 部分实现 | 可展示 platform 来源皮肤，但未接入新 `/api/v1/market/skins` 端点 |
| Checkout 流程 | ✅ 已实现 | `CheckoutScreen.tsx` 支持 Crypto + Fiat，复杂场景跳转 Web |
| 订阅 5 档 | ✅ 已实现 | `SubscribePlanScreen.tsx` 含 Free/Lite/Plus/Pro/Elite + AXP 抵扣 |
| 共养 & 贺卡 | ✅ 已实现 | `CoRaisingInviteScreen.tsx` + `GreetingCardComposeScreen.tsx` 完整实现 |

---

## 2. 详细审计

### 2.1 Plaza Tab 5-Segment 结构

**状态：✅ 已实现**

| 文件 | 作用 |
|------|------|
| `src/navigation/MainTabNavigator.tsx` | 4-tab IA: Home / Summon / Plaza / Me |
| `src/navigation/PlazaStackNavigator.tsx` | Plaza 内所有子路由注册 |
| `src/screens/plaza/PlazaScreen.tsx` | 5 段 segmented UI (Feed/Skills/Tasks/Pets/Play) |

验证结果：
- `MainTabNavigator` 正确实现 4-tab 结构（Home/Summon/Plaza/Me）
- `PlazaScreen` 定义了 `SEGMENTS` 数组包含 `feed/skills/tasks/pets/play` 五段
- 每段有对应的 Preview 组件和导航到完整页面的 CTA
- `PlazaStackNavigator` 注册了所有子路由（Feed, Skills, Tasks, Pets, PetsSkins, Play 等）

**结论：完全符合 PRD §11.5 要求。**

---

### 2.2 Skin Marketplace

**状态：✅ 已实现（双入口）**

| 文件 | 作用 | API 端点 |
|------|------|----------|
| `src/screens/pet/SkinMarketplaceScreen.tsx` | Pet Tab 内皮肤市场 | `GET /v1/pet/skins/marketplace` |
| `src/screens/plaza/SkinAuctionScreen.tsx` | Plaza · Pets · Skins | `GET /pet-skin/marketplace` |
| `src/services/petSkinMarketplace.api.ts` | API 客户端 | `fetchSkinMarketplace()` |
| `src/services/mobilePetSdk.ts` | 旧版 API 客户端 | `listMarketplaceSkins()` |

验证结果：
- `SkinAuctionScreen` 使用 `useInfiniteQuery` 实现无限滚动
- 支持排序（newest/price_asc/price_desc/name_asc）
- 支持安装（`installSkin` mutation）
- `SkinMarketplaceScreen` 支持来源过滤（all/platform/generated/remixed）
- 可展示官方皮肤（`source === 'platform'` 过滤）

**差距：**
- ❌ 未接入新的 `GET /api/v1/market/skins` 端点（使用旧的 `/pet-skin/marketplace`）
- ❌ 缺少 `clan` 过滤器（新端点支持按族群筛选）
- ❌ 缺少 `like_count`、`view_count`、`remix_count` 展示
- ❌ 缺少 `featured` 标记展示
- ❌ 缺少 AXP 支付选项（`axpAccepted` / `axpDiscountPercent`）

---

### 2.3 AXP 集成

**状态：⚠️ 部分实现**

| 功能 | 状态 | 位置 |
|------|------|------|
| AXP 余额获取 | ✅ | `src/services/axp.api.ts` → `fetchAxpBalance()` |
| Home 页余额展示 | ✅ | `src/screens/home/HomeScreen.tsx` (AXP balance glance card) |
| Me 页余额展示 | ✅ | `src/screens/me/ProfileScreen.tsx` |
| AXP 中心（历史记录） | ✅ | `src/screens/me/AxpCenterScreen.tsx` |
| 订阅 AXP 抵扣 | ✅ | `src/screens/me/SubscribePlanScreen.tsx` (slider + 20% cap) |
| 每日签到赚 AXP | ✅ | `src/screens/home/CheckinCard.tsx` |
| AXP Toast 全局提示 | ✅ | `App.tsx` → `<AxpToastHost />` |
| 皮肤购买 AXP 支付 | ❌ | 未实现 |
| 技能 AXP 收益预估 | ❌ | 未实现 |
| 任务 AXP 奖励展示 | ❌ | 未实现 |
| 导航栏 AXP 余额 | ❌ | 仅在 Home card 和 Me profile 展示，非全局导航栏 |

**差距：**
- 皮肤市场未展示 AXP 价格和 AXP 支付选项
- 技能卡片未展示 `axpEarningEstimate`
- 任务卡片未展示 `axpBonus`
- AXP 余额未在全局导航栏（tab bar 或 header）展示

---

### 2.4 Deep Link 处理

**状态：⚠️ 部分实现**

| Deep Link | 状态 | 说明 |
|-----------|------|------|
| `agentrix://buy?resourceId=...` | ❌ 未注册 | Web 端 `MobileDeepLink.test.ts` 生成此链接，但移动端路由未处理 |
| `agentrix://bid?resourceId=...` | ❌ 未注册 | 同上 |
| `agentrix://install_skill?resourceId=...` | ❌ 未注册 | 同上 |
| `agentrix://accept_task?resourceId=...` | ❌ 未注册 | 同上 |
| `agentrix://plaza/pets/skins` | ✅ | 已在 linking config 注册 |
| `agentrix://plaza/skills/:skillId` | ✅ | 已在 linking config 注册 |
| `agentrix://plaza/tasks/:taskId` | ✅ | 已在 linking config 注册 |
| Legacy route rewriting | ✅ | `legacyRouteTable.ts` 完整映射旧路径到新路径 |

**差距：**
- `App.tsx` 的 `linking.config.screens` 未注册 `buy`/`bid`/`install_skill`/`accept_task` 这四个 action 路由
- 需要在 `getStateFromPath` 或 `legacyRouteTable` 中添加这些 action 的解析逻辑
- 需要将 `agentrix://buy?resourceId=X` 映射到 `plaza/pets/skins/X` 或对应详情页

---

### 2.5 官方皮肤展示

**状态：⚠️ 部分实现**

验证结果：
- `SkinMarketplaceScreen` 有 `platform` 来源过滤器，可筛选官方皮肤
- `SkinAuctionScreen` 可展示所有来源的皮肤
- 后端 `GET /api/v1/market/skins` 已实现（`backend/src/modules/market/`）

**差距：**
- ❌ 移动端未接入新的 `/api/v1/market/skins` 端点（该端点支持 `clan` 过滤和 `featured` 排序）
- ❌ 缺少 18 个官方皮肤的 featured 展示区（showcase carousel）
- ❌ 缺少 clan 标签展示（A-F 六族群）
- ❌ 缺少 AXP 定价展示（500-3000 AXP）

---

### 2.6 Checkout 流程

**状态：✅ 已实现**

| 功能 | 状态 | 说明 |
|------|------|------|
| 技能购买 Checkout | ✅ | `CheckoutScreen.tsx` — Smart Checkout V2 |
| Crypto 支付 (QuickPay) | ✅ | Session-key auto-pay |
| Crypto 支付 (WalletConnect) | ✅ | 外部钱包连接 |
| Crypto 支付 (Scan to Pay) | ✅ | QR code + polling |
| Fiat 支付 (Stripe) | ✅ | Apple Pay / Google Pay / Card / Alipay |
| Fiat 支付 (Transak) | ✅ | Fiat → Crypto → Pay |
| Web 跳转 fallback | ✅ | `expo-web-browser` 打开 web checkout |

**结论：Checkout 流程完整，支持 Crypto + Fiat 双轨。复杂场景通过 in-app browser 跳转 web 完成，符合 PRD 架构设计。**

---

### 2.7 订阅 5 档

**状态：✅ 已实现**

| 功能 | 状态 | 说明 |
|------|------|------|
| 5 档展示 | ✅ | Free/Lite/Plus/Pro/Elite + Enterprise |
| 月付/年付切换 | ✅ | 年付约省 17% |
| AXP 抵扣滑块 | ✅ | 最多抵扣 20%，1 AXP = $0.001 |
| 配额展示 | ✅ | LLM budget / Pets / Devices / Auction fee |
| 当前档位标识 | ✅ | 高亮当前订阅 |
| `skins_publish_max` 配额 | ✅ | 在 `TierQuota` 接口中定义 |

**结论：完全符合 PRD §11.6 要求。**

---

### 2.8 共养 & 贺卡

**状态：✅ 已实现**

| 功能 | 状态 | 文件 |
|------|------|------|
| CoRaisingInviteScreen | ✅ | `src/screens/home/CoRaisingInviteScreen.tsx` |
| CoRaisingLandingScreen | ✅ | `src/screens/home/CoRaisingLandingScreen.tsx` |
| GreetingCardComposeScreen | ✅ | `src/screens/plaza/GreetingCardComposeScreen.tsx` |
| GreetingCardInboxScreen | ✅ | `src/screens/plaza/GreetingCardInboxScreen.tsx` |
| 共养 API | ✅ | `src/services/coraising.api.ts` |
| 贺卡 API | ✅ | `src/services/greeting.api.ts` |
| 分享链接生成 | ✅ | `expo-clipboard` + `Share` API |
| AXP 奖励 | ✅ | 收件人打开得 AXP |

**结论：完全符合 PRD 要求，实现质量高。**

---

## 3. 差距分析汇总表

| # | 差距项 | 优先级 | 影响范围 | 当前状态 |
|---|--------|--------|----------|----------|
| G1 | 移动端未接入 `GET /api/v1/market/skins` 新端点 | P1 | 皮肤市场 | 使用旧端点 `/pet-skin/marketplace` |
| G2 | Marketplace Deep Link action 未注册 (`buy`/`bid`/`install_skill`/`accept_task`) | P1 | 跨端导航 | Web 端生成链接但移动端无法解析 |
| G3 | 皮肤购买缺少 AXP 支付选项 | P2 | 交易流程 | 仅支持 USD 支付 |
| G4 | 缺少 clan 过滤器和族群标签展示 | P2 | 皮肤浏览 | 无 clan 字段展示 |
| G5 | 缺少 featured 皮肤 showcase 区域 | P2 | 首页/市场 | 无 featured 标记 |
| G6 | 技能卡片缺少 AXP 收益预估 | P3 | 技能市场 | 无 `axpEarningEstimate` 字段 |
| G7 | 任务卡片缺少 AXP 奖励展示 | P3 | 任务市场 | 无 `axpBonus` 字段 |
| G8 | 缺少 `like_count`/`view_count`/`remix_count` 统计展示 | P3 | 皮肤卡片 | 无社交统计 |
| G9 | AXP 余额未在全局导航栏展示 | P3 | 全局 UI | 仅在 Home card 和 Me profile |
| G10 | 官方皮肤 AXP 定价未展示 | P2 | 皮肤市场 | 仅展示 USD 价格 |

---

## 4. 修复/增强计划（优先级排序）

### Phase 1 — P1 关键路径（预计 3-4 天）

| # | 任务 | 预估工时 | 涉及文件 |
|---|------|----------|----------|
| 1.1 | 新建 `src/services/marketSkins.api.ts` 接入 `GET /api/v1/market/skins` | 2h | 新文件 |
| 1.2 | 更新 `SkinAuctionScreen` 使用新端点，添加 clan 过滤 + featured 排序 | 4h | `src/screens/plaza/SkinAuctionScreen.tsx` |
| 1.3 | 注册 Marketplace Deep Link actions | 4h | `App.tsx` linking config + `legacyRouteTable.ts` |
| 1.4 | 实现 Deep Link action resolver（`buy` → 皮肤详情，`bid` → 拍卖，`install_skill` → 技能安装，`accept_task` → 任务详情） | 4h | `src/navigation/legacyRouteTable.ts` + 新 resolver |
| 1.5 | 端到端测试 Web → Mobile deep link 流程 | 2h | Maestro E2E |

**小计：~16h（2 天）**

### Phase 2 — P2 AXP 市场集成（预计 3-4 天）

| # | 任务 | 预估工时 | 涉及文件 |
|---|------|----------|----------|
| 2.1 | 皮肤卡片添加 AXP 价格展示 + "AXP Accepted" badge | 3h | `SkinAuctionScreen.tsx` |
| 2.2 | 皮肤购买流程添加 AXP 支付选项（partial/full） | 6h | 新 `SkinCheckoutModal.tsx` + `axp.api.ts` |
| 2.3 | 添加 clan 标签 UI（6 族群颜色标识） | 2h | `SkinAuctionScreen.tsx` |
| 2.4 | 添加 featured 皮肤 showcase 轮播区 | 4h | `PlazaScreen.tsx` Pets preview 或新组件 |
| 2.5 | 官方皮肤 AXP 定价展示（500-3000 AXP） | 2h | 皮肤卡片组件 |

**小计：~17h（2.5 天）**

### Phase 3 — P3 增强体验（预计 2-3 天）

| # | 任务 | 预估工时 | 涉及文件 |
|---|------|----------|----------|
| 3.1 | 技能卡片添加 AXP 收益预估展示 | 2h | `ClawMarketplaceScreen.tsx` + `ClawSkillDetailScreen.tsx` |
| 3.2 | 任务卡片添加 AXP 奖励展示 | 2h | `TaskMarketScreen.tsx` + `TaskDetailScreen.tsx` |
| 3.3 | 皮肤卡片添加社交统计（like/view/remix） | 3h | `SkinAuctionScreen.tsx` |
| 3.4 | 全局导航栏 AXP 余额展示（可选：Home tab header） | 3h | `HomeStackNavigator.tsx` 或 `PlazaScreen.tsx` header |
| 3.5 | 统一搜索接入 `/api/v1/market/search` | 4h | 新搜索组件 |

**小计：~14h（2 天）**

---

## 5. 总结

### 已实现亮点 ✅

1. **4-Tab IA 完整落地** — Home/Summon/Plaza/Me 结构清晰，legacy 兼容完善
2. **Plaza 5-Segment 完整** — Feed/Skills/Tasks/Pets/Play 全部有对应页面
3. **Checkout 流程成熟** — Crypto + Fiat 双轨，Smart Checkout V2
4. **订阅系统完整** — 5 档 + AXP 抵扣 + 配额展示
5. **AXP 基础设施完善** — 余额/历史/签到/Toast 全链路
6. **共养 & 贺卡** — 完整实现，含分享和 AXP 奖励
7. **Legacy Deep Link 兼容** — 完整的旧路径 → 新路径映射表

### 主要差距 ⚠️

1. **新 Market API 未接入** — 移动端仍使用旧的 `/pet-skin/marketplace`，未利用新的 clan/featured/统计字段
2. **Marketplace Deep Link 断裂** — Web 端生成的 `agentrix://buy` 等链接在移动端无法解析
3. **AXP 市场支付未闭环** — AXP 余额展示完善，但皮肤购买未支持 AXP 支付

### 预估总工时

| Phase | 工时 | 天数 |
|-------|------|------|
| Phase 1 (P1) | ~16h | 2 天 |
| Phase 2 (P2) | ~17h | 2.5 天 |
| Phase 3 (P3) | ~14h | 2 天 |
| **总计** | **~47h** | **~6.5 天** |

---

*审计完成。建议按 Phase 1 → Phase 2 → Phase 3 顺序执行，Phase 1 为阻塞项（跨端链路断裂），应优先修复。*
