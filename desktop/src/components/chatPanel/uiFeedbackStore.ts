// Sprint Pre-launch P-1 (2026-05-23) — Performance refactor: UI feedback store
//
// BEFORE: `streamFeedback`, `activeToolRun`, `sendStartedAt`, `approvalSubmitting`,
// `feedbackNow` (and the 30+ panel `*Open` flags) all lived as `useState` in the
// 3708-line ChatPanelImpl. Every setStreamFeedback/setActiveToolRun call from
// useStreamingTurn.ts (which fires on every tool start/progress/result, every
// 50ms during streaming, and on every approval lifecycle event) triggered a
// full ChatPanelImpl re-render -> reconciliation walked all 30+ panel mounts ->
// browser had to recalc styles against `global.css`'s 200+ `[style*=]` selectors.
// On user reports this manifested as: typing lag, sticky approval modal
// (clicking "Approve" felt frozen for 1-2s), tool-progress chip stutter.
//
// AFTER: All high-frequency UI feedback lives in this zustand store. Each
// consumer subscribes via a fine-grained selector and only re-renders when
// the slice it cares about actually changes. ChatPanelImpl gets stable hooks
// that proxy to the store, so the component tree (and everywhere that already
// accepts a `setStreamFeedback: Dispatch<SetStateAction<...>>` style API) keeps
// working without touching call sites.

import { create } from "zustand";

// ── Types ───────────────────────────────────────────────────────────────────

export interface StreamFeedback {
  tone: "info" | "warning" | "error" | "success";
  label: string;
  detail?: string;
}

export interface ActiveToolRun {
  toolCallId: string;
  toolName: string;
  status: string;
  startedAt: number;
}

/**
 * Single panel registry — replaces 30+ individual `*Open` useState flags.
 * Only one secondary panel is ever open at a time, so this is a strict
 * one-of selector. Modal-style overlays that legitimately stack (e.g.
 * settings on top of pet creator) can use the optional `stack` field.
 */
export type PanelId =
  | "settings"
  | "videoStudio"
  | "petCreator"
  | "soulPicker"
  | "wardrobe"
  | "variantPicker"
  | "petGrowth"
  | "petAchievements"
  | "petMemoryAlbum"
  | "petMinigames"
  | "petBreeding"
  | "history"
  | "fileTree"
  | "notif"
  | "crossDevice"
  | "taskWorkbench"
  | "economy"
  | "memory"
  | "taskLog"
  | "dream"
  | "plugin"
  | "wiki"
  | "mcp"
  | "worktree"
  | "skillCanvas"
  | "deepOs"
  | "moreMenu";

interface UiFeedbackStore {
  // Streaming feedback (tone + label + detail)
  streamFeedback: StreamFeedback | null;
  setStreamFeedback: (
    next: StreamFeedback | null | ((prev: StreamFeedback | null) => StreamFeedback | null),
  ) => void;

  // Active tool run (mid-stream tool execution indicator)
  activeToolRun: ActiveToolRun | null;
  setActiveToolRun: (
    next: ActiveToolRun | null | ((prev: ActiveToolRun | null) => ActiveToolRun | null),
  ) => void;

  // Send timing — used by the elapsed-seconds badge
  sendStartedAt: number | null;
  setSendStartedAt: (value: number | null) => void;

  // Approval submission lock (debounce double-click on Approve/Reject)
  approvalSubmitting: boolean;
  setApprovalSubmitting: (value: boolean) => void;

  // 2-second tick driver for "elapsed time" displays. Only consumers that
  // actually display elapsed seconds subscribe to this slice — the rest of
  // ChatPanelImpl no longer re-renders every 2s.
  feedbackNow: number;
  setFeedbackNow: (value: number) => void;

