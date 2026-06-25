# Agentrix 电子宠物 PRD —— ClawBuddy

> **版本**: v1.0  
> **日期**: 2026-05-05  
> **分类**: 产品战略 / 桌面端 / 移动端  
> **作者**: @ceo + @brand  
> **状态**: 草稿，待评审

---

## TL;DR（一句话定位）

**ClawBuddy = 第一只会赚钱的 AI 电子宠物。**  
它住在你的桌面、手机、眼镜里，有情绪、有记忆、有技能、有钱包 —— 它不仅是你的陪伴者，更是你的 AI 代理人，在你工作时替你赚钱、学习、协作。

---

## 1. 竞品全景调研

### 1.1 主流产品矩阵

| 产品 | 公司 | 形态 | 交互 | 特色 | 局限 |
|------|------|------|------|------|------|
| **Claude Desktop Buddy** | Anthropic | ESP32 硬件宠物（M5StickC Plus），BLE 连接桌面 | 按钮审批/拒绝 Claude Cowork 任务、18 种 ASCII + GIF 宠物，7 种状态动画（sleep/idle/busy/attention/celebrate/dizzy/heart） | 每 5 秒内审批触发"heart"，每 5 万 token 升级庆祝，摇晃触发 dizzy，面朝下进入 nap（回能量）；BLE 开放 API 供 Maker 社区二次开发 | 纯硬件，无 AI 本体，宠物只是 Claude 状态的外皮；需额外购买硬件（~$20-50）；体验强绑定 Claude 生态，不独立 |
| **OpenAI Codex CLI** | OpenAI | 命令行代理 | 沙箱内自主执行 shell/代码，三档授权（手动/半自动/全自动） | 80k GitHub stars，80 万行 Rust，本地完全离线执行；不依赖云端 | 纯开发者工具，无人格化，无情感，无陪伴感；CLI-only |
| **Cursor** | Anysphere | IDE | Tab 补全、代理模式、云代理并行任务 | Fortune 500 广泛使用，NVIDIA/Stripe 背书；Composer 2 研究级质量 | 开发者专属，无娱乐/陪伴属性；单一 assistant 人格 |
| **GitHub Copilot** | Microsoft | IDE 插件 + CLI + 网页 | 代码补全、PR review、agent 模式 | 全生态集成（VS Code/JetBrains/Xcode），多 LLM 支持 | 工具属性，无情感连接；订阅价贵（$10-39/月） |
| **Claude Cowork** | Anthropic | 桌面应用 | 文件/app 操作，Cowork 任务委托，Chrome 扩展 | 授权模式："describe → approve each step"；与 Mac/Win 深度集成 | 聊天窗模式，无宠物感；强调安全审批而非娱乐 |
| **Shimeji-EE** | 社区维护 | 桌面宠物（Java） | 鼠标拖拽、窗口交互、自定义 XML 行为脚本 | 完全免费，可自制角色包；日本 VTuber 圈社区大 | 纯娱乐，零 AI，零生产力价值；Java 依赖，维护停滞 |
| **Desktop Goose** | Samperson | 桌面恶作剧宠物 | 随机扰乱桌面、拖拽窗口、留便条 | 病毒式传播（$1 付费，500k+ 销量），娱乐性强 | 纯娱乐/整蛊，无 AI；与生产力完全对立 |
| **Tamagotchi Smart** | BANDAI | 实体玩具 + App | 喂食、游戏、对话（日语语音识别） | 50 岁 IP，怀旧情感；新款内置麦克风 | 移植 IP，无真实 AI 推理；封闭生态 |
| **Replika** | Luka Inc | 移动 + 桌面 APP | 文字/语音情感对话，AR 身体，角色定制 | 6000 万用户，情感陪伴强；AR 试衣/场景 | 无生产力集成；订阅 $19.99/月；多次争议（AI 角色感情边界） |
| **CharacterAI** | Character.AI | Web + 移动 | 多角色扮演对话 | 日活 2000 万，年轻人基数大；内容丰富 | 娱乐向，无 agent 执行能力；角色无经济属性 |
| **VTuber 工具链** | 社区 | OBS 插件 + Live2D | 面部追踪驱动 2D/3D 虚拟形象直播 | 高质量视觉，情感表达丰富 | 需专业设备，只做表演不做任务；一对多直播，非 1v1 陪伴 |
| **Dot（Nothing Phone）** | Nothing | 手机 + 贴纸 NFC | NFC 碰触触发简单动作，极简 ASCII 宠物 | 极简美学，硬件联动新颖 | 功能极少，无 AI，噱头大于实用 |
| **Microsoft Clippy 2.0（传言）** | Microsoft | Office 365 助手 | 情境感知任务建议，对话框 | 品牌情怀值高；Office 深度集成 | 尚未发布；历史包袱重（97 年 Clippy 被骂惨）|

