# Provider Costs & Stack — World Engine

> Last updated: 2026-05-20 (Wave 9-16 + Bedrock refactor)
> Authoritative provider list per AGENTS.md.

## Active Provider Stack

### 3D Reconstruction
| Tier | Provider | Mode | Cost/call (est.) | Latency target |
|------|----------|------|------------------|----------------|
| **Primary (Fast)** | Tencent Hunyuan3D | imageUrl (single image) | $0.05 | 15s |
| **Primary (Precision)** | Tencent Hunyuan3D | imageUrl (multi-view) | $0.05 | 90s |
| **Fallback (deferred)** | Meshy | image-to-3D | $0.08 | — |

**Phase 1 reality**: Only Hunyuan3D is wired. Meshy fallback remains in code but is auto-disabled when `MESHY_API_KEY` is unset (graceful degradation, no error). Self-hosted GPU pool deferred to Phase 2.

**Auth**:
- `TC_SecretId` + `TC_SecretKey` env vars (already set in production for pet-generation)
- Reuses `Hunyuan3DProvider` from `backend/src/modules/pet-generation/`

### AI Interpreter (Vision Analysis)
| Tier | Provider | Model | Cost (per 1M tok) | Use case |
|------|----------|-------|-------------------|----------|
| **Default** | AWS Bedrock | Claude Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`) | $0.80 in / $4 out | All scans, fast classification |
| **Pro upgrade** | AWS Bedrock | Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-20250514-v1:0`) | $3 in / $15 out | Auto-escalated when Haiku confidence <60% |
| **BYOK** | User-supplied | Any Bedrock model (incl. Opus 4.7) | User pays | Pro tier subscribers, advanced creators |
| **Fallback** | Rule-based | 50-class lookup table | $0 | All Bedrock providers down |

**Auth**:
- Platform: `AWS_BEARER_TOKEN_BEDROCK` env var (existing) → Bearer token API
- BYOK: User passes `accessKeyId` / `secretAccessKey` / `region` per request
- Reuses `BedrockIntegrationService.invokeVisionModel()` (added 2026-05-20)

**Important — model IDs**:
AWS Bedrock requires the **inference profile prefix `us.`** for these models.
Base IDs (e.g. `anthropic.claude-haiku-4-5-...`) return HTTP 400. Verified
2026-05-20 via `tests/e2e/test-bedrock-vision-v2.sh`.

**Vision capability verified**:
- ✅ Haiku 4.5 returns image descriptions correctly (1.8s latency on 64×64 PNG, 40 input tokens)
- ✅ Sonnet 4 returns image descriptions correctly (1.7s latency, same prompt)
- ✅ Opus 4.1 returns image descriptions correctly (3.9s latency)

**Confidence-based escalation**:
- Default tier (Haiku) returns categoryConfidence < 60% → auto-retry with Sonnet
- Sonnet failure → keep Haiku result, do not fall through to rule-based

### Style Renderer (Phase 1)
- **Metadata-driven**: client renders styled GLB using stored style params
- No external Provider call
- Phase 2 will add server-side Blender Python pipeline

## Cost Estimates Per User Action

| Action | 3D | Vision | Total | Notes |
|--------|-----|--------|-------|-------|
| Quick Scan + Default Interpret | $0.05 | $0.0008 | **$0.051** | Haiku, 1 image, ~1k tokens |
| Quick Scan + Pro upgrade | $0.05 | $0.005 | **$0.055** | Sonnet escalation |
| Detail Scan + Default Interpret | $0.05 | $0.002 | **$0.052** | 5 images |
| Detail Scan + Pro upgrade | $0.05 | $0.012 | **$0.062** | Multi-image Sonnet |
| Room Scan + Dungeon | $0.05 | $0.003 | **$0.053** | Same vision call, plus dungeon math (free) |
| Character regenerate | $0 | $0.001 | **$0.001** | LLM only, no 3D |
| Battle | $0 | $0 | **$0** | Deterministic, no LLM |
| Share card | $0 | $0 | **$0** | Phase 1 placeholder; Phase 2 + headless WebGL |

## Free Tier Monthly Budget

Per R13.4: $5 USD/month per FREE user.

**Coverage** (Phase 1):
- $5 / $0.051 (Quick + Haiku) = ~98 quick scans
- More than enough for the 5-per-day daily cap × 30 days = 150 scans
- The daily cap is the binding constraint, not the monthly cost

**Soft warning**: 80% ($4)
**Hard block**: 100% ($5)

## Production Secrets Checklist

Required in production `.env` for full functionality:

```bash
# 3D Reconstruction (REQUIRED)
TC_SecretId=...                 # Tencent Cloud secret ID
TC_SecretKey=...                # Tencent Cloud secret key

# AI Interpreter (REQUIRED — at least one of these)
AWS_BEARER_TOKEN_BEDROCK=...    # Platform Bedrock bearer token (recommended)
AWS_REGION=us-east-1            # Default region for platform calls
# OR (legacy): AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY

# Optional fallbacks
MESHY_API_KEY=...               # Meshy 3D fallback (degrades gracefully if absent)

# Optional cn-region moderation overlay
BAIDU_MODERATION_API_KEY=...
ALIYUN_MODERATION_API_KEY=...
```

## Cost Monitoring

- Every Provider call writes to `agent_cost_records` (table existing pre-World-Engine)
- Admin dashboard: `GET /api/admin/world-engine/cost-summary`
  - Aggregates by `provider × userId × day`
  - Materialized view refreshed every 15 min (Phase 1: query-based, no MV)
- Alert thresholds (manual setup in Datadog/CloudWatch):
  - Single user >$1/day → notify ops
  - Single Provider >3× 7-day avg → notify ops + auto-throttle queue depth

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-08 | Hunyuan3D primary, Meshy fallback (fast-track only) | Already in production, no procurement needed |
| 2026-05-08 | No self-hosted GPU in Phase 1 | Defer cost / ops complexity until 1% cohort proves demand |
| **2026-05-20** | **Switch AI Interpreter from GPT-4V/Gemini to Bedrock Haiku/Sonnet** | **Aligns with platform LLM strategy (AGENTS.md); reuses existing BedrockIntegrationService; lower latency in same VPC** |
| 2026-05-20 | Auto-escalate to Sonnet when Haiku confidence <60% | Better UX for ambiguous objects; bounded cost increase |
| 2026-05-20 | BYOK route for Pro+ subscribers | User pays own AWS bill; unlocks Opus 4.7 / future models |
