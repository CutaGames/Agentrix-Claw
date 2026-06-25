# Agentrix V4 端到端测试计划

> **版本**：v1.0 · 2026-05-12
> **目标**：确保每个 PRD 功能都有 UI 入口且可用；每个 UI 元素点击后都有有效响应；用户实际使用不会遇到死路。
> **原则**：
> 1. 正向：PRD 功能 → 找到 UI 入口 → 模拟用户完整操作 → 验证结果
> 2. 反向：遍历每个界面每个可点击元素 → 验证不会 404 / 空白 / 无响应 / console error
> 3. Mock 数据必须明确标注（让团队知道哪些后端还需完善）

---

## 1. 测试环境矩阵

| 端 | 设备 | 工具 | 运行方式 | 连接后端 |
|----|------|------|---------|---------|
| **桌面端** | Windows 本机 | Playwright + Tauri Driver | 本地手动触发 | 生产 47.130.176.148 |
| **Web 端** | Chrome (Windows) | Playwright | GitHub Actions 自动 | 生产 |
| **移动端 Android** | 华为手机 (USB) | Maestro | 本地开发机 | 生产 |
| **移动端 iPad** | iPad Air (USB) | Maestro (iOS) | 本地开发机 | 生产 |
| **Watch 端** | 小天才 Android 手表 | ADB + 自定义脚本 | 本地 (BLE 配对后) | 通过手机中继 |
| **Toy 端** | ESP32-S3 开发板 + NFC 贴纸 | Mock firmware + ADB | 本地 (BLE 连接) | 生产 |
| **Glass 端** | ESP32 模拟 GATT | Mock HUD service | 本地 (BLE) | 生产 |

### 1.1 硬件采购清单

| 设备 | 用途 | 预算 | 淘宝关键词 |
|------|------|------|-----------|
| ESP32-S3 开发板 (带 BLE 5.0) | Toy 端 BLE 配对 + ClawCore 协议测试 | ¥35-50 | "ESP32-S3 开发板 N16R8" |
| NTAG215 NFC 贴纸 × 10 | NFC 盲盒兑换测试 | ¥15 | "NTAG215 NFC 贴纸 空白" |
| ESP32-S3 第二块 (可选) | 模拟 Glass GATT HUD 服务 | ¥35 | 同上 |

---

## 2. 测试标准（通过/失败判定）

### 2.1 通过条件

| 条件 | 说明 |
|------|------|
| ✅ 功能完成 | 操作后得到预期结果（数据变化 / 页面跳转 / toast 提示） |
| ✅ API 返回真实数据 | 后端返回非 mock 数据，UI 正确渲染 |
| ✅ Mock 数据明确标注 | 如果后端未就绪，UI 必须显示 "[DEV] Mock Data" 或类似标记 |
| ✅ 无 console error | 浏览器/RN 控制台无红色错误 |
| ✅ 响应时间 < 3s | 用户操作后 3 秒内有可见反馈 |

### 2.2 失败条件

| 条件 | 严重级 |
|------|:------:|
| ❌ 点击后 404 / 空白页 | P0 |
| ❌ 点击后无任何响应（> 5s） | P0 |
| ❌ Console error (红色) | P1 |
| ❌ 功能存在但无 UI 入口 | P1 |
| ❌ UI 元素存在但点击后功能未实现 | P1 |
| ❌ Mock 数据未标注（用户以为是真实数据） | P2 |
| ❌ 文案错误 / 乱码 | P2 |

---

## 3. 桌面端测试矩阵（Playwright + Tauri）

### 3.1 功能 → UI 入口映射

