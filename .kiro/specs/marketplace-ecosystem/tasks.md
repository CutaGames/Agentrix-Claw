# Implementation Plan: Marketplace Ecosystem

## Overview

将 Agentrix Web 端的 `/showcase` 和 `/market` 页面从 mock 占位升级为真实数据驱动的市场生态系统。实现包括：后端新增统一皮肤 API、前端 MarketplaceLayout 统一导航、SkinCard/SkillCard/TaskCard 组件、SSR + SEO 优化、跨平台 Deep Link 导航、AXP 积分集成。

## Tasks

- [x] 1. 数据库扩展与后端 API
  - [x] 1.1 创建数据库迁移：为 pet_skins 表新增字段
    - 新增 `clan` (VARCHAR(2))、`like_count` (INTEGER DEFAULT 0)、`view_count` (INTEGER DEFAULT 0)、`remix_count` (INTEGER DEFAULT 0)、`featured` (BOOLEAN DEFAULT FALSE) 字段
    - 使用 TypeORM migration 生成迁移文件
    - 更新 `PetSkin` 实体类添加对应属性（无需手动指定列名，SnakeNamingStrategy 自动处理）
    - _Requirements: 1.4, 2.3_

  - [x] 1.2 实现 GET /api/v1/market/skins 端点
    - 在 `backend/src/modules/` 下创建 `market` 模块（Controller + Service）
    - 实现 `MarketSkinsController` 处理 `GET /api/v1/market/skins`
    - 支持 query 参数：`sort` (featured/newest/popular)、`clan` (A-F)、`limit`、`cursor`
    - 聚合 `pet_skins` (visibility='public', moderation_status='approved') LEFT JOIN `marketplace_pet_listings`
    - 返回 `{ items: SkinListItem[], total: number, nextCursor: string | null }`
    - 无需认证（公开浏览）
    - _Requirements: 3.1, 3.4, 3.5, 2.1, 2.3_

  - [x] 1.3 实现统一搜索端点
    - 新增 `GET /api/v1/market/search?query=xxx&limit=N`
    - 跨 `pet_skins`、`skill_listings`、`merchant_tasks` 三表搜索
    - 返回 `UnifiedSearchResponse` 格式（按类别分组 + 计数）
    - _Requirements: 8.3, 8.4_

  - [x]* 1.4 编写后端 API 单元测试
    - 测试 MarketSkinsService 的过滤、排序、分页逻辑
    - 测试统一搜索的分组和计数逻辑
    - _Requirements: 3.1, 3.4, 3.5, 8.3, 8.4_

- [x] 2. 前端基础架构与共享组件
  - [x] 2.1 创建 API Service Layer
    - 在 `frontend/services/marketplaceApi.ts` 中定义所有接口类型
    - 实现 `fetchMarketSkins(params: MarketplaceSkinsParams)` 函数
    - 实现 `fetchSkillListings(params: SkillListingsParams)` 函数
    - 实现 `fetchMarketTasks(params)` 函数
    - 实现 `fetchUnifiedSearch(params: UnifiedSearchParams)` 函数
    - 实现 `fetchAxpBalance()` 函数
    - 使用 axios，支持 SSR 和客户端调用
    - _Requirements: 3.1, 4.1, 5.1, 8.3, 10.5_

  - [x] 2.2 创建 MarketplaceLayout 组件
    - 在 `frontend/components/marketplace/MarketplaceLayout.tsx` 中实现
    - 顶部导航栏：Skins / Skills / Tasks / Showcase 四个 tab
    - 根据当前路由高亮活跃 section
    - 全局搜索输入框
    - 已登录用户显示 AXP 余额（获取失败时隐藏）
    - 底部持久 "Download App" 横幅（App Store + Google Play 链接）
    - 使用 agentrix-ink 暗色主题 + Tailwind + Lucide Icons
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 7.5, 10.5_

  - [x]* 2.3 编写属性测试：路由到活跃 section 映射
    - **Property 11: Route-to-active-section mapping is correct**
    - **Validates: Requirements 8.2**
    - 使用 fast-check 验证所有路由路径正确映射到对应 section

  - [x]* 2.4 编写属性测试：查询参数正确转发到 API
    - **Property 12: Query parameters are correctly forwarded to API**
    - **Validates: Requirements 3.5**
    - 使用 fast-check 验证 clan 和 sort 参数正确传递

