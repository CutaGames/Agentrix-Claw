# Web 端正式上线审计（2026-05-16）

> 目的：判断 `agentrix.top` Marketing + Console + Marketplace 三形态距离正式 GA 还需要多少工作。
> 输入：[docs/web-prd-v4.md](web-prd-v4.md)、生产 smoke 验证、`tsc --noEmit` 结果。
> 当前生产版本：commit `b13240ed` 已部署。

---

## TL;DR

- **页面骨架完整度** ≈ 80 %（150+ 页面，关键路径都能 200 OK）
- **TypeScript 健康** ≈ 99 %（仅 7 个非阻塞警告级 type 错误）
- **关键 P0 缺口**：
  1. `/blog` 404 — Marketing 主导航有链接但没页面
  2. `/help/desktop` 404 — 用户手册新文档没渲染入口
  3. `/p/[petId]` 公开档案 404 — V4 PRD 重点功能但路由空
  4. `/clan` 404 — Marketing 导航有但无页面
- **关键 P1 缺口**：
  1. Marketplace 几个核心页面（`/market/sell`、`/market/auction/[id]`、`/market/leaderboard`）骨架已建但没真实数据 / 完整流程
  2. SEO meta 不全（Sitemap、og:image、JSON-LD 部分页缺）
  3. 未做 Lighthouse 性能基线（首屏 LCP / TBT / CLS）
  4. 国际化（i18n）部分页面 hardcode 中文
- **关键 P2 缺口**：
  1. 无 Cookie 同意条 / 隐私政策弹窗
  2. 错误页（404 / 500）样式简陋
  3. 无 `/sitemap.xml` 或 `/robots.txt` 验证

距离 GA 估算 **~15 工作日（3 个 sprint）**：
- Sprint W-1（5 天）：补 4 个 404 页面 + Marketplace 核心流跑通
- Sprint W-2（5 天）：SEO + 性能 + i18n 全量覆盖
- Sprint W-3（5 天）：合规 + 错误页 + 准上线收口

---

## 1. 当前生产 smoke 测试结果（2026-05-16 09:00）

| URL | 状态 | 备注 |
|------|------|------|
| `/` | 200 ✅ | Hero + 导航 + Footer |
| `/download` | 200 ✅ | Sprint G-3 新增，UTM 追踪生效 |
| `/admin/desktop` | 200 ✅ | Sprint G-3 新增，401 鉴权 |
| `/pricing` | 200 ✅ | 5 档对照 |
| `/showcase` | 200 ✅ | 用户共创瀑布流（数据少） |
| `/market` | 200 ✅ | Marketplace 主页 |
| `/console` | 200 ✅ | 已登录 dashboard |
| `/about` | 200 ✅ | About 页 |
| `/clan` | **404 ❌** | Marketing 导航有链接但页面缺失 |
| `/hardware` | 200 ✅ | 周边硬件页 |
| `/marketplace/pets` | 200 ✅ | Pets 列表 |
| `/help/desktop` | **404 ❌** | 用户手册渲染入口缺失 |
| `/p/test-pet` | **404 ❌** | 公开宠物档案路由空 |
| `/blog` | **404 ❌** | 无博客系统 |

通过率：**10/14 (71 %)**

---

## 2. P0 缺口（必须修才能 GA）

### W-P0-1：补 4 个 404 页面

| 页面 | 估时 | 备注 |
|------|:---:|------|
| `/clan` | 0.5d | 6 大族群 + Coraising / Mimic 入口；可基于 `/components/marketplace/ClanFilter.tsx` 复用 |
| `/help/desktop` | 0.5d | Markdown 渲染器；读 `docs/USER_MANUAL_DESKTOP_V4.zh-CN.md` |
| `/help/desktop/faq` | 0.25d | 同上，读 `docs/FAQ_DESKTOP.zh-CN.md` |
| `/p/[petId]` | 1.5d | 公开宠物档案 + 3D 嵌入 + OG 卡片（V4 PRD §4.x 重点） |
| `/blog` 或 redirect | 0.25d | 短期：导航移除 blog 链接；长期：Notion 嵌入或 Ghost |

**DoD**：14 个 smoke 测试全部 200 OK。

### W-P0-2：Marketplace 核心流闭环

PRD 承诺的 Marketplace 6 个页面，状态：

| 页面 | 状态 | 缺口 |
|------|:---:|------|
| `/market` | ✅ 完整 | — |
| `/market/skin/[id]` | ⚠️ 骨架 | 缺 3D 预览 / Remix 树 / 历史成交 |
| `/market/sell` | ⚠️ 骨架 | 上架向导未跑通 |
| `/market/auction/[id]` | ❌ 空 | 拍卖大厅 UI 未实现 |
| `/market/creator/[userId]` | ⚠️ 骨架 | 创作者主页 |
| `/market/leaderboard` | ⚠️ 骨架 | 排行榜（GMV / 收藏 / Remix） |

**DoD**：用户能完成「浏览 → 详情 → 购买」闭环（mock 数据可接受，但 UI 不能 dead end）。

估时：5 天。

