import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Job, Queue, Worker } from 'bullmq';

import type { MonitorSubscriptionEntity } from './entities/monitor-subscription.entity';
import { MonitorService } from './monitor.service';
import { MonitorAlertDispatcher } from './monitor-alert-dispatcher.service';
import {
  MONITOR_CHECKERS,
  MonitorAlert,
  MonitorCheckOutcome,
  MonitorChecker,
} from './monitor.types';

/** BullMQ 监控任务载荷。 */
interface MonitorJobData {
  subscriptionId: string;
}

const QUEUE_NAME = 'agent-ops-monitor';

/**
 * MonitorScheduler — 周期只读监控调度(crypto-native-agent-ops 任务 16)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5:`MonitorScheduler`(**@Cron + BullMQ**)周期性**只读**检查;
 *     命中触发条件 → 多端推送(复用 voice output-dispatcher 多端分发)。
 *   - 需求 9.1:周期性执行只读检查并在条件满足时推送告警。
 *   - 需求 9.3:告警经多端(至少桌面 + 移动)送达 Agent 所有者。
 *
 * 调度模型(承袭 AGENTS.md:@Cron schedulers + BullMQ):
 *   1. `@Cron`(每分钟)扫描到期的 active 订阅(MonitorService.findDueMonitors);
 *   2. 每条到期订阅入队 BullMQ(jobId 去重,避免同一分钟重复入队);
 *   3. BullMQ Worker 串行/并发地拉起 {@link runCheck}:
 *      只读检查 → 回写 lastCheckedAt/lastResult → 命中则多端推送告警。
 *
 * Redis 不可用 / 显式禁用(测试/灰度)时:跳过队列创建,`@Cron` 直接内联执行
 * 到期检查(同一套 {@link runCheck}),保证功能可用与可测。
 */
