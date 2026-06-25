import { Wallet } from 'ethers';
import { MPCShardProtectionService } from './mpc-shard-protection.service';
import { encryptShard } from './mpc-shard-crypto.util';
import { MPCSignatureService } from './mpc-signature.service';
import { MPCWalletService } from './mpc-wallet.service';
import { splitSecret } from './mpc-threshold.util';

const createConfigService = (values: Record<string, string | undefined>) => ({
  get: jest.fn((key: string) => values[key]),
});

const createWalletRepository = () => {
  const store = new Map<string, any>();
  let sequence = 0;

  const matchesWhere = (entity: any, where: Record<string, unknown> | undefined) => {
    if (!where) {
      return true;
    }
    return Object.entries(where).every(([key, value]) => entity[key] === value);
  };

  return {
    create: jest.fn((data: Record<string, unknown>) => ({
      id: `wallet-${++sequence}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    })),
    save: jest.fn(async (entity: any) => {
      const saved = {
        ...entity,
        id: entity.id || `wallet-${++sequence}`,
        createdAt: entity.createdAt || new Date(),
        updatedAt: new Date(),
      };
      store.set(saved.id, saved);
      return saved;
    }),
    findOne: jest.fn(async (options?: { where?: Record<string, unknown> | Array<Record<string, unknown>> }) => {
      const candidates = [...store.values()];
      const whereList = Array.isArray(options?.where) ? options?.where : [options?.where];
      for (const candidate of candidates) {
        if (whereList.some((where) => matchesWhere(candidate, where))) {
          return candidate;
        }
      }
      return null;
    }),
    update: jest.fn(async (criteria: Record<string, unknown>, partial: Record<string, unknown>) => {
      const targets = [...store.values()].filter((item) => matchesWhere(item, criteria));
      for (const target of targets) {
        store.set(target.id, { ...target, ...partial, updatedAt: new Date() });
      }
      return { affected: targets.length };
    }),
    seed(entity: Record<string, unknown>) {
      const seeded = {
        id: `wallet-${++sequence}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...entity,
      };
      store.set(seeded.id, seeded);
      return seeded;
    },
  };
};

describe('MPC shard protection', () => {
  it('uses AWS KMS when a KMS key is configured', async () => {
    const service = new MPCShardProtectionService(
      createConfigService({
        MPC_AWS_KMS_KEY_ID: 'kms-key-1',
        AWS_REGION: 'ap-southeast-1',
      }) as any,
    );

    const send = jest
      .fn()
      .mockResolvedValueOnce({ CiphertextBlob: Buffer.from('ciphertext') })
      .mockResolvedValueOnce({ Plaintext: Buffer.from('a1b2c3', 'hex') });

    jest.spyOn(service as any, 'getKmsClient').mockReturnValue({ send });

    const protectedShard = await service.protectShard('owner-1', 'a1b2c3');
    const restoredShard = await service.unprotectShard(
      'owner-1',
      protectedShard.encryptedShard,
      protectedShard.descriptor,
    );

    expect(protectedShard.descriptor).toEqual(
      expect.objectContaining({
        mode: 'aws-kms',
        keyId: 'kms-key-1',
        region: 'ap-southeast-1',
      }),
    );
    expect(restoredShard).toBe('a1b2c3');
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('MPC wallet threshold signing', () => {
  it('stores shard B under local-secret protection and recovers the same wallet with A+C and A+B', async () => {
    const walletRepository = createWalletRepository();
    const shardProtectionService = new MPCShardProtectionService(
      createConfigService({ MPC_SERVER_SHARD_SECRET: 'server-side-secret' }) as any,
    );
    const walletService = new MPCWalletService(walletRepository as any, shardProtectionService);
    const signatureService = new MPCSignatureService(walletRepository as any, shardProtectionService);

    const created = await walletService.generateMPCWallet('merchant-1', 'merchant-password');
    const stored = await walletService.getMPCWallet('merchant-1');
    const recoveredAddress = await walletService.recoverWallet(
      'merchant-1',
      created.encryptedShardA,
      created.encryptedShardC,
      'merchant-password',
    );
    const signed = await signatureService.signWithShardAAndB(
      'merchant-1',
      '0x000000000000000000000000000000000000dEaD',
      123n,
      created.encryptedShardA,
      'merchant-password',
      'auth-token',
    );

    expect(stored.metadata).toEqual(
      expect.objectContaining({
        mpcThreshold: expect.objectContaining({ threshold: 2, totalShares: 3 }),
        mpcShardProtection: expect.objectContaining({ mode: 'local-secret' }),
      }),
    );
    expect(recoveredAddress).toBe(created.walletAddress);
    expect(signed.signature).toMatch(/^0x[0-9a-f]+$/i);
  });

  it('keeps legacy password-protected shard B wallets signable', async () => {
    const merchantPassword = 'legacy-password';
    const walletRepository = createWalletRepository();
    const shardProtectionService = new MPCShardProtectionService(createConfigService({}) as any);
    const signatureService = new MPCSignatureService(walletRepository as any, shardProtectionService);

    const wallet = Wallet.createRandom();
    const shares = splitSecret(wallet.privateKey.substring(2), 3, 2);
    const encryptedShardA = encryptShard(shares[0], merchantPassword);
    const encryptedShardB = encryptShard(shares[1], merchantPassword);

    walletRepository.seed({
      merchantId: 'merchant-legacy',
      walletAddress: wallet.address,
      chain: 'BSC',
      currency: 'USDC',
      encryptedShardB,
      isActive: true,
      metadata: null,
    });

    const signed = await signatureService.signWithShardAAndB(
      'merchant-legacy',
      '0x000000000000000000000000000000000000dEaD',
      456n,
      encryptedShardA,
      merchantPassword,
      'auth-token',
    );

    expect(signed.signature).toMatch(/^0x[0-9a-f]+$/i);
  });
});