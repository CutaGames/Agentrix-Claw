import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BudgetPool, BudgetPoolStatus, FundingSource } from '../../entities/budget-pool.entity';
import { Milestone, MilestoneStatus, ApprovalType } from '../../entities/milestone.entity';
import { 
  CreateBudgetPoolDto, 
  UpdateBudgetPoolDto, 
  FundBudgetPoolDto,
  CreateMilestoneDto,
  SubmitMilestoneDto,
  ApproveMilestoneDto,
  RejectMilestoneDto,
} from './dto/budget-pool.dto';
import { BlockchainService } from './blockchain.service';

@Injectable()
export class BudgetPoolService {
  constructor(
    @InjectRepository(BudgetPool)
    private readonly budgetPoolRepo: Repository<BudgetPool>,
    @InjectRepository(Milestone)
    private readonly milestoneRepo: Repository<Milestone>,
    private readonly dataSource: DataSource,
    @Optional() private readonly blockchainService?: BlockchainService,
  ) {}

  private readonly logger = new Logger(BudgetPoolService.name);

  /**
   * 安全转换为BigInt — 处理decimal字符串（如 "0.000000"）
   */
  private safeBigInt(value: string | number | null | undefined): bigint {
    if (value == null) return 0n;
    const str = String(value).split('.')[0] || '0';
    return BigInt(str);
  }

  // ===== Budget Pool Operations =====

  /**
   * 创建预算池
   */
  async createPool(userId: string, dto: CreateBudgetPoolDto): Promise<BudgetPool> {
    const pool = this.budgetPoolRepo.create({
      name: dto.name,
      description: dto.description,
      projectId: dto.projectId,
      totalBudget: dto.totalBudget.toString(),
      currency: dto.currency || 'USDC',
      splitPlanId: dto.splitPlanId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      metadata: dto.metadata,
      ownerId: userId,
      status: BudgetPoolStatus.DRAFT,
      fundedAmount: '0',
      reservedAmount: '0',
      releasedAmount: '0',
    });

    return this.budgetPoolRepo.save(pool);
  }

  /**
   * 获取用户的预算池列表
   */
  async findPoolsByUser(userId: string, options?: { status?: BudgetPoolStatus }): Promise<BudgetPool[]> {
    const query = this.budgetPoolRepo.createQueryBuilder('pool')
      .leftJoinAndSelect('pool.splitPlan', 'splitPlan')
      .where('pool.ownerId = :userId', { userId })
      .orderBy('pool.createdAt', 'DESC');

    if (options?.status) {
      query.andWhere('pool.status = :status', { status: options.status });
    }

    return query.getMany();
  }

  /**
   * 获取单个预算池
   */
  async findPoolById(id: string, userId?: string): Promise<BudgetPool> {
    const pool = await this.budgetPoolRepo.findOne({
      where: { id },
      relations: ['splitPlan', 'milestones'],
    });

    if (!pool) {
      throw new NotFoundException(`BudgetPool ${id} not found`);
    }

    if (userId && pool.ownerId !== userId) {
      throw new ForbiddenException('Access denied to this pool');
    }

    return pool;
  }

  /**
   * 更新预算池
   */
  async updatePool(id: string, userId: string, dto: UpdateBudgetPoolDto): Promise<BudgetPool> {
    const pool = await this.findPoolById(id, userId);

    if (pool.status !== BudgetPoolStatus.DRAFT) {
      throw new BadRequestException('Can only update draft pools');
    }

    Object.assign(pool, {
      ...dto,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : pool.expiresAt,
    });

    return this.budgetPoolRepo.save(pool);
  }

  /**
   * 充值预算池
   */
  async fundPool(id: string, userId: string, dto: FundBudgetPoolDto): Promise<BudgetPool> {
    const pool = await this.findPoolById(id, userId);

    if (pool.status === BudgetPoolStatus.CANCELLED || pool.status === BudgetPoolStatus.EXPIRED) {
      throw new BadRequestException('Cannot fund a cancelled or expired pool');
    }

    // 验证资金来源
    if (dto.fundingSource === FundingSource.PAYMENT && !dto.paymentIntentId) {
      throw new BadRequestException('paymentIntentId is required for payment funding');
    }

    if (dto.fundingSource === FundingSource.WALLET && !dto.walletAddress) {
      throw new BadRequestException('walletAddress is required for wallet funding');
    }

    // Verify on-chain transaction if txHash provided
    const txHash = (dto as any).txHash;
    if (txHash && this.blockchainService && this.blockchainService.isAvailable()) {
      const verification = await this.blockchainService.verifyTransaction(txHash);
      if (!verification.success) {
        throw new BadRequestException('On-chain transaction verification failed');
      }
      this.logger.log('On-chain tx verified: ' + txHash);
    }

    const currentFunded = this.safeBigInt(pool.fundedAmount || '0');
    const newFunded = currentFunded + this.safeBigInt(dto.amount);

    pool.fundedAmount = newFunded.toString();
    pool.fundingSource = dto.fundingSource;

    // 更新状态
    if (pool.status === BudgetPoolStatus.DRAFT) {
      pool.status = BudgetPoolStatus.FUNDED;
    }

    // 如果充值达到总预算，激活
    if (newFunded >= this.safeBigInt(pool.totalBudget)) {
      pool.status = BudgetPoolStatus.ACTIVE;
    }

    return this.budgetPoolRepo.save(pool);
  }

