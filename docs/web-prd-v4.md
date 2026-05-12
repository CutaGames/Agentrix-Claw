# Agentrix Web 端 PRD v4.0（Marketing + Console + Marketplace）

> **Web = 看台 + 工坊 + 集市**：V3 的 Marketing + Console 双形态保留，V4 把 Marketplace 升级为 Web 的第三主战场，承担「皮肤交易、Remix 树、创作者后台、排行榜、嵌入式宠物档案」。
>
> 本文件只写 Web 端 V4 增量。所有跨端契约引用 `agentrix-cross-platform-prd-v4.md`。V3 的 Marketing / Console 信息架构沿用 `web-prd-v3.md`。

- 版本: v4.0（与 V3 共存）
- 状态: Draft
- 技术栈: Next.js 15 + TypeScript + Tailwind + shadcn/ui（沿用）
- 上游: `agentrix-cross-platform-prd-v4.md` / `web-prd-v3.md`

---

## 0. V4 vs V3 Web 对照速读

| 维度 | V3 | V4 |
|------|-----|-----|
| 形态 | 双（Marketing / Console） | **三**（+ **Marketplace**） |
| Marketing 故事主轴 | "Living Pet 灵魂伙伴 + Working Agents" | "**生成你的 AI 萌宠 → 让它在 6 端陪你**" |
| Console Pet 模块 | 头像 + 状态展示 | + Wardrobe + 灵魂切换 + PetCreator 完整工坊 |
| Marketplace | 不存在 | **完整：浏览 / 上架 / 拍卖 / 租赁 / Remix 树 / 创作者后台 / 排行榜** |
| 嵌入式宠物档案 | 不存在 | `/p/[petId]` 公开档案 + iframe SDK + OG 卡片 |
| 开发者门户 | 不存在 | `developer.agentrix.top`（V5 W9，Web 项目下） |
| 家庭账号后台 | P3 计划 | 沿用 + 家庭宠纳入「灵魂×皮肤」 |
| 签名能力 | 0（不持 share） | 不变 |

---

## 1. 一句话定位（V4 升级）

**Agentrix Web V4 = 让全世界看见 Agentrix 萌宠（Marketing） + 让用户管理灵魂×皮肤×经济（Console） + 让创作者卖皮肤赚钱（Marketplace）**。

---

## 2. 三形态（V4 升级）

| 形态 | URL 段 | 目标用户 | Trust 要求 | V4 状态 |
|------|--------|---------|-----------|---------|
| Marketing | `/` + `/about` + `/pricing` + `/docs` + `/blog` + `/skills` + **`/showcase`（新）** | 未注册 / 投资人 / 媒体 | 0 | 升级 |
| Console | `/console/**` | 已注册 + 已绑定 | ≥ 1 | 升级 |
| **Marketplace（新）** | `/market/**` + `/p/[petId]` | 全员 | 浏览 0 / 交易 ≥ 1 | 全新 |

### 2.1 Marketing 升级要点

- **首屏 Hero**：从 V3 的「跨端 Living Agent」变为「3 秒生成你的萌宠」+ 视频 demo（PetCreator 文生 → 装备到 Mobile/Desktop/Toy）
- **新增 `/showcase`**：每日精选用户共创皮肤瀑布流，社交分享带 OG 卡片
- **`/pricing`**：明示 Free 3/月 / Pro 30/月 / Pro+ 无限的 PetCreator 配额

### 2.2 Console 升级要点

| 路径 | V3 | V4 |
|------|-----|-----|
| `/console` | Dashboard | + 萌宠状态卡 + 今日 Skin GMV |
| `/console/pet` | – | **新增**：当前主宠 + 灵魂切换 + Wardrobe + PetCreator 工坊 |
| `/console/agents` | Agents 总览 | 不变 |
| `/console/wallet` | Wallet read-only | + Skin 收入明细 |
| `/console/marketplace` | – | **新增**：嵌入 Marketplace（同 `/market` 单点登录） |
| `/console/family` | P3 | + 家庭宠管理 |

### 2.3 Marketplace 形态（V4 新增主战场）

| 路径 | 功能 |
|------|------|
| `/market` | 主页 / 推荐 / 排行榜 / 分类 |
| `/market/skin/[id]` | 皮肤详情：3D 预览 / 价格 / Remix 树 / 历史成交 |
| `/market/sell` | 上架向导（已生成皮肤 → 一口价 / 拍卖 / 租赁） |
| `/market/auction/[id]` | 拍卖大厅 |
| `/market/creator/[userId]` | 创作者主页 |
| `/market/leaderboard` | 排行榜（GMV / 收藏 / Remix） |
| `/p/[petId]` | **公开宠物档案**（任何人可访问，含 3D 嵌入） |

