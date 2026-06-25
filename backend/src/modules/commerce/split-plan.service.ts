import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SplitPlan, SplitPlanStatus, SplitRule, FeeConfig, SplitSource } from '../../entities/split-plan.entity';
import { CreateSplitPlanDto, UpdateSplitPlanDto, PreviewAllocationDto, AllocationPreviewResult } from './dto/split-plan.dto';

/**
 * 默认商品类型模板配置
 */
const DEFAULT_TEMPLATES: Record<string, { rules: SplitRule[]; feeConfig: FeeConfig }> = {
  physical: {
    rules: [
      { recipient: '', shareBps: 7000, role: 'executor', source: SplitSource.POOL, active: true },
      { recipient: '', shareBps: 3000, role: 'referrer', source: SplitSource.POOL, active: true },
    ],
    feeConfig: { onrampFeeBps: 10, offrampFeeBps: 10, splitFeeBps: 30, minSplitFee: 100000 },
  },
  service: {
    rules: [
      { recipient: '', shareBps: 8000, role: 'executor', source: SplitSource.POOL, active: true },
      { recipient: '', shareBps: 2000, role: 'referrer', source: SplitSource.POOL, active: true },
    ],
    feeConfig: { onrampFeeBps: 10, offrampFeeBps: 10, splitFeeBps: 30, minSplitFee: 100000 },
  },
  virtual: {
    rules: [
      { recipient: '', shareBps: 7000, role: 'executor', source: SplitSource.POOL, active: true },
      { recipient: '', shareBps: 3000, role: 'referrer', source: SplitSource.POOL, active: true },
    ],
    feeConfig: { onrampFeeBps: 10, offrampFeeBps: 10, splitFeeBps: 30, minSplitFee: 100000 },
  },
  nft: {
    rules: [
      { recipient: '', shareBps: 8500, role: 'executor', source: SplitSource.POOL, customRoleName: 'creator', active: true },
      { recipient: '', shareBps: 1500, role: 'promoter', source: SplitSource.PLATFORM, customRoleName: 'royalty', active: true },
    ],
    feeConfig: { onrampFeeBps: 10, offrampFeeBps: 10, splitFeeBps: 30, minSplitFee: 100000 },
  },
  skill: {
    rules: [
      { recipient: '', shareBps: 7000, role: 'executor', source: SplitSource.POOL, customRoleName: 'developer', active: true },
      { recipient: '', shareBps: 3000, role: 'referrer', source: SplitSource.POOL, active: true },
    ],
    feeConfig: { onrampFeeBps: 10, offrampFeeBps: 10, splitFeeBps: 30, minSplitFee: 100000 },
  },
  agent_task: {
    rules: [], // 必须自定义
    feeConfig: { onrampFeeBps: 10, offrampFeeBps: 10, splitFeeBps: 30, minSplitFee: 100000 },
  },
};

@Injectable()
export class SplitPlanService {
  constructor(
    @InjectRepository(SplitPlan)
    private readonly splitPlanRepo: Repository<SplitPlan>,
  ) {}

  /**
   * 创建分佣计划
   */
  async create(userId: string, dto: CreateSplitPlanDto): Promise<SplitPlan> {
    const template = DEFAULT_TEMPLATES[dto.productType] || DEFAULT_TEMPLATES.service;
    
    const plan = this.splitPlanRepo.create({
      name: dto.name,
      description: dto.description,
      productType: dto.productType,
      rules: dto.rules || template.rules,
      feeConfig: dto.feeConfig || template.feeConfig,
      tiers: dto.tiers,
      caps: dto.caps,
      metadata: dto.metadata,
      ownerId: userId,
      status: SplitPlanStatus.DRAFT,
      version: 1,
    });

    return this.splitPlanRepo.save(plan);
  }

  /**
   * 获取用户的分佣计划列表
   */
  async findByUser(userId: string, options?: { status?: SplitPlanStatus; productType?: string }): Promise<SplitPlan[]> {
    const query = this.splitPlanRepo.createQueryBuilder('plan')
      .where('plan.ownerId = :userId OR plan.isSystemTemplate = true', { userId })
      .orderBy('plan.createdAt', 'DESC');

    if (options?.status) {
      query.andWhere('plan.status = :status', { status: options.status });
    }

    if (options?.productType) {
      query.andWhere('plan.productType = :productType', { productType: options.productType });
    }

    return query.getMany();
  }

  /**
   * 获取单个分佣计划
   */
  async findById(id: string, userId?: string): Promise<SplitPlan> {
    const plan = await this.splitPlanRepo.findOne({ where: { id } });
    
    if (!plan) {
      throw new NotFoundException(`SplitPlan ${id} not found`);
    }

    // 检查访问权限
    if (userId && plan.ownerId !== userId && !plan.isSystemTemplate) {
      throw new ForbiddenException('Access denied to this plan');
    }

    return plan;
  }

  /**
   * 更新分佣计划
   */
  async update(id: string, userId: string, dto: UpdateSplitPlanDto): Promise<SplitPlan> {
    const plan = await this.findById(id, userId);

    if (plan.isSystemTemplate) {
      throw new ForbiddenException('Cannot modify system template');
    }

    // 如果修改了规则或费率，增加版本号
    if (dto.rules || dto.feeConfig || dto.tiers || dto.caps) {
      plan.version += 1;
    }

    Object.assign(plan, dto);
    return this.splitPlanRepo.save(plan);
  }

