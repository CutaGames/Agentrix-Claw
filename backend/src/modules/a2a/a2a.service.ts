/**
 * A2A (Agent-to-Agent) Service
 * 
 * Core service for agent-to-agent task delegation, lifecycle management,
 * quality assessment, reputation tracking, and webhook callbacks.
 */

import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { A2ATask, A2ATaskStatus, A2ATaskPriority, A2ADeliverable, A2AQualityAssessment, A2ACallback } from '../../entities/a2a-task.entity';
import { AgentReputation } from '../../entities/agent-reputation.entity';
import { AP2MandateEntity, MandateStatus } from '../../entities/ap2-mandate.entity';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';
import * as crypto from 'crypto';
import axios from 'axios';

// ============ DTOs ============

export interface CreateA2ATaskDto {
  requesterAgentId: string;
  targetAgentId: string;
  requesterUserId?: string;
  title: string;
  description: string;
  taskType?: string;
  params?: Record<string, any>;
  priority?: A2ATaskPriority;
  maxPrice?: string;
  currency?: string;
  paymentMethod?: string;
  mandateId?: string;
  budgetPoolId?: string;
  skillId?: string;
  deadline?: string;
  callback?: A2ACallback;
  parentTaskId?: string;
  metadata?: Record<string, any>;
}

export interface AcceptA2ATaskDto {
  agreedPrice?: string;
  estimatedCompletionTime?: number; // seconds
  message?: string;
}

export interface DeliverA2ATaskDto {
  deliverables: A2ADeliverable[];
  message?: string;
}

export interface ReviewA2ATaskDto {
  approved: boolean;
  qualityScore?: number;
  comment?: string;
  criteria?: Array<{ name: string; score: number; weight: number; comment?: string }>;
}

export interface NegotiateA2ATaskDto {
  proposedPrice?: string;
  proposedDeadline?: string;
  proposedSLA?: Record<string, any>;
  message?: string;
}

export interface A2ATaskQuery {
  agentId?: string;
  role?: 'requester' | 'target';
  status?: A2ATaskStatus | A2ATaskStatus[];
  taskType?: string;
  page?: number;
  limit?: number;
}

// ============ Service ============

@Injectable()
export class A2AService {
  private readonly logger = new Logger(A2AService.name);

  constructor(
    @InjectRepository(A2ATask)
    private readonly taskRepository: Repository<A2ATask>,
    @InjectRepository(AgentReputation)
    private readonly reputationRepository: Repository<AgentReputation>,
    @InjectRepository(AP2MandateEntity)
    private readonly mandateRepository: Repository<AP2MandateEntity>,
    @Optional() @Inject(forwardRef(() => NotificationService))
    private readonly notificationService?: NotificationService,
  ) {}

  // ==================== Task Lifecycle ====================

