/**
 * World Engine API service (mobile) — Sprint P-8 (2026-05-22).
 *
 * Wraps backend `/v1/world-engine/*` endpoints with the standard
 * `apiFetch` helper. Replaces the earlier TODO-stub `Alert.alert`
 * UX in scanner / inventory with real network calls.
 *
 * Endpoints covered:
 *   POST   /v1/world-engine/scan/start                  → start a scan session
 *   POST   /v1/world-engine/scan/:id/upload             → upload a captured frame
 *   POST   /v1/world-engine/scan/:id/predict-quality    → 1-5★ overall score
 *   POST   /v1/world-engine/scan/:id/generate           → kick off 3D reconstruction
 *   GET    /v1/world-engine/jobs/:id/status             → poll generation progress
 *   GET    /v1/world-engine/assets                      → list owned assets
 *   GET    /v1/world-engine/assets/:id                  → asset detail
 *   PATCH  /v1/world-engine/assets/:id                  → rename / change style
 *   POST   /v1/world-engine/assets/:id/regenerate       → regenerate stat/skill/etc.
 *   DELETE /v1/world-engine/assets/:id                  → delete asset
 *   POST   /v1/world-engine/assets/:id/bind-agent       → bind agent
 *   DELETE /v1/world-engine/assets/:id/unbind-agent     → unbind agent
 *
 * `apiFetch` already handles auth headers, base URL, and JSON
 * encoding/decoding. For multipart frame upload we hand it a
 * FormData body which it leaves untouched (auto-omits Content-Type
 * so the boundary is set by the runtime).
 */

import { apiFetch } from './api';

// ============================================================
// Types
// ============================================================

export type ScanMode = 'quick' | 'detail' | 'room';
export type ScanStyle = 'cartoon' | 'pixel-art' | 'fantasy' | 'sci-fi' | 'realistic';

export interface StartScanResponse {
  sessionId: string;
}

export interface FrameQualityScore {
  frameIndex: number;
  sharpness: number;
  exposure: number;
  angleNovelty: number;
  overall: number;
}

export interface UploadFrameResponse {
  frameIndex: number;
  qualityScore: FrameQualityScore;
}

export interface PredictQualityResponse {
  overallScore: number; // 1-5 stars
  suggestions: string[];
}

export interface GenerateFromScanResponse {
  jobId: string;
  estimatedSeconds: number;
}

export type ReconstructionJobStatus =
  | 'queued'
  | 'reconstructing'
  | 'styling'
  | 'character_gen'
  | 'completed'
  | 'failed';

export interface ReconstructionJobStatusResponse {
  jobId: string;
  status: ReconstructionJobStatus;
  progress: number; // 0-100
  stage?: string;
  estimatedSecondsRemaining?: number;
  resultAssetId?: string;
  error?: string;
}

export interface WorldAssetSummary {
  id: string;
  name: string;
  category: 'character' | 'dungeon' | 'weapon';
  level: number;
  battleWins: number;
  battleLosses: number;
  styledMeshUrl: string;
  meshUrl?: string;
  styleType: string;
  boundAgentId: string | null;
  source: 'scanned' | 'purchased' | 'gifted';
  createdAt: string;
  updatedAt?: string;
}

export interface ListAssetsResponse {
  items: WorldAssetSummary[];
  total: number;
}

export interface ListAssetsQuery {
  category?: 'character' | 'dungeon' | 'weapon';
  source?: 'scanned' | 'purchased' | 'gifted';
  sort?: 'newest' | 'level' | 'battles';
  page?: number;
  limit?: number;
}

// ============================================================
// Scan flow
// ============================================================

