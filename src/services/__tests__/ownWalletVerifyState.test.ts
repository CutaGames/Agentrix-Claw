/**
 * L8-6 S11b, P22: the one-time `state` of the address check (design 6a, R2-M3). A link alone proves nothing: only a state the
 * phone made and is still waiting for, with the account and chain it stored and the card shows now, counts.
 */
import {
  acceptVerifiedLinkV1,
  base64UrlV1,
  beginVerifyV1,
  isDeviceVerifiedV1,
  VERIFIED_KEY_PREFIX_V1,
  VERIFY_STATE_KEY_PREFIX_V1,
  VERIFY_STATE_TTL_MS_V1,
  type AcceptVerifiedDepsV1,
  type VerifyStateStoreV1,
} from '../ownWalletVerifyState';

const AGENT = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const OTHER_AGENT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ACCOUNT = '0xabcdef0123456789abcdef0123456789abcdef01';
const OTHER_ACCOUNT = '0x1111111111111111111111111111111111111111';

class MemoryStore implements VerifyStateStoreV1 {
  data = new Map<string, string>();
  failGet = false;
  failSet = false;
  failDelete = false;
  deletes: string[] = [];
  async getItem(key: string) {
    if (this.failGet) throw new Error('get failed');
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  async setItem(key: string, value: string) {
    if (this.failSet) throw new Error('set failed');
    this.data.set(key, value);
  }
  async deleteItem(key: string) {
    if (this.failDelete) throw new Error('delete failed');
    this.deletes.push(key);
    this.data.delete(key);
  }
}

function setup(card: Awaited<ReturnType<AcceptVerifiedDepsV1['readCard']>> = { status: 'active', chainId: 97, account: ACCOUNT }) {
  const store = new MemoryStore();
  let clock = 1_000_000;
  let counter = 0;
  const readCard = jest.fn(async (_agentId: string) => card);
  const deps: AcceptVerifiedDepsV1 = {
    store,
    random: async (n) => Uint8Array.from({ length: n }, (_v, i) => (i * 7 + ++counter) % 256),
    now: () => clock,
    readCard,
  };
  return { store, deps, readCard, advance: (ms: number) => { clock += ms; } };
}

async function begin(deps: AcceptVerifiedDepsV1, over: Partial<{ agentId: string; account: string; chainId: number }> = {}) {
  const r = await beginVerifyV1({ agentId: AGENT, account: ACCOUNT, chainId: 97, ...over }, deps);
  if (r.ok === false) throw new Error('begin failed: ' + r.reason);
  return r.state;
}

describe('base64UrlV1', () => {
  it('matches the standard encoding without padding', () => {
    for (const len of [0, 1, 2, 3, 4, 31, 32, 33]) {
      const bytes = Uint8Array.from({ length: len }, (_v, i) => (i * 37 + 11) % 256);
      const expected = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      expect(base64UrlV1(bytes)).toBe(expected);
    }
  });
});

describe('beginVerifyV1', () => {
  it('makes a 43 character state from 32 random bytes and stores the record under it', async () => {
    const { store, deps } = setup();
    const r = await beginVerifyV1({ agentId: AGENT, account: ACCOUNT.toUpperCase().replace('0X', '0x'), chainId: 97 }, deps);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = JSON.parse(store.data.get(VERIFY_STATE_KEY_PREFIX_V1 + r.state) as string);
      expect(stored).toEqual({ agentId: AGENT, account: ACCOUNT, chainId: 97, createdAt: 1_000_000 });
    }
  });

  it('two checks never share a state', async () => {
    const { deps } = setup();
    expect(await begin(deps)).not.toBe(await begin(deps));
  });

  it('refuses input that is not an Agent id, an address on an allowed chain', async () => {
    const { deps, store } = setup();
    for (const bad of [{ agentId: 'agent-1' }, { account: '0x12' }, { chainId: 56 }, { chainId: 8453 }, { chainId: 1 }]) {
      expect(await beginVerifyV1({ agentId: AGENT, account: ACCOUNT, chainId: 97, ...bad }, deps)).toEqual({ ok: false, reason: 'input_invalid' });
    }
    expect(store.data.size).toBe(0);
  });

  it('a random source that fails or gives the wrong length stores nothing', async () => {
    const { store, deps } = setup();
    expect(await beginVerifyV1({ agentId: AGENT, account: ACCOUNT, chainId: 97 }, { ...deps, random: async () => { throw new Error('no entropy'); } })).toEqual({ ok: false, reason: 'random_unavailable' });
    expect(await beginVerifyV1({ agentId: AGENT, account: ACCOUNT, chainId: 97 }, { ...deps, random: () => new Uint8Array(16) })).toEqual({ ok: false, reason: 'random_unavailable' });
    expect(store.data.size).toBe(0);
  });

  it('a store that cannot write is a failure, not a state the phone is not waiting for', async () => {
    const { store, deps } = setup();
    store.failSet = true;
    expect(await beginVerifyV1({ agentId: AGENT, account: ACCOUNT, chainId: 97 }, deps)).toEqual({ ok: false, reason: 'store_unavailable' });
  });
});

