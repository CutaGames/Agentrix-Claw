# Requirements Document

## Introduction

Marketplace Ecosystem 是 Agentrix Web 端的核心展示与发现层，围绕"宠物经济"（Pet Economy）概念构建。该功能将当前 `/showcase` 页面的渐变色占位块替换为真实宠物视觉资产（官方预制 3D/2D 萌宠 + 用户自创内容），重新连接 `/skills` 页面与后端 skill-listings 模块，并规划皮肤交易、技能市场、任务市场三大经济板块的 Web 展示层。Web 端定位为"展示 + 发现"，实际交易闭环在移动端完成。

## Glossary

- **Showcase_Page**: `/showcase` 路由页面，展示每日精选宠物皮肤的瀑布流画廊
- **Official_Pet_Asset**: 由 Agentrix 团队预制的 3D/2D 宠物设计资产，覆盖 6 个 Clan，供用户直接使用
- **User_Generated_Skin**: 用户通过 PetCreator 工坊自行设计并上传的宠物皮肤
- **PetCreator**: Web 端 `/console/pet/create` 的宠物设计工坊，支持文生、图生、双图融合三种模式
- **Skin_Card**: 展示单个宠物皮肤的卡片组件，包含缩略图、标题、创作者、统计数据
- **Clan**: Agentrix 的 6 个族群分类（A_office, B_life, C_learn, D_play, E_web3, F_family）
- **Skill_Marketplace**: `/market/skills` 路由，展示可安装到宠物的技能列表
- **Task_Marketplace**: `/market/tasks` 路由，展示宠物可接受的任务列表
- **Skin_Marketplace**: `/market` 主路由，展示可交易的宠物皮肤
- **AXP**: Agentrix 积分系统（1 AXP = $0.001），用于平台内激励和部分抵扣
- **Skins_API**: 后端 `GET /api/v1/market/skins` 接口，返回皮肤列表数据
- **SkillListings_API**: 后端 `GET /api/v1/skill-listings` 接口，返回技能列表数据
- **MerchantTask_API**: 后端 `GET /merchant-tasks/marketplace/search` 接口，返回任务列表数据
- **Mobile_Deep_Link**: 从 Web 展示页跳转到移动端对应交易页面的链接机制
- **Remix_Tree**: 皮肤的衍生创作关系图谱，展示原作与 Remix 版本的关系

## Requirements

### Requirement 1: Official Pet Asset Library

**User Story:** As a casual user, I want to browse and use pre-made official pet designs, so that I can enjoy cute pets without needing to design my own.

#### Acceptance Criteria

1. THE Showcase_Page SHALL display a minimum of 12 Official_Pet_Asset entries covering all 6 Clans (at least 2 per Clan)
2. WHEN the Showcase_Page loads, THE Showcase_Page SHALL render real pet visual assets (3D renders or 2D illustrations) instead of gradient color placeholders
3. WHEN a user selects a Clan filter, THE Showcase_Page SHALL display only Official_Pet_Asset entries and User_Generated_Skin entries belonging to the selected Clan
4. THE Skin_Card SHALL display a thumbnail image, pet name, Clan badge, like count, view count, and remix count for each asset
5. WHEN a user clicks an Official_Pet_Asset Skin_Card, THE Showcase_Page SHALL navigate to the skin detail page at `/market/skin/[id]`

### Requirement 2: User-Generated Content Integration

**User Story:** As an advanced user, I want to create my own pet designs and see them displayed in the showcase, so that I can express my creativity and share with the community.

#### Acceptance Criteria

1. WHEN a User_Generated_Skin has moderation_status "approved" and visibility "public", THE Showcase_Page SHALL include the User_Generated_Skin in the gallery alongside Official_Pet_Asset entries
2. THE Showcase_Page SHALL display a "Create Your Own" call-to-action button that links to the PetCreator at `/console/pet/create`
3. WHEN the Skins_API returns results, THE Showcase_Page SHALL sort entries by the `featured` flag first, then by creation date descending
4. THE Skin_Card SHALL display the creator username with an `@` prefix for User_Generated_Skin entries
5. WHEN the Skins_API returns an empty result set for a Clan filter, THE Showcase_Page SHALL display a localized empty state message with a prompt to create content

### Requirement 3: Showcase Page Real Data Connection

**User Story:** As a product stakeholder, I want the showcase page to fetch real data from the backend API, so that the page reflects actual available pet assets.

#### Acceptance Criteria

1. WHEN the Showcase_Page loads, THE Showcase_Page SHALL fetch data from `GET /api/v1/market/skins?sort=featured&limit=24`
2. WHILE the Skins_API request is in progress, THE Showcase_Page SHALL display skeleton loading placeholders matching the Skin_Card layout
3. IF the Skins_API request fails, THEN THE Showcase_Page SHALL display a localized error message with a retry button
4. WHEN the user scrolls to the bottom of the current results, THE Showcase_Page SHALL fetch the next page of results using cursor-based pagination
5. THE Showcase_Page SHALL support query parameters `clan` (A-F) and `sort` (featured, newest, popular) for filtering and sorting

### Requirement 4: Skill Marketplace Reconnection

**User Story:** As a user, I want to browse available skills on the website, so that I can discover skills to install on my pet.

#### Acceptance Criteria

1. WHEN the `/market/skills` page loads, THE Skill_Marketplace SHALL fetch data from `GET /api/v1/skill-listings?status=approved`
2. THE Skill_Marketplace SHALL display each skill with its name, description, category, price, install count, and developer name
3. WHEN a user selects a category filter, THE Skill_Marketplace SHALL filter the displayed skills by the selected category
4. WHILE the SkillListings_API request is in progress, THE Skill_Marketplace SHALL display skeleton loading placeholders
5. IF the SkillListings_API request fails, THEN THE Skill_Marketplace SHALL display a localized error message with a retry button
6. WHEN a user clicks a skill card, THE Skill_Marketplace SHALL display a detail panel showing full description, pricing, revenue split information, and a Mobile_Deep_Link to install on mobile