export function startScan(mode: ScanMode): Promise<StartScanResponse> {
  return apiFetch<StartScanResponse>('/v1/world-engine/scan/start', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

/**
 * Upload a captured frame.
 *
 * `frame.uri` is an Expo file URI (e.g. `file:///...`); RN's
 * FormData accepts the `{uri, name, type}` triple natively.
 *
 * On Android, content:// URIs sometimes race with the resolver and
 * upload 0 bytes; if you see that, base64-roundtrip via
 * `expo-file-system` like `uploadChatAttachment` does. Most camera
 * captures from `CameraView.takePictureAsync` produce file:// URIs
 * which work fine.
 */
export async function uploadScanFrame(
  sessionId: string,
  frame: { uri: string; mime?: string; name?: string },
): Promise<UploadFrameResponse> {
  const form = new FormData();
  // Cast required — RN's FormData types are stricter than browser's
  // and need this triple shape to make multipart work.
  form.append('image', {
    uri: frame.uri,
    name: frame.name ?? `frame_${Date.now()}.jpg`,
    type: frame.mime ?? 'image/jpeg',
  } as any);

  return apiFetch<UploadFrameResponse>(
    `/v1/world-engine/scan/${sessionId}/upload`,
    {
      method: 'POST',
      body: form,
    },
  );
}

export function predictScanQuality(
  sessionId: string,
): Promise<PredictQualityResponse> {
  return apiFetch<PredictQualityResponse>(
    `/v1/world-engine/scan/${sessionId}/predict-quality`,
    { method: 'POST' },
  );
}

export function generateFromScan(
  sessionId: string,
  style: ScanStyle = 'cartoon',
): Promise<GenerateFromScanResponse> {
  return apiFetch<GenerateFromScanResponse>(
    `/v1/world-engine/scan/${sessionId}/generate`,
    {
      method: 'POST',
      body: JSON.stringify({ style }),
    },
  );
}

// ============================================================
// Job polling
// ============================================================

export function getJobStatus(
  jobId: string,
): Promise<ReconstructionJobStatusResponse> {
  return apiFetch<ReconstructionJobStatusResponse>(
    `/v1/world-engine/jobs/${jobId}/status`,
  );
}

// ============================================================
// Asset CRUD
// ============================================================

export function listWorldAssets(
  query: ListAssetsQuery = {},
): Promise<ListAssetsResponse> {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  if (query.source) params.set('source', query.source);
  if (query.sort) params.set('sort', query.sort);
  if (typeof query.page === 'number') params.set('page', String(query.page));
  if (typeof query.limit === 'number') params.set('limit', String(query.limit));

  const qs = params.toString();
  return apiFetch<ListAssetsResponse>(
    `/v1/world-engine/assets${qs ? `?${qs}` : ''}`,
  );
}

export function getWorldAsset(id: string): Promise<WorldAssetSummary> {
  return apiFetch<WorldAssetSummary>(`/v1/world-engine/assets/${id}`);
}

export function updateWorldAsset(
  id: string,
  patch: { name?: string; style?: ScanStyle },
): Promise<WorldAssetSummary> {
  return apiFetch<WorldAssetSummary>(`/v1/world-engine/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function regenerateWorldAssetAttribute(
  id: string,
  target: 'stats' | 'skills' | 'personality' | 'backstory' | 'name',
): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>(
    `/v1/world-engine/assets/${id}/regenerate`,
    {
      method: 'POST',
      body: JSON.stringify({ target }),
    },
  );
}

export function deleteWorldAsset(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/v1/world-engine/assets/${id}`, {
    method: 'DELETE',
  });
}

export function bindAgentToAsset(
  id: string,
): Promise<{ agentId: string }> {
  return apiFetch<{ agentId: string }>(
    `/v1/world-engine/assets/${id}/bind-agent`,
    { method: 'POST' },
  );
}

export function unbindAgentFromAsset(
  id: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/v1/world-engine/assets/${id}/unbind-agent`,
    { method: 'DELETE' },
  );
}


// ============================================================
// Battle (Sprint P-8 P1)
// ============================================================

export interface BattleStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  int: number;
}

export interface BattleRound {
  roundNumber: number;
  attackerId: string;
  defenderId: string;
  damageDealt: number;
  isCritical: boolean;
  attackerHpAfter: number;
  defenderHpAfter: number;
}

export interface BattleParticipant {
  id: string;
  name: string;
  level: number;
  stats: BattleStats;
  styledMeshUrl: string;
}

export interface BattleResult {
  battleId: string;
  winnerSide: 'challenger' | 'defender';
  totalRounds: number;
  rounds: BattleRound[];
  xpAwarded: { winner: number; loser: number };
  challenger: BattleParticipant;
  defender: BattleParticipant;
}

export interface CreateBattleRequest {
  challengerAssetId: string;
  defenderAssetId: string;
}

export function createBattle(
  body: CreateBattleRequest,
): Promise<BattleResult> {
  return apiFetch<BattleResult>('/v1/world-engine/battles/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getBattle(id: string): Promise<BattleResult> {
  return apiFetch<BattleResult>(`/v1/world-engine/battles/${id}`);
}

export interface CreateChallengeResponse {
  challengeId: string;
  shareLink: string;
  expiresAt: string;
}

export function createBattleChallenge(body: {
  challengerAssetId: string;
  defenderHint?: string;
}): Promise<CreateChallengeResponse> {
  return apiFetch<CreateChallengeResponse>(
    '/v1/world-engine/battles/challenge',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function acceptBattleChallenge(id: string): Promise<BattleResult> {
  return apiFetch<BattleResult>(`/v1/world-engine/battles/${id}/accept`, {
    method: 'POST',
  });
}

// ============================================================
// Dungeon (Sprint P-8 P1)
// ============================================================

export interface DungeonAttempt {
  attemptId: string;
  dungeonCode: string;
  status: 'in_progress' | 'completed' | 'failed';
  startedAt: string;
}

export interface DungeonDetail {
  shareCode: string;
  title: string;
  difficulty: number;
  expiresAt: string;
  layout: any; // backend-defined room layout
  authorUserId: string;
}

export interface GenerateDungeonRequest {
  scanSessionId: string;
  difficulty?: number; // 1-5
  title?: string;
}

export function generateDungeon(
  body: GenerateDungeonRequest,
): Promise<{ shareCode: string; dungeon: DungeonDetail }> {
  return apiFetch<{ shareCode: string; dungeon: DungeonDetail }>(
    '/v1/world-engine/dungeons/generate',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function getDungeonByCode(code: string): Promise<DungeonDetail> {
  return apiFetch<DungeonDetail>(`/v1/world-engine/dungeons/${code}`);
}

export function attemptDungeon(code: string): Promise<DungeonAttempt> {
  return apiFetch<DungeonAttempt>(
    `/v1/world-engine/dungeons/${code}/attempt`,
    { method: 'POST' },
  );
}


// ============================================================
// Marketplace (Sprint P-8 P2)
// ============================================================

export interface MarketplaceListing {
  id: string;
  assetId: string;
  sellerId: string;
  price: number;
  currency: 'USD' | 'AXP';
  asset?: WorldAssetSummary;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  createdAt: string;
}

export interface BrowseListingsQuery {
  category?: 'character' | 'dungeon' | 'weapon';
  minPrice?: number;
  maxPrice?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  page?: number;
}

export interface BrowseListingsResponse {
  items: MarketplaceListing[];
  total: number;
}

export interface SuggestedPriceResponse {
  suggestedPrice: number;
  currency: 'USD';
  reasoning: string;
  comparable?: { id: string; price: number }[];
}

export function createMarketplaceListing(body: {
  assetId: string;
  price: number;
  currency: 'USD' | 'AXP';
}): Promise<{ listingId: string }> {
  return apiFetch<{ listingId: string }>(
    '/v1/marketplace/world-assets/listing',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function getSuggestedPrice(
  assetId: string,
): Promise<SuggestedPriceResponse> {
  return apiFetch<SuggestedPriceResponse>(
    `/v1/marketplace/world-assets/${assetId}/suggested-price`,
  );
}

export function browseMarketplaceListings(
  query: BrowseListingsQuery = {},
): Promise<BrowseListingsResponse> {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  if (typeof query.minPrice === 'number') params.set('minPrice', String(query.minPrice));
  if (typeof query.maxPrice === 'number') params.set('maxPrice', String(query.maxPrice));
  if (query.sort) params.set('sort', query.sort);
  if (typeof query.page === 'number') params.set('page', String(query.page));
  const qs = params.toString();
  return apiFetch<BrowseListingsResponse>(
    `/v1/marketplace/world-assets${qs ? `?${qs}` : ''}`,
  );
}

export function purchaseMarketplaceListing(
  listingId: string,
  body?: { paymentId?: string },
): Promise<{ transactionId: string; status: 'completed' | 'failed' }> {
  return apiFetch<{ transactionId: string; status: 'completed' | 'failed' }>(
    `/v1/marketplace/world-assets/${listingId}/purchase`,
    { method: 'POST', body: JSON.stringify(body ?? {}) },
  );
}


// ============================================================
// Feature flag (P-9 Companion Redesign T2.1)
// ============================================================

export interface WorldEngineFlagStatus {
  enabled: boolean;
  /** Optional rollout cohort metadata for diagnostics. */
  rolloutPercentage?: number;
}

/**
 * Probe whether the current user is in the World Engine rollout cohort.
 *
 * Backend exposes `WorldEngineFeatureFlagService.isFeatureEnabled(userId)`
 * via /v1/world-engine/quota/status (already cohort-gated). Phase 1
 * mobile reads this and renders WorldHubScreen vs ComingSoonPanel based
 * on the result. Failure → optimistic enabled (better to show the hub
 * than over-eagerly block users; backend will 401/404 on actual API
 * calls if they're truly out of cohort).
 */
export async function fetchWorldEngineFlag(): Promise<WorldEngineFlagStatus> {
  try {
    // Hit any cohort-gated endpoint; quota/status is read-only and lightweight.
    await apiFetch<unknown>('/v1/world-engine/quota/status');
    return { enabled: true };
  } catch (err) {
    const msg = (err as Error)?.message || '';
    // 404 means WorldEngineFlagGuard rejected — out of cohort.
    if (/404|not\s*found/i.test(msg)) {
      return { enabled: false };
    }
    // 401/network → optimistic enabled, let other API calls handle gating.
    return { enabled: true };
  }
}
