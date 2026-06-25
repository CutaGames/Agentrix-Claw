# Phase 5 + Phase 6 M1/M2/M3 — Combined Validation Report

> Branch: `v3-p0-w1-presence-contracts`
> Base commit: `5617ca18` (pet soul gating + desktop rive runtime)
> Target commit: this PR (Phase 6 M2 + M3)
> Generated: 2026-05

## Scope

This report consolidates the most recent three delivery slices and validates
that they are live in production and covered by tests / DB checks:

| Slice | PRD anchor | Status |
|---|---|---|
| Phase 5 catchup — scan mode + dev portal SDK contracts | §8.x BE-9 / WB-12.2 | ✅ deployed (commit `6cc1b714`) |
| Phase 6 **M1** — 5-clan seed (B/C/D/E/F) + `/clans` landing | §9.2 M1 | ✅ deployed (commit `6cc1b714`) |
| Phase 6 **M2** — multi-pet team (子宠 / sub-pets) | §9.2 M2 | 🟢 this PR |
| Phase 6 **M3** — pet NFT mint intent scaffold | §9.2 M3 | 🟢 this PR |

---

## 1. Phase 5 Catchup (already deployed at `6cc1b714`)

### Scan mode (BE-9.1 / 9.2 / 9.3)

- `pet-generation` — extra `mode: 'scan' | 'standard'`; scan path uses the
  fast model + skips heavy memory hydration.
- `pet-gen-quota` — scan billing unit fixed at **2** (vs 1 for standard).
- Smoke: `POST /api/v1/pet-generation` with `mode=scan` returns 200 and
  decrements the daily quota by 2.

### Dev portal SDK contracts (WB-12.2)

- `frontend/pages/dev-portal/index.tsx` now links to `bridge-sdk.md` and
  `pet-soul-template.md` under `docs/`.
- Smoke: `curl https://agentrix.top/dev-portal` → 200, links present in HTML.

---

## 2. Phase 6 M1 — 5-clan seed + landing (already deployed at `6cc1b714`)

### DB verification

Query (run on `47.130.176.148` via SSH, 2026-05):

```bash
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE -tAc \
  "SELECT clan, COUNT(*) FROM pet_soul_templates GROUP BY clan ORDER BY clan;"
```

| clan | rows |
|---|---|
| `A_office`  | 7  |
| `B_life`    | 5  |
| `C_learn`   | 4  |
| `D_play`    | 4  |
| `E_web3`    | 4  |
| `F_family`  | 3  |
| **total**   | **27** |

Migration `1782800000000-PetSoulTemplateSeedBCDEF.ts` matches PRD §9.2 M1
expectations (5 new clans + 20 new templates on top of the existing 7 A-clan
templates).

### Landing page

- `frontend/pages/clans.tsx` renders the 6 clans as tiles, each linking to
  the SDK skill catalog. Smoke: `curl https://agentrix.top/clans` → 200.

---

## 3. Phase 6 M2 — multi-pet team (this PR)

PRD: `docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md` §9.2 M2 — "1 主宠 + ≤11 子宠 / 多分身管理"

### Files

| File | Purpose |
|---|---|
| `backend/src/entities/pet-team-member.entity.ts` | Sub-pet row (parent → role → soul template) |
| `backend/src/modules/pet-team/pet-team.service.ts` | grant / list / updateScope / pause / resume / revoke |
| `backend/src/modules/pet-team/pet-team.controller.ts` | `/api/v1/pet/team/*` (JwtAuthGuard) |
| `backend/src/modules/pet-team/pet-team.module.ts` | Module wiring |
| `backend/src/modules/pet-team/pet-team.service.spec.ts` | 7 unit tests, Map-backed repo |
| `backend/src/migrations/1782900000000-PetTeamMembersPhase6M2.ts` | Table + indexes |

### Schema (`pet_team_members`)