@Injectable()
export class MonitorScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorScheduler.name);

  private queue: Queue<MonitorJobData> | null = null;
  private worker: Worker<MonitorJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly monitors: MonitorService,
    private readonly alertDispatcher: MonitorAlertDispatcher,
    @Inject(MONITOR_CHECKERS)
    private readonly checkers: MonitorChecker[],
  ) {}

  /** 是否禁用调度(测试/灰度/无 Redis)。 */
  private get disabled(): boolean {
    return process.env.AGENT_OPS_MONITOR_SCHEDULER_DISABLED === '1';
  }

  onModuleInit(): void {
    if (this.disabled) {
      this.logger.warn('MonitorScheduler disabled (env), queue not started');
      return;
    }

    try {
      const connection = this.getRedisConnection();
      this.queue = new Queue<MonitorJobData>(QUEUE_NAME, { connection });
      this.worker = new Worker<MonitorJobData>(
        QUEUE_NAME,
        async (job: Job<MonitorJobData>) => {
          await this.runCheck(job.data.subscriptionId);
        },
        { connection, concurrency: 4 },
      );
      this.worker.on('failed', (job, err) => {
        this.logger.error(
          `monitor job ${job?.id} (sub=${job?.data?.subscriptionId}) failed: ${err.message}`,
        );
      });
      this.logger.log('MonitorScheduler BullMQ queue + worker started');
    } catch (err: any) {
      // Redis 不可用 → 退化为内联执行(@Cron 仍可跑只读检查)。
      this.queue = null;
      this.worker = null;
      this.logger.warn(
        `MonitorScheduler queue init failed, falling back to inline checks: ${err?.message ?? err}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
  }

  /**
   * `@Cron`(每分钟):扫描到期订阅并调度检查。
   *
   * 有队列 → 入队(BullMQ Worker 消费);无队列 → 内联执行。
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'agent-ops-monitor-tick' })
  async handleTick(): Promise<void> {
    if (this.disabled) return;

    const now = new Date();
    let due: MonitorSubscriptionEntity[];
    try {
      due = await this.monitors.findDueMonitors(now);
    } catch (err: any) {
      this.logger.error(`findDueMonitors failed: ${err?.message ?? err}`);
      return;
    }
    if (due.length === 0) return;

    this.logger.debug(`monitor tick: ${due.length} due subscription(s)`);

    if (this.queue) {
      // 入队;jobId 去重(同一分钟同一订阅只入队一次)。
      const bucket = Math.floor(now.getTime() / 60_000);
      await Promise.all(
        due.map((sub) =>
          this.queue!.add(
            'check',
            { subscriptionId: sub.id },
            {
              jobId: `${sub.id}:${bucket}`,
              removeOnComplete: true,
              removeOnFail: 100,
            },
          ).catch((err) =>
            this.logger.error(
              `enqueue monitor ${sub.id} failed: ${err?.message ?? err}`,
            ),
          ),
        ),
      );
    } else {
      // 无队列:内联执行(串行,避免压垮只读采集)。
      for (const sub of due) {
        await this.runCheck(sub.id).catch((err) =>
          this.logger.error(
            `inline monitor ${sub.id} failed: ${err?.message ?? err}`,
          ),
        );
      }
    }
  }

  /**
   * 执行单条订阅的一次只读检查 → 回写结果 → 命中则多端推送告警。
   *
   * 公开供 BullMQ Worker、内联回退与集成测调用。
   */
  async runCheck(subscriptionId: string): Promise<MonitorCheckOutcome | null> {
    const sub = await this.monitors.findById(subscriptionId);
    if (!sub || sub.status !== 'active') {
      // 已暂停/删除/不存在 → 跳过(不报错)。
      return null;
    }

    const checker = this.resolveChecker(sub);
    let outcome: MonitorCheckOutcome;
    try {
      outcome = await checker.check({ subscription: sub });
    } catch (err: any) {
      // 检查器约定不抛出;兜底归一为未命中 + 错误(不编造)。
      outcome = {
        triggered: false,
        summary: `检查器异常:${err?.message ?? err}`,
        observations: null,
        observedValue: null,
        checkedAt: new Date().toISOString(),
        error: String(err?.message ?? err),
      };
    }

    // 回写 lastCheckedAt / lastResult(需求 9.4)。
    await this.monitors.recordCheckResult(sub.id, outcome);

    // 命中 → 多端推送告警(需求 9.1 / 9.3)。
    if (outcome.triggered) {
      const alert: MonitorAlert = {
        subscriptionId: sub.id,
        agentId: sub.agentId,
        monitorType: sub.monitorType,
        title: this.alertTitle(sub.monitorType),
        body: outcome.summary,
        observations: outcome.observations ?? null,
        triggeredAt: outcome.checkedAt,
      };
      await this.alertDispatcher.deliverAlert(sub.ownerId, alert);
    }

    return outcome;
  }

  /** 选择能处理该监控类型的检查器(取第一个 supports 为真者)。 */
  private resolveChecker(sub: MonitorSubscriptionEntity): MonitorChecker {
    const checker = this.checkers.find((c) => c.supports(sub.monitorType));
    if (!checker) {
      // 不应发生(存在兜底检查器);防御性兜底。
      throw new Error(`No monitor checker for type ${sub.monitorType}`);
    }
    return checker;
  }

  private alertTitle(type: MonitorSubscriptionEntity['monitorType']): string {
    const titles: Record<string, string> = {
      price: '价格告警',
      liquidation: '清算风险告警',
      depeg: '脱锚告警',
      governance: '治理提案告警',
      token_unlock: '代币解锁告警',
      airdrop_window: '空投领取窗口告警',
      approval_security: '授权与安全异常告警',
      protocol_metric: '协议指标告警',
      treasury: '金库告警',
      other: '监控告警',
    };
    return titles[type] ?? '监控告警';
  }

  private getRedisConnection(): { host: string; port: number } {
    return {
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
    };
  }
}