| # | PRD 功能 | UI 入口路径 | 测试操作 | 预期结果 |
|--:|---------|-----------|---------|---------|
| D1 | 浮球显示 | 启动 App → 浮球出现 | 等待 3s | 浮球可见 + 宠物渲染 |
| D2 | 浮球右键菜单 | 浮球 → 右键 | 右键点击 | 菜单弹出（衣柜/灵魂/设置等） |
| D3 | 打开 Chat Panel | 浮球 → 单击 | 点击 | Chat Panel 展开 |
| D4 | Pro Mode 切换 | Ctrl+Shift+Space | 快捷键 | 窗口扩大到 1100×820 |
| D5 | Living Agent 切换 | Ctrl+Space | 快捷键 | 窗口缩小到 480×640 |
| D6 | 对话发送 | Chat Panel → 输入框 → 发送 | 输入 "hello" + Enter | 收到 AI 回复 |
| D7 | 语音输入 | Chat Panel → 🎙 按钮 | 点击 | 录音状态激活 |
| D8 | PetCreator 文生 | 浮球右键 → PetCreator / Chat Panel 内 | 输入 prompt → 提交 | 任务创建 + 进度显示 |
| D9 | PetCreator 图生 | PetCreator → 图生 Tab | 上传图片 → 提交 | 任务创建 |
| D10 | PetCreator 繁殖 | PetCreator → 繁殖 Tab | 选 2 父系 → 提交 | 调用 /breed API |
| D11 | 衣柜打开 | 浮球右键 → 衣柜 | 点击 | WardrobePanel 显示皮肤列表 |
| D12 | 皮肤装备 | 衣柜 → 某皮肤 → 装备 | 点击 | 浮球外观切换 |
| D13 | 灵魂切换 | 衣柜底部 → 切换灵魂 → SoulPicker | 选择灵魂 → 确认 | 灵魂切换成功 |
| D14 | 6 族群全部可选 | SoulPicker → 6 个 Tab | 逐个点击 | 无锁定标记 |
| D15 | AgentEconomyPanel | Chat Panel → 经济面板 | 打开 | 余额 + 交易 + AXP 显示 |
| D16 | AXP Tab | Economy → AXP Tab | 点击 | 余额 + 档位 + LLM 预算 |
| D17 | Skin GMV Tab | Economy → Skin Tab | 点击 | 收入卡片（或 empty state） |
| D18 | Marketplace 浏览 | 衣柜 → 市场入口 | 点击 | MarketplaceBrowser 显示皮肤 |
| D19 | 签到 | AXP 角标 → 签到 | 点击 | CheckinModal + AXP 增加 |
| D20 | 设置页 | 浮球右键 → 设置 | 点击 | 设置面板打开 |
| D21 | Spotlight | Ctrl+K | 快捷键 | Spotlight 面板弹出 |
| D22 | Pet Companion 窗口 | 菜单 → 桌宠 | 点击 | 独立透明窗口出现 |
| D23 | 15min 空闲回 Living | Pro Mode → 等 15min | 等待 | 自动切回 compact |

### 3.2 界面遍历（反向测试）

对每个可见界面，遍历所有可点击元素：

| 界面 | 可点击元素数 | 测试方法 |
|------|:----------:|---------|
| FloatingBall | 3 (单击/双击/右键) | 逐个触发 |
| ChatPanel | ~15 (发送/语音/附件/新建/Tab切换/设置...) | 逐个点击 |
| PetCreatorPanel | ~10 (模式切换/provider/style/提交...) | 逐个操作 |
| WardrobePanel | N 皮肤 + 3 按钮 | 遍历 |
| SoulPicker | 6 Tab + N 卡片 | 遍历 |
| AgentEconomyPanel | 6 Tab + 内部按钮 | 遍历 |
| MarketplaceBrowser | 筛选 + 排序 + N 卡片 + 购买 | 遍历 |
| Settings | ~20 设置项 | 逐个切换 |

---

## 4. Web 端测试矩阵（Playwright · GitHub Actions）

### 4.1 功能 → UI 入口映射

| # | PRD 功能 | URL / 入口 | 测试操作 | 预期结果 |
|--:|---------|-----------|---------|---------|
| W1 | 首页加载 | `/` | 访问 | Hero + 导航 + 无 console error |
| W2 | 登录 | `/login` | 输入凭证 → 提交 | 跳转 Console |
| W3 | Pricing 页 | `/pricing` | 访问 | 5 档对照表显示 |
| W4 | Showcase 画廊 | `/showcase` | 访问 | 皮肤卡片网格（非渐变占位） |
| W5 | Marketplace 浏览 | `/market` | 访问 | 皮肤列表 + 筛选 + 排序 |
| W6 | Marketplace 技能 | `/market/skills` | 访问 | 技能卡片列表 |
| W7 | Marketplace 任务 | `/market/tasks` | 访问 | 任务卡片列表 |
| W8 | 皮肤详情 | `/market/skin/[id]` | 点击某皮肤 | 详情页 + 3D 预览 |
| W9 | Console Dashboard | `/console` | 登录后访问 | 仪表盘 + 宠物状态 |
| W10 | Console Pet | `/console/pet` | 访问 | 主宠 + 灵魂切换 + 衣柜 |
| W11 | Console PetCreator | `/console/pet/create` | 访问 | 创作工坊 |
| W12 | Console Wallet | `/console/wallet` | 访问 | 钱包报表 |
| W13 | Console AXP | `/console/axp` | 访问 | AXP 中心 |
| W14 | 共养落地页 | `/co-raising/[token]` | 访问 | 宠物预览 + CTA |
| W15 | 贺卡落地页 | `/greeting/[token]` | 访问 | 贺卡模板 + CTA |
| W16 | 公开宠物档案 | `/p/[petId]` | 访问 | 宠物 3D + 信息 |
| W17 | Deep Link 生成 | 皮肤详情 → "在 App 中打开" | 点击 | 生成 agentrix:// URI |
| W18 | SEO 验证 | 各页面 | 检查 | og:title + og:image + JSON-LD |

