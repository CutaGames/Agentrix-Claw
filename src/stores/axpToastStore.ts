/**
 * AXP toast store — global pub/sub for `+N AXP ✨` drift-in feedback.
 *
 * Any earn path (checkin / chat / co-raising feed / lvl up / task complete /
 * share like / referral / cashback) calls `showAxpToast({ amount, reason })`
 * and the `<AxpToastHost />` renderer (mounted in App.tsx) animates it in.
 *
 * Why a store instead of an event emitter: toasts should queue, de-dup, and
 * survive unmounts of the calling screen. A tiny zustand store hits both.
 */
import { create } from 'zustand';

export interface AxpToast {
  id: string;
  amount: number;
  reason: { en: string; zh: string };
  /** Optional emoji prefix (e.g. 🌱 for co-raising, ☀️ for daily, 💬 for chat). */
  emoji?: string;
  /** Positive = earn (green), negative = spend (amber). */
  direction: 'earn' | 'spend';
  createdAt: number;
}

interface AxpToastState {
  queue: AxpToast[];
  push: (
    t: Omit<AxpToast, 'id' | 'createdAt' | 'direction'> & {
      direction?: 'earn' | 'spend';
    },
  ) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useAxpToastStore = create<AxpToastState>((set) => ({
  queue: [],
  push: (t) => {
    counter += 1;
    const id = `axp_${Date.now()}_${counter}`;
    const direction = t.direction ?? (t.amount >= 0 ? 'earn' : 'spend');
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

/** Convenience wrapper — call from anywhere to show `+N AXP`. */
export function showAxpToast(t: {
  amount: number;
  reason: { en: string; zh: string };
  emoji?: string;
  direction?: 'earn' | 'spend';
}): void {
  useAxpToastStore.getState().push(t);
}