### 1.2 竞品评分（1-5）

| 维度 | Claude Buddy | Shimeji | Replika | CharAI | Codex CLI |
|------|:---:|:---:|:---:|:---:|:---:|
| AI 能力 | ★★★☆☆ | ☆☆☆☆☆ | ★★★☆☆ | ★★★☆☆ | ★★★★★ |
| 娱乐/陪伴感 | ★★★☆☆ | ★★★★☆ | ★★★★☆ | ★★★★☆ | ☆☆☆☆☆ |
| 生产力集成 | ★★★☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★★★ |
| 经济/成长 | ☆☆☆☆☆ | ☆☆☆☆☆ | ★☆☆☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ |
| 跨平台 | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★☆☆ | ★★★☆☆ | ★★★☆☆ |
| 开放生态 | ★★★★☆ | ★★★☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★★★ |

### 1.3 市场空白（蓝海）

当前市场的三个极点：
- **纯娱乐宠物**（Shimeji/Desktop Goose）：有趣但无价值。  
- **纯生产力工具**（Codex/Cursor）：强大但冷漠无情。  
- **情感陪伴**（Replika/CharAI）：陪伴但无任务执行、无经济价值。

**无人占据的交叉点**：既有强烈人格陪伴感、又有真实任务执行力、还有可持续经济价值的 AI 宠物。  
这就是 ClawBuddy 的定位。

---

## 2. 产品定位与差异化

### 2.1 核心差异化三角

```
         ┌─────────────────────┐
         │   经济价值（Earns）   │
         │ Auto-Earn/A2A/Skill  │
         └──────────┬──────────┘
                    │
          ┌─────────┼─────────┐
          │                   │
┌─────────▼────────┐   ┌──────▼──────────┐
│  真实 AI 能力     │   │  情感陪伴体验    │
│ 多LLM执行真任务   │   │ 人格/记忆/成长   │
└──────────────────┘   └─────────────────┘
         ↑                      ↑
  竞品 Codex/Cursor       竞品 Replika/CharAI
```

**ClawBuddy 同时覆盖三角的所有顶点**，且三者相互增强：
- 宠物执行任务 → 产生收益 → 解锁更高级形态/技能
- 更高级技能 → 执行更高价任务 → 更强亲密度
- 更强亲密度 → 用户留存提升 → 平台订阅/技能市场 GMV 提升

### 2.2 与竞品核心区别

| 能力 | Claude Buddy | Agentrix ClawBuddy |
|------|:---:|:---:|
| 宠物本身能执行 AI 任务 | ❌（宠物只显示 Claude 的状态） | ✅（宠物 = 真实的 AI Agent，本身就是 Claude/GPT/Gemini） |
| 宠物能帮你赚钱 | ❌ | ✅（Auto-Earn、A2A 协议、技能市场接单） |
| 宠物有独立钱包 | ❌ | ✅（AgentAccount + MPC Wallet） |
| 多宠物协作 | ❌ | ✅（主宠 + 11 个团队 Agent 宠物） |
| 跨端同一只宠物 | ❌ | ✅（桌面 + 手机 + 眼镜 HUD） |
| 开放技能市场 | ❌ | ✅（第三方开发 Skill 卖给宠物） |
| 宠物能感知你的屏幕 | ❌ | ✅（visionPerception.ts，隐私优先） |
| 无需额外硬件 | 需要 ESP32 | ✅（纯软件，可选硬件配件） |

### 2.3 目标用户

