import type { DeliveryPackageTemplate } from '../delivery-package.types';

/**
 * S1 交付包 B · 内容 / meme 生产(crypto-native-agent-ops 任务 19.2 / 需求 14.7–14.10)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 账号授权前提:涉及项目方自有账号写操作 SHALL 先取得显式授权,未授权仅只读/草稿。
 *       · 分级审批锚点:只读/采集 = 🟢;对外发布 = 🟡(策略+预算放行,新模板首发人确认);
 *         无披露喊单等 = 红线拒绝(需求 6,不可绕过)。
 *   - 需求 14.7:项目方提供品牌调性与主题 → 产出可保存/分享的内容日历
 *       (默认 ≥4 周,每周条目 ≥ 设定最小频次)。
 *   - 需求 14.8:为每个发布位产出配套素材(文案 + 图/meme 占位),标注主题/计划时间/平台。
 *   - 需求 14.9:内容 SHALL NOT 含无披露付费喊单/价格承诺/收益保证;对外发布走交付包 A 的 🟡 审批。
 *   - 需求 14.10:计费为订阅(条/周)。
 *
 * 「交付包 = 任务模板」框架(输入 → 动作 → 交付物 → 量化验收 → 计费):
 *   - 内容日历(含每发布位配套素材)为只读自动产出(`deliverable_production`),
 *     落库为 `content_calendar` 交付物,**可保存/分享/复用**(需求 14.7)。
 *     量化验收同时校验:周数/频次覆盖(14.7)、配套素材齐全 + 标注(14.8)、内容合规(14.9);
 *     口径与红线筛查实现见 {@link content-calendar.ts}(validateContentCalendar)。
 *   - 对外发布为 `write_action`,运行时经分级审批(任务 9/10),即**走交付包 A 的 🟡 审批**
 *     (14.9):常规发布 → `publish`(medium,预算/频率内放行,否则回落人确认);
 *     框架本身**绝不代执行发布**,仅产出审批决策与审计记录。
 *   - 无披露付费喊单/价格承诺/收益保证命中后端红线集(`ABUSE_REDLINE_PATTERNS`:
 *     undisclosed_shill / price_promise / yield_guarantee),被永久拒绝(14.9 / Property 3),
 *     不可被任何策略/预算绕过。
 *
 * 注:内容日历交付物的「必备章节清单覆盖」(Runner 通用口径)采用以下章节;更细的
 * 周数/频次 + 素材齐全 + 内容合规判定由 content-calendar.ts 在产出/执行链中裁决。
 */

/**
 * 内容日历必备章节(需求 14.7/14.8 量化验收的章节级口径)。
 * 缺任一章节 → 交付物判不合格(`qualified=false`)。
 */
export const CONTENT_CALENDAR_REQUIRED_SECTIONS = [
  'brand_tone', // 品牌调性(输入回填,交付物自洽)
  'themes', // 主题集合(需求 14.7 输入 → 产出依据)
  'weeks', // 周序列(≥4 周,每周条目 ≥ 设定最小频次 —— 见 content-calendar 覆盖校验)
  'asset_slots', // 每发布位配套素材(文案 + 图/meme 占位 + 主题/计划时间/平台标注,14.8)
] as const;

export const S1_CONTENT_MEME_PACKAGE: DeliveryPackageTemplate = {
  slug: 's1-content-meme',
  stage: 'S1',
  title: 'S1 交付包 B · 内容 / meme 生产',
  summary:
    '由项目方品牌调性与主题产出可保存/分享的内容日历(默认 ≥4 周,每周条目 ≥ 设定最小频次),为每个发布位产出配套素材(文案 + 图/meme 占位)并标注主题/计划时间/平台;内容不含无披露付费喊单/价格承诺/收益保证(命中后端红线即拒);对外发布走交付包 A 的 🟡 审批,框架不代执行发布。',
  requirementRefs: ['14.7', '14.8', '14.9', '14.10'],

  // ───────── 输入 ─────────
  inputs: [
    {
      key: 'brandTone',
      label: '品牌调性(语气 / 风格 / 禁忌)',
      required: true,
      type: 'object',
    },
    {
      key: 'themes',
      label: '主题集合(内容选题)',
      required: true,
      type: 'string[]',
    },
    {
      key: 'minPerWeek',
      label: '每周最小频次(设定最小条目数)',
      required: true,
      type: 'number',
    },
    {
      key: 'minWeeks',
      label: '内容日历最小周数(默认 ≥4 周)',
      required: false,
      type: 'number',
    },
    {
      key: 'platforms',
      label: '目标平台集合(每个发布位标注其一)',
      required: false,
      type: 'string[]',
    },
  ],

  // ───────── 动作 + 交付物 ─────────
  steps: [
    {
      // 内容日历(含每发布位配套素材):只读自动产出,可保存/分享/复用(14.7/14.8)。
      // 量化验收:周数/频次覆盖 + 素材齐全标注 + 内容合规(见 content-calendar.ts)。
      id: 'content-calendar',
      label: '内容日历 + 配套素材(≥4 周 / 每周 ≥ 最小频次,文案 + 图/meme 占位)',
      kind: 'deliverable_production',
      requirementRefs: ['14.7', '14.8', '14.9'],
      deliverable: {
        deliverableType: 'content_calendar',
        requiredSections: [...CONTENT_CALENDAR_REQUIRED_SECTIONS],
      },
    },
    {
      // 对外发布:走交付包 A 的 🟡 审批(14.9)。常规发布 publish(medium):
      // 预算/频率上限内放行,否则回落人确认。框架不代执行发布。
      id: 'external-publish',
      label: '内容对外发布(走交付包 A 🟡 审批,预算/频率内放行)',
      kind: 'write_action',
      requirementRefs: ['14.9'],
      action: {
        actionType: 'publish',
        target: 'authorized_social_account',
      },
    },
  ],

  // ───────── 量化验收 ─────────
  acceptance: [
    {
      id: '14.7',
      description:
        '由品牌调性与主题产出可保存/分享的内容日历;默认 ≥4 周,每周条目数 ≥ 设定最小频次(周数或任一周频次不达标 → 不合格)。',
    },
    {
      id: '14.8',
      description:
        '每个发布位均含配套素材(文案 + 图/meme 占位)并标注主题/计划时间/平台;任一发布位缺字段 → 不合格。',
    },
    {
      id: '14.9',
      description:
        '内容不含无披露付费喊单/价格承诺/收益保证(命中后端红线 undisclosed_shill/price_promise/yield_guarantee 即判不合规并拒绝,不可被任何策略/预算绕过);对外发布经交付包 A 的 🟡 审批。',
    },
    {
      id: '14.10',
      description: '计费为订阅(条/周),按 user_subscription_usage 计量。',
    },
  ],

  // ───────── 计费 ─────────
  billing: {
    model: 'subscription',
    unit: '条/周',
    meteringRef: 'user_subscription_usage',
    note: '订阅制:按内容条数/周计量,挂载 user_subscription_usage(需求 14.10)。',
  },
};
