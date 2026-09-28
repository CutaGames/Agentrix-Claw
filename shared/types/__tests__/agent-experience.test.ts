import {
  AGENT_EXPERIENCE_CONTRACT_VERSION,
  AGENT_EXPERIENCE_MODULE_IDS_V1,
  AGENT_EXPERIENCE_PUBLIC_STATUS_CEILING_V1,
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  refuseAgentExperienceFixtureInProduction,
  validateAgentExperienceActivitySummaryProjectionV1,
  validateAgentExperienceEntryV1,
  validateAgentWorkspaceExperienceV1,
  validateExperienceCapabilityV1,
} from '../agent-experience';
import {
  AGENT_EXPERIENCE_CONTRACT_FIXTURE_CATALOG,
  AGENT_EXPERIENCE_ENTRY_STATE_FIXTURES,
  AGENT_EXPERIENCE_OPEN_AGENT_ROUTE,
  buildFixtureCapability,
  buildGoldenActivitySummaryProjectionV1,
  buildGoldenAgentExperienceEntryV1,
  buildGoldenAgentWorkspaceExperienceV1,
  buildNoAgentExperienceEntryV1,
  buildNoneExperienceEntryV1,
  buildResumeImportExperienceEntryV1,
  buildRetryExperienceEntryV1,
  buildReviewContextExperienceEntryV1,
  buildReviewReceiptExperienceEntryV1,
  buildSelectPrimaryExperienceEntryV1,
  buildStartGoalExperienceEntryV1,
  cloneExperienceFixture,
} from '../agent-experience-fixtures';

function codes(errors: { path: string; code: string }[]): string[] {
  return errors.map((error) => `${error.path}:${error.code}`);
}

