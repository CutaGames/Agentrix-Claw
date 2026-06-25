# Requirements Document

> Mobile Pet Companion Redesign — v2(2026-05-22 最终版)。本 spec 在历经 5 轮迭代讨论后**完整重塑**移动端宠物的产品定位、IA、交互模型,核心是把"宠物"从一个"App 内的虚拟形象"提升为"App 本身"——浮球即宠物,宠物即 Agentrix。所有功能的入口、对话、签名、跨端协同都围绕这只浮在屏幕上的宠物展开。

## Introduction

### 立项动机(Why)

当前移动端在 P-6 / Phase C 之后已具备完整的后端能力:11 个 `presence:pet.*` 主题跨端广播、`desktopSyncEventBus` 跨设备记忆共享、MPC wallet Trust 3 签名、9 个系统助手 intents(iOS App Intents + Android App Actions + 中文厂商 manifest)、本地多模态推理(`llama.rn` + Gemma 4 2B / Qwen2.5-Omni 3B + mmproj 投影器)、Picovoice 唤醒词、`SYSTEM_ALERT_WINDOW` 已申请的 Android 系统级悬浮权限。

但**用户感知**仍是"100+ screen 的工程实现",入口分散、心智复杂——这违背"产品强大但使用极简"原则。

### 产品新定位

> **🐾 Agentrix Mobile = 一只(或几只)有自主行为能力的 AI 宠物 + 它的现实数字化游乐场(World Engine)**
>
> **它就是 logo,就是浮球,就是 App 本身**——浮球不再是"语音入口图标",而是宠物本体,跨端持续在场。
> **它能自己花钱、自己接单、自己学技能**(每只宠物 = OpenClaw 实例 + ERC-8004 身份 + AgentAccount 钱包 + Skills + 完整记忆)。
> **它能把现实变成游戏**(World Engine 是 App 的核心叙事,从 Pet drawer 子项升级为 tab 一级)。
> **用户能用一句话(语音)、一个手势(浮球)、或一张照片指挥它**。

### 设计原则(8 条)

1. **宠物 = App = 浮球**——视觉、交互、品牌完全等同。SplashScreen / 通知 large icon / Live Activity / 灵动岛 都呈现宠物 sprite,Phase 2 商店 App icon 也换。
2. **入口去重**——tab 是"目的地",浮球是"宠物"。tab 内能找到的功能不出现在浮球菜单里;浮球只承担"和宠物对话"和"接收宠物主动消息"。
3. **简单 > 强大**——对话气泡 BottomSheet 半屏(90% 场景)+ Summon Tab 全屏(深度场景)双层,不强迫用户在两个之间选;数据完全同步。
4. **签名权与陪伴一体**——浮球既是陪伴载体也是 Trust 3 签名口;高风险动作以醒目 alert 形态弹出,确认即签名。差异化于桌面端的"Pro Mode 弹窗"。
5. **本地优先 > 云端兜底**——已有的本地多模态推理是真正的差异化(飞行模式可用、隐私敏感场景可用);Voice_Greet 等陪伴话术优先本地。
6. **跨端记忆共享是天然属性**——后端 `desktopSyncEventBus` 早已支持,Phase 1 把它**视觉化**呈现到浮球(余额变动、宠物升级、桌面动作都实时反映到移动浮球)。
7. **本地动作优先**(local action wins)——用户主动操作时,服务端 emotion 推送降级为静默 ambient,不强行换 sprite,不打断当前操作。
8. **桌面/移动差异化**——桌面 = Pro Mode 工作台 + Computer Use 键鼠;移动 = 超级浮球 + 系统助手桥 + 全天候在场;移动**不**做 Pro Mode / 完整 wander 漫游。

### IA 终极版(4 tab)

```
🌍 World    🔮 Summon    🎪 Plaza    👤 Me
```

| Tab | 一句话职责 | 用户心智 | 浮球可见 |
|---|---|---|---|
| 🌍 **World** | 现实数字化 + 创造数字角色(扫描/库存/战斗/副本/Pet Creator/Photo→3D Pet) | "和宠物一起玩" | ✅ |
| 🔮 **Summon** | 完整对话面板 + 多 session 历史 + 多模态附件 + 本地/云端路由 | "跟宠物深聊" | ❌(已是对话本身) |
| 🎪 **Plaza** | 市场 + 社交 + UGC 游戏 + 拍卖 + Greeting / Photo Mimic / Toy Custom | "去逛逛 / 和别人玩" | ✅ |
| 👤 **Me** | 用户管理(钱包/订阅/AXP/订单/设置/系统助手桥/本地模型/陪伴设置/推广/Trust 3) | "管理我自己" | ✅ |

**启动默认 tab = World**(让新用户立刻看到杀手级)。

**全局**:🐾 浮球(跨 World/Plaza/Me 持续在场)+ 🔔 Inbox modal + 📷 GlobalScan modal。

**删除**:Home Tab + 6 个 legacy 隐藏 stack(Pet / Agent / Discover / Team / Today / Wallet);Home 当前 13 抽屉格子拆到 World Tab(Pet Creator / CameraScan)+ 浮球详情卡(Wallet / Memory / Wardrobe / Soul / Breed)+ Me Tab(AXP / Subscribe / Checkin)。

### 浮球边界(Android 系统级悬浮 + iOS Live Activity)

- **Android**:用已申请的 `SYSTEM_ALERT_WINDOW` 实现真正出 app 的桌面悬浮(类似微信悬浮窗、QQ 助手),浮在桌面 / 微信 / 抖音上 — **国内体验真正差异化**
- **iOS**:沙箱限制,浮球只能在 App 内浮;App 退后台后用 Live Activity / 灵动岛 / 锁屏 widget 维持在场感
- 默认开启,Companion_Settings 可关闭

### 范围分阶段

- **Phase 1(本 spec, P-9 sprint,~6-10 周)**:4 tab IA 重塑 + 浮球升级 + 对话气泡 BottomSheet + Trust 3 签名 sheet + 跨端可视化 + Lock Screen Pet + Companion_Settings + 5 个新 intents + Agentic Commerce 框架(限额配置 + 推送)
- **Phase 2(后续)**:Wear-OS / AR 把宠物放进相机 / 国内厂商 P2-P3(小艺/小米/小布/Jovi)/ Apple Intelligence 链 / Agentic Commerce 真自主决策 / App icon 商店提交 / 多语言 LLM 翻译
- **Phase 3(后续)**:跨用户社交陪伴(visit/串门/礼物/联机副本)+ Gemini Extensions 完整接入 + iOS 26 新能力

### 与现有 spec / PRD 的关系

| 文档 | 关系 |
|---|---|
| `.kiro/specs/mobile-pet-companion-upgrade/spec.md`(Phase C, shipped) | 前置依赖。复用 sprite renderer / diary / mini-game / haptic / audio。 |
| `docs/PET_FORMS_DESIGN_v5.zh-CN.md` | 桌面端 13 形态权威源,移动端复用 11 形态 sprite。 |
| `docs/PET_FORMS_MOBILE_MIRROR_PLAN_v6.zh-CN.md`(P-6, shipped) | 前置依赖。本 spec 在 PetMode 总线 + 12 形态基础上扩展。 |
| `docs/PET_DESKTOP_VS_MOBILE_COMPARISON.zh-CN.md`(2026-05-22 created) | 对照表参考,本 spec 重新定义移动端独特能力。 |
| `docs/mobile-prd-v3.md §10` | 系统助手集成 P0–P3 路线图。R7 直接引用,新增 5 个 intents。 |
| `docs/mobile-prd-v4.md §8` | V4 新增 4 个 Intent(已 shipped),R7 在此之上补充 P1 反向调用。 |
| `docs/mobile-prd-v5.md` | World Engine 主战场。R3 把 World 提升到 tab 一级。 |
| `docs/agentrix-cross-platform-prd-v5.md` | 跨端总览。本 spec 不影响 §6-§9 已稳定的契约。 |
| `.kiro/specs/reality-ai-world-engine/` | World Engine spec。本 spec 不重做扫描/战斗/副本规格,只规定**浮球如何快捷调起**+ World Tab 如何整合。 |
| `Agentrix_Mobile_Optimization_Plan.md` | 已认同的"语音优先 / 拇指交互区 / 多模态传感器 / 本地 SLM / 跨设备遥控器"方向,本 spec 是它的具体落地。 |

## Glossary

- **Companion_Ball**: 移动端的全局浮球(`GlobalFloatingBall.tsx` 升级版),即宠物本体。Phase 1 起跨 World/Plaza/Me 三个 tab 持续在场,Android 上还可出 app 浮在桌面/其他 app 上。
- **Companion_Mode**: 浮球高层语义模式(8 个,详见 R1)——`companion`/`vigil`/`journey`/`whisper`/`slumber`/`nudge`/`signing`/`working`,与 sprite-level `PetMode` 解耦。
- **Conversation_Bubble**: 浮球单击触发的 BottomSheet 半屏对话气泡(60-70% 高度),承载 90% 日常对话场景(语音+拍照+文字+多模态)。Conversation_Bubble 与 Summon Tab 全屏对话**数据同步**,用户随时点 ⛶ 升级到全屏。
- **Pet_Detail_Sheet**: 浮球长按触发的 BottomSheet 详情卡(85% 高度,垂直滚动),展示宠物状态/钱包/技能/跨端设备/陪伴动作/Co-Raising/设置入口。**不是菜单**——是单页滚动的宠物全景。
- **Active_Pet**: 当前激活的宠物 = OpenClaw 实例 + ERC-8004 身份 + AgentAccount 钱包 + 已装 Skills + 记忆库。多宠物用户在 Pet_Detail_Sheet 顶部下拉切换。
- **Trust3_Signing_Sheet**: Trust 3 签名底片 BottomSheet,任何 L2 高风险动作通过浮球弹出,生物识别(Face ID / 指纹)+ MPC share 1 完成。
- **Wallet_Capsule**: 浮球的"钱包贴纸"形态——余额变动 / 收款 / 转账成功时浮球短暂变胶囊显示金额 + emoji,3 秒后消散。
- **Approval_Alert**: 浮球的"高风险审批"形态——`presence:approval:wrist-trigger` / 桌面端 push 触发,浮球切到 `nudge` 持续 alert 直到响应。
- **Voice_Greet**: 主动语音问候(早安 / 晚安 / 久未交流 / 里程碑 / manual),由后端 `pet-companion-engine` LLM 生成文案,浮球 capsule 形态展示。
- **Quiet_Hours**: 用户配置的勿扰时段(默认 22:00–08:00),期间 Voice_Greet / push / haptic 全部静默。
- **Local_Multimodal_Routing**: 已 shipped 的 `mobileLocalMultimodalRouting.service` 决定该轮对话走本地推理(`llama.rn`)还是云端(SSE proxy),用户可在对话气泡顶部 🌐/📱 标识看到。
- **Cross_Device_Token**: 跨端控制安全令牌,移动 → 桌面发指令时浮球先用 Trust 3 签名生成 30 秒有效令牌,桌面校验后执行。
- **Ambient_Presence**: 宠物在 App 之外的全天候在场层——iOS Live Activity / 灵动岛 / 锁屏 widget / 通知 large icon;Android `SYSTEM_ALERT_WINDOW` 桌面悬浮 / Material You widget / Themed Icons。
- **Agentic_Commerce**: 宠物自主交易能力(Phase 1 框架,Phase 2 真自主)——用户授权宠物在限额内自主购物 / 接单 / 装 skill,超限触发 Approval_Alert。
- **System_Assistant_Bridge**: 双向桥(模式 A:Siri/Gemini/小爱→Agentrix;模式 B:Agentrix→系统助手如 callPhone/openMaps/smartHome/timer/calendar)。Phase 1 现有 9 个 intents + 新增 5 个 = 14 个,5 个反向调用。
- **Form_Variant**: 行为参数变体(default/work/night/journey),不影响外观。