  /**
   * 激活分佣计划
   */
  async activate(id: string, userId: string): Promise<SplitPlan> {
    const plan = await this.findById(id, userId);

    if (plan.status === SplitPlanStatus.ACTIVE) {
      return plan;
    }

    // 验证规则完整性
    if (!plan.rules || plan.rules.length === 0) {
      throw new BadRequestException('Cannot activate plan without rules');
    }

    const totalShare = plan.rules.filter(r => r.active).reduce((sum, r) => sum + r.shareBps, 0);
    if (totalShare > 10000) {
      throw new BadRequestException('Total share cannot exceed 100%');
    }

    plan.status = SplitPlanStatus.ACTIVE;
    return this.splitPlanRepo.save(plan);
  }

  /**
   * 归档分佣计划
   */
  async archive(id: string, userId: string): Promise<SplitPlan> {
    const plan = await this.findById(id, userId);
    plan.status = SplitPlanStatus.ARCHIVED;
    return this.splitPlanRepo.save(plan);
  }

  /**
   * 删除分佣计划 (软删除 - 改为归档)
   */
  async remove(id: string, userId: string): Promise<void> {
    const plan = await this.findById(id, userId);
    
    if (plan.usageCount > 0) {
      // 有使用记录的计划只能归档，不能删除
      await this.archive(id, userId);
    } else {
      await this.splitPlanRepo.remove(plan);
    }
  }

  /**
   * 获取商品类型的默认模板
   */
  async getDefaultTemplate(productType: string): Promise<SplitPlan | null> {
    // 先查找系统模板
    const systemTemplate = await this.splitPlanRepo.findOne({
      where: { productType: productType as any, isSystemTemplate: true, status: SplitPlanStatus.ACTIVE },
    });

    if (systemTemplate) {
      return systemTemplate;
    }

    // 返回内置配置
    const template = DEFAULT_TEMPLATES[productType];
    if (template) {
      return {
        id: `default_${productType}`,
        name: `Default ${productType} template`,
        productType: productType as any,
        rules: template.rules,
        feeConfig: template.feeConfig,
        version: 1,
        status: SplitPlanStatus.ACTIVE,
        isSystemTemplate: true,
      } as SplitPlan;
    }

    return null;
  }

  /**
   * 预览分配结果
   */
  async previewAllocation(dto: PreviewAllocationDto): Promise<AllocationPreviewResult> {
    const { amount, currency, usesOnramp = false, usesOfframp = false, usesSplit = true } = dto;

    // 获取分佣计划
    let plan: SplitPlan | null = null;
    if (dto.splitPlanId) {
      plan = await this.splitPlanRepo.findOne({ where: { id: dto.splitPlanId } });
    } else if (dto.productType) {
      plan = await this.getDefaultTemplate(dto.productType);
    }

    const feeConfig = plan?.feeConfig || DEFAULT_TEMPLATES.service.feeConfig;
    const rules = plan?.rules || [];

    // 计算费用
    let onrampFee = 0;
    let offrampFee = 0;
    let splitFee = 0;

    if (usesOnramp) {
      onrampFee = Math.floor(amount * feeConfig.onrampFeeBps / 10000);
    }

    if (usesOfframp) {
      offrampFee = Math.floor(amount * feeConfig.offrampFeeBps / 10000);
    }

    if (usesSplit && rules.length > 0) {
      const calculatedSplitFee = Math.floor(amount * feeConfig.splitFeeBps / 10000);
      splitFee = Math.max(calculatedSplitFee, feeConfig.minSplitFee);
    }

    const totalFees = onrampFee + offrampFee + splitFee;
    const netAmount = amount - totalFees;

    // 计算分配
    const allocations: AllocationPreviewResult['allocations'] = [];
    const poolAmount = usesSplit ? Math.floor(netAmount * 0.03) : 0; // 假设池子费率 3%

    for (const rule of rules.filter(r => r.active)) {
      const baseAmount = rule.source === SplitSource.POOL ? poolAmount : 
                        rule.source === SplitSource.PLATFORM ? splitFee :
                        netAmount;
      const allocationAmount = Math.floor(baseAmount * rule.shareBps / 10000);
      
      allocations.push({
        recipient: dto.participantOverrides?.[rule.role] || rule.recipient || `${rule.role}_address`,
        role: rule.customRoleName || rule.role,
        amount: allocationAmount,
        percentage: rule.shareBps / 100,
        source: rule.source,
      });
    }

    const merchantNet = netAmount - allocations.reduce((sum, a) => sum + a.amount, 0);

    return {
      grossAmount: amount,
      currency,
      fees: {
        onrampFee,
        offrampFee,
        splitFee,
        totalFees,
      },
      allocations,
      merchantNet,
      rateBreakdown: {
        onrampRate: `${feeConfig.onrampFeeBps / 100}%`,
        offrampRate: `${feeConfig.offrampFeeBps / 100}%`,
        splitRate: `${feeConfig.splitFeeBps / 100}% (min ${feeConfig.minSplitFee / 1000000} USDC)`,
      },
    };
  }

  /**
   * 增加使用计数
   */
  async incrementUsage(id: string): Promise<void> {
    await this.splitPlanRepo.increment({ id }, 'usageCount', 1);
  }
}
