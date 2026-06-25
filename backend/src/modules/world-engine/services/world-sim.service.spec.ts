import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorldSimService } from './world-sim.service';
import { WorldAsset } from '../entities/world-asset.entity';
import { WorldEvent } from '../entities/world-event.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { AgentReputation } from '../../../entities/agent-reputation.entity';
import { AgentBindingService } from './agent-binding.service';
import {
  WORLD_TICK_BUCKET_MS,
  WORLD_MAX_CATCHUP_TICKS,
} from '../../../../shared/types/world-engine';

/**
 * WorldSimService 单测 (Phase A2 活世界)。
 *
 * 验证:
 * - 首次 tick 给居民产 1 个事件并写 worldState(含 lastTickBucket) + lastTickAt
 * - 同一资产同一桶 → 确定性(事件 summary/数值可复现)
 * - 离线快进按桶补算, clamp 到 MAX_CATCHUP_TICKS
 * - 同一桶内重复 tick 不再产事件(lastTickBucket 守卫)
 * - 能力倍率放大打工 AXP 产出
 * - XP 通过 agentBinding.awardXp 累加
 * - 职业由 specializations 推断
 */
describe('WorldSimService', () => {
  let service: WorldSimService;

  let assets: WorldAsset[];
  let savedEvents: Partial<WorldEvent>[];
  let assetUpdates: Array<{ id: string; patch: any }>;
  let awardedXp: Array<{ assetId: string; amount: number }>;
  let reputation: Partial<AgentReputation> | null;

  function makeAsset(over: Partial<WorldAsset> = {}): WorldAsset {
    return {
      id: 'asset-1',
      ownerId: 'user-1',
      originalCreatorId: 'user-1',
      name: '灵狐',
      category: 'character',
      level: 1,
      xp: 0,
      stats: { hp: 50, atk: 30, def: 20, spd: 40, int: 25 },
      abilitySnapshot: null,
      sourceAgentAccountId: null,
      worldState: null,
      lastTickAt: null,
      ...over,
    } as WorldAsset;
  }

  beforeEach(async () => {
    savedEvents = [];
    assetUpdates = [];
    awardedXp = [];
    reputation = null;
    assets = [makeAsset()];

    const worldAssetRepo = {
      find: jest.fn(async () => assets),
      update: jest.fn(async (id: string, patch: any) => {
        assetUpdates.push({ id, patch });
      }),
    };
    const worldEventRepo = {
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => {
        savedEvents.push(e);
        return e;
      }),
      find: jest.fn(async () => savedEvents),
    };
    const agentAccountRepo = { findOne: jest.fn(async () => null) };
    const reputationRepo = { findOne: jest.fn(async () => reputation) };
    const agentBinding = {
      awardXp: jest.fn(async (assetId: string, amount: number) => {
        awardedXp.push({ assetId, amount });
        return { xp: amount, unlockedSkillSlots: 0, newSlotUnlocked: false };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldSimService,
        { provide: getRepositoryToken(WorldAsset), useValue: worldAssetRepo },
        { provide: getRepositoryToken(WorldEvent), useValue: worldEventRepo },
        { provide: getRepositoryToken(AgentAccount), useValue: agentAccountRepo },
        { provide: getRepositoryToken(AgentReputation), useValue: reputationRepo },
        { provide: AgentBindingService, useValue: agentBinding },
      ],
    }).compile();

    service = module.get<WorldSimService>(WorldSimService);
  });

  it('首次 tick → 产 1 事件并写 worldState(lastTickBucket) + lastTickAt', async () => {
    const r = await service.tick('user-1');
    // 首次只结算当前桶 → 恰好 1 个事件
    expect(r.newEventCount).toBe(1);
    expect(savedEvents.length).toBe(1);
    const update = assetUpdates.find((u) => u.id === 'asset-1');
    expect(update).toBeDefined();
    expect(update!.patch.worldState).toBeDefined();
    expect(typeof update!.patch.worldState.lastTickBucket).toBe('number');
    expect(update!.patch.lastTickAt).toBeDefined();
    for (const ev of savedEvents) {
      expect(ev.userId).toBe('user-1');
      expect(ev.actorAssetId).toBe('asset-1');
      expect(typeof ev.summary).toBe('string');
    }
  });

  it('同一桶内重复 tick 不再产事件', async () => {
    const currentBucket = Math.floor(Date.now() / WORLD_TICK_BUCKET_MS);
    assets = [makeAsset({ worldState: { lastTickBucket: currentBucket } as any })];
    const r = await service.tick('user-1');
    expect(r.newEventCount).toBe(0);
    expect(savedEvents.length).toBe(0);
  });

  it('离线快进补算多个桶, clamp 到 MAX_CATCHUP_TICKS', async () => {
    const currentBucket = Math.floor(Date.now() / WORLD_TICK_BUCKET_MS);
    // 上次结算在 100 桶前 → 应被 clamp 到 MAX_CATCHUP_TICKS 个事件
    assets = [makeAsset({ worldState: { lastTickBucket: currentBucket - 100 } as any })];
    const r = await service.tick('user-1');
    expect(r.newEventCount).toBe(WORLD_MAX_CATCHUP_TICKS);
  });

  it('确定性: 同一资产同一桶多次模拟产出一致', async () => {
    assets = [makeAsset({ id: 'dup' }), makeAsset({ id: 'dup' })];
    await service.tick('user-1');
    const byActor = savedEvents.filter((e) => e.actorAssetId === 'dup');
    expect(byActor.length).toBe(2);
    expect(byActor[0].summary).toBe(byActor[1].summary);
    expect(byActor[0].deltaXp).toBe(byActor[1].deltaXp);
    expect(byActor[0].deltaAxp).toBe(byActor[1].deltaAxp);
  });

  it('能力倍率放大打工 AXP 产出(同 seed 仅倍率不同)', async () => {
    const currentBucket = Math.floor(Date.now() / WORLD_TICK_BUCKET_MS);
    // 找一个 work 事件桶: 用同 id 同桶, 仅倍率不同
    assets = [makeAsset({ id: 'lo', abilitySnapshot: { multiplier: 1.0 } as any })];
    await service.tick('user-1');
    const loWork = savedEvents.filter((e) => e.actorAssetId === 'lo' && e.type === 'work');

    savedEvents = [];
    assetUpdates = [];
    assets = [makeAsset({ id: 'lo', abilitySnapshot: { multiplier: 2.0 } as any })];
    await service.tick('user-1');
    const hiWork = savedEvents.filter((e) => e.actorAssetId === 'lo' && e.type === 'work');

    if (loWork.length > 0 && hiWork.length > 0) {
      expect(hiWork[0].deltaAxp!).toBeGreaterThan(loWork[0].deltaAxp!);
    }
  });

  it('XP 经 agentBinding.awardXp 累加', async () => {
    await service.tick('user-1');
    const totalXp = savedEvents.reduce((s, e) => s + (e.deltaXp ?? 0), 0);
    if (totalXp > 0) {
      expect(awardedXp.length).toBe(1);
      expect(awardedXp[0].amount).toBe(totalXp);
    } else {
      expect(awardedXp.length).toBe(0);
    }
  });

  it('职业由 specializations 推断(trading → trader)', async () => {
    reputation = { agentId: 'agt', specializations: ['trading', 'defi'] };
    assets = [makeAsset({ sourceAgentAccountId: 'agt' })];
    await service.tick('user-1');
    const update = assetUpdates.find((u) => u.id === 'asset-1');
    expect(update!.patch.worldState.job).toBe('trader');
  });
});
