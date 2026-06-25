import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { GenerationMeteringService } from './generation-metering.service';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';
import { QuotaService } from '../../world-engine/services/quota.service';
import { ProviderRegistry } from '../../world-engine/reconstruction/provider-registry';

/**
 * Unit tests for GenerationMeteringService (task 15.3, R12.2 / R12.3 / R12.4).
 *
 * Covers, with QuotaService / ProviderRegistry / AgentCostRecord repo mocked:
 *  - checkQuota at the FREE monthly cost ceiling: a `soft_warning` state stays
 *    allowed=true and carries a warning (R12.2); a `hard_block` state is
 *    allowed=false with a structured QUOTA_EXCEEDED error (R12.3).
 *  - recordGenerationCost writes exactly one `generation_{kind}` row to
 *    `agent_cost_records` (R12.1).
 *  - checkQuota gates on the per-event daily quota and rejects when exhausted
 *    (R12.4).
 */
describe('GenerationMeteringService (task 15.3)', () => {
  let service: GenerationMeteringService;

  let quotaService: {
    checkMonthlyCostCeiling: jest.Mock;
    checkDailyQuota: jest.Mock;
  };
  let costRecordRepo: { create: jest.Mock; save: jest.Mock };
  let providerRegistry: { executeReconstruction: jest.Mock };

  const USER_ID = 'user-gen-1';

  beforeEach(async () => {
    quotaService = {
      checkMonthlyCostCeiling: jest.fn(),
      checkDailyQuota: jest.fn(),
    };
    costRecordRepo = {
      create: jest.fn((v) => v),
      save: jest.fn().mockImplementation((v) => Promise.resolve({ id: 'rec-1', ...v })),
    };
    providerRegistry = { executeReconstruction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationMeteringService,
        { provide: getRepositoryToken(AgentCostRecord), useValue: costRecordRepo },
        { provide: QuotaService, useValue: quotaService },
        { provide: ProviderRegistry, useValue: providerRegistry },
      ],
    }).compile();

    service = module.get(GenerationMeteringService);
  });

  // ──────────────────────────────────────────────────────────
  // R12.2 — 80% soft reminder: allowed=true + warning surfaced
  // ──────────────────────────────────────────────────────────
  it('allows generation at the 80% ceiling and surfaces a soft warning', async () => {
    quotaService.checkMonthlyCostCeiling.mockResolvedValue({
      allowed: true,
      currentCost: 4,
      ceiling: 5,
      warningLevel: 'soft_warning',
    });

    const result = await service.checkQuota(USER_ID);

    expect(result.allowed).toBe(true);
    expect(result.warningLevel).toBe('soft_warning');
    expect(result.currentCost).toBe(4);
    expect(result.ceiling).toBe(5);
    expect(result.warning).toBeDefined();
    expect(result.warning!.warningLevel).toBe('soft_warning');
    expect(result.warning!.ratioUsed).toBeCloseTo(0.8, 10);
    expect(result.error).toBeUndefined();
    // No daily event supplied → daily gate not consulted.
    expect(quotaService.checkDailyQuota).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────
  // R12.3 — 100% hard block: allowed=false + QUOTA_EXCEEDED
  // ──────────────────────────────────────────────────────────
  it('blocks generation at the 100% cap with a QUOTA_EXCEEDED error', async () => {
    quotaService.checkMonthlyCostCeiling.mockResolvedValue({
      allowed: false,
      currentCost: 5,
      ceiling: 5,
      warningLevel: 'hard_block',
    });

    const result = await service.checkQuota(USER_ID);

    expect(result.allowed).toBe(false);
    expect(result.warningLevel).toBe('hard_block');
    expect(result.warning).toBeDefined();
    expect(result.warning!.warningLevel).toBe('hard_block');
    expect(result.error).toBeDefined();
    expect(result.error!.error).toBe('QUOTA_EXCEEDED');
    expect(result.error!.detail).toMatch(/Monthly cost ceiling reached/i);
  });

  // ──────────────────────────────────────────────────────────
  // Under the cap: allowed, no warning, no error
  // ──────────────────────────────────────────────────────────
  it('allows generation comfortably under the cap with no warning', async () => {
    quotaService.checkMonthlyCostCeiling.mockResolvedValue({
      allowed: true,
      currentCost: 1,
      ceiling: 5,
      warningLevel: 'none',
    });

    const result = await service.checkQuota(USER_ID);

    expect(result.allowed).toBe(true);
    expect(result.warningLevel).toBe('none');
    expect(result.warning).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────
  // R12.4 — per-event daily quota gate rejects when exhausted
  // ──────────────────────────────────────────────────────────
  it('rejects generation when the daily quota is exhausted even if cost ceiling allows', async () => {
    quotaService.checkMonthlyCostCeiling.mockResolvedValue({
      allowed: true,
      currentCost: 0,
      ceiling: 5,
      warningLevel: 'none',
    });
    quotaService.checkDailyQuota.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 5,
      resetTime: '2026-01-02T00:00:00.000Z',
    });

    const result = await service.checkQuota(USER_ID, 'quickScan');

    expect(quotaService.checkDailyQuota).toHaveBeenCalledWith(USER_ID, 'quickScan');
    expect(result.allowed).toBe(false);
    expect(result.daily).toEqual({
      allowed: false,
      remaining: 0,
      limit: 5,
      resetTime: '2026-01-02T00:00:00.000Z',
    });
    expect(result.error).toBeDefined();
    expect(result.error!.error).toBe('QUOTA_EXCEEDED');
    expect(result.error!.detail).toMatch(/Daily limit reached for quickScan/i);
  });

  it('allows generation when both the cost ceiling and the daily quota permit', async () => {
    quotaService.checkMonthlyCostCeiling.mockResolvedValue({
      allowed: true,
      currentCost: 0,
      ceiling: 5,
      warningLevel: 'none',
    });
    quotaService.checkDailyQuota.mockResolvedValue({
      allowed: true,
      remaining: 3,
      limit: 5,
      resetTime: '2026-01-02T00:00:00.000Z',
    });

    const result = await service.checkQuota(USER_ID, 'quickScan');

    expect(result.allowed).toBe(true);
    expect(result.daily!.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('ignores an unknown daily-quota event and gates only on the cost ceiling', async () => {
    quotaService.checkMonthlyCostCeiling.mockResolvedValue({
      allowed: true,
      currentCost: 0,
      ceiling: 5,
      warningLevel: 'none',
    });

    const result = await service.checkQuota(USER_ID, 'notARealEvent');

    expect(quotaService.checkDailyQuota).not.toHaveBeenCalled();
    expect(result.allowed).toBe(true);
    expect(result.daily).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────
  // R12.1 — recordGenerationCost writes one generation_{kind} row
  // ──────────────────────────────────────────────────────────
  it('records a single generation_{kind} cost row in agent_cost_records', async () => {
    const record = await service.recordGenerationCost(USER_ID, {
      kind: 'scene_graph',
      costUsd: 0.02,
    });

    expect(costRecordRepo.create).toHaveBeenCalledTimes(1);
    expect(costRecordRepo.save).toHaveBeenCalledTimes(1);

    const created = costRecordRepo.create.mock.calls[0][0];
    expect(created).toMatchObject({
      userId: USER_ID,
      eventType: 'generation_scene_graph',
      model: 'world-creation.generate.scene_graph',
      provider: 'world-creation-generation',
      costUsd: 0.02,
      sessionId: 'gen:scene_graph', // no plotId/sessionId override
    });
    expect(record).not.toBeNull();
  });

  it('derives the audit sessionId from the plotId when provided', async () => {
    await service.recordGenerationCost(USER_ID, {
      kind: 'model_3d',
      costUsd: 0.5,
      provider: 'hunyuan3d',
      plotId: 'plot-42',
    });

    const created = costRecordRepo.create.mock.calls[0][0];
    expect(created.eventType).toBe('generation_model_3d');
    expect(created.provider).toBe('hunyuan3d');
    expect(created.sessionId).toBe('plot:plot-42');
  });

  it('clamps a negative/non-finite cost to 0 and never throws on persistence failure', async () => {
    costRecordRepo.save.mockRejectedValueOnce(new Error('db down'));

    const result = await service.recordGenerationCost(USER_ID, {
      kind: 'dsl',
      costUsd: Number.NaN,
    });

    // create still receives a clamped, finite cost.
    const created = costRecordRepo.create.mock.calls[0][0];
    expect(created.costUsd).toBe(0);
    // Persistence failure is swallowed → null, not a throw.
    expect(result).toBeNull();
  });
});
