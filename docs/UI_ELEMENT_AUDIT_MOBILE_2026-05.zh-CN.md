# 移动端完整 UI 元素审计

> **审计日期**：2026-05-12
> **范围**：`src/screens/` + `src/components/` 全部 40+ 屏幕，180+ 可交互元素
> **目的**：为 Maestro E2E 测试提供完整的测试项清单

---

## 总览

| 类别 | 数量 |
|------|:----:|
| Tab 页面 | 4 |
| Home 抽屉入口 | 10 |
| Plaza 5 段 | 5 |
| Me 子页面 | 8+ |
| 全局组件 | 5+ |
| 弹窗/Modal | 6+ |
| 表单交互 | 15+ |
| Deep Link 路由 | 8+ |
| **总计可交互元素** | **~180+** |

---

## 1. 底部 Tab 导航（4 Tab）

| ID | Tab | 图标 | 目标屏 | 测试验证 |
|----|-----|------|--------|---------|
| MT-1 | Home | 🏠 | HomeScreen | 主宠渲染 + 抽屉网格 |
| MT-2 | Summon | 🔮 | AgentChatScreen | 输入框 + 发送 |
| MT-3 | Plaza | 🎪 | PlazaScreen | 5 段 Segmented |
| MT-4 | Me | 👤 | ProfileScreen | 个人信息 + 订阅 |

---

## 2. Home Tab（10 抽屉入口 + 全局按钮）

### 2.1 顶部全局按钮

| ID | 元素 | 功能 | 测试验证 |
|----|------|------|---------|
| MH-1 | 🔔 铃铛 | 全局 Inbox | InboxScreen 打开 |
| MH-2 | 📷 扫码 | 全局扫码 | GlobalScanScreen 打开 |
| MH-3 | 宠物切换器 | 切换主宠 | 下拉列表 |

### 2.2 主宠区域

| ID | 元素 | 功能 | 测试验证 |
|----|------|------|---------|
| MH-4 | 宠物 3D 渲染 | 显示主宠 | 非空白 |
| MH-5 | XP 进度条 | 经验值 | 百分比显示 |
| MH-6 | 情绪指示 | 当前情绪 | emoji 显示 |
| MH-7 | 签到卡片 | 每日签到 | 点击后 +AXP |
| MH-8 | 召唤 CTA | 跳转 Summon | Tab 切换 |

### 2.3 10 入口抽屉

| ID | 入口 | 目标屏 | testID | 测试验证 |
|----|------|--------|--------|---------|
| MD-1 | 🎒 技能 | AgentToolsScreen | drawer-skills | 非空白 |
| MD-2 | 💼 接单 | AgentToolsScreen | drawer-jobs | 非空白 |
| MD-3 | 💰 钱包 | AgentAccountScreen | drawer-wallet | 余额显示 |
| MD-4 | 🧠 记忆 | MemoryManagementScreen | drawer-memory | 非空白 |
| MD-5 | 🎮 玩乐 | PetPlaygroundScreen | drawer-play | 非空白 |
| MD-6 | 👕 衣柜 | WardrobeScreen | drawer-wardrobe | 皮肤列表 |
| MD-7 | 💫 灵魂 | SoulPickerScreen | drawer-soul | 6 族群 |
| MD-8 | 🧬 繁育 | BreedScreen | drawer-breed | 父系选择 |
| MD-9 | 🆔 身份 | AgentPermissionsScreen | drawer-identity | 非空白 |
| MD-10 | ✨ 创生 | PetCreatorScreen | drawer-create | 输入框 |

---

## 3. Summon Tab（聊天交互）

