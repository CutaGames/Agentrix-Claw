/**
 * Sync Binding 合同 V1。
 *
 * Sync Binding 是 **数据移动关系**，不是 Runtime Binding，也不是 Context Gateway。
 * 本版本只绑定 Calendar Beta connection 为源：可记录 metadata snapshot 与 count diff。
 * apply 把最近一次 snapshot 记为已接受的同步事实，并写 durable receipt。
 * 不会覆盖 live Agent 偏好，也不会写入日程正文。
 */

export const AGENT_SYNC_BINDING_SCHEMA_VERSION = 1 as const;
export const AGENT_SYNC_BINDING_DOMAIN = 'agentrix.sync-binding.v1' as const;
export const AGENT_SYNC_BINDING_AUDIENCE = 'agentrix.sync-binding.v1' as const;

export const AGENT_SYNC_SOURCE_KINDS_V1 = ['google-calendar'] as const;
export type AgentSyncSourceKindV1 = (typeof AGENT_SYNC_SOURCE_KINDS_V1)[number];

export const AGENT_SYNC_BINDING_STATUSES_V1 = ['active', 'revoked'] as const;
export type AgentSyncBindingStatusV1 = (typeof AGENT_SYNC_BINDING_STATUSES_V1)[number];

export const AGENT_SYNC_DIFF_STATES_V1 = ['unchanged', 'count_changed', 'unknown'] as const;
export type AgentSyncDiffStateV1 = (typeof AGENT_SYNC_DIFF_STATES_V1)[number];

export interface AgentSyncBindingV1 {
  schemaVersion: typeof AGENT_SYNC_BINDING_SCHEMA_VERSION;
  domain: typeof AGENT_SYNC_BINDING_DOMAIN;
  bindingId: string;
  ownerBound: true;
  agentId: string;
  agentAccountId: string;
  sourceKind: AgentSyncSourceKindV1;
  sourceConnectionId: string;
  status: AgentSyncBindingStatusV1;
  lastSnapshotId: string | null;
  overwriteLiveAgent: false;
  apply: {
    state: 'available' | 'recorded' | 'blocked';
    reasonCode:
      | 'sync_binding_apply_available'
      | 'sync_binding_apply_recorded'
      | 'sync_binding_apply_requires_snapshot';
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentSyncSnapshotV1 {
  schemaVersion: typeof AGENT_SYNC_BINDING_SCHEMA_VERSION;
  snapshotId: string;
  bindingId: string;
  sourceKind: AgentSyncSourceKindV1;
  /** null = 源不可读，不是 0。 */
  eventCount: number | null;
  sourceFetchedAt: string | null;
  recordedAt: string;
}

export interface AgentSyncDiffV1 {
  schemaVersion: typeof AGENT_SYNC_BINDING_SCHEMA_VERSION;
  bindingId: string;
  state: AgentSyncDiffStateV1;
  previousSnapshotId: string | null;
  currentSnapshotId: string | null;
  previousCount: number | null;
  currentCount: number | null;
  applyAllowed: boolean;
}

export function isAgentSyncBindingV1(value: unknown): value is AgentSyncBindingV1 {
  if (value === null || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.schemaVersion === AGENT_SYNC_BINDING_SCHEMA_VERSION &&
    row.domain === AGENT_SYNC_BINDING_DOMAIN &&
    row.ownerBound === true &&
    row.overwriteLiveAgent === false &&
    typeof row.bindingId === 'string' &&
    typeof row.agentId === 'string' &&
    typeof row.agentAccountId === 'string' &&
    row.sourceKind === 'google-calendar' &&
    typeof row.sourceConnectionId === 'string' &&
    (AGENT_SYNC_BINDING_STATUSES_V1 as readonly string[]).includes(String(row.status)) &&
    (row.lastSnapshotId === null || typeof row.lastSnapshotId === 'string') &&
    typeof row.apply === 'object' &&
    row.apply !== null &&
    ['available', 'recorded', 'blocked'].includes(String((row.apply as { state?: unknown }).state))
  );
}

export function diffSyncCountsV1(
  previousCount: number | null,
  currentCount: number | null,
): AgentSyncDiffStateV1 {
  if (previousCount === null || currentCount === null) return 'unknown';
  return previousCount === currentCount ? 'unchanged' : 'count_changed';
}
