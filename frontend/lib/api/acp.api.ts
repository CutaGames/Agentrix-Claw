/**
 * ACP Bridge API — P4 Agent Client Protocol 桥接
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export type AcpSessionStatus = 'active' | 'paused' | 'completed' | 'error' | 'killed'

export interface AcpSession {
  sessionId: string
  agentId?: string
  userId: string
  status: AcpSessionStatus
  createdAt: string
  lastActivityAt: string
  metadata?: Record<string, any>
}

export interface AcpAction {
  name: string
  description: string
  operationId: string
  url: string
  parameters: Record<string, any>
  pricing?: { model: string; priceUsd?: number }
}

export interface AcpSteerCommand {
  type: 'pause' | 'resume' | 'cancel' | 'redirect'
  targetSessionId?: string
  reason?: string
}

export interface AcpReplyDispatch {
  fromSessionId: string
  toSessionId: string
  message: string
  metadata?: Record<string, any>
}

class AcpBridgeApi {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('agentrix_token') : null

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
      credentials: 'include',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '请求失败' }))
      throw new Error(error.message || `HTTP ${response.status}`)
    }

    if (response.status === 204) return undefined as T
    return response.json()
  }

  // ── Session Lifecycle ──────────────────────────────────────────

  async createSession(agentId?: string, metadata?: Record<string, any>): Promise<AcpSession> {
    return this.request<AcpSession>('/acp/sessions', {
      method: 'POST',
      body: JSON.stringify({ agentId, metadata }),
    })
  }

  async getSession(sessionId: string): Promise<AcpSession> {
    return this.request<AcpSession>(`/acp/sessions/${sessionId}`)
  }

  async getSessionStatus(sessionId: string): Promise<{ status: AcpSessionStatus; lastActivityAt: string }> {
    return this.request<{ status: AcpSessionStatus; lastActivityAt: string }>(`/acp/sessions/${sessionId}/status`)
  }

  async steerSession(sessionId: string, command: AcpSteerCommand): Promise<AcpSession> {
    return this.request<AcpSession>(`/acp/sessions/${sessionId}/steer`, {
      method: 'POST',
      body: JSON.stringify(command),
    })
  }

  async killSession(sessionId: string, reason?: string): Promise<void> {
    return this.request<void>(`/acp/sessions/${sessionId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    })
  }

  async listSessions(): Promise<AcpSession[]> {
    return this.request<AcpSession[]>('/acp/sessions')
  }

  // ── Reply Dispatch ─────────────────────────────────────────────

  async replyDispatch(dispatch: AcpReplyDispatch): Promise<{ delivered: boolean; targetStatus: AcpSessionStatus }> {
    return this.request<{ delivered: boolean; targetStatus: AcpSessionStatus }>('/acp/dispatch', {
      method: 'POST',
      body: JSON.stringify(dispatch),
    })
  }

  // ── Actions (Skills) ───────────────────────────────────────────

  async listActions(): Promise<AcpAction[]> {
    return this.request<AcpAction[]>('/acp/actions')
  }

  async invokeAction(actionId: string, sessionId: string, parameters: Record<string, any>): Promise<{
    success: boolean
    sessionId: string
    skillId: string
    result: any
  }> {
    return this.request('/acp/actions/' + actionId + '/invoke', {
      method: 'POST',
      body: JSON.stringify({ sessionId, parameters }),
    })
  }
}

export const acpBridgeApi = new AcpBridgeApi()
