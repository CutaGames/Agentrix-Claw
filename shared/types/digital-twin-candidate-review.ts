/**
 * 分身带入批次与候选排序（合同 v1，backend、web 已评审，REQ-mobile-068；产品文档 1.9 第 5 步、DT-R05 / DT-R10.4；REQ-web-019 第 5 件，
 * backend 让 mobile 起草，REQ-mobile-064.re-backend）。
 *
 * 第 5 步"逐条确认"把访谈的候选和第 3 步读出来的资料候选排成一列给主人看。现在 web 用固定顺序
 * （`frontend/lib/digital-twin/creation-review.ts`：访谈原话 → 说话方式 → 资料按添加顺序），不判断冲突。
 * 这个文件把排序和冲突信号定下来，web 和以后的其他端用同一个纯函数，结果可以解释、可以复现。
 *
 * 排序依据（只用已有字段，不从正文推断重要性）：
 * 1. 档位 `tier`，按"是不是主人自己说的、确认到什么程度"：
 *    - `owner_confirmed`：访谈里主人亲口答的事实和自我介绍（`outputKind` 是 `confirmed_fact` / `persona_line`）；
 *    - `owner_style`：访谈里的说话方式（`style_instruction`）；
 *    - `owner_material`：主人声明是自己写的资料（`rights: 'self_authored'`）；
 *    - `licensed_material`：主人有授权的资料（`licensed`）；
 *    - `others_content`：别人的内容（`itemType: 'conversation'`，来自 `contains_third_party`），只作存档摘录。
 * 2. 同一档里：访谈按题目顺序（`DIGITAL_TWIN_INTERVIEW_QUESTION_IDS_V1`），同一题按行；资料按添加顺序，同一份按文档里的顺序。
 * 没有时间字段参与排序：访谈的 `version` 只说明改过几次，资料没有可靠的写作时间。
 *
 * 冲突信号（只提示，不阻止写入）：
 * - 规则和回答时的来源冲突完全一样（`detectDigitalTwinSourceConflictsV1`，DT-R06.6）：两条候选话题相同
 *   （词重合 ≥ 3 且 ≥ 较短一条的 40%），都写了数字，而且没有一个数字相同，比如访谈里"咨询 1200 元/小时"、
 *   资料里"咨询 800 元/小时"。不比较文字说法。
 * - 两条都写进去也不会让分身乱答：回答时遇到这种冲突，分身会说"要找本人"（`no_answer: source_conflict`）。
 *   所以第 5 步只是提前告诉主人，让他留一条。
 * - 显示规则：有冲突的候选所在的组不能"整组接受"，要一条一条确认；冲突的两条并排显示。
 * - 别人的内容（`others_content`）不参与冲突判断：它不会被当成主人的话来回答。
 * - 只检查排在前面的 `DIGITAL_TWIN_CANDIDATE_CONFLICT_CHECK_MAX` 条（候选太多时两两比较太慢），
 *   超出的部分 `conflictCheck.truncated` 为 `true`，界面照实写"只检查了前 N 条"。
 *
 * 输入对不上时（REQ-mobile-068.re-web）：
 * - 访谈条目在 `plan.canonical.items` 里找不到元数据（`questionId` / `outputKind`）：这是计划和文档对不上，
 *   调用方不要替它编一个题目，这条不传进来，界面写"有 N 条读不出来"。
 * - `key` 重复：返回 `{ ok: false, duplicateKeys }`，不抛错；调用方退回到不带冲突信号的固定顺序，
 *   并写"候选有重复，请重新读取"。
 */
import type { GenericArchiveItemV2 } from './agent-portability-archive-v2';
import { detectDigitalTwinSourceConflictsV1, type TwinContextItemV1 } from './digital-twin-answer';
import type { DigitalTwinIntakeRightsV1 } from './digital-twin-intake';
import {
  DIGITAL_TWIN_INTERVIEW_QUESTION_IDS_V1,
  type DigitalTwinCandidatePlanCanonicalItemV1,
  type DigitalTwinInterviewQuestionIdV1,
} from './digital-twin-interview';

export const DIGITAL_TWIN_CANDIDATE_TIERS_V1 = ['owner_confirmed', 'owner_style', 'owner_material', 'licensed_material', 'others_content'] as const;
export type DigitalTwinCandidateTierV1 = (typeof DIGITAL_TWIN_CANDIDATE_TIERS_V1)[number];

export const DIGITAL_TWIN_CANDIDATE_CONFLICT_CHECK_MAX = 500;

/** 一条候选。`key` 由调用方给，在这一批里唯一（web 现在用 `interview:<id>` / `material:<源>:<id>`）。 */
export type DigitalTwinCandidateInputV1 =
  | {
      key: string;
      origin: 'interview';
      item: GenericArchiveItemV2;
      interview: Pick<DigitalTwinCandidatePlanCanonicalItemV1, 'questionId' | 'outputKind'>;
    }
  | {
      key: string;
      origin: 'material';
      item: GenericArchiveItemV2;
      material: {
        /** 这份资料在本页的添加顺序，从 0 开始。 */
        sourceIndex: number;
        rights: DigitalTwinIntakeRightsV1;
      };
    };