- [x] 3. Checkpoint - 确保基础架构测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. SkinCard 组件与皮肤展示
  - [x] 4.1 实现 SkinCard 组件
    - 在 `frontend/components/marketplace/SkinCard.tsx` 中实现
    - 有 thumbnailUrl 时渲染真实图片，否则 fallback 到 clan 对应渐变色
    - 显示 displayName、clan badge、likeCount、viewCount、remixCount
    - source !== 'platform' 时显示 `@creator` 前缀
    - priceUsd !== null 时显示价格 + "Buy on Mobile" Deep Link
    - listingMode === 'auction' 时显示 currentBidUsd + 倒计时
    - axpAccepted === true 时显示 "AXP Accepted" badge + 折扣百分比
    - featured 标记时添加视觉高亮
    - _Requirements: 1.4, 2.4, 6.2, 6.3, 10.1_

  - [x]* 4.2 编写属性测试：SkinCard 渲染完整性
    - **Property 4: SkinCard renders all required fields based on item data**
    - **Validates: Requirements 1.4, 2.4, 6.2, 6.3, 10.1**
    - 使用 fast-check 生成任意 SkinListItem 验证渲染逻辑

  - [x] 4.3 实现 MobileDeepLink 组件
    - 在 `frontend/components/marketplace/MobileDeepLink.tsx` 中实现
    - 生成 `agentrix://` URI scheme（包含 action + resourceId）
    - 已认证用户注入 userId + token 参数
    - showQR 为 true 时使用 `qrcode.react` 渲染 QR code
    - Fallback 到 App Store / Google Play 下载链接
    - _Requirements: 7.1, 7.2, 7.4_

  - [x]* 4.4 编写属性测试：Deep Link 生成
    - **Property 8: Deep link generation produces valid URI with correct context**
    - **Validates: Requirements 7.1, 7.2, 7.4**
    - 使用 fast-check 验证 URI 格式和参数注入正确性

- [x] 5. Showcase 页面实现
  - [x] 5.1 实现 /showcase 页面（SSR + 真实数据）
    - 在 `frontend/pages/showcase.tsx` 中实现（或重构现有页面）
    - 使用 `getServerSideProps` 调用 `GET /api/v1/market/skins?sort=featured&limit=24`
    - 渲染 SkinCard 网格（瀑布流/响应式网格）
    - 实现 skeleton loading placeholders
    - 实现 cursor-based 无限滚动分页
    - 实现 Clan 过滤器（A-F）和排序选择器（featured/newest/popular）
    - 空结果显示本地化空状态 + 引导创作按钮
    - API 失败显示错误消息 + 重试按钮
    - "Create Your Own" CTA 按钮链接到 `/console/pet/create`
    - "Featured by Community" section 展示 AXP 奖励最多的皮肤
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 10.4_

  - [x]* 5.2 编写属性测试：Clan 过滤正确性
    - **Property 1: Clan filter returns only matching items**
    - **Validates: Requirements 1.3, 6.4**
    - 使用 fast-check 验证过滤后结果集仅包含匹配 clan 的项

  - [x]* 5.3 编写属性测试：排序稳定性
    - **Property 2: Skin sort order preserves featured-first then date-descending**
    - **Validates: Requirements 2.3**
    - 使用 fast-check 验证 featured 优先 + 日期降序排列

  - [x]* 5.4 编写属性测试：可见性过滤
    - **Property 3: Only approved and public skins appear in gallery**
    - **Validates: Requirements 2.1**
    - 使用 fast-check 验证仅 approved + public 的皮肤出现在画廊

