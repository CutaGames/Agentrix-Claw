/**
 * Task Marketplace Service
 * 
 * 公开任务市场服务 - 支持任务发布、浏览、搜索、竞标
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { MerchantTask, TaskStatus, TaskType, TaskVisibility } from '../../entities/merchant-task.entity';
import { TaskBid, BidStatus } from '../../entities/task-bid.entity';

export interface PublishTaskDto {
  type: TaskType;
  title: string;
  description: string;
  budget: number;
  currency?: string;
  tags?: string[];
  requirements?: {
    deadline?: Date;
    deliverables?: string[];
    specifications?: Record<string, any>;
  };
  visibility?: TaskVisibility;
  agentId?: string;
}

export interface SearchTasksParams {
  query?: string;
  type?: TaskType[];
  budgetMin?: number;
  budgetMax?: number;
  tags?: string[];
  status?: TaskStatus;
  visibility?: TaskVisibility;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'budget' | 'deadline';
  sortOrder?: 'ASC' | 'DESC';
}

export interface CreateBidDto {
  proposedBudget: number;
  currency?: string;
  estimatedDays: number;
  proposal: string;
  portfolio?: {
    samples?: string[];
    certifications?: string[];
    previousWork?: Array<{
      title: string;
      description: string;
      link?: string;
    }>;
  };
  metadata?: {
    skills?: string[];
    rating?: number;
    completionRate?: number;
  };
}

@Injectable()
export class TaskMarketplaceService {
  private readonly logger = new Logger(TaskMarketplaceService.name);

  constructor(
    @InjectRepository(MerchantTask)
    private taskRepository: Repository<MerchantTask>,
    @InjectRepository(TaskBid)
    private bidRepository: Repository<TaskBid>,
  ) {}

  /**
   * 发布公开任务
   */
  async publishTask(userId: string, dto: PublishTaskDto): Promise<MerchantTask> {
    const task = this.taskRepository.create({
      userId,
      merchantId: userId, // 发布者同时是任务发起商户
      type: dto.type,
      title: dto.title,
      description: dto.description,
      budget: dto.budget,
      currency: dto.currency || 'USD',
      tags: dto.tags || [],
      requirements: dto.requirements,
      visibility: (dto.visibility?.toLowerCase() as TaskVisibility) || TaskVisibility.PUBLIC,
      agentId: dto.agentId,
      status: TaskStatus.PENDING,
      progress: {
        currentStep: 'pending',
        completedSteps: [],
        percentage: 0,
        updates: [],
      },
    });

    const savedTask = await this.taskRepository.save(task);
    this.logger.log(`Published task: ${savedTask.id} by user ${userId}`);

    return savedTask;
  }

  /**
   * 搜索公开任务
   */
  async searchTasks(params: SearchTasksParams): Promise<{
    items: MerchantTask[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    const queryBuilder = this.taskRepository.createQueryBuilder('task');

    // 默认只显示公开任务
    queryBuilder.andWhere('task.visibility = :visibility', { 
      visibility: params.visibility || TaskVisibility.PUBLIC 
    });

    // 搜索关键词
    if (params.query) {
      queryBuilder.andWhere(
        new Brackets(qb => {
          qb.where('task.title ILIKE :query', { query: `%${params.query}%` })
            .orWhere('task.description ILIKE :query', { query: `%${params.query}%` });
        })
      );
    }

    // 任务类型过滤
    if (params.type && params.type.length > 0) {
      queryBuilder.andWhere('task.type IN (:...types)', { types: params.type });
    }

    // 预算范围
    if (params.budgetMin !== undefined) {
      queryBuilder.andWhere('task.budget >= :budgetMin', { budgetMin: params.budgetMin });
    }
    if (params.budgetMax !== undefined) {
      queryBuilder.andWhere('task.budget <= :budgetMax', { budgetMax: params.budgetMax });
    }

    // 标签过滤 (tags stored as simple-array / comma-separated string)
    if (params.tags && params.tags.length > 0) {
      const tagConditions = params.tags.map((tag, i) => `task.tags ILIKE :tag${i}`);
      const tagParams: Record<string, string> = {};
      params.tags.forEach((tag, i) => { tagParams[`tag${i}`] = `%${tag}%`; });
      queryBuilder.andWhere(
        new Brackets(qb => {
          tagConditions.forEach((cond, i) => {
            if (i === 0) qb.where(cond, { [`tag${i}`]: tagParams[`tag${i}`] });
            else qb.orWhere(cond, { [`tag${i}`]: tagParams[`tag${i}`] });
          });
        })
      );
    }

    // 状态过滤
    if (params.status) {
      queryBuilder.andWhere('task.status = :status', { status: params.status });
    }

    // 排序
    const sortBy = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder || 'DESC';
    queryBuilder.orderBy(`task.${sortBy}`, sortOrder);

    // 分页
    const [items, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * 获取任务详情
   */
  async getTask(taskId: string): Promise<MerchantTask> {
    const task = await this.taskRepository.findOne({ 
      where: { id: taskId },
      relations: ['user', 'merchant'],
    });

    if (!task) {
      throw new NotFoundException(`Task not found: ${taskId}`);
    }

    return task;
  }

  /**
   * 提交竞标
   */
  async submitBid(bidderId: string, taskId: string, dto: CreateBidDto): Promise<TaskBid> {
    const task = await this.getTask(taskId);

    // 检查任务是否接受竞标
    if (task.status !== TaskStatus.PENDING) {
      throw new BadRequestException('Task is not open for bidding');
    }

    if (task.visibility === TaskVisibility.PRIVATE) {
      throw new BadRequestException('Cannot bid on private tasks');
    }

    // 检查是否已经竞标
    const existingBid = await this.bidRepository.findOne({
      where: { taskId, bidderId, status: BidStatus.PENDING },
    });

    if (existingBid) {
      throw new BadRequestException('You have already submitted a bid for this task');
    }

    const bid = this.bidRepository.create({
      taskId,
      bidderId,
      proposedBudget: dto.proposedBudget,
      currency: dto.currency || task.currency,
      estimatedDays: dto.estimatedDays,
      proposal: dto.proposal,
      portfolio: dto.portfolio,
      status: BidStatus.PENDING,
      metadata: dto.metadata,
    });

    const savedBid = await this.bidRepository.save(bid);
    this.logger.log(`Bid submitted: ${savedBid.id} for task ${taskId} by ${bidderId}`);

    return savedBid;
  }

  /**
   * 获取任务的所有竞标
   */
  async getTaskBids(taskId: string, userId?: string): Promise<TaskBid[]> {
    const task = await this.getTask(taskId);

    // 只有任务发布者可以查看所有竞标
    if (userId && task.userId !== userId) {
      throw new BadRequestException('Only task owner can view bids');
    }

    const bids = await this.bidRepository.find({
      where: { taskId },
      relations: ['bidder'],
      order: { createdAt: 'DESC' },
    });

    return bids;
  }

  /**
   * 接受竞标
   */
  async acceptBid(userId: string, bidId: string): Promise<MerchantTask> {
    const bid = await this.bidRepository.findOne({
      where: { id: bidId },
      relations: ['task'],
    });

    if (!bid) {
      throw new NotFoundException(`Bid not found: ${bidId}`);
    }

    const task = bid.task;

    // 验证权限
    if (task.userId !== userId) {
      throw new BadRequestException('Only task owner can accept bids');
    }

    // 验证任务状态
    if (task.status !== TaskStatus.PENDING) {
      throw new BadRequestException('Task is not in pending status');
    }

    // 接受竞标
    bid.status = BidStatus.ACCEPTED;
    bid.respondedAt = new Date();
    await this.bidRepository.save(bid);

    // 更新任务状态和商户
    task.status = TaskStatus.ACCEPTED;
    task.merchantId = bid.bidderId;
    task.budget = bid.proposedBudget; // 使用竞标价格
    const updatedTask = await this.taskRepository.save(task);

    // 拒绝其他竞标
    await this.bidRepository.update(
      { taskId: task.id, status: BidStatus.PENDING },
      { status: BidStatus.REJECTED, respondedAt: new Date() }
    );

    this.logger.log(`Bid ${bidId} accepted for task ${task.id}`);

    return updatedTask;
  }

  /**
   * 拒绝竞标
   */
  async rejectBid(userId: string, bidId: string, reason?: string): Promise<TaskBid> {
    const bid = await this.bidRepository.findOne({
      where: { id: bidId },
      relations: ['task'],
    });

    if (!bid) {
      throw new NotFoundException(`Bid not found: ${bidId}`);
    }

    // 验证权限
    if (bid.task.userId !== userId) {
      throw new BadRequestException('Only task owner can reject bids');
    }

    bid.status = BidStatus.REJECTED;
    bid.respondedAt = new Date();
    if (reason) {
      bid.metadata = { ...bid.metadata, rejectionReason: reason } as any;
    }

    const updated = await this.bidRepository.save(bid);
    this.logger.log(`Bid ${bidId} rejected`);

    return updated;
  }

  /**
   * 获取用户的竞标列表
   */
  async getUserBids(bidderId: string, status?: BidStatus): Promise<TaskBid[]> {
    const where: any = { bidderId };
    if (status) {
      where.status = status;
    }

    const bids = await this.bidRepository.find({
      where,
      relations: ['task'],
      order: { createdAt: 'DESC' },
    });

    return bids;
  }

  /**
   * 获取用户发布的任务
   */
  async getUserTasks(userId: string, status?: TaskStatus): Promise<MerchantTask[]> {
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const tasks = await this.taskRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return tasks;
  }
}