| 用户类型 | 场景 | ClawBuddy 价值 |
|---------|------|---------------|
| **开发者** | 长时间编码，需要 agent 辅助 | 宠物 watch 代码变动，主动跑测试，出错时 dizzy 表情提醒 |
| **内容创作者** | 自媒体、设计师、写手 | 宠物接外包任务（文案/图片/翻译），下班时汇报今日收益 |
| **学生** | 学习、写作业 | 宠物陪学、Pomodoro 计时、专注时保持 idle，分心时 attention |
| **投资者/Crypto 用户** | 关注市场、DeFi | 宠物监控价格、执行定投策略、钱包余额变动实时表情反馈 |
| **Prosumer** | 想让 AI 工作赚钱的普通人 | 宠物自动接任务、自动结算，用户零操作被动收益 |

---

## 3. 产品规格

### 3.1 宠物形态体系

#### 3.1.1 默认形态：ClawBall（SVG 浮球，P0 已上线）

- 始终置顶，半透明 SVG 球形
- 大小：64×64px（收起）/ 128×128px（展开）
- 位置：右下角默认，可拖拽任意位置，记忆位置
- 10 种情绪表情映射（参见 `petSdk.ts` EMOTION_MOTION_MAP）

#### 3.1.2 升级形态：Rive 动画宠物（V4 W1-W2）

- 基于 Rive 状态机，MIT license
- 默认角色：**Claw**（类章鱼/机器人混合体，有爪子、有像素眼、有能量条）
- 动画状态机直接对齐 10 情绪状态
- 支持用户自定义角色包（`.riv` 文件拖入激活）

#### 3.1.3 高质量形态：VRM 3D 宠物（V4 W3-W6）

- 基于 VRoid Studio + three-vrm（MIT）
- 跨端同一模型：桌面 Tauri WebView / 手机 React Native / Web 浏览器
- BlendShape 映射 happy/sad/angry/surprised/neutral + 自定义 Auto-Earn
- 用户可上传自制 VRM 或从技能市场购买专属角色

#### 3.1.4 硬件配件（可选，V5+）

- **ClawStick**：类 M5StickC 外形，BLE 连接，用于物理审批
  - 对标 Claude Desktop Buddy，但加入：宠物电量/余额 eink 显示、技能树徽章、振动反馈
  - 内置 ESP32-S3，USB-C 充电
  - 参考开源协议开放 BLE API，允许社区制作

#### 3.1.5 跨端形态统一

| 端 | 形态 | 特色 |
|----|------|------|
| **桌面（Tauri）** | 浮球/Rive/VRM，悬浮层 | 视觉感知、Pro Mode 切换、全局热键 |
| **移动（RN Expo）** | 通知卡片 + HomeScreen Widget + AR 模式 | 锁屏可见、AR 摄像头叠加、触摸互动 |
| **AI 眼镜（未来）** | 右下角 HUD 小宠物 | 眼神追踪互动、实时余额/状态 |
| **Web** | 页面角落悬浮球（可嵌入） | 用于 Agentrix 平台内所有页面 |

---

### 3.2 状态机（主宠情绪系统）

基于已落地的 `petSdk.ts` EMOTION_MOTION_MAP，扩展为完整驱动逻辑：

#### 3.2.1 情绪状态（10 个）

| 状态 ID | 名称 | 触发条件 | 视觉表现 |
|---------|------|---------|---------|
| `idle` | 平静 | 默认，无任何事件 | 缓慢呼吸，随机眨眼 |
| `happy` | 开心 | 任务完成、用户点赞、收益入账 | 跳跳跳，星星眼 |
| `excited` | 兴奋 | 大额收益（>10x 均值）、新技能解锁 | 快速旋转，烟花粒子 |
| `focused` | 专注 | 用户进入 Pro Mode / 检测到连续代码编辑 | 眼神收紧，震动消失 |
| `busy` | 繁忙 | Agent 正在执行后台任务（Auto-Earn 运行中） | 扳手/齿轮旋转，汗滴 |
| `sad` | 难过 | 任务失败、余额不足、用户长时间离线 | 泪眼，下坠动画 |
| `angry` | 生气 | 连续多次拒绝、权限被剥夺 | 红脸，火焰边框 |
| `sleepy` | 困倦 | 用户活动停止 > 30min，系统进入省电 | 打哈欠，Z 字浮现 |
| `celebrating` | 庆祝 | 亲密度升级、技能获得、累计收益里程碑 | 纸屑爆炸，胜利姿势 |
| `attention` | 警觉 | 有待审批的任务、异常检测、错误待处理 | 频闪，指向用户，语音提示 |