### 4.2 界面遍历

| 页面 | 检查项 |
|------|--------|
| 所有导航链接 | 点击后不 404 |
| 所有按钮 | 点击后有响应 |
| 所有表单 | 提交后有反馈 |
| 所有外链 | target="_blank" + 可达 |

---

## 5. 移动端测试矩阵（Maestro · 真机）

### 5.1 功能 → UI 入口映射

| # | PRD 功能 | Tab / 路径 | 测试操作 | 预期结果 |
|--:|---------|-----------|---------|---------|
| M1 | 启动 + 登录 | App 启动 | 打开 App | 登录页或主页 |
| M2 | Home Tab 主宠显示 | 🏠 Home | 查看 | 宠物渲染 + XP + 情绪 |
| M3 | 签到 | Home → CheckinCard | 点击 | AXP +20 toast |
| M4 | 召唤对话 | Home → "召唤" CTA | 点击 | 跳转 Summon Tab |
| M5 | Summon 发消息 | 🔮 Summon → 输入 | 输入 "你好" → 发送 | AI 回复 |
| M6 | 语音输入 | Summon → 🎙 | 点击 | 录音激活 |
| M7 | LLM 预算条 | Summon 底部 | 查看 | 进度条 + 金额 |
| M8 | Plaza Feed | 🎪 Plaza → Feed | 滑动 | 帖子列表 |
| M9 | Plaza Skills | Plaza → 技能 | 点击 | 技能市场 |
| M10 | Plaza Tasks | Plaza → 任务 | 点击 | 任务市场 |
| M11 | Plaza Pets (Skin Auction) | Plaza → 宠物 → 皮肤拍卖 | 点击 | 拍卖列表 |
| M12 | Plaza Pets (Pet Auction) | Plaza → 宠物 → 主宠拍卖 | 点击 | 拍卖列表 |
| M13 | Plaza Play (Photo Mimic) | Plaza → 玩乐 → 模仿秀 | 点击 | 赛季页面 |
| M14 | Plaza Play (Predict) | Plaza → 玩乐 → 预测 | 点击 | 预测页面 |
| M15 | Plaza Play (共养) | Plaza → 玩乐 → 共养 | 点击 | 邀请页面 |
| M16 | Plaza Play (贺卡) | Plaza → 玩乐 → 贺卡 | 点击 | 收件箱 |
| M17 | 贺卡创建 | Plaza → GreetingCardCompose | 选模板 → 发送 | 发送成功 |
| M18 | Me Profile | 👤 Me | 查看 | 个人信息 + 订阅 |
| M19 | Me Subscribe | Me → 订阅 | 点击 | 5 档对照表 |
| M20 | Me AXP Center | Me → AXP 中心 | 点击 | 余额 + 流水 |
| M21 | Me AXP 兑换商店 | AXP → 兑换中心 | 点击 | 兑换品列表 |
| M22 | Me 设备管理 | Me → 设备 | 点击 | 已配对设备列表 |
| M23 | Toy 配对 | Me → 设备 → 配对新设备 | 点击 | BLE 扫描启动 |
| M24 | NFC 盲盒 | Home → Pet → NFC 盲盒 | 点击 | NFC 扫描提示 |
| M25 | PetCreator 文生 | Home → ✨ 创生 | 输入 prompt → 提交 | 任务创建 |
| M26 | 衣柜 | Home → 👕 衣柜 | 点击 | 皮肤网格 |
| M27 | 灵魂切换 | Home → 💫 灵魂 | 点击 | 6 族群选择器 |
| M28 | 繁殖 | Home → 🧬 繁育 | 选 2 父系 → 提交 | 任务创建 |
| M29 | 全局铃铛 | 右上角 🔔 | 点击 | Inbox 弹出 |
| M30 | 全局扫码 | 右上角 📷 | 点击 | 扫码页面 |
| M31 | Deep Link 接收 | `agentrix://buy?resourceId=xxx` | 系统打开 | 跳转皮肤页 |
| M32 | 推送通知 | 后台触发 | 收到通知 → 点击 | 跳转对应页面 |

### 5.2 10 入口抽屉遍历

Home Tab 长按主宠区域唤出 10 个抽屉入口，每个都必须可达：

