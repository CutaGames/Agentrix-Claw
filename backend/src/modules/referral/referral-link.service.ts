import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantReferral } from '../../entities/merchant-referral.entity';
import { ReferralCommission } from '../../entities/referral-commission.entity';
import {
  ReferralLinkEntity,
  ReferralLinkType,
  ReferralLinkStatus,
} from '../../entities/referral-link.entity';
import * as crypto from 'crypto';

// ===== DTOs =====

export interface CreateReferralLinkDto {
  title?: string;
  type?: ReferralLinkType;
  targetId?: string;
  targetType?: string;
  targetName?: string;
  channel?: string;
  splitPlanId?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface ReferralLinkResponse {
  id: string;
  shortCode: string;
  shortUrl: string;
  fullUrl: string;
  title?: string;
  type: ReferralLinkType;
  status: ReferralLinkStatus;
  targetId?: string;
  targetName?: string;
  channel?: string;
  clicks: number;
  uniqueClicks: number;
  conversions: number;
  totalCommission: number;
  totalGMV: number;
  conversionRate: number;
  createdAt: Date;
}

export interface ReferralLinkStats {
  totalLinks: number;
  totalClicks: number;
  totalUniqueClicks: number;
  totalConversions: number;
  totalCommission: number;
  totalGMV: number;
  conversionRate: number;
}

@Injectable()
export class ReferralLinkService {
  private readonly logger = new Logger(ReferralLinkService.name);

  constructor(
    @InjectRepository(MerchantReferral)
    private referralRepository: Repository<MerchantReferral>,
    @InjectRepository(ReferralCommission)
    private commissionRepository: Repository<ReferralCommission>,
    @InjectRepository(ReferralLinkEntity)
    private linkRepository: Repository<ReferralLinkEntity>,
  ) {}

  private generateShortCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

  private getBaseUrl(): string {
    return process.env.FRONTEND_URL || 'https://www.agentrix.top';
  }

  private toResponse(entity: ReferralLinkEntity): ReferralLinkResponse {
    const baseUrl = this.getBaseUrl();
    return {
      id: entity.id,
      shortCode: entity.shortCode,
      shortUrl: `${baseUrl}/r/${entity.shortCode}`,
      fullUrl: entity.fullUrl || `${baseUrl}/r/${entity.shortCode}`,
      title: entity.title,
      type: entity.type,
      status: entity.status,
      targetId: entity.targetId,
      targetName: entity.targetName,
      channel: entity.channel,
      clicks: entity.clicks,
      uniqueClicks: entity.uniqueClicks,
      conversions: entity.conversions,
      totalCommission: Number(entity.totalCommission) || 0,
      totalGMV: Number(entity.totalGMV) || 0,
      conversionRate: entity.clicks > 0
        ? Math.round((entity.conversions / entity.clicks) * 10000) / 100
        : 0,
      createdAt: entity.createdAt,
    };
  }

  /**
   * 创建推广链接（通用或商品级）
   */
  async createLink(
    ownerId: string,
    dto: CreateReferralLinkDto,
  ): Promise<ReferralLinkResponse> {
    const shortCode = this.generateShortCode();
    const baseUrl = this.getBaseUrl();

    // fullUrl 指向实际目标页面，附带 ref 参数用于追踪
    let fullUrl: string;
    if (dto.targetId && dto.type === ReferralLinkType.SKILL) {
      fullUrl = `${baseUrl}/skill/${dto.targetId}?ref=${ownerId}`;
    } else if (dto.targetId && dto.type === ReferralLinkType.PRODUCT) {
      fullUrl = `${baseUrl}/marketplace?product=${dto.targetId}&ref=${ownerId}`;
    } else {
      fullUrl = `${baseUrl}/marketplace?ref=${ownerId}`;
    }
    if (dto.channel) {
      fullUrl += `&ch=${dto.channel}`;
    }

    const entity = this.linkRepository.create({
      ownerId,
      shortCode,
      type: dto.type || ReferralLinkType.GENERAL,
      status: ReferralLinkStatus.ACTIVE,
      title: dto.title,
      targetId: dto.targetId,
      targetType: dto.targetType,
      targetName: dto.targetName,
      fullUrl,
      channel: dto.channel,
      splitPlanId: dto.splitPlanId,
      expiresAt: dto.expiresAt,
      metadata: dto.metadata,
    });

    const saved = await this.linkRepository.save(entity);
    this.logger.log(`创建推广链接: ownerId=${ownerId}, shortCode=${shortCode}, type=${dto.type || 'general'}`);
    return this.toResponse(saved);
  }

