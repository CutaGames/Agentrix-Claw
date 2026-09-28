/**
 * mattersPending — 事项 → 待我处理 (M3-a; product doc 5.3 / 5.4 / 5.6).
 *
 * Pure (no React Native import): folds the backend reads into one list the
 * screen renders as is.
 *   - 电脑发来的审批: pending desktop-sync approvals (`GET /desktop-sync/state`).
 *     What the phone may do with each one comes from `mobileApprovalPolicy`
 *     (mirrors the backend response policy), so a button is shown only when
 *     the backend will accept it from the phone.
 *   - 分身复核: open Twin review items (`GET /v1/agents/:id/twin/review`),
 *     decided on Web (D16).
 *   - 交接: no backend list exists yet, so nothing is shown for it (5.6
 *     "不可用就显示不可用", no invented rows).
 *
 * Order (5.3 "按过期时间排序"): items that expire come first, soonest first;
 * then items without an expiry by priority (critical → insight), oldest
 * first; expired approvals last, read-only.
 */
import type { MobileDesktopApproval } from './desktopSync';
import { mobileApprovalCapabilities, type MobileApprovalCapabilities } from './mobileApprovalPolicy';
import type { MobileTwinReviewItem } from './twinReviewQueue';
import type { DigitalTwinReviewPriorityV1 } from '../../shared/types/digital-twin';

export type MattersPendingKind = 'computer_approval' | 'twin_review';
export type MattersPendingRisk = 'L0' | 'L1' | 'L2' | 'L3' | 'unknown';

export interface MattersPendingItem {
  /** Unique across kinds: `<kind>:<id>`. */
  key: string;
  kind: MattersPendingKind;
  id: string;
  title: string;
  detail: string | null;
  risk: MattersPendingRisk | null;
  priority: DigitalTwinReviewPriorityV1;
  /** When the item stops being actionable (approval `expiresAt`); null = no expiry. */
  dueAt: string | null;
  expired: boolean;
  createdAt: string | null;
  deviceId: string | null;
  /** Approvals only: exactly what the phone may send. Review items are decided on Web. */
  capabilities: MobileApprovalCapabilities | null;
}

const PRIORITY_RANK: Readonly<Record<DigitalTwinReviewPriorityV1, number>> = {
  critical: 0,
  action: 1,
  review: 2,
  insight: 3,
};

const KNOWN_RISK = new Set(['L0', 'L1', 'L2', 'L3']);

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function approvalItem(approval: MobileDesktopApproval, now: number): MattersPendingItem | null {
  const id = String(approval?.approvalId ?? '').trim();
  if (!id || approval.status !== 'pending') return null;
  const expiresAt = typeof approval.expiresAt === 'string' && approval.expiresAt ? approval.expiresAt : null;
  const dueMs = parseTime(expiresAt);
  // An unparsable expiry fails closed (same rule as the approval policy).
  const expired = expiresAt !== null && (dueMs === null || dueMs <= now);
  const risk = String(approval.riskLevel ?? '');
  return {
    key: `computer_approval:${id}`,
    kind: 'computer_approval',
    id,
    title: typeof approval.title === 'string' && approval.title.trim() ? approval.title.trim() : id,
    detail: typeof approval.description === 'string' && approval.description.trim() ? approval.description.trim() : null,
    risk: KNOWN_RISK.has(risk) ? (risk as MattersPendingRisk) : 'unknown',
    priority: 'action',
    dueAt: expiresAt,
    expired,
    createdAt: typeof approval.requestedAt === 'string' ? approval.requestedAt : null,
    deviceId: typeof approval.deviceId === 'string' && approval.deviceId ? approval.deviceId : null,
    capabilities: mobileApprovalCapabilities(approval, now),
  };
}

function reviewItem(item: MobileTwinReviewItem): MattersPendingItem {
  return {
    key: `twin_review:${item.reviewRef}`,
    kind: 'twin_review',
    id: item.reviewRef,
    title: item.question,
    detail: null,
    risk: null,
    priority: item.priority,
    dueAt: null,
    expired: false,
    createdAt: item.createdAt,
    deviceId: null,
    capabilities: null,
  };
}

function group(item: MattersPendingItem): number {
  if (item.expired) return 2;
  return item.dueAt ? 0 : 1;
}

export function compareMattersPending(a: MattersPendingItem, b: MattersPendingItem): number {
  const byGroup = group(a) - group(b);
  if (byGroup !== 0) return byGroup;
  if (group(a) !== 1) {
    const byDue = (parseTime(a.dueAt) ?? 0) - (parseTime(b.dueAt) ?? 0);
    if (byDue !== 0) return byDue;
  }
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  const byCreated = (parseTime(a.createdAt) ?? Number.MAX_SAFE_INTEGER) - (parseTime(b.createdAt) ?? Number.MAX_SAFE_INTEGER);
  if (byCreated !== 0) return byCreated;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function buildMattersPending(input: {
  approvals?: readonly MobileDesktopApproval[] | null;
  twinReview?: readonly MobileTwinReviewItem[] | null;
  now?: number;
}): MattersPendingItem[] {
  const now = input.now ?? Date.now();
  const seen = new Set<string>();
  const items: MattersPendingItem[] = [];
  const push = (item: MattersPendingItem | null) => {
    if (!item || seen.has(item.key)) return;
    seen.add(item.key);
    items.push(item);
  };
  for (const approval of input.approvals ?? []) push(approvalItem(approval, now));
  for (const review of input.twinReview ?? []) push(reviewItem(review));
  return items.sort(compareMattersPending);
}

/** "还剩 5 分钟" / "5 min left" / "已过期"; null when there is no expiry. */
export function mattersDueLabel(item: Pick<MattersPendingItem, 'dueAt' | 'expired'>, now: number, lang: 'zh' | 'en'): string | null {
  if (item.expired) return lang === 'zh' ? '已过期' : 'Expired';
  const due = parseTime(item.dueAt);
  if (due === null) return null;
  const minutes = Math.max(1, Math.ceil((due - now) / 60_000));
  if (minutes < 60) return lang === 'zh' ? `还剩 ${minutes} 分钟` : `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return lang === 'zh' ? `还剩 ${hours} 小时` : `${hours} h left`;
  const days = Math.floor(hours / 24);
  return lang === 'zh' ? `还剩 ${days} 天` : `${days} d left`;
}