| 入口 | 目标屏 | 验证 |
|------|--------|------|
| 🎒 技能 | AgentToolsScreen | 非空白 |
| 💼 接单 | AgentToolsScreen | 非空白 |
| 💰 钱包 | AgentAccountScreen | 余额显示 |
| 🧠 记忆 | MemoryManagementScreen | 非空白 |
| 🎮 玩乐 | PetPlaygroundScreen | 非空白 |
| 👕 衣柜 | WardrobeScreen | 皮肤列表 |
| 💫 灵魂 | SoulPickerScreen | 6 族群 |
| 🧬 繁育 | BreedScreen | 父系选择 |
| 🆔 身份 | AgentPermissionsScreen | 非空白 |
| ✨ 创生 | PetCreatorScreen | 输入框 |

---

## 6. Watch 端测试矩阵（ADB + 自定义脚本）

| # | 功能 | 测试方法 | 预期 |
|--:|------|---------|------|
| Wa1 | Living Tile 显示 | 手机推送 pet.state → 查看手表 | 表情 emoji 更新 |
| Wa2 | L1 审批 | 手机触发 L1 审批 → 手表显示 | 显示 ✓/✕ 按钮 |
| Wa3 | L1 审批通过 | 手表点 ✓ | 手机收到 approve |
| Wa4 | AXP 余额显示 | 手机签到 → 查看手表 | 余额更新 |
| Wa5 | 语音指令 | 手表说话 → 手机收到 | transcript 到达 |

**测试前提**：小天才手表通过 ADB 连接 + 安装 Agentrix WearOS companion APK。

---

## 7. Toy 端测试矩阵（ESP32 + NFC）

| # | 功能 | 测试方法 | 预期 |
|--:|------|---------|------|
| T1 | BLE 发现 | ESP32 广播 AGX- 前缀 → 手机扫描 | 设备出现在列表 |
| T2 | 6 位码配对 | 手机输入码 → ESP32 确认 | 配对成功 |
| T3 | pet.state.sync | 手机推送情绪 → ESP32 接收 | 串口打印帧 |
| T4 | pet.interaction | ESP32 发送 hug → 手机接收 | 主宠情绪变化 |
| T5 | NFC 兑换 | 手机碰 NTAG215 贴纸 | 兑换成功 / 已兑换提示 |
| T6 | OTA 检查 | 手机触发 OTA → ESP32 收到 manifest | 版本信息显示 |
| T7 | HMAC 验证 | 发送错误签名帧 → 手机拒绝 | 帧被丢弃 |

**ESP32 测试固件**：烧录 `shared/clawcore/v1/` 协议的最小实现（BLE GATT Nordic UART + JSON-line 帧收发）。

---

## 8. Glass 端测试矩阵（ESP32 模拟）

| # | 功能 | 测试方法 | 预期 |
|--:|------|---------|------|
| G1 | HUD 文本推送 | 手机发送 agent 回复 → ESP32 GATT 接收 | 串口打印文本 |
| G2 | 通知优先级 | 连续发 3 条不同优先级 → 检查顺序 | 高优先级先显示 |
| G3 | 每日 5 条限制 | 发 6 条 marketplace 通知 | 第 6 条被拒绝 |
| G4 | Toy 近距检测 | ESP32 广播 BLE → 手机检测 | proximity 事件触发 |

---

## 9. 自动化工具链

### 9.1 桌面端

```
工具: Playwright + @playwright/test
配置: tests/e2e/playwright.desktop.config.ts
启动: npx tauri dev → Playwright 连接 WebView
命令: npm run test:desktop:full
```

### 9.2 Web 端

```
工具: Playwright
配置: tests/e2e/playwright.config.ts
CI: GitHub Actions (push 触发)
命令: npm run test:e2e:web
```

### 9.3 移动端

```
工具: Maestro (YAML flows)
配置: .maestro/*.yaml
设备: USB 连接华为 Android / iPad Air
命令: maestro test .maestro/
```

### 9.4 Watch / Toy / Glass

```
工具: 自定义 Node.js 脚本 + ADB + BLE 库
配置: tests/hardware/
设备: USB (Watch) / BLE (ESP32)
命令: npm run test:hardware
```

---

## 10. 测试执行流程

### 10.1 每次 Push 自动执行（CI）

```
1. Web E2E (Playwright · GitHub Actions) — 5 min
2. 后端 API smoke test — 2 min
3. TypeScript 类型检查 — 1 min
```

### 10.2 每日手动执行（本地）

```
1. 桌面端 E2E (Playwright · 本地) — 10 min
2. 移动端 Maestro (真机 USB) — 15 min
3. Watch 基础验证 (ADB) — 5 min
```

### 10.3 每周执行（硬件）