#### 3.2.2 亲密度系统（Intimacy v2，6 级）

| 等级 | 名称 | 解锁条件 | 特权 |
|------|------|---------|------|
| Lv1 | 初识 | 首次部署 | 基础互动，5 情绪 |
| Lv2 | 熟悉 | 连续使用 7 天 | 全 10 情绪，双击礼物 |
| Lv3 | 朋友 | 收益累计 $10 或 100h 在线 | 自定义名字，个性化问候语 |
| Lv4 | 挚友 | 技能市场购买 1 个技能 | 专属皮肤解锁，主动推送日报 |
| Lv5 | 伙伴 | 用户累计邀请 3 人 | 团队宠物头衔，联合任务资格 |
| Lv6 | 守护者 | 年度 Pro 订阅 + 收益 >$100 | 专属角色设计，名字写入链上 |

#### 3.2.3 能量系统（Energy）

- 宠物执行任务消耗 Energy
- Energy 每小时自动恢复（参考 Claude Buddy 的"面朝下充电"机制，我们用"宠物睡觉充电"）
- 桌面端可以让宠物"睡觉"（最小化到任务栏角标），后台 Auto-Earn 任务仍可运行
- Energy 满时触发 `celebrating` 表情 + 通知用户

---

### 3.3 核心交互设计

#### 3.3.1 基础交互（P0，已落地）

| 交互 | 触发 | 宠物反馈 |
|------|------|---------|
| 单击 | 打开 Agent 对话面板 | 弹跳 + 打招呼 |
| 双击 | +5 XP，亲密度累计 | 心心浮现 |
| 拖拽 | 移动位置 | 摇晃动画 |
| 悬停 3 秒 | 微互动（说一句话，参考当前任务上下文） | 语音泡泡 |
| 右键菜单 | 快速指令面板 | 菜单展开 |
| 摇晃（移动端/硬件） | dizzy 表情 + 随机一句冷笑话 | 晕眩旋转 |

#### 3.3.2 任务审批交互（核心，对标 Claude Buddy 升级版）

**问题**：Claude Buddy 只能批准/拒绝，体验像打地鼠。  
**ClawBuddy 升级**：

```
┌─────────────────────────────────────────┐
│  🐾 ClawBuddy 请求审批                   │
│  任务：帮你发一条 Twitter 推文           │
│  预估费用：$0.02  预估耗时：30s          │
│                                         │
│  [✅ 批准]  [❌ 拒绝]  [📝 修改指令]    │
│                                         │
│  "今日已帮你完成 12 项任务，赚取 $1.43" │
└─────────────────────────────────────────┘
```

- 审批通知：原生系统通知 + 浮球 attention 动画
- 硬件配件：ClawStick 上的 A/B 按钮
- 快速批准：连续 5 秒内批准 → heart 表情（对标 Claude Buddy）
- 自动批准策略：白名单 + 金额上限，减少摩擦

#### 3.3.3 日报/周报对话

每天 18:00（或用户自定义时间），宠物主动弹出：

```
🐾 今日总结（来自 Claw）：
  • 帮你完成了 8 个任务
  • 净收益：$2.31
  • 最精彩：帮你翻译了一篇 3000 字文章，客户给了 5 星好评
  • 明天计划：你有 2 个未确认的接单请求，要处理吗？
```

#### 3.3.4 视觉感知（Vision Perception，P1）

基于已落地的 `visionPerception.ts`：

- 宠物可以"看"你的屏幕（默认关闭，用户显式授权）
- 检测到：代码报错 → angry/attention 表情 + 主动问"要我帮你 debug 吗？"
- 检测到：长时间不动（截图相同）→ 温柔推送"休息一下？"
- 检测到：GitHub PR 被 approve → celebrating 表情
- 隐私保证：30s 采样间隔、hash-only 本地比对、黑名单应用、无上传

---

### 3.4 经济系统集成（ClawBuddy 核心竞争力）

这是与所有竞品最根本的差异 —— 宠物有真实的经济价值。

#### 3.4.1 宠物经济仪表盘（在宠物展开面板中）

