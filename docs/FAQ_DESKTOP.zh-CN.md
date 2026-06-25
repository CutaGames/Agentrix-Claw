# Agentrix Desktop FAQ

> 常见问题 20+ 条。如果你的问题不在这里，请提交到群里或 `support@agentrix.top`。
> 配套：[完整用户手册](USER_MANUAL_DESKTOP_V4.zh-CN.md)
> 适用版本：v0.2.0+

---

## 安装类

### Q1：双击安装包出现红色 SmartScreen，怎么办？

**A**：v0.2.x 内测期间没有代码签名，会被 Windows SmartScreen 拦截。操作：
1. 点击 **更多信息**（**不是**关闭按钮）
2. 出现 **仍要运行** 按钮
3. 点击它，进入 NSIS 安装向导

下个版本（v0.2.1+）会做 Azure Trusted Signing 签名，届时不再有此提示。

### Q2：能否装到 D 盘 / 自定义路径？

**A**：当前 NSIS 默认装到 `%LOCALAPPDATA%\Programs\Agentrix Desktop\`，不支持自定义。如果你确实需要装到其他盘：
1. 先正常安装到默认路径
2. 把整个 `Agentrix Desktop` 文件夹移到目标盘
3. 用 `mklink /J` 创建软链接到原位置

### Q3：杀毒软件拦截怎么办？

**A**：360 / 火绒 / Avast 等可能误报为 "未知发布者"。临时关掉杀毒后安装；安装完成后把 `agentrix-desktop.exe` 加到杀毒白名单。

签名版本（v0.2.1+）后这个问题会减轻。

### Q4：缺少 WebView2 怎么办？

**A**：安装器会自动下载 WebView2 运行时（约 100 MB）。如果自动下载失败：
1. 手动下载：[Microsoft WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
2. 安装 Evergreen Bootstrapper（推荐）
3. 重新双击 Agentrix Desktop setup.exe

### Q5：怎么完全卸载？

**A**：
1. 控制面板 → 程序 → 卸载 → "Agentrix Desktop"
2. 手动删除 `%APPDATA%\Agentrix Desktop\`（保存了配置 / 缓存 / 崩溃日志）
3. 可选：删除 `%LOCALAPPDATA%\Programs\Agentrix Desktop\`（残留）

---

## 启动类

### Q6：启动后黑屏 / 卡 splash？

**A**：可能是网络初始化超时。
1. 等 5-10 秒（首次启动会做 token 检查）
2. 还是不行：`Ctrl + Shift + I` 打开 DevTools，看 Console 红色错误
3. 截图反馈到群里

### Q7：窗口变成 80×80 隐形方块？

**A**：v0.2.0 已修复。如果还遇到：
1. 任务管理器杀掉 `agentrix-desktop.exe`
2. 删 `%APPDATA%\Agentrix Desktop\config.json`
3. 重启

### Q8：启动很慢（> 5 秒）？

**A**：通常是首次启动需要下载本地模型（Local LLM tier）。如果只用云端 tier：
- 设置 → Local LLM → 关闭自动下载

---

## 登录类

### Q9：邮箱验证码收不到？

**A**：
1. 检查垃圾邮件 / 推广邮件
2. Gmail 需要等几秒（不是即时）
3. 联系运营手动触发：`support@agentrix.top` 提供你的邮箱

### Q10：移动端二维码扫不上？

**A**：
- Agentrix Mobile App 需要 v1.0+，老版本不兼容
- 二维码 5 分钟过期；过期后点 "刷新"
- 移动端必须先登录后才能扫

### Q11：钱包连不上？

**A**：
- MetaMask：解锁后重试（锁屏状态下连接会失败）
- WalletConnect：用 v2 协议；老版本钱包可能不兼容
- 网络要求：你的钱包 RPC 能访问到 `api.agentrix.top`

---

## 浮球类

### Q12：浮球被任务栏遮挡？

**A**：
- 拖动浮球到屏幕中央
- `Ctrl + Space` 切到 Living 模式重置位置
- 设置 → Behavior → "Always on top" 确保打开

### Q13：浮球跑到副屏外了？

**A**：v0.2.0 启动时自动检测并归位到主屏右下角。如果不工作：
1. 把副屏插回去
2. 把浮球拖到主屏
3. 拔副屏

### Q14：多显示器 DPI 错位？

**A**：v0.2.0 已修复（validate_ball_position）。如果你的设置：
- 主屏 100% / 副屏 150%（混合）
- 切换主屏时浮球位置错位

提交 issue 附 `desktop_bridge_get_monitors` 输出（DevTools 命令行执行）。

### Q15：双击浮球没反应？

**A**：
1. 浮球可能在 thinking 状态（数据流光环加速）；等几秒
2. WebView2 卡死：任务管理器看 `agentrix-desktop.exe` 是否 100% CPU
3. 解决：重启应用

---

## 对话类

### Q16：本地模型报错 "Model not found"？

**A**：本地模型未下载。
1. 设置 → Local LLM → "Download Gemma-4 7B"（约 4 GB）
2. 等下载完成（5-15 分钟，看带宽）
3. 重启应用

### Q17：流式回复中途断开？

**A**：
- 网络抖动：点消息底部 "重试" 按钮
- Token 过期：会自动刷新；如果还不行，重新登录
- 模型限流：等 1 分钟再试，或换 Tier 到 "云端"

### Q18：工具调用卡住怎么办？

**A**：
- 标题栏 More → Work Log → 找到运行中的工具 → 点 "Cancel"
- 或者直接 `Esc` 中断当前流式

### Q19：模型说自己是 Gemini / Claude / GPT 等错误身份？

**A**：v0.2.0 已通过 system prompt 修复。如果你还遇到：
- 截图聊天上下文
- 截图 "view source" → 找 system messages
- 提交到 issue + 模型 ID

---

## 萌宠类

### Q20：3D 灵狐没渲染（只看到 SVG 占位）？

**A**：你的 GPU tier 可能是 `light` 或 `unsupported`（系统自动检测）。这是预期降级。
- 设置 → About → 看 GPU tier
- 如果你的 GPU 实际很强但被识别为 light，提交 issue 附 `agentrix_hardware_profile_v1` localStorage 内容

### Q21：切 Pro Mode 灵狐没变？

**A**：
- 等几秒：VRM 文件下载需要时间
- 网络慢：会自动降级 PNG（看 DevTools Network）
- 如果不切：设置 → Reset Pet（待补 UI）；或 `localStorage.removeItem('agentrix_pet_vrm_url')` + 重启

### Q22：衣柜里没有任何皮肤？

**A**：默认应该绑定一只 Kitsune 灵狐。如果没有：
1. 重启应用（auth.service.ts 会重新 bind）
2. 还是没有：联系运营帮你 manual bind
3. 也可以 `右键 → 设置 → Reset Default Pet`（待补 UI）

---

## 经济类

### Q23：AXP 签到没增加？

**A**：
- 检查 token 没过期（重新登录）
- 看通知中心是否有 "签到失败" 提示
- 后端可能 rate-limit（同 device 24h 只能签到一次）

### Q24：余额不显示？

**A**：
- AgentEconomyPanel → Overview → 看是否 "Loading..." 卡住
- 检查 token；用 `/agent-presence/agents` API 看是否返回正确 agent
- 如果是 0 余额且没创建主宠：点击空状态 CTA 创建（v0.2.0 修复）

### Q25：自创皮肤上架失败？

**A**：
- 必须是你自己 `source='user'` 的皮肤（系统皮肤不能上架）
- 标题 / 描述 / 价格必填
- AXP 价格 ≥ 100；USD 价格 ≥ 0.99
- 看通知中心错误详情

---

## 自动更新类

### Q26：通知不弹？

**A**：
- 灰度发布：可能没轮到你（10% / 50% / 100% 三阶段）
- 检查频率：每次启动后 30 秒检查一次
- 手动检查：右键 → 设置 → About → "Check for Updates"

### Q27：下载失败？

**A**：
- 网络问题：下次启动会自动重试
- 签名验证失败：v0.2.x 期间用我们的 ed25519 公钥；如果失败，下载链接被劫持，**不要忽略**
- 提交 issue 附错误 toast 截图

### Q28：怎么回滚到旧版本？

**A**：
1. 卸载当前版本（保留 `%APPDATA%`）
2. 从 `agentrix.top/downloads/desktop/archive/` 下载老版本
3. 安装

> Note：跨大版本回滚（如 v1.0 → v0.2）可能因为 schema 变化无法工作。

---

## 隐私类

### Q29：遥测怎么关？

**A**：
- 默认就是关的（v0.2.0+）
- 设置 → Privacy → "发送匿名使用数据" → OFF
- 验证：DevTools → Network → Filter "analytics"；启动后无请求

### Q30：崩溃报告能否关掉？

**A**：v0.2.0 暂不支持。崩溃报告**只携带设备指纹哈希 (SHA256)**，**不携带任何用户内容 / 文件路径 / 个人信息**（路径已 sanitize 为 `<user>`）。

如果你坚持要关，编辑 `%APPDATA%\Agentrix Desktop\config.json`：
```json
{ "agentrix_crash_optout": "1" }
```
（待 v0.2.2 提供 UI 开关）

### Q31：想删除历史数据？

**A**：
1. 在 Settings → About 找到你的 device_id
2. 邮件 `privacy@agentrix.top`，标题 "Data Deletion Request"
3. 我们会在 7 天内从 `agentrix_desktop.crash_records` / `analytics_events` 中删除你的记录

---

## 反馈渠道

| 类型 | 渠道 |
|------|------|
| Bug 报告 | [GitHub Issues](https://github.com/CutaGames/Agentrix/issues) |
| 功能建议 | Telegram 群 / Discord `#feature-requests` |
| 紧急问题 | `support@agentrix.top`（24h 内回复） |
| 隐私 / 数据 | `privacy@agentrix.top` |
| 商务合作 | `bd@agentrix.top` |
