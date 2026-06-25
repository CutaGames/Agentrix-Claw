# Agentrix 官网内容审计（2026-05-16）

> 目标：从"用户初次到访 / 生态合作方初次到访"两个角度审视官网，识别需要优化的内容、布局、信息一致性问题。
> 输入：`frontend/pages/*.tsx`、生产环境实测、PRD `docs/web-prd-v4.md`。
> 当前生产 commit：`6e9e5ed6` 已部署到 `agentrix.top`。

---

## TL;DR

**官网结构和页面骨架** 已经成熟（25/25 主路径都 200，含 4 大产品端 + 5 大集市页 + 3 大生态页 + 4 大合规/帮助页）。**但内容层有几个明确需要优化的地方**：

| 维度 | 现状 | 优化建议 | 优先级 |
|------|------|---------|------|
| **Hero 与 Features 版本号不一致** | Hero 写"v4 上线"，FeaturesSection 标"v3.0 重大更新" | 统一为 v4 | 🔴 P0 |
| **Download 页只有 Windows** | `/download` 只跳 Windows .exe，移动端 APK 没接 | 加 Android APK / Watch APK 入口 | 🔴 P0 |
| **Showcase 重定向到 /market** | 历史 redirect | 是否保留 Showcase 独立页（用户共创案例展示）值得讨论 | 🟡 P1 |
| **生态合作方入口缺失** | 没有 `/partners` 或 `/ecosystem` | 加品牌合作 / KOL / 集成方入口 | 🟡 P1 |
| **路演 / 投资人入口缺失** | 没有 `/investors` 或 deck 下载 | 提供 PDF 路演下载 + Pitch deck overview | 🟡 P1 |
| **博客占位** | `/blog` 是 "Coming Soon" | 至少放 1-3 篇产品发布文 + 技术解析 | 🟡 P1 |
| **创作者门槛说明缺失** | `/market/leaderboard` 只看排行，没"如何成为创作者"引导 | 加 "Become a Creator" 引导 | 🟡 P1 |
| **国际化（多语言）只有中英** | 没有日 / 韩 / 越 | SE Asia / 日韩本地化（V4 PRD 提到优先级）| 🟢 P2 |
| **下载视频 / 短演示视频** | 首页无 hero 视频 | 加 30-60s 产品演示循环（已有素材：`docs/business/VIDEO_PRODUCTION_PLAN_v3_FINAL.zh-CN.md`） | 🟢 P2 |
| **价格页底部 FAQ** | `/pricing` 缺 5-档对比的常见问题 | 加 8-10 个 FAQ | 🟢 P2 |

---

## 1. 现状逐页评估

### 1.1 首页（`/`）— ⭐⭐⭐⭐ 整体已非常成熟

✅ **优点**：
- Hero "你养的每一只宠物，都是一个能赚钱的 AI Agent" 强力卖点
- 5 端图标（Mobile / Desktop / Web / Watch / Server）一目了然
- AXP 数值明确：1 AXP = $0.001
- 信任指标行：MPC 三方分片 / 6 族群灵魂 / A2A·ERC-8004·X402

🔴 **问题**：
- 顶部 badge 写 "Agentrix v4 · Pet-as-Agent Economy 正式上线"
- 但下方 V3FeaturesSection 仍用 "v3.0 · 本次重大更新" 文案 + 仅 8 个 V3 能力
- **内容版本错位**：用户会困惑"是 v3 还是 v4"

🟡 **建议**：
- 把 V3FeaturesSection 改名为 `V4FeaturesSection`，文案 v3 → v4
- 内容补 V4 新增能力（PetCreator 摄像头扫描 / Pet-as-Agent Marketplace / Cinderella Boost / NFC 盲盒 / Toy 配对 / NFT 铸造）

### 1.2 下载页（`/download` & `/downloads`）— ⭐⭐ 移动端缺失

**`/download`（单端）**：
- 仅 Windows 版本入口
- SmartScreen 引导写得详细（4 步操作）
- 系统要求清单完整

