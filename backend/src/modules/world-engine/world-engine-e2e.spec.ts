import { AbilityMappingService } from './services/ability-mapping.service';
import { WorldSimService } from './services/world-sim.service';
import { InteractiveBattleEngineService, BattleDecision } from './services/interactive-battle-engine.service';
import { SoulLinkageService } from './services/soul-linkage.service';
import { UgcGameService } from './services/ugc-game.service';

/**
 * World Engine 跨阶段 E2E (A→A2→B→C→D)。
 *
 * 用真实 service 实例 + 内存 repo 把五个阶段的数据流串成一条链路, 验证它们能协同:
 *   A  能力飞轮:   真实 agent 战绩 → abilitySnapshot.multiplier → effectiveStats
 *   A2 活世界:     tick → world_events;打工 AXP 吃 multiplier
 *   B  决策战斗:   stepRound 用 effectiveStats;同 decisions+seed 确定性
 *   C  统一灵魂:   incarnate → linkedSoulId + 主宠连续
 *   D  UGC:        规则集 sanitize/clamp
 *
 * 这是不依赖 HTTP/auth 的确定性 E2E, 可在 CI 跑。
 */
describe('World Engine E2E (Phase A→A2→B→C→D)', () => {
  // ── 内存 store ──
  let assets: Map<string, any>;
  let pets: Map<string, any>;
  let events: any[];
  let rulesets: Map<string, any>;

  // ── services ──
  let ability: AbilityMappingService;
  let worldSim: WorldSimService;
  let battle: InteractiveBattleEngineService;
  let soul: SoulLinkageService;
  let ugc: UgcGameService;

  const USER = 'user-e2e';
  const AGENT = 'agent-e2e';

  beforeEach(() => {
    assets = new Map();
    pets = new Map();
    events = [];
    rulesets = new Map();

    // diamond 重度 agent → 高能力倍率
    const reputation = {
      agentId: AGENT, tasksCompleted: 500, avgQualityScore: 100, tier: 'diamond',
      specializations: ['trading'],
    };
    const agentAccount = { id: AGENT, ownerId: USER, creditScore: 950 };

    const assetRepo: any = {
      find: jest.fn(async ({ where }: any) =>
        [...assets.values()].filter((a) => a.ownerId === where.ownerId && (!where.category || a.category === where.category)),
      ),
      findOne: jest.fn(async ({ where }: any) => {
        const a = assets.get(where.id);
        if (!a) return null;
        if (where.ownerId && a.ownerId !== where.ownerId) return null;
        return a;
      }),
      save: jest.fn(async (a: any) => { assets.set(a.id, a); return a; }),
      update: jest.fn(async (id: string, patch: any) => { Object.assign(assets.get(id), patch); }),
      count: jest.fn(async ({ where }: any) =>
        [...assets.values()].filter((a) => a.ownerId === where.ownerId && a.linkedSoulId === where.linkedSoulId).length,
      ),
    };
    const petRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where.id) return pets.get(where.id) ?? null;
        return [...pets.values()].find((p) => p.userId === where.userId) ?? null;
      }),
      create: jest.fn((d: any) => ({ id: 'pet-e2e', ...d })),
      save: jest.fn(async (p: any) => { pets.set(p.id, p); return p; }),
    };
    const eventRepo: any = {
      create: jest.fn((e: any) => e),
      save: jest.fn(async (e: any) => { events.push(e); return e; }),
      find: jest.fn(async () => [...events].reverse()),
    };
    const repRepo: any = { findOne: jest.fn(async ({ where }: any) => (where.agentId === AGENT ? reputation : null)) };
    const acctRepo: any = {
      findOne: jest.fn(async ({ where }: any) => (where.id === AGENT || where.ownerId === USER ? agentAccount : null)),
      find: jest.fn(async ({ where }: any) => (where.ownerId === USER ? [agentAccount] : [])),
    };
    const statsRepo: any = { findOne: jest.fn(async () => null) };
    const rulesetRepo: any = {
      count: jest.fn(async ({ where }: any) => [...rulesets.values()].filter((r) => r.creatorUserId === where.creatorUserId).length),
      findOne: jest.fn(async ({ where }: any) => {
        if (where.shareCode) return [...rulesets.values()].find((r) => r.shareCode === where.shareCode) ?? null;
        return rulesets.get(where.id) ?? null;
      }),
      find: jest.fn(async ({ where }: any) => [...rulesets.values()].filter((r) => r.creatorUserId === where.creatorUserId)),
      create: jest.fn((d: any) => ({ id: `rs-${rulesets.size + 1}`, ...d })),
      save: jest.fn(async (r: any) => { rulesets.set(r.id, r); return r; }),
      increment: jest.fn(async ({ id }: any, _f: string, by: number) => { rulesets.get(id).playCount += by; }),
      delete: jest.fn(async (id: string) => { rulesets.delete(id); }),
    };
    const agentBinding: any = { awardXp: jest.fn(async () => ({ xp: 0, unlockedSkillSlots: 0, newSlotUnlocked: false })) };

    ability = new AbilityMappingService(acctRepo, repRepo, statsRepo, petRepo);
    worldSim = new WorldSimService(assetRepo, eventRepo, acctRepo, repRepo, agentBinding);
    battle = new InteractiveBattleEngineService();
    soul = new SoulLinkageService(assetRepo, petRepo);
    ugc = new UgcGameService(rulesetRepo);
  });

  it('full flow: ability boost → world tick → interactive battle → incarnate → ugc', async () => {
    // ── Phase A: 能力飞轮 ──
    const baseStats = { hp: 60, atk: 50, def: 40, spd: 30, int: 20 };
    const snap = await ability.computeSnapshot(USER, baseStats, AGENT);
    expect(snap.multiplier).toBeGreaterThan(1.5); // diamond+高任务+高质量 → 高倍率
    expect(snap.effectiveStats.hp).toBeGreaterThan(baseStats.hp);

    // 落一个吃了能力快照的角色资产
    const asset = {
      id: 'asset-e2e', ownerId: USER, originalCreatorId: USER, name: '灵狐', category: 'character',
      level: 3, xp: 0, stats: baseStats, skills: [{ name: 'Strike', type: 'offensive', damageBase: 20, cooldownTurns: 0 }],
      abilitySnapshot: snap, sourceAgentAccountId: AGENT, worldState: null, lastTickAt: null, behaviorTree: null,
    };
    assets.set(asset.id, asset);

    // ── Phase A2: 活世界 tick ──
    const tickRes = await worldSim.tick(USER);
    expect(tickRes.newEventCount).toBeGreaterThanOrEqual(1);
    expect(events.length).toBe(tickRes.newEventCount);
    // 职业由 specializations=trading 推断
    expect(assets.get('asset-e2e').worldState.job).toBe('trader');

    // ── Phase B: 决策战斗(吃 effectiveStats),确定性 ──
    const p = {
      id: 'asset-e2e', level: 3, behaviorTree: null,
      stats: snap.effectiveStats,
      skills: asset.skills as any,
    };
    const foe = { id: 'foe', level: 3, behaviorTree: null, stats: { hp: 80, atk: 40, def: 30, spd: 20, int: 20 }, skills: asset.skills as any };
    const decisions: BattleDecision[] = [
      { action: 'charge' }, { action: 'attack', skillIndex: 0 }, { action: 'defend' }, { action: 'attack', skillIndex: 0 },
    ];
    const run = (seed: number) => {
      let st = battle.initState(p as any, foe as any);
      const rounds: any[] = [];
      for (const d of decisions) {
        if (st.status === 'completed') break;
        const ai = battle.deriveAiDecision(st, foe as any, 'defender', seed);
        const r = battle.stepRound(st, d, ai, p as any, foe as any, seed);
        rounds.push(r.round); st = r.nextState;
      }
      return { rounds, st };
    };
    const a = run(777);
    const b = run(777);
    expect(a.rounds).toEqual(b.rounds); // 确定性
    expect(a.st).toEqual(b.st);

    // ── Phase C: 化身主宠(灵魂连续) ──
    pets.set('pet-e2e', { id: 'pet-e2e', userId: USER, name: '阿狐', intimacyLevel: 6, emotion: 'happy', personalityOverrides: {} });
    const inc = await soul.incarnate(USER, 'asset-e2e');
    expect(inc.soulId).toBe('pet-e2e');
    expect(inc.intimacyLevel).toBe(6); // 灵魂连续
    expect(assets.get('asset-e2e').linkedSoulId).toBe('pet-e2e');

    const status = await soul.getSoulStatus(USER, 'asset-e2e');
    expect(status.linked).toBe(true);
    expect(status.isActiveIncarnation).toBe(true);

    // ── Phase D: UGC 规则集 ──
    const rs = await ugc.createRuleSet(USER, { name: '狂暴速攻', rules: { damageMultiplier: 5, maxRounds: 999 } });
    expect(rs.shareCode).toHaveLength(8);
    expect(rs.rules.damageMultiplier).toBe(2.0); // clamp
    expect(rs.rules.maxRounds).toBe(40);         // clamp
    const played = await ugc.play(rs.shareCode);
    expect(played.ruleSet.playCount).toBe(1);
  });
});