```
1. Toy BLE 配对 + NFC 兑换 (ESP32) — 10 min
2. Glass HUD 推送 (ESP32 模拟) — 5 min
3. 全链路跨端测试 (手机→手表→桌面 Handoff) — 10 min
```

---

## 11. 测试报告格式

每次测试生成报告：

```
日期: 2026-05-XX
执行人: [自动/手动]
环境: [设备 + 后端版本]

通过: XX / YY (XX%)
失败: ZZ 项
  - [P0] D3: Chat Panel 打开后空白 (console: TypeError xxx)
  - [P1] M21: AXP 兑换商店显示 mock 数据但未标注
  - [P2] W4: Showcase 页面 og:image 缺失

Mock 数据标记:
  - /market/skins: 后端返回 fallback catalog (非真实数据)
  - /marketplace/my-sales: 404 (后端未实现)

后端待完善:
  - POST /v1/axp/redeem/catalog — 需要实现
  - POST /v1/checkout/session — 需要实现
  - GET /v1/marketplace/my-remix-earnings — 需要实现
```

---

## 12. 实施排期

| 阶段 | 周期 | 交付 |
|------|------|------|
| **Phase 1: 框架搭建** | 2d | Playwright 桌面/Web 配置 + Maestro 移动端 flows + 测试数据 seed |
| **Phase 2: 正向测试** | 3d | 所有 PRD 功能 → UI 入口 → E2E 脚本 |
| **Phase 3: 反向遍历** | 2d | 每个界面每个元素点击验证 |
| **Phase 4: 硬件测试** | 2d | ESP32 固件 + Watch ADB + NFC 贴纸 |
| **Phase 5: CI 集成** | 1d | GitHub Actions workflow + 报告生成 |
| **Phase 6: 修复** | 持续 | 根据测试报告修复 P0/P1 |

---

## 13. 附录：后端 API 就绪状态检查清单

测试前需确认以下 API 可用（否则标记为 mock）：

| API | 用途 | 预期状态 |
|-----|------|---------|
| `GET /v1/axp/balance` | AXP 余额 | ✅ 已上线 |
| `POST /v1/axp/checkin` | 签到 | ✅ 已上线 |
| `GET /v1/pet/skins` | 衣柜 | ✅ 已上线 |
| `POST /v1/pet/skin/activate` | 装备皮肤 | ✅ 已上线 |
| `GET /v1/pet-generation/tasks` | 生成任务列表 | ✅ 已上线 |
| `POST /v1/pet-generation/submit` | 提交生成 | ✅ 已上线 |
| `GET /v1/market/skins` | Marketplace 浏览 | 需验证 |
| `POST /v1/marketplace/skins/:id/buy` | 购买皮肤 | 需验证 |
| `GET /v1/axp/redeem/catalog` | 兑换商店 | 需实现 |
| `POST /v1/axp/redeem` | 兑换 | 需实现 |
| `POST /v1/checkout/session` | Stripe 结账 | 需实现 |
| `GET /v1/marketplace/my-sales/summary` | Skin GMV | 需实现 |
| `GET /v1/marketplace/my-remix-earnings` | Remix 分成 | 需实现 |
| `POST /v1/pet/skins/breed` | 繁殖 | 需验证 |
| `POST /v1/clawcore/pair` | Toy 配对 | ✅ 已上线 |
| `GET /v1/clawcore/devices` | 设备列表 | ✅ 已上线 |
| `POST /v1/clawcore/nfc/redeem` | NFC 兑换 | ✅ 已上线 |
| `GET /v1/subscription/catalog` | 订阅目录 | ✅ 已上线 |
| `GET /v1/vitals/ingest` | Vitals 上报 | ✅ 已上线 |


---

# v2.0 增量（Sprint G-2 / G-3 完成后补）

> **版本**：v2.0 · 2026-05-16
> **触发原因**：Sprint G-2 完成（v0.2.0 上线，3 个 endpoint 上线，SchemaG-1 +重复窗口修复合并）；Sprint G-3 启动（内测 100 人）。
> **对比 v1.0 的变化**：
> - 新增 `agentrix_desktop` 后端 schema 测试（auto-update / crash / analytics）
> - 新增 Sprint G-2 / G-3 覆盖的 14 个新功能场景
> - 新增"GA Gate"专项测试（崩溃率 / 自动更新 / 漏斗）
> - 新增"内测稳定性"持续测试（每日 SQL 报告）
> - 新增桌面端 Vitest 单元测试矩阵

---

## 14. Sprint G-2 / G-3 新增测试矩阵

### 14.1 自动更新链路（Sprint G-2 / US-G2-2）