🔴 **问题**：
- 没有 Android APK / Watch APK 入口
- 用户在 Mobile 上点 "Download" → 还引导他装 Windows .exe

🟡 **建议**：
- `/download` 改成多平台 hub：Windows / macOS-coming / Android APK / iOS-App-Store / Watch APK
- 检测 `User-Agent` 自动高亮当前设备适配的版本
- 提供 Setup-via-QR：移动端访问 → 直接下 APK

### 1.3 价格页（`/pricing`）— ⭐⭐⭐⭐

`PricingTable.tsx` 已实现 5 档（Free / Lite / Plus / Pro / Elite），月付 / 年付切换。

🟡 **建议**：
- 补 8-10 个常见问题（"AXP 怎么用？"、"Free 能做什么？"、"取消方法？"、"团队订阅有吗？"）
- 加竞品对比表（已有 `CompetitiveTable.tsx` 但未在价格页展示）

### 1.4 帮助中心（`/help` `/help/{desktop,desktop/faq,mobile}`）— ⭐⭐⭐⭐⭐

✅ 全套用户手册已上线，本周已加移动端手册 `/help/mobile`，索引卡片齐全。

🟢 **建议**：
- 加搜索框（用户能在 manual 里全文搜）
- 加章节锚点目录（manual 通常很长，目前只能滚动）

### 1.5 集市相关（`/market` 系列）— ⭐⭐⭐⭐ 流程已通

`/market`、`/market/skills`、`/market/tasks`、`/market/leaderboard`、`/market/sell`、`/market/auction/[id]`、`/market/creator/[userId]` 都 200。

🟡 **建议**：
- 加 "Become a Creator" 引导页（`/market/become-creator`）：怎么开始创作 / 需要什么订阅 / 收入预期
- 创作者主页加"分享"按钮（Twitter / Discord）方便病毒传播
- Cinderella Boost 在 `/market` 页面卖点放大（首位出价者享 +5%）

### 1.6 隐私 / 服务条款（`/privacy` `/terms`）— ⭐⭐⭐⭐

GDPR / CCPA 完整 + 7 天数据删除 + 30 天导出。已经合规。

### 1.7 错误页（`/404` `/500`）— ⭐⭐⭐⭐ 已自定义

`/404` 萌宠风格 + 4 个有用导航。`/500` 复用 design language。

### 1.8 营销页（`/manifesto` `/features` `/clans` `/use-cases` `/security`）— ⭐⭐⭐ 内容深度不一

各页都 200 且有内容，但深度参差不齐。**最薄的是 `/use-cases` 和 `/security`**。

🟡 **建议**：
- 每个页面起码包含：Hero + 3-5 个亮点 + 1 个 CTA + 与首页一致的视觉
- `/use-cases` 加真实场景案例（金融 Agent / 编程助手 / 学习陪伴 / Co-Raising 共养案例）
- `/security` 加 MPC 3-share 钱包架构图 + ERC-8004 身份模型 + X402 微支付协议解释

### 1.9 缺失的页面

| 路径 | 用途 | 优先级 |
|------|------|------|
| `/partners` 或 `/ecosystem` | 集成方 / 品牌合作 / KOL 合作入口 | 🟡 P1 |
| `/investors` | 投资人路演 PDF + 简历摘要 | 🟡 P1 |
| `/blog` | 当前是 "Coming Soon"；至少放 1-3 篇 | 🟡 P1 |
| `/contact` | 商务合作 / 媒体咨询联系方式 | 🟢 P2 |
| `/market/become-creator` | 创作者引导 | 🟡 P1 |
| `/changelog` 或 `/release-notes` | 版本更新记录（透明度 + SEO）| 🟢 P2 |
| `/api` 或 `/developers/api` | 开放 API 文档（合作方需要）| 🟢 P2 |

---

## 2. 整体定位与对外形象

### 2.1 定位清晰度

