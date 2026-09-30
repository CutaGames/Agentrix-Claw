/** Unified observability contracts for WATU and protected legacy/risk surfaces. */
export const OBSERVABILITY_SCHEMA_VERSION = 1 as const;

export type TrafficClassV1 =
  | 'external-user'
  | 'team'
  | 'test'
  | 'bot'
  | 'unknown';

export type WatuEventNameV1 =
  | 'task.requested'
  | 'task.authorization.decided'
  | 'task.execution.started'
  | 'task.execution.completed'
  | 'task.settlement.completed'
  | 'task.refund.completed'
  | 'task.cost.recorded'
  | 'task.proof.issued'
  | 'watu.qualified';

export interface WatuEventV1 {
  schemaVersion: typeof OBSERVABILITY_SCHEMA_VERSION;
  eventId: string;
  eventName: WatuEventNameV1;
  idempotencyKey: string;
  occurredAt: string;
  environment: 'production' | 'staging' | 'development' | 'test' | 'unknown';
  trafficClass: TrafficClassV1;
  soulCoreId?: string;
  taskId?: string;
  proofId?: string;
  attributes?: Record<string, string | number | boolean | null>;
}

export interface UnknownTelemetryValueV1 {
  status: 'unknown';
  value: null;
  unknownReason: string;
}

export interface MeasuredTelemetryValueV1<T> {
  status: 'measured';
  value: T;
  source: string;
  observedAt: string;
}

export type TelemetryValueV1<T> = UnknownTelemetryValueV1 | MeasuredTelemetryValueV1<T>;

export type LegacyRiskDomainV1 =
  | 'rn-watch'
  | 'battle'
  | 'pvp'
  | 'dungeon'
  | 'legacy-route'
  | 'prediction'
  | 'lsm';

export type RuntimeSurfaceKindV1 =
  | 'route'
  | 'api'
  | 'websocket'
  | 'cron'
  | 'queue'
  | 'worker';

export interface LegacyRiskSurfaceObservationV1 {
  surfaceId: string;
  domain: LegacyRiskDomainV1;
  kind: RuntimeSurfaceKindV1;
  sourceRef: string;
  staticReferences: number;
  runtimeCalls: TelemetryValueV1<number>;
  authenticatedCalls: TelemetryValueV1<number>;
  businessWrites: TelemetryValueV1<number>;
  activeUsers: TelemetryValueV1<number>;
}

export interface ProtectedFinancialExposureV1 {
  domain: Extract<LegacyRiskDomainV1, 'battle' | 'pvp' | 'dungeon' | 'prediction' | 'lsm'>;
  currency: string;
  unsettledBalance: TelemetryValueV1<string>;
  openOrders: TelemetryValueV1<number>;
  openStakes: TelemetryValueV1<number>;
  pendingRefunds: TelemetryValueV1<number>;
  openDisputes: TelemetryValueV1<number>;
}

export interface LegacyRiskRetentionV1 {
  domain: LegacyRiskDomainV1;
  dataOwner: string;
  retentionPolicy: string;
  compatibilityOwner: string;
  retirementDecision: 'blocked' | 'observe' | 'retain-adapter' | 'eligible-for-review';
}

export interface LegacyRiskTelemetryReportV1 {
  schemaVersion: typeof OBSERVABILITY_SCHEMA_VERSION;
  reportId: string;
  environment: 'production' | 'staging' | 'unknown';
  window: {
    startsAt: string | null;
    endsAt: string | null;
    days: number | null;
    status: 'measured' | 'unknown';
    unknownReason?: string;
  };
  generatedAt: string;
  surfaces: LegacyRiskSurfaceObservationV1[];
  financialExposure: ProtectedFinancialExposureV1[];
  retention: LegacyRiskRetentionV1[];
  caveats: string[];
}
