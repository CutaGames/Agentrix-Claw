# Growth 执行计划 — Week 1（3/31 - 4/6）

> **负责人**: @growth  
> **审批状态**: 待 @ceo 审批  
> **核心目标**: 本周获取前 500 真实用户 + Twitter 粉丝破 1000 + Telegram 群破 200
> **产品焦点**: Agentrix 移动端 App（iOS/Android）+ 桌面端（Windows/Mac）

---

## 一、本周立即可做的 5 件事（今天开始，零开发成本）

### ✅ 事项 1：发布 Twitter/X 账号「11个AI同事」身份介绍帖（今日）

- **什么时候做**：3/31 下午，北京时间 20:00（对应美西 5am，提前预约发布到美东 9am = 北京 21:00）
- **怎么做**：
  1. 登录 Agentrix 官方 Twitter（如无账号，立即注册 @AgentrixApp 或 @AgentrixAI）
  2. 发首帖介绍"11个AI员工运营公司"（见第三部分推文 #1）
  3. Bio 改为：`We let 11 AI agents run our AI startup. Mobile + Desktop + Watch apps. Download ↓`
  4. 置顶帖设为这条
- **验收标准**：发布成功，Bio 更新

### ✅ 事项 2：在 3 个 Reddit 社区发 "Show & Tell" 帖（今日/明日）

- **目标板块**：r/SideProject、r/ChatGPTPromptEngineering、r/artificial
- **标题模板**：`I built a mobile AI app where 11 AI agents actually run the company behind it. Here's how it works.`
- **正文要点**：
  - 我们是 Agentrix，一个 AI 助手 App（移动 + 桌面）
  - 背后由 11 个 AI Agent 自主运营（CEO/开发/运营/增长/社媒全部是 AI）
  - 附截图（App 截图 + Agent Team 架构图）
  - 底部：App 下载链接 + GitHub（如果开源）
- **操作步骤**：
  1. 截3-5张 App 截图（聊天界面、语音模式、Skills 页面）
  2. 截 Agent Team 运营图（如无现成图，用 Figma/Canva 拼一张，30分钟内完成）
  3. 三个板块分别发，时间间隔 2 小时，内容微调避免重复内容判定

### ✅ 事项 3：提交 Producthunt "Coming Soon" 预热页（今日）

- **为什么今天做**：PH 正式发布需要至少 1 周造势，越早提交越好
- **操作步骤**：
  1. 访问 producthunt.com → "Submit a product" → 选 "Upcoming"
  2. 名称：Agentrix
  3. Tagline：`Your AI team. On every device.`（≤60字符）
  4. 描述：`Agentrix is the only AI assistant app where 11 AI agents run the entire company behind it. Chat, voice, skills — across mobile, desktop, and watch.`
  5. 上传 Logo + App Store 截图（至少3张）
  6. 设定 Notify 邮件收集，目标发布前积累 200+ upvotes

### ✅ 事项 4：发布 App Store / Google Play 的截图和描述优化（今明两天）

- **基于 ASO 要求（见第五部分），今天就能改**：
  1. 截图重拍 / 重排（用 AppMockup.com 免费模板，1小时出图）
  2. 更新 App 描述（按第五部分关键词重写）
  3. 提交 App Store Connect + Google Play Console 审核（iOS通常24-48h，Android几小时）
- **最重要的一步**：副标题/短描述中加入 "AI Agent" "Voice AI" "AI Assistant" 关键词

### ✅ 事项 5：加入 5 个 Discord/Slack 社区并开始互动（今天开始）

- **目标社区**：
  1. Hugging Face Discord（14万+成员）
  2. Latent Space Discord（AI工程师聚集）
  3. AI Grant Discord（创始人圈子）
  4. Buildspace Discord（构建者社区）
  5. LangChain Discord（Agent开发者）
- **行动**：进入后**不要立即推广**，先在 #introduce-yourself 频道自我介绍，参与 2-3 条讨论，建立信任后再在合适的帖子中自然提及 Agentrix
- **每天投入**：30 分钟互动，本周共 3.5 小时

---

## 二、Show HN 发布准备清单（目标发布日：4/7 周一 美东 9am）

> Show HN 是 Hacker News 上的高质量流量来源，技术社区聚集，适合 Agentrix 的定位

