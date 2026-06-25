import { checkRedline } from '../agent/redlines';

/**
 * 内容 / meme 生产 — 内容日历组织 + 配套素材校验 + 内容合规筛查(纯函数)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14.7:项目方提供品牌调性与主题 → 产出可保存/分享的内容日历
 *       (默认 ≥4 周,每周条目 ≥ 设定最小频次)。
 *   - 需求 14.8:为每个发布位产出配套素材(文案 + 图/meme 占位),
 *       标注主题 / 计划时间 / 平台。
 *   - 需求 14.9:内容 SHALL NOT 含无披露付费喊单 / 价格承诺 / 收益保证;
 *       对外发布走交付包 A 的 🟡 审批。
 *   - 需求 14.10:计费为订阅(条/周)。
 *   - design Property 3「红线不可绕过」(Validates 3.5/6.2)在内容场景的延伸:
 *       内容合规筛查复用后端单一权威红线集(`ABUSE_REDLINE_PATTERNS` via `checkRedline`),
 *       命中(undisclosed_shill / price_promise / yield_guarantee)即判不合规。
 *
 * 纯数据/算法,不含 I/O。运行期由 DeliveryPackageRunnerService / 内容执行链调用;
 * 对外发布动作的分级审批由 `S1_CONTENT_MEME_PACKAGE` 的 write_action 步骤承载(走交付包 A 🟡)。
 */

/** 内容日历默认最小周数(需求 14.7:默认 ≥4 周)。 */
export const DEFAULT_MIN_WEEKS = 4 as const;

/** 单个发布位(发布槽)。每个发布位须有配套素材(需求 14.8)。 */
export interface ContentSlot {
  /** 主题(需求 14.8 标注)。 */
  theme: string;
  /** 计划发布时间(ISO 字符串,需求 14.8 标注)。 */
  scheduledTime: string;
  /** 目标平台(x/telegram/discord/...,需求 14.8 标注)。 */
  platform: string;
  /** 文案(配套素材之一,需求 14.8)。 */
  copy: string;
  /**
   * 图 / meme 占位(配套素材之一,需求 14.8)。
   * 占位即可(非最终成图),但须存在(描述 / 占位引用)。
   */
  assetPlaceholder: string;
}

/** 一周的内容条目集合。 */
export interface ContentWeek {
  /** 周序(从 1 起,用于审计/展示)。 */
  weekIndex: number;
  /** 该周发布位。 */
  slots: ContentSlot[];
}

/** 内容日历(可保存/分享的交付物核心结构,需求 14.7)。 */
export interface ContentCalendar {
  /** 品牌调性(输入回填,便于交付物自洽)。 */
  brandTone?: string;
  /** 主题集合(输入回填)。 */
  themes?: string[];
  /** 周序列。 */
  weeks: ContentWeek[];
}

// ───────────────────────── 日历覆盖校验(14.7) ─────────────────────────

/** 日历覆盖校验结果(需求 14.7 量化验收口径)。 */
export interface CalendarCoverageResult {
  /** 是否合格(周数达标 + 每周频次达标)。 */
  qualified: boolean;
  /** 实际周数。 */
  weekCount: number;
  /** 要求最小周数。 */
  requiredWeeks: number;
  /** 要求每周最小条目数(设定最小频次)。 */
  requiredPerWeek: number;
  /** 周数是否达标(≥ requiredWeeks)。 */
  weeksSatisfied: boolean;
  /** 未达每周最小频次的周(周序 → {要求, 实际})。 */
  underfilledWeeks: { weekIndex: number; required: number; actual: number }[];
}

/**
 * 校验内容日历是否满足「默认 ≥4 周,每周条目 ≥ 设定最小频次」(需求 14.7)。
 *
 * @param calendar       内容日历。
 * @param minPerWeek     设定最小频次(每周最小条目数,必填,须 ≥1)。
 * @param minWeeks       最小周数(默认 {@link DEFAULT_MIN_WEEKS} = 4)。
 *
 * 合格条件(全部满足):
 *   1. 周数 ≥ minWeeks;
 *   2. 每一周的发布位数量 ≥ minPerWeek。
 */
export function validateCalendarCoverage(
  calendar: ContentCalendar | null | undefined,
  minPerWeek: number,
  minWeeks: number = DEFAULT_MIN_WEEKS,
): CalendarCoverageResult {
  const requiredWeeks = Math.max(1, Math.floor(minWeeks));
  const requiredPerWeek = Math.max(1, Math.floor(minPerWeek));
  const weeks = calendar?.weeks ?? [];
  const weekCount = weeks.length;
  const weeksSatisfied = weekCount >= requiredWeeks;

  const underfilledWeeks: CalendarCoverageResult['underfilledWeeks'] = [];
  weeks.forEach((week, i) => {
    const actual = week?.slots?.length ?? 0;
    if (actual < requiredPerWeek) {
      underfilledWeeks.push({
        weekIndex: week?.weekIndex ?? i + 1,
        required: requiredPerWeek,
        actual,
      });
    }
  });

  return {
    qualified: weeksSatisfied && underfilledWeeks.length === 0,
    weekCount,
    requiredWeeks,
    requiredPerWeek,
    weeksSatisfied,
    underfilledWeeks,
  };
}

// ───────────────────────── 配套素材校验(14.8) ─────────────────────────

/** 单个发布位素材完整性问题。 */
export interface SlotIssue {
  weekIndex: number;
  slotIndex: number;
  /** 缺失字段(theme/scheduledTime/platform/copy/assetPlaceholder)。 */
  missingFields: string[];
}

/** 配套素材校验结果(需求 14.8)。 */
export interface AssetCompletenessResult {
  /** 是否全部发布位均含配套素材且标注齐全。 */
  qualified: boolean;
  /** 校验的发布位总数。 */
  slotCount: number;
  /** 不完整的发布位。 */
  incompleteSlots: SlotIssue[];
}

