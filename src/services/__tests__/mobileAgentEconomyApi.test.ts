const storage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { storage.delete(key); }),
  },
}));

jest.mock('../api', () => ({
  getApiConfig: jest.fn(() => ({ baseUrl: 'http://localhost' })),
}));
jest.mock('../mobileV6FeatureFlags', () => ({
  isMobileV6FeatureEnabled: jest.fn(() => false),
}));
jest.mock('../mobileV6Runtime', () => ({
  mobileV6HttpTransport: {},
}));
jest.mock('../../stores/authStore', () => ({
  useAuthStore: { getState: jest.fn(() => ({ accessToken: null })) },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearMobileEconomyPaymentCheckpoint,
  loadMobileEconomyPaymentCheckpoint,
  saveMobileEconomyPaymentCheckpoint,
  type MobileEconomyPaymentCheckpoint,
} from '../mobileAgentEconomyApi';

const scope = { ownerId: 'owner-1', soulCoreId: 'soul-1', actionId: 'action-1' };
const intent: MobileEconomyPaymentCheckpoint = {
  schemaVersion: 1,
  ...scope,
  quoteId: 'quote-1',
  idempotencyKey: 'payment-key-1',
  state: 'intent_persisted',
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

describe('Mobile Agent Economy durable payment checkpoint', () => {
  beforeEach(() => {
    storage.clear();
    jest.clearAllMocks();
  });

  it('round-trips the pre-wallet intent fence', async () => {
    await saveMobileEconomyPaymentCheckpoint(intent);

    await expect(loadMobileEconomyPaymentCheckpoint(scope)).resolves.toEqual(intent);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('round-trips proof with the same quote and idempotency key', async () => {
    const proof: MobileEconomyPaymentCheckpoint = {
      ...intent,
      state: 'proof_persisted',
      proof: {
        txHash: `0x${'ab'.repeat(32)}`,
        network: 'bsc-testnet',
        asset: 'USDC',
      },
      updatedAt: '2026-07-31T00:01:00.000Z',
    };

    await saveMobileEconomyPaymentCheckpoint(intent);
    await saveMobileEconomyPaymentCheckpoint(proof);

    await expect(loadMobileEconomyPaymentCheckpoint(scope)).resolves.toEqual(proof);
  });

  it('fails closed when durable storage is corrupt', async () => {
    await AsyncStorage.setItem(
      '@agentrix/economy-payment/v1:owner-1:soul-1:action-1',
      '{not-json',
    );

    await expect(loadMobileEconomyPaymentCheckpoint(scope)).resolves.toMatchObject({
      ...scope,
      state: 'recovery_blocked',
      recoveryError: 'checkpoint_corrupt',
    });
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('only clears the exact idempotency checkpoint', async () => {
    await saveMobileEconomyPaymentCheckpoint(intent);

    await expect(clearMobileEconomyPaymentCheckpoint(scope, 'wrong-key'))
      .rejects.toThrow('mobile_payment_checkpoint_conflict');
    await expect(loadMobileEconomyPaymentCheckpoint(scope)).resolves.toEqual(intent);

    await clearMobileEconomyPaymentCheckpoint(scope, intent.idempotencyKey);
    await expect(loadMobileEconomyPaymentCheckpoint(scope)).resolves.toBeNull();
  });
});
