# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 13
- Warnings: 0
- Failed: 0

| ID | Status | Snapshot | Notes |
| --- | --- | --- | --- |
| device-online | passed |  | MDX0220309000133       device product:ELS-AN00 model:ELS_AN00 device:HWELS transport_id:6 |
| foreground-app | passed |  | app.agentrix.claw |
| wait-chat-or-auth | passed | 01-wait-chat-or-auth | agent-chat-screen |
| wait-interactive-chat-after-launch | passed | 06-wait-interactive-chat-after-launch | chat controls stable |
| crash-launch | passed |  | no fatal patterns |
| tap-me tab for local model | passed | 07-before-me-tab-for-local-model | 我的 [900,2445][1200,2486] |
| tap-scroll-settings menu | passed | 09-scroll-settings-menu-1 | 设置 [234,1957][1035,2024] |
| wait-settings screen | passed | 10-wait-settings-screen | 设置 |
| tap-scroll-local ai model | passed | 13-scroll-local-ai-model-2 | 本地 AI 模型 [56,340][1144,394] |
| wait-local ai model screen | passed | 14-wait-local-ai-model-screen | local-ai-model-screen |
| wait-local ai ready model | passed | 15-wait-local-ai-ready-model | local-ai-ready-model |
| crash-local-ai-model | passed |  | no fatal patterns |
| crash-final | passed |  | no fatal patterns |
