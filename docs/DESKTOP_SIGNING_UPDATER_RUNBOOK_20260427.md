# Desktop Signing And Updater Runbook

Date: 2026-04-27
Status: code path implemented; production secrets and hosting must be provisioned before public release.

## Current Implementation

- Desktop app uses Tauri updater endpoint: `https://api.agentrix.top/api/desktop/update/{{target}}/{{arch}}/{{current_version}}`.
- Backend now exposes `GET /api/desktop/update/:target/:arch/:currentVersion`.
- Backend returns `204 No Content` when update metadata is missing or the configured version is not newer.
- CI now injects `WINDOWS_CERTIFICATE_THUMBPRINT` into Tauri config on Windows builds.
- Release tags matching `desktop-v*` fail if Windows signing is required but the certificate thumbprint secret is missing.

## Required Secrets

- `TAURI_SIGNING_PRIVATE_KEY`: Tauri updater signing private key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: optional, if the updater signing key is password protected.
- `WINDOWS_CERTIFICATE_THUMBPRINT`: Authenticode certificate thumbprint installed on the Windows runner.
- `DESKTOP_UPDATE_BASE_URL`: public base URL where signed update assets are hosted.
- `DEPLOY_SSH_KEY` / `DEPLOY_HOST`: deployment credentials if the artifact host is updated through SSH.

## Backend Environment

Configure these on production API before enabling desktop auto-update:

```bash
DESKTOP_UPDATE_VERSION=0.1.2
DESKTOP_UPDATE_BASE_URL=https://agentrix.top/downloads/desktop/0.1.2
DESKTOP_UPDATE_SIGNATURE_WINDOWS_X86_64=<tauri-updater-signature>
DESKTOP_UPDATE_ASSET_WINDOWS_X86_64=Agentrix-Desktop-0.1.2-x64-setup.exe
DESKTOP_UPDATE_NOTES="Agentrix Desktop 0.1.2"
DESKTOP_UPDATE_PUB_DATE=2026-04-27T00:00:00.000Z
```

Use equivalent `DESKTOP_UPDATE_SIGNATURE_DARWIN_AARCH64`, `DESKTOP_UPDATE_SIGNATURE_DARWIN_X86_64`, and `DESKTOP_UPDATE_SIGNATURE_LINUX_X86_64` entries as those releases are published.

## Verification Checklist

- Run desktop build on all platforms with updater signing enabled.
- Confirm Windows artifact is Authenticode signed.
- Confirm backend endpoint returns `204` for current/latest version.
- Confirm backend endpoint returns manifest for older version.
- Confirm the manifest URL downloads the exact signed artifact.
- Confirm Tauri updater accepts the signature and prompts/install/relaunch works from Settings.

## Remaining Manual Blocker

Windows Authenticode signing cannot be completed by code alone. A valid code-signing certificate must be purchased/provisioned, installed in the Windows CI runner certificate store, and exposed through `WINDOWS_CERTIFICATE_THUMBPRINT`.