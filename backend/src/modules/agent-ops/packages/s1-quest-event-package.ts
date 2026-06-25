import type { DeliveryPackageTemplate } from '../delivery-package.types';

/**
 * S1 交付包 D · Quest / 活动(Galxe/Zealy)(crypto-native-agent-ops 任务 19.4 / 需求 14.16–14.19)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 分级审批锚点:核验 = 🟢(只读自动);活动「配置上线」= 🟡 人确认
 *         (防错误条件/奖励,需求 14.16);多钱包 sybil 制造/买粉/刷量 = 红线拒绝(需求 6)。
 *   - 需求 14.16:项目方提供活动目标与任务清单 → 配置活动;配置上线为 🟡 人确认
 *       (防错误条件/奖励)。
 *   - 需求 14.17:交付活动核验报告 —— 合格参与者 = 完成必做任务且过反 sybil 的「唯一」参与者;
 *       完成率 = 合格 / 总参与者;列出被排除者及依据。
 *   - 需求 14.18:反 sybil 校验复用需求 15 的只读链上分析,仅识别标记,SHALL NOT 反向用于
 *       制造 sybil,SHALL NOT 自动处置奖励发放(由项目方决定)。
 *   - 需求 14.19:计费为按结果(合格参与者数)。
 *
 * 「交付包 = 任务模板」框架(输入 → 动作 → 交付物 → 量化验收 → 计费):
 *   - 活动核验报告为只读自动产出(`deliverable_production`,🟢 核验),落库为 `quest_verification`
 *     交付物,可保存/分享/复用。合格判定 / 完成率 / 被排除依据 / 反 sybil 只读评分口径见
 *     {@link quest-verification.ts}(buildQuestVerificationReport / screenParticipantSybil)。
 *   - 「配置上线」为 `write_action`,🟡 但**强制人确认**(需求 14.16 防错误条件/奖励):
 *     用高风险动作类型 `external_publish`(对外发布活动配置 + 设定奖励条件)→ high →
 *     user_confirmation,**预算授权不可绕过**;框架**绝不代执行上线**(仅返回决策)。
 *   - 反 sybil 仅做只读识别与标记(评分 + 可疑簇 + 依据);**不自动处置奖励发放**(由项目方决定,
 *     14.18),亦 SHALL NOT 反向用于制造 sybil。
 *   - 多钱包 sybil 制造 / 买粉 / 刷量等达成路径命中后端红线集(`ABUSE_REDLINE_PATTERNS`),被永久
 *     拒绝(需求 6,不可被任何策略/预算绕过)。
 */

/**
 * 活动核验报告交付物必备章节(需求 14.17 量化验收的章节级口径)。
 * 缺任一章节 → 交付物判不合格(`qualified=false`)。更细的合格判定/完成率/反 sybil
 * 由 quest-verification.ts 在产出链中裁决。
 */
export const QUEST_VERIFICATION_REQUIRED_SECTIONS = [
  'qualified_participants', // 合格参与者(完成必做任务且过反 sybil 的唯一参与者,需求 14.17)
  'excluded_participants', // 被排除者及依据(未完成必做 / 反 sybil 标记,需求 14.17)
  'completion_rate', // 完成率 = 合格 / 总参与者(需求 14.17)
  'sybil_findings', // 反 sybil 只读发现(风险评分 + 可疑簇 + 依据,需求 14.18 / 15.2)
] as const;

export const S1_QUEST_EVENT_PACKAGE: DeliveryPackageTemplate = {
  slug: 's1-quest-event',
  stage: 'S1',
  title: 'S1 交付包 D · Quest / 活动(Galxe/Zealy)',
  summary:
    '由活动目标与任务清单配置活动(配置上线为 🟡 强制人确认,防错误条件/奖励);交付活动核验报告:合格参与者=完成必做任务且过反 sybil 的唯一参与者、完成率=合格/总参与者、列出被排除者及依据;反 sybil 复用需求 15 的只读链上分析,仅识别标记(评分+可疑簇+依据),不反向制造 sybil、不自动处置奖励发放(由项目方决定);计费为按结果(合格参与者数)。',
  requirementRefs: ['14.16', '14.17', '14.18', '14.19'],

  // ───────── 输入 ─────────
  inputs: [
    {
      key: 'questConfig',
      label: '活动配置(活动目标 + 任务清单,含必做/可选标注)',
      required: true,
      type: 'object',
    },
    {
      key: 'sybilThresholds',
      label: '反 sybil 阈值(链上交易数/钱包年龄/交互对手数/簇规模/风险评分阈值)',
      required: false,
      type: 'object',
    },
    {
      key: 'participants',
      label: '参与者提交数据(地址 + 完成任务 + 链上行为读数)',
      required: false,
      type: 'object',
    },
  ],

  // ───────── 动作 + 交付物 ─────────
  steps: [
    {
      // 活动「配置上线」:🟡 但强制人确认(需求 14.16 防错误条件/奖励)。
      // 用高风险 external_publish(对外发布配置 + 设定奖励条件)→ high → 人确认,预算不可绕过。
      // 框架不代执行上线;仅返回审批决策。
      id: 'quest-config-publish',
      label: '活动配置上线(🟡 强制人确认,防错误条件/奖励)',
      kind: 'write_action',
      requirementRefs: ['14.16'],
      action: {
        actionType: 'external_publish',
        target: 'quest_platform_config',
      },
    },
    {
      // 活动核验报告:只读自动产出(🟢 核验),可保存/分享/复用。
      // 量化验收:章节覆盖 + 合格判定/完成率/反 sybil 只读评分(见 quest-verification.ts)。
      id: 'quest-verification',
      label: '活动核验报告(合格参与者/完成率/被排除依据 + 反 sybil 只读发现)',
      kind: 'deliverable_production',
      requirementRefs: ['14.17', '14.18'],
      deliverable: {
        deliverableType: 'quest_verification',
        requiredSections: [...QUEST_VERIFICATION_REQUIRED_SECTIONS],
      },
    },
  ],

  // ───────── 量化验收 ─────────
  acceptance: [
    {
      id: '14.16',
      description:
        '由活动目标与任务清单配置活动;配置上线为 🟡 人确认(external_publish → high → user_confirmation),预算授权不可绕过,防错误条件/奖励;框架 SHALL NOT 代执行上线。',
    },
    {
      id: '14.17',
      description:
        '交付活动核验报告:合格参与者 = 完成全部必做任务且过反 sybil 的唯一参与者(按地址去重);完成率 = 合格/总参与者(两位小数,总参与者为 0 时取「未获取」不编造);列出被排除者及依据(未完成必做任务 / 反 sybil 标记)。',
    },
    {
      id: '14.18',
      description:
        '反 sybil 校验复用需求 15 的只读链上分析,仅识别标记(风险评分 + 可疑簇 + 判定依据);SHALL NOT 反向用于制造 sybil;SHALL NOT 自动处置奖励发放(被排除者仅标记并列依据,发放与处置由项目方决定)。',
    },
    {
      id: '14.19',
      description: '计费为按结果(合格参与者数)。',
    },
  ],

  // ───────── 计费 ─────────
  billing: {
    model: 'per_result',
    unit: '合格参与者数',
    meteringRef: 'none',
    note: '按结果计量(需求 14.19):合格参与者数 = 完成必做任务且过反 sybil 的唯一参与者数。',
  },
};
