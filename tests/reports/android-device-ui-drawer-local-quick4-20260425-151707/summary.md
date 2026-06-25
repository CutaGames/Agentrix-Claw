# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 4
- Warnings: 0
- Failed: 2

| ID | Status | Snapshot | Notes |
| --- | --- | --- | --- |
| device-online | passed |  | MDX0220309000133       device product:ELS-AN00 model:ELS_AN00 device:HWELS transport_id:6 |
| foreground-app | passed |  | app.agentrix.claw |
| wait-chat-or-auth | passed | 01-wait-chat-or-auth | agent-chat-screen |
| crash-launch | passed |  | no fatal patterns |
| tap-chat tab | failed | 05-before-chat-tab | node not found |
| fatal | failed |  | Could not find UI node for chat tab (对话, Chat). |
