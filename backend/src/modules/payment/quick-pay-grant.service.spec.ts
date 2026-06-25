import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { QuickPayGrantService } from './quick-pay-grant.service';
import { QuickPayGrant, QuickPayGrantStatus } from '../../entities/quick-pay-grant.entity';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((dto) => ({ id: 'grant-1', createdAt: new Date(), ...dto })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'grant-1', ...entity })),
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('QuickPayGrantService', () => {
  let service: QuickPayGrantService;
  let grantRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    grantRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuickPayGrantService,
        { provide: getRepositoryToken(QuickPayGrant), useValue: grantRepo },
      ],
    }).compile();

    service = module.get<QuickPayGrantService>(QuickPayGrantService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── createGrant ───────────────────────────────────────────────────────────

  describe('createGrant', () => {
    it('should create grant with default usage counters', async () => {
      const result = await service.createGrant('user-1', {
        paymentMethod: { type: 'crypto', methodId: 'eth-wallet' },
        permissions: { maxAmount: 100, maxDailyAmount: 500 },
        description: 'Test grant',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe(QuickPayGrantStatus.ACTIVE);
      expect(result.usage.totalAmount).toBe(0);
      expect(result.usage.dailyAmount).toBe(0);
      expect(result.usage.transactionCount).toBe(0);
      expect(grantRepo.save).toHaveBeenCalled();
    });

    it('should set expiresAt based on expiresIn', async () => {
      const before = Date.now();

      await service.createGrant('user-1', {
        paymentMethod: { type: 'stripe' },
        permissions: {},
        expiresIn: 3600, // 1 hour
      });

      const createArg = grantRepo.create.mock.calls[0][0];
      expect(createArg.expiresAt).toBeDefined();
      expect(createArg.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000 - 100);
    });

    it('should set expiresAt to null if expiresIn not provided', async () => {
      await service.createGrant('user-1', {
        paymentMethod: { type: 'crypto' },
        permissions: {},
      });

      const createArg = grantRepo.create.mock.calls[0][0];
      expect(createArg.expiresAt).toBeNull();
    });
  });

  // ── getGrant ──────────────────────────────────────────────────────────────

  describe('getGrant', () => {
    it('should return null if grant not found', async () => {
      grantRepo.findOne.mockResolvedValue(null);
      const result = await service.getGrant('nope', 'user-1');
      expect(result).toBeNull();
    });

    it('should return grant if found and not expired', async () => {
      const grant = {
        id: 'g-1',
        userId: 'user-1',
        status: QuickPayGrantStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 100000),
        usage: { totalAmount: 10, dailyAmount: 5, transactionCount: 1, lastResetDate: new Date() },
      };
      grantRepo.findOne.mockResolvedValue(grant);

      const result = await service.getGrant('g-1', 'user-1');
      expect(result).toBeDefined();
      expect(result.id).toBe('g-1');
    });

    it('should mark as expired and return null if past expiresAt', async () => {
      const grant = {
        id: 'g-2',
        userId: 'user-1',
        status: QuickPayGrantStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 10000), // expired
        usage: { totalAmount: 0, dailyAmount: 0, transactionCount: 0, lastResetDate: new Date() },
      };
      grantRepo.findOne.mockResolvedValue(grant);

      const result = await service.getGrant('g-2', 'user-1');
      expect(result).toBeNull();
      expect(grant.status).toBe(QuickPayGrantStatus.EXPIRED);
      expect(grantRepo.save).toHaveBeenCalled();
    });
  });

  // ── validateGrant ─────────────────────────────────────────────────────────

  describe('validateGrant', () => {
    const baseGrant = () => ({
      id: 'g-1',
      userId: 'user-1',
      status: QuickPayGrantStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 100000),
      permissions: {
        maxAmount: 100,
        maxDailyAmount: 500,
        maxTransactions: 10,
        allowedMerchants: ['merchant-a'],
      },
      usage: {
        totalAmount: 50,
        dailyAmount: 200,
        transactionCount: 3,
        lastResetDate: new Date(),
      },
    });

    it('should pass valid grant', async () => {
      const result = await service.validateGrant(baseGrant() as any, 50, 'merchant-a');
      expect(result.valid).toBe(true);
    });

    it('should reject inactive grant', async () => {
      const grant = { ...baseGrant(), status: QuickPayGrantStatus.REVOKED } as any;
      const result = await service.validateGrant(grant, 10);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('失效');
    });

    it('should reject expired grant', async () => {
      const grant = { ...baseGrant(), expiresAt: new Date(Date.now() - 1000) } as any;
      const result = await service.validateGrant(grant, 10);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('过期');
    });

    it('should reject amount exceeding single limit', async () => {
      const result = await service.validateGrant(baseGrant() as any, 150);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('单笔');
    });

    it('should reject amount exceeding daily limit', async () => {
      const grant = baseGrant();
      grant.usage.dailyAmount = 480;
      const result = await service.validateGrant(grant as any, 30);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('每日');
    });

    it('should reject when transaction count exceeds limit', async () => {
      const grant = baseGrant();
      grant.usage.transactionCount = 10;
      const result = await service.validateGrant(grant as any, 10);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('交易次数');
    });

    it('should reject unauthorized merchant', async () => {
      const result = await service.validateGrant(baseGrant() as any, 10, 'merchant-b');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('商户');
    });
  });

  // ── recordUsage ───────────────────────────────────────────────────────────

  describe('recordUsage', () => {
    it('should increment usage counters', async () => {
      const grant = {
        id: 'g-1',
        usage: { totalAmount: 100, dailyAmount: 50, transactionCount: 2, lastResetDate: new Date() },
      };
      grantRepo.findOne.mockResolvedValue(grant);

      await service.recordUsage('g-1', 25);

      expect(grant.usage.totalAmount).toBe(125);
      expect(grant.usage.dailyAmount).toBe(75);
      expect(grant.usage.transactionCount).toBe(3);
      expect(grantRepo.save).toHaveBeenCalled();
    });

    it('should no-op if grant not found', async () => {
      grantRepo.findOne.mockResolvedValue(null);
      await service.recordUsage('nope', 10);
      expect(grantRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── revokeGrant ───────────────────────────────────────────────────────────

  describe('revokeGrant', () => {
    it('should revoke grant', async () => {
      const grant = { id: 'g-1', userId: 'user-1', status: QuickPayGrantStatus.ACTIVE };
      grantRepo.findOne.mockResolvedValue(grant);

      const result = await service.revokeGrant('g-1', 'user-1');
      expect(result.status).toBe(QuickPayGrantStatus.REVOKED);
      expect(result.revokedAt).toBeDefined();
    });

    it('should throw NotFoundException if grant not found', async () => {
      grantRepo.findOne.mockResolvedValue(null);
      await expect(service.revokeGrant('nope', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getUserGrants ─────────────────────────────────────────────────────────

  describe('getUserGrants', () => {
    it('should return active grants for user', async () => {
      const grants = [
        { id: 'g-1', status: QuickPayGrantStatus.ACTIVE },
        { id: 'g-2', status: QuickPayGrantStatus.ACTIVE },
      ];
      grantRepo.find.mockResolvedValue(grants);

      const result = await service.getUserGrants('user-1');
      expect(result).toHaveLength(2);
      expect(grantRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', status: QuickPayGrantStatus.ACTIVE },
        }),
      );
    });
  });
});