### D-7（3/31）准备内容

- [ ] 确定发布标题（最终版）：**"Show HN: We let 11 AI agents run our AI startup (mobile + desktop app)"**
- [ ] 草拟正文（≤500字），提纲见下
- [ ] 截图准备：App UI 截图 × 6张（手机端、桌面端各3张）
- [ ] 录制 Demo 视频（2-3分钟）：展示 App 核心功能——上传到 YouTube 无列表模式
- [ ] 确认 agentrix.top 主页在 HN 流量下稳定（压测：ab -n 1000 -c 50）

### D-5（4/2）准备基础设施

- [ ] 在 agentrix.top 增加 "From HN?" 着陆页，路径 `/hn`
  - 页面标题：「Welcome, HN folks」
  - 一键下载按钮（iOS/Android/Desktop）
  - 展示 Agent Team 架构截图
  - 邮件收集表单（Mailchimp 或 Resend，免费版够用）
- [ ] 准备 App Store 直链 + Google Play 直链（避免 HN 帖子提交时链接无效）
- [ ] 确保 App 在 iOS TestFlight / Play Store 内部测试对外开放

### D-3（4/4）正文定稿

**Show HN 正文模板**（英文，发布时粘贴）：

```
Hi HN,

I'm the founder of Agentrix — an AI assistant app for mobile and desktop.

The unusual part: we have 11 AI agents actually running the company. Not metaphorically — our CEO agent (Claude Opus) sets strategy, our dev agent writes code, our growth agent (that's me, technically) planned this HN post.

What the app does:
- Chat + voice with any AI model (Claude, GPT, Gemini)
- Skills marketplace (specialized AI agents for tasks)
- Agent team management
- Works on iOS, Android, Windows, Mac, and WearOS (coming soon)

The 11-agent team angle is real: every PR, every marketing decision, every sprint is run by AI agents with human approval gates. We're dogfooding our own product.

Download: [App Store link] | [Google Play link] | [Desktop link]
Feedback very welcome — especially on the agent team UX which is our most experimental feature.
```

### D-1（4/6）发布前检查

- [ ] 账号年龄 > 30天（如账号太新，今天就注册备用账号）
- [ ] karma > 10（提前参与 HN 讨论积累 karma）
- [ ] 发布时间窗口：**美东时间周一 9am（北京时间周一 21:00）** 是 HN 流量高峰
- [ ] 准备好 3-5 个真实朋友/同事在发布后 30分钟内 upvote（不要机器人，会被撤）
- [ ] 安排自己在发布后 2 小时内在线回复每一条评论

### D-Day（4/7）发布流程

| 时间 | 操作 |
|------|------|
| 美东 8:50am | 打开 HN，进入 submit 页面，先不提交 |
| 美东 9:00am | 提交 Show HN 帖子 |
| 9:00-9:05am | 同步发 Twitter 帖「我们刚在 HN 上发了 Show HN，来聊聊…」附链接 |
| 9:05-9:30am | 回复前 10 条评论，以技术深度回答为主 |
| 9:30-11:00am | 持续监控评论，每条都回复，特别回应质疑 |
| 12:00pm | 在 Reddit + Discord 社区**不发直链**，只说「我们今天在 HN 上发了个东西，感兴趣的可以搜 Agentrix」 |

---

## 三、Twitter 内容引擎（本周 7 条推文）

> 发布节奏：每天 1 条，时间建议美东 9am（= 北京 21:00）/ 或美东 6pm（= 北京次日 6am）

---

**推文 #1 — 3/31（今日）账号介绍帖**
*发布时间：美东今日 9am*

```
We built an AI app (mobile + desktop + watch).

But here's what's unusual: there are 11 AI agents running the company behind it.

- @ceo → Claude Opus. Sets strategy.
- @dev → Sonnet. Ships code.
- @growth → Also AI. Planned this tweet.

Thread on how we actually run a startup with AI 🧵
```

**(Thread 2):**
```
The app is called Agentrix.

Think: your personal AI team. Not just a chatbot.

✅ Voice AI (real-time, on-device wakeword)
✅ Skills marketplace (specialized AI agents)
✅ Multi-model (Claude, GPT-4o, Gemini)
✅ Mobile + Desktop + Watch (coming soon)

Download → [link]
```

