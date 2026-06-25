import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldAssetModerationDecision } from '../entities/world-asset-moderation-decision.entity';
import { WorldAsset } from '../entities/world-asset.entity';

/**
 * AdminModerationController — Manual Review Dashboard endpoints.
 *
 * Implements:
 * - 18.4 (P1): Manual reviewer dashboard endpoint
 * - 12.5: 24h SLA listing review
 * - 12.6/12.7: 48h SLA post-publish report review
 *
 * Routes (under /api global prefix → /api/admin/world-engine/moderation/...):
 *  GET    /admin/world-engine/moderation/queue?stage=&decision=
 *  GET    /admin/world-engine/moderation/:id
 *  PATCH  /admin/world-engine/moderation/:id  { action: 'approve'|'reject'|'escalate', reason? }
 *
 * Requirements: 12.5, 12.6, 12.7, 12.8
 */
@ApiTags('admin/world-engine/moderation')
@Controller('admin/world-engine/moderation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminModerationController {
  constructor(
    @InjectRepository(WorldAssetModerationDecision)
    private readonly moderationRepo: Repository<WorldAssetModerationDecision>,
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
  ) {}

  /**
   * GET /admin/world-engine/moderation/queue
   *
   * List moderation decisions with optional filters.
   * Query params:
   *  - stage: pre_upload_face | pre_upload_copyright | post_gen_words | pre_listing | post_publish_report
   *  - decision: pending | approved | rejected
   *  - limit: number (default 50, max 200)
   *  - includeAsset: 'true' to enrich with asset name/category
   */
  @Get('queue')
  @ApiOperation({ summary: 'List moderation queue items with filters' })
  async listQueue(
    @Query('stage') stage?: string,
    @Query('decision') decision?: string,
    @Query('limit') limitStr?: string,
    @Query('includeAsset') includeAsset?: string,
  ) {
    const limit = Math.min(parseInt(limitStr || '50', 10), 200);

    const qb = this.moderationRepo
      .createQueryBuilder('mod')
      .orderBy('mod.createdAt', 'DESC')
      .limit(limit);

    if (stage) qb.andWhere('mod.stage = :stage', { stage });
    if (decision) qb.andWhere('mod.decision = :decision', { decision });

    const items = await qb.getMany();

    // Optionally enrich with asset metadata
    if (includeAsset === 'true' && items.length > 0) {
      const assetIds = [...new Set(items.map((i) => i.worldAssetId))];
      const assets = await this.worldAssetRepo
        .createQueryBuilder('asset')
        .where('asset.id IN (:...ids)', { ids: assetIds })
        .getMany();
      const assetMap = new Map(assets.map((a) => [a.id, a]));
      const enriched = items.map((item) => ({
        ...item,
        asset: assetMap.get(item.worldAssetId)
          ? {
              id: assetMap.get(item.worldAssetId)!.id,
              name: assetMap.get(item.worldAssetId)!.name,
              category: assetMap.get(item.worldAssetId)!.category,
              ownerId: assetMap.get(item.worldAssetId)!.ownerId,
              styledMeshUrl: assetMap.get(item.worldAssetId)!.styledMeshUrl,
            }
          : null,
      }));
      return { items: enriched, total: enriched.length };
    }

    return { items, total: items.length };
  }

  /**
   * GET /admin/world-engine/moderation/:id
   *
   * Get details of a single moderation decision.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get moderation decision detail' })
  async getOne(@Param('id') id: string) {
    const item = await this.moderationRepo.findOne({ where: { id } });
    if (!item) throw new BadRequestException('Moderation decision not found');

    const asset = await this.worldAssetRepo.findOne({
      where: { id: item.worldAssetId },
    });

    return { ...item, asset };
  }

  /**
   * PATCH /admin/world-engine/moderation/:id
   *
   * Update a moderation decision: approve / reject / escalate.
   * Body: { action: 'approve' | 'reject' | 'escalate', reason?: string }
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Approve / reject / escalate a moderation decision' })
  async updateDecision(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject' | 'escalate'; reason?: string },
  ) {
    if (!body.action || !['approve', 'reject', 'escalate'].includes(body.action)) {
      throw new BadRequestException(
        'action must be one of: approve, reject, escalate',
      );
    }

    const item = await this.moderationRepo.findOne({ where: { id } });
    if (!item) throw new BadRequestException('Moderation decision not found');

    const reviewerId = req.user?.id || req.user?.sub;

    let newDecision: 'approved' | 'rejected' | 'pending';
    if (body.action === 'approve') newDecision = 'approved';
    else if (body.action === 'reject') newDecision = 'rejected';
    else newDecision = 'pending'; // escalate keeps pending but logs reviewer

    await this.moderationRepo.update(id, {
      decision: newDecision as any,
      reviewerId: reviewerId || null,
      reason: body.reason
        ? `[${body.action}] ${body.reason}`
        : `Manual ${body.action} by ${reviewerId}`,
    });

    return {
      id,
      decision: newDecision,
      reviewerId,
      action: body.action,
    };
  }

  /**
   * GET /admin/world-engine/moderation/sla/breaches
   *
   * List items past SLA (24h for pre_listing, 48h for post_publish_report).
   */
  @Get('sla/breaches')
  @ApiOperation({ summary: 'List moderation items past SLA' })
  async listSlaBreaches() {
    const now = new Date();
    const slaListing = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const slaReport = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const breaches = await this.moderationRepo
      .createQueryBuilder('mod')
      .where('mod.decision = :pending', { pending: 'pending' })
      .andWhere(
        '(mod.stage = :preList AND mod.createdAt < :slaListing) OR ' +
          '(mod.stage = :postReport AND mod.createdAt < :slaReport)',
        {
          preList: 'pre_listing',
          postReport: 'post_publish_report',
          slaListing,
          slaReport,
        },
      )
      .orderBy('mod.createdAt', 'ASC')
      .getMany();

    return { items: breaches, total: breaches.length };
  }
}
