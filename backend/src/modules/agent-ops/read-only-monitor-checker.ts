import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  READ_ONLY_FETCHER,
  ReadOnlyFetcher,
} from './data-source-plugin.types';
import type { MonitorType } from './entities/monitor-subscription.entity';
import {
  evaluateMonitorCondition,
  MonitorCheckOutcome,
  MonitorCheckRequest,
  MonitorChecker,
  MonitorCondition,
  readPath,
} from './monitor.types';

/**
 * ReadOnlyMonitorChecker — 默认监控检查器:经**只读**采集路径执行周期检查。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5:`MonitorScheduler` 周期性**只读**检查;命中触发条件 → 推送告警。
 *   - 需求 9.1:周期性执行只读检查并在条件满足时推送告警。
 *   - 需求 9.2:覆盖 价格/清算/脱锚、治理提案、代币解锁、空投窗口、授权与安全异常。
 *
 * 复用 Task 12 的 {@link ReadOnlyFetcher}(navigate + browser_eval,read 风险档)采集观测数据,
 * 再用 {@link evaluateMonitorCondition} 纯函数按结构化条件判定是否命中。
 *
 * 硬约束:
 *   - **只读**:仅 navigate + browser_eval,绝不点击/输入/提交(不写操作)。
 *   - **不抛出**:采集失败归一为 `error` + `triggered:false` + `observations:null`。
 *   - **不编造**:采集失败时观测值为 null,绝不杜撰。
 *
 * 作为「兜底全类型」检查器:支持所有 {@link MonitorType}。可在模块内追加更专精的检查器
 * (各类型自有数据源/算子),由 {@link MonitorChecker.supports} 优先匹配。
 */
@Injectable()
export class ReadOnlyMonitorChecker implements MonitorChecker {
  private readonly logger = new Logger(ReadOnlyMonitorChecker.name);

  constructor(
    @Inject(READ_ONLY_FETCHER)
    private readonly fetcher: ReadOnlyFetcher,
  ) {}

  /** 兜底检查器:支持全部监控类型。 */
  supports(_type: MonitorType): boolean {
    return true;
  }

  async check(req: MonitorCheckRequest): Promise<MonitorCheckOutcome> {
    const { subscription } = req;
    const condition = (subscription.condition ?? {}) as MonitorCondition;
    const checkedAt = new Date().toISOString();

    const url = String(condition.url ?? '').trim();
    const extract = String(condition.extract ?? '').trim();

    // 无可采集目标 → 视为未命中(不编造),记录缺失原因。
    if (!url || !extract) {
      return {
        triggered: false,
        summary: '监控条件缺少 url/extract,未执行只读采集',
        observations: null,
        observedValue: null,
        checkedAt,
        error: 'MISSING_FETCH_TARGET',
      };
    }

    // 只读采集(navigate + browser_eval)。
    const res = await this.fetcher.fetch({
      userId: subscription.ownerId,
      agentId: subscription.agentId,
      url,
      extract,
    });

    if (!res.success) {
      return {
        triggered: false,
        summary: `只读采集失败(${res.failureReason ?? 'unknown'}),本次跳过`,
        observations: null,
        observedValue: null,
        checkedAt,
        error: res.error ?? res.failureReason ?? 'FETCH_FAILED',
      };
    }

    const data = res.data;
    const observations: Record<string, any> | null =
      data && typeof data === 'object' ? (data as Record<string, any>) : { value: data };

    // 解析用于比较的观测值。
    const observedRaw = readPath(data, condition.metric);
    const observedValue =
      observedRaw === undefined ? null : (observedRaw as any);

    // 窗口比较(解锁/空投领取窗口)边界解析。
    const windowStart = this.resolveTime(readPath(data, condition.windowStartField));
    const windowEnd = this.resolveTime(readPath(data, condition.windowEndField));

    // 上次观测值(供 change_pct_gte 比较)。
    const previousValue = this.previousObservedNumber(subscription);

    const triggered = evaluateMonitorCondition(condition, observedValue, {
      previousValue,
      windowStart,
      windowEnd,
    });

    return {
      triggered,
      summary: triggered
        ? `命中监控条件(${subscription.monitorType}:${condition.operator ?? 'truthy'})`
        : `未命中(${subscription.monitorType})`,
      observations,
      observedValue: observedValue ?? null,
      checkedAt,
    };
  }

  /** 从上次结果取数值观测,供变化率比较。 */
  private previousObservedNumber(
    subscription: MonitorCheckRequest['subscription'],
  ): number | null {
    const prev = subscription.lastResult?.observedValue;
    return typeof prev === 'number' && Number.isFinite(prev) ? prev : null;
  }

  /** 把字段值解析为 ms 时间戳(支持 number ms / number 秒 / ISO 字符串)。 */
  private resolveTime(v: unknown): number | null {
    if (v == null) return null;
    if (typeof v === 'number') {
      // 启发式:秒级(10 位)→ 转 ms。
      return v < 1e12 ? v * 1000 : v;
    }
    if (typeof v === 'string') {
      const t = Date.parse(v);
      return Number.isNaN(t) ? null : t;
    }
    return null;
  }
}
