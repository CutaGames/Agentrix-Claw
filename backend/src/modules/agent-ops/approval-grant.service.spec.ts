import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ApprovalGrantService } from './approval-grant.service';
import { ApprovalGrantEntity } from './entities/approval-grant.entity';
import { PolicyEvaluatorService } from '../agent/policy-evaluator.service';

/**
 * ApprovalGrantService 单测 — 会话/任务预算授权(crypto-native-agent-ops 任务 10)。
 *
 * 覆盖 Property 9「审批范围有界」(需求 3.4):
 *   - 范围内(预算够 + 未过期)的 medium 动作 → 自动放行并消费预算;
 *   - 超预算 / 过期 / 无授权 → 回落人确认;
 *   - 红线先于一切授权拒绝;read 自动放行;high 始终人确认(grant 不能放行)。
 *
 * 仓库测试约定:无测试数据库,getRepositoryToken 注入 mock Repository。
 * PolicyEvaluatorService 用真实实例的纯函数 classifyActionRisk(不触库)。
 */
describe('ApprovalGrantService — 会话/任务预算授权 (需求 3.4 / Property 9)', () => {
  let service: ApprovalGrantService;

  const mockGrantRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    increment: jest.fn(),
  };

  // classifyActionRisk 是纯函数(只调 checkRedline,不访问仓库),
  // 用真实实例(仓库传 undefined)即可复用 Task 9 的风险分级逻辑。
  const realEvaluator = new PolicyEvaluatorService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );
  const mockPolicyEvaluator = {
    classifyActionRisk: (action: any) => realEvaluator.classifyActionRisk(action),
  };

  const makeGrant = (over: Partial<ApprovalGrantEntity> = {}): ApprovalGrantEntity =>
    ({
      id: 'g1',
      userId: 'u1',
      agentId: 'a1',
      scope: 'session',
      scopeId: 's1',
      budgetCap: '100',
      used: '0',
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as ApprovalGrantEntity;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalGrantService,
        { provide: getRepositoryToken(ApprovalGrantEntity), useValue: mockGrantRepo },
        { provide: PolicyEvaluatorService, useValue: mockPolicyEvaluator },
      ],
    }).compile();

    service = module.get<ApprovalGrantService>(ApprovalGrantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────── checkCoverage(纯判定) ───────────────

  describe('checkCoverage — 边界判定', () => {
    it('范围内 + 预算够 + 未过期 → covered', () => {
      const grant = makeGrant({ budgetCap: '100', used: '10' });
      expect(service.checkCoverage(grant, 50)).toEqual({ covered: true });
    });

    it('used + cost 恰好等于 budgetCap → covered(边界包含)', () => {
      const grant = makeGrant({ budgetCap: '100', used: '40' });
      expect(service.checkCoverage(grant, 60)).toEqual({ covered: true });
    });

    it('used + cost 超过 budgetCap → 不覆盖 EXCEEDS_BUDGET', () => {
      const grant = makeGrant({ budgetCap: '100', used: '90' });
      expect(service.checkCoverage(grant, 20)).toEqual({
        covered: false,
        reason: 'EXCEEDS_BUDGET',
      });
    });

    it('已过期(expiresAt <= now)→ 不覆盖 EXPIRED', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const grant = makeGrant({ expiresAt: new Date('2025-12-31T23:59:59Z') });
      expect(service.checkCoverage(grant, 1, now)).toEqual({
        covered: false,
        reason: 'EXPIRED',
      });
    });

    it('未过期(expiresAt > now)→ covered', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const grant = makeGrant({ expiresAt: new Date('2026-01-02T00:00:00Z') });
      expect(service.checkCoverage(grant, 1, now).covered).toBe(true);
    });

    it('无 grant → 不覆盖 NO_ACTIVE_GRANT', () => {
      expect(service.checkCoverage(null, 1)).toEqual({
        covered: false,
        reason: 'NO_ACTIVE_GRANT',
      });
    });
  });

  // ─────────────── evaluateAndConsume(分级 + 预算) ───────────────

  describe('evaluateAndConsume — 范围内放行', () => {
    it('medium 动作在预算内 → auto_execute 并消费预算', async () => {
      mockGrantRepo.findOne.mockResolvedValue(makeGrant({ budgetCap: '100', used: '10' }));
      mockGrantRepo.increment.mockResolvedValue({ affected: 1 });

      const result = await service.evaluateAndConsume({
        action: { type: 'publish' }, // medium
        userId: 'u1',
        agentId: 'a1',
        scope: 'session',
        scopeId: 's1',
        cost: 30,
      });

      expect(result.decision).toBe('auto_execute');
      expect(result.tier).toBe('medium');
      expect(result.withinGrant).toBe(true);
      expect(result.grantId).toBe('g1');
      expect(mockGrantRepo.increment).toHaveBeenCalledWith(
        { id: 'g1' },
        'used',
        30,
      );
    });
  });

  describe('evaluateAndConsume — 越界回落人确认 (Property 9)', () => {
    it('medium 动作超预算 → user_confirmation,不消费', async () => {
      mockGrantRepo.findOne.mockResolvedValue(makeGrant({ budgetCap: '100', used: '90' }));

      const result = await service.evaluateAndConsume({
        action: { type: 'publish' },
        userId: 'u1',
        agentId: 'a1',
        scope: 'session',
        scopeId: 's1',
        cost: 20,
      });

      expect(result.decision).toBe('user_confirmation');
      expect(result.withinGrant).toBe(false);
      expect(result.reason).toBe('EXCEEDS_BUDGET');
      expect(mockGrantRepo.increment).not.toHaveBeenCalled();
    });

    it('medium 动作 grant 已过期 → user_confirmation,不消费', async () => {
      const now = new Date('2026-01-01T00:00:00Z');
      mockGrantRepo.findOne.mockResolvedValue(
        makeGrant({ expiresAt: new Date('2025-12-31T00:00:00Z') }),
      );

      const result = await service.evaluateAndConsume({
        action: { type: 'click' },
        userId: 'u1',
        agentId: 'a1',
        scope: 'task',
        scopeId: 't1',
        cost: 5,
        now,
      });

      expect(result.decision).toBe('user_confirmation');
      expect(result.reason).toBe('EXPIRED');
      expect(mockGrantRepo.increment).not.toHaveBeenCalled();
    });

    it('medium 动作无任何 grant → user_confirmation', async () => {
      mockGrantRepo.findOne.mockResolvedValue(null);

      const result = await service.evaluateAndConsume({
        action: { type: 'publish' },
        userId: 'u1',
        agentId: 'a1',
        scope: 'session',
        scopeId: 's1',
        cost: 1,
      });

      expect(result.decision).toBe('user_confirmation');
      expect(result.reason).toBe('NO_ACTIVE_GRANT');
    });
  });

  describe('evaluateAndConsume — 分级前置(grant 不能越权放行)', () => {
    it('红线动作 → deny,先于授权(不查 grant)', async () => {
      const result = await service.evaluateAndConsume({
        action: { type: 'transfer', intent: 'wash trading 刷量对敲' },
        userId: 'u1',
        agentId: 'a1',
        scope: 'session',
        scopeId: 's1',
        cost: 1,
      });

      expect(result.decision).toBe('deny');
      expect(result.redline).toBe(true);
      expect(mockGrantRepo.findOne).not.toHaveBeenCalled();
    });

    it('read 动作 → auto_execute(无需 grant)', async () => {
      const result = await service.evaluateAndConsume({
        action: { type: 'screenshot' },
        userId: 'u1',
        agentId: 'a1',
        scope: 'session',
        scopeId: 's1',
      });

      expect(result.decision).toBe('auto_execute');
      expect(result.tier).toBe('read');
      expect(mockGrantRepo.findOne).not.toHaveBeenCalled();
    });

    it('high 动作即便有充足 grant 也强制人确认', async () => {
      mockGrantRepo.findOne.mockResolvedValue(makeGrant({ budgetCap: '1000000', used: '0' }));

      const result = await service.evaluateAndConsume({
        action: { type: 'transfer' }, // high
        userId: 'u1',
        agentId: 'a1',
        scope: 'session',
        scopeId: 's1',
        cost: 1,
      });

      expect(result.decision).toBe('user_confirmation');
      expect(result.tier).toBe('high');
      expect(result.withinGrant).toBe(false);
      expect(mockGrantRepo.increment).not.toHaveBeenCalled();
    });
  });

  // ─────────────── createGrant ───────────────

  describe('createGrant', () => {
    it('创建授权:budgetCap/used 转字符串,used 初始为 0', async () => {
      mockGrantRepo.create.mockImplementation((x) => x);
      mockGrantRepo.save.mockImplementation(async (x) => ({ id: 'g9', ...x }));

      const result = await service.createGrant('u1', {
        agentId: 'a1',
        scope: 'task',
        scopeId: 't1',
        budgetCap: 250,
      });

      expect(mockGrantRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          agentId: 'a1',
          scope: 'task',
          scopeId: 't1',
          budgetCap: '250',
          used: '0',
          expiresAt: null,
        }),
      );
      expect(result.id).toBe('g9');
    });
  });
});
