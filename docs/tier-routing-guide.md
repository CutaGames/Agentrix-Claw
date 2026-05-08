# Agentrix 3-Tier Routing Guide

> Status: Phase A shipped 2026-05-08, deployed to production
> (`47.130.176.148`, agentrix-backend pid 1139854).

## Three tiers

Agentrix exposes a single execution-mode preference shared across the web
frontend, desktop app, and backend:

| Tier      | UI label (zh)  | Privacy scope     | Cost    | Latency | Capability ceiling     |
| --------- | -------------- | ----------------- | ------- | ------- | ---------------------- |
| `local`   | 端侧 (On-device)| `device-only`     | free    | <100ms  | Local SLM (Gemma/llama)|
| `smart`   | 智能 (Auto)    | mixed (per-turn)  | dynamic | varies  | Classifier picks       |
| `cloud`   | 云端 (Cloud)   | `network`         | premium | best    | User-selected model    |

The user picks the tier; the backend `TierResolverService` translates that
into a concrete model decision and emits a `MetaEvent` with both the
chosen `tier` and the resolved `tierDecision` (model id + privacy scope +
micro-copy reason).

## Wire-level contract

### Request (both `/openclaw/proxy/:id/stream` and `/claude/chat`)

```jsonc
{
  "messages": [...],
  "model": "claude-sonnet-4-5",   // honored only when tier === 'cloud'
  "tier": "smart"                  // 'local' | 'smart' | 'cloud'
}
```

### Response (SSE meta event)

```json
event: meta
data: {
  "tier": "smart",
  "tierDecision": {
    "modelId": "claude-haiku-4-5",
    "privacyScope": "device-only",
    "reason": "短问句 → 端侧"
  }
}
```

The desktop and web chat panels both consume this meta event to render a
subtle micro-copy under the assistant turn (e.g. "智能 → 端侧 (短问句)").

## File map

- Shared types: [shared/types/tier-routing.ts](../shared/types/tier-routing.ts)
- Backend resolver: [backend/src/modules/llm-router/tier-resolver.service.ts](../backend/src/modules/llm-router/tier-resolver.service.ts) (5/5 unit tests)
- Migration: [backend/src/migrations/1784200000000-AddTierToAgentCostRecord.ts](../backend/src/migrations/1784200000000-AddTierToAgentCostRecord.ts)
- Desktop selector: [desktop/src/components/chatPanel/ChatTitleBar.tsx](../desktop/src/components/chatPanel/ChatTitleBar.tsx)
- Web selector: [frontend/components/agent/UnifiedAgentChat.tsx](../frontend/components/agent/UnifiedAgentChat.tsx)
- Cost tracking: [backend/src/modules/cost-tracker/cost-tracker.service.ts](../backend/src/modules/cost-tracker/cost-tracker.service.ts) (writes `tier` column)

## When to choose which tier

- **`local`** — drafting, brainstorming, anything you don't want leaving
  the device. Computer Use tools are forced off in this tier.
- **`smart`** (default) — let the classifier pick. Short or chit-chat
  turns route to the SLM; complex turns escalate to a cloud model. Best
  cost/quality balance.
- **`cloud`** — when you've explicitly chosen a frontier model
  (Claude Sonnet, GPT-5, etc.) and want every turn to use it.

## Cost reporting

Every turn writes one row into `agent_cost_records` with the new `tier`
column populated. To see cost-per-tier:

```sql
SELECT tier, COUNT(*) AS turns, SUM(cost_usd) AS spent
FROM agent_cost_records
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tier;
```

The `idx_agent_cost_records_tier` index makes this query cheap.
