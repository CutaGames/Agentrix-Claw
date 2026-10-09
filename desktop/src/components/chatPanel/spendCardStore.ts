/**
 * spendCardStore — 每个对话里收到的付款批准事件（D2）。同一个 `approvalRef` 只留一张；只在内存里，不落盘。
 */
import { useSyncExternalStore } from "react";
import type { SpendApprovalEventV0 } from "../../../../shared/types/spend-budget";

const MAX_PER_SESSION = 20;
const cards = new Map<string, SpendApprovalEventV0[]>();
const listeners = new Set<() => void>();
const EMPTY: SpendApprovalEventV0[] = [];

function emit() {
  for (const listener of listeners) listener();
}

export function addSpendCard(sessionId: string, event: SpendApprovalEventV0): boolean {
  const list = cards.get(sessionId) ?? [];
  if (list.some((card) => card.approvalRef === event.approvalRef)) return false;
  cards.set(sessionId, [...list, event].slice(-MAX_PER_SESSION));
  emit();
  return true;
}

export function spendCardsFor(sessionId: string | null | undefined): SpendApprovalEventV0[] {
  return (sessionId && cards.get(sessionId)) || EMPTY;
}

export function resetSpendCardsForTests() {
  cards.clear();
  emit();
}

export function useSpendCards(sessionId: string | null | undefined): SpendApprovalEventV0[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => spendCardsFor(sessionId),
  );
}
