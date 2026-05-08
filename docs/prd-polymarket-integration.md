# PRD：Polymarket × Agentrix 预测市场集成

**版本**：v1.0  
**日期**：2026-04-26  
**作者**：@dev（代 @ceo 整理）  
**状态**：已实现 Phase 1 基础层；Phase 2-3 待排期

---

## 一、背景与动机

### 1.1 机会窗口

Polymarket 是目前最大的链上预测市场（Polygon 链，CTF 合约），日均交易量 $30M+，但：
- 纯 Web3 操作门槛高（需 MetaMask、USDC on Polygon）
- 没有 AI 辅助决策，完全依赖人工判断
- 没有中文 / 移动端友好入口

Agentrix 现有优势：
- 平台已有 10k+ 活跃用户、11-agent 运营团队
- AI Chat 链路成熟（OpenClaw Proxy + Claude Integration 双路）
- 移动端 + Web + Desktop 三端
- 虚拟货币体系（USDC Demo）已基础就绪

### 1.2 战略定位

**"让 AI 替你看盘、替你下注"**——把 Polymarket 的链上流动性接入 Agentrix 的 AI Agent 经济，打造 Crypto AI × 预测市场的差异化品牌。

---

## 二、产品目标

| 层级 | 目标 | 衡量指标 |
|------|------|---------|
| 用户增长 | Predict 功能成为新用户拉新钩子 | 新注册中 Predict 参与率 ≥ 30% |
| 留存 | 每日活跃通过轮次节奏驱动回访 | 7日留存提升 +8%（vs 基线） |
| 变现 | 虚拟轮次收取手续费 5%，Phase 2 接入真实 USDC | Phase 1 MAB 用户 $0（体验），Phase 2 ARPU $2/month |
| 品牌 | Agentrix = AI Prediction Platform | 搜索词排名"AI 预测市场"前 5 |

---

## 三、核心功能范围

### Phase 1（已上线，2026-04-26）

#### 3.1 BTC 5 分钟涨跌预测轮次

| 功能 | 描述 | 实现状态 |
|------|------|---------|
| 自动轮次生成 | 每 5 分钟一轮，提前 6 轮预备；锁定前 60s 停止下注 | ✅ 已上线 |
| 下注 API | `POST /prediction-market/bet`，虚拟 USDC 1-500，支持 up/down | ✅ 已上线 |
| 价格 Oracle | 主：Binance `BTCUSDT`；备：CoinGecko；再备：Kraken | ✅ 已上线 |
| 自动结算 | 到期时获取收盘价，对比锁定价，结算 up/down/tie/void | ✅ 已上线 |
| 赔率计算 | 动态资金池占比，`upOdds = totalPool*(1-fee)/upPool` | ✅ 已上线 |
| 余额账户 | 新用户 1000 USDC 体验金；余额 < 100 自动补充（每日上限 3 次） | ✅ 已上线 |
| 历史排行 | 胜率、净盈亏、最长连胜统计 | ✅ 已上线 |

#### 3.2 Polymarket 热点聚合（只读）

| 功能 | 描述 | 实现状态 |
|------|------|---------|
| 热点事件拉取 | 调用 `gamma-api.polymarket.com`，按 24h 成交量降序 | ✅ 已上线 |
| 展示字段 | title、yes/no 价格、volume、liquidity、endDate | ✅ 已上线 |
| 缓存策略 | 服务端 60s 内存缓存；降级到旧缓存 | ✅ 已上线 |
| 跳转下注 | 点击跳转 `polymarket.com/event/:slug` | ✅ 已上线 |

#### 3.3 AI Agent 工具（Chat 内 直接下注）

| 工具名 | 触发示例 | 实现状态 |
|--------|---------|---------|
| `btc_predict_buy_up` | "帮我下注 BTC 涨 50 USDC" | ✅ 双路已上线 |
| `btc_predict_buy_down` | "我觉得 BTC 会跌，押 100" | ✅ 双路已上线 |
| `btc_predict_my_status` | "我的预测成绩怎么样" | ✅ 双路已上线 |

工具注册于：
- `claude-integration.service.ts`（`/claude/chat` 路径）
- `openclaw-proxy.service.ts`（`/openclaw/proxy/:id/stream` 路径）

#### 3.4 前端入口

