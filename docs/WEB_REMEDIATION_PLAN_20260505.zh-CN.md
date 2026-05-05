# Agentrix Web 端修复 & 优化总计划

> **基线日期**: 2026-05-05
> **触发**: 2026-05-05 反向审计发现新 `/console/**` 双形态架构把旧版核心商业能力（Marketplace / 法币加密混合支付 / 佣金 / 三套后台）孤儿化；同时网页端代码审计发现安全 / 类型 / API / i18n 多项技术债。
> **目标周期**: 5 周（W20–W24）, 与 v3 实施计划 P1-P2 并行
> **文档维护**: ceo + dev
> **依赖文档**:
> - [AGENTRIX_V3_IMPLEMENTATION_PLAN_20260504.zh-CN.md](AGENTRIX_V3_IMPLEMENTATION_PLAN_20260504.zh-CN.md)
> - [web-prd-v3.md](web-prd-v3.md)（本计划要求修订, 见 §5）

---

## 0. 修复的两条主线

| 主线 | 来源 | 严重度 | 一句话 |
|---|---|---|---|
| **A. 旧核心商业能力归位** | 反向审计 | 🔴 商业关键 | Marketplace / 混合支付 / 佣金 / Merchant&Developer&Admin 后台 代码与 API 都在，仅是新 ConsoleLayout 没挂导航 |
| **B. 网页端工程化技术债** | 代码审计 | 🔴 安全 + 🟡 质量 | localStorage 存 JWT、middleware 假鉴权、raw fetch 与 apiClient 混用、`any` 滥用、debug log 泄漏、i18n 硬编码 |

两条线**同步推进**，不互相阻塞。

---

## 1. 阶段总览（5 周）

| 周次 | 阶段 | 主线 A（商业归位） | 主线 B（工程化） | Gate |
|---|---|---|---|---|
| **W20** | R0 安全护栏 | – | JWT→Cookie · middleware 真鉴权 · ErrorBoundary · 日志清理 | 🔴 必须通过才进 R1 |
| **W21** | R1 Console IA 修订 | PRD §IA 更新 + ConsoleLayout 导航补齐 + 旧页面接入新框架 | apiClient 统一 + zod 响应校验 | – |
| **W22** | R2 Marketplace 归位 | Skill Marketplace / 任务集市 / Resource 三市场迁入 `/console/marketplace/**` | shared/types 真消费 + snake↔camel mapper | – |
| **W23** | R3 商业化归位 | Console Wallet 实接 projection + 法币加密混合支付 + 佣金 V4 + SplitPlan + BudgetPool + Audit | TanStack Query 全量缓存 + Loading/Empty/Skeleton | – |
| **W24** | R4 三套后台归位 + 收尾 | Merchant Console / Developer Console / Admin（RBAC）整合到 `/console/**` | a11y · SEO noindex · i18n 收口 · npm audit · Next 升 15 调研 | 🟢 R4 Gate |

---

## 2. R0 · 安全护栏（W20, 必须先做）

### 2.1 任务清单

| # | 任务 | 文件 | 验证 |
|---|---|---|---|
| R0-1 | JWT 改 `HttpOnly` `SameSite=Lax` `Secure` Cookie | [frontend/lib/api/client.ts](../frontend/lib/api/client.ts), backend `auth/login` | 浏览器 DevTools 看不到 token；XSS 注入无法读取 |
| R0-2 | [frontend/middleware.ts](../frontend/middleware.ts) 改为读 cookie + 校验 JWT 签名 | middleware.ts | 无 cookie 访问 `/console/**` `/admin/**` 返回 302 → `/auth/login` |
| R0-3 | 全局 `ErrorBoundary` + 路由级 `error.tsx`（pages router 下用 `_error.tsx` + 包装组件） | `frontend/components/ErrorBoundary.tsx`(新), `_app.tsx` | 故意抛错不白屏 |
| R0-4 | `console.log` / emoji 调试日志清理 + `lib/logger.ts` 包装 | grep `pages/admin/merchants.tsx` 等 ~30 处 | grep 后 < 5 处保留（仅 lib/logger） |
| R0-5 | `/console/**` `/admin/**` 加 `<meta name="robots" content="noindex">` | ConsoleLayout / AdminLayout | view-source 检查 |
| R0-6 | CSRF: 所有 mutation 走 `x-csrf-token` header（cookie + double submit） | apiClient 拦截器 | 跨域 POST 无 token 应被拒 |

