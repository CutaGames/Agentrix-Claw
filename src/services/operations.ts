import { apiFetch } from './api';

export interface OperationsContinuityState {
  generatedAt: string;
  devices: Array<{ deviceId: string; platform: string; isOnline: boolean; lastSeenAt: string }>;
  sessions: Array<{
    sessionId: string;
    title: string;
    messageCount: number;
    deviceType: string;
    activeTaskCount: number;
    pendingApprovalCount: number;
    updatedAt: string;
  }>;
  activeTasks: Array<{ taskId: string; title: string; status: string; sessionId?: string; deviceId: string; updatedAt: string }>;
  pendingApprovals: Array<{ approvalId: string; taskId: string; title: string; riskLevel: string; deviceId: string; requestedAt: string }>;
  wearableSummary: {
    title: string;
    pendingApprovalCount: number;
    runningTaskCount: number;
    onlineDeviceCount: number;
    topItems: Array<Record<string, unknown>>;
  };
}

export interface OperationsOverviewState {
  generatedAt: string;
  status: 'pass' | 'active' | 'warn' | string;
  counts: {
    onlineDevices: number;
    pendingApprovals: number;
    runningLaneJobs: number;
    runningTasks: number;
    failedSignals: number;
    [key: string]: number;
  };
}

export interface OperationsTimelineItem {
  id: string;
  source: 'parallel-lane' | 'auto-repair' | 'desktop-task' | 'approval' | 'desktop-command' | string;
  title: string;
  detail?: string;
  status?: string;
  tone: 'info' | 'success' | 'warning' | 'error' | string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export async function fetchOperationsOverview(): Promise<OperationsOverviewState> {
  return apiFetch('/operations/overview');
}

export async function fetchOperationsContinuity(): Promise<OperationsContinuityState> {
  return apiFetch('/operations/continuity');
}

export async function fetchOperationsTimeline(limit = 30): Promise<{ generatedAt: string; items: OperationsTimelineItem[] }> {
  return apiFetch(`/operations/timeline?limit=${encodeURIComponent(String(limit))}`);
}

export async function requestOperationsFollowUp(payload: {
  sessionId: string;
  title?: string;
  targetDeviceId?: string;
  requesterDeviceId?: string;
  action?: 'resume-on-desktop' | 'summarize' | 'open-session';
}) {
  return apiFetch<{ ok: boolean; followUp: Record<string, unknown> }>('/operations/follow-up', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}