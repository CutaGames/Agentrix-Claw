# Genspark 调研报告 & Agentrix Gap 分析

> 调研日期：2026-05-07  
> 调研人：@ceo / @growth  
> 数据来源：Sacra、LATKA、ai-supremacy、ainativegtm、Liora、官网 genspark.ai、Wikipedia、Adweek

---

## 一、Genspark 公司概况

| 项目 | 数据 |
|---|---|
| 公司 | Genspark Inc.（Main Func 旗下） |
| 创始人背景 | 前百度高管 Eric Jing（景鲲，原百度小度 CEO），Kay Zhu 等 |
| 成立时间 | 2023 |
| 总部 | 美国 Palo Alto |
| 团队规模 | ~50 人（人均收入约 $200 万 ARR） |
| 累计融资 | $60M (2024.6) + $100M Series A (2025.2, $530M 估值) + $275M (2025.11, $1.25B 估值) ≈ **$435M** |
| 估值 | **$1.25B（独角兽）** |
| ARR 轨迹 | 2025.4 上线 Super Agent → 9 天 $10M → 45 天 $36M → 5 个月 $50M → 2025 年底 $85M → **2026.1 $100M** |
| 用户规模 | **2M+ 月活**（MAU） |
| 付费用户 | 1 万+ 付费组织/用户 |
| 单价 | $30/用户/月（标准 Plus 版） |
| 标志事件 | **2026 Super Bowl LX 投放广告**（Matthew Broderick 主演，"AI 写脚本，5 周完成"） |

---

## 二、产品功能列表（Genspark AI Workspace 4.0）

### 2.1 核心 Agent 类
- **Super Agent**：杀手级，多步骤复杂任务自动编排（旅行预订、市场调研、电话呼叫、PPT 全流程）
- **Genspark Claw**（桌面端）：统一本地电脑 + 多个云电脑（云沙箱）的工作空间
- **AI Phone Call**：AI 电话外呼（订餐、预约、客服自动化）—— 极强 demo 引爆点
- **AI Chat / AI Image**：Unlimited 用量
- **AI Meeting Notes / Meeting Bot**：自动加入 Zoom/Meet/Teams，录音转写出会议纪要
- **Speakly**：语音转文本写作助手（4× 打字速度）
- **Chrome Extension**：浏览器侧边栏 copilot
- **Mobile App**：iOS / Android

### 2.2 内容生成工具矩阵（30+ 垂直工具）
- **办公套件**：AI Slides、AI Sheets、AI Docs、AI Designer
- **生成类**：Image Generator、Video Generator、Music Generator、Podcast Generator、Voice Cloning、Image-to-Video
- **业务文档**：Pitch Deck、Resume、Cover Letter、Contract、Proposal、Invoice、Report、Lesson Plan
- **建站设计**：Website Builder、Logo Generator、Flyer/Invitation/Menu Maker
- **效率工具**：PDF Summarizer、Email Generator、Word→PPT、Text→PPT、Fact Checker、Schedule Maker、Market Research

### 2.3 模型与基础设施
- **Ultra Mode**：Claude Opus 4.7（顶配）+ 自研 MoA（Mixture of Agents）路由
- 多模型混合：GPT、Claude、Gemini、自研模型动态选择
- **云沙箱（Cloud Computer）**：每用户分配虚拟机执行 Agent 任务，Computer-Use 能力

---

## 三、核心杀手级功能（Killer Features）

| 功能 | 为什么是杀手级 |
|---|---|
| **Super Agent（多步任务编排）** | "Type once, get everything"——一句话完成"研究 + PPT + 网站 + 电话预约"全链路，演示效果震撼，推动病毒传播 |
| **AI Phone Call** | 行业首个消费级 AI 电话外呼，"帮我打电话订餐厅"成为社交媒体最热 demo |
| **AI Slides / Pitch Deck** | 端到端 PPT 生成质量碾压 Gamma、Tome，企业付费首选 |
| **Genspark Claw 桌面端** | 整合本地 + 多云电脑，单一工作台调度多 Agent 并行——超越纯 Web 形态 |
| **MoA + Ultra 路由** | 用户感知不到模型切换，但获得 SOTA 体验，token 成本可优化 30-50% |
| **AI Designer / 全栈生成器** | 一句话生成完整品牌设计、网站、视频，覆盖 SMB 整个 GTM 链路 |

---

## 四、用户群体

| 群体 | 占比/特征 |
|---|---|
| **个人创作者 / Knowledge Worker** | 主流，60%+。用 Slides/Docs/Image 替代 ChatGPT+Gamma+Canva 组合 |
| **小微企业主（SMB）** | 高速增长，用 AI Phone Call、Website Builder、Pitch Deck 完成早期 GTM |
| **销售 / 市场 / 咨询** | 用 Super Agent 做调研 + Deck + 外呼一条龙 |
| **教育 / 学生** | Lesson Plan、PDF Summarizer、Note Taker |
| **地理分布** | 美国 50%+，韩国/日本/欧洲为重点拓展（已本地化 6 语言） |

