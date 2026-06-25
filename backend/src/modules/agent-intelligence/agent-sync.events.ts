import { EventEmitter } from 'events';

// ── Agent Sync Event Types ──────────────────────────────────────────────────

export const AGENT_SYNC_EVENT = 'agent-sync:event';

export type AgentSyncEventType =
  | 'agent:chat_chunk'
  | 'agent:tool_call'
  | 'agent:plan_update'
  | 'agent:memory_update'
  | 'agent:session_update'
  | 'agent:approval_request'
  | 'agent:approval_response'
  | 'agent:subtask_update'
  | 'agent:team_update'
  | 'agent:context_usage';

export interface AgentSyncEventEnvelope {
  userId: string;
  event: AgentSyncEventType;
  sessionId: string;
  payload: unknown;
  sourceDeviceId?: string;
}

export const agentSyncEventBus = new EventEmitter();

export function emitAgentSyncEvent(
  userId: string,
  event: AgentSyncEventType,
  sessionId: string,
  payload: unknown,
  sourceDeviceId?: string,
) {
  agentSyncEventBus.emit(AGENT_SYNC_EVENT, {
    userId,
    event,
    sessionId,
    payload,
    sourceDeviceId,
  } satisfies AgentSyncEventEnvelope);
}
