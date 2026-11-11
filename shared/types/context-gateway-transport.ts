import type { ContextEnvironmentV1, ContextScopeV1 } from './context-projection';
import type { ContextDigestV1 } from './context-gateway-digest';

export type ContextTransportJsonValueV1 =
  | null
  | boolean
  | number
  | string
  | ContextTransportJsonValueV1[]
  | { [key: string]: ContextTransportJsonValueV1 };

export type ContextRelayClientKindV1 = 'browser' | 'native';

export interface ContextRelayReadRequestV1 {
  schemaVersion: 1;
  relayRequestId: string;
  runtimeBindingRef: string;
  runtimeId: string;
  runtimePrincipalRef: string;
  runtimeSessionRef: string;
  ownerRef: string;
  tenantRef: string;
  agentId: string;
  agentAccountId: string;
  soulCoreRef: string;
  environment: ContextEnvironmentV1;
  audience: string;
  scopes: ContextScopeV1[];
  projectionId: string;
  projectionDigest: ContextDigestV1;
  projectionEpoch: number;
  ownershipEpoch: string;
  policyEpoch: number;
  revocationEpoch: number;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  clientKind: ContextRelayClientKindV1;
  origin: string | null;
  maxResponseBytes: number;
  maxResponseTokens: number;
  requestDigest: ContextDigestV1;
}

export interface ContextRelayDeliveryV1 {
  schemaVersion: 1;
  relayRequestId: string;
  runtimeBindingRef: string;
  runtimePrincipalRef: string;
  runtimeSessionRef: string;
  ownerRef: string;
  tenantRef: string;
  agentId: string;
  agentAccountId: string;
  soulCoreRef: string;
  audience: string;
  scopes: ContextScopeV1[];
  projectionId: string;
  projectionDigest: ContextDigestV1;
  projectionEpoch: number;
  ownershipEpoch: string;
  policyEpoch: number;
  revocationEpoch: number;
  nonce: string;
  deliveredAt: string;
  expiresAt: string;
  provenance: {
    source: 'context_projection';
    grantsActionScope: false;
  };
  payload: ContextTransportJsonValueV1;
  responseDigest: ContextDigestV1;
}

export interface ContextMcpProjectionReadInvocationV1 {
  schemaVersion: 1;
  invocationId: string;
  toolName: 'context_projection_read';
  relayRequest: ContextRelayReadRequestV1;
  invocationDigest: ContextDigestV1;
}
