import { useCallback, useMemo } from "react";
import type { DesktopRemoteApproval } from "../../services/desktopSync";
import type { TaskRunState, TaskTimelineEntry, TaskTimelineStatus } from "../TaskTimeline";
import { createEmptySessionRuntimeState } from "./sessionRuntime";
import {
  getDesktopApprovalId,
  normalizeDesktopApproval,
} from "./approvalState";
import {
  RECENT_DESKTOP_FAILURE_WINDOW_MS,
  STALE_DESKTOP_TASK_WINDOW_MS,
} from "./contextBudget";

interface SessionRuntimeLike {
  desktopTaskStatus: TaskRunState;
  desktopTimelineEntries: TaskTimelineEntry[];
  pendingApproval: DesktopRemoteApproval | null;
  rememberApprovalForSession: boolean;
}

function asSessionRuntimeLike(value: unknown): SessionRuntimeLike {
  const record = (value && typeof value === "object") ? value as Partial<SessionRuntimeLike> : {};
  return {
    desktopTaskStatus: record.desktopTaskStatus || "idle",
    desktopTimelineEntries: Array.isArray(record.desktopTimelineEntries) ? record.desktopTimelineEntries : [],
    pendingApproval: record.pendingApproval || null,
    rememberApprovalForSession: Boolean(record.rememberApprovalForSession),
  };
}

interface UseDesktopSyncRuntimeParams {
  desktopDeviceId: string;
  tabs: Array<{ sessionId: string }>;
  token: string | null;
  approvalSubmitting: boolean;
  replaceSessionRuntime: (
    next:
      | Record<string, any>
      | ((prev: Record<string, any>) => Record<string, any>),
  ) => void;
  patchSessionRuntime: (sessionId: string, patch: any) => void;
  setApprovalSubmitting: (value: boolean) => void;
  setStreamFeedback: (value: {
    tone: "info" | "warning" | "error" | "success";
    label: string;
    detail?: string;
  } | null) => void;
  pendingApproval: DesktopRemoteApproval | null;
  fetchDesktopSyncState: (token: string) => Promise<any>;
  respondDesktopApproval: (
    token: string,
    approvalId: string,
    payload: { decision: "approved" | "rejected"; rememberForSession: boolean },
  ) => Promise<{ approval: unknown }>;
  pendingApprovalSnapshotRef: React.MutableRefObject<DesktopRemoteApproval | null>;
}

