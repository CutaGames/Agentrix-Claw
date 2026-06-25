# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 33
- Warnings: 1
- Failed: 3

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
| tap-input-local-only | passed | 18-before-input-local-only | chat-text-input [39,2190][815,2389] |
| tap-send-local-only | passed | 19-before-send-local-only | chat-send-button [1021,2016][1160,2155] |
| wait-user-message-local-only | passed | 20-wait-user-message-local-only | chat-message-user |
| chat-local-only | passed |  | submitted localsmokeping |
| crash-chat-local-only | passed |  | no fatal patterns |
| tap-mode-auto | passed | 22-before-mode-auto | execution-mode-auto [364,1884][568,1968] |
| tap-input-auto | passed | 23-before-input-auto | chat-text-input [39,2014][690,2155] |
| tap-send-auto | passed | 24-before-send-auto | chat-send-button [1021,2017][1160,2156] |
| wait-user-message-auto | passed | 25-wait-user-message-auto | chat-message-user |
| chat-auto | passed |  | submitted autosmokeping |
| crash-chat-auto | passed |  | no fatal patterns |
| tap-mode-cloud-only | passed | 27-before-mode-cloud-only | execution-mode-cloud-only [588,1885][792,1970] |
| tap-input-cloud-only | passed | 28-before-input-cloud-only | chat-text-input [39,2015][815,2156] |
| tap-send-cloud-only | warning | 29-before-send-cloud-only | node not present |
| tap-send-cloud-only-fallback | passed |  | coordinate 1090,2085 |
| wait-user-message-cloud-only | failed |  | timeout 12s |
| chat-cloud-only | passed |  | submitted cloudsmokeping |
| crash-chat-cloud-only | passed |  | no fatal patterns |
| tap-quick model switch | failed | 35-before-quick-model-switch | node not found |
| fatal | failed |  | Could not find UI node for quick model switch (quick-model-switch). |