---

## 3. 三层愿景在 Web（V4 修订）

| 层 | Web 主阵地 | V4 增量 |
|----|-----------|--------|
| Living Pet（灵魂） | Marketing 视频 / Console Pet 卡片 | + 灵魂切换器 |
| Pet（皮肤） | Console Wardrobe + Marketplace 全栈 | **Web 是皮肤的最强承载端**（最大屏 / 最完整工坊） |
| Doer | Console Agents 总览 | 不变 |
| Economy | Console Wallet + Marketplace GMV | + Remix 分成 / Skin 销售报表 / 创作者后台 |

---

## 4. PetCreator 网页版（V4 主路径）

### 4.1 入口

- **`/console/pet/create`**（Console 内主入口）
- **Marketing CTA `/get-started`** → 注册后跳转到 PetCreator 第一步

### 4.2 三模式

| 模式 | UI |
|------|----|
| 文生 | 全宽 prompt + 风格预设 + 高级参数（PBR / 多边形数 / 输出格式） |
| 图生 | 拖拽上传 + 多图预览 |
| 双图融合 | 两张父图卡片 + 融合参数（外观倾向 A/B 滑块） |

### 4.3 进度可视化

WebSocket 实时进度条 + 已生成 thumbnail 网格。

### 4.4 完成后跳转

- 装备：直接装备并跳转 `/console/pet`
- 上架：直接进入 Marketplace 上架向导（`/market/sell?skinId=...`）

---

## 5. Marketplace 详细规格（V4 核心新增）

### 5.1 信息架构

```
/market
├── /trending
├── /new
├── /clan/[A-F]               按 6 族群筛选
├── /tag/[tag]                按标签
├── /skin/[id]                皮肤详情（3D 预览 + 价格 + Remix 树）
├── /auction/[id]             拍卖大厅（实时出价）
├── /creator/[userId]         创作者主页
├── /leaderboard              排行榜
└── /sell                     上架向导
```

### 5.2 上架向导（5 步 stepper）

1. 选择已生成皮肤
2. 设置元数据（名称 / 标签 / 适配族群）
3. 选定价模式：一口价 / 拍卖（起拍 + 时长） / 租赁（月租金）
4. 设置 Remix 分成比例 r ∈ [10%, 50%]
5. 审核确认 → 提交 → 平台审核 → 上架

### 5.3 公开档案 `/p/[petId]`

- 任何人可访问（无登录）
- 内容：宠物名 / 当前皮肤 3D 预览（VRM Web 渲染）/ 灵魂族群 / 主人头像 / 成就徽章 / 社交分享
- iframe SDK（V5）：第三方网站可嵌入：
  ```html
  <iframe src="https://agentrix.top/p/abc123?embed=1&size=400" width="400" height="400" />
  ```

### 5.4 反盗版后台

- 创作者举报入口
- DMCA 表单（48h 响应）
- 反向图搜（CLIP + perceptual hash）
- 管理员审核控制台

---

## 6. 与跨端 7 大主路径的 Web 适配

| 路径 | Web 行为 | V4 增量 |
|------|---------|--------|
| Handoff | 顶部粉色条 + 三按钮 | 不变 |
| Approval Routing | Web 发起 L2+ 必须跳 Mobile | 不变 |
| Wallet | 完整报表 + 导出 + 合规审计 | + Skin 销售报表 |
| Vitals | 不参与 | 不变 |
| Memory | Console 可配置隐私围栏 | 不变 |
| **Pet Creation（V4 新）** | `/console/pet/create` 完整工坊 | 全新 |
| **Skin Marketplace（V4 新）** | `/market` + `/console/marketplace` | **Web 主战场** |

---

## 7. 渲染器（V4 Web）

| 渲染器 | 落地 | V4 节点 |
|--------|-----|--------|
| SVG fallback | 已上线 | – |
| Rive Web Runtime | V4 W3 | – |
| VRM 低面 | V4 W5 | three.js + three-vrm |
| VRM 高面 + PBR | V4 W6 | + KTX2 / Draco 压缩 |

Marketplace 详情页强制 VRM 高面（产品价值核心）。

---

## 8. 开发者门户 `developer.agentrix.top`（V5 新增）

V4 阶段后期上线（V5 W9）：

- ClawCore SDK 下载 + 协议文档
- L2 联名 / L3 认证申请表
- 厂商收入仪表盘
- 认证流程：申请 → 样品提交 → SDK 自检通过 → Agentrix 抽样 → 颁发认证

托管在 Web 项目下，与主站共享登录。