describe('agent-experience/v1 contract', () => {
  describe('golden and recommended-action fixtures', () => {
    const builders = {
      golden: buildGoldenAgentExperienceEntryV1,
      noAgent: buildNoAgentExperienceEntryV1,
      selectPrimary: buildSelectPrimaryExperienceEntryV1,
      resumeImport: buildResumeImportExperienceEntryV1,
      reviewContext: buildReviewContextExperienceEntryV1,
      startGoal: buildStartGoalExperienceEntryV1,
      reviewReceipt: buildReviewReceiptExperienceEntryV1,
      retry: buildRetryExperienceEntryV1,
      none: buildNoneExperienceEntryV1,
    };

    it.each(Object.entries(builders))('%s entry validates', (_name, build) => {
      expect(validateAgentExperienceEntryV1(build())).toEqual([]);
    });

    it('workspace and activity-summary goldens validate', () => {
      expect(validateAgentWorkspaceExperienceV1(buildGoldenAgentWorkspaceExperienceV1())).toEqual([]);
      expect(
        validateAgentExperienceActivitySummaryProjectionV1(buildGoldenActivitySummaryProjectionV1()),
      ).toEqual([]);
    });

    it('catalog exposes every module id on the golden entry', () => {
      const golden = AGENT_EXPERIENCE_CONTRACT_FIXTURE_CATALOG.entry.golden;
      expect(golden.schemaVersion).toBe(AGENT_EXPERIENCE_SCHEMA_VERSION);
      expect(golden.contractVersion).toBe(AGENT_EXPERIENCE_CONTRACT_VERSION);
      expect(Object.keys(golden.modules).sort()).toEqual([...AGENT_EXPERIENCE_MODULE_IDS_V1].sort());
    });
  });

  describe('every capability state', () => {
    it.each(Object.entries(AGENT_EXPERIENCE_ENTRY_STATE_FIXTURES))(
      '%s fixture validates',
      (_state, fixture) => {
        expect(validateAgentExperienceEntryV1(fixture)).toEqual([]);
      },
    );

    it.each(['available', 'blocked', 'not_implemented', 'unknown'] as const)(
      'standalone %s capability validates',
      (state) => {
        const routes = state === 'available' ? [AGENT_EXPERIENCE_OPEN_AGENT_ROUTE] : [];
        expect(validateExperienceCapabilityV1(buildFixtureCapability('overview', state, routes))).toEqual([]);
      },
    );
  });

  describe('fail-closed invariants', () => {
    it('rejects an unknown schema or contract version', () => {
      const unknownSchema = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1()) as Record<string, unknown>;
      unknownSchema.schemaVersion = 2;
      expect(codes(validateAgentExperienceEntryV1(unknownSchema))).toContain('$.schemaVersion:invalid_value');

      const unknownContract = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1()) as Record<string, unknown>;
      unknownContract.contractVersion = 'agent-experience/v0';
      expect(codes(validateAgentExperienceEntryV1(unknownContract))).toContain('$.contractVersion:invalid_value');
    });

    it('rejects routes on a non-available module', () => {
      const fixture = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1());
      fixture.modules.connections = {
        ...fixture.modules.connections,
        routes: [AGENT_EXPERIENCE_OPEN_AGENT_ROUTE],
        writeAllowed: false,
      };
      expect(codes(validateAgentExperienceEntryV1(fixture))).toContain(
        '$.modules.connections.routes:invariant_violated',
      );
    });

    it('rejects writeAllowed that does not match published routes', () => {
      const fixture = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1());
      fixture.modules.overview = { ...fixture.modules.overview, writeAllowed: false };
      expect(codes(validateAgentExperienceEntryV1(fixture))).toContain(
        '$.modules.overview.writeAllowed:invariant_violated',
      );
    });

    it('rejects a recommendedRoute that is not on an available module', () => {
      const fixture = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1());
      fixture.recommendedRoute = {
        method: 'GET',
        path: '/v1/agent-experience/not-published',
        auth: 'bearer_user',
        writes: false,
        idempotencyKeyRequired: false,
        acceptedIsNotSuccess: false,
      };
      expect(codes(validateAgentExperienceEntryV1(fixture))).toContain(
        '$.recommendedRoute:invariant_violated',
      );
    });

    it('rejects none/retry with a recommendedRoute', () => {
      const none = cloneExperienceFixture(buildNoneExperienceEntryV1());
      none.recommendedRoute = AGENT_EXPERIENCE_OPEN_AGENT_ROUTE;
      expect(codes(validateAgentExperienceEntryV1(none))).toContain('$.recommendedRoute:invariant_violated');
    });

    it('rejects publicStatus above the v1 evidence ceiling', () => {
      expect(AGENT_EXPERIENCE_PUBLIC_STATUS_CEILING_V1).toBe('limited_preview');
      const fixture = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1());
      fixture.modules.overview = { ...fixture.modules.overview, publicStatus: 'ga' };
      expect(codes(validateAgentExperienceEntryV1(fixture))).toContain(
        '$.modules.overview.publicStatus:invariant_violated',
      );
    });

    it('rejects a raw owner id and a secret-bearing field', () => {
      const rawOwner = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1()) as Record<string, unknown>;
      rawOwner.ownerId = 'user-123';
      expect(codes(validateAgentExperienceEntryV1(rawOwner)).some((code) => code.includes('ownerId'))).toBe(true);

      const secret = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1()) as Record<string, unknown>;
      secret.accessToken = 'sk-thisisnotarealkeybutlongenough';
      expect(codes(validateAgentExperienceEntryV1(secret)).some((code) => code.includes('accessToken'))).toBe(true);
    });

    it('rejects an external URL path', () => {
      const fixture = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1());
      fixture.modules.overview = {
        ...fixture.modules.overview,
        routes: [{
          ...AGENT_EXPERIENCE_OPEN_AGENT_ROUTE,
          path: 'https://evil.example/v1/agent-experience',
        }],
      };
      expect(codes(validateAgentExperienceEntryV1(fixture))).toContain(
        '$.modules.overview.routes[0].path:invalid_value',
      );
    });

    it('rejects a duplicate route and a duplicate module key/id mismatch', () => {
      const fixture = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1());
      fixture.modules.overview = {
        ...fixture.modules.overview,
        routes: [AGENT_EXPERIENCE_OPEN_AGENT_ROUTE, AGENT_EXPERIENCE_OPEN_AGENT_ROUTE],
      };
      expect(codes(validateAgentExperienceEntryV1(fixture))).toContain(
        '$.modules.overview.routes[1]:invariant_violated',
      );

      fixture.modules.overview = {
        ...buildFixtureCapability('overview', 'available', [AGENT_EXPERIENCE_OPEN_AGENT_ROUTE]),
        moduleId: 'economy',
      };
      expect(codes(validateAgentExperienceEntryV1(fixture))).toContain(
        '$.modules.overview.moduleId:invariant_violated',
      );
    });

    it('rejects guessing Primary from the first directory row', () => {
      const fixture = cloneExperienceFixture(buildSelectPrimaryExperienceEntryV1());
      fixture.primaryAgent = {
        state: 'available',
        selectionRef: 'guessed',
        selectionEpoch: '1',
        agentAccountId: fixture.directory.agents[0].agentAccountId,
        soulCoreId: null,
      };
      const issues = codes(validateAgentExperienceEntryV1(fixture));
      expect(issues.some((code) => code.includes('directory') || code.includes('primaryAgent'))).toBe(true);
    });

    it('rejects a composite sovereignty score on readiness', () => {
      const workspace = cloneExperienceFixture(buildGoldenAgentWorkspaceExperienceV1()) as Record<string, unknown>;
      workspace.readiness = {
        ...(workspace.readiness as object),
        score: 87,
      };
      expect(codes(validateAgentWorkspaceExperienceV1(workspace))).toContain(
        '$.readiness:invariant_violated',
      );
    });

    it('rejects a malformed or tampered payload', () => {
      expect(validateAgentExperienceEntryV1(null)[0].code).toBe('invalid_type');
      expect(validateAgentExperienceEntryV1('tampered')[0].code).toBe('invalid_type');
      const missingModules = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1()) as Record<string, unknown>;
      delete missingModules.modules;
      expect(codes(validateAgentExperienceEntryV1(missingModules))).toContain('$.modules:missing');
    });

    it('requires durableReadBackRoute when acceptedIsNotSuccess is true', () => {
      const fixture = cloneExperienceFixture(buildGoldenAgentExperienceEntryV1());
      fixture.modules.portability = {
        ...fixture.modules.portability,
        routes: [{
          method: 'POST',
          path: '/v1/agent-portability/import-jobs/:jobId/commit',
          auth: 'bearer_user',
          writes: true,
          idempotencyKeyRequired: true,
          acceptedIsNotSuccess: true,
        }],
        writeAllowed: true,
      };
      expect(codes(validateAgentExperienceEntryV1(fixture))).toContain(
        '$.modules.portability.routes[0].durableReadBackRoute:invariant_violated',
      );
    });
  });

  describe('fixture production refusal', () => {
    it('allows local and test runtimes', () => {
      expect(() => refuseAgentExperienceFixtureInProduction('test')).not.toThrow();
      expect(() => refuseAgentExperienceFixtureInProduction('local')).not.toThrow();
    });

    it('throws in production so fixtures cannot become live evidence', () => {
      expect(() => refuseAgentExperienceFixtureInProduction('production')).toThrow(
        /forbidden outside local\/test/,
      );
    });
  });
});
