/**
 * twinReviewQueue — the open 分身复核 items, read-only, for 事项 → 待我处理
 * (M3-a; product doc 5.3 "待我处理（审批 · 分身复核 · 交接）").
 *
 *   GET /v1/agents/:agentId/twin/review   (owner-scoped, `JwtAuthGuard`)
 *
 * The phone lists what is waiting and opens the Web twin workspace to decide.
 * Confirming or correcting an inference changes what the twin may say as
 * "confirmed by the person", which is content editing (D16 / 8.3: Web only),
 * so this module has no decision call.
 */
import {
  DIGITAL_TWIN_REVIEW_PRIORITIES_V1,
  type DigitalTwinReviewPriorityV1,
} from '../../shared/types/digital-twin';
import type { MobileReadState } from './mobileReadState';
import {
  TWIN_STATUS_CAPABILITY,
  getTwinJson,
  isSafeTwinAgentId,
  readDigitalTwinEnvelope,
  resolveTwinTransport,
  type TwinStatusTransportInput,
} from './twinStatus';

export const TWIN_REVIEW_QUESTION_PREVIEW_CHARS = 120;

export function twinReviewPath(agentAccountId: string): string {
  return `/v1/agents/${encodeURIComponent(agentAccountId)}/twin/review`;
}

export interface MobileTwinReviewItem {
  reviewRef: string;
  priority: DigitalTwinReviewPriorityV1;
  /** Preview only (≤120 chars); the full item is read on Web. */
  question: string;
  createdAt: string;
}

export interface MobileTwinReviewQueue {
  open: MobileTwinReviewItem[];
}

export type TwinReviewQueueReadState = MobileReadState<MobileTwinReviewQueue>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > TWIN_REVIEW_QUESTION_PREVIEW_CHARS ? `${flat.slice(0, TWIN_REVIEW_QUESTION_PREVIEW_CHARS - 1)}…` : flat;
}

/** One `TwinReviewEntryV1` → what the list shows; anything not open or malformed is dropped. */
export function normalizeTwinReviewEntry(input: unknown): MobileTwinReviewItem | null {
  if (!isRecord(input) || !isRecord(input.item)) return null;
  const item = input.item;
  if (item.state !== 'open') return null;
  const ref = isRecord(item.reviewRef) && typeof item.reviewRef.id === 'string' ? item.reviewRef.id.trim() : '';
  if (!ref || typeof item.createdAt !== 'string') return null;
  const priority = (DIGITAL_TWIN_REVIEW_PRIORITIES_V1 as readonly unknown[]).includes(item.priority)
    ? (item.priority as DigitalTwinReviewPriorityV1)
    : 'review';
  const text =
    typeof input.question === 'string' && input.question.trim()
      ? input.question
      : typeof item.questionSample === 'string'
        ? item.questionSample
        : '';
  return { reviewRef: ref, priority, question: preview(text), createdAt: item.createdAt };
}

export async function fetchTwinReviewQueue(
  agentAccountId: string,
  input: TwinStatusTransportInput = {},
): Promise<TwinReviewQueueReadState> {
  if (!isSafeTwinAgentId(agentAccountId)) {
    return { kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'agent_account_required' };
  }
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { kind: 'unauthorized', reason: 'authentication_required' };
  const now = input.now ?? (() => new Date().toISOString());
  const response = await getTwinJson(transport, `${baseUrl}${twinReviewPath(agentAccountId)}`, token);
  if (!response) return { kind: 'error', retryable: true, reason: 'network' };
  const read = readDigitalTwinEnvelope(response.status, response.body);
  if ('state' in read) return read.state;
  if (!Array.isArray(read.value.open)) return { kind: 'error', retryable: false, reason: 'review_list_malformed' };
  const open = read.value.open
    .map(normalizeTwinReviewEntry)
    .filter((item): item is MobileTwinReviewItem => !!item);
  return { kind: 'ready', data: { open }, capturedAt: now() };
}
