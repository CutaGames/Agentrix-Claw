import { create } from "zustand";
import type { GitFileChange } from "../../services/git";
import { BACKUP_CREATED_EVENT, type WorkspaceFileBackup } from "../../services/workspaceBackups";
import {
  createEmptySessionRuntimeState,
  type SessionRuntimeState,
} from "./sessionRuntime";

type SessionRuntimeRecord = Record<string, SessionRuntimeState>;
type SessionRuntimePatch =
  | Partial<SessionRuntimeState>
  | ((current: SessionRuntimeState) => Partial<SessionRuntimeState>);
type SessionRuntimeUpdater =
  | SessionRuntimeRecord
  | ((current: SessionRuntimeRecord) => SessionRuntimeRecord);

interface ChatPanelRuntimeStore {
  sessionRuntime: SessionRuntimeRecord;
  workspaceChanges: GitFileChange[];
  workspaceBackups: Record<string, WorkspaceFileBackup>;
  patchSessionRuntime: (sessionId: string, patch: SessionRuntimePatch) => void;
  replaceSessionRuntime: (next: SessionRuntimeUpdater) => void;
  clearSessionRuntime: () => void;
  removeSessionRuntime: (sessionId: string) => void;
  setWorkspaceChanges: (changes: GitFileChange[]) => void;
  upsertWorkspaceBackup: (backup: WorkspaceFileBackup) => void;
  removeWorkspaceBackup: (filePath: string) => void;
}

export const useChatPanelRuntimeStore = create<ChatPanelRuntimeStore>((set) => ({
  sessionRuntime: {},
  workspaceChanges: [],
  workspaceBackups: {},
  patchSessionRuntime: (sessionId, patch) => set((state) => {
    const current = state.sessionRuntime[sessionId] || createEmptySessionRuntimeState();
    const delta = typeof patch === "function" ? patch(current) : patch;
    return {
      sessionRuntime: {
        ...state.sessionRuntime,
        [sessionId]: {
          ...current,
          ...delta,
        },
      },
    };
  }),
  replaceSessionRuntime: (next) => set((state) => ({
    sessionRuntime: typeof next === "function"
      ? (next as (current: SessionRuntimeRecord) => SessionRuntimeRecord)(state.sessionRuntime)
      : next,
  })),
  clearSessionRuntime: () => set({ sessionRuntime: {} }),
  removeSessionRuntime: (sessionId) => set((state) => {
    const next = { ...state.sessionRuntime };
    delete next[sessionId];
    return { sessionRuntime: next };
  }),
  setWorkspaceChanges: (changes) => set({ workspaceChanges: changes }),
  upsertWorkspaceBackup: (backup) => set((state) => ({
    workspaceBackups: {
      ...state.workspaceBackups,
      [backup.targetPath]: backup,
    },
  })),
  removeWorkspaceBackup: (filePath) => set((state) => {
    const next = { ...state.workspaceBackups };
    delete next[filePath];
    return { workspaceBackups: next };
  }),
}));

// Desktop D3 — every snapshot (chat tools, auto-repair, remote commands)
// shows up in 今日改动 / undo, not only the ones parsed from chat tool results.
if (typeof window !== "undefined") {
  window.addEventListener(BACKUP_CREATED_EVENT, ((event: Event) => {
    const backup = (event as CustomEvent).detail as WorkspaceFileBackup | undefined;
    if (backup?.targetPath && backup.backupPath) {
      useChatPanelRuntimeStore.getState().upsertWorkspaceBackup(backup);
    }
  }) as EventListener);
}