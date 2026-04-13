# Local AI User-Flow Plan

## Build trigger

The APK workflow does not trigger from local edits alone. A visible mobile build appears only after one of these actions:

1. Push to `main`, `master`, or `build*`
2. Manually trigger `.github/workflows/build-apk-trigger.yml`

## Fast validation path

1. Run web E2E user flows for the Local AI package UI.
2. Run the existing voice/local-routing E2E coverage.
3. Trigger a real APK build only after the web suite is green.

## Commands

Run the full local AI user-flow suite:

```bash
npm run test:e2e:local-ai-user-flows
```

Run only the new Local AI package-management script:

```bash
npx playwright test -c tests/e2e/playwright.voice-ui.config.ts tests/e2e/ui/local-ai-ui.spec.ts --project=chromium
```

Trigger a new APK build after commit/push or manual dispatch:

```bash
npm run build:android
```

## Coverage

`tests/e2e/ui/local-ai-ui.spec.ts`

- Fresh package download from the Local AI screen
- Partial package upgrade for remaining add-ons
- Runtime-blocked repair and re-download flow

`tests/e2e/ui/voice-ui.spec.ts`

- Local text routing through the on-device bridge
- Hold-to-talk local voice path
- Duplex local voice path without realtime bridge fallback