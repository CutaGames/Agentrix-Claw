# Server Public Build Push

This is the standard path for mobile public builds.

Goal:
- Keep `Agentrix` as the source repo.
- Push mobile-build content to `CutaGames/Agentrix-Claw`.
- Trigger public APK/iOS build from `Agentrix-Claw`.
- Only mirror the mobile app build surface. Do not mirror backend code or web frontend code.
- Avoid local GitHub push failures, stale PATs, and repeated interactive authorization.

## Rule

Do not use the main repo push as the build trigger.

The standard path is:
1. Prepare mobile mirror content from the current `Agentrix` branch.
2. Upload that mirror bundle to the Singapore server.
3. Let the server clone and push `CutaGames/Agentrix-Claw`.
4. Let `Agentrix-Claw` Actions trigger the public build on push.

## One-Time Server Setup

Run this once from the Windows machine that already has working GitHub credentials in Git Credential Manager:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\public-build\install_server_public_build_token.ps1
```

This writes the GitHub push token to:

```text
/home/ubuntu/.config/agentrix/public-build.env
```

Expected variable:

```text
PUBLIC_BUILD_REPO_PUSH_TOKEN=...
```

## Standard Push Command

From the `Agentrix` workspace on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\public-build\push_public_build_via_server.ps1 -Branch build136
```

If `-Branch` is omitted, the script uses the current Git branch.

## What Gets Mirrored

The script mirrors the same mobile-facing set as `.github/workflows/sync-mobile-build-repo.yml`.
The whitelist lives in [scripts/public-build/mobile_mirror_paths.txt](d:/wsl/Ubuntu-24.04/Code/Agentrix/Agentrix-website/scripts/public-build/mobile_mirror_paths.txt):

- `App.tsx`
- `app.json`
- `babel.config.js`
- `eas.json`
- `.easignore`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `.gitignore`
- `Agentrix Logo/**`
- `assets/**`
- `src/**`
- `.github/workflows/build-apk.yml`
- `.github/workflows/build-ios-simulator.yml`
- public trigger workflows renamed into `.github/workflows/`

Explicitly excluded from `Agentrix-Claw`:

- `backend/**`
- `frontend/**`
- desktop-only code
- server deployment scripts

The workflow and server push script both fail fast if `backend/` or `frontend/` appears in the staged public-build mirror.

## Server-Side Behavior

The push script:
- creates a temporary staging bundle locally
- uploads the bundle to the server
- clones `CutaGames/Agentrix-Claw` into a temporary server directory
- checks out the requested branch or creates it if missing
- replaces repo contents with the mirrored mobile bundle
- commits only if there is an actual diff
- pushes from the server to `Agentrix-Claw`

The live production repo at `/home/ubuntu/Agentrix` is not used as the Git worktree for the public push.

## Why This Is The Standard Path

This path removes the recurring failure modes that caused repeated manual intervention:

- local machine cannot reliably reach GitHub over Git
- old helper scripts contain expired PATs
- server production repo is often dirty and should not be used as the push worktree
- main repo workflow failures should not block urgent public mobile builds

## Verification

After push, verify the public repo build run:

```text
Repo: CutaGames/Agentrix-Claw
Branch: build136
Workflows: Build -> Test -> Release APK, Build iOS Simulator
```

## Operational Notes

- SSH key default: `C:\Users\15279\Desktop\hq.pem`
- Server host: `ubuntu@18.139.157.116`
- Source repo: `Agentrix`
- Public build repo: `CutaGames/Agentrix-Claw`

## Deprecated Path

Do not rely on the old root-level `push_via_server.sh` PAT-based flow. It used hard-coded tokens and pushed to the wrong repo path for this build workflow.