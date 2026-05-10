# AGENTS.md

> Quick orientation for any AI coding agent (Copilot, Claude Code, Codex,
> Cursor, etc.) working on this repository.

## What this repo is

Agentrix — an **AI Agent Economy Platform** spanning web (Next.js),
mobile (React Native + Expo), desktop (Tauri 2.0 + Rust + WebView2),
and a NestJS + PostgreSQL backend. 80+ backend modules, dozens of
streaming chat surfaces.

## Hard rules

1. **TypeORM uses `SnakeNamingStrategy` globally.** Never write
   `name: 'snake_case'` inside `@Column()` decorators — it's automatic.
2. **Two chat paths must stay in sync**: `/openclaw/proxy/:id/stream`
   and `/claude/chat`. Any new tool, meta event, or request field must
   land in both.
3. **Production server is `47.130.176.148`** (Singapore). SSH key at
   `C:\Users\15279\Desktop\hq.pem`. Backend lives in
   `/home/ubuntu/Agentrix/backend`, managed by PM2 as `agentrix-backend`.
4. **Default reply language is Chinese (中文)** unless the user explicitly
   asks for English.

## Default workflow

Per `/memories/workflow-rules.md` the standard cycle is:

1. Modify code
2. Validate (`tsc --noEmit`, relevant `jest`)
3. If backend: SSH deploy + `npm run build` + `migration:run` if needed +
   `pm2 restart agentrix-backend`
4. `git commit && git push origin <branch>`
5. If mobile: push to `CutaGames/Agentrix-Claw` to trigger APK CI
6. If desktop: build .exe via the desktop CI matrix

Don't ask for confirmation between trivial steps — proceed.

## Where things live

- **Backend (NestJS)** — `backend/src/modules/**`. Migrations in
  `backend/src/migrations/`. Cost tracking writes to `agent_cost_records`.
- **Web frontend (Next.js 15)** — `frontend/`. Chat UI is
  `frontend/components/agent/UnifiedAgentChat.tsx`.
- **Desktop (Tauri 2.0)** — `desktop/src/` (React) + `desktop/src-tauri/src/`
  (Rust). Computer Use modules in `desktop/src-tauri/src/computer_use/`.
- **Mobile (Expo SDK 54)** — `src/screens/` and `App.tsx` here, with the
  public-build mirror at `CutaGames/Agentrix-Claw`.
- **Shared types** — `shared/types/`. Anything used by ≥2 apps must live
  here.

## Key features documented

- [docs/computer-use-guide.md](docs/computer-use-guide.md) — desktop
  Computer Use (mouse/keyboard/screen + system Chrome via CDP).
- [docs/tier-routing-guide.md](docs/tier-routing-guide.md) — 3-tier
  execution preference (local / smart / cloud).
- [docs/desktop-prd-v3.md](docs/desktop-prd-v3.md) — desktop product spec.
- [docs/web-prd-v3.md](docs/web-prd-v3.md) — web product spec.
- [docs/mobile-prd-v3.md](docs/mobile-prd-v3.md) — mobile product spec.
- [docs/wearable-prd-v3.md](docs/wearable-prd-v3.md) — wear-OS / watch.
- [docs/agentrix-cross-platform-prd-v3.md](docs/agentrix-cross-platform-prd-v3.md)
  — cross-platform synthesis.

## Approval policy for autonomous agents

**Velocity window (until go-live freeze)** — 2026-05-10 decision: while
the platform is in pre-launch sprint mode, use the product-owner's
credentials proactively to keep iteration fast:
- `hq.pem` on the operator's desktop may be used for SSH deploy.
- GitHub PATs in `git remote -v` may be used for push.
- PEM/PAT rotation + file relocation happens as part of the pre-launch
  security freeze, **not** during active sprints.

With that understanding:

- **Auto-approved**: docs, tests, data reports, info gathering, **backend
  SSH deploy (`git pull` + `npm run build` + `migration:run` +
  `pm2 restart`)**, mobile build-branch push.
- **Timeout auto (12-24h)**: feature-branch push, social content, growth
  experiments.
- **Still requires user confirmation**: destructive ops (drop table,
  rm -rf, force-push main), push to `main`/`master`, financial decisions
  over $500, partnerships, anything the user has flagged as high-risk in
  a prior turn.

When the pre-launch security freeze starts, this policy reverts: SSH key
+ all PATs rotated, and all production deploys return to "manual
required" gating.

## Memory model

This repo's agents use Copilot-style persistent memory under
`/memories/repo/`. Notable recent entries:

- `computer-use-phase-b1-b6-shipped-2026-05-08.md`
- `p2-shipped-2026-05-07.md`
- `server-info-update-2026-04-24.md` — current server + PM2 process names.

When you discover a non-obvious gotcha (xcap API quirks, Tauri ACL JSON
locations, etc.), record it under `/memories/repo/` so the next agent
session does not have to re-derive it.