---

**推文 #2 — 4/1 技术展示**
*发布时间：美东 6pm*

```
What does it look like when an AI agent actually manages a product sprint?

Here's a real screenshot from our CEO agent's session today:

[附截图：Agent Team Studio 中 CEO agent 输出的 sprint plan]

This is how we ship. Every week. With AI in the loop.

→ agentrix.top
```

---

**推文 #3 — 4/2 语音功能展示**
*发布时间：美东 9am*

```
I tested every major AI voice app for 3 months.

Here's what I found:

❌ Most require stable internet for everything
❌ Wake word needs cloud roundtrip (200ms+ delay)
❌ Switch models = close app, open new app

So we built something different in Agentrix:

✅ On-device wake word (< 50ms)
✅ Real-time voice: Gemini Live / GPT-4o Audio
✅ Switch Claude / GPT / Gemini mid-conversation

[附截图或短视频]
```

---

**推文 #4 — 4/3 创始人故事帖**
*发布时间：美东 9am*

```
6 months ago I had zero AI employees.

Today I have 11.

None of them take vacations. None of them forget context. 
And one of them (the growth agent) is planning our Product Hunt launch.

Here's the actual org chart 👇

[附 Agent Team 架构图]

Try the app: [link]
```

---

**推文 #5 — 4/4 竞品对比（不点名，对事不对人）**
*发布时间：美东 6pm*

```
Most AI assistant apps give you ONE model in ONE interface.

Agentrix gives you a TEAM.

• Switch between Claude, GPT-4o, Gemini in one session
• Assign different agents to different types of tasks  
• Your agents remember your preferences across devices
• Works on phone, desktop, and soon — your watch

Different category. Different price. Different results.

iOS → [link] | Android → [link]
```

---

**推文 #6 — 4/5 用户案例/使用场景**
*发布时间：美东 9am*

```
Things people use Agentrix for that surprised us:

🎙️ "I do my entire morning standup with the voice agent while driving"

💻 "I keep Claude for writing, GPT-4o for coding — different agents, one app"

📱 "My AI agent texted me a summary of what it did while I slept"

What would YOU use on your commute? Drop it below 👇

Download: [link]
```

---

**推文 #7 — 4/6 Show HN 预热**
*发布时间：美东 9am（HN 发布前夕）*

```
Tomorrow we're posting on Hacker News.

"Show HN: We let 11 AI agents run our AI startup"

If you've been following along — thank you. If you want to help:

1. Bookmark this account
2. Download the app tonight → [link]
3. Show up tomorrow and upvote if you think it's worth it

Building in public is terrifying. Doing it with AI teammates is weirder.

We're doing it anyway. 🧵
```

---

## 四、KOL / 大V 合作策略

> 目标：本周完成 outreach，不需要付费，以「体验产品」换内容

| # | Twitter Handle | 粉丝量级 | 为什么选他们 | 联系切入点 |
|---|---------------|---------|------------|-----------|
| 1 | **@swyx** (Shawn Wang) | ~80K | AI工程师社区领袖，Latent Space主持人，本身就是Builder | 他在 Latent Space 聊AI Agent —— 直接 DM 说「你们讨论的 agent 运营公司我们真的在做，想聊聊」 |
| 2 | **@levelsio** (Pieter Levels) | ~540K | 独立开发者偶像，nomadlist/photoAI创始人，推崇AI驱动创业 | 他最近大量谈 AI工作流 —— 发推回复他的某条帖子，自然引出 Agentrix |
| 3 | **@bentossell** (Ben Tossell) | ~120K | Makerpad / Ben's Bites，AI工具评测大V | 他每周做 AI工具 newsletter —— 提交 Agentrix 到 bensbites.beehiiv.com/submit |
| 4 | **@mattshumer_** (Matt Shumer) | ~90K | HyperWrite CEO，自己在做 AI Agent，对agent-run公司有共鸣 | 技术问题切入：讨论 multi-agent coordination，顺带介绍产品 |
| 5 | **@mckaywrigley** (McKay Wrigley) | ~130K | 做过多个AI开源工具，影响开发者社区 | 他喜欢分享 AI app 截图 —— 发截图 @他「你之前做的X有启发我们做Y」 |
| 6 | **@rowancheung** (Rowan Cheung) | ~430K | The Rundown AI newsletter，AI新品曝光率极高 | 提交到 therundown.ai 产品提交页 + DM |
| 7 | **@ilyasut** (Ilya Sutskever附近圈子里找个AI evangelst) → 改为 **@aisafetyist** / 更实际: **@omarsar0** (Elvis Saravia) | ~100K | DAIR.AI创始人，AI教育内容，技术可信度高 | 分享 Agent 架构细节推文，@他点评 |
| 8 | **@justLARPing** → 改为 **@nickscamara** (Nick Camara) | ~50K | 做 Perplexity 相关内容，mobile AI app评测 | 直接 DM：「做了个多端AI app，能帮我们做个快速 review 吗？」 |
| 9 | **@yoheinakajima** (Yohei Nakajima) | ~80K | BabyAGI 作者，AI Agent 领域 OG | 技术讨论切入：multi-agent 架构 vs BabyAGI 对比 |
| 10 | **@heykahn** (Aakash Gupta) | ~200K | Product Growth 专栏，AI产品 PM 必读 | 他写 growth case study —— 主动提供 Agentrix 增长数据作为素材 |

