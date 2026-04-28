import type { DesktopRemoteApproval } from "../../services/desktopSync";
import type { TaskRunState, TaskTimelineEntry } from "../TaskTimeline";
import type { TaskWorkbenchEvent } from "../TaskWorkbenchPanel";

export type SessionRuntimeState = {
  sending: boolean;
  desktopTaskStatus: TaskRunState;
  desktopTimelineEntries: TaskTimelineEntry[];
  pendingApproval: DesktopRemoteApproval | null;
  rememberApprovalForSession: boolean;
  workbenchEvents: TaskWorkbenchEvent[];
  lastCheckpointAt: number | null;
};

export function createEmptySessionRuntimeState(): SessionRuntimeState {
  return {
    sending: false,
    desktopTaskStatus: "idle",
    desktopTimelineEntries: [],
    pendingApproval: null,
    rememberApprovalForSession: false,
    workbenchEvents: [],
    lastCheckpointAt: null,
  };
}
