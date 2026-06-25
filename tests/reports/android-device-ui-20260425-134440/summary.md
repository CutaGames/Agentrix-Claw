# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 65
- Warnings: 6
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
| tap-chat tab for modes | passed | 15-before-chat-tab-for-modes | 对话 [0,2445][300,2486] |
| wait-chat input | passed | 16-wait-chat-input | chat-text-input |
| tap-mode-local-only | passed | 17-before-mode-local-only | execution-mode-local-only [140,2118][344,2202] |
| tap-input-local-only | passed | 18-before-input-local-only | chat-text-input [39,2248][690,2389] |
| tap-send-local-only | passed | 19-before-send-local-only | chat-send-button [1021,2017][1160,2156] |
| wait-user-message-local-only | passed | 20-wait-user-message-local-only | localsmokeping |
| chat-local-only | passed |  | submitted localsmokeping |
| crash-chat-local-only | passed |  | no fatal patterns |
| tap-mode-auto | passed | 22-before-mode-auto | execution-mode-auto [364,1885][568,1970] |
| tap-input-auto | passed | 23-before-input-auto | chat-text-input [39,2015][690,2156] |
| tap-send-auto | passed | 24-before-send-auto | chat-send-button [1021,2016][1160,2155] |
| wait-user-message-auto | passed | 25-wait-user-message-auto | autosmokeping |
| chat-auto | passed |  | submitted autosmokeping |
| crash-chat-auto | passed |  | no fatal patterns |
| tap-mode-cloud-only | passed | 27-before-mode-cloud-only | execution-mode-cloud-only [588,1884][792,1968] |
| tap-input-cloud-only | passed | 28-before-input-cloud-only | chat-text-input [39,2014][690,2155] |
| tap-send-cloud-only | passed | 29-before-send-cloud-only | chat-send-button [1021,2017][1160,2156] |
| wait-user-message-cloud-only | passed | 30-wait-user-message-cloud-only | cloudsmokeping |
| chat-cloud-only | passed |  | submitted cloudsmokeping |
| crash-chat-cloud-only | passed |  | no fatal patterns |
| tap-chat tab for quick model | passed | 32-before-chat-tab-for-quick-model | 对话 [0,2445][300,2486] |
| tap-quick model switch | passed | 33-before-quick-model-switch | quick-model-switch [0,466][1200,552] |
| tap-chat settings | passed | 35-before-chat-settings | agent-chat-settings-button [1041,187][1160,306] |
| wait-chat settings sheet | passed | 36-wait-chat-settings-sheet | chat-settings-sheet |
| wait-duplex toggle present | passed | 37-wait-duplex-toggle-present | chat-duplex-toggle |
| tap-voice mode toggle | warning | 39-before-voice-mode-toggle | node not present |
| tap-voice mode toggle-fallback | passed |  | coordinate 1094,2085 |
| tap-realtime voice button | warning | 44-before-realtime-voice-button | node not present |
| tap-voice mode toggle return | passed | 49-before-voice-mode-toggle-return | chat-voice-mode-toggle [1028,2022][1160,2155] |
| crash-chat-controls | passed |  | no fatal patterns |
| tap-chat tab for drawer | passed | 50-before-chat-tab-for-drawer | 对话 [0,2445][300,2486] |
| tap-drawer-open-memory | passed | 51-before-drawer-open-memory | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-memory | passed | 52-wait-drawer-memory | 管理 |
| tap-drawer-item-memory | passed | 53-before-drawer-item-memory | 记忆中心 [192,905][831,972] |
| crash-drawer-memory | passed |  | no fatal patterns |
| tap-drawer-open-workflows | passed | 58-before-drawer-open-workflows | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-workflows | passed | 59-wait-drawer-workflows | 管理 |
| tap-drawer-item-workflows | passed | 60-before-drawer-item-workflows | 工作流 [192,1073][831,1140] |
| crash-drawer-workflows | passed |  | no fatal patterns |
| tap-drawer-open-skills | passed | 65-before-drawer-open-skills | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-skills | passed | 66-wait-drawer-skills | 管理 |
| tap-drawer-item-skills | passed | 67-before-drawer-item-skills | 技能管理 [192,1241][831,1308] |
| crash-drawer-skills | passed |  | no fatal patterns |
| tap-drawer-open-logs | passed | 72-before-drawer-open-logs | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-logs | passed | 73-wait-drawer-logs | 管理 |
| tap-drawer-item-logs | passed | 74-before-drawer-item-logs | 运行日志 [192,1409][831,1476] |
| crash-drawer-logs | passed |  | no fatal patterns |
| tap-drawer-open-desktop | passed | 79-before-drawer-open-desktop | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-desktop | passed | 80-wait-drawer-desktop | 管理 |
| tap-drawer-item-desktop | passed | 81-before-drawer-item-desktop | 桌面控制 [192,1711][831,1778] |
| crash-drawer-desktop | passed |  | no fatal patterns |
| tap-drawer-open-wearables | passed | 86-before-drawer-open-wearables | agent-chat-drawer-button [40,187][159,306] |
| wait-drawer-wearables | passed | 87-wait-drawer-wearables | 管理 |
| tap-drawer-item-wearables | warning | 88-before-drawer-item-wearables | node not present |
| tap-drawer-item-wearables | warning | 89-before-drawer-item-wearables | node not present |
| tap-drawer-item-wearables | warning | 90-before-drawer-item-wearables | node not present |
| tap-drawer-item-wearables | warning | 91-before-drawer-item-wearables | node not present |
| drawer-item-wearables | failed |  | item not found after scroll |
| fatal | failed |  | Could not find drawer item for wearables. |
