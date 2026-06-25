# Pet Phase 6 — Cross-Platform Manual Smoke Checklist (2026-05-09)

This complements the automated `_pet_full_e2e.sh` script (33/33 pass on
prod). Items below are GUI-only or require interactive desktop / mobile
hardware and cannot be exercised over plain HTTP.

## Build artifacts to verify

- Desktop `.exe` installer:
  `desktop/src-tauri/target/release/bundle/msi/Agentrix_*.msi`
  or `bundle/nsis/Agentrix-Setup_*.exe`
- Android APK:
  `android/app/build/outputs/apk/release/app-release.apk`

## Desktop manual smoke (Windows .exe)

Pre-condition: install the freshly built MSI/NSIS, sign in via passkey or
JWT against `https://api.agentrix.top/api`.

| ID | 用例 | 期望 |
|---|---|---|
| D-01 | 启动后右下角桌宠出现 | 桌宠窗口可见，正在 idle 动作 |
| D-02 | 桌宠 ~5s 后自动漫游 | 沿贝塞尔路径平滑移动；P2-1 偶尔停留在右下/左下/右上锚点 |
| D-03 | 鼠标拖拽桌宠 | 漫游暂停，跟随光标；松开后可继续 |
| D-04 | 多显示器：拖到副屏 | `chooseBoundsForCursor` 跟随，活动屏切换 |
| D-05 | 右键桌宠 → 菜单 | 显示 voice / chat / sleep / hide / pet center |
| D-06 | 双击桌宠 → 打开主窗口 | Pet Center / Chat 主窗口浮现 |
| D-07 | 主窗口聊天 → 流式回复 | 字符流式渲染，无卡顿；命中 `/openclaw/proxy/:id/stream` 或 `/claude/chat` |
| D-08 | 工具调用（如 web_search） | 工具卡片渲染 → 用户审批 → 工具结果回流 |
| D-09 | Computer Use（截屏 / 点击）| 桌面有截屏权限提示 → 工具结果含截图 base64 |
| D-10 | 衣柜 → 浏览皮肤 → 试穿 | 商店列表加载；试穿即时改变桌宠外观 |
| D-11 | 安装免费皮肤 | 200 OK；entitlements `can_install_paid_skin` 仍按 tier |
| D-12 | 安装付费皮肤无 orderId | 拒绝：`payment_required` |
| D-13 | 迷你游戏 → 提交分数 | `intimacyXpAwarded` + `energyAwarded` 返回；presence:pet.energy 立即广播桌面 |
| D-14 | 主动陪伴气泡 | 30s 内桌宠右上方出现气泡；点击 ack/dismiss → 状态写入 |
| D-15 | 接收远程社交 visit/feed | presence:pet.social.visit 进入桌面消息中心 |
| D-16 | 关闭主窗口后 tray icon | 仍存在；右键有 quit / show |
| D-17 | 重启 .exe | passkey 自动登录；桌宠状态从后端 hydrate |

## Mobile manual smoke (Android APK)

| ID | 用例 | 期望 |
|---|---|---|
| M-01 | 安装 APK 启动 | 登录页加载，可走 passkey 或邮箱 |
| M-02 | 进入聊天 → 发消息 | SSE 流式，工具调用同步可见 |
| M-03 | 进入 Pet Center | 当前情绪、亲密度、能量条显示 |
| M-04 | 衣柜浏览 + 搜索 q= | 列表过滤生效（P2-4） |
| M-05 | 提交迷你游戏分数 | energy 增量 toast；列表刷新 |
| M-06 | 拜访其他宠物公开页 → feed | 200；自身收到 presence:pet.social.visit toast |
| M-07 | 主动陪伴 inbox | 历史 + ack/dismiss 可操作 |
| M-08 | 切换到后台 60s 再回前台 | hydration：pet/state 重新拉取且 socket 自动重连 |

## 已用自动化覆盖

`_pet_full_e2e.sh` 在生产环境用真实 user UUID 跑通：

- §A 账号 + entitlements (3)
- §B chat path parity (2)
- §C soul + skin + marketplace + P2-4 (5)
- §D proactive + P1-4 (4)
- §E achievements + memories + snapshot/timeline P1-5/P2-3 (4)
- §F minigames + energy (3)
- §G breeding (2)
- §H public card + P2-6 social full flow (8)
- §I auth + presence reachability (2)

Total: **33/33 PASS**.

## 已知边界（需要 GUI 验证）

- 桌宠右键菜单的具体项位置、菜单分隔（不在 HTTP API 范围内）
- Rive 表情切换的 ≤120ms transition budget（需要打开桌宠 + 打字测情绪）
- Tauri 打包 .exe 的 SmartScreen 警告（首装 .exe 后右上 SmartScreen 信任流程）
- Android 后台被系统杀回前台的 hydration 行为
- `Computer Use` 所需的 Tauri permissions / Windows accessibility 提示