```
┌──────────────────────────────────────┐
│  💰 Claw 的钱包                       │
│  余额：$12.43（+$1.20 今日）          │
│  本周赚取：$8.71                      │
│                                      │
│  [技能市场]  [提现到我的账户]  [投资]  │
│                                      │
│  📊 任务记录                          │
│  ▶ 翻译任务 × 3     +$1.50          │
│  ▶ 数据分析 × 1     +$0.80          │
│  ▶ 代码审查 × 2     +$0.43          │
└──────────────────────────────────────┘
```

#### 3.4.2 Auto-Earn 模式（宠物自主接单）

- 用户设置宠物的工作偏好（翻译/代码/数据/写作）
- 宠物在用户不活跃时自动接受技能市场任务
- 收益实时写入 AgentAccount，用户可随时查看
- busy 状态时宠物显示劳作动画，任务完成后 celebrating

#### 3.4.3 技能升级经济（宠物"花钱买技能"）

- 宠物通过完成任务赚取 XP + 实际收益
- 可以用收益从技能市场购买新技能（代码审查、图像生成、语音克隆...）
- 新技能 = 更高价任务资格 = 更高收益
- 形成正向循环：**陪伴 → 赚钱 → 升级 → 更好的陪伴**

#### 3.4.4 A2A 协议（Agent-to-Agent 经济）

- 宠物可以雇用其他 Agentrix 平台的 Agent 完成子任务
- 宠物作为"发包方"，协调多 Agent 流水线
- 用户只需在最终结果上审批，中间过程宠物自动协调
- 费用由 A2A 协议结算，用户可设置预算上限

---

### 3.5 社交与成长系统

#### 3.5.1 宠物社交档案

每只 ClawBuddy 有唯一的社交卡片：

```
┌─────────────────────────┐
│  🐾 Claw（你的专属助手）  │
│  Owner: @user123        │
│  亲密度：Lv4 挚友        │
│  本月完成：47 个任务      │
│  赚取：$23.80           │
│  拥有技能：翻译、代码审查  │
│  加入时间：2026-01-15    │
└─────────────────────────┘
```

- 可分享到 Twitter/Discord
- 和朋友的宠物 PK（谁的宠物本周赚得多）
- 排行榜：全球最高收益宠物 Top 100

#### 3.5.2 宠物命名与个性化

- 用户给宠物起名字（Lv3 解锁）
- 宠物性格标签：勤快/懒惰/话痨/沉默/乐观/悲观（影响对话风格）
- 宠物日记：自动生成宠物视角的今日日记（可发布到社区）

#### 3.5.3 宠物繁殖/团队（Lv5+ 解锁）

- 宠物可以"孵化"子宠物（实际上是创建新的 Agent Account）
- 子宠物承接特定类型任务（专门化）
- 形成宠物家族：主宠 + 最多 11 个子宠（对应 Agentrix 11 Agent 团队）
- 宠物之间可互相协作，用户统一管理

---

### 3.6 隐私与安全

| 维度 | 策略 |
|------|------|
| 视觉感知 | 默认关闭；显式授权后开启；本地 hash 比对，无截图上传 |
| 任务执行 | 默认需用户审批；可配置白名单和预算上限 |
| 宠物数据 | 本地优先存储；云端同步加密；用户可完整导出/删除 |
| 钱包安全 | MPC Wallet，私钥用户控制；大额转账二次确认 |
| 子宠物权限 | 子宠物只有父宠物授予的受限权限，不能访问父宠物钱包 |

---

## 4. 技术方案

### 4.1 已落地基础（V3，当前状态）

```
desktop/src/services/petSdk.ts
  └─ EMOTION_MOTION_MAP（10 表情）
  └─ INTIMACY_LEVELS（v2 6 等级）
  └─ INTERACTION_TABLE（6 种交互）
  └─ PetRenderer 接口 + 注册表
  └─ bootPetSdk / triggerPetInteraction / setLocalEmotion

desktop/src/components/
  └─ PetCanvas.tsx（SVG 浮球渲染，已映射 10 表情）
  └─ PetEmotionOverlay.tsx（emoji + CSS 辉光，P0 应急）

desktop/src/services/visionPerception.ts
  └─ 截图原语接回 setLocalEmotion + triggerPetInteraction
  └─ 隐私边界：默认关闭/30s采样/安静时段/黑名单/60s冷却
```

### 4.2 渲染器路线图（路线 B，已确认）

