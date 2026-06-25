import type { DeliveryPackageTemplate } from '../delivery-package.types';

/**
 * S2/S3 辅助交付包 · 上所 / 做市监控 / BD / 融资(IR) / 治理
 * (crypto-native-agent-ops 任务 23 / 需求 16;**agent 辅助,非交付**)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 16.1:CEX/Launchpad 上所的**申请材料准备、提交辅助与状态跟踪**,
 *       并明示「最终决策/关系/法务靠人」。
 *   - 需求 16.2:DEX 上线与流动性/做市的**监控看板**(不代执行 wash trading 等违规拉量,见需求 6)。
 *   - 需求 16.3:合作/集成 BD 与对外融资(IR)的**线索发现、外联草稿、CRM 跟踪**;
 *       签约/谈判/法务为 🔴 需人。
 *   - 需求 16.4:治理提案**起草/摘要与投票动员辅助**。
 *   - 需求 16.5:本需求所有事项标注为「**agent 辅助**」,交付物为**备料/外联/跟踪记录**,
 *       而非承诺结果(如「保证上所」)。
 *   - design §C7「交付包 = 任务模板」:每个含「输入 → 动作 → 交付物 → 量化验收 → 计费」。
 *
 * 「交付包 = 任务模板」框架(输入 → 动作 → 交付物 → 量化验收 → 计费):
 *   - **上所备料**(listing_prep_dossier):CEX/Launchpad 申请材料 + 提交清单 + 状态跟踪,
 *     只读自动产出(🟢);必含「最终决策/关系/法务靠人」声明(需求 16.1/16.5)。
 *   - **上所提交**(write_action):向交易所/Launchpad 提交申请为不可逆对外动作 →
 *     `irreversible_submit`(high)→ user_confirmation;agent **仅备料/辅助,不承诺上所结果**(16.1/16.5)。
 *   - **做市监控看板**(market_making_monitor):DEX 上线状态 + 流动性指标 + 做市监控 + 告警,
 *     只读自动产出(🟢)。周期只读检查复用 Task 16 `MonitorService`/`MonitorScheduler`
 *     (MonitorType `price`/`protocol_metric` 覆盖价格/流动性指标)。**仅监控看板,
 *     绝不代执行 wash trading 等违规拉量**(需求 16.2 / 6;wash trading 命中后端红线集
 *     `ABUSE_REDLINE_PATTERNS` → 永久拒绝,不可被任何策略/预算绕过)。
 *   - **BD/IR 线索 + 外联草稿 + CRM**(bd_ir_leads):合作/集成 BD 与对外融资(IR)线索发现、
 *     外联草稿、CRM 跟踪,只读自动产出(🟢)。沿用 Task 19.3 `kol-crm` 的发现/CRM 口径。
 *   - **BD/IR 外联**(write_action):外联触达为 🟡 → `submit_form`(medium):策略+预算内放行,
 *     否则回落人确认;框架**绝不代执行外联**。
 *   - **签约/谈判/法务承诺**(write_action):🔴 强制人确认 → `irreversible_submit`(high)
 *     → user_confirmation;agent **仅备料跟踪,SHALL NOT 自动签约/谈判/作法务承诺**(16.3)。
 *   - **治理辅助**(governance_assist):提案起草/摘要 + 投票动员辅助,只读自动产出(🟢);
 *     必含「agent 辅助,不承诺投票/治理结果」声明(16.4/16.5)。
 *   - **链上提案提交/投票**(write_action):上链提交/投票为不可逆链上动作 →
 *     `irreversible_submit`(high)→ user_confirmation;无披露付费动员等命中红线被拒。
 *
 * 全包交付物形态为「**备料 / 外联 / 跟踪记录**」,每个交付物含「agent 辅助 / 靠人 / 不承诺结果」
 * 声明章节(需求 16.5);任何对外提交/签约/上链均为写动作,经分级审批,框架不代执行、不承诺结果。
 */

/** 上所备料交付物必备章节(需求 16.1/16.5)。 */
export const LISTING_PREP_REQUIRED_SECTIONS = [
  'application_materials', // 申请材料(交易所/Launchpad 所需文档清单与内容)
  'submission_checklist', // 提交辅助清单(各步骤/字段就绪度)
  'status_tracking', // 状态跟踪(申请进度/沟通记录/待办)
  'human_decision_notice', // 明示「最终决策/关系/法务靠人」+ agent 辅助不承诺上所(16.1/16.5)
] as const;

/** 做市监控看板交付物必备章节(需求 16.2/16.5)。 */
export const MARKET_MAKING_MONITOR_REQUIRED_SECTIONS = [
  'dex_listing_status', // DEX 上线状态(交易对/池子/上线进度)
  'liquidity_metrics', // 流动性指标(TVL/深度/价差,只读读数)
  'market_making_monitor', // 做市监控(报价/库存/偏离,只读看板)
  'alerts', // 异常告警汇总
  'no_wash_trading_notice', // 仅监控、不代执行 wash trading 等违规拉量声明(16.2/6)
] as const;