## Design Constraints

- **浮球 BALL_SIZE = 56pt**(从 48pt 升):iPhone 14 Pro 灵动岛宽度约 126pt,56pt 浮球内嵌 sprite 时有 ≥48pt 内容区,符合 Apple HIG 最小可点击区。
- **Companion_Mode 数量 = 8**:陪伴 6 + 工作 2,工作记忆 7±2 上限内勉强。UI 通过分组 + 颜色边框区分。
- **Conversation_Bubble 默认高度 = 65% 屏幕**:既能看到宠物本体浮球,也能看完整对话流。
- **Pet_Detail_Sheet 高度 = 85% 屏幕**:足够展示 6 个 section 滚动,顶部留 15% 让用户看到宠物本体。
- **Voice_Greet 默认每日 ≤3 次**:基于 Replika / Tamagotchi 频率研究。
- **Quiet_Hours 默认 22:00–08:00**:覆盖东亚主流睡眠时段。
- **Trust3_Signing_Sheet 自动取消时长 = 60 秒**:与现有 MPC wallet 签名 timeout 一致。
- **Wallet_Capsule 持续时间 = 3 秒**。
- **Approval_Alert 持续时间 = 4 秒(沿用现有)**,可重复但 1 分钟内同一 approvalId 去重。
- **Cross_Device_Token 有效期 = 30 秒**:防重放。
- **Companion_Mode 切换最小间隔 = 30 秒**:防 emotion 抖动。
- **iOS Live Activity 限制**:单 app 最多 8 并发,本 spec 单宠物方案上限 1 个,远低于限制。Live Activity 最长 12h 自动 dismiss + 重启。
- **Android SYSTEM_ALERT_WINDOW**:已申请,Phase 1 启用真正出 app 浮球。需在 Companion_Settings 引导用户授权"显示在其他应用上层"权限(系统级开关)。
- **System_Assistant_Bridge intents 上限**:iOS App Intents 软上限约 16 个,本 spec Phase 1 维持 9 + 新增 5 = 14 个,留 2 个名额给 Phase 2。
- **System Wake Word 冲突**:检测到系统唤醒词("Hey Siri" / "小爱同学" / "小布小布" / "Hi Jovi") 持续 200 ms+ 时,自建 Voice_Wake_Phrase 监听暂停 8 秒。
- **本地推理性能基线**:已 shipped — Gemma 4 2B 文本 P95 < 5s 首 token、多模态图片 P95 < 90s(mmproj 投影器);超时阈值 180s 文本 / 600s 多模态。
- **不做项**(明确范围):
  - ❌ Pro Mode / Computer Use 在移动端(桌面独占)
  - ❌ 完整漫游 wander 引擎(屏幕太小)
  - ❌ iOS 系统级跨 app 浮球(沙箱不允许,只能 Live Activity)
  - ❌ 新建后端 emotion / proactive 类型(复用现有 11 个 presence 主题)
  - ❌ 新建 MPC wallet / payment / approval 后端模块(已 shipped)
  - ❌ 自研系统助手 SDK(Apple Intents / Google App Actions / 小爱 SkillKit 已够用)
  - ❌ 重写 9 个现有 intents(P0 已 shipped)
  - ❌ 重写 PetCompanionScreen / AgentChatScreen / WorldEngineScannerScreen 等已 shipped 屏幕(只新增 sheet 层和 navigation 重塑)
  - ❌ 多语言现场 LLM 翻译(Phase 1 维持中英双语)
  - ❌ 个性化语音音色训练(Phase 1 用平台 TTS 默认音色)
  - ❌ Marketplace 二级市场卖出流程在浮球完成(Phase 1 仅做购买,卖出仍走 ListingScreen)


## Requirements

### Requirement 1: Companion_Ball 浮球 = 宠物本体 = App 化身

**User Story:** 作为移动端用户,我希望浮球**就是宠物本身**——它在我屏幕一角持续在场、能在 Android 上飞出 App 浮在桌面、在 iOS 上通过灵动岛/锁屏维持在场感、能传达情感和状态、是 7 大职责的统一交互入口,而不是一个紫色圆+sprite的"语音入口图标"。

**Rationale:** 当前 `GlobalFloatingBall.tsx` 只在 Home tab 渲染,本质是"紫色圆 + sprite + 长按进语音"。Phase 1 要把它做成移动 app 的核心载体——logo / 浮球 / 通知 / 锁屏 widget / Live Activity 都呈现同一只宠物。

#### Acceptance Criteria

1. WHEN 用户进入 World / Plaza / Me 任一 tab root, THE Companion_Ball SHALL 以 56×56 pt 默认尺寸渲染在屏幕右下,呈现当前 Companion_Mode 对应的 sprite 帧动画。
2. WHILE 用户处于 Summon Tab、AgentChat、VoiceChat、ClawSettings、全屏 modal, THE Companion_Ball SHALL 隐藏(Summon Tab 本身就是对话目的地,不需要再放浮球)。
3. WHEN 用户从一个 tab 切到另一个, THE Companion_Ball 位置 SHALL 在 3 tab 间保持(单一全局位置,不分 tab 各记一份)。
4. WHEN 用户拖动浮球到屏幕边缘 < 16 pt, THE Companion_Ball SHALL 半隐藏(只露 18 pt),持续 8 秒无交互后自动微缩;**但** Voice_Greet / Approval_Alert / Wallet_Capsule 触发时全自动展开到 56 pt + capsule 模式。
5. **Android 系统级悬浮**:WHEN 用户首次启动且 Android ≥ 6, THE 系统 SHALL 引导用户授予 `SYSTEM_ALERT_WINDOW`(已 manifest 声明,需 runtime 跳系统设置)。授权后浮球可飞出 App,浮在桌面 / 微信 / 抖音 / 任何 app 上。用户可在 Companion_Settings 关闭。
6. **iOS Ambient_Presence**:WHEN App 进入后台且 iOS ≥ 16.1, THE 系统 SHALL 启动 Live Activity 在锁屏顶部展示 32×32 pt sprite + 14 pt 状态文字 + 相对时间;iPhone 14 Pro+ 同时呈现紧凑岛形态。Live Activity 已运行 ≥ 12 小时自动 dismiss + 重启。
7. **品牌视觉一致性**(Phase 1 应用内统一):THE SplashScreen / 通知 large icon / Live Activity / 灵动岛 / Wallet_Capsule / Approval_Alert / Voice_Greet 气泡 全部 SHALL 呈现当前 Active_Pet 的 sprite,**不**用 "AX" 紫色占位符。App icon(商店提交版)留 Phase 2。
8. WHEN Companion_Mode 在 30 秒内连续变化 > 3 次, THE Companion_Ball SHALL 启用模式切换防抖,只播最后一次 mode 的 sprite。
9. WHEN 浮球处于 sleep / 深夜模式, THE Companion_Ball SHALL 禁用 pulse 呼吸动画,只保留低频(1 Hz)眼睛闪烁;单击改为先弹"现在是深夜模式,确定唤醒吗?"二次确认。
10. WHILE 用户低电量模式开启(`expo-battery` `lowPowerMode === true`), THE Companion_Ball SHALL 把 sprite 帧率从 12 fps 降到 6 fps,关闭装饰动画。
11. WHEN Companion_Ball 处于 `signing` mode(Trust3_Signing_Sheet 展开中), THE 浮球本体 SHALL 锁定不可拖动 + 不可单击关闭 + 不可被其他事件抢占,用户必须在 sheet 上明确"取消"或"确认"。
12. WHEN Companion_Ball 处于 `approval` mode 持续 ≥ 60 秒未响应, THE 系统 SHALL 同时触发一次系统级 push,通过 push 把用户导回 App。

#### Companion_Mode 8 个状态(陪伴 6 + 工作 2)

| 模式 | 触发 | sprite | 说明 |
|---|---|---|---|
| `companion` | 默认 / 用户主动操作 | `idle`(讲话切 talk,听切 listen) | 陪伴默认 |
| `vigil` | emotion=tired/sleepy / 后端连续失败 ≥3 次 | `sit`(久未操作 30 min+ 切 sleep) | 守候 |
| `journey` | HealthKit 检测走路 ≥60 秒 | `walk`(里程碑切 jump) | 同行 |
| `whisper` | Voice_Greet / `missed_you` proactive | `talk` 4 秒后回 companion | 私语 |
| `slumber` | Quiet_Hours / `night` Form_Variant | `sleep` 强制 | 安睡 |
| `nudge` | Approval_Alert / 高优先级通知 | `alert` 直到响应 | 提醒 |
| `signing` | Trust3_Signing_Sheet 展开 | `alert` + 紫色脉冲边框(区别 nudge 橙色) | 签名中 |
| `working` | Form_Variant=`work` 时无其他高优先模式 | `sit` / 任务进度时 talk | 工作 |

---

### Requirement 2: Conversation_Bubble 双层对话(BottomSheet 半屏 + Summon Tab 全屏)

**User Story:** 作为用户,我希望"和宠物说话"是最自然、最快的动作——单击浮球立即弹出半屏对话气泡,我可以**当前页不被打断**(Home / World / Plaza / Me 都能聊)继续问;需要长会话或看历史时,一键升级到 Summon Tab 全屏。语音转写 / 拍照问 / 本地推理 / 多模态附件 在两层都能用。

