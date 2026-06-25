import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import { PlotModerationService } from '../moderation/plot-moderation.service';
import type {
  PublishPlotResponse,
} from '../../../../shared/types/world-creation-api';
import type { WorldCreationError } from '../../../../shared/types/world-creation';

/**
 * ArenaService — Battle Arena 发布与分享 (Task 12.4, R16.6 / R11.5).
 *
 * 发布一个已生成 ECS_World 的 Plot（典型为 Battle Arena，design §11.1）：
 *   1. 校验调用者是 Plot owner 且 Plot 已生成 ECS_World（有 ecsVersionId）。
 *   2. 运行发布前审核钩子 {@link runPrePublishModeration}（task 16.x 接入 v5 5 阶段
 *      审核 + cn-region 增量；此处先预留并默认放行，保留接口形状不变）。
 *   3. 将 status → 'published'，使其经 {@link MapService.discover} 在 World_Map
 *      可被发现（discover 仅列出 published / listed 的 Plot）。
 *   4. 生成与 v5 dungeon 一致格式的 `share_code` 并落库（幂等：已存在则复用）。
 *
 * **share_code 复用**：格式与生成风格完全对齐 world-engine 既有设施
 * （`DungeonBuilderService.generateShareCode` / `ShareService` 深链与卡片模型）——
 * SHA-256(plotId) 派生、6–12 位字母数字（hex 0-9A-F 子集）、DB 唯一索引保证全局
 * 唯一、冲突时以 hash 偏移重试、最终回退追加 `Date.now()`。由此产出的码可直接套用
 * `agentrix://world-engine/dungeon/{share_code}` 同款分享卡 / 深链 / web 回退预览。
 *
 * 全局 SnakeNamingStrategy：列名自动派生，禁止手写 name。
 *
 * @see backend/src/modules/world-engine/services/dungeon-builder.service.ts — generateShareCode
 * @see backend/src/modules/world-engine/services/share.service.ts — deep link / card model
 */
@Injectable()
export class ArenaService {
  private readonly logger = new Logger(ArenaService.name);

  /** Max attempts to find a collision-free share code (mirrors v5 dungeon-builder). */
  private readonly SHARE_CODE_MAX_ATTEMPTS = 10;

  constructor(
    @InjectRepository(WorldPlot)
    private readonly plotRepo: Repository<WorldPlot>,
    private readonly agentAccountService: AgentAccountService,
    /**
     * 发布前审核服务 (Task 16.1)：接入 v5 5 阶段审核 + cn-region 增量。
     * 以 @Optional 注入，缺失时 {@link runPrePublishModeration} 退化为放行，
     * 保证既有单测 (仅提供 plotRepo + AgentAccountService) 不被破坏。
     */
    @Optional()
    private readonly plotModerationService?: PlotModerationService,
  ) {}

