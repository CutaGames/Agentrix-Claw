/**
 * 「待我处理」unified queue skeleton — MTR-R17.2 / M1.2.3, design §4.3.
 *
 * Only `developer_approval` produces items today; the other sources are in the
 * shape so that adding them later cannot re-open the design question this
 * module exists to settle.
 *
 * The question: developer approvals are realtime, carry an expiry and fail
 * closed; twin reviews are a weekly batch with no expiry, sampled by impact,
 * against a 15-minute weekly budget. A single "risk desc + expiry asc" sort
 * buries every twin review at the bottom forever. So `cadence` partitions
 * first, and only the realtime partition uses that sort.
 */

export const UNIFIED_INBOX_SOURCES = [
  'developer_approval',
  'twin_review',
  'twin_answer',
  'schedule',
] as const;

export type UnifiedInboxSource = (typeof UNIFIED_INBOX_SOURCES)[number];

export type UnifiedInboxCadence = 'realtime' | 'weekly';

export type UnifiedInboxRisk = 'low' | 'medium' | 'high' | 'unknown';

export interface UnifiedInboxItem {
  /** Opaque, prefixed by source. Never parsed for meaning. */
  readonly itemRef: string;
  readonly source: UnifiedInboxSource;
  /** Decides the partition. Does NOT participate in the within-partition sort. */
  readonly cadence: UnifiedInboxCadence;
  readonly risk: UnifiedInboxRisk;
  /** Exact digest; a decision must fresh-read and compare before submitting. */
  readonly digest: string;
  /** Weekly items normally have none. */
  readonly expiresAt?: string;
  readonly capturedAt: string;
}

export interface UnifiedInboxPartitions {
  readonly realtime: UnifiedInboxItem[];
  readonly weekly: UnifiedInboxItem[];
}

/** design §4.3: `unknown` sorts after `high`, ahead of everything it could be. */
const RISK_ORDER: Readonly<Record<UnifiedInboxRisk, number>> = Object.freeze({
  high: 0,
  unknown: 1,
  medium: 2,
  low: 3,
});

/** Which cadence a source belongs to when the item does not declare one. */
const SOURCE_DEFAULT_CADENCE: Readonly<Record<UnifiedInboxSource, UnifiedInboxCadence>> =
  Object.freeze({
    developer_approval: 'realtime',
    twin_review: 'weekly',
    twin_answer: 'weekly',
    schedule: 'realtime',
  });

export function defaultCadenceForSource(source: UnifiedInboxSource): UnifiedInboxCadence {
  return SOURCE_DEFAULT_CADENCE[source];
}

function expiryRank(item: UnifiedInboxItem): number {
  if (!item.expiresAt) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(item.expiresAt);
  // An unparseable expiry is not "no expiry" — treat it as the most urgent
  // thing we cannot reason about, consistent with unknown risk failing closed.
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function capturedRank(item: UnifiedInboxItem): number {
  const parsed = Date.parse(item.capturedAt);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/** Anything we cannot classify is treated as `unknown`, i.e. fail closed. */
function riskRank(item: UnifiedInboxItem): number {
  const rank = RISK_ORDER[item?.risk as UnifiedInboxRisk];
  return rank === undefined ? RISK_ORDER.unknown : rank;
}

function byRef(a: UnifiedInboxItem, b: UnifiedInboxItem): number {
  return a.itemRef < b.itemRef ? -1 : a.itemRef > b.itemRef ? 1 : 0;
}

/**
 * risk desc → expiry asc → capturedAt asc → itemRef.
 * The last key only exists to make the order total, so two renders of the same
 * payload cannot disagree.
 */
export function compareRealtimeInboxItems(a: UnifiedInboxItem, b: UnifiedInboxItem): number {
  const risk = riskRank(a) - riskRank(b);
  if (risk !== 0) return risk;
  const expiryA = expiryRank(a);
  const expiryB = expiryRank(b);
  if (expiryA !== expiryB) return expiryA < expiryB ? -1 : 1;
  const capturedA = capturedRank(a);
  const capturedB = capturedRank(b);
  if (capturedA !== capturedB) return capturedA < capturedB ? -1 : 1;
  return byRef(a, b);
}

/** Weekly items are sampled by the server; the client only keeps arrival order stable. */
export function compareWeeklyInboxItems(a: UnifiedInboxItem, b: UnifiedInboxItem): number {
  const capturedA = capturedRank(a);
  const capturedB = capturedRank(b);
  if (capturedA !== capturedB) return capturedA < capturedB ? -1 : 1;
  return byRef(a, b);
}

export function partitionUnifiedInbox(
  items: readonly UnifiedInboxItem[],
): UnifiedInboxPartitions {
  const realtime: UnifiedInboxItem[] = [];
  const weekly: UnifiedInboxItem[] = [];
  for (const item of items ?? []) {
    (item?.cadence === 'weekly' ? weekly : realtime).push(item);
  }
  return {
    realtime: realtime.sort(compareRealtimeInboxItems),
    weekly: weekly.sort(compareWeeklyInboxItems),
  };
}

export interface WeeklyInboxProgress {
  readonly total: number;
  readonly remaining: number;
  readonly done: number;
}

/**
 * `weeklyBatchSize` is the size the server said this week's batch has. The
 * queue only holds what is still open, so progress is batch minus remaining.
 */
export function weeklyInboxProgress(
  partitions: UnifiedInboxPartitions,
  weeklyBatchSize?: number,
): WeeklyInboxProgress {
  const remaining = partitions.weekly.length;
  const total = Number.isInteger(weeklyBatchSize) && (weeklyBatchSize as number) >= remaining
    ? (weeklyBatchSize as number)
    : remaining;
  return { total, remaining, done: total - remaining };
}

/**
 * MTR-R10.3 — unknown risk fails closed: it can be read, never bulk-actioned.
 */
export function isBatchEligible(item: UnifiedInboxItem): boolean {
  return item.cadence === 'weekly' && item.risk === 'low';
}
