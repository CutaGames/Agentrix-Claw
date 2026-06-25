# Agentrix 移动端用户路径 E2E 测试文档

> 版本：v1.0 · 2026-05-11
> 目的：覆盖所有核心功能的完整用户路径，确保每个功能闭环可用
> 上游：[MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05](MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md)

---

## 测试层级

| 层 | 工具 | 覆盖 | 本文档 |
|---|------|------|:---:|
| L1 单元 | Jest | 常量/路由/计算 | ❌ |
| L2 API | Node.js | 后端端点可达 | ✅ |
| L3 UI | Maestro | 自动化 UI 流 | ✅ |
| **L4 用户路径** | **手工 + 本文档** | **完整闭环** | ✅ |

---

## 用户路径清单（20 条）

### Journey 1 · 新用户注册 → 首次进入

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | 打开 App | 看到登录页（Agentrix Claw logo + Google/Wallet 按钮）| 无崩溃 |
| 2 | 点 Google 登录 | 跳转 OAuth → 回调 → 进入主界面 | token 写入 SecureStore |
| 3 | 首次进入 Home Tab | 看到 4 Tab（家/召唤/集市/我）| Tab 可切换 |
| 4 | Home 显示主宠 | 🐾 占位 + Lv.1 + calm + XP 0/100 | 无空白 |
| 5 | 签到卡片可见 | "领取 +20 AXP" 按钮 | 非 loading 态 |

### Journey 2 · 每日签到 → AXP 到账

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Home Tab 看到签到卡片 | "Claim +20 AXP" 可点 | can_checkin_today=true |
| 2 | 点击领取 | 顶部飘出 "+20 AXP ☀️ 每日签到" pill | AxpToast 出现 |
| 3 | 卡片变为"今日已领" | 按钮灰色 | can_checkin_today=false |
| 4 | 进 Me → AXP Center | 余额 +20 | history 有 daily_checkin 记录 |
| 5 | 第二天重复 | 显示"连续 2 天 · 基础 20 + 连击 5" | streak=2 |

### Journey 3 · 拍照生成 3D 萌宠

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Home 点"✨ 拍照生成专属萌宠" | 进入 PetCreatorScreen | 无崩溃 |
| 2 | 选"图片 → 3D"模式 | 显示参考图 URL 输入框 | tab 切换正常 |
| 3 | 填入图片 URL + 点"🚀 开始生成" | 5 阶段进度条出现（排队 → 上传 → 建模 → 纹理 → 完成）| stepper 可见 |
| 4 | 等待 30-90 秒 | 进度条推进 | 状态文字更新 |
| 5 | 生成完成 | 飘出 "+50 AXP ✨ 萌宠生成完成" | toast + 引导文案 |
| 6 | 看到"设为我的萌宠"引导 | 3 个选项可见 | 无空白 |

### Journey 4 · 宠物模仿秀参赛

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Plaza → Play 段 | 看到"📸 宠物模仿秀"卡片 | 排在第一位 |
| 2 | 点"参赛" | 进入 PhotoMimicSeasonScreen | 赛季标题 + 奖金池 |
| 3 | 点"📸 参赛"按钮 | 弹出提交 Modal | 输入框可见 |
| 4 | 填入图片 URL + 点提交 | 飘出 "+30 AXP 📸 参赛奖励" | toast + modal 关闭 |
| 5 | 榜单刷新 | 我的作品出现在列表 | vote_count=0 |

### Journey 5 · 宠物模仿秀投票

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | 在榜单看到别人的作品 | 有"投票"按钮 | 非自己的作品 |
| 2 | 点"投票" | 飘出"🗳 已投票 · 今日剩 2 票" | daily_votes_remaining=2 |
| 3 | 再投第 2 个 | 剩 1 票 | |
| 4 | 再投第 3 个 | 剩 0 票 | |
| 5 | 尝试第 4 次 | 报错"daily vote limit reached" | 400 |

### Journey 6 · 共养邀请 → 好友喂养

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Home 点"🌱 邀请朋友一起养宠" | 进入 CoRaisingInviteScreen | 表单可见 |
| 2 | 点"生成邀请链接" | 列表出现新邀请（token + active） | share_url 可复制 |
| 3 | 点"📤 分享" | 系统分享面板弹出 | Share API 调用 |
| 4 | 好友打开链接 | 落地页显示宠物信息 + "🌱 喂养"按钮 | peekInvite 200 |
| 5 | 好友点喂养 | 弹窗"+2 能量 +5 AXP" | feed 成功 |
| 6 | 回到 Home | "🌱 X 位朋友帮 Alfred 喂养" 更新 | 数据刷新 |

### Journey 7 · 贺卡发送 → 收件

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Home 点"🎁 给朋友发张宠物贺卡" | 进入 GreetingCardCompose | 模板列表 |
| 2 | 选一个免费模板（Cheer） | 预览可见 | |
| 3 | 填收件人 + 文案 + 发送 | 成功提示 | |
| 4 | 收件人进 Plaza → Play → 贺卡收件 | 看到新贺卡 | inbox 有记录 |

