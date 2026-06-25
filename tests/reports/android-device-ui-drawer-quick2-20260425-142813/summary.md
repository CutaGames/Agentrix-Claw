# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 104
- Warnings: 31
- Failed: 2

| ID | Status | Snapshot | Notes |
| --- | --- | --- | --- |
| device-online | passed |  | MDX0220309000133       device product:ELS-AN00 model:ELS_AN00 device:HWELS transport_id:6 |
| foreground-app | passed |  | app.agentrix.claw |
| wait-chat-or-auth | passed | 01-wait-chat-or-auth | agent-chat-screen |
| crash-launch | passed |  | no fatal patterns |
| tap-chat tab | passed | 05-before-chat-tab | 对话 [0,2445][300,2486] |
| crash-chat tab | passed |  | no fatal patterns |
| tap-discover tab | passed | 07-before-discover-tab | 发现 [300,2445][600,2486] |
| crash-discover tab | passed |  | no fatal patterns |
| tap-team tab | passed | 09-before-team-tab | 团队 [600,2445][900,2486] |
| crash-team tab | passed |  | no fatal patterns |
| tap-me tab | passed | 11-before-me-tab | 我的 [900,2445][1200,2486] |
| crash-me tab | passed |  | no fatal patterns |
| tap-chat tab return | passed | 13-before-chat-tab-return | 对话 [0,2445][300,2486] |
| crash-chat tab return | passed |  | no fatal patterns |
| chat-turns | warning |  | skipped by -SkipChatTurns |
| tap-chat tab for quick model | passed | 15-before-chat-tab-for-quick-model | 对话 [0,2445][300,2486] |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| tap-quick model switch | passed | 16-before-quick-model-switch | quick-model-switch [0,466][1200,552] |
| tap-chat settings | passed | 18-before-chat-settings | agent-chat-settings-button [1041,187][1160,306] |
| wait-chat settings sheet | passed | 19-wait-chat-settings-sheet | chat-settings-sheet |
| wait-duplex toggle present | passed | 20-wait-duplex-toggle-present | chat-duplex-toggle |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| tap-voice mode toggle | passed | 22-before-voice-mode-toggle | chat-voice-mode-toggle [1028,2256][1160,2388] |
| tap-realtime voice button | passed | 27-before-realtime-voice-button | chat-voice-action-button [40,2243][822,2388] |
| wait-text-mode-after-voice-controls-return | passed | 33-wait-text-mode-after-voice-controls-return | chat-text-input |
| text-mode-after-voice-controls-returned | passed |  | voice mode closed |
| crash-chat-controls | passed |  | no fatal patterns |
| tap-chat tab for drawer | passed | 34-before-chat-tab-for-drawer | 对话 [0,2445][300,2486] |
| text-mode-before-drawer | passed | 35-text-mode-before-drawer | chat-text-input |
| wait-chat-ready-before-drawer-memory | passed | 36-wait-chat-ready-before-drawer-memory | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-memory | passed | 37-wait-chat-ready-memory | agent-chat-screen |
| tap-drawer-open-memory | passed | 38-before-drawer-open-memory | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-memory | passed | 39-wait-drawer-memory | 管理 |
| tap-drawer-item-memory | passed | 40-before-drawer-item-memory | 记忆中心 [192,905][831,972] |
| crash-drawer-memory | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-memory-0 | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-memory-0-retry | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-memory-1 | passed | 57-wait-chat-ready-after-drawer-memory-1 | agent-chat-screen |
| wait-chat-ready-before-drawer-workflows | passed | 58-wait-chat-ready-before-drawer-workflows | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-workflows | passed | 59-wait-chat-ready-workflows | agent-chat-screen |
| tap-drawer-open-workflows | passed | 60-before-drawer-open-workflows | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-workflows | passed | 61-wait-drawer-workflows | 管理 |
| tap-drawer-item-workflows | passed | 62-before-drawer-item-workflows | 工作流 [192,1073][831,1140] |
| crash-drawer-workflows | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-workflows-0 | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-workflows-0-retry | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-workflows-1 | passed | 80-wait-chat-ready-after-drawer-workflows-1 | agent-chat-screen |
| wait-chat-ready-before-drawer-skills | passed | 81-wait-chat-ready-before-drawer-skills | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-skills | passed | 82-wait-chat-ready-skills | agent-chat-screen |
| tap-drawer-open-skills | passed | 83-before-drawer-open-skills | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-skills | passed | 84-wait-drawer-skills | 管理 |
| tap-drawer-item-skills | passed | 85-before-drawer-item-skills | 技能管理 [192,1241][831,1308] |
| crash-drawer-skills | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-skills-0 | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-skills-0-retry | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-skills-1 | passed | 102-wait-chat-ready-after-drawer-skills-1 | agent-chat-screen |
| wait-chat-ready-before-drawer-logs | passed | 103-wait-chat-ready-before-drawer-logs | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-logs | passed | 104-wait-chat-ready-logs | agent-chat-screen |
| tap-drawer-open-logs | passed | 105-before-drawer-open-logs | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-logs | passed | 106-wait-drawer-logs | 管理 |
| tap-drawer-item-logs | passed | 107-before-drawer-item-logs | 运行日志 [192,1409][831,1476] |
| crash-drawer-logs | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-logs-0 | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-logs-0-retry | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-logs-1 | passed | 124-wait-chat-ready-after-drawer-logs-1 | agent-chat-screen |
| wait-chat-ready-before-drawer-desktop | passed | 125-wait-chat-ready-before-drawer-desktop | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-desktop | passed | 126-wait-chat-ready-desktop | agent-chat-screen |
| tap-drawer-open-desktop | passed | 127-before-drawer-open-desktop | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-desktop | passed | 128-wait-drawer-desktop | 管理 |
| tap-drawer-item-desktop | passed | 129-before-drawer-item-desktop | 桌面控制 [192,1711][831,1778] |
| crash-drawer-desktop | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-desktop-0 | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-desktop-0-retry | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-desktop-1 | passed | 145-wait-chat-ready-after-drawer-desktop-1 | agent-chat-screen |
| wait-chat-ready-before-drawer-wearables | passed | 146-wait-chat-ready-before-drawer-wearables | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-wearables | passed | 147-wait-chat-ready-wearables | agent-chat-screen |
| tap-drawer-open-wearables | passed | 148-before-drawer-open-wearables | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-wearables | passed | 149-wait-drawer-wearables | 管理 |
| tap-drawer-item-wearables | passed | 150-before-drawer-item-wearables | 可穿戴设备 [192,1879][831,1946] |
| crash-drawer-wearables | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-wearables-0 | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-wearables-0-retry | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-wearables-1 | passed | 167-wait-chat-ready-after-drawer-wearables-1 | agent-chat-screen |
| wait-chat-ready-before-drawer-scan | passed | 168-wait-chat-ready-before-drawer-scan | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-scan | passed | 169-wait-chat-ready-scan | agent-chat-screen |
| tap-drawer-open-scan | passed | 170-before-drawer-open-scan | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-scan | passed | 171-wait-drawer-scan | 管理 |
| tap-drawer-item-scan | passed | 172-before-drawer-item-scan | 扫码连接 [192,2047][831,2114] |
| crash-drawer-scan | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-scan-0 | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-scan-0-retry | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-scan-1 | passed | 187-wait-chat-ready-after-drawer-scan-1 | agent-chat-screen |
| wait-chat-ready-before-drawer-permissions | passed | 188-wait-chat-ready-before-drawer-permissions | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-permissions | passed | 189-wait-chat-ready-permissions | agent-chat-screen |
| tap-drawer-open-permissions | passed | 190-before-drawer-open-permissions | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-permissions | passed | 191-wait-drawer-permissions | 管理 |
| tap-drawer-item-permissions | passed | 192-before-drawer-item-permissions | 权限管理 [192,2349][831,2416] |
| crash-drawer-permissions | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-permissions-0 | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-permissions-0-retry | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-permissions-1 | passed | 209-wait-chat-ready-after-drawer-permissions-1 | agent-chat-screen |
| wait-chat-ready-before-drawer-agent-account | passed | 210-wait-chat-ready-before-drawer-agent-account | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-agent-account | passed | 211-wait-chat-ready-agent-account | agent-chat-screen |
| tap-drawer-open-agent-account | passed | 212-before-drawer-open-agent-account | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-agent-account | passed | 213-wait-drawer-agent-account | 管理 |
| tap-drawer-item-agent-account | passed | 214-before-drawer-item-agent-account | Agent 账号 [0,0][0,0] |
| crash-drawer-agent-account | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-agent-account-0 | passed | 219-wait-chat-ready-after-drawer-agent-account-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-team-space | passed | 220-wait-chat-ready-before-drawer-team-space | agent-chat-screen |
| wait-chat-ready-team-space | passed | 221-wait-chat-ready-team-space | agent-chat-screen |
| tap-drawer-open-team-space | passed | 222-before-drawer-open-team-space | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-team-space | passed | 223-wait-drawer-team-space | 管理 |
| tap-drawer-item-team-space | passed | 224-before-drawer-item-team-space | 团队空间 [0,0][0,0] |
| crash-drawer-team-space | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-team-space-0 | passed | 229-wait-chat-ready-after-drawer-team-space-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-console | passed | 230-wait-chat-ready-before-drawer-console | agent-chat-screen |
| wait-chat-ready-console | passed | 231-wait-chat-ready-console | agent-chat-screen |
| tap-drawer-open-console | passed | 232-before-drawer-open-console | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-console | passed | 233-wait-drawer-console | 管理 |
| tap-drawer-item-console | warning | 234-before-drawer-item-console | node not present |
| tap-drawer-item-console | passed | 235-before-drawer-item-console | Agent 完整控制台 [192,2417][831,2484] |
| crash-drawer-console | passed |  | no fatal patterns |
| wait-chat-ready-after-drawer-console-0 | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-console-0-retry | warning |  | timeout 25s |
| wait-chat-ready-after-drawer-console-1 | passed | 252-wait-chat-ready-after-drawer-console-1 | agent-chat-screen |
| tap-me tab for local model | passed | 253-before-me-tab-for-local-model | 我的 [900,2445][1200,2486] |
| tap-settings menu | failed | 254-before-settings-menu | node not found |
| fatal | failed |  | Could not find UI node for settings menu (设置, Settings). |
