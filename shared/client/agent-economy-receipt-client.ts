/**
 * Shared, transport-agnostic canonical Agent Economy receipt reader.
 *
 * This client never composes a receipt locally. It validates the Backend's
 * owner-scoped read envelope and preserves `receipt: null` as an honest state.
 */
import {
  AGENT_ECONOMY_SCHEMA_VERSION,
  PAYMENT_SETTLEMENT_DISPOSITIONS_V1,
  REMEDY_DISPOSITIONS_V1,
  normalizeActionReceiptDispositionsV1,
  validateActionReceiptV1,
  validateCommissionAllocationViewV1,
  validateResponsibilityLineageV1,
  type AgentEconomyActionReceiptResultV1,
} from '../types/agent-economy';
import { verifyDigest, type DigestRef } from '../types/trust-loop-primitives';
import type { CreateAgentEconomyClientOptions } from './agent-economy-client';
import { requestJson, type ClientContextV1 } from './transport';

export interface AgentEconomyReceiptClientLike {
  getActionReceipt(
    soulCoreId: string,
    actionId: string,
  ): Promise<AgentEconomyActionReceiptResultV1>;
}

function objectValue(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${label}: expected object`);
  }
  return input as Record<string, unknown>;
}

function unwrapData(input: unknown): unknown {
  const envelope = objectValue(input, 'economyActionReceipt.response');
  if (
    envelope.success !== true
    || !Object.prototype.hasOwnProperty.call(envelope, 'data')
  ) {
    throw new Error('economyActionReceipt: invalid response envelope');
  }
  return envelope.data;
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0;
}

function hasValidPayloadDigest(
  input: unknown,
  field: 'integrity' | 'signature' = 'integrity',
): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  const integrity = record[field];
  if (!integrity || typeof integrity !== 'object' || Array.isArray(integrity)) return false;
  const payloadDigest = (integrity as Record<string, unknown>).payloadDigest;
  if (!payloadDigest || typeof payloadDigest !== 'object' || Array.isArray(payloadDigest)) {
    return false;
  }
  const material = { ...record };
  delete material[field];
  try {
    return verifyDigest(material, payloadDigest as DigestRef);
  } catch {
    return false;
  }
}

function sameDigest(left: unknown, right: unknown): boolean {
  if (!left || typeof left !== 'object' || Array.isArray(left)
    || !right || typeof right !== 'object' || Array.isArray(right)) {
    return false;
  }
  const leftDigest = left as Record<string, unknown>;
  const rightDigest = right as Record<string, unknown>;
  return leftDigest.algorithm === rightDigest.algorithm
    && leftDigest.canonicalization === rightDigest.canonicalization
    && leftDigest.value === rightDigest.value;
}

function sameBoundRef(left: unknown, right: unknown): boolean {
  if (!left || typeof left !== 'object' || Array.isArray(left)
    || !right || typeof right !== 'object' || Array.isArray(right)) {
    return false;
  }
  const leftRef = left as Record<string, unknown>;
  const rightRef = right as Record<string, unknown>;
  return leftRef.type === rightRef.type
    && leftRef.id === rightRef.id
    && (leftRef.version === undefined || rightRef.version === undefined
      || leftRef.version === rightRef.version)
    && sameDigest(leftRef.digest, rightRef.digest);
}

function decodeReceiptResult(
  input: unknown,
  expected: { soulCoreId: string; actionId: string },
): AgentEconomyActionReceiptResultV1 {
  const value = objectValue(unwrapData(input), 'economyActionReceipt');
  const dispositions = objectValue(
    value.dispositions,
    'economyActionReceipt.dispositions',
  );
  if (
    value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION
    || value.soulCoreId !== expected.soulCoreId
    || value.actionId !== expected.actionId
    || !isNonEmptyString(value.accountableAgentId)
    || !Object.prototype.hasOwnProperty.call(value, 'responsibilityLineage')
    || !Object.prototype.hasOwnProperty.call(value, 'commissionAllocation')
    || !Array.isArray(value.diagnostics)
    || !value.diagnostics.every(isNonEmptyString)
    || !(PAYMENT_SETTLEMENT_DISPOSITIONS_V1 as readonly unknown[]).includes(
      dispositions.paymentDisposition,
    )
    || !(PAYMENT_SETTLEMENT_DISPOSITIONS_V1 as readonly unknown[]).includes(
      dispositions.settlementDisposition,
    )
    || !(REMEDY_DISPOSITIONS_V1 as readonly unknown[]).includes(
      dispositions.remedyDisposition,
    )
  ) {
    throw new Error('economyActionReceipt: invalid response envelope');
  }

  const commission = value.commissionAllocation;
  if (commission !== null) {
    const validation = validateCommissionAllocationViewV1(commission);
    if (!validation.valid) {
      throw new Error(
        `economyActionReceipt.commissionAllocation: ${validation.errors.join('; ')}`,
      );
    }
    const typedCommission = commission as NonNullable<
      AgentEconomyActionReceiptResultV1['commissionAllocation']
    >;
    if (!hasValidPayloadDigest(typedCommission)) {
      throw new Error('economyActionReceipt.commissionAllocation: payload digest mismatch');
    }
    if (typedCommission.actionId !== expected.actionId) {
      throw new Error('economyActionReceipt.commissionAllocation: route binding mismatch');
    }
  } else if (!value.diagnostics.some((diagnostic) =>
    diagnostic.startsWith('commissionAllocation:'))) {
    throw new Error(
      'economyActionReceipt: null commission allocation requires diagnostics',
    );
  }

  const lineage = value.responsibilityLineage;
  if (lineage !== null) {
    const validation = validateResponsibilityLineageV1(lineage);
    if (!validation.valid) {
      throw new Error(
        `economyActionReceipt.responsibilityLineage: ${validation.errors.join('; ')}`,
      );
    }
    const typedLineage = lineage as NonNullable<
      AgentEconomyActionReceiptResultV1['responsibilityLineage']
    >;
    if (!hasValidPayloadDigest(typedLineage)) {
      throw new Error(
        'economyActionReceipt.responsibilityLineage: payload digest mismatch',
      );
    }
    if (
      typedLineage.actionId !== expected.actionId
      || typedLineage.accountableAgentId !== value.accountableAgentId
    ) {
      throw new Error(
        'economyActionReceipt.responsibilityLineage: route or Agent lineage mismatch',
      );
    }
  } else if (!value.diagnostics.some((diagnostic) =>
    diagnostic.startsWith('responsibilityLineage:'))) {
    throw new Error(
      'economyActionReceipt: null responsibility lineage requires diagnostics',
    );
  }

  if (value.receipt !== null) {
    const validation = validateActionReceiptV1(value.receipt);
    if (!validation.valid) {
      throw new Error(`economyActionReceipt.receipt: ${validation.errors.join('; ')}`);
    }
    const receipt = value.receipt as NonNullable<
      AgentEconomyActionReceiptResultV1['receipt']
    >;
    if (!hasValidPayloadDigest(receipt)) {
      throw new Error('economyActionReceipt.receipt: payload digest mismatch');
    }
    const typedLineage = lineage as AgentEconomyActionReceiptResultV1['responsibilityLineage'];
    if (
      receipt.actionId !== expected.actionId
      || receipt.accountableAgentId !== value.accountableAgentId
    ) {
      throw new Error('economyActionReceipt.receipt: route or Agent lineage mismatch');
    }
    if (
      typedLineage === null
      || !sameBoundRef(receipt.responsibilityLineageRef, {
        type: 'responsibility_lineage',
        id: typedLineage.responsibilityLineageId,
        digest: typedLineage.integrity.payloadDigest,
      })
      || !sameBoundRef(receipt.mandateRef, typedLineage.mandateRef)
    ) {
      throw new Error(
        'economyActionReceipt.receipt: responsibility or mandate lineage mismatch',
      );
    }
    const normalized = normalizeActionReceiptDispositionsV1(receipt);
    if (
      normalized.paymentDisposition !== dispositions.paymentDisposition
      || normalized.settlementDisposition !== dispositions.settlementDisposition
      || normalized.remedyDisposition !== dispositions.remedyDisposition
    ) {
      throw new Error('economyActionReceipt.receipt: disposition mismatch');
    }
  } else if (value.diagnostics.length === 0) {
    throw new Error('economyActionReceipt: null receipt requires diagnostics');
  }

  return value as unknown as AgentEconomyActionReceiptResultV1;
}

function workflowRoot(soulCoreId: string): string {
  return `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/economy`;
}

export function createAgentEconomyReceiptClient(
  options: CreateAgentEconomyClientOptions,
): AgentEconomyReceiptClientLike {
  const context: ClientContextV1 = {
    baseUrl: options.baseUrl,
    getAuthToken: options.getAuthToken,
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    defaultHeaders: options.defaultHeaders,
  };

  return {
    getActionReceipt: (soulCoreId, actionId) => requestJson(
      options.transport,
      context,
      {
        method: 'GET',
        path: `${workflowRoot(soulCoreId)}/actions/${encodeURIComponent(actionId)}/receipt`,
      },
      (input) => decodeReceiptResult(input, { soulCoreId, actionId }),
    ),
  };
}
