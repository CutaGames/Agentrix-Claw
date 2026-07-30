/**
 * P1-04 · Release provenance v2 and compatibility gate contract (R10).
 *
 * Additive over `shared/release/v1/release-manifest.schema.json`. Adds
 * per-component provenance (artifact/build-input digest, schema versions, flag
 * & migration digests, minimum compatible version, evidence scope). Pure RC
 * validation lives in `backend/src/modules/backend-core-observability/`.
 */

export const RELEASE_PROVENANCE_SCHEMA_VERSION = 2 as const;

/** Evidence scope levels; source-RC / artifact / deployment / production cannot infer each other (R10.8). */
export type EvidenceScopeV2 =
  | 'source-rc'
  | 'artifact'
  | 'deployment'
  | 'production-observation';

export type WorktreeStateV2 = 'clean' | 'dirty' | 'unknown';

export interface ComponentReleaseEvidenceV2 {
  name: string;
  required: boolean;
  sourceCommit: string;
  worktree: WorktreeStateV2;
  artifactSha256: string | 'unknown';
  buildInputDigest: string | 'unknown';
  schemaVersions: Record<string, number>;
  flagSnapshotDigest: string;
  migrationSetDigest: string;
  minimumCompatibleVersion: string;
  evidenceScope: EvidenceScopeV2;
}

export type ReleaseGateNameV2 =
  | 'backendTruthfulBuild'
  | 'sharedContractCompatibility'
  | 'chatPathParity'
  | 'migrationDryRun';

export type ReleaseGateStatusV2 = 'passed' | 'failed' | 'unknown';

export interface ReleaseGateResultV2 {
  gate: ReleaseGateNameV2;
  status: ReleaseGateStatusV2;
}

export interface ReleaseManifestV2 {
  schemaVersion: typeof RELEASE_PROVENANCE_SCHEMA_VERSION;
  releaseId: string;
  generatedAt: string;
  scope: string;
  /** Components that MUST be present; a missing required one invalidates the manifest (R10.1). */
  requiredComponents: string[];
  components: ComponentReleaseEvidenceV2[];
  gates: ReleaseGateResultV2[];
  /** `allow-dirty`/local mode → local-development evidence only (R10.7). */
  mode: 'release-candidate' | 'local-development';
}

export interface ReleaseValidationResultV2 {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_GATES: ReleaseGateNameV2[] = [
  'backendTruthfulBuild',
  'sharedContractCompatibility',
  'chatPathParity',
  'migrationDryRun',
];

/**
 * Validate a release candidate manifest. Fails closed (R10.4/R10.6) when:
 * - a required component is missing;
 * - any in-scope component worktree is dirty or coverage/digest is unknown;
 * - an artifact/build-input digest is unknown/missing;
 * - any required gate is unknown or failed.
 *
 * `local-development` mode is never valid as an RC (R10.7).
 */
export function validateReleaseManifestV2(
  manifest: ReleaseManifestV2,
): ReleaseValidationResultV2 {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (manifest.schemaVersion !== RELEASE_PROVENANCE_SCHEMA_VERSION) {
    errors.push('unsupported release manifest schema version');
  }

  const present = new Set(manifest.components.map((c) => c.name));
  for (const req of manifest.requiredComponents) {
    if (!present.has(req)) errors.push(`missing required component: ${req}`);
  }

  for (const c of manifest.components) {
    if (!c.required) continue;
    if (c.worktree === 'dirty') errors.push(`${c.name}: worktree dirty`);
    if (c.worktree === 'unknown') errors.push(`${c.name}: worktree state unknown`);
    if (c.artifactSha256 === 'unknown') errors.push(`${c.name}: artifact digest unknown`);
    if (c.buildInputDigest === 'unknown') errors.push(`${c.name}: build-input digest unknown`);
    // source SHA and artifact digest cannot substitute for each other (R10.3).
    if (c.evidenceScope === 'source-rc' && c.artifactSha256 !== 'unknown') {
      warnings.push(`${c.name}: source-rc scope carries an artifact digest; keep scopes distinct`);
    }
  }

  const gateStatus = new Map(manifest.gates.map((g) => [g.gate, g.status]));
  for (const g of REQUIRED_GATES) {
    const status = gateStatus.get(g);
    if (status === undefined || status === 'unknown') errors.push(`gate ${g}: unknown`);
    else if (status === 'failed') errors.push(`gate ${g}: failed`);
  }

  if (manifest.mode === 'local-development') {
    errors.push('local-development manifest is not release-eligible');
  }

  return { valid: errors.length === 0, errors, warnings };
}