### Journey 8 · 订阅页浏览 + AXP 抵扣

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Me Tab → 点"升级" | 进入 SubscribePlanScreen | 5 档可见 |
| 2 | 切换 Monthly / Yearly | 价格变化 | Plus $14.99 / $149 |
| 3 | 选一个付费档 | 卡片高亮 | |
| 4 | 下方"💎 Use AXP to save"区域 | 显示余额 + slider | |
| 5 | 拖动 slider | "Apply N AXP = save $X" 实时更新 | max 20% |
| 6 | 余额为 0 时 | 显示"通过签到/聊天/共养获取 AXP" | disabled 态 |

### Journey 9 · 召唤 Tab 对话

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | 点召唤 Tab | 进入 AgentChatScreen | 输入框可见 |
| 2 | 发一条消息 | 主宠回复 | 流式输出 |
| 3 | 连续对话 10 轮 | 应触发 chat_active AXP（后端） | 后端 earn 记录 |
| 4 | 无悬浮麦克风球遮挡 | 屏幕干净 | VoiceQuickFab 已删 |

### Journey 10 · Plaza 5 段切换

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | 点集市 Tab | 默认 Feed 段 | 5 个 segment 可见 |
| 2 | 切到 Skills | 技能市场卡片 | 无崩溃 |
| 3 | 切到 Tasks | 任务市场卡片 | |
| 4 | 切到 Pets | 皮肤拍卖 + 宠物拍卖 + 玩偶 | |
| 5 | 切到 Play | 模仿秀 + 预测 + 共养 + 贺卡 | 4 张卡片 |

### Journey 11 · Me Tab 配额可视化

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | 点我 Tab | ProfileScreen | tier badge + AXP glance |
| 2 | 看到 6 个配额网格 | 技能/皮肤/商品/硬件/游戏/公会 | 数字可见 |
| 3 | 点 Devices 折叠 | 展开设备列表 | |
| 4 | 点 Advanced 折叠 | 展开高级区 | beginner 弹 Alert |

### Journey 12 · 深链兼容

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | 打开 `agentrix://agent/chat` | 跳转到召唤 Tab | legacyRouteTable |
| 2 | 打开 `agentrix://pet/companion` | 跳转到 Home → PetCompanion | |
| 3 | 打开 `agentrix://market/skills` | 跳转到 Plaza → Skills | |
| 4 | 打开 `agentrix://wallet/dashboard` | 跳转到 Me → Wallet | |

### Journey 13 · 全局铃铛 + 扫码

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | 任意 Tab 点 🔔 | Inbox modal 弹出 | |
| 2 | 任意 Tab 点 📷 | Scan modal 弹出 | |
| 3 | 关闭 modal | 回到原 Tab | |

### Journey 14 · 宠物抽屉 10 入口

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Home 滚动到"主宠"区域 | 10 个 tile 可见 | |
| 2 | 点"技能栏" | 进入 PetSkills | back 回 Home |
| 3 | 点"钱包" | 进入 PetWallet | |
| 4 | 点"创生" | 进入 PetCreator | |
| 5 | 点"玩乐" | 进入 PetPlay | |

### Journey 15 · 皮肤拍卖浏览

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Plaza → Pets → 皮肤拍卖 | SkinAuctionScreen | 2 列 grid |
| 2 | 排序切换（newest/price） | 列表重排 | |
| 3 | 无限滚动 | 加载更多 | |

### Journey 16 · 消息/私信

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Plaza → Feed → 消息 | MessagingScreen | 会话列表 |
| 2 | 点一个会话 | 进入 DirectMessage | 消息可见 |

### Journey 17 · AXP 中心历史

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Me → AXP Center | AxpCenterScreen | 余额 + 历史列表 |
| 2 | 有签到/参赛记录 | 每条显示 source + amount + time | |
| 3 | 空态 | "还没有 AXP 记录" 文案 | |

### Journey 18 · 升级庆祝弹窗

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | 宠物 XP 满升级 | LevelUpModal 弹出 | 🎉 + Lv.old → Lv.new |
| 2 | 看到 AXP 奖励 | "+N AXP" badge | |
| 3 | 点"继续" | modal 关闭 | |
| 4 | 顶部飘出 AXP toast | "+N AXP 🎉 主宠升级" | |

### Journey 19 · 分享海报

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | 长按消息/技能/宠物 → 分享 | PosterShareCard 渲染 | 1080×1920 |
| 2 | 海报包含：logo + 宠物 + Lv + 灵魂 + 统计 + QR + 邀请码 | 所有元素可见 | |
| 3 | 保存/分享 | 系统分享面板 | |

### Journey 20 · 退出登录 → 重新登录