### 2.2 Gate
- [ ] 浏览器 cookies 中 `access_token` 标记 HttpOnly + Secure
- [ ] 未登录直接访问 `https://agentrix.top/console/dashboard` → 302
- [ ] `npm audit --production` 无 high/critical
- [ ] 全局 ErrorBoundary smoke：故意 throw 后看到友好降级 UI

---

## 3. R1 · Console IA 修订与导航补齐（W21）

### 3.1 新 IA（建议 PRD 同步采纳）

```
/console/                       (登录后默认)
├── /dashboard                  # 已有
├── /agents                     # 占位 → 实接 agent-team API
├── /marketplace                # 🆕 旧 marketplace 整体迁入
│   ├── /skills                 #     Skill 市场（OpenClaw/OpenHub 数千 skill）
│   ├── /tasks                  #     A2A 任务集市
│   └── /resources              #     Resource 市场（dataset / model / compute）
├── /wallet                     # 升级
│   ├── /overview               #     接 /api/v1/wallet/projection
│   ├── /checkout               #     法币 Stripe + 加密 USDC/SOL/EVM/x402 双路径
│   ├── /commission             #     V4 + SplitTree + AuditProof
│   ├── /split-plans            #     P1-8 后端 UI
│   ├── /budgets                #     BudgetPool UI
│   ├── /auto-earn              #     P2-2 仪表盘 + A2A 时间线
│   ├── /referral               #     Affiliate / 邀请码
│   └── /audit                  #     合规审计日志
├── /developer                  # 🆕 复用 /developers/console.tsx
│   ├── /skills                 #     skill-listings 上架/审核/收益
│   ├── /api-keys
│   ├── /webhooks
│   └── /workflows              #     Shortcut/Workflow 模板编辑器
├── /merchant                   # 🆕 商家后台（RBAC: merchant role）
│   ├── /products
│   ├── /orders
│   └── /settlements
├── /family                     # 🆕 P3-5 家庭账号（已有营销页 → 升级真后台）
│   ├── /members
│   ├── /pet
│   ├── /agents                 #     Household Agent
│   └── /allowance
├── /presence                   # 已有
├── /billing                    # 已有占位 → 接 Stripe 真实订阅
└── /settings
    ├── /profile
    ├── /security               #     L2/L3 cosign 配置
    ├── /privacy                #     /api/v1/privacy 围栏
    └── /memory                 #     4 层记忆管理

/admin/**                       # 保留独立路径但 ConsoleLayout 加入口（RBAC: admin）
                                # 旧 18 个页全部保留, /admin/login 仍是入口
```

### 3.2 导航实现

| # | 任务 | 文件 |
|---|---|---|
| R1-1 | 修订 [docs/web-prd-v3.md](web-prd-v3.md) §IA 章节，明确上述 4 大新增板块 | docs/web-prd-v3.md |
| R1-2 | [components/console/ConsoleLayout.tsx](../frontend/components/console/ConsoleLayout.tsx) 顶导加 `Marketplace` `Wallet` `Developer` 三大入口 + 侧栏多级菜单 | ConsoleLayout.tsx |
| R1-3 | 取消 `/marketplace → /skills` 的 301，恢复 `/marketplace` 为工作台（旧 `/skills` 改 `/marketing/skills`） | next.config.js |
| R1-4 | RBAC hook `useRole()` + `<RoleGuard role="merchant\|developer\|admin">` 包装 | components/auth/RoleGuard.tsx |
| R1-5 | 旧页面增加 thin redirect: `/admin/merchants` 同时挂在 `/console/admin/merchants`（避免破坏现有书签） | pages 内 getServerSideProps redirect |

### 3.3 Gate
- [ ] PRD §IA 与本 §3.1 一致（PR review 通过）
- [ ] 用户登录后从导航 ≤ 2 跳能到达：Skill 市场 / 佣金页 / 商家后台 / 开发者后台

---

## 4. R2 · Marketplace 归位（W22）