- [x] 6. Skin Marketplace 与详情页
  - [x] 6.1 实现 /market 皮肤交易发现页面
    - 在 `frontend/pages/market/index.tsx` 中实现
    - 三个 tab：Trending / New / Leaderboard
    - 支持 Clan 过滤（跨所有 tab）
    - 顶部 banner 说明交易在移动端完成
    - 使用 MarketplaceLayout 包裹
    - _Requirements: 6.1, 6.4, 6.6, 8.1_

  - [x] 6.2 实现 /market/skin/[id] 皮肤详情页
    - 在 `frontend/pages/market/skin/[id].tsx` 中实现
    - SSR 获取皮肤详情数据
    - 展示 3D 预览、价格历史、Remix Tree、交易历史
    - MobileDeepLink（buy/bid）+ QR code
    - 动态 Open Graph image（使用 skin thumbnail）
    - _Requirements: 1.5, 6.5, 7.1, 7.2, 9.2_

  - [x]* 6.3 编写属性测试：OG 图片 URL 生成
    - **Property 13: OG image URL is correctly derived from skin data**
    - **Validates: Requirements 9.2**
    - 使用 fast-check 验证有 thumbnail 时使用 thumbnailUrl，无 thumbnail 时 fallback 到默认图片

- [x] 7. Checkpoint - 确保皮肤相关功能测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Skill Marketplace 实现
  - [x] 8.1 实现 /market/skills 技能市场页面
    - 在 `frontend/pages/market/skills.tsx` 中实现
    - 使用 `getServerSideProps` 调用 `GET /api/v1/skill-listings?status=approved`
    - 实现 SkillCard 组件（name, description, category, price, installCount, developerName, axpEarningEstimate）
    - 分类过滤器
    - 点击展开详情面板（full description, pricing, revenue split, MobileDeepLink）
    - Skeleton loading + 错误处理 + 空状态
    - JSON-LD 结构化数据（schema.org Product）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.3, 10.2_

  - [x]* 8.2 编写属性测试：SkillCard 渲染完整性
    - **Property 5: SkillCard renders all required fields**
    - **Validates: Requirements 4.2, 4.6, 10.2**
    - 使用 fast-check 生成任意 SkillListItem 验证渲染逻辑

  - [x]* 8.3 编写属性测试：分类过滤正确性
    - **Property 7: Category and type filters return only matching items**
    - **Validates: Requirements 4.3, 5.3**
    - 使用 fast-check 验证分类过滤仅返回匹配项

  - [x]* 8.4 编写属性测试：JSON-LD 生成（Skill）
    - **Property 9: JSON-LD generation produces valid structured data**
    - **Validates: Requirements 9.3, 9.4**
    - 使用 fast-check 验证 JSON-LD 输出符合 schema.org 规范

- [x] 9. Task Marketplace 实现
  - [x] 9.1 实现 /market/tasks 任务市场页面
    - 在 `frontend/pages/market/tasks.tsx` 中实现
    - 使用 `getServerSideProps` 调用 `GET /merchant-tasks/marketplace/search`
    - 实现 TaskCard 组件（title, description, rewardAmount, taskType, requiredSkills, deadline, axpBonus）
    - 任务类型过滤器 + 排序选择器（newest, highest reward, deadline soonest）
    - 点击展开详情 + MobileDeepLink（accept_task）
    - Skeleton loading + 错误处理
    - JSON-LD 结构化数据（schema.org Offer）
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.4, 10.3_

  - [x]* 9.2 编写属性测试：TaskCard 渲染完整性
    - **Property 6: TaskCard renders all required fields**
    - **Validates: Requirements 5.2, 10.3**
    - 使用 fast-check 生成任意 TaskListItem 验证渲染逻辑

