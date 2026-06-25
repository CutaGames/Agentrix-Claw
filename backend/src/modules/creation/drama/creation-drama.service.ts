import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreationRepository } from '../creation.repository';
import { CreationGameBundleEntity } from '../entities/creation-game-bundle.entity';
import { CreationUnlockEntity } from '../entities/creation-unlock.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { AxpService } from '../../axp/axp.service';
import { LlmCompletionService } from '../../ai-provider/llm-completion.service';

import type {
  DramaStory,
  DramaState,
  UnlockEpisodeResponse,
} from '../../../../shared/types/drama';
import { buildDemoDramaStory } from './drama-demo-story';

/** drama 引擎标识(bundle.engine);html 列存 DramaStory 的 JSON。 */
export const DRAMA_ENGINE = 'drama-vn';

/**
 * CreationDramaService — 互动剧(分支叙事)闭环服务。
 *
 * 闭环:生成(LLM→JSON / 模板兜底)→ 播放(前端读 story)→ 选择(前端分支)→
 * AXP 解锁(本服务,服务端权威扣费 + entitlement 持久化)→ 打赏(复用 social.tip)。
 *
 * 故事载体复用 `creation_game_bundles`(engine='drama-vn',html=JSON),免新表;
 * 解锁 entitlement 持久化于 `creation_unlocks`((creation,user,episode) 唯一,幂等)。
 *
 * 安全/权威:解锁价以**服务端**解析的 story 为准(绝不信任客户端传入金额);
 * 已解锁/免费集(第 1 集)不扣费;扣费走 AxpService(spend 打赏者 → earn owner)。
 */
@Injectable()
export class CreationDramaService {
  private readonly logger = new Logger(CreationDramaService.name);

  constructor(
    private readonly repo: CreationRepository,
    @InjectRepository(CreationGameBundleEntity)
    private readonly bundleRepo: Repository<CreationGameBundleEntity>,
    @InjectRepository(CreationUnlockEntity)
    private readonly unlockRepo: Repository<CreationUnlockEntity>,
    @Optional()
    @InjectRepository(AgentAccount)
    private readonly accountRepo?: Repository<AgentAccount>,
    @Optional() private readonly axp?: AxpService,
    @Optional() private readonly llm?: LlmCompletionService,
  ) {}

  // ── 读取当前互动剧故事(bundle.html → JSON) ──────────────────

  /** 取某创作当前的互动剧故事;非 drama 或不存在则 null。 */
  async getStory(creationId: string): Promise<DramaStory | null> {
    const bundle = await this.bundleRepo.findOne({
      where: { creationId },
      order: { version: 'DESC' },
    });
    if (!bundle || bundle.engine !== DRAMA_ENGINE) return null;
    return this.parseStory(bundle.html);
  }