| # | 任务 | 文件 / API |
|---|---|---|
| R2-1 | `/console/marketplace/skills` 列表 + 筛选 + 详情，接 `unified-marketplace` `skill` `mcp-registry` `openclaw-bridge` | new pages + lib/api/marketplace.ts 复用 |
| R2-2 | `/console/marketplace/tasks` 接 `a2a-matching` post task / bid / accept / deliver / settle 全闭环 | new pages + lib/api/a2a.ts |
| R2-3 | `/console/marketplace/resources` 接 unified-marketplace 资源类目 | new pages |
| R2-4 | 详情页"购买"按钮统一走 `/console/wallet/checkout` 选择法币 / 加密 | shared component PurchaseButton |
| R2-5 | shared/types 真消费：marketplace 实体走 [shared/types/](../shared/types/) + 新建 `shared/dto/marketplace.ts` mapper | shared/dto/* |
| R2-6 | apiClient 全量替换 marketplace 路径下的 raw fetch | grep `fetch(.*marketplace` 应为 0 |

### Gate
- [ ] Skill 市场可浏览 + 详情可购买（走 wallet checkout）
- [ ] 任务集市可发布、出价、结算（mock Stripe）
- [ ] 旧深链 `/marketplace/*` 全部 308 到 `/console/marketplace/*`

---

## 5. R3 · 商业化归位（W23）

| # | 任务 | 文件 / API |
|---|---|---|
| R3-1 | `/console/wallet/overview` 实接 `/api/v1/wallet/projection`（替换 P0-W2 占位） | pages/console/wallet/overview.tsx |
| R3-2 | `/console/wallet/checkout` 实现"法币 Stripe / 加密 USDC·SOL·EVM·x402" 选择器 | new + 复用 lib/wallet/* + lib/api/payment* |
| R3-3 | `/console/wallet/commission` 接 commission V4 + SplitTreeGenerator + AuditProof（替代 `/pay/commission-demo`） | new |
| R3-4 | `/console/wallet/split-plans` 创建 / 预览 / 列表（P1-8 后端） | new |
| R3-5 | `/console/wallet/budgets` 月限额 + 超限警告（P1-8） | new |
| R3-6 | `/console/wallet/auto-earn` 仪表盘 + A2A 时间线（P2-2） | new |
| R3-7 | `/console/wallet/audit` 合规审计日志 | new |
| R3-8 | `/console/billing` 真接 Stripe 订阅（替代 P0-W2 占位） | pages/console/billing.tsx |
| R3-9 | `/console/wallet/referral` Affiliate + 邀请码 | new |
| R3-10 | TanStack Query 全量替换 useState + fetch | hooks/api/* |
| R3-11 | 全部加 Skeleton + Empty State + Retry | components/feedback/* |

### Gate
- [ ] Stripe live key 接通，Console Billing 完成 1 笔真实订阅
- [ ] commission V4 `executeSettlement` Stripe webhook 跑通（P1 Gate 闭关）
- [ ] SplitPlan 创建 70/20/10 + preview $1000 在 UI 中正确显示
- [ ] BudgetPool 超限 UI 警告

---

## 6. R4 · 三套后台归位 + 收尾（W24）

| # | 任务 | 文件 |
|---|---|---|
| R4-1 | `/console/merchant/**` 接 backend `merchant` 模块（products / orders / settlements） | new + 旧 admin/merchants 复用组件 |
| R4-2 | `/console/developer/**` 把 `/developers/console.tsx` 的 API Key + Webhook + skill-listings + workflow 模板编辑器整合 | 迁移现有页 |
| R4-3 | `/console/admin` 入口（RBAC admin）→ deep link 到现有 `/admin/**` 18 页 | ConsoleLayout 多 1 顶导项（admin 角色才显示）|
| R4-4 | `/console/family/**` 实接 `/api/v1/family/*`（P3-5 后端就绪） | new pages |
| R4-5 | `/console/settings/{security,privacy,memory}` 接 cosign / privacy-fence / memory-tiers | new |
| R4-6 | i18n 收口：迁 `LocalizationContext` → `next-i18next`，提取所有硬编码文案 | 全量 |
| R4-7 | a11y：button aria-label / form label / 键盘导航 / axe-core CI | components 全量 |
| R4-8 | SEO：所有 `/console` `/admin` `noindex`；公开页加 OG + sitemap | 全量 |
| R4-9 | bundle 分析 + `next/dynamic` 切割 admin/wallet 路由 + 评估 Next 13.5.6 → 15 升级路径 | next.config.js |
| R4-10 | 占位页清理：`pages/admin/placeholder.tsx` `tickets.tsx coming soon` `risk.tsx coming soon` 真实化或删除 | 多个 |

### Gate (R4 整体)
- [ ] 用户登录后 ≤ 2 跳能到达旧版**所有**核心商业页
- [ ] axe DevTools 主路径 0 critical
- [ ] Lighthouse 公开页 ≥ 90 / Console ≥ 80
- [ ] `npm audit` clean；CI typecheck + lint + e2e 全绿

---

## 7. PRD 修订建议（[docs/web-prd-v3.md](web-prd-v3.md)）

需在 PRD 中**显式补充 / 修改**的章节：

| § | 当前问题 | 修订内容 |
|---|---|---|
| §IA / 信息架构 | 只规划 5 个 Console 一级页，未给 Marketplace / Merchant / Admin / Family 落位 | 采纳本计划 §3.1 IA 树 |
| §商业化 | SplitPlan / BudgetPool / Commission 散落 `/console/wallet/reports` | 升级为独立 4 个二级页 |
| §角色 | 未明确 RBAC 矩阵 | 补 user / family-owner / merchant / developer / admin 5 角色及导航可见性 |
| §孤儿页面策略 | 无 | 加章节"重构期间旧路径 308 政策"+"模式切换器（merchant/developer/admin）"|
| §安全 | 未提 Cookie / CSRF / RBAC | 补本计划 §2 安全护栏要求 |

PRD 修订**应在 R1 W21 完成**，作为 R2-R4 的契约依据。

---

## 8. 优先级 Top 10（一周内启动）

| # | 任务 | 周 | 责任 |
|---|---|---|---|
| 1 | JWT → HttpOnly Cookie + middleware 真鉴权 | W20 | dev |
| 2 | ConsoleLayout 加 Marketplace / Wallet / Developer / Admin 入口 | W21 | dev |
| 3 | 修订 [web-prd-v3.md](web-prd-v3.md) IA 章节 | W21 | ceo |
| 4 | `/console/marketplace/skills` 实接 unified-marketplace | W22 | dev |
| 5 | `/console/wallet/overview` 替换占位接 projection | W23 | dev |
| 6 | `/console/wallet/checkout` 法币 + 加密双路径 | W23 | dev |
| 7 | Stripe live key 接通 → P1 Gate 收尾 | W23 | dev + ceo |
| 8 | apiClient 统一 + 移除 raw fetch | W21-W22 | dev |
| 9 | 全局 ErrorBoundary + 日志清理 | W20 | dev |
| 10 | `/console/family/**` 实接 family-account（P3-5 闭环） | W24 | dev |

---

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Cookie 切换破坏移动 / 桌面登录 | Mobile RN 与 Desktop Tauri 沿用 Bearer token；Web 单独 cookie 路径；shared auth.ts 双模式适配 |
| 旧深链失效引发用户投诉 | 全量 308 redirect + 30 天过渡 banner |
| Console 导航过深（5 层） | 顶导 6 项 + 侧栏 ≤ 2 级；mobile-web 用抽屉 |
| Stripe live key 申请慢 | 与 R3 并行做 Stripe test mode 全链；live key 到位即切 |
| Next 15 升级回归风险 | R4 仅做调研报告，正式升级排到 V4 |

---

## 10. 完成定义

整个修复计划在 W24 末视为完成，需同时满足：

1. ✅ R0-R4 全部 Gate 项绿
2. ✅ 旧版 4 大商业能力（Skill 市场 / 任务集市 / Resource / 法币加密混合支付 / 佣金 / 商家·开发者·管理员后台）从新 Console 导航 ≤ 2 跳可达
3. ✅ [docs/web-prd-v3.md](web-prd-v3.md) IA 章节修订并归档 v3.1
4. ✅ AGENTRIX_V3_IMPLEMENTATION_PLAN P1-8 / P2-6 / P3-5 三项 Web UI 列由"🟢 后端完成"升级为"🟢 端到端完成"
5. ✅ `npm audit` clean + Lighthouse ≥ 80 + axe 0 critical
6. ✅ 周报 W24 总结发布
