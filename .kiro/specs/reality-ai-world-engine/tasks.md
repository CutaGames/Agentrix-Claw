# Implementation Plan: Reality AI World Engine (Phase 1: AI UGC Engine)

## Overview

This plan implements the Reality → AI World Engine feature, converting real-world objects into game assets via dual-track 3D reconstruction, AI semantic interpretation, character/dungeon generation, battle system, Agent binding, social sharing, and marketplace integration. The implementation uses TypeScript throughout — NestJS backend with TypeORM/PostgreSQL, Expo SDK 54 mobile client with React Native, and shared types.

## Tasks

- [x] 0. Pre-flight compatibility & infrastructure audit
  - [x] 0.1 Audit existing pet, agent, marketplace schemas to confirm zero-touch coexistence
    - Read `backend/src/entities/living-pet.entity.ts`, `family-pet.entity.ts`, all `agent_*` entities, and `agent_cost_records` schema
    - Document any field name collisions or shared FK risks in `backend/src/modules/world-engine/COMPAT_AUDIT.md`
    - Verify `WorkspacePlan.maxAgents` (FREE=3 / PRO=10 / BUSINESS=50 / ENTERPRISE=200) is the single source of truth for slot quota
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 0.2 Audit existing Agent API response schema for backwards-compatibility plan
    - Snapshot the current `GET /api/v1/agents/:id/status` response shape into a fixture file `tests/fixtures/agent-status-pre-world-engine.json`
    - Define the `?includeWorldEngine=true` opt-in contract for new fields
    - _Requirements: 11.4_

  - [x] 0.3 Provider availability and cost confirmation (gate for §7 of design)
    - Confirm Meshy API key procurement, Stability/Replicate/RunPod account, and self-hosted GPU pool plan
    - Capture initial Provider cost-per-call estimates in `backend/src/modules/world-engine/reconstruction/PROVIDER_COSTS.md`
    - _Requirements: 13.1, 13.7, 13.8_

  - [x] 0.4 Confirm feature flag system supports `world_engine_enabled`
    - Verify the project's existing feature flag plumbing supports a new flag with cohort-percentage rollout
    - Document the flag's default value (off) and the toggle API
    - _Requirements: 11.8_

- [x] 1. Set up project structure, core interfaces, and data models
  - [x] 1.1 Create shared type definitions and interfaces
    - Create `shared/types/world-engine.ts` with all core interfaces: `SemanticDescription`, `CharacterStats`, `Skill`, `BehaviorTreeNode`, `QualityScore`, `DungeonLayout`, `BattleRound`, `StyleRendererConfig`, `ReconstructionProvider`, `ReconstructionInput`, `ReconstructionOutput`, `ModerationDecision`, `QuotaUsageEvent`, `ProviderHealthStatus`
    - Create `shared/types/world-engine-api.ts` with API request/response DTOs for all endpoints
    - All entity property names use camelCase per the project's global TypeORM `SnakeNamingStrategy` (column names auto-derived; never hand-write `name: 'snake_case'` in `@Column()`)
    - _Requirements: 2.5, 3.1, 4.2, 5.3, 11.4, 12.8, 13.2_

  - [x] 1.2 Create database entities and migration
    - Create `backend/src/modules/world-engine/entities/world-asset.entity.ts` with full `WorldAsset` entity (TypeORM, SnakeNamingStrategy, camelCase property names, `@VersionColumn` for optimistic locking)
    - Create `backend/src/modules/world-engine/entities/battle.entity.ts` with `Battle` entity
    - Create `backend/src/modules/world-engine/entities/dungeon.entity.ts` with `Dungeon` entity
    - Create `backend/src/modules/world-engine/entities/scan-session.entity.ts` with `ScanSession` entity
    - Create `backend/src/modules/world-engine/entities/world-asset-moderation-decision.entity.ts` with `WorldAssetModerationDecision` entity (per design §11)
    - Generate TypeORM migration for all new tables (`world_assets`, `battles`, `dungeons`, `scan_sessions`, `world_asset_moderation_decisions`)
    - _Requirements: 2.3, 3.1, 4.2, 5.1, 9.1, 12.8_

  - [x] 1.3 Create the World Engine NestJS module scaffold
    - Create `backend/src/modules/world-engine/world-engine.module.ts` registering all sub-modules
    - Create controller stubs for: `ScanController`, `AssetController`, `BattleController`, `DungeonController`, `ShareController`, `MarketplaceController`
    - Create service stubs for: `ReconstructionService`, `AIInterpreterService`, `StyleRendererService`, `GameEngineService`, `AgentBindingService`, `ShareService`
    - Wire module into the main `AppModule`
    - _Requirements: 2.1, 2.4, 3.1, 4.1, 5.1_