### Requirement 5: Task Marketplace Display

**User Story:** As a user, I want to browse available tasks on the website, so that I can discover earning opportunities for my pet.

#### Acceptance Criteria

1. WHEN the `/market/tasks` page loads, THE Task_Marketplace SHALL fetch data from `GET /merchant-tasks/marketplace/search`
2. THE Task_Marketplace SHALL display each task with its title, description, reward amount, task type, required skills, and deadline
3. WHEN a user selects a task type filter, THE Task_Marketplace SHALL filter the displayed tasks by the selected type
4. WHEN a user selects a sort option (newest, highest reward, deadline soonest), THE Task_Marketplace SHALL re-fetch results with the corresponding sort parameter
5. IF the MerchantTask_API request fails, THEN THE Task_Marketplace SHALL display a localized error message with a retry button
6. WHEN a user clicks a task card, THE Task_Marketplace SHALL display task details with a Mobile_Deep_Link to accept the task on mobile

### Requirement 6: Skin Trading Discovery (Web Showcase Layer)

**User Story:** As a user, I want to browse skins available for purchase or auction on the website, so that I can discover skins I want to acquire on mobile.

#### Acceptance Criteria

1. THE Skin_Marketplace SHALL display skins in three tabs: Trending, New, and Leaderboard
2. WHEN a skin has a price set, THE Skin_Card SHALL display the price in USD with a "Buy on Mobile" Mobile_Deep_Link
3. WHEN a skin is listed for auction, THE Skin_Card SHALL display the current bid amount and auction end time
4. THE Skin_Marketplace SHALL support filtering by Clan (A-F) across all tabs
5. WHEN a user clicks a skin in the Skin_Marketplace, THE Skin_Marketplace SHALL navigate to `/market/skin/[id]` showing 3D preview, price history, Remix_Tree, and transaction history
6. THE Skin_Marketplace SHALL display a banner explaining that purchases and auctions are completed on the Agentrix mobile app

### Requirement 7: Cross-Platform Navigation

**User Story:** As a user browsing on web, I want clear pathways to complete transactions on mobile, so that I understand the web is for discovery and mobile is for transactions.

#### Acceptance Criteria

1. WHEN a transaction action is available (buy, bid, install skill, accept task), THE Skin_Marketplace SHALL display a Mobile_Deep_Link formatted as `agentrix://` URI with a fallback to app store download links
2. THE Skin_Marketplace SHALL display a QR code for each transaction action that opens the corresponding mobile screen when scanned
3. WHEN a user is not authenticated, THE Skin_Marketplace SHALL allow browsing all marketplace content without requiring login
4. WHEN a user is authenticated and has the mobile app installed, THE Mobile_Deep_Link SHALL pre-fill the user context so the mobile app does not require re-authentication
5. THE Showcase_Page SHALL include a persistent "Download App" banner at the bottom of the page with links to App Store and Google Play

### Requirement 8: Marketplace Unified Navigation

**User Story:** As a user, I want a consistent navigation structure across all marketplace sections, so that I can easily switch between skins, skills, and tasks.

#### Acceptance Criteria

1. THE Skin_Marketplace SHALL provide a top-level navigation bar with links to Skins (`/market`), Skills (`/market/skills`), Tasks (`/market/tasks`), and Showcase (`/showcase`)
2. WHEN the user is on any `/market/*` route, THE Skin_Marketplace SHALL highlight the active section in the navigation bar
3. THE Skin_Marketplace SHALL display a search input that searches across skins, skills, and tasks simultaneously
4. WHEN search results span multiple categories, THE Skin_Marketplace SHALL group results by category with counts
5. THE Skin_Marketplace SHALL render using the agentrix-ink dark theme with Tailwind utility classes and Lucide icons consistent with the existing design system

### Requirement 9: Marketplace SEO and Social Sharing

**User Story:** As a product stakeholder, I want marketplace pages to be discoverable by search engines and shareable on social media, so that the platform gains organic traffic.

#### Acceptance Criteria

1. THE Showcase_Page SHALL render with server-side generated HTML including structured metadata (title, description, og:image)
2. WHEN a skin detail page `/market/skin/[id]` is shared, THE Skin_Marketplace SHALL generate a dynamic Open Graph image showing the pet skin thumbnail
3. THE Skill_Marketplace SHALL include JSON-LD structured data for each skill listing (type: Product, name, price, description)
4. THE Task_Marketplace SHALL include JSON-LD structured data for each task (type: Offer, name, price)
5. WHEN the Showcase_Page is rendered server-side, THE Showcase_Page SHALL return initial data within 200ms TTFB for the first 12 items

### Requirement 10: AXP Integration in Marketplace

**User Story:** As a user, I want to see AXP earning opportunities and spending options in the marketplace, so that I understand the value of participating in the ecosystem.

#### Acceptance Criteria

1. WHEN a skin supports AXP partial payment, THE Skin_Card SHALL display an "AXP Accepted" badge with the maximum AXP discount percentage
2. THE Skill_Marketplace SHALL display AXP earning potential for each skill (estimated AXP per invocation)
3. THE Task_Marketplace SHALL display AXP bonus rewards alongside the base task reward when applicable
4. THE Showcase_Page SHALL display a "Featured by Community" section highlighting skins that earned the most AXP rewards
5. WHEN a user is authenticated, THE Skin_Marketplace SHALL display the user's current AXP balance in the marketplace navigation bar
