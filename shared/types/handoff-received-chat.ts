import { SUBMIT_CANDIDATES_BOUNDS } from './agent-portability-experience-v2';

/**
 * Chat meta `kind: 'handoff_received'`. The owner has a freshly accepted
 * CandidateSnapshot waiting in the inbox. Nothing here is Import Authority,
 * and no item text or pairing code is included.
 */
export const HANDOFF_RECEIVED_CHAT_KIND = 'handoff_received' as const;

/** Same horizon as a live pairing session — older received snapshots stay in the inbox only. */
export const HANDOFF_RECEIVED_FRESH_MS = SUBMIT_CANDIDATES_BOUNDS.maxSessionTtlSeconds * 1000;

export interface HandoffReceivedChatMetaV1 {
  snapshotRef: string;
  sessionRef: string;
  itemCount: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseHandoffReceivedChatMetaV1(input: unknown): HandoffReceivedChatMetaV1 | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const snapshotRef = typeof record.snapshotRef === 'string' ? record.snapshotRef : '';
  const sessionRef = typeof record.sessionRef === 'string' ? record.sessionRef : '';
  const itemCount = typeof record.itemCount === 'number' && Number.isFinite(record.itemCount)
    ? Math.trunc(record.itemCount)
    : 0;
  if (!UUID.test(snapshotRef) || !UUID.test(sessionRef) || itemCount < 1) return null;
  return { snapshotRef, sessionRef, itemCount };
}
