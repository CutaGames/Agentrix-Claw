# Agentrix Web 端 PRD v3.0（Marketing + Console）

> **Web = 说服 + 后台**：Marketing 让新用户信任并注册，Console 让已注册用户完成移动端做不了的"长" 操作（企业后台 / 开发者后台 / 合规审计 / 完整报表 / 家庭账号管理）。
>
> 本文件只写 Web 端实现，不重写跨端层。所有跨端契约引用顿领 PRD `agentrix-cross-platform-prd-v3.md`。

- 版本: v3.0（上接 `frontend/` 现有实现，属于**大规模重构 + 骨架继承**）
- 定位: Marketing Site + Agent Console（双形态）
- 技术栈: Next.js 14 + TypeScript + Tailwind + shadcn/ui + Lucide（沿用 `frontend/` 已有基建）
- 规划源: `plans/agentrix-cross-platform-prd-v3-fdc618.md` §5

---

## 0. 一句话定位 + 双形态

### 0.1 一句话定位

**Agentrix Web = 说服新用户相信我们（Marketing）+ 让已用户完成 Mobile 做不完的长任务（Console）**。二者共享登录但导航区分；Console 是"重看轻改"，真实签名永远在 Mobile。

### 0.2 双形态一览

| 形态 | URL 段 | 目标用户 | 主视觉 | Trust 要求 |
|------|-------|---------|-------|-----------|
| **Marketing Site** | `/` + `/about` + `/pricing` + `/docs` + `/blog` + `/careers` + `/skills` | 未注册 / 新用户 / 投资人 / 媒体 | 视觉强、动效多、讲故事 | Trust 0 |
| **Agent Console** | `/console/**` | 已注册 + 已绑定设备 | 工具密、表格强、数据深 | Trust ≥ 1（登录） |

### 0.3 不做的事（明示）

- **不做**: Web 端聊天窗口（主战场在 Desktop Pro Mode / Mobile），Web 聊天只作为演示/体验入口，不承载生产用途。
- **不做**: Web 签名（永不持 MPC share）。任何 L2/L3 必须跳转 Mobile。
- **不做**: Web 端桌宠（主宠在 Desktop Living Agent / Mobile Pet Companion）。
- **不做**: Web 移动端完整版（响应式但不替代 Mobile App）。

---

## 1. 三层愿景在 Web 的体现

| 层 | Web 主阵地 | 说明 |
|----|-----------|------|
| **Living Agent** | Marketing 情感传播 + Console 主宠状态展示 | Marketing 视频/故事 / Console 顶部状态徽 |
| **Doer** | Console Agent 总览 + Team 管理 + 任务看板 | read-only 为主，只做配置 / 查看 |
| **Economy** | Console **完整经济后台**（最强表达端） | SplitPlan 配置 / 报表导出 / 合规审计 / 开发者后台 / 企业后台 |

---

## 2. 现状基线（frontend/ 审计）

### 2.1 frontend/ 现状

- **100+ pages** 在 `pages/` 或 App Router
- **460+ src files**（组件 / hooks / utils）
- 已有模块（能识别的）:
  - 登录 / 注册 / OAuth
  - 基础 Dashboard
  - Stripe 订阅 (部分真实, 部分空壳)
  - Agent 列表 / 管理 (早期版本)
  - 部分 Marketing 页 (首页 / 定价 / 文档)
  - 邀请码系统
  - Presence Dashboard (v2, 需升级到 v3)

### 2.2 现状问题（引用 `CROSS_PLATFORM_LAUNCH_AUDIT.zh-CN.md`）

