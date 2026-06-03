/**
 * ACP Bridge API — 移动端 Agent Client Protocol 桥接
 * P4: Session 管理 / Action 调用 / 跨 session 消息转发
 */
import { apiFetch } from './api';

export type AcpSessionStatus = 'active' | 'paused' | 'completed' | 'error' | 'killed';

export interface AcpSession {
  sessionId: string;
  agentId?: string;
  userId: string;
  status: AcpSessionStatus;
  createdAt: string;
  lastActivityAt: string;
  metadata?: Record<string, any>;
}

export interface AcpAction {
  name: string;
  description: string;
  operationId: string;
  url: string;
  parameters: Record<string, any>;
  pricing?: { model: string; priceUsd?: number };
}

export interface AcpSteerCommand {
  type: 'pause' | 'resume' | 'cancel' | 'redirect';
  targetSessionId?: string;
  reason?: string;
}

// ── Session Lifecycle ──────────────────────────────────────────

export async function createAcpSession(
  agentId?: string,
  metadata?: Record<string, any>,
): Promise<AcpSession> {
  return apiFetch<AcpSession>('/acp/sessions', {
    method: 'POST',
    body: JSON.stringify({ agentId, metadata }),
  });
}

export async function getAcpSession(sessionId: string): Promise<AcpSession> {
  return apiFetch<AcpSession>(`/acp/sessions/${sessionId}`);
}

export async function listAcpSessions(): Promise<AcpSession[]> {
  return apiFetch<AcpSession[]>('/acp/sessions');
}

export async function steerAcpSession(sessionId: string, command: AcpSteerCommand): Promise<AcpSession> {
  return apiFetch<AcpSession>(`/acp/sessions/${sessionId}/steer`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

export async function killAcpSession(sessionId: string, reason?: string): Promise<void> {
  return apiFetch<void>(`/acp/sessions/${sessionId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

// ── Reply Dispatch ─────────────────────────────────────────────

export async function replyDispatch(params: {
  fromSessionId: string;
  toSessionId: string;
  message: string;
  metadata?: Record<string, any>;
}): Promise<{ delivered: boolean; targetStatus: AcpSessionStatus }> {
  return apiFetch<{ delivered: boolean; targetStatus: AcpSessionStatus }>('/acp/dispatch', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Actions (Skills) ───────────────────────────────────────────

export async function listAcpActions(): Promise<AcpAction[]> {
  return apiFetch<AcpAction[]>('/acp/actions');
}

export async function invokeAcpAction(
  actionId: string,
  sessionId: string,
  parameters: Record<string, any>,
): Promise<{ success: boolean; sessionId: string; skillId: string; result: any }> {
  return apiFetch(`/acp/actions/${actionId}/invoke`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, parameters }),
  });
}

// ── MCP Mobile Proxy ───────────────────────────────────────────

export async function proxyMcpToolCall(
  serverIdOrName: string,
  toolName: string,
  args: Record<string, any>,
): Promise<{ result: any }> {
  return apiFetch<{ result: any }>('/mcp-servers/mobile-proxy/call', {
    method: 'POST',
    body: JSON.stringify({ serverIdOrName, toolName, args }),
  });
}
