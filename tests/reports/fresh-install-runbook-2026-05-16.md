# Fresh-Install Verification Runbook (Sprint G-1 / US-G1-2)

> 把这份 runbook 在 Win 10 + Win 11 各跑一次，结果记到 `fresh-install-<os>-<date>.md`。

## 前置

- 一台干净的 Windows 10 / Windows 11 测试机（或 VM）
- 已构建的 NSIS 安装器：`desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_<version>_x64-setup.exe`
- 测试账号：`zhouyachi2023@gmail.com`（已绑定）

## 自动化部分

```powershell
# 把仓库拉到测试机后：
pwsh desktop\scripts\fresh-install-check.ps1
```

脚本会：
1. 杀死任何运行中的 `agentrix-desktop.exe`
2. 静默卸载已有 Agentrix Desktop
3. 清理 `%APPDATA%\Agentrix Desktop`
4. 静默安装最新 NSIS
5. 启动新装版本
6. 打印人工验证清单

## 人工验证清单

| # | 项 | 预期 | 通过? |
| --- | --- | --- | --- |
| 1 | 窗口在 2 秒内出现 | 不是空白 / 80×80 隐形方块 | [ ] |
| 2 | SplashScreen 短暂可见 | 紫色旋转加载圈 + "Agentrix" 文字 | [ ] |
| 3 | LoginPanel 渲染完整 | 所有图片 / 字体 / 按钮可见 | [ ] |
| 4 | 窗口尺寸 ≥ 480×640 | 不会缩到 80×80 | [ ] |
| 5 | DevTools Network 看 /pets/*.png | 三张图都是 200，不是 404 | [ ] |
| 6 | 邮箱登录成功 | 跳转到 OnboardingPanel | [ ] |
| 7 | OnboardingPanel 流程完成 | 窗口缩到 80×80 + 真实灵狐图 | [ ] |
| 8 | localStorage.agentrix_onboarded_at | 是 unix 时间戳 | [ ] |
| 9 | 浮球右键 → 衣柜 | 在当前窗口弹出衣柜 | [ ] |
| 10 | 任务栏 Agentrix 图标个数 | = 1（不是 2 个） | [ ] |

## 资源 fallback 测试（额外）

| # | 项 | 预期 | 通过? |
| --- | --- | --- | --- |
| 11 | DevTools Network 模拟 /pets/*.png 404 | 浮球退回 SVG fallback，不黑屏 | [ ] |
| 12 | DevTools Network 模拟全部资源离线 | LoginPanel 仍能渲染（不依赖外网 CDN） | [ ] |

## 报告模板

`tests/reports/fresh-install-win11-2026-05-XX.md`：

```markdown
# Fresh-Install 验证报告 — Win 11 (build vXX.X.X)

- 日期：YYYY-MM-DD
- 测试人：xxx
- 设备：xxx
- 通过率：X/12

## 详细结果

| # | 项 | 通过 | 备注 |
| --- | --- | --- | --- |
| 1 | ... | ✅/❌ | ... |
...

## 截图（如失败）

[贴图]
```

## 已知风险

- D-P0-3：未签名安装器会被 SmartScreen 红屏拦截。内测期间用户需手动 `详细信息 → 仍要运行`，已写入 README。
- 首次启动若网络不可用，token 加载会卡 0-3s（可接受）。
