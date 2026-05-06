import { expect, test } from '@playwright/test';

const API = process.env.API_URL || 'https://api.agentrix.top/api';
const AUTH_TOKEN = String(
  process.env.PLAYWRIGHT_AUTH_TOKEN || process.env.E2E_BEARER_TOKEN || '',
).trim();
const AUTH_SKIP_HINT =
  'Set PLAYWRIGHT_AUTH_TOKEN or E2E_BEARER_TOKEN to run authenticated Phase 4-6 API coverage.';

type SovereignProfile = {
  living_pet_id: string;
  custody_mode: 'platform' | 'mpc' | 'self';
  wallet_address: string | null;
  mpc: null | {
    user_share_commitment: string;
    device_fingerprint: string;
    server_kms_key_id: string;
  };
  memory_storage: 'platform' | 'ipfs' | 'arweave';
  memory_uri: string | null;
  memory_hash: string | null;
  supported_chains: string[];
  status: 'active' | 'paused' | 'revoked';
};

function authHeaders() {
  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function runtimeHeaders(apiKey: string) {
  return {
    'X-Agentrix-App-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

function totalXpForLevel(level: number): number {
  let total = 0;
  for (let current = 0; current < level; current += 1) {
    total += 100 * Math.pow(2, current);
  }
  return total;
}

test.describe.serial('Pet Phase 4-6 API contracts', () => {
  let partnerAppId = '';
  let partnerApiKey = '';
  let livingPetId = '';

  test('1.1 protected routes reject anonymous callers', async ({ request }) => {
    const protectedRoutes = [
      `${API}/v1/passkey`,
      `${API}/v1/partner-apps`,
      `${API}/v1/pet/team/roles`,
      `${API}/v1/pet/nft/config`,
      `${API}/v1/pet/sovereign/config`,
    ];

    for (const url of protectedRoutes) {
      const res = await request.get(url);
      expect([401, 403]).toContain(res.status());
    }
  });

  test('1.2 partner runtime rejects missing app key', async ({ request }) => {
    const whoami = await request.get(`${API}/v1/partner-runtime/whoami`);
    expect([401, 403]).toContain(whoami.status());

    const ping = await request.post(`${API}/v1/partner-runtime/ping`, {
      data: { scope: 'pet.read' },
    });
    expect([401, 403]).toContain(ping.status());
  });

  test('2.1 passkey list responds for authenticated caller', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const res = await request.get(`${API}/v1/passkey`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('2.2 pet team roles config responds for authenticated caller', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const res = await request.get(`${API}/v1/pet/team/roles`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.roles)).toBe(true);
    expect(body.roles.length).toBeGreaterThanOrEqual(11);
  });

  test('2.3 pet nft config responds for authenticated caller', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const res = await request.get(`${API}/v1/pet/nft/config`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.min_intimacy_level).toBeDefined();
    expect(Array.isArray(body.supported_chains)).toBe(true);
  });

  test('2.4 pet sovereign config responds for authenticated caller', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const res = await request.get(`${API}/v1/pet/sovereign/config`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.supported_chains)).toBe(true);
    expect(body.custody_modes).toEqual(expect.arrayContaining(['platform', 'mpc', 'self']));
  });

  test('2.5 partner app owner flow registers throwaway app', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const slug = `pw-phase6-${Date.now()}`;
    const res = await request.post(`${API}/v1/partner-apps`, {
      headers: authHeaders(),
      data: {
        name: `Playwright ${slug}`,
        slug,
        scopes: ['pet.read', 'pet.chat'],
        billingMode: 'per_call',
        perCallUsd: 0.01,
        monthlyCapUsd: 1,
      },
    });
    expect(res.status()).toBeLessThan(400);
    const body = await res.json();
    expect(body.app?.id).toBeDefined();
    expect(body.api_key).toMatch(/^agx_/);
    partnerAppId = body.app.id;
    partnerApiKey = body.api_key;
  });

  test('2.6 partner runtime end-to-end whoami + ping', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    test.skip(!partnerApiKey, 'Partner app registration did not run');

    const whoami = await request.get(`${API}/v1/partner-runtime/whoami`, {
      headers: { 'X-Agentrix-App-Key': partnerApiKey },
    });
    expect(whoami.status()).toBe(200);
    const who = await whoami.json();
    expect(who.app_id).toBe(partnerAppId);
    expect(Array.isArray(who.scopes)).toBe(true);

    const ping = await request.post(`${API}/v1/partner-runtime/ping`, {
      headers: {
        'X-Agentrix-App-Key': partnerApiKey,
        'Content-Type': 'application/json',
      },
      data: { scope: 'pet.read', cost_usd: 0.01 },
    });
    expect([200, 201]).toContain(ping.status());
    const body = await ping.json();
    expect(body.ok).toBe(true);
    expect(body.calls_today).toBeGreaterThanOrEqual(1);
  });

  test('2.7 partner app usage is queryable after runtime ping', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    test.skip(!partnerAppId, 'Partner app registration did not run');

    const res = await request.get(`${API}/v1/partner-apps/${partnerAppId}/usage`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.month).toMatch(/^\d{4}-\d{2}$/);
    expect(Array.isArray(body.days)).toBe(true);
    expect(body.days.length).toBeGreaterThanOrEqual(1);
  });

  test('2.8 partner scopes list reflects current whitelist', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const res = await request.get(`${API}/v1/partner-apps/scopes`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.scopes).toEqual(expect.arrayContaining(['pet.read', 'pet.chat', 'wallet.read']));
  });

  test('2.9 partner key rotation invalidates the old runtime key', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    test.skip(!partnerAppId || !partnerApiKey, 'Partner app registration did not run');

    const oldKey = partnerApiKey;
    const rotate = await request.post(`${API}/v1/partner-apps/${partnerAppId}/rotate-key`, {
      headers: authHeaders(),
    });
    expect(rotate.status()).toBe(201);
    const rotated = await rotate.json();
    expect(rotated.api_key).toMatch(/^agx_/);
    expect(rotated.api_key).not.toBe(oldKey);
    partnerApiKey = rotated.api_key;

    const staleWhoami = await request.get(`${API}/v1/partner-runtime/whoami`, {
      headers: { 'X-Agentrix-App-Key': oldKey },
    });
    expect([401, 403]).toContain(staleWhoami.status());

    const freshWhoami = await request.get(`${API}/v1/partner-runtime/whoami`, {
      headers: { 'X-Agentrix-App-Key': partnerApiKey },
    });
    expect(freshWhoami.status()).toBe(200);
  });

  test('2.10 partner monthly cap enforcement returns 429 on real runtime overage', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    test.skip(!partnerAppId || !partnerApiKey, 'Partner app registration did not run');

    const billing = await request.patch(`${API}/v1/partner-apps/${partnerAppId}/billing`, {
      headers: authHeaders(),
      data: {
        billingMode: 'per_call',
        perCallUsd: 0.001,
        monthlyCapUsd: 0.03,
      },
    });
    expect(billing.status()).toBe(200);

    const first = await request.post(`${API}/v1/partner-runtime/ping`, {
      headers: runtimeHeaders(partnerApiKey),
      data: { scope: 'pet.read', cost_usd: 0.015 },
    });
    expect([200, 201]).toContain(first.status());

    const second = await request.post(`${API}/v1/partner-runtime/ping`, {
      headers: runtimeHeaders(partnerApiKey),
      data: { scope: 'pet.read', cost_usd: 0.015 },
    });
    expect(second.status()).toBe(429);
    const body = await second.json();
    expect(String(body.message || '')).toContain('monthly_cap_exceeded');
  });

  test('2.11 partner suspension blocks runtime authentication', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    test.skip(!partnerAppId || !partnerApiKey, 'Partner app registration did not run');

    const suspend = await request.patch(`${API}/v1/partner-apps/${partnerAppId}/status`, {
      headers: authHeaders(),
      data: { status: 'suspended' },
    });
    expect(suspend.status()).toBe(200);

    const whoami = await request.get(`${API}/v1/partner-runtime/whoami`, {
      headers: { 'X-Agentrix-App-Key': partnerApiKey },
    });
    expect([401, 403]).toContain(whoami.status());
  });

  test('2.12 living pet state exposes the sovereign target context', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);

    const res = await request.get(`${API}/v1/pet/state`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.pet_id).toBeDefined();
    expect(body.intimacy_level).toBeGreaterThanOrEqual(0);
    livingPetId = body.pet_id;
  });

  test('2.13 sovereign flow updates real profile state and restores the original contract', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    test.skip(!livingPetId, 'Living pet state did not run');

    const petState = await request.get(`${API}/v1/pet/state`, {
      headers: authHeaders(),
    });
    expect(petState.status()).toBe(200);
    const pet = await petState.json();

    const requiredXp = Math.max(0, totalXpForLevel(7) - Number(pet.intimacy_xp || 0));
    if (requiredXp > 0) {
      const levelUp = await request.post(`${API}/v1/pet/intimacy`, {
        headers: authHeaders(),
        data: { xp: requiredXp },
      });
      expect(levelUp.status()).toBe(201);
      const leveled = await levelUp.json();
      expect(leveled.intimacy_level).toBeGreaterThanOrEqual(7);
    }

    const profileRes = await request.get(`${API}/v1/pet/sovereign/${livingPetId}`, {
      headers: authHeaders(),
    });
    expect(profileRes.status()).toBe(200);
    const original = (await profileRes.json()) as SovereignProfile;

    try {
      const enableSelf = await request.post(`${API}/v1/pet/sovereign/${livingPetId}/enable-self`, {
        headers: authHeaders(),
        data: {
          walletAddress: `0x${'b'.repeat(40)}`,
          supportedChains: ['base', 'solana'],
        },
      });
      expect(enableSelf.status()).toBe(201);
      const selfBody = await enableSelf.json();
      expect(selfBody.custody_mode).toBe('self');
      expect(selfBody.wallet_address).toBe(`0x${'b'.repeat(40)}`);
      expect(selfBody.supported_chains).toEqual(expect.arrayContaining(['base', 'solana']));

      const memory = await request.patch(`${API}/v1/pet/sovereign/${livingPetId}/memory`, {
        headers: authHeaders(),
        data: {
          memoryStorage: 'ipfs',
          memoryUri: `ipfs://${'Q'.repeat(40)}`,
          memoryHash: 'a'.repeat(64),
        },
      });
      expect(memory.status()).toBe(200);
      const memoryBody = await memory.json();
      expect(memoryBody.memory_storage).toBe('ipfs');
      expect(memoryBody.memory_hash).toBe('a'.repeat(64));

      const chains = await request.patch(`${API}/v1/pet/sovereign/${livingPetId}/chains`, {
        headers: authHeaders(),
        data: { supportedChains: ['ethereum', 'base'] },
      });
      expect(chains.status()).toBe(200);
      const chainsBody = await chains.json();
      expect(chainsBody.supported_chains).toEqual(['ethereum', 'base']);

      const pause = await request.patch(`${API}/v1/pet/sovereign/${livingPetId}/status`, {
        headers: authHeaders(),
        data: { status: 'paused' },
      });
      expect(pause.status()).toBe(200);
      const pauseBody = await pause.json();
      expect(pauseBody.status).toBe('paused');

      const revert = await request.post(`${API}/v1/pet/sovereign/${livingPetId}/revert`, {
        headers: authHeaders(),
      });
      expect(revert.status()).toBe(201);
      const revertBody = await revert.json();
      expect(revertBody.custody_mode).toBe('platform');
    } finally {
      if (original.custody_mode === 'self' && original.wallet_address) {
        const restoreSelf = await request.post(`${API}/v1/pet/sovereign/${livingPetId}/enable-self`, {
          headers: authHeaders(),
          data: {
            walletAddress: original.wallet_address,
            supportedChains: original.supported_chains,
          },
        });
        expect(restoreSelf.status()).toBe(201);
      } else if (original.custody_mode === 'mpc' && original.mpc) {
        const restoreMpc = await request.post(`${API}/v1/pet/sovereign/${livingPetId}/enable-mpc`, {
          headers: authHeaders(),
          data: {
            mpcUserShareCommitment: original.mpc.user_share_commitment,
            mpcDeviceFingerprint: original.mpc.device_fingerprint,
            mpcServerKmsKeyId: original.mpc.server_kms_key_id,
            walletAddress: original.wallet_address || undefined,
            supportedChains: original.supported_chains,
          },
        });
        expect(restoreMpc.status()).toBe(201);
      } else {
        const restorePlatform = await request.post(`${API}/v1/pet/sovereign/${livingPetId}/revert`, {
          headers: authHeaders(),
        });
        expect(restorePlatform.status()).toBe(201);
      }

      const restoreChains = await request.patch(`${API}/v1/pet/sovereign/${livingPetId}/chains`, {
        headers: authHeaders(),
        data: { supportedChains: original.supported_chains },
      });
      expect(restoreChains.status()).toBe(200);

      const restoreMemory = await request.patch(`${API}/v1/pet/sovereign/${livingPetId}/memory`, {
        headers: authHeaders(),
        data: original.memory_storage === 'platform'
          ? { memoryStorage: 'platform', memoryUri: null, memoryHash: null }
          : {
              memoryStorage: original.memory_storage,
              memoryUri: original.memory_uri,
              memoryHash: original.memory_hash,
            },
      });
      expect(restoreMemory.status()).toBe(200);

      const restoreStatus = await request.patch(`${API}/v1/pet/sovereign/${livingPetId}/status`, {
        headers: authHeaders(),
        data: { status: original.status },
      });
      expect(restoreStatus.status()).toBe(200);
    }
  });
});