/**
 * companionLayoutStore — single source of truth for companion ball
 * position + visibility + low-power state across all tabs.
 *
 * Why a separate store from settingsStore:
 *   - These values flip frequently (drag every frame); we don't want to
 *     persist them to MMKV on every change. Position is in-memory only;
 *     last-saved corner is persisted lightly.
 *   - The ball renders via a single global CompanionLayer (Task 4.1) so
 *     position must be one global value, not one per tab.
 *
 * Spec: requirements.md R1.3 (single global position across 3 tabs).
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkvStorage';

export interface CompanionLayoutState {
  /** Current pixel position; updated during drag. NOT persisted. */
  x: number;
  y: number;

  /**
   * Last-known dock corner so a fresh launch starts the ball where the
   * user last left it (rounded to one of 4 corners — TR / BR / TL / BL —
   * to avoid persisting noise from active drags). Persisted to MMKV.
   */
  lastCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  /** Whether the ball is currently minimized (half-hidden against an edge). */
  isMinimized: boolean;

  /** Whether the ball is locked (e.g. mode === 'signing'). Cannot be dragged. */
  isLocked: boolean;

  /** Whether device is in low-power mode (drops sprite fps + disables decorative anims). */
  isLowPower: boolean;

  // Setters
  setPosition: (x: number, y: number) => void;
  setLastCorner: (corner: CompanionLayoutState['lastCorner']) => void;
  setMinimized: (minimized: boolean) => void;
  setLocked: (locked: boolean) => void;
  setLowPower: (low: boolean) => void;
}

export const useCompanionLayoutStore = create<CompanionLayoutState>()(
  persist(
    (set) => ({
      x: 0,
      y: 0,
      lastCorner: 'bottom-right',
      isMinimized: true,
      isLocked: false,
      isLowPower: false,

      setPosition: (x, y) => set({ x, y }),
      setLastCorner: (lastCorner) => set({ lastCorner }),
      setMinimized: (isMinimized) => set({ isMinimized }),
      setLocked: (isLocked) => set({ isLocked }),
      setLowPower: (isLowPower) => set({ isLowPower }),
    }),
    {
      name: 'companion-layout-storage',
      storage: createJSONStorage(() => mmkvStorage),
      // Only persist the corner + last vertical position; live X resets to the
      // docked edge on launch, but the ball returns to the side & height the
      // user last left it (so it stops snapping back over the same buttons).
      partialize: (state) => ({
        lastCorner: state.lastCorner,
        y: state.y,
      }),
    },
  ),
);
