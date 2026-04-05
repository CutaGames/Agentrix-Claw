# Agentrix Project Instructions

## Project Overview

Agentrix is an AI Agent Economy Platform — enabling AI agents to work, trade, and grow across web, mobile, and desktop.

## Tech Stack

- **Backend**: NestJS (80+ modules), TypeORM with SnakeNamingStrategy, PostgreSQL
- **Frontend Web**: Next.js 15, React, TailwindCSS, shadcn/ui
- **Mobile**: React Native (Expo SDK 54), in `CutaGames/Agentrix-Claw` repo
- **Desktop**: Tauri 2.0, Rust + WebView2
- **Server**: 18.139.157.116 (Singapore, agentrix.top), PM2 managed
- **CI**: GitHub Actions, mobile builds triggered by push to `CutaGames/Agentrix-Claw`

## Critical Conventions

- TypeORM uses `SnakeNamingStrategy` globally — NEVER use explicit `name:` in `@Column()` decorators
- Two chat paths must stay in sync: `/openclaw/proxy/:id/stream` AND `/claude/chat`
- All tools must work in BOTH chat paths
- SSH key for production: `C:\Users\15279\Desktop\hq.pem`
- Output in Chinese (中文) by default unless asked otherwise

## Agent Team

This project is operated by an 11-agent team. See `.github/agents/` for individual agent files.
Each agent also exists as an OpenClaw instance on the platform (admin account: zhouyachi2023@gmail.com).

| Agent | Codename | Model Tier | Role |
|-------|----------|-----------|------|
| CEO/Architect | @ceo | 💎 Opus | Strategy, architecture, team coordination |
| Full-Stack Dev | @dev | 🔥 Standard | All code: backend + frontend + mobile + desktop |
| QA/DevOps | @qa-ops | 🆓 Free | Testing, CI/CD, deployment, monitoring |
| Growth Officer | @growth | 🔥 Standard | User acquisition, experiments, pricing |
| Operations | @ops | 🆓 Free | OKR, data analysis, cost tracking |
| Social Media | @media | 🆓 Free | Twitter, blog, newsletter, SEO |
| Ecosystem | @ecosystem | ⚡ Budget | Developer relations, skill marketplace, MCP |
| Community | @community | 🆓 Free | Discord/Telegram, GitHub, events |
| Brand | @brand | 🆓 Free | Brand voice, landing pages, pitch materials |
| Resource Hunter | @hunter | 🆓 Free | Free resources, grants, accelerators |
| Treasury | @treasury | 🆓 Free | Wallet management, DeFi, bounties |

## Approval Rules

- 🟢 **Auto-approved**: Docs, tests, data reports, info gathering
- 🟡 **Timeout auto (12-24h)**: Feature branch push, social content, growth experiments
- 🔴 **Manual required**: Production deploy, DB migration, main/build branch push, financial > $500, partnerships