  /**
   * Create a new A2A task (agent_invoke)
   */
  async createTask(dto: CreateA2ATaskDto): Promise<A2ATask> {
    // Validate mandate if provided
    if (dto.mandateId) {
      const mandate = await this.mandateRepository.findOne({ where: { id: dto.mandateId } });
      if (!mandate) throw new BadRequestException(`Mandate ${dto.mandateId} not found`);
      if (mandate.status !== MandateStatus.ACTIVE) {
        throw new BadRequestException(`Mandate ${dto.mandateId} is ${mandate.status}`);
      }
      if (mandate.agentId !== dto.requesterAgentId) {
        throw new BadRequestException(`Mandate ${dto.mandateId} does not belong to agent ${dto.requesterAgentId}`);
      }
    }

    const task = this.taskRepository.create({
      requesterAgentId: dto.requesterAgentId,
      targetAgentId: dto.targetAgentId,
      requesterUserId: dto.requesterUserId,
      title: dto.title,
      description: dto.description,
      taskType: dto.taskType,
      params: dto.params,
      priority: dto.priority || A2ATaskPriority.NORMAL,
      maxPrice: dto.maxPrice,
      currency: dto.currency || 'USDC',
      paymentMethod: dto.paymentMethod,
      mandateId: dto.mandateId,
      budgetPoolId: dto.budgetPoolId,
      skillId: dto.skillId,
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      callback: dto.callback,
      parentTaskId: dto.parentTaskId,
      metadata: dto.metadata,
      status: A2ATaskStatus.PENDING,
    });

    const saved = await this.taskRepository.save(task);
    this.logger.log(`A2A task created: ${saved.id} | ${dto.requesterAgentId} → ${dto.targetAgentId} | "${dto.title}"`);

    // Update reputation stats
    await this.incrementTaskCount(dto.targetAgentId);

    // Send notification to requester about task creation
    if (dto.requesterUserId && this.notificationService) {
      this.notificationService.createNotification(dto.requesterUserId, {
        type: NotificationType.APPROVAL,
        title: `A2A任务已创建: ${dto.title}`,
        message: `任务已派发给目标Agent，等待接受`,
        actionUrl: `/a2a/tasks/${saved.id}`,
        metadata: { taskId: saved.id, event: 'task.created' },
      } as any).catch(err => this.logger.warn(`A2A notification failed: ${err?.message}`));
    }

    // Fire webhook
    await this.fireCallback(saved, 'task.created');

    return saved;
  }

  /**
   * Accept a task (target agent)
   */
  async acceptTask(taskId: string, targetAgentId: string, dto: AcceptA2ATaskDto = {}): Promise<A2ATask> {
    const task = await this.getTask(taskId);
    this.assertTaskAgent(task, targetAgentId, 'target');
    this.assertStatus(task, [A2ATaskStatus.PENDING]);

    task.status = A2ATaskStatus.ACCEPTED;
    task.acceptedAt = new Date();
    if (dto.agreedPrice) task.agreedPrice = dto.agreedPrice;
    if (dto.message) task.metadata = { ...task.metadata, acceptMessage: dto.message };

    const saved = await this.taskRepository.save(task);
    this.logger.log(`A2A task accepted: ${taskId} by ${targetAgentId}`);

    // Update response time in reputation
    const responseTimeSec = (task.acceptedAt.getTime() - task.createdAt.getTime()) / 1000;
    await this.updateResponseTime(targetAgentId, responseTimeSec);

    await this.fireCallback(saved, 'task.accepted');
    return saved;
  }

  /**
   * Start working on a task (target agent)
   */
  async startTask(taskId: string, targetAgentId: string): Promise<A2ATask> {
    const task = await this.getTask(taskId);
    this.assertTaskAgent(task, targetAgentId, 'target');
    this.assertStatus(task, [A2ATaskStatus.ACCEPTED]);

    task.status = A2ATaskStatus.IN_PROGRESS;
    task.startedAt = new Date();
    const saved = await this.taskRepository.save(task);
    this.logger.log(`A2A task started: ${taskId}`);

    await this.fireCallback(saved, 'task.started');
    return saved;
  }

  /**
   * Deliver task results (target agent)
   */
  async deliverTask(taskId: string, targetAgentId: string, dto: DeliverA2ATaskDto): Promise<A2ATask> {
    const task = await this.getTask(taskId);
    this.assertTaskAgent(task, targetAgentId, 'target');
    this.assertStatus(task, [A2ATaskStatus.IN_PROGRESS, A2ATaskStatus.REJECTED]);

    task.status = A2ATaskStatus.DELIVERED;
    task.deliveredAt = new Date();
    task.deliverables = dto.deliverables.map(d => ({
      ...d,
      submittedAt: new Date().toISOString(),
    }));
    if (dto.message) task.metadata = { ...task.metadata, deliveryMessage: dto.message };

    const saved = await this.taskRepository.save(task);
    this.logger.log(`A2A task delivered: ${taskId} with ${dto.deliverables.length} deliverables`);

    // Notify requester that deliverables are ready for review
    if (task.requesterUserId && this.notificationService) {
      this.notificationService.createNotification(task.requesterUserId, {
        type: NotificationType.APPROVAL,
        title: `A2A交付待审核: ${task.title}`,
        message: `Agent已提交${dto.deliverables.length}个交付物，请审核`,
        actionUrl: `/a2a/tasks/${taskId}`,
        metadata: { taskId, event: 'task.delivered', approvalStatus: 'pending' },
      } as any).catch(err => this.logger.warn(`A2A delivery notification failed: ${err?.message}`));
    }

    await this.fireCallback(saved, 'task.delivered');
    return saved;
  }

