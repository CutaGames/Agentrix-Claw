# Agentrix Mobile 用户手册（v1.1.x）

> 适用版本：v1.1.0 及以上（2026-06 商店发布）
> 平台：iOS 15.1+ / Android 11+（Wear OS 单独手册）
> 文档状态：初稿，配图待补
> 反馈渠道：App 内 「设置 → 反馈」 / `support@agentrix.top`

---

## 目录

- [快速上手](#0-快速上手三步搞定)
- [1. 安装与启动](#1-安装与启动)
- [2. 邀请码（首次启动必需）](#2-邀请码首次启动必需)
- [3. 4-Tab 主结构](#3-4-tab-主结构)
- [4. Home Tab 详解](#4-home-tab-详解)
- [5. Summon Tab 详解](#5-summon-tab-详解)
- [6. Plaza Tab 详解](#6-plaza-tab-详解)
- [7. Me Tab 详解](#7-me-tab-详解)
- [8. 多端联动（扫码绑桌面端）](#8-多端联动扫码绑桌面端)
- [9. NFC 盲盒兑换](#9-nfc-盲盒兑换)
- [10. Toy 玩具配对](#10-toy-玩具配对)
- [11. 系统助手集成](#11-系统助手集成)
- [12. 隐私与遥测](#12-隐私与遥测)
- [13. 自动更新（OTA）](#13-自动更新ota)
- [14. 故障排除](#14-故障排除)
- [附录 A：版本历史](#附录-a版本历史)

---

## 0. 快速上手（三步搞定）

```
[安装 App] → [输入邀请码] → [选灵狐 + 完成 Onboarding]
                                         ↓
              4 个底部 Tab：Home · Summon · Plaza · Me
```

之后的常用动作：
- **首页主宠 3D** → 单击直接进入语音聊天
- **🔔 铃铛**（顶部右上）→ 全局收件箱（贺卡 / 共养 / 通知）
- **📷 扫码**（顶部右上）→ 扫桌面端登录二维码 / NFC 兑换 / 加好友
- **每天签到** → +20 AXP 起，连续签到 +5/天（最多 +100）

---

## 1. 安装与启动

### 1.1 下载

| 平台 | 来源 | 包名 / Bundle ID |
|------|------|----------------|
| Android | Google Play / `agentrix.top/download` | `app.agentrix.claw` |
| iOS | App Store | `app.agentrix.claw` |
| Watch / Glass / Toy | Mobile App 内 「我的硬件」 | — |

文件大小约 80 MB（含本地 Whisper / llama.rn 模型壳，模型按需下载）。

### 1.2 首次启动顺序

```
SplashScreen (1.5s)
   ↓
LoginScreen
   ↓ (登录成功)
InvitationGateScreen        ← 见 §2
   ↓ (邀请码兑换成功)
OnboardingNavigator         ← 选灵狐 + 同意条款
   ↓ (完成)
MainTabNavigator (Home Tab) ← 进入主界面
```

> 启动 → 进入主界面通常 < 5 秒（取决于网络与本地模型加载状态）。

### 1.3 登录方式

LoginScreen 提供 4 种登录方式：

| 方式 | 适用场景 |
|------|---------|
| **邮箱 + 验证码** | 默认推荐 |
| **OAuth（Google / Discord / Apple）** | 海外用户快捷登录；iOS 强制提供 Apple 登录 |
| **钱包登录（WalletConnect / MetaMask）** | Web3 用户；自动建立链上身份 |
| **Passkey（生物识别）** | 已绑定 passkey 的设备 |

> 同一账号在多端登录是**多端通用**的：手机 + 桌面 + 网页 + Watch 共用一个账号 + AXP 余额 + 主宠资产。详见 §8。

---

## 2. 邀请码（首次启动必需）

### 2.1 为什么有邀请码

V1 / V2 内测期间，邀请码用于：
1. **流量控制** — 避免冷启动期被刷量
2. **身份预付** — 邀请码批次（batch）+ 渠道（channel）字段帮我们追溯每个用户的来源
3. **防滥用** — 配合每天签到 / 推荐奖励等机制

### 2.2 邀请码规则

| 维度 | 规则 |
|------|------|
| 格式 | 12 位字符（大写字母 + 数字混合，自动过滤易混淆字符如 0/O/1/I）|
| **有效期** | 服务端可配置 expiresAt 字段；默认无固定期限（运营按批次设置）|
| **使用次数** | 服务端 `maxUses` 字段，默认 1（一次性）；KOL 邀请链可设置成可复用 |
| 状态 | `available` / `used` / `expired` / `disabled` |
| 输入位置 | 仅在 InvitationGateScreen（首次登录后） |
| 输入大小写 | 不敏感（自动 `.trim().toUpperCase()`）|

### 2.3 跨端通用情况

**核心结论**：

| 问题 | 答案 |
|------|------|
| 移动端有邀请码后，可不可以扫码同步到桌面端？| **可以但不需要邀请码二次验证**。桌面端通过移动端扫描配对 QR 登录（见 §8），桌面端直接获得移动端账号的所有权限，**桌面端不再额外要求邀请码**。 |
| 一个邀请码多端通用？| **不多端通用**。邀请码是**一次性、绑定在该账号开通时**的资源；账号生效后，所有端共享该账号的会员状态。 |
| 桌面端 / 网页端入口是否要邀请码？| **不要**。当前实现下，桌面 / 网页只通过账号体系判断准入，无独立邀请门。 |
| 移动端登出再换账号还要邀请码？| **要**。InvitationGateScreen 会按"账号是否已通过邀请"字段判断；切换到没有 invitation 的账号会再次出现门禁页。|
| 邀请码丢了怎么办？| 当前没有"找回"机制；联系运营邮箱 `growth@agentrix.top`。|

### 2.4 已知 P2 问题

**当前邀请码体系的局限**（运营记录在 `MOBILE_GO_LIVE_AUDIT_2026-05-16.zh-CN.md`）：

- 邀请码字段没有"绑定账号后是否解绑"的概念 — 一个号一旦通过 invitation，永久持有该状态
- 桌面 / 网页端无独立邀请校验，意味着**有移动端账号的人 = 有所有端的访问权**
- 公开测试期可能取消邀请门，运营态决定（默认配置 `INVITATION_GATE_ENABLED=true`）

---

## 3. 4-Tab 主结构

### 3.1 底部 Tab 导航

| Tab | 图标 | 默认入口 |
|-----|------|---------|
| **🏠 Home** | 房子 | 主宠 3D + 10 个抽屉入口 |
| **🔮 Summon** | 水晶球 | 多宠 × 多场景对话中心 |
| **🎪 Plaza** | 大棚 | 5 段集市（Feed / Skills / Tasks / Pets / Play）|
| **👤 Me** | 头像 | 个人 + 订阅 + AXP + 设置 |

### 3.2 顶部全局元素（在 Home / Summon / Plaza 都可见）

| 元素 | 位置 | 功能 |
|------|------|------|
| **🔔 铃铛** | 右上 | 全局 Inbox（系统通知 / 共养邀请 / 贺卡 / AXP 过期提醒）|
| **📷 扫码** | 右上 | 全局扫码（桌面登录 / NFC 卡牌 / 加好友 / 6 视角宠物扫描）|

> Me Tab 没有顶部按钮（已让位给个人头像 + 用户名）。

---

## 4. Home Tab 详解

### 4.1 主宠 3D 区域（屏幕上半部分）

| 元素 | 功能 |
|------|------|
| **VRM/Rive 3D 渲染** | 你的主宠，会有 happy / sad / excited 等 10 种情绪 |
| **XP 进度条** | 当前等级 / 升级百分比 |
| **情绪 emoji** | 实时情绪标识 |
| **签到卡片** | 一天显示一次；点击 → +20 AXP（连续 +5/天，最多 +100）|
| **召唤 CTA**（"和我说话"按钮）| 跳到 Summon Tab |

> **3D 渲染回退策略**：< 4 GB RAM 设备 → SVG fallback；4-8 GB → Rive 2D；≥ 8 GB → VRM 3D。可在「设置 → 性能」手动锁定。

### 4.2 10 入口抽屉

横滑或向上拖网格，10 个功能入口：

| ID | 入口 | 目标 | 说明 |
|----|------|------|------|
| MD-1 | 🎒 技能 | AgentToolsScreen | 你装备的技能列表 |
| MD-2 | 💼 接单 | AgentToolsScreen | 浏览市场任务 |
| MD-3 | 💰 钱包 | AgentAccountScreen | USDC / Stablecoin / Stripe 余额 |
| MD-4 | 🧠 记忆 | MemoryManagementScreen | 4 层记忆（短/工/事件/语义）|
| MD-5 | 🎮 玩乐 | PetPlaygroundScreen | Photo Mimic / Predict / 共养小游戏 |
| MD-6 | 👕 衣柜 | WardrobeScreen | 皮肤列表，一键切换装备 |
| MD-7 | 💫 灵魂 | SoulPickerScreen | 28 灵魂模板，6 族群可选 |
| MD-8 | 🧬 繁育 | BreedScreen | 选 2 父系皮肤生新皮肤 |
| MD-9 | 🆔 身份 | AgentPermissionsScreen | 自动支付 / 信任范围设置 |
| MD-10 | ✨ 创生 | PetCreatorScreen | 文生 / 图生 / 双图融合 / 摄像头扫描 |

### 4.3 PetCreator 三种模式

| 模式 | 操作 | 适用场景 |
|------|------|---------|
| **文生** | 输入 prompt | 最快速，"一只穿宇航服的橘猫" |
| **图生** | 上传相册图 / 现拍 | 把现有形象转成 3D 主宠 |
| **双图融合（繁殖）** | 选 2 父系，可调 A/B 倾向滑块 | 繁殖出"父系平均值"皮肤 |
| **摄像头扫描（V5）** | 绕物体 8-12 视角自动抓拍 | 把现实物体（玩偶 / 玩具）变 3D 主宠 |

PetCreator 配额：

| 计划 | 月配额 |
|------|------|
| Free | 3 |
| Pro | 30 |
| Pro+ | 无限 |

---

## 5. Summon Tab 详解

### 5.1 聊天主界面

| 元素 | 功能 |
|------|------|
| **多宠 Tab Bar** | 切换不同宠物 / 不同场景的会话 |
| **文本输入框** | 输入消息；自动换行 |
| **🎤 语音按钮** | 长按录音；松手发送；本地 Whisper STT |
| **📎 附件** | 图 / 文档 / 链接附件（最多 10 MB / 件）|
| **发送按钮** | 直接发送 + AI 回复 |
| **LLM 预算条** | 顶部薄条；显示当月已用 / 配额 |
| **超额三选一** | 配额耗尽时弹窗：① AXP 抵扣 ② 升档 ③ BYOK 自带 API key |

### 5.2 唤醒词（Wake Word）

支持 "Hey Aira"（默认）或自定义短语。

| 引擎 | 何时使用 |
|------|---------|
| **本地 Porcupine** | 端侧识别，<100ms，完全离线 |
| **系统语音兜底** | iOS Siri / Android SpeechRecognition；本地未训练时回退 |
| **本地训练模板** | 录 5+ 条样本后接管（自动学习用户声音）|

> Android 后台唤醒：需要"显示在其他应用之上"权限 + 录音权限。在「设置 → 唤醒词」开启。

---

## 6. Plaza Tab 详解

### 6.1 5 段 Segmented

| 段 | 内容 | 主要功能 |
|----|------|---------|
| **Feed** | 社区动态瀑布流 | 浏览 / 点赞 / 评论 |
| **Skills** | 技能集市 | 浏览 / 安装 / 卸载技能（每安装一个 +AXP）|
| **Tasks** | 任务集市 | 接单 / 发单 / 中标 |
| **Pets** | 主宠 + 皮肤拍卖 | 整体宠物拍卖、Skin GMV、Cinderella Boost |
| **Play** | 4 个游戏入口 | 模仿秀 / 预测 / 共养 / 贺卡 |

### 6.2 Skin GMV 与 Cinderella Boost

- 你创造的 Skin 上架后被买走，**70% GMV 进你的钱包，10% Cinderella Boost 给首位出价者，平台分 5-15%**（按 Tier）
- AXP 抵扣：买家可用 AXP 抵扣最多 50% 单价
- 拍卖反狙击：最后 5 分钟有出价 → 自动延 2 分钟

### 6.3 共养（Co-Raising）

把你的主宠通过 universal link 分享给朋友，他们能：
- **喂食**（每天最多 10 次，喂方 +5 AXP，主人 +2 AXP）
- **玩耍** / **训练**（按角色权限）
- **看升级**

可设置分成（默认 70/20/10 = 主人 / 共养者 / 平台 AXP）。

---

## 7. Me Tab 详解

### 7.1 8 个子入口

| ID | 入口 | 目标 | 说明 |
|----|------|------|------|
| MM-1 | 个人信息 | ProfileEditScreen | 用户名 / 头像 / 简介 |
| MM-2 | 订阅 | SubscribePlanScreen | 5 档对照（Free / Lite / Plus / Pro / Elite）|
| MM-3 | AXP 中心 | AxpCenterScreen | 余额 + 流水 + 12 月过期规则 + AXP 不是货币声明 |
| MM-4 | AXP 兑换 | AxpRewardShopScreen | 8 类兑换品（订阅折扣 / 配额 / 限定皮肤 / NFT 预售 / 抽奖等）|
| MM-5 | 设备管理 | ToyBindingScreen | Toy / Glass / Watch 绑定列表 |
| MM-6 | 设置 | ClawSettingsScreen | UI 复杂度 / 语言 / 唤醒词 / 通知 / 隐私 / 关于 |
| MM-7 | 关于 | About 面板 | 版本号 / Terms / Privacy / 删除账号 / 数据导出 |
| MM-8 | 登出 | — | 清空 token，返回登录页 |

### 7.2 设置页（ClawSettingsScreen）三大块

#### 7.2.1 界面模式

| 模式 | 适用人群 |
|------|---------|
| 🌱 入门 | 新用户，仅展示聊天 + 基础技能 + 简化设置 |
| 🔧 进阶 | + 工作流、记忆中心、API 密钥、团队功能 |
| ⚡ 专业 | + 权限矩阵、自定义 LLM、MCP 工具 |

#### 7.2.2 语言

中文 / English 切换；切换后整个 App 立即生效。

#### 7.2.3 唤醒词配置

- 主唤醒短语（默认 "Hey Aira"）
- 兜底系统短语（逗号分隔）
- 灵敏度（0.5-0.9）
- 本地模型录制 + 自检 + 清空
- Android 后台唤醒授权

### 7.3 关于页（About）

| 项 | 操作 |
|----|------|
| App Version | 仅显示，无操作 |
| 匿名遥测 | 切换开 / 关。**默认关**；开启后每 5 分钟批量上报 10 类匿名事件 |
| 服务条款 | 跳 `agentrix.top/terms` |
| 隐私政策 | 跳 `agentrix.top/privacy` |
| 导出我的数据 | 跳 mailto:privacy@agentrix.top；30 天内 JSON 导出 |
| 删除账号 | 跳 mailto；7 天内永久删除 |

---

## 8. 多端联动（扫码绑桌面端）

### 8.1 桌面端登录流程

```
桌面端启动 → 显示二维码 (480x480, 60s 失效)
   ↓
移动端 顶部 📷 扫码
   ↓
扫到 https://agentrix.top/pair?session=xxx&platform=desktop
   ↓
移动端调 confirmDesktopPairWithApiBase(session)
   ↓
桌面端拿到 token + user info → 自动登录
```

> ✅ **桌面端复用移动端账号**：所有 AXP 余额、主宠、订阅状态、邀请码权益都同步过来。
> ✅ **不需要二次邀请码**：桌面端只看账号是否已激活，不再独立校验邀请码。

### 8.2 网页端同样流程

`agentrix.top` → 右上角"二维码登录" → 同样的 QR 流程。

### 8.3 多账号切换

App 内（AgentDrawerContent / AgentConsoleScreen）已有多 instance 切换：

```
顶部"实例选择器"芯片 → 列出所有已绑定的 OpenClaw 实例
   ↓
单击切换主控（active instance）
```

每个实例可对应不同的部署：本地 / 云上 / 中继。

---

## 9. NFC 盲盒兑换

### 9.1 触发流程

```
1. 购买 Agentrix 实物盲盒 / 卡牌 / 贴纸
2. 用 iPhone / Android 碰触实体（NDEF tag URI: agentrix://nfc/<token>）
3. 扫码屏自动拉起 NfcRedeemScreen
4. 调 /api/v1/clawcore/nfc/redeem
5. 服务端验证 token 唯一性 → 颁发限定皮肤 / Soul / 道具
6. 弹动画"✨ 解锁了 XXX 皮肤"+ 主宠 excited 表情 3s
```

### 9.2 防滥用

- 每个 token 一次性
- 同一用户 24h 内重复 tap 同 token 仅触发情绪，不重复发奖
- 异常碰触次数（10s 内 > 5 次）触发风控

---

## 10. Toy 玩具配对

### 10.1 OOB 6 位配对码

```
1. Me → 设备管理 → "+ 添加新设备"
2. 蓝牙发现附近 ESP32 / ClawCore Toy
3. 选中设备 → 服务端发 6 位配对码（60s 有效）
4. 设备屏幕 / 包装上显示 6 位码
5. 用户输入到 App
6. 服务端验证 → 颁发 device JWT + 公钥固化
7. 弹"✅ 已绑定"
```

### 10.2 设备管理列表

每个设备显示：

- 名称 / 类型（Toy / Glass / Watch）
- 电量 + 固件版本
- 最后活跃时间
- OTA 升级（有可用更新时显示按钮）
- 解绑按钮

---

## 11. 系统助手集成

### 11.1 iOS App Intents

| Intent | 触发 | 行为 |
|--------|------|------|
| `CreatePetIntent` | "Hey Siri, 让 Aira 帮我生成一只蓝独角兽" | 打开 PetCreator + prompt 已填好 |
| `SwitchSkinIntent` | "Hey Aira, 换猫女皮肤" | 打开 Wardrobe + 自动选中 |
| `PetMoodIntent` | "Hey Aira, 萌宠现在心情怎么样" | 弹 toast 显示当前情绪 |
| `MarketSearchIntent` | "Hey Aira, 找圣诞主题皮肤" | 跳 Plaza · Skills + 搜索词预填 |

### 11.2 Android App Actions

注册 6 个 BIIs（Built-In Intents），见 `android/app/src/main/res/xml/actions.xml`：

- `actions.intent.GET_THING` → "问 Aira"
- `actions.intent.CREATE_MESSAGE` → 起草
- `custom.actions.intent.APPROVE` → 批准（需 approvalId）
- `actions.intent.GET_ACCOUNT` → 钱包状态
- `custom.actions.intent.INVOKE_AGENT` → 调用智能体
- `custom.actions.intent.PET_MOOD` → 主宠情绪

### 11.3 灵动岛 / 锁屏 Widget

iOS WidgetKit + ActivityKit native module（推迟到 v1.2 引入）。当前 v1.1 没有。

---

## 12. 隐私与遥测

### 12.1 默认值

| 数据类型 | 默认 | 说明 |
|---------|------|------|
| **崩溃报告**（Sentry） | **始终开** | 仅栈追踪 + 设备指纹哈希；脱敏路径、邮箱、钱包地址 |
| **行为遥测** | **关** | 每 5 分钟批量；10 类事件；不含对话内容 |
| **会话日志**（对话历史）| 仅本端 + 服务端用户私有库 | 用户主动删除即可清空 |
| **位置 / 通讯录** | 不收集 | 除非使用位置相关功能时主动授权 |

### 12.2 切换路径

```
Me Tab → 设置 → 关于 → 「匿名遥测」开关
```

切换后立即生效（5 分钟内首批事件停止上报）。

### 12.3 删除账号 / 导出数据

```
Me Tab → 设置 → 关于 → 「删除账号」/「导出我的数据」
   ↓
跳 mailto:privacy@agentrix.top（GDPR Article 20）
   ↓
我们 7 天内删除（账号 + 对话 + AXP）/ 30 天内 JSON 导出
```

---

## 13. 自动更新（OTA）

### 13.1 OTA vs 商店更新区分

| 类型 | 更新方式 | 频率 |
|------|---------|------|
| **OTA**（EAS Update）| JS bundle 替换 | 高，hotfix 当天 |
| **商店更新**（Native binary）| Play / App Store 推送 | 低，按 release |

### 13.2 OTA 拉取触发

App 启动时自动检查（`app.json` `updates.checkAutomatically: ON_LOAD`）：

```
有新 OTA → 静默下载 → 下次启动生效
```

### 13.3 哪些不能 OTA

按 Apple 政策（Android 较松）：
- 新 native module（必须发 binary）
- 业务核心改动（Apple 审核员可能拒）
- 新增图片资源（如果没在原 binary 中预声明）

文案 / bug fix / UI 调整可 OTA。

---

## 14. 故障排除

### 14.1 启动阶段

| 现象 | 解决 |
|------|------|
| Splash 卡死 > 10s | 强制结束 App + 重启；如重复发生：清缓存 → 设置 → "清空所有数据" |
| 登录后白屏 | 检查网络；查看是否服务端临时不可用（status.agentrix.top）|
| 邀请码总是无效 | 大小写不敏感但有空格会失败；复制粘贴时用尾部空格清理 |
| 推不到通知 | 设置 → 通知（系统级）→ 允许 Agentrix |

### 14.2 性能问题

| 现象 | 解决 |
|------|------|
| 主宠卡顿 | 设置 → 性能 → 锁定为 Rive 2D |
| 应用闷热 | 关闭后台唤醒词监听；语音对话切非 cloud tier |
| 内存高 | iOS 14+ 下系统会自动 kill 后台进程；冷启动会快速恢复 |

### 14.3 网络

| 现象 | 解决 |
|------|------|
| 连不上服务器 | 检查 DNS（部分代理不能解析 `agentrix.top` 反代）|
| OTA 下载失败 | 切到 WiFi；EAS u.expo.dev 在国内可能需要科学上网 |
| 扫码无响应 | 摄像头权限 + 网络 + 二维码距离 15-30cm |

### 14.4 NFC

| 现象 | 解决 |
|------|------|
| 碰触没反应 | iOS：开 NFC（系统设置）；Android：开 NFC + Beam |
| Token already used | 该 NFC 卡牌已被人兑换；请确认你拿到的是新卡 |
| 同卡触多次 | 24h 内同一用户重复仅触发情绪，不再发奖（设计如此）|

### 14.5 Toy / Glass 配对

| 现象 | 解决 |
|------|------|
| 蓝牙搜不到 | 开蓝牙 + 位置权限；让设备进入配对模式（电源键长按 5s）|
| 配对码超时 | 60s 限制；点"重新生成"再试 |
| 6 位码输错 3 次 | 锁定 5 分钟，等过后再试 |

---

## 附录 A：版本历史

| 版本 | 日期 | 主要变化 |
|------|------|---------|
| v1.1.0 | 2026-06 商店发布 | Sentry 接入；RevenueCat IAP；4 个后端 endpoint 联调；隐私入口；P2 OTA / Analytics / AXP 过期推送 |
| v1.0.0 | 2026-05 内测 | 4-Tab + V4 全功能；NFC + Toy 配对；ClawCore SDK MVP；NFT 铸造 |
| v0.9.0 | 2026-04 alpha | PetCreator 文生 + 图生；Wardrobe；SoulPicker（A 族群）；Plaza 5 段骨架 |

---

## 附录 B：与其他端关系

| 端 | 角色 | 是否要邀请码 |
|----|------|:----------:|
| **Mobile**（本端）| Trust 3 唯一签名端；钱包 / NFC / 相机 / Toy 配对发起方 | ✅ 是 |
| Desktop | 主工作台；扫 Mobile QR 登录 | ❌ 否 |
| Web | 营销 + Marketplace 浏览 | ❌ 否 |
| Watch | Glance + 通知；通过 Mobile 蓝牙中继 | ❌ 否 |
| Toy | 实体陪伴；通过 Mobile 配对 | ❌ 否 |

> 详见 `docs/agentrix-cross-platform-prd-v4.md`。

---

**反馈邮箱**：`support@agentrix.top`
**社区**：Discord / Telegram（App 内 设置 → 关注我们）
**最后更新**：2026-05-16
