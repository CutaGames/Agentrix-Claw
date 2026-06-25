# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 26
- Warnings: 8
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
| tap-quick model switch | passed | 16-before-quick-model-switch | quick-model-switch [0,466][1200,552] |
| tap-chat settings | passed | 18-before-chat-settings | agent-chat-settings-button [1041,187][1160,306] |
| wait-chat settings sheet | passed | 19-wait-chat-settings-sheet | chat-settings-sheet |
| wait-duplex toggle present | passed | 20-wait-duplex-toggle-present | chat-duplex-toggle |
| tap-voice mode toggle | warning | 22-before-voice-mode-toggle | node not present |
| tap-voice mode toggle-fallback | passed |  | coordinate 1094,2085 |
| tap-realtime voice button | warning | 27-before-realtime-voice-button | node not present |
| text-mode-after-voice-controls | passed | 32-text-mode-after-voice-controls | chat-text-input |
| crash-chat-controls | passed |  | no fatal patterns |
| tap-chat tab for drawer | passed | 33-before-chat-tab-for-drawer | 对话 [0,2445][300,2486] |
| text-mode-before-drawer | passed | 34-text-mode-before-drawer | chat-text-input |
| wait-chat-ready-before-drawer-memory | passed | 35-wait-chat-ready-before-drawer-memory | agent-chat-screen |
| wait-chat-ready-memory | warning |  | timeout 20s |
| tap-drawer-open-memory | warning | 40-before-drawer-open-memory | node not present |
| tap-drawer-open-memory-fallback | passed |  | coordinate 100,245 |
| wait-drawer-memory | warning |  | timeout 5s |
| wait-drawer-memory-retry | warning |  | timeout 5s |
| wait-drawer-memory-swipe | warning |  | timeout 5s |
| drawer-memory-open | failed |  | drawer did not open |
| fatal | failed |  | Could not open drawer for memory. |