export interface DigitalTwinRankedCandidateV1 {
  key: string;
  /** 0 = 最先显示。 */
  rank: number;
  tier: DigitalTwinCandidateTierV1;
  /** 这条和哪些候选冲突（它们的 `key`），没有就是空数组。 */
  conflictsWith: string[];
}

export interface DigitalTwinCandidateConflictV1 {
  /** 两条候选的 `key`，按排序先后。 */
  keys: [string, string];
  /** 各自写到的数字（规范化以后）。 */
  figures: [string[], string[]];
}

export interface DigitalTwinCandidateReviewV1 {
  ranked: DigitalTwinRankedCandidateV1[];
  conflicts: DigitalTwinCandidateConflictV1[];
  conflictCheck: { checked: number; truncated: boolean };
}

export type DigitalTwinCandidateReviewResultV1 = { ok: true; value: DigitalTwinCandidateReviewV1 } | { ok: false; duplicateKeys: string[] };

/** 候选的正文（和 web 的 `twinReviewItemText` 一样）；不是文字的类型返回空串。 */
export function digitalTwinCandidateTextV1(item: GenericArchiveItemV2): string {
  switch (item.itemType) {
    case 'memory':
      return item.payload.content;
    case 'instruction':
      return item.payload.text;
    case 'conversation':
      return item.payload.excerpt;
    case 'preference':
      return `${item.payload.key}: ${item.payload.value}`;
    default:
      return '';
  }
}

/**
 * 档位。别人的内容一律最后；资料里 `unknown` 的权利声明本来不会有候选（隔离），出现了按最低的资料档处理。
 */
export function digitalTwinCandidateTierV1(input: DigitalTwinCandidateInputV1): DigitalTwinCandidateTierV1 {
  if (input.item.itemType === 'conversation') return 'others_content';
  if (input.origin === 'interview') return input.interview.outputKind === 'style_instruction' ? 'owner_style' : 'owner_confirmed';
  if (input.material.rights === 'self_authored') return 'owner_material';
  if (input.material.rights === 'contains_third_party') return 'others_content';
  return 'licensed_material';
}

const QUESTION_ORDER = new Map<DigitalTwinInterviewQuestionIdV1, number>(DIGITAL_TWIN_INTERVIEW_QUESTION_IDS_V1.map((id, index) => [id, index]));
const TIER_ORDER = new Map<DigitalTwinCandidateTierV1, number>(DIGITAL_TWIN_CANDIDATE_TIERS_V1.map((tier, index) => [tier, index]));

/** 排序并给出冲突信号。纯函数：同样的输入永远得到同样的结果；`key` 重复时返回 `ok: false`，列出重复的 key。 */
export function reviewDigitalTwinCandidatesV1(inputs: readonly DigitalTwinCandidateInputV1[]): DigitalTwinCandidateReviewResultV1 {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const input of inputs) {
    if (seen.has(input.key)) duplicates.add(input.key);
    seen.add(input.key);
  }
  if (duplicates.size > 0) return { ok: false, duplicateKeys: [...duplicates].sort() };
  const decorated = inputs.map((input, position) => ({
    input,
    position,
    tier: digitalTwinCandidateTierV1(input),
    group: input.origin === 'interview' ? QUESTION_ORDER.get(input.interview.questionId) ?? Number.MAX_SAFE_INTEGER : input.material.sourceIndex,
  }));
  decorated.sort(
    (a, b) =>
      (TIER_ORDER.get(a.tier) ?? 0) - (TIER_ORDER.get(b.tier) ?? 0) ||
      a.group - b.group ||
      // Same question or same source: the order they arrived in (line order).
      a.position - b.position,
  );

  const eligible = decorated.filter((entry) => entry.tier !== 'others_content');
  const checked = eligible.slice(0, DIGITAL_TWIN_CANDIDATE_CONFLICT_CHECK_MAX);
  // One rule for step 5 and for answering: the same detector, fed the candidates as context items.
  const asContext: TwinContextItemV1[] = checked.map((entry) => ({
    canonicalId: entry.input.key,
    kind: 'memory',
    text: digitalTwinCandidateTextV1(entry.input.item),
    sensitivity: 'owner',
    sourceItemRef: entry.input.key,
    sourceItemDigest: '',
    currentVersion: '0',
  }));
  const conflicts: DigitalTwinCandidateConflictV1[] = detectDigitalTwinSourceConflictsV1(asContext).map((conflict) => ({
    keys: [conflict.canonicalIds[0], conflict.canonicalIds[1]],
    figures: [[...conflict.numbers[0]].sort(), [...conflict.numbers[1]].sort()],
  }));
  const partners = new Map<string, string[]>();
  for (const conflict of conflicts) {
    const [a, b] = conflict.keys;
    partners.set(a, [...(partners.get(a) ?? []), b]);
    partners.set(b, [...(partners.get(b) ?? []), a]);
  }
  return {
    ok: true,
    value: {
      ranked: decorated.map((entry, rank) => ({ key: entry.input.key, rank, tier: entry.tier, conflictsWith: partners.get(entry.input.key) ?? [] })),
      conflicts,
      conflictCheck: { checked: checked.length, truncated: eligible.length > checked.length },
    },
  };
}
