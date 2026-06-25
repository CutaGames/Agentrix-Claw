import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantTask, TaskStatus, TaskType } from '../../entities/merchant-task.entity';
import { OrderService } from '../order/order.service';
import { NotificationService } from '../notification/notification.service';

export interface CreateTaskDto {
  merchantId: string;
  type: TaskType;
  title: string;
  description: string;
  budget: number;
  currency?: string;
  requirements?: {
    deadline?: Date;
    deliverables?: string[];
    specifications?: Record<string, any>;
  };
  agentId?: string;
}

export interface UpdateTaskProgressDto {
  currentStep?: string;
  message?: string;
  attachments?: string[];
  percentage?: number;
}

@Injectable()
export class MerchantTaskService {
  private readonly logger = new Logger(MerchantTaskService.name);

  constructor(
    @InjectRepository(MerchantTask)
    private taskRepository: Repository<MerchantTask>,
    private orderService: OrderService,
    private notificationService: NotificationService,
  ) {}

  /**
   * 创建任务（Agent→商户协作）
   */
  async createTask(userId: string, dto: CreateTaskDto): Promise<MerchantTask> {
    const task = this.taskRepository.create({
      userId,
      merchantId: dto.merchantId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      budget: dto.budget,
      currency: dto.currency || 'CNY',
      requirements: dto.requirements,
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

    // 发送通知给商户
    try {
      await this.notificationService.createNotification(dto.merchantId, {
        type: 'task_created' as any,
        title: '新任务待处理',
        message: `您有一个新的${dto.type}任务：${dto.title}`,
        metadata: {
          taskId: savedTask.id,
        },
      });
    } catch (error) {
      this.logger.warn('发送任务通知失败:', error);
    }

    this.logger.log(`创建任务: taskId=${savedTask.id}, userId=${userId}, merchantId=${dto.merchantId}`);

    return savedTask;
  }

  /**
   * 商户接受任务
   */
  async acceptTask(merchantId: string, taskId: string): Promise<MerchantTask> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, merchantId },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (task.status !== TaskStatus.PENDING) {
      throw new BadRequestException('任务状态不允许接受');
    }

    task.status = TaskStatus.ACCEPTED;
    task.progress = {
      ...task.progress,
      currentStep: 'accepted',
      completedSteps: ['pending', 'accepted'],
      percentage: 10,
    };

    const savedTask = await this.taskRepository.save(task);

    // 发送通知给用户
    try {
      await this.notificationService.createNotification(task.userId, {
        type: 'task_accepted' as any,
        title: '任务已被接受',
        message: `商户已接受您的任务：${task.title}`,
        metadata: {
          taskId: savedTask.id,
        },
      });
    } catch (error) {
      this.logger.warn('发送任务通知失败:', error);
    }

    return savedTask;
  }

  /**
   * 更新任务进度
   */
  async updateTaskProgress(
    merchantId: string,
    taskId: string,
    dto: UpdateTaskProgressDto,
  ): Promise<MerchantTask> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, merchantId },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (task.status === TaskStatus.PENDING || task.status === TaskStatus.CANCELLED) {
      throw new BadRequestException('任务状态不允许更新进度');
    }

    // 更新进度
    if (dto.currentStep) {
      task.progress.currentStep = dto.currentStep;
    }

    if (dto.percentage !== undefined) {
      task.progress.percentage = dto.percentage;
    }

    // 添加进度更新记录
    if (dto.message) {
      if (!task.progress.updates) {
        task.progress.updates = [];
      }
      task.progress.updates.push({
        message: dto.message,
        timestamp: new Date(),
        attachments: dto.attachments,
      });
    }

    // 更新状态
    if (dto.percentage === 100) {
      task.status = TaskStatus.DELIVERED;
    } else if (task.status === TaskStatus.ACCEPTED) {
      task.status = TaskStatus.IN_PROGRESS;
    }

    const savedTask = await this.taskRepository.save(task);

    // 发送通知给用户
    if (dto.message) {
      try {
        await this.notificationService.createNotification(task.userId, {
          type: 'task_progress' as any,
          title: '任务进度更新',
          message: dto.message,
          metadata: {
            taskId: savedTask.id,
            percentage: dto.percentage,
          },
        });
      } catch (error) {
        this.logger.warn('发送任务通知失败:', error);
      }
    }

    return savedTask;
  }

  /**
   * 完成任务
   */
  async completeTask(merchantId: string, taskId: string): Promise<MerchantTask> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, merchantId },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (task.status !== TaskStatus.DELIVERED) {
      throw new BadRequestException('任务必须先交付才能完成');
    }

    task.status = TaskStatus.COMPLETED;
    task.completedAt = new Date();
    task.progress.percentage = 100;

    const savedTask = await this.taskRepository.save(task);

    // 发送通知给用户
    try {
      await this.notificationService.createNotification(task.userId, {
        type: 'task_completed' as any,
        title: '任务已完成',
        message: `您的任务"${task.title}"已完成`,
        metadata: {
          taskId: savedTask.id,
        },
      });
    } catch (error) {
      this.logger.warn('发送任务通知失败:', error);
    }

    return savedTask;
  }

  /**
   * 获取用户的任务列表
   */
  async getUserTasks(userId: string, status?: TaskStatus): Promise<MerchantTask[]> {
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    return this.taskRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取商户的任务列表
   */
  async getMerchantTasks(merchantId: string, status?: TaskStatus): Promise<MerchantTask[]> {
    const where: any = { merchantId };
    if (status) {
      where.status = status;
    }

    return this.taskRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取任务详情
   */
  async getTask(taskId: string, userId?: string): Promise<MerchantTask> {
    const where: any = { id: taskId };
    if (userId) {
      where.userId = userId;
    }

    const task = await this.taskRepository.findOne({ where });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    return task;
  }
}