- [x] 10. 统一搜索与 SEO 集成
  - [x] 10.1 实现统一搜索功能
    - 在 MarketplaceLayout 的搜索框中集成统一搜索
    - 调用 `GET /api/v1/market/search`
    - 搜索结果按类别分组（skins/skills/tasks）+ 显示计数
    - 搜索结果下拉面板 UI
    - _Requirements: 8.3, 8.4_

  - [x]* 10.2 编写属性测试：搜索结果分组
    - **Property 10: Search results are correctly grouped by category with accurate counts**
    - **Validates: Requirements 8.4**
    - 使用 fast-check 验证分组和计数的正确性

  - [x] 10.3 实现 SEO 元数据
    - Showcase 页面：title, description, og:image（SSR 渲染）
    - Skin 详情页：动态 OG image + og:title + og:description
    - Skills 页面：JSON-LD (Product)
    - Tasks 页面：JSON-LD (Offer)
    - 确保 SSR TTFB < 200ms（首 12 项）
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 11. AXP 集成与跨平台导航完善
  - [x] 11.1 实现 AXP 余额展示与集成
    - MarketplaceLayout 导航栏显示已登录用户 AXP 余额
    - 调用 `GET /api/v1/axp/balance`
    - 获取失败时静默隐藏（不阻塞页面）
    - SkinCard 中 "AXP Accepted" badge 展示
    - SkillCard 中 AXP earning estimate 展示
    - TaskCard 中 AXP bonus 展示
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

  - [x] 11.2 完善跨平台导航
    - 所有交易操作显示 MobileDeepLink + QR code
    - 未认证用户可自由浏览所有内容
    - 已认证用户 Deep Link 预填 user context
    - 底部持久 "Download App" 横幅
    - Skin Marketplace 顶部 banner 说明交易在移动端完成
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 6.6_

