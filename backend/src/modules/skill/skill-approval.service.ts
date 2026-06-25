/**
 * Skill Approval Service
 * 
 * 管理 Skill 的审批流程：
 * 1. 自动扫描/导入 -> pending 状态
 * 2. 后台审批 -> approved/rejected
 * 3. 批量上架 -> published
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Skill, SkillStatus, SkillSource } from '../../entities/skill.entity';
import { ExternalSkillMapping, SyncStatus } from '../../entities/external-skill-mapping.entity';
import { ClawInstalledSkill } from '../../entities/claw-installed-skill.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EcosystemImporterService } from './ecosystem-importer.service';
import { emitSkillUpdate } from '../desktop-sync/companion-presence.helpers';

export interface PendingSkill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  source: SkillSource;
  category: string;
  layer: string;
  authorInfo: any;
  pricing: any;
  createdAt: Date;
  status: SkillStatus;
}

export interface ApprovalResult {
  approved: string[];
  rejected: string[];
  errors: string[];
}

export interface ScanResult {
  scannedAt: Date;
  newSkills: number;
  updatedSkills: number;
  sources: {
    mcp: number;
    chatgpt: number;
    openapi: number;
    x402: number;
    ucp: number;
  };
}

@Injectable()
export class SkillApprovalService {
  private readonly logger = new Logger(SkillApprovalService.name);

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(ExternalSkillMapping)
    private externalMappingRepository: Repository<ExternalSkillMapping>,
    @InjectRepository(ClawInstalledSkill)
    private clawInstalledSkillRepository: Repository<ClawInstalledSkill>,
    private ecosystemImporter: EcosystemImporterService,
  ) {}

  /**
   * P-9 Companion Redesign — broadcast skill.update presence event to all
   * users who have this skill installed. Called after skill version bump
   * or major capability change. Phase 1: notify when status flips to
   * PUBLISHED with a new version string. Skips when no change to user.
   *
   * Wrapped in try/catch: emit failure never blocks skill publish flow.
   */
  private async broadcastSkillUpdate(
    skillId: string,
    newVersion: string,
    introducesNewPermissions: boolean,
    newPermissions: string[] | undefined,
    changelogSummary: string | null,
  ): Promise<void> {
    try {
      // Find all installations of this skill across instances; join to user
      // through openclaw_instances → users (via installedByUserId for direct
      // attribution). Phase 1 simplification: dedupe by installedByUserId.
      const installations = await this.clawInstalledSkillRepository.find({
        where: { skillId },
        select: ['installedByUserId'],
      });
      const userIds = Array.from(
        new Set(installations.map((i) => i.installedByUserId).filter(Boolean) as string[]),
      );
      if (userIds.length === 0) return;

      this.logger.log(
        `Broadcasting skill.update for skill=${skillId} v=${newVersion} to ${userIds.length} users`,
      );

      for (const userId of userIds) {
        try {
          emitSkillUpdate({
            skillId,
            userId,
            installedVersion: '*',  // Phase 1 unknown; mobile compares with local cached version
            newVersion,
            introducesNewPermissions,
            newPermissions,
            changelogSummary,
          });
        } catch (err) {
          this.logger.warn(`emit skill.update failed for user=${userId}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`broadcastSkillUpdate failed for skill=${skillId}: ${(err as Error).message}`);
    }
  }

  /**
   * 获取待审批的 Skill 列表
   */
  async getPendingSkills(page = 1, limit = 20): Promise<{ items: PendingSkill[]; total: number }> {
    const [items, total] = await this.skillRepository.findAndCount({
      where: { status: SkillStatus.DRAFT }, // DRAFT 作为待审批状态
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map(skill => ({
        id: skill.id,
        name: skill.name,
        displayName: skill.displayName || skill.name,
        description: skill.description,
        source: skill.source,
        category: skill.category,
        layer: skill.layer,
        authorInfo: skill.authorInfo,
        pricing: skill.pricing,
        createdAt: skill.createdAt,
        status: skill.status,
      })),
      total,
    };
  }

  /**
   * 批量审批通过
   */
  async approveSkills(skillIds: string[], publishImmediately = false): Promise<ApprovalResult> {
    const result: ApprovalResult = {
      approved: [],
      rejected: [],
      errors: [],
    };

    for (const id of skillIds) {
      try {
        const skill = await this.skillRepository.findOne({ where: { id } });
        if (!skill) {
          result.errors.push(`Skill ${id} not found`);
          continue;
        }

        skill.status = publishImmediately ? SkillStatus.PUBLISHED : SkillStatus.PUBLISHED;
        skill.updatedAt = new Date();
        await this.skillRepository.save(skill);

        // 更新外部映射状态
        await this.externalMappingRepository.update(
          { agentrixSkillId: id },
          { syncStatus: SyncStatus.ACTIVE }
        );

        result.approved.push(id);
        this.logger.log(`Skill ${id} approved`);
      } catch (error) {
        result.errors.push(`Failed to approve ${id}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * 批量拒绝
   */
  async rejectSkills(skillIds: string[], reason?: string): Promise<ApprovalResult> {
    const result: ApprovalResult = {
      approved: [],
      rejected: [],
      errors: [],
    };

    for (const id of skillIds) {
      try {
        const skill = await this.skillRepository.findOne({ where: { id } });
        if (!skill) {
          result.errors.push(`Skill ${id} not found`);
          continue;
        }

        skill.status = SkillStatus.DEPRECATED;
        skill.metadata = {
          ...skill.metadata,
          rejectionReason: reason,
          rejectedAt: new Date().toISOString(),
        };
        await this.skillRepository.save(skill);

        // 更新外部映射状态
        await this.externalMappingRepository.update(
          { agentrixSkillId: id },
          { syncStatus: SyncStatus.PAUSED }
        );

        result.rejected.push(id);
        this.logger.log(`Skill ${id} rejected: ${reason}`);
      } catch (error) {
        result.errors.push(`Failed to reject ${id}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * 批量上架到市场
   */
  async publishSkills(skillIds: string[]): Promise<ApprovalResult> {
    const result: ApprovalResult = {
      approved: [],
      rejected: [],
      errors: [],
    };

    for (const id of skillIds) {
      try {
        await this.skillRepository.update(id, {
          status: SkillStatus.PUBLISHED,
          updatedAt: new Date(),
        });
        result.approved.push(id);

        // P-9 Companion Redesign — broadcast to already-installed users
        const skill = await this.skillRepository.findOne({ where: { id } });
        if (skill) {
          await this.broadcastSkillUpdate(
            id,
            (skill.metadata as any)?.version ?? `v${Date.now()}`,
            (skill.metadata as any)?.introducesNewPermissions === true,
            (skill.metadata as any)?.newPermissions,
            (skill.metadata as any)?.changelogSummary ?? null,
          );
        }
      } catch (error) {
        result.errors.push(`Failed to publish ${id}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * 手动触发生态扫描导入
   */
  async scanAndImport(): Promise<ScanResult> {
    const result: ScanResult = {
      scannedAt: new Date(),
      newSkills: 0,
      updatedSkills: 0,
      sources: {
        mcp: 0,
        chatgpt: 0,
        openapi: 0,
        x402: 0,
        ucp: 0,
      },
    };

    try {
      // 导入 Claude MCP (设为 draft 待审批)
      const mcpResult = await this.ecosystemImporter.importFromClaudeMCP();
      result.sources.mcp = mcpResult.imported || 0;
      result.newSkills += mcpResult.imported || 0;

      // 将新导入的设为 draft
      if (mcpResult.skills && mcpResult.skills.length > 0) {
        await this.skillRepository.update(
          { id: In(mcpResult.skills.map(s => s.id)) },
          { status: SkillStatus.DRAFT }
        );
      }

      // 导入 ChatGPT Actions
      const gptResult = await this.ecosystemImporter.importFromChatGPTActions();
      result.sources.chatgpt = gptResult.imported || 0;
      result.newSkills += gptResult.imported || 0;

      // 将新导入的设为 draft
      if (gptResult.skills && gptResult.skills.length > 0) {
        await this.skillRepository.update(
          { id: In(gptResult.skills.map(s => s.id)) },
          { status: SkillStatus.DRAFT }
        );
      }

      // V2.1: 导入 X402 服务
      try {
        const x402Result = await this.ecosystemImporter.importFromX402Services();
        result.sources.x402 = x402Result.imported || 0;
        result.newSkills += x402Result.imported || 0;
      } catch (x402Error) {
        this.logger.warn('X402 import failed:', x402Error.message);
      }

      // V2.1: 导入 UCP 商户商品
      try {
        const ucpResult = await this.ecosystemImporter.importFromUCPMerchants();
        result.sources.ucp = ucpResult.imported || 0;
        result.newSkills += ucpResult.imported || 0;
      } catch (ucpError) {
        this.logger.warn('UCP import failed:', ucpError.message);
      }

      this.logger.log(`Scan completed: ${result.newSkills} new skills imported`);
    } catch (error) {
      this.logger.error('Scan failed:', error);
    }

    return result;
  }

  /**
   * 定时扫描任务 (每天凌晨 3 点)
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledScan() {
    this.logger.log('Starting scheduled ecosystem scan...');
    await this.scanAndImport();
  }

  /**
   * 获取导入统计
   */
  async getImportStats(): Promise<{
    total: number;
    pending: number;
    published: number;
    bySource: Record<string, number>;
    byPlatform: Record<string, number>;
  }> {
    const total = await this.skillRepository.count({
      where: { source: SkillSource.IMPORTED },
    });

    const pending = await this.skillRepository.count({
      where: { source: SkillSource.IMPORTED, status: SkillStatus.DRAFT },
    });

    const published = await this.skillRepository.count({
      where: { source: SkillSource.IMPORTED, status: SkillStatus.PUBLISHED },
    });

    // 按来源统计
    const bySource = await this.skillRepository
      .createQueryBuilder('skill')
      .select('skill.originalPlatform', 'platform')
      .addSelect('COUNT(*)', 'count')
      .where('skill.source = :source', { source: SkillSource.IMPORTED })
      .groupBy('skill.originalPlatform')
      .getRawMany();

    return {
      total,
      pending,
      published,
      bySource: Object.fromEntries(bySource.map(r => [r.platform, parseInt(r.count)])),
      byPlatform: Object.fromEntries(bySource.map(r => [r.platform, parseInt(r.count)])),
    };
  }

  /**
   * 单个 Skill 详情
   */
  async getSkillDetail(id: string): Promise<Skill> {
    const skill = await this.skillRepository.findOne({ where: { id } });
    if (!skill) {
      throw new NotFoundException(`Skill ${id} not found`);
    }
    return skill;
  }

  /**
   * 更新 Skill 定价
   */
  async updatePricing(id: string, pricing: any): Promise<Skill> {
    const skill = await this.getSkillDetail(id);
    skill.pricing = { ...skill.pricing, ...pricing };
    return this.skillRepository.save(skill);
  }

  /**
   * V2.1: 单独扫描 X402 服务
   */
  async scanX402Services(serviceUrls?: string[]): Promise<{
    scannedAt: Date;
    newSkills: number;
    errors: string[];
  }> {
    const result = {
      scannedAt: new Date(),
      newSkills: 0,
      errors: [] as string[],
    };

    try {
      const x402Result = await this.ecosystemImporter.importFromX402Services(serviceUrls);
      result.newSkills = x402Result.imported || 0;
      result.errors = x402Result.errors || [];

      // 设为 draft 待审批
      if (x402Result.skills && x402Result.skills.length > 0) {
        await this.skillRepository.update(
          { id: In(x402Result.skills.map(s => s.id)) },
          { status: SkillStatus.DRAFT }
        );
      }
    } catch (error) {
      result.errors.push(`X402 scan failed: ${error.message}`);
    }

    return result;
  }

  /**
   * V2.1: 单独扫描 UCP 商户
   */
  async scanUCPMerchants(merchantUrls?: string[]): Promise<{
    scannedAt: Date;
    newSkills: number;
    errors: string[];
  }> {
    const result = {
      scannedAt: new Date(),
      newSkills: 0,
      errors: [] as string[],
    };

    try {
      const ucpResult = await this.ecosystemImporter.importFromUCPMerchants(merchantUrls);
      result.newSkills = ucpResult.imported || 0;
      result.errors = ucpResult.errors || [];

      // 设为 draft 待审批
      if (ucpResult.skills && ucpResult.skills.length > 0) {
        await this.skillRepository.update(
          { id: In(ucpResult.skills.map(s => s.id)) },
          { status: SkillStatus.DRAFT }
        );
      }
    } catch (error) {
      result.errors.push(`UCP scan failed: ${error.message}`);
    }

    return result;
  }

  /**
   * V2.1: 单独扫描 MCP 服务器
   */
  async scanMCPServers(serverIds?: string[]): Promise<{
    scannedAt: Date;
    newSkills: number;
    errors: string[];
  }> {
    const result = {
      scannedAt: new Date(),
      newSkills: 0,
      errors: [] as string[],
    };

    try {
      const mcpResult = await this.ecosystemImporter.importFromClaudeMCP(serverIds);
      result.newSkills = mcpResult.imported || 0;
      result.errors = mcpResult.errors || [];

      // 设为 draft 待审批
      if (mcpResult.skills && mcpResult.skills.length > 0) {
        await this.skillRepository.update(
          { id: In(mcpResult.skills.map(s => s.id)) },
          { status: SkillStatus.DRAFT }
        );
      }
    } catch (error) {
      result.errors.push(`MCP scan failed: ${error.message}`);
    }

    return result;
  }
}
