/**
 * Soul Core Action Trust Loop v1.1 — OpenAPI 3.1 component builder (TL-01.1; R1).
 *
 * Dependency-free. Emits an OpenAPI 3.1 document (JSON Schema 2020-12 dialect)
 * describing the shared primitives and the nine contracts. Enum members are
 * pulled from the same `readonly` arrays the runtime validators use, so the
 * published schema can never drift from validation. Field-level data
 * classification and object write-authority are attached as `x-` vendor
 * extensions so external Verifier / RP SDKs (TL-06) inherit the governance.
 *
 * The logical paths mirror design.md §9; the request/response bodies reference
 * the component schemas frozen here.
 */

import {
  DATA_CLASSES,
  DIGEST_ALGORITHMS,
  ENFORCEMENT_EVIDENCE_STATES,
  EVIDENCE_KINDS,
  INTEGRITY_TYPES,
  PARTY_KINDS,
  TRUST_LOOP_SCHEMA_VERSION,
  TRUST_RECORD_TYPES,
} from './trust-loop-primitives';
import {
  ACTION_CONTEXT_LIFECYCLE_STATES,
  ASSERTION_CLASSES,
  CREDENTIAL_STATUSES,
  DISPUTE_STATES,
  EXECUTION_STATUSES,
  FEEDBACK_RIGHT_KINDS,
  FEEDBACK_RIGHT_STATES,
  INDEPENDENCE_CLASSES,
  REPUTATION_UNCERTAINTY_STATUSES,
  RISK_MODES,
  RISK_RECOMMENDATIONS,
  SETTLEMENT_STATUSES,
  TRUST_CONTRACT_NAMES,
  VERDICTS,
} from './trust-loop-contracts';
import type { TrustContractName } from './trust-loop-contracts';
import { DATA_CLASSIFICATION, WRITE_AUTHORITY_MATRIX } from './trust-loop-governance';

export type JsonSchema = Record<string, unknown>;

export interface OpenApiComponents {
  schemas: Record<string, JsonSchema>;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string };
  paths: Record<string, JsonSchema>;
  components: OpenApiComponents;
}

export const TRUST_LOOP_OPENAPI_VERSION = '3.1.0' as const;

const str = (extra: JsonSchema = {}): JsonSchema => ({ type: 'string', ...extra });
const int = (extra: JsonSchema = {}): JsonSchema => ({ type: 'integer', ...extra });
const boolean = (): JsonSchema => ({ type: 'boolean' });
const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (items: JsonSchema): JsonSchema => ({ type: 'array', items });
const enumStr = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: [...values] });
const timestamp = (): JsonSchema => ({ type: 'string', format: 'date-time' });

function object(
  properties: Record<string, JsonSchema>,
  required: string[],
  extra: JsonSchema = {},
): JsonSchema {
  return { type: 'object', additionalProperties: false, properties, required, ...extra };
}

// --- Primitive schemas ------------------------------------------------------

function primitiveSchemas(): Record<string, JsonSchema> {
  return {
    DataClass: enumStr(DATA_CLASSES),
    DigestRef: object(
      {
        algorithm: enumStr(DIGEST_ALGORITHMS),
        canonicalization: str({ description: 'Canonicalization scheme id, e.g. jcs/1' }),
        value: str({ pattern: '^[0-9a-f]+$', description: 'lower-case hex digest' }),
      },
      ['algorithm', 'canonicalization', 'value'],
    ),
    PartyRef: object(
      {
        kind: enumStr(PARTY_KINDS),
        id: str({ description: 'opaque, unguessable, globally stable id' }),
        did: str(),
        displayName: str(),
        affiliation: enumStr(['internal', 'external', 'unknown']),
      },
      ['kind', 'id'],
    ),
    RecordRef: object(
      {
        type: enumStr(TRUST_RECORD_TYPES),
        id: str(),
        version: int(),
        digest: ref('DigestRef'),
      },
      ['type', 'id'],
    ),
    Money: object(
      {
        amountMinor: str({ pattern: '^-?(0|[1-9][0-9]*)$', description: 'integer minor units as string' }),
        currency: str(),
        decimals: int({ minimum: 0 }),
      },
      ['amountMinor', 'currency', 'decimals'],
    ),
    SignedIntegrity: object(
      {
        type: enumStr(INTEGRITY_TYPES),
        payloadDigest: ref('DigestRef'),
        scheme: str(),
        signer: ref('PartyRef'),
        keyId: str(),
        signature: str(),
        signedAt: timestamp(),
      },
      ['type', 'payloadDigest'],
      { description: 'When type=signature, scheme/signer/keyId/signature/signedAt are required.' },
    ),
    EvidenceRef: object(
      {
        evidenceId: str(),
        kind: enumStr(EVIDENCE_KINDS),
        digest: ref('DigestRef'),
        locator: str({ description: 'authorization-gated locator; not a public URL for restricted data' }),
        issuer: ref('PartyRef'),
        dataClass: ref('DataClass'),
        createdAt: timestamp(),
      },
      ['evidenceId', 'kind', 'digest', 'dataClass', 'createdAt'],
    ),
    EnforcementLayerEvidence: object(
      {
        layer: enumStr(['software', 'onchain-4337', 'SE-tap', 'SE-resident']),
        state: enumStr(ENFORCEMENT_EVIDENCE_STATES),
        evidenceRef: ref('RecordRef'),
        note: str(),
      },
      ['layer', 'state'],
    ),
    PolicyCeiling: object(
      {
        maxCost: ref('Money'),
        maxSessionSeconds: int({ minimum: 0 }),
        allowlist: arrayOf(str()),
        requiredApprovals: int({ minimum: 0 }),
        note: str(),
      },
      [],
    ),
    AssertionValue: object(
      {
        value: str(),
        assertionClass: enumStr(ASSERTION_CLASSES),
        source: ref('PartyRef'),
        detail: str(),
      },
      ['value', 'assertionClass'],
    ),
  };
}

