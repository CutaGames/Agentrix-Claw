import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AgentBindingService, XP_THRESHOLDS, MAX_GROWTH_SKILL_SLOTS } from './agent-binding.service';
import { AgentQuotaService } from './agent-quota.service';
import { WorldAsset } from '../entities/world-asset.entity';

/**
 * Property 7: XP 单调递增
 * WorldAsset.xp only increases, never decreases (unless asset deleted).
 *
 * **Validates: Requirements 6.4**
 */
describe('Property 7: XP Monotonic Increase', () => {
  let agentBindingService: AgentBindingService;
  let mockWorldAssetRepo: Partial<Repository<WorldAsset>>;
  let mockAgentQuotaService: Partial<AgentQuotaService>;

  // Simulated asset state
  let assetState: { xp: number; unlockedSkillSlots: number };

  beforeEach(() => {
    assetState = { xp: 0, unlockedSkillSlots: 0 };

    mockWorldAssetRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === 'nonexistent') return null;
        return {
          id: where.id || 'test-asset',
          xp: assetState.xp,
          unlockedSkillSlots: assetState.unlockedSkillSlots,
          personalityTraits: ['brave', 'curious'],
          backstory: 'A test character.',
          behaviorTree: {},
          name: 'TestAsset',
        };
      }),
      update: jest.fn().mockImplementation((_id: string, updates: any) => {
        if (updates.xp !== undefined) assetState.xp = updates.xp;
        if (updates.unlockedSkillSlots !== undefined) {
          assetState.unlockedSkillSlots = updates.unlockedSkillSlots;
        }
        return { affected: 1 };
      }),
      manager: { query: jest.fn() } as any,
    };

    mockAgentQuotaService = {
      acquireAgentSlot: jest.fn(),
      releaseAgentSlot: jest.fn(),
      checkAgentQuota: jest.fn(),
    };

    agentBindingService = new AgentBindingService(
      mockWorldAssetRepo as Repository<WorldAsset>,
      mockAgentQuotaService as AgentQuotaService,
    );
  });

  it('awardXp always increases xp value', async () => {
    const assetId = 'test-asset';
    const xpAmounts = [10, 25, 50, 100, 1, 500, 3000];
    let previousXp = 0;

    for (const amount of xpAmounts) {
      const result = await agentBindingService.awardXp(assetId, amount);

      // XP must be strictly greater than previous value
      expect(result.xp).toBeGreaterThan(previousXp);

      // XP must equal the cumulative sum
      previousXp += amount;
      expect(result.xp).toBe(previousXp);
    }
  });

  it('awardXp rejects non-positive amounts', async () => {
    const assetId = 'test-asset';

    // Zero XP should throw
    await expect(agentBindingService.awardXp(assetId, 0)).rejects.toThrow(
      'XP amount must be positive',
    );

    // Negative XP should throw
    await expect(agentBindingService.awardXp(assetId, -5)).rejects.toThrow(
      'XP amount must be positive',
    );

    // XP should remain unchanged (still 0)
    expect(assetState.xp).toBe(0);
  });

  it('skill slots unlock at correct thresholds', async () => {
    const assetId = 'test-asset';

    // Award XP incrementally and check slot unlocks at each threshold
    // Thresholds: [100, 500, 1500, 5000]

    // Award 50 XP → total 50 → 0 slots
    let result = await agentBindingService.awardXp(assetId, 50);
    expect(result.xp).toBe(50);
    expect(result.unlockedSkillSlots).toBe(0);
    expect(result.newSlotUnlocked).toBe(false);

    // Award 50 more → total 100 → 1 slot (threshold 100 reached)
    result = await agentBindingService.awardXp(assetId, 50);
    expect(result.xp).toBe(100);
    expect(result.unlockedSkillSlots).toBe(1);
    expect(result.newSlotUnlocked).toBe(true);

    // Award 400 more → total 500 → 2 slots (threshold 500 reached)
    result = await agentBindingService.awardXp(assetId, 400);
    expect(result.xp).toBe(500);
    expect(result.unlockedSkillSlots).toBe(2);
    expect(result.newSlotUnlocked).toBe(true);

    // Award 1000 more → total 1500 → 3 slots (threshold 1500 reached)
    result = await agentBindingService.awardXp(assetId, 1000);
    expect(result.xp).toBe(1500);
    expect(result.unlockedSkillSlots).toBe(3);
    expect(result.newSlotUnlocked).toBe(true);

    // Award 3500 more → total 5000 → 4 slots (threshold 5000 reached)
    result = await agentBindingService.awardXp(assetId, 3500);
    expect(result.xp).toBe(5000);
    expect(result.unlockedSkillSlots).toBe(4);
    expect(result.newSlotUnlocked).toBe(true);
  });

  it('skill slots cap at 4', async () => {
    const assetId = 'test-asset';

    // Award 10000 XP at once — well above all thresholds
    const result = await agentBindingService.awardXp(assetId, 10000);

    expect(result.xp).toBe(10000);
    expect(result.unlockedSkillSlots).toBe(4); // Capped at MAX_GROWTH_SKILL_SLOTS
    expect(result.unlockedSkillSlots).toBeLessThanOrEqual(MAX_GROWTH_SKILL_SLOTS);
  });

  it('calculateUnlockedSlots returns correct values for boundary XP', () => {
    // Test the pure calculation function directly
    expect(agentBindingService.calculateUnlockedSlots(0)).toBe(0);
    expect(agentBindingService.calculateUnlockedSlots(99)).toBe(0);
    expect(agentBindingService.calculateUnlockedSlots(100)).toBe(1);
    expect(agentBindingService.calculateUnlockedSlots(499)).toBe(1);
    expect(agentBindingService.calculateUnlockedSlots(500)).toBe(2);
    expect(agentBindingService.calculateUnlockedSlots(1499)).toBe(2);
    expect(agentBindingService.calculateUnlockedSlots(1500)).toBe(3);
    expect(agentBindingService.calculateUnlockedSlots(4999)).toBe(3);
    expect(agentBindingService.calculateUnlockedSlots(5000)).toBe(4);
    expect(agentBindingService.calculateUnlockedSlots(99999)).toBe(4);
  });

  it('awardXp throws NotFoundException for nonexistent asset', async () => {
    await expect(
      agentBindingService.awardXp('nonexistent', 50),
    ).rejects.toThrow(NotFoundException);
  });

  it('XP never decreases across multiple sequential awards', async () => {
    const assetId = 'test-asset';
    const awards = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];
    let lastXp = 0;

    for (const amount of awards) {
      const result = await agentBindingService.awardXp(assetId, amount);
      expect(result.xp).toBeGreaterThan(lastXp);
      lastXp = result.xp;
    }

    // Final XP should equal the sum of all awards
    const expectedTotal = awards.reduce((sum, a) => sum + a, 0);
    expect(lastXp).toBe(expectedTotal);
  });
});
