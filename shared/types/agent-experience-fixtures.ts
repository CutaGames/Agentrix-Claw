/**
 * Local/test vectors for `agent-experience/v1`.
 *
 * These are contract fixtures, not production evidence. Importing this module
 * in a production process must call `refuseAgentExperienceFixtureInProduction`.
 */

import {
  AGENT_EXPERIENCE_CONTRACT_VERSION,
  AGENT_EXPERIENCE_FIXTURE_MARK,
  AGENT_EXPERIENCE_MODULE_IDS_V1,
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  refuseAgentExperienceFixtureInProduction,
  type AgentExperienceActivitySummaryProjectionV1,
  type AgentExperienceCapabilityV1,
  type AgentExperienceEntryV1,
  type AgentExperienceModuleIdV1,
  type AgentExperienceRouteV1,
  type AgentWorkspaceExperienceV1,
  type ExperienceActiveWorkV1,
  type ExperienceBlockerV1,
  type ExperiencePrimaryAgentV1,
  type ExperienceReadinessV1,
  type ExperienceStateV1,
} from './agent-experience';
import type {
  ContinuityJourneyProjectionV1,
  JourneyCapabilityIdV1,
  JourneyCapabilityV1,
} from './web-first-ai-continuity';

refuseAgentExperienceFixtureInProduction();

export const AGENT_EXPERIENCE_FIXTURE_AS_OF = '2026-08-19T00:00:00.000Z';
export const AGENT_EXPERIENCE_FIXTURE_OWNER = {
  audience: 'user' as const,
  principalRef: 'sha256:0a1b2c3d4e5f',
};
export const AGENT_EXPERIENCE_FIXTURE_AGENT_ID = '11111111-1111-4111-8111-111111111111';
export const AGENT_EXPERIENCE_FIXTURE_SOUL_CORE_ID = 'sc_0123456789abcdef0123456789abcdef';
export const AGENT_EXPERIENCE_FIXTURE_SELECTION_REF = 'primary-agent-selection:fixture-owner';
export const AGENT_EXPERIENCE_FIXTURE_SELECTION_EPOCH = '3';

export const AGENT_EXPERIENCE_OPEN_AGENT_ROUTE: AgentExperienceRouteV1 = {
  method: 'GET',
  path: '/v1/agent-experience/:agentAccountId',
  auth: 'bearer_user',
  writes: false,
  idempotencyKeyRequired: false,
  acceptedIsNotSuccess: false,
};

export const AGENT_EXPERIENCE_CREATE_AGENT_ROUTE: AgentExperienceRouteV1 = {
  method: 'POST',
  path: '/agent-accounts',
  auth: 'bearer_user',
  writes: true,
  idempotencyKeyRequired: true,
  idempotencyIn: 'body',
  acceptedIsNotSuccess: false,
};

export const AGENT_EXPERIENCE_SELECT_PRIMARY_ROUTE: AgentExperienceRouteV1 = {
  method: 'PUT',
  path: '/v1/identity-governance/primary-agent',
  auth: 'bearer_user',
  writes: true,
  idempotencyKeyRequired: true,
  idempotencyIn: 'body',
  acceptedIsNotSuccess: false,
};

export const AGENT_EXPERIENCE_RESUME_IMPORT_ROUTE: AgentExperienceRouteV1 = {
  method: 'GET',
  path: '/v1/agent-portability/import-jobs/:jobId',
  auth: 'bearer_user',
  writes: false,
  idempotencyKeyRequired: false,
  acceptedIsNotSuccess: false,
};

export const AGENT_EXPERIENCE_REVIEW_CONTEXT_ROUTE: AgentExperienceRouteV1 = {
  method: 'GET',
  path: '/v1/continuity/approved-context',
  auth: 'bearer_user',
  writes: false,
  idempotencyKeyRequired: false,
  acceptedIsNotSuccess: false,
};

export const AGENT_EXPERIENCE_START_GOAL_ROUTE: AgentExperienceRouteV1 = {
  method: 'POST',
  path: '/v1/soul-cores/:soulCoreId/actions',
  auth: 'bearer_user',
  writes: true,
  idempotencyKeyRequired: true,
  idempotencyIn: 'header',
  acceptedIsNotSuccess: false,
};

