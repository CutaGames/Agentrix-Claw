/**
 * Sprint P-8 (2026-05-22) — World Engine API service contract tests.
 *
 * Mocks `apiFetch` and verifies path / method / body shape for every
 * endpoint the mobile screens call. Locks the contract so future
 * refactors of the controller path conventions can't silently break
 * the scanner / inventory / battle / dungeon flows.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const apiFetch = jest.fn() as jest.MockedFunction<
  (path: string, options?: RequestInit) => Promise<any>
>;

jest.mock('../api', () => ({
  apiFetch: (path: string, options?: RequestInit) => apiFetch(path, options),
}));

import {
  startScan,
  uploadScanFrame,
  predictScanQuality,
  generateFromScan,
  getJobStatus,
  listWorldAssets,
  getWorldAsset,
  updateWorldAsset,
  regenerateWorldAssetAttribute,
  deleteWorldAsset,
  bindAgentToAsset,
  unbindAgentFromAsset,
  createBattle,
  getBattle,
  createBattleChallenge,
  acceptBattleChallenge,
  generateDungeon,
  getDungeonByCode,
  attemptDungeon,
  createMarketplaceListing,
  getSuggestedPrice,
  browseMarketplaceListings,
  purchaseMarketplaceListing,
} from '../worldEngineApi';

describe('worldEngineApi — scan flow', () => {
  beforeEach(() => apiFetch.mockReset());

  it('startScan posts to /v1/world-engine/scan/start with mode body', async () => {
    apiFetch.mockResolvedValueOnce({ sessionId: 's1' });
    const r = await startScan('quick');
    expect(r.sessionId).toBe('s1');
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/v1/world-engine/scan/start');
    expect((opts as RequestInit).method).toBe('POST');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ mode: 'quick' });
  });

  it('uploadScanFrame posts FormData with image field', async () => {
    apiFetch.mockResolvedValueOnce({
      frameIndex: 0,
      qualityScore: { frameIndex: 0, sharpness: 70, exposure: 75, angleNovelty: 80, overall: 75 },
    });
    const r = await uploadScanFrame('s1', { uri: 'file:///x.jpg' });
    expect(r.frameIndex).toBe(0);
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/v1/world-engine/scan/s1/upload');
    expect((opts as RequestInit).method).toBe('POST');
    // Node 20+ has FormData built-in, so this verifies body type.
    expect((opts as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('predictScanQuality posts to /scan/:id/predict-quality', async () => {
    apiFetch.mockResolvedValueOnce({ overallScore: 4, suggestions: [] });
    const r = await predictScanQuality('s1');
    expect(r.overallScore).toBe(4);
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/world-engine/scan/s1/predict-quality',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('generateFromScan posts style in body', async () => {
    apiFetch.mockResolvedValueOnce({ jobId: 'j1', estimatedSeconds: 15 });
    const r = await generateFromScan('s1', 'cartoon');
    expect(r.jobId).toBe('j1');
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/v1/world-engine/scan/s1/generate');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ style: 'cartoon' });
  });

  it('getJobStatus hits /jobs/:id/status', async () => {
    apiFetch.mockResolvedValueOnce({
      jobId: 'j1', status: 'reconstructing', progress: 50,
    });
    const r = await getJobStatus('j1');
    expect(r.status).toBe('reconstructing');
    expect(apiFetch).toHaveBeenCalledWith('/v1/world-engine/jobs/j1/status', undefined);
  });
});

describe('worldEngineApi — asset CRUD', () => {
  beforeEach(() => apiFetch.mockReset());

  it('listWorldAssets serializes filters to query string', async () => {
    apiFetch.mockResolvedValueOnce({ items: [], total: 0 });
    await listWorldAssets({ category: 'character', sort: 'level', limit: 50 });
    const [path] = apiFetch.mock.calls[0];
    expect(path).toContain('/v1/world-engine/assets');
    expect(path).toContain('category=character');
    expect(path).toContain('sort=level');
    expect(path).toContain('limit=50');
  });

  it('listWorldAssets with no filters omits query string', async () => {
    apiFetch.mockResolvedValueOnce({ items: [], total: 0 });
    await listWorldAssets();
    expect(apiFetch).toHaveBeenCalledWith('/v1/world-engine/assets', undefined);
  });

  it('getWorldAsset hits /assets/:id', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'a1', name: 'X' });
    const r = await getWorldAsset('a1');
    expect(r.id).toBe('a1');
    expect(apiFetch).toHaveBeenCalledWith('/v1/world-engine/assets/a1', undefined);
  });

  it('updateWorldAsset PATCHes name and style', async () => {
    apiFetch.mockResolvedValueOnce({});
    await updateWorldAsset('a1', { name: 'Hero', style: 'fantasy' });
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/v1/world-engine/assets/a1');
    expect((opts as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ name: 'Hero', style: 'fantasy' });
  });

  it('regenerateWorldAssetAttribute posts target', async () => {
    apiFetch.mockResolvedValueOnce({ jobId: 'j2' });
    await regenerateWorldAssetAttribute('a1', 'stats');
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/v1/world-engine/assets/a1/regenerate');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ target: 'stats' });
  });

  it('deleteWorldAsset DELETEs /assets/:id', async () => {
    apiFetch.mockResolvedValueOnce({ success: true });
    await deleteWorldAsset('a1');
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/world-engine/assets/a1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('bindAgentToAsset POSTs /bind-agent', async () => {
    apiFetch.mockResolvedValueOnce({ agentId: 'ag1' });
    await bindAgentToAsset('a1');
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/world-engine/assets/a1/bind-agent',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('unbindAgentFromAsset DELETEs /unbind-agent', async () => {
    apiFetch.mockResolvedValueOnce({ success: true });
    await unbindAgentFromAsset('a1');
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/world-engine/assets/a1/unbind-agent',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('worldEngineApi — battle', () => {
  beforeEach(() => apiFetch.mockReset());

  it('createBattle posts both asset ids', async () => {
    apiFetch.mockResolvedValueOnce({ battleId: 'b1' });
    await createBattle({ challengerAssetId: 'a1', defenderAssetId: 'a2' });
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/v1/world-engine/battles/create');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      challengerAssetId: 'a1',
      defenderAssetId: 'a2',
    });
  });

  it('getBattle GETs /battles/:id', async () => {
    apiFetch.mockResolvedValueOnce({ battleId: 'b1' });
    await getBattle('b1');
    expect(apiFetch).toHaveBeenCalledWith('/v1/world-engine/battles/b1', undefined);
  });

  it('createBattleChallenge posts /battles/challenge', async () => {
    apiFetch.mockResolvedValueOnce({ challengeId: 'c1', shareLink: 'x', expiresAt: 'now' });
    await createBattleChallenge({ challengerAssetId: 'a1' });
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/world-engine/battles/challenge',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('acceptBattleChallenge posts /battles/:id/accept', async () => {
    apiFetch.mockResolvedValueOnce({ battleId: 'b1' });
    await acceptBattleChallenge('c1');
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/world-engine/battles/c1/accept',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('worldEngineApi — dungeon', () => {
  beforeEach(() => apiFetch.mockReset());

  it('generateDungeon posts /dungeons/generate', async () => {
    apiFetch.mockResolvedValueOnce({ shareCode: 'AB12CD', dungeon: {} });
    await generateDungeon({ scanSessionId: 's1', difficulty: 3 });
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/v1/world-engine/dungeons/generate');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      scanSessionId: 's1',
      difficulty: 3,
    });
  });

  it('getDungeonByCode GETs /dungeons/:code', async () => {
    apiFetch.mockResolvedValueOnce({ shareCode: 'AB12CD' });
    await getDungeonByCode('AB12CD');
    expect(apiFetch).toHaveBeenCalledWith('/v1/world-engine/dungeons/AB12CD', undefined);
  });

  it('attemptDungeon POSTs /dungeons/:code/attempt', async () => {
    apiFetch.mockResolvedValueOnce({ attemptId: 'at1' });
    await attemptDungeon('AB12CD');
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/world-engine/dungeons/AB12CD/attempt',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});


describe('worldEngineApi — marketplace (P-8 P2)', () => {
  beforeEach(() => apiFetch.mockReset());

  it('createMarketplaceListing posts /v1/marketplace/world-assets/listing', async () => {
    apiFetch.mockResolvedValueOnce({ listingId: 'l1' });
    await createMarketplaceListing({
      assetId: 'a1',
      price: 12.5,
      currency: 'USD',
    });
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/v1/marketplace/world-assets/listing');
    expect((opts as RequestInit).method).toBe('POST');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      assetId: 'a1',
      price: 12.5,
      currency: 'USD',
    });
  });

  it('getSuggestedPrice GETs /v1/marketplace/world-assets/:id/suggested-price', async () => {
    apiFetch.mockResolvedValueOnce({
      suggestedPrice: 9.99,
      currency: 'USD',
      reasoning: 'level 3 + 2 wins',
    });
    const r = await getSuggestedPrice('a1');
    expect(r.suggestedPrice).toBe(9.99);
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/marketplace/world-assets/a1/suggested-price',
      undefined,
    );
  });

  it('browseMarketplaceListings serializes filters', async () => {
    apiFetch.mockResolvedValueOnce({ items: [], total: 0 });
    await browseMarketplaceListings({
      category: 'character',
      minPrice: 1,
      maxPrice: 100,
      sort: 'price_asc',
    });
    const [path] = apiFetch.mock.calls[0];
    expect(path).toContain('/v1/marketplace/world-assets');
    expect(path).toContain('category=character');
    expect(path).toContain('minPrice=1');
    expect(path).toContain('maxPrice=100');
    expect(path).toContain('sort=price_asc');
  });

  it('purchaseMarketplaceListing posts /:id/purchase with paymentId', async () => {
    apiFetch.mockResolvedValueOnce({ transactionId: 't1', status: 'completed' });
    await purchaseMarketplaceListing('l1', { paymentId: 'pi_xyz' });
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/v1/marketplace/world-assets/l1/purchase');
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      paymentId: 'pi_xyz',
    });
  });
});
