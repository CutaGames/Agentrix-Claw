/**
 * L9 P2-7 · 一键带走：客户、问答、转介账、回执。
 *
 * 在 ACCOUNT_EXPORT_V2 的基础上（同一个开关、同一套规矩：只读登录态里的属主、最近 10 分钟登录过、一次一份、限频），
 * 再给「做生意的人」一份只含生意数据的文件，格式是一份普通 JSON，不依赖 Agentrix 就能读。
 *
 * - 客户：访客在名片上留下的联系方式和留言（被删除或过期的线索只剩一条空壳，没有联系方式和留言）。
 * - 问答：和分身的私下对话、分身对访客回答的判定记录（只有类别和原因，没有访客原话）、待复核条目（只有编号、优先级、
 *   原因码、建议动作、状态和时间，没有访客问题的片段）。
 * - 转介账：本人发起的（introducer）和转给本人的（introduced）。**只含本人这一侧**：对方主人的 id、客户的联系方式
 *   （封存的邮箱和它的哈希）、一次性确认码的哈希一律不放。
 * - 回执：用过哪些上下文的回执（和全量导出的 `receipts` 同一份）。
 * - 内容里只有本人的东西：每个来源都按登录态里的属主读，导出前再扫一遍别人的属主字段，发现就整份拒绝。
 * - 删除可验证：`/check` 只返回各分区还剩多少条，和「已删除的线索里还留着联系方式的条数」（应该是 0）。
 *
 * 开关：后端 `ACCOUNT_EXPORT_V2_ENABLED`（已开）加 `ACCOUNT_EXPORT_BUSINESS_V1_ENABLED`，都只认精确的 `'1'`，加 L9 名单（P1-0）；
 * 关着时路由回 404，什么都不读。网页入口 `NEXT_PUBLIC_ACCOUNT_EXPORT_BUSINESS_V1_ENABLED`。
 */
import type { AccountExportReceiptV2 } from './account-export';

export const BUSINESS_EXPORT_SCHEMA_VERSION_V1 = 1 as const;
export const BUSINESS_EXPORT_FORMAT_V1 = 'agentrix.business-export' as const;
export const BUSINESS_EXPORT_ROUTES_V1 = {
  export: '/account-export/business/v1',
  check: '/account-export/business/v1/check',
} as const;

export const BUSINESS_EXPORT_SECTIONS_V1 = ['customers', 'answers', 'introductions', 'receipts'] as const;
export type BusinessExportSectionKeyV1 = (typeof BUSINESS_EXPORT_SECTIONS_V1)[number];

export const BUSINESS_EXPORT_SECTION_STATUSES_V1 = ['complete', 'truncated', 'unavailable'] as const;
export type BusinessExportSectionStatusV1 = (typeof BUSINESS_EXPORT_SECTION_STATUSES_V1)[number];

export const BUSINESS_EXPORT_LIMITS_V1 = {
  /** 每个分区最多多少条。 */
  maxItemsPerSection: 5000,
  /** 一份导出所有分区加起来最多多少字节。 */
  maxTotalBytes: 50 * 1024 * 1024,
  /** 同一个账户两次导出之间至少隔多少秒。 */
  minIntervalSeconds: 30,
  /** 同一个账户一小时最多导出几次。 */
  maxPerHour: 6,
} as const;

export interface BusinessExportSectionV1<T> {
  status: BusinessExportSectionStatusV1;
  count: number;
  items: T[];
}

