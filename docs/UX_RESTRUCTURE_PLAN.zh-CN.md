# Agentrix 端侧体验全局重构 — 评估 & 实施计划

最新配套文档：
- 用户手册：`docs/AGENTRIX_USER_MANUAL.zh-CN.md`
- QA 检查清单：`docs/QA_RELEASE_CHECKLIST.zh-CN.md`

> 核心原则：**复杂能力后台化，端侧交互极简化，跨屏互联无感化**

---

## 一、当前问题诊断（基于代码审计）

### 移动端核心问题

| # | 问题 | 代码位置 | 严重度 |
|---|------|----------|--------|
| M1 | **首屏不是对话**。Agent Tab 首屏是 `AgentConsoleScreen`（运维仪表盘），用户需 2 次点击才到对话 | `AgentStackNavigator.tsx:48` → `AgentConsoleScreen` | 🔴 致命 |
| M2 | **Onboarding 过重**。新用户无 Agent 时看到空状态 + "Deploy/Connect" 按钮，不知道该干什么 | `AgentConsoleScreen.tsx:208-221` | 🔴 致命 |
| M3 | **对话页顶栏过载**。同时暴露 Live/Basic 切换、🔊音量、模型选择、新建按钮 | `AgentChatScreen.tsx:1009-1047` | 🟡 高 |
| M4 | **ThoughtChain 默认展开**。工具调用日志占满屏幕，普通用户看不懂 | `AgentChatScreen.tsx:234-271` | 🟡 高 |
| M5 | **Token 能量条永久显示**。对话页顶部始终有 token 用量条，干扰阅读 | `AgentChatScreen.tsx:1049-1053` | 🟡 中 |
| M6 | **模型切换用全屏 Modal**。打断对话沉浸感 | `AgentChatScreen.tsx:1313-1372` | 🟡 中 |
| M7 | **底部 4 Tab 分散注意力**。Agent/Explore/Showcase/Me，Social Tab 对新用户意义不大 | `MainTabNavigator.tsx:61-94` | 🟡 高 |
| M8 | **Agent 内部页面过多**。AgentStack 注册了 25+ 个 Screen | `AgentStackNavigator.tsx:47-76` | 🟡 中 |
| M9 | **没有全局悬浮球**。无法跨应用/跨页面快速唤起对话 | 不存在 | 🔴 致命 |
| M10 | **对话历史无多会话管理**。桌面端有 Tab，移动端没有 | `AgentChatScreen.tsx` 无 Tab | 🟡 中 |

### 桌面端核心问题

| # | 问题 | 代码位置 | 严重度 |
|---|------|----------|--------|
| D1 | **已经有悬浮球 + ChatPanel 双窗口**，基础架构好 | `App.tsx:211-300` (floating-ball), `App.tsx:303-329` (chat-panel) | ✅ |
| D2 | **缺少 Spotlight 模式**。当前 ChatPanel 是完整窗口，不是轻量对话框 | `ChatPanel.tsx` — 1351 行完整面板 | 🟡 高 |
| D3 | **全局快捷键已有但不够**。有 Ctrl+Shift+S（面板） + Ctrl+Shift+A（语音），缺少 Cmd/Ctrl+K | `App.tsx:136-165` | 🟡 中 |
| D4 | **没有选中文本上下文获取**。桌面端最大差异化能力缺失 | 不存在 | 🟡 高 |
| D5 | **WebView 内存未回收**。ChatPanel 隐藏后仍占用资源 | `lib.rs` — 无 suspend 逻辑 | 🟡 中 |
| D6 | **剪贴板监听已有**，但跨端同步未完成 | `clipboard.ts` — 本地监听 | 🟡 低 |

---

## 二、重构方案与你原方案的对比

### 移动端导航：你提议 3 Tab vs 我建议 2 Tab + 悬浮球

**你的方案**：`主控对话` / `万物互联` / `我的记忆` 三 Tab
**我的方案**：`发现` / `我的` 两 Tab + **全局悬浮球→对话**

理由：
1. 对话不该被锁在某个 Tab 里。它是**随时随地的入口**，应该是悬浮球。
2. "万物互联"的设备管理对 90% 用户低频，放在"我的"二级入口即可。
3. 两 Tab 让底部导航极简，视觉重心自然被悬浮球吸引。

```
┌────────────────────────────────┐
│                                │
│   (页面内容)                    │
│                                │
│                     ┌───┐      │
│                     │ 🤖│ ← 悬浮球（点击→语音胶囊/对话面板）
│                     └───┘      │
├────────────┬───────────────────┤
│  🔍 发现   │     👤 我的       │  ← 底部 2 Tab
└────────────┴───────────────────┘
```

