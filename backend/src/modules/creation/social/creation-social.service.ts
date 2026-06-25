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
import { CreationPublishService } from '../creation-publish.service';
import { CreationEntity } from '../entities/creation.entity';
import { CreationCommentEntity } from '../entities/creation-comment.entity';
import { CreationLikeEntity } from '../entities/creation-like.entity';
import { CreationFollowEntity } from '../entities/creation-follow.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { AxpService } from '../../axp/axp.service';

import type {
  CommentCreationResponse,
  CreationComment,
  LikeCreationResponse,
  FollowCreatorResponse,
  ShareCreationResponse,
} from '../../../../shared/types/creation-api';

/** 深链/Web 预览基址(真实生效域名;agentrix.top 为线上主域)。 */
const APP_DEEPLINK_BASE = 'agentrix://world/creation';
const WEB_PREVIEW_BASE = 'https://agentrix.top/c';
const APP_DOWNLOAD_URL = 'https://www.agentrix.top';

/** Remix 血缘分润比例(基点):衍生作品每笔成交,上游母版创作者分得 10%(从 owner 收入中扣)。 */
const LINEAGE_ROYALTY_BPS = 1000;

/**
 * CreationSocialService — Creation 社交(留言/点赞/关注/分享)(world-creation-feed task 8.1)。
 *
 * spec: 需求 8.1–8.4。
 *   - 留言:持久化 + metrics.comments 维护(需求 8.1)。
 *   - 点赞:幂等(唯一约束)+ metrics.likes 维护(需求 8.2)。
 *   - 关注:幂等(唯一约束),供 following 口径(需求 8.3 / 5.6)。
 *   - 分享:生成深链 + Web 预览兜底(需求 8.4);未发布则即时生成 shareCode。
 *
 * 计数与关系表分离:metrics 作快速读(发现投影),关系表作真相源与幂等保证。
 */
@Injectable()
export class CreationSocialService {
  private readonly logger = new Logger(CreationSocialService.name);

  constructor(
    private readonly repo: CreationRepository,
    private readonly publishService: CreationPublishService,
    @InjectRepository(CreationCommentEntity)
    private readonly commentRepo: Repository<CreationCommentEntity>,
    @InjectRepository(CreationLikeEntity)
    private readonly likeRepo: Repository<CreationLikeEntity>,
    @InjectRepository(CreationFollowEntity)
    private readonly followRepo: Repository<CreationFollowEntity>,
    @Optional()
    @InjectRepository(AgentAccount)
    private readonly accountRepo?: Repository<AgentAccount>,
    @Optional() private readonly axp?: AxpService,
  ) {}

  // ── 打赏创作者(经济闭环:观众 AXP → 创作 owner;真实价值流转) ──