describe('acceptVerifiedLinkV1 (P22)', () => {
  it('a state the phone is waiting for, with the stored and current account, is accepted and the check is recorded', async () => {
    const { store, deps, readCard } = setup();
    const state = await begin(deps);
    const result = await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps);
    expect(result).toEqual({ ok: true, agentId: AGENT, account: ACCOUNT, chainId: 97 });
    expect(readCard).toHaveBeenCalledWith(AGENT);
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(true);
    expect(store.data.has(`${VERIFIED_KEY_PREFIX_V1}97.${ACCOUNT}`)).toBe(true);
  });

  it('the state is deleted when it is accepted: a replay is not accepted', async () => {
    const { store, deps } = setup();
    const state = await begin(deps);
    expect((await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).ok).toBe(true);
    expect(store.data.has(VERIFY_STATE_KEY_PREFIX_V1 + state)).toBe(false);
    expect(await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'state_unknown' });
  });

  it('a link delivered twice at the same moment passes once', async () => {
    const { deps } = setup();
    const state = await begin(deps);
    const [a, b] = await Promise.all([
      acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps),
      acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it('no state, a state nobody made, or a link out of shape is not accepted', async () => {
    const { store, deps } = setup();
    expect(await acceptVerifiedLinkV1({ account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'link_invalid' });
    expect(await acceptVerifiedLinkV1(undefined, deps)).toEqual({ ok: false, reason: 'link_invalid' });
    expect(await acceptVerifiedLinkV1({ state: 'x'.repeat(43), account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'state_unknown' });
    expect(await acceptVerifiedLinkV1({ state: 'short', account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'link_invalid' });
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(false);
  });

  it('an expired state is not accepted and is spent', async () => {
    const { store, deps, advance } = setup();
    const state = await begin(deps);
    advance(VERIFY_STATE_TTL_MS_V1 + 1);
    expect(await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'state_expired' });
    expect(store.data.has(VERIFY_STATE_KEY_PREFIX_V1 + state)).toBe(false);
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(false);
  });

  it('exactly ten minutes is still in time', async () => {
    const { deps, advance } = setup();
    const state = await begin(deps);
    advance(VERIFY_STATE_TTL_MS_V1);
    expect((await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).ok).toBe(true);
  });

  it('a clock that went backwards is not in time', async () => {
    const { deps, advance } = setup();
    const state = await begin(deps);
    advance(-5);
    expect(await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'state_expired' });
  });

  it('an account or chain other than the stored one is not accepted, and the state is spent', async () => {
    const { store, deps } = setup();
    const s1 = await begin(deps);
    expect(await acceptVerifiedLinkV1({ state: s1, account: OTHER_ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'account_mismatch' });
    const s2 = await begin(deps);
    expect(await acceptVerifiedLinkV1({ state: s2, account: ACCOUNT, chainId: '84532' }, deps)).toEqual({ ok: false, reason: 'account_mismatch' });
    expect(store.data.has(VERIFY_STATE_KEY_PREFIX_V1 + s1)).toBe(false);
    expect(store.data.has(VERIFY_STATE_KEY_PREFIX_V1 + s2)).toBe(false);
    expect(await isDeviceVerifiedV1(97, OTHER_ACCOUNT, { store })).toBe(false);
    expect(await isDeviceVerifiedV1(84532, ACCOUNT, { store })).toBe(false);
  });

  it('an account that is not the card\'s account now is not accepted (the DTO decides, not the link)', async () => {
    for (const card of [
      { status: 'active', chainId: 97, account: OTHER_ACCOUNT },
      { status: 'active', chainId: 84532, account: ACCOUNT },
      { status: 'lost', chainId: 97, account: ACCOUNT },
      { status: 'none' },
      { status: 'unavailable' },
    ]) {
      const { store, deps } = setup(card);
      const state = await begin(deps);
      expect(await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'card_mismatch' });
      expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(false);
    }
  });

  it('a card that cannot be read is not accepted', async () => {
    const { store, deps } = setup(null);
    const state = await begin(deps);
    expect(await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'card_unavailable' });
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(false);
    const thrower = setup();
    const s = await begin(thrower.deps);
    expect(await acceptVerifiedLinkV1({ state: s, account: ACCOUNT, chainId: '97' }, { ...thrower.deps, readCard: async () => { throw new Error('offline'); } })).toEqual({ ok: false, reason: 'card_unavailable' });
  });

  it('the card read is for the Agent the stored record names, whatever the link says', async () => {
    const { deps, readCard } = setup();
    const state = await begin(deps, { agentId: OTHER_AGENT });
    await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97', agent: AGENT }, deps);
    expect(readCard).toHaveBeenCalledWith(OTHER_AGENT);
    expect(readCard).not.toHaveBeenCalledWith(AGENT);
  });

  it('a pending account (not yet on chain) can be checked', async () => {
    const { deps } = setup({ status: 'pending', chainId: 97, account: ACCOUNT });
    const state = await begin(deps);
    expect((await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).ok).toBe(true);
  });

  it('a record that cannot be deleted accepts nothing', async () => {
    const { store, deps } = setup();
    const state = await begin(deps);
    store.failDelete = true;
    expect(await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'store_unavailable' });
    store.failDelete = false;
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(false);
  });

  it('a store that cannot be read or written accepts nothing', async () => {
    const a = setup();
    const s1 = await begin(a.deps);
    a.store.failGet = true;
    expect(await acceptVerifiedLinkV1({ state: s1, account: ACCOUNT, chainId: '97' }, a.deps)).toEqual({ ok: false, reason: 'store_unavailable' });
    const b = setup();
    const s2 = await begin(b.deps);
    b.store.failSet = true;
    expect(await acceptVerifiedLinkV1({ state: s2, account: ACCOUNT, chainId: '97' }, b.deps)).toEqual({ ok: false, reason: 'store_unavailable' });
    b.store.failSet = false;
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store: b.store })).toBe(false);
  });

  it('a stored record that is not what beginVerifyV1 writes is not accepted', async () => {
    for (const raw of ['not json', 'null', '"x"', JSON.stringify({ agentId: AGENT }), JSON.stringify({ agentId: 'nope', account: ACCOUNT, chainId: 97, createdAt: 1_000_000 }), JSON.stringify({ agentId: AGENT, account: ACCOUNT, chainId: '97', createdAt: 1_000_000 })]) {
      const { store, deps } = setup();
      const state = 'S'.repeat(43);
      store.data.set(VERIFY_STATE_KEY_PREFIX_V1 + state, raw);
      expect(await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps)).toEqual({ ok: false, reason: 'state_unknown' });
      expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(false);
    }
  });
});