- [ ] 2. Implement Scan & Reconstruction backend services
  - [~] 2.1 Implement the pluggable Provider Registry and Reconstruction Service
    - **REUSE existing infrastructure**: The project already has `backend/src/modules/pet-generation/hunyuan3d.provider.ts` (Tencent Cloud AI3D, TC3-HMAC-SHA256, async submit+poll), `meshy.provider.ts`, `provider-failover.ts` (runWithFailover helper), and `scan/scan.service.ts` (multi-view scan with daily quota check). World Engine's ReconstructionService should **wrap/extend** these existing providers rather than rewriting from scratch.
    - Create `backend/src/modules/world-engine/reconstruction/provider-registry.ts` that imports and delegates to existing `Hunyuan3DProvider` (primary for both fast and precision tracks) and `MeshyProvider` (fallback for fast-track), using the existing `runWithFailover()` helper from `provider-failover.ts`
    - Implement pipeline router: quick scan → Hunyuan3D (imageUrl mode, single image), detail scan → Hunyuan3D (multi-view mode via existing scan service)
    - MeshyProvider as fallback for fast-track only; precision-track fallback deferred to Phase 2 (no self-hosted GPU needed in Phase 1)
    - Set up TWO BullMQ queues `reconstruction-fast` and `reconstruction-precision` so a precision-track stall does not starve fast-track jobs (per design §7)
    - Configure per-Provider concurrency caps in the registry: Meshy=5, Stability=3, TripoSR=2/A10 instance, InstantMesh=1/A10, LGM=1/A40 (per design §7)
    - Add timeout handling per pipeline (15s fast / 90s precision)
    - Write one row to `agent_cost_records` per Provider call capturing `providerName`, `tier`, `userId`, `estimatedCostUsd`, `latencyMs` (per Requirement 13.1)
    - Implement automatic Provider switching via background job: compute 7-day rolling avg cost-per-call per Provider; when current Provider exceeds threshold, route next same-tier request to lower-cost Provider; only fall back if the cheaper Provider is unhealthy (per Requirement 13.8)
    - _Requirements: 2.1, 2.2, 2.4, 2.14, 2.15, 13.1, 13.7, 13.8_

  - [~] 2.2 Implement Scan API endpoints
    - Implement `POST /api/v1/world-engine/scan/start` — create scan session
    - Implement `POST /api/v1/world-engine/scan/:sessionId/upload` — multipart image upload (max 2MB), store to S3, return quality score
    - Implement `POST /api/v1/world-engine/scan/:sessionId/predict-quality` — overall quality prediction (1-5 stars)
    - Implement `POST /api/v1/world-engine/scan/:sessionId/generate` — submit to reconstruction pipeline
    - Implement `GET /api/v1/world-engine/jobs/:jobId/status` — poll job status
    - Implement WebSocket `/api/v1/world-engine/jobs/:jobId/stream` — real-time progress events
    - _Requirements: 14.6, 14.7, 14.8, 14.9, 2.1, 2.2, 10.3_

  - [ ]* 2.3 Write unit tests for Provider Registry and pipeline routing
    - Test provider fallback when primary is unavailable
    - Test timeout handling for both pipelines
    - Test job queue processing and status transitions
    - _Requirements: 2.4, 2.14_

- [ ] 3. Implement AI Interpreter and Style Renderer services
  - [~] 3.1 Implement AI Interpreter Service
    - Create `backend/src/modules/world-engine/ai-interpreter/ai-interpreter.service.ts`
    - Implement `analyze(meshUrl, imageUrls[])` calling GPT-4V/Gemini Vision API
    - Parse LLM response into structured `SemanticDescription` with confidence scores
    - Implement category disambiguation logic (top-3 suggestions when confidence < 60)
    - Add retry logic (2 retries, 2s interval) for LLM API timeouts
    - Implement rule-based fallback classifier (mesh bbox axis ratios + dominant color sampling → 50-class lookup) per design §9; activate when both GPT-4V AND Gemini are unavailable; force `categoryConfidence` to 50 and emit a "lite mode" marker on the response so the UI can show a degraded-mode badge
    - _Requirements: 2.5, 2.6, 2.7, 2.8 (see design §9 — AI service fallback paths)_

  - [~] 3.2 Implement Style Renderer Service
    - Create `backend/src/modules/world-engine/style-renderer/style-renderer.service.ts`
    - Implement `stylize(meshUrl, style, config)` dispatching to Blender Python headless pipeline
    - Support all 5 styles: cartoon, pixel-art, fantasy, sci-fi, realistic
    - Implement geometry smoothing with silhouette preservation
    - Output styled .glb + thumbnail + animated GIF
    - Enforce 5-second processing timeout
    - _Requirements: 2.9, 2.10, 2.11_

  - [ ]* 3.3 Write property test for Style Renderer bounding box preservation
    - **Property 8: 风格化保真性 — Style_Renderer output bounding box dimensions deviate ≤10% from input**
    - **Validates: Requirements 2.10**

  - [ ]* 3.4 Write unit tests for AI Interpreter
    - Test structured output parsing from LLM responses
    - Test confidence threshold logic and category disambiguation
    - Test retry behavior on API timeout
    - _Requirements: 2.5, 2.6, 2.7_

- [ ] 4. Implement Character Generator and Game Engine
  - [~] 4.1 Implement Character Generator Service
    - Create `backend/src/modules/world-engine/game-engine/character-generator.service.ts`
    - Implement deterministic stat mapping formula: size→HP, sharpness→ATK, density→DEF, aerodynamics→SPD, complexity→INT (formula always applies regardless of LLM availability)
    - Generate exactly 2-4 STARTER skills occupying fixed starter slots, kept separate from the up-to-4 GROWTH skill slots that unlock via XP per Requirement 6.4 (max 8 total skills at maximum level)
    - Implement skill generation incorporating real-world object references in skill names and effect descriptions
    - Implement personality traits and backstory generation via LLM
    - Implement template fallback (100 personality templates × 100 backstory templates, plus name templates) when the character-generation LLM is unavailable, per design §9; deterministic stat formula continues to apply
    - Implement perceptual-hash-keyed cache for input-image deduplication (24h TTL) per design §9 — same hash within 24h returns the cached character, reducing both LLM cost and providing degraded-mode redundancy
    - Implement AI_Behavior_Tree generation with idle/combat/social branches
    - Implement individual attribute regeneration (preserving unaffected attributes)
    - Enforce 15-second total generation timeout
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 6.4 (see design §9 — AI service fallback paths)_

  - [ ]* 4.2 Write property test for deterministic stat mapping
    - **Property 2: 属性映射确定性 — Identical SemanticDescription input always produces identical stat output**
    - **Validates: Requirements 3.2**

  - [~] 4.3 Implement Character Generation API endpoint
    - Implement `POST /api/v1/world-engine/assets/:id/generate-character`
    - Implement `POST /api/v1/world-engine/assets/:id/regenerate` for individual attribute regeneration
    - Wire character generation into the scan→generate pipeline (auto-trigger after reconstruction + interpretation)
    - _Requirements: 3.1, 3.5, 3.6_

  - [ ]* 4.4 Write unit tests for Character Generator
    - Test stat sum constraint (150-350 total)
    - Test skill count constraint (2-4 skills)
    - Test behavior tree structure (idle/combat/social branches)
    - Test error handling for incomplete semantic input
    - _Requirements: 3.1, 3.4, 3.7_