### 关于各项提议的评估明细

| 你的提议 | 采纳 | 说明 |
|----------|------|------|
| 一键技能快充 | ✅ 采纳 | 新用户自动创建 Agent + 预装核心技能包 |
| 意图无感路由 | ✅ 采纳 | 后端已有 Skill 路由机制，前端只需去掉插件切换 UI |
| 主界面只留沟通 | ✅ 采纳 | chatBar 精简为 Agent 名 + 设置齿轮 |
| UI 组件呼吸化 | ✅ 采纳 | ThoughtChain → 动态胶囊，默认折叠 |
| 抛弃全屏 Modal | ✅ 采纳 | 模型切换 / 设置 → Bottom Sheet |
| 悬浮球全局化 | ✅ 采纳 | 提到 App 根级，覆盖所有 Tab |
| 语音胶囊 (Voice Pill) | ✅ 采纳 | 悬浮球长按→半透明语音面板 |
| 多模态环境感知 [识屏] | ⚠️ 延后 | 需要无障碍权限（Android）或 Screen Time API（iOS），隐私审核风险高，v2 |
| 全双工 VAD | ✅ 已有 | `SileroVAD` 已实现（Phase 2-6），需接入前端 |
| WatermelonDB | ❌ 不采纳 | 过重。用 **MMKV** 替换 AsyncStorage 即可 |
| mDNS 局域网发现 | ⚠️ 低优先 | 技术可行，但用户场景有限，Sprint 8 |
| Spotlight 全局唤出 | ✅ 采纳 | 桌面端最高优先级差异化 |
| 选中文本分析 | ✅ 采纳 | Tauri 已有 `get_selected_text` 能力 |
| 文件拖拽 | ✅ 部分已有 | ChatPanel 已支持拖拽，需扩展到 Spotlight |
| 本地大模型 Ollama | ⚠️ 延后 | 安装包膨胀问题，做成可选插件 |
| RPA 脚本执行 | ❌ 延后到 v2 | 安全沙箱尚未建立 |
| WebView 内存回收 | ✅ 采纳 | 隐藏 5 分钟后挂起 WebView |
| 跨端剪贴板 | ✅ 采纳 | 已有基础，需打通 WebSocket 同步 |

---

## 三、完整实施计划（8 个 Sprint）

### Sprint 1：移动端对话首屏化 + 悬浮球全局化 🔴 最高优先

**目标**：打开 App → 直接看到对话（而不是运维面板）

**改动清单**：

1. **`AgentStackNavigator.tsx`** — Agent Tab 首屏改为 `AgentChatScreen`
   ```
   旧: AgentConsole → 点 CTA → AgentChat
   新: AgentChat 即首屏，AgentConsole 降为"设置/管理"入口
   ```

2. **`AgentChatScreen.tsx`** — 无 Agent 时自动触发创建（见 Sprint 2）

3. **创建 `src/components/GlobalFloatingBall.tsx`** — 全局悬浮球组件
   - 悬浮在所有页面之上（`position: absolute` 在 `RootNavigator` 级别）
   - 单击 → 跳转对话（若不在对话页）或切换语音模式（若已在对话页）
   - 长按 → 弹出语音胶囊（Voice Pill）半透明面板
   - 可拖动到屏幕边缘吸附
   - 状态指示：idle(紫)、listening(绿脉冲)、thinking(橙旋转)、speaking(蓝波浪)

4. **`RootNavigator.tsx`** — 在导航容器外层挂载悬浮球
   ```tsx
   <NavigationContainer>
     <MainTabNavigator />
     <GlobalFloatingBall /> {/* 覆盖所有页面 */}
   </NavigationContainer>
   ```

**影响范围**：`AgentStackNavigator.tsx`, `RootNavigator.tsx`, 新增 `GlobalFloatingBall.tsx`
**预估工时**：2-3 天

---

### Sprint 2：Agent 自动化 — 零配置开箱即用

**目标**：新用户注册后 0 步骤直达对话

**改动清单**：

1. **后端 `POST /openclaw/auto-provision`** — 自动创建 Cloud Agent
   - 新用户首次进入 Agent Tab 时调用
   - 自动创建免费 Cloud 实例 + 预装核心技能包（搜索、文件解析、日程、天气）
   - 返回 `instanceId` 直接设为 activeInstance

2. **`AgentChatScreen.tsx`** — 无 Agent 时 inline 引导
   ```
   旧: 空状态页 → "Deploy/Connect Agent" 按钮
   新: 全屏友好引导 → "Hi! 我是你的 AI 助手，正在准备中..." → 自动创建 → 直接开聊
   ```