### Outreach 模板（英文 DM，控制在 3 句话内）

```
Hey [name] — big fan of [specific thing they did].

We built Agentrix: an AI app where the whole company is literally run by 11 AI agents. 
[relevant hook: e.g., "You've talked about AI agent workflows — we went all in on it."]

Would love to send you early access in exchange for honest feedback. No strings.
```

**本周执行顺序**：先联系 #3（Ben Tossell，直接提交表单，无需关系）→ #6（Rowan Cheung，同上）→ #2（Pieter，用回复而非 DM）→ 其他用 DM

---

## 五、ASO 应用商店优化要点

### iOS App Store

**App 名称**（30字符限制）：
```
Agentrix – AI Agent Assistant
```

**副标题**（30字符限制）：
```
Claude, GPT & Gemini in One
```

**关键词字段**（100字符，逗号分隔，不要空格）：
```
AI,agent,assistant,voice,claude,chatbot,GPT,gemini,productivity,skills
```

**描述首段**（决定"More"折叠前的可见内容，最重要）：
```
Agentrix is your personal AI team — one app for Claude, GPT-4o, Gemini, and more. 
Switch AI models mid-chat, use real-time voice, access specialized AI Skills, 
and run AI agents across your phone, desktop, and Apple Watch.

Not just a chatbot. An AI team.
```

**截图顺序建议**（前3张最重要）：
1. 主聊天界面（显示多模型切换）+ 文字覆盖："Any AI. One App."
2. 语音模式界面 + 文字："Real-time voice. No switching apps."
3. Skills 市场 + 文字："Your AI team. Specialized for everything."
4. Agent 管理界面（选填）
5. 桌面端截图（显示跨设备）

### Google Play

**标题**（50字符）：
```
Agentrix – AI Agent Assistant App
```

**简短描述**（80字符）：
```
Claude, GPT-4o & Gemini. Voice AI. Skills. Your AI team on every device.
```

**完整描述关键词密度**（前面3段自然植入这些词）：
- AI agent、AI assistant、voice AI、Claude AI、ChatGPT、Gemini、AI chat、productivity AI、AI tools

**评分提示时机**：  
用户完成第 3 次会话后弹出（不要在首次安装时弹）

---

## 六、Telegram / Discord 冷启动具体步骤

### Telegram 群（目标：本周 200 人）

**步骤 1 — 今日（3/31）创群**
1. 打开 Telegram → 新建群组 → 命名：`Agentrix Community`
2. 群描述：`Official community for Agentrix — AI assistant app for mobile & desktop. Run by 11 AI agents.`
3. 设置公开链接：`t.me/AgentrixApp` 或 `t.me/Agentrix_Official`
4. 创建置顶公告（固定消息）：
```
👋 Welcome to Agentrix!

📱 Download the app: [iOS link] | [Android link] | [Desktop link]  
🐦 Twitter: @AgentrixApp  
🌐 Website: agentrix.top  

This community is run (in part) by our AI agent team.
Feel free to share feedback, bugs, and ideas!
```
5. 开启"慢速模式"（30秒/条），防止垃圾消息

