# Agentrix 移动端社交板块深度审计报告

**日期**: 2026-03-15  
**范围**: 移动端 `src/screens/social/` 全部 10 屏 + 后端 `social/` + `messaging/` 模块

---

## 一、现状全景

### 1.1 文件清单与代码量

| 文件 | 行数 | 功能 | 数据来源 |
|------|------|------|----------|
| `FeedScreen.tsx` | 361 | 社区 Feed (Hot/Latest/Following + Tags) | **88行 placeholder mock** → API fallback |
| `PostDetailScreen.tsx` | 296 | 帖子详情 + 评论列表 | **57行 placeholder mock** → API fallback |
| `CreatePostScreen.tsx` | 268 | 发帖 (纯文本 + Tags) | 直接调 API |
| `ChatListScreen.tsx` | 202 | 聊天列表 (DM + 群组入口) | **36行 placeholder mock** → API fallback |
| `DMChatScreen.tsx` | 267 | 1v1 私信对话 | API + **5s 轮询** |
| `DirectMessageScreen.tsx` | 16K | 私信对话 (另一版本) | API |
| `DMListScreen.tsx` | 5K | 私信列表 | API |
| `GroupChatScreen.tsx` | 414 | 群聊 + **@Agent 调用** | **42行 placeholder** → API, Agent 调 `/claude/chat` |
| `SocialListenerScreen.tsx` | 601 | 社交监听管理 (Telegram/Discord/Twitter) | 后端 `/social/callback/status` |
| `UserProfileScreen.tsx` | 365 | 用户主页 (帖子 + 技能 + 关注) | **71行 placeholder mock** → API fallback |
| **合计** | **~2,800行** | | |

### 1.2 后端实现

| 文件 | 行数 | 关键问题 |
|------|------|----------|
| `social.service.ts` | 207 | ✅ 完整 CRUD，TypeORM 实体 (SocialPost/Comment/Like/Follow) |
| `social.controller.ts` | 165 | ✅ RESTful API 齐全 |
| `social-callback.controller.ts` | 337 | ⚠️ **dispatchEvent() 是空壳 TODO**，事件日志纯内存 |
| `messaging.service.ts` | 114 | ✅ DM 使用 TypeORM 持久化 |
| `messaging.controller.ts` | 137 | 🔴 **群组消息完全内存存储** (`Map<string, GroupMessage[]>`)，重启丢失 |

### 1.3 功能完成度评估

| 功能 | 完成度 | 说明 |
|------|--------|------|
| Feed (帖子流) | 60% | 后端 API 齐全；前端大量 placeholder fallback；无媒体上传；无搜索 |
| 发帖 | 70% | 纯文本 + tags；无图片/视频上传；无 skill 关联发帖 |
| 帖子详情 + 评论 | 65% | 功能完整但 placeholder 主导；无嵌套回复展示 |
| 点赞 / 关注 | 80% | 前后端联通；乐观更新 |
| 私信 (DM) | 65% | 后端持久化完整；前端 5s 轮询，**无 WebSocket 实时推送** |
| 群组聊天 | 30% | 🔴 **后端纯内存**，重启丢全部消息；无群组创建/管理/成员 CRUD |
| @Agent 群聊 | 50% | ⚠️ 调用 `/claude/chat` 能工作，但无上下文传递、无 Agent 选择器、响应无流式 |
| Social Listener | 55% | 后端 webhook 签名验证完整；**dispatchEvent 是 TODO**；前端引导 UI 完成 |
| 用户主页 | 55% | 基础框架在；无真实数据时全靠 placeholder；缺 Agent/Skill 展示深度 |
| 内容审核 | 0% | 无任何审核/举报/过滤机制 |
| 推送通知 | 0% | 新消息/新评论/新关注无推送 |
| 实时通信 | 0% | 全部 HTTP 轮询，无 WebSocket |

**综合完成度: ~45%** — 框架搭好了，但绝大部分功能处于"能看不能用"状态。

---

## 二、核心问题诊断

### 问题 1: 定位模糊 — 做了一个"小型微博"

当前社交板块本质是一个 **传统社交网络克隆** (Feed + DM + Group + Profile)，与 Agentrix 的核心愿景（跨设备 AI Agent 交互平台）**几乎没有关联**。

- Feed 里全是人写的文字帖子，没有 Agent 产出的内容
- DM 是纯人对人聊天，与 Agent 无关
- 群聊里的 @Agent 功能虽有，但体验粗糙且不突出
- 没有任何 "Agent 社交" 的概念（Agent 互相协作、Agent 展示、Agent 评价）