---

## 9. 路线图（V4 Web）

| 阶段 | 周期 | 交付 |
|------|------|------|
| V4 P1 | W1-W2 | Marketing 首屏改 / 6 族群选择器 / `/console/pet` 卡片 |
| V4 P2 | W3-W4 | PetCreator 网页版 + 配额 / Stripe 支付 |
| V4 P3 | W5-W6 | Marketplace MVP（浏览 / 购买 / Remix 树） |
| V4 P4 | W7-W8 | 上架 / 拍卖 / 租赁 / 创作者后台 / `/p/[petId]` |
| V5 P5 | W9-W12 | iframe SDK / 开发者门户 / 排行榜 / 全球 PK |

---

## 10. Marketplace Ecosystem Integration (V4.1 增量)

> Source: Marketplace Ecosystem spec (`.kiro/specs/marketplace-ecosystem/design.md`) + Mobile Refactor whitepaper.
>
> **核心分工**：Web = 展示 + 发现（Discovery）；Mobile = 交易闭环（Transaction）。两端共享同一 NestJS + PostgreSQL 后端。Web 是 Marketplace 的主战场，承担 SEO 流量入口、创作者后台、Showcase 画廊、Remix 树可视化。

### 10.1 Web 在 Marketplace 中的定位

| 维度 | 说明 |
|------|------|
| 角色 | Marketplace 主战场 + Discovery + 创作者后台 + Showcase 画廊 |
| 核心页面 | `/market`（Skins/Skills/Tasks/Showcase 四大板块）、`/showcase`、`/market/skin/[id]`、`/market/creator/[userId]` |
| 渲染 | SSR（getServerSideProps）+ SEO 优化（JSON-LD / Open Graph / TTFB < 200ms） |
| 交易 | 支持完整 Cart → Checkout → SmartCheckout（混合支付）→ Order 闭环 |
| 与 Mobile 关系 | 生成 `agentrix://` Deep Link 推用户到 Mobile 完成未登录用户的支付；已登录用户可在 Web 完整结账 |

### 10.2 /market 统一路由结构（V4.1）

| 路由 | 页面 | 数据源 | SSR |
|------|------|--------|:---:|
| `/showcase` | 每日精选画廊（18 只官方预制皮肤 + featured UGC） | `GET /api/v1/market/skins?sort=featured&limit=24` | ✅ |
| `/market` | 皮肤交易发现（Trending / New / Leaderboard） | `GET /api/v1/marketplace/pets` | ✅ |
| `/market/skills` | 技能市场 | `GET /api/v1/skill-listings?status=approved` | ✅ |
| `/market/tasks` | 任务市场 | `GET /merchant-tasks/marketplace/search` | ✅ |
| `/market/skin/[id]` | 皮肤详情（3D 预览 + Remix 树 + 历史成交） | `GET /api/v1/marketplace/pets/:id` + `GET /api/v1/pet/skins/marketplace/:id` | ✅ |
| `/market/creator/[userId]` | 创作者主页 | 聚合该用户所有 skins / skills / tasks | ✅ |
| `/market/leaderboard` | 排行榜（GMV / 收藏 / Remix） | 聚合 API | ✅ |
| `/p/[petId]` | 公开宠物档案 | 已在 §5.3 定义 | ✅ |

### 10.3 /showcase 页面升级（从渐变占位到真实资产）

V3 的 `/showcase` 使用渐变色占位块；V4.1 完全替换：

| 维度 | V4 之前 | V4.1 |
|------|--------|------|
| 视觉 | 渐变色方块 | 真实 `thumbnailUrl`（fallback 到 clan 渐变） |
| 数据源 | mock | `GET /api/v1/market/skins?sort=featured` |
| 筛选 | 无 | 按 6 族群（A-F）筛选 |
| 分享 | 无 | OG 卡片（og:image 从 skin thumbnail 派生） |
| SEO | 空 | JSON-LD Product 结构化数据 |

### 10.4 Web ↔ Mobile 交易架构

| 维度 | Web | Mobile |
|------|-----|--------|
| 角色 | 完整交易闭环（购物车 → Checkout → SmartCheckout 混合支付 → 订单） | 中枢（陪伴 + 审核 + 分享裂变 + 也可完成交易） |
| Checkout | 完整 Web Checkout | In-app checkout (Stripe/Crypto via WebBrowser) 或跳 Web |
| Marketplace 深度 | 完整浏览 + 上架（含拍卖 / 租赁 / Remix 分成设置） + 购买 + 创作者后台 | 浏览 + 购买 + 装备 + 简化上架（仅已生成皮肤） |
| Deep Link 方向 | 生成 `agentrix://` 推 Mobile | 接收 + 解析 |
| 后端 | 共享 NestJS + PostgreSQL | 同一后端 |

