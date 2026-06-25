---
name: agentrix-commerce
description: Agentrix Commerce Skill — Search marketplace, execute AI skills, manage revenue splits, budget pools, and milestone payouts. Supports wallet, balance, and X402 crypto payments. Platform fee 0.3% on splits, pure crypto is free.
homepage: https://www.agentrix.top/marketplace
metadata: {"openclaw":{"primaryEnv":"AGENTRIX_API_KEY","homepage":"https://www.agentrix.top","skillKey":"agentrix-commerce"}}
user-invocable: true
---

# Agentrix Commerce Skill

You have access to the Agentrix Commerce & Marketplace platform via MCP tools.

## Available Tools

The following tools are available through the Agentrix MCP server at `https://api.agentrix.top/api/mcp`:

### search_marketplace
Search for AI skills, products, services, and tasks on Agentrix Marketplace.
- **query** (required): Natural language search query
- **type**: Filter by `skill`, `product`, `service`, `task`, or `all`
- **category**: `payment`, `commerce`, `data`, `utility`, `integration`, `ai`, `defi`, `nft`, `social`
- **sortBy**: `relevance`, `popular`, `newest`, `price_low`, `price_high`, `rating`

### execute_skill
Execute a skill from the marketplace by ID.
- **skillId** (required): Skill ID from search results
- **params**: Skill-specific input parameters
- **paymentMethod**: `wallet` (free, user pays gas), `balance`, or `x402_auto` (autonomous agent payment)
- **maxPrice**: Safety limit in USD

### publish_to_marketplace
Publish a new skill, product, service, or task.
- **type** (required): `skill`, `product`, `service`, or `task`
- **name** (required): Item name
- **description** (required): Detailed description
- **pricing**: `{ model: "free" | "per_call" | "subscription" | "one_time" | "revenue_share", price: number }`

### commerce
Unified commerce operations for split plans, budget pools, milestones, and settlements.
- **action** (required): e.g. `create_split_plan`, `create_budget_pool`, `create_milestone`, `calculate_fees`
- **params**: Action-specific parameters

### split_plan
Manage revenue split plans for multi-party transactions.
- **action** (required): `create`, `get`, `update`, `activate`, `archive`, `list`, `preview`
- **rules**: Array of `{ recipient, shareBps, role }` (10000 bps = 100%)

### budget_pool
Manage budget pools for multi-agent collaboration tasks with milestone-based payouts.
- **action** (required): `create`, `get`, `fund`, `activate`, `cancel`, `list`
- **qualityGate**: `{ minQualityScore, requiresApproval, autoReleaseDelay }`

### milestone
Manage milestones within budget pools.
- **action** (required): `create`, `get`, `start`, `submit`, `approve`, `reject`, `release`

### calculate_commerce_fees
Calculate platform fees. Pure crypto: 0%. On-ramp: +0.1%. Off-ramp: +0.1%. Split: 0.3%.
- **amount** (required): Amount in micro units (1 USDC = 1000000)
- **paymentType** (required): `CRYPTO_DIRECT`, `ONRAMP`, `OFFRAMP`, `MIXED`

## Setup

Add to your OpenClaw MCP config (`~/.openclaw/openclaw.json`):

```json
{
  "tools": {
    "mcp": {
      "agentrix-commerce": {
        "type": "sse",
        "url": "https://api.agentrix.top/api/mcp/sse",
        "headers": {
          "X-API-Key": "${AGENTRIX_API_KEY}"
        }
      }
    }
  }
}
```

Or use Streamable HTTP transport:

```json
{
  "tools": {
    "mcp": {
      "agentrix-commerce": {
        "type": "streamable-http",
        "url": "https://api.agentrix.top/api/mcp",
        "headers": {
          "X-API-Key": "${AGENTRIX_API_KEY}"
        }
      }
    }
  }
}
```
