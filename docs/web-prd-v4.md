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

## 10. 与 V3 引用

| V4 主题 | V3 引用 |
|--------|--------|
| Marketing / Console 双形态 | `web-prd-v3.md` §0 |
| 不持签名 share | `agentrix-cross-platform-prd-v3.md` §8 |
| 经济报表合规 | `web-prd-v3.md` §6 / `agentrix-cross-platform-prd-v3.md` §9 |