**Rationale:** 当前对话只在 Summon Tab 全屏存在,跳转感强,对话和当前页面 context 割裂。Conversation_Bubble 半屏让"问宠物"成为零成本动作,**90% 场景一键完成**;Summon Tab 是"深度对话面板"承载多 session / 历史 / 大文件附件。两层数据完全同步——用户在浮球聊到一半点 ⛶ 进 Summon 全屏继续无缝。

#### Acceptance Criteria

1. WHEN 用户单击 Companion_Ball **或** 系统唤醒词 / Siri / 小爱触发 `ask_aira`, THE Conversation_Bubble SHALL 从屏幕底部弹出 65% 高度 BottomSheet,15% 顶部仍可见浮球本体 sprite。
2. THE Conversation_Bubble SHALL 包含以下区块(从上到下):
   - **顶栏**(40pt):🐾 [Active_Pet name] · [当前 Companion_Mode 文字] · ✕(关闭) · ⛶(展开到 Summon Tab)
   - **路由标识**(右上角 28pt):🌐 云端 / 📱 本地(基于 `Local_Multimodal_Routing` 决策实时显示)
   - **对话流**(滚动区,占用约 60% sheet 高度):assistant streaming 气泡 + 用户气泡 + STT 实时草稿(灰色,提交后转黑)+ 多模态附件缩略图
   - **输入条**(底部 60pt):📷 拍照 / 📁 相册 / 🎤 录音 / [文字输入] / 🌐(本地/云切换,长按弹) / ▶ 发送
3. WHEN 用户单击浮球唤起 Conversation_Bubble, THE 系统 SHALL 自动激活 voiceMode + duplexMode(沿用现有 `useVoiceSession` 行为),用户立即可以说话,**不需要再点麦克风按钮**。
4. WHEN 用户右滑浮球, THE 系统 SHALL 直接打开相机 → 拍照 → 进入 Conversation_Bubble + 自动注入图片 + 默认 prompt"这是什么?"。用户可立即开口补充("怎么用?""哪买?""帮我下单")。
5. THE Conversation_Bubble 与 Summon Tab AgentChatScreen SHALL 共享同一 messages state(基于 conversation id),数据通过 `useVoiceSession` + 后端 conversation API 双向同步。用户在 Bubble 聊几条点 ⛶ → Summon Tab 自动滚到底显示完整历史。
6. WHEN 用户在 Conversation_Bubble 上滑(向上拖动 sheet ≥ 40%), THE sheet SHALL 全屏化(BottomSheet height = 100%),等同于进 Summon Tab,但保留浮球关闭手势。
7. WHEN 用户在 Conversation_Bubble 下滑(向下拖动 sheet ≥ 30%) **或**点击 ✕, THE sheet SHALL 关闭,浮球回 `companion` 模式,但**保留对话状态**——下次单击浮球继续这次对话(除非用户主动开新 session)。
8. WHEN 设备处于飞行模式 / 离线 / 用户在 Companion_Settings 选"纯本地", THE Conversation_Bubble SHALL 自动走 `MobileLocalInferenceService.generateTextStream` 本地推理路径(已 shipped),路由标识显示 📱,文案池切到本地优化版。
9. WHEN 当前设备未下载本地模型, THE Conversation_Bubble SHALL 走云端路径并在路由标识显示 🌐;Companion_Settings 提示"下载本地模型获得离线 + 隐私体验"。
10. WHEN Conversation_Bubble 收到 LLM 流式回复, THE 系统 SHALL 同时:streaming 文本到气泡(渐入)+ TTS 朗读(`localSpeechOutput.service` 优先本地,降级云端)+ 浮球切到 `companion` mode 显示 talk sprite。
11. WHEN 用户长按某条 message, THE 系统 SHALL 弹出菜单:复制 / TTS 重读 / 在 Summon 全屏继续 / 共享卡片。
12. WHEN 用户在 Conversation_Bubble 中通过语音说出系统助手反向调用关键词(打电话/导航/家居/计时/日历), THE 系统 SHALL **不直接执行**,而是弹出 Approval_Alert "Aira 想让你打电话给 X,确认?" 浮球切 `nudge`(详见 R7-8)。
13. WHEN Active_Pet 切换(Pet_Detail_Sheet 顶部下拉切换), THE Conversation_Bubble 当前 session SHALL 关闭(显示"已切到 [新宠物名]"),新 session 用新宠物 OpenClaw 实例的 conversation 上下文。

#### 多模态实时拍照场景示例

```
场景: 用户在地铁上看到一个有趣的海报 → 想问宠物这是什么

操作: 右滑浮球(右滑手势)
   → 系统相机直接打开,无 modal 跳转
   → 拍照
   → 自动进入 Conversation_Bubble + 图片附件已加载 + 默认 prompt "这是什么?"
   → 用户立刻语音补充: "这个广告什么时候开始的?有没有同款?"
   → 本地多模态推理(Gemma 4 2B + mmproj 投影器)分析图片
   → 路由标识 📱 本地,延迟 ~30s 首 token
   → 流式文本回答 + TTS 朗读
   → 用户上滑展开 → 进 Summon 全屏看完整答案 + 历史对话

总耗时: 2-3 个手势,无 tab 跳转,无打断当前页面
```

---

### Requirement 3: World Tab — 杀手级一级 + 创造数字角色统一入口

**User Story:** 作为用户,我希望进入 App 的第一眼就是 World Engine——扫描真实物体生成游戏角色、看我的资产库存、发起战斗、探副本、Pet Creator 文生宠物——这是 Agentrix 的核心叙事和差异化护城河,不应该藏在 Pet drawer 里。

**Rationale:** mobile-prd-v5 已经把 World Engine 定位为"现实数字化主战场",但当前用户必须先进 Home Tab → 滚到 drawer 第 12-13 格才能找到。Phase 1 把 World 升级到 tab 一级,作为默认启动 tab,让杀手级正式露面。同时把所有"创造数字角色"的功能统一归位(World Engine 扫描 + Pet Creator 文生 + CameraScan 拍照→3D Pet),用户心智统一为"创造一个新角色"。

#### Acceptance Criteria

1. THE WorldStackNavigator SHALL 作为底部 Tab Bar 第 1 项渲染,emoji=🌍,默认启动 tab。
2. THE WorldRoot 主屏 SHALL 包含以下区块(从上到下):
   - **顶部 banner**(可滑卡片):今日扫描配额 / 进行中的战斗倒计时 / 待入副本邀请 / 已扫描资产生成完成
   - **主 CTA grid**(2x2):
     - 📷 扫描物体(默认 Quick Scan,长按二级菜单选 Detail / Room)
     - 🎒 我的资产库存
     - ⚔️ 战斗中心(挑战记录 / 发起新战斗 / 副本入口)
     - 🏰 输入副本码 / 扫描房间生成副本
   - **创造数字角色 section**(从 Home drawer 移过来,3 张大卡片):
     - ✨ Pet Creator(文字创生宠物,跳 PetCreatorScreen)
     - 📷 Photo→3D Pet(拍 8-12 张照片生成 vrm 宠物,跳 CameraScanScreen)
     - 🌍 World Engine 扫描(同上 📷 扫描物体快捷入口)
   - **底部 World Asset 市场入口**:跳到资产 marketplace(Plaza 的拍卖类**不**搬过来,Plaza 拍卖与 World 资产**故意分开**——Plaza 是社交拍卖,World 是扫描生成的资产交易)
3. THE WorldStackNavigator SHALL 注册以下 screen(全部已 shipped,只是从 Home/Pet stack 重新挂载):
   - WorldRoot(新建)
   - WorldEngineScannerScreen
   - WorldAssetInventoryScreen
   - WorldBattleArenaScreen
   - WorldBattlePickerScreen
   - WorldDungeonExplorerScreen
   - WorldAssetListingScreen
   - ReconstructionProgressScreen
   - PetCreatorScreen(从 HomeStack / PetStack 移过来)
   - CameraScanScreen(从 PetStack 移过来)
4. WHEN 用户首次进入 App **且** World Engine 已启用(cohort 内),THE WorldRoot SHALL 显示 onboarding banner"试试扫描你身边的物品",引导第一次扫描。完成后 banner 隐藏。
5. WHEN World Engine 未启用(`world_engine_enabled` flag = false **或**用户不在 cohort), THE WorldRoot SHALL 显示"World Engine 即将开放,加入候补名单",**不**报 404 错误。
6. WHEN 浮球长按打开 Pet_Detail_Sheet,用户从 Sheet 内"陪伴动作"section 选择"创造新宠物", THE 系统 SHALL 跳到 World Tab 的 Pet Creator 卡片,**不**留独立深路径。
7. WHEN 后端 `presence:world-engine.battle-pending` push 触发, THE 浮球 SHALL 切到 `nudge` mode + Lock_Screen_Pet 显示"⚔️ 你被挑战了 — 24h 内回应",点击直达 BattleArena。
8. WHEN 已扫描资产生成完成(后端 push `presence:world-engine.asset.ready`), THE Lock_Screen_Pet SHALL 在锁屏短暂(8 秒)显示"🐾 你扫的物品已生成",点击解锁后跳 InventoryScreen 自动选中刚完成的资产。
9. WHEN World Engine 资产购买流程触发, THE 最终签名 SHALL 通过 R5 Trust3_Signing_Sheet 完成。
10. THE 系统助手 5 个新 intents 中以下两个 SHALL 落到 World Tab:
    - `start_world_scan` — "Hey Siri, 让 Aira 开始扫描" → 跳 WorldEngineScannerScreen Quick Scan(参数:`mode: 'quick' | 'detail' | 'room'`)
    - `enter_dungeon` — "Hey Siri, 让 Aira 进副本 ABC123" → 跳 WorldDungeonExplorerScreen 自动输入 shareCode


---

### Requirement 4: Pet_Detail_Sheet 浮球长按 = 宠物全景(单页滚动,非菜单)

**User Story:** 作为用户,我希望长按浮球**不是弹一个功能菜单**(那会和 4 tab 重复),而是看到这只宠物的**完整全景**——它现在的状态、它的钱包余额、它装了哪些技能、它在哪些设备上活跃、我可以怎么和它互动、可以切换到另一只宠物。这是浮球作为"宠物本体"的真正展开形态。

**Rationale:** 桌面端 16 项菜单在移动端会过载,我之前提的 8 项菜单也仍是工程视角("把所有功能塞进入口列表")。**Pet_Detail_Sheet 是产品视角**——它呈现的是"这只宠物",不是"功能集合"。每个 section 是宠物的一个属性维度,用户上下滑动浏览,需要时点进二级页。

#### Acceptance Criteria

