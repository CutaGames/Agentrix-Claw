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

export async function fetchOperationsContinuity(): Promise<OperationsContinuityState> {
  return apiFetch('/operations/continuity');
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