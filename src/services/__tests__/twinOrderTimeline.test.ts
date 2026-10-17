/**
 * Showcase A (I-046 item 3): the escrow timeline in 分身 → 收入与回执. Presentation only: a step is done
 * only when the order's own status or timestamp says so, times come only from the order, and only a
 * step that became done since the last read animates.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ORDER_STATUSES, type OrderStatusV1 } from '../../../shared/types/order-escrow';
import { doneStepIds, newlyDoneSteps, orderEscrowTimeline, type TimelineStep } from '../twinOrderTimeline';

const HELD = '2026-09-29T07:00:00.000Z';
const DELIVERED = '2026-09-29T08:00:00.000Z';
const ACCEPTED = '2026-09-30T08:00:00.000Z';
const RELEASED = '2026-09-30T08:05:00.000Z';
const REFUNDED = '2026-09-29T09:00:00.000Z';

function order(status: OrderStatusV1, extra: Record<string, unknown> = {}) {
  return { status, escrow: { state: 'held' as const, heldAt: HELD }, ...extra } as any;
}
const shape = (steps: TimelineStep[]) => steps.map((step) => `${step.id}:${step.state}${step.at ? '@' : ''}`);

describe('orderEscrowTimeline', () => {
  it('walks the happy path one step at a time', () => {
    expect(shape(orderEscrowTimeline({ status: 'awaiting_payment', escrow: { state: 'not_funded' } } as any))).toEqual(['held:current', 'delivered:todo', 'accepted:todo', 'released:todo']);
    expect(shape(orderEscrowTimeline(order('paid')))).toEqual(['held:done@', 'delivered:current', 'accepted:todo', 'released:todo']);
    expect(shape(orderEscrowTimeline(order('delivered', { deliveredAt: DELIVERED })))).toEqual(['held:done@', 'delivered:done@', 'accepted:current', 'released:todo']);
    expect(shape(orderEscrowTimeline(order('accepted', { deliveredAt: DELIVERED, acceptedAt: ACCEPTED })))).toEqual(['held:done@', 'delivered:done@', 'accepted:done@', 'released:current']);
    const settled = orderEscrowTimeline({ status: 'settled', escrow: { state: 'released', heldAt: HELD, releasedAt: RELEASED }, deliveredAt: DELIVERED, acceptedAt: ACCEPTED } as any);
    expect(shape(settled)).toEqual(['held:done@', 'delivered:done@', 'accepted:done@', 'released:done@']);
    expect(settled.map((step) => step.at)).toEqual([HELD, DELIVERED, ACCEPTED, RELEASED]);
  });

  it('refunds, cancellations, disputes and unknown results are said as they are', () => {
    expect(shape(orderEscrowTimeline(order('refund_pending')))).toEqual(['held:done@', 'refunded:current']);
    expect(shape(orderEscrowTimeline({ status: 'refunded', escrow: { state: 'refunded', heldAt: HELD, refundedAt: REFUNDED }, deliveredAt: DELIVERED } as any))).toEqual(['held:done@', 'delivered:done@', 'refunded:done@']);
    expect(shape(orderEscrowTimeline({ status: 'cancelled', escrow: { state: 'not_funded' } } as any))).toEqual(['held:stopped']);
    expect(shape(orderEscrowTimeline(order('disputed', { deliveredAt: DELIVERED })))).toEqual(['held:done@', 'delivered:done@', 'accepted:attention', 'released:todo']);
    const unknown = orderEscrowTimeline(order('unknown', { deliveredAt: DELIVERED }));
    expect(shape(unknown)).toEqual(['held:done@', 'delivered:done@', 'accepted:todo', 'released:attention']);
    expect(unknown[3].note?.zh).toBe('结果待确认，不要重复操作');
  });

  it('never marks a step done that the order does not show, and shows no time the order does not carry', () => {
    for (const status of ORDER_STATUSES) {
      const steps = orderEscrowTimeline({ status, escrow: { state: 'unknown' } } as any);
      expect(steps.every((step) => step.at === null)).toBe(true);
      if (status === 'awaiting_payment' || status === 'cancelled') expect(steps.some((step) => step.state === 'done')).toBe(false);
      if (status !== 'settled') expect(steps.find((step) => step.id === 'released')?.state).not.toBe('done');
    }
  });
});

describe('newlyDoneSteps', () => {
  it('the first read animates nothing; later only the steps that became done', () => {
    const paid = orderEscrowTimeline(order('paid'));
    const delivered = orderEscrowTimeline(order('delivered', { deliveredAt: DELIVERED }));
    expect(newlyDoneSteps(undefined, delivered)).toEqual([]);
    expect(newlyDoneSteps(doneStepIds(paid), delivered)).toEqual(['delivered']);
    expect(newlyDoneSteps(doneStepIds(delivered), delivered)).toEqual([]);
  });
});

describe('screens (showcase A: motion only on a state change, 250 ms, respects reduce motion)', () => {
  const root = path.join(__dirname, '..', '..');
  const income = fs.readFileSync(path.join(root, 'screens/four-zone/TwinIncomeScreen.tsx'), 'utf8');
  const timeline = fs.readFileSync(path.join(root, 'screens/four-zone/TwinOrderTimeline.tsx'), 'utf8');
  const desktop = fs.readFileSync(path.join(root, 'screens/agent/DesktopControlScreen.tsx'), 'utf8');

  it('the income page draws the timeline from the order it read, and adds no request or action', () => {
    expect(income).toContain('orderEscrowTimeline(order)');
    expect(income).toContain('<TwinOrderTimeline steps={timeline.steps} justDone={timeline.justDone} />');
    expect(income).not.toMatch(/apiFetch|[^A-Za-z.]fetch\(/);
    expect(timeline).not.toMatch(/apiFetch|[^A-Za-z.]fetch\(|onPress/);
  });

  it('both animations last 250 ms and are skipped with reduce motion', () => {
    for (const source of [timeline, desktop]) {
      expect(source).toContain('duration: 250');
      expect(source).toContain('useReduceMotion()');
    }
    expect(desktop).toContain('const fresh = seenReceipts.current !== null && !seenReceipts.current.has(line.receiptRef);');
  });
});
