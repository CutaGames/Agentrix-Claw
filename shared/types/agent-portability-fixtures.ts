import {
  AGENT_PORTABILITY_SCHEMA_VERSION,
  createPortableItemEnvelopeV1,
  sealSovereignAgentPackageV1,
  type ImportedAgentSourceV1,
  type PortabilityRecordRefV1,
  type SovereignAgentPackageV1,
  type UnsealedSovereignAgentPackageV1,
} from './agent-portability';

const TENANT_REF = 'tenant_fixture_agent_portability_0001';
const OWNER_REF = 'principal_fixture_owner_0001';
const SOURCE_ID = 'source_openclaw_fixture_0001';
const T0 = '2026-03-01T00:00:00.000Z';
const T1 = '2026-03-01T00:05:00.000Z';

function ref(
  kind: PortabilityRecordRefV1['kind'],
  id: string,
): PortabilityRecordRefV1 {
  return { kind, id, tenantRef: TENANT_REF };
}

export const IMPORTED_AGENT_SOURCE_FIXTURE_V1: ImportedAgentSourceV1 = {
  schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
  sourceId: SOURCE_ID,
  tenantRef: TENANT_REF,
  provider: 'openclaw',
  sourceType: 'user_archive',
  externalObjectRefs: [
    {
      namespace: 'openclaw.fixture',
      objectType: 'agent_instance',
      id: 'atlas-fixture-instance',
      version: '0.9.0-fixture',
    },
  ],
  adapter: {
    id: 'agentrix.openclaw.fixture',
    version: '1.0.0',
  },
  capabilityManifest: {
    schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
    overall: 'partial',
    verifiedAt: T0,
    entries: [
      {
        category: 'persona',
        availability: 'available',
        reasonCodes: ['supported'],
      },
      {
        category: 'preference',
        availability: 'available',
        reasonCodes: ['supported'],
      },
      {
        category: 'conversation_summary',
        availability: 'partial',
        reasonCodes: ['summary_only'],
        maxItems: 200,
      },
      {
        category: 'skill',
        availability: 'partial',
        reasonCodes: ['definition_only'],
      },
    ],
    limitations: ['full_conversation_unavailable', 'credentials_excluded'],
    extensionData: {
      'com.agentrix.fixture': { source: 'openclaw-v1-basic-conflict' },
    },
  },
  ownershipEvidenceRef: ref('source_evidence', 'ownership_fixture_0001'),
  consentEvidenceRef: ref('source_evidence', 'consent_fixture_0001'),
  acquiredAt: T0,
  status: 'partial',
  extensionData: {
    'com.agentrix.fixture': { deterministic: true },
  },
};

export const PERSONA_ITEM_FIXTURE_V1 = createPortableItemEnvelopeV1({
  schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
  itemId: 'item_persona_fixture_0001',
  itemType: 'persona',
  payload: {
    name: 'Atlas',
    personality: 'concise',
    instructions: 'Ask before every external side effect.',
  },
  sourceRefs: [ref('import_source', SOURCE_ID)],
  derivedFromRefs: [],
  capturedAt: T0,
  sourceSchemaVersion: 'openclaw/0.9-fixture',
  classification: 'imported',
  confidence: 1,
  lossiness: 'partial',
  sensitivity: 'owner',
  extensionData: {
    'com.agentrix.fixture': { category: 'config' },
  },
});

export const PREFERENCE_ITEM_FIXTURE_V1 = createPortableItemEnvelopeV1({
  schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
  itemId: 'item_preference_fixture_0001',
  itemType: 'preference',
  payload: {
    key: 'preferred_language',
    value: 'Chinese',
  },
  sourceRefs: [ref('import_source', SOURCE_ID)],
  derivedFromRefs: [],
  capturedAt: T0,
  sourceSchemaVersion: 'openclaw/0.9-fixture',
  classification: 'imported',
  confidence: 0.95,
  lossiness: 'lossless',
  sensitivity: 'private',
});

export const SKILL_ITEM_FIXTURE_V1 = createPortableItemEnvelopeV1({
  schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
  itemId: 'item_skill_fixture_0001',
  itemType: 'skill',
  payload: {
    name: 'Calendar Read',
    sourceKey: 'calendar.read',
    importedState: 'quarantined',
    requestedEnabled: false,
    credentialMode: 'reauthorization_required',
  },
  sourceRefs: [ref('import_source', SOURCE_ID)],
  derivedFromRefs: [],
  capturedAt: T0,
  sourceSchemaVersion: 'openclaw/0.9-fixture',
  classification: 'imported',
  confidence: 1,
  lossiness: 'partial',
  sensitivity: 'private',
});