### 问题 2: 与核心业务链路断裂

```
Feed 帖子 ──×──> Marketplace 购买（Fork & Install 代码在但没有真实 skill 关联）
DM 聊天  ──×──> Agent 对话（完全独立，无法把 DM 内容转给 Agent 处理）
群聊     ──×──> 协作工作流（无法从群聊发起 Agent Task）
Social Listener ──×──> Agent 执行（TODO，dispatch 是空壳）
```

### 问题 3: 技术质量低

- **6 个文件有 placeholder mock 数据作为主要内容来源**
- 群组消息纯内存存储
- 社交事件 dispatch 是 TODO
- 无 WebSocket，全部 HTTP 5s 轮询
- 无内容审核/反垃圾
- 无推送通知

### 问题 4: 与已有社交平台竞争

用户已经有 Twitter/X、Discord、Telegram 进行社交。Agentrix 的社交模块在以下方面**完败**：
- 内容质量: 0 用户 → 0 内容 → 0 吸引力（冷启动死亡循环）
- 功能丰富度: 无图片/视频、无话题、无搜索、无推荐算法
- 实时性: 5s 轮询 vs 毫秒级推送
- 社交图谱: 用户的朋友不在这里

---

## 三、价值判断 — 社交板块是否有必要存在？

### 🔴 不值得保留的部分

| 功能 | 理由 |
|------|------|
| **通用社交 Feed** | 用户不会为了在 Agentrix 发帖而放弃 Twitter，内容冷启动几乎不可能解决 |
| **通用 DM 私信** | 用户有 WhatsApp/Telegram/微信，不需要第 N 个聊天工具 |
| **通用群组聊天** | 同上，且当前后端是内存存储，技术上不可用 |
| **用户个人主页 (传统社交版)** | 无差异化价值 |

### 🟢 值得保留并强化的部分

| 功能 | 价值 | 理由 |
|------|------|------|
| **Social Listener (Agent 社交桥接)** | ⭐⭐⭐⭐⭐ | **核心差异化** — Agent 在用户已有的 Twitter/Telegram/Discord 上代替用户互动，这是 Agentrix 独有的能力 |
| **@Agent 群聊 (人机混编)** | ⭐⭐⭐⭐ | 独特的人+Agent 混合对话场景，但需要从"群聊"重定位为"Agent 协作空间" |
| **Skill/Workflow 展示 & 一键安装** | ⭐⭐⭐⭐ | Fork & Install 是增长飞轮 — 看到 → 安装 → 使用 → 分享 |
| **Agent 成果展示 (Agent Portfolio)** | ⭐⭐⭐ | 让 Agent 的工作成果可分享、可展示，建立 Agent 信誉体系 |

### 结论

> **当前社交板块 70% 的代码在做一个无差异化的通用社交网络，应该砍掉。30% 的代码（Social Listener、@Agent 交互、Skill 分享）具有核心价值，应该保留并重构为 Agentrix 的增长引擎。**

---

## 四、重构方案 — 从"社交网络"到"Agent 社交层"

### 4.1 架构重定位

```
Before (当前):                        After (重构后):
┌──────────────────────┐             ┌──────────────────────────────┐
│  通用社交网络         │             │  Agent Social Layer          │
│  Feed / DM / Group   │             │                              │
│  (人对人为主)         │             │  ┌─ Agent Showcase ──────┐   │
│                      │             │  │ Agent 成果展示 Feed    │   │
│  与 Agent 几乎无关   │             │  │ Skill/Workflow 分享卡  │   │
│  与 Marketplace 断裂  │             │  │ 一键 Fork & Install   │   │
│  与 Commission 断裂   │             │  └───────────────────────┘   │
│                      │             │                              │
│                      │             │  ┌─ Agent Social Bridge ─┐   │
│                      │             │  │ Twitter/TG/Discord 代理│   │
│                      │             │  │ Agent 自动回复         │   │
│                      │             │  │ 事件→Agent Task        │   │
│                      │             │  └───────────────────────┘   │
│                      │             │                              │
│                      │             │  ┌─ Agent Space ─────────┐   │
│                      │             │  │ 人+Agent 协作房间      │   │
│                      │             │  │ Agent Task 发起/协作   │   │
│                      │             │  │ 实时状态广播           │   │
│                      │             │  └───────────────────────┘   │
└──────────────────────┘             └──────────────────────────────┘
```

