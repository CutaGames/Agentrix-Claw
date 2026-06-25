import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AeonLedgerEntry } from '../entities/aeon-ledger-entry.entity';
import { BedrockIntegrationService } from '../../ai-integration/bedrock/bedrock-integration.service';
import {
  AEON_ACTIVE_EPOCH,
  type AeonEpoch,
  type AeonNewsItem,
  type AeonNewsKind,
  type AeonLeaderboardEntry,
} from '../../../../../shared/types/aeon-world';

/**
 * WorldNewsService — 世界新闻栏(Task 4.6 / R14.5)。
 *
 * 聚合涌现社交事件(谁接谁的单 / 公司成立 / 产出排行榜 / 里程碑)成一行行 headline。
 * 默认用模板生成(零成本、稳定);可选经 Bedrock 把事件升级为"微剧情"(R14.4),
 * Bedrock 不可用时优雅降级回模板(R18.5)。排行榜由账本(aeon_ledger_entries)聚合。
 *
 * 存储:Phase 4 用内存环形缓冲(最近 N 条);跨实例/持久化为后续接线点(可落
 * world_events 复用现有事件流表)。
 */
@Injectable()
export class WorldNewsService {
  private readonly logger = new Logger(WorldNewsService.name);

  /** 每纪元保留的最近新闻条数。 */
  private static readonly MAX_FEED = 100;
  private readonly feed = new Map<AeonEpoch, AeonNewsItem[]>();
  private seq = 0;

  constructor(
    @InjectRepository(AeonLedgerEntry)
    private readonly ledgerRepo: Repository<AeonLedgerEntry>,
    @Optional() private readonly bedrock?: BedrockIntegrationService,
  ) {}

  /** 记一条世界新闻(模板 headline)。涌现事件的统一入口。 */
  publish(
    kind: AeonNewsKind,
    headline: string,
    opts: { epoch?: AeonEpoch; refId?: string } = {},
  ): AeonNewsItem {
    const epoch = opts.epoch ?? AEON_ACTIVE_EPOCH;
    const item: AeonNewsItem = {
      id: `news-${Date.now()}-${this.seq++}`,
      epoch,
      kind,
      headline,
      refId: opts.refId,
      createdAt: Date.now(),
    };
    const list = this.feed.get(epoch) ?? [];
    list.unshift(item);
    if (list.length > WorldNewsService.MAX_FEED) list.length = WorldNewsService.MAX_FEED;
    this.feed.set(epoch, list);
    return item;
  }

  /**
   * 把一条原始事件升级为 LLM 微剧情后发布(R14.4)。Bedrock 不可用 → 回退模板(降级不崩)。
   * 失败安全:任何异常都退回原始 headline。
   */
  async publishMicroStory(
    kind: AeonNewsKind,
    rawHeadline: string,
    opts: { epoch?: AeonEpoch; refId?: string } = {},
  ): Promise<AeonNewsItem> {
    let headline = rawHeadline;
    if (this.bedrock) {
      try {
        const prompt =
          `你是"永曜城"世界的新闻播报员。把下面这条事件改写成一句 30 字以内、` +
          `有科技未来城氛围、生动但不浮夸的中文播报,只输出这一句:\n事件:${rawHeadline}`;
        const out = await this.bedrock.invokeModel(prompt);
        const trimmed = (out ?? '').trim().split('\n')[0]?.slice(0, 60);
        if (trimmed) headline = trimmed;
      } catch (e) {
        this.logger.warn(`micro-story fallback to template: ${(e as Error).message}`);
      }
    }
    return this.publish(kind, headline, opts);
  }

  /** 取新闻流(最新在前)。 */
  list(epoch: AeonEpoch = AEON_ACTIVE_EPOCH, limit = 30): AeonNewsItem[] {
    return (this.feed.get(epoch) ?? []).slice(0, limit);
  }

  /**
   * AXP 收入排行榜(R14.5):按 payee 聚合账本 inflow - 该用户作为 payer 的 outflow。
   * 这里取"赚到的"口径:作为 payee 的总额(工资/任务/悬赏/卖货收入)。
   */
  async leaderboard(limit = 10): Promise<AeonLeaderboardEntry[]> {
    const rows = await this.ledgerRepo
      .createQueryBuilder('l')
      .select('l.payee_user_id', 'subjectId')
      .addSelect('COALESCE(SUM(CAST(l.amount AS BIGINT)),0)', 'value')
      .where('l.currency = :cur', { cur: 'AXP' })
      .groupBy('l.payee_user_id')
      .orderBy('value', 'DESC')
      .limit(limit)
      .getRawMany();
    return rows.map((r) => ({
      subjectId: r.subjectId,
      subjectName: String(r.subjectId).slice(0, 8),
      metric: 'axp_earned' as const,
      value: Number(r.value ?? 0),
    }));
  }
}