| # | 场景 | 测试方法 | 预期 |
|--:|------|---------|------|
| U1 | 检查更新（无新版本） | 启动 v0.2.0，等 30s | GET `/api/v1/desktop/update/...` 返回 204；通知不弹 |
| U2 | 检查更新（有新版本） | INSERT v0.2.1 到 releases 表 + 启动 v0.2.0 | 返回 manifest；通知 "🎉 新版本 v0.2.1 可用 [立即更新]" |
| U3 | 灰度命中 | rollout_percent=10，模拟 10 个不同 fingerprint | 约 1 个收到 manifest |
| U4 | 灰度未命中 | rollout_percent=10，模拟 10 个不同 fingerprint | 约 9 个收到 204 |
| U5 | 用户接受更新 | 点击 [立即更新] | 下载 + 验证签名 + 安装 + 重启 |
| U6 | 签名校验失败 | 篡改 url 文件 | 安装中止 + 错误 toast 显示 |
| U7 | 网络中断 | 下载中拔网 | 错误 toast，原版本仍可用 |
| U8 | 灰度 100% | rollout_percent=100 | 所有 fingerprint 都返回 manifest |
| U9 | 紧急回滚 | UPDATE rollback SQL | 新启动客户端不再收到 v0.2.1 manifest |
| U10 | dev/dev 渠道隔离 | channel='beta' 的 release 不影响 stable 用户 | stable 客户端收到 204 |

**验证脚本**（伪代码）：
```bash
# 在 staging 数据库
psql -c "INSERT INTO agentrix_desktop.releases ... rollout_percent=10 ..."
# 启动 100 个不同 device_id_hash 的客户端模拟器
node scripts/simulate-update-checks.js --count 100 --version 0.2.0
# 期望 ~10 个收到 200，其余 204
```

### 14.2 崩溃上报（Sprint G-2 / US-G2-3）

| # | 场景 | 测试方法 | 预期 |
|--:|------|---------|------|
| C1 | Rust panic 上报 | 触发 Rust panic（debug 命令） | crash_records 表新增 1 条 type='rust_panic' |
| C2 | JS 异常上报 | window.dispatchEvent error event | crash_records 表新增 type='js_error' |
| C3 | Promise rejection | window.dispatchEvent unhandledrejection | crash_records 表新增 type='unhandled_rejection' |
| C4 | React 错误边界 | 组件 throw → ErrorBoundary 触发 | crash_records 表新增 type='react_error' |
| C5 | 路径脱敏（Win） | message 含 `C:\Users\realname\foo` | DB message 是 `C:\Users\<user>\foo` |
| C6 | 路径脱敏（Mac） | message 含 `/Users/jdoe/...` | DB message 是 `/Users/<user>/...` |
| C7 | 10 分钟去重 | 10 分钟内同 fingerprint 上报 5 次 | DB count=5，仅 1 条 row |
| C8 | 10 分钟外不去重 | 间隔 11 分钟上报相同 fingerprint | DB 新增第 2 条 row |
| C9 | 离线队列 | 拔网络 → 触发 5 次崩溃 → 联网 | 联网后批量上报，5 条全部到 DB |
| C10 | 队列上限 | 拔网络 → 触发 60 次 | localStorage 仅保留最后 50 条 |
| C11 | 上报 deviceId 哈希 | 检查 DB device_id_hash 列 | 是 64 字符 hex（SHA256） |

### 14.3 遥测（opt-in）（Sprint G-2 / US-G2-4）

| # | 场景 | 测试方法 | 预期 |
|--:|------|---------|------|
| T1 | 默认关闭 | 干净 install → 启动 | analytics_events 表 24h 内无 device_launch 记录 |
| T2 | 用户 opt-in | Settings → 开关 ON | 后续 launch 事件入表 |
| T3 | 用户 opt-out | 开关 OFF | 队列清空，不再上报 |
| T4 | 第 3 天 prompt | 设 onboarded_at=3 天前 → 启动 | FirstRunTelemetryPrompt 显示 |
| T5 | prompt 一次性 | 关 prompt 后再次启动 | prompt 不再显示 |
| T6 | 6 个核心事件触发 | opt-in 后跑完整路径 | 6 种 eventName 全部入表 |
| T7 | 事件白名单 | 上报 `random_event` | 后端拒绝（rejected += 1） |
| T8 | props 净化 | 上报 `event_props.user_email` | DB 不存这个字段（不在 whitelist） |
| T9 | 批量上限 | 队列 250 条 → 上报 | 后端只接 200，rejected 50 |
| T10 | 崩溃事件不受 opt-in 影响 | opt-out → 触发崩溃 | crash_records 仍记录（带脱敏 device_id_hash） |

### 14.4 桌面端浮球 + Pro 模式回归（Sprint G-1 / US-G1-1）