关键原则：
- Web = 完整交易闭环 + 展示 + 发现主战场
- Mobile = 中枢（陪伴 + 审核 + 分享裂变 + 也可完成交易）
- 两端共享同一后台（NestJS + PostgreSQL）
- Deep Link 从 Web 到 Mobile 是辅助入口，不是唯一路径

### 10.5 18 只官方预制皮肤（Platform Seed）

Web 是这 18 只官方皮肤最主要的曝光渠道：

| 属性 | 值 |
|------|-----|
| 总数 | 18（6 族群 × 3 只） |
| 价格 | 500–3000 AXP（约 $0.50–$3.00） |
| 支付 | AXP 积分（部分或全额） |
| 数据库标记 | `source='platform'` / `visibility='public'` / `moderation_status='approved'` / `featured=true` |
| 曝光位置 | `/showcase` carousel 顶部 + `/market` Trending 前 6 位 |

目的：
1. 向用户展示 AXP 积分价值
2. 为 Marketplace seed 高质量初始内容
3. 绑定 NFC 盲盒 / L2 联名 SKU 的默认皮肤资产

### 10.6 新增后端 API（V4.1）

| 端点 | 用途 | 认证 | 备注 |
|------|------|------|------|
| `GET /api/v1/market/skins` | 皮肤浏览（排序/族群/游标分页） | 公开（无认证） | 聚合 `pet_skins` + `marketplace_pet_listings` LEFT JOIN |
| `GET /api/v1/market/search` | 跨表统一搜索（skins + skills + tasks） | 公开 | 返回分组结果与计数 |

查询参数：
- `sort`: `featured` | `newest` | `popular`
- `clan`: `A` | `B` | `C` | `D` | `E` | `F`
- `limit` / `cursor`: 游标分页

数据库扩展 — `pet_skins` 表新字段：

```sql
ALTER TABLE pet_skins ADD COLUMN clan VARCHAR(2) DEFAULT NULL;
ALTER TABLE pet_skins ADD COLUMN like_count INTEGER DEFAULT 0;
ALTER TABLE pet_skins ADD COLUMN view_count INTEGER DEFAULT 0;
ALTER TABLE pet_skins ADD COLUMN remix_count INTEGER DEFAULT 0;
ALTER TABLE pet_skins ADD COLUMN featured BOOLEAN DEFAULT FALSE;
```

### 10.7 MarketplaceLayout + 核心组件

统一导航壳，包裹所有 `/market/*` 和 `/showcase` 页面：

| 组件 | 职责 |
|------|------|
| `MarketplaceLayout` | 顶部导航（Skins/Skills/Tasks/Showcase 四 tab）+ 全局搜索 + AXP 余额展示（已登录）+ 底部 "Download App" 持久横幅 |
| `SkinCard` | 缩略图（fallback 到 clan 渐变）+ 价格 + "Buy on Mobile" Deep Link + AXP Accepted badge + 拍卖倒计时 |
| `SkillCard` | 名称 + 描述 + 分类 + 价格 + 安装数 + AXP 收益估算 |
| `TaskCard` | 标题 + 奖励 + 任务类型 + 必需技能 + 截止时间 + AXP bonus |
| `MobileDeepLink` | 生成 `agentrix://` URI + App Store / Google Play fallback + QR code（使用 `qrcode.react`） |

### 10.8 AXP 积分在 Web Marketplace

| 场景 | 行为 |
|------|------|
| 皮肤价格 | 支持 AXP 部分 / 全额支付（`axpAccepted` + `axpDiscountPercent`） |
| 技能列表 | 显示每次调用预估 AXP 收益 |
| 任务列表 | 显示 AXP 奖励 bonus |
| 导航栏 | 已登录用户展示当前 AXP 余额 |
| 汇率 | 1 AXP = $0.001 |
| 官方皮肤定价 | 500–3000 AXP |

### 10.9 Mobile Deep Link 格式（Web 生成）

```
agentrix://{action}?resourceId={id}&userId={uid}&token={tok}
```

支持的 action：

| Action | 跳转目标 | 使用场景 |
|--------|---------|---------|
| `agentrix://buy?resourceId={skinId}` | 皮肤购买 | 未登录 / 首选移动支付用户 |
| `agentrix://bid?resourceId={auctionId}` | 拍卖出价 | 需要生物认证的大额出价 |
| `agentrix://install_skill?resourceId={skillId}` | 技能安装 | Agent 装配需移动端 Trust 3 |
| `agentrix://accept_task?resourceId={taskId}` | 任务接受 | 移动端签名接单 |