// --- Contract schemas -------------------------------------------------------

function contractSchemas(): Record<TrustContractName, JsonSchema> {
  const schemaVersion = enumStr([TRUST_LOOP_SCHEMA_VERSION]);
  return {
    ActionContextV1: object(
      {
        schemaVersion,
        contextId: str(),
        contextVersion: int({ minimum: 0 }),
        actionId: str(),
        taskId: str(),
        actor: ref('PartyRef'),
        agent: ref('PartyRef'),
        owner: ref('PartyRef'),
        intent: object(
          { type: str(), digest: ref('DigestRef'), summary: str() },
          ['type', 'digest'],
        ),
        capability: object(
          { tool: str(), operation: str(), scope: arrayOf(str()) },
          ['tool', 'operation', 'scope'],
        ),
        target: object(
          { resourceRef: str(), counterparty: ref('PartyRef'), environment: str() },
          ['environment'],
        ),
        economics: object(
          { quoteRef: str(), maxCost: ref('Money'), paymentAuthority: ref('PartyRef') },
          [],
        ),
        policy: object(
          { policyRef: str(), version: str(), ownerCeiling: ref('PolicyCeiling') },
          ['policyRef', 'version'],
        ),
        enforcementLayers: arrayOf(ref('EnforcementLayerEvidence')),
        riskMode: enumStr(RISK_MODES),
        privacyClass: ref('DataClass'),
        lifecycleState: enumStr(ACTION_CONTEXT_LIFECYCLE_STATES),
        validFrom: timestamp(),
        expiresAt: timestamp(),
        authorizedAt: timestamp(),
        authorizingAuthority: ref('PartyRef'),
        canonicalDigest: ref('DigestRef'),
        createdAt: timestamp(),
        integrity: ref('SignedIntegrity'),
      },
      [
        'schemaVersion', 'contextId', 'contextVersion', 'actionId', 'actor', 'agent', 'owner',
        'intent', 'capability', 'policy', 'enforcementLayers', 'riskMode', 'privacyClass',
        'lifecycleState', 'validFrom', 'canonicalDigest', 'createdAt', 'integrity',
      ],
    ),
    OutcomeRecordV1: object(
      {
        schemaVersion,
        outcomeId: str(),
        actionId: str(),
        taskId: str(),
        contextId: str(),
        contextDigest: ref('DigestRef'),
        executionStatus: enumStr(EXECUTION_STATUSES),
        businessOutcome: ref('AssertionValue'),
        expected: object(
          { maxCost: ref('Money'), deliverableSummary: str(), sourceRef: ref('RecordRef') },
          [],
        ),
        actual: object(
          {
            actualCost: ref('Money'),
            deliverableSummary: str(),
            effectSummary: str(),
            source: ref('PartyRef'),
          },
          ['source'],
        ),
        settlement: object(
          {
            status: enumStr(SETTLEMENT_STATUSES),
            quote: ref('Money'),
            authorized: ref('Money'),
            actualDebit: ref('Money'),
            refunded: ref('Money'),
            net: ref('Money'),
            paymentAuthority: ref('PartyRef'),
            settlementRefs: arrayOf(ref('RecordRef')),
            confirmedAt: timestamp(),
          },
          ['status', 'settlementRefs'],
        ),
        artifacts: arrayOf(ref('EvidenceRef')),
        producer: ref('PartyRef'),
        assertionClass: enumStr(ASSERTION_CLASSES),
        supersedesOutcomeId: str(),
        occurredAt: timestamp(),
        recordedAt: timestamp(),
        integrity: ref('SignedIntegrity'),
      },
      [
        'schemaVersion', 'outcomeId', 'actionId', 'contextId', 'contextDigest', 'executionStatus',
        'businessOutcome', 'settlement', 'artifacts', 'producer', 'assertionClass',
        'occurredAt', 'recordedAt', 'integrity',
      ],
    ),
    VerificationResultV1: object(
      {
        schemaVersion,
        verificationId: str(),
        subjectRefs: arrayOf(ref('RecordRef')),
        verifier: ref('PartyRef'),
        independenceClass: enumStr(INDEPENDENCE_CLASSES),
        method: object({ id: str(), version: str() }, ['id', 'version']),
        claims: arrayOf(
          object(
            {
              claimId: str(),
              statement: str(),
              scope: str(),
              result: enumStr(VERDICTS),
              canProve: str(),
              cannotProve: str(),
            },
            ['claimId', 'statement', 'scope', 'result'],
          ),
        ),
        evidenceRefs: arrayOf(ref('EvidenceRef')),
        verdict: enumStr(VERDICTS),
        reasonCodes: arrayOf(str()),
        issuedAt: timestamp(),
        expiresAt: timestamp(),
        supersedesVerificationId: str(),
        signature: ref('SignedIntegrity'),
      },
      [
        'schemaVersion', 'verificationId', 'subjectRefs', 'verifier', 'independenceClass',
        'method', 'claims', 'evidenceRefs', 'verdict', 'reasonCodes', 'issuedAt', 'signature',
      ],
    ),
    CredentialStatusV1: object(
      {
        schemaVersion,
        statusId: str(),
        credentialRef: ref('RecordRef'),
        status: enumStr(CREDENTIAL_STATUSES),
        statusVersion: int({ minimum: 0 }),
        effectiveAt: timestamp(),
        reasonCode: str(),
        authority: ref('PartyRef'),
        nextUpdateAt: timestamp(),
        integrity: ref('SignedIntegrity'),
      },
      [
        'schemaVersion', 'statusId', 'credentialRef', 'status', 'statusVersion',
        'effectiveAt', 'authority', 'integrity',
      ],
    ),
    DisputeCaseV1: object(
      {
        schemaVersion,
        disputeId: str(),
        contestedRefs: arrayOf(ref('RecordRef')),
        claimant: ref('PartyRef'),
        respondents: arrayOf(ref('PartyRef')),
        claims: arrayOf(
          object(
            { claimId: str(), statement: str(), contestedRef: ref('RecordRef') },
            ['claimId', 'statement', 'contestedRef'],
          ),
        ),
        evidenceRefs: arrayOf(ref('EvidenceRef')),
        requestedRemedies: arrayOf(
          object(
            { remedyId: str(), type: str(), amount: ref('Money'), description: str() },
            ['remedyId', 'type'],
          ),
        ),
        state: enumStr(DISPUTE_STATES),
        authority: ref('PartyRef'),
        sla: object(
          { openedAt: timestamp(), responseDueAt: timestamp(), resolutionDueAt: timestamp() },
          ['openedAt'],
        ),
        resolution: object({}, [], { additionalProperties: true }),
        privacyClass: ref('DataClass'),
        version: int({ minimum: 0 }),
        integrity: ref('SignedIntegrity'),
      },
      [
        'schemaVersion', 'disputeId', 'contestedRefs', 'claimant', 'respondents', 'claims',
        'evidenceRefs', 'requestedRemedies', 'state', 'sla', 'privacyClass', 'version', 'integrity',
      ],
    ),
    ReputationCardV1: object(
      {
        schemaVersion,
        cardId: str(),
        subject: ref('PartyRef'),
        context: object({}, [], { additionalProperties: true }),
        window: object({ from: timestamp(), to: timestamp() }, ['from', 'to']),
        projector: object(
          { id: str(), version: str(), inputSetDigest: ref('DigestRef') },
          ['id', 'version', 'inputSetDigest'],
        ),
        dimensions: arrayOf(
          object(
            {
              dimension: str(),
              value: { type: ['number', 'null'] },
              unit: str(),
              confidence: { type: 'number' },
              sampleSize: int({ minimum: 0 }),
            },
            ['dimension', 'value', 'sampleSize'],
          ),
        ),
        sample: object(
          { total: int(), verified: int(), disputed: int(), remedied: int() },
          ['total', 'verified', 'disputed', 'remedied'],
        ),
        evidenceDistribution: { type: 'object', additionalProperties: { type: 'integer' } },
        uncertainty: object(
          { status: enumStr(REPUTATION_UNCERTAINTY_STATUSES), reasons: arrayOf(str()) },
          ['status', 'reasons'],
        ),
        explanation: arrayOf(
          object(
            {
              label: str(),
              direction: enumStr(['positive', 'negative', 'neutral']),
              sourceRef: ref('RecordRef'),
              weight: { type: 'number' },
            },
            ['label', 'direction', 'sourceRef'],
          ),
        ),
        sourceManifestRef: str(),
        generatedAt: timestamp(),
        integrity: ref('SignedIntegrity'),
      },
      [
        'schemaVersion', 'cardId', 'subject', 'context', 'window', 'projector', 'dimensions',
        'sample', 'evidenceDistribution', 'uncertainty', 'explanation', 'sourceManifestRef',
        'generatedAt', 'integrity',
      ],
    ),
    AssuranceProfileV1: object(
      {
        schemaVersion,
        profileId: str(),
        subject: ref('PartyRef'),
        identity: arrayOf(ref('AssuranceClaim')),
        execution: arrayOf(ref('AssuranceClaim')),
        enforcementLayers: arrayOf(ref('EnforcementLayerEvidence')),
        verificationIndependence: arrayOf(ref('AssuranceClaim')),
        hardware: arrayOf(ref('AssuranceClaim')),
        freshness: object(
          { evaluatedAt: timestamp(), expiresAt: timestamp(), staleRefs: arrayOf(ref('RecordRef')) },
          ['evaluatedAt', 'staleRefs'],
        ),
        evaluator: object({ id: str(), version: str() }, ['id', 'version']),
        generatedAt: timestamp(),
        integrity: ref('SignedIntegrity'),
      },
      [
        'schemaVersion', 'profileId', 'subject', 'identity', 'execution', 'enforcementLayers',
        'verificationIndependence', 'freshness', 'evaluator', 'generatedAt', 'integrity',
      ],
    ),
    RiskDecisionV1: object(
      {
        schemaVersion,
        decisionId: str(),
        actionId: str(),
        contextId: str(),
        mode: enumStr(RISK_MODES),
        engine: object({ id: str(), version: str() }, ['id', 'version']),
        inputSnapshotRefs: arrayOf(ref('RecordRef')),
        recommendation: enumStr(RISK_RECOMMENDATIONS),
        proposedEnforcement: object(
          { actions: arrayOf(str()), note: str() },
          ['actions'],
        ),
        ownerPolicyCeiling: ref('PolicyCeiling'),
        reasonCodes: arrayOf(str()),
        uncertainty: arrayOf(str()),
        actualAuthorityDecision: object({}, [], { additionalProperties: true }),
        expiresAt: timestamp(),
        createdAt: timestamp(),
        integrity: ref('SignedIntegrity'),
      },
      [
        'schemaVersion', 'decisionId', 'actionId', 'contextId', 'mode', 'engine',
        'inputSnapshotRefs', 'recommendation', 'ownerPolicyCeiling', 'reasonCodes',
        'createdAt', 'integrity',
      ],
    ),
    FeedbackRightV1: object(
      {
        schemaVersion,
        feedbackRightId: str(),
        subject: ref('PartyRef'),
        triggerRefs: arrayOf(ref('RecordRef')),
        rights: arrayOf(enumStr(FEEDBACK_RIGHT_KINDS)),
        deadline: timestamp(),
        channel: str(),
        state: enumStr(FEEDBACK_RIGHT_STATES),
        resultRefs: arrayOf(ref('RecordRef')),
        version: int({ minimum: 0 }),
        authority: ref('PartyRef'),
        createdAt: timestamp(),
        integrity: ref('SignedIntegrity'),
      },
      [
        'schemaVersion', 'feedbackRightId', 'subject', 'triggerRefs', 'rights', 'channel',
        'state', 'version', 'authority', 'createdAt', 'integrity',
      ],
    ),
  };
}

