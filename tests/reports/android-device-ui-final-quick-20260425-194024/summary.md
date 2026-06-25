# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 112
- Warnings: 16
- Failed: 0

| ID | Status | Snapshot | Notes |
| --- | --- | --- | --- |
| device-online | passed |  | MDX0220309000133       device product:ELS-AN00 model:ELS_AN00 device:HWELS transport_id:8 |
| foreground-app | passed |  | app.agentrix.claw |
| wait-chat-or-auth | passed | 01-wait-chat-or-auth | agent-chat-screen |
| wait-interactive-chat-after-launch | passed | 06-wait-interactive-chat-after-launch | chat controls stable |
| crash-launch | passed |  | no fatal patterns |
| tap-chat tab | passed | 07-before-chat-tab | 对话 [0,2445][300,2486] |
| crash-chat tab | passed |  | no fatal patterns |
| tap-discover tab | passed | 09-before-discover-tab | 发现 [300,2445][600,2486] |
| crash-discover tab | passed |  | no fatal patterns |
| tap-team tab | passed | 11-before-team-tab | 团队 [600,2445][900,2486] |
| crash-team tab | passed |  | no fatal patterns |
| tap-me tab | passed | 13-before-me-tab | 我的 [900,2445][1200,2486] |
| crash-me tab | passed |  | no fatal patterns |
| tap-chat tab return | passed | 15-before-chat-tab-return | 对话 [0,2445][300,2486] |
| crash-chat tab return | passed |  | no fatal patterns |
| chat-turns | warning |  | skipped by -SkipChatTurns |
| tap-chat tab for quick model | passed | 17-before-chat-tab-for-quick-model | 对话 [0,2445][300,2486] |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| tap-quick model switch | passed | 18-before-quick-model-switch | quick-model-switch [0,466][1200,552] |
| tap-chat settings | passed | 20-before-chat-settings | agent-chat-settings-button [1041,187][1160,306] |
| wait-chat settings sheet | passed | 21-wait-chat-settings-sheet | chat-settings-sheet |
| wait-duplex toggle present | passed | 22-wait-duplex-toggle-present | chat-duplex-toggle |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| tap-voice mode toggle | passed | 24-before-voice-mode-toggle | chat-voice-mode-toggle [1028,2256][1160,2388] |
| wait-realtime voice button | passed | 29-wait-realtime-voice-button | chat-voice-action-button |
| wait-text-mode-after-voice-controls-return | passed | 35-wait-text-mode-after-voice-controls-return | chat-text-input |
| text-mode-after-voice-controls-returned | passed |  | voice mode closed |
| crash-chat-controls | passed |  | no fatal patterns |
| tap-chat tab for drawer | passed | 36-before-chat-tab-for-drawer | 对话 [0,2445][300,2486] |
| text-mode-before-drawer | passed | 37-text-mode-before-drawer | chat-text-input |
| wait-chat-ready-before-drawer-memory | passed | 38-wait-chat-ready-before-drawer-memory | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-memory | passed | 39-wait-chat-ready-memory | agent-chat-screen |
| tap-drawer-open-memory | passed | 40-before-drawer-open-memory | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-memory | passed | 41-wait-drawer-memory | 管理 |
| tap-drawer-item-memory | passed | 42-before-drawer-item-memory | 记忆中心 [192,905][831,972] |
| crash-drawer-memory | passed |  | no fatal patterns |
| return-chat-after-drawer-memory | passed | 47-return-chat-after-drawer-memory-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-workflows | passed | 48-wait-chat-ready-before-drawer-workflows | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-workflows | passed | 49-wait-chat-ready-workflows | agent-chat-screen |
| tap-drawer-open-workflows | passed | 50-before-drawer-open-workflows | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-workflows | passed | 51-wait-drawer-workflows | 管理 |
| tap-drawer-item-workflows | passed | 52-before-drawer-item-workflows | 工作流 [192,1073][831,1140] |
| crash-drawer-workflows | passed |  | no fatal patterns |
| return-chat-after-drawer-workflows | passed | 57-return-chat-after-drawer-workflows-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-skills | passed | 58-wait-chat-ready-before-drawer-skills | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-skills | passed | 59-wait-chat-ready-skills | agent-chat-screen |
| tap-drawer-open-skills | passed | 60-before-drawer-open-skills | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-skills | passed | 61-wait-drawer-skills | 管理 |
| tap-drawer-item-skills | passed | 62-before-drawer-item-skills | 技能管理 [192,1241][831,1308] |
| crash-drawer-skills | passed |  | no fatal patterns |
| return-chat-after-drawer-skills | passed | 67-return-chat-after-drawer-skills-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-logs | passed | 68-wait-chat-ready-before-drawer-logs | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-logs | passed | 69-wait-chat-ready-logs | agent-chat-screen |
| tap-drawer-open-logs | passed | 70-before-drawer-open-logs | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-logs | passed | 71-wait-drawer-logs | 管理 |
| tap-drawer-item-logs | passed | 72-before-drawer-item-logs | 运行日志 [192,1409][831,1476] |
| crash-drawer-logs | passed |  | no fatal patterns |
| return-chat-after-drawer-logs | passed | 77-return-chat-after-drawer-logs-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-desktop | passed | 78-wait-chat-ready-before-drawer-desktop | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-desktop | passed | 79-wait-chat-ready-desktop | agent-chat-screen |
| tap-drawer-open-desktop | passed | 80-before-drawer-open-desktop | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-desktop | passed | 81-wait-drawer-desktop | 管理 |
| tap-drawer-item-desktop | passed | 82-before-drawer-item-desktop | 桌面控制 [192,1711][831,1778] |
| crash-drawer-desktop | passed |  | no fatal patterns |
| return-chat-after-drawer-desktop | passed | 87-return-chat-after-drawer-desktop-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-wearables | passed | 88-wait-chat-ready-before-drawer-wearables | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-wearables | passed | 89-wait-chat-ready-wearables | agent-chat-screen |
| tap-drawer-open-wearables | passed | 90-before-drawer-open-wearables | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-wearables | passed | 91-wait-drawer-wearables | 管理 |
| tap-drawer-item-wearables | passed | 92-before-drawer-item-wearables | 可穿戴设备 [192,1879][831,1946] |
| crash-drawer-wearables | passed |  | no fatal patterns |
| return-chat-after-drawer-wearables | passed | 97-return-chat-after-drawer-wearables-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-scan | passed | 98-wait-chat-ready-before-drawer-scan | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-scan | passed | 99-wait-chat-ready-scan | agent-chat-screen |
| tap-drawer-open-scan | passed | 100-before-drawer-open-scan | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-scan | passed | 101-wait-drawer-scan | 管理 |
| tap-drawer-item-scan | passed | 102-before-drawer-item-scan | 扫码连接 [192,2047][831,2114] |
| crash-drawer-scan | passed |  | no fatal patterns |
| return-chat-after-drawer-scan | passed | 107-return-chat-after-drawer-scan-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-permissions | passed | 108-wait-chat-ready-before-drawer-permissions | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-permissions | passed | 109-wait-chat-ready-permissions | agent-chat-screen |
| tap-drawer-open-permissions | passed | 110-before-drawer-open-permissions | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-permissions | passed | 111-wait-drawer-permissions | 管理 |
| tap-drawer-item-permissions | passed | 112-before-drawer-item-permissions | 权限管理 [192,2349][831,2416] |
| crash-drawer-permissions | passed |  | no fatal patterns |
| return-chat-after-drawer-permissions | passed | 117-return-chat-after-drawer-permissions-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-agent-account | passed | 118-wait-chat-ready-before-drawer-agent-account | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-agent-account | passed | 119-wait-chat-ready-agent-account | agent-chat-screen |
| tap-drawer-open-agent-account | passed | 120-before-drawer-open-agent-account | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-agent-account | passed | 121-wait-drawer-agent-account | 管理 |
| tap-drawer-item-agent-account | passed | 122-before-drawer-item-agent-account | Agent 账号 [53,2467][907,2486] |
| crash-drawer-agent-account | passed |  | no fatal patterns |
| return-chat-after-drawer-agent-account | passed | 127-return-chat-after-drawer-agent-account-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-team-space | passed | 128-wait-chat-ready-before-drawer-team-space | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-team-space | passed | 129-wait-chat-ready-team-space | agent-chat-screen |
| tap-drawer-open-team-space | passed | 130-before-drawer-open-team-space | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-team-space | passed | 131-wait-drawer-team-space | 管理 |
| tap-drawer-item-team-space | warning | 132-before-drawer-item-team-space | node not present |
| tap-drawer-item-team-space | passed | 133-before-drawer-item-team-space | 团队空间 [192,2222][831,2289] |
| crash-drawer-team-space | passed |  | no fatal patterns |
| return-chat-after-drawer-team-space | passed | 138-return-chat-after-drawer-team-space-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-console | passed | 139-wait-chat-ready-before-drawer-console | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-console | passed | 140-wait-chat-ready-console | agent-chat-screen |
| tap-drawer-open-console | passed | 141-before-drawer-open-console | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-console | passed | 142-wait-drawer-console | 管理 |
| tap-drawer-item-console | warning | 143-before-drawer-item-console | node not present |
| tap-drawer-item-console | passed | 144-before-drawer-item-console | Agent 完整控制台 [192,2417][831,2484] |
| crash-drawer-console | passed |  | no fatal patterns |
| return-chat-after-drawer-console | passed | 149-return-chat-after-drawer-console-0 | agent-chat-screen |
| tap-me tab for local model | passed | 150-before-me-tab-for-local-model | 我的 [900,2445][1200,2486] |
| tap-scroll-settings menu | passed | 152-scroll-settings-menu-1 | 设置 [234,1957][1035,2024] |
| wait-settings screen | passed | 153-wait-settings-screen | 设置 |
| tap-scroll-local ai model | passed | 156-scroll-local-ai-model-2 | 本地 AI 模型 [56,340][1144,399] |
| wait-local ai model screen | passed | 157-wait-local-ai-model-screen | local-ai-model-screen |
| wait-local ai ready model | passed | 158-wait-local-ai-ready-model | local-ai-ready-model |
| crash-local-ai-model | passed |  | no fatal patterns |
| crash-final | passed |  | no fatal patterns |
