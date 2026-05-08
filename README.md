# Agentrix — AI Agent Economy Platform

> **Agentrix Desktop = the only desktop AI companion that lets _you_ decide
> where the model runs, what data it sees, and which apps it can touch.**

Cross-platform AI agents (web + mobile + **desktop** + wearable) with a
transparent 3-tier execution preference, hard-coded Rust red-lines around
Computer Use, and a real economy layer (X402 payments, skill marketplace,
agent-to-agent protocol).

## Why Agentrix vs Codex / Manus / Genspark

| Capability                          | Agentrix Desktop          | OpenAI Codex Desktop | Manus      | Genspark   |
|-------------------------------------|---------------------------|----------------------|------------|------------|
| Runs on **your** machine (not VM)   | ✅ Tauri 2.0 + Rust       | ❌ remote sandbox    | ❌ cloud VM | ❌ cloud   |
| Tier-routed model choice (local/smart/cloud) | ✅ user-visible    | ❌ vendor-locked     | ❌         | ❌         |
| OS-level Computer Use (mouse/kb/screenshot) | ✅ enigo + xcap     | partial              | sandbox    | ❌         |
| System Chrome via CDP (real cookies)| ✅ HTTP + WS              | ❌ headless          | ❌         | ❌         |
| Hard red-lines in **Rust** (cmd.exe / sudo blocked) | ✅          | policy-only          | policy     | policy     |
| 4-layer approval (OS / toggle / per-action / hard block) | ✅     | per-action           | per-action | per-action |
| Per-task cost tracking + tier audit | ✅ `agent_cost_records`   | ❌                   | ❌         | ❌         |
| Mobile + Desktop + Wearable parity  | ✅ shared `/shared/types` | ❌ desktop only      | ❌ web only | ❌ web only |
| Pet / personality differentiation   | ✅ VRM avatars + memory   | ❌                   | ❌         | ❌         |
| Open agent economy (X402 / ERC-8004)| ✅                        | ❌                   | ❌         | ❌         |

📘 Deep dives: [docs/computer-use-guide.md](docs/computer-use-guide.md) ·
[docs/tier-routing-guide.md](docs/tier-routing-guide.md) ·
[docs/desktop-prd-v3.md](docs/desktop-prd-v3.md) ·
[AGENTS.md](AGENTS.md)

---

# ClawLink — Mobile App

Personal AI Agent mobile companion for the Agentrix platform.

**Built with**: React Native (Expo SDK 54), TypeScript, Zustand

## Quick Start

```bash
npm install
npx expo start
```

## Build APK

Triggered automatically on push to `main` via GitHub Actions.
Latest APK: [Releases](https://github.com/CutaGames/Agentrix-Clawlink/releases)

## Features

- Connect to your OpenClaw AI agent instance (cloud / local / BYOC)
- Agent console, chat, and skill marketplace
- X402 payment protocol + multi-wallet support