| # | 场景 | 测试方法 | 预期 |
|--:|------|---------|------|
| FB1 | 浮球右键 → 衣柜（main 窗口） | 右键 → 点击衣柜 | 同窗口弹出衣柜，**任务栏图标 = 1** |
| FB2 | 浮球右键 → 创建（main） | 右键 → 创建 | 同窗口弹出 PetCreator |
| FB3 | 12 个菜单项各点一遍 | 遍历 | 每次任务栏 = 1，无窗口堆积 |
| FB4 | Pro Mode More 菜单 | 点击 More → Agent Economy | 同窗口弹出 |
| FB5 | 关闭 Pro → 浮球 → Pro | 来回 5 次 | 任务栏始终 = 1 |
| FB6 | 浮球切换 → 形态切换 | 默认 → 进 Pro → Economy → 退出 | 萌态 → 专家态 → 商人态 → 萌态 |
| FB7 | 多显示器拖拽 | 把浮球拖到副屏 | 自动贴边副屏 |
| FB8 | 拔副屏后启动 | 关副屏 → 重启 | 浮球回到主屏右下角（validate_ball_position） |

### 14.5 形态自动切换（Sprint G-2 / US-G2-7）

| # | 场景 | 测试方法 | 预期 |
|--:|------|---------|------|
| V1 | 默认 VRM 加载 | 干净 install → 登录 → 浮球 | DevTools 看到 `kitsune-default.vrm` 200 |
| V2 | 切 Pro 模式 | 双击浮球 → Pro | URL 变 `kitsune-pro.vrm` |
| V3 | 切 Economy | Pro → 打开 Agent Economy | URL 变 `kitsune-economy.vrm` |
| V4 | 关 Economy 回 Pro | 关闭 Agent Economy 面板 | URL 回到 `kitsune-pro.vrm` |
| V5 | 退出 Pro 回浮球 | 关闭 Pro Mode | URL 回到 `kitsune-default.vrm` |
| V6 | VRM 加载失败 | DevTools Block `*.vrm` | 自动降级 PetCanvas PNG |
| V7 | 用户上传自定义皮肤 | 装备 marketplace 皮肤 | URL 切到自定义，模式切换不覆盖 |
| V8 | GPU tier=light | 模拟低端 GPU profile | 跳过 VRM，直接 PetCanvas PNG |

### 14.6 资源加载（Sprint G-2 / US-G2-5）

| # | 场景 | 测试方法 | 预期 |
|--:|------|---------|------|
| R1 | PNG 加载验证 | 启动 → DevTools Network | `/pets/*.png` 都是 200 |
| R2 | PNG 缺失 | 删 dist/pets/kitsune-default.png 重启 | console.warn + 触发 `agentrix:asset-fallback` |
| R3 | 资源响应 < 200ms | 启动到第一帧浮球可见 | LCP 比 v0.1.x 不降级 |
| R4 | 离线启动 | 拔网 → 启动 | LoginPanel 完整渲染（不依赖外网 CDN） |

### 14.7 启动闪屏（Sprint G-1 / US-G1-2）

| # | 场景 | 测试方法 | 预期 |
|--:|------|---------|------|
| S1 | 干净 install 启动 | 启动 v0.2.0 | 200ms 紫色 spinner + "Agentrix" 文字 |
| S2 | spinner 可见 | 截图 100ms 后窗口 | 不是空白 80×80 方块 |
| S3 | spinner 自动消失 | 截图 250ms 后 | LoginPanel 完整显示 |
| S4 | 已登录用户启动 | 启动已 onboarded 用户 | spinner → 直接浮球（跳过 LoginPanel） |

### 14.8 Vitest 单元测试矩阵（开发期已自动覆盖）

由 GitHub Actions push 时自动运行：

| 测试文件 | 数量 | 覆盖 |
|---------|----:|-----|
| `src/test/desktopBus.test.ts` | 6 | US-G1-1 重复窗口 |
| `src/test/SplashScreen.test.tsx` | 3 | US-G1-2 splash 行为 |
| `src/test/AgentEconomyPanel.test.tsx` | 1 | US-G1-3 跳转修复 |
| `src/test/analytics-opt-in.test.ts` | 4 | US-G2-4 默认关闭 |
| `src/test/petSdk.test.ts` | 2 | 渲染器优先级 |
| `src/test/petSoulSdk.test.ts` | 6 | 灵魂切换 |
| `src/test/WardrobePanel.test.tsx` | 4 | 衣柜操作 |
| `src/test/PetPhase6.test.tsx` | 20 | Phase 6 综合 |
| 其余（Soul/Phase6/Renderer/petCompanion 等）| 25 | — |
| **总计** | **71 / 71 通过** | |