export const AGENT_EXPERIENCE_REVIEW_RECEIPT_ROUTE: AgentExperienceRouteV1 = {
  method: 'GET',
  path: '/v1/continuity/action-receipts',
  auth: 'bearer_user',
  writes: false,
  idempotencyKeyRequired: false,
  acceptedIsNotSuccess: false,
};

export const AGENT_EXPERIENCE_IMPORT_COMMIT_ROUTE: AgentExperienceRouteV1 = {
  method: 'POST',
  path: '/v1/agent-portability/import-jobs/:jobId/commit',
  auth: 'bearer_user',
  writes: true,
  idempotencyKeyRequired: true,
  idempotencyIn: 'header',
  acceptedIsNotSuccess: true,
  durableReadBackRoute: {
    method: 'GET',
    path: '/v1/agent-portability/import-jobs/:jobId/receipt',
  },
};

const NOT_IMPLEMENTED_BLOCKER: ExperienceBlockerV1 = {
  kind: 'not_implemented',
  ref: 'main-repo:experience-module',
  reasonCode: 'not_implemented_in_main_repo',
};

function journeyCapability(
  capabilityId: JourneyCapabilityIdV1,
  state: 'available' | 'not_implemented' = 'not_implemented',
): JourneyCapabilityV1 {
  if (state === 'available') {
    return {
      capabilityId,
      state: 'available',
      publicStatus: 'limited_preview',
      reasonCode: 'capability_available',
      provenance: {
        sourceOfTruth: `fixture:${capabilityId}`,
        asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
        freshness: 'live',
      },
      blockers: [],
      routes: [],
      writeAllowed: false,
    };
  }
  return {
    capabilityId,
    state: 'not_implemented',
    publicStatus: 'roadmap',
    reasonCode: 'not_implemented_in_main_repo',
    provenance: {
      sourceOfTruth: `fixture:${capabilityId}`,
      asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
      freshness: 'live',
    },
    blockers: [{
      kind: 'not_implemented',
      ref: `main-repo:${capabilityId}`,
      reasonCode: 'not_implemented_in_main_repo',
    }],
    routes: [],
    writeAllowed: false,
  };
}

export function buildFixtureJourney(options?: {
  stage?: ContinuityJourneyProjectionV1['stage'];
  nextStep?: ContinuityJourneyProjectionV1['nextStep'];
  agentAvailable?: boolean;
}): ContinuityJourneyProjectionV1 {
  const agentAvailable = options?.agentAvailable ?? true;
  const capabilities: Record<JourneyCapabilityIdV1, JourneyCapabilityV1> = {
    bring_import_generic_archive: journeyCapability('bring_import_generic_archive', 'available'),
    continue_agent_identity: journeyCapability(
      'continue_agent_identity',
      agentAvailable ? 'available' : 'not_implemented',
    ),
    continue_approved_context: journeyCapability('continue_approved_context', 'available'),
    connect_read_only_connector: journeyCapability('connect_read_only_connector'),
    context_gateway_disclosure: journeyCapability('context_gateway_disclosure'),
    act_first_low_risk_action: journeyCapability('act_first_low_risk_action'),
    verify_action_receipt: journeyCapability('verify_action_receipt', 'available'),
    control_data_and_connections: journeyCapability('control_data_and_connections'),
  };

  return {
    schemaVersion: 1,
    contractVersion: 'web-first-ai-continuity/v1',
    environment: 'test',
    asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
    consistency: 'per-capability-eventual',
    owner: AGENT_EXPERIENCE_FIXTURE_OWNER,
    agent: agentAvailable
      ? {
          state: 'available',
          asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
          source: 'primary_agent_selection_v1',
          data: {
            agentAccountId: AGENT_EXPERIENCE_FIXTURE_AGENT_ID,
            soulCoreId: AGENT_EXPERIENCE_FIXTURE_SOUL_CORE_ID,
            selectionRef: AGENT_EXPERIENCE_FIXTURE_SELECTION_REF,
            selectionEpoch: AGENT_EXPERIENCE_FIXTURE_SELECTION_EPOCH,
            resolvedFrom: 'primary_agent_selection_v1',
          },
        }
      : {
          state: 'not_configured',
          asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
          source: 'primary_agent_selection_v1',
        },
    stage: options?.stage ?? (agentAvailable ? 'agent_ready' : 'no_agent'),
    nextStep: options && Object.prototype.hasOwnProperty.call(options, 'nextStep')
      ? options.nextStep ?? null
      : (agentAvailable ? 'continue_review_context' : 'landing_choose_path'),
    capabilities,
    blockers: Object.values(capabilities).flatMap((capability) => capability.blockers),
    notImplemented: Object.values(capabilities)
      .filter((capability) => capability.state === 'not_implemented')
      .map((capability) => capability.capabilityId),
  };
}

