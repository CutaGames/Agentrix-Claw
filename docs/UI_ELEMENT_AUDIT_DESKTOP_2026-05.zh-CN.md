# 桌面端完整 UI 元素审计（Step 1）

> **审计日期**：2026-05-12
> **范围**：`desktop/src/` 全部 70+ 组件文件，200+ 可交互元素
> **目的**：为 E2E 测试提供完整的测试项清单——每个用户能点到的元素都必须验证

---

## 总览

| 类别 | 数量 |
|------|:----:|
| 组件文件 (.tsx) | 70+ |
| 全局快捷键 | 9 |
| 浮球交互（含右键菜单） | 22+ |
| 标题栏工具按钮 | 18+ |
| "更多"下拉菜单项 | 9 |
| 设置面板开关/输入 | 20+ |
| 登录方式/按钮 | 12+ |
| 引导流程步骤 | 12+ |
| 聊天输入区元素 | 12+ |
| 语音交互模式 | 6+ |
| 弹窗/对话框组件 | 8+ |
| 可打开面板组件 | 25+ |
| **总计可交互元素** | **~200+** |

---

## 1. 全局快捷键（9 个）

| ID | 快捷键 | 功能 | 测试验证 |
|----|--------|------|---------|
| KB-1 | `Ctrl+Shift+S` | 切换 Pro Panel | 窗口尺寸变化 |
| KB-2 | `Ctrl/Cmd+K` | Spotlight 快速命令 | Spotlight 面板弹出 |
| KB-3 | `Escape` | 关闭当前面板 | 面板消失 |
| KB-4 | `Ctrl+N` | 新建对话 | 新 Tab 出现 |
| KB-5 | `CmdOrCtrl+Shift+A` | 语音输入（按住说/松开停） | 录音状态切换 |
| KB-6 | `CmdOrCtrl+Space` | Living Agent 形态 | 窗口缩小 |
| KB-7 | `CmdOrCtrl+Shift+Space` | Pro Mode 形态 | 窗口扩大 |
| KB-8 | Wake Word（可配置） | 语音唤醒 | 自动开始录音 |
| KB-9 | `F11` | 全屏 | 窗口全屏 |

---

## 2. 浮球交互（22 项）

### 2.1 手势

| ID | 交互 | 功能 | 测试验证 |
|----|------|------|---------|
| FB-1 | 单击 | 打开 compact chat | Chat Panel 展开 |
| FB-2 | 双击 | 打开 Pro Mode | 窗口扩大到 1100×820 |
| FB-3 | 长按 (400ms) | 开始语音录音 | 录音状态 + 波形 |
| FB-4 | 拖拽 | 移动浮球位置 | 位置变化 + 边缘吸附 |
| FB-5 | 右键 | 弹出原生菜单 | 菜单显示 |

### 2.2 右键菜单项（17 项）

| ID | 菜单项 | 目标 | 测试验证 |
|----|--------|------|---------|
| RM-1 | ☀️ 每日签到 | CheckinModal | 弹窗显示 |
| RM-2 | 📸 宠物模仿秀 | SocialPanel (mimic tab) | 面板打开 |
| RM-3 | 🌱 共养邀请 | SocialPanel (coraising tab) | 面板打开 |
| RM-4 | 🎁 贺卡 | SocialPanel (greeting tab) | 面板打开 |
| RM-5 | 🎨 Creator Studio | CreatorStudioHub | 面板打开 |
| RM-6 | 💬 Open Pro Mode | Pro Mode | 窗口扩大 |
| RM-7 | 🆕 New Chat | 新对话 | 新 Tab |
| RM-8 | 🎤 Voice Input | 语音录音 | 录音状态 |
| RM-9 | 🎬 视频工作室 | VideoStudioPanel | 面板打开 |
| RM-10 | 🐾 创建萌宠 | PetCreatorPanel | 面板打开 |
| RM-11 | ✨ 选择灵魂 | SoulPicker | 面板打开 |
| RM-12 | 👗 衣柜 | WardrobePanel | 面板打开 |
| RM-13 | 📊 成长面板 | PetGrowthDashboard | 面板打开 |
| RM-14 | 🏆 宠物成就 | PetAchievementWall | 面板打开 |
| RM-15 | 📔 时光相册 | PetMemoryAlbumPanel | 面板打开 |
| RM-16 | 🎮 迷你游戏 | PetMinigamePanel | 面板打开 |
| RM-17 | 💞 社交繁育 | PetBreedingPanel | 面板打开 |
| RM-18 | ⚙️ Settings | SettingsPanel | 面板打开 |

---

## 3. Pro Mode 标题栏（18+ 按钮）