后端：
| 测试文件 | 数量 | 覆盖 |
|---------|----:|-----|
| `desktop-update.service.spec.ts` | 5 | DB-first + 灰度 |
| `desktop-crash.service.spec.ts` | 11 | 路径脱敏 + 去重 |
| `desktop-analytics.service.spec.ts` | 5 | opt-in 白名单 |
| **总计** | **21 / 21 通过** | |

---

## 15. GA Gate 专项测试（Sprint G-3）

### 15.1 必达指标

| 指标 | 目标值 | 测试方法 |
|------|------:|---------|
| 崩溃率 | < 0.5 % / DAU | 每日 SQL：`crashes_24h / dau_24h` |
| 自动更新成功率 | > 95 % | `desktop_update_installed / desktop_update_available` |
| 首跑漏斗 launch→login | > 60 % | analytics_events COUNT 按 device_id_hash 分桶 |
| 首跑漏斗 login→onboarding→first_chat | > 70 % | 同上 |
| 内测用户数 | ≥ 100 不重复 device_id_hash | analytics_events DISTINCT |

### 15.2 GA Gate Demo 流程（12 步，照 G-2 spec §6 执行）

每周一次，由产品 + QA 联合执行：

1. 干净 Win 11 + Win 10 各下载 setup.exe
2. SmartScreen 行为记录（红/蓝/绿）
3. 安装 → 启动 → splash 200ms → LoginPanel 完整
4. 邮箱登录 → onboarding → 真实 VRM 灵狐
5. 浮球右键 → 衣柜 → 同窗口（任务栏=1）
6. Pro Mode → Agent Economy → 商人态切换
7. 拖到副屏 → 自动贴边
8. 服务端推 v0.2.X+1 → 30s 收到 → 安装 → 重启
9. 故意 panic → 重启看到崩溃 toast + 后端有 record
10. Settings → Privacy → 默认 OFF → opt-in → 后续事件入表
11. 第 3 天 prompt 弹一次（模拟 onboarded_at=3天前）
12. 卸载 → APPDATA 清理（验证）

### 15.3 持续观测脚本

`scripts/daily-internal-beta-report.ts`：
```typescript
// 每日 9:00 UTC 自动跑
// 写到 tests/reports/INTERNAL_BETA_DAILY_<date>.md
// 推送到 Telegram 运营群
```

输出示例：
```markdown
# Internal Beta Daily Report — 2026-05-22

## 关键指标
- 崩溃率: 0.31% ✅ (< 0.5%)
- 自动更新成功率: 96.7% ✅ (> 95%)
- DAU: 87 (target: 100)
- 7 天累计安装: 134 device_id_hash

## 漏斗
launch → login: 67.2% ✅
login → onboarding: 89.1% ✅
onboarding → first_chat: 76.4% ✅

## Top 3 崩溃指纹
1. (87cb...) rust_panic in tray.rs:123 — count=12
2. (4f9a...) js_error TypeError "cannot read 'foo' of undefined" — count=8
3. (...) ...

## 待办
- 修 #1 崩溃 (PR #xxx)
- 调研 #2 (TypeError 来源)
```

---

## 16. v2.0 实施排期更新

| 阶段 | 周期 | 交付（叠加 v1.0 已有） |
|------|------|------|
| **Phase 7: G-2 自动化** | 2d | 14.1-14.7 测试脚本接入 CI（playwright + 后端 jest） |
| **Phase 8: G-3 内测观测** | 持续 | daily report cronjob + admin dashboard |
| **Phase 9: GA Gate 评审** | Sprint G-3 末 | GA_READINESS 报告 + 决策会议 |
| **Phase 10: G-4 公开发布** | 待 G-3 通过 | 微软商店 / GitHub Releases / 官网下载页正式上线 |

---

## 17. v2.0 后端 API 状态更新

| API | 状态变化 |
|-----|---------|
| `GET /api/v1/desktop/update/:target/:arch/:current_version` | ⭐ G-2 新增上线 |
| `POST /api/v1/desktop/crashes` | ⭐ G-2 新增上线 |
| `POST /api/v1/desktop/analytics` | ⭐ G-2 新增上线 |
| `POST /api/v1/desktop/download/track` | ⏳ G-3 新增（待开发） |
| `GET /api/v1/admin/desktop/dashboard` | ⏳ G-3 新增（待开发） |
| `GET /v1/market/skins` | ✅ 验证完成 |
| `POST /v1/marketplace/skins/:id/buy` | ⚠️ 待 G-4 |
| `POST /v1/axp/redeem` | ⚠️ 待 G-4 |