| # | 步骤 | 预期 | 验证点 |
|--:|------|------|--------|
| 1 | Me → 设置 → 退出登录 | 回到登录页 | token 清除 |
| 2 | 重新登录 | 恢复所有数据 | AXP/宠物/邀请 |

---

## API 端点覆盖矩阵

| 端点 | Auth | Journey | 状态 |
|------|:---:|---------|:---:|
| `GET /v1/subscription/catalog` | ❌ | J8 | ✅ 200 |
| `GET /v1/pet/greeting/catalog` | ❌ | J7 | ✅ 200 |
| `GET /v1/games/photo-mimic/seasons/current` | ❌ | J4 | ✅ 200 |
| `GET /v1/games/photo-mimic/seasons/:id/leaderboard` | ❌ | J4/J5 | ✅ 200 |
| `POST /v1/games/photo-mimic/entries` | ✅ | J4 | 待测 |
| `POST /v1/games/photo-mimic/votes` | ✅ | J5 | 待测 |
| `GET /v1/games/photo-mimic/votes/mine/today` | ✅ | J5 | 待测 |
| `GET /v1/axp/balance` | ✅ | J2/J8 | 待测 |
| `GET /v1/axp/checkin/status` | ✅ | J2 | ✅ 401(guard) |
| `POST /v1/axp/checkin` | ✅ | J2 | 待测 |
| `GET /v1/axp/history` | ✅ | J17 | 待测 |
| `POST /v1/pet/coraising/invites` | ✅ | J6 | 待测 |
| `GET /v1/pet/coraising/invites/by-token/:token` | ❌ | J6 | 待测 |
| `POST /v1/pet/coraising/feed` | ✅ | J6 | 待测 |
| `GET /v1/subscription` | ✅ | J8/J11 | 待测 |
| `GET /v1/me/quota` | ✅ | J11 | 待测 |

---

## 已发现问题清单（Live 更新）

| # | 问题 | 严重度 | Journey | 状态 |
|---|------|:---:|---------|------|
| 1 | ~~悬浮麦克风球遮挡所有页面~~ | 🔴 | J9/J10 | ✅ P0 已删 |
| 2 | ~~签到入口不存在~~ | 🔴 | J2 | ✅ P0 已加 |
| 3 | ~~PetCreator 无进度反馈~~ | 🔴 | J3 | ✅ P0 5阶段stepper |
| 4 | ~~PetCreator 入口藏太深~~ | 🟡 | J3 | ✅ P0 Home CTA |
| 5 | ~~共养屏无画面~~ | 🟡 | J6 | ✅ P1 确认已有完整空态 |
| 6 | ~~分享不是精美海报~~ | 🟡 | J19 | ✅ P1 PosterShareCard |
| 7 | Plaza Play 段 segmented 在窄屏可能覆盖 topbar | 🟡 | J10 | 待真机验证 |
| 8 | 共养 feed 后 Home AXP glance 需手动下拉刷新 | 🟡 | J6 | 待真机验证 |
| 9 | 对话 10 轮 AXP 触发未接入前端（后端 source 存在但无调用方） | 🟡 | J9 | 待做 |
| 10 | Stripe checkout 未接入（点升级无实际支付流程） | 🟡 | J8 | 延后 |
| 11 | 宠物升级触发条件未接入（LevelUpModal 组件就绪但无调用方） | 🟡 | J18 | 待做 |
| 12 | PosterShareCard 未接入 react-native-view-shot 截图保存 | 🟡 | J19 | 待做 |
| 13 | Photo Mimic 提交用 URL 而非相机/相册（MVP 限制） | 🟢 | J4 | Phase 2 加 ImagePicker |
| 14 | 赛季自动状态转换（submitting→voting→settled）无 cron | 🟢 | J4/J5 | 手动 admin settle |

---

## 测试执行方式

### L2 API（自动）

```bash
# 公开端点
node scripts/test/mobile-api-smoke.mjs

# 全部（需 JWT）
AGENTRIX_TOKEN=<jwt> node scripts/test/mobile-api-smoke.mjs
```

### L3 Maestro（自动，需设备）

```bash
bash scripts/test/run-mobile-e2e.sh
```

### L4 用户路径（手工）

1. 安装最新 APK（从 Claw Actions artifact 下载）
2. 按 Journey 1-20 逐条走
3. 每条记录 PASS/FAIL + 截图
4. 发现问题登记到上方"已发现问题清单"

---

## 回归门禁（上线前必过）

- [ ] L2: 所有公开端点 200
- [ ] L3: Maestro 10-15 全绿
- [ ] L4: Journey 1-10 全 PASS（核心路径）
- [ ] L4: Journey 11-20 全 PASS（辅助路径）
- [ ] 无 🔴 严重度问题未修
- [ ] 所有 🟡 问题有明确 owner + 排期

---

*Agentrix Mobile QA · 2026-05-11*
