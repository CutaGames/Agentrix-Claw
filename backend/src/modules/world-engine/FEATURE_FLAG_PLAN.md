# Feature Flag Plan: `world_engine_enabled`

> Task 0.4 — Confirms feature flag system support for `world_engine_enabled`  
> Requirement: 11.8

---

## 1. Existing Feature Flag System — Findings

**No dedicated `feature-flags/` module exists in the codebase.**

The PRD (`docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md`, §3.1) planned a `feature-flags/` backend module supporting per-user / per-region / percentage-based rollout, but this module was **never implemented**. The codebase has no files matching `feature-flag`, `featureFlag`, `LaunchDarkly`, `Unleash`, or `GrowthBook`.

**What does exist:**

| Component | Location | Capability |
|-----------|----------|------------|
| `AdminConfig` entity | `backend/src/entities/admin-config.entity.ts` | Generic key-value config store (`admin_configs` table) with `key`, `value` (text), `category` (enum), `metadata` (JSONB), `isPublic` (boolean) |
| Admin Config CRUD API | `GET/POST/PUT /admin/system/configs/:key` | Full CRUD via `SystemManagementService` in `backend/src/modules/admin/services/system-management.service.ts` |
| `ConfigCategory` enum | Same entity file | Values: `platform`, `payment`, `commission`, `marketing`, `risk`, `system` |

The `AdminConfig` table can store a flag value, but it lacks:
- Per-user or per-cohort evaluation
- Percentage-based rollout logic
- A typed guard/decorator for NestJS controllers

---

## 2. Minimal Implementation Plan (Phase 1)

Since no feature flag system exists, we implement a **lightweight DB-backed feature flag service** sufficient for Phase 1 rollout. This reuses the existing `admin_configs` table (no new migration needed) and adds a thin service layer.

### 2.1 Flag Storage (reuse `admin_configs`)

```
key:       "world_engine_enabled"
category:  "system"
value:     "false"                          ← master kill-switch (string "true"/"false")
isPublic:  false
metadata:  {
  "type": "feature_flag",
  "rolloutPercentage": 0,                  ← 0-100, percentage of users who see the feature
  "rolloutStrategy": "user_id_hash",       ← deterministic: hash(userId) % 100 < rolloutPercentage
  "allowlist": [],                          ← explicit user IDs always included
  "denylist": [],                           ← explicit user IDs always excluded
  "description": "World Engine (Reality AI) feature gate"
}
```

### 2.2 Feature Flag Service

Create `backend/src/modules/world-engine/feature-flag.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminConfig } from '../../entities/admin-config.entity';
import * as crypto from 'crypto';

interface FeatureFlagMetadata {
  type: 'feature_flag';
  rolloutPercentage: number;       // 0–100
  rolloutStrategy: 'user_id_hash'; // deterministic cohort selection
  allowlist: string[];             // always-on user IDs
  denylist: string[];              // always-off user IDs
  description: string;
}

@Injectable()
export class WorldEngineFeatureFlagService {
  private static readonly FLAG_KEY = 'world_engine_enabled';

  constructor(
    @InjectRepository(AdminConfig)
    private readonly configRepo: Repository<AdminConfig>,
  ) {}

  /**
   * Evaluate whether the World Engine feature is enabled for a given user.
   *
   * Evaluation order:
   * 1. Master switch OFF → always false
   * 2. User in denylist → false
   * 3. User in allowlist → true
   * 4. Percentage rollout: hash(userId) % 100 < rolloutPercentage → true
   */
  async isEnabledForUser(userId: string): Promise<boolean> {
    const config = await this.configRepo.findOne({
      where: { key: WorldEngineFeatureFlagService.FLAG_KEY },
    });

    if (!config || config.value !== 'true') {
      return false; // master switch off
    }

    const meta = config.metadata as unknown as FeatureFlagMetadata;
    if (!meta || meta.type !== 'feature_flag') {
      return false;
    }

    if (meta.denylist?.includes(userId)) return false;
    if (meta.allowlist?.includes(userId)) return true;

    // Deterministic percentage-based cohort selection
    const hash = crypto
      .createHash('sha256')
      .update(`world_engine:${userId}`)
      .digest();
    const bucket = hash.readUInt16BE(0) % 100; // 0–99
    return bucket < meta.rolloutPercentage;
  }
}
```

