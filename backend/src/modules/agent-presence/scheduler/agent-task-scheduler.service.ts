import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AgentScheduledTask,
  TaskTriggerType,
  TaskActionType,
  ScheduledTaskStatus,
} from '../../../entities/agent-scheduled-task.entity';
import { ChannelRegistry } from '../channel/channel-registry';

export interface CreateScheduledTaskDto {
  agentId: string;
  name: string;
  description?: string;
  triggerType: TaskTriggerType;
  cronExpression?: string;
  intervalSeconds?: number;
  actionType: TaskActionType;
  actionConfig?: AgentScheduledTask['actionConfig'];
  maxRuns?: number;
}

@Injectable()
export class AgentTaskSchedulerService {
  private readonly logger = new Logger(AgentTaskSchedulerService.name);

  constructor(
    @InjectRepository(AgentScheduledTask)
    private readonly taskRepo: Repository<AgentScheduledTask>,
    private readonly channelRegistry: ChannelRegistry,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  async createTask(userId: string, dto: CreateScheduledTaskDto): Promise<AgentScheduledTask> {
    const nextRunAt = this.computeNextRun(dto.triggerType, dto.cronExpression, dto.intervalSeconds);

    const task = this.taskRepo.create({
      userId,
      agentId: dto.agentId,
      name: dto.name,
      description: dto.description,
      triggerType: dto.triggerType,
      cronExpression: dto.cronExpression,
      intervalSeconds: dto.intervalSeconds,
      actionType: dto.actionType,
      actionConfig: dto.actionConfig,
      maxRuns: dto.maxRuns,
      nextRunAt,
      status: ScheduledTaskStatus.ACTIVE,
    });

    return this.taskRepo.save(task);
  }

  async getTasks(userId: string, agentId?: string): Promise<AgentScheduledTask[]> {
    const where: any = { userId };
    if (agentId) where.agentId = agentId;
    return this.taskRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getTask(userId: string, taskId: string): Promise<AgentScheduledTask> {
    const task = await this.taskRepo.findOne({ where: { id: taskId, userId } });
    if (!task) throw new NotFoundException('Scheduled task not found');
    return task;
  }

  async pauseTask(userId: string, taskId: string): Promise<AgentScheduledTask> {
    const task = await this.getTask(userId, taskId);
    task.status = ScheduledTaskStatus.PAUSED;
    return this.taskRepo.save(task);
  }

  async resumeTask(userId: string, taskId: string): Promise<AgentScheduledTask> {
    const task = await this.getTask(userId, taskId);
    task.status = ScheduledTaskStatus.ACTIVE;
    task.nextRunAt = this.computeNextRun(task.triggerType, task.cronExpression, task.intervalSeconds);
    return this.taskRepo.save(task);
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    const task = await this.getTask(userId, taskId);
    await this.taskRepo.remove(task);
  }

  // ── Execution Engine ────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE, { name: 'agent-task-dispatcher' })
  async dispatchDueTasks(): Promise<void> {
    const now = new Date();
    const dueTasks = await this.taskRepo.find({
      where: {
        status: ScheduledTaskStatus.ACTIVE,
        nextRunAt: LessThanOrEqual(now),
      },
      take: 50,
    });

    if (dueTasks.length === 0) return;

    this.logger.log(`Dispatching ${dueTasks.length} due agent tasks`);

    for (const task of dueTasks) {
      try {
        await this.executeTask(task);

        task.runCount += 1;
        task.lastRunAt = now;
        task.lastError = undefined;

        // Check if max runs reached
        if (task.maxRuns && task.runCount >= task.maxRuns) {
          task.status = ScheduledTaskStatus.COMPLETED;
          task.nextRunAt = undefined;
        } else if (task.triggerType === TaskTriggerType.ONE_TIME) {
          task.status = ScheduledTaskStatus.COMPLETED;
          task.nextRunAt = undefined;
        } else {
          task.nextRunAt = this.computeNextRun(
            task.triggerType,
            task.cronExpression,
            task.intervalSeconds,
          );
        }
      } catch (err: any) {
        task.failCount += 1;
        task.lastError = err.message;
        task.lastRunAt = now;
        this.logger.error(`Task ${task.id} (${task.name}) failed: ${err.message}`);

        // Pause after 5 consecutive failures
        if (task.failCount >= 5) {
          task.status = ScheduledTaskStatus.FAILED;
          this.logger.warn(`Task ${task.id} paused after 5 failures`);
        } else {
          task.nextRunAt = this.computeNextRun(
            task.triggerType,
            task.cronExpression,
            task.intervalSeconds,
          );
        }
      }

      await this.taskRepo.save(task);
    }
  }

  private async executeTask(task: AgentScheduledTask): Promise<void> {
    switch (task.actionType) {
      case TaskActionType.SEND_MESSAGE:
        await this.executeSendMessage(task);
        break;
      case TaskActionType.CHECK_CHANNEL:
        await this.executeCheckChannel(task);
        break;
      case TaskActionType.DIGEST_SUMMARY:
        // Placeholder — would integrate with AI to generate digest
        this.logger.log(`Digest summary task ${task.id} executed (stub)`);
        break;
      case TaskActionType.MEMORY_CLEANUP:
        this.logger.log(`Memory cleanup task ${task.id} executed (stub)`);
        break;
      case TaskActionType.CUSTOM:
        this.logger.log(`Custom task ${task.id} executed (stub)`);
        break;
    }
  }

  private async executeSendMessage(task: AgentScheduledTask): Promise<void> {
    const config = task.actionConfig;
    if (!config?.channel || !config?.channelId || !config?.messageTemplate) {
      throw new Error('Missing channel/channelId/messageTemplate in actionConfig');
    }

    const adapter = this.channelRegistry.get(config.channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${config.channel}`);
    }

    const result = await adapter.sendOutbound(config.channelId, {
      content: config.messageTemplate,
    });

    if (!result.success) {
      throw new Error(`Send failed: ${result.error}`);
    }

    this.logger.log(
      `Task ${task.id}: Sent message to ${config.channel}:${config.channelId}`,
    );
  }

  private async executeCheckChannel(task: AgentScheduledTask): Promise<void> {
    const config = task.actionConfig;
    const channel = config?.channel;

    if (channel) {
      const adapter = this.channelRegistry.get(channel);
      if (adapter) {
        const health = await adapter.healthCheck();
        this.logger.log(`Task ${task.id}: Channel ${channel} health: ${health.connected}`);
      }
    } else {
      // Check all channels
      const results = await this.channelRegistry.healthCheckAll();
      this.logger.log(`Task ${task.id}: All channels checked: ${JSON.stringify(Object.keys(results))}`);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private computeNextRun(
    triggerType: TaskTriggerType,
    cronExpression?: string,
    intervalSeconds?: number,
  ): Date {
    const now = new Date();

    switch (triggerType) {
      case TaskTriggerType.INTERVAL:
        return new Date(now.getTime() + (intervalSeconds ?? 3600) * 1000);

      case TaskTriggerType.ONE_TIME:
        return now; // Run immediately on next dispatch

      case TaskTriggerType.CRON:
        // Simple next-minute approximation; production would use cron-parser
        return new Date(now.getTime() + 60 * 1000);

      case TaskTriggerType.EVENT:
        // Event-driven tasks have no scheduled nextRunAt
        return new Date(now.getTime() + 365 * 24 * 3600 * 1000);

      default:
        return new Date(now.getTime() + 3600 * 1000);
    }
  }
}