  /**
   * 给创作 owner 打赏 AXP(单机/多人游戏均可)。先扣打赏者,成功后给 owner 入账(各自原子)。
   * owner 由 ownerAccountId → AgentAccount.ownerId 解析;不能打赏自己;金额 1..5000。
   */
  async tip(
    creationId: string,
    fromUserId: string,
    amount: number,
  ): Promise<{ ok: boolean; amount: number; toAccountId: string }> {
    const creation = await this.getOrThrow(creationId);
    if (!this.axp) throw new BadRequestException('打赏服务不可用');
    if (!Number.isInteger(amount) || amount < 1 || amount > 5000) {
      throw new BadRequestException('打赏额需为 1~5000 的整数 AXP');
    }
    let toUserId: string | undefined;
    if (this.accountRepo) {
      const acct = await this.accountRepo.findOne({ where: { id: creation.ownerAccountId } });
      toUserId = acct?.ownerId ?? undefined;
    }
    if (!toUserId) throw new BadRequestException('无法解析创作者账户');
    if (toUserId === fromUserId) throw new BadRequestException('不能给自己打赏');

    const refId = `ctip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.axp.spend({
      userId: fromUserId, source: 'creation_tip', amount, refId,
      note: '打赏创作', metadata: { creationId },
    } as any);
    try {
      const royalty = await this.payLineageRoyalty(creation, amount, refId, toUserId);
      await this.axp.earn({
        userId: toUserId, source: 'creation_tip', amount: amount - royalty, refId,
        note: '创作被打赏收入', metadata: { creationId, fromUserId, royalty },
      } as any);
    } catch (e: any) {
      this.logger.error(`creation tip earn failed after spend (refId=${refId}): ${e?.message}`);
      throw new BadRequestException('打赏入账失败,请稍后重试');
    }
    return { ok: true, amount, toAccountId: creation.ownerAccountId };
  }

  /**
   * 购买店铺商品(人类买家):服务端权威价(从 creation.offerings 取,忽略客户端价)。
   * 扣买家 AXP(creation_purchase)→ 给 owner 入账;成交后 metrics.sales += qty。
   */
  async purchase(
    creationId: string,
    fromUserId: string,
    offeringId: string,
    qty: number,
  ): Promise<{ ok: boolean; amount: number; offeringId: string; toAccountId: string }> {
    const creation = await this.getOrThrow(creationId);
    if (!this.axp) throw new BadRequestException('购买服务不可用');
    const offerings = creation.offerings ?? [];
    const offering = offerings.find((o) => o.id === offeringId);
    if (!offering) throw new BadRequestException('商品不存在');
    const unit = offering.price?.axp;
    if (typeof unit !== 'number' || unit < 0) throw new BadRequestException('该商品未设置 AXP 价格');
    const q = Number.isInteger(qty) && qty > 0 ? Math.min(qty, 99) : 1;
    const amount = Math.round(unit * q);
    if (amount <= 0) throw new BadRequestException('成交金额无效');

    let toUserId: string | undefined;
    if (this.accountRepo) {
      const acct = await this.accountRepo.findOne({ where: { id: creation.ownerAccountId } });
      toUserId = acct?.ownerId ?? undefined;
    }
    if (!toUserId) throw new BadRequestException('无法解析创作者账户');
    if (toUserId === fromUserId) throw new BadRequestException('不能购买自己的商品');

    const refId = `cbuy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.axp.spend({
      userId: fromUserId, source: 'creation_purchase', amount, refId,
      note: `购买商品 ${offering.name || offeringId} x${q}`, metadata: { creationId, offeringId, qty: q },
    } as any);
    try {
      const royalty = await this.payLineageRoyalty(creation, amount, refId, toUserId);
      await this.axp.earn({
        userId: toUserId, source: 'creation_purchase', amount: amount - royalty, refId,
        note: '店铺商品销售收入', metadata: { creationId, offeringId, qty: q, fromUserId, royalty },
      } as any);
    } catch (e: any) {
      this.logger.error(`creation purchase earn failed after spend (refId=${refId}): ${e?.message}`);
      throw new BadRequestException('入账失败,请稍后重试');
    }
    creation.metrics = { ...creation.metrics, sales: (creation.metrics?.sales ?? 0) + q };
    await this.repo.save(creation);

    return { ok: true, amount, offeringId, toAccountId: creation.ownerAccountId };
  }

  // ── Remix 血缘分润(P0-③) ──────────────────────────────────

  /**
   * 衍生作品成交时给上游母版创作者分润(从 owner 毛收入中扣 LINEAGE_ROYALTY_BPS)。
   * 返回实际分出的 royalty(0 表示无母版/无法解析/同为一人)。owner 应入账 = gross - royalty。
   */
  private async payLineageRoyalty(
    creation: CreationEntity,
    gross: number,
    refId: string,
    ownerUserId: string,
  ): Promise<number> {
    if (!this.axp || !this.accountRepo || !creation.parentCreationId) return 0;
    const royalty = Math.floor((gross * LINEAGE_ROYALTY_BPS) / 10000);
    if (royalty <= 0) return 0;
    try {
      const parent = await this.repo.findById(creation.parentCreationId);
      if (!parent) return 0;
      const acct = await this.accountRepo.findOne({ where: { id: parent.originalCreatorAccountId } });
      const parentUserId = acct?.ownerId;
      if (!parentUserId || parentUserId === ownerUserId) return 0; // 同一人不分润
      await this.axp.earn({
        userId: parentUserId, source: 'remix_royalty', amount: royalty, refId: `royalty-${refId}`,
        note: 'Remix 血缘分润', metadata: { creationId: creation.id, parentCreationId: parent.id },
      } as any);
      this.logger.log(`remix royalty ${royalty} → parent creator ${parentUserId} (creation=${creation.id})`);
      return royalty;
    } catch (e: any) {
      this.logger.warn(`lineage royalty failed (creation=${creation.id}): ${e?.message}`);
      return 0;
    }
  }