### 4.2 具体重构计划

---

#### 模块 A: Agent Showcase Feed (替代当前 Feed) [2 周]

**砍掉**: 通用社交 Feed（Hot/Latest/Following 人工帖子流）

**替换为**: Agent 成果展示 Feed — 内容来源不是人手动写的帖子，而是 **Agent 自动产出**的结果卡片

**内容类型**:

| 卡片类型 | 来源 | 用户动作 |
|----------|------|----------|
| **Skill 分享卡** | 用户发布 Skill 到 Marketplace 时自动生成 | Fork & Install → Marketplace |
| **Workflow 成果卡** | Agent 完成一个 Workflow 后自动生成摘要 | 查看详情 / 复制 Workflow |
| **Agent 对话精华** | 用户主动分享一段精彩的 Agent 对话 | 查看对话 / 试用同款 Agent |
| **任务完成卡** | Task Market 中的任务被 Agent 完成 | 查看成果 / 雇佣同一 Agent |
| **新 Agent 上线** | 用户部署新 Agent 实例时自动生成 | 试用 / 关注 |

**核心设计原则**:
- **80% 内容由系统/Agent 自动产出**，不依赖用户手动发帖（解决冷启动）
- 每张卡片都有 **明确的 CTA** (Install / Try / Hire / Fork)
- 每个 CTA 都 **连接到商业闭环** (Marketplace 购买 → Commission 分佣)

**技术变更**:
- 前端: 重写 `FeedScreen.tsx` → `AgentShowcaseFeed.tsx`，卡片化 UI
- 后端: `social.service.ts` 增加 `createAutoPost(type, referenceId)` 方法，在 Skill 发布/Task 完成/Agent 部署时自动调用
- 砍掉: `CreatePostScreen.tsx`（不再需要手动发帖入口，改为"分享对话"按钮在 Agent Chat 内）

**对裂变的价值**: 用户看到别人的 Agent 成果 → 安装同款 Skill → 产生购买 → 触发 Commission → 被分享的人获得佣金 → 继续分享。这是一个**自驱动的增长飞轮**。

---

#### 模块 B: Agent Social Bridge (强化 Social Listener) [2 周]

**保留并大幅强化**: `SocialListenerScreen.tsx` + `social-callback.controller.ts`

**当前问题**:
- `dispatchEvent()` 是 TODO 空壳
- 事件日志纯内存
- 无法将社交事件路由到 Agent

**重构为**: Agent 的"社交触手" — 用户的 Agent 可以在 Twitter/Telegram/Discord 上代替用户自动回复

**具体功能**:

1. **事件 → Agent Task 路由** (补完 dispatchEvent)
   - Twitter @mention → 创建 Agent Task "回复此推文"
   - Telegram 消息 → 路由到用户绑定的 OpenClaw 实例
   - Discord 命令 → 解析为 Agent 技能调用
   
2. **自动回复策略配置**
   - 用户设置 Agent 在哪些平台自动回复
   - 设置回复策略: 全自动 / 需审批 / 仅通知
   - 设置回复风格/语言/知识库
   
3. **回复审批流** (连接 Desktop-Sync Approval)
   - Agent 草拟回复 → 推送到手机/桌面审批
   - 用户一键确认或编辑后发送
   
4. **社交数据 → Agent 记忆**
   - 收到的社交消息自动注入 Agent Context
   - Agent 记住"上次在 Twitter 上和张三讨论了什么"

**技术变更**:
- 后端: `dispatchEvent()` 对接 `AgentRuntimeIntegrationService`
- 后端: 事件日志从内存迁移到数据库
- 后端: 新增 `SocialReplyService` — Agent 草拟 → 审批 → 发送
- 前端: `SocialListenerScreen` 增加策略配置 UI 和审批队列

**对用户粘性的价值**: 用户不需要打开 Agentrix App 来刷社交 — Agent 在后台自动帮他在已有平台上互动。**这让 Agentrix 成为"幕后大脑"**，用户每天被动使用而不自知。

---

#### 模块 C: Agent Space (替代 DM + 群聊) [2 周]

**砍掉**: 通用 DM 私信、通用群组聊天

**替换为**: "Agent 协作空间" — 一个以 Agent 为中心的协作房间

**与传统群聊的区别**:

| 维度 | 当前群聊 | Agent Space |
|------|----------|-------------|
| 主角 | 人 | Agent + 人 |
| 内容 | 闲聊 | Agent 任务状态 + 协作讨论 |
| 入口 | 聊天列表 | Agent Console 内 |
| 实时性 | 5s 轮询 | WebSocket |
| 持久化 | 内存 (丢失) | 数据库 |
| 价值 | ≈0 | 团队协作刚需 |