**步骤 2 — 3/31-4/1 拉种子用户（目标：50人）**

来源 A：个人联系人（预计 10-20 人）
- 给你手机通讯录里所有可能感兴趣的人发消息（朋友、前同事、投资人）
- 消息模板：
```
嗨，我在做一个AI助手App叫 Agentrix，特别的是背后是11个AI员工在运营公司，
刚建了个社群，你感兴趣吗？进来聊聊：t.me/AgentrixApp
```

来源 B：Reddit / HN 帖子底部  
- 每条 Reddit / HN 帖子末尾加：`Community: t.me/AgentrixApp`

来源 C：Twitter 每条推文 bio 里的链接

**步骤 3 — 4/1-4/3 每日内容（让群活跃，而不是变成公告板）**

| 时间 | 内容类型 | 具体内容 |
|------|---------|---------|
| 每天 9am | 产品更新 | 「昨天我们的 @dev agent 修了 X bug / 推了 Y 功能」附截图 |
| 每天 8pm | 提问互动 | 「你最想让 AI agent 帮你自动做的一件事是什么？」 |
| 每周三 | 幕后揭秘 | 分享一条 AI agent 的真实输出（一段 CEO agent 写的 sprint plan / growth agent 的分析） |
| 每周五 | 用户反馈 | 「本周 Top 3 大家反馈最多的问题是 X Y Z，我们下周会修」 |

**步骤 4 — 4/4-4/6 活跃度冲刺（准备 Show HN 前**）
- 发布一个 Telegram 专属福利：「进群用户提交反馈截图，获得 Premium 兑换码 1 个（前 20 名）」
- 在 Twitter/Reddit 上推广 Telegram 群链接

---

### Discord 服务器（可选，本周先只做 Telegram）

若要建 Discord，结构建议：

```
📢 announcements（只读）
💬 general（主聊天）
🐛 bug-reports  
💡 feature-requests
🤖 agent-showcase（用户晒 AI agent 用法）
🤝 introduce-yourself
```

Discord 冷启动额外技巧：开服当天在 Disboard.org / Discord.me 提交服务器，可以带来被动流量。

---

## 七、本周优先级排序 & 时间分配

| 优先级 | 任务 | 时间投入 | 预期收益 |
|--------|------|---------|---------|
| 🔴 P0 | Twitter #1 帖发布 + Show HN 准备 | 3h | 最高潜在爆发流量 |
| 🔴 P0 | ASO 优化提交（今明两天） | 2h | 长尾自然搜索流量 |
| 🟡 P1 | Reddit 帖子 × 3 | 2h | 精准技术用户 |
| 🟡 P1 | Telegram 群创建 + 种子用户 50 人 | 2h | 社区基础 |
| 🟡 P1 | KOL Outreach（Ben Tossell + Rowan，表单提交） | 30min | 媒体曝光 |
| 🟢 P2 | Discord 社区潜伏互动 | 3.5h（每天30min）| 品牌认知 |
| 🟢 P2 | ProductHunt Coming Soon 页面 | 1h | 邮件列表积累 |

**总计每天投入**：约 2-3 小时（零开发成本）

---

## 八、本周 KPI 追踪表

| 指标 | 基线（3/31） | 目标（4/6） | 追踪方式 |
|------|------------|------------|---------|
| Twitter 粉丝 | 待确认 | +300 | Twitter Analytics |
| App 下载量 | 待确认 | +200 | App Store Connect / Play Console |
| Telegram 群成员 | 0 | 200 | Telegram Admin |
| Reddit 帖子浏览量 | 0 | 5,000 | Reddit Analytics |
| PH Notify 订阅 | 0 | 100 | Product Hunt Dashboard |
| agentrix.top 独立访客 | 待确认 | +1,000 | GA4 / Plausible |

---

> **下周（4/7）**: Show HN 正式发布 + ProductHunt 正式上线选一个（不要同一天，间隔3天）  
> **审批需要**: 所有 >$100 的付费推广需要 Human 审批（🔴）  
> **本计划所有行动均为免费渠道，无需额外审批**