| ID | 元素 | 类型 | 功能 | 测试验证 |
|----|------|------|------|---------|
| TB-1 | 实例选择器 | Dropdown | 切换 Agent 实例 | 下拉列表显示 |
| TB-2 | 模型选择器 | Dropdown | 切换 AI 模型 | 模型切换成功 |
| TB-3 | 端侧/智能/云端 | Segmented | 切换执行层级 | 选中状态变化 |
| TB-4 | ＋ New Chat | Button | 新建对话 | 新 Tab |
| TB-5 | 📁 Workspace Files | Button | 文件树面板 | 面板切换 |
| TB-6 | 📋 Chat History | Button | 历史记录 | 面板切换 |
| TB-7 | 🔔 Notifications | Badge | 通知中心 | 面板打开 |
| TB-8 | 🔗 Cross-Device | Button | 跨设备中心 | 面板打开 |
| TB-9 | 🗂 Task Workbench | Button | 任务工作台 | 面板打开 |
| TB-10 | 🧭 Deep OS | Button | 本地优先面板 | 面板打开 |
| TB-11 | ⋯ More | Button | 更多面板菜单 | 下拉显示 |
| TB-12 | ⚙ Settings | Button | 设置 | 面板打开 |
| TB-13 | Pro | Button | 进入 Pro Mode | 窗口扩大 |
| TB-14 | Max/Restore | Button | 最大化/还原 | 窗口变化 |
| TB-15 | ✕ Close | Button | 关闭面板 | 面板关闭 |
| TB-16 | 同步指示灯 | Visual | 显示同步状态 | 颜色正确 |
| TB-17 | 窗口拖拽 | Gesture | 移动窗口 | 位置变化 |
| TB-18 | 双击标题栏 | Gesture | 最大化/还原 | 窗口变化 |

### 3.1 "更多"下拉菜单（9 项）

| ID | 菜单项 | 目标面板 | 测试验证 |
|----|--------|---------|---------|
| MM-1 | 🌿 Worktree Board | WorktreePanel | 面板打开 + 内容加载 |
| MM-2 | 🕸 Skill Canvas | SkillCanvasPanel | 面板打开 |
| MM-3 | 💰 Agent Economy | AgentEconomyPanel | 面板打开 + 6 Tab 可切换 |
| MM-4 | 📋 Work Log | TaskLogPanel | 面板打开 |
| MM-5 | 🧠 Memory | MemoryPanel | 面板打开 |
| MM-6 | 💤 Dreaming | DreamPanel | 面板打开 |
| MM-7 | 🧩 Plugin Hub | PluginPanel | 面板打开 |
| MM-8 | 📝 Memory Wiki | MemoryWikiPanel | 面板打开 |
| MM-9 | 🔌 MCP Manager | McpPanel | 面板打开 |

---

## 4. 聊天输入区（12+ 元素）

| ID | 元素 | 类型 | 功能 | 测试验证 |
|----|------|------|------|---------|
| CI-1 | Ask/Agent/Plan 模式切换 | Segmented | 切换聊天模式 | 选中状态 |
| CI-2 | 文本输入框 | Textarea | 输入消息 | 可输入 + / 命令 |
| CI-3 | 📎 附件 | Button | 打开文件选择 | 文件选择器弹出 |
| CI-4 | 🎤 语音 | Button | 语音输入 | 录音状态 |
| CI-5 | ➤ 发送 | Button | 发送消息 | 消息发出 + AI 回复 |
| CI-6 | ⏹ 停止 | Button | 停止生成 | 生成中断 |
| CI-7 | Continue | Button | 继续生成 | 继续输出 |
| CI-8 | Open Workbench | Quick action | 打开工作台 | 面板打开 |
| CI-9 | Context 进度条 | Visual | Token 使用量 | 百分比正确 |
| CI-10 | Enter 键 | Keyboard | 发送 | 同 CI-5 |
| CI-11 | Shift+Enter | Keyboard | 换行 | 不发送 |
| CI-12 | 附件芯片 ✕ | Button | 移除附件 | 附件消失 |

---

## 5. 语音交互（6 模式）

| ID | 模式 | 触发 | 测试验证 |
|----|------|------|---------|
| VO-1 | 按住说话 | 长按浮球 / 长按🎤 | 松开后转文字 |
| VO-2 | 点击录音 | 点击🎤 | 再次点击停止 |
| VO-3 | 双工模式 | 点击 ⇄ 切换 | 持续监听 |
| VO-4 | Realtime Voice | 自动（有 instanceId） | 实时对话 |
| VO-5 | 取消录音 | 点击 ✕ / Escape | 录音取消 |
| VO-6 | TTS 播放 | AI 回复后自动 | 语音播放 |

---

## 6. 设置面板（20+ 项）