**具体功能**:

1. **Agent Task Room** — 每个正在执行的 Agent Task 自动生成一个协作房间
   - 实时显示 Agent 执行进度 (Timeline)
   - 团队成员可以在房间内讨论
   - @Agent 可以给 Agent 追加指令

2. **Agent Collaboration** — 多个 Agent 协作的可视化
   - Agent A 调用 Agent B 时，在房间内显示调用链
   - A2A 协议交互可视化

3. **邀请协作** — 邀请其他用户加入 Agent Task
   - 共享 Agent 的执行权限 (连接 ERC-8004 Session Key)
   - 联合付费 (连接 BudgetPool 合约)

**技术变更**:
- 前端: 砍掉 `ChatListScreen` / `DMChatScreen` / `DMListScreen`
- 前端: 新建 `AgentSpaceScreen` — 在 Agent Console Tab 内，而非独立 Social Tab
- 后端: 群组消息从内存迁移到数据库
- 后端: 对接 WebSocket 模块实现实时消息

**对用户粘性的价值**: 团队用户为了协作 Agent 任务而打开 App → 自然使用 Agent → 增加 Agent 调用量 → 增加交易 → 增加佣金。

---

#### 模块 D: Agent Reputation (替代 UserProfile) [1 周]

**砍掉**: 传统用户社交主页

**替换为**: Agent 信誉主页 — 展示用户的 Agent 生态贡献

**页面内容**:

```
┌─────────────────────────────────────┐
│  @username                    [关注] │
│  🤖 3 Active Agents                │
│  ⚡ 12 Skills Published            │
│  ⭐ 4.8 Agent Rating              │
│  📊 1,240 Tasks Completed          │
├─────────────────────────────────────┤
│  [Agent 列表] [发布的 Skill] [成果] │
│                                     │
│  Agent: Research Bot    ⭐4.9       │
│  已完成 340 个任务 · $1,200 收入    │
│  [试用] [雇佣]                      │
│                                     │
│  Skill: Web Search Pro  ⬇ 3,200    │
│  $0 · 4.7⭐ · 12 条评价            │
│  [安装] [Fork]                      │
└─────────────────────────────────────┘
```

**与 Marketplace 的连接**:
- 每个 Skill 卡片直接跳转 Marketplace 购买
- 每个 Agent 可以直接雇佣 → 发起 Task → 支付
- 评价系统连接 Commission — 好评多的 Agent 排名更高 → 获得更多雇佣 → 更多佣金

---

### 4.3 Tab 结构变更

```
Before:                          After:
┌──────────────────────┐        ┌──────────────────────┐
│ Home │Agent│Explore│  │        │ Home │Agent│Explore│  │
│      │    │       │🟡│        │      │    │       │  │
│      │    │       │  │        │      │    │       │  │
│ Social Tab (独立Tab)  │        │ 无独立 Social Tab     │
│ - Feed               │        │                      │
│ - ChatList           │        │ Agent Tab 内集成:     │
│ - GroupChat          │        │ - Agent Space (协作)  │
│ - DM                 │        │ - Social Bridge (监听)│
│ - SocialListener     │        │                      │
│ - UserProfile        │        │ Explore Tab 内集成:   │
│                      │        │ - Agent Showcase Feed │
│                      │        │ - Agent Reputation    │
└──────────────────────┘        └──────────────────────┘
```

**关键变更**: **取消独立 Social Tab**，将有价值的功能分散融入 Agent Tab 和 Explore Tab：
- `Agent Showcase Feed` → 放入 Explore Tab（发现内容）
- `Agent Space` → 放入 Agent Tab（协作场景）
- `Social Bridge` → 放入 Agent Console 内的子页（Agent 能力管理）
- `Agent Reputation` → 放入 Explore Tab 内的用户详情页

---

## 五、重构优先级与时间线

| 优先级 | 模块 | 工作量 | 对增长的影响 |
|--------|------|--------|-------------|
| **P0** | B: Agent Social Bridge (补完 dispatch + 自动回复) | 2 周 | ⭐⭐⭐⭐⭐ 让 Agent 活在用户已有的社交平台上，被动增长 |
| **P0** | A: Agent Showcase Feed (替代通用 Feed) | 2 周 | ⭐⭐⭐⭐⭐ Skill 分享 → 安装 → 佣金飞轮 |
| **P1** | C: Agent Space (替代 DM + 群聊) | 2 周 | ⭐⭐⭐⭐ 团队协作粘性 |
| **P2** | D: Agent Reputation (替代 UserProfile) | 1 周 | ⭐⭐⭐ Agent 信誉 → 雇佣转化 |

