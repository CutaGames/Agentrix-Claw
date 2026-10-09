/**
 * needsYou — the M0 home 需要你 (briefs/mobile-redesign-v1.md, owner 10-07 "口袋前台 + 遥控器"): everything that waits
 * for the owner, one card per decision. Pure (no React Native import): the screen passes what each source returned,
 * or null when that source is closed or failed, which hides only its own cards.
 *
 * Order: payments waiting for approval (soonest expiry first), requests from other people's Agents (newest first),
 * leads waiting two days, unpaid deposits and bookings within 24 hours (soonest first), goal check-ins, then the 事项
 * items (computer approvals, twin review) in their own order. Requests have no handled state in v0, so only those from
 * the last 7 days are shown, at most 10.
 */
import type { AgentCollaborationRequestViewV0 } from '../../shared/types/agent-collaboration';
import type { OwnerFollowUpsV1, OwnerGoalsListV0 } from '../../shared/types/owner-goals';
import { decodeSpendApprovalListV0, type SpendApprovalViewV0 } from '../../shared/types/spend-budget';
import type { HttpTransportV1 } from '../../shared/client/transport';
import type { MattersPendingItem } from './mattersPending';

type Lang = 'zh' | 'en';

export type NeedsYouKindV0 =
  | 'spend_approval'
  | 'agent_request'
  | 'lead_no_reply'
  | 'deposit_unpaid'
  | 'booking_soon'
  | 'goal_check_in'
  | 'computer_approval'
  | 'twin_review';

export interface NeedsYouCardV0 {
  /** Unique across kinds: `<kind>:<id>`. */
  key: string;
  kind: NeedsYouKindV0;
  /** What the card's actions act on: approvalRef, receiptId, lead / booking ref, goalId or the 事项 id. */
  id: string;
  /** Plain text; counterpart and visitor words are outside content and are never rendered as markup. */
  title: string;
  detail: string | null;
  /** When it stops being actionable or comes due. */
  at: string | null;
  spend?: SpendApprovalViewV0;
  request?: AgentCollaborationRequestViewV0;
  draft?: { zh: string; en: string };
}

export interface NeedsYouSourcesV0 {
  approvals: readonly SpendApprovalViewV0[] | null;
  requests: readonly AgentCollaborationRequestViewV0[] | null;
  followUps: OwnerFollowUpsV1 | null;
  goals: OwnerGoalsListV0 | null;
  matters: readonly MattersPendingItem[] | null;
}

const REQUEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_MAX = 10;
const TEXT_MAX = 80;

const clip = (text: string) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text);
const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);
const usd = (cents: number) => `US$${(cents / 100).toFixed(2)}`;

export function buildNeedsYou(src: NeedsYouSourcesV0, nowMs: number): NeedsYouCardV0[] {
  const approvals: NeedsYouCardV0[] = [...(src.approvals ?? [])]
    .filter((a) => a.status === 'pending' && time(a.expiresAt) > nowMs)
    .sort((a, b) => time(a.expiresAt) - time(b.expiresAt))
    .map((a) => ({
      key: `spend_approval:${a.approvalRef}`,
      kind: 'spend_approval',
      id: a.approvalRef,
      title: `${clip(a.spend.payeeLabel)} · ${usd(a.spend.amountCents)}`,
      detail: a.spend.agentLabel ? clip(a.spend.agentLabel) : null,
      at: a.expiresAt,
      spend: a,
    }));

  const requests: NeedsYouCardV0[] = [...(src.requests ?? [])]
    .filter((r) => nowMs - time(r.receivedAt) <= REQUEST_WINDOW_MS)
    .sort((a, b) => time(b.receivedAt) - time(a.receivedAt))
    .slice(0, REQUEST_MAX)
    .map((r) => ({
      key: `agent_request:${r.receiptId}`,
      kind: 'agent_request',
      id: r.receiptId,
      title: `${clip(r.counterpartName)}: ${clip(r.message)}`,
      detail: r.proposedStartAt ?? null,
      at: r.receivedAt,
      request: r,
    }));

  const followUpOrder: Record<string, number> = { lead_no_reply: 0, deposit_unpaid: 1, booking_soon: 2 };
  const followUps: NeedsYouCardV0[] = [...(src.followUps?.cards ?? [])]
    .sort((a, b) => followUpOrder[a.kind] - followUpOrder[b.kind] || time(a.dueAt) - time(b.dueAt))
    .map((c) => ({
      key: `${c.kind}:${c.refId}`,
      kind: c.kind,
      id: c.refId,
      title: c.kind === 'lead_no_reply' ? clip(c.title ?? '') : c.startsAt ?? c.dueAt,
      detail: null,
      at: c.kind === 'booking_soon' ? c.startsAt ?? c.dueAt : c.dueAt,
      ...(c.draft ? { draft: c.draft } : {}),
    }));

  const goals: NeedsYouCardV0[] = (src.goals?.cards ?? []).map((c) => ({
    key: `goal_check_in:${c.goalId}`,
    kind: 'goal_check_in',
    id: c.goalId,
    title: clip(c.title),
    detail: null,
    at: c.dueAt,
  }));

  const matters: NeedsYouCardV0[] = (src.matters ?? [])
    .filter((m) => !m.expired)
    .map((m) => ({ key: m.key, kind: m.kind, id: m.id, title: clip(m.title), detail: m.detail, at: m.dueAt }));

  return [...approvals, ...requests, ...followUps, ...goals, ...matters];
}

