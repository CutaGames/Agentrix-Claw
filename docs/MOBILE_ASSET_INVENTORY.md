# 移动端全域资产盘点与重构洞察

> **日期**: 2026-03-27 | **定位**: 移动端全维度功能拓扑图 & 架构反思

---

## 💥 核心发现：为什么当前的“2个Tab+悬浮球”感到别扭？

通过对源码路由（`AgentStackNavigator`、`DiscoverStackNavigator`、`MeStackNavigator`）的深度扫描，我们发现了一个巨大的架构失衡：

*   **现行架构假定**：Agent 只是个“陪聊机器人”（所以沉浸式对话够了，挂个悬浮球即可）。
*   **代码真实体量**：但在 `AgentStackNavigator` 下，**竟潜藏着高达 27 个重度管理页面**！包括设备物联、工作流、记忆集、权限管理、多云部署等核心级硬核能力。
*   **当前尴尬现状**：这 27 个支撑 Agentrix 作为“平台”的灵魂页面，**现在全靠 `Profile` (我的) -> `Agent Management` 这个深达 3 级的菜单入口在苦苦支撑**。它就像把一辆 Tesla 的中枢控制台，塞在了后备箱的夹层里。

---

## 🗺️ 全维度移动端资产拓扑图

盘点后，Agentrix 移动端实际包含 **四大核心航母群 (共计约 55 个核心页面)**：

### 1. 🤖 智能体管理中枢流 (The Agent Console) —— *当前被严重降级*
目前代码位于 `screens/agent/` 和 `screens/onboarding/`，**体量最大，逻辑最深**：
*   **部署与接入网络**: 
    *   DeploySelect, CloudDeploy, LocalDeploy, ConnectExisting, OpenClawBind, Scan
*   **核心管控 (Console 面板包含)**:
    *   Instance Status (多实例切换、Token量/存储配额看板)
    *   Permissions (独立支付、搜索、截图权限控台)
*   **能力与外延装备**:
    *   SkillInstall, SkillPack (能力包管理)
    *   DesktopControl (反向控制 PC 桌面)
    *   WearableHub, WearableMonitor (穿戴设备与外设阵列)
*   **数据与逻辑中心**:
    *   MemoryManagement (长期记忆图谱)
    *   WorkflowList, WorkflowDetail (工作流引擎)
    *   AgentLogs (智能体运转日志)
*   **团队与协作**:
    *   TeamSpace, TeamInvite, AgentSpace

### 2. 💬 AI 即时通讯流 (The Conversational Core) —— *当前主推入口*
*   **全域召唤点**: 悬浮球 (Tap: 打字, Longpress: 语音面板/对讲)
*   **沉浸式消费端**: 
    *   AgentChat (多会话文字+多模态交互)
    *   VoiceChat (全局双工通话模块)
    *   *特点：目前承载了主要的唤醒量，但它只是 Agent 价值的“表象展示”。*

### 3. 🌍 发现与市场流 (Discover & Market) —— *独立 Tab*
目前代码位于 `screens/discover/`、`screens/market/`、`screens/social/`：
*   **技能商业化 (Skill Market)**: Marketplace, ClawSkillDetail, Checkout
*   **任务商业化 (Task Market)**: TaskMarket, TaskDetail, PostTask
*   **社区分发 (Social Feed)**: Feed, PostDetail, UserProfile, SocialListener

### 4. 👤 构建者资产流 (Me & Asset) —— *独立 Tab*
代码位于 `screens/me/`、`screens/notifications/`：
*   **身份与基础**: Profile, Settings, Account, Notifications
*   **Web3 资产层**: WalletConnect, WalletSetup, WalletBackup (钱包流)
*   **平台变现层**: ReferralDashboard (分润), MyOrders, APIKeys (开发者额度)

---

## 🧠 下一步重构方向提案

明确了庞大的底层资产后，我们不能再用“社交工具”或“纯对话助手”的思路框死导航。Agentrix 是一款 **"Agent Operating System (智能体操作系统)"**。

基于全域视角，提出三个全新底层导航重构流派以供定夺：

### 方案 A：恢复 3 Tab (重申“工作台”地位，解救 Console) 🌟推荐
**[ 🌍 发现 ]  ——  [ 🎛️ 工作台 (Console) ]  ——  [ 👤 我的 ]**
*   **悬浮球**：保留，作为去往 Chat/Voice 的全局快捷黑洞（类似钢铁侠的 Jarvis 随时待命）。
*   **中间 Tab (工作台)**：直接渲染原本庞大的 `AgentConsoleScreen`！首屏就能看到 Token 仪表盘、当前 Agent 正在跑哪些 Workflow、连了哪些 Wearables。
*   **为什么好**：Chat 是过程，Console 才是本体。“工作台”放中间才符合 AI 生产力平台的用户心智模型。Chat 可以挂载在 Console 的右上角和全局悬浮球里。

### 方案 B：抽屉式左右域 (The Spatial Approach)
**[ 底栏 2 Tab: 发现 | 会话聚合流 ]**
*   **左侧滑抽屉 (Left Drawer)**：`Agent 面板` —— 任何页面右划，拉出庞大的 Agent 部署列表、工作流和组件库。（工程师最爱，极客感强）
*   **右侧滑抽屉 (Right Drawer)**：`我的账户` —— 左划出个人设置、钱包和分润系统。
*   **为什么好**：屏幕利用率最大，Tab 彻底留给信息流和通讯流。缺点是教育成本略高，用户需明白侧滑。

### 方案 C：控制台与聊天强耦合 (The Notion/Discord Approach)
**[ 底栏 2 Tab: 智能体 | 我的 ]  (把 Discover 降级或融入社区)**
*   全屏交给 Agent：进入【智能体】Tab 就是 Chat 页面，但在 Chat 页面的头部（或整体下拉）下拉刷新，拉出一个巨大的负一屏，里面装满 `AgentConsole` 的 27 个管理小组件。
*   **优势**：交互炫酷，但实现起来手势冲突容易成为痛点。

---

### 您的选择倾向？
在盘点出这 55+ 页面的真实结构后，**您是否倾向于采用【方案 A】**，把庞大、硬核、极客的 `AgentConsole` (及其麾下的 工作流、设备、记忆管理) 重新放回底部 **中间 Tab (工作台) 的 C 位**？ 

而在屏幕上飞舞的悬浮球则专门负责“对话与使唤”？