```
id                    uuid PK default uuid_generate_v4()
parent_living_pet_id  uuid NOT NULL
user_id               uuid NOT NULL                 (idx)
role                  varchar(32) NOT NULL          ── 11 codenames
soul_template_id      varchar(64) NOT NULL
display_name          varchar(64) DEFAULT ''
scope                 jsonb       DEFAULT '{}'      ── 工具白名单 / 风险等级 / 区域
daily_budget_usd      numeric(8,2) DEFAULT 0.50
wallet_address        varchar(96) NULL
status                varchar(16) DEFAULT 'active'  (idx; active|paused|revoked)
created_at / updated_at  timestamptz

UNIQUE (parent_living_pet_id, role)                  ── 自然 11 槽位封顶
```

### Endpoints (all `JwtAuthGuard` + 调用前校验 `LivingPet.userId === caller`)

- `GET    /api/v1/pet/team/roles`                                 — list 11 codenames
- `GET    /api/v1/pet/team/:parentLivingPetId`                    — list members
- `POST   /api/v1/pet/team/:parentLivingPetId/members`            — grant role
- `PATCH  /api/v1/pet/team/:parentLivingPetId/members/:memberId`  — update scope/budget/displayName
- `PUT    /api/v1/pet/team/:parentLivingPetId/members/:memberId/pause`
- `PUT    /api/v1/pet/team/:parentLivingPetId/members/:memberId/resume`
- `DELETE /api/v1/pet/team/:parentLivingPetId/members/:memberId`  — revoke

### 11 valid roles

`ceo, dev, qa_ops, growth, ops, media, ecosystem, community, brand, hunter, treasury`
(matches `.github/copilot-instructions.md` agent team)

### Tests — `PetTeamService` (7 ✅)

- grants a role and lists it
- rejects duplicate role on same parent
- rejects unknown role
- caps team at 11 distinct roles via unique (parent, role)
- pause / resume / revoke transition status
- updateScope mutates scope, budget, displayName
- refuses cross-parent member access

---

## 4. Phase 6 M3 — pet NFT mint intent scaffold (this PR)

PRD: `docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md` §9.2 M3 — "宠物链上身份 / NFT mint"

> **Scope of this PR is scaffolding only.** The actual on-chain submission is
> done by an external signer worker (out of scope). This module provides the
> off-chain intent row + state machine + REST API the worker will drive.

### Files

| File | Purpose |
|---|---|
| `backend/src/entities/pet-nft-intent.entity.ts` | Mint intent row + state enum |
| `backend/src/modules/pet-nft/pet-nft.service.ts` | create / cancel / list + signer-driven `markReady` / `markSubmitted` / `markMinted` / `markFailed` |
| `backend/src/modules/pet-nft/pet-nft.controller.ts` | `/api/v1/pet/nft/*` (JwtAuthGuard) |
| `backend/src/modules/pet-nft/pet-nft.module.ts` | Module wiring |
| `backend/src/modules/pet-nft/pet-nft.service.spec.ts` | 8 unit tests |
| `backend/src/migrations/1782910000000-PetNftIntentsPhase6M3.ts` | Table + indexes (incl. partial unique) |

### Schema (`pet_nft_intents`)

```
id                  uuid PK
user_id             uuid NOT NULL                       (idx)
living_pet_id       uuid NOT NULL                       (idx)
soul_template_id    varchar(64) NOT NULL
intimacy_snapshot   smallint NOT NULL                   ── 快照 mint 时亲密度
chain               varchar(16) NOT NULL                ── base|eth|bsc|sol
contract_address    varchar(96)
token_id            varchar(96)
tx_hash             varchar(96)
recipient_address   varchar(96) NOT NULL
metadata_uri        varchar(256)
metadata            jsonb DEFAULT '{}'
status              varchar(16) DEFAULT 'pending'       (idx)
error_message       text
created_at / updated_at  timestamptz

UNIQUE (living_pet_id, chain) WHERE status NOT IN ('failed','cancelled')
```