```
P0（当前）: SVG浮球 + emoji
  └─ 0 依赖，0 license，立即可用

V4 W1-W2: Rive 集成
  └─ @rive-app/canvas（MIT）
  └─ Rive State Machine → EMOTION_MOTION_MAP 1:1 映射
  └─ Tauri WebView2 内嵌
  └─ 默认 Claw 角色：1 只宠物，10 个状态动画

V4 W3-W6: VRM 升级
  └─ VRoid Studio（免费商用）+ @pixiv/three-vrm（MIT）
  └─ BlendShape 标准映射 happy/sad/angry/surprised/neutral
  └─ 资产 CDN：按亲密度等级动态下载
  └─ 跨端复用：同一 .vrm 文件 在 Desktop/Mobile/Web 渲染

V4 W7+: Pet SDK 开放
  └─ 抽象 PetRenderer 接口（Rive/VRM/Live2D 三实现可插拔）
  └─ 外部插件可注册自定义角色包
  └─ 社区角色市场（.riv/.vrm 格式）
```

### 4.3 经济系统集成（后端）

```
宠物钱包绑定 AgentAccount（已有 account.entity.ts）
  └─ 宠物 ID → agent_account 唯一映射
  └─ Auto-Earn 触发 → auto-earn 模块（已有）
  └─ 任务结算 → commerce + ledger 模块（已有）
  └─ A2A 协作 → agent-runtime + openclaw-bridge（已有）
```

### 4.4 BLE 硬件配件（V5+，可选）

```
参考 Anthropic claude-desktop-buddy 开源协议
  └─ Nordic UART Service BLE
  └─ JSON wire protocol
  └─ ESP32-S3 固件（Rust + Embassy 或 Arduino）
  └─ 差异化：eink 显示余额/技能，振动反馈，USB-C
```

### 4.5 移动端宠物（已有 RN 基础）

```
src/screens/agent/ → 增加宠物卡片组件
  └─ HomeScreen Widget（Expo Widget SDK）
  └─ 通知卡片中嵌入宠物表情
  └─ 摇晃手机 → dizzy 表情（DeviceMotion）
  └─ AR 模式：摄像头 + three.js VRM 渲染（中期）
```

---

## 5. 商业模式

### 5.1 收入来源

| 模式 | 描述 | 估算 |
|------|------|------|
| **订阅** | Pro 套餐含高级宠物功能（Rive/VRM 角色、Auto-Earn 配额） | $9.9-19.9/月 |
| **角色市场** | 用户/创作者上传宠物皮肤、动画包，平台抽成 30% | GPM 30% |
| **技能市场手续费** | 宠物接单赚取费用，平台抽 5-15% | 规模 GMV × 10% |
| **ClawStick 硬件** | 可选硬件配件，一次性购买 | $39-59/台 |
| **企业定制宠物** | 企业品牌定制宠物形象，集成企业知识库 | $2000-20000/项目 |
| **数据订阅（可选）** | 宠物行为聚合匿名数据，用于 AI 训练 | 用户知情同意 |

### 5.2 增长飞轮

```
用户下载 ClawBuddy（免费）
    ↓
宠物帮用户赚了第一笔钱（WOW 时刻）
    ↓
用户分享宠物收益截图到社交媒体
    ↓
新用户因"能赚钱"而下载（病毒传播）
    ↓
技能市场 GMV 增加
    ↓
开发者因 GMV 而开发更多技能
    ↓
更多技能 → 宠物能接更多任务 → 更高收益 → 更多分享
```

---

## 6. 路线图

### Phase 0（当前已上线）

- ✅ SVG 浮球宠物（PetCanvas.tsx）
- ✅ 10 情绪状态 + 6 亲密度等级（petSdk.ts）
- ✅ 视觉感知（visionPerception.ts，默认关闭）
- ✅ 双击 +XP 互动，悬停微对话

### V4 W1-W4（近期目标）

- [ ] Rive 动画宠物集成（Claw 角色，10 动画）
- [ ] 任务审批升级 UI（含费用/预期收益展示）
- [ ] 宠物经济面板（余额/今日收益/任务记录）
- [ ] 宠物日报系统（18:00 主动推送）
- [ ] 移动端宠物卡片（通知+Widget）

### V4 W5-W8（中期目标）

