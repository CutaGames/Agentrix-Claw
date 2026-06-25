# Web 端完整 UI 元素审计

> **审计日期**：2026-05-12
> **范围**：`frontend/pages/` 全部 60+ 页面，150+ 可交互元素
> **目的**：为 E2E 测试提供完整的测试项清单

---

## 总览

| 类别 | 数量 |
|------|:----:|
| 公开页面 | 15+ |
| 认证页面 | 5 |
| Console 页面 | 12+ |
| Marketplace 页面 | 8+ |
| 落地页（共养/贺卡/宠物） | 3 |
| 表单交互 | 10+ |
| 导航链接 | 20+ |
| **总计可交互元素** | **~150+** |

---

## 1. 公开页面（无需登录）

| ID | 页面 | URL | 关键元素 | 测试验证 |
|----|------|-----|---------|---------|
| WP-1 | 首页 | `/` | Hero + CTA + 导航 | 加载 < 3s + 无 console error |
| WP-2 | 定价 | `/pricing` | 5 档对照表 + CTA | 5 个 tier 卡片可见 |
| WP-3 | 展示 | `/showcase` | 皮肤画廊网格 | 卡片可点击 |
| WP-4 | 下载 | `/downloads` | 平台下载按钮 | 链接有效 |
| WP-5 | 关于 | `/about` | 团队/使命 | 内容非空 |
| WP-6 | 功能 | `/features` | 功能列表 | 内容非空 |
| WP-7 | 安全 | `/security` | 安全说明 | 内容非空 |
| WP-8 | 企业 | `/enterprise` | 企业方案 | 内容非空 |
| WP-9 | 开发者 | `/developers` | API 文档入口 | 链接有效 |
| WP-10 | 技能市场 | `/skills` | 技能列表 | 卡片可见 |
| WP-11 | 工具 | `/tools` | 工具列表 | 内容非空 |
| WP-12 | 宣言 | `/manifesto` | 品牌宣言 | 内容非空 |
| WP-13 | 硬件 | `/hardware` | 硬件产品 | 内容非空 |
| WP-14 | 家庭 | `/family` | 家庭方案 | 内容非空 |
| WP-15 | 族群 | `/clans` | 6 族群介绍 | 6 个区块可见 |

---

## 2. 认证页面

| ID | 页面 | URL | 关键元素 | 测试验证 |
|----|------|-----|---------|---------|
| WA-1 | 登录 | `/auth/login` | 邮箱/OAuth 按钮 | 表单可交互 |
| WA-2 | 注册 | `/auth/register` | 注册表单 | 表单可提交 |
| WA-3 | OAuth 回调 | `/auth/callback` | 处理中状态 | 不白屏 |
| WA-4 | Passkey | `/auth/passkey` | WebAuthn UI | 按钮可见 |
| WA-5 | OAuth 登录 | `/auth/oauth-login` | 第三方跳转 | 不白屏 |

---

## 3. Console 页面（需登录）

| ID | 页面 | URL | 关键元素 | 测试验证 |
|----|------|-----|---------|---------|
| WC-1 | 仪表盘 | `/console` | 宠物状态 + 快捷入口 | 数据加载 |
| WC-2 | 宠物管理 | `/console/pet` | 主宠 + 灵魂 + 衣柜 | 3D 渲染 |
| WC-3 | 宠物创作 | `/console/pet/create` | PetCreator 表单 | 可提交 |
| WC-4 | 灵魂切换 | `/console/pet/souls` | 6 族群选择器 | 切换成功 |
| WC-5 | 钱包 | `/console/wallet` | 余额 + 交易记录 | 数据显示 |
| WC-6 | AXP 中心 | `/console/axp` | 余额 + 流水 + 兑换 | 数据显示 |
| WC-7 | 账单 | `/console/billing` | 订阅状态 + 发票 | 数据显示 |
| WC-8 | Agent 管理 | `/console/agents` | Agent 列表 | 列表可见 |
| WC-9 | 设置 | `/console/settings` | 设置表单 | 可修改 |
| WC-10 | 开发者 | `/console/developer` | API Key 管理 | 可操作 |
| WC-11 | 家庭 | `/console/family` | 家庭成员 | 列表可见 |
| WC-12 | 在线状态 | `/console/presence` | 设备列表 | 数据显示 |