  /**
   * Review and approve/reject deliverables (requester agent or auto)
   */
  async reviewTask(taskId: string, reviewerAgentId: string, dto: ReviewA2ATaskDto): Promise<A2ATask> {
    const task = await this.getTask(taskId);
    this.assertTaskAgent(task, reviewerAgentId, 'requester');
    this.assertStatus(task, [A2ATaskStatus.DELIVERED]);

    // Build quality assessment
    const assessment: A2AQualityAssessment = {
      score: dto.qualityScore || (dto.approved ? 80 : 30),
      assessedBy: 'requester',
      assessorId: reviewerAgentId,
      criteria: dto.criteria || [],
      overallComment: dto.comment,
      assessedAt: new Date().toISOString(),
    };
    task.qualityAssessment = assessment;

    if (dto.approved) {
      task.status = A2ATaskStatus.COMPLETED;
      task.completedAt = new Date();
      this.logger.log(`A2A task approved: ${taskId} | score: ${assessment.score}`);

      // Update reputation
      const completionTimeSec = (task.completedAt.getTime() - task.createdAt.getTime()) / 1000;
      const onTime = !task.deadline || task.completedAt <= task.deadline;
      await this.updateReputationOnComplete(task.targetAgentId, assessment.score, completionTimeSec, onTime);

      // Settle payment if mandate exists
      if (task.mandateId && task.agreedPrice) {
        await this.settlePayment(task);
      }

      // Notify requester about completion
      if (task.requesterUserId && this.notificationService) {
        this.notificationService.createNotification(task.requesterUserId, {
          type: NotificationType.SYSTEM,
          title: `A2A任务已完成: ${task.title}`,
          message: `质量评分: ${assessment.score}`,
          actionUrl: `/a2a/tasks/${taskId}`,
          metadata: { taskId, event: 'task.completed', score: assessment.score },
        } as any).catch(err => this.logger.warn(`A2A completion notification failed: ${err?.message}`));
      }

      await this.fireCallback(task, 'task.completed');
    } else {
      task.status = A2ATaskStatus.REJECTED;
      this.logger.log(`A2A task rejected: ${taskId} | reason: ${dto.comment}`);

      await this.updateReputationOnReject(task.targetAgentId);

      // Allow retry if under max
      if (task.retryCount < task.maxRetries) {
        task.retryCount += 1;
        task.status = A2ATaskStatus.IN_PROGRESS; // Back to in_progress for retry
      }

      await this.fireCallback(task, 'task.rejected');
    }

    return this.taskRepository.save(task);
  }