1. WHEN 用户长按 Companion_Ball ≥ 400 ms, THE Pet_Detail_Sheet SHALL 从屏幕底部弹出 85% 高度 BottomSheet,15% 顶部仍可见浮球本体 sprite + 浮球本体仍然可被拖拽。
2. THE Pet_Detail_Sheet SHALL 包含以下 section(从上到下垂直滚动):
   - **顶部 Hero(120pt)**: 大头像 sprite(80×80) + 名字 + ▾(切换宠物下拉) + emotion + Lv + XP 进度条 + energy %
   - **状态概览(60pt)**:"它在做什么" 文字 + 上次互动时间 + 跨端活跃设备列表(emoji 横排:🖥️ 桌面 / 📱 手机 / ⌚ Watch / 👓 眼镜)
   - **它的钱包(可展开 card)**:Active_Pet AgentAccount 余额(USDC + AXP) + 我的钱包入口 + 转账(进 Trust3_Signing_Sheet) + 它今日自主交易记录
   - **它的技能(可展开 card)**:已装 Skills 列表(emoji + 名字 + 上次使用时间) + "+ 装新的"(进 Skill_Install_Card BottomSheet,叠加在上层)
   - **跨端控制(可展开 card)**:已配对设备列表 + 选设备 + 选预设命令 + 进 Trust3_Signing_Sheet 签名发送(详见 R8)
   - **陪伴动作(grid 4×2)**:🍖 喂食 / 🎙 打招呼 / 👕 衣柜 / 💫 灵魂 / 🧬 繁育 / 🧠 记忆 / 🎮 玩乐 / ✨ 创造新宠物(后两项跳出 sheet 进二级深路径或 World Tab)
   - **Co-Raising 入口**:邀请朋友共养这只宠物
   - **设置入口**:进 Companion_Settings(详见 R10)
3. WHEN 用户在 Pet_Detail_Sheet 顶部 Hero 区点 ▾, THE 系统 SHALL 弹出**多宠物选择器**(详见 R5),可切换 Active_Pet。切换后 Sheet 内所有 section 数据**实时刷新**为新 Active_Pet。
4. WHEN 用户在某个 card 上向上滑或点"展开", THE 该 card SHALL 展开为**全屏二级页**(NavigationContainer push),完整展示该维度内容(例:点"它的技能 → 展开" → 全屏 SkillManagementScreen 显示已装 + 推荐 + 卸载;点"它的钱包 → 展开" → 全屏 WalletDetailScreen 显示完整流水)。返回手势回到 Pet_Detail_Sheet。
5. WHEN 用户向下拖动 Pet_Detail_Sheet ≥ 30%, THE sheet SHALL 关闭,浮球回 `companion`。
6. WHEN 浮球处于 `signing` mode(Trust3_Signing_Sheet 已经在上层展开), THE Pet_Detail_Sheet 长按手势 SHALL 被禁用,防止 sheet 叠加冲突。
7. WHEN 浮球处于 `slumber` 或 Form_Variant=`night`, THE Pet_Detail_Sheet 顶部 SHALL 显示提示横条"现在是深夜模式,陪伴动作已静音",喂食/打招呼按钮 disabled,需用户先切到 default Form_Variant。
8. WHEN 设备 VoiceOver / TalkBack 启用, THE Pet_Detail_Sheet 每个 section SHALL 暴露语义化 accessibilityLabel(中英双语),长按浮球后焦点自动聚焦到 Hero 顶部。
9. WHEN 用户**未登录**(authStore 无 token), THE Pet_Detail_Sheet SHALL 仅显示宠物 sprite + "请先登录" CTA,所有 section disabled。
10. THE Pet_Detail_Sheet 内每个 card 的展开操作 SHALL 触发 voiceDiagnostics 埋点 `pet-detail-card-expanded { card }`,便于分析用户最常关注哪个维度。

---

### Requirement 5: Active_Pet 多宠物切换 + ERC-8004 跨端身份

**User Story:** 作为高级用户,我希望可以拥有多只宠物,每只是独立的 OpenClaw 实例 + ERC-8004 身份 + AgentAccount 钱包 + Skills 集合 + 记忆库。在 Pet_Detail_Sheet 顶部下拉切换 Active_Pet,所有视觉、对话、跨端事件、钱包余额都跟着切。这只宠物在我所有设备(桌面/Watch/眼镜)都是同一只——后端 `desktopSyncEventBus` 已经支持。

**Rationale:** 当前 `authStore.activeInstance` 已经支持多 OpenClaw 实例切换(`MyAgentsScreen` shipped),但浮球不响应 — 浮球永远显示用户登录的"默认宠物"。Phase 1 让浮球**真正绑定到 Active_Pet**,切换宠物 = 切换 OpenClaw 实例 = 切换 AgentAccount = 切换 ERC-8004 身份。

#### Acceptance Criteria

1. THE 系统 SHALL 复用 `authStore.activeInstance` 作为 Active_Pet 的 single source of truth,**不**新建宠物切换 store。
2. WHEN 用户在 Pet_Detail_Sheet 顶部点 ▾(下拉箭头), THE 系统 SHALL 弹出宠物选择器(BottomSheet 叠加 50% 高度):
   - 列出 `user.openClawInstances` 全部宠物
   - 每行:sprite 缩略图 + 名字 + Lv + 当前状态 emoji + 跨端活跃设备 emoji
   - 顶部 "+ 创造新宠物" → 跳 World Tab Pet Creator
   - 底部 "管理所有宠物" → 跳现有 MyAgentsScreen(已 shipped)
3. WHEN 用户点击列表中某只宠物, THE 系统 SHALL:
   - 调用 `authStore.setActiveInstance(petId)`
   - 触发 `agentrix:active-pet-changed` 事件携带 `{ from, to }` payload
   - 浮球 sprite **切换动画**(800ms 渐变)+ 触发 light haptic
   - Pet_Detail_Sheet 所有 section 数据**重新加载**(钱包 / 技能 / 状态)
   - 后端 `presence:pet.activate` 推送给所有跨端设备(Phase 1 待 backend 新增,可 fallback 到现有 `presence:pet.state` 整体重新广播)
4. WHEN Active_Pet 切换, THE Conversation_Bubble 当前 session SHALL **关闭**(显示"已切到 [新宠物名]"提示气泡 1.5 秒),新 session 用新宠物 OpenClaw 实例的 conversation 上下文(避免两只宠物对话混淆)。
5. WHEN Active_Pet 切换, THE Lock_Screen_Pet (iOS Live Activity / Android widget) SHALL 同步切换 sprite + 状态文字。
6. WHEN 用户**只有一只宠物**, THE Pet_Detail_Sheet 顶部 ▾ SHALL 隐藏(避免无意义的下拉),只显示"+ 创造新宠物"链接。
7. WHEN 用户在桌面端切换 Active_Pet, THE 移动浮球 SHALL 通过 socket 收到事件,**自动**切换 sprite — 这是跨端一致性的体现(参考 R9 Cross_Device_Sync)。
8. THE 每只宠物 SHALL 有独立的:
   - OpenClaw 实例 ID(已 shipped)
   - ERC-8004 身份(已 shipped,链上)
   - AgentAccount 钱包(USDC / AXP / BTC,已 shipped)
   - Skills 集合(已 shipped,via mcp module)
   - 记忆库(memory + diary + dreaming,已 shipped)
   - World Engine 资产持有(已 shipped,通过 `WorldAsset.ownerType='agent'`)
   - emotion / intimacy XP / Lv(已 shipped)
9. WHEN 用户**有 ≥ 5 只宠物**, THE 选择器 SHALL 在顶部增加搜索框,支持名字模糊匹配。
10. THE 多宠物切换 SHALL **不**在 Phase 1 影响"宠物自主交易"(R7 Agentic Commerce):每只宠物独立的 AgentAccount 各自计算限额,切换不影响其他宠物正在进行的自主任务。

---

### Requirement 6: Trust3_Signing_Sheet 移动端独占签名底片

**User Story:** 作为用户,我希望任何高风险动作(>$500 转账 / 钱包大额支付 / Skill 安装权限敏感 / 远程控制桌面 / approval modal)都通过浮球弹出**统一的签名底片**,生物识别一指完成。这是移动端作为 Trust 3 唯一签名端的核心产品意义——签名即陪伴,陪伴即签名。

**Rationale:** 移动端 MPC share 1 在本机生物识别守护下,桌面端永远不持 share。当前签名 UI 散在 WalletConnect / WalletSetup / QuickPay 各处,且都是全屏 modal。Trust3_Signing_Sheet 把所有 L2 高风险确认收敛到浮球弹出的统一 BottomSheet,既保留 context 又强调"这是宠物在见证你的决定"。

#### Acceptance Criteria

1. WHEN 任何 L2 高风险动作触发(USDC 转账 / Marketplace 购买 / Skill 安装价格 > $50 或权限含 wallet:write/payment:execute/agent:invoke / 远程控制桌面 / approval 风险等级 ≥ L2 / Agentic Commerce 超限), THE 系统 SHALL 通过 `agentrix:trust3-signing-request` 事件触发 Trust3_Signing_Sheet。
2. THE Trust3_Signing_Sheet SHALL 半屏覆盖(70% 高度 BottomSheet) + Companion_Ball 进入 `signing` 模式 + 锁定移动 + 锁定单击。Sheet 内容:
   - 顶部:🐾 [Active_Pet name] 见证签名 + ✕(取消)
   - 中部:动作摘要(发送方 / 接收方 / 金额 / Gas 估算 / 风险等级 emoji)
   - 风险摘要文字(基于 approval 风险等级 LLM 生成的中英文解释)
   - 底部:🔐 生物识别按钮(Face ID / 指纹) + 60 秒倒计时进度条 + 取消按钮
3. WHEN 用户点击生物识别按钮通过, THE 系统 SHALL 调用 MPC share 1 完成签名(已 shipped 模块 `mpc-wallet`),签名成功后:
   - Trust3_Signing_Sheet 关闭
   - Companion_Ball 退出 `signing` 模式
   - 触发 success haptic + 浮球短暂 Wallet_Capsule 显示动作摘要(例 "+$N 转出")3 秒后消散
   - voiceDiagnostics 埋点 `trust3-signing-completed { reason }`