3. **`useSettingsStore.ts`** — 去掉 Onboarding Checklist
   - 3步 checklist 改为后台静默完成（Deploy → auto, Skill → 预装, Workflow → optional）

**影响范围**：后端新增 1 个 endpoint，`AgentChatScreen.tsx`, `AgentConsoleScreen.tsx`
**预估工时**：2 天

---

### Sprint 3：对话页极简化

**目标**：对话页只有消息和输入框，其他全部收起

**改动清单**：

1. **chatBar 精简**（`AgentChatScreen.tsx:1009-1047`）
   ```
   旧: [🤖 Agent名] [Live/Basic] [🔊] [模型选择▼] [新建]
   新: [← 返回] [🤖 Agent名]           [⚙️]
   ```
   - `⚙️` 点击 → 展开 Bottom Sheet（包含：模型切换、音色、Live/Basic 切换、新建对话）
   - Token 能量条移入 Bottom Sheet

2. **ThoughtChain 改为动态胶囊**（`AgentChatScreen.tsx:234-271`）
   ```
   旧: 展开的多行执行日志列表
   新: 消息气泡上方的单行胶囊
        "🔍 正在搜索相关信息..." → 点击展开详细日志
        "📄 正在分析文档..." → 点击展开
   ```
   - `isThoughtsExpanded` 默认改为 `false`
   - 胶囊只显示最后一条 thought 的摘要

3. **模型选择 Modal → Bottom Sheet**（`AgentChatScreen.tsx:1313-1372`）
   - 将 `<Modal visible={showModelPicker} transparent animationType="slide">` 改为半屏抽屉

4. **附件工具栏优化**（`AgentChatScreen.tsx:1131-1150`）
   - 保持当前的 `+` 号面板设计（已经不错）
   - 加入"语音转文字"快捷入口

**影响范围**：`AgentChatScreen.tsx` 大幅修改
**预估工时**：3 天

---

### Sprint 4：导航重构 — 2+1 结构

**目标**：底部 Tab 极简化，对话入口悬浮球化

**改动清单**：

1. **`MainTabNavigator.tsx`** — 4 Tab → 2 Tab
   ```
   旧: Agent(🤖) | Explore(🛒) | Showcase(🌐) | Me(👤)
   新: Discover(🔍) | Me(👤)
   ```
   - **Discover Tab**：合并 Explore + Showcase + 技能推荐
   - **Me Tab**：合并 Profile + Settings + Agent 管理 + 设备管理

2. **`AgentConsoleScreen.tsx` → `AgentManageScreen.tsx`** — 降级为"我的"内二级页
   - 保留实例管理、技能管理、日志查看等高级功能
   - 只有"专业模式"或手动进入才可见

3. **`types.ts` → `MainTabParamList`** — 更新
   ```ts
   export type MainTabParamList = {
     Discover: undefined;
     Me: undefined;
   };
   ```

4. **创建 `DiscoverScreen.tsx`** — 合并探索首页
   - 技能推荐卡片 + 社区展示 + 搜索入口
   - 简洁的卡片布局，向上滑动浏览

**影响范围**：`MainTabNavigator.tsx`, 新增 `DiscoverScreen.tsx`, `types.ts`
**预估工时**：3 天

---

### Sprint 5：桌面端 Spotlight 模式 🔴 最高优先

**目标**：Cmd/Ctrl+K 在任何应用上方弹出极简对话框

**改动清单**：

1. **`lib.rs`** — 注册 `CmdOrCtrl+K` 全局快捷键
   - 创建新 WebView 窗口 `spotlight`（无边框、半透明、居中、小尺寸 600x400）
   - 按 Esc 或失去焦点自动隐藏

2. **`lib.rs`** — 新增 `spotlight` 窗口配置
   ```rust
   // Spotlight 窗口属性：
   // - 无标题栏、透明背景
   // - 始终置顶 (always_on_top)
   // - 居中显示，宽 600 高 60 (初始为搜索框，展开为对话)
   // - 高斯模糊背景 (Windows: Mica/Acrylic, macOS: NSVisualEffectView)
   ```

3. **创建 `desktop/src/components/SpotlightPanel.tsx`** — 极简对话框
   - 顶部：搜索/输入框（一行，类似 Raycast）
   - 输入后展开为对话区域（最多 4 条消息预览）
   - 支持 `@` 前缀快捷指令（`@file`, `@web`, `@translate`）
   - Enter 发送，Esc 关闭

4. **`lib.rs`** — 选中文本上下文获取
   ```rust
   #[tauri::command]
   async fn get_selected_text() -> Result<String, String> {
       // Windows: 模拟 Ctrl+C + 读剪贴板
       // macOS: 使用 Accessibility API
   }
   ```
   - Spotlight 打开时自动调用，如果有选中文本就预填到输入框

