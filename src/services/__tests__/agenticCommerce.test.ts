/**
 * Tests for evaluateAgenticAction (P-9 wave 8 T19.5).
 *
 * Covers all 7 decision branches:
 *   1. feature-disabled
 *   2. emergency-frozen
 *   3. category-not-allowed
 *   4. over-per-tx-limit (→ request-approval)
 *   5. over-daily-limit (→ request-approval)
 *   6. below-min-balance (→ request-approval)
 *   7. auto-execute
 */
import {
  evaluateAgenticAction,
  setLimits,
  getLimits,
  DEFAULT_LIMITS,
  emergencyFreeze,
  clearEmergencyFreeze,
  _setEvaluateAgenticDeps,
  _setStorageForTests,
} from '../agenticCommerce.service';

describe('agenticCommerce.evaluateAgenticAction', () => {
  beforeEach(() => {
    // In-memory storage so MMKV doesn't get pulled in
    const mem = new Map<string, string>();
    _setStorageForTests({
      getString: (k) => mem.get(k),
      set: (k, v) => {
        mem.set(k, v);
      },
    });
    setLimits({ ...DEFAULT_LIMITS });
    clearEmergencyFreeze();
    _setEvaluateAgenticDeps({
      fetchTodaySpend: async () => 0,
      fetchPetBalance: async () => 1000,
    });
  });

  test('blocks when feature disabled (default)', async () => {
    const dec = await evaluateAgenticAction({
      petId: 'p1',
      category: 'free-skill-install',
      amount: 5,
      description: '',
    });
    expect(dec.action).toBe('block');
    expect(dec.reason).toBe('feature-disabled');
  });

  test('blocks when emergency frozen', async () => {
    setLimits({ enabled: true });
    emergencyFreeze(24);
    const dec = await evaluateAgenticAction({
      petId: 'p1',
      category: 'free-skill-install',
      amount: 5,
      description: '',
    });
    expect(dec.action).toBe('block');
    expect(dec.reason).toBe('emergency-frozen');
  });

  test('blocks when category is not whitelisted', async () => {
    setLimits({
      enabled: true,
      whitelistCategories: ['free-skill-install'],
    });
    const dec = await evaluateAgenticAction({
      petId: 'p1',
      category: 'world-asset-purchase',
      amount: 5,
      description: '',
    });
    expect(dec.action).toBe('block');
    expect(dec.reason).toBe('category-not-allowed');
  });

  test('requests approval when over per-transaction limit', async () => {
    setLimits({
      enabled: true,
      perTransactionMax: 30,
      whitelistCategories: ['subscribed-skill-renew'],
    });
    const dec = await evaluateAgenticAction({
      petId: 'p1',
      category: 'subscribed-skill-renew',
      amount: 60,
      description: '',
    });
    expect(dec.action).toBe('request-approval');
    expect(dec.reason).toBe('over-per-tx-limit');
  });

  test('requests approval when over daily limit', async () => {
    setLimits({
      enabled: true,
      perTransactionMax: 50,
      dailyMax: 100,
      whitelistCategories: ['subscribed-skill-renew'],
    });
    _setEvaluateAgenticDeps({ fetchTodaySpend: async () => 80 });
    const dec = await evaluateAgenticAction({
      petId: 'p1',
      category: 'subscribed-skill-renew',
      amount: 25,
      description: '',
    });
    expect(dec.action).toBe('request-approval');
    expect(dec.reason).toBe('over-daily-limit');
  });

  test('requests approval when balance would dip below safe minimum', async () => {
    setLimits({
      enabled: true,
      perTransactionMax: 50,
      dailyMax: 100,
      minSafeBalance: 5,
      whitelistCategories: ['subscribed-skill-renew'],
    });
    const dec = await evaluateAgenticAction({
      petId: 'p1',
      category: 'subscribed-skill-renew',
      amount: 20,
      description: '',
      knownBalance: 10, // 10 - 20 = -10 < 5
      knownTodaySpend: 0,
    });
    expect(dec.action).toBe('request-approval');
    expect(dec.reason).toBe('below-min-balance');
  });

  test('auto-executes when within all limits', async () => {
    setLimits({
      enabled: true,
      perTransactionMax: 50,
      dailyMax: 100,
      minSafeBalance: 5,
      whitelistCategories: ['subscribed-skill-renew'],
    });
    const dec = await evaluateAgenticAction({
      petId: 'p1',
      category: 'subscribed-skill-renew',
      amount: 30,
      description: '',
      knownBalance: 200,
      knownTodaySpend: 10,
    });
    expect(dec.action).toBe('auto-execute');
    expect(dec.reason).toBe('within-limits');
  });

  test('priority order: feature-disabled beats emergency-frozen', async () => {
    setLimits({ enabled: false });
    emergencyFreeze(24);
    const dec = await evaluateAgenticAction({
      petId: 'p1',
      category: 'free-skill-install',
      amount: 1,
      description: '',
    });
    expect(dec.reason).toBe('feature-disabled');
  });

  test('priority order: per-tx limit beats daily limit', async () => {
    setLimits({
      enabled: true,
      perTransactionMax: 10,
      dailyMax: 100,
      whitelistCategories: ['free-skill-install'],
    });
    const dec = await evaluateAgenticAction({
      petId: 'p1',
      category: 'free-skill-install',
      amount: 60, // breaks both per-tx (>10) AND daily (>100 with todaySpend>=40)
      description: '',
      knownTodaySpend: 50,
    });
    expect(dec.reason).toBe('over-per-tx-limit');
  });

  test('clearEmergencyFreeze restores normal flow', async () => {
    setLimits({ enabled: true, whitelistCategories: ['free-skill-install'] });
    emergencyFreeze(24);
    const before = await evaluateAgenticAction({
      petId: 'p1',
      category: 'free-skill-install',
      amount: 5,
      description: '',
    });
    expect(before.reason).toBe('emergency-frozen');
    clearEmergencyFreeze();
    const after = await evaluateAgenticAction({
      petId: 'p1',
      category: 'free-skill-install',
      amount: 5,
      description: '',
      knownBalance: 1000,
      knownTodaySpend: 0,
    });
    expect(after.action).toBe('auto-execute');
  });

  test('getLimits returns merged defaults for partial persisted state', () => {
    const lim = getLimits();
    expect(lim.enabled).toBe(false);
    expect(lim.perTransactionMax).toBe(30);
    expect(lim.whitelistCategories).toContain('free-skill-install');
  });
});
