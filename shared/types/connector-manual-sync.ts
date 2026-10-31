/**
 * Connector Manual Sync 前置合同 V1。
 *
 * Wave 5 只报告「日历 connection 能否作为 sync source」。
 * snapshot / apply / overwrite 一律 not_implemented，避免被画成已上线的同步产品。
 * Wave 6 Sync Binding 才拥有数据移动关系。
 */

export const CONNECTOR_MANUAL_SYNC_SCHEMA_VERSION = 1 as const;
export const CONNECTOR_MANUAL_SYNC_DOMAIN = 'agentrix.connector.manual-sync.v1' as const;

export interface ConnectorManualSyncReadinessV1 {
  schemaVersion: typeof CONNECTOR_MANUAL_SYNC_SCHEMA_VERSION;
  domain: typeof CONNECTOR_MANUAL_SYNC_DOMAIN;
  ownerBound: true;
  agentId: string;
  agentAccountId: string;
  sourceKind: 'google-calendar';
  /** 存在未撤销的 Calendar Beta connection。不等于 snapshot 已就绪。 */
  sourceReady: boolean;
  connectionId: string | null;
  snapshot: {
    state: 'not_implemented';
    reasonCode: 'manual_sync_snapshot_not_implemented';
  };
  apply: {
    state: 'not_implemented';
    reasonCode: 'manual_sync_apply_not_implemented';
  };
  overwriteLiveAgent: false;
  nextCapability: 'sync_binding';
}

export function isConnectorManualSyncReadinessV1(
  value: unknown,
): value is ConnectorManualSyncReadinessV1 {
  if (value === null || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== CONNECTOR_MANUAL_SYNC_SCHEMA_VERSION) return false;
  if (row.domain !== CONNECTOR_MANUAL_SYNC_DOMAIN) return false;
  if (row.ownerBound !== true) return false;
  if (row.overwriteLiveAgent !== false) return false;
  if (row.nextCapability !== 'sync_binding') return false;
  if (row.sourceKind !== 'google-calendar') return false;
  if (typeof row.sourceReady !== 'boolean') return false;
  if (typeof row.agentId !== 'string' || row.agentId.trim().length === 0) return false;
  if (typeof row.agentAccountId !== 'string' || row.agentAccountId.trim().length === 0) {
    return false;
  }
  if (row.connectionId !== null && typeof row.connectionId !== 'string') return false;
  const snapshot = row.snapshot as { state?: unknown; reasonCode?: unknown } | undefined;
  const apply = row.apply as { state?: unknown; reasonCode?: unknown } | undefined;
  return (
    snapshot?.state === 'not_implemented' &&
    snapshot.reasonCode === 'manual_sync_snapshot_not_implemented' &&
    apply?.state === 'not_implemented' &&
    apply.reasonCode === 'manual_sync_apply_not_implemented'
  );
}