| ID | 元素 | 类型 | 功能 | 测试验证 |
|----|------|------|------|---------|
| MS-1 | 文本输入框 | TextInput | 输入消息 | 可输入 |
| MS-2 | 发送按钮 | Button | 发送消息 | AI 回复 |
| MS-3 | 🎤 语音按钮 | Button | 语音输入 | 录音状态 |
| MS-4 | 📎 附件按钮 | Button | 附件选择 | 选择器弹出 |
| MS-5 | 多宠 Tab | TabBar | 切换宠物会话 | Tab 切换 |
| MS-6 | LLM 预算条 | ProgressBar | 用量显示 | 百分比 + 金额 |
| MS-7 | 超额弹窗 | Modal | AXP 抵扣/升级/BYOK | 三选一 |
| MS-8 | 消息气泡 | FlatList | 对话历史 | 滚动正常 |
| MS-9 | 停止生成 | Button | 中断 AI | 生成停止 |
| MS-10 | 重新生成 | Button | 重新回复 | 新回复 |

---

## 4. Plaza Tab（5 段）

### 4.1 Segmented 控制

| ID | 段 | 目标 | 测试验证 |
|----|-----|------|---------|
| MP-1 | Feed | FeedScreen | 帖子列表 + 滚动 |
| MP-2 | Skills | ClawMarketplaceScreen | 技能卡片 |
| MP-3 | Tasks | TaskMarketScreen | 任务卡片 |
| MP-4 | Pets | SkinAuctionScreen + PetAuctionScreen | 拍卖列表 |
| MP-5 | Play | PlayPreview | 4 个子入口 |

### 4.2 Play 子入口

| ID | 入口 | 目标屏 | 测试验证 |
|----|------|--------|---------|
| MPL-1 | 📸 模仿秀 | PhotoMimicSeasonScreen | 赛季页面 |
| MPL-2 | 🔮 预测 | PredictScreen | 预测页面 |
| MPL-3 | 🌱 共养 | CoRaisingInviteScreen | 邀请页面 |
| MPL-4 | 🎁 贺卡 | GreetingCardInboxScreen | 收件箱 |

---

## 5. Me Tab

| ID | 入口 | 目标屏 | 测试验证 |
|----|------|--------|---------|
| MM-1 | 个人信息 | ProfileEditScreen | 可编辑 |
| MM-2 | 订阅 | SubscribePlanScreen | 5 档显示 |
| MM-3 | AXP 中心 | AxpCenterScreen | 余额 + 流水 |
| MM-4 | AXP 兑换 | AxpRewardShopScreen | 兑换品列表 |
| MM-5 | 设备管理 | ToyBindingScreen | 设备列表 |
| MM-6 | 设置 | SettingsScreen | 设置项 |
| MM-7 | 关于 | AboutScreen | 版本信息 |
| MM-8 | 登出 | — | 返回登录页 |

---

## 6. 独立功能屏

| ID | 屏幕 | 入口 | 关键交互 | 测试验证 |
|----|------|------|---------|---------|
| MF-1 | PetCreatorScreen | MD-10 | prompt 输入 + 提交 | 任务创建 |
| MF-2 | WardrobeScreen | MD-6 | 皮肤网格 + 装备 | 装备成功 |
| MF-3 | SoulPickerScreen | MD-7 | 6 族群 Tab + 选择 | 切换成功 |
| MF-4 | BreedScreen | MD-8 | 双亲选择 + A/B 滑块 | 提交成功 |
| MF-5 | NfcRedeemScreen | Home → NFC | NFC 扫描 + 兑换 | 动画播放 |
| MF-6 | CameraScanScreen | PetCreator → 扫描 | 权限 + 拍摄 | 帧上传 |
| MF-7 | NftMintScreen | Home → NFT | 链选择 + 铸造 | 确认弹窗 |
| MF-8 | ToyCustomInquiryScreen | Plaza → 定制 | 6 步表单 | 提交成功 |
| MF-9 | OtaProgressScreen | 设备 → OTA | 进度条 | 完成/错误 |
| MF-10 | PetAuctionScreen | Plaza → Pets | 出价 + 倒计时 | 出价成功 |

---

## 7. 弹窗 / Modal

