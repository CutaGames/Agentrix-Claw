/**
 * teamActivityStore — Simple Mode Companion_Ball badge backing store.
 *
 * Subscribes to `agentrix:team-activity-update` (W1 task 1.9 backend
 * emit through `desktop-sync.companion-presence` channel,relayed to
 * the DOM via Tauri eval). Exposes `useActiveSubTasksCount()` zustand
 * hook + `getActiveSubTasksCount()` for non-React reads.
 *
 * Spec: multi-agent-collaboration-2026-06 W1.8
 * Design: §9.1
 */
import { create } from "zustand";

export interface SimplifiedSubTask {
  /** Stable id used as React key. Hash of taskId — never expose raw id. */
  hashedId: string;
  emoji: string;
  petName: string;
  /** Plain language (NO file paths / branch names / USD per R5.4) */
  plainStatus: string;
  /** 0-100 */
  progress: number;
}

interface TeamActivityState {
  activeCount: number;
  oneLineSummary: string | null;
  simplifiedSubTasks: SimplifiedSubTask[];
  setFromUpdate: (input: {
    activeCount: number;
    oneLineSummary?: string | null;
    simplifiedSubTasks?: SimplifiedSubTask[];
  }) => void;
}

export const useTeamActivityStore = create<TeamActivityState>((set) => ({
  activeCount: 0,
  oneLineSummary: null,
  simplifiedSubTasks: [],
  setFromUpdate: (input) =>
    set({
      activeCount: input.activeCount,
      oneLineSummary: input.oneLineSummary ?? null,
      simplifiedSubTasks: input.simplifiedSubTasks ?? [],
    }),
}));

export const useActiveSubTasksCount = () =>
  useTeamActivityStore((s) => s.activeCount);

export const useTeamSimplifiedSubTasks = () =>
  useTeamActivityStore((s) => s.simplifiedSubTasks);

export const getActiveSubTasksCount = () =>
  useTeamActivityStore.getState().activeCount;

/**
 * Wire the DOM event listener once per webview. Idempotent — returns
 * a noop if already wired.
 */
let _wiredUp = false;
export function bootTeamActivityBus(): void {
  if (typeof window === "undefined" || _wiredUp) return;
  _wiredUp = true;

  // Backend emits via desktop-sync.companion-presence channel; the
  // event arrives in the DOM as `agentrix:team-activity-update` after
  // Tauri's win.eval relay. Payload mirrors EmitTeamActivityUpdateArgs.
  window.addEventListener("agentrix:team-activity-update", (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | {
          active_sub_tasks?: number;
          one_line_summary?: string | null;
          simplified_sub_tasks?: SimplifiedSubTask[];
        }
      | undefined;
    if (!detail) return;
    useTeamActivityStore.getState().setFromUpdate({
      activeCount: Number(detail.active_sub_tasks ?? 0),
      oneLineSummary: detail.one_line_summary ?? null,
      simplifiedSubTasks: detail.simplified_sub_tasks ?? [],
    });
  });
}
