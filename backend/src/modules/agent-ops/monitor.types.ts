import type {
  MonitorSubscriptionEntity,
  MonitorType,
} from './entities/monitor-subscription.entity';

/**
 * 监控告警 — 公共类型与可注入契约(crypto-native-agent-ops 任务 16)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5「监控告警」:`MonitorScheduler`(@Cron + BullMQ)周期性**只读**检查
 *     (价格/清算/脱锚、治理提案、代币解锁、空投资格/领取窗口、授权与安全异常);
 *     命中触发条件 → 多端推送(复用 voice `output-dispatcher` 多端分发)。
 *   - 需求 9.1:周期性只读检查 + 命中即推送告警。
 *   - 需求 9.2:监控类型至少覆盖 价格/清算/脱锚、治理提案、代币解锁、空投窗口、授权与安全异常。
 *   - 需求 9.3:告警经多端(至少桌面 + 移动)送达 Agent 所有者。
 *   - 需求 9.4:监控任务可暂停 / 修改 / 删除,并展示上次检查时间与结果。
 *
 * 设计要点:
 *   - 检查为**只读**(read 风险档):经 Task 12 的 `ReadOnlyFetcher`(navigate + browser_eval)
 *     或等价只读路径采集数据,绝不执行任何写操作。
 *   - 检查器抽象在 {@link MonitorChecker} 接口后,集成测可注入确定性 mock。
 */

/**
 * 结构化触发条件(落 `monitor_subscription.condition` jsonb)。
 *
 * 通用比较型条件:从目标页面只读提取一个观测值/对象,按 `operator` 与 `value`/窗口字段比较。
 * 不同监控类型(价格/解锁/空投窗口/授权异常等)复用同一套比较算子,差异仅在 `url`/`extract`/`metric`。
 */
export interface MonitorCondition {
  /** 只读采集的目标 URL(经 ReadOnlyFetcher navigate)。 */
  url?: string;
  /** 只读 JS 提取表达式(在页面上下文求值,返回可序列化值/对象)。 */
  extract?: string;
  /** 观测对象中用于比较的字段路径(点分,如 `price` / `holders.top`);缺省用提取到的原始值。 */
  metric?: string;
  /** 比较算子。 */
  operator?: MonitorOperator;
  /** 比较阈值(数值/字符串/布尔)。 */
  value?: number | string | boolean;
  /** `change_pct_gte`:相对上次观测值的变化百分比阈值(>=)。 */
  baseline?: number;
  /** `in_window`:窗口起始字段路径(时间戳/ISO)。 */
  windowStartField?: string;
  /** `in_window`:窗口结束字段路径(时间戳/ISO)。 */
  windowEndField?: string;
  /** 透传给检查器的附加参数(目标地址/代币 symbol 等)。 */
  [key: string]: any;
}

/**
 * 比较算子:
 *  - 数值比较:gt / gte / lt / lte / eq / neq
 *  - 存在性:exists(非 null/undefined 即触发)
 *  - 真值:truthy(布尔/非空即触发)
 *  - 变化率:change_pct_gte(|当前-baseline|/baseline*100 >= value)
 *  - 窗口:in_window(now ∈ [windowStart, windowEnd] 即触发,用于解锁/空投领取窗口)
 */
export type MonitorOperator =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'exists'
  | 'truthy'
  | 'change_pct_gte'
  | 'in_window';

/** 单次只读检查结果(写入 `lastResult`)。 */
export interface MonitorCheckOutcome {
  /** 触发条件是否命中。 */
  triggered: boolean;
  /** 人类可读摘要(供告警正文 / 展示 lastResult)。 */
  summary: string;
  /** 采集到的观测数据(结构化,不编造;采集失败时为 null)。 */
  observations?: Record<string, any> | null;
  /** 用于比较的观测值(便于审计与下次 change_pct 比较)。 */
  observedValue?: number | string | boolean | null;
  /** 检查时间(ISO 8601)。 */
  checkedAt: string;
  /** 只读采集失败时的结构化原因(不影响后续重试;不编造数据)。 */
  error?: string;
}

/** 检查请求上下文。 */
export interface MonitorCheckRequest {
  subscription: MonitorSubscriptionEntity;
}