| 端 | 入口 | 实现状态 |
|----|------|---------|
| Web | `/predict` 独立页面 + Navigation `🎯 预测` 导航项 + Marketplace 横幅 | ✅ 已上线 |
| Mobile (RN) | Discover 屏顶部英雄卡片 → `PredictScreen`（UP/DOWN 大按钮、倒计时、余额、Polymarket 侧边栏） | ✅ 代码已推送 APK 构建中 |

---

### Phase 2（排期 Q2 2026，约 6 周）

#### 3.5 真实 USDC 接入（Polygon 链）

**目标**：从虚拟 Demo 升级为真实链上资产对赌。

**方案**：
- 使用 Polymarket CTF Exchange 合约（`ConditionalTokens.sol`）
- 平台作为做市商（House），参与方对手盘
- 用户充值 USDC → Polygon（通过 Particle Network / Privy 无缝钱包）
- 每轮结算直接通过合约自动 payout
- 保留 3% 平台手续费

**关键技术任务**：
1. 集成 Particle Network SDK（Web + Mobile）用于 EVM 钱包创建
2. 后端 `PredictionMarketService` 增加链上结算分支（`settleOnChain()`）
3. 数据库增加 `txHash`、`chainId`、`walletAddress` 字段
4. 法律合规评估（KYC 豁免额度、地区限制）

**风险**：
- Polygon 网络拥堵时 oracle 结算延迟 → 降级到链外结算 + 链上补记
- MEV 攻击价格操纵 → oracle 采用 Binance 官方 API + 签名验证，非链上 price feed

#### 3.6 多资产支持

支持资产扩展：ETH / SOL / BNB / 大选、体育赛事等。

数据模型已支持 `PredictionAsset` 枚举扩展，只需：
1. `PriceOracleService` 增加对应 symbol 映射
2. 后端 controller 开放 `asset` 参数过滤
3. 前端 picker 增加资产切换

#### 3.7 AI 助手增强

| 功能 | 描述 |
|------|------|
| 热点简报 | 每日早间 Agent 推送今日 top-5 Polymarket 事件 + Agentrix BTC 预测战绩 |
| 仓位建议 | 基于历史胜率、Kelly 公式给出建议仓位大小（非财务建议标注） |
| 自动下注 | 用户设定规则（如"BTC 每次涨跌下注 20 USDC"），Agent 持续执行 |
| 多标 Polymarket 竞猜 | 接入 Polymarket CLOB API，Agent 帮用户选 Yes/No |

---

### Phase 3（排期 Q3 2026）

#### 3.8 Polymarket 直接下注代理

**目标**：不跳转 polymarket.com，在 Agentrix App 内完成链上下注。

**方案**：
- 集成 Polymarket CLOB API（`clob.polymarket.com`）
- 使用 EIP-712 签名 + CTF Exchange 合约
- 平台抽取 0.5% 额外服务费（在 Polymarket 手续费之外）

#### 3.9 预测市场 Skill / MCP

开放 `btc_predict_buy_up/down/status` 及 `polymarket_search/bet` 等工具给第三方 Agent 调用，作为 Agentrix Skill Marketplace 中的付费技能包（$5/month）。

---

## 四、数据模型

### 数据库表（已建）

```sql
-- prediction_round: 每轮次基本信息
id, asset, status, open_time, lock_time, expiry_time,
lock_price, close_price, outcome,
up_pool, down_pool, total_pool, up_count, down_count,
fee_rate, fee_collected, interval_seconds

-- prediction_bet: 用户下注记录
id, round_id, user_id, side, amount, status, payout,
up_odds_at_bet, down_odds_at_bet, created_at, settled_at

-- prediction_user_balance: 用户余额
id, user_id, balance, total_bet, total_payout, net_pnl,
total_bets, wins_count, losses_count, best_streak, current_streak,
last_daily_bonus, daily_bonus_count
```

### API 端点（已上线）

| Method | Path | 描述 |
|--------|------|------|
| GET | `/prediction-market/rounds/live` | 当前 OPEN + LOCKED 轮次 |
| GET | `/prediction-market/rounds/recent` | 最近已结算轮次 |
| POST | `/prediction-market/bet` | 下注 |
| GET | `/prediction-market/me/balance` | 我的余额与统计（需 auth） |
| GET | `/prediction-market/me/bets` | 我的下注历史（需 auth） |
| GET | `/prediction-market/polymarket/trending` | Polymarket 热点聚合 |

---

## 五、UX 设计原则

