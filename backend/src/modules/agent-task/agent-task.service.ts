import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentTaskEntity,
  AgentTaskLogEntity,
  AgentTaskStatus,
} from '../../entities/agent-task.entity';

export interface CreateAgentTaskDto {
  userId: string;
  title: string;
  prompt: string;
  agentId?: string;
  instanceId?: string;
  tier?: string;
}

@Injectable()
export class AgentTaskService {
  constructor(
    @InjectRepository(AgentTaskEntity)
    private readonly taskRepo: Repository<AgentTaskEntity>,
    @InjectRepository(AgentTaskLogEntity)
    private readonly logRepo: Repository<AgentTaskLogEntity>,
  ) {}

  async create(dto: CreateAgentTaskDto): Promise<AgentTaskEntity> {
    const task = this.taskRepo.create({
      userId: dto.userId,
      title: dto.title.slice(0, 200),
      prompt: dto.prompt,
      agentId: dto.agentId ?? null,
      instanceId: dto.instanceId ?? null,
      tier: dto.tier ?? null,
      status: 'queued',
      progress: -1,
      costUsd: 0,
    });
    const saved = await this.taskRepo.save(task);
    await this.appendLog(saved.id, 'status', 'task created', { status: 'queued' });
    return saved;
  }

  async list(userId: string, limit = 50): Promise<AgentTaskEntity[]> {
    return this.taskRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async get(id: string): Promise<AgentTaskEntity | null> {
    return this.taskRepo.findOne({ where: { id } });
  }

  async listLogs(taskId: string, limit = 200): Promise<AgentTaskLogEntity[]> {
    return this.logRepo.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
      take: Math.min(Math.max(limit, 1), 1000),
    });
  }

  async appendLog(
    taskId: string,
    kind: string,
    message: string,
    payload?: Record<string, unknown>,
  ): Promise<AgentTaskLogEntity> {
    const log = this.logRepo.create({
      taskId,
      kind,
      message: message.slice(0, 4000),
      payload: payload ?? null,
    });
    return this.logRepo.save(log);
  }

  async setStatus(
    id: string,
    status: AgentTaskStatus,
    extra?: Partial<Pick<AgentTaskEntity, 'resultSummary' | 'errorMessage' | 'progress' | 'costUsd'>>,
  ): Promise<AgentTaskEntity | null> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) return null;
    task.status = status;
    if (status === 'running' && !task.startedAt) task.startedAt = new Date();
    if (
      status === 'succeeded' ||
      status === 'failed' ||
      status === 'canceled'
    ) {
      task.completedAt = new Date();
    }
    if (extra?.resultSummary !== undefined) task.resultSummary = extra.resultSummary;
    if (extra?.errorMessage !== undefined) task.errorMessage = extra.errorMessage;
    if (extra?.progress !== undefined) task.progress = extra.progress;
    if (extra?.costUsd !== undefined) task.costUsd = extra.costUsd;
    const saved = await this.taskRepo.save(task);
    await this.appendLog(id, 'status', `→ ${status}`, { status });
    return saved;
  }

  async cancel(id: string): Promise<AgentTaskEntity | null> {
    return this.setStatus(id, 'canceled');
  }
}