  // Single panel registry (replaces 30+ `*Open` useState flags)
  openedPanels: Set<PanelId>;
  /**
   * Subscribe to a single panel's open state. Returns `true` when the
   * panel is in the openedPanels Set. Designed to slot in for the
   * legacy `[isOpen, setOpen] = useState(false)` pattern: callers can
   * still write `if (panelOpen) ...` and `setOpen(true/false)` (via
   * `useUiFeedbackStore.getState().openPanel(id) / closePanel(id)`).
   */
  isPanelOpen: (panel: PanelId) => boolean;
  openPanel: (panel: PanelId) => void;
  closePanel: (panel: PanelId) => void;
  togglePanel: (panel: PanelId) => void;
  closeAllPanels: () => void;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useUiFeedbackStore = create<UiFeedbackStore>((set, get) => ({
  streamFeedback: null,
  setStreamFeedback: (next) => set((state) => ({
    streamFeedback: typeof next === "function"
      ? (next as (prev: StreamFeedback | null) => StreamFeedback | null)(state.streamFeedback)
      : next,
  })),

  activeToolRun: null,
  setActiveToolRun: (next) => set((state) => ({
    activeToolRun: typeof next === "function"
      ? (next as (prev: ActiveToolRun | null) => ActiveToolRun | null)(state.activeToolRun)
      : next,
  })),

  sendStartedAt: null,
  setSendStartedAt: (value) => set({ sendStartedAt: value }),

  approvalSubmitting: false,
  setApprovalSubmitting: (value) => set({ approvalSubmitting: value }),

  feedbackNow: Date.now(),
  setFeedbackNow: (value) => set({ feedbackNow: value }),

  openedPanels: new Set<PanelId>(),
  isPanelOpen: (panel) => get().openedPanels.has(panel),
  openPanel: (panel) => set((state) => {
    if (state.openedPanels.has(panel)) return state;
    const next = new Set(state.openedPanels);
    next.add(panel);
    return { openedPanels: next };
  }),
  closePanel: (panel) => set((state) => {
    if (!state.openedPanels.has(panel)) return state;
    const next = new Set(state.openedPanels);
    next.delete(panel);
    return { openedPanels: next };
  }),
  togglePanel: (panel) => set((state) => {
    const next = new Set(state.openedPanels);
    if (next.has(panel)) next.delete(panel); else next.add(panel);
    return { openedPanels: next };
  }),
  closeAllPanels: () => set({ openedPanels: new Set<PanelId>() }),
}));

// ── Convenience selector hooks (encourage fine-grained subscription) ────────

/**
 * Subscribe to *just* the stream feedback. Components using this hook only
 * re-render when streamFeedback changes — typing in the textarea, scrolling,
 * tool-run updates, panel toggles, etc. all leave them alone.
 */
export const useStreamFeedback = () => useUiFeedbackStore((s) => s.streamFeedback);
export const useActiveToolRun = () => useUiFeedbackStore((s) => s.activeToolRun);
export const useSendStartedAt = () => useUiFeedbackStore((s) => s.sendStartedAt);
export const useApprovalSubmitting = () => useUiFeedbackStore((s) => s.approvalSubmitting);
export const useFeedbackNow = () => useUiFeedbackStore((s) => s.feedbackNow);
export const usePanelOpen = (panel: PanelId) =>
  useUiFeedbackStore((s) => s.openedPanels.has(panel));

// ── Stable setter accessors ────────────────────────────────────────────────
//
// These are pulled OUTSIDE component re-renders by reading
// `useUiFeedbackStore.getState()` directly. Use them inside `useStreamingTurn`
// and other non-component contexts where you do NOT want to subscribe.
// Inside a component, prefer the hook variants above so the component
// re-renders when relevant state changes.

export const uiFeedbackActions = {
  setStreamFeedback: (
    next: StreamFeedback | null | ((prev: StreamFeedback | null) => StreamFeedback | null),
  ) => useUiFeedbackStore.getState().setStreamFeedback(next),
  setActiveToolRun: (
    next: ActiveToolRun | null | ((prev: ActiveToolRun | null) => ActiveToolRun | null),
  ) => useUiFeedbackStore.getState().setActiveToolRun(next),
  setSendStartedAt: (value: number | null) =>
    useUiFeedbackStore.getState().setSendStartedAt(value),
  setApprovalSubmitting: (value: boolean) =>
    useUiFeedbackStore.getState().setApprovalSubmitting(value),
  setFeedbackNow: (value: number) =>
    useUiFeedbackStore.getState().setFeedbackNow(value),
  openPanel: (panel: PanelId) => useUiFeedbackStore.getState().openPanel(panel),
  closePanel: (panel: PanelId) => useUiFeedbackStore.getState().closePanel(panel),
  togglePanel: (panel: PanelId) => useUiFeedbackStore.getState().togglePanel(panel),
};
