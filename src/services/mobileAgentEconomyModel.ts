import type { OpenClawInstance } from '../stores/authStore';
import type { SoulCoreRefV1 } from '../../shared/types/soul-core';
import type { ActionTaskV1 } from '../../shared/types/action-runtime';
import { resolveAgentDisplayName } from '../utils/agentDisplayName';
import {
  resolveMobileAgentContext,
  type MobileAgentContextResolution,
} from './mobileV6AgentContext';

export interface MobileAgentOption {
  agentId: string;
  soulCoreId?: string;
  instanceId?: string;
  displayName: string;
  runtimeStatus: OpenClawInstance['status'] | 'not_connected';
  canonicalMapping: 'ready' | 'missing';
}

export interface MobileAgentDirectoryModel {
  agents: MobileAgentOption[];
  selectedAgentId?: string;
  context: MobileAgentContextResolution;
}

function agentIdOf(instance?: OpenClawInstance): string | undefined {
  return instance?.agentAccountId ?? instance?.metadata?.agentAccountId;
}

/**
 * Join authenticated runtime projections with the canonical Soul Core directory.
 * A runtime instance alone never becomes a canonical Soul Core mapping.
 */
export function buildMobileAgentDirectoryModel(input: {
  refs: readonly SoulCoreRefV1[];
  instances?: readonly OpenClawInstance[];
  explicitAgentId?: string;
  selectedAgentId?: string;
  activeInstanceId?: string;
}): MobileAgentDirectoryModel {
  const instances = input.instances ?? [];
  const instanceByAgent = new Map<string, OpenClawInstance>();
  for (const instance of instances) {
    const agentId = agentIdOf(instance);
    if (agentId) instanceByAgent.set(agentId, instance);
  }

  const agents: MobileAgentOption[] = input.refs.map((ref) => {
    const instance = instanceByAgent.get(ref.agentAccountId);
    return {
      agentId: ref.agentAccountId,
      soulCoreId: ref.soulCoreId,
      instanceId: instance?.id,
      displayName: resolveAgentDisplayName(instance, `Agent ${ref.agentAccountId.slice(0, 8)}`),
      runtimeStatus: instance?.status ?? 'not_connected',
      canonicalMapping: 'ready',
    };
  });

  for (const instance of instances) {
    const agentId = agentIdOf(instance);
    if (!agentId || agents.some((agent) => agent.agentId === agentId)) continue;
    agents.push({
      agentId,
      instanceId: instance.id,
      displayName: resolveAgentDisplayName(instance, `Agent ${agentId.slice(0, 8)}`),
      runtimeStatus: instance.status,
      canonicalMapping: 'missing',
    });
  }

  const activeAgentId = agentIdOf(
    instances.find((instance) => instance.id === input.activeInstanceId) as OpenClawInstance,
  );
  const requestedAgentId = input.selectedAgentId ?? activeAgentId;
  const selected = requestedAgentId
    ? agents.find((agent) => agent.agentId === requestedAgentId)
    : undefined;
  const explicit = input.explicitAgentId
    ? agents.find((agent) => agent.agentId === input.explicitAgentId)
    : undefined;

  const context = resolveMobileAgentContext({
    explicitRoute: input.explicitAgentId === undefined
      ? undefined
      : {
          agentId: input.explicitAgentId,
          authorization: explicit?.canonicalMapping === 'ready' ? 'authorized' : 'unknown',
          freshness: explicit?.canonicalMapping === 'ready' ? 'fresh' : 'unknown',
        },
    userSelection: selected
      ? {
          agentId: selected.agentId,
          authorization: selected.canonicalMapping === 'ready' ? 'authorized' : 'unknown',
          freshness: selected.canonicalMapping === 'ready' ? 'fresh' : 'unknown',
        }
      : null,
    canonicalPrimaryCandidates: [],
    canonicalSoulCoreRefs: input.refs.map((ref) => ({
      agentId: ref.agentAccountId,
      soulCoreId: ref.soulCoreId,
      status: 'active',
    })),
  });

  return {
    agents,
    selectedAgentId: input.explicitAgentId === undefined ? selected?.agentId : explicit?.agentId,
    context,
  };
}

export interface MobileHardwareRequirementState {
  required: boolean;
  blocked: boolean;
  reason: 'not_required' | 'nfc_disabled' | 'attestation_unavailable' | 'ready';
}

export function evaluateMobileHardwareRequirement(
  layers: readonly string[],
  input: { nfcEnabled: boolean; attested: boolean },
): MobileHardwareRequirementState {
  const required = layers.some((layer) => layer === 'SE-tap' || layer === 'SE-resident');
  if (!required) return { required: false, blocked: false, reason: 'not_required' };
  if (!input.nfcEnabled) return { required: true, blocked: true, reason: 'nfc_disabled' };
  if (!input.attested) return { required: true, blocked: true, reason: 'attestation_unavailable' };
  return { required: true, blocked: false, reason: 'ready' };
}

export type ActionDimensionKey =
  | 'authorization'
  | 'execution'
  | 'settlement'
  | 'verification'
  | 'remedy';

export interface MobileActionDimension {
  key: ActionDimensionKey;
  label: string;
  state: string;
  tone: 'neutral' | 'progress' | 'success' | 'warning' | 'danger' | 'unknown';
  canonical: boolean;
}

function tone(state: string): MobileActionDimension['tone'] {
  if (['approved', 'succeeded', 'settled', 'issued', 'refunded'].includes(state)) return 'success';
  if (['pending', 'queued', 'running'].includes(state)) return 'progress';
  if (['denied', 'failed', 'cancelled', 'revoked', 'reversed', 'expired'].includes(state)) return 'danger';
  if (['not_started', 'not_required', 'not_eligible'].includes(state)) return 'neutral';
  return 'unknown';
}

export interface MobileActionReceiptAvailability {
  available: false;
  reason: 'canonical_action_receipt_unavailable';
}

/**
 * ActionTaskV1 is a lifecycle summary, not a canonical ActionReceipt. Execution
 * terminality alone can never upgrade this read model into a receipt.
 */
export function evaluateMobileActionReceiptAvailability(
  _task?: ActionTaskV1,
): MobileActionReceiptAvailability {
  return { available: false, reason: 'canonical_action_receipt_unavailable' };
}

/** Five independent user-facing dimensions; remedy is never inferred as success. */
export function actionDimensions(task: ActionTaskV1): MobileActionDimension[] {
  const lifecycle = task.lifecycle;
  return [
    { key: 'authorization', label: 'Authorization', state: lifecycle.authorization, tone: tone(lifecycle.authorization), canonical: true },
    { key: 'execution', label: 'Execution', state: lifecycle.execution, tone: tone(lifecycle.execution), canonical: true },
    { key: 'settlement', label: 'Settlement', state: lifecycle.settlement, tone: tone(lifecycle.settlement), canonical: true },
    // A proof lifecycle is not an independent verifier result.
    { key: 'verification', label: 'Verification', state: 'unavailable', tone: 'unknown', canonical: false },
    // Refund/reversal remains visible in Settlement; it is not promoted to a Remedy case.
    { key: 'remedy', label: 'Remedy', state: 'unavailable', tone: 'unknown', canonical: false },
  ];
}
