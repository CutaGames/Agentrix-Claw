/**
 * Memory Slot API — 移动端记忆槽位管理
 * P1: 记忆读写 / 召回 / flush
 */
import { apiFetch } from './api';

export type MemoryScope = 'session' | 'agent' | 'user' | 'shared';
export type MemoryType = 'state' | 'preference' | 'context' | 'conversation' | 'knowledge';

export interface MemoryEntry {
  id: string;
  userId: string;
  sessionId?: string;
  agentId?: string;
  key: string;
  value: any;
  scope: MemoryScope;
  type: MemoryType;
  metadata?: {
    importance?: number;
    tags?: string[];
    expiresAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RecallOptions {
  agentId?: string;
  sessionId?: string;
  limit?: number;
  scopes?: MemoryScope[];
  types?: MemoryType[];
  tags?: string[];
  since?: string;
}

export async function readMemorySlot(key: string, scope?: MemoryScope): Promise<MemoryEntry | null> {
  const query = scope ? `?scope=${scope}` : '';
  return apiFetch<MemoryEntry | null>(`/memory-slots/${encodeURIComponent(key)}${query}`);
}

export async function writeMemorySlot(params: {
  key: string;
  value: any;
  scope: MemoryScope;
  type: MemoryType;
  importance?: number;
  tags?: string[];
  sessionId?: string;
  agentId?: string;
}): Promise<MemoryEntry> {
  return apiFetch<MemoryEntry>('/memory-slots', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function deleteMemorySlot(key: string, scope?: MemoryScope): Promise<{ deleted: boolean }> {
  const query = scope ? `?scope=${scope}` : '';
  return apiFetch<{ deleted: boolean }>(`/memory-slots/${encodeURIComponent(key)}${query}`, {
    method: 'DELETE',
  });
}

export async function recallMemories(options: RecallOptions): Promise<MemoryEntry[]> {
  return apiFetch<MemoryEntry[]>('/memory-slots/recall', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function flushMemory(sessionId: string, agentId?: string): Promise<{ flushed: number }> {
  return apiFetch<{ flushed: number }>('/memory-slots/flush', {
    method: 'POST',
    body: JSON.stringify({ sessionId, agentId }),
  });
}
