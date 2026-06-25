import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';

import {
  MonitorSubscriptionEntity,
  MonitorSubscriptionStatus,
  MonitorType,
} from './entities/monitor-subscription.entity';
import type { MonitorCheckOutcome, MonitorCondition } from './monitor.types';

/** 创建监控订阅入参。 */
export interface CreateMonitorDto {
  agentId: string;
  monitorType: MonitorType;
  condition: MonitorCondition;
  /** 检查周期(秒),默认 3600,最小 30。 */
  interval?: number;
}

/** 修改监控订阅入参(部分更新)。 */
export interface UpdateMonitorDto {
  monitorType?: MonitorType;
  condition?: MonitorCondition;
  interval?: number;
}

const MIN_INTERVAL_SECONDS = 30;
const DEFAULT_INTERVAL_SECONDS = 3600;

/**
 * MonitorService — 监控订阅 CRUD(crypto-native-agent-ops 任务 16)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 9.4:监控任务可暂停 / 修改 / 删除,并展示上次检查时间(lastCheckedAt)与结果(lastResult)。
 *   - design §Data Models:`monitor_subscription`(ownerId/agentId/monitorType/condition/interval/
 *     lastCheckedAt/lastResult/status)。
 *
 * 职责:
 *   - 创建 / 列出 / 读取 / 暂停 / 恢复 / 修改 / 删除监控订阅;
 *   - 供 `MonitorScheduler` 查询到期订阅(findDueMonitors)并回写检查结果(recordCheckResult)。
 *
 * 删除为**软删除**(status='deleted'):保留历史 lastResult 审计,且从列表/到期检查中排除。
 */
@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    @InjectRepository(MonitorSubscriptionEntity)
    private readonly monitorRepo: Repository<MonitorSubscriptionEntity>,
  ) {}

  // ───────────────────────── CRUD ─────────────────────────

  /** 创建一个监控订阅(默认 active)。 */
  async createMonitor(
    ownerId: string,
    dto: CreateMonitorDto,
  ): Promise<MonitorSubscriptionEntity> {
    if (!dto.agentId) {
      throw new BadRequestException('agentId is required');
    }
    if (!dto.monitorType) {
      throw new BadRequestException('monitorType is required');
    }
    const interval = this.normalizeInterval(dto.interval);

    const monitor = this.monitorRepo.create({
      ownerId,
      agentId: dto.agentId,
      monitorType: dto.monitorType,
      condition: dto.condition ?? {},
      interval,
      status: 'active',
      lastCheckedAt: null,
      lastResult: null,
    });
    const saved = await this.monitorRepo.save(monitor);
    this.logger.debug(
      `createMonitor ${saved.id} type=${dto.monitorType} interval=${interval}s owner=${ownerId}`,
    );
    return saved;
  }

  /** 列出某用户的监控订阅(排除已删除)。 */
  async listMonitors(ownerId: string): Promise<MonitorSubscriptionEntity[]> {
    return this.monitorRepo.find({
      where: { ownerId, status: Not('deleted') },
      order: { createdAt: 'DESC' },
    });
  }

  /** 按 id 读取监控订阅(限定归属用户,排除已删除)。 */
  async getMonitor(
    ownerId: string,
    id: string,
  ): Promise<MonitorSubscriptionEntity> {
    const monitor = await this.monitorRepo.findOne({
      where: { id, ownerId, status: Not('deleted') },
    });
    if (!monitor) {
      throw new NotFoundException(`MonitorSubscription ${id} not found`);
    }
    return monitor;
  }

  /** 暂停监控(需求 9.4)。 */
  async pauseMonitor(
    ownerId: string,
    id: string,
  ): Promise<MonitorSubscriptionEntity> {
    return this.setStatus(ownerId, id, 'paused');
  }

  /** 恢复监控。 */
  async resumeMonitor(
    ownerId: string,
    id: string,
  ): Promise<MonitorSubscriptionEntity> {
    return this.setStatus(ownerId, id, 'active');
  }

  /** 修改监控(类型 / 条件 / 周期,需求 9.4)。 */
  async updateMonitor(
    ownerId: string,
    id: string,
    dto: UpdateMonitorDto,
  ): Promise<MonitorSubscriptionEntity> {
    const monitor = await this.getMonitor(ownerId, id);
    if (dto.monitorType !== undefined) monitor.monitorType = dto.monitorType;
    if (dto.condition !== undefined) monitor.condition = dto.condition;
    if (dto.interval !== undefined) {
      monitor.interval = this.normalizeInterval(dto.interval);
    }
    return this.monitorRepo.save(monitor);
  }

  /** 删除监控(软删除 status='deleted',保留审计,需求 9.4)。 */
  async deleteMonitor(ownerId: string, id: string): Promise<void> {
    const monitor = await this.getMonitor(ownerId, id);
    monitor.status = 'deleted';
    await this.monitorRepo.save(monitor);
    this.logger.debug(`deleteMonitor ${id} (soft) owner=${ownerId}`);
  }

  // ──────────────────── Scheduler 协作 ────────────────────

  /**
   * 查询到期需检查的 active 订阅:
   *   - 从未检查(lastCheckedAt 为空),或
   *   - lastCheckedAt + interval(秒)<= now。
   */
  async findDueMonitors(
    now: Date = new Date(),
  ): Promise<MonitorSubscriptionEntity[]> {
    // 先取从未检查的(必到期)。
    const neverChecked = await this.monitorRepo.find({
      where: { status: 'active', lastCheckedAt: IsNull() },
    });

    // 再取已检查且周期已过的:用 SQL 表达式比较(interval 为每条记录的列)。
    const checkedDue = await this.monitorRepo
      .createQueryBuilder('m')
      .where('m.status = :status', { status: 'active' })
      .andWhere('m.last_checked_at IS NOT NULL')
      .andWhere(
        `m.last_checked_at + (m.interval * INTERVAL '1 second') <= :now`,
        { now },
      )
      .getMany();

    return [...neverChecked, ...checkedDue];
  }

  /** 回写一次检查结果(lastCheckedAt + lastResult,需求 9.4)。 */
  async recordCheckResult(
    id: string,
    outcome: MonitorCheckOutcome,
  ): Promise<void> {
    const lastResult: Record<string, any> = {
      triggered: outcome.triggered,
      summary: outcome.summary,
      observations: outcome.observations ?? null,
      observedValue: outcome.observedValue ?? null,
      checkedAt: outcome.checkedAt,
      ...(outcome.error ? { error: outcome.error } : {}),
    };
    await this.monitorRepo.update(
      { id },
      {
        lastCheckedAt: new Date(outcome.checkedAt),
        lastResult,
      },
    );
  }

  /** 内部:按 id 读取(供 scheduler / worker 不带 ownerId 路径)。 */
  async findById(id: string): Promise<MonitorSubscriptionEntity | null> {
    return this.monitorRepo.findOne({ where: { id } });
  }

  // ───────────────────────── helpers ─────────────────────────

  private async setStatus(
    ownerId: string,
    id: string,
    status: MonitorSubscriptionStatus,
  ): Promise<MonitorSubscriptionEntity> {
    const monitor = await this.getMonitor(ownerId, id);
    monitor.status = status;
    return this.monitorRepo.save(monitor);
  }

  private normalizeInterval(interval?: number): number {
    if (interval == null || !Number.isFinite(interval)) {
      return DEFAULT_INTERVAL_SECONDS;
    }
    return Math.max(MIN_INTERVAL_SECONDS, Math.floor(interval));
  }
}
