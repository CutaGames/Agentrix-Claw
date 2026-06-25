# Agentrix full app validation

- Profile: smoke
- API URL: https://api.agentrix.top/api
- Passed: 4
- Failed: 0
- Skipped: 5
- Dry run: 0

| ID | Status | Exit | Log | Notes |
| --- | --- | ---: | --- | --- |
| mobile-typecheck | passed | 0 | .\tests\reports\full-app-validation-20260425-093624\mobile-typecheck.log |  |
| backend-build | passed | 0 | .\tests\reports\full-app-validation-20260425-093624\backend-build.log |  |
| desktop-web-build | passed | 0 | .\tests\reports\full-app-validation-20260425-093624\desktop-web-build.log |  |
| frontend-next-build | passed | 0 | .\tests\reports\full-app-validation-20260425-093624\frontend-next-build.log |  |
| api-cross-platform-e2e | skipped | 0 |  | Use -RunApiE2E or -Profile full/ci. |
| expo-web-user-journeys | skipped | 0 |  | Use -RunExpoWebE2E or -Profile full. |
| desktop-tauri-package | skipped | 0 |  | Use -RunDesktopPackage when Rust/Tauri build environment is ready. |
| android-device-smoke | skipped | 0 |  | Use -RunAndroidDevice or -Profile device. |
| ios-simulator-smoke | skipped | 0 |  | Use -RunIosSimulator or -Profile device on macOS. |
