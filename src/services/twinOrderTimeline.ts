/**
 * twinOrderTimeline — the escrow timeline shown for one order in 分身 → 收入与回执
 * (showcase A, "一张单从托管到放款的状态变化"; I-046 item 3).
 *
 * Pure presentation of the seller view the phone already reads (order contract v0.7). It invents
 * nothing: a step is "done" only when the view's status or its own timestamp says so, and a time is
 * shown only when the view carries it. No new request, no new action.
 *
 * Happy path: 付款托管 → 交付 → 验收 → 放款. A refund replaces what is left of the path with 退款; a
 * cancelled order stops at the first step; a dispute or an unknown result marks the step it is on.
 */
import type { OrderStatusV1 } from '../../shared/types/order-escrow';
import type { OrderSellerView } from '../../shared/types/order-escrow-view';

export type TimelineCopy = { zh: string; en: string };
export type TimelineStepState = 'done' | 'current' | 'todo' | 'stopped' | 'attention';
export type TimelineStepId = 'held' | 'delivered' | 'accepted' | 'released' | 'refunded';

export interface TimelineStep {
  id: TimelineStepId;
  label: TimelineCopy;
  state: TimelineStepState;
  /** Only a time the order itself carries. */
  at: string | null;
  /** Why the current step is waiting, or what went wrong. */
  note: TimelineCopy | null;
}

const LABELS: Record<TimelineStepId, TimelineCopy> = {
  held: { zh: '付款托管', en: 'Paid into escrow' },
  delivered: { zh: '交付', en: 'Delivered' },
  accepted: { zh: '验收', en: 'Accepted' },
  released: { zh: '放款', en: 'Released' },
  refunded: { zh: '退款', en: 'Refunded' },
};

const ORDER: readonly OrderStatusV1[] = ['awaiting_payment', 'paid', 'delivered', 'accepted', 'settled'];

function reached(status: OrderStatusV1, step: 'paid' | 'delivered' | 'accepted' | 'settled'): boolean {
  const index = ORDER.indexOf(status);
  return index >= 0 && index >= ORDER.indexOf(step);
}

function step(id: TimelineStepId, state: TimelineStepState, at: string | undefined, note: TimelineCopy | null = null): TimelineStep {
  return { id, label: LABELS[id], state, at: at ?? null, note };
}

export function orderEscrowTimeline(order: Pick<OrderSellerView, 'status' | 'escrow' | 'deliveredAt' | 'acceptedAt'>): TimelineStep[] {
  const { status, escrow } = order;
  const held = escrow.heldAt;
  switch (status) {
    case 'awaiting_payment':
      return [
        step('held', 'current', undefined, { zh: '等买方付款', en: 'Waiting for the buyer to pay' }),
        step('delivered', 'todo', undefined),
        step('accepted', 'todo', undefined),
        step('released', 'todo', undefined),
      ];
    case 'cancelled':
      return [step('held', 'stopped', undefined, { zh: '已取消，没有付款', en: 'Cancelled before payment' })];
    case 'refund_pending':
    case 'refunded': {
      const steps = [step('held', 'done', held)];
      if (order.deliveredAt) steps.push(step('delivered', 'done', order.deliveredAt));
      steps.push(
        status === 'refunded'
          ? step('refunded', 'done', escrow.refundedAt, { zh: '钱已退回买方', en: 'The money went back to the buyer' })
          : step('refunded', 'current', undefined, { zh: '退款处理中', en: 'Refund in progress' }),
      );
      return steps;
    }
    case 'disputed':
      return [
        step('held', 'done', held),
        step('delivered', order.deliveredAt ? 'done' : 'todo', order.deliveredAt),
        step('accepted', 'attention', undefined, { zh: '买方有异议，平台处理中', en: 'Disputed, the platform is reviewing' }),
        step('released', 'todo', undefined),
      ];
    case 'unknown':
      return [
        step('held', held ? 'done' : 'attention', held, held ? null : { zh: '结果待确认', en: 'Result being confirmed' }),
        step('delivered', order.deliveredAt ? 'done' : 'todo', order.deliveredAt),
        step('accepted', order.acceptedAt ? 'done' : 'todo', order.acceptedAt),
        step('released', held ? 'attention' : 'todo', undefined, held ? { zh: '结果待确认，不要重复操作', en: 'Result being confirmed; do not repeat anything' } : null),
      ];
    default: {
      // paid, delivered, accepted, settled
      const deliveredDone = reached(status, 'delivered');
      const acceptedDone = reached(status, 'accepted');
      const releasedDone = status === 'settled';
      return [
        step('held', 'done', held),
        step('delivered', deliveredDone ? 'done' : 'current', order.deliveredAt, deliveredDone ? null : { zh: '等你交付', en: 'Waiting for you to deliver' }),
        step(
          'accepted',
          acceptedDone ? 'done' : deliveredDone ? 'current' : 'todo',
          order.acceptedAt,
          !acceptedDone && deliveredDone ? { zh: '等买方验收（验收期满自动验收）', en: 'Waiting for the buyer (accepted automatically when the window ends)' } : null,
        ),
        step('released', releasedDone ? 'done' : acceptedDone ? 'current' : 'todo', escrow.releasedAt, !releasedDone && acceptedDone ? { zh: '放款处理中', en: 'Release in progress' } : null),
      ];
    }
  }
}

/** Steps that are done now but were not the last time this order was seen: only these animate. */
export function newlyDoneSteps(previous: ReadonlySet<TimelineStepId> | undefined, steps: readonly TimelineStep[]): TimelineStepId[] {
  if (!previous) return [];
  return steps.filter((item) => item.state === 'done' && !previous.has(item.id)).map((item) => item.id);
}

export function doneStepIds(steps: readonly TimelineStep[]): Set<TimelineStepId> {
  return new Set(steps.filter((item) => item.state === 'done').map((item) => item.id));
}
