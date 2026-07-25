/**
 * MB-T1.1 — mobilePetSdk shape alignment with desktop petSoulSdk.
 *
 * Strategy: pure-Node test that mocks `./api`'s `apiFetch` to verify
 *   - URL paths
 *   - HTTP methods + body shape
 *   - return-value extraction
 * Without pulling in expo / react-native runtime.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const apiFetch = jest.fn() as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<any>>;
jest.mock('../api', () => ({
  apiFetch: (path: string, options?: RequestInit) => apiFetch(path, options),
}));

import {
  listSouls,
  switchSoul,
  getSoul,
  activateSkin,
  getActiveSkinId,
  getPetState,
} from '../mobilePetSdk';

describe('MB-T1.1 mobilePetSdk shape parity with desktop petSoulSdk', () => {
  beforeEach(() => apiFetch.mockReset());

  it('listSouls hits GET /v1/pet/souls?clan=A_office', async () => {
    apiFetch.mockResolvedValueOnce({
      items: [{ id: 'claw', clan: 'A_office', display_name: '爪爪', tier: 'free' }],
    });
    const out = await listSouls({ clan: 'A_office' });
    expect(out).toHaveLength(1);
    expect(apiFetch).toHaveBeenCalledWith('/v1/pet/souls?clan=A_office', undefined);
  });

  it('listSouls without clan omits qs', async () => {
    apiFetch.mockResolvedValueOnce({ items: [] });
    await listSouls();
    expect(apiFetch).toHaveBeenCalledWith('/v1/pet/souls', undefined);
  });

  it('getSoul encodes id', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'a/b' });
    await getSoul('a/b');
    expect(apiFetch).toHaveBeenCalledWith('/v1/pet/souls/a%2Fb', undefined);
  });

  it('switchSoul POSTs to /v1/pet/soul/switch with templateId', async () => {
    apiFetch.mockResolvedValueOnce({ pet_id: 'p1' });
    const r = await switchSoul('owl');
    expect(r).toEqual({ pet_id: 'p1' });
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/pet/soul/switch',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ templateId: 'owl' }) }),
    );
  });

  it('activateSkin POSTs skinId', async () => {
    apiFetch.mockResolvedValueOnce({ pet_id: 'p1' });
    await activateSkin('skin-1');
    expect(apiFetch).toHaveBeenCalledWith(
      '/v1/pet/skin/activate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ skinId: 'skin-1' }) }),
    );
  });

  it('getActiveSkinId returns null when none', async () => {
    apiFetch.mockResolvedValueOnce({ active_skin_id: null });
    expect(await getActiveSkinId()).toBeNull();
  });

  it('getPetState fetches /v1/pet/state', async () => {
    apiFetch.mockResolvedValueOnce({ pet_id: 'p1', name: 'Aira' });
    const s = await getPetState();
    expect(s.pet_id).toBe('p1');
    expect(apiFetch).toHaveBeenCalledWith('/v1/pet/state', undefined);
  });
});