4. WHEN 用户在 Trust3_Signing_Sheet 60 秒未响应 **或** 主动点"取消", THE 系统 SHALL 关闭 sheet + 浮球回 `companion` + 后端取消该签名请求(防止僵尸签名挂起)。
5. WHEN 设备未配置生物识别(Face ID / 指纹未注册), THE Trust3_Signing_Sheet SHALL 降级为 PIN 输入(6 位数字,与现有 wallet PIN 一致),**不**接受无任何身份核验的签名。
6. WHEN 用户当前 Form_Variant = `night`, THE Trust3_Signing_Sheet 仍可弹出但 haptic 强度降到 light、TTS 提示音降到 30%(防深夜误签名但**不**屏蔽签名权)。
7. WHEN World Engine 资产购买金额 > $500 / Skill 安装价格 > $50 / approval 风险等级 ≥ L2 / Agentic Commerce 自主交易超限, THE 系统 SHALL **强制**走 Trust3_Signing_Sheet 二次确认,**不**接受 single-tap 确认。
8. THE Trust3_Signing_Sheet 内容 SHALL 中英双语,根据 `useI18n.language` 切换。
9. WHEN 跨端场景(桌面发起的 approval 需要移动签名), THE 系统 SHALL 在移动浮球 push 同时弹起 Approval_Alert + 进 Trust3_Signing_Sheet 流程,签名结果通过 `desktopSyncEventBus` 广播回桌面让任务继续。
10. WHEN 用户在 Companion_Settings 设置 Trust3_Signing_Sheet timeout(30 / 60 / 90 秒可选), THE 系统 SHALL 立即生效。
11. THE Trust3_Signing_Sheet **不**记录任何 PII(私钥 / share 内容 / 生物识别数据)到日志或 voiceDiagnostics,只记录 `{ reason, success, durationMs }` 元数据。
12. WHEN 同一签名请求 SignRequestId 已经被签过(后端去重), THE 系统 SHALL **不**重复弹出 Sheet,直接返回上次签名结果。


---

### Requirement 7: Agentic Commerce 宠物自主交易框架

**User Story:** 作为用户,我希望我的宠物**能用自己的钱包**做事——它能自动买扫描配额(World Engine quota)、接 task market 任务获得 USDC 收入、装免费 skill 升级自己。但所有这些都在我设定的限额内,超额必须 Trust3 签名我同意。Phase 1 我先看到框架(限额配置 + 推送通知),Phase 2 真正放开 LLM 自主决策。

**Rationale:** 这是 Agentrix 真正的"AI 经济"差异化——竞品(ChatGPT / Claude / Replika)的对话停留在"用户问 → AI 答",但 Agentrix 的宠物有 ERC-8004 身份 + AgentAccount 钱包 + Skills,真正可以**自主行动**。Phase 1 先把框架做出来(用户能配额度、能看到宠物自主消费/收入推送),Phase 2 等用户信任度上来后启用 LLM 真自主决策。

#### Acceptance Criteria

1. THE Companion_Settings SHALL 新增"宠物自主交易"section,包含:
   - 总开关(默认关闭,用户主动开启)
   - 单笔上限(滑块:$0 / $5 / $10 / $50 / $100 / $500)
   - 日累计上限(滑块:$0 / $20 / $100 / $500)
   - 类目白名单(checkbox 列表):
     - World Engine 配额购买(扫描 / Detail / Room / 重生)
     - 接 task market 任务(收入,无需用户钱)
     - 装免费 skill / 续订已订阅 skill
     - World Asset 资产购买(自己买装备)
     - **不允许**:USDC 转给陌生人、跨链 bridge、复杂 DeFi
   - 暂停按钮("紧急冻结宠物自主交易 24h")
2. WHEN 用户首次启用 Agentic Commerce, THE 系统 SHALL 弹出 onboarding 弹窗解释:"开启后,你的宠物可以在限额内自动决定花钱,例如买扫描配额、装免费 skill。它每次决定都会推送给你,超额自动暂停等你确认。" 并要求生物识别确认。
3. WHEN 宠物在限额内自主完成一笔交易, THE 系统 SHALL:
   - **不**弹 Trust3_Signing_Sheet(用户已经预授权了限额)
   - 推送通知"🐾 [pet name] 自主买了 X 花费 $N"
   - 浮球短暂(3 秒)Wallet_Capsule 显示交易摘要
   - Lock_Screen_Pet 在 8 秒内显示一次余额变动
   - 写入 `agent_cost_records`(已 shipped backend table)
4. WHEN 宠物决定的交易**超过单笔限额** **或** 累计 ≥ 日上限, THE 系统 SHALL:
   - **不**自动执行
   - 浮球切到 `nudge` mode + 弹 Approval_Alert "[pet name] 想买 X 花费 $N,超额了,确认?"
   - 用户确认后通过 R6 Trust3_Signing_Sheet 签名
   - 拒绝则后端记录 `agentic_commerce_rejected { reason }`,宠物 LLM 收到 feedback 调整后续决策
5. WHEN 宠物想做的动作**不在白名单类目内**, THE 系统 SHALL **直接拒绝**(不弹 sheet),后端记录 `agentic_commerce_blocked_category`。
6. WHEN 用户点击"紧急冻结", THE 系统 SHALL 立即停止该宠物 24h 内所有自主交易请求,同时向后端 `pet-companion-engine` 发送 freeze 信号。冻结结束后自动解除。
7. **Phase 1 范围**:Phase 1 只做**框架 + UI + 推送 + 限额检查**,LLM 端**不**主动发起交易(后端只在用户对话中明确说"帮我买 X"时执行,不做真自主决策)。Phase 2 才让 LLM 主动判断"现在该买扫描配额了"等情境。
8. WHEN Agentic Commerce 已启用 ≥ 7 天, THE 系统 SHALL 在 Companion_Settings 顶部显示"7 天小结":总自主交易笔数 + 总金额 + 节省的手动签名次数,鼓励用户保持开启。
9. WHEN 宠物的 AgentAccount 余额 ≤ 用户设定的最低安全余额(默认 $5), THE 系统 SHALL 暂停所有自主**支出**(收入仍可),浮球切到 `nudge` 提示用户充值。
10. THE Agentic Commerce 推送 SHALL 在 Quiet_Hours 累积显示("夜间宠物完成了 N 笔自主交易,共 $N"),不打扰用户;Quiet_Hours 结束后一次性总结推送。

---

### Requirement 8: Cross_Device 跨端控制 + 记忆共享可视化

**User Story:** 作为用户,我希望浮球**真正体现跨端**——我在桌面切了宠物的灵魂,移动浮球立刻变形态;我在手机给宠物喂食,桌面宠物立刻做"吃"动作;移动浮球能当遥控器发指令到桌面执行 Computer Use 任务;Pet_Detail_Sheet 显示这只宠物在哪些设备活跃。这是 Agentrix 区别于"单设备 app"的核心差异化,后端早已支持,Phase 1 把它视觉化。

**Rationale:** 后端 `desktopSyncEventBus + presence:pet.*` 早已实现:soul.changed / skin.changed / state / proactive / social.visit / approval:wrist-trigger 都按 userId 广播给该用户**所有终端**。但当前移动浮球只订阅了 `presence:pet.state` 和 `presence:approval:wrist-trigger`,大量跨端事件没用上。Phase 1 把订阅补全 + 视觉化呈现 + 加跨端控制能力。

#### Acceptance Criteria

1. THE 移动浮球 SHALL 通过现有 `connectPetPresence`(已 shipped)订阅以下全部跨端主题:
   - `presence:pet.state`(已订)
   - `presence:pet.proactive`(已订)
   - `presence:pet.soul.changed`(新订)— 跨端切换灵魂时浮球变形态
   - `presence:pet.skin.changed`(新订)— 跨端换皮肤时浮球同步
   - `presence:pet.social.visit`(新订)— 跨端有人来串门时浮球切 `whisper`
   - `presence:approval:wrist-trigger`(已订)
   - `presence:wallet.delta`(新订)— 跨端钱包余额变动时浮球 Wallet_Capsule
   - `presence:world-engine.battle-pending`(新订)
   - `presence:world-engine.asset.ready`(新订)
   - `presence:skill.update`(新订)
2. WHEN 桌面端切换 Active_Pet, THE 移动浮球 SHALL 通过 socket 收到事件,**自动**切换 sprite + Pet_Detail_Sheet 内数据刷新(详见 R5-7)。
3. WHEN 桌面端给宠物喂食(右键菜单"喂食"), THE 移动浮球 SHALL 立刻播放 `eat` sprite 1.6 秒,显示 +1 XP,产生跨端"它在哪里都是同一只"的体感。反向同理(移动喂食 → 桌面 sync)。
4. THE Pet_Detail_Sheet 状态概览 section SHALL 实时显示这只宠物**正在活跃**的设备列表(emoji 横排:🖥️ 桌面 / 📱 手机 / ⌚ Watch / 👓 眼镜),数据来自后端 `presence:device.list`(本 spec 标记为待新增 backend API)。
5. **跨端控制 (Remote Control)**:WHEN 用户在 Pet_Detail_Sheet 点开"跨端控制"card 并展开, THE 系统 SHALL 进入 RemoteControl 二级页:
   - 列出已配对设备(最多 8 个,基于 `presence:device.list`)
   - 用户选目标设备(例:桌面 PC) → 显示该设备支持的预设命令(基于 `presence:device.capabilities`)
   - 桌面预设:"用 Computer Use 帮我 ..." / "打开 Pro Mode" / "启动工作模式"
   - 智能音箱预设:"播报今日待审批" / "播放白噪音" / "停止"
   - Watch 预设:"把通知静音 30 分钟"
6. WHEN 用户选某命令模板填好参数后点"发送", THE 系统 SHALL **强制**经过 R6 Trust3_Signing_Sheet 签名(因为是跨设备 RPC,可能触发对方 Computer Use)。签名通过后:
   - 生成 30 秒有效 Cross_Device_Token
   - 通过 socket 发送到目标设备的 `remote-control:execute` topic
   - 目标设备校验令牌后执行,5 秒内回 ack
   - 浮球触发 success haptic + 切到 `whisper` 2 秒"已发送到桌面"
7. WHEN 5 秒未收到 ack, THE 浮球 SHALL 切到 `nudge` + 文案"对方设备未响应,请确认它在线",命令缓存到 outbox(60 秒内可重试)。
8. WHEN 目标设备执行过程中产生需要审批的子动作, THE 该 approval push SHALL 转回到原发起的移动端浮球,触发 R6 Trust3_Signing_Sheet(确保审批权始终在移动端 Trust 3)。
9. THE Remote Control SHALL **禁用**以下高风险命令(Phase 1):远程关闭设备、远程清空应用数据、远程修改钱包配置;白名单只允许 Computer Use task 启动 / Pro Mode 切换 / 通知静音 / Aira 语音播报 / 设备状态查询。
10. WHEN 用户**未登录** **或**未配置 MPC share 1, THE Remote Control SHALL disabled + 显示"需要 Trust 3 才能远程控制",跳到 WalletConnect 完成配置后才能使用。
11. WHEN Form_Variant = `night`, THE Remote Control 跨端命令 SHALL **不直接执行**,改为目标设备推送一条"用户深夜请求 X,需明早确认"通知,防止深夜误操作。
12. **跨端配对协议**:Phase 1 复用现有 WalletConnect deeplink 配对流程,不新建 PairingScreen(降低用户学习成本)。

