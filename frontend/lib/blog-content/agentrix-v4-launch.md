# Agentrix v4 正式发布：Pet-as-Agent Economy 的第一次完整亮相

> 2026-05-16 · Agentrix Team

经过 9 个月的迭代，Agentrix v4 今天正式上线。这是 Pet-as-Agent Economy 第一次以完整形态出现在用户面前。

## 5 端 + 8 能力

V4 把 v3 的「三形态」骨架扩展到 5 端 + 8 能力：

- **Mobile / Desktop / Web / Watch / Toy** — 同一个 Agent 跨 5 块屏幕
- **8 大能力**：Living Pet、灵魂 × 皮肤、PetCreator 4 模式、Skin Marketplace、Wallet、AXP、Toy + NFC、Auto-Earn

其中有 4 项是 V4 新增（在首页带 `V4 New` 标记）：

### 1. 灵魂 × 皮肤系统

每只主宠现在由两层构成：**灵魂（Soul）** 决定个性（28 个签名模板，6 大族群），**皮肤（Skin）** 决定外观（无限可创作、可交易、可繁殖）。同一个灵魂可以换无数皮肤，同一个皮肤也可以承载不同灵魂。

这是我们对"AI 角色应该如何被拥有"的回答：**外观和灵魂解耦**。

### 2. PetCreator 4 模式

- **文生**：30 秒，"一只穿宇航服的橘猫"
- **图生**：上传相册图，把已有形象转 3D
- **双图融合（繁殖）**：选 2 父系，调倾向滑块
- **摄像头扫描（V5）**：绕物体一周，把现实玩偶变 3D 主宠

### 3. Skin Marketplace

第一个完整的"AI 数字资产二级市场"：

- 一口价 / 拍卖 / 租赁 / Remix 衍生分成
- **Cinderella Boost**：首位出价者拿额外 +5% 加成
- 反狙击：最后 5 分钟内有出价 → 自动延 2 分钟

### 4. Toy + NFC 实物联动

NFC 盲盒卡牌一碰，限定皮肤直接到账。ClawCore Toy 蓝牙配对后，主宠的"实体载体"就在你桌上。

## 35/35 生产 smoke 全绿

发布前我们做了一次完整的端到端验证：

- **Web V4 Full** Playwright 30+ 测试 ✅
- **Backend Jest** 18 套件 / 141 测试 ✅
- **Desktop Vitest** 12 套件 / 71 测试 ✅
- **生产 V4 Smoke** 35/35 端点 ✅

详见 [`tests/reports/E2E_REPORT_2026-05-16.md`](https://github.com/CutaGames/Agentrix/blob/main/tests/reports/E2E_REPORT_2026-05-16.md)。

## 立即上手

- **Web**：直接访问 [agentrix.top](https://agentrix.top)
- **Desktop**：[下载 Windows](https://agentrix.top/download)（v0.2.0 / 7 MB）
- **Android**：[下载 APK](https://agentrix.top/download)（v1.1.0 / 124 MB）
- **iOS**：App Store 审核中（预计 2026-06）

需要邀请码？Telegram 群 [@agentrix](https://t.me/agentrix) 找运营领。

## 下一步

V4 是新起点。接下来 30 天我们会把：

1. iOS App Store / Google Play 正式上架
2. 100 → 1000 内测扩展
3. KOL 创作者大使计划启动
4. /market/leaderboard 性能优化（SSR）
5. 多语言（日 / 韩 / 越）

**感谢早期内测用户。你们的每一条反馈，都长在了 V4 上。**