### 2.3 Guard Decorator for Controllers

Create `backend/src/modules/world-engine/guards/world-engine-flag.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WorldEngineFeatureFlagService } from '../feature-flag.service';

@Injectable()
export class WorldEngineFlagGuard implements CanActivate {
  constructor(private readonly flagService: WorldEngineFeatureFlagService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) return false;
    return this.flagService.isEnabledForUser(userId);
  }
}
```

All World Engine controllers apply `@UseGuards(WorldEngineFlagGuard)` so that requests from users outside the rollout cohort receive HTTP 404 (feature invisible).

### 2.4 Mobile Client Gate

The mobile client calls a lightweight endpoint (or piggybacks on an existing config endpoint) to check flag status:

```
GET /api/v1/world-engine/enabled
Response: { enabled: boolean }
```

When `enabled: false`, the mobile client hides all World Engine UI surfaces (scan button, inventory tab, battle entry).

---

## 3. Default Value

| Property | Value |
|----------|-------|
| Master switch (`value`) | `"false"` (OFF) |
| `rolloutPercentage` | `0` |
| `allowlist` | `[]` (empty) |
| `denylist` | `[]` (empty) |

The feature is **completely invisible** to all users until an admin explicitly enables it.

---

## 4. Toggle API (Admin)

Uses the existing Admin Config CRUD endpoints — no new endpoints required:

### Enable for internal testing (allowlist only)

```http
PUT /admin/system/configs/world_engine_enabled
Content-Type: application/json

{
  "value": "true",
  "metadata": {
    "type": "feature_flag",
    "rolloutPercentage": 0,
    "rolloutStrategy": "user_id_hash",
    "allowlist": ["<internal-tester-user-id-1>", "<internal-tester-user-id-2>"],
    "denylist": [],
    "description": "World Engine (Reality AI) feature gate"
  }
}
```

### Rollout to 1% cohort

```http
PUT /admin/system/configs/world_engine_enabled
{
  "value": "true",
  "metadata": {
    "type": "feature_flag",
    "rolloutPercentage": 1,
    "rolloutStrategy": "user_id_hash",
    "allowlist": [],
    "denylist": [],
    "description": "World Engine (Reality AI) feature gate"
  }
}
```

### Rollout to 10%

```http
PUT /admin/system/configs/world_engine_enabled
{
  "value": "true",
  "metadata": { ..., "rolloutPercentage": 10 }
}
```

### Full rollout (100%)

```http
PUT /admin/system/configs/world_engine_enabled
{
  "value": "true",
  "metadata": { ..., "rolloutPercentage": 100 }
}
```

### Emergency kill-switch (instant off for everyone)

```http
PUT /admin/system/configs/world_engine_enabled
{
  "value": "false"
}
```

---

## 5. Rollout Mechanism — Percentage-Based Cohort Selection

| Step | `rolloutPercentage` | Observation Period | Proceed Criteria |
|------|--------------------:|-------------------:|------------------|
| Internal QA | 0 (allowlist only) | 3–5 days | Zero P0/P1 bugs |
| Beta | 1% | ≥ 24 hours | Error rate < 0.1%, latency P99 < 15s |
| Expanded Beta | 10% | ≥ 24 hours | Same as above + positive user feedback |
| GA | 100% | — | Stable metrics for 48h at 10% |

**Cohort assignment is deterministic:** `SHA-256("world_engine:" + userId) mod 100`. This means:
- A user always lands in the same bucket (no flickering between sessions)
- Increasing the percentage from 1% → 10% includes all previous 1% users (superset property)
- Telemetry events tag `world_engine_flag_cohort` for A/B comparison (per Task 21.3)

---

## 6. Future Considerations (Post-Phase 1)

If the platform needs more feature flags beyond `world_engine_enabled`, consider:
- Extracting the flag logic into a standalone `feature-flags/` module (as originally planned in the Pet PRD)
- Adding region-based gating (`metadata.regions: ["cn", "sg"]`)
- Adding device-type gating (mobile-only, desktop-only)
- Caching flag evaluation in Redis (TTL 60s) to avoid DB reads on every request
- Migrating to a dedicated `feature_flags` table with proper schema

For Phase 1, the `admin_configs` approach is sufficient — it requires zero new migrations, reuses existing admin CRUD, and supports the required percentage-based rollout.
