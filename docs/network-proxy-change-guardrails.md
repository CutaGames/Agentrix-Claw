# Network / Proxy Change Guardrails

## Purpose

This runbook exists to prevent unrelated assistant work from breaking outbound connectivity, local proxy routing, or the Singapore Shadowsocks fallback path.

## Protected Assets

- Local client config: `C:\Users\15279\Desktop\gui-config.json`
- Local binaries: `C:\Users\15279\Desktop\Shadowsocks.exe`, `C:\Users\15279\Desktop\v2ray-plugin.exe`
- Local Windows proxy settings: `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`
- Production SSH credential path: `C:\Users\15279\Desktop\hq.pem`
- Server Shadowsocks configs: `/etc/shadowsocks-libev/*`
- Server tunnel units: `/etc/systemd/system/agentrix-ss-*.service`
- Server tunnel stack: `cloudflared`, `v2ray-plugin`, `ss-server`
- Workspace protection files: `.github/copilot-instructions.md`, `.github/hooks/network-change-guard.json`, `.github/hooks/network-change-guard.mjs`

## Operating Rules

- If the user request is unrelated to VPN, proxy, internet reachability, or tunnel recovery, do not change protected assets.
- Read-only inspection is allowed. Mutation requires explicit user intent.
- Any protected change must have a backup captured before the first edit.
- Any protected change must have a rollback command or restore file prepared before the first restart.
- Change one layer at a time: local client, local proxy, server Shadowsocks, WebSocket plugin, Cloudflare tunnel, then workflow automation.
- Do not replace the stable baseline direct Shadowsocks service or port during experiments. Add overlay services instead.
- Temporary quick tunnel hostnames are disposable. Treat hostname rotation as an expected event, not a stable contract.

## Required Workflow For Guarded Changes

1. Confirm the task explicitly asks for network or proxy work.
2. Capture the current known-good state before editing.
3. Back up the target file or unit.
4. Apply one isolated change.
5. Verify local and remote health immediately.
6. Roll back immediately if health regresses.
7. Document the final known-good state after recovery.

## Minimum Backup Set

- Copy `C:\Users\15279\Desktop\gui-config.json` before local client edits.
- Export the relevant Windows Internet Settings proxy values before changing system proxy.
- Copy `/etc/shadowsocks-libev/agentrix-ws.json` before server-side tunnel edits.
- Copy `/etc/systemd/system/agentrix-ss-ws.service` and `/etc/systemd/system/agentrix-ss-cloudflared.service` before unit edits.

## Minimum Verification Set

- Confirm the local SOCKS listener is up on `127.0.0.1:1080`.
- Confirm proxied outbound access succeeds, for example through `curl --proxy socks5h://127.0.0.1:1080 https://api.ipify.org`.
- Confirm Windows system proxy still points to `localhost:1080` if system proxy mode is expected.
- Confirm `agentrix-ss-ws.service` is active after server-side tunnel edits.
- Confirm `agentrix-ss-cloudflared.service` is active after tunnel edits.
- Confirm the tunnel hostname still resolves and accepts traffic when Cloudflare quick tunnel mode is in use.

## Current Known-Good Baseline

- Local SOCKS endpoint: `127.0.0.1:1080`
- Local system proxy target: `localhost:1080`
- Current Cloudflare quick tunnel hostname: `nano-washer-cadillac-printable.trycloudflare.com`
- Server-side WebSocket tunnel config path: `/etc/shadowsocks-libev/agentrix-ws.json`
- Server-side overlay units: `agentrix-ss-ws.service`, `agentrix-ss-cloudflared.service`

## Recovery Priority

- First recover the local SOCKS listener.
- Then recover proxied outbound internet.
- Then recover or rotate the Cloudflare tunnel hostname.
- Only after traffic is restored should workflow scripts or automation be refactored.

## Long-Term Hardening Recommendations

- Prefer a named Cloudflare Tunnel or another stable hostname over repeated temporary quick tunnel rotation.
- Keep the direct Shadowsocks baseline path untouched as a fallback while testing overlays.
- Keep network-change automation isolated from normal app deploy automation.
- Record each known-good network state in repo memory after recovery work completes.