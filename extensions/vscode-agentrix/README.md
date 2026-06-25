# Agentrix — VS Code / Cursor / Windsurf Extension

> C_Path main form per
> [`docs/agentrix-positioning-2026-05.zh-CN.md`](../../docs/agentrix-positioning-2026-05.zh-CN.md) §7 P3.

Inject Agentrix's **cross-tool memory**, **long-running agent tasks**, and
**cross-device collaboration** into your existing IDE — without replacing
your editor, your Tab completion, or your Cmd+K.

## What it does

- **Chat sidebar** — talk to Agentrix from inside the IDE; same backend as
  the desktop app (`/api/claude/chat`).
- **Background tasks panel** — see long-running agent tasks even when your
  IDE chat window is closed (they keep running on the server).
- **Cross-tool memory recall** — pull in what Agentrix has remembered from
  Chrome, Office, the desktop floating ball, etc.
- **Sign in via Personal Access Token** — token kept in the IDE's secret
  storage, never written to disk in plain text.

## What it explicitly does NOT do

- ❌ Reimplement Tab autocomplete (you have Cursor / GitHub Copilot for that)
- ❌ Reimplement Cmd+K inline edit
- ❌ Bundle a Monaco editor — diffs are rendered via `vscode.diff` command
- ❌ Compete with the IDE's chat at the editor layer

This is a **collaboration extension**, not a replacement.

## Status

`v0.1.0` — initial scaffolding. Not yet published to the VS Code Marketplace
nor to OpenVSX. Build locally with `npm run compile` and load via
`Extensions: Install from VSIX`.

## Build

```bash
cd extensions/vscode-agentrix
npm install
npm run compile
# Optional: npm run package  → produces .vsix
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `agentrix.apiBaseUrl` | `https://api.agentrix.top` | Backend base URL |
| `agentrix.preferredMode` | `pro` | Simple / Standard / Pro Mode |

## Roadmap

| Version | Scope |
|---------|-------|
| 0.1 (this) | Scaffolding · chat sidebar · tasks tree · PAT auth · memory recall command |
| 0.2 | Device-code OAuth flow · streaming SSE proper parser · IdeBridge reverse RPC |
| 1.0 | Marketplace publish (VS Code Marketplace + OpenVSX for Cursor / Windsurf) |

## License

MIT. See `LICENSE` at repo root.
