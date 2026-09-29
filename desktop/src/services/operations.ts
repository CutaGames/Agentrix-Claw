import { API_BASE, apiFetch } from "./store";

export interface OperationsOverview {
  generatedAt: string;
  status: "pass" | "warn" | "active" | string;
  counts: {
    laneJobs: number;
    repairJobs: number;
    onlineDevices: number;
    pendingApprovals: number;
    runningLaneJobs: number;
    runningTasks: number;
    failedSignals: number;
  };
  toolPolicy: {
    status: "pass" | "warn" | "fail" | string;
    summary: {
      totalTools: number;
      duplicateNameCount: number;
      invalidNameCount: number;
      highRiskToolCount: number;
    };
    riskBands: Record<string, number>;
    recommendations: string[];
  };
}

export interface OperationsContinuity {
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
  wearableSummary: {
    title: string;
    pendingApprovalCount: number;
    runningTaskCount: number;
    onlineDeviceCount: number;
    topItems: Array<Record<string, unknown>>;
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? JSON.parse(text) as T : ({} as T);
}

export async function fetchOperationsOverview(token: string) {
  const response = await apiFetch(`${API_BASE}/operations/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<OperationsOverview>(response);
}

export async function fetchOperationsContinuity(token: string) {
  const response = await apiFetch(`${API_BASE}/operations/continuity`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<OperationsContinuity>(response);
}