- [x] 12. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Post-launch Fixes: AXP 交易闭环 & 导览整合（E2E 反馈修复）
  - [x] 13.1 P0-1：修复 Skills 页面 401 + 回退 OpenClaw Hub
    - 编辑 `backend/src/modules/skill-listings/skill-listings.controller.ts`
    - 移除类级别 `@UseGuards(JwtAuthGuard)`，将其下沉到仅写操作（create/update/delete/submitForReview/approve/reject）
    - `GET /skill-listings` (`list`) 和 `GET /skill-listings/:id` (`get`) 必须可匿名 SSR 访问
    - 编辑 `frontend/pages/market/skills.tsx`：
      - 当 `fetchSkillListings` 返回空数组或 401 时，fallback 调用 `GET /api/openclaw/bridge/skill-hub/search?limit=50&sortBy=callCount`
      - 将 OpenClaw Hub 返回的 skill 数据映射为前端 SkillListItem 形状（name/description/pricingModel/totalEarnings/totalCalls）
      - 在页面顶部添加提示条：`数据来源：OpenClaw Skill Hub Top 50`
    - 验证：匿名访问 `/market/skills` 不应返回 401，应渲染 ≥1 个 SkillCard
    - _Requirements: 4.1, 4.2, 7.1_

  - [x] 13.2 P0-2：修复 Task 接单流程（内嵌 TaskBidModal，移除错误的 checkout 跳转）
    - 创建 `frontend/components/marketplace/TaskBidModal.tsx`：
      - 参考 `src/screens/TaskDetailScreen.tsx` 中移动端 bid 表单实现
      - 字段：`proposedBudget` (number)、`estimatedDays` (number)、`proposal` (textarea, 最少 50 字符)
      - Submit 时调用 `POST /api/merchant-tasks/marketplace/tasks/:id/bid`
      - 提交成功后显示 Toast 并关闭 modal，不再跳转到 `/pay/checkout`
      - 未登录用户点击 "接单" 时引导去 `/login?redirect=/market/tasks`
    - 编辑 `frontend/pages/market/tasks.tsx`：
      - 替换现有 `router.push('/pay/checkout?taskId=...')` 调用为 `openBidModal(task)`
      - 使用 useState 管理 `selectedTask` + modal open 状态
    - 验证：从 `/market/tasks` 点击 "接单" 不应跳转 `/pay/checkout`，应弹出内嵌表单；提交 POST `/bid` 应返回 200/201
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 13.3 P1-3：后端 AXP 独立交易路径（migration + entity + service + controller）
    - 验证/完成 migration `backend/src/migrations/1790000000000-AddPriceAxpToPetSkins.ts`：
      - `ALTER TABLE pet_skins ADD COLUMN price_axp INTEGER NULL`
      - `up()` 和 `down()` 成对实现
    - 编辑 `backend/src/entities/pet-skin.entity.ts`：添加 `@Column({ type: 'int', nullable: true }) priceAxp?: number | null`（依赖 SnakeNamingStrategy 自动映射到 `price_axp`）
    - 编辑 `backend/src/modules/pet-skin/pet-skin.service.ts`：
      - 在 `toDto()` / `toSkinDto()` 中透传 `priceAxp`
      - 新增方法 `installWithAxp(userId: string, skinId: string): Promise<{ clonedSkinId: string }>`：
        * 使用 `this.dataSource.transaction` 开启事务
        * 读取 skin 的 `priceAxp`，若为空或 ≤0 抛 `BadRequestException('Skin not AXP-purchasable')`
        * 调用 `AxpService.spend({ userId, source: 'redeem_skin', amount: priceAxp, refId: skinId, refType: 'pet_skin' })`（验证 `backend/src/modules/axp/axp.constants.ts` 中 `redeem_skin` 为合法 source）
        * 克隆 skin row 到目标用户（复用 `installFromMarketplace` 的克隆逻辑，跳过 Order 要求）
        * 返回克隆后 skin id
    - 编辑 `backend/src/modules/market/market-skins.service.ts`：在响应 DTO 中透传 `priceAxp`
    - 编辑 `backend/src/modules/pet-skin/pet-skin.controller.ts`：新增 `POST /pet-skin/marketplace/:skinId/install-with-axp`（JWT 保护），调用 `installWithAxp(req.user.id, skinId)`
    - 验证：`npx tsc --noEmit` 通过；手动 curl 带 JWT 的 POST 应扣 AXP 并返回 clonedSkinId
    - _Requirements: 2.1, 10.1, 10.4_

  - [x] 13.4 P1-4：Web AXP 购买弹窗 + SkinCard 双路径路由
    - 创建 `frontend/components/marketplace/AxpPurchaseModal.tsx`：
      - Props: `{ skin: SkinListItem, open: boolean, onClose: () => void, onSuccess: (clonedSkinId: string) => void }`
      - 展示皮肤缩略图、名称、`priceAxp`、用户当前 AXP 余额（从 `GET /api/v1/axp/balance`）
      - 余额不足时禁用 Confirm 按钮并提示 "余额不足，前往充值"
      - Confirm 调用 `POST /api/v1/pet-skin/marketplace/:skinId/install-with-axp`
      - 成功后 Toast + onSuccess 回调
    - 编辑 `frontend/components/marketplace/SkinCard.tsx`：
      - 路由决策逻辑：
        * 若 `priceAxp > 0` 且 `priceUsd == null` → 仅显示 "用 AXP 购买"（打开 AxpPurchaseModal）
        * 若 `priceUsd != null` 且 `priceAxp == null` → 沿用现有 "加入购物车" / "立即购买" (→ /pay/checkout)
        * 若两者都存在 → 并列展示两种按钮
      - 未登录时点击 "用 AXP 购买" 引导去 `/login?redirect=<当前路径>`
    - SQL：在 prod `pet_skins` 表中更新 6 个 VRM 3D skin 的 `price_axp` 为 3000-5000（按层级）
    - 验证：匿名访问 /market 的 AXP 皮肤卡片应显示 "用 AXP 购买"；登录后点击应弹窗；Confirm 应扣减 AXP
    - _Requirements: 2.1, 10.1, 10.4_

  - [x] 13.5 P2-5：导航整合（合并 /showcase 到 /market）
    - 编辑 `frontend/pages/market/index.tsx`：
      - 在页面顶部添加 `FeaturedSkinsCarousel` 组件（复用 `frontend/components/marketplace/FeaturedSkinsCarousel.tsx`，数据源 `fetchMarketSkins({ sort: 'featured', limit: 8 })`）
      - Carousel 下方保留现有 Skins 列表（sort/filter/grid）
    - 编辑 `frontend/components/marketplace/MarketplaceLayout.tsx`：
      - 将 Showcase tab 降级为锚点 `#featured` 或直接移除（保留 Skins / Skills / Tasks 三 tab）
    - 添加 redirect：在 `frontend/next.config.js` 的 `redirects()` 中添加 `{ source: '/showcase', destination: '/market#featured', permanent: false }`
    - 验证：访问 `/showcase` 自动 307 重定向到 `/market#featured`；`/market` 顶部显示 Featured 轮播
    - _Requirements: 1.1, 8.1, 8.2_