---

## 五、商业模式

- **订阅制（核心）**：
  - Free：受限
  - **Plus $24.99/月** ：标准 Agent 配额
  - **Pro $200/月**：高用量、Ultra 模式（Opus 4.7）、优先通道
  - **Business / Enterprise**：team workspace、SSO、私有部署
- **平均 ARPU**：约 $30/月
- **变现公式**：MAU 200 万 × 付费转化 ~5% × $30/月 ≈ $30M MRR ≈ $360M 理论上限（实际 ARR $100M 说明仍在爬升）
- **未来变现路径**：API 计费、企业版、Marketplace 抽成、广告位（暂未开启）

---

## 六、主要竞争对手

| 维度 | 主要对手 |
|---|---|
| **通用 Super Agent** | Manus.ai（中国 Monica）、OpenAI Operator/Deep Research、Anthropic Computer Use、Perplexity、Replit Agent |
| **AI Workspace** | Microsoft Copilot、Google Workspace + Gemini、Notion AI |
| **PPT/Doc 生成** | Gamma、Tome、Beautiful.ai、Canva Magic |
| **AI 建站/全栈** | Bolt.new（StackBlitz）、Lovable、v0（Vercel）、Cursor |
| **AI 电话** | Bland.ai、Vapi、Retell |
| **桌面 Agent** | Anthropic Claude Desktop、Cursor、Manus 桌面端 |

---

## 七、未来发展方向（基于公开信息推断）

1. **从工具集 → AI OS**：Claw 桌面端是底座，目标"AI 时代的操作系统"（统一本地+云）
2. **企业市场**：Business 版加速，竞争 Microsoft Copilot
3. **Agent Marketplace**：长期方向，让第三方提交 Agent/Skill（目前只有官方 30+ 工具）
4. **垂直场景深化**：医疗、法律、教育、金融垂直 Super Agent
5. **多模态 Agent**：Phone Call 已落地，下一步视频会议代理、虚拟客服
6. **品牌大众化**：Super Bowl 广告标志着从 PLG → 消费品牌战略
7. **海外扩张**：日韩拉欧本地化，对标 OpenAI 的全球渗透

---

## 八、Agentrix vs Genspark — Gap 分析

### 8.1 定位差异（不是直接竞争，但有交集）

| 维度 | **Genspark** | **Agentrix** |
|---|---|---|
| 核心定位 | 个人/SMB 的 AI 超级助手（B2C/PLG） | **AI Agent 经济平台**（让 Agent 工作、交易、成长） |
| 价值主张 | "一个 Agent 帮你做所有事" | "Agent 之间互相雇佣、协作、结算" |
| 主要用户 | 终端用户（消费者） | 开发者 + Agent owner + 终端用户 |
| 商业模式 | 订阅 | 订阅 + 协议抽成（X402/ERC-8004） + Marketplace |
| 平台层 | 单一 Genspark Workspace | 多端：Web + Mobile + Desktop（Tauri）+ Wearables |
| 经济基础 | 中心化 | 去中心化协议 + 加密支付 |

### 8.2 功能 Gap（Genspark 有 / Agentrix 缺）

| # | 缺失功能 | Genspark 表现 | Agentrix 现状 | 借鉴价值 |
|---|---|---|---|---|
| 1 | **Super Agent 一站式编排** | 一句话→多步任务全程托管 | 有 OpenClaw chat，但缺乏"自动多步任务计划+执行可视化" | ⭐⭐⭐⭐⭐ |
| 2 | **AI Phone Call** | 已上线，社媒爆款 | 无 | ⭐⭐⭐⭐ 差异化引爆点 |
| 3 | **AI Slides/PPT 生成器** | 行业 Top | 无 | ⭐⭐⭐⭐ 高频场景 |
| 4 | **Cloud Computer / 沙箱** | 每用户独立云 VM | 部分 tool sandboxing，未统一 | ⭐⭐⭐⭐⭐ Computer-Use 必备底座 |
| 5 | **Meeting Bot 自动加入会议** | 已上线 | 无 | ⭐⭐⭐ |
| 6 | **MoA 多模型智能路由** | 透明、用户无感 | 已有 tri-tier 路由，但仍裸露给用户 | ⭐⭐⭐⭐ 隐藏复杂度 |
| 7 | **Chrome Extension** | sidebar 全网可用 | 无 | ⭐⭐⭐ 流量入口 |
| 8 | **30+ 垂直工具矩阵** | Resume/Pitch/Logo/Website... | 无聚合工具页 | ⭐⭐⭐⭐ SEO + 工具型获客 |
| 9 | **Speakly 语音输入** | 独立爆款 | 移动端有 voice，但非"写作辅助"定位 | ⭐⭐⭐ |
| 10 | **AI Designer（品牌全套）** | 一句话出品牌包 | 无 | ⭐⭐⭐ |
| 11 | **品牌投放（Super Bowl 量级）** | 已做 | 早期阶段 | ⭐⭐ 时机未到 |
| 12 | **桌面端"统一本地+多云电脑"工作台** | Claw 已上线 | Tauri 桌面已有，但未做云电脑整合 | ⭐⭐⭐⭐⭐ 可超越 Genspark |