---

### Requirement 9: System_Assistant_Bridge 系统助手桥(双向 + 浮球落点)

**User Story:** 作为用户,我希望能用 **Siri / Gemini / 小爱 / 小艺**等系统助手直接驱动宠物(Hey Siri, 让 Aira 帮我开 Pro Mode),不需要先解锁手机打开 App;反过来,我也希望宠物能调系统助手做它擅长的事(打电话/导航/家居/计时)。系统助手 = 系统级 IO 层,Agentrix = AI 经济应用层,两者互补不替代。

**Rationale:** 系统助手集成是 mobile-prd-v3 §10 的差异化主轴,P0 已 shipped 9 intents(iOS App Intents + Android App Actions + 中文厂商 manifest)。Phase 1 把宠物浮球作为系统助手回调的"主着陆点",所有 intent 触发后默认在浮球上视觉化(capsule 形态 + Lock_Screen_Pet update),不直接全屏跳转。同时新增 5 个新 intents + 5 个反向调用动作。

#### Acceptance Criteria

**模式 A — 系统助手 → Agentrix(被动 + 浮球落点)**

1. THE 现有 9 个 intents(`ask_aira` / `pet_mood` / `approve_request` / `wallet_status` / `invoke_agent` / `draft_message` / `create_pet` / `switch_skin` / `market_search`)SHALL **不重做**,但每个 intent 触发后**默认在浮球上呈现结果摘要**——通过浮球 capsule 模式 + Lock_Screen_Pet update,2 秒内可见,而不是直接全屏跳转。
2. WHEN 用户在锁屏说"Hey Siri, ask Aira 钱包余额"(`wallet_status`), THE 系统 SHALL **不**强制解锁打开 App,而是通过 Live Activity 在锁屏直接显示余额。**仅当**用户主动点 Live Activity 才解锁跳到 R6 WalletSheet(新建,从 Pet_Detail_Sheet 钱包 card 衍生)。
3. WHEN `approve_request` intent 触发, THE 浮球 SHALL 切到 `nudge` 模式 + 弹出 Approval_Alert,用户确认后通过 R6 Trust3_Signing_Sheet 完成签名(系统助手**不**拥有签名权,只能 surface)。
4. THE Phase 1 SHALL **新增** 5 个 intents 把 7 大职责暴露给系统助手(总计 9 + 5 = 14):
   - `start_world_scan` — "Hey Siri, 让 Aira 开始扫描" → 跳 World Tab WorldEngineScannerScreen Quick Scan(参数:`mode: 'quick' | 'detail' | 'room'`)
   - `enter_dungeon` — "Hey Siri, 让 Aira 进副本 ABC123" → 跳 World Tab DungeonExplorer 自动输入 shareCode
   - `install_skill` — "Hey Siri, 让 Aira 装一个翻译技能" → 弹 Skill_Install_Card BottomSheet(参数:`name: string`)
   - `remote_control` — "Hey Siri, 让 Aira 控制桌面开 Pro Mode" → 弹 Pet_Detail_Sheet 跨端控制 card 预选目标设备
   - `quiet_30` — "Hey Siri, 让 Aira 安静 30 分钟" → 临时切到 `night` Form_Variant 30 分钟
5. THE 5 个新 intent SHALL 在 iOS App Intents (Swift)、Android App Actions (xml)、`src/services/intents/chineseAssistants.ts` (manifest) 三处**同步**新增。
6. THE 国内厂商配置 SHALL 把现有 manifest 一次性提交到 5 个开发者门户(华为小艺 / 小米小爱 / OPPO 小布 / vivo Jovi / 鸿蒙意图),由 Companion_Settings → 系统助手桥 区域提供"导出 manifest JSON"按钮,生成 vendor-ready 文件。

**模式 B — Agentrix → 系统助手(主动反向调用,Phase 1 新增)**

7. THE Phase 1 SHALL 新增反向调用 5 个动作,通过新建 `src/services/systemAssistantBridge.ts` 统一封装:
   - `system.callPhone({ number })` — iOS `tel:` URL Scheme / Android `ACTION_DIAL`
   - `system.openMaps({ address })` — iOS Maps URL / Android `geo:` URI
   - `system.smartHome({ scene })` — iOS HomeKit Shortcuts deeplink / Android Google Home Shortcut
   - `system.timer({ minutes })` — iOS Shortcuts deeplink "Set Timer" / Android Clock Intent
   - `system.calendar({ title, datetime })` — iOS EventKit Shortcut / Android Calendar Intent
8. WHEN AgentChat / Conversation_Bubble 中 LLM 决定调用 `system.callPhone`, THE 浮球 SHALL 弹出 Approval_Alert "Aira 想让你打电话给 X,确认?" 而**不**直接拨号(每次主动确认,防止 LLM 误调)。
9. WHEN 用户在 Companion_Settings → 系统助手桥 → 反向调用 关闭某项(默认全开), THE 系统 SHALL 不再尝试调用该方法,LLM 端 stop 推理流程并降级回纯文本响应。
10. THE 反向调用 SHALL 每个调用记录到 `addVoiceDiagnostic('system-assistant-reverse', kind, params)`,便于审计。**不**上送服务端(高隐私场景如打电话/位置不出设备)。

**唤醒词冲突处理**

11. WHEN 设备麦克风通过 Picovoice 检测到系统唤醒词("Hey Siri" / "小爱同学" / "小布小布" / "Hi Jovi") **持续 200ms+**, THE 自建 Voice_Wake_Phrase("Hey Aira") 监听 SHALL 暂停 8 秒,让位给系统助手响应,避免双唤醒抢权。
12. THE Companion_Settings → 系统助手桥 SHALL 显示"已检测到系统助手"列表(基于设备型号探测),如:Siri ✅(iPhone)/ Gemini ✅(Pixel)/ 小爱 ✅(Xiaomi)/ 小艺 ✅(Huawei)/ 小布 ✅(OPPO)/ Jovi ✅(vivo),每项显示该助手当前是否为默认。
13. WHEN 用户在 Companion_Settings 显式选择"自建唤醒词不启用,完全靠系统助手", THE 系统 SHALL **不**初始化 Picovoice 引擎,节省电池;长按浮球仍可手动进语音。

**Apple Intelligence / Gemini Extension 共生(Phase 2 预留 hook)**

14. THE 现有 9 + 5 = 14 个 intents 的 manifest **保持稳定 JSON schema**,Phase 2 接入 Apple Intelligence Personal Context / Gemini Extension 时**不**需要修改 intents 本身,只新增"Agentrix can do X with Apple Intelligence"的 capability claim 字段。

**差异化与独特价值(明确陈述)**

15. THE 系统助手桥 SHALL 明确以下**独特价值主张**(Companion_Settings 顶部 marketing slot 展示给用户,也作为 Phase 1 验收的 PM 评审条目):
    - **vs Siri / Gemini 单独使用**:Agentrix 可以**陪伴 + 经济 + 跨端**,Siri 不能持有 Trust 3 签名权、不能跨设备控制 Pro Mode、不能管理 80+ skills 生态。Siri 是系统级 IO 层,Agentrix 是 AI 经济应用层,两者**互补**。
    - **vs 小爱 / 小艺 单独使用**:Agentrix 提供国际化体验 + Web3 钱包 + 跨平台同步;国内助手强于本地服务集成(打车 / 微信支付),Agentrix 通过模式 B 反向调用与之互补。
    - **vs ChatGPT / Claude App**:Agentrix 多了**陪伴(浮球) + 跨端控制 + 系统助手共生 + Trust 3 签名 + 经济闭环 + Living Pet**。竞品大多是"单 app 内对话",我们是"跨端身份 + 经济 + 陪伴"。
    - **vs Replika / Character AI**:Agentrix 多了**经济(钱包/Marketplace)+ 工作能力(Skills/Computer Use 远控)**,陪伴只是 7 大职责之一,不是全部。


---

### Requirement 10: Companion_Settings 集中配置中心 + 本地模型路由

**User Story:** 作为用户,我希望有一个**单一入口**集中管理陪伴体的所有配置(勿扰 / 语音 / 推送 / 锁屏 / 健康 / 形态变体 / Trust 3 / 系统助手 / 本地模型 / Agentic Commerce),避免在 Me Tab 6 个不同设置页里来回找。

**Rationale:** 当前设置散在 Me Tab Settings / ApiKeys / WalletSetup / WearableHub / LocalAiModel / SocialListener 六处,用户找不到。Companion_Settings 是**面向"陪伴系统"的横切配置中心**,跟"用户账户管理"(Me 现有的 Profile / Account)不同——它管的是宠物的行为参数,不是用户身份。

#### Acceptance Criteria

1. THE Companion_Settings SHALL 作为新 stack screen 挂在 Me Tab 下,路由名 `CompanionSettings`,emoji 🐾。
2. THE Companion_Settings SHALL 分为 9 个 section,每 section 用 12pt 灰色 header 分隔:
   - **勿扰时段**:Quiet_Hours 起止时间 + 工作日/周末区分开关
   - **语音问候**:Voice_Greet 总开关 + 每日上限 0–6 滑块 + 5 个场景独立开关
   - **推送通知**:Mood_Diary_Push / 久坐 / 步数 / 余额 / 审批 / Agentic Commerce 各开关
   - **锁屏陪伴**:Lock_Screen_Pet 总开关 + 灵动岛优先 + Themed Icons + Android `SYSTEM_ALERT_WINDOW` 桌面悬浮开关
   - **形态变体**:4 个 Form_Variant 卡片 + 当前激活高亮 + 自动切换规则展示 + "手动锁定 4h" 按钮
   - **Trust 与签名**:MPC share 1 状态 + 生物识别开关 + Trust3_Signing_Sheet timeout 30/60/90 秒选 + 紧急冻结按钮
   - **本地模型**:已下载模型列表(Gemma 4 2B / Qwen2.5-Omni 3B 等) + 三档路由开关(auto / local-only / cloud-only) + 本地推理性能基线监控 + "下载新模型"入口(跳现有 LocalAiModelScreen)
   - **系统助手桥**:14 个 intents 列表 + Siri/Gemini/小爱/小艺/小布/Jovi 厂商配置卡 + Add to Siri 按钮 + "导出 manifest" + 反向调用 5 项独立开关 + 唤醒词冲突让位策略
   - **宠物自主交易**:总开关 + 单笔上限 + 日累计上限 + 类目白名单 + 紧急冻结(详见 R7)