describe('isDeviceVerifiedV1', () => {
  it('is true only for the exact account on the exact chain', async () => {
    const { store, deps } = setup();
    const state = await begin(deps);
    await acceptVerifiedLinkV1({ state, account: ACCOUNT, chainId: '97' }, deps);
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(true);
    expect(await isDeviceVerifiedV1(97, ACCOUNT.toUpperCase().replace('0X', '0x'), { store })).toBe(true);
    expect(await isDeviceVerifiedV1(84532, ACCOUNT, { store })).toBe(false);
    expect(await isDeviceVerifiedV1(97, OTHER_ACCOUNT, { store })).toBe(false);
    expect(await isDeviceVerifiedV1(56, ACCOUNT, { store })).toBe(false);
    expect(await isDeviceVerifiedV1(97, '0x12', { store })).toBe(false);
  });

  it('a record that is not ours, or a store that cannot be read, is not a check', async () => {
    const { store } = setup();
    store.data.set(`${VERIFIED_KEY_PREFIX_V1}97.${ACCOUNT}`, 'true');
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(false);
    store.data.set(`${VERIFIED_KEY_PREFIX_V1}97.${ACCOUNT}`, '{"verifiedAt":1}');
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(false);
    store.failGet = true;
    expect(await isDeviceVerifiedV1(97, ACCOUNT, { store })).toBe(false);
  });
});