5. **`App.tsx`** — 增加 `spotlight` windowLabel 分支
   ```tsx
   if (windowLabel === "spotlight") {
     return <SpotlightPanel />;
   }
   ```

**影响范围**：`lib.rs`, `App.tsx`, 新增 `SpotlightPanel.tsx`
**预估工时**：4-5 天

---

### Sprint 6：桌面端系统集成深化

**目标**：让桌面端成为真正的系统级工具

**改动清单**：

1. **SpotlightPanel 文件拖拽** — 拖入任意文件自动上传并分析
2. **WebView 内存回收**（`lib.rs`）
   - `chat-panel` 隐藏后启动 5 分钟定时器
   - 超时后调用 `webview.eval("window.__agentrix_suspend?.()")` 清理前端状态
   - 重新显示时 `webview.eval("window.__agentrix_resume?.()")` 恢复
3. **跨端剪贴板同步**
   - 桌面端剪贴板变化 → WebSocket → 后端 → 推送到移动端
   - 移动端在对话页可"粘贴桌面端内容"
4. **系统通知增强**
   - Agent 后台任务完成时弹出系统通知
   - 点击通知直接打开 Spotlight 并显示结果

**影响范围**：`lib.rs`, `clipboard.ts`, 新增 `suspend.ts`
**预估工时**：3 天

---

### Sprint 7：移动端离线体验

**目标**：首屏秒开、断网可用

**改动清单**：

1. **`react-native-mmkv` 替代 AsyncStorage**
   - 对话历史存储迁移（MMKV 读写速度比 AsyncStorage 快 30x）
   - 用户设置、Token 缓存迁移

2. **对话懒加载**
   - FlatList 只渲染最近 20 条消息
   - 向上滚动时按需加载更多（分页 20 条/批）

3. **离线首屏**
   - 缓存上次对话的最后 5 条消息
   - 断网时显示缓存 + "离线模式" 提示条
   - 支持离线输入，联网后自动发送队列

**影响范围**：全局存储层替换、`AgentChatScreen.tsx`
**预估工时**：3 天

---

### Sprint 8：跨端无感发现

**目标**：手机靠近电脑自动发现桌面端

**改动清单**：

1. **Tauri Rust 侧** — 启动 mDNS 广播
   - 服务名：`_agentrix._tcp.local`
   - 携带：设备名、版本、WebSocket 端口

2. **移动端** — 监听 mDNS 发现
   - 发现局域网桌面端时弹出 Toast："发现 Agentrix 桌面版"
   - 点击后通过局域网 WebSocket 建立直连

3. **一键接管**
   - 移动端正在进行的对话可一键推送到桌面端继续
   - 利用已有的 `VoiceSessionHandoffService` 实现

**影响范围**：`lib.rs`, 新增 `mdns.rs`, 移动端新增发现组件
**预估工时**：4 天

---

## 四、优先级排序 & 时间线

```
Week 1:  Sprint 1 (对话首屏 + 悬浮球) + Sprint 2 (Agent 自动创建)
Week 2:  Sprint 3 (对话页极简) + Sprint 4 (导航重构)
Week 3:  Sprint 5 (桌面 Spotlight)
Week 4:  Sprint 6 (桌面系统集成) + Sprint 7 (离线体验)
Week 5:  Sprint 8 (跨端发现) + 测试修复
```

**第一周交付后用户就能感受到质变**：打开 App 直接对话，悬浮球随时唤起。

---

## 五、不建议做 / 延后到 v2 的项

| 项目 | 原因 |
|------|------|
| WatermelonDB | 过重，MMKV 够用 |
| 本地 Ollama 集成 | 安装包膨胀 500MB+，做成可选下载 |
| RPA 脚本执行 | 安全沙箱未建立，有系统破坏风险 |
| [识屏] 跨应用截图 | Android 无障碍权限审核严格，iOS 不支持 |
| 穿戴设备语音入口 | 用户量太小，优先级最低 |

---

## 六、关键风险

1. **悬浮球权限**：Android 需要 `SYSTEM_ALERT_WINDOW` 权限（应用内悬浮不需要，跨应用需要）。建议 v1 先做应用内悬浮球，v2 再做系统级。
2. **Spotlight 窗口平台差异**：Windows Acrylic / macOS NSVisualEffectView 的实现方式不同，需要条件编译。Tauri 2 的 `window_effects` 插件可处理。
3. **自动创建 Agent 的成本**：每个新用户自动创建 Cloud 实例会增加服务器成本。建议设 TTL：7 天无活动则休眠实例。
4. **导航重构的向后兼容**：深度链接 (`agentrix://agent/chat/...`) 路由需要同步更新。
