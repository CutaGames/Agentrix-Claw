# Agentrix full app validation

- Profile: smoke
- API URL: https://api.agentrix.top/api
- Passed: 0
- Failed: 0
- Skipped: 5
- Dry run: 4

| ID | Status | Exit | Log | Notes |
| --- | --- | ---: | --- | --- |
| mobile-typecheck | dry-run | 0 |  |  |
| backend-build | dry-run | 0 |  |  |
| desktop-web-build | dry-run | 0 |  |  |
| frontend-next-build | dry-run | 0 |  |  |
| api-cross-platform-e2e | skipped | 0 |  | Use -RunApiE2E or -Profile full/ci. |
| expo-web-user-journeys | skipped | 0 |  | Use -RunExpoWebE2E or -Profile full. |
| desktop-tauri-package | skipped | 0 |  | Use -RunDesktopPackage when Rust/Tauri build environment is ready. |
| android-device-smoke | skipped | 0 |  | Use -RunAndroidDevice or -Profile device. |
| ios-simulator-smoke | skipped | 0 |  | Use -RunIosSimulator or -Profile device on macOS. |