  /**
   * Auto-assess quality based on configurable criteria
   */
  async autoAssessQuality(taskId: string): Promise<A2AQualityAssessment> {
    const task = await this.getTask(taskId);
    this.assertStatus(task, [A2ATaskStatus.DELIVERED]);

    let totalScore = 0;
    let totalWeight = 0;
    const criteria: Array<{ name: string; score: number; weight: number; comment?: string }> = [];

    // Criterion 1: Deliverables present (weight: 30)
    const hasDeliverables = task.deliverables && task.deliverables.length > 0;
    const deliverableScore = hasDeliverables ? 100 : 0;
    criteria.push({ name: 'deliverables_present', score: deliverableScore, weight: 30, comment: hasDeliverables ? 'Deliverables submitted' : 'No deliverables' });
    totalScore += deliverableScore * 30;
    totalWeight += 30;

    // Criterion 2: On-time delivery (weight: 25)
    let onTimeScore = 100;
    if (task.deadline && task.deliveredAt) {
      const deadlineMs = task.deadline.getTime();
      const deliveredMs = task.deliveredAt.getTime();
      if (deliveredMs > deadlineMs) {
        const hoursLate = (deliveredMs - deadlineMs) / (1000 * 60 * 60);
        onTimeScore = Math.max(0, 100 - hoursLate * 10); // -10 per hour late
      }
    }
    criteria.push({ name: 'on_time', score: onTimeScore, weight: 25, comment: onTimeScore === 100 ? 'On time' : 'Late delivery' });
    totalScore += onTimeScore * 25;
    totalWeight += 25;

    // Criterion 3: Content completeness (weight: 25)
    let completenessScore = 50; // Default moderate
    if (task.deliverables?.length > 0) {
      const hasContent = task.deliverables.every(d => d.content && d.content.length > 0);
      completenessScore = hasContent ? 85 : 40;
    }
    criteria.push({ name: 'completeness', score: completenessScore, weight: 25 });
    totalScore += completenessScore * 25;
    totalWeight += 25;

    // Criterion 4: Agent reputation bonus (weight: 20)
    const reputation = await this.getOrCreateReputation(task.targetAgentId);
    const reputationScore = Math.min(100, reputation.overallScore * 1.2);
    criteria.push({ name: 'agent_reputation', score: reputationScore, weight: 20 });
    totalScore += reputationScore * 20;
    totalWeight += 20;

    const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;

    const assessment: A2AQualityAssessment = {
      score: finalScore,
      assessedBy: 'auto',
      criteria,
      overallComment: finalScore >= 70 ? 'Auto-approved: quality threshold met' : 'Auto-review: below quality threshold, manual review recommended',
      assessedAt: new Date().toISOString(),
    };

    task.qualityAssessment = assessment;
    await this.taskRepository.save(task);

    this.logger.log(`Auto quality assessment for task ${taskId}: score=${finalScore}`);
    return assessment;
  }