export function buildFixtureCapability(
  moduleId: AgentExperienceModuleIdV1,
  state: ExperienceStateV1,
  routes: readonly AgentExperienceRouteV1[] = [],
): AgentExperienceCapabilityV1 {
  if (state === 'available') {
    return {
      moduleId,
      state: 'available',
      publicStatus: 'limited_preview',
      reasonCode: 'capability_available',
      provenance: {
        sourceOfTruth: `fixture:${moduleId}`,
        asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
        freshness: 'live',
      },
      freshness: 'live',
      routes,
      writeAllowed: routes.some((route) => route.writes),
      blocker: null,
      userSafeSummaryKey: `experience.${moduleId}.available`,
      summary: { itemCount: 0, awaitingOwnerCount: 0 },
    };
  }

  const reasonCode =
    state === 'unknown'
      ? 'source_outage'
      : state === 'blocked'
        ? 'feature_flag_disabled'
        : 'not_implemented_in_main_repo';
  const blocker: ExperienceBlockerV1 =
    state === 'unknown'
      ? { kind: 'source_outage', ref: `port:${moduleId}`, reasonCode: 'source_outage' }
      : state === 'blocked'
        ? { kind: 'flag', ref: `flag:${moduleId}`, reasonCode: 'feature_flag_disabled' }
        : NOT_IMPLEMENTED_BLOCKER;

  return {
    moduleId,
    state,
    publicStatus: state === 'blocked' ? 'poc' : 'roadmap',
    reasonCode,
    provenance: {
      sourceOfTruth: `fixture:${moduleId}`,
      asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
      freshness: state === 'unknown' ? 'unknown' : 'live',
    },
    freshness: state === 'unknown' ? 'unknown' : 'live',
    routes: [],
    writeAllowed: false,
    blocker,
    userSafeSummaryKey: `experience.${moduleId}.${state}`,
    summary: { itemCount: null, awaitingOwnerCount: null },
  };
}

function defaultModules(
  overrides: Partial<Record<AgentExperienceModuleIdV1, AgentExperienceCapabilityV1>> = {},
): Record<AgentExperienceModuleIdV1, AgentExperienceCapabilityV1> {
  const modules = {
    overview: buildFixtureCapability('overview', 'available', [AGENT_EXPERIENCE_OPEN_AGENT_ROUTE]),
    portability: buildFixtureCapability('portability', 'available', [
      AGENT_EXPERIENCE_RESUME_IMPORT_ROUTE,
      AGENT_EXPERIENCE_IMPORT_COMMIT_ROUTE,
    ]),
    connections: buildFixtureCapability('connections', 'not_implemented'),
    economy: buildFixtureCapability('economy', 'available', [AGENT_EXPERIENCE_START_GOAL_ROUTE]),
    activity: buildFixtureCapability('activity', 'available', [AGENT_EXPERIENCE_REVIEW_RECEIPT_ROUTE]),
    soul_core: buildFixtureCapability('soul_core', 'blocked'),
    machines: buildFixtureCapability('machines', 'not_implemented'),
  };
  return { ...modules, ...overrides };
}

