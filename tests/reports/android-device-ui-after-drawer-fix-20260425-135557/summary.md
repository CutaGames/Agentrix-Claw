# Agentrix Android device UI smoke

- Package: app.agentrix.claw
- Passed: 3
- Warnings: 0
- Failed: 2

| ID | Status | Snapshot | Notes |
| --- | --- | --- | --- |
| device-online | passed |  | MDX0220309000133       device product:ELS-AN00 model:ELS_AN00 device:HWELS transport_id:6 |
| foreground-app | passed |  | app.agentrix.claw |
| wait-chat-or-auth | passed | 01-wait-chat-or-auth | agent-chat-screen |
| crash-launch | failed |  | see tests\reports\android-device-ui-after-drawer-fix-20260425-135557\logcat-launch.log |
| fatal | failed |  | Crash pattern found after launch. |