3. THE Companion_Settings 配置 SHALL 持久化到 AsyncStorage 命名空间 `pet_companion_settings/v1` + 同步到后端 `/v1/users/preferences/pet-companion`(后者 Phase 1 可只本地)。
4. WHEN 用户修改任一配置, THE 系统 SHALL **立即**生效(不需重启),通过订阅 settingsStore 让相关模块即时响应。
5. THE Companion_Settings SHALL 在顶部显示一个"今日陪伴小结"卡片(模式切换次数 + Voice_Greet 触发次数 + 互动 XP + 已签名笔数 + 远程控制次数 + Agentic Commerce 自主交易笔数)。
6. WHEN 用户点击"重置为默认", THE 系统 SHALL 在 modal 二次确认后清空 `pet_companion_settings/v1` 并恢复出厂默认值,**不影响**亲密度 XP / MPC share 1 / 已配对设备等核心数据。
7. THE Companion_Settings SHALL 提供"导出陪伴日志"按钮(开发者模式可见),把过去 7 天 voiceDiagnostics 导出 JSON。
8. THE 入口 SHALL 同时通过以下 3 路径到达:Me Tab → 设置 → 陪伴设置;Pet_Detail_Sheet 设置 section;PetCompanionScreen 右上角齿轮。
9. WHEN 用户语言切换, THE Companion_Settings 文案 SHALL 同步切换中英文。
10. **Voice_Greet 主动语音问候**(原 R3 简化整合到本 R):
    - 5 种触发场景之一:`morning`(07:00–09:00 首次解锁) / `evening`(21:00–22:30 最后活跃后) / `comeback`(`missed_you`) / `milestone`(亲密度 / 步数 / 任务完成) / `manual`(浮球菜单)
    - TTS 文案由后端 `pet-companion-engine` LLM 生成(复用 `pet_diary` 链路,**不**新建模块)
    - Quiet_Hours 全静默(`manual` 除外)
    - 每日 ≤3 次自动触发(可在 Companion_Settings 调 0–6,`manual` 不计入)
    - 静音模式 / 耳机断开仅展示文案气泡不播 TTS
    - 用户在 Voice_Greet 期间点浮球暂停 TTS 进入 Conversation_Bubble 接续对话
11. **Mood_Diary_Push 情感日记推送**(原 R5 简化整合到本 R):
    - 后端在每日 19:00–21:00(用户本地时区)推送一次 `pet_diary` 当日条目(已 shipped)
    - 当日已浏览过 PetDiaryCard 自动跳过
    - Quiet_Hours 延迟到 08:00–10:00 推送
    - 点击 deeplink 到 PetCompanionScreen 自动滚到 PetDiaryCard 并切 `whisper` 8 秒
    - 推送 large icon 用宠物当前 sprite
    - 连续 7 天未打开自动降频到每周 1 次
12. **健康/运动陪伴**(原 R7 简化整合):
    - HealthKit (iOS) / Google Fit (Android) 步数 + 步行距离权限(不申请心率/健康记录)
    - 每 15 分钟轮询步数到本地 AsyncStorage `pet_companion_daily_steps`
    - 当日步数 < 5000 步 + 18:00 后触发 `nudge` "今天还差 N 步"(每日仅一次)
    - 5000 / 8000 / 10000 步里程碑切 `journey` + sprite jump + milestone Voice_Greet
    - 久坐 ≥ 60 分钟触发 `nudge` + push(Quiet_Hours 静默)
    - 步数数据**仅本地** + 用户可选上送 `/v1/pet/health-steps`(不与第三方共享、不广告)

---

### Requirement 11: IA 重塑硬约束(从 100+ screen 到 4 tab + 浮球)

**User Story:** 作为产品负责人,我需要在 spec 层固化"哪些保留 / 哪些删 / 哪些重新挂载",避免 design 阶段又被翻盘。本 R 是 IA 重塑的硬约束清单。

**Rationale:** 移动端真实有 100+ stack screen,现有 IA 是工程演化结果,不是产品视角。Phase 1 把 IA 重塑到 4 tab + 浮球 + 全局 modal,大部分 screen **不删,重新归位**。本 R 列出每一项的去向。

#### Acceptance Criteria

**Tab Bar 结构变化**

1. THE 底部 Tab Bar SHALL 由当前 4 可见 + 6 隐藏 = 10 个 tab,**重塑**为只 4 个可见 tab:🌍 World / 🔮 Summon / 🎪 Plaza / 👤 Me。
2. THE 当前 Home Tab(HomeStackNavigator) SHALL **删除**,内容拆到:World Tab(Pet Creator + CameraScan + WorldEngine* 系列) / Pet_Detail_Sheet(Wallet/Memory/Wardrobe/Soul/Breed/Play 等) / Me Tab(AXP/Subscribe/Checkin/CoRaising)。
3. THE 6 个隐藏 legacy tab(Pet / Agent / Discover / Team / Today / Wallet) SHALL **完全删除**,所有 deep link 通过 `legacyRouteTable.ts` 重定向到新位置。
4. THE 启动默认 tab SHALL 设为 `World`(`MainTabNavigator initialRouteName="World"`)。
5. THE Summon Tab SHALL **保留**当前实现(`SummonChatRoot` = AgentChatScreen 全屏多模态对话 + LlmBudgetBar),不动 — 它是对话主入口。
6. THE Plaza Tab 内容 SHALL **完整保留**(25 个 screen 不动),只新增"浮球可见"的渲染层。Plaza 内容拆分留 Phase 2 评估。

**Screen 重新挂载清单**

7. THE 以下 screen SHALL 从 HomeStack / PetStack 移到新建的 WorldStackNavigator:
   - WorldEngineScannerScreen / WorldAssetInventoryScreen / WorldBattleArenaScreen / WorldBattlePickerScreen / WorldDungeonExplorerScreen / WorldAssetListingScreen / ReconstructionProgressScreen
   - PetCreatorScreen(从 HomeStack/PetStack 移过来)
   - CameraScanScreen(从 PetStack 移过来)
   - 新建 WorldRoot(WorldHubScreen)
8. THE 以下 screen SHALL **保留在 PetStack** 但 PetStack 不再作为 tab,改为从 Pet_Detail_Sheet 进入的二级深路径:
   - PetCompanionScreen(从 PetHub 移到详情卡的"完整体验"链接)
   - WardrobeScreen / SoulPickerScreen / BreedScreen / PetTeamScreen / NfcRedeemScreen / PetPlaygroundScreen / NftMintScreen
   - SkinMarketplaceScreen 留在 Plaza Tab(不动)
9. THE 以下 screen SHALL **保留在 MeStack 不动**,只新增 CompanionSettings 入口:
   - Profile / Account / Settings / ApiKeys / WalletConnect / WalletSetup / WalletBackup / NotificationCenter / MySkills / MyOrders / SocialListener / LocalAiModel / WearableHub / Subscribe / AxpCenter / AxpRewardShop / ToyBinding / ReferralDashboard / ShareCard / Scan
10. THE 以下 screen SHALL **完全删除**或合并:
    - PetHubScreen(被 World Tab + Pet_Detail_Sheet 替代,该屏完全删)
    - HomeScreen(被删)
    - HomeStackNavigator 整个文件(被删)
    - 6 个隐藏 legacy stack 完全删
    - WalletStackNavigator(隐藏)+ AgentStackNavigator(隐藏)+ DiscoverStackNavigator(隐藏)+ TeamStackNavigator(隐藏)+ TodayStackNavigator(隐藏)+ DrawerNavigator(已废) — 全部完全删

**新建 navigator 清单**

11. THE 新建以下 navigator + screen:
    - `src/navigation/WorldStackNavigator.tsx`(新)
    - `src/screens/world/WorldHubScreen.tsx`(新,WorldRoot 主屏)
    - `src/components/companion/PetDetailSheet.tsx`(新,长按浮球展开的 BottomSheet)
    - `src/components/companion/ConversationBubble.tsx`(新,单击浮球展开的对话气泡)
    - `src/components/companion/Trust3SigningSheet.tsx`(新,签名底片)
    - `src/components/companion/SkillInstallCard.tsx`(新,skill 安装卡片 BottomSheet,从现有 SkillInstallScreen 改造)
    - `src/components/companion/ApprovalAlertCapsule.tsx`(新)
    - `src/components/companion/WalletCapsule.tsx`(新)
    - `src/services/systemAssistantBridge.ts`(新,反向调用)
    - `src/services/agenticCommerce.service.ts`(新,自主交易限额校验)
    - `src/services/companionLayout.service.ts`(新,跨 tab 浮球位置 + 状态共享)
    - `src/screens/me/CompanionSettingsScreen.tsx`(新)

**依赖新增**

12. THE 项目 SHALL 新增以下 npm 依赖:
    - `@gorhom/bottom-sheet`(BottomSheet 库,必需)
    - `expo-live-activity` 或 `react-native-live-activity`(iOS Live Activity,二选一)
    - `expo-health` 或自建原生模块(健康数据 read,Phase 1 可选)
    - `expo-calendar`(日历 ongoing event 检测,可选)
    - `expo-battery`(低电量模式检测,Phase 1 必需)

**Deep Link 兼容**

13. THE 现有 `src/navigation/legacyRouteTable.ts` SHALL 扩展支持以下重定向:
    - `agentrix://home/*` → `agentrix://world` 或 `agentrix://me/*`(基于路径)
    - `agentrix://home/pet/companion` → `agentrix://me/pet-detail/<petId>`(进 Pet_Detail_Sheet 二级深路径)
    - `agentrix://pet/*` → `agentrix://me/pet-detail/*`
    - `agentrix://wallet/*` → `agentrix://me/wallet/*`
    - 旧 9 个 system intents deep link 全部保留兼容
14. THE Maestro E2E 测试 SHALL 全部更新:
    - 删除 `.maestro/01-launch.yaml` 中 Home Tab 断言
    - 新增 `.maestro/47-mobile-pet-companion-redesign.yaml` 验证 4 tab + 浮球 + Pet_Detail_Sheet + Trust3_Signing_Sheet + Conversation_Bubble + Voice_Greet + 跨端事件
    - 删除已被弃用的 6 个 legacy tab 相关测试

---

### Requirement 12: 监控、降级与可验证性(收敛版)

**User Story:** 作为产品负责人,我需要能验证整个 redesign **真的在工作**(不是写了代码但没人触发),也能在异常时优雅降级。

