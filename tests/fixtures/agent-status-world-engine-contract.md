# Agent Status API — World Engine Backwards-Compatibility Contract

> Requirement 11.4: The existing `GET /api/v1/agents/:id/status` response SHALL remain
> backwards-compatible: any new world-engine fields added to the response SHALL be optional,
> non-null defaults SHALL not be required, and existing mobile/desktop/wearable clients
> SHALL continue to function without changes after the world-engine fields are added.

## Baseline Response (pre-World Engine)

See `tests/fixtures/agent-status-pre-world-engine.json` for the full snapshot.

Existing clients (mobile v4, desktop v4, wearable v4) depend on this shape. **No field
may be removed, renamed, or have its type changed.**

## Opt-in Query Parameter

```
GET /api/v1/agents/:id/status?includeWorldEngine=true
```

When `includeWorldEngine` is **absent or false**, the response is identical to the
pre-World Engine snapshot — zero new fields are present.

When `includeWorldEngine=true`, the following **additional** fields are appended to the
response object:

| Field | Type | Description |
|-------|------|-------------|
| `bound_asset_id` | `string \| null` | UUID of the World_Asset bound to this Agent, or `null` if unbound |
| `bound_asset_name` | `string \| null` | Display name of the bound World_Asset (1-30 chars), or `null` |
| `xp` | `number` | Current XP accumulated by the bound World_Asset (0 if unbound) |
| `level` | `number` | Current level of the bound World_Asset (1 if unbound) |
| `next_threshold` | `number \| null` | XP needed for next skill slot unlock (null if max level reached). Thresholds: 100, 500, 1500, 5000 |
| `recent_actions` | `AgentAction[]` | Last 20 autonomous actions (or all within 24h, whichever is fewer). Empty array if unbound |

### `AgentAction` shape

```typescript
interface AgentAction {
  id: string;              // UUID
  action_type: 'greet_owner' | 'comment_time' | 'suggest_battle' | 'interact_collection';
  description: string;     // Human-readable description of what the agent did
  target_asset_id?: string; // For interact_collection: the other asset involved
  performed_at: string;    // ISO 8601 timestamp
}
```

## Example: Response WITH `?includeWorldEngine=true`

```json
{
  "agent_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "My Assistant Agent",
  "status": "active",
  "personality": "Friendly and helpful, always eager to assist with tasks",
  "system_prompt": "You are a helpful assistant...",
  "delegation_level": "assistant",
  "capabilities": ["chat", "task_management", "recommendations"],
  "channel_bindings": [...],
  "memory_config": {...},
  "avatar_url": "https://cdn.agentrix.io/avatars/agent-a1b2c3d4.png",
  "default_model": "gpt-4o",
  "is_published": false,
  "metadata": {...},
  "stats": {...},
  "created_at": "2026-03-01T08:00:00.000Z",
  "updated_at": "2026-05-16T14:22:00.000Z",

  "bound_asset_id": "f7e8d9c0-b1a2-3456-7890-abcdef123456",
  "bound_asset_name": "Thunder Cat",
  "xp": 320,
  "level": 3,
  "next_threshold": 500,
  "recent_actions": [
    {
      "id": "11111111-2222-3333-4444-555555555555",
      "action_type": "greet_owner",
      "description": "Thunder Cat waved hello and purred contentedly",
      "performed_at": "2026-05-16T14:00:00.000Z"
    },
    {
      "id": "22222222-3333-4444-5555-666666666666",
      "action_type": "suggest_battle",
      "description": "Thunder Cat is itching for a fight and challenges nearby rivals",
      "performed_at": "2026-05-16T13:30:00.000Z"
    }
  ]
}
```

## Example: Response WITHOUT query param (default — backwards-compatible)

```json
{
  "agent_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "My Assistant Agent",
  "status": "active",
  "personality": "Friendly and helpful, always eager to assist with tasks",
  "system_prompt": "You are a helpful assistant...",
  "delegation_level": "assistant",
  "capabilities": ["chat", "task_management", "recommendations"],
  "channel_bindings": [...],
  "memory_config": {...},
  "avatar_url": "https://cdn.agentrix.io/avatars/agent-a1b2c3d4.png",
  "default_model": "gpt-4o",
  "is_published": false,
  "metadata": {...},
  "stats": {...},
  "created_at": "2026-03-01T08:00:00.000Z",
  "updated_at": "2026-05-16T14:22:00.000Z"
}
```

No `bound_asset_id`, `bound_asset_name`, `xp`, `level`, `next_threshold`, or
`recent_actions` fields are present. Existing clients never see them.

## Implementation Notes

1. The controller handling `GET /api/v1/agents/:id/status` should check for the
   `includeWorldEngine` query parameter.
2. If absent/false → return the standard agent status object only.
3. If true → additionally query the `world_assets` table for any asset where
   `boundAgentId = :agentId`, and append the world-engine fields.
4. The world-engine fields are computed server-side; no client migration needed.
5. This approach ensures zero breaking changes for existing clients while allowing
   new World Engine-aware clients to request the extended data.