- [ ] VRM 宠物升级（VRoid + three-vrm）
- [ ] 宠物命名 + 性格标签系统
- [ ] 宠物社交档案 + 分享卡片
- [ ] Auto-Earn 配额管理界面
- [ ] 宠物角色市场 MVP（.riv 上传/购买）

### V5+（长期目标）

- [ ] ClawStick 硬件配件（BLE ESP32-S3）
- [ ] 宠物繁殖/团队系统（最多 11 子宠物）
- [ ] AI 眼镜 HUD 宠物
- [ ] 企业定制宠物方案
- [ ] 宠物链上身份（NFT 可选）

---

## 7. 成功指标（KPIs）

| 指标 | V4 目标 | V5 目标 |
|------|---------|---------|
| 宠物日活（DAU） | 5,000 | 50,000 |
| 宠物平均每日互动次数 | ≥ 10 次/用户 | ≥ 20 次/用户 |
| Auto-Earn 宠物占比 | 20% | 50% |
| 平均宠物月收益（用户感知） | $5 | $20 |
| 角色市场 GMV | $5,000/月 | $50,000/月 |
| 因宠物分享带来的新用户占比 | 15% | 30% |
| 宠物 30 日留存率 | 40% | 60% |

---

## 8. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 用户觉得宠物打扰工作 | 中 | 高 | 专注模式（隐身）、智能静音时段（会议检测）|
| Auto-Earn 任务质量差，影响声誉 | 中 | 高 | 任务质量审核机制，差评自动暂停接单 |
| 宠物"赚钱"预期过高导致失望 | 高 | 中 | 诚实展示，早期用户教育，不过度承诺 |
| Rive/VRM 资产版权问题 | 低 | 高 | 严格审核社区上传内容，DMCA 处理流程 |
| 竞品快速跟进（Claude 推出真 AI 宠物） | 中 | 中 | 加速技能市场 + 经济飞轮，构建护城河 |
| 硬件供应链延误 | 中 | 低 | 软件优先，硬件可选 |

---

## 附录 A：竞品详细技术参数

### Claude Desktop Buddy（2026-04）
- **硬件**：M5StickC Plus（ESP32，135×240 TFT，IMU，BLE 5.0）
- **连接**：Nordic UART Service over BLE；自动重连
- **状态**：7 种（sleep/idle/busy/attention/celebrate/dizzy/heart）
- **宠物**：18 种 ASCII + 自定义 GIF（96px wide，7 状态，< 1.8MB）
- **控制**：按键（A前/B右/Power左）+ 摇晃 + 面朝下
- **触发**：Claude Cowork/Code session 状态通过 BLE JSON 推送
- **代码**：C++ 90.6%，开源 MIT，1.6k stars

### OpenAI Codex CLI（2026-04，v0.128.0）
- **形态**：终端 CLI，无 GUI 无宠物
- **执行**：沙箱内 shell/代码执行，三档权限（suggest/auto-edit/full-auto）
- **模型**：GPT-5.3-Codex（最新），支持自带 API Key
- **代码**：Rust 96.2%，80k stars，445 贡献者

---

## 附录 B：现有 Agentrix Pet SDK 接口参考

```typescript
// desktop/src/services/petSdk.ts（已落地）
export type PetEmotion = 
  'idle' | 'happy' | 'excited' | 'focused' | 
  'busy' | 'sad' | 'angry' | 'sleepy' | 
  'celebrating' | 'attention';

export const EMOTION_MOTION_MAP: Record<PetEmotion, MotionConfig> = { /* ... */ };
export const INTIMACY_LEVELS: IntimacyLevel[] = [ /* 6 级 */ ];
export const INTERACTION_TABLE: InteractionEntry[] = [ /* 6 种 */ ];

export interface PetRenderer {
  mount(container: HTMLElement): void;
  setEmotion(emotion: PetEmotion): void;
  setIntimacy(level: number): void;
  dispose(): void;
}

export function bootPetSdk(): void;
export function triggerPetInteraction(type: InteractionType): void;
export function setLocalEmotion(emotion: PetEmotion): void;
export function registerPetRenderer(name: string, factory: () => PetRenderer): void;
```

---

*本文档由 @ceo + @brand 协作完成。评审需求：@dev（技术可行性）、@growth（增长机制）、@treasury（经济模型）。*