  /**
   * 取消预算池
   */
  async cancelPool(id: string, userId: string): Promise<BudgetPool> {
    const pool = await this.findPoolById(id, userId);

    // 检查是否有未完成的里程碑
    const activeMilestones = await this.milestoneRepo.count({
      where: {
        budgetPoolId: id,
        status: MilestoneStatus.IN_PROGRESS,
      },
    });

    if (activeMilestones > 0) {
      throw new BadRequestException('Cannot cancel pool with active milestones');
    }

    pool.status = BudgetPoolStatus.CANCELLED;
    return this.budgetPoolRepo.save(pool);
  }

  // ===== Milestone Operations =====

  /**
   * 创建里程碑
   */
  async createMilestone(userId: string, dto: CreateMilestoneDto): Promise<Milestone> {
    const pool = await this.findPoolById(dto.budgetPoolId, userId);

    // 检查预算是否足够
    const available = this.safeBigInt(pool.fundedAmount) - this.safeBigInt(pool.reservedAmount) - this.safeBigInt(pool.releasedAmount);
    if (available < this.safeBigInt(dto.reservedAmount)) {
      throw new BadRequestException('Insufficient available budget');
    }

    // 使用事务
    return this.dataSource.transaction(async (manager) => {
      // 创建里程碑
      const milestone = manager.create(Milestone, {
        name: dto.name,
        description: dto.description,
        budgetPoolId: dto.budgetPoolId,
        reservedAmount: dto.reservedAmount.toString(),
        releasedAmount: '0',
        participants: dto.participants || [],
        approvalType: dto.approvalType || ApprovalType.MANUAL,
        qualityGate: dto.qualityGate,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        sortOrder: dto.sortOrder || 0,
        metadata: dto.metadata,
        status: MilestoneStatus.PENDING,
      });

      const savedMilestone = await manager.save(Milestone, milestone);

      // 更新预算池预留金额
      const newReserved = this.safeBigInt(pool.reservedAmount) + this.safeBigInt(dto.reservedAmount);
      await manager.update(BudgetPool, pool.id, {
        reservedAmount: newReserved.toString(),
      });

      return savedMilestone;
    });
  }

