# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 44
- Warnings: 13
- Failed: 1

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
| tap-realtime voice button | passed | 46-before-realtime-voice-button | chat-voice-action-button [40,2010][822,2156] |
| wait-text-mode-after-voice-controls-return | warning |  | timeout 8s |
| wait-text-mode-after-voice-controls-back | warning |  | timeout 8s |
| text-mode-after-voice-controls | warning | 51-text-mode-after-voice-controls | text input not visible after recovery |
| crash-chat-controls | passed |  | no fatal patterns |
| tap-chat tab for drawer | warning | 56-before-chat-tab-for-drawer | node not present |
| tap-chat tab for drawer-fallback | passed |  | coordinate 150,2460 |
| wait-text-mode-before-drawer-back | warning |  | timeout 8s |
| text-mode-before-drawer | warning | 57-text-mode-before-drawer | text input not visible after recovery |
| wait-chat-ready-before-drawer-memory | warning |  | timeout 25s |
| wait-chat-ready-before-drawer-memory-retry | warning |  | timeout 25s |
| fatal | failed |  | Chat screen was not ready before opening drawer for memory. |
