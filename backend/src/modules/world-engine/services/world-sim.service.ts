import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WorldAsset } from '../entities/world-asset.entity';
import { WorldEvent } from '../entities/world-event.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { AgentReputation } from '../../../entities/agent-reputation.entity';
import { AgentBindingService } from './agent-binding.service';
import { SeededRng } from './battle-engine.service';
import {
  WorldEventType,
  WorldEventOutcome,
  WorldResidentState,
  WORLD_TICK_BUCKET_MS,
  WORLD_MAX_CATCHUP_TICKS,
  WORLD_WORK_AXP_BASE_MIN,
  WORLD_WORK_AXP_BASE_MAX,
} from '../../../../shared/types/world-engine';

/**
 * WorldSimService — 活世界模拟引擎 (Phase A2)。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §7。
 *
 * 把 agent-binding 现有的 idle actions(此前 log-only)升级为**会落库的剧情事件**:
 *   - tick(userId): 推进该用户所有居民(WorldAsset character)一步, 产出 world_events。
 *   - 离线时间快进: 按"时间桶"(WORLD_TICK_BUCKET_MS)逐桶补算, 每居民每桶最多 1 条事件,
 *     单次最多补算 WORLD_MAX_CATCHUP_TICKS 个桶(防止久未登录灌爆 feed + 控成本)。
 *
 * 决定论(防刷 + 可复现): 每个 (assetId, bucket) 派生固定 seed → Mulberry32 → 事件选择/
 * 产出数值确定。同一资产同一桶永远产生相同事件, 不依赖实时随机。
 *
 * 能力飞轮联动: 居民"打工"产出按 abilitySnapshot.multiplier 缩放;职业由能力来源 agent 的
 * specializations 推断。agent 在现实越强 → 居民在世界越能赚、地位越高。
 *
 * 成本: Phase A2 剧情用**模板**(确定性, 零 LLM 成本)。后续可把 summary 升级为 LLM 生成。
 */
@Injectable()
export class WorldSimService {
  private readonly logger = new Logger(WorldSimService.name);

  /** 小镇地点池 */
  private static readonly LOCATIONS = [
    '中央广场', '工坊区', '集市', '图书馆', '码头', '公园长椅', '咖啡馆', '钟楼下',
  ];

  /** 职业 → 打工剧情模板(占位 {name} {axp}) */
  private static readonly WORK_TEMPLATES: Record<string, string[]> = {
    trader: [
      '{name} 在集市完成了一笔套利交易,赚了 {axp} AXP。',
      '{name} 帮邻居清算了一批闲置道具,进账 {axp} AXP。',
    ],
    researcher: [
      '{name} 在图书馆破解了一道古老谜题,获得 {axp} AXP 的悬赏。',
      '{name} 分析了一份委托情报,赚到 {axp} AXP。',
    ],
    builder: [
      '{name} 在工坊接了个修缮活,完工后拿到 {axp} AXP。',
      '{name} 帮码头加固了栈桥,报酬 {axp} AXP。',
    ],
    drifter: [
      '{name} 打了几份零工,凑了 {axp} AXP。',
      '{name} 在街角帮人跑腿,赚了 {axp} AXP。',
    ],
  };

  private static readonly SOCIAL_TEMPLATES = [
    '{name} 和广场上的老邻居聊了很久,心情不错。',
    '{name} 结识了一位新搬来的居民,约好下次一起冒险。',
  ];

  private static readonly CONFLICT_TEMPLATES = [
    '{name} 因为一件小事和摊主拌了几句嘴。',
    '{name} 和另一位居民起了点摩擦,有些闷闷不乐。',
  ];

  private static readonly GREET_TEMPLATES = [
    '{name} 抬头望了望,似乎在等你回来。',
    '{name} 给你留了张小纸条:"今天也要加油哦。"',
  ];

  private static readonly REFLECT_TEMPLATES = [
    '{name} 在钟楼下发了会儿呆,想起了被创造出来的那天。',
    '{name} 望着夜空,盘算着要变得更强。',
  ];

  private static readonly EXPLORE_TEMPLATES = [
    '{name} 在城郊发现了一处可疑的洞窟入口,记下了位置。',
    '{name} 听说远方有座副本,跃跃欲试。',
  ];

  constructor(
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    @InjectRepository(WorldEvent)
    private readonly worldEventRepo: Repository<WorldEvent>,
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepo: Repository<AgentAccount>,
    @InjectRepository(AgentReputation)
    private readonly reputationRepo: Repository<AgentReputation>,
    private readonly agentBinding: AgentBindingService,
  ) {}

  // ============================================================
  // Public API
  // ============================================================

