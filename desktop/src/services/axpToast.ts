/**
 * AXP toast store (Desktop) — mirror of mobile src/stores/axpToastStore.ts.
 *
 * Any earn path calls showAxpToast({ amount, reason, emoji }) and the
 * <PetHeadToast /> host (mounted alongside the PetFloatingBall) renders
 * the "+N AXP ✨" drift-out bubble near the pet's head.
 */
import { create } from "zustand";

export interface AxpToast {
  id: string;
  amount: number;
  reason: { en: string; zh: string };
  emoji?: string;
  direction: "earn" | "spend";
  createdAt: number;
}

interface AxpToastState {
  queue: AxpToast[];
  push: (t: Omit<AxpToast, "id" | "createdAt" | "direction"> & { direction?: "earn" | "spend" }) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useAxpToastStore = create<AxpToastState>((set) => ({
  queue: [],
  push: (t) => {
    counter += 1;
    const id = `axp_${Date.now()}_${counter}`;
    const direction = t.direction ?? (t.amount >= 0 ? "earn" : "spend");
    set((s) => ({
      queue: [
        ...s.queue,
        {
          id,
          amount: Math.abs(t.amount),
          reason: t.reason,
          emoji: t.emoji,
          direction,
          createdAt: Date.now(),
        },
      ],
    }));
  },
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
  clear: () => set({ queue: [] }),
}));

export function showAxpToast(t: {
  amount: number;
  reason: { en: string; zh: string };
  emoji?: string;
  direction?: "earn" | "spend";
}): void {
  useAxpToastStore.getState().push(t);
}