function emptyActiveWork(): ExperienceActiveWorkV1 {
  return { state: 'available', items: [] };
}

function selectedPrimary(): ExperiencePrimaryAgentV1 {
  return {
    state: 'available',
    selectionRef: AGENT_EXPERIENCE_FIXTURE_SELECTION_REF,
    selectionEpoch: AGENT_EXPERIENCE_FIXTURE_SELECTION_EPOCH,
    agentAccountId: AGENT_EXPERIENCE_FIXTURE_AGENT_ID,
    soulCoreId: AGENT_EXPERIENCE_FIXTURE_SOUL_CORE_ID,
  };
}

function unresolvedPrimary(): ExperiencePrimaryAgentV1 {
  return {
    state: 'blocked',
    selectionRef: null,
    selectionEpoch: null,
    agentAccountId: null,
    soulCoreId: null,
  };
}

function completeReadiness(): ExperienceReadinessV1 {
  return {
    items: [
      { id: 'identity', state: 'met' },
      { id: 'primary', state: 'met' },
      { id: 'approved_context', state: 'met' },
      { id: 'first_goal', state: 'unmet' },
      { id: 'first_receipt', state: 'unmet' },
    ],
  };
}

export function buildGoldenAgentExperienceEntryV1(): AgentExperienceEntryV1 {
  const modules = defaultModules({
    overview: buildFixtureCapability('overview', 'available', [
      AGENT_EXPERIENCE_OPEN_AGENT_ROUTE,
      AGENT_EXPERIENCE_CREATE_AGENT_ROUTE,
    ]),
  });
  return {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    contractVersion: AGENT_EXPERIENCE_CONTRACT_VERSION,
    environment: 'test',
    asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
    owner: AGENT_EXPERIENCE_FIXTURE_OWNER,
    directory: {
      state: 'available',
      freshness: 'live',
      truncated: false,
      agents: [{
        agentAccountId: AGENT_EXPERIENCE_FIXTURE_AGENT_ID,
        displayNameKey: 'experience.directory.primary',
        status: 'active',
        isPrimary: true,
        soulCoreBound: true,
      }],
    },
    primaryAgent: selectedPrimary(),
    journey: buildFixtureJourney(),
    activeWork: emptyActiveWork(),
    recommendedAction: 'open_agent',
    recommendedRoute: AGENT_EXPERIENCE_OPEN_AGENT_ROUTE,
    modules,
    blockers: [modules.soul_core.blocker!, modules.connections.blocker!, modules.machines.blocker!],
    notImplemented: ['connections.connector_beta', 'machines.reference_device'],
  };
}

export function buildNoAgentExperienceEntryV1(): AgentExperienceEntryV1 {
  const modules = defaultModules({
    overview: buildFixtureCapability('overview', 'available', [AGENT_EXPERIENCE_CREATE_AGENT_ROUTE]),
    portability: buildFixtureCapability('portability', 'blocked'),
    economy: buildFixtureCapability('economy', 'blocked'),
    activity: buildFixtureCapability('activity', 'blocked'),
  });
  return {
    ...buildGoldenAgentExperienceEntryV1(),
    directory: { state: 'available', freshness: 'live', truncated: false, agents: [] },
    primaryAgent: unresolvedPrimary(),
    journey: buildFixtureJourney({
      stage: 'no_agent',
      nextStep: 'landing_choose_path',
      agentAvailable: false,
    }),
    recommendedAction: 'create_agent',
    recommendedRoute: AGENT_EXPERIENCE_CREATE_AGENT_ROUTE,
    modules,
    blockers: Object.values(modules)
      .map((module) => module.blocker)
      .filter((blocker): blocker is ExperienceBlockerV1 => blocker !== null),
  };
}