  /**
   * 推进某用户的活世界:对其所有 character 资产补算自上次桶至今的事件。
   * @returns 本次新产生的事件数
   */
  async tick(userId: string): Promise<{ newEventCount: number }> {
    const residents = await this.worldAssetRepo.find({
      where: { ownerId: userId, category: 'character' },
    });
    if (residents.length === 0) return { newEventCount: 0 };

    const now = Date.now();
    const currentBucket = Math.floor(now / WORLD_TICK_BUCKET_MS);
    let newEventCount = 0;

    for (const asset of residents) {
      const multiplier = this.readMultiplier(asset);
      const occupation = await this.resolveOccupation(asset);
      let state = this.coerceState(asset.worldState, occupation);

      // 起始桶:上次结算桶 +1;首次(无记录)只结算当前桶
      const lastBucket =
        typeof state.lastTickBucket === 'number' ? state.lastTickBucket : currentBucket - 1;
      const firstBucket = Math.max(lastBucket + 1, currentBucket - WORLD_MAX_CATCHUP_TICKS + 1);
      if (currentBucket < firstBucket) continue; // 未跨桶, 不推进

      let accumulatedXp = 0;
      for (let bucket = firstBucket; bucket <= currentBucket; bucket++) {
        const seed = this.deriveSeed(asset.id, bucket);
        const rng = new SeededRng(seed);

        const ev = this.buildEvent(asset, state, multiplier, occupation, rng, seed);
        await this.worldEventRepo.save(this.worldEventRepo.create(ev));
        newEventCount++;
        accumulatedXp += ev.deltaXp ?? 0;
        state = this.applyEventToState(state, ev, rng);
      }
      state.lastTickBucket = currentBucket;

      await this.worldAssetRepo.update(asset.id, {
        worldState: state as any,
        lastTickAt: String(now),
      });
      if (accumulatedXp > 0) {
        try {
          await this.agentBinding.awardXp(asset.id, accumulatedXp);
        } catch (e) {
          this.logger.warn(`awardXp failed for ${asset.id}: ${(e as Error).message}`);
        }
      }
    }

    return { newEventCount };
  }