  /**
   * 发布 Battle Arena（或任意已生成 ECS_World 的 Plot）并产出可分享 share_code
   * (R16.6 / R11.5)。
   *
   * 幂等：对已 published 且已有 share_code 的 Plot 重复调用直接回显既有码，不重复
   * 生成、不破坏发现状态。
   *
   * @param plotId 目标 Plot id
   * @param userId 调用者 userId（用于 owner 鉴权）；省略则跳过 owner 校验（内部调用）
   * @returns {@link PublishPlotResponse}：published 标志 + share_code（或审核失败错误）
   */
  async publishArena(
    plotId: string,
    userId?: string,
  ): Promise<PublishPlotResponse> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }

    // 必须已生成 ECS_World 才能发布（空地块不可发布）。
    if (!plot.ecsVersionId) {
      const error: WorldCreationError = {
        error: 'SCHEMA_INVALID',
        detail: `Plot "${plotId}" has no ECS_World to publish`,
      };
      return { published: false, error };
    }

    // Owner 鉴权：仅 Plot owner 可发布（与 Marketplace 首次上架的原创者门控一致）。
    if (userId) {
      await this.assertOwner(plot, userId);
    }

    // 已发布且已有 share_code → 幂等回显，避免重复生成。
    if (plot.status === 'published' && plot.shareCode) {
      return { published: true, shareCode: plot.shareCode };
    }

    // 发布前审核钩子（task 16.x 接入 v5 5 阶段审核 + cn-region 增量）。
    const moderation = await this.runPrePublishModeration(plot);
    if (!moderation.passed) {
      return { published: false, error: moderation.error };
    }

    // 生成与 v5 一致格式的 share_code（幂等：已存在则复用既有码）。
    const shareCode = plot.shareCode ?? (await this.generatePlotShareCode(plotId));

    plot.status = 'published';
    plot.shareCode = shareCode;
    const saved = await this.plotRepo.save(plot);

    this.logger.log(
      `Arena published: plot=${saved.id}, shareCode=${shareCode}, ` +
        `tier=${saved.substrateTier} — now discoverable on World_Map`,
    );

    return { published: true, shareCode: saved.shareCode ?? shareCode };
  }

  /**
   * 生成与 v5 dungeon `share_code` 完全一致格式的 Plot 分享码。
   *
   * 算法直接对齐 `DungeonBuilderService.generateShareCode`：
   *   - SHA-256(plotId) → hex；取前 8 位大写（hex 即字母数字 0-9A-F，天然合法）。
   *   - DB 唯一性校验冲突时，以 hash 偏移取下一段 8 位重试（最多 10 次）。
   *   - 偏移段长度不足 6 位时回退为前 6 位 + base36 计数后缀。
   *   - 全部失败时回退为 SHA-256(plotId + Date.now()) 前 8 位。
   * 长度恒在 6–12 位字母数字区间，可直接套用 v5 分享卡 / 深链 / web 回退模型。
   */
  async generatePlotShareCode(plotId: string): Promise<string> {
    const hash = createHash('sha256').update(plotId).digest('hex');
    let code = hash.substring(0, 8).toUpperCase();

    let attempts = 0;
    while (attempts < this.SHARE_CODE_MAX_ATTEMPTS) {
      const existing = await this.plotRepo.findOne({
        where: { shareCode: code },
      });
      if (!existing) {
        return code;
      }
      attempts++;
      const offset = attempts * 4;
      code = hash.substring(offset, offset + 8).toUpperCase();
      if (code.length < 6) {
        code =
          hash.substring(0, 6).toUpperCase() + attempts.toString(36).toUpperCase();
      }
    }

    // 最终回退：时间盐派生，几乎不可能再撞。
    const fallbackHash = createHash('sha256')
      .update(plotId + Date.now())
      .digest('hex');
    return fallbackHash.substring(0, 8).toUpperCase();
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * 发布前审核钩子 (Task 16.1)：接入 v5 5 阶段审核 + cn-region 增量。
   *
   * 经 @Optional 注入的 {@link PlotModerationService} 执行；未通过审核返回结构化
   * `MODERATION_REJECTED` 错误 (含具体阶段与原因，R10.3)，阻断发布且不改 Plot 状态。
   * 审核服务缺失时 (如部分单测构造) 退化为放行，保留 {@link publishArena} 调用方
   * 与返回契约不变。cn-region 判定可由 plot/owner 区域上下文派生；当前默认非中国区，
   * 待区域上下文接入后从调用处透传。
   */
  private async runPrePublishModeration(
    plot: WorldPlot,
  ): Promise<{ passed: true } | { passed: false; error: WorldCreationError }> {
    if (!this.plotModerationService) {
      return { passed: true };
    }
    return this.plotModerationService.runPrePublish(plot.id);
  }

  /** 校验 userId 拥有 Plot 的 owner AgentAccount，否则拒绝发布。 */
  private async assertOwner(plot: WorldPlot, userId: string): Promise<void> {
    if (!plot.ownerAccountId) {
      throw new ForbiddenException(
        `Plot "${plot.id}" is unowned and cannot be published`,
      );
    }
    let ownsAccount = false;
    try {
      const { items } = await this.agentAccountService.findByOwner(userId, 1, 100);
      ownsAccount = (items ?? []).some((acc) => acc.id === plot.ownerAccountId);
    } catch {
      ownsAccount = false;
    }
    if (!ownsAccount) {
      throw new ForbiddenException(
        `User is not the owner of Plot "${plot.id}"`,
      );
    }
  }
}