### Mint gating

- `LivingPet.intimacyLevel >= 5` (configurable via `MIN_INTIMACY_LEVEL`)
- caller must own the pet
- chain ∈ {base, eth, bsc, sol}
- `recipientAddress` length 26..96 (covers EVM + Solana)
- 1 open intent per (pet, chain); duplicates rejected with the existing intent id

### State machine

```
pending  ─▶ ready  ─▶ submitted  ─▶ minted
            │           │
            ▼           ▼
        cancelled    failed
```

`pending → cancelled` and `ready → cancelled` are user-driven; everything
else is invoked by the (future) signer worker via the internal methods on
the service.

### Endpoints (`JwtAuthGuard`)

- `GET  /api/v1/pet/nft/config`                                — min intimacy + supported chains
- `GET  /api/v1/pet/nft/intents`                               — caller's intents (newest 50)
- `GET  /api/v1/pet/nft/intents/:id`                           — single intent
- `POST /api/v1/pet/nft/living-pets/:livingPetId/intents`      — create pending intent
- `POST /api/v1/pet/nft/intents/:id/cancel`                    — cancel

### Tests — `PetNftService` (8 ✅)

- creates a pending intent for an eligible pet
- blocks mint when intimacy below threshold
- blocks unsupported chain
- blocks cross-user pet
- blocks duplicate open intent on same pet+chain
- runs the full state machine (`pending → ready → submitted → minted`)
- cancel transitions pending → cancelled
- markFailed sets reason

---

## 5. Validation Gates

| Gate | Result |
|---|---|
| `npx tsc -p tsconfig.build.json` | ✅ clean (0 errors) |
| `npx jest src/modules/pet-team src/modules/pet-nft` | ✅ **2 suites / 15 tests passed** |
| Migration timestamps | `1782900000000` (M2) and `1782910000000` (M3); strictly after the most recent migration `1782800000000` (M1 seed) |
| Auth | All write endpoints behind `@UseGuards(JwtAuthGuard)`; expect 401 unauth |
| Ownership | Both modules verify `LivingPet.userId === caller.userId` before mutating |

### Smoke (post-deploy)

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://agentrix.top/api/v1/pet/team/<uuid>/members
# → 401

curl -s -o /dev/null -w "%{http_code}\n" -X POST https://agentrix.top/api/v1/pet/nft/living-pets/<uuid>/intents
# → 401

# DB tables exist
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USERNAME -d $DB_DATABASE -tAc \
  "SELECT to_regclass('pet_team_members'), to_regclass('pet_nft_intents');"
# → pet_team_members|pet_nft_intents
```

---

## 6. Deferred / Follow-up

Tracked explicitly so they don't fall off the radar:

- **Real on-chain mint integration** — signer worker (gas / wallet / chain RPC),
  metadata pinning to IPFS / Arweave, tx watcher to advance `submitted → minted`.
- **Frontend UIs** for `/pet/team` and `/pet/nft` — backend ready, only landing
  page exists today.
- **Desktop multi-pet UI** — PRD §9.2 M2 bullet "桌面多宠并存 UI" — depends on the
  REST contracts shipping in this PR; will be picked up in the desktop slice.
- **Mobile** (CutaGames/Agentrix-Claw) — explicitly deferred per user direction;
  REST contracts above are unchanged for mobile to consume later.

---

## 7. Branch + commit summary

- Branch: `v3-p0-w1-presence-contracts`
- Previous deployed commit: `5617ca18`
- This PR commit message:

  ```
  feat(phase6): M2 multi-pet team + M3 pet NFT mint intent scaffold

  - M2 pet_team_members table + service/controller/module + 7 unit tests
  - M3 pet_nft_intents table + service/controller/module + 8 unit tests
  - Wired both modules into AppModule
  - Combined validation report under docs/
  ```