  /** 读取某用户最近的世界事件流(倒序)。 */
  async getRecentEvents(userId: string, limit = 50): Promise<WorldEvent[]> {
    return this.worldEventRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /**
   * 常驻系统 NPC — 让单人小镇也热闹, 不依赖真人在线。
   * 确定性静态数据(后续可做成可配置/可扩展)。
   */
  getTownNpcs(): Array<{
    id: string; name: string; emoji: string;
    role: 'merchant' | 'guard' | 'guide' | 'trainer';
    location: string; line: string;
    actions: Array<'talk' | 'train' | 'trade' | 'quest'>;
  }> {
    return [
      { id: 'npc-guide', name: '向导 露娜', emoji: '🧝‍♀️', role: 'guide', location: '中央广场',
        line: '欢迎来到星语小镇!拍点东西,让它们在这里安家吧。', actions: ['talk', 'quest'] },
      { id: 'npc-trainer', name: '教官 凯', emoji: '🥋', role: 'trainer', location: '训练场',
        line: '想变强?来跟我的训练假人打一场,随时奉陪。', actions: ['talk', 'train'] },
      { id: 'npc-merchant', name: '商人 老豆', emoji: '🧑‍🌾', role: 'merchant', location: '集市',
        line: '今天的好货可不少,用 AXP 换点装备?', actions: ['talk', 'trade'] },
      { id: 'npc-guard', name: '守卫 铁山', emoji: '🛡️', role: 'guard', location: '镇门',
        line: '镇子我守着,放心去探险。城郊好像有个副本入口。', actions: ['talk', 'quest'] },
    ];
  }

  // ============================================================
  // Simulation core (deterministic)
  // ============================================================

  /** 加权选事件类型 */
  private pickEventType(rng: SeededRng): WorldEventType {
    const r = rng.next();
    if (r < 0.45) return 'work';
    if (r < 0.62) return 'social';
    if (r < 0.72) return 'conflict';
    if (r < 0.84) return 'greet';
    if (r < 0.93) return 'reflect';
    return 'explore';
  }

  private buildEvent(
    asset: WorldAsset,
    state: WorldResidentState,
    multiplier: number,
    occupation: string,
    rng: SeededRng,
    seed: number,
  ): Partial<WorldEvent> {
    const type = this.pickEventType(rng);
    let summary = '';
    let outcome: WorldEventOutcome = 'neutral';
    let deltaXp = 0;
    let deltaAxp = 0;

    switch (type) {
      case 'work': {
        const span = WORLD_WORK_AXP_BASE_MAX - WORLD_WORK_AXP_BASE_MIN;
        const base = WORLD_WORK_AXP_BASE_MIN + Math.floor(rng.next() * (span + 1));
        deltaAxp = Math.round(base * multiplier);
        deltaXp = 5 + Math.floor(rng.next() * 10);
        outcome = 'positive';
        const templates =
          WorldSimService.WORK_TEMPLATES[occupation] ?? WorldSimService.WORK_TEMPLATES['drifter'];
        summary = this.fill(templates[Math.floor(rng.next() * templates.length)], asset.name, deltaAxp);
        break;
      }
      case 'social': {
        deltaXp = 2 + Math.floor(rng.next() * 4);
        outcome = 'positive';
        const t = WorldSimService.SOCIAL_TEMPLATES;
        summary = this.fill(t[Math.floor(rng.next() * t.length)], asset.name, 0);
        break;
      }
      case 'conflict': {
        outcome = 'negative';
        const t = WorldSimService.CONFLICT_TEMPLATES;
        summary = this.fill(t[Math.floor(rng.next() * t.length)], asset.name, 0);
        break;
      }
      case 'greet': {
        const t = WorldSimService.GREET_TEMPLATES;
        summary = this.fill(t[Math.floor(rng.next() * t.length)], asset.name, 0);
        break;
      }
      case 'reflect': {
        deltaXp = 1 + Math.floor(rng.next() * 3);
        const t = WorldSimService.REFLECT_TEMPLATES;
        summary = this.fill(t[Math.floor(rng.next() * t.length)], asset.name, 0);
        break;
      }
      case 'explore': {
        deltaXp = 3 + Math.floor(rng.next() * 6);
        const t = WorldSimService.EXPLORE_TEMPLATES;
        summary = this.fill(t[Math.floor(rng.next() * t.length)], asset.name, 0);
        break;
      }
      default:
        summary = `${asset.name} 度过了平静的一段时光。`;
    }

    return {
      userId: asset.ownerId,
      actorAssetId: asset.id,
      actorName: asset.name,
      type,
      summary,
      outcome,
      deltaStats: null,
      deltaXp,
      deltaAxp,
      tickSeed: String(seed),
    };
  }

  /** 把事件结果回写到居民状态(地点/心情/累计AXP) */
  private applyEventToState(
    state: WorldResidentState,
    ev: Partial<WorldEvent>,
    rng: SeededRng,
  ): WorldResidentState {
    const next: WorldResidentState = { ...state };
    next.axp = (state.axp ?? 0) + (ev.deltaAxp ?? 0);
    next.location =
      WorldSimService.LOCATIONS[Math.floor(rng.next() * WorldSimService.LOCATIONS.length)];

    switch (ev.type) {
      case 'work':
        next.mood = 'focused';
        next.activity = '刚收工,正盘算下一笔';
        break;
      case 'social':
        next.mood = 'happy';
        next.activity = '在和邻居来往';
        break;
      case 'conflict':
        next.mood = 'lonely';
        next.activity = '心里有点别扭';
        break;
      case 'greet':
        next.mood = 'happy';
        next.activity = '在等你回来';
        break;
      case 'reflect':
        next.mood = 'calm';
        next.activity = '在独自沉思';
        break;
      case 'explore':
        next.mood = 'excited';
        next.activity = '在勘察新地点';
        break;
    }
    return next;
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** (assetId, bucket) → 32-bit seed(djb2 over string) */
  private deriveSeed(assetId: string, bucket: number): number {
    const str = `${assetId}:${bucket}`;
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
    }
    return hash | 0;
  }

  /** 读 abilitySnapshot.multiplier, 缺省 1.0 */
  private readMultiplier(asset: WorldAsset): number {
    const snap = asset.abilitySnapshot as any;
    const m = snap?.multiplier;
    return typeof m === 'number' && m >= 1 ? m : 1.0;
  }

  /** 由能力来源 agent 的 specializations 推断职业 */
  private async resolveOccupation(asset: WorldAsset): Promise<string> {
    const agentId = asset.sourceAgentAccountId;
    if (!agentId) return 'drifter';
    try {
      const rep = await this.reputationRepo.findOne({ where: { agentId } });
      const specs = (rep?.specializations ?? []).map((s) => s.toLowerCase());
      if (specs.some((s) => s.includes('trad') || s.includes('financ') || s.includes('market'))) return 'trader';
      if (specs.some((s) => s.includes('research') || s.includes('analy') || s.includes('data'))) return 'researcher';
      if (specs.some((s) => s.includes('build') || s.includes('dev') || s.includes('engineer') || s.includes('craft'))) return 'builder';
    } catch {
      /* fall through */
    }
    return 'drifter';
  }

  /** 把存量/缺失的 worldState 补全成合法结构 */
  private coerceState(raw: unknown, occupation: string): WorldResidentState {
    const s = (raw ?? {}) as WorldResidentState;
    return {
      job: s.job ?? occupation,
      mood: s.mood ?? 'calm',
      activity: s.activity ?? '刚来到这个世界',
      location: s.location ?? WorldSimService.LOCATIONS[0],
      axp: typeof s.axp === 'number' ? s.axp : 0,
      lastTickBucket: typeof s.lastTickBucket === 'number' ? s.lastTickBucket : undefined,
    };
  }

  private fill(template: string, name: string, axp: number): string {
    return template.replace(/\{name\}/g, name).replace(/\{axp\}/g, String(axp));
  }
}