export function buildSelectPrimaryExperienceEntryV1(): AgentExperienceEntryV1 {
  const modules = defaultModules({
    overview: buildFixtureCapability('overview', 'available', [AGENT_EXPERIENCE_SELECT_PRIMARY_ROUTE]),
  });
  return {
    ...buildGoldenAgentExperienceEntryV1(),
    directory: {
      state: 'available',
      freshness: 'live',
      truncated: false,
      agents: [{
        agentAccountId: AGENT_EXPERIENCE_FIXTURE_AGENT_ID,
        displayNameKey: 'experience.directory.unselected',
        status: 'active',
        isPrimary: false,
        soulCoreBound: true,
      }],
    },
    primaryAgent: unresolvedPrimary(),
    journey: buildFixtureJourney({
      stage: 'no_agent',
      nextStep: 'continue_resolve_agent',
      agentAvailable: false,
    }),
    recommendedAction: 'select_primary_agent',
    recommendedRoute: AGENT_EXPERIENCE_SELECT_PRIMARY_ROUTE,
    modules,
  };
}

export function buildResumeImportExperienceEntryV1(): AgentExperienceEntryV1 {
  return {
    ...buildGoldenAgentExperienceEntryV1(),
    activeWork: {
      state: 'available',
      items: [{
        kind: 'import',
        workRef: 'import-job:fixture-opaque',
        agentAccountId: AGENT_EXPERIENCE_FIXTURE_AGENT_ID,
        coarseState: 'awaiting_owner',
        awaitingOwner: true,
      }],
    },
    recommendedAction: 'resume_import',
    recommendedRoute: AGENT_EXPERIENCE_RESUME_IMPORT_ROUTE,
  };
}

export function buildReviewContextExperienceEntryV1(): AgentExperienceEntryV1 {
  const modules = defaultModules({
    overview: buildFixtureCapability('overview', 'available', [
      AGENT_EXPERIENCE_OPEN_AGENT_ROUTE,
      AGENT_EXPERIENCE_REVIEW_CONTEXT_ROUTE,
    ]),
  });
  return {
    ...buildGoldenAgentExperienceEntryV1(),
    journey: buildFixtureJourney({
      stage: 'context_approved',
      nextStep: 'continue_review_context',
    }),
    recommendedAction: 'review_approved_context',
    recommendedRoute: AGENT_EXPERIENCE_REVIEW_CONTEXT_ROUTE,
    modules,
  };
}

export function buildStartGoalExperienceEntryV1(): AgentExperienceEntryV1 {
  return {
    ...buildGoldenAgentExperienceEntryV1(),
    recommendedAction: 'start_first_goal',
    recommendedRoute: AGENT_EXPERIENCE_START_GOAL_ROUTE,
  };
}

export function buildReviewReceiptExperienceEntryV1(): AgentExperienceEntryV1 {
  return {
    ...buildGoldenAgentExperienceEntryV1(),
    recommendedAction: 'review_receipt',
    recommendedRoute: AGENT_EXPERIENCE_REVIEW_RECEIPT_ROUTE,
  };
}

export function buildRetryExperienceEntryV1(): AgentExperienceEntryV1 {
  const modules = defaultModules({
    overview: buildFixtureCapability('overview', 'unknown'),
    portability: buildFixtureCapability('portability', 'unknown'),
    economy: buildFixtureCapability('economy', 'unknown'),
    activity: buildFixtureCapability('activity', 'unknown'),
  });
  return {
    ...buildGoldenAgentExperienceEntryV1(),
    directory: { state: 'unknown', freshness: 'unknown', truncated: false, agents: [] },
    primaryAgent: {
      state: 'unknown',
      selectionRef: null,
      selectionEpoch: null,
      agentAccountId: null,
      soulCoreId: null,
    },
    journey: buildFixtureJourney({
      stage: 'unknown',
      nextStep: null,
      agentAvailable: false,
    }),
    activeWork: { state: 'unknown', items: [] },
    recommendedAction: 'retry',
    recommendedRoute: null,
    modules,
    blockers: Object.values(modules)
      .map((module) => module.blocker)
      .filter((blocker): blocker is ExperienceBlockerV1 => blocker !== null),
  };
}

export function buildNoneExperienceEntryV1(): AgentExperienceEntryV1 {
  return {
    ...buildGoldenAgentExperienceEntryV1(),
    recommendedAction: 'none',
    recommendedRoute: null,
  };
}