  private parseStory(raw: string): DramaStory | null {
    try {
      const s = JSON.parse(raw) as DramaStory;
      if (!s || !Array.isArray(s.scenes) || !Array.isArray(s.episodes) || !s.startSceneId) {
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  // ── 解锁状态(第 1 集恒免费/已解锁) ──────────────────────────

  /** 当前用户对该互动剧的已解锁集号(含恒免费的第 1 集)。 */
  async getState(creationId: string, userId: string): Promise<DramaState> {
    const rows = await this.unlockRepo.find({ where: { creationId, userId } });
    const set = new Set<number>([1]); // 第 1 集恒免费试看
    for (const r of rows) set.add(r.episode);
    return { unlockedEpisodes: [...set].sort((a, b) => a - b) };
  }

  // ── AXP 解锁某集(服务端权威 + 幂等) ─────────────────────────

  /**
   * 解锁某集:价以服务端 story 为准。
   *   - episode<=1 或解锁价为 0 → 直接视为已解锁(不扣费)。
   *   - 已解锁 → 幂等返回(不重复扣费)。
   *   - 否则:spend 解锁者 AXP → earn 给 owner(各自原子;earn 失败回滚报错)。
   */
  async unlock(
    creationId: string,
    userId: string,
    episode: number,
  ): Promise<UnlockEpisodeResponse> {
    const story = await this.getStory(creationId);
    if (!story) throw new NotFoundException('该创作不是互动剧或不存在。');
    if (!Number.isInteger(episode) || episode < 1) {
      throw new BadRequestException('集号非法。');
    }
    const meta = story.episodes.find((e) => e.episode === episode);
    if (!meta) throw new BadRequestException(`不存在第 ${episode} 集。`);

    const stateBefore = await this.getState(creationId, userId);
    const already = stateBefore.unlockedEpisodes.includes(episode);
    const cost = Math.max(0, Math.floor(meta.unlockCostAxp || 0));

    // 免费集 / 已解锁 → 幂等(确保 entitlement 行存在,便于审计)。
    if (episode <= 1 || cost === 0 || already) {
      if (!already && episode > 1) {
        await this.recordUnlock(creationId, userId, episode, 0);
      }
      const state = await this.getState(creationId, userId);
      return { ok: true, episode, unlockedEpisodes: state.unlockedEpisodes, chargedAxp: 0 };
    }

    if (!this.axp) throw new BadRequestException('解锁服务不可用(AXP)。');

    // 解析 owner 的用户 id(收款方)。
    const creation = await this.getOrThrow(creationId);
    let toUserId: string | undefined;
    if (this.accountRepo) {
      const acct = await this.accountRepo.findOne({ where: { id: creation.ownerAccountId } });
      toUserId = acct?.ownerId ?? undefined;
    }

    const refId = `cunlock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.axp.spend({
      userId, source: 'creation_unlock', amount: cost, refId,
      note: `解锁互动剧第 ${episode} 集`, metadata: { creationId, episode },
    } as any);

    // owner 入账(不能给自己解锁付费给自己:相同则跳过 earn,钱已花出作为平台消费)。
    if (toUserId && toUserId !== userId) {
      try {
        await this.axp.earn({
          userId: toUserId, source: 'creation_unlock', amount: cost, refId,
          note: '互动剧被解锁收入', metadata: { creationId, episode, fromUserId: userId },
        } as any);
      } catch (e: any) {
        this.logger.error(`drama unlock earn failed after spend (refId=${refId}): ${e?.message}`);
        throw new BadRequestException('解锁入账失败,请稍后重试。');
      }
    }

    await this.recordUnlock(creationId, userId, episode, cost);
    const state = await this.getState(creationId, userId);
    return { ok: true, episode, unlockedEpisodes: state.unlockedEpisodes, chargedAxp: cost };
  }

  /** 写入 entitlement(幂等:唯一约束冲突静默忽略)。 */
  private async recordUnlock(
    creationId: string,
    userId: string,
    episode: number,
    chargedAxp: number,
  ): Promise<void> {
    try {
      await this.unlockRepo.insert({ creationId, userId, episode, chargedAxp });
    } catch {
      // 唯一约束冲突(并发重复解锁)→ 幂等忽略。
    }
  }

  // ── 生成(LLM → DramaStory JSON;失败兜底 demo 模板) ──────────

  /**
   * 生成一部互动剧并写入为当前 bundle(engine='drama-vn')。
   * 优先 LLM 产出结构化 JSON(用户 BYO 优先);解析/校验失败 → demo 模板兜底,
   * 保证"生成"一步永远闭环可玩(与游戏生成同策略)。
   */
  async generateForCreation(
    creationId: string,
    title: string,
    premise: string,
    userId?: string,
  ): Promise<DramaStory> {
    let story: DramaStory | null = null;
    if (this.llm) {
      try {
        const res = await this.llm.complete({
          userId,
          prompt: this.buildPrompt(title, premise),
          maxTokens: 8000,
          platformModel: 'claude-sonnet-4-6',
          timeoutMs: 180_000,
        });
        story = this.extractStory(res.text ?? '');
        if (story) this.logger.log(`drama gen via ${res.provider} model=${res.modelUsed} byo=${res.byo}`);
        else this.logger.warn('drama gen produced no valid JSON; using demo template.');
      } catch (e: any) {
        this.logger.warn(`drama gen failed: ${e?.message ?? e}; using demo template.`);
      }
    }
    if (!story) story = buildDemoDramaStory(title || '心动信号');

    await this.saveStory(creationId, story);
    return story;
  }

  /** 把 story 写为新版本 bundle(engine='drama-vn',html=JSON)。 */
  async saveStory(creationId: string, story: DramaStory): Promise<CreationGameBundleEntity> {
    const prev = await this.bundleRepo.findOne({
      where: { creationId },
      order: { version: 'DESC' },
    });
    const version = (prev?.version ?? 0) + 1;
    const entity = this.bundleRepo.create({
      creationId,
      version,
      title: (story.title || 'Interactive Drama').slice(0, 120),
      engine: DRAMA_ENGINE,
      source: 'llm',
      html: JSON.stringify(story),
      prompt: story.synopsis ?? null,
      modelUsed: 'drama-vn',
    });
    return this.bundleRepo.save(entity);
  }

  private buildPrompt(title: string, premise: string): string {
    return [
      'You generate INTERACTIVE SHORT DRAMAS as STRICT JSON (no prose, no markdown fences).',
      'Output a single JSON object matching this TypeScript type:',
      'type DramaStory = { title:string; synopsis?:string; startSceneId:string;',
      '  episodes:{episode:number;title:string;unlockCostAxp:number}[];',
      '  scenes:{id:string;episode:number;bg?:string;speaker?:string;text:string;',
      '    choices?:{id:string;label:string;next:string}[]; next?:string; ending?:boolean}[] }',
      '',
      'RULES:',
      '- 3 episodes. episode 1 unlockCostAxp MUST be 0; episodes 2 and 3 cost 50 and 100.',
      '- Mobile vertical micro-drama: punchy, emotional, fast reversals. Keep each scene text <= 90 chars.',
      '- At least 2 branching choice points; each choice.next must reference an existing scene id.',
      '- bg uses an emoji or a gradient keyword (e.g. "sunset","night","rain","office","cafe"). NO image URLs, NO video.',
      '- Every path must reach a scene with ending:true. 12-20 scenes total.',
      '- Language: Chinese (中文).',
      '',
      `DRAMA TITLE: ${title || '心动信号'}`,
      `PREMISE: ${premise || '都市悬疑甜宠,一条神秘短信打乱主角的生活。'}`,
      '',
      'Return the JSON now:',
    ].join('\n');
  }

  /** 从 LLM 文本抽取 DramaStory JSON(去围栏 + 截取最外层 {});校验失败返回 null。 */
  extractStory(text: string): DramaStory | null {
    if (!text) return null;
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const story = this.parseStory(t.slice(start, end + 1));
    if (!story) return null;
    // 轻量结构校验:起始场景存在 + 第 1 集免费 + 所有 choice.next 有指向。
    const ids = new Set(story.scenes.map((s) => s.id));
    if (!ids.has(story.startSceneId)) return null;
    const ep1 = story.episodes.find((e) => e.episode === 1);
    if (!ep1 || ep1.unlockCostAxp !== 0) return null;
    for (const sc of story.scenes) {
      for (const ch of sc.choices ?? []) {
        if (!ids.has(ch.next)) return null;
      }
      if (sc.next && !ids.has(sc.next)) return null;
    }
    return story;
  }

  private async getOrThrow(creationId: string) {
    const c = await this.repo.findById(creationId);
    if (!c) throw new NotFoundException(`Creation not found: ${creationId}`);
    return c;
  }
}