---

## 4. Marketplace 页面

| ID | 页面 | URL | 关键元素 | 测试验证 |
|----|------|-----|---------|---------|
| WM-1 | 皮肤市场 | `/market` | 皮肤网格 + 筛选 + 排序 | 卡片可见 |
| WM-2 | 技能市场 | `/market/skills` | 技能卡片 | 列表可见 |
| WM-3 | 任务市场 | `/market/tasks` | 任务卡片 | 列表可见 |
| WM-4 | 皮肤详情 | `/market/skin/[id]` | 3D 预览 + 购买 | 详情加载 |
| WM-5 | 拍卖 | `/market/auction` | 拍卖列表 + 出价 | 列表可见 |
| WM-6 | 排行榜 | `/market/leaderboard` | 排名列表 | 数据显示 |
| WM-7 | 创作者 | `/market/creator` | 创作者面板 | 数据显示 |
| WM-8 | 出售 | `/market/sell` | 上架表单 | 可提交 |

---

## 5. 落地页（分享链接）

| ID | 页面 | URL | 关键元素 | 测试验证 |
|----|------|-----|---------|---------|
| WL-1 | 共养邀请 | `/co-raising/[token]` | 宠物预览 + CTA | 不白屏 + CTA 可点 |
| WL-2 | 贺卡 | `/greeting/[token]` | 贺卡模板 + CTA | 不白屏 + CTA 可点 |
| WL-3 | 公开宠物 | `/p/[petId]` | 3D 宠物 + 信息 | 渲染正常 |

---

## 6. 全局交互元素

| ID | 元素 | 位置 | 测试验证 |
|----|------|------|---------|
| WG-1 | 顶部导航栏 | 所有页面 | 链接不 404 |
| WG-2 | 页脚链接 | 所有页面 | 链接不 404 |
| WG-3 | 语言切换 | 导航栏 | 切换后文案变化 |
| WG-4 | 主题切换 | 导航栏 | 样式变化 |
| WG-5 | 登录/注册 CTA | 导航栏 | 跳转正确 |
| WG-6 | 移动端汉堡菜单 | 窄屏 | 菜单展开 |
| WG-7 | 返回顶部 | 长页面 | 滚动到顶 |
| WG-8 | Cookie 同意 | 首次访问 | 可关闭 |

---

## 7. SEO / 可访问性

| ID | 检查项 | 页面 | 标准 |
|----|--------|------|------|
| WS-1 | og:title | 所有公开页 | 非空 |
| WS-2 | og:image | 所有公开页 | 有效 URL |
| WS-3 | JSON-LD | 首页/定价 | 结构化数据 |
| WS-4 | alt 属性 | 所有图片 | 非空 |
| WS-5 | aria-label | 所有按钮 | 非空 |
| WS-6 | 键盘导航 | 所有表单 | Tab 可达 |
| WS-7 | 对比度 | 所有文本 | WCAG AA |

---

## 8. 性能指标

| ID | 指标 | 标准 |
|----|------|------|
| WPF-1 | 首页 LCP | < 2.5s |
| WPF-2 | 首页 FID | < 100ms |
| WPF-3 | 首页 CLS | < 0.1 |
| WPF-4 | Console 页加载 | < 3s |
| WPF-5 | Marketplace 首屏 | < 3s |
| WPF-6 | 3D 宠物渲染 | < 5s |

---

## 下一步

- [x] Step 1：UI 元素审计（本文档）
- [x] Step 2：E2E 测试脚本（`tests/e2e/frontend/web-v4-full.spec.ts`）
- [ ] Step 3：CI 集成（GitHub Actions）
- [ ] Step 4：性能基线建立