export const AGENT_EXPERIENCE_ENTRY_STATE_FIXTURES: Record<ExperienceStateV1, AgentExperienceEntryV1> = {
  available: buildGoldenAgentExperienceEntryV1(),
  blocked: {
    ...buildGoldenAgentExperienceEntryV1(),
    modules: defaultModules({
      overview: buildFixtureCapability('overview', 'blocked'),
    }),
    recommendedAction: 'none',
    recommendedRoute: null,
  },
  not_implemented: {
    ...buildNoAgentExperienceEntryV1(),
    modules: {
      overview: buildFixtureCapability('overview', 'not_implemented'),
      portability: buildFixtureCapability('portability', 'not_implemented'),
      connections: buildFixtureCapability('connections', 'not_implemented'),
      economy: buildFixtureCapability('economy', 'not_implemented'),
      activity: buildFixtureCapability('activity', 'not_implemented'),
      soul_core: buildFixtureCapability('soul_core', 'not_implemented'),
      machines: buildFixtureCapability('machines', 'not_implemented'),
    },
    recommendedAction: 'none',
    recommendedRoute: null,
  },
  unknown: buildRetryExperienceEntryV1(),
};

export function buildGoldenAgentWorkspaceExperienceV1(): AgentWorkspaceExperienceV1 {
  const modules = defaultModules();
  return {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    contractVersion: AGENT_EXPERIENCE_CONTRACT_VERSION,
    environment: 'test',
    asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
    owner: AGENT_EXPERIENCE_FIXTURE_OWNER,
    agent: {
      agentAccountId: AGENT_EXPERIENCE_FIXTURE_AGENT_ID,
      soulCoreId: AGENT_EXPERIENCE_FIXTURE_SOUL_CORE_ID,
      displayNameKey: 'experience.agent.primary',
      status: 'active',
    },
    primaryState: 'primary',
    readiness: completeReadiness(),
    modules,
    recentActivitySummary: {
      state: 'available',
      importReceiptCount: 1,
      actionReceiptCount: 0,
      truncated: false,
    },
    recommendedAction: 'open_agent',
    recommendedRoute: AGENT_EXPERIENCE_OPEN_AGENT_ROUTE,
    blockers: Object.values(modules)
      .map((module) => module.blocker)
      .filter((blocker): blocker is ExperienceBlockerV1 => blocker !== null),
  };
}

export function buildGoldenActivitySummaryProjectionV1(): AgentExperienceActivitySummaryProjectionV1 {
  return {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    contractVersion: AGENT_EXPERIENCE_CONTRACT_VERSION,
    environment: 'test',
    asOf: AGENT_EXPERIENCE_FIXTURE_AS_OF,
    owner: AGENT_EXPERIENCE_FIXTURE_OWNER,
    agentAccountId: AGENT_EXPERIENCE_FIXTURE_AGENT_ID,
    activity: {
      state: 'available',
      importReceiptCount: 1,
      actionReceiptCount: 0,
      truncated: true,
    },
  };
}

export const AGENT_EXPERIENCE_CONTRACT_FIXTURE_CATALOG = {
  mark: AGENT_EXPERIENCE_FIXTURE_MARK,
  kind: 'local_contract_fixture' as const,
  entry: {
    golden: buildGoldenAgentExperienceEntryV1(),
    noAgent: buildNoAgentExperienceEntryV1(),
    selectPrimary: buildSelectPrimaryExperienceEntryV1(),
    resumeImport: buildResumeImportExperienceEntryV1(),
    reviewContext: buildReviewContextExperienceEntryV1(),
    startGoal: buildStartGoalExperienceEntryV1(),
    reviewReceipt: buildReviewReceiptExperienceEntryV1(),
    retry: buildRetryExperienceEntryV1(),
    none: buildNoneExperienceEntryV1(),
    states: AGENT_EXPERIENCE_ENTRY_STATE_FIXTURES,
  },
  workspace: buildGoldenAgentWorkspaceExperienceV1(),
  activitySummary: buildGoldenActivitySummaryProjectionV1(),
};

export function cloneExperienceFixture<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