export function useDesktopSyncRuntime({
  desktopDeviceId,
  tabs,
  token,
  approvalSubmitting,
  replaceSessionRuntime,
  patchSessionRuntime,
  setApprovalSubmitting,
  setStreamFeedback,
  pendingApproval,
  fetchDesktopSyncState,
  respondDesktopApproval,
  pendingApprovalSnapshotRef,
}: UseDesktopSyncRuntimeParams) {
  const applyDesktopSyncState = useCallback((state: any) => {
    const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
    const deviceTasks = tasks.filter((task: any) => task?.deviceId === desktopDeviceId);
    const approvals = Array.isArray(state?.approvals) ? state.approvals : [];
    const now = Date.now();

    const getTaskActivityTime = (task: any) => Number(
      task?.finishedAt
      || task?.startedAt
      || Date.parse(task?.updatedAt || task?.requestedAt || "")
      || 0,
    );

    const isVisibleTask = (task: any) => {
      const status = (task?.status as TaskRunState) || "completed";
      const ageMs = now - getTaskActivityTime(task);

      if (status === "need-approve") {
        return true;
      }

      if (status === "executing") {
        return ageMs <= STALE_DESKTOP_TASK_WINDOW_MS;
      }

      if (status === "failed") {
        return ageMs <= RECENT_DESKTOP_FAILURE_WINDOW_MS;
      }

      return false;
    };

    const taskGroups = new Map<string, any[]>();
    const taskSessionMap = new Map<string, string>();
    for (const task of deviceTasks) {
      const sessionId = typeof task?.sessionId === "string" && task.sessionId.trim()
        ? task.sessionId
        : "__global__";
      taskSessionMap.set(task.taskId, sessionId);
      const existing = taskGroups.get(sessionId) || [];
      existing.push(task);
      taskGroups.set(sessionId, existing);
    }

    const approvalBySession = new Map<string, DesktopRemoteApproval>();
    for (const rawApproval of approvals) {
      const approval = normalizeDesktopApproval(rawApproval);
      const approvalId = getDesktopApprovalId(approval);
      if (approval?.deviceId !== desktopDeviceId || approval?.status !== "pending") {
        continue;
      }
      if (!approvalId) {
        continue;
      }
      const sessionId = taskSessionMap.get(approval.taskId) || "__global__";
      const current = approvalBySession.get(sessionId);
      if (!current || Date.parse(approval.requestedAt || "") >= Date.parse(current.requestedAt || "")) {
        approvalBySession.set(sessionId, approval);
      }
    }

    const deriveTaskStatus = (sessionTasks: any[]): TaskRunState => {
      if (sessionTasks.some((task) => task?.status === "need-approve")) return "need-approve";
      if (sessionTasks.some((task) => task?.status === "executing")) return "executing";
      const latestTask = [...sessionTasks].sort((left, right) => {
        const leftTime = Number(left?.finishedAt || left?.startedAt || Date.parse(left?.updatedAt || "") || 0);
        const rightTime = Number(right?.finishedAt || right?.startedAt || Date.parse(right?.updatedAt || "") || 0);
        return rightTime - leftTime;
      })[0];
      return (latestTask?.status as TaskRunState) || "idle";
    };

    const toTimelineStatus = (status: TaskRunState): TaskTimelineStatus => {
      if (status === "executing") return "running";
      if (status === "need-approve") return "waiting-approval";
      if (status === "failed") return "failed";
      return "completed";
    };

    const buildTimelineEntries = (sessionTasks: any[]): TaskTimelineEntry[] => {
      return sessionTasks
        .flatMap((task) => {
          if (Array.isArray(task?.timeline) && task.timeline.length > 0) {
            return task.timeline;
          }
          return [{
            id: `${task.taskId}-summary`,
            title: task?.title || "Desktop task",
            detail: task?.summary,
            kind: "run-command",
            riskLevel: "L0",
            status: toTimelineStatus((task?.status as TaskRunState) || "completed"),
            startedAt: Number(task?.startedAt || Date.parse(task?.updatedAt || "") || Date.now()),
            finishedAt: typeof task?.finishedAt === "number" ? task.finishedAt : undefined,
          }];
        })
        .sort((left, right) => Number(left?.startedAt || 0) - Number(right?.startedAt || 0))
        .slice(-12);
    };

    const knownSessionIds = new Set<string>([
      ...tabs.map((tab) => tab.sessionId),
      ...taskGroups.keys(),
      ...approvalBySession.keys(),
    ]);

    replaceSessionRuntime((prev) => {
      const next = { ...prev };
      for (const sessionId of knownSessionIds) {
        const current = next[sessionId] || createEmptySessionRuntimeState();
        const sessionTasks = taskGroups.get(sessionId) || [];
        const visibleSessionTasks = sessionTasks.filter(isVisibleTask);
        const approval = approvalBySession.get(sessionId) || null;
        next[sessionId] = {
          ...current,
          desktopTaskStatus: visibleSessionTasks.length > 0 ? deriveTaskStatus(visibleSessionTasks) : "idle",
          desktopTimelineEntries: visibleSessionTasks.length > 0 ? buildTimelineEntries(visibleSessionTasks) : [],
          pendingApproval: approval,
          rememberApprovalForSession: approval ? current.rememberApprovalForSession : false,
        };
      }
      return next;
    });
  }, [desktopDeviceId, replaceSessionRuntime, tabs]);

  const submitDesktopApprovalDecision = useCallback(async (
    approval: DesktopRemoteApproval | null,
    decision: "approved" | "rejected",
    rememberForSession: boolean,
  ) => {
    if (!token || approvalSubmitting) {
      return false;
    }
    if (!approval) {
      setStreamFeedback({
        tone: "error",
        label: "审批提交失败",
        detail: "审批状态已变化，请刷新桌面同步状态后重试",
      });
      return false;
    }
    const approvalId = getDesktopApprovalId(approval);
    if (!approvalId) {
      setStreamFeedback({
        tone: "error",
        label: "审批提交失败",
        detail: "缺少 approvalId，请刷新桌面同步状态后重试",
      });
      await fetchDesktopSyncState(token).then(applyDesktopSyncState).catch(() => {});
      return false;
    }

    // Optimistic update: immediately resolve the approval waiter so the
    // command execution continues without waiting for the network round-trip.
    // This eliminates the "卡顿" users experience when clicking Approve.
    const optimisticApproval = {
      ...approval,
      approvalId,
      status: decision,
      rememberForSession: decision === "approved" ? rememberForSession : false,
      sessionKey: approval.sessionKey,
    } as DesktopRemoteApproval;
    window.dispatchEvent(new CustomEvent("agentrix:approval-response-local", { detail: optimisticApproval }));

    // Clear the approval UI immediately
    replaceSessionRuntime((prev) => {
      const next = { ...prev };
      for (const [sessionId, runtime] of Object.entries(next)) {
        if (getDesktopApprovalId(asSessionRuntimeLike(runtime).pendingApproval) === approvalId) {
          next[sessionId] = {
            ...runtime,
            pendingApproval: null,
            rememberApprovalForSession: false,
          };
        }
      }
      return next;
    });

    // Fire-and-forget the backend call (non-blocking)
    setApprovalSubmitting(true);
    respondDesktopApproval(token, approvalId, {
      decision,
      rememberForSession: decision === "approved" ? rememberForSession : false,
    }).catch((err) => {
      // If backend call fails, show a warning but don't block — the command
      // already started executing optimistically.
      setStreamFeedback({
        tone: "warning",
        label: "审批同步失败",
        detail: `${err?.message || "网络错误"} — 操作已继续执行`,
      });
    }).finally(() => {
      setApprovalSubmitting(false);
    });

    pendingApprovalSnapshotRef.current = null;
    setStreamFeedback({
      tone: decision === "approved" ? "success" : "warning",
      label: decision === "approved" ? "审批已通过" : "审批已拒绝",
      detail: decision === "approved" ? "桌面任务将继续执行" : "已停止这次高风险动作",
    });
    return true;
  }, [
    token,
    approvalSubmitting,
    setStreamFeedback,
    fetchDesktopSyncState,
    applyDesktopSyncState,
    setApprovalSubmitting,
    respondDesktopApproval,
    replaceSessionRuntime,
    pendingApprovalSnapshotRef,
  ]);

  const approvalSheetRequest = useMemo(
    () => pendingApproval
      ? {
          title: pendingApproval.title,
          description: pendingApproval.description,
          riskLevel: pendingApproval.riskLevel,
          canRememberForSession: pendingApproval.riskLevel !== "L3" && Boolean(pendingApproval.sessionKey),
        }
      : null,
    [pendingApproval],
  );

  const setRememberApprovalForSession = useCallback((value: boolean, sessionId: string) => {
    patchSessionRuntime(sessionId, { rememberApprovalForSession: value });
  }, [patchSessionRuntime]);

  return {
    applyDesktopSyncState,
    submitDesktopApprovalDecision,
    approvalSheetRequest,
    setRememberApprovalForSession,
  };
}
