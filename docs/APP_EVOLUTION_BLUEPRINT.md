请# Agentrix (ClawLink) 移动端终极演进蓝图：从坚实底座到全能形态

## 核心演进策略
**“基础先行，模块化验证，最终升维交互”**
没有扎实的基础模块支持，再酷炫的交互形态（如全局悬浮、语音唤醒）也只是空中楼阁。因此，移动端的整体演进将严格遵循**模块化优化**的节奏：
`Marketplace (交易与分发) -> Agent (智能体操控) -> Social (社交与社区) -> 交互升维 (悬浮/语音/自动化)`。
**每个阶段优化完毕后，必须提交独立 Build (如 Build 52, 53, 54) 进行真实环境验证，确认底盘稳固后再开启下一阶段。**

---

## 阶段一：Marketplace (集市与交易模块) 优化【目标：Build 52 / 当前进行中】
**定位**：统一 Web 与 App 端大集市，打通发现、购买、分佣、裂变的商业闭环。

1. **资源与技能聚合 (✅ 已完成)**
   - 整合 OpenClaw 5200+ 技能与 Compute 资源。
   - 全面对接后端 `/unified-marketplace/search`，修复分类、搜索与过滤（仅展示含真实价格的资产）。
2. **分享与裂变传播 (✅ 已完成)**
   - 优化 `ShareCardView`，在移动端生成精美带二维码的分享海报。
   - 详情页接入分享功能，并自动拼接专属的 Referral Code (`?ref=userId`)。
3. **支付与结算链路 (✅ 已完成)**
   - 完全重建 `CheckoutScreen`，对齐 Web 端 `agentrix.top/pay/checkout` 设计：
     - CRYPTO: ⚡ QuickPay (MPC 钱包自动检测) / 💳 Wallet Pay (WalletConnect 深链) / 📱 Scan to Pay (二维码 + pay-intents 轮询)
     - FIAT: Stripe 可折叠面板，支持 Credit / Debit card
     - BSC TESTNET badge（`__DEV__` 感知）
   - 对接 `/unified-marketplace/purchase`（`paymentMethod: quick_pay | walletconnect | scan | stripe`）。
4. **Task Market (任务大厅) 闭环 (✅ 已完成)**
   - 移动端实现任务悬赏大厅 (`TaskMarketScreen`) 的发单与接单展现。
   - 补齐 Developer (开发者) 身份的移动端状态管理。
5. **分佣结算看板 (Commission Dashboard) (✅ 已完成)**
   - 在个人中心 (`MeStack`) 补充佣金与邀请奖励的可视化看板 (`ReferralDashboardScreen` 和 `PromoteScreen`)。
   - 修复了所有 TypeScript 类型错误和 UI 渲染问题。

---

## 阶段二：Agent (智能体操控与状态模块) 优化【目标：Build 53 / 核心功能已完成】
**定位**：建立移动端与云端/本地 Agent 的极速、稳定连接，完善移动端的控制台体验，并大幅提升执行透明度与反馈闭环。

1. **核心通信层重构 (✅ 已完成)**
   - 彻底废弃 HTTP 轮询聊天模式，全面转为全双工 **WebSocket / Server-Sent Events (SSE)** (`realtime.service.ts` 中的 `streamProxyChatSSE`)。
   - 实现**流式对话 (Streaming Response)**，Agent 的回复与思维链 (Thought) 逐字输出，消灭等待空白期。
   - 实现直接与后端 Bedrock (Claude) 的 fallback 流式连接 (`streamDirectClaude`)。

2. **执行透明度与视觉化信任 (✅ 已完成)**
   - **微缩执行轨迹**：在对话框中增加微缩的“执行轨迹”（如 `[Tool Call]`, `Thinking...`），实现类似 Manus 级别的“实时心智可视化” (`AgentChatScreen` 中的 `Thought Chain UI`)。
   - 移动端解析并渲染 Agent 的执行轨迹 (Trajectory)，可视化展示当前执行节点。

3. **连接与呈现优化 (无认证扫码登录) (✅ 已完成)**
   - **扫码连接**：引入类似 WhatsApp Web 或 Telegram Login API 的扫码机制。前端展示由后端生成的 Connection QR，用户扫码后后端持久化 Session (`SocialBindScreen` 中的 `generateTelegramQr`)。

