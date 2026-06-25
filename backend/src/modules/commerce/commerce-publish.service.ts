/**
 * Commerce Publish Service
 * 
 * Bridges Commerce Skill → Unified Marketplace publishing flow.
 * Integrates: payment, split plan, budget pool, fiat exchange, and marketplace listing.
 */

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Skill, SkillStatus, SkillPricingType, SkillSource, SkillCategory, SkillLayer } from '../../entities/skill.entity';
import { SplitPlanService } from './split-plan.service';
import { BudgetPoolService } from './budget-pool.service';
import { SplitPlan, SplitPlanStatus } from '../../entities/split-plan.entity';
import { CommercePublishDto } from './dto/commerce-publish.dto';

export interface CommercePublishResult {
  success: boolean;
  skill: Skill;
  splitPlan?: SplitPlan;
  budgetPoolId?: string;
  marketplaceListingId?: string;
  publishedAt: string;
  endpoints: {
    marketplace: string;
    execute: string;
    analytics: string;
    splitPlanPreview?: string;
  };
}

@Injectable()
export class CommercePublishService {
  private readonly logger = new Logger(CommercePublishService.name);

  constructor(
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
    private readonly splitPlanService: SplitPlanService,
    private readonly budgetPoolService: BudgetPoolService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Publish a Commerce Skill to the Unified Marketplace
   * 
   * This is the single entry point that orchestrates:
   * 1. Skill creation/validation
   * 2. Split plan setup
   * 3. Budget pool creation (if needed)
   * 4. Marketplace listing
   * 5. Protocol activation (UCP/X402)
   */
  async publishCommerceSkill(
    userId: string,
    dto: CommercePublishDto,
  ): Promise<CommercePublishResult> {
    this.logger.log(`Publishing commerce skill for user ${userId}: ${dto.name}`);

    // Use a transaction to ensure atomicity
    return this.dataSource.transaction(async (manager) => {
      // 1. Get or create the Skill
      let skill: Skill;
      if (dto.skillId) {
        skill = await this.skillRepository.findOne({ where: { id: dto.skillId } });
        if (!skill) {
          throw new NotFoundException(`Skill ${dto.skillId} not found`);
        }
        if (skill.authorId && skill.authorId !== userId) {
          throw new BadRequestException('You are not the author of this skill');
        }
      } else {
        // Create new skill
        if (!dto.name || !dto.description) {
          throw new BadRequestException('name and description are required to create a new skill');
        }
        skill = manager.create(Skill, {
          name: dto.name,
          displayName: dto.displayName || dto.name,
          description: dto.description,
          category: (dto.category as SkillCategory) || SkillCategory.COMMERCE,
          version: dto.version || '1.0.0',
          tags: dto.tags || [],
          executor: (dto.executor as any) || { type: 'internal', internalHandler: 'commerce_execute' },
          inputSchema: dto.inputSchema || { type: 'object', properties: {}, required: [] },
          outputSchema: dto.outputSchema,
          source: SkillSource.NATIVE,
          layer: SkillLayer.LOGIC,
          authorId: userId,
          status: SkillStatus.DRAFT,
          callCount: 0,
          rating: 0,
        });
        skill = await manager.save(Skill, skill);
        this.logger.log(`Created new skill: ${skill.id}`);
      }

      // 2. Set up pricing
      skill.pricing = {
        type: dto.pricing.type as SkillPricingType,
        pricePerCall: dto.pricing.pricePerCall,
        currency: dto.pricing.currency || 'USD',
        freeQuota: dto.pricing.freeQuota,
        commissionRate: dto.pricing.commissionRate,
      };

      // 3. Set up split plan
      let splitPlan: SplitPlan | undefined;
      if (dto.splitPlan) {
        if (dto.splitPlan.splitPlanId) {
          // Reference existing plan
          splitPlan = await this.splitPlanService.findById(dto.splitPlan.splitPlanId, userId);
          skill.metadata = {
            ...skill.metadata,
            splitPlanId: splitPlan.id,
          };
        } else if (dto.splitPlan.rules && dto.splitPlan.rules.length > 0) {
          // Create new split plan
          splitPlan = await this.splitPlanService.create(userId, {
            name: dto.splitPlan.name || `${dto.name} Split Plan`,
            productType: (dto.splitPlan.productType || 'skill') as 'skill' | 'physical' | 'service' | 'virtual' | 'nft' | 'agent_task',
            rules: dto.splitPlan.rules.map(r => ({
              recipient: r.recipient,
              shareBps: r.shareBps,
              role: r.role as any,
              source: 'pool' as any,
              active: true,
            })),
            feeConfig: dto.splitPlan.feeConfig ? {
              onrampFeeBps: dto.splitPlan.feeConfig.onrampFeeBps ?? 10,
              offrampFeeBps: dto.splitPlan.feeConfig.offrampFeeBps ?? 10,
              splitFeeBps: dto.splitPlan.feeConfig.splitFeeBps ?? 30,
              minSplitFee: dto.splitPlan.feeConfig.minSplitFee ?? 100000,
            } : undefined,
          });

          // Activate the plan
          if (splitPlan.status === SplitPlanStatus.DRAFT) {
            splitPlan = await this.splitPlanService.activate(splitPlan.id, userId);
          }

          skill.metadata = {
            ...skill.metadata,
            splitPlanId: splitPlan.id,
          };
          this.logger.log(`Created and activated split plan: ${splitPlan.id}`);
        }
      }

      // 4. Set up budget pool (for project-type skills)
      let budgetPoolId: string | undefined;
      if (dto.budgetPool && dto.budgetPool.totalBudget > 0) {
        const pool = await this.budgetPoolService.createPool(userId, {
          name: `${dto.name} Budget Pool`,
          totalBudget: dto.budgetPool.totalBudget,
          currency: dto.budgetPool.currency || 'USDC',
          splitPlanId: splitPlan?.id,
          expiresAt: dto.budgetPool.deadline,
        });
        budgetPoolId = pool.id;

        // Create milestones if provided
        if (dto.budgetPool.milestones) {
          for (const ms of dto.budgetPool.milestones) {
            await this.budgetPoolService.createMilestone(userId, {
              budgetPoolId: pool.id,
              name: ms.name,
              description: ms.description,
              reservedAmount: ms.reservedAmount,
            });
          }
        }

        skill.metadata = {
          ...skill.metadata,
          budgetPoolId: pool.id,
        };
        this.logger.log(`Created budget pool: ${pool.id}`);
      }

      // 5. Activate protocols
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
      
      if (dto.ucpEnabled !== false) {
        skill.ucpEnabled = true;
        skill.ucpCheckoutEndpoint = `${baseUrl}/ucp/v1/checkout-sessions`;
      }

      if (dto.x402Enabled !== false && dto.pricing.type !== 'free') {
        skill.x402Enabled = true;
        skill.x402ServiceEndpoint = `${baseUrl}/.well-known/x402`;
      }

      // 6. Set marketplace visibility
      if (dto.marketplace) {
        skill.humanAccessible = dto.marketplace.humanAccessible ?? true;
        skill.metadata = {
          ...skill.metadata,
          marketplace: {
            featured: dto.marketplace.featured ?? false,
            targetPlatforms: dto.marketplace.targetPlatforms || ['agentrix', 'claude', 'openai'],
            legacyListing: dto.marketplace.legacyListing ?? false,
            listings: {
              unifiedMarketplace: true,
            },
          },
        };
      }

      // 7. Publish - set status to PUBLISHED
      skill.status = SkillStatus.PUBLISHED;

      // Save the skill
      skill = await manager.save(Skill, skill);
      this.logger.log(`Skill published to marketplace: ${skill.id}`);

      return {
        success: true,
        skill,
        splitPlan,
        budgetPoolId,
        marketplaceListingId: skill.id, // In unified marketplace, skill IS the listing
        publishedAt: new Date().toISOString(),
        endpoints: {
          marketplace: `/api/unified-marketplace/skills/${skill.id}`,
          execute: `/api/unified-marketplace/execute`,
          analytics: `/api/unified-marketplace/skills/${skill.id}/analytics`,
          splitPlanPreview: splitPlan ? `/api/commerce/split-plans/preview` : undefined,
        },
      };
    });
  }

  /**
   * Unpublish a skill (revert to draft)
   */
  async unpublishSkill(userId: string, skillId: string): Promise<Skill> {
    const skill = await this.skillRepository.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} not found`);
    }
    if (skill.authorId && skill.authorId !== userId) {
      throw new BadRequestException('You are not the author of this skill');
    }

    skill.status = SkillStatus.DRAFT;
    return this.skillRepository.save(skill);
  }

  /**
   * Get publish preview - shows what will happen when publishing
   */
  async getPublishPreview(
    userId: string,
    dto: CommercePublishDto,
  ): Promise<{
    skill: Partial<Skill>;
    feeBreakdown: any;
    marketplaceVisibility: any;
    protocols: string[];
  }> {
    const protocols: string[] = ['agentrix'];
    if (dto.ucpEnabled !== false) protocols.push('ucp');
    if (dto.x402Enabled !== false && dto.pricing.type !== 'free') protocols.push('x402');

    // Calculate fee breakdown if split plan is provided
    let feeBreakdown = null;
    if (dto.splitPlan && dto.pricing.pricePerCall) {
      const feeConfig = dto.splitPlan.feeConfig || {
        onrampFeeBps: 10,
        offrampFeeBps: 10,
        splitFeeBps: 30,
        minSplitFee: 100000,
      };
      
      const amount = dto.pricing.pricePerCall * 1000000; // Convert to micro units
      const splitFee = Math.max(
        Math.floor(amount * (feeConfig.splitFeeBps || 30) / 10000),
        feeConfig.minSplitFee || 100000,
      );
      
      feeBreakdown = {
        perCallAmount: dto.pricing.pricePerCall,
        currency: dto.pricing.currency || 'USD',
        platformFee: `${(feeConfig.splitFeeBps || 30) / 100}%`,
        onrampFee: `${(feeConfig.onrampFeeBps || 10) / 100}%`,
        offrampFee: `${(feeConfig.offrampFeeBps || 10) / 100}%`,
        estimatedSplitFee: splitFee / 1000000,
        rules: dto.splitPlan.rules || [],
      };
    }

    return {
      skill: {
        name: dto.name,
        displayName: dto.displayName || dto.name,
        description: dto.description,
        category: (dto.category as SkillCategory) || SkillCategory.COMMERCE,
        pricing: {
          type: dto.pricing.type as SkillPricingType,
          pricePerCall: dto.pricing.pricePerCall,
          currency: dto.pricing.currency || 'USD',
        },
      },
      feeBreakdown,
      marketplaceVisibility: {
        unifiedMarketplace: true,
        humanAccessible: dto.marketplace?.humanAccessible ?? true,
        platforms: dto.marketplace?.targetPlatforms || ['agentrix'],
      },
      protocols,
    };
  }

  /**
   * Get user's published commerce skills
   */
  async getMyPublishedSkills(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: Skill[]; total: number; page: number; limit: number }> {
    const [items, total] = await this.skillRepository.findAndCount({
      where: { 
        authorId: userId,
        status: SkillStatus.PUBLISHED,
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }
}