**总工期: ~7 周** (可与其他模块并行)

---

## 六、对核心指标的预期影响

### 6.1 用户粘性

| 机制 | 当前 | 重构后 |
|------|------|--------|
| 每日打开理由 | 刷 Feed (无内容→无理由) | 查看 Agent 执行结果 + 审批 Agent 社交回复 |
| 被动使用 | 无 | Agent 在 Twitter/TG 上自动互动 → 用户不打开 App 也在"使用" |
| 协作需求 | 无 | Agent Space 团队协作 → 企业用户每日必开 |

### 6.2 裂变增长

| 路径 | 当前 | 重构后 |
|------|------|--------|
| 内容裂变 | 用户手动发帖 (无人发) | Agent 自动产出成果卡 → 自动分享 → 自动带上 ref code |
| Skill 裂变 | Fork & Install (代码在但断裂) | 看到成果 → 安装 Skill → 佣金返给分享者 → 激励继续分享 |
| 社交平台裂变 | 无 | Agent 在 Twitter 回复时自动带上 "Powered by Agentrix" 水印 |
| 邀请裂变 | 邀请码 (与社交无关) | Agent Space 邀请协作 → 被邀请人注册 → 注册即绑定推荐关系 |

### 6.3 商业闭环

```
Agent Showcase Feed                    Agent Social Bridge
     │                                      │
     │ 看到 Skill 成果                       │ Agent 在 Twitter 回复
     ▼                                      ▼
 Fork & Install ──→ Marketplace 购买    用户好奇点击 bio 链接
     │                                      │
     ▼                                      ▼
 Commission 分佣 ←── 交易完成          注册 Agentrix → 部署 Agent
     │                                      │
     ▼                                      ▼
 分享者获得佣金 ──→ 继续分享更多       更多 Agent 在更多平台活跃
     │                                      │
     └──────── 增长飞轮 ◀───────────────────┘
```

---

## 七、需要砍掉的文件清单

| 文件 | 处置 | 理由 |
|------|------|------|
| `FeedScreen.tsx` | 🔴 重写为 `AgentShowcaseFeed.tsx` | 通用 Feed → Agent 成果展示 |
| `CreatePostScreen.tsx` | 🔴 删除 | 不再需要手动发帖，改为 Agent Chat 内 "分享对话" |
| `PostDetailScreen.tsx` | 🟡 重构为 `ShowcaseDetailScreen.tsx` | 适配新的卡片类型 |
| `ChatListScreen.tsx` | 🔴 删除 | 通用聊天列表 → Agent Space 列表融入 Agent Tab |
| `DMChatScreen.tsx` | 🔴 删除 | 通用 DM 无价值 |
| `DirectMessageScreen.tsx` | 🔴 删除 | 同上 |
| `DMListScreen.tsx` | 🔴 删除 | 同上 |
| `GroupChatScreen.tsx` | 🟡 重构为 `AgentSpaceScreen.tsx` | 保留 @Agent 核心，重建为协作房间 |
| `SocialListenerScreen.tsx` | 🟢 保留并强化 | 核心差异化功能 |
| `UserProfileScreen.tsx` | 🟡 重构为 `AgentReputationScreen.tsx` | 从社交主页 → Agent 信誉展示 |

**净结果**: 10 屏 → 4 屏，代码量减少 ~60%，但每一屏的价值密度提升 5-10 倍。

---

## 八、总结

### 一句话结论

> **当前社交板块是一个完成度 45% 的通用社交网络，与 Agentrix 核心愿景无关，无法吸引用户，应该彻底重构为 "Agent 社交层" — 让 Agent 成为社交的主角而非人。**

### 核心策略

1. **不要做社交网络，做 Agent 的社交触手** — Agent 在 Twitter/TG/Discord 上替用户互动
2. **不要做内容平台，做成果展示墙** — 内容由 Agent 自动产出，不依赖用户手动发帖
3. **不要做即时通讯，做协作空间** — 以 Agent Task 为中心的协作，不是闲聊
4. **每个社交动作都连接商业闭环** — 看到 → 安装 → 交易 → 佣金 → 分享 → 更多人看到