/** BD/IR 线索 + 外联草稿 + CRM 跟踪交付物必备章节(需求 16.3/16.5)。 */
export const BD_IR_LEADS_REQUIRED_SECTIONS = [
  'leads', // 合作/集成 BD + 对外融资(IR)线索(每条含可核来源)
  'outreach_drafts', // 外联草稿(邮件/私信模板,待审批后触达)
  'crm_tracking', // CRM 跟踪(触达/回复/阶段状态记录)
  'human_required_notice', // 签约/谈判/法务 = 🔴 需人;agent 仅备料/外联/跟踪(16.3/16.5)
] as const;

/** 治理辅助交付物必备章节(需求 16.4/16.5)。 */
export const GOVERNANCE_ASSIST_REQUIRED_SECTIONS = [
  'proposal_draft', // 治理提案起草
  'proposal_summary', // 提案摘要
  'voting_mobilization', // 投票动员辅助(动员材料/触达计划)
  'assist_disclaimer', // agent 辅助,不承诺投票/治理结果声明(16.4/16.5)
] as const;

export const S2S3_ASSIST_PACKAGE: DeliveryPackageTemplate = {
  slug: 's2s3-assist',
  stage: 'cross_cutting',
  title: 'S2/S3 辅助 · 上所 / 做市监控 / BD / 融资(IR) / 治理(agent 辅助,非交付)',
  summary:
    'CEX/Launchpad 上所备料 + 提交辅助 + 状态跟踪(明示最终决策/关系/法务靠人);DEX 上线与流动性/做市监控看板(仅监控,绝不代执行 wash trading 等违规拉量);合作/集成 BD 与对外融资(IR)线索发现 + 外联草稿 + CRM 跟踪(外联 🟡 审批,签约/谈判/法务 🔴 需人);治理提案起草/摘要 + 投票动员辅助。所有事项均为「agent 辅助」,交付物为备料/外联/跟踪记录,不承诺结果(如不保证上所)。',
  requirementRefs: ['16.1', '16.2', '16.3', '16.4', '16.5'],

  // ───────── 输入 ─────────
  inputs: [
    {
      key: 'projectName',
      label: '项目名称',
      required: true,
      type: 'string',
    },
    {
      key: 'listingTargets',
      label: '上所目标(CEX / Launchpad 名单 + 申请要求)',
      required: false,
      type: 'object',
    },
    {
      key: 'dexMonitorTargets',
      label: 'DEX 上线/流动性/做市监控目标(交易对/池子地址 + 触发条件)',
      required: false,
      type: 'object',
    },
    {
      key: 'bdIrProfile',
      label: 'BD/IR 画像(合作/集成方向 + 融资轮次/对象画像)',
      required: false,
      type: 'object',
    },
    {
      key: 'governanceContext',
      label: '治理上下文(提案主题/治理平台/快照参数)',
      required: false,
      type: 'object',
    },
    {
      key: 'outreachApproved',
      label: 'BD/IR 外联是否已获项目方批准(批准后方可触达)',
      required: false,
      type: 'boolean',
    },
  ],

  // ───────── 动作 + 交付物 ─────────
  steps: [
    {
      // 上所备料:只读自动产出(🟢),申请材料 + 提交清单 + 状态跟踪;必含「靠人/不承诺」声明。
      id: 'listing-prep-dossier',
      label: 'CEX/Launchpad 上所备料 + 提交辅助清单 + 状态跟踪(明示最终决策/关系/法务靠人)',
      kind: 'deliverable_production',
      requirementRefs: ['16.1', '16.5'],
      deliverable: {
        deliverableType: 'listing_prep_dossier',
        requiredSections: [...LISTING_PREP_REQUIRED_SECTIONS],
      },
    },
    {
      // 上所提交:🔴 不可逆对外提交 → 强制人确认。agent 仅辅助提交,不承诺上所结果(16.1/16.5)。
      id: 'listing-submission',
      label: '上所申请提交(🔴 强制人确认,不可逆对外提交;agent 仅辅助不承诺结果)',
      kind: 'write_action',
      requirementRefs: ['16.1', '16.5'],
      action: {
        actionType: 'irreversible_submit',
        target: 'exchange_listing_application',
        toExternalDomain: true,
      },
    },
    {
      // 做市监控看板:只读自动产出(🟢),DEX 上线/流动性/做市监控 + 告警;仅监控不代执行拉量。
      // 周期只读检查复用 Task 16 MonitorService(price/protocol_metric)。
      id: 'market-making-monitor',
      label: 'DEX 上线 + 流动性/做市监控看板(仅监控,绝不代执行 wash trading)',
      kind: 'deliverable_production',
      requirementRefs: ['16.2', '16.5'],
      deliverable: {
        deliverableType: 'market_making_monitor',
        requiredSections: [...MARKET_MAKING_MONITOR_REQUIRED_SECTIONS],
      },
    },
    {
      // BD/IR 线索 + 外联草稿 + CRM:只读自动产出(🟢),沿用 Task 19.3 kol-crm 发现/CRM 口径。
      id: 'bd-ir-leads',
      label: '合作/集成 BD + 对外融资(IR)线索 + 外联草稿 + CRM 跟踪(签约/谈判/法务靠人)',
      kind: 'deliverable_production',
      requirementRefs: ['16.3', '16.5'],
      deliverable: {
        deliverableType: 'bd_ir_leads',
        requiredSections: [...BD_IR_LEADS_REQUIRED_SECTIONS],
      },
    },
    {
      // BD/IR 外联触达:🟡 经分级审批(submit_form / medium)。策略+预算内放行,否则回落人确认。
      // 框架不代执行外联;触达后由 CRM 记录统计。
      id: 'bd-ir-outreach',
      label: 'BD/IR 外联触达(🟡 经审批,策略+预算内放行,否则回落人确认)',
      kind: 'write_action',
      requirementRefs: ['16.3'],
      action: {
        actionType: 'submit_form',
        target: 'bd_ir_outreach_channel',
      },
    },
    {
      // 签约/谈判/法务承诺:🔴 强制人确认(irreversible_submit / high)。
      // agent 仅备料跟踪,SHALL NOT 自动签约/谈判/作法务承诺(16.3)。
      id: 'bd-ir-commit',
      label: '合作/融资签约/谈判/法务承诺(🔴 强制人确认,agent 仅备料不自动签约)',
      kind: 'write_action',
      requirementRefs: ['16.3'],
      action: {
        actionType: 'irreversible_submit',
        target: 'bd_ir_partnership_agreement',
      },
    },
    {
      // 治理辅助:只读自动产出(🟢),提案起草/摘要 + 投票动员;必含「agent 辅助/不承诺」声明。
      id: 'governance-assist',
      label: '治理提案起草/摘要 + 投票动员辅助(agent 辅助,不承诺治理结果)',
      kind: 'deliverable_production',
      requirementRefs: ['16.4', '16.5'],
      deliverable: {
        deliverableType: 'governance_assist',
        requiredSections: [...GOVERNANCE_ASSIST_REQUIRED_SECTIONS],
      },
    },
    {
      // 链上提案提交/投票:🔴 不可逆链上动作 → 强制人确认。无披露付费动员等命中红线被拒。
      id: 'governance-onchain-submit',
      label: '治理提案上链提交/投票(🔴 强制人确认,不可逆链上动作)',
      kind: 'write_action',
      requirementRefs: ['16.4'],
      action: {
        actionType: 'irreversible_submit',
        target: 'governance_onchain_proposal',
        toExternalDomain: true,
      },
    },
  ],

  // ───────── 量化验收 ─────────
  acceptance: [
    {
      id: '16.1',
      description:
        'CEX/Launchpad 上所备料覆盖 application_materials/submission_checklist/status_tracking/human_decision_notice 章节,明示「最终决策/关系/法务靠人」;上所提交为 🔴 写动作(irreversible_submit → high → user_confirmation),agent 仅辅助不承诺上所结果。',
    },
    {
      id: '16.2',
      description:
        'DEX 上线与流动性/做市监控看板覆盖 dex_listing_status/liquidity_metrics/market_making_monitor/alerts/no_wash_trading_notice 章节;仅监控,SHALL NOT 代执行 wash trading 等违规拉量(命中后端红线集被永久拒绝,需求 6)。',
    },
    {
      id: '16.3',
      description:
        'BD/IR 交付物覆盖 leads/outreach_drafts/crm_tracking/human_required_notice 章节;外联为 🟡 审批(submit_form → medium,策略+预算内放行否则回落人确认);签约/谈判/法务为 🔴 人确认(irreversible_submit → high),agent 仅备料/外联/跟踪,SHALL NOT 自动签约。',
    },
    {
      id: '16.4',
      description:
        '治理辅助覆盖 proposal_draft/proposal_summary/voting_mobilization/assist_disclaimer 章节(提案起草/摘要 + 投票动员);链上提案提交/投票为 🔴 人确认(irreversible_submit → high)。',
    },
    {
      id: '16.5',
      description:
        '本包所有事项标注为「agent 辅助」,交付物为备料/外联/跟踪记录(每个交付物含 靠人/不承诺结果 声明章节),而非承诺结果(如「保证上所」);任何对外提交/签约/上链均为写动作经分级审批,框架不代执行、不承诺结果。',
    },
  ],

  // ───────── 计费 ─────────
  billing: {
    model: 'subscription',
    unit: '事项 / 周期(上所/监控/BD/IR/治理 辅助)',
    meteringRef: 'user_subscription_usage',
    note: 'S2/S3 为关系/法务密集事项的 agent 辅助(非交付):按订阅周期计量备料/外联/跟踪工作量,挂载 user_subscription_usage;不按「上所成功/融资到账」等结果计费(需求 16.5)。',
  },
};
