import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AgentOpsTaskEntity,
  AgentOpsTaskType,
  AgentOpsRiskTier,
} from './entities/agent-ops-task.entity';
import { AgentOpsDeliverableEntity } from './entities/agent-ops-deliverable.entity';
import { AgentOpsActionLogEntity } from './entities/agent-ops-action-log.entity';
import { ApprovalGrantEntity } from './entities/approval-grant.entity';
import { MonitorSubscriptionEntity } from './entities/monitor-subscription.entity';

/** 创建任务入参(骨架阶段最小集)。 */
export interface CreateAgentOpsTaskDto {
  agentId: string;
  type: AgentOpsTaskType;
  input?: Record<string, any>;
  riskTier?: AgentOpsRiskTier;
}

/**
 * AgentOpsService — crypto-native agent-ops 模块服务(阶段 0 骨架)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md(任务 1)。
 *
 * 本阶段仅提供任务与交付物的基础落库/读取(CRUD 底座),供后续编排器
 * (TaskOrchestrator)、尽调引擎(DueDiligenceEngine)、监控调度(MonitorScheduler)
 * 等组件接入。复杂业务逻辑在后续任务实现,此处不预先实现。
 */
@Injectable()
export class AgentOpsService {
  private readonly logger = new Logger(AgentOpsService.name);

  constructor(
    @InjectRepository(AgentOpsTaskEntity)
    private readonly taskRepo: Repository<AgentOpsTaskEntity>,
    @InjectRepository(AgentOpsDeliverableEntity)
    private readonly deliverableRepo: Repository<AgentOpsDeliverableEntity>,
    @InjectRepository(AgentOpsActionLogEntity)
    private readonly actionLogRepo: Repository<AgentOpsActionLogEntity>,
    @InjectRepository(ApprovalGrantEntity)
    private readonly approvalGrantRepo: Repository<ApprovalGrantEntity>,
    @InjectRepository(MonitorSubscriptionEntity)
    private readonly monitorRepo: Repository<MonitorSubscriptionEntity>,
  ) {}

  // ───────────────────────── Task ─────────────────────────

  /** 创建一个 agent-ops 任务。 */
  async createTask(
    ownerId: string,
    dto: CreateAgentOpsTaskDto,
  ): Promise<AgentOpsTaskEntity> {
    const task = this.taskRepo.create({
      ownerId,
      agentId: dto.agentId,
      type: dto.type,
      input: dto.input ?? {},
      riskTier: dto.riskTier ?? 'read',
    });
    const saved = await this.taskRepo.save(task);
    this.logger.debug(`createTask ${saved.id} (${dto.type}) for owner ${ownerId}`);
    return saved;
  }

  /** 按 id 读取任务(限定归属用户)。 */
  async getTask(ownerId: string, taskId: string): Promise<AgentOpsTaskEntity> {
    const task = await this.taskRepo.findOne({ where: { id: taskId, ownerId } });
    if (!task) {
      throw new NotFoundException(`AgentOpsTask ${taskId} not found`);
    }
    return task;
  }

  /** 列出某用户的任务。 */
  async listTasks(ownerId: string): Promise<AgentOpsTaskEntity[]> {
    return this.taskRepo.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─────────────────────── Deliverable ───────────────────────

  /** 列出某任务的交付物。 */
  async listDeliverables(taskId: string): Promise<AgentOpsDeliverableEntity[]> {
    return this.deliverableRepo.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 按 id 读取交付物(不限归属;归属校验由调用方经其 taskId 完成)。 */
  async getDeliverable(deliverableId: string): Promise<AgentOpsDeliverableEntity> {
    const deliverable = await this.deliverableRepo.findOne({
      where: { id: deliverableId },
    });
    if (!deliverable) {
      throw new NotFoundException(
        `AgentOpsDeliverable ${deliverableId} not found`,
      );
    }
    return deliverable;
  }

  // ─────────────────────── Monitor ───────────────────────

  /** 列出某用户的监控订阅(非删除态)。 */
  async listMonitors(ownerId: string): Promise<MonitorSubscriptionEntity[]> {
    return this.monitorRepo.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
  }
}