/** Build all component schemas (primitives + 9 contracts) with governance vendor extensions. */
export function buildTrustLoopSchemas(): Record<string, JsonSchema> {
  const schemas: Record<string, JsonSchema> = {
    ...primitiveSchemas(),
    AssuranceClaim: object(
      {
        claimId: str(),
        category: str(),
        state: enumStr(ENFORCEMENT_EVIDENCE_STATES),
        evidenceRef: ref('RecordRef'),
        note: str(),
        expiresAt: timestamp(),
      },
      ['claimId', 'category', 'state'],
    ),
  };
  const contracts = contractSchemas();
  for (const name of TRUST_CONTRACT_NAMES) {
    const schema = contracts[name];
    schema['x-data-classification-default'] = DATA_CLASSIFICATION[name].defaultClass;
    schema['x-field-data-classification'] = DATA_CLASSIFICATION[name].fields;
    schema['x-write-authority'] = WRITE_AUTHORITY_MATRIX[name].canonicalWriter;
    schema['x-write-forbidden'] = WRITE_AUTHORITY_MATRIX[name].forbidden;
    schemas[name] = schema;
  }
  return schemas;
}

/** Logical trust-loop paths from design §9 (bodies reference component schemas). */
function trustLoopPaths(): Record<string, JsonSchema> {
  const json = (schemaName: string): JsonSchema => ({
    content: { 'application/json': { schema: ref(schemaName) } },
  });
  return {
    '/trust-loop/v1/contexts': {
      post: {
        operationId: 'createActionContext',
        requestBody: json('ActionContextV1'),
        responses: { '201': { description: 'created', ...json('ActionContextV1') } },
      },
    },
    '/trust-loop/v1/outcomes': {
      post: {
        operationId: 'recordOutcome',
        requestBody: json('OutcomeRecordV1'),
        responses: { '201': { description: 'recorded', ...json('OutcomeRecordV1') } },
      },
    },
    '/trust-loop/v1/verifications': {
      post: {
        operationId: 'recordVerification',
        requestBody: json('VerificationResultV1'),
        responses: { '201': { description: 'recorded', ...json('VerificationResultV1') } },
      },
    },
    '/trust-loop/v1/credentials/{id}/status': {
      get: {
        operationId: 'getCredentialStatus',
        responses: { '200': { description: 'status', ...json('CredentialStatusV1') } },
      },
    },
    '/trust-loop/v1/disputes': {
      post: {
        operationId: 'openDispute',
        requestBody: json('DisputeCaseV1'),
        responses: { '201': { description: 'opened', ...json('DisputeCaseV1') } },
      },
    },
    '/trust-loop/v1/reputation/{subject}': {
      get: {
        operationId: 'getReputationCard',
        responses: { '200': { description: 'card', ...json('ReputationCardV1') } },
      },
    },
    '/trust-loop/v1/assurance/{subject}': {
      get: {
        operationId: 'getAssuranceProfile',
        responses: { '200': { description: 'profile', ...json('AssuranceProfileV1') } },
      },
    },
    '/trust-loop/v1/risk-decisions/{id}': {
      get: {
        operationId: 'getRiskDecision',
        responses: { '200': { description: 'decision', ...json('RiskDecisionV1') } },
      },
    },
    '/trust-loop/v1/feedback-rights/{id}/exercise': {
      post: {
        operationId: 'exerciseFeedbackRight',
        requestBody: json('FeedbackRightV1'),
        responses: { '200': { description: 'exercised', ...json('FeedbackRightV1') } },
      },
    },
  };
}

/** Build the full OpenAPI 3.1 document for the v1.1 contract baseline. */
export function buildTrustLoopOpenApiDocument(): OpenApiDocument {
  return {
    openapi: TRUST_LOOP_OPENAPI_VERSION,
    info: {
      title: 'Soul Core Action Trust Loop v1.1 Contracts',
      version: TRUST_LOOP_SCHEMA_VERSION,
      description:
        'Versioned, append-only, authority-scoped contracts for the Action → Outcome → ' +
        'Verification → Status/Dispute → Reputation → Risk/Authority → Feedback loop. ' +
        'Unknown schema/enum versions fail closed or degrade to unknown; they never map to a positive verdict.',
    },
    paths: trustLoopPaths(),
    components: { schemas: buildTrustLoopSchemas() },
  };
}