  /**
   * Auto-approve task if quality score meets threshold
   */
  async autoApproveIfQualified(taskId: string, threshold: number = 70): Promise<{ approved: boolean; assessment: A2AQualityAssessment }> {
    const assessment = await this.autoAssessQuality(taskId);

    if (assessment.score >= threshold) {
      const task = await this.getTask(taskId);
      // Auto-approve using a system reviewer
      await this.reviewTask(taskId, task.requesterAgentId, {
        approved: true,
        qualityScore: assessment.score,
        comment: `Auto-approved: score ${assessment.score} >= threshold ${threshold}`,
        criteria: assessment.criteria,
      });
      return { approved: true, assessment };
    }

    return { approved: false, assessment };
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, agentId: string, reason?: string): Promise<A2ATask> {
    const task = await this.getTask(taskId);
    if (task.requesterAgentId !== agentId && task.targetAgentId !== agentId) {
      throw new BadRequestException('Only requester or target agent can cancel');
    }
    this.assertStatus(task, [A2ATaskStatus.PENDING, A2ATaskStatus.ACCEPTED, A2ATaskStatus.IN_PROGRESS]);

    task.status = A2ATaskStatus.CANCELLED;
    task.cancelReason = reason;
    task.cancelledAt = new Date();

    const saved = await this.taskRepository.save(task);
    this.logger.log(`A2A task cancelled: ${taskId} by ${agentId}`);

    // Update reputation if target cancels
    if (agentId === task.targetAgentId) {
      await this.updateReputationOnCancel(task.targetAgentId);
    }

    await this.fireCallback(saved, 'task.cancelled');
    return saved;
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<A2ATask> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`A2A task ${taskId} not found`);
    return task;
  }

  /**
   * List tasks with filters
   */
  async listTasks(query: A2ATaskQuery): Promise<{ tasks: A2ATask[]; total: number }> {
    const qb = this.taskRepository.createQueryBuilder('task');

    if (query.agentId) {
      if (query.role === 'requester') {
        qb.andWhere('task.requester_agent_id = :agentId', { agentId: query.agentId });
      } else if (query.role === 'target') {
        qb.andWhere('task.target_agent_id = :agentId', { agentId: query.agentId });
      } else {
        qb.andWhere('(task.requester_agent_id = :agentId OR task.target_agent_id = :agentId)', { agentId: query.agentId });
      }
    }

    if (query.status) {
      if (Array.isArray(query.status)) {
        qb.andWhere('task.status IN (:...statuses)', { statuses: query.status });
      } else {
        qb.andWhere('task.status = :status', { status: query.status });
      }
    }

    if (query.taskType) {
      qb.andWhere('task.task_type = :taskType', { taskType: query.taskType });
    }

    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    qb.orderBy('task.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [tasks, total] = await qb.getManyAndCount();
    return { tasks, total };
  }

  // ==================== Negotiation (P2) ====================

  /**
   * Negotiate task terms (price, deadline, SLA)
   */
  async negotiate(taskId: string, agentId: string, dto: NegotiateA2ATaskDto): Promise<A2ATask> {
    const task = await this.getTask(taskId);
    if (task.requesterAgentId !== agentId && task.targetAgentId !== agentId) {
      throw new BadRequestException('Only task participants can negotiate');
    }
    this.assertStatus(task, [A2ATaskStatus.PENDING]);

    const negotiations = task.metadata?.negotiations || [];
    negotiations.push({
      from: agentId,
      proposedPrice: dto.proposedPrice,
      proposedDeadline: dto.proposedDeadline,
      proposedSLA: dto.proposedSLA,
      message: dto.message,
      timestamp: new Date().toISOString(),
    });

    task.metadata = { ...task.metadata, negotiations };

    // Update task fields if target agent proposes
    if (agentId === task.targetAgentId) {
      if (dto.proposedPrice) task.agreedPrice = dto.proposedPrice;
      if (dto.proposedDeadline) task.deadline = new Date(dto.proposedDeadline);
    }

    const saved = await this.taskRepository.save(task);
    await this.fireCallback(saved, 'task.negotiation');
    return saved;
  }

  // ==================== Payment Settlement ====================

  /**
   * Settle payment for a completed task using AP2 mandate
   */
  private async settlePayment(task: A2ATask): Promise<void> {
    if (!task.mandateId || !task.agreedPrice) return;

    try {
      const mandate = await this.mandateRepository.findOne({ where: { id: task.mandateId } });
      if (!mandate || mandate.status !== MandateStatus.ACTIVE) {
        this.logger.warn(`Cannot settle task ${task.id}: mandate ${task.mandateId} is ${mandate?.status || 'not found'}`);
        return;
      }

      const amount = BigInt(task.agreedPrice);
      const usedAmount = BigInt(mandate.usedAmount || '0');
      const maxAmount = BigInt(mandate.maxAmount);
      const remaining = maxAmount - usedAmount;

      if (amount > remaining) {
        this.logger.warn(`Cannot settle task ${task.id}: amount ${amount} exceeds remaining mandate balance ${remaining}`);
        return;
      }

      // Update mandate usage
      mandate.usedAmount = (usedAmount + amount).toString();
      mandate.transactionCount += 1;
      mandate.updatedAt = new Date();

      if (BigInt(mandate.usedAmount) >= maxAmount) {
        mandate.status = MandateStatus.EXHAUSTED;
      }

      await this.mandateRepository.save(mandate);

      // Record payment tx reference on task
      task.paymentTxId = `a2a_pay_${task.id}_${Date.now()}`;
      await this.taskRepository.save(task);

      this.logger.log(`A2A payment settled: task=${task.id}, amount=${task.agreedPrice} ${task.currency}, mandate=${task.mandateId}`);
    } catch (error) {
      this.logger.error(`Failed to settle payment for task ${task.id}: ${error.message}`);
    }
  }

  // ==================== Reputation Management ====================

  /**
   * Get or create reputation record for an agent
   */
  async getOrCreateReputation(agentId: string): Promise<AgentReputation> {
    let rep = await this.reputationRepository.findOne({ where: { agentId } });
    if (!rep) {
      rep = this.reputationRepository.create({
        agentId,
        overallScore: 50,
        tier: 'bronze',
      });
      rep = await this.reputationRepository.save(rep);
    }
    return rep;
  }

  /**
   * Get reputation for an agent
   */
  async getReputation(agentId: string): Promise<AgentReputation> {
    return this.getOrCreateReputation(agentId);
  }

  private async incrementTaskCount(agentId: string): Promise<void> {
    const rep = await this.getOrCreateReputation(agentId);
    rep.tasksTotal += 1;
    await this.reputationRepository.save(rep);
  }

  private async updateResponseTime(agentId: string, responseTimeSec: number): Promise<void> {
    const rep = await this.getOrCreateReputation(agentId);
    const totalTasks = rep.tasksCompleted + rep.tasksFailed + 1;
    rep.avgResponseTime = Number(((Number(rep.avgResponseTime) * (totalTasks - 1) + responseTimeSec) / totalTasks).toFixed(2));
    await this.reputationRepository.save(rep);
  }

  private async updateReputationOnComplete(agentId: string, qualityScore: number, completionTimeSec: number, onTime: boolean): Promise<void> {
    const rep = await this.getOrCreateReputation(agentId);
    rep.tasksCompleted += 1;

    // Update averages
    const completed = rep.tasksCompleted;
    rep.avgQualityScore = Number(((Number(rep.avgQualityScore) * (completed - 1) + qualityScore) / completed).toFixed(2));
    rep.avgCompletionTime = Number(((Number(rep.avgCompletionTime) * (completed - 1) + completionTimeSec) / completed).toFixed(2));

    // On-time rate
    const totalDeliveries = rep.tasksCompleted + rep.tasksFailed;
    const previousOnTimeCount = Math.round(Number(rep.onTimeRate) * (totalDeliveries - 1) / 100);
    const newOnTimeCount = previousOnTimeCount + (onTime ? 1 : 0);
    rep.onTimeRate = Number((newOnTimeCount / totalDeliveries * 100).toFixed(2));

    // Recalculate overall score: weighted combination
    rep.overallScore = Number(this.calculateOverallScore(rep).toFixed(2));
    rep.tier = this.calculateTier(rep.overallScore);

    await this.reputationRepository.save(rep);
  }

  private async updateReputationOnReject(agentId: string): Promise<void> {
    const rep = await this.getOrCreateReputation(agentId);
    rep.tasksFailed += 1;
    rep.overallScore = Number(this.calculateOverallScore(rep).toFixed(2));
    rep.tier = this.calculateTier(rep.overallScore);
    await this.reputationRepository.save(rep);
  }

  private async updateReputationOnCancel(agentId: string): Promise<void> {
    const rep = await this.getOrCreateReputation(agentId);
    rep.tasksCancelled += 1;
    rep.overallScore = Number(Math.max(0, rep.overallScore - 2).toFixed(2)); // Small penalty
    rep.tier = this.calculateTier(rep.overallScore);
    await this.reputationRepository.save(rep);
  }

  private calculateOverallScore(rep: AgentReputation): number {
    const total = rep.tasksCompleted + rep.tasksFailed + rep.tasksCancelled;
    if (total === 0) return 50; // Default

    const successRate = rep.tasksCompleted / total;
    const qualityWeight = 0.35;
    const successWeight = 0.30;
    const onTimeWeight = 0.20;
    const volumeWeight = 0.15;

    const qualityComponent = Number(rep.avgQualityScore) * qualityWeight;
    const successComponent = successRate * 100 * successWeight;
    const onTimeComponent = Number(rep.onTimeRate) * onTimeWeight;
    const volumeComponent = Math.min(100, Math.log10(total + 1) * 30) * volumeWeight;

    return Math.min(100, qualityComponent + successComponent + onTimeComponent + volumeComponent);
  }

  private calculateTier(score: number): 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' {
    if (score >= 95) return 'diamond';
    if (score >= 85) return 'platinum';
    if (score >= 70) return 'gold';
    if (score >= 50) return 'silver';
    return 'bronze';
  }

  // ==================== Webhook Callbacks ====================

  /**
   * Fire webhook callback for task events
   */
  private async fireCallback(task: A2ATask, event: string): Promise<void> {
    if (!task.callback?.url) return;

    // Check if this event is in the subscribed events list
    if (task.callback.events && task.callback.events.length > 0) {
      const eventShort = event.replace('task.', '');
      if (!task.callback.events.includes(event) && !task.callback.events.includes(eventShort)) {
        return;
      }
    }

    const payload = {
      event,
      task_id: task.id,
      status: task.status,
      requester_agent_id: task.requesterAgentId,
      target_agent_id: task.targetAgentId,
      title: task.title,
      timestamp: new Date().toISOString(),
      data: {
        deliverables: task.deliverables?.length || 0,
        quality_score: task.qualityAssessment?.score,
        agreed_price: task.agreedPrice,
        currency: task.currency,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-A2A-Event': event,
      'X-A2A-Task-Id': task.id,
      ...(task.callback.headers || {}),
    };

    // HMAC signature if secret provided
    if (task.callback.secret) {
      const signature = crypto.createHmac('sha256', task.callback.secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      headers['X-A2A-Signature'] = `sha256=${signature}`;
    }

    const maxRetries = task.callback.retryCount || 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await axios.post(task.callback.url, payload, {
          headers,
          timeout: 10000,
        });
        this.logger.debug(`A2A callback fired: ${event} → ${task.callback.url}`);
        return;
      } catch (error) {
        this.logger.warn(`A2A callback attempt ${attempt + 1}/${maxRetries} failed for ${event}: ${error.message}`);
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
        }
      }
    }
  }

  // ==================== Helpers ====================

  private assertStatus(task: A2ATask, allowed: A2ATaskStatus[]): void {
    if (!allowed.includes(task.status)) {
      throw new BadRequestException(`Task ${task.id} is ${task.status}, expected one of: ${allowed.join(', ')}`);
    }
  }

  private assertTaskAgent(task: A2ATask, agentId: string, role: 'requester' | 'target'): void {
    const expected = role === 'requester' ? task.requesterAgentId : task.targetAgentId;
    if (expected !== agentId) {
      throw new BadRequestException(`Agent ${agentId} is not the ${role} of task ${task.id}`);
    }
  }

  // ==================== Expire stale tasks (called by cron) ====================

  async expireStaleTasks(maxAgeHours: number = 72): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const result = await this.taskRepository
      .createQueryBuilder()
      .update(A2ATask)
      .set({ status: A2ATaskStatus.EXPIRED })
      .where('status IN (:...statuses)', { statuses: [A2ATaskStatus.PENDING, A2ATaskStatus.ACCEPTED] })
      .andWhere('created_at < :cutoff', { cutoff })
      .execute();

    if (result.affected > 0) {
      this.logger.log(`Expired ${result.affected} stale A2A tasks older than ${maxAgeHours}h`);
    }
    return result.affected;
  }
}
