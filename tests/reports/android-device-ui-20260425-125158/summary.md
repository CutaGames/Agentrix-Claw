# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 18
- Warnings: 0
- Failed: 2

| ID | Status | Snapshot | Notes |
| --- | --- | --- | --- |
| device-online | passed |  | MDX0220309000133       device product:ELS-AN00 model:ELS_AN00 device:HWELS transport_id:5 |
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
| tap-mode-local-only | passed | 17-before-mode-local-only | execution-mode-local-only [140,2060][344,2144] |
| tap-input-local-only | passed | 18-before-input-local-only | chat-text-input [39,2190][690,2389] |
| tap-send-local-only | failed | 19-before-send-local-only | node not found |
| fatal | failed |  | Could not find UI node for send-local-only (chat-send-button). |
