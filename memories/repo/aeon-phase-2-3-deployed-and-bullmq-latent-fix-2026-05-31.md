# Aeon Phase 2-3 deployed + bullmq latent-dependency fix (2026-05-31)

## What shipped
- Commit `17808cd40` on `feat/multi-agent-v2-1-llm-router-byo`: Aeon Phase 2
  (dual-avatar controller, agent-driver, async inbox, server-authoritative
  identity badge + chat attribution) + Phase 3 (economy ledger facade,
  compliance gate AXP+digital-currency, org/OPC company + clock-in + wages,
  unified task-contract state machine plaza/bounty/kpi escrow, marketplace
  aggregator facade).
- Migration `1800100000000-AeonWorldPhase3` created 4 tables:
  `aeon_orgs`, `aeon_org_members`, `aeon_task_contracts`, `aeon_ledger_entries`.
- Deployed to prod `47.130.176.148`, pm2 `agentrix-backend` online on :3000.
- Verified: `/api/v1/aeon/plots` 401, `/api/v1/aeon/tasks` 401 (auth-gated =
  routes mounted), `/socket.io/` 200. `GET /api/v1/aeon/orgs` is 404 BY DESIGN
  (OrgController has no root `@Get()`, only POST + `/mine` + `/:id`).

## CRITICAL GOTCHA — bullmq is a latent/undeclared dependency
- `backend/src/modules/world-engine/reconstruction/{reconstruction.service,
  reconstruction.processor}.ts` do a STATIC `import { Queue/Worker } from 'bullmq'`.
- **bullmq was NOT in package.json and NOT in package-lock.json** — the prod
  process had been running an OLD dist (built before that import existed) held
  in memory. Any fresh `npm run build` + pm2 restart re-`require`s bullmq and
  crash-loops with `Cannot find module 'bullmq'` (MODULE_NOT_FOUND), taking the
  WHOLE backend down (app.module → world-engine.module → scan.controller).
- FIX applied on prod: `npm install bullmq@^5 --save --legacy-peer-deps`
  (installed 5.77.6; ioredis 5.10.0 already present; Redis is up, `redis-cli ping`
  = PONG; connection = REDIS_HOST/REDIS_PORT from .env, default localhost:6379).
- `--legacy-peer-deps` is REQUIRED on this server: langchain/zod/stagehand peer
  conflict otherwise blocks `npm install`.
- **TODO (not yet committed to repo)**: add `bullmq` to `backend/package.json`
  deps + regen lockfile in WSL/CI so CI builds don't break. Prod node_modules is
  patched but repo package.json still missing it.

## Other pre-existing build noise (non-fatal, ignore)
- `nest build` reports 12 TS errors in world-engine (WorldAsset[] vs WorldAsset
  `.save()` return type in asset-creation.service.ts; bullmq module-not-found at
  type level; shared/types/world-engine.ts rootDir warning). Build script falls
  back to tsc and continues because dist outputs exist. These are NOT Aeon and
  predate this work.

## Migration-run gotcha on prod
- `npm run migration:run` (ts-node via src) CRASHES: `src/` contains 220 stray
  compiled `*.entity.js` alongside `*.entity.ts`; data-source glob
  `**/*.entity{.ts,.js}` double-loads decorators → `Cannot read properties of
  undefined (reading 'constructor')` in PrimaryGeneratedColumn.
- WORKAROUND that works: run migrations from the COMPILED dist data-source:
  `node ./node_modules/typeorm/cli.js migration:run -d dist/config/data-source.js`
  (dist has only .js, no double-load). Used this to apply AeonWorldPhase3.

## Backend prefix/port reminder
- Prod backend listens on **:3000** with global prefix **`api`**, so Aeon REST
  is `/api/v1/aeon/...` (NOT :3001 — that's the Next.js frontend router worker).