- [ ] 14. Post-Fix Deploy Checkpoint
  - `npx tsc --noEmit`（backend + frontend）全部通过
  - `git add -A && git commit -m "fix(marketplace): P0 Skills 401 + Tasks bid flow; P1 AXP independent tx; P2 nav merge"`
  - `git push origin <branch>`；若涉及移动端 APK 同步，additionally push to `public_claw`
  - SSH deploy 至 `47.130.176.148`：`cd /home/ubuntu/Agentrix/backend && git pull && npm run build && npx typeorm migration:run -d dist/config/data-source.js && pm2 restart agentrix-backend`
  - SSH 上通过 `psql` 在 `pet_skins` 表里把 6 个 VRM 3D skin 的 `price_axp` 按等级填为 3000/4000/5000
  - 前端重新构建并 `pm2 restart agentrix-frontend`
  - E2E 验证：
    * `/market/skills` 匿名访问返回 200 且渲染 ≥1 个 SkillCard
    * `/market/tasks` 点击 "接单" 弹出 TaskBidModal（不跳 /pay/checkout）
    * `/market` AXP 皮肤卡片显示 "用 AXP 购买" 按钮，点击弹出 AxpPurchaseModal
    * `/showcase` 重定向到 `/market#featured`
  - 向用户报告 E2E 结果

## Notes

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP 交付
- 每个任务引用具体需求编号以确保可追溯性
- Checkpoint 确保增量验证
- 属性测试验证通用正确性属性（使用 Vitest + fast-check）
- 单元测试验证具体示例和边界情况
- TypeORM 实体使用 SnakeNamingStrategy，无需手动指定列名
- 前端使用 agentrix-ink 暗色主题 + Tailwind + Lucide Icons
- 所有 API 请求期间显示 skeleton loading，避免 CLS

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2"] },
    { "id": 2, "tasks": ["1.4", "2.3", "2.4", "4.1", "4.3"] },
    { "id": 3, "tasks": ["4.2", "4.4", "5.1", "6.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "6.2", "8.1"] },
    { "id": 5, "tasks": ["6.3", "8.2", "8.3", "8.4", "9.1"] },
    { "id": 6, "tasks": ["9.2", "10.1", "10.3"] },
    { "id": 7, "tasks": ["10.2", "11.1", "11.2"] },
    { "id": 8, "tasks": ["13.1", "13.2", "13.3", "13.5"] },
    { "id": 9, "tasks": ["13.4"] },
    { "id": 10, "tasks": ["14"] }
  ]
}
```