export function needsYouCounts(cards: readonly NeedsYouCardV0[]): Partial<Record<NeedsYouKindV0, number>> {
  const out: Partial<Record<NeedsYouKindV0, number>> = {};
  for (const card of cards) out[card.kind] = (out[card.kind] ?? 0) + 1;
  return out;
}

/** The line on top of the home: how many decisions wait, or that nothing does. */
export function needsYouSummary(cards: readonly NeedsYouCardV0[], lang: Lang): string {
  if (cards.length === 0) return lang === 'zh' ? '现在没有要你拍板的事。' : 'Nothing needs you right now.';
  const n = needsYouCounts(cards);
  const parts: string[] = [];
  const add = (count: number | undefined, zh: string, en: string) => { if (count) parts.push(lang === 'zh' ? `${count} ${zh}` : `${count} ${en}`); };
  add(n.spend_approval, '笔付款等批准', count1(n.spend_approval, 'payment to approve', 'payments to approve'));
  add(n.agent_request, '条别人 Agent 的请求', count1(n.agent_request, 'request from another Agent', 'requests from other Agents'));
  add((n.lead_no_reply ?? 0) + (n.deposit_unpaid ?? 0) + (n.booking_soon ?? 0) || undefined, '件跟进', count1((n.lead_no_reply ?? 0) + (n.deposit_unpaid ?? 0) + (n.booking_soon ?? 0), 'follow-up', 'follow-ups'));
  add(n.goal_check_in, '个目标该复盘', count1(n.goal_check_in, 'goal to check in on', 'goals to check in on'));
  add((n.computer_approval ?? 0) + (n.twin_review ?? 0) || undefined, '件电脑审批或分身复核', count1((n.computer_approval ?? 0) + (n.twin_review ?? 0), 'computer approval or twin review', 'computer approvals or twin reviews'));
  return lang === 'zh' ? `${cards.length} 件事要你拍板：${parts.join('，')}。` : `${cards.length} ${cards.length === 1 ? 'thing needs' : 'things need'} you: ${parts.join(', ')}.`;
}

function count1(count: number | undefined, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** `GET /spend-approvals?status=pending`; null when the budget is off (404), the call fails or the body does not decode. */
export async function readPendingSpendApprovals(deps: { transport: HttpTransportV1; baseUrl: string; token: string | null | undefined }, nowMs: number): Promise<SpendApprovalViewV0[] | null> {
  if (!deps.token) return null;
  try {
    const response = await deps.transport.request({
      method: 'GET',
      path: `${deps.baseUrl.replace(/\/+$/, '')}/spend-approvals?status=pending`,
      headers: { Accept: 'application/json', Authorization: `Bearer ${deps.token}`, 'X-Agentrix-Surface': 'mobile' },
    });
    if (response.status !== 200) return null;
    return decodeSpendApprovalListV0(response.body, nowMs)?.items ?? null;
  } catch {
    return null;
  }
}
