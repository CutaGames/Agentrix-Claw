/**
 * intentBridge contract tests — pin the V4 surface so a future refactor
 * doesn't silently drop a system-assistant intent.
 *
 * Coverage:
 *   - listKnownIntents covers V3 (6) + V4 (3) = 9 intents
 *   - dispatchIntent gracefully reports missing handler
 *   - handleDeepLink parses both `agentrix://intent/<name>` shapes
 *   - handleDeepLink encodes URL params into the payload
 */

// react-native Linking mocked away for the bridge import path.
jest.mock(
  'react-native',
  () => ({
    Linking: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      getInitialURL: jest.fn(async () => null),
    },
  }),
  { virtual: true },
);

import {
  dispatchIntent,
  handleDeepLink,
  isKnownIntent,
  listKnownIntents,
  registerIntentHandler,
} from '../intentBridge';

describe('intentBridge', () => {
  it('lists 9 intents (V3 core 6 + V4 additions 3)', () => {
    const names = listKnownIntents().sort();
    expect(names).toEqual(
      [
        'approve',
        'ask-aira',
        'create-pet',
        'draft',
        'invoke-agent',
        'market-search',
        'pet-mood',
        'switch-skin',
        'wallet-status',
      ].sort(),
    );
  });

  it('isKnownIntent rejects unknown names', () => {
    expect(isKnownIntent('pet-mood')).toBe(true);
    expect(isKnownIntent('create-pet')).toBe(true);
    expect(isKnownIntent('drop-database')).toBe(false);
  });

  it('dispatchIntent without a handler returns ok=false', async () => {
    const r = await dispatchIntent('create-pet');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/handler/i);
  });

  it('dispatchIntent invokes the registered handler', async () => {
    const dispose = registerIntentHandler('pet-mood', async () => ({
      ok: true,
      message: 'happy',
    }));
    try {
      const r = await dispatchIntent('pet-mood');
      expect(r.ok).toBe(true);
      expect(r.message).toBe('happy');
    } finally {
      dispose();
    }
  });

  it('handleDeepLink parses agentrix://intent/pet-mood', async () => {
    const seen: unknown[] = [];
    const dispose = registerIntentHandler('pet-mood', async (p) => {
      seen.push(p);
      return { ok: true, message: 'ok' };
    });
    try {
      const r = await handleDeepLink('agentrix://intent/pet-mood');
      expect(r?.ok).toBe(true);
      expect(seen).toHaveLength(1);
    } finally {
      dispose();
    }
  });

  it('handleDeepLink decodes V4 create-pet prompt URL param', async () => {
    let captured: any = null;
    const dispose = registerIntentHandler('create-pet', async (p) => {
      captured = p;
      return { ok: true, message: 'ok' };
    });
    try {
      const r = await handleDeepLink(
        'agentrix://intent/create-pet?prompt=blue%20unicorn&style=anime',
      );
      expect(r?.ok).toBe(true);
      expect(captured?.prompt).toBe('blue unicorn');
      expect(captured?.style).toBe('anime');
    } finally {
      dispose();
    }
  });

  it('handleDeepLink decodes V4 switch-skin params', async () => {
    let captured: any = null;
    const dispose = registerIntentHandler('switch-skin', async (p) => {
      captured = p;
      return { ok: true, message: 'ok' };
    });
    try {
      await handleDeepLink('agentrix://intent/switch-skin?skinName=Cat%20Girl');
      expect(captured?.skinName).toBe('Cat Girl');
    } finally {
      dispose();
    }
  });

  it('handleDeepLink decodes V4 market-search query + category', async () => {
    let captured: any = null;
    const dispose = registerIntentHandler('market-search', async (p) => {
      captured = p;
      return { ok: true, message: 'ok' };
    });
    try {
      await handleDeepLink(
        'agentrix://intent/market-search?query=christmas&category=skin',
      );
      expect(captured?.query).toBe('christmas');
      expect(captured?.category).toBe('skin');
    } finally {
      dispose();
    }
  });

  it('handleDeepLink rejects non-agentrix URLs', async () => {
    expect(await handleDeepLink('https://example.com/intent/pet-mood')).toBeNull();
  });

  it('handleDeepLink reports unknown intent', async () => {
    const r = await handleDeepLink('agentrix://intent/drop-database');
    expect(r?.ok).toBe(false);
    expect(r?.message).toMatch(/unknown/i);
  });
});