| ID | Modal | 触发 | 测试验证 |
|----|-------|------|---------|
| MO-1 | CheckinModal | 签到卡片 | AXP +20 toast |
| MO-2 | LlmBudgetExhausted | 预算耗尽 | 三选一显示 |
| MO-3 | SkinPurchaseConfirm | 市场 → 购买 | 确认 + 扣费 |
| MO-4 | BreedConfirm | 繁殖 → 提交 | 确认弹窗 |
| MO-5 | NftMintConfirm | NFT → 铸造 | 链 + 费用确认 |
| MO-6 | LogoutConfirm | Me → 登出 | 确认后登出 |

---

## 8. Deep Link 路由

| ID | URI | 目标屏 | 测试验证 |
|----|-----|--------|---------|
| DL-1 | `agentrix://market/skin/{id}` | 皮肤详情 | 详情加载 |
| DL-2 | `agentrix://co-raising/{token}` | 共养落地 | 预览显示 |
| DL-3 | `agentrix://greeting/{token}` | 贺卡 | 贺卡显示 |
| DL-4 | `agentrix://nfc/{token}` | NFC 兑换 | 兑换流程 |
| DL-5 | `agentrix://toy/activate/{code}` | Toy 配对 | 配对流程 |
| DL-6 | `agentrix://pet/{petId}` | 宠物详情 | 详情加载 |
| DL-7 | `agentrix://bid/{auctionId}` | 拍卖出价 | 出价页面 |
| DL-8 | `agentrix://buy/{resourceId}` | 购买 | 购买确认 |

---

## 9. 推送通知

| ID | 通知类型 | 点击目标 | 测试验证 |
|----|---------|---------|---------|
| PN-1 | 签到提醒 | HomeScreen | 签到卡片高亮 |
| PN-2 | AXP 过期 | AxpCenterScreen | 过期提示 |
| PN-3 | 皮肤售出 | AgentAccountScreen | 收入显示 |
| PN-4 | 共养邀请 | CoRaisingLandingScreen | 邀请详情 |
| PN-5 | 贺卡收到 | GreetingCardInboxScreen | 新贺卡 |
| PN-6 | Toy 互动 | HomeScreen | 情绪变化 |
| PN-7 | 拍卖结束 | PetAuctionScreen | 结果显示 |

---

## 10. 性能指标

| ID | 指标 | 标准 |
|----|------|------|
| MPF-1 | 冷启动到 Home | < 3s |
| MPF-2 | Tab 切换 | < 300ms |
| MPF-3 | 消息发送到回复 | < 5s |
| MPF-4 | 皮肤列表加载 | < 2s |
| MPF-5 | 3D 宠物渲染 | < 3s |
| MPF-6 | Deep Link 跳转 | < 2s |
| MPF-7 | NFC 扫描响应 | < 1s |

---

## 对应 Maestro 测试文件

| 审计区域 | Maestro Flow |
|---------|-------------|
| 4 Tab 导航 | `10-4tab-smoke.yaml` |
| Plaza 5 段 | `11-plaza-5segments.yaml` |
| Home 抽屉 | `12-home-pet-drawer.yaml` |
| Me/Subscribe/AXP | `13-me-subscribe-axp.yaml` |
| 共养/贺卡 | `14-coraising-greeting.yaml` |
| 全局 Inbox | `15-global-inbox-scan.yaml` |
| **V4 新增** | |
| Home 完整 | `20-v4-home-full.yaml` |
| Summon 聊天 | `21-v4-summon-chat.yaml` |
| Plaza 完整 | `22-v4-plaza-full.yaml` |
| Me/AXP/设备 | `23-v4-me-axp-subscribe.yaml` |
| PetCreator/衣柜 | `24-v4-pet-creator-wardrobe.yaml` |
| Inbox/DeepLink | `25-v4-global-inbox-deeplink.yaml` |
| 共养/贺卡 V4 | `26-v4-coraising-greeting.yaml` |