| ID | 设置项 | 类型 | 测试验证 |
|----|--------|------|---------|
| ST-1 | Auto-play TTS | Toggle | 切换后生效 |
| ST-2 | Wake Word 开关 | Toggle | 切换后生效 |
| ST-3 | Wake Word Access Key | Input | 保存后生效 |
| ST-4 | Wake Word 关键词 | Input | 保存后生效 |
| ST-5 | Wake Word 灵敏度 | Input | 保存后生效 |
| ST-6 | Save Wake Word | Button | 保存成功提示 |
| ST-7 | Reset Wake Word | Button | 重置成功 |
| ST-8 | Light Mode | Toggle | 主题切换 |
| ST-9 | Language 选择 | Dropdown | 语言切换 |
| ST-10 | AI Model | Dropdown | 模型切换 |
| ST-11 | Start on Login | Toggle | 自启动设置 |
| ST-12 | Computer Use | Toggle | 开关 |
| ST-13 | Browser Control | Toggle | 开关 |
| ST-14 | Select Workspace | Button | 文件夹选择器 |
| ST-15 | Workspace Path | Input | 路径输入 |
| ST-16 | Use Path | Button | 保存路径 |
| ST-17 | Local Model 下载 | Button(s) | 下载进度 |
| ST-18 | Import VRM | Button | 文件选择 |
| ST-19 | Reset VRM | Button | VRM 清除 |
| ST-20 | Floating Style (Living Pet / Abstract) | Button pair | 浮球样式切换 |
| ST-21 | Check for Updates | Button | 检查更新 |
| ST-22 | Install Update | Button | 安装更新 |
| ST-23 | Log Out | Button | 登出 |

---

## 7. 登录面板（12 项）

| ID | 元素 | 测试验证 |
|----|------|---------|
| LG-1 | 📱 扫码 Tab | QR 码显示 |
| LG-2 | 📧 邮箱 Tab | 邮箱输入框 |
| LG-3 | 🔗 第三方 Tab | OAuth 按钮 |
| LG-4 | QR 码 | 可扫描 |
| LG-5 | 刷新二维码 | 新 QR 生成 |
| LG-6 | Email 输入 | 可输入 |
| LG-7 | 发送验证码 | 发送成功 |
| LG-8 | 验证码输入 | 可输入 |
| LG-9 | 登录 | 登录成功 |
| LG-10 | Google OAuth | 跳转 Google |
| LG-11 | Discord OAuth | 跳转 Discord |
| LG-12 | Skip as Guest | 进入访客模式 |

---

## 8. 25 个可打开面板

每个面板至少需要测试：**打开 → 内容加载 → 关闭**

| ID | 面板 | 打开方式 | 内部交互数 |
|----|------|---------|:----------:|
| PL-1 | AgentEconomyPanel | MM-3 / 右键 | 6 Tab + 内部按钮 |
| PL-2 | WorktreePanel | MM-1 | Git 操作 |
| PL-3 | SkillCanvasPanel | MM-2 | 技能可视化 |
| PL-4 | TaskLogPanel | MM-4 | 日志列表 |
| PL-5 | MemoryPanel | MM-5 | 记忆查看 |
| PL-6 | DreamPanel | MM-6 | 梦境任务 |
| PL-7 | PluginPanel | MM-7 | 插件列表 |
| PL-8 | MemoryWikiPanel | MM-8 | Wiki 编辑 |
| PL-9 | McpPanel | MM-9 | MCP 服务器管理 |
| PL-10 | CrossDevicePanel | TB-8 | 设备列表 |
| PL-11 | TaskWorkbenchPanel | TB-9 | 检查点 + 变更 |
| PL-12 | DeepOsPanel | TB-10 | 本地优先 |
| PL-13 | PetCreatorPanel | RM-10 | 3 模式 + 提交 |
| PL-14 | SoulPicker | RM-11 | 6 族群 + 卡片 |
| PL-15 | WardrobePanel | RM-12 | 皮肤网格 + 装备 |
| PL-16 | PetGrowthDashboard | RM-13 | 成长数据 |
| PL-17 | PetAchievementWall | RM-14 | 成就列表 |
| PL-18 | PetMemoryAlbumPanel | RM-15 | 相册 |
| PL-19 | PetMinigamePanel | RM-16 | 小游戏 |
| PL-20 | PetBreedingPanel | RM-17 | 繁育 |
| PL-21 | VideoStudioPanel | RM-9 | 视频生成 |
| PL-22 | SocialPanel | RM-2/3/4 | 3 Tab |
| PL-23 | CreatorStudioHub | RM-5 | 创作中心 |
| PL-24 | MarketplaceBrowser | 衣柜→市场 | 浏览+购买 |
| PL-25 | PetCompanionWindow | 菜单→桌宠 | 独立窗口 |

---

## 9. 性能测试项

| ID | 测试项 | 标准 |
|----|--------|------|
| PF-1 | 本地 LLM 首 token 延迟 | < 3s (3B 模型) |
| PF-2 | 云端 LLM 首 token 延迟 | < 2s |
| PF-3 | 语音识别延迟（STT） | < 2s |
| PF-4 | TTS 播放延迟 | < 1s |
| PF-5 | VRM 渲染帧率 | ≥ 30fps @ 1080p |
| PF-6 | PetCreator 提交后进度反馈 | < 5s |
| PF-7 | 窗口切换响应 | < 300ms |
| PF-8 | 面板打开响应 | < 500ms |
| PF-9 | 文件树加载 | < 2s (1000 文件) |
| PF-10 | Marketplace 首屏加载 | < 3s |

---

## 下一步

- [ ] Step 2：为每个元素定义详细测试用例 + 通过/失败标准
- [ ] Step 3：编写 Playwright 自动化脚本
- [ ] 移动端 UI 审计
- [ ] Web 端 UI 审计
