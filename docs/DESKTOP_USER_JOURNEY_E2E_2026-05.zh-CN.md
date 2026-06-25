# Agentrix 桌面端用户路径 E2E 测试文档

> 版本：v1.0 · 2026-05-11
> 范围：桌面端 D0 + DA + DB + DC + DD + DE 落地后
> 对应：`docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN_2026-05.zh-CN.md`

---

## 用户路径清单（15 条）

### J1 · 首次启动（Pet as Floating Ball）
1. 打开 Agentrix Desktop → 看到宠物形态浮球（**不是紫色抽象球**）
2. 光晕颜色 = idle（紫色柔光）
3. 设置里可切换回"Abstract Ball"（opt-out，默认关）

### J2 · 每日签到
1. 右键浮球 → 菜单第一项 "☀️ 每日签到 Check-in"
2. Modal 弹出，显示连击状态
3. 点击"领取 +N AXP" → 宠物头顶飘 "+N AXP ☀️" 气泡
4. 右下角 💎 AXP 数字即时更新

### J3 · 聊天 10 轮自动奖励
1. 打开 Pro Mode，与主宠连续对话
2. 第 10 轮完成后：宠物头顶飘 "+20 AXP 💬 对话 10 轮奖励"
3. 再聊 10 轮（第 20 轮）再触发一次，直到日上限

### J4 · AXP 历史查看
1. 点击右下角 `💎 12,340` → 右下角弹出 sheet
2. 显示余额 + 累计获得/消耗/过期 + 20 条最近记录
3. 每条有中文 source 标签（☀️ 每日签到 / 💬 对话 / 🌱 共养…）

### J5 · 订阅档位 + 预算 HUD
1. Pro Mode 打开 → 右上角看到档位 badge（FREE/PLUS/PRO/ELITE + 本月预算百分比）
2. 超预算时 % 数字变红
3. 点击 badge → 右侧滑出 5 档目录
4. 月/年切换 · AXP 抵扣 slider (0-20%)
5. 选付费档 + 点"继续到结算" → 系统浏览器打开 Stripe

### J6 · 社交中心（右键 → 📸/🌱/🎁）
1. 右键浮球 → "📸 宠物模仿秀" → 右侧滑出面板，Mimic tab
2. 看到赛季标题 + 奖金池 + 榜单
3. 填图片 URL + caption → 点提交 → 宠物头顶 "+30 AXP 📸"
4. 对他人作品点"投票" → "已投票 · 今日剩 2 票"
5. 切 tab 到 🌱 共养 → 列出我的邀请 + 复制链接
6. 切 tab 到 🎁 贺卡 → 免费/Premium 模板预览

### J7 · Creator Studio Hub（右键 → 🎨）
1. 右键浮球 → "🎨 Creator Studio"
2. 顶部 4 tab：🐾 Pet Creator / 🎬 Video Studio / 👗 Wardrobe / 📸 Photo Mimic
3. 切换 tab 分别打开对应功能
4. 统一的 AXP 奖励提示条："生成完成 · 上架 · 被赞 · 赢赛季都给 AXP"

### J8 · Pet Creator 生成萌宠
1. 从 Creator Studio 进 Pet Creator
2. 选模式（文字/图片）+ provider（Meshy/Hunyuan3D）
3. 填 prompt/URL + 提交
4. 轮询到 completed 后 → toast + 宠物头顶飘字
5. （Phase 2 落地后）可以选 "Desktop" 让本地 sidecar 跑

### J9 · AgentEconomyPanel AXP Tab
1. 打开 Agent Economy Panel（ChatPanel 里的入口）
2. Tab bar 新增第 5 项 "💎 AXP"
3. 看到：AXP 余额 · 订阅档位 + 本月预算条 · 6 格配额网格（主宠/设备/技能/皮肤/商品/游戏）
4. 超预算时显示红色警告