### 8.3 Agentrix 的差异化优势（Genspark 没有 / 无法做）

| Agentrix 强项 | 为何 Genspark 难以追赶 |
|---|---|
| **Agent Economy 协议层**（X402、ERC-8004、A2A） | Genspark 是中心化产品，做协议会自废武功 |
| **AI Agent 互相雇佣 / 结算 / 信誉** | 需要去中心化身份和支付基础设施 |
| **Skill Marketplace（开发者经济）** | Genspark 走精品自营路线，无开放生态 |
| **多端原生**（Web + Mobile + Desktop + Wearables） | Genspark 是 Web-first，桌面/移动是延伸 |
| **加密原生 / Wallet / DeFi 集成** | Web2 公司路径依赖 |
| **OpenClaw 多 Agent 实例 + Team** | Genspark 是单 Agent 体验 |
| **MCP 协议生态** | Genspark 工具是闭源插件 |

### 8.4 高优先级借鉴清单（建议立即纳入路线图）

#### 🔴 P0 必做（直接补缺，已被市场验证）
1. **Super Agent 编排可视化**：把 OpenClaw 的多步任务做成"任务计划→执行→产出物"的可视化卡片流（参考 Manus/Genspark 的左右双栏 UX）
2. **Cloud Sandbox / Computer-Use**：每个 Agent 任务分配独立沙箱（Docker/microVM），统一文件系统、浏览器、终端工具
3. **AI Slides 生成器**：作为 Agent 自带 skill，一句话出 PPT，作为 chat 标准产出物之一
4. **桌面端 Claw 化**：Tauri 桌面端引入"本地电脑 + 远程沙箱"统一 workspace 概念

#### 🟡 P1 强烈建议
5. **AI Phone Call skill**：接入 Vapi/Retell 或自建，作为 Agent 一项 tool（差异化爆款）
6. **工具矩阵 SEO 页**：参考 genspark.ai/tools，建 30+ 落地页（ai-resume / ai-pitch-deck 等），SEO + 注册转化
7. **Chrome Extension**：sidebar，带 OpenClaw 入口
8. **Meeting Bot**：接入日历 + Zoom/Meet/Teams，自动会议纪要

#### 🟢 P2 长线借鉴
9. **MoA 路由对用户透明化**：不要让用户选模型，按任务复杂度自动分配
10. **多语言本地化**：日韩拉欧 6 语言（Genspark 已验证）
11. **品牌叙事**：从"Agent Economy Platform"提炼面向消费者的简短 slogan（参考"Don't type, just Speakly"那种力度）

#### ⚪ 不建议跟进
- Super Bowl 广告（成本不对、阶段不对）
- 闭源工具自营（违背 Agentrix 开放生态定位）

---

## 九、战略建议

### 9.1 核心判断
**Genspark 验证了"Super Agent + 工具矩阵 + Cloud Sandbox" 是当下 AI 产品的杀手级形态**，9 天 $10M ARR、9 个月 $100M ARR 证明这条路 PMF 极强。

### 9.2 Agentrix 的位置
不要正面竞争消费者市场。Agentrix 的护城河是 **"Agent 之间的经济协议"**——这是 Web2 SaaS 公司不会做也做不好的事。但**产品体验层必须达到 Genspark 同等水平**，否则用户感受不到协议价值。

### 9.3 三条腿走路
1. **体验层 catch-up**：Super Agent UX、Cloud Sandbox、PPT/Phone 等高频 skill 一年内补齐到 Genspark 80% 水平
2. **协议层独占**：X402 / ERC-8004 / A2A / Skill Marketplace 持续投入，建立壁垒
3. **多端先发**：Mobile（CutaGames/Agentrix-Claw）+ Desktop（Tauri）+ Wearables 比 Genspark 更全，做"全场景 AI 助手"叙事

### 9.4 衡量指标（北极星类比）
| Genspark | Agentrix 对应 |
|---|---|
| MAU 2M | OpenClaw 实例 MAU |
| ARR $100M | 订阅 + 协议手续费总额 |
| 付费转化 ~5% | Plus / Pro 转化率 |
| 9 天 $10M ARR | Super Agent 升级版上线 30 天 ARR 增量 |

---

## 十、附录：关键数据源

- Sacra: https://sacra.com/c/genspark/
- LATKA: https://getlatka.com/blog/genspark-revenue-ceo-ai/
- ainativegtm Substack: zero-to-36M ARR 拆解
- ai-supremacy: 独角兽分析
- 官网: https://www.genspark.ai/
- Adweek: Super Bowl LX Genspark 广告报道
- Wikipedia: Super Bowl commercials > Artificial intelligence section
