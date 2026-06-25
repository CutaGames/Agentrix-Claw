# Feature Flag System — Audit + Multi-Agent v1 Extension

> **Wave**: W0 (Pre-flight audit) — Task 0.4
> **Date**: 2026-05-26
> **Auditor**: Dev Agent

## Existing system summary

`backend/src/modules/world-engine/feature-flag.service.ts` implements
`WorldEngineFeatureFlagService` with:

- **Backing store**: `admin_config` table, column `key`, JSON `metadata` column
- **Cohort strategy**: `user_id_hash` — SHA-256("flagKey:" + userId) → bucket 0-99
- **Override modes**:
  - allowlist (always true)
  - denylist (always false)
  - rollout percentage (0-100, default off)
- **Cache TTL**: 60 s in-memory (`CACHE_TTL_MS`)
- **Invalidation**: `invalidateCache()` method (used by admin tools)

Test coverage: `feature-flag.service.spec.ts` 9 tests (verified 2026-05-26).

## v1 multi-agent flag — `multi_agent_world_engine_visualization` (W6)

Per task 0.4 acceptance + R14.5:

- **Flag key**: `multi_agent_world_engine_visualization`
- **Default**: OFF (rolloutPercentage = 0)
- **Toggle path**: existing admin tool — set `admin_config` row
  `(key='multi_agent_world_engine_visualization', value='true', metadata={ type:'feature_flag', rolloutPercentage:N, rolloutStrategy:'user_id_hash', allowlist:[], denylist:[] })`
- **Implementation**:
  - W6 task 6.1 will reuse `WorldEngineFeatureFlagService` directly OR
    extend it to support arbitrary flag keys via constructor injection
  - Recommended: keep service single-flag (less risk), copy service for
    each new flag — `MultiAgentWorldEngineVizFlagService` with same shape
  - Naming convention: `<DomainName>FeatureFlagService` per flag

## Decision: copy service per flag (not generalize)

Rationale:

1. Generic `FeatureFlagService` would need flag registry / type union
   bloat for type-safety
2. Per-flag service is 30 lines, copy-paste cost is low
3. Each domain owns its flag in its own module (clear ownership)

W6 task 6.1 implementation:

```typescript
// backend/src/modules/multi-agent/multi-agent-feature-flag.service.ts (NEW in W6)
@Injectable()
export class MultiAgentFeatureFlagService {
  private static readonly FLAG_KEY = 'multi_agent_world_engine_visualization';
  // ... copy structure from WorldEngineFeatureFlagService
}
```

## v1 W1-W5 are NOT flag-gated

The base v1 R1-R12 features are **always-on for all users**. Only W6
(World Engine integration) is flag-gated, because it touches
performance-sensitive scan-pipeline rendering.

W7 (marketplace hire) will likely also be flag-gated — but that's a v2
post-launch sprint decision, not v1 scope.

## Audit conclusion

✅ Feature flag system supports the W6 use case as-is. No new
infrastructure needed in v1. W6 sprint adds 1 new
`MultiAgentFeatureFlagService` (copy of existing pattern) +
1 admin_config row insertion via migration.
