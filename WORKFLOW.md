# Agentrix Development Workflow

## Project Structure

```
Agentrix-website/
├── src/                  # React Native mobile app (Expo SDK 54)
│   ├── screens/          # Screen components
│   ├── components/       # Reusable UI components
│   ├── hooks/            # Custom hooks (useVoiceSession, useTokenQuota, etc.)
│   ├── services/         # API clients, voice services, bridges
│   ├── stores/           # Zustand + MMKV state stores
│   ├── navigation/       # React Navigation config
│   └── theme/            # Colors, styles
├── backend/              # NestJS backend server
│   ├── src/modules/      # Feature modules (voice, claude, marketplace, etc.)
│   ├── src/common/       # Shared guards, decorators, filters
│   └── build.sh          # Backend build script
├── frontend/             # Next.js web admin panel
├── desktop/              # Tauri desktop app
├── android/              # Android native (Expo prebuild)
├── tests/
│   ├── e2e/              # Playwright API tests
│   └── reports/          # Test output
├── scripts/
│   ├── public-build/     # Public APK build sync to Agentrix-claw repo
│   ├── deploy/           # Deployment scripts
│   ├── build/            # Build helper scripts
│   ├── check/            # Diagnostic/inspection scripts
│   ├── test/             # Test/validation scripts
│   └── setup/            # Environment setup scripts
├── .github/workflows/    # CI/CD (GitHub Actions)
└── Agentrix Logo/        # Brand assets
```

## Development

### Local Setup
```bash
npm install                     # Install dependencies
npx expo start                  # Start Expo dev server
npx expo run:android            # Run on Android device/emulator
```

### Backend Dev
```bash
cd backend
npm install
npm run start:dev               # NestJS with hot reload (port 3001)
```

### Web Frontend Dev
```bash
cd frontend
npm install
npm run dev                     # Next.js dev server (port 3000)
```

## Testing

### E2E API Tests (Playwright)
```bash
# Run all commerce + voice tests against production
npx playwright test -c tests/e2e/playwright.config.ts --reporter=line

# Run specific suite
npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/voice-optimizations.spec.ts
npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/commerce-all-modules.spec.ts

# Test suites:
#   voice-optimizations.spec.ts  — Voice TTS, rate, persona, transcribe (15 tests)
#   commerce-all-modules.spec.ts — Health, marketplace, chat, social (17 tests)
#   cross-platform-regression.spec.ts — Cross-platform smoke tests
#   openclaw-hub-skills.spec.ts  — OpenClaw skill hub
```

### TypeScript Check
```bash
npx tsc --noEmit                # Type-check the mobile app
cd backend && npx tsc --noEmit  # Type-check the backend
```

## Build & Release

### Mobile APK (CI)
1. Push to a `build*` branch (e.g., `build137`)
2. GitHub Actions workflow `.github/workflows/build-apk.yml` triggers automatically
3. APK artifact is uploaded to the workflow run
4. For public distribution: sync to `CutaGames/Agentrix-claw` via `scripts/public-build/push_public_build_via_server.ps1`

### Desktop (Tauri)
```bash
cd desktop
npm install
npm run tauri build
```

## Deployment

### Server Info
- **Production**: `ubuntu@18.139.157.116` (Singapore)
- **Domain**: `agentrix.top` / `api.agentrix.top`
- **SSH Key**: `hq.pem` (on developer desktop)
- **Process Manager**: PM2
  - `agentrix-backend` — NestJS API (port 3001)
  - `agentrix-frontend` — Next.js web (port 3000)
  - `openclaw-gateway` — OpenClaw proxy

### Deploy Backend
```bash
ssh -i hq.pem ubuntu@18.139.157.116
cd /home/ubuntu/Agentrix
git pull origin <branch>
cd backend
npm run build
pm2 restart agentrix-backend
```

### Deploy Frontend
```bash
ssh -i hq.pem ubuntu@18.139.157.116
cd /home/ubuntu/Agentrix/frontend
git pull origin <branch>
npm run build
pm2 restart agentrix-frontend
```

## Git Conventions

### Branch Naming
- `build<N>` — Mobile release build branches (e.g., `build137`)
- `main` — Stable baseline
- Feature branches as needed

### Commit Flow
```bash
git add -A
git commit -m "feat: description of changes"
git push origin build137
```

### .gitignore Policy
- `*.sh`, `*.py`, `*.cmd` — Ignored globally (dev scripts may contain tokens)
- Allowed script directories: `scripts/public-build/`, `scripts/deploy/`, `scripts/build/`, `scripts/check/`, `scripts/test/`, `scripts/setup/`
- `*.bundle`, `*.tgz`, `*.tar.gz`, `*.patch`, `*.sql` — Build artifacts, ignored
- `tmp/`, `.tmp-*`, `.deploy/`, `ci_logs/` — Temp directories, ignored
- `backend/build.sh`, `frontend/start-production.sh` — Explicitly allowed

## Voice System Architecture (P0-P2)

### Components
- **WebSocket Duplex** (`realtimeVoice.service.ts`) — Full-duplex voice channel
- **VAD** (`vad.service.ts`) — Energy-based voice activity detection
- **Audio Queue** (`AudioQueuePlayer.ts`) — TTS playback with interruption tracking
- **Voice Session** (`useVoiceSession.ts`) — Orchestrates voice flow
- **Voice Diagnostics** (`voiceDiagnostics.ts`) — MMKV-backed event logging

### Backend Voice Endpoints
- `GET /voice/tts?text=...&lang=...&voice=...&rate=...` — Text-to-speech (Edge TTS)
- `POST /voice/transcribe` — Speech-to-text (multipart audio upload)