### J10 · 跨端 AXP 同步
1. 在手机端做一次签到
2. 桌面浮球在 < 5s 内冒出 "+20 AXP ☀️ 每日签到" 气泡
3. 右下角 💎 数字同步更新
4. 历史 sheet 刷新后显示这笔记录

### J11 · Pet Companion（wandering）
1. 菜单栏打开 "🐾 Toggle Living Pet" → pet-companion 窗口出现
2. 主宠漫游 + 情绪机工作
3. 这是**独立窗口**（不是浮球），和 PetFloatingBall 共存

### J12 · 全局热键
1. `Cmd/Ctrl+Space` → 紧凑 Living Agent 形态
2. `Cmd/Ctrl+Shift+Space` → Pro Mode
3. `Cmd/Ctrl+K` → Spotlight
4. `Cmd/Ctrl+Shift+A` → 推到说话语音

### J13 · Abstract Ball Opt-Out
1. Settings → Living Pet → Floating Entry Style → 选 "🟣 Abstract Ball"
2. 立即切换回紫色球（无需重启）
3. 所有功能完整保留（AXP toast 直接出现在屏幕上方）

### J14 · 剪贴板捕获
1. 在其他 App 复制一段文本
2. 浮球右侧冒出剪贴板预览气泡（已有功能，D0 后视觉从宠物嘴边出）
3. 点击动作（总结 / 翻译 / 回答）→ 进入对话

### J15 · 审批提示
1. 手机端发起高风险操作 → 桌面浮球冒红点 badge
2. 鼠标悬停显示工具名 + 风险等级 + 原因
3. 点击进入审批

---

## 已发现问题清单（Live）

| # | 问题 | 严重度 | 状态 |
|---|------|:---:|---|
| 1 | ~~抽象球遮挡用户视线，不参与任何 AXP/社交~~ | 🔴 | ✅ D0 Pet-as-Floating-Ball |
| 2 | ~~桌面无签到入口~~ | 🔴 | ✅ DA 右键菜单 |
| 3 | ~~AXP 到账无反馈~~ | 🔴 | ✅ DA PetHeadToast |
| 4 | ~~订阅档位/预算不可见~~ | 🟡 | ✅ DB SubscriptionBadge |
| 5 | ~~共养/贺卡/模仿秀无桌面入口~~ | 🟡 | ✅ DC SocialPanel |
| 6 | ~~Pet/Video/Wardrobe/Mimic 分散~~ | 🟡 | ✅ DD CreatorStudioHub |
| 7 | ~~AgentEconomyPanel 只有钱包~~ | 🟡 | ✅ DD AXP tab |
| 8 | ~~手机 AXP 事件桌面无感知~~ | 🟡 | ✅ DE1 axpRemoteSync |
| 9 | ~~仓库根 tmp_*.cjs / expanded.rs / lib.rs.bak 污染~~ | 🟢 | ✅ DE 清理完成 |
| 10 | Stripe 真实支付未接入（当前跳网页） | 🟡 | 延后到独立 Sprint |
| 11 | LevelUpModal 在桌面未接入（移动端已有） | 🟢 | 下次 Sprint 补 |
| 12 | 本地算力节点 (D-MESH Phase 2) 待开 | 🟢 | 独立 Sprint（用户 opt-in） |

---

## 测试前提

1. **Windows/macOS 构建**：Tauri 2.0 打包 + WebView2 运行时
2. **测试账号**：登录后有 2+ 设备在 `desktop_device_presence` 表
3. **AXP 种子**：至少 1 笔 ledger 记录
4. **网络**：`api.agentrix.top` 可达

## 回归门禁

- [ ] J1-J10 核心路径全部 PASS
- [ ] D0 opt-out 按钮工作（可以切回抽象球）
- [ ] 所有新文件 zero TypeScript diagnostics
- [ ] `npm run tauri build` 在至少一个平台成功
- [ ] 部署后手机签到，桌面 5s 内看到 toast

---

*Agentrix Desktop QA · 2026-05-11*