  // ── 留言(需求 8.1) ──────────────────────────────────────────

  async comment(
    creationId: string,
    authorAccountId: string,
    text: string,
    parentCommentId?: string,
  ): Promise<CommentCreationResponse> {
    const creation = await this.getOrThrow(creationId);
    const row = await this.commentRepo.save(
      this.commentRepo.create({
        creationId,
        authorAccountId,
        text,
        parentCommentId: parentCommentId ?? null,
      }),
    );
    const commentCount = (creation.metrics?.comments ?? 0) + 1;
    creation.metrics = { ...creation.metrics, comments: commentCount };
    await this.repo.save(creation);

    return { comment: await this.toCommentDto(row), commentCount };
  }

  async listComments(creationId: string, limit = 50): Promise<CreationComment[]> {
    const rows = await this.commentRepo.find({
      where: { creationId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(1, limit), 200),
    });
    return Promise.all(rows.map((r) => this.toCommentDto(r)));
  }

  // ── 点赞(需求 8.2,幂等) ────────────────────────────────────

  async like(
    creationId: string,
    accountId: string,
    liked: boolean,
  ): Promise<LikeCreationResponse> {
    const creation = await this.getOrThrow(creationId);
    const existing = await this.likeRepo.findOne({ where: { creationId, accountId } });

    let delta = 0;
    if (liked && !existing) {
      await this.likeRepo.save(this.likeRepo.create({ creationId, accountId }));
      delta = 1;
    } else if (!liked && existing) {
      await this.likeRepo.remove(existing);
      delta = -1;
    }
    let likeCount = creation.metrics?.likes ?? 0;
    if (delta !== 0) {
      likeCount = Math.max(0, likeCount + delta);
      creation.metrics = { ...creation.metrics, likes: likeCount };
      await this.repo.save(creation);
    }
    return { liked, likeCount };
  }

  // ── 关注创作者(需求 8.3,幂等) ──────────────────────────────

  async follow(
    creationId: string,
    followerAccountId: string,
    following: boolean,
  ): Promise<FollowCreatorResponse> {
    const creation = await this.getOrThrow(creationId);
    const creatorAccountId = creation.ownerAccountId;
    // 不能关注自己(幂等放行)。
    if (creatorAccountId === followerAccountId) {
      return { creatorAccountId, following: false };
    }
    const existing = await this.followRepo.findOne({
      where: { followerAccountId, creatorAccountId },
    });
    if (following && !existing) {
      await this.followRepo.save(this.followRepo.create({ followerAccountId, creatorAccountId }));
    } else if (!following && existing) {
      await this.followRepo.remove(existing);
    }
    return { creatorAccountId, following };
  }

  // ── 分享(需求 8.4) ──────────────────────────────────────────

  async share(creationId: string): Promise<ShareCreationResponse> {
    const creation = await this.getOrThrow(creationId);
    let shareCode = creation.shareCode;
    if (!shareCode) {
      // 未发布也允许分享:即时生成稳定短码并持久化。
      shareCode = await this.publishService.generateShareCode(creation.id);
      creation.shareCode = shareCode;
      await this.repo.save(creation);
    }
    return {
      shareCode,
      deepLink: `${APP_DEEPLINK_BASE}/${shareCode}`,
      webPreviewUrl: `${WEB_PREVIEW_BASE}/${shareCode}`,
      appDownloadLink: APP_DOWNLOAD_URL,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async getOrThrow(creationId: string): Promise<CreationEntity> {
    const c = await this.repo.findById(creationId);
    if (!c) throw new NotFoundException(`Creation not found: ${creationId}`);
    return c;
  }

  private async toCommentDto(row: CreationCommentEntity): Promise<CreationComment> {
    let authorName: string | undefined;
    if (this.accountRepo) {
      const acc = await this.accountRepo.findOne({ where: { id: row.authorAccountId } });
      authorName = acc?.name;
    }
    return {
      id: row.id,
      creationId: row.creationId,
      authorAccountId: row.authorAccountId,
      authorName,
      text: row.text,
      parentCommentId: row.parentCommentId ?? undefined,
      createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Date.now(),
    };
  }
}