  /**
   * 获取预算池的里程碑列表
   */
  async findMilestonesByPool(budgetPoolId: string): Promise<Milestone[]> {
    return this.milestoneRepo.find({
      where: { budgetPoolId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * 获取单个里程碑
   */
  async findMilestoneById(id: string): Promise<Milestone> {
    const milestone = await this.milestoneRepo.findOne({
      where: { id },
      relations: ['budgetPool'],
    });

    if (!milestone) {
      throw new NotFoundException(`Milestone ${id} not found`);
    }

    return milestone;
  }

  /**
   * 开始里程碑
   */
  async startMilestone(id: string, userId: string): Promise<Milestone> {
    const milestone = await this.findMilestoneById(id);
    
    // 验证权限
    const pool = await this.findPoolById(milestone.budgetPoolId, userId);

    if (milestone.status !== MilestoneStatus.PENDING) {
      throw new BadRequestException('Milestone is not in pending status');
    }

    milestone.status = MilestoneStatus.IN_PROGRESS;
    return this.milestoneRepo.save(milestone);
  }

  /**
   * 提交里程碑
   */
  async submitMilestone(id: string, dto: SubmitMilestoneDto): Promise<Milestone> {
    const milestone = await this.findMilestoneById(id);

    if (milestone.status !== MilestoneStatus.IN_PROGRESS) {
      throw new BadRequestException('Milestone is not in progress');
    }

    milestone.artifacts = dto.artifacts;
    milestone.status = MilestoneStatus.PENDING_REVIEW;

    if (dto.note) {
      milestone.metadata = { ...milestone.metadata, submitNote: dto.note };
    }

    // 如果是自动审批，直接通过
    if (milestone.approvalType === ApprovalType.AUTO) {
      milestone.status = MilestoneStatus.APPROVED;
      milestone.reviewedAt = new Date();
    }

    return this.milestoneRepo.save(milestone);
  }

  /**
   * 审批里程碑
   */
  async approveMilestone(id: string, userId: string, dto: ApproveMilestoneDto): Promise<Milestone> {
    const milestone = await this.findMilestoneById(id);
    const pool = await this.findPoolById(milestone.budgetPoolId, userId);

    if (milestone.status !== MilestoneStatus.PENDING_REVIEW) {
      throw new BadRequestException('Milestone is not pending review');
    }

    // 如果有质量门槛，验证
    if (milestone.approvalType === ApprovalType.QUALITY_GATE && milestone.qualityGate) {
      const score = dto.qualityScore;
      if (score === undefined) {
        throw new BadRequestException('Quality score is required for quality gate approval');
      }

      const { threshold, operator } = milestone.qualityGate;
      let passed = false;

      switch (operator) {
        case '>=': passed = score >= threshold; break;
        case '>': passed = score > threshold; break;
        case '=': passed = score === threshold; break;
        case '<': passed = score < threshold; break;
        case '<=': passed = score <= threshold; break;
      }

      if (!passed) {
        throw new BadRequestException(`Quality gate not met: score ${score} ${operator} ${threshold}`);
      }
    }

    milestone.status = MilestoneStatus.APPROVED;
    milestone.reviewedById = userId;
    milestone.reviewedAt = new Date();
    milestone.reviewNote = dto.reviewNote;

    return this.milestoneRepo.save(milestone);
  }

  /**
   * 拒绝里程碑
   */
  async rejectMilestone(id: string, userId: string, dto: RejectMilestoneDto): Promise<Milestone> {
    const milestone = await this.findMilestoneById(id);
    const pool = await this.findPoolById(milestone.budgetPoolId, userId);

    if (milestone.status !== MilestoneStatus.PENDING_REVIEW) {
      throw new BadRequestException('Milestone is not pending review');
    }

    milestone.status = MilestoneStatus.REJECTED;
    milestone.reviewedById = userId;
    milestone.reviewedAt = new Date();
    milestone.reviewNote = dto.reviewNote || dto.reason;
    milestone.metadata = { ...milestone.metadata, rejectReason: dto.reason };

    return this.milestoneRepo.save(milestone);
  }

  /**
   * 释放里程碑资金
   */
  async releaseMilestone(id: string, userId: string): Promise<Milestone> {
    const milestone = await this.findMilestoneById(id);
    const pool = await this.findPoolById(milestone.budgetPoolId, userId);

    if (milestone.status !== MilestoneStatus.APPROVED) {
      throw new BadRequestException('Milestone is not approved');
    }

    return this.dataSource.transaction(async (manager) => {
      // 更新里程碑
      milestone.status = MilestoneStatus.RELEASED;
      milestone.releasedAmount = milestone.reservedAmount;
      milestone.releasedAt = new Date();
      await manager.save(Milestone, milestone);

      // 更新预算池
      const reservedDelta = this.safeBigInt(milestone.reservedAmount);
      const newReserved = this.safeBigInt(pool.reservedAmount) - reservedDelta;
      const newReleased = this.safeBigInt(pool.releasedAmount) + reservedDelta;

      await manager.update(BudgetPool, pool.id, {
        reservedAmount: newReserved.toString(),
        releasedAmount: newReleased.toString(),
      });

      // Call on-chain contract to release funds
      if (this.blockchainService && this.blockchainService.isAvailable() && (milestone as any).onchainMilestoneId != null) {
        try {
          const releaseTxHash = await this.blockchainService.releaseMilestoneFundsOnChain((milestone as any).onchainMilestoneId);
          milestone.metadata = { ...milestone.metadata, releaseTxHash };
          await manager.save(Milestone, milestone);
          this.logger.log('On-chain funds released: tx=' + releaseTxHash);
        } catch (error) {
          this.logger.error('On-chain fund release failed: ' + error.message);
        }
      }

      return milestone;
    });
  }

  /**
   * 获取预算池统计
   */
  async getPoolStats(id: string, userId: string): Promise<{
    totalBudget: string;
    funded: string;
    reserved: string;
    released: string;
    available: string;
    milestoneCount: number;
    completedMilestones: number;
  }> {
    const pool = await this.findPoolById(id, userId);

    const [milestoneCount, completedMilestones] = await Promise.all([
      this.milestoneRepo.count({ where: { budgetPoolId: id } }),
      this.milestoneRepo.count({ where: { budgetPoolId: id, status: MilestoneStatus.RELEASED } }),
    ]);

    return {
      totalBudget: pool.totalBudget,
      funded: pool.fundedAmount,
      reserved: pool.reservedAmount,
      released: pool.releasedAmount,
      available: pool.availableAmount,
      milestoneCount,
      completedMilestones,
    };
  }
}