/** 一条客户线索。被删除或过期的线索：`state` 是 `deleted`，`contact` 和 `message` 是 null。 */
export interface BusinessExportCustomerV1 {
  id: string;
  agentId: string;
  state: string;
  channel: string;
  contact: string | null;
  message: string | null;
  purpose: string;
  consentCopyVersion: number;
  consentLanguage: string;
  consentAcceptedAt: string;
  retentionExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export const BUSINESS_EXPORT_ANSWER_KINDS_V1 = ['private_turn', 'decision', 'review_item'] as const;
export type BusinessExportAnswerKindV1 = (typeof BUSINESS_EXPORT_ANSWER_KINDS_V1)[number];

export interface BusinessExportAnswerV1 {
  kind: BusinessExportAnswerKindV1;
  id: string;
  agentId: string;
  /** 只有 `private_turn` 有正文（本人和分身的私下对话）；判定记录和待复核条目没有访客原话。 */
  text: string | null;
  role: 'creator' | 'twin' | null;
  answerClass: string | null;
  noAnswerReason: string | null;
  /** 只有 `review_item` 有：待复核条目里逐字段挑出的几项（见 `BusinessExportReviewDetailV1`），没有访客原话。 */
  detail: BusinessExportReviewDetailV1 | null;
  createdAt: string;
}

/**
 * 待复核条目在文件里的样子：只有编号、优先级、原因码、建议动作、状态和时间。
 * 访客问题的片段（`questionSample`）、来源输出的引用一律不放（评审 D-R2）。
 */
export interface BusinessExportReviewDetailV1 {
  reviewId: string;
  priority: string;
  reasonCodes: string[];
  recommendedActions: string[];
  state: string;
  createdAt: string;
}

export const BUSINESS_EXPORT_INTRODUCTION_ROLES_V1 = ['introducer', 'introduced'] as const;
export type BusinessExportIntroductionRoleV1 = (typeof BUSINESS_EXPORT_INTRODUCTION_ROLES_V1)[number];

/** 转介账里本人这一侧。没有对方主人的 id，没有客户的联系方式（封存值、哈希）、没有确认码哈希。 */
export interface BusinessExportIntroductionV1 {
  id: string;
  role: BusinessExportIntroductionRoleV1;
  status: string;
  purpose: string;
  shareBps: number;
  tierPreset: string | null;
  bKind: string;
  bDisplayName: string | null;
  cKind: string;
  createdAt: string;
  expiresAt: string;
  bAcceptedAt: string | null;
  cConfirmedAt: string | null;
  activatedAt: string | null;
  /** 回执（签名的）。 */
  receiptJti: string | null;
  receiptJws: string | null;
}

export interface BusinessExportOmissionV1 {
  section: BusinessExportSectionKeyV1;
  reasonCode: 'section_limit' | 'read_failed';
  count: number;
}

export interface BusinessExportV1 {
  schemaVersion: typeof BUSINESS_EXPORT_SCHEMA_VERSION_V1;
  format: typeof BUSINESS_EXPORT_FORMAT_V1;
  exportId: string;
  generatedAt: string;
  /** 导出的是谁的账户：登录态里的属主 id。 */
  account: { ownerId: string };
  sections: {
    customers: BusinessExportSectionV1<BusinessExportCustomerV1>;
    answers: BusinessExportSectionV1<BusinessExportAnswerV1>;
    introductions: BusinessExportSectionV1<BusinessExportIntroductionV1>;
    receipts: BusinessExportSectionV1<AccountExportReceiptV2>;
  };
  omissions: BusinessExportOmissionV1[];
  /** `sha256:` + `sections` 按键排序后的 JSON 的 SHA-256。拿到文件的人可以重算，看内容有没有被改过。 */
  sectionsDigest: string;
}

/** 删除后的核对：各分区还剩多少条。数字都是计数，没有内容。 */
export interface BusinessExportCheckV1 {
  schemaVersion: typeof BUSINESS_EXPORT_SCHEMA_VERSION_V1;
  checkedAt: string;
  counts: {
    customers: { active: number; deleted: number };
    answers: { privateTurns: number; decisions: number; reviewItems: number };
    introductions: { introducer: number; introduced: number };
    receipts: number;
  };
  /** 已删除的线索里还留着联系方式或留言的条数。删干净了就是 0。 */
  deletedStillHoldingContact: number;
  /** 每个分区读失败的话列在这里（数字不可信，不能当作「已删干净」）。 */
  unavailable: BusinessExportSectionKeyV1[];
  /** 所有分区都读到了、并且没有残留：可以说「已删干净」。 */
  verifiedEmpty: boolean;
}

export const BUSINESS_EXPORT_ERROR_CODES_V1 = {
  rateLimited: 'business_export_rate_limited',
  inProgress: 'business_export_in_progress',
  foreignData: 'business_export_foreign_data',
} as const;

/** 拿到的文件头是不是这份格式（写成文件之前先查，形状不对就不保存）。 */
export function isBusinessExportDocumentV1(value: unknown): value is BusinessExportV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.format !== BUSINESS_EXPORT_FORMAT_V1 || record.schemaVersion !== BUSINESS_EXPORT_SCHEMA_VERSION_V1) return false;
  if (typeof record.exportId !== 'string' || typeof record.generatedAt !== 'string' || typeof record.sectionsDigest !== 'string') return false;
  const sections = record.sections;
  if (typeof sections !== 'object' || sections === null) return false;
  return BUSINESS_EXPORT_SECTIONS_V1.every((key) => {
    const section = (sections as Record<string, unknown>)[key] as { items?: unknown; status?: unknown } | undefined;
    return typeof section === 'object' && section !== null && Array.isArray(section.items) && typeof section.status === 'string';
  });
}

export function isBusinessExportCheckV1(value: unknown): value is BusinessExportCheckV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== BUSINESS_EXPORT_SCHEMA_VERSION_V1 || typeof record.checkedAt !== 'string') return false;
  if (typeof record.verifiedEmpty !== 'boolean' || typeof record.deletedStillHoldingContact !== 'number') return false;
  if (!Array.isArray(record.unavailable)) return false;
  const counts = record.counts as Record<string, unknown> | undefined;
  if (typeof counts !== 'object' || counts === null) return false;
  return typeof counts.receipts === 'number' && typeof counts.customers === 'object' && typeof counts.answers === 'object' && typeof counts.introductions === 'object';
}

export function businessExportFileNameV1(document: Pick<BusinessExportV1, 'generatedAt'>): string {
  return `agentrix-business-export-${document.generatedAt.slice(0, 10)}.json`;
}