已认证用户在 Web 生成 Deep Link 时自动注入 `userId + token`，避免移动端重新登录。

### 10.10 SEO 结构化数据

| 页面 | 结构化数据 |
|------|----------|
| `/market/skills/[id]` | JSON-LD `@type: Product`（name / description / offers.price） |
| `/market/tasks/[id]` | JSON-LD `@type: Offer`（name / description / price） |
| `/market/skin/[id]` | Open Graph（og:image 从 skin thumbnail 派生）+ og:type: product |
| `/p/[petId]` | 同上 + 专属 OG 卡片 |

`og:image` 为 `null` 时 fallback 到默认 Agentrix OG 图。

### 10.11 订阅与配额（5 级）

| Tier | 价格 | AXP Cashback | Skin 上架配额 | 拍卖费 |
|------|------|-------------|-------------|-------|
| Free | $0 | 0% | 1 | 10% |
| Lite | $4.99/mo | 5% | 3 | 8% |
| Plus | $14.99/mo | 10% | 10 | 5% |
| Pro | $29.99/mo | 15% | ∞ | 2% |
| Elite | $69/mo | 20% | ∞ | 0% |

额外权益：Auto-Earn 并行槽位随级别扩展；L3 co-sign 在 Pro+ 启用；Pet SDK beta 在 Elite 开放；家庭席位在 Plus+ 开放。

> 权威数值以跨端顿领 `agentrix-cross-platform-prd-v4.md` §13.7 为准。

### 10.12 AXP 中心 Web 页面

V4.1 在 Web Console 新增 AXP 中心（与 Mobile AxpCenterScreen 等价）：

| 路径 | 用途 |
|------|-----|
| `/console/axp` | AXP 余额 + 流水 + 过期提醒（FIFO 可视化） |
| `/console/axp/shop` | 兑换商店（限定皮肤 / 置顶位 / NFT 预售资格） |
| `/#axp`（Marketing 锚点） | 首页介绍 AXP 体系：1 AXP = $0.001 / 12 月 FIFO 过期 / 订阅返现阶梯 |
| `/pricing` | 完整 5 档对照表 + AXP cashback 曲线 + 年付 10× 说明 |

数据源：`GET /api/v1/axp/balance` + `GET /api/v1/axp/ledger`。

Marketing 合规要点：所有 AXP 相关文案明确「软积分 / 非证券 / 非货币」，AX 代币仅描述为 Phase 3+ 合规就绪后的兑换接口预留。

### 10.13 共养 / 贺卡 Web Landing（裂变落地页）

Mobile Phase 1 的多人游戏分享链接落地到 Web（未登录用户也可查看）：

| 路径 | 来源 | 行为 |
|------|-----|------|
| `/co-raising/[token]` | Mobile 分享 | 显示主宠 3D 预览 + "帮它喂食 +5 AXP / 注册拿 500 AXP" + App 下载 CTA |
| `/greeting/[token]` | Mobile 贺卡分享 | 显示贺卡模板 + 发送者主宠 + "收下 +20 AXP / 打开 App 回礼" |

技术要点：
- `og:type=website` + 通用预览图（不依赖 universal link 检测，避免 Twitter / WeChat 屏蔽）
- 已安装 App 的用户点击 → universal link 拉起 App（`agentrix://co_raising` / `agentrix://greeting`）
- 未安装 App → Web landing 完整渲染 + App Store / Google Play 按钮

### 10.14 错误处理与降级

| 场景 | 处理方式 |
|------|---------|
| 网络超时 / 5xx | 本地化错误 + 重试按钮 |
| 401（需认证操作） | 引导登录；浏览类不受影响 |
| 404 | 显示「内容不存在」 |
| 空结果集 | Empty state + 引导创作 / 发布 |
| 图片加载失败 | SkinCard fallback 到 clan 渐变 |
| AXP 余额获取失败 | 导航栏隐藏余额，不阻塞渲染 |
| Deep Link 不可用 | Fallback 到 App Store / Google Play |
| SSR 数据超时 | 返回空数据 + 客户端 hydration 重试 |

所有加载态使用 skeleton 占位，避免 CLS (Cumulative Layout Shift)。

---

## 11. 与 V3 引用

| V4 主题 | V3 引用 |
|--------|--------|
| Marketing / Console 双形态 | `web-prd-v3.md` §0 |
| 不持签名 share | `agentrix-cross-platform-prd-v3.md` §8 |
| 经济报表合规 | `web-prd-v3.md` §6 / `agentrix-cross-platform-prd-v3.md` §9 |