  /**
   * 生成推广链接（向后兼容旧接口）
   */
  async generateReferralLink(
    agentId: string,
    merchantId?: string,
  ): Promise<ReferralLinkResponse> {
    return this.createLink(agentId, {
      type: merchantId ? ReferralLinkType.PRODUCT : ReferralLinkType.GENERAL,
      targetId: merchantId,
      targetType: merchantId ? 'merchant' : undefined,
    });
  }

  /**
   * 获取用户的所有推广链接
   */
  async getMyLinks(
    ownerId: string,
    type?: ReferralLinkType,
  ): Promise<ReferralLinkResponse[]> {
    const where: any = { ownerId };
    if (type) where.type = type;

    const links = await this.linkRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return links.map(l => this.toResponse(l));
  }

  /**
   * 通过短码获取链接（用于重定向）
   */
  async getLinkByShortCode(shortCode: string): Promise<ReferralLinkEntity | null> {
    return this.linkRepository.findOne({ where: { shortCode } });
  }

  /**
   * 记录链接点击
   */
  async recordClick(shortCode: string, isUnique: boolean = false): Promise<void> {
    const link = await this.linkRepository.findOne({ where: { shortCode } });
    if (!link) {
      this.logger.warn(`链接不存在: shortCode=${shortCode}`);
      return;
    }

    link.clicks += 1;
    if (isUnique) link.uniqueClicks += 1;
    await this.linkRepository.save(link);
    this.logger.debug(`记录点击: shortCode=${shortCode}, total=${link.clicks}`);
  }

  /**
   * 记录转化（注册/购买）
   */
  async recordConversion(
    shortCode: string,
    commissionAmount: number = 0,
    gmvAmount: number = 0,
  ): Promise<void> {
    const link = await this.linkRepository.findOne({ where: { shortCode } });
    if (!link) {
      this.logger.warn(`链接不存在: shortCode=${shortCode}`);
      return;
    }

    link.conversions += 1;
    link.totalCommission = Number(link.totalCommission) + commissionAmount;
    link.totalGMV = Number(link.totalGMV) + gmvAmount;
    await this.linkRepository.save(link);
    this.logger.log(`记录转化: shortCode=${shortCode}, commission=${commissionAmount}, gmv=${gmvAmount}`);
  }

  /**
   * 暂停/恢复链接
   */
  async updateLinkStatus(
    ownerId: string,
    linkId: string,
    status: ReferralLinkStatus,
  ): Promise<ReferralLinkResponse> {
    const link = await this.linkRepository.findOne({ where: { id: linkId, ownerId } });
    if (!link) throw new NotFoundException('Referral link not found');

    link.status = status;
    const saved = await this.linkRepository.save(link);
    return this.toResponse(saved);
  }

  /**
   * 删除链接（软删除 -> archived）
   */
  async archiveLink(ownerId: string, linkId: string): Promise<void> {
    const link = await this.linkRepository.findOne({ where: { id: linkId, ownerId } });
    if (!link) throw new NotFoundException('Referral link not found');

    link.status = ReferralLinkStatus.ARCHIVED;
    await this.linkRepository.save(link);
  }

  /**
   * 获取链接统计汇总
   */
  async getLinkStatistics(ownerId: string): Promise<ReferralLinkStats> {
    const links = await this.linkRepository.find({
      where: { ownerId },
    });

    const totalLinks = links.length;
    const totalClicks = links.reduce((s, l) => s + l.clicks, 0);
    const totalUniqueClicks = links.reduce((s, l) => s + l.uniqueClicks, 0);
    const totalConversions = links.reduce((s, l) => s + l.conversions, 0);
    const totalCommission = links.reduce((s, l) => s + Number(l.totalCommission), 0);
    const totalGMV = links.reduce((s, l) => s + Number(l.totalGMV), 0);
    const conversionRate = totalClicks > 0
      ? Math.round((totalConversions / totalClicks) * 10000) / 100
      : 0;

    return {
      totalLinks,
      totalClicks,
      totalUniqueClicks,
      totalConversions,
      totalCommission: Math.round(totalCommission * 100) / 100,
      totalGMV: Math.round(totalGMV * 100) / 100,
      conversionRate,
    };
  }
}