**Rationale:** Phase C 之前出过"GlobalFloatingBall 写了但没 mount"的假阳性,本 spec 在 acceptance 阶段就明确埋点和降级。

#### Acceptance Criteria

1. THE 系统 SHALL 通过 `addVoiceDiagnostic(...)` 记录以下事件:
   - `companion-ball-mount { tab }` / `companion-mode-changed { from, to, source }` / `voice-greet-triggered { scenario }`
   - `lock-screen-pet-started` / `mood-diary-push-tapped` / `form-variant-changed { from, to, source }`
   - `trust3-sheet-shown { reason }` / `trust3-signing-completed { reason, success }` / `wallet-capsule-shown { kind }`
   - `pet-detail-sheet-opened` / `pet-detail-card-expanded { card }` / `active-pet-switched { from, to }`
   - `conversation-bubble-opened { source }` / `conversation-bubble-routing { local/cloud }`
   - `world-engine-shortcut { action }` / `skill-install-card-shown { skillId }`
   - `approval-alert-shown { approvalId }` / `remote-control-sent { target, command }`
   - `system-assistant-intent-resolved { name, source }` / `system-assistant-reverse { kind }`
   - `agentic-commerce-executed { kind, amount }` / `agentic-commerce-blocked { reason }`
   - `cross-device-sprite-sync { sourceDevice, eventType }`
2. WHEN 浮球在 World / Plaza / Me 任一 tab 中**未 mount 超过 3 秒**, THE 系统 SHALL 写一条 `companion-ball-missing { tab }` 警告。
3. THE Maestro E2E SHALL 新增 `.maestro/47-mobile-pet-companion-redesign.yaml`,验证以下路径(全部基于真实 testID):
   - 启动 App → World Tab(默认)→ 浮球可见 + WorldRoot banner + 主 CTA grid
   - 切到 Plaza → 浮球仍可见
   - 切到 Summon → 浮球**隐藏**
   - 切到 Me → 浮球可见 + Companion_Settings 入口可达
   - 单击浮球 → Conversation_Bubble 弹出 + 路由标识可见
   - 长按浮球 → Pet_Detail_Sheet 弹出 + 9 个 section 可见 + 切宠物可用
   - 模拟 `presence:pet.proactive missed_you` → 切到 `whisper`
   - 模拟 push `presence:approval` → 浮球切到 `nudge` + 灵动岛显示 approval 计数
   - 模拟 push `presence:wallet.delta` → Wallet_Capsule 显示
   - 测试 5 个新 intents 中至少 1 个(`start_world_scan`)端到端
4. WHEN expo-live-activity / expo-health / expo-calendar 等可选模块**未安装**, THE 系统 SHALL 优雅降级:Lock_Screen_Pet 整体不启用 / journey 自动检测降级为关闭 / 日历自动 work 模式降级为关闭。Companion_Settings 显示"该功能需要 X 模块"。
5. WHEN 后端 `/v1/pet/state` 调用连续失败 ≥ 3 次, THE Companion_Mode SHALL 进入 `vigil`(守候)而**不**进入 idle 假装一切正常。
6. WHEN socket 断开, THE 浮球 SHALL **不**强制切到 idle,保持上一已知 mode 直到 socket 恢复。
7. THE 单测 SHALL 覆盖以下纯逻辑函数(行覆盖率 ≥ 80%):
   - Companion_Mode 转换矩阵
   - Form_Variant 自动检测优先级
   - Voice_Greet 频次限流
   - Lock_Screen_Pet 状态文字映射
   - Trust3_Signing_Sheet 超时逻辑
   - Cross_Device_Token 生成与校验
   - System_Assistant_Bridge intent dispatch
   - Agentic_Commerce 限额校验
   - mapEmotionToMode(已 shipped 但需扩展新事件)
8. THE 性能基线 SHALL 满足:
   - Companion_Ball 60 fps 渲染(Pixel 5 / iPhone 12)
   - Companion_Mode 切换 P95 ≤ 50 ms
   - Voice_Greet 触发到 TTS 开始 P95 ≤ 1.5 秒
   - Lock_Screen_Pet 推送到锁屏更新 P95 ≤ 30 秒
   - Trust3_Signing_Sheet 弹出 P95 ≤ 200 ms
   - Wallet_Capsule 显示到消散完整动画 ≤ 3.2 秒
   - Pet_Detail_Sheet 弹出 P95 ≤ 250 ms
   - Conversation_Bubble 弹出到首字 streaming P95:云端 ≤ 2 秒 / 本地 ≤ 5 秒(文本)/ 本地 ≤ 90 秒(多模态)
9. WHEN A/B 实验开启, THE 系统 SHALL 支持把"陪伴系统 redesign"作为 feature flag(`pet_companion_redesign_enabled`)整体开关,关闭时回退到 P-8 v0.4.7 基线行为(虽然回退路径已大改,但保留只是为紧急事件用)。
10. THE 上线前验收 SHALL 在生产环境完成手动 checklist:
    - 4 tab 启动默认 = World 验证
    - 浮球 World/Plaza/Me 可见 + Summon 隐藏
    - 长按 Pet_Detail_Sheet 9 section 全部可达
    - 单击 Conversation_Bubble + 拍照流程 + 本地路由切换
    - manual Voice_Greet 在静音/勿扰/`night` 各场景下符合预期
    - Lock_Screen_Pet iOS 锁屏可见 + 灵动岛 CTA + Android Material You widget
    - Mood_Diary_Push 真实推送一条
    - Companion_Settings 切换 Form_Variant 立即生效
    - Trust3_Signing_Sheet 完整签名一次 USDC 转账
    - 远程控制成功触发桌面 Computer Use task
    - 至少一个 system intent (Siri / Gemini / 小爱) 端到端 resolve
    - 至少一笔 Agentic Commerce 自主交易触发推送
    - feature flag 关闭后回退到基线
    - 老用户从 Home Tab 老 deep link 自动重定向

---

## Open Questions(进入 design 阶段前需对齐)

1. **Voice_Greet 文案池来源**:复用 `pet-diary` 的 LLM 链路 ✅(默认),还是单独 prompt?
2. **iOS Live Activity 实施方式**:社区 `expo-live-activity` ✅(默认),还是自建 Swift Extension?
3. **Themed Icons 资源**:Phase 1 用 default sprite 兜底 ✅(默认),Phase 2 由 PET_SPRITE_DOUBAO_BRIEF 二轮交付?
4. **Form_Variant 锁定 4 小时是否够长**?(默认 4h)
5. **Trust3_Signing_Sheet 是否需要硬件 anti-tamper 检测**(越狱/Root)?(默认复用现有 mpc-wallet attestation)
6. **5 个新 intents 优先级**:是否全 5 个 Phase 1 落地?(默认全 5 个,实际可分子任务交付)
7. **Skill 安装权限可视化 UI 模式**:参考 iOS App Tracking Transparency 风格?(默认是,留 design 阶段决定)
8. **国内厂商唤醒词本地适配**:中文版默认改"小顿"还是保持"嘿 Aira"?(默认"嘿 Aira",Companion_Settings 可自定义)
9. **Plaza 25 屏拆解**:Phase 1 不动 ✅,Phase 2 评估?
10. **Agentic Commerce 类目白名单**:Phase 1 是否包括"宠物自己接 task market 任务收 USDC"?(默认包括,因为这是收入,无支出风险)
11. **Pet_Detail_Sheet 顶部 Hero 在多宠物切换时**:动画过渡是 800ms 渐变(默认)还是滑动 carousel?
12. **Conversation_Bubble 跨 session 历史**:用户从 Bubble 进 Summon 后再回 Bubble,是否保留 Bubble 上次 session?(默认是,保留连续性)

---

## Out of Scope(明确不做)

**陪伴层**
- ❌ AR 把宠物放进相机里(Phase 2)
- ❌ Wear-OS / Apple Watch 端宠物形态(Phase 2,sprint W-4 后)
- ❌ 跨用户陪伴社交(visit / 串门 / 礼物 / 联机副本,Phase 3)
- ❌ 宠物自由对话(超出 Voice_Greet 之外的开放对话, Phase 3)
- ❌ 复杂运动识别(跑步 / 骑行 / 游泳 区分,Phase 2)
- ❌ 心率 / 睡眠 / 健康日记(隐私敏感,Phase 2 等 GDPR / PIPL 合规审查)
- ❌ 宠物 vs 宠物 PvP(World Engine 已有 Battle Arena,陪伴体不参与)

**系统层 / 工程层**
- ❌ Pro Mode / Computer Use 在移动端(桌面端独占)
- ❌ 完整漫游 wander 引擎(屏幕太小)
- ❌ iOS 系统级跨 app 浮球(沙箱不允许)
- ❌ 重写 PetCompanionScreen / AgentChatScreen / WorldEngineScannerScreen 等已 shipped 屏幕
- ❌ 重做后端 emotion / proactive(已 shipped)
- ❌ 新建 MPC wallet / payment / approval / mpc-wallet 后端模块(已 shipped)
- ❌ 自研系统助手 SDK(Apple Intents / Google App Actions / 小爱 SkillKit 已够用)
- ❌ 国内厂商 P2-P3 落地(小艺 / 小米 / 小布 / Jovi 实际审核与 SDK 接入是 Phase 2)
- ❌ Apple Intelligence / Gemini Extension 申请(Phase 2,P1 后)
- ❌ Plaza 25 屏拆解(Phase 2 评估)

**经济 / 安全层**
- ❌ Skill 卸载后退款机制 — Phase 1 按"已购买不退款",Phase 2 评估
- ❌ Cross_Device_Token 多签场景(单签足够 Phase 1)
- ❌ Marketplace 二级市场卖出流程在浮球完成(Phase 1 仅做购买/Trust 3 签名,卖出仍走 ListingScreen)
- ❌ 高风险动作的 hardware key (YubiKey / Titan) 接入(Phase 2,如需企业版)
- ❌ 微信支付 / 支付宝 SDK 国内特殊路径(Phase 1 维持现有 Stripe + AXP + USDC)
- ❌ Agentic Commerce LLM 真自主决策(Phase 2,Phase 1 只做框架)

**用户实验 / 视觉**
- ❌ 多语言文案 LLM 现场翻译(Phase 1 维持中英双语)
- ❌ 个性化语音音色训练(Phase 1 用平台 TTS 默认音色)
- ❌ 用户自定义浮球皮肤(Wardrobe 已有,但 Phase 1 不在浮球启用 — 浮球永远用 default sprite)
- ❌ App icon(商店提交版)= 宠物 sprite(Phase 2 提交审核)