- [~] 5. Checkpoint — Wave 1-4 verification
  - Ensure all tests in waves up to this point pass (`tsc --noEmit`, `jest` for affected modules)
  - All MANDATORY property tests in this range are green (Task 6.2 if reached, otherwise none yet)
  - All `_Requirements:` references in tasks 1-4 resolve to a valid R/AC ID in requirements.md
  - Performance baseline (Task 22.1) shows no regression vs prior checkpoint, if applicable
  - Ask the user before proceeding if any unresolved error exists

- [ ] 6. Implement Battle System
  - [~] 6.1 Implement deterministic battle engine
    - Create `backend/src/modules/world-engine/game-engine/battle-engine.service.ts`
    - Implement `calculateDamage()` with seeded RNG, base damage formula, variance (0.85-1.15), and critical hit logic — `crit_chance = 0.10 + spd / 1000`; given the SPD range 1-100, this caps the critical hit chance at 20% when SPD = 100 (per Requirement 5.3, this 20% ceiling is the intended design maximum)
    - Implement `determineTurnOrder()` based on SPD comparison (random tiebreak using same seed)
    - Implement turn-based combat loop with 20-round max limit
    - Implement XP award calculation (winner: 30-100, loser: 10-40, scaled by level diff)
    - Implement HP-percentage tiebreaker for max-round battles
    - _Requirements: 5.1, 5.3, 5.4, 5.8, 5.9_

  - [~] 6.2 Write property test for deterministic battle results [MANDATORY — core invariant]
    - **Property 1: 确定性战斗结果 — Same characters + same seed always produce identical battle outcome (every round's damage, winner)**
    - **Validates: Requirements 5.3**

  - [~] 6.3 Implement Battle API endpoints
    - Implement `POST /api/v1/world-engine/battles/create` — create battle between two assets
    - Implement `POST /api/v1/world-engine/battles/:id/accept` — accept async challenge
    - Implement `GET /api/v1/world-engine/battles/:id` — get battle details
    - Implement `POST /api/v1/world-engine/battles/challenge` — create async challenge with share link (72h expiry)
    - Implement `GET /api/v1/world-engine/battles/:id/replay` — get replay video URL
    - Handle edge case: challenged asset deleted/sold before acceptance
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 6.4 Write unit tests for battle engine
    - Test damage calculation bounds
    - Test critical hit probability
    - Test 20-round limit and HP-percentage tiebreaker
    - Test XP award scaling
    - _Requirements: 5.1, 5.3, 5.4, 5.8_

- [ ] 7. Implement Dungeon Builder
  - [~] 7.1 Implement Dungeon Builder Service
    - Create `backend/src/modules/world-engine/game-engine/dungeon-builder.service.ts`
    - Implement room layout parsing from scan data (walls, doors, furniture positions, walkable areas)
    - Implement enemy population logic based on room area (3-4 for <15m², 5-6 for 15-30m², 7-8 for >30m²)
    - Implement theme assignment based on detected room category (kitchen→fire, bedroom→dream, office→data, default→neutral)
    - Implement loot placement within 1m of furniture locations
    - Implement boss placement at largest open area (≥4m²)
    - Implement share code generation (6-12 alphanumeric, 30-day validity)
    - Enforce 30-second generation timeout
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 7.2 Write property test for dungeon share code uniqueness
    - **Property 6: 副本代码唯一性 — All active dungeon share_codes are unique and not reused before 30-day expiry**
    - **Validates: Requirements 4.5**

  - [~] 7.3 Implement Dungeon API endpoints
    - Implement `POST /api/v1/world-engine/dungeons/generate` — generate dungeon from room scan
    - Implement `GET /api/v1/world-engine/dungeons/:code` — load dungeon by share code
    - Implement `POST /api/v1/world-engine/dungeons/:code/attempt` — start dungeon attempt
    - Handle partial dungeon generation for <180° coverage (fog of war boundary)
    - _Requirements: 4.1, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 7.4 Write unit tests for Dungeon Builder
    - Test enemy count by room area
    - Test theme assignment logic
    - Test partial dungeon generation for incomplete scans
    - _Requirements: 4.2, 4.3, 4.4, 4.7_

- [ ] 8. Implement Agent Binding and Growth System
  - [~] 8.1 Implement Agent Binding Service
    - Create `backend/src/modules/world-engine/agent-binding/agent-binding.service.ts`
    - Implement `bindAgent(assetId)` — create Agent instance with personality prompt + behavior tree
    - Implement `unbindAgent(assetId)` — remove Agent binding
    - Reuse `workspaceService.checkAgentQuota(userId)` (FREE=3 / PRO=10 / BUSINESS=50 / ENTERPRISE=200) as the single source of truth; World_Asset Agent and existing Pet Agent count against the SAME quota; serialize concurrent binds via a Redis mutex or DB row lock to prevent two parallel binds racing past the cap (Property 9)
    - Implement idle action scheduling (1-4 actions/hour after 5min idle): greet, comment time, suggest battle, interact collection
    - Implement XP award and skill slot unlock logic (thresholds: 100, 500, 1500, 5000 XP, max 4 GROWTH skill slots — separate from the 2-4 starter skill slots set at creation)
    - Extend existing `/api/v1/agents/:id/status` with world-engine fields (only when `?includeWorldEngine=true`, per Task 20.3)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 11.2, 11.3_

  - [~] 8.2 Write property test for Agent slot constraint [MANDATORY — core invariant]
    - **Property 5: Agent Slot 约束 — Bound Agent count never exceeds subscription max (free ≤ 3)**
    - **Validates: Requirements 6.6**

  - [~] 8.3 Write property test for XP monotonic increase [MANDATORY — core invariant]
    - **Property 7: XP 单调递增 — WorldAsset.xp only increases, never decreases (unless asset deleted)**
    - **Validates: Requirements 6.4**

  - [ ]* 8.4 Write unit tests for Agent Binding
    - Test binding with full Agent slots (should reject)
    - Test idle action frequency limits
    - Test XP threshold and skill slot unlock progression
    - _Requirements: 6.2, 6.3, 6.4, 6.6_

- [~] 9. Checkpoint — Wave 5-8 verification (battle, dungeon, agent binding shipped)
  - Ensure all tests in waves up to this point pass
  - All MANDATORY property tests in this range are green (Properties 1, 5, 7 — Tasks 6.2, 8.2, 8.3)
  - All `_Requirements:` references in tasks 5-8 resolve to a valid R/AC ID
  - Performance baseline (Task 22.1) shows no regression
  - Ask the user before proceeding if any unresolved error exists

- [ ] 10. Implement Share and Social features
  - [~] 10.1 Implement Share Service
    - Create `backend/src/modules/world-engine/share/share.service.ts`
    - Implement `generateCard(assetId, type)` — headless Three.js → animated GIF (3s, 1080×1080) + stats overlay
    - Implement `generateReplayVideo(battleId)` — FFmpeg server-side (15s, 9:16, 720p) with branded watermark + QR code
    - Implement deep link generation: `agentrix://world-engine/asset/{id}`, `agentrix://world-engine/battle/{id}`, `agentrix://world-engine/dungeon/{code}`
    - Implement web fallback preview page at `https://app.agentrix.io/world/{token}`
    - Enforce 5-second generation timeout for cards, 10-second for videos
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [~] 10.2 Implement Share API endpoints
    - Implement `POST /api/v1/world-engine/share/card` — generate share card
    - Implement `POST /api/v1/world-engine/share/video` — generate battle replay video
    - Implement `GET /api/v1/world-engine/share/preview/:token` — web preview HTML page
    - Handle deleted asset deep links (display "no longer available" notice)
    - _Requirements: 7.1, 7.3, 7.5, 7.7, 7.8_

  - [ ]* 10.3 Write unit tests for Share Service
    - Test deep link format generation
    - Test card generation timeout handling
    - Test deleted asset preview behavior
    - _Requirements: 7.1, 7.5, 7.7, 7.8_

- [ ] 11. Implement Marketplace Integration
  - [~] 11.1 Implement Marketplace World Asset Service (with two-phase ownership transfer per design §10)
    - Create `backend/src/modules/world-engine/marketplace/marketplace.service.ts`
    - Implement `createListing(assetId, price, currency)` — validate original creator, price range (0.01-999,999.99 USD / 1-10,000,000 AXP)
    - Implement `purchaseAsset(listingId, buyerId)` using the **two-phase commit protocol** from design §10:
      - **Phase 1 — Reserve (≤30s window):** insert a `marketplace_listing_reservation` row with `status='reserved'`, `buyerId`, `expiresAt = now() + 30s`; validate buyer's Workspace `maxAgents` quota (R11.2/R11.3); snapshot the asset's current `boundAgentId`, `xp`, `battleWins`, `battleLosses` into `pending_transfer_state` as the rollback truth
      - **Phase 2 — Commit (single DB transaction):** atomic ownership swap (`worldAsset.ownerId = buyer`, transfer bound Agent ownership, mark listing sold, delete reservation row); use **optimistic lock on `worldAsset.version`** (`@VersionColumn`) — version mismatch rolls back the entire transaction
    - Failure paths: release reservation row, refund buyer in full, leave asset + bound Agent with seller unchanged, notify both parties with the failure reason
    - Background cron releases reservations whose `expiresAt` has passed (handles 30s timeout case)
    - Idempotency: dedupe purchase requests by `paymentId` so retries do not double-charge or double-transfer
    - Implement suggested price calculation (rarity, battle record, skill uniqueness, 30-day median)
    - Implement "Battle-Proven" notification trigger (>10 battles, >70% win rate)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 11.2 Write property test for asset ownership integrity [MANDATORY — core invariant]
    - **Property 4: 资产所有权完整性 — At any point, a WorldAsset has exactly one owner_id. No "ownerless" or "dual-owner" state during transactions**
    - **Validates: Requirements 8.3, 8.4**

  - [~] 11.3 Implement Marketplace API endpoints
    - Implement `POST /api/v1/marketplace/world-assets/listing` — create listing
    - Implement `GET /api/v1/marketplace/world-assets` — browse listings with filters
    - Implement `POST /api/v1/marketplace/world-assets/:listingId/purchase` — purchase asset
    - Implement `GET /api/v1/marketplace/world-assets/:assetId/suggested-price` — price suggestion
    - _Requirements: 8.1, 8.3, 8.6_

  - [ ]* 11.4 Write unit tests for Marketplace
    - Test original creator validation for listing
    - Test ownership transfer atomicity
    - Test Agent slot check before purchase completion
    - Test suggested price calculation factors
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_

- [ ] 12. Implement World Asset Management (Inventory)
  - [~] 12.1 Implement Asset Management API endpoints
    - Implement `GET /api/v1/world-engine/assets` — list with filtering (category, source) and sorting (newest, level, battles), pagination
    - Implement `GET /api/v1/world-engine/assets/:id` — full detail view with stats, skills, battle history (last 20), Agent activity log (last 20)
    - Implement `PATCH /api/v1/world-engine/assets/:id` — rename (max 30 chars), change style
    - Implement `DELETE /api/v1/world-engine/assets/:id` — with blocking check (active listing / pending challenge)
    - Implement collection value estimation and completion badges
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 12.2 Write unit tests for Asset Management
    - Test deletion blocking for active listings
    - Test filtering and sorting logic
    - Test collection badge calculation
    - _Requirements: 9.2, 9.4, 9.6_

- [~] 13. Checkpoint — Wave 9-12 verification (share, marketplace, inventory shipped)
  - Ensure all tests in waves up to this point pass
  - All MANDATORY property tests in this range are green (Property 4 — Task 11.2)
  - All `_Requirements:` references in tasks 10-12 resolve to a valid R/AC ID
  - Performance baseline (Task 22.1) shows no regression
  - Ask the user before proceeding if any unresolved error exists

- [ ] 14. Implement Mobile Client — Reality Scanner
  - [~] 14.1 Camera lifecycle and scan mode UI
    - Create `src/screens/WorldEngineScannerScreen.tsx` (flat layout — see design.md "Mobile screen file layout convention")
    - Implement camera lifecycle with ARKit/ARCore integration
    - Implement scan mode selection UI (Quick Scan default, Detail Scan option, Room Scan entry)
    - Quick Scan UI: center-frame guide, 1-3 photo capture
    - Detail Scan UI: AR overlay with 8-position ring guide, 3D bounding box showing captured (green) vs needed (gray) angles
    - Room Scan UI: panoramic capture with 360° progress indicator
    - _Requirements: 1.1, 1.2, 1.3, 4.1_

  - [~] 14.2 Quality Gate Layer 1 — real-time preview guidance
    - Implement real-time distance indicator (15-50 cm valid range, haptic when out of range)
    - Implement lighting indicator (orange overlay when ambient brightness < 50 lux)
    - Implement stability indicator (pause capture when motion blur > 20% of frame area)
    - Implement occlusion detection (> 30% hand coverage → "move your fingers" prompt)
    - All Layer 1 detection paths must add ≤ 2 ms / frame to camera preview pipeline (R10.9)
    - _Requirements: 14.1, 14.2, 10.9_

  - [~] 14.3 Quality Gate Layer 2 — per-frame scoring
    - Implement per-frame scoring: sharpness (0-100), exposure (0-100), angle novelty (0-100)
    - Display colored border: green ≥ 70, yellow 40-69, red < 40
    - Implement retake prompt for frames scoring < 40 on any dimension with specific issue label ("too blurry" / "too dark" / "same angle as previous")
    - Implement positive haptic + green checkmark for frames scoring > 70 on all dimensions
    - _Requirements: 14.3, 14.4, 14.5_

  - [ ]* 14.4 Write property test for Quality Gate scoring consistency
    - **Property 3: 质量评分一致性 — Same image frame produces sharpness/exposure scores within ±2 deviation**
    - **Validates: Requirements 14.3**

  - [~] 14.5 Quality Gate Layer 3 + submission flow
    - Implement pre-submission "Generation Quality Prediction" (1-5 stars) computed from coverage / avg sharpness / lighting consistency / angle diversity
    - Show specific improvement suggestions when prediction < 3 stars (does NOT block submission)
    - Always allow proceed regardless of prediction; just show predicted level so user makes an informed choice
    - Implement image upload to backend with progress indicator and estimated time in seconds
    - Implement offline capture queue (up to 5 requests, 7-day retention)
    - Implement network loss handling (local retention, auto-retry within 5 minutes when connectivity restored)
    - Discard captured images if user cancels session before tapping "Generate" (return to previous screen within 1 s)
    - _Requirements: 14.6, 14.7, 14.8, 14.9, 15.1, 15.3, 15.4, 10.6, 10.7_

- [ ] 15. Implement Mobile Client — Game UI
  - [~] 15.1 Implement World Asset Inventory screen
    - Create `src/screens/WorldAssetInventoryScreen.tsx` (flat layout)
    - Implement grid view with 3D thumbnails, name, level, battle record
    - Implement filtering (category, source) and sorting (newest, level, battles) for 12+ assets
    - Implement detail view with rotatable 3D model (React Three Fiber), stats, skills, battle history, Agent activity log
    - Implement long-press context menu: rename, regenerate, bind/unbind Agent, list for sale, gift, delete
    - Implement empty state with prompt to Reality Scanner
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [~] 15.2 Implement Battle UI and Dungeon Explorer
    - Create `src/screens/WorldBattleArenaScreen.tsx` — battle visualization with attack effects, damage numbers, health bars (React Three Fiber + Reanimated)
    - Create `src/screens/WorldDungeonExplorerScreen.tsx` — dungeon exploration with fog of war, enemy encounters, loot collection
    - Implement battle results screen (winner, damage breakdown, MVP skill, XP earned)
    - Implement async challenge creation and acceptance flow
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 4.2, 4.7_

  - [~] 15.3 Implement Share and Social UI
    - Implement one-tap share to WeChat, Douyin, Instagram, Twitter, system share sheet
    - Implement share card preview before sharing
    - Implement deep link handling for incoming links (asset view, battle challenge, dungeon entry)
    - Implement fallback: copy deep link to clipboard when platform unavailable
    - _Requirements: 7.1, 7.4, 7.5, 7.7_

- [ ] 16. Implement Performance and Platform Adaptation
  - [~] 16.1 Implement caching, degraded mode, and performance optimizations
    - Implement local 3D asset cache (max 500MB, LRU eviction)
    - Implement degraded mode for low-spec devices (2-4GB RAM, iOS 15/Android 11): static scan guide, 2D preview
    - Implement push notification on generation completion (when user navigates away)
    - Implement 3-minute global timeout with error display and retry
    - Implement progress percentage updates every 3 seconds during generation
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.8, 10.10_

  - [ ]* 16.2 Write integration tests for end-to-end scan-to-asset flow
    - Test Quick Scan → reconstruction → interpretation → character generation pipeline
    - Test offline queue submission and retry
    - Test generation timeout handling
    - _Requirements: 14.9, 2.1, 3.6, 10.3, 10.4_

- [ ] 18. Implement Content Moderation Pipeline (R12)
  - [x] 18.1 Implement face detection on-device (TFLite)
    - Bundle a ~3 MB TFLite face detector with the Expo app
    - Reject upload if any frame contains a detectable human face occupying > 5% of frame area; do not retain the rejected image beyond the rejection response
    - _Requirements: 12.2_

  - [x] 18.2 Implement copyrighted-character classifier (server-side)
    - Integrate Replicate / Hive Moderation API or a self-hosted CLIP-based classifier
    - Reject when confidence > 70% for blocked categories: Disney, Marvel, Pokémon, Nintendo, Sanrio
    - _Requirements: 12.3_

  - [x] 18.3 Implement prohibited-words filter on AI Interpreter outputs
    - Run prohibited-words match on generated `name` / `backstory` / skill effect descriptions
    - Auto-regenerate up to 3 times before falling back to safe defaults ("Mystery Character", neutral backstory)
    - Reuse the platform's existing prohibited word list
    - _Requirements: 12.4_

  - [x] 18.4 Implement marketplace listing moderation queue
    - Create `world_asset_moderation_decisions` entity (per design §11) with 12-month retention TTL job
    - Build admin-only moderation reviewer dashboard endpoint
    - 24 h SLA tracker for listing review; listing remains hidden until queue returns "approved"
    - _Requirements: 12.5, 12.8_

  - [x] 18.5 Implement in-app Report button and post-publish review queue
    - Wire Report UI into shared World_Asset / dungeon screens
    - 48 h SLA; on violation, trigger takedown + refund pending battles + owner notification
    - _Requirements: 12.6, 12.7_

  - [x] 18.6 Implement first-time disclaimer acknowledgment gate
    - One-time consent dialog before user's first scan (R12.1)
    - Persist acknowledgment in user profile; never reshow once acknowledged
    - _Requirements: 12.1_

  - [x] 18.7 Implement cn-region moderation overlay
    - Wire baidu / aliyun moderation pipeline (existing platform integration) on top of stages 2 and 4 when user is in cn-region
    - Log all rejected uploads for compliance audit
    - _Requirements: 12.9_

  - [ ]* 18.8 Write unit tests for moderation pipeline
    - Test face-detection rejection threshold
    - Test copyright classifier confidence threshold
    - Test prohibited-words auto-regen up to 3× then fallback
    - Test moderation_decisions retention TTL
    - _Requirements: 12.2, 12.3, 12.4, 12.8_

- [ ] 19. Implement Quota & Rate Limiting (R13)
  - [x] 19.1 Implement Redis-based daily quota tracker
    - Key format: `quota:{eventType}:{userId}:{utcDate}` with TTL = remaining seconds to UTC midnight
    - Subscription-tier-aware limits per R13.2: FREE 5/1/1/10, PRO 30/5/3/50, BUSINESS+ 100/20/10/200 (Quick Scan / Detail Scan / Room Scan / character regenerations)
    - On 429 return clear "daily limit reached" message including reset time
    - _Requirements: 13.2, 13.3_

  - [x] 19.2 Implement monthly cost ceiling for free users
    - Query `SUM(agent_cost_records.estimatedCostUsd)` for current UTC month per user
    - Soft warning at 80%, hard block at 100%
    - Use $5 USD placeholder ceiling pending ops sign-off (Open Questions item #3 in design.md)
    - _Requirements: 13.4_

  - [x] 19.3 Implement AXP-purchased quota
    - New endpoint `POST /api/v1/world-engine/quota/purchase`
    - 30-day expiry on purchased quota; consume free quota first, then purchased quota in FIFO-by-expiry order
    - Initial exchange rate placeholders: 1 Quick Scan = 10 AXP, 1 Detail Scan = 50 AXP, 1 Dungeon = 30 AXP, 1 Replay Video = 5 AXP
    - _Requirements: 13.5_

  - [x] 19.4 Implement rate limiting (NestJS Throttler + Redis SET)
    - `@Throttle({ ttl: 10s, limit: 1 })` on scan-start
    - `@Throttle({ ttl: 3600s, limit: 50 })` long-window rate limit
    - Concurrent in-flight cap of 10 jobs per user via Redis SET `inflight:{userId}`; respond with HTTP 429 + `Retry-After` header on excess
    - _Requirements: 13.6_

  - [x] 19.5 Build admin cost dashboard endpoint and materialized view
    - Backend `GET /api/admin/world-engine/cost-summary`
    - PostgreSQL materialized view aggregating by Provider × userId × day
    - Cron: `REFRESH MATERIALIZED VIEW CONCURRENTLY` every 15 min
    - _Requirements: 13.7_

  - [ ]* 19.6 Write property test for quota monotonicity (Property 11)
    - **Property 11: 配额单调消耗与重置 — same-day counter strictly non-decreasing on success, resets at UTC rollover, no increment on 429**
    - **Validates: Requirements 13.2, 13.3**

  - [ ]* 19.7 Write unit tests for quota & rate limiting
    - Test daily-quota TTL boundary (last second before midnight)
    - Test AXP purchase consumption order (free first, then purchased FIFO by expiry)
    - Test rate-limit headers
    - Test concurrent-in-flight cap
    - _Requirements: 13.2, 13.3, 13.5, 13.6_

- [ ] 20. Implement Platform Compatibility & Feature Flag (R11)
  - [~] 20.1 Wire feature flag `world_engine_enabled` into all entry points
    - Hide all World Engine UI surfaces and API endpoints when flag is off
    - Default off; toggle via existing feature-flag admin
    - _Requirements: 11.8_

  - [~] 20.2 Implement shared Agent slot quota check across Pet and World_Asset
    - In `agentBindingService.bindAgent()`, count BOTH pet-bound and world-asset-bound agents against the same `workspace.maxAgents`
    - Wrap the count + bind in a serialised critical section (Redis mutex or DB row-level lock) to prevent racing past the cap
    - _Requirements: 11.2, 11.3_

  - [~] 20.3 Extend `GET /api/v1/agents/:id/status` with backwards-compatible world-engine fields
    - New fields ONLY appear when `?includeWorldEngine=true` query param is set
    - All new fields are optional; existing clients see identical schema
    - _Requirements: 11.4_

  - [~] 20.4 Add new `world-assets` sub-route under `/api/v1/marketplace/`
    - Do NOT modify existing `/api/v1/marketplace/` routes for non-world-engine assets
    - _Requirements: 11.5_

  - [~] 20.5 Inventory UI: separate "World Assets" and "Pets" sections
    - Two visually distinct sections in the inventory screen
    - Phase 1: no cross-system battles, trades, or skill transfers
    - _Requirements: 11.6_

  - [~] 20.6 Implement graceful degradation when Agent system is unavailable
    - World_Asset creation completes in unbound state with retry-binding affordance
    - _Requirements: 11.7_

  - [ ]* 20.7 Write property test for cross-system Agent slot consistency (Property 9)
    - **Property 9: Agent slot 配额一致性 — sum of pet-bound + world-asset-bound agents never exceeds `workspace.maxAgents` even under concurrent binding**
    - **Validates: Requirements 11.2, 11.3, 6.6**

  - [ ]* 20.8 Write property test for Agent API backwards compatibility (Property 10)
    - **Property 10: Agent API 向后兼容性 — diff snapshot of pre-launch JSON vs post-launch JSON without `?includeWorldEngine=true` must match exactly**
    - **Validates: Requirements 11.4**

- [ ] 21. Telemetry, Analytics, A/B Baseline
  - [x] 21.1 Define and emit core funnel events
    - Events: `scan_started`, `scan_completed`, `generation_started`, `generation_completed`, `character_regenerated`, `asset_listed`, `listing_purchased`, `battle_started`, `battle_completed`, `share_card_generated`, `deep_link_opened`, `web_preview_loaded`, `moderation_rejected`, `quota_exceeded`
    - Wire into the project's existing telemetry pipeline
    - _Requirements: (cross-cutting)_

  - [~] 21.2 Build go-live dashboard
    - Conversion funnel: scan-started → asset-created → asset-bound-to-agent → battle-completed → share-or-listing
    - Quality Gate rejection breakdown (face / copyright / prohibited words / quota / network)
    - _Requirements: (cross-cutting)_

  - [x] 21.3 Wire feature flag cohort tagging into events
    - Every emitted event tags `world_engine_flag_cohort` so 1% / 10% / 100% rollouts are comparable
    - _Requirements: 11.8_

- [ ] 22. Performance baseline & continuous monitoring
  - [~] 22.1 Establish FPS / memory baseline harness on minimum-spec devices
    - Add Maestro / detox CI step to measure scanner FPS, inventory grid memory, detail view memory on 4 GB-RAM and 2 GB-RAM device profiles
    - Fail CI if FPS p99 < 30 or memory > budget caps from design §8
    - _Requirements: 10.1, 10.5, 10.8_

  - [~] 22.2 Wire perf metrics into Task 21 telemetry events
    - Capture p99 scanner FPS, inventory load time, generation latency p50 / p95 / p99 per Provider
    - _Requirements: 10.1, 10.2, 10.4_

- [ ] 23. Deployment & rollout
  - [~] 23.1 Configure production secrets
    - Provision and inject (via existing secret manager) Meshy API key, Stability / Replicate API key, GPT-4V / Gemini Vision keys, GPU pool credentials, baidu / aliyun moderation keys
    - _Requirements: 13.1, 12.3, 12.9_

  - [~] 23.2 Provision GPU fallback pool
    - Lambda Labs or RunPod 1× A10 24 GB initial; autoscale 1-3 instances based on BullMQ queue depth (per design §7)
    - Healthcheck endpoint per Provider for the Provider Registry
    - _Requirements: (design §7)_

  - [~] 23.3 Database migration to production
    - Run TypeORM migrations for `world_assets`, `battles`, `dungeons`, `scan_sessions`, `world_asset_moderation_decisions`, `marketplace_listing_reservation`, `pending_transfer_state` on production
    - SSH to `47.130.176.148`, `npm run build`, `npm run migration:run`, `pm2 restart agentrix-backend`
    - _Requirements: (cross-cutting)_

  - [~] 23.4 Mobile build branch push for CI / APK
    - Push to `CutaGames/Agentrix-Claw` to trigger APK build pipeline
    - _Requirements: (cross-cutting)_

  - [~] 23.5 Smoke test on production behind feature flag (cohort 1%)
    - End-to-end: scan → generate → bind → battle → share → list → purchase
    - Verify telemetry events flowing and admin dashboard shows correct cost summary
    - _Requirements: 11.8, 13.7_

  - [~] 23.6 Rollout schedule
    - 1% cohort → 24 h soak → 10% → 7-day soak → 100%
    - Halt criteria: rejection rate > 5%, p99 latency > 2× target, any cost-runaway alert
    - Cohort selection criteria pending PM (Open Questions item #5 in design.md)
    - _Requirements: 11.8_

- [~] 24. Final checkpoint — Pre-launch verification
  - All MANDATORY property tests passing (Properties 1, 4, 5, 7)
  - All `_Requirements:` references in tasks resolve to a valid R/AC ID
  - End-to-end smoke test passes on production behind feature flag at 1% cohort
  - Admin cost dashboard verified showing accurate aggregations by Provider × user × day
  - Moderation queue verified — both automated (face / copyright / prohibited words) and manual paths reachable
  - Documentation: API docs, runbook (escalation, takedown, manual quota grant), user FAQ
  - All "Open Questions" in design.md have a recorded decision (provider contract, moderation team capacity, free monthly ceiling, AXP exchange rate, cohort rollout schedule)

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP — BUT Properties 1, 4, 5, 7 (Tasks 6.2, 8.2, 8.3, 11.2) are MANDATORY core invariants and have NO `*`.
- Property tests 9, 10, 11 (Tasks 20.7, 20.8, 19.6) can be deferred but design.md treats them as core invariants for cross-system safety.
- Each task references specific requirements for traceability; `_Requirements:` IDs should resolve to a valid AC in requirements.md.
- Checkpoints (Tasks 5, 9, 13, 24) ensure incremental validation with explicit DoD bullets.
- Property tests validate universal correctness properties from the design document; unit tests validate specific examples and edge cases.
- The backend uses NestJS with TypeORM (SnakeNamingStrategy — camelCase property names auto-convert to snake_case columns) and PostgreSQL.
- The mobile client uses Expo SDK 54 with React Native; mobile screens follow the project's flat `src/screens/` convention (e.g. `WorldEngineScannerScreen.tsx`, NOT `src/screens/WorldEngine/...`).
- All 3D rendering on mobile uses React Three Fiber, but per design §8 the inventory grid uses pre-rendered PNG/GIF thumbnails — live 3D only in the detail view.
- Heavy computation (reconstruction, stylization, video generation) is server-side only; production server `47.130.176.148` is CPU-only so all GPU work runs on a separate pool (Lambda Labs / RunPod) or SaaS.
- Tasks 0, 18, 19, 20, 21, 22, 23, 24 were added in the 2026-05 audit pass to address compatibility, moderation, quota, telemetry, performance, deployment, and verification gaps.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "0.2", "0.3", "0.4"] },
    { "id": 1, "tasks": ["1.1"] },
    { "id": 2, "tasks": ["1.2", "1.3"] },
    { "id": 3, "tasks": ["2.1", "2.2", "3.1", "3.2", "20.1"] },
    { "id": 4, "tasks": ["2.3", "3.3", "3.4", "4.1", "20.3", "20.4"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4", "6.1", "20.2"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.4", "8.1", "20.6"] },
    { "id": 8, "tasks": ["8.2", "8.3", "8.4", "10.1", "20.7", "20.8"] },
    { "id": 9, "tasks": ["10.2", "10.3", "11.1", "18.1", "18.2", "18.3"] },
    { "id": 10, "tasks": ["11.2", "11.3", "11.4", "12.1", "18.4", "18.5", "18.6"] },
    { "id": 11, "tasks": ["12.2", "14.1", "18.7", "18.8", "19.1", "19.2"] },
    { "id": 12, "tasks": ["14.2", "14.3", "14.4", "14.5", "19.3", "19.4"] },
    { "id": 13, "tasks": ["15.1", "15.2", "15.3", "19.5", "19.6", "19.7", "20.5"] },
    { "id": 14, "tasks": ["16.1", "16.2", "21.1", "21.2", "21.3", "22.1", "22.2"] },
    { "id": 15, "tasks": ["23.1", "23.2", "23.3", "23.4"] },
    { "id": 16, "tasks": ["23.5", "23.6"] }
  ]
}
```

> Checkpoints (Tasks 5, 9, 13, 24) sit between waves as synchronisation points and are not listed in the wave array.