### W-P0-3：3D 嵌入 SDK + OG 卡片

V4 PRD 重点：`/p/[petId]` 是「全网可分享的宠物档案」+ iframe SDK + OG 图片。

任务：
- 路由：`/p/[petId]`
- 组件：`<PetEmbed3D petId="...">`（已在 `embed/pet/[id]` 雏形）
- OG image：动态生成（Next.js OG image）含宠物 3D 截图
- iframe SDK：第三方网站可 `<iframe src="https://agentrix.top/embed/pet/...">` 嵌入

估时：1.5 天。

---

## 3. P1 缺口（强烈建议修）

### W-P1-1：SEO meta 全量补齐

从 `frontend/lib/seo.ts` 看，buildSeo 已有但应用面有限：

需要：
- 每个 marketing 页面都跑通 `<MarketingLayout seo={...}>`
- 动态 OG image（pet / skin / clan / showcase）
- JSON-LD 结构化数据（Product / FAQ / Article）
- `/sitemap.xml` 自动生成（`next-sitemap` 已装？）
- `/robots.txt` 显式声明 admin 不可 crawl

估时：2 天。

### W-P1-2：Lighthouse 性能基线

未跑过。建议目标：
- LCP < 2.5s
- TBT < 200ms
- CLS < 0.1
- Performance score > 80

工具：`npm run lighthouse:ci`（需配置）。

估时：2 天（含修发现的问题）。

### W-P1-3：i18n 全量覆盖

`frontend/contexts/LocalizationContext.tsx` 提供 `t({ zh, en })` 但实际用得不全。

任务：
- grep 所有页面的 hardcode 中文 → 改成 `t({ zh, en })`
- 确认英文翻译质量
- 添加日韩越（V4 提到 SE Asia 用户）

估时：1 天（用脚本批量找 + 修）。

---

## 4. P2 缺口（GA 后可补）

### W-P2-1：合规 / 隐私

- Cookie 同意条（GDPR / CCPA）
- 隐私政策页面（`/privacy`）
- 服务条款（`/terms`）
- 数据删除请求入口

工具：reach-compliance / cookieyes / 自建（推荐自建）。

估时：1.5 天。

### W-P2-2：错误页美化

- `/404` 现在是 Next.js 默认；建议自定义萌宠错误页
- `/500` 同上

估时：0.5 天。

### W-P2-3：Admin 看板增强

当前 `/admin/desktop` 只有 KPI 数字，缺：
- 趋势图（recharts 折线 / 柱状）
- 时间区间筛选
- 导出 CSV

估时：2 天。

---

## 5. 非功能性需求

| 类别 | 当前 | 目标 |
|------|------|------|
| 首页 LCP | 未测 | < 2.5s |
| 移动端响应式 | 主页可，console 部分破图 | 全部断点正常 |
| 浏览器兼容 | Chrome 已验证 | + Edge / Safari / Firefox |
| 监控告警 | 无 | Sentry + Uptime Robot |
| CDN 缓存 | Cloudflare 默认 | 静态资源 1 年缓存 |
| HTTPS / HSTS | 已开 | + preload list |

---

## 6. 完整 GA Roadmap

### Sprint W-1（本周，5 天）— P0 修复
- Day 1-2: `/clan` + `/help/desktop` + `/help/desktop/faq` + `/p/[petId]` 补齐
- Day 3-4: Marketplace 5 个核心页流程跑通
- Day 5: 14 个 smoke 测试 100 % 200 OK + 上线 v0.3.0

### Sprint W-2（下周，5 天）— P1 完善
- Day 1-2: SEO meta + sitemap + JSON-LD
- Day 3-4: Lighthouse 性能优化
- Day 5: i18n 全量

### Sprint W-3（再下周，5 天）— GA 候选
- Day 1-2: 合规（Cookie / 隐私 / Terms）
- Day 3: 错误页美化 + 监控接入
- Day 4-5: 全量 E2E + 上线 GA v1.0.0

---

## 7. 与桌面端 / 移动端对照

| 端 | 当前版本 | GA 距离 | 关键阻塞 |
|----|----------|--------:|---------|
| **桌面端** | v0.2.0 | ~10 天 | Sprint G-3 内测 + Azure 签名（外部审核 5-10 天） |
| **Web 端** | latest deploy | ~15 天 | P0 4 页面 + Marketplace 闭环 + SEO + 合规 |
| **移动端** | latest APK | ~10 天 | 5 端 PRD 已对齐，关键面板已修；剩余 P0 待定 |

**整体 GA 时间窗口**：3 周后（2026-06-06 左右）三端可同步 GA。

---

## 8. 立即行动建议

1. **本周**：补 4 个 P0 404 页面（W-P0-1）→ 5 天
2. **本周末**：跑一次完整 Lighthouse → 看真实性能基线
3. **下周**：Marketplace 闭环（W-P0-2）+ SEO（W-P1-1）
4. **再下周**：合规 + GA 候选打磨

---

> 本审计由自动 smoke + 静态分析生成。下次审计时机：v0.3.0 上线后 7 天复盘。
