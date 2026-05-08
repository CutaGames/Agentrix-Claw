# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 80
- Warnings: 10
- Failed: 2

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
| tap-chat tab for modes | passed | 17-before-chat-tab-for-modes | 对话 [0,2445][300,2486] |
| wait-chat input | passed | 18-wait-chat-input | chat-text-input |
| tap-mode-local-only | passed | 19-before-mode-local-only | execution-mode-local-only [140,2118][344,2202] |
| tap-input-local-only | passed | 20-before-input-local-only | chat-text-input [39,2248][690,2389] |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| tap-send-local-only | passed | 21-before-send-local-only | chat-send-button [1021,1180][1160,1319] |
| wait-user-message-local-only | passed | 22-wait-user-message-local-only | chat-message-user |
| chat-local-only | passed |  | submitted localsmokeping |
| crash-chat-local-only | passed |  | no fatal patterns |
| tap-mode-auto | passed | 24-before-mode-auto | execution-mode-auto [364,1048][568,1132] |
| tap-input-auto | passed | 25-before-input-auto | chat-text-input [39,1178][690,1319] |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| tap-send-auto | passed | 26-before-send-auto | chat-send-button [1021,1181][1160,1320] |
| wait-user-message-auto | passed | 27-wait-user-message-auto | autosmokeping |
| chat-auto | passed |  | submitted autosmokeping |
| crash-chat-auto | passed |  | no fatal patterns |
| tap-mode-cloud-only | passed | 29-before-mode-cloud-only | execution-mode-cloud-only [588,1049][792,1134] |
| tap-input-cloud-only | passed | 30-before-input-cloud-only | chat-text-input [39,1178][690,1319] |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| tap-send-cloud-only | passed | 31-before-send-cloud-only | chat-send-button [1021,1181][1160,1320] |
| wait-user-message-cloud-only | passed | 32-wait-user-message-cloud-only | chat-message-user |
| chat-cloud-only | passed |  | submitted cloudsmokeping |
| crash-chat-cloud-only | passed |  | no fatal patterns |
| tap-chat tab for quick model | passed | 34-before-chat-tab-for-quick-model | 对话 [0,2445][300,2486] |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| tap-quick model switch | passed | 35-before-quick-model-switch | quick-model-switch [0,466][1200,552] |
| tap-chat settings | passed | 37-before-chat-settings | agent-chat-settings-button [1041,187][1160,306] |
| wait-chat settings sheet | passed | 38-wait-chat-settings-sheet | chat-settings-sheet |
| wait-duplex toggle present | passed | 39-wait-duplex-toggle-present | chat-duplex-toggle |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| tap-voice mode toggle | passed | 41-before-voice-mode-toggle | chat-voice-mode-toggle [1028,1187][1160,1320] |
| wait-realtime voice button | passed | 46-wait-realtime-voice-button | chat-voice-action-button |
| wait-text-mode-after-voice-controls-return | passed | 52-wait-text-mode-after-voice-controls-return | chat-text-input |
| text-mode-after-voice-controls-returned | passed |  | voice mode closed |
| crash-chat-controls | passed |  | no fatal patterns |
| tap-chat tab for drawer | passed | 53-before-chat-tab-for-drawer | 对话 [0,2445][300,2486] |
| text-mode-before-drawer | passed | 54-text-mode-before-drawer | chat-text-input |
| wait-chat-ready-before-drawer-memory | passed | 55-wait-chat-ready-before-drawer-memory | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-memory | passed | 56-wait-chat-ready-memory | agent-chat-screen |
| tap-drawer-open-memory | passed | 57-before-drawer-open-memory | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-memory | passed | 58-wait-drawer-memory | 管理 |
| tap-drawer-item-memory | passed | 59-before-drawer-item-memory | 记忆中心 [192,905][831,972] |
| crash-drawer-memory | passed |  | no fatal patterns |
| return-chat-after-drawer-memory | passed | 64-return-chat-after-drawer-memory-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-workflows | passed | 65-wait-chat-ready-before-drawer-workflows | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-workflows | passed | 66-wait-chat-ready-workflows | agent-chat-screen |
| tap-drawer-open-workflows | passed | 67-before-drawer-open-workflows | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-workflows | passed | 68-wait-drawer-workflows | 管理 |
| tap-drawer-item-workflows | passed | 69-before-drawer-item-workflows | 工作流 [192,1073][831,1140] |
| crash-drawer-workflows | passed |  | no fatal patterns |
| return-chat-after-drawer-workflows | passed | 74-return-chat-after-drawer-workflows-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-skills | passed | 75-wait-chat-ready-before-drawer-skills | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-skills | passed | 76-wait-chat-ready-skills | agent-chat-screen |
| tap-drawer-open-skills | passed | 77-before-drawer-open-skills | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-skills | passed | 78-wait-drawer-skills | 管理 |
| tap-drawer-item-skills | passed | 79-before-drawer-item-skills | 技能管理 [192,1241][831,1308] |
| crash-drawer-skills | passed |  | no fatal patterns |
| return-chat-after-drawer-skills | passed | 84-return-chat-after-drawer-skills-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-logs | passed | 85-wait-chat-ready-before-drawer-logs | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-logs | passed | 86-wait-chat-ready-logs | agent-chat-screen |
| tap-drawer-open-logs | passed | 87-before-drawer-open-logs | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-logs | passed | 88-wait-drawer-logs | 管理 |
| tap-drawer-item-logs | passed | 89-before-drawer-item-logs | 运行日志 [192,1409][831,1476] |
| crash-drawer-logs | passed |  | no fatal patterns |
| return-chat-after-drawer-logs | passed | 94-return-chat-after-drawer-logs-0 | agent-chat-screen |
| wait-chat-ready-before-drawer-desktop | passed | 95-wait-chat-ready-before-drawer-desktop | agent-chat-screen |
| keyboard-foreground-recover | warning |  | returned from com.huawei.android.launcher |
| wait-chat-ready-desktop | passed | 96-wait-chat-ready-desktop | agent-chat-screen |
| tap-drawer-open-desktop | passed | 97-before-drawer-open-desktop | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-desktop | passed | 98-wait-drawer-desktop | 管理 |
| tap-drawer-item-desktop | passed | 99-before-drawer-item-desktop | 桌面控制 [192,1711][831,1778] |
| crash-drawer-desktop | failed |  | see tests\reports\android-device-ui-final-full-20260425-185540\logcat-drawer-desktop.log |
| fatal | failed |  | Crash pattern found after drawer-desktop. |