/** 发布位必备字段(配套素材 + 标注,需求 14.8)。 */
const REQUIRED_SLOT_FIELDS: (keyof ContentSlot)[] = [
  'theme',
  'scheduledTime',
  'platform',
  'copy',
  'assetPlaceholder',
];

/**
 * 校验每个发布位是否产出配套素材(文案 + 图/meme 占位)并标注主题/计划时间/平台
 * (需求 14.8)。任一发布位缺字段 → 不合格。
 */
export function validateAssetCompleteness(
  calendar: ContentCalendar | null | undefined,
): AssetCompletenessResult {
  const weeks = calendar?.weeks ?? [];
  const incompleteSlots: SlotIssue[] = [];
  let slotCount = 0;

  weeks.forEach((week, wi) => {
    const slots = week?.slots ?? [];
    slots.forEach((slot, si) => {
      slotCount += 1;
      const missingFields = REQUIRED_SLOT_FIELDS.filter(
        (f) => !isNonEmptyString(slot?.[f]),
      );
      if (missingFields.length > 0) {
        incompleteSlots.push({
          weekIndex: week?.weekIndex ?? wi + 1,
          slotIndex: si,
          missingFields,
        });
      }
    });
  });

  return {
    qualified: slotCount > 0 && incompleteSlots.length === 0,
    slotCount,
    incompleteSlots,
  };
}

// ───────────────────────── 内容合规筛查(14.9 / 红线) ─────────────────────────

/** 单条内容合规筛查结果(需求 14.9 / Property 3)。 */
export interface ContentComplianceScreen {
  /** true = 合规;false = 命中内容红线。 */
  ok: boolean;
  /** 是否命中红线。 */
  redline: boolean;
  /** 命中的红线规则标识(审计用,如 abuse:undisclosed_shill / abuse:price_promise)。 */
  rule?: string;
  /** 拒绝原因。 */
  reason?: string;
}

/**
 * 筛查单条内容文本是否含无披露付费喊单 / 价格承诺 / 收益保证(需求 14.9)。
 *
 * 复用后端单一权威红线集(`ABUSE_REDLINE_PATTERNS` via `checkRedline`),命中
 * undisclosed_shill / price_promise / yield_guarantee 即判不合规(不可被任何策略绕过)。
 */
export function screenContentCompliance(
  text: string | null | undefined,
): ContentComplianceScreen {
  const corpus = (text ?? '').trim();
  if (!corpus) return { ok: true, redline: false };
  const check = checkRedline({ intent: corpus });
  if (!check.ok) {
    return {
      ok: false,
      redline: true,
      rule: check.rule,
      reason: check.reason,
    };
  }
  return { ok: true, redline: false };
}

/** 整本日历的内容合规筛查结果(逐发布位文案 + 素材占位)。 */
export interface CalendarComplianceResult {
  /** 是否全部内容均合规(无任一命中红线)。 */
  ok: boolean;
  /** 命中红线的发布位。 */
  violations: {
    weekIndex: number;
    slotIndex: number;
    field: 'copy' | 'assetPlaceholder';
    rule?: string;
    reason?: string;
  }[];
}

/**
 * 对整本内容日历逐发布位做内容合规筛查(需求 14.9)。
 * 检查每个发布位的文案与素材占位文本;任一命中红线 → ok=false 并记录违规位。
 */
export function screenCalendarCompliance(
  calendar: ContentCalendar | null | undefined,
): CalendarComplianceResult {
  const weeks = calendar?.weeks ?? [];
  const violations: CalendarComplianceResult['violations'] = [];

  weeks.forEach((week, wi) => {
    const slots = week?.slots ?? [];
    slots.forEach((slot, si) => {
      const fields: ('copy' | 'assetPlaceholder')[] = [
        'copy',
        'assetPlaceholder',
      ];
      for (const field of fields) {
        const screen = screenContentCompliance(slot?.[field]);
        if (!screen.ok) {
          violations.push({
            weekIndex: week?.weekIndex ?? wi + 1,
            slotIndex: si,
            field,
            rule: screen.rule,
            reason: screen.reason,
          });
        }
      }
    });
  });

  return { ok: violations.length === 0, violations };
}

// ───────────────────────── 综合验收(14.7 + 14.8 + 14.9) ─────────────────────────

/** 内容日历交付物综合验收结果。 */
export interface ContentCalendarValidation {
  /** 是否合格(覆盖达标 + 素材齐全 + 内容合规,全部满足)。 */
  qualified: boolean;
  coverage: CalendarCoverageResult;
  assets: AssetCompletenessResult;
  compliance: CalendarComplianceResult;
}

/**
 * 内容日历交付物综合验收(需求 14.7 + 14.8 + 14.9 的合取)。
 *
 * 合格 = 周数/频次达标(14.7) ∧ 每个发布位配套素材齐全(14.8) ∧ 内容合规(14.9)。
 * 任一不满足 → 不合格(`qualified=false`)。
 */
export function validateContentCalendar(
  calendar: ContentCalendar | null | undefined,
  minPerWeek: number,
  minWeeks: number = DEFAULT_MIN_WEEKS,
): ContentCalendarValidation {
  const coverage = validateCalendarCoverage(calendar, minPerWeek, minWeeks);
  const assets = validateAssetCompleteness(calendar);
  const compliance = screenCalendarCompliance(calendar);
  return {
    qualified: coverage.qualified && assets.qualified && compliance.ok,
    coverage,
    assets,
    compliance,
  };
}

// ───────────────────────── 内部工具 ─────────────────────────

/** 是否为非空字符串(去除首尾空白后非空)。 */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
