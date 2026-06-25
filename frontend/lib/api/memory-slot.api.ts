/**
 * Memory Slot API — P1 记忆槽位管理
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export type MemoryScope = 'session' | 'agent' | 'user' | 'shared'
export type MemoryType = 'state' | 'preference' | 'context' | 'conversation' | 'knowledge'

export interface MemoryEntry {
  id: string
  userId: string
  sessionId?: string
  agentId?: string
  key: string
  value: any
  scope: MemoryScope
  type: MemoryType
  metadata?: {
    importance?: number
    tags?: string[]
    expiresAt?: string
  }
  createdAt: string
  updatedAt: string
}

export interface RecallOptions {
  agentId?: string
  sessionId?: string
  limit?: number
  scopes?: MemoryScope[]
  types?: MemoryType[]
  tags?: string[]
  since?: string
}

class MemorySlotApi {
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

  async readSlot(key: string, scope?: MemoryScope): Promise<MemoryEntry | null> {
    const query = scope ? `?scope=${scope}` : ''
    return this.request<MemoryEntry | null>(`/memory-slots/${encodeURIComponent(key)}${query}`)
  }

  async writeSlot(params: {
    key: string
    value: any
    scope: MemoryScope
    type: MemoryType
    importance?: number
    tags?: string[]
    expiresAt?: string
    sessionId?: string
    agentId?: string
  }): Promise<MemoryEntry> {
    return this.request<MemoryEntry>('/memory-slots', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async deleteSlot(key: string, scope?: MemoryScope): Promise<{ deleted: boolean }> {
    const query = scope ? `?scope=${scope}` : ''
    return this.request<{ deleted: boolean }>(`/memory-slots/${encodeURIComponent(key)}${query}`, {
      method: 'DELETE',
    })
  }

  async recall(options: RecallOptions): Promise<MemoryEntry[]> {
    return this.request<MemoryEntry[]>('/memory-slots/recall', {
      method: 'POST',
      body: JSON.stringify(options),
    })
  }

  async flush(sessionId: string, agentId?: string): Promise<{ flushed: number }> {
    return this.request<{ flushed: number }>('/memory-slots/flush', {
      method: 'POST',
      body: JSON.stringify({ sessionId, agentId }),
    })
  }
}

export const memorySlotApi = new MemorySlotApi()