4. **记忆库 (Memory) 管理面板 (✅ 已完成)**
   - 在移动端增加 Memory 控制台 (`MemoryManagementScreen`)，允许用户随时查看、修改、删除 Agent 对自己的长期记忆（Knowledge files）与短期偏好（Preferences）。

5. **端侧基础能力打通 (Device Bridging) (✅ 已完成)**
   - 封装 Expo 基础插件，赋予 Agent 请求获取移动端 GPS、读取剪贴板、访问相册的基础能力 (`DeviceBridgingService`)，为后续多模态和自动化做铺垫。

---

## 阶段三：Social (社交与社区生态模块) 优化【目标：Build 54 / ✅ 代码层已完成，待上线验证】
**定位**：打造"人机混编"的智能体网络，通过社区内容反哺 Marketplace 的活跃与交易，并建立强大的社交反馈回路。

1. **社交媒体反馈回路 (双向闭环) (✅ 后端已完成，待配置 env)**
   - 新增 `backend/src/modules/social/social-callback.controller.ts`，实现 Twitter/X、Telegram、Discord 三平台 Webhook 接收与签名验证。
   - 收到 mention/DM 后提取文本，路由至 Agent 执行队列，注入 System Message（如"用户 A 在 Twitter 上 @ 了你，是否自动回复？"）。
   - ⚠️ 上线需配置环境变量：`TWITTER_CONSUMER_SECRET`、`TELEGRAM_BOT_TOKEN`、`DISCORD_PUBLIC_KEY`。

2. **人机混编群聊 (Agent Social) (✅ 已完成)**
   - `GroupChatScreen` 支持消息内 `@AgentName` 调用，解析 mention → 调用 `/claude/chat`（已修正，原误用已删除的 `/hq/chat`）。
   - Agent 回复以"打字气泡"过渡后注入群消息流，视觉上区分人类消息与 Agent 消息。

3. **Community Feed 一键复刻 (Fork & Install) (✅ 已完成)**
   - `FeedScreen` Post 类型扩展 `skillId / skillName` 字段。
   - 带技能标签的帖子显示 ⚡ Install 按钮，点击弹窗确认后跳转 `Market/Checkout` 完成一键安装。

4. **系统级消息推送 (Push Notifications) (✅ 框架已完成，待生产证书)**
   - Expo Push Notifications 框架完整：`notifications.ts` 中 EAS `projectId` 已从占位符替换为真实值 `96a641e0-ce03-45ff-9de7-2cd89c488236`。
   - Token 注册逻辑 (`registerTokenWithBackend`) 存在，可将 Expo Push Token 上报后端。
   - `expo-notifications` 插件已在 `app.json` 配置。
   - ⚠️ 生产推送需在 EAS 配置 FCM Service Account（Android）和 APNs 证书（iOS）后方可正式下发。

---

## 阶段四：终极交互形态升级 (HeyLemon / Manus 级别)【目标：Build 55+ / 骨架已就绪，待深度实现】
**定位**：在底座极其稳固的基础上，打破 App 壳限制，使 Agentrix 成为操作系统级的伴生助手。

1. **全局悬浮唤醒 (Floating Window / Live Activities) (⚠️ 框架就绪，待原生扩展)**
   - `FloatingChatButton.tsx` 已实现：可拖拽悬浮球 + QuickChatSheet（调用 `/claude/chat`）+ 长按进入 VoiceChatScreen。
   - 当前限于 App 内悬浮（`position: absolute`）；跨 App 系统级悬浮需 Android SYSTEM_ALERT_WINDOW 原生模块或 iOS Live Activities 扩展（Build 55 目标）。
2. **全天候流式语音 (Voice-to-Voice) (⚠️ 骨架就绪，待 VAD 与真实 ASR 接入)**
   - `VoiceChatScreen.tsx` 已实现：expo-av 录音 → 后端 `/api/voice/transcribe` (Whisper) → `/claude/chat` → expo-speech TTS 回读。
   - 当前录音策略为"按住说话"；待接入 VAD（语音端点检测）实现连续对话。
3. **跨应用设备协同 (App Automation) (❌ 未开始)**
   - 待 Build 55+ 实现 Android Accessibility Service 原生模块。
   - 结合多模态（截屏识别），Agent 可理解当前屏幕 UI 树，并模拟点击，跨应用为用户执行发微信、点外卖等深度操作。