**强**：
- 一句话定位明确：「Pet-as-Agent Economy」
- 核心数值：1 AXP = $0.001、5 端、6 族群、ERC-8004 / X402 / MPC

**待加强**：
- "我能用它来做什么？" 在首页只有抽象介绍（"陪你/帮你/替你赚钱"），缺具体使用场景
- "为什么选 Agentrix 而不是 ChatGPT/Claude？" 竞品对比可以从 CompetitiveTable 拉到首页

### 2.2 信任指标

**有**：MPC 3-share、ERC-8004、X402

**缺**：
- 用户证言（Testimonials）— 内测期可加 5-10 条 KOL/早期用户引用
- 媒体报道（Press / "As featured in"）— 等下次 PR 后补
- 安全审计（SOC 2 / 渗透测试报告）— GA 前争取拿到一个小型审计

### 2.3 SEO

**有**：所有页面 og:title/og:description/twitter:card 均已设置。

**待加强**：
- robots.txt 缺（应该有，但本次没看到部署）
- sitemap.xml 已有 27 路径（W-2 时建的）
- structured data（Schema.org）只有少数页面有

---

## 3. 视觉与品牌一致性

| 维度 | 状态 |
|------|:---:|
| 主色（紫 #8b5cf6 + 暖橙 #f59e0b + 亮绿 #14b8a6） | ✅ 全站统一 |
| 字体（Inter 自托管） | ✅ |
| Logo 用法 | ✅ |
| 暗色风格主导 | ✅ |
| 动效（aurora / hover scale） | ✅ |
| Favicon | ✅ |
| 移动端响应式 | 🟡 部分 console 页面破图（独立任务）|

---

## 4. 推荐 Sprint W-4 内容修复（5 天）

### Day 1：版本号统一 + V4 Features 重写
- 把 V3FeaturesSection 改 V4FeaturesSection（icon + 文案）
- 加 V4 新能力：PetCreator 摄像头扫描 / Cinderella Boost / NFC 盲盒 / Toy 配对 / NFT 铸造
- 估时：1 天

### Day 2：Download 页多平台
- `/download` 升级成 hub：Windows + Android APK + iOS App Store + Watch APK
- User-Agent 自动检测当前设备
- 加移动端 QR 码方便 PC 用户拿手机扫
- 估时：1 天

### Day 3：缺失页面补上
- `/partners`：4 类合作（品牌 / KOL / 集成方 / 学校）
- `/investors`：路演 PDF 下载 + 简短产品介绍
- `/blog`：先放 3 篇（"v4 上线公告" / "Pet-as-Agent 设计哲学" / "从 0 到 100 内测进展"）
- 估时：1.5 天

### Day 4：Use-Cases / Security 内容深化
- `/use-cases`：4 个详细场景案例
- `/security`：MPC 架构图 + 协议三件套深度解读
- 估时：1 天

### Day 5：Pricing FAQ + Creator 引导
- 价格页底部加 8 条 FAQ
- `/market/become-creator` 创作者引导页
- 估时：0.5 天

---

## 5. 不阻塞 GA 的低优先级

- 多语言（日 / 韩 / 越）— 有 SE Asia 用户后再做
- Hero 视频 — 等 `docs/business/VIDEO_PRODUCTION_PLAN_v3_FINAL.zh-CN.md` 视频成片
- `/changelog` 自动从 git tag 生成
- 客服聊天浮窗（Intercom / Crisp） — Sprint W-5

---

## 6. 立即执行（本轮）

考虑到时间预算，以下属于"上线前必须修"的 P0：

1. **首页 V3 → V4 文案统一**（30 分钟）
2. **`/download` 页加 Android APK 入口**（45 分钟）
3. **生产 smoke 二次确认**（10 分钟）

非必须但 ROI 高：
4. **/blog 放至少 1 篇 v4 发布公告**（30 分钟）
5. **`/help/mobile` 卡片在 home 显眼位置加链接**（15 分钟）

---

> 本审计基于 2026-05-16 仓库快照。下次审计：v4 GA 公开发布后 7 天。