/**
 * 监控检查器(可注入,集成测可 mock)。
 *
 * 实现约束(硬):
 *   1. **只读**:仅经只读采集路径读取数据,绝不写操作。
 *   2. **不抛出**:任何采集失败归一为 `error` + `triggered:false` + `observations:null`。
 *   3. **不编造**:无法核实的观测值不写入(留 null)。
 */
export interface MonitorChecker {
  /** 该检查器能否处理此监控类型。 */
  supports(type: MonitorType): boolean;
  /** 执行一次只读检查。 */
  check(req: MonitorCheckRequest): Promise<MonitorCheckOutcome>;
}

/** 监控检查器集合注入令牌(multi-provider 聚合)。 */
export const MONITOR_CHECKERS = Symbol('MONITOR_CHECKERS');

// ───────────────────────── 多端告警分发 ─────────────────────────

/** 告警内容(命中触发条件后推送)。 */
export interface MonitorAlert {
  /** 监控订阅 id。 */
  subscriptionId: string;
  /** 执行检查的 Agent。 */
  agentId: string;
  /** 监控类型。 */
  monitorType: MonitorType;
  /** 告警标题。 */
  title: string;
  /** 告警正文摘要。 */
  body: string;
  /** 命中时的观测数据(供前端展示)。 */
  observations?: Record<string, any> | null;
  /** 命中时间(ISO 8601)。 */
  triggeredAt: string;
}

/** 多端送达结果(需求 9.3:至少桌面 + 移动)。 */
export interface MonitorAlertDeliveryResult {
  /** 是否至少送达一台设备。 */
  delivered: boolean;
  /** 触达的会话数。 */
  sessionsReached: number;
  /** 去重后的送达设备类型(用于校验「多端」覆盖)。 */
  deviceTypes: string[];
  /** 触达的设备总数。 */
  deviceCount: number;
}

/** 告警送达事件名(Socket.IO,多端统一)。 */
export const MONITOR_ALERT_EVENT = 'agent_ops:monitor_alert';

/**
 * 纯函数:按 {@link MonitorCondition} 评估观测数据是否命中触发条件。
 *
 * 抽离为纯函数便于单测(不依赖网络/数据库)。
 *
 * @param condition 结构化触发条件。
 * @param observedValue 用于比较的观测值(由检查器从提取数据中解析)。
 * @param ctx 可选上下文:`previousValue`(change_pct 比较基线)、`now`(窗口比较,默认当前)、
 *            `windowStart`/`windowEnd`(in_window 窗口边界,ms 时间戳)。
 */
export function evaluateMonitorCondition(
  condition: MonitorCondition,
  observedValue: unknown,
  ctx?: {
    previousValue?: number | null;
    now?: number;
    windowStart?: number | null;
    windowEnd?: number | null;
  },
): boolean {
  const op = condition.operator ?? 'truthy';

  switch (op) {
    case 'exists':
      return observedValue !== null && observedValue !== undefined;

    case 'truthy':
      return Boolean(observedValue);

    case 'in_window': {
      const now = ctx?.now ?? Date.now();
      const start = ctx?.windowStart ?? null;
      const end = ctx?.windowEnd ?? null;
      if (start !== null && now < start) return false;
      if (end !== null && now > end) return false;
      // 至少要有一个边界,否则视为未命中(避免空窗口恒真)。
      return start !== null || end !== null;
    }

    case 'change_pct_gte': {
      const cur = toNumber(observedValue);
      const base =
        ctx?.previousValue ?? toNumber(condition.baseline) ?? null;
      const threshold = toNumber(condition.value);
      if (cur === null || base === null || base === 0 || threshold === null) {
        return false;
      }
      const pct = (Math.abs(cur - base) / Math.abs(base)) * 100;
      return pct >= threshold;
    }

    case 'eq':
      return looseEq(observedValue, condition.value);

    case 'neq':
      return !looseEq(observedValue, condition.value);

    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const cur = toNumber(observedValue);
      const target = toNumber(condition.value);
      if (cur === null || target === null) return false;
      if (op === 'gt') return cur > target;
      if (op === 'gte') return cur >= target;
      if (op === 'lt') return cur < target;
      return cur <= target;
    }

    default:
      return false;
  }
}

/** 从点分路径读取嵌套字段。 */
export function readPath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  if (obj === null || typeof obj !== 'object') return undefined;
  return path
    .split('.')
    .reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/[, $]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}