1. **零门槛启动**：新用户无需充值，1000 USDC 体验金自动发放
2. **节奏感驱动回访**：5 分钟一轮，手机常推送"本轮结果出了！"
3. **AI 优先**：Chat 内即可下注，不强制跳 App 内专属页面
4. **风险透明**：
   - 所有虚拟资金页面显著标注"Demo 虚拟 USDC，非真实资产"
   - Phase 2 真实资产接入后显示合规风险提示
5. **移动端竖屏优先**：大按钮（UP=绿/DOWN=红）、倒计时徽章突出、无需横屏

---

## 六、非功能需求

| 维度 | 要求 |
|------|------|
| Oracle 延迟 | ≤ 2s（Binance API P99） |
| 结算准时率 | ≥ 99%（Cron 每 30s tick，失败有 warn 日志）|
| Polymarket Feed | 60s 缓存，失败降级到上次缓存（可用性 ≥ 99.9%） |
| 前端刷新 | 8s 轮询（移动端），15s（Web） |
| 安全 | 所有下注接口需 JWT 认证；金额范围服务端校验（1-500 USDC） |
| 数据保留 | 下注和结算记录永久保留 |
| Phase 2 链上 | 所有交易 txHash 上链，不可篡改 |

---

## 七、竞品分析

| 平台 | 优势 | 劣势 vs Agentrix |
|------|------|-----------------|
| Polymarket | 流动性最深，品牌强 | 无 AI 辅助，Web3 门槛高，无中文 |
| Kalshi | 合规（CFTC），美国用户友好 | 无 AI，无移动端 Predict UX，不支持 crypto |
| BetOnChain / Origo | 链上透明 | 无用户基础，无 AI，不活跃 |
| **Agentrix** | AI Chat 下注 + 虚拟起步 + 三端 + 中文优先 | 流动性小（Phase 1 Demo），链上结算 Phase 2 |

---

## 八、里程碑

| 日期 | 里程碑 | 状态 |
|------|--------|------|
| 2026-04-26 | Phase 1 全部上线（Web + Mobile + AI 工具） | ✅ **完成** |
| 2026-05-15 | Polymarket 直接跳转转化漏斗 & A/B 测试 | 🔲 待 |
| 2026-06-01 | Phase 2 钱包集成 PoC（Particle Network） | 🔲 待 |
| 2026-06-30 | Phase 2 真实 USDC Beta（邀请制，$10 上限） | 🔲 待 |
| 2026-07-31 | Phase 2 全量开放 + 多资产 | 🔲 待 |
| 2026-09-30 | Phase 3 Polymarket CLOB 直接下注 | 🔲 待 |
| 2026-10-31 | Predict Skill 上架 Agentrix Marketplace | 🔲 待 |

---

## 九、合规 & 风险

| 风险 | 缓解措施 |
|------|---------|
| 博彩监管（Phase 2+） | Phase 1 全虚拟体验金无法律风险；Phase 2 咨询法律意见，采用 Prediction Market（预测市场）而非 Gambling（赌博）定性；限制特定地区（US/UK 关注） |
| 价格操纵 | Oracle 使用 Binance 官方 REST API，非链上 AMM；多来源对比（Binance+CoinGecko+Kraken）取中位 |
| 智能合约风险 | Phase 2 使用 Polymarket 已审计的 CTF 合约，不自部署 |
| 用户资金安全 | Phase 1 全为虚拟，无真实资金；Phase 2 限额 $500/人/月 |
| 依赖第三方 API | `gamma-api.polymarket.com` 不稳定时降级到 in-memory 缓存（60s），不影响自有 BTC 预测功能 |

---

## 十、开放问题

1. **Phase 2 KYC 方案**：简单邮件验证够吗？还是需要接 Stripe Identity / Sumsub？
2. **Polymarket API Key**：CLOB API 在高频访问时是否需要 API Key？（当前 gamma-api 无需 key）
3. **赔率机制是否引入做市商**：目前为纯 parimutuel（参与者间分配），Phase 2 是否引入 AMM/CLOB？
4. **虚拟 USDC 与真实 USDC 隔离**：Phase 2 需要明确账户分层（Demo Balance vs On-chain Balance）
5. **移动端 APK 审核（Google Play）**：涉及虚拟货币/博彩类应用的上架政策需提前确认

---

*本文档由 @dev Agent 根据实际代码实现（backend/src/modules/prediction-market、frontend/pages/predict.tsx、src/screens/discover/PredictScreen.tsx）整理生成。*