const UNSEALED_PACKAGE_FIXTURE_V1: UnsealedSovereignAgentPackageV1 = {
  manifest: {
    schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
    packageId: 'package_agent_portability_fixture_0001',
    createdAt: T1,
    producer: {
      kind: 'agentrix',
      id: 'agentrix.fixture.builder',
      version: '1.0.0',
    },
    tenantRef: TENANT_REF,
    ownerPrincipalRef: OWNER_REF,
    extensionData: {
      'com.agentrix.fixture': { profile: 'openclaw-v1-basic-conflict' },
    },
  },
  sources: [IMPORTED_AGENT_SOURCE_FIXTURE_V1],
  identityClaims: [
    {
      schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
      claimId: 'claim_display_name_fixture_0001',
      sourceRef: ref('import_source', SOURCE_ID),
      claimType: 'display_name',
      value: 'Atlas',
      confidence: 1,
      assertedAt: T0,
    },
  ],
  items: [
    PERSONA_ITEM_FIXTURE_V1,
    PREFERENCE_ITEM_FIXTURE_V1,
    SKILL_ITEM_FIXTURE_V1,
  ],
  attachments: [],
  provenance: [
    {
      schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
      provenanceId: 'provenance_persona_fixture_0001',
      subjectRef: ref('portable_item', PERSONA_ITEM_FIXTURE_V1.itemId),
      sourceRef: ref('import_source', SOURCE_ID),
      event: 'normalized',
      recordedAt: T1,
      transformation: {
        id: 'openclaw.config.normalizer',
        version: '1.0.0',
      },
      evidenceRefs: [ref('raw_archive', 'archive_openclaw_fixture_0001')],
      classification: 'imported',
    },
    {
      schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
      provenanceId: 'provenance_preference_fixture_0001',
      subjectRef: ref('portable_item', PREFERENCE_ITEM_FIXTURE_V1.itemId),
      sourceRef: ref('import_source', SOURCE_ID),
      event: 'normalized',
      recordedAt: T1,
      transformation: {
        id: 'openclaw.memory.normalizer',
        version: '1.0.0',
      },
      evidenceRefs: [ref('raw_archive', 'archive_openclaw_fixture_0001')],
      classification: 'imported',
    },
    {
      schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
      provenanceId: 'provenance_skill_fixture_0001',
      subjectRef: ref('portable_item', SKILL_ITEM_FIXTURE_V1.itemId),
      sourceRef: ref('import_source', SOURCE_ID),
      event: 'normalized',
      recordedAt: T1,
      transformation: {
        id: 'openclaw.skill.normalizer',
        version: '1.0.0',
      },
      evidenceRefs: [ref('raw_archive', 'archive_openclaw_fixture_0001')],
      classification: 'imported',
    },
  ],
  consentEvidence: [
    {
      schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
      consentId: 'consent_fixture_0001',
      principalRef: OWNER_REF,
      sourceRef: ref('import_source', SOURCE_ID),
      categories: ['persona', 'preference', 'skill'],
      grantedAt: T0,
      evidenceRef: ref('source_evidence', 'consent_fixture_0001'),
      extensionData: {
        'com.agentrix.fixture': { interaction: 'explicit_category_selection' },
      },
    },
  ],
  extensionData: {
    'com.agentrix.fixture': {
      deterministic: true,
      expectedExecutableState: 'quarantined',
    },
  },
};

const SEALED_PACKAGE_FIXTURE_V1 = sealSovereignAgentPackageV1(
  UNSEALED_PACKAGE_FIXTURE_V1,
);

/**
 * Deterministic package golden vector. The digest proof is deliberately a
 * digest-only proof; it does not claim an external signature or Trust receipt.
 */
export const SOVEREIGN_AGENT_PACKAGE_FIXTURE_V1: SovereignAgentPackageV1 = {
  ...SEALED_PACKAGE_FIXTURE_V1,
  integrityProofs: [
    {
      schemaVersion: AGENT_PORTABILITY_SCHEMA_VERSION,
      kind: 'digest',
      payloadDigest: SEALED_PACKAGE_FIXTURE_V1.manifest.contentDigest,
      extensionData: {
        'com.agentrix.fixture': { proofClass: 'deterministic_golden' },
      },
    },
  ],
};

export const AGENT_PORTABILITY_FIXTURE_TENANT_REF = TENANT_REF;
export const AGENT_PORTABILITY_FIXTURE_SOURCE_ID = SOURCE_ID;