| 问题 | 严重性 | 修复节点 |
|------|--------|---------|
| Marketing / Console 导航混杂无明确分界 | 高 | P0 |
| 100 页信息架构未按 v3 双形态重组 | 高 | P0 |
| 经济后台数据为空壳 / 不完整 | 高 | P0-P2 |
| Stripe 已真实但 Web3 链路未贯通 | 高 | P1 |
| 主宠状态展示不存在 | 中 | P0 |
| 开发者后台 / 商家后台不存在 | 中 | P2 |
| 家庭账号后台不存在 | 低 | P3 |
| 部分旧状态文档污染 frontend/*.md | 低 | 归档期 |

### 2.3 frontend/ 根目录遗留状态文档（需归档）

以下文档是 **工程历史笔记**，应从 frontend/ 移出到 `docs/_archive/frontend-old-status-docs/`：

```
DEVELOPMENT_STATUS.md
BACKEND_CONTRACT_WORK.md
PAYMENT_FEATURES_SUMMARY.md
TEST_SUMMARY.md
WALLET_STRIPE_SETUP.md
一次性修复所有编译错误.md
安装jszip说明.md
系统性问题排查.md
编译修复总结.md
解决npm网络问题.md
```

理由: 非 PRD 级文档，对外无价值；保留在 frontend/ 会造成新人困扰。

### 2.4 P0 Web 重构范围（明示）

P0 不翻新所有 100 页。优先级：

1. **Console 核心** (P0): 登录 → 首页 → Agent 总览 → Presence Dashboard v3 → Wallet read-only → Stripe 订阅。
2. **Marketing 骨架翻新** (P0): 首页 / 定价 / 邀请码落地页；其他页面维持现状并在 P1-P3 分批翻新。
3. **企业后台 + SplitPlan UI** (P1): Trust ≥ 1 后进入。
4. **开发者后台 + Market 后台** (P2): Skill 发布 / 收入 / 审核。
5. **家庭账号后台** (P3): 顿领 §3.9。

---

## 3. 竞品对标（Web 视角）

### 3.1 对标矩阵

| 对手 | 优势 | Agentrix Web v3 的回答 |
|------|------|---------------------|
| **Vercel / Railway / Supabase Dashboard** | 开发者后台体验 | 我们面向 agent 开发者 + 经济可视化（独家） |
| **Stripe Dashboard** | 支付 + 商家后台 | 我们叠加 agent 经济 + SplitPlan（独家） |
| **OpenAI Playground / Anthropic Console** | Dev 体验 | 我们 + 跨端 + Skill Market + Economy |
| **Character.AI Web** | 主宠聊天 | 我们只做演示聊天，重心在后台 |
| **Notion / Linear** | 企业后台 UX | 我们 agent 专属 + BudgetPool + 团队 A2A |
| **Raycast Pro Web** | 扩展市场 | 我们 Skill Market + 经济返利 |

### 3.2 差异化三板斧

1. **Web Console 是经济后台顶峰**：SplitPlan / CommissionV2 / BudgetPool / 税务对账 / 开发者收入，Mobile / Desktop 都做不了这么完整。
2. **Marketing 讲完整故事**：Living Pet + Doer + Economy 三层愿景用视觉 + 动效一次讲清，其他家都是单点。
3. **家庭账号后台** (P3)：独家的多人 / 多设备 / 多主宠管理界面。

---

## 4. Marketing 形态详规

### 4.1 核心页面清单（P0 必须 + P1-P3 翻新）

| URL | 名字 | P0 状态 | P0-P3 |
|-----|------|---------|-------|
| `/` | 首页 | **P0 重写** | P0 主站 + P1 视频 + P2 多语 |
| `/pricing` | 定价 | **P0 重写** | P0 三档 + P2 企业档 |
| `/invite` | 邀请码落地 | **P0 重写** | P0 + P1 活动 |
| `/about` | 关于 | P1 翻新 | – |
| `/manifesto` | 宣言（Living Agent / Doer / Economy） | P1 新建 | – |
| `/docs` | 文档 | P1 翻新（MDX） | – |
| `/blog` | 博客 | P2 翻新 | – |
| `/skills` | Skill Market 公开展示 | P2 新建 | – |
| `/agents` | Agent 模板展示 | P2 新建 | – |
| `/developers` | 开发者专页 | P2 新建 | – |
| `/enterprise` | 企业方案 | P2 新建 | – |
| `/family` | 家庭方案（P3） | P3 新建 | – |
| `/careers` | 招聘 | 现状保留 | – |
| `/press` | 媒体 | 现状保留 | – |
| `/changelog` | 更新日志 | P1 翻新 | – |
| `/security` | 安全白皮书 | P1 新建 | – |
| `/privacy` | 隐私政策 | 现状保留 + P0 更新 | – |
| `/terms` | 服务条款 | 现状保留 + P0 更新 | – |

### 4.2 首页（/）关键模块（P0 重写）

```
┌─────────────────────────────────────────────┐
│   [ Hero 动效：一只 Living Pet 出现 ]         │
│                                             │
│   「你的 Agent 不再是工具，是活着的伙伴」      │
│   副标题：Living Agent / Doer / Economy      │
│                                             │
│   [ 主 CTA: 开始 ] [ 次 CTA: 看 demo ]       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│   三层愿景展示（视觉分割）:                   │
│   1. Living Agent: 主宠视频                  │
│   2. Doer: Codex 级演示（屏幕录制）          │
│   3. Economy: Auto-Earn 数据图                │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│   竞品对比表（Agentrix vs Cursor / ChatGPT） │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│   跨端展示（5 端动态图）                      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│   用户证言 + 投资背书                        │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│   页脚: 链接 / 社交 / 下载入口                │
└─────────────────────────────────────────────┘
```

### 4.3 定价页（/pricing）P0

| 档位 | 月费 | 额度 | 目标 |
|------|------|------|------|
| **Free** | $0 | 主宠 + 1 working agent + 基础 Voice Quick | 获客 |
| **Pro** | $20 / 月 | 3 agents + Auto-Earn + Skill Market + 全端 | 核心 |
| **Team** | $50 / 座 / 月 | 团队 A2A + BudgetPool + 开发者后台 | 专业 |
| **Enterprise** | 定制 | SSO + self-host + 税务 + 合规 + SLA | 大客户 |

### 4.4 Marketing 主题 / 动效标准

- **主色**: 黑 + 深紫 + 电光蓝（科技 + Soul）
- **强调色**: 橘黄（Auto-Earn 数字 / CTA）
- **字体**: Inter / Space Grotesk
- **动效库**: Framer Motion + Lottie（视频占位）
- **LCP**: < 1.5s
- **CLS**: < 0.1

### 4.5 营销 SEO / GEO

- **SEO**: Next.js App Router + static export + sitemap + structured data
- **GEO（国内）**: 单独域名（agentrix.cn）+ 镜像 CDN + 合规 ICP
- **OpenGraph + Twitter Card** 完整
- **多语**: P2 英 / 中简 / 中繁 / 日

---

## 5. Console 形态详规

### 5.1 Console 顶级 IA（信息架构）

```
/console                            ← 登录后首页 Dashboard
├── /console/agents                 ← Agents 总览
│   ├── /console/agents/[id]       ← 单 agent 详情
│   └── /console/agents/new        ← 新建 agent
├── /console/team                   ← 团队视图（A2A / BudgetPool）
│   ├── /console/team/members
│   ├── /console/team/budget
│   └── /console/team/a2a
├── /console/wallet                 ← Wallet read-only + Stripe
│   ├── /console/wallet/balances
│   ├── /console/wallet/transactions
│   ├── /console/wallet/subscription
│   ├── /console/wallet/auto-earn
│   └── /console/wallet/reports    ← 完整报表导出
├── /console/skills                 ← 已装 skills 管理
│   ├── /console/skills/market     ← Skill Market 后台视图
│   └── /console/skills/developer  ← 开发者后台（P2）
├── /console/memory                 ← User Memory 管理（顿领 §5.5）
├── /console/presence               ← Presence Dashboard v3
├── /console/handoff                ← Handoff 历史
├── /console/approvals              ← 审批历史 / 审计日志
├── /console/settings
│   ├── /console/settings/profile
│   ├── /console/settings/devices  ← 5 端设备管理
│   ├── /console/settings/engines  ← 引擎切换（顿领 §3.8）
│   ├── /console/settings/privacy  ← 隐私围栏（顿领 §5.5.2）
│   ├── /console/settings/billing
│   └── /console/settings/shortcut-editor  ← Shortcut 编辑器（§7）
├── /console/family (P3)            ← 家庭账号后台
│   ├── /console/family/members
│   ├── /console/family/devices
│   ├── /console/family/pet        ← Family Pet 管理
│   └── /console/family/permissions
└── /console/enterprise (Team+)     ← 企业后台
    ├── /console/enterprise/seats
    ├── /console/enterprise/sso
    ├── /console/enterprise/audit
    └── /console/enterprise/compliance
```

### 5.2 Dashboard（/console）P0

```
┌──────────────────────────────────────────┐
│  顶部导航: Logo + 搜索 + 主宠状态徽 + 通知 │
├──────────────────────────────────────────┤
│  欢迎回来, [用户名]                       │
│                                          │
│  ┌─────────────┬─────────────┬────────┐  │
│  │ Agents      │ Wallet      │ Team   │  │
│  │ 3 active    │ $128.50     │ 2 ppl  │  │
│  └─────────────┴─────────────┴────────┘  │
│                                          │
│  📊 Presence Dashboard v3（跨端在线状态）│
│  💰 今日 Auto-Earn 折线                  │
│  📋 待处理审批                          │
│  🔔 最近事件                             │
└──────────────────────────────────────────┘
```

### 5.3 Agents 总览（/console/agents）P0

- 表格视图 + 卡片视图切换
- 列: 头像 / 名字 / 状态 / 今日任务数 / 今日收入 / 权限 / 操作
- 筛选: active / idle / error / archived
- 批量操作: 暂停 / 启用 / 查看日志
- 点击进入单 agent 详情（记忆 / 权限 / 经济 / 交互历史）

### 5.4 Wallet 完整报表（/console/wallet）P0-P1

P0 落地:
- 余额 / 交易 / 订阅
- Stripe Customer Portal 嵌入

P1 补齐:
- Auto-Earn 完整分析（时序图 + 对比图）
- SplitPlan 可视化配置
- CommissionV2 阶梯配置
- BudgetPool 企业预算池

P2 补齐:
- 税务对账单下载
- 合规审计（7 年留存企业版）
- 导出 CSV / Excel / PDF

### 5.5 Presence Dashboard v3（/console/presence）P0

- 顿领 §7.1 `user.{user_id}.presence` 的完整视图
- 5 端在线状态 + 主端标识 + 每端电量 / 网络
- 近 24h 使用时序
- Handoff 历史
- 跨端事件日志（可筛选）

### 5.6 Handoff 历史（/console/handoff）

- 所有历史 handoff 请求 / 接受 / 拒绝
- 筛选: 起止端 / 任务类型 / 时间
- 详情: task_context_ref + 完成状态 + 时长

### 5.7 审批历史 / 审计日志（/console/approvals）

- 顿领 §8.7 审计日志的完整视图
- 筛选: Trust 等级 / 动作 / 端 / 时间
- 导出（企业版）
- 每条审批的完整轨迹（起点端 → 签名端 → 协签端）

### 5.8 开发者后台（/console/skills/developer）P2

- Skill 开发者专属
- 我的 Skills 列表（草稿 / 审核中 / 已上架 / 下架）
- 每个 skill 的数据: 安装量 / 调用量 / 收入 / SplitPlan
- 新建 skill（提交 / TestFlight / 正式审核）
- 开发者文档 + SDK 下载

### 5.9 市场后台（Skill Market 后台）P2

- Skill 审核工作台（仅管理员 / 合作伙伴）
- 财务流水 / 批准打款 / 下架违规

### 5.10 企业后台（/console/enterprise）P1-P2

- 付费席位管理
- SSO（OIDC / SAML）配置
- BudgetPool 管理
- 合规审计（7 年留存）
- API Key 管理（企业自部署）

### 5.11 家庭账号后台（/console/family）P3

**顿领 §3.9 落地**。

- 家庭成员管理（邀请 / 扫码 / 权限）
- 共享设备管理（智能音箱 / 车机 / 家用平板）
- Family Pet 创建 + 外观 + 人格（用户投票）
- Household Agent 配置（安防 / 娱乐 / 购物）
- 权限矩阵（谁能做什么 L1+ 动作）
- 访客模式（扫码入家一次性访问）

### 5.12 Shortcut 编辑器（/console/settings/shortcut-editor）P2

- 可视化配置 iOS Shortcuts / Android Routines / 小艺技能的模板
- 配置完成后推送同步到 Mobile（通过 Realtime）
- 市场模板库 + 用户分享

---

## 6. Living Pet 在 Web 的表达

### 6.1 Console 顶部主宠状态徽

- 顿领 §3.4 状态机同步显示
- Pill: 小头像 + emoji + 亲密度 lv
- 点击 → 跳 `/console/settings/engines`
- 主宠在 Web 不做 Live2D，仅 emoji + 状态色

### 6.2 Marketing 的主宠营销

- Hero 视频: 主宠短 5s 动画
- "你的伙伴" section: 3-5 张主宠不同情绪 / 装扮的图
- 不 play Live2D（重视性能 / LCP），视频或 WebP 动图即可

### 6.3 Family Pet 外观投票（P3）

- `/console/family/pet` 页面
- 家庭成员投票选主宠外观 / 人格
- 每 30 天可重新投票
- 投票结果同步到所有家庭设备显示

---

## 7. 跨端联动（引用顿领 §5）

### 7.1 Handoff（顿领 §5.1）

- Web Console 可发起 Handoff（把任务推到 Desktop / Mobile）。
- Web 作为接受方: 显示"接力"按钮，但实际接收体验差（Web 缺少真正工作面板），默认劝导"去 Desktop 接"。

### 7.2 Approval Routing（顿领 §5.2）

- Web Console 可发起 L0+L1 动作。
- L2+ 必须跳转 Mobile 签名: modal 显示"请打开手机 Agentrix 完成"+ QR 码（手机扫码直达 approval）。
- Web 永远 Trust=1（登录端），不升级到 2 或 3。

### 7.3 Wallet（顿领 §5.3）

- Web Console 展示**最完整的钱包投影**（报表 / 审计 / 税务 / 导出）。
- 任何写动作（充值 / 提现 / 订阅修改）都跳 Mobile 签名 或 Stripe Checkout hosted page。

### 7.4 Vitals（顿领 §5.4）

- Web 非 Vitals source，仅展示聚合数据（本周心率均值 / 久坐次数）。

### 7.5 Memory（顿领 §5.5）

- Web Console `/console/memory` 提供完整记忆管理:
  - 搜索
  - 标签（工作 / 私人 / 家庭）
  - 固定 / 删除
  - 批量导入 / 导出
  - Knowledge Base 文档上传（拖拽 / 批量）

---

## 8. Agent 经济在 Web（引用顿领 §9）

### 8.1 Web 是经济后台的顶峰

- Mobile 展示"最关键的当日数字 + 签名"。
- Desktop 展示"当下战况 + AgentEconomyPanel"。
- Web 展示**完整的经济史 / 配置 / 合规 / 报表**，read-only 为主但配置权限最高。

### 8.2 Web 独占的经济功能

| 功能 | 位置 | 阶段 |
|------|------|------|
| SplitPlan 可视化配置 | `/console/wallet/splitplan` | P1 |
| CommissionV2 阶梯配置 | `/console/settings/commission` | P1 |
| BudgetPool 管理 | `/console/team/budget` | P1 |
| 税务对账单下载 | `/console/wallet/reports` | P2 |
| 合规审计（7 年） | `/console/enterprise/audit` | P2 |
| Skill Market 开发者后台 | `/console/skills/developer` | P2 |
| Skill Market 审核后台（管理员） | 独立 `/admin/market` | P2 |
| 家庭账号经济分摊 | `/console/family/budget` | P3 |

### 8.3 读与写的边界

- **所有 L0 读**: Web 完整支持。
- **L1 配置类写**: Web 支持（SplitPlan / CommissionV2 / BudgetPool / 订阅变更 等）。
- **L2+ 支付 / 提现 / 跨链写**: Web 永远不做，弹窗引导 Mobile。

---

## 9. 数据 / 通信契约（引用顿领 §7）

### 9.1 Web 订阅的 Topics

- `user.{user_id}.presence`
- `user.{user_id}.pet.state`
- `user.{user_id}.handoff`
- `user.{user_id}.approval`
- `user.{user_id}.wallet`
- `user.{user_id}.economy.event`
- `user.{user_id}.surface.primary.changed`

### 9.2 Web 本地存储

| 数据 | 存储 | 加密 | TTL |
|------|------|------|-----|
| Session token | httpOnly cookie + refresh token | HTTPS + CSRF | 30 天 |
| UI 偏好 | localStorage | – | 永久 |
| Wallet projection 缓存 | sessionStorage | – | 60s |
| Memory query cache | sessionStorage | – | 10 min |
| Presence graph cache | sessionStorage | – | 5 min |
| 绝不存: 私钥 / MPC share / 生物特征 | – | – | – |

### 9.3 SSE / WebSocket

- 主通道: WebSocket（Supabase Realtime / 自研 Phoenix）
- 回退: SSE（HTTP/1.1 keep-alive）
- 浏览器兼容: Chrome / Edge / Safari / Firefox 最近 2 个大版本

### 9.4 Web 特有 API

- `/api/web/seo/sitemap`
- `/api/web/oauth/*` — 第三方登录
- `/api/web/invoice/pdf/{id}` — 发票下载（企业版）
- `/api/web/export/transactions.csv` — 报表导出

---

## 10. 安全模型（引用顿领 §8）

### 10.1 Web Trust 等级

- **Trust 0**: 未登录，只能访问 Marketing。
- **Trust 1**: 邮箱登录 / OAuth，访问 Console 所有 L0+L1。
- **Trust 2+**: Web 永远不升级，L2+ 动作强制跳 Mobile。

### 10.2 登录方式

- 邮箱 OTP / Magic Link（默认）
- OAuth: Google / Apple / GitHub
- Passkey / WebAuthn（P1）
- SSO（OIDC / SAML，企业版 P2）

### 10.3 CSP / Security Headers

- `Content-Security-Policy`: strict, 无 inline script
- `Strict-Transport-Security`: max-age=63072000
- `X-Frame-Options`: DENY
- `Referrer-Policy`: strict-origin-when-cross-origin
- `Permissions-Policy`: 最小化权限集
- HSTS preload 提交

### 10.4 防 CSRF / XSS

- SameSite=strict cookie
- CSRF token 在所有非 GET
- 严格 output encoding
- 定期 npm audit + Snyk 扫描

### 10.5 审计日志

- 任何 Web 触发的 L1+ 动作都走顿领 §8.7 审计。
- `/console/enterprise/audit` 完整展示 + 导出。

### 10.6 数据出口

- 所有 export / download 动作打日志。
- 企业版可限制导出（例如禁止员工下载全量交易）。

---

## 11. 非功能需求

### 11.1 性能

| 指标 | 目标 |
|------|------|
| Marketing LCP | < 1.5s（3G Fast） |
| Marketing CLS | < 0.1 |
| Console TTI | < 2.5s |
| Console 路由切换 | < 200ms |
| 大表格（10k rows）首屏 | < 1.5s（虚拟滚动） |
| Realtime 延迟 | < 500ms（WebSocket） |

### 11.2 浏览器兼容

- Chrome 最近 2 个大版本
- Edge 最近 2 个大版本
- Safari 最近 2 个大版本
- Firefox 最近 2 个大版本
- 不支持 IE / 旧 Edge

### 11.3 可访问性（A11y）

- WCAG 2.1 AA 合规
- 键盘导航全覆盖
- Screen reader 友好（ARIA label 完整）
- 高对比度模式
- 焦点可见

### 11.4 多语言（P2-P3）

- P0: English + 简体中文
- P2: 繁体中文
- P3: 日本語
- Next.js i18n + next-intl

### 11.5 CDN / 部署

- Vercel（国际）
- 阿里云 / 腾讯云 CDN（国内镜像 agentrix.cn）
- 自动化 CI/CD（GitHub Actions → Vercel Preview → Prod）

---

## 12. 实施路线图（引用顿领 §10 Web 列）

### 12.1 阶段与交付

| 阶段 | Web 关键交付 | 顿领映射 |
|------|-----------|--------|
| **P0 (3w)** | **Console MVP**: 登录 + Dashboard + Agents 总览 + Wallet read-only + Presence v3 + Stripe 订阅可下单 + Marketing 核心 3 页（首页 / 定价 / 邀请） | 顿领 §10.1 P0 Web 列 |
| **P1 (4w)** | **企业后台 MVP**: BudgetPool + SplitPlan UI + 席位 + 钱包完整报表 + Passkey 登录 + Marketing 翻新（about / docs / manifesto / security） | 顿领 §10.1 P1 Web 列 |
| **P2 (3w)** | **开发者后台 + 市场后台**: Skill 发布 / 审核 / 收入 + Auto-Earn 深度分析 + 税务 / 合规 + Shortcut 编辑器 + Marketing 多语 | 顿领 §10.1 P2 Web 列 |
| **P3 (4w)** | **家庭账号后台** + 5 端设备管理 + A11y + 日语 + /family 落地页 | 顿领 §10.1 P3 Web 列 |

### 12.2 P0 Gate

- [ ] Marketing 首页 / 定价 / 邀请码三页上线
- [ ] Console 登录流 + Dashboard 首屏
- [ ] Agent 总览表格（read-only）
- [ ] Wallet Balances + Transactions + Stripe 订阅
- [ ] Presence Dashboard v3 接入 Realtime
- [ ] Handoff 发起 / 历史
- [ ] frontend/ 根目录 10 份状态文档已归档

### 12.3 Web 专属里程碑

| 时间 | 里程碑 |
|------|-------|
| P0 W1 | 路由重组（Marketing / Console 分界） + frontend/*.md 归档 |
| P0 W2 | Console Dashboard + Agents 总览 |
| P0 W3 | Wallet + Stripe + Marketing 3 页 |
| P1 W2 | BudgetPool + SplitPlan UI |
| P1 W4 | 企业后台完整 + Passkey |
| P2 W1 | 开发者后台 |
| P2 W3 | 市场后台 + Shortcut 编辑器 |
| P3 W2 | 家庭账号后台 |
| P3 W4 | A11y + 多语 + 5 端设备管理 |

---

## 13. 成功指标

### 13.1 Web 专属指标

| 指标 | P0 目标 | P3 目标 |
|------|--------|--------|
| Marketing 月访问 UV | 20k | 500k |
| 注册转化率 | 2% | 5% |
| Console WAU | 1000 | 25000 |
| Console MAU | 3000 | 60000 |
| 平均 Session 时长 | 8 min | 18 min |
| Stripe 订阅转化 | 1% | 4% |
| 开发者后台活跃（开发者） | – | 500 |
| 企业后台活跃（企业） | – | 300 |
| LCP P75 | < 2s | < 1.2s |
| A11y WCAG AA 通过率 | 90% | 100% |

### 13.2 与顿领指标的关系

- **Cross-Surface DAU** 贡献：Web 是多端用户的"长操作"补充，P3 贡献 30% 跨端用户。
- **企业试用 / 付费席位**: 主要通过 Web 企业后台产生。
- **Skill Market GMV**: 开发者后台是 Skill 发布主战场。

---

## 14. 风险与依赖

### 14.1 风险

- **100 页 + 460 src 重构周期**: P0 只做 Console 核心 + Marketing 3 页，其他页 P1-P3 分批翻新；不要一次全翻。
- **Stripe 空壳 vs 真实的错位**: P0 盘点哪些 UI 实现了但后端空，统一补齐 API。
- **Console 与 Marketing 共享 Next.js root 的架构冲突**: 使用 Next.js App Router 的 route group 隔离 `(marketing)` 和 `(console)`，共享 layout 少而显式。
- **国内 ICP 备案 / 数据出境**: 国内域名单独部署，数据不跨境（独立 Supabase region）。
- **A11y 全面合规的工作量**: P3 才强制 WCAG AA 100%，P0-P2 只做关键路径。
- **旧状态文档污染**: P0 W1 完成归档。
- **WebSocket 长连接**: 大量 Console 页面保持连接，服务端连接数压力 → 考虑 Realtime 分片 / CDN WebSocket 代理。

### 14.2 依赖

- **顿领 PRD 全章节**。
- **后端事件总线 + API 完整**。
- **Stripe 后台 + Customer Portal 已贯通**（现状已有）。
- **Supabase Realtime 可用**。
- **国内合规域名 + CDN**（agentrix.cn）。

---

## 15. 附录

### 15.1 与其他 PRD 的关系

| 引用来源 | 顿领 § | Web 本文件 § |
|---------|--------|------------|
| Living Pet 双层心智 | §3 | §6 |
| 家庭账号 P3 | §3.9 | §5.11 |
| 5 主路径 | §5 | §7 |
| 数据契约 | §7 | §9 |
| 安全 / Trust / 永不签名 | §8 | §10 |
| Agent 经济 / SplitPlan / BudgetPool / CommissionV2 | §9 | §8 |
| 整体路线图 Web 列 | §10 | §12 |

**Deviations from 顿领**: 无。

### 15.2 术语表（Web 专属）

| 术语 | 含义 |
|------|------|
| **Marketing Site** | `/` 下的传播页，面向未注册用户 |
| **Agent Console** | `/console/**` 下的管理后台 |
| **Presence Dashboard v3** | 跨端在线状态可视化（顿领 §7） |
| **Shortcut Editor** | 可视化 iOS Shortcuts / Android Routines 配置器 |
| **Skill Market 后台** | Skill 发布 / 审核 / 收入管理 |
| **BudgetPool UI** | 企业预算池可视化管理 |
| **SplitPlan UI** | 多方分润规则可视化配置 |

### 15.3 归档清单（本 PRD 引发的）

以下文件应在落地本 PRD 同步归档（具体操作见最后步骤）：

```
frontend/DEVELOPMENT_STATUS.md
frontend/BACKEND_CONTRACT_WORK.md
frontend/PAYMENT_FEATURES_SUMMARY.md
frontend/TEST_SUMMARY.md
frontend/WALLET_STRIPE_SETUP.md
frontend/一次性修复所有编译错误.md
frontend/安装jszip说明.md
frontend/系统性问题排查.md
frontend/编译修复总结.md
frontend/解决npm网络问题.md
```

→ 目标: `docs/_archive/frontend-old-status-docs/`

### 15.4 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v1.0 | 2024 Q4 | 初版 Marketing + 基础 Dashboard |
| v1.5 | 2025 Q3 | Stripe 订阅 + Agent 列表 |
| **v3.0** | **2026-05-04** | **双形态明确（Marketing + Console）+ 经济后台顶峰 + 家庭账号后台 + 开发者后台 + 100 页重构计划** |

---

**文档结束。下游写作顺序：可穿戴 → 归档。**
