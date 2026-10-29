import { secureGetToken } from "./desktop";
import { API_BASE, apiFetch } from "./store";

export type WorkflowStepKind = "fetch" | "compose" | "send" | "sign" | "pay" | "invoke";
export type WorkflowCategory = "productivity" | "finance" | "social" | "wellness" | "devops" | "other";
export type WorkflowVisibility = "private" | "team" | "public";

export interface WorkflowStepInput {
  kind: WorkflowStepKind;
  description: string;
  agent_role?: string;
  params?: Record<string, unknown>;
}

export interface WorkflowTemplateCreateInput {
  name: string;
  description?: string;
  category?: WorkflowCategory;
  steps: WorkflowStepInput[];
  required_skills?: string[];
  visibility?: WorkflowVisibility;
}

export interface WorkflowStep extends WorkflowStepInput {
  id: string;
}

export interface WorkflowTemplate {
  id: string;
  authorUserId: string;
  name: string;
  description: string;
  category: WorkflowCategory;
  steps: WorkflowStep[];
  required_skills: string[];
  visibility: WorkflowVisibility;
  install_count: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowInstanceResult {
  step_id: string;
  status: string;
  result?: string;
}

export interface WorkflowInstance {
  id: string;
  templateId: string;
  userId: string;
  status: "queued" | "running" | "done" | "failed";
  currentStep: number;
  startedAt?: number;
  finishedAt?: number;
  results: WorkflowInstanceResult[];
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : null;

  if (!response.ok) {
    const message = typeof (payload as { message?: unknown } | null)?.message === "string"
      ? String((payload as { message: string }).message)
      : `${response.status} ${response.statusText}`.trim();
    throw new Error(message || "Workflow request failed.");
  }

  return payload as T;
}

async function workflowRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await secureGetToken();
  if (!token) {
    throw new Error("Desktop login required before running workflow templates.");
  }

  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await apiFetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  return readJson<T>(response);
}

export async function createWorkflowTemplate(input: WorkflowTemplateCreateInput) {
  return workflowRequest<WorkflowTemplate>("/v1/workflow/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function installWorkflowTemplate(templateId: string) {
  return workflowRequest<WorkflowInstance>(`/v1/workflow/templates/${encodeURIComponent(templateId)}/install`, {
    method: "POST",
  });
}

export async function getWorkflowInstance(instanceId: string) {
  return workflowRequest<WorkflowInstance>(`/v1/workflow/instances/${encodeURIComponent(instanceId)}`);